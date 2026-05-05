import { ScaniiClient, ScaniiTarget } from '../src';

describe('ScaniiTarget', () => {
  test('exposes the six regional URLs', () => {
    expect(ScaniiTarget.US1).toBe('https://api-us1.scanii.com');
    expect(ScaniiTarget.EU1).toBe('https://api-eu1.scanii.com');
    expect(ScaniiTarget.EU2).toBe('https://api-eu2.scanii.com');
    expect(ScaniiTarget.AP1).toBe('https://api-ap1.scanii.com');
    expect(ScaniiTarget.AP2).toBe('https://api-ap2.scanii.com');
    expect(ScaniiTarget.CA1).toBe('https://api-ca1.scanii.com');
  });

  test('does not expose an AUTO constant', () => {
    // Type assertion: AUTO must not exist on ScaniiTarget.
    // (Compile-time safety; runtime check belt-and-braces.)
    expect((ScaniiTarget as Record<string, string>).AUTO).toBeUndefined();
  });

  test('client construction with ScaniiTarget does not warn or throw', () => {
    // Any ScaniiTarget value satisfies endpoint?: string (it IS a string).
    expect(() => new ScaniiClient({ key: 'k', secret: 's', endpoint: ScaniiTarget.US1 })).not.toThrow();
  });

  test('client construction sends to the ScaniiTarget URL', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'pong' }), { status: 200 }),
    );
    const client = new ScaniiClient({ key: 'k', secret: 's', endpoint: ScaniiTarget.EU1 });
    await client.ping();
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toBe('https://api-eu1.scanii.com/v2.2/ping');
    fetchSpy.mockRestore();
  });
});
