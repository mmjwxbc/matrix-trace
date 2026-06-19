import { del, get, post } from "./client";
import type { AgentMode, SessionDetail, SessionPreview } from "../types/agent";

function sessionsBase(mode: AgentMode): string {
  return mode === "activity-workflow" ? "/api/activity-workflow/sessions" : "/api/sessions";
}

export async function createSession(mode: AgentMode = "agent"): Promise<{ session_id: string }> {
  return post<{ session_id: string }>(sessionsBase(mode));
}

export async function listSessions(mode: AgentMode = "agent"): Promise<SessionPreview[]> {
  return get<SessionPreview[]>(sessionsBase(mode));
}

export async function getSession(sessionId: string, mode: AgentMode = "agent"): Promise<SessionDetail> {
  return get<SessionDetail>(`${sessionsBase(mode)}/${sessionId}`);
}

export async function deleteSession(sessionId: string, mode: AgentMode = "agent"): Promise<void> {
  return del(`${sessionsBase(mode)}/${sessionId}`);
}
