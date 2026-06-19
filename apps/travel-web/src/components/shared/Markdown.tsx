import React from "react";

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  const paragraphs = children
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <div className="markdown-body">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
    </div>
  );
}
