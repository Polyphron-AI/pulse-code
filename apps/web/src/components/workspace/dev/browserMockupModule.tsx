import { useLayoutEffect, useRef, useState } from "react";
import { normalizeLinkUrl } from "@t3tools/contracts";
import { WorkspaceBrowserExternalPage, WorkspaceBrowserView } from "../WorkspaceBrowserView";
import { Button } from "../../ui/button";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  const external = session.browserState === "external";
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
    const [addressDraft, setAddressDraft] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const url = normalizeLinkUrl(addressDraft) ?? "";
    const openAddress = () => {
      setError(url ? null : "Enter an http or https address.");
      if (url) run(external ? addressDraft.trim() : url);
    };
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <WorkspaceBrowserView
          addressDraft={addressDraft}
          linkTarget={null}
          displayedUrl={external ? url : session.seed.browser.url}
          menuOpen={menuOpen}
          unavailableReason={error}
          onAddressChange={setAddressDraft}
          onMenuChange={setMenuOpen}
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
                onLoad={() => releasePage.current()}
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
