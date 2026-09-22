import type { PulseMcpConnection } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../components/ui/dialog", () => {
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Dialog = ({ children, open }: { children?: ReactNode; open?: boolean }) => (
    <div data-open={open}>{children}</div>
  );
  return {
    Dialog,
    DialogDescription: Part,
    DialogFooter: Part,
    DialogHeader: Part,
    DialogPanel: Part,
    DialogPopup: Part,
    DialogTitle: Part,
  };
});

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { McpConnectionsPanel } from "./McpConnectionsPanel";

const connection: PulseMcpConnection = {
  id: "github",
  name: "GitHub",
  config: {
    transport: "http",
    url: "https://example.com/mcp",
    headers: { Authorization: { type: "secret", configured: true } },
  },
};

let renderer: ReactTestRenderer | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

function button(label: string) {
  return renderer!.root
    .findAllByType(Button)
    .find((candidate) => candidate.props.children?.includes?.(label));
}

describe("McpConnectionsPanel environment ownership", () => {
  it("drops a mutation completion after the environment changes", async () => {
    let finish!: () => void;
    const upsert = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const remove = vi.fn();
    await act(() => {
      renderer = create(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          upsert={upsert}
          remove={remove}
        />,
      );
    });
    await act(() => renderer!.root.findByProps({ "aria-label": "Edit GitHub" }).props.onClick());
    await act(() => button("Save connection")!.props.onClick());
    expect(upsert).toHaveBeenCalledWith("env-a", expect.objectContaining({ id: "github" }));

    await act(() => {
      renderer!.update(
        <McpConnectionsPanel
          environmentKey="env-b"
          connections={[]}
          wardenCredentials={null}
          upsert={upsert}
          remove={remove}
        />,
      );
    });
    await act(async () => finish());

    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Connection change failed");
  });

  it("clears an entered replacement secret when the environment changes", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn();
    await act(() => {
      renderer = create(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          upsert={upsert}
          remove={remove}
        />,
      );
    });
    await act(() => renderer!.root.findByProps({ "aria-label": "Edit GitHub" }).props.onClick());
    await act(() => button("Replace secret")!.props.onClick());
    const secretInput = renderer!.root
      .findAllByType(Input)
      .find((input) => input.props.type === "password")!;
    await act(() => secretInput.props.onChange({ target: { value: "new-token" } }));
    expect(
      renderer!.root.findAllByType(Input).some((input) => input.props.value === "new-token"),
    ).toBe(true);

    await act(() => {
      renderer!.update(
        <McpConnectionsPanel
          environmentKey="env-b"
          connections={[]}
          wardenCredentials={null}
          upsert={upsert}
          remove={remove}
        />,
      );
    });

    expect(
      renderer!.root.findAllByType(Input).some((input) => input.props.value === "new-token"),
    ).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("shows a failed save and keeps the editor open for correction", async () => {
    const upsert = vi.fn().mockRejectedValue(new Error("Could not save connection."));
    await act(() => {
      renderer = create(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          upsert={upsert}
          remove={vi.fn()}
        />,
      );
    });
    await act(() => renderer!.root.findByProps({ "aria-label": "Edit GitHub" }).props.onClick());
    await act(() => button("Save connection")!.props.onClick());
    expect(JSON.stringify(renderer!.toJSON())).toContain("Could not save connection.");
    expect(JSON.stringify(renderer!.toJSON())).toContain("Edit MCP connection");
  });

  it("rejects an add that reuses an existing connection ID", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    await act(() => {
      renderer = create(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          upsert={upsert}
          remove={vi.fn()}
        />,
      );
    });
    await act(() => button("Add connection")!.props.onClick());
    const editable = renderer!.root.findAllByType(Input).filter(({ props }) => !props.disabled);
    await act(() => {
      editable[0]!.props.onChange({ target: { value: "github" } });
      editable[1]!.props.onChange({ target: { value: "Duplicate" } });
      renderer!.root.findByProps({ placeholder: "https://example.com/mcp" }).props.onChange({
        target: { value: "https://duplicate.example/mcp" },
      });
    });
    await act(() => button("Save connection")!.props.onClick());

    expect(upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer!.toJSON())).toContain("already exists");
  });

  it("marks adds create-only and labels value kind selectors", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    await act(() => {
      renderer = create(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          upsert={upsert}
          remove={vi.fn()}
        />,
      );
    });
    await act(() => renderer!.root.findByProps({ "aria-label": "Edit GitHub" }).props.onClick());
    expect(renderer!.root.findByProps({ "aria-label": "Headers kind 1" })).toBeDefined();
    await act(() => button("Cancel")!.props.onClick());
    await act(() => button("Add connection")!.props.onClick());
    const editable = renderer!.root.findAllByType(Input).filter(({ props }) => !props.disabled);
    await act(() => {
      editable[0]!.props.onChange({ target: { value: "linear" } });
      editable[1]!.props.onChange({ target: { value: "Linear" } });
      renderer!.root.findByProps({ placeholder: "https://example.com/mcp" }).props.onChange({
        target: { value: "https://linear.example/mcp" },
      });
    });
    await act(() => button("Save connection")!.props.onClick());
    expect(upsert).toHaveBeenCalledWith(
      "env-a",
      expect.objectContaining({ id: "linear", createOnly: true }),
    );
  });

  it("gates Add when the environment lacks create-only support", async () => {
    await act(() => {
      renderer = create(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          canCreate={false}
          upsert={vi.fn()}
          remove={vi.fn()}
        />,
      );
    });
    expect(button("Add connection")!.props.disabled).toBe(true);
    expect(JSON.stringify(renderer!.toJSON())).toContain("Update this environment");
    expect(renderer!.root.findByProps({ "aria-label": "Edit GitHub" }).props.disabled).toBe(false);
  });

  it("closes an open Add dialog when create-only support is withdrawn", async () => {
    const upsert = vi.fn();
    await act(() => {
      renderer = create(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          canCreate
          upsert={upsert}
          remove={vi.fn()}
        />,
      );
    });
    await act(() => button("Add connection")!.props.onClick());
    expect(JSON.stringify(renderer!.toJSON())).toContain("Add MCP connection");
    await act(() => {
      renderer!.update(
        <McpConnectionsPanel
          environmentKey="env-a"
          connections={[connection]}
          wardenCredentials={null}
          canCreate={false}
          upsert={upsert}
          remove={vi.fn()}
        />,
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Add MCP connection");
    expect(renderer!.root.findAllByProps({ "data-open": false }).length).toBeGreaterThan(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
