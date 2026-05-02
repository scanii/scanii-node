import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';

import { ScaniiAuthError, ScaniiError, ScaniiRateLimitError } from './errors';
import type { ScaniiAuthToken } from './models/auth-token';
import type { ScaniiPendingResult } from './models/pending-result';
import type { ScaniiProcessingResult } from './models/processing-result';
import type { ScaniiTraceEvent } from './models/trace-event';
import type { ScaniiTraceResult } from './models/trace-result';

declare const SCANII_VERSION: string;

const FALLBACK_VERSION = '0.0.0-dev';
const VERSION: string = typeof SCANII_VERSION === 'string' ? SCANII_VERSION : FALLBACK_VERSION;

const DEFAULT_ENDPOINT = 'https://api.scanii.com';
const API_VERSION_PATH = '/v2.2';

/**
 * Options accepted by {@link ScaniiClient}.
 *
 * Provide either `key` + `secret` for HTTP Basic Auth, or `token` to
 * authenticate with a previously minted auth token. Mixing the two is an
 * error.
 */
export interface ScaniiClientOptions {
  /** API key — paired with `secret`. */
  key?: string;
  /** API secret — paired with `key`. */
  secret?: string;
  /** Auth token id returned by {@link ScaniiClient.createAuthToken}. */
  token?: string;
  /**
   * Override the API endpoint. Defaults to `https://api.scanii.com`. Use
   * regional hosts (`https://api-eu1.scanii.com`, etc.) for data residency,
   * or `http://localhost:4000` when running scanii-cli locally.
   */
  endpoint?: string;
  /** Optional user-agent fragment prepended to the SDK's default. */
  userAgent?: string;
}

/**
 * Body accepted by {@link ScaniiClient.process} / `processAsync`.
 *
 * - `Blob` / `File` — works in Node and browsers.
 * - `ArrayBuffer` / `ArrayBufferView` — auto-wrapped in a `Blob`.
 * - `ReadableStream` — Web Streams API, native in Node 22+. The stream is
 *   passed directly as the `fetch` body, so memory use is independent of
 *   content length. **Node-only when using `ReadableStream`** — browsers
 *   may also support it in modern environments.
 */
export type ScaniiContent = Blob | ArrayBuffer | ArrayBufferView | ReadableStream;

interface RawResponse {
  status: number;
  body: string;
  headers: Headers;
}

/**
 * Thin client over the Scanii REST API v2.2.
 *
 * The client is integration-only — it does not retry, batch, or paginate.
 * Each public method maps to exactly one HTTP request.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 *
 * @example
 * ```ts
 * import { ScaniiClient } from '@scanii/core';
 *
 * const client = new ScaniiClient({ key: 'k', secret: 's' });
 * const result = await client.process(new Blob(['hello world']));
 * console.log(result.findings);
 * ```
 */
export class ScaniiClient {
  static readonly VERSION = VERSION;

  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly userAgentHeader: string;

  constructor(options: ScaniiClientOptions = {}) {
    const { key, secret, token, endpoint, userAgent } = options;

    if (token !== undefined && (key !== undefined || secret !== undefined)) {
      throw new Error('provide either { token } or { key, secret }, not both');
    }

    if (token !== undefined) {
      if (token === '') {
        throw new Error('token must not be empty');
      }
      this.authHeader = 'Basic ' + base64(`${token}:`);
    } else {
      if (!key) {
        throw new Error('key must not be empty');
      }
      if (key.includes(':')) {
        throw new Error('key must not contain a colon');
      }
      if (secret === undefined) {
        throw new Error('secret must not be undefined; use { token } for token auth');
      }
      this.authHeader = 'Basic ' + base64(`${key}:${secret}`);
    }

    const target = (endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, '');
    this.baseUrl = target + API_VERSION_PATH;

    const defaultUa = `scanii-node/${VERSION}`;
    this.userAgentHeader = userAgent ? `${userAgent} ${defaultUa}` : defaultUa;
  }

  /**
   * Submit content synchronously. The returned promise resolves once the API
   * has scanned the content and returned the result (HTTP 201).
   *
   * Accepts `Blob`, `File`, `ArrayBuffer`, any `ArrayBufferView`, or a
   * `ReadableStream` (Web Streams API). When passing a `ReadableStream`, the
   * stream is buffered to a `Blob` before upload — Node 22's `fetch` and
   * `FormData` do not accept raw streams as multipart parts.
   *
   * For file-on-disk uploads, prefer {@link processFile} (Node-only).
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files`
   */
  async process(
    content: ScaniiContent,
    metadata: Record<string, string> = {},
    callback?: string,
  ): Promise<ScaniiProcessingResult> {
    const form = await buildMultipart(content, metadata, callback);
    const res = await this.request('POST', '/files', form);
    if (res.status !== 201) {
      this.throwForStatus(res);
    }
    return parseProcessingResult(res);
  }

