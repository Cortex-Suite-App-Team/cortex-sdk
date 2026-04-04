export type {
  ChannelState,
  CortexClientOptions,
  CortexMessage,
  SendMessageOptions,
  SessionState,
} from "../node/index.js";
export { CortexError } from "../node/index.js";

export declare class CortexClient {
  constructor(options: import("../node/index.js").CortexClientOptions);
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(options: import("../node/index.js").SendMessageOptions): Promise<void>;
  uploadAttachment(file: File | Blob | ArrayBuffer | Uint8Array | string): Promise<string>;
  stop(): Promise<void>;
  readonly sessionState: import("../node/index.js").SessionState;
  readonly channelState: import("../node/index.js").ChannelState;
  readonly sessionId: string | null;
}
