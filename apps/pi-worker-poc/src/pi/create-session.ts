import { buildTravelSystemPrompt } from "./prompt-loader.ts";
import { createTravelHelloTool } from "../tools/travel-hello.ts";
import type { PiRuntimeEnv } from "../env.ts";

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
    toolNames: ["read", "travel_hello"],
    customTools: [createTravelHelloTool()]
  };
}

export async function loadPiSdk() {
  return import("@earendil-works/pi-coding-agent");
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
    const sdk = await loadPiSdk();
    return {
      ok: true,
      exportKeys: Object.keys(sdk).slice(0, 12)
    };
  } catch (error) {
    return {
      ok: false,
      error: formatPiError(error)
    };
  }
}

export async function createLivePiSession(cwd: string, env: PiRuntimeEnv = {}): Promise<LivePiSessionResult> {
  const sdk = await loadPiSdk();
  const { AuthStorage, ModelRegistry, SessionManager, SettingsManager, createAgentSession } = sdk;
  const config = await createPiSessionConfig(cwd);
  const runtimeOptions = createPiRuntimeOptionsFromEnv(env);
  const authStorage = AuthStorage.inMemory(runtimeOptions.auth);
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  for (const [providerName, override] of Object.entries(runtimeOptions.providerOverrides)) {
    modelRegistry.registerProvider(providerName, override);
  }

  let selectedModel: unknown;
  const requestedProvider = runtimeOptions.modelSelection?.provider;
  const requestedModelId = runtimeOptions.modelSelection?.modelId;
  if (requestedProvider && requestedModelId) {
    selectedModel = modelRegistry.find(requestedProvider, requestedModelId);
  } else if (requestedProvider) {
    selectedModel = modelRegistry.getAll().find((model) => model.provider === requestedProvider);
  }

  return createAgentSession({
    cwd: config.cwd,
    authStorage,
    modelRegistry,
    model: selectedModel as never,
    sessionManager: SessionManager.inMemory(config.cwd),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false }
    }),
    tools: ["read"],
    customTools: config.customTools
  });
}

export async function probePiSessionCreation(cwd: string, env: PiRuntimeEnv = {}): Promise<PiSessionProbeResult> {
  try {
    const { session, modelFallbackMessage } = await createLivePiSession(cwd, env);
    const result: PiSessionProbeResult = {
      ok: true,
      fallback: modelFallbackMessage ?? null,
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
