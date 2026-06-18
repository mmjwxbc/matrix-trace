# Travel Agent Cloudflare TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 `./tmp/67-Team` 里的 Python 旅游规划 agent，迁移为一套可部署到 Cloudflare 的全栈 TypeScript 应用，保留“会话化旅游规划 + 流式事件 + 工具编排 + 状态持久化”能力，并以 Workers + Durable Objects 作为核心运行时。

**Architecture:** 采用“前端 Web 应用 + 边缘 API Worker + 会话 Durable Object + Provider Gateway + 共享领域包”的结构。`activity_workflow` 作为主业务闭环被完整迁移；当前 Python 中的 `coding_agent` 经验只吸收其 session/runtime 抽象，不做一比一复刻，避免把两套运行模型一起搬进新系统。

**Tech Stack:** TypeScript, Cloudflare Workers, Durable Objects, Wrangler, Vitest, Zod, React, Vite, SSE/streaming fetch, Cloudflare bindings, optional KV/R2 for non-hot storage.

---

## Context Summary

### SDK understanding from `./tmp/pi/packages/coding-agent/examples/sdk`

- `createAgentSession()` 是最小入口，默认会自动发现 skills、extensions、tools、`AGENTS.md`、settings、session storage。
- `DefaultResourceLoader` 是 Pi SDK 的核心装配点，可以覆盖 system prompt、skills、prompts、extensions、context files。
- `SessionManager` / `createAgentSessionRuntime()` 解决的是“会话持久化 + new/resume/fork/switch”问题，这一层思想比具体实现更值得迁移到新系统。
- `tools` 是按名称白名单启用的；自定义工具更适合走 extension/runtime 注册，而不是把工具散落在业务层里。
- `agent runtime` 的关键模式是：当 active session 被替换后，要重新绑定事件订阅和扩展。

### Current project understanding from `./tmp/67-Team`

- 主业务其实在 `app/activity_workflow/`，是阶段状态机，不是自由式 tool loop。
- `app/activity_workflow/session_manager.py` 目前把 session/state 序列化到本地 JSON；这正好对应 Durable Object 的天然迁移点。
- `server/routes/activity_workflow.py` 暴露了同步与 SSE 流式接口；Cloudflare 版本应保留此交互模型。
- `app/activity_workflow/runtime.py` 已经把“事件流、工具调用、状态写回”抽成 runtime，这为 TypeScript 迁移提供了很清晰的模块边界。
- `app/maps/`、`app/web/`、`app/llm/` 都已经有 provider 抽象，迁移时应保留接口、替换实现。
- `desktop/` 是 Electron + React；迁移到 Cloudflare 后建议优先转为 Web 前端，而不是继续保留 Python 子进程/Electron 主进程耦合。

## Recommended Migration Decision

推荐采用 **“保留 workflow 核心、舍弃 Python server/desktop 宿主、重建 TS edge-native runtime”** 的路径。

原因：

