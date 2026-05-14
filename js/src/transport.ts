import {
  WS_SUBPROTOCOL,
  WS_SUBPROTOCOL_JWT_PREFIX,
} from './constants.js';
import { debugLog } from './debug.js';
import { makeError } from './errors.js';
import type { WebSocketCtor, WebSocketLike } from './types.js';

export interface Transport {
  open(wsUrl: string, accessToken: string): Promise<void>;
  send(message: unknown, timeoutMs: number): Promise<void>;
  close(code?: number, reason?: string): void;
  onMessage: ((data: string) => void) | null;
  onClose: ((code: number, reason: string) => void) | null;
  onError: ((error: Error) => void) | null;
}

type TransportOpenError = Error & {
  code?: string;
  wsUrl?: string;
  closeCode?: number;
  closeReason?: string;
  phase?: 'connect' | 'connected';
};

function _asCloseReason(reason: unknown): string {
  if (typeof reason === 'string') {
    return reason;
  }
  if (reason instanceof Uint8Array) {
    try {
      return new TextDecoder().decode(reason);
    } catch {
      return '';
    }
  }
  return '';
}

function _buildOpenError(
  wsUrl: string,
  baseMessage: string,
  details: {
    closeCode?: number;
    closeReason?: string;
    phase?: 'connect' | 'connected';
  } = {},
): TransportOpenError {
  const suffix: string[] = [];
  if (typeof details.closeCode === 'number') {
    suffix.push(`close_code=${details.closeCode}`);
  }
  if (details.closeReason) {
    suffix.push(`close_reason=${details.closeReason}`);
  }
  suffix.push(`ws_url=${wsUrl}`);
  const error = makeError(
    'transport_open_failed',
    suffix.length ? `${baseMessage} (${suffix.join(', ')})` : baseMessage,
  ) as TransportOpenError;
  error.wsUrl = wsUrl;
  error.closeCode = details.closeCode;
  error.closeReason = details.closeReason;
  error.phase = details.phase;
  return error;
}

export function createTransport(
  WS: WebSocketCtor,
  connectTimeoutMs: number,
  isDebugEnabled: () => boolean = () => false,
): Transport {
  let ws: WebSocketLike | null = null;

  const transport: Transport = {
    onMessage: null,
    onClose: null,
    onError: null,

    open(wsUrl: string, accessToken: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const protocols = [
          WS_SUBPROTOCOL,
          `${WS_SUBPROTOCOL_JWT_PREFIX}${accessToken}`,
        ];

        const socket = new WS(wsUrl, protocols);
        ws = socket;
        let settled = false;
        let opened = false;
        let openErrorMessage = 'WebSocket error';

        const timer = setTimeout(() => {
          socket.close();
          if (settled) {
            return;
          }
          settled = true;
          reject(makeError('transport_connect_timeout', `WebSocket connect timed out (ws_url=${wsUrl})`));
        }, connectTimeoutMs);

        socket.onopen = () => {
          clearTimeout(timer);
          if (settled) {
            return;
          }
          opened = true;
          settled = true;
          resolve();
        };

        socket.onerror = (event: unknown) => {
          const msg = event instanceof Error ? event.message : 'WebSocket error';
          openErrorMessage = msg;
          if (opened) {
            transport.onError?.(
              _buildOpenError(wsUrl, msg, {
                phase: 'connected',
              }),
            );
          }
        };

        socket.onclose = (event) => {
          clearTimeout(timer);
          const reason = _asCloseReason(event.reason);
          if (!opened && !settled) {
            settled = true;
            reject(
              _buildOpenError(wsUrl, openErrorMessage, {
                closeCode: event.code,
                closeReason: reason,
                phase: 'connect',
              }),
            );
          }
          transport.onClose?.(event.code, reason);
        };

        socket.onmessage = (event) => {
          transport.onMessage?.(event.data);
        };
      });
    },

    send(message: unknown, timeoutMs: number): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!ws) {
          reject(makeError('transport_send_timeout', 'No open connection'));
          return;
        }
        const timer = setTimeout(() => {
          reject(makeError('transport_send_timeout', 'Send timed out'));
        }, timeoutMs);

        try {
          const envelopeType = (
            typeof message === 'object'
            && message !== null
            && 'type' in message
            && typeof (message as { type?: unknown }).type === 'string'
          )
            ? (message as { type: string }).type
            : 'unknown';
          debugLog(isDebugEnabled(), '[sdk] transport.send start', {
            envelopeType,
            readyState: ws.readyState,
          });
          ws.send(JSON.stringify(message));
          debugLog(isDebugEnabled(), '[sdk] transport.send done', {
            envelopeType,
            readyState: ws.readyState,
          });
          clearTimeout(timer);
          resolve();
        } catch (err) {
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