  /**
   * Submit a file from disk for synchronous scanning. Opens the file as a
   * stream and delegates to {@link process}. The filename in the multipart
   * upload is set to the basename of `path`.
   *
   * **Node-only** — uses `node:fs` and `node:stream`. Not available in browsers.
   *
   * @param path - Absolute or relative path to the file.
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files`
   */
  async processFile(
    path: string,
    metadata: Record<string, string> = {},
    callback?: string,
  ): Promise<ScaniiProcessingResult> {
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
    const form = await buildMultipart(stream, metadata, callback, basename(path));
    const res = await this.request('POST', '/files', form);
    if (res.status !== 201) {
      this.throwForStatus(res);
    }
    return parseProcessingResult(res);
  }

  /**
   * Submit a file for server-side asynchronous scanning. Returns a pending
   * result containing the id; the final result is delivered via the optional
   * `callback` URL or fetched later via {@link retrieve}.
   *
   * Accepts the same content types as {@link process}.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files/async`
   */
  async processAsync(
    content: ScaniiContent,
    metadata: Record<string, string> = {},
    callback?: string,
  ): Promise<ScaniiPendingResult> {
    const form = await buildMultipart(content, metadata, callback);
    const res = await this.request('POST', '/files/async', form);
    if (res.status !== 202) {
      this.throwForStatus(res);
    }
    return parsePendingResult(res);
  }

  /**
   * Submit a file from disk for server-side asynchronous scanning. The
   * filename in the multipart upload is set to the basename of `path`.
   *
   * **Node-only** — uses `node:fs` and `node:stream`. Not available in browsers.
   *
   * @param path - Absolute or relative path to the file.
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files/async`
   */
  async processAsyncFile(
    path: string,
    metadata: Record<string, string> = {},
    callback?: string,
  ): Promise<ScaniiPendingResult> {
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
    const form = await buildMultipart(stream, metadata, callback, basename(path));
    const res = await this.request('POST', '/files/async', form);
    if (res.status !== 202) {
      this.throwForStatus(res);
    }
    return parsePendingResult(res);
  }

  /**
   * Ask Scanii to download a remote URL and scan it asynchronously.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files/fetch`
   */
  async fetch(
    location: string,
    metadata: Record<string, string> = {},
    callback?: string,
  ): Promise<ScaniiPendingResult> {
    if (!location) {
      throw new Error('location must not be empty');
    }
    const params = new URLSearchParams();
    params.set('location', location);
    if (callback) {
      params.set('callback', callback);
    }
    for (const [k, v] of Object.entries(metadata)) {
      params.set(`metadata[${k}]`, v);
    }
    const res = await this.request('POST', '/files/fetch', params.toString(), 'application/x-www-form-urlencoded');
    if (res.status !== 202) {
      this.throwForStatus(res);
    }
    return parsePendingResult(res);
  }

  /**
   * Retrieve the result of a previously submitted scan.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `GET /files/{id}`
   */
  async retrieve(id: string): Promise<ScaniiProcessingResult> {
    if (!id) {
      throw new Error('id must not be empty');
    }
    const res = await this.request('GET', '/files/' + encodeURIComponent(id));
    if (res.status !== 200) {
      this.throwForStatus(res);
    }
    return parseProcessingResult(res);
  }

  /**
   * Retrieve the processing event trace for a previously scanned file.
   *
   * Returns `undefined` when the id is not found (HTTP 404). All other
   * error statuses throw a `ScaniiError` subclass as usual.
   *
   * **Preview surface** — part of the v2.2 API; behavior may change in future
   * releases.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `GET /files/{id}/trace`
   */
  async retrieveTrace(id: string): Promise<ScaniiTraceResult | undefined> {
    if (!id) {
      throw new Error('id must not be empty');
    }
    const res = await this.request('GET', '/files/' + encodeURIComponent(id) + '/trace');
    if (res.status === 404) {
      return undefined;
    }
    if (res.status !== 200) {
      this.throwForStatus(res);
    }
    return parseTraceResult(res);
  }

