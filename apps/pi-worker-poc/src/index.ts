import type { Env } from "./env.ts";
import { SessionDurableObject } from "./durable/session-do.ts";
import { SessionRegistryDurableObject } from "./durable/session-registry-do.ts";
import { buildSingleEventStream } from "./routes/stream.ts";
import { handleCreateSession, handleDeleteSession, handleGetSession, handleListSessions, handlePrompt } from "./routes/sessions.ts";

export { SessionDurableObject };
export { SessionRegistryDurableObject };

const DEFAULT_ALLOWED_ORIGINS = [
  "https://matrix-trace.pages.dev",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
];

function getAllowedOrigins(env: Env) {
  const configuredOrigins = env.CORS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configuredOrigins?.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
}

function buildCorsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins(env);
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
    vary: "Origin"
  };
}

function withCors(response: Response, request: Request, env: Env) {
  const headers = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(request, env);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isApiRoute = url.pathname.startsWith("/api/");

    try {
      if (request.method === "OPTIONS" && isApiRoute) {
        return new Response(null, {
          status: 204,
          headers: buildCorsHeaders(request, env)
        });
      }

      let response: Response;

      if (request.method === "GET" && url.pathname === "/health") {
        response = Response.json({ ok: true });
      } else if (request.method === "POST" && url.pathname === "/api/sessions") {
        response = await handleCreateSession(env);
      } else if (request.method === "GET" && url.pathname === "/api/sessions") {
        response = await handleListSessions(env);
      } else if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
        const sessionId = url.pathname.split("/")[3];
        response = sessionId ? await handleGetSession(env, sessionId) : new Response("Not Found", { status: 404 });
      } else if (request.method === "DELETE" && url.pathname.startsWith("/api/sessions/")) {
        const sessionId = url.pathname.split("/")[3];
        response = sessionId ? await handleDeleteSession(env, sessionId) : new Response("Not Found", { status: 404 });
      } else if (request.method === "POST" && url.pathname.endsWith("/chat/stream")) {
        const sessionId = url.pathname.split("/")[3];
        if (!sessionId) {
          response = new Response("Not Found", { status: 404 });
        } else {
          const body = (await request.json()) as { message: string; mode?: string; lat?: number; lng?: number };
          response = new Response(await buildSingleEventStream(env, sessionId, body), {
            headers: { "content-type": "text/event-stream" }
          });
        }
      } else if (request.method === "POST" && url.pathname.endsWith("/chat")) {
        const sessionId = url.pathname.split("/")[3];
        if (!sessionId) {
          response = new Response("Not Found", { status: 404 });
        } else {
          const body = (await request.json()) as { message: string; mode?: string; lat?: number; lng?: number };
          response = await handlePrompt(env, sessionId, body);
        }
      } else {
        response = new Response("Not Found", { status: 404 });
      }

      if (isApiRoute) {
        return withCors(response, request, env);
      }

      return response;
    } catch (error) {
      if (!isApiRoute) {
        throw error;
      }

      const detail = error instanceof Error ? error.message : "Internal Server Error";
      return withCors(Response.json({ detail }, { status: 500 }), request, env);
    }
  }
};
