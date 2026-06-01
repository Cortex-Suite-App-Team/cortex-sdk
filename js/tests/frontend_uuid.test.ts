import { exchangeApiKey } from '../src/auth.js';
import { ensureFrontendUuid } from '../src/frontend-uuid.js';

function fakeResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe('exchangeApiKey frontend_uuid plumbing', () => {
  it('sends frontend_uuid in body and header when provided', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return fakeResponse({ access_token: 'a', refresh_token: 'r', ws_url: 'wss://x.example/ws' });
    }) as unknown as typeof fetch;

    await exchangeApiKey('key', fetchFn as never, 'https://auth.example', 'worker-1', 'fu-123');

    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(body['frontend_uuid']).toBe('fu-123');
    expect(body['worker_ref']).toBe('worker-1');
    expect((capturedInit?.headers as Record<string, string>)['X-Cortex-Frontend-UUID']).toBe('fu-123');
  });

  it('omits frontend_uuid when not provided', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return fakeResponse({ access_token: 'a', refresh_token: 'r', ws_url: 'wss://x.example/ws' });
    }) as unknown as typeof fetch;

    await exchangeApiKey('key', fetchFn as never, 'https://auth.example');

    expect(capturedInit?.body).toBeUndefined();
  });
});

describe('ensureFrontendUuid', () => {
  it('generates and persists a stable id in localStorage', () => {
    const store: Record<string, string> = {};
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: () => null,
      length: 0,
    } as Storage;

    const first = ensureFrontendUuid();
    const second = ensureFrontendUuid();
    expect(first).toBeTruthy();
    expect(second).toBe(first);

    delete (globalThis as { localStorage?: Storage }).localStorage;
  });
});
