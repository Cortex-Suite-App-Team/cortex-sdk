# Versioning

## Scheme

The SDK follows semantic versioning: `MAJOR.MINOR.PATCH`

All three bindings (JS browser, Node.js, Python) are versioned together and always target
the same protocol version.

## What Triggers a Version Change

### Major version

- a breaking change to the public API (method renamed, removed, or signature changed incompatibly)
- a breaking wire protocol change
- a message type removed or redefined incompatibly

### Minor version

- a new method added
- a new option added (with a default, so existing code is unaffected)
- a new message type your callback may receive
- a new error code
- new file input types supported in `uploadAttachment`

### Patch version

- bug fixes that do not change behavior visible to your code
- documentation corrections
- internal implementation changes

## Compatibility Guarantee

Within the same major version, all minor and patch releases are backward compatible.
Code written for `1.0.0` works unchanged on `1.5.2`.

Across major versions, no compatibility is implied. Migration notes are published with each
major release.

## Protocol Schema Field

Every message envelope carries a `schema` field:

```json
{ "schema": "1.0" }
```

This identifies the wire protocol version. Major SDK version changes correspond to major
schema version changes. You do not need to inspect this field in normal usage — the SDK
validates it internally.

## Binding Synchronization

All three bindings publish the same version number simultaneously.
There is no "Python is one version behind TypeScript" situation.

If a binding lags, that is a bug, not a policy.

## Deprecation Policy

Deprecated methods or options are announced in the minor release that introduces the replacement.
They are removed in the next major release, not sooner.
Deprecated items are marked in the documentation and emit a runtime warning in the SDK
when used.
