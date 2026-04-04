export declare class CortexError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly fatal: boolean;
    constructor(code: string, message: string, retryable: boolean, fatal: boolean);
}
interface ErrorEntry {
    code: string;
    retryable: boolean;
    fatal: boolean;
}
export declare function makeError(code: string, message: string): CortexError;
export declare function lookupError(code: string): ErrorEntry | undefined;
export {};
//# sourceMappingURL=errors.d.ts.map