# Cortex SDK — Documentation Bundle

## What Is the SDK

The Cortex SDK is a transport client.
It connects your application to the Cortex runtime over WebSocket and handles everything between
your code and the platform: authentication, session management, liveness monitoring,
reconnection, and message delivery.

Your application talks to the SDK. The SDK talks to the platform. That's the entire model.

## What the SDK Is Not

- It is not a UI library.
- It is not tied to any frontend framework.
- It is not a product shell or an application template.

## Supported Bindings

Three official bindings. Identical API surface across all three.

| Binding | Use case |
|---|---|
| `cortex-sdk` (JavaScript, browser) | web applications running in the browser |
| `cortex-sdk` (Node.js) | server-side apps, automation, integrations |
| `cortex-sdk` (Python) | server-side apps, automation, integrations |

Every method, every event, every behavior is the same across all three.
Documentation examples show all three bindings in parallel — pick the tab for your language.

## Bundle Contents

| File | What it covers |
|---|---|
| `00_index.md` | this file |
| `01_auth_and_bootstrap.md` | API key exchange, JWT tokens, auth flow |
| `02_transport_and_session.md` | WebSocket connection, session lifecycle, ping, reconnect |
| `03_messaging.md` | sending messages, file attachments, receiving via callback |
| `04_api_reference.md` | complete SDK class and method reference |
| `05_bindings.md` | language-specific notes and packaging |
| `06_errors.md` | error model and error codes |
| `07_versioning.md` | versioning and compatibility policy |

## How to Read This Bundle

Start with `01_auth_and_bootstrap.md` if you are implementing the SDK for the first time.

Start with `04_api_reference.md` if you want a quick method reference.

Start with `06_errors.md` if you are debugging connection or auth issues.
