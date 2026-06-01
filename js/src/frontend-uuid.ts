// Stable per-visitor identifier established once and reused across sessions.
//
// Storage policy: localStorage is PRIMARY, cookie is a FALLBACK only. We never
// rely on cookie-only — SameSite / iframe / third-party-cookie policies must not
// silently break visitor identity. In non-browser runtimes this returns
// undefined (no visitor identity), which the CP treats as anonymous.

const STORAGE_KEY = 'cortex_frontend_uuid';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function generateUuid(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // RFC4122-ish fallback when crypto.randomUUID is unavailable.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || typeof doc.cookie !== 'string') return null;
  const prefix = `${name}=`;
  for (const part of doc.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return;
  try {
    doc.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    /* cookies may be blocked — localStorage remains primary */
  }
}

/**
 * Return the stable frontend_uuid for this browser, generating + persisting one
 * on first use. Returns undefined when no storage is available (e.g. SSR/node).
 */
export function ensureFrontendUuid(): string | undefined {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;

  // 1. localStorage (primary)
  if (ls) {
    try {
      const existing = ls.getItem(STORAGE_KEY);
      if (existing) return existing;
    } catch {
      /* access may throw in some privacy modes — fall through to cookie */
    }
  }

  // 2. cookie (fallback)
  const fromCookie = readCookie(STORAGE_KEY);
  if (fromCookie) {
    if (ls) {
      try { ls.setItem(STORAGE_KEY, fromCookie); } catch { /* ignore */ }
    }
    return fromCookie;
  }

  // 3. no identity available at all (non-browser runtime)
  if (!ls && !(globalThis as { document?: Document }).document) {
    return undefined;
  }

  // 4. generate + persist (localStorage primary, cookie mirror)
  const generated = generateUuid();
  if (ls) {
    try { ls.setItem(STORAGE_KEY, generated); } catch { /* ignore */ }
  }
  writeCookie(STORAGE_KEY, generated);
  return generated;
}
