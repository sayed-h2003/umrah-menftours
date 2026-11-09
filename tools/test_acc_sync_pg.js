// اختبار تطابق: _syncTripAccounts_ (Code.gs) مقابل _ae_sync_trip (040) — نمطا «برنامج» و«تأشيرة وباركود» على بيانات عشوائية.
// يتطلب Postgres محلياً بقاعدة PGDB محمَّل فيها 006→012 و029 و034 و037 و040 (+app_kv/app_has stubs كما بباقي الاختبارات).
const fs = require('fs'), vm = require('vm'), cp = require('child_process');
const DB = process.env.PGDB || 't385', N = +(process.env.N || 150);
const ctx = { console, Date, Math, JSON, String, Number, Object, Array, RegExp, parseInt, parseFloat, isNaN, Error, Logger: { log() {} } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);
let seed = +(process.env.SEED || 5); const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)], ri = n => Math.floor(rnd() * n);
const hmap = h => { const m = {}; h.forEach((x, i) => m[x] = i); return m; };
function mk(headers, rows) {
  const s = { rows, colmap: hmap(headers), W: headers.length,
    getLastRow() { let l = 0; rows.forEach((r, i) => { if (r && r.some(c => c !== '' && c != null)) l = i + 1; }); return l + 1; }, getLastColumn() { return s.W; }, getMaxColumns() { return s.W; },
    getRange(r, c, nr, nc) { nr = nr || 1; nc = nc || 1; return {
      getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = rows[r - 2 + i] || []; const x = []; for (let j = 0; j < nc; j++) x.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); o.push(x); } return o; },
      setValues: v => { v.forEach((rv, i) => { rows[r - 2 + i] = rows[r - 2 + i] || new Array(s.W).fill(''); rv.forEach((x, j) => rows[r - 2 + i][c - 1 + j] = x); }); },
      clearContent: () => { for (let i = 0; i < nr; i++) if (rows[r - 2 + i]) for (let j = 0; j < nc; j++) rows[r - 2 + i][c - 1 + j] = ''; },
      setValue: x => { rows[r - 2] = rows[r - 2] || new Array(s.W).fill(''); rows[r - 2][c - 1] = x; } }; },
    appendRow(r) { let l = s.getLastRow() - 1; rows[l] = r; }, setFrozenRows() {} };
  return s; }
