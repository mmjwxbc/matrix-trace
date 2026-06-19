# Travel Web

## Production endpoints

- Frontend domain: `https://matrix-trace.lionelmmjwxcg37.workers.dev`
- Backend API domain: `https://matrix-trace-api.lionelmmjwxcg37.workers.dev`

## Local development

1. Start the Worker API:

```bash
cd /Users/lijiahao/Project/matrix-trace/apps/pi-worker-poc
npm run dev -- --port 8787
```

2. Create local frontend env:

```bash
cd /Users/lijiahao/Project/matrix-trace/apps/travel-web
cp .env.example .env.local
```

3. Start the Web frontend:

```bash
cd /Users/lijiahao/Project/matrix-trace/apps/travel-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

The Vite app should be available at `http://127.0.0.1:5173`.

## Preview against deployed Worker

If you want the web app to talk to the deployed Cloudflare backend instead of a local Worker, set:

```bash
VITE_API_BASE_URL=https://matrix-trace-api.lionelmmjwxcg37.workers.dev
```

The current local preview file is already configured that way in:

```bash
/Users/lijiahao/Project/matrix-trace/apps/travel-web/.env.local
```

## Cloudflare Pages deployment

Deploy this app as a static site from the Cloudflare Dashboard with these values:

- Project type: `Pages`
- Repository: `mmjwxbc/matrix-trace`
- Production branch: `main`
- Root directory: `apps/travel-web`
- Build command: `npm install && npm run build`
- Build output directory: `dist`
- Node.js version: `20`

Set this production environment variable in the Pages project:

```bash
VITE_API_BASE_URL=https://matrix-trace-api.lionelmmjwxcg37.workers.dev
```

Notes:

- `public/_redirects` has been added with `/* /index.html 200`, so refreshing `/chat` and `/chat/:sessionId` will still load the React app.
- `VITE_AMAP_JSAPI_KEY` and `VITE_AMAP_JSCODE` can be added later in Pages if you want to enable the browser map integration.
