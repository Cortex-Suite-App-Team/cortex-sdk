import { type UploadInput } from './upload.js';
import type { CortexClientOptions, SessionState, ChannelState, WebSocketCtor, FetchFn, FormDataCtor } from './types.js';
export interface CortexClientPlatform {
    WS: WebSocketCtor;
    fetchFn: FetchFn;
    FormDataClass: FormDataCtor;
    uploadUrl: string;
}
export declare class CortexClient {
    private readonly _options;
    private readonly _platform;
    private _channelState;
    private _accessToken;
    private _refreshToken;
    private _wsUrl;
    private _channelId;
    private _reconnectAttempt;
    private _disconnectRequested;
    private readonly _transport;
    private readonly _session;
    private _liveness;
    private _tokenRefreshTimer;
    private readonly _pendingDelayCancels;
    private _reconnectLoopPromise;
    constructor(options: CortexClientOptions, platform: CortexClientPlatform);
    get sessionState(): SessionState;
    get channelState(): ChannelState;
    get sessionId(): string | null;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendMessage(options: {
        content: string;
        attachments?: string[];
    }): Promise<void>;
    uploadAttachment(file: UploadInput): Promise<string>;
    stop(): Promise<void>;
    private _openChannel;
    private _handleStale;
    private _handleClose;
    private _reconnectLoop;
    private _maybeRefreshToken;
    private _scheduleTokenRefresh;
    private _stopTokenRefreshTimer;
    private _stopBackgroundActivity;
    private _shouldStopReconnect;
    private _createCancelableDelay;
    private _cancelPendingDelays;
}
//# sourceMappingURL=client.d.ts.map