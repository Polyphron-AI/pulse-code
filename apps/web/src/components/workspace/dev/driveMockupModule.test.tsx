// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole, fireEvent } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule, DriveSettingsFixture } from "./driveMockupModule";
import {
  createWorkspaceMockupSession,
  parseWorkspaceMockupRequest,
} from "./workspaceMockupFixtures";
import { driveMockupStates } from "./driveMockupData";

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
const mount = async (body: React.ReactNode) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  roots.push(root);
  await act(() => root.render(body));
  return node;
};
it.each(["01", "02", "03", "04"] as const)(
  "renders the actual explorer for %s with eight exact rows and no live queries",
  async (id) => {
    const session = createWorkspaceMockupSession(id);
    const module = createWorkspaceMockupModule(session);
    expect(module.readyRegions).toEqual(["resource"]);
    const node = await mount(module.resource);
    expect(getByRole(node, "region", { name: "Project Drive explorer" })).toBeTruthy();
    expect(
      Array.from(node.querySelectorAll("[data-drive-file-id]")).map((row) => row.textContent),
    ).toEqual(
      [
        "SEOO10 Oct",
        "MarketingLinked to project11 Oct",
        "Website12 Oct",
        "Products13 Oct",
        "Q4 marketing strategy12 Oct",
        "October content calendar11 Oct",
        "Brand guidelines10 Oct",
        "Website launch checklist9 Oct",
      ].map((value) => value.replace("SEOO", "SEO")),
    );
    expect(node.textContent).toContain(session.seed.sampleCopy.filesSharing);
    await act(() =>
      fireEvent.change(getByRole(node, "searchbox", { name: "Search in Drive" }), {
        target: { value: "strategy" },
      }),
    );
    await act(() => fireEvent.submit(node.querySelector("form")!));
    await module.settled();
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(1);
    expect(session.operations.some((op) => op.kind === "navigate")).toBe(true);
    expect(session.operations.some((op) => op.kind === "link" || op.kind === "save")).toBe(false);
    module.dispose();
    session.dispose();
  },
);
it.each(driveMockupStates.filter((state) => state.startsWith("drive-t")))(
  "admits and renders proposed state %s using the shared settings form",
  async (state) => {
    expect(
      parseWorkspaceMockupRequest(
        new URL(`http://fixture.invalid/workspace?fixture=04&space=projects&state=${state}`),
        true,
      ),
    ).toBe("04");
    const session = createWorkspaceMockupSession("04", null, null, null, state);
    const node = await mount(<DriveSettingsFixture session={session} />);
    if (state !== "drive-t1-21") expect(node.textContent).toContain("Project Drive folder");
    if (state === "drive-t2-2") {
      expect(
        getByRole(node, "combobox", { name: "Confirmed Drive link" }).getAttribute("aria-busy"),
      ).toBe("true");
      expect(node.textContent).toContain("Checking which linked items are folders...");
    }
    if (state === "drive-t2-retry")
      expect(getByRole(node, "button", { name: "Retry folder check" })).toBeTruthy();
    if (state === "drive-t2-6") {
      expect(node.textContent).toContain("This linked item is not a folder.");
      expect(
        session.operations.filter((op) => op.value?.startsWith("pulse.drive.getBindings")),
      ).toHaveLength(0);
      expect(
        session.operations.filter((op) => op.value?.startsWith("pulse.drive.getBinding:")),
      ).toHaveLength(1);
    }
    if (state === "drive-t2-7") {
      expect(
        session.operations.filter((op) => op.value === "pulse.drive.getBindings:200"),
      ).toHaveLength(1);
      expect(
        session.operations.filter((op) => op.value?.startsWith("pulse.drive.getBinding:")),
      ).toHaveLength(0);
    }
    if (state === "drive-t2-8") {
      await act(() => getByRole<HTMLButtonElement>(node, "button", { name: "Cancel" }).click());
      await act(() =>
        getByRole<HTMLButtonElement>(node, "button", { name: "Choose folder" }).click(),
      );
      expect(
        session.operations.filter((op) => op.value?.startsWith("pulse.drive.getBindings:")),
      ).toHaveLength(1);
      expect(node.textContent).not.toContain("Checking which linked items are folders...");
    }
    session.dispose();
  },
);
it.each([
  "drive-nested",
  "drive-grid",
  "drive-empty",
  "drive-error",
  "drive-incomplete",
  "drive-loading",
  "drive-filtered-empty",
] as const)("renders and exercises the explorer fixture %s", async (state) => {
  const session = createWorkspaceMockupSession("01", null, null, null, state);
  const module = createWorkspaceMockupModule(session);
  const node = await mount(module.resource);
  expect(module.readyRegions).toEqual(["resource"]);
  expect(getByRole(node, "region", { name: "Project Drive explorer" })).toBeTruthy();
  if (state === "drive-nested") {
    expect(node.textContent).toContain("This folder is empty.");
    await act(() =>
      getByRole<HTMLButtonElement>(node, "button", { name: "Back to SynKEK" }).click(),
    );
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(8);
  } else if (state === "drive-grid") {
    expect(getByRole(node, "button", { name: "Grid view" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const row = getByRole(node, "button", {
      name: "Open file Q4 marketing strategy",
    }).closest<HTMLElement>("[data-drive-file-id]")!;
    await act(() => getByRole<HTMLButtonElement>(row, "button", { name: /Open file/ }).click());
    expect(getByRole(row, "button", { name: /Open file/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await act(() => getByRole<HTMLButtonElement>(row, "button", { name: "Item actions" }).click());
    expect(getByRole(document.body, "button", { name: "Copy link" })).toBeTruthy();
  } else if (state === "drive-error") {
    expect(getByRole(node, "alert").textContent).toContain(
      "Google Drive did not allow this request.",
    );
    await act(() => getByRole<HTMLButtonElement>(node, "button", { name: "Retry files" }).click());
    expect(queryByRole(node, "alert")).toBeNull();
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(8);
  } else if (state === "drive-loading") {
    expect(getByRole(node, "status").textContent).toBe("Loading files...");
    expect(getByRole(node, "list", { name: "Drive files" }).getAttribute("aria-busy")).toBe("true");
    await act(() =>
      getByRole<HTMLButtonElement>(node, "button", { name: "Finish sample file load" }).click(),
    );
    expect(queryByRole(node, "status")).toBeNull();
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(8);
  } else {
    expect(node.textContent).toContain(
      state === "drive-incomplete"
        ? "Results may be incomplete. Refresh or open Google Drive."
        : state === "drive-filtered-empty"
          ? "No files match these filters."
          : "This folder is empty.",
    );
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(
      state === "drive-incomplete" ? 8 : 0,
    );
    if (state === "drive-filtered-empty") {
      await act(() =>
        getByRole<HTMLButtonElement>(node, "button", { name: "Clear filters" }).click(),
      );
      expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(8);
    }
  }
  await module.settled();
  expect(session.operations.some((op) => op.kind === "link" || op.kind === "save")).toBe(false);
  module.dispose();
  session.dispose();
});
it.each(["drive-paged", "drive-page-limit"] as const)(
  "advances the bounded sample page in %s",
  async (state) => {
    const session = createWorkspaceMockupSession("01", null, null, null, state);
    const module = createWorkspaceMockupModule(session);
    const node = await mount(module.resource);
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(
      state === "drive-paged" ? 4 : 200,
    );
    await act(() =>
      getByRole<HTMLButtonElement>(node, "button", {
        name: state === "drive-paged" ? "Load more" : "Next page",
      }).click(),
    );
    await module.settled();
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(
      state === "drive-paged" ? 8 : 20,
    );
    await act(() =>
      getByRole<HTMLButtonElement>(node, "button", { name: "Refresh files" }).click(),
    );
    await module.settled();
    expect(node.querySelectorAll("[data-drive-file-id]")).toHaveLength(
      state === "drive-paged" ? 4 : 200,
    );
    module.dispose();
    session.dispose();
  },
);
