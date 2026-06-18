import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.ts";
import { SessionDurableObject } from "../src/durable/session-do.ts";
import { SessionRegistryDurableObject } from "../src/durable/session-registry-do.ts";

function createEnv() {
  const sessions = new Map<string, SessionDurableObject>();
  const registries = new Map<string, SessionRegistryDurableObject>();
  return {
    SESSION_DO: {
      getByName(name: string) {
        if (!sessions.has(name)) {
          const storage = new Map<string, unknown>();
          sessions.set(
            name,
            new SessionDurableObject({
              storage: {
                get: async (key: string) => storage.get(key),
                put: async (key: string, value: unknown) => {
                  storage.set(key, value);
                }
              }
            } as never, {} as never)
          );
        }
        return sessions.get(name) as SessionDurableObject;
      }
    },
    SESSION_REGISTRY_DO: {
      getByName(name: string) {
        if (!registries.has(name)) {
          const storage = new Map<string, unknown>();
          registries.set(
            name,
            new SessionRegistryDurableObject({
              storage: {
                get: async (key: string) => storage.get(key),
                put: async (key: string, value: unknown) => {
                  storage.set(key, value);
                }
              }
            } as never)
          );
        }
        return registries.get(name) as SessionRegistryDurableObject;
      }
    }
  };
}

test("worker creates and fetches a session", async () => {
  const env = createEnv();

  const createRes = await worker.fetch(new Request("https://example.com/api/sessions", { method: "POST" }), env as never);
  assert.equal(createRes.status, 200);
  const created = (await createRes.json()) as { session_id: string };
  assert.equal(typeof created.session_id, "string");

  const getRes = await worker.fetch(new Request(`https://example.com/api/sessions/${created.session_id}`), env as never);
  assert.equal(getRes.status, 200);
  const state = (await getRes.json()) as {
    session_id: string;
    created_at: number;
    last_active: number;
    state: Record<string, unknown> | null;
  };
  assert.equal(state.session_id, created.session_id);
  assert.equal(typeof state.created_at, "number");
  assert.equal(typeof state.last_active, "number");
  assert.equal(state.state?.status, "done");
});

test("worker lists and deletes sessions using the registry", async () => {
  const env = createEnv();

  const createRes = await worker.fetch(new Request("https://example.com/api/sessions", { method: "POST" }), env as never);
  const created = (await createRes.json()) as { session_id: string };

  const listRes = await worker.fetch(new Request("https://example.com/api/sessions"), env as never);
  assert.equal(listRes.status, 200);
  const sessions = (await listRes.json()) as Array<{ session_id: string; status: string }>;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.session_id, created.session_id);
  assert.equal(sessions[0]?.status, "idle");

  const deleteRes = await worker.fetch(
    new Request(`https://example.com/api/sessions/${created.session_id}`, { method: "DELETE" }),
    env as never
  );
  assert.equal(deleteRes.status, 200);
  const deleted = (await deleteRes.json()) as { ok: boolean };
  assert.equal(deleted.ok, true);

  const listAfterDeleteRes = await worker.fetch(new Request("https://example.com/api/sessions"), env as never);
  const sessionsAfterDelete = (await listAfterDeleteRes.json()) as Array<{ session_id: string }>;
  assert.equal(sessionsAfterDelete.length, 0);
});

test("worker prompt route uses the Pi session and returns prompt diagnostics", async () => {
  const env = createEnv();
  const createRes = await worker.fetch(new Request("https://example.com/api/sessions", { method: "POST" }), env as never);
  const created = (await createRes.json()) as { session_id: string };

  const promptRes = await worker.fetch(
    new Request(`https://example.com/api/sessions/${created.session_id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" })
    }),
    env as never
  );

  assert.equal(promptRes.status, 200);
  const payload = (await promptRes.json()) as {
    state: {
      raw_input: string;
      status: string;
      current_stage: string;
      turns: Array<{
        status: string;
        user_message: string | null;
        assistant_message: string | null;
      }>;
      errors: string[];
      runtime_context: Record<string, unknown>;
      conversation: {
        messages: Array<{ role: string; content?: unknown }>;
      };
      diagnostics: {
        used_pi_sdk: boolean;
        pi_session_created: boolean;
        prompt_attempted: boolean;
        prompt_error?: string;
      };
    };
  };
  assert.equal(payload.state.raw_input, "hello");
  assert.equal(payload.state.status, "failed");
  assert.equal(payload.state.current_stage, "failed");
  assert.equal(payload.state.diagnostics.used_pi_sdk, true);
  assert.equal(payload.state.diagnostics.pi_session_created, true);
  assert.equal(payload.state.diagnostics.prompt_attempted, true);
  assert.match(payload.state.diagnostics.prompt_error ?? "", /No API key found|No models available/);
  assert.equal(Array.isArray(payload.state.conversation.messages), true);
  assert.equal(payload.state.conversation.messages[0]?.role, "user");
  assert.equal(payload.state.conversation.messages[1]?.role, "assistant");
  assert.equal(payload.state.turns.length, 1);
  assert.equal(payload.state.turns[0]?.status, "failed");
  assert.equal(payload.state.turns[0]?.user_message, "hello");
  assert.match(payload.state.turns[0]?.assistant_message ?? "", /No API key found|No models available/);
  assert.equal(payload.state.errors.length, 1);
  assert.match(payload.state.errors[0] ?? "", /No API key found|No models available/);
});

test("worker stream route emits Pi prompt diagnostics over SSE", async () => {
  const env = createEnv();
  const createRes = await worker.fetch(new Request("https://example.com/api/sessions", { method: "POST" }), env as never);
  const created = (await createRes.json()) as { session_id: string };
  const res = await worker.fetch(
    new Request(`https://example.com/api/sessions/${created.session_id}/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "stream hello" })
    }),
    env as never
  );

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const text = await res.text();
  assert.match(text, /event: agent:start/);
  assert.match(text, /event: agent:end/);
  assert.match(text, /stream hello/);
  assert.match(text, /No API key found|No models available/);
  assert.match(text, /final_state/);
});
