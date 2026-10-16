import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  codeReturnHref,
  rememberCodeLocation,
  workspaceDestinationSearch,
  workspaceDestinations,
  workspaceViews,
} from "./workspaceNavigation";

describe("workspace navigation", () => {
  it("orders the six canonical destinations and uses their first view", () => {
    expect(workspaceDestinations.map(({ id }) => id)).toEqual([
      "communications",
      "meetings",
      "calendar",
      "mail",
      "tasks",
      "projects",
    ]);
    for (const { id } of workspaceDestinations) {
      expect(workspaceDestinationSearch(id, EnvironmentId.make("remote-a"))).toEqual({
        space: id,
        view: workspaceViews[id][0],
        environment: "remote-a",
      });
    }
  });

  it("remembers Code by environment without substituting another environment's thread", () => {
    const a = EnvironmentId.make("return-a");
    const b = EnvironmentId.make("return-b");
    rememberCodeLocation(a, "/return-a/thread-a?diff=1#change");
    rememberCodeLocation(b, "/return-b/thread-b");
    expect(codeReturnHref(a)).toBe("/return-a/thread-a?diff=1#change");
    expect(codeReturnHref(b)).toBe("/return-b/thread-b");
    expect(codeReturnHref(EnvironmentId.make("unvisited"))).toBe("/");
  });

  it("never stores Settings, Workspace, external or malformed hrefs as Code", () => {
    const environment = EnvironmentId.make("invalid-return");
    for (const href of [
      "/settings",
      "/settings/email",
      "/workspace?space=projects",
      "https://elsewhere.invalid/thread",
      "//elsewhere.invalid/thread",
      "http://[",
      "/unknown",
      "/other/thread",
      "/pair",
      "/usage",
    ]) {
      expect(() => rememberCodeLocation(environment, href)).not.toThrow();
      expect(codeReturnHref(environment)).toBe("/");
    }
  });

  it("retains deleted thread routes for the router's unavailable handling", () => {
    const environment = EnvironmentId.make("deleted");
    rememberCodeLocation(environment, "/deleted/missing-thread");
    rememberCodeLocation(environment, "/workspace?space=projects");
    expect(codeReturnHref(environment)).toBe("/deleted/missing-thread");
  });
});
