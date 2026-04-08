// AI Router: Selects the best AI tool for each task
// Currently supports OpenAI GPT, with placeholders for Claude and Gemini

export type AITool = 'gpt' | 'claude' | 'gemini';

export interface AIRequest {
  task: string; // e.g., 'analyze_website', 'generate_campaign_idea'
  input: any;
  options?: {
    maxTokens?: number;
    temperature?: number;
  };
}

export interface AIResponse {
  tool: AITool;
  output: any;
  confidence: number; // 0-1, how well the tool fits
}

class AIRouter {
  private availableTools: AITool[] = ['gpt']; // Add 'claude', 'gemini' later

  async route(request: AIRequest): Promise<AIResponse> {
    const bestTool = this.selectTool(request.task);

    switch (bestTool) {
      case 'gpt':
        return await this.callGPT(request);
      case 'claude':
        return await this.callClaude(request);
      case 'gemini':
        return await this.callGemini(request);
      default:
        throw new Error(`Unsupported AI tool: ${bestTool}`);
    }
  }

  private selectTool(task: string): AITool {
    // Simple logic: use GPT for everything for now
    // Later: analyze task type and choose based on strengths
    // e.g., Claude for analysis, Gemini for creative, GPT for general
    return 'gpt';
  }

  private async callGPT(request: AIRequest): Promise<AIResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Use mini for cost efficiency
        messages: [{ role: 'user', content: JSON.stringify(request.input) }],
        max_tokens: request.options?.maxTokens || 1000,
        temperature: request.options?.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      tool: 'gpt',
      output: data.choices[0].message.content,
      confidence: 0.9, // High confidence for GPT
    };
  }

  private async callClaude(request: AIRequest): Promise<AIResponse> {
    // Placeholder for Claude API
    throw new Error('Claude not implemented yet');
  }

  private async callGemini(request: AIRequest): Promise<AIResponse> {
    // Placeholder for Gemini API
    throw new Error('Gemini not implemented yet');
  }
}

export const aiRouter = new AIRouter();