/* ============================================================
   ⏪ (V4.346) التراجع الزمني — اللقطات ونقاط الاستعادة
   ------------------------------------------------------------
   ① لقطات الكيانات (أدق مستوى): صورة كاملة للقيد (رأسه + كل أسطره) قبل أي تعديل/إلغاء/حذف، وللدفعة (عملاء العمرة/
      الوكلاء) قبل تعديلها/حذفها ⇒ «↩️ استعادة هذه النسخة» تعيد الكيان كما كان (حتى لو حُذف)، والاستعادة نفسها تُسبق بلقطة
      فهي قابلة للتراجع، وتُسجَّل بالسجل المحصّن.
   ② نقاط استعادة النظام: نسخة كاملة يومية من ملفات البرنامج (البرنامج الرئيسي + الحسابات العامة + الحجوزات) بمجلد محمي،
      ونسخة فورية قبل أي عملية خطرة (حذف مجمّع، إقفال/فتح سنة، استيراد، إصلاح، استعادة ورقة كاملة). الاحتفاظ: اليومية 30
      يوماً، وأول نسخة بكل شهر 12 شهراً، والفورية 14 يوماً.
   ③ الاستعادة الانتقائية من نقطة (V4.347): لكل شاشة على حدة — حقل · سجل · كشف · الشاشة كاملة (انظر أسفل الملف).
   ============================================================ */
var SNAP_PROP_FOLDER_ = 'SNAP_FOLDER_ID', SNAP_IDX_SHEET_ = 'RestorePoints', SNAP_ROW_SHEET_ = 'RowSnapshots';
var SNAP_CELL_MAX_ = 45000;   // حد الخلية 50 ألف حرف — البيانات الأطول تُقسَّم على أعمدة متتالية
var SNAP_KEEP_DAILY_ = 30, SNAP_KEEP_RISK_ = 14, SNAP_KEEP_MONTHS_ = 12, SNAP_RISK_GAP_MIN_ = 30;

