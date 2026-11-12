// اختبار دوال برنامج الحجوزات داخل gas بجلسة hb (رمز Supabase بمطالبة hb) — node tools/hb_gas_test.mjs <fn> '<args json>' [user] [cap]
import { execFileSync } from 'node:child_process';
import { GasSession } from '../supabase/functions/gas/runtime.mjs';
import { SRC } from '../supabase/functions/gas/bundle.mjs';
const Q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lit = (v) => v === null || v === undefined ? 'null' : Array.isArray(v) && v.every((x) => typeof x === 'string') ? 'array[' + v.map(Q).join(',') + ']::text[]' : typeof v === 'object' ? Q(JSON.stringify(v)) + '::jsonb' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Q(v);
const psql = (sql) => execFileSync('su', ['postgres', '-c', 'psql -d lq -At -v ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const call = (fn, a) => 'select ' + fn + '(' + Object.keys(a || {}).map((k) => k + ' => ' + lit(a[k])).join(', ') + ');';
const db = async (fn, a) => JSON.parse(psql(call(fn, a)) || 'null');
const http = async (q) => { try { let m; if (q.m === 'post' && (m = /^rpc\/(\w+)$/.exec(q.p))) return { code: 200, text: psql(call(m[1], q.b)) || 'null' };
  if (q.m === 'post' && (m = /^(\w+)(\?.*)?$/.exec(q.p))) { const rows = Array.isArray(q.b) ? q.b : [q.b]; psql('insert into ' + m[1] + ' select * from jsonb_populate_recordset(null::' + m[1] + ', ' + Q(JSON.stringify(rows)) + '::jsonb);'); return { code: 201, text: '' }; }
  return { code: 501, text: 'harness: ' + q.m + ' ' + q.p }; } catch (e) { return { code: 400, text: String(e.stderr || e.message) }; } };
const tabs = { mk: { tab: 'حجوزات مكة', cols: 34, txt: false, sc: 3, code: 'HBSRC:mk' }, md: { tab: 'حجوزات المدينة', cols: 34, txt: false, sc: 3, code: 'HBSRC:md' }, party: { tab: 'العملاء والموردين', cols: 26, txt: false, code: 'HBSRC:party' } };
const props = { SUPA_URL: 'http://local', SUPA_SERVICE_KEY: 'x', SUPA_ENABLED: '1', STORE_TABLES: 'ministry,core,acc,bookings,visa,misc,glaux,glcore,hb', GL_STORE: 'supabase', GL_SPREADSHEET_ID: 'gl1',
  HB_SRC_CONN: JSON.stringify({ sheetId: 'HB1', tabs, on: true }), SRC_SS_ID: 'HB1' };
const [fn, a, u, cap] = process.argv.slice(2);
const s = new GasSession({ src: SRC, db, http, ext: async () => ({ code: 599, text: '' }), props, snapCache: new Map(), tz: 'Africa/Cairo', allowPrivate: true,
  session: u === 'erp' ? { username: 'admin', permissions: 'admin' } : { username: 'hb:' + (u || 'sara'), permissions: '', hb: { u: u || 'sara', cap: cap || '' } }, log: (x) => console.error('LOG', x) });
const t0 = Date.now();
try { const r = await s.run(fn, JSON.parse(a || '[]')); console.log(String(JSON.stringify(r)).slice(0, 1200)); } catch (e) { console.log('ERROR', e.message, s.unsup ? '(unsup: ' + s.unsup + ')' : ''); }
console.error('runs=' + (s.runs + 1) + ' wall=' + (Date.now() - t0) + 'ms');
