import { post } from "./client";
import type { AgentMode } from "../types/agent";

function sessionsBase(mode: AgentMode): string {
  return mode === "activity-workflow" ? "/api/activity-workflow/sessions" : "/api/sessions";
}

export async function syncChat(
  sessionId: string,
  message: string,
  mode = "prompt",
  agentMode: AgentMode = "agent"
): Promise<{ state: Record<string, unknown> }> {
  return post(`${sessionsBase(agentMode)}/${sessionId}/chat`, { message, mode });
}

export function chatStreamUrl(sessionId: string, mode: AgentMode = "agent"): string {
  return `${sessionsBase(mode)}/${sessionId}/chat/stream`;
}
