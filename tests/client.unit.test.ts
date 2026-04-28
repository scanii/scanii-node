import { ScaniiAuthError, ScaniiClient, ScaniiError, ScaniiRateLimitError } from '../src';

type FetchSpy = jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

function mockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  // 204 / 304 require null body per the Fetch spec.
  const init: ResponseInit = { status, headers };
  return new Response(status === 204 || status === 304 ? null : body, init);
}

function mockOnce(
  fetchSpy: FetchSpy,
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  fetchSpy.mockImplementationOnce(async () => mockResponse(status, body, headers));
}

describe('ScaniiClient construction', () => {
  test('rejects empty key', () => {
    expect(() => new ScaniiClient({ key: '', secret: 's' })).toThrow(/key must not be empty/);
  });

  test('rejects key containing a colon', () => {
    expect(() => new ScaniiClient({ key: 'a:b', secret: 's' })).toThrow(/colon/);
  });

  test('rejects mixing token + key', () => {
    expect(() => new ScaniiClient({ key: 'k', secret: 's', token: 't' })).toThrow(/either/);
  });

  test('rejects undefined secret with key', () => {
    expect(() => new ScaniiClient({ key: 'k' })).toThrow(/secret must not be undefined/);
  });

  test('accepts empty-string secret (mock cli credentials are empty-secret-friendly via key)', () => {
    expect(() => new ScaniiClient({ key: 'k', secret: '' })).not.toThrow();
  });

  test('accepts token alone', () => {
    expect(() => new ScaniiClient({ token: 'tok' })).not.toThrow();
  });

  test('rejects empty token', () => {
    expect(() => new ScaniiClient({ token: '' })).toThrow();
  });
});

describe('ScaniiClient request shape', () => {
  let fetchSpy: FetchSpy;
  let client: ScaniiClient;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as FetchSpy;
    client = new ScaniiClient({
      key: 'mykey',
      secret: 'mysecret',
      endpoint: 'http://localhost:4000',
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('process sends POST /v2.2/files with auth + UA + multipart', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(
        201,
        JSON.stringify({
          id: 'abc',
          findings: [],
          checksum: 'sha1',
          content_length: 5,
          content_type: 'text/plain',
          metadata: {},
          creation_date: '2024-01-01T00:00:00Z',
        }),
        { 'x-scanii-request-id': 'req-1', 'x-scanii-host-id': 'host-1' },
      ),
    );

    const result = await client.process(new Blob(['hello']));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/v2.2/files');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Basic ' + Buffer.from('mykey:mysecret').toString('base64'));
    expect(headers['User-Agent']).toMatch(/^scanii-node\//);
    expect((init as RequestInit).body).toBeInstanceOf(FormData);

    expect(result.id).toBe('abc');
    expect(result.findings).toEqual([]);
    expect(result.contentLength).toBe(5);
    expect(result.contentType).toBe('text/plain');
    expect(result.requestId).toBe('req-1');
    expect(result.hostId).toBe('host-1');
    expect(result.statusCode).toBe(201);
  });

  test('process forwards metadata + callback as form fields', async () => {
    fetchSpy.mockResolvedValue(mockResponse(201, JSON.stringify({ id: 'x', findings: [] })));

    await client.process(new Blob(['hi']), { source: 'unit', tag: 'v1' }, 'https://example.com/cb');

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('metadata[source]')).toBe('unit');
    expect(form.get('metadata[tag]')).toBe('v1');
    expect(form.get('callback')).toBe('https://example.com/cb');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  test('processAsync expects 202', async () => {
    fetchSpy.mockResolvedValue(mockResponse(202, JSON.stringify({ id: 'pending-1' })));
    const r = await client.processAsync(new Blob(['hi']));
    expect(r.id).toBe('pending-1');
    expect(r.statusCode).toBe(202);
  });

  test('fetch sends form-encoded body to /files/fetch', async () => {
    fetchSpy.mockResolvedValue(mockResponse(202, JSON.stringify({ id: 'pending-2' })));

    await client.fetch('https://example.com/file.txt', { src: 'web' }, 'https://example.com/cb');

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(init.body as string);
    expect(params.get('location')).toBe('https://example.com/file.txt');
    expect(params.get('callback')).toBe('https://example.com/cb');
    expect(params.get('metadata[src]')).toBe('web');
  });

  test('retrieve sends GET /v2.2/files/{id}', async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, JSON.stringify({ id: 'r1', findings: [] })));
    const r = await client.retrieve('r1');
    expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:4000/v2.2/files/r1');
    expect(r.id).toBe('r1');
  });

  test('retrieve URL-encodes the id', async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, JSON.stringify({ id: 'a/b', findings: [] })));
    await client.retrieve('a/b');
    expect(fetchSpy.mock.calls[0]![0]).toBe('http://localhost:4000/v2.2/files/a%2Fb');
  });

  test('ping returns true on 200', async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, JSON.stringify({ message: 'pong' })));
    await expect(client.ping()).resolves.toBe(true);
  });

  test('createAuthToken sends timeout form field', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(
        201,
        JSON.stringify({ id: 'tok-1', creation_date: '2024-01-01', expiration_date: '2024-01-02' }),
      ),
    );
    const tok = await client.createAuthToken(60);
    expect(tok.id).toBe('tok-1');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(new URLSearchParams(init.body as string).get('timeout')).toBe('60');
  });

  test('createAuthToken rejects non-positive timeout', async () => {
    await expect(client.createAuthToken(0)).rejects.toThrow(/positive/);
  });

  test('deleteAuthToken sends DELETE and returns true on 204', async () => {
    fetchSpy.mockResolvedValue(mockResponse(204, ''));
    await expect(client.deleteAuthToken('tok-1')).resolves.toBe(true);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('DELETE');
  });
});

