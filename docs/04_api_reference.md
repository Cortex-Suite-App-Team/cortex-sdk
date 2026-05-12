# API Reference

## Class: CortexClient

This is the only public class in the SDK.
One instance = one session.

---

## Constructor

```js
// JavaScript / Node.js
const client = new CortexClient(options);
```

```python
# Python
client = CortexClient(**options)
```

### Options

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `apiKey` / `api_key` | string | yes | — | your Cortex API key |
| `authUrl` / `auth_url` | string | no | `https://auth.cortexsuite.app` | base auth endpoint URL used for API key exchange and token refresh |
| `onMessage` / `on_message` | function | yes | — | callback for all incoming messages |
| `connectTimeout` / `connect_timeout` | integer (ms / s) | no | 10000 / 10 | connect timeout |
| `sendTimeout` / `send_timeout` | integer (ms / s) | no | 10000 / 10 | send timeout |
| `resyncTimeout` / `resync_timeout` | integer (ms / s) | no | 15000 / 15 | resync timeout |
| `pingInterval` / `ping_interval` | integer (ms / s) | no | 15000 / 15 | heartbeat interval |
| `pongTimeout` / `pong_timeout` | integer (ms / s) | no | 5000 / 5 | pong wait timeout |
| `staleThreshold` / `stale_threshold` | integer (ms / s) | no | 45000 / 45 | stale channel threshold |

JavaScript and Node.js use milliseconds for time options.
Python uses seconds (integers or floats).
If `authUrl` / `auth_url` is omitted, the SDK falls back to the default auth base URL from `shared/constants.json`.

---

## Methods

### `connect()`

Opens the session. Runs the full bootstrap: auth exchange, WebSocket connection,
session initialization, liveness start.

```js
// JavaScript / Node.js
await client.connect();
```

```python
# Python
await client.connect()
```

Returns when the session is `ACTIVE`. Throws / raises on terminal auth failure.

---

### `disconnect()`

Closes the session and the WebSocket connection cleanly.

```js
// JavaScript / Node.js
await client.disconnect();
```

```python
# Python
await client.disconnect()
```

---

### `onMessage(handler)` (JavaScript / Node.js only)

Registers an additional inbound message handler without replacing the constructor callback.

```js
const unsubscribe = client.onMessage((message) => {
  console.log(message.type, message.payload);
});
```

Behavior:

- constructor `onMessage` remains required
- constructor `onMessage` runs first for every inbound message
- subscribed handlers run after that in insertion order
- subscribed handler failures are isolated so later handlers still run
- the return value unsubscribes that one handler

This method is additive transport-level subscription plumbing. It does not change the core callback contract.

---

### `sendMessage(options)` / `send_message(**options)`

Sends a chat message to the runtime.

```js
// JavaScript / Node.js
await client.sendMessage({
  content: "Your message text",
  attachments: []          // optional, array of attachment_id strings
});
```

```python
# Python
await client.send_message(
    content="Your message text",
    attachments=[]          # optional, list of attachment_id strings
)
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | yes | message text |
| `attachments` | string[] / list[str] | no | list of attachment IDs from `uploadAttachment` |

---

### `uploadAttachment(file)` / `upload_attachment(file)`

Uploads a file and returns an `attachment_id` for use in `sendMessage`.

```js
// JavaScript / Node.js — browser
const id = await client.uploadAttachment(fileObject);     // File or Blob

// JavaScript / Node.js — server
const id = await client.uploadAttachment(buffer);         // Buffer or path string
```

```python
# Python
attachment_id = await client.upload_attachment("/path/to/file.pdf")
# or
attachment_id = await client.upload_attachment(file_bytes)
```

Returns a string `attachment_id`. Throws / raises on upload failure.

---

### `stop()`

Sends a stop signal to the runtime. Session transitions to `STOPPED`.

```js
// JavaScript / Node.js
await client.stop();
```

```python
# Python
await client.stop()
```

---

## Properties

### `sessionState` / `session_state`

Current session state string.

```js
// JavaScript / Node.js
client.sessionState  // e.g. 'ACTIVE'
```

```python
# Python
client.session_state  # e.g. 'ACTIVE'
```

Possible values: `CREATED`, `INITIALIZING`, `ACTIVE`, `WAITING`,
`COMPLETED`, `FAILED`, `STOPPED`, `TIMEOUT`, `CANCELLED`

---

### `channelState` / `channel_state`

Current WebSocket channel state string.

```js
// JavaScript / Node.js
client.channelState  // e.g. 'OPEN'
```

```python
# Python
client.channel_state  # e.g. 'OPEN'
```

Possible values: `CONNECTING`, `OPEN`, `STALE`, `RECONNECTING`, `CLOSED`, `AUTH_FAILED`

---

### `sessionId` / `session_id`

The current session ID assigned by the runtime. `null` / `None` before `connect()` completes.

```js
client.sessionId
```

```python
client.session_id
```

---

## Callback: `onMessage` / `on_message`

Called once for every message received from the runtime.

```js
// JavaScript / Node.js
function onMessage(message) {
  // message.type   — string
  // message.payload — object
  // message.seq    — integer
  // message.ts     — string (ISO-8601)
  // message.session_id — string
}
```

```python
# Python
def on_message(message: dict):
    # message["type"]
    # message["payload"]
    # message["seq"]
    # message["ts"]
    # message["session_id"]
```

The callback is synchronous from the SDK's perspective.
If you need async processing, queue the messages from inside the callback.

For JavaScript and Node.js, additional listeners may also be attached with `client.onMessage(handler)`. Those listeners run after the constructor callback.
