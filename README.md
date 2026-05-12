# Cortex SDK

Transport client for [Cortex](https://getcortex.ai) — real-time chat and session management over WebSocket.

Available for JavaScript/TypeScript (browser and Node.js) and Python.

## Installation

### JavaScript / TypeScript

```bash
npm install @cortex-suite/sdk
```

### Python

```bash
pip install cortex-suite-sdk
```

## Quick start

```ts
import { CortexClient } from "@cortex-suite/sdk";

const client = new CortexClient({
  endpoint: "wss://your-cortex-instance/ws",
  token: "YOUR_TOKEN",
});

await client.connect();

client.on("message", (msg) => {
  console.log(msg.text);
});

await client.send("Hello");
```

```python
from cortex_sdk import CortexClient

client = CortexClient(
    endpoint="wss://your-cortex-instance/ws",
    token="YOUR_TOKEN",
)

async with client:
    async for message in client.stream("Hello"):
        print(message.text)
```

## Documentation

Full documentation is in [`docs/`](docs/public/).

## License

MIT