  /**
   * Submit a remote URL for synchronous processing. The API downloads the
   * content from `location` and scans it, returning the result directly (HTTP
   * 201). The `location` parameter is a plain string URL — not a `URL` object
   * — matching the convention established by {@link fetch}.
   *
   * **Preview surface** — part of the v2.2 API; behavior may change in future
   * releases.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files`
   */
  async processFromUrl(
    location: string,
    options: { callback?: string; metadata?: Record<string, string> } = {},
  ): Promise<ScaniiProcessingResult> {
    if (!location) {
      throw new Error('location must not be empty');
    }
    const { callback, metadata = {} } = options;
    const form = new FormData();
    form.append('location', location);
    for (const [k, v] of Object.entries(metadata)) {
      form.append(`metadata[${k}]`, v);
    }
    if (callback) {
      form.append('callback', callback);
    }
    const res = await this.request('POST', '/files', form);
    if (res.status !== 201) {
      this.throwForStatus(res);
    }
    return parseProcessingResult(res);
  }

  /**
   * Verify that the configured credentials reach the API.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `GET /ping`
   */
  async ping(): Promise<boolean> {
    const res = await this.request('GET', '/ping');
    if (res.status === 200) {
      return true;
    }
    this.throwForStatus(res);
  }

  /**
   * Mint a short-lived auth token. `timeoutSeconds` must be positive.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /auth/tokens`
   */
  async createAuthToken(timeoutSeconds = 300): Promise<ScaniiAuthToken> {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error('timeoutSeconds must be a positive number');
    }
    const params = new URLSearchParams({ timeout: String(Math.trunc(timeoutSeconds)) });
    const res = await this.request('POST', '/auth/tokens', params.toString(), 'application/x-www-form-urlencoded');
    if (res.status !== 201 && res.status !== 200) {
      this.throwForStatus(res);
    }
    return parseAuthToken(res);
  }

  /**
   * Inspect a previously created auth token.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `GET /auth/tokens/{id}`
   */
  async retrieveAuthToken(id: string): Promise<ScaniiAuthToken> {
    if (!id) {
      throw new Error('id must not be empty');
    }
    const res = await this.request('GET', '/auth/tokens/' + encodeURIComponent(id));
    if (res.status !== 200) {
      this.throwForStatus(res);
    }
    return parseAuthToken(res);
  }

  /**
   * Revoke an auth token.
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `DELETE /auth/tokens/{id}`
   */
  async deleteAuthToken(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('id must not be empty');
    }
    const res = await this.request('DELETE', '/auth/tokens/' + encodeURIComponent(id));
    if (res.status !== 204) {
      this.throwForStatus(res);
    }
    return true;
  }

  private async request(
    method: string,
    path: string,
    body?: BodyInit | string,
    contentType?: string,
  ): Promise<RawResponse> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'User-Agent': this.userAgentHeader,
      Accept: 'application/json',
    };
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = body as BodyInit;
    }

    let response: Response;
    try {
      response = await fetch(this.baseUrl + path, init);
    } catch (err) {
      throw new ScaniiError(
        err instanceof Error ? `transport error: ${err.message}` : 'transport error',
        { cause: err },
      );
    }

    const text = await response.text();
    return { status: response.status, body: text, headers: response.headers };
  }

  private throwForStatus(res: RawResponse): never {
    const requestId = res.headers.get('x-scanii-request-id') ?? undefined;
    const hostId = res.headers.get('x-scanii-host-id') ?? undefined;
    const message = extractErrorMessage(res.body) ?? `HTTP ${res.status}`;

    if (res.status === 401 || res.status === 403) {
      throw new ScaniiAuthError(message, {
        statusCode: res.status,
        requestId,
        hostId,
        body: res.body,
      });
    }

    if (res.status === 429) {
      const retryAfterRaw = res.headers.get('retry-after');
      const retryAfter = retryAfterRaw && /^\d+$/.test(retryAfterRaw) ? Number(retryAfterRaw) : undefined;
      throw new ScaniiRateLimitError(message, {
        statusCode: res.status,
        requestId,
        hostId,
        body: res.body,
        retryAfter,
      });
    }

    throw new ScaniiError(message, {
      statusCode: res.status,
      requestId,
      hostId,
      body: res.body,
    });
  }
}

async function buildMultipart(
  content: ScaniiContent,
  metadata: Record<string, string>,
  callback: string | undefined,
  filename?: string,
): Promise<FormData> {
  const form = new FormData();
  const blob = await toBlob(content);
  form.append('file', blob, filename ?? blobFilename(content));
  for (const [k, v] of Object.entries(metadata)) {
    form.append(`metadata[${k}]`, v);
  }
  if (callback) {
    form.append('callback', callback);
  }
  return form;
}

