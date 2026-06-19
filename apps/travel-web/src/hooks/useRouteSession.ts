import { useEffect, useRef } from "react";
import { useSessionStore } from "../stores/session";
import type { AgentState } from "../types/agent";

interface UseRouteSessionOptions {
  sessionId?: string | null;
  beforeResolve?: () => void;
  onResolved?: (state: AgentState | null) => void;
  onMissing?: () => void;
}

export function useRouteSession({
  sessionId,
  beforeResolve,
  onResolved,
  onMissing,
}: UseRouteSessionOptions) {
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const agentState = useSessionStore((state) => state.agentState);
  const selectSession = useSessionStore((state) => state.selectSession);
  const resolvingSessionRef = useRef<string | null>(null);
  const resolvedSessionRef = useRef<string | null>(null);
  const beforeResolveRef = useRef(beforeResolve);
  const onResolvedRef = useRef(onResolved);
  const onMissingRef = useRef(onMissing);

  useEffect(() => {
    beforeResolveRef.current = beforeResolve;
    onResolvedRef.current = onResolved;
    onMissingRef.current = onMissing;
  }, [beforeResolve, onResolved, onMissing]);

  useEffect(() => {
    if (!sessionId) {
      resolvingSessionRef.current = null;
      resolvedSessionRef.current = null;
      return;
    }

    if (resolvingSessionRef.current === sessionId) return;

    if (resolvedSessionRef.current === sessionId && sessionId === activeSessionId) {
      return;
    }

    if (sessionId === activeSessionId) {
      onResolvedRef.current?.(agentState);
      resolvedSessionRef.current = sessionId;
      resolvingSessionRef.current = null;
      return;
    }

    resolvingSessionRef.current = sessionId;
    beforeResolveRef.current?.();

    selectSession(sessionId)
      .then(() => {
        const { activeSessionId: currentId, agentState: currentState } = useSessionStore.getState();
        if (currentId === sessionId) {
          resolvedSessionRef.current = sessionId;
          onResolvedRef.current?.(currentState);
        } else {
          onMissingRef.current?.();
        }
      })
      .catch(() => {
        onMissingRef.current?.();
      })
      .finally(() => {
        resolvingSessionRef.current = null;
      });
  }, [activeSessionId, agentState, selectSession, sessionId]);
}
