import {
  complete,
  getModel,
  type Api,
  type AssistantMessage,
  type Context,
  type Message,
  type Model,
  type Tool,
  type ToolCall,
} from "@earendil-works/pi-ai";
import { buildTravelSystemPrompt } from "./prompt-loader.ts";
import { createTravelHelloTool } from "../tools/travel-hello.ts";
import type { PiRuntimeEnv } from "../env.ts";

type TravelTool = ReturnType<typeof createTravelHelloTool>;
type ToolCredentials = { type: "api_key"; key: string };
type PiMessage = Message;

const CUSTOM_OPENAI_PROVIDERS = new Set(["custom-openai", "deepseek"]);
const OPENAI_COMPAT_TEMPLATE_PROVIDER = "deepseek";
const OPENAI_COMPAT_TEMPLATE_MODEL_ID = "deepseek-v4-flash";

const DEFAULT_MODEL_BY_PROVIDER = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-5-mini",
} as const;

export interface PiSessionConfig {
  cwd: string;
  systemPrompt: string;
  toolNames: string[];
  customTools: TravelTool[];
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
  modelApi?: string;
  modelProvider?: string;
  modelBaseUrl?: string;
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
  auth: Record<string, ToolCredentials>;
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
      exportKeys: ["complete", "getModel"]
    };
  } catch (error) {
    return {
      ok: false,
      error: formatPiError(error)
    };
  }
}

function pickProvider(runtimeOptions: PiRuntimeOptions): keyof typeof DEFAULT_MODEL_BY_PROVIDER {
  const configuredProvider = normalizeProvider(runtimeOptions.modelSelection?.provider);
  if (configuredProvider === "openai" || isCustomOpenAiProvider(configuredProvider) || runtimeOptions.auth.openai) {
    return "openai";
  }
  return "anthropic";
}

function isCustomOpenAiProvider(provider: string | undefined): boolean {
  return provider != null && CUSTOM_OPENAI_PROVIDERS.has(provider);
}

function normalizeProvider(provider: string | undefined): string | undefined {
  return provider?.trim().toLowerCase();
}

function normalizeModelId(modelId: string | undefined): string | undefined {
  return modelId?.trim();
}

function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = baseUrl?.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/(?:chat\/completions|responses)$/i, "");
}

function cloneModel(model: Model<Api>): Model<Api> {
  return {
    ...model,
    headers: model.headers ? { ...model.headers } : undefined,
    compat: model.compat ? { ...model.compat } : undefined
  };
}

function buildCustomOpenAiModel(runtimeOptions: PiRuntimeOptions, configuredModelId: string): Model<Api> {
  const baseUrl = normalizeBaseUrl(runtimeOptions.providerOverrides.openai?.baseUrl);
  if (!baseUrl) {
    throw new Error("Missing OPENAI_BASE_URL for custom-openai provider");
  }

  const template = getModel(OPENAI_COMPAT_TEMPLATE_PROVIDER, OPENAI_COMPAT_TEMPLATE_MODEL_ID) as Model<Api> | undefined;
  if (!template) {
    throw new Error(
      `Missing OpenAI-compatible template model: ${OPENAI_COMPAT_TEMPLATE_PROVIDER}/${OPENAI_COMPAT_TEMPLATE_MODEL_ID}`
    );
  }

  const selected = cloneModel(template);
  selected.id = configuredModelId;
  selected.name = configuredModelId;
  selected.baseUrl = baseUrl;
  return selected;
}

function resolveSelectedModel(runtimeOptions: PiRuntimeOptions): Model<Api> {
  const provider = pickProvider(runtimeOptions);
  const configuredProvider = normalizeProvider(runtimeOptions.modelSelection?.provider) ?? provider;
  const configuredModelId =
    normalizeModelId(runtimeOptions.modelSelection?.modelId) ??
    DEFAULT_MODEL_BY_PROVIDER[configuredProvider as keyof typeof DEFAULT_MODEL_BY_PROVIDER] ??
    DEFAULT_MODEL_BY_PROVIDER[provider];

  if (isCustomOpenAiProvider(configuredProvider)) {
    return buildCustomOpenAiModel(runtimeOptions, configuredModelId);
  }

  const rawModel = getModel(configuredProvider as never, configuredModelId as never) as Model<Api> | undefined;
  if (!rawModel) {
    throw new Error(`Unknown PI model configuration: provider=${configuredProvider}, model=${configuredModelId}`);
  }

  const selected = cloneModel(rawModel);
  const override = runtimeOptions.providerOverrides[configuredProvider];
  if (override?.baseUrl) {
    selected.baseUrl = override.baseUrl;
  }
  return selected;
}

