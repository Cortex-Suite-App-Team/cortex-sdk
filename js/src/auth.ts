import {
  DEFAULT_AUTH_URL,
  AUTH_TOKEN_PATH,
  AUTH_REFRESH_PATH,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants.js';
import { makeError } from './errors.js';
import type { AuthTokenResponse, FetchFn } from './types.js';

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 → JSON
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload)) as Record<string, unknown>;
    const exp = json['exp'];
    if (typeof exp === 'number') return exp * 1000; // convert to ms
    return null;
  } catch {
    return null;
  }
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--;
  }
  return value.slice(0, end);
}

export async function exchangeApiKey(
  apiKey: string,
  fetchFn: FetchFn,
  authBaseUrl = DEFAULT_AUTH_URL,
  workerRef?: string,
): Promise<AuthTokenResponse> {
  const requestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ApiKey ${apiKey}`,
    },
    ...(workerRef ? { body: JSON.stringify({ worker_ref: workerRef }) } : {}),
  };
  const res = await fetchFn(buildAuthEndpoint(authBaseUrl, AUTH_TOKEN_PATH), {
    ...requestInit,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const code = typeof body['error'] === 'string' ? body['error'] : 'auth_invalid';
    const message = typeof body['message'] === 'string' ? body['message'] : 'API key rejected';
    throw makeError(code, message);
  }

  return res.json() as Promise<AuthTokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string,
  fetchFn: FetchFn,
  authBaseUrl = DEFAULT_AUTH_URL,
): Promise<string> {
  const res = await fetchFn(buildAuthEndpoint(authBaseUrl, AUTH_REFRESH_PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
  });

  if (!res.ok) {
    throw makeError('auth_refresh_failed', 'Refresh token expired or invalid');
  }

  const body = await res.json() as Record<string, unknown>;
  return body['access_token'] as string;
}

export function isTokenExpiringSoon(accessToken: string): boolean {
  const expMs = parseJwtExp(accessToken);
  if (expMs === null) return false;
  return Date.now() > expMs - TOKEN_REFRESH_BUFFER_MS;
}

export function normalizeAuthBaseUrl(authUrl: string): string {
  let normalized = trimTrailingSlashes(authUrl);
  // Guard: consumer may have passed a full endpoint instead of the base URL.
  // Strip known auth paths and warn so developers catch the misconfiguration early.
  for (const knownPath of [AUTH_TOKEN_PATH, AUTH_REFRESH_PATH]) {
    if (normalized.endsWith(knownPath)) {
      const base = normalized.slice(0, -knownPath.length);
      console.warn(
        `[CortexSDK] authUrl must be a base URL (origin only), not a full endpoint. ` +
        `Received "${authUrl}" — "${knownPath}" has been stripped automatically. ` +
        `Pass the base URL only, e.g., "${base}".`,
      );
      normalized = base;
      break;
    }
  }
  return normalized || DEFAULT_AUTH_URL;
}

function buildAuthEndpoint(authBaseUrl: string, path: string): string {
  return `${normalizeAuthBaseUrl(authBaseUrl)}${path}`;
}
