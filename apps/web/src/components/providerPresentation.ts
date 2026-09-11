import { ProviderDriverKind } from "@t3tools/contracts";
import {
  ClaudeAI,
  CursorIcon,
  GrokIcon,
  type Icon,
  OpenAI,
  OpenCodeIcon,
  PiAgentIcon,
} from "./Icons";

export interface ProviderPresentation {
  readonly value: ProviderDriverKind;
  readonly label: string;
  readonly icon: Icon;
  readonly badgeLabel?: string;
}

export const PROVIDER_PRESENTATIONS: readonly ProviderPresentation[] = [
  {
    value: ProviderDriverKind.make("codex"),
    label: "Codex",
    icon: OpenAI,
  },
  {
    value: ProviderDriverKind.make("claudeAgent"),
    label: "Claude",
    icon: ClaudeAI,
  },
  {
    value: ProviderDriverKind.make("cursor"),
    label: "Cursor",
    icon: CursorIcon,
    badgeLabel: "Early Access",
  },
  {
    value: ProviderDriverKind.make("grok"),
    label: "Grok",
    icon: GrokIcon,
    badgeLabel: "Early Access",
  },
  {
    value: ProviderDriverKind.make("opencode"),
    label: "OpenCode",
    icon: OpenCodeIcon,
  },
  {
    value: ProviderDriverKind.make("omp"),
    label: "Oh My Pi",
    icon: PiAgentIcon,
    badgeLabel: "Early Access",
  },
];

export const PROVIDER_ICON_BY_PROVIDER: Partial<Record<ProviderDriverKind, Icon>> =
  Object.fromEntries(PROVIDER_PRESENTATIONS.map(({ value, icon }) => [value, icon]));
