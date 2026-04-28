/**
 * Result of an asynchronous scan submission.
 *
 * Returned by {@link ScaniiClient.processAsync} and {@link ScaniiClient.fetch}.
 * The actual scan result is fetched later via {@link ScaniiClient.retrieve}
 * using the returned `id`, or delivered to a callback URL when one was
 * supplied.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 */
export interface ScaniiPendingResult {
  /** Resource id assigned by the API; pass this to `retrieve` to read the result. */
  readonly id: string;
  readonly requestId: string | undefined;
  readonly hostId: string | undefined;
  readonly resourceLocation: string | undefined;
  readonly statusCode: number;
  readonly rawResponse: string;
}
