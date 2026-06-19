import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("create-session lazy-loads pi-coding-agent to keep Worker bundle safe", async () => {
  const source = await readFile(new URL("../src/pi/create-session.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /from\s+["']@earendil-works\/pi-coding-agent["']/);
  assert.match(source, /import\(["']@earendil-works\/pi-coding-agent["']\)/);
});
