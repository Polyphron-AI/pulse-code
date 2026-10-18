import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Cause from "effect/Cause";
import {
  DriveError,
  type DriveProjectRootResult,
  type WorkspaceLinkList,
} from "@t3tools/contracts";
import { WorkspaceItemMenuView } from "../WorkspaceItemMenuView";
import { Button } from "../../ui/button";
import { Sheet, SheetPopup, SheetTitle } from "../../ui/sheet";
import {
  ProjectDriveExplorerView,
  type ProjectDriveExplorerViewProps,
} from "../ProjectDriveExplorerView";
import {
  ProjectDriveRootSettingsView,
  type ProjectDriveRootSettingsViewProps,
} from "../ProjectDriveRootSettingsView";
import { driveMockupData } from "./driveMockupData";
import type {
  CreateWorkspaceMockupModule,
  WorkspaceMockupSession,
} from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  if (!["01", "02", "03", "04"].includes(session.id))
    return { area: "drive", readyRegions: [], settled: session.settled, dispose() {} };
  let disposed = false;
  const pending = new Set<Promise<void>>();
  const run = (value: string) => {
    if (disposed) return;
    const command = session.record("navigate", undefined, value);
    pending.add(command);
    void command.finally(() => pending.delete(command));
  };
  function Resource() {
    useEffect(() => {
      if (session.driveState === "drive-t1-20")
        document
          .querySelector<HTMLButtonElement>('[data-workspace-action="linkedContext"]')
          ?.click();
    }, []);
    const data = useMemo(() => driveMockupData(session), []);
    const [page, setPage] = useState(0);
    const [sortTouched, setSortTouched] = useState(false);
    const [query, setQuery] = useState("");
    const [submitted, setSubmitted] = useState("");
    const [filters, setFilters] = useState<ProjectDriveExplorerViewProps["filters"]>(
      session.driveState === "drive-filtered-empty" ? { type: "other" } : {},
    );
    const [sort, setSort] = useState<ProjectDriveExplorerViewProps["sort"]>("name");
    const [direction, setDirection] = useState<"asc" | "desc">("asc");
    const [layout, setLayout] = useState<"list" | "grid">(
      session.driveState === "drive-grid" ? "grid" : "list",
    );
    const [folder, setFolder] = useState(
      session.driveState === "drive-nested" ? data.files[1]!.id : data.root.id,
    );
    const [selected, setSelected] = useState<string | null>(null);
    const [menu, setMenu] = useState<string | null>(null);
    const [settings, setSettings] = useState(
      Boolean(session.driveState?.startsWith("drive-t") && session.id !== "04"),
    );
    const [error, setError] = useState(
      session.driveState === "drive-error" ? "Google Drive did not allow this request." : null,
    );
    const [loading, setLoading] = useState(session.driveState === "drive-loading");
    const isEmpty = session.driveState === "drive-empty" || folder !== data.root.id;
    let files =
      isEmpty || loading || error
        ? []
        : data.files.filter(
            (file) =>
              (!submitted || file.name.toLowerCase().includes(submitted.toLowerCase())) &&
              (!filters.type ||
                (filters.type === "folder"
                  ? file.mimeType === data.root.mimeType
                  : filters.type === "document"
                    ? file.mimeType.endsWith(".document")
                    : false)),
          );
    files = files.filter(
      (file) =>
        (!filters.owner ||
          file.owners?.some((owner) =>
            filters.owner === "me" ? owner.me : owner.emailAddress === filters.owner,
          )) &&
        (!filters.modifiedAfter ||
          Date.parse(file.modifiedTime ?? "") >= Date.parse(filters.modifiedAfter)) &&
        (!filters.modifiedBefore ||
          Date.parse(file.modifiedTime ?? "") < Date.parse(filters.modifiedBefore)),
    );
    if (session.driveState === "drive-paged" && page === 0) files = files.slice(0, 4);
    if (session.driveState === "drive-page-limit")
      files = Array.from({ length: page === 0 ? 200 : 20 }, (_, index) => ({
        ...data.files[4]!,
        id: `sample-page-${page}-${index}`,
        name: `Sample file ${page * 200 + index + 1}`,
      }));
    if (sortTouched || sort !== "name" || direction !== "asc")
      files = [...files].sort(
        (a, b) =>
          (sort === "name"
            ? a.name.localeCompare(b.name)
            : (a.modifiedTime ?? "").localeCompare(b.modifiedTime ?? "")) *
          (direction === "asc" ? 1 : -1),
      );
    return (
      <>
        <ProjectDriveExplorerView
          files={files}
          linkedFileIds={new Set([session.seed.drive.confirmedFolderId])}
          breadcrumbs={[
            { fileId: data.root.id, title: data.root.name },
            ...(folder === data.root.id
              ? []
              : [
                  {
                    fileId: folder,
                    title: data.files.find((file) => file.id === folder)?.name ?? "Marketing",
                  },
                ]),
          ]}
          selectedFileId={selected}
          query={query}
          filters={filters}
          sort={sort}
          direction={direction}
          layout={layout}
          pending={loading}
          error={error}
          unavailableReason={null}
          incomplete={session.driveState === "drive-incomplete"}
          hasMore={
            page === 0 &&
            (session.driveState === "drive-paged" || session.driveState === "drive-page-limit")
          }
          pageLimitReached={session.driveState === "drive-page-limit" && page === 0}
          sharingText={session.seed.sampleCopy.filesSharing}
          canOperate
          timeZone={session.timeZone}
          locale={session.locale}
          onQueryChange={(value) => {
            setQuery(value);
            if (!value) setSubmitted("");
          }}
          onSearch={() => {
            setSubmitted(query.trim());
            setPage(0);
            run(`search:${query.trim()}`);
          }}
          onFiltersChange={(value) => {
            setFilters(value);
            setPage(0);
            if (!Object.keys(value).length) {
              setQuery("");
              setSubmitted("");
            }
            run("filters");
          }}
          onSortChange={(sort, direction) => {
            setSort(sort);
            setPage(0);
            setDirection(direction);
            setSortTouched(true);
            run(`sort:${sort}:${direction}`);
          }}
          onLayoutChange={setLayout}
          onBrowse={(id) => {
            setFolder(id);
            setPage(0);
            run(`folder:${id}`);
          }}
          onOpen={setSelected}
          onFileMenu={setMenu}
          onRefresh={() => {
            setError(null);
            setLoading(false);
            setPage(0);
            run("refresh");
          }}
          onMore={() => {
            setPage((value) => value + 1);
            run("more");
          }}
          onOpenSettings={() => setSettings(true)}
          picker={null}
          renderItem={(file, row) => (
            <WorkspaceItemMenuView
              available
              open={menu === file.id}
              onOpenChange={(open) => setMenu(open ? file.id : null)}
              triggerClassName={
                file.mimeType === data.root.mimeType
                  ? "shrink-0 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
                  : "shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
              }
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu(file.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                  event.preventDefault();
                  setMenu(file.id);
                }
              }}
              actions={
                <div className="flex flex-col gap-2">
                  {[
                    "Open in Google Drive",
                    "Copy link",
                    "Link to project",
                    "Start thread",
                    "Add to project",
                    "Start project",
                    "Start automation",
                  ].map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant="ghost"
                      onClick={() => run(`${action}:${file.id}`)}
                    >
                      {action}
                    </Button>
                  ))}
                </div>
              }
            >
              {row}
            </WorkspaceItemMenuView>
          )}
        />
        {loading ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(false);
              run("finish-list");
            }}
          >
            Finish sample file load
          </Button>
        ) : null}
        {selected ? (
          <p className="mt-3 text-xs">
            Sample file selected: {data.files.find((file) => file.id === selected)?.name}. No
            account binding or link was created.
          </p>
        ) : null}
        <Sheet open={settings} onOpenChange={setSettings}>
          <SheetPopup>
            <div className="p-4">
              <SheetTitle>Project workspace settings</SheetTitle>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <DriveSettingsFixture session={session} />
            </div>
          </SheetPopup>
        </Sheet>
      </>
    );
  }
  return {
    area: "drive",
    readyRegions: ["resource"],
    resource: <Resource />,
    settled: async () => {
      await Promise.all(pending);
      await session.settled();
    },
    dispose() {
      disposed = true;
      pending.clear();
    },
  };
};

