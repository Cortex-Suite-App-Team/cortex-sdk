import { Readable } from 'stream';
import { CortexClient } from '../src/client.js';
import type { UploadInput } from '../src/upload.js';
import type { CortexClientOptions } from '../src/types.js';
export declare class CortexNodeClient extends CortexClient {
    constructor(options: CortexClientOptions);
    /** Node-specific override: accepts browser-safe inputs plus file paths and Readable streams */
    uploadAttachment(file: UploadInput | Readable): Promise<string>;
}
export { CortexNodeClient as CortexClient };
export type { CortexClientOptions, CortexMessage, SessionState, ChannelState, SendMessageOptions } from '../src/types.js';
export { CortexError } from '../src/errors.js';
//# sourceMappingURL=index.d.ts.map