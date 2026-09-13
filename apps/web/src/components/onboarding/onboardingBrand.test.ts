// Guards the onboarding naming calls against future upstream imports: upstream
// copy arrives branded as T3 Code, and this suite fails the moment a merge
// reintroduces our-product naming while keeping the genuinely T3-owned strings.

// @effect-diagnostics-next-line nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function source(file: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(file, import.meta.url)), "utf8");
}

const wizard = source("./WelcomeWizard.tsx");
const gate = source("./FirstRunGate.tsx");
const hostedStatic = source("../../routes/_chat.index.tsx");

describe("onboarding product naming", () => {
  it("never names our app T3 Code", () => {
    expect(wizard).not.toContain("T3 Code");
    expect(gate).not.toContain("T3 Code");
  });

  it("reads the product name from the shared identity seam", () => {
    for (const file of [wizard, gate, hostedStatic]) {
      expect(file).toContain(
        `import { PRODUCT_BASE_NAME } from "@t3tools/shared/productIdentity";`,
      );
    }
  });

  it("brands the wizard dialog title and header with the product name", () => {
    expect(wizard).toContain("Set up {PRODUCT_BASE_NAME}");
    expect(wizard).toContain("<PulseWordmark");
    expect(wizard).not.toContain("T3Wordmark");
  });

  it("tells the user to keep our app running, by name", () => {
    expect(wizard).toContain("Keep {PRODUCT_BASE_NAME} running.");
    expect(wizard).toContain("Start {PRODUCT_BASE_NAME} first,");
  });

  it("names our app in the workspace confirmation failure", () => {
    expect(gate).toContain("${PRODUCT_BASE_NAME} could not confirm this workspace.");
  });

  it("names our app in hosted web first-use guidance", () => {
    expect(hostedStatic).not.toContain("running T3 Code");
    expect(hostedStatic).toContain("running {PRODUCT_BASE_NAME}");
    expect(hostedStatic).toContain("Start the {PRODUCT_BASE_NAME} desktop app");
  });
});

describe("third-party T3 references stay accurate", () => {
  it("keeps the T3 Connect sign-in service under its real name", () => {
    expect(wizard).toContain(">T3 Connect<");
  });

  it("keeps the real npx t3 commands verbatim", () => {
    expect(wizard).toContain(`command="npx t3 connect"`);
    expect(wizard).toContain(`command="npx t3 pair"`);
    expect(wizard).toContain("npx t3 serve");
  });
});
