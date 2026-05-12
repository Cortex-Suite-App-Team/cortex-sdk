# Session and Channel States

The SDK tracks two independent state dimensions. Understanding both helps you write correct lifecycle logic and debug unexpected behavior.

---

## Two independent dimensions

| Property | What it tracks | Who controls it |
|---|---|---|
| `sessionState` / `session_state` | Whether the runtime session is alive | The Cortex runtime |
| `channelState` / `channel_state` | Whether the WebSocket connection is open | The network and SDK |

These are **independent**. The channel can drop and reconnect (moving through `STALE → RECONNECTING → OPEN`) while the session remains `ACTIVE`. Do not confuse a channel disruption with a session failure.

---

## Session states

| State | Meaning | Terminal? |
|---|---|---|
| `CREATED` | Instance constructed; `connect()` not yet called | No |
| `INITIALIZING` | `connect()` called; waiting for runtime to initialize | No |
| `ACTIVE` | Session is live; `sendMessage()` is safe to call | No |
| `WAITING` | Runtime is processing; response in progress | No |
| `COMPLETED` | Session ended normally by the runtime | **Yes** |
| `FAILED` | Session ended due to an error | **Yes** |
| `STOPPED` | Session stopped via `stop()` or `disconnect()` | **Yes** |
| `TIMEOUT` | Session ended because it exceeded a time limit | **Yes** |
| `CANCELLED` | Session was cancelled externally | **Yes** |

### Normal lifecycle

```
CREATED → INITIALIZING → ACTIVE ⇄ WAITING → COMPLETED
```

A typical session cycles between `ACTIVE` (ready) and `WAITING` (processing) as messages are sent and responses are generated. When the runtime finishes naturally, the session moves to `COMPLETED`.

### Failure path

Any state can transition to `FAILED`, `TIMEOUT`, or `CANCELLED` if the runtime encounters an unrecoverable condition.

### Stop path

Calling `stop()` from your application moves the session to `STOPPED`.

---

## Terminal session states

Once the session reaches a terminal state (`COMPLETED`, `FAILED`, `STOPPED`, `TIMEOUT`, `CANCELLED`), the current `CortexClient` instance cannot be reused.

> **Note:** After a terminal session state, create a new `CortexClient` instance and call `connect()` again to start a fresh session.

```js
// JavaScript (Browser and Node.js)
// After detecting a terminal state:
const newClient = new CortexClient({
  apiKey: "your-api-key",
  onMessage: handleMessage,
});
await newClient.connect();
```

```python
# Python
# After detecting a terminal state:
new_client = CortexClient(
    api_key="your-api-key",
    on_message=handle_message,
)
await new_client.connect()
```

---

## Channel states

| State | Meaning |
|---|---|
| `CLOSED` | No WebSocket connection; initial state before `connect()` |
| `CONNECTING` | WebSocket handshake in progress |
| `OPEN` | WebSocket is connected and healthy |
| `STALE` | No pong received within `staleThreshold`; reconnect starting |
| `RECONNECTING` | Waiting for next reconnect attempt (backoff in progress) |
| `AUTH_FAILED` | Auth refresh failed terminally; no further reconnects |

### Normal lifecycle

```
CLOSED → CONNECTING → OPEN
```

### Disruption lifecycle

```
OPEN → STALE → RECONNECTING → CONNECTING → OPEN (if recovered)
```

`AUTH_FAILED` is a permanent terminal state for the channel. It happens when token refresh fails and cannot recover. The session is also unrecoverable at this point.

---

## Relationship between the two

The channel and session evolve independently. Here is what each combination means in practice:

| Channel state | Session state | What it means |
|---|---|---|
| `OPEN` | `ACTIVE` | Normal operation. Send messages freely. |
| `RECONNECTING` | `ACTIVE` | Channel dropped but session is alive. SDK is reconnecting. Do not send — wait for channel to return to `OPEN`. |
| `OPEN` | `WAITING` | Message sent; runtime is generating a response. |
| `AUTH_FAILED` | `FAILED` | Terminal. Create a new `CortexClient`. |
| any | `COMPLETED` / `STOPPED` | Session is over. Create a new `CortexClient` if needed. |

The most important rule: **a channel disruption does not mean the session is lost**. Do not create a new client just because `channelState` moved to `RECONNECTING`. Wait for the SDK to reconnect.

---

## Reading both states

```js
// JavaScript (Browser and Node.js)
console.log(client.sessionState);  // e.g. "ACTIVE"
console.log(client.channelState);  // e.g. "OPEN"
console.log(client.sessionId);     // e.g. "sess_abc123"
```

```python
# Python
print(client.session_state)   # e.g. "ACTIVE"
print(client.channel_state)   # e.g. "OPEN"
print(client.session_id)      # e.g. "sess_abc123"
```

All three properties are read-only. They reflect the current state at the moment of access.
