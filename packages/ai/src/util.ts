import type { ZodType } from 'zod';
import { AIErrorCode } from './types.js';
import { providerError } from './types.js';

/**
 * Best-effort extraction of a JSON payload from an AI response.
 * Providers are asked for structured JSON; this handles the rare cases where a
 * model wraps the JSON in code fences or adds prose around it.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return JSON.parse(fenceMatch[1].trim());
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
  }

  throw new Error('No JSON object found in response');
}

/**
 * Runs a provider completion and validates the result against a zod schema,
 * returning the typed output. Re-validating protects the pipeline from
 * providers that do not honor structured output.
 */
export async function completeJson<T>(
  provider: {
    complete(req: { system: string; user: string; jsonMode?: boolean; jsonSchemaDescription?: string; requestId?: string }): Promise<{ text: string; provider: string; model: string; inputTokens: number; outputTokens: number; estimatedCost: number; durationMs: number }>;
  },
  system: string,
  user: string,
  schema: ZodType<T>,
  opts?: { requestId?: string },
): Promise<{ data: T; usage: { provider: string; model: string; inputTokens: number; outputTokens: number; estimatedCost: number; durationMs: number } }> {
  const result = await provider.complete({
    system,
    user,
    jsonMode: true,
    jsonSchemaDescription: describeZodSchema(schema),
    requestId: opts?.requestId,
  });

  let parsed: unknown;
  try {
    parsed = extractJson(result.text);
  } catch {
    throw providerError(
      AIErrorCode.INVALID_REQUEST,
      result.provider,
      'Model output could not be parsed as JSON',
      { model: result.model },
    );
  }

  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    throw providerError(
      AIErrorCode.INVALID_REQUEST,
      result.provider,
      `Model output failed schema validation: ${validation.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      { model: result.model },
    );
  }

  return {
    data: validation.data,
    usage: {
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCost: result.estimatedCost,
      durationMs: result.durationMs,
    },
  };
}

function describeZodSchema(schema: ZodType<unknown>): string {
  const json = zodToJsonSchema(schema as ZodTypeAny);
  return JSON.stringify(json, null, 2);
}

type ZodTypeAny = {
  _def?: { typeName?: string; innerType?: ZodTypeAny; options?: unknown; element?: ZodTypeAny; shape?: () => Record<string, ZodTypeAny>; checks?: { min?: number; max?: number }[] };
};

/**
 * Converts the subset of zod schemas used by this project into a plain JSON
 * schema that is fed to the model as a description of the expected output.
 */
function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const typeName = schema._def?.typeName ?? '';
  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(schema._def?.element as ZodTypeAny) };
    case 'ZodEnum': {
      const options = (schema._def?.options as unknown[]) ?? [];
      return { type: 'string', enum: options };
    }
    case 'ZodDefault':
    case 'ZodOptional': {
      const inner = schema._def?.innerType as ZodTypeAny;
      return zodToJsonSchema(inner);
    }
    case 'ZodObject': {
      const shape = schema._def?.shape?.() ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, field] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(field as ZodTypeAny);
        const fieldType = (field as ZodTypeAny)._def?.typeName;
        if (fieldType !== 'ZodOptional' && fieldType !== 'ZodDefault') {
          required.push(key);
        }
      }
      return { type: 'object', properties, required };
    }
    default:
      return {};
  }
}