const T = 't1', CL = ['c1', 'c2', 'c3', 'محمد', 'علي'], HOT = ['', 'ديوان', 'فندق ب'], ACC = ['', 'سنجل', 'دابل', 'ثلاثي', 'رباعي', 'رباعي أسرة'];
const DESCS = ['خصم', 'تأشيرة وباركود', 'تذاكر', 'سكن مكة', 'غرفة دابل', 'برنامج ديوان - دابل', 'برنامج ديوان - تسكين عادي', 'تسكين عادي', 'رضيع', 'أطفال بدون سكن', 'برنامج - تسكين عادي', 'شيء يدوي'];
function gen() {
  const pm = hmap(ctx.PILGRIMS_HEADERS_), pil = [], trips = [], items = [], meta = [], tp = [], cp_ = [], rem = [];
  for (let i = 0; i < 4 + ri(14); i++) { const r = new Array(ctx.PILGRIMS_HEADERS_.length).fill(''); r[pm['اسم الرحلة']] = rnd() < .85 ? T : 't2'; r[pm['العميل']] = pick([...CL, 'المشرف علي', 'مشرف', '']);
    r[pm['اسم المعتمر']] = rnd() < .93 ? 'م' + i : ''; r[pm['النوع']] = pick(['ذكر', 'أنثى', 'طفل', 'رضيع']); r[pm['طبيعة التسكين']] = pick(ACC); r[pm['فندق مكة']] = pick(HOT); r[pm['فندق المدينة']] = pick(HOT); pil.push(r); }
  { const r = new Array(ctx.TRIPS_HEADERS_.length).fill(''); const m = hmap(ctx.TRIPS_HEADERS_); r[m['اسم الرحلة']] = T; r[m['تاريخ الذهاب']] = pick(['01/05/2026', '15/06/2026', '', '3/2/2026']); trips.push(r); }
  const modes = {}; CL.forEach(c => { const m = pick(['برنامج', 'برنامج', 'تأشيرة وباركود', '', null]); modes[c] = m; if (m !== null) meta.push([c, T, m, pick(['', '1/0/0', '{"a":1}']), pick(['', 'x']), 'u0', '', '']); });
  for (let i = 0; i < ri(14); i++) { const r = new Array(20).fill(''); r[0] = 'I' + i; r[1] = pick(CL); r[2] = rnd() < .9 ? T : 't2'; r[3] = pick(DESCS); r[4] = 'كبير'; r[5] = pick(['EGP', 'SAR', '']); r[6] = pick([0, 1, 2, '3']); r[7] = pick([0, 100, 250.5, '40']);
    r[8] = pick([0, 100, 500.25]); r[9] = pick(['لا', 'نعم', '']); r[17] = pick(['نعم', 'نعم', 'معدّل', '']); r[19] = 'لا'; items.push(r); }
  const hs = {}; HOT.filter(Boolean).forEach(h => { if (rnd() < .8) hs[h] = Object.fromEntries(['سنجل', 'دابل', 'ثلاثي', 'عادي'].filter(() => rnd() < .7).map(k => [k, pick([1000, 1500.5, 2000])])); }); if (rnd() < .5) hs[''] = { 'عادي': 900, 'دابل': 1100 };
  if (rnd() < .93) tp.push([T, JSON.stringify({ hotels: hs, child: pick([0, 700]), infant: pick([0, 300]), applied: rnd() < .85 }), 'u', '']);
  CL.forEach(c => { if (rnd() < .6) cp_.push([c, JSON.stringify({ items: { 'تأشيرة وباركود': { currency: 'EGP', periods: [{ price: pick([150, 175.5]), from: '01/01/2026', to: pick(['', '31/05/2026']) }, { price: 200, from: '01/06/2026', to: '' }] } } }), 'u', '']); });
  for (let i = 0; i < ri(4); i++) rem.push([pick(CL), pick([T, 't2']), pick(['تأشيرة وباركود', 'تذاكر', 'خصم', 'برنامج ديوان - دابل']), '', '', '']);
  return { pil, trips, items, meta, tp, cp_, rem };
}
const raw = v => v instanceof Date ? { $d: v.getTime() } : v; const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
function runPg(d) {
  const ins = (tbl, rows) => rows.map((r, i) => `insert into store_rows(tbl,rid,ord,raw) values (${lit(tbl)},${lit(tbl + i)},${i + 1},${lit(JSON.stringify(r.map(raw)))}::jsonb);`).join('\n');
  const sql = `begin; delete from store_rows where tbl in ('acc_items','acc_meta','pilgrims','trips','acc_trip_prices','acc_client_prices','acc_removed');
${ins('acc_items', d.items)}\n${ins('acc_meta', d.meta)}\n${ins('pilgrims', d.pil)}\n${ins('trips', d.trips)}\n${ins('acc_trip_prices', d.tp)}\n${ins('acc_client_prices', d.cp_)}\n${ins('acc_removed', d.rem)}
select _ae_sync_trip('t1','u'); select 'ITEMS', coalesce(jsonb_agg(raw order by ord, rid), '[]') from store_rows where tbl='acc_items'; select 'META', coalesce(jsonb_agg(raw order by ord, rid), '[]') from store_rows where tbl='acc_meta'; rollback;`;
  const out = cp.execFileSync('psql', ['-qAt', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim().split('\n');
  const res = JSON.parse(out.find(l => l.startsWith('{')) || '{}'); const it = JSON.parse(out.find(l => l.startsWith('ITEMS|')).slice(6)), me = JSON.parse(out.find(l => l.startsWith('META|')).slice(5));
  return { res, it, me }; }
const norm = (rows, known) => rows.filter(r => r.some(c => c !== '' && c != null)).map(r => r.map((c, j) => (j === 12 || j === 14 || j === 6 && false) ? '' : (c && c.$d !== undefined ? '' : c))).map(r => { r = r.slice(); return r; });
let cur; ctx._accPerm_ = () => ({ username: 'u' }); ctx.requireAuth_ = () => ({ username: 'u' }); ctx._sheetColMap_ = s => s.colmap; ctx.logChange_ = () => {};
ctx._accSheet_ = n => n === ctx.ACC_ITEMS_SHEET ? cur.items : n === ctx.ACC_META_SHEET ? cur.meta : n === ctx.ACC_TRIP_PRICES_SHEET ? cur.tp : cur.cp;
ctx.getSpreadsheet_ = () => ({ getSheetByName: n => n === ctx.ACC_REMOVED_SHEET ? cur.rem : null });
ctx._getPilgrimsSheet_ = () => cur.pil; ctx._getTripsSheet_ = () => cur.trips; ctx.getCachedData_ = () => null; ctx.setCachedData_ = () => {}; ctx.clearCachedData_ = () => {}; ctx._tripFormatDate_ = d => String(d || '');
ctx._accId_ = p => p + 'NEW'; ctx._dvBump_ = () => {};
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) };
function loadDraftPg(d, client) {
  const ins = (tbl, rows) => rows.map((r, i) => `insert into store_rows(tbl,rid,ord,raw) values (${lit(tbl)},${lit(tbl + i)},${i + 1},${lit(JSON.stringify(r.map(raw)))}::jsonb);`).join('\n');
  const sql = `begin; delete from store_rows where tbl in ('acc_items','acc_meta','pilgrims','trips','acc_trip_prices','acc_client_prices','acc_removed');
${ins('acc_items', d.items)}\n${ins('pilgrims', d.pil)}\n${ins('trips', d.trips)}\n${ins('acc_trip_prices', d.tp)}\n${ins('acc_removed', d.rem)}
select rx2_accgeneratedraft(('[null,"' || ${lit(client)} || '","t1","برنامج"]')::jsonb,'u'); rollback;`;
  const out = cp.execFileSync('psql', ['-qAt', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim().split('\n'); return JSON.parse(out.find(l => l.startsWith('{')));
}
if (process.env.DRAFT) {
  let badD = 0, n = 0, withItems = 0;
  for (let k = 0; k < N; k++) {
    const d = gen(); const sh = (h, r) => mk(h, JSON.parse(JSON.stringify(r)));
    cur = { items: sh(ctx.ACC_ITEMS_HEADERS, d.items), meta: sh(ctx.ACC_META_HEADERS, d.meta), pil: sh(ctx.PILGRIMS_HEADERS_, d.pil), trips: sh(ctx.TRIPS_HEADERS_, d.trips), tp: sh(ctx.ACC_TRIP_PRICES_HEADERS, d.tp), cp: sh(ctx.ACC_CLIENT_PRICES_HEADERS, d.cp_), rem: mk(['a', 'b', 'c', 'd', 'e', 'f'], d.rem) };
    ctx._accClientStatsIdxReset_ && ctx._accClientStatsIdxReset_();
    for (const c of CL) { n++; const js = JSON.parse(JSON.stringify(ctx.accGenerateDraft('x', c, 't1', 'برنامج'))); const pg = loadDraftPg(d, c); if (js.items && js.items.length) withItems++;
      const A = JSON.stringify(js), B = JSON.stringify(pg); const canon = o => JSON.stringify(JSON.parse(JSON.stringify(o), (kk, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v), (kk, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);
      if (canon(js) !== canon(pg)) { badD++; if (badD <= 3) { console.log('DRAFT MISMATCH', c, k); console.log(' JS', A.slice(0, 600)); console.log(' PG', B.slice(0, 600)); } } }
  }
  console.log('draft cases', n, 'withItems', withItems, 'mismatch', badD); process.exit(badD ? 1 : 0);
}
let bad = 0, stat = { vz: 0, prog: 0, chg: 0 };
for (let k = 0; k < N; k++) {
  const d = gen(); const sh = (h, r) => mk(h, JSON.parse(JSON.stringify(r)));
  cur = { items: sh(ctx.ACC_ITEMS_HEADERS, d.items), meta: sh(ctx.ACC_META_HEADERS, d.meta), pil: sh(ctx.PILGRIMS_HEADERS_, d.pil), trips: sh(ctx.TRIPS_HEADERS_, d.trips), tp: sh(ctx.ACC_TRIP_PRICES_HEADERS, d.tp), cp: sh(ctx.ACC_CLIENT_PRICES_HEADERS, d.cp_), rem: mk(['a', 'b', 'c', 'd', 'e', 'f'], d.rem) };
  ctx._accClientStatsIdxReset_ && ctx._accClientStatsIdxReset_();
  const before = JSON.stringify(cur.items.rows);
  ctx.ACC_META_SHEET && 0;
  let js; try { js = ctx._syncTripAccounts_(null, T, 'u'); } catch (e) { console.log('JS ERR', e.message); bad++; break; }
  const jitems = norm(cur.items.rows.map(r => r.map(c => c instanceof Date ? { $d: 1 } : c))), jmeta = norm(cur.meta.rows.map(r => r.map(c => c instanceof Date ? { $d: 1 } : c)));
  let pg; try { pg = runPg(d); } catch (e) { console.log('PG ERR', String(e.stderr || e).slice(0, 400)); bad++; break; }
  const pitems = norm(pg.it), pmeta = norm(pg.me);
  const fix = rows => rows.map(r => { r = r.slice(); r[0] = String(r[0]).startsWith('I') && /NEW$|^I[0-9a-z]{6,}/.test(r[0]) && !/^I\d+$/.test(r[0]) ? 'NEW' : r[0]; return r.map(c => typeof c === 'number' ? Math.round(c * 1e6) / 1e6 : c); });
  const A = JSON.stringify(fix(jitems)), B = JSON.stringify(fix(pitems)), MA = JSON.stringify(jmeta.map(r => r.slice(0, 5))), MB = JSON.stringify(pmeta.map(r => r.slice(0, 5)));
  const modes = d.meta.map(m => m[2]); if (modes.includes('تأشيرة وباركود')) stat.vz++; if (modes.includes('برنامج')) stat.prog++; if (js && (js.created || js.updated || js.removed)) stat.chg++;
  if (A !== B || MA !== MB || (js.created !== pg.res.created) || (js.updated !== pg.res.updated) || (js.removed !== pg.res.removed)) { bad++; if (bad <= 3) { console.log('MISMATCH #' + k, JSON.stringify(js), JSON.stringify(pg.res)); if (A !== B) { console.log(' JS items', A.slice(0, 700)); console.log(' PG items', B.slice(0, 700)); } if (MA !== MB) { console.log(' JS meta', MA); console.log(' PG meta', MB); } } }
}
console.log('datasets', N, 'mismatch', bad, 'withVZ', stat.vz, 'withProg', stat.prog, 'changed', stat.chg); process.exit(bad ? 1 : 0);
