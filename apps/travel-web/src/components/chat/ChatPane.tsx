import React, { useEffect, useRef } from "react";
import { useChatStore } from "../../stores/chat";
import { useSessionStore } from "../../stores/session";
import { AgentMessageCard } from "./AgentMessageCard";
import { MessageRow } from "./MessageRow";

interface ChatPaneProps {
  onSendChip?: (message: string, mode: string) => void;
}

const SUGGESTIONS = [
  "Plan a one-day Hangzhou family trip",
  "Design a Shanghai date-night route",
  "Find a budget food-and-walk itinerary nearby",
];

export function ChatPane({ onSendChip }: ChatPaneProps) {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingComplete = useChatStore((s) => s.streamingComplete);
  const currentAgentTurns = useChatStore((s) => s.currentAgentTurns);
  const streamBuffer = useChatStore((s) => s.streamBuffer);
  const agentState = useSessionStore((s) => s.agentState);
  const bottomRef = useRef<HTMLDivElement>(null);

  const showAgentCard = isStreaming || (streamingComplete && currentAgentTurns.length > 0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer, agentState?.final_plan, currentAgentTurns.length]);

  if (messages.length === 0 && !showAgentCard) {
    return (
      <section className="chat-empty-state">
        <div className="chat-empty-state__badge">PI SDK + Cloudflare</div>
        <h1>Travel planning, rebuilt for the web.</h1>
        <p>
          Ask for routes, food, activity combinations, or a full same-day itinerary. The left side keeps sessions,
          the center is your live conversation, and the right side shows agent context.
        </p>
        <div className="chat-suggestions">
          {SUGGESTIONS.map((chip) => (
            <button key={chip} type="button" className="chat-suggestion" onClick={() => onSendChip?.(chip, "prompt")}>
              {chip}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="chat-scroll">
      {messages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
      {showAgentCard ? <AgentMessageCard /> : null}
      <div ref={bottomRef} />
    </section>
  );
}
