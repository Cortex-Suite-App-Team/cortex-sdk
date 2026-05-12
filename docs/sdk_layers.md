# Cortex SDK Layering Architecture

**Status:** Draft 1.0  
**Scope:** `@cortex-suite/sdk`, `@cortex-suite/sdk-ui`, `@cortex-suite/chat-widget`, Control Plane operator surfaces  
**Primary rule:** transport, chat behavior, ready-made UI and operator operations must remain separate layers.

---

## 1. Purpose

Cortex can be embedded in very different host environments.

At one extreme, a developer may build a custom interface inside an application, game engine, internal tool or non-standard frontend. In this case the developer needs a stable transport SDK, not a ready-made chat UI.

At the other extreme, a website owner may want to add a working chat surface with minimal effort: load a script, point it to a DOM element or enable a floating launcher, and get a usable Digital Worker interface.

This document defines the package boundaries that support both extremes without turning the core SDK into a mixed transport/UI framework.

The architecture is:

```text
@cortex-suite/sdk
  transport client only

@cortex-suite/sdk-ui
  headless chat and escalation behavior layer

@cortex-suite/chat-widget
  ready-made embeddable web chat widget

Control Plane Escalations
  internal operator cockpit built on the same message model, with operator-only actions
```

Short version:

```text
Transport is infrastructure.
Chat core is behavior.
Widget is convenience.
Escalations is operations.
```

---

## 2. Layer Overview

### 2.1 `@cortex-suite/sdk`

`@cortex-suite/sdk` is the core transport SDK.

It owns:

- authentication against Runtime / SessionManager;
- WebSocket connection lifecycle;
- token refresh;
- reconnect and resync;
- liveness / ping-pong;
- session identity and session state;
- transport envelope construction;
- message sending and receiving;
- file upload/download primitives where supported by the runtime contract;
- typed methods for canonical transport messages.

It must not own:

- DOM rendering;
- CSS;
- chat bubbles;
- floating launchers;
- Bootstrap, React, Vue, Svelte or any UI framework dependency;
- product-specific operator screens;
- tenant administration or user banning logic.

The package must remain usable in browser and Node.js contexts.

Expected usage:

```ts
import { CortexClient } from '@cortex-suite/sdk/browser';

const client = new CortexClient({
  apiKey: '...',
  onMessage: (message) => {
    // Host application decides how to render or process messages.
  },
});

await client.connect();
await client.sendMessage({ content: 'Hello' });
```

---

### 2.2 `@cortex-suite/sdk-ui`

`@cortex-suite/sdk-ui` is a headless behavior layer built on top of the transport SDK.

It owns chat and escalation behavior, but does not own final rendering.

It owns:

- transcript store;
- normalized message view models;
- `chat::partial` aggregation;
- input lock policy;
- session status view model;
- reconnect / stale / error display state;
- attachment display model;
- escalation display model;
- helper controllers for ordinary chat actions;
- helper controllers for escalation replies.

It must not own:

- final DOM layout;
- mandatory visual theme;
- product-specific Control Plane permissions;
- operator audit persistence;
- banhammer/security policy;
- tenant/user administration.

Expected usage:

```ts
import { CortexClient } from '@cortex-suite/sdk/browser';
import { createChatController } from '@cortex-suite/sdk-ui';

const client = new CortexClient({
  apiKey: '...',
  onMessage: () => {},
});

const chat = createChatController({
  client,
  onStateChange: (state) => {
    // Host application renders state using its own UI framework or plain DOM.
  },
});

await chat.connect();
await chat.sendMessage('Hello');
```

This package is the shared behavior layer for both the public chat widget and richer internal/operator surfaces.

---

### 2.3 `@cortex-suite/chat-widget`

`@cortex-suite/chat-widget` is the ready-made embeddable web chat package.

It is intended for website and web application owners who want a working Cortex chat surface with minimal integration work.

It owns:

- DOM mounting;
- floating launcher mode;
- embedded mode;
- bundled CSS;
- default visual theme;
- Shadow DOM isolation where appropriate;
- public configuration surface;
- loader script for CDN usage;
- user-facing chat UX based on `@cortex-suite/sdk` and `@cortex-suite/sdk-ui`.

It must not own:

- core transport logic duplicated from `@cortex-suite/sdk`;
- transcript behavior duplicated from `@cortex-suite/sdk-ui`;
- Control Plane operator-only actions;
- administrative operations such as user banning.

Expected embedded usage:

