import { GENERATED_ERROR_CATALOG } from './generated/errors.js';
export class CortexError extends Error {
    constructor(code, message, retryable, fatal) {
        super(message);
        this.name = 'CortexError';
        this.code = code;
        this.retryable = retryable;
        this.fatal = fatal;
    }
}
const CATALOG_MAP = new Map(GENERATED_ERROR_CATALOG.map(e => [e.code, e]));
export function makeError(code, message) {
    const entry = CATALOG_MAP.get(code) ?? { code, retryable: false, fatal: false };
    return new CortexError(entry.code, message, entry.retryable, entry.fatal);
}
export function lookupError(code) {
    return CATALOG_MAP.get(code);
}
//# sourceMappingURL=errors.js.map