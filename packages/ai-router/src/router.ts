import { AI_ROUTING } from "./config.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GeminiProvider } from "./providers/gemini.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import type { AIRequest, AIResponse, AIProvider_Interface } from "./types.js";

// Lazy initialization — providers created on first use, not at module load.
// This prevents crashes when env vars are missing at startup.
let _providers: Record<string, AIProvider_Interface> | null = null;

// Providers with a dedicated native SDK. All other prefixes (perplexity, mistral, etc.)
// are routed through OpenRouter, which is OpenAI-compatible.
const NATIVE_PROVIDERS = new Set(['openai', 'anthropic', 'google']);

function getProviders(): Record<string, AIProvider_Interface> {
  if (!_providers) {
    _providers = {
      openai: new OpenAIProvider(),
      anthropic: new AnthropicProvider(),
      google: new GeminiProvider(),
      openrouter: new OpenRouterProvider(),
    };
  }
  return _providers;
}

export async function route(request: AIRequest): Promise<AIResponse> {
  const providers = getProviders();
  const modelString = AI_ROUTING[request.task]; // e.g. "anthropic/claude-sonnet-4-6"
  const [providerName] = modelString.split("/");

  // Use native provider if available, otherwise route through OpenRouter
  const providerKey = NATIVE_PROVIDERS.has(providerName) ? providerName : 'openrouter';
  const provider = providers[providerKey];

  try {
    return await provider.run(request);
  } catch (err) {
    // Provider failed — fall back to OpenAI
    return providers["openai"].run(request);
  }
}
