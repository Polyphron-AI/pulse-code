import { CableIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ComposerControl,
  ComposerControlChevron,
  ComposerControlIcon,
  type ComposerControlSize,
} from "../components/chat/ComposerControl";
import { composerFloatingLayerProps } from "../components/chat/composerEventScope";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../components/ui/menu";
import {
  filterManagedMcpEntries,
  managedMcpStatusLabel,
  toggleManagedMcpSelection,
  type ManagedMcpEntry,
} from "./managedMcpPickerLogic";

export interface ManagedMcpPickerProps {
  readonly entries: ReadonlyArray<ManagedMcpEntry>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly selectionMode: "defaults" | "override";
  readonly defaultScope: "global" | "project";
  readonly nativeDiscovery: "available" | "unavailable";
  readonly size?: ComposerControlSize;
  readonly disabled?: boolean;
  readonly selectionDisabled?: boolean;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onChange: (connectionIds: ReadonlyArray<string>) => void;
  readonly retryConnectionIds?: ReadonlyArray<string>;
  readonly onRetryConnection?: (connectionId: string) => void;
  readonly onUseDefaults: () => void;
  readonly onSaveGlobalDefaults?: () => void;
  readonly onSaveProjectDefaults?: () => void;
  readonly onResetProjectDefaults?: () => void;
  readonly onManage: () => void;
  readonly onRetry?: () => void;
}

function EntryText({ entry }: { readonly entry: ManagedMcpEntry }) {
  return (
    <span className="flex min-w-0 flex-col py-0.5">
      <span className="truncate">{entry.name}</span>
      <span className="truncate text-xs text-muted-foreground">{managedMcpStatusLabel(entry)}</span>
    </span>
  );
}

export function ManagedMcpPicker(props: ManagedMcpPickerProps) {
  const [query, setQuery] = useState("");
  const size = props.size ?? "sm";
  const pulseEntries = useMemo(
    () =>
      filterManagedMcpEntries(
        props.entries.filter((entry) => entry.source === "pulse"),
        query,
      ),
    [props.entries, query],
  );
  const nativeEntries = useMemo(
    () =>
      filterManagedMcpEntries(
        props.entries.filter((entry) => entry.source === "provider"),
        query,
      ),
    [props.entries, query],
  );
  const selectedCount = props.selectedIds.length;

  return (
    <Menu>
      <MenuTrigger
        disabled={props.disabled}
        render={
          <ComposerControl
            size={size}
            variant="ghost"
            className="shrink-0"
            aria-label={selectedCount ? `MCPs, ${selectedCount} selected` : "MCPs"}
          />
        }
      >
        <ComposerControlIcon icon={CableIcon} size={size} />
        <span>{selectedCount ? `MCPs ${selectedCount}` : "MCPs"}</span>
        <ComposerControlChevron size={size} />
      </MenuTrigger>
      <MenuPopup
        align="start"
        className="w-[min(20rem,calc(100vw-1rem))]"
        {...composerFloatingLayerProps}
      >
        <label className="mb-1 flex h-8 items-center gap-2 rounded-md bg-muted/55 px-2 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <SearchIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Search MCP connections</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") event.stopPropagation();
            }}
            placeholder="Search MCPs"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        {props.loading ? (
          <p className="px-2 py-2 text-sm text-muted-foreground" role="status">
            Loading MCPs…
          </p>
        ) : props.error ? (
          <button
            type="button"
            className="w-full rounded-sm px-2 py-2 text-left text-sm text-error-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={props.onRetry}
          >
            {props.error} {props.onRetry ? "Try again" : ""}
          </button>
        ) : (
          <>
            <MenuGroup>
              <MenuGroupLabel>Pulse-managed</MenuGroupLabel>
              {pulseEntries.map((entry) => (
                <div key={entry.id}>
                  <MenuCheckboxItem
                    variant="switch"
                    checked={props.selectedIds.includes(entry.id)}
                    disabled={props.selectionDisabled || entry.status === "checking"}
                    onCheckedChange={() =>
                      props.onChange(toggleManagedMcpSelection(props.selectedIds, entry.id))
                    }
                  >
                    <EntryText entry={entry} />
                  </MenuCheckboxItem>
                  {props.retryConnectionIds?.includes(entry.id) ? (
                    <MenuItem
                      closeOnClick={false}
                      disabled={props.selectionDisabled}
                      aria-label={`Retry ${entry.name}`}
                      className="ml-8 rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => props.onRetryConnection?.(entry.id)}
                    >
                      Retry
                    </MenuItem>
                  ) : null}
                </div>
              ))}
              {pulseEntries.length === 0 ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">
                  {query.trim() ? "No matching managed MCPs." : "No managed MCPs configured."}
                </p>
              ) : null}
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Provider-native</MenuGroupLabel>
              {props.nativeDiscovery === "unavailable" ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">
                  Native MCP discovery is unavailable for this provider.
                </p>
              ) : nativeEntries.length > 0 ? (
                nativeEntries.map((entry) => (
                  <div key={entry.id} className="px-2 py-1 text-sm text-foreground">
                    <EntryText entry={entry} />
                  </div>
                ))
              ) : (
                <p className="px-2 py-2 text-sm text-muted-foreground">
                  {query.trim() ? "No matching native MCPs." : "No native MCPs reported."}
                </p>
              )}
            </MenuGroup>
          </>
        )}

        <MenuSeparator />
        {props.selectionMode === "override" ? (
          <MenuItem disabled={props.selectionDisabled} onClick={props.onUseDefaults}>
            Use defaults
          </MenuItem>
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Using {props.defaultScope} defaults
          </p>
        )}
        {props.onSaveProjectDefaults ? (
          <MenuItem disabled={props.selectionDisabled} onClick={props.onSaveProjectDefaults}>
            Save as project defaults
          </MenuItem>
        ) : null}
        {props.onResetProjectDefaults ? (
          <MenuItem disabled={props.selectionDisabled} onClick={props.onResetProjectDefaults}>
            Reset project defaults
          </MenuItem>
        ) : null}
        {props.onSaveGlobalDefaults ? (
          <MenuItem disabled={props.selectionDisabled} onClick={props.onSaveGlobalDefaults}>
            Save as global defaults
          </MenuItem>
        ) : null}
        <MenuItem onClick={props.onManage}>
          <SettingsIcon />
          Manage MCPs
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
