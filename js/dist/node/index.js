import { WebSocket } from 'ws';
import { CortexClient } from './client.js';
import { uploadFileNode } from './upload-node.js';
const UPLOAD_URL = '/upload';
// Node 18+ has global fetch; fall back to a minimal shim for older versions
const nodeFetch = (url, init) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return globalThis.fetch(url, init);
};
// Node-compatible FormData (global in Node 18+)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NodeFormData = globalThis.FormData;
function makePlatform() {
    return {
        WS: WebSocket,
        fetchFn: nodeFetch,
        FormDataClass: NodeFormData,
        uploadUrl: UPLOAD_URL,
    };
}
export class CortexNodeClient extends CortexClient {
    constructor(options) {
        super(options, makePlatform());
    }
    /** Node-specific override: accepts browser-safe inputs plus file paths and Readable streams */
    async uploadFile(file, options = {}) {
        if (!this['_accessToken']) {
            const { makeError } = await import('./errors.js');
            throw makeError('auth_invalid', 'Not connected');
        }
        const sessionId = options.sessionId ?? this.sessionId;
        if (!sessionId) {
            const { makeError } = await import('./errors.js');
            throw makeError('session_not_ready', 'Session is not ready');
        }
        const runtimeBaseUrl = this['_requireRuntimeHttpBaseUrl']();
        const uploadUrl = new URL(UPLOAD_URL, `${runtimeBaseUrl}/`);
        uploadUrl.searchParams.set('session_id', sessionId);
        return uploadFileNode(file, this['_accessToken'], uploadUrl.toString(), nodeFetch);
    }
    async uploadAttachment(file) {
        return this.uploadFile(file);
    }
}
// Re-export as CortexClient for uniform import
export { CortexNodeClient as CortexClient };
export { CortexError } from './errors.js';
//# sourceMappingURL=index.js.map