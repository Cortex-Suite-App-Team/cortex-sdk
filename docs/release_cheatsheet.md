# Release Cheatsheet

This page is the shortest path for publishing SDK changes from the private source repo to the public distribution repo.

## Scripts

- `scripts/sync_public_repo.ps1`
  Copies the public docs, `LICENSE`, JS package files, and Python release artifacts from this repo into `D:\GitHub\Cortex\public\cortex-sdk`.

- `scripts/release.ps1`
  Runs the release flow from the source repo: version bump, build, test, sync to public repo, public commit, tag, and optional push.

## Quick Commands

Run only public repo sync:

```powershell
cd D:\GitHub\Cortex\cortex-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\sync_public_repo.ps1
```

Run a full release locally for `1.0.4`:

```powershell
cd D:\GitHub\Cortex\cortex-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Version 1.0.4
```

Run a full release and push it:

```powershell
cd D:\GitHub\Cortex\cortex-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Version 1.0.4 -Push
```

Dry-run the release flow without commit and tag:

```powershell
cd D:\GitHub\Cortex\cortex-sdk
powershell -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Version 1.0.4 -NoCommit -NoTag
```

## What `release.ps1` Updates

- `LICENSE`
- `js/package.json`
- `js/package-lock.json`
- `python/pyproject.toml`
- `docs/public/index.md`
- `python/dist/*`
- public repo contents in `D:\GitHub\Cortex\public\cortex-sdk`

## Useful Flags

- `-Version 1.0.4`
  Sets the release version before build and sync.
- For the Python package, the published install name is `cortex-suite-sdk`, while the import remains `from cortex_sdk import ...`.
- For npm trusted publishing, the publishable `js/package.json` in `public\cortex-sdk` must keep `repository.url` aligned with that public repo `origin`.

- `-Push`
  Pushes the current branch and the created tag from the public repo to `origin`.

- `-NoCommit`
  Skips `git commit` in the public repo.

- `-NoTag`
  Skips tag creation in the public repo.

- `-SkipTests`
  Skips JS and Python test execution, but still runs build and sync.

## Expected Flow

1. Update version in source repo.
2. Run JS install, tests, build, and smoke checks.
3. Run Python editable install, tests, and clean package build.
4. Sync only the publishable files into `D:\GitHub\Cortex\public\cortex-sdk`.
5. Commit and tag in the public repo.
6. Push the public repo branch and tag.
7. GitHub Actions in the public repo publishes both `PyPI` and `npm` on tag `vX.Y.Z`.

## Common Notes

- Run the script file itself. Do not paste the script body into an interactive PowerShell session.
- `release.ps1` cleans `python/dist` before the final package build so old wheel and sdist files do not leak into the public repo.
- `sync_public_repo.ps1` now copies only Python artifacts matching the current JS version.
- If you use `-Push`, make sure the public repo remote and credentials are already configured.
