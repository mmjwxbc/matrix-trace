import test from "node:test";
import assert from "node:assert/strict";

import pkg from "../package.json" with { type: "json" };

test("worker package metadata loads", () => {
  assert.equal(pkg.name, "@matrix-trace/pi-worker-poc");
});
