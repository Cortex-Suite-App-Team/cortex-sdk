import { Readable } from 'stream';
import type { UploadInput } from '../src/upload.js';
import type { FetchFn } from '../src/types.js';
export declare function uploadFileNode(file: UploadInput | Readable, accessToken: string, uploadUrl: string, fetchFn: FetchFn): Promise<string>;
//# sourceMappingURL=upload-node.d.ts.map