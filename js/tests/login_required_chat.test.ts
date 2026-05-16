/**
 * Slice 1B: system::auth accepted with post-auth tokens.
 * Verifies that the SDK updates _accessToken/_refreshToken when SM sends
 * new tokens in the accepted payload (login_required flow).
 */
import { startMockServer } from './mock-server.js';
import { makeClient } from './test-client-factory.js';
import { waitFor } from './helpers.js';
import type { CortexMessage } from '../src/types.js';

const POST_AUTH_ACCESS_TOKEN = 'post_auth_access_token_v1';
const POST_AUTH_REFRESH_TOKEN = 'post_auth_refresh_token_v1';

function getPrivate(client: object, field: string): unknown {
  return (client as Record<string, unknown>)[field];
}

describe('login_required_chat', () => {
  it('system::auth accepted with tokens updates _accessToken and _refreshToken', async () => {
    const server = await startMockServer({ autoInitEcho: true });
    const client = makeClient(server, () => {});

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      server.broadcast({
        type: 'system::auth',
        schema: '1.0',
        session_id: null,
        payload: {
          state: 'accepted',
          access_token: POST_AUTH_ACCESS_TOKEN,
          refresh_token: POST_AUTH_REFRESH_TOKEN,
        },
        ts: new Date().toISOString(),
      });

      await waitFor(() => getPrivate(client, '_accessToken') === POST_AUTH_ACCESS_TOKEN);

      expect(getPrivate(client, '_accessToken')).toBe(POST_AUTH_ACCESS_TOKEN);
      expect(getPrivate(client, '_refreshToken')).toBe(POST_AUTH_REFRESH_TOKEN);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('system::auth accepted without tokens does not clear existing _accessToken', async () => {
    const server = await startMockServer({ autoInitEcho: true });
    const client = makeClient(server, () => {});

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      const tokenBefore = getPrivate(client, '_accessToken');
      expect(tokenBefore).toBeTruthy();

      server.broadcast({
        type: 'system::auth',
        schema: '1.0',
        session_id: null,
        payload: { state: 'accepted' },
        ts: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(getPrivate(client, '_accessToken')).toBe(tokenBefore);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('system::auth accepted message is still forwarded to onMessage handlers', async () => {
    const server = await startMockServer({ autoInitEcho: true });
    const messages: CortexMessage[] = [];
    const client = makeClient(server, (msg) => messages.push(msg));

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      server.broadcast({
        type: 'system::auth',
        schema: '1.0',
        session_id: null,
        payload: {
          state: 'accepted',
          access_token: POST_AUTH_ACCESS_TOKEN,
          refresh_token: POST_AUTH_REFRESH_TOKEN,
        },
        ts: new Date().toISOString(),
      });

      await waitFor(() => messages.some(m => m.type === 'system::auth'));

      const authMsg = messages.find(m => m.type === 'system::auth')!;
      expect(authMsg.payload['state']).toBe('accepted');
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('system::auth accepted with empty string tokens does not update _accessToken', async () => {
    const server = await startMockServer({ autoInitEcho: true });
    const client = makeClient(server, () => {});

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      const tokenBefore = getPrivate(client, '_accessToken');

      server.broadcast({
        type: 'system::auth',
        schema: '1.0',
        session_id: null,
        payload: {
          state: 'accepted',
          access_token: '',
          refresh_token: '',
        },
        ts: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Empty string is falsy — should not overwrite the existing token
      expect(getPrivate(client, '_accessToken')).toBe(tokenBefore);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });
});
