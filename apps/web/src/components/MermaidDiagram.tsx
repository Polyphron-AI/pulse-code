import { useEffect, useId, useState, type ReactNode } from "react";

import { LRUCache } from "../lib/lruCache";

export const MAX_MERMAID_SOURCE_LENGTH = 50_000;
export const MAX_MERMAID_SVG_LENGTH = 2_000_000;
const RENDERER_VERSION = "mermaid-11";
const renderedDiagramCache = new LRUCache<string>(100, 20 * 1024 * 1024);
const pendingRenders = new Map<string, Promise<string>>();
let renderQueue = Promise.resolve();

type MermaidTheme = "light" | "dark";
type RenderState =
  | { readonly cacheKey: string; readonly status: "loading" }
  | { readonly cacheKey: string; readonly status: "ready"; readonly svg: string }
  | { readonly cacheKey: string; readonly status: "error" };

export function mermaidRenderCacheKey(source: string, theme: MermaidTheme): string {
  return `${RENDERER_VERSION}:${theme}:${source}`;
}

export function canRenderMermaidSource(source: string): boolean {
  return source.trim().length > 0 && source.length <= MAX_MERMAID_SOURCE_LENGTH;
}

async function renderMermaid(source: string, theme: MermaidTheme, id: string): Promise<string> {
  const queued = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default",
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    });
    const svg = (await mermaid.render(id, source)).svg;
    if (svg.length > MAX_MERMAID_SVG_LENGTH) throw new Error("Mermaid output is too large");
    return svg;
  });
  renderQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function requestMermaidRender(
  source: string,
  theme: MermaidTheme,
  id: string,
  cacheKey: string,
): Promise<string> {
  const pending = pendingRenders.get(cacheKey);
  if (pending) return pending;
  const render = renderMermaid(source, theme, id).finally(() => pendingRenders.delete(cacheKey));
  pendingRenders.set(cacheKey, render);
  return render;
}

export function MermaidDiagram(props: {
  readonly source: string;
  readonly theme: MermaidTheme;
  readonly fallback: ReactNode;
}) {
  const reactId = useId();
  const cacheKey = mermaidRenderCacheKey(props.source, props.theme);
  const [state, setState] = useState<RenderState>(() => {
    const cached = renderedDiagramCache.get(cacheKey);
    return cached ? { cacheKey, status: "ready", svg: cached } : { cacheKey, status: "loading" };
  });

  useEffect(() => {
    const cached = renderedDiagramCache.get(cacheKey);
    if (cached) {
      setState({ cacheKey, status: "ready", svg: cached });
      return;
    }
    if (!canRenderMermaidSource(props.source)) {
      setState({ cacheKey, status: "error" });
      return;
    }

    let cancelled = false;
    setState({ cacheKey, status: "loading" });
    void requestMermaidRender(
      props.source,
      props.theme,
      `pulse-mermaid-${reactId.replaceAll(":", "")}`,
      cacheKey,
    )
      .then((svg) => {
        renderedDiagramCache.set(cacheKey, svg, Math.max(svg.length * 2, props.source.length));
        if (cancelled) return;
        setState({ cacheKey, status: "ready", svg });
      })
      .catch(() => {
        if (!cancelled) setState({ cacheKey, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, props.source, props.theme, reactId]);

  if (state.cacheKey === cacheKey && state.status === "error") {
    return (
      <div>
        <p className="px-3 pt-2 text-xs text-destructive">Diagram could not be rendered.</p>
        {props.fallback}
      </div>
    );
  }
  if (state.cacheKey !== cacheKey || state.status !== "ready") {
    return <div className="h-28 bg-muted/20" role="status" aria-label="Rendering diagram" />;
  }
  return (
    <div
      role="img"
      aria-label="Mermaid diagram"
      className="overflow-x-auto bg-[radial-gradient(circle,var(--border)_0.75px,transparent_0.75px)] bg-[size:16px_16px] p-4 [&_svg]:mx-auto [&_svg]:max-w-none"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
