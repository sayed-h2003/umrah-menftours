/* ============================================================
   ⏪ (V4.346) التراجع الزمني — اللقطات ونقاط الاستعادة
   ------------------------------------------------------------
   ① لقطات الكيانات (أدق مستوى): صورة كاملة للقيد (رأسه + كل أسطره) قبل أي تعديل/إلغاء/حذف، وللدفعة (عملاء العمرة/
      الوكلاء) قبل تعديلها/حذفها ⇒ «↩️ استعادة هذه النسخة» تعيد الكيان كما كان (حتى لو حُذف)، والاستعادة نفسها تُسبق بلقطة
      فهي قابلة للتراجع، وتُسجَّل بالسجل المحصّن.
   ② نقاط استعادة النظام: نسخة كاملة يومية من ملفات البرنامج (البرنامج الرئيسي + الحسابات العامة + الحجوزات) بمجلد محمي،
      ونسخة فورية قبل أي عملية خطرة (حذف مجمّع، إقفال/فتح سنة، استيراد، إصلاح، استعادة ورقة كاملة). الاحتفاظ: اليومية 30
      يوماً، وأول نسخة بكل شهر 12 شهراً، والفورية 14 يوماً.
   ③ الاستعادة الانتقائية من نقطة: قيد واحد، أو ورقة كاملة (شاشة) — للمدير فقط، مع معاينة وبلقطة فورية قبلها.
   ============================================================ */
var SNAP_PROP_FOLDER_ = 'SNAP_FOLDER_ID', SNAP_IDX_SHEET_ = 'RestorePoints', SNAP_ROW_SHEET_ = 'RowSnapshots';
var SNAP_CELL_MAX_ = 45000;   // حد الخلية 50 ألف حرف — البيانات الأطول تُقسَّم على أعمدة متتالية
var SNAP_KEEP_DAILY_ = 30, SNAP_KEEP_RISK_ = 14, SNAP_KEEP_MONTHS_ = 12, SNAP_RISK_GAP_MIN_ = 30;

function _snapId_(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _snapNowTxt_() { return Utilities.formatDate(new Date(), (typeof _tz_ === 'function' && _tz_()) || 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss'); }
function _snapPack_(obj) {
  var s = JSON.stringify(obj, function (k, v) { return (this[k] instanceof Date) ? { __d: this[k].getTime() } : v; }), out = [];
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
    else keep = ageD <= SNAP_KEEP_RISK_;
    if (keep) return;
    var files = []; try { files = JSON.parse(String(v[5])) || []; } catch (e) {}
    files.forEach(function (f) { try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) {} });
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
        files: files.map(function (f) { return { role: f.role, label: f.label, url: 'https://docs.google.com/spreadsheets/d/' + f.id }; }) });
    });
  }
  try { cron = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'snapDailyCron'; }); } catch (e) {}
  return { success: true, points: out.reverse(), cron: cron, audit: !!PropertiesService.getScriptProperties().getProperty('AUDIT_SS_ID') };
}
function snapSetup(authToken) {
  var s = _snapAdmin_(authToken);
  if (!PropertiesService.getScriptProperties().getProperty('AUDIT_SS_ID')) throw new Error('فعّل «السجل المحصّن» أولاً');
  _snapFolder_();
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'snapDailyCron'; })) ScriptApp.newTrigger('snapDailyCron').timeBased().everyDays(1).atHour(3).create();
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
// أوراق ملف بنقطة معيّنة (لاختيار ورقة لاستعادتها)
function snapPointSheets(authToken, pid, role) {
  _snapAdmin_(authToken);
  var p = _snapPoint_(pid), f = p.files.filter(function (x) { return x.role === role; })[0];
  if (!f) throw new Error('الملف غير موجود بهذه النقطة');
  return { success: true, sheets: SpreadsheetApp.openById(f.id).getSheets().map(function (s) { return { name: s.getName(), rows: Math.max(0, s.getLastRow() - 1) }; }) };
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
// ③ استعادة ورقة كاملة كما كانت بنقطة استعادة (شاشة كاملة) — بنقطة فورية قبلها حتماً
function snapRestoreSheet(authToken, pid, role, sheetName, confirmText) {
  var session = _snapAdmin_(authToken);
  if (_glStr_(confirmText) !== 'استعادة') throw new Error('اكتب «استعادة» للتأكيد');
  _audGate_();
  var p = _snapPoint_(pid), f = p.files.filter(function (x) { return x.role === role; })[0];
  if (!f) throw new Error('الملف غير موجود بهذه النقطة');
  var src = SpreadsheetApp.openById(f.id).getSheetByName(sheetName); if (!src) throw new Error('الورقة غير موجودة بالنقطة');
  var liveId = (_snapSources_().filter(function (x) { return x.role === role; })[0] || {}).id; if (!liveId) throw new Error('الملف الحالي غير معروف');
  var dst = SpreadsheetApp.openById(liveId).getSheetByName(sheetName); if (!dst) throw new Error('الورقة غير موجودة بالملف الحالي');
  CacheService.getScriptCache().remove('snap_risk_recent');
  var pre = _snapSystem_('قبل عملية خطرة', 'قبل استعادة ورقة ' + sheetName + ' من ' + p.at, session.username);
  if (pre.errors.length) throw new Error('تعذّرت نقطة الاستعادة الفورية قبل العملية — أُلغيت الاستعادة: ' + pre.errors.join(' · '));
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  var glLk = (role === 'gl') ? _glLock_() : null; if (glLk) glLk.waitLock(60000);
  try {
    var vals = src.getDataRange().getValues(), oldN = dst.getLastRow();
    if (dst.getMaxRows() < vals.length) dst.insertRowsAfter(dst.getMaxRows(), vals.length - dst.getMaxRows());
    if (dst.getMaxColumns() < vals[0].length) dst.insertColumnsAfter(dst.getMaxColumns(), vals[0].length - dst.getMaxColumns());
    dst.getRange(1, 1, Math.max(oldN, 1), Math.max(dst.getLastColumn(), 1)).clearContent();
    dst.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
    if (glLk) { _GL_DIRTY_ = true; }
    logChange_(session.username, 'استعادة ورقة كاملة من نقطة استعادة', 'SNAP:' + pid, sheetName, oldN + ' صف (قبل) — نقطة فورية ' + pre.id, (vals.length) + ' صف من ' + p.at);
  } finally { if (glLk) _glUnlock_(glLk); lock.releaseLock(); }
  try { if (typeof clearAllCache === 'function') clearAllCache(); } catch (e) {}
  return { success: true, rows: vals.length - 1, prePoint: pre.id };
}
