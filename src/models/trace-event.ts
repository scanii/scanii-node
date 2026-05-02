/**
 * A single event in a processing trace.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 */
export interface ScaniiTraceEvent {
  /** ISO 8601 timestamp when this event occurred. */
  readonly timestamp: string | undefined;
  /** Human-readable description of the processing step. */
  readonly message: string | undefined;
}
