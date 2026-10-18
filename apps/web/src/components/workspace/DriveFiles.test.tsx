import { act } from "react";
import * as Cause from "effect/Cause";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, type DriveReadResult } from "@t3tools/contracts";
import { DriveSearch, DriveFileAccess, DriveReader } from "./DriveFiles";
const mocks = vi.hoisted(() => ({
  capable: true,
  connected: true,
  search: vi.fn(),
  bind: vi.fn(),
  read: vi.fn(),
  query: vi.fn(),
  binding: "first" as string | undefined,
  generation: null as number | null,
  accountConnected: true,
  accountIdentity: "account-one",
  bindingFileId: "file",
  refreshBinding: vi.fn(),
  subscriptionError: null as string | null,
  refreshChanges: vi.fn(),
  operate: true,
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (mocks.connected ? ["remote", "other"] : []),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ driveRead: mocks.capable }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (input: unknown) => {
    mocks.query(input);
    if (input === "changes")
      return {
        data: mocks.generation,
        error: mocks.subscriptionError,
        refresh: mocks.refreshChanges,
      };
    if (input === "binding")
      return {
        data: {
          binding: mocks.binding
            ? { connectionId: mocks.binding, file: { id: mocks.bindingFileId } }
            : undefined,
        },
        error: null,
        refresh: mocks.refreshBinding,
      };
    return {
      data: [
        ...["first", "second"].map((id) => ({
          id,
          nickname: id,
          connected: mocks.accountConnected,
          identity: { id: mocks.accountIdentity, name: "Fixture" },
        })),
        {
          id: "drv_00000000-0000-0000-0000-000000000001",
          nickname: "Chosen",
          connected: true,
          identity: { name: "Fixture" },
        },
      ],
      error: null,
      refresh: vi.fn(),
    };
  },
}));
vi.mock("../../state/drive", () => ({
  drive: {
    connections: (input: unknown) => input,
    binding: () => "binding",
    read: "read",
    search: "search",
    bind: "bind",
    changes: () => "changes",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) =>
    command === "search" ? mocks.search : command === "read" ? mocks.read : mocks.bind,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({
    children,
    actions,
  }: {
    children?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div>
      {children}
      <details>
        <summary>Item actions</summary>
        {actions}
      </details>
    </div>
  ),
}));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => children,
  DialogPopup: "section",
  DialogHeader: "header",
  DialogPanel: "main",
  DialogTitle: "h2",
}));
let renderer: ReactTestRenderer | undefined;
const environmentId = EnvironmentId.make("remote");
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.capable = true;
  mocks.connected = true;
  mocks.binding = "first";
  mocks.generation = null;
  mocks.accountConnected = true;
  mocks.accountIdentity = "account-one";
  mocks.bindingFileId = "file";
  mocks.subscriptionError = null;
  mocks.operate = true;
  vi.clearAllMocks();
  mocks.read.mockReset();
  mocks.bind.mockReset();
  vi.unstubAllGlobals();
});

const page = (text: string, nextOffset?: number, connectionId = "first"): DriveReadResult => ({
  connectionId,
  file: {
    id: "file",
    name: "Brief",
    mimeType: "text/plain",
    url: "https://drive.google.com/file/d/file/view",
  },
  body: {
    text,
    truncated: nextOffset !== undefined,
    ...(nextOffset === undefined ? {} : { nextOffset }),
  },
});
const readButton = (label: string) =>
  renderer!.root.findAllByType("button").findLast((node) => node.props.children === label)!;