- `activity_workflow` 已经有固定 stage pipeline，很适合映射到 Durable Object 内的单会话编排器。
- Durable Objects 适合承载“每个会话一个强一致状态单元”，比把 session 放进无状态 Worker 或外部数据库更贴近现有模型。
- Cloudflare 官方当前建议新项目优先使用 Durable Object RPC，兼容日期大于等于 `2024-04-03` 的项目优先采用 RPC 方法；新配置建议使用 `wrangler.jsonc`，并为新的 DO 类声明 `new_sqlite_classes`。这些都适合新项目直接按最新模式落地。推断上，我们应设计成 `Worker -> DO RPC -> provider calls -> event stream` 的调用链，而不是 `Worker -> DO fetch shim`。来源：Cloudflare Durable Objects docs 与 Wrangler config docs，最后更新页显示为 2026 年 4 月/6 月。[Durable Objects overview](https://developers.cloudflare.com/durable-objects/) [Invoke methods](https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/) [Storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/) [Wrangler config](https://developers.cloudflare.com/workers/wrangler/configuration/)

## Proposed Target Structure

```text
apps/
  travel-web/
    src/
      app/
      pages/
      components/
      lib/api/
  travel-worker/
    src/
      index.ts
      env.ts
      routes/
      durable/
      services/
      streaming/
      providers/
      tools/
      workflow/
      storage/
      observability/
    wrangler.jsonc
packages/
  travel-domain/
    src/
      schemas/
      state/
      scoring/
      planning/
      messages/
  travel-sdk/
    src/
      session-runtime.ts
      client.ts
      events.ts
tests/
  unit/
  integration/
  fixtures/
```

## Assumptions

- [ ] 先迁移 `activity_workflow`，不做 Python `coding_agent` 的完整行为复刻。
- [ ] 前端目标先做 Web，不把 Electron 打包列为第一阶段目标。
- [ ] 地图、Web 搜索、LLM 仍然保留 provider 适配层，优先保持接口稳定。
- [ ] 会话状态以 Durable Object SQLite 存储为主，只有归档/附件类数据才考虑 KV/R2。
- [ ] SSE 继续保留，但 DO 内部事件会先收敛为统一 event envelope。

### Task 1: Scaffold the Cloudflare TypeScript workspace

**Files:**
- Create: `apps/travel-worker/package.json`
- Create: `apps/travel-worker/tsconfig.json`
- Create: `apps/travel-worker/wrangler.jsonc`
- Create: `apps/travel-worker/src/index.ts`
- Create: `apps/travel-worker/src/env.ts`
- Create: `packages/travel-domain/package.json`
- Create: `packages/travel-domain/tsconfig.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Create the workspace skeleton**

```text
apps/travel-worker
packages/travel-domain
tests
```

- [ ] **Step 2: Add Worker config with Durable Objects and SQLite migrations**

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "travel-agent-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-18",
  "durable_objects": {
    "bindings": [
      { "name": "TRAVEL_SESSION", "class_name": "TravelSessionDO" }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["TravelSessionDO"]
    }
  ]
}
```

- [ ] **Step 3: Verify the scaffold**

Run: `pnpm install`
Expected: workspace dependencies install successfully

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml apps/travel-worker packages/travel-domain
git commit -m "chore: scaffold cloudflare typescript travel agent workspace"
```

### Task 2: Port the Python workflow schema and state model into shared TypeScript domain types

**Files:**
- Create: `packages/travel-domain/src/schemas/intent.ts`
- Create: `packages/travel-domain/src/schemas/plans.ts`
- Create: `packages/travel-domain/src/schemas/messages.ts`
- Create: `packages/travel-domain/src/state/agent-state.ts`
- Create: `packages/travel-domain/src/index.ts`
- Reference: `./tmp/67-Team/app/activity_workflow/schemas.py`

- [ ] **Step 1: Define Zod-first schemas for state and message envelopes**

```ts
export const AgentActionSchema = z.enum([
  "parse_intent",
  "derive_constraints",
  "web_search",
  "generate_candidates",
  "check_availability",
  "score_candidates",
  "execute_plan",
  "summarize_plan",
  "done",
  "failed",
]);
```

- [ ] **Step 2: Mirror the Python `AgentState` shape before optimizing**

```ts
export interface AgentState {
  status: "running" | "done" | "failed";
  rawInput: string;
  sceneProfile: ParsedIntent | null;
  constraints: ConstraintSet | null;
  candidatePlans: CandidatePlan[];
  finalPlan: FinalPlan | null;
  runtimeContext: Record<string, unknown>;
  toolResults: Record<string, unknown>;
  errors: string[];
}
```

- [ ] **Step 3: Add snapshot and event contracts shared by Worker, DO, and Web**

Run: `pnpm --filter @travel/domain test`
Expected: initial schema tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/travel-domain
git commit -m "feat: port workflow domain schemas to typescript"
```

### Task 3: Rebuild provider interfaces and tool contracts in TypeScript

**Files:**
- Create: `apps/travel-worker/src/providers/llm.ts`
- Create: `apps/travel-worker/src/providers/maps.ts`
- Create: `apps/travel-worker/src/providers/web.ts`
- Create: `apps/travel-worker/src/tools/types.ts`
- Create: `apps/travel-worker/src/tools/*.ts`
- Reference: `./tmp/67-Team/app/llm/provider.py`
- Reference: `./tmp/67-Team/app/maps/*.py`
- Reference: `./tmp/67-Team/app/activity_workflow/tools/*.py`

- [ ] **Step 1: Freeze provider interfaces before implementation**

```ts
export interface LlmProvider {
  parseIntent(input: IntentPrompt): Promise<ParsedIntent>;
  buildSummary(input: SummaryPrompt): Promise<string>;
}
```

- [ ] **Step 2: Port tools as pure functions plus thin side-effect wrappers**

```ts
export interface WorkflowTool<I, O> {
  name: string;
  run(input: I, ctx: ToolContext): Promise<ToolResult<O>>;
}
```

- [ ] **Step 3: Split tools into deterministic and networked groups**

Run: `pnpm --filter @travel/worker test tools`
Expected: deterministic tools run against fixtures without remote credentials

- [ ] **Step 4: Commit**

```bash
git add apps/travel-worker/src/providers apps/travel-worker/src/tools
git commit -m "feat: add worker provider and tool contracts"
```

### Task 4: Implement session Durable Object as the single source of truth

**Files:**
- Create: `apps/travel-worker/src/durable/travel-session-do.ts`
- Create: `apps/travel-worker/src/storage/session-repository.ts`
- Create: `apps/travel-worker/src/streaming/event-buffer.ts`
- Reference: `./tmp/67-Team/app/activity_workflow/session_manager.py`
- Reference: `./tmp/67-Team/app/activity_workflow/memory.py`

- [ ] **Step 1: Model one Durable Object per travel session**

```ts
export class TravelSessionDO extends DurableObject<Env> {
  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {}
  async getState(): Promise<AgentState | null> {}
  async prompt(input: PromptInput): Promise<PromptAccepted> {}
  async drainEvents(cursor?: string): Promise<RuntimeEventBatch> {}
}
```

- [ ] **Step 2: Initialize SQLite tables once in `blockConcurrencyWhile()`**

```ts
this.ctx.blockConcurrencyWhile(async () => {
  this.ctx.storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS session_state (...);
    CREATE TABLE IF NOT EXISTS runtime_events (...);
  `);
});
```

- [ ] **Step 3: Persist first, then update in-memory cache**

Run: `pnpm --filter @travel/worker test durable`
Expected: DO state survives restart simulation and event replay still works

- [ ] **Step 4: Commit**

```bash
git add apps/travel-worker/src/durable apps/travel-worker/src/storage apps/travel-worker/src/streaming
git commit -m "feat: add durable object backed session state"
```

### Task 5: Port the stage orchestrator and runtime loop

**Files:**
- Create: `apps/travel-worker/src/workflow/orchestrator.ts`
- Create: `apps/travel-worker/src/workflow/runtime.ts`
- Create: `apps/travel-worker/src/workflow/actions/*.ts`
- Reference: `./tmp/67-Team/app/activity_workflow/orchestration.py`
- Reference: `./tmp/67-Team/app/activity_workflow/runtime.py`
- Reference: `./tmp/67-Team/app/activity_workflow/agent.py`

- [ ] **Step 1: Port `resolve_next_action()` exactly before refactoring**

```ts
export function resolveNextAction(state: AgentState): AgentAction {
  if (state.status === "failed") return "failed";
  if (state.finalPlan) return "done";
  if (!state.sceneProfile) return "parse_intent";
  if (!state.constraints) return "derive_constraints";
  if (!state.runtimeContext.web_search_done) return "web_search";
  if (!state.candidatePlans.length) return "generate_candidates";
  if (!state.runtimeContext.availability_checked) return "check_availability";
  if (!state.runtimeContext.plans_scored) return "score_candidates";
  if (!state.runtimeContext.chosen_plan_id) return "execute_plan";
  return "summarize_plan";
}
```

- [ ] **Step 2: Emit runtime events on every phase boundary and tool call**

- [ ] **Step 3: Ensure long-running prompt execution stays inside the DO, not the outer Worker**

Run: `pnpm --filter @travel/worker test workflow`
Expected: staged progression matches the Python happy-path fixtures

- [ ] **Step 4: Commit**

```bash
git add apps/travel-worker/src/workflow
git commit -m "feat: port workflow orchestrator and runtime loop"
```

### Task 6: Build HTTP routes and streaming adapters in the Worker

**Files:**
- Create: `apps/travel-worker/src/routes/sessions.ts`
- Create: `apps/travel-worker/src/routes/chat.ts`
- Create: `apps/travel-worker/src/routes/admin.ts`
- Modify: `apps/travel-worker/src/index.ts`
- Reference: `./tmp/67-Team/server/routes/activity_workflow.py`
- Reference: `./tmp/67-Team/server/adapters/sse_bridge.py`

- [ ] **Step 1: Expose session CRUD on top of deterministic DO ids**

```ts
POST   /api/activity-workflow/sessions
GET    /api/activity-workflow/sessions
GET    /api/activity-workflow/sessions/:id
DELETE /api/activity-workflow/sessions/:id
POST   /api/activity-workflow/sessions/:id/chat
POST   /api/activity-workflow/sessions/:id/chat/stream
```

- [ ] **Step 2: Implement SSE by bridging DO event batches to `text/event-stream`**

- [ ] **Step 3: Keep sync and stream routes sharing one prompt path**

Run: `pnpm --filter @travel/worker test routes`
Expected: sync responses return final state; stream responses end with final state payload

- [ ] **Step 4: Commit**

```bash
git add apps/travel-worker/src/index.ts apps/travel-worker/src/routes
git commit -m "feat: add worker http and sse session routes"
```

### Task 7: Rebuild the front end as a Web app against the Worker API

**Files:**
- Create: `apps/travel-web/src/App.tsx`
- Create: `apps/travel-web/src/pages/ChatPage.tsx`
- Create: `apps/travel-web/src/lib/api/client.ts`
- Create: `apps/travel-web/src/lib/api/sse.ts`
- Create: `apps/travel-web/src/stores/*.ts`
- Reference: `./tmp/67-Team/desktop/src/renderer/src/**/*`

- [ ] **Step 1: Port the existing chat/session/sidebar UX first, not the Electron shell**

- [ ] **Step 2: Replace local process calls with HTTPS + SSE client abstractions**

- [ ] **Step 3: Preserve route cards, streaming messages, and session navigation**

Run: `pnpm --filter @travel/web test`
Expected: chat input, session list, and streaming message rendering tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/travel-web
git commit -m "feat: add web frontend for travel workflow worker"
```

