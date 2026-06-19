# Travel Web Frontend Design

## Goal

将 `./tmp/67-Team/desktop/src/renderer/src` 里的桌面 renderer 前端迁移为一个单独部署的 Web 前端项目，支持桌面浏览器和手机浏览器访问，并对接当前已经部署在 Cloudflare Workers 上的 `pi-worker-poc` 后端 API。

## Scope

本次设计只覆盖聊天主流程的 Web 化迁移。

- 覆盖：聊天页、会话列表、流式回复、状态面板、地图卡片、会话路由
- 覆盖：前端 API 层、SSE 层、状态管理层、样式和响应式布局
- 暂不覆盖：`AdminPage`
- 暂不覆盖：Electron 主进程、桌面打包能力
- 暂不覆盖：完整复刻桌面版全部微交互

## Current Frontend Assessment

`67-Team` 当前前端虽然位于 Electron renderer 目录中，但本体已经是标准 React Web 结构：

- `App.tsx` 使用 `react-router-dom`
- `stores/session.ts` 和 `stores/chat.ts` 使用 Zustand
- `hooks/useSSE.ts` 已实现基于 SSE 的流式事件消费
- `api/*.ts` 是典型的 fetch API 封装
- `RouteMapCard.tsx` 使用高德 JSAPI，可在浏览器继续运行

因此本次迁移的重点不是重写业务逻辑，而是：

1. 把 Electron 宿主假设替换成网页宿主
2. 把桌面三栏布局重做为响应式布局
3. 把 API 基地址切换到 Cloudflare Worker
4. 把地图配置改为浏览器环境变量

## Recommended Approach

采用 **“保留逻辑层，重做页面外壳与布局层”** 的迁移方案。

### Alternatives considered

#### Option 1: Direct copy with minimal changes

直接拷贝 renderer 代码到 Vite Web 项目，只修改路由和 API 地址。

优点：
- 最快出页面

缺点：
- 会把当前桌面三栏布局原样带到移动端
- 后续仍需要大规模二次重构

不推荐。

#### Option 2: Preserve data flow, rebuild shell and responsive layout

保留 `types/`、`api/`、`stores/`、`hooks/useSSE.ts` 等逻辑层，重做 `AppShell`、`ChatPage`、侧栏和上下文面板布局。

优点：
- 迁移风险低
- 与现有后端契约兼容
- 移动端体验可以一次做到可用

缺点：
- 需要重组一部分 UI 组件边界

推荐。

#### Option 3: Full design-system-first rewrite

先抽设计系统和组件库，再重写业务页面。

优点：
- 长期最整洁

缺点：
- 第一版上线速度慢

当前阶段不推荐。

## Target Project Structure

建议新增一个独立前端项目：

```text
apps/
  travel-web/
    package.json
    vite.config.ts
    tsconfig.json
    src/
      main.tsx
      App.tsx
      pages/
      components/
      hooks/
      stores/
      api/
      lib/
      styles/
```

职责边界：

- `pages/`
  页面级组合，不承担状态逻辑
- `components/`
  可复用 UI 组件和布局组件
- `stores/`
  继续承载会话与聊天状态
- `api/`
  继续承载 HTTP/SSE 请求
- `lib/`
  地图、路由数据转换、环境配置等纯工具

## Page Architecture

第一版只保留一个主路径：

- `/chat/:sessionId?`

页面仍保留三个信息区域，但根据屏幕宽度动态重组：

### Desktop

- 左侧：会话列表 `SessionSidebar`
- 中间：聊天主区 `ChatPane + ChatInput`
- 右侧：上下文区 `ContextPanel`

### Tablet

- 左侧会话区域折叠为可展开抽屉或窄栏
- 右侧上下文区域折叠为侧滑抽屉
- 聊天区域保持主视觉优先

### Mobile

- 单栏布局
- 顶部栏包含：
  - 打开会话列表按钮
  - 当前会话标题
  - 打开上下文面板按钮
- 中间为消息流
- 底部固定输入区
- 地图卡片和路线卡片直接在聊天流中纵向展示

## Component Migration Plan

### Largely reused

