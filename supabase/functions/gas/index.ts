// Edge Function «gas» — V4.445: تشغيل دوال Apps Script (نفس ملفات .gs) فوق Postgres بلا Apps Script.
// النشر:  node tools/build_gas_bundle.mjs && supabase functions deploy gas --no-verify-jwt
// الأسرار: APP_JWT_SECRET (نفس login) · ALLOWED_ORIGIN اختياري. SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY تلقائيان.
// الطلب: POST {fn, args} + Authorization: Bearer <JWT البرنامج>. الرد: {ok, d} أو {ok:false, error, unsupported}.
import { GasSession } from './runtime.mjs';
import { SRC } from './bundle.mjs';

const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origin = Deno.env.get('ALLOWED_ORIGIN') || '*';
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const SHARED_CACHE = new Map(), SNAP_CACHE = new Map();   // ذاكرة العامل بين الطلبات
const DENY = /^(do(Get|Post)|onOpen|onEdit|store(Cutover|Rollback)|supa(Sync|Write|Issue)|gl(StoreCutover|ShadowSync)|mg[A-Z]|setup|install|uninstall)/i, DENY_X = /^(login|logout|checkSession|hbSsoLogin|hbSupaToken)$/;

async function db(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args || {}) });
  const t = await r.text();
  if (!r.ok) throw new Error(`GAS_EDGE: ${fn} (${r.status}) ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function http(q: { m: string; p: string; b?: unknown; pref?: string }) {
  const h: Record<string, string> = { ...H }; if (q.pref) h.Prefer = q.pref;
  const r = await fetch(`${URL_}/rest/v1/${q.p}`, { method: q.m.toUpperCase(), headers: h, body: q.b === undefined || q.b === null ? undefined : JSON.stringify(q.b) });
  return { code: r.status, text: await r.text() };
}
async function ext(e: { url: string; opt: Record<string, any> }) {
  const o = e.opt || {}, h: Record<string, string> = Object.assign({}, o.headers || {});
  if (o.contentType) h['Content-Type'] = o.contentType;
  const r = await fetch(e.url, { method: String(o.method || 'get').toUpperCase(), headers: h, body: o.payload === undefined ? undefined : (typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload)) });
  return { code: r.status, text: await r.text() };
}
function b64u(s: string) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
async function verifyJwt(tok: string, secret: string) {
  // 1) تحقق محلي إن وُجد السر ونجح (سريع)
  try {
    const [h, p, sig] = tok.split('.');
    if (secret && h && p && sig) {
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.trim()), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      if (await crypto.subtle.verify('HMAC', k, b64u(sig), new TextEncoder().encode(h + '.' + p))) {
        const c = JSON.parse(new TextDecoder().decode(b64u(p)));
        if (c.app_user && !(c.exp && c.exp * 1000 < Date.now())) return c;
      }
    }
  } catch { /* ننتقل للتحقق عبر Supabase */ }
  // 2) PostgREST يتحقق من التوقيع بسر المشروع ويعيد هوية المستخدم (لا يلزم تطابق APP_JWT_SECRET)
  const r = await fetch(`${URL_}/rest/v1/rpc/gas_whoami`, { method: 'POST', headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') || KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) return null;
  const w = await r.json().catch(() => null);
  return w && w.user ? { app_user: w.user, perms: w.perms || [], hb: w.hb || null } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const claims = await verifyJwt(String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), Deno.env.get('APP_JWT_SECRET') || '').catch(() => null);
  if (!claims) return json({ ok: false, error: 'جلسة غير صالحة أو منتهية - يرجى تسجيل الدخول مرة أخرى' }, 401);
  let body: { fn?: string; args?: unknown[]; raw?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const fn = String(body.fn || '');
  if (!/^[A-Za-z][A-Za-z0-9]{2,60}$/.test(fn) || DENY.test(fn) || DENY_X.test(fn)) return json({ ok: false, error: 'دالة غير مسموحة: ' + fn, unsupported: true }, 400);
  const owner = crypto.randomUUID(), t0 = Date.now();
  let got = false;
  try {
    const secretKeys = { SUPA_URL: URL_, SUPA_SERVICE_KEY: KEY };
    const A = Array.isArray(body.args) ? body.args : [];   // raw: برنامج الحجوزات يرسل رمز جلسته بنفسه كأول معامل
    const args = body.raw ? A : [null].concat(A);
    const mk = async (ro: boolean) => {
      const props = Object.assign(await db('gas_props_all', {}), secretKeys);
      return new GasSession({ src: SRC, db, http, ext, props, cache: SHARED_CACHE, snapCache: SNAP_CACHE, tz: props.APP_TZ || 'Africa/Cairo', ro,
        session: { username: claims.app_user, permissions: (claims.perms || []).join(','), fullName: claims.app_user, hb: claims.hb || null }, log: (x: string) => console.log(x) });
    };
    // (V4.455) 1) قراءة بلا قفل (لا تنتظر الكتّاب ولا بعضها) · 2) أول محاولة كتابة ⇒ NEED_LEASE قبل أي أثر ⇒ إعادة التشغيل بقفل التأجير (كاتب واحد في وقت واحد — بديل LockService)
    let s = await mk(true), d;
    try { d = await s.run(fn, args); }
    catch (e0) {
      if (!(e0 && (e0 as { needLease?: boolean }).needLease)) throw e0;
      for (let i = 0; i < 40 && !got; i++) { got = await db('gas_lease_take', { p_name: 'gas', p_owner: owner, p_ttl_sec: 120 }); if (!got) await new Promise((r) => setTimeout(r, 500)); }
      if (!got) return json({ ok: false, error: 'الخادم مشغول — أعد المحاولة بعد لحظات', busy: true }, 503);
      s = await mk(false); d = await s.run(fn, args);
    }
    // خصائص السكربت التي تغيّرت ⇒ gas_props + صادر kvset لـ Apps Script (ما دام يعمل)
    const w = s.propW as Record<string, string | null>, put: Record<string, string> = {}, del: string[] = [];
    Object.keys(w).forEach((k) => { if (k in secretKeys) return; if (w[k] === null) del.push(k); else put[k] = w[k] as string; });
    if (Object.keys(put).length) await db('gas_props_put', { p: put });
    if (del.length) await db('gas_props_del', { p_keys: del });
    if (Object.keys(put).length || del.length) await http({ m: 'post', p: 'app_outbox', b: { kind: 'kvset', payload: { kv: Object.assign({}, put, Object.fromEntries(del.map((k) => [k, '']))) } } });
    return json({ ok: true, d: d === undefined ? null : d, ms: Date.now() - t0, runs: s.runs + 1, lease: got });
  } catch (e) {
    const m = String((e as Error)?.message || e);
    return json({ ok: false, error: m.replace(/^Error:\s*/, ''), unsupported: /GAS_EDGE_UNSUPPORTED|GAS_EDGE:/.test(m) }, 200);
  } finally { if (got) await db('gas_lease_drop', { p_name: 'gas', p_owner: owner }).catch(() => {}); }
});