```html
<div id="cortex-chat"></div>

<script type="module">
  import { mountCortexChat } from 'https://cdn.cortexsuite.app/chat-widget/v1/index.js';

  mountCortexChat('#cortex-chat', {
    apiKey: '...',
    mode: 'embedded'
  });
</script>
```

Expected floating usage:

```html
<script
  src="https://cdn.cortexsuite.app/chat-widget/v1/loader.js"
  data-api-key="..."
  data-mode="floating">
</script>
```

The widget is a convenience layer, not the source of protocol truth.

---

### 2.4 Control Plane Escalations

Control Plane Escalations is an internal operator cockpit, not a public website widget.

It owns:

- tenant-scoped escalation backlog;
- filtering by project, status and time;
- session/escalation detail panel;
- transcript display for the selected session;
- operator actions;
- claim/assignment flow;
- audit trail;
- permission checks;
- dangerous actions such as user ban or session stop.

It may reuse:

- transport message types from `@cortex-suite/sdk`;
- normalized chat/escalation behavior concepts from `@cortex-suite/sdk-ui`;
- transcript view model ideas;
- input lock and partial aggregation logic where applicable.

It must not use the public `@cortex-suite/chat-widget` as-is for the operator surface.

Reason: the operator cockpit is not just a chat. It is an operations tool with escalation status, audit, assignment, role checks, and dangerous actions.

Correct relationship:

```text
Control Plane Escalations
  uses the same message model and may reuse sdk-ui behavior
  renders its own operator workspace
  calls Control Plane operator APIs
```

The operator browser should not receive public Runtime API keys or act as an ordinary end-user widget. Operator actions should normally pass through Control Plane APIs that enforce tenant, role and audit policy.

---

## 3. Dependency Direction

Allowed dependency direction:

```text
@cortex-suite/chat-widget
  depends on @cortex-suite/sdk-ui
  depends on @cortex-suite/sdk

@cortex-suite/sdk-ui
  depends on @cortex-suite/sdk types and public client surface

@cortex-suite/sdk
  depends on no Cortex UI package
```

Control Plane may import or mirror selected headless concepts from `@cortex-suite/sdk-ui`, but it must keep operator security and audit logic server-side.

Forbidden dependency direction:

```text
@cortex-suite/sdk -> @cortex-suite/sdk-ui
@cortex-suite/sdk -> @cortex-suite/chat-widget
@cortex-suite/sdk-ui -> @cortex-suite/chat-widget
```

The core SDK must never import DOM, CSS or widget code.

---

## 4. Package Responsibilities

| Responsibility | sdk | sdk-ui | chat-widget | Control Plane Escalations |
|---|---:|---:|---:|---:|
| Auth/token exchange | Yes | No | Via sdk | No direct public flow |
| WebSocket transport | Yes | No | Via sdk | Usually via CP/operator API |
| Reconnect/resync | Yes | Consumes state | Via sdk | CP/runtime dependent |
| Transport message sending | Yes | Builds intent/helpers | Via sdk-ui/sdk | Via CP operator API |
| Transcript model | No | Yes | Via sdk-ui | Yes/reuse concepts |
| Partial aggregation | No | Yes | Via sdk-ui | Yes/reuse concepts |
| Input lock policy | No | Yes | Via sdk-ui | Yes, operator-specific |
| DOM rendering | No | No | Yes | Yes, internal templates/components |
| CSS/theme | No | No | Yes | Control Plane styles |
| Escalation reply helper | Yes, transport method | Yes, controller helper | Maybe user-facing only | Yes, operator action |
| User ban | No | No | No | Yes |
| Audit | No | No | No | Yes |

---

## 5. Escalation Semantics Across Layers

Runtime transport defines `escalation::request` and `escalation::reply`.

An escalation request means the Digital Worker has paused execution and needs an operator or external participant.

A reply can carry one of the canonical actions:

```text
continue
operator_input
reply_user
```

Meaning:

- `continue` means the operator allows execution to continue without additional decision content.
- `operator_input` means the operator returns a decision or structured input to the Digital Worker.
- `reply_user` means the operator sends a message to the end user without automatically resuming the Digital Worker.

Layer ownership:

- `@cortex-suite/sdk` sends a valid `escalation::reply` envelope.
- `@cortex-suite/sdk-ui` helps a UI map operator/user intent into a valid reply payload.
- `@cortex-suite/chat-widget` may display user-facing escalation states if needed, but must not expose operator-only controls.
- Control Plane Escalations owns operator decisions, validation, assignment, audit and dangerous actions.

Minimum SDK transport method:

```ts
await client.replyEscalation({
  escalationId: 'esc_123',
  waitToken: 'wait_abc',
  action: 'operator_input',
  content: { resolution: 'approved' },
  meta: { operator_id: 'op_1' }
});
```

The core SDK should validate the basic payload shape, but authoritative permission and state validation belongs to Runtime/SessionManager and, for operator surfaces, Control Plane APIs.

---

## 6. Public Widget Design Rules

The public chat widget is for fast adoption.

It should support at least two modes:

```text
embedded
floating
```

The widget should:

- mount into a provided DOM element or create a floating launcher;
- isolate styles, preferably with Shadow DOM;
- ship bundled CSS;
- expose simple theme tokens;
- avoid requiring the host page to use Bootstrap, Tailwind, React or any other framework;
- avoid iframe in the first implementation unless a later security or isolation requirement makes iframe necessary.

Example configuration:

```ts
mountCortexChat('#chat', {
  apiKey: '...',
  mode: 'embedded',
  theme: {
    accentColor: '#5b6cff',
    title: 'Ask Cortex',
    launcherLabel: 'Need help?'
  }
});
```

The loader script should optimize for low-friction integration. The npm package should optimize for developers who want bundler control.

---

## 7. Control Plane Escalations Design Rules

Control Plane Escalations is not a simple chat widget.

It should be implemented as a split-view operator workspace:

```text
left:  escalation backlog table
right: transcript + escalation detail + operator actions
```

The backlog should include:

- status;
- age / SLA indicator;
- tenant-scoped project / Digital Worker;
- session id;
- escalation id;
- reason;
- last message / summary;
- allowed actions;
- assigned operator if supported;
- created and updated timestamps.

The detail panel should include:

- session transcript;
- highlighted escalation request;
- reason and content;
- allowed actions;
- operator composer;
- action buttons for `reply_user`, `operator_input`, `continue`;
- dangerous actions separated from normal reply actions.

Dangerous actions include:

- ban user;
- stop session;
- cancel escalation.

These actions must not be part of the public chat widget.

---

## 8. Implementation Order

Recommended order:

1. Keep `@cortex-suite/sdk` as transport-only.
2. Add core SDK support for `escalation::reply`.
3. Build Control Plane Escalations MVP using server-side permissions and APIs.
4. Extract stable chat/escalation behavior into `@cortex-suite/sdk-ui`.
5. Build `@cortex-suite/chat-widget` on top of `sdk` and `sdk-ui`.
6. Add CDN loader for low-friction website integration.

Reason: the operator cockpit will expose real behavior requirements earlier than a generic widget. Extracting `sdk-ui` after the first operational surface reduces speculative abstractions.

---

## 9. Repository Placement

Canonical architecture documentation lives in:

```text
cortex-sdk/docs/sdk_layers.md
```

Reason: `cortex-sdk` defines the lowest public contract and package layering rules.

The other public repositories should link to this document from their README files:

```text
cortex-sdk-ui/README.md
cortex-chat-widget/README.md
```

They may include short local summaries, but should not maintain competing architecture documents.

---

## 10. Non-Goals

This document does not define:

- exact CSS design of the public widget;
- final Control Plane Escalations UI layout;
- billing model for widget usage;
- legal licensing policy;
- full Runtime/SessionManager implementation;
- full transcript persistence strategy;
- exact CDN deployment pipeline.

Those belong to separate implementation documents.

---

## 11. Design Principles

1. Keep the transport SDK boring and reliable.

   The core SDK should be easy to test, easy to run in different environments and free from UI assumptions.

2. Put shared chat behavior in a headless layer.

   Transcript logic, partial aggregation and input locking are product behavior, not CSS.

3. Make the widget easy for beginners.

   A website owner should be able to add a Digital Worker chat without building a frontend project first.

4. Keep operator tools separate from public widgets.

   Operator surfaces require permissions, audit and dangerous actions. They must not be treated as ordinary customer chat UI.

5. Do not duplicate protocol logic.

   The widget and Control Plane should use the same transport message semantics and, where practical, the same headless chat behavior.

6. Avoid speculative UI framework coupling.

   Public packages should not force React, Vue, Bootstrap or Tailwind on host applications.

---

## 12. Working Summary

The public SDK family is intentionally layered:

```text
@cortex-suite/sdk
  speaks to Runtime

@cortex-suite/sdk-ui
  understands chat behavior

@cortex-suite/chat-widget
  gives users a ready-made interface
```

Control Plane Escalations is a separate operator cockpit. It should reuse the same message model and stable headless behavior where useful, but it must keep operator permissions, audit and dangerous actions under Control Plane ownership.
