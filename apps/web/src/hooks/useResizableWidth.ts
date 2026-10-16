import * as Schema from "effect/Schema";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";
import { useResizeDrag } from "./useResizeDrag";

const WidthSchema = Schema.Finite;
const decodeWidth = Schema.decodeSync(Schema.fromJsonString(WidthSchema));
const encodeWidth = Schema.encodeSync(Schema.fromJsonString(WidthSchema));

export interface UseResizableWidthOptions {
  /** localStorage key the persisted width is stored under. */
  readonly storageKey: string;
  /** Keep this object referentially stable; replace it only when switching storage sessions. */
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  /**
   * Which edge of the host element carries the drag handle:
   *   - "left"  → panel grows leftward (right-anchored panels)
   *   - "right" → panel grows rightward (left-anchored panels)
   */
  readonly edge: "left" | "right";
}

export interface ResizableWidthHandlers {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Width state for a side-anchored panel resized via a drag handle on the
 * specified edge. Width is read on mount or storage-key changes and persisted on
 * drag-end to avoid roughly 60 writes per second during a drag.
 *
 * The hook updates an internal `width` state during drag (so the panel
 * follows the cursor live) and only commits to localStorage when the user
 * lifts the pointer or the drag is interrupted.
 */
export function useResizableWidth(options: UseResizableWidthOptions): {
  readonly width: number;
  readonly setWidth: (value: number) => void;
  readonly handlers: ResizableWidthHandlers;
} {
  const { storageKey, defaultWidth, minWidth, maxWidth, edge, storage } = options;

  const clamp = useCallback(
    (value: number): number => {
      if (!Number.isFinite(value)) return defaultWidth;
      return Math.max(minWidth, Math.min(maxWidth, value));
    },
    [defaultWidth, maxWidth, minWidth],
  );

  // No cross-tab subscription: panel width is per-window state.
  const readWidth = () => {
    if (!storage && typeof window === "undefined") return null;
    try {
      const raw = storage?.getItem(storageKey);
      const stored = storage
        ? raw == null
          ? null
          : decodeWidth(raw)
        : getLocalStorageItem(storageKey, WidthSchema);
      return stored === null ? null : clamp(stored);
    } catch (error) {
      console.error("Could not read persisted panel width.", error);
      return null;
    }
  };
  const [widthState, setWidthState] = useState(() => ({
    storageKey,
    storage,
    generation: 0,
    width: readWidth(),
  }));
  // Panels stay mounted across threads; restore the destination width before paint.
  if (widthState.storageKey !== storageKey || widthState.storage !== storage) {
    setWidthState({
      storageKey,
      storage,
      generation: widthState.generation + 1,
      width: readWidth(),
    });
  }

  const clampedWidth = clamp(widthState.width ?? defaultWidth);
  const latestOptions = useRef({ clamp, storageKey, storage });
  useLayoutEffect(() => {
    latestOptions.current = { clamp, storageKey, storage };
  }, [clamp, storageKey, storage]);

  const handlers = useResizeDrag<HTMLElement>(
    () => ({
      width: clampedWidth,
      edge,
      resize(value) {
        const nextWidth = latestOptions.current.clamp(value);
        setWidthState((current) => ({ ...current, width: nextWidth }));
        return nextWidth;
      },
      finish(finalWidth) {
        // Commit once at drag-end to avoid 60Hz localStorage writes.
        try {
          persistWidth(latestOptions.current.storageKey, finalWidth, latestOptions.current.storage);
        } catch (error) {
          console.error("Could not persist panel width.", error);
        }
      },
    }),
    `${storageKey}:${widthState.generation}`,
  );

  return {
    width: clampedWidth,
    handlers,
    setWidth: (value) => {
      const next = clamp(value);
      setWidthState((current) => ({ ...current, width: next }));
      persistWidth(storageKey, next, storage);
    },
  };
}

function persistWidth(key: string, width: number, storage?: Pick<Storage, "getItem" | "setItem">) {
  if (storage) storage.setItem(key, encodeWidth(width));
  else setLocalStorageItem(key, width, WidthSchema);
}
