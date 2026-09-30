import { BadRequestException } from '@nestjs/common';
import { assertSafeWebhookUrl, isBlockedHost } from './url-guard';

// All cases below use IP literals or the name "localhost" so the guard never
// performs a DNS lookup — the tests are fully deterministic and need no network.

describe('assertSafeWebhookUrl (SSRF guard)', () => {
  const original = process.env.WEBHOOK_ALLOW_PRIVATE;

  afterAll(() => {
    if (original === undefined) {
      delete process.env.WEBHOOK_ALLOW_PRIVATE;
    } else {
      process.env.WEBHOOK_ALLOW_PRIVATE = original;
    }
  });

  describe('with private addresses blocked (WEBHOOK_ALLOW_PRIVATE unset)', () => {
    beforeEach(() => {
      delete process.env.WEBHOOK_ALLOW_PRIVATE;
    });

    it.each([
      ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
      ['IPv4 loopback', 'http://127.0.0.1'],
      ['private 10.0.0.0/8', 'http://10.0.0.5'],
      ['private 192.168.0.0/16', 'http://192.168.1.1'],
      ['IPv6 loopback', 'http://[::1]/'],
      ['localhost by name', 'http://localhost'],
    ])('rejects %s (%s)', async (_label, url) => {
      await expect(assertSafeWebhookUrl(url)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a non-http(s) scheme (ftp://)', async () => {
      await expect(
        assertSafeWebhookUrl('ftp://example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a completely malformed URL', async () => {
      await expect(assertSafeWebhookUrl('not a url')).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each([
      ['http', 'http://93.184.216.34'],
      ['https', 'https://93.184.216.34'],
    ])('resolves for a public IP literal over %s', async (_label, url) => {
      await expect(assertSafeWebhookUrl(url)).resolves.toBeUndefined();
    });
  });

  describe('with WEBHOOK_ALLOW_PRIVATE=1 (local-dev escape hatch)', () => {
    beforeEach(() => {
      process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    });
    afterEach(() => {
      delete process.env.WEBHOOK_ALLOW_PRIVATE;
    });

    it('no longer rejects a private/loopback address', async () => {
      await expect(
        assertSafeWebhookUrl('http://127.0.0.1'),
      ).resolves.toBeUndefined();
    });

    it('still rejects a non-http(s) scheme (ftp://)', async () => {
      await expect(
        assertSafeWebhookUrl('ftp://127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

describe('isBlockedHost', () => {
  // isBlockedHost never consults WEBHOOK_ALLOW_PRIVATE; set it to prove the
  // classification is unaffected by the escape hatch.
  const original = process.env.WEBHOOK_ALLOW_PRIVATE;

  beforeAll(() => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
  });
  afterAll(() => {
    if (original === undefined) {
      delete process.env.WEBHOOK_ALLOW_PRIVATE;
    } else {
      process.env.WEBHOOK_ALLOW_PRIVATE = original;
    }
  });

  it.each([
    ['IPv4 loopback', '127.0.0.1'],
    ['cloud metadata', '169.254.169.254'],
    ['private 10.0.0.0/8', '10.0.0.5'],
    ['private 192.168.0.0/16', '192.168.1.1'],
    ['localhost', 'localhost'],
    ['IPv6 loopback', '::1'],
  ])('returns a reason for a blocked host: %s', async (_label, host) => {
    const reason = await isBlockedHost(host);
    expect(reason).toBeTruthy();
    expect(typeof reason).toBe('string');
  });

  it('returns null for a public IP literal', async () => {
    await expect(isBlockedHost('93.184.216.34')).resolves.toBeNull();
  });
});
