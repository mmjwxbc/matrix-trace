import test from "node:test";
import assert from "node:assert/strict";

import { probePiSdk, probePiSessionCreation } from "../src/pi/create-session.ts";

test("Pi SDK loads from the PoC package", async () => {
  const result = await probePiSdk();
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.exportKeys), true);
  assert.equal((result.exportKeys?.length ?? 0) > 0, true);
});

test("Pi SDK can create an in-memory session without model credentials", async () => {
  const result = await probePiSessionCreation(process.cwd());
  assert.equal(result.ok, true);
  assert.equal(typeof result.sessionId, "string");
  assert.equal((result.sessionId?.length ?? 0) > 0, true);
  assert.equal(result.fallback == null || typeof result.fallback === "string", true);
});
