# Travel Web

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
VITE_API_BASE_URL=https://matrix-trace.lionelmmjwxcg37.workers.dev
```

The current local preview file is already configured that way in:

```bash
/Users/lijiahao/Project/matrix-trace/apps/travel-web/.env.local
```
