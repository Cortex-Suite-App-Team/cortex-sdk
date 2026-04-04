export declare const DEFAULT_AUTH_URL = "https://auth.cortexsuite.app";
export declare const AUTH_TOKEN_PATH = "/auth/token";
export declare const AUTH_REFRESH_PATH = "/auth/refresh";
export declare const WS_SUBPROTOCOL = "cortex-sdk.v1";
export declare const WS_SUBPROTOCOL_JWT_PREFIX = "cortex-sdk.jwt.";
export declare const SCHEMA_VERSION = "1.0";
export declare const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
export declare const DEFAULT_SEND_TIMEOUT_MS = 10000;
export declare const DEFAULT_RESYNC_TIMEOUT_MS = 15000;
export declare const DEFAULT_PING_INTERVAL_MS = 15000;
export declare const DEFAULT_PONG_TIMEOUT_MS = 5000;
export declare const DEFAULT_STALE_THRESHOLD_MS = 45000;
export declare const TOKEN_REFRESH_BUFFER_MS = 60000;
/** @deprecated Use DEFAULT_AUTH_URL + AUTH_TOKEN_PATH instead. Scheduled for removal. */
export declare const CORTEX_AUTH_URL = "https://auth.cortexsuite.app/auth/token";
/** @deprecated Use DEFAULT_AUTH_URL + AUTH_REFRESH_PATH instead. Scheduled for removal. */
export declare const CORTEX_REFRESH_URL = "https://auth.cortexsuite.app/auth/refresh";
/** @deprecated Use WS_SUBPROTOCOL instead. Scheduled for removal. */
export declare const WS_SUBPROTOCOL_BASE = "cortex-sdk.v1";
export declare const RECONNECT_BACKOFF_MS: readonly [1000, 2000, 5000, 10000, 20000, 30000];
//# sourceMappingURL=constants.d.ts.map