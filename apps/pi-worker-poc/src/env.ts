import type { SessionDurableObject } from "./durable/session-do.ts";
import type { SessionRegistryDurableObject } from "./durable/session-registry-do.ts";

export interface PiRuntimeEnv {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  PI_MODEL_PROVIDER?: string;
  PI_MODEL_ID?: string;
}

export interface Env {
  SESSION_DO: DurableObjectNamespace<SessionDurableObject>;
  SESSION_REGISTRY_DO: DurableObjectNamespace<SessionRegistryDurableObject>;
  CORS_ALLOWED_ORIGINS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  PI_MODEL_PROVIDER?: string;
  PI_MODEL_ID?: string;
}
