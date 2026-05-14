import { startMockServer, FIXED_SESSION_ID } from './mock-server.js';
import { makeClient } from './test-client-factory.js';

function makeOpened(clientMsgId: string) {
  return {
    type: 'system::opened',
    schema: '1.0',
    session_id: FIXED_SESSION_ID,
    payload: {
      status: 'initializing',
      client_msg_id: clientMsgId,
      execution_mode: 'production',
      artifact_id: 'rel_42',
      artifact_kind: 'graph',
      run_mode: 'normal',
      identity: {
        tenant_id: 'tenant_test',
        project_id: 'project_test',
        deployment_id: 'deploy_test',
        release_id: 'rel_42',
        user_id: null,
        user_uuid: null,
        actor_kind: 'public_widget_user',
        actor_ref: 'public_widget:tenant_test:project_test:live-worker',
      },
      correspondent: {
        kind: 'digital_worker',
        id: 'project_test',
        name: 'Mock Worker',
        title: 'Digital Worker',
        subtitle: null,
        avatar_url: null,
      },
    },
    meta: { client_msg_id: clientMsgId },
    ts: new Date().toISOString(),
  };
}

async function waitFor(check: () => boolean, timeoutMs: number = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
}

describe('openSession handshake', () => {
  it('connect waits for system::opened before resolving', async () => {
    let initClientMsgId = '';
    let initSocket: import('ws').WebSocket | null = null;
    const server = await startMockServer({
      autoInitEcho: false,
      onWsMessage: (parsed, ws) => {
        if (parsed.type === 'system::init') {
          const meta = parsed.meta as Record<string, unknown> | undefined;
          initClientMsgId = typeof meta?.['client_msg_id'] === 'string' ? meta['client_msg_id'] : 'cli_init_test';
          initSocket = ws;
        }
      },
    });
    const client = makeClient(server, () => {});

    try {
      let resolved = false;
      const connectPromise = client.connect().then(() => {
        resolved = true;
      });

      await waitFor(() => server.received.some((frame) => frame.type === 'system::init'));
      expect(resolved).toBe(false);
      expect(server.received.filter((frame) => frame.type === 'system::init')).toHaveLength(1);

      expect(initSocket).not.toBeNull();
      server.sendTo(initSocket!, makeOpened(initClientMsgId));

      await connectPromise;

      expect(client.sessionId).toBe(FIXED_SESSION_ID);
      expect(client.sessionContext?.sessionId).toBe(FIXED_SESSION_ID);
      expect(client.channelState).toBe('OPEN');
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('concurrent connect calls reuse the same in-flight open', async () => {
    let initCount = 0;
    let initClientMsgId = '';
    let initSocket: import('ws').WebSocket | null = null;
    const server = await startMockServer({
      autoInitEcho: false,
      onWsMessage: (parsed, ws) => {
        if (parsed.type === 'system::init') {
          initCount += 1;
          const meta = parsed.meta as Record<string, unknown> | undefined;
          initClientMsgId = typeof meta?.['client_msg_id'] === 'string' ? meta['client_msg_id'] : 'cli_init_test';
          initSocket = ws;
        }
      },
    });
    const client = makeClient(server, () => {});

    try {
      const first = client.connect();
      const second = client.connect();
      expect(first).toBe(second);

      await waitFor(() => initCount === 1);
      expect(initCount).toBe(1);

      server.sendTo(initSocket!, makeOpened(initClientMsgId));
      await Promise.all([first, second]);
      expect(client.sessionId).toBe(FIXED_SESSION_ID);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('fails with session_open_timeout when system::opened never arrives', async () => {
    const server = await startMockServer({ autoInitEcho: false });
    const client = makeClient(server, () => {}, { sessionOpenTimeout: 100 });

    try {
      await expect(client.connect()).rejects.toMatchObject({
        code: 'session_open_timeout',
      });
      await waitFor(() => client.channelState === 'CLOSED');
      expect(client.sessionId).toBeNull();
      expect(client.channelState).toBe('CLOSED');
      expect(server.wsConnectionCount).toBe(1);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('disconnect clears session getters after an opened session', async () => {
    const server = await startMockServer();
    const client = makeClient(server, () => {});

    try {
      await client.connect();
      expect(client.sessionId).toBe(FIXED_SESSION_ID);
      expect(client.sessionContext?.sessionId).toBe(FIXED_SESSION_ID);

      await client.disconnect();

      expect(client.channelState).toBe('CLOSED');
      expect(client.sessionId).toBeNull();
      expect(client.sessionContext).toBeNull();
      expect(client.sessionMeta).toBeNull();
    } finally {
      await server.close();
    }
  });
});
