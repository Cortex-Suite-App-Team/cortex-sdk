# Cortex SDK

Public distribution repository for the Cortex SDK transport client.

This repo is meant to stay small and public-facing. It contains:

- public developer docs in `docs/`
- an npm-ready JavaScript / Node.js package in `js/`
- PyPI-ready Python artifacts in `python/dist/`
- a PyPI publish workflow in `.github/workflows/publish.yml`

This repo intentionally does not contain the private source tree, internal tests, or planning materials.

## Install

```bash
npm install @cortex-suite/sdk
```

```bash
pip install cortex-suite-sdk
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
- `.github/workflows/publish.yml` trusted-publishing workflow for PyPI; npm publishing is manual

