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
    sendChatMessage(content: string, attachments: string[] | undefined): Promise<void>;
    handleIncoming(data: string): void;
    get sessionId(): string | null;
    get sessionState(): SessionState;
    get lastSeq(): number;
    setTransport(transport: Transport, sendTimeoutMs: number): void;
}
export declare function createSession(callbacks: SessionCallbacks): SessionController;
//# sourceMappingURL=session.d.ts.map