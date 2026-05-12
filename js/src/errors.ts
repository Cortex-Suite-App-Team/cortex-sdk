import { GENERATED_ERROR_CATALOG } from './generated/errors.js';

export class CortexError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly fatal: boolean;

  constructor(code: string, message: string, retryable: boolean, fatal: boolean) {
    super(message);
    this.name = 'CortexError';
    this.code = code;
    this.retryable = retryable;
    this.fatal = fatal;
  }
}

interface ErrorEntry {
  code: string;
  retryable: boolean;
  fatal: boolean;
}

const CATALOG_MAP = new Map<string, ErrorEntry>(GENERATED_ERROR_CATALOG.map(e => [e.code, e]));

export function makeError(code: string, message: string): CortexError {
  const entry = CATALOG_MAP.get(code) ?? { code, retryable: false, fatal: false };
  return new CortexError(entry.code, message, entry.retryable, entry.fatal);
}

export function lookupError(code: string): ErrorEntry | undefined {
  return CATALOG_MAP.get(code);
}
