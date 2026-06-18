import test from "node:test";
import assert from "node:assert/strict";

import { createTravelHelloTool } from "../src/tools/travel-hello.ts";

test("travel hello tool returns a deterministic message", async () => {
  const tool = createTravelHelloTool();
  const result = await tool.execute("call-1", { city: "Shenzhen" });
  assert.equal(result.content[0]?.type, "text");
  assert.match(result.content[0]?.text ?? "", /Shenzhen/);
});
