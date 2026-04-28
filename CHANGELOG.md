# Changelog

All notable changes to `@scanii/core` are documented here. Versions follow [SemVer](https://semver.org).

## 1.0.0 — Initial release

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
