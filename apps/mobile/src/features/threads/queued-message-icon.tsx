import { useThemeColor } from "../../lib/useThemeColor";
import { SymbolView } from "../../components/AppSymbol";

/** Outbox state is independent of the agent's status, so both stay visible. */
export function QueuedMessageIcon({ selected = false }: { readonly selected?: boolean }) {
  const tintColor = useThemeColor(
    selected ? "--color-user-bubble-foreground-muted" : "--color-foreground-muted",
  );
  return <SymbolView name="tray.and.arrow.up" size={12} tintColor={tintColor} type="monochrome" />;
}
