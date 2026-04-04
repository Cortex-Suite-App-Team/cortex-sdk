import type { WebSocketCtor } from './types.js';
export interface Transport {
    open(wsUrl: string, accessToken: string): Promise<void>;
    send(message: unknown, timeoutMs: number): Promise<void>;
    close(code?: number, reason?: string): void;
    onMessage: ((data: string) => void) | null;
    onClose: ((code: number, reason: string) => void) | null;
    onError: ((error: Error) => void) | null;
}
export declare function createTransport(WS: WebSocketCtor, connectTimeoutMs: number): Transport;
//# sourceMappingURL=transport.d.ts.map