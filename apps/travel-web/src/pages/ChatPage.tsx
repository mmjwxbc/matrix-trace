import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { chatStreamUrl } from "../api/chat";
import { ChatInput } from "../components/chat/ChatInput";
import { ChatPane } from "../components/chat/ChatPane";
import { ContextPanel } from "../components/layout/ContextPanel";
import { SessionSidebar } from "../components/layout/SessionSidebar";
import { useRouteSession } from "../hooks/useRouteSession";
import { useSessionNavigationActions } from "../hooks/useSessionNavigationActions";
import { useSessions } from "../hooks/useSessions";
import { useSSE } from "../hooks/useSSE";
import { useChatStore } from "../stores/chat";
import { useSessionStore } from "../stores/session";

export function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const { mode: agentMode, activeSessionId, create, sessions, isLoading, isDraftSession } = useSessions();
  const { connect, disconnect } = useSSE();
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const flushTurnsToMessages = useChatStore((s) => s.flushTurnsToMessages);
  const clearChat = useChatStore((s) => s.clearChat);
  const hydrateFromAgentState = useChatStore((s) => s.hydrateFromAgentState);
  const initialHydrateRef = useRef(false);

  const resetSessionView = useCallback(() => {
    disconnect();
    clearChat();
  }, [clearChat, disconnect]);

  const { handleNewSession, handleDeleteSession } = useSessionNavigationActions({
    onReset: resetSessionView,
  });

  useRouteSession({
    sessionId,
    beforeResolve: resetSessionView,
    onResolved: (state) => {
      if (state) {
        hydrateFromAgentState(state);
      }
    },
    onMissing: () => {
      navigate("/chat", { replace: true });
    },
  });

  useEffect(() => {
    if (initialHydrateRef.current) return;
    if (!sessionId || !activeSessionId || sessionId !== activeSessionId) return;
    const state = useSessionStore.getState().agentState;
    if (state) {
      hydrateFromAgentState(state);
    }
    initialHydrateRef.current = true;
  }, [sessionId, activeSessionId, hydrateFromAgentState]);

  const hasAutoInitialized = useRef(false);
  useEffect(() => {
    if (hasAutoInitialized.current) return;
    if (sessionId || isLoading) return;
    if (isDraftSession(activeSessionId)) {
      hasAutoInitialized.current = true;
      return;
    }
    if (sessions.length > 0) {
      hasAutoInitialized.current = true;
      const persistedSessions = sessions.filter((session) => !session.isDraft);
      const latest = [...persistedSessions].sort((a, b) => b.last_active - a.last_active)[0];
      if (latest) {
        navigate(`/chat/${latest.session_id}`, { replace: true });
      }
      return;
    }
    hasAutoInitialized.current = true;
  }, [sessionId, isLoading, sessions, navigate, activeSessionId, isDraftSession]);

  const sendingRef = useRef(false);

  const handleSend = useCallback(
    async (message: string, mode: string) => {
      if (sendingRef.current || isStreaming) return;
      sendingRef.current = true;

      try {
        let sid = useSessionStore.getState().activeSessionId;
        if (!sid || isDraftSession(sid)) {
          sid = await create();
          navigate(`/chat/${sid}`, { replace: true });
        }

        flushTurnsToMessages();
        addUserMessage(message);

        const userLocation = useSessionStore.getState().userLocation;
        const body: Record<string, unknown> = { message, mode: mode || "prompt" };
        if (userLocation) {
          Object.assign(body, userLocation);
        }
        connect(chatStreamUrl(sid, agentMode), body);
      } finally {
        sendingRef.current = false;
        setSidebarOpen(false);
        setContextOpen(false);
      }
    },
    [agentMode, addUserMessage, connect, create, flushTurnsToMessages, isDraftSession, isStreaming, navigate]
  );

  return (
    <div className="chat-layout">
      <div className="mobile-toolbar">
        <button type="button" className="icon-button" onClick={() => setSidebarOpen(true)}>
          Sessions
        </button>
        <div className="mobile-toolbar__title">matrix-trace</div>
        <button type="button" className="icon-button" onClick={() => setContextOpen(true)}>
          Context
        </button>
      </div>

      <SessionSidebar
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className="chat-main">
        <ChatPane onSendChip={handleSend} />
        <ChatInput onSend={handleSend} isStreaming={isStreaming} disabled={isStreaming} />
      </main>

      <ContextPanel mobileOpen={contextOpen} onCloseMobile={() => setContextOpen(false)} />

      {(sidebarOpen || contextOpen) ? <div className="mobile-scrim" onClick={() => {
        setSidebarOpen(false);
        setContextOpen(false);
      }} /> : null}
    </div>
  );
}
