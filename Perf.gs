/* ============================================================================
   ⏱️ (V4.360) قياس الأداء — الموجة 0 من «خطة السرعة اللحظية»
   ----------------------------------------------------------------------------
   • على الخادم: غلاف توقيت لكل دالة عامة (لا تنتهي بـ _) — يُركَّب مرة عند تحميل هذا الملف. النداء الذي يتجاوز
     PERF_SLOW_MS_ يُسجَّل في كاش دائري (آخر 6 ساعات): اسم الدالة، الزمن، هل انتهت بخطأ. النداءات الداخلية بين
     الدوال العامة لا تُقاس مرتين (عدّاد عمق). الكلفة على النداء السريع ≈ صفر (لا كتابة إلا للبطيء).
   • في المتصفح (index_web وبرنامج الحجوزات): زمن الذهاب والإياب لكل نداء — ما يشعر به المستخدم فعلاً — يُجمَّع
     ويُرسل كل 5 دقائق في نداء واحد (perfReport) يُلحق سطراً واحداً بورقة «⏱️ قياس الأداء» المخفية.
   • شاشة المدير: الإعدادات ← «⏱️ قياس الأداء — أبطأ العمليات» (perfTop) + مفتاح إيقاف (perfSetOn).
   ⚠️ يجب أن يكون هذا الملف **آخر ملف** في قائمة ملفات المشروع: الغلاف يلفّ الدوال المعرَّفة في الملفات التي حُمِّلت
     قبله فقط (Apps Script يحمّل الملفات بترتيب القائمة). لو لم يكن الأخير، يقيس ما قبله فقط — بلا أي ضرر.
   ============================================================================ */
var PERF_SLOW_MS_ = 800, PERF_RING_ = 150, PERF_SHEET_ = '⏱️ قياس الأداء', PERF_PROP_OFF_ = 'PERF_OFF';
var _PERF_DEPTH_ = 0;

function _perfRec_(name, ms, failed) {
  try {
    var c = CacheService.getScriptCache();
    if (c.get('perf_off') === '1') return;
    c.put('perf_s_' + Math.floor(Math.random() * PERF_RING_), JSON.stringify({ f: name, ms: ms, at: Date.now(), e: failed ? 1 : 0 }), 21600);
  } catch (e) {}
}
function _perfWrap_(name, fn) {
  var w = function () {
    if (_PERF_DEPTH_ > 0) return fn.apply(this, arguments);
    _PERF_DEPTH_++;
    var t0 = Date.now(), failed = false;
    try { return fn.apply(this, arguments); }
    catch (e) { failed = true; throw e; }
    finally {
      _PERF_DEPTH_--;
      var ms = Date.now() - t0;
      if (ms >= PERF_SLOW_MS_) _perfRec_(name, ms, failed);
    }
  };
  w._perfOrig_ = fn;
  return w;
}
// يلفّ كل دالة عامة معرَّفة بالمشروع (لا الدوال المدمجة ولا الخدمات) — مرة واحدة لكل تنفيذ
function _perfInstall_() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this, n = 0;
  if (!G || G.__perfInstalled__) return 0;
  Object.keys(G).forEach(function (k) {
    if (/_$/.test(k) || /^_/.test(k)) return;
    var f = G[k];
    if (typeof f !== 'function' || f._perfOrig_) return;
    var src = '';
    try { src = Function.prototype.toString.call(f); } catch (e) { return; }
    if (src.indexOf('function ' + k + '(') !== 0 || src.indexOf('[native code]') >= 0) return;   // دوال المشروع المعرَّفة بالاسم فقط
    try { G[k] = _perfWrap_(k, f); n++; } catch (e) {}
  });
  try { G.__perfInstalled__ = n; } catch (e) {}
  return n;
}
try { _perfInstall_(); } catch (ePI) {}
// 🚀 (V4.364) زمن تحميل كود الخادم: من أول سطر في Code.gs حتى هنا (آخر ملف) — يُدفع مع كل تنفيذ قبل أي دالة.
// عيّنة 1 من 5 تنفيذات (أو كل تحميل ≥ 1.5 ث) في حلقة كاش مستقلة perf_b_N، لتبقى الكلفة ≈ صفر.
var PERF_BOOT_RING_ = 60, _PERF_BOOT_MS_ = -1;
try {
  if (typeof __PERF_T0__ === 'number') {
    _PERF_BOOT_MS_ = Date.now() - __PERF_T0__;
    if (_PERF_BOOT_MS_ >= 1500 || Math.random() < 0.2) {
      var _pbc_ = CacheService.getScriptCache();
      if (_pbc_.get('perf_off') !== '1') _pbc_.put('perf_b_' + Math.floor(Math.random() * PERF_BOOT_RING_), JSON.stringify({ ms: _PERF_BOOT_MS_, at: Date.now() }), 21600);
    }
  }
} catch (ePB) {}

