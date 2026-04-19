import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { makeError } from './errors.js';
export async function uploadFileNode(file, accessToken, uploadUrl, fetchFn) {
    // Normalize to Buffer
    let buffer;
    if (typeof file === 'string') {
        // file path
        buffer = await streamToBuffer(createReadStream(file));
    }
    else if (file instanceof Readable) {
        buffer = await streamToBuffer(file);
    }
    else if (file instanceof ArrayBuffer) {
        buffer = Buffer.from(file);
    }
    else if (typeof Blob !== 'undefined' && file instanceof Blob) {
        buffer = Buffer.from(await file.arrayBuffer());
    }
    else if (file instanceof Uint8Array) {
        buffer = Buffer.from(file);
    }
    else if (Buffer.isBuffer(file)) {
        buffer = file;
    }
    else {
        throw makeError('upload_type_rejected', 'Unsupported Node upload input');
    }
    // Use Node's FormData (available in Node 18+)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formData = new globalThis.FormData();
    const blob = new Blob([buffer]);
    formData.append('file', blob, 'upload');
    const res = await fetchFn(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
    });
    if (!res.ok) {
        if (res.status === 413)
            throw makeError('upload_too_large', 'File exceeds the allowed size limit');
        if (res.status === 415)
            throw makeError('upload_type_rejected', 'File type not accepted');
        throw makeError('upload_failed', `Upload failed with status ${res.status}`);
    }
    const body = await res.json();
    const fileId = body['file_id'] ?? body['attachment_id'];
    if (typeof fileId !== 'string') {
        throw makeError('upload_failed', 'Upload response did not include file_id');
    }
    return fileId;
}
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}
//# sourceMappingURL=upload-node.js.map