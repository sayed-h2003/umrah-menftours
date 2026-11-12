// اختبار موصل الحجوزات داخل بيئة gas: قراءة الحجوزات من cs_sheets + كتابة خلية بطابور cs_queue مع بصمة عمود C
import { execFileSync } from 'node:child_process';
import { GasSession } from '../supabase/functions/gas/runtime.mjs';
import { SRC } from '../supabase/functions/gas/bundle.mjs';
const Q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lit = (v) => v === null || v === undefined ? 'null' : Array.isArray(v) && v.every((x) => typeof x === 'string') ? 'array[' + v.map(Q).join(',') + ']::text[]' : typeof v === 'object' ? Q(JSON.stringify(v)) + '::jsonb' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Q(v);
const psql = (sql) => execFileSync('su', ['postgres', '-c', 'psql -d lq -At -v ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const call = (fn, a) => 'select ' + fn + '(' + Object.keys(a || {}).map((k) => k + ' => ' + lit(a[k])).join(', ') + ');';
const db = async (fn, a) => JSON.parse(psql(call(fn, a)) || 'null');
const http = async (q) => { try { const m = /^rpc\/(\w+)$/.exec(q.p); if (m) return { code: 200, text: psql(call(m[1], q.b)) || 'null' }; return { code: 501, text: '' }; } catch (e) { return { code: 400, text: String(e.stderr || e.message) }; } };
const tabs = { mk: { tab: 'حجوزات مكة', cols: 34, txt: false, sc: 3, code: 'HBSRC:mk' }, md: { tab: 'حجوزات المدينة', cols: 34, txt: false, sc: 3, code: 'HBSRC:md' }, party: { tab: 'العملاء والموردين', cols: 26, txt: false, code: 'HBSRC:party' } };
const props = { SUPA_URL: 'http://local', SUPA_SERVICE_KEY: 'x', SUPA_ENABLED: '1', STORE_TABLES: 'ministry,core,acc,bookings,visa,misc,glaux,glcore,hb', GL_STORE: 'supabase', GL_SPREADSHEET_ID: 'gl1',
  HB_SRC_CONN: JSON.stringify({ sheetId: 'HB1', tabs, on: true }), SRC_SS_ID: 'HB1' };
const run = async (fn, args) => {
  const s = new GasSession({ src: SRC, db, http, ext: async () => ({ code: 599, text: '' }), props, session: { username: 'admin', permissions: 'admin' }, tz: 'Africa/Cairo', allowPrivate: true, snapCache: new Map() });
  try { return await s.run(fn, args); } catch (e) { return 'ERROR ' + e.message; }
};
// 1) المحرك يقرأ الحجوزات من الموصل (بلا hb_snap)
psql("update hb_snap_meta set synced_at = now() - interval '2 hours'");   // نسخة hb_snap قديمة ⇒ لو قُرئ منها لرُفض
const H = await run('_glHbRead_', []);
console.log('1) bookings from connector:', typeof H === 'string' ? H : H.bookings.map((b) => b.key + ' ' + b.client + ' ' + b.hotel).join(' | '));
// 2) كتابة خلية الحالة (العمود 16) للحجز بالصف 5 عبر الشيت الافتراضي
const W = await run('_hbConnTestWrite_', []);
console.log('2) write:', W);
console.log('   pending:', psql("select pending from cs_sheets where code='HBSRC:mk'"));
psql("update hb_snap_meta set synced_at = now()");
