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
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try { var a = _glAutoRun_(session.username, false, { onlyKeys: ['AUTO:HB:' + glKey] }); gl = { updated: a.updated, pending: a.pending, created: a.created }; } finally { lock.releaseLock(); }
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
// بعد إضافة/تعديل حجز من الشاشات الجديدة: تحديث قيود الحجوزات بالحسابات العامة فوراً (التعديل على حجز مقيَّد
// ينتظر الاعتماد كالمعتاد). بلا ربط بالحسابات ⇒ لا شيء.
function hbBridgeGlRefresh(authToken) {
  var session = requireAuth_(authToken);
  if (typeof _glHbOn_ !== 'function' || !_glHbOn_()) return { success: true, skipped: true };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_HB_MEMO_ = null; _GL_ACC_MEMO_ = null;
    var a = _glAutoRun_(session.username, false, { onlyRx: /^AUTO:HB:/ });
    return { success: true, created: a.created, updated: a.updated, voided: a.voided, pending: a.pending };
  } catch (e) { return { success: false, error: e.message }; }
  finally { lock.releaseLock(); }
}

/* ---------- 🤖 (V4.244) رابط ويب هوك بوت الحجوزات ----------
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
function hbBotStatus() {
  var p = PropertiesService.getScriptProperties();
  var r = { mode: tgBotMode_() || '(متوقف)', hasToken: !!tgToken_(), savedExecUrl: p.getProperty(TG_PROP_HOOKURL_) || '(لم يُحفظ — افتح برنامج العمرة من رابطه مرة)',
    expected: tgWebhookUrl_(), telegram: tgWebhookHealth_() };
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
