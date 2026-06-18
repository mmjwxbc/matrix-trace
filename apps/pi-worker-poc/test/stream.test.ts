import test from "node:test";
import assert from "node:assert/strict";

import { formatSseEvent } from "../src/lib/events.ts";

test("formatSseEvent formats named sse payloads", () => {
  const payload = formatSseEvent({ type: "message_update", data: { delta: "hi" } });
  assert.match(payload, /event: message_update/);
  assert.match(payload, /"delta":"hi"/);
});
