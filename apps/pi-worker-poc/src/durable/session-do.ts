import {
  createStreamingLivePiSession,
  createPiSessionConfig,
  formatPiError,
  probePiSdk,
  probePiSessionCreation,
  type LivePiSessionResult,
  type StreamToolResultRow,
} from "../pi/create-session.ts";
import type { Env } from "../env.ts";
import { applyLocationContext, toLegacyAgentState, type PromptResult } from "../lib/legacy-state.ts";
import type { PromptRequest } from "../lib/state.ts";
import { listMessages, persistMessageRow, persistTurn, rowToPiMessage } from "../lib/chat-history.ts";
import type { Message } from "@earendil-works/pi-ai";

type SessionState = {
  sessionId: string;
  initialized: boolean;
  status: "idle" | "running";
  systemPrompt: string;
  toolNames: string[];
  sdkLoaded: boolean;
  sdkLoadError: string;
  piSessionCreated: boolean;
  piSessionError: string;
  piSessionFallback: string;
  promptAttempted: boolean;
  promptError: string;
  messageCount: number;
  lastMessage: string;
  createdAt: number;
  lastActive: number;
  mode: string;
  runtimeContext: Record<string, unknown>;
};

type LiveSession = LivePiSessionResult;

function extractLastAssistantText(session: LiveSession): string {
  const messages = (session.session as unknown as { messages?: unknown[] }).messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown> | null | undefined;
    if (!msg || msg.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string") parts.push(b.text);
      }
      if (parts.length > 0) return parts.join("");
    }
    return "";
  }
  return "";
}

function defaultState(sessionId: string): SessionState {
  return {
    sessionId,
    initialized: false,
    status: "idle",
    systemPrompt: "",
    toolNames: [],
    sdkLoaded: false,
    sdkLoadError: "",
    piSessionCreated: false,
    piSessionError: "",
    piSessionFallback: "",
    promptAttempted: false,
    promptError: "",
    messageCount: 0,
    lastMessage: "",
    createdAt: Date.now(),
    lastActive: Date.now(),
    mode: "prompt",
    runtimeContext: {}
  };
}

function formatLegacySseEvent(type: string, payload: Record<string, unknown>): string {
  const data = { type, payload };
  return `event: ${type}\ndata: ${JSON.stringify({ type, data })}\n\n`;
}

export class SessionDurableObject {
  private readonly stateStore: DurableObjectState;
  private readonly env: Env;
  private state: SessionState | null = null;
  private liveSession: LiveSession | null = null;
  private inflightPrompt: Promise<unknown> | null = null;

  constructor(stateStore: DurableObjectState, env: Env) {
    this.stateStore = stateStore;
    this.env = env;
  }

  private async ensureState(sessionId: string): Promise<SessionState> {
    if (this.state) return this.state;
    const stored = await this.stateStore.storage.get<SessionState>("session");
    const state = stored ?? defaultState(sessionId);
    this.state = state;
    return state;
  }

  private async persist(): Promise<void> {
    if (this.state) {
      await this.stateStore.storage.put("session", this.state);
    }
  }

  private async hydrateInitialMessages(sessionId: string): Promise<Message[]> {
    if (!this.env.CHAT_DB) return [];
    try {
      const rows = await listMessages(this.env, sessionId);
      const messages: Message[] = [];
      for (const row of rows) {
        const msg = rowToPiMessage(row);
        if (msg) messages.push(msg);
      }
      return messages;
    } catch (error) {
      console.error("hydrateMessages failed", error);
      return [];
    }
  }

  async healthCheck() {
    return { ok: true };
  }

  async initialize(sessionId: string) {
    const current = await this.ensureState(sessionId);
    const config = await createPiSessionConfig(`/sessions/${sessionId}`);
    const sdkProbe = await probePiSdk();
    const sessionProbe = sdkProbe.ok ? await probePiSessionCreation(`/sessions/${sessionId}`, this.env) : { ok: false };

    this.state = {
      ...current,
      initialized: true,
      sessionId,
      systemPrompt: config.systemPrompt,
      toolNames: config.toolNames,
      sdkLoaded: sdkProbe.ok,
      sdkLoadError: sdkProbe.error ?? "",
      piSessionCreated: sessionProbe.ok,
      piSessionError: sessionProbe.ok ? "" : sessionProbe.error ?? "",
      piSessionFallback: sessionProbe.ok ? sessionProbe.fallback ?? "" : "",
      promptAttempted: false,
      promptError: "",
      messageCount: 0,
      lastActive: Date.now()
    };
    await this.persist();
    return this.state;
  }

  private async ensureLiveSession(sessionId: string): Promise<LiveSession> {
    if (this.liveSession) {
      return this.liveSession;
    }
    const initialMessages = await this.hydrateInitialMessages(sessionId);
    this.liveSession = await createStreamingLivePiSession(`/sessions/${sessionId}`, this.env, {
      initialMessages
    });
    return this.liveSession;
  }

