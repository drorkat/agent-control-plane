import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Secret encryption for BYOK provider keys. AES-256-GCM with a key derived
 * (SHA-256) from ENCRYPTION_KEY (falling back to AUTH_SECRET). The plaintext
 * key is only ever decrypted at tool-execution time and never logged, stored,
 * or returned by the API.
 *
 * Key rotation: new secrets are always encrypted under the current key, but
 * {@link decryptSecret} also accepts ENCRYPTION_KEY_OLD as a fallback. So an
 * operator rotates by setting ENCRYPTION_KEY=<new> and ENCRYPTION_KEY_OLD=<old>
 * — nothing breaks, and the re-encrypt maintenance script migrates every stored
 * secret to the new key so the OLD value can then be dropped.
 */

/** Derive the 32-byte AES key from a secret string. */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest(); // 32 bytes
}

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY (or AUTH_SECRET) must be set to a strong secret (16+ chars) to store provider keys',
    );
  }
  return deriveKey(secret);
}

/** The previous key during a rotation, or null when ENCRYPTION_KEY_OLD is unset. */
function getOldKey(): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY_OLD;
  if (!secret || secret.length < 16) {
    return null;
  }
  return deriveKey(secret);
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/** Decrypt with a specific key. Throws on a wrong key (GCM auth tag mismatch). */
function decryptWith(key: Buffer, payload: EncryptedSecret): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

export function decryptSecret(payload: EncryptedSecret): string {
  try {
    return decryptWith(getKey(), payload);
  } catch (err) {
    // The secret may still be under the previous key mid-rotation. Fall back to
    // ENCRYPTION_KEY_OLD when set, so changing ENCRYPTION_KEY never bricks stored
    // secrets; the re-encrypt script migrates them to the new key.
    const oldKey = getOldKey();
    if (oldKey) {
      try {
        return decryptWith(oldKey, payload);
      } catch {
        // fall through and throw the original (current-key) error
      }
    }
    throw err;
  }
}

/** Last 4 characters of a secret, for masked display (e.g. "…a1b2"). */
export function last4(secret: string): string {
  return secret.length <= 4 ? secret : secret.slice(-4);
}
