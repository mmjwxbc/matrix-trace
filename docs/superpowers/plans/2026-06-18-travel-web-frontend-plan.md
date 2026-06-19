# Travel Web Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建一个可本地预览并可部署到 Cloudflare Pages 的 Web 前端，迁移 `67-Team` 聊天主流程到浏览器和手机浏览器。

**Architecture:** 新项目 `apps/travel-web` 采用 Vite + React + TypeScript，复用 `67-Team` 已有的 API、SSE、Zustand、聊天与地图组件逻辑，重做 `AppShell`、`ChatPage` 和响应式布局。后端继续使用已有 `apps/pi-worker-poc` Worker API。

**Tech Stack:** Vite, React 18, TypeScript, React Router, Zustand, Tailwind CSS, React Markdown, AMap JSAPI Loader.

---

## File Structure

- Create: `apps/travel-web/package.json`
- Create: `apps/travel-web/tsconfig.json`
- Create: `apps/travel-web/vite.config.ts`
- Create: `apps/travel-web/index.html`
- Create: `apps/travel-web/src/main.tsx`
- Create: `apps/travel-web/src/App.tsx`
- Create: `apps/travel-web/src/vite-env.d.ts`
- Create: `apps/travel-web/src/config/env.ts`
- Create: `apps/travel-web/src/styles/tokens.css`
- Create: `apps/travel-web/src/styles/global.css`
- Create: `apps/travel-web/src/styles/glass.css`
- Create: `apps/travel-web/src/pages/ChatPage.tsx`
- Create: `apps/travel-web/src/components/layout/AppShell.tsx`
- Create: `apps/travel-web/src/components/layout/SessionSidebar.tsx`
- Create: `apps/travel-web/src/components/layout/SessionDrawer.tsx`
- Create: `apps/travel-web/src/components/layout/ContextPanel.tsx`
- Create: `apps/travel-web/src/components/layout/ContextDrawer.tsx`
- Create: `apps/travel-web/src/components/shared/*`
- Create: `apps/travel-web/src/components/chat/*`
- Create: `apps/travel-web/src/components/map/RouteMapCard.tsx`
- Create: `apps/travel-web/src/api/client.ts`
- Create: `apps/travel-web/src/api/sessions.ts`
- Create: `apps/travel-web/src/api/chat.ts`
- Create: `apps/travel-web/src/api/sse.ts`
- Create: `apps/travel-web/src/types/agent.ts`
- Create: `apps/travel-web/src/types/toolResults.ts`
- Create: `apps/travel-web/src/lib/amap.ts`
- Create: `apps/travel-web/src/lib/routeData.ts`
- Create: `apps/travel-web/src/hooks/useSSE.ts`
- Create: `apps/travel-web/src/hooks/useSessions.ts`
- Create: `apps/travel-web/src/hooks/useRouteSession.ts`
- Create: `apps/travel-web/src/hooks/useSessionNavigationActions.ts`
- Create: `apps/travel-web/src/stores/session.ts`
- Create: `apps/travel-web/src/stores/chat.ts`
- Create: `apps/travel-web/.env.example`
- Create: `apps/travel-web/README.md`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

## Task 1: Scaffold the standalone Web frontend

**Files:**
- Create: `apps/travel-web/package.json`
- Create: `apps/travel-web/tsconfig.json`
- Create: `apps/travel-web/vite.config.ts`
- Create: `apps/travel-web/index.html`
- Create: `apps/travel-web/src/main.tsx`
- Create: `apps/travel-web/src/App.tsx`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Write the failing workspace check**

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: FAIL because `apps/travel-web` does not exist yet

- [ ] **Step 2: Create the new app manifest**

```json
{
  "name": "@matrix-trace/travel-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@amap/amap-jsapi-loader": "^1.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^10.1.0",
    "react-router-dom": "^6.26.0",
    "remark-gfm": "^4.0.1",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.5.15",
    "postcss": "^8.5.15",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.9.3",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 3: Create the minimal Vite entry**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/glass.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Add a placeholder app**

```tsx
export function App() {
  return <div>travel-web booting</div>;
}
```

- [ ] **Step 5: Add workspace registration**

```yaml
packages:
  - "apps/*"
