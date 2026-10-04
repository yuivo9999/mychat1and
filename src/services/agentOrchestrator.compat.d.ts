import type { AgentResearchState, AgentTaskPlan } from './agentOrchestrator';

declare module './agentOrchestrator' {
  export function buildAgentTaskPlanPrompt(goal: string, research?: AgentResearchState): string;
  export function parseAgentTaskPlan(
    text: string,
    fallbackGoal: string,
    research?: AgentResearchState,
  ): AgentTaskPlan | null;
}

export {};
