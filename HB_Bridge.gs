/* ============================================================================
   🏨 (V4.211) المرحلة H4 — برنامج الحجوزات داخل مشروع برنامج العمرة (برنامج واحد)
   ----------------------------------------------------------------------------
   ملفات HB_* هي برنامج الحجوزات نفسه كما هو (تُولَّد من hotels/ بالأداة tools/hb_merge.py) — نفس
   الشاشات والكشف والتأكيدات والبوت والبوابة. هذا الملف هو «الجسر» بين البرنامجين:
     • ملف بيانات الحجوزات: يُفتح بمعرّفه (المشروع مرتبط بشيت العمرة)، من نفس إعداد الربط بالحسابات.
     • الدخول الموحّد: زر «🏨 حجوزات الفنادق» ببرنامج العمرة يُصدر رمزاً لمرة واحدة (دقيقتان) يفتح
       برنامج الحجوزات بمستخدمه المطابق (نفس اسم الدخول) بلا تسجيل دخول ثانٍ.
     • الروابط: ?page=hotels (البرنامج) و ?page=portal (بوابة العملاء) على نفس رابط النشر، وويب هوك
       بوت الحجوزات يُميَّز بمعامل tghook — راجع doGet/doPost في Code.gs.
     • النقل: استيراد إعدادات المشروع القديم (التوكنات، سر البوابة، العهد، مصدر الحجوزات…) مرة واحدة.
   ============================================================================ */
var HB_PROGRAM_PROP_ = 'HB_PROGRAM_SS_ID';
var HB_MIGRATION_SHEET_ = '_hb_migration';

function hbProgramId_() {
  var id = PropertiesService.getScriptProperties().getProperty(HB_PROGRAM_PROP_) || '';
  if (!id) { try { id = _glSettings_().hb_ss_id || ''; } catch (e) {} }
  return String(id).trim();
}
var _HB_PROGRAM_SS_ = null;
function hbProgramSS_() {
  if (_HB_PROGRAM_SS_) return _HB_PROGRAM_SS_;
  var id = hbProgramId_();
  if (!id) throw new Error('لم يُحدَّد ملف برنامج الحجوزات — من «الحسابات العامة ← 🏨 الحجوزات ← الربط والمزامنة» الصق رابط الملف');
  _HB_PROGRAM_SS_ = SpreadsheetApp.openById(id);
  return _HB_PROGRAM_SS_;
}

/* ---------- الدخول الموحّد ---------- */
// من برنامج العمرة: يُصدر رمز دخول لمرة واحدة ورابط فتح برنامج الحجوزات
function hbHandoff(authToken) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'admin') && !_sessionHasPerm_(session, 'hotels.view')) throw new Error('لا تملك صلاحية الدخول لبرنامج حجوزات الفنادق');
  hbProgramSS_();   // يفشل مبكراً برسالة واضحة لو الملف غير مربوط
  var code = Utilities.getUuid().replace(/-/g, '');
  // 🔐 (V4.220) سقف صلاحية الحجوزات الممنوح ببرنامج العمرة (متدرّج) ينتقل مع الدخول الموحّد
  var isAdm = _sessionHasPerm_(session, 'admin');
  var cap = isAdm ? 'admin' : (['delete', 'edit', 'add', 'view'].filter(function (c) { return _sessionHasPerm_(session, 'hotels.' + c); })[0] || 'view');
  CacheService.getScriptCache().put('hbsso_' + code, JSON.stringify({ u: session.username, admin: isAdm, cap: cap }), 120);
  return { url: ScriptApp.getService().getUrl() + '?page=hotels&sso=' + code };
}
// من واجهة الحجوزات: يستبدل الرمز بجلسة حجوزات عادية لنفس اسم المستخدم (صلاحياته هناك كما هي)
function hbSsoLogin(code) {
  try {
    code = String(code || '').replace(/[^\w-]/g, '');
    var cache = CacheService.getScriptCache(), raw = code ? cache.get('hbsso_' + code) : null;
    if (!raw) throw new Error('انتهت صلاحية رابط الدخول — افتح برنامج الحجوزات من جديد من برنامج العمرة، أو سجّل الدخول يدويًا');
    cache.remove('hbsso_' + code);
    var info = JSON.parse(raw), sh = ensureUsersSheet_(), rowIdx = findUserRow_(sh, info.u), row = null;
    if (rowIdx !== -1) row = sh.getRange(rowIdx, 1, 1, 8).getValues()[0];
    else if (info.admin && sh.getLastRow() > 1) {
      // مدير برنامج العمرة بلا مستخدم بنفس الاسم هنا ← أول مدير مفعَّل في برنامج الحجوزات
      sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().some(function (r) {
        if (r[6] !== false && userRecordFromRow_(r).role === 'admin') { row = r; return true; }
        return false;
      });
    }
    if (!row) throw new Error('المستخدم «' + info.u + '» غير معرَّف في برنامج الحجوزات — يضيفه المدير من شاشة «👤 المستخدمون» بنفس اسم الدخول');
    if (row[6] === false) throw new Error('هذا الحساب معطَّل في برنامج الحجوزات — تواصل مع المدير');
    var user = userRecordFromRow_(row), minutes = getSessionDurationMinutes(), token = Utilities.getUuid();
    var sessions = readSessions_();
    sessions[token] = { username: user.username, expiresAt: Date.now() + minutes * 60000, cap: info.cap || 'view' };
    user = capUserBySso_(user, info.cap || 'view');
    writeSessions_(sessions);
    hbLogChange_(user, 'الدخول', user.username, 'دخول موحّد من برنامج العمرة (' + info.u + ')', '', '');
    return safeReturn_({ ok: true, token: token, user: user, sessionMinutes: minutes });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------- نقل الإعدادات من المشروع القديم ---------- */
// المشروع القديم (بعد استبدال كوده بملف hotels/OLD_PROJECT_Stub.gs) يكتب خصائصه في ورقة مخفية
// «_hb_migration» داخل ملف الحجوزات عبر hbExportPropsForMerge. هنا تُقرأ وتُحفظ ثم تُحذف الورقة.
var HB_MIGRATION_SKIP_ = { ACTIVE_SESSIONS: 1, GL_LINK_SS_ID: 1, TELEGRAM_HOOK_BASEURL: 1, TELEGRAM_POLL_OFFSET: 1 };
var HB_MIGRATION_RENAME_ = { GEMINI_API_KEY_1: 'HB_GEMINI_API_KEY_1', GEMINI_API_KEY_2: 'HB_GEMINI_API_KEY_2' };
function _hbImportProps_() {
  var ss = hbProgramSS_(), sh = ss.getSheetByName(HB_MIGRATION_SHEET_);
  if (!sh || sh.getLastRow() < 2) throw new Error('لا توجد ورقة «' + HB_MIGRATION_SHEET_ + '» بملف الحجوزات — شغّل hbExportPropsForMerge في المشروع القديم أولاً');
  var p = PropertiesService.getScriptProperties(), n = 0, skipped = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var k = String(r[0] || '').trim(), v = String(r[1] == null ? '' : r[1]);
    if (!k) return;
    if (HB_MIGRATION_SKIP_[k]) { skipped.push(k); return; }
    k = HB_MIGRATION_RENAME_[k] || k;
    if (k === 'GEMINI_API_KEY' || k === 'TELEGRAM_BOT_TOKEN' || k === 'TELEGRAM_CHAT_ID' || k === 'SESSION_DURATION_MINUTES') { skipped.push(k + ' (مفتاح يخص برنامج العمرة)'); return; }
    p.setProperty(k, v); n++;
  });
  ss.deleteSheet(sh);
  return { imported: n, skipped: skipped };
}
// للمدير من المحرر: نقل الإعدادات + تجهيز مشغّلات تليجرام/العهد + ضبط ويب هوك البوت على الرابط الجديد
function hbFinishMigration() {
  // (V4.243) صاحب السكربت قد لا يُعرَف ببريده داخل مشروع العمرة ⇒ يُسمح فقط ما دامت ورقة النقل «_hb_migration» موجودة
  // (تنشئها دالة التصدير بالمشروع القديم وتُحذف هنا بعد الاستيراد مباشرة — نافذة دقائق لمرة واحدة)
  var hasMig = false; try { hasMig = !!hbProgramSS_().getSheetByName(HB_MIGRATION_SHEET_); } catch (e0) {}
  if (!hasMig) throw new Error('لا توجد ورقة «' + HB_MIGRATION_SHEET_ + '» بملف الحجوزات — شغّل أولاً hbExportPropsForMerge من محرر مشروع الحجوزات القديم (بعد لصق ملف OLD_PROJECT_Stub فيه)، ثم أعد تشغيل hbFinishMigration هنا');
  requireScriptOwner_({ allowNoEmail: true });
  var r = _hbImportProps_();
  try { ensureTgQueueSheet_(); ensureTelegramTrigger_(); r.triggers = 'OK'; } catch (e) { r.triggers = e.message; }
  try { tgWebhookSelfHeal_(); r.webhook = 'OK'; } catch (e) { r.webhook = e.message; }
  Logger.log(JSON.stringify(r));
  return r;
}