function _snapIsD_(x) { return Object.prototype.toString.call(x) === '[object Date]'; }
function _snapId_(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _snapNowTxt_() { return Utilities.formatDate(new Date(), (typeof _tz_ === 'function' && _tz_()) || 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss'); }
function _snapPack_(obj) {
  var s = JSON.stringify(obj, function (k, v) { return _snapIsD_(this[k]) ? { __d: this[k].getTime() } : v; }), out = [];
  for (var i = 0; i < s.length; i += SNAP_CELL_MAX_) out.push(s.slice(i, i + SNAP_CELL_MAX_));
  return out.length ? out : [''];
}
function _snapUnpack_(cells) {
  var s = (cells || []).map(function (x) { return String(x == null ? '' : x); }).join('');
  return s ? JSON.parse(s, function (k, v) { return (v && typeof v === 'object' && v.__d != null && Object.keys(v).length === 1) ? new Date(v.__d) : v; }) : null;
}
function _snapAppend_(sh, head, cells) {
  var row = head.concat(cells), at = sh.getLastRow() + 1;
  if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
  var rg = sh.getRange(at, 1, 1, row.length); rg.setNumberFormat('@'); rg.setValues([row]);
}

/* ---------- ① لقطات القيود ---------- */
function _snapGlSheet_() {
  var ss = _glSS_(), sh = ss.getSheetByName('GL_Snapshots');
  if (!sh) {
    sh = ss.insertSheet('GL_Snapshots');
    sh.getRange(1, 1, 1, 6).setValues([['المعرّف', 'الوقت', 'المستخدم', 'العملية', 'رقم القيد', 'البيانات']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
// صورة كاملة للقيد قبل تغييره (r: صف الرأس كما بالشيت، lines: صفوف أسطره كما بالشيت)
function _snapEntryTake_(id, r, lines, action, user) {
  try {
    if (!r) return '';
    var sid = _snapId_('E');
    _snapAppend_(_snapGlSheet_(), [sid, _snapNowTxt_(), String(user || ''), String(action || ''), String(id)], _snapPack_({ r: r, l: lines || [] }));
    return sid;
  } catch (e) { Logger.log('snapEntryTake: ' + e.message); return ''; }
}
function _snapEntryRows_(filterFn) {
  var sh = _snapGlSheet_(), last = sh.getLastRow(), out = [];
  if (last < 2) return out;
  var w = sh.getLastColumn(), vals = sh.getRange(2, 1, last - 1, w).getValues();
  vals.forEach(function (v, i) { if (!filterFn || filterFn(v)) out.push({ row: i + 2, v: v }); });
  return out;
}
// نسخ قيد سابقة (الأحدث أولاً) — للعرض بنافذة القيد
function glEntrySnaps(authToken, id) {
  _glPerm_(authToken, 'view');
  id = _glStr_(id);
  var list = _snapEntryRows_(function (v) { return String(v[4]) === id; }).map(function (x) {
    var d = null; try { d = _snapUnpack_(x.v.slice(5)); } catch (e) {}
    var lines = (d && d.l) || [], tot = 0; lines.forEach(function (l) { tot += _glNum_(l[9]); });
    return { sid: String(x.v[0]), at: String(x.v[1]), by: String(x.v[2]), action: String(x.v[3]), status: d ? _glStr_(d.r[5]) : '', desc: d ? _glStr_(d.r[4]) : '',
      date: d ? _glDate_(d.r[2]) : '', total: _glR2_(tot), lines: lines.map(function (l) { return { acc: _glStr_(l[4]), d: _glNum_(l[5]), c: _glNum_(l[6]), cur: _glStr_(l[7]) }; }) };
  }).reverse();
  return { success: true, snaps: list, canRestore: _snapCanRestore_(authToken) };
}
// القيود المحذوفة نهائياً (آخر لقطة لكل قيد لم يعد موجوداً)
function glDeletedEntries(authToken) {
  _glPerm_(authToken, 'view');
  var ids = {}; _glRows_('entries').forEach(function (r) { ids[_glStr_(r[0])] = 1; });
  var last = {};
  _snapEntryRows_(function (v) { return /حذف/.test(String(v[3])) && !ids[String(v[4])]; }).forEach(function (x) { last[String(x.v[4])] = x; });
  var out = Object.keys(last).map(function (id) {
    var x = last[id], d = null; try { d = _snapUnpack_(x.v.slice(5)); } catch (e) {}
    var tot = 0; ((d && d.l) || []).forEach(function (l) { tot += _glNum_(l[9]); });
    return { id: id, sid: String(x.v[0]), at: String(x.v[1]), by: String(x.v[2]), action: String(x.v[3]), type: d ? _glStr_(d.r[3]) : '', desc: d ? _glStr_(d.r[4]) : '', date: d ? _glDate_(d.r[2]) : '', total: _glR2_(tot) };
  }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  return { success: true, rows: out, canRestore: _snapCanRestore_(authToken) };
}
function _snapCanRestore_(authToken) {
  try { var s = requireAuth_(authToken); return _glIsAdmin_(s) || _sessionHasPerm_(s, 'snaprestore.edit'); } catch (e) { return false; }
}
// ↩️ استعادة قيد لنسخة سابقة (أو إعادة قيد محذوف) — بلقطة للحالة الحالية قبلها (فالاستعادة نفسها قابلة للتراجع)
function glEntrySnapRestore(authToken, sid) {
  var session = requireAuth_(authToken);
  if (!_snapCanRestore_(authToken)) throw new Error('استعادة النسخ السابقة للمدير أو لمن مُنح صلاحية «استعادة النسخ السابقة»');
  var hit = _snapEntryRows_(function (v) { return String(v[0]) === String(sid); })[0];
  if (!hit) throw new Error('النسخة غير موجودة');
  var d = _snapUnpack_(hit.v.slice(5)), id = String(hit.v[4]);
  if (!d || !d.r) throw new Error('بيانات النسخة تالفة');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null;
    var f = _glFindEntry_(id), curLines = f ? _glLinesOf_(id) : [];
    if (_glLocked_(d.r[2])) throw new Error('تاريخ النسخة في فترة مقفلة حتى ' + _glSettings_().lockDate);
    if (f && _glLocked_(f.r[2])) throw new Error('القيد الحالي في فترة مقفلة حتى ' + _glSettings_().lockDate);
    var accs = _glAccounts_().map, db = 0, cr = 0;
    (d.l || []).forEach(function (l) {
      if (!accs[_glStr_(l[4])]) throw new Error('الحساب ' + _glStr_(l[4]) + ' بالنسخة لم يعد موجوداً بدليل الحسابات');
      db += _glNum_(l[9]); cr += _glNum_(l[10]);
    });
    if (_glStr_(d.r[5]) === GL_ST_POSTED_ && Math.abs(db - cr) > 0.05) throw new Error('النسخة غير متوازنة بعملة الأساس — لا تُستعاد');
    if (f) _snapEntryTake_(id, f.r, curLines, 'قبل الاستعادة', session.username);
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines'), r = d.r.slice();
    if (f) { eSh.getRange(f.row, 1, 1, r.length).setValues([r]); _glDeleteLinesOf_([id]); }
    else eSh.getRange(eSh.getLastRow() + 1, 1, 1, r.length).setValues([r]);
    if ((d.l || []).length) lSh.getRange(lSh.getLastRow() + 1, 1, d.l.length, d.l[0].length).setValues(d.l);
    if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(session.username, id, f ? _audSnapRows_(f.r, curLines) : null, _audSnapRows_(r, d.l), 'استعادة نسخة سابقة للقيد');
    logChange_(session.username, 'استعادة نسخة سابقة للقيد', 'GL:' + id, 'النسخة', String(hit.v[1]) + ' (' + String(hit.v[3]) + ')', f ? 'استُبدل القيد الحالي' : 'أُعيد القيد المحذوف');
    try { _glSyncVoucherPays_(id, session.username); } catch (eS) {}
    var delta = {};
    if (f && _glStr_(f.r[5]) === GL_ST_POSTED_) _glLineDelta_(curLines, -1, delta);
    if (_glStr_(r[5]) === GL_ST_POSTED_) _glLineDelta_(d.l, 1, delta);
    return { success: true, id: id, recreated: !f, balancesDelta: delta };
  } finally { _glUnlock_(lock); }
}
// 🔐 بصمة إصدار القيد: تتغير مع أي تعديل في رأسه أو أسطره ⇒ تكشف التعديل المتزامن (آخر من يحفظ لا يمسح غيره)
function _glEntryVer_(r, lines) {
  var s = JSON.stringify([(r || []).slice(0, 19).map(String), (lines || []).map(function (l) { return l.map(String); }).sort()]);
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)).slice(0, 16);
}

/* ---------- ① لقطات الصفوف (الدفعات) ---------- */
function _snapRowSheet_() {
  var ss = getSpreadsheet_(), sh = ss.getSheetByName(SNAP_ROW_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(SNAP_ROW_SHEET_);
    sh.getRange(1, 1, 1, 7).setValues([['المعرّف', 'الوقت', 'المستخدم', 'العملية', 'الورقة', 'المفتاح', 'البيانات']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}
// row: قيم الصف كاملة كما بالورقة · key: معرّف السجل (العمود الأول)
function _snapRowTake_(sheetName, key, row, action, user) {
  try { _snapAppend_(_snapRowSheet_(), [_snapId_('R'), _snapNowTxt_(), String(user || ''), String(action || ''), String(sheetName), String(key)], _snapPack_(row)); }
  catch (e) { Logger.log('snapRowTake: ' + e.message); }
}
function snapRowList(authToken, sheetName, key) {
  requireAuth_(authToken);
  var sh = _snapRowSheet_(), last = sh.getLastRow(), out = [];
  if (last >= 2) sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (v) {
    if ((sheetName && String(v[4]) !== sheetName) || (key && String(v[5]) !== String(key))) return;
    var d = null; try { d = _snapUnpack_(v.slice(6)); } catch (e) {}
    out.push({ sid: String(v[0]), at: String(v[1]), by: String(v[2]), action: String(v[3]), sheet: String(v[4]), key: String(v[5]), row: d });
  });
  return { success: true, rows: out.reverse().slice(0, 300), canRestore: _snapCanRestore_(authToken) };
}
function snapRowRestore(authToken, sid) {
  var session = requireAuth_(authToken);
  if (!_snapCanRestore_(authToken)) throw new Error('استعادة النسخ السابقة للمدير أو لمن مُنح صلاحية «استعادة النسخ السابقة»');
  _audGate_();
  var sh = _snapRowSheet_(), last = sh.getLastRow(), hit = null;
  if (last >= 2) sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().some(function (v) { if (String(v[0]) === String(sid)) { hit = v; return true; } return false; });
  if (!hit) throw new Error('النسخة غير موجودة');
  var name = String(hit[4]), key = String(hit[5]), row = _snapUnpack_(hit.slice(6));
  if (!row || !row.length) throw new Error('بيانات النسخة تالفة');
  var at = -1, lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var t = getSpreadsheet_().getSheetByName(name); if (!t) throw new Error('الورقة ' + name + ' غير موجودة');
    var n = t.getLastRow(), ids = n >= 2 ? t.getRange(2, 1, n - 1, 1).getValues() : [];
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === key) { at = i + 2; break; }
    var cur = at > 0 ? t.getRange(at, 1, 1, Math.max(row.length, t.getLastColumn())).getValues()[0] : null;
    if (cur) _snapRowTake_(name, key, cur, 'قبل الاستعادة', session.username);
    if (at > 0) t.getRange(at, 1, 1, row.length).setValues([row]); else t.getRange(n + 1, 1, 1, row.length).setValues([row]);
    logChange_(session.username, 'استعادة نسخة سابقة لصف', name + ':' + key, 'النسخة', String(hit[1]) + ' (' + String(hit[3]) + ')', at > 0 ? 'استُبدل الصف الحالي' : 'أُعيد الصف المحذوف');
  } finally { lock.releaseLock(); }
  try { if (typeof _vzClearCache_ === 'function') _vzClearCache_(); } catch (e) {}
  return { success: true, recreated: at < 0 };
}

/* ---------- ② نقاط استعادة النظام ---------- */
function _snapFolder_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty(SNAP_PROP_FOLDER_);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('🛡️ نقاط الاستعادة — برنامج العمرة (لا تُشارك)');
  p.setProperty(SNAP_PROP_FOLDER_, f.getId());
  return f;
}
function _snapIdxSheet_() {   // الفهرس داخل ملف السجل المحصّن (مستقل ولا يُشارك)
  var ss = _audSS_(), sh = ss.getSheetByName(SNAP_IDX_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(SNAP_IDX_SHEET_);
    sh.getRange(1, 1, 500, 7).setNumberFormat('@');
    sh.getRange(1, 1, 1, 7).setValues([['المعرّف', 'الوقت', 'النوع', 'السبب', 'المستخدم', 'الملفات', 'الحالة']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function _snapSources_() {
  var out = [{ role: 'main', label: 'البرنامج الرئيسي', id: getSpreadsheet_().getId() }];
  try { var g = _glSSId_(); if (g && g !== out[0].id) out.push({ role: 'gl', label: 'الحسابات العامة', id: g }); } catch (e) {}
  try { var h = _glSettings_().hb_ss_id; if (h && h !== out[0].id) out.push({ role: 'hb', label: 'الحجوزات', id: h }); } catch (e) {}
  return out;
}
// kind: 'يومية' | 'قبل عملية خطرة' | 'يدوية'
function _snapSystem_(kind, reason, user) {
  var folder = _snapFolder_(), at = _snapNowTxt_(), files = [], errs = [];
  _snapSources_().forEach(function (s) {
    try { var c = DriveApp.getFileById(s.id).makeCopy(at + ' — ' + s.label + ' — ' + (reason || kind), folder); files.push({ role: s.role, label: s.label, id: c.getId() }); }
    catch (e) { errs.push(s.label + ': ' + e.message); }
  });
  var pid = _snapId_('P');
  _snapIdxSheet_().appendRow([pid, at, kind, String(reason || ''), String(user || ''), JSON.stringify(files), errs.length ? 'ناقصة: ' + errs.join(' · ') : 'كاملة']);
  if (typeof _audLog_ === 'function') _audLog_([{ user: user || 'النظام', action: 'نقطة استعادة (' + kind + ')', type: 'أخرى', record: 'SNAP:' + pid, field: reason || '', 'new': files.length + ' ملف' + (errs.length ? ' — أخطاء: ' + errs.join(' · ') : '') }]);
  return { id: pid, at: at, files: files, errors: errs };
}
// لقطة فورية قبل عملية خطرة — مرة كل 30 دقيقة على الأكثر (العمليات المتتالية تشترك بنفس النقطة)
function _snapPreRisk_(reason, user) {
  try {
    var c = CacheService.getScriptCache(); if (c.get('snap_risk_recent')) return null;
    if (!PropertiesService.getScriptProperties().getProperty('AUDIT_SS_ID')) return null;   // يُفعَّل مع السجل المحصّن
    c.put('snap_risk_recent', '1', SNAP_RISK_GAP_MIN_ * 60);
    return _snapSystem_('قبل عملية خطرة', reason, user);
  } catch (e) { Logger.log('snapPreRisk: ' + e.message); return null; }
}
function snapDailyCron() {
  try { _snapSystem_('يومية', 'النسخة اليومية', 'النظام'); } catch (e) { Logger.log('snapDailyCron: ' + e.message); }
  try { _snapPrune_(); } catch (e) { Logger.log('snapPrune: ' + e.message); }
}
// الاحتفاظ: اليومية 30 يوماً + أول نسخة يومية بكل شهر 12 شهراً · الفورية واليدوية 14 يوماً
function _snapPrune_() {
  var sh = _snapIdxSheet_(), last = sh.getLastRow(); if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 7).getValues(), now = Date.now(), firstOfMonth = {}, n = 0;
  var firstAt = {};
  vals.forEach(function (v) { if (String(v[2]) === 'يومية' && String(v[6]) !== 'محذوفة') { var m = String(v[1]).slice(0, 7); if (!firstAt[m] || String(v[1]) < firstAt[m]) { firstAt[m] = String(v[1]); firstOfMonth[m] = String(v[0]); } } });   // أقدم نسخة يومية بكل شهر
  vals.forEach(function (v, i) {
    if (String(v[6]) === 'محذوفة') return;
    var t = new Date(String(v[1]).replace(' ', 'T')).getTime(); if (!t) return;
    var ageD = (now - t) / 86400000, kind = String(v[2]), keep;
    if (kind === 'يومية') keep = ageD <= SNAP_KEEP_DAILY_ || (firstOfMonth[String(v[1]).slice(0, 7)] === String(v[0]) && ageD <= SNAP_KEEP_MONTHS_ * 31);
    else if (kind === 'ساعية') keep = ageD <= SNAP_KEEP_LIGHT_;
    else keep = ageD <= SNAP_KEEP_RISK_;
    if (keep) return;
    var files = []; try { files = JSON.parse(String(v[5])) || []; } catch (e) {}
    files.forEach(function (f) { try { DriveApp.getFileById(f.blob || f.id).setTrashed(true); } catch (e) {} });
    sh.getRange(i + 2, 7).setValue('محذوفة'); n++;
  });
  return n;
}
function _snapAdmin_(authToken) {
  var s = requireAuth_(authToken);
  if (!_glIsAdmin_(s)) throw new Error('نقاط الاستعادة للمدير فقط');
  return s;
}
function snapPoints(authToken) {
  _snapAdmin_(authToken);
  var out = [], cron = false;
  if (PropertiesService.getScriptProperties().getProperty('AUDIT_SS_ID')) {
    var sh = _snapIdxSheet_(), last = sh.getLastRow();
    if (last >= 2) sh.getRange(2, 1, last - 1, 7).getValues().forEach(function (v) {
      if (String(v[6]) === 'محذوفة') return;
      var files = []; try { files = JSON.parse(String(v[5])) || []; } catch (e) {}
      out.push({ id: String(v[0]), at: String(v[1]), kind: String(v[2]), reason: String(v[3]), by: String(v[4]), state: String(v[6]),
        files: files.map(function (f) { return f.blob ? { role: f.role, label: f.sheet, sheet: f.sheet } : { role: f.role, label: f.label, url: 'https://docs.google.com/spreadsheets/d/' + f.id }; }) });
    });
  }
  try { var hs = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }); cron = hs.indexOf('snapDailyCron') >= 0 && hs.indexOf('snapLightCron') >= 0; } catch (e) {}
  return { success: true, points: out.reverse().slice(0, 400), cron: cron, audit: !!PropertiesService.getScriptProperties().getProperty('AUDIT_SS_ID') };
}
function snapSetup(authToken) {
  var s = _snapAdmin_(authToken);
  if (!PropertiesService.getScriptProperties().getProperty('AUDIT_SS_ID')) throw new Error('فعّل «السجل المحصّن» أولاً');
  _snapFolder_();
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'snapDailyCron'; })) ScriptApp.newTrigger('snapDailyCron').timeBased().everyDays(1).atHour(3).create();
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'snapLightCron'; })) ScriptApp.newTrigger('snapLightCron').timeBased().everyHours(1).create();   // ⏱️ (V4.347)
  try { _snapLight_('ساعية', 'أول نقطة خفيفة', s.username); } catch (eL) {}
  logChange_(s.username, 'تفعيل نقاط الاستعادة اليومية', 'SNAP', '-', '-', 'يومياً 3 صباحاً');
  return snapPoints(authToken);
}
function snapNow(authToken, reason) {
  var s = _snapAdmin_(authToken);
  _audGate_();
  var r = _snapSystem_('يدوية', _glStr_(reason) || 'نقطة يدوية', s.username);
  return { success: true, point: r };
}
function _snapPoint_(pid) {
  var sh = _snapIdxSheet_(), last = sh.getLastRow(), hit = null;
  if (last >= 2) sh.getRange(2, 1, last - 1, 7).getValues().some(function (v) { if (String(v[0]) === String(pid)) { hit = v; return true; } return false; });
  if (!hit || String(hit[6]) === 'محذوفة') throw new Error('نقطة الاستعادة غير موجودة');
  var files = []; try { files = JSON.parse(String(hit[5])) || []; } catch (e) {}
  return { id: String(hit[0]), at: String(hit[1]), files: files };
}
// ③ استعادة قيد واحد كما كان بنقطة استعادة
function snapRestoreEntry(authToken, pid, entryId) {
  var session = _snapAdmin_(authToken);
  var p = _snapPoint_(pid), f = p.files.filter(function (x) { return x.role === 'gl' || (x.role === 'main' && !_glSSId_()); })[0];
  if (!f) throw new Error('ملف الحسابات غير موجود بهذه النقطة');
  var ss = SpreadsheetApp.openById(f.id), es = ss.getSheetByName(GL_SHEETS_.entries.name), ls = ss.getSheetByName(GL_SHEETS_.lines.name);
  var id = _glStr_(entryId), r = null, lines = [];
  if (es && es.getLastRow() >= 2) es.getRange(2, 1, es.getLastRow() - 1, es.getLastColumn()).getValues().some(function (x) { if (_glStr_(x[0]) === id) { r = x; return true; } return false; });
  if (!r) throw new Error('القيد ' + id + ' لم يكن موجوداً بنقطة ' + p.at);
  if (ls && ls.getLastRow() >= 2) ls.getRange(2, 1, ls.getLastRow() - 1, ls.getLastColumn()).getValues().forEach(function (x) { if (_glStr_(x[0]) === id) lines.push(x); });
  var sid = _snapEntryTake_(id, r, lines, 'من نقطة استعادة ' + p.at, session.username);
  if (!sid) throw new Error('تعذّر تجهيز النسخة');
  return glEntrySnapRestore(authToken, sid);
}

