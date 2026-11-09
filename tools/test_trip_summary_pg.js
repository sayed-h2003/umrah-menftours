// اختبار تطابق: getTripAccountsSummary (Code.gs) مقابل rx2_gettripaccountssummary (027) على بيانات عشوائية.
// يتطلب Postgres محلياً بقاعدة DB (متغير PGDB) محمَّل فيها 006→012 و027 + app_has stub (انظر tools/README).
const fs = require('fs'), vm = require('vm'), cp = require('child_process');
const DB = process.env.PGDB || 't385', N = +(process.env.N || 200);
const ctx = { console, Date, Math, JSON, String, Number, Object, Array, RegExp, parseInt, parseFloat, isNaN, Error, Logger: { log() {} } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);
let seed = +(process.env.SEED || 11); const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)], ri = n => Math.floor(rnd() * n);
const sh = (rows, colmap) => ({ rows, colmap, getLastRow() { return rows.length + 1; }, getLastColumn() { return rows[0] ? rows[0].length : 1; },
  getRange(r, c, nr, nc) { return { getValues: () => rows.slice(r - 2, r - 2 + nr).map(x => x.slice(c - 1, c - 1 + nc)) }; } });
const hmap = h => { const m = {}; h.forEach((x, i) => m[x] = i); return m; };
const T = ['t1', 't2', 't3'], CL = ['c1', 'c2', 'c3', 'c4', 'c5', 'محمد', 'علي'];
function gen() {
  const items = [], pays = [], pil = [], trips = [], merge = [];
  for (let i = 0; i < ri(25); i++) { const t = pick(T), d = rnd() < 0.2;
    const r = new Array(20).fill(''); r[0] = 'I' + i; r[1] = pick(CL) + (rnd() < .1 ? ' ' : ''); r[2] = t; r[3] = pick(['تذاكر', 'سكن مكة', 'خصم', 'خصم فرق', 'بند ' + i]) + (rnd() < .2 ? ' ⟦cf:ab1⟧' : '');
    r[5] = pick(['EGP', 'SAR', '']); r[6] = pick([0, 1, 2, 5, '3', '']); r[7] = pick([0, 100, 12.5, '40', '']); r[9] = d ? 'نعم' : pick(['لا', '']);
    r[8] = pick([0, 100, 250.55, 1200, 33.333]); r[15] = pick(['', 0, 2, 3, '4']); r[18] = pick(['', 0, 1, 2, 3]); r[19] = pick(['نعم', 'لا', '']);
    items.push(r); }
  for (let i = 0; i < ri(18); i++) { const r = new Array(12).fill(''); r[0] = 'P' + i; r[1] = pick(CL); r[2] = pick([...T, 'عام']); r[3] = pick(['دفعة', 'دفعة', 'تحويل', '']);
    r[4] = pick(['01/05/2026', '15/04/2026', '', '3/2/2026']); r[5] = pick([100, 500, 1000, 77.5]); r[6] = pick(['EGP', 'SAR', '']); r[7] = r[3] === 'تحويل' ? pick([13.5, 12, 14.25]) : ''; pays.push(r); }
  for (let i = 0; i < ri(14); i++) { const r = new Array(ctx.PILGRIMS_HEADERS_.length).fill(''); const m = hmap(ctx.PILGRIMS_HEADERS_);
    r[m['اسم الرحلة']] = pick(T); r[m['العميل']] = pick([...CL, 'المشرف علي']); r[m['النوع']] = pick(['ذكر', 'أنثى', 'طفل', 'رضيع', '']); r[m['اسم المعتمر']] = 'p' + i; pil.push(r); }
  T.forEach(t => { const r = new Array(ctx.TRIPS_HEADERS_.length).fill(''); const m = hmap(ctx.TRIPS_HEADERS_); r[m['اسم الرحلة']] = t;
    r[m['تاريخ الذهاب']] = rnd() < .8 ? new Date(2026, 1 + ri(6), 1 + ri(25)) : ''; trips.push(r); });
  for (let i = 0; i < ri(4); i++) merge.push([pick(CL), JSON.stringify(rnd() < .85 ? ['t1', ...T.filter(() => rnd() < .6)].filter((x, k, a) => a.indexOf(x) === k) : ['t2', 't3']), 'u', '']);
  return { items, pays, pil, trips, merge };
}
const raw = v => v instanceof Date ? { $d: v.getTime() } : v;
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
function loadPg(d) {
  const ins = (tbl, rows) => rows.map((r, i) => `insert into store_rows(tbl,rid,ord,raw) values (${lit(tbl)},${lit(tbl + i)},${i + 1},${lit(JSON.stringify(r.map(raw)))}::jsonb);`).join('\n');
  const sql = `delete from store_rows where tbl in ('acc_items','acc_payments','pilgrims','trips','acc_merge_groups');
${ins('acc_items', d.items)}\n${ins('acc_payments', d.pays)}\n${ins('pilgrims', d.pil)}\n${ins('trips', d.trips)}\n${ins('acc_merge_groups', d.merge)}
select rx2_gettripaccountssummary('[null,"t1"]','u');`;
  const out = cp.execFileSync('psql', ['-qAt', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGUSER: process.env.PGUSER } });
  return JSON.parse(out.trim().split('\n').pop());
}
const same = (a, b) => { if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-7; if (a && b && typeof a === 'object') { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => same(a[k], b[k])); } return a === b; };
// حقن الشيتات الوهمية
let cur;
ctx._accPerm_ = () => ({ username: 'u' }); ctx._sheetColMap_ = s => s.colmap;
ctx._accSheet_ = n => n === ctx.ACC_ITEMS_SHEET ? cur.s.items : n === ctx.ACC_PAY_SHEET ? cur.s.pays : cur.s.merge;
ctx._getPilgrimsSheet_ = () => cur.s.pil; ctx._getTripsSheet_ = () => cur.s.trips;
ctx._tripFormatDate_ = d => d; ctx._parseDmy_ = () => null;
let bad = 0; const stat = { m: 0, r: 0, s: 0 };
for (let k = 0; k < N; k++) {
  const d = gen(); cur = { s: { items: sh(d.items), pays: sh(d.pays), merge: sh(d.merge), pil: sh(d.pil, hmap(ctx.PILGRIMS_HEADERS_)), trips: sh(d.trips, hmap(ctx.TRIPS_HEADERS_)) } };
  const js = JSON.parse(JSON.stringify(ctx.getTripAccountsSummary('x', 't1')));
  (js.rows || []).forEach(x => { stat.r++; if (x.merged) stat.m++; if (x.statementText) stat.s++; });
  let pg; try { pg = loadPg(d); } catch (e) { console.log('PG ERR', String(e.stderr || e).slice(0, 300)); bad++; break; }
  if (!same(js, pg)) { bad++; if (bad <= 3) { console.log('MISMATCH #' + k); const jr = js.rows || [], pr = pg.rows || []; for (let i = 0; i < Math.max(jr.length, pr.length); i++) if (!same(jr[i], pr[i])) { console.log(' js', JSON.stringify(jr[i])); console.log(' pg', JSON.stringify(pr[i])); break; } } }
}
console.log('datasets', N, 'mismatch', bad, 'mergedRows', stat.m, 'rows', stat.r, 'withStatement', stat.s); process.exit(bad ? 1 : 0);