/* ---------- 🏨 (V4.226) بيانات الحجز من كشف الحساب بالحسابات العامة: عرض وتعديل ----------
   السطر المرتبط بحجز (قيد AUTO:HB) يفتح بيانات الحجز من شيت المصدر نفسه، والتعديل يُكتب بنفس دالة
   برنامج الحجوزات (editBookingFieldsAsUser_ — نفس السجل والتنبيهات وقاعدة «مؤكد») بهوية المستخدم المطابق
   وسقف صلاحيته، ثم يُعاد بناء قيد الحجز بالحسابات العامة (التعديل بعد القيد ينتظر الاعتماد كالمعتاد). */
function _hbBridgeUser_(session) {
  var sh = ensureUsersSheet_(), idx = findUserRow_(sh, session.username), row = null, isAdm = _sessionHasPerm_(session, 'admin');
  if (idx !== -1) row = sh.getRange(idx, 1, 1, 8).getValues()[0];
  else if (isAdm && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().some(function (r) { if (r[6] !== false && userRecordFromRow_(r).role === 'admin') { row = r; return true; } return false; });
  if (!row) throw new Error('المستخدم «' + session.username + '» غير معرَّف في برنامج الحجوزات — يضيفه المدير بنفس اسم الدخول');
  if (row[6] === false) throw new Error('حسابك معطَّل في برنامج الحجوزات');
  var cap = isAdm ? 'admin' : (['delete', 'edit', 'add', 'view'].filter(function (c) { return _sessionHasPerm_(session, 'hotels.' + c); })[0] || 'view');
  return capUserBySso_(userRecordFromRow_(row), cap);
}
function _hbBridgeFind_(glKey) {
  _GL_HB_MEMO_ = null;
  var b = _glHbRead_().bookings.filter(function (x) { return x.key === glKey; })[0];
  if (!b) throw new Error('لم يُعثر على الحجز بملف الحجوزات (ربما حُذف أو تغيّر رقمه الداخلي)');
  var s = getSourceSettings_(), ss = openSourceSpreadsheet_(s), sh = ss.getSheetByName(b.city === 'مكة' ? s.meccaSheet : s.medinaSheet);
  if (!sh) throw new Error('شيت ' + b.city + ' غير موجود بمصدر الحجوزات');
  var row = b.row, raw = sh.getRange(row, 1, 1, SOURCE_LAST_COL).getValues()[0];
  if (b.inner && String(raw[2] || '').trim() !== b.inner) {   // الصف تحرّك — بحث بالرقم الداخلي
    var start = b.city === 'مكة' ? s.meccaStartRow : s.medinaStartRow, last = sh.getLastRow(), vals = last >= start ? sh.getRange(start, 1, last - start + 1, SOURCE_LAST_COL).getValues() : [];
    row = 0; vals.some(function (r, i) { if (String(r[2] || '').trim() === b.inner) { raw = r; row = start + i; return true; } return false; });
    if (!row) throw new Error('لم يُعثر على الحجز ' + b.inner + ' بشيت ' + b.city);
  }
  return { key: bookingKey_(raw, b.city), raw: raw, city: b.city, row: row };
}
function hbBridgeBookingGet(authToken, glKey) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'admin') && !_sessionHasPerm_(session, 'hotels.view') && !_sessionHasPerm_(session, 'gl.view')) throw new Error('لا تملك صلاحية عرض الحجوزات');
  var f = _hbBridgeFind_(String(glKey || '')), raw = f.raw, user = null;
  try { user = _hbBridgeUser_(session); } catch (e) { }
  var d = function (v) { return v instanceof Date ? Utilities.formatDate(v, 'GMT+3', 'yyyy-MM-dd') : String(v || ''); };
  var showCost = user ? hasFinanceLevel_(user, 'cost') : false, showSale = user ? hasFinanceLevel_(user, 'sale') : false;
  var canEdit = !!(user && hasScreenLevel_(user, 'bookings', 'edit') && bookingCityAllowed_(user, f.city));
  var cost = computeBookingTotal_(raw, 'supplier'), sale = computeBookingTotal_(raw, 'client');
  return { success: true, glKey: glKey, key: f.key, city: f.city, row: f.row, canEdit: canEdit, showCost: showCost, showSale: showSale, noUser: !user,
    qaid: String(raw[0] || ''), inner: String(raw[2] || ''), client: String(raw[3] || ''), hotel: String(raw[4] || ''), ci: d(raw[7]), co: d(raw[8]), nights: raw[9],
    rooms: [raw[10], raw[11], raw[12], raw[13]].map(function (v) { return Number(v) || 0; }), supplier: String(raw[14] || ''), status: String(raw[15] || ''), hotelRef: String(raw[17] || ''), note: String(raw[20] || ''),
    costP: showCost ? [raw[21], raw[22], raw[23], raw[24]].map(function (v) { return v === '' ? '' : Number(v) || 0; }) : null,
    saleP: showSale ? [raw[25], raw[26], raw[27], raw[28]].map(function (v) { return v === '' ? '' : Number(v) || 0; }) : null,
    costTotal: showCost && cost.hasPrice ? cost.value : null, saleTotal: showSale && sale.hasPrice ? sale.value : null };
}
function hbBridgeBookingSave(authToken, glKey, bookingKey, fields) {
  var session = requireAuth_(authToken);
  var user = _hbBridgeUser_(session);
  if (!hasScreenLevel_(user, 'bookings', 'edit')) throw new Error('تعديل الحجوزات يحتاج صلاحية «تعديل» بشاشة الحجوزات ببرنامج الحجوزات');
  var allow = { 5: 1, 8: 1, 9: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 18: 1, 21: 1, 22: 1, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 28: 1, 29: 1 };
  var map = {}; Object.keys(fields || {}).forEach(function (c) { if (allow[c]) map[c] = fields[c]; });
  if (!Object.keys(map).length) return { success: true, count: 0 };
  var r = editBookingFieldsAsUser_(user, String(bookingKey || ''), map);
  if (!r || !r.ok) throw new Error((r && r.error) || 'تعذّر حفظ الحجز');
  var gl = { updated: 0, pending: 0 };
  try {
    _GL_HB_MEMO_ = null; _GL_ACC_MEMO_ = null;
    var lock = _glLock_(); lock.waitLock(90000);   // (V4.276) قفل الحسابات المستقل بدل قفل السكربت العام
    try { var a = _glAutoRun_(session.username, false, { onlyKeys: ['AUTO:HB:' + glKey] }); gl = { updated: a.updated, pending: a.pending, created: a.created }; } finally { _glUnlock_(lock); }
  } catch (e) { gl.error = e.message; }
  return { success: true, count: r.count, gl: gl };
}

