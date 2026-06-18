import type { Env } from "../env.ts";
import type { SessionRegistryEntry } from "../durable/session-registry-do.ts";
import { toLegacyAgentState, type PromptResult, type StoredSessionState } from "../lib/legacy-state.ts";
import type { PromptRequest } from "../lib/state.ts";

export function createSessionId(): string {
  return crypto.randomUUID().slice(0, 12);
}

export function getSessionStub(env: Env, sessionId: string) {
  return env.SESSION_DO.getByName(sessionId);
}

function getRegistryStub(env: Env) {
  return env.SESSION_REGISTRY_DO.getByName("global");
}

function toRegistryEntry(state: StoredSessionState): SessionRegistryEntry {
  return {
    session_id: state.sessionId,
    created_at: state.createdAt,
    last_active: state.lastActive,
    status: state.status,
    raw_input: state.lastMessage
  };
}

export async function handleCreateSession(env: Env): Promise<Response> {
  const sessionId = createSessionId();
  const stub = getSessionStub(env, sessionId);
  const state = (await stub.initialize(sessionId)) as StoredSessionState;
  await getRegistryStub(env).upsertSession(toRegistryEntry(state));
  return Response.json({ session_id: sessionId });
}

export async function handleListSessions(env: Env): Promise<Response> {
  const sessions = await getRegistryStub(env).listSessions();
  return Response.json(sessions);
}

export async function handleGetSession(env: Env, sessionId: string): Promise<Response> {
  const exists = await getRegistryStub(env).hasSession(sessionId);
  if (!exists) {
    return Response.json({ detail: "Session not found" }, { status: 404 });
  }
  const stub = getSessionStub(env, sessionId);
  const state = (await stub.getState()) as StoredSessionState;
  return Response.json({
    session_id: state.sessionId,
    created_at: state.createdAt,
    last_active: state.lastActive,
    state: toLegacyAgentState(state)
  });
}

export async function handlePrompt(env: Env, sessionId: string, body: PromptRequest): Promise<Response> {
  const exists = await getRegistryStub(env).hasSession(sessionId);
  if (!exists) {
    return Response.json({ detail: "Session not found" }, { status: 404 });
  }
  const stub = getSessionStub(env, sessionId);
  const result = (await stub.prompt(body)) as PromptResult;
  const state = (await stub.getState()) as StoredSessionState;
  await getRegistryStub(env).upsertSession(toRegistryEntry(state));
  return Response.json({
    state: toLegacyAgentState(state, result)
  });
}

export async function handleDeleteSession(env: Env, sessionId: string): Promise<Response> {
  const deleted = await getRegistryStub(env).deleteSession(sessionId);
  if (!deleted) {
    return Response.json({ detail: "Session not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
