/* ============================================================
   🛡️ (V4.345) سجل التتبع المحصّن — Audit Trail غير قابل للتلاعب
   ------------------------------------------------------------
   • ملف مستقل (ينشئه السكربت تلقائياً) يُحفظ معرّفه بخاصية AUDIT_SS_ID — لا يُشارك بالتعديل مع أي إنسان (ولا الأدمن):
     الكتابة عبر السكربت فقط (حساب مالك المشروع).
   • كل سطر يحمل بصمة SHA-256 لـ (بصمة السطر السابق + محتواه) ⇒ حذف/تعديل أي سطر يكسر السلسلة من بعده.
   • مرساة يومية: بصمة آخر سطر تُرسل لتليجرام الإدارة وتُسجَّل بورقة Anchors (دليل خارجي لا يمكن إعادة كتابته).
   • الرفض عند الفشل (fail-closed): لو تعذّرت كتابة السجل يُحفظ السطر بطابور احتياطي (لا يضيع) وتُرفع علامة AUD_FAIL،
     وبعدها تُرفض كل عمليات الحفظ (_audGate_ في قفل الحسابات وأقفال الحفظ) حتى يعود السجل وتُفرَّغ الطوابير.
   • التخزين نصي بالكامل (تنسيق @) والبصمة على القيم كما تُكتب بالضبط ⇒ إعادة الحساب من الشيت تطابق.
   ============================================================ */
var AUD_PROP_ID_ = 'AUDIT_SS_ID', AUD_PROP_HEAD_ = 'AUDIT_HEAD', AUD_PROP_FAIL_ = 'AUD_FAIL', AUD_PROP_VER_ = 'AUD_VERIFIED', AUD_Q_PFX_ = 'AUDQ_';
var AUD_HDR_ = ['التسلسل', 'الوقت', 'المستخدم', 'الجلسة', 'الطلب', 'النوع', 'العملية', 'السجل', 'الحقل', 'القيمة القديمة', 'القيمة الجديدة', 'البصمة'];
var AUD_MAXV_ = 2000;   // أقصى طول للقيمة القديمة/الجديدة بالسطر
var _AUD_SS_ = null, _AUD_REQ_ = null;

