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
vi.mock("./pullRequestPresentation", () => ({ PullRequestActorAvatar: "span" }));
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

it("opens facet loading, selects suggestions, and stops loading after applying", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const change = vi.fn();
  const openChange = vi.fn();
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(
        <PullRequestNamedFilters
          author={undefined}
          labels={undefined}
          onChange={change}
          onOpenChange={openChange}
          authorOptions={[
            { actor: { login: "alice", name: "Alice", avatarUrl: null }, count: 3, mergedCount: 2 },
          ]}
          labelOptions={[{ name: "bug", color: "ff0000", count: 4 }]}
        />,
      );
    });
    await act(async () => {
      renderer!.root.findByType("section").props.onOpenChange(true);
    });
    expect(openChange).toHaveBeenLastCalledWith(true);
    expect(
      renderer!.root
        .findAllByType("span")
        .flatMap((node) => node.children.filter((child) => typeof child === "string"))
        .join(" "),
    ).toContain("merged");
    await act(async () => {
      renderer!.root.findByProps({ "aria-label": "Select author alice" }).props.onClick();
    });
    await act(async () => {
      renderer!.root.findByProps({ "aria-label": "Toggle label bug" }).props.onClick();
    });
    expect(
      renderer!.root.findByProps({ "aria-label": "Toggle label bug" }).props["aria-pressed"],
    ).toBe(true);
    await act(async () => {
      renderer!.root
        .findAllByType("button")
        .find((node) => node.children.includes("Apply"))!
        .props.onClick();
    });
    expect(change).toHaveBeenLastCalledWith({ author: "alice", labels: ["bug"] });
    expect(openChange).toHaveBeenLastCalledWith(false);
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    vi.unstubAllGlobals();
  }
});
