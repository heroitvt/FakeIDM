# Development and release

| Path | Responsibility |
| --- | --- |
| `engine.mjs` | HTTP, segmentation, validation, retry, rate limit, persistence, assembly |
| `server.mjs` | Loopback API, auth, static assets, lifecycle |
| `platform.mjs` | Data directories and file-manager fallback |
| `http-policy.mjs` | Header validation, credential scope, hostname checks |
| `desktop.cjs` | Windows/Linux Electron main process |
| `Launcher.swift`, `Info.plist` | Native Mac shell |
| `public/` | UI, no frontend build step |
| `extension/` | Chrome/Edge Manifest V3 extension |
| `scripts/`, `test/` | Packaging and local fixture tests |

## Environment

| Variable | Meaning |
| --- | --- |
| `FAKEIDM_DATA` | History/token/chunk directory override |
| `FAKEIDM_DOWNLOADS` | Initial default download folder; saved settings take precedence |
| `FAKEIDM_PORT` | Local API port; default 17831 required by extension |
| `FAKEIDM_PROFILE` | Electron profile override for isolated tests |
| `FAKEIDM_RUNTIME_CACHE` | Verified Electron ZIP cache |
| `NODE_BINARY` | Node executable for native Mac builds |
| `NODE_LICENSE` | Matching Node license file for offline Mac builds |

Use temporary state/download/profile directories for tests, never real history.

## Runtime and CI

`scripts/runtime.mjs` pins Electron 45.0.0 and official x64 ZIP SHA-256 values from `https://github.com/electron/electron/releases/download/v45.0.0/SHASUMS256.txt`. New and cached archives are verified. Update version and all hashes together, test affected platforms and preserve upstream licenses. The application uses no native npm modules.

`ci.yml` runs syntax and backend/platform tests on Windows, Ubuntu and macOS. `build.yml` runs manually or on `v*` tags, builds platform packages and uploads workflow artifacts. It also builds on pushes to main. It does not automatically create public GitHub Releases. GUI validation still needs a graphical machine; run `npm run desktop -- --smoke-test` on x64 to check startup, API connection, title and renderer isolation.

## Release

1. Update package/lock, extension, plist, server metadata, UI fallback and User-Agent versions.
2. Run `npm ci`, `npm run check`, `npm test` on supported systems.
3. Check desktop startup, direct download, pause/resume after exit, file-manager reveal and duplicate launch on target machines.
4. Package Windows/Linux with npm scripts. On Intel Mac run `npm run package:mac`, then `ditto -c -k --sequesterRsrc --keepParent build/FakeIDM.app dist/FakeIDM-<version>-Mac-Intel.zip`.
5. Preserve notices, calculate SHA-256 and report actual validation / known issues.
6. Commit source, tag only when ready, and attach release binaries separately. Exclude runtimes, build outputs and user data from source history.

## Repository metadata

- Repository: https://github.com/heroitvt/FakeIDM
- Display name: FakeIDM
- Description: Local HTTP/HTTPS download manager with parallel downloads and resume for Windows, Linux and macOS.
- Topics: download-manager, electron, nodejs, http, resume, windows, linux, macos, vietnamese
- License: MIT for original source.
- No website, support email, signing keys, commercial signing identity or update feed is configured.
