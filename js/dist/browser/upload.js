import { makeError } from './errors.js';
export async function uploadFile(file, accessToken, uploadUrl, fetchFn, FormDataClass) {
    const formData = new FormDataClass();
    // Normalize to Blob-like for append
    let blob;
    if (typeof file === 'string') {
        // file path — only valid in Node.js entry; browser entry shouldn't hit this
        throw new Error('File path upload is not supported in browser entry — use Blob or ArrayBuffer');
    }
    else if (file instanceof ArrayBuffer) {
        blob = new Blob([file]);
    }
    else if (ArrayBuffer.isView(file)) {
        blob = new Blob([file.buffer]);
    }
    else {
        blob = file;
    }
    formData.append('file', blob, 'upload');
    const res = await fetchFn(uploadUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            // Content-Type is set automatically with boundary when using FormData
        },
        body: formData, // fetchFn accepts FormData via unknown cast
    });
    if (!res.ok) {
        if (res.status === 413) {
            throw makeError('upload_too_large', 'File exceeds the allowed size limit');
        }
        if (res.status === 415) {
            throw makeError('upload_type_rejected', 'File type not accepted by the runtime');
        }
        throw makeError('upload_failed', `Upload failed with status ${res.status}`);
    }
    const body = await res.json();
    const fileId = body['file_id'] ?? body['attachment_id'];
    if (typeof fileId !== 'string') {
        throw makeError('upload_failed', 'Upload response did not include file_id');
    }
    return fileId;
}
//# sourceMappingURL=upload.js.map