/**
 * Base error thrown by {@link ScaniiClient} when the Scanii API returns a
 * non-success response or a transport-level failure occurs.
 *
 * Per SDK Principle 3 the SDK does not retry on the caller's behalf —
 * handling backoff, retries, or circuit breaking is the caller's
 * responsibility.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 */
export class ScaniiError extends Error {
  readonly statusCode: number;
  readonly requestId: string | undefined;
  readonly hostId: string | undefined;
  readonly body: string | undefined;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      requestId?: string | undefined;
      hostId?: string | undefined;
      body?: string | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ScaniiError';
    this.statusCode = options.statusCode ?? 0;
    this.requestId = options.requestId;
    this.hostId = options.hostId;
    this.body = options.body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API rejects the supplied credentials (HTTP 401 / 403).
 */
export class ScaniiAuthError extends ScaniiError {
  constructor(
    message: string,
    options: {
      statusCode?: number;
      requestId?: string | undefined;
      hostId?: string | undefined;
      body?: string | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message, options);
    this.name = 'ScaniiAuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API responds with HTTP 429. The `retryAfter` field carries
 * the value of the `Retry-After` response header (in seconds) when the server
 * provided one.
 */
export class ScaniiRateLimitError extends ScaniiError {
  readonly retryAfter: number | undefined;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      requestId?: string | undefined;
      hostId?: string | undefined;
      body?: string | undefined;
      retryAfter?: number | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message, options);
    this.name = 'ScaniiRateLimitError';
    this.retryAfter = options.retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
