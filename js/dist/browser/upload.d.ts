import type { FetchFn, FormDataCtor } from './types.js';
export type UploadInput = Blob | ArrayBuffer | string | Uint8Array;
export declare function uploadFile(file: UploadInput, accessToken: string, uploadUrl: string, fetchFn: FetchFn, FormDataClass: FormDataCtor): Promise<string>;
//# sourceMappingURL=upload.d.ts.map