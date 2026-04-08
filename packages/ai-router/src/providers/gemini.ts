import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIRequest, AIResponse, AIProvider_Interface } from '../types';
import { MODEL_COSTS } from '../config';

const MODEL = 'gemini-2.5-flash';

export class GeminiProvider implements AIProvider_Interface {
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
  }

  async run(request: AIRequest): Promise<AIResponse> {
    const model = this.client.getGenerativeModel({ model: MODEL });

    const basePrompt = request.messages
      ? request.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')
      : (request.prompt ?? '');

    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${basePrompt}`
      : basePrompt;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;
    const costs = MODEL_COSTS[`google/${MODEL}`] ?? { input: 0.00125, output: 0.005 };
    const costUsd =
      (inputTokens / 1000) * costs.input +
      (outputTokens / 1000) * costs.output;

    return {
      provider: 'google',
      model: MODEL,
      output: text,
      tokensUsed: inputTokens + outputTokens,
      costUsd,
    };
  }
}
