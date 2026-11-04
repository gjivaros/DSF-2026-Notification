import { randomBytes } from 'node:crypto';
import { decryptText, encryptText, hmacSha256Hex, safeEqual, sha256 } from './crypto';

describe('crypto', () => {
  const key = randomBytes(32).toString('hex');

  it('encrypts and decrypts a text', () => {
    const payload = encryptText('Votre code est 123456', key);
    expect(payload).not.toContain('123456');
    expect(decryptText(payload, key)).toBe('Votre code est 123456');
  });

  it('uses a random IV for each encryption', () => {
    expect(encryptText('same', key)).not.toBe(encryptText('same', key));
  });

  it('fails to decrypt with another key', () => {
    const payload = encryptText('secret', key);
    expect(() => decryptText(payload, randomBytes(32).toString('hex'))).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => encryptText('secret', 'abcd')).toThrow();
  });

  it('computes deterministic hashes', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hmacSha256Hex('body', 'secret')).toBe(hmacSha256Hex('body', 'secret'));
    expect(hmacSha256Hex('body', 'secret')).not.toBe(hmacSha256Hex('body', 'other'));
  });

  it('compares strings safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
