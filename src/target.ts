/**
 * Scanii regional API endpoints.
 *
 * Pass one of these constants to {@link ScaniiClient} via the `endpoint`
 * option to pin requests to a specific region:
 *
 * ```ts
 * new ScaniiClient({ key, secret, endpoint: ScaniiTarget.US1 });
 * ```
 *
 * For local testing against scanii-cli, pass a bare URL string instead
 * (`endpoint: 'http://localhost:4000'`). The `endpoint` option accepts both.
 *
 * `ScaniiTarget.AUTO` (latency-based routing at `https://api.scanii.com`) is
 * intentionally not provided — customer data residency / chain-of-custody
 * compliance requires an explicit regional choice.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 */
export const ScaniiTarget = {
  US1: 'https://api-us1.scanii.com',
  EU1: 'https://api-eu1.scanii.com',
  EU2: 'https://api-eu2.scanii.com',
  AP1: 'https://api-ap1.scanii.com',
  AP2: 'https://api-ap2.scanii.com',
  CA1: 'https://api-ca1.scanii.com',
} as const;

export type ScaniiTarget = (typeof ScaniiTarget)[keyof typeof ScaniiTarget];
