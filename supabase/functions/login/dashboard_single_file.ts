// Edge Function «login» — يتحقق من المستخدم بجدول app_users ويصدر JWT يقرؤه Postgres (RLS)
// النشر:  supabase functions deploy login --no-verify-jwt
// الأسرار: supabase secrets set APP_JWT_SECRET=<JWT Secret من Settings→API> ALLOWED_ORIGIN=https://موقعك
import { createClient } from 'npm:@supabase/supabase-js@2';

// أدوات الدخول بلا اعتماديات (WebCrypto فقط) — تعمل في Deno (Supabase Edge) وNode 22
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer)).map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array((s.match(/../g) || []).map(h => parseInt(h, 16)));
const b64u = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? enc.encode(b) : new Uint8Array(b as ArrayBuffer);
  let s = ''; bytes.forEach(c => s += String.fromCharCode(c));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sha256Hex(s: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
const PBKDF2_ITER = 120000;
async function pbkdf2(plain: string, saltHex: string, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: iter }, key, 256));
}
async function makeHash(plain: string): Promise<string> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2$${PBKDF2_ITER}$${salt}$${await pbkdf2(plain, salt, PBKDF2_ITER)}`;
}
/** يتحقق من كلمة المرور بصيغة البرنامج القديم (sha256 hex بلا ملح، أو نص عادي) أو الجديدة. upgrade=true ⇒ خزّن makeHash */
async function verifyPassword(plain: string, stored: string): Promise<{ ok: boolean; upgrade: boolean }> {
  stored = String(stored ?? '');
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, h] = stored.split('$');
    return { ok: safeEq(await pbkdf2(plain, salt, parseInt(iter, 10)), h), upgrade: false };
  }
  if (/^[a-f0-9]{64}$/i.test(stored)) return { ok: safeEq(await sha256Hex(plain), stored.toLowerCase()), upgrade: true };
  return { ok: stored !== '' && safeEq(plain, stored), upgrade: stored !== '' && plain === stored };   // نص عادي قديم
}
async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), body = b64u(JSON.stringify(claims));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${head}.${body}.${b64u(await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`)))}`;
}
/** صلاحيات الشيت: «admin,gl.view» أو JSON ⇒ مصفوفة */
function parsePerms(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  const s = String(v ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch (_e) { /* نص */ } }
  return s.split(/[,،;|]/).map(x => x.trim()).filter(Boolean);
}

const TTL_SEC = 8 * 3600, MAX_FAILS = 8, WINDOW_MIN = 10;
const origin = Deno.env.get('ALLOWED_ORIGIN') || '*';
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const BAD = 'بيانات الدخول غير صحيحة';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const secret = Deno.env.get('APP_JWT_SECRET');
  if (!secret) return json({ ok: false, error: 'الخادم غير مُهيّأ' }, 500);
  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: BAD }, 400); }
  const username = String(body.username ?? '').trim(), password = String(body.password ?? '');
  if (!username || !password || username.length > 100 || password.length > 200) return json({ ok: false, error: BAD }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const { count } = await db.from('login_attempts').select('id', { count: 'exact', head: true }).eq('username', username).eq('ok', false).gte('at', since);
  if ((count ?? 0) >= MAX_FAILS) return json({ ok: false, error: 'محاولات كثيرة — حاول بعد عشر دقائق' }, 429);

  const { data: u } = await db.from('app_users').select('username, full_name, password_hash, active, permissions, must_change_pwd').eq('username', username).maybeSingle();
  let ok = false, upgrade = false;
  if (u && u.active !== false) { const r = await verifyPassword(password, u.password_hash); ok = r.ok; upgrade = r.upgrade; }
  else await verifyPassword(password, 'x'.repeat(64));   // زمن متقارب لمستخدم غير موجود
  await db.from('login_attempts').insert({ username, ok });
  if (!ok || !u) return json({ ok: false, error: BAD }, 401);

  if (upgrade) await db.from('app_users').update({ password_hash: await makeHash(password) }).eq('username', u.username);
  const perms = parsePerms(u.permissions), now = Math.floor(Date.now() / 1000), exp = now + TTL_SEC;
  const token = await signJwt({ role: 'authenticated', aud: 'authenticated', sub: u.username, app_user: u.username, perms, iat: now, exp }, secret);
  return json({ ok: true, token, expiresAt: exp * 1000, username: u.username, fullName: u.full_name || '', permissions: perms, mustChangePwd: !!u.must_change_pwd });
});
