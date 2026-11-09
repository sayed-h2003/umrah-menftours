// اختبار: كتلة BKSRV_ بالواجهة تعمل وتعطي نفس نتائج دوال Code.gs (تُحمَّل الدوال من Code.gs وتُقارَن على مدخلات عشوائية)
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync('Code.gs', 'utf8'), html = fs.readFileSync('index_web.html', 'utf8');
const names = ['_noJunk_', '_fmtDT_', '_portSaudiSide_', '_deriveStaySegments_', 'validateMovementsLogic_', 'buildAllMovements_'];
function grab(n) { const i = code.search(new RegExp('^function ' + n + '\\(', 'm')); const j = code.indexOf('\n}\n', i) + 3; return code.slice(i, j); }
const srvCtx = {}; vm.createContext(srvCtx); vm.runInContext(names.map(grab).join('\n'), srvCtx);
const m = html.match(/<script>\n\/\*BKSRV_BEGIN[\s\S]*?\/\*BKSRV_END\*\/\n<\/script>/); if (!m) throw new Error('block missing');
const cli = { window: {} }; vm.createContext(cli); vm.runInContext(m[0].replace(/^<script>|<\/script>$/g, ''), cli);
const C = cli.window.BKSRV_;
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)];
const dt = (d) => ('0' + d).slice(-2) + '/05/2026';
const types = ['مزارات المدينة', 'مزارات مكة', 'من المدينة الى مكة', 'من مكة الى المدينة', 'إقامة إضافية بمكة', 'اخرى', 'مزارات'];
let bad = 0, n = 0, errs = 0;
for (let k = 0; k < 4000; k++) {
  const dir = pick(['المدينة أولاً', 'مكة أولاً', 'مكة فقط', 'المدينة فقط', '']);
  const b = { direction: dir, arrivalDate: dt(1 + Math.floor(rnd() * 5)), arrivalTime: '10:00', departureDate: dt(10 + Math.floor(rnd() * 8)), departureTime: '12:00',
    madinahCheckIn: dt(1 + Math.floor(rnd() * 5)), madinahCheckOut: dt(4 + Math.floor(rnd() * 8)), makkahCheckIn: dt(4 + Math.floor(rnd() * 8)), makkahCheckOut: dt(10 + Math.floor(rnd() * 8)),
    arrivalPort: 'القاهرة → جدة', departurePort: 'جدة - القاهرة', madinahHotel: 'H1', makkahHotel: 'H2', busCount: pick(['', '2', 'x']),
    extraMovements: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ type: pick(types), date: dt(1 + Math.floor(rnd() * 16)), time: pick(['', '09:30']), toDate: dt(5 + Math.floor(rnd() * 10)) })) };
  if (rnd() < 0.3) b.extraMovements = JSON.stringify(b.extraMovements);
  const b2 = JSON.parse(JSON.stringify(b)); b.__strictDates__ = b2.__strictDates__ = true;
  const e1 = JSON.stringify(vm.runInContext('validateMovementsLogic_', srvCtx)(b)), e2 = JSON.stringify(C.validate(b2));
  const m1 = JSON.stringify(vm.runInContext('buildAllMovements_', srvCtx)(JSON.parse(JSON.stringify(b2)))), m2 = JSON.stringify(C.build(JSON.parse(JSON.stringify(b2))));
  n++; if (e1 !== 'null') errs++; if (e1 !== e2 || m1 !== m2) bad++;
}
console.log('cases', n, 'withValidationError', errs, 'mismatch', bad); process.exit(bad ? 1 : 0);
