import type { Transport } from './transport.js';
import type { CortexMessage, RuntimeBootstrap, SessionState } from './types.js';
export interface SessionCallbacks {
    onMessage(msg: CortexMessage): void;
    onFatalError(err: Error): void;
}
export interface SessionController {
    sendInit(bootstrap: RuntimeBootstrap): Promise<void>;
    sendResync(): Promise<void>;
    sendStop(): Promise<void>;
    sendChatMessage(content: unknown, attachments: unknown[] | undefined): Promise<void>;
    sendSystemTrigger(content: unknown, attachments: unknown[] | undefined): Promise<void>;
    handleIncoming(data: string): void;
    get sessionId(): string | null;
    get sessionState(): SessionState;
    get lastSeq(): number;
    setTenantId(tenantId: string | null | undefined): void;
    setTransport(transport: Transport, sendTimeoutMs: number): void;
}
export declare function createSession(callbacks: SessionCallbacks): SessionController;
//# sourceMappingURL=session.d.ts.map