// اختبار تطابق: getAgentAccount (Code.gs) مقابل rx2_getagentaccount (028) على بيانات عشوائية (بدون حقول GL التي يكمّلها المتصفح بالخلفية).
const fs = require('fs'), vm = require('vm'), cp = require('child_process');
const DB = process.env.PGDB || 't385', N = +(process.env.N || 150);
const tzfmt = (d, tz, f) => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).forEach(x => p[x.type] = x.value);
  return f === 'HH:mm' ? p.hour + ':' + p.minute : f === 'dd/MM/yyyy HH:mm' ? p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute : p.day + '/' + p.month + '/' + p.year; };
const ctx = { console, Date, Math, JSON, String, Number, Object, Array, RegExp, parseInt, parseFloat, isNaN, Error, Logger: { log() {} }, Utilities: { formatDate: tzfmt, DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (alg, str) => Array.from(require('crypto').createHash('md5').update(str, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
  base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_') } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);
let seed = +(process.env.SEED || 3); const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)], ri = n => Math.floor(rnd() * n);
const sheet = (rows, hdr) => ({ getLastRow: () => rows.length + 1, getLastColumn: () => rows[0] ? rows[0].length : 1,
  getRange(r, c, nr, nc) { return { getValues: () => hdr ? rows.slice(r - 2, r - 2 + nr).map(x => x.slice(c - 1, c - 1 + nc)) : [hdr0].concat(rows).slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)) }; } });
