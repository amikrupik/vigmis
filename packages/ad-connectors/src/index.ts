export type { AdConnector, OAuthTokens, Platform } from './connector.interface.js';
export type { CampaignSpec, CampaignResult, CampaignType } from './campaign.interface.js';
export { GoogleAdsConnector } from './google/auth.js';
export { MetaAdsConnector } from './meta/auth.js';
export { TikTokAdsConnector } from './tiktok/auth.js';
export {
  createGoogleCampaign, pauseGoogleCampaign, resumeGoogleCampaign,
  fetchGoogleCampaignMetrics, updateGoogleBudget,
} from './google/campaigns.js';
export { createMetaCampaign, pauseMetaCampaign, resumeMetaCampaign, listMetaCampaigns } from './meta/campaigns.js';
export { createMetaAdSet, getMetaAdSetInsights, pauseMetaAdSet } from './meta/ab-test.js';
export { createTikTokCampaign, pauseTikTokCampaign, resumeTikTokCampaign } from './tiktok/campaigns.js';
export { listGa4Properties, fetchGa4DailyAcquisition, type GA4Property, type GA4DailyRow } from './ga4/index.js';
