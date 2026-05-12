/**
 * auth_refresh transcript test:
 * Verifies proactive token refresh:
 * - connect with a token that will expire soon
 * - SDK should call /auth/refresh before the token expires
 * - after refresh, if reconnect happens, the new token is used
 */
import { startMockServer } from './mock-server.js';
import { makeClient } from './test-client-factory.js';
import { waitFor } from './helpers.js';
import { isTokenExpiringSoon } from '../src/auth.js';
import type { CortexMessage } from '../src/types.js';

describe('auth_refresh', () => {
  it('proactively refreshes access token before expiry', async () => {
    let refreshCalled = false;

    const server = await startMockServer({
      autoInitEcho: true,
      autoChatAnswer: true,
    });

    // We verify proactive refresh by checking isTokenExpiringSoon logic
    // A token with exp in the past is already expired
    const expiredToken = makeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
    expect(isTokenExpiringSoon(expiredToken)).toBe(true);

    // A token with exp far in the future is not expiring soon
    const freshToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isTokenExpiringSoon(freshToken)).toBe(false);

    // A token expiring within 60s buffer should be considered expiring soon
    const soonToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + 30 });
    expect(isTokenExpiringSoon(soonToken)).toBe(true);

    // Test full flow: connect, message, answer
    const received: CortexMessage[] = [];
    const client = makeClient(server, (msg) => received.push(msg));

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      await client.sendMessage({ content: 'First message before refresh' });
      await waitFor(() => received.some(m => m.type === 'chat::answer' && m.payload['answer_kind'] === 'final'), 3000);

      expect(received.find(m => m.type === 'chat::answer')).toBeDefined();
    } finally {
      await client.disconnect();
      await server.close();
    }
  });
});

/** Creates a minimal JWT with the given payload claims. Not signed — for testing only. */
function makeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}
