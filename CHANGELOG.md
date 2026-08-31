# Changelog

All notable changes to `@scanii/core` are documented here. Versions follow [SemVer](https://semver.org).

## [Unreleased]

### Changed

- Dropped the "v2.2 preview" designation from `retrieveTrace` and `processFromUrl`.
  The trace endpoint is no longer marked preview in the contract, and `processFromUrl`
  was never preview; the methods themselves are unchanged.

## [1.4.1] — dependency refresh

## [1.5.0] — v2.2 delete endpoints split

### Added

- `ScaniiClient.delete(id)` maps to `DELETE /v2.2/files/{id}` and returns `true` on `204 No Content`.
- `ScaniiClient.deleteTrace(id)` maps to `DELETE /v2.2/files/{id}/trace` and returns `true` on `204 No Content`.

### Changed

- Delete behavior now follows the revised v2.2 contract where deleting a processing result does not delete the trace.

### Tested

- Integration coverage for result-delete/trace-retained, trace-delete, and unknown-id error behavior.

### Changed

- Refreshed dev-dependency lockfile within existing ranges (jest 29.x, eslint 9.x,
  typescript 5.x, ts-jest 29.x, tsup 8.x). No range/floor changes, no major jumps.
  Zero runtime dependencies — the published package is unchanged.
- Bumped CI actions: `actions/checkout` v4 → v7, `actions/setup-node` v4 → v7.

## [1.4.0] — `ScaniiTarget` typed regional endpoints

### Added

- `ScaniiTarget` — typed regional endpoint constants (`ScaniiTarget.US1`, `EU1`, `EU2`,
  `AP1`, `AP2`, `CA1`) exported from `@scanii/core`. Pass to
  `new ScaniiClient({ endpoint })` instead of a bare URL string for ergonomics and
  IDE autocomplete. The `endpoint` option still accepts bare URL strings (e.g. for
  scanii-cli), so this is purely additive — no breaking change.

  ```ts
  import { ScaniiClient, ScaniiTarget } from '@scanii/core';
  new ScaniiClient({ key, secret, endpoint: ScaniiTarget.US1 });
  ```

  `ScaniiTarget` is intentionally not provided for AUTO (latency-based routing) —
  customer data residency / chain-of-custody compliance requires an explicit regional
  choice. Brings `@scanii/core` in line with the cross-SDK pattern (`scanii-java`,
  `scanii-python`, `scanii-php`, `scanii-rust`, `scanii-dotnet`, `scanii-ruby`).

## [1.3.0] — deprecate AUTO endpoint

### Deprecated

- `ScaniiClientOptions.endpoint` — omitting this field defaults to `https://api.scanii.com`
  (AUTO routing), which does not guarantee regional data placement. Pass an explicit regional
  host (`'https://api-us1.scanii.com'`, `'https://api-eu1.scanii.com'`, etc.) for data
  residency compliance. The AUTO default will be removed in a future major version.

## [1.2.0] — v2.2 API surface

### Added

- `ScaniiClient.retrieveTrace(id)` — retrieves the processing event trace for a previously scanned file (`GET /v2.2/files/{id}/trace`). Returns `undefined` on 404 (resource not found). New model types `ScaniiTraceResult` and `ScaniiTraceEvent` exported from the package. Preview surface per the v2.2 API spec.
- `ScaniiClient.processFromUrl(location, options?)` — synchronous scan of a remote URL (`POST /v2.2/files` with `location` as a `multipart/form-data` field). Returns `ScaniiProcessingResult` directly. `options` accepts `callback` and `metadata`. Preview surface per the v2.2 API spec.

### Deprecated

- `ScaniiProcessingResult.error` — the server never populates this field on a successful response; server-side errors arrive as non-2xx responses and are surfaced via `ScaniiError` subclasses. Will be removed in a future major version.

---

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
