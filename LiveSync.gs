/* ============================================================================
   ⚡ (V4.367) الواجهة اللحظية — طبقة المزامنة الحية على الخادم (Live Sync)
   ----------------------------------------------------------------------------
   القياس أثبت أن كل نداء للخادم يكلّف ≈ 4 ثوانٍ ثابتة (تحميل كود المشروع) مهما صغر عمله، فلا يمكن أن تصبح
   الشاشات لحظية بتسريع الخادم وحده. الحل: الشاشة تُعرض فوراً من المتصفح، والخادم يُسأل في الخلفية فقط عن
   «هل تغيّر شيء؟» — وهذا الملف يجيب عن هذا السؤال بأقل كلفة ممكنة:

   • بصمات البيانات (dv): لكل مجموعة بيانات (الحجوزات، الحركات، الرحلات، المعتمرون، التأشيرات، الوزارة، القوائم،
     برنامج الحجوزات، الحسابات العامة) رمز في CacheService يتغيّر مع كل كتابة تمسّها (_dvBump_ مربوطة بنقاط إبطال
     الكاش الموجودة أصلاً: _cacheBust_ / clearAllCache_ / _vzClearCache_ / _mfClearBootstrapCache_ / _glBump_ /
     invalidateSourceCache_ / invalidatePaymentsMemo_). لا ScriptProperties إطلاقاً (لها حصة يومية).
     رمز مفقود (انتهاء صلاحية الكاش) ⇒ يُولَّد رمز جديد ⇒ أسوأ الأحوال تحقق إضافي واحد من المتصفح، لا بيانات قديمة.
   • _dvBump_ يدفع كتابات الأوراق المعلّقة (SpreadsheetApp.flush) قبل تغيير الرمز: Apps Script يؤجل الكتابة لنهاية
     التنفيذ، فلولا ذلك قد يقرأ مستخدم آخر البيانات القديمة بعد تغيّر الرمز ويحفظها بالرمز الجديد.
   • lfFetch: يستدعي دالة قراءة من القائمة البيضاء (LF_READ_) ويرجع بصمتها (MD5). نفس البصمة التي يملكها المتصفح
     ⇒ {same:true} بلا بيانات (رد صغير). الرموز تُقرأ قبل بناء البيانات لا بعده: كتابة تحدث أثناء البناء تظهر
     كتغيير في النبضة التالية بدل أن تُنسب بيانات قديمة لرمز جديد.
   • lfPoll: أخف نداء ممكن — تحقق الجلسة من الكاش فقط + قراءة واحدة لكل الرموز.
   • أقفال المورد (_resLock_ / _resLocks_): قفل مسمّى لكل مورد بدل قفل السكربت العام — حفظ مجموعة تأشيرات لا
     يوقف حفظ ملف وزارة. مبنية على _glNamedLock_ (قفل الحسابات المجرَّب) مع إعادة الدخول بنفس التنفيذ.
   ============================================================================ */
var LF_GROUPS_ = ['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns', 'hb', 'gl'];
var LF_UMRAH_GROUPS_ = ['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns'];
// دوال القراءة المسموح جلبها بالبصمة ⇐ المجموعات التي تتأثر بها (الواجهة تحدّث الشاشة عند تغيّر أي منها)
var LF_READ_ = {
  getTripsList: ['trips', 'bookings', 'ministry', 'pilgrims'],
  getTripPilgrims: ['pilgrims', 'trips'],
  getAllMovementsAuth: ['movements', 'bookings'],
  getGlobalPilgrimsRegistry: ['pilgrims', 'trips'],
  getAllBookingsAuth: ['bookings', 'trips'],
  getVisaBootstrap: ['visa', 'trips', 'dropdowns', 'gl'],
  getVisaTripLinks: ['visa', 'trips'],
  getMinistryBootstrap: ['ministry', 'trips', 'dropdowns', 'gl'],
  getMinistryTripLinks: ['ministry', 'trips', 'bookings'],
  loadDropdownsData: ['dropdowns'],
  getUnifiedStatement: ['hb', 'gl']
};
// مجموعات إبطال الكاش الموجودة (CACHE_GROUPS_) ⇐ مجموعات البصمات المتأثرة (نفس منطق المفاتيح التي يمسحها كل منها)
var LF_CG_MAP_ = {
  booking: ['bookings', 'movements', 'trips', 'visa', 'ministry'],
  trip: ['trips', 'pilgrims', 'bookings', 'movements', 'visa', 'ministry', 'dropdowns'],
  pilgrims: ['pilgrims', 'trips'],
  users: ['dropdowns'],
  company: ['dropdowns', 'visa', 'ministry'],
  folder: []
};
var LF_DV_TTL_ = 21600;   // أقصى صلاحية للكاش (6 ساعات) — بعدها رمز جديد ⇒ تحقق إضافي واحد فقط

