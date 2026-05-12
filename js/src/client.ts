import {
  DEFAULT_AUTH_URL,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_SEND_TIMEOUT_MS,
  DEFAULT_RESYNC_TIMEOUT_MS,
  DEFAULT_PING_INTERVAL_MS,
  DEFAULT_PONG_TIMEOUT_MS,
  DEFAULT_STALE_THRESHOLD_MS,
  RECONNECT_BACKOFF_MS,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants.js';
import { makeError } from './errors.js';
import {
  exchangeApiKey,
  refreshAccessToken,
  isTokenExpiringSoon,
  normalizeAuthBaseUrl,
} from './auth.js';
import { createTransport } from './transport.js';
import { createLiveness } from './liveness.js';
import { createSession } from './session.js';
import { uploadFile, type UploadInput } from './upload.js';
import type {
  CortexClientOptions,
  CortexMessage,
  SessionState,
  ChannelState,
  ReplyEscalationOptions,
  WebSocketCtor,
  FetchFn,
  FormDataCtor,
  DownloadFileOptions,
  FileListResult,
  FileRef,
  ListFilesOptions,
  PromoteFileOptions,
  UploadFileOptions,
} from './types.js';

export interface CortexClientPlatform {
  WS: WebSocketCtor;
  fetchFn: FetchFn;
  FormDataClass: FormDataCtor;
  uploadUrl: string;
}

export class CortexClient {
  private readonly _options: Required<Omit<CortexClientOptions, 'apiKey' | 'onMessage'>> & Pick<CortexClientOptions, 'apiKey' | 'onMessage'>;
  private readonly _platform: CortexClientPlatform;
  private readonly _messageHandlers = new Set<(message: CortexMessage) => void>();

  private _channelState: ChannelState = 'CLOSED';
  private _accessToken: string | null = null;
  private _refreshToken: string | null = null;
  private _wsUrl: string | null = null;
  private _runtimeHttpBaseUrl: string | null = null;
  private _cpApiUrl: string | null = null;
  private _sessionMeta: Record<string, unknown> | null = null;
  private _channelId = `ch_${Math.random().toString(36).slice(2, 10)}`;
  private _reconnectAttempt = 0;
  private _disconnectRequested = false;

  private readonly _transport;
  private readonly _session;
  private _liveness: ReturnType<typeof createLiveness> | null = null;
  private _tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _pendingDelayCancels = new Set<() => void>();
  private _reconnectLoopPromise: Promise<void> | null = null;

  constructor(options: CortexClientOptions, platform: CortexClientPlatform) {
    const authUrl = normalizeAuthBaseUrl(options.authUrl ?? DEFAULT_AUTH_URL);
    this._options = {
      connectTimeout: DEFAULT_CONNECT_TIMEOUT_MS,
      sendTimeout: DEFAULT_SEND_TIMEOUT_MS,
      resyncTimeout: DEFAULT_RESYNC_TIMEOUT_MS,
      pingInterval: DEFAULT_PING_INTERVAL_MS,
      pongTimeout: DEFAULT_PONG_TIMEOUT_MS,
      staleThreshold: DEFAULT_STALE_THRESHOLD_MS,
      ...options,
      authUrl,
    };
    this._platform = platform;

    this._transport = createTransport(platform.WS, this._options.connectTimeout);
    this._session = createSession({
      onMessage: (msg) => {
        // Route pong to liveness
        if (msg.type === 'system::pong' && typeof msg.payload['heartbeat_id'] === 'string') {
          this._liveness?.handlePong(msg.payload['heartbeat_id'] as string);
          return; // pong is internal — not forwarded to user
        }
        this._dispatchMessage(msg);
      },
      onFatalError: (err) => {
        this._channelState = 'AUTH_FAILED';
        this._stopBackgroundActivity();
        // re-throw via disconnect so the user sees it
        this._transport.close();
        this._dispatchMessage({
          type: 'system::error',
          schema: '1.0',
          session_id: this._session.sessionId ?? '',
          payload: { code: (err as unknown as { code: string }).code, message: err.message },
          ts: new Date().toISOString(),
        });
      },
    });

    this._transport.onMessage = (data) => this._session.handleIncoming(data);
    this._transport.onClose = (code, reason) => this._handleClose(code, reason);
    this._transport.onError = () => { /* handled via onClose */ };
  }

  get sessionState(): SessionState { return this._session.sessionState; }
  get channelState(): ChannelState { return this._channelState; }
  get sessionId(): string | null { return this._session.sessionId; }
  get sessionMeta(): Record<string, unknown> | null { return this._sessionMeta; }

  onMessage(handler: (message: CortexMessage) => void): () => void {
    this._messageHandlers.add(handler);
    return () => {
      this._messageHandlers.delete(handler);
    };
  }

  async connect(): Promise<void> {
    this._disconnectRequested = false;
    this._reconnectAttempt = 0;

    // Auth exchange
    const authResponse = await exchangeApiKey(
      this._options.apiKey,
      this._platform.fetchFn,
      this._options.authUrl,
    );
    this._accessToken = authResponse.access_token;
    this._refreshToken = authResponse.refresh_token;
    this._wsUrl = authResponse.ws_url;
    this._runtimeHttpBaseUrl = deriveRuntimeHttpBaseUrl(authResponse.ws_url);
    this._runtimeHttpBaseUrl = deriveRuntimeHttpBaseUrlFromHttpUrl(this._platform.uploadUrl) ?? this._runtimeHttpBaseUrl;
    this._cpApiUrl = normalizeOptionalBaseUrl(authResponse.cp_api_url);
    this._sessionMeta = asRecord(asRecord(authResponse.runtime_bootstrap?.trigger_payload)?.meta);

    // Open channel + init session
    await this._openChannel();

    this._session.setTransport(this._transport, this._options.sendTimeout);
    await this._session.sendInit(authResponse.runtime_bootstrap);

    // Start liveness
    this._liveness = createLiveness(
      this._transport,
      this._options.pingInterval,
      this._options.pongTimeout,
      this._options.staleThreshold,
      {
        onStale: () => this._handleStale(),
        getSessionId: () => this._session.sessionId,
        getChannelId: () => this._channelId,
      },
    );
    this._liveness.start();

    // Schedule proactive token refresh
    this._scheduleTokenRefresh();
  }

  async disconnect(): Promise<void> {
    this._disconnectRequested = true;
    this._stopBackgroundActivity();
    this._channelState = 'CLOSED';
    this._transport.close();
  }

  async sendMessage(options: { content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }): Promise<void> {
    await this._session.sendChatMessage(options.content, options.attachments, options.meta);
  }

  async replyEscalation(options: ReplyEscalationOptions): Promise<void> {
    this._requireSessionId();
    await this._session.sendEscalationReply(
      options.escalationId,
      options.waitToken,
      options.action,
      options.content,
      options.meta,
    );
  }

  async uploadFile(file: UploadInput, options: UploadFileOptions = {}): Promise<string> {
    if (!this._accessToken) throw makeError('auth_invalid', 'Not connected');
    const sessionId = this._requireSessionId(options.sessionId);
    return uploadFile(
      file,
      this._accessToken,
      withQueryParams(this._resolveRuntimeUrl(this._platform.uploadUrl), { session_id: sessionId }),
      this._platform.fetchFn,
      this._platform.FormDataClass,
    );
  }

  async uploadAttachment(file: UploadInput): Promise<string> {
    return this.uploadFile(file);
  }

  async downloadFile(fileId: string, options: DownloadFileOptions = {}): Promise<Blob> {
    if (!this._accessToken) throw makeError('auth_invalid', 'Not connected');
    const scope = options.scope ?? 'session';
    let url: string;
    if (scope === 'session') {
      const sessionId = this._requireSessionId(options.sessionId);
      url = `${this._requireRuntimeHttpBaseUrl()}/download/${encodeURIComponent(fileId)}`;
      url = withQueryParams(url, { session_id: sessionId });
    } else if (scope === 'project') {
      if (options.projectId === undefined) {
        throw makeError('file_operation_failed', 'projectId is required for project file download');
      }
      url = `${this._requireCpApiUrl()}/api/workspace/projects/${encodeURIComponent(String(options.projectId))}`
        + `/files/${encodeURIComponent(fileId)}/download/`;
    } else {
      throw makeError('file_operation_failed', `Unsupported file scope: ${scope}`);
    }

    const res = await this._request(url, 'GET');
    if (typeof res.blob === 'function') {
      return res.blob();
    }
    if (typeof res.arrayBuffer === 'function') {
      return new Blob([await res.arrayBuffer()]);
    }
    throw makeError('file_operation_failed', 'File API response does not expose bytes');
  }

  async listFiles(options: ListFilesOptions = {}): Promise<FileListResult> {
    if (!this._accessToken) throw makeError('auth_invalid', 'Not connected');
    const scope = options.scope ?? 'session';
    const query = {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      include_trashed: String(options.includeTrashed ?? false),
    };
    let url: string;
    if (scope === 'session') {
      const sessionId = this._requireSessionId(options.sessionId);
      url = `${this._requireRuntimeHttpBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/files/`;
    } else if (scope === 'project') {
      if (options.projectId === undefined) {
        throw makeError('file_operation_failed', 'projectId is required for project file list');
      }
      url = `${this._requireCpApiUrl()}/api/workspace/projects/${encodeURIComponent(String(options.projectId))}/files/`;
    } else {
      throw makeError('file_operation_failed', `Unsupported file scope: ${scope}`);
    }

    const body = await this._requestJson(withQueryParams(url, query));
    return body as unknown as FileListResult;
  }

  async promoteFile(fileId: string, options: PromoteFileOptions): Promise<FileRef> {
    if (!this._accessToken) throw makeError('auth_invalid', 'Not connected');
    const url = `${this._requireCpApiUrl()}/api/workspace/projects/${encodeURIComponent(String(options.projectId))}`
      + `/files/${encodeURIComponent(fileId)}/promote/`;
    const body = await this._requestJson(url, 'POST');
    return body as unknown as FileRef;
  }

  async stop(): Promise<void> {
    await this._session.sendStop();
  }

  private async _openChannel(): Promise<void> {
    if (!this._wsUrl || !this._accessToken) throw new Error('Auth not completed');
    this._channelState = 'CONNECTING';
    await this._transport.open(this._wsUrl, this._accessToken);
    this._channelState = 'OPEN';
    this._reconnectAttempt = 0;
  }

  private _handleStale() {
    if (this._channelState === 'STALE' || this._channelState === 'RECONNECTING') return;
    this._channelState = 'STALE';
    this._liveness?.stop();
    this._transport.close(1001, 'stale');
    // onClose will trigger reconnect
  }

  private _handleClose(code: number, reason: string) {
    if (this._disconnectRequested) return;
    if (this._channelState === 'AUTH_FAILED') return;

    // Auth rejection codes
    if (code === 4001) {
      this._channelState = 'AUTH_FAILED';
      this._stopBackgroundActivity();
      return;
    }

    this._channelState = 'RECONNECTING';
    if (!this._reconnectLoopPromise) {
      this._reconnectLoopPromise = this._reconnectLoop()
        .finally(() => {
          this._reconnectLoopPromise = null;
        });
    }
  }

  private async _reconnectLoop() {
    while (!this._shouldStopReconnect()) {
      const backoffMs = RECONNECT_BACKOFF_MS[
        Math.min(this._reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)
      ] ?? 30000;
      this._reconnectAttempt++;

      const backoffDelay = this._createCancelableDelay(backoffMs);
      const backoffElapsed = await backoffDelay.promise;
      if (backoffElapsed === CANCELLED || this._shouldStopReconnect()) {
        break;
      }

      // Refresh token if needed
      try {
        await this._maybeRefreshToken();
      } catch {
        this._channelState = 'AUTH_FAILED';
        return;
      }

      try {
        await this._openChannel();
      } catch {
        continue; // retry
      }

      // Re-attach session to transport
      this._session.setTransport(this._transport, this._options.sendTimeout);

      // Resync with timeout
      const resyncTimeout = this._createCancelableDelay(this._options.resyncTimeout);
      try {
        const resyncOutcome = await Promise.race([
          this._session.sendResync().then(() => 'resynced' as const),
          resyncTimeout.promise.then((outcome) => (
            outcome === CANCELLED ? 'cancelled' as const : 'timed_out' as const
          )),
        ]);
        if (resyncOutcome === 'cancelled') {
          return;
        }
        if (resyncOutcome === 'timed_out') {
          throw makeError('resync_timeout', 'Resync timed out');
        }
      } catch {
        this._transport.close();
        continue;
      } finally {
        resyncTimeout.cancel();
      }

      // Restart liveness
      this._liveness?.stop();
      this._liveness = createLiveness(
        this._transport,
        this._options.pingInterval,
        this._options.pongTimeout,
        this._options.staleThreshold,
        {
          onStale: () => this._handleStale(),
          getSessionId: () => this._session.sessionId,
          getChannelId: () => this._channelId,
        },
      );
      this._liveness.start();
      this._scheduleTokenRefresh();
      return;
    }
  }

  private async _maybeRefreshToken() {
    if (!this._refreshToken) throw makeError('auth_refresh_failed', 'No refresh token');
    if (!this._accessToken || isTokenExpiringSoon(this._accessToken)) {
      this._accessToken = await refreshAccessToken(
        this._refreshToken,
        this._platform.fetchFn,
        this._options.authUrl,
      );
    }
  }

  private _scheduleTokenRefresh() {
    this._stopTokenRefreshTimer();
    if (!this._accessToken) return;

    // Check every 30s — if token is expiring soon, refresh proactively
    this._tokenRefreshTimer = setInterval(async () => {
      if (this._accessToken && isTokenExpiringSoon(this._accessToken) && this._refreshToken) {
        try {
          this._accessToken = await refreshAccessToken(
            this._refreshToken,
            this._platform.fetchFn,
            this._options.authUrl,
          );
        } catch {
          // Will fail at next reconnect and surface there
        }
      }
    }, TOKEN_REFRESH_BUFFER_MS / 2);
  }

  private _stopTokenRefreshTimer() {
    if (this._tokenRefreshTimer !== null) {
      clearInterval(this._tokenRefreshTimer);
      this._tokenRefreshTimer = null;
    }
  }

  private _stopBackgroundActivity() {
    this._liveness?.stop();
    this._stopTokenRefreshTimer();
    this._cancelPendingDelays();
  }

  private _dispatchMessage(message: CortexMessage) {
    try {
      this._options.onMessage(message);
    } catch {
      // Preserve delivery to subscribed handlers even if the constructor callback throws.
    }
    const handlers = Array.from(this._messageHandlers);
    for (const handler of handlers) {
      try {
        handler(message);
      } catch {
        // Isolate subscription errors so other handlers still receive the message.
      }
    }
  }

  private _shouldStopReconnect() {
    return this._disconnectRequested || this._channelState === 'AUTH_FAILED';
  }

  private _createCancelableDelay(ms: number): { promise: Promise<typeof CANCELLED | true>; cancel: () => void } {
    let settled = false;
    let resolveDelay: (outcome: typeof CANCELLED | true) => void = () => {};

    const promise = new Promise<typeof CANCELLED | true>((resolve) => {
      resolveDelay = resolve;
    });

    const cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      this._pendingDelayCancels.delete(cancel);
      resolveDelay(CANCELLED);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      this._pendingDelayCancels.delete(cancel);
      resolveDelay(true);
    }, ms);

    this._pendingDelayCancels.add(cancel);
    return { promise, cancel };
  }

  private _cancelPendingDelays() {
    for (const cancel of Array.from(this._pendingDelayCancels)) {
      cancel();
    }
  }

  private _requireSessionId(sessionId?: string): string {
    const effectiveSessionId = sessionId ?? this.sessionId;
    if (!effectiveSessionId) {
      throw makeError('session_not_ready', 'Session is not ready');
    }
    return effectiveSessionId;
  }

  private _requireRuntimeHttpBaseUrl(): string {
    if (!this._runtimeHttpBaseUrl) {
      throw makeError('file_api_unavailable', 'Runtime file API is unavailable');
    }
    return this._runtimeHttpBaseUrl;
  }

  private _requireCpApiUrl(): string {
    if (!this._cpApiUrl) {
      throw makeError('file_api_unavailable', 'Control Plane file API is unavailable');
    }
    return this._cpApiUrl;
  }

  private _resolveRuntimeUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${this._requireRuntimeHttpBaseUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }

  private async _requestJson(url: string, method = 'GET'): Promise<Record<string, unknown>> {
    const res = await this._request(url, method);
    const body = await res.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw makeError('file_operation_failed', 'File API returned a non-object response');
    }
    return body as Record<string, unknown>;
  }

  private async _request(url: string, method: string) {
    if (!this._accessToken) throw makeError('auth_invalid', 'Not connected');
    const res = await this._platform.fetchFn(url, {
      method,
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
    if (!res.ok) {
      throw mapFileResponseError(res.status);
    }
    return res;
  }
}

const CANCELLED = Symbol('cancelled');

function deriveRuntimeHttpBaseUrl(wsUrl: string | null): string | null {
  if (!wsUrl) return null;
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : parsed.protocol === 'ws:' ? 'http:' : parsed.protocol;
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function deriveRuntimeHttpBaseUrlFromHttpUrl(httpUrl: string): string | null {
  if (!/^https?:\/\//i.test(httpUrl)) return null;
  const parsed = new URL(httpUrl);
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeOptionalBaseUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  return url.replace(/\/$/, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function withQueryParams(url: string, params: Record<string, string | number | boolean>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}

function mapFileResponseError(status: number): Error {
  if (status === 401) return makeError('auth_invalid', 'File API authentication failed');
  if (status === 403) return makeError('file_access_denied', 'File access denied');
  if (status === 404) return makeError('file_not_found', 'File not found');
  if (status === 410) return makeError('file_expired', 'File expired');
  return makeError('file_operation_failed', `File operation failed with status ${status}`);
}
