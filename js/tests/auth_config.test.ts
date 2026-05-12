import {
  AUTH_REFRESH_PATH,
  AUTH_TOKEN_PATH,
  DEFAULT_AUTH_URL,
} from '../src/constants.js';
import { CortexClient, type CortexClientPlatform } from '../src/client.js';
import type { FetchFn, FormDataCtor, Response, WebSocketLike } from '../src/types.js';

class FakeWebSocket implements WebSocketLike {
  readyState = 1;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string | Buffer }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(_url: string, _protocols: string[]) {
    setTimeout(() => this.onopen?.({}), 0);
  }

  send(_data: string): void {}

  close(code = 1000, reason = 'disconnect'): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

function makeResponse(body: Record<string, unknown>, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  };
}

function makeJwt(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  ).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

function makePlatform(fetchFn: FetchFn): CortexClientPlatform {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FormDataClass = (globalThis as any).FormData as FormDataCtor;
  return {
    WS: FakeWebSocket as unknown as CortexClientPlatform['WS'],
    fetchFn,
    FormDataClass,
    uploadUrl: '/upload',
  };
}

describe('auth configuration', () => {
  it('uses the default auth URL when authUrl is not provided', async () => {
    const urls: string[] = [];
    const headers: Array<Record<string, string> | undefined> = [];
    const fetchFn: FetchFn = async (url, init) => {
      urls.push(url);
      headers.push(init.headers);
      return makeResponse({
        ws_url: 'ws://runtime.test/ws',
        access_token: makeJwt(3600),
        refresh_token: 'refresh_token_v1',
        runtime_bootstrap: {
          execution_mode: 'production',
          bundle_url: '/bundle',
          checksum: 'sha256:test',
        },
      });
    };

    const client = new CortexClient(
      {
        apiKey: 'test-key',
        onMessage: () => {},
        pingInterval: 60000,
        staleThreshold: 60000,
      },
      makePlatform(fetchFn),
    );

    try {
      await client.connect();
      expect(urls).toEqual([`${DEFAULT_AUTH_URL}${AUTH_TOKEN_PATH}`]);
      expect(headers[0]?.Authorization).toBe('ApiKey test-key');
    } finally {
      await client.disconnect();
    }
  });

  it('normalizes a full token endpoint URL to base URL', async () => {
    const urls: string[] = [];
    const fetchFn: FetchFn = async (url, _init) => {
      urls.push(url);
      return makeResponse({
        ws_url: 'ws://runtime.test/ws',
        access_token: makeJwt(3600),
        refresh_token: 'refresh_token_v1',
        runtime_bootstrap: {
          execution_mode: 'production',
          bundle_url: '/bundle',
          checksum: 'sha256:test',
        },
      });
    };

    const client = new CortexClient(
      {
        apiKey: 'test-key',
        authUrl: 'https://auth.example.test/auth/token', // wrong: full endpoint instead of base URL
        onMessage: () => {},
        pingInterval: 60000,
        staleThreshold: 60000,
      },
      makePlatform(fetchFn),
    );

    try {
      await client.connect();
      // Must NOT produce /auth/token/auth/token
      expect(urls).toEqual(['https://auth.example.test/auth/token']);
    } finally {
      await client.disconnect();
    }
  });

  it('uses the configured authUrl for token exchange and refresh', async () => {
    const urls: string[] = [];
    const headers: Array<Record<string, string> | undefined> = [];
    const fetchFn: FetchFn = async (url, init) => {
      urls.push(url);
      headers.push(init.headers);

      if (url.endsWith(AUTH_TOKEN_PATH)) {
        return makeResponse({
          ws_url: 'ws://runtime.test/ws',
          access_token: makeJwt(30),
          refresh_token: 'refresh_token_v1',
          runtime_bootstrap: {
            execution_mode: 'production',
            bundle_url: '/bundle',
            checksum: 'sha256:test',
          },
        });
      }

      return makeResponse({ access_token: makeJwt(3600) });
    };

    const client = new CortexClient(
      {
        apiKey: 'test-key',
        authUrl: 'https://auth.example.test/',
        onMessage: () => {},
        pingInterval: 60000,
        staleThreshold: 60000,
      },
      makePlatform(fetchFn),
    );

    try {
      await client.connect();
      await (client as unknown as { _maybeRefreshToken(): Promise<void> })._maybeRefreshToken();

      expect(urls).toEqual([
        'https://auth.example.test/auth/token',
        'https://auth.example.test/auth/refresh',
      ]);
      expect(headers[0]?.Authorization).toBe('ApiKey test-key');
      expect(headers[1]?.Authorization).toBe('Bearer refresh_token_v1');
    } finally {
      await client.disconnect();
    }
  });
});
