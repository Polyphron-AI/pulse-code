import { renderToStaticMarkup } from "react-dom/server";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { ComposerStashMenu } from "./ComposerStashMenu";

describe("ComposerStashMenu", () => {
  it("labels mixed file and image stashes without treating images as files", () => {
    const markup = renderToStaticMarkup(
      <ComposerStashMenu
        entries={[
          {
            id: "mixed-attachments",
            createdAt: new Date(0).toISOString(),
            prompt: "",
            attachments: [
              {
                id: "image-one",
                name: "before.png",
                mimeType: "image/png",
                sizeBytes: 128,
                dataUrl: "data:image/png;base64,AA==",
              },
            ],
            files: [
              {
                id: "file-one",
                name: "report.pdf",
                mimeType: "application/pdf",
                sizeBytes: 42,
                attachmentId: "pending-report-pdf",
                environmentId: EnvironmentId.make("environment-1"),
              },
            ],
            droppedImageNames: [],
          },
        ]}
        onRestore={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('data-composer-stash-drawer="true"');
    expect(markup).toContain("chat-composer-drawer-attached");
    expect(markup).toContain("(2 attachments)");
    expect(markup).toContain("size-3.5 text-secondary-label");
    expect(markup).not.toContain("(2 files)");
  });
});
