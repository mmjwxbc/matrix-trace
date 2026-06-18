# Pi SDK Worker Coding Agent Design

## Goal

把 `./tmp/67-Team` 当前基于 Python 仿写的 `coding_agent`，迁移为一套直接嵌入 Pi TypeScript SDK 的 Cloudflare Worker API。迁移目标不是把 Python 内部实现逐行翻译成 TypeScript，而是用 Pi SDK 原生提供的 session/runtime/transcript/compaction/resource-loading 能力，复刻当前产品行为，并把旅游规划相关业务逻辑迁移为 TypeScript 的 prompt、tools、provider 适配和 API 层。

## Scope

本次设计只覆盖 `coding_agent` 主线。

- 覆盖：`./tmp/67-Team/app/coding_agent/*`
- 覆盖：`./tmp/67-Team/app/agent/*`
- 覆盖：`./tmp/67-Team/app/shared/*`
- 覆盖：`./tmp/67-Team/app/tools/*`
- 覆盖：`./tmp/67-Team/server/routes/chat.py`、`sessions.py` 以及相关 session API
- 暂不覆盖：`./tmp/67-Team/app/activity_workflow/*`
- 暂不覆盖：Electron 桌面壳的完整迁移

## Current State

### What the Python coding_agent actually is

`67-Team` 当前的 Python `coding_agent` 并不是一个轻量 wrapper，而是一整套会话式 harness：

- `app/coding_agent/agent.py`
  负责 prompt state 准备、system prompt 注入、tool 调用控制、streaming loop 结果回写。
- `app/coding_agent/agent_session.py`
  负责 session runtime、prepare/run prompt、事件订阅、compact 前后行为。
- `app/coding_agent/session_manager.py`
  负责 transcript 文件恢复、session list/create/delete/update、branch/tree 入口。
- `app/coding_agent/context_engineering.py`
  负责 compaction、branch summary、上下文裁剪和 token 估算。
- `app/coding_agent/resources.py`
  负责 system prompt、developer prompt、skills、上下文文件装配。
- `app/coding_agent/transcript.py`
  负责消息到 transcript entry 的映射与状态重建。
- `app/agent/loop.py`
  负责底层 tool loop、turn lifecycle、streaming、tool result message 生成。

这套结构本质上是在 Python 里复刻 Pi 的 TypeScript `coding-agent`。

### What Pi SDK already provides

基于 `./tmp/pi/packages/coding-agent/src` 的实际代码，Pi TS SDK 已经原生提供：

- `createAgentSession()`
  创建完整 session，并自动装配 model、settings、resource loader、tool 集合、session manager。
- `createAgentSessionServices()`
  创建 cwd 绑定服务，包括 `AuthStorage`、`ModelRegistry`、`SettingsManager`、`DefaultResourceLoader`。
- `createAgentSessionRuntime()`
  管理 session replacement，包括 `newSession()`、`switchSession()`、`fork()`、`importFromJsonl()`。
- `AgentSession`
  负责事件、tool hooks、branch summary、compaction、queue、session persistence、extension runtime。
- `SessionManager`
  负责 transcript/session tree 持久化和恢复。
- `DefaultResourceLoader`
  负责 skills、extensions、prompts、themes、`AGENTS.md`、system prompt 装配。

结论：Python `coding_agent` 的大部分“基础设施代码”在迁移后应该删除，而不是重写。

## Design Decision

采用 **“Pi SDK 作为 agent 内核，Cloudflare Worker/DO 作为宿主与 API 适配层”** 的方案。

### Recommended architecture

```text
Client (Web / future app)
    |
    v
Cloudflare Worker HTTP API
    |
    +-- Session CRUD routes
    +-- Chat / stream routes
    |
    v
Durable Object per session
    |
    +-- Pi AgentSession / AgentSessionRuntime
    +-- Pi ResourceLoader / Settings / ModelRegistry
    +-- Custom travel tools
    +-- Provider adapters (maps / web / llm-specific helpers)
    |
    v
Cloudflare-backed session persistence adapter
```

### Why this is the right boundary

