import { Image } from "expo-image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import {
  decodeMermaidRendererMessage,
  MOBILE_MERMAID_RENDERER_VERSION,
  type MermaidPng,
} from "./mobileMermaidMessages";
import { CopyTextButton } from "../../components/CopyTextButton";

const MAX_SOURCE_LENGTH = 50_000;
const RENDER_TIMEOUT_MS = 12_000;
const MAX_CACHE_BYTES = 12 * 1024 * 1024;
const cache = new Map<string, MermaidPng>();
const pendingResults = new Map<string, Promise<MermaidPng>>();
let cacheBytes = 0;
let nextRequestId = 0;

type RenderJob = {
  readonly id: string;
  readonly source: string;
  readonly theme: "light" | "dark";
  readonly resolve: (value: MermaidPng) => void;
  readonly reject: () => void;
};

type RenderMermaid = (source: string, theme: "light" | "dark") => Promise<MermaidPng>;
const RendererContext = createContext<RenderMermaid | null>(null);

function requestCachedPng(
  cacheKey: string,
  render: RenderMermaid,
  source: string,
  theme: "light" | "dark",
): Promise<MermaidPng> {
  const cached = cache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  const pending = pendingResults.get(cacheKey);
  if (pending) return pending;
  const request = render(source, theme)
    .then((next) => {
      cache.set(cacheKey, next);
      cacheBytes += next.bytes;
      while (cacheBytes > MAX_CACHE_BYTES && cache.size > 1) {
        const oldestKey = cache.keys().next().value as string;
        const oldest = cache.get(oldestKey);
        cache.delete(oldestKey);
        cacheBytes -= oldest?.bytes ?? 0;
      }
      return next;
    })
    .finally(() => pendingResults.delete(cacheKey));
  pendingResults.set(cacheKey, request);
  return request;
}

export function MobileMermaidRendererProvider(props: {
  readonly rendererUrl: string | null;
  readonly children: ReactNode;
}) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const availableRef = useRef(Boolean(props.rendererUrl));
  const activeRef = useRef<RenderJob | null>(null);
  const queueRef = useRef<RenderJob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runNext = useCallback(() => {
    if (!readyRef.current || activeRef.current || !webViewRef.current) return;
    const job = queueRef.current.shift();
    if (!job) return;
    activeRef.current = job;
    const payload = JSON.stringify({ id: job.id, source: job.source, theme: job.theme });
    webViewRef.current.injectJavaScript(
      `window.dispatchEvent(new MessageEvent("message", { data: ${JSON.stringify(payload)} })); true;`,
    );
    timeoutRef.current = setTimeout(() => {
      if (activeRef.current?.id !== job.id) return;
      job.reject();
      activeRef.current = null;
      readyRef.current = false;
      webViewRef.current?.reload();
    }, RENDER_TIMEOUT_MS);
  }, []);

  const render = useCallback<RenderMermaid>(
    (source, theme) =>
      new Promise<MermaidPng>((resolve, reject) => {
        if (!props.rendererUrl || !availableRef.current) {
          reject(new Error("Mermaid renderer unavailable"));
          return;
        }
        queueRef.current.push({
          id: `diagram-${++nextRequestId}`,
          source,
          theme,
          resolve,
          reject: () => reject(new Error("Mermaid rendering failed")),
        });
        runNext();
      }),
    [props.rendererUrl, runNext],
  );

  const failAll = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = null;
    readyRef.current = false;
    availableRef.current = false;
    activeRef.current?.reject();
    activeRef.current = null;
    for (const job of queueRef.current.splice(0)) job.reject();
  }, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    const decoded = decodeMermaidRendererMessage(event.nativeEvent.data);
    if (!decoded) return;
    if (decoded.type === "ready") {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
      availableRef.current = true;
      readyRef.current = true;
      runNext();
      return;
    }
    const job = activeRef.current;
    if (!job) return;
    if (decoded.id !== job.id || !decoded.result) {
      job.reject();
    } else {
      job.resolve(decoded.result);
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    activeRef.current = null;
    runNext();
  };

  useEffect(() => {
    availableRef.current = Boolean(props.rendererUrl);
    readyRef.current = false;
    if (props.rendererUrl) {
      loadTimeoutRef.current = setTimeout(failAll, RENDER_TIMEOUT_MS);
    }
    return failAll;
  }, [failAll, props.rendererUrl]);

  return (
    <RendererContext value={render}>
      {props.children}
      {props.rendererUrl ? (
        <WebView
          ref={webViewRef}
          source={{ uri: props.rendererUrl }}
          originWhitelist={[`${new URL(props.rendererUrl).origin}/*`]}
          javaScriptEnabled
          onError={failAll}
          onMessage={handleMessage}
          onLoadStart={() => {
            availableRef.current = true;
            readyRef.current = false;
            if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = setTimeout(failAll, RENDER_TIMEOUT_MS);
          }}
          onHttpError={failAll}
          onContentProcessDidTerminate={failAll}
          onShouldStartLoadWithRequest={(request) => request.url === props.rendererUrl}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        />
      ) : null}
    </RendererContext>
  );
}

export function MobileMermaidDiagram(props: {
  readonly source: string;
  readonly theme: "light" | "dark";
  readonly fallback: ReactNode;
}) {
  const render = useContext(RendererContext);
  const [containerWidth, setContainerWidth] = useState(0);
  const cacheKey = `${MOBILE_MERMAID_RENDERER_VERSION}:${props.theme}:${props.source}`;
  const [result, setResult] = useState(() => cache.get(cacheKey) ?? null);
  const [failed, setFailed] = useState(
    !render || !props.source.trim() || props.source.length > MAX_SOURCE_LENGTH,
  );

  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached) {
      setResult(cached);
      setFailed(false);
      return;
    }
    setResult(null);
    if (!render || !props.source.trim() || props.source.length > MAX_SOURCE_LENGTH) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void requestCachedPng(cacheKey, render, props.source, props.theme)
      .then((next) => {
        if (cancelled) return;
        setResult(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, props.source, props.theme, render]);

  if (failed)
    return (
      <View>
        <Text className="text-xs text-destructive">Diagram could not be rendered.</Text>
        {props.fallback}
      </View>
    );
  const availableWidth = Math.max(1, containerWidth || 1);
  const displayedWidth = result ? Math.min(availableWidth, result.width) : availableWidth;
  const displayedHeight = result ? displayedWidth * (result.height / result.width) : 112;
  return (
    <View
      className="my-3 overflow-hidden rounded-lg border border-border bg-card"
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <View className="flex-row items-center justify-between border-b border-border px-3 py-1">
        <Text className="font-mono text-xs text-foreground-muted">Mermaid</Text>
        <CopyTextButton
          accessibilityLabel="Copy Mermaid source"
          text={props.source}
          tintColor="#737373"
          buttonSize={28}
          iconSize={14}
        />
      </View>
      {result ? (
        <View className="items-center p-3">
          <Image
            source={{ uri: result.uri }}
            style={{ width: displayedWidth, height: displayedHeight }}
            contentFit="contain"
            accessibilityLabel="Mermaid diagram"
          />
        </View>
      ) : (
        <View style={{ height: displayedHeight }} accessibilityLabel="Rendering diagram" />
      )}
    </View>
  );
}
