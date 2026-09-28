import { randomBytes } from 'crypto';
import { JsonCipher } from './cipher';

describe('JsonCipher', () => {
  const cipher = new JsonCipher(randomBytes(32).toString('base64url'));
  const value = { note: 'Пацієнтка', n: [1, 2, 3] };

  it('round-trips JSON and hides the plaintext', () => {
    const payload = cipher.encrypt(value);
    expect(payload.toString('utf8')).not.toContain('note');
    expect(cipher.decrypt(payload)).toEqual(value);
  });

  it('uses a fresh IV every time', () => {
    expect(cipher.encrypt(value).equals(cipher.encrypt(value))).toBe(false);
  });

  it('rejects tampered payloads and other keys', () => {
    const payload = cipher.encrypt(value);
    payload[payload.length - 1] ^= 1;
    expect(() => cipher.decrypt(payload)).toThrow();

    const other = new JsonCipher(randomBytes(32).toString('base64url'));
    expect(() => other.decrypt(cipher.encrypt(value))).toThrow();
  });

  it('accepts standard base64 keys too', () => {
    const key = randomBytes(32);
    const a = new JsonCipher(key.toString('base64'));
    const b = new JsonCipher(key.toString('base64url'));
    expect(b.decrypt(a.encrypt(value))).toEqual(value);
  });

  it('requires a 32-byte key', () => {
    expect(
      () => new JsonCipher(randomBytes(16).toString('base64url')),
    ).toThrow();
  });
});