function _lfG_() { return (typeof globalThis !== 'undefined') ? globalThis : this; }
function _dvTok_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// تغيير رموز مجموعات (بعد كتابة). الكتابات المعلّقة تُدفع أولاً — انظر رأس الملف
function _dvBump_(groups) {
  try {
    var o = {}, t = _dvTok_(), n = 0;
    (groups || []).forEach(function (g) { if (g && LF_GROUPS_.indexOf(g) >= 0) { o['dv_' + g] = t; n++; } });
    if (!n) return;
    try { SpreadsheetApp.flush(); } catch (eF) {}
    CacheService.getScriptCache().putAll(o, LF_DV_TTL_);
  } catch (e) {}
}
// من نقاط إبطال الكاش القديمة (_cacheBust_) — مجموعة غير معروفة ⇒ كل مجموعات العمرة (أمان)
function _dvBumpCacheGroup_(group) { _dvBump_(LF_CG_MAP_[group] || LF_UMRAH_GROUPS_); }

// كل الرموز الحالية (قراءة واحدة). المفقود يُولَّد ويُحفظ
function _dvAll_() {
  var c = CacheService.getScriptCache(), got = {}, out = {}, miss = {}, nm = 0;
  try { got = c.getAll(LF_GROUPS_.map(function (g) { return 'dv_' + g; })) || {}; } catch (e) {}
  LF_GROUPS_.forEach(function (g) {
    var v = got['dv_' + g];
    if (v) out[g] = v;
    else { out[g] = miss['dv_' + g] = 'e' + _dvTok_(); nm++; }
  });
  if (nm) { try { c.putAll(miss, LF_DV_TTL_); } catch (e) {} }
  return out;
}

// تحقق الجلسة بأقل كلفة: جلسة العمرة (session_) أو جلسة برنامج الحجوزات (sess_) من الكاش بقراءة واحدة،
// والمسار الكامل (استعادة الجلسة من الخصائص) فقط عند غيابها من الكاش
var LF_SESS_ERR_ = 'جلسة غير صالحة أو منتهية - يرجى تسجيل الدخول مرة أخرى';
function _lfAuth_(token) {
  if (!token) throw new Error(LF_SESS_ERR_);
  var got = {};
  try { got = CacheService.getScriptCache().getAll(['session_' + token, 'sess_' + token]) || {}; } catch (e) {}
  if (got['session_' + token] || got['sess_' + token]) return true;
  try { if (validateSession_(token)) return true; } catch (e1) {}
  try { if (typeof checkSession === 'function') { var r = checkSession(token); if (r && r.ok) return true; } } catch (e2) {}
  throw new Error(LF_SESS_ERR_);
}

function _lfHash_(json) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, json, Utilities.Charset.UTF_8));
}
// رد صالح للتخزين بالمتصفح؟ (لا أخطاء ولا ردود «قديمة» يعيد بها الخادم المحاولة بنفسه — انظر res.stale بالتأشيرات/الوزارة)
function _lfCacheable_(data) {
  if (data === null || data === undefined) return false;
  if (typeof data !== 'object') return true;
  if (Array.isArray(data)) return true;
  return !(data.success === false || data.ok === false || data.stale || data.error);
}

/**
 * جلب دالة قراءة بالبصمة. h = بصمة النسخة التي يعرضها المتصفح (أو '').
 * يرجع {same:true,h,dv,g} لو لم يتغيّر شيء، وإلا {data,h,dv,g}. h فارغة ⇒ الرد لا يُخزَّن (خطأ/قديم).
 */
function lfFetch(token, fn, args, h) {
  _lfAuth_(token);
  var grp = LF_READ_[fn], G = _lfG_();
  if (!grp || typeof G[fn] !== 'function') throw new Error('lfFetch: دالة غير مسموحة — ' + fn);
  var dv = _dvAll_();   // قبل البناء (انظر رأس الملف)
  var t0 = Date.now();
  var data = G[fn].apply(null, Array.isArray(args) ? args : []);
  var ms = Date.now() - t0;
  try { if (typeof _perfRecA_ === 'function' && (ms >= 800 || Math.random() < 0.25)) _perfRecA_('lf:' + fn, ms, 0, false); } catch (eP) {}
  var ok = _lfCacheable_(data), hh = '';
  if (ok) { try { hh = _lfHash_(JSON.stringify(data)); } catch (eH) { hh = ''; } }
  if (hh && h && hh === String(h)) return { same: true, h: hh, dv: dv, g: grp };
  return { data: data, h: hh, dv: dv, g: grp };
}

/** النبضة الذكية: رموز كل المجموعات فقط (لا قراءة أوراق، لا خصائص). */
function lfPoll(token) {
  _lfAuth_(token);
  return { ok: true, dv: _dvAll_(), t: Date.now() };
}

/* ---------- 🔒 أقفال المورد ----------
   _resLock_('vz') ⇒ نفس واجهة LockService (tryLock/waitLock/hasLock/releaseLock). قفل السكربت يُمسَك لحظياً فقط
   لحجز الاسم (لا طوال الحفظ)، فعمليتان على موردين مختلفين تعملان معاً. القفل المسمّى يعيد الدخول بنفس التنفيذ. */
var LF_BUSY_MSG_ = 'الشيت مشغول بعملية حفظ أخرى — أعد المحاولة بعد لحظات';
function _resLock_(name) { return _glNamedLock_('res:' + String(name)); }
// عدة موارد معاً بترتيب أبجدي ثابت (يمنع الانسداد المتبادل). فشل أي منها ⇒ تُحرَّر كل المأخوذة
function _resLocks_(names) {
  var list = [], seen = {};
  (names || []).forEach(function (n) { n = String(n || ''); if (n && !seen[n]) { seen[n] = 1; list.push(n); } });
  list.sort();
  var held = [];
  var rel = function () { while (held.length) { var x = held.pop(); try { x.releaseLock(); } catch (e) {} } };
  var take = function (ms) {
    var end = Date.now() + Math.max(0, ms || 0);
    for (var i = 0; i < list.length; i++) {
      var l = _resLock_(list[i]);
      if (!l.tryLock(Math.max(1, end - Date.now()))) { rel(); return false; }
      held.push(l);
    }
    return true;
  };
  return {
    tryLock: take,
    waitLock: function (ms) { if (!take(ms)) throw new Error(LF_BUSY_MSG_); },
    hasLock: function () { return held.length === list.length && list.length > 0; },
    releaseLock: rel
  };
}
// كل الموارد المعروفة — للعمليات الشاملة النادرة (الاستعادة الزمنية، إعادة التسمية المتتالية)
var LF_RES_ALL_ = ['bkid', 'cc', 'mf', 'mfseq', 'uipref', 'vz', 'vzprice'];
function _resLockAll_() { return _resLocks_(LF_RES_ALL_); }
