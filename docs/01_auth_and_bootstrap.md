# Auth and Bootstrap

## Overview

SDK authentication is a two-step process.

1. Exchange your API key for a runtime endpoint and JWT tokens.
2. Use those values to open and maintain a WebSocket session.

The SDK handles both steps automatically when you call `connect()`.
Your code provides:

- `apiKey` / `api_key` — required
- `authUrl` / `auth_url` — optional auth base URL override

If `authUrl` / `auth_url` is omitted, the SDK uses the default auth base URL from
`shared/constants.json`:

```text
https://auth.cortexsuite.app
```

## Public Auth Configuration

```js
// JavaScript / Node.js
const client = new CortexClient({
  apiKey: "your-api-key",
  authUrl: "https://auth.cortexsuite.app" // optional
});
```

```python
# Python
client = CortexClient(
    api_key="your-api-key",
    auth_url="https://auth.cortexsuite.app"  # optional
)
```

If you omit `authUrl` / `auth_url`, the SDK falls back to the default auth base URL.

## Step 1. API Key Exchange

The SDK sends a single HTTP POST request to the configured auth base URL plus `/auth/token`.

### Request

```http
POST {authUrl}/auth/token
Content-Type: application/json
Authorization: ApiKey {your_api_key}
```

The `Authorization` header is the canonical way to pass the API key.
The key is never sent over WebSocket.

### Response

```json
{
  "ws_url": "wss://runtime.cortexsuite.app/ws/",
  "access_token": "<JWT>",
  "refresh_token": "<JWT>",
  "runtime_bootstrap": {
    "execution_mode": "production",
    "bundle_url": "/api/runtime/releases/42/bundle/",
    "checksum": "sha256:abc123"
  }
}
```

| Field | Description |
|---|---|
| `ws_url` | WebSocket endpoint for the runtime session |
| `access_token` | short-lived JWT for session authentication |
| `refresh_token` | longer-lived JWT for refreshing the access token |
| `runtime_bootstrap` | payload that SDK passes verbatim as `system::init` to the runtime |

The SDK stores all values internally after a successful exchange.
`runtime_bootstrap` is never exposed to your application code. The SDK uses it
internally to bootstrap the session.

## Step 2. Token Refresh

Access tokens are short-lived. The SDK refreshes them automatically before they expire.
Refresh uses the same configured auth base URL.

### Refresh request

```http
POST {authUrl}/auth/refresh
Content-Type: application/json
Authorization: Bearer {refresh_token}
```

### Refresh response

```json
{
  "access_token": "<new JWT>"
}
```

If the refresh token itself has expired or is invalid, the SDK emits an `auth_failed` error
and stops reconnecting. Your application must handle this by re-initializing the SDK with a
valid API key.

## JWT Binding to WebSocket

When opening the WebSocket connection, the SDK binds the access token to the handshake
using the WebSocket subprotocol mechanism.

The client offers two subprotocols:

```text
cortex-sdk.v1
cortex-sdk.jwt.<access_token>
```

The server validates the token-bearing subprotocol and negotiates `cortex-sdk.v1` as the
accepted protocol. This keeps the token out of the URL and out of server logs.

## Full SDK Behavior

After auth exchange succeeds, the SDK automatically:

1. opens the WebSocket at `ws_url`
2. binds `access_token` through the WebSocket subprotocols
3. sends `runtime_bootstrap` as `system::init`
4. refreshes `access_token` through `{authUrl}/auth/refresh`
5. reconnects and resyncs automatically after disconnects

`ws_url` is backend-provided. Your code does not configure or guess it.

## Auth Errors

| Situation | SDK behavior |
|---|---|
| API key rejected | emits `auth_invalid` error, does not retry |
| Access token expired | refreshes automatically using the refresh token |
| Refresh token expired or invalid | emits `auth_failed` error, stops reconnecting |
| Network failure during exchange | retries with backoff |

See `06_errors.md` for the full error catalog.
