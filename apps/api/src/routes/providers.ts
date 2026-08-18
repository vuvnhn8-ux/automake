import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@avf/database';
import {
  env,
  SecretCipher,
  getProviderSetting,
  getActiveProvider,
  loadProviderConfig,
} from '@avf/config';
import {
  PROVIDER_GROUPS,
  PROVIDER_CATALOG,
  KEY_ENV_BY_PROVIDER,
  MODEL_ENV_BY_PROVIDER,
  isOpenAICompatible,
  catalogEndpoint,
  type ProviderGroup,
} from '@avf/shared';
import {
  GeminiProvider,
  OpenAIProvider,
  ClaudeProvider,
  MockAIProvider,
  OpenAICompatibleProvider,
  TavilyResearchProvider,
  type AICompletionRequest,
  type AIProvider,
} from '@avf/ai';
import {
  OpenAIImageProvider,
  OpenAIVoiceProvider,
  GoogleVoiceProvider,
  ElevenLabsVoiceProvider,
  MockVoiceProvider,
} from '@avf/media';
import { parse } from '../lib/validate.js';
import { getAuthUser } from '../plugins/auth.js';

const PROVIDER_GROUP_IDS = PROVIDER_GROUPS.map((g) => g.id);

const ProviderUpdateSchema = z.object({
  group: z.enum(PROVIDER_GROUP_IDS as unknown as [ProviderGroup, ...ProviderGroup[]]),
  provider: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  setActive: z.boolean().optional(),
  apiKey: z.string().max(4096).nullable().optional(),
  model: z.string().max(256).nullable().optional(),
});

const PrioritySchema = z.object({
  group: z.enum(PROVIDER_GROUP_IDS as unknown as [ProviderGroup, ...ProviderGroup[]]),
  priority: z.array(z.string().min(1).max(64)).min(1).max(20),
});

const TestConnectionSchema = z.object({
  group: z.enum(PROVIDER_GROUP_IDS as unknown as [ProviderGroup, ...ProviderGroup[]]),
  provider: z.string().min(1).max(64),
  apiKey: z.string().max(4096).optional(),
  model: z.string().max(256).optional(),
});

function maskKey(apiKey: string): string {
  if (apiKey.length <= 8) return '••••••••';
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}

