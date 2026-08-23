import { createContext, use, useMemo, type ReactNode } from "react";

import {
  emptyAgentPanelModel,
  type AgentPanelModel,
} from "@t3tools/client-runtime/state/subagentRuntime";

interface AgentFleetContextValue {
  readonly agentPanelModel: AgentPanelModel;
  readonly onOpenAgents: () => void;
  readonly onOpenAgent: (agentId: string) => void;
}

const EMPTY_FLEET_CONTEXT: AgentFleetContextValue = {
  agentPanelModel: emptyAgentPanelModel(),
  onOpenAgents: () => {},
  onOpenAgent: () => {},
};

/**
 * Live agent state for the inline fleet row, delivered by context rather than
 * props: the model changes on every token tick, and threading it through the
 * feed's memoized rows would re-render the whole conversation each time. Only
 * fleet rows subscribe.
 */
const AgentFleetCtx = createContext<AgentFleetContextValue>(EMPTY_FLEET_CONTEXT);

export function AgentFleetProvider(props: {
  readonly agentPanelModel: AgentPanelModel;
  readonly onOpenAgents: () => void;
  readonly onOpenAgent: (agentId: string) => void;
  readonly children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      agentPanelModel: props.agentPanelModel,
      onOpenAgents: props.onOpenAgents,
      onOpenAgent: props.onOpenAgent,
    }),
    [props.agentPanelModel, props.onOpenAgent, props.onOpenAgents],
  );
  return <AgentFleetCtx.Provider value={value}>{props.children}</AgentFleetCtx.Provider>;
}

export function useAgentFleetContext(): AgentFleetContextValue {
  return use(AgentFleetCtx);
}
