import { memo, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  HashIcon,
  ChevronDownIcon,
  FolderIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import {
  parseTelegramResourceId,
  parseChatResourceId,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import {
  conversationInitials,
  type ConversationGroup,
  type ConversationRow,
} from "./communicationsChat";
import "./communications.css";

const providerLabels: Readonly<Record<string, string>> = {
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
};
const kindLabels = {
  channel: "Channels",
  group: "Groups",
  dm: "Direct messages",
  thread: "Threads",
};
const NavigationRow = memo(function NavigationRow({
  row,
  selected,
  onSelect,
  renderRow,
}: {
  row: ConversationRow;
  selected: boolean;
  onSelect: (endpoint: WorkspaceLinkEndpoint) => void;
  renderRow?: ((row: ConversationRow, button: ReactNode) => ReactNode) | undefined;
}) {
  const button = (
    <button
      type="button"
      data-conversation-row=""
      data-conversation-kind={row.kind}
      aria-label={`Open ${row.title}`}
      aria-current={selected ? "page" : undefined}
      onClick={() => onSelect(row.endpoint)}
    >
      {row.kind === "dm" ? (
        <span data-conversation-initials="">{row.initials ?? conversationInitials(row.title)}</span>
      ) : (
        <HashIcon aria-hidden="true" />
      )}
      <span data-conversation-title="">{row.title}</span>
      {row.knownUnread !== undefined && row.knownUnread > 0 ? (
        <span data-conversation-unread="" aria-label={`${row.knownUnread} known unread`}>
          {row.knownUnread}
        </span>
      ) : null}
    </button>
  );
  return <div>{renderRow ? renderRow(row, button) : button}</div>;
});

/** Metadata-only navigation shared by desktop chat, Telegram and marked fixtures. */
export function ConversationNavigation({
  groups,
  selectedKey,
  onSelect,
  searchRef,
  renderRow,
  children,
  accountLabels,
  emptyMessage = "No loaded conversations match.",
}: {
  readonly groups: readonly ConversationGroup[];
  readonly selectedKey?: string | undefined;
  readonly onSelect: (endpoint: WorkspaceLinkEndpoint) => void;
  readonly searchRef?: RefObject<HTMLInputElement | null>;
  readonly renderRow?: (row: ConversationRow, button: ReactNode) => ReactNode;
  readonly children?: ReactNode;
  readonly accountLabels?: Readonly<Record<string, string>>;
  readonly emptyMessage?: string | null | undefined;
}) {
  const nav = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(false);
  const [provider, setProvider] = useState("");
  const [account, setAccount] = useState("");
  const [kind, setKind] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const allRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const identities = useMemo(
    () =>
      new Map(
        allRows.map((row) => {
          const ref = row.endpoint.ref;
          return [
            row.key,
            ref.type === "provider-resource"
              ? {
                  provider: ref.provider,
                  account:
                    parseChatResourceId(ref.resourceId)?.connectionId ??
                    (ref.provider === "telegram"
                      ? parseTelegramResourceId(ref.resourceId)?.connectionId
                      : undefined) ??
                    "",
                }
              : { provider: "", account: "" },
          ];
        }),
      ),
    [allRows],
  );
  const identity = (row: ConversationRow) => identities.get(row.key)!;
  const visible = (row: ConversationRow) =>
    row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    (!provider || identity(row).provider === provider) &&
    (!account || identity(row).account === account) &&
    (!kind || row.kind === kind);
  const shown = groups.flatMap((group) => group.rows.filter(visible));
  const showSearch = groups.length > 0 || emptyMessage !== null;
  return (
    <nav
      ref={nav}
      aria-label="Conversations"
      data-communications-navigation=""
      onKeyDown={(event) => {
        if (event.key === "Escape" && filters) {
          event.stopPropagation();
          setFilters(false);
        }
        if (
          !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
          !(event.target instanceof HTMLElement) ||
          !event.target.matches("[data-conversation-row]")
        )
          return;
        event.preventDefault();
        const buttons = [
          ...(nav.current?.querySelectorAll<HTMLButtonElement>("[data-conversation-row]") ?? []),
        ];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {showSearch ? (
        <div data-conversation-search="">
          <SearchIcon aria-hidden="true" />
          <input
            ref={searchRef}
            aria-label="Search loaded conversations"
            placeholder="Find a conversation"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            aria-label="Filter conversations"
            aria-expanded={filters}
            onClick={() => setFilters((value) => !value)}
          >
            <SlidersHorizontalIcon />
          </button>
        </div>
      ) : null}
      {showSearch && filters ? (
        <div data-conversation-filters="" role="group" aria-label="Conversation filters">
          <label>
            Provider
            <select
              aria-label="Filter provider"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value);
                setAccount("");
              }}
            >
              <option value="">All providers</option>
              {[...new Set(allRows.map((row) => identity(row).provider))]
                .filter(Boolean)
                .map((value) => (
                  <option key={value} value={value}>
                    {providerLabels[value] ?? "Other provider"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Account
            <select
              aria-label="Filter account"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            >
              <option value="">All accounts</option>
              {[
                ...new Set(
                  allRows
                    .filter((row) => !provider || identity(row).provider === provider)
                    .map((row) => identity(row).account),
                ),
              ]
                .filter(Boolean)
                .map((value) => (
                  <option key={value} value={value}>
                    {accountLabels?.[value] ?? "Connected account"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label="Filter type"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">All types</option>
              {[...new Set(allRows.map((row) => row.kind))].map((value) => (
                <option key={value} value={value}>
                  {kindLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setProvider("");
              setAccount("");
              setKind("");
              setQuery("");
            }}
          >
            Reset filters
          </button>
        </div>
      ) : null}
      <div aria-live="polite" className="sr-only">
        {showSearch && (query || provider || account || kind)
          ? `${shown.length} loaded conversations match`
          : null}
      </div>
      {groups.map((group) => {
        const key = group.key ?? group.label;
        const rows = group.rows.filter(visible);
        if (!rows.length) return null;
        return (
          <section
            key={key}
            data-conversation-group={group.project ? "project" : group.label.toLowerCase()}
          >
            {group.project ? (
              <button
                type="button"
                data-conversation-group-toggle=""
                aria-label={`Toggle ${group.label}`}
                aria-expanded={!collapsed.has(key)}
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              >
                <ChevronDownIcon />
                <FolderIcon />
                <span>{group.label}</span>
              </button>
            ) : (
              <h2>{group.label}</h2>
            )}
            {!collapsed.has(key)
              ? rows.map((row) => (
                  <NavigationRow
                    key={row.key}
                    row={row}
                    selected={selectedKey === row.key}
                    onSelect={onSelect}
                    renderRow={renderRow}
                  />
                ))
              : null}
          </section>
        );
      })}
      {!shown.length && emptyMessage ? <p data-conversation-empty="">{emptyMessage}</p> : null}
      {children}
    </nav>
  );
}
