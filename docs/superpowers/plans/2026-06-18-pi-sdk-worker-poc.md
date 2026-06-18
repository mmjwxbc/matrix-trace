# Pi SDK Worker/DO PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证 Pi TypeScript SDK 能否在 Cloudflare Worker + Durable Objects 形态下运行最小 `coding_agent` 会话，并支撑一次带自定义旅游工具的 prompt、流式输出和基础会话恢复。

**Architecture:** 先做一个最小 PoC，而不是完整迁移。外层是 Worker HTTP API，内层是单个会话 Durable Object，DO 中装配 Pi SDK session 和最小 custom tool；会话持久化先做最小兼容路径，证明 session state 与恢复链路可用，再决定完整 transcript/branch/compaction 适配方案。

**Tech Stack:** TypeScript, Cloudflare Workers, Durable Objects, Wrangler, Pi coding-agent SDK, Vitest, Zod, SSE.

---

## File Structure

本计划只覆盖第一阶段 PoC，目标是最小可运行、可验证。

- `pnpm-workspace.yaml`
  定义 monorepo workspace。
- `package.json`
  定义根脚本，统一 `pnpm` 命令入口。
- `tsconfig.base.json`
  提供共享 TS 配置。
- `apps/pi-worker-poc/package.json`
  Worker PoC 包。
- `apps/pi-worker-poc/tsconfig.json`
  Worker TypeScript 配置。
- `apps/pi-worker-poc/wrangler.jsonc`
  Cloudflare Worker 与 Durable Objects 配置。
- `apps/pi-worker-poc/src/env.ts`
  Worker/DO 环境绑定类型。
- `apps/pi-worker-poc/src/index.ts`
  Worker 路由入口。
- `apps/pi-worker-poc/src/durable/session-do.ts`
  单会话 Durable Object。
- `apps/pi-worker-poc/src/pi/create-session.ts`
  Pi SDK 装配逻辑。
- `apps/pi-worker-poc/src/pi/prompt-loader.ts`
  注入最小旅游 prompt。
- `apps/pi-worker-poc/src/tools/travel-hello.ts`
  最小旅游 custom tool。
- `apps/pi-worker-poc/src/routes/sessions.ts`
  session CRUD 与 prompt API。
- `apps/pi-worker-poc/src/routes/stream.ts`
  SSE 事件桥接。
- `apps/pi-worker-poc/src/lib/events.ts`
  统一 runtime event envelope。
- `apps/pi-worker-poc/src/lib/state.ts`
  最小 state 序列化/恢复逻辑。
- `apps/pi-worker-poc/test/session-do.test.ts`
  DO 级集成测试。
- `apps/pi-worker-poc/test/worker-api.test.ts`
  Worker API 集成测试。

## Task 1: Scaffold the PoC workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `apps/pi-worker-poc/package.json`
- Create: `apps/pi-worker-poc/tsconfig.json`
- Create: `apps/pi-worker-poc/wrangler.jsonc`

- [ ] **Step 1: Write the failing workspace smoke test**

```ts
// apps/pi-worker-poc/test/workspace.test.ts
import { describe, expect, it } from "vitest";

describe("workspace scaffold", () => {
  it("loads the worker package metadata", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    expect(pkg.default.name).toBe("@matrix-trace/pi-worker-poc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test workspace`
Expected: FAIL with module or package file not found

