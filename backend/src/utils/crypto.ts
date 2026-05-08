import crypto from 'crypto';
import { assertTokenEncryptionKey, env } from '../config/env.js';

export const hashIp = (ip: string) => crypto.createHash('sha256').update(ip).digest('hex');

const ivLen = 12;

const getKey = () => {
  assertTokenEncryptionKey();
  return Buffer.from(env.tokenKey, 'hex');
};

export const encryptSecret = (value: string) => {
  const iv = crypto.randomBytes(ivLen);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptSecret = (payload: string) => {
  const [ivHex, tagHex, encryptedHex] = payload.split(':');
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('invalid_encrypted_payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
};
