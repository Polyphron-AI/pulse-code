import type * as ServerConfig from "./config.ts";

export const browserApiCorsAllowedMethods = ["GET", "POST", "OPTIONS"] as const;
export const browserApiCorsAllowedHeaders = [
  "authorization",
  "b3",
  "traceparent",
  "content-type",
  "dpop",
] as const;

export const desktopRendererOrigins = ["t3code://app", "t3code-dev://app"] as const;

const normalizedOrigin = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    if (url.origin !== "null") return url.origin;
    return url.protocol === "t3code:" || url.protocol === "t3code-dev:"
      ? `${url.protocol}//${url.host}`
      : undefined;
  } catch {
    return undefined;
  }
};

export function isTrustedBrowserOrigin(
  origin: string,
  requestUrl: URL,
  config: Pick<ServerConfig.ServerConfig["Service"], "devUrl" | "devAllowedOrigins">,
): boolean {
  const candidate = normalizedOrigin(origin);
  if (candidate === undefined) return false;
  const trusted = [
    requestUrl.origin,
    ...(config.devUrl === undefined
      ? []
      : [config.devUrl.origin, ...config.devAllowedOrigins, ...desktopRendererOrigins]),
  ];
  return trusted.some((value) => value !== undefined && normalizedOrigin(value) === candidate);
}
