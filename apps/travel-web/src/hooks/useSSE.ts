import { useCallback, useEffect, useRef } from "react";
import { SSEClient } from "../api/sse";
import { toolResultToRouteData } from "../lib/routeData";
import { useChatStore } from "../stores/chat";
import { useSessionStore } from "../stores/session";
import type { AgentStage, AgentState } from "../types/agent";
import type { ToolResultRoute, ToolResultWaypointRoute } from "../types/toolResults";

export function useSSE() {
  const clientRef = useRef<SSEClient | null>(null);
  const addAssistantMessage = useChatStore((s) => s.addAssistantMessage);
  const addStageEvent = useChatStore((s) => s.addStageEvent);
  const addToolEvent = useChatStore((s) => s.addToolEvent);
  const appendStreamText = useChatStore((s) => s.appendStreamText);
  const setStage = useChatStore((s) => s.setStage);
  const startStreaming = useChatStore((s) => s.startStreaming);
  const setStreamingComplete = useChatStore((s) => s.setStreamingComplete);
  const hydrateFromAgentState = useChatStore((s) => s.hydrateFromAgentState);
  const flushStreamBuffer = useChatStore((s) => s.flushStreamBuffer);
  const updateState = useSessionStore((s) => s.updateState);

  const handleEvent = useCallback(
    (eventType: string, payload: Record<string, unknown>) => {
      switch (eventType) {
        case "agent:start":
        case "stage:end":
        case "message:start":
        case "message:end":
        case "turn:start":
          addStageEvent(eventType, payload);
          break;
        case "stage:start":
          if (payload.stage) {
            setStage(payload.stage as AgentStage);
          }
          addStageEvent("stage:start", payload);
          break;
        case "message:update": {
          const delta = payload.delta;
          if (typeof delta === "string" && delta) {
            appendStreamText(delta);
          }
          break;
        }
        case "tool:start":
          addToolEvent((payload.tool_name as string) || "unknown", "start", payload);
          break;
        case "tool:end": {
          addToolEvent((payload.tool_name as string) || "unknown", "end", payload);
          if (
            payload.tool_name === "map_directions" &&
            payload.success === true &&
            payload.output_data &&
            typeof payload.output_data === "object"
          ) {
            const route = toolResultToRouteData(
              payload.output_data as ToolResultRoute | ToolResultWaypointRoute,
              payload.arguments as Record<string, unknown> | undefined
            );
            if (route) {
              useChatStore.getState().addRoute(route);
            }
          }
          break;
        }
        case "turn:end":
          if (typeof payload.assistant_message === "string" && payload.assistant_message.trim()) {
            addAssistantMessage(payload.assistant_message);
          } else {
            flushStreamBuffer();
          }
          addStageEvent("turn:end", payload);
          break;
        case "agent:end": {
          const status = (payload.status as string) || "done";
          const finalState = payload.final_state as Record<string, unknown> | undefined;
          addStageEvent("agent:end", payload);
          setStreamingComplete(status, finalState);
          if (finalState) {
            const nextState = finalState as unknown as AgentState;
            updateState(nextState);
            if (useChatStore.getState().currentAgentTurns.length === 0) {
              hydrateFromAgentState(nextState);
            }
          } else {
            flushStreamBuffer();
          }
          break;
        }
        default:
          addStageEvent(eventType, payload);
      }
    },
    [
      addAssistantMessage,
      addStageEvent,
      addToolEvent,
      appendStreamText,
      flushStreamBuffer,
      hydrateFromAgentState,
      setStage,
      setStreamingComplete,
      updateState,
    ]
  );

  const connect = useCallback(
    (endpoint: string, body: object) => {
      const client = new SSEClient();
      client.onEvent(handleEvent);
      clientRef.current?.disconnect();
      clientRef.current = client;
      startStreaming();
      void client.connectPost(endpoint, body);
    },
    [handleEvent, startStreaming]
  );

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clientRef.current?.disconnect();
    },
    []
  );

  return { connect, disconnect };
}
