import React, { useEffect, useRef, useState } from "react";

interface ChatInputProps {
  onSend: (message: string, mode: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function ChatInput({ onSend, disabled = false, isStreaming = false }: ChatInputProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("prompt");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposing = useRef(false);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    if (isStreaming) {
      setText("");
    }
  }, [isStreaming]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, mode);
    setText("");
  };

  return (
    <footer className="chat-input-shell">
      <div className="chat-input-toolbar">
        {[
          ["prompt", "Chat"],
          ["plan", "Plan"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`segmented-button ${mode === value ? "segmented-button--active" : ""}`}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="chat-input-box">
        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          placeholder={isStreaming ? "Agent is responding..." : "Describe the trip you want to plan..."}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onCompositionStart={() => {
            isComposing.current = true;
          }}
          onCompositionEnd={() => {
            isComposing.current = false;
          }}
          onKeyDown={(e) => {
            if (isComposing.current) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button type="button" className="send-button" disabled={disabled || !text.trim()} onClick={handleSend}>
          Send
        </button>
      </div>
    </footer>
  );
}
