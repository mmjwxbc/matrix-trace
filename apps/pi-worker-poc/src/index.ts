import type { Env } from "./env.ts";
import { SessionDurableObject } from "./durable/session-do.ts";
import { SessionRegistryDurableObject } from "./durable/session-registry-do.ts";
import { buildSingleEventStream } from "./routes/stream.ts";
import { handleCreateSession, handleDeleteSession, handleGetSession, handleListSessions, handlePrompt } from "./routes/sessions.ts";

export { SessionDurableObject };
export { SessionRegistryDurableObject };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/sessions") {
      return handleCreateSession(env);
    }

    if (request.method === "GET" && url.pathname === "/api/sessions") {
      return handleListSessions(env);
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const sessionId = url.pathname.split("/")[3];
      if (!sessionId) return new Response("Not Found", { status: 404 });
      return handleGetSession(env, sessionId);
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/sessions/")) {
      const sessionId = url.pathname.split("/")[3];
      if (!sessionId) return new Response("Not Found", { status: 404 });
      return handleDeleteSession(env, sessionId);
    }

    if (request.method === "POST" && url.pathname.endsWith("/chat/stream")) {
      const sessionId = url.pathname.split("/")[3];
      if (!sessionId) return new Response("Not Found", { status: 404 });
      const body = (await request.json()) as { message: string; mode?: string; lat?: number; lng?: number };
      return new Response(await buildSingleEventStream(env, sessionId, body), {
        headers: { "content-type": "text/event-stream" }
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/chat")) {
      const sessionId = url.pathname.split("/")[3];
      if (!sessionId) return new Response("Not Found", { status: 404 });
      const body = (await request.json()) as { message: string; mode?: string; lat?: number; lng?: number };
      return handlePrompt(env, sessionId, body);
    }

    return new Response("Not Found", { status: 404 });
  }
};
