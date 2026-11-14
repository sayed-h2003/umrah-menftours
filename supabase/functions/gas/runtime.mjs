// بيئة تشغيل كود Apps Script (ملفات .gs كما هي) داخل Edge Function / Node — V4.445
// • الكود متزامن والشبكة غير متزامنة ⇒ «إعادة تشغيل بشريط مسجَّل»: كل نداء شبكة يُخدَم من لقطة محمَّلة مسبقاً، أو يُؤجَّل (كتابات طبقة التخزين:
//   ردّها معروف مسبقاً)، أو يُعلَّق التشغيل ⇒ يُنفَّذ النداء فعلاً ويُسجَّل ردّه ثم يُعاد التشغيل من البداية (حتمي: ساعة افتراضية + عشوائية بذرية).
// • كل تشغيل نسخة جديدة من الكود (لا حالة مشتركة بين الطلبات). الكتابات المؤجلة تُنفَّذ بالترتيب بعد نجاح التشغيل.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { gzipSync, gunzipSync } from 'node:zlib';

class Suspend { constructor(kind, data) { this.kind = kind; this.data = data; this.__gasSuspend = true; } }
const SUSP = (e) => e && e.__gasSuspend;
// (V4.455) تشغيل «قراءة فقط» بلا قفل: أول محاولة كتابة (مؤجلة/خاصية/طلب غير معروف/نداء خارجي) ⇒ NEED_LEASE قبل أي أثر ⇒ يعاد التشغيل بالقفل
const NEED_LEASE = 'GAS_NEED_LEASE';
const READ_RPC_RX = /^rpc\/(cs_get|store_read|gl_entry_ver_raw|gas_whoami|gas_snapshot|gas_gl_rows|gas_hb_snap|gas_props_all|rx_\w+|app_kv_get\w*)$/;
// (V4.462) نداءات خارجية للقراءة فقط مسموحة بلا قفل: سحب تحديثات تليجرام (لا يتقدّم offset إلا بنداء لاحق بعد حفظه) وفحص الحالة
const READ_EXT_RX = /^https:\/\/api\.telegram\.org\/bot[^/]+\/(getUpdates|getWebhookInfo|getMe|getChat)\b/;
const needLease = (why) => { const e = new Error(NEED_LEASE + ': ' + why); e.needLease = true; return e; };