/* ============================================================
   🔍 (V4.347) الاستعادة متعددة المستويات — لكل شاشة على حدة (لا يُعاد البرنامج كله لنقطة)
   ------------------------------------------------------------
   • نقاط ساعية خفيفة: كل ساعة تُحفظ فقط أوراق الشاشات التي تغيّرت (مضغوطة) — فتتوفر حالة كل شاشة بدقة ساعة لأسبوع.
   • «مقارنة واستعادة»: نقطة زمنية + شاشة (+ فلتر كشف اختياري: رحلة/عميل/وكيل/حساب…) ⇒ قائمة الفروقات سجلاً بسجل وحقلاً
     بحقل، ويختار المستخدم ما يُستعاد: حقل واحد · سجل كامل (أو إعادة محذوف/حذف مضاف) · كشف كامل (كل سجلات الفلتر) ·
     الشاشة كاملة (تحديد الكل). كل شاشة مستقلة تماماً عن غيرها.
   • قبل أي استعادة تُحفظ نقطة خفيفة للأوراق المتأثرة («قبل استعادة») ⇒ الاستعادة نفسها قابلة للتراجع بنفس الأداة.
   • القيود المحاسبية: السجل = القيد. الحقول النصية (البيان/المرجع/الرحلة/الشركة) تُستعاد حقلاً بحقل، والمبالغ والأسطر
     كقيد كامل فقط (لا يُكسر التوازن) عبر مسار استعادة القيود (فحص التوازن/الفترة المقفلة/الحسابات).
   ============================================================ */
