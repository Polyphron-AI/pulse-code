# Mermaid diagram rendering

## Goal

Pulse Code automatically renders completed fenced `mermaid` blocks in chat. Web and desktop display SVG diagrams. Mobile generates and displays PNGs. Streaming messages continue to show the Mermaid source as an ordinary code block until the turn finishes.

This feature does not add a diagram editor or change persisted messages. Mermaid source remains Markdown owned by the message.

## Web and desktop

`ChatMarkdown` recognizes a block as Mermaid when its normalized fence language is `mermaid` and the message is no longer streaming. It lazy-loads Mermaid only when a completed message contains such a block.

The renderer uses Mermaid's strict security mode, disables HTML labels and diagram links, and selects a light or dark theme from the active client theme. It places the returned SVG inside the existing code-block frame so users retain source-copy access and familiar block styling. Wide diagrams scroll horizontally rather than widening the thread.

Streaming blocks remain regular source code. A completed block replaces that source area with the diagram. Theme changes produce a new themed render.

## Mobile

Mobile splits Mermaid fences from the surrounding Markdown before choosing the native selectable renderer or JavaScript fallback. Non-Mermaid segments continue through the renderer they use today.

One shared offscreen WebView owns the mobile Mermaid runtime. It serially accepts completed diagram jobs, renders each to SVG, paints the SVG into a canvas, and returns a PNG data URI with intrinsic dimensions. The feed displays the result through `expo-image` and scales it to the available message width.

A size-bounded in-memory cache uses the normalized source, theme, and renderer version as its key. This prevents rerendering when virtualized rows leave and re-enter the viewport. Serial work avoids creating a WebView per diagram or rendering many diagrams at once.

## Safety and limits

Mermaid source never leaves the client. Neither the server nor an external rendering service receives diagram text.

Both clients cap source length and output dimensions before rendering. Mermaid runs in strict mode with HTML labels and diagram links disabled. Invalid, oversized, or failed diagrams fall back to the ordinary Mermaid source block with a concise rendering-error label. Users can still copy the source.

The renderer loads only after a completed message contains a Mermaid fence. It does no diagram parsing or rendering for each streamed token.

## Scope across Pulse Code

- Web supports local hosting and app.t3.codes through the same `ChatMarkdown` path.
- Desktop inherits the web implementation without Electron IPC.
- Mobile supports iOS and Android through its shared thread feed and WebView dependency.
- Provider adapters do not change because fenced Markdown is provider-neutral.
- Contracts and server behavior do not change because messages retain their original Markdown.
- Local, relay, and tunnel connections behave the same because rendering is client-local.
- The first version applies to chat messages. Markdown file previews and pull request Markdown remain unchanged.

## Verification

Focused web tests cover Mermaid fence recognition, the completed-versus-streaming switch, lazy rendering, theme changes, invalid source, limits, and source fallback.

Focused mobile tests cover Markdown segmentation, job serialization, cache keys and eviction, theme changes, invalid WebView responses, limits, dimension scaling, and source fallback. An integrated browser or simulator pass requires explicit approval under the repository testing rules.
