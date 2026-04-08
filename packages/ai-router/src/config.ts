import type { TaskType } from "./types";

// Change this file to swap models — nothing else needs to change
// Decision D-002: Claude for analysis/reasoning, GPT for writing/creativity
export const AI_ROUTING: Record<TaskType, string> = {
  copywriting:           "openai/gpt-4o",
  analysis:              "anthropic/claude-sonnet-4-6",
  market_research:       "google/gemini-2.5-flash",
  image_generation:      "openai/dall-e-3",
  seo_content:           "anthropic/claude-sonnet-4-6",
  optimization_decision: "anthropic/claude-sonnet-4-6",
  report_generation:     "anthropic/claude-sonnet-4-6",
  cheap_task:            "openai/gpt-4o-mini",
  chat:                  "anthropic/claude-sonnet-4-6",
};

// Cost per 1K tokens (input/output) in USD
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "openai/gpt-4o":                   { input: 0.0025,  output: 0.01 },
  "openai/gpt-4o-mini":              { input: 0.00015, output: 0.0006 },
  "openai/dall-e-3":                 { input: 0.04,    output: 0.04 }, // per image
  "anthropic/claude-sonnet-4-6":     { input: 0.003,   output: 0.015 },
  "anthropic/claude-haiku-4-5-20251001": { input: 0.00025, output: 0.00125 },
  "google/gemini-2.5-flash":            { input: 0.0001,  output: 0.0004 },
};

// Fallback: if primary provider is unavailable, use this model
export const FALLBACK_MODEL = "openai/gpt-4o";
