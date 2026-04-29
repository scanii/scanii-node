# Changelog

All notable changes to `@scanii/core` are documented here. Versions follow [SemVer](https://semver.org).

## 1.1.0 — Streaming standardization

### Added

- `ReadableStream` added to the `ScaniiContent` union type accepted by `process` / `processAsync`. When a `ReadableStream` is passed, it is buffered to a `Blob` via `new Response(stream).blob()` before being appended to the `FormData` body (Node's `FormData` does not accept raw streams as multipart parts).
- `ScaniiClient.processFile(path, metadata?, callback?)` — path convenience for Node. Internally opens the file as a `ReadableStream` via `Readable.toWeb(fs.createReadStream(path))` and delegates to `process`. The filename in the multipart upload is set to the basename of `path`. **Node-only** — uses `node:fs`; not available in browsers.
- `ScaniiClient.processAsyncFile(path, metadata?, callback?)` — same as `processFile` but delegates to `processAsync`. Returns `ScaniiPendingResult`.

No renames, no deprecations — the existing `process(content, ...)` API is unchanged.

---

## 1.0.1 — Initial release

First public release of the Scanii Node SDK as `@scanii/core`.

### API surface

- `ScaniiClient.process(content, metadata?, callback?)` → `ScaniiProcessingResult`
- `ScaniiClient.processAsync(content, metadata?, callback?)` → `ScaniiPendingResult`
- `ScaniiClient.fetch(location, metadata?, callback?)` → `ScaniiPendingResult`
- `ScaniiClient.retrieve(id)` → `ScaniiProcessingResult`
- `ScaniiClient.ping()` → `boolean`
- `ScaniiClient.createAuthToken(timeoutSeconds?)` → `ScaniiAuthToken`
- `ScaniiClient.retrieveAuthToken(id)` → `ScaniiAuthToken`
- `ScaniiClient.deleteAuthToken(id)` → `boolean`

Errors: `ScaniiError` (base), `ScaniiAuthError` (401/403), `ScaniiRateLimitError` (429, with `retryAfter`).

### Highlights

- **Zero runtime dependencies.** Uses native `fetch`, `FormData`, `Blob`, `URLSearchParams` only.
- **Dual ESM + CJS build** with shipped `.d.ts` types.
- **Node 22+ and modern browsers.** No polyfills.
- **API v2.2.**
- **scanii-cli** integration tests cover the cross-OS matrix (Linux / macOS / Windows on Node 22 + 24) without burning real Scanii credits.
- **OIDC trusted publishing** with provenance attestation.
