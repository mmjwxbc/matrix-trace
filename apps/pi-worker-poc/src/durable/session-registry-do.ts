export interface SessionRegistryEntry {
  session_id: string;
  created_at: number;
  last_active: number;
  status: string;
  raw_input: string;
}

type RegistryState = {
  sessions: SessionRegistryEntry[];
};

function defaultRegistryState(): RegistryState {
  return { sessions: [] };
}

export class SessionRegistryDurableObject {
  private readonly stateStore: DurableObjectState;
  private state: RegistryState | null = null;

  constructor(state: DurableObjectState) {
    this.stateStore = state;
  }

  private async ensureState(): Promise<RegistryState> {
    if (this.state) return this.state;
    const stored = await this.stateStore.storage.get<RegistryState>("registry");
    const state = stored ?? defaultRegistryState();
    this.state = state;
    return state;
  }

  private async persist(): Promise<void> {
    if (this.state) {
      await this.stateStore.storage.put("registry", this.state);
    }
  }

  async listSessions(): Promise<SessionRegistryEntry[]> {
    const current = await this.ensureState();
    return [...current.sessions].sort((a, b) => b.last_active - a.last_active);
  }

  async upsertSession(entry: SessionRegistryEntry): Promise<void> {
    const current = await this.ensureState();
    const sessions = current.sessions.filter((session) => session.session_id !== entry.session_id);
    sessions.unshift(entry);
    this.state = { sessions };
    await this.persist();
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const current = await this.ensureState();
    const sessions = current.sessions.filter((session) => session.session_id !== sessionId);
    const deleted = sessions.length !== current.sessions.length;
    this.state = { sessions };
    await this.persist();
    return deleted;
  }

  async hasSession(sessionId: string): Promise<boolean> {
    const current = await this.ensureState();
    return current.sessions.some((session) => session.session_id === sessionId);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/list") {
      return Response.json(await this.listSessions());
    }

    if (request.method === "POST" && url.pathname === "/upsert") {
      const entry = (await request.json()) as SessionRegistryEntry;
      await this.upsertSession(entry);
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/delete") {
      const { sessionId } = (await request.json()) as { sessionId: string };
      return Response.json({ deleted: await this.deleteSession(sessionId) });
    }

    if (request.method === "GET" && url.pathname === "/has") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      return Response.json({ exists: await this.hasSession(sessionId) });
    }

    return new Response("Not Found", { status: 404 });
  }
}