```

- [ ] **Step 6: Run the typecheck to verify the scaffold passes**

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/travel-web pnpm-workspace.yaml
git commit -m "feat: scaffold travel web frontend"
```

## Task 2: Port shared types, API client, and SSE client from 67-Team

**Files:**
- Create: `apps/travel-web/src/types/agent.ts`
- Create: `apps/travel-web/src/types/toolResults.ts`
- Create: `apps/travel-web/src/api/client.ts`
- Create: `apps/travel-web/src/api/sessions.ts`
- Create: `apps/travel-web/src/api/chat.ts`
- Create: `apps/travel-web/src/api/sse.ts`
- Create: `apps/travel-web/src/config/env.ts`
- Test: `apps/travel-web/src/config/env.ts` via `typecheck`

- [ ] **Step 1: Write the failing environment resolution expectation**

```ts
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL");
```

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: FAIL until `vite-env.d.ts` and config files exist

- [ ] **Step 2: Port the API client and switch BASE_URL to env**

```ts
import { API_BASE_URL } from "../config/env";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
```

- [ ] **Step 3: Port `sessions.ts`, `chat.ts`, and `sse.ts` with no behavioral changes except env-driven base URL**

```ts
function sessionsBase(): string {
  return "/api/sessions";
}
```

- [ ] **Step 4: Port `agent.ts` and `toolResults.ts` from `67-Team` with minimal normalization**

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/travel-web/src/types apps/travel-web/src/api apps/travel-web/src/config
git commit -m "feat: port web api and state types"
```

## Task 3: Port session/chat stores and SSE hook

**Files:**
- Create: `apps/travel-web/src/stores/session.ts`
- Create: `apps/travel-web/src/stores/chat.ts`
- Create: `apps/travel-web/src/hooks/useSSE.ts`
- Create: `apps/travel-web/src/hooks/useSessions.ts`
- Create: `apps/travel-web/src/hooks/useRouteSession.ts`
- Create: `apps/travel-web/src/hooks/useSessionNavigationActions.ts`
- Create: `apps/travel-web/src/lib/routeData.ts`

- [ ] **Step 1: Port the failing store skeleton**

```ts
export const useSessionStore = create(() => ({
  sessions: [],
  activeSessionId: null
}));
```

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: FAIL until dependent types and helpers are present

- [ ] **Step 2: Port `session.ts` and keep current draft-session behavior**

```ts
createSession: async () => {
  const { session_id } = await sessionsApi.createSession();
  return session_id;
}
```

- [ ] **Step 3: Port `chat.ts` and retain `hydrateFromAgentState()` and SSE fallback behavior**

```ts
if (finalState) {
  hydrateFromAgentState(finalState as unknown as AgentState);
}
```

- [ ] **Step 4: Port `useSSE.ts` exactly, preserving `agent:end + final_state` fallback path**

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/travel-web/src/stores apps/travel-web/src/hooks apps/travel-web/src/lib/routeData.ts
git commit -m "feat: port session and chat state flow"
```

## Task 4: Port reusable UI and map components

**Files:**
- Create: `apps/travel-web/src/components/shared/*`
- Create: `apps/travel-web/src/components/chat/*`
- Create: `apps/travel-web/src/components/map/RouteMapCard.tsx`
- Create: `apps/travel-web/src/lib/amap.ts`
- Create: `apps/travel-web/src/styles/tokens.css`
- Create: `apps/travel-web/src/styles/global.css`
- Create: `apps/travel-web/src/styles/glass.css`

- [ ] **Step 1: Port the shared UI atoms and static styles**

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: FAIL until component imports are wired up

- [ ] **Step 2: Port chat components with no layout redesign yet**

```tsx
export function ChatPane({ onSendChip }: ChatPaneProps) {
  // keep current message flow behavior
}
```

- [ ] **Step 3: Port `RouteMapCard.tsx` and remove Electron-only config access**