/* ---------- 🏨 (V4.242 — دمج المرحلة 2) شاشات الحجوزات داخل برنامج العمرة ----------
   الشاشات الجديدة (🏨 الفنادق: الحجوزات · الوصول والأرصدة · بيان الأرصدة) تستدعي دوال برنامج الحجوزات نفسها
   (searchBookings / appendBookingFromForm / editBookingFields / getArrivalsByDateRange / getPartyBalancesAsOf …)
   بجلسة حجوزات تُصدَر هنا لنفس المستخدم المطابق وبسقف صلاحيته ببرنامج العمرة — فتبقى قواعد الصلاحيات (المدينة،
   الجانب المالي، مستوى الشاشة) والسجل والتنبيهات وحساب الأسعار مطابقة حرفياً لبرنامج الحجوزات. */
function hbBridgeSession(authToken) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'admin') && !_sessionHasPerm_(session, 'hotels.view')) throw new Error('لا تملك صلاحية «حجوزات الفنادق»');
  hbProgramSS_();
  var user = _hbBridgeUser_(session), cap = user.ssoCap || 'admin';
  var minutes = getSessionDurationMinutes(), token = Utilities.getUuid(), sessions = readSessions_();
  sessions[token] = { username: user.username, expiresAt: Date.now() + minutes * 60000, cap: cap };
  writeSessions_(sessions);
  var cities = user.bookingCityScope && user.bookingCityScope !== 'all' ? [user.bookingCityScope] : ['مكة', 'المدينة'];
  return safeReturn_({ success: true, token: token, minutes: minutes, cities: cities,
    user: { username: user.username, name: user.displayName || user.username, permissions: user.permissions || {}, financeLevel: user.financeLevel || '', admin: user.role === 'admin' || cap === 'admin',
      showCost: hasFinanceLevel_(user, 'cost'), showSale: hasFinanceLevel_(user, 'sale') } });
}
/* 🔄 (V4.332) زر المزامنة الاحتياطية بكشف الفندق (شاشة كشف الحساب ببرنامج الحجوزات): يُظهر فوراً أي دفعة مسجَّلة بالحسابات العامة على
   هذا الطرف (أي تاريخ) ولم تظهر بكشفه. الدفعات الجديدة تصل لحظياً بالحفظ — هذا احتياطي يدوي. party فارغ ⇒ كل الأطراف.
   الجلسة جلسة برنامج الحجوزات (صلاحية تسجيل الدفعات). */
