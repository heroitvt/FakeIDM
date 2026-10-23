# Contributing

1. Create a branch for one change; use Node 22+ (24 LTS recommended).
2. Run `npm ci`, `npm run check`, `npm test`.
3. Add regression coverage for integrity, persistence or platform behavior changes.
4. For UI changes, check dialogs, shortcuts and a narrow window on the affected OS.
5. Open a pull request describing the problem, resulting behavior and tests actually run.

Do not commit runtimes, release archives, private URLs, cookies, pairing tokens, state or downloaded files. Use generated local HTTP fixtures in tests. Report OS/architecture, version, steps and errors; redact credentials from logs.

Keep the backend independent of Electron for standard Node tests and the native Mac launcher. Preserve loopback binding, token checks and renderer sandboxing.
