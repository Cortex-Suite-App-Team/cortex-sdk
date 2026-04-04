# Connecting and Disconnecting

---

## Connecting

Call `connect()` to start a session. It performs the full bootstrap sequence and returns when the session is ready.

```js
// JavaScript (Browser and Node.js)
import { CortexClient } from "@cortex/sdk";

const client = new CortexClient({
  apiKey: "your-api-key",
  onMessage: handleMessage,
});

await client.connect(); // session is ACTIVE when this resolves
```

```python
# Python
import asyncio
from cortex_sdk import CortexClient

async def main():
    client = CortexClient(
        api_key="your-api-key",
        on_message=handle_message,
    )
    await client.connect()  # session is ACTIVE when this completes

asyncio.run(main())
```

### What connect() does internally

1. Sends your API key to the auth service and receives a JWT access token and a WebSocket URL.
2. Opens a WebSocket connection to that URL.
3. Waits for the runtime to initialize the session (session state moves from `INITIALIZING` to `ACTIVE`).
4. Starts the liveness monitor (heartbeat ping/pong).

### What connect() throws

`connect()` throws a `CortexError` only on **fatal** auth failures:

| Error code | Meaning |
|---|---|
| `auth_invalid` | API key was rejected |
| `auth_refresh_failed` | Token refresh failed unrecoverably |

Non-fatal errors (network failures, connection timeouts) are retried automatically. `connect()` does not throw for transient network issues — it keeps trying according to the reconnect backoff schedule.

```js
// JavaScript (Browser and Node.js)
import { CortexClient } from "@cortex/sdk";

const client = new CortexClient({ apiKey: "your-api-key", onMessage: handleMessage });

try {
  await client.connect();
} catch (err) {
  if (err.code === "auth_invalid") {
    // API key is wrong — prompt user to check their key
  } else if (err.code === "auth_refresh_failed") {
    // Tokens are invalid — re-authenticate
  }
}
```

```python
# Python
from cortex_sdk import CortexClient, CortexError

client = CortexClient(api_key="your-api-key", on_message=handle_message)

try:
    await client.connect()
except CortexError as e:
    if e.code == "auth_invalid":
        pass  # API key is wrong — prompt user to check their key
    elif e.code == "auth_refresh_failed":
        pass  # Tokens are invalid — re-authenticate
```

---

## Disconnecting

Call `disconnect()` to close the session cleanly. This stops the liveness monitor, cancels any pending reconnect, closes the WebSocket, and marks the session as ended.

```js
// JavaScript (Browser and Node.js)
await client.disconnect();
```

```python
# Python
await client.disconnect()
```

`disconnect()` is a deliberate action from your application. It is different from the session reaching a terminal state naturally (e.g., `COMPLETED`, `FAILED`). After `disconnect()`, the session state becomes `STOPPED`.

Always call `disconnect()` when you are done with a session, rather than simply abandoning the instance. This ensures resources are released on both the client and the runtime.

---

## Reading state

Three read-only properties let you inspect the current state of the client.

### `sessionState` / `session_state`

The current session state. See [Session & Channel States](session-and-channel-states.md) for all possible values.

```js
// JavaScript (Browser and Node.js)
console.log(client.sessionState); // e.g. "ACTIVE"
```

```python
# Python
print(client.session_state)  # e.g. "ACTIVE"
```

### `channelState` / `channel_state`

The current WebSocket channel state.

```js
// JavaScript (Browser and Node.js)
console.log(client.channelState); // e.g. "OPEN"
```

```python
# Python
print(client.channel_state)  # e.g. "OPEN"
```

### `sessionId` / `session_id`

The session ID assigned by the runtime. This is `null` / `None` before `connect()` completes.

```js
// JavaScript (Browser and Node.js)
console.log(client.sessionId); // e.g. "sess_abc123" or null
```

```python
# Python
print(client.session_id)  # e.g. "sess_abc123" or None
```

---

## Checking state before sending

You can read `sessionState` to guard a `sendMessage()` call:

```js
// JavaScript (Browser and Node.js)
if (client.sessionState === "ACTIVE") {
  await client.sendMessage({ content: "Hello" });
} else {
  console.warn("Session is not active:", client.sessionState);
}
```

```python
# Python
if client.session_state == "ACTIVE":
    await client.send_message(content="Hello")
else:
    print("Session is not active:", client.session_state)
```

---

## The reconnect window

If the WebSocket drops, `channelState` moves to `RECONNECTING`. During this time:

- The session is still alive (`sessionState` remains `ACTIVE`).
- Calls to `sendMessage()` will fail with `transport_send_timeout` if the channel does not recover within `sendTimeout`.
- You do not need to create a new client — the SDK reconnects automatically.

Wait for `channelState` to return to `"OPEN"` before retrying a failed send. See [Reconnection](reconnection.md) for the full reconnection behavior and a waiting pattern example.
