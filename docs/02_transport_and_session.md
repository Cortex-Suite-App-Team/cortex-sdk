# Transport and Session

## Transport

The only transport is WebSocket.

There is no HTTP polling fallback. There is no SSE mode.
If the WebSocket cannot be established and maintained, the SDK reconnects automatically.

## Session Lifecycle

A session is a logical execution context on the runtime side.
The SDK owns one active session at a time per client instance.

### Session states

| State | Meaning |
|---|---|
| `CREATED` | session accepted by the runtime, identity allocated |
| `INITIALIZING` | runtime is preparing the execution context |
| `ACTIVE` | session is running and accepting messages |
| `WAITING` | session is paused, waiting for input |
| `COMPLETED` | session finished successfully |
| `FAILED` | session ended with an error |
| `STOPPED` | session was stopped by the client |
| `TIMEOUT` | session ended due to inactivity timeout |
| `CANCELLED` | session was cancelled |

Terminal states: `COMPLETED`, `FAILED`, `STOPPED`, `TIMEOUT`, `CANCELLED`.
Once a session reaches a terminal state it does not recover.

### Channel states

The channel is the WebSocket connection itself. It is separate from the session.

| State | Meaning |
|---|---|
| `CONNECTING` | opening the connection |
| `OPEN` | connection is healthy |
| `STALE` | heartbeat responses have stopped |
| `RECONNECTING` | reconnect loop is active |
| `CLOSED` | connection was closed cleanly |
| `AUTH_FAILED` | terminal auth failure, reconnect is not attempted |

A session can survive a channel disruption. When the channel reconnects and resyncs,
the session resumes from where it was. Your application code does not need to manage this.

## Connect and Disconnect

```js
// JavaScript / Node.js
await client.connect();
await client.disconnect();
```

```python
# Python
await client.connect()
await client.disconnect()
```

`connect()` runs the full bootstrap sequence:
1. exchanges the API key for tokens and the runtime WS URL
2. opens the WebSocket connection
3. initializes the session
4. starts liveness monitoring

`disconnect()` closes the session and the channel cleanly.

## Liveness / Heartbeat

The SDK sends a `ping` to the runtime on a fixed interval and expects a `pong` back.
This is fully automatic. Your code does not send or receive pings.

### Defaults

| Parameter | Value |
|---|---|
| Ping interval | 15 seconds |
| Pong timeout | 5 seconds |
| Stale threshold | 45 seconds since the last successful pong |

If the stale threshold is exceeded the channel transitions to `STALE` and then `RECONNECTING`.

## Reconnect

Reconnect is automatic and built into the SDK.

### When reconnect triggers

- channel closes unexpectedly
- channel becomes stale (heartbeat lost)
- resync after reconnect times out

### When reconnect stops

- auth refresh fails terminally (`auth_failed`)
- the server returns a permanent auth rejection
- `disconnect()` was called explicitly by your code

### Backoff progression

Reconnect attempts follow an increasing backoff:

```
1s → 2s → 5s → 10s → 20s → 30s → 30s → ...
```

After a successful reconnect the SDK resyncs the session state automatically.

## Resync

After reconnect the SDK sends a resync request for the active session.
The runtime replays any state your client needs to resume correctly.
Your application code does not call resync manually.

## Timeouts

| Timeout | Default | What happens |
|---|---|---|
| Connect timeout | 10s | channel moves to `RECONNECTING` |
| Send timeout | 10s | send fails with a transport error |
| Resync timeout | 15s | resync fails, reconnect loop restarts |
| Pong timeout | 5s | channel marked stale |

These defaults can be overridden at construction time. The state-transition semantics
are the same across all bindings regardless of configured values.

## Channel and Session State Inspection

```js
// JavaScript / Node.js
const sessionState = client.sessionState;   // e.g. 'ACTIVE'
const channelState = client.channelState;   // e.g. 'OPEN'
```

```python
# Python
session_state = client.session_state   # e.g. 'ACTIVE'
channel_state = client.channel_state   # e.g. 'OPEN'
```
