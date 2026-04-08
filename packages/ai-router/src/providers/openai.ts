import OpenAI from "openai";
import type { AIRequest, AIResponse, AIProvider_Interface } from "../types";
import { MODEL_COSTS } from "../config";

export class OpenAIProvider implements AIProvider_Interface {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async run(request: AIRequest): Promise<AIResponse> {
    const model = request.task === "cheap_task" ? "gpt-4o-mini" : "gpt-4o";
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    if (request.messages) {
      for (const m of request.messages) {
        messages.push({ role: m.role, content: m.content });
      }
    } else {
      messages.push({ role: "user", content: request.prompt ?? '' });
    }

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: request.options?.maxTokens ?? 2000,
      temperature: request.options?.temperature ?? 0.7,
    });

    const usage = response.usage!;
    const costs = MODEL_COSTS[`openai/${model}`];
    const costUsd =
      (usage.prompt_tokens / 1000) * costs.input +
      (usage.completion_tokens / 1000) * costs.output;

    return {
      provider: "openai",
      model,
      output: response.choices[0].message.content ?? "",
      tokensUsed: usage.total_tokens,
      costUsd,
    };
  }
}
