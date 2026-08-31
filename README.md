# @scanii/core

Official zero-dependency TypeScript SDK for the [Scanii](https://www.scanii.com) content security API.

Works in Node 22+ and modern browsers (anywhere `fetch` and `FormData` are native).

## SDK Principles

1. **Light.** Zero runtime dependencies, stdlib only.
2. **Up to date.** Always current with the latest Scanii API.
3. **Integration-only.** Wraps the REST API — retries, concurrency, and batching are the caller's responsibility.

## Install

```bash
npm install @scanii/core
```

> Looking for `scanii` (unscoped)? That's a placeholder — install `@scanii/core` instead.

## Quickstart

```ts
import { ScaniiClient, ScaniiTarget } from '@scanii/core';

const client = new ScaniiClient({
  key: process.env.SCANII_KEY!,
  secret: process.env.SCANII_SECRET!,
  endpoint: ScaniiTarget.US1,
});

// Scan a file from disk (Node-only):
const result = await client.processFile('./document.pdf');
console.log(result.findings);

// Or pass any supported content type:
const result2 = await client.process(new Blob([buffer]));
```

In the browser, pass a `File` from an `<input type="file">`:

```ts
const fileInput = document.querySelector<HTMLInputElement>('#file')!;
const result = await client.process(fileInput.files![0]);
```

For browser usage, prefer minting a short-lived auth token server-side and constructing the client with `{ token }`.

## API

| Method | REST | Returns |
|---|---|---|
| `process(content, metadata?, callback?)` | `POST /files` | `Promise<ScaniiProcessingResult>` |
| `processFile(path, metadata?, callback?)` | `POST /files` | `Promise<ScaniiProcessingResult>` |
| `processFromUrl(location, options?)` | `POST /files` | `Promise<ScaniiProcessingResult>` (v2.2 preview) |
| `processAsync(content, metadata?, callback?)` | `POST /files/async` | `Promise<ScaniiPendingResult>` |
| `processAsyncFile(path, metadata?, callback?)` | `POST /files/async` | `Promise<ScaniiPendingResult>` |
| `fetch(url, metadata?, callback?)` | `POST /files/fetch` | `Promise<ScaniiPendingResult>` |
| `retrieve(id)` | `GET /files/{id}` | `Promise<ScaniiProcessingResult>` |
| `retrieveTrace(id)` | `GET /files/{id}/trace` | `Promise<ScaniiTraceResult \| undefined>` (v2.2 preview) |
| `delete(id)` | `DELETE /files/{id}` | `Promise<boolean>` |
| `deleteTrace(id)` | `DELETE /files/{id}/trace` | `Promise<boolean>` |
| `ping()` | `GET /ping` | `Promise<boolean>` |
| `createAuthToken(timeoutSeconds?)` | `POST /auth/tokens` | `Promise<ScaniiAuthToken>` |
| `retrieveAuthToken(id)` | `GET /auth/tokens/{id}` | `Promise<ScaniiAuthToken>` |
| `deleteAuthToken(id)` | `DELETE /auth/tokens/{id}` | `Promise<boolean>` |

`processFile` / `processAsyncFile` are **Node-only** (use `node:fs`); browsers use `process(blob, ...)`.

`content` accepts `Blob`, `File`, `ArrayBuffer`, any `ArrayBufferView` (e.g. `Uint8Array`, `Buffer`), or `ReadableStream` (Web Streams API, Node 22+).

Full API reference: <https://scanii.github.io/openapi/v22/>.

### Result shape

```ts
interface ScaniiProcessingResult {
  id: string;
  findings: readonly string[];
  checksum: string | undefined;
  contentLength: number | undefined;
  contentType: string | undefined;
  metadata: Readonly<Record<string, string>>;
  creationDate: string | undefined;
  error: string | undefined;
  requestId: string | undefined;
  hostId: string | undefined;
  resourceLocation: string | undefined;
  statusCode: number;
  rawResponse: string;
}
```

`findings` is always an array. An empty array means the content is clean.

## Regional endpoints

```ts
new ScaniiClient({ key, secret, endpoint: ScaniiTarget.EU1 });
```

The `endpoint` option accepts either a `ScaniiTarget` constant or a bare URL string (useful for scanii-cli, e.g. `endpoint: 'http://localhost:4000'`).

| Constant | Endpoint |
|---|---|
| `ScaniiTarget.US1` | `https://api-us1.scanii.com` |
| `ScaniiTarget.EU1` | `https://api-eu1.scanii.com` |
| `ScaniiTarget.EU2` | `https://api-eu2.scanii.com` |
| `ScaniiTarget.AP1` | `https://api-ap1.scanii.com` |
| `ScaniiTarget.AP2` | `https://api-ap2.scanii.com` |
| `ScaniiTarget.CA1` | `https://api-ca1.scanii.com` |
| ~~Auto (default)~~ | ~~`https://api.scanii.com`~~ — **deprecated**, does not guarantee regional data placement |

## Errors

```ts
import { ScaniiAuthError, ScaniiError, ScaniiRateLimitError } from '@scanii/core';

try {
  await client.process(blob);
} catch (err) {
  if (err instanceof ScaniiRateLimitError) {
    console.log('retry after', err.retryAfter, 'seconds');
  } else if (err instanceof ScaniiAuthError) {
    // 401/403 — bad credentials
  } else if (err instanceof ScaniiError) {
    console.error(err.statusCode, err.message, err.requestId);
  }
}
```

Per SDK Principle 3, the SDK does **not** retry on the caller's behalf — backoff and retry policy belong to your application.

## Local testing with scanii-cli

The SDK ships integration tests against [scanii-cli](https://github.com/scanii/scanii-cli), a local mock server. No real Scanii credentials are needed for development or CI.

```bash
docker run -d --name scanii-cli -p 4000:4000 ghcr.io/scanii/scanii-cli:latest server

npm install
npm test
```

The integration tests assume `endpoint: http://localhost:4000` with `key` / `secret`. They self-skip when scanii-cli is not reachable, so `npm test` is safe to run without it.

## TypeScript / JavaScript compatibility

The package ships ESM, CommonJS, and `.d.ts` types. Use `import` from ESM, `require` from CommonJS:

```js
// CommonJS
const { ScaniiClient } = require('@scanii/core');
```

Requires Node 22+ for native `fetch`/`FormData`/`Blob`.

## Contributing

Bug reports and PRs welcome at <https://github.com/scanii/scanii-node/issues>.

## License

[Apache-2.0](LICENSE).
