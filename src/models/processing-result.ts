/**
 * Result of a synchronous file scan.
 *
 * Field names mirror the Java reference (`com.scanii:scanii-java`) translated
 * to camelCase. `findings` is always an array — even when empty — never a
 * `Set`.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 */
export interface ScaniiProcessingResult {
  /** Unique resource id assigned by the API to this scan. */
  readonly id: string;
  /** Detection findings, e.g. `content.malicious.eicar`. Empty array on a clean file. */
  readonly findings: readonly string[];
  /** SHA-1 checksum of the uploaded content. May be undefined when the API omits it. */
  readonly checksum: string | undefined;
  /** Size in bytes of the uploaded content. */
  readonly contentLength: number | undefined;
  /** MIME type detected by the API. */
  readonly contentType: string | undefined;
  /** User-supplied metadata echoed back by the API. */
  readonly metadata: Readonly<Record<string, string>>;
  /** Server-side creation timestamp in ISO 8601 form. */
  readonly creationDate: string | undefined;
  /**
   * @deprecated The server never populates this field on a successful response —
   * server-side errors arrive as non-2xx responses and are surfaced via
   * `ScaniiError` subclasses (catch and check `instanceof ScaniiAuthError`,
   * `ScaniiRateLimitError`, or `ScaniiError`). Will be removed in a future
   * major version.
   */
  readonly error: string | undefined;
  /** `X-Scanii-Request-Id` response header — useful when contacting support. */
  readonly requestId: string | undefined;
  /** `X-Scanii-Host-Id` response header — useful when contacting support. */
  readonly hostId: string | undefined;
  /** `Location` response header. */
  readonly resourceLocation: string | undefined;
  /** HTTP status code returned by the API. */
  readonly statusCode: number;
  /** Raw response body string returned by the API. */
  readonly rawResponse: string;
}
