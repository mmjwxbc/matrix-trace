import { create } from "zustand";
import { combineRoutes, routeDataFromToolResultRecord } from "../lib/routeData";
import { useSessionStore } from "./session";
import type {
  AgentStage,
  AgentState,
  AgentStatusDisplay,
  AgentTurnMessage,
  ChatMessage,
  RouteData,
  ToolEvent,
} from "../types/agent";

let msgCounter = 0;

function makeId(): string {
  msgCounter += 1;
  return `msg-${msgCounter}-${Date.now()}`;
}

function extractTextBlocks(content: unknown[]): string {
  return content
    .filter((block): block is { text: string } => typeof (block as { text?: unknown })?.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function buildAssistantMessage(params: {
  turns: AgentTurnMessage[];
  timestamp: number;
  agentPlan: { hasFinalPlan: boolean; hasCandidatePlans: boolean } | null;
  route: RouteData | null;
}): ChatMessage {
  const { turns, timestamp, agentPlan, route } = params;
  return {
    id: makeId(),
    kind: "assistant",
    text: turns.map((turn) => turn.text).filter(Boolean).join("\n\n"),
    route: route ?? undefined,
    timestamp,
    turns,
    hasFinalPlan: !!agentPlan?.hasFinalPlan,
    hasCandidatePlans: !!agentPlan?.hasCandidatePlans,
  };
}

function buildMessagesFromState(state: AgentState): ChatMessage[] {
  const raw = state.conversation?.messages || [];
  const toolResults = state.tool_results || {};
  const result: ChatMessage[] = [];
  let pendingTurns: AgentTurnMessage[] = [];
  let pendingRoutes: RouteData[] = [];

  function flushTurns() {
    if (pendingTurns.length === 0) return;
    const lastTurn = pendingTurns[pendingTurns.length - 1];
    result.push(
      buildAssistantMessage({
        turns: pendingTurns,
        timestamp: lastTurn.timestamp,
        agentPlan: {
          hasFinalPlan: !!state.final_plan,
          hasCandidatePlans: !!state.candidate_plans?.length,
        },
        route: combineRoutes(
          pendingRoutes,
          state.user_lat != null && state.user_lng != null ? { lng: state.user_lng, lat: state.user_lat } : null
        ),
      })
    );
    pendingTurns = [];
    pendingRoutes = [];
  }

  for (const msg of raw) {
    if (msg.role === "user") {
      flushTurns();
      const text =
        typeof msg.content === "string" ? msg.content : msg.content.map((block) => block.text).join("\n");
      if (text) {
        result.push({ id: makeId(), kind: "user", text, timestamp: msg.timestamp });
      }
    } else if (msg.role === "assistant") {
      const text = extractTextBlocks(msg.content);
      pendingTurns.push({ id: makeId(), text, timestamp: msg.timestamp });
    } else if (msg.role === "toolResult") {
      const route = routeDataFromToolResultRecord(toolResults[msg.tool_call_id]);
      if (route) {
        pendingRoutes.push(route);
      }
    }
  }

  flushTurns();
  return result;
}

const STAGE_STATUS_MAP: Record<string, { text: string; icon: string }> = {
  intent_parsing: { text: "Understanding your request...", icon: "sparkle" },
  constraint_extraction: { text: "Extracting constraints...", icon: "sliders" },
  candidate_generation: { text: "Exploring candidate plans...", icon: "compass" },
  tool_execution: { text: "Calling travel tools...", icon: "wrench" },
  scoring: { text: "Scoring options...", icon: "chart" },
  final_execution: { text: "Finalizing itinerary...", icon: "check" },
  user_summary: { text: "Writing the summary...", icon: "note" },
  conversation: { text: "Thinking...", icon: "brain" },
  assistant_turn: { text: "Thinking...", icon: "brain" },
  done: { text: "Complete", icon: "check" },
  failed: { text: "Failed", icon: "alert" },
};

interface ChatStore {
  messages: ChatMessage[];
  currentStage: AgentStage | null;
  isStreaming: boolean;
  streamBuffer: string;
  streamingComplete: boolean;
  finalStatus: "running" | "done" | "failed" | null;
  agentStatus: AgentStatusDisplay | null;
  pendingToolEvents: ToolEvent[];
  currentAgentTurns: AgentTurnMessage[];
  agentPlan: { hasFinalPlan: boolean; hasCandidatePlans: boolean } | null;
  currentRoute: RouteData | null;
  currentRoutes: RouteData[];
  flushTurnsToMessages: () => void;
  addUserMessage: (text: string) => void;
  addAssistantMessage: (text: string) => void;
  addRoute: (route: RouteData) => void;
  clearRoute: () => void;
  addStageEvent: (eventType: string, payload: Record<string, unknown>) => void;
  addToolEvent: (toolName: string, direction: "start" | "end", payload: Record<string, unknown>) => void;
  startStreaming: () => void;
  appendStreamText: (text: string) => void;
  setStage: (stage: AgentStage) => void;
  setStreamingComplete: (status: string, finalState?: Record<string, unknown>) => void;
  clearChat: () => void;
  flushStreamBuffer: () => void;
  hydrateFromAgentState: (state: AgentState) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  currentStage: null,
  isStreaming: false,
  streamBuffer: "",
  streamingComplete: false,
  finalStatus: null,
  agentStatus: null,
  pendingToolEvents: [],
  currentAgentTurns: [],
  agentPlan: null,
  currentRoute: null,
  currentRoutes: [],

  flushTurnsToMessages: () => {
    set((s) => {
      const turns = [...s.currentAgentTurns];
      if (turns.length === 0) return {};
      const userLocation = useSessionStore.getState().userLocation;
      return {
        messages: [
          ...s.messages,
          buildAssistantMessage({
            turns,
            timestamp: Date.now(),
            agentPlan: s.agentPlan,
            route: combineRoutes(s.currentRoutes, userLocation ? { lng: userLocation.lng, lat: userLocation.lat } : null),
          }),
        ],
        currentAgentTurns: [],
        agentPlan: null,
        currentRoute: null,
        currentRoutes: [],
      };
    });
  },

  addUserMessage: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: makeId(), kind: "user", text, timestamp: Date.now() }],
    })),

  addAssistantMessage: (text) =>
    set((s) => ({
      currentAgentTurns: [
        ...s.currentAgentTurns,
        {
          id: makeId(),
          text,
          toolEvents: s.pendingToolEvents.length > 0 ? [...s.pendingToolEvents] : undefined,
          timestamp: Date.now(),
        },
      ],
      streamBuffer: "",
      pendingToolEvents: [],
      agentStatus: null,
    })),

  addRoute: (route) =>
    set((s) => {
      const currentRoutes = [...s.currentRoutes, route];
      const userLocation = useSessionStore.getState().userLocation;
      return {
        currentRoutes,
        currentRoute: combineRoutes(currentRoutes, userLocation ? { lng: userLocation.lng, lat: userLocation.lat } : null),
      };
    }),

  clearRoute: () => set({ currentRoute: null, currentRoutes: [] }),

  addStageEvent: (_eventType, payload) =>
    set((s) => {
      const stage = typeof payload.stage === "string" ? payload.stage : s.currentStage;
      const statusMeta = stage ? STAGE_STATUS_MAP[stage] : null;
      return {
        agentStatus: statusMeta
          ? {
              text: statusMeta.text,
              icon: statusMeta.icon,
              variant: "running",
            }
          : s.agentStatus,
      };
    }),

  addToolEvent: (toolName, direction, payload) =>
    set((s) => ({
      pendingToolEvents: [
        ...s.pendingToolEvents,
        {
          id: makeId(),
          toolName,
          direction,
          durationMs: typeof payload.duration_ms === "number" ? payload.duration_ms : undefined,
          success: typeof payload.success === "boolean" ? payload.success : undefined,
          inputSummary: typeof payload.input_summary === "string" ? payload.input_summary : undefined,
          outputSummary: typeof payload.output_summary === "string" ? payload.output_summary : undefined,
          errorMessage: typeof payload.error_message === "string" ? payload.error_message : undefined,
          timestamp: Date.now(),
        },
      ],
    })),

  startStreaming: () =>
    set({
      isStreaming: true,
      streamBuffer: "",
      streamingComplete: false,
      finalStatus: "running",
      pendingToolEvents: [],
      currentAgentTurns: [],
      currentRoute: null,
      currentRoutes: [],
      agentStatus: {
        text: "Connecting to the agent...",
        icon: "satellite",
        variant: "running",
      },
    }),

  appendStreamText: (text) =>
    set((s) => ({
      streamBuffer: `${s.streamBuffer}${text}`,
      agentStatus: {
        text: "Streaming response...",
        icon: "sparkle",
        variant: "running",
      },
    })),

  setStage: (stage) =>
    set({
      currentStage: stage,
      agentStatus: STAGE_STATUS_MAP[stage]
        ? {
            text: STAGE_STATUS_MAP[stage].text,
            icon: STAGE_STATUS_MAP[stage].icon,
            variant: "running",
          }
        : null,
    }),

  setStreamingComplete: (status, finalState) =>
    set((s) => ({
      isStreaming: false,
      streamingComplete: true,
      finalStatus: status === "failed" ? "failed" : "done",
      agentPlan: finalState
        ? {
            hasFinalPlan: !!(finalState as unknown as AgentState).final_plan,
            hasCandidatePlans: !!(finalState as unknown as AgentState).candidate_plans?.length,
          }
        : s.agentPlan,
      agentStatus: {
        text: status === "failed" ? "Agent failed" : "Agent complete",
        icon: status === "failed" ? "alert" : "check",
        variant: status === "failed" ? "failed" : "done",
      },
    })),

  clearChat: () =>
    set({
      messages: [],
      currentStage: null,
      isStreaming: false,
      streamBuffer: "",
      streamingComplete: false,
      finalStatus: null,
      agentStatus: null,
      pendingToolEvents: [],
      currentAgentTurns: [],
      agentPlan: null,
      currentRoute: null,
      currentRoutes: [],
    }),

  flushStreamBuffer: () =>
    set((s) => {
      if (!s.streamBuffer.trim()) return {};
      return {
        currentAgentTurns: [
          ...s.currentAgentTurns,
          {
            id: makeId(),
            text: s.streamBuffer,
            toolEvents: s.pendingToolEvents.length > 0 ? [...s.pendingToolEvents] : undefined,
            timestamp: Date.now(),
          },
        ],
        streamBuffer: "",
        pendingToolEvents: [],
      };
    }),

  hydrateFromAgentState: (state) =>
    set({
      messages: buildMessagesFromState(state),
      currentStage: state.current_stage ?? null,
      isStreaming: false,
      streamBuffer: "",
      streamingComplete: false,
      finalStatus: state.status === "failed" ? "failed" : state.status === "done" ? "done" : null,
      currentAgentTurns: [],
      agentPlan: {
        hasFinalPlan: !!state.final_plan,
        hasCandidatePlans: !!state.candidate_plans?.length,
      },
      currentRoute: null,
      currentRoutes: [],
    }),
}));
