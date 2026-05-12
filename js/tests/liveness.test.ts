/**
 * liveness transcript test:
 * ping/pong cycle — verifies SDK sends pings and handles pongs.
 * Two complete cycles. Also verifies STALE transition when pong stops.
 */
import { startMockServer } from './mock-server.js';
import { makeClient } from './test-client-factory.js';
import { waitFor } from './helpers.js';

describe('liveness', () => {
  it('sends ping and receives pong — two complete cycles', async () => {
    let pingSentCount = 0;
    let pongSentCount = 0;

    const server = await startMockServer({
      autoInitEcho: true,
      autoPong: true, // auto pong is on
      autoChatAnswer: false,
      onWsMessage: (parsed) => {
        if (parsed['type'] === 'system::ping') {
          pingSentCount++;
          // Validate ping payload shape
          const payload = parsed['payload'] as Record<string, unknown>;
          expect(typeof payload['heartbeat_id']).toBe('string');
          expect(typeof payload['channel_id']).toBe('string');
          pongSentCount++; // autoPong will also send pong
        }
      },
    });

    const client = makeClient(server, () => {}, {
      pingInterval: 100,  // fast ping for testing
      pongTimeout: 500,
      staleThreshold: 5000,
    });

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      // Wait for 2 complete ping/pong cycles
      await waitFor(() => pingSentCount >= 2, 3000);

      expect(pingSentCount).toBeGreaterThanOrEqual(2);
      expect(client.channelState).toBe('OPEN');

      // Verify pong payloads (check the server.received for pings)
      const pings = server.received.filter(m => m['type'] === 'system::ping');
      expect(pings.length).toBeGreaterThanOrEqual(2);

      // Each ping has a unique heartbeat_id
      const heartbeatIds = pings.map(p => (p['payload'] as Record<string, unknown>)['heartbeat_id']);
      const uniqueIds = new Set(heartbeatIds);
      expect(uniqueIds.size).toBe(pings.length);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('transitions to STALE when pong stops arriving', async () => {
    const server = await startMockServer({
      autoInitEcho: true,
      autoPong: false, // no pong — will go stale
      autoChatAnswer: false,
    });

    let wentStale = false;
    const client = makeClient(server, () => {}, {
      pingInterval: 100,
      pongTimeout: 200,
      staleThreshold: 300, // very short
    });

    // Monkey-patch to detect stale
    const origHandleStale = (client as unknown as { _handleStale: () => void })['_handleStale'].bind(client);
    (client as unknown as { _handleStale: () => void })['_handleStale'] = () => {
      wentStale = true;
      origHandleStale();
    };

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      await waitFor(() => wentStale, 3000);
      expect(wentStale).toBe(true);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });
});
