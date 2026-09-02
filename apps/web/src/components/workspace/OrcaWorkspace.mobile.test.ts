// @effect-diagnostics nodeBuiltinImport:off -- This regression test reads the UI sources that define the mobile layout contract.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

const workspaceSource = NodeFS.readFileSync(
  new URL("./OrcaWorkspace.tsx", import.meta.url),
  "utf8",
);
const ompDialogSource = NodeFS.readFileSync(
  new URL("./OmpThreadDialog.tsx", import.meta.url),
  "utf8",
);
const dialogPrimitiveSource = NodeFS.readFileSync(
  new URL("../ui/dialog.tsx", import.meta.url),
  "utf8",
);

describe("ORCA mobile-web layout", () => {
  it("renders cards below the wide desktop-ledger breakpoint", () => {
    expect(workspaceSource).toContain('const useDesktopLedger = useMediaQuery("2xl")');
    expect(workspaceSource).toContain("useDesktopLedger ? (");
    expect(workspaceSource).toContain("<DesktopLedger");
    expect(workspaceSource).toContain("<MobileLedger");
  });

  it("keeps launch and ledger controls usable in a narrow viewport", () => {
    expect(workspaceSource).toContain('className="min-h-11 w-full shrink-0 sm:w-auto"');
    expect(workspaceSource).toContain('className="grid grid-cols-2 gap-3 lg:grid-cols-4"');
    expect(workspaceSource).toContain("overflow-x-auto");
    expect(workspaceSource).toContain('className="shrink-0"');
    expect(workspaceSource).toContain('className="relative min-w-0 sm:w-64"');
  });

  it("uses a full-width mobile launch sheet with scrolling content and persistent actions", () => {
    expect(ompDialogSource).toContain('className="w-full sm:max-w-xl"');
    expect(ompDialogSource).toContain(
      'className="max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]"',
    );
    expect(dialogPrimitiveSource).toContain(
      'bottomStickOnMobile && "max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12"',
    );
    expect(dialogPrimitiveSource).toContain("<ScrollArea scrollFade={scrollFade}>");
    expect(dialogPrimitiveSource).toContain(
      '"flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-end',
    );
  });
});
