import { EnvironmentId, ProjectId, WorkspaceLinkList } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import { captureWorkspacePage, findLinkedPages } from "./workspaceBrowser.logic";

const decodeLinkList = Schema.decodeUnknownSync(WorkspaceLinkList);
const isLinkList = Schema.is(WorkspaceLinkList);

it("captures URL, title, environment and target before navigation changes them", () => {
  const target = {
    ref: { type: "project" as const, projectId: ProjectId.make("selected-item-project") },
    title: "Captured target",
  };
  const captured = captureWorkspacePage({
    environmentId: EnvironmentId.make("remote-a"),
    target,
    desktop: true,
    address: "https://ignored.test/typed",
    navigation: {
      _tag: "Success",
      url: "https://example.test/final?utm_source=demo#heading",
      title: "Redirected page",
    },
  });
  target.title = "Changed selection label";
  target.ref.projectId = ProjectId.make("changed-project");
  expect(captured).toEqual({
    environmentId: "remote-a",
    target: {
      ref: { type: "project", projectId: "selected-item-project" },
      title: "Captured target",
    },
    page: { ref: { type: "url", url: "https://example.test/final" }, title: "Redirected page" },
  });
  expect(
    captureWorkspacePage({
      environmentId: EnvironmentId.make("remote-a"),
      target: null,
      desktop: false,
      address: "https://example.test/",
      navigation: undefined,
    }),
  ).toBeNull();
});

it("uses the entered web address as canonical metadata without observing external navigation", () => {
  expect(
    captureWorkspacePage({
      environmentId: EnvironmentId.make("remote-a"),
      target: { ref: { type: "project", projectId: ProjectId.make("p") } },
      desktop: false,
      address: " https://example.test/page?id=7&utm_source=x#intro ",
      navigation: { _tag: "Success", url: "https://ignored.test/", title: "Not observed" },
    })?.page,
  ).toEqual({
    ref: { type: "url", url: "https://example.test/page?id=7" },
    title: "https://example.test/page?id=7",
  });
});

it.each([
  undefined,
  { _tag: "Idle" as const },
  { _tag: "Loading" as const, url: "https://example.test/", title: "Loading" },
  {
    _tag: "LoadFailed" as const,
    url: "https://example.test/",
    title: "Failed",
    code: -1,
    description: "Unavailable",
  },
])("refuses to capture native navigation before Success: %j", (navigation) => {
  expect(
    captureWorkspacePage({
      environmentId: EnvironmentId.make("remote-a"),
      target: { ref: { type: "project", projectId: ProjectId.make("p") } },
      desktop: true,
      address: "https://example.test/",
      navigation,
    }),
  ).toBeNull();
});

it("bounds captured titles and refuses unsafe web addresses", () => {
  const input = {
    environmentId: EnvironmentId.make("remote-a"),
    target: { ref: { type: "project" as const, projectId: ProjectId.make("p") } },
    desktop: true,
    address: "",
    navigation: { _tag: "Success" as const, url: "https://example.test/", title: "x".repeat(301) },
  };
  expect(captureWorkspacePage(input)?.page.title).toHaveLength(300);
  expect(
    captureWorkspacePage({ ...input, desktop: false, address: "javascript:alert(1)" }),
  ).toBeNull();
});

it("searches confirmed direct pages and collapses canonical duplicates", () => {
  const makeView = (suffix: string, url: string, status: "confirmed" | "suggested") => ({
    id: `wl_00000000-0000-0000-0000-${suffix}`,
    item: { ref: { type: "url", url }, title: "Project handbook" },
    status,
    source: { type: "user" },
    updatedAt: "2026-10-13T09:00:00.000Z",
  });
  const list = decodeLinkList({
    linked: [
      makeView("000000000001", "https://example.test/handbook", "confirmed"),
      makeView("000000000002", "https://example.test/handbook?utm_source=x#intro", "confirmed"),
      makeView("000000000003", "https://suggested.test/handbook", "suggested"),
    ],
    suggested: [makeView("000000000004", "https://other.test/handbook", "suggested")],
    truncated: true,
  });
  expect(isLinkList(list)).toBe(true);
  expect(findLinkedPages(list, " HANDBOOK ")).toHaveLength(1);
  expect(findLinkedPages(list, "example.test")).toHaveLength(1);
  expect(findLinkedPages(list, "other.test")).toHaveLength(0);
  expect(findLinkedPages(list, "suggested.test")).toHaveLength(0);
  expect(findLinkedPages(list, "nothing matches")).toHaveLength(0);
  expect(findLinkedPages(null, "handbook")).toEqual([]);
});

it("returns at most fifty direct pages without consuming one-hop results", () => {
  const list = decodeLinkList({
    linked: Array.from({ length: 60 }, (_, index) => ({
      id: `wl_00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
      item: { ref: { type: "url", url: `https://example.test/page-${index}` } },
      status: "confirmed",
      source: { type: "user" },
      updatedAt: "2026-10-13T09:00:00.000Z",
    })),
    suggested: [],
    truncated: true,
    related: [{ item: { ref: { type: "url", url: "https://one-hop.test/" } } }],
  });
  expect(findLinkedPages(list, "")).toHaveLength(50);
  expect(findLinkedPages(list, "one-hop")).toEqual([]);
});
