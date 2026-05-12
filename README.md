# Cortex SDK Source Repo

Private source repository for the Cortex SDK transport client.

This repo contains:

- shared source-of-truth artifacts
- JavaScript browser and Node.js bindings
- Python binding
- tests, packaging, and CI support

## Release Helper Docs

- [Release Cheatsheet](docs/release_cheatsheet.md)

## Local CI Commands

Shared validation:

```bash
python scripts/generate_shared_artifacts.py
git diff --exit-code -- js/src/generated python/cortex_sdk/_generated_constants.py python/cortex_sdk/_generated_errors.py
```

JavaScript:

```bash
npm --prefix js ci
npm --prefix js test
npm --prefix js run build
npm --prefix js run smoke
```

Python:

```bash
python -m pip install -e "./python[dev]"
python -m pytest python/tests
python -m build python
python scripts/smoke_python_package.py
```

Актуальный релизный сценарий.

1. Зафиксировать и отправить рабочие изменения в `cortex-sdk`:

```powershell
cd D:\GitHub\Cortex\cortex-sdk
git add .
git commit -m "Update SDK to 1.0.17"
git push origin main
```

2. Запустить релиз из `cortex-sdk`:

```powershell
cd D:\GitHub\Cortex\cortex-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Version 1.0.17
```

Скрипт сам:
- собирает и тестирует SDK;
- синхронизирует `public\cortex-sdk`;
- создаёт commit в `public\cortex-sdk`;
- создаёт tag `v1.0.17` в `public\cortex-sdk`.

3. Отправить public repo и тег:

```powershell
cd D:\GitHub\Cortex\public\cortex-sdk
git push origin main
git push origin v1.0.17
```

4. Дождаться завершения `publish.yml` в `public\cortex-sdk`.

Руками `npm publish` делать не нужно.
