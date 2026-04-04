import type { Transport } from './transport.js';
export interface LivenessCallbacks {
    onStale(): void;
    getSessionId(): string | null;
    getChannelId(): string;
}
export interface LivenessController {
    start(): void;
    stop(): void;
    handlePong(heartbeatId: string): void;
}
export declare function createLiveness(transport: Transport, pingIntervalMs: number, pongTimeoutMs: number, staleThresholdMs: number, callbacks: LivenessCallbacks): LivenessController;
//# sourceMappingURL=liveness.d.ts.map