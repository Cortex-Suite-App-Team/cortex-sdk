export interface CortexClientOptions {
    apiKey: string;
    /**
     * Base URL of the Cortex auth service — origin only, no path component.
     * The SDK appends `/auth/token` and `/auth/refresh` automatically.
     * @example "https://auth.cortexsuite.app"
     * @default "https://auth.cortexsuite.app"
     */
    authUrl?: string;
    onMessage: (message: CortexMessage) => void;
    connectTimeout?: number;
    sendTimeout?: number;
    resyncTimeout?: number;
    pingInterval?: number;
    pongTimeout?: number;
    staleThreshold?: number;
}
export interface CortexMessage {
    type: string;
    schema: string;
    session_id: string;
    seq?: number;
    payload: Record<string, unknown>;
    meta?: Record<string, unknown>;
    ts: string;
}
export type SessionState = 'CREATED' | 'INITIALIZING' | 'ACTIVE' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'TIMEOUT' | 'CANCELLED';
export type ChannelState = 'CONNECTING' | 'OPEN' | 'STALE' | 'RECONNECTING' | 'CLOSED' | 'AUTH_FAILED';
export interface AuthTokenResponse {
    ws_url: string;
    access_token: string;
    refresh_token: string;
    runtime_bootstrap: RuntimeBootstrap;
}
export interface RuntimeBootstrap {
    execution_mode: string;
    bundle_url: string;
    checksum: string;
    artifact_id?: string;
    artifact_kind?: string;
    run_mode?: string;
    trigger_payload?: Record<string, unknown>;
}
export interface SendMessageOptions {
    content: unknown;
    attachments?: unknown[];
}
/** Platform-specific WebSocket constructor passed in by each entry point. */
export type WebSocketCtor = new (url: string, protocols: string[]) => WebSocketLike;
export interface WebSocketLike {
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    onopen: ((event: unknown) => void) | null;
    onclose: ((event: {
        code: number;
        reason: string | Buffer;
    }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onmessage: ((event: {
        data: string;
    }) => void) | null;
}
/** Platform-specific fetch function passed in by each entry point. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export interface RequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData | Uint8Array;
}
export interface Response {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}
/** FormData-like interface (browser FormData or node-compatible). */
export interface FormDataLike {
    append(name: string, value: Blob | string, filename?: string): void;
}
export type FormDataCtor = new () => FormDataLike;
//# sourceMappingURL=types.d.ts.map