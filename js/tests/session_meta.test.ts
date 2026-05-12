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

describe('sessionMeta retention', () => {
  it('retains bootstrap trigger meta on the client and forwards unchanged runtime_bootstrap to sendInit', async () => {
    const runtimeBootstrap = {
      execution_mode: 'production',
      bundle_url: '/bundle',
      checksum: 'sha256:test',
      trigger_payload: {
        meta: {
          project_id: '123',
          chat_correspondent: {
            kind: 'digital_worker',
            id: 'project_123',
            name: 'Robot Vasya',
            title: 'Legal Assistant',
          },
        },
      },
    };

    const fetchFn: FetchFn = async (_url, _init) => makeResponse({
      ws_url: 'ws://runtime.test/ws',
      access_token: makeJwt(3600),
      refresh_token: 'refresh_token_v1',
      runtime_bootstrap: runtimeBootstrap,
    });

    const client = new CortexClient(
      {
        apiKey: 'test-key',
        onMessage: () => {},
        pingInterval: 60000,
        staleThreshold: 60000,
      },
      makePlatform(fetchFn),
    );

    const sendInitCalls: unknown[] = [];
    const session = (client as unknown as { _session: { sendInit: (bootstrap: unknown) => Promise<void> } })._session;
    const originalSendInit = session.sendInit.bind(session);
    session.sendInit = async (bootstrap: unknown) => {
      sendInitCalls.push(bootstrap);
      await originalSendInit(bootstrap);
    };

    try {
      await client.connect();

      expect(sendInitCalls).toEqual([runtimeBootstrap]);
      expect(client.sessionMeta).toEqual(runtimeBootstrap.trigger_payload.meta);
      expect(client.sessionMeta?.['chat_correspondent']).toEqual({
        kind: 'digital_worker',
        id: 'project_123',
        name: 'Robot Vasya',
        title: 'Legal Assistant',
      });
    } finally {
      await client.disconnect();
    }
  });
});