function envValue(key: string): string {
  return (env as unknown as Record<string, string>)[key] ?? '';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export async function providersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/providers', async (request) => {
    const auth = getAuthUser(request);
    const [usageRows] = await Promise.all([
      prisma.providerUsage.findMany(),
    ]);
    const usageByKey = new Map(usageRows.map((u) => [`${u.group}:${u.provider}`, u]));

    const groups = PROVIDER_GROUPS.map((group) => {
      const active = getActiveProvider(group.id, envValue(group.envKey) || group.activeDefault);
      const activeFrom: 'env' | 'db' = getProviderSetting(group.id)?.custom?.active ? 'db' : 'env';
      return {
        id: group.id,
        label: group.label,
        envKey: group.envKey,
        envActive: envValue(group.envKey) || group.activeDefault,
        active,
        activeFrom,
        priority: priorityOf(group.id, active),
        catalog: PROVIDER_CATALOG.filter((e) => e.category === group.id),
        options: group.options.map((opt) => {
          const setting = getProviderSetting(opt.id);
          const keyEnv = KEY_ENV_BY_PROVIDER[opt.id];
          const modelEnv = MODEL_ENV_BY_PROVIDER[opt.id];
          const usage = usageByKey.get(`${group.id}:${opt.id}`);
          return {
            id: opt.id,
            label: opt.label,
            requiresKey: opt.requiresKey,
            isActive: opt.id === active,
            enabled: setting?.enabled ?? true,
            apiKeySet: setting?.apiKeySet ?? Boolean(keyEnv && envValue(keyEnv)),
            keyMask: setting?.custom?.apiKeyMask ?? null,
            model: setting?.model ?? null,
            modelEnv: modelEnv ? envValue(modelEnv) : null,
            keyEnvSet: keyEnv ? Boolean(envValue(keyEnv)) : false,
            openAICompatible: isOpenAICompatible(opt.id),
            endpoint: catalogEndpoint(opt.id),
            usage: usage
              ? {
                  requests: usage.requests,
                  success: usage.success,
                  failed: usage.failed,
                  rateLimited: usage.rateLimited,
                  timeout: usage.timeout,
                  fallbackEvents: usage.fallbackEvents,
                  lastError: usage.lastError,
                  lastSuccessAt: usage.lastSuccessAt,
                  lastRequestAt: usage.lastRequestAt,
                  health: usage.health,
                  updatedAt: usage.updatedAt,
                }
              : null,
          };
        }),
      };
    });
    return { groups, totalProviders: PROVIDER_CATALOG.length, categories: PROVIDER_GROUPS.length };
  });

  app.put('/providers', async (request, reply) => {
    const auth = getAuthUser(request);
    if (auth.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden', message: 'Admins only' });
    }
    const body = parse(ProviderUpdateSchema, request.body);
    const group = PROVIDER_GROUPS.find((g) => g.id === body.group);
    const option = group?.options.find((o) => o.id === body.provider);
    if (!group || !option) {
      return reply.code(400).send({ error: 'invalid_provider', message: 'Unknown provider or group' });
    }
    const cipher = new SecretCipher();
    const keyFor = (key: string) => `provider.${key}`;
    const write = (key: string, value: unknown) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });
    const remove = (key: string) =>
      prisma.systemSetting.delete({ where: { key } }).catch(() => undefined);

    if (body.setActive) {
      await write(keyFor(`${group.id}.active`), body.provider);
      await write(keyFor(`${body.provider}.enabled`), true);
    }
    if (typeof body.enabled === 'boolean') {
      await write(keyFor(`${body.provider}.enabled`), body.enabled);
    }
    if (body.apiKey === null) {
      await remove(keyFor(`${body.provider}.apiKey`));
      await remove(keyFor(`${body.provider}.apiKeyMask`));
    } else if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
      await write(keyFor(`${body.provider}.apiKey`), cipher.encrypt(body.apiKey));
      await write(keyFor(`${body.provider}.apiKeyMask`), maskKey(body.apiKey));
    }
    if (body.model === null) {
      await remove(keyFor(`${body.provider}.model`));
    } else if (typeof body.model === 'string' && body.model.length > 0) {
      await write(keyFor(`${body.provider}.model`), body.model);
    }

    await loadProviderConfig();
    return reply.code(200).send({ ok: true });
  });

  app.put('/providers/priority', async (request, reply) => {
    const auth = getAuthUser(request);
    if (auth.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden', message: 'Admins only' });
    }
    const body = parse(PrioritySchema, request.body);
    const group = PROVIDER_GROUPS.find((g) => g.id === body.group);
    if (!group) {
      return reply.code(400).send({ error: 'invalid_group', message: 'Unknown group' });
    }
    const valid = body.priority.every((id) => group.options.some((o) => o.id === id));
    if (!valid) {
      return reply.code(400).send({ error: 'invalid_priority', message: 'Priority contains an unknown provider' });
    }
    await prisma.systemSetting.upsert({
      where: { key: `provider.${body.group}.priority` },
      update: { value: JSON.stringify(body.priority) as never },
      create: { key: `provider.${body.group}.priority`, value: JSON.stringify(body.priority) as never },
    });
    await loadProviderConfig();
    return reply.code(200).send({ ok: true, priority: body.priority });
  });

  app.post('/providers/test-connection', async (request, reply) => {
    const auth = getAuthUser(request);
    if (auth.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden', message: 'Admins only' });
    }
    const body = parse(TestConnectionSchema, request.body);
    const group = PROVIDER_GROUPS.find((g) => g.id === body.group);
    const option = group?.options.find((o) => o.id === body.provider);
    if (!group || !option) {
      return reply.code(400).send({ error: 'invalid_provider', message: 'Unknown provider or group' });
    }

    const stored = getProviderSetting(body.provider);
    const apiKey =
      body.apiKey?.trim() ||
      stored?.apiKey ||
      envValue(KEY_ENV_BY_PROVIDER[body.provider] ?? '') ||
      '';
    const model =
      body.model?.trim() ||
      stored?.model ||
      envValue(MODEL_ENV_BY_PROVIDER[body.provider] ?? '') ||
      '';

    try {
      if (body.group === 'AI_TEXT') {
        const request: AICompletionRequest = {
          system: 'Reply with exactly one word: ok',
          user: 'ping',
          maxTokens: 8,
          jsonMode: false,
        };
        let provider: AIProvider;
        switch (body.provider) {
          case 'GEMINI':
            provider = new GeminiProvider(apiKey, model);
            break;
          case 'OPENAI':
            provider = new OpenAIProvider(apiKey, model);
            break;
          case 'CLAUDE':
            provider = new ClaudeProvider(apiKey, model);
            break;
          case 'MOCK':
            provider = new MockAIProvider();
            break;
          default:
            if (isOpenAICompatible(body.provider)) {
              provider = new OpenAICompatibleProvider(
                body.provider as never,
                apiKey,
                model,
                catalogEndpoint(body.provider) ?? undefined,
              );
            } else {
              return reply
                .code(400)
                .send({ ok: false, message: `Provider ${body.provider} is not testable` });
            }
        }
        const result = await provider.complete(request);
        return reply.code(200).send({
          ok: true,
          provider: result.provider,
          model: result.model,
          durationMs: result.durationMs,
        });
      }
      if (body.group === 'RESEARCH' && body.provider === 'TAVILY') {
        const provider = new TavilyResearchProvider(apiKey);
        await provider.research({ topic: 'test', maxSources: 1 });
        return reply.code(200).send({ ok: true, provider: 'TAVILY' });
      }
      if (body.group === 'IMAGE') {
        if (body.provider === 'OPENAI' || body.provider === 'GEMINI') {
          const provider = new OpenAIImageProvider(model || undefined);
          const result = await provider.generateImage({
            prompt: 'A simple test image of a blue circle on white background',
            size: '256x256',
          });
          return reply.code(200).send({ ok: true, provider: result.provider, model: result.model });
        }
        if (body.provider === 'STABILITY' || body.provider === 'FAL') {
          const testKey = apiKey || envValue('STABILITY_API_KEY') || envValue('FAL_API_KEY') || '';
          if (!testKey) {
            return reply.code(200).send({ ok: false, message: `No API key configured for ${body.provider}` });
          }
          return reply.code(200).send({ ok: true, provider: body.provider, message: `${body.provider} key is configured` });
        }
        if (body.provider === 'MOCK') {
          return reply.code(200).send({ ok: true, provider: 'MOCK' });
        }
      }
      if (body.group === 'VOICE') {
        if (body.provider === 'OPENAI') {
          const provider = new OpenAIVoiceProvider(model || undefined);
          const result = await provider.generateVoice({
            text: 'Hello, this is a test.',
            language: 'en-US',
          });
          return reply.code(200).send({ ok: true, provider: result.provider, model: result.model });
        }
        if (body.provider === 'GOOGLE') {
          const provider = new GoogleVoiceProvider();
          const result = await provider.generateVoice({
            text: 'Xin chào, đây là bài kiểm tra.',
            language: 'vi-VN',
          });
          return reply.code(200).send({ ok: true, provider: result.provider, model: result.model });
        }
        if (body.provider === 'ELEVENLABS') {
          const provider = new ElevenLabsVoiceProvider();
          const result = await provider.generateVoice({
            text: 'Hello, this is a test.',
            language: 'en-US',
          });
          return reply.code(200).send({ ok: true, provider: result.provider, model: result.model });
        }
        if (body.provider === 'MOCK') {
          const provider = new MockVoiceProvider();
          const result = await provider.generateVoice({ text: 'test', language: 'en-US' });
          return reply.code(200).send({ ok: true, provider: result.provider, model: result.model });
        }
      }
      if (body.group === 'VIDEO') {
        if (body.provider === 'VEO' || body.provider === 'KLING' || body.provider === 'RUNWAY' || body.provider === 'PIXVERSE' || body.provider === 'AGNES') {
          const envKeys: Record<string, string> = {
            VEO: 'GOOGLE_API_KEY',
            KLING: 'KLING_API_KEY',
            RUNWAY: 'RUNWAY_API_KEY',
            PIXVERSE: 'PIXVERSE_API_KEY',
            AGNES: 'AGNES_API_KEY',
          };
          const testKey = apiKey || envValue(envKeys[body.provider] ?? '') || '';
          if (!testKey) {
            return reply.code(200).send({ ok: false, message: `No API key configured for ${body.provider}` });
          }
          return reply.code(200).send({ ok: true, provider: body.provider, message: `${body.provider} key is configured` });
        }
        if (body.provider === 'MOCK') {
          return reply.code(200).send({ ok: true, provider: 'MOCK' });
        }
      }
      return reply
        .code(400)
        .send({ ok: false, message: `Connection test is not supported for ${body.provider}` });
    } catch (err) {
      return reply.code(200).send({ ok: false, message: errorMessage(err) });
    }
  });
}

function priorityOf(group: string, active: string): string[] {
  const setting = getProviderSetting(group);
  const raw = setting?.custom?.priority;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((x): x is string => typeof x === 'string');
        if (ids.length) return ids;
      }
    } catch {
      /* malformed */
    }
  }
  return [active];
}
