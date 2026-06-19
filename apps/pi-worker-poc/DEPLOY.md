# Cloudflare Deployment

## Preconditions

- Cloudflare account with Workers enabled
- GitHub repo connected to Cloudflare
- Project root: `apps/pi-worker-poc`

## Local verification

```bash
cd apps/pi-worker-poc
npm run typecheck
node --test test/*.test.ts
```

## Recommended secrets

Set these in the Cloudflare dashboard for the Worker:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Set only the provider you actually use.

Optional secrets / vars for proxies and explicit model selection:

- `OPENAI_BASE_URL`
- `ANTHROPIC_BASE_URL`
- `PI_MODEL_PROVIDER`
- `PI_MODEL_ID`

Examples:

- `PI_MODEL_PROVIDER=openai`
- `PI_MODEL_ID=gpt-4.1`
- `OPENAI_BASE_URL=https://your-proxy.example.com/v1`

DeepSeek via OpenAI-compatible endpoint:

- `OPENAI_API_KEY=<your deepseek key>`
- `OPENAI_BASE_URL=https://api.deepseek.com/v1`
- `PI_MODEL_PROVIDER=custom-openai`
- `PI_MODEL_ID=deepseek-chat`

## GitHub deployment in Cloudflare dashboard

1. Create a new Worker from GitHub.
2. Select this repository.
3. Set the root directory to `apps/pi-worker-poc`.
4. Use the existing `wrangler.jsonc`.
5. Build command:

```bash
npm run typecheck
```

6. Deploy command:

```bash
npx wrangler deploy --env production
```

The Worker name in `wrangler.jsonc` is `matrix-trace-api`, which matches the deployed API hostname.

Important:

- Cloudflare already installs dependencies before running the user build command.
- Do not run `npm install` again in the build command for this Worker project.
- Re-running install after the platform `pnpm install --frozen-lockfile` step can break native packages such as `esbuild`.

## Staging deployment

Use this deploy command for a staging environment:

```bash
npx wrangler deploy --env staging
```

## Notes

- The Worker is configured to deploy to `workers.dev` by default.
- Add a custom domain later from the Cloudflare dashboard once the API is stable.
- Durable Object migrations are already declared in `wrangler.jsonc`.
- The Worker now reads provider secrets and optional base URLs from Cloudflare `env`.
