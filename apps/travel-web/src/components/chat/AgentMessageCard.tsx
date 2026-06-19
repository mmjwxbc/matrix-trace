import React from "react";
import { RouteMapCard } from "../map/RouteMapCard";
import { Markdown } from "../shared/Markdown";
import { useChatStore } from "../../stores/chat";

export function AgentMessageCard() {
  const streamBuffer = useChatStore((s) => s.streamBuffer);
  const currentAgentTurns = useChatStore((s) => s.currentAgentTurns);
  const currentRoute = useChatStore((s) => s.currentRoute);
  const agentStatus = useChatStore((s) => s.agentStatus);

  const combinedText = [
    ...currentAgentTurns.map((turn) => turn.text),
    streamBuffer,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="message-row message-row--assistant">
      <article className="message-bubble message-bubble--assistant message-bubble--live">
        <div className="message-bubble__meta">
          <span className="message-avatar">PI</span>
          <span>{agentStatus?.text ?? "Thinking..."}</span>
        </div>
        <Markdown>{combinedText || "..."}</Markdown>
        {currentRoute ? <RouteMapCard route={currentRoute} /> : null}
      </article>
    </div>
  );
}
