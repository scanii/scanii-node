import { ScaniiAuthError, ScaniiError, ScaniiRateLimitError } from './errors';
import type { ScaniiAuthToken } from './models/auth-token';
import type { ScaniiPendingResult } from './models/pending-result';
import type { ScaniiProcessingResult } from './models/processing-result';

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
 * Body accepted by {@link ScaniiClient.process} / `processAsync`. Anything
 * `fetch`'s `FormData.append` accepts as a third argument is fine: a `Blob`,
 * a `File`, or in Node a `Buffer` / `Uint8Array` (auto-wrapped in a `Blob`).
 */
export type ScaniiContent = Blob | ArrayBuffer | ArrayBufferView;

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
   * Submit a file synchronously. The returned promise resolves once the API
   * has scanned the content and returned the result (HTTP 201).
   *
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files`
   */
  async process(
    content: ScaniiContent,
    metadata: Record<string, string> = {},
    callback?: string,
  ): Promise<ScaniiProcessingResult> {
    const form = buildMultipart(content, metadata, callback);
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
   * @see {@link https://scanii.github.io/openapi/v22/} — `POST /files/async`
   */
  async processAsync(
    content: ScaniiContent,
    metadata: Record<string, string> = {},
    callback?: string,
  ): Promise<ScaniiPendingResult> {
    const form = buildMultipart(content, metadata, callback);
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

function buildMultipart(
  content: ScaniiContent,
  metadata: Record<string, string>,
  callback: string | undefined,
): FormData {
  const form = new FormData();
  const blob = toBlob(content);
  form.append('file', blob, blobFilename(content));
  for (const [k, v] of Object.entries(metadata)) {
    form.append(`metadata[${k}]`, v);
  }
  if (callback) {
    form.append('callback', callback);
  }
  return form;
}

function toBlob(content: ScaniiContent): Blob {
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
  throw new Error('content must be a Blob, File, ArrayBuffer, or ArrayBufferView');
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