  async getState() {
    const current = await this.ensureState("unknown");
    return current;
  }

  private updateStateAfterPrompt(error: string | null, session: LiveSession) {
    if (!this.state) return;
    this.state = {
      ...this.state,
      status: "idle",
      piSessionCreated: true,
      piSessionError: "",
      piSessionFallback: session.modelFallbackMessage ?? this.state.piSessionFallback,
      messageCount: session.session.messages.length,
      toolNames: session.session.getActiveToolNames(),
      promptError: error ?? ""
    };
  }

  async prompt(body: PromptRequest): Promise<PromptResult> {
    if (this.inflightPrompt) {
      throw new Error("Session is busy with another prompt");
    }

    const current = await this.ensureState("unknown");
    this.state = {
      ...current,
      status: "running",
      lastMessage: body.message,
      mode: body.mode ?? current.mode,
      promptAttempted: true,
      promptError: "",
      lastActive: Date.now(),
      runtimeContext: applyLocationContext(current.runtimeContext, body)
    };
    await this.persist();

    const promise = this.runPromptBlock(body);
    this.inflightPrompt = promise;
    try {
      return await promise;
    } finally {
      this.inflightPrompt = null;
    }
  }

  private async runPromptBlock(body: PromptRequest): Promise<PromptResult> {
    const sessionId = this.state?.sessionId ?? "unknown";
    try {
      const session = await this.ensureLiveSession(sessionId);
      await session.session.prompt(body.message);
      this.updateStateAfterPrompt(null, session);
      await this.persist();

      const assistantText = extractLastAssistantText(session);
      this.stateStore.waitUntil(
        persistTurn(this.env, {
          conversationId: sessionId,
          userMessage: body.message,
          userMeta: { mode: body.mode, lat: body.lat, lng: body.lng },
          assistantMessage: assistantText
        }).catch((err) => console.error("chat-history persist failed", err))
      );

      return this.buildPromptResult(session, null);
    } catch (error) {
      const promptError = formatPiError(error);
      let sessionForResult: LiveSession | null = null;
      try {
        sessionForResult = await this.ensureLiveSession(sessionId);
      } catch {
        sessionForResult = null;
      }
      if (sessionForResult) {
        this.updateStateAfterPrompt(promptError, sessionForResult);
        await this.persist();
      }
      return this.buildPromptResult(sessionForResult, promptError);
    }
  }

  private buildPromptResult(_session: LiveSession | null, promptError: string | null): PromptResult {
    const state = this.state;
    return {
      ok: !promptError,
      usedPiSdk: state?.sdkLoaded ?? false,
      sdkLoadError: state?.sdkLoadError ?? "",
      piSessionCreated: state?.piSessionCreated ?? false,
      piSessionError: state?.piSessionError ?? "",
      piSessionFallback: state?.piSessionFallback ?? "",
      promptAttempted: state?.promptAttempted ?? false,
      promptError: promptError ?? undefined,
      lastMessage: state?.lastMessage ?? "",
      messageCount: state?.messageCount ?? 0,
      toolNames: state?.toolNames ?? []
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/initialize") {
      const { sessionId } = (await request.json()) as { sessionId: string };
      return Response.json(await this.initialize(sessionId));
    }

    if (request.method === "GET" && url.pathname === "/state") {
      return Response.json(await this.getState());
    }

    if (request.method === "POST" && url.pathname === "/prompt") {
      const body = (await request.json()) as PromptRequest;
      const result = await this.prompt(body);
      return Response.json(result);
    }

    if (request.method === "POST" && url.pathname === "/prompt/stream") {
      const body = (await request.json()) as PromptRequest;
      return this.handlePromptStream(body, request.signal);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(await this.healthCheck());
    }

    return new Response("Not Found", { status: 404 });
  }

