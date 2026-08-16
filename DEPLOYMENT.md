# Deployment Guide — AI Video Factory (Hybrid Worker)

This document covers deploying the AI Video Factory in the supported
**hybrid** topology:

- a **control plane** on a Linux VPS: Web + API + PostgreSQL + Redis + Scheduler
- a **remote Worker** that is not on the VPS (a home workstation now, a second
  VPS later), consuming the same Redis queue **outbound-only** — no inbound
  access to the worker, no router port forwarding, no public worker API.

The exact same worker image/binary/configuration runs on a home workstation,
a worker VPS, and multiple workers simultaneously. No code or architecture
changes are required when workers move or scale.

---

## 1. Production Architecture

```
                           INTERNET
                              |
                              v
                      +--------------+
                      |     VPS      |   control plane
                      |--------------|
                      |  Web (3000)  |
                      |  API (4000)  |
                      |  PostgreSQL  |
                      |  Redis       |
                      |  Scheduler*  |
                      +------+-------+
                             |
                       Redis Queue
                             |
                 outbound connection (Redis + Postgres + object storage)
                             |
              +--------------+-----------------+
              |               |                 |
              v               v                 v
       +-----------+   +-----------+     +-----------+
       |  Worker 1 |   |  Worker 2 |     |  Worker 3 |
       |-----------|   |-----------|     |-----------|
       | FFmpeg    |   | FFmpeg    |     | FFmpeg    |
       | temp work |   | temp work |     | temp work |
       +-----------+   +-----------+     +-----------+
      home / VPS       worker VPS        future scale-out
```

- **Scheduler:** the worker process arms active `Schedule`/`ContentCampaign`
  rows as BullMQ delayed jobs at boot (`armActiveSchedules`). This is
  idempotent (stable jobIds), so any worker may arm; keep the scheduler on the
  VPS worker by leaving `WORKER_ARM_SCHEDULES=true` there and setting it
  `false` on home workers if you prefer.
- **Connectivity is strictly outbound** from workers: `REDIS_URL`,
  `DATABASE_URL` and object storage all point at the VPS (or a managed service).
  Workers expose **no** HTTP port. No inbound firewall rules, no port
  forwarding, no public IP required on the home network.
- **Storage:** all workers and the VPS share one object store through the
  existing storage abstraction (`STORAGE_DRIVER=s3` → AWS S3 / Cloudflare R2 /
  Backblaze B2 / MinIO). Workers download scene assets, render locally, upload
  the final video, then delete local temp files. Never use `STORAGE_DRIVER=local`
  on a remote worker — its disk is not the VPS disk.
- **Health:** every worker upserts a row in `WorkerHeartbeat` every
  `WORKER_HEARTBEAT_INTERVAL_MS`. The dashboard shows fleet status at
  **Workers** (`GET /api/workers`).

---

## 2. Prerequisites

- **VPS:** Docker Engine 24+ and Docker Compose v2 (or Docker Desktop), 2 GB
  RAM minimum, public IP/domain for web + Facebook OAuth callback.
- **Home workstation:** Node.js 20+ **or** Docker (optional). FFmpeg installed
  (see section 8). No public IP, no inbound rules, no router changes.
- Existing `.env.example` documents every variable.

---

## 3. Environment Variables

Copy `.env.example` to `.env` on the VPS (and `.env.worker` on the home
machine) and fill in real values.

### Secrets — must be set (generate strong random values)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs JWT access/refresh tokens (≥32 random chars) |
| `SECRET_ENCRYPTION_KEY` | AES-256 key material for DB-encrypted provider API keys |
| `FACEBOOK_TOKEN_ENCRYPTION_KEY` | Key material for encrypting Facebook page access tokens |
| `POSTGRES_PASSWORD` | PostgreSQL superuser password (VPS only) |
| `DATABASE_URL` | VPS Postgres URL (worker only) |
| `REDIS_URL` | VPS Redis URL (worker only) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | Shared object storage |