function hbSyncFromGl(token, party) {
  try {
    var user = requirePermission_(token, 'payments', 'add');
    if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return { ok: false, error: 'برنامج الحجوزات غير مربوط بالحسابات العامة' };
    if (!_glHbOnlyK_()) return { ok: false, error: 'لم يُفعَّل «تاريخ القطع» بالحسابات العامة بعد (الحسابات العامة ← 🏨 الحجوزات ← 💳 دفعات الفنادق)' };
    var lock = _glLock_();
    if (!lock.tryLock(60000)) { _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1); return { ok: false, error: 'الحسابات العامة مشغولة بعملية أخرى — أعد المحاولة بعد لحظات' }; }
    try {
      _GL_HB_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_ACC_MEMO_ = null;
      var r = _glHbMirrorAll_(String(party || '').trim() || null);
      try { if (typeof invalidatePaymentsMemo_ === 'function') invalidatePaymentsMemo_(); } catch (eI) {}
      try { logChange_(user.username || 'الحجوزات', 'مزامنة دفعات الحسابات العامة لكشف الفندق', 'GL:hbsync', String(party || '') || 'كل الأطراف', '-', (r.mirrored || 0) + ' قيد · ' + (r.rows || 0) + ' صف'); } catch (eL) {}
      var dups = [], dupsTotal = 0; try { dups = _glHbDupScan_(String(party || '').trim() || null); dupsTotal = dups.length; dups = dups.slice(0, 60); } catch (eD) { Logger.log('dup scan: ' + eD.message); }   // 🔍 (V4.338)
      return { ok: true, mirrored: r.mirrored || 0, rows: r.rows || 0, dups: dups, dupsTotal: dupsTotal };
    } finally { _glUnlock_(lock); }
  } catch (e) { return { ok: false, error: e.message }; }
}
/* 🛠️ (V4.341) دفعة بكشف الفندق بلا قيد مطابق: مرشَّحات للربط · ربط يدوي · إنشاء قيدها التلقائي · تعليمها «لا تحتاج قيداً» */
function hbPayEntryCands(token, payId) {
  try {
    requirePermission_(token, 'payments', 'view');
    if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return { ok: false, error: 'برنامج الحجوزات غير مربوط بالحسابات العامة' };
    var r = _glHbPayCands_(payId); return { ok: true, pay: r.pay, cands: r.cands };
  } catch (e) { return { ok: false, error: e.message }; }
}
// act: 'link' (entryId) · 'create' · 'ignore' · 'unignore' · 'unlink'
function hbPayEntryAct(token, payId, act, entryId) {
  try {
    var user = requirePermission_(token, 'payments', 'edit');
    if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return { ok: false, error: 'برنامج الحجوزات غير مربوط بالحسابات العامة' };
    var lock = _glLock_();
    if (!lock.tryLock(60000)) { _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1); return { ok: false, error: 'الحسابات العامة مشغولة بعملية أخرى — أعد المحاولة بعد لحظات' }; }
    try {
      _GL_SET_MEMO_ = null; _GL_ACC_MEMO_ = null; payId = String(payId || '');
      var who = (user && user.username) || 'الحجوزات';
      if (act === 'link') {
        var f = _glFindEntry_(String(entryId || '')); if (!f || String(f.r[5]) !== GL_ST_POSTED_) return { ok: false, error: 'القيد غير موجود أو غير مرحَّل' };
        _glHbPayMapSet_('hb_paylink', payId, String(entryId)); _glHbPayMapSet_('hb_paynoent', payId, '');
      } else if (act === 'unlink') { _glHbPayMapSet_('hb_paylink', payId, ''); }
      else if (act === 'ignore') { _glHbPayMapSet_('hb_paynoent', payId, 1); }
      else if (act === 'unignore') { _glHbPayMapSet_('hb_paynoent', payId, ''); }
      else if (act === 'create') {
        var r = _glHbApplyKeysLocked_(who, ['AUTO:HBP:' + payId]);
        if (!r || !(r.created || r.updated)) return { ok: false, error: 'لم يُنشأ قيد — تحقق من ربط الطرف بحساب (🗂️ خريطة الحسابات) ثم أعد المحاولة' };
      } else return { ok: false, error: 'إجراء غير معروف' };
      try { logChange_(who, 'ربط دفعة فندق بقيد (' + act + ')', 'GL:hbpaylink', payId, '-', String(entryId || '')); } catch (eL) {}
      return { ok: true };
    } finally { _glUnlock_(lock); }
  } catch (e) { return { ok: false, error: e.message }; }
}
/* 🔍 (V4.338) تقرير الدفعات المشتبه بتكرارها (نفس الطرف والتاريخ والمبلغ) + تنفيذ قرار المستخدم (حذف/دمج/إبقاء/تجاهل) */
function hbDupReport(token, party) {
  try {
    requirePermission_(token, 'payments', 'view');
    if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return { ok: false, error: 'برنامج الحجوزات غير مربوط بالحسابات العامة' };
    return { ok: true, dups: _glHbDupScan_(String(party || '').trim() || null) };
  } catch (e) { return { ok: false, error: e.message }; }
}
// ops: [{act:'del', ids:[…]}, {act:'ignore', sig}] — حذف نسخة قيد = إخفاؤها بالكشف فقط (القيد باقٍ بالحسابات العامة)
function hbDupResolve(token, ops) {
  try {
    var user = requirePermission_(token, 'payments', 'delete');
    if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return { ok: false, error: 'برنامج الحجوزات غير مربوط بالحسابات العامة' };
    var lock = _glLock_();
    if (!lock.tryLock(60000)) { _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1); return { ok: false, error: 'الحسابات العامة مشغولة بعملية أخرى — أعد المحاولة بعد لحظات' }; }
    try {
      _GL_HB_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_ACC_MEMO_ = null;
      var isAdmin = user && user.role === 'admin';
      var r = _glHbDupApply_((ops || []).slice(0, 100), function (id) { return deletePayment(id, token, isAdmin); });
      try { if (typeof invalidatePaymentsMemo_ === 'function') invalidatePaymentsMemo_(); } catch (eI) {}
      try { logChange_(user.username || 'الحجوزات', 'قرار تكرار دفعات الفنادق', 'GL:hbdup', '-', '-', 'منفَّذ ' + r.done + (r.errors.length ? ' · أخطاء ' + r.errors.length : '')); } catch (eL) {}
      return { ok: r.errors.length === 0, done: r.done, errors: r.errors, error: r.errors.join('\n') };
    } finally { _glUnlock_(lock); }
  } catch (e) { return { ok: false, error: e.message }; }
}
/* ⚡ (V4.330) الربط اللحظي لتعديلات شيتات الحجوزات المباشرة (والحذف اليدوي للدفعات): كل تعديل يدوي بالشيت يضع علامة «مستحق»
   ثم تُحدَّث قيود الحجوزات (AUTO:HB) بالحسابات العامة فوراً لو لم تجرِ مزامنة خلال آخر 45 ثانية، وإلا تلتقطها مهمة الدقيقة
   (drainTelegramQueue) خلال أقل من دقيقة — فلا حاجة لضغط مزامنة يدوية. التجميع يمنع بناء القيود مع كل خلية في لصق جماعي. */