var SNAP_KEEP_LIGHT_ = 7;
var SNAP_SCREENS_ = [
  { k: 'trips', label: '🧳 الرحلات وكشوف المعتمرين', filter: 'اسم الرحلة', sheets: [
    { name: 'Trips', key: ['اسم الرحلة'], f: ['اسم الرحلة'], title: ['اسم الرحلة'] },
    { name: 'Pilgrims', key: ['اسم الرحلة', 'رقم الجواز', 'اسم المعتمر'], f: ['اسم الرحلة'], title: ['اسم المعتمر', 'اسم الرحلة'] }] },
  { k: 'clientacc', label: '💳 حسابات عملاء العمرة', filter: 'العميل (أو: العميل | الرحلة)', sheets: [
    { name: 'ClientAccounts_Payments', key: ['المعرف'], f: ['العميل', 'اسم الرحلة'], title: ['العميل', 'اسم الرحلة', 'المبلغ'] },
    { name: 'ClientAccounts_Items', key: ['المعرف'], f: ['العميل', 'اسم الرحلة'], title: ['العميل', 'اسم الرحلة', 'البيان'] },
    { name: 'ClientAccounts_Meta', key: ['العميل', 'اسم الرحلة'], f: ['العميل', 'اسم الرحلة'], title: ['العميل', 'اسم الرحلة'] },
    { name: 'ClientAccounts_MergeGroups', key: ['معرف المجموعة'], f: ['العميل'], title: ['العميل', 'اسم المجموعة'] }] },
  { k: 'agentacc', label: '🧑‍💼 حسابات الوكلاء', filter: 'الوكيل', sheets: [
    { name: 'AgentAccounts_Payments', key: ['المعرف'], f: ['الوكيل'], title: ['الوكيل', 'التاريخ', 'المبلغ'] },
    { name: 'AgentAccounts_Items', key: ['المعرف'], f: ['الوكيل'], title: ['الوكيل', 'البيان'] },
    { name: 'AgentCompanyAccounts', key: ['الوكيل', 'الشركة المصرية'], f: ['الوكيل'], title: ['الوكيل', 'الشركة المصرية'] }] },
  { k: 'bookings', label: '📋 الإشعارات', filter: 'رقم الإشعار', sheets: [
    { name: 'Bookings', key: ['رقم الإشعار'], f: ['رقم الإشعار', 'العميل'], title: ['رقم الإشعار', 'العميل'] }] },
  { k: 'ministry', label: '🏛️ ملفات الوزارة', filter: 'رقم الملف', sheets: [
    { name: 'MinistryFiles', key: ['معرف الملف'], f: ['رقم الملف'], title: ['رقم الملف', 'الشركة المصرية'] },
    { name: 'MinistrySupervisors', key: [], f: [], title: [] },
    { name: 'RoomFeeReceipts', key: [], f: [], title: [] }] },
  { k: 'visas', label: '🛂 مجموعات التأشيرات', filter: 'رقم المجموعة', sheets: [
    { name: 'VisaFiles', key: ['المعرف'], f: ['رقم المجموعة', 'الوكيل السعودي'], title: ['رقم المجموعة', 'الوكيل السعودي'] }] },
  { k: 'housing', label: '🛏️ اتفاقيات وتخصيص السكن', filter: 'رقم الاتفاقية / المجموعة', sheets: [
    { name: 'HousingAgreements', key: ['المعرف'], f: ['رقم الاتفاقية', 'الفندق'], title: ['رقم الاتفاقية', 'الفندق'] },
    { name: 'HousingAllocations', key: ['المعرف'], f: ['رقم المجموعة'], title: ['رقم المجموعة'] }] },
  { k: 'catering', label: '🍽️ اتفاقيات الإعاشة', filter: '', sheets: [{ name: 'CateringContracts', key: [], f: [], title: [] }] },
  { k: 'pricing', label: '💲 الأسعار', filter: 'الرحلة / العميل / الوكيل', sheets: [
    { name: 'ClientAccounts_TripPrices', key: ['اسم الرحلة'], f: ['اسم الرحلة'], title: ['اسم الرحلة'] },
    { name: 'ClientAccounts_ClientPrices', key: ['العميل'], f: ['العميل'], title: ['العميل'] },
    { name: 'VisaAgentPrices', key: ['الوكيل', 'من تاريخ'], f: ['الوكيل'], title: ['الوكيل', 'السعر'] },
    { name: 'TransportAgentPrices', key: ['الوكيل', 'من تاريخ'], f: ['الوكيل'], title: ['الوكيل', 'السعر'] }] },
  { k: 'coa', label: '🌳 دليل الحسابات', filter: 'الكود / الاسم', sheets: [{ name: 'GL_Accounts', key: ['الكود'], f: ['الكود', 'اسم الحساب'], title: ['الكود', 'اسم الحساب'] }] },
  { k: 'gl', label: '📒 القيود المحاسبية (كشف حساب)', filter: 'كود الحساب (كشف) أو رقم القيد', gl: true },
  { k: 'hbpay', label: '🏨 الحجوزات: سجل الدفعات', filter: 'الطرف', sheets: [{ name: 'سجل الدفعات', key: [], f: [], title: [] }] },
  { k: 'hbparty', label: '🏨 الحجوزات: العملاء والموردين', filter: 'الاسم', sheets: [{ name: 'العملاء والموردين', key: [], f: [], title: [] }] }
];
function _snapScreen_(k) { var s = SNAP_SCREENS_.filter(function (x) { return x.k === k; })[0]; if (!s) throw new Error('شاشة غير معروفة'); return s; }
var _SNAP_LIVE_SS_ = {};
// الورقة الحية بالاسم عبر ملفات البرنامج (الرئيسي ثم الحسابات ثم الحجوزات)
function _snapLiveSheet_(name) {
  var srcs = _snapSources_();
  for (var i = 0; i < srcs.length; i++) {
    try { var ss = _SNAP_LIVE_SS_[srcs[i].id] || (_SNAP_LIVE_SS_[srcs[i].id] = (srcs[i].role === 'main' ? getSpreadsheet_() : SpreadsheetApp.openById(srcs[i].id))); var sh = ss.getSheetByName(name); if (sh) return { sh: sh, role: srcs[i].role }; } catch (e) {}
  }
  return null;
}
function _snapAllSheetNames_() {
  var out = [{ name: 'GL_Entries' }, { name: 'GL_Lines' }];
  SNAP_SCREENS_.forEach(function (s) { (s.sheets || []).forEach(function (x) { out.push({ name: x.name }); }); });
  return out;
}
function _snapNorm_(v) { return _snapIsD_(v) ? 'D' + v.getTime() : String(v == null ? '' : v); }
function _snapShow_(v) {
  if (_snapIsD_(v)) return Utilities.formatDate(v, (typeof _tz_ === 'function' && _tz_()) || 'Asia/Riyadh', (v.getHours() || v.getMinutes()) ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
  var s = String(v == null ? '' : v); return s.length > 300 ? s.slice(0, 300) + '…' : s;
}
function _snapHashVals_(vals) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(vals.map(function (r) { return r.map(_snapNorm_); })), Utilities.Charset.UTF_8));
}
function _snapReadLive_(name) {
  var L = _snapLiveSheet_(name); if (!L) return null;
  var sh = L.sh, lr = sh.getLastRow(), lc = sh.getLastColumn();
  return { role: L.role, sh: sh, vals: (lr && lc) ? sh.getRange(1, 1, lr, lc).getValues() : [] };
}
// ⏱️ النقطة الساعية الخفيفة: أوراق تغيّرت منذ آخر نقطة فقط، مضغوطة بملف واحد لكل ورقة
function _snapLight_(kind, reason, user, onlyNames) {
  var p = PropertiesService.getScriptProperties(), folder = _snapFolder_(), at = _snapNowTxt_(), files = [];
  (onlyNames ? onlyNames.map(function (n) { return { name: n }; }) : _snapAllSheetNames_()).forEach(function (x) {
    try {
      var L = _snapReadLive_(x.name); if (!L) return;
      var h = _snapHashVals_(L.vals), hk = 'SNAPH_' + x.name;
      if (!onlyNames && p.getProperty(hk) === h) return;   // لم تتغير ⇒ لا تُحفظ
      var json = JSON.stringify(L.vals, function (k, v) { return _snapIsD_(this[k]) ? { __d: this[k].getTime() } : v; });
      var blob = Utilities.gzip(Utilities.newBlob(json, 'application/json', 'x.json'), at + ' — ' + x.name + '.json.gz');
      var f = folder.createFile(blob);
      files.push({ role: L.role, sheet: x.name, blob: f.getId() });
      p.setProperty(hk, h);
    } catch (e) { Logger.log('snapLight ' + x.name + ': ' + e.message); }
  });
  if (!files.length) return null;
  var pid = _snapId_('L');
  _snapIdxSheet_().appendRow([pid, at, kind, String(reason || ''), String(user || ''), JSON.stringify(files), 'كاملة']);
  return { id: pid, at: at, files: files };
}
function snapLightCron() {
  if (!PropertiesService.getScriptProperties().getProperty('AUDIT_SS_ID')) return;
  try { _snapLight_('ساعية', 'الأوراق التي تغيّرت', 'النظام'); } catch (e) { Logger.log('snapLightCron: ' + e.message); }
}
function _snapIdxAll_() {
  var sh = _snapIdxSheet_(), last = sh.getLastRow(); if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 7).getValues().filter(function (v) { return String(v[6]) !== 'محذوفة'; }).map(function (v) {
    var files = []; try { files = JSON.parse(String(v[5])) || []; } catch (e) {}
    return { id: String(v[0]), at: String(v[1]), kind: String(v[2]), files: files };
  }).sort(function (a, b) { return a.at < b.at ? -1 : (a.at > b.at ? 1 : 0); });
}
var _SNAP_AT_CACHE_ = {};
// حالة ورقة عند نقطة زمنية: أحدث نقطة ≤ وقتها تحوي الورقة (نسخة كاملة أو خفيفة) — الورقة لم تتغير بينهما
function _snapSheetAt_(pid, name) {
  var ck = pid + '|' + name; if (_SNAP_AT_CACHE_[ck]) return _SNAP_AT_CACHE_[ck];
  var all = _snapIdxAll_(), P = all.filter(function (x) { return x.id === pid; })[0];
  if (!P) throw new Error('نقطة الاستعادة غير موجودة');
  var role = (_snapLiveSheet_(name) || {}).role || 'main';
  for (var i = all.length - 1; i >= 0; i--) {
    var x = all[i]; if (x.at > P.at) continue;
    var hit = x.files.filter(function (f) { return f.sheet === name || (!f.sheet && f.role === role && f.id); })[0];
    if (!hit) continue;
    var vals;
    if (hit.blob) {
      var txt = Utilities.ungzip(DriveApp.getFileById(hit.blob).getBlob()).getDataAsString();
      vals = JSON.parse(txt, function (k, v) { return (v && typeof v === 'object' && v.__d != null && Object.keys(v).length === 1) ? new Date(v.__d) : v; });
    } else {
      var sh = SpreadsheetApp.openById(hit.id).getSheetByName(name);
      if (!sh) continue;
      vals = sh.getLastRow() ? sh.getDataRange().getValues() : [];
    }
    return (_SNAP_AT_CACHE_[ck] = { vals: vals, from: x.at, kind: x.kind });
  }
  throw new Error('لا توجد نسخة لورقة «' + name + '» عند هذه النقطة أو قبلها');
}
function _snapKeyIdx_(hdr, spec) {
  var idx = (spec.key || []).map(function (h) { return hdr.indexOf(h); }).filter(function (i) { return i >= 0; });
  return idx.length ? idx : [0];
}
function _snapMatch_(row, hdr, spec, filter) {
  if (!filter) return true;
  var parts = String(filter).split('|').map(function (s) { return s.trim(); }).filter(Boolean);
  var cols = (spec.f || []).map(function (h) { return hdr.indexOf(h); }).filter(function (i) { return i >= 0; });
  if (!cols.length) cols = row.map(function (_, i) { return i; });
  if (parts.length > 1 && cols.length > 1) return parts.every(function (p, i) { return cols[i] != null && String(row[cols[i]]).trim() === p; });
  return cols.some(function (i) { return String(row[i]).trim() === parts[0] || (parts[0].length > 2 && String(row[i]).indexOf(parts[0]) >= 0); });
}
function _snapIndex_(vals, kIdx) {
  var m = {}, seen = {};
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r]; if (row.every(function (c) { return c === '' || c == null; })) continue;
    var k = kIdx.map(function (i) { return _snapNorm_(row[i]).trim(); }).join(' ¦ ');
    seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += ' #' + seen[k];
    m[k] = r;
  }
  return m;
}
function _snapSheetDiff_(pid, spec, filter, cap) {
  var L = _snapReadLive_(spec.name); if (!L) return { recs: [], token: '' };
  var A = _snapSheetAt_(pid, spec.name).vals, B = L.vals;
  var hdr = (B[0] || A[0] || []).map(String), hdrA = (A[0] || []).map(String);
  var kIdx = _snapKeyIdx_(hdr, spec), kIdxA = _snapKeyIdx_(hdrA, spec);
  var mA = _snapIndex_(A, kIdxA), mB = _snapIndex_(B, kIdx), recs = [];
  var colA = {}; hdrA.forEach(function (h, i) { colA[h] = i; });
  var tIdx = (spec.title || []).map(function (h) { return hdr.indexOf(h); }).filter(function (i) { return i >= 0; });
  var title = function (row) { return (tIdx.length ? tIdx : kIdx).map(function (i) { return _snapShow_(row[i]); }).filter(Boolean).join(' — '); };
  Object.keys(mA).forEach(function (k) {
    if (recs.length >= cap) return;
    var ra = A[mA[k]], rb = mB[k] != null ? B[mB[k]] : null;
    if (!_snapMatch_(ra, hdrA, spec, filter) && !(rb && _snapMatch_(rb, hdr, spec, filter))) return;
    if (!rb) { recs.push({ sheet: spec.name, key: k, state: 'deleted', title: title(ra), fields: hdrA.map(function (h, i) { return { c: h, at: _snapShow_(ra[i]), now: '' }; }).filter(function (f) { return f.at !== ''; }) }); return; }
    var fields = [];
    hdr.forEach(function (h, i) { var ia = colA[h]; if (ia == null) return; if (_snapNorm_(ra[ia]) !== _snapNorm_(rb[i])) fields.push({ c: h, at: _snapShow_(ra[ia]), now: _snapShow_(rb[i]) }); });
    if (fields.length) recs.push({ sheet: spec.name, key: k, state: 'changed', title: title(rb), fields: fields });
  });
  Object.keys(mB).forEach(function (k) {
    if (recs.length >= cap || mA[k] != null) return;
    var rb = B[mB[k]]; if (!_snapMatch_(rb, hdr, spec, filter)) return;
    recs.push({ sheet: spec.name, key: k, state: 'added', title: title(rb), fields: hdr.map(function (h, i) { return { c: h, at: '', now: _snapShow_(rb[i]) }; }).filter(function (f) { return f.now !== ''; }) });
  });
  return { recs: recs, token: _snapHashVals_(B) };
}
// 📒 فروق القيود: السجل = القيد — كشف حساب (كود) أو قيد بعينه
var SNAP_GL_TXT_ = { 4: 'البيان', 9: 'المرجع', 10: 'الرحلة', 11: 'الشركة' };
function _snapGlDiff_(pid, filter, cap) {
  var EA = _snapSheetAt_(pid, GL_SHEETS_.entries.name).vals, LA = _snapSheetAt_(pid, GL_SHEETS_.lines.name).vals;
  var EB = _glRows_('entries'), LB = _glRows_('lines'), f = _glStr_(filter);
  var linesOf = function (L, skipHdr) { var m = {}; for (var i = skipHdr ? 1 : 0; i < L.length; i++) { var id = _glStr_(L[i][0]); if (id) (m[id] = m[id] || []).push(L[i]); } return m; };
  var la = linesOf(LA, true), lb = linesOf(LB, false), ea = {}, eb = {};
  for (var i = 1; i < EA.length; i++) if (_glStr_(EA[i][0])) ea[_glStr_(EA[i][0])] = EA[i];
  EB.forEach(function (r) { if (_glStr_(r[0])) eb[_glStr_(r[0])] = r; });
  var want = function (id) {
    if (!f) return true; if (id === f) return true;
    return (la[id] || []).concat(lb[id] || []).some(function (l) { return _glStr_(l[4]) === f; });
  };
  var ltxt = function (ls) { return (ls || []).slice().sort(function (a, b) { return (+a[1] || 0) - (+b[1] || 0); }).map(_audLineTxt_); };
  var recs = [], ids = {}; Object.keys(ea).concat(Object.keys(eb)).forEach(function (id) { ids[id] = 1; });
  Object.keys(ids).forEach(function (id) {
    if (recs.length >= cap || !want(id)) return;
    var a = ea[id], b = eb[id], tA = ltxt(la[id]), tB = ltxt(lb[id]);
    var head = function (r) { return r ? (_glStr_(r[3]) + ' — ' + _glDate_(r[2]) + ' — ' + _glStr_(r[4])) : ''; };
    if (a && !b) { recs.push({ sheet: 'GL', key: id, state: 'deleted', title: id + ' — ' + head(a), fields: [{ c: 'القيد كاملاً', at: tA.join('\n'), now: '', whole: 1 }] }); return; }
    if (!a && b) { recs.push({ sheet: 'GL', key: id, state: 'added', title: id + ' — ' + head(b), fields: [{ c: 'القيد كاملاً', at: '', now: tB.join('\n'), whole: 1 }] }); return; }
    var fields = [];
    Object.keys(SNAP_GL_TXT_).forEach(function (ci) { if (_glStr_(a[ci]) !== _glStr_(b[ci])) fields.push({ c: SNAP_GL_TXT_[ci], at: _glStr_(a[ci]), now: _glStr_(b[ci]) }); });
    var other = [];
    [[2, 'التاريخ'], [3, 'النوع'], [5, 'الحالة']].forEach(function (x) { if (_snapNorm_(_glDate_(a[x[0]])) !== _snapNorm_(_glDate_(b[x[0]]))) other.push(x[1] + ': ' + _glDate_(a[x[0]]) + ' ⇐ ' + _glDate_(b[x[0]])); });
    if (tA.join('\n') !== tB.join('\n') || other.length) fields.push({ c: 'القيد كاملاً (مبالغ/أسطر/تاريخ/حالة)', at: other.concat(tA).join('\n'), now: tB.join('\n'), whole: 1 });
    if (fields.length) recs.push({ sheet: 'GL', key: id, state: 'changed', title: id + ' — ' + head(b), fields: fields });
  });
  return { recs: recs, token: _snapHashVals_(EB.concat(LB)) };
}
function snapDiff(authToken, pid, screenKey, filter) {
  if (!_snapCanRestore_(authToken)) throw new Error('المقارنة والاستعادة للمدير أو لمن مُنح صلاحية «استعادة النسخ السابقة»');
  var S = _snapScreen_(screenKey), cap = 1500, out = { success: true, screen: S.label, records: [], tokens: {}, truncated: false };
  if (S.gl) { var g = _snapGlDiff_(pid, filter, cap); out.records = g.recs; out.tokens.GL = g.token; }
  else S.sheets.forEach(function (spec) {
    try { var d = _snapSheetDiff_(pid, spec, filter, cap - out.records.length); out.records = out.records.concat(d.recs); out.tokens[spec.name] = d.token; }
    catch (e) { out.records.push({ sheet: spec.name, key: '', state: 'error', title: e.message, fields: [] }); }
  });
  out.truncated = out.records.length >= cap;
  var P = _snapIdxAll_().filter(function (x) { return x.id === pid; })[0]; out.pointAt = P ? P.at : '';
  return out;
}
// picks: [{sheet, key, state, fields:[اسم العمود...] أو whole:1}]
function snapApply(authToken, pid, screenKey, picks, tokens) {
  var session = requireAuth_(authToken);
  if (!_snapCanRestore_(authToken)) throw new Error('الاستعادة للمدير أو لمن مُنح صلاحية «استعادة النسخ السابقة»');
  _audGate_();
  var S = _snapScreen_(screenKey); picks = picks || []; tokens = tokens || {};
  if (!picks.length) throw new Error('لم يُحدَّد شيء للاستعادة');
  var P = _snapIdxAll_().filter(function (x) { return x.id === pid; })[0]; if (!P) throw new Error('نقطة الاستعادة غير موجودة');
  var done = 0, problems = [], audits = [];
  if (S.gl) {
    if (_snapHashVals_(_glRows_('entries').concat(_glRows_('lines'))) !== tokens.GL) throw new Error('تغيّرت القيود منذ المعاينة — أعد «معاينة الفروقات» ثم الاستعادة');
    try { _snapLight_('قبل استعادة', S.label + ' من ' + P.at, session.username, [GL_SHEETS_.entries.name, GL_SHEETS_.lines.name]); } catch (e) {}
    picks.forEach(function (pk) {
      try {
        var id = _glStr_(pk.key);
        if (pk.whole) {
          if (pk.state === 'added') { glDeleteEntry(authToken, id); done++; return; }
          snapRestoreEntry(authToken, pid, id); done++; return;
        }
        var lock = _glLock_(); lock.waitLock(30000);
        try {
          var f = _glFindEntry_(id); if (!f) throw new Error('القيد غير موجود حالياً');
          if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة');
          var EA = _snapSheetAt_(pid, GL_SHEETS_.entries.name).vals, ra = null;
          for (var i = 1; i < EA.length; i++) if (_glStr_(EA[i][0]) === id) { ra = EA[i]; break; }
          if (!ra) throw new Error('القيد غير موجود بالنقطة');
          _snapEntryTake_(id, f.r, _glLinesOf_(id), 'قبل استعادة حقل', session.username);
          (pk.fields || []).forEach(function (c) {
            var ci = +Object.keys(SNAP_GL_TXT_).filter(function (x) { return SNAP_GL_TXT_[x] === c; })[0]; if (!ci) return;
            _glSheet_('entries').getRange(f.row, ci + 1).setValue(ra[ci]);
            audits.push({ user: session.username, action: 'استعادة حقل قيد من نقطة ' + P.at, type: 'استعادة', record: 'GL:' + id, field: c, old: f.r[ci], 'new': ra[ci] });
            done++;
          });
        } finally { _glUnlock_(lock); }
      } catch (e) { problems.push(pk.key + ': ' + e.message); }
    });
  } else {
    var bySheet = {}; picks.forEach(function (pk) { (bySheet[pk.sheet] = bySheet[pk.sheet] || []).push(pk); });
    var names = Object.keys(bySheet);
    names.forEach(function (n) { if (!S.sheets.some(function (x) { return x.name === n; })) throw new Error('الورقة ' + n + ' ليست من هذه الشاشة'); });
    var lock2 = LockService.getScriptLock(); lock2.waitLock(60000);
    try {
      names.forEach(function (n) { var L = _snapReadLive_(n); if (!L || _snapHashVals_(L.vals) !== tokens[n]) throw new Error('تغيّرت بيانات «' + n + '» منذ المعاينة — أعد «معاينة الفروقات» ثم الاستعادة'); });
      _snapLight_('قبل استعادة', S.label + ' من ' + P.at, session.username, names);
      names.forEach(function (n) {
        var spec = S.sheets.filter(function (x) { return x.name === n; })[0];
        var L = _snapReadLive_(n), B = L.vals, A = _snapSheetAt_(pid, n).vals, sh = L.sh;
        var hdr = (B[0] || []).map(String), hdrA = (A[0] || []).map(String), colA = {}; hdrA.forEach(function (h, i) { colA[h] = i; });
        var mA = _snapIndex_(A, _snapKeyIdx_(hdrA, spec)), mB = _snapIndex_(B, _snapKeyIdx_(hdr, spec)), dels = [];
        bySheet[n].forEach(function (pk) {
          var ia = mA[pk.key], ib = mB[pk.key];
          if (pk.state === 'added') { if (ib != null) { dels.push(ib + 1); audits.push({ user: session.username, action: 'استعادة: حذف سجل أُضيف بعد ' + P.at, type: 'استعادة', record: n + ':' + pk.key, field: 'السجل', old: B[ib].map(_snapShow_).join(' | '), 'new': '' }); done++; } return; }
          if (ia == null) { problems.push(pk.key + ': غير موجود بالنقطة'); return; }
          var ra = A[ia];
          if (pk.state === 'deleted' || ib == null) {
            var row = hdr.length ? hdr.map(function (h) { return colA[h] != null ? ra[colA[h]] : ''; }) : ra;
            sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
            audits.push({ user: session.username, action: 'استعادة: إعادة سجل محذوف من نقطة ' + P.at, type: 'استعادة', record: n + ':' + pk.key, field: 'السجل', old: '', 'new': row.map(_snapShow_).join(' | ') });
            done++; return;
          }
          var cur = B[ib].slice(), cols = pk.whole ? hdr : (pk.fields || []), any = false;
          cols.forEach(function (c) {
            var i = hdr.indexOf(c), j = colA[c]; if (i < 0 || j == null) return;
            if (_snapNorm_(cur[i]) === _snapNorm_(ra[j])) return;
            audits.push({ user: session.username, action: 'استعادة حقل من نقطة ' + P.at, type: 'استعادة', record: n + ':' + pk.key, field: c, old: _snapShow_(cur[i]), 'new': _snapShow_(ra[j]) });
            cur[i] = ra[j]; any = true; done++;
          });
          if (any) sh.getRange(ib + 1, 1, 1, cur.length).setValues([cur]);
        });
        dels.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
        try { PropertiesService.getScriptProperties().deleteProperty('SNAPH_' + n); } catch (e) {}
      });
    } finally { lock2.releaseLock(); }
  }
  if (audits.length) _audLog_(audits);
  logChange_(session.username, 'استعادة انتقائية من نقطة', 'SNAP:' + pid, S.label, P.at, done + ' تغيير' + (problems.length ? ' — تعذّر ' + problems.length : ''));
  try { if (typeof clearAllCache === 'function') clearAllCache(); } catch (e) {}
  try { if (typeof _vzClearCache_ === 'function') _vzClearCache_(); } catch (e) {}
  return { success: true, done: done, problems: problems };
}
function snapScreens(authToken) {
  _snapAdmin_(authToken);
  return { success: true, screens: SNAP_SCREENS_.map(function (s) { return { k: s.k, label: s.label, filter: s.filter || '' }; }) };
}
