import { buildTravelSystemPrompt } from "./prompt-loader.ts";
import { createTravelHelloTool } from "../tools/travel-hello.ts";
import type { PiRuntimeEnv } from "../env.ts";
import { getModel, type Api, type Model } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

// Hardcoded agent dir avoids importing `getAgentDir` from pi-coding-agent's
// top-level re-exports, which would pull in `dist/config.js` and break the
// Workers bundle (config.js executes `fileURLToPath(import.meta.url)` at
// module top-level, and import.meta.url is undefined when esbuild inlines
// the module into the Worker).
const AGENT_DIR = "/tmp/pi-agent";

export interface PiSessionConfig {
  cwd: string;
  systemPrompt: string;
  toolNames: string[];
  customTools: ReturnType<typeof createTravelHelloTool>[];
}

export interface PiSdkProbeResult {
  ok: boolean;
  error?: string;
  exportKeys?: string[];
}

export interface PiSessionProbeResult {
  ok: boolean;
  error?: string;
  fallback?: string | null;
  sessionId?: string;
}

export interface LivePiSessionResult {
  session: {
    sessionId: string;
    prompt(text: string): Promise<void>;
    dispose(): void;
    getActiveToolNames(): string[];
    readonly messages: unknown[];
  };
  modelFallbackMessage?: string;
}

export interface PiRuntimeOptions {
  auth: Record<string, { type: "api_key"; key: string }>;
  providerOverrides: Record<string, { baseUrl: string }>;
  modelSelection?: {
    provider?: string;
    modelId?: string;
  };
}

export async function createPiSessionConfig(cwd: string): Promise<PiSessionConfig> {
  return {
    cwd,
    systemPrompt: buildTravelSystemPrompt(),
    toolNames: ["travel_hello"],
    customTools: [createTravelHelloTool()]
  };
}

export function formatPiError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function createPiRuntimeOptionsFromEnv(env: PiRuntimeEnv): PiRuntimeOptions {
  const auth: PiRuntimeOptions["auth"] = {};
  const providerOverrides: PiRuntimeOptions["providerOverrides"] = {};

  if (env.OPENAI_API_KEY) {
    auth.openai = { type: "api_key", key: env.OPENAI_API_KEY };
  }
  if (env.ANTHROPIC_API_KEY) {
    auth.anthropic = { type: "api_key", key: env.ANTHROPIC_API_KEY };
  }
  if (env.OPENAI_BASE_URL) {
    providerOverrides.openai = { baseUrl: env.OPENAI_BASE_URL };
  }
  if (env.ANTHROPIC_BASE_URL) {
    providerOverrides.anthropic = { baseUrl: env.ANTHROPIC_BASE_URL };
  }

  return {
    auth,
    providerOverrides,
    modelSelection: {
      provider: env.PI_MODEL_PROVIDER,
      modelId: env.PI_MODEL_ID
    }
  };
}

export async function probePiSdk(): Promise<PiSdkProbeResult> {
  try {
    return {
      ok: true,
      exportKeys: [
        "AuthStorage",
        "ModelRegistry",
        "SessionManager",
        "SettingsManager",
        "createAgentSession"
      ]
    };
  } catch (error) {
    return {
      ok: false,
      error: formatPiError(error)
    };
  }
}

function applyProviderOverrides(registry: ModelRegistry, overrides: PiRuntimeOptions["providerOverrides"]): void {
  for (const [providerName, override] of Object.entries(overrides)) {
    try {
      registry.registerProvider(providerName, override);
    } catch {
      // Built-in provider — override via setRuntimeApiKey + baseUrl on the model instead.
    }
  }
}

function resolveSelectedModel(
  registry: ModelRegistry,
  selection: PiRuntimeOptions["modelSelection"]
): Model<Api> | undefined {
  if (selection?.provider && selection.modelId) {
    const exact = registry.find(selection.provider, selection.modelId);
    if (exact) return exact;
  }
  if (selection?.provider) {
    const all = registry.getAll();
    const match = all.find((m) => m.provider === selection.provider);
    if (match) return match;
  }
  return registry.getAll()[0] ?? (getModel("anthropic", "claude-sonnet-4-5") as Model<Api> | undefined);
}

function applyRuntimeApiKeys(authStorage: AuthStorage, auth: PiRuntimeOptions["auth"]): void {
  for (const [provider, cred] of Object.entries(auth)) {
    if (cred.type === "api_key") {
      authStorage.setRuntimeApiKey(provider, cred.key);
    }
  }
}

export async function createLivePiSession(cwd: string, env: PiRuntimeEnv = {}): Promise<LivePiSessionResult> {
  const config = await createPiSessionConfig(cwd);
  const runtimeOptions = createPiRuntimeOptionsFromEnv(env);

  // Mirrors examples/sdk/12-full-control.ts:
  // - AuthStorage.inMemory() avoids pulling in dist/config.js (which executes
  //   `fileURLToPath(import.meta.url)` at module top-level and breaks the
  //   Workers bundle). Keys are injected via setRuntimeApiKey, never persisted.
  // - ModelRegistry.create() loads built-in models; provider base-url overrides
  //   are applied after.
  // - DefaultResourceLoader discovers skills/extensions/prompts/themes from
  //   cwd + agentDir; we override getSystemPrompt to inject our travel prompt.
  const authStorage = AuthStorage.inMemory();
  applyRuntimeApiKeys(authStorage, runtimeOptions.auth);

  const modelRegistry = ModelRegistry.create(authStorage);
  applyProviderOverrides(modelRegistry, runtimeOptions.providerOverrides);

  const settingsManager = SettingsManager.create(cwd);
  settingsManager.applyOverrides({
    compaction: { enabled: false },
    retry: { enabled: false }
  });

  const resourceLoader = new DefaultResourceLoader({
    cwd: config.cwd,
    agentDir: AGENT_DIR,
    systemPromptOverride: () => config.systemPrompt
  });
  await resourceLoader.reload();

  const selectedModel = resolveSelectedModel(modelRegistry, runtimeOptions.modelSelection);

  const { session } = await createAgentSession({
    cwd: config.cwd,
    agentDir: AGENT_DIR,
    model: selectedModel,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
    tools: [],
    customTools: config.customTools,
    sessionManager: SessionManager.inMemory(config.cwd)
  });

  return {
    session: {
      sessionId: session.sessionId,
      prompt: (text) => session.prompt(text),
      dispose: () => session.dispose(),
      getActiveToolNames: () => config.toolNames,
      get messages() {
        return session.state.messages;
      }
    }
  };
}

export async function probePiSessionCreation(cwd: string, env: PiRuntimeEnv = {}): Promise<PiSessionProbeResult> {
  try {
    const { session } = await createLivePiSession(cwd, env);
    const result: PiSessionProbeResult = {
      ok: true,
      fallback: null,
      sessionId: session.sessionId
    };
    session.dispose();
    return result;
  } catch (error) {
    return {
      ok: false,
      error: formatPiError(error)
    };
  }
}