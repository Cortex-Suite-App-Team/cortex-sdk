import { DEFAULT_AUTH_URL, AUTH_TOKEN_PATH, AUTH_REFRESH_PATH, TOKEN_REFRESH_BUFFER_MS, } from './constants.js';
import { makeError } from './errors.js';
function parseJwtExp(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        // base64url → base64 → JSON
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(atob(payload));
        const exp = json['exp'];
        if (typeof exp === 'number')
            return exp * 1000; // convert to ms
        return null;
    }
    catch {
        return null;
    }
}
export async function exchangeApiKey(apiKey, fetchFn, authBaseUrl = DEFAULT_AUTH_URL) {
    const res = await fetchFn(buildAuthEndpoint(authBaseUrl, AUTH_TOKEN_PATH), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `ApiKey ${apiKey}`,
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = typeof body['error'] === 'string' ? body['error'] : 'auth_invalid';
        const message = typeof body['message'] === 'string' ? body['message'] : 'API key rejected';
        throw makeError(code, message);
    }
    return res.json();
}
export async function refreshAccessToken(refreshToken, fetchFn, authBaseUrl = DEFAULT_AUTH_URL) {
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
    const body = await res.json();
    return body['access_token'];
}
export function isTokenExpiringSoon(accessToken) {
    const expMs = parseJwtExp(accessToken);
    if (expMs === null)
        return false;
    return Date.now() > expMs - TOKEN_REFRESH_BUFFER_MS;
}
export function normalizeAuthBaseUrl(authUrl) {
    let normalized = authUrl.replace(/\/+$/, '');
    // Guard: consumer may have passed a full endpoint instead of the base URL.
    // Strip known auth paths and warn so developers catch the misconfiguration early.
    for (const knownPath of [AUTH_TOKEN_PATH, AUTH_REFRESH_PATH]) {
        if (normalized.endsWith(knownPath)) {
            const base = normalized.slice(0, -knownPath.length);
            console.warn(`[CortexSDK] authUrl must be a base URL (origin only), not a full endpoint. ` +
                `Received "${authUrl}" — "${knownPath}" has been stripped automatically. ` +
                `Pass the base URL only, e.g., "${base}".`);
            normalized = base;
            break;
        }
    }
    return normalized || DEFAULT_AUTH_URL;
}
function buildAuthEndpoint(authBaseUrl, path) {
    return `${normalizeAuthBaseUrl(authBaseUrl)}${path}`;
}
//# sourceMappingURL=auth.js.map