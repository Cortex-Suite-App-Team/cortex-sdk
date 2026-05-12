# Core Concepts

Read this page before building beyond the quick start. It explains the mental model behind the SDK so you can predict its behavior and avoid common mistakes.

---

## The SDK is a transport client

The SDK's job is to maintain a connection and move messages between your application and the Cortex runtime. It does not interpret message content, make business logic decisions, or manage application UI state.

The boundary is clear:

- **SDK's responsibility:** authentication, WebSocket lifecycle, session management, reconnection, message delivery.
- **Your responsibility:** deciding what messages to send, and reacting to what the runtime sends back.

---

## One instance = one session

A single `CortexClient` instance owns exactly one runtime session. You cannot reuse an instance to start a second session.

When a session reaches a terminal state (`COMPLETED`, `FAILED`, `STOPPED`, `TIMEOUT`, or `CANCELLED`), that instance is done. To start a new session, create a new `CortexClient` and call `connect()` again.

```js
// JavaScript (Browser and Node.js)
// After a terminal state — create a fresh instance
const client2 = new CortexClient({
  apiKey: "your-api-key",
  onMessage: handleMessage,
});
await client2.connect();
```

```python
# Python
# After a terminal state — create a fresh instance
client2 = CortexClient(
    api_key="your-api-key",
    on_message=handle_message,
)
await client2.connect()
```

> **Note:** Do not call `connect()` a second time on the same instance. The SDK does not support re-connecting a terminated session.

---

## The channel and the session are separate things

The SDK tracks two independent states:

- **Session state** (`sessionState` / `session_state`) — whether the runtime session is alive. Managed by the runtime.
- **Channel state** (`channelState` / `channel_state`) — whether the WebSocket connection is open. Managed by the network.

The channel can drop and reconnect while the session remains `ACTIVE`. This is normal. When the channel reconnects, the SDK resyncs any missed messages and your application continues without interruption.

You only need to care about session state for application logic (e.g., "is there an active session I can send to?"). You only need to care about channel state if you want to show a "reconnecting" indicator to the user.

See [Session & Channel States](session-and-channel-states.md) for the full state reference.

---

## The callback is your only input

Every message from the runtime arrives in the `onMessage` / `on_message` callback you provide at construction time. There is no alternative: no event emitters, no polling methods, no promises that resolve with messages.

```js
// JavaScript (Browser and Node.js)
const client = new CortexClient({
  apiKey: "your-api-key",
  onMessage: (msg) => {
    // This is the only place runtime messages arrive.
    // Route them based on msg.type.
  },
});
```

```python
# Python
def on_message(msg):
    # This is the only place runtime messages arrive.
    # Route them based on msg["type"].
    pass

client = CortexClient(
    api_key="your-api-key",
    on_message=on_message,
)
```

The callback is called synchronously by the SDK's internal receive loop. It must not block. If you need to do async work in response to a message, push the message to a queue and process it from a separate async task. See [Messaging — Async message processing](messaging.md#async-message-processing) for an example.

---

## Async everywhere

All SDK methods that communicate over the network return a `Promise` (JavaScript) or a coroutine (Python). You must `await` them.

In JavaScript, this works naturally in any async function or at the top level of a module.

In Python, all `async` methods must be called from within an `async` function, which must itself be run by an event loop. The standard pattern is:

```python
# Python
import asyncio
from cortex_sdk import CortexClient

async def main():
    client = CortexClient(api_key="...", on_message=lambda msg: None)
    await client.connect()
    await client.send_message(content="Hello")
    await client.disconnect()

asyncio.run(main())
```

The SDK does not provide a synchronous interface. If you need synchronous usage, run `asyncio.run()` at the boundary where your synchronous code calls into the SDK.

---

## What the SDK does automatically

These things happen without any code from you:

| Behavior | Trigger |
|---|---|
| Token refresh | SDK schedules a refresh before the JWT expires |
| WebSocket reconnection | Channel drops unexpectedly or becomes stale |
| Message replay (resync) | After reconnect, the runtime replays any missed messages |
| Heartbeat (ping/pong) | Sent on a fixed interval; stale channel detected if pong is not received |

You do not need to implement any of these. Do not try to manage tokens, reconnect, or poll for heartbeats yourself — the SDK handles them correctly and your interference will cause conflicts.
