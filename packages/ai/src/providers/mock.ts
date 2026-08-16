import type { AICompletionRequest, AICompletionResult, AIProvider } from '../types.js';
import { estimateCost } from '../types.js';

/**
 * Deterministic local provider used for development and tests when no external
 * AI key is configured. Produces a realistic structured script so the whole
 * pipeline can be exercised end to end.
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'MOCK' as const;
  readonly model = 'mock-script-v1';

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const started = Date.now();
    const sceneCount = 6;
    const scenes = Array.from({ length: sceneCount }, (_, i) => ({
      order: i + 1,
      duration: 6,
      narration: `Scene ${i + 1}: ${req.user.slice(0, 40)} (narration segment ${i + 1})`,
      visualPrompt: `cinematic 9:16 vertical shot, ${req.user.slice(0, 40)}, style: documentary, high quality`,
      subtitle: `Scene ${i + 1} subtitle text`,
    }));

    const output = {
      title: `Mock video about: ${req.user.slice(0, 60)}`,
      hook: `Did you know? ${req.user.slice(0, 50)}`,
      script: scenes.map((s) => s.narration).join(' '),
      scenes,
      caption: `Interesting facts about ${req.user.slice(0, 50)}`,
      hashtags: ['#shorts', '#facts', '#ai'],
    };

    const text = JSON.stringify(output);
    const inputTokens = req.user.length / 4;
    const outputTokens = text.length / 4;

    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens: Math.ceil(inputTokens),
      outputTokens: Math.ceil(outputTokens),
      estimatedCost: estimateCost(this.name, this.model, inputTokens, outputTokens),
      durationMs: Date.now() - started,
    };
  }
}
