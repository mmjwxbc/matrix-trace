import {
  createLivePiSession,
  createPiSessionConfig,
  formatPiError,
  probePiSdk,
  probePiSessionCreation
} from "../pi/create-session.ts";
import type { Env } from "../env.ts";
import { applyLocationContext } from "../lib/legacy-state.ts";
import type { PromptRequest } from "../lib/state.ts";
import { persistTurn } from "../lib/chat-history.ts";

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

type LiveSession = Awaited<ReturnType<typeof createLivePiSession>>;

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

export class SessionDurableObject {
  private readonly stateStore: DurableObjectState;
  private readonly env: Env;
  private state: SessionState | null = null;
  private liveSession: LiveSession | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.stateStore = state;
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
    this.liveSession = await createLivePiSession(`/sessions/${sessionId}`, this.env);
    return this.liveSession;
  }

  async getState() {
    const current = await this.ensureState("unknown");
    return current;
  }

  async prompt(body: PromptRequest) {
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

    try {
      const session = await this.ensureLiveSession(current.sessionId);
      await session.session.prompt(body.message);
      this.state = {
        ...this.state,
        status: "idle",
        piSessionCreated: true,
        piSessionError: "",
        piSessionFallback: session.modelFallbackMessage ?? this.state.piSessionFallback,
        messageCount: session.session.messages.length,
        toolNames: session.session.getActiveToolNames()
      };
      await this.persist();

      // Archive the turn to D1. Fire-and-forget via waitUntil so we don't
      // add a DB round-trip latency to the prompt response. D1 writes are
      // idempotent on (conversation_id, seq) only if we get that right;
      // since seq is computed from MAX(seq)+1, retried writes can collide —
      // acceptable for an archive, log and move on.
      const assistantText = extractLastAssistantText(session);
      this.stateStore.waitUntil(
        persistTurn(this.env, {
          conversationId: current.sessionId,
          userMessage: body.message,
          userMeta: { mode: body.mode, lat: body.lat, lng: body.lng },
          assistantMessage: assistantText
        }).catch((err) => console.error("chat-history persist failed", err))
      );
      return {
        ok: true,
        usedPiSdk: this.state.sdkLoaded,
        sdkLoadError: this.state.sdkLoadError,
        piSessionCreated: this.state.piSessionCreated,
        piSessionError: this.state.piSessionError,
        piSessionFallback: this.state.piSessionFallback,
        promptAttempted: this.state.promptAttempted,
        promptError: this.state.promptError || undefined,
        lastMessage: this.state.lastMessage,
        messageCount: this.state.messageCount,
        toolNames: this.state.toolNames
      };
    } catch (error) {
      const promptError = formatPiError(error);
      this.state = {
        ...this.state,
        status: "idle",
        promptError,
        messageCount: this.liveSession?.session.messages.length ?? this.state.messageCount
      };
      await this.persist();
      return {
        ok: false,
        usedPiSdk: this.state.sdkLoaded,
        sdkLoadError: this.state.sdkLoadError,
        piSessionCreated: this.state.piSessionCreated,
        piSessionError: this.state.piSessionError,
        piSessionFallback: this.state.piSessionFallback,
        promptAttempted: this.state.promptAttempted,
        promptError: this.state.promptError,
        lastMessage: this.state.lastMessage,
        messageCount: this.state.messageCount,
        toolNames: this.state.toolNames
      };
    }
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
      return Response.json(await this.prompt(body));
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(await this.healthCheck());
    }

    return new Response("Not Found", { status: 404 });
  }
}
