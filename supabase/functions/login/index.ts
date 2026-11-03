// Edge Function «login» — يتحقق من المستخدم بجدول app_users ويصدر JWT يقرؤه Postgres (RLS)
// النشر:  supabase functions deploy login --no-verify-jwt
// الأسرار: supabase secrets set APP_JWT_SECRET=<JWT Secret من Settings→API> ALLOWED_ORIGIN=https://موقعك
import { createClient } from 'npm:@supabase/supabase-js@2';
import { makeHash, parsePerms, signJwt, verifyPassword } from './auth_core.ts';

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
