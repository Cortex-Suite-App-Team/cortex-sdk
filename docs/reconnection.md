# Reconnection

The SDK handles reconnection automatically. In most cases, your code does not need to do anything.

---

## How it works

When the WebSocket connection drops unexpectedly, the SDK:

1. Moves `channelState` to `STALE` (if the connection became unresponsive) or directly to `RECONNECTING` (if the connection closed).
2. Waits for the backoff delay.
3. Re-runs the auth exchange (refreshing the token if needed).
4. Opens a new WebSocket connection.
5. Sends a resync request to replay any messages missed during the outage.
6. Returns `channelState` to `OPEN`.

Your `onMessage` callback continues to receive messages throughout. After resync, missed messages arrive in `seq` order.

---

## What triggers reconnection

| Trigger | Description |
|---|---|
| Unexpected WebSocket close | The connection drops without your code calling `disconnect()` |
| Stale channel | No pong received within `staleThreshold` milliseconds/seconds |
| Resync timeout | The resync request after a reconnect times out; the SDK retries |

---

## Reconnect backoff

The SDK waits progressively longer between reconnect attempts to avoid overwhelming the server:

| Attempt | Wait before retry |
|---|---|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 5 seconds |
| 4 | 10 seconds |
| 5 | 20 seconds |
| 6 and beyond | 30 seconds |

The counter resets to attempt 1 after a successful reconnect.

---

## When reconnection stops

The SDK stops reconnecting in two situations:

1. **`disconnect()` is called** — you deliberately closed the session.
2. **Auth refresh fails terminally** — the refresh token is invalid or expired. `channelState` moves to `AUTH_FAILED` and a `system::error` with `fatal: true` is delivered to your callback.

In case 2, your code must act. See [Fatal auth failure recovery](#fatal-auth-failure-recovery) below.

---

## Message resync

After reconnecting, the SDK sends a resync request with the last received sequence number. The runtime replays any messages that arrived during the outage. These replayed messages are delivered to your `onMessage` callback in `seq` order, exactly as if they had arrived in real time.

You do not need to implement any replay logic. The SDK handles it entirely.

---

## What your code should do

For most applications: **nothing**. The reconnect is invisible to the user and to your application logic.

Optionally, you can watch `channelState` to show a "reconnecting" indicator in your UI:

```js
// JavaScript (Browser and Node.js)
import { CortexClient } from "@cortex/sdk";

const client = new CortexClient({
  apiKey: "your-api-key",
  onMessage: (msg) => {
    updateConnectionIndicator(client.channelState);
    handleMessage(msg);
  },
});

await client.connect();
```

```python
# Python
import asyncio
from cortex_sdk import CortexClient

client_ref = None

def on_message(msg):
    update_connection_indicator(client_ref.channel_state)
    handle_message(msg)

async def main():
    global client_ref
    client_ref = CortexClient(api_key="your-api-key", on_message=on_message)
    await client_ref.connect()

asyncio.run(main())
```

---

## Waiting for channel recovery before sending

Do not call `sendMessage()` while `channelState` is `RECONNECTING` — it will fail with `transport_send_timeout`. If you need to send after a reconnect, wait for the channel to return to `OPEN`:

```js
// JavaScript (Browser and Node.js)
async function waitForOpen(client, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (client.channelState !== "OPEN") {
    if (Date.now() > deadline) throw new Error("Channel did not reopen in time");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// Usage
await waitForOpen(client);
await client.sendMessage({ content: "Hello after reconnect" });
```

```python
# Python
import asyncio

async def wait_for_open(client, timeout=30.0):
    import time
    deadline = time.monotonic() + timeout
    while client.channel_state != "OPEN":
        if time.monotonic() > deadline:
            raise TimeoutError("Channel did not reopen in time")
        await asyncio.sleep(0.2)

# Usage
await wait_for_open(client)
await client.send_message(content="Hello after reconnect")
```

---

## Fatal auth failure recovery

When `channelState` becomes `AUTH_FAILED`, the current session is unrecoverable. You must create a new `CortexClient` and call `connect()` again. This typically means re-prompting the user for credentials.

```js
// JavaScript (Browser and Node.js)
import { CortexClient } from "@cortex/sdk";

let client;

function createClient() {
  client = new CortexClient({
    apiKey: getApiKey(),
    onMessage: (msg) => {
      if (msg.type === "system::error" && msg.payload.fatal) {
        console.error("Fatal error:", msg.payload.code);
        // Prompt user to re-authenticate, then:
        createClient();
        client.connect().catch(console.error);
      } else {
        handleMessage(msg);
      }
    },
  });
}

createClient();
await client.connect();
```

```python
# Python
import asyncio
from cortex_sdk import CortexClient

async def create_and_connect(api_key):
    def on_message(msg):
        if msg["type"] == "system::error" and msg["payload"].get("fatal"):
            print("Fatal error:", msg["payload"]["code"])
            # Prompt user to re-authenticate, then schedule reconnect:
            asyncio.get_event_loop().create_task(
                create_and_connect(get_new_api_key())
            )
        else:
            handle_message(msg)

    client = CortexClient(api_key=api_key, on_message=on_message)
    await client.connect()
    return client

async def main():
    client = await create_and_connect("your-api-key")
    await client.send_message(content="Hello")

asyncio.run(main())
```
