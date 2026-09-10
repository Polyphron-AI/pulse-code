import { ApprovalRequestId, type ProviderApprovalOption } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";

const options = [
  { decision: "cancel", label: "Cancel request" },
  { decision: "decline", label: "Decline" },
  { decision: "acceptAlways", label: "Always allow Safari" },
  { decision: "accept", label: "Approve" },
] satisfies ReadonlyArray<ProviderApprovalOption>;
const render = (choices?: ReadonlyArray<ProviderApprovalOption>, responding = false) =>
  renderToStaticMarkup(
    <ComposerPendingApprovalActions
      requestId={ApprovalRequestId.make("approval-safari")}
      isResponding={responding}
      options={choices}
      onRespondToApproval={async () => undefined}
    />,
  );
describe("ComposerPendingApprovalActions", () => {
  it("preserves standard approvals for native providers", () => {
    const markup = render();
    expect(markup).toContain("Cancel turn");
    expect(markup).toContain("Always allow this session");
    expect(markup).toContain("Approve once");
  });
  it("shows only the choices advertised by an MCP server", () => {
    const markup = render(options);
    for (const option of options) expect(markup).toContain(option.label);
    expect(markup).not.toContain("Always allow this session");
    expect(markup).not.toContain("Cancel turn");
  });

  it("marks an option that carries a provider warning", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("approval-1")}
        isResponding={false}
        options={[
          { decision: "accept", label: "Allow once" },
          {
            decision: "acceptForSession",
            label: "Allow for this thread",
            warning: "Untrusted files could re-run this action without asking.",
          },
          { decision: "decline", label: "Deny" },
        ]}
        onRespondToApproval={async () => undefined}
      />,
    );

    expect(markup).toContain(
      'aria-description="Untrusted files could re-run this action without asking."',
    );
    expect(markup).toContain("text-warning");
    expect(markup).toContain("Allow for this thread");
  });

  it("disables every choice while a response is pending", () => {
    const buttons = render(options, true).match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(options.length);
    for (const button of buttons) expect(button).toContain("disabled");
  });
  it("wraps long provider labels without losing their text", () => {
    const label = "Allow access to this application ".repeat(30);
    const markup = render([{ decision: "acceptAlways", label }]);
    expect(markup).toContain(label);
    expect(markup).toContain("whitespace-normal");
    expect(markup).toContain("max-w-full");
  });
});