// ---------- من المتصفح: دفعة قياسات ----------
function _perfSession_(token) {
  try { var s = requireAuth_(token); return { user: String(s.username || ''), admin: _sessionHasPerm_(s, 'admin') }; } catch (e1) {}
  try { var u = requireSession_(token); return { user: String(u.username || ''), admin: u.role === 'admin' }; } catch (e2) {}
  throw new Error('جلسة غير صالحة');
}
function _perfSheet_() {
  var ss = getSpreadsheet_(), sh = ss.getSheetByName(PERF_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(PERF_SHEET_);
    sh.getRange(1, 1, 1, 4).setValues([['الوقت', 'البرنامج', 'المستخدم', 'القياسات (JSON: الدالة، العدد، المجموع ms، الأقصى ms، عدد > 3ث، الأخطاء)']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}
// items = [[fn, n, totalMs, maxMs, slowN, errN], ...]
function perfReport(token, app, items) {
  var s = _perfSession_(token);
  if (PropertiesService.getScriptProperties().getProperty(PERF_PROP_OFF_) === '1') return { success: true, on: false };
  var clean = [];
  (Array.isArray(items) ? items : []).slice(0, 300).forEach(function (it) {
    if (!Array.isArray(it) || !/^[\w$]{1,80}$/.test(String(it[0]))) return;
    var num = function (v, mx) { v = Math.round(Number(v) || 0); return Math.max(0, Math.min(mx, v)); };
    clean.push([String(it[0]), num(it[1], 100000), num(it[2], 1e9), num(it[3], 1e7), num(it[4], 100000), num(it[5], 100000)]);
  });
  if (!clean.length) return { success: true, on: true };
  var sh = _perfSheet_();
  sh.appendRow([new Date(), app === 'hb' ? 'الحجوزات' : 'العمرة', s.user, JSON.stringify(clean)]);   // سطر واحد ذرّي
  try { if (sh.getLastRow() > 20000) sh.deleteRows(2, 5000); } catch (e) {}   // سقف حجم الورقة
  return { success: true, on: true };
}

// ---------- شاشة المدير ----------
function perfTop(token, opts) {
  var s = _perfSession_(token);
  if (!s.admin) throw new Error('للمدير فقط');
  opts = opts || {};
  var days = Math.max(1, Math.min(30, parseInt(opts.days, 10) || 1));
  var since = Date.now() - days * 86400000;
  var agg = {}, users = {}, nRows = 0;
  var sh = getSpreadsheet_().getSheetByName(PERF_SHEET_);
  if (sh && sh.getLastRow() > 1) {
    var last = sh.getLastRow(), from = Math.max(2, last - 20000 + 1);
    sh.getRange(from, 1, last - from + 1, 4).getValues().forEach(function (r) {
      var t = r[0] instanceof Date ? r[0].getTime() : 0; if (t < since) return;
      var list = []; try { list = JSON.parse(r[3] || '[]'); } catch (e) { return; }
      nRows++; users[r[2]] = 1;
      list.forEach(function (x) {
        var k = r[1] + '|' + x[0], a = agg[k] || (agg[k] = { app: String(r[1]), fn: x[0], n: 0, tot: 0, max: 0, slow: 0, err: 0 });
        a.n += +x[1] || 0; a.tot += +x[2] || 0; a.max = Math.max(a.max, +x[3] || 0); a.slow += +x[4] || 0; a.err += +x[5] || 0;
      });
    });
  }
  var client = Object.keys(agg).map(function (k) { var a = agg[k]; a.avg = a.n ? Math.round(a.tot / a.n) : 0; return a; });
  var byTot = client.slice().sort(function (a, b) { return b.tot - a.tot; }).slice(0, 30);
  var byAvg = client.filter(function (a) { return a.n >= 3; }).sort(function (a, b) { return b.avg - a.avg; }).slice(0, 30);
  // الخادم: الكاش الدائري (آخر 6 ساعات)
  var srv = {}, keys = [];
  for (var i = 0; i < PERF_RING_; i++) keys.push('perf_s_' + i);
  var got = {}; try { got = CacheService.getScriptCache().getAll(keys) || {}; } catch (e) {}
  Object.keys(got).forEach(function (k) {
    var o = null; try { o = JSON.parse(got[k]); } catch (e) {} if (!o || !o.f) return;
    var a = srv[o.f] || (srv[o.f] = { fn: o.f, n: 0, tot: 0, max: 0, err: 0, lastAt: 0 });
    a.n++; a.tot += o.ms; a.max = Math.max(a.max, o.ms); a.err += o.e ? 1 : 0; a.lastAt = Math.max(a.lastAt, o.at);
  });
  var server = Object.keys(srv).map(function (k) { var a = srv[k]; a.avg = Math.round(a.tot / a.n); return a; })
    .sort(function (a, b) { return b.tot - a.tot; }).slice(0, 30);
  var bk = [], boot = { n: 0, avg: 0, max: 0 }, bt = 0;
  for (var j = 0; j < PERF_BOOT_RING_; j++) bk.push('perf_b_' + j);
  var gotB = {}; try { gotB = CacheService.getScriptCache().getAll(bk) || {}; } catch (e) {}
  Object.keys(gotB).forEach(function (k) { var o = null; try { o = JSON.parse(gotB[k]); } catch (e) {} if (!o || !(o.ms >= 0)) return; boot.n++; bt += o.ms; boot.max = Math.max(boot.max, o.ms); });
  if (boot.n) boot.avg = Math.round(bt / boot.n);
  var installed = 0; try { installed = (typeof globalThis !== 'undefined' && globalThis.__perfInstalled__) || 0; } catch (e) {}
  return { success: true, days: days, byTotal: byTot, byAvg: byAvg, server: server, reports: nRows, users: Object.keys(users).length,
    slowMs: PERF_SLOW_MS_, wrapped: installed, boot: boot, on: PropertiesService.getScriptProperties().getProperty(PERF_PROP_OFF_) !== '1' };
}
function perfSetOn(token, on) {
  var s = _perfSession_(token);
  if (!s.admin) throw new Error('للمدير فقط');
  var p = PropertiesService.getScriptProperties();
  if (on) { p.deleteProperty(PERF_PROP_OFF_); try { CacheService.getScriptCache().remove('perf_off'); } catch (e) {} }
  else { p.setProperty(PERF_PROP_OFF_, '1'); try { CacheService.getScriptCache().put('perf_off', '1', 21600); } catch (e) {} }
  try { logChange_(s.user, on ? 'تشغيل قياس الأداء' : 'إيقاف قياس الأداء', '-', 'PERF', '-', on ? 'مفعّل' : 'موقوف'); } catch (e) {}
  return { success: true, on: !!on };
}
