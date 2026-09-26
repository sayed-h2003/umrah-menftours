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
  CacheService.getScriptCache().put('hbsso_' + code, JSON.stringify({ u: session.username, admin: _sessionHasPerm_(session, 'admin') }), 120);
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
    sessions[token] = { username: user.username, expiresAt: Date.now() + minutes * 60000 };
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
  requireScriptOwner_();
  var r = _hbImportProps_();
  try { ensureTgQueueSheet_(); ensureTelegramTrigger_(); r.triggers = 'OK'; } catch (e) { r.triggers = e.message; }
  try { tgWebhookSelfHeal_(); r.webhook = 'OK'; } catch (e) { r.webhook = e.message; }
  Logger.log(JSON.stringify(r));
  return r;
}
