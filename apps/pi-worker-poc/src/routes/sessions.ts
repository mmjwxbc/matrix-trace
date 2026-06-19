import type { Env } from "../env.ts";
import type { SessionRegistryEntry } from "../durable/session-registry-do.ts";
import { toLegacyAgentState, type PromptResult, type StoredSessionState } from "../lib/legacy-state.ts";
import type { PromptRequest } from "../lib/state.ts";

export function createSessionId(): string {
  return crypto.randomUUID().slice(0, 12);
}

export function getSessionStub(env: Env, sessionId: string) {
  if (!env.SESSION_DO) {
    throw new Error("Missing SESSION_DO binding");
  }
  return env.SESSION_DO.getByName(sessionId);
}

function getRegistryStub(env: Env) {
  if (!env.SESSION_REGISTRY_DO) {
    throw new Error("Missing SESSION_REGISTRY_DO binding");
  }
  return env.SESSION_REGISTRY_DO.getByName("global");
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

async function initializeSession(stub: { fetch(request: Request): Promise<Response> }, sessionId: string) {
  return readJson<StoredSessionState>(
    await stub.fetch(
      new Request("https://do/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId })
      })
    )
  );
}

async function getSessionState(stub: { fetch(request: Request): Promise<Response> }) {
  return readJson<StoredSessionState>(await stub.fetch(new Request("https://do/state")));
}

async function promptSession(stub: { fetch(request: Request): Promise<Response> }, body: PromptRequest) {
  return readJson<PromptResult>(
    await stub.fetch(
      new Request("https://do/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    )
  );
}

async function listRegistrySessions(stub: { fetch(request: Request): Promise<Response> }) {
  return readJson<SessionRegistryEntry[]>(await stub.fetch(new Request("https://do/list")));
}

async function upsertRegistrySession(stub: { fetch(request: Request): Promise<Response> }, entry: SessionRegistryEntry) {
  await readJson<{ ok: boolean }>(
    await stub.fetch(
      new Request("https://do/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry)
      })
    )
  );
}

async function deleteRegistrySession(stub: { fetch(request: Request): Promise<Response> }, sessionId: string) {
  const result = await readJson<{ deleted: boolean }>(
    await stub.fetch(
      new Request("https://do/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId })
      })
    )
  );
  return result.deleted;
}

async function hasRegistrySession(stub: { fetch(request: Request): Promise<Response> }, sessionId: string) {
  const result = await readJson<{ exists: boolean }>(
    await stub.fetch(new Request(`https://do/has?sessionId=${encodeURIComponent(sessionId)}`))
  );
  return result.exists;
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
  const state = await initializeSession(stub, sessionId);
  await upsertRegistrySession(getRegistryStub(env), toRegistryEntry(state));
  return Response.json({ session_id: sessionId });
}

export async function handleListSessions(env: Env): Promise<Response> {
  const sessions = await listRegistrySessions(getRegistryStub(env));
  return Response.json(sessions);
}

export async function handleGetSession(env: Env, sessionId: string): Promise<Response> {
  const exists = await hasRegistrySession(getRegistryStub(env), sessionId);
  if (!exists) {
    return Response.json({ detail: "Session not found" }, { status: 404 });
  }
  const stub = getSessionStub(env, sessionId);
  const state = await getSessionState(stub);
  return Response.json({
    session_id: state.sessionId,
    created_at: state.createdAt,
    last_active: state.lastActive,
    state: toLegacyAgentState(state)
  });
}

export async function handlePrompt(env: Env, sessionId: string, body: PromptRequest): Promise<Response> {
  const exists = await hasRegistrySession(getRegistryStub(env), sessionId);
  if (!exists) {
    return Response.json({ detail: "Session not found" }, { status: 404 });
  }
  const stub = getSessionStub(env, sessionId);
  const result = await promptSession(stub, body);
  const state = await getSessionState(stub);
  await upsertRegistrySession(getRegistryStub(env), toRegistryEntry(state));
  return Response.json({
    state: toLegacyAgentState(state, result)
  });
}

export async function handleDeleteSession(env: Env, sessionId: string): Promise<Response> {
  const deleted = await deleteRegistrySession(getRegistryStub(env), sessionId);
  if (!deleted) {
    return Response.json({ detail: "Session not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