  private handlePromptStream(body: PromptRequest, requestSignal: AbortSignal): Response {
    const encoder = new TextEncoder();
    const self = this;

    const controller = new AbortController();
    if (requestSignal.aborted) {
      controller.abort(requestSignal.reason);
    } else {
      requestSignal.addEventListener("abort", () => controller.abort(requestSignal.reason), { once: true });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(sseController) {
        let assistantText = "";
        let promptError: string | null = null;

        try {
          const current = await self.ensureState("unknown");
          self.state = {
            ...current,
            status: "running",
            lastMessage: body.message,
            mode: body.mode ?? current.mode,
            promptAttempted: true,
            promptError: "",
            lastActive: Date.now(),
            runtimeContext: applyLocationContext(current.runtimeContext, body)
          };
          await self.persist();

          sseController.enqueue(
            encoder.encode(
              formatLegacySseEvent("agent:start", {
                session_id: self.state.sessionId,
                mode: body.mode ?? "prompt"
              })
            )
          );

          const session = await self.ensureLiveSession(self.state.sessionId);
          let turnIndex = 0;

          await session.session.prompt(body.message, {
            signal: controller.signal,
            onEvent: async (event) => {
              if (event.type === "start") {
                sseController.enqueue(
                  encoder.encode(
                    formatLegacySseEvent("turn:start", {
                      turn_id: `turn-${self.state?.sessionId}-${turnIndex}-${Date.now()}`
                    })
                  )
                );
              } else if (event.type === "text_delta") {
                assistantText += event.delta;
                sseController.enqueue(
                  encoder.encode(
                    formatLegacySseEvent("message:update", { delta: event.delta })
                  )
                );
              } else if (event.type === "text_end") {
                sseController.enqueue(
                  encoder.encode(
                    formatLegacySseEvent("message:end", {})
                  )
                );
              } else if (event.type === "toolcall_start") {
                const tc = event.partial.content[event.contentIndex] as
                  | { id: string; name: string; arguments: Record<string, unknown> }
                  | undefined;
                sseController.enqueue(
                  encoder.encode(
                    formatLegacySseEvent("tool:start", {
                      tool_name: tc?.name ?? "unknown",
                      arguments: tc?.arguments ?? {}
                    })
                  )
                );
              } else if (event.type === "toolcall_end") {
                const toolCall = event.toolCall;
                const resultMsg = (session.session.messages as Array<Record<string, unknown>>).find(
                  (m) => m.role === "toolResult" && m.toolCallId === toolCall.id
                );
                sseController.enqueue(
                  encoder.encode(
                    formatLegacySseEvent("tool:end", {
                      tool_name: toolCall.name,
                      success: resultMsg ? resultMsg.isError !== true : false,
                      output_data: resultMsg?.details ?? null,
                      arguments: toolCall.arguments
                    })
                  )
                );
              } else if (event.type === "done") {
                if (event.reason === "toolUse") {
                  turnIndex += 1;
                }
              } else if (event.type === "error") {
                promptError = event.error.errorMessage ?? "Model request failed";
              }
            },
            onToolResult: async (row) => {
              await persistStreamToolResult(self.env, self.state?.sessionId ?? "unknown", row);
            }
          });

          if (!assistantText) {
            assistantText = extractLastAssistantText(session);
          }

          if (assistantText && !promptError) {
            sseController.enqueue(
              encoder.encode(
                formatLegacySseEvent("turn:end", { assistant_message: assistantText })
              )
            );
          }

          self.updateStateAfterPrompt(promptError, session);
          await self.persist();

          if (!promptError) {
            self.stateStore.waitUntil(
              persistTurn(self.env, {
                conversationId: self.state.sessionId,
                userMessage: body.message,
                userMeta: { mode: body.mode, lat: body.lat, lng: body.lng },
                assistantMessage: assistantText
              }).catch((err) => console.error("chat-history persist failed", err))
            );
          }

          const finalState = toLegacyAgentState(self.state, {
            ok: !promptError,
            usedPiSdk: self.state.sdkLoaded,
            sdkLoadError: self.state.sdkLoadError,
            piSessionCreated: self.state.piSessionCreated,
            piSessionError: self.state.piSessionError,
            piSessionFallback: self.state.piSessionFallback,
            promptAttempted: true,
            promptError: promptError ?? undefined,
            lastMessage: self.state.lastMessage,
            messageCount: self.state.messageCount,
            toolNames: self.state.toolNames
          });

          sseController.enqueue(
            encoder.encode(
              formatLegacySseEvent("agent:end", {
                status: promptError ? "failed" : "done",
                final_state: finalState,
                diagnostics: {
                  used_pi_sdk: self.state.sdkLoaded,
                  sdk_load_error: self.state.sdkLoadError,
                  pi_session_created: self.state.piSessionCreated,
                  pi_session_error: self.state.piSessionError,
                  pi_session_fallback: self.state.piSessionFallback,
                  prompt_attempted: true,
                  prompt_error: promptError ?? undefined,
                  tool_names: self.state.toolNames
                }
              })
            )
          );
        } catch (error) {
          promptError = formatPiError(error);
          try {
            sseController.enqueue(
              encoder.encode(
                formatLegacySseEvent("agent:end", {
                  status: "failed",
                  error: promptError
                })
              )
            );
          } catch {
            // controller already closed
          }
        } finally {
          try {
            sseController.close();
          } catch {
            // already closed
          }
        }
      },
      cancel() {
        controller.abort("client-disconnected");
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive"
      }
    });
  }
}

// Persist tool result rows incrementally to D1 so that crash recovery can
// continue from a partial state. Exported as a helper for testing; the runtime
// path uses onToolResult inside the createStreamingLivePiSession call.
export async function persistStreamToolResult(
  env: Env,
  conversationId: string,
  row: StreamToolResultRow
): Promise<void> {
  if (!env.CHAT_DB) return;
  try {
    await persistMessageRow(env, conversationId, {
      role: "tool",
      content: row.content,
      meta: {
        toolCallId: row.toolCallId,
        toolName: row.toolName,
        isError: row.isError,
        details: row.details
      }
    });
  } catch (error) {
    console.error("persistStreamToolResult failed", error);
  }
}