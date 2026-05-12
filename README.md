# Cortex SDK

Transport client for [Cortex](https://cortexsuite.app/) — real-time chat and session management over WebSocket.

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

```js
import { CortexClient } from "@cortex-suite/sdk";

const client = new CortexClient({
  apiKey: "your-api-key",
  onMessage: (msg) => {
    console.log(msg.type, msg.payload);
  },
});

await client.connect();
await client.sendMessage({ content: "Hello, Cortex!" });
await client.disconnect();
```

```python
import asyncio
from cortex_sdk import CortexClient

def on_message(msg):
    print(msg["type"], msg["payload"])

async def main():
    client = CortexClient(
        api_key="your-api-key",
        on_message=on_message,
    )
    await client.connect()
    await client.send_message(content="Hello, Cortex!")
    await client.disconnect()

asyncio.run(main())
```

## Documentation

Full documentation is in [`docs/public/`](docs/public/).

## License

MIT
