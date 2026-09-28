const encoder = new TextEncoder();
export function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function sameSecret(a: string, b: string) {
  // Constant-length, constant-time verification via Web Crypto.
  const key = await crypto.subtle.importKey('raw', encoder.encode(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(a));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(b));
}
async function encryptionKey(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw new Error('Encryption key must contain 32 hex-encoded bytes');
  const bytes = Uint8Array.from(secret.match(/../g)!, value => parseInt(value, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(value: unknown, secret: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await encryptionKey(secret), encoder.encode(JSON.stringify(value)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(ciphertext)))}`;
}
export async function unseal<T>(value: string, secret: string, context: string): Promise<T> {
  const [iv, ciphertext] = value.split('.').map(part => Uint8Array.from(atob(part), c => c.charCodeAt(0)));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await encryptionKey(secret), ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
