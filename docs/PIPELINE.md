# Pipeline & queue reference

Every step is a BullMQ job (or an `InMemoryQueueProvider` job in dev). Payloads
are validated with zod in `packages/queue/src/types.ts`.

| Job name            | Queue    | Purpose                                                       |
| ------------------- | -------- | ------------------------------------------------------------- |
| `generate-content`  | content  | research → AI script → `Script` + `Scene` rows                |
| `generate-scenes`   | scene    | fan-out media jobs per scene                                  |
| `generate-image`    | media    | generate scene image → `MediaAsset(IMAGE)`                    |
| `generate-video`    | media    | generate motion clip → `MediaAsset(VIDEO)` (scene kind VIDEO) |
| `generate-voice`    | media    | TTS narration → `MediaAsset(AUDIO)`                           |
| `render-video`      | render   | assemble assets → FFmpeg/mock → upload → `Video` READY        |
| `quality-check`     | qa       | probe + score → `qualityScore`/`qaResult`                     |
| `publish-video`     | publish  | Graph API upload → `PublishingJob`                            |
| `scheduled-run`     | schedule | pick topic → create content → run full pipeline               |

## Fan-in logic

Media jobs re-check the scene set after completing: once **every** scene has a
READY image + voice (+ video where required), the worker creates the `Video`
row + `RenderJob` and enqueues `render-video`.

## Scheduling

`scheduleRunDelay()` (in `apps/api/src/routes/schedules.ts`) computes the next
matching slot with `nextRunTime()` (`packages/shared/src/schedule.ts`) and adds
a delayed `scheduled-run` job. Empty `days` = every day; times are "HH:mm"
(server-local timezone).

## Publish flow

1. Load `PublishingJob` + `Video` + `FacebookPage`.
2. Decrypt `accessTokenEnc` with `FacebookTokenCipher`.
3. Materialize the rendered file from storage.
4. `FacebookProvider.publishVideo()` → Graph API `/{pageId}/videos`.
5. On success: set post id, seed zeroed `Analytics` rows, mark published.

## Error handling

Handlers update the relevant rows with an error message, then rethrow so BullMQ
retries with exponential backoff (up to `MAX_RETRIES`). Retrying a failed
publishing job is exposed via `POST /videos/:id/publishing-jobs/:jobId/retry`.
