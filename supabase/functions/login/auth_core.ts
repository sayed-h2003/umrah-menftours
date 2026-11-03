// أدوات الدخول بلا اعتماديات (WebCrypto فقط) — تعمل في Deno (Supabase Edge) وNode 22
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer)).map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array((s.match(/../g) || []).map(h => parseInt(h, 16)));
const b64u = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? enc.encode(b) : new Uint8Array(b as ArrayBuffer);
  let s = ''; bytes.forEach(c => s += String.fromCharCode(c));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function sha256Hex(s: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
const PBKDF2_ITER = 120000;
export async function pbkdf2(plain: string, saltHex: string, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: iter }, key, 256));
}
export async function makeHash(plain: string): Promise<string> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2$${PBKDF2_ITER}$${salt}$${await pbkdf2(plain, salt, PBKDF2_ITER)}`;
}
/** يتحقق من كلمة المرور بصيغة البرنامج القديم (sha256 hex بلا ملح، أو نص عادي) أو الجديدة. upgrade=true ⇒ خزّن makeHash */
export async function verifyPassword(plain: string, stored: string): Promise<{ ok: boolean; upgrade: boolean }> {
  stored = String(stored ?? '');
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, h] = stored.split('$');
    return { ok: safeEq(await pbkdf2(plain, salt, parseInt(iter, 10)), h), upgrade: false };
  }
  if (/^[a-f0-9]{64}$/i.test(stored)) return { ok: safeEq(await sha256Hex(plain), stored.toLowerCase()), upgrade: true };
  return { ok: stored !== '' && safeEq(plain, stored), upgrade: stored !== '' && plain === stored };   // نص عادي قديم
}
export async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), body = b64u(JSON.stringify(claims));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${head}.${body}.${b64u(await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`)))}`;
}
/** صلاحيات الشيت: «admin,gl.view» أو JSON ⇒ مصفوفة */
export function parsePerms(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  const s = String(v ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch (_e) { /* نص */ } }
  return s.split(/[,،;|]/).map(x => x.trim()).filter(Boolean);
}
