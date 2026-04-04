import type { AuthTokenResponse, FetchFn } from './types.js';
export declare function exchangeApiKey(apiKey: string, fetchFn: FetchFn, authBaseUrl?: string): Promise<AuthTokenResponse>;
export declare function refreshAccessToken(refreshToken: string, fetchFn: FetchFn, authBaseUrl?: string): Promise<string>;
export declare function isTokenExpiringSoon(accessToken: string): boolean;
export declare function normalizeAuthBaseUrl(authUrl: string): string;
//# sourceMappingURL=auth.d.ts.map