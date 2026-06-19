import test from "node:test";
import assert from "node:assert/strict";

import { createPiSessionConfig, createPiRuntimeOptionsFromEnv, probePiSessionCreation } from "../src/pi/create-session.ts";

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

test("probePiSessionCreation accepts custom-openai with custom model id", async () => {
  const result = await probePiSessionCreation("/virtual/project", {
    OPENAI_BASE_URL: "https://api.deepseek.example/v1",
    PI_MODEL_PROVIDER: "custom-openai",
    PI_MODEL_ID: "deepseek-chat"
  });

  assert.equal(result.ok, true);
  assert.equal(typeof result.sessionId, "string");
  assert.equal(result.modelApi, "openai-completions");
  assert.equal(result.modelProvider, "deepseek");
  assert.equal(result.modelBaseUrl, "https://api.deepseek.example/v1");
});

test("probePiSessionCreation normalizes custom-openai endpoint urls", async () => {
  const result = await probePiSessionCreation("/virtual/project", {
    OPENAI_BASE_URL: " https://api.deepseek.com/v1/chat/completions/ ",
    PI_MODEL_PROVIDER: "custom-openai",
    PI_MODEL_ID: "deepseek-chat"
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelApi, "openai-completions");
  assert.equal(result.modelBaseUrl, "https://api.deepseek.com/v1");
});

test("probePiSessionCreation reports missing base url for custom-openai", async () => {
  const result = await probePiSessionCreation("/virtual/project", {
    PI_MODEL_PROVIDER: "custom-openai",
    PI_MODEL_ID: "deepseek-chat"
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Missing OPENAI_BASE_URL/);
});

test("probePiSessionCreation reports invalid provider or model config instead of crashing", async () => {
  const result = await probePiSessionCreation("/virtual/project", {
    PI_MODEL_PROVIDER: "not-a-provider",
    PI_MODEL_ID: "not-a-model"
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Unknown PI model configuration/);
});