var HB_LIVE_GAP_MS_ = 45000;
function hbGlLiveTouch_() {
  try {
    if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return;
    CacheService.getScriptCache().put('hb_live_due', String(Date.now()), 900);
    hbGlLiveRun_();
  } catch (e) { Logger.log('hbGlLiveTouch_: ' + e.message); }
}
/* ⚡ (V4.354) إضافة/تعديل حجز من النموذج أو شاشة الحجوزات أو بوت تليجرام (كتابة بالسكربت لا تُطلق مشغّل تعديل الشيت)
   كانت تنتظر المزامنة الساعية. الآن: علامة «مستحق» فقط (بلا أي تأخير للحفظ) ⇒ مهمة الدقيقة تسجّل القيد خلال أقل من دقيقة،
   وعلامة gl_dirty احتياطاً ⇒ المزامنة اللحظية من أي متصفح مفتوح تلتقطه لو مشغّل الدقيقة غير مثبَّت (البوت معطَّل) */
var HB_GL_LIVE_TYPES_ = /^(حجز جديد|تعديل حجز|دفعة|حذف دفعة|إعادة تسمية طرف|استيراد دفعات قديمة)$/;
function hbGlLiveMark_(type) {
  try {
    if (type && !HB_GL_LIVE_TYPES_.test(String(type))) return;
    if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return;
    var c = CacheService.getScriptCache(), now = String(Date.now());
    c.put('hb_live_due', now, 900); c.put('gl_dirty', now, 21600);
  } catch (e) { Logger.log('hbGlLiveMark_: ' + e.message); }
}
function hbGlLiveRun_() {
  var c = CacheService.getScriptCache();
  if (!c.get('hb_live_due') || c.get('hb_live_busy')) return null;
  if (Date.now() - (+c.get('hb_live_at') || 0) < HB_LIVE_GAP_MS_) return null;
  if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) { c.remove('hb_live_due'); return null; }
  c.put('hb_live_busy', '1', 300);
  try {
    var lock = _glLock_();
    if (!lock.tryLock(20000)) { _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1); return null; }   // القفل مشغول ⇒ تبقى «مستحقة» لدورة الدقيقة التالية
    try {
      c.remove('hb_live_due'); c.put('hb_live_at', String(Date.now()), 21600);
      _GL_HB_MEMO_ = null; _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
      var a = _glAutoRun_('تعديل مباشر بشيت الحجوزات', false, { onlyRx: /^AUTO:HB[PL]?:|^AUTO:HBOPEN$/ });
      if (a.created || a.updated || a.voided) {
        try { logChange_('الحجوزات', 'مزامنة لحظية لقيود الحجوزات', 'GL:hblive', '-', '-', 'جديد ' + a.created + '، معدّل ' + a.updated + '، ملغى ' + a.voided + (a.pending ? '، بانتظار الاعتماد ' + a.pending : '')); } catch (eL) {}
      }
      return a;
    } finally { _glUnlock_(lock); }
  } catch (e) { Logger.log('hbGlLiveRun_: ' + e.message); try { c.put('hb_live_due', String(Date.now()), 900); } catch (e2) {} return null; }
  finally { c.remove('hb_live_busy'); }
}
// بعد إضافة/تعديل حجز من الشاشات الجديدة: تحديث قيود الحجوزات بالحسابات العامة فوراً (التعديل على حجز مقيَّد
// ينتظر الاعتماد كالمعتاد). بلا ربط بالحسابات ⇒ لا شيء.
function hbBridgeGlRefresh(authToken) {
  var session = requireAuth_(authToken);
  if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return { success: true, skipped: true };
  var lock = _glLock_();   // (V4.276) قفل الحسابات المستقل — لا يوقف حفظ باقي البرنامج
  if (!lock.tryLock(90000)) { try { CacheService.getScriptCache().put('gl_dirty', String(Date.now()), 21600); } catch (eD) {} return { success: true, deferred: true }; }
  try {
    _GL_HB_MEMO_ = null; _GL_ACC_MEMO_ = null;
    var a = _glAutoRun_(session.username, false, { onlyRx: /^AUTO:HB:/ });
    return { success: true, created: a.created, updated: a.updated, voided: a.voided, pending: a.pending };
  } catch (e) { return { success: false, error: e.message }; }
  finally { _glUnlock_(lock); }
}

