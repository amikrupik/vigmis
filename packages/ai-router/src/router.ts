import { AI_ROUTING } from "./config.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GeminiProvider } from "./providers/gemini.js";
import type { AIRequest, AIResponse, AIProvider_Interface } from "./types.js";

// Lazy initialization — providers created on first use, not at module load.
// This prevents crashes when env vars are missing at startup.
let _providers: Record<string, AIProvider_Interface> | null = null;

function getProviders(): Record<string, AIProvider_Interface> {
  if (!_providers) {
    _providers = {
      openai: new OpenAIProvider(),
      anthropic: new AnthropicProvider(),
      google: new GeminiProvider(),
    };
  }
  return _providers;
}

export async function route(request: AIRequest): Promise<AIResponse> {
  const providers = getProviders();
  const modelString = AI_ROUTING[request.task]; // e.g. "anthropic/claude-sonnet-4-6"
  const [providerName] = modelString.split("/");
  const provider = providers[providerName];

  if (provider) {
    try {
      return await provider.run(request);
    } catch (err) {
      // Provider failed — fall back to OpenAI
      return providers["openai"].run(request);
    }
  }

  // Provider not registered — use fallback
  return providers["openai"].run(request);
}