function _audHash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)).replace(/=+$/, '');
}
// معرّف الطلب: ثابت طوال التنفيذ الواحد ⇒ يجمع كل التغييرات الناتجة عن ضغطة حفظ واحدة
function _audReq_() { return _AUD_REQ_ || (_AUD_REQ_ = String(Utilities.getUuid()).replace(/-/g, '').slice(0, 10)); }
// الجلسة: بصمة مختصرة لرمز الدخول (لا يُخزَّن الرمز نفسه)
function _audSess_() {
  try { var t = (typeof _AUTH_MEMO_ !== 'undefined' && _AUTH_MEMO_ && _AUTH_MEMO_.t) || ''; return t ? _audHash_('s:' + t).slice(0, 10) : ''; } catch (e) { return ''; }
}
function _audTs_() {
  var tz = 'Asia/Riyadh'; try { tz = (typeof _tz_ === 'function' && _tz_()) || tz; } catch (e) {}
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss.SSS');
}
// قيمة نصية آمنة: بلا صيغ (=…) وبطول محدود — تُخزَّن وتُبصَم كما هي
function _audVal_(v) {
  if (v === undefined || v === null) return '';
  var s = (typeof v === 'object') ? JSON.stringify(v) : String(v);
  if (s.length > AUD_MAXV_) s = s.slice(0, AUD_MAXV_) + '…';
  if (/^[=+@]/.test(s)) s = '​' + s;
  return s;
}
function _audType_(action) {
  var a = String(action || '');
  if (/حذف|إزالة|مسح/.test(a)) return 'حذف';
  if (/إضافة|إنشاء|تسجيل (?!دخول|خروج)|جديد|استيراد/.test(a)) return 'إضافة';
  if (/دخول|خروج/.test(a)) return 'دخول/خروج';
  if (/إلغاء/.test(a)) return 'إلغاء';
  if (/ترحيل|اعتماد/.test(a)) return 'اعتماد/ترحيل';
  if (/استعادة|تراجع|رجوع/.test(a)) return 'استعادة';
  return 'تعديل';
}
function _audSS_() {
  if (_AUD_SS_) return _AUD_SS_;
  var p = PropertiesService.getScriptProperties(), id = p.getProperty(AUD_PROP_ID_), ss;
  if (id) ss = SpreadsheetApp.openById(id);   // يرمي لو حُذف/فُقد الوصول ⇒ السجل غير متاح (fail-closed)
  else {
    ss = SpreadsheetApp.create('🛡️ سجل التتبع المحصّن — برنامج العمرة (لا يُشارك ولا يُعدَّل يدوياً)');
    var sh = ss.getSheets()[0]; sh.setName('Trail');
    sh.getRange(1, 1, 1000, AUD_HDR_.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, AUD_HDR_.length).setValues([AUD_HDR_]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var an = ss.insertSheet('Anchors');
    an.getRange(1, 1, 500, 5).setNumberFormat('@');
    an.getRange(1, 1, 1, 5).setValues([['اليوم', 'آخر تسلسل', 'البصمة', 'أُرسلت إلى', 'وقت الإرسال']]).setFontWeight('bold');
    p.setProperty(AUD_PROP_ID_, ss.getId());
    p.deleteProperty(AUD_PROP_HEAD_); p.deleteProperty(AUD_PROP_VER_);
  }
  return (_AUD_SS_ = ss);
}
function _audSheet_(name) { return _audSS_().getSheetByName(name || 'Trail'); }
// رأس السلسلة: من الخاصية (سريع) مع التحقق أنها تطابق آخر صف فعلي بالورقة، وإلا يُقرأ آخر صف
function _audHead_(sh) {
  var last = sh.getLastRow(), p = PropertiesService.getScriptProperties(), h = null;
  try { h = JSON.parse(p.getProperty(AUD_PROP_HEAD_) || 'null'); } catch (e) { h = null; }
  if (h && h.row === last) return h;
  if (last < 2) return { seq: 0, hash: 'GENESIS', row: 1 };
  var r = sh.getRange(last, 1, 1, AUD_HDR_.length).getValues()[0];
  return { seq: +r[0] || 0, hash: String(r[AUD_HDR_.length - 1] || ''), row: last };
}
// محتوى السطر الذي يُبصَم (كل الأعمدة عدا البصمة) — نفس الدالة للكتابة والتحقق
function _audBody_(r) { return JSON.stringify(r.slice(0, AUD_HDR_.length - 1).map(function (x) { return String(x === null || x === undefined ? '' : x); })); }

// الكتابة الفعلية (ترمي عند الفشل). recs: [{user, action, record, field, old, new, type?, ts?, req?, sess?}]
function _audWrite_(recs) {
  if (!recs || !recs.length) return 0;
  var lock = _glNamedLock_('aud');
  if (!lock.tryLock(20000)) throw new Error('سجل التتبع مشغول');
  try {
    var sh = _audSheet_('Trail'), head = _audHead_(sh), rows = [], prev = head.hash, seq = head.seq;
    recs.forEach(function (x) {
      seq++;
      var r = [String(seq), x.ts || _audTs_(), _audVal_(x.user || 'غير معروف'), x.sess != null ? x.sess : _audSess_(), x.req || _audReq_(),
        _audVal_(x.type || _audType_(x.action)), _audVal_(x.action || '-'), _audVal_(x.record || '-'), _audVal_(x.field || ''), _audVal_(x.old), _audVal_(x['new'])];
      prev = _audHash_(prev + '|' + _audBody_(r));
      r.push(prev); rows.push(r);
    });
    var at = head.row + 1;
    if (sh.getMaxRows() < at + rows.length) sh.insertRowsAfter(sh.getMaxRows(), Math.max(1000, rows.length));
    var rg = sh.getRange(at, 1, rows.length, AUD_HDR_.length); rg.setNumberFormat('@'); rg.setValues(rows);
    PropertiesService.getScriptProperties().setProperty(AUD_PROP_HEAD_, JSON.stringify({ seq: seq, hash: prev, row: at + rows.length - 1 }));
    return rows.length;
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// الواجهة الموحّدة لكل الوحدات — ⚡ لا تفتح ملف السجل داخل عملية المستخدم: تُحفظ السطور فوراً بطابور دائم (خصائص السكربت،
// أجزاء من الثانية) بوقتها الأصلي، ثم تُسلسَل وتُبصَم وتُكتب بالملف المستقل بالترتيب عبر المُفرِّغ (النبضة + مشغّل كل دقيقة).
// تعذّر الطابور ⇒ كتابة مباشرة · تعذّرت أيضاً ⇒ علامة فشل ترفض كل حفظ لاحق (fail-closed)
var _AUD_N_ = 0;
function _audLog_(recs) {
  if (!recs || !recs.length) return;
  var base = { ts: _audTs_(), req: _audReq_(), sess: _audSess_() };
  recs = recs.map(function (x) { return Object.assign({}, base, x); });
  var rest = _audEnq_(recs);
  if (!rest.length) return;
  try { _audWrite_(rest); } catch (e) { _audFail_(e); }
}
// يقسّم السطور لأجزاء ≤ 8KB (حد قيمة الخاصية 9KB) ويعيد ما تعذّر وضعه بالطابور
function _audEnq_(recs) {
  var p = PropertiesService.getScriptProperties(), chunk = [], size = 2, i = 0;
  var put = function () {
    var k = AUD_Q_PFX_ + ('000000000000' + (Date.now() * 1000 + (_AUD_N_++ % 1000)).toString(36)).slice(-12);
    p.setProperty(k, JSON.stringify(chunk)); chunk = []; size = 2;
  };
  try {
    for (; i < recs.length; i++) {
      var js = JSON.stringify(recs[i]);
      if (js.length > 8000) { recs[i] = Object.assign({}, recs[i], { old: String(recs[i].old || '').slice(0, 3000), 'new': String(recs[i]['new'] || '').slice(0, 3000) }); js = JSON.stringify(recs[i]); }
      if (size + js.length + 1 > 8000 && chunk.length) put();
      chunk.push(recs[i]); size += js.length + 1;
    }
    if (chunk.length) put();
    return [];
  } catch (e) { return chunk.concat(recs.slice(i)); }
}
function _audFail_(err) {
  var p = PropertiesService.getScriptProperties(), msg = String((err && err.message) || err || '').slice(0, 200);
  try { p.setProperty(AUD_PROP_FAIL_, JSON.stringify({ at: _audTs_(), msg: msg })); } catch (e) {}
  try { CacheService.getScriptCache().put('aud_st', 'fail', 600); } catch (e) {}
  try {   // تنبيه الإدارة مرة كل ساعة على الأكثر
    var c = CacheService.getScriptCache();
    if (!c.get('aud_alerted')) {
      c.put('aud_alerted', '1', 3600);
      var al = '🛡️ تنبيه: تعذّرت كتابة سجل التتبع المحصّن (' + msg + ') — عمليات الحفظ موقوفة حتى يعود السجل.';
      try { _audAnchorSend_(al.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')); } catch (eA) {}   // (V4.361) لجروب الحسابات فقط
    }
  } catch (e) {}
}
function _audQKeys_() {
  return PropertiesService.getScriptProperties().getKeys().filter(function (k) { return k.indexOf(AUD_Q_PFX_) === 0; }).sort();
}
// تفريغ الطابور بالترتيب: يجمع حتى 1500 سطر بكتابة واحدة. يرمي عند الفشل (يبقى الطابور كما هو)
function _audFlushQ_(maxMs) {
  var p = PropertiesService.getScriptProperties(), keys = _audQKeys_(), t0 = Date.now(), n = 0;
  while (keys.length && Date.now() - t0 < (maxMs || 20000)) {
    var take = [], recs = [];
    while (keys.length && recs.length < 1500) {
      var k = keys.shift(), raw = p.getProperty(k); take.push(k);
      if (raw) { try { recs = recs.concat(JSON.parse(raw) || []); } catch (e) {} }
    }
    _audWrite_(recs);
    take.forEach(function (k) { p.deleteProperty(k); });
    n += recs.length;
  }
  _audSetOk_();
  return n;
}
// تفريغ خفيف بلا انتظار (من النبضة): لا يعطّل المستخدم لو كان مُفرِّغ آخر يعمل
function _audFlushSoft_() {
  try { if (!_audQKeys_().length) return 0; return _audFlushQ_(8000); } catch (e) { _audFail_(e); return 0; }
}
function audFlushCron() { try { _audFlushQ_(240000); } catch (e) { _audFail_(e); } }
function _audSetOk_() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty(AUD_PROP_FAIL_)) p.deleteProperty(AUD_PROP_FAIL_);
  try { CacheService.getScriptCache().put('aud_st', 'ok', 600); } catch (e) {}
}
// 🚧 بوابة الرفض: تُستدعى قبل أي حفظ. سليم ⇒ قراءة كاش واحدة فقط. معطّل ⇒ محاولة تفريغ ثم رفض صريح
function _audGate_() {
  var st = null; try { st = CacheService.getScriptCache().get('aud_st'); } catch (e) {}
  if (st === 'ok') return;
  var p = PropertiesService.getScriptProperties(), f = p.getProperty(AUD_PROP_FAIL_);
  if (!f) { try { CacheService.getScriptCache().put('aud_st', 'ok', 600); } catch (e) {} return; }
  try { _audFlushQ_(15000); return; } catch (e) { _audFail_(e); }
  var info = {}; try { info = JSON.parse(f) || {}; } catch (e) {}
  throw new Error('🛡️ سجل التتبع المحصّن غير متاح حالياً (' + (info.msg || 'خطأ') + ') — عمليات الحفظ موقوفة حفاظاً على الرقابة حتى يعود. أبلغ المدير.');
}

/* ---------- 📒 فروقات القيد (قبل/بعد) سطراً بسطر ---------- */
function _audSnapRows_(r, lines) {
  try {
    return { h: { 'التاريخ': _glDate_(r[2]), 'النوع': _glStr_(r[3]), 'البيان': _glStr_(r[4]), 'الحالة': _glStr_(r[5]), 'المرجع': _glStr_(r[9]), 'الرحلة': _glStr_(r[10]), 'الشركة': _glStr_(r[11]) },
      l: (lines || []).slice().sort(function (a, b) { return (+a[1] || 0) - (+b[1] || 0); }).map(function (x) { return _audLineTxt_(x); }) };
  } catch (e) { return null; }
}
function _audLineTxt_(x) {   // صف GL_Lines: [قيد, رقم, تاريخ, حالة, حساب, مدين, دائن, عملة, سعر, ..., رحلة(11), ..., بيان(15)]
  var d = _glNum_(x[5]), c = _glNum_(x[6]);
  return [_glStr_(x[4]), d ? 'مدين ' + d : '', c ? 'دائن ' + c : '', _glStr_(x[7]), 'سعر ' + _glNum_(x[8]), _glStr_(x[11]), _glStr_(x[15])]
    .filter(function (s) { return s !== ''; }).join(' | ');
}
function _audEntryDiff_(user, id, before, after, action) {
  if (!before && !after) return;
  var recs = [], rec = 'GL:' + id;
  if (!before && after) {
    recs.push({ user: user, action: action || 'إضافة قيد', type: 'إضافة', record: rec, field: 'القيد', old: '', 'new': JSON.stringify(after.h) });
    after.l.forEach(function (t, i) { recs.push({ user: user, action: action || 'إضافة قيد', type: 'إضافة', record: rec, field: 'سطر ' + (i + 1), old: '', 'new': t }); });
  } else if (before && !after) {
    recs.push({ user: user, action: action || 'حذف قيد', type: 'حذف', record: rec, field: 'القيد', old: JSON.stringify(before.h), 'new': '' });
    before.l.forEach(function (t, i) { recs.push({ user: user, action: action || 'حذف قيد', type: 'حذف', record: rec, field: 'سطر ' + (i + 1), old: t, 'new': '' }); });
  } else if (before && after) {
    Object.keys(after.h).forEach(function (k) { if (String(before.h[k]) !== String(after.h[k])) recs.push({ user: user, action: action || 'تعديل قيد', type: 'تعديل', record: rec, field: k, old: before.h[k], 'new': after.h[k] }); });
    var n = Math.max(before.l.length, after.l.length);
    for (var i = 0; i < n; i++) if ((before.l[i] || '') !== (after.l[i] || '')) recs.push({ user: user, action: action || 'تعديل قيد', type: 'تعديل', record: rec, field: 'سطر ' + (i + 1), old: before.l[i] || '', 'new': after.l[i] || '' });
  }
  if (recs.length) _audLog_(recs);
}

/* ---------- ⚓ المرساة اليومية ---------- */
// ⚓ (V4.359) المرساة تُرسل لجروب الحسابات فقط (إعدادات بوت الحسابات) — لا للجروب العام. بلا جروب حسابات مفعّل لا تُرسل،
//   ويُسجَّل السبب في ورقة المراسي (المرساة نفسها تُحفظ دائماً).
function _audAnchorSend_(html) {
  if (typeof _glBotCfg_ !== 'function' || typeof _glBotSend_ !== 'function') return 'لم تُرسل: بوت الحسابات غير متاح';
  var c = _glBotCfg_();
  if (!c.enabled || !c.chatId) return 'لم تُرسل: جروب الحسابات غير مفعّل بالإعدادات';
  _glBotSend_(c.chatId, html);
  return 'تليجرام — جروب الحسابات';
}
function audAnchorCron() {
  try {
    try { _audFlushQ_(120000); } catch (eF) { _audFail_(eF); }
    var sh = _audSheet_('Trail'), head = _audHead_(sh), an = _audSheet_('Anchors');
    var day = Utilities.formatDate(new Date(), (typeof _tz_ === 'function' && _tz_()) || 'Asia/Riyadh', 'yyyy-MM-dd');
    var sent;
    try { sent = _audAnchorSend_('⚓ <b>مرساة سجل التتبع</b> ' + day + '\nآخر تسلسل: ' + head.seq + '\nالبصمة: <code>' + head.hash + '</code>'); } catch (e) { sent = 'تعذّر الإرسال: ' + e.message; }
    var at = an.getLastRow() + 1, rg = an.getRange(at, 1, 1, 5); rg.setNumberFormat('@');
    rg.setValues([[day, String(head.seq), head.hash, sent, _audTs_()]]);
  } catch (e) { Logger.log('audAnchorCron: ' + e.message); }
}

/* ---------- 🔎 التحقق من سلامة السلسلة ---------- */
// full=true ⇒ من البداية، وإلا من آخر نقطة تحقق محفوظة. يتوقف قبل حد الوقت ويكمل من حيث انتهى بالنداء التالي
function audVerify(authToken, full) {
  var session = requireAuditLogPermission_(authToken), t0 = Date.now();
  _audFlushSoft_();
  var p = PropertiesService.getScriptProperties(), sh = _audSheet_('Trail'), last = sh.getLastRow();
  var cp = null; if (!full) { try { cp = JSON.parse(p.getProperty(AUD_PROP_VER_) || 'null'); } catch (e) { cp = null; } }
  if (!cp || cp.row > last) cp = { row: 1, seq: 0, hash: 'GENESIS' };
  var anchors = {}; try { var an = _audSheet_('Anchors'), al = an.getLastRow(); if (al >= 2) an.getRange(2, 1, al - 1, 3).getValues().forEach(function (a) { anchors[String(a[1])] = String(a[2]); }); } catch (e) {}
  var row = cp.row, prev = cp.hash, seq = cp.seq, CH = 4000, broken = null, anchorsOk = 0;
  while (row < last && Date.now() - t0 < 240000) {
    var n = Math.min(CH, last - row), vals = sh.getRange(row + 1, 1, n, AUD_HDR_.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i].map(function (x) { return String(x); }), exp = _audHash_(prev + '|' + _audBody_(r));
      if (+r[0] !== seq + 1) { broken = { seq: seq + 1, row: row + i + 1, why: 'تسلسل مفقود أو مكرر (وُجد ' + r[0] + ')' }; break; }
      if (r[AUD_HDR_.length - 1] !== exp) { broken = { seq: +r[0], row: row + i + 1, why: 'البصمة لا تطابق المحتوى — السطر عُدِّل أو سطر قبله حُذف' }; break; }
      if (anchors[r[0]] != null) { if (anchors[r[0]] !== exp) { broken = { seq: +r[0], row: row + i + 1, why: 'لا يطابق المرساة المرسلة لتليجرام' }; break; } anchorsOk++; }
      prev = exp; seq = +r[0];
    }
    if (broken) break;
    row += vals.length;
  }
  if (!broken) p.setProperty(AUD_PROP_VER_, JSON.stringify({ row: row, seq: seq, hash: prev }));
  logChange_(session.username, 'فحص سلامة سجل التتبع', 'AUD', 'النتيجة', '-', broken ? 'مكسور عند ' + broken.seq : 'سليم حتى ' + seq);
  return { success: true, ok: !broken, broken: broken, upToSeq: seq, total: Math.max(0, last - 1), done: row >= last, anchorsOk: anchorsOk };
}

/* ---------- 📋 عرض السجل للإدارة ---------- */
function audStatus(authToken) {
  requireAuditLogPermission_(authToken);
  var p = PropertiesService.getScriptProperties(), out = { success: true, configured: !!p.getProperty(AUD_PROP_ID_) };
  var f = p.getProperty(AUD_PROP_FAIL_); out.fail = f ? (JSON.parse(f) || {}) : null; out.queued = _audQKeys_().length;
  try { var h = JSON.parse(p.getProperty(AUD_PROP_HEAD_) || 'null'); out.head = h ? { seq: h.seq, hash: h.hash } : null; } catch (e) {}
  try { out.verified = JSON.parse(p.getProperty(AUD_PROP_VER_) || 'null'); } catch (e) {}
  out.cron = false; try { var hs = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }); out.cron = hs.indexOf('audAnchorCron') >= 0 && hs.indexOf('audFlushCron') >= 0; } catch (e) {}
  if (out.configured) try { var an = _audSheet_('Anchors'), al = an.getLastRow(); if (al >= 2) { var a = an.getRange(al, 1, 1, 5).getValues()[0]; out.lastAnchor = { day: String(a[0]), seq: String(a[1]), sent: String(a[3]) }; } } catch (e) {}
  out.isAdmin = false; try { out.isAdmin = _glIsAdmin_(requireAuth_(authToken)); } catch (e) {}
  if (out.isAdmin && out.configured) out.url = 'https://docs.google.com/spreadsheets/d/' + p.getProperty(AUD_PROP_ID_);
  return out;
}
// تفعيل (للأدمن): إنشاء الملف + سطر البداية + المرساة اليومية
function audSetup(authToken) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('تفعيل سجل التتبع للمدير فقط');
  _audSS_();
  if (_audSheet_('Trail').getLastRow() < 2) _audLog_([{ user: session.username, action: 'بداية سجل التتبع المحصّن', type: 'أخرى', record: 'AUD', field: 'الإصدار', 'new': 'V' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') }]);
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'audAnchorCron'; });
  if (!has) ScriptApp.newTrigger('audAnchorCron').timeBased().everyDays(1).atHour(23).create();
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'audFlushCron'; })) ScriptApp.newTrigger('audFlushCron').timeBased().everyMinutes(1).create();
  _audFlushQ_(60000);
  return audStatus(authToken);
}
// f: {user, type, q, from:'yyyy-mm-dd', to, limit}
function audList(authToken, f) {
  requireAuditLogPermission_(authToken);
  f = f || {};
  if (!PropertiesService.getScriptProperties().getProperty(AUD_PROP_ID_)) return { success: true, rows: [], total: 0 };
  _audFlushSoft_();
  var sh = _audSheet_('Trail'), last = sh.getLastRow(), lim = Math.min(+f.limit || 500, 2000), out = [];
  var u = String(f.user || '').trim(), ty = String(f.type || ''), q = String(f.q || '').trim().toLowerCase(), from = String(f.from || ''), to = String(f.to || '');
  var row = last, CH = 3000;
  while (row >= 2 && out.length < lim) {
    var start = Math.max(2, row - CH + 1), vals = sh.getRange(start, 1, row - start + 1, AUD_HDR_.length).getValues();
    for (var i = vals.length - 1; i >= 0 && out.length < lim; i--) {
      var r = vals[i], d = String(r[1]).slice(0, 10);
      if (to && d > to) continue;
      if (from && d < from) { row = 0; break; }
      if (u && String(r[2]).indexOf(u) < 0) continue;
      if (ty && String(r[5]) !== ty) continue;
      if (q && [r[6], r[7], r[8], r[9], r[10]].join(' ').toLowerCase().indexOf(q) < 0) continue;
      out.push(r.map(function (x) { return String(x); }));
    }
    if (row) row = start - 1;
  }
  return { success: true, rows: out, total: Math.max(0, last - 1) };
}

