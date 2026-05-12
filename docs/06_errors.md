# Error Model

## How Errors Reach Your Code

Errors arrive in two ways.

**Via the `onMessage` callback** — runtime-originated errors that arrive as `system::error` messages
over the WebSocket. These are non-fatal unless the payload says otherwise.

**Via thrown exceptions / raised errors** — SDK-level errors thrown directly from method calls
such as `connect()`, `sendMessage()`, or `uploadAttachment()`.

---

## Error Object Shape

All SDK errors carry the same fields:

```js
// JavaScript / Node.js
{
  code: "auth_expired",       // canonical error code string
  message: "...",             // human-readable description
  retryable: true,            // whether the SDK will retry automatically
  fatal: false                // whether the session is unrecoverable
}
```

```python
# Python
CortexError(
    code="auth_expired",
    message="...",
    retryable=True,
    fatal=False
)
```

---

## Canonical Error Codes

### Auth errors

| Code | Retryable | Fatal | Meaning |
|---|---|---|---|
| `auth_invalid` | no | yes | API key was rejected |
| `auth_expired` | yes | no | access token expired; SDK refreshes automatically |
| `auth_refresh_failed` | no | yes | refresh token expired or invalid; re-init required |

### Transport errors

| Code | Retryable | Fatal | Meaning |
|---|---|---|---|
| `transport_connect_timeout` | yes | no | connection attempt timed out |
| `transport_send_timeout` | yes | no | message send timed out |
| `transport_protocol_violation` | no | yes | malformed transport behavior detected |

### Session errors

| Code | Retryable | Fatal | Meaning |
|---|---|---|---|
| `unknown_session` | no | yes | session ID not recognized by the runtime |
| `session_terminal` | no | yes | message sent to a session that has already ended |

### Resync errors

| Code | Retryable | Fatal | Meaning |
|---|---|---|---|
| `resync_timeout` | yes | no | resync attempt timed out; reconnect will retry |
| `replay_unavailable` | yes | no | runtime replay artifacts unavailable |

### Upload errors

| Code | Retryable | Fatal | Meaning |
|---|---|---|---|
| `upload_failed` | yes | no | file upload failed due to a transient error |
| `upload_too_large` | no | no | file exceeds the allowed size limit |
| `upload_type_rejected` | no | no | file type not accepted by the runtime |

---

## Fatal vs Non-Fatal

**Fatal errors** mean the session cannot recover. The SDK stops reconnecting.
Your code must create a new `CortexClient` instance and call `connect()` again.

**Non-fatal errors** are handled automatically by the SDK through retry and reconnect.
You may observe them in the `onMessage` callback as `system::error` messages,
but you do not need to act on them unless your application wants to show status to the user.

---

## Handling Errors in Your Code

```js
// JavaScript / Node.js
const client = new CortexClient({
  apiKey: "...",
  onMessage: (msg) => {
    if (msg.type === "system::error") {
      console.error("Runtime error:", msg.payload.code, msg.payload.message);
      if (msg.payload.fatal) {
        // handle unrecoverable session
      }
    }
  }
});

try {
  await client.connect();
} catch (err) {
  // err.code is a canonical error code string
  if (err.code === "auth_invalid" || err.code === "auth_refresh_failed") {
    // prompt user to re-authenticate
  }
}
```

```python
# Python
from cortex_sdk import CortexClient, CortexError

def on_message(msg):
    if msg["type"] == "system::error":
        print("Runtime error:", msg["payload"]["code"])
        if msg["payload"].get("fatal"):
            pass  # handle unrecoverable session

client = CortexClient(
    api_key="...",
    on_message=on_message
)

try:
    await client.connect()
except CortexError as e:
    if e.code in ("auth_invalid", "auth_refresh_failed"):
        pass  # prompt re-authentication
```
