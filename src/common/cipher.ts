import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** AES-256-GCM for small JSON payloads: output is iv | tag | ciphertext. */
export class JsonCipher {
  private readonly key: Buffer;

  /** Accepts base64 or base64url (Node's base64 decoder reads both). */
  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (base64)');
    }
  }

  encrypt(value: unknown): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  decrypt<T>(payload: Buffer): T {
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(json) as T;
  }
}
