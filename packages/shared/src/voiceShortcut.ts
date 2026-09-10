/** Parses device-local voice shortcuts, including Windows modifier-only chords. */
export function parseVoiceShortcut(value: string) {
  const aliases: Record<string, string> = {
    control: "ctrl",
    windows: "meta",
    win: "meta",
    super: "meta",
    cmd: "meta",
  };
  const tokens = value
    .toLowerCase()
    .split("+")
    .map((part) => aliases[part.trim()] ?? part.trim());
  if (tokens.length < 2 || new Set(tokens).size !== tokens.length) return null;
  const modifiers = new Set(["ctrl", "shift", "alt", "meta"]);
  const keys = tokens.filter((token) => !modifiers.has(token));
  if (keys.length > 1 || !tokens.some((token) => ["ctrl", "alt", "meta"].includes(token)))
    return null;
  const key = keys[0] ?? null;
  if (key !== null && !/^(space|[a-z0-9]|f([1-9]|1[0-9]|2[0-4]))$/.test(key)) return null;
  return {
    key,
    ctrlKey: tokens.includes("ctrl"),
    shiftKey: tokens.includes("shift"),
    altKey: tokens.includes("alt"),
    metaKey: tokens.includes("meta"),
  };
}

export function matchesVoiceShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">,
  value: string,
) {
  const shortcut = parseVoiceShortcut(value);
  if (
    !shortcut ||
    event.ctrlKey !== shortcut.ctrlKey ||
    event.shiftKey !== shortcut.shiftKey ||
    event.altKey !== shortcut.altKey ||
    event.metaKey !== shortcut.metaKey
  )
    return false;
  return shortcut.key === null
    ? ["Control", "Shift", "Alt", "Meta"].includes(event.key)
    : event.key.toLowerCase() === (shortcut.key === "space" ? " " : shortcut.key);
}