/* ---------- 📲 (V4.244) رابط ويب هوك بوت الحجوزات ----------
   داخل المحرر/المشغّلات قد يعيد ScriptApp.getService().getUrl() رابط الاختبار (/dev بمعرّف السكربت) لا رابط النشر
   (/exec بمعرّف النشر) — فسُجّل البوت على رابط لا يعمل بعد hbFinishMigration، والإصلاح الذاتي كل دقيقة يكرره.
   الحل: أول فتح لبرنامج العمرة من المتصفح (سياق النشر الحقيقي) يحفظ رابط /exec الصحيح، ويُعاد تسجيل البوت عليه فوراً. */
function hbRememberExecUrl_() {
  try {
    var u = String(ScriptApp.getService().getUrl() || '').split('?')[0];
    if (!/\/macros\/s\/[^\/]+\/exec$/.test(u)) return;          // رابط /dev أو غير معروف ⇒ لا شيء
    var c = CacheService.getScriptCache(); if (c.get('hb_exec_ok') === u) return;
    var p = PropertiesService.getScriptProperties(), old = p.getProperty(TG_PROP_HOOKURL_) || '';
    if (old !== u) {
      p.setProperty(TG_PROP_HOOKURL_, u);
      try { tgWebhookSelfHeal_(); } catch (e1) { Logger.log('hbRememberExecUrl_/heal: ' + e1.message); }
    }
    c.put('hb_exec_ok', u, 21600);
  } catch (e) { Logger.log('hbRememberExecUrl_: ' + e.message); }
}
// تشخيص من المحرر: يطبع وضع البوت والرابط المتوقع وحالة الويب هوك كما يراها تليجرام
function hbBotStatus_() {
  var p = PropertiesService.getScriptProperties();
  var r = { mode: tgBotMode_() || '(متوقف)', hasToken: !!tgToken_(), savedExecUrl: p.getProperty(TG_PROP_HOOKURL_) || '(لم يُحفظ — افتح برنامج العمرة من رابطه مرة)',
    expected: tgWebhookUrl_(), telegram: tgWebhookHealth_() };
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/* ---------- 👤 (V4.253) صلاحيات الفنادق من شاشة «المستخدمون» ببرنامج العمرة ----------
   مستخدم الحجوزات = نفس اسم الدخول ببرنامج العمرة (الدخول موحّد). المدير يضبط من هنا مستوى كل شاشة حجوزات،
   والمدينة، والجانب المالي — ويُنشأ مستخدم الحجوزات تلقائياً إن لم يكن موجوداً (بكلمة مرور عشوائية: الدخول موحّد). */
function hbUsersMap(authToken) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'admin')) throw new Error('للمدير فقط');
  var sh = ensureUsersSheet_(), data = sh.getDataRange().getValues(), out = {};
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue;
    var u = userRecordFromRow_(data[i]);
    out[String(u.username).trim().toLowerCase()] = { username: u.username, displayName: u.displayName, role: u.role, permissions: u.permissions,
      bookingCityScope: u.bookingCityScope, financeLevel: u.financeLevel, accountScope: u.accountScope, active: u.active };
  }
  return { success: true, users: out, screens: ALL_SCREENS_.map(function (k) { return [k, SCREEN_LABELS_SRV_[k] || k]; }),
    levels: PERM_LEVELS_.map(function (k) { return [k, PERM_LEVEL_LABELS_[k]]; }), finance: FINANCE_LEVELS_.map(function (k) { return [k, FINANCE_LEVEL_LABELS_[k]]; }) };
}
function hbUserSaveFromMain(authToken, username, p) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'admin')) throw new Error('للمدير فقط');
  username = String(username || '').trim(); p = p || {};
  if (!username) throw new Error('اسم المستخدم مطلوب');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sh = ensureUsersSheet_(), rowIdx = findUserRow_(sh, username), created = false, saved = {};
    if (rowIdx === -1) {
      var salt = Utilities.getUuid();
      sh.appendRow([username, p.displayName || username, salt, hbHashPassword_(Utilities.getUuid(), salt), 'user', '{}', true, new Date()]);
      rowIdx = sh.getLastRow(); created = true;
    } else { try { saved = JSON.parse(sh.getRange(rowIdx, 6).getValue() || '{}'); } catch (eJ) { saved = {}; } }
    var perms = {}; Object.keys(saved).forEach(function (k) { perms[k] = saved[k]; });   // يحفظ uiPrefs وأي مفتاح آخر
    ALL_SCREENS_.forEach(function (s) { var l = p.permissions && p.permissions[s]; perms[s] = PERM_LEVELS_.indexOf(l) !== -1 ? l : 'none'; });
    perms.bookingCityScope = (p.bookingCityScope === 'مكة' || p.bookingCityScope === 'المدينة') ? p.bookingCityScope : 'all';
    perms.financeLevel = FINANCE_LEVELS_.indexOf(p.financeLevel) !== -1 ? p.financeLevel : 'none';
    if (!perms.accountScope) perms.accountScope = 'all';
    var role = p.role === 'admin' ? 'admin' : 'user';
    if (p.displayName) sh.getRange(rowIdx, 2).setValue(p.displayName);
    sh.getRange(rowIdx, 5, 1, 3).setValues([[role, JSON.stringify(perms), p.active !== false]]);
    invalidateUserRecordCache_(username);
    hbLogChange_({ username: session.username, displayName: session.username }, 'المستخدمون', username,
      (created ? 'إنشاء مستخدم حجوزات من برنامج العمرة' : 'تعديل صلاحيات الحجوزات من برنامج العمرة') + ' (' + (role === 'admin' ? 'مدير' : 'مستخدم') + ')', '', '');
    try { logChange_(session.username, 'صلاحيات الفنادق', username, created ? 'إنشاء' : 'تعديل', '', JSON.stringify(perms).slice(0, 400)); } catch (eL) {}
    return { success: true, created: created };
  } finally { lock.releaseLock(); }
}

