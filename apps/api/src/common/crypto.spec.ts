import { decryptSecret, encryptSecret, last4 } from './crypto';

describe('crypto (AES-256-GCM secret encryption)', () => {
  // getKey() reads ENCRYPTION_KEY at call time (encrypt/decrypt), so setting it
  // before the tests run is sufficient. Must be 16+ chars; use a 32+ char value.
  const previousKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789-abcdef';
  });

  afterAll(() => {
    if (previousKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = previousKey;
    }
  });

  describe('encryptSecret / decryptSecret', () => {
    it('round-trips a secret back to the original plaintext', () => {
      const plaintext = 'sk-super-secret-provider-key-42';
      const encrypted = encryptSecret(plaintext);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });

    it('round-trips unicode and empty strings', () => {
      for (const plaintext of ['', 'ünîçödë 🔐 secret', 'a']) {
        expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
      }
    });

    it('produces ciphertext that differs from the plaintext', () => {
      const plaintext = 'plaintext-value';
      const { ciphertext } = encryptSecret(plaintext);
      expect(ciphertext).not.toBe(plaintext);
      expect(ciphertext).not.toContain(plaintext);
    });

    it('includes a base64 iv and authTag in the payload', () => {
      const encrypted = encryptSecret('another-secret');
      expect(typeof encrypted.iv).toBe('string');
      expect(encrypted.iv.length).toBeGreaterThan(0);
      expect(typeof encrypted.authTag).toBe('string');
      expect(encrypted.authTag.length).toBeGreaterThan(0);
      // A 12-byte IV and 16-byte GCM tag encode to fixed base64 lengths.
      expect(Buffer.from(encrypted.iv, 'base64')).toHaveLength(12);
      expect(Buffer.from(encrypted.authTag, 'base64')).toHaveLength(16);
    });

    it('uses a fresh random iv per call (same plaintext -> different ciphertext)', () => {
      const a = encryptSecret('repeat-me');
      const b = encryptSecret('repeat-me');
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it('throws when the authTag has been tampered with', () => {
      const encrypted = encryptSecret('integrity-protected');
      const tag = Buffer.from(encrypted.authTag, 'base64');
      tag[0] ^= 0xff; // flip a bit so authentication must fail
      const tampered = { ...encrypted, authTag: tag.toString('base64') };
      expect(() => decryptSecret(tampered)).toThrow();
    });

    it('throws when the ciphertext has been tampered with', () => {
      const encrypted = encryptSecret('integrity-protected');
      const ct = Buffer.from(encrypted.ciphertext, 'base64');
      ct[0] ^= 0xff;
      const tampered = { ...encrypted, ciphertext: ct.toString('base64') };
      expect(() => decryptSecret(tampered)).toThrow();
    });
  });

  describe('key rotation (ENCRYPTION_KEY_OLD fallback)', () => {
    const OLD = 'old-encryption-key-0123456789-abcdefghij';
    const NEW = 'new-encryption-key-9876543210-zyxwvutsrq';

    afterEach(() => {
      delete process.env.ENCRYPTION_KEY_OLD;
      process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789-abcdef';
    });

    it('decrypts an old-key secret after rotating, via the OLD fallback', () => {
      process.env.ENCRYPTION_KEY = OLD;
      const encrypted = encryptSecret('sk-rotate-me');
      // Rotate: new key becomes current, old key becomes the fallback.
      process.env.ENCRYPTION_KEY = NEW;
      process.env.ENCRYPTION_KEY_OLD = OLD;
      expect(decryptSecret(encrypted)).toBe('sk-rotate-me');
    });

    it('fails to decrypt an old-key secret when no OLD fallback is set', () => {
      process.env.ENCRYPTION_KEY = OLD;
      const encrypted = encryptSecret('sk-rotate-me');
      process.env.ENCRYPTION_KEY = NEW; // no ENCRYPTION_KEY_OLD
      expect(() => decryptSecret(encrypted)).toThrow();
    });

    it('re-encrypting under the new key lets the OLD key be dropped', () => {
      process.env.ENCRYPTION_KEY = OLD;
      const encrypted = encryptSecret('sk-rotate-me');
      // Migrate exactly as the re-encrypt script does: decrypt (OLD fallback) then
      // re-encrypt under the new current key.
      process.env.ENCRYPTION_KEY = NEW;
      process.env.ENCRYPTION_KEY_OLD = OLD;
      const migrated = encryptSecret(decryptSecret(encrypted));
      // Now OLD can go away and the secret still decrypts.
      delete process.env.ENCRYPTION_KEY_OLD;
      expect(decryptSecret(migrated)).toBe('sk-rotate-me');
    });
  });

  describe('last4', () => {
    it('returns the last 4 characters of a longer secret', () => {
      expect(last4('sk-1234abcd')).toBe('abcd');
    });

    it('returns the whole string when it is 4 characters or fewer', () => {
      expect(last4('abcd')).toBe('abcd');
      expect(last4('ab')).toBe('ab');
      expect(last4('')).toBe('');
    });
  });
});
