# Code review and corrections — 1.2.0

The reviewed baseline is the source in Downloads/SwiftDrop-1.0/Source, including the existing IDM-style UI. The changes below address observed code paths and have targeted regression coverage.

| Finding | Correction |
| --- | --- |
| Retry reused the old byte start after partially writing a failed response | Recalculate byte start/end on every retry; verify exact bytes after a forced disconnect |
| Chunk limit was also applied to non-Range responses, rejecting full large files | Bound requests only when Range and a source validator permit segmented transfer |
| Unvalidated source could span independent responses | Use one connection and restart a partial response when no validator exists |
| Refresh URL modified an active job without waiting, retaining old chunks | Stop the active task, clear old chunks, reset metadata, then queue the new source; reject changes to completed files |
| Browser-supplied headers could override Range/Host | Allowlist and validate headers; reserve protocol headers for the engine |
| Cookies/Authorization followed redirects to unrelated origins | Strip sensitive headers when origin changes, including later range requests |
| Extension merged broad Google-domain cookies into other URLs | Request cookies for the exact download URL only |
| Browser download was cancelled before manager acknowledgement | Cancel only after a persisted-job acknowledgement; keep browser download on handoff failure |
| Concurrent browser events could submit duplicate jobs | Serialize handling per browser download ID and deduplicate acknowledged jobs |
| Native prompt unavailable in Electron; inline detail-close handler blocked by CSP | Use an HTML dialog and delegated event handling |

This review is not a claim that every possible server, filesystem or browser integration is supported. See TESTING.md and README.md for evidence and known limits. Authentication headers remain local in persisted job state to allow resume; do not publish that directory.
