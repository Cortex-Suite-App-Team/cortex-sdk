export type {
  ChannelState,
  CortexClientOptions,
  CortexMessage,
  EscalationReplyAction,
  EscalationReplyContent,
  ReplyEscalationOptions,
  SendMessageOptions,
  SessionState,
} from "./dist/node/node/index.js";
export { CortexError } from "./dist/node/node/index.js";

export declare class CortexClient {
  constructor(options: import("./dist/node/node/index.js").CortexClientOptions);
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (message: import("./dist/node/node/index.js").CortexMessage) => void): () => void;
  sendMessage(options: import("./dist/node/node/index.js").SendMessageOptions): Promise<void>;
  replyEscalation(options: import("./dist/node/node/index.js").ReplyEscalationOptions): Promise<void>;
  uploadAttachment(file: File | Blob | ArrayBuffer | Uint8Array | string): Promise<string>;
  stop(): Promise<void>;
  readonly sessionState: import("./dist/node/node/index.js").SessionState;
  readonly channelState: import("./dist/node/node/index.js").ChannelState;
  readonly sessionId: string | null;
}
