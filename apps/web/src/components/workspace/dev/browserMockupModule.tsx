import { useLayoutEffect, useRef, useState } from "react";
import { normalizeLinkUrl, WorkspaceLinkEndpoint, WorkspaceLinkList } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  WorkspaceBrowserExternalPage,
  WorkspaceBrowserView,
  WorkspaceBrowserSearchResults,
  WorkspaceBrowserPageActions,
} from "../WorkspaceBrowserView";
import {
  captureWorkspacePage,
  findLinkedPages,
  hasExplicitScheme,
} from "../workspaceBrowser.logic";
import { WorkspaceItemActionButtons } from "../WorkspaceItemActionButtons";
import { Button } from "../../ui/button";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

const decodeEndpoint = Schema.decodeUnknownSync(WorkspaceLinkEndpoint);
const decodeLinkList = Schema.decodeUnknownSync(WorkspaceLinkList);

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  const external = session.browserState === "external";
  const search =
    session.browserState === "search-results" ||
    session.browserState === "empty-results" ||
    session.browserState === "truncated-results";
  const target = decodeEndpoint({
    ref: { type: "provider-resource", provider: "slack", resourceId: "slack-marketing" },
    title: "Marketing channel",
  });
  const pages = decodeLinkList({
    linked: ["handbook", "launch-checklist"].map((slug, index) => ({
      id: `wl_00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
      item: {
        ref: { type: "url", url: `https://synkek.example.invalid/${slug}` },
        title: index === 0 ? "Project handbook" : "Project launch checklist",
      },
      status: "confirmed",
      source: { type: "user" },
      updatedAt: "2026-10-13T09:00:00.000Z",
    })),
    suggested: [],
    truncated: session.browserState === "truncated-results",
  });
  let disposed = false;
  const pending = new Set<Promise<void>>();
  const pageLoads = new Set<() => void>();
  const run = (value: string) => {
    if (disposed) return;
    const command = session.record("navigate", undefined, value);
    pending.add(command);
    void command.then(
      () => pending.delete(command),
      () => pending.delete(command),
    );
  };
  function Resource() {
    const releasePage = useRef(() => {});
    const input = useRef<HTMLInputElement>(null);
    useLayoutEffect(() => {
      if (disposed || external) return;
      const pageReady = new Promise<void>((resolve) => {
        releasePage.current = () => {
          pending.delete(pageReady);
          pageLoads.delete(releasePage.current);
          resolve();
        };
      });
      pending.add(pageReady);
      pageLoads.add(releasePage.current);
      return () => releasePage.current();
    }, []);
    const [addressDraft, setAddressDraft] = useState(
      search ? (session.browserState === "empty-results" ? "No matching page" : "Project") : "",
    );
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const url = normalizeLinkUrl(addressDraft) ?? "";
    const openAddress = () => {
      if (!url && !hasExplicitScheme(addressDraft)) {
        setError(null);
        setSearchOpen(addressDraft.trim().length > 0);
        return;
      }
      setSearchOpen(false);
      setError(url ? null : "Enter an http or https address.");
      if (url) run(external ? addressDraft.trim() : url);
    };
    const captured = captureWorkspacePage({
      environmentId: session.environmentId,
      target,
      desktop: true,
      address: addressDraft,
      navigation: {
        _tag: "Success",
        url: session.seed.browser.url,
        title: session.seed.browser.title,
      },
    });
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <WorkspaceBrowserView
          inputRef={input}
          addressDraft={addressDraft}
          linkTarget={external ? null : target}
          displayedUrl={external ? url : session.seed.browser.url}
          menuOpen={menuOpen}
          searchOpen={searchOpen}
          onSearchChange={setSearchOpen}
          searchResults={
            <WorkspaceBrowserSearchResults
              pages={findLinkedPages(pages, addressDraft)}
              truncated={pages.truncated}
              onOpen={(endpoint) => {
                if (endpoint.ref.type === "url") {
                  setAddressDraft(endpoint.ref.url);
                  setSearchOpen(false);
                  run(endpoint.ref.url);
                }
              }}
            />
          }
          menuActions={
            captured && !external ? (
              <WorkspaceBrowserPageActions
                target={captured.target}
                permitted
                controls={{
                  url: session.seed.browser.url,
                  loading: false,
                  canGoBack: false,
                  canGoForward: false,
                  refreshDisabled: false,
                  onBack: () => {},
                  onForward: () => {},
                  onRefresh: () => run(session.seed.browser.url),
                  onSubmit: run,
                }}
                linkHint={null}
                linkAction={
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      void session.record("link", captured.page.ref);
                    }}
                  >
                    Link this page
                  </Button>
                }
                sharedActions={
                  <div className="flex flex-wrap items-center gap-2">
                    <WorkspaceItemActionButtons
                      startThread={{
                        onClick: () => {
                          void session.record("open-thread", captured.page.ref);
                        },
                      }}
                      addToProject={{
                        onClick: () => {
                          void session.record("add-to-project", captured.page.ref);
                        },
                      }}
                      startProject={{
                        onClick: () => {
                          void session.record("start-project", captured.page.ref);
                        },
                      }}
                      startAutomation={{
                        onClick: () => {
                          void session.record("start-automation", captured.page.ref);
                        },
                      }}
                    />
                  </div>
                }
              />
            ) : undefined
          }
          unavailableReason={error}
          onAddressChange={setAddressDraft}
          onMenuChange={(open) => {
            setSearchOpen(false);
            setMenuOpen(open);
          }}
          onOpenExternal={external ? openAddress : () => run(session.seed.browser.url)}
          onSubmit={openAddress}
          renderPage={
            external ? (
              <WorkspaceBrowserExternalPage
                url={url}
                address={addressDraft}
                busy={false}
                linkHint="Select an item to link this page to."
                onOpen={openAddress}
                onCopy={async () => {
                  run(addressDraft.trim());
                  return true;
                }}
                linkAction={
                  <Button size="xs" variant="ghost" disabled>
                    Link this page
                  </Button>
                }
              />
            ) : (
              <iframe
                title="Controlled website preview"
                // Same-origin keeps the static page in-process so its paint lands with onLoad; scripts stay blocked.
                sandbox="allow-same-origin"
                onLoad={() => {
                  if (search) input.current?.focus();
                  setSearchOpen(search);
                  setMenuOpen(session.browserState === "captured-page");
                  releasePage.current();
                }}
                className="h-[311px] w-full shrink-0 border border-border bg-background"
                style={{ borderRadius: 9 }}
                srcDoc={`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="color-scheme" content="dark"><style>
                * { box-sizing: border-box; } body { margin: 0; background: #090909; color: #ececf1; font-family: 'Segoe UI', system-ui, sans-serif; padding: 16px; }
                .brand { color: #356bff; font-size: 10px; font-weight: 600; line-height: 20px; }
                h1 { margin: 37px 0 12px; font-size: 24px; font-weight: 600; line-height: 31px; }
                p { margin: 0; color: #85858e; font-size: 11.5px; line-height: 20px; letter-spacing: -0.03em; }
                button { margin-top: 18px; height: 24px; padding: 0 11px; border: 0; border-radius: 7px; background: #376aff; color: white; font: 600 11px 'Segoe UI', system-ui, sans-serif; }
                footer { margin-top: 39px; border-top: 1px solid #1c1c20; padding-top: 8px; color: #85858e; font-size: 10px; line-height: 20px; }
              </style><div class="brand">SynKEK</div><h1>Built for<br>what's next.</h1><p>Meet the new collection. Thoughtful products, made for<br>everyday life.</p><button type="button">Explore products</button><footer>synkek.com · Website preview</footer></html>`}
              />
            )
          }
        />
      </div>
    );
  }
  return {
    area: "browser",
    readyRegions: ["resource"],
    resource: <Resource />,
    settled: async () => {
      await Promise.all(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
      for (const release of pageLoads) release();
    },
  };
};