/* ---------- 🏛️ (V4.357) دفعات برنامج الحجوزات عبر طابور الاعتماد (نفس آلية حسابات عملاء العمرة) ----------
   عند تفعيل «توحيد قنوات التسجيل» (ledger_central): الدفعة من كشف الفندق لا تُكتب بسجل الدفعات مباشرة — يُنشأ سند
   قبض/صرف مسودة بالحسابات العامة (الحساب المقابل إلزامي + فحص تكرار نفس اليوم) ويدخل طابور الاعتماد (Maker-Checker).
   عند الاعتماد يُرحَّل وتظهر الدفعة بكشف الفندق فوراً (مرآة V4.344). التسجيل من هذه الشاشة يتحكم فيه المدير من
   إعداد «التسجيل من الشاشات» (تفعيل/إيقاف + مستخدمون محددون). البنود اليدوية بالكشف تبقى مغلقة (قيد يومية من الحسابات). */
function hbPayRoute_(actingUser) {
  if (!hbLedgerClosed_()) { var f = hbGlOnlyFrom_(); if (f) throw new Error(HB_GL_ONLY_MSG_ + ' (منذ ' + f + ')'); return ''; }
  var a = _ledgerScrAllowed_('hb', actingUser.username, actingUser.role === 'admin');
  if (!a.ok) throw new Error(a.why || HB_LEDGER_MSG_);
  return 'ledger';
}
function hbLedgerSess_(u) { return { username: u.username, fullName: u.displayName || u.username, _hb: true, hbAdmin: u.role === 'admin' }; }
function hbPayDmy_(v) {
  if (!v) return '';
  var m = !(v instanceof Date) && String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);   // yyyy-mm-dd من نموذج الدفعة
  if (m) return ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1];
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(v))) return String(v);
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? String(v) : Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy');
}
function hbLedgerOut_(r) {
  if (r && r.success) return { ok: true, pending: true, id: r.id, voucherNo: r.voucherNo, dupFlag: !!r.dupFlag,
    message: '⏳ سُجّلت كسند ' + (r.voucherNo || '') + ' بانتظار الاعتماد — تظهر بالكشف بعد اعتمادها' };
  return { ok: false, dup: !!(r && r.dup), dups: (r && r.dups) || [], code: (r && r.code) || '', error: (r && r.error) || 'تعذّر التسجيل' };
}
function hbLedgerPayArgs_(payment) {
  var cur = String(payment.glCur || 'SAR').toUpperCase();
  return { party: String(payment.partyName || '').trim(), date: hbPayDmy_(payment.date), amount: parseAmountLoose_(payment.amount), currency: 'SAR',
    desc: String(payment.note || '').trim() ? String(payment.note).trim() + ' — ' + String(payment.partyName || '').trim() : '',
    cp: String(payment.glCash || '').trim(), dir: payment.direction === 'in' ? 'in' : 'out', force: !!payment.force,
    cashCur: cur !== 'SAR' ? cur : '', cashAmt: cur !== 'SAR' ? payment.glAmount : '' };
}
function hbLedgerSubmitPay_(actingUser, payment) {
  try { return hbLedgerOut_(_ledgerSubmit_(hbLedgerSess_(actingUser), 'hb', hbLedgerPayArgs_(payment))); }
  catch (e) { return { ok: false, error: e.message }; }
}
// دفعة مزدوجة (طرف دفع لطرف آخر مباشرة): سند واحد بين حسابي الطرفين بالحسابات العامة — لا نقدية
function hbLedgerSubmitLinked_(actingUser, payload) {
  try {
    var from = String(payload.fromParty || '').trim(), to = String(payload.toParty || '').trim();
    if (!from || !to) throw new Error('الطرفان مطلوبان');
    if (from === to) throw new Error('يجب أن يكون الطرفان مختلفين');
    var toAcc = _ledgerPartyAcc_('hb', to);
    var note = String(payload.note || '').trim() || 'تحويل';
    return hbLedgerOut_(_ledgerSubmit_(hbLedgerSess_(actingUser), 'hb', { party: from, date: hbPayDmy_(payload.date), amount: parseAmountLoose_(payload.amount), currency: 'SAR',
      desc: 'دفعة مزدوجة: ' + note + ' — من ' + from + ' إلى ' + to, cp: toAcc.code, dir: 'in', force: !!payload.force }));
  } catch (e) { return { ok: false, error: e.message }; }
}
// عدة دفعات بنفس الاتجاه: rows = [{partyName, amount, note, date, glCash, glCur, glAmount}]
function hbLedgerSubmitBatch_(actingUser, direction, rows) {
  var sess = hbLedgerSess_(actingUser), res = [], okN = 0;
  (rows || []).forEach(function (r) {
    try {
      var out = hbLedgerOut_(_ledgerSubmit_(sess, 'hb', hbLedgerPayArgs_(Object.assign({}, r, { direction: direction, force: true }))));
      res.push(Object.assign({ party: r.partyName }, out)); if (out.ok) okN++;
    } catch (e) { res.push({ party: r.partyName, ok: false, error: e.message }); }
  });
  var bad = res.filter(function (x) { return !x.ok; });
  return { ok: okN > 0, pending: true, count: okN, results: res,
    message: '⏳ ' + okN + ' دفعة بانتظار الاعتماد' + (bad.length ? ' · تعذّر ' + bad.length + ': ' + bad.map(function (x) { return x.party + ' (' + x.error + ')'; }).join('، ') : ''),
    error: okN ? '' : ((bad[0] || {}).error || 'تعذّر التسجيل') };
}
// حالة التسجيل لكشف الفندق: هل الطابور مفعّل؟ وهل مسموح لهذا المستخدم؟
function hbLedgerState(token) {
  var u = requireSession_(token);
  var on = hbLedgerClosed_(), a = on ? _ledgerScrAllowed_('hb', u.username, u.role === 'admin') : { ok: true };
  return { on: on, allowed: !!a.ok, why: a.why || '' };
}
// الدفعات بانتظار الاعتماد لطرف فندقي (تظهر بكشفه)
function hbLedgerPending(token, party) {
  requirePermission_(token, 'payments', 'view');
  if (!hbLedgerClosed_()) return { ok: true, rows: [] };
  var k = _glNorm_(party);
  return { ok: true, rows: _ledgerRows_().filter(function (x) { return _glStr_(x.r[10]) === LEDGER_PEND_ && _glStr_(x.r[1]) === 'hb' && _glNorm_(x.r[2]) === k; })
    .map(function (x) { var r = x.r; return { id: _glStr_(r[0]), date: _glDate_(r[4]), amount: _glNum_(r[5]), cur: _glStr_(r[6]), maker: _glStr_(r[7]), voucher: _glStr_(r[14]), counter: _glStr_(r[15]), dup: _glStr_(r[9]) }; }) };
}

