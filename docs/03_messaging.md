# Messaging

## Sending a Message

```js
// JavaScript / Node.js
await client.sendMessage({
  content: "Hello, what can you do?"
});
```

```python
# Python
await client.send_message(
    content="Hello, what can you do?"
)
```

Messages are sent over WebSocket as JSON frames.
The SDK adds the required envelope fields (`session_id`, `seq`, `ts`, etc.) automatically.

## Receiving Messages

You register a required callback at construction time.
Every message from the runtime is delivered to this callback first.

```js
// JavaScript / Node.js
const client = new CortexClient({
  apiKey: "...",
  authUrl: "https://auth.example.com", // optional override
  onMessage: (message) => {
    console.log(message.type, message.payload);
  }
});
```

```python
# Python
def on_message(message):
    print(message["type"], message["payload"])

client = CortexClient(
    api_key="...",
    auth_url="https://auth.example.com",  # optional override
    on_message=on_message
)
```

If `authUrl` / `auth_url` is omitted, the SDK uses its default auth base URL.

### Additional JavaScript / Node.js subscriptions

JavaScript and Node.js clients also expose an additive instance method:

```js
const unsubscribe = client.onMessage((message) => {
  console.log("secondary listener", message.type);
});
```

Rules:

- the constructor `onMessage` callback remains required
- the constructor callback runs first
- subscribed handlers run after that in insertion order
- if one subscribed handler throws, the SDK isolates that failure and continues delivering to later handlers
- `unsubscribe()` removes only that subscribed handler

This additive subscription hook is transport plumbing for advanced consumers such as headless controller layers. It does not replace the constructor callback.

### Message shape

Every incoming message follows the same envelope:

```json
{
  "type": "chat::answer",
  "schema": "1.0",
  "session_id": "sess_abc123",
  "seq": 42,
  "payload": { ... },
  "ts": "2026-04-03T12:00:00Z"
}
```

Your callback receives this object as-is. The `type` field tells you what kind of message it is.
The `payload` field contains the message-specific data.

### Message types you will receive

| Type | When |
|---|---|
| `chat::partial` | streaming chunk of an in-progress answer |
| `chat::answer` | final answer from the runtime |
| `system::warning` | non-fatal warning from the runtime |
| `system::error` | error from the runtime |

Filtering by `type` inside your callback is the standard pattern:

```js
// JavaScript / Node.js
onMessage: (msg) => {
  if (msg.type === "chat::answer") {
    renderAnswer(msg.payload.content);
  } else if (msg.type === "chat::partial") {
    appendChunk(msg.payload.content);
  }
}
```

```python
# Python
def on_message(msg):
    if msg["type"] == "chat::answer":
        render_answer(msg["payload"]["content"])
    elif msg["type"] == "chat::partial":
        append_chunk(msg["payload"]["content"])
```

## File Attachments

File attachments are a two-step process.

### Step 1. Upload the file

Upload the file over HTTP to get an `attachment_id`.

```js
// JavaScript / Node.js
const attachmentId = await client.uploadAttachment(file); // File or Buffer
```

```python
# Python
attachment_id = await client.upload_attachment(file_path)  # path or bytes
```

Internally this sends an HTTP POST with the file as multipart form data to the runtime's
upload endpoint. The SDK handles auth headers automatically.
`authUrl` / `auth_url` does not define the upload endpoint as part of the auth contract.

The returned `attachment_id` is a stable reference you can use in messages.

### Step 2. Send the message with the attachment reference

```js
// JavaScript / Node.js
await client.sendMessage({
  content: "Please analyze this document.",
  attachments: [attachmentId]
});
```

```python
# Python
await client.send_message(
    content="Please analyze this document.",
    attachments=[attachment_id]
)
```

### Supported attachment sources

| Binding | Accepted input |
|---|---|
| JavaScript (browser) | `File`, `Blob`, `ArrayBuffer` |
| Node.js | `Buffer`, file path string, `ReadableStream` |
| Python | file path string, `bytes`, file-like object |

The SDK normalizes these into the correct multipart upload regardless of input type.

## Stopping Execution

```js
// JavaScript / Node.js
await client.stop();
```

```python
# Python
await client.stop()
```

Sends a stop signal to the runtime. The session transitions to `STOPPED`.

## Message Envelope Reference

Full envelope fields:

| Field | Type | Description |
|---|---|---|
| `type` | string | message type identifier |
| `schema` | string | protocol schema version |
| `session_id` | string | session this message belongs to |
| `seq` | integer | server-assigned sequence number |
| `payload` | object | message-specific content |
| `meta` | object | optional metadata |
| `ts` | string | ISO-8601 UTC timestamp |
