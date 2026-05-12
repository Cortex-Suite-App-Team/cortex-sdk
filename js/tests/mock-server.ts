/**
 * Mock HTTP + WebSocket server for SDK tests.
 * Simple, not production-grade. Correctness over elegance.
 */
import http from 'node:http';
import net from 'node:net';

import { WebSocketServer, WebSocket } from 'ws';

import {
  validateOutboundEnvelope,
  type SchemaViolation,
} from './schema-validation.js';

export interface ErrorInjectionOptions {
  phase?: 'ws_connect' | 'auth_token' | 'auth_refresh' | 'upload' | 'resync';
  afterMessages?: number;
  onMessageType?: string;
  closeAfterSend?: boolean;
  closeCode?: number;
  closeReason?: string;
  status?: number;
}

interface InjectedError {
  code: string;
  options: ErrorInjectionOptions;
  consumed: boolean;
}

export interface MockServerOptions {
  /** Called when the server receives a WS message from the client. */
  onWsMessage?: (parsed: Record<string, unknown>, ws: WebSocket, server: MockServer) => void;
  autoPong?: boolean;
  autoChatAnswer?: boolean;
  autoInitEcho?: boolean;
  enableSchemaValidation?: boolean;
  initialAccessToken?: string;
  refreshedAccessToken?: string;
  refreshToken?: string;
}

export interface MockServer {
  readonly port: number;
  readonly wsUrl: string;
  readonly httpUrl: string;
  readonly schemaViolations: SchemaViolation[];
  readonly wsConnectionCount: number;
  readonly refreshCallCount: number;
  readonly uploadCallCount: number;
  readonly receivedMessageCount: number;
  received: Array<Record<string, unknown>>;
  clients: Set<WebSocket>;
  dropConnections(): void;
  broadcast(msg: Record<string, unknown>): void;
  sendTo(ws: WebSocket, msg: Record<string, unknown>): void;
  injectError(code: string, options?: ErrorInjectionOptions): void;
  setAuthTokens(tokens: {
    accessToken?: string;
    refreshedAccessToken?: string;
    refreshToken?: string;
  }): void;
  close(): Promise<void>;
}

const FIXED_SESSION_ID = 'sess_abc123';
const FIXED_ACCESS_TOKEN = 'access_token_v1';
const FIXED_REFRESH_TOKEN = 'refresh_token_v1';
const FIXED_ATTACHMENT_ID = 'att_test123';

let _seq = 0;
function nextSeq(): number { return ++_seq; }
function resetSeq() { _seq = 0; }

function ts(): string { return new Date().toISOString(); }

function makeEnvelope(
  type: string,
  payload: Record<string, unknown>,
  sessionId: string = FIXED_SESSION_ID,
): Record<string, unknown> {
  return {
    type,
    schema: '1.0',
    session_id: sessionId,
    seq: nextSeq(),
    payload,
    ts: ts(),
  };
}

function defaultHttpStatus(code: string): number {
  switch (code) {
    case 'auth_invalid':
    case 'auth_refresh_failed':
      return 401;
    case 'upload_too_large':
      return 413;
    case 'upload_type_rejected':
      return 415;
    case 'upload_failed':
      return 500;
    default:
      return 400;
  }
}

function makeSystemErrorPayload(code: string): Record<string, unknown> {
  return {
    code,
    message: `Injected ${code}`,
  };
}

