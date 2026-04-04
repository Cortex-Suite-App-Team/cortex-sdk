import { CortexClient } from './client.js';
const UPLOAD_URL = '/upload';
function makePlatform() {
    return {
        WS: WebSocket,
        fetchFn: (url, init) => fetch(url, init),
        FormDataClass: FormData,
        uploadUrl: UPLOAD_URL,
    };
}
export class CortexBrowserClient extends CortexClient {
    constructor(options) {
        super(options, makePlatform());
    }
}
// Re-export as CortexClient for uniform import
export { CortexBrowserClient as CortexClient };
export { CortexError } from './errors.js';
//# sourceMappingURL=index.js.map