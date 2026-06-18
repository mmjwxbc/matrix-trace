import test from "node:test";
import assert from "node:assert/strict";

import { createPiSessionConfig, createPiRuntimeOptionsFromEnv } from "../src/pi/create-session.ts";

test("createPiSessionConfig uses travel prompt and tool names", async () => {
  const config = await createPiSessionConfig("/virtual/project");
  assert.equal(config.cwd, "/virtual/project");
  assert.equal(config.toolNames.includes("travel_hello"), true);
  assert.match(config.systemPrompt, /旅游/);
});

test("createPiRuntimeOptionsFromEnv maps provider keys and base urls", () => {
  const options = createPiRuntimeOptionsFromEnv({
    OPENAI_API_KEY: "sk-openai",
    OPENAI_BASE_URL: "https://proxy.example.com/v1",
    ANTHROPIC_API_KEY: "sk-ant",
    ANTHROPIC_BASE_URL: "https://anthropic-proxy.example.com",
    PI_MODEL_PROVIDER: "openai",
    PI_MODEL_ID: "gpt-4.1"
  });

  assert.equal(options.auth.openai?.key, "sk-openai");
  assert.equal(options.auth.anthropic?.key, "sk-ant");
  assert.equal(options.providerOverrides.openai?.baseUrl, "https://proxy.example.com/v1");
  assert.equal(options.providerOverrides.anthropic?.baseUrl, "https://anthropic-proxy.example.com");
  assert.equal(options.modelSelection?.provider, "openai");
  assert.equal(options.modelSelection?.modelId, "gpt-4.1");
});
