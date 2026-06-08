export type TaskType =
  | "copywriting"
  | "analysis"
  | "market_research"
  | "image_generation"
  | "seo_content"
  | "optimization_decision"
  | "report_generation"
  | "cheap_task"
  | "chat"
  | "web_research";

export type AIProvider = "openai" | "anthropic" | "google";

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  task: TaskType;
  prompt?: string;
  messages?: ChatMessage[];
  systemPrompt?: string;
  options?: {
    maxTokens?: number;
    temperature?: number;
    tenantId?: string;
  };
}

export interface AIResponse {
  provider: AIProvider;
  model: string;
  output: string;
  tokensUsed: number;
  costUsd: number;
}

export interface AIProvider_Interface {
  run(request: AIRequest): Promise<AIResponse>;
}
