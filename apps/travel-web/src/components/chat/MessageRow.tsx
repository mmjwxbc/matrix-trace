import React from "react";
import { RouteMapCard } from "../map/RouteMapCard";
import { Markdown } from "../shared/Markdown";
import type { ChatMessage } from "../../types/agent";

interface MessageRowProps {
  message: ChatMessage;
}

export function MessageRow({ message }: MessageRowProps) {
  const isUser = message.kind === "user";
  return (
    <div className={`message-row ${isUser ? "message-row--user" : "message-row--assistant"}`}>
      <article className={`message-bubble ${isUser ? "message-bubble--user" : "message-bubble--assistant"}`}>
        {!isUser && (
          <div className="message-bubble__meta">
            <span className="message-avatar">PI</span>
            <span>Travel Agent</span>
          </div>
        )}
        <Markdown>{message.text ?? ""}</Markdown>
        {message.route ? <RouteMapCard route={message.route} /> : null}
      </article>
    </div>
  );
}
