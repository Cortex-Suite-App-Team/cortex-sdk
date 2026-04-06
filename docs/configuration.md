# Configuration

All configuration is passed to the `CortexClient` constructor. There is no separate configuration step.

---

## Required options

### `apiKey` / `api_key`

Your Cortex API key. This is exchanged for a short-lived JWT during `connect()`. Required.

```js
// JavaScript (Browser and Node.js)
const client = new CortexClient({
  apiKey: "crtx_live_...",
  onMessage: handleMessage,
});
```

```python
# Python
client = CortexClient(
    api_key="crtx_live_...",
    on_message=handle_message,
)
```

### `onMessage` / `on_message`

A callback function that receives every message from the runtime. Required. See [Messaging](messaging.md) for details on the callback contract and message types.

---

## Authentication endpoint

### `authUrl` / `auth_url`

The base URL of the Cortex auth service. Optional.

**Default:** `https://auth.cortexsuite.app`

You only need to set this if you are working against a non-production environment or a private deployment. Provide the base URL only — do not append a path.

> **Common mistake:** Do not pass a full endpoint such as `https://auth.cortexsuite.app/auth/token`.
> The SDK appends `/auth/token` itself. Passing the full endpoint URL will cause the SDK
> to emit a warning and strip the path automatically, but you should configure the base URL.

```js
// JavaScript (Browser and Node.js)
const client = new CortexClient({
  apiKey: "your-api-key",
  authUrl: "https://auth.staging.example.com", // no trailing path
  onMessage: handleMessage,
});
```

```python
# Python
client = CortexClient(
    api_key="your-api-key",
    auth_url="https://auth.staging.example.com",  # no trailing path
    on_message=handle_message,
)
```

---

## Timeout options

> **Note:** JavaScript and Node.js express timeouts in **milliseconds**. Python expresses them in **seconds**. The same 10-second timeout is `10000` in JS and `10` in Python.

| JS / Node.js option | Python option | Default (JS ms) | Default (Python s) | What happens when it fires |
|---|---|---|---|---|
| `connectTimeout` | `connect_timeout` | `10000` | `10` | `connect()` throws `transport_connect_timeout` |
| `sendTimeout` | `send_timeout` | `10000` | `10` | `sendMessage()` throws `transport_send_timeout` |
| `resyncTimeout` | `resync_timeout` | `15000` | `15` | Resync attempt fails; reconnect retries |
| `pongTimeout` | `pong_timeout` | `5000` | `5` | Channel treated as stale; reconnect starts |
| `staleThreshold` | `stale_threshold` | `45000` | `45` | Channel treated as stale if no pong received within this window |

### `pingInterval` / `ping_interval`

How often the SDK sends a heartbeat ping. Default: `15000` ms / `15` s.

---

## Full constructor example

Showing all options explicitly. In most applications you only need `apiKey` and `onMessage`; the defaults are sensible for production use.

```js
// JavaScript (Browser and Node.js)
import { CortexClient } from "@cortex/sdk";

const client = new CortexClient({
  apiKey: "your-api-key",
  authUrl: "https://auth.cortexsuite.app",  // default; omit if not overriding

  onMessage: (msg) => {
    console.log(msg.type, msg.payload);
  },

  // All times in milliseconds
  connectTimeout: 10000,
  sendTimeout: 10000,
  resyncTimeout: 15000,
  pingInterval: 15000,
  pongTimeout: 5000,
  staleThreshold: 45000,
});
```

```python
# Python
import asyncio
from cortex_sdk import CortexClient

def on_message(msg):
    print(msg["type"], msg["payload"])

async def main():
    client = CortexClient(
        api_key="your-api-key",
        auth_url="https://auth.cortexsuite.app",  # default; omit if not overriding

        on_message=on_message,

        # All times in seconds
        connect_timeout=10,
        send_timeout=10,
        resync_timeout=15,
        ping_interval=15,
        pong_timeout=5,
        stale_threshold=45,
    )

asyncio.run(main())
```

---

## When to change defaults

Leave the defaults in place unless you have a specific, measured reason to change them. The defaults are designed for typical network conditions.

**Increase `connectTimeout`** if your deployment is in a high-latency environment and you see spurious `transport_connect_timeout` errors during `connect()`.

**Increase `sendTimeout`** if you are sending large messages and the send reliably times out before completion.

**Decrease `staleThreshold` and `pongTimeout`** if you need faster detection of dropped connections — but note this increases reconnect frequency on unstable networks.

Do not set `pingInterval` below 5 seconds. The runtime may enforce a minimum server-side.
