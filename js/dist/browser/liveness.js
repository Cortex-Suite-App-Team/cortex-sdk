import { SCHEMA_VERSION } from './constants.js';
export function createLiveness(transport, pingIntervalMs, pongTimeoutMs, staleThresholdMs, callbacks) {
    let pingTimer = null;
    let pongTimer = null;
    let lastPongMs = Date.now();
    let pendingHeartbeatId = null;
    let running = false;
    function generateId() {
        return `hb_${Math.random().toString(36).slice(2, 10)}`;
    }
    function sendPing() {
        if (!running)
            return;
        // Check stale threshold
        if (Date.now() - lastPongMs > staleThresholdMs) {
            callbacks.onStale();
            return;
        }
        const heartbeatId = generateId();
        pendingHeartbeatId = heartbeatId;
        const sessionId = callbacks.getSessionId();
        const envelope = {
            type: 'system::ping',
            schema: SCHEMA_VERSION,
            payload: {
                heartbeat_id: heartbeatId,
                channel_id: callbacks.getChannelId(),
            },
            ts: new Date().toISOString(),
        };
        if (sessionId)
            envelope['session_id'] = sessionId;
        transport.send(envelope, 5000).catch(() => {
            // send failure is handled by transport's onClose
        });
        pongTimer = setTimeout(() => {
            if (pendingHeartbeatId === heartbeatId && running) {
                // pong timeout — mark as stale if threshold also passed
                if (Date.now() - lastPongMs > staleThresholdMs) {
                    callbacks.onStale();
                }
            }
        }, pongTimeoutMs);
        pingTimer = setTimeout(sendPing, pingIntervalMs);
    }
    return {
        start() {
            running = true;
            lastPongMs = Date.now();
            pingTimer = setTimeout(sendPing, pingIntervalMs);
        },
        stop() {
            running = false;
            if (pingTimer !== null) {
                clearTimeout(pingTimer);
                pingTimer = null;
            }
            if (pongTimer !== null) {
                clearTimeout(pongTimer);
                pongTimer = null;
            }
            pendingHeartbeatId = null;
        },
        handlePong(heartbeatId) {
            if (heartbeatId === pendingHeartbeatId) {
                pendingHeartbeatId = null;
                lastPongMs = Date.now();
                if (pongTimer !== null) {
                    clearTimeout(pongTimer);
                    pongTimer = null;
                }
            }
        },
    };
}
//# sourceMappingURL=liveness.js.map