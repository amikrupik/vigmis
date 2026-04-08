import Anthropic from '@anthropic-ai/sdk';
import type { AIRequest, AIResponse, AIProvider_Interface } from '../types.js';
import { MODEL_COSTS } from '../config.js';

const MODEL = 'claude-haiku-4-5-20251001'; // default; overridden per task in config

export class AnthropicProvider implements AIProvider_Interface {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async run(request: AIRequest): Promise<AIResponse> {
    const model = this.selectModel(request);

    const msgs = request.messages
      ? request.messages.map(m => ({ role: m.role, content: m.content }))
      : [{ role: 'user' as const, content: request.prompt ?? '' }];

    const response = await this.client.messages.create({
      model,
      max_tokens: request.options?.maxTokens ?? 2000,
      system: request.systemPrompt,
      messages: msgs,
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costs = MODEL_COSTS[`anthropic/${model}`] ?? { input: 0.003, output: 0.015 };
    const costUsd =
      (inputTokens / 1000) * costs.input +
      (outputTokens / 1000) * costs.output;

    const content = response.content[0];
    const output = content.type === 'text' ? content.text : '';

    return {
      provider: 'anthropic',
      model,
      output,
      tokensUsed: inputTokens + outputTokens,
      costUsd,
    };
  }

  private selectModel(request: AIRequest): string {
    // Use Sonnet for heavy tasks, Haiku for cheap tasks
    const sonnetTasks = ['analysis', 'seo_content', 'optimization_decision', 'report_generation', 'chat'];
    if (sonnetTasks.includes(request.task)) return 'claude-sonnet-4-6';
    return 'claude-haiku-4-5-20251001';
  }
}
