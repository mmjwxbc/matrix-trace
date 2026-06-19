import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessions } from "../../hooks/useSessions";

interface SessionSidebarProps {
  onNewSession: () => void | Promise<void>;
  onDeleteSession?: (sessionId: string) => void | Promise<void>;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function SessionSidebar({
  onNewSession,
  onDeleteSession,
  mobileOpen = false,
  onCloseMobile,
}: SessionSidebarProps) {
  const navigate = useNavigate();
  const { sessions, mode, setMode, activeSessionId, isLoading, remove, refresh, selectDraft } = useSessions();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeSessions = sessions.filter((session) => session.raw_input || session.isDraft);

  return (
    <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
      <div className="sidebar__header">
        <div>
          <div className="sidebar__eyebrow">matrix-trace</div>
          <h2>Travel Web</h2>
        </div>
        <button type="button" className="icon-button mobile-only" onClick={onCloseMobile}>
          Close
        </button>
      </div>

      <div className="sidebar__mode">
        {[
          { value: "agent" as const, label: "Agent" },
          { value: "activity-workflow" as const, label: "Workflow" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={`segmented-button ${mode === item.value ? "segmented-button--active" : ""}`}
            onClick={async () => {
              await setMode(item.value);
              navigate("/chat", { replace: true });
              onCloseMobile?.();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <button type="button" className="primary-button" disabled={isLoading} onClick={() => void onNewSession()}>
        New Session
      </button>

      <nav className="sidebar__list">
        {activeSessions.length === 0 ? (
          <div className="sidebar__empty">No sessions yet.</div>
        ) : (
          activeSessions.map((session) => {
            const active = session.session_id === activeSessionId;
            return (
              <div
                key={session.session_id}
                className={`session-card ${active ? "session-card--active" : ""}`}
                onClick={() => {
                  if (session.isDraft) {
                    selectDraft(session.session_id);
                    navigate("/chat");
                  } else {
                    navigate(`/chat/${session.session_id}`);
                  }
                  onCloseMobile?.();
                }}
              >
                <div className="session-card__body">
                  <strong>{session.raw_input || "New Session"}</strong>
                  <span>{session.status}</span>
                </div>
                <button
                  type="button"
                  className="session-card__delete"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (onDeleteSession) {
                      await onDeleteSession(session.session_id);
                    } else {
                      await remove(session.session_id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}