- Pi 已经解决了最复杂的 agent session lifecycle 问题。
- 当前 Python 代码里最不值得再维护的，恰好是 Pi 已经维护中的部分。
- 业务价值主要在旅游规划 prompt、地图/搜索工具、以及对外 API 体验，而不在重复实现 transcript/compaction。
- Cloudflare Worker + Durable Objects 很适合承接“每个 session 一个会话宿主”的形态。

## Alternatives Considered

### Option 1: Full TypeScript rewrite of Python structure

做法：
- 把 `coding_agent`、`agent`、`shared`、`transcript`、`context_engineering` 逐个翻译成 TS。

优点：
- 结构上最接近当前 Python 项目。

缺点：
- 重复造轮子。
- 后续会和 Pi SDK 的能力持续漂移。
- Cloudflare 适配复杂度更高，因为要自己维护整套 session runtime。

不推荐。

### Option 2: Worker wraps a separate Node service that runs Pi SDK

做法：
- Worker 只做网关，真正的 Pi SDK 在单独 Node 进程中运行。

优点：
- 兼容性风险最小。

缺点：
- 失去“直接嵌入 Worker API”的目标。
- 部署和运维复杂度更高。

作为兼容性兜底可保留，但不是主方案。

### Option 3: Direct Worker embedding with Pi SDK plus custom persistence adapter

做法：
- Worker/DO 直接承载 Pi SDK。
- 用自定义 session persistence 适配层替代本地文件系统假设。

优点：
- 最符合目标。
- 最大化复用 Pi。
- 最小化重写量。

缺点：
- 需要尽早验证 Pi SDK 的 Worker 运行时兼容性。

推荐。

## Target System

### 1. Agent core

Pi SDK 成为唯一的 agent runtime 实现。

新系统中：

- 不再保留 Python `ActivityAgent` 等仿写类。
- 用 `createAgentSessionServices()` 装配资源。
- 用 `createAgentSession()` 或 `createAgentSessionFromServices()` 创建会话。
- 用 `createAgentSessionRuntime()` 管理 new/resume/fork/switch。

### 2. Resource model

当前 Python `resources.py` 中的概念保留，但实现切换到 Pi 的 `DefaultResourceLoader`：

- base system prompt
- developer prompt
- append system prompt
- `AGENTS.md` 上下文文件
- skills summary / active skills

设计要求：

- 旅游规划系统 prompt 作为 `systemPromptOverride` 或 `appendSystemPromptOverride` 注入。
- 业务型 slash prompt/模板未来直接走 Pi prompt templates，而不是再做自定义协议。
- 如果还需要“项目级附加规则”，优先复用 `AGENTS.md`。

### 3. Tools

业务迁移重点转向工具层。

保留并迁移：

- `intent_parser`
- `map_geocode`
- `map_search`
- `map_directions`
- `bash`（若 Cloudflare 环境不允许，则需要降级或去除）

设计原则：

- 所有旅游业务工具以 Pi `customTools` 或 extension-registered tools 的形式接入。
- 工具契约全部改成 TS-first schema。
- 纯业务规则与外部 API 调用解耦。

特别说明：

`bash` 工具在 Cloudflare Worker 中大概率不能按本地进程语义保留，因此应视为可选兼容项，而不是基础能力。若产品不再需要任意 shell，迁移时应直接删除。若必须保留，则需要替代为受控远程任务接口，而不是 Worker 内执行。

### 4. Session persistence

这是本次设计中唯一不能直接照搬 Pi 默认实现的部分。

Pi 默认 `SessionManager` 依赖本地 session 文件与 transcript 文件。Cloudflare Worker 环境没有等价本地文件系统，因此需要一层新的宿主适配。

推荐设计：

- 每个会话对应一个 Durable Object。
- Durable Object 内部持有当前 session 的热状态。
- transcript / branch / compaction 所需的持久化，由 DO storage/SQLite 承载。
- 需要评估是：
  - 直接适配 Pi `SessionManager` 的存储接口
  - 还是在 DO 内部做一个兼容层，把 Pi 所需的 session file 行为映射到 DO storage

这里的核心不是重新发明 session 语义，而是让 Pi 现有 session 语义有一个 Cloudflare-compatible persistence backend。

