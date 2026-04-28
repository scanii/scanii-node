/**
 * Short-lived auth token returned by {@link ScaniiClient.createAuthToken} and
 * {@link ScaniiClient.retrieveAuthToken}. Pass `id` as the `token` option to
 * the {@link ScaniiClient} constructor to authenticate with the token instead
 * of API key + secret — useful for browser-side usage.
 *
 * @see {@link https://scanii.github.io/openapi/v22/}
 */
export interface ScaniiAuthToken {
  readonly id: string;
  readonly creationDate: string | undefined;
  readonly expirationDate: string | undefined;
  readonly requestId: string | undefined;
  readonly hostId: string | undefined;
  readonly resourceLocation: string | undefined;
  readonly statusCode: number;
  readonly rawResponse: string;
}