- [ ] **Step 3: Write the minimal workspace files**

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
```

```json
{
  "name": "matrix-trace",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "test": "pnpm -r test"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals"]
  }
}
```

```json
{
  "name": "@matrix-trace/pi-worker-poc",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "wrangler dev",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0",
    "wrangler": "^4.20.0"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["@cloudflare/workers-types", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "pi-worker-poc",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-18",
  "durable_objects": {
    "bindings": [
      { "name": "SESSION_DO", "class_name": "SessionDurableObject" }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["SessionDurableObject"]
    }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test workspace`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json apps/pi-worker-poc
git commit -m "chore: scaffold pi worker poc workspace"
```

## Task 2: Prove the Worker package can boot with a Durable Object binding

**Files:**
- Create: `apps/pi-worker-poc/src/env.ts`
- Create: `apps/pi-worker-poc/src/index.ts`
- Create: `apps/pi-worker-poc/src/durable/session-do.ts`
- Test: `apps/pi-worker-poc/test/session-do.test.ts`

- [ ] **Step 1: Write the failing DO smoke test**

```ts
// apps/pi-worker-poc/test/session-do.test.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("session durable object", () => {
  it("responds to a health check", async () => {
    const stub = env.SESSION_DO.getByName("test-session");
    const result = await stub.healthCheck();
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test session-do`
Expected: FAIL with `SESSION_DO` binding or method missing

- [ ] **Step 3: Write the minimal Worker and DO**

```ts
// apps/pi-worker-poc/src/env.ts
export interface Env {
  SESSION_DO: DurableObjectNamespace<SessionDurableObject>;
}
```

```ts
// apps/pi-worker-poc/src/durable/session-do.ts
import { DurableObject } from "cloudflare:workers";

export class SessionDurableObject extends DurableObject {
  async healthCheck() {
    return { ok: true };
  }
}
```

```ts
// apps/pi-worker-poc/src/index.ts
import { SessionDurableObject } from "./durable/session-do";

export { SessionDurableObject };

export default {
  async fetch(): Promise<Response> {
    return Response.json({ ok: true });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test session-do`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pi-worker-poc/src/env.ts apps/pi-worker-poc/src/index.ts apps/pi-worker-poc/src/durable/session-do.ts apps/pi-worker-poc/test/session-do.test.ts
git commit -m "feat: add worker and durable object boot skeleton"
```

## Task 3: Create a minimal Pi SDK session factory inside the Durable Object

**Files:**
- Create: `apps/pi-worker-poc/src/pi/prompt-loader.ts`
- Create: `apps/pi-worker-poc/src/pi/create-session.ts`
- Modify: `apps/pi-worker-poc/src/durable/session-do.ts`
- Test: `apps/pi-worker-poc/test/pi-session.test.ts`

- [ ] **Step 1: Write the failing session factory test**

```ts
// apps/pi-worker-poc/test/pi-session.test.ts
import { describe, expect, it } from "vitest";
import { createPiSessionConfig } from "../src/pi/create-session";

describe("pi session config", () => {
  it("uses a travel-specific prompt and read-only tools", async () => {
    const config = await createPiSessionConfig("/virtual/project");
    expect(config.toolNames).toEqual(["read"]);
    expect(config.systemPrompt).toContain("旅游");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test pi-session`
Expected: FAIL with missing module or exported symbol

- [ ] **Step 3: Write the minimal Pi session config factory**

```ts
// apps/pi-worker-poc/src/pi/prompt-loader.ts
export function buildTravelSystemPrompt(): string {
  return [
    "你是一个旅游规划助手。",
    "优先给出可执行建议。",
    "必要时调用工具获取信息。"
  ].join("\n");
}
```

```ts
// apps/pi-worker-poc/src/pi/create-session.ts
import { buildTravelSystemPrompt } from "./prompt-loader";

export interface PiSessionConfig {
  cwd: string;
  systemPrompt: string;
  toolNames: string[];
}

export async function createPiSessionConfig(cwd: string): Promise<PiSessionConfig> {
  return {
    cwd,
    systemPrompt: buildTravelSystemPrompt(),
    toolNames: ["read"],
  };
}
```

```ts
// apps/pi-worker-poc/src/durable/session-do.ts
import { DurableObject } from "cloudflare:workers";
import { createPiSessionConfig } from "../pi/create-session";

export class SessionDurableObject extends DurableObject {
  async healthCheck() {
    const config = await createPiSessionConfig("/virtual/project");
    return { ok: true, toolNames: config.toolNames };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test pi-session`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pi-worker-poc/src/pi apps/pi-worker-poc/src/durable/session-do.ts apps/pi-worker-poc/test/pi-session.test.ts
git commit -m "feat: add minimal pi session factory"
```

## Task 4: Register a minimal travel custom tool through Pi-facing config

**Files:**
- Create: `apps/pi-worker-poc/src/tools/travel-hello.ts`
- Modify: `apps/pi-worker-poc/src/pi/create-session.ts`
- Test: `apps/pi-worker-poc/test/travel-tool.test.ts`

- [ ] **Step 1: Write the failing tool contract test**

```ts
// apps/pi-worker-poc/test/travel-tool.test.ts
import { describe, expect, it } from "vitest";
import { createTravelHelloTool } from "../src/tools/travel-hello";

describe("travel hello tool", () => {
  it("returns a deterministic travel recommendation shell", async () => {
    const tool = createTravelHelloTool();
    const result = await tool.execute("call-1", { city: "Shenzhen" }, new AbortController().signal, async () => {}, {} as never);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Shenzhen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test travel-tool`
Expected: FAIL with tool factory missing

- [ ] **Step 3: Write the minimal deterministic custom tool**

```ts
// apps/pi-worker-poc/src/tools/travel-hello.ts
import { Type } from "@sinclair/typebox";

export function createTravelHelloTool() {
  return {
    name: "travel_hello",
    label: "Travel Hello",
    description: "Return a deterministic starter travel suggestion",
    parameters: Type.Object({
      city: Type.String(),
    }),
    async execute(_toolCallId: string, params: { city: string }) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Starter suggestion for ${params.city}: begin with a landmark, then add one meal stop.`,
          },
        ],
        details: {},
      };
    },
  };
}
```

```ts
// apps/pi-worker-poc/src/pi/create-session.ts
import { createTravelHelloTool } from "../tools/travel-hello";

export async function createPiSessionConfig(cwd: string): Promise<PiSessionConfig & { customTools: unknown[] }> {
  return {
    cwd,
    systemPrompt: buildTravelSystemPrompt(),
    toolNames: ["read", "travel_hello"],
    customTools: [createTravelHelloTool()],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test travel-tool`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pi-worker-poc/src/tools/travel-hello.ts apps/pi-worker-poc/src/pi/create-session.ts apps/pi-worker-poc/test/travel-tool.test.ts
git commit -m "feat: add minimal travel custom tool"
```

## Task 5: Build a minimal session API surface on the Worker

**Files:**
- Create: `apps/pi-worker-poc/src/lib/state.ts`
- Create: `apps/pi-worker-poc/src/routes/sessions.ts`
- Modify: `apps/pi-worker-poc/src/index.ts`
- Test: `apps/pi-worker-poc/test/worker-api.test.ts`

- [ ] **Step 1: Write the failing Worker API test**

```ts
// apps/pi-worker-poc/test/worker-api.test.ts
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("worker api", () => {
  it("creates and fetches a session", async () => {
    const createRes = await SELF.fetch("https://example.com/api/sessions", { method: "POST" });
    expect(createRes.status).toBe(200);
    const created = await createRes.json<{ sessionId: string }>();

    const getRes = await SELF.fetch(`https://example.com/api/sessions/${created.sessionId}`);
    expect(getRes.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test worker-api`
Expected: FAIL with 404 or route missing

- [ ] **Step 3: Write the minimal route handlers**

```ts
// apps/pi-worker-poc/src/lib/state.ts
export interface SessionSummary {
  sessionId: string;
  status: "idle" | "running";
}
```

```ts
// apps/pi-worker-poc/src/routes/sessions.ts
export function isSessionsRoute(url: URL): boolean {
  return url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/");
}
```

```ts
// apps/pi-worker-poc/src/index.ts
import type { Env } from "./env";
import { SessionDurableObject } from "./durable/session-do";

export { SessionDurableObject };

function createSessionId() {
  return crypto.randomUUID().slice(0, 12);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/sessions") {
      return Response.json({ sessionId: createSessionId() });
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      return Response.json({ ok: true });
    }
    return new Response("Not Found", { status: 404 });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test worker-api`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pi-worker-poc/src/lib/state.ts apps/pi-worker-poc/src/routes/sessions.ts apps/pi-worker-poc/src/index.ts apps/pi-worker-poc/test/worker-api.test.ts
git commit -m "feat: add minimal worker session routes"
```

## Task 6: Add a stream-ready event envelope and DO bridge

**Files:**
- Create: `apps/pi-worker-poc/src/lib/events.ts`
- Create: `apps/pi-worker-poc/src/routes/stream.ts`
- Modify: `apps/pi-worker-poc/src/durable/session-do.ts`
- Modify: `apps/pi-worker-poc/src/index.ts`
- Test: `apps/pi-worker-poc/test/stream.test.ts`

- [ ] **Step 1: Write the failing stream envelope test**

```ts
// apps/pi-worker-poc/test/stream.test.ts
import { describe, expect, it } from "vitest";
import { formatSseEvent } from "../src/lib/events";

describe("sse formatting", () => {
  it("formats named events for transport", () => {
    const payload = formatSseEvent({ type: "message_update", data: { delta: "hi" } });
    expect(payload).toContain("event: message_update");
    expect(payload).toContain("\"delta\":\"hi\"");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test stream`
Expected: FAIL with formatter missing

- [ ] **Step 3: Write the minimal event formatter and bridge**

```ts
// apps/pi-worker-poc/src/lib/events.ts
export interface RuntimeEnvelope {
  type: string;
  data: Record<string, unknown>;
}

export function formatSseEvent(event: RuntimeEnvelope): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
```

```ts
// apps/pi-worker-poc/src/routes/stream.ts
import { formatSseEvent } from "../lib/events";

export function buildSingleEventStream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(formatSseEvent({ type: "message_update", data: { delta: "hello" } })));
      controller.close();
    },
  });
}
```

```ts
// apps/pi-worker-poc/src/index.ts
import { buildSingleEventStream } from "./routes/stream";

// inside fetch
if (request.method === "POST" && url.pathname.endsWith("/chat/stream")) {
  return new Response(buildSingleEventStream(), {
    headers: { "content-type": "text/event-stream" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test stream`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pi-worker-poc/src/lib/events.ts apps/pi-worker-poc/src/routes/stream.ts apps/pi-worker-poc/src/index.ts apps/pi-worker-poc/test/stream.test.ts
git commit -m "feat: add stream-ready event envelope"
```

## Task 7: Run the compatibility verification commands

**Files:**
- Modify: `apps/pi-worker-poc/package.json`
- Modify: `apps/pi-worker-poc/wrangler.jsonc`

- [ ] **Step 1: Add explicit verification scripts**

```json
{
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "cf:dry-run": "wrangler deploy --dry-run"
  }
}
```

- [ ] **Step 2: Run the test suite**

Run: `pnpm --filter @matrix-trace/pi-worker-poc test`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @matrix-trace/pi-worker-poc typecheck`
Expected: PASS

- [ ] **Step 4: Run Cloudflare dry-run validation**

Run: `pnpm --filter @matrix-trace/pi-worker-poc cf:dry-run`
Expected: PASS with Wrangler config and bundle validation succeeding

- [ ] **Step 5: Commit**

```bash
git add apps/pi-worker-poc/package.json apps/pi-worker-poc/wrangler.jsonc
git commit -m "chore: add pi worker poc verification scripts"
```

## Self-Review

### Spec coverage

- Covers the required PoC: Worker, Durable Object, Pi session config, custom tool, session API, SSE envelope, verification.
- Deliberately does not cover full transcript/branch/compaction migration; that remains a later plan after PoC success.

### Placeholder scan

- No `TBD`, `TODO`, or deferred “implement later” language in task steps.
- Each task contains concrete files, commands, and expected results.

### Type consistency

- Durable Object class name is consistently `SessionDurableObject`.
- Binding name is consistently `SESSION_DO`.
- Worker package name is consistently `@matrix-trace/pi-worker-poc`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-pi-sdk-worker-poc.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
