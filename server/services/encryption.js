const crypto = require('crypto');

const DEV_SEED = 'doc-controller-local-dev-key';

function deriveKey() {
  const configured = process.env.LOCAL_ENCRYPTION_KEY;
  const seed = configured || DEV_SEED;
  if (!configured) {
    console.warn('LOCAL_ENCRYPTION_KEY not set; using dev fallback (not for production).');
  }
  return crypto.createHash('sha256').update(String(seed)).digest();
}

const key = deriveKey();

function encryptValue(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

function decryptValue(encryptedValue, ivB64, authTagB64) {
  if (!encryptedValue || !ivB64 || !authTagB64) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = { encryptValue, decryptValue };
