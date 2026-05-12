# sdk/shared

Shared SDK artifacts: the single source of truth for all language bindings.

## Purpose

This directory contains declarative artifacts that must be identical across all three
bindings (JS browser, Node.js, Python). Bindings read these files — they do not
redefine them. If code diverges from these artifacts, the code is updated, not the artifacts.

## Structure

| Path | Contents |
|---|---|
| `constants.json` | Default auth base URL, auth endpoint paths, WS subprotocol constants, default timeouts, reconnect backoff |
| `errors.json` | Canonical error catalog: 13 codes with class, retryable, and fatal fields |
| `schema/` | JSON Schema draft-07 files for the transport envelope and all message payloads |
| `transcripts/` | Reference message sequences for conformance testing |

Generated binding constants may temporarily expose deprecated compatibility aliases
such as `CORTEX_AUTH_URL`, `CORTEX_REFRESH_URL`, and `WS_SUBPROTOCOL_BASE`.
Those aliases are transitional only. Treat the keys in `shared/constants.json` as canonical.

## Schema Usage Rule

Every binding must validate outbound and inbound messages against the schemas in
`schema/`. Validation failures are hard errors — do not silently discard them.
The `envelope.json` schema validates the outer frame; the payload schemas validate
the `payload` object for each specific `type`.

## Transcript Usage Rule

Transcripts are golden test fixtures. The conformance harness replays them through
a mock server and verifies that each binding produces and accepts the expected
message sequences. Steps with only a `"note"` key (no `"direction"`) are out-of-band
events (HTTP calls, channel drops) and are not wire messages.

## Change Policy

Shared artifacts are frozen once Phase 0 is signed off. Any change requires an
explicit decision and must be reflected simultaneously in all bindings.
See `DISCREPANCIES.md` for known open items awaiting owner resolution.
