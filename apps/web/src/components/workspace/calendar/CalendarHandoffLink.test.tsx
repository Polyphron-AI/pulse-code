// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { CalendarHandoffLink } from "./CalendarHandoffLink";

it("retries a rejected desktop Join with the exact URL and clears recovery on success", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const url = "https://tenant.zoom.us/j/123?pwd=AbC%2B123&tk=exact#keep";
  const openExternal = vi
    .fn()
    .mockRejectedValueOnce(new Error("Desktop rejected Join"))
    .mockResolvedValueOnce(undefined);
  try {
    await act(() =>
      root.render(
        <CalendarHandoffLink target={{ kind: "meeting", raw: url }} client={{ openExternal }} />,
      ),
    );
    await act(() => fireEvent.click(getByRole(node, "button", { name: "Join meeting" })));
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
    expect(node.textContent).toContain("Unable to open meeting link.");
    await act(() => fireEvent.click(getByRole(node, "link", { name: "Try again" })));
    expect(openExternal.mock.calls).toEqual([[url], [url]]);
    expect(queryByRole(node, "link", { name: "Try again" })).toBeNull();
    expect(queryByRole(node, "button", { name: "Dismiss" })).toBeNull();
    expect(queryByRole(node, "button", { name: "Copy meeting link" })).toBeNull();
    expect(node.textContent).not.toContain("Unable to open");
  } finally {
    await act(() => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});

it("announces copy failure in the existing status region and dismisses recovery", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const copy = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
  const url = "https://Zoom.us/j/1?pwd=X";
  const suppressNavigation = (event: Event) => event.preventDefault();
  node.addEventListener("click", suppressNavigation);
  try {
    await act(() =>
      root.render(
        <CalendarHandoffLink target={{ kind: "meeting", raw: url }} client={{ copyText: copy }} />,
      ),
    );
    const [recovery, status] = node.querySelectorAll('[role="status"]');
    expect(recovery?.textContent).toBe("");
    expect(status?.textContent).toBe("");
    await act(() => fireEvent.click(getByRole(node, "link", { name: "Join meeting" })));
    expect(recovery?.textContent).toBe(
      "If nothing opened, use Open meeting link or copy the address.",
    );
    await act(() => fireEvent.click(getByRole(node, "button", { name: "Copy meeting link" })));
    expect(copy).toHaveBeenCalledExactlyOnceWith(url);
    expect(node.querySelectorAll('[role="status"]')[1]).toBe(status);
    expect(status?.textContent).toBe("Could not copy the address. Select and copy it below.");
    expect(node.textContent).toContain(url);
    await act(() => fireEvent.click(getByRole(node, "button", { name: "Dismiss" })));
    expect(queryByRole(node, "link", { name: "Open meeting link" })).toBeNull();
    expect(recovery?.textContent).toBe("");
    expect(status?.textContent).toBe("");
    expect(document.activeElement).toBe(getByRole(node, "link", { name: "Join meeting" }));
  } finally {
    node.removeEventListener("click", suppressNavigation);
    await act(() => root.unmount());
    node.remove();
    vi.unstubAllGlobals();
  }
});
