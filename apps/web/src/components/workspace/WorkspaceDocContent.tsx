import { normalizeLinkUrl } from "@t3tools/contracts";
import ReactMarkdown, { type Components } from "react-markdown";

// Presentation only until a structured provider read is admitted on the wire.
export type WorkspaceDocBlock =
  | { readonly type: "heading"; readonly level: 2 | 3; readonly text: string }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "ordered-list"; readonly items: readonly string[] };

type Content =
  | { readonly format: "markdown"; readonly text: string }
  | { readonly format: "blocks"; readonly blocks: readonly WorkspaceDocBlock[] };

const markdownComponents = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
} satisfies Components;

/** Reads bounded document content without embeds, raw HTML or workspace actions. */
export function WorkspaceDocContent({ content }: { content: Content }) {
  return (
    <div className="min-w-0 break-words text-3xs leading-5.25 text-muted-foreground [&_p]:whitespace-pre-wrap [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-2xs [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-2xs [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mb-2 [&_li]:text-foreground [&_ol]:list-decimal [&_ol]:pl-3 [&_ul]:list-disc [&_ul]:pl-3 [&_a]:underline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-ring [&_code]:whitespace-pre-wrap">
      {content.format === "markdown" ? (
        <ReactMarkdown
          skipHtml
          unwrapDisallowed
          allowedElements={["p", "h2", "h3", "ol", "ul", "li", "strong", "em", "a", "br", "code"]}
          urlTransform={(url) => normalizeLinkUrl(url) ?? ""}
          components={markdownComponents}
        >
          {content.text}
        </ReactMarkdown>
      ) : (
        content.blocks.map((block, index) => {
          if (block.type === "heading") {
            if (block.level === 2) return <h2 key={index}>{block.text}</h2>;
            if (block.level === 3) return <h3 key={index}>{block.text}</h3>;
          }
          if (block.type === "paragraph") return <p key={index}>{block.text}</p>;
          if (block.type === "ordered-list")
            return (
              <ol key={index}>
                {block.items.map((text, item) => (
                  <li key={item}>{text}</li>
                ))}
              </ol>
            );
          return <p key={index}>Unsupported document content.</p>;
        })
      )}
    </div>
  );
}
