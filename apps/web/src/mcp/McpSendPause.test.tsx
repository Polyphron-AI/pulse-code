import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: ComponentProps<"div">) => <div>{children}</div>,
  AlertDialogClose: ({ children }: ComponentProps<"button">) => <button>{children}</button>,
  AlertDialogDescription: ({ children }: ComponentProps<"p">) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: ComponentProps<"footer">) => <footer>{children}</footer>,
  AlertDialogHeader: ({ children }: ComponentProps<"header">) => <header>{children}</header>,
  AlertDialogPopup: ({ children }: ComponentProps<"div">) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: ComponentProps<"h2">) => <h2>{children}</h2>,
}));

import { McpSendPauseContent } from "./McpSendPause";

describe("McpSendPause", () => {
  it("explains that the send stopped and offers every recovery action", () => {
    const markup = renderToStaticMarkup(
      <McpSendPauseContent
        failed={[{ connectionId: "linear", name: "Linear", message: "Token expired" }]}
        onRetry={() => {}}
        onContinueWithout={() => {}}
        onManage={() => {}}
      />,
    );

    expect(markup).toContain("Your message has not been sent");
    expect(markup).toContain("Linear");
    expect(markup).toContain("Token expired");
    expect(markup).toContain("Retry");
    expect(markup).toContain("Continue without it");
    expect(markup).toContain("Manage connections");
    expect(markup).toContain("Cancel");
  });

  it("shows actionable preparation errors without inventing a failed connection", () => {
    const markup = renderToStaticMarkup(
      <McpSendPauseContent
        failed={[]}
        error="Finish or stop the active turn, then retry."
        onRetry={() => {}}
        onContinueWithout={() => {}}
        onManage={() => {}}
      />,
    );
    expect(markup).toContain("Finish or stop the active turn, then retry.");
    expect(markup).not.toContain("Continue without it");
    expect(markup).toContain("Manage connections");
  });

  it("disables competing actions while a connection check runs", () => {
    const markup = renderToStaticMarkup(
      <McpSendPauseContent
        failed={[{ connectionId: "linear", name: "Linear", message: "Token expired" }]}
        busy
        onRetry={() => {}}
        onContinueWithout={() => {}}
        onManage={() => {}}
      />,
    );
    expect(markup).toContain("Checking the selected MCP connections");
    expect(markup.match(/disabled=""/g)).toHaveLength(3);
  });
});
