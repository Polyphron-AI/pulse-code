# Mermaid diagram rendering implementation plan

## 1. Shared fence rules

- Add a small shared module for normalizing fenced-code languages, identifying Mermaid blocks, enforcing the source limit, and creating stable cache keys.
- Cover aliases, whitespace, empty blocks, source limits, and theme-sensitive keys with focused unit tests.
- Keep the persisted Markdown and wire contracts unchanged.

## 2. Web and desktop renderer

- Add Mermaid as a lazy web dependency.
- Add a renderer module that initializes Mermaid in strict mode with HTML labels and links disabled.
- Add a bounded render cache keyed by source, theme, and renderer version.
- Route completed `mermaid` fences in `ChatMarkdown` to a diagram component. Leave streaming fences on the existing code-block path.
- Preserve the existing code-block header and copy action. Replace the wrap action with an accessible source/diagram toggle for completed Mermaid blocks.
- Use a token-driven graph-paper background and horizontal overflow inside the existing block frame.
- On parse errors or limit failures, show the source with a concise error label.
- Test routing, lazy rendering, streaming behavior, theme keys, source fallback, and failure handling.

## 3. Mobile Markdown segmentation

- Add a scanner that divides Markdown into ordinary and Mermaid-fence segments without changing non-Mermaid content.
- Apply segmentation before both the native selectable and JavaScript Markdown renderers.
- Keep streaming assistant content unsegmented so Mermaid source remains a code block until completion.
- Test backticks and tildes, fence indentation, fence info strings, unclosed fences, multiple diagrams, and surrounding Markdown preservation.

## 4. Mobile PNG renderer

- Add a single hidden WebView host near the thread-feed root. Load a local renderer document and serialize render requests through it.
- Render Mermaid to SVG in strict mode, rasterize it through canvas, and return a PNG data URI plus intrinsic dimensions through `postMessage`.
- Add a bounded in-memory cache and pending-request deduplication keyed by source, theme, and renderer version.
- Reject oversized source and output before committing results to cache.
- Add a diagram component that scales PNGs to message width, preserves aspect ratio, exposes source copy, and falls back to the ordinary code block on failure.
- Test queue ordering, cache behavior, message validation, dimension scaling, and fallback behavior without launching a simulator.

## 5. Documentation and verification

- Add a user-facing note explaining fenced Mermaid rendering, completion timing, and source fallback.
- Run focused unit tests for touched web, mobile, and shared files.
- Run targeted typechecks for web and mobile.
- Do not launch a browser, simulator, or computer-use session without explicit approval.

## Completion checks

- Web and desktop render completed Mermaid fences as SVG.
- iOS and Android render completed Mermaid fences as PNG.
- Streaming, invalid, and oversized Mermaid remains copyable source.
- Diagram source never goes to an external service.
- Local, relay, and tunnel modes require no special branch.