/* ---------- 🛡️ (V4.362) عرض السجل المحصّن بتصميم «سجل التعديلات» + زر استعادة لكل عملية ---------- */
// وقت السطر/اللقطة كمفتاح زمني ساذج قابل للمقارنة (نفس المنطقة الزمنية للنصوص المكتوبة) — يقبل Date أو نصاً بصيغتي البرنامج
function _audNaive_(v) {
  if (v instanceof Date) { var tz = 'Asia/Riyadh'; try { tz = (typeof _tz_ === 'function' && _tz_()) || tz; } catch (e) {} v = Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss'); }
  var s = String(v || ''), m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);   // dd/MM/yyyy HH:mm[:ss] (لقطات الرحلات)
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  return NaN;
}
function _audMdy_(ms) {   // mm/dd/yyyy hh:mm
  if (isNaN(ms)) return '';
  var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); };
  return p(d.getUTCMonth() + 1) + '/' + p(d.getUTCDate()) + '/' + d.getUTCFullYear() + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}
// فهارس اللقطات (أعمدة الرأس فقط — بلا المحتوى المضغوط) لربط كل عملية بلقطتها
function _audUndoIdx_() {
  var X = { ent: {}, rowk: {}, rowc: [], trip: {} };
  try {
    var g = _snapGlSheet_(), gl = g.getLastRow();
    if (gl >= 2) g.getRange(2, 1, gl - 1, 5).getValues().forEach(function (v) { var id = String(v[4]); (X.ent[id] = X.ent[id] || []).push({ sid: String(v[0]), ms: _audNaive_(v[1]), by: String(v[2]), act: String(v[3]) }); });
  } catch (e1) {}
  try {
    var r = _snapRowSheet_(), rl = r.getLastRow();
    if (rl >= 2) r.getRange(2, 1, rl - 1, 6).getValues().forEach(function (v, i) {
      var o = { sid: String(v[0]), ms: _audNaive_(v[1]), by: String(v[2]), act: String(v[3]), sheet: String(v[4]), key: String(v[5]), row: i + 2 };
      (X.rowk[o.sheet + '|' + o.key] = X.rowk[o.sheet + '|' + o.key] || []).push(o);
      if (typeof ACC_PAY_SHEET !== 'undefined' && o.sheet === ACC_PAY_SHEET) X.rowc.push(o);
    });
  } catch (e2) {}
  try {
    var t = _accSheet_(TRIP_SNAP_SHEET_, TRIP_SNAP_HEADERS_), tl = t.getLastRow();
    if (tl >= 2) t.getRange(2, 1, tl - 1, 5).getValues().forEach(function (v) { var n = String(v[1] || '').trim(); (X.trip[n] = X.trip[n] || []).push({ sid: String(v[0]), ms: _audNaive_(v[2]), by: String(v[3]), act: String(v[4]) }); });
  } catch (e3) {}
  return X;
}
// أقرب لقطة لعملية (ms، المستخدم): «قبل» = لقطة مأخوذة قبل التغيير (القيود/الدفعات) · «بعد» = بعده (الرحلات)
function _audPick_(list, ms, user, after) {
  var best = null, bd = 1e12;
  (list || []).forEach(function (s, i) {
    if (isNaN(s.ms) || isNaN(ms)) return;
    var d = after ? s.ms - ms : ms - s.ms;
    if (d < -5000 || d > 120000) return;
    if (user && s.by && s.by !== user) return;
    var ad = Math.abs(d); if (ad < bd) { bd = ad; best = { s: s, i: i }; }
  });
  return best;
}
function _audUndoFor_(x, X, ms) {
  var act = String(x[6]), rec = String(x[7]), user = String(x[2]), nv = String(x[10]);
  if (/^حذف حساب من الدليل مع قيوده$/.test(act) && /^DEL-/.test(nv)) return { k: 'acc', id: nv, label: 'استعادة الحساب وقيوده' };
  if (/^(تسجيل )?(دخول|خروج)|^تسجيل دخول|^تسجيل خروج|استعادة|تراجع/.test(act)) return null;
  var m = rec.match(/^GL:(.+)$/);
  if (m && X.ent[m[1]]) { var p = _audPick_(X.ent[m[1]], ms, user, false); if (p) return { k: 'entry', sid: p.s.sid, label: 'استعادة القيد لما قبل هذه العملية' }; }
  m = rec.match(/^AP:(.+)$/);
  if (m && typeof VZ_PAY_SHEET !== 'undefined' && X.rowk[VZ_PAY_SHEET + '|' + m[1]]) { var q = _audPick_(X.rowk[VZ_PAY_SHEET + '|' + m[1]], ms, user, false); if (q) return { k: 'rows', sids: [q.s.sid], label: 'استعادة الدفعة لما قبل هذه العملية' }; }
  if (/^(تعديل دفعة حساب|تعديل دفعات حساب|حذف دفعة|حذف تحويل عملة)/.test(act) && X.rowc.length) {
    var rsh = null; try { rsh = _snapRowSheet_(); } catch (eR) {}
    var hits = X.rowc.filter(function (s) {
      var d = ms - s.ms; if (isNaN(d) || d < -5000 || d > 120000 || (s.by && s.by !== user)) return false;
      try { var v = rsh.getRange(s.row, 1, 1, rsh.getLastColumn()).getValues()[0], row = _snapUnpack_(v.slice(6)); return row && String(row[1]) === rec; } catch (eU) { return false; }   // نفس العميل
    });
    if (hits.length) return { k: 'rows', sids: hits.slice(0, 50).map(function (s) { return s.sid; }), client: rec, label: 'استعادة ' + (hits.length > 1 ? hits.length + ' دفعات' : 'الدفعة') + ' لما قبل هذه العملية' };
  }
  if (X.trip[rec]) { var t = _audPick_(X.trip[rec], ms, user, true); if (t && t.i > 0) return { k: 'trip', trip: rec, sid: t.s.sid, label: 'التراجع عن هذه العملية بالرحلة' }; }
  return null;
}
// نفس صيغة getAuditLog (timestamp/username/action/recordId/field/oldValue/newValue/screen) + seq/req/type/hash + undo
function audList2(authToken, f) {
  var session = requireAuditLogPermission_(authToken);
  f = f || {};
  var canUndo = false; try { canUndo = (typeof _snapCanRestore_ === 'function' && _snapCanRestore_(authToken)) || _sessionHasPerm_(session, 'admin'); } catch (e) {}
  if (!PropertiesService.getScriptProperties().getProperty(AUD_PROP_ID_)) return { success: true, rows: [], total: 0, canUndo: canUndo };
  _audFlushSoft_();
  var sh = _audSheet_('Trail'), last = sh.getLastRow(), lim = Math.min(+f.limit || 500, 2000), out = [];
  var u = String(f.username || '').trim(), ty = String(f.type || ''), q = String(f.entity || '').trim(), rid = String(f.recordId || '').trim(), ac = String(f.action || '').trim();
  var from = String(f.fromDate || ''), to = String(f.toDate || ''), scr = String(f.screen || ''), withLogin = !!f.showLoginLogout;
  var row = last, CH = 3000;
  while (row >= 2 && out.length < lim) {
    var start = Math.max(2, row - CH + 1), vals = sh.getRange(start, 1, row - start + 1, AUD_HDR_.length).getValues();
    for (var i = vals.length - 1; i >= 0 && out.length < lim; i--) {
      var r = vals[i], ms = _audNaive_(r[1]), d = isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10);
      if (to && d && d > to) continue;
      if (from && d && d < from) { row = 0; break; }
      if (!withLogin && String(r[5]) === 'دخول/خروج') continue;
      if (u && String(r[2]).indexOf(u) < 0) continue;
      if (ty && String(r[5]) !== ty) continue;
      if (ac && String(r[6]).indexOf(ac) < 0) continue;
      if (rid && String(r[7]).indexOf(rid) < 0) continue;
      if (q && [r[7], r[8], r[9], r[10]].join(' ').indexOf(q) < 0) continue;
      var screen = 'other'; try { screen = _auditScreen_(String(r[6]), String(r[8]), String(r[7])); } catch (eS) {}
      if (scr && !(typeof _auditScreenMatch_ === 'function' ? _auditScreenMatch_(screen, scr) : screen === scr)) continue;
      out.push({ seq: String(r[0]), ms: ms, timestamp: _audMdy_(ms) || String(r[1]), username: String(r[2]), action: String(r[6]), recordId: String(r[7]), field: String(r[8]),
        oldValue: String(r[9]), newValue: String(r[10]), type: String(r[5]), req: String(r[4]), sess: String(r[3]), hash: String(r[11]),
        screen: screen, screenLabel: (typeof AUDIT_SCREEN_LABELS_ !== 'undefined' && AUDIT_SCREEN_LABELS_[screen]) || 'أخرى', _r: r });
    }
    if (row) row = start - 1;
  }
  if (canUndo && out.length) {
    var X = _audUndoIdx_(), seenReq = {};
    out.forEach(function (e) {
      if (!/تعديل|حذف|إلغاء|إضافة/.test(e.type)) { delete e._r; return; }
      var key = e.req + '|' + e.recordId;
      if (seenReq[key]) { delete e._r; return; }   // زر واحد لكل حفظة على نفس السجل
      seenReq[key] = 1;
      try { var un = _audUndoFor_(e._r, X, e.ms); if (un) e.undo = un; } catch (eU) {}
      delete e._r;
    });
  } else out.forEach(function (e) { delete e._r; });
  return { success: true, rows: out, total: Math.max(0, last - 1), canUndo: canUndo };
}
// تنفيذ الاستعادة لعملية — كل مسار يعيد التحقق من الصلاحية بنفسه (المدير/«استعادة النسخ السابقة»/«التراجع بسجل الرحلات»)
function audUndo(authToken, un, dry) {
  un = un || {};
  if (un.k === 'acc') return glAccountRestore(authToken, String(un.id || ''), !!dry);
  if (dry) return { success: true, dry: true, ok: true };
  if (un.k === 'entry') return glEntrySnapRestore(authToken, String(un.sid || ''));
  if (un.k === 'rows') { var n = 0; (un.sids || []).slice(0, 50).forEach(function (sid) { snapRowRestore(authToken, String(sid)); n++; }); return { success: true, done: n }; }
  if (un.k === 'trip') return tripUndoChange(authToken, String(un.trip || ''), String(un.sid || ''));
  throw new Error('لا توجد استعادة تلقائية لهذا النوع من العمليات — استخدم «⏪ التراجع الزمني»');
}
