// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { ModelPickerContent } from "./ModelPickerContent";

// The external virtualizer needs browser layout; render its rows eagerly in this DOM test.
vi.mock("@legendapp/list/react", () => ({
  LegendList: ({
    data,
    renderItem,
  }: {
    data: string[];
    renderItem: (input: { item: string; index: number }) => ReactNode;
  }) => (
    <div>
      {data.map((item, index) => (
        <div key={item}>{renderItem({ item, index })}</div>
      ))}
    </div>
  ),
}));

it.each([
  { destinationDriver: "claudeAgent", unavailable: false, needsSummary: true },
  { destinationDriver: "claudeAgent", unavailable: true, needsSummary: false },
  { destinationDriver: "codex", unavailable: false, needsSummary: false },
])(
  "handles destination $destinationDriver (unavailable $unavailable) without changing an incompatible source session",
  async ({ destinationDriver, unavailable, needsSummary }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const entries = deriveProviderInstanceEntries(
      ["codex", destinationDriver].map((driver, index) => ({
        instanceId: ProviderInstanceId.make(index === 0 ? driver : `${driver}_destination`),
        driver: ProviderDriverKind.make(driver),
        displayName: index === 0 ? "Source" : "Destination",
        enabled: true,
        installed: true,
        status: "ready" as const,
        version: null,
        auth: { status: "authenticated" as const },
        checkedAt: "2026-10-01T00:00:00.000Z",
        models: [],
        slashCommands: [],
        skills: [],
      })),
    );
    const onSwitch = vi.fn();
    const onSummary = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <ModelPickerContent
            activeInstanceId={entries[0]!.instanceId}
            model="gpt-6-astra"
            lockedProvider={entries[0]!.driverKind}
            instanceEntries={entries}
            terminalOpen={false}
            modelOptionsByInstance={
              new Map([
                [entries[0]!.instanceId, [{ slug: "gpt-6-astra", name: "Astra" }]],
                [
                  entries[1]!.instanceId,
                  [{ slug: "claude-fable-5-1", name: "Fable", isUnavailable: unavailable }],
                ],
              ])
            }
            getModelDisabledReason={(instanceId) =>
              unavailable
                ? null
                : destinationDriver !== "codex" && instanceId === entries[1]!.instanceId
                  ? "Start a new thread"
                  : null
            }
            onInstanceModelChange={onSwitch}
            onStartThreadFromSummary={onSummary}
          />,
        ),
      );
      await act(async () =>
        getByRole(container, "button", { name: entries[1]!.displayName }).click(),
      );
      await act(async () => getByRole(container, "option", { name: /Fable/i }).click());
      if (needsSummary) {
        expect(onSwitch).not.toHaveBeenCalled();
        await act(async () =>
          getByRole(container, "button", { name: "Start a new thread from a summary" }).click(),
        );
        expect(onSummary).toHaveBeenCalledWith(entries[1]!.instanceId, "claude-fable-5-1");
      } else {
        expect(
          queryByRole(container, "button", { name: "Start a new thread from a summary" }),
        ).toBeNull();
        expect(onSummary).not.toHaveBeenCalled();
        if (unavailable) expect(onSwitch).not.toHaveBeenCalled();
        else expect(onSwitch).toHaveBeenCalledWith(entries[1]!.instanceId, "claude-fable-5-1");
      }
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