function buildProviderOptions(model: Model<Api>, runtimeOptions: PiRuntimeOptions): Record<string, unknown> {
  const auth = runtimeOptions.auth[model.provider] ?? (model.provider === "deepseek" ? runtimeOptions.auth.openai : undefined);
  return auth ? { apiKey: auth.key } : {};
}

function toPiTool(tool: TravelTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as Tool["parameters"]
  };
}

function buildUserMessage(text: string): PiMessage {
  return {
    role: "user",
    content: text,
    timestamp: Date.now()
  };
}

function getToolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter((block): block is ToolCall => block.type === "toolCall");
}

async function executeToolCall(tool: TravelTool, toolCall: ToolCall): Promise<PiMessage> {
  const result = await tool.execute(toolCall.id, toolCall.arguments as never);
  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: result.content,
    details: result.details,
    isError: false,
    timestamp: Date.now()
  };
}

async function runToolLoop(
  model: Model<Api>,
  config: PiSessionConfig,
  committedMessages: PiMessage[],
  userText: string,
  runtimeOptions: PiRuntimeOptions
): Promise<PiMessage[]> {
  const pendingMessages: PiMessage[] = [...committedMessages, buildUserMessage(userText)];
  const tools = config.customTools.map(toPiTool);
  const providerOptions = buildProviderOptions(model, runtimeOptions);

  for (let remainingTurns = 4; remainingTurns > 0; remainingTurns -= 1) {
    const context: Context = {
      systemPrompt: config.systemPrompt,
      messages: pendingMessages,
      tools
    };
    const assistant = await complete(model, context, providerOptions);

    if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
      throw new Error(assistant.errorMessage ?? "Model request failed");
    }

    pendingMessages.push(assistant);

    const toolCalls = getToolCalls(assistant);
    if (assistant.stopReason !== "toolUse" || toolCalls.length === 0) {
      return pendingMessages;
    }

    for (const toolCall of toolCalls) {
      const tool = config.customTools.find((candidate) => candidate.name === toolCall.name);
      if (!tool) {
        throw new Error(`Unknown tool requested: ${toolCall.name}`);
      }
      pendingMessages.push(await executeToolCall(tool, toolCall));
    }
  }

  throw new Error("Tool loop exceeded maximum turns");
}

export async function createLivePiSession(cwd: string, env: PiRuntimeEnv = {}): Promise<LivePiSessionResult> {
  const config = await createPiSessionConfig(cwd);
  const runtimeOptions = createPiRuntimeOptionsFromEnv(env);
  const model = resolveSelectedModel(runtimeOptions);
  const committedMessages: PiMessage[] = [];
  const sessionId = crypto.randomUUID();

  return {
    session: {
      sessionId,
      async prompt(text) {
        const nextMessages = await runToolLoop(model, config, committedMessages, text, runtimeOptions);
        committedMessages.splice(0, committedMessages.length, ...nextMessages);
      },
      dispose() {},
      getActiveToolNames: () => config.toolNames,
      get messages() {
        return committedMessages;
      }
    }
  };
}

export async function probePiSessionCreation(cwd: string, env: PiRuntimeEnv = {}): Promise<PiSessionProbeResult> {
  try {
    const runtimeOptions = createPiRuntimeOptionsFromEnv(env);
    const model = resolveSelectedModel(runtimeOptions);
    const { session } = await createLivePiSession(cwd, env);
    const result: PiSessionProbeResult = {
      ok: true,
      fallback: null,
      sessionId: session.sessionId,
      modelApi: model.api,
      modelProvider: model.provider,
      modelBaseUrl: model.baseUrl
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
