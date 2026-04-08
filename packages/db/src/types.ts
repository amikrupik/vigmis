// TypeScript types mirroring the Supabase schema
// Keep in sync with supabase/migrations/001_initial_schema.sql

export interface Tenant {
  id: string;
  clerk_user_id: string;
  email: string | null;
  created_at: string;
}

export interface StrategyPlatform {
  name: 'google' | 'meta';
  campaign_types: string[];
  budget_percentage: number;
  reasoning: string;
}

export interface StrategyPlan {
  platforms: StrategyPlatform[];
  market_insights: string;
  target_audience: string;
  estimated_cpc: string;
  recommendations: string;
}

export interface ClientSettings {
  id: string;
  tenant_id: string;
  website_url: string | null;
  management_percentage: number;
  budget_monthly_ils: number;
  goal: 'leads' | 'purchases' | 'traffic' | 'awareness';
  geo_include: string[];
  geo_exclude: string[];
  exclusions: string | null;
  open_notes: string | null;
  risk_level: 'conservative' | 'balanced' | 'aggressive';
  dayparting_rules: DaypartingRule[];
  strategy_plan: StrategyPlan | null;
  conversation: ConversationMessage[];
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DaypartingRule {
  day: number;        // 0 = Sunday, 6 = Saturday
  start_hour: number; // 0–23
  end_hour: number;   // 0–23
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface PlatformToken {
  id: string;
  tenant_id: string;
  platform: 'google' | 'meta';
  access_token: string;   // encrypted
  refresh_token: string | null; // encrypted
  expires_at: string | null;
  scope: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  action: string;
  platform: 'google' | 'meta' | null;
  actor: 'system' | 'user';
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Campaign {
  id: string;
  tenant_id: string;
  platform: 'google' | 'meta';
  external_id: string | null;
  name: string;
  campaign_type: string;
  status: 'pending' | 'active' | 'paused' | 'error';
  daily_budget_usd: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  action_type: string;
  platform: 'google' | 'meta' | null;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reminder_sent_at: string | null;
  decided_at: string | null;
  expires_at: string;
  created_at: string;
}