> In production the config loader **fails startup** if
> `SECRET_ENCRYPTION_KEY` / `FACEBOOK_TOKEN_ENCRYPTION_KEY` are missing or known
> defaults. Rotating `SECRET_ENCRYPTION_KEY` invalidates previously encrypted
> values.

### Application configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Public web URL (CORS) |
| `API_URL` | `http://localhost:4000` | Public API URL |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Web→API URL, **inlined at build time** |
| `QUEUE_DRIVER` | `memory` (dev) / `bullmq` (deploy) | Queue backend — must be `bullmq` in any deployed topology |
| `ROLE` | `worker` | Informational deployment role |
| `RENDER_DRIVER` | `ffmpeg` | `ffmpeg` or `mock` |
| `STORAGE_DRIVER` | `local` | `local` or `s3` (use `s3` for remote workers) |
| `FACEBOOK_REDIRECT_URI` | `http://localhost:4000/api/facebook/oauth/callback` | Must match the Facebook app callback |

### Worker configuration (see also .env.example)

| Variable | Default | Purpose |
|---|---|---|
| `WORKER_ID` | OS hostname | Stable per-machine identity (set when hostnames collide) |
| `WORKER_CONCURRENCY` | `1` | Max concurrent jobs; FFmpeg is CPU/RAM/disk intensive — raise only with headroom |
| `WORKER_TEMP_DIR` | `<os-tmpdir>/ai-video-worker` | Root for render/publish temp files, cleaned after every job |
| `WORKER_HEARTBEAT_INTERVAL_MS` | `15000` | Heartbeat frequency shown in the Workers page |
| `WORKER_ARM_SCHEDULES` | `true` | Keep the scheduler on the VPS worker; disable on home workers if desired |
| `FFMPEG_PATH` | `ffmpeg` | FFmpeg binary path |

### Provider API keys

Set any of `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`TAVILY_API_KEY`, `EXA_API_KEY`, `GOOGLE_VEO_API_KEY`, `RUNWAY_API_KEY`,
`KLING_API_KEY`, `ELEVENLABS_API_KEY` **or** manage them from the web UI
(Settings → Providers). UI-managed keys are stored encrypted in `SystemSetting`
and override env values, so provider changes need no server access. **Every
worker must use the same provider configuration as the VPS** so generated
content is consistent.

---

## 4. VPS Deployment (control plane)

```bash
git clone <your-repo-url> /opt/avf && cd /opt/avf
cp .env.example .env          # fill in real values (section 3)

