const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SALT = 'voting-offline-salt-2026';

async function deriveKey(password) {
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: 120000,
      hash: 'SHA-256'
    },
    passphraseKey,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(arrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function encryptVoteData(plaintext, password) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password);
  const encoded = encoder.encode(JSON.stringify(plaintext));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return JSON.stringify({
    iv: toBase64(iv),
    ciphertext: toBase64(cipherBuffer)
  });
}

export async function decryptVoteData(encryptedText, password) {
  const payload = JSON.parse(encryptedText);
  const key = await deriveKey(password);
  const iv = new Uint8Array(fromBase64(payload.iv));
  const cipherBuffer = fromBase64(payload.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBuffer
  );

  return JSON.parse(decoder.decode(decrypted));
}