```ts
const FALLBACK_AMAP_CONFIG = {
  key: import.meta.env.VITE_AMAP_JSAPI_KEY ?? "",
  securityCode: import.meta.env.VITE_AMAP_JSCODE ?? ""
};
```

- [ ] **Step 4: Update `lib/amap.ts` to browser-only config loading**

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/travel-web/src/components apps/travel-web/src/lib/amap.ts apps/travel-web/src/styles
git commit -m "feat: port chat ui and browser map components"
```

## Task 5: Rebuild AppShell and ChatPage for responsive Web layout

**Files:**
- Modify: `apps/travel-web/src/App.tsx`
- Create: `apps/travel-web/src/pages/ChatPage.tsx`
- Create: `apps/travel-web/src/components/layout/AppShell.tsx`
- Create: `apps/travel-web/src/components/layout/SessionSidebar.tsx`
- Create: `apps/travel-web/src/components/layout/SessionDrawer.tsx`
- Create: `apps/travel-web/src/components/layout/ContextPanel.tsx`
- Create: `apps/travel-web/src/components/layout/ContextDrawer.tsx`

- [ ] **Step 1: Write the routing shell with only `/chat/:sessionId?`**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
```

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: FAIL until page/layout files exist

- [ ] **Step 2: Build `AppShell` with responsive header and drawer state**

```tsx
const isMobile = useMediaQuery("(max-width: 767px)");
```

- [ ] **Step 3: Build desktop sidebar + mobile drawer split**

```tsx
{isDesktop ? <SessionSidebar ... /> : <SessionDrawer ... />}
```

- [ ] **Step 4: Build desktop context panel + mobile context drawer split**

```tsx
{isDesktop ? <ContextPanel /> : <ContextDrawer open={contextOpen} onClose={...} />}
```

- [ ] **Step 5: Update `ChatPage` so send flow, hydrate flow, and route selection still work**

Run: `pnpm --filter @matrix-trace/travel-web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/travel-web/src/App.tsx apps/travel-web/src/pages apps/travel-web/src/components/layout
git commit -m "feat: add responsive chat shell"
```

## Task 6: Make the app actually previewable locally

**Files:**
- Create: `apps/travel-web/.env.example`
- Create: `apps/travel-web/README.md`
- Modify: `package.json`

- [ ] **Step 1: Add local environment example**

```bash
VITE_API_BASE_URL=http://localhost:8787
VITE_AMAP_JSAPI_KEY=
VITE_AMAP_JSCODE=
```

- [ ] **Step 2: Add root-level convenience scripts**

```json
{
  "scripts": {
    "web:dev": "pnpm --filter @matrix-trace/travel-web dev",
    "web:typecheck": "pnpm --filter @matrix-trace/travel-web typecheck"
  }
}
```

- [ ] **Step 3: Run the local preview stack**

Run: `pnpm --filter @matrix-trace/travel-web dev`
Expected: Vite dev server starts and prints a local URL such as `http://localhost:5173`

- [ ] **Step 4: Manual verification**

Open:
- `http://localhost:5173`
- Confirm chat shell renders
- Confirm sending a message hits Worker API
- Confirm `agent:end` hydrates final state

- [ ] **Step 5: Commit**

```bash
git add apps/travel-web/.env.example apps/travel-web/README.md package.json
git commit -m "chore: add local preview workflow for travel web"
```

## Self-Review

- Spec coverage:
  - 新建独立 Web 前端项目: covered by Tasks 1 and 6
  - 迁移 API/SSE/store/type logic: covered by Tasks 2 and 3
  - 聊天主流程页面与响应式布局: covered by Tasks 4 and 5
  - AMap Web 化: covered by Task 4
  - 本地可预览: covered by Task 6
- Placeholder scan:
  - No `TODO`/`TBD` placeholders remain
  - All tasks include exact file paths and commands
- Type consistency:
  - `VITE_API_BASE_URL`, `VITE_AMAP_JSAPI_KEY`, `VITE_AMAP_JSCODE` naming is consistent across tasks
  - `@matrix-trace/travel-web` package name is used consistently in commands

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-travel-web-frontend-plan.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
