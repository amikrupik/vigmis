export type { AdConnector, OAuthTokens, Platform } from './connector.interface.js';
export type { CampaignSpec, CampaignResult, CampaignType } from './campaign.interface.js';
export { GoogleAdsConnector } from './google/auth.js';
export { MetaAdsConnector } from './meta/auth.js';
export { TikTokAdsConnector } from './tiktok/auth.js';
export { createGoogleCampaign, pauseGoogleCampaign, resumeGoogleCampaign } from './google/campaigns.js';
export { createMetaCampaign, pauseMetaCampaign, resumeMetaCampaign, listMetaCampaigns } from './meta/campaigns.js';
export { createTikTokCampaign, pauseTikTokCampaign, resumeTikTokCampaign } from './tiktok/campaigns.js';
