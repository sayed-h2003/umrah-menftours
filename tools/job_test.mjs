// تشغيل مهمة مجدولة داخل بيئة gas (كما ستشغّلها جدولة Supabase) — node tools/job_test.mjs <fn>
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
const extLog = [];
const ext = async (e) => { extLog.push(String(e.opt && e.opt.method || 'get') + ' ' + String(e.url).replace(/bot[^/]+/, 'bot***').slice(0, 90)); return { code: 200, text: JSON.stringify({ ok: true, result: [] }) }; };
const props = Object.assign({ SUPA_URL: 'http://local', SUPA_SERVICE_KEY: 'x', SUPA_ENABLED: '1', STORE_TABLES: 'ministry,core,acc,bookings,visa,misc,glaux,glcore,hb', GL_STORE: 'supabase', GL_SPREADSHEET_ID: 'gl1',
  TELEGRAM_TOKEN: '1:x', TELEGRAM_BOT_TOKEN: '2:y' }, JSON.parse(process.env.PROPS || '{}'));
const fn = process.argv[2]; const ARGS = JSON.parse(process.env.ARGS || "[]");
const s = new GasSession({ src: SRC, db, http, ext, props, snapCache: new Map(), tz: 'Africa/Cairo', allowPrivate: true, session: { username: 'system', permissions: 'admin' }, log: () => {} });
try { const r = await s.run(fn, ARGS); console.log('OK', String(JSON.stringify(r)).slice(0, 200)); } catch (e) { console.log('ERR', e.message.slice(0, 300)); }
console.log('ext:', extLog.slice(0, 8).join(' | '));
