# Validation — FakeIDM 1.2.0

Recorded 2026-10-23 on macOS Intel, Node.js 22.23.3. Source baseline: the existing SwiftDrop-1.0/Source with the IDM-style UI, browser interception and refresh-link support.

| Check | Result |
| --- | --- |
| JavaScript syntax and JSON manifests | Passed |
| Complete automated suite | 26 passed, 0 failed |
| Desktop Electron 45 end-to-end on Mac | Passed |
| Runtime archives for Windows/Linux | Pinned upstream SHA-256 verified by packaging script |

Desktop checks: FakeIDM title, original IDM-style table/toolbar, renderer without Node access, exact downloaded bytes, closing details under CSP, saved settings, refreshing URL during an active transfer, exact bytes from the new source, persisted state after exit.

Automated coverage includes parallel ranges, durable pause/resume, source changes, no Range, unknown lengths, 65 MiB responses with and without Range, interruption after actual bytes have been received, rate limits, scheduling, API authentication, header validation, cross-origin credential isolation, URL refresh/reset, browser handoff failures and duplicate events, and filename callback handling.

## Limits

- Windows/Linux desktop GUI has not been executed on a real target machine in this local review. GitHub Actions is configured to run source tests and build on native runners; inspect the actual workflow result before relying on it.
- Google Drive share-page/confirmation resolution and quota/access restrictions are not automatically handled. HTML is reported as an error, rather than saved as a successful file.
- Extension logic is tested with browser API mocks; loading it in the user's real browser profile and downloads requiring a particular account still need a user-side check.
- Native Mac launcher source is maintained, but this release request packages Windows/Linux. No newly built Mac binary is claimed here.

Run `npm run check` and `npm test`. Desktop smoke: `npm run desktop -- --smoke-test` in a graphical x64 session.