it("reads inline only on request, appends pages, and removes reader chrome on the final page", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.read
    .mockResolvedValueOnce({ _tag: "Success", value: page("First page text", 15) })
    .mockResolvedValueOnce({ _tag: "Success", value: page("Second page text") });
  await act(() => {
    renderer = create(
      <DriveReader
        environmentId={environmentId}
        fileId="file"
        renderContent={(_result, text, overflowAction) => (
          <>
            <article>{text}</article>
            {overflowAction}
          </>
        )}
      />,
    );
  });
  expect(mocks.bind).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  await act(() => readButton("Read file").props.onClick());
  expect(renderer!.root.findByType("article").children.join("")).toBe("First page text");
  await act(() => readButton("Read more").props.onClick());
  expect(renderer!.root.findByType("article").children.join("")).toBe(
    "First page textSecond page text",
  );
  expect(renderer!.root.findAllByType("select")).toHaveLength(0);
  expect(renderer!.root.findAllByType("h3")).toHaveLength(0);
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
  for (const label of ["Read file", "Use this connection", "Read more"])
    expect(readButton(label)).toBeUndefined();
  expect(renderer!.root.findAllByType("a")).toHaveLength(1);
  expect(renderer!.root.findByType("details").findAllByType("a")).toHaveLength(1);
});
it("keeps accumulated pages and an in-flight continuation across same-account counter changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.generation = 1;
  const view = () => (
    <DriveReader
      environmentId={environmentId}
      fileId="file"
      renderContent={(_result, text) => <article>{text}</article>}
    />
  );
  mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("First page", 14) });
  await act(() => {
    renderer = create(view());
  });
  await act(() => readButton("Read file").props.onClick());
  let settle!: (value: { _tag: "Success"; value: DriveReadResult }) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  await act(() => {
    readButton("Read more").props.onClick();
  });
  mocks.generation = 2;
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findByType("article").children.join("")).toBe("First page");
  await act(() => settle({ _tag: "Success", value: page("Continued page") }));
  expect(renderer!.root.findByType("article").children.join("")).toBe("First pageContinued page");
  expect(readButton("Read more")).toBeUndefined();
  mocks.generation = 3;
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findByType("article").children.join("")).toBe("First pageContinued page");
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
it.each(["inline", "modal"])(
  "keeps the first %s read alive when token refresh ticks the feed",
  async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let finish!: (value: { _tag: "Success"; value: DriveReadResult }) => void;
    mocks.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = () => (
      <DriveReader
        environmentId={environmentId}
        fileId="file"
        {...(mode === "inline"
          ? { renderContent: (_result: DriveReadResult, text: string) => <article>{text}</article> }
          : {})}
      />
    );
    await act(() => {
      renderer = create(view());
    });
    await act(() => {
      readButton("Read file").props.onClick();
    });
    mocks.generation = 1;
    await act(() => renderer!.update(view()));
    await act(() => finish({ _tag: "Success", value: page("Refreshed body") }));
    expect(renderer!.root.findByType(mode === "inline" ? "article" : "pre").children.join("")).toBe(
      "Refreshed body",
    );
    expect(mocks.read).toHaveBeenCalledTimes(1);
  },
);
it.each(["binding", "identity", "file"])(
  "discards a late first read after %s identity changes",
  async (change) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let finish!: (value: { _tag: "Success"; value: DriveReadResult }) => void;
    mocks.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = () => (
      <DriveReader
        environmentId={environmentId}
        fileId="file"
        renderContent={(_result, text) => <article>{text}</article>}
      />
    );
    await act(() => {
      renderer = create(view());
    });
    await act(() => {
      readButton("Read file").props.onClick();
    });
    if (change === "binding") mocks.binding = "second";
    if (change === "identity") mocks.accountIdentity = "account-two";
    if (change === "file") mocks.bindingFileId = "other-file";
    await act(() => renderer!.update(view()));
    await act(() => finish({ _tag: "Success", value: page("Stale account body") }));
    expect(renderer!.root.findAllByType("article")).toHaveLength(0);
    expect(readButton("Read file").props.disabled).toBe(false);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  },
);
it("discards a late binding success after the bound account changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (value: { _tag: "Success"; value: unknown }) => void;
  mocks.bind.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = () => <DriveReader environmentId={environmentId} fileId="file" />;
  await act(() => {
    renderer = create(view());
  });
  await act(() =>
    renderer!.root.findByType("select").props.onChange({ target: { value: "first" } }),
  );
  await act(() => {
    readButton("Use this connection").props.onClick();
  });
  mocks.binding = "second";
  await act(() => renderer!.update(view()));
  await act(() =>
    finish({ _tag: "Success", value: { connectionId: "first", file: page("").file } }),
  );
  expect(mocks.refreshBinding).not.toHaveBeenCalled();
  expect(renderer!.root.findByType("select").props.value).toBe("");
  expect(readButton("Read file").props.disabled).toBe(false);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("discards a late continuation after the environment changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("First page", 10) });
  const view = (env = environmentId) => (
    <DriveReader
      environmentId={env}
      fileId="file"
      renderContent={(_result, text) => <article>{text}</article>}
    />
  );
  await act(() => {
    renderer = create(view());
  });
  await act(() => readButton("Read file").props.onClick());
  let finish!: (value: { _tag: "Success"; value: DriveReadResult }) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(() => {
    readButton("Read more").props.onClick();
  });
  await act(() => renderer!.update(view(EnvironmentId.make("other"))));
  await act(() => finish({ _tag: "Success", value: page("Stale continuation") }));
  expect(renderer!.root.findAllByType("article")).toHaveLength(0);
  expect(readButton("Read more")).toBeUndefined();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
it("clears the chosen Drive account on disconnect while the environment stays connected", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = () => (
    <DriveReader
      environmentId={environmentId}
      fileId="file"
      renderContent={(_result, text) => <article>{text}</article>}
    />
  );
  mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("Connected body") });
  await act(() => {
    renderer = create(view());
  });
  await act(() => readButton("Read file").props.onClick());
  mocks.accountConnected = false;
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findAllByType("article")).toHaveLength(0);
  expect(readButton("Read file").props.disabled).toBe(true);
  expect(JSON.stringify(renderer!.toJSON())).toContain(
    "Reconnect this Drive connection in Settings",
  );
  await act(() => readButton("Read file").props.onClick());
  expect(mocks.read).toHaveBeenCalledTimes(1);
  mocks.accountConnected = true;
  await act(() => renderer!.update(view()));
  expect(mocks.read).toHaveBeenCalledTimes(1);
  mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("Reconnected body") });
  await act(() => readButton("Read file").props.onClick());
  expect(renderer!.root.findByType("article").children.join("")).toBe("Reconnected body");
});
it("does not choose the first account, blocks an unbound read and waits for explicit binding", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.binding = undefined;
  const view = () => (
    <DriveReader
      environmentId={environmentId}
      fileId="file"
      renderContent={(_result, text) => <article>{text}</article>}
    />
  );
  await act(() => {
    renderer = create(view());
  });
  expect(renderer!.root.findByType("select").props.value).toBe("");
  expect(readButton("Read file").props.disabled).toBe(true);
  await act(() => readButton("Read file").props.onClick());
  expect(mocks.read).not.toHaveBeenCalled();
  const chosen = "drv_00000000-0000-0000-0000-000000000001";
  await act(() =>
    renderer!.root.findByType("select").props.onChange({ target: { value: chosen } }),
  );
  let finish!: (value: {
    _tag: "Success";
    value: { connectionId: string; file: DriveReadResult["file"] };
  }) => void;
  mocks.bind.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(() => {
    readButton("Use this connection").props.onClick();
  });
  expect(mocks.bind).toHaveBeenCalledWith({
    environmentId,
    input: { connectionId: chosen, fileId: "file" },
  });
  expect(mocks.read).not.toHaveBeenCalled();
  await act(() =>
    finish({ _tag: "Success", value: { connectionId: chosen, file: page("").file } }),
  );
  mocks.binding = chosen;
  await act(() => renderer!.update(view()));
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockResolvedValueOnce({
    _tag: "Success",
    value: page("Chosen body", undefined, chosen),
  });
  await act(() => readButton("Read file").props.onClick());
  expect(renderer!.root.findByType("article").children.join("")).toBe("Chosen body");
});
it("allows read-authorized bound reads while denying account changes without operate access", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.operate = false;
  await act(() => {
    renderer = create(
      <DriveReader
        environmentId={environmentId}
        fileId="file"
        renderContent={(_result, text) => <article>{text}</article>}
      />,
    );
  });
  expect(renderer!.root.findByType("select").props.disabled).toBe(true);
  expect(readButton("Use this connection").props.disabled).toBe(true);
  await act(() =>
    renderer!.root.findByType("select").props.onChange({
      target: { value: "drv_00000000-0000-0000-0000-000000000001" },
    }),
  );
  await act(() => readButton("Use this connection").props.onClick());
  expect(mocks.bind).not.toHaveBeenCalled();
  mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("Read access") });
  await act(() => readButton("Read file").props.onClick());
  expect(renderer!.root.findByType("article").children.join("")).toBe("Read access");
});
it.each(["file", "environment"])(
  "discards a late read on a %s switch without automatic reading",
  async (change) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let finish!: (value: { _tag: "Success"; value: DriveReadResult }) => void;
    mocks.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(() => {
      renderer = create(
        <DriveReader
          environmentId={environmentId}
          fileId="file"
          renderContent={(_result, text) => <article>{text}</article>}
        />,
      );
    });
    const click = readButton("Read file").props.onClick;
    await act(() => {
      click();
      click();
    });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await act(() =>
      renderer!.update(
        <DriveReader
          environmentId={change === "environment" ? EnvironmentId.make("other") : environmentId}
          fileId={change === "file" ? "other-file" : "file"}
          renderContent={(_result, text) => <article>{text}</article>}
        />,
      ),
    );
    await act(() => finish({ _tag: "Success", value: page("Stale body") }));
    expect(renderer!.root.findAllByType("article")).toHaveLength(0);
    expect(renderer!.root.findByType("select").props.value).toBe("");
    expect(mocks.read).toHaveBeenCalledTimes(1);
  },
);
it("discards a late binding failure on environment change and preserves the new chooser", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.binding = undefined;
  let finish!: (value: { _tag: "Failure"; cause: Cause.Cause<Error> }) => void;
  mocks.bind.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(() => {
    renderer = create(<DriveReader environmentId={environmentId} fileId="file" />);
  });
  await act(() =>
    renderer!.root
      .findByType("select")
      .props.onChange({ target: { value: "drv_00000000-0000-0000-0000-000000000001" } }),
  );
  await act(() => {
    readButton("Use this connection").props.onClick();
  });
  await act(() =>
    renderer!.update(<DriveReader environmentId={EnvironmentId.make("other")} fileId="file" />),
  );
  await act(() =>
    finish({ _tag: "Failure", cause: Cause.fail(new Error("Old environment failure")) }),
  );
  expect(renderer!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  expect(renderer!.root.findByType("select").props.value).toBe("");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("clears a disconnected reader, then retries explicitly after reconnecting", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = () => (
    <DriveReader
      environmentId={environmentId}
      fileId="file"
      renderContent={(_result, text) => <article>{text}</article>}
    />
  );
  mocks.read.mockResolvedValueOnce({
    _tag: "Failure",
    cause: Cause.fail(new Error("Reconnect the chosen account")),
  });
  await act(() => {
    renderer = create(view());
  });
  await act(() => readButton("Read file").props.onClick());
  expect(renderer!.root.findByProps({ role: "alert" }).props.children).toBe(
    "Reconnect the chosen account",
  );
  mocks.connected = false;
  await act(() => renderer!.update(view()));
  expect(readButton("Read file")).toBeUndefined();
  mocks.connected = true;
  await act(() => renderer!.update(view()));
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(renderer!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("Reconnected body") });
  await act(() => readButton("Read file").props.onClick());
  expect(renderer!.root.findByType("article").children.join("")).toBe("Reconnected body");
});
it("reads with a silent change feed and blocks only an actual feed error until retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = () => (
    <DriveReader
      environmentId={environmentId}
      fileId="file"
      renderContent={(_result, text) => <article>{text}</article>}
    />
  );
  mocks.generation = null;
  await act(() => {
    renderer = create(view());
  });
  expect(readButton("Read file").props.disabled).toBe(false);
  mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("Tracked body", 12) });
  await act(() => readButton("Read file").props.onClick());
  expect(renderer!.root.findByType("article").children.join("")).toBe("Tracked body");
  mocks.subscriptionError = "Drive changes are unavailable";
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findByType("article").children.join("")).toBe("Tracked body");
  expect(readButton("Read more").props.disabled).toBe(true);
  await act(() => readButton("Read more").props.onClick());
  expect(mocks.read).toHaveBeenCalledTimes(1);
  await act(() => readButton("Retry").props.onClick());
  expect(mocks.refreshChanges).toHaveBeenCalledOnce();
  mocks.subscriptionError = null;
  await act(() => renderer!.update(view()));
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(readButton("Read more").props.disabled).toBe(false);
});
it.each([0, 2 ** 53, 256 * 1024 + 1])(
  "rejects invalid continuation %s and explains a bounded incomplete body",
  async (offset) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.read.mockResolvedValueOnce({ _tag: "Success", value: page("Invalid page", offset) });
    await act(() => {
      renderer = create(
        <DriveReader
          environmentId={environmentId}
          fileId="file"
          renderContent={(_result, text) => <article>{text}</article>}
        />,
      );
    });
    await act(() => readButton("Read file").props.onClick());
    expect(readButton("Read more")).toBeUndefined();
    expect(renderer!.root.findByProps({ role: "alert" }).props.children).toContain(
      "invalid continuation",
    );
    mocks.read.mockResolvedValueOnce({
      _tag: "Success",
      value: { ...page("Bounded body"), body: { text: "Bounded body", truncated: true } },
    });
    await act(() => readButton("Read file").props.onClick());
    expect(renderer!.root.findByType("article").children.join("")).toBe("Bounded body");
    expect(JSON.stringify(renderer!.toJSON())).toContain("This view is incomplete");
    expect(readButton("Read more")).toBeUndefined();
  },
);
it("gates old servers without creating Drive search queries or reader controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.capable = false;
  await act(() => {
    renderer = create(
      <>
        <DriveSearch environmentId={environmentId} onLink={async () => {}} />
        <DriveFileAccess environmentId={environmentId} fileId="file" />
      </>,
    );
  });
  expect(mocks.query).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType("button")).toHaveLength(0);
});
it("unmounts search and reader queries when the environment disconnects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = (
    <>
      <DriveSearch environmentId={environmentId} onLink={async () => {}} />
      <DriveFileAccess environmentId={environmentId} fileId="file" />
    </>
  );
  await act(() => {
    renderer = create(view);
  });
  mocks.query.mockClear();
  mocks.connected = false;
  await act(() =>
    renderer!.update(
      <>
        <DriveSearch environmentId={environmentId} onLink={async () => {}} />
        <DriveFileAccess environmentId={environmentId} fileId="file" />
      </>,
    ),
  );
  expect(mocks.query).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType("button")).toHaveLength(0);
});
it("requires an explicit account, then verifies binding before linking search results", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onLink = vi.fn().mockResolvedValue(undefined);
  mocks.search.mockResolvedValue({
    _tag: "Success",
    value: {
      files: [
        {
          id: "file-one",
          name: "Brief",
          mimeType: "text/plain",
          url: "https://drive.google.com/file/d/file-one/view",
        },
      ],
      incomplete: false,
    },
  });
  mocks.bind.mockResolvedValue({
    _tag: "Success",
    value: {
      connectionId: "drv_00000000-0000-0000-0000-000000000001",
      file: { id: "file-one", name: "Latest brief" },
    },
  });
  await act(() => {
    renderer = create(<DriveSearch environmentId={environmentId} onLink={onLink} />);
  });
  expect(renderer!.root.findByType("select").props.value).toBe("");
  expect(mocks.search).not.toHaveBeenCalled();
  await act(() =>
    renderer!.root
      .findByType("select")
      .props.onChange({ target: { value: "drv_00000000-0000-0000-0000-000000000001" } }),
  );
  await act(() =>
    renderer!.root.findByType("input").props.onChange({ target: { value: "Launch" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.search).toHaveBeenCalledWith({
    environmentId,
    input: { connectionId: "drv_00000000-0000-0000-0000-000000000001", query: "Launch", limit: 20 },
  });
  expect(onLink).not.toHaveBeenCalled();
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Brief")!
      .props.onClick(),
  );
  expect(mocks.bind).toHaveBeenCalledWith({
    environmentId,
    input: { connectionId: "drv_00000000-0000-0000-0000-000000000001", fileId: "file-one" },
  });
  expect(onLink).toHaveBeenCalledWith({
    ref: { type: "file", provider: "google-drive", fileId: "file-one" },
    title: "Latest brief",
  });
});
it("invalidates accumulated pages and late reads after a subscription-driven binding change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const page = (connectionId: string, text: string, nextOffset?: number) => ({
    _tag: "Success",
    value: {
      connectionId,
      file: {
        id: "file",
        name: "Brief",
        mimeType: "text/plain",
        url: "https://drive.google.com/file/d/file/view",
      },
      body: { text, truncated: nextOffset !== undefined, nextOffset },
    },
  });
  mocks.read.mockResolvedValueOnce(page("first", "Old account text", 16));
  await act(() => {
    renderer = create(<DriveFileAccess environmentId={environmentId} fileId="file" />);
  });
  const button = (label: string) =>
    renderer!.root.findAllByType("button").findLast((node) => node.props.children === label)!;
  await act(() => button("Read file").props.onClick());
  await act(() => button("Read file").props.onClick());
  expect(renderer!.root.findByType("pre").props.children).toBe("Old account text");
  let finishOld!: (value: ReturnType<typeof page>) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  await act(() => {
    button("Read more").props.onClick();
  });
  mocks.binding = "second";
  await act(() =>
    renderer!.update(<DriveFileAccess environmentId={environmentId} fileId="file" />),
  );
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
  expect(
    renderer!.root.findAllByType("button").some((node) => node.props.children === "Read more"),
  ).toBe(false);
  await act(() => finishOld(page("first", "Late old page")));
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
  mocks.read.mockResolvedValueOnce(page("second", "New account text"));
  await act(() => button("Read file").props.onClick());
  expect(mocks.read).toHaveBeenLastCalledWith({
    environmentId,
    input: { fileId: "file", offset: 0 },
  });
  expect(renderer!.root.findByType("pre").props.children).toBe("New account text");
  mocks.read.mockResolvedValueOnce(page("first", "Wrong identity"));
  await act(() => button("Read file").props.onClick());
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
  expect(renderer!.root.findByProps({ role: "alert" }).props.children).toContain(
    "connection changed",
  );
});