### Task 8: Add observability, fixtures, and deployment pipeline

**Files:**
- Create: `apps/travel-worker/src/observability/logger.ts`
- Create: `tests/integration/workflow-happy-path.test.ts`
- Create: `tests/integration/workflow-fallback.test.ts`
- Create: `.github/workflows/deploy.yml`
- Modify: `apps/travel-worker/wrangler.jsonc`

- [ ] **Step 1: Capture traceable event ids across Worker, DO, and provider calls**

- [ ] **Step 2: Port the Python regression scenarios into Vitest fixtures**

- [ ] **Step 3: Add staged deploy flow**

Run: `pnpm test`
Expected: unit and integration suites pass locally

Run: `pnpm --filter @travel/worker wrangler deploy --dry-run`
Expected: Wrangler validates config and bundle without deployment errors

- [ ] **Step 4: Commit**

```bash
git add apps/travel-worker tests .github
git commit -m "chore: add verification and cloudflare deployment pipeline"
```

## Risks To Resolve Early

- `activity_workflow` 当前有不少工具依赖本地 mock 数据与 Python 数据模型，迁移时最容易在字段兼容性上出错。
- Cloudflare 上的流式输出要避免“外层 Worker 持有太多会话状态”；状态必须由 DO 持有，Worker 只做路由和输出桥接。
- 如果未来仍要保留 Pi SDK 风格的“new/resume/fork/switch session”能力，需要单独设计 `travel-sdk`，而不是把前端直接绑死在 HTTP 接口上。
- 若要保留管理员调试页，事件和 prompt 快照从第一版就要结构化落库，否则后补成本很高。

## Definition of Done

- 浏览器端可以创建/查看/删除 session，并对单个 session 发起流式旅游规划请求。
- 每个 session 对应一个 Durable Object，刷新页面后状态仍可恢复。
- `parse_intent -> summarize_plan` 的 happy path 与 fallback path 都有自动化测试。
- Wrangler dry-run 通过，生产部署配置已准备好。
- 旧 Python 项目可以继续作为行为对照，但新系统不再依赖 Python 进程。

## Recommended Execution Order

1. 先落 `packages/travel-domain`，把 Python 状态模型冻结成 TS 契约。
2. 再做 `TravelSessionDO`，先跑通 session state 与事件流。
3. 然后迁移 workflow runtime 与工具。
4. 最后接 Web 前端和部署链路。
