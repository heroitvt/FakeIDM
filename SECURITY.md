# Security

Version 1.2.x is the current development line; there is no guaranteed security support period.

The API binds to loopback, checks Host/Origin and requires a bearer token. The local UI uses a Content Security Policy. Electron has Node integration disabled, context isolation and sandbox enabled; new windows and navigation outside the local app are blocked.

Downloaded files are not executed automatically or antivirus-scanned. HTTP/HTTPS URLs may include private-network addresses: this is a user-operated local downloader, not a public download proxy. Do not expose its port through a public tunnel.

Use GitHub private vulnerability reporting **if enabled by the repository owner**. Otherwise use a private contact channel published by the maintainer; no support email is configured yet. Do not post credentials, private URLs or exploitable details publicly. Review logs before sharing them.

Checksums verify archive bytes, not publisher identity. The project has no commercial code-signing identity yet.

The browser extension can send URL-scoped authentication cookies to the local app. These headers may persist in local history for resume but are omitted from API snapshots and stripped when origin changes. Do not publish history files.