/* ---------- 🔗 (V4.357) ربط الحساب الفندقي بحساب عام مباشرة من «بيانات الحساب» ----------
   حقل «الحساب العام» ببيانات الحساب: اختيار حساب فرعي من دليل الحسابات بالبحث ⇒ يُكتب الربط بخريطة أسماء برنامج
   الحجوزات (نفس GL_HB_Map — النوع يُستنتج من مجموعة الحساب) ⇒ مزامنة فورية: قيود حجوزات/دفعات الطرف بالحسابات العامة،
   وقيود الحسابات العامة على الحساب تُنسخ لكشف الفندق. والحساب المربوط يظهر بكوده واسمه. */
function hbGlTypeForAcc_(code, cur) {
  if (cur && GL_HB_TYPES_[cur] && GL_HB_TYPES_[cur].parent && code.indexOf(GL_HB_TYPES_[cur].parent) === 0) return cur;
  var best = '', len = 0;
  Object.keys(GL_HB_TYPES_).forEach(function (t) { var p = GL_HB_TYPES_[t].parent; if (p && code.indexOf(p) === 0 && p.length > len) { best = t; len = p.length; } });
  if (best) return best;
  var a = _glAccounts_().map[code] || {};
  return a.kind === 'client' ? 'عميل' : a.kind === 'custody' ? 'عهدة' : 'مورد';
}
function hbGlAccLink(token, name) {
  requirePermission_(token, 'statement', 'view');
  name = String(name || '').trim();
  if (typeof _glHbOn_ !== 'function' || !_glSSId_()) return { ok: true, linked: false, off: true };
  var m = _glHbMap_()[_glHbKey_(name)], a = m && m.code ? _glAccounts_().map[m.code] : null;
  return { ok: true, linked: !!a, code: a ? a.code : '', accName: a ? a.name : '', type: m ? m.type : '', ignored: !!(m && m.type === 'تجاهل') };
}
// قائمة الحسابات الفرعية النشطة للاختيار (كل الدليل — مرتبة: موردو/عملاء الحجوزات أولاً)
function hbGlAccList(token) {
  requirePermission_(token, 'statement', 'view');
  var pref = {}; Object.keys(GL_HB_TYPES_).forEach(function (t) { var p = GL_HB_TYPES_[t].parent; if (p) pref[p] = 1; });
  var out = _glAccounts_().list.filter(function (a) { return !a.isGroup && a.active !== false && !a._virtual && a.kind !== 'fx'; })
    .map(function (a) { var hb = Object.keys(pref).some(function (p) { return a.code.indexOf(p) === 0; }); return { code: a.code, name: a.name, kind: a.kind || '', cur: a.currency || '', hb: hb }; });
  out.sort(function (x, y) { return (y.hb - x.hb) || (x.code < y.code ? -1 : 1); });
  return { ok: true, accounts: out };
}
function hbGlAccLinkSave(token, name, code) {
  var user = requirePermission_(token, 'statement', 'edit');
  name = String(name || '').trim(); code = String(code || '').trim();
  if (!name) throw new Error('اسم الحساب مطلوب');
  if (!_glSSId_()) throw new Error('الحسابات العامة غير مُجهَّزة');
  var who = user.username || 'الحجوزات', res = { ok: true, code: code };
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_HB_MEMO_ = null;
    var accs = _glAccounts_(), map = _glHbMap_(), k = _glHbKey_(name), old = map[k], now = _glNow_();
    if (code) {
      var a = accs.map[code];
      if (!a) throw new Error('الحساب ' + code + ' غير موجود بدليل الحسابات');
      if (a.isGroup) throw new Error('«' + a.name + '» حساب تجميعي — اختر حساباً فرعياً');
      if (a.active === false) throw new Error('«' + a.name + '» حساب موقوف');
      map[k] = { name: name, type: hbGlTypeForAcc_(code, old && old.type), code: code, link: (old && old.link) || '', notes: (old && old.notes) || 'ربط من بيانات الحساب ببرنامج الحجوزات', by: who, at: now };
      res.accName = a.name; res.type = map[k].type;
    } else if (old) delete map[k];
    _glHbWriteAll_('hbmap', Object.keys(map).map(function (x) { var m = map[x]; return [m.name, m.type, m.code, m.link || '', m.notes || '', m.by || who, m.at || now]; }));
    logChange_(who, 'ربط حساب فندقي بحساب عام', 'GL:hb', name, old && old.code ? old.code : '-', code ? code + ' — ' + res.accName : '(فك الربط)');
  } finally { _glUnlock_(lock); }
  // مزامنة فورية: قيود حجوزات ودفعات هذا الطرف ⇒ ثم نسخ قيود الحساب العام لكشف الفندق
  if (code) {
    try {
      var lk = _glLock_();
      if (lk.tryLock(90000)) {
        try {
          _GL_HB_MEMO_ = null; _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
          var r = _glAutoRun_(who, false, { onlyRx: /^AUTO:HB[PL]?:|^AUTO:HBOPEN$/ });
          res.sync = { created: r.created, updated: r.updated, voided: r.voided, pending: r.pending };
          try { var mr = _glHbMirrorAll_(name); res.mirrored = (mr && mr.mirrored) || 0; } catch (eM) { res.mirrorError = eM.message; }
          try { if (typeof invalidatePaymentsMemo_ === 'function') invalidatePaymentsMemo_(); } catch (eI) {}
        } finally { _glUnlock_(lk); }
      } else { _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1); hbGlLiveMark_('إعادة تسمية طرف'); res.deferred = true; }
    } catch (eS) { res.syncError = eS.message; }
  }
  return res;
}
