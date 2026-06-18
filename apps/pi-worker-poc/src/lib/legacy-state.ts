import type { PromptRequest } from "./state.ts";

export interface StoredSessionState {
  sessionId: string;
  status: "idle" | "running";
  systemPrompt: string;
  sdkLoaded: boolean;
  piSessionCreated: boolean;
  promptAttempted: boolean;
  promptError: string;
  piSessionError: string;
  piSessionFallback: string;
  lastMessage: string;
  createdAt: number;
  lastActive: number;
  mode: string;
  runtimeContext: Record<string, unknown>;
}

export type PromptResult = {
  ok: boolean;
  usedPiSdk: boolean;
  sdkLoadError: string;
  piSessionCreated: boolean;
  piSessionError: string;
  piSessionFallback: string;
  promptAttempted: boolean;
  promptError?: string;
  lastMessage: string;
  messageCount: number;
  toolNames: string[];
};

export function applyLocationContext(
  runtimeContext: Record<string, unknown>,
  body: PromptRequest
): Record<string, unknown> {
  if (body.lat == null || body.lng == null) {
    return runtimeContext;
  }
  return {
    ...runtimeContext,
    user_location: {
      lat: body.lat,
      lng: body.lng,
      accuracy_m: body.accuracy_m ?? null,
      altitude_m: body.altitude_m ?? null,
      altitude_accuracy_m: body.altitude_accuracy_m ?? null,
      heading_degrees: body.heading_degrees ?? null,
      speed_mps: body.speed_mps ?? null,
      timestamp_ms: body.timestamp_ms ?? null,
      source: "browser_geolocation"
    }
  };
}

export function toLegacyAgentState(
  state: StoredSessionState,
  result?: PromptResult
): Record<string, unknown> {
  const promptError = result?.promptError ?? state.promptError;
  const userLocation =
    typeof state.runtimeContext.user_location === "object" && state.runtimeContext.user_location
      ? (state.runtimeContext.user_location as Record<string, unknown>)
      : null;
  const status = promptError ? "failed" : state.status === "running" ? "running" : "done";
  const messages: Array<Record<string, unknown>> = [];
  if (state.lastMessage) {
    messages.push({
      role: "user",
      content: state.lastMessage,
      mode: state.mode,
      timestamp: state.lastActive
    });
  }
  if (promptError) {
    messages.push({
      role: "assistant",
      content: [{ type: "text", text: promptError }],
      stage: "failed",
      timestamp: state.lastActive
    });
  }
  const turns = state.lastMessage
    ? [
        {
          turn_id: `turn-${state.sessionId}-${state.lastActive}`,
          stage: promptError ? "failed" : "done",
          trigger_mode: state.mode,
          user_message: state.lastMessage,
          assistant_message: promptError ?? null,
          tool_calls: [],
          status: promptError ? "failed" : "completed"
        }
      ]
    : [];

  return {
    raw_input: state.lastMessage,
    status,
    agent_mode: "agent",
    current_action: promptError ? "failed" : "done",
    current_stage: promptError ? "failed" : "done",
    step_count: 1,
    max_steps: 1,
    conversation: {
      system_prompt: state.systemPrompt,
      messages
    },
    runtime_context: state.runtimeContext,
    conversation_context: {
      system_prompt: state.systemPrompt,
      messages
    },
    turns,
    scene_profile: null,
    constraints: null,
    candidate_activities: [],
    candidate_restaurants: [],
    candidate_plans: [],
    tool_results: {},
    tool_logs: [],
    decision_trace: [],
    final_plan: null,
    execution_results: [],
    assumptions: [],
    errors: promptError ? [promptError] : [],
    user_lat: typeof userLocation?.lat === "number" ? userLocation.lat : null,
    user_lng: typeof userLocation?.lng === "number" ? userLocation.lng : null,
    diagnostics: {
      used_pi_sdk: result?.usedPiSdk ?? state.sdkLoaded,
      sdk_load_error: result?.sdkLoadError ?? "",
      pi_session_created: result?.piSessionCreated ?? state.piSessionCreated,
      pi_session_error: result?.piSessionError ?? state.piSessionError,
      pi_session_fallback: result?.piSessionFallback ?? state.piSessionFallback,
      prompt_attempted: result?.promptAttempted ?? state.promptAttempted,
      prompt_error: promptError || undefined,
      tool_names: result?.toolNames ?? []
    }
  };
}