- `types/agent.ts`
- `types/toolResults.ts`
- `api/sessions.ts`
- `api/chat.ts`
- `api/sse.ts`
- `stores/session.ts`
- `stores/chat.ts`
- `hooks/useSSE.ts`
- `hooks/useSessions.ts`
- `hooks/useRouteSession.ts`
- `lib/routeData.ts`
- `components/chat/*`
- `components/map/RouteMapCard.tsx`

### Reworked for Web responsiveness

- `App.tsx`
- `pages/ChatPage.tsx`
- `components/layout/AppShell.tsx`
- `components/layout/SessionSidebar.tsx`
- `components/layout/ContextPanel.tsx`

### Removed or deferred

- `pages/AdminPage.tsx`
- Electron-only preload integration assumptions

## API and Environment Design

当前桌面前端把 API 固定到：

```ts
const BASE_URL = "http://localhost:18923"
```

Web 版本必须改为环境变量驱动：

- `VITE_API_BASE_URL`
- `VITE_AMAP_JSAPI_KEY`
- `VITE_AMAP_JSCODE`

运行模式：

- 本地开发：前端本地 dev server 调 Worker dev
- 线上部署：前端部署到 Cloudflare Pages，后端仍为独立 Worker

## Backend Contract Assumption

首版前端只依赖当前 Worker 已稳定提供的接口：

- `GET /health`
- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `POST /api/sessions/:id/chat/stream`

首版 SSE 以 `agent:start` / `agent:end` + `final_state` 为核心兼容路径，不要求一开始就完整复刻桌面版全部细粒度 token/tool/stage 事件。

## Data Flow

维持 `67-Team` 现有分层：

1. `ChatPage` 触发发送消息
2. `session store` 负责 session create/select/list/delete
3. `chat store` 负责消息渲染态、stream buffer、route data
4. `useSSE` 负责将后端 SSE 事件翻译为前端状态更新
5. `agent:end` 到达后，通过 `final_state` hydrate UI

这意味着前后端兼容的关键在于 `AgentState` 形状，而不是某个单一 UI 组件。

## Mobile-Specific Design Rules

- 输入框与发送按钮必须固定可触达，避免被虚拟键盘遮挡
- 会话切换和上下文查看必须使用抽屉，不保留固定侧栏
- 地图卡片默认折叠，避免在小屏首屏占满高度
- 顶部操作栏必须轻量，不堆积次级功能
- 首版优先保证聊天主链路可用，不把桌面信息密度强行压进手机

## AMap Integration Design

桌面版通过 `window.electronAPI?.amap` 获取配置。

Web 版本改为：

- 优先直接读取 Vite 环境变量
- 删除对 Electron preload 的依赖
- 保留 `@amap/amap-jsapi-loader` 和现有地图渲染逻辑

## Error Handling

### API failure

- 在 `session store` 中保留用户可见错误状态
- 聊天请求失败时，仍应在消息流中显示失败态 assistant message

### SSE interruption

- 如果 SSE 提前结束但带有 `final_state`，正常 hydrate
- 如果 SSE 异常断开且无 `final_state`，显示中断提示并允许用户重试

### Missing map config

- 不阻断主聊天页
- 仅在地图卡片中显示可理解的地图加载失败信息

## Testing Strategy

### Unit

- API URL 拼接与环境变量解析
- `chat store` hydrate 逻辑
- `routeData` 转换逻辑

### Integration

- 发送消息 -> 建立 SSE -> `agent:end` -> 页面渲染最终结果
- 切换 session -> 拉取并 hydrate 已有状态
- 手机布局关键断点下的抽屉与输入区可用性

### Manual verification

- Desktop 浏览器
- Mobile viewport
- 有地图配置与无地图配置两种场景

## Out of Scope

- `AdminPage` Web 化
- 完整复制桌面版所有状态栏和高级管理功能
- 原生 App / 小程序 / React Native
- 完整的离线能力

## Final Recommendation

先建设一个新的 `apps/travel-web`，以“保留业务逻辑、重做响应式外壳”的方式完成首版聊天前端。首版目标不是完全复刻桌面版，而是优先实现：

- 可访问的 Web 页面
- 桌面与手机都能正常聊天
- 会话列表可用
- SSE 能落到 UI
- 路线卡片在浏览器里可工作

这条路径能最快把当前 `67-Team` 的桌面前端能力转化成 Cloudflare 上真正可访问的网页产品。
