import { WS_SUBPROTOCOL, WS_SUBPROTOCOL_JWT_PREFIX, } from './constants.js';
import { makeError } from './errors.js';
export function createTransport(WS, connectTimeoutMs) {
    let ws = null;
    const transport = {
        onMessage: null,
        onClose: null,
        onError: null,
        open(wsUrl, accessToken) {
            return new Promise((resolve, reject) => {
                const protocols = [
                    WS_SUBPROTOCOL,
                    `${WS_SUBPROTOCOL_JWT_PREFIX}${accessToken}`,
                ];
                const socket = new WS(wsUrl, protocols);
                ws = socket;
                const timer = setTimeout(() => {
                    socket.close();
                    reject(makeError('transport_connect_timeout', 'WebSocket connect timed out'));
                }, connectTimeoutMs);
                socket.onopen = () => {
                    clearTimeout(timer);
                    resolve();
                };
                socket.onerror = (event) => {
                    clearTimeout(timer);
                    const msg = event instanceof Error ? event.message : 'WebSocket error';
                    reject(new Error(msg));
                };
                socket.onclose = (event) => {
                    clearTimeout(timer);
                    const reason = typeof event.reason === 'string'
                        ? event.reason
                        : Buffer.isBuffer(event.reason)
                            ? event.reason.toString()
                            : '';
                    transport.onClose?.(event.code, reason);
                };
                socket.onmessage = (event) => {
                    transport.onMessage?.(event.data);
                };
            });
        },
        send(message, timeoutMs) {
            return new Promise((resolve, reject) => {
                if (!ws) {
                    reject(makeError('transport_send_timeout', 'No open connection'));
                    return;
                }
                const timer = setTimeout(() => {
                    reject(makeError('transport_send_timeout', 'Send timed out'));
                }, timeoutMs);
                try {
                    ws.send(JSON.stringify(message));
                    clearTimeout(timer);
                    resolve();
                }
                catch (err) {
                    clearTimeout(timer);
                    reject(makeError('transport_send_timeout', String(err)));
                }
            });
        },
        close(code = 1000, reason = 'disconnect') {
            ws?.close(code, reason);
            ws = null;
        },
    };
    return transport;
}
//# sourceMappingURL=transport.js.map