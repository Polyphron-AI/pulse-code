import {
  AssetResource,
  type AssetCreateUrlResult,
  type EnvironmentId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

const SavedPreview = Schema.Struct({
  key: Schema.String,
  resource: AssetResource,
  fileSuffix: Schema.String,
});
const SavedPreviews = Schema.Array(SavedPreview);
const STORAGE_KEY = "pulse:saved-output-previews:v1";
const keyFor = (ref: ScopedThreadRef, tabId: string) =>
  JSON.stringify([ref.environmentId, ref.threadId, tabId]);
const read = () => {
  try {
    return getLocalStorageItem(STORAGE_KEY, SavedPreviews) ?? [];
  } catch {
    return [];
  }
};
const assetSuffix = (url: string) => {
  try {
    return /^\/api\/assets\/[^/]+(\/.*)$/.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
};

export function forgetSavedOutputPreview(ref: ScopedThreadRef, tabId: string): void {
  const entries = read();
  const remaining = entries.filter((entry) => entry.key !== keyFor(ref, tabId));
  if (remaining.length !== entries.length)
    setLocalStorageItem(STORAGE_KEY, remaining, SavedPreviews);
}

export function rememberSavedOutputPreview(
  ref: ScopedThreadRef,
  tabId: string,
  resource: AssetResource,
  url: string,
): void {
  const fileSuffix = assetSuffix(url);
  if (resource._tag !== "session-output" || !fileSuffix) return;
  const key = keyFor(ref, tabId);
  setLocalStorageItem(
    STORAGE_KEY,
    [{ key, resource, fileSuffix }, ...read().filter((entry) => entry.key !== key)].slice(0, 100),
    SavedPreviews,
  );
}

export function readSavedOutputPreview(
  ref: ScopedThreadRef,
  tabId: string,
  url: string,
): AssetResource | null {
  const entry = read().find((candidate) => candidate.key === keyFor(ref, tabId));
  if (!entry) return null;
  if (assetSuffix(url) !== entry.fileSuffix) {
    forgetSavedOutputPreview(ref, tabId);
    return null;
  }
  return entry.resource;
}

/** Refresh transport credentials from the stable output reference before navigation. */
export async function resolveSavedOutputPreviewUrl<E>(input: {
  threadRef: ScopedThreadRef;
  tabId: string;
  url: string;
  httpBaseUrl: string | null;
  createAssetUrl: (input: {
    environmentId: EnvironmentId;
    input: { resource: AssetResource };
  }) => Promise<AtomCommandResult<AssetCreateUrlResult, E>>;
}): Promise<string | null> {
  const resource = readSavedOutputPreview(input.threadRef, input.tabId, input.url);
  if (!resource) return null;
  if (!input.httpBaseUrl)
    throw new Error("Reconnect to the output's environment to reopen this file.");
  const result = await input.createAssetUrl({
    environmentId: input.threadRef.environmentId,
    input: { resource },
  });
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return new URL(result.value.relativeUrl, input.httpBaseUrl).href;
}
