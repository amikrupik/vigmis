// OpenRouter provider — OpenAI-compatible gateway to 200+ models.
// Used for: Perplexity Sonar (web search), and any model not natively supported.
// Set OPENROUTER_API_KEY env var.

import OpenAI from "openai";
import type { AIRequest, AIResponse, AIProvider_Interface } from "../types.js";
import { AI_ROUTING, MODEL_COSTS } from "../config.js";

export class OpenRouterProvider implements AIProvider_Interface {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://vigmis.com',
        'X-Title': 'Vigmis',
      },
    });
  }

  async run(request: AIRequest): Promise<AIResponse> {
    // Use the full model ID from config (e.g. "perplexity/sonar-pro")
    const model = AI_ROUTING[request.task];

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    if (request.messages) {
      for (const m of request.messages) messages.push({ role: m.role, content: m.content });
    } else {
      messages.push({ role: 'user', content: request.prompt ?? '' });
    }

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: request.options?.maxTokens ?? 2000,
      temperature: request.options?.temperature ?? 0.7,
    });

    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const costs = MODEL_COSTS[model] ?? { input: 0.003, output: 0.015 };
    const costUsd =
      (usage.prompt_tokens / 1000) * costs.input +
      (usage.completion_tokens / 1000) * costs.output;

    return {
      provider: 'openai',
      model,
      output: response.choices[0]?.message?.content ?? '',
      tokensUsed: usage.total_tokens,
      costUsd,
    };
  }
}
