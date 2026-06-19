import React, { useEffect } from "react";
import { useSessionStore } from "../../stores/session";

interface ContextPanelProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function ContextPanel({ mobileOpen = false, onCloseMobile }: ContextPanelProps) {
  const agentState = useSessionStore((s) => s.agentState);
  const requestUserLocation = useSessionStore((s) => s.requestUserLocation);
  const userLocation = useSessionStore((s) => s.userLocation);

  useEffect(() => {
    void requestUserLocation();
  }, [requestUserLocation]);

  return (
    <aside className={`context-panel ${mobileOpen ? "context-panel--open" : ""}`}>
      <div className="context-panel__header">
        <div>
          <div className="sidebar__eyebrow">runtime context</div>
          <h3>Agent Signals</h3>
        </div>
        <button type="button" className="icon-button mobile-only" onClick={onCloseMobile}>
          Close
        </button>
      </div>

      <section className="info-card">
        <div className="info-card__label">Status</div>
        <div className="info-card__value">{agentState?.status ?? "idle"}</div>
        <div className="info-card__meta">
          Stage: {agentState?.current_stage ?? "waiting"} | Steps: {agentState?.step_count ?? 0}/
          {agentState?.max_steps ?? 0}
        </div>
      </section>

      <section className="info-card">
        <div className="info-card__label">User Location</div>
        <div className="info-card__value">
          {userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : "Not granted"}
        </div>
        <div className="info-card__meta">Browser geolocation is requested automatically in the web build.</div>
      </section>

      <section className="info-card">
        <div className="info-card__label">Recent Turns</div>
        <div className="context-list">
          {agentState?.turns?.length ? (
            agentState.turns.slice(-3).reverse().map((turn) => (
              <article key={turn.turn_id} className="context-list__item">
                <strong>{turn.trigger_mode}</strong>
                <span>{turn.status}</span>
                <p>{turn.user_message || turn.assistant_message || "No message"}</p>
              </article>
            ))
          ) : (
            <p className="muted-text">No completed turns yet.</p>
          )}
        </div>
      </section>

      <section className="info-card">
        <div className="info-card__label">Recent Tool Calls</div>
        <div className="context-list">
          {agentState?.tool_logs?.length ? (
            agentState.tool_logs.slice(-5).reverse().map((log, index) => (
              <article key={`${log.tool_name}-${index}`} className="context-list__item">
                <strong>{log.tool_name}</strong>
                <span>{log.success ? "ok" : "err"}</span>
                <p>{log.output_summary || log.input_summary || "No summary"}</p>
              </article>
            ))
          ) : (
            <p className="muted-text">No tool activity yet.</p>
          )}
        </div>
      </section>
    </aside>
  );
}
