import { useState } from "react";
import { normalizeLinkUrl } from "@t3tools/contracts";
import { WorkspaceBrowserView } from "../WorkspaceBrowserView";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  let disposed = false;
  const pending = new Set<Promise<void>>();
  let releasePage = () => {};
  const pageReady = new Promise<void>((resolve) => {
    releasePage = resolve;
  });
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
    const [addressDraft, setAddressDraft] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
      <div className="flex h-[353px] min-w-0 flex-col">
        <WorkspaceBrowserView
          addressDraft={addressDraft}
          linkTarget={null}
          displayedUrl={session.seed.browser.url}
          menuOpen={menuOpen}
          unavailableReason={error}
          onAddressChange={setAddressDraft}
          onMenuChange={setMenuOpen}
          onOpenExternal={() => run(session.seed.browser.url)}
          onSubmit={() => {
            const url = normalizeLinkUrl(addressDraft);
            setError(url ? null : "Enter an http or https address.");
            if (url) run(url);
          }}
          renderPage={
            <iframe
              title="Controlled website preview"
              sandbox=""
              onLoad={() => releasePage()}
              className="h-[311px] w-full shrink-0 border border-border bg-background"
              style={{ borderRadius: 9 }}
              srcDoc={`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="color-scheme" content="dark"><style>
                * { box-sizing: border-box; } body { margin: 0; background: #090909; color: #ececf1; font-family: 'Segoe UI', system-ui, sans-serif; padding: 16px; }
                .brand { color: #356bff; font-size: 10px; font-weight: 600; line-height: 20px; }
                h1 { margin: 34px 0 12px; font-size: 24px; font-weight: 700; line-height: 31px; }
                p { margin: 0; color: #85858e; font-size: 12px; line-height: 20px; }
                button { margin-top: 18px; height: 24px; padding: 0 11px; border: 0; border-radius: 7px; background: #376aff; color: white; font: 600 11px 'Segoe UI', system-ui, sans-serif; }
                footer { margin-top: 37px; border-top: 1px solid #1c1c20; padding-top: 10px; color: #85858e; font-size: 10px; line-height: 20px; }
              </style><div class="brand">SynKEK</div><h1>Built for<br>what's next.</h1><p>Meet the new collection. Thoughtful products, made for everyday life.</p><button type="button">Explore products</button><footer>synkek.com · Website preview</footer></html>`}
            />
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
      await pageReady;
      await Promise.all(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
      releasePage();
    },
  };
};