// ---------- أدوات ----------
function prng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function tzName(tz) { const m = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(String(tz || '')); if (m && !m[3]) return 'Etc/GMT' + (m[1] === '+' ? '-' : '+') + (+m[2]); return tz || 'Africa/Cairo'; }
function parts(d, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tzName(tz), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const o = {}; for (const p of f.formatToParts(d)) o[p.type] = p.value; return o;
}
// (V4.455) التوقيت المحلي = منطقة السكربت (كما في Apps Script) بدل UTC بيئة Edge: إزاحة المنطقة عند لحظة ما + تحويل «وقت محلي» ⇒ لحظة
function tzKit(tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tzName(tz), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const C = new Map(), Q = 900000;
  const off = (ms) => {
    if (!isFinite(ms)) return 0;
    const k = Math.floor(ms / Q); let v = C.get(k);
    if (v === undefined) { const o = {}; for (const p of f.formatToParts(new Date(k * Q))) o[p.type] = p.value; const u = new Date(0); u.setUTCFullYear(+o.year, +o.month - 1, +o.day); u.setUTCHours(+o.hour % 24, +o.minute, +o.second, 0); v = u.getTime() - k * Q; C.set(k, v); }
    return v;
  };
  const fromLocal = (L) => { if (!isFinite(L)) return NaN; const o1 = off(L - off(L)); return L - o1; };
  return { off, fromLocal };
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
function formatDate(d, tz, pat) {
  if (!(d instanceof Date)) d = new Date(d);
  const p = parts(d, tz), ms = String(d.getUTCMilliseconds()).padStart(3, '0'), H = +p.hour, mo = +p.month;
  let out = '', i = 0; pat = String(pat);
  while (i < pat.length) {
    const c = pat[i];
    if (c === "'") { const j = pat.indexOf("'", i + 1); out += j < 0 ? pat.slice(i + 1) : (j === i + 1 ? "'" : pat.slice(i + 1, j)); i = j < 0 ? pat.length : j + 1; continue; }
    if (!/[A-Za-z]/.test(c)) { out += c; i++; continue; }
    let n = 1; while (pat[i + n] === c) n++;
    const v = { y: n === 2 ? p.year.slice(-2) : p.year, M: n >= 4 ? MONL[mo - 1] : n === 3 ? MON[mo - 1] : n === 2 ? p.month : String(mo), d: n >= 2 ? p.day : String(+p.day),
      H: n >= 2 ? p.hour : String(H), h: String(H % 12 || 12).padStart(n, '0'), m: n >= 2 ? p.minute : String(+p.minute), s: n >= 2 ? p.second : String(+p.second),
      S: ms.slice(0, n), a: H < 12 ? 'AM' : 'PM', E: n >= 4 ? DAYL[p.weekday] : p.weekday, Z: '', z: '', X: '' }[c];
    out += v === undefined ? c.repeat(n) : v; i += n;
  }
  return out;
}
const toBytes = (x) => (typeof x === 'string' ? Array.from(Buffer.from(x, 'utf8')) : Array.from(x || []));
const signed = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const unsigned = (a) => Buffer.from((a || []).map((b) => b & 255));
function blob(data, type, name) {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : unsigned(data);
  const o = { getBytes: () => signed(bytes), getDataAsString: () => bytes.toString('utf8'), getContentType: () => type || 'application/octet-stream', getName: () => name || '',
    setName: (n) => { name = n; return o; }, setContentType: (t) => { type = t; return o; }, copyBlob: () => blob(signed(bytes), type, name), _buf: bytes };
  return o;
}

// ---------- الجلسة: الشريط + اللقطة + الكتابات المؤجلة ----------
export class GasSession {
  constructor(opt) {
    this.o = opt;                       // {src, db(rpc), http(fetch-like), props, session, tz, now}
    this.tape = []; this.snap = { vers: {}, meta: {}, rows: {} }; this.gl = {}; this.props0 = Object.assign({}, opt.props || {}); this.props = Object.assign({}, this.props0);
    this.propW = {}; this.cacheShared = opt.cache || new Map(); this.t0 = opt.now || Date.now(); this.seed = (opt.seed || (Math.random() * 4294967296)) >>> 0; this.runs = 0; this.need = new Set();
  }
  // ===== تحميل اللقطة =====
  // اللقطة مع ذاكرة على مستوى العامل (opt.snapCache): لا يُعاد جلب جدول لم يتغيّر إصداره منذ طلب سابق
  async loadTables(tbls) {
    const C = this.o.snapCache || null;
    if (!this.versLoaded) {
      const v = await this.o.db('gas_snapshot', { p_tbls: [] });
      this.snap.vers = v.vers || {}; this.glver = v.glver || {}; this.csver = v.csver || {}; this.versLoaded = true;
    }
    const want = (tbls || Object.keys(this.snap.vers)).filter((t) => !this.snap.rows[t]);
    const fetchList = [];
    want.forEach((t) => {
      const c = C && C.get('t:' + t);
      if (c && String(c.ver) === String(this.snap.vers[t])) { this.snap.rows[t] = c.rows; this.snap.meta[t] = c.meta; }
      else fetchList.push(t);
    });
    if (fetchList.length) {
      const r = await this.o.db('gas_snapshot', { p_tbls: fetchList });
      Object.assign(this.snap.meta, r.meta || {}); Object.assign(this.snap.rows, r.rows || {});
      fetchList.forEach((t) => { if (C && this.snap.rows[t]) C.set('t:' + t, { ver: (r.vers || {})[t], rows: this.snap.rows[t], meta: this.snap.meta[t] }); });
    }
    if (!tbls) Object.keys(this.snap.vers).forEach((t) => { if (!this.snap.rows[t]) this.snap.rows[t] = []; });
    Array.from(this.need).forEach((t) => { if (!this.snap.rows[t]) { this.snap.rows[t] = []; this.snap.meta[t] = { hdr: [], exists: false }; } });
    (tbls || []).forEach((t) => { if (!this.snap.rows[t]) { this.snap.rows[t] = []; this.snap.meta[t] = { hdr: [], exists: false }; } });
    this.need.clear();
  }
  // (V4.456) صورة شيت موصول (cs_get) بالذاكرة بين الطلبات بإصدارها (082) — نص الرد نفسه كما يعيده PostgREST
  async loadCs(code) {
    if (!this.cs) this.cs = {};
    if (this.cs[code]) return;
    const C = this.o.snapCache || null, v = String((this.csver || {})[code] ?? ''), c = C && C.get('cs:' + code);
    if (c && v !== '' && c.ver === v) { this.cs[code] = c.r; return; }
    const r = await this.o.http({ m: 'post', p: 'rpc/cs_get', b: { p_code: code } });
    this.cs[code] = r;
    if (C && v !== '' && r && r.code < 300) C.set('cs:' + code, { ver: v, r });
  }
  // مجموعة الجدول: hb_* / gl_* تُجلب معاً (طلب واحد بدل إعادة تشغيل لكل جدول) — ولا تحميل لكل الجداول أبداً
  tblGroup(list) {
    const out = new Set(list), all = Object.keys(this.snap.vers);
    list.forEach((t) => { const m = /^(hb|gl)_/.exec(t); if (m) all.forEach((x) => { if (x.indexOf(m[1] + '_') === 0) out.add(x); }); });
    return Array.from(out);
  }
  async loadGl(key) {
    const C = this.o.snapCache || null, v = String((this.glver || {})['gl_' + key] ?? ''), c = C && C.get('gl:' + key);
    if (c && v !== '' && c.ver === v) { this.gl[key] = c.rows; return; }
    this.gl[key] = await this.o.db('gas_gl_rows', { p_key: key });
    if (C && v !== '') C.set('gl:' + key, { ver: v, rows: this.gl[key] });
  }
  // ===== التشغيل =====
  instantiate() {
    const S = this, rnd = prng(S.seed), tick = { n: 0 };   // بذرة فريدة لكل طلب وثابتة بين إعادات تشغيله (معرّفات الصفوف لا تتكرر بين الطلبات)
    const clock = () => S.t0 + (tick.n++);
    const K = tzKit(S.o.tz), RD = Date, T = (d) => RD.prototype.getTime.call(d), LP = (d) => { const t = T(d); return new RD(t + K.off(t)); };
    const ABS_RX = /(Z|[+-]\d\d:?\d\d|GMT|UTC)(\s*\(.*\))?\s*$/i, DONLY_RX = /^\s*\d{4}(-\d\d(-\d\d)?)?\s*$/;
    class GDate extends RD {
      constructor(...a) {
        if (a.length === 0) super(clock());
        else if (a.length >= 2) { const u = new RD(0); u.setUTCFullYear(+a[0] >= 0 && +a[0] <= 99 ? 1900 + +a[0] : +a[0], +a[1], a.length > 2 ? +a[2] : 1); u.setUTCHours(+(a[3] || 0), +(a[4] || 0), +(a[5] || 0), +(a[6] || 0)); super(K.fromLocal(u.getTime())); }
        else if (typeof a[0] === 'string') super(GDate.parse(a[0]));
        else super(a[0] instanceof RD ? T(a[0]) : a[0]);
      }
      static now() { return clock(); }
      static parse(x) { const s = String(x), u = RD.parse(s); if (!isFinite(u) || ABS_RX.test(s) || DONLY_RX.test(s)) return u; return K.fromLocal(u); }
      getFullYear() { return LP(this).getUTCFullYear(); } getMonth() { return LP(this).getUTCMonth(); } getDate() { return LP(this).getUTCDate(); } getDay() { return LP(this).getUTCDay(); }
      getHours() { return LP(this).getUTCHours(); } getMinutes() { return LP(this).getUTCMinutes(); } getSeconds() { return LP(this).getUTCSeconds(); } getMilliseconds() { return LP(this).getUTCMilliseconds(); }
      getYear() { return this.getFullYear() - 1900; }
      getTimezoneOffset() { return -K.off(T(this)) / 60000; }
      _lset(m, a) { const L = LP(this); RD.prototype[m].apply(L, a); return RD.prototype.setTime.call(this, K.fromLocal(L.getTime())); }
      setFullYear(...a) { return this._lset('setUTCFullYear', a); } setMonth(...a) { return this._lset('setUTCMonth', a); } setDate(...a) { return this._lset('setUTCDate', a); }
      setHours(...a) { return this._lset('setUTCHours', a); } setMinutes(...a) { return this._lset('setUTCMinutes', a); } setSeconds(...a) { return this._lset('setUTCSeconds', a); } setMilliseconds(...a) { return this._lset('setUTCMilliseconds', a); }
    }
    const GMath = Object.create(Math); GMath.random = rnd;
    const uuid = () => { const h = Array.from({ length: 32 }, () => Math.floor(rnd() * 16).toString(16)).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
    const cache = new Map(), cacheW = [];
    const mkCache = () => ({
      get: (k) => { const v = cache.has(k) ? cache.get(k) : S.cacheShared.get(k); return v && v.exp > clock() ? v.v : null; },
      getAll: (ks) => { const o = {}; ks.forEach((k) => { const c = mkCache().get(k); if (c !== null) o[k] = c; }); return o; },
      put: (k, v, ttl) => { const e = { v: String(v), exp: clock() + (ttl || 600) * 1000 }; cache.set(k, e); cacheW.push([k, e]); },
      putAll: (m, ttl) => Object.keys(m).forEach((k) => mkCache().put(k, m[k], ttl)),
      remove: (k) => { cache.set(k, { v: null, exp: 0 }); cacheW.push([k, null]); }, removeAll: (ks) => ks.forEach((k) => mkCache().remove(k)) });
    const propsSvc = { getProperty: (k) => (Object.prototype.hasOwnProperty.call(S.props, k) ? S.props[k] : null), getProperties: () => Object.assign({}, S.props), getKeys: () => Object.keys(S.props),
      setProperty: (k, v) => { S.props[k] = String(v); S.propW[k] = String(v); return propsSvc; }, setProperties: (m, del) => { if (del) Object.keys(S.props).forEach((k) => { if (!(k in m)) propsSvc.deleteProperty(k); }); Object.keys(m).forEach((k) => propsSvc.setProperty(k, m[k])); return propsSvc; },
      deleteProperty: (k) => { delete S.props[k]; S.propW[k] = null; return propsSvc; }, deleteAllProperties: () => { Object.keys(S.props).forEach((k) => propsSvc.deleteProperty(k)); return propsSvc; } };
    const lock = () => { let h = false; return { waitLock: () => { h = true; }, tryLock: () => (h = true), releaseLock: () => { h = false; }, hasLock: () => h }; };
    // أي وصول خارج طبقة التخزين (ورقة غير منقولة · ملف خارجي · Drive…) يُبطل التشغيل كله حتى لو التقطه الكود ⇒ لا كتابة ⇒ Apps Script
    const unsupported = (what) => () => { S.unsup = S.unsup || what; throw new Error('GAS_EDGE_UNSUPPORTED: ' + what); };
    const known = () => [S.props.GL_SPREADSHEET_ID, S.props.MAIN_SPREADSHEET_ID, 'main'].filter(Boolean);
    const ss = (id) => {
      id = id || 'main';
      if (known().indexOf(id) < 0) unsupported('openById ' + id)();
      return { getId: () => id, getSheetByName: (n) => unsupported('sheet «' + n + '»')(), getSheets: unsupported('getSheets'), insertSheet: unsupported('insertSheet'), deleteSheet: unsupported('deleteSheet'),
        getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id, getSpreadsheetTimeZone: () => S.o.tz, getName: () => 'edge', toast: () => {}, getRange: unsupported('ss.getRange'), getActiveSheet: unsupported('getActiveSheet') };
    };
    const env = {
      Date: GDate, Math: GMath,
      Logger: { log: (...a) => { if (S.o.log) S.o.log(a.join(' ')); } },
      console: { log: () => {}, info: () => {}, warn: () => {}, error: (...a) => { if (S.o.log) S.o.log('ERR ' + a.join(' ')); } },
      Session: { getScriptTimeZone: () => S.o.tz, getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => '' }), getTemporaryActiveUserKey: () => 'edge' },
      PropertiesService: { getScriptProperties: () => propsSvc, getUserProperties: () => propsSvc, getDocumentProperties: () => propsSvc },
      CacheService: { getScriptCache: mkCache, getUserCache: mkCache, getDocumentCache: mkCache },
      LockService: { getScriptLock: lock, getDocumentLock: lock, getUserLock: lock },
      SpreadsheetApp: { getActiveSpreadsheet: () => ss(), getActive: () => ss(), openById: (id) => ss(id), openByUrl: unsupported('openByUrl'), flush: () => {}, create: unsupported('SpreadsheetApp.create') },
      ScriptApp: { getService: () => ({ getUrl: () => S.props.WEBAPP_URL || '' }), getProjectTriggers: () => [], newTrigger: unsupported('newTrigger'), deleteTrigger: () => {}, getScriptId: () => 'edge',
        getOAuthToken: unsupported('getOAuthToken'), AuthMode: {}, EventType: {} },
      UrlFetchApp: { fetch: (url, opt) => S.fetch(url, opt || {}), fetchAll: (reqs) => reqs.map((q) => S.fetch(q.url, q)) },
      Utilities: { formatDate, getUuid: uuid, sleep: () => {}, newBlob: blob, formatString: (f, ...a) => { let i = 0; return String(f).replace(/%[sd]/g, () => String(a[i++])); },
        base64Encode: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : unsigned(x)).toString('base64'), base64EncodeWebSafe: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : unsigned(x)).toString('base64url'),
        base64Decode: (s) => signed(Buffer.from(String(s), 'base64')), base64DecodeWebSafe: (s) => signed(Buffer.from(String(s), 'base64url')),
        gzip: (b) => blob(signed(gzipSync(b._buf || unsigned(b))), 'application/x-gzip'), ungzip: (b) => blob(signed(gunzipSync(b._buf || unsigned(b))), 'text/plain'),
        computeDigest: (alg, s) => signed(createHash({ MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256', SHA_512: 'sha512' }[alg] || 'md5').update(typeof s === 'string' ? Buffer.from(s, 'utf8') : unsigned(s)).digest()),
        computeHmacSha256Signature: unsupported('hmac'), DigestAlgorithm: { MD5: 'MD5', SHA_1: 'SHA_1', SHA_256: 'SHA_256', SHA_512: 'SHA_512' }, Charset: { UTF_8: 'UTF_8' },
        parseDate: (s) => new GDate(s), jsonStringify: JSON.stringify, jsonParse: JSON.parse },
      HtmlService: { createHtmlOutput: unsupported('HtmlService'), createTemplateFromFile: unsupported('HtmlService'), createHtmlOutputFromFile: unsupported('HtmlService') },
      ContentService: { createTextOutput: (t) => ({ setMimeType: function () { return this; }, getContent: () => t }), MimeType: { JSON: 'json', TEXT: 'text' } },
      DriveApp: new Proxy({}, { get: (t, k) => unsupported('DriveApp.' + String(k)) }), MailApp: new Proxy({}, { get: (t, k) => unsupported('MailApp.' + String(k)) }),
      GmailApp: new Proxy({}, { get: (t, k) => unsupported('GmailApp.' + String(k)) }), DocumentApp: new Proxy({}, { get: (t, k) => unsupported('DocumentApp.' + String(k)) }),
      Drive: new Proxy({}, { get: (t, k) => unsupported('Drive.' + String(k)) }),
      __EDGE: S.edgeApi(),
    };
    const names = Object.keys(env);
    if (!S._fn) S._fn = new Function(...names, S.o.src + '\n;return function (__n) { return eval(__n); };');
    const get = S._fn(...names.map((n) => env[n]));
    S.pos = 0; S.suspended = null; S.unsup = null; S.cacheW = cacheW;
    return get;
  }
  // واجهة يراها كود .gs (edge_overrides)
  edgeApi() {
    const S = this;
    return {
      session: () => S.o.session,
      readTable: (t) => {
        if (S.suspended) throw S.suspended;
        if (!S.snap.rows[t] && S.allLoaded) { S.snap.rows[t] = []; S.snap.meta[t] = { hdr: [], exists: false }; }   // لا وجود له بطبقة التخزين
        if (!S.snap.rows[t]) { S.need.add(t); throw (S.suspended = new Suspend('table', t)); }
        return { ver: String(S.verOf(t)), exists: !!(S.snap.meta[t] && S.snap.meta[t].exists !== false), hdr: (S.snap.meta[t] || {}).hdr || [], rows: S.snap.rows[t].slice() };
      },
      vers: (tbls) => { const o = {}; (tbls || Object.keys(S.snap.vers)).forEach((t) => { if (S.snap.vers[t] !== undefined) o[t] = S.snap.vers[t]; }); return o; },
      glRows: (key) => {
        if (S.suspended) throw S.suspended;
        if (!S.gl[key]) throw (S.suspended = new Suspend('gl', key));
        return S.gl[key];
      },
      req: (m, p, b, pref) => S.req(m, p, b, pref),
      propChanged: (k) => Object.prototype.hasOwnProperty.call(S.propW, k),
      unsup: (what) => { S.unsup = S.unsup || what; throw new Error('GAS_EDGE_UNSUPPORTED: ' + what); },
      // نسخة ملف برنامج الحجوزات (hb_snap): {tbl: [[rn, raw]...]} — قراءة فقط
      hbRows: (tbl) => {
        if (S.suspended) throw S.suspended;
        if (!S.hb) throw (S.suspended = new Suspend('hb'));
        if (!(S.hb.n >= 5) || !(S.hb.age <= 900)) { S.unsup = S.unsup || 'hb_snap قديمة أو ناقصة (' + S.hb.age + ' ث)'; throw new Error('GAS_EDGE_UNSUPPORTED: ' + S.unsup); }
        return (S.hb.tables || {})[tbl] || [];
      },
    };
  }
  // نداء REST نحو Supabase من كود .gs
  req(m, p, b, pref) {
    if (this.suspended) throw this.suspended;
    m = String(m).toLowerCase();
    // قراءات طبقة التخزين من اللقطة (لا تدخل الشريط)
    if (m === 'post' && p === 'rpc/store_vers') {
      if (!this.versLoaded) throw (this.suspended = new Suspend('vers'));
      const o = {}; const ts = b && b.p_tbls ? b.p_tbls : Object.keys(this.snap.vers); ts.forEach((t) => { if (this.snap.vers[t] !== undefined) o[t] = this.verOf(t); });
      return { code: 200, text: JSON.stringify(o) };
    }
    if (m === 'post' && p === 'rpc/cs_get' && b && b.p_code && this.versLoaded) {
      const code = String(b.p_code);
      if (this.cs && this.cs[code]) return this.cs[code];
      throw (this.suspended = new Suspend('cs', code));
    }
    if (m === 'post' && p === 'rpc/store_read') {
      const t = this.edgeApi().readTable(b.p_tbl), off = +b.p_off || 0, lim = +b.p_lim || 1000;
      return { code: 200, text: JSON.stringify({ ver: +t.ver, exists: t.exists, hdr: t.hdr, n: t.rows.length, rows: t.rows.slice(off, off + lim) }) };
    }
    const k = m + ' ' + p + ' ' + (b === undefined || b === null ? '' : JSON.stringify(b));
    const t = this.tape[this.pos];
    if (t) { if (t.k !== k) throw (this.suspended = new Suspend('diverge', { at: this.pos, want: t.k.slice(0, 200), got: k.slice(0, 200) })); this.pos++; return t.r; }
    const def = this.deferable(m, p, b);
    if (def) { this.tape.push({ k, r: def, deferred: true, done: false, req: { m, p, b, pref } }); this.pos++; return def; }
    throw (this.suspended = new Suspend('req', { k, req: { m, p, b, pref } }));
  }
  // إصدار الجدول = إصدار اللقطة + عدد ما رفعناه له بهذا التشغيل حتى الآن (حتمي بين إعادات التشغيل)
  verOf(t) { let v = +this.snap.vers[t] || 0; for (let i = 0; i < this.pos && i < this.tape.length; i++) { const x = this.tape[i]; if (x.req && x.req.p === 'rpc/store_put' && x.req.b && x.req.b.p && x.req.b.p.t === t) v++; } return v; }
  // كتابات ردّها معروف مسبقاً ⇒ تُؤجَّل
  deferable(m, p, b) {
    if (m === 'post' && p === 'rpc/store_put') { const t = b && b.p && b.p.t; return { code: 200, text: JSON.stringify({ ver: this.verOf(t) + 1, mirror: { ok: 0, err: 0 } }) }; }
    if (m === 'post' && /^rpc\/(gl_store_put|gl_store_delete|kv_set|bot_mark|dv_set|store_mirror_prune|cs_queue)$/.test(p)) return { code: 200, text: 'null' };
    if (m === 'post' && /^(app_outbox|gl_outbox|audit_log)(\?|$)/.test(p)) return { code: 201, text: '' };
    if (m === 'post' && /^(gl_aux|read_cache|app_config)\?on_conflict=[\w,]+$/.test(p)) return { code: 201, text: '' };
    return null;
  }
  fetch(url, opt) {
    const base = String(this.props.SUPA_URL || '').replace(/\/+$/, '') + '/rest/v1/';
    const resp = (r) => ({ getResponseCode: () => r.code, getContentText: () => r.text, getBlob: () => blob(r.text), getHeaders: () => ({}) });
    if (base.length > 9 && String(url).indexOf(base) === 0) {
      const body = opt.payload === undefined ? undefined : (typeof opt.payload === 'string' ? JSON.parse(opt.payload) : opt.payload);
      return resp(this.req(opt.method || 'get', String(url).slice(base.length), body));
    }
    if (this.suspended) throw this.suspended;
    const k = 'ext ' + (opt.method || 'get') + ' ' + url + ' ' + (opt.payload ? String(opt.payload).slice(0, 2000) : '');
    const t = this.tape[this.pos];
    if (t) { if (t.k !== k) throw (this.suspended = new Suspend('diverge', { at: this.pos })); this.pos++; return resp(t.r); }
    throw (this.suspended = new Suspend('req', { k, ext: { url, opt } }));
  }
  // تنفيذ الكتابات المؤجلة المتراكمة بالترتيب
  // تُنفَّذ كلها بمعاملة واحدة (gas_apply) — كلها أو لا شيء
  async flushDeferred() {
    const pend = this.tape.filter((t) => t.deferred && !t.done); if (!pend.length) return;
    const ops = pend.map((t) => { const q = t.req, rpc = /^rpc\/(\w+)$/.exec(q.p), tb = /^(\w+)/.exec(q.p)[1];
      if (rpc) return { rpc: rpc[1], b: q.b || {} };
      const oc = /on_conflict=([\w,]+)/.exec(q.p);
      if (oc && tb !== 'audit_log') return { upsert: tb, conflict: oc[1].split(','), rows: [].concat(q.b) };
      return tb === 'audit_log' ? { up: 'audit_log', rows: [].concat(q.b) } : { ins: tb, rows: [].concat(q.b) }; });
    await this.o.db('gas_apply', { ops });
    pend.forEach((t) => { t.done = true; });
  }
  async preload() {
    await this.loadTables([]);
    if (this.o.preload === 'hb') {   // برنامج الحجوزات: جداوله + شيتات الموصل معاً (تشغيل واحد غالباً) — القيود عند الحاجة فقط
      let codes = []; try { const c = JSON.parse(this.props.HB_SRC_CONN || 'null'); if (c && c.on && c.tabs) codes = Object.keys(c.tabs).map((k) => c.tabs[k].code).filter(Boolean); } catch (e) { codes = []; }
      await Promise.all([this.loadTables(this.tblGroup(Object.keys(this.snap.vers).filter((t) => /^hb_/.test(t)))), ...codes.map((c) => this.loadCs(c))]);
      return;
    }
    const gl = Object.keys(this.snap.vers).filter((t) => /^gl_/.test(t));
    await this.loadTables(gl);
    await Promise.all([this.loadGl('entries'), this.loadGl('lines')]);
  }
  async run(fn, args, maxRuns = 14) {
    if (this.o.preload !== false && !this.allLoaded) await this.preload();
    for (this.runs = 0; this.runs < maxRuns; this.runs++) {
      this.props = Object.assign({}, this.props0); this.propW = {};   // (V4.460) كل إعادة تشغيل تبدأ من خصائص الطلب الأصلية (لا أثر لتشغيل سابق علّق)
      const get = this.instantiate();
      let result, err = null;
      try {
        const f = get(fn); if (typeof f !== 'function' || (/_$/.test(fn) && !this.o.allowPrivate)) throw new Error('دالة غير موجودة: ' + fn);
        result = f.apply(null, args || []);
        get('__edgeEnd')();
      } catch (e) { err = e; }
      const sp = this.suspended || (SUSP(err) ? err : null);
      if (!sp && this.unsup) throw new Error('GAS_EDGE_UNSUPPORTED: ' + this.unsup);
      if (!sp) {
        if (this.o.ro) { const pend = this.tape.filter((t) => t.deferred && !t.done); if (pend.length) throw needLease(pend[0].req.p); const pk = Object.keys(this.propW); if (pk.length) throw needLease('prop ' + pk[0]); }
        await this.flushDeferred();
        if (err) throw err;
        this.cacheW.forEach(([k, e]) => { if (e) this.cacheShared.set(k, e); else this.cacheShared.delete(k); });
        return result;
      }
      // تعليق: احذف ما سُجّل بعد نقطة التعليق (لم يُنفَّذ) ثم لبِّ الحاجة وأعد التشغيل
      if (this.o.debug) this.o.debug('suspend ' + sp.kind + ' ' + JSON.stringify(sp.data || '').slice(0, 300) + ' pos=' + this.pos + ' tape=' + this.tape.length);
      if (sp.kind === 'diverge') throw new Error('GAS_EDGE: تشغيل غير حتمي عند النداء ' + sp.data.at + ' — ' + sp.data.want + ' ≠ ' + sp.data.got);
      this.tape = this.tape.slice(0, this.pos);
      if (sp.kind === 'table') await this.loadTables(this.tblGroup(Array.from(this.need)));
      else if (sp.kind === 'cs') await this.loadCs(sp.data);
      else if (sp.kind === 'vers') { await this.loadTables([]); this.versLoaded = true; }
      else if (sp.kind === 'hb') { this.hb = await this.o.db('gas_hb_snap', {}); }
      else if (sp.kind === 'gl') await Promise.all(['entries', 'lines'].filter((k) => k === sp.data || !this.gl[k]).map((k) => this.loadGl(k)));   // القيود وسطورها معاً (رحلة واحدة)
      else {
        if (this.o.ro) {
          const X = sp.data.ext, okExt = X && String((X.opt && X.opt.method) || 'get').toLowerCase() === 'get' && READ_EXT_RX.test(String(X.url));
          const bad = X ? !okExt : (String(sp.data.req.m).toLowerCase() !== 'get' && !READ_RPC_RX.test(sp.data.req.p));
          if (bad || this.tape.some((t) => t.deferred && !t.done)) throw needLease(X ? 'ext ' + String(X.url).replace(/bot[^/]+/, 'bot*').slice(0, 60) : sp.data.req.m + ' ' + sp.data.req.p);
        }
        await this.flushDeferred();
        const r = sp.data.ext ? await this.o.ext(sp.data.ext) : await this.o.http(sp.data.req);
        this.tape.push({ k: sp.data.k, r, done: true });
      }
    }
    throw new Error('GAS_EDGE: تجاوز عدد مرات إعادة التشغيل');
  }
}
