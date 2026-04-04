# Cortex SDK

Public distribution repository for the Cortex SDK transport client.

This repo is meant to stay small and public-facing. It contains:

- public developer docs in `docs/`
- an npm-ready JavaScript / Node.js package in `js/`
- PyPI-ready Python artifacts in `python/dist/`
- a publish workflow in `.github/workflows/publish.yml`

This repo intentionally does not contain the private source tree, internal tests, or planning materials.

## Install

```bash
npm install @cortex/sdk
```

```bash
pip install cortex-sdk
```

## Documentation

Start here:

- [Developer Manual](docs/index.md)
- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Connecting](docs/connecting.md)
- [API Reference](docs/api-reference.md)

## Repository Layout

- `docs/` public SDK documentation
- `js/` publishable npm package contents
- `python/dist/` wheel and sdist ready for PyPI
- `.github/workflows/publish.yml` trusted-publishing workflow for npm and PyPI

## Release Model

This repository is expected to be updated from the private source repo after a release candidate has already been validated there.

Typical flow:

1. Build and test in the private source repo.
2. Sync public docs and release artifacts into this repo.
3. Tag the public repo with `vX.Y.Z`.
4. Run the publish workflow from this repo.

See [REPO_SETUP.md](REPO_SETUP.md) for the one-time setup checklist.
