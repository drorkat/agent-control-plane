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
 */

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY (or AUTH_SECRET) must be set to a strong secret (16+ chars) to store provider keys',
    );
  }
  return createHash('sha256').update(secret).digest(); // 32 bytes
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

export function decryptSecret(payload: EncryptedSecret): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** Last 4 characters of a secret, for masked display (e.g. "…a1b2"). */
export function last4(secret: string): string {
  return secret.length <= 4 ? secret : secret.slice(-4);
}
