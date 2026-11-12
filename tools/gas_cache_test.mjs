// يتحقق من ذاكرة اللقطة بين طلبين بنفس العامل: الطلب الثاني لا يجلب إلا ما تغيّر
import { execFileSync } from 'node:child_process';
import { GasSession } from '../supabase/functions/gas/runtime.mjs';
import { SRC } from '../supabase/functions/gas/bundle.mjs';
const Q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lit = (v) => v === null || v === undefined ? 'null' : Array.isArray(v) && v.every((x) => typeof x === 'string') ? 'array[' + v.map(Q).join(',') + ']::text[]' : typeof v === 'object' ? Q(JSON.stringify(v)) + '::jsonb' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Q(v);
const psql = (sql) => execFileSync('su', ['postgres', '-c', 'psql -d lq -At -v ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
let calls = [];
const db = async (fn, args) => { calls.push(fn + (args && args.p_tbls ? '[' + args.p_tbls.length + ']' : args && args.p_key ? ':' + args.p_key : '')); return JSON.parse(psql('select ' + fn + '(' + Object.keys(args || {}).map((k) => k + ' => ' + lit(args[k])).join(', ') + ');') || 'null'); };
const props = { SUPA_URL: 'http://local', SUPA_SERVICE_KEY: 'x', SUPA_ENABLED: '1', STORE_TABLES: 'all', GL_STORE: 'supabase', GL_SPREADSHEET_ID: 'gl1' };
const snapCache = new Map();
for (const i of [1, 2]) {
  calls = [];
  const s = new GasSession({ snapCache, src: SRC, db, http: async () => ({ code: 501, text: '' }), ext: async () => ({ code: 599, text: '' }), props, session: { username: 'admin', permissions: 'admin' }, tz: 'Africa/Cairo' });
  const t0 = Date.now(); await s.run('glBalanceSheet', [null, '']);
  console.log('request ' + i + ': ' + (Date.now() - t0) + 'ms · db=' + calls.join(', '));
}
