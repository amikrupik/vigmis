// Every ad platform connector must implement this interface.
// This ensures Google and Meta are swappable without touching business logic.

export type Platform = 'google' | 'meta' | 'tiktok';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  accountId?: string;  // Google Ads customer ID or Meta Ad Account ID
}

export interface AdConnector {
  platform: Platform;

  // Step 1: Return the URL the user is redirected to for OAuth consent
  getAuthUrl(tenantId: string, state: string): string;

  // Step 2: Exchange the auth code for tokens and persist them
  handleCallback(code: string, tenantId: string): Promise<OAuthTokens>;

  // Refresh an expired access token using the stored refresh token
  refreshTokens(tenantId: string): Promise<OAuthTokens>;

  // Check if the stored connection is still valid
  validateConnection(tenantId: string): Promise<boolean>;
}