async function toBlob(content: ScaniiContent): Promise<Blob> {
  if (content instanceof Blob) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new Blob([content], { type: 'application/octet-stream' });
  }
  if (ArrayBuffer.isView(content)) {
    // Copy into a fresh ArrayBuffer-backed Uint8Array — handles both
    // ArrayBuffer- and SharedArrayBuffer-backed views uniformly.
    const view = content as ArrayBufferView;
    const bytes = new Uint8Array(view.byteLength);
    bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return new Blob([bytes], { type: 'application/octet-stream' });
  }
  if (typeof ReadableStream !== 'undefined' && content instanceof ReadableStream) {
    // Buffer the stream to a Blob. FormData.append does not accept ReadableStream
    // directly — Node's fetch/FormData require a Blob or string part value.
    return new Response(content).blob();
  }
  throw new Error('content must be a Blob, File, ArrayBuffer, ArrayBufferView, or ReadableStream');
}

function blobFilename(content: ScaniiContent): string {
  // File extends Blob and exposes `.name`. Browsers + Node 20+ have `File`.
  if (typeof File !== 'undefined' && content instanceof File && content.name) {
    return content.name;
  }
  return 'file';
}

function parseProcessingResult(res: RawResponse): ScaniiProcessingResult {
  const json = decodeJson(res.body);
  return {
    id: stringField(json['id']) ?? '',
    findings: Array.isArray(json['findings']) ? (json['findings'] as unknown[]).map(String) : [],
    checksum: stringField(json['checksum']),
    contentLength: numberField(json['content_length']),
    contentType: stringField(json['content_type']),
    metadata: stringMap(json['metadata']),
    creationDate: stringField(json['creation_date']),
    error: stringField(json['error']),
    requestId: res.headers.get('x-scanii-request-id') ?? undefined,
    hostId: res.headers.get('x-scanii-host-id') ?? undefined,
    resourceLocation: res.headers.get('location') ?? undefined,
    statusCode: res.status,
    rawResponse: res.body,
  };
}

function parseTraceResult(res: RawResponse): ScaniiTraceResult {
  const json = decodeJson(res.body);
  const rawEvents = Array.isArray(json['events']) ? (json['events'] as unknown[]) : [];
  const events: ScaniiTraceEvent[] = rawEvents.map((e) => {
    const obj = e && typeof e === 'object' ? (e as Record<string, unknown>) : {};
    return {
      timestamp: stringField(obj['timestamp']),
      message: stringField(obj['message']),
    };
  });
  return {
    id: stringField(json['id']) ?? '',
    events,
    requestId: res.headers.get('x-scanii-request-id') ?? undefined,
    hostId: res.headers.get('x-scanii-host-id') ?? undefined,
    statusCode: res.status,
    rawResponse: res.body,
  };
}

function parsePendingResult(res: RawResponse): ScaniiPendingResult {
  const json = decodeJson(res.body);
  return {
    id: stringField(json['id']) ?? '',
    requestId: res.headers.get('x-scanii-request-id') ?? undefined,
    hostId: res.headers.get('x-scanii-host-id') ?? undefined,
    resourceLocation: res.headers.get('location') ?? undefined,
    statusCode: res.status,
    rawResponse: res.body,
  };
}

function parseAuthToken(res: RawResponse): ScaniiAuthToken {
  const json = decodeJson(res.body);
  return {
    id: stringField(json['id']) ?? '',
    creationDate: stringField(json['creation_date']),
    expirationDate: stringField(json['expiration_date']),
    requestId: res.headers.get('x-scanii-request-id') ?? undefined,
    hostId: res.headers.get('x-scanii-host-id') ?? undefined,
    resourceLocation: res.headers.get('location') ?? undefined,
    statusCode: res.status,
    rawResponse: res.body,
  };
}

function decodeJson(body: string): Record<string, unknown> {
  if (!body) {
    return {};
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new ScaniiError('expected JSON object response, got: ' + body.slice(0, 200));
}

function extractErrorMessage(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string') {
      return (parsed as { error: string }).error;
    }
  } catch {
    // not JSON
  }
  return body;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return undefined;
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = String(v);
  }
  return out;
}

function base64(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64');
  }
  if (typeof btoa === 'function' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
  throw new Error('no base64 encoder available in this runtime');
}
