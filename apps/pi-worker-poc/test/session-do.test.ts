import test from "node:test";
import assert from "node:assert/strict";

import { SessionDurableObject } from "../src/durable/session-do.ts";

function createFakeState() {
  const storage = new Map<string, unknown>();
  return {
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      }
    }
  };
}

test("SessionDurableObject initializes Pi SDK diagnostics", async () => {
  const obj = new SessionDurableObject(createFakeState() as never, {} as never);
  const state = await obj.initialize("session-test");

  assert.equal(state.initialized, true);
  assert.equal(state.sdkLoaded, true);
  assert.equal(state.piSessionCreated, true);
  assert.deepEqual(state.toolNames, ["travel_hello"]);
});

test("SessionDurableObject prompt uses a live Pi session and surfaces SDK errors", async () => {
  const obj = new SessionDurableObject(createFakeState() as never, {} as never);
  await obj.initialize("session-prompt");

  const result = await obj.prompt({ message: "hello from test" });

  assert.equal(result.ok, false);
  assert.equal(result.usedPiSdk, true);
  assert.equal(result.piSessionCreated, true);
  assert.equal(result.promptAttempted, true);
  assert.match(result.promptError ?? "", /No API key found|No models available/);
  assert.equal(result.messageCount, 0);
  assert.equal(result.lastMessage, "hello from test");
});
