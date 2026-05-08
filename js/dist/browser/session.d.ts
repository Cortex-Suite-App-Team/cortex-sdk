import type { Transport } from './transport.js';
import type { CortexMessage, EscalationReplyAction, EscalationReplyContent, RuntimeBootstrap, SessionState } from './types.js';
export interface SessionCallbacks {
    onMessage(msg: CortexMessage): void;
    onFatalError(err: Error): void;
}
export interface SessionController {
    sendInit(bootstrap: RuntimeBootstrap): Promise<void>;
    sendResync(): Promise<void>;
    sendStop(): Promise<void>;
    sendChatMessage(content: unknown, attachments: unknown[] | undefined, meta?: Record<string, unknown>): Promise<void>;
    sendEscalationReply(escalationId: string, waitToken: string, action: EscalationReplyAction, content: EscalationReplyContent | undefined, meta: Record<string, unknown> | undefined): Promise<void>;
    sendSystemTrigger(content: unknown, attachments: unknown[] | undefined): Promise<void>;
    sendTrigger(payload: Record<string, unknown>): Promise<void>;
    handleIncoming(data: string): void;
    get sessionId(): string | null;
    get sessionState(): SessionState;
    get lastSeq(): number;
    setTenantId(tenantId: string | null | undefined): void;
    setTransport(transport: Transport, sendTimeoutMs: number): void;
}
export declare function createSession(callbacks: SessionCallbacks): SessionController;
//# sourceMappingURL=session.d.ts.map