import { BASE_URL } from "./client";

type SSECallback = (eventType: string, payload: Record<string, unknown>) => void;

export class SSEClient {
  private abortController: AbortController | null = null;
  private callbacks: Set<SSECallback> = new Set();
  private _isConnected = false;

  get isConnected() {
    return this._isConnected;
  }

  async connectPost(url: string, body: object): Promise<void> {
    this.disconnect();
    this.abortController = new AbortController();

    try {
      const res = await fetch(`${BASE_URL}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.abortController.signal
      });

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          return;
        }
        throw new Error(`SSE connection failed: ${res.status}`);
      }

      this._isConnected = true;
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const parsed = this.parseSSEEvent(buffer);
            if (parsed) {
              for (const cb of this.callbacks) cb(parsed.type, parsed.payload);
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;
          const parsed = this.parseSSEEvent(part);
          if (parsed) {
            for (const cb of this.callbacks) cb(parsed.type, parsed.payload);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("SSE read error:", err);
      }
    } finally {
      this._isConnected = false;
    }
  }

  onEvent(callback: SSECallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  disconnect(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._isConnected = false;
  }

  private parseSSEEvent(raw: string): { type: string; payload: Record<string, unknown> } | null {
    const lines = raw.split(/\r?\n/);
    let eventType = "message";
    let data = "";

    for (const line of lines) {
      const normalized = line.trimEnd();
      if (normalized.startsWith("event:")) {
        eventType = normalized.slice(6).trim();
      } else if (normalized.startsWith("data:")) {
        data = normalized.slice(5).trimStart();
      }
    }

    if (!data) return null;

    try {
      const parsed = JSON.parse(data);
      return {
        type: eventType,
        payload: (parsed.payload || parsed) as Record<string, unknown>
      };
    } catch {
      return { type: eventType, payload: { raw: data } };
    }
  }
}
