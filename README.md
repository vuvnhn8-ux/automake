# AI Video Factory

> Repository: [`automake`](https://github.com/vuvnh8-ux/automake)

Turn any topic into a ready-to-publish short video and post it to your Facebook
Fanpages automatically — powered by AI text, image, video and voice providers,
an FFmpeg render pipeline, and the official Meta Graph API.

> **No browser automation.** Publishing goes through Facebook OAuth + the Graph
> API only.

## Features

- **Content pipeline**: research → AI script → scenes → images/voice → render → QA → publish
- **Pluggable providers**: Gemini / OpenAI / Claude, Tavily research, OpenAI image,
  Runway/Veo/Kling video, OpenAI/Google/ElevenLabs TTS — all with a local `MOCK`
  fallback so the whole system runs with zero external accounts
- **Rendering**: FFmpeg renderer (ASS burn-in subtitles, narration mix, music)
  plus a JSON `mock` renderer for development
- **Facebook publishing**: OAuth connect, page picker, scheduled posts, manual or
  full-automatic publishing, token encryption at rest
- **Scheduling**: repeat at times/days, auto-generate and publish
- **Admin dashboard**: Next.js UI for projects, topics, content, videos, QA,
  publishing and settings

## Quick start (dev)

```bash
npm install
copy .env.example .env        # then set DATABASE_URL
npm run db:migrate
npm run db:seed               # admin@avf.local / Password123!
npm run dev                   # web :3000, api :4000, worker
```

Mock providers are the default, so no API keys are needed to try the full
flow. Set `RENDER_DRIVER=mock` if FFmpeg is not installed.

## Docker

```bash
docker compose up --build
```

## Docs

- `docs/ARCHITECTURE.md` — system design & pipeline
- `docs/DEVELOPMENT.md` — setup, commands, env vars
- `docs/FACEBOOK.md` — Meta app setup & publishing
- `docs/PIPELINE.md` — job/queue reference

## Scripts

| Script              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | api + worker + web concurrently                 |
| `npm run typecheck` | TypeScript project references build             |
| `npm test`          | Vitest unit tests                               |
| `npm run check`     | typecheck + tests + build                       |
| `npm run build`     | bundle api/worker (esbuild) + build web (Next)  |
