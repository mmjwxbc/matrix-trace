import type { PromptRequest } from "../lib/state.ts";
import { formatSseEvent } from "../lib/events.ts";
import { toLegacyAgentState, type PromptResult, type StoredSessionState } from "../lib/legacy-state.ts";
import type { Env } from "../env.ts";
import { getSessionState, getSessionStub, promptSession } from "./sessions.ts";

function formatLegacySseEvent(type: string, payload: Record<string, unknown>) {
  return formatSseEvent({
    type,
    data: {
      type,
      payload
    }
  });
}

export async function buildSingleEventStream(env: Env, sessionId: string, body: PromptRequest) {
  const stub = getSessionStub(env, sessionId);
  const result = (await promptSession(stub, body)) as PromptResult;
  const state = (await getSessionState(stub)) as StoredSessionState;
  const finalState = toLegacyAgentState(state, result);
  const finalStatus = result.promptError ? "failed" : "done";

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          formatLegacySseEvent("agent:start", { session_id: sessionId, mode: body.mode ?? "prompt" })
        )
      );
      controller.enqueue(
        encoder.encode(
          formatLegacySseEvent("agent:end", {
            status: finalStatus,
            final_state: finalState,
            diagnostics: result
          })
        )
      );
      controller.close();
    }
  });
}
