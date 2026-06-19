import { useCallback } from "react";
import { useSessionStore } from "../stores/session";

export function useSessions() {
  const mode = useSessionStore((state) => state.mode);
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const agentState = useSessionStore((state) => state.agentState);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);
  const loadSessions = useSessionStore((state) => state.loadSessions);
  const createSession = useSessionStore((state) => state.createSession);
  const startDraftSession = useSessionStore((state) => state.startDraftSession);
  const selectDraftSession = useSessionStore((state) => state.selectDraftSession);
  const isDraftSession = useSessionStore((state) => state.isDraftSession);
  const selectSession = useSessionStore((state) => state.selectSession);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const setMode = useSessionStore((state) => state.setMode);

  return {
    sessions,
    mode,
    activeSessionId,
    agentState,
    isLoading,
    error,
    setMode,
    select: useCallback((id: string) => selectSession(id), [selectSession]),
    create: useCallback(async () => createSession(), [createSession]),
    createDraft: useCallback(() => startDraftSession(), [startDraftSession]),
    selectDraft: useCallback((id: string) => selectDraftSession(id), [selectDraftSession]),
    isDraftSession,
    remove: useCallback(async (id: string) => deleteSession(id), [deleteSession]),
    refresh: useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  };
}
