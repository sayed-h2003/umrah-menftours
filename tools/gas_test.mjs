// تشغيل دالة Apps Script عبر بيئة Edge (runtime.mjs) على قاعدة الاختبار المحلية — node tools/gas_test.mjs <fn> '<args json>'
import { execFileSync } from 'node:child_process';
import { GasSession } from '../supabase/functions/gas/runtime.mjs';
import { SRC } from '../supabase/functions/gas/bundle.mjs';
const Q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lit = (v) => v === null || v === undefined ? 'null' : Array.isArray(v) && v.every((x) => typeof x === 'string') ? 'array[' + v.map(Q).join(',') + ']::text[]'
  : typeof v === 'object' ? Q(JSON.stringify(v)) + '::jsonb' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Q(v);
const psql = (sql) => execFileSync('su', ['postgres', '-c', 'psql -d lq -At -v ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const call = (fn, args) => 'select ' + fn + '(' + Object.keys(args || {}).map((k) => k + ' => ' + lit(args[k])).join(', ') + ');';
const db = async (fn, args) => JSON.parse(psql(call(fn, args)) || 'null');
const http = async (q) => {
  try {
    let m;
    if (q.m === 'post' && (m = /^rpc\/(\w+)$/.exec(q.p))) return { code: 200, text: psql(call(m[1], q.b)) || 'null' };
    if (q.m === 'post' && (m = /^(\w+)(\?.*)?$/.exec(q.p))) { const rows = Array.isArray(q.b) ? q.b : [q.b]; psql('insert into ' + m[1] + ' select * from jsonb_populate_recordset(null::' + m[1] + ', ' + Q(JSON.stringify(rows)) + '::jsonb);'); return { code: 201, text: '' }; }
    return { code: 501, text: 'test harness: ' + q.m + ' ' + q.p };
  } catch (e) { return { code: 400, text: String(e.stderr || e.message) }; }
};
const [fn, a] = process.argv.slice(2);
const props = { SUPA_URL: 'http://local', SUPA_SERVICE_KEY: 'x', SUPA_ENABLED: '1', STORE_TABLES: process.env.ST || 'ministry,core,acc,bookings,visa,misc,glaux,glcore', GL_STORE: 'supabase', GL_SPREADSHEET_ID: 'gl1', SUPA_W_GL: '1' };
const s = new GasSession({ snapCache: new Map(), src: SRC, db, http, ext: async () => ({ code: 599, text: 'no ext' }), props, session: { username: 'admin', permissions: 'admin' }, tz: 'Africa/Cairo', allowPrivate: true, debug: process.env.GAS_DEBUG ? (x) => console.error('DBG', x) : null, log: (x) => console.error('LOG', x) });
const t0 = Date.now(), c0 = process.cpuUsage();
try { const r = await s.run(fn, (fn.endsWith('_') ? [] : [null]).concat(JSON.parse(a || '[]'))); console.log(String(JSON.stringify(r)).slice(0, 1500)); }
catch (e) { console.log('ERROR', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e); }
const cu = process.cpuUsage(c0);
console.error('runs=' + (s.runs + 1) + ' wall=' + (Date.now() - t0) + 'ms cpu=' + Math.round((cu.user + cu.system) / 1000) + 'ms tape=' + s.tape.length);