/** Fake commands feed the live form's presentation without atom or client imports. */
export function DriveSettingsFixture({ session }: { session: WorkspaceMockupSession }) {
  const scenario = session.driveState ?? "drive-t1-1";
  const data = useMemo(() => driveMockupData(session), [session]);
  const savedInitially = [
    "drive-t1-4",
    "drive-t1-8",
    "drive-t1-9",
    "drive-t1-10-unlinked",
    "drive-t1-10-binding",
    "drive-t1-10-unavailable",
    "drive-t1-13",
    "drive-t1-15",
    "drive-t1-19",
    "drive-t1-20",
  ].includes(scenario);
  const choosingInitially = ![
    "drive-t1-1",
    "drive-t1-4",
    "drive-t1-9",
    "drive-t1-10-unlinked",
    "drive-t1-10-binding",
    "drive-t1-10-unavailable",
    "drive-t1-11",
    "drive-t1-13",
    "drive-t1-19",
    "drive-t1-20",
    "drive-t1-21",
  ].includes(scenario);
  const nonFolder = ["drive-t1-6", "drive-t1-6-old", "drive-t2-6"].includes(scenario);
  const unknown = ["drive-t1-5", "drive-t1-17", "drive-t2-1", "drive-t2-5"].includes(scenario);
  const initialState: DriveProjectRootResult["state"] =
    scenario === "drive-t1-9"
      ? "disconnected"
      : scenario === "drive-t1-10-unlinked"
        ? "unlinked"
        : scenario === "drive-t1-10-binding"
          ? "binding-changed"
          : scenario === "drive-t1-10-unavailable"
            ? "unavailable"
            : savedInitially
              ? "available"
              : "unconfigured";
  const [rootData, setRootData] = useState<DriveProjectRootResult>({
    root: savedInitially ? data.designation : null,
    state: initialState,
    ...(savedInitially
      ? { file: scenario === "drive-t1-15" ? { ...data.root, name: "x".repeat(120) } : data.root }
      : {}),
  });
  const [rootError, setRootError] = useState<string | null>(
    scenario === "drive-t1-11" || scenario === "drive-t2-retry"
      ? "Project Drive folder status is unavailable."
      : null,
  );
  const [choosing, setChoosing] = useState(choosingInitially);
  const [linkId, setLinkId] = useState(
    scenario === "drive-t1-2" ||
      scenario === "drive-t2-2" ||
      scenario === "drive-t2-3" ||
      scenario === "drive-t2-retry"
      ? ""
      : data.links.linked[nonFolder ? 2 : unknown ? 3 : scenario === "drive-t1-8" ? 1 : 0]!.id,
  );
  const [batchPending, setBatchPending] = useState(scenario === "drive-t2-2");
  const [batchError, setBatchError] = useState(
    scenario === "drive-t2-3" || scenario === "drive-t2-retry"
      ? "Sample folder check failed."
      : null,
  );
  const [bound, setBound] = useState(false);
  const [version, setVersion] = useState(1);
  const [reload, setReload] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [hidden, setHidden] = useState(scenario === "drive-t1-21");
  const node = useRef<HTMLDivElement>(null);
  const pendingSave = useRef<
    ((value: Awaited<ReturnType<ProjectDriveRootSettingsViewProps["setRoot"]>>) => void) | null
  >(null);
  useEffect(
    () => () => {
      pendingSave.current?.({
        _tag: "Failure",
        cause: Cause.fail(new Error("Sample was disposed.")),
      });
    },
    [],
  );
  const rootRefresh = useCallback(() => {}, []);
  const record = useCallback(
    (value: string) => session.record("navigate", undefined, value),
    [session],
  );
  const many = scenario === "drive-t2-7";
  const links = useMemo<WorkspaceLinkList>(
    () => ({
      ...data.links,
      truncated: scenario === "drive-t1-12",
      linked: many
        ? Array.from({ length: 200 }, (_, index) => ({
            ...data.links.linked[0]!,
            id: `wl_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            item: {
              ref: { type: "file", provider: "google-drive", fileId: `sample-folder-${index}` },
              title: index === 0 ? "x".repeat(120) : `Sample folder ${index}`,
            },
          }))
        : scenario === "drive-t1-10-unlinked"
          ? []
          : reload
            ? data.links.linked.toReversed().concat({
                ...data.links.linked[0]!,
                id: "wl_00000000-0000-4000-8000-000000000099",
                item: {
                  ref: { type: "file", provider: "google-drive", fileId: "extra-folder" },
                  title: "Additional linked folder",
                },
              })
            : scenario === "drive-t2-1"
              ? data.links.linked.filter((_, index) => index !== 1)
              : data.links.linked,
    }),
    [data, scenario, many, reload],
  );
  const currentBindings = useMemo(
    () => ({
      bindings: [
        ...(many
          ? links.linked.flatMap((link) =>
              link.item.ref.type === "file"
                ? [
                    {
                      connectionId: data.connectionId,
                      file: {
                        ...data.root,
                        id: link.item.ref.fileId,
                        name: link.item.title ?? link.item.ref.fileId,
                      },
                    },
                  ]
                : [],
            )
          : data.bindings),
        ...(bound
          ? [
              {
                connectionId: data.connectionId,
                file: {
                  ...data.root,
                  id: "unverified",
                  name: "Verified linked item",
                  mimeType: scenario === "drive-t2-5" ? "text/plain" : data.root.mimeType,
                },
              },
            ]
          : []),
      ],
    }),
    [data, bound, scenario, many, links.linked],
  );
  const explorer = scenario !== "drive-t1-6-old" && scenario !== "drive-t2-6";
  const fileId = links.linked.find((link) => link.id === linkId)?.item.ref;
  const selectedBinding =
    fileId?.type === "file"
      ? currentBindings.bindings.find((binding) => binding.file.id === fileId.fileId)
      : undefined;
  useEffect(() => {
    if (!hidden && !["drive-t1-14-old", "drive-t1-14-disconnected"].includes(scenario))
      void record("pulse.drive.getProjectRoot");
  }, [record, hidden, scenario]);
  const candidateKey = JSON.stringify(
    links.linked.map((link) => (link.item.ref.type === "file" ? link.item.ref.fileId : "")).sort(),
  );
  const seenQueries = useRef(new Set<string>());
  const bindingKey = explorer ? candidateKey : fileId?.type === "file" ? fileId.fileId : null;
  useEffect(() => {
    if (!choosing || hidden || !bindingKey || seenQueries.current.has(bindingKey)) return;
    seenQueries.current.add(bindingKey);
    void record(
      explorer
        ? `pulse.drive.getBindings:${links.linked.length}`
        : "pulse.drive.getBinding:selected",
    );
  }, [record, choosing, hidden, explorer, bindingKey, links.linked.length]);
  const refreshBindings = useCallback(() => {
    setBatchPending(true);
  }, []);
  const finish = () => {
    setBatchPending(false);
    setBatchError(null);
    setBound(true);
    setVersion((value) => value + 1);
    void record("folder-check-settled");
  };
  const setRoot: ProjectDriveRootSettingsViewProps["setRoot"] = async (request) => {
    await session.record(
      "save",
      { type: "project", projectId: session.resourceProjectId },
      JSON.stringify(request.input.root),
    );
    if (scenario === "drive-t1-8")
      return {
        _tag: "Failure",
        cause: Cause.fail(
          new DriveError({
            kind: "unavailable",
            message:
              "The replacement folder is unavailable. The previous project folder has been kept.",
          }),
        ),
      };
    const next: DriveProjectRootResult = {
      root: request.input.root,
      state: request.input.root ? "available" : "unconfigured",
      ...(request.input.root ? { file: data.root } : {}),
    };
    if (scenario === "drive-t1-16")
      return new Promise((resolve) => {
        pendingSave.current = (result) => {
          setRootData(next);
          resolve(result);
        };
      });
    setRootData(next);
    setRootError(null);
    return { _tag: "Success", value: next };
  };
  const bind: ProjectDriveRootSettingsViewProps["bind"] = async (request) => {
    await record(`pulse.drive.bindFile:${request.input.fileId}`);
    if (scenario === "drive-t1-17") setBatchPending(true);
    else setBound(true);
    return {
      _tag: "Success",
      value: {
        connectionId: data.connectionId,
        file: {
          ...data.root,
          id: request.input.fileId,
          mimeType: scenario === "drive-t2-5" ? "text/plain" : data.root.mimeType,
        },
      },
    };
  };
  useEffect(() => {
    if (scenario === "drive-t1-16" || scenario === "drive-t1-8") {
      const use = [...(node.current?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === "Use as project folder",
      );
      use?.click();
    }
    if (scenario === "drive-t1-7") {
      const select = node.current?.querySelector<HTMLSelectElement>(
        '[aria-label="Verify with connection"]',
      );
      if (select) {
        select.value = data.connectionId;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }, [scenario, data]);
  if (scenario === "drive-t1-14-old" || scenario === "drive-t1-14-disconnected")
    return (
      <section aria-label="Project Drive folder" className="space-y-3 border-t border-border pt-3">
        <h3 className="text-sm font-medium">Project Drive folder</h3>
        <p className="text-xs text-muted-foreground">
          {scenario === "drive-t1-14-old"
            ? "Project Drive folders need a newer server. Use Link to in Linked context to find or read individual Drive files."
            : "Connect to this environment to manage its project Drive folder."}
        </p>
        {scenario === "drive-t1-14-old" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showLinks}
              onClick={() => setShowLinks(!showLinks)}
            >
              {showLinks ? "Close linked files" : "Link to"}
            </Button>
            {showLinks ? <p>Sample Link to search</p> : null}
          </>
        ) : null}
      </section>
    );
  return (
    <div
      ref={node}
      className="min-w-0 space-y-3 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
    >
      {scenario === "drive-t1-19" ? (
        <label className="block text-sm">
          Task columns
          <input
            aria-label="Task columns"
            defaultValue="Open, Doing, Review, Done"
            className="w-full rounded border border-input bg-background p-2"
          />
        </label>
      ) : null}
      {!hidden ? (
        <ProjectDriveRootSettingsView
          environmentId={session.environmentId}
          projectId={session.resourceProjectId}
          root={{
            data: rootError ? null : rootData,
            error: rootError,
            failure: rootError ? new DriveError({ kind: "unavailable", message: rootError }) : null,
            isPending: false,
            refresh: rootRefresh,
          }}
          links={{
            data: links,
            error: null,
            isPending: false,
            dataUpdatedAt: version,
            refresh: rootRefresh,
          }}
          connections={{
            data: [
              {
                ...data.connection,
                connected: scenario !== "drive-t1-9",
                ...(scenario === "drive-t1-15"
                  ? {
                      nickname: "Long".repeat(30),
                      identity: {
                        id: "sample-owner",
                        name: "Owner",
                        email: `${"a".repeat(120)}@example.invalid`,
                      },
                    }
                  : {}),
              },
            ],
            error: null,
            isPending: false,
            refresh: rootRefresh,
          }}
          bindings={{
            data: !explorer || batchPending || batchError ? null : currentBindings,
            error: batchError,
            isPending: batchPending,
            refresh: refreshBindings,
          }}
          singleBinding={{
            data: selectedBinding ? { binding: selectedBinding } : {},
            error: null,
            isPending: false,
            refresh: refreshBindings,
          }}
          driveExplorer={explorer}
          canOperate={scenario !== "drive-t1-13"}
          choosing={choosing}
          setChoosing={setChoosing}
          linkId={linkId}
          setLinkId={setLinkId}
          setRoot={setRoot}
          bind={bind}
          renderLinks={
            <div className="space-y-2">
              <p>Sample Link to search. No real accounts are connected.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReload(true);
                  setBatchPending(true);
                  if (scenario === "drive-t1-19")
                    setRootData({
                      ...rootData,
                      file: { ...data.root, name: "Updated by another client" },
                    });
                  setVersion((value) => value + 1);
                  void record("project-link-change");
                }}
              >
                Change sample project links
              </Button>
            </div>
          }
        />
      ) : (
        <p>Resources body is hidden. No root or binding query is mounted.</p>
      )}
      {batchPending ? (
        <Button size="sm" variant="outline" onClick={finish}>
          Finish folder check
        </Button>
      ) : null}
      {scenario === "drive-t1-16" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => pendingSave.current?.({ _tag: "Success", value: rootData })}
        >
          Finish sample save
        </Button>
      ) : null}
      {["drive-t2-4", "drive-t2-retained-error", "drive-t1-19", "drive-t1-20"].includes(
        scenario,
      ) ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReload(true);
            setBatchPending(true);
            if (scenario === "drive-t1-19")
              setRootData({
                root: {
                  ...data.designation,
                  linkId: data.links.linked[1]!.id,
                  fileId: data.files[0]!.id,
                },
                state: "available",
                file: data.files[0]!,
              });
            setVersion((value) => value + 1);
            if (scenario === "drive-t2-retained-error")
              setBatchError("Sample reload failed. Earlier results have been kept.");
          }}
        >
          Reload sample links
        </Button>
      ) : null}
      {scenario === "drive-t1-21" ? (
        <Button size="sm" variant="outline" onClick={() => setHidden(!hidden)}>
          Show Resources body
        </Button>
      ) : null}
    </div>
  );
}
