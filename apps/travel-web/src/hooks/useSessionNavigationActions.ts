import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSessions } from "./useSessions";

interface UseSessionNavigationActionsOptions {
  onReset?: () => void;
}

export function useSessionNavigationActions({ onReset }: UseSessionNavigationActionsOptions = {}) {
  const navigate = useNavigate();
  const { createDraft, remove, activeSessionId } = useSessions();

  const handleNewSession = useCallback(() => {
    onReset?.();
    createDraft();
    navigate("/chat");
  }, [createDraft, navigate, onReset]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const deletingActive = activeSessionId === sessionId;
      await remove(sessionId);
      if (deletingActive) {
        onReset?.();
        navigate("/chat", { replace: true });
      }
    },
    [activeSessionId, navigate, onReset, remove]
  );

  return { handleNewSession, handleDeleteSession };
}
