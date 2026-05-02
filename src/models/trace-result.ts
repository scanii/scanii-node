import type { ScaniiTraceEvent } from './trace-event';

/**
 * Result of a processing trace retrieval.
 *
 * Returned by {@link ScaniiClient.retrieveTrace}.
 * The `events` array contains ordered processing steps the API performed on
 * the submitted content.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 */
export interface ScaniiTraceResult {
  /** Unique resource id of the previously scanned content. */
  readonly id: string;
  /** Ordered list of processing events. */
  readonly events: readonly ScaniiTraceEvent[];
  /** `X-Scanii-Request-Id` response header — useful when contacting support. */
  readonly requestId: string | undefined;
  /** `X-Scanii-Host-Id` response header — useful when contacting support. */
  readonly hostId: string | undefined;
  /** HTTP status code returned by the API. */
  readonly statusCode: number;
  /** Raw response body string returned by the API. */
  readonly rawResponse: string;
}
