import type { Env } from "../env.ts";
import type { PromptRequest } from "../lib/state.ts";
import { getSessionStub } from "./sessions.ts";

export async function proxyChatStream(env: Env, sessionId: string, body: PromptRequest): Promise<Response> {
  const stub = getSessionStub(env, sessionId);
  const doResponse = await stub.fetch(
    new Request("https://do/prompt/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  const headers = new Headers(doResponse.headers);
  headers.set("content-type", "text/event-stream");
  headers.set("cache-control", "no-cache");
  return new Response(doResponse.body, {
    status: doResponse.status,
    statusText: doResponse.statusText,
    headers
  });
}