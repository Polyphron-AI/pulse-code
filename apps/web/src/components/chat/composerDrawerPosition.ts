/** Position an attached drawer against the composer rather than the caret. */
export function composerDrawerPosition(input: {
  top: number;
  left: number;
  width: number;
  viewportHeight: number;
  rootFontSize: number;
  insetRem: number;
}) {
  const inset = input.insetRem * input.rootFontSize;
  const overlap = input.rootFontSize + 1;
  return {
    bottom: input.viewportHeight - input.top - overlap,
    left: input.left + inset,
    width: Math.max(0, input.width - inset * 2),
    maxHeight: Math.max(96, input.top - 24 + overlap),
  };
}