export function startMockServer(options: MockServerOptions = {}): Promise<MockServer> {
  const {
    autoPong = true,
    autoChatAnswer = true,
    autoInitEcho = true,
    enableSchemaValidation = false,
    initialAccessToken = FIXED_ACCESS_TOKEN,
    refreshedAccessToken = 'access_token_v2',
    refreshToken = FIXED_REFRESH_TOKEN,
  } = options;

  resetSeq();

  return new Promise((resolve) => {
    const received: Array<Record<string, unknown>> = [];
    const clients = new Set<WebSocket>();
    const schemaViolations: SchemaViolation[] = [];
    const injections: InjectedError[] = [];
    const hangSockets = new Set<net.Socket>();

    let wsConnectionCount = 0;
    let refreshCallCount = 0;
    let uploadCallCount = 0;
    let currentAccessToken = initialAccessToken;
    let currentRefreshToken = refreshToken;
    let currentRefreshedAccessToken = refreshedAccessToken;

    function takeInjection(
      predicate: (injection: InjectedError) => boolean,
    ): InjectedError | undefined {
      const match = injections.find((injection) => !injection.consumed && predicate(injection));
      if (match) {
        match.consumed = true;
      }
      return match;
    }

    function maybeSendInjectedError(
      ws: WebSocket,
      code: string,
      injectOptions: ErrorInjectionOptions,
    ) {
      server.sendTo(ws, makeEnvelope('system::error', makeSystemErrorPayload(code)));
      if (injectOptions.closeAfterSend) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(
              injectOptions.closeCode ?? 1011,
              injectOptions.closeReason ?? code,
            );
          }
        }, 0);
      }
    }

    const hangServer = net.createServer((socket) => {
      hangSockets.add(socket);
      socket.on('close', () => hangSockets.delete(socket));
      socket.on('error', () => {});
      socket.on('data', () => {
        // Intentionally do nothing — the WebSocket client hangs until connect timeout.
      });
    });

    const httpServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${(httpServer.address() as { port: number }).port || 0}`);
        const url = requestUrl.pathname;

        if (req.method === 'POST' && url === '/auth/token') {
          const injection = takeInjection((candidate) => candidate.options.phase === 'auth_token');
          const wsPort = (httpServer.address() as { port: number }).port;
          const wsUrl = injection?.code === 'transport_connect_timeout'
            ? `ws://127.0.0.1:${(hangServer.address() as net.AddressInfo).port}/ws`
            : `ws://127.0.0.1:${wsPort}/ws`;

          if (injection && injection.code !== 'transport_connect_timeout') {
            const status = injection.options.status ?? defaultHttpStatus(injection.code);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: injection.code,
              message: `Injected ${injection.code}`,
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ws_url: wsUrl,
            cp_api_url: `http://127.0.0.1:${wsPort}`,
            access_token: currentAccessToken,
            refresh_token: currentRefreshToken,
            runtime_bootstrap: {
              execution_mode: 'production',
              bundle_url: '/api/runtime/releases/42/bundle/',
              checksum: 'sha256:release_42',
            },
          }));
          return;
        }

        if (req.method === 'POST' && url === '/auth/refresh') {
          refreshCallCount++;
          const injection = takeInjection((candidate) => candidate.options.phase === 'auth_refresh');
          if (injection) {
            const status = injection.options.status ?? defaultHttpStatus(injection.code);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: injection.code,
              message: `Injected ${injection.code}`,
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ access_token: currentRefreshedAccessToken }));
          return;
        }

        if (req.method === 'POST' && url === '/upload') {
          uploadCallCount++;
          const injection = takeInjection((candidate) => candidate.options.phase === 'upload');
          if (injection) {
            const status = injection.options.status ?? defaultHttpStatus(injection.code);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: injection.code,
              message: `Injected ${injection.code}`,
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ attachment_id: FIXED_ATTACHMENT_ID }));
          return;
        }

        if (req.method === 'GET' && url.startsWith('/download/')) {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(Buffer.from('mock file bytes'));
          return;
        }

        if (req.method === 'GET' && url === `/sessions/${FIXED_SESSION_ID}/files/`) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            files: [{
              file_id: FIXED_ATTACHMENT_ID,
              filename: 'upload',
              scope_type: 'session',
              scope_id: FIXED_SESSION_ID,
              status: 'ready',
            }],
            total: 1,
          }));
          return;
        }

        if (req.method === 'GET' && url.startsWith('/api/workspace/projects/') && url.endsWith('/files/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            files: [{
              file_id: FIXED_ATTACHMENT_ID,
              filename: 'upload',
              scope_type: 'persistent',
              scope_id: '42',
              status: 'ready',
            }],
            total: 1,
          }));
          return;
        }

        if (req.method === 'POST' && url.startsWith('/api/workspace/projects/') && url.endsWith('/promote/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            file_id: FIXED_ATTACHMENT_ID,
            filename: 'upload',
            scope_type: 'persistent',
            scope_id: '42',
            status: 'ready',
          }));
          return;
        }

        if (req.method === 'GET' && url.startsWith('/api/workspace/projects/') && url.endsWith('/download/')) {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(Buffer.from('project file bytes'));
          return;
        }

        res.writeHead(404);
        res.end();
      });
    });

    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    wss.on('connection', (ws, req) => {
      wsConnectionCount++;
      const protocols = req.headers['sec-websocket-protocol'] ?? '';
      const hasJwtProtocol = protocols.split(',').some((protocol) => protocol.trim().startsWith('cortex-sdk.jwt.'));
      if (!hasJwtProtocol) {
        ws.close(4001, 'auth_invalid');
        return;
      }

      const connectInjection = takeInjection((candidate) => candidate.options.phase === 'ws_connect');
      if (connectInjection?.code === 'auth_invalid') {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(4001, 'auth_invalid');
          }
        }, 25);
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
        return;
      }

      clients.add(ws);
      ws.on('close', () => clients.delete(ws));

      ws.on('message', (data: Buffer) => {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        received.push(parsed);

        if (enableSchemaValidation) {
          const violations = validateOutboundEnvelope(parsed);
          if (violations.length > 0) {
            schemaViolations.push(...violations);
            for (const violation of violations) {
              console.error('[mock-server] schema violation', JSON.stringify(violation, null, 2));
            }
            server.sendTo(ws, makeEnvelope(
              'system::error',
              makeSystemErrorPayload('transport_protocol_violation'),
            ));
            return;
          }
        }

        const messageType = parsed.type;
        const matchedInjection = takeInjection((candidate) => {
          const phase = candidate.options.phase;
          if (phase && phase !== 'resync') {
            return false;
          }
          const expectedType = phase === 'resync'
            ? 'system::resync'
            : candidate.options.onMessageType;
          const seenBefore = received.length - 1;
          const afterMatches = candidate.options.afterMessages === undefined
            || seenBefore >= candidate.options.afterMessages;
          const typeMatches = expectedType === undefined || expectedType === messageType;
          return afterMatches && typeMatches;
        });

        if (matchedInjection) {
          maybeSendInjectedError(ws, matchedInjection.code, matchedInjection.options);
          if (matchedInjection.options.closeAfterSend) {
            return;
          }
        }

        if (messageType === 'system::init' && autoInitEcho) {
          server.sendTo(ws, makeEnvelope('chat::answer', {
            content: '',
            role: 'assistant',
            answer_kind: 'echo',
            turn_id: 'turn_init',
          }));
        }

        if (messageType === 'system::ping' && autoPong) {
          const payload = parsed.payload as Record<string, unknown>;
          server.sendTo(ws, {
            type: 'system::pong',
            schema: '1.0',
            session_id: FIXED_SESSION_ID,
            payload: {
              heartbeat_id: payload.heartbeat_id,
              channel_id: payload.channel_id,
              server_ts: ts(),
            },
            ts: ts(),
          });
        }

        if (messageType === 'chat::message' && autoChatAnswer && !matchedInjection) {
          server.sendTo(ws, makeEnvelope('chat::answer', {
            content: 'Mock answer',
            role: 'assistant',
            answer_kind: 'final',
            turn_id: `turn_${nextSeq()}`,
          }));
        }

        options.onWsMessage?.(parsed, ws, server);
      });
    });

    const server: MockServer = {
      get port() {
        return (httpServer.address() as { port: number }).port;
      },
      get wsUrl() {
        return `ws://127.0.0.1:${server.port}/ws`;
      },
      get httpUrl() {
        return `http://127.0.0.1:${server.port}`;
      },
      get schemaViolations() {
        return schemaViolations;
      },
      get wsConnectionCount() {
        return wsConnectionCount;
      },
      get refreshCallCount() {
        return refreshCallCount;
      },
      get uploadCallCount() {
        return uploadCallCount;
      },
      get receivedMessageCount() {
        return received.length;
      },
      received,
      clients,

      dropConnections() {
        for (const client of clients) {
          client.terminate();
        }
      },

      broadcast(msg) {
        const encoded = JSON.stringify(msg);
        for (const client of clients) {
          client.send(encoded);
        }
      },

      sendTo(ws, msg) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      },

      injectError(code, injectionOptions = {}) {
        injections.push({
          code,
          options: injectionOptions,
          consumed: false,
        });
      },

      setAuthTokens(tokens) {
        if (tokens.accessToken !== undefined) {
          currentAccessToken = tokens.accessToken;
        }
        if (tokens.refreshedAccessToken !== undefined) {
          currentRefreshedAccessToken = tokens.refreshedAccessToken;
        }
        if (tokens.refreshToken !== undefined) {
          currentRefreshToken = tokens.refreshToken;
        }
      },

      close(): Promise<void> {
        return new Promise((resolveClose, rejectClose) => {
          for (const client of clients) {
            client.terminate();
          }
          for (const socket of hangSockets) {
            socket.destroy();
          }
          hangServer.close(() => {
            httpServer.close((error) => {
              if (error) {
                rejectClose(error);
              } else {
                resolveClose();
              }
            });
          });
        });
      },
    };

    hangServer.listen(0, '127.0.0.1', () => {
      httpServer.listen(0, '127.0.0.1', () => {
        resolve(server);
      });
    });
  });
}

export { FIXED_SESSION_ID, FIXED_ATTACHMENT_ID };
