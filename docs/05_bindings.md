# Language Bindings

## Parity Rule

All three bindings implement one identical SDK contract.

The public API — every method, every option, every state value, every error code — is the same
across JavaScript (browser), Node.js, and Python.

The only allowed differences:

- naming convention: `camelCase` in JS/Node vs `snake_case` in Python
- time units: milliseconds in JS/Node vs seconds in Python
- file input types: platform-native types per language (see `03_messaging.md`)
- packaging and build tooling

No method exists in one binding and not in another.
No option has different semantics in different bindings.
`authUrl` / `auth_url` follows the same rule: same behavior, language-specific naming only.

---

## JavaScript (Browser)

### Install

```bash
npm install @cortex-suite/sdk
```

### Import

```js
import { CortexClient } from "@cortex-suite/sdk";
```

Optional explicit entrypoint:

```js
import { CortexClient } from "@cortex-suite/sdk/browser";
```

### Notes

- uses the browser's native `WebSocket` API
- uses the Fetch API for auth and file upload
- compatible with all modern browsers
- no Node.js-specific APIs are used in this bundle
- the package ships as ESM only

### Example

```js
import { CortexClient } from "@cortex-suite/sdk";

const client = new CortexClient({
  apiKey: "your-api-key",
  // authUrl: "https://auth.cortexsuite.app", // optional override
  onMessage: (msg) => {
    console.log(msg.type, msg.payload);
  }
});

await client.connect();
await client.sendMessage({ content: "Hello" });
```

---

## Node.js

### Install

```bash
npm install @cortex-suite/sdk
```

### Import

```js
import { CortexClient } from "@cortex-suite/sdk";
// or pin the Node entrypoint explicitly:
import { CortexClient } from "@cortex-suite/sdk/node";
```

### Notes

- uses the `ws` package for WebSocket (bundled, no peer dependency needed)
- uses the native `fetch` and `FormData` globals from Node.js 18+
- file upload accepts `Buffer`, `Uint8Array`, file path strings, and Node readable streams
- the package ships as ESM only

### Example

```js
import { CortexClient } from "@cortex-suite/sdk";

const client = new CortexClient({
  apiKey: "your-api-key",
  // authUrl: "https://auth.cortexsuite.app", // optional override
  onMessage: (msg) => {
    if (msg.type === "chat::answer") {
      console.log(msg.payload.content);
    }
  }
});

await client.connect();

const attachmentId = await client.uploadAttachment("./report.pdf");
await client.sendMessage({
  content: "Summarize this.",
  attachments: [attachmentId]
});
```

---

## Python

### Install

```bash
pip install cortex-suite-sdk
```

### Import

```python
from cortex_sdk import CortexClient
```

### Notes

- requires Python 3.10+
- uses `websockets` for WebSocket (listed as a dependency)
- uses `httpx` for auth and file upload (listed as a dependency)
- all async methods use standard `asyncio`; `await` everything
- time options (`connect_timeout`, `ping_interval`, etc.) are in **seconds**, not milliseconds
- file upload accepts file path strings, `bytes`, and file-like objects
- all payload fields are typed via `TypedDict` and available for static analysis

### Example

```python
import asyncio
from cortex_sdk import CortexClient

def on_message(msg):
    if msg["type"] == "chat::answer":
        print(msg["payload"]["content"])

async def main():
    client = CortexClient(
        api_key="your-api-key",
        # auth_url="https://auth.cortexsuite.app",  # optional override
        on_message=on_message
    )

    await client.connect()

    attachment_id = await client.upload_attachment("./report.pdf")
    await client.send_message(
        content="Summarize this.",
        attachments=[attachment_id]
    )

asyncio.run(main())
```

---

## Naming Convention Mapping

| Concept | JS / Node.js | Python |
|---|---|---|
| Constructor option: API key | `apiKey` | `api_key` |
| Constructor option: auth base URL | `authUrl` | `auth_url` |
| Constructor option: callback | `onMessage` | `on_message` |
| Constructor option: connect timeout | `connectTimeout` | `connect_timeout` |
| Constructor option: send timeout | `sendTimeout` | `send_timeout` |
| Constructor option: ping interval | `pingInterval` | `ping_interval` |
| Method: send message | `sendMessage()` | `send_message()` |
| Method: upload file | `uploadAttachment()` | `upload_attachment()` |
| Property: session state | `sessionState` | `session_state` |
| Property: channel state | `channelState` | `channel_state` |
| Property: session ID | `sessionId` | `session_id` |