### 5. API layer

当前 Python API 层的产品契约基本保留：

- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `POST /api/sessions/:id/chat`
- `POST /api/sessions/:id/chat/stream`

行为要求：

- sync 接口返回最终 state
- stream 接口保持 SSE 风格
- 用户位置参数 `lat/lng/...` 继续支持
- session metadata 持久化继续存在

内部变化：

- API 不再直接调用 Python session object
- API 改为调用对应 session DO
- SSE 由 Worker 将 DO 内部事件桥接成 `text/event-stream`

### 6. Frontend contract

前端可以暂时不大改，只要保住这些契约：

- session list shape 稳定
- final state shape 稳定
- 流式事件类型稳定或有明确映射

这允许我们先完成服务端/Worker API 迁移，再决定前端是否需要进一步 React/Web 化。

## What gets deleted vs migrated

### Delete / replace with Pi SDK

- Python `app/coding_agent/agent.py`
- Python `app/coding_agent/agent_session.py`
- Python `app/coding_agent/session_manager.py`
- Python `app/coding_agent/context_engineering.py`
- Python `app/coding_agent/resources.py`
- Python `app/coding_agent/transcript.py`
- Python `app/agent/loop.py`

这些职责在 TS 版本里不应继续由项目自研。

### Migrate as project-specific code

- 旅游规划 system prompt
- 业务工具定义
- 地图 provider 适配
- 搜索 provider 适配
- API request/response 适配
- Cloudflare DO session host

## Compatibility Risks

### 1. Pi SDK runtime assumptions

需要尽早验证：

- 是否依赖 Node-only API
- 是否依赖真实文件系统
- 是否依赖 child process / bash 行为
- 是否依赖 TUI/interactive mode 中的 Node 终端能力

预期结论：

- 我们只嵌入 SDK 的 session/runtime/core 层，不引入交互式 TUI。
- 仍然需要处理 session persistence 和 `bash` 两个高风险点。

### 2. SessionManager adaptation complexity

最大技术风险不是 agent loop，而是 Cloudflare 环境下如何承接 Pi session persistence。

必须尽早做最小 spike：

- 用 DO 内创建一个最小 Pi session
- 发一次 prompt
- 持久化并恢复
- 验证 branch/compaction 是否至少可运行

### 3. Tool portability

Python 工具到 TypeScript 迁移本身不难，难点在：

- 外部地图 API SDK 差异
- Cloudflare fetch/runtime 限制
- 工具返回结构和前端期望的一致性

### 4. Event shape drift

如果 Pi 原生事件形状和当前 Python SSE 事件不同，前端可能会受影响。

解决策略：

- Worker API 层做事件映射适配
- 前端先不直接绑定 Pi 原始事件

## Testing Strategy

### Unit tests

- custom tool schema and execution
- provider adapters
- prompt/resource loading
- request to Pi session input mapping

### Integration tests

- create session
- send prompt
- stream output
- persist and reload session
- session fork/switch if retained in public API

### Compatibility spike

在正式迁移前，先做一个最小 PoC：

1. Worker 中创建 Pi session
2. 注册一个最小 custom tool
3. 跑一次 prompt
4. 用 DO 持久化最小 session state

只有这个 PoC 通过，才继续大规模迁移。

## Initial Migration Sequence

### Phase 1

验证 Pi SDK 在 Worker/DO 中的最小可运行性。

### Phase 2

接入自定义旅游 prompt 与最小 custom tools。

### Phase 3

把当前 `/api/sessions` 和 `/chat/stream` 迁移到 Worker。

### Phase 4

补齐地图/搜索 provider 和 session persistence 兼容。

### Phase 5

收敛前端契约与回归测试。

## Success Criteria

- Cloudflare Worker API 可以直接调用 Pi SDK 创建并运行旅游规划会话。
- 至少支持当前 `coding_agent` 的核心聊天与流式输出能力。
- Python 仿写 session/runtime/transcript 层不再是新系统依赖。
- 业务能力迁移集中在 prompt、tools、provider 和 API 层。
- `activity_workflow` 继续留在独立阶段，不阻塞 `coding_agent` 迁移。