docker compose config         # validate
NEXT_PUBLIC_API_URL=https://api.example.com docker compose build
docker compose up -d
docker compose ps             # all services healthy
```

- Services: `db` (PostgreSQL, internal-only), `redis` (internal-only),
  `api` (port 4000), `worker` (no ports), `web` (port 3000).
- The `api` container runs `npx prisma migrate deploy` before starting; run it
  manually for a managed database:
  `DATABASE_URL=... npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`.
- Seed only once:
  `DATABASE_URL=... npx tsx packages/database/prisma/seed.ts`.
- Reverse-proxy web (TLS) and forward `/api/*` to the API (the Next.js
  `rewrites` proxy `/api/*` → `NEXT_PUBLIC_API_URL` by default).
- The VPS worker is also the scheduler. To re-arm schedules after drift:
  `docker compose restart worker`.

---

## 5. Home Worker Deployment

Two options — native process or Docker. Both are fully supported; Docker is
optional on the home machine.

> **Storage first:** configure S3-compatible shared storage (R2/B2/MinIO/S3)
> and set `STORAGE_DRIVER=s3` **on both the VPS and every worker**. This is the
> only way a remote worker can read the same scene assets and write the same
> rendered videos. The API serves rendered files to the web via
> `STORAGE_PUBLIC_URL`.

### Option A — native Worker process (no Docker)

Requires Node.js 20+ and FFmpeg (section 8).

```bash
git clone <your-repo-url> C:\avf && cd C:\avf
npm install
npm run build:packages && npm run build:worker
# Windows:
copy .env.example .env.worker && notepad .env.worker
# Linux:
cp .env.example .env.worker && $EDITOR .env.worker
```

`.env.worker` must set at minimum:

```
ROLE=worker
QUEUE_DRIVER=bullmq
DATABASE_URL=postgresql://user:pass@<vps>:5432/avf   # or a managed Postgres
REDIS_URL=redis://:password@<vps>:6379                # rediss:// for TLS
SECRET_ENCRYPTION_KEY=...
FACEBOOK_TOKEN_ENCRYPTION_KEY=...
RENDER_DRIVER=ffmpeg
WORKER_CONCURRENCY=1
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<r2-or-b2-endpoint>
S3_BUCKET=<bucket>
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

Start:

```bash
node apps/worker/dist/index.js     # Linux
start /wait node apps/worker/dist/index.js   # Windows (or Task Scheduler, section 10)
```

Run in dev with `npm run dev:worker` (uses `tsx`).

### Option B — Docker Worker

```bash
docker build -f Dockerfile.worker -t avf-worker .
docker compose -f docker-compose.worker.yml --env-file .env.worker up -d
```

`docker-compose.worker.yml` runs **only** the worker: no PostgreSQL, no Redis,
no ports exposed. It connects outbound to the VPS via `DATABASE_URL` /
`REDIS_URL`.

---

## 6. Windows Worker

- **Native:** see section 5 Option A. No systemd, no Docker required.
- **FFmpeg:** install via `winget install Gyan.FFmpeg` (or
  https://ffmpeg.org), then confirm `ffmpeg -version` from a fresh terminal.
  Set `FFMPEG_PATH` if it is not on `PATH`.
- **Temp dir:** `WORKER_TEMP_DIR` defaults to
  `%TEMP%\ai-video-worker` — leave as-is or point at a fast local SSD.
- **Auto-start:** use Task Scheduler (section 10). `SIGTERM`/`SIGINT` graceful
  shutdown is handled (close queue, finish current job, mark OFFLINE).
- Windows Defender may flag Node child-process spawning during FFmpeg runs;
  add an exclusion for the worker folder if needed.

---

## 7. Linux Worker

- **Native:** Node.js 20+ (NodeSource PPA or nvm), FFmpeg via
  `sudo apt install ffmpeg`.
- **Auto-start:** systemd unit (section 10).
- **Docker:** Option B above.

---

## 8. FFmpeg Installation

| Platform | Command |
|---|---|
| Debian/Ubuntu | `sudo apt-get update && sudo apt-get install -y ffmpeg` |
| Alpine (image) | `apk add --no-cache ffmpeg` (already in `Dockerfile.worker`) |
| Windows | `winget install Gyan.FFmpeg` or manual download from ffmpeg.org |

Verify: `ffmpeg -version`.

The worker **fails fast at startup** with a clear error if
`RENDER_DRIVER=ffmpeg` but FFmpeg is missing (`assertFFmpegAvailable`). It
never silently falls back to another renderer. `RENDER_DRIVER=mock` remains
available for development/testing without FFmpeg.

---

## 9. Worker Startup

Worker startup log shows identity and config, e.g.:

```
[worker] ffmpeg available · ffmpeg version 6.1.1 ...
[queue] worker ready · queue=content · concurrency=1 · redis=redis://...
[worker] started · id=desktop-abc · host=desktop-abc · version=0.1.0 · queue=bullmq · concurrency=1 · render=ffmpeg · ffmpeg=yes · temp=...
```

Job lifecycle is logged: `job started`, `job completed`, `job failed` (with
attempt), FFmpeg render failures, temp-cleanup results, and graceful shutdown.
Secrets are never logged (API keys, OAuth tokens, encryption keys, passwords).

---

## 10. Worker Auto-Start (24/7)

### Windows — Task Scheduler

1. Open Task Scheduler → Create Task.
2. **General:** run whether user is logged on or not; highest privileges not
   required.
3. **Triggers:** At startup (repeat every 1 minute indefinitely for crash
   recovery).
4. **Actions:** start program `C:\Program Files\nodejs\node.exe` with
   arguments `C:\avf\apps\worker\dist\index.js` and start in
   `C:\avf` (with `--env-file=.env.worker` passed via
   `node --env-file=.env.worker apps/worker/dist/index.js` if using Node 20+).
5. **Settings:** restart on failure after 1 minute, up to 999 times.

> Node 20+ supports `node --env-file=.env.worker apps/worker/dist/index.js`,
> so no wrapper script is needed.

### Linux — systemd

Create `/etc/systemd/system/avf-worker.service`:

```ini
[Unit]
Description=AI Video Factory Worker
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/avf
EnvironmentFile=/opt/avf/.env.worker
ExecStart=/usr/bin/node apps/worker/dist/index.js
Restart=always
RestartSec=10
User=avf

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now avf-worker
sudo systemctl status avf-worker
```

---

## 11. Worker Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Worker exits at startup with "FFmpeg is required" | Install FFmpeg (section 8) or set `RENDER_DRIVER=mock` |
| `ECONNREFUSED redis://...` | Redis unreachable; verify `REDIS_URL`, firewall allows **outbound** 6379/6380, or use `rediss://` |
| `Invalid environment configuration` | Missing/invalid env in `.env.worker`; worker never starts |
| Worker shows `OFFLINE` in the UI | Heartbeats not reaching Postgres (`DATABASE_URL` wrong or DB down); restart interval/network |
| Jobs never run | `QUEUE_DRIVER` not `bullmq`, or `WORKER_CONCURRENCY` already saturated by a stuck FFmpeg run |
| Scheduled jobs stop firing | Scheduler is on the VPS worker; `docker compose restart worker` to re-arm |
| FFmpeg render fails (exit 1) | Inspect `[worker] job failed render-video(...)` log tail (last 4000 chars are stored on the render job) |

**Reconnection:** BullMQ/ioredis reconnects automatically
(`maxRetriesPerRequest: null`). If the VPS or network is temporarily down, the
worker keeps retrying, stays alive, and resumes processing when the VPS is
reachable again — no manual restart needed. Temporary Redis failures at boot
never kill the worker (schedule arming is retried, not fatal).

---

## 12. Multiple Workers

Any number of workers can consume the same queues:

```
                 Redis (VPS)
                    |
         +----------+----------+
         |          |          |
         v          v          v
      Worker1   Worker2   Worker3
```

- No worker owns a job: BullMQ distributes active jobs to idle workers and
  locks each job, so **a job is never processed twice**.
- Duplicate *enqueues* are prevented with stable `jobId`s (e.g.
  `scheduled-run:<id>:<runAt>`), and `publish-video` is idempotent — a job that
  is already `PUBLISHED`/`CANCELLED` is skipped on re-delivery.
- Each worker must have a unique `WORKER_ID` (hostname works unless
  duplicated) and its own `WORKER_TEMP_DIR`.

---

## 13. Scaling

- **Concurrency within a worker:** `WORKER_CONCURRENCY`. Keep `1` unless the
  machine has clear CPU/RAM/disk headroom — FFmpeg jobs are heavy and the
  worker must never launch unlimited FFmpeg processes.
- **More workers:** spin up another native process or another
  `docker compose -f docker-compose.worker.yml up -d` on any machine that can
  reach Redis + storage outbound. No code changes.
- **Moving a worker to a VPS (Phase 2):** the image, binary, and `.env.worker`
  are identical — only `DATABASE_URL`/`REDIS_URL`/`WORKER_TEMP_DIR` differ per
  machine.

---

## 14. Security

- **Outbound only.** Workers never bind a port; no `0.0.0.0:PORT`, no inbound
  firewall rules, no router port forwarding.
- **Redis TLS:** use `rediss://user:pass@host:6380` when Redis is reachable
  over the Internet (supported by BullMQ/ioredis; `redis://` still works on a
  trusted private network). Prefer a password (`requirepass`) — Redis on the
  VPS stays internal to Docker, so the only exposed Redis is a managed one.
- **Postgres:** use SSL (`?sslmode=require`) for remote `DATABASE_URL`; the
  compose `db` service stays internal.
- **Storage:** S3-compatible with scoped credentials (read/write only the
  application bucket; R2/B2 support scoped tokens).
- **Secrets:** never commit `.env*`; `.dockerignore` excludes them from build
  contexts; provider keys and Facebook tokens are stored AES-256 encrypted in
  `SystemSetting` / `FacebookPage` and decrypted only in the worker at use
  time. Worker logs never include credentials.
- **API:** `/api/*` requires JWT bearer auth except `/api/auth/*` and the
  Facebook OAuth callback. `GET /api/workers` requires an authenticated user.

---

## 15. Temporary Storage

- `WORKER_TEMP_DIR` (default `<os-tmpdir>/ai-video-worker`) holds all render
  inputs, FFmpeg intermediates, and the publish materialization copy.
- Cleanup runs after **every** job — success, failure, or retry exhaustion —
  via a safe `cleanupWorkDir` that **refuses to delete anything outside
  `WORKER_TEMP_DIR`** (unrelated user files are never touched).
- Lifecycle: download assets → temp dir → FFmpeg render → upload final result
  → delete temp files.
- The worker is **not** permanent video storage; final videos live in object
  storage through the storage abstraction.

---

## 16. Backups

### Database (required)

```bash
docker compose exec db pg_dump -U postgres -d avf -F c -f /tmp/avf.dump
docker compose cp db:/tmp/avf.dump ./avf-$(date +%F).dump
```

Restore:

```bash
docker compose cp ./avf-2026-01-01.dump db:/tmp/avf.dump
docker compose exec db sh -c "pg_restore -U postgres -d avf --clean --if-exists /tmp/avf.dump"
```

The `pgdata` volume is *not* a backup. Keep 14 days of dumps.

### Object storage (media)

Enable versioning on the bucket (R2/B2) or snapshot per your provider's tooling.
`WorkerHeartbeat` rows are low-value and rebuild themselves — exclude them from
restore concerns.

---

## 17. Failure Recovery

| Scenario | Behaviour |
|---|---|
| Home worker offline when a scheduled job fires | Delayed job stays persisted in Redis; worker processes it (and any backlog) when it returns |
| VPS/Redis temporarily unreachable | Worker reconnects automatically; jobs stay queued; idempotency prevents double publishing |
| Worker crashes | `restart: unless-stopped` (Docker) or Task Scheduler/systemd restart it; BullMQ picks up interrupted jobs |
| Job fails permanently | Retried per `MAX_RETRIES` with exponential backoff, then remains inspectable in the failed set; `fail*` helpers mark DB state |
| VPS reboot | Docker + `restart: unless-stopped` bring the control plane back; `init: true` keeps PID 1 clean for graceful shutdown |
| Schedules drift | `docker compose restart worker` re-arms them |
| Migration rollback | All migrations are additive; roll back by restoring the DB backup, not hand-reverting SQL |

**Graceful shutdown:** on `SIGTERM`/`SIGINT` the worker marks `DRAINING`, stops
accepting new jobs, finishes the current job, closes Redis connections, writes
`OFFLINE`, and exits cleanly — jobs are never corrupted.

---

## 18. Post-Deploy Checklist

1. `docker compose ps` — VPS services healthy; home worker healthy.
2. `curl -s http://localhost:4000/health` — `ok`.
3. Log in to the web dashboard → **Workers** page shows the VPS worker and the
   home worker `ONLINE` (heartbeat, current job, version, FFmpeg).
4. Create a campaign, assign a channel, confirm the scheduled run appears in
   the home worker logs and the rendered video is served from storage.
5. Publish to 3 channels from one generated video (15/day target: one
   generate/render per video, one `publish-video` job per channel).
6. Stop the home worker, wait past a scheduled slot, restart it, confirm
   pending jobs process and no duplicates are published.
