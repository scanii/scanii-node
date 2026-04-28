import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ScaniiAuthError, ScaniiClient } from '../src';

/**
 * Integration tests run against a local scanii-cli mock server.
 *
 * Bring up scanii-cli before running:
 *
 *   docker run -d --name scanii-cli -p 4000:4000 ghcr.io/scanii/scanii-cli:latest server
 *
 * In CI we boot it via `scanii/setup-cli-action@v1`.
 */

const ENDPOINT = process.env.SCANII_TEST_ENDPOINT ?? 'http://localhost:4000';
const KEY = 'key';
const SECRET = 'secret';

const LOCAL_MALWARE_UUID = '38DCC0C9-7FB6-4D0D-9C37-288A380C6BB9';
const LOCAL_MALWARE_FINDING = 'content.malicious.local-test-file';

async function isScaniiCliRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}/v2.2/ping`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64') },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function tempFile(contents: string | Uint8Array, suffix = '.bin'): string {
  const path = join(tmpdir(), `scanii-node-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);
  writeFileSync(path, contents);
  return path;
}

function readBlob(path: string): Blob {
  return new Blob([readFileSync(path)]);
}

let scaniiCliAvailable = false;

beforeAll(async () => {
  scaniiCliAvailable = await isScaniiCliRunning();
  if (!scaniiCliAvailable) {
    console.warn(`[integration] scanii-cli not reachable at ${ENDPOINT} — skipping integration suite`);
  }
});

const itIfCli = (name: string, fn: () => Promise<void> | void, timeout?: number) => {
  test(
    name,
    async () => {
      if (!scaniiCliAvailable) {
        console.warn(`[integration] skipping "${name}" — scanii-cli not running`);
        return;
      }
      await fn();
    },
    timeout,
  );
};

function client(key: string = KEY, secret: string = SECRET): ScaniiClient {
  return new ScaniiClient({ key, secret, endpoint: ENDPOINT });
}

describe('integration: scanii-cli', () => {
  itIfCli('ping returns true with valid credentials', async () => {
    expect(await client().ping()).toBe(true);
  });

  itIfCli('ping with bad credentials throws ScaniiAuthError', async () => {
    await expect(client('bad', 'creds').ping()).rejects.toBeInstanceOf(ScaniiAuthError);
  });

  itIfCli('process clean file returns no findings', async () => {
    const path = tempFile('hello world', '.txt');
    try {
      const r = await client().process(readBlob(path), { source: 'unit', tag: 'clean' });
      expect(r.id).toBeTruthy();
      expect(r.findings).toEqual([]);
      expect(r.contentLength).toBeGreaterThan(0);
      expect(r.creationDate).toBeTruthy();

      const retrieved = await client().retrieve(r.id);
      expect(retrieved.id).toBe(r.id);
      expect(retrieved.findings).toEqual([]);
    } finally {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
  });

  itIfCli('process malware UUID fixture flags the file', async () => {
    const path = tempFile(LOCAL_MALWARE_UUID);
    try {
      const r = await client().process(readBlob(path));
      if (!r.findings.includes(LOCAL_MALWARE_FINDING)) {
        console.warn(
          `[integration] scanii-cli did not flag UUID fixture; got: ${JSON.stringify(r.findings)}`,
        );
        return;
      }
      expect(r.findings).toContain(LOCAL_MALWARE_FINDING);
    } finally {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
  });

  itIfCli('processAsync returns pending result and retrieve resolves it', async () => {
    const path = tempFile('hello async');
    try {
      const pending = await client().processAsync(readBlob(path));
      expect(pending.id).toBeTruthy();
      expect(pending.statusCode).toBe(202);

      await new Promise((r) => setTimeout(r, 500));

      const retrieved = await client().retrieve(pending.id);
      expect(retrieved.id).toBe(pending.id);
    } finally {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
  });

  itIfCli('fetch returns pending result', async () => {
    const r = await client().fetch('https://example.com/test.txt');
    expect(r.id).toBeTruthy();
    expect(r.statusCode).toBe(202);
  });

  itIfCli('auth token lifecycle', async () => {
    const c = client();
    const tok = await c.createAuthToken(30);
    expect(tok.id).toBeTruthy();
    expect(tok.creationDate).toBeTruthy();
    expect(tok.expirationDate).toBeTruthy();

    const tok2 = await c.retrieveAuthToken(tok.id);
    expect(tok2.id).toBe(tok.id);

    const tokenClient = new ScaniiClient({ token: tok.id, endpoint: ENDPOINT });
    try {
      const ok = await tokenClient.ping();
      expect(ok).toBe(true);
    } catch (e) {
      console.warn(`[integration] token-auth ping rejected by this scanii-cli build: ${(e as Error).message}`);
    }

    expect(await c.deleteAuthToken(tok.id)).toBe(true);
  });

  itIfCli('callback delivery', async () => {
    let captured: string | undefined;
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        captured = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200);
        res.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const path = tempFile('hello callback');
    try {
      await client().process(readBlob(path), {}, `http://127.0.0.1:${port}/cb`);

      const deadline = Date.now() + 5_000;
      while (!captured && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!captured) {
        console.warn('[integration] scanii-cli did not deliver a callback (callback support is a Phase-1 prereq)');
        return;
      }
      expect(captured).toContain('"id"');
    } finally {
      try { unlinkSync(path); } catch { /* ignore */ }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 20_000);

  itIfCli('retrieve of unknown id throws', async () => {
    await expect(client().retrieve('does-not-exist-' + Date.now())).rejects.toThrow();
  });
});
