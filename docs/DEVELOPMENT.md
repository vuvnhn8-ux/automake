# Development

## Prerequisites

- Node.js ≥ 20 (Node 24 recommended)
- For real videos: [FFmpeg](https://ffmpeg.org/) on `PATH` (or set `FFMPEG_PATH`)
- For queue/BullMQ: Redis (`redis-server`)
- For the database: PostgreSQL 14+

You can run everything without Redis/Postgres using the `memory` queue driver and
SQLite-free Prisma is **not** supported — a Postgres server (or Docker) is still
required for `prisma` commands.

## Setup

```bash
npm install
copy .env.example .env          # Windows: `copy`, Unix: `cp`
# point DATABASE_URL at your Postgres, e.g.:
#   postgresql://postgres:postgres@localhost:5432/avf

npm run db:migrate              # applies the init migration
npm run db:seed                 # admin@avf.local / Password123!
```

## Development loop

```bash
npm run dev                     # api (:4000) + worker + web (:3000) concurrently
```

- Web UI: http://localhost:3000 (sign in with the seeded admin)
- API: http://localhost:4000, health at `/health`, files at `/files/*`
- Default env: mock AI/media, `QUEUE_DRIVER=memory`, `RENDER_DRIVER=ffmpeg`
  (switch to `RENDER_DRIVER=mock` when FFmpeg is not installed)

## Useful commands

| Command                  | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `npm run typecheck`      | `tsc -b` for packages + api + worker          |
| `npm test`               | Vitest (packages/*/tests, apps/*/tests)       |
| `npm run check`          | typecheck + tests + full build                |
| `npm run build`          | packages → api/worker bundles → next build    |
| `npm run db:validate`    | Prisma schema check                           |
| `npm run db:generate`    | Regenerate the Prisma client after schema edit|
| `npm run db:push`        | Push schema without migrations (dev only)     |

## Environment variables

See `packages/config/src/index.ts` for the authoritative (zod) list. Start from
`.env.example`. Important ones:

- `DATABASE_URL`, `REDIS_URL`, `QUEUE_DRIVER`
- `JWT_SECRET` (≥16 chars), `FACEBOOK_TOKEN_ENCRYPTION_KEY`
- `AI_TEXT_PROVIDER` + provider keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, …)
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` (see docs/FACEBOOK.md)
- `RENDER_DRIVER=ffmpeg|mock`, `STORAGE_DRIVER=local|s3`

## Testing

Tests are pure-logic / mocked-provider units and do **not** need a database.
Integration tests against Postgres are intentionally left out of `npm test`.

```bash
npm test                 # one-shot
npm run test:watch       # watch mode
```

## Docker

```bash
docker compose up --build
```

Compose runs Postgres + Redis + api + worker + web with mock providers and the
`bullmq` queue. See `docker-compose.yml`.