let hdr0 = [];
const AG = ['وكيل1', 'وكيل2', 'وكيل3'], CO = ['شركة أ', 'شركة ب', 'شركة ج', ''];
const dstr = () => pick(['01/05/2026', '15/04/2026', '3/2/2026', '20/06/2026', '', 'x']);
const dcell = () => rnd() < .25 ? new Date(2026, ri(8), 1 + ri(27)) : dstr();
function gen() {
  const files = [], items = [], pays = [], acct = [], tp = [], bk = [], ov = [];
  for (let i = 0; i < ri(14); i++) { const r = new Array(29).fill(''); r[0] = 'F' + i; r[1] = i + 1; r[3] = pick(['تم الإرسال', 'تم إصدار الموفا', '', 'تم السداد']); r[4] = dcell(); r[5] = pick(CO); r[6] = pick(AG);
    r[7] = pick(['t1', 't2', '']); r[8] = JSON.stringify(Array.from({ length: ri(3) }, (_, k) => ({ name: 'عميل' + k, count: pick([0, 1, 4, '2']) }))); r[10] = pick([0, 5, 10, '7']); r[11] = pick([0, 100, 250.5]); r[26] = '[]'; files.push(r); }
  for (let i = 0; i < ri(12); i++) { const r = new Array(12).fill(''); r[0] = 'I' + i; r[1] = pick([...AG, 'وكيل1 - شركة أ', 'وكيل2 - شركة ب']); r[2] = 'بند' + i; r[3] = pick(['SAR', 'EGP', '']); r[4] = pick([100, 50.5, 0, 1000]);
    r[5] = pick(['نعم', '', 'لا']); r[6] = pick(['', 'ملاحظة', 'ن ⟦src:gl-E1⟧', '⟦src:gl-E2⟧ خ']); r[7] = pick([0, 1, 2]); r[8] = 'u'; r[9] = rnd() < .5 ? new Date(2026, ri(8), 1 + ri(27), ri(24), ri(60)) : '01/05/2026 10:30'; r[10] = pick(['', '55']); r[11] = dcell(); items.push(r); }
  for (let i = 0; i < ri(10); i++) { const r = new Array(9).fill(''); r[0] = 'P' + i; r[1] = pick([...AG, 'وكيل1 - شركة أ']); r[2] = dcell(); r[3] = pick([100, 200.5, 0]); r[4] = pick(['SAR', 'EGP', '']); r[5] = pick(['', 'دفعة', 'خ ⟦src:gl-E9⟧']); r[6] = 'u'; r[7] = '01/05/2026 10:30'; r[8] = pick(['', '7']); pays.push(r); }
  AG.forEach(a => CO.filter(Boolean).forEach(c => { if (rnd() < .5) acct.push([a, c, pick(['عام', 'منفصل', 'مشترك']), pick(['', 'شركة أ']), '', 'u', '', pick(['نعم', 'لا', ''])]); }));
  for (let i = 0; i < ri(4); i++) tp.push([pick(AG), pick([0, 90, 120]), pick(['01/01/2026', '01/04/2026']), pick(['', '30/06/2026']), 'u', '']);
  const H = ctx.BOOKINGS_HEADERS_, m = {}; H.forEach((h, i) => m[h] = i);
  for (let i = 0; i < ri(12); i++) { const r = new Array(H.length).fill(''); r[m['رقم الإشعار']] = 100 + i; r[m['شركة النقل الداخلي']] = pick(['الوكيل', 'الوكيل', 'النقل بمعرفة العميل', 'مورد س', '']);
    r[m['الوكيل السعودي']] = pick(AG); r[m['الشركة المصرية']] = pick(CO); r[m['عدد الباصات']] = pick([0, 1, 2, 3, 'النقل بمعرفة العميل', '']); r[m['سعر الباص']] = pick(['', 0, 80, '95.5']);
    r[m['تاريخ الوصول']] = pick(['01/05/2026', '15/04/2026', '', '20/06/2026']); r[m['منفذ الوصول']] = pick(['القاهرة → جدة', 'مطار جدة', 'a/b/c', '']); r[m['منفذ المغادرة']] = pick(['جدة → القاهرة', 'مطار المدينة', '']);
    r[m['اسم المجموعة']] = pick(['', 'مجموعة']); r[m['اسم الرحلة']] = pick(['t1', '', 't2']); r[m['العميل']] = pick(['', 'عميل']);
    r[m['مقاطع نقل إضافية']] = pick(['', '[]', '[{"desc":"مقطع","value":50}]', 'xx']); bk.push(r); }
  for (let i = 0; i < ri(3); i++) ov.push([String(100 + ri(12)), pick(['', 'مورد ج', AG[0]]), pick(['', 'بيان معدّل']), 'ملاحظة', 'u', '', pick(['', '9'])]);
  return { files, items, pays, acct, tp, bk, ov, H };
}
const raw = v => v instanceof Date ? { $d: v.getTime() } : v;
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
function loadPg(d, key, flt) {
  const ins = (tbl, rows) => rows.map((r, i) => `insert into store_rows(tbl,rid,ord,raw) values (${lit(tbl)},${lit(tbl + i)},${i + 1},${lit(JSON.stringify(r.map(raw)))}::jsonb);`).join('\n');
  const sql = `delete from store_rows where tbl in ('vz_files','vz_items','vz_payments','agent_company_accounts','vz_transport_prices','bookings','transport_overrides');
delete from store_meta where tbl='bookings'; insert into store_meta(tbl,hdr,ver) values ('bookings', ${lit(JSON.stringify(d.H))}::jsonb, 1);
${ins('vz_files', d.files)}\n${ins('vz_items', d.items)}\n${ins('vz_payments', d.pays)}\n${ins('agent_company_accounts', d.acct)}\n${ins('vz_transport_prices', d.tp)}\n${ins('bookings', d.bk)}\n${ins('transport_overrides', d.ov)}
select rx2_getagentaccount(${lit(JSON.stringify([null, key, flt]))}::jsonb,'u');`;
  const out = cp.execFileSync('psql', ['-qAt', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}
const same = (a, b) => { if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-7; if (a && b && typeof a === 'object') { if (Array.isArray(a) !== Array.isArray(b)) return false; const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => same(a[k], b[k])); } return a === b; };
let cur;
ctx._vzFinancePerm_ = () => ({ username: 'u' }); ctx._tz_ = () => 'Africa/Cairo'; ctx._glSSId_ = () => ''; ctx._ledgerOn_ = () => false;
const S = {}; ctx._accSheet_ = n => S[n]; ctx.getSpreadsheet_ = () => ({ getSheetByName: n => n === 'Bookings' ? S.bookings : null });
let bad = 0, rowsSeen = 0; const st = { f: 0, r: 0, i: 0, p: 0 };
for (let k = 0; k < N; k++) {
  const d = gen(); hdr0 = [];
  S[ctx.VZ_FILES_SHEET] = sheet(d.files, true); S[ctx.VZ_ITEMS_SHEET] = sheet(d.items, true); S[ctx.VZ_PAY_SHEET] = sheet(d.pays, true); S[ctx.VZ_ACCT_SHEET] = sheet(d.acct, true);
  S[ctx.VZ_TRANS_PRICES_SHEET] = sheet(d.tp, true); S[ctx.TA_OVR_SHEET] = sheet(d.ov, true);
  hdr0 = d.H; S.bookings = sheet(d.bk, false);
  const key = pick([...AG, 'وكيل1 - شركة أ', 'وكيل2 - شركة ب']);
  const flt = pick([{}, { from: '01/04/2026', to: '31/05/2026' }, { company: 'شركة أ' }, { status: 'تم الإرسال' }, { from: '01/05/2026' }]);
  const js = JSON.parse(JSON.stringify(ctx.getAgentAccount('x', key, flt))); delete js.ledgerPend;
  let pg; try { pg = loadPg(d, key, flt); } catch (e) { console.log('PG ERR', String(e.stderr || e).slice(0, 400)); bad++; break; } delete pg.ledgerPend; delete pg.glExtras;
  rowsSeen += (js.files || []).length + (js.transportRuns || []).length; st.f += (js.files || []).length; st.r += (js.transportRuns || []).length; st.i += (js.items || []).length; st.p += (js.payments || []).length;
  if (!same(js, pg)) { bad++; if (bad <= 3) { console.log('MISMATCH #' + k, key, JSON.stringify(flt)); for (const f of Object.keys(js)) if (!same(js[f], pg[f])) { console.log(' field', f); console.log('  js', JSON.stringify(js[f]).slice(0, 400)); console.log('  pg', JSON.stringify(pg[f]).slice(0, 400)); } } }
}
console.log('datasets', N, 'mismatch', bad, 'files', st.f, 'runs', st.r, 'items', st.i, 'pays', st.p); process.exit(bad ? 1 : 0);
