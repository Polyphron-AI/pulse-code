import { act } from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { PullRequestNamedFilters } from "./PullRequestNamedFilters";
vi.mock("../ui/popover", () => ({
  Popover: "section",
  PopoverTrigger: "header",
  PopoverPopup: "article",
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
it("applies named filters together and supports removing and clearing them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const change = vi.fn();
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(
        <PullRequestNamedFilters author="alice" labels={["bug"]} onChange={change} />,
      );
    });
    const root = () => renderer!.root;
    await act(async () => {
      root()
        .findByProps({ "aria-label": "Pull request author" })
        .props.onChange({ currentTarget: { value: "bob" } });
    });
    await act(async () => {
      root()
        .findByProps({ "aria-label": "Pull request label" })
        .props.onChange({ currentTarget: { value: "needs review" } });
    });
    const button = (text: string) =>
      root()
        .findAllByType("button")
        .find((node) => node.children.includes(text))!;
    await act(async () => {
      button("Add").props.onClick();
    });
    expect(change).not.toHaveBeenCalled();
    await act(async () => {
      root().findByProps({ "aria-label": "Remove label bug" }).props.onClick();
    });
    await act(async () => {
      button("Apply").props.onClick();
    });
    expect(change).toHaveBeenLastCalledWith({ author: "bob", labels: ["needs review"] });
    await act(async () => {
      button("Clear").props.onClick();
    });
    expect(change).toHaveBeenLastCalledWith({ author: undefined, labels: undefined });
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    vi.unstubAllGlobals();
  }
});
