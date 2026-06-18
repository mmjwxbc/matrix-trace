export interface RuntimeEnvelope {
  type: string;
  data: Record<string, unknown>;
}

export function formatSseEvent(event: RuntimeEnvelope): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
