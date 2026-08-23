import { scaledTypographyLineHeight } from "../../lib/appearancePreferences";
import type { ThreadFeedActivity } from "../../lib/threadActivity";
import { MOBILE_TYPOGRAPHY } from "../../lib/typography";

/**
 * Pre-measurement for the feed's `getFixedItemSize`. Kept free of React Native
 * imports so the arithmetic is testable on its own — a wrong height here shows
 * up as a visible jump when the row mounts, which is exactly the class of
 * regression that is cheap to catch in a test and expensive to notice by eye.
 *
 * Values mirror the classNames in `thread-work-log.tsx` — keep them in sync.
 */

// Tool-like activities with a neutral status carry no signal worth a row.
// Fleet rows are exempt: an in-flight fleet looks exactly like a neutral tool
// row, and dropping it is how subagents went invisible on mobile.
export function visibleWorkLogActivities(
  activities: ReadonlyArray<ThreadFeedActivity>,
): ReadonlyArray<ThreadFeedActivity> {
  return activities.filter(
    (activity) =>
      activity.agentSpawn !== undefined || !(activity.toolLike && activity.status === "neutral"),
  );
}

// Collapsed work-log rows are single-line (numberOfLines={1}) inside a
// min-height that stays taller than the text at every supported base font size
// (text-xs reaches 23px at the 22pt maximum, under the 32px min-h-8), so row
// height is deterministic. The "work log" label has no such clamp — its height
// follows the scaled text-2xs line height.
const WORK_ROW_HEIGHT = 32; // min-h-8
const WORK_ROW_GAP = 1; // gap-px
const WORK_LOG_HEADER_PADDING = 2; // pb-0.5 under the "work log" label
const WORK_LOG_BOTTOM_MARGIN = 4; // mb-1

export const WORK_GROUP_TOGGLE_HEIGHT = 36; // min-h-8 (32) + mb-1 (4)

/**
 * Named agents shown inline before the card defers to the Agents screen. Three
 * covers the overwhelmingly common fleet size, and the card is the tallest
 * thing in the work log — every extra slot is feed real estate on a phone.
 */
export const MAX_FLEET_CARD_CHIPS = 3;

const FLEET_CARD_HEADER_HEIGHT = 32; // min-h-8
const FLEET_CARD_CHIP_HEIGHT = 32; // min-h-8
const FLEET_CARD_CHIP_GAP = 1; // gap-px
const FLEET_CARD_VERTICAL_PADDING = 8; // py-1
const FLEET_CARD_BORDER = 2; // border, top + bottom

type AgentSpawn = NonNullable<ThreadFeedActivity["agentSpawn"]>;

/**
 * How many rows the card renders under its header.
 *
 * Read from the spawn group rather than the live agent panel model on purpose:
 * measurement runs without the model, so deriving the count from anything else
 * would let the rendered card disagree with its reserved height. A workflow's
 * `agentTaskIds` includes the coordinator, which is the header, not a chip.
 * Floors at one so a fleet that has only just spawned still renders a slot
 * instead of a bare header.
 */
export function fleetCardMemberCount(spawn: AgentSpawn): number {
  return Math.max(spawn.agentTaskIds.length - (spawn.workflowId ? 1 : 0), 1);
}

export function fleetCardSlotCount(spawn: AgentSpawn): number {
  return Math.min(fleetCardMemberCount(spawn), MAX_FLEET_CARD_CHIPS);
}

export function fleetCardHeight(spawn: AgentSpawn): number {
  const slots = fleetCardSlotCount(spawn);
  return (
    FLEET_CARD_BORDER +
    FLEET_CARD_VERTICAL_PADDING +
    FLEET_CARD_HEADER_HEIGHT +
    slots * FLEET_CARD_CHIP_HEIGHT +
    (slots - 1) * FLEET_CARD_CHIP_GAP
  );
}

export function collapsedWorkLogHeight(
  activities: ReadonlyArray<ThreadFeedActivity>,
  baseFontSize: number,
): number {
  const rows = visibleWorkLogActivities(activities);
  if (rows.length === 0) {
    return 0;
  }
  const onlyToolRows = rows.every((row) => row.toolLike);
  const headerHeight =
    scaledTypographyLineHeight(MOBILE_TYPOGRAPHY.caption, baseFontSize) + WORK_LOG_HEADER_PADDING;
  const rowsHeight = rows.reduce(
    (total, row) => total + (row.agentSpawn ? fleetCardHeight(row.agentSpawn) : WORK_ROW_HEIGHT),
    0,
  );
  return (
    WORK_LOG_BOTTOM_MARGIN +
    (onlyToolRows ? 0 : headerHeight) +
    rowsHeight +
    (rows.length - 1) * WORK_ROW_GAP
  );
}
