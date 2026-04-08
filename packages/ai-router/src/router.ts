import { AI_ROUTING, FALLBACK_MODEL } from "./config.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GeminiProvider } from "./providers/gemini.js";
import type { AIRequest, AIResponse, AIProvider_Interface } from "./types.js";

const providers: Record<string, AIProvider_Interface> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  google: new GeminiProvider(),
};

export async function route(request: AIRequest): Promise<AIResponse> {
  const modelString = AI_ROUTING[request.task]; // e.g. "anthropic/claude-sonnet-4-6"
  const [providerName] = modelString.split("/");
  const provider = providers[providerName];

  if (provider) {
    try {
      return await provider.run(request);
    } catch (err) {
      // Provider failed — fall back to OpenAI
      const fallbackProvider = providers["openai"];
      return fallbackProvider.run(request);
    }
  }

  // Provider not registered — use fallback
  return providers["openai"].run(request);
}
