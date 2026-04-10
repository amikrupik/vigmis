export type CampaignType =
  | 'search'
  | 'display'
  | 'shopping'
  | 'conversion'
  | 'traffic'
  | 'leads'
  | 'in-feed'
  | 'spark'
  | 'topview';

export interface CampaignSpec {
  name: string;            // VIGMIS_* — caller sets this
  type: CampaignType;
  dailyBudgetUsd: number;
  geoTargets: string[];    // e.g. ['IL', 'Tel Aviv']
  goal: 'leads' | 'purchases' | 'traffic' | 'awareness';
}

export interface CampaignResult {
  externalId: string | null;
  name: string;
  platform: 'google' | 'meta' | 'tiktok';
  status: 'active' | 'paused' | 'error';
  error?: string;
}