describe('ScaniiClient error mapping', () => {
  let fetchSpy: FetchSpy;
  let client: ScaniiClient;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as FetchSpy;
    client = new ScaniiClient({ key: 'k', secret: 's', endpoint: 'http://localhost:4000' });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('401 throws ScaniiAuthError', async () => {
    mockOnce(fetchSpy, 401, JSON.stringify({ error: 'bad credentials' }), {
      'x-scanii-request-id': 'req-401',
    });
    try {
      await client.ping();
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ScaniiAuthError);
      const err = e as ScaniiAuthError;
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('bad credentials');
      expect(err.requestId).toBe('req-401');
    }
  });

  test('429 throws ScaniiRateLimitError with retryAfter', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(429, JSON.stringify({ error: 'slow down' }), { 'retry-after': '12' }),
    );
    try {
      await client.ping();
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ScaniiRateLimitError);
      const err = e as ScaniiRateLimitError;
      expect(err.statusCode).toBe(429);
      expect(err.retryAfter).toBe(12);
    }
  });

  test('500 throws plain ScaniiError', async () => {
    fetchSpy.mockResolvedValue(mockResponse(500, 'internal'));
    try {
      await client.ping();
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ScaniiError);
      expect(e).not.toBeInstanceOf(ScaniiAuthError);
      expect(e).not.toBeInstanceOf(ScaniiRateLimitError);
      const err = e as ScaniiError;
      expect(err.statusCode).toBe(500);
      expect(err.message).toBe('internal');
    }
  });

  test('transport failure wraps as ScaniiError with cause', async () => {
    fetchSpy.mockRejectedValue(new TypeError('net down'));
    try {
      await client.ping();
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ScaniiError);
      expect((e as ScaniiError).message).toMatch(/transport error: net down/);
    }
  });
});

describe('User-Agent header', () => {
  test('reflects SDK version', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch') as FetchSpy;
    fetchSpy.mockResolvedValue(mockResponse(200, JSON.stringify({ message: 'pong' })));
    const client = new ScaniiClient({ key: 'k', secret: 's', endpoint: 'http://localhost:4000' });
    await client.ping();
    const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    // Either build-time SCANII_VERSION (1.0.0 once tsup defines it) or fallback for ts-jest.
    expect(headers['User-Agent']).toMatch(/^scanii-node\/\d+\.\d+\.\d+/);
    fetchSpy.mockRestore();
  });

  test('caller-supplied user-agent prepended', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch') as FetchSpy;
    fetchSpy.mockResolvedValue(mockResponse(200, JSON.stringify({ message: 'pong' })));
    const client = new ScaniiClient({
      key: 'k',
      secret: 's',
      endpoint: 'http://localhost:4000',
      userAgent: 'my-app/2.3',
    });
    await client.ping();
    const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^my-app\/2\.3 scanii-node\//);
    fetchSpy.mockRestore();
  });
});
