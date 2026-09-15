// ملف Code.gs

/* ============================================================================
   🧹 بروتوكول التنظيف الدوري (يُتبع بعد أي refactor أو استبدال دالة بأخرى)
   ------------------------------------------------------------------------
   كل مرة بيتم فيها استبدال دالة قديمة بأخرى جديدة (سواء في Code.gs أو
   index_web.html)، الخطوات دي لازم تتنفذ فوراً بدل ما تتراكم الدوال الميتة:

   1. بعد كتابة الدالة الجديدة، دوّر فوراً على الدالة القديمة اللي حلّت محلها
      وامسحها في نفس الجلسة — لا تأجيل "هنمسحها بعدين".

   2. قبل حذف أي دالة، تأكد إنها ميتة فعلاً بفحص حقيقي (مش تخمين):
        grep -n "functionName(" Code.gs index_web.html print_view.html search_web.html
      لو صفر نتائج غير سطر التعريف نفسه → آمنة للحذف.
      ⚠️ انتبه للاستدعاء غير المباشر: عبر {fn: functionName} في خرائط dispatch
      (زي runAdminSetupAction)، أو عبر ScriptApp.newTrigger('functionName')
      (استدعاء بالاسم كنص، مش استدعاء مباشر) — دول استخدام حقيقي حتى لو
      مفيش استدعاء fn() صريح في الكود.

   3. لا تحذف أبداً: onOpen, doGet, doPost (نقاط دخول تلقائية من منصة Apps
      Script نفسها، مش من كود المستخدم) — حتى لو مفيش استدعاء صريح ليهم.

   4. بعد أي حذف جماعي، شغّل فحص التوازن فوراً قبل النشر:
        node --check Code.gs   (بعد نسخه لملف .js مؤقت)
        فحص توازن <div>/</div> في index_web.html

   آخر تنظيف تم: 2026-07-16 — حُذفت 33 دالة ميتة (19 من Code.gs + 14 من
   index_web.html)، ~1000 سطر، بعد فحص مرجعي شامل ومزدوج.
   ============================================================================ */

// 🏷️ رقم إصدار الخادم — يُطبع في سجل Executions مع كل طلب، وارفعه مع كل نشر
// جنباً إلى جنب مع شارة الإصدار في index_web.html (سطر الـ badge بالشريط العلوي)
// حتى تتأكد من مطابقة الاثنين بعد أي Deploy.
var APP_VERSION = "4.139";

// يستدعيها العميل (index_web.html) لمقارنة إصدار الخادم الفعلي المنشور بإصدار الواجهة الظاهر بالشريط العلوي
function getAppVersion() {
  return { version: APP_VERSION, serverTime: new Date().toISOString() };
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🕋 نظام العمرة الذكي المطور')
    .addItem('🌐 فتح واجهة النظام الموحدة', 'getEntryAppUrl')
    .addSeparator()
    .addItem('🔔 تفعيل التنبيهات التلقائية اليومية', 'setupDailyAlertTrigger')
    .addItem('📧 إرسال تنبيه الآن (اختبار)', 'testSendAlerts')
    .addSeparator()
    .addItem('🗑️ مسح الـ Cache يدوياً', 'clearAllCacheManual')

.addItem('💬 اختبار تيليجرام الآن', 'testTelegramNow')
.addItem('💬 تفعيل تنبيه تيليجرام يومي', 'setupTelegramDailyTrigger')


    .addToUi();
}

function clearAllCacheManual() {
  clearAllCache();
  SpreadsheetApp.getUi().alert('✅ تم مسح الـ Cache بنجاح. سيتم إعادة تحميل البيانات من الشيت عند الطلب التالي.');
}



/**
 * نقطة الدخول الرئيسية للـ Web App — Google Apps Script بتستدعيها تلقائياً عند فتح أي رابط للنظام.
 * بتوجّه الطلب حسب query parameter "page":
 *   (بلا page أو page=index) → index_web.html (الشاشة الرئيسية، تتطلب تسجيل دخول)
 *   page=print&t=TOKEN        → print_view.html (طباعة إشعار، عبر توكن مؤقت من generatePrintAccessToken)
 * ⚠️ لا يوجد أي دالة تانية بتنادي doGet — دي بتتنفذ تلقائياً من منصة Apps Script فقط.
 */
function doGet(e) {

  // 🧭 تشخيص: يثبت في سجل Executions أن هذا التنفيذ هو فعلاً من نسخة الكود التي تحمل هذا الإصدار،
  // فتقدر تتأكد إن النشر (Deploy) الفعلي محدَّث بمقارنة الرقم هنا مع V3.57 في الشريط العلوي بالمتصفح.
  Logger.log("🚀 doGet نُفِّذَت — APP_VERSION: " + APP_VERSION + " | page: " + (e && e.parameter && e.parameter.page) + " | time: " + new Date());

  // 🔗 صفحة العميل (قراءة فقط): ?view=trip&t=<رمز المشاركة> — بلا تسجيل دخول وبلا أي تعديل
  if (e && e.parameter && e.parameter.view === 'trip') {
    return _renderClientTripView_(e.parameter.t || '');
  }

  var page =
    e && e.parameter.page
    ? e.parameter.page
    : "index";

  var fileName = "index_web";

  if (page === "print") {

  var template =
    HtmlService.createTemplateFromFile("print_view");

  var printToken = e.parameter.t || "";
var bookingId = resolvePrintAccessToken_(printToken);

Logger.log("📄 doGet/print → printToken: " + printToken + " | bookingId: " + bookingId + " | invalidLink سيكون: " + (!bookingId));

template.id = bookingId || "";
template.invalidLink = !bookingId;
template.reportHtml = "";

var title = 'إشعار رحلة العمرة';

if (bookingId) {

try {

  var data =
    getPrintDataForView(bookingId);

  if (data && data.id) {

    // بناء جزء الصفحة من نفس القالب الموحّد المستخدم في المشاركة أيضاً (مصدر واحد فقط للتصميم)
    template.reportHtml = buildBookingNoticeHtml_(data, true);

    // إرفاق التذكرة (إن وجدت) بنفس الطريقة المستخدمة في ملف المشاركة تماماً
    try {
      var ticketSection = buildTicketPdfSection_(data.ticketUrl);
      if (ticketSection) template.reportHtml += ticketSection;
    } catch(tErr) {
      Logger.log('Print ticket embed failed: ' + tErr);
    }

    var safeDate =

      (data.arrivalDate || '')
        .toString()
        .replace(/\//g, '-');

    title =

      (data.company || 'شركة')

      + ' - اشعار رقم ( '

      + data.id

      + ' ) وصول '

      + safeDate;
  }

} catch(err) {

  Logger.log(err);

}

}

return template

  .evaluate()

  .setTitle(title)

  .setXFrameOptionsMode(
    HtmlService.XFrameOptionsMode.ALLOWALL
  );
  }
  // 🩺 تشخيص V3.59: نسجّل الحجم الفعلي للصفحة التي يرسلها الخادم.
  // قارِن هذا الرقم بـ "الحجم المُستقبَل" الذي تطبعه المرحلة 6️⃣ في Console بالمتصفح:
  //   • الرقمان متقاربان  → الملف وصل كاملاً والمشكلة في مكان آخر.
  //   • المُستقبَل أقل بكثير → تأكيد قاطع أن التنزيل انقطع في الطريق (اقتطاع الصفحة)،
  //     وهذا هو ما يجعل دوال مثل handleLogin غير معرَّفة رغم سلامتها في الملف الأصلي.
  var _out = HtmlService.createHtmlOutputFromFile(fileName);
  try {
    Logger.log("📏 حجم index_web المُرسَل من الخادم: " + _out.getContent().length + " حرف");
  } catch (szErr) {
    Logger.log("📏 تعذّر قياس حجم الصفحة: " + szErr);
  }

  return _out

    .setTitle("ادارة رحلات العمرة")

.addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
.addMetaTag('mobile-web-app-capable', 'yes')
.addMetaTag('apple-mobile-web-app-capable', 'yes')

    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );

}


// ⚠️ ضع مفتاح Gemini API المجاني الخاص بك هنا لتفعيل استخلاص البيانات تلقائياً
// مفتاح Gemini يُقرأ من Script Properties (يُضبط من شاشة الإعدادات)
// لا توجد قيمة احتياطية مُضمَّنة في الكود لأسباب أمنية
var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "";
var GEMINI_API_KEY_2 = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY_2") || "";

function _geminiKeys_() {
  return [GEMINI_API_KEY, GEMINI_API_KEY_2].filter(function(k) {
    return k && k !== "YOUR_GEMINI_API_KEY";
  });
}
function _maskKey_(k) {
  k = String(k || "");
  return k.length > 10 ? k.substring(0, 6) + "..." + k.slice(-4) : (k ? "***" : "");
}

/* ============================================================
   🗂️ متغير مشترك للـ Spreadsheet — يُملأ مرة واحدة لكل استدعاء
   بدل 24 استدعاء منفصل لـ getSpreadsheet_()
   (كل استدعاء زيادة يستغرق ~100ms في Google Apps Script)
   ============================================================ */
var _SS_INSTANCE = null;

function getSpreadsheet_() {
  if (!_SS_INSTANCE) {
    _SS_INSTANCE = SpreadsheetApp.getActiveSpreadsheet();
    // 🧭 تشخيص V3.57: getActiveSpreadsheet() قد ترجع null في بعض سياقات تنفيذ الويب أب
    // (بدل TypeError غامض لاحقاً في أول دالة تستخدم الشيت)، فبنفشل بوضوح من هنا مباشرة
    // برسالة صريحة تصل للمستخدم عبر withFailureHandler بدل صفحة بيضاء صامتة.
    if (!_SS_INSTANCE) {
      throw new Error("تعذّر الوصول لجدول البيانات (getActiveSpreadsheet أرجعت فارغة) - تأكد أن السكريبت مرتبط بالشيت الصحيح");
    }
  }
  return _SS_INSTANCE;
}



function setupSmartSystem() {

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // =====================================================
  // إنشاء الأوراق الأساسية
  // =====================================================

  createSheetIfNotExist(ss, "Bookings");
  createSheetIfNotExist(ss, "Agents_Settings");

  // =====================================================
  // تجهيز شيت الحجوزات
  // =====================================================

  var bookSheet = ss.getSheetByName("Bookings");

  // لو الشيت جديد وفارغ
  if (bookSheet.getLastRow() === 0) {

    var headers = [

      // =================================================
      // بيانات الاعتماد
      // =================================================

      "مراجعة واعتماد",          // A
      "رقم الإشعار",             // B

      // =================================================
      // بيانات الشركات والعملاء
      // =================================================

      "الوكيل السعودي",          // C
      "الشركة المصرية",          // D
      "أرقام المجموعات",         // E
      "العميل",                  // F
      "العدد",                   // G
      "المشرف",                  // H

      // =================================================
      // بيانات السفر
      // =================================================

      "وسيلة السفر",             // I

      // =================================================
      // الوصول
      // =================================================

      "منفذ الوصول",             // J
      "تاريخ الوصول",            // K
      "ساعة الوصول",             // L
      "رقم رحلة الوصول",         // M

      // =================================================
      // المغادرة
      // =================================================

      "تاريخ المغادرة",          // N
      "رقم رحلة المغادرة",       // O
      "ساعة المغادرة",           // P
      "منفذ المغادرة",           // Q

      // =================================================
      // النقل الداخلي
      // =================================================

      "شركة النقل الداخلي",      // R
      "رقم التشغيلة",            // S
      "عدد الباصات",             // T
      "اتجاه الإقامة",           // U

      // =================================================
      // المدينة
      // =================================================

      "عدد ليالي المدينة",       // V
      "عدد ليالي مكة",           // W

      "سكن المدينة",             // X
      "دخول المدينة",            // Y
      "خروج المدينة",            // Z

      // =================================================
      // مكة
      // =================================================

      "سكن مكة",                 // AA
      "دخول مكة",                // AB
      "خروج مكة",                // AC

      // =================================================
      // التحركات الإضافية
      // =================================================

      "extraMovements",          // AD

      // =================================================
      // ملاحظات
      // =================================================

      "ملاحظات الإشعار",         // AE

      // =================================================
      // المرفقات
      // =================================================

      "رابط تذكرة الطيران",      // AF

      // =================================================
      // امتدادات (تُقرأ/تُكتَب بالاسم عبر BOOKINGS_HEADERS_)
      // =================================================

      "معرّف ملف التذكرة",       // AG
      "سعر الباص",               // AH
      "قيمة التشغيلة",           // AI
      "اسم الرحلة"               // AJ
    ];

    // =====================================================
    // إنشاء رؤوس الأعمدة
    // =====================================================

    bookSheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);

    // =====================================================
    // تنسيق الهيدر
    // =====================================================

    bookSheet
      .getRange(1, 1, 1, headers.length)
      .setBackground("#1e3d59")
      .setFontColor("white")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    // =====================================================
    // تثبيت الصف الأول
    // =====================================================

    bookSheet.setFrozenRows(1);

    // =====================================================
    // ضبط عرض الأعمدة
    // =====================================================

    var widths = {

      1: 120,
      2: 100,
      3: 180,
      4: 180,
      5: 180,
      6: 180,
      7: 80,
      8: 150,
      9: 120,

      10: 150,
      11: 120,
      12: 90,
      13: 120,

      14: 120,
      15: 120,
      16: 90,
      17: 150,

      18: 180,
      19: 120,
      20: 100,
      21: 120,

      22: 120,
      23: 120,

      24: 180,
      25: 120,
      26: 120,

      27: 180,
      28: 120,
      29: 120,

      30: 400,

      31: 250,

      32: 300
    };

    for (var col in widths) {

      bookSheet.setColumnWidth(
        parseInt(col),
        widths[col]
      );
    }

    // =====================================================
    // محاذاة البيانات
    // =====================================================

    bookSheet
      .getRange(1, 1, 1, headers.length)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
  }

  // =====================================================
  // تجهيز شيت الإعدادات
  // =====================================================

  var settingsSheet = ss.getSheetByName("Agents_Settings");

  if (settingsSheet.getLastRow() === 0) {

    settingsSheet.appendRow([
      "اسم الوكيل السعودي",
      "الشركات المصرية المرتبطة"
    ]);

    settingsSheet
      .getRange(1,1,1,2)
      .setBackground("#1e3d59")
      .setFontColor("white")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");

    settingsSheet.setColumnWidth(1, 250);
    settingsSheet.setColumnWidth(2, 450);

    settingsSheet.setFrozenRows(1);
  }

  SpreadsheetApp.flush();

  // ===== شيت سجل التعديلات (AuditLog) =====
  // يُنشأ هنا تلقائياً ولو كان موجوداً بالفعل لن يُمس (ensureAuditLogSheet_ آمنة)
  ensureAuditLogSheet_();

  // ===== شيت التحركات الموحّد (Movements) =====
  // كان يُستخدَم بلا إنشاء تلقائي (القراءة/الكتابة محميّتان بفحص وجود الشيت) — ننشئه هنا
  // ليعمل تتبّع التحركات فعلياً. آمن للتشغيل المتكرر (لا يُمَس إن كان موجوداً).
  ensureMovementsSheet_();

  // ===== شيتا الرحلات والمعتمرين (Trips/Pilgrims) + المستخدمين وحساب admin (Users) =====
  // setupSmartSystem هي الدالة الوحيدة المرئية والقابلة للتشغيل مباشرة من محرر Apps Script
  // (أي دالة تنتهي بـ "_" مثل setupCompleteSystem_/setupTripsSystem_ لا تظهر في قائمة "تشغيل" هناك) —
  // فتوحيداً لكل إنشاء الأوراق داخل "دالة التأسيس" الوحيدة التي يستطيع أي شخص إيجادها وتشغيلها،
  // نستدعي هنا كل الدوال المتبقية أيضاً (كلها idempotent ولا تمسّ شيتاً أو صفاً موجوداً بالفعل).
  try { setupTripsSystem_(); } catch (eTrips) { Logger.log('setupSmartSystem: setupTripsSystem_ failed: ' + eTrips); }
  try { setupUsersSystem(); } catch (eUsers) { Logger.log('setupSmartSystem: setupUsersSystem failed: ' + eUsers); }

  // ⚡ (V4.53) ترحيل شامل بطلب صريح — بلا فقدان بيانات:
  // (1) توسيع أعمدة Bookings إذا كان الشيت القديم يفتقد أعمدة أُضيفت بإصدارات لاحقة (مثل «مقاطع نقل إضافية»)
  // (2) توسيع أعمدة Pilgrims (مثل عمودَي «مستبعد من تسكين المدينة/مكة»)
  // (3) إنشاء كل شيتات حسابات العملاء لو غير موجودة (Items/Payments/Meta/TripPrices/ClientPrices/MergeGroups)
  // كلها idempotent (تعمل مراراً بلا أي أثر جانبي على البيانات القائمة)
  try {
    var _accMig = [];
    var _bkS = ss.getSheetByName("Bookings");
    if (_bkS) {
      var _bkHeaders = _bkS.getLastColumn() ? _bkS.getRange(1, 1, 1, _bkS.getLastColumn()).getValues()[0] : [];
      var _bkMissing = BOOKINGS_HEADERS_.filter(function(h) { return _bkHeaders.indexOf(h) === -1; });
      if (_bkMissing.length) {
        var _bkMax = _bkS.getMaxColumns();
        if (_bkMax < _bkHeaders.length + _bkMissing.length) {
          _bkS.insertColumnsAfter(_bkMax, _bkHeaders.length + _bkMissing.length - _bkMax);
        }
        _bkS.getRange(1, _bkHeaders.length + 1, 1, _bkMissing.length).setValues([_bkMissing])
          .setBackground("#1e3d59").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
        _accMig.push("أعمدة جديدة في Bookings: " + _bkMissing.join('، '));
      }
    }
    // Pilgrims — يستخدم نفس منطق ترحيل TRIPS_HEADERS_
    var _pS = ss.getSheetByName(PILGRIMS_SHEET_NAME_);
    if (_pS) {
      var _pHeaders = _pS.getLastColumn() ? _pS.getRange(1, 1, 1, _pS.getLastColumn()).getValues()[0] : [];
      var _pMissing = PILGRIMS_HEADERS_.filter(function(h) { return _pHeaders.indexOf(h) === -1; });
      if (_pMissing.length) {
        var _pMax = _pS.getMaxColumns();
        if (_pMax < _pHeaders.length + _pMissing.length) {
          _pS.insertColumnsAfter(_pMax, _pHeaders.length + _pMissing.length - _pMax);
        }
        _pS.getRange(1, _pHeaders.length + 1, 1, _pMissing.length).setValues([_pMissing])
          .setBackground("#065f46").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
        _accMig.push("أعمدة جديدة في " + PILGRIMS_SHEET_NAME_ + ": " + _pMissing.join('، '));
      }
    }
    // شيتات الحسابات — إنشاء أي شيت مفقود بترويسته الرسمية (idempotent)
    var _accSheets = [
      [ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS],
      [ACC_PAY_SHEET, ACC_PAY_HEADERS],
      [ACC_META_SHEET, ACC_META_HEADERS],
      [ACC_TRIP_PRICES_SHEET, ACC_TRIP_PRICES_HEADERS],
      [ACC_CLIENT_PRICES_SHEET, ACC_CLIENT_PRICES_HEADERS],
      [ACC_MERGE_SHEET, ACC_MERGE_HEADERS],
      [CATERING_SHEET, CATERING_HEADERS], // 📑 (V4.54) بيان اتفاقيات الإعاشة
      [MF_SHEET, MF_HEADERS],             // 🏛️ (V4.106) ملفات مراجعة الوزارة
      [MF_SUP_SHEET, MF_SUP_HEADERS],     // 🏛️ (V4.106) سجل المشرفين
      [MF_REC_SHEET, MF_REC_HEADERS]      // 🏛️ (V4.106) إيصالات رسوم الغرفة
    ];
    _accSheets.forEach(function(pair) {
      var _existed = !!ss.getSheetByName(pair[0]);
      _accSheet_(pair[0], pair[1]); // ينشئه أو يوسّع أعمدته الناقصة
      if (!_existed) _accMig.push('شيت حسابات: ' + pair[0]);
    });
    if (_accMig.length) Logger.log('setupSmartSystem migrations: ' + _accMig.join(' — '));
  } catch (eMig) { Logger.log('setupSmartSystem: ترحيل الأعمدة/شيتات الحسابات فشل: ' + eMig); }

  return "✅ تم تهيئة النظام بالكامل بنجاح (بما فيها الرحلات/المعتمرون/المستخدمون + ترحيل أعمدة الشيتات القديمة + كل شيتات الحسابات)";
}

// إنشاء شيت التحركات الموحّد بالرؤوس الصحيحة إن لم يكن موجوداً (idempotent — لا يمسّ شيتاً قائماً)
function ensureMovementsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Movements");
  if (sheet) return sheet;
  sheet = ss.insertSheet("Movements");
  var headers = ["الحالة", "رقم الإشعار", "التاريخ", "الوقت", "نوع التحرك",
    "الوكيل", "الشركة المصرية", "العميل", "العدد", "المشرف", "عدد الباصات"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#1e3d59").setFontColor("#ffffff").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  return sheet;
}



function createSheetIfNotExist(ss, name) {

  var sheet = ss.getSheetByName(name);

  if (!sheet) {

    ss.insertSheet(name);
  }
}


function getEntryAppUrl() {
  var url = ScriptApp.getService().getUrl();
  if(!url) {
    SpreadsheetApp.getUi().alert("⚠️ برجاء نشر البرمجية أولاً كتطبيق ويب (Web App) للحصول على الرابط المباشر.");
    return;
  }
  var html = HtmlService.createHtmlOutput('<script>window.open("' + url + '", "_blank");google.script.host.close();</script>').setWidth(300).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, "🚀 جاري فتح النظام...");
}



// دالة تحليل التذكرة الذكية
function uploadAndAnalyzeTicket(authToken, base64Data,  fileName,  tempOldFileId) {
  requireAuth_(authToken);
  return _analyzeTicketCore_(base64Data, fileName, tempOldFileId);
}

// 🧠 نواة تحليل التذكرة (بدون توثيق) — تُستخدم من الواجهة (عبر الغلاف أعلاه) ومن بوت تليجرام مباشرة
function _analyzeTicketCore_(base64Data, fileName, tempOldFileId) {

  try {

// ===============================
// TEMP FOLDER
// ===============================

var folder;
try {
  folder = getDriveFolder_('TEMP');  // مجلد مؤقت موحّد للتذاكر والملفات المؤقتة
} catch(err) {
  return {
    success: false,
    error: "فشل الوصول إلى Google Drive. يرجى إعادة منح صلاحيات الدرايف للتطبيق."
  };
}

    // ===============================
    // تحويل الملف
    // ===============================
    var contentType =
      base64Data.substring(
        base64Data.indexOf(":") + 1,
        base64Data.indexOf(";")
      );

    var rawBase64 =
      base64Data.substring(
        base64Data.indexOf(",") + 1
      );

    var blob = Utilities.newBlob(
      Utilities.base64Decode(rawBase64),
      contentType,
      fileName
    );


// ===============================
// حفظ الملف المؤقت
// ===============================

var tempName =

  'TEMP_' +

  new Date().getTime() +

  '_' +

  fileName;

var file = folder.createFile(blob);

file.setName(tempName);

file.setSharing(
  DriveApp.Access.ANYONE_WITH_LINK,
  DriveApp.Permission.VIEW
);

var fileUrl = file.getUrl();

    // ===============================
    // التحقق من المفتاح
    // ===============================
    var TKEYS = _geminiKeys_();
    if (!TKEYS.length) {

      return {

        success: true,

        fileUrl: fileUrl,

        fileId: file.getId(),

        aiData: null,

        warning:
          "تم حفظ الملف بالدرايف، يرجى ضبط مفتاح Gemini API لاستخراج البيانات تلقائياً."
      };
    }

    // ===============================
    // البرومبت
    // ===============================
    var prompt =

      "You are an airline ticket parser for Umrah travel systems. " +

      "Analyze this airline ticket carefully. " +

      "Extract ONLY the flight arriving into Saudi Arabia and the flight departing from Saudi Arabia. " +

      "The ARRIVAL fields must represent the passenger ARRIVAL INTO SAUDI ARABIA only. " +

      "This means the international flight coming FROM Egypt or another country TO Saudi Arabia. " +

      "The DEPARTURE fields must represent the passenger FINAL DEPARTURE FROM SAUDI ARABIA only. " +

      "This means the return international flight leaving Saudi Arabia TO Egypt or another country. " +

      "Ignore domestic transit flights unless they are the only Saudi flights available. " +

      "If multiple flights exist: " +

      "- ARRIVAL = first international entry into Saudi Arabia. " +

      "- DEPARTURE = final international exit from Saudi Arabia. " +

      "All dates MUST be returned in DD/MM/YYYY format only. " +

      "For example: 13/02/2026 or 06/10/2025. " +

      "Never return month names like Feb or October. " +

      "Never return short years like 26. " +

      "All times MUST be returned in HH:MM format only. " +

      "arrivalPort must contain ONLY the Saudi arrival airport or city name in Arabic. " +

      "arrivalOrigin must contain ONLY the departure airport or city name (the origin, e.g. Cairo) in Arabic for the arrival flight. " +

      "departurePort must contain ONLY the Saudi departure airport or city name in Arabic. " +

      "departureDestination must contain ONLY the final destination airport or city name (e.g. Cairo) in Arabic for the departure flight. " +

      "Convert airport codes to Arabic airport names. " +

      "For example: " +

      "MED = مطار المدينة المنورة, " +

      "JED = مطار جدة, " +

      "RUH = مطار الرياض, " +

      "TIF = مطار الطائف, " +

      "CAI = مطار القاهرة, " +

      "DXB = مطار دبي, " +

      "IST = مطار إسطنبول, " +

      "KWI = مطار الكويت, " +

      "DOH = مطار الدوحة, " +

      "SHJ = مطار الشارقة, " +

      "AUH = مطار أبوظبي. " +

      "Respond ONLY with pure valid JSON. " +

      "Do not include markdown, explanations, comments, or backticks. " +

      "Use these exact fields only: " +

      "{ " +

      "\"arrivalDate\":\"\", " +

      "\"arrivalTime\":\"\", " +

      "\"arrivalFlight\":\"\", " +

      "\"arrivalPort\":\"\", " +

      "\"arrivalOrigin\":\"\", " +

      "\"departureDate\":\"\", " +

      "\"departureTime\":\"\", " +

      "\"departureFlight\":\"\", " +

      "\"departurePort\":\"\", " +

      "\"departureDestination\":\"\" " +

      "}";

    // ===============================
    // رابط Gemini
    // ===============================
    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + TKEYS[0];

    // ===============================
    // البيانات المرسلة
    // ⚡ (V4.72) thinkingBudget:0 — gemini-2.5-flash يُفعِّل "تفكيراً" داخلياً افتراضياً حتى لمهام
    // استخراج بسيطة (لاحظنا 882 thoughtsTokenCount برد فعلي)، وهو السبب الرئيسي وراء بطء ~28 ثانية
    // للتذكرة الواحدة. تعطيله يختصر الوقت لثوانٍ معدودة دون التأثير على جودة الاستخراج (مهمة تصنيف
    // نصية مباشرة لا تحتاج تفكيراً متسلسلاً أصلاً)
    // ===============================
    var payload = {

      contents: [
        {
          parts: [

            {
              text: prompt
            },

            {
              inlineData: {
                mimeType: contentType,
                data: rawBase64
              }
            }
          ]
        }
      ],

      generationConfig: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    // ===============================
    // خيارات الطلب
    // ===============================
    var options = {

      method: "post",

      contentType: "application/json",

      payload: JSON.stringify(payload),

      muteHttpExceptions: true
    };

    // ===============================
    // إرسال الطلب
    // ===============================
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 429 && TKEYS.length > 1) {
      url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + TKEYS[1];
      response = UrlFetchApp.fetch(url, options);
    }

    var jsonRes =
      JSON.parse(response.getContentText());

    Logger.log("GEMINI RESPONSE:");
    Logger.log(JSON.stringify(jsonRes));

    // ===============================
    // فحص الاستجابة
    // ===============================
    if (
      !jsonRes.candidates ||
      jsonRes.candidates.length === 0 ||
      !jsonRes.candidates[0].content
    ) {

      return {

        success: true,

        fileUrl: fileUrl,

        fileId: file.getId(),

        aiData: null,

        warning:
          "استجاب خادم الذكاء الاصطناعي بشكل غير متوقع، ولكن تم حفظ التذكرة في الدرايف."
      };
    }

    // ===============================
    // استخراج النص
    // ===============================
    var aiText =
      jsonRes.candidates[0]
        .content.parts[0].text;

    // ===============================
    // تنظيف الرد
    // ===============================
    aiText = aiText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    Logger.log("AI TEXT:");
    Logger.log(aiText);

    // ===============================
    // تحويل JSON
    // ===============================
    var parsedAiData =
      JSON.parse(aiText);

    // ===============================
    // نجاح
    // ===============================
return {

  success: true,

  fileUrl: fileUrl,

  fileId: file.getId(),

  aiData: parsedAiData
};


  } catch (err) {

    Logger.log("ERROR:");
    Logger.log(err);

return {

  success: false,

  error: err.toString()

};


  }
}


/* ============================================================
   🔍 تحليل التذكرة يدوياً بدون ذكاء اصطناعي (Fallback Parser)
   يُستخدم عند تعذر استخدام Gemini — يعمل بنفس الكفاءة تقريباً
   
   المنهجية:
   1. يرفع الملف لـ Drive مؤقتاً (نفس طريقة الـ AI)
   2. يستخرج النص من الملف عبر OCR (يدعم PDF والصور)
   3. يُحلّل النص بأنماط Regex متعددة تغطي:
      - صيغة GDS/Amadeus: SM 489 14AUG ATZMED 0345 0530
      - صيغة E-ticket: FLIGHT SV 388 MON 11 MAY 2026 / DEPARTURE: CAIRO...
      - صيغة IATA: SV/ETKT 065...
   4. يُرجع نفس الشكل {success, fileUrl, fileId, aiData}
   ============================================================ */

function uploadAndParseTicketManual(authToken, base64Data, fileName, tempOldFileId) {
  requireAuth_(authToken);

  try {

    // ===== رفع الملف مؤقتاً (نفس منطق uploadAndAnalyzeTicket بالظبط) =====
    var folder;
    try { folder = getDriveFolder_('TEMP'); }
    catch(err) { return { success: false, error: "فشل الوصول إلى Google Drive." }; }

    var contentType = base64Data.substring(base64Data.indexOf(":") + 1, base64Data.indexOf(";"));
    var rawBase64 = base64Data.substring(base64Data.indexOf(",") + 1);
    var blob = Utilities.newBlob(Utilities.base64Decode(rawBase64), contentType, fileName);

    // حذف الملف المؤقت القديم لو موجود
    if (tempOldFileId) {
      try { DriveApp.getFileById(tempOldFileId).setTrashed(true); } catch(e) {}
    }

    var tempName = 'TEMP_' + new Date().getTime() + '_' + fileName;
    var file = folder.createFile(blob);
    file.setName(tempName);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileUrl = file.getUrl();
    var fileId = file.getId();

    // ===== استخراج النص من الملف عبر OCR (Drive API V2 Advanced Service) =====
    var extractedText = '';
    var ocrDocId = null;   // نحتفظ بـ ID الـ Doc المؤقت حتى نضمن حذفه في كل الحالات

    try {
      if (contentType === 'application/pdf' || contentType.indexOf('image/') === 0) {

        var ocrBlob = Utilities.newBlob(Utilities.base64Decode(rawBase64), contentType, 'ocr_input');

        // محاولة OCR مع إعادة المحاولة مرة واحدة عند تجاوز الـ Rate Limit
        var ocrFile = null;
        var ocrAttempts = 0;
        while (ocrAttempts < 2) {
          try {
            ocrFile = Drive.Files.insert(
              { title: 'OCR_TEMP_' + Date.now() },
              ocrBlob,
              { convert: true, ocr: true, ocrLanguage: 'en' }
            );
            break; // نجح
          } catch(retryErr) {
            ocrAttempts++;
            if (retryErr.message && retryErr.message.indexOf('rate limit') !== -1 && ocrAttempts < 2) {
              Logger.log('OCR rate limit hit — waiting 5s before retry...');
              Utilities.sleep(5000);
            } else {
              throw retryErr; // خطأ آخر أو تجاوزنا عدد المحاولات
            }
          }
        }

        if (ocrFile) {
          ocrDocId = ocrFile.id;
          Utilities.sleep(1500); // انتظار لاكتمال التحويل
          var doc = DocumentApp.openById(ocrDocId);
          extractedText = doc.getBody().getText();
          DriveApp.getFileById(ocrDocId).setTrashed(true);
          ocrDocId = null; // تم الحذف
        }

      } else {
        extractedText = blob.getDataAsString() || '';
      }
    } catch(ocrErr) {
      Logger.log('OCR failed: ' + ocrErr.message);
      // حذف الـ Doc المؤقت لو لم يُحذف بعد
      if (ocrDocId) { try { DriveApp.getFileById(ocrDocId).setTrashed(true); } catch(e) {} }
      // حذف الملف المؤقت من TEMP عند الفشل الكلي
      if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {} }

      var errMsg = ocrErr.message || '';
      var userMsg = errMsg.indexOf('rate limit') !== -1
        ? "❌ تجاوزت حد OCR في Drive — جرّب مرة ثانية بعد دقيقة، أو استخدم زر 'رفع + AI' بدلاً منه."
        : "❌ تعذر استخراج النص.\nالخطأ: " + errMsg;

      return { success: false, error: userMsg };
    }

    Logger.log('OCR TEXT LENGTH: ' + extractedText.length);
    Logger.log('OCR TEXT (first 1000): ' + extractedText.substring(0, 1000));

    if (!extractedText || extractedText.trim().length < 10) {
      // النص فارغ — نمسح الملف المؤقت ونطلب من المستخدم الإدخال اليدوي
      if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {} }
      return {
        success: false,
        error: "⚠️ لم يُعثر على نص قابل للقراءة في التذكرة.\nربما الصورة غير واضحة أو التذكرة ممسوحة ضوئياً بجودة منخفضة.\nجرّب زر 'رفع + AI' أو أدخل البيانات يدوياً."
      };
    }

    // ===== تحليل النص المستخرج =====
    var parsedData = parseTicketText_(extractedText);

    if (!parsedData) {
      // فشل التحليل — نمسح الملف المؤقت
      if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {} }
      return {
        success: false,
        error: "⚠️ تم استخراج النص لكن لم يتم التعرف على أرقام رحلات داخله.\nجرّب زر 'رفع + AI' أو أدخل البيانات يدوياً."
      };
    }

    return {
      success: true,
      fileUrl: fileUrl,
      fileId: fileId,
      aiData: parsedData
    };

  } catch(err) {
    Logger.log('uploadAndParseTicketManual ERROR: ' + err);
    return { success: false, error: err.toString() };
  }
}


/**
 * محلل نصوص التذاكر — يدعم صيغ متعددة ويُرجع نفس هيكل aiData
 * @param {string} text — النص المستخرج من OCR أو المنسوخ يدوياً
 * @returns {Object|null} — {arrivalDate, arrivalTime, arrivalFlight, arrivalPort, departureDate, ...} أو null
 */
function parseTicketText_(text) {
  if (!text) return null;

  // تنظيف النص
  var raw = text.replace(/\r/g, ' ').replace(/\t/g, ' ');
  var oneLine = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // ===== قواميس المطارات =====
  var airports = {
    MED: "مطار المدينة المنورة", JED: "مطار جدة", RUH: "مطار الرياض",
    TIF: "مطار الطائف", CAI: "مطار القاهرة", DXB: "مطار دبي",
    IST: "مطار إسطنبول", KWI: "مطار الكويت", DOH: "مطار الدوحة",
    SHJ: "مطار الشارقة", AUH: "مطار أبوظبي", ATZ: "مطار أسيوط",
    AHB: "مطار أبها", ELQ: "مطار القصيم", DMM: "مطار الدمام",
    SSH: "مطار شرم الشيخ", HRG: "مطار الغردقة", ASW: "مطار أسوان",
    LXR: "مطار الأقصر", HBE: "مطار برج العرب", SPX: "مطار سفنكس"
  };

  var saudiCodes = ['JED','MED','RUH','TIF','AHB','ELQ','DMM','YNB','GIZ','TUU','ABT','HOF'];

  var months = {JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};

  // ===== محاولة استخراج السنة من النص (يدعم "06Aug2025" بدون مسافة أو حدود كلمة) =====
  var yearMatch = oneLine.match(/(20\d{2})/);
  var currentYr = new Date().getFullYear();
  var detectedYear = yearMatch ? parseInt(yearMatch[1]) : currentYr;
  // حماية: لو السنة المستخرجة غير منطقية (قديمة جداً أو بعيدة جداً في المستقبل) نستخدم السنة الحالية
  if (detectedYear < currentYr - 2 || detectedYear > currentYr + 3) detectedYear = currentYr;

  // ===== تحويل التاريخ (يدعم صيغ متعددة) =====
  function toDate(str) {
    if (!str) return '';
    str = str.trim();

    // قائمة الكلمات الشائعة التي تُشبه أسماء الأشهر لكنها ليست أشهراً
    var nonMonths = ['DEP','ARR','OAT','ETA','ETD','GDS','ITA','GMT','UTC','STA','STD','ATA','ATD','PNR','REF','SEG','PAX','HRS'];

    // صيغة: 11 MAY 2026 أو 11MAY أو 11MAY26
    var m = str.match(/(\d{1,2})\s*([A-Z]{3})\s*(\d{2,4})?/i);
    if (m) {
      var code = m[2].toUpperCase();
      // تجاهل الكلمات غير الشهرية
      if (nonMonths.indexOf(code) !== -1) return '';
      var mon = months[code];
      if (mon === undefined) return ''; // كود غير معروف → نتجاهله بدل إرجاع النص الخام
      var d = parseInt(m[1]);
      if (d < 1 || d > 31) return '';  // رقم يوم غير منطقي
      var yr = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : detectedYear;
      if (!m[3] && mon < new Date().getMonth() - 1) yr++;
      if (yr < new Date().getFullYear() - 2 || yr > new Date().getFullYear() + 3) yr = detectedYear; // حماية أخيرة
      return String(d).padStart(2,'0') + '/' + String(mon+1).padStart(2,'0') + '/' + yr;
    }

    // صيغة: 27/06/2026 أو 27-06-2026
    var m2 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m2) {
      var d2 = parseInt(m2[1]), mon2 = parseInt(m2[2]);
      if (d2 < 1 || d2 > 31 || mon2 < 1 || mon2 > 12) return '';
      var yr2 = m2[3].length === 2 ? 2000 + parseInt(m2[3]) : parseInt(m2[3]);
      return String(d2).padStart(2,'0') + '/' + String(mon2).padStart(2,'0') + '/' + yr2;
    }

    // صيغة: 27 JUN 2026 (مع مسافات)
    var m3 = str.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/i);
    if (m3) {
      var mon3 = months[m3[2].toUpperCase()];
      var d3 = parseInt(m3[1]);
      var yr3 = parseInt(m3[3]);
      return String(d3).padStart(2,'0') + '/' + String(mon3+1).padStart(2,'0') + '/' + yr3;
    }

    return ''; // لا نرجع النص الخام أبداً — أفضل حقل فارغ من بيانات خاطئة
  }

  function toTime(str) {
    if (!str) return '';
    str = str.toString().replace(/[^0-9:]/g, '');
    // 0135 → 01:35
    if (str.length === 4 && str.indexOf(':') === -1) return str.substring(0,2) + ':' + str.substring(2);
    // 01:35 → as is
    if (str.match(/^\d{2}:\d{2}$/)) return str;
    return str;
  }

  // ===== نمط 1: GDS/Amadeus — SM 489 14AUG ATZMED 0345 0530 =====
  var flights = [];

  var gdsPattern = /([A-Z0-9]{2})\s+(\d{1,4}).*?(\d{1,2}[A-Z]{3}).*?([A-Z]{3})([A-Z]{3}).*?(\d{4})\s+(\d{4})/gi;
  var gm;
  while ((gm = gdsPattern.exec(oneLine)) !== null) {
    flights.push({
      airline: gm[1], flightNum: gm[2], date: gm[3],
      from: gm[4], to: gm[5], depTime: gm[6], arrTime: gm[7], source: 'GDS'
    });
  }

  // ===== نمط 2: E-ticket readable — FLIGHT SV 388 ... DEPARTURE: CAIRO ... ARRIVAL: JEDDAH =====
  if (flights.length === 0) {
    // نمط الرحلة: FLIGHT SV 388 - SAUDI ARABIAN AIRLINES MON 11 MAY 2026
    var flightBlocks = raw.split(/FLIGHT\s+/i);
    for (var fb = 1; fb < flightBlocks.length; fb++) {
      var block = flightBlocks[fb];
      var blockOneLine = block.replace(/\n/g, ' ').replace(/\s+/g, ' ');

      // رقم الرحلة
      var fnMatch = blockOneLine.match(/^([A-Z0-9]{2})\s+(\d{1,4})/i);
      if (!fnMatch) continue;

      // التاريخ (أكتر من صيغة)
      var dateMatch = blockOneLine.match(/(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2}\s+[A-Z]{3}\s+\d{4})/i)
                   || blockOneLine.match(/(\d{1,2}\s+[A-Z]{3}\s+\d{4})/i)
                   || blockOneLine.match(/(\d{1,2}[A-Z]{3}\d{0,4})/i);
      var flightDate = dateMatch ? dateMatch[1] : '';

      // المغادرة
      var depMatch = blockOneLine.match(/DEPARTURE:\s*([^,]+(?:,\s*[^,]+)?)\s*(?:,\s*TERMINAL\s*\d+)?\s+(\d{1,2}\s+[A-Z]{3})\s+(\d{2}:\d{2})/i);
      // الوصول
      var arrMatch = blockOneLine.match(/ARRIVAL:\s*([^,]+(?:,\s*[^,]+)?)\s*(?:,\s*TERMINAL\s*\d+)?\s+(\d{1,2}\s+[A-Z]{3})\s+(\d{2}:\d{2})/i);

      if (depMatch && arrMatch) {
        // استخراج أكواد المطارات من النص
        var depPort = extractAirportCode_(depMatch[1], airports);
        var arrPort = extractAirportCode_(arrMatch[1], airports);

        flights.push({
          airline: fnMatch[1], flightNum: fnMatch[2], date: flightDate || depMatch[2],
          from: depPort, to: arrPort, depTime: depMatch[3], arrTime: arrMatch[3], source: 'ETICKET'
        });
      }
    }
  }

  // ===== نمط 2ب: جدول "Date Flight From ... Depart To ... Arrive" (مثل Alexandria Airlines) =====
  // مبني على "مراسي" (anchors) منفصلة بدل regex واحدة ضخمة، حتى يتحمّل اختلافات تباعد OCR الحقيقي
  // (خصوصاً في التذاكر المجمّعة متعددة الصفحات حيث تختلف فواصل الأسطر كثيراً عن نص مُدخَل يدوياً)
  if (flights.length === 0) {
    // مرحلة 1: إيجاد كل "تاريخ + رمز رحلة" كمراسي موثوقة (نمط بسيط جداً بلا مسافات معقدة بينهما)
    var anchorPattern = /(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})\s+([A-Z]{2}\s?\d{3,4})/g;
    var tableAnchors = [];
    var tam;
    while ((tam = anchorPattern.exec(oneLine)) !== null) {
      tableAnchors.push({
        date: tam[1],
        flightCode: tam[2].replace(/\s+/g, ''),
        pos: tam.index,
        endPos: tam.index + tam[0].length
      });
    }

    // مرحلة 2: لكل مرساة، افحص نافذة نصية بعدها (حتى المرساة التالية أو +250 حرف) لاستخراج
    // وقتيّ المغادرة/الوصول (أول وثاني HH:MM) والمدينتين المحيطتين بهما
    tableAnchors.forEach(function(anchor, idx) {
      var windowEnd = (idx + 1 < tableAnchors.length)
        ? tableAnchors[idx + 1].pos
        : Math.min(oneLine.length, anchor.endPos + 250);
      var windowText = oneLine.substring(anchor.endPos, windowEnd);

      var timesInWindow = windowText.match(/\d{2}:\d{2}/g);
      if (!timesInWindow || timesInWindow.length < 2) return; // لازم وقتين على الأقل لاعتبارها رحلة كاملة

      var depTime = timesInWindow[0];
      var arrTime = timesInWindow[1];

      // المدينة الأولى: النص قبل أول وقت. المدينة الثانية: النص بين أول وقت وثاني وقت
      var firstTimePos = windowText.indexOf(depTime);
      var secondTimePos = windowText.indexOf(arrTime, firstTimePos + depTime.length);

      var fromSeg = windowText.substring(0, firstTimePos);
      var toSeg = windowText.substring(firstTimePos + depTime.length, secondTimePos);

      var fromCode = extractAirportCode_(fromSeg, airports) || fromSeg.trim().substring(0, 30);
      var toCode = extractAirportCode_(toSeg, airports) || toSeg.trim().substring(0, 30);

      var flightNumMatch = anchor.flightCode.match(/\d+$/);
      if (!flightNumMatch) return;

      flights.push({
        airline: anchor.flightCode.replace(/\d+$/, ''),
        flightNum: flightNumMatch[0],
        date: anchor.date,
        from: fromCode, to: toCode,
        depTime: depTime, arrTime: arrTime,
        source: 'TABLE'
      });
    });
  }

  // ===== نمط 2ج: إيصال إلكتروني "FROMCITY ... TOCITY ... FLIGHT depTime date(day) arrTime date(day)" (مثل EgyptAir) =====
  if (flights.length === 0) {
    var receiptAnchor = /([A-Z]{2}\d{3,4})\s+(\d{2}:\d{2})\s+(\d{1,2}[A-Za-z]{3})\(\w+\)\s+(\d{2}:\d{2})\s+(\d{1,2}[A-Za-z]{3})\(\w+\)/g;
    var anchors = [];
    var am;
    while ((am = receiptAnchor.exec(oneLine)) !== null) {
      anchors.push({
        airline: am[1].replace(/\d+$/, ''), flightNum: am[1].match(/\d+$/)[0],
        depTime: am[2], depDate: am[3], arrTime: am[4], arrDate: am[5], pos: am.index
      });
    }
    var cityNames = ['CAIRO','JEDDAH','JEDDA','MEDINA','MADINAH','RIYADH','DUBAI','ABHA','TAIF','KING ABDULAZIZ','MOHAMMAD BIN ABDULAZIZ','MOHAMMED BIN ABDULAZIZ'];
    var cityRx = new RegExp('(' + cityNames.map(function(k){return k.replace(/\s+/g,'\\s+');}).join('|') + ')', 'gi');
    anchors.forEach(function(anchor, idx) {
      var segStart = idx === 0 ? Math.max(0, anchor.pos - 150) : anchors[idx-1].pos;
      var vicinity = oneLine.substring(segStart, anchor.pos);
      var tokens = [];
      var tm2;
      cityRx.lastIndex = 0;
      while ((tm2 = cityRx.exec(vicinity)) !== null) tokens.push(tm2[1].toUpperCase().replace(/\s+/g, ' '));
      var deduped = [];
      tokens.forEach(function(t) { if (deduped.length === 0 || deduped[deduped.length-1] !== t) deduped.push(t); });

      var fromCity = deduped[0] || '';
      var toCity = deduped[deduped.length - 1] || '';
      flights.push({
        airline: anchor.airline, flightNum: anchor.flightNum, date: anchor.depDate,
        from: extractAirportCode_(fromCity, airports) || fromCity,
        to: extractAirportCode_(toCity, airports) || toCity,
        depTime: anchor.depTime, arrTime: anchor.arrTime, source: 'RECEIPT'
      });
    });
  }

  // ===== نمط 2د: "From: CITY ... Departure TIME FLIGHT ... To: CITY ... Arrive TIME" (مثل Almasria) =====
  if (flights.length === 0) {
    var blocks = raw.split(/(?=DEPARTING\s*:|RETURNING\s*:)/i);
    blocks.forEach(function(block) {
      var blockOneLine = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      var fromToPattern = /From:\s*([A-Za-z][A-Za-z0-9\s\.]*?)\s*Departure\s+(\d{2}:\d{2})\s+([A-Z]{1,2}\s?\d{3,4}).*?To:\s*([A-Za-z][A-Za-z0-9\s\.]*?)\s*Arrive\s+(\d{2}:\d{2})/i;
      var fm = blockOneLine.match(fromToPattern);
      if (!fm) return;

      var dateMatch = blockOneLine.match(/Date\s+(?:\w+\s+)?(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})/i);
      var flightCode = fm[3].replace(/\s+/g, '');
      flights.push({
        airline: flightCode.replace(/\d+$/, ''), flightNum: flightCode.match(/\d+$/)[0],
        date: dateMatch ? dateMatch[1] : '',
        from: extractAirportCode_(fm[1].trim(), airports) || fm[1].trim(),
        to: extractAirportCode_(fm[4].trim(), airports) || fm[4].trim(),
        depTime: fm[2], arrTime: fm[5], source: 'FROMTO'
      });
    });
  }

  // ===== نمط 3: SV 388 + تواريخ/أوقات مبعثرة حوله =====
  if (flights.length === 0) {
    // البحث عن أرقام رحلات (SV 388, MS 641, XY 234...)
    var simpleFlightPattern = /\b([A-Z]{2})\s*[-]?\s*(\d{3,4})\b/gi;
    var sfm;
    var foundFlights = [];
    while ((sfm = simpleFlightPattern.exec(oneLine)) !== null) {
      // تأكد إنه مش رقم تذكرة أو حاجة تانية
      if (['SV','MS','XY','F3','SM','NE','NP','J9','FZ','G9','RJ','EK','QR','KU','WY','GF','TK'].indexOf(sfm[1].toUpperCase()) !== -1) {
        foundFlights.push({ airline: sfm[1].toUpperCase(), flightNum: sfm[2], pos: sfm.index });
      }
    }

    // لكل رحلة، حاول إيجاد تاريخ ووقت قريب منها في النص
    foundFlights.forEach(function(ff) {
      var vicinity = oneLine.substring(Math.max(0, ff.pos - 100), Math.min(oneLine.length, ff.pos + 200));

      var nearDate = vicinity.match(/(\d{1,2})\s*([A-Z]{3})\s*(\d{2,4})?/i)
                  || vicinity.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      var nearTimes = vicinity.match(/(\d{2}:\d{2})/g) || vicinity.match(/\b(\d{4})\b/g) || [];

      // البحث عن أكواد مطارات قريبة
      var nearPorts = vicinity.match(/\b([A-Z]{3})\b/g) || [];
      var validPorts = nearPorts.filter(function(p) { return airports[p]; });

      var depPort = '', arrPort = '';
      for (var vp = 0; vp < validPorts.length; vp++) {
        if (!depPort) depPort = validPorts[vp];
        else if (!arrPort && validPorts[vp] !== depPort) arrPort = validPorts[vp];
      }

      flights.push({
        airline: ff.airline, flightNum: ff.flightNum,
        date: nearDate ? nearDate[0] : '',
        from: depPort, to: arrPort,
        depTime: nearTimes[0] || '', arrTime: nearTimes[1] || nearTimes[0] || '',
        source: 'SIMPLE'
      });
    });
  }

  Logger.log('parseTicketText_ found ' + flights.length + ' flights: ' + JSON.stringify(flights));

  if (flights.length === 0) return null;

  // ===== تحديد رحلة الوصول للسعودية والمغادرة منها =====
  var arrivalFlight = null;
  var departureFlight = null;

  flights.forEach(function(f) {
    // أول رحلة تصل للسعودية
    if (!arrivalFlight && saudiCodes.indexOf(f.to) !== -1) arrivalFlight = f;
    // آخر رحلة تغادر السعودية
    if (saudiCodes.indexOf(f.from) !== -1) departureFlight = f;
  });

  // لو ما لقيناش بالأكواد، جرّب بأي منطق بديل (أول رحلة = وصول، آخر رحلة = مغادرة)
  if (!arrivalFlight && !departureFlight && flights.length >= 1) {
    arrivalFlight = flights[0];
    if (flights.length >= 2) departureFlight = flights[flights.length - 1];
  }

  if (!arrivalFlight && !departureFlight) return null;

  // ===== دالة مساعدة: إيجاد تاريخ صحيح بالقرب من رقم رحلة في النص الكامل =====
  function findDateNear(airline, flightNum, fullText, searchFrom) {
    var allDates = [];
    var dateRx = /(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2,4})/gi;
    var dm;
    while ((dm = dateRx.exec(fullText)) !== null) {
      allDates.push({ raw: dm[0], pos: dm.index });
    }
    if (allDates.length === 0) return '';
    // نبحث عن "شركة+رقم" معاً (أكثر تحديداً من رقم الرحلة وحده لتفادي تطابقات زائفة)
    var searchKey = airline + flightNum;
    var flightPos = fullText.indexOf(searchKey, searchFrom || 0);
    if (flightPos === -1) flightPos = fullText.indexOf(flightNum, searchFrom || 0);
    if (flightPos === -1) return toDate(allDates[0].raw);
    var closest = allDates.reduce(function(best, d) {
      return Math.abs(d.pos - flightPos) < Math.abs(best.pos - flightPos) ? d : best;
    });
    return toDate(closest.raw);
  }

  // يحوّل تاريخ dd/mm/yyyy لكائن Date للمقارنة الزمنية
  function toComparableDate(ddmmyyyy) {
    if (!ddmmyyyy) return null;
    var p = ddmmyyyy.split('/');
    if (p.length !== 3) return null;
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  }

  // ===== بناء النتيجة بنفس هيكل aiData =====
  var arrDate = arrivalFlight ? toDate(arrivalFlight.date) : '';
  var depDate = departureFlight ? toDate(departureFlight.date) : '';

  // تحقق منطقي: تاريخ المغادرة (خروج من السعودية) يجب أن يكون بعد تاريخ الوصول
  // لو طلع نفس التاريخ أو أقدم، على الأغلب حصل خطأ في التقاط التاريخ الصحيح — نعيد البحث
  if (arrDate && depDate && departureFlight) {
    var arrD = toComparableDate(arrDate);
    var depD = toComparableDate(depDate);
    if (arrD && depD && depD.getTime() <= arrD.getTime()) {
      var searchStart = oneLine.indexOf(arrivalFlight.airline + arrivalFlight.flightNum);
      var corrected = findDateNear(departureFlight.airline, departureFlight.flightNum, oneLine,
        searchStart !== -1 ? searchStart + 10 : 0);
      if (corrected) depDate = corrected;
    }
  }

  // لو التاريخ فشل في التحليل، نبحث عن تاريخ في النص الكامل بالقرب من رقم الرحلة
  if (!arrDate && arrivalFlight)   arrDate = findDateNear(arrivalFlight.airline, arrivalFlight.flightNum, oneLine, 0);
  if (!depDate && departureFlight) depDate = findDateNear(departureFlight.airline, departureFlight.flightNum, oneLine, 0);

  return {
    arrivalDate:     arrDate,
    arrivalTime:     arrivalFlight   ? toTime(arrivalFlight.arrTime) : '',
    arrivalFlight:   arrivalFlight   ? arrivalFlight.airline + ' ' + arrivalFlight.flightNum : '',
    arrivalPort:     arrivalFlight   ? (airports[arrivalFlight.to] || arrivalFlight.to || '') : '',
    arrivalOrigin:   arrivalFlight   ? (airports[arrivalFlight.from] || arrivalFlight.from || '') : '',
    arrivalRoute:    arrivalFlight   ? ((airports[arrivalFlight.from] || arrivalFlight.from || '') + ' → ' + (airports[arrivalFlight.to] || arrivalFlight.to || '')) : '',
    departureDate:   depDate,
    departureTime:   departureFlight ? toTime(departureFlight.depTime) : '',
    departureFlight: departureFlight ? departureFlight.airline + ' ' + departureFlight.flightNum : '',
    departurePort:   departureFlight ? (airports[departureFlight.from] || departureFlight.from || '') : '',
    departureDestination: departureFlight ? (airports[departureFlight.to] || departureFlight.to || '') : '',
    departureRoute:  departureFlight ? ((airports[departureFlight.from] || departureFlight.from || '') + ' → ' + (airports[departureFlight.to] || departureFlight.to || '')) : ''
  };
}

/**
 * يستخرج كود مطار IATA من نص وصفي (مثل "CAIRO, EG (CAIRO INTL)")
 */
function extractAirportCode_(text, airportsMap) {
  if (!text) return '';
  // أولاً: بحث عن كود 3 حروف بين أقواس
  var m = text.match(/\(([A-Z]{3})\)/);
  if (m && airportsMap[m[1]]) return m[1];

  var upper = text.toUpperCase();

  // ثانياً: أسماء مطارات مركّبة مميزة (يجب فحصها قبل البحث عن أكواد 3 حروف
  // حتى لا يلتبس "MED" مثلاً بجزء من كلمة أخرى)
  if (upper.indexOf('KING ABDULAZIZ') !== -1) return 'JED';           // مطار جدة
  if (upper.indexOf('MOHAMMAD BIN ABDULAZIZ') !== -1) return 'MED';   // مطار المدينة المنورة
  if (upper.indexOf('MOHAMMED BIN ABDULAZIZ') !== -1) return 'MED';
  if (upper.indexOf('KING KHALID') !== -1) return 'RUH';              // مطار الرياض
  if (upper.indexOf('PRINCE MOHAMMAD') !== -1) return 'MED';

  // ثالثاً: بحث عن كود معروف في النص
  var codes = Object.keys(airportsMap);
  for (var i = 0; i < codes.length; i++) {
    if (upper.indexOf(codes[i]) !== -1) return codes[i];
  }
  // رابعاً: بحث بالأسماء
  if (upper.indexOf('CAIRO') !== -1) return 'CAI';
  if (upper.indexOf('JEDDAH') !== -1 || upper.indexOf('JEDDA') !== -1) return 'JED';
  if (upper.indexOf('MEDINA') !== -1 || upper.indexOf('MADINAH') !== -1) return 'MED';
  if (upper.indexOf('RIYADH') !== -1) return 'RUH';
  if (upper.indexOf('DUBAI') !== -1) return 'DXB';
  if (upper.indexOf('ISTANBUL') !== -1) return 'IST';
  if (upper.indexOf('ASYUT') !== -1 || upper.indexOf('ASSIUT') !== -1) return 'ATZ';
  if (upper.indexOf('TAIF') !== -1) return 'TIF';
  // خامساً: أي كود 3 حروف
  var any3 = text.match(/\b([A-Z]{3})\b/);
  if (any3) return any3[1];
  return '';
}


/* ===============================
   FINALIZE TEMP TICKET
================================ */

function finalizeTicketFile(

  tempFileId,

  notificationNumber,

  oldFileId

) {

  try {

    if (!tempFileId) {

      return {
        success: false,
        error: "tempFileId مطلوب"
      };
    }

    // ===============================
    // الوصول للملف المؤقت
    // ===============================

    var file =
      DriveApp.getFileById(tempFileId);

    // ===============================
    // مجلد التذاكر النهائي
    // ===============================

    var finalFolder = getDriveFolder_('TICKETS');  // مجلد التذاكر النهائية الدائمة

    // ===============================
    // الامتداد
    // ===============================

    var oldName = file.getName();

    var extension = "";

    if (oldName.indexOf('.') !== -1) {

      extension =
        "." +
        oldName.split('.').pop();
    }

    // ===============================
    // الاسم النهائي
    // ===============================

    var finalName =

      "اشعار_" +

      notificationNumber +

      extension;

    file.setName(finalName);

    // ===============================
    // نقل للفولدر النهائي
    // ===============================

    finalFolder.addFile(file);

    // ===============================
    // حذف من temp
    // ===============================

    try {

      var tempFolders =
        DriveApp.getFoldersByName(
          "TempTickets"
        );

      if (tempFolders.hasNext()) {

        tempFolders
          .next()
          .removeFile(file);
      }

    } catch(e) {

      Logger.log(e);
    }

    // ===============================
    // حذف التذكرة القديمة بعد النجاح
    // ===============================

    try {

      if (oldFileId) {

        DriveApp
          .getFileById(oldFileId)
          .setTrashed(true);
      }

    } catch(e) {

      Logger.log(e);
    }

    return {

      success: true,

      fileId: file.getId(),

      fileUrl: file.getUrl(),

      fileName: finalName
    };

  } catch(err) {

    return {

      success: false,

      error: err.toString()
    };
  }
}


// ===============================
// تحويل تاريخ GDS من صيغة "14AUG" إلى dd/mm/yyyy
// (كانت معرّفة محليًا داخل analyzeTicketTextServer فقط — تم رفعها لتصبح دالة عامة
//  قابلة للاختبار وإعادة الاستخدام، بدون أي تغيير في المنطق الداخلي)
// ===============================
function convertDate(dateStr, fullText) {

  if (!dateStr) return "";

  var months = {

    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11
  };

  var m =
    dateStr.match(/(\d{1,2})([A-Z]{3})/i);

  if (!m) return dateStr;

  var day =
    parseInt(m[1], 10);

  var monthName =
    m[2].toUpperCase();

  var month =
    months[monthName];

  if (month === undefined) {
    return dateStr;
  }

  // =========================
  // محاولة استخراج السنة من النص
  // =========================

  var detectedYear = null;

  if (fullText) {

    // يبحث عن أي سنة مثل:
    // 2025 أو 2026 أو 2027

    var yearMatch =
      fullText.match(/\b(20\d{2})\b/);

    if (yearMatch) {

      detectedYear =
        parseInt(yearMatch[1], 10);

    }
  }

  // =========================
  // إذا لم نجد سنة
  // استخدم التخمين الذكي
  // =========================

  if (!detectedYear) {

    var now = new Date();

    var currentYear =
      now.getFullYear();

    var currentMonth =
      now.getMonth();

    detectedYear =
      currentYear;

    if (month < currentMonth - 1) {

      detectedYear =
        currentYear + 1;

    }
  }

  var finalDate =
    new Date(
      detectedYear,
      month,
      day
    );

  var dd =
    String(finalDate.getDate())
      .padStart(2, '0');

  var mm =
    String(finalDate.getMonth() + 1)
      .padStart(2, '0');

  var yyyy =
    finalDate.getFullYear();

  return dd + "/" + mm + "/" + yyyy;
}

// ===============================
// تحويل الوقت من صيغة "HHMM" إلى "HH:MM"
// (كانت معرّفة محليًا داخل analyzeTicketTextServer فقط — نفس ملاحظة convertDate أعلاه)
// ===============================
function convertTime(timeStr) {

  if (!timeStr) return "";

  timeStr = timeStr.toString();

  if (timeStr.length !== 4) return timeStr;

  return (
    timeStr.substring(0, 2) +
    ":" +
    timeStr.substring(2)
  );
}

function analyzeTicketTextServer(authToken, rawText) {
  requireAuth_(authToken);
  return _analyzeTicketTextCore_(rawText);
}

// 🧠 نواة تحليل نص التذكرة (بدون توثيق) — تُستخدم من الواجهة (عبر الغلاف أعلاه) ومن بوت تليجرام مباشرة
function _analyzeTicketTextCore_(rawText) {

  try {

    // ===============================
    // التحقق من وجود نص
    // ===============================
    if (!rawText || rawText.trim() === "") {

      return {
        success: false,
        error: "النص فارغ."
      };
    }

    // ===============================
    // تنظيف النص
    // ===============================
    rawText = rawText
      .replace(/\r/g, " ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    Logger.log("RAW TEXT:");
    Logger.log(rawText);

    // ===============================
    // استخراج الرحلات من نص GDS
    // ===============================
    /*
      مثال:
      1 SM 489 P 14AUG 4 ATZMED HK45 0345 0530
      2 SM 456 P 28AUG 4 JEDATZ HK45 N 1445 1630
    */

    var regex =
      /([A-Z0-9]{2})\s+(\d+).*?(\d{1,2}[A-Z]{3}).*?([A-Z]{3})([A-Z]{3}).*?(\d{4})\s+(\d{4})/gi;

    var flights = [];

    var match;

    while ((match = regex.exec(rawText)) !== null) {

      flights.push({

        airline: match[1],

        flightNumber: match[2],

        date: match[3],

        from: match[4],

        to: match[5],

        departureTime: match[6],

        arrivalTime: match[7]
      });
    }

    Logger.log("EXTRACTED FLIGHTS:");
    Logger.log(JSON.stringify(flights));

    // ===============================
    // التحقق من وجود رحلات
    // ===============================
    if (flights.length === 0) {

      return {
        success: false,
        error: "لم يتم العثور على رحلات داخل النص."
      };
    }

    // ===============================
    // أسماء المطارات بالعربي
    // ===============================
    var airports = {

      MED: "مطار المدينة المنورة",

      JED: "مطار جدة",

      RUH: "مطار الرياض",

      TIF: "مطار الطائف",

      CAI: "مطار القاهرة",

      DXB: "مطار دبي",

      IST: "مطار إسطنبول",

      KWI: "مطار الكويت",

      DOH: "مطار الدوحة",

      SHJ: "مطار الشارقة",

      AUH: "مطار أبوظبي",

      ATZ: "مطار أسيوط",

      AHB: "مطار أبها",

      ELQ: "مطار القصيم",

      DMM: "مطار الدمام"
    };

    // ===============================
    // مطارات السعودية
    // ===============================
    var saudiAirports = [
      "JED",
      "MED",
      "RUH",
      "TIF",
      "AHB",
      "ELQ",
      "DMM"
    ];

    // ===============================
    // تحديد رحلة الوصول والمغادرة
    // ===============================
    var arrivalFlight = null;

    var departureFlight = null;

    flights.forEach(function(f) {

      // أول رحلة تدخل السعودية
      if (
        saudiAirports.indexOf(f.to) !== -1 &&
        arrivalFlight === null
      ) {

        arrivalFlight = f;
      }

      // آخر رحلة تغادر السعودية
      if (
        saudiAirports.indexOf(f.from) !== -1
      ) {

        departureFlight = f;
      }
    });

    // convertDate() و convertTime() أصبحتا دالتين عامتين (top-level) فوق هذه الدالة مباشرة —
    // بعد ما كانتا معرّفتين محليًا هنا فقط، وهو اللي كان بيمنع اختبارهما من TEST_SUITE
    // (استدعاء دالة محلية من خارج الدالة الأم بيرمي "is not defined"). السلوك هنا لم يتغيّر.


    // ===============================
    // تجهيز النتيجة النهائية
    // ===============================
    var result = {

      arrivalDate:
        arrivalFlight ?
        convertDate(arrivalFlight.date) : "",

      arrivalTime:
        arrivalFlight ?
        convertTime(arrivalFlight.arrivalTime) : "",

      arrivalFlight:
        arrivalFlight ?
        arrivalFlight.airline +
        " " +
        arrivalFlight.flightNumber : "",

      arrivalPort:
        arrivalFlight ?
        (
          airports[arrivalFlight.to] ||
          arrivalFlight.to
        ) : "",

      departureDate:
        departureFlight ?
        convertDate(departureFlight.date) : "",

      departureTime:
        departureFlight ?
        convertTime(departureFlight.departureTime) : "",

      departureFlight:
        departureFlight ?
        departureFlight.airline +
        " " +
        departureFlight.flightNumber : "",

      departurePort:
        departureFlight ?
        (
          airports[departureFlight.from] ||
          departureFlight.from
        ) : ""
    };

    Logger.log("FINAL RESULT:");
    Logger.log(JSON.stringify(result));

    // ===============================
    // نجاح
    // ===============================
    return {

      success: true,

      data: result
    };

  } catch (err) {

    Logger.log("ERROR:");
    Logger.log(err);

    return {

      success: false,

      error:
        "حدث خطأ أثناء تحليل النص:\n\n" +
        err.toString()
    };
  }
}











/* ===============================
   DELETE TICKET FILE
================================ */

function deleteTicketFile(authToken, fileId) {
  requireAuth_(authToken);

  try {

    if (!fileId) {

      return {
        success: false,
        error: "fileId مطلوب"
      };
    }

    var file =
      DriveApp.getFileById(fileId);

    file.setTrashed(true);

    return {

      success: true
    };

  } catch(err) {

    Logger.log(err);

    return {

      success: false,

      error: err.toString()
    };
  }
}


function deleteTicketFromBooking(

  authToken,

  fileId,

  bookingId

) {
  var session = requireAuth_(authToken);
  // 🔒 كان الفحص هنا مقصوراً على تسجيل الدخول فقط رغم إن الواجهة بتُخفي الزر لمن لا يملك صلاحية
  // "REMOVE" — أي طلب مباشر للدالة (تجاوزاً للواجهة) كان بينفذ الحذف بلا أي تحقق من الصلاحية الفعلية
  if (!_sessionHasPerm_(session, "bookings.delete")) {
    throw new Error("حذف مرفق التذكرة متاح فقط لصاحب صلاحية DELETE على شاشة الإشعارات أو admin");
  }

  try {

    Logger.log("FILE ID:");
    Logger.log(fileId);

    Logger.log("BOOKING ID:");
    Logger.log(bookingId);

    // حذف الملف من الدرايف
// استخراج fileId من الرابط إذا كان فارغ

if (

  (!fileId || fileId === "") &&

  bookingId

) {

  var sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Bookings");

  var data =
    sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {

    if (

      data[i][1].toString() ===

      bookingId.toString()

    ) {

      var ticketUrl =
        data[i][31] || "";

      // استخراج ID من رابط Google Drive
      var match =
        ticketUrl.match(/\/d\/([^\/]+)/);

      if (

        match &&

        match[1]

      ) {

        fileId = match[1];
      }

      break;
    }
  }
}

// حذف الملف

if (

  fileId &&

  fileId.toString().trim() !== ""

) {

  DriveApp
    .getFileById(fileId)
    .setTrashed(true);
}
    var sheet =
      SpreadsheetApp
        .getActiveSpreadsheet()
        .getSheetByName("Bookings");

    var data =
      sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {

      if (

        data[i][1].toString() ===

        bookingId.toString()

      ) {

        // حذف رابط التذكرة
        sheet.getRange(i + 1, 32)
          .setValue("");

        // حذف fileId
        sheet.getRange(i + 1, 33)
          .setValue("");

        Logger.log("TICKET REMOVED");

        break;
      }
    }

    return {

      success: true
    };

  } catch(err) {

    Logger.log(err);

    return {

      success: false,

      error: err.toString()
    };
  }
}




/**
 * ينشئ إشعار وصول جديد أو يعدّل إشعاراً موجوداً — الدالة الأهم والأكثر تعقيداً في النظام.
 * 📞 يُستدعى من: submitForm() في index_web.html (نموذج التسجيل/التعديل المنبثق)
 * 🔄 الخطوات: تحقق صلاحيات → تحقق حقول إلزامية → بناء/تحديث صف Bookings →
 *            تسجيل الفرق في سجل التعديلات (logBookingRowDiff_) → إعادة بناء شيت Movements → مسح الكاش
 * ⚠️ لا تُعدّل ترتيب الأعمدة في rowValues بدون تحديث BOOKING_FIELD_LABELS_ بنفس الترتيب،
 *    وإلا هيبوظ سجل التعديلات (بيعتمد على تطابق index الحقول بين الاتنين)
 */
// 🛡️ حل جذري: الدالة بالكامل ملفوفة بـ try/catch. أي استثناء من أي كود داخلها (validateMovementsLogic،
// buildAllMovements، أو أي إضافة مستقبلية) يرجع دائماً { success:false, error:... } نظيف بدل أي احتمال
// لانهيار غير مُعالَج يفوّت withFailureHandler في الواجهة برسالة تقنية غير مفهومة أو بلا رسالة إطلاقاً —
// هذا يضمن أن رسالة validateMovementsLogic التفصيلية تصل دائماً للمستخدم مهما تغيّر الكود مستقبلاً
// 🔢 (V4.47/V4.49/V4.50) رقم الإشعار الجديد يُحتَسَب دائماً كأقصى رقم موجود في شيت Bookings + 1،
// تحت قفل ذري (LockService) لحماية التزامن. لا يعتمد أبداً على عدّاد محفوظ خارجي فيبقى الرقم متطابقاً
// مع ما هو في الشيت لحظياً حتى بعد أي حذف أو تعديل يدوي مباشر على الشيت — بطلب صريح.
// لتعديل الترقيم يدوياً: افتح شيت Bookings مباشرة وعدّل عمود «رقم الإشعار» بالرقم المطلوب،
// وسيلتقط الإشعار التالي هذا الرقم تلقائياً (بدون أي إعداد إضافي)
function _nextBookingId_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getSpreadsheet_().getSheetByName("Bookings");
    var data = sheet.getDataRange().getValues();
    var C = _robustColMap_(sheet, BOOKINGS_HEADERS_);
    var B = _cellReader_(C, BOOKINGS_COL_);
    var maxId = 0;
    for (var i = 1; i < data.length; i++) {
      var currentId = parseInt(B(data[i], 'id'));
      if (!isNaN(currentId) && currentId > maxId) maxId = currentId;
    }
    // 🧹 (V4.50) نظّف أي عدّاد قديم مخزّن في PropertiesService — بطلب صريح: المصدر الوحيد للحقيقة الآن هو الشيت
    try { PropertiesService.getScriptProperties().deleteProperty('NEXT_BOOKING_ID'); } catch(_e) {}
    return maxId + 1;
  } finally {
    lock.releaseLock();
  }
}

function saveBookingToServer(authToken, bookingData) {
  try {
    return _saveBookingToServer_impl_(authToken, bookingData);
  } catch (e) {
    Logger.log('saveBookingToServer CRASH: ' + e + ' | stack: ' + (e.stack || 'n/a'));
    return { success: false, error: 'حدث خطأ غير متوقع أثناء الحفظ: ' + (e.message || e) };
  }
}

function _saveBookingToServer_impl_(authToken, bookingData) {
  var _perfStart = new Date().getTime(); // ⏱️ قياس أداء — يُطبَع في Logger عند نهاية الدالة
  var session = requireAuth_(authToken);

  // التحقق من الحقول الإلزامية المُعرَّفة في شاشة الإعدادات
  // 🤖 إشعارات بوت تليجرام تمر بمسار تحقق خاص بها داخل البوت (حالة "قيد المراجعة" دائمًا)
  var requiredCheck = bookingData.__fromTelegramBot__ === true ? null : validateRequiredFields_(bookingData);
  if (requiredCheck) {
    return { success: false, error: requiredCheck };
  }

  // التحقق الذكي قبل الحفظ — إشعار الوصول الفعلي: صارم بخصوص وجود تواريخ الوصول/المغادرة
  // (بعكس المسودة، البيانات هنا يُفترض اكتمالها بالكامل)
  bookingData.__strictDates__ = true;
  var validationError = validateMovementsLogic(bookingData);
  if (validationError) {
    // 🎯 error: نص مسطّح للتوافق مع أي كود قديم يقرأ res.error كنص مباشرة (لا يزال يعمل كما هو)
    // errorDetails: نفس الخطأ لكن بشكل مُهيكَل (title/detail/meta) تستخدمه الواجهة الجديدة لعرض
    // نافذة تنبيه احترافية بدل alert() المسطّح — كلا الحقلين يصفان نفس الخطأ، فقط بتغليف مختلف
    return { success: false, error: validationError.title + ': ' + validationError.detail, errorDetails: validationError };
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Bookings");
  var data = sheet.getDataRange().getValues();
  var C = _robustColMap_(sheet, BOOKINGS_HEADERS_); // خريطة أعمدة بالاسم (تقاوم إعادة الترتيب)
  var B = _cellReader_(C, BOOKINGS_COL_);            // قارئ صف بالاسم المنطقي

  var targetRow = -1;
  var finalId = bookingData.id;

  if (finalId) {
    for (var i = 1; i < data.length; i++) {
      var _rid = B(data[i], 'id');
      if (_rid && _rid.toString() === finalId.toString()) {
        targetRow = i + 1;
        break;
      }
    }
  } else {
    // 🔢 (V4.47) رقم إشعار مضمون التفرّد عبر عدّاد ذري بقفل — كان "أقصى رقم موجود + 1" يُحسَب من
    // نسخة الشيت المقروءة أول الدالة، فإشعاران يُنشآن في نفس اللحظة تقريباً (نقرتان متتاليتان، أو
    // مستخدمان مختلفان) كانا يحصلان على نفس الرقم بالضبط، فيظهر أحدهما مكان الآخر أو يختفي من سجل
    // الإشعارات لأن كثيراً من الشاشات تبحث/تربط بالرقم كمفتاح فريد
    finalId = _nextBookingId_();
  }

  // 🐛 (V4.48) إصلاح جوهري: كان الـ Cache يُمسَح هنا — قبل كتابة الصف فعليًا بشيت Bookings بعشرات
  // الأسطر (رفع التذكرة، بناء بيانات الصف...) — ما يفتح نافذة زمنية: أي قراءة أخرى (فتح شاشة سجل
  // الإشعارات فورًا، أو حتى نداء متزامن آخر) بين المسح وكتابة الصف الفعلية كانت تُعيد ملء الـ Cache
  // ببيانات قديمة (بدون الإشعار الجديد) فيظل الإشعار غائبًا عن الشاشة رغم نجاح حفظه فعلاً بالشيت —
  // بالضبط عرض "ظهرت رسالة النجاح ورقم الإشعار لكنه لا يظهر بسجل الإشعارات". الحل: مسح الـ Cache
  // بعد الكتابة الفعلية مباشرة (أسفل الدالة)، وليس قبلها.

  var finalTicketUrl = bookingData.ticketUrl || "";

// ===============================
// FINALIZE TEMP TICKET
// ===============================

if (

  bookingData.ticketFileId &&

  bookingData.ticketTemporary === true

) {

  var finalized = finalizeTicketFile(

    bookingData.ticketFileId,

    finalId,

    bookingData.oldTicketFileId

  );

  if (finalized.success) {

    finalTicketUrl = finalized.fileUrl;

    bookingData.ticketFileId =
      finalized.fileId;

  }

}

  if (targetRow !== -1 && !finalTicketUrl) {

  finalTicketUrl =
    B(data[targetRow - 1], 'ticketUrl') || "";

  // الاحتفاظ بالتذكرة القديمة
  if (!bookingData.oldTicketFileId) {

    bookingData.oldTicketFileId =
      B(data[targetRow - 1], 'ticketFileId') || "";

  }

}

  // قيمة التشغيلة = سعر الباص × عدد الباصات — تُحسب هنا دائمًا (لا تُستقبل من العميل مباشرة)
  // عشان تفضل القيمة المعتمدة الوحيدة صحيحة حتى لو الحساب في الواجهة اختلف لأي سبب.
  // لو "عدد الباصات" قيمة نصية غير رقمية (زي "النقل بمعرفة العميل") تُعتبر القيمة صفر.
  var busPriceNum = parseFloat(bookingData.busPrice);
  if (isNaN(busPriceNum)) busPriceNum = 0;
  var busCountNum = parseFloat(bookingData.busCount || bookingData.buses);
  var operationValue = isNaN(busCountNum) ? 0 : (busPriceNum * busCountNum);

  // تجهيز البيانات للحفظ في شيت Bookings — بالاسم المنطقي (يقاوم إعادة ترتيب الأعمدة)
  var _vals = {};
  _vals[BOOKINGS_COL_.status]         = bookingData.status || "قيد المراجعة";
  _vals[BOOKINGS_COL_.id]             = finalId;
  _vals[BOOKINGS_COL_.agent]          = bookingData.agent || "";
  _vals[BOOKINGS_COL_.company]        = bookingData.company || "";
  _vals[BOOKINGS_COL_.groupNumbers]   = bookingData.groupNumbers || "";
  _vals[BOOKINGS_COL_.client]         = bookingData.client || "";
  _vals[BOOKINGS_COL_.count]          = bookingData.count || "0";
  _vals[BOOKINGS_COL_.supervisor]     = bookingData.supervisor || "";
  _vals[BOOKINGS_COL_.travelMethod]   = bookingData.travelMethod || "";
  _vals[BOOKINGS_COL_.arrivalPort]    = bookingData.arrivalPort || "";
  _vals[BOOKINGS_COL_.arrivalDate]    = bookingData.arrivalDate || "";
  _vals[BOOKINGS_COL_.arrivalTime]    = bookingData.arrivalTime || "";
  _vals[BOOKINGS_COL_.arrivalFlight]  = bookingData.arrivalFlight || "";
  _vals[BOOKINGS_COL_.departureDate]  = bookingData.departureDate || "";
  _vals[BOOKINGS_COL_.departureFlight]= bookingData.departureFlight || "";
  _vals[BOOKINGS_COL_.departureTime]  = bookingData.departureTime || "";
  _vals[BOOKINGS_COL_.departurePort]  = bookingData.departurePort || "";
  _vals[BOOKINGS_COL_.transportCompany]= bookingData.transportCompany || "";
  _vals[BOOKINGS_COL_.operationNo]    = bookingData.operationNo || "";
  _vals[BOOKINGS_COL_.busCount]       = bookingData.busCount || bookingData.buses || "";
  _vals[BOOKINGS_COL_.direction]      = bookingData.direction || "";
  _vals[BOOKINGS_COL_.madinahNights]  = bookingData.madinahNights || "0";
  _vals[BOOKINGS_COL_.makkahNights]   = bookingData.makkahNights || "0";
  _vals[BOOKINGS_COL_.madinahHotel]   = bookingData.madinahHotel || "";
  _vals[BOOKINGS_COL_.madinahCheckIn] = bookingData.madinahCheckIn || "";
  _vals[BOOKINGS_COL_.madinahCheckOut]= bookingData.madinahCheckOut || "";
  _vals[BOOKINGS_COL_.makkahHotel]    = bookingData.makkahHotel || "";
  _vals[BOOKINGS_COL_.makkahCheckIn]  = bookingData.makkahCheckIn || "";
  _vals[BOOKINGS_COL_.makkahCheckOut] = bookingData.makkahCheckOut || "";
  _vals[BOOKINGS_COL_.internalTransferDate] = bookingData.internalTransferDate || "";
  _vals[BOOKINGS_COL_.internalTransferTime] = bookingData.internalTransferTime || "";
  _vals[BOOKINGS_COL_.extraMovements] = typeof bookingData.extraMovements === "string" ? bookingData.extraMovements : JSON.stringify(bookingData.extraMovements || []);
  _vals[BOOKINGS_COL_.notes]          = bookingData.notes || "";
  _vals[BOOKINGS_COL_.ticketUrl]      = finalTicketUrl;
  _vals[BOOKINGS_COL_.ticketFileId]   = bookingData.ticketFileId || "";
  _vals[BOOKINGS_COL_.busPrice]       = busPriceNum;
  _vals[BOOKINGS_COL_.operationValue] = operationValue;
  _vals[BOOKINGS_COL_.tripName]       = bookingData.tripName || "";
  _vals[BOOKINGS_COL_.groupName]      = bookingData.groupName || ""; // 🏷️ (V4.16) شاشة فقط — لا يظهر بالطباعة
  // 🧩 (V4.43) مقاطع نقل إضافية — بيان+قيمة لكل مقطع، تُستخدم بكشف حساب النقل السعودي
  _vals[BOOKINGS_COL_.transportSegments] = typeof bookingData.transportSegments === "string"
    ? bookingData.transportSegments : JSON.stringify(bookingData.transportSegments || []);
  var rowValues = _buildRowByName_(C, BOOKINGS_HEADERS_.length, _vals);
  // 🧩 (V4.43) ضمان وجود عنوان العمود الجديد بصف العناوين لو الشيت قديم ولم يُنشأ به بعد (بلا إزاحة —
  // العمود مُضاف بآخر القائمة القانونية فقط)
  try {
    var _tsColIdx = C[BOOKINGS_COL_.transportSegments];
    if (_tsColIdx !== undefined && !sheet.getRange(1, _tsColIdx + 1).getValue()) {
      sheet.getRange(1, _tsColIdx + 1).setValue(BOOKINGS_COL_.transportSegments);
    }
  } catch (eTsHdr) {}

  var wasExistingBooking = (targetRow !== -1);
  var oldRowSnapshot = wasExistingBooking ? data[targetRow - 1] : null;

  // 🐛 (V4.49) الإصلاح الحقيقي لعدم ظهور الإشعار بشيت Bookings: كان appendRow يفشل صامتاً لو
  // كانت أعمدة الشيت الفعلية أقل من طول rowValues (الشيت القديم بلا عمود «مقاطع نقل إضافية» —
  // 40 عمود بالتعريف الحالي بينما الشيت لسه 39). الحل: (1) توسيع أعمدة الشيت ديناميكيًا للتعريف
  // الأحدث بلا فقدان بيانات، (2) استخدام setValues على صف محدد بدل appendRow (أكثر تحديدًا)،
  // (3) قراءة الصف بعد الكتابة والتحقق أن الرقم كُتب فعلاً — يُرمَى خطأ صريح لو لم يُكتَب،
  // فيصل للمستخدم فوراً بدل رسالة نجاح كاذبة
  var _widthNeeded = Math.max(BOOKINGS_HEADERS_.length, rowValues.length);
  if (sheet.getMaxColumns() < _widthNeeded) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), _widthNeeded - sheet.getMaxColumns());
  }
  // أطِل rowValues لتطابق عرض الشيت بالضبط — منع أي التباس في setValues
  while (rowValues.length < _widthNeeded) rowValues.push("");

  if (targetRow !== -1) {
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    // استخدام setValues على lastRow+1 بدل appendRow (الأول أكثر تحديدًا وأقل عرضة للفشل الصامت)
    targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    SpreadsheetApp.flush(); // اضمن التطبيق الفعلي قبل التحقق
    // ✅ تحقق ما بعد الكتابة: أعِد قراءة رقم الإشعار من الصف — لو مش موجود اِرمِ خطأ صريح
    var _writtenId = sheet.getRange(targetRow, (C[BOOKINGS_COL_.id] || 1) + 1).getValue();
    if (String(_writtenId || '').trim() !== String(finalId).trim()) {
      throw new Error("فشلت كتابة الإشعار #" + finalId + " في شيت Bookings (الرقم المقروء بعد الكتابة: «" +
        _writtenId + "»). تحقق من صلاحيات الشيت وأنه غير محمي.");
    }
  }

  // ===== سجل التعديلات: تسجيل الإنشاء أو تسجيل كل حقل تغيّر فعلياً عند التعديل =====
  if (wasExistingBooking) {
    logBookingRowDiff_(session.username, finalId, oldRowSnapshot, rowValues);
  } else {
    logChange_(session.username, "إنشاء إشعار جديد", finalId, "-", "-", "تم إنشاء إشعار وصول رقم " + finalId);
  }

  sheet.getRange(targetRow, 1, 1, rowValues.length).setHorizontalAlignment("center");

  // =====================================
  // تحديث شيت التحركات الموحد (Movements)
  // =====================================
  var movementsSheet = ss.getSheetByName("Movements");
  if (movementsSheet) {
    deleteBookingMovements(finalId);
    var allMovements = buildAllMovements(bookingData);

    if (allMovements.length > 0) {
      var rows = [];
      allMovements.forEach(function(m) {
        rows.push([
          bookingData.status || "قيد المراجعة",                     // العمود 1: الحالة
          finalId,                                                // العمود 2: رقم الإشعار
          m.date || "",                                           // العمود 3: التاريخ
          m.time || "00:00",                                      // العمود 4: الوقت
          m.type || "",                                           // العمود 5: نوع التحرك 
          bookingData.agent || "",                                // العمود 6: الوكيل
          bookingData.company || "",                              // العمود 7: الشركة المصرية
          bookingData.client || "",                               // العمود 8: العميل
          bookingData.count || "0",                               // العمود 9: العدد
          bookingData.supervisor || "",                           // العمود 10: المشرف
          m.buses || bookingData.busCount || ""                   // العمود 11: عدد الباصات 
        ]);
      });

      movementsSheet.getRange(movementsSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
  }

  // 🔄 مزامنة الإشعار → الرحلة المرتبطة (لا توقف الحفظ لو فشلت)
  try { _propagateBookingChangesToTrip_(finalId, bookingData); } catch (e) { Logger.log('propagate booking→trip failed: ' + e); }

  // 🐛 (V4.48) مسح الـ Cache هنا فقط — بعد كتابة الصف فعليًا بالشيت — انظر التعليق أعلى الدالة
  SpreadsheetApp.flush();
  clearAllCache();

  Logger.log('⏱️ saveBookingToServer(#' + finalId + '): ' + (new Date().getTime() - _perfStart) + 'ms');
  return { success: true, id: finalId };
}



// 🎯 حل جذري لعرض أخطاء التحركات الإضافية بشكل احترافي: هذه الدالة الآن ترجع كائن خطأ مُهيكَل
// { code, title, detail, meta } بدل نص عادي فقط — يسمح للواجهة ببناء نافذة تنبيه غنية (عنوان +
// تفاصيل + بيانات الحركة المعنية) بدل alert() مسطّح. كل قاعدة تحقق وكل رسالة موجودة سابقاً باقية
// تماماً بدون أي تغيير في المنطق — فقط طريقة تغليف النتيجة تغيّرت. دالة _err_ في الأسفل هي نقطة
// التجميع الوحيدة لبناء كائن الخطأ، فأي إضافة مستقبلية لأنواع أخطاء جديدة تمر من نفس المكان
function validateMovementsLogic(data) {

  // يبني كائن الخطأ المُهيكَل بشكل موحّد لكل نقاط الفشل في الدالة
  function _err_(code, title, detail, meta) {
    return { code: code, title: title, detail: detail, meta: meta || {} };
  }

  // ==================================================
  // تنظيف وقراءة الوقت بشكل آمن جدًا
  // ==================================================
  function parseTimeSafe(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return { h: 0, m: 0 };

    var clean = timeStr
      .trim()
      .replace(/[^\d:]/g, ""); // يحذف أي رموز أو حروف

    var parts = clean.split(":");

    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);

    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;

    return { h: h, m: m };
  }

  // ==================================================
  // تحويل تاريخ + وقت
  // ==================================================
  function toDateTime(dateStr, timeStr) {
    if (!dateStr) return null;

    var p = dateStr.split('/');
    var day = parseInt(p[0], 10);
    var month = parseInt(p[1], 10) - 1;
    var year = parseInt(p[2], 10);

    var t = parseTimeSafe(timeStr);

    return new Date(year, month, day, t.h, t.m);
  }

  // ==================================================
  // قراءة تاريخ + وقت بصيغة مرنة (date + time معًا)
  // ==================================================
  function parseDateTimeFlexible(str, extraTime) {
    if (!str) return null;

    var parts = str.split(' ');
    var datePart = parts[0];
    var timePart = parts[1] || extraTime;

    return toDateTime(datePart, timePart);
  }

  // ==================================================
  // Arrival / Departure
  // ==================================================
  var arrival = toDateTime(data.arrivalDate, data.arrivalTime);
  var departure = toDateTime(data.departureDate, data.departureTime);

  // 🛡️ وضع "التساهل مع المسودة" (strict=false، الافتراضي لـ saveTripDraft): وقت إنشاء الرحلة
  // للتسويق قد لا تكون تواريخ الوصول/المغادرة مُدخَلة بعد — هذا وضع طبيعي متوقَّع، فلا نمنع حفظ
  // المسودة بسببه. لكن لو التواريخ الأساسية موجودة، نكمل فحص التحركات الفعلية كالمعتاد بحثاً عن
  // أي تعارض منطقي حقيقي حتى في المسودة (هذا ما كان مفقوداً بالكامل من قبل لمسار المسودات)
  if (!arrival || !departure) {
    if (data.__strictDates__) {
      return _err_('BAD_ARRIVAL_DEPARTURE', 'تواريخ الوصول والمغادرة غير مكتملة',
        'تواريخ الوصول أو المغادرة غير صحيحة أو غير مكتملة — تأكد من إدخال التاريخ والساعة في الحقلين قبل الحفظ.');
    }
    return null; // مسودة بلا تواريخ أساسية بعد — لا شيء نتحقق منه حالياً، هذا متوقَّع وليس خطأ
  }

  // ==================================================
  // الفنادق
  // ==================================================
  var madinahStart = parseDateTimeFlexible(data.madinahCheckIn);
  var madinahEnd = parseDateTimeFlexible(data.madinahCheckOut);
  var makkahStart = parseDateTimeFlexible(data.makkahCheckIn);
  var makkahEnd = parseDateTimeFlexible(data.makkahCheckOut);

  // ==================================================
  // التحركات الإضافية
  // ==================================================
  var extra = [];
  try {
    extra = data.extraMovements || [];
    if (typeof extra === "string") {
      extra = JSON.parse(extra);
    }
  } catch (e) {
    return _err_('BAD_MOVEMENTS_JSON', 'تعذّرت قراءة بيانات التحركات',
      'يوجد خطأ في تنسيق بيانات التحركات الإضافية ولا يمكن قراءتها — جرّب حذف آخر تحرك أضفته وإعادة إدخاله.');
  }

  // ==================================================
  // ترتيب زمني دقيق
  // ==================================================
  // 🛡️ حماية: أي حركة إضافية بلا تاريخ (خانة فاضية نسيها المستخدم) كانت بتخلي parseDateTimeFlexible
  // يرجّع null، وبعدين .getTime() على null بيرمي استثناء يوقف الحفظ بالكامل بصمت تام (بدون أي رسالة
  // تصل للواجهة، لأن الخطأ بيحصل جوه الفانكشن قبل ما توصل لأي return { success:false, error: ... }) —
  // فبدل ما نخليها تنهار، نتحقق الأول ونرجّع رسالة تفصيلية توضح بالظبط أي حركة ناقصة تاريخها
  for (var _mi = 0; _mi < extra.length; _mi++) {
    if (!parseDateTimeFlexible(extra[_mi].date, extra[_mi].movementTime || extra[_mi].time)) {
      return _err_('MISSING_MOVEMENT_DATE', 'حركة بلا تاريخ محدد',
        'الحركة "' + (extra[_mi].type || 'بلا نوع') + '" لم يُحدَّد لها تاريخ — أكمل التاريخ أو احذف هذه الحركة الفارغة قبل الحفظ.',
        { movementType: extra[_mi].type || '', movementIndex: _mi });
    }
  }
  extra.sort(function (a, b) {
    var d1 = parseDateTimeFlexible(a.date, a.movementTime || a.time).getTime();
    var d2 = parseDateTimeFlexible(b.date, b.movementTime || b.time).getTime();
    return d1 - d2;
  });

  // ==================================================
  // 🏨 (V4.03 — الخيار ب) مقاطع الإقامة الإضافية: رحلة قد تعود لنفس المدينة مرة أخرى
  // (مكة ← المدينة ← مكة). الحقول الأساسية = أول إقامة بكل مدينة، وكل عودة لاحقة تُسجَّل
  // كتحرك من نوع «إقامة إضافية بمكة/بالمدينة» بتاريخي من/إلى. المحرك يبني الجدول الزمني
  // الكامل من كل المقاطع ويتحقق من الاتصال الزمني بدل رفض الرحلات متعددة المقاطع المنطقية.
  // ==================================================
  var STAY_MAK = 'إقامة إضافية بمكة', STAY_MAD = 'إقامة إضافية بالمدينة';
  var madIntervals = [], makIntervals = [];

  // 🧭 (V4.04) الاشتقاق التلقائي للجدول الزمني من تحركات الانتقال بين المدينتين:
  // لو سُجّلت انتقالات (من مكة الى المدينة / العكس) فهي وحدها تحدد فترات التواجد —
  // المدينة الأولى من الاتجاه، وكل انتقال يبدّل المدينة، والفترات: وصول→انتقال1→انتقال2→…→مغادرة.
  // بهذا تُقبل رحلة (مكة ← المدينة ← مكة مرة أخرى) بشكل طبيعي تمامًا.
  var _cityTransfers = [];
  extra.forEach(function(mm) {
    var tt = (mm.type || '').trim();
    if (tt === STAY_MAK || tt === STAY_MAD) return;
    var isFromMak = tt.indexOf('من مكة') > -1 && (tt.indexOf('المدينة') > -1 || tt.indexOf('مدينة') > -1);
    var isFromMad = (tt.indexOf('من المدينة') > -1 || tt.indexOf('من مدينة') > -1) && tt.indexOf('مكة') > -1;
    if (!isFromMak && !isFromMad) return;
    var dtt = parseDateTimeFlexible(mm.date, mm.movementTime || mm.time);
    if (!dtt) return;
    _cityTransfers.push({ dt: dtt, origin: isFromMak ? 'مكة' : 'المدينة' });
  });
  _cityTransfers.sort(function(a, b) { return a.dt - b.dt; });

  var _derivedOk = false;
  if (_cityTransfers.length && (data.direction === 'المدينة أولاً' || data.direction === 'مكة أولاً')) {
    var _cur = (data.direction === 'المدينة أولاً') ? 'المدينة' : 'مكة';
    var _segStart = arrival, _consistent = true;
    var _tmpMad = [], _tmpMak = [];
    for (var _ct = 0; _ct < _cityTransfers.length; _ct++) {
      if (_cityTransfers[_ct].origin !== _cur) { _consistent = false; break; } // انتقال من مدينة ليس بها — الحلقة الرئيسية سترفع الخطأ التفصيلي
      (_cur === 'المدينة' ? _tmpMad : _tmpMak).push([_segStart, _cityTransfers[_ct].dt]);
      _cur = (_cur === 'المدينة') ? 'مكة' : 'المدينة';
      _segStart = _cityTransfers[_ct].dt;
    }
    if (_consistent) {
      (_cur === 'المدينة' ? _tmpMad : _tmpMak).push([_segStart, departure]);
      madIntervals = _tmpMad;
      makIntervals = _tmpMak;
      _derivedOk = true;
    }
  }
  if (!_derivedOk) {
    if (madinahStart && madinahEnd) madIntervals.push([madinahStart, madinahEnd]);
    if (makkahStart && makkahEnd) makIntervals.push([makkahStart, makkahEnd]);
  }
  var stayCount = 0;
  for (var _si = 0; _si < extra.length; _si++) {
    var _sm = extra[_si];
    var _st = (_sm.type || '').trim();
    if (_st !== STAY_MAK && _st !== STAY_MAD) continue;
    stayCount++;
    var _sFrom = parseDateTimeFlexible(_sm.date);
    var _sTo = parseDateTimeFlexible(_sm.toDate);
    if (!_sFrom || !_sTo) {
      return _err_('STAY_DATES_MISSING', 'مقطع إقامة بلا تاريخين',
        'المقطع "' + _st + '" يحتاج تاريخ بداية وتاريخ نهاية معاً — أكمل التاريخين أو احذف المقطع.',
        { movementType: _st });
    }
    if (_sTo.getTime() <= _sFrom.getTime()) {
      return _err_('STAY_RANGE_INVALID', 'مدى مقطع الإقامة غير صحيح',
        'نهاية المقطع "' + _st + '" (' + _fmtDT_(_sTo) + ') يجب أن تكون بعد بدايته (' + _fmtDT_(_sFrom) + ').',
        { movementType: _st });
    }
    (_st === STAY_MAD ? madIntervals : makIntervals).push([_sFrom, _sTo]);
  }
  var _dayOf_ = function(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  var _inAny_ = function(intervals, dt) {
    for (var q = 0; q < intervals.length; q++) {
      if (dt >= intervals[q][0] && dt <= intervals[q][1]) return true;
    }
    return false;
  };
  // عند وجود مقاطع إضافية: تحقق اتصال الجدول الزمني كاملاً — يبدأ يوم الوصول، بلا فجوات
  // ولا تداخل بين المقاطع (نهاية كل مقطع = بداية التالي بنفس اليوم)، وينتهي يوم المغادرة
  if (stayCount > 0) {
    var segs = madIntervals.map(function(iv) { return { s: iv[0], e: iv[1], city: 'المدينة' }; })
      .concat(makIntervals.map(function(iv) { return { s: iv[0], e: iv[1], city: 'مكة' }; }))
      .sort(function(a, b) { return a.s - b.s; });
    if (segs.length) {
      if (_dayOf_(segs[0].s) !== _dayOf_(arrival)) {
        return _err_('TIMELINE_START_MISMATCH', 'بداية الإقامات لا تطابق الوصول',
          'أول مقطع إقامة (' + segs[0].city + ' من ' + _fmtDT_(segs[0].s) + ') لا يبدأ يوم الوصول (' + _fmtDT_(arrival) + ') — عدّل تواريخ السكن حتى يتصل الجدول الزمني.');
      }
      for (var sg = 1; sg < segs.length; sg++) {
        if (_dayOf_(segs[sg].s) !== _dayOf_(segs[sg - 1].e)) {
          return _err_('TIMELINE_GAP', 'فجوة أو تداخل بين مقاطع الإقامة',
            'مقطع ' + segs[sg - 1].city + ' ينتهي ' + _fmtDT_(segs[sg - 1].e) + ' بينما المقطع التالي (' + segs[sg].city + ') يبدأ ' + _fmtDT_(segs[sg].s) + ' — يجب أن تكون نهاية كل مقطع هي نفس يوم بداية المقطع التالي.');
        }
      }
      if (_dayOf_(segs[segs.length - 1].e) !== _dayOf_(departure)) {
        return _err_('TIMELINE_END_MISMATCH', 'نهاية الإقامات لا تطابق المغادرة',
          'آخر مقطع إقامة (' + segs[segs.length - 1].city + ') ينتهي ' + _fmtDT_(segs[segs.length - 1].e) + ' بينما المغادرة ' + _fmtDT_(departure) + ' — عدّل التواريخ حتى يتصل الجدول الزمني.');
      }
    }
  }

  var trackedLocation = "";

  // ==================================================
  // الحلقة الرئيسية
  // ==================================================
  for (var i = 0; i < extra.length; i++) {

    var m = extra[i];

    var moveDate = parseDateTimeFlexible(m.date, m.time);

    if (!moveDate) continue;

    var type = (m.type || "").trim();
    var moveDateLabel = m.date + (m.time ? (' ' + m.time) : '');

    // 🏨 مقاطع الإقامة الإضافية سبق التحقق منها ببناء الجدول الزمني أعلاه — ليست «حركة» هنا
    if (type === STAY_MAK || type === STAY_MAD) continue;

    // ==================================================
    // 1. خارج مدة الرحلة (بدقة الساعة)
    // ==================================================
    if (moveDate.getTime() < arrival.getTime()) {
      return _err_('MOVEMENT_BEFORE_ARRIVAL', 'حركة قبل موعد الوصول',
        'الحركة "' + type + '" مؤرَّخة قبل وصول المعتمرين فعلياً — تحقق من التاريخ المُدخَل لهذه الحركة.',
        { movementType: type, movementDate: moveDateLabel, referenceLabel: 'وقت الوصول', referenceDate: _fmtDT_(arrival) });
    }

    if (moveDate.getTime() > departure.getTime()) {
      return _err_('MOVEMENT_AFTER_DEPARTURE', 'حركة بعد موعد المغادرة',
        'الحركة "' + type + '" مؤرَّخة بعد مغادرة المعتمرين فعلياً — تحقق من التاريخ المُدخَل لهذه الحركة.',
        { movementType: type, movementDate: moveDateLabel, referenceLabel: 'وقت المغادرة', referenceDate: _fmtDT_(departure) });
    }

    // ==================================================
    // 2. تحديد الموقع المتوقع
    // ==================================================
    var currentExpectedLocation = "";

    // 🧭 لتحركات الانتقال على يوم حدود بين مقطعين (المعتمر بالمدينتين حسابياً في نفس اليوم):
    // مدينة المنشأ المذكورة في نوع التحرك هي الحاسمة لو كانت فترات إقامتها تشمل هذا التاريخ
    var _origin = type.indexOf('من مكة') > -1 ? 'مكة'
      : (type.indexOf('من المدينة') > -1 || type.indexOf('من مدينة') > -1) ? 'المدينة' : '';

    if (trackedLocation !== "") {

      currentExpectedLocation = trackedLocation;

    } else if (_origin && _inAny_(_origin === 'مكة' ? makIntervals : madIntervals, moveDate)) {

      currentExpectedLocation = _origin;

    } else if (_inAny_(madIntervals, moveDate)) {

      currentExpectedLocation = "المدينة";

    } else if (_inAny_(makIntervals, moveDate)) {

      currentExpectedLocation = "مكة";

    } else {

      currentExpectedLocation =
        (type.includes("المدينة") || type.includes("مدينة")) ? "المدينة" : "مكة";
    }

    // ==================================================
    // 3. انتقال بين المدن
    // ==================================================
    if (type.includes("إلى") || type.includes("من")) {

      if (type.includes("مكة") && (type.includes("المدينة") || type.includes("مدينة"))) {

        if (type.indexOf("مكة") < type.indexOf("المدينة") || type.includes("من مكة")) {

          if (currentExpectedLocation !== "مكة") {
            return _err_('CITY_TRANSFER_MISMATCH', 'تحرك غير منطقي بين المدينتين',
              'لا يمكن تسجيل تحرك من مكة بينما المعتمر في ' + currentExpectedLocation + ' وقت هذه الحركة — تحقق من ترتيب التواريخ.',
              { movementType: type, movementDate: moveDateLabel, currentLocation: currentExpectedLocation });
          }

          trackedLocation = "المدينة";

        } else {

          if (currentExpectedLocation !== "المدينة") {
            return _err_('CITY_TRANSFER_MISMATCH', 'تحرك غير منطقي بين المدينتين',
              'لا يمكن تسجيل تحرك من المدينة بينما المعتمر في ' + currentExpectedLocation + ' وقت هذه الحركة — تحقق من ترتيب التواريخ.',
              { movementType: type, movementDate: moveDateLabel, currentLocation: currentExpectedLocation });
          }

          trackedLocation = "مكة";
        }
      }

      continue;
    }

    // ==================================================
    // 4. مزارات المدينة
    // ==================================================
    if (type.includes("المدينة") || type.includes("مدينة")) {

      if (currentExpectedLocation !== "المدينة") {
        return _err_('MADINAH_TOUR_MISMATCH', 'مزارات المدينة في غير موضعها',
          'الحركة "' + type + '" مسجَّلة أثناء تواجد المعتمر في ' + currentExpectedLocation + '، وليس المدينة — تحقق من تاريخ هذه المزارات.',
          { movementType: type, movementDate: moveDateLabel, currentLocation: currentExpectedLocation });
      }

      // 🛡️ لو تاريخ دخول فندق المدينة غير مُدخَل بعد، moveDate < null كانت بترمي استثناء صامت —
      // الآن رسالة واضحة بدل الكراش
      if (!madIntervals.length) {
        return _err_('MADINAH_HOTEL_DATE_MISSING', 'تاريخ فندق المدينة غير محدَّد',
          'لا يمكن التحقق من حركة "' + type + '" لأن تاريخ دخول فندق المدينة غير مُدخَل بعد — أكمله أولاً في قسم بيانات الفندق.',
          { movementType: type });
      }
      if (moveDate < madIntervals[0][0]) {
        return _err_('MADINAH_TOUR_BEFORE_CHECKIN', 'مزارات قبل الوصول للفندق',
          'الحركة "' + type + '" مؤرَّخة قبل موعد دخول فندق المدينة — تحقق من التاريخ.',
          { movementType: type, movementDate: moveDateLabel, referenceLabel: 'دخول فندق المدينة', referenceDate: _fmtDT_(madIntervals[0][0]) });
      }
    }

    // ==================================================
    // 5. مزارات مكة
    // ==================================================
    if (type.includes("مكة")) {

      if (currentExpectedLocation !== "مكة") {
        return _err_('MAKKAH_TOUR_MISMATCH', 'مزارات مكة في غير موضعها',
          'الحركة "' + type + '" مسجَّلة أثناء تواجد المعتمر في ' + currentExpectedLocation + '، وليس مكة — تحقق من تاريخ هذه المزارات.',
          { movementType: type, movementDate: moveDateLabel, currentLocation: currentExpectedLocation });
      }

      // 🛡️ نفس الحماية لو تاريخ دخول فندق مكة غير مُدخَل بعد
      if (!makIntervals.length) {
        return _err_('MAKKAH_HOTEL_DATE_MISSING', 'تاريخ فندق مكة غير محدَّد',
          'لا يمكن التحقق من حركة "' + type + '" لأن تاريخ دخول فندق مكة غير مُدخَل بعد — أكمله أولاً في قسم بيانات الفندق.',
          { movementType: type });
      }
      if (moveDate < makIntervals[0][0]) {
        return _err_('MAKKAH_TOUR_BEFORE_CHECKIN', 'مزارات قبل الوصول للفندق',
          'الحركة "' + type + '" مؤرَّخة قبل موعد دخول فندق مكة — تحقق من التاريخ.',
          { movementType: type, movementDate: moveDateLabel, referenceLabel: 'دخول فندق مكة', referenceDate: _fmtDT_(makIntervals[0][0]) });
      }
    }
  }

  return null;
}

// تنسيق تاريخ+وقت JS Date لعرضه بالعربي داخل رسائل الخطأ المُهيكَلة أعلاه
function _fmtDT_(d) {
  if (!d) return '';
  var dd = ('0' + d.getDate()).slice(-2);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  var yyyy = d.getFullYear();
  var hh = ('0' + d.getHours()).slice(-2);
  var mi = ('0' + d.getMinutes()).slice(-2);
  return dd + '/' + mm + '/' + yyyy + ' — ' + hh + ':' + mi;
}


// ملاحظة: getAllBookings و getAllMovements تم نقلهما إلى قسم Cache أعلاه


// 1. تعديل دالة جلب القوائم المنسدلة لتقرأ من ورقة Agents_Settings المحددة لديك
function loadDropdownsData(authToken) {
  requireAuth_(authToken);

  // قراءة من Cache أولاً
  var cached = getCachedData('dropdowns_cache');
  if (cached) return cached;


  // الكود الخاص بجلب البيانات من ورقة Agents_Settings
  var ss = getSpreadsheet_();
  var settingsSheet = ss.getSheetByName("Agents_Settings");  
  var agents = [];
  var companies = [];
  
  if (settingsSheet) {
    var lastRow = settingsSheet.getLastRow();
    if (lastRow > 1) {
      // جلب العمود الأول (الوكلاء) والعمود الثاني (الشركات المصرية) دفعة واحدة
      var data = settingsSheet.getRange(2, 1, lastRow - 1, 2).getValues();
      data.forEach(function(row) {
        if (row[0]) agents.push(row[0].toString().trim());
        if (row[1]) companies.push(row[1].toString().trim());
      });
    }
  }
  
  // إزالة التكرار إن وجد لضمان نظافة القوائم المنسدلة
  agents = agents.filter(function(item, pos) { return agents.indexOf(item) == pos; });
  companies = companies.filter(function(item, pos) { return companies.indexOf(item) == pos; });
  
  var result = { agents: agents, companies: companies };
  setCachedData('dropdowns_cache', result);   // ← كتابة الـ Cache
  return result;
}


function toggleApprovalStatus(authToken, id, newStatus) {
  requireAuth_(authToken);

  // 🛡️ بوابة الاعتماد: قبل تحويل أي إشعار إلى "معتمد" (سواء أُدخل يدويًا أو عبر بوت تليجرام)
  // تُعاد نفس فحوصات الحفظ/التحديث كاملة على بيانات الإشعار المخزَّنة فعليًا في الشيت:
  // الحقول الإلزامية المعرَّفة في الإعدادات + منطقية التحركات بالوضع الصارم للتواريخ.
  // أي فشل يمنع الاعتماد ويعيد سبب الرفض للواجهة (لا يتغير شيء عند إلغاء الاعتماد).
  if (newStatus === "معتمد") {
    var allBookings = getAllBookings(); // نفس التطبيع المرسل للواجهة (تواريخ dd/mm/yyyy وأوقات HH:mm)
    var bk = null;
    for (var b = 0; b < allBookings.length; b++) {
      if (allBookings[b].id && allBookings[b].id.toString() === id.toString()) { bk = allBookings[b]; break; }
    }
    if (!bk) return { success: false, error: "الإشعار غير موجود" };

    // 🧾 نجمع «كل» المشاكل معًا (لا نتوقف عند أول واحدة) حتى تظهر للمستخدم قائمة كاملة يصححها دفعة واحدة
    var approveErrors = [];
    var requiredCheck = validateRequiredFields_(bk);
    if (requiredCheck) approveErrors.push(requiredCheck);

    bk.__strictDates__ = true;
    var validationError = validateMovementsLogic(bk);
    if (validationError) approveErrors.push(validationError.title + ': ' + validationError.detail);

    if (approveErrors.length) {
      return {
        success: false,
        error: "لا يمكن اعتماد الإشعار قبل استكمال/تصحيح ما يلي:\n• " + approveErrors.join("\n• "),
        errors: approveErrors,
        errorDetails: validationError || null
      };
    }
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Bookings");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString() === id.toString()) {
      sheet.getRange(i + 1, 1).setValue(newStatus);
      clearAllCache(); // امسح الـ Cache بعد التعديل
      return { success: true };
    }
  }
  return { success: false, error: "الإشعار غير موجود" };
}

// حذف إشعار وصول نهائياً + كل تحركاته المرتبطة — يتطلب صلاحية DELETE أو admin/ALL
function deleteBookingRecord(authToken, id) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, "bookings.delete")) {
    return { success: false, error: "لا تملك صلاحية حذف الإشعارات" };
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Bookings");
  // 🔧 (V4.50) استخدام خريطة الأعمدة بالاسم بدل ثوابت الترتيب — يحمي من إعادة ترتيب الأعمدة
  // وأي فلترة/إخفاء عرضي في الشيت لن يُضلل البحث عن رقم الإشعار — بطلب صريح
  var C = _robustColMap_(sheet, BOOKINGS_HEADERS_);
  var B = _cellReader_(C, BOOKINGS_COL_);
  var idCol = C[BOOKINGS_COL_.id];
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowId = idCol !== undefined ? data[i][idCol] : data[i][1];
    if (rowId && rowId.toString() === id.toString()) {
      var company = B(data[i], 'company') || "";
      var client = B(data[i], 'client') || "";

      sheet.deleteRow(i + 1);
      deleteBookingMovements(id);
      // 🔧 (V4.50) فرض تطبيق الحذف فوراً قبل مسح الـ Cache — بدونه القراءة التالية قد تعيد الصف
      // من قراءة متزامنة بدأت قبل flush
      SpreadsheetApp.flush();
      clearAllCache();

      logChange_(session.username, "حذف إشعار", id, "-", "-",
        "تم حذف إشعار الوصول رقم " + id + " (" + company + " - " + client + ") نهائياً مع كل تحركاته");

      return { success: true };
    }
  }

  return { success: false, error: "الإشعار غير موجود" };
}











function cleanMovementTime(timeVal) {

  if (!timeVal) return "00:00";

  // لو الوقت نص
  if (typeof timeVal === "string") {

    var m = timeVal.match(/(\d{1,2}):(\d{2})/);

    if (m) {
      return ("0" + m[1]).slice(-2) + ":" + m[2];
    }

    return timeVal;
  }

  // لو Date Object
  try {

    var d = new Date(timeVal);

    var h = ("0" + d.getHours()).slice(-2);

    var min = ("0" + d.getMinutes()).slice(-2);

    return h + ":" + min;

  } catch(err) {

    return "00:00";

  }
}


function searchBookingsAdvanced(authToken, filters) {
  requireAuth_(authToken);

  var allMovements = getAllMovements();

  var results = [];

  // ===============================
  // تحويل التاريخ لنقطة زمنية للمقارنة
  // ===============================
  function toTime(dateStr) {

    if (!dateStr) return null;

    var p = dateStr.split("/");

    if (p.length !== 3) return null;

    return new Date(
      parseInt(p[2], 10),
      parseInt(p[1], 10) - 1,
      parseInt(p[0], 10)
    ).getTime();
  }

  // ===============================
  // توحيد التواريخ القادمة من الفلاتر
  // ===============================
  var startTime =
    filters.startDate
      ? toTime(filters.startDate)
      : null;

  var endTime =
    filters.endDate
      ? toTime(filters.endDate)
      : null;

  allMovements.forEach(function(m){

    // =====================================
    // فلترة تاريخ التحرك المحدد
    // =====================================
    if (filters.movementDate) {

      var fDate =
        filters.movementDate.toString().trim();

      if (m.movementDate !== fDate)
        return;
    }

    // =====================================
    // فلترة الوكيل
    // =====================================
    if (
      filters.agent &&
      m.agent !== filters.agent
    ) {
      return;
    }

    // =====================================
    // الفلترة النصية
    // =====================================
    if (filters.client) {

      var txt =
        filters.client.toLowerCase();

      var found =

        (m.client || "")
          .toLowerCase()
          .includes(txt)

        ||

        (m.company || "")
          .toLowerCase()
          .includes(txt)

        ||

        (m.supervisor || "")
          .toLowerCase()
          .includes(txt);

      if (!found)
        return;
    }

    // =====================================
    // فلترة الفترة الزمنية
    // =====================================

    if (startTime || endTime) {

      var moveTime =
        toTime(m.movementDate);

      if (!moveTime)
        return;

      // لو يوجد بداية فقط
      if (
        startTime &&
        !endTime &&
        moveTime < startTime
      ) {
        return;
      }

      // لو يوجد نهاية فقط
      if (
        endTime &&
        !startTime &&
        moveTime > endTime
      ) {
        return;
      }

      // لو يوجد بداية ونهاية
      if (
        startTime &&
        endTime &&
        (
          moveTime < startTime ||
          moveTime > endTime
        )
      ) {
        return;
      }
    }

    // =====================================
    // إضافة النتيجة
    // =====================================
    results.push({

      id: m.bookingId,

      movementDate: m.movementDate,

      movementTime: m.movementTime,

      movementType: m.movementType,

      buses: m.buses,

      agent: m.agent,

      company: m.company,

      client: m.client,

      supervisor: m.supervisor,

      count: m.count
    });

  });

  // =====================================
  // ترتيب النتائج
  // =====================================
  results.sort(function(a, b) {

    var d1 =
      toTime(a.movementDate);

    var d2 =
      toTime(b.movementDate);

    if (d1 !== d2)
      return d1 - d2;

    var t1 =
      a.movementTime || "00:00";

    var t2 =
      b.movementTime || "00:00";

    return t1.localeCompare(t2);

  });

  return results;
}


// ============================================================
// 🧭 (V4.05) المشتق الموحد لمقاطع الرحلة — مصدر الحقيقة الوحيد لبيان التحركات
// يبني المقاطع من: الوصول + الاتجاه + انتقالات المدن المُدخلة + المغادرة.
// derived=true → المولّدات تستخدم المقاطع (سطر انتقال واحد لكل حدود، بفنادق الطرفين،
// والمغادرة من مدينة آخر مقطع فعلي) وتمتص انتقالات المستخدم فلا تتكرر أبدًا.
// بلا انتقالات مُدخلة → derived=false والسلوك القديم كما هو حرفيًا.
// ============================================================
function _deriveStaySegments_(b) {
  var extras = b.extraMovements || [];
  if (typeof extras === 'string') { try { extras = JSON.parse(extras); } catch (e) { extras = []; } }
  if (!Array.isArray(extras)) extras = [];
  var originOf = function(t) {
    t = String(t || '').trim();
    if (t.indexOf('من مكة') > -1 && (t.indexOf('المدينة') > -1 || t.indexOf('مدينة') > -1)) return 'مكة';
    if ((t.indexOf('من المدينة') > -1 || t.indexOf('من مدينة') > -1) && t.indexOf('مكة') > -1) return 'المدينة';
    return '';
  };
  var toMs = function(ds, ts) {
    var m = String(ds || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var t = String(ts || '').match(/^(\d{1,2}):(\d{2})/);
    return new Date(+m[3], +m[2] - 1, +m[1], t ? +t[1] : 0, t ? +t[2] : 0).getTime();
  };
  var transfers = [], others = [];
  extras.forEach(function(mv) {
    var o = originOf(mv.type);
    var ms = toMs(mv.date, mv.time);
    if (o && ms !== null) transfers.push({ date: mv.date, time: mv.time || '', buses: mv.buses || '', origin: o, ms: ms });
    else others.push(mv);
  });
  transfers.sort(function(a, b2) { return a.ms - b2.ms; });
  var start = (b.direction === 'المدينة أولاً') ? 'المدينة' : 'مكة';
  if (!transfers.length || (b.direction !== 'المدينة أولاً' && b.direction !== 'مكة أولاً')) {
    return { derived: false, others: others, transfers: [] };
  }
  var segs = [], cur = start, sDate = b.arrivalDate || '';
  for (var i = 0; i < transfers.length; i++) {
    if (transfers[i].origin !== cur) return { derived: false, others: others, transfers: [] }; // تسلسل غير متسق — التحقق سيرفضه برسالته
    segs.push({ city: cur, s: sDate, e: transfers[i].date });
    transfers[i].from = cur;
    cur = (cur === 'المدينة') ? 'مكة' : 'المدينة';
    transfers[i].to = cur;
    sDate = transfers[i].date;
  }
  segs.push({ city: cur, s: sDate, e: b.departureDate || '' });
  return { derived: true, segments: segs, transfers: transfers, others: others, firstCity: start, lastCity: cur };
}

function buildAllMovements(bookingData) {

  var movements = [];

  // عدد الباصات
  var mainBuses = bookingData.busCount || bookingData.buses || "";

  // أسماء المواقع
  var arrivalPort = _portSaudiSide_(bookingData.arrivalPort || "", 'arrival');
  var arrivalFlight = bookingData.arrivalFlight || "";

  var departurePort = _portSaudiSide_(bookingData.departurePort || "", 'departure');
  var departureFlight = bookingData.departureFlight || "";

  var madinahHotel = bookingData.madinahHotel || "";
  var makkahHotel = bookingData.makkahHotel || "";

  // 🧭 (V4.05) المسار الموحد: انتقالات مدن مُدخلة → المقاطع تولّد البيان كله (بلا تكرار، والمغادرة من آخر مقطع فعلي)
  var dv = _deriveStaySegments_(bookingData);
  if (dv.derived) {
    var hotelOf = function(c) { return c === 'المدينة' ? (madinahHotel || 'غير محدد') : (makkahHotel || 'غير محدد'); };
    movements.push({
      date: bookingData.arrivalDate, time: bookingData.arrivalTime,
      type: 'استقبال وصول من ' + arrivalPort + ' على رحلة رقم ' + arrivalFlight + ' إلى ' + dv.firstCity + ' (' + hotelOf(dv.firstCity) + ')',
      buses: mainBuses
    });
    dv.transfers.forEach(function(tr, ti) {
      movements.push({
        date: tr.date,
        time: tr.time || (ti === 0 ? (bookingData.internalTransferTime || '') : ''),
        type: 'التحرك من ' + tr.from + ' (' + hotelOf(tr.from) + ') إلى ' + tr.to + ' (' + hotelOf(tr.to) + ')',
        buses: tr.buses || mainBuses
      });
    });
    movements.push({
      date: bookingData.departureDate, time: bookingData.departureTime,
      type: 'التوجه إلى ' + departurePort + ' للمغادرة على رحلة رقم ' + departureFlight + ' من ' + dv.lastCity + ' (' + hotelOf(dv.lastCity) + ')',
      buses: mainBuses
    });
    // التحركات غير الانتقالية فقط (المزارات وغيرها) — الانتقالات مُثِّلت أعلاه بتفاصيلها فلا تُكرَّر
    dv.others.forEach(function(m) {
      movements.push({ date: m.date || '', time: m.time || '', type: m.type || m.movementType || '', buses: m.buses || m.busCount || mainBuses });
    });
    movements.sort(function(a, b2) {
      var pk = function(o) {
        var m = String(o.date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return 8640000000000000;
        var t = String(o.time || '').match(/^(\d{1,2}):(\d{2})/);
        return new Date(+m[3], +m[2] - 1, +m[1], t ? +t[1] : 0, t ? +t[2] : 0).getTime();
      };
      return pk(a) - pk(b2);
    });
    return movements;
  }

  if (bookingData.direction === "المدينة أولاً") {

    // استقبال المدينة
    movements.push({
      date: bookingData.arrivalDate,
      time: bookingData.arrivalTime,
      type:
        "استقبال وصول من " +
        arrivalPort +
        " على رحلة رقم " +
        arrivalFlight +
        " إلى المدينة (" +
        madinahHotel +
        ")",
      buses: mainBuses
    });

    // الانتقال إلى مكة
    movements.push({
      date: bookingData.internalTransferDate || bookingData.madinahCheckOut,
      time: bookingData.internalTransferTime || "",
      type:
        "التحرك من المدينة (" +
        madinahHotel +
        ") إلى مكة (" +
        makkahHotel +
        ")",
      buses: mainBuses
    });

    // المغادرة من مكة
    movements.push({
      date: bookingData.departureDate,
      time: bookingData.departureTime,
      type:
        "التوجه إلى " +
        departurePort +
        " للمغادرة على رحلة رقم " +
        departureFlight +
        " من مكة (" +
        makkahHotel +
        ")",
      buses: mainBuses
    });

  } else if (bookingData.direction === "مكة أولاً") {

    // استقبال مكة
    movements.push({
      date: bookingData.arrivalDate,
      time: bookingData.arrivalTime,
      type:
        "استقبال وصول من " +
        arrivalPort +
        " على رحلة رقم " +
        arrivalFlight +
        " إلى مكة (" +
        makkahHotel +
        ")",
      buses: mainBuses
    });

    // الانتقال إلى المدينة
    movements.push({
      date: bookingData.internalTransferDate || bookingData.makkahCheckOut,
      time: bookingData.internalTransferTime || "",
      type:
        "التحرك من مكة (" +
        makkahHotel +
        ") إلى المدينة (" +
        madinahHotel +
        ")",
      buses: mainBuses
    });

    // المغادرة من المدينة
    movements.push({
      date: bookingData.departureDate,
      time: bookingData.departureTime,
      type:
        "التوجه إلى " +
        departurePort +
        " للمغادرة على رحلة رقم " +
        departureFlight +
        " من المدينة (" +
        madinahHotel +
        ")",
      buses: mainBuses
    });

  } else if (bookingData.direction === "مكة فقط" || bookingData.direction === "المدينة فقط") {
    // 🏙️ (V4.16) إقامة أحادية المدينة — بلا أي تحرك داخلي: الوصول والمغادرة لنفس المدينة فقط
    var _onlyCity = (bookingData.direction === "مكة فقط") ? "مكة" : "المدينة";
    var _onlyHotel = (_onlyCity === "مكة") ? makkahHotel : madinahHotel;
    movements.push({
      date: bookingData.arrivalDate,
      time: bookingData.arrivalTime,
      type: "استقبال وصول من " + arrivalPort + " على رحلة رقم " + arrivalFlight + " إلى " + _onlyCity + " (" + _onlyHotel + ")",
      buses: mainBuses
    });
    movements.push({
      date: bookingData.departureDate,
      time: bookingData.departureTime,
      type: "التوجه إلى " + departurePort + " للمغادرة على رحلة رقم " + departureFlight + " من " + _onlyCity + " (" + _onlyHotel + ")",
      buses: mainBuses
    });
  }

  // التحركات الإضافية
  var extra = bookingData.extraMovements || [];

  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra);
    } catch (e) {
      extra = [];
    }
  }

  extra.forEach(function(m) {

    var movementText = m.type || m.movementType || "";

    // تحسين أسماء التحركات الشائعة القديمة
    if (movementText === "من مكة الى المدينة") {
      movementText =
        "التحرك من مكة (" +
        makkahHotel +
        ") إلى المدينة (" +
        madinahHotel +
        ")";
    }

    if (movementText === "من المدينة الى مكة") {
      movementText =
        "التحرك من المدينة (" +
        madinahHotel +
        ") إلى مكة (" +
        makkahHotel +
        ")";
    }

    movements.push({
      date: m.date || "",
      time: m.time || "",
      type: movementText,
      buses: m.buses || m.busCount || ""
    });

  });

  return movements;
}


function deleteBookingMovements(bookingId) {

  var sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Movements");

  var data = sheet.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {

    if (
      data[i][1] &&
      data[i][1].toString() === bookingId.toString()
    ) {

      sheet.deleteRow(i + 1);
    }
  }
}



// getAllMovements تم نقلها إلى قسم Cache أعلاه



// ====== دالة جلب بيانات الطباعة واللوجو من السيرفر ======





function getWebAppUrl(authToken) {
  requireAuth_(authToken);

  return ScriptApp.getService().getUrl();
}






/* ============================================================
   🖨️ قالب إشعار الوصول للطباعة والمشاركة معاً — المصدر الوحيد لتصميم الإشعار في النظام كله
   مطابق بالحرف لـ renderReport القديم — يستخدم inline styles و bgcolor attributes
   لضمان ظهور الألوان والأشرطة بشكل صحيح في محوّل PDF بتاع Google (اللي بيتجاهل CSS classes للخلفيات)

   📞 يُستدعى من:
     - doGet (page=print) → asFragment=true  → يُحقن مباشرة في print_view.html
     - generateBookingPdfForShare           → asFragment=false → مستند كامل يتحوّل PDF للمشاركة
   ⚠️ أي تعديل تصميم هنا بينعكس تلقائياً على الطباعة والمشاركة معاً — لا يوجد قالب منفصل لأي منهما
   ============================================================ */
/**
 * يستخرج الطرف السعودي فقط من قيمة المنفذ المركّبة (مثل "مطار القاهرة → مطار جدة")
 * منفذ الوصول: الطرف الأخير (الوجهة داخل السعودية) — منفذ المغادرة: الطرف الأول (نقطة الانطلاق من السعودية)
 * @param {string} portVal القيمة الخام
 * @param {string} which 'arrival' أو 'departure'
 */
function _portSaudiSide_(portVal, which) {
  var s = String(portVal || "").trim();
  if (!s) return "";
  var parts = s.split(/\s*→\s*|\s*←\s*|\s*⟶\s*|\s*⟵\s*|\s+-\s+|\s*\/\s*|\s+—\s+|\s+–\s+/)
               .map(function(x){ return x.trim(); })
               .filter(Boolean);
  if (parts.length < 2) return s;
  return which === 'departure' ? parts[0] : parts[parts.length - 1];
}

function buildBookingNoticeHtml_(b, asFragment) {

  function getAirline(flightNo) {
    if (!flightNo) return "طيران";
    var f = flightNo.toUpperCase().replace(/\s+/g, '');
    var codes = {
      SV: "الخطوط السعودية",
      MS: "مصر للطيران",
      XY: "طيران ناس",
      F3: "طيران أديل",
      SM: "إير كايرو",
      NE: "نسما للطيران",
      NP: "النيل للطيران",
      J9: "طيران الجزيرة",
      FZ: "فلاي دبي",
      G9: "العربية للطيران",
      RJ: "الملكية الأردنية",
      UJ: "المصرية للطيران",
      DQ: "طيران الإسكندرية",
      EK: "طيران الإمارات",
      QR: "الخطوط القطرية",
      KU: "الخطوط الكويتية",
      WY: "الطيران العماني",
      GF: "طيران الخليج",
      TK: "الخطوط التركية",
      EY: "الاتحاد للطيران",
      MSR: "مصر للطيران",
      AT: "الخطوط الملكية المغربية",
      TU: "طيران تونس",
      IA: "العراقية للطيران",
      IY: "طيران اليمنية",
      W6: "ويز إير",
      PC: "بيغاسوس",
      QX: "أجواء الشرق الأوسط",
      ME: "طيران الشرق الأوسط",
      XQ: "طيران سن اكسبرس",
      B2: "بلاروسيان",
      A3: "طيران إيجيان",
      LO: "لوت البولندية",
      MU: "طيران الصين الجنوبية",
      CA: "طيران الصين",
      PK: "الخطوط الباكستانية",
      BA: "الخطوط البريطانية",
      LH: "لوفتهانزا",
      AF: "الخطوط الفرنسية",
      KL: "كيه إل إم",
      SU: "الخطوط الروسية"
    };
    // فحص الأكواد الأطول أولاً (زي MSR) قبل الأقصر (زي MS) لتفادي تطابق جزئي خاطئ
    var sortedCodes = Object.keys(codes).sort(function(a,b){ return b.length - a.length; });
    for (var i = 0; i < sortedCodes.length; i++) {
      if (f.indexOf(sortedCodes[i]) === 0) return codes[sortedCodes[i]];
    }
    return "طيران";
  }

  // 🏙️ (V4.16) إقامة أحادية المدينة: نفس المدينة أولًا وأخيرًا — بلا أي تحرك داخلي إطلاقًا
  var _singleCity = (b.direction === "مكة فقط") ? "مكة" : ((b.direction === "المدينة فقط") ? "المدينة" : null);
  var firstCity = _singleCity || ((b.direction === "مكة أولاً") ? "مكة" : "المدينة");
  var lastCity  = _singleCity ? (_singleCity === "مكة" ? "مكة المكرمة" : "المدينة المنورة") : ((b.direction === "مكة أولاً") ? "المدينة المنورة" : "مكة المكرمة");
  var firstHotel = _singleCity ? (_singleCity === "مكة" ? (b.makkahHotel || "غير محدد") : (b.madinahHotel || "غير محدد")) : ((b.direction === "مكة أولاً") ? (b.makkahHotel || "غير محدد") : (b.madinahHotel || "غير محدد"));
  var lastHotel  = _singleCity ? firstHotel : ((b.direction === "مكة أولاً") ? (b.madinahHotel || "غير محدد") : (b.makkahHotel || "غير محدد"));
  // 🛡️ fmtDate() في getPrintDataForView تُرجع "-" (وليس "") للخانة الفارغة — لو اعتمدنا على || مباشرة
  // فإن "-" نص غير فارغ (truthy) فيفشل السقوط التلقائي لتاريخ خروج الفندق عند ترك الحقل الاختياري
  // فارغاً، فيختفي التحرك الداخلي من الإشعار المطبوع بالكامل. لازم استبعاد "-" صراحة هنا.
  var _hasTransferDate = b.internalTransferDate && b.internalTransferDate !== "-";
  var _fallbackCheckOut = (b.direction === "مكة أولاً") ? (b.makkahCheckOut || "") : (b.madinahCheckOut || "");
  var transferDate = _singleCity ? "" : (_hasTransferDate ? b.internalTransferDate : ((_fallbackCheckOut && _fallbackCheckOut !== "-") ? _fallbackCheckOut : ""));

  // 🧭 (V4.05) المسار الموحد للطباعة: المقاطع المشتقة تحدد مدينة الوصول والمغادرة وكل الانتقالات
  var _dv = _deriveStaySegments_(b);
  var _hOf = function(c) { return c === 'المدينة' ? (b.madinahHotel || 'غير محدد') : (b.makkahHotel || 'غير محدد'); };
  var _cityFull = function(c) { return c === 'المدينة' ? 'المدينة المنورة' : 'مكة'; };
  if (_dv.derived) {
    firstCity = _dv.firstCity;
    lastCity = _cityFull(_dv.lastCity);
    firstHotel = _hOf(_dv.firstCity);
    lastHotel = _hOf(_dv.lastCity);
    transferDate = ''; // الانتقالات كلها تُولَّد من المقاطع أدناه — لا سطر انتقال قديم (منع التكرار)
  }

  var moves = [];

  if (b.arrivalDate) {
    moves.push({
      date: b.arrivalDate,
      time: b.arrivalTime || '-',
      type: 'استقبال وصول من ' + (_portSaudiSide_(b.arrivalPort, 'arrival') || '-') + ' على رحلة رقم ' + (b.arrivalFlight || '-') + ' إلى ' + firstCity + ' (' + firstHotel + ')',
      buses: b.busCount || '-'
    });
  }

  if (transferDate && transferDate !== "-") {
    moves.push({
      date: transferDate,
      time: b.internalTransferTime || '-',
      type: 'التحرك من ' + firstCity + ' (' + firstHotel + ') إلى ' + lastCity + ' (' + lastHotel + ')',
      buses: b.busCount || '-'
    });
  }

  // انتقالات المقاطع المشتقة: سطر واحد لكل حدود بين مدينتين بفنادق الطرفين (يمتص انتقالات المستخدم)
  if (_dv.derived) {
    _dv.transfers.forEach(function(tr, ti) {
      moves.push({
        date: tr.date,
        time: tr.time || (ti === 0 ? (b.internalTransferTime || '-') : '-'),
        type: 'التحرك من ' + tr.from + ' (' + _hOf(tr.from) + ') إلى ' + _cityFull(tr.to) + ' (' + _hOf(tr.to) + ')',
        buses: tr.buses || b.busCount || '-'
      });
    });
  }

  var extras = [];
  try {
    extras = typeof b.extraMovements === 'string' ? JSON.parse(b.extraMovements) : (b.extraMovements || []);
  } catch(e) {}
  // عند الاشتقاق: التحركات غير الانتقالية فقط (المزارات وغيرها) — الانتقالات مُثِّلت أعلاه فلا تُكرَّر
  var extrasToPrint = _dv.derived ? _dv.others : extras;
  if (extrasToPrint && Array.isArray(extrasToPrint)) {
    extrasToPrint.forEach(function(mv) {
      moves.push({
        date: mv.date || '-',
        time: mv.time || '-',
        type: mv.type || '-',
        buses: mv.buses || b.busCount || '-'
      });
    });
  }

  if (b.departureDate) {
    moves.push({
      date: b.departureDate,
      time: b.departureTime || '-',
      type: 'التحرك من ' + lastCity + ' (' + lastHotel + ') إلى ' + (_portSaudiSide_(b.departurePort, 'departure') || '-') + ' للمغادرة على رحلة رقم ' + (b.departureFlight || '-'),
      buses: b.busCount || '-'
    });
  }

  moves.sort(function(a, b2) {
    function parseDateTime(dateStr, timeStr) {
      if (!dateStr || dateStr === '-') return 0;
      var p = String(dateStr).split('/');
      if (p.length === 3) {
        var t = (timeStr && String(timeStr).indexOf(':') > -1) ? String(timeStr).split(':') : [0,0];
        return new Date(p[2], p[1] - 1, p[0], t[0], t[1]).getTime();
      }
      return 0;
    }
    return parseDateTime(a.date, a.time) - parseDateTime(b2.date, b2.time);
  });

  // بناء صفوف التحركات مع تنسيق inline كامل (يعمل في المتصفح وفي محوّل PDF بتاع Google)
  var moveTdBase = 'padding:6px 6px;border:1px solid #cbd5e1;text-align:center;vertical-align:middle;font-size:13px;';
  var moveTdRight = 'padding:6px 6px;border:1px solid #cbd5e1;text-align:right;vertical-align:middle;font-size:13px;padding-right:12px;';

  var movesHtml = "";
  moves.forEach(function(m, idx) {
    movesHtml +=
      '<tr>' +
        '<td style="' + moveTdBase + '">' + (idx + 1) + '</td>' +
        '<td style="' + moveTdBase + '">' + (m.date || '-') + '</td>' +
        '<td style="' + moveTdRight + '">' + (m.type || '-') + '</td>' +
        '<td style="' + moveTdBase + '">' + (m.buses || '-') + '</td>' +
        '<td style="' + moveTdBase + '">' + (m.time || '-') + '</td>' +
      '</tr>';
  });

  // تاريخ ووقت الطباعة
  var now = new Date();
  var printDateTime =
    String(now.getDate()).padStart(2, '0') + '/' +
    String(now.getMonth() + 1).padStart(2, '0') + '/' +
    now.getFullYear() +
    '    ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  // ستايلات inline كاملة (تعمل في المتصفح وفي محوّل PDF بتاع Google بغض النظر عن دعم CSS classes)
  var thStyle = 'padding:6px 6px;border:1px solid #cbd5e1;text-align:center;vertical-align:middle;font-size:13px;font-weight:700;background:#f8fafc;';
  var tdStyle = 'padding:6px 6px;border:1px solid #cbd5e1;text-align:center;vertical-align:middle;font-size:13px;';
  var tableStyle = 'width:100%;border-collapse:collapse;margin-bottom:8px;';
  var sectionTitleStyle = 'padding:8px 16px;border-radius:8px;font-weight:700;margin:12px 0 8px 0;font-size:16px;color:#ffffff;';

  // CSS مضاف كنسخة احتياطية للمتصفحات + خصائص طباعة (لا يضر محوّل PDF)
  var css =
    '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    '@page { size: A4; margin: 6mm; }' +
    '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
    'body { font-family: "Cairo","Segoe UI",Tahoma,Arial,sans-serif; margin:0; padding:0; direction:rtl; background:#ffffff; color:#1e2937; }' +
    '</style>';

  // ===== بناء HTML =====
  var body = '';

  // ترويسة (اللوجو + اسم الشركة على اليمين، عنوان الإشعار في المنتصف، بادج الاتجاه على اليسار)
  // بستخدم table بدل flexbox لأن flexbox مش مضمون في محوّل Google
  body +=
    '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;border-bottom:3px solid #10b981;padding-bottom:10px;">' +
      '<tr>' +
        '<td style="width:33%;text-align:right;vertical-align:middle;padding-bottom:15px;">' +
          '<div style="text-align:center;">' +
            (b.logoUrl ? '<img src="' + b.logoUrl + '" style="width:120px;max-height:75px;object-fit:contain;display:block;margin:0 auto 4px auto;">' : '') +
            '<div style="font-size:16px;font-weight:700;color:#1e3d59;white-space:nowrap;">' + (b.company || '') + '</div>' +
          '</div>' +
        '</td>' +
        '<td style="width:34%;text-align:center;vertical-align:middle;padding-bottom:15px;">' +
          '<span bgcolor="#10b981" style="font-size:22px;font-weight:800;background:#10b981;display:inline-block;padding:8px 28px;border-radius:40px;color:#ffffff;white-space:nowrap;">' +
            'إخطار وصول رقم ' + (b.id || '') +
          '</span>' +
        '</td>' +
        '<td style="width:33%;text-align:left;vertical-align:middle;padding-bottom:15px;">' +
          '<span bgcolor="#f1f5f9" style="background:#f1f5f9;padding:5px 12px;border-radius:20px;font-size:14px;font-weight:600;color:#1e3d59;display:inline-block;">' +
            (b.direction || '') +
          '</span>' +
        '</td>' +
      '</tr>' +
    '</table>';

  // شريط عدد الباصات/المعتمرين/المشرفين — عند تعدد المشرفين يُعرض كلٌّ في سطر مستقل بإزاحة أنيقة
  var _supNames = String(b.supervisor || '').split('/').map(function(s){ return s.trim(); }).filter(Boolean);
  var _supCellHtml;
  if (_supNames.length > 1) {
    _supCellHtml = '<strong>المشرفون:</strong>' +
      _supNames.map(function(n){
        return '<div style="padding-right:14px;line-height:1.6;">• ' + n + '</div>';
      }).join('');
  } else {
    _supCellHtml = '<strong>المشرف:</strong> ' + (_supNames[0] || '-');
  }
  body +=
    '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">' +
      '<tr>' +
        '<td style="width:33%;text-align:right;font-size:14px;vertical-align:top;"><strong>عدد الباصات:</strong> ' + (b.busCount || '-') + '</td>' +
        '<td style="width:34%;text-align:center;font-size:14px;vertical-align:top;"><strong>عدد المعتمرين:</strong> ' + (b.count || '-') + '</td>' +
        '<td style="width:33%;text-align:left;font-size:14px;vertical-align:top;">' + _supCellHtml + '</td>' +
      '</tr>' +
    '</table>';

  // عنوان قسم "بيانات الوصول" (شريط كحلي ممتلئ باستخدام table+bgcolor عشان محوّل Google يعرضه)
  body +=
    '<table style="width:100%;border-collapse:collapse;margin:12px 0 8px 0;">' +
      '<tr>' +
        '<td bgcolor="#1e3d59" style="background:#1e3d59;padding:6px 14px;border-radius:8px;font-weight:700;font-size:14px;color:#ffffff;">🛬 بيانات الوصول</td>' +
      '</tr>' +
    '</table>';

  body +=
    '<table style="' + tableStyle + '">' +
      '<tr>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">التاريخ</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">المنفذ</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">الناقلة</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">الرحلة</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">الوقت</th>' +
      '</tr>' +
      '<tr>' +
        '<td style="' + tdStyle + '">' + (b.arrivalDate || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + (_portSaudiSide_(b.arrivalPort, 'arrival') || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + getAirline(b.arrivalFlight) + '</td>' +
        '<td style="' + tdStyle + '" dir="ltr">' + (b.arrivalFlight || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + (b.arrivalTime || '-') + '</td>' +
      '</tr>' +
    '</table>';

  // جدول أرقام المجموعات / شركة النقل / رقم التشغيلة (بين بيانات الوصول وبيان التحركات)
  body +=
    '<table style="' + tableStyle + '">' +
      '<tr>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">أرقام المجموعات</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">شركة النقل</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">رقم التشغيلة</th>' +
      '</tr>' +
      '<tr>' +
        '<td style="' + tdStyle + '">' + (b.groupNumbers || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + (b.transportCompany || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + (b.operationNo || '-') + '</td>' +
      '</tr>' +
    '</table>';

  body +=
    '<table style="width:100%;border-collapse:collapse;margin:12px 0 8px 0;">' +
      '<tr>' +
        '<td bgcolor="#1e3d59" style="background:#1e3d59;padding:6px 14px;border-radius:8px;font-weight:700;font-size:14px;color:#ffffff;">🚌 بيان التحركات</td>' +
      '</tr>' +
    '</table>';

  body +=
    '<table style="' + tableStyle + '">' +
      '<thead>' +
        '<tr>' +
          '<th bgcolor="#f8fafc" style="' + thStyle + '">م</th>' +
          '<th bgcolor="#f8fafc" style="' + thStyle + '">التاريخ</th>' +
          '<th bgcolor="#f8fafc" style="' + thStyle + '">التحرك</th>' +
          '<th bgcolor="#f8fafc" style="' + thStyle + '">الباصات</th>' +
          '<th bgcolor="#f8fafc" style="' + thStyle + '">الوقت</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + movesHtml + '</tbody>' +
    '</table>';

  body +=
    '<table style="width:100%;border-collapse:collapse;margin:12px 0 8px 0;">' +
      '<tr>' +
        '<td bgcolor="#1e3d59" style="background:#1e3d59;padding:6px 14px;border-radius:8px;font-weight:700;font-size:14px;color:#ffffff;">🛫 بيانات المغادرة</td>' +
      '</tr>' +
    '</table>';

  body +=
    '<table style="' + tableStyle + '">' +
      '<tr>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">التاريخ</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">المنفذ</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">الناقلة</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">الرحلة</th>' +
        '<th bgcolor="#f8fafc" style="' + thStyle + '">الوقت</th>' +
      '</tr>' +
      '<tr>' +
        '<td style="' + tdStyle + '">' + (b.departureDate || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + (_portSaudiSide_(b.departurePort, 'departure') || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + getAirline(b.departureFlight) + '</td>' +
        '<td style="' + tdStyle + '" dir="ltr">' + (b.departureFlight || '-') + '</td>' +
        '<td style="' + tdStyle + '">' + (b.departureTime || '-') + '</td>' +
      '</tr>' +
    '</table>';

  body +=
    '<table style="width:100%;border-collapse:collapse;margin:12px 0 8px 0;">' +
      '<tr>' +
        '<td bgcolor="#1e3d59" style="background:#1e3d59;padding:6px 14px;border-radius:8px;font-weight:700;font-size:14px;color:#ffffff;">📝 ملاحظات</td>' +
      '</tr>' +
    '</table>';

  body +=
    '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">' +
      '<tr>' +
        '<td bgcolor="#fff7ed" style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px;color:#9a3412;font-size:13px;">' +
          (b.notes ? String(b.notes).replace(/\n/g, '<br>') : 'لا توجد ملاحظات') +
        '</td>' +
      '</tr>' +
    '</table>';

  body +=
    '<div style="margin-top:6px;padding-top:4px;border-top:1px dashed #999;font-size:11px;color:#666;text-align:left;">' +
      'وقت الطباعة: ' + printDateTime +
    '</div>';

  if (asFragment) {
    // نسخة "جزء صفحة" لحقنها مباشرة داخل print_view.html (بدون html/head/body مكرر)
    return css + '<div style="padding:8mm;">' + body + '</div>';
  }

  // نسخة "مستند كامل" لتحويلها إلى PDF عبر Utilities.newBlob().getAs('application/pdf')
  return '<html dir="rtl" lang="ar"><head><meta charset="UTF-8">' + css + '</head><body><div style="padding:8mm;">' + body + '</div></body></html>';
}

function getPrintDataForView(bookingId) {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("Bookings");
    if (!sheet) return { error: "ورقة الحجوزات غير موجودة" };
    var lastCol = Math.max(32, sheet.getLastColumn());
    var C = _robustColMap_(sheet, BOOKINGS_HEADERS_); // خريطة أعمدة الإشعارات بالاسم
    var B = _cellReader_(C, BOOKINGS_COL_);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    var target = String(bookingId).trim();
    var row = null;
    for (var i = 0; i < data.length; i++) {
      if (String(B(data[i], 'id')).trim() === target) { row = data[i]; break; }
    }
    if (!row) return { error: "لم يجد الإشعار " + target };
    
    // تنسيق موحّد يعالج 3 حالات: كائن Date، نص تاريخ/وقت نظيف، ونص Date.toString() خام محفوظ سابقاً
    // (مثل "Sat Dec 30 1899 01:35:00 GMT+0205") الذي كان يظهر كما هو في الإشعار المطبوع
    var _tz_ = Session.getScriptTimeZone() || "Asia/Riyadh";
    function fmtDate(v) {
      if (v instanceof Date) return Utilities.formatDate(v, _tz_, "dd/MM/yyyy");
      var s = String(v || "").trim();
      if (!s) return "-";
      // نص Date.toString() خام؟ حوّله لـ Date ثم نسّقه
      var d = new Date(s);
      if (!isNaN(d.getTime()) && /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(s)) {
        return Utilities.formatDate(d, _tz_, "dd/MM/yyyy");
      }
      return s;
    }
    function fmtTime(v) {
      if (v instanceof Date) return Utilities.formatDate(v, _tz_, "HH:mm");
      var s = String(v || "").trim();
      if (!s) return "-";
      // نص وقت نظيف "HH:mm" (أو "H:mm") — أعده كما هو بعد التطبيع
      var m = s.match(/^(\d{1,2}):(\d{2})/);
      if (m && !/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(s)) {
        return ("0" + m[1]).slice(-2) + ":" + m[2];
      }
      // نص Date.toString() خام — استخرج منه الوقت
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, _tz_, "HH:mm");
      return s;
    }
    var extra = [];
    try { extra = JSON.parse(B(row, 'extraMovements') || "[]"); } catch(e) {}

var companyLogo =
  getCompanyLogoBase64(
    B(row, 'company') || ""
  );

    // 🏨 لو الإشعار مرتبط برحلة ولها فنادق إضافية — نجمع كل الأسماء بعلامة "/" بدل عرض فندق واحد فقط
    var madinahHotelDisplay = B(row, 'madinahHotel') || "";
    var makkahHotelDisplay = B(row, 'makkahHotel') || "";
    {
      var tripNameVal = String(B(row, 'tripName') || "").trim();
      if (tripNameVal) {
        try {
          var hotelsRes = _getTripHotelsListInternal_(tripNameVal);
          if (hotelsRes && hotelsRes.madinah && hotelsRes.madinah.length) madinahHotelDisplay = hotelsRes.madinah.join(" / ");
          if (hotelsRes && hotelsRes.makkah && hotelsRes.makkah.length) makkahHotelDisplay = hotelsRes.makkah.join(" / ");
        } catch (hErr) {}
      }
    }

return {
      id: target,
      status: B(row, 'status') || "",
      company: B(row, 'company') || "",
      logoUrl: companyLogo,
      groupNumbers: B(row, 'groupNumbers') || "",
      client: B(row, 'client') || "",
      count: B(row, 'count') || "0",
      supervisor: B(row, 'supervisor') || "",
      direction: B(row, 'direction') || "",
      busCount: B(row, 'busCount') || "",
      transportCompany: B(row, 'transportCompany') || "",
      operationNo: B(row, 'operationNo') || "",
      notes: B(row, 'notes') || "",
      ticketUrl: B(row, 'ticketUrl') || "",
      arrivalPort: _portSaudiSide_(B(row, 'arrivalPort') || "", 'arrival'),
      arrivalDate: fmtDate(B(row, 'arrivalDate')),
      arrivalTime: fmtTime(B(row, 'arrivalTime')),
      arrivalFlight: B(row, 'arrivalFlight') || "",
      departureDate: fmtDate(B(row, 'departureDate')),
      departureFlight: B(row, 'departureFlight') || "",
      departureTime: fmtTime(B(row, 'departureTime')),
      departurePort: _portSaudiSide_(B(row, 'departurePort') || "", 'departure'),
      // المضاف حديثاً لضمان عمل الفنادق والانتقالات في الطباعة 👇
      madinahHotel: madinahHotelDisplay,
      madinahCheckOut: fmtDate(B(row, 'madinahCheckOut')),
      makkahHotel: makkahHotelDisplay,
      makkahCheckOut: fmtDate(B(row, 'makkahCheckOut')),
      internalTransferDate: fmtDate(B(row, 'internalTransferDate')),
      internalTransferTime: fmtTime(B(row, 'internalTransferTime')),
      // ----------------------------------------------------
      extraMovements: extra
    };
    
    
      } catch(e) { return { error: e.toString() }; }
}


function generateMergedPdf(authToken, bookingId) {
  requireAuthOrPrintToken_(authToken);

  var data = getPrintDataForView(bookingId);

  if (!data) {

    throw new Error(
      'بيانات الإشعار غير موجودة'
    );

  }

  // ===== اسم الملف =====

  var company =

    (data.company || 'شركة')

    .toString()

    .trim();

  var arrivalDate =

    (data.arrivalDate || '')

    .toString()

    .replace(/[\\/:*?"<>|]/g, '-');

var fileName =

  company +

  ' - اشعار وصول رقم ' +

  data.id +

  ' - ' +

  arrivalDate;


  // ===== فولدر الحفظ =====

  var folder = getDriveFolder_('NOTICES');

// ===== حذف أي نسخة قديمة لنفس الإشعار =====

var files = folder.getFiles();

while (files.hasNext()) {

  var file = files.next();

  var name = file.getName();

  if (

    name.indexOf(

      'اشعار وصول رقم ' +

      data.id

    ) !== -1

  ) {

    file.setTrashed(true);

  }

}

  // ===== إنشاء مستند مؤقت =====

  var doc =

    DocumentApp.create(fileName);

  var body =

    doc.getBody();


  // ===== عنوان =====

  body.appendParagraph(

    'إشعار رحلة العمرة'

  ).setHeading(

    DocumentApp.ParagraphHeading.HEADING1

  );

  body.appendParagraph('');

  // ===== البيانات =====

  body.appendParagraph(

    'الشركة: ' +

    (data.company || '')

  );

  body.appendParagraph(

    'رقم الإشعار: ' +

    (data.id || '')

  );

  body.appendParagraph(

    'الاتجاه: ' +

    (data.direction || '')

  );

  body.appendParagraph(

    'عدد المعتمرين: ' +

    (data.count || '')

  );

  body.appendParagraph(

    'عدد الباصات: ' +

    (data.busCount || '')

  );

  body.appendParagraph(

    'المشرف: ' +

    (data.supervisor || '')

  );

  body.appendParagraph('');

  // ===== الوصول =====

  body.appendParagraph(

    'بيانات الوصول'

  ).setHeading(

    DocumentApp.ParagraphHeading.HEADING2

  );

  body.appendParagraph(

    'تاريخ الوصول: ' +

    (data.arrivalDate || '')

  );

  body.appendParagraph(

    'منفذ الوصول: ' +

    (_portSaudiSide_(data.arrivalPort, 'arrival') || '')

  );

  body.appendParagraph(

    'رحلة الوصول: ' +

    (data.arrivalFlight || '')

  );

  body.appendParagraph(

    'وقت الوصول: ' +

    (data.arrivalTime || '')

  );

  body.appendParagraph('');

  // ===== التحركات =====

  body.appendParagraph(

    'بيان التحركات'

  ).setHeading(

    DocumentApp.ParagraphHeading.HEADING2

  );

  if (

    data.extraMovements &&

    Array.isArray(data.extraMovements)

  ) {

    data.extraMovements.forEach(function(mv, i) {

      body.appendParagraph(

        (i + 1) +

        ' - ' +

        (mv.type || '') +

        ' - ' +

        (mv.date || '') +

        ' - ' +

        (mv.time || '')

      );

    });

  } else {

    body.appendParagraph(

      'لا توجد تحركات إضافية'

    );

  }

  body.appendParagraph('');

  // ===== المغادرة =====

  body.appendParagraph(

    'بيانات المغادرة'

  ).setHeading(

    DocumentApp.ParagraphHeading.HEADING2

  );

  body.appendParagraph(

    'تاريخ المغادرة: ' +

    (data.departureDate || '')

  );

  body.appendParagraph(

    'منفذ المغادرة: ' +

    (_portSaudiSide_(data.departurePort, 'departure') || '')

  );

  body.appendParagraph(

    'رحلة المغادرة: ' +

    (data.departureFlight || '')

  );

  body.appendParagraph(

    'وقت المغادرة: ' +

    (data.departureTime || '')

  );

  body.appendParagraph('');

  // ===== الملاحظات =====

  body.appendParagraph(

    'الملاحظات'

  ).setHeading(

    DocumentApp.ParagraphHeading.HEADING2

  );

  body.appendParagraph(

    data.notes ||

    'لا توجد ملاحظات'

  );

  // ===== إضافة التذكرة =====

if (data.ticketUrl) {

  var match =
    data.ticketUrl.match(/[-\\w]{25,}/);

  if (match) {

    try {

      var ticketFileId =
        match[0];

      var ticketFile =
        DriveApp.getFileById(ticketFileId);

      var mimeType =
        ticketFile.getMimeType();

      body.appendPageBreak();

      body.appendParagraph(
        'التذكرة المرفقة'
      ).setHeading(
        DocumentApp.ParagraphHeading.HEADING2
      );

      // إذا كانت صورة
      if (
        mimeType.indexOf('image/') === 0
      ) {

        body.appendImage(
          ticketFile.getBlob()
        );

      }

      // إذا كانت PDF
      else if (
        mimeType === 'application/pdf'
      ) {

        var thumbnailUrl =

          'https://drive.google.com/thumbnail?id=' +

          ticketFileId +

          '&sz=w2000';

        var response = UrlFetchApp.fetch(
          thumbnailUrl,
          {
            headers: {
              Authorization:
                'Bearer ' +
                ScriptApp.getOAuthToken()
            }
          }
        );

        var imageBlob =
          response.getBlob();

        body.appendImage(imageBlob);

      }

    } catch(e) {

      Logger.log(e);

    }

  }

}

  // ===== حفظ المستند =====

  doc.saveAndClose();

  // ===== تحويل PDF =====

  var pdfBlob =

    DriveApp

    .getFileById(doc.getId())

    .getBlob()

    .getAs('application/pdf');

  // ===== إنشاء الملف النهائي =====

  var finalFile =

    folder.createFile(pdfBlob);

  finalFile.setName(

    fileName + '.pdf'

  );

  finalFile.setSharing(

    DriveApp.Access.ANYONE_WITH_LINK,

    DriveApp.Permission.VIEW

  );

  // ===== حذف المستند المؤقت =====

  DriveApp

    .getFileById(doc.getId())

    .setTrashed(true);

  // ===== إرجاع الرابط =====

  return {

    url:

      'https://drive.google.com/uc?export=download&id=' +

      finalFile.getId(),

    fileId:

      finalFile.getId()

  };

}




function getAgentByCompany(authToken, companyName) {
  requireAuth_(authToken);

  if (!companyName) return "";

  var cleanTarget = companyName.toString().trim();

  // نحاول أولاً من الكاش الموحّد (نفس البيانات المستخدمة في شاشة الإعدادات)
  var cached = getCachedData('agents_cache');
  if (cached) {
    for (var c = 0; c < cached.length; c++) {
      if (cached[c].company && cached[c].company.toString().trim() === cleanTarget) {
        return cached[c].agent || "";
      }
    }
    return ""; // الكاش موجود ومحدَّث، والشركة غير موجودة فيه فعلاً
  }

  // لا يوجد كاش بعد — نقرأ من الشيت مباشرة (وسيُخزَّن الكاش تلقائياً في المرة القادمة عبر getCompaniesSettings)
  var ss =
    getSpreadsheet_();

  var sheet =
    ss.getSheetByName("Agents_Settings");

  var data =
    sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {

    var agent =
      data[i][0]; // العمود A

    var company =
      data[i][1]; // العمود B

    if (
      company &&
      company.toString().trim() ===
      cleanTarget
    ) {

      return agent || "";

    }

  }

  return "";
}


/**
 * محرك البحث والفرز الديناميكي — يدعم فلترة بالنص + المدن + الفترات الزمنية معاً.
 * 📞 يُستدعى من: executeDynamicSearch() في index_web.html (شاشة الفرز والبحث)
 *    بتُطلَق تلقائياً عند أي تغيير في أي فلتر (بدون الحاجة لضغط "إنشاء التقرير")
 * ملاحظة: هذه منفصلة تماماً عن buildAllMovements/getAllMovements (بحث الحجوزات مش التحركات)
 */
function searchDynamicBookings(authToken, filters) {
  requireAuth_(authToken);

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        'Bookings'
      );

  if (!sheet)
    return [];

  const data =
    sheet
      .getDataRange()
      .getValues();

  if (data.length < 2)
    return [];

  const headers =
    data[0];

  const rows =
    data.slice(1);

  const formatDate =
    d => {

      if(!d)
        return null;

      if(d instanceof Date){

        return new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate()
        );
      }

      const p =
        String(d)
        .split('/');

      if(
        p.length !== 3
      ) return null;

      return new Date(
        +p[2],
        p[1]-1,
        +p[0]
      );
    };

  const overlap =
    (
      start,
      end,
      filterStart,
      filterEnd
    ) => {

      if(
        !start ||
        !end
      ) return false;

      if(
        filterStart &&
        filterEnd
      ){

        return (
          start <= filterEnd
          &&
          end >= filterStart
        );
      }

      if(filterStart){

        return (
          end >=
          filterStart
        );
      }

      if(filterEnd){

        return (
          start <=
          filterEnd
        );
      }

      return true;
    };

  return rows

    .map(row => {

      const obj = {};

      headers.forEach(
        (h,i)=>{

          let value =
            row[i];


// إصلاح الساعات مرة واحدة
  if (
    h.includes('ساعة')
    ||
    h.includes('وقت')
    ||
    h.includes('time')
  ) {

    value =
      formatSheetTime(
        value
      );
  }

          if(
            value
            instanceof Date
          ){

            value =
              Utilities
              .formatDate(
                value,
                Session
                .getScriptTimeZone(),
                'dd/MM/yyyy'
              );
          }

          obj[h] =
            value ?? '';
        }
      );

      return obj;
    })

    .filter(row => {

      const contains =
        (
          field,
          value
        ) =>

        !value ||

        String(
          row[field] || ''
        )

        .toLowerCase()

        .includes(
          value
          .toLowerCase()
        );

      if(
        !contains(
          'رقم الإشعار',
          filters.bookingId
        )
      ) return false;

      if(
        !contains(
          'العميل',
          filters.client
        )
      ) return false;

      if(
        !contains(
          'الشركة المصرية',
          filters.company
        )
      ) return false;

      if(
        !contains(
          'الوكيل السعودي',
          filters.agent
        )
      ) return false;

      if(
        !contains(
          'المشرف',
          filters.supervisor
        )
      ) return false;

      // 🏷️ (V4.17) اسم المجموعة — شاشة فقط، لكنه بند بحث صالح ضمن نفس محرك الفلترة
      if(
        !contains(
          'اسم المجموعة',
          filters.groupName
        )
      ) return false;

      // الرحلات

      if(
        filters.flight
      ){

        const f =
          filters.flight
          .toLowerCase();

        const ok =

          String(
            row[
            'رقم رحلة الوصول'
            ] || ''
          )

          .toLowerCase()

          .includes(f)

          ||

          String(
            row[
            'رقم رحلة المغادرة'
            ] || ''
          )

          .toLowerCase()

          .includes(f);

        if(!ok)
          return false;
      }

      // التحركات

      if (
  filters.movementDate
) {

  try {

    const raw =
      row[
        'extraMovements'
      ] || '[]';

    const arr =
      typeof raw
      === 'string'

      ? JSON.parse(raw)

      : raw;

    const targetDate =
      String(
        filters
        .movementDate
      )
      .trim();

    const ok =
      arr.some(m => {

        const moveDate =
          String(
            m.date || ''
          )
          .trim();

        return (
          moveDate ===
          targetDate
        );
      });

    if (!ok)
      return false;

  } catch (e) {

    console.log(
      'Movement Parse Error',
      e
    );

    return false;
  }
}

      // فلتر المدن (الوضع الافتراضي: غير مُفعَّل = بحث بالفترة بدون تقييد بمدينة)

      if(
        !filters
        .enableCityFilter
      ){

        return true;
      }

      // مكة/مدينة

      if(
        filters
        .stayLocation
      ){

        const from =
          formatDate(
            filters
            .rangeStart
          );

        const to =
          formatDate(
            filters
            .rangeEnd
          );

        if(
          filters
          .stayLocation
          === 'المدينة'
        ){

          const start =
            formatDate(
              row[
              'دخول المدينة'
              ]
            );

          const end =
            formatDate(
              row[
              'خروج المدينة'
              ]
            );

          return overlap(
            start,
            end,
            from,
            to
          );
        }

        if(
          filters
          .stayLocation
          === 'مكة'
        ){

          const start =
            formatDate(
              row[
              'دخول مكة'
              ]
            );

          const end =
            formatDate(
              row[
              'خروج مكة'
              ]
            );

          return overlap(
            start,
            end,
            from,
            to
          );
        }
      }

      return true;
    });
}


/* ==========================
   Helpers
========================== */


function parseDate(dateStr) {

  if (!dateStr)
    return null;

  const parts =
    String(dateStr)
      .split('/');

  if (parts.length !== 3)
    return null;

  return new Date(
    Number(parts[2]),
    Number(parts[1]) - 1,
    Number(parts[0])
  );
}





function formatSheetTime(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  try {

    // لو القيمة Date object من Google Sheets
    if (
      Object.prototype.toString.call(value)
      === '[object Date]'
    ) {

      return Utilities.formatDate(
        value,
        Session.getScriptTimeZone(),
        'HH:mm'
      );
    }

    // لو HH:mm جاهزة
    const txt =
      String(value)
      .trim();

    const match =
      txt.match(
        /(\d{1,2}):(\d{2})/
      );

    if(match){

      return (
        match[1]
        .padStart(2,'0')
        +
        ':'
        +
        match[2]
      );
    }

    // لو رقم serial
    if(
      !isNaN(txt)
    ){

      const totalMinutes =
        Math.round(
          parseFloat(txt)
          *
          24
          *
          60
        );

      const h =
        String(
          Math.floor(
            totalMinutes / 60
          ) % 24
        ).padStart(
          2,
          '0'
        );

      const m =
        String(
          totalMinutes % 60
        ).padStart(
          2,
          '0'
        );

      return `${h}:${m}`;
    }

  } catch(err){}

  return '';
}


function exportToProfessionalExcelV4(authToken, data) {
  requireAuth_(authToken);

  try {

    const rows =
      data.rows || [];

    const columns =
      data.columns || [];

    const f =
      data.filters || {};

    // ==============================
    // 🧠 اسم التقرير الذكي
    // ==============================

    const now =
      new Date();

    const yyyy =
      now.getFullYear();

    const mm =
      String(
        now.getMonth() + 1
      ).padStart(2, '0');

    const dd =
      String(
        now.getDate()
      ).padStart(2, '0');

    const hh =
      String(
        now.getHours()
      ).padStart(2, '0');

    const min =
      String(
        now.getMinutes()
      ).padStart(2, '0');

    let reportTitle =
      'تقرير إشعارات العمرة';

    if (
      f.fromDate &&
      f.toDate
    ) {

      reportTitle =
        `الفترة من ${f.fromDate} إلى ${f.toDate}`;
    }

    else if (
      f.fromDate
    ) {

      reportTitle =
        `من ${f.fromDate}`;
    }

    else if (
      f.toDate
    ) {

      reportTitle =
        `حتى ${f.toDate}`;
    }

    const fileName =
      `تقرير_الإشعارات_${yyyy}-${mm}-${dd}_${hh}${min}`;

    // ==============================
    // الفلاتر المستخدمة
    // ==============================

    const filters =
      [];

    if (f.bookingId) {
      filters.push(
        `الإشعار: ${f.bookingId}`
      );
    }

    if (f.client) {
      filters.push(
        `العميل: ${f.client}`
      );
    }

    if (f.company) {
      filters.push(
        `الشركة المصرية: ${f.company}`
      );
    }

    if (f.agent) {
      filters.push(
        `الوكيل السعودي: ${f.agent}`
      );
    }

    if (f.supervisor) {
      filters.push(
        `المشرف: ${f.supervisor}`
      );
    }

    if (f.city) {
      filters.push(
        `التواجد: ${f.city}`
      );
    }

    if (
      f.fromDate ||
      f.toDate
    ) {

      filters.push(

        `الفترة: ${
          f.fromDate || 'البداية'
        } → ${
          f.toDate || 'النهاية'
        }`
      );
    }

    const subTitle =

      filters.length

      ?

      filters.join(' | ')

      :

      `عدد النتائج (${rows.length})`;

    // ==============================
    // Folder
    // ==============================

    // ==============================
    // إنشاء ملف
    // ==============================

    const ss =
      SpreadsheetApp.create(
        fileName
      );

    const sheet =
      ss.getActiveSheet();

    const file =
      DriveApp.getFileById(
        ss.getId()
      );

    const folder = getDriveFolder_('EXPORTS');

    folder.addFile(file);

    DriveApp
      .getRootFolder()
      .removeFile(file);

    // ==============================
    // اتجاه RTL
    // ==============================

    sheet.setRightToLeft(
      true
    );

    // ==============================
    // عنوان التقرير
    // ==============================

    sheet
      .getRange(
        1,
        1,
        1,
        columns.length
      )
      .merge()
      .setValue(
        reportTitle
      )
      .setFontSize(16)
      .setFontWeight(
        'bold'
      )
      .setHorizontalAlignment(
        'center'
      )
      .setVerticalAlignment(
        'middle'
      );

    // ==============================
    // الفلاتر
    // ==============================

    sheet
      .getRange(
        2,
        1,
        1,
        columns.length
      )
      .merge()
      .setValue(
        subTitle
      )
      .setFontSize(10)
      .setFontColor(
        '#555'
      )
      .setHorizontalAlignment(
        'center'
      )
      .setVerticalAlignment(
        'middle'
      );

    // ==============================
    // رؤوس الأعمدة
    // ==============================

    sheet
      .getRange(
        3,
        1,
        1,
        columns.length
      )
      .setValues([
        columns
      ])
      .setBackground(
        '#0F766E'
      )
      .setFontColor(
        '#FFFFFF'
      )
      .setFontWeight(
        'bold'
      )
      .setHorizontalAlignment(
        'center'
      )
      .setVerticalAlignment(
        'middle'
      );

    // ==============================
    // البيانات
    // ==============================

    const values =
      rows.map(r =>

        columns.map(
          c =>
          r[c] ?? ''
        )
      );

    if (
      values.length
    ) {

      sheet
        .getRange(
          4,
          1,
          values.length,
          columns.length
        )
        .setValues(
          values
        );
    }

    // ==============================
    // تنسيق عام
    // ==============================

    const range =
      sheet
      .getDataRange();

    range
      .setHorizontalAlignment(
        'center'
      )
      .setVerticalAlignment(
        'middle'
      );

    // ==============================
    // Freeze + Filter
    // ==============================

    sheet
      .setFrozenRows(
        3
      );

    sheet
      .getRange(
        3,
        1,
        rows.length + 1,
        columns.length
      )
      .createFilter();

    // ==============================
    // Auto Width ذكي
    // ==============================

    for (
      let i = 1;
      i <= columns.length;
      i++
    ) {

      sheet
        .autoResizeColumn(
          i
        );

      const width =
        sheet
        .getColumnWidth(
          i
        );

      if (
        width > 280
      ) {

        sheet
          .setColumnWidth(
            i,
            280
          );
      }

      if (
        width < 90
      ) {

        sheet
          .setColumnWidth(
            i,
            90
          );
      }
    }

    SpreadsheetApp.flush();

    // ==============================
    // رابط التحميل
    // ==============================

    const url =

      'https://docs.google.com/spreadsheets/d/' +

      ss.getId() +

      '/export?format=xlsx';

    // حذف بعد الإنشاء
    file.setTrashed(
      true
    );

    return url;

  }

  catch (err) {

    Logger.log(
      'EXPORT V4 ERROR: ' +
      err
    );

    throw new Error(
      'Export failed: ' +
      err.message
    );
  }
}

function exportMovementExcel(authToken, rows, selectedCols, reportTitle) {
  requireAuth_(authToken);

  try {

    const folder = getDriveFolder_('EXPORTS');

    const now =
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd_HH-mm'
      );

    const safeTitle =
      reportTitle
        .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '_');

    const fileName =
      `${safeTitle}_${now}`;

    // =====================
    // إنشاء Spreadsheet مؤقت
    // =====================

    const ss =
      SpreadsheetApp.create(fileName);

    const sheet =
      ss.getSheets()[0];

    sheet.setName(
      'تقرير التحركات'
    );

// =====================
// عنوان التقرير
// =====================

sheet
  .getRange(
    1,
    1,
    1,
    selectedCols.length
  )
  .merge();


const formattedDate = Utilities.formatDate(
  new Date(),
  Session.getScriptTimeZone(),
  "dd/MM/yyyy"
);

const finalTitle = reportTitle + " - " + formattedDate;


sheet
  .getRange('A1')
  .setValue(reportTitle)
  .setFontSize(16)
  .setFontWeight('bold')
  .setHorizontalAlignment('center')
  .setVerticalAlignment('middle');
  

sheet.setRowHeight(
  1,
  32
);
    // =====================
    // اتجاه RTL
    // =====================

    sheet.setRightToLeft(true);

    // =====================
    // Headers
    // =====================

    sheet
.getRange(
  2,
  1,
  1,
  selectedCols.length
)
.setValues([
  selectedCols
]);

const headerRange =
sheet.getRange(
  2,
  1,
  1,
  selectedCols.length
);

    headerRange
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true)
      .setBackground('#065f46')
      .setFontColor('#ffffff');

    // =====================
    // تحويل البيانات
    // =====================

    const data =
      rows.map(row => {

        return selectedCols.map(col => {

          switch(col){

            case 'رقم الإشعار':
              return row.bookingId || '';

            case 'التاريخ':
              return row.movementDate || '';

            case 'الوقت':
              return row.movementTime || '';

            case 'نوع التحرك':
              return row.movementType || '';

            case 'العميل':
              return row.client || '';

            case 'الشركة المصرية':
              return row.company || '';

            case 'الوكيل السعودي':
              return row.agent || '';

            case 'المشرف':
              return row.supervisor || '';

            case 'عدد الباصات':
              return row.buses || '';

            case 'العدد':
              return row.count || '';

            default:
              return '';
          }

        });

      });

    // =====================
    // كتابة البيانات
    // =====================

    if(data.length){

      sheet
        .getRange(
          3,
          1,
          data.length,
          selectedCols.length
        )
        .setValues(data);

      const bodyRange =
        sheet.getRange(
          3,
          1,
          data.length,
          selectedCols.length
        );

      bodyRange
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setFontSize(12);
    }

 // =====================
// Smart Auto Width
// =====================

selectedCols.forEach(
  (col,index)=>{

    let width = 100;

    switch(col){

      case 'نوع التحرك':
        width = 660;
        break;

      case 'الشركة المصرية':
      width = 180;
        break;

      case 'الوكيل السعودي':
      case 'العميل':
        width = 150;
        break;

      case 'التاريخ':
        width = 105;
        break;

      case 'الوقت':
        width = 70;
        break;

      case 'المشرف':
        width = 120;
        break;

      case 'عدد الباصات':
      case 'العدد':
      case 'رقم الإشعار':
        width = 60;
        break;

      default:
        width = 120;
    }

    sheet.setColumnWidth(
      index + 1,
      width
    );

  }
);

    // =====================
    // Freeze Header
    // =====================

    sheet.setFrozenRows(2);

    // =====================
    // نقل الملف للفولدر
    // =====================

    const file =
      DriveApp.getFileById(
        ss.getId()
      );

    folder.addFile(file);

    DriveApp
      .getRootFolder()
      .removeFile(file);

    // =====================
    // تحويل XLSX
    // =====================

    const url =
      'https://www.googleapis.com/drive/v3/files/'
      +
      ss.getId()
      +
      '/export?mimeType='
      +
      MimeType.MICROSOFT_EXCEL;

    const token =
      ScriptApp
      .getOAuthToken();

    const response =
      UrlFetchApp.fetch(
        url,
        {
          headers:{
            Authorization:
              'Bearer '
              + token
          }
        }
      );

    const blob =
      response
      .getBlob()
      .setName(
        fileName + '.xlsx'
      );

    const xlsxFile =
      folder.createFile(blob);

    const downloadUrl =
      'https://drive.google.com/uc?export=download&id='
      +
      xlsxFile.getId();

    // حذف المؤقت
    file.setTrashed(true);

    return {
      success:true,
      url:downloadUrl,
      fileId:
        xlsxFile.getId()
    };

  } catch(err){

    Logger.log(err);

    return {
      success:false,
      error:err.toString()
    };
  }
}

function deleteTempFile(authToken, fileId){
  requireAuth_(authToken);

  try{

    DriveApp
      .getFileById(fileId)
      .setTrashed(true);

  } catch(err){

    Logger.log(err);
  }
}


function getCompanyLogoBase64(companyName) {

  try {

    if (!companyName) return "";

    var sheet =
      SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Agents_Settings");

    if (!sheet) return "";

    var data =
      sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {

      var company =
        String(data[i][1] || "")
        .trim();

      if (
        company ===
        String(companyName).trim()
      ) {

        var url =
          String(data[i][2] || "")
          .trim();

        if (!url) return "";

        var match =
          url.match(/[-\w]{25,}/);

        if (!match) return "";

        var fileId =
          match[0];

        var file =
          DriveApp.getFileById(fileId);

        var blob =
          file.getBlob();

        return (
          "data:" +
          blob.getContentType() +
          ";base64," +
          Utilities.base64Encode(
            blob.getBytes()
          )
        );
      }
    }

    return "";

  } catch (e) {

    Logger.log(e);

    return "";
  }
}

// ==========================================
// نظام إدارة المستخدمين والصلاحيات
// ==========================================

function setupUsersSystem(adminPassword) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "Users";
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // العمود السادس: mustChangePassword — يُجبر المستخدم على تغيير كلمة المرور عند أول دخول
    var headers = ["Username", "Password", "FullName", "Active", "Permissions", "MustChangePwd"];
    
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers])
         .setBackground("#1e3d59")
         .setFontColor("white")
         .setFontWeight("bold")
         .setHorizontalAlignment("center");
         
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 300);
    sheet.setColumnWidth(6, 140);

    // كلمة المرور الافتراضية admin123 (مشفّرة) — يُجبر على تغييرها عند أول دخول
    // (بلا حد أدنى للطول — أي كلمة مرور غير فارغة تُقبَل، وإلا تُستعمل admin123)
    var defaultPassword = adminPassword && adminPassword.trim().length >= 1
      ? adminPassword.trim()
      : 'admin123';

    sheet.appendRow(["admin", hashPassword_(defaultPassword), "مدير النظام", true, "ALL", true]);
    
    SpreadsheetApp.flush();
    return "✅ تم إنشاء شيت المستخدمين بنجاح.\nحساب المدير: admin / " + defaultPassword + "\nسيُطلب تغيير كلمة المرور عند أول دخول.";
  }
  
  return "⚠️ شيت المستخدمين موجود بالفعل.";
}

// دالة الاستدعاء من واجهة الإعدادات
function setupUsersSystemFromUI(authToken, adminPassword) {
  requireAdminPermission_(authToken);
  var result = setupUsersSystem(adminPassword ? adminPassword.trim() : null);
  return { success: result.startsWith('✅'), message: result };
}


function loginUser(username, password) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == username && checkPasswordMatch_(password, data[i][1])) {

      // ملاحظة إصلاح: كانت القراءة السابقة تأخذ عمود Active (index 3) وتُسمّيه خطأً "permissions"
      // الترتيب الصحيح حسب رأس الجدول: Username=0, Password=1, FullName=2, Active=3, Permissions=4
      var isActive = data[i][3];
      var userPermissions = data[i][4];

      // فحص جديد: حساب معطّل (Active = false) لا يُسمح له بالدخول
      if (isActive === false || String(isActive).toLowerCase() === "false") {
        return { success: false, error: "هذا الحساب معطّل، يرجى مراجعة مسؤول النظام" };
      }

      // إرجاع كائن بسيط جداً
      var sessionToken = createSession_(username, data[i][2], userPermissions);
      logChange_(username, "تسجيل دخول", "-", "دخول للنظام", "-", "-");
      // العمود السادس (index 5): MustChangePwd — يُجبر على تغيير كلمة المرور عند أول دخول
      var mustChangePwd = data[i][5] === true || String(data[i][5]).toLowerCase() === 'true';
      return {
        success: true,
        // String() ضرورية هنا: لو اسم المستخدم/الاسم الكامل رقمي بالكامل (زي "123456")
        // فـGoogle Sheets بيرجّعه كـ Number مش نص، وده كان بيكسر fullName.trim() في الواجهة
        fullName: String(data[i][2] || ""),
        permissions: userPermissions,
        token: sessionToken,
        mustChangePwd: mustChangePwd,
        userRow: i + 1   // رقم الصف في الشيت (يُستخدم لمسح علامة mustChangePwd بعد التغيير)
      };
    }
  }
  return { success: false, error: "خطأ في البيانات" };
}


/* ============================================================
   🔐 تشفير كلمات المرور (إضافة جديدة - لا تُعدّل أي دالة قديمة)
   ============================================================ */

// ينشئ بصمة (hash) لكلمة المرور - لا يمكن الرجوع منها للنص الأصلي
function hashPassword_(plainPassword) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plainPassword),
    Utilities.Charset.UTF_8
  );
  return digest.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// يقارن كلمة المرور المُدخلة مع القيمة المخزنة، سواء كانت مُشفّرة أو نص عادي (قديم لم يُهاجَر بعد)
function checkPasswordMatch_(plainPassword, storedValue) {
  var storedStr = String(storedValue);
  // كلمة مرور مُشفّرة بصيغة SHA-256 طولها دائماً 64 حرف hex
  var looksHashed = /^[a-f0-9]{64}$/i.test(storedStr);
  if (looksHashed) {
    return hashPassword_(plainPassword) === storedStr.toLowerCase();
  }
  // توافق مؤقت مع كلمات مرور لم تُهاجَر بعد (نص عادي كما كانت سابقاً)
  return plainPassword == storedValue;
}

// دالة تُشغَّل يدوياً مرة واحدة فقط من محرر Apps Script (Run) لتحويل كل كلمات المرور الحالية إلى بصمات مُشفّرة


/* ============================================================
   👥 إدارة المستخدمين - إضافة جديدة
   كل الدوال هنا مقصورة على مستخدم صلاحيته "ALL" فقط
   ============================================================ */

/* 🔐 نموذج الصلاحيات الذكية (سيرفر): يفهم رموز "screen.cap" مع التتالي + الرموز القديمة
   - أي صلاحية شاشة تعني العرض؛ الحذف يعني التعديل والعرض
   - الرمز القديم "delete" يمنح الحذف في كل الشاشات (حفاظاً على السلوك السابق) */
var _PERM_SCREENS_ = ['bookings','trips','kashf','registry','transport','audit','users','accounts','catering','pricing','ministry','visas'];
var _PERM_LEGACY_MAP_ = {
  'add':'bookings.add','edit':'bookings.edit','delete':'bookings.delete',
  'print':'bookings.print','approve':'bookings.approve',
  'trips':'trips.view','registry':'registry.view',
  'transport_accounts':'transport.view','audit_log':'audit.view'
};
function _sessionHasPerm_(session, perm) {
  var raw = String((session && session.permissions) || "").toLowerCase();
  var list = raw.split(",").map(function(p){ return p.trim(); }).filter(Boolean);
  var set = {};
  list.forEach(function(t){
    set[t] = true;
    if (_PERM_LEGACY_MAP_[t]) { t = _PERM_LEGACY_MAP_[t]; set[t] = true; }
    var dot = t.indexOf('.');
    if (dot > 0) {
      var scr = t.slice(0, dot), cap = t.slice(dot + 1);
      set[scr + '.view'] = true;
      if (cap === 'delete') set[scr + '.edit'] = true;
    }
  });
  if (set['delete']) _PERM_SCREENS_.forEach(function(s){ set[s + '.delete'] = true; set[s + '.edit'] = true; set[s + '.view'] = true; });
  if (set['admin'] || set['all']) return true;
  var req = String(perm).toLowerCase();
  if (set[req]) return true;
  if (_PERM_LEGACY_MAP_[req] && set[_PERM_LEGACY_MAP_[req]]) return true;
  return false;
}

// فحص إضافي فوق requireAuth_ العادية - يتأكد أن صاحب الجلسة صلاحيته ALL تحديداً
function requireAdminPermission_(authToken) {
  var session = requireAuth_(authToken);
  var perms = String(session.permissions || "").toLowerCase();
  var permsList = perms.split(",").map(function(p){ return p.trim(); });
  var isAdmin = permsList.indexOf("admin") !== -1 || permsList.indexOf("all") !== -1;
  if (!isAdmin) {
    throw new Error("هذه الشاشة متاحة فقط لمستخدم بصلاحية ALL أو admin");
  }
  return session;
}

// هل الجلسة لصاحب صلاحية كاملة (admin/all) وليست فقط «إعدادات أساسية»؟
function _isFullAdminSession_(session) {
  var permsList = String((session && session.permissions) || "").toLowerCase().split(",").map(function(p){ return p.trim(); });
  return permsList.indexOf("admin") !== -1 || permsList.indexOf("all") !== -1;
}

// 🔐 صلاحية «الإعدادات الأساسية» المجمَّعة: الشركات/الوكلاء/اللوجوهات + تنبيه البريد اليومي
// + تنبيه تيليجرام اليومي + الحقول الإلزامية في الإشعار. تمرّ صلاحية admin/all تلقائياً.
function requireSettingsBasicPermission_(authToken) {
  var session = requireAuth_(authToken);
  if (_sessionHasPerm_(session, "settings_basic")) return session;
  throw new Error("هذه الإعدادات متاحة فقط لمستخدم بصلاحية «الإعدادات الأساسية» أو ALL");
}

// يرجع كل المستخدمين بدون كلمات المرور نفسها (لا داعي لإرسالها للمتصفح أبداً)
function getAllUsersForAdmin(authToken) {
  requireAdminPermission_(authToken);

  var cached = getCachedData('users_cache');
  if (cached) return cached;

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    if (!data[i][0]) continue;
    result.push({
      row: i + 2, // رقم الصف الفعلي في الشيت، يُستخدم لاحقاً عند التعديل أو الحذف
      username: String(data[i][0]),
      fullName: String(data[i][2] || ""),
      active: data[i][3],
      permissions: data[i][4]
    });
  }
  setCachedData('users_cache', result);
  return result;
}

// يضيف مستخدماً جديداً - الباسورد يُشفّر تلقائياً قبل التخزين، لا حاجة لتشغيل أي دالة يدوية بعدها
function addNewUser(authToken, newUsername, newPassword, fullName, permissions) {
  requireAdminPermission_(authToken);

  if (!newUsername || !newPassword) {
    throw new Error("اسم المستخدم وكلمة المرور مطلوبان");
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  var lastRow = sheet.getLastRow();

  // التأكد أن اسم المستخدم غير مكرر
  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i][0] === newUsername) {
        throw new Error("اسم المستخدم موجود بالفعل");
      }
    }
  }

  _clearUsersPermsValidation_(sheet); // إزالة قاعدة التحقق القديمة قبل كتابة رموز الصلاحيات الجديدة
  sheet.appendRow([
    newUsername,
    hashPassword_(newPassword),
    fullName || newUsername,
    true,
    permissions || ""
  ]);

  clearAllCache();
  return { success: true };
}

// يغيّر كلمة مرور مستخدم موجود بالاعتماد على رقم صفه في الشيت (row) القادم من getAllUsersForAdmin
function changeUserPassword(authToken, targetRow, newPassword) {
  requireAdminPermission_(authToken);

  if (!targetRow || !newPassword) {
    throw new Error("بيانات غير مكتملة");
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  sheet.getRange(targetRow, 2).setValue(hashPassword_(newPassword));

  clearAllCache();
  return { success: true };
}

// يفعّل أو يعطّل حساب مستخدم
function setUserActiveStatus(authToken, targetRow, isActive) {
  requireAdminPermission_(authToken);

  if (!targetRow) {
    throw new Error("بيانات غير مكتملة");
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  sheet.getRange(targetRow, 4).setValue(isActive === true);

  clearAllCache();
  return { success: true };
}


// حذف مستخدم نهائياً — صلاحية admin/ALL فقط، مع حماية من حذف النفس أو آخر حساب admin
function deleteUserAccount(authToken, targetRow, expectedUsername) {
  var session = requireAdminPermission_(authToken);

  if (!targetRow) {
    return { success: false, error: "بيانات غير مكتملة" };
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  var data = sheet.getDataRange().getValues();

  if (targetRow < 2 || targetRow > data.length) {
    return { success: false, error: "المستخدم غير موجود" };
  }

  var targetRowData = data[targetRow - 1];
  var targetUsername = targetRowData[0];

  // تحقق من تطابق اسم المستخدم (حماية إضافية من حذف صف خاطئ)
  if (expectedUsername && targetUsername !== expectedUsername) {
    return { success: false, error: "عدم تطابق البيانات، أعد تحميل الصفحة وحاول مجدداً" };
  }

  // منع حذف النفس
  if (targetUsername === session.username) {
    return { success: false, error: "لا يمكنك حذف حسابك الخاص" };
  }

  // منع حذف آخر حساب admin/ALL في النظام
  var targetPerms = String(targetRowData[4] || "").toLowerCase();
  var isTargetAdmin = targetPerms.indexOf("admin") !== -1 || targetPerms.indexOf("all") !== -1;
  if (isTargetAdmin) {
    var adminCount = 0;
    for (var i = 1; i < data.length; i++) {
      var p = String(data[i][4] || "").toLowerCase();
      if (p.indexOf("admin") !== -1 || p.indexOf("all") !== -1) adminCount++;
    }
    if (adminCount <= 1) {
      return { success: false, error: "لا يمكن حذف آخر مستخدم بصلاحية admin في النظام" };
    }
  }

  sheet.deleteRow(targetRow);

  logChange_(session.username, "حذف مستخدم", targetUsername, "-", "-", "تم حذف الحساب نهائياً");
  clearAllCache();

  return { success: true };
}


function updateUserPermissions(authToken, targetRow, newPermissions) {
  var session = requireAdminPermission_(authToken);
  if (!targetRow) throw new Error("بيانات غير مكتملة");
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  _clearUsersPermsValidation_(sheet); // إزالة قاعدة التحقق القديمة التي ترفض رموز الصلاحيات الجديدة (screen.cap)
  sheet.getRange(targetRow, 5).setValue(newPermissions || "");
  clearAllCache();
  // 🔄 (V4.108) لو الأدمن يعدّل صلاحيات حسابه هو نفسه، حدِّث جلسته النشطة فوراً بنفس التوكن —
  // بدون هذا كانت الجلسة المفتوحة تحتفظ بالصلاحيات القديمة المخزَّنة وقت الدخول (CacheService)
  // فتظل كل الشاشات المُضافة حديثاً تُظهر "لا تملك صلاحية" رغم نجاح الحفظ، حتى يخرج ويدخل من جديد.
  var editedUsername = String(sheet.getRange(targetRow, 1).getValue() || "").trim();
  if (editedUsername && editedUsername === session.username) {
    _refreshSessionPermissions_(authToken, newPermissions || "");
  }
  return { success: true };
}

// يحدّث حقل الصلاحيات داخل جلسة نشطة بعينها (بنفس رمزها) دون تغيير باقي بياناتها أو مدة انتهائها
function _refreshSessionPermissions_(token, newPermissions) {
  if (!token) return;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('session_' + token);
  if (!raw) return;
  try {
    var s = JSON.parse(raw);
    s.permissions = newPermissions;
    cache.put('session_' + token, JSON.stringify(s), SESSION_DURATION_SECONDS);
  } catch (e) {}
}

// يغيّر اسم مستخدم موجود (العمود A) — صلاحية admin فقط، مع منع الفراغ والتكرار.
// الجلسات النشطة تحتفظ بالاسم القديم حتى انتهائها، والدخول التالي يكون بالاسم الجديد.
function updateUsername(authToken, targetRow, newUsername) {
  requireAdminPermission_(authToken);
  if (!targetRow) throw new Error("بيانات غير مكتملة");
  newUsername = String(newUsername || "").trim();
  if (!newUsername) return { success: false, error: "اسم المستخدم لا يمكن أن يكون فارغاً" };

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  var lastRow = sheet.getLastRow();
  var oldUsername = String(sheet.getRange(targetRow, 1).getValue() || "").trim();
  if (oldUsername === newUsername) { clearAllCache(); return { success: true, unchanged: true }; }

  // منع التكرار مع أي مستخدم آخر
  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      var rowNum = i + 2;
      if (rowNum !== targetRow && String(existing[i][0] || "").trim() === newUsername) {
        return { success: false, error: "اسم المستخدم موجود بالفعل" };
      }
    }
  }

  sheet.getRange(targetRow, 1).setValue(newUsername);
  try {
    var session = validateSession_(authToken);
    logChange_((session && session.username) || "admin", "تعديل اسم مستخدم", oldUsername, "اسم المستخدم", oldUsername, newUsername);
  } catch (e) {}
  clearAllCache();
  return { success: true };
}

// يغيّر الاسم الكامل لمستخدم موجود (العمود C / FullName) — صلاحية admin فقط، بلا قيد تكرار (الأسماء قد تتكرر).
function updateUserFullName(authToken, targetRow, newFullName) {
  requireAdminPermission_(authToken);
  if (!targetRow) throw new Error("بيانات غير مكتملة");
  newFullName = String(newFullName || "").trim();
  if (!newFullName) return { success: false, error: "الاسم الكامل لا يمكن أن يكون فارغاً" };

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  var oldFullName = String(sheet.getRange(targetRow, 3).getValue() || "").trim();
  if (oldFullName === newFullName) { clearAllCache(); return { success: true, unchanged: true }; }

  sheet.getRange(targetRow, 3).setValue(newFullName);
  try {
    var session = validateSession_(authToken);
    var uname = String(sheet.getRange(targetRow, 1).getValue() || "").trim();
    logChange_((session && session.username) || "admin", "تعديل اسم مستخدم", uname, "الاسم الكامل", oldFullName, newFullName);
  } catch (e) {}
  clearAllCache();
  return { success: true };
}

// يزيل قاعدة التحقق (Data Validation) القديمة عن عمود الصلاحيات (E) بالكامل —
// كانت تسمح فقط بـ admin/ADD/EDIT/APPROVE/PRINT/REMOVE فترفض الرموز الجديدة screen.cap
function _clearUsersPermsValidation_(sheet) {
  try {
    var lastRow = Math.max(sheet.getLastRow(), 2);
    sheet.getRange(2, 5, lastRow - 1, 1).setDataValidation(null);
  } catch (e) { Logger.log('clear perms validation failed: ' + e); }
}


/* ============================================================
   🛡️ جلسات الدخول (Session Tokens) - إضافة جديدة
   تمنع استدعاء أي دالة من المتصفح مباشرة بدون تسجيل دخول فعلي
   ============================================================ */

var SESSION_DURATION_SECONDS = 1800; // 30 دقيقة من عدم النشاط

// ينشئ رمز جلسة عشوائي بعد نجاح تسجيل الدخول ويخزّنه مؤقتاً في Cache
function createSession_(username, fullName, permissions) {
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  var sessionData = JSON.stringify({
    username: username,
    fullName: fullName,
    permissions: permissions,
    createdAt: new Date().getTime()
  });
  cache.put('session_' + token, sessionData, SESSION_DURATION_SECONDS);
  return token;
}

// يتحقق من صلاحية رمز الجلسة قبل تنفيذ أي دالة حساسة
function validateSession_(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var sessionData = cache.get('session_' + token);
  if (!sessionData) return null;
  try {
    return JSON.parse(sessionData);
  } catch (e) {
    return null;
  }
}

// دالة الحماية المستخدمة في بداية كل دالة حساسة - ترمي خطأ لو الجلسة غير صالحة
function requireAuth_(token) {
  var session = validateSession_(token);
  if (!session) {
    throw new Error("جلسة غير صالحة أو منتهية - يرجى تسجيل الدخول مرة أخرى");
  }
  // تجديد الجلسة تلقائياً طالما المستخدم نشط (Sliding Session)
  var cache = CacheService.getScriptCache();
  cache.put('session_' + token, JSON.stringify(session), SESSION_DURATION_SECONDS);
  return session;
}

// نسخة أوسع تُستخدم فقط في الدوال التي قد تُستدعى من صفحة الطباعة نفسها
// تقبل إما رمز جلسة دخول عادي (من الشاشة الرئيسية) أو رمز طباعة صالح (من صفحة الطباعة المفتوحة برابط آمن)
function requireAuthOrPrintToken_(token) {
  var session = validateSession_(token);
  if (session) return session;

  var bookingId = resolvePrintAccessToken_(token);
  if (bookingId) return { viaPrintToken: true, bookingId: bookingId };

  throw new Error("جلسة غير صالحة أو منتهية - يرجى تسجيل الدخول مرة أخرى");
}

// تسجيل الخروج - يلغي الجلسة فوراً من جهة السيرفر
function logoutUserSession(token) {
  if (token) {
    var session = validateSession_(token);
    if (session && session.username) {
      logChange_(session.username, "تسجيل خروج", "-", "خروج من النظام", "-", "-");
    }
    CacheService.getScriptCache().remove('session_' + token);
  }
  return { success: true };
}


/* ============================================================
   🔗 رموز وصول صفحة الطباعة (Print Access Tokens) - إضافة جديدة
   تُستبدل بها أرقام الإشعار الظاهرة في رابط الطباعة، بحيث لا يمكن
   لأي شخص تخمين أو تجربة أرقام إشعارات أخرى من العنوان مباشرة
   ============================================================ */

var PRINT_TOKEN_DURATION_SECONDS = 86400; // 24 ساعة - مدة كافية للمشاركة

// تُستدعى من داخل النظام بعد تسجيل الدخول فقط، عند الضغط على "طباعة" أو "مشاركة"
function generatePrintAccessToken(authToken, bookingId) {
  requireAuth_(authToken);
  if (!bookingId) {
    throw new Error("رقم الإشعار مطلوب");
  }
  var printToken = Utilities.getUuid() + '-' + Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put('printtoken_' + printToken, String(bookingId), PRINT_TOKEN_DURATION_SECONDS);
  Logger.log("✅ تم إنشاء توكن طباعة: " + printToken + " لرقم الإشعار: " + bookingId); // إضافة مؤقتة
  return { token: printToken };
}



// يتحقق من رمز صفحة الطباعة ويرجع رقم الإشعار المرتبط به، أو null لو غير صالح/منتهي
function resolvePrintAccessToken_(printToken) {
  if (!printToken) return null;
  var cache = CacheService.getScriptCache();
  var bookingId = cache.get('printtoken_' + printToken);
  Logger.log("🔍 محاولة قراءة توكن: " + printToken + " | النتيجة: " + bookingId); // إضافة مؤقتة
  return bookingId || null;
}


/* ============================================================
   🚀 نظام Cache الذكي

   يخزن بيانات الحجوزات والتحركات في Cache مؤقت لمدة 5 دقائق
   لتقليل وقت التحميل من 3-5 ثوانٍ إلى أقل من ثانية
   ============================================================ */

var CACHE_DURATION = 300; // 5 دقائق بالثواني

/* ============================================================
   📁 نظام المجلدات الموحّد — الدالة الوحيدة للوصول لأي مجلد Drive
   جميع مجلدات البرنامج تحت مجلد رئيسي واحد قابل للتعديل من شاشة الإعدادات.
   المعرّفات تُخزَّن في PropertiesService ولا تُكتب في الكود أبداً.
   
   المجلدات الافتراضية (تُنشأ تلقائياً عند أول استخدام):
     ROOT           → SmartManager_Files
     ROOT/Notices   → ملفات إشعارات الوصول المطبوعة
     ROOT/Tickets   → تذاكر الطيران المحلّلة
     ROOT/Logos     → شعارات الشركات
     ROOT/Exports   → ملفات Excel التصديرية
     ROOT/Temp      → ملفات PDF المؤقتة للمشاركة (تُحذف تلقائياً)
   ============================================================ */

var FOLDER_KEYS = {
  ROOT:    'FOLDER_ID_ROOT',
  NOTICES: 'FOLDER_ID_NOTICES',
  TICKETS: 'FOLDER_ID_TICKETS',
  LOGOS:   'FOLDER_ID_LOGOS',
  EXPORTS: 'FOLDER_ID_EXPORTS',
  TEMP:    'FOLDER_ID_TEMP',
  BACKUPS: 'FOLDER_ID_BACKUPS'
};

var FOLDER_DEFAULTS = {
  ROOT:    null,   // يُحدَّد ديناميكياً من اسم الشيت عند أول استخدام (انظر getDriveFolder_)
  NOTICES: 'Notices',
  TICKETS: 'Tickets',
  LOGOS:   'Logos',
  EXPORTS:  'Exports',
  TEMP:    'Temp',
  BACKUPS: 'Backups'
};

/**
 * الدالة المركزية للحصول على أي مجلد من مجلدات البرنامج.
 * @param {string} key  — أحد مفاتيح FOLDER_KEYS (ROOT/NOTICES/TICKETS/LOGOS/EXPORTS/TEMP)
 * @returns {Folder} — كائن مجلد Drive جاهز للاستخدام
 */
function getDriveFolder_(key) {
  var props = PropertiesService.getScriptProperties();

  // ===== الجذر (ROOT) =====
  if (key === 'ROOT') {
    var rootId = props.getProperty(FOLDER_KEYS.ROOT);
    if (rootId) {
      try { return DriveApp.getFolderById(rootId); } catch(e) { /* حُذف، سننشئ جديداً */ }
    }
    var rootName = props.getProperty('FOLDER_NAME_ROOT') ||
                   getSpreadsheet_().getName() ||  // اسم الشيت عند أول استخدام فقط
                   'SmartManager_Files';            // احتياطي أخير
    // ابحث إن كان موجوداً بالاسم أولاً (تجنّب تكرار الإنشاء)
    var existing = DriveApp.getFoldersByName(rootName);
    var rootFolder = existing.hasNext() ? existing.next() : DriveApp.createFolder(rootName);
    props.setProperty(FOLDER_KEYS.ROOT, rootFolder.getId());
    return rootFolder;
  }

  // ===== المجلدات الفرعية =====
  var subId = props.getProperty(FOLDER_KEYS[key]);
  if (subId) {
    try { return DriveApp.getFolderById(subId); } catch(e) { /* حُذف */ }
  }

  // أنشئ المجلد الفرعي داخل ROOT
  var root = getDriveFolder_('ROOT');
  var subName = props.getProperty('FOLDER_NAME_' + key) || FOLDER_DEFAULTS[key];

  // ابحث إن كان موجوداً داخل ROOT بالاسم
  var children = root.getFoldersByName(subName);
  var subFolder = children.hasNext() ? children.next() : root.createFolder(subName);
  props.setProperty(FOLDER_KEYS[key], subFolder.getId());
  return subFolder;
}

/**
 * يُرجع بيانات المجلدات الحالية (الأسماء والمعرّفات والروابط) لعرضها في شاشة الإعدادات.
 */
function getFolderSettings_() {
  var props = PropertiesService.getScriptProperties();
  var result = {};
  Object.keys(FOLDER_KEYS).forEach(function(key) {
    var id = props.getProperty(FOLDER_KEYS[key]);
    var customName = props.getProperty('FOLDER_NAME_' + key);
    var displayName = customName || FOLDER_DEFAULTS[key];
    var url = '';
    var exists = false;
    if (id) {
      try {
        var f = DriveApp.getFolderById(id);
        url = f.getUrl();
        exists = true;
        displayName = customName || f.getName();
      } catch(e) { /* حُذف */ }
    }
    result[key] = { id: id || '', name: displayName, url: url, exists: exists };
  });
  return result;
}

/**
 * يُعيد ربط مجلد بمعرّف جديد أو ينشئه من مسار جديد — يُستدعى من شاشة الإعدادات
 * @param {string} key        — مفتاح المجلد
 * @param {string} newName    — الاسم الجديد (اختياري)
 * @param {string} newFolderId — معرّف Drive موجود (اختياري، يُفضَّل على الاسم)
 */
function updateFolderSetting_(key, newName, newFolderId) {
  var props = PropertiesService.getScriptProperties();
  if (!FOLDER_KEYS[key]) throw new Error('مفتاح مجلد غير معروف: ' + key);

  if (newFolderId) {
    // تحقق من وجود المجلد فعلاً
    var f = DriveApp.getFolderById(newFolderId);
    props.setProperty(FOLDER_KEYS[key], newFolderId);
    if (newName) props.setProperty('FOLDER_NAME_' + key, newName);
    // إذا غيّرنا ROOT، نمسح معرّفات الفروع حتى تعاد ربطها تلقائياً داخل الجذر الجديد
    if (key === 'ROOT') {
      ['NOTICES','TICKETS','LOGOS','EXPORTS','TEMP'].forEach(function(k) {
        props.deleteProperty(FOLDER_KEYS[k]);
      });
    }
    return { success: true, name: f.getName(), url: f.getUrl() };
  }

  if (newName) {
    props.setProperty('FOLDER_NAME_' + key, newName);
    // مسح الـ ID القديم حتى يُعاد البحث/الإنشاء بالاسم الجديد
    props.deleteProperty(FOLDER_KEYS[key]);
    if (key === 'ROOT') {
      ['NOTICES','TICKETS','LOGOS','EXPORTS','TEMP'].forEach(function(k) {
        props.deleteProperty(FOLDER_KEYS[k]);
      });
    }
    return { success: true, message: 'سيتم إنشاء المجلد بالاسم الجديد عند أول استخدام' };
  }

  throw new Error('يرجى تحديد اسم أو معرّف للمجلد');
}


// أقصى عدد أجزاء نتوقعه عمليًا (يُستخدم لتنظيف مفاتيح الأجزاء القديمة عند الكتابة فوقها)
var _CACHE_MAX_CHUNKS_ = 30;

function getCachedData(key) {
  try {
    var cache = CacheService.getScriptCache();
    var isChunked = cache.get(key + '_chunked');

    if (isChunked === 'true') {
      // البيانات مخزّنة على أجزاء — لازم نجمّعها بنفس الترتيب قبل الـ parse
      var countStr = cache.get(key + '_count');
      if (!countStr) return null; // انتهت صلاحية مفتاح العدّ = كاش غير مكتمل، اعتبره miss

      var count = parseInt(countStr, 10);
      if (!count || count <= 0) return null;

      var chunkKeys = [];
      for (var i = 0; i < count; i++) chunkKeys.push(key + '_' + i);

      // قراءة كل الأجزاء دفعة واحدة بدل loop من نداءات .get منفصلة
      var chunksMap = cache.getAll(chunkKeys);

      var json = '';
      for (var j = 0; j < count; j++) {
        var part = chunksMap[key + '_' + j];
        if (part === undefined || part === null) return null; // جزء ناقص/منتهي = miss آمن
        json += part;
      }

      return JSON.parse(json);
    }

    var cached = cache.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch(e) {
    Logger.log('Cache read error: ' + e);
  }
  return null;
}

function setCachedData(key, data) {
  try {
    var cache = CacheService.getScriptCache();
    var json = JSON.stringify(data);

    // Cache يقبل حتى 100KB لكل مفتاح - لو البيانات أكبر نحفظها في أجزاء
    if (json.length < 90000) {
      cache.put(key, json, CACHE_DURATION);
      // امسح أي أجزاء قديمة كانت متخزنة من كتابة سابقة أكبر، عشان القراءة القادمة
      // ما تلاقيش key_chunked='true' قديم وتحاول تجمّع أجزاء غير موجودة/غير متطابقة
      cache.remove(key + '_chunked');
      cache.remove(key + '_count');
    } else {
      // بيانات كبيرة: نحفظ في أجزاء
      var parts = [];
      var chunkSize = 80000;
      for (var i = 0; i < json.length; i += chunkSize) {
        parts.push(json.slice(i, i + chunkSize));
      }

      // ⚡ كتابة كل الأجزاء + العدّاد في نداء putAll واحد (بدل put منفصل لكل جزء)
      var putMap = { };
      putMap[key + '_count'] = parts.length.toString();
      parts.forEach(function(part, idx) { putMap[key + '_' + idx] = part; });
      cache.putAll(putMap, CACHE_DURATION);

      // ⚡ مسح القيمة غير المجزّأة القديمة + أي أجزاء يتيمة زائدة في removeAll واحد
      var rm = [key];
      for (var k = parts.length; k < _CACHE_MAX_CHUNKS_; k++) rm.push(key + '_' + k);
      cache.removeAll(rm);

      // نكتب علامة الـ chunked في الآخر لضمان إن أي قراءة متزامنة ما تشوفهاش "true"
      // إلا وكل الأجزاء وعدّها اتكتبوا فعلاً (تقليل احتمال race قصير جدًا)
      cache.put(key + '_chunked', 'true', CACHE_DURATION);
    }
  } catch(e) {
    Logger.log('Cache write error: ' + e);
  }
}

// مفاتيح الـ Cache المركزية (تُستخدم في clearAllCache وكل دالة تضع بيانات في الـ Cache)
var ALL_CACHE_KEYS = [
  'bookings_cache',
  'movements_cache',
  'dropdowns_cache',
  'users_cache',
  'agents_cache',
  'dashboard_cache',
  'folder_meta_cache',
  'trips_list_cache',   // قائمة الرحلات (تقرأ 3 شيتات — تُمسح مع أي تعديل رحلة/كشف)
  'registry_cache',     // السجل العام للمعتمرين
  'ministry_bootstrap_cache' // 🏛️ (V4.109) بيانات شاشة مراجعة ملفات الوزارة المشتركة بين المستخدمين
];

function clearAllCache() {
  try {
    var cache = CacheService.getScriptCache();
    // ⚡ مسح كل المفاتيح (الأساسية + chunked/count + كل الأجزاء) في نداء removeAll واحد
    // بدلاً من مئات نداءات cache.remove المنفصلة التي كانت تستغرق 10-26 ثانية
    var keys = [];
    ALL_CACHE_KEYS.forEach(function(key) {
      keys.push(key, key + '_chunked', key + '_count');
      for (var i = 0; i < _CACHE_MAX_CHUNKS_; i++) keys.push(key + '_' + i);
    });
    cache.removeAll(keys);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// نقطة دخول جديدة للمتصفح فقط - تتحقق من الجلسة ثم تستدعي الدالة الأصلية كما هي بدون أي تعديل عليها
function clearAllCacheAuth(authToken) {
  requireAuth_(authToken);
  return clearAllCache();
}

// نسخة محسّنة من getAllBookings مع Cache
function getAllBookings() {
  // حاول قراءة من Cache أولاً
  var cached = getCachedData('bookings_cache');
  if (cached) {
    return cached;
  }

  // لو مفيش cache، اقرأ من الشيت
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Bookings");
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  // 🔒 قراءة بأسماء الأعمدة (مستقلة عن الترتيب) — نقرأ كل الأعمدة حتى تظهر الحقول 33-36 (سعر الباص/القيمة/الرحلة)
  var C = _robustColMap_(sheet, BOOKINGS_HEADERS_);
  var B = _cellReader_(C, BOOKINGS_COL_);
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var list = [];

  data.forEach(function(r) {
    if(!B(r, 'id')) return;
    
    var formatDateString = function(cellVal) {
      if (!cellVal) return "";
      if (cellVal instanceof Date) {
        var d = cellVal.getDate();
        var m = cellVal.getMonth() + 1;
        var y = cellVal.getFullYear();
        return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
      }
      var s = cellVal.toString().trim();
      // نص Date.toString() خام (مثل "Sat Dec 30 1899 01:35:00 GMT+0205") — حوّله لتاريخ نظيف
      if (/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(s)) {
        var dd = new Date(s);
        if (!isNaN(dd.getTime())) {
          var d2 = dd.getDate(), m2 = dd.getMonth() + 1, y2 = dd.getFullYear();
          return (d2 < 10 ? '0' + d2 : d2) + '/' + (m2 < 10 ? '0' + m2 : m2) + '/' + y2;
        }
      }
      return s;
    };

    // 🕐 تحويل خلية الوقت (Date أو نص خام) إلى "HH:mm" نظيف قبل إرسالها للعميل
    var formatTimeString = function(cellVal) {
      if (!cellVal) return "";
      if (cellVal instanceof Date) {
        var h = cellVal.getHours(), mn = cellVal.getMinutes();
        return (h < 10 ? '0' + h : h) + ':' + (mn < 10 ? '0' + mn : mn);
      }
      var s = cellVal.toString().trim();
      // وقت نظيف "HH:mm" مسبقاً
      var mt = s.match(/^(\d{1,2}):(\d{2})/);
      if (mt && !/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(s)) {
        return ('0' + mt[1]).slice(-2) + ':' + mt[2];
      }
      // نص Date.toString() خام — استخرج الوقت منه
      var td = new Date(s);
      if (!isNaN(td.getTime())) {
        var h2 = td.getHours(), mn2 = td.getMinutes();
        return (h2 < 10 ? '0' + h2 : h2) + ':' + (mn2 < 10 ? '0' + mn2 : mn2);
      }
      return s;
    };

    var _bp = B(r, 'busPrice'), _ov = B(r, 'operationValue');
    list.push({
      status: B(r, 'status') ? B(r, 'status').toString() : "",
      id: B(r, 'id').toString(),
      agent: B(r, 'agent') ? B(r, 'agent').toString() : "",
      company: B(r, 'company') ? B(r, 'company').toString() : "",
      groupNumbers: B(r, 'groupNumbers') ? B(r, 'groupNumbers').toString() : "",
      client: B(r, 'client') ? B(r, 'client').toString() : "",
      count: B(r, 'count') ? B(r, 'count').toString() : "0",
      supervisor: B(r, 'supervisor') ? B(r, 'supervisor').toString() : "",
      travelMethod: B(r, 'travelMethod') ? B(r, 'travelMethod').toString() : "",
      arrivalPort: B(r, 'arrivalPort') ? B(r, 'arrivalPort').toString() : "",
      arrivalDate: formatDateString(B(r, 'arrivalDate')),
      arrivalTime: formatTimeString(B(r, 'arrivalTime')),
      arrivalFlight: B(r, 'arrivalFlight') ? B(r, 'arrivalFlight').toString() : "",
      departureDate: formatDateString(B(r, 'departureDate')),
      departureFlight: B(r, 'departureFlight') ? B(r, 'departureFlight').toString() : "",
      departureTime: formatTimeString(B(r, 'departureTime')),
      departurePort: B(r, 'departurePort') ? B(r, 'departurePort').toString() : "",
      transportCompany: B(r, 'transportCompany') ? B(r, 'transportCompany').toString() : "",
      operationNo: B(r, 'operationNo') ? B(r, 'operationNo').toString() : "",
      busCount: B(r, 'busCount') ? B(r, 'busCount').toString() : "",
      direction: B(r, 'direction') ? B(r, 'direction').toString() : "",
      madinahNights: B(r, 'madinahNights') ? B(r, 'madinahNights').toString() : "0",
      makkahNights: B(r, 'makkahNights') ? B(r, 'makkahNights').toString() : "0",
      madinahHotel: B(r, 'madinahHotel') ? B(r, 'madinahHotel').toString() : "",
      madinahCheckIn: formatDateString(B(r, 'madinahCheckIn')),
      madinahCheckOut: formatDateString(B(r, 'madinahCheckOut')),
      makkahHotel: B(r, 'makkahHotel') ? B(r, 'makkahHotel').toString() : "",
      makkahCheckIn: formatDateString(B(r, 'makkahCheckIn')),
      makkahCheckOut: formatDateString(B(r, 'makkahCheckOut')),
      internalTransferDate: formatDateString(B(r, 'internalTransferDate')),
      internalTransferTime: formatTimeString(B(r, 'internalTransferTime')),
      extraMovements: B(r, 'extraMovements') ? B(r, 'extraMovements').toString() : "[]",
      notes: B(r, 'notes') ? B(r, 'notes').toString() : "",
      ticketUrl: B(r, 'ticketUrl') ? B(r, 'ticketUrl').toString() : "",
      ticketFileId: B(r, 'ticketFileId') ? B(r, 'ticketFileId').toString() : "",
      busPrice: (_bp !== undefined && _bp !== "") ? Number(_bp) : "",
      operationValue: (_ov !== undefined && _ov !== "") ? Number(_ov) : "",
      tripName: B(r, 'tripName') ? B(r, 'tripName').toString() : "",
      groupName: B(r, 'groupName') ? B(r, 'groupName').toString() : "" // 🏷️ (V4.16) شاشة فقط — لا يظهر بالطباعة
    });
  });
  
  // 💠 (V4.06) وسم إشعارات البوت بأثر رجعي من سجل التعديلات (إنشاء بواسطة TelegramBot) —
  // لا يعتمد على نص الملاحظات، فيظل الوسم صحيحًا حتى لو عُدِّلت الملاحظات لاحقًا
  try {
    var aSheet = getSpreadsheet_().getSheetByName('AuditLog');
    if (aSheet && aSheet.getLastRow() >= 2) {
      var botIds = {};
      aSheet.getRange(2, 2, aSheet.getLastRow() - 1, 3).getValues().forEach(function(ar) {
        if (String(ar[0]) === 'TelegramBot' && String(ar[1]).indexOf('إنشاء إشعار') > -1) botIds[String(ar[2])] = true;
      });
      list.forEach(function(bk) { if (botIds[String(bk.id)]) bk.viaBot = true; });
    }
  } catch (eVb) { Logger.log('viaBot tagging failed: ' + eVb); }

  var result = list.reverse();
  // احفظ في Cache
  setCachedData('bookings_cache', result);
  return result;
}

// نقطة دخول جديدة للمتصفح فقط - الدالة الأصلية تبقى بلا أي تعديل وتستمر بالعمل داخلياً كما كانت
function getAllBookingsAuth(authToken) {
  requireAuth_(authToken);
  return getAllBookings();
}

// نسخة محسّنة من getAllMovements مع Cache
function getAllMovements() {
  // حاول قراءة من Cache أولاً
  var cached = getCachedData('movements_cache');
  if (cached) {
    return cached;
  }

  var sheet = getSpreadsheet_().getSheetByName("Movements");
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var result = [];

  var formatDateString = function(cellVal) {
    if (!cellVal) return "";
    if (cellVal instanceof Date) {
      var d = cellVal.getDate();
      var m = cellVal.getMonth() + 1;
      var y = cellVal.getFullYear();
      return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
    }
    return cellVal.toString().trim();
  };

  for (var i = 1; i < data.length; i++) {
    if (!data[i][1]) continue;
    result.push({
      status: data[i][0] ? data[i][0].toString() : "",
      bookingId: data[i][1].toString(),
      movementDate: formatDateString(data[i][2]),
      movementTime: cleanMovementTime(data[i][3]),
      movementType: data[i][4] ? data[i][4].toString().trim() : "",
      agent: data[i][5] ? data[i][5].toString() : "",
      company: data[i][6] ? data[i][6].toString() : "",
      client: data[i][7] ? data[i][7].toString() : "",
      count: data[i][8] ? data[i][8].toString() : "0",
      supervisor: data[i][9] ? data[i][9].toString() : "",
      buses: data[i][10] ? data[i][10].toString() : ""
    });
  }

  // 🚌 (V4.123) توسيم كل تحرك بـ hasTransport (نفس شرط تنبيهات تليجرام: وكيل نقل + باصات فعلية،
  // وليس "بمعرفة العميل") — يتيح للوحة التحكم عرض تحركات اليوم/الغد التي لها نقل افتراضياً بلا
  // أي نداء سيرفر إضافي، مع زر تبديل لإظهار الباقي أيضاً
  try {
    var _byId = {};
    getAllBookings().forEach(function(b) { _byId[b.id] = b; });
    result.forEach(function(m) { m.hasTransport = _tgHasTransport_(m, _byId); });
  } catch (e) {
    result.forEach(function(m) { m.hasTransport = true; }); // تعذّر التوسيم — لا نُخفي شيئاً افتراضياً
  }

  // احفظ في Cache
  setCachedData('movements_cache', result);
  return result;
}

// نقطة دخول جديدة للمتصفح فقط - الدالة الأصلية تبقى بلا أي تعديل وتستمر بالعمل داخلياً كما كانت
function getAllMovementsAuth(authToken) {
  requireAuth_(authToken);
  return getAllMovements();
}


/* ============================================================
   📊 لوحة الإحصائيات (Dashboard)
   تُرجع إحصائيات شاملة: أقرب وصول، رحلات 72 ساعة،
   تحركات اليوم والغد، إشعارات غير معتمدة
   ============================================================ */



/* ============================================================
   🔔 نظام التنبيهات التلقائية بالإيميل
   يُرسل تنبيهاً قبل اي تحركات بيوم أو يومين
   شغّله كـ Time-driven Trigger يومياً الساعة 3عصراً
   ============================================================ */

// بريد الإشعارات - غيّره لعنوانك الفعلي
// بريد التنبيهات يُقرأ من Script Properties (يُضبط من شاشة الإعدادات)
var NOTIFICATION_EMAIL = PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAILS') || "";

/**
 * يبني ويرسل تقرير التنبيه اليومي بالبريد (وصول/مغادرة اليوم والغد).
 * 📞 يُستدعى من:
 *   - Trigger زمني يومي (يُضبط عبر setupDailyAlertTrigger — الساعة تُقرأ من EMAIL_ALERT_HOUR)
 *   - testSendAlerts() يدوياً من شاشة الإعدادات (زر "اختبار الإرسال الآن")
 * ⚠️ Apps Script بينادي عليها بالاسم كسلسلة نصية (ScriptApp.newTrigger('sendArrivalAlerts'))،
 *    فلو غيّرت اسم الدالة لازم تُعيد ضبط الـ Trigger من شاشة الإعدادات وإلا هيفضل بيحاول ينادي اسم غير موجود
 */
function sendArrivalAlerts() {

  // 🔕 (V4.125) مفتاح التفعيل من قسم التنبيهات بشاشة الإعدادات
  if (!_notifEnabled_('email_tomorrow')) { Logger.log('email_tomorrow alert disabled from settings'); return { ok: true, sent: 0, disabled: true }; }

  try {

    // 🚫 (V4.71) نفس فلتر تنبيهات تيليجرام — استبعاد التحركات بشركة نقل أو عدد باصات = «النقل بمعرفة العميل»
    const movements =
      _tgAlertableMovements_(getAllMovements());

    const now =
      new Date();

    const tomorrow =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );

    const targetDate =
      Utilities.formatDate(
        tomorrow,
        Session.getScriptTimeZone(),
        'dd/MM/yyyy'
      );

    // =========================
    // تحركات الغد فقط
    // =========================

    const tomorrowMovements =

      movements.filter(m =>

        String(
          m.movementDate
        ).trim()

        ===

        targetDate

      );

    // =========================
    // لا ترسل شيء لو لا يوجد
    // =========================

    if(
      !tomorrowMovements.length
    ){

      Logger.log(
        'لا توجد تحركات غداً'
      );

      return {
        sent:0
      };
    }

    // =========================
    // عنوان الإيميل
    // =========================

    const subject =

      'تنبيهات التشغيل ليوم ' +

      targetDate;

    // =========================
    // بناء HTML
    // =========================

    let body = `

    <div
      dir="rtl"
      style="
      font-family:Tahoma;
      font-size:14px;
      color:#222;
      ">

      <h2
        style="
        color:#0f766e;
        border-bottom:
        3px solid #14b8a6;
        padding-bottom:8px;
        ">

        تنبيهات تشغيل الغد

      </h2>

<div
style="
margin-bottom:15px;
font-size:15px;
background:#f8fafc;
padding:12px;
border-radius:8px;
border-right:4px solid #0f766e;
line-height:1.8;
">

<b>
جميع تحركات يوم
${targetDate}
</b>

<br>

عدد التحركات:
<b>
${tomorrowMovements.length}
</b>

</div>
    `;

    body +=
      buildMovementAlertTable(
        tomorrowMovements
      );

    body += `

      <hr>

      <div
        style="
        color:#64748b;
        font-size:12px;
        ">

        تم الإرسال تلقائياً
        من نظام التشغيل

      </div>

    </div>
    `;

    // =========================
    // إرسال الإيميل
    // =========================

    GmailApp.sendEmail(

      NOTIFICATION_EMAIL,

      subject,

      '',

      {

        htmlBody:
          body,

        name:
          'نظام التشغيل'

      }

    );

    Logger.log(
      'تم إرسال ' +
      tomorrowMovements.length +
      ' تحرك'
    );

    return {

      sent:
      tomorrowMovements.length

    };

  }

  catch(err){

    Logger.log(
      err
    );

    return {

      error:
      err.toString()

    };
  }
}

function buildMovementAlertTable(
  rows
){

  let html = `

  <table
    dir="rtl"
    style="
      width:100%;
      border-collapse:
      collapse;
      text-align:center;
      font-family:Tahoma;
      font-size:13px;
    ">

    <thead>

      <tr
        style="
        background:#0f766e;
        color:#fff;
        ">

        <th style="padding:8px;border:1px solid #ddd;">
          رقم الإشعار
        </th>

        <th style="padding:8px;border:1px solid #ddd;">
          الوقت
        </th>

        <th style="padding:8px;border:1px solid #ddd;">
          نوع التحرك
        </th>

        <th style="padding:8px;border:1px solid #ddd;">
          العميل
        </th>

        <th style="padding:8px;border:1px solid #ddd;">
          الشركة
        </th>

        <th style="padding:8px;border:1px solid #ddd;">
  الوكيل السعودي
</th>


        <th style="padding:8px;border:1px solid #ddd;">
          المشرف
        </th>

        <th style="padding:8px;border:1px solid #ddd;">
          العدد
        </th>

      </tr>

    </thead>

    <tbody>
  `;

  rows.forEach((r,i)=>{

    const bg =

      i % 2 === 0
      ? '#f8fafc'
      : '#fff';

    html += `

    <tr
      style="
      background:${bg};
      ">

      <td style="padding:8px;border:1px solid #ddd;">
        ${r.bookingId || ''}
      </td>

      <td style="padding:8px;border:1px solid #ddd;">
        ${r.movementTime || ''}
      </td>

      <td style="
      padding:8px;
      border:1px solid #ddd;
      text-align:right;
      ">
        ${r.movementType || ''}
      </td>

      <td style="padding:8px;border:1px solid #ddd;">
        ${r.client || ''}
      </td>

      <td style="padding:8px;border:1px solid #ddd;">
        ${r.company || ''}
      </td>

      <td style="padding:8px;border:1px solid #ddd;">
  ${r.agent || ''}
</td>


      <td style="padding:8px;border:1px solid #ddd;">
        ${r.supervisor || ''}
      </td>

      <td style="padding:8px;border:1px solid #ddd;">
        ${r.count || ''}
      </td>

    </tr>
    `;
  });

  html += `
    </tbody>
  </table>
  `;

  return html;
}


// دالة لإنشاء التريجر التلقائي اليومي
function setupDailyAlertTrigger() {
  // احذف أي تريجر قديم للدالة نفسها
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendArrivalAlerts') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // الساعة من الإعدادات (الافتراضي 15 = 3 عصراً)
  var hour = parseInt(PropertiesService.getScriptProperties().getProperty('EMAIL_ALERT_HOUR') || '15');
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 15;

  ScriptApp.newTrigger('sendArrivalAlerts')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .create();

  return '✅ تم ضبط تنبيه البريد اليومي الساعة ' + hour + ':00';
}

// دالة اختبار التنبيهات يدوياً
function testSendAlerts() {
  try {
    var result = sendArrivalAlerts();
    if (result.error) {
      return '❌ فشل إرسال تنبيه البريد: ' + result.error;
    }
    return '✅ تم إرسال تنبيه البريد بنجاح. عدد الإشعارات المُرسَلة: ' + (result.sent || 0);
  } catch(e) {
    return '❌ خطأ: ' + e.message;
  }
}



/* ============================================================
   📱 تنبيهات تيليجرام
   ============================================================ */

// إعدادات تيليجرام تُقرأ من Script Properties (تُضبط من شاشة الإعدادات)
// لا توجد قيم احتياطية مُضمَّنة في الكود لأسباب أمنية
var TELEGRAM_CONFIG = {
  token: PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN') || "",
  chatId: PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID') || ""
};

// 📣 (V4.18) نفس منطق sendTelegramMessage لكن لأي chatId — أساس تعدد جروبات تنبيهات الحركات
function _tgSendMarkdownTo_(chatId, message) {
  try {
    var url = "https://api.telegram.org/bot" + TELEGRAM_CONFIG.token + "/sendMessage";
    var payload = { chat_id: chatId, text: message, parse_mode: "Markdown" };
    var options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());
    Logger.log("Telegram response (" + chatId + "): " + JSON.stringify(result));
    return { success: result.ok, error: result.ok ? '' : (result.description || 'فشل الإرسال') };
  } catch (e) {
    Logger.log("Telegram error: " + e);
    return { success: false, error: e.toString() };
  }
}

function sendTelegramMessage(message) {
  try {
    var url = "https://api.telegram.org/bot" +
              TELEGRAM_CONFIG.token + "/sendMessage";

    var payload = {
      chat_id: TELEGRAM_CONFIG.chatId,
      text: message,
      parse_mode: "Markdown"
    };

    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());

    Logger.log("Telegram response: " + JSON.stringify(result));
    return { success: result.ok };

  } catch(e) {
    Logger.log("Telegram error: " + e);
    return { success: false, error: e.toString() };
  }
}


// 🚫 فلتر تنبيهات تليجرام: تُستبعد التحركات التي نقلها «بمعرفة العميل» أو بدون شركة نقل مسجَّلة
// (شركة النقل مسجّلة على مستوى الإشعار، فنبحث عنها بربط التحرك برقم إشعاره)
// 🏷️ (V4.100) تصنيف مختصر لنوع التحرك يُكتَب قبل بيانه في تنبيهات تيليجرام — استقبال/مغادرة/تحرك
// داخلي، مستخرج من نص البيان نفسه (لا حقل مستقل بالبيانات). أي نوع آخر غير هذه الثلاثة (مزارات
// وغيرها) يبقى بلا تصنيف كما هو — بطلب صريح
function _tgMovementLabel_(type) {
  type = String(type || '');
  var mDep = type.match(/^التوجه إلى (.+?) للمغادرة/);
  if (mDep) return 'مغادرة من ' + mDep[1];
  var mArr = type.match(/^استقبال(?: وصول)? من (.+?) على رحلة/);
  if (mArr) return 'وصول ' + mArr[1];
  if (/^التحرك من /.test(type)) return 'تحرك داخلي';
  return '';
}
// 🚌 (V4.123) الشرط المشترك لـ"له نقل فعلي" (وكيل + باصات) — مُستخرَج هنا ليُستخدم في مكانين:
// فلترة تنبيهات تليجرام (كما كان)، وتوسيم كل تحرك بحقل hasTransport في getAllMovements حتى
// تقدر شاشة لوحة التحكم تعرض نفس تصفية تليجرام افتراضياً بدون أي نداء سيرفر إضافي
function _tgHasTransport_(m, byId) {
  var b = byId[String(m.bookingId)];
  if (!b) return true; // إشعار غير موجود (محذوف؟) — لا نستبعد ما لا نعرفه
  var tc = String(b.transportCompany || '').trim();
  if (!tc) return false;                          // بدون شركة نقل
  if (tc.indexOf('بمعرفة العميل') > -1) return false; // النقل بمعرفة العميل (شركة النقل)
  // 🚫 (V4.71) بطلب صريح: استبعاد إضافي لو عمود «عدد الباصات» نفسه نصّاً = «النقل بمعرفة العميل»
  // (يحدث عند إسكان استضافة حيث يُكتَب النص في خانة عدد الباصات بدل رقم فعلي)
  var busVal = String(b.busCount || b.buses || '').trim();
  if (busVal.indexOf('بمعرفة العميل') > -1) return false;
  return true;
}
function _tgAlertableMovements_(movements) {
  var byId = {};
  try {
    getAllBookings().forEach(function(b) { byId[b.id] = b; });
  } catch (e) { return movements; } // تعذّر جلب الإشعارات — لا نُسقط التنبيهات كلها بسبب الفلتر
  return movements.filter(function(m) { return _tgHasTransport_(m, byId); });
}

// 📣 (V4.18) إعدادات جروبات تنبيهات الحركات — تعدُّد جروبات، كلٌّ بشركاته الخاصة (فارغة = كل الشركات)
// نفس نمط جروبات بوت تسجيل الإشعارات (TGBN) بالضبط، لكن لتنبيهات «تحركات الغد» تحديدًا
function _tgAlertDefaults_() { return { groups: [] }; } // [{chatId, name, companies:[]}]
function _tgAlertCfg_() {
  var cfg = null;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('TG_ALERT_CFG');
    if (raw) cfg = JSON.parse(raw);
  } catch (e) { cfg = null; }
  var d = _tgAlertDefaults_();
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.groups)) return d;
  return cfg;
}
function getTgAlertGroups(authToken) {
  requireAuth_(authToken);
  return { success: true, groups: _tgAlertCfg_().groups, legacyChatId: TELEGRAM_CONFIG.chatId || '' };
}
function saveTgAlertGroups(authToken, groups) {
  var session = requireAdminPermission_(authToken);
  var clean = [];
  (Array.isArray(groups) ? groups : []).forEach(function(g) {
    var cid = (g && g.chatId || '').toString().trim();
    if (!cid) return;
    var comps = (g && Array.isArray(g.companies)) ? g.companies.map(function(c) { return (c || '').toString().trim(); }).filter(String) : [];
    clean.push({ chatId: cid, name: (g && g.name || '').toString().trim(), companies: comps });
  });
  PropertiesService.getScriptProperties().setProperty('TG_ALERT_CFG', JSON.stringify({ groups: clean }));
  logChange_(session.username, 'تعديل جروبات تنبيهات التليجرام', '-', 'TG_ALERT_CFG', '-', clean.length + ' جروب');
  return { success: true, groups: clean };
}
// 🧪 اختبار فوري: يرسل رسالة تجربة لكل جروب مضبوط ويرجع نتيجة كل واحد
function testTgAlertGroups(authToken) {
  requireAdminPermission_(authToken);
  if (!TELEGRAM_CONFIG.token) return { success: false, error: 'لم يتم ضبط توكن البوت في الإعدادات' };
  var groups = _tgAlertCfg_().groups;
  if (!groups.length) return { success: false, error: 'لا توجد جروبات مضبوطة بعد' };
  var checks = groups.map(function(g, i) {
    var lbl = 'جروب «' + (g.name || ('#' + (i + 1))) + '» (' + g.chatId + ')';
    if (!/^-?\d+$/.test(g.chatId)) return { ok: false, label: lbl, detail: 'المعرّف ليس رقمًا صالحًا' };
    var r = _tgSendMarkdownTo_(g.chatId, '📣 *اختبار تنبيهات التحركات*\nهذا الجروب مضبوط بشكل صحيح ✓\nالشركات: ' +
      (g.companies.length ? g.companies.join('، ') : 'كل الشركات'));
    return { ok: r.success, label: lbl, detail: r.success ? 'وصلت ✓' : (r.error || 'فشل الإرسال') };
  });
  return { success: true, checks: checks };
}

function sendTelegramArrivalAlerts() {
  // 🔕 (V4.125) مفتاح التفعيل من قسم التنبيهات بشاشة الإعدادات
  if (!_notifEnabled_('tg_tomorrow')) { Logger.log('tg_tomorrow alert disabled from settings'); return { sent: 0, disabled: true }; }
  try {
    var movements = _tgAlertableMovements_(getAllMovements());
    var now       = new Date();

    function fmt(d) {
      if (!d) return '';
      return String(d.getDate()).padStart(2,'0') + '/' +
             String(d.getMonth()+1).padStart(2,'0') + '/' +
             d.getFullYear();
    }

    var today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    var todayStr    = fmt(today);
    var tomorrowStr = fmt(tomorrow);

    // ---- تحركات الغد فقط ----
    var movesTomorrow = movements.filter(function(m) {
      return String(m.movementDate).trim() === tomorrowStr;
    });

    // لو لا توجد أي تحركات للغد — لا ترسل شيئاً
    if (movesTomorrow.length === 0) {
      Logger.log('No alerts needed for tomorrow.');
      return { sent: 0 };
    }

    // ===== بناء رسالة التليجرام بتنسيق احترافي لمجموعة تحركات مُحدَّدة =====
    var buildMsg = function(list) {
      var msg = "🕋 *تقرير العمليات - تحركات الغد*\n";
      msg += "📅 تاريخ اليوم: " + todayStr + "\n";
      msg += "━━━━━━━━━━━━━━━━━━\n";
      msg += "\n🔵 *تحركات الغد (" + tomorrowStr + ")* 📋 العدد: (" + list.length + ")\n";
      msg += "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n";
      list.forEach(function(m, i) {
        var _lbl = _tgMovementLabel_(m.movementType);
        msg += "🔹 *(" + (i+1) + ") " + (_lbl ? (_lbl + " : " + m.movementType) : m.movementType) + "*\n";
        msg += "🎫 *رقم الإشعار:* `" + (m.bookingId || "—") + "`\n";
        msg += "👥 *العميل:* " + (m.client || "—") + "\n";
        msg += "⏰ *الساعة:* " + (m.movementTime || "—") + "\n";
        msg += "🚌 *الباصات:* " + (m.buses || "—") + " باص  |  🧑‍🤝‍🧑 *العدد:* " + (m.count || "—") + " معتمر\n";
        msg += "🏢 *الشركة:* " + (m.company || "—") + "\n";
        msg += "🇸🇦 *الوكيل السعودي:* " + (m.agent || "—") + "\n";
        msg += "🧑‍✈️ *المشرف:* " + (m.supervisor || "—") + "\n";
        if (i < list.length - 1) msg += "▪️\n";
      });
      msg += "━━━━━━━━━━━━━━━━━━\n";
      msg += "🤖 *نظام إشعارات رحلات العمرة التلقائي*";
      return msg;
    };

    // 📣 (V4.18) تعدُّد الجروبات: كل جروب يستقبل حركات شركاته المحدَّدة فقط (فارغة = الكل) —
    // بلا إعدادات جروبات مضبوطة، السلوك القديم يبقى كما هو (جروب واحد من الإعدادات القديمة)
    var groups = _tgAlertCfg_().groups;
    var targets = groups.length ? groups : (TELEGRAM_CONFIG.chatId ? [{ chatId: TELEGRAM_CONFIG.chatId, name: '', companies: [] }] : []);
    if (!targets.length) { Logger.log('No telegram alert targets configured'); return { sent: 0 }; }

    var totalSent = 0, groupsSent = 0;
    targets.forEach(function(g) {
      var scoped = (g.companies && g.companies.length)
        ? movesTomorrow.filter(function(m) { return g.companies.indexOf(m.company) > -1; })
        : movesTomorrow;
      if (!scoped.length) return; // هذا الجروب لا يخص أي حركة غد — لا نرسل له شيئًا
      _tgSendMarkdownTo_(g.chatId, buildMsg(scoped));
      totalSent += scoped.length; groupsSent++;
    });
    Logger.log('Telegram tomorrow report sent to ' + groupsSent + ' group(s), ' + totalSent + ' movement line(s)');

    return { success: true, sentCount: totalSent, groupsSent: groupsSent };

  } catch(e) {
    Logger.log('sendTelegramArrivalAlerts error: ' + e);
    return { error: e.toString() };
  }
}

function testTelegramNow() {
  if (!TELEGRAM_CONFIG.token) return '❌ لم يتم ضبط توكن البوت في الإعدادات';
  if (!TELEGRAM_CONFIG.chatId) return '❌ لم يتم ضبط Chat ID في الإعدادات';
  try {
    var result = sendTelegramMessage(
      "✅ *اختبار نظام تيليجرام*\n" +
      "🕋 نظام إشعارات رحلات العمرة\n" +
      "📅 " + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Riyadh", "dd/MM/yyyy HH:mm") + "\n" +
      "النظام يعمل بنجاح! 🎉"
    );
    if (result.success) {
      return '✅ وصلت رسالة الاختبار على تيليجرام بنجاح!\nChat ID: ' + TELEGRAM_CONFIG.chatId;
    } else {
      return '❌ فشل الإرسال\nالخطأ: ' + (result.error || 'تأكد من الـ Token والـ Chat ID');
    }
  } catch(e) {
    return '❌ خطأ: ' + e.message;
  }
}


function setupTelegramDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendTelegramArrivalAlerts') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // الساعة من الإعدادات (الافتراضي 16 = 4 عصراً)
  var hour = parseInt(PropertiesService.getScriptProperties().getProperty('TELEGRAM_ALERT_HOUR') || '16');
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 16;

  ScriptApp.newTrigger('sendTelegramArrivalAlerts')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .create();

  return '✅ تم ضبط تنبيه تيليجرام اليومي الساعة ' + hour + ':00';
}


function doPost(e) {
  var chatId = null; // مُعرَّف مبكرًا حتى يكون متاحًا في catch مهما كان موضع الخطأ
  try {
    var update = JSON.parse(e.postData.contents);
    var token = TELEGRAM_CONFIG.token;

    // 📑 (V4.57) توجيه بوت اتفاقيات الإعاشة — بتوكن مستقل عبر ?bot=catering بالويب هوك
    // لا يمسّ المسار الأساسي بأي شكل: يعالج ويعود فقط عند تطابق البارامتر
    if (e && e.parameter && e.parameter.bot === 'catering') {
      try {
        if (update.callback_query) { _tgccHandleCallback_(update.callback_query); }
        else if (update.message) { _tgccDispatchMessage_(update.message); }
      } catch (ccErr) {
        Logger.log('TGCC dispatch error: ' + ccErr);
        // ⚠️ (V4.101) لا تكتفِ بتسجيل الخطأ بصمت — أبلِغ المستخدم كي لا يظن أن شيئاً لم يحدث
        try {
          var ccCfg = _tgccCfg_();
          var ccChatId = (update.callback_query && update.callback_query.message && update.callback_query.message.chat)
            ? update.callback_query.message.chat.id
            : (update.message && update.message.chat ? update.message.chat.id : null);
          if (ccCfg.token && ccChatId) _tgccSend_(ccCfg.token, ccChatId, '❌ حدث خطأ داخلي أثناء معالجة الاتفاقية:\n<code>' + String(ccErr).substring(0, 300) + '</code>\n\nأعد المحاولة أو أرسل الملف من جديد.');
        } catch (ccNotifyErr) { Logger.log('TGCC notify error: ' + ccNotifyErr); }
      }
      return;
    }

    // 1️⃣ التعامل مع ضغطات الأزرار (Callback Queries)
    if (update.callback_query) {
      var cq = update.callback_query;
      var callbackData = cq.data || "";
      var callbackId = cq.id;
      chatId = cq.message.chat.id;

      // إغلاق الساعة الرملية فوراً — بمعزل تام: لو تليجرام رفض الرد (query is too old/invalid، حالة
      // شائعة عند أي تأخير بسيط بالتنفيذ) لا يجوز أن يوقف هذا تنفيذ الزر الفعلي نفسه أبداً
      try {
        var urlAnswer = "https://api.telegram.org/bot" + token + "/answerCallbackQuery";
        UrlFetchApp.fetch(urlAnswer, { "method": "post", "contentType": "application/json", "muteHttpExceptions": true, "payload": JSON.stringify({ "callback_query_id": callbackId }) });
      } catch (ackErr) { Logger.log('answerCallbackQuery failed (ignored): ' + ackErr); }

      // 🤖 أزرار بوت تسجيل إشعارات الوصول (بادئة bn:)
      if (callbackData.indexOf('bn:') === 0) {
        try {
          _tgbnHandleCallback_(cq);
        } catch (bnErr) {
          sendTelegramMessageDirect(chatId, "❌ <b>حدث خطأ في بوت تسجيل الإشعارات:</b>\n<code>" + bnErr.toString() + "</code>");
        }
        return;
      }

      // 📅 (V4.109) زر «تحركات بتاريخ معيّن» — يبدأ محادثة قصيرة تنتظر التاريخ من المستخدم
      if (callbackData === 'moves_bydate') {
        try {
          _tgMoveSetState_(chatId, cq.from.id, { step: 'awaitingDate' });
          _tgbnSend_(chatId, "📅 اكتب <b>التاريخ</b> المطلوب معرفة تحركاته.\nيقبل الصيغة القصيرة مثل <code>12/9</code> (تُكمَّل السنة الحالية تلقائياً) أو الكاملة <code>12/9/2026</code>.", [[{ text: '✖️ إلغاء', callback_data: 'mvq_cancel' }]]);
        } catch (mvErr) {
          sendTelegramMessageDirect(chatId, "❌ <b>خطأ:</b>\n<code>" + mvErr.toString() + "</code>");
        }
        return;
      }
      if (callbackData === 'mvq_cancel') {
        _tgMoveClearState_(chatId, cq.from.id);
        sendTelegramMessageDirect(chatId, "✔️ تم الإلغاء.");
        return;
      }

      // 🔎 (V4.138) زر «بحث عن معتمر» — يبدأ محادثة قصيرة تنتظر الاسم (تقريبي) أو رقم الجواز
      if (callbackData === 'srch_start') {
        try {
          _tgSrchSetState_(chatId, cq.from.id);
          sendTelegramMessageDirect(chatId,
            "🔎 <b>ابحث عن معتمر</b>\nاكتب <b>اسم المعتمر</b> (ولو جزءاً منه أو تقريبياً) أو <b>رقم جوازه</b>.\n\n" +
            "💡 يمكنك أيضاً البحث مباشرة بصيغة: <code>بحث: اسم المعتمر</code> بلا حاجة لهذا الزر.");
        } catch (srchErr) {
          sendTelegramMessageDirect(chatId, "❌ <b>خطأ:</b>\n<code>" + srchErr.toString() + "</code>");
        }
        return;
      }
      if (callbackData === 'srchq_cancel') {
        _tgSrchClearState_(chatId, cq.from.id);
        sendTelegramMessageDirect(chatId, "✔️ تم الإلغاء.");
        return;
      }
      // اختيار معتمر من قائمة نتائج بحث متعددة: srch:<sid>:<idx>
      if (callbackData.indexOf('srch:') === 0) {
        try {
          var _srchParts = callbackData.split(':');
          var _srchSid = _srchParts[1], _srchIdx = parseInt(_srchParts[2], 10);
          var _srchPerson = _tgSrchLoadResult_(chatId, _srchSid, _srchIdx);
          if (!_srchPerson) {
            sendTelegramMessageDirect(chatId, "⚠️ انتهت صلاحية نتائج هذا البحث. أعد البحث من جديد.");
          } else {
            sendTelegramMessageDirect(chatId, _tgPilgrimDetailMsg_(_srchPerson));
          }
        } catch (srchErr2) {
          sendTelegramMessageDirect(chatId, "❌ <b>خطأ أثناء عرض بيانات المعتمر:</b>\n<code>" + srchErr2.toString() + "</code>");
        }
        return;
      }

      // تنفيذ جلب التقارير مع حماية كشف الأخطاء
      try {
        if (callbackData === 'moves_today')      sendTelegramArrivalAlerts_Custom('today', chatId);
        if (callbackData === 'moves_tomorrow')   sendTelegramArrivalAlerts_Custom('tomorrow', chatId);
        if (callbackData === 'arrival_today')    sendTelegramBookings_Custom('today', chatId);
        if (callbackData === 'arrival_tomorrow') sendTelegramBookings_Custom('tomorrow', chatId);
      } catch (innerError) {
        sendTelegramMessageDirect(chatId, "❌ <b>فشل جلب البيانات بسبب خطأ داخلي:</b>\n<code>" + innerError.toString() + "</code>");
      }
      return;
    }

    if (!update.message) return;
    var msg = update.message;
    var text = msg.text ? msg.text.trim() : "";
    chatId = msg.chat.id;

    // أوامر تليجرام في الجروبات تصل بصيغة /command@BotName — نتجاهل اللاحقة
    var cmd = text.split('@')[0];

    // 🆔 أمر مساعد للإعداد: يعرض معرّف المحادثة الحالية لنسخه في شاشة الإعدادات
    if (cmd === '/id') {
      sendTelegramMessageDirect(chatId, "🆔 <b>معرّف هذه المحادثة:</b>\n<code>" + chatId + "</code>\n\nانسخ هذا الرقم وضعه في شاشة الإعدادات ← بوت تسجيل الإشعارات.");
      return;
    }

    // 2️⃣ استدعاء دالة القائمة عند كتابة /menu أو /start
    if (cmd === '/menu' || cmd === '/start') {
      sendTelegramMenu(chatId);
      return;
    }

    // 🔎 (V4.138) البحث المباشر بصيغة «بحث: الاسم أو رقم الجواز» — يعمل في أي وقت بلا حاجة لمحادثة
    var srchDirect = text.match(/^بحث\s*[:：]\s*(.+)$/);
    if (srchDirect) {
      try {
        if (msg.from) _tgSrchClearState_(chatId, msg.from.id); // إلغاء أي محادثة بحث معلَّقة لهذا المستخدم
        _tgRunSearch_(chatId, srchDirect[1]);
      } catch (srchErr3) {
        sendTelegramMessageDirect(chatId, "❌ <b>خطأ أثناء البحث:</b>\n<code>" + srchErr3.toString() + "</code>");
      }
      return;
    }
    // 🔎 (V4.138) رد على سؤال «بحث عن معتمر» بعد الضغط على الزر — محادثة قصيرة منفصلة (مفتاح srchq_)
    if (msg.from && _tgSrchGetState_(chatId, msg.from.id)) {
      _tgSrchClearState_(chatId, msg.from.id);
      try {
        _tgRunSearch_(chatId, text);
      } catch (srchErr4) {
        sendTelegramMessageDirect(chatId, "❌ <b>خطأ أثناء البحث:</b>\n<code>" + srchErr4.toString() + "</code>");
      }
      return;
    }

    // 📅 (V4.109) رد على سؤال «تحركات بتاريخ معيّن» — محادثة منفصلة تماماً عن بوت تسجيل الإشعارات
    // (مفتاح كاش خاص بها mvq_) حتى لا تتصادم الحالتان لو كان المستخدم في منتصف محادثة أخرى
    var mvState = msg.from ? _tgMoveGetState_(chatId, msg.from.id) : null;
    if (mvState && mvState.step === 'awaitingDate') {
      try {
        var mvDate = _tgMoveParseShortOrFullDate_(text);
        if (!mvDate) {
          _tgbnSend_(chatId, "⚠️ صيغة تاريخ غير صحيحة. اكتب مثل <code>12/9</code> أو <code>12/9/2026</code>، أو ألغِ الطلب.", [[{ text: '✖️ إلغاء', callback_data: 'mvq_cancel' }]]);
        } else {
          _tgMoveClearState_(chatId, msg.from.id);
          sendTelegramMovementsByDate_(mvDate, chatId);
        }
      } catch (mvErr) {
        _tgMoveClearState_(chatId, msg.from.id);
        sendTelegramMessageDirect(chatId, "❌ <b>خطأ:</b>\n<code>" + mvErr.toString() + "</code>");
      }
      return;
    }

    // 3️⃣ 🤖 بوت تسجيل إشعارات الوصول: عبارات البدء + الرسائل داخل محادثة نشطة
    try {
      _tgbnDispatchMessage_(msg);
    } catch (dspErr) {
      sendTelegramMessageDirect(chatId, "❌ <b>حدث خطأ في بوت تسجيل الإشعارات:</b>\n<code>" + dspErr.toString() + "</code>");
    }

  } catch (err) {
    if (chatId) {
      sendTelegramMessageDirect(chatId, "❌ <b>خطأ رئيسي في السكربت:</b>\n<code>" + err.toString() + "</code>");
    }
  }
}

// 📱 دالة إرسال لوحة الأزرار الأربعة (بصيغة HTML الآمنة لمنع الاختفاء)
function sendTelegramMenu(chatId) {
  var token = TELEGRAM_CONFIG.token;
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  
  var payload = {
    "chat_id": chatId,
    "text": "🕋 <b>نظام الاستعلام اللحظي لعمليات العمرة</b>\nإختر من الأزرار التفاعلية أدناه لعرض الجدول المطلوب مباشرة من الجوجل شيت:",
    "parse_mode": "HTML",
    "reply_markup": JSON.stringify({
      "inline_keyboard": [
        [
          { "text": "🟢 تحركات اليوم", "callback_data": "moves_today" },
          { "text": "🔵 تحركات الغد", "callback_data": "moves_tomorrow" }
        ],
        [
          { "text": "🛫 وصول اليوم", "callback_data": "arrival_today" },
          { "text": "🛬 وصول الغد", "callback_data": "arrival_tomorrow" }
        ],
        [
          { "text": "📅 تحركات بتاريخ معيّن", "callback_data": "moves_bydate" }
        ],
        [
          { "text": "🔎 بحث عن معتمر", "callback_data": "srch_start" }
        ]
      ]
    })
  };
  
  UrlFetchApp.fetch(url, { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload) });
}

// ⚡ دالة مرنة لجلب تحركات أي يوم (معدلة بصيغة HTML)
function sendTelegramArrivalAlerts_Custom(type, chatId) {
  var movements = _tgAlertableMovements_(getAllMovements());
  var now = new Date();
  var targetStr = "";
  var title = "";

  function fmt(d) {
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  }

  if (type === 'today') {
    targetStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    title = "تحركات اليوم";
  } else if (type === 'tomorrow') {
    var tom = new Date(now.getFullYear(), now.getMonth(), now.getDate()); tom.setDate(tom.getDate() + 1);
    targetStr = fmt(tom);
    title = "تحركات الغد";
  }

  var filtered = movements.filter(function(m) { 
    return m.movementDate && String(m.movementDate).trim() === targetStr; 
  });

  var msg = "🚌 <b>" + title + " (" + targetStr + ")</b> 📋 العدد: (" + filtered.length + ")\n━━━━━━━━━━━━━━━━━━\n";
  if(filtered.length === 0) { 
    msg += "⚪ لا توجد تحركات مجدولة لهذا اليوم."; 
  } else {
    filtered.forEach(function(m, i) {
      var _lbl = _tgMovementLabel_(m.movementType);
      var _title = _lbl ? (_lbl + " : " + m.movementType) : m.movementType;
      msg += "🔹 <b>(" + (i+1) + ") " + _title + "</b>\n🎫 <b>الإشعار:</b> <code>" + (m.bookingId || "—") + "</code>\n👥 <b>العميل:</b> " + (m.client || "—") + "\n⏰ <b>الساعة:</b> " + (m.movementTime || "—") + "\n🚌 <b>الباصات:</b> " + (m.buses || "—") + "  |  🧑‍🤝‍🧑 <b>العدد:</b> " + (m.count || "—") + " معتمر\n🏢 <b>الشركة:</b> " + (m.company || "—") + "\n🇸🇦 <b>الوكيل:</b> " + (m.agent || "—") + "\n";
      if (i < filtered.length - 1) msg += "▪️\n";
    });
  }
  
  sendTelegramMessageDirect(chatId, msg);
}

// ⚡ دالة مرنة لجلب وصولات المعتمرين (معدلة بصيغة HTML)
function sendTelegramBookings_Custom(type, chatId) {
  var bookings = getAllBookings();
  var now = new Date();
  var targetStr = "";
  var title = "";

  function fmt(d) {
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  }

  if (type === 'today') {
    targetStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    title = "وصول اليوم";
  } else if (type === 'tomorrow') {
    var tom = new Date(now.getFullYear(), now.getMonth(), now.getDate()); tom.setDate(tom.getDate() + 1);
    targetStr = fmt(tom);
    title = "وصول الغد";
  }

  var filtered = bookings.filter(function(b) { 
    return b.arrivalDate && String(b.arrivalDate).trim() === targetStr; 
  });

  var msg = "🛬 <b>" + title + " (" + targetStr + ")</b> 📋 العدد: (" + filtered.length + ")\n━━━━━━━━━━━━━━━━━━\n";
  if(filtered.length === 0) { 
    msg += "⚪ لا توجد وصولات مجدولة لهذا اليوم."; 
  } else {
    filtered.forEach(function(b, i) {
      msg += "🔹 <b>(" + (i+1) + ") وصول معتمرين</b>\n🎫 <b>الإشعار:</b> <code>" + (b.id || "—") + "</code>\n👥 <b>العميل:</b> " + (b.client || "—") + "\n⏰ <b>الساعة:</b> " + (b.arrivalTime || "—") + "\n✈️ <b>الرحلة:</b> " + (b.arrivalFlight || "—") + "\n🧑‍🤝‍🧑 <b>العدد:</b> " + (b.count || "—") + " معتمر\n🏢 <b>الشركة:</b> " + (b.company || "—") + "\n🧑‍✈️ <b>المشرف:</b> " + (b.supervisor || "—") + "\n";
      if (i < filtered.length - 1) msg += "▪️\n";
    });
  }
  
  sendTelegramMessageDirect(chatId, msg);
}

// دالة الإرسال المباشر (معدلة بصيغة HTML)
function sendTelegramMessageDirect(chatId, text) {
  var token = TELEGRAM_CONFIG.token;
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  var payload = { "chat_id": chatId, "text": text, "parse_mode": "HTML" };
  try {
    UrlFetchApp.fetch(url, { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload) });
  } catch(e) {
    Logger.log("Error sending message: " + e);
  }
}

// ============================================================================
// 🤖 بوت تليجرام لتسجيل إشعارات الوصول (TGBN = Telegram Bot Notice)
// محادثة موجَّهة داخل جروبات مصرَّح بها: تذكرة → استخراج آلي (أو إدخال يدوي) →
// عدد → شركة → اتجاه → ليالي → عميل → مراجعة → حفظ بحالة "قيد المراجعة"
// ============================================================================

// ---------- الإعدادات ----------
/* ══════════════════════════════════════════════════════════════════
   📑 (V4.57) بوت اتفاقيات الإعاشة — كامل ومستقل عن بوت الإشعارات
   • توكن مستقل (بوت مختلف على تليجرام)، جروبات ومستخدمين مستقلين
   • Routing عبر ?bot=catering في الويب هوك (بدون التأثير على doPost الأصلي)
   • تدفق: صورة/PDF أو كلمة «اتفاقية» → استخلاص → مراجعة inline → طلب العميل/الرحلة → حفظ
   ══════════════════════════════════════════════════════════════════ */
function _tgccDefaults_() {
  return { enabled: false, token: '', groups: [], allowedUsers: [], triggers: ['اتفاقية','اتفاقيات','contract'], acceptEveryone: false, ocrSpaceKey: '' };
}
function _tgccCfg_() {
  var raw = null; try { raw = PropertiesService.getScriptProperties().getProperty('TGCC_CFG'); } catch (_e) {}
  var cfg = null; try { cfg = raw ? JSON.parse(raw) : null; } catch (_e2) { cfg = null; }
  var d = _tgccDefaults_();
  if (!cfg || typeof cfg !== 'object') return d;
  for (var k in d) if (!(k in cfg)) cfg[k] = d[k];
  if (!Array.isArray(cfg.groups)) cfg.groups = [];
  if (!Array.isArray(cfg.allowedUsers)) cfg.allowedUsers = [];
  if (!Array.isArray(cfg.triggers) || !cfg.triggers.length) cfg.triggers = d.triggers;
  return cfg;
}
function getTgCateringConfig(authToken) {
  requireAuth_(authToken);
  return { success: true, cfg: _tgccCfg_() };
}
function saveTgCateringConfig(authToken, cfg) {
  var session = requireAdminPermission_(authToken);
  var d = _tgccDefaults_();
  var clean = {
    enabled: !!(cfg && cfg.enabled === true),
    token: (cfg && cfg.token ? String(cfg.token).trim() : ''),
    acceptEveryone: !!(cfg && cfg.acceptEveryone === true),
    ocrSpaceKey: (cfg && cfg.ocrSpaceKey ? String(cfg.ocrSpaceKey).trim() : ''),
    groups: [], allowedUsers: [], triggers: []
  };
  ((cfg && Array.isArray(cfg.groups)) ? cfg.groups : []).forEach(function(g) {
    var cid = String((g && g.chatId) || '').trim();
    if (cid) clean.groups.push({ chatId: cid, name: String((g && g.name) || '').trim() });
  });
  ((cfg && Array.isArray(cfg.allowedUsers)) ? cfg.allowedUsers : []).forEach(function(u) {
    var uu = String(u || '').trim().replace(/^@/, '');
    if (uu) clean.allowedUsers.push(uu);
  });
  ((cfg && Array.isArray(cfg.triggers)) ? cfg.triggers : []).forEach(function(t) {
    var tt = String(t || '').trim(); if (tt) clean.triggers.push(tt);
  });
  if (!clean.triggers.length) clean.triggers = d.triggers;
  PropertiesService.getScriptProperties().setProperty('TGCC_CFG', JSON.stringify(clean));
  logChange_(session.username, 'تعديل إعدادات بوت اتفاقيات الإعاشة', '-', 'TGCC_CFG', '-',
    (clean.enabled ? 'مفعّل' : 'معطّل') + ' — ' + clean.groups.length + ' جروب');
  var warning = '';
  // ⚠️ (V4.101) نفس توكن بوت التنبيهات الرئيسي → تعارض ويب هوك (انظر الشرح في testTgCateringBot)
  if (clean.token && TELEGRAM_CONFIG.token && clean.token === TELEGRAM_CONFIG.token) {
    warning = 'تنبيه: توكن بوت الاتفاقيات مطابق لتوكن بوت التنبيهات الرئيسي — أنشئ بوتاً منفصلاً عبر @BotFather وإلا سيتعطل أحد البوتين كلما ضُبط ويب هوك الآخر.';
  }
  return { success: true, cfg: clean, warning: warning };
}

// 🧪 اختبار شامل لبوت الاتفاقيات — توكن، اتصال، ويب هوك، ثم رسالة اختبار لكل جروب
function testTgCateringBot(authToken) {
  requireAdminPermission_(authToken);
  var cfg = _tgccCfg_();
  var checks = [];
  if (!cfg.token) { checks.push({ ok: false, label: 'توكن البوت', detail: 'لم يُضبَط بعد — أدخِله وحفظ الإعدادات' }); return { success: true, checks: checks }; }

  // 0) ⚠️ (V4.101) نفس توكن بوت التنبيهات الرئيسي؟ — تيليجرام يسمح بويب هوك واحد فقط لكل بوت،
  // فلو كان التوكنان متطابقين سيتعارض ضبط أي منهما مع الآخر (كل ضغطة "ضبط الويب هوك" تُلغي الأخرى)
  // وهذا هو السبب الشائع لعمل بوت الاتفاقيات أحياناً وتوقفه أحياناً أخرى بلا سبب ظاهر
  if (TELEGRAM_CONFIG.token && cfg.token === TELEGRAM_CONFIG.token) {
    checks.push({ ok: false, label: '⚠️ تعارض التوكن', detail:
      'توكن بوت الاتفاقيات هو نفس توكن بوت التنبيهات الرئيسي! تيليجرام يسمح بويب هوك واحد فقط لكل بوت — ' +
      'كل مرة يُضبط فيها ويب هوك أحد البوتين يُلغي ويب هوك الآخر تلقائياً، فيعمل بوت الاتفاقيات حيناً ويتوقف حيناً. ' +
      'الحل: أنشئ بوتاً منفصلاً جديداً عبر @BotFather في تيليجرام وضع توكنه هنا (بوت الاتفاقيات) مع إبقاء البوت الأصلي لبوت التنبيهات فقط.' });
  }

  // 1) الاتصال بالبوت
  var botUser = '';
  try {
    var me = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.token + '/getMe', { muteHttpExceptions: true }).getContentText());
    if (me.ok) { botUser = '@' + me.result.username; checks.push({ ok: true, label: 'الاتصال بالبوت', detail: botUser + ' متصل ويعمل' }); }
    else { checks.push({ ok: false, label: 'الاتصال بالبوت', detail: 'تليجرام رفض التوكن: ' + (me.description || '') }); return { success: true, checks: checks }; }
  } catch (e) { checks.push({ ok: false, label: 'الاتصال بالبوت', detail: e.toString() }); return { success: true, checks: checks }; }

  // 2) رابط الـWeb App + Webhook (بمعرِّف bot=catering للتفريق عن بوت الإشعارات)
  var webAppUrl = '';
  try { webAppUrl = ScriptApp.getService().getUrl(); } catch (_e) {}
  if (!webAppUrl) { checks.push({ ok: false, label: 'Web App', detail: 'انشر البرنامج كـWeb App أولاً' }); return { success: true, checks: checks }; }
  checks.push({ ok: true, label: 'Web App', detail: webAppUrl });

  var expectedHook = webAppUrl + (webAppUrl.indexOf('?') > -1 ? '&' : '?') + 'bot=catering';
  try {
    var wi = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.token + '/getWebhookInfo', { muteHttpExceptions: true }).getContentText());
    if (wi.ok && wi.result && wi.result.url) {
      if (wi.result.url.indexOf('bot=catering') > -1) checks.push({ ok: true, label: 'Webhook', detail: 'مضبوط: ' + wi.result.url });
      else checks.push({ ok: false, label: 'Webhook', detail: 'الرابط الحالي مضبوط لبوت آخر — اضغط «⚙️ ضبط الويب هوك»' });
    } else checks.push({ ok: false, label: 'Webhook', detail: 'غير مضبوط — اضغط «⚙️ ضبط الويب هوك»' });
  } catch (eW) { checks.push({ ok: false, label: 'Webhook', detail: eW.toString() }); }

  // 3) إرسال رسالة اختبار لكل جروب
  cfg.groups.forEach(function(g) {
    try {
      var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.token + '/sendMessage',
        { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ chat_id: g.chatId, text: '🧪 اختبار بوت اتفاقيات الإعاشة ' + botUser + ' — الاتصال يعمل ✅' }) });
      var jr = JSON.parse(r.getContentText());
      if (jr.ok) checks.push({ ok: true, label: 'جروب ' + (g.name || g.chatId), detail: 'وصلت رسالة الاختبار' });
      else checks.push({ ok: false, label: 'جروب ' + (g.name || g.chatId), detail: jr.description || 'فشل — تأكَّد أن البوت مضاف كعضو' });
    } catch (eG) { checks.push({ ok: false, label: 'جروب ' + (g.name || g.chatId), detail: eG.toString() }); }
  });
  return { success: true, checks: checks };
}

function setTgCateringWebhook(authToken) {
  requireAdminPermission_(authToken);
  var cfg = _tgccCfg_();
  if (!cfg.token) return { success: false, error: 'أدخل التوكن أولاً واحفظ الإعدادات' };
  var webAppUrl = '';
  try { webAppUrl = ScriptApp.getService().getUrl(); } catch (_e) {}
  if (!webAppUrl) return { success: false, error: 'رابط الـWeb App غير متاح — انشر البرنامج أولاً' };
  var hookUrl = webAppUrl + (webAppUrl.indexOf('?') > -1 ? '&' : '?') + 'bot=catering';
  try {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.token + '/setWebhook',
      { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ url: hookUrl, allowed_updates: ['message','callback_query'], drop_pending_updates: true }) });
    var jr = JSON.parse(r.getContentText());
    if (jr.ok) return { success: true, url: hookUrl };
    return { success: false, error: jr.description || 'فشل' };
  } catch (e) { return { success: false, error: e.toString() }; }
}

// 🔍 من له الحق باستخدام بوت الاتفاقيات؟
function _tgccIsAllowed_(cfg, chatId, msg) {
  if (cfg.acceptEveryone) return true;
  // الجروب مصرَّح؟
  var chatIdStr = String(chatId);
  var groupOk = cfg.groups.some(function(g) { return String(g.chatId) === chatIdStr; });
  if (groupOk) {
    // إن كانت قائمة مستخدمين محددة → قيّد بها؛ غير ذلك، كل أعضاء الجروب مصرَّح لهم
    if (!cfg.allowedUsers.length) return true;
    var from = msg && msg.from ? msg.from : (msg && msg.callback_query && msg.callback_query.from ? msg.callback_query.from : null);
    if (!from) return false;
    var uid = String(from.id), uname = String(from.username || '');
    return cfg.allowedUsers.some(function(u) { return u === uid || u === uname; });
  }
  // محادثة خاصة (chatId موجب)
  if (Number(chatId) > 0) {
    var from2 = msg && msg.from ? msg.from : null;
    if (!from2 || !cfg.allowedUsers.length) return false;
    var uid2 = String(from2.id), uname2 = String(from2.username || '');
    return cfg.allowedUsers.some(function(u) { return u === uid2 || u === uname2; });
  }
  return false;
}

// 📩 إرسال رسالة/ملف عبر بوت الاتفاقيات
function _tgccSend_(token, chatId, text, buttons) {
  var payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (buttons && buttons.length) payload.reply_markup = JSON.stringify({ inline_keyboard: buttons });
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage',
      { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(payload) });
  } catch (e) { Logger.log('TGCC send error: ' + e); }
}

// 🗂️ حالة محادثة الاتفاقية (state) في Cache — للتفاعل التسلسلي (استخلاص → مراجعة → عميل/رحلة)
function _tgccStateKey_(chatId, userId) { return 'TGCC_STATE_' + chatId + '_' + userId; }
function _tgccGetState_(chatId, userId) {
  try { var v = CacheService.getScriptCache().get(_tgccStateKey_(chatId, userId)); return v ? JSON.parse(v) : null; }
  catch (_e) { return null; }
}
function _tgccSetState_(chatId, userId, state) {
  try { CacheService.getScriptCache().put(_tgccStateKey_(chatId, userId), JSON.stringify(state), 1800); } catch (_e) {}
}
function _tgccClearState_(chatId, userId) {
  try { CacheService.getScriptCache().remove(_tgccStateKey_(chatId, userId)); } catch (_e) {}
}

// ⬇️ تحميل ملف من تليجرام إلى base64 (للاستخلاص) — مع تطبيع MIME (V4.60): Gemini يرفض octet-stream
function _tgccFetchFileBase64_(token, fileId) {
  try {
    var meta = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getFile?file_id=' + encodeURIComponent(fileId),
      { muteHttpExceptions: true }).getContentText());
    if (!meta.ok) return null;
    var filePath = meta.result.file_path;
    var blob = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + token + '/' + filePath).getBlob();
    var rawMime = String(blob.getContentType() || '').toLowerCase();
    // 🔍 اشتقاق MIME من الامتداد لو رد Telegram رد octet-stream (Gemini يرفضه)
    var ext = String(filePath).split('.').pop().toLowerCase();
    var mimeByExt = ({
      pdf: 'application/pdf',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif'
    })[ext] || '';
    var finalMime = (!rawMime || rawMime.indexOf('octet-stream') > -1) ? (mimeByExt || 'image/jpeg') : rawMime;
    return { data: Utilities.base64Encode(blob.getBytes()), mime: finalMime, name: filePath.split('/').pop() };
  } catch (e) { Logger.log('TGCC fetch file error: ' + e); return null; }
}

// 📋 نص ملخص اتفاقية واحدة للعرض على تليجرام
function _tgccFmtContract_(c, idx, total) {
  var line = function(lbl, v) { return v ? '<b>' + lbl + ':</b> ' + v + '\n' : ''; };
  return '📑 <b>اتفاقية ' + (idx + 1) + ' من ' + total + '</b>\n' +
    line('رقم الاتفاقية', c.contractNo) +
    line('مقدم الخدمة', c.provider) +
    line('المنطقة', c.area) +
    line('عدد الأيام', c.days) +
    line('من', c.fromDate) + line('إلى', c.toDate) +
    line('عدد المعتمرين', c.pilgrims) +
    line('المدة (وجبات/يوم)', c.duration) +
    line('المبلغ الإجمالي', c.totalAmount ? Number(c.totalAmount).toLocaleString('en-US') : '') +
    line('شركة العمرة', c.umrahCompany) +
    '\n⏳ اختر إجراءً لهذه الاتفاقية:';
}

// 🎯 معالجة رسالة تصل لبوت الاتفاقيات
function _tgccDispatchMessage_(msg) {
  var cfg = _tgccCfg_();
  if (!cfg.enabled || !cfg.token) return;
  var chatId = msg.chat.id;
  var userId = msg && msg.from ? msg.from.id : 0;
  if (!_tgccIsAllowed_(cfg, chatId, msg)) return; // تجاهل بصمت

  var text = (msg.text || '').trim();
  var cmd = text.split('@')[0];

  if (cmd === '/id') {
    var uidTxt = msg && msg.from ? msg.from.id : '';
    var unameTxt = msg && msg.from && msg.from.username ? '@' + msg.from.username : '';
    _tgccSend_(cfg.token, chatId,
      '🆔 <b>معرّف المحادثة (Chat ID):</b>\n<code>' + chatId + '</code>\n' +
      (uidTxt ? '\n👤 <b>معرّفك (User ID):</b>\n<code>' + uidTxt + '</code>\n' + (unameTxt ? '📛 <b>اسم المستخدم:</b> ' + unameTxt + '\n' : '') : '') +
      '\n💡 أضف معرّفك في قائمة «المستخدمون المسموحون» بشاشة الإعدادات لتفعيل الاستخلاص من المحادثة الخاصة.');
    return;
  }
  if (cmd === '/start' || cmd === '/help' || cmd === '/menu') {
    _tgccShowMainMenu_(cfg.token, chatId);
    return;
  }

  // 🕋 (V4.62) كلمات التشغيل → عرض قائمة اختيار طريقة الإدخال بدل طلب الملف مباشرة
  if (text && cfg.triggers.some(function(t) { return text.indexOf(t) > -1; })) {
    _tgccShowMainMenu_(cfg.token, chatId);
    return;
  }

  // ملف مرفق: صورة أو مستند — MIME يُطبَّع لاحقاً داخل _tgccFetchFileBase64_ حين يكون octet-stream
  var fileId = null, fileName = '';
  if (msg.photo && msg.photo.length) { fileId = msg.photo[msg.photo.length - 1].file_id; }
  else if (msg.document) { fileId = msg.document.file_id; fileName = msg.document.file_name || ''; }

  if (fileId) {
    _tgccSend_(cfg.token, chatId, '⏳ جاري استخلاص بيانات الاتفاقية…');
    var fetched = _tgccFetchFileBase64_(cfg.token, fileId);
    if (!fetched) { _tgccSend_(cfg.token, chatId, '❌ تعذر تحميل الملف من تليجرام'); return; }
    // استخدام نفس محرك استخلاص الاتفاقيات — تُرجع مصفوفة
    var extract = null;
    try {
      // نُنشئ توكن خدمي داخلي لتخطي فحص الصلاحية (البوت له مصادقته الخاصة عبر _tgccIsAllowed_)
      extract = _tgccExtractDirect_(fetched.data, fetched.mime, fetched.name);
    } catch (eEx) { _tgccSend_(cfg.token, chatId, '❌ خطأ بالاستخلاص: ' + eEx.toString()); return; }
    // 📉 (V4.71) عند فشل الاستخلاص كلياً: نعرض «إعادة المحاولة بصورة أخرى» + «لصق نص» + «إدخال يدوي»
    if (!extract || !extract.success) {
      _tgccSend_(cfg.token, chatId,
        '❌ ' + ((extract && extract.error) || 'فشل استخلاص الملف') +
        '\n\n📝 اختر طريقة أخرى:',
        [[
          { text: '🔁 إعادة المحاولة (صورة/PDF آخر)', callback_data: 'cc:mode:file' }
        ], [
          { text: '📋 لصق نص', callback_data: 'cc:mode:text' },
          { text: '✍️ يدوي (سطر لكل حقل)', callback_data: 'cc:mode:manual' }
        ]]);
      return;
    }
    var arr = extract.contracts || [];
    if (!arr.length) {
      _tgccSend_(cfg.token, chatId,
        '⚠️ لم يُعثَر على أي اتفاقية بالملف — يمكنك اختيار:',
        [[
          { text: '🔁 إعادة المحاولة (صورة/PDF آخر)', callback_data: 'cc:mode:file' }
        ], [
          { text: '📋 لصق نص', callback_data: 'cc:mode:text' },
          { text: '✍️ يدوي (سطر لكل حقل)', callback_data: 'cc:mode:manual' }
        ]]);
      return;
    }

    // 🐛 (V4.72) الجذر الحقيقي لخطأ «انتهت الجلسة»: إرسال صورة جديدة أثناء مراجعة صورة سابقة
    // كان يستبدل الحالة بالكامل (contracts + idx)، فيفقد رابط الأزرار القديمة صلاحيتها بمجرد
    // اكتمال مراجعة الصورة الثانية (تُمسَح الحالة كلياً). الحل: لو فيه مراجعة قائمة فعلاً، تُضاف
    // اتفاقيات الصورة الجديدة لنهاية نفس القائمة بدل استبدالها — لا شيء يُفقَد، والمستخدم يكمل
    // مراجعته الحالية أولاً ثم يصل تلقائياً للاتفاقيات الجديدة بالتتابع
    var existingSt = _tgccGetState_(chatId, userId);
    if (existingSt && Array.isArray(existingSt.contracts) && existingSt.contracts.length &&
        ['reviewing', 'ask_trip', 'ask_group'].indexOf(existingSt.step) > -1) {
      existingSt.contracts = existingSt.contracts.concat(arr);
      _tgccSetState_(chatId, userId, existingSt);
      _tgccSend_(cfg.token, chatId,
        '➕ أُضيفت ' + arr.length + ' اتفاقية جديدة لقائمة الانتظار (الإجمالي الآن ' + existingSt.contracts.length + ') — أكمل مراجعة الحالية أولاً وستصلك تباعاً.');
      return;
    }

    _tgccSetState_(chatId, userId, { step: 'reviewing', contracts: arr, idx: 0 });
    _tgccPromptReview_(cfg.token, chatId, userId);
    return;
  }

  // 🔠 أثناء انتظار «العميل/الرحلة» أو «رقم المجموعة»
  var st = _tgccGetState_(chatId, userId);
  if (st && st.step === 'ask_trip' && text) {
    st.contracts[st.idx].tripClient = text;
    _tgccSetState_(chatId, userId, Object.assign(st, { step: 'ask_group' }));
    _tgccSend_(cfg.token, chatId, '📮 اكتب <b>رقم المجموعة</b> (أو أرسل «-» لتخطيه):');
    return;
  }
  if (st && st.step === 'ask_group' && text) {
    st.contracts[st.idx].groupNo = (text === '-' || text === '—') ? '' : text;
    // 🐛 (V4.71) الجذر الحقيقي لعدم ظهور الاتفاقيات المحفوظة من البوت: كانت النتيجة لا تُفحَص
    // إطلاقاً — رسالة "✅ حُفظت" تُرسَل دائماً حتى لو فشل _tgccSaveOne_ فعلياً (مثلاً رقم اتفاقية فارغ)
    var saveRes;
    try {
      saveRes = _tgccSaveOne_(st.contracts[st.idx], msg.from ? (msg.from.username || String(msg.from.id)) : 'TelegramBot');
    } catch (eSave) {
      saveRes = { success: false, error: String(eSave) };
    }
    if (!saveRes || !saveRes.success) {
      _tgccSend_(cfg.token, chatId, '❌ فشل حفظ الاتفاقية ' + (st.idx + 1) + '/' + st.contracts.length + ' — ' + ((saveRes && saveRes.error) || 'خطأ غير معروف') + '\nتأكد من إدخال رقم الاتفاقية صحيحاً.');
    } else {
      _tgccSend_(cfg.token, chatId, '✅ حُفظت الاتفاقية ' + (st.idx + 1) + '/' + st.contracts.length + (saveRes.created ? ' (جديدة)' : ' (تحديث اتفاقية موجودة)'));
    }
    if (st.idx + 1 < st.contracts.length) {
      st.idx++; st.step = 'reviewing';
      _tgccSetState_(chatId, userId, st);
      _tgccPromptReview_(cfg.token, chatId, userId);
    } else {
      _tgccClearState_(chatId, userId);
      _tgccSend_(cfg.token, chatId, '🎉 اكتمل حفظ كل الاتفاقيات — اذهب لشاشة «📑 اتفاقيات الإعاشة» للمعاينة.');
    }
    return;
  }

  // ✍️ (V4.62) إدخال يدوي سطر لسطر
  if (st && st.step === 'manual' && text) {
    var f = _TGCC_MANUAL_FIELDS_[st.fieldIdx || 0];
    if (f) {
      var v = String(text).trim();
      if (v === '-' || v === '—' || v === 'skip') {
        if (f.required) { _tgccSend_(cfg.token, chatId, '⚠️ هذا الحقل مطلوب — أدخل قيمة صالحة'); return; }
        v = '';
      }
      st.contract[f.key] = v;
      st.fieldIdx = (st.fieldIdx || 0) + 1;
      _tgccSetState_(chatId, userId, st);
      _tgccPromptManualField_(cfg.token, chatId, userId);
      return;
    }
  }

  // 📋 (V4.62) لصق نص مطلوب من القائمة
  if (st && st.step === 'awaiting_text' && text) {
    var listT = _tgccRegexParseText_(text);
    if (listT && listT.length) {
      _tgccSetState_(chatId, userId, { step: 'reviewing', contracts: listT, idx: 0 });
      _tgccSend_(cfg.token, chatId, '📝 استُخلصت ' + listT.length + ' اتفاقية بالمعالج المحلي.');
      _tgccPromptReview_(cfg.token, chatId, userId);
    } else {
      _tgccSend_(cfg.token, chatId, '⚠️ لم أستطع فهم النص — تأكد من صيغة القائمة أو الصيغة المعنونة، ثم أعد الإرسال');
    }
    return;
  }

  // 📝 استخلاص نصي محلي تلقائي — نص عابر بلا state
  if (text && text.length > 15 && (text.split(/\r?\n/).length >= 3 || /رقم\s*الاتفاق[يّ]ة/.test(text))) {
    var local = _tgccRegexParseText_(text);
    if (local && local.length) {
      _tgccSetState_(chatId, userId, { step: 'reviewing', contracts: local, idx: 0 });
      _tgccSend_(cfg.token, chatId, '📝 استُخلصت ' + local.length + ' اتفاقية بالمعالج المحلي (بدون AI).');
      _tgccPromptReview_(cfg.token, chatId, userId);
      return;
    }
  }
}
function _tgccPromptReview_(token, chatId, userId) {
  var st = _tgccGetState_(chatId, userId);
  if (!st || !st.contracts || !st.contracts.length) return;
  var c = st.contracts[st.idx];
  var buttons = [[
    { text: '✅ اعتماد وتحديد الرحلة', callback_data: 'cc:ok:' + st.idx },
    { text: '❌ تخطي', callback_data: 'cc:skip:' + st.idx }
  ]];
  _tgccSend_(token, chatId, _tgccFmtContract_(c, st.idx, st.contracts.length), buttons);
}
function _tgccHandleCallback_(cq) {
  var cfg = _tgccCfg_();
  if (!cfg.enabled || !cfg.token) return;
  var chatId = cq.message.chat.id, userId = cq.from ? cq.from.id : 0;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.token + '/answerCallbackQuery',
      { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ callback_query_id: cq.id }) });
  } catch (_e) {}
  var data = String(cq.data || '');
  if (data.indexOf('cc:') !== 0) return;
  var parts = data.split(':');
  var action = parts[1];

  // 🎯 (V4.62) اختيار نمط الإدخال من قائمة البداية
  if (action === 'mode') {
    var mode = parts[2] || 'file';
    if (mode === 'file') {
      _tgccSetState_(chatId, userId, { step: 'awaiting_file' });
      _tgccSend_(cfg.token, chatId, '📎 أرسل الآن صورة الاتفاقية أو ملف PDF.');
      return;
    }
    if (mode === 'text') {
      _tgccSetState_(chatId, userId, { step: 'awaiting_text' });
      _tgccSend_(cfg.token, chatId,
        '📋 الصق نص الاتفاقية (يدعم الصيغة المعنونة أو القائمة سطر لكل حقل):\n\n' +
        '<i>مثال قائمة:</i>\n<code>18314\nمجموعة قافلة التوحيد\nمكة المكرمة\n4\n28-08-2026\n31-08-2026\n1</code>');
      return;
    }
    if (mode === 'manual') {
      var contract = { contractNo:'', provider:'', area:'', days:'', fromDate:'', toDate:'', pilgrims:'', totalAmount:'', umrahCompany:'', tripClient:'', groupNo:'', sourceFile:'(يدوي - بوت)' };
      _tgccSetState_(chatId, userId, { step: 'manual', fieldIdx: 0, contract: contract });
      _tgccPromptManualField_(cfg.token, chatId, userId);
      return;
    }
  }

  var idx = parseInt(parts[2] || '0', 10);
  var st = _tgccGetState_(chatId, userId);
  if (!st || !st.contracts) { _tgccSend_(cfg.token, chatId, '⚠️ انتهت الجلسة — أرسل الملف من جديد'); return; }
  if (action === 'skip') {
    if (idx + 1 < st.contracts.length) { st.idx = idx + 1; st.step = 'reviewing'; _tgccSetState_(chatId, userId, st); _tgccPromptReview_(cfg.token, chatId, userId); }
    else { _tgccClearState_(chatId, userId); _tgccSend_(cfg.token, chatId, '↩️ انتهت المراجعة بلا حفظ.'); }
    return;
  }
  if (action === 'ok') {
    st.idx = idx; st.step = 'ask_trip'; _tgccSetState_(chatId, userId, st);
    _tgccSend_(cfg.token, chatId, '🧳 اكتب <b>اسم العميل أو الرحلة</b> لهذه الاتفاقية:');
    return;
  }
}

// 🕋 (V4.62) قائمة البداية — يختار المستخدم منها طريقة إدخال بيانات الاتفاقية
function _tgccShowMainMenu_(token, chatId) {
  _tgccSend_(token, chatId,
    '🕋 <b>بوت اتفاقيات الإعاشة</b>\n\n' +
    'اختر طريقة إدخال بيانات الاتفاقية:',
    [[
      { text: '📎 صورة أو PDF (بالذكاء الاصطناعي)', callback_data: 'cc:mode:file' }
    ],[
      { text: '📋 لصق نص', callback_data: 'cc:mode:text' }
    ],[
      { text: '✍️ إدخال يدوي سطر لسطر', callback_data: 'cc:mode:manual' }
    ]]);
}

// ✍️ (V4.62) خطوات الإدخال اليدوي — سطر لكل حقل، مع إمكانية «-» للتخطي
var _TGCC_MANUAL_FIELDS_ = [
  { key: 'contractNo',   label: 'رقم الاتفاقية',   required: true  },
  { key: 'provider',     label: 'اسم مقدم الخدمة', required: false },
  { key: 'area',         label: 'منطقة الخدمة (مكة/المدينة/…)', required: false },
  { key: 'days',         label: 'عدد أيام الاتفاقية', required: false },
  { key: 'fromDate',     label: 'تاريخ البداية (dd-mm-yyyy)', required: false },
  { key: 'toDate',       label: 'تاريخ النهاية (dd-mm-yyyy)', required: false },
  { key: 'pilgrims',     label: 'عدد المعتمرين', required: false },
  { key: 'totalAmount',  label: 'المبلغ الإجمالي (ر.س)', required: false },
  { key: 'umrahCompany', label: 'اسم شركة العمرة', required: false }
];
function _tgccPromptManualField_(token, chatId, userId) {
  var st = _tgccGetState_(chatId, userId);
  if (!st || st.step !== 'manual') return;
  var i = st.fieldIdx || 0;
  if (i >= _TGCC_MANUAL_FIELDS_.length) {
    // خلصت الحقول — انقل للمراجعة
    var arr = [st.contract];
    // احسب التاريخ الناقص محلياً
    _ccComputeMissingDates_(st.contract);
    _tgccSetState_(chatId, userId, { step: 'reviewing', contracts: arr, idx: 0 });
    _tgccSend_(token, chatId, '📋 تمّ جمع البيانات — راجعها الآن:');
    _tgccPromptReview_(token, chatId, userId);
    return;
  }
  var f = _TGCC_MANUAL_FIELDS_[i];
  var req = f.required ? '<b>(مطلوب)</b>' : '<i>(اختياري — أرسل «-» للتخطي)</i>';
  _tgccSend_(token, chatId, '✍️ الحقل ' + (i + 1) + '/' + _TGCC_MANUAL_FIELDS_.length + ' — ' + f.label + '\n' + req);
}

// 📌 استخلاص مباشر بدون فحص صلاحية — يعرض سبب الفشل بوضوح (V4.58)
// 🔡 (V4.63) OCR مجاني عبر OCR.Space API — لا يحتاج Gemini إطلاقاً
// المفتاح الافتراضي «helloworld» عام ومحدود؛ يُنصح بتوليد مفتاح مجاني من ocr.space/ocrapi
function _tgccOcrSpace_(base64Data, mimeType, ocrKey) {
  var key = String(ocrKey || '').trim() || 'helloworld';
  // OCR.Space يطلب data URI كامل عبر base64Image
  var mime = (mimeType || 'image/jpeg').toLowerCase();
  var dataUri = 'data:' + mime + ';base64,' + base64Data;
  var payload = {
    apikey: key,
    language: 'ara',            // العربية أولاً — يمرّ اللاتيني معها
    isOverlayRequired: 'false',
    detectOrientation: 'true',
    scale: 'true',
    OCREngine: '3',             // Engine 3 يدعم العربية بأفضل جودة
    base64Image: dataUri
  };
  try {
    var resp = UrlFetchApp.fetch('https://api.ocr.space/parse/image', {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    var jr = null; try { jr = JSON.parse(resp.getContentText()); } catch (_pe) { jr = null; }
    if (!jr) return { ok: false, err: 'رد OCR.Space غير مفهوم' };
    if (jr.IsErroredOnProcessing) {
      return { ok: false, err: (Array.isArray(jr.ErrorMessage) ? jr.ErrorMessage.join(' | ') : String(jr.ErrorMessage || 'خطأ OCR.Space')) };
    }
    var pr = jr.ParsedResults;
    if (!Array.isArray(pr) || !pr.length) return { ok: false, err: 'OCR.Space لم يُرجع أي صفحات' };
    var text = pr.map(function(p) { return p.ParsedText || ''; }).join('\n\n').trim();
    if (!text) return { ok: false, err: 'OCR.Space أعاد نصاً فارغاً' };
    return { ok: true, text: text };
  } catch (e) { return { ok: false, err: 'استثناء OCR.Space: ' + e }; }
}

// 🔡 (V4.60) OCR فقط عبر Gemini — يُستخدم كخطة بديلة عند فشل الاستخلاص المهيكل
function _tgccOcrOnly_(base64Data, mimeType, GKEYS) {
  var prompt = 'Perform OCR only. Return ALL Arabic and Latin text exactly as printed, line by line, without any explanation or markdown.';
  var payload = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }] }] };
  // 🧠 (V4.63) بعد إيقاف gemini-1.5-flash أيضاً — نُبقي 2.5-flash فقط (نموذج المستقر الحالي)
  // 🧠 (V4.65) استعادة قائمة النماذج الكاملة من V4.47 — كانت تعمل ممتازاً مع التذاكر والجوازات
  // ونحتفظ بها متعددة حتى ينتقل بينها الكود تلقائياً عند نفاد كوتا أو رفض مفتاح لنموذج بعينه
  var MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
  for (var ki = 0; ki < GKEYS.length; ki++) {
    for (var mi = 0; mi < MODELS.length; mi++) {
      try {
        var resp = UrlFetchApp.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[mi] + ':generateContent?key=' + GKEYS[ki],
          { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
        var jr = JSON.parse(resp.getContentText());
        if (jr && jr.candidates && jr.candidates[0] && jr.candidates[0].content) {
          var t = jr.candidates[0].content.parts[0].text || '';
          if (t) return t;
        }
      } catch (_e) {}
    }
  }
  return '';
}

// 🔧 (V4.60) استخلاص نصّي محلي بلا AI — يعمل على النصّ (سواء من OCR أو من رسالة نصية للبوت)
// 🧠 (V4.71) البوت يستخدم الآن نفس المحرك الموحَّد للاستخلاص المحلي المستخدَم بالويب —
// يدعم الصيغة المُعنونة والقائمة والجدولية (عدة اتفاقيات/صفوف في نص واحد)
function _tgccRegexParseText_(text) {
  return _ccUnifiedLocalExtract_(text, '(محلي)');
}

function _tgccExtractDirect_(base64Data, mimeType, fileName) {
  var GKEYS = _geminiKeys_();
  if (!GKEYS.length) return { success: false, error: 'مفتاح Gemini غير مُعدّ في إعدادات النظام' };
  if (!base64Data) return { success: false, error: 'لا يوجد ملف' };
  var prompt =
    "This image/PDF may contain ONE OR MORE Arabic 'اتفاقية إعاشة' (Umrah catering) contracts — scan the ENTIRE image/all pages carefully for every contract present, even if there are 2, 3, or more separate contract blocks/rows. " +
    "CRITICAL — the layout can be ANY of these three, detect which one applies: " +
    "(1) TABLE: column HEADERS ('رقم الاتفاقية', 'اسم مقدم الخدمة', 'المنطقة', 'عدد الأيام', 'تاريخ البداية', 'تاريخ النهاية', 'عدد المعتمرين', 'المبلغ الإجمالي') sit as ONE ROW, DATA is in row(s) BELOW — EVERY data row is a SEPARATE contract, never skip or merge rows. " +
    "(2) MULTIPLE SEPARATE CARDS: each card/block has its own 'رقم الاتفاقية' — return one entry per card. " +
    "(3) SINGLE DETAIL/PROFILE SCREEN (very common — e.g. a system's own 'تفاصيل الاتفاقية' page): fields are laid out as a 2-column grid where each cell shows a small gray LABEL directly above (or beside) its black VALUE — e.g. label 'رقم الاتفاقية' with '25456' right under/beside it, label 'تاريخ بداية الاتفاقية' with a date under/beside it, etc. Read EVERY visible label+value pair carefully even if the grid interleaves columns; do not stop at the first field you recognize — scan the WHOLE screen for all fields before answering. " +
    "AMOUNT DISAMBIGUATION (critical, common mistake): such detail screens often show BOTH 'المبلغ الإجمالي للمعتمر' (per-PILGRIM rate, singular — IGNORE this, do not use it) AND 'المبلغ الإجمالي للمعتمرين' (grand TOTAL for all pilgrims, plural — this is totalAmount, USE THIS ONE). Read the label carefully: مفرد=تجاهل، جمع=استخدمه. " +
    "DATE FORMAT: dates may appear as dd/mm/yyyy OR as yyyy-mm-dd (ISO, common on detail screens, e.g. '2026-08-26') — recognize both and always output dd/mm/yyyy in your answer. " +
    "Extract DATA/VALUES, NEVER return column/field labels as values. Amounts always SAR. Numbers digits only. " +
    "Return ONLY: {\"contracts\":[{\"contractNo\":\"\",\"provider\":\"\",\"area\":\"\",\"days\":\"\",\"fromDate\":\"\",\"toDate\":\"\",\"pilgrims\":\"\",\"duration\":\"\",\"totalAmount\":\"\",\"umrahCompany\":\"\"}]}. Empty string ONLY for truly missing/unreadable fields. NEVER return header/label words as data. If unreadable, return {\"contracts\":[]}.";
  var payload = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }] }] };
  // 🧠 (V4.63) بعد إيقاف gemini-1.5-flash أيضاً — نُبقي 2.5-flash فقط (نموذج المستقر الحالي)
  // 🧠 (V4.65) استعادة قائمة النماذج الكاملة من V4.47 — كانت تعمل ممتازاً مع التذاكر والجوازات
  // ونحتفظ بها متعددة حتى ينتقل بينها الكود تلقائياً عند نفاد كوتا أو رفض مفتاح لنموذج بعينه
  var MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
  var rawText = '', lastErr = '', lastCode = 0;
  // ⏱️ (V4.101) حارس وقت — منفّذ تليجرام (doPost) محدود بحد أقصى Apps Script (~6 دقائق)؛
  // بدون هذا الحارس قد تستنفد المحاولات المتتالية عبر كل المفاتيح/النماذج كل الوقت المتاح
  // فيُقتل التنفيذ فجأة قبل الوصول لإرسال أي رد للمستخدم — وهذا سبب "لا يحدث شيء بعد الرفع"
  var _ccExtractStart_ = Date.now();
  var _ccTimeUp_ = function() { return (Date.now() - _ccExtractStart_) > 240000; }; // 4 دقائق كحد أقصى للمحاولات
  for (var ki = 0; ki < GKEYS.length && !rawText && !_ccTimeUp_(); ki++) {
    for (var mi = 0; mi < MODELS.length && !_ccTimeUp_(); mi++) {
      try {
        var resp = UrlFetchApp.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[mi] + ':generateContent?key=' + GKEYS[ki],
          { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
        lastCode = resp.getResponseCode();
        var jr; try { jr = JSON.parse(resp.getContentText()); } catch (_pj) { jr = null; }
        if (lastCode === 200 && jr && jr.candidates && jr.candidates[0] && jr.candidates[0].content) {
          rawText = jr.candidates[0].content.parts[0].text || '';
          if (rawText) { lastErr = ''; break; }
        }
        lastErr = (jr && jr.error && jr.error.message) ? jr.error.message : ('HTTP ' + lastCode);
        // 🔁 (V4.65) انتقل للنموذج التالي عند: 400 (سيء لهذا المفتاح), 404 (غير موجود), 429 (كوتا), 500/503 (مشكلة مؤقتة)
        // فقط 401/403 (مفتاح غير صالح) يخرج لتجربة المفتاح التالي
        if (lastCode === 401 || lastCode === 403) break;
      } catch (e) { lastErr = String(e); }
    }
  }
  // 🛟 (V4.63) لو فشل Gemini كلياً — جرّب OCR ثم Regex محلي عبر مسارَين متتاليَين
  //   1) OCR.Space (مجاني، لا يحتاج Gemini إطلاقاً)
  //   2) Gemini OCR-only (لو كان الفشل في مسار Gemini فقط في المسار المهيكل)
  if (!rawText) {
    var cfg63 = _tgccCfg_();
    var ocrSpaceRes = _tgccOcrSpace_(base64Data, mimeType, cfg63.ocrSpaceKey || '');
    if (ocrSpaceRes.ok) {
      var byOs = _tgccRegexParseText_(ocrSpaceRes.text);
      if (byOs && byOs.length) return { success: true, contracts: byOs, viaLocal: true, viaOcrSpace: true };
    }
    var ocrText = _tgccOcrOnly_(base64Data, mimeType, GKEYS);
    if (ocrText) {
      var manual = _tgccRegexParseText_(ocrText);
      if (manual && manual.length) return { success: true, contracts: manual, viaLocal: true };
    }
    return { success: false, error: 'تعذّر استدعاء Gemini — ' + (lastErr || 'خطأ غير معروف') +
      (ocrSpaceRes && !ocrSpaceRes.ok ? ' | OCR.Space: ' + ocrSpaceRes.err : '') };
  }
  var text = rawText.replace(/```json|```/g, '').trim();
  var m = text.match(/\{[\s\S]*\}/); if (m) text = m[0];
  var data = null;
  try { data = JSON.parse(text); } catch (_pe) {
    // 🛟 رد غير مفهوم — طبّق Regex على rawText الأصلي، وإن فشل جرّب OCR.Space
    var reg = _tgccRegexParseText_(rawText);
    if (reg && reg.length) return { success: true, contracts: reg, viaLocal: true };
    var cfg63b = _tgccCfg_();
    var ocrSpaceRes2 = _tgccOcrSpace_(base64Data, mimeType, cfg63b.ocrSpaceKey || '');
    if (ocrSpaceRes2.ok) {
      var byOs2 = _tgccRegexParseText_(ocrSpaceRes2.text);
      if (byOs2 && byOs2.length) return { success: true, contracts: byOs2, viaLocal: true, viaOcrSpace: true };
    }
    return { success: false, error: 'رد Gemini غير مفهوم', rawText: rawText.substring(0, 400) };
  }
  var arr = Array.isArray(data.contracts) ? data.contracts : [];
  var _num = function(v) { if (!v && v !== 0) return ''; return String(v).replace(/[,،\s]/g, ''); };
  var cleaned = arr.map(function(d) {
    var c = {
      contractNo: String(d.contractNo || '').trim(), provider: String(d.provider || '').trim(),
      area: String(d.area || '').trim(), days: _num(d.days), fromDate: String(d.fromDate || '').trim(),
      toDate: String(d.toDate || '').trim(), pilgrims: _num(d.pilgrims), duration: _num(d.duration),
      totalAmount: _num(d.totalAmount), tripClient: '', umrahCompany: String(d.umrahCompany || '').trim(),
      groupNo: '', sourceFile: fileName || ''
    };
    _ccComputeMissingDates_(c);
    return c;
  });
  if (!cleaned.length) return { success: false, error: 'Gemini لم يتعرف على اتفاقية واضحة داخل الملف' };
  return { success: true, contracts: cleaned };
}

// 💾 حفظ اتفاقية واحدة من البوت (تخطي auth الفعلي — البوت له مصادقته الخاصة)
function _tgccSaveOne_(contract, username) {
  var no = String(contract.contractNo || '').trim();
  if (!no) return { success: false, error: 'رقم الاتفاقية فارغ' };
  // 🔒 (V4.73) نفس قفل saveCateringContracts — يمنع تكرار الصفوف لو تزامن حفظ البوت مع حفظ الويب
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (eLock) { return { success: false, error: 'الشيت مشغول بعملية حفظ أخرى — أعد المحاولة بعد لحظات' }; }
  try {
  var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS);
  var now = new Date();
  var existing = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, CATERING_HEADERS.length).getValues() : [];
  var rowIdx = -1;
  for (var i = 0; i < existing.length; i++) if (String(existing[i][0] || '').trim() === no) { rowIdx = i + 2; break; }
  var isEmpty_ = function(v) { return v === '' || v === null || v === undefined; };
  var newVals = [
    no, contract.provider || '', contract.area || '', contract.days ? Number(contract.days) : '',
    contract.fromDate || '', contract.toDate || '',
    contract.pilgrims ? Number(contract.pilgrims) : '', contract.duration ? Number(contract.duration) : '',
    contract.totalAmount ? Number(contract.totalAmount) : '',
    contract.tripClient || '', contract.umrahCompany || '', contract.groupNo || '',
    username || 'TelegramBot', now, '', '', contract.sourceFile || '', contract.vendor || '', contract.notes || ''
  ];
  if (rowIdx > -1) {
    var origRow = existing[rowIdx - 2];
    var oldRow = origRow.slice();
    var filled = 0;
    for (var k = 0; k < 12; k++) if (isEmpty_(oldRow[k]) && !isEmpty_(newVals[k])) { oldRow[k] = newVals[k]; filled++; }
    if (isEmpty_(oldRow[17]) && !isEmpty_(newVals[17])) { oldRow[17] = newVals[17]; filled++; } // 📑 (V4.76) المورد
    if (isEmpty_(oldRow[18]) && !isEmpty_(newVals[18])) { oldRow[18] = newVals[18]; filled++; } // 📝 (V4.77) ملاحظات
    if (filled) {
      oldRow[14] = username || 'TelegramBot'; oldRow[15] = now;
      sh.getRange(rowIdx, 1, 1, CATERING_HEADERS.length).setValues([oldRow]);
      // 🕘 (V4.86) نفس سجل التعديلات بالحقول المتغيّرة — حفظ البوت له نفس التغطية بالضبط كحفظ الويب
      var diffs = _ccLogDiffEntries_(no, origRow, oldRow);
      if (diffs.length) logChangesBatch_(username || 'TelegramBot', diffs);
    }
    return { success: true, updated: filled > 0 };
  }
  sh.appendRow(newVals);
  logChange_(username || 'TelegramBot', 'إنشاء اتفاقية إعاشة', no, 'اتفاقية جديدة', '-',
    (contract.provider || '-') + ' — ' + (contract.area || '-') + (contract.totalAmount ? ' — ' + contract.totalAmount : ''));
  return { success: true, created: true };
  } finally { lock.releaseLock(); }
}

function _tgbnDefaults_() {
  return {
    enabled: false,
    groups: [],            // [{chatId:'-100123', name:'جروب الوكلاء', companies:['شركة أ','شركة ب']}]
    allowedUsers: [],      // أسماء مستخدمين تليجرام (بدون @) أو أرقام معرفات — فارغة = الكل
    triggers: ['اشعار جديد', 'إشعار جديد'],
    maxCount: 4,           // أقصى عدد معتمرين مسموح تسجيله عبر البوت
    adminPhone: '01002864926',
    alertChatId: ''        // جروب التنبيهات — يصل إليه إشعار فوري عند كل تسجيل
  };
}

function _tgbnCfg_() {
  var cfg = null;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('TGBN_CFG');
    if (raw) cfg = JSON.parse(raw);
  } catch (e) { cfg = null; }
  var d = _tgbnDefaults_();
  if (!cfg || typeof cfg !== 'object') return d;
  for (var k in d) { if (!(k in cfg)) cfg[k] = d[k]; }
  if (!Array.isArray(cfg.groups)) cfg.groups = [];
  if (!Array.isArray(cfg.allowedUsers)) cfg.allowedUsers = [];
  if (!Array.isArray(cfg.triggers) || !cfg.triggers.length) cfg.triggers = d.triggers;
  cfg.maxCount = parseInt(cfg.maxCount) || d.maxCount;
  return cfg;
}

function getTgNoticeConfig(authToken) {
  requireAuth_(authToken);
  return { success: true, cfg: _tgbnCfg_() };
}

function saveTgNoticeConfig(authToken, cfg) {
  var session = requireAdminPermission_(authToken);
  var d = _tgbnDefaults_();
  var clean = {
    enabled: cfg && cfg.enabled === true,
    groups: [],
    allowedUsers: [],
    triggers: [],
    maxCount: Math.max(1, Math.min(20, parseInt(cfg && cfg.maxCount) || d.maxCount)),
    adminPhone: (cfg && cfg.adminPhone ? cfg.adminPhone.toString().trim() : d.adminPhone),
    alertChatId: (cfg && cfg.alertChatId ? cfg.alertChatId.toString().trim() : '')
  };
  var rawGroups = (cfg && Array.isArray(cfg.groups)) ? cfg.groups : [];
  for (var i = 0; i < rawGroups.length; i++) {
    var g = rawGroups[i] || {};
    var cid = (g.chatId || '').toString().trim();
    if (!cid) continue;
    var comps = Array.isArray(g.companies) ? g.companies.map(function(c){ return (c||'').toString().trim(); }).filter(String) : [];
    clean.groups.push({ chatId: cid, name: (g.name || '').toString().trim(), companies: comps });
  }
  var rawUsers = (cfg && Array.isArray(cfg.allowedUsers)) ? cfg.allowedUsers : [];
  for (var u = 0; u < rawUsers.length; u++) {
    var uu = (rawUsers[u] || '').toString().trim().replace(/^@/, '');
    if (uu) clean.allowedUsers.push(uu);
  }
  var rawTrig = (cfg && Array.isArray(cfg.triggers)) ? cfg.triggers : [];
  for (var t = 0; t < rawTrig.length; t++) {
    var tt = (rawTrig[t] || '').toString().trim();
    if (tt) clean.triggers.push(tt);
  }
  if (!clean.triggers.length) clean.triggers = d.triggers;
  PropertiesService.getScriptProperties().setProperty('TGBN_CFG', JSON.stringify(clean));
  logChange_(session.username, 'تعديل إعدادات بوت تسجيل الإشعارات', '-', 'TGBN_CFG', '-',
    (clean.enabled ? 'مفعّل' : 'معطّل') + ' — ' + clean.groups.length + ' جروب، ' + clean.triggers.length + ' صيغة بدء');
  return { success: true, cfg: clean };
}

// 🧪 اختبار شامل لبوت تسجيل الإشعارات — يفحص التوكن والويب هوك ورابط النشر
// ويرسل رسالة اختبار فعلية لكل جروب مضبوط (أقوى تحقق من صحة المعرّفات)
function testTgNoticeBot(authToken) {
  requireAdminPermission_(authToken);
  var checks = [];
  var token = TELEGRAM_CONFIG.token;

  // 1) التوكن + الاتصال بالبوت
  if (!token) {
    checks.push({ ok: false, label: 'توكن البوت', detail: 'TELEGRAM_BOT_TOKEN غير مضبوط في إعدادات السكربت — لا يمكن المتابعة' });
    return { success: true, checks: checks };
  }
  var botUser = '';
  try {
    var me = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getMe', { muteHttpExceptions: true }).getContentText());
    if (me.ok) { botUser = '@' + me.result.username; checks.push({ ok: true, label: 'الاتصال بالبوت', detail: botUser + ' متصل ويعمل' }); }
    else checks.push({ ok: false, label: 'الاتصال بالبوت', detail: 'تليجرام رفض التوكن: ' + (me.description || '') });
  } catch (e) { checks.push({ ok: false, label: 'الاتصال بالبوت', detail: e.toString() }); }

  // 2) الويب هوك + مطابقة رابط النشر الحالي (يكشف نسيان نشر نسخة جديدة/ويب هوك قديم)
  try {
    var wh = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getWebhookInfo', { muteHttpExceptions: true }).getContentText());
    var whUrl = (wh.ok && wh.result) ? (wh.result.url || '') : '';
    if (!whUrl) {
      checks.push({ ok: false, label: 'الويب هوك', detail: 'غير مضبوط إطلاقًا! البوت لن يستقبل أي رسالة — فعّله من قسم «استقبال أوامر تيليجرام (Webhook)» بالأعلى' });
    } else {
      var curUrl = '';
      try { curUrl = ScriptApp.getService().getUrl() || ''; } catch (e2) { curUrl = ''; }
      if (curUrl && whUrl !== curUrl) {
        checks.push({ ok: false, label: 'مطابقة رابط النشر', detail: 'الويب هوك يشير إلى نشر مختلف عن النسخة الحالية — أعد تفعيل الويب هوك من قسمه بالأعلى بعد نشر النسخة الجديدة (Deploy ← Manage deployments ← New version)' });
      } else {
        checks.push({ ok: true, label: 'الويب هوك', detail: 'مضبوط ويطابق رابط النشر الحالي' });
      }
      if (wh.result.last_error_message) {
        checks.push({ ok: false, label: 'آخر خطأ سجّله تليجرام', detail: wh.result.last_error_message + (wh.result.last_error_date ? ' — ' + Utilities.formatDate(new Date(wh.result.last_error_date * 1000), Session.getScriptTimeZone(), 'dd/MM HH:mm') : '') });
      }
    }
  } catch (e) { checks.push({ ok: false, label: 'الويب هوك', detail: e.toString() }); }

  // 3) إعدادات البوت
  var cfg = _tgbnCfg_();
  checks.push({ ok: cfg.enabled, label: 'تفعيل البوت', detail: cfg.enabled ? 'مفعّل' : 'معطّل — فعّل المفتاح واضغط حفظ' });
  checks.push({ ok: true, label: 'صيغ البدء', detail: cfg.triggers.join(' · ') });
  if (!cfg.groups.length) checks.push({ ok: false, label: 'الجروبات', detail: 'لا توجد جروبات مصرَّح بها — أضف جروبًا واحفظ' });

  // 4) رسالة اختبار فعلية لكل جروب — تكشف فورًا أي معرّف خاطئ
  var sendTest = function(chatId, txt) {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chatId, text: txt, parse_mode: 'HTML' })
    });
    return JSON.parse(r.getContentText());
  };
  cfg.groups.forEach(function(g, i) {
    var lbl = 'جروب «' + (g.name || ('#' + (i + 1))) + '» (' + g.chatId + ')';
    if (!/^-?\d+$/.test(g.chatId)) { checks.push({ ok: false, label: lbl, detail: 'المعرّف ليس رقمًا صالحًا' }); return; }
    try {
      var r = sendTest(g.chatId, '💠 <b>اختبار بوت تسجيل الإشعارات</b>\nهذا الجروب مضبوط بشكل صحيح ✓\nصيغ البدء: ' + cfg.triggers.map(function(t){ return '«' + t + '»'; }).join(' أو '));
      if (r.ok) checks.push({ ok: true, label: lbl, detail: 'وصلت رسالة الاختبار للجروب بنجاح' });
      else checks.push({ ok: false, label: lbl, detail: 'فشل الإرسال: ' + (r.description || '؟') + ' — غالبًا المعرّف غير صحيح. اكتب /id داخل الجروب نفسه وانسخ الرقم كما يظهر تمامًا (لا تضف -100 يدويًا: الجروب العادي معرّفه قصير مثل -52264759xx والسوبر جروب فقط يبدأ بـ -100)' });
    } catch (e) { checks.push({ ok: false, label: lbl, detail: e.toString() }); }
    if (!g.companies || !g.companies.length) {
      checks.push({ ok: false, label: lbl + ' — الشركات', detail: 'لم تُحدَّد أي شركة لهذا الجروب — المحادثة ستتوقف عند خطوة اختيار الشركة' });
    }
  });

  // 5) جروب التنبيهات
  if (cfg.alertChatId) {
    try {
      var ra = sendTest(cfg.alertChatId, '💠🔔 اختبار جروب التنبيهات — سيصل هنا تنبيه فوري عند كل تسجيل عبر البوت ✓');
      checks.push({ ok: !!ra.ok, label: 'جروب التنبيهات (' + cfg.alertChatId + ')', detail: ra.ok ? 'وصلت رسالة الاختبار بنجاح' : 'فشل الإرسال: ' + (ra.description || '؟') + ' — تحقق من المعرّف بأمر /id داخل جروب التنبيهات' });
    } catch (e) { checks.push({ ok: false, label: 'جروب التنبيهات', detail: e.toString() }); }
  } else {
    checks.push({ ok: true, label: 'جروب التنبيهات', detail: 'غير مضبوط (اختياري) — لن تصل تنبيهات فورية عند التسجيل' });
  }

  return { success: true, checks: checks };
}

// ---------- حالة المحادثة (Cache) ----------
function _tgbnStateKey_(chatId, userId) { return 'tgbn_' + chatId + '_' + userId; }
function _tgbnGetState_(chatId, userId) {
  try {
    var raw = CacheService.getScriptCache().get(_tgbnStateKey_(chatId, userId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function _tgbnSetState_(chatId, userId, state) {
  CacheService.getScriptCache().put(_tgbnStateKey_(chatId, userId), JSON.stringify(state), 1800); // ⏳ 30 دقيقة
}
function _tgbnClearState_(chatId, userId) {
  CacheService.getScriptCache().remove(_tgbnStateKey_(chatId, userId));
}

// ---------- أدوات إرسال ----------
function _tgbnSend_(chatId, html, buttonRows) {
  var token = TELEGRAM_CONFIG.token;
  var payload = { chat_id: chatId, text: html, parse_mode: 'HTML' };
  if (buttonRows && buttonRows.length) payload.reply_markup = JSON.stringify({ inline_keyboard: buttonRows });
  try {
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage",
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  } catch (e) { Logger.log('TGBN send error: ' + e); }
}
function _tgbnEsc_(s) {
  return (s === null || s === undefined) ? '' :
    s.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _tgbnUserLabel_(from) {
  if (!from) return 'غير معروف';
  if (from.username) return '@' + from.username;
  return ((from.first_name || '') + ' ' + (from.last_name || '')).trim() || ('ID:' + from.id);
}

// ---------- أدوات تحقق وتطبيع ----------
function _tgbnNormDigits_(s) {
  // تحويل الأرقام العربية/الفارسية إلى لاتينية وتوحيد الفواصل
  var map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
              '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
  return (s || '').toString().trim().replace(/[٠-٩۰-۹]/g, function(d){ return map[d] || d; })
    .replace(/[\\.\-]/g, '/');
}
function _tgbnParseDate_(s) {
  // يقبل dd/mm/yyyy (مع أرقام عربية أو فواصل - أو .) ويعيد نصًا موحّدًا dd/mm/yyyy أو null
  var v = _tgbnNormDigits_(s);
  var m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  var dd = parseInt(m[1]), mm = parseInt(m[2]), yy = parseInt(m[3]);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 2020 || yy > 2100) return null;
  var dt = new Date(yy, mm - 1, dd);
  if (dt.getDate() !== dd || dt.getMonth() !== mm - 1) return null;
  return ('0' + dd).slice(-2) + '/' + ('0' + mm).slice(-2) + '/' + yy;
}
function _tgbnParseTime_(s) {
  // يقبل HH:MM (24 ساعة) ويعيد نصًا موحّدًا أو null
  var v = _tgbnNormDigits_(s).replace(/[/]/g, ':').replace(/[\s]/g, '');
  var m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var h = parseInt(m[1]), mn = parseInt(m[2]);
  if (h > 23 || mn > 59) return null;
  return ('0' + h).slice(-2) + ':' + ('0' + mn).slice(-2);
}
function _tgbnDmyToDate_(s) {
  var p = (s || '').split('/');
  if (p.length !== 3) return null;
  return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
}
function _tgbnTotalNights_(arrivalDate, departureDate) {
  var a = _tgbnDmyToDate_(arrivalDate), d = _tgbnDmyToDate_(departureDate);
  if (!a || !d || isNaN(a) || isNaN(d)) return 0;
  return Math.max(0, Math.round((d - a) / 86400000));
}
function _tgbnAddDays_(dmy, days) {
  var d = _tgbnDmyToDate_(dmy);
  if (!d || isNaN(d)) return '';
  d.setDate(d.getDate() + days);
  return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
}
// 🏨 تواريخ دخول/خروج سكن المدينة ومكة المحسوبة تلقائيًا من الاتجاه والليالي (نفس منطق النموذج)
function _tgbnHotelDates_(d) {
  var madN = parseInt(d.madinahNights) || 0, makN = parseInt(d.makkahNights) || 0;
  var r = { madIn: '', madOut: '', makIn: '', makOut: '' };
  if (!d.arrivalDate || !d.departureDate) return r;
  if (d.direction === 'المدينة أولاً') {
    if (madN > 0) { r.madIn = d.arrivalDate; r.madOut = _tgbnAddDays_(d.arrivalDate, madN); }
    if (makN > 0) { r.makIn = madN > 0 ? r.madOut : d.arrivalDate; r.makOut = d.departureDate; }
  } else if (d.direction === 'مكة أولاً') {
    if (makN > 0) { r.makIn = d.arrivalDate; r.makOut = _tgbnAddDays_(d.arrivalDate, makN); }
    if (madN > 0) { r.madIn = makN > 0 ? r.makOut : d.arrivalDate; r.madOut = d.departureDate; }
  }
  return r;
}

// 👤 اسم العميل الافتراضي = اسم الشركة المختارة بدون كلمة «شركة» (لا يُسأل عنه في الجروب)
function _tgbnClientName_(d) {
  if (d.client && String(d.client).trim()) return String(d.client).trim();
  return String(d.company || '').replace(/^\s*شركة\s*/, '').trim();
}

// 🚨 هل السفر خلال أقل من 72 ساعة من الآن؟ (يُحسب من تاريخ + وقت الوصول)
function _tgbnWithin72_(arrivalDate, arrivalTime) {
  var d = _tgbnDmyToDate_(arrivalDate);
  if (!d || isNaN(d)) return false;
  var tm = String(arrivalTime || '').match(/^(\d{1,2}):(\d{2})$/);
  if (tm) d.setHours(parseInt(tm[1]), parseInt(tm[2]));
  var diff = d.getTime() - new Date().getTime();
  return diff > -86400000 && diff < 72 * 3600000; // خلال 72 ساعة قادمة (أو بدأ بالفعل)
}

// ---------- أزرار جاهزة ----------
function _tgbnCancelRow_() { return [{ text: '❌ إلغاء', callback_data: 'bn:cancel' }]; }
function _tgbnPortRows_() {
  return [
    [{ text: '🛬 مطار جدة', callback_data: 'bn:port:jed' }, { text: '🛬 مطار المدينة المنورة', callback_data: 'bn:port:med' }],
    [{ text: '🛬 مطار الرياض', callback_data: 'bn:port:ruh' }, { text: '✍️ مطار آخر (اكتبه)', callback_data: 'bn:port:oth' }],
    _tgbnCancelRow_()
  ];
}
function _tgbnPortName_(code) {
  return { jed: 'مطار جدة', med: 'مطار المدينة المنورة', ruh: 'مطار الرياض' }[code] || '';
}

// ---------- نقطة الدخول للرسائل ----------
function _tgbnDispatchMessage_(msg) {
  var cfg = _tgbnCfg_();
  if (!cfg.enabled) return;
  var chatId = msg.chat.id;
  var group = null;
  for (var i = 0; i < cfg.groups.length; i++) {
    if (cfg.groups[i].chatId.toString() === chatId.toString()) { group = cfg.groups[i]; break; }
  }
  if (!group) return; // جروب غير مصرَّح — تجاهل صامت

  var from = msg.from || {};
  var userId = from.id;
  var text = msg.text ? msg.text.trim() : '';
  var state = _tgbnGetState_(chatId, userId);

  // إلغاء صريح في أي وقت
  var cmdWord = text.split('@')[0];
  if (cmdWord === '/الغاء' || cmdWord === '/cancel' || ((text === 'الغاء' || text === 'إلغاء') && state)) {
    if (state) {
      _tgbnClearState_(chatId, userId);
      _tgbnSend_(chatId, '🚫 تم إلغاء تسجيل الإشعار. يمكنك البدء من جديد في أي وقت.');
    }
    return;
  }

  // بدء محادثة جديدة عند مطابقة إحدى صيغ البدء
  if (text && _tgbnIsTrigger_(text, cfg.triggers)) {
    if (!_tgbnUserAllowed_(from, cfg)) {
      _tgbnSend_(chatId, '⛔ عذرًا، غير مصرح لك باستخدام تسجيل الإشعارات.\nللاستفسار تواصل مع الإدارة: <b>' + _tgbnEsc_(cfg.adminPhone) + '</b>');
      return;
    }
    _tgbnStart_(chatId, from, group);
    return;
  }

  // لا توجد محادثة نشطة — تجاهل باقي رسائل الجروب تمامًا
  if (!state) return;

  // محادثة نشطة لهذا المستخدم
  _tgbnHandleMessage_(msg, state, cfg, group);
}

function _tgbnIsTrigger_(text, triggers) {
  var t = text.trim();
  for (var i = 0; i < triggers.length; i++) {
    var trg = triggers[i].trim();
    if (!trg) continue;
    if (t === trg || t.indexOf(trg) === 0 || (trg.charAt(0) !== '/' && t === '/' + trg)) return true;
  }
  return false;
}

function _tgbnUserAllowed_(from, cfg) {
  if (!cfg.allowedUsers.length) return true; // فارغة = كل أعضاء الجروبات المصرَّح بها
  var uname = (from.username || '').toString().trim().toLowerCase();
  var uid = (from.id || '').toString();
  for (var i = 0; i < cfg.allowedUsers.length; i++) {
    var a = cfg.allowedUsers[i].toString().trim().toLowerCase();
    if (a && (a === uname || a === uid)) return true;
  }
  return false;
}

function _tgbnStart_(chatId, from, group) {
  var state = {
    step: 'ticket',
    userName: _tgbnUserLabel_(from),
    groupName: group.name || '',
    data: {}
  };
  _tgbnSetState_(chatId, from.id, state);
  _tgbnSend_(chatId,
    '🕋 <b>تسجيل إشعار وصول جديد</b>\n' +
    '👤 ' + _tgbnEsc_(state.userName) + '\n\n' +
    '📎 أرسل الآن <b>صورة تذكرة الطيران أو ملف PDF</b> وسأستخرج البيانات تلقائيًا،\n' +
    'أو اختر طريقة أخرى من الأزرار.\n\n' +
    '⏳ تنتهي صلاحية المحادثة تلقائيًا بعد 30 دقيقة من عدم التفاعل.',
    [[{ text: '📋 لصق نص التذكرة', callback_data: 'bn:man:txt' }],
     [{ text: '✍️ إدخال يدوي', callback_data: 'bn:manual' }], _tgbnCancelRow_()]);
}

// ---------- معالجة الرسائل داخل محادثة نشطة ----------
function _tgbnHandleMessage_(msg, state, cfg, group) {
  var chatId = msg.chat.id;
  var userId = msg.from.id;
  var text = msg.text ? msg.text.trim() : '';
  var d = state.data;

  // 0) 🏠 خطوة مستند المستضيف: ننتظر صورة/ملف (اختياري)
  if (state.step === 'hostdoc') {
    var hostRef = _tgbnPickFile_(msg);
    if (hostRef) { _tgbnProcessHostDoc_(chatId, userId, state, hostRef); return; }
    _tgbnSend_(chatId, '📎 في انتظار <b>مستند/صورة بيانات المستضيف</b> — أو اضغط تخطي.',
      [[{ text: '⏭️ تخطي', callback_data: 'bn:hdskip' }], _tgbnCancelRow_()]);
    return;
  }

  // 1) خطوة التذكرة: ننتظر صورة/ملف (ونقبل إعادة رفع التذكرة أيضًا أثناء شاشة اختيار الطريقة اليدوية)
  if (state.step === 'ticket' || state.step === 'man_choice') {
    var fileRef = _tgbnPickFile_(msg);
    if (fileRef) { _tgbnProcessTicket_(chatId, userId, state, fileRef); return; }
    if (state.step === 'ticket') {
      _tgbnSend_(chatId, '📎 في انتظار <b>صورة التذكرة أو ملف PDF</b>…\nأو اضغط "إدخال يدوي".',
        [[{ text: '✍️ إدخال يدوي', callback_data: 'bn:manual' }], _tgbnCancelRow_()]);
      return;
    }
  }

  // 2) خطوات نصية
  if (!text) { _tgbnSend_(chatId, '✍️ من فضلك أرسل ردًا نصيًا.', [_tgbnCancelRow_()]); return; }

  switch (state.step) {
    case 'm_paste': { // 📋 لصق نص التذكرة: تحليل بنفس محلل النص المستخدم في البرنامج
      var tres = null;
      try { tres = _analyzeTicketTextCore_(text); } catch (e) { tres = { success: false, error: e.toString() }; }
      if (tres && tres.success && tres.data) {
        var td = tres.data;
        d.arrivalDate    = _tgbnParseDate_(td.arrivalDate || '') || '';
        d.arrivalTime    = _tgbnParseTime_(td.arrivalTime || '') || (td.arrivalTime || '');
        d.arrivalFlight  = td.arrivalFlight || '';
        d.arrivalPort    = td.arrivalPort || '';
        d.departureDate   = _tgbnParseDate_(td.departureDate || '') || '';
        d.departureTime   = _tgbnParseTime_(td.departureTime || '') || (td.departureTime || '');
        d.departureFlight = td.departureFlight || '';
        d.departurePort   = td.departurePort || '';
        _tgbnShowExtractConfirm_(chatId, userId, state, 'النص الملصوق');
      } else {
        _tgbnSend_(chatId,
          '⚠️ ' + _tgbnEsc_((tres && tres.error) ? tres.error : 'لم يتم العثور على رحلات داخل النص.') +
          '\nالصق النص مرة أخرى، أو اختر طريقة أخرى.',
          [[{ text: '↩️ طرق الإدخال', callback_data: 'bn:manual' }], _tgbnCancelRow_()]);
      }
      return;
    }
    case 'm_bulk': { // ⚡ القالب السريع: كل بيانات الطيران في رسالة واحدة
      var parsed = _tgbnParseBulk_(text);
      if (parsed.error) {
        _tgbnSend_(chatId, '⚠️ ' + parsed.error + '\n\nأعد إرسال الرسالة بنفس القالب، أو اضغط إلغاء.', [_tgbnCancelRow_()]);
        return;
      }
      d.arrivalDate = parsed.a.date;   d.arrivalTime = parsed.a.time;
      d.arrivalFlight = parsed.a.flight; d.arrivalPort = parsed.a.port;
      d.departureDate = parsed.d.date;   d.departureTime = parsed.d.time;
      d.departureFlight = parsed.d.flight; d.departurePort = parsed.d.port;
      _tgbnAfterFlightData_(chatId, userId, state, cfg, group);
      return;
    }
    case 'h_both': { // 🏨 السكنان معًا في قالب واحد
      var hp = _tgbnParseHotels_(text);
      if (!hp) {
        _tgbnSend_(chatId,
          '⚠️ لم أتعرف على القالب — انسخه كما هو وعدّل الأسماء فقط:\n' +
          '<pre>سكن المدينة: اسم الفندق\nسكن مكة: اسم الفندق</pre>\n' +
          'واكتب <code>استضافة</code> مكان الاسم لو السكن استضافة.',
          [[{ text: '🏠 استضافة في السكنين', callback_data: 'bn:hst' }],
           [{ text: '⏭️ تخطي السكن', callback_data: 'bn:hskip' }], _tgbnCancelRow_()]);
        return;
      }
      d.madinahHotel = hp.mad;
      d.makkahHotel = hp.mak;
      _tgbnAfterHotels_(chatId, userId, state, group);
      return;
    }
    case 'sup': { // 🧑‍✈️ اسم المشرف (اختياري)
      d.supervisor = text;
      _tgbnAfterSup_(chatId, userId, state, group);
      return;
    }
    case 'pnames': { // 👥 أسماء المعتمرين (اختياري — تُسجَّل بالملاحظات)
      d.pilgrimNames = text.split('\n').map(function(s) { return s.trim(); }).filter(String).join('، ');
      state.editOnce = false;
      _tgbnShowReview_(chatId, userId, state, group);
      return;
    }
    case 'm_ad': {
      var ad = _tgbnParseDate_(text);
      if (!ad) { _tgbnSend_(chatId, '⚠️ صيغة التاريخ غير صحيحة.\nاكتب <b>تاريخ الوصول</b> بصيغة <code>يوم/شهر/سنة</code> مثل: <code>25/08/2026</code>', [_tgbnCancelRow_()]); return; }
      d.arrivalDate = ad;
      state.step = 'm_af';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '✈️ اكتب <b>رقم رحلة الوصول</b> (مثل: <code>SV308</code> أو <code>MS645</code>):', [_tgbnCancelRow_()]);
      return;
    }
    case 'm_af': {
      d.arrivalFlight = text;
      state.step = 'm_ap';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '🛬 اختر <b>مطار الوصول</b>:', _tgbnPortRows_());
      return;
    }
    case 'm_apx': {
      d.arrivalPort = text;
      state.step = 'm_at';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '⏰ اكتب <b>وقت الوصول</b> بصيغة 24 ساعة <code>HH:MM</code> مثل: <code>14:30</code>', [_tgbnCancelRow_()]);
      return;
    }
    case 'm_at': {
      var at = _tgbnParseTime_(text);
      if (!at) { _tgbnSend_(chatId, '⚠️ صيغة الوقت غير صحيحة.\nاكتب <b>وقت الوصول</b> بصيغة <code>HH:MM</code> مثل: <code>14:30</code>', [_tgbnCancelRow_()]); return; }
      d.arrivalTime = at;
      state.step = 'm_dd';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '📅 اكتب <b>تاريخ المغادرة (العودة)</b> بصيغة <code>يوم/شهر/سنة</code>:', [_tgbnCancelRow_()]);
      return;
    }
    case 'm_dd': {
      var dd2 = _tgbnParseDate_(text);
      if (!dd2) { _tgbnSend_(chatId, '⚠️ صيغة التاريخ غير صحيحة.\nاكتب <b>تاريخ المغادرة</b> بصيغة <code>يوم/شهر/سنة</code> مثل: <code>05/09/2026</code>', [_tgbnCancelRow_()]); return; }
      if (d.arrivalDate && _tgbnDmyToDate_(dd2) <= _tgbnDmyToDate_(d.arrivalDate)) {
        _tgbnSend_(chatId, '⚠️ تاريخ المغادرة يجب أن يكون <b>بعد</b> تاريخ الوصول (' + d.arrivalDate + '). حاول مرة أخرى:', [_tgbnCancelRow_()]);
        return;
      }
      d.departureDate = dd2;
      state.step = 'm_df';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '✈️ اكتب <b>رقم رحلة المغادرة</b>:', [_tgbnCancelRow_()]);
      return;
    }
    case 'm_df': {
      d.departureFlight = text;
      state.step = 'm_dp';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '🛫 اختر <b>مطار المغادرة</b>:', _tgbnPortRows_());
      return;
    }
    case 'm_dpx': {
      d.departurePort = text;
      state.step = 'm_dt';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '⏰ اكتب <b>وقت المغادرة</b> بصيغة <code>HH:MM</code>:', [_tgbnCancelRow_()]);
      return;
    }
    case 'm_dt': {
      var dt2 = _tgbnParseTime_(text);
      if (!dt2) { _tgbnSend_(chatId, '⚠️ صيغة الوقت غير صحيحة.\nاكتب <b>وقت المغادرة</b> بصيغة <code>HH:MM</code> مثل: <code>02:15</code>', [_tgbnCancelRow_()]); return; }
      d.departureTime = dt2;
      _tgbnAfterFlightData_(chatId, userId, state, cfg, group);
      return;
    }
    case 'nights': {
      var n = parseInt(_tgbnNormDigits_(text));
      var total = _tgbnTotalNights_(d.arrivalDate, d.departureDate);
      if (isNaN(n) || n < 0 || n > total) {
        _tgbnSend_(chatId, '⚠️ عدد غير صالح.\nإجمالي ليالي الرحلة = <b>' + total + '</b> ليلة.\nاكتب <b>عدد ليالي المدينة</b> (من 0 إلى ' + total + '):', [_tgbnCancelRow_()]);
        return;
      }
      d.madinahNights = n;
      d.makkahNights = total - n;
      if (state.editOnce) { state.editOnce = false; _tgbnShowReview_(chatId, userId, state, group); return; }
      _tgbnAskHotels_(chatId, userId, state, '🕌 ليالي مكة = <b>' + d.makkahNights + '</b> (محسوبة تلقائيًا)\n\n');
      return;
    }
    case 'client': {
      d.client = text;
      state.editOnce = false;
      _tgbnShowReview_(chatId, userId, state, group);
      return;
    }
    default: {
      // خطوة تعتمد على أزرار — ذكّر المستخدم
      _tgbnSend_(chatId, '👆 من فضلك استخدم <b>الأزرار</b> في الرسالة السابقة للمتابعة، أو اكتب <code>الغاء</code> للإلغاء.');
      return;
    }
  }
}

// ---------- معالجة ضغطات الأزرار ----------
function _tgbnHandleCallback_(cq) {
  var chatId = cq.message.chat.id;
  var from = cq.from || {};
  var userId = from.id;
  var dataStr = cq.data || '';
  var cfg = _tgbnCfg_();
  var group = null;
  for (var i = 0; i < cfg.groups.length; i++) {
    if (cfg.groups[i].chatId.toString() === chatId.toString()) { group = cfg.groups[i]; break; }
  }

  var state = _tgbnGetState_(chatId, userId);
  if (dataStr === 'bn:cancel') {
    _tgbnClearState_(chatId, userId);
    _tgbnSend_(chatId, '🚫 تم إلغاء تسجيل الإشعار.');
    return;
  }
  if (!state) {
    _tgbnSend_(chatId, '⌛ انتهت صلاحية هذه المحادثة أو أُلغيت. ابدأ من جديد بكتابة إحدى صيغ البدء.');
    return;
  }
  var d = state.data;
  var parts = dataStr.split(':'); // bn:xxx:yyy

  switch (parts[1]) {
    case 'manual': {
      _tgbnManualChooser_(chatId, userId, state, null);
      return;
    }
    case 'man': { // اختيار طريقة إدخال بيانات الطيران
      if (parts[2] === 'tkt') { // 📎 رفع تذكرة (أو إعادة رفعها)
        state.step = 'ticket';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId, '📎 أرسل الآن <b>صورة تذكرة الطيران أو ملف PDF</b> وسأستخرج البيانات تلقائيًا.', [_tgbnCancelRow_()]);
        return;
      }
      if (parts[2] === 'txt') { // 📋 لصق نص التذكرة
        state.step = 'm_paste';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId,
          '📋 <b>الصق نص التذكرة</b> (سطور الرحلات من نظام الحجز) وسأحلله تلقائيًا.\nمثال على الشكل المقبول:\n' +
          '<pre>1 SM 489 P 14AUG 4 ATZMED HK45 0345 0530\n2 SM 456 P 28AUG 4 JEDATZ HK45 N 1445 1630</pre>',
          [_tgbnCancelRow_()]);
        return;
      }
      if (parts[2] === 'blk') {
        state.step = 'm_bulk';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId,
          '⚡ <b>القالب السريع</b> — انسخ الرسالة التالية، عدّل القيم، وأرسلها في رسالة واحدة:\n\n' +
          '<pre>وصول: 25/08/2026 - 14:30 - SV308 - مطار جدة\nمغادرة: 05/09/2026 - 02:15 - SV309 - مطار المدينة المنورة</pre>\n' +
          '(اضغط على القالب لنسخه — الترتيب: التاريخ - الوقت - رقم الرحلة - المطار)',
          [_tgbnCancelRow_()]);
      } else {
        state.step = 'm_ad';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId, '📝 <b>خطوة بخطوة</b>\n📅 اكتب <b>تاريخ الوصول</b> بصيغة <code>يوم/شهر/سنة</code> مثل: <code>25/08/2026</code>', [_tgbnCancelRow_()]);
      }
      return;
    }
    case 'hskip': { // ⏭️ تخطي إدخال السكن بالكامل
      if (state.step !== 'h_both') return;
      d.madinahHotel = '';
      d.makkahHotel = '';
      _tgbnAfterHotels_(chatId, userId, state, group);
      return;
    }
    case 'hdskip': { // ⏭️ تخطي مستند المستضيف
      if (state.step !== 'hostdoc') return;
      _tgbnAskSup_(chatId, userId, state);
      return;
    }
    case 'hst': { // 🏠 استضافة في السكنين معًا
      if (state.step !== 'h_both') return;
      d.madinahHotel = 'استضافة';
      d.makkahHotel = 'استضافة';
      _tgbnAfterHotels_(chatId, userId, state, group);
      return;
    }
    case 'supskip': { // ⏭️ تخطي اسم المشرف
      if (state.step !== 'sup') return;
      d.supervisor = '';
      _tgbnAfterSup_(chatId, userId, state, group);
      return;
    }
    case 'pnskip': { // ⏭️ تخطي أسماء المعتمرين
      if (state.step !== 'pnames') return;
      d.pilgrimNames = '';
      _tgbnShowReview_(chatId, userId, state, group);
      return;
    }
    case 'ok': { // تأكيد بيانات التذكرة المستخرجة
      if (state.step !== 'confirm_extract') return;
      _tgbnAfterFlightData_(chatId, userId, state, cfg, group);
      return;
    }
    case 'port': {
      if (parts[2] === 'oth') {
        state.step = (state.step === 'm_ap') ? 'm_apx' : 'm_dpx';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId, '✍️ اكتب اسم المطار (مثل: <code>مطار الطائف</code>):', [_tgbnCancelRow_()]);
        return;
      }
      var portName = _tgbnPortName_(parts[2]);
      if (state.step === 'm_ap') {
        d.arrivalPort = portName;
        state.step = 'm_at';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId, '⏰ اكتب <b>وقت الوصول</b> بصيغة <code>HH:MM</code> مثل: <code>14:30</code>', [_tgbnCancelRow_()]);
      } else if (state.step === 'm_dp') {
        d.departurePort = portName;
        state.step = 'm_dt';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId, '⏰ اكتب <b>وقت المغادرة</b> بصيغة <code>HH:MM</code>:', [_tgbnCancelRow_()]);
      }
      return;
    }
    case 'cnt': {
      if (state.step !== 'count') return;
      if (parts[2] === 'more') {
        _tgbnClearState_(chatId, userId);
        _tgbnSend_(chatId, '👥 لتسجيل أكثر من ' + cfg.maxCount + ' معتمرين، من فضلك <b>تواصل مع الإدارة مباشرة</b>:\n📞 <b>' + _tgbnEsc_(cfg.adminPhone) + '</b>\n\nتم إنهاء المحادثة.');
        return;
      }
      d.count = parseInt(parts[2]) || 1;
      if (state.editOnce) { state.editOnce = false; _tgbnShowReview_(chatId, userId, state, group); return; }
      _tgbnAskCompany_(chatId, userId, state, group);
      return;
    }
    case 'co': {
      if (state.step !== 'company') return;
      var comps = (group && group.companies && group.companies.length) ? group.companies : [];
      var idx = parseInt(parts[2]);
      if (isNaN(idx) || idx < 0 || idx >= comps.length) return;
      d.company = comps[idx];
      if (state.editOnce) { state.editOnce = false; _tgbnShowReview_(chatId, userId, state, group); return; }
      state.step = 'direction';
      _tgbnSetState_(chatId, userId, state);
      _tgbnSend_(chatId, '🧭 <b>خط السير</b> — أيهما أولًا؟',
        [[{ text: '🕌 المدينة أولاً', callback_data: 'bn:dir:mad' }, { text: '🕋 مكة أولاً', callback_data: 'bn:dir:mak' }], _tgbnCancelRow_()]);
      return;
    }
    case 'dir': {
      if (state.step !== 'direction') return;
      d.direction = (parts[2] === 'mad') ? 'المدينة أولاً' : 'مكة أولاً';
      if (state.editOnce) { state.editOnce = false; _tgbnShowReview_(chatId, userId, state, group); return; }
      state.step = 'nights';
      _tgbnSetState_(chatId, userId, state);
      var totalN = _tgbnTotalNights_(d.arrivalDate, d.departureDate);
      _tgbnSend_(chatId, '🌙 إجمالي ليالي الرحلة = <b>' + totalN + '</b> ليلة\nاكتب <b>عدد ليالي المدينة</b> (وسيُحسب الباقي لمكة تلقائيًا):', [_tgbnCancelRow_()]);
      return;
    }
    case 'save': {
      if (state.step !== 'review') return;
      _tgbnDoSave_(chatId, userId, state, cfg, group);
      return;
    }
    case 'edit': {
      if (state.step !== 'review') return;
      _tgbnSend_(chatId, '✏️ <b>ماذا تريد تعديله؟</b>',
        [
          [{ text: '👥 العدد', callback_data: 'bn:ed:cnt' }, { text: '🏢 الشركة', callback_data: 'bn:ed:co' }],
          [{ text: '🧭 خط السير', callback_data: 'bn:ed:dir' }, { text: '🌙 الليالي', callback_data: 'bn:ed:ngt' }],
          [{ text: '🏨 السكن', callback_data: 'bn:ed:htl' }, { text: '🧑‍✈️ المشرف', callback_data: 'bn:ed:sup' }],
          [{ text: '👤 اسم العميل', callback_data: 'bn:ed:cli' }, { text: '✈️ بيانات الطيران', callback_data: 'bn:ed:man' }],
          [{ text: '↩️ رجوع للمراجعة', callback_data: 'bn:ed:back' }], _tgbnCancelRow_()
        ]);
      return;
    }
    case 'ed': {
      var which = parts[2];
      if (which === 'back') { _tgbnShowReview_(chatId, userId, state, group); return; }
      state.editOnce = true;
      if (which === 'cnt') { _tgbnAskCount_(chatId, userId, state, cfg); return; }
      if (which === 'co')  { _tgbnAskCompany_(chatId, userId, state, group); return; }
      if (which === 'dir') {
        state.step = 'direction';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId, '🧭 <b>خط السير</b> — أيهما أولًا؟',
          [[{ text: '🕌 المدينة أولاً', callback_data: 'bn:dir:mad' }, { text: '🕋 مكة أولاً', callback_data: 'bn:dir:mak' }], _tgbnCancelRow_()]);
        return;
      }
      if (which === 'ngt') {
        state.step = 'nights';
        _tgbnSetState_(chatId, userId, state);
        var tn = _tgbnTotalNights_(d.arrivalDate, d.departureDate);
        _tgbnSend_(chatId, '🌙 إجمالي ليالي الرحلة = <b>' + tn + '</b>\nاكتب <b>عدد ليالي المدينة</b>:', [_tgbnCancelRow_()]);
        return;
      }
      if (which === 'cli') {
        state.step = 'client';
        _tgbnSetState_(chatId, userId, state);
        _tgbnSend_(chatId, '👤 اكتب <b>اسم العميل</b>:', [_tgbnCancelRow_()]);
        return;
      }
      if (which === 'htl') {
        _tgbnAskHotels_(chatId, userId, state, '');
        return;
      }
      if (which === 'sup') {
        _tgbnAskSup_(chatId, userId, state);
        return;
      }
      if (which === 'man') {
        state.editOnce = false; // إعادة إدخال سلسلة الطيران كاملة ثم العودة للمراجعة تلقائيًا (العدد محفوظ)
        _tgbnManualChooser_(chatId, userId, state, '✍️ <b>إعادة إدخال بيانات الطيران</b>');
        return;
      }
      return;
    }
  }
}

// ---------- التذكرة: التقاط الملف وتحليله ----------
function _tgbnPickFile_(msg) {
  // يعيد {fileId, fileName, fileSize, mime} أو null
  if (msg.photo && msg.photo.length) {
    var ph = msg.photo[msg.photo.length - 1]; // أكبر مقاس
    return { fileId: ph.file_id, fileName: 'ticket_photo.jpg', fileSize: ph.file_size || 0, mime: 'image/jpeg' };
  }
  if (msg.document) {
    var doc = msg.document;
    var mime = (doc.mime_type || '').toLowerCase();
    if (mime.indexOf('image/') === 0 || mime === 'application/pdf') {
      return { fileId: doc.file_id, fileName: doc.file_name || 'ticket.pdf', fileSize: doc.file_size || 0, mime: mime };
    }
  }
  return null;
}

function _tgbnProcessTicket_(chatId, userId, state, fileRef) {
  if (fileRef.fileSize && fileRef.fileSize > 15 * 1024 * 1024) {
    _tgbnSend_(chatId, '⚠️ حجم الملف كبير جدًا (الحد 15MB). أرسل نسخة أصغر أو اضغط "إدخال يدوي".',
      [[{ text: '✍️ إدخال يدوي', callback_data: 'bn:manual' }], _tgbnCancelRow_()]);
    return;
  }
  _tgbnSend_(chatId, '🔍 جاري تحليل التذكرة بالذكاء الاصطناعي… ⏳');
  var token = TELEGRAM_CONFIG.token;
  var res = null;
  try {
    var meta = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getFile?file_id=' + encodeURIComponent(fileRef.fileId)).getContentText());
    var filePath = meta && meta.result && meta.result.file_path;
    if (!filePath) throw new Error('getFile فشل');
    var blob = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + token + '/' + filePath).getBlob();
    // ⚠️ لا نعتمد على Content-Type القادم من سيرفر تليجرام — يعيد غالبًا application/octet-stream
    // وGemini يرفضه، فيفشل التحليل رغم صحة الملف. نحدد النوع من نوع المستند/امتداد المسار بأنفسنا.
    var lowerPath = filePath.toLowerCase();
    var contentType =
      (fileRef.mime && fileRef.mime !== 'application/octet-stream') ? fileRef.mime :
      (lowerPath.indexOf('.pdf') > -1) ? 'application/pdf' :
      (lowerPath.indexOf('.png') > -1) ? 'image/png' :
      (lowerPath.indexOf('.webp') > -1) ? 'image/webp' :
      'image/jpeg';
    var dataUrl = 'data:' + contentType + ';base64,' + Utilities.base64Encode(blob.getBytes());
    res = _analyzeTicketCore_(dataUrl, fileRef.fileName, state.data.ticketFileId || null);
  } catch (e) {
    res = { success: false, error: e.toString() };
  }

  if (res && res.success && res.aiData) {
    var ai = res.aiData;
    state.data.ticketFileId = res.fileId || '';
    state.data.ticketUrl = res.fileUrl || '';
    state.data.arrivalDate    = _tgbnParseDate_(ai.arrivalDate || '') || '';
    state.data.arrivalTime    = _tgbnParseTime_(ai.arrivalTime || '') || (ai.arrivalTime || '');
    state.data.arrivalFlight  = ai.arrivalFlight || '';
    state.data.arrivalPort    = ai.arrivalPort || '';
    state.data.departureDate   = _tgbnParseDate_(ai.departureDate || '') || '';
    state.data.departureTime   = _tgbnParseTime_(ai.departureTime || '') || (ai.departureTime || '');
    state.data.departureFlight = ai.departureFlight || '';
    state.data.departurePort   = ai.departurePort || '';
    _tgbnShowExtractConfirm_(chatId, userId, state, 'التذكرة');
  } else {
    // حتى مع فشل الاستخراج: لو الملف حُفظ في الدرايف نُبقيه مرفقًا بالإشعار
    if (res && res.success && res.fileId) {
      state.data.ticketFileId = res.fileId;
      state.data.ticketUrl = res.fileUrl || '';
    }
    var why = res ? (res.error || res.warning || '') : '';
    _tgbnManualChooser_(chatId, userId, state,
      '⚠️ تعذّر استخراج بيانات التذكرة تلقائيًا' +
      (why ? '\n<i>السبب: ' + _tgbnEsc_(String(why).substring(0, 160)) + '</i>' : '') +
      (state.data.ticketFileId ? '\n📎 التذكرة نفسها حُفظت وستُرفق بالإشعار.' : ''));
  }
}

// ---------- اختيار طريقة إدخال بيانات الطيران: تذكرة / لصق نص / قالب / خطوة بخطوة ----------
function _tgbnManualChooser_(chatId, userId, state, introHtml) {
  state.step = 'man_choice';
  _tgbnSetState_(chatId, userId, state);
  _tgbnSend_(chatId,
    (introHtml || '✍️ <b>إدخال بيانات الطيران</b>') + '\n\nاختر الطريقة الأنسب لك:',
    [[{ text: '📎 رفع تذكرة (صورة/PDF)', callback_data: 'bn:man:tkt' }],
     [{ text: '📋 لصق نص التذكرة (تحليل تلقائي)', callback_data: 'bn:man:txt' }],
     [{ text: '⚡ رسالة واحدة (قالب سريع)', callback_data: 'bn:man:blk' }],
     [{ text: '📝 خطوة بخطوة', callback_data: 'bn:man:st' }],
     _tgbnCancelRow_()]);
}

// ---------- بطاقة تأكيد البيانات المستخرجة (من التذكرة أو من النص الملصوق) ----------
function _tgbnShowExtractConfirm_(chatId, userId, state, srcLabel) {
  state.step = 'confirm_extract';
  _tgbnSetState_(chatId, userId, state);
  var dd = state.data;
  _tgbnSend_(chatId,
    '✅ <b>تم استخراج البيانات من ' + srcLabel + ':</b>\n' +
    '━━━━━━━━━━━━━━\n' +
    '🛬 <b>الوصول:</b> ' + _tgbnEsc_(dd.arrivalDate || '—') + ' ⏰ ' + _tgbnEsc_(dd.arrivalTime || '—') + '\n' +
    '   ✈️ ' + _tgbnEsc_(dd.arrivalFlight || '—') + ' — ' + _tgbnEsc_(dd.arrivalPort || '—') + '\n' +
    '🛫 <b>المغادرة:</b> ' + _tgbnEsc_(dd.departureDate || '—') + ' ⏰ ' + _tgbnEsc_(dd.departureTime || '—') + '\n' +
    '   ✈️ ' + _tgbnEsc_(dd.departureFlight || '—') + ' — ' + _tgbnEsc_(dd.departurePort || '—') + '\n' +
    '━━━━━━━━━━━━━━\n' +
    'هل البيانات صحيحة؟',
    [[{ text: '✅ نعم، متابعة', callback_data: 'bn:ok' }, { text: '✍️ لا، طريقة أخرى', callback_data: 'bn:manual' }], _tgbnCancelRow_()]);
}

// ---------- محلل القالب السريع: سطر للوصول وسطر للمغادرة في رسالة واحدة ----------
function _tgbnParseBulk_(text) {
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(String);
  var a = null, dp = null;
  lines.forEach(function(l) {
    var ci = l.indexOf(':');
    if (ci < 0) return;
    var label = l.substring(0, ci).trim();
    var rest = l.substring(ci + 1).trim();
    var parts = rest.split(/\s*-\s*/);
    var obj = {
      date: _tgbnParseDate_(parts[0] || ''),
      time: _tgbnParseTime_(parts[1] || ''),
      flight: (parts[2] || '').trim(),
      port: parts.slice(3).join(' - ').trim()
    };
    if (label.indexOf('وصول') > -1) a = obj;
    else if (label.indexOf('مغادر') > -1 || label.indexOf('عودة') > -1) dp = obj;
  });
  if (!a || !dp) return { error: 'لم أجد سطري «وصول:» و«مغادرة:» — انسخ القالب كما هو وعدّل القيم فقط.' };
  var miss = [];
  if (!a.date) miss.push('تاريخ الوصول'); if (!a.time) miss.push('وقت الوصول');
  if (!a.flight) miss.push('رقم رحلة الوصول'); if (!a.port) miss.push('مطار الوصول');
  if (!dp.date) miss.push('تاريخ المغادرة'); if (!dp.time) miss.push('وقت المغادرة');
  if (!dp.flight) miss.push('رقم رحلة المغادرة'); if (!dp.port) miss.push('مطار المغادرة');
  if (miss.length) return { error: 'قيم ناقصة أو غير صحيحة: <b>' + miss.join('، ') + '</b>\nتذكير: التاريخ <code>يوم/شهر/سنة</code>، الوقت <code>HH:MM</code>، والفصل بين القيم بشرطة <code>-</code>' };
  return { a: a, d: dp };
}

// ---------- الانتقال بعد اكتمال بيانات الطيران ----------
function _tgbnAfterFlightData_(chatId, userId, state, cfg, group) {
  // تحقق منطقي أخير: المغادرة بعد الوصول
  var d = state.data;
  if (d.arrivalDate && d.departureDate && _tgbnDmyToDate_(d.departureDate) <= _tgbnDmyToDate_(d.arrivalDate)) {
    state.step = 'm_dd';
    _tgbnSetState_(chatId, userId, state);
    _tgbnSend_(chatId, '⚠️ تاريخ المغادرة (' + d.departureDate + ') يجب أن يكون بعد تاريخ الوصول (' + d.arrivalDate + ').\n📅 اكتب <b>تاريخ المغادرة</b> الصحيح:', [_tgbnCancelRow_()]);
    return;
  }
  if (state.editOnce || d.count) { state.editOnce = false; _tgbnShowReview_(chatId, userId, state, group); return; }
  _tgbnAskCount_(chatId, userId, state, cfg);
}

function _tgbnAskCount_(chatId, userId, state, cfg) {
  state.step = 'count';
  _tgbnSetState_(chatId, userId, state);
  var maxC = cfg.maxCount || 4;
  var row = [];
  for (var i = 1; i <= Math.min(maxC, 8); i++) row.push({ text: String(i), callback_data: 'bn:cnt:' + i });
  var rows = [];
  while (row.length) rows.push(row.splice(0, 4));
  rows.push([{ text: '👥 أكثر من ' + maxC, callback_data: 'bn:cnt:more' }]);
  rows.push(_tgbnCancelRow_());
  _tgbnSend_(chatId, '👥 <b>عدد المعتمرين؟</b>', rows);
}

function _tgbnAskCompany_(chatId, userId, state, group) {
  var comps = (group && group.companies && group.companies.length) ? group.companies : [];
  if (!comps.length) {
    // لا شركات مخصصة لهذا الجروب — لا يمكن المتابعة
    _tgbnClearState_(chatId, userId);
    _tgbnSend_(chatId, '⚠️ لم تُحدَّد شركات لهذا الجروب في إعدادات البرنامج. تواصل مع الإدارة.');
    return;
  }
  state.step = 'company';
  _tgbnSetState_(chatId, userId, state);
  if (comps.length === 1 && !state.editOnce) {
    // شركة واحدة فقط — اختيار تلقائي
    state.data.company = comps[0];
    state.step = 'direction';
    _tgbnSetState_(chatId, userId, state);
    _tgbnSend_(chatId, '🏢 الشركة: <b>' + _tgbnEsc_(comps[0]) + '</b> (الوحيدة المخصصة لهذا الجروب)\n\n🧭 <b>خط السير</b> — أيهما أولًا؟',
      [[{ text: '🕌 المدينة أولاً', callback_data: 'bn:dir:mad' }, { text: '🕋 مكة أولاً', callback_data: 'bn:dir:mak' }], _tgbnCancelRow_()]);
    return;
  }
  var rows = [];
  for (var i = 0; i < comps.length; i++) rows.push([{ text: '🏢 ' + comps[i], callback_data: 'bn:co:' + i }]);
  rows.push(_tgbnCancelRow_());
  _tgbnSend_(chatId, '🏢 <b>اختر الشركة:</b>', rows);
}

// ---------- السكن (قالب واحد للمدينة ومكة معًا + خيار الاستضافة) ثم المشرف الاختياري ----------
function _tgbnAskHotels_(chatId, userId, state, prefixHtml) {
  state.step = 'h_both';
  _tgbnSetState_(chatId, userId, state);
  _tgbnSend_(chatId,
    (prefixHtml || '') +
    '🏨 <b>السكن</b> — انسخ القالب التالي، عدّل الأسماء، وأرسله في رسالة واحدة:\n' +
    '<pre>سكن المدينة: اسم الفندق\nسكن مكة: اسم الفندق</pre>\n' +
    '💡 اكتب <code>استضافة</code> مكان اسم الفندق لو سكن المدينة أو مكة استضافة.',
    [[{ text: '🏠 استضافة في السكنين', callback_data: 'bn:hst' }],
     [{ text: '⏭️ تخطي السكن', callback_data: 'bn:hskip' }],
     _tgbnCancelRow_()]);
}

// يفصل قالب السكن الموحد إلى قيمتي المدينة ومكة — يعيد null لو لم يتعرف على أي سطر
function _tgbnParseHotels_(text) {
  var mad = null, mak = null;
  text.split('\n').forEach(function(l) {
    var ci = l.indexOf(':');
    if (ci < 0) return;
    var label = l.substring(0, ci);
    var val = l.substring(ci + 1).trim();
    if (label.indexOf('المدينة') > -1) mad = val;
    else if (label.indexOf('مكة') > -1 || label.indexOf('مكه') > -1) mak = val;
  });
  if (mad === null && mak === null) return null;
  return { mad: mad || '', mak: mak || '' };
}

function _tgbnAfterHotels_(chatId, userId, state, group) {
  if (state.editOnce) { state.editOnce = false; _tgbnShowReview_(chatId, userId, state, group); return; }
  // 🏠 سكن استضافة → اطلب مستند بيانات المستضيف (اختياري) قبل المشرف
  if (state.data.madinahHotel === 'استضافة' || state.data.makkahHotel === 'استضافة') {
    _tgbnAskHostDoc_(chatId, userId, state);
    return;
  }
  _tgbnAskSup_(chatId, userId, state);
}

function _tgbnAskHostDoc_(chatId, userId, state) {
  state.step = 'hostdoc';
  _tgbnSetState_(chatId, userId, state);
  _tgbnSend_(chatId,
    '🏠 السكن <b>استضافة</b> — أرسل <b>مستند/صورة بيانات المستضيف</b> (اختياري) وسيُرفق بملف الإشعار بعد التذكرة تمامًا:',
    [[{ text: '⏭️ تخطي', callback_data: 'bn:hdskip' }], _tgbnCancelRow_()]);
}

// حفظ مستند المستضيف في مجلد التذاكر الدائم مباشرة (لا يمسّه تنظيف المجلد المؤقت)
function _tgbnProcessHostDoc_(chatId, userId, state, fileRef) {
  if (fileRef.fileSize && fileRef.fileSize > 15 * 1024 * 1024) {
    _tgbnSend_(chatId, '⚠️ حجم الملف كبير جدًا (الحد 15MB) — أرسل نسخة أصغر أو اضغط تخطي.',
      [[{ text: '⏭️ تخطي', callback_data: 'bn:hdskip' }], _tgbnCancelRow_()]);
    return;
  }
  _tgbnSend_(chatId, '📎 جاري حفظ مستند المستضيف… ⏳');
  try {
    var token = TELEGRAM_CONFIG.token;
    var meta = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getFile?file_id=' + encodeURIComponent(fileRef.fileId)).getContentText());
    var filePath = meta && meta.result && meta.result.file_path;
    if (!filePath) throw new Error('getFile فشل');
    var blob = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + token + '/' + filePath).getBlob();
    var lower = filePath.toLowerCase();
    var ct = (fileRef.mime && fileRef.mime !== 'application/octet-stream') ? fileRef.mime :
      (lower.indexOf('.pdf') > -1 ? 'application/pdf' : lower.indexOf('.png') > -1 ? 'image/png' : 'image/jpeg');
    blob.setContentType(ct);
    var folder = getDriveFolder_('TICKETS');
    var f = folder.createFile(blob);
    f.setName('مستند المستضيف - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HHmmss') + (ct === 'application/pdf' ? '.pdf' : '.jpg'));
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    state.data.hostDocUrl = f.getUrl();
    _tgbnSetState_(chatId, userId, state);
    _tgbnSend_(chatId, '✅ حُفظ مستند المستضيف وسيُرفق بالإشعار.');
  } catch (e) {
    _tgbnSend_(chatId, '⚠️ تعذّر حفظ المستند (' + _tgbnEsc_(String(e).substring(0, 100)) + ') — سنكمل التسجيل بدونه.');
  }
  _tgbnAskSup_(chatId, userId, state);
}

function _tgbnAskSup_(chatId, userId, state) {
  state.step = 'sup';
  _tgbnSetState_(chatId, userId, state);
  _tgbnSend_(chatId, '🧑‍✈️ اكتب <b>اسم المشرف</b> (اختياري — يمكنك التخطي):', [[{ text: '⏭️ تخطي', callback_data: 'bn:supskip' }], _tgbnCancelRow_()]);
}

function _tgbnAfterSup_(chatId, userId, state, group) {
  if (state.editOnce) { state.editOnce = false; _tgbnShowReview_(chatId, userId, state, group); return; }
  // 👤 لا نسأل عن اسم العميل — الافتراضي: اسم الشركة بدون كلمة «شركة». ننتقل لأسماء المعتمرين (اختياري)
  state.step = 'pnames';
  _tgbnSetState_(chatId, userId, state);
  _tgbnSend_(chatId, '👥 أرسل <b>أسماء المعتمرين</b> (سطر لكل اسم) — اختياري، وستُسجَّل في ملاحظات الإشعار:', [[{ text: '⏭️ تخطي', callback_data: 'bn:pnskip' }], _tgbnCancelRow_()]);
}

// ---------- بطاقة المراجعة النهائية ----------
function _tgbnShowReview_(chatId, userId, state, group) {
  var d = state.data;
  state.step = 'review';
  _tgbnSetState_(chatId, userId, state);
  var hd = _tgbnHotelDates_(d); // 🏨 تواريخ السكن المحسوبة — تُعرض للمراجعة وتُسجَّل بالإشعار عند الإقرار
  _tgbnSend_(chatId,
    '📋 <b>مراجعة الإشعار قبل التسجيل</b>\n' +
    '━━━━━━━━━━━━━━\n' +
    '👤 <b>العميل:</b> ' + _tgbnEsc_(_tgbnClientName_(d) || '—') + '\n' +
    '👥 <b>العدد:</b> ' + _tgbnEsc_(d.count || '—') + '\n' +
    '🏢 <b>الشركة:</b> ' + _tgbnEsc_(d.company || '—') + '\n' +
    '🧭 <b>خط السير:</b> ' + _tgbnEsc_(d.direction || '—') + '\n' +
    '🌙 <b>الليالي:</b> المدينة ' + _tgbnEsc_(d.madinahNights !== undefined ? d.madinahNights : '—') + ' / مكة ' + _tgbnEsc_(d.makkahNights !== undefined ? d.makkahNights : '—') + '\n' +
    '🏨 <b>السكن:</b> المدينة: ' + _tgbnEsc_(d.madinahHotel || 'غير محدد') + ' / مكة: ' + _tgbnEsc_(d.makkahHotel || 'غير محدد') + '\n' +
    (hd.madIn ? '📅 <b>سكن المدينة:</b> ' + _tgbnEsc_(hd.madIn) + ' ← ' + _tgbnEsc_(hd.madOut) + '\n' : '') +
    (hd.makIn ? '📅 <b>سكن مكة:</b> ' + _tgbnEsc_(hd.makIn) + ' ← ' + _tgbnEsc_(hd.makOut) + '\n' : '') +
    '🧑‍✈️ <b>المشرف:</b> ' + _tgbnEsc_(d.supervisor || 'غير محدد') + '\n' +
    (d.pilgrimNames ? '👥 <b>الأسماء:</b> ' + _tgbnEsc_(d.pilgrimNames) + '\n' : '') +
    (((d.madinahHotel === 'استضافة') || (d.makkahHotel === 'استضافة')) ? '🚌 <b>النقل:</b> بمعرفة العميل (تلقائيًا — سكن استضافة)\n' : '') +
    (d.hostDocUrl ? '🏠 <b>مستند المستضيف:</b> مرفق ✅\n' : '') +
    '━━━━━━━━━━━━━━\n' +
    '🛬 <b>الوصول:</b> ' + _tgbnEsc_(d.arrivalDate || '—') + ' ⏰ ' + _tgbnEsc_(d.arrivalTime || '—') + '\n' +
    '   ✈️ ' + _tgbnEsc_(d.arrivalFlight || '—') + ' — ' + _tgbnEsc_(d.arrivalPort || '—') + '\n' +
    '🛫 <b>المغادرة:</b> ' + _tgbnEsc_(d.departureDate || '—') + ' ⏰ ' + _tgbnEsc_(d.departureTime || '—') + '\n' +
    '   ✈️ ' + _tgbnEsc_(d.departureFlight || '—') + ' — ' + _tgbnEsc_(d.departurePort || '—') + '\n' +
    '📎 <b>التذكرة:</b> ' + (d.ticketFileId ? 'مرفقة ✅' : 'غير مرفقة') + '\n' +
    '━━━━━━━━━━━━━━' +
    (_tgbnWithin72_(d.arrivalDate, d.arrivalTime) ? '\n🚨 <b>تنبيه هام: تاريخ السفر خلال أقل من 72 ساعة من الآن!</b>' : ''),
    [[{ text: '✅ تسجيل', callback_data: 'bn:save' }, { text: '✏️ تعديل', callback_data: 'bn:edit' }, { text: '❌ إلغاء', callback_data: 'bn:cancel' }]]);
}

// ---------- الحفظ النهائي ----------
function _tgbnDoSave_(chatId, userId, state, cfg, group) {
  var d = state.data;
  _tgbnSend_(chatId, '💾 جاري تسجيل الإشعار… ⏳');
  var botToken = createSession_('TelegramBot', '💠 بوت تليجرام', 'all');
  var agent = '';
  try { agent = getAgentByCompany(botToken, d.company) || ''; } catch (e) { agent = ''; }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  // 🏨 تواريخ سكن المدينتين المحسوبة (نفس ما عُرض في بطاقة المراجعة) — تُسجَّل فعليًا بالإشعار
  var hd = _tgbnHotelDates_(d);
  // 🚌 سكن استضافة (لأي من المدينتين) → النقل بمعرفة العميل تلقائيًا
  var isHosting = (d.madinahHotel === 'استضافة') || (d.makkahHotel === 'استضافة');

  var bookingData = {
    __fromTelegramBot__: true,
    status: 'قيد المراجعة',
    client: _tgbnClientName_(d),
    count: d.count || 1,
    company: d.company || '',
    agent: agent,
    travelMethod: 'طيران',
    direction: d.direction || '',
    madinahNights: d.madinahNights !== undefined ? d.madinahNights : 0,
    makkahNights: d.makkahNights !== undefined ? d.makkahNights : 0,
    madinahHotel: d.madinahHotel || '',
    makkahHotel: d.makkahHotel || '',
    madinahCheckIn: hd.madIn,
    madinahCheckOut: hd.madOut,
    makkahCheckIn: hd.makIn,
    makkahCheckOut: hd.makOut,
    supervisor: d.supervisor || '',
    transportCompany: isHosting ? 'النقل بمعرفة العميل' : '',
    arrivalDate: d.arrivalDate || '',
    arrivalTime: d.arrivalTime || '',
    arrivalFlight: d.arrivalFlight || '',
    arrivalPort: d.arrivalPort || '',
    departureDate: d.departureDate || '',
    departureTime: d.departureTime || '',
    departureFlight: d.departureFlight || '',
    departurePort: d.departurePort || '',
    notes: '💠 سُجّل تلقائيًا عبر بوت تليجرام بواسطة ' + state.userName +
           (state.groupName ? ' (جروب: ' + state.groupName + ')' : '') + ' — ' + stamp +
           (d.pilgrimNames ? '\n👥 أسماء المعتمرين: ' + d.pilgrimNames : '') +
           (d.hostDocUrl ? '\n📎 مستند المستضيف: ' + d.hostDocUrl : ''),
    ticketFileId: d.ticketFileId || '',
    ticketUrl: d.ticketUrl || '',
    ticketTemporary: d.ticketFileId ? true : false
  };
  var res = null;
  try {
    res = saveBookingToServer(botToken, bookingData);
  } catch (e) {
    res = { success: false, error: e.toString() };
  }
  if (res && res.success) {
    _tgbnClearState_(chatId, userId);
    _tgbnSend_(chatId,
      '🎉 <b>تم تسجيل الإشعار بنجاح!</b>\n' +
      '🔖 رقم الإشعار: <b>#' + res.id + '</b>\n' +
      '📌 الحالة: <b>قيد المراجعة</b> — سيعتمده فريق الإدارة بعد التدقيق.\n' +
      (_tgbnWithin72_(d.arrivalDate, d.arrivalTime) ? '🚨 <b>للعلم: تاريخ السفر خلال أقل من 72 ساعة من الآن!</b>\n' : '') +
      'شكرًا لك 🌹');
    // 🔔 تنبيه فوري في جروب التنبيهات
    var alertChat = (cfg.alertChatId || '').toString().trim();
    if (alertChat && alertChat !== chatId.toString()) {
      _tgbnSend_(alertChat,
        '💠🔔 <b>إشعار وصول جديد عبر البوت — يحتاج مراجعة</b>\n' +
        (_tgbnWithin72_(d.arrivalDate, d.arrivalTime) ? '🚨 <b>السفر خلال أقل من 72 ساعة!</b>\n' : '') +
        '━━━━━━━━━━━━━━\n' +
        '🔖 <b>#' + res.id + '</b> | 👤 ' + _tgbnEsc_(_tgbnClientName_(d) || '—') + ' | 👥 ' + _tgbnEsc_(d.count || '—') + '\n' +
        '🏢 ' + _tgbnEsc_(d.company || '—') + (agent ? ' — ' + _tgbnEsc_(agent) : '') + '\n' +
        '🛬 ' + _tgbnEsc_(d.arrivalDate || '—') + ' ⏰ ' + _tgbnEsc_(d.arrivalTime || '—') + ' (' + _tgbnEsc_(d.arrivalPort || '—') + ')\n' +
        '🛫 ' + _tgbnEsc_(d.departureDate || '—') + ' ⏰ ' + _tgbnEsc_(d.departureTime || '—') + '\n' +
        '🧭 ' + _tgbnEsc_(d.direction || '—') + ' | 🌙 م' + _tgbnEsc_(d.madinahNights) + '/ك' + _tgbnEsc_(d.makkahNights) + '\n' +
        ((d.madinahHotel || d.makkahHotel) ? '🏨 المدينة: ' + _tgbnEsc_(d.madinahHotel || '—') + ' / مكة: ' + _tgbnEsc_(d.makkahHotel || '—') + '\n' : '') +
        (d.supervisor ? '🧑‍✈️ المشرف: ' + _tgbnEsc_(d.supervisor) + '\n' : '') +
        '✍️ بواسطة: ' + _tgbnEsc_(state.userName) + (state.groupName ? ' (' + _tgbnEsc_(state.groupName) + ')' : ''));
    }
  } else {
    var errTxt = res && res.error ? (typeof res.error === 'string' ? res.error : JSON.stringify(res.error)) : 'خطأ غير معروف';
    _tgbnSend_(chatId, '❌ <b>تعذّر تسجيل الإشعار:</b>\n' + _tgbnEsc_(errTxt) + '\n\nيمكنك تعديل البيانات والمحاولة مرة أخرى.',
      [[{ text: '✏️ تعديل', callback_data: 'bn:edit' }, { text: '❌ إلغاء', callback_data: 'bn:cancel' }]]);
    state.step = 'review';
    _tgbnSetState_(chatId, userId, state);
  }
}

function getLatestDataFromServer(authToken) {
  requireAuth_(authToken);

  return {
    bookings: getAllBookings(),
    movements: getAllMovements()
  };
}

function verifyMyGeminiKey() {
  var keys = _geminiKeys_();
  if (!keys.length) return '❌ لم يتم ضبط أي مفتاح Gemini في الإعدادات';

  var lines = [];
  for (var i = 0; i < keys.length; i++) {
    var label = (i === 0 ? 'الأساسي' : 'الاحتياطي') + ' (' + _maskKey_(keys[i]) + ')';
    try {
      var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + keys[i];
      var res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
      });
      var c = res.getResponseCode();
      if (c === 200) lines.push('✅ ' + label + ': صالح ويعمل');
      else if (c === 429) lines.push('⏳ ' + label + ': صالح لكن حصته ممتلئة حالياً');
      else {
        var body = {};
        try { body = JSON.parse(res.getContentText()); } catch (pe) {}
        lines.push('❌ ' + label + ': ' + ((body.error && body.error.message) || ('HTTP ' + c)));
      }
    } catch (err) {
      lines.push('❌ ' + label + ': ' + err.message);
    }
  }
  return lines.join('\n');
}






function changeMyPassword(authToken, oldPassword, newPassword) {
  var session = requireAuth_(authToken);
  if (!oldPassword || !newPassword) {
    throw new Error("بيانات غير مكتملة");
  }
  // بلا قيود على طول/تعقيد كلمة المرور — يُسمح بأي كلمة مرور يختارها المستخدم
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == session.username) {
      if (!checkPasswordMatch_(oldPassword, data[i][1])) {
        return { success: false, error: "كلمة المرور الحالية غير صحيحة" };
      }
      sheet.getRange(i + 1, 2).setValue(hashPassword_(newPassword));
      // مسح علامة "يجب تغيير كلمة المرور" بعد التغيير الناجح
      sheet.getRange(i + 1, 6).setValue(false);
      logChange_(session.username, "تغيير كلمة المرور", session.username, "Password", "-", "تم التغيير بنجاح");
      return { success: true };
    }
  }
  return { success: false, error: "تعذر العثور على المستخدم" };
}


/* ===============================
   نظام مشاركة PDF مؤقت (منفصل تماماً عن نظام الطباعة والحفظ الحالي)
================================ */
function _ensureTempShareFolder_() {
  return getDriveFolder_('TEMP');
}

// ينشئ ملف PDF مؤقت من محتوى HTML جاهز (ويُرفق صورة التذكرة كصفحة إضافية إن توفر معرّفها)، يحفظه، ويعيد الرابط + الـ Base64 معاً
// يبني كتلة HTML لصفحة "التذكرة المرفقة" في صفحة الطباعة (متصفح حقيقي، فيكفي رابط Drive مباشر بدون Base64)
function extractDriveFileId_(url) {
  if (!url) return null;
  var m = String(url).match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

function buildTicketPdfSection_(ticketUrl, sectionTitle) {
  var ticketFileId = extractDriveFileId_(ticketUrl);
  if (!ticketFileId) return '';

  try {
    var ticketFile = DriveApp.getFileById(ticketFileId);
    var ticketMime = ticketFile.getMimeType();
    var ticketImgBase64 = null;
    var ticketImgMime = null;

    if (ticketMime.indexOf('image/') === 0) {
      ticketImgBase64 = Utilities.base64Encode(ticketFile.getBlob().getBytes());
      ticketImgMime = ticketMime;
    } else if (ticketMime === 'application/pdf') {
      var thumbUrl = 'https://drive.google.com/thumbnail?id=' + ticketFileId + '&sz=w2000';
      var resp = UrlFetchApp.fetch(thumbUrl, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() === 200) {
        ticketImgBase64 = Utilities.base64Encode(resp.getBlob().getBytes());
        ticketImgMime = 'image/png';
      }
    }

    if (!ticketImgBase64) return '';

    // page-break-before + inline styles = محوّل Google هيبدأها في صفحة جديدة والعنوان يظهر فوق الصورة مباشرة
    // ملاحظة: بدون padding خارجي هنا لأن @page margin: 6mm يوفّر الهامش الكافي،
    // وأي padding إضافي كان بيدفع الصورة لصفحة تالتة
    return '<div style="page-break-before:always;">' +
             '<table style="width:100%;border-collapse:collapse;margin:0 0 6px 0;">' +
               '<tr>' +
                 '<td bgcolor="#1e3d59" style="background:#1e3d59;padding:6px 14px;border-radius:8px;font-weight:700;font-size:14px;color:#ffffff;font-family:\'Cairo\',Tahoma,Arial,sans-serif;">' + (sectionTitle || '🎫 التذكرة المرفقة') + '</td>' +
               '</tr>' +
             '</table>' +
             '<img src="data:' + ticketImgMime + ';base64,' + ticketImgBase64 + '" style="width:100%;max-height:265mm;object-fit:contain;border:1px solid #ccc;border-radius:12px;display:block;">' +
           '</div>';
  } catch (e) {
    Logger.log('تعذر إرفاق التذكرة بملف المشاركة: ' + e);
    return '';
  }
}

/**
 * ينشئ ملف PDF مؤقت للمشاركة (واتساب/بريد/أي وسيلة) من نفس قالب الطباعة (buildBookingNoticeHtml_) + التذكرة المرفقة.
 * 📞 يُستدعى من: secureShareBookingFile() في index_web.html (زر مشاركة الواتساب في جدول الحجوزات)
 * ⚠️ شرط: لا يعمل إلا للإشعارات المعتمدة (status === 'معتمد')
 * 🗑️ الملف الناتج مؤقت في مجلد TEMP ويُحذف تلقائياً بعد المشاركة/التنزيل/إغلاق النافذة
 *    (عبر deleteSharedBookingFile) أو بعد ساعة كحد أقصى (تنظيف احترازي)
 */
function generateBookingPdfForShare(authToken, bookingId) {
  requireAuth_(authToken);

  var data = getPrintDataForView(bookingId);
  if (!data || data.error || !data.id) {
    throw new Error(data && data.error ? data.error : 'تعذر العثور على بيانات الإشعار');
  }

  // شرط: لا مشاركة إلا للإشعارات المعتمدة
  if (data.status !== 'معتمد') {
    throw new Error('لا يمكن مشاركة إشعار غير معتمد. يرجى اعتماد الإشعار أولاً.');
  }

  var folder = _ensureTempShareFolder_();

  // تنظيف احترازي لأي ملفات يتيمة أقدم من ساعة
  try {
    var oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    var oldFiles = folder.getFiles();
    while (oldFiles.hasNext()) {
      var f = oldFiles.next();
      if (f.getDateCreated() < oneHourAgo) f.setTrashed(true);
    }
  } catch (e) { /* تجاهل */ }

  // buildBookingNoticeHtml_ يرجع مستند HTML كامل (نفس تصميم الطباعة القديم بالظبط)
  var fullHtml = buildBookingNoticeHtml_(data);

  // إرفاق التذكرة كصفحة تالية (إن وجدت) — بحقنها داخل الـ padding wrapper نفسه قبل </div></body>
  // بدل خارجه، حتى تحصل على نفس الهامش الجانبي والداخلي
  var ticketSection = buildTicketPdfSection_(data.ticketUrl);
  if (ticketSection) {
    fullHtml = fullHtml.replace('</div></body>', ticketSection + '</div></body>');
  }

  // 🏠 (V4.10) مستند بيانات المستضيف (سكن استضافة عبر البوت): يُرفق كصفحة بعد التذكرة تمامًا
  var hostMatch = String(data.notes || '').match(/مستند المستضيف:\s*(https?:\/\/\S+)/);
  if (hostMatch) {
    var hostSection = buildTicketPdfSection_(hostMatch[1], '🏠 مستند بيانات المستضيف');
    if (hostSection) fullHtml = fullHtml.replace('</div></body>', hostSection + '</div></body>');
  }

  var safeDate = (data.arrivalDate || '').toString().replace(/\//g, '-');
  var fileName = (data.company || 'شركة').toString().replace(/[\\/:*?"<>|]/g, '-').trim() +
    ' - اشعار وصول رقم ' + data.id + ' - ' + safeDate;

  var htmlBlob = Utilities.newBlob(fullHtml, 'text/html', fileName + '.html');
  var pdfBlob = htmlBlob.getAs('application/pdf');
  pdfBlob.setName(fileName + '.pdf');

  var file = folder.createFile(pdfBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    fileId: file.getId(),
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
    pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()),
    fileName: fileName
  };
}

// 📸 (V4.104) نفس مستند الإشعار الكامل المستخدَم للطباعة/PDF (buildBookingNoticeHtml_) لكن كنص HTML
// خام بلا أي تحويل PDF أو رفع لـDrive — يُستخدَم لتصدير الإشعار كصورة HD في الواجهة (iframe محلي)
function getBookingNoticeHtmlForImage(authToken, bookingId) {
  requireAuth_(authToken);
  var data = getPrintDataForView(bookingId);
  if (!data || data.error || !data.id) {
    throw new Error(data && data.error ? data.error : 'تعذر العثور على بيانات الإشعار');
  }
  if (data.status !== 'معتمد') {
    throw new Error('لا يمكن تصدير صورة لإشعار غير معتمد. يرجى اعتماد الإشعار أولاً.');
  }
  var fullHtml = buildBookingNoticeHtml_(data);
  var safeDate = (data.arrivalDate || '').toString().replace(/\//g, '-');
  var fileName = (data.company || 'شركة').toString().replace(/[\\/:*?"<>|]/g, '-').trim() +
    ' - اشعار وصول رقم ' + data.id + ' - ' + safeDate;
  return { success: true, html: fullHtml, fileName: fileName };
}

// حذف الملف المؤقت من Drive بعد انتهاء المشاركة أو التنزيل
function deleteSharedBookingFile(authToken, fileId) {
  if (!fileId) return { success: false };
  try {
    requireAuth_(authToken);
    DriveApp.getFileById(fileId).setTrashed(true);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}



/* ============================================================
   ⚙️ شاشة الإعدادات — الشركات والوكلاء
   تدير بيانات ورقة Agents_Settings (العمود A: الوكيل، B: الشركة، C: رابط اللوجو)
   بدون الحاجة لفتح الشيت يدوياً
   ============================================================ */

// يرجع كل صفوف Agents_Settings مع رقم الصف الفعلي في الشيت (يُستخدم عند التعديل/الحذف)
function getCompaniesSettings(authToken) {
  requireSettingsBasicPermission_(authToken);

  var cached = getCachedData('agents_cache');
  if (cached) return cached;

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Agents_Settings");
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 🏛️ (V4.106) العمود D = رقم الترخيص — يُستخدم في مطابقة إيصال البنك بالشركة تلقائياً
  if (sheet.getLastColumn() < 4) sheet.getRange(1, 4).setValue('رقم الترخيص');
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    if (!data[i][0] && !data[i][1]) continue;
    result.push({
      row: i + 2,
      agent: data[i][0] || "",
      company: data[i][1] || "",
      logoUrl: data[i][2] || "",
      licence: String(data[i][3] || "").trim()
    });
  }
  setCachedData('agents_cache', result);
  return result;
}

// يضيف أو يعدّل شركة (لو targetRow فارغ = إضافة جديدة، لو موجود = تعديل الصف)
function saveCompanySetting(authToken, targetRow, agent, company, logoUrl, licence) {
  var session = requireSettingsBasicPermission_(authToken);

  if (!company) throw new Error("اسم الشركة مطلوب");

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Agents_Settings");
  if (!sheet) throw new Error("ورقة Agents_Settings غير موجودة");

  // 🏛️ (V4.106) العمود D = رقم الترخيص
  if (sheet.getLastColumn() < 4) sheet.getRange(1, 4).setValue('رقم الترخيص');
  var lic = String(licence == null ? "" : licence).trim();
  var oldValues = null;
  if (targetRow) {
    oldValues = sheet.getRange(targetRow, 1, 1, 4).getValues()[0];
    if (licence === undefined) lic = String(oldValues[3] || "").trim(); // نداء قديم بلا ترخيص: لا تمسحه
    sheet.getRange(targetRow, 1, 1, 4).setValues([[agent || "", company, logoUrl || "", lic]]);
    logChange_(session.username, "تعديل شركة", company, "بيانات الشركة",
      JSON.stringify({ agent: oldValues[0], logoUrl: oldValues[2], licence: oldValues[3] }),
      JSON.stringify({ agent: agent, logoUrl: logoUrl, licence: lic }));
  } else {
    sheet.appendRow([agent || "", company, logoUrl || "", lic]);
    logChange_(session.username, "إضافة شركة جديدة", company, "-", "-", company + " / " + (agent || ""));
  }

  clearAllCache();
  return { success: true };
}

// يحذف شركة من ورقة الإعدادات
function deleteCompanySetting(authToken, targetRow, companyName) {
  var session = requireSettingsBasicPermission_(authToken);
  if (!targetRow) throw new Error("بيانات غير مكتملة");

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Agents_Settings");
  sheet.deleteRow(targetRow);

  logChange_(session.username, "حذف شركة", companyName || "-", "-", companyName || "-", "-");
  clearAllCache();
  return { success: true };
}

// رفع شعار شركة جديد إلى Drive وإرجاع رابط قابل للتخزين في العمود C من Agents_Settings
function uploadCompanyLogo(authToken, base64Data, fileName) {
  requireSettingsBasicPermission_(authToken);

  try {
    var folder = getDriveFolder_('LOGOS');

    var contentType = base64Data.substring(base64Data.indexOf(":") + 1, base64Data.indexOf(";"));
    var rawBase64 = base64Data.substring(base64Data.indexOf(",") + 1);
    var blob = Utilities.newBlob(Utilities.base64Decode(rawBase64), contentType, fileName);

    var file = folder.createFile(blob);
    file.setName('LOGO_' + new Date().getTime() + '_' + fileName);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { success: true, fileUrl: file.getUrl(), fileId: file.getId() };
  } catch (e) {
    return { success: false, error: "فشل رفع الشعار: " + e.message };
  }
}


/* ============================================================
   ⚙️ شاشة الإعدادات — إعدادات النظام العامة (بدل التعديل المباشر في الكود)
   تُخزَّن في PropertiesService.getScriptProperties() بدل كتابتها صراحة في الكود
   ============================================================ */

// يرجع الإعدادات الحالية (المفاتيح الحساسة تُرجَع مقنّعة جزئياً فقط لعرضها بأمان)

/* ============================================================
   📊 حالة الخدمات — تُعرض في شاشة الإعدادات
   📞 يُستدعى من: refreshAllServiceBadges() في index_web.html
   يفحص حياً: Triggers البريد/تيليجرام، Webhook تيليجرام (عبر استعلام حي لـ getWebhookInfo)، مفتاح Gemini
   ============================================================ */
function getServicesStatus(authToken) {
  var session = requireSettingsBasicPermission_(authToken);
  var props = PropertiesService.getScriptProperties();

  // حالة Triggers
  var emailTriggerActive = false;
  var telegramTriggerActive = false;
  var emailTriggerHour = null;
  var telegramTriggerHour = null;
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'sendArrivalAlerts') {
        emailTriggerActive = true;
      }
      if (t.getHandlerFunction() === 'sendTelegramArrivalAlerts') {
        telegramTriggerActive = true;
      }
    });
  } catch(e) {}

  // حالة Webhook تيليجرام
  var webhookActive = false;
  var webhookUrl = '';
  var webhookError = '';
  var telegramConfigured = !!(TELEGRAM_CONFIG.token && TELEGRAM_CONFIG.chatId);
  if (telegramConfigured) {
    try {
      var resp = UrlFetchApp.fetch(
        'https://api.telegram.org/bot' + TELEGRAM_CONFIG.token + '/getWebhookInfo',
        { muteHttpExceptions: true }
      );
      var info = JSON.parse(resp.getContentText());
      if (info.ok && info.result) {
        webhookActive = !!info.result.url;
        webhookUrl = info.result.url || '';
        webhookError = info.result.last_error_message || '';
      }
    } catch(e) { webhookError = e.message; }
  }

  // حالة Gemini
  var geminiConfigured = !!GEMINI_API_KEY;

  // بريد التنبيهات
  var emailConfigured = !!(props.getProperty('NOTIFICATION_EMAILS'));

  var _fullAdmin = _isFullAdminSession_(session);
  return {
    email: {
      configured: emailConfigured,
      emails: props.getProperty('NOTIFICATION_EMAILS') || '',
      triggerActive: emailTriggerActive,
      scheduledHour: props.getProperty('EMAIL_ALERT_HOUR') || '15'
    },
    telegram: {
      configured: telegramConfigured,
      triggerActive: telegramTriggerActive,
      scheduledHour: props.getProperty('TELEGRAM_ALERT_HOUR') || '16',
      webhook: {
        // Webhook والـ URL بيانات إدارية — تُخفى عن مستخدم «الإعدادات الأساسية»
        active: _fullAdmin ? webhookActive : false,
        url: _fullAdmin ? webhookUrl : '',
        lastError: _fullAdmin ? webhookError : ''
      }
    },
    gemini: {
      // مفاتيح Gemini (حتى المُقنَّعة) تُخفى عن مستخدم «الإعدادات الأساسية»
      configured: _fullAdmin ? geminiConfigured : false,
      key2Configured: _fullAdmin ? !!GEMINI_API_KEY_2 : false,
      masked1: _fullAdmin ? _maskKey_(GEMINI_API_KEY) : '',
      masked2: _fullAdmin ? _maskKey_(GEMINI_API_KEY_2) : ''
    }
  };
}

/* ============================================================
   ✅ الحقول الإلزامية القابلة للتخصيص من شاشة الإعدادات
   لا يُسمح بحفظ الإشعار إلا بعد تعبئة كل حقل مُفعَّل هنا
   ============================================================ */

// القائمة الكاملة للحقول القابلة للتخصيص (معرّف الحقل + تسمية عربية + تُستخدَم أيضاً في الواجهة)
var REQUIRED_FIELDS_CATALOG = [
  { id: 'company',         label: 'الشركة المصرية' },
  { id: 'agent',           label: 'الوكيل السعودي' },
  { id: 'groupNumbers',    label: 'أرقام المجموعات' },
  { id: 'client',          label: 'العميل / اسم المجموعة' },
  { id: 'count',           label: 'العدد الإجمالي' },
  { id: 'supervisor',      label: 'المشرف' },
  { id: 'arrivalDate',     label: 'تاريخ الوصول' },
  { id: 'arrivalTime',     label: 'وقت الوصول' },
  { id: 'arrivalFlight',   label: 'رحلة الوصول' },
  { id: 'arrivalPort',     label: 'منفذ الوصول' },
  { id: 'departureDate',   label: 'تاريخ المغادرة' },
  { id: 'departureTime',   label: 'وقت المغادرة' },
  { id: 'departureFlight', label: 'رحلة المغادرة' },
  { id: 'departurePort',   label: 'منفذ المغادرة' },
  { id: 'busCount',        label: 'عدد الباصات' },
  { id: 'busPrice',        label: 'سعر الباص' },
  { id: 'direction',       label: 'خط السير' },
  { id: 'madinahHotel',    label: 'فندق المدينة' },
  { id: 'makkahHotel',     label: 'فندق مكة' },
  { id: 'transportCompany',label: 'شركة النقل' },
  { id: 'operationNo',     label: 'رقم التشغيلة' }
];

// الحقول الافتراضية الإلزامية (نفس الحقول التي كانت required بشكل ثابت في النموذج سابقاً)
var DEFAULT_REQUIRED_FIELDS = ['company', 'agent', 'groupNumbers', 'client', 'count', 'supervisor'];

// يتحقق من أن كل الحقول الإلزامية المُفعَّلة (من الإعدادات) مملوءة - يُستدعى داخل saveBookingToServer
function validateRequiredFields_(bookingData) {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('REQUIRED_FIELDS');
  var requiredIds;
  try {
    requiredIds = saved ? JSON.parse(saved) : DEFAULT_REQUIRED_FIELDS.slice();
  } catch(e) {
    requiredIds = DEFAULT_REQUIRED_FIELDS.slice();
  }

  var catalogMap = {};
  REQUIRED_FIELDS_CATALOG.forEach(function(f) { catalogMap[f.id] = f.label; });

  // 🕋🕌 (V4.94) اتجاه «مكة فقط»/«المدينة فقط»: لا حركة داخلية بين المدينتين، فلا يُطلَب فندق
  // المدينة الأخرى إطلاقاً حتى لو كان مفعَّلاً كحقل إلزامي عام — بطلب صريح
  var dir = String(bookingData.direction || '').trim();
  var skipIds = {};
  if (dir === 'مكة فقط') skipIds.madinahHotel = true;
  else if (dir === 'المدينة فقط') skipIds.makkahHotel = true;

  var missing = [];
  requiredIds.forEach(function(id) {
    if (skipIds[id]) return;
    var val = bookingData[id];
    if (val === undefined || val === null || String(val).trim() === '') {
      missing.push(catalogMap[id] || id);
    }
  });

  if (missing.length > 0) {
    return "يجب تعبئة الحقول الإلزامية التالية قبل الحفظ: " + missing.join('، ');
  }
  return null;
}



// يُستدعى من أي مستخدم مسجّل دخول (لازم لعرض/تحقق النموذج)
function getRequiredFieldsConfig(authToken) {
  requireAuth_(authToken);
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('REQUIRED_FIELDS');
  var current;
  try {
    current = saved ? JSON.parse(saved) : DEFAULT_REQUIRED_FIELDS.slice();
  } catch(e) {
    current = DEFAULT_REQUIRED_FIELDS.slice();
  }
  return {
    catalog: REQUIRED_FIELDS_CATALOG,
    required: current
  };
}

// يُستدعى من الإعدادات فقط (admin)
function saveRequiredFieldsConfig(authToken, fieldIds) {
  var session = requireSettingsBasicPermission_(authToken);
  if (!Array.isArray(fieldIds)) fieldIds = [];

  // تصفية أي معرّف غير معروف (حماية من عبث بالطلب)
  var validIds = REQUIRED_FIELDS_CATALOG.map(function(f){ return f.id; });
  var cleaned = fieldIds.filter(function(id){ return validIds.indexOf(id) !== -1; });

  PropertiesService.getScriptProperties().setProperty('REQUIRED_FIELDS', JSON.stringify(cleaned));
  logChange_(session.username, "تعديل إعدادات النظام", "-", "الحقول الإلزامية", "-", cleaned.join('، ') || "لا يوجد");

  return { success: true, required: cleaned };
}


// 🔀 (V4.48) الوضع الافتراضي لترتيب سجل الإشعارات — 'arrival' (تاريخ الوصول) أو 'id' (رقم الإشعار)
function getBookingsSortDefault(authToken) {
  requireAuth_(authToken);
  var mode = PropertiesService.getScriptProperties().getProperty('BOOKINGS_SORT_DEFAULT');
  return { mode: (mode === 'id') ? 'id' : 'arrival' };
}
function saveBookingsSortDefault(authToken, mode) {
  var session = requireSettingsBasicPermission_(authToken);
  mode = (mode === 'id') ? 'id' : 'arrival';
  PropertiesService.getScriptProperties().setProperty('BOOKINGS_SORT_DEFAULT', mode);
  logChange_(session.username, "تعديل إعدادات النظام", "-", "الترتيب الافتراضي لسجل الإشعارات",
    "-", mode === 'id' ? 'رقم الإشعار' : 'تاريخ الوصول');
  return { success: true, mode: mode };
}

// يُرجع مدة الجلسة المُعدَّة (بالدقائق) — متاحة لأي مستخدم مسجّل دخول (لتشغيل مؤقّت الجلسة في الواجهة)
function getSessionDurationConfig(authToken) {
  requireAuth_(authToken);
  var minutes = parseInt(PropertiesService.getScriptProperties().getProperty('SESSION_DURATION_MINUTES') || '20');
  if (isNaN(minutes) || minutes < 3) minutes = 20;
  return { minutes: minutes };
}

// يحفظ مدة الجلسة الجديدة (بالدقائق) — صلاحية admin فقط، بحد أدنى 3 دقائق
function saveSessionDurationConfig(authToken, minutes) {
  var session = requireAdminPermission_(authToken);
  var mins = parseInt(minutes);
  if (isNaN(mins) || mins < 3) {
    return { success: false, error: "مدة الجلسة يجب ألا تقل عن 3 دقائق" };
  }
  PropertiesService.getScriptProperties().setProperty('SESSION_DURATION_MINUTES', String(mins));
  logChange_(session.username, "تعديل إعدادات النظام", "-", "مدة الجلسة", "-", mins + " دقيقة");
  return { success: true, minutes: mins };
}


// يحفظ إعدادات النظام الجديدة في Script Properties - القيم الفارغة يتم تجاهلها (لا تمسح القيمة الحالية)
function saveSystemSettings(authToken, settings) {
  var session = requireSettingsBasicPermission_(authToken);
  settings = settings || {};

  // مستخدم «الإعدادات الأساسية» (غير admin): يُسمح له بضبط البريد/معرّف تيليجرام/مواعيد التنبيه فقط،
  // وتُمنع منه المفاتيح الحساسة (Gemini API / توكن بوت تيليجرام) حتى لو أُرسلت في الطلب.
  if (!_isFullAdminSession_(session)) {
    delete settings.geminiApiKey;
    delete settings.geminiApiKey2;
    delete settings.telegramBotToken;
    delete settings.folders; // مجلدات Drive إدارية بحتة — لا يمسّها صاحب «الإعدادات الأساسية»
  }

  var props = PropertiesService.getScriptProperties();
  var changed = [];

  if (settings.geminiApiKey) {
    props.setProperty('GEMINI_API_KEY', settings.geminiApiKey.trim());
    changed.push('مفتاح Gemini API');
  }
  if (settings.geminiApiKey2 === '__CLEAR__') {
    props.deleteProperty('GEMINI_API_KEY_2');
    changed.push('حذف مفتاح Gemini الاحتياطي');
  } else if (settings.geminiApiKey2) {
    props.setProperty('GEMINI_API_KEY_2', settings.geminiApiKey2.trim());
    changed.push('مفتاح Gemini الاحتياطي');
  }
  if (settings.telegramBotToken) {
    props.setProperty('TELEGRAM_BOT_TOKEN', settings.telegramBotToken.trim());
    changed.push('توكن بوت تيليجرام');
  }
  if (settings.telegramChatId) {
    props.setProperty('TELEGRAM_CHAT_ID', settings.telegramChatId.trim());
    changed.push('معرّف مجموعة تيليجرام');
  }
  if (settings.notificationEmails) {
    props.setProperty('NOTIFICATION_EMAILS', settings.notificationEmails.trim());
    changed.push('بريد تنبيهات الوصول اليومية');
  }

  // ساعة تنبيه البريد — لو تغيّرت وكان الـ Trigger مُفعَّلاً نُعيد ضبطه تلقائياً
  if (settings.emailAlertHour !== undefined && settings.emailAlertHour !== null && settings.emailAlertHour !== '') {
    var emailHour = parseInt(settings.emailAlertHour);
    if (!isNaN(emailHour) && emailHour >= 0 && emailHour <= 23) {
      props.setProperty('EMAIL_ALERT_HOUR', String(emailHour));
      changed.push('موعد تنبيه البريد (' + emailHour + ':00)');
      // إعادة تطبيق الـ Trigger تلقائياً لو كان مُفعَّلاً
      try {
        var emailActive = ScriptApp.getProjectTriggers().some(function(t) {
          return t.getHandlerFunction() === 'sendArrivalAlerts';
        });
        if (emailActive) setupDailyAlertTrigger();
      } catch(e) {}
    }
  }

  // ساعة تنبيه تيليجرام
  if (settings.telegramAlertHour !== undefined && settings.telegramAlertHour !== null && settings.telegramAlertHour !== '') {
    var tgHour = parseInt(settings.telegramAlertHour);
    if (!isNaN(tgHour) && tgHour >= 0 && tgHour <= 23) {
      props.setProperty('TELEGRAM_ALERT_HOUR', String(tgHour));
      changed.push('موعد تنبيه تيليجرام (' + tgHour + ':00)');
      try {
        var tgActive = ScriptApp.getProjectTriggers().some(function(t) {
          return t.getHandlerFunction() === 'sendTelegramArrivalAlerts';
        });
        if (tgActive) setupTelegramDailyTrigger();
      } catch(e) {}
    }
  }

  // تحديث إعدادات المجلدات
  if (settings.folders && typeof settings.folders === 'object') {
    Object.keys(settings.folders).forEach(function(key) {
      var f = settings.folders[key];
      if (!f) return;
      try {
        var result = updateFolderSetting_(key, f.name || null, f.id || null);
        changed.push('مجلد ' + key + ' (' + (f.name || f.id) + ')');
      } catch(e) {
        Logger.log('Folder update error (' + key + '): ' + e.message);
      }
    });
  }

  if (changed.length > 0) {
    logChange_(session.username, "تعديل إعدادات النظام", "-", changed.join('، '), "-", "تم التحديث");
  }

  return { success: true, changed: changed };
}


/* ============================================================
   ⚙️ شاشة الإعدادات — تشغيل الدوال اليدوية من الواجهة مباشرة
   بدل فتح محرر Apps Script في كل مرة يُسلَّم فيها النظام لعميل جديد
   ============================================================ */

// يُرجع بيانات المجلدات لعرضها في شاشة الإعدادات (تُستدعى مستقلة)
function getFolderSettingsForAdmin(authToken) {
  requireAdminPermission_(authToken);
  return getFolderSettings_();
}

// تحديث مجلد واحد من شاشة الإعدادات
function updateFolderSettingFromUI(authToken, key, newName, newFolderId) {
  var session = requireAdminPermission_(authToken);
  var result = updateFolderSetting_(key, newName || null, newFolderId || null);
  logChange_(session.username, "تعديل مجلد Drive", key, "مجلد " + key,
    "-", newName || newFolderId || "-");
  // مسح الـ Cache عند تغيير المجلدات لأن بعض البيانات قد تتأثر
  clearAllCache();
  return result;
}

// فحص سريع (بدون أي تعديل) لمعرفة هل الأعمدة الإضافية (سعر الباص/قيمة التشغيلة/اسم الرحلة) مضافة بالفعل
// يُستخدم لتحديث شكل/نص الزر في شاشة الإعدادات ليعكس الحالة الفعلية
function checkBusPriceColumnsExist(authToken) {
  requireAuth_(authToken);
  var sheet = getSpreadsheet_().getSheetByName("Bookings");
  if (!sheet) return { exists: false };

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var exists = headers.indexOf("سعر الباص") !== -1 &&
               headers.indexOf("قيمة التشغيلة") !== -1 &&
               headers.indexOf("اسم الرحلة") !== -1;
  return { exists: exists };
}

// يضيف أعمدة "سعر الباص" و"قيمة التشغيلة" و"اسم الرحلة" في نهاية شيت Bookings لو مش موجودة بالفعل
// آمنة للتشغيل أكثر من مرة (idempotent) — بتتأكد الأول قبل ما تضيف أي حاجة
function addBusPriceColumns_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Bookings");
  if (!sheet) throw new Error("شيت Bookings غير موجود");

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  var hasPrice = headers.indexOf("سعر الباص") !== -1;
  var hasValue = headers.indexOf("قيمة التشغيلة") !== -1;
  var hasTrip = headers.indexOf("اسم الرحلة") !== -1;

  if (hasPrice && hasValue && hasTrip) {
    return { success: true, message: "الأعمدة موجودة بالفعل، لا حاجة لإضافة." };
  }

  var toAdd = [];
  if (!hasPrice) toAdd.push("سعر الباص");
  if (!hasValue) toAdd.push("قيمة التشغيلة");
  if (!hasTrip) toAdd.push("اسم الرحلة");

  var startCol = lastCol + 1;
  sheet.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
  sheet.getRange(1, startCol, 1, toAdd.length)
    .setBackground("#1e3d59")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  clearAllCache();
  return { success: true, message: "تمت إضافة الأعمدة: " + toAdd.join('، ') };
}

function runAdminSetupAction(authToken, actionName) {
  var session = requireAuth_(authToken);

  // basic:true = إجراء متاح أيضاً لصاحب صلاحية «الإعدادات الأساسية» (تفعيل/اختبار التنبيه اليومي فقط)
  var allowedActions = {
    'setupSmartSystem': { fn: setupSmartSystem, label: 'إنشاء/تحديث هيكل الشيت الأساسي' },
    'setupUsersSystem': { fn: setupUsersSystem, label: 'إنشاء نظام المستخدمين' },
    'setupDailyAlertTrigger': { fn: setupDailyAlertTrigger, label: 'تفعيل التنبيه اليومي بالبريد', basic: true },
    'setupTelegramDailyTrigger': { fn: setupTelegramDailyTrigger, label: 'تفعيل التنبيه اليومي في تيليجرام', basic: true },
    'testSendAlerts': { fn: testSendAlerts, label: 'اختبار إرسال تنبيه البريد الآن', basic: true },
    'testTelegramNow': { fn: testTelegramNow, label: 'اختبار إرسال تنبيه تيليجرام الآن', basic: true },
    'clearAllCacheManual': { fn: clearAllCacheManual, label: 'مسح الذاكرة المؤقتة (Cache)' },
    'verifyMyGeminiKey': { fn: verifyMyGeminiKey, label: 'التحقق من صلاحية مفتاح Gemini' },
    'setupTelegramWebhook': { fn: setupTelegramWebhook, label: 'تفعيل Webhook تيليجرام التفاعلي' },
    'removeTelegramWebhook': { fn: removeTelegramWebhook, label: 'إلغاء Webhook تيليجرام' },
    'getTelegramWebhookInfo': { fn: getTelegramWebhookInfo, label: 'التحقق من حالة Webhook تيليجرام' },
    'addBusPriceColumns': { fn: addBusPriceColumns_, label: 'إضافة عمودي سعر الباص وقيمة التشغيلة' },
    'setupTripsSystem': { fn: setupTripsSystem_, label: 'إنشاء شيتات نظام الرحلات وكشوف المعتمرين' },
    'setupCompleteSystem': { fn: setupCompleteSystem_, label: 'التأسيس الكامل (كل الهياكل دفعة واحدة — آمن ولا يمسح بيانات)' },
    'cleanupTempFiles': { fn: cleanupTempFiles_, label: 'تنظيف الملفات المؤقتة (Temp + Exports)' },
    'setupTempCleanupTrigger': { fn: setupTempCleanupTrigger_, label: 'تفعيل التنظيف التلقائي اليومي للملفات المؤقتة' }
  };

  var action = allowedActions[actionName];
  if (!action) throw new Error("إجراء غير معروف: " + actionName);

  // التحقق من الصلاحية حسب نوع الإجراء: الأساسية لصاحب «الإعدادات الأساسية»، والبقية للأدمن فقط
  if (action.basic) {
    if (!_sessionHasPerm_(session, 'settings_basic')) {
      throw new Error("هذا الإجراء متاح فقط لمستخدم بصلاحية «الإعدادات الأساسية» أو ALL");
    }
  } else if (!_isFullAdminSession_(session)) {
    throw new Error("هذه الشاشة متاحة فقط لمستخدم بصلاحية ALL أو admin");
  }

  try {
    var result = action.fn();
    logChange_(session.username, "تشغيل دالة إدارية", "-", action.label, "-", "تم التنفيذ");
    return { success: true, message: action.label + ' — تم التنفيذ بنجاح', detail: (typeof result === 'string' ? result : '') };
  } catch (e) {
    // بعض الدوال القديمة تنتهي بعرض SpreadsheetApp.getUi().alert(...) وهو غير متاح من واجهة الويب،
    // لكن العملية الفعلية (إنشاء الشيت / تفعيل الـ Trigger) تكون قد اكتملت فعلاً قبل هذا السطر الأخير.
    if (String(e.message || e).indexOf('getUi') !== -1) {
      logChange_(session.username, "تشغيل دالة إدارية", "-", action.label, "-", "تم التنفيذ (بدون رسالة تأكيد)");
      return { success: true, message: action.label + ' — تم التنفيذ بنجاح' };
    }
    return { success: false, error: e.message };
  }
}


/* ============================================================
   🧱 التأسيس الكامل والصيانة — كلها Idempotent (آمنة التكرار بلا فقد بيانات)
   ============================================================ */

/**
 * التأسيس الكامل بخطوة واحدة: يشغّل كل دوال إنشاء/ترحيل الهياكل بالترتيب — كل الأوراق المطلوبة
 * (Bookings/Agents_Settings/Movements/AuditLog عبر setupSmartSystem، Trips/Pilgrims عبر setupTripsSystem_،
 * Users + حساب admin افتراضي عبر setupUsersSystem) على آخر وضع (رؤوس/أعمدة قانونية محدَّثة)، بخطوة واحدة.
 * كلها تستخدم createSheetIfNotExist/فحص وجود الشيت وفحص الرؤوس والترحيل الذاتي — لا تُنشئ شيتاً موجوداً
 * ولا تمسح أي صف بيانات، وحساب admin يُنشأ فقط إن لم يكن موجوداً أصلاً. إعادة تشغيلها في أي وقت آمنة تماماً.
 */
function setupCompleteSystem_() {
  var done = [];
  var step = function(label, fn) {
    try {
      var result = fn();
      var msg = (typeof result === 'string' && result.trim()) ? (' — ' + result.trim()) : '';
      done.push('✅ ' + label + msg);
    }
    catch (e) {
      if (String(e.message || e).indexOf('getUi') !== -1) done.push('✅ ' + label);
      else done.push('⚠️ ' + label + ': ' + (e.message || e));
    }
  };
  step('الهيكل الأساسي (Bookings/Agents_Settings/Movements/AuditLog)', setupSmartSystem);
  step('نظام الرحلات وكشوف المعتمرين (Trips/Pilgrims)', setupTripsSystem_);
  // شيت المستخدمين + حساب admin افتراضي (idempotent: لا يُنشئ شيئاً لو Users موجود بالفعل)
  step('نظام المستخدمين وحساب admin', function() { return setupUsersSystem(); });
  step('أعمدة سعر الباص وقيمة التشغيلة', addBusPriceColumns_);
  // ترحيل الرؤوس الذاتي يحدث تلقائياً عند أول قراءة — نُحفّزه هنا
  step('ترحيل رؤوس الرحلات/المعتمرين', function() { _getTripsSheet_(); _getPilgrimsSheet_(); });
  clearAllCache();
  return done.join('\n');
}

/**
 * تنظيف الملفات المؤقتة: يرسل إلى المهملات كل ملفات مجلد TEMP الأقدم من عتبة زمنية (افتراضي 6 ساعات).
 * التذاكر المعتمدة تُنقل خارج TEMP عند finalizeTicketFile فلا تتأثر. آمن للتشغيل المتكرر/المجدول.
 */
function cleanupTempFiles_(maxAgeHours) {
  // 🛡️ maxAgeHours قد تصل ككائن حدث Trigger (وليس رقماً) عند التشغيل التلقائي المُجدوَل — Number(كائن)
  // تُرجع NaN فتسقط بأمان على الافتراضي — التشغيل اليدوي بلا معامل يمسح كل شيء صراحةً (age=0)،
  // والتشغيل التلقائي بالحدث (كائن) يحتفظ بحد الأمان 6 ساعات كي لا يمسح ملفات ما زال المستخدم يعمل عليها
  var isTriggerEvent = maxAgeHours && typeof maxAgeHours === 'object';
  var hours = Number(maxAgeHours) >= 0 ? Number(maxAgeHours) : (isTriggerEvent ? 6 : 0);
  var cutoff = hours > 0 ? (new Date().getTime() - hours * 3600000) : Number.POSITIVE_INFINITY;
  var trashed = 0, kept = 0, scanned = [], perFolder = [];
  // ينظّف مجلد TEMP وEXPORTS من كل الملفات (الجذور المخزَّنة + أي مجلد بنفس الاسم بحثاً عن ملفات
  // مُبعثرة). كان التنفيذ يعتمد فقط على معرّف المجلد المخزَّن — لو تغيّر المعرف (حُذف يدوياً وأُنشئ
  // مجلد جديد بنفس الاسم مثلاً)، الدالة تنشئ مجلداً فارغاً جديداً وتفحصه وتُبلّغ عن "0 ملفات"،
  // بينما الملفات الحقيقية تعيش في المجلد القديم "الحقيقي" بلا تنظيف. الآن نبحث بالاسم أيضاً
  // كسقف أمان يضمن الوصول لكل الملفات ذات الصلة
  ['TEMP', 'EXPORTS'].forEach(function(key) {
    var foldersToScan = [];
    // 1) المجلد المسجَّل رسمياً بمعرّفه المخزَّن
    try { foldersToScan.push(getDriveFolder_(key)); } catch (e) { Logger.log('cleanupTempFiles_: getDriveFolder_(' + key + ') failed: ' + e); }
    // 2) كل مجلد آخر بنفس الاسم في Drive المستخدم (شبكة أمان — حالات تكرار الاسم بعد حذف يدوي)
    try {
      var expectedName = PropertiesService.getScriptProperties().getProperty('FOLDER_NAME_' + key) || FOLDER_DEFAULTS[key];
      var byName = DriveApp.getFoldersByName(expectedName);
      while (byName.hasNext()) {
        var f2 = byName.next();
        if (!foldersToScan.some(function(x) { return x.getId() === f2.getId(); })) foldersToScan.push(f2);
      }
    } catch (nErr) { Logger.log('cleanupTempFiles_: search-by-name failed for ' + key + ': ' + nErr); }
    if (!foldersToScan.length) return;
    scanned.push(key);
    var folderTrashed = 0, folderKept = 0, folderSeen = 0;
    foldersToScan.forEach(function(folder) {
      var files = folder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        folderSeen++;
        try {
          if (f.getLastUpdated().getTime() < cutoff || hours === 0) { f.setTrashed(true); folderTrashed++; }
          else folderKept++;
        } catch (fe) { Logger.log('cleanupTempFiles_: file trash failed: ' + fe); }
      }
    });
    trashed += folderTrashed; kept += folderKept;
    perFolder.push(FOLDER_DEFAULTS[key] + ' (' + foldersToScan.length + ' مجلد): فُحص ' + folderSeen + '، حُذف ' + folderTrashed + '، أُبقي ' + folderKept);
    Logger.log('cleanupTempFiles_ [' + key + ']: ' + perFolder[perFolder.length - 1]);
  });
  if (!scanned.length) return 'تعذّر الوصول لمجلدي Temp/Exports — تحقق من صلاحيات Drive';
  var ageMsg = hours === 0 ? 'كل الملفات (بلا شرط عمر)' : ('أقدم من ' + hours + ' ساعة');
  return 'تم نقل ' + trashed + ' ملف مؤقت للمهملات (' + ageMsg + ')، وأُبقي على ' + kept + '. التفاصيل: ' + perFolder.join(' | ');
}

/**
 * ⏰ تفعيل مؤقّت يومي يشغّل تنظيف الملفات المؤقتة تلقائياً (Idempotent — لا يكرّر المؤقّت).
 */
function setupTempCleanupTrigger_() {
  return setTempCleanupSchedule({ frequency: 'daily', hour: 3 });
}

var _WEEK_DAYS_ = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
var _WEEK_DAYS_AR_ = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * ضبط جدولة تنظيف الملفات المؤقتة (يومي أو أسبوعي بساعة/يوم محدد) وتخزين الإعداد.
 * يحذف أي مؤقّت سابق لنفس الدالة أولاً حتى لا تتكرر المؤقّتات.
 * @param {Object} cfg { frequency:'daily'|'weekly', hour:0-23, weekDay:0-6 }
 */
function setTempCleanupSchedule(cfg) {
  cfg = cfg || {};
  var freq = cfg.frequency === 'weekly' ? 'weekly' : 'daily';
  var hour = Math.max(0, Math.min(23, Number(cfg.hour) >= 0 ? Number(cfg.hour) : 3));
  var weekDay = Math.max(0, Math.min(6, Number(cfg.weekDay) || 0));

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'cleanupTempFiles_') ScriptApp.deleteTrigger(t);
  });

  var builder = ScriptApp.newTrigger('cleanupTempFiles_').timeBased();
  if (freq === 'weekly') builder.onWeekDay(ScriptApp.WeekDay[_WEEK_DAYS_[weekDay]]).atHour(hour).create();
  else builder.everyDays(1).atHour(hour).create();

  var props = PropertiesService.getScriptProperties();
  props.setProperty('TEMP_CLEANUP_SCHEDULE', JSON.stringify({ frequency: freq, hour: hour, weekDay: weekDay }));

  var when = freq === 'weekly' ? ('كل ' + _WEEK_DAYS_AR_[weekDay]) : 'يومياً';
  return 'تم تفعيل التنظيف التلقائي: ' + when + ' الساعة ' + ('0' + hour).slice(-2) + ':00';
}

/** يرجع حالة جدولة التنظيف الحالية (للعرض على الزر) */
function getTempCleanupStatus(authToken) {
  requireAuth_(authToken);
  var active = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'cleanupTempFiles_'; });
  var cfg = null;
  try { cfg = JSON.parse(PropertiesService.getScriptProperties().getProperty('TEMP_CLEANUP_SCHEDULE') || 'null'); } catch (e) {}
  var label = 'غير مُفعَّل';
  if (active && cfg) {
    label = (cfg.frequency === 'weekly' ? ('كل ' + _WEEK_DAYS_AR_[cfg.weekDay || 0]) : 'يومياً') + ' — ' + ('0' + (cfg.hour || 0)).slice(-2) + ':00';
  } else if (active) { label = 'مُفعَّل'; }
  return { active: active, config: cfg, label: label };
}

/** غلاف مُصادَق لضبط الجدولة من الواجهة */
function setTempCleanupScheduleAuth(authToken, cfg) {
  requireAdminPermission_(authToken);
  var msg = setTempCleanupSchedule(cfg);
  return { success: true, message: msg, status: getTempCleanupStatus(authToken) };
}

/** غلاف مُصادَق لإلغاء الجدولة */
function disableTempCleanupSchedule(authToken) {
  requireAdminPermission_(authToken);
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'cleanupTempFiles_') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty('TEMP_CLEANUP_SCHEDULE');
  return { success: true, message: 'تم إلغاء التنظيف التلقائي', status: { active: false, label: 'غير مُفعَّل' } };
}

/* ============================================================
   💾 النسخ الاحتياطي التلقائي اليومي — نسخة كاملة من الشيت إلى مجلد Backups
   في Drive، مع حذف النسخ الأقدم من 30 يوماً تلقائياً (تبقى دائماً أحدث 5 نسخ
   مهما كان عمرها كشبكة أمان أخيرة)
   ============================================================ */
var BACKUP_RETENTION_DAYS_ = 30;
var BACKUP_MIN_KEEP_ = 5;

function _doSystemBackup_() {
  var ss = getSpreadsheet_();
  var folder = getDriveFolder_('BACKUPS');
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Africa/Cairo', 'yyyy-MM-dd HH:mm');
  var name = '💾 نسخة احتياطية — ' + ss.getName() + ' — ' + stamp;
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);

  // 🧹 حذف النسخ الأقدم من فترة الاحتفاظ (مع إبقاء أحدث BACKUP_MIN_KEEP_ نسخ دائماً)
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) { files.push(it.next()); }
  files.sort(function(a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  var cutoff = Date.now() - BACKUP_RETENTION_DAYS_ * 86400000;
  var removed = 0;
  for (var i = BACKUP_MIN_KEEP_; i < files.length; i++) {
    if (files[i].getDateCreated().getTime() < cutoff) { files[i].setTrashed(true); removed++; }
  }
  PropertiesService.getScriptProperties().setProperty('LAST_BACKUP_AT', stamp);
  return { name: name, removed: removed, total: Math.min(files.length + 1, files.length + 1) - removed };
}

// 🕐 معالج المؤقّت اليومي — بلا شرطة سفلية ليقبله ScriptApp.newTrigger بالاسم
function dailyBackupTick() {
  try { _doSystemBackup_(); } catch (e) { Logger.log('dailyBackupTick failed: ' + e); }
}

/** نسخة فورية الآن (زر من شاشة الإعدادات) */
function runBackupNow(authToken) {
  requireAdminPermission_(authToken);
  var r = _doSystemBackup_();
  return { success: true, message: '✅ أُنشئت النسخة: ' + r.name + (r.removed ? ' — وحُذفت ' + r.removed + ' نسخة قديمة' : ''), status: getBackupStatus(authToken) };
}

/** تفعيل النسخ اليومي التلقائي عند ساعة محددة (افتراضياً 3 فجراً) */
function enableDailyBackup(authToken, hour) {
  requireAdminPermission_(authToken);
  var h = Math.max(0, Math.min(23, Number(hour) >= 0 ? Number(hour) : 3));
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyBackupTick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyBackupTick').timeBased().everyDays(1).atHour(h).create();
  PropertiesService.getScriptProperties().setProperty('DAILY_BACKUP_HOUR', String(h));
  return { success: true, message: '✅ تم تفعيل النسخ الاحتياطي اليومي — الساعة ' + ('0' + h).slice(-2) + ':00 تقريباً', status: getBackupStatus(authToken) };
}

/** إيقاف النسخ اليومي التلقائي */
function disableDailyBackup(authToken) {
  requireAdminPermission_(authToken);
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyBackupTick') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty('DAILY_BACKUP_HOUR');
  return { success: true, message: '🛑 أُوقف النسخ الاحتياطي التلقائي', status: { active: false, label: 'غير مُفعَّل', lastBackup: PropertiesService.getScriptProperties().getProperty('LAST_BACKUP_AT') || '' } };
}

/** حالة النسخ الاحتياطي: مُفعَّل؟ ساعة الجدولة؟ آخر نسخة؟ عدد النسخ؟ رابط المجلد */
function getBackupStatus(authToken) {
  requireAdminPermission_(authToken);
  var props = PropertiesService.getScriptProperties();
  var active = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'dailyBackupTick'; });
  var hour = props.getProperty('DAILY_BACKUP_HOUR');
  var label = active ? ('يومياً — ' + ('0' + (hour || 3)).slice(-2) + ':00') : 'غير مُفعَّل';
  var count = 0, folderUrl = '';
  try {
    var folder = getDriveFolder_('BACKUPS');
    folderUrl = folder.getUrl();
    var it = folder.getFiles();
    while (it.hasNext()) { it.next(); count++; }
  } catch (e) {}
  return { active: active, label: label, lastBackup: props.getProperty('LAST_BACKUP_AT') || '—', count: count, folderUrl: folderUrl };
}

/**
 * ⚠️⚠️ تصفير كل بيانات التشغيل قبل تسليم النظام لعميل جديد — يُشغَّل يدوياً من محرّر Apps Script فقط.
 * يمسح صفوف البيانات (مع الإبقاء على صف الرؤوس) من: الحجوزات، التحركات، الرحلات، المعتمرين، سجل التعديلات.
 * لا يمس: المستخدمين، الإعدادات، مفاتيح API. ويُفرِّغ مجلد TEMP.
 * حماية: يجب تمرير النص "امسح كل البيانات نهائيا" حرفياً كوسيط، وإلا يرفض.
 * @param {string} confirmText نص التأكيد الإلزامي
 */
/**
 * نسخة احتياطية كاملة للملف قبل العمليات الخطرة — تُنشئ نسخة من جدول البيانات في Drive وترجع رابطها.
 */
function _backupSpreadsheet_(reason) {
  try {
    var ss = getSpreadsheet_();
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Riyadh', 'yyyy-MM-dd_HH-mm');
    var copyName = ss.getName() + ' — نسخة احتياطية (' + (reason || 'قبل عملية خطرة') + ') ' + stamp;
    var file = DriveApp.getFileById(ss.getId()).makeCopy(copyName);
    Logger.log('نسخة احتياطية: ' + file.getUrl());
    return file.getUrl();
  } catch (e) {
    Logger.log('فشلت النسخة الاحتياطية: ' + e);
    return null;
  }
}

function DANGER_resetAllDataForNewClient(confirmText) {
  if (String(confirmText || "").trim() !== "امسح كل البيانات نهائيا") {
    throw new Error('للحماية: مرّر النص "امسح كل البيانات نهائيا" حرفياً كوسيط لتأكيد المسح.');
  }
  var backupUrl = _backupSpreadsheet_('قبل تصفير البيانات لعميل جديد');
  var ss = getSpreadsheet_();
  var targets = ["Bookings", "Movements", TRIPS_SHEET_NAME_, PILGRIMS_SHEET_NAME_, "AuditLog", "سجل التعديلات"];
  var cleared = [];
  targets.forEach(function(nm) {
    if (!nm) return;
    var sh = ss.getSheetByName(nm);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last > 1) { sh.deleteRows(2, last - 1); cleared.push(nm + " (" + (last - 1) + " صف)"); }
  });
  // تفريغ مجلد TEMP بالكامل
  var tempTrashed = 0;
  try {
    var folder = getDriveFolder_('TEMP');
    var files = folder.getFiles();
    while (files.hasNext()) { files.next().setTrashed(true); tempTrashed++; }
  } catch (e) {}
  clearAllCache();
  var msg = 'تم تصفير: ' + (cleared.length ? cleared.join("، ") : "لا صفوف") + ' — وحُذف ' + tempTrashed + ' ملف مؤقت.' +
    (backupUrl ? ('\n📦 نسخة احتياطية كاملة قبل المسح: ' + backupUrl) : '\n⚠️ تعذّر إنشاء نسخة احتياطية.');
  Logger.log(msg);
  return msg;
}

/* ============================================================
   🤖 إدارة Webhook تيليجرام — يُفعَّل من شاشة الإعدادات بخطوة واحدة
   
   كيف يعمل النظام:
   1. doPost(e) يستقبل كل رسائل تيليجرام تلقائياً بعد تفعيل الـ Webhook
   2. يدعم: /start و /menu → يُرسل قائمة الأزرار الأربعة
   3. الأزرار: تحركات اليوم، تحركات الغد، وصول اليوم، وصول الغد
   
   شرط التفعيل: يجب ضبط TELEGRAM_BOT_TOKEN في شاشة الإعدادات أولاً
   ============================================================ */

/**
 * تفعيل Webhook تيليجرام — يربط البوت بـ URL الـ Web App تلقائياً
 * يُستدعى من شاشة الإعدادات بضغطة واحدة
 */
function setupTelegramWebhook() {
  var token = TELEGRAM_CONFIG.token;
  if (!token) {
    return "❌ لم يتم ضبط توكن بوت تيليجرام في الإعدادات";
  }

  // URL الـ Web App الحالي (يُولَّد تلقائياً)
  var webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) {
    return "❌ تعذر الحصول على رابط الـ Web App. تأكد من نشر البرنامج كـ Web App أولاً.";
  }

  var webhookUrl = "https://api.telegram.org/bot" + token + "/setWebhook";
  var payload = {
    url: webAppUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true
  };

  try {
    var response = UrlFetchApp.fetch(webhookUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText());
    if (result.ok) {
      return "✅ تم تفعيل Webhook بنجاح!\nالرابط المرتبط: " + webAppUrl + "\n\nاكتب /start في بوت تيليجرام لاختباره.";
    } else {
      return "❌ فشل التفعيل: " + (result.description || JSON.stringify(result));
    }
  } catch (e) {
    return "❌ خطأ في الاتصال: " + e.message;
  }
}

/**
 * إلغاء Webhook تيليجرام — يُستخدم عند نقل النظام لنسخة جديدة
 */
function removeTelegramWebhook() {
  var token = TELEGRAM_CONFIG.token;
  if (!token) return "❌ لم يتم ضبط توكن بوت تيليجرام";

  try {
    var response = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + token + "/deleteWebhook?drop_pending_updates=true",
      { method: "post", muteHttpExceptions: true }
    );
    var result = JSON.parse(response.getContentText());
    return result.ok
      ? "✅ تم إلغاء Webhook بنجاح. البوت لن يستقبل رسائل تفاعلية حتى تُفعّل Webhook مجدداً."
      : "❌ " + (result.description || "فشل الإلغاء");
  } catch (e) {
    return "❌ خطأ: " + e.message;
  }
}

/**
 * التحقق من حالة Webhook الحالية
 */
function getTelegramWebhookInfo() {
  var token = TELEGRAM_CONFIG.token;
  if (!token) return "❌ لم يتم ضبط توكن بوت تيليجرام";

  try {
    var response = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + token + "/getWebhookInfo",
      { muteHttpExceptions: true }
    );
    var info = JSON.parse(response.getContentText());
    if (!info.ok) return "❌ " + (info.description || "فشل الاستعلام");

    var r = info.result;
    if (!r.url) {
      return "ℹ️ لا يوجد Webhook مُفعَّل حالياً. البوت في وضع Polling.";
    }

    return "✅ Webhook مُفعَّل\n" +
      "الرابط: " + r.url + "\n" +
      "انتظار التحديثات: " + (r.pending_update_count || 0) + "\n" +
      (r.last_error_message ? "⚠️ آخر خطأ: " + r.last_error_message : "✅ بدون أخطاء");
  } catch (e) {
    return "❌ خطأ: " + e.message;
  }
}


/* ============================================================
   📜 سجل التعديلات (Audit Log)
   يسجّل كل تعديل يطرأ على بيانات الإشعارات وإعدادات النظام:
   من قام بالتعديل، متى، وما القيمة القديمة والجديدة لكل حقل
   ============================================================ */

function ensureAuditLogSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("AuditLog");
  if (!sheet) {
    sheet = ss.insertSheet("AuditLog");
    sheet.appendRow(["التاريخ والوقت", "المستخدم", "نوع العملية", "رقم الإشعار / المرجع", "الحقل", "القيمة القديمة", "القيمة الجديدة"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#1e3d59").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 1, 140);
    sheet.setColumnWidths(2, 1, 110);
    sheet.setColumnWidths(3, 1, 150);
    sheet.setColumnWidths(4, 1, 110);
    sheet.setColumnWidths(5, 1, 160);
    sheet.setColumnWidths(6, 2, 220);
  }
  return sheet;
}

// تسجيل تعديل واحد - لا يجب أن يوقف أي عملية حفظ حقيقية لو فشل هو نفسه، لذلك يُغلَّف دائماً بـ try/catch عند الاستدعاء
function logChange_(username, action, recordId, field, oldVal, newVal) {
  try {
    var sheet = ensureAuditLogSheet_();
    sheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Riyadh", "dd/MM/yyyy HH:mm:ss"),
      username || "غير معروف",
      action || "-",
      recordId || "-",
      field || "-",
      oldVal === undefined || oldVal === null ? "-" : String(oldVal),
      newVal === undefined || newVal === null ? "-" : String(newVal)
    ]);
  } catch (e) {
    Logger.log("logChange_ failed: " + e.message);
  }
}

// يكتب عدة سجلات تعديل دفعة واحدة بعملية sheet واحدة (setValues) بدل استدعاء appendRow لكل سجل على حدة
// هذا أسرع بكثير عند وجود أكثر من حقل تغيّر في نفس عملية الحفظ (كل appendRow منفصل له زمن استجابة حقيقي مع واجهة Sheets)
// entries: [{action, recordId, field, oldVal, newVal}, ...]
function logChangesBatch_(username, entries) {
  if (!entries || entries.length === 0) return;
  try {
    var sheet = ensureAuditLogSheet_();
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Riyadh", "dd/MM/yyyy HH:mm:ss");
    var rows = entries.map(function(e) {
      return [
        ts,
        username || "غير معروف",
        e.action || "-",
        e.recordId || "-",
        e.field || "-",
        e.oldVal === undefined || e.oldVal === null || e.oldVal === "" ? "-" : String(e.oldVal),
        e.newVal === undefined || e.newVal === null || e.newVal === "" ? "-" : String(e.newVal)
      ];
    });
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, 7).setValues(rows);
  } catch (e) {
    Logger.log("logChangesBatch_ failed: " + e.message);
  }
}

// أسماء الحقول بالعربي بنفس ترتيب أعمدة شيت Bookings (تبدأ من العمود الأول: الحالة)
var BOOKING_FIELD_LABELS_ = [
  "الحالة", "رقم الإشعار", "الوكيل", "الشركة", "أرقام المجموعات", "العميل", "عدد المعتمرين",
  "المشرف", "طريقة السفر", "منفذ الوصول", "تاريخ الوصول", "وقت الوصول", "رحلة الوصول",
  "تاريخ المغادرة", "رحلة المغادرة", "وقت المغادرة", "منفذ المغادرة", "شركة النقل الداخلي",
  "أمر التشغيل", "عدد الباصات", "خط السير", "ليالي المدينة", "ليالي مكة", "فندق المدينة",
  "تسكين المدينة", "مغادرة المدينة", "فندق مكة", "تسكين مكة", "مغادرة مكة",
  "التحركات الإضافية", "ملاحظات", "رابط التذكرة", "معرّف ملف التذكرة",
  "سعر الباص", "قيمة التشغيلة", "اسم الرحلة", "تاريخ التحرك الداخلي الأساسي", "توقيت التحرك الداخلي الأساسي"
];

// يحوّل قيمة عمود معيّن (قبل تسجيلها في سجل التعديلات) لصيغة مقروءة بدل تفريغ JSON خام
// يُطبَّق فقط على الأعمدة التي تحتوي بيانات مركّبة معروفة (حالياً: التحركات الإضافية)
function formatFieldValueForLog_(fieldIndex, rawValue) {
  var label = BOOKING_FIELD_LABELS_[fieldIndex] || "";

  // العمود 29: "التحركات الإضافية" — مصفوفة JSON بالشكل [{"date":"...","time":"...","type":"...","buses":"..."}]
  if (label === "التحركات الإضافية") {
    if (!rawValue || rawValue === "" || rawValue === "[]") return "لا يوجد";
    try {
      var moves = JSON.parse(rawValue);
      if (!Array.isArray(moves) || moves.length === 0) return "لا يوجد";
      return moves.map(function(m, idx) {
        var parts = [];
        if (m.date) parts.push(m.date);
        if (m.time) parts.push(m.time);
        var desc = (idx + 1) + ") " + (m.type || "تحرك") +
          (parts.length ? " — " + parts.join(" ") : "") +
          (m.buses ? " (" + m.buses + " باص)" : "");
        return desc;
      }).join(" | ");
    } catch(e) {
      return rawValue; // لو فشل التحليل، رجّع القيمة الخام كما هي كحل احتياطي
    }
  }

  return rawValue;
}

// يوحّد تمثيل القيمة (كائن Date أو نص) لصيغة نصية واحدة قابلة للمقارنة، لتفادي "تغييرات وهمية"
// تحدث لأن Google Sheets يحوّل النصوص الشبيهة بالتواريخ تلقائياً لكائن Date عند التخزين،
// بينما العميل دائماً يرسل نصاً عادياً — فبدون توحيد الصيغة، نفس التاريخ يبدو "مختلفاً" بالمقارنة الحرفية
// فهارس الأعمدة اللي قيمتها "وقت فقط" (بتُخزَّن في الشيت كـ Date كامل بتاريخ ثابت 30/12/1899 + وقت حقيقي)
var TIME_ONLY_FIELD_INDEXES_ = [11, 15, 37]; // وقت الوصول (11)، وقت المغادرة (15)، توقيت التحرك الداخلي الأساسي (37)

function normalizeValueForCompare_(val, fieldIndex) {
  if (val === undefined || val === null) return "";
  if (val instanceof Date) {
    var isTimeField = TIME_ONLY_FIELD_INDEXES_.indexOf(fieldIndex) !== -1;
    var hh = val.getHours();
    var mm = val.getMinutes();
    if (isTimeField) {
      // حقل وقت فقط: نتجاهل التاريخ الثابت (30/12/1899) تماماً ونقارن الوقت فقط، لأن العميل يرسل "HH:mm" بدون تاريخ
      return (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
    }
    var d = val.getDate();
    var m = val.getMonth() + 1;
    var y = val.getFullYear();
    return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
  }
  return String(val).trim();
}

// يوحّد نص تحركات إضافية (JSON) لصيغة مقارنة ثابتة بغض النظر عن ترتيب المفاتيح أو المسافات الزائدة،
// حتى لا يُعتبر نفس المحتوى "تغييراً" لمجرد اختلاف شكل النص الخام دون أي فرق حقيقي بالبيانات
function normalizeMovementsForCompare_(rawValue) {
  if (!rawValue || rawValue === "" || rawValue === "[]") return "[]";
  try {
    var moves = JSON.parse(rawValue);
    if (!Array.isArray(moves)) return String(rawValue).trim();
    // نبني تمثيلاً نصياً ثابت الترتيب من نفس الحقول دائماً (date, time, type, buses) بدل الاعتماد على ترتيب مفاتيح JSON الأصلي
    return JSON.stringify(moves.map(function(m) {
      return {
        date: (m.date || '').toString().trim(),
        time: (m.time || '').toString().trim(),
        type: (m.type || '').toString().trim(),
        buses: (m.buses || '').toString().trim()
      };
    }));
  } catch(e) {
    return String(rawValue).trim();
  }
}

// يقارن صف قديم بصف جديد من شيت Bookings ويسجّل كل حقل تغيّر فعلياً في سجل التعديلات (بعملية كتابة واحدة مجمّعة)
function logBookingRowDiff_(username, recordId, oldRow, newRow) {
  try {
    if (!oldRow || !newRow) {
      Logger.log('logBookingRowDiff_: oldRow or newRow missing for record ' + recordId);
      return;
    }
    var entries = [];
    var MOVEMENTS_FIELD_INDEX = 29; // "التحركات الإضافية"
    for (var i = 0; i < newRow.length; i++) {
      var oldVal, newVal;
      if (i === MOVEMENTS_FIELD_INDEX) {
        oldVal = normalizeMovementsForCompare_(oldRow[i] === undefined || oldRow[i] === null ? "" : String(oldRow[i]));
        newVal = normalizeMovementsForCompare_(newRow[i] === undefined || newRow[i] === null ? "" : String(newRow[i]));
      } else {
        oldVal = normalizeValueForCompare_(oldRow[i], i);
        newVal = normalizeValueForCompare_(newRow[i], i);
      }
      if (oldVal !== newVal) {
        entries.push({
          action: "تعديل إشعار",
          recordId: recordId,
          field: BOOKING_FIELD_LABELS_[i] || ("عمود " + (i + 1)),
          oldVal: formatFieldValueForLog_(i, oldVal),
          newVal: formatFieldValueForLog_(i, newVal)
        });
      }
    }
    logChangesBatch_(username, entries);
    Logger.log('logBookingRowDiff_: record ' + recordId + ' — ' + entries.length + ' field(s) changed');
  } catch (e) {
    Logger.log("logBookingRowDiff_ failed: " + e.message);
  }
}

// يسمح بالوصول لشاشة حسابات النقل السعودي لصاحب صلاحية admin/ALL أو صلاحية TRANSPORT_ACCOUNTS تحديداً
// تصدير إكسل لشاشة حسابات النقل السعودي — نفس أسلوب باقي دوال التصدير في المشروع
// (Spreadsheet مؤقت يُحوَّل لرابط xlsx ثم يُحذف)، مع دعم سطر إجماليات اختياري في النهاية
function exportTransportAccountsExcel(authToken, payload) {
  requireTransportAccountsPermission_(authToken);

  try {
    var rows = payload.rows || [];
    var columns = payload.columns || [];
    var title = payload.title || 'كشف حساب النقل السعودي';
    var subtitle = payload.subtitle || '';
    var totalsRow = payload.totalsRow || null; // مصفوفة بنفس طول columns، أو null

    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
    var safeTitle = title.replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
    var fileName = safeTitle + '_' + now;

    var ss = SpreadsheetApp.create(fileName);
    var sheet = ss.getSheets()[0];
    sheet.setName('حسابات النقل');

    var file = DriveApp.getFileById(ss.getId());
    var folder = getDriveFolder_('EXPORTS');
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    sheet.setRightToLeft(true);

    // صف العنوان
    sheet.getRange(1, 1, 1, columns.length).merge()
      .setValue(title)
      .setFontSize(16).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setRowHeight(1, 32);

    // صف الفلاتر المطبقة (لو موجودة)
    var headerStartRow = 2;
    if (subtitle) {
      sheet.getRange(2, 1, 1, columns.length).merge()
        .setValue(subtitle)
        .setFontSize(10).setFontColor('#555')
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
      headerStartRow = 3;
    }

    // رؤوس الأعمدة
    var headerRange = sheet.getRange(headerStartRow, 1, 1, columns.length);
    headerRange.setValues([columns])
      .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setWrap(true).setBackground('#065f46').setFontColor('#ffffff');

    // البيانات
    var dataStartRow = headerStartRow + 1;
    var values = rows.map(function(r) {
      return columns.map(function(c) { return r[c] !== undefined && r[c] !== null ? r[c] : ''; });
    });
    if (values.length) {
      sheet.getRange(dataStartRow, 1, values.length, columns.length).setValues(values)
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    }

    // صف الإجماليات (اختياري)
    if (totalsRow) {
      var totalsRowIdx = dataStartRow + values.length;
      sheet.getRange(totalsRowIdx, 1, 1, columns.length).setValues([totalsRow])
        .setFontWeight('bold').setBackground('#d1fae5')
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    }

    sheet.setFrozenRows(dataStartRow - 1);

    for (var i = 1; i <= columns.length; i++) {
      sheet.autoResizeColumn(i);
      var width = sheet.getColumnWidth(i);
      if (width > 280) sheet.setColumnWidth(i, 280);
      if (width < 90) sheet.setColumnWidth(i, 90);
    }

    SpreadsheetApp.flush();

    var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
    file.setTrashed(true);
    return url;

  } catch (err) {
    Logger.log('exportTransportAccountsExcel ERROR: ' + err);
    throw new Error('فشل التصدير: ' + err.message);
  }
}

function requireTransportAccountsPermission_(authToken) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, "transport.view")) {
    throw new Error("هذه الشاشة متاحة فقط لمستخدم بصلاحية حسابات النقل أو admin");
  }
  return session;
}

// 🧩 (V4.44) الجهة السعودية فقط من منفذ الوصول/المغادرة — بطلب صريح: لا تُذكر جهة مصر بالبيان.
// منفذ الوصول عادة "القاهرة → جدة" (السعودية آخر جزء)، ومنفذ المغادرة "جدة → القاهرة" (السعودية أول جزء)
function _taSaudiPort_(v, isArrival) {
  var s = String(v || "").replace(/مطار\s*/g, "").trim();
  var parts = s.split(/\s*(?:→|\/)\s*/).filter(Boolean);
  if (parts.length >= 2) return isArrival ? parts[parts.length - 1] : parts[0];
  return s;
}
// يرجع كل الحجوزات اللي فيها بيانات نقل داخلي فعلية (شركة نقل محددة)، مع حساب "المورد" الفعلي:
// - "الوكيل" → المورد هو الوكيل السعودي (حقل agent)
// - "النقل بمعرفة العميل" → لا يوجد مورد (isClientManaged = true)
// - أي اسم آخر (مورد آخر مكتوب يدويًا) → المورد هو الاسم نفسه
/* ✏️ (V4.134) تعديل صف بكشف حساب النقل السعودي: اسم المورد والبيان يُحفظان كتجاوز
   خاص بالشاشة فقط (لا يمسّ الإشعار)، أما سعر الباص وقيمة التشغيلة فيُكتبان في الإشعار
   نفسه — «دون التأثير على بيانات الإشعار إلا في السعر فقط». */
var TA_OVR_SHEET   = 'TransportAccounts_Overrides';
var TA_OVR_HEADERS = ['رقم الإشعار','المورد','البيان','ملاحظات','عُدّل بواسطة','عُدّل في'];

function _taOverrides_() {
  var out = {};
  try {
    var sh = _accSheet_(TA_OVR_SHEET, TA_OVR_HEADERS);
    var last = sh.getLastRow(); if (last < 2) return out;
    sh.getRange(2, 1, last - 1, TA_OVR_HEADERS.length).getValues().forEach(function (r, i) {
      var id = String(r[0] || '').trim(); if (!id) return;
      out[id] = { id: id, supplier: String(r[1] || '').trim(), desc: String(r[2] || '').trim(),
        notes: String(r[3] || '').trim(), _row: i + 2 };
    });
  } catch (e) {}
  return out;
}
function saveTransportRowEdit(authToken, data) {
  var session = requireTransportAccountsPermission_(authToken);
  data = data || {};
  var id = String(data.id || '').trim();
  if (!id) return { success: false, error: 'رقم الإشعار مطلوب' };
  var now = _mfStamp_();
  // 1) التجاوزات الخاصة بالشاشة: المورد + البيان
  var sh = _accSheet_(TA_OVR_SHEET, TA_OVR_HEADERS);
  var ovr = _taOverrides_();
  var row = [id, String(data.supplier || '').trim(), String(data.desc || '').trim(),
    String(data.notes || '').trim(), session.username || '', now];
  if (ovr[id]) sh.getRange(ovr[id]._row, 1, 1, TA_OVR_HEADERS.length).setValues([row]);
  else sh.appendRow(row);
  // 2) السعر وقيمة التشغيلة: يُكتبان في الإشعار نفسه
  var priceChanged = '';
  try {
    var bsh = getSpreadsheet_().getSheetByName('Bookings');
    if (bsh && bsh.getLastRow() > 1) {
      var map = _robustColMap_(bsh, BOOKINGS_HEADERS_);
      var iId = map[BOOKINGS_COL_.id], iPrice = map[BOOKINGS_COL_.busPrice], iVal = map[BOOKINGS_COL_.operationValue];
      if (iId !== undefined) {
        var ids = bsh.getRange(2, iId + 1, bsh.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          if (String(ids[i][0] || '').trim() !== id) continue;
          var r0 = i + 2;
          if (data.busPrice !== undefined && data.busPrice !== null && data.busPrice !== '' && iPrice !== undefined) {
            var oldP = bsh.getRange(r0, iPrice + 1).getValue();
            bsh.getRange(r0, iPrice + 1).setValue(_accNum_(data.busPrice));
            priceChanged = String(oldP) + ' ← ' + _accNum_(data.busPrice);
          }
          if (data.operationValue !== undefined && data.operationValue !== null && data.operationValue !== '' && iVal !== undefined) {
            bsh.getRange(r0, iVal + 1).setValue(_accNum_(data.operationValue));
          }
          break;
        }
      }
    }
  } catch (e2) {}
  SpreadsheetApp.flush();
  logChange_(session.username, 'تعديل صف كشف النقل السعودي', 'إشعار ' + id, 'مورد/بيان/سعر',
    priceChanged || '-', (data.supplier || '') + ' — ' + (data.desc || ''));
  return { success: true };
}
function deleteTransportRowEdit(authToken, id) {
  requireTransportAccountsPermission_(authToken);
  id = String(id || '').trim();
  var ovr = _taOverrides_();
  if (!ovr[id]) return { success: true };
  _accSheet_(TA_OVR_SHEET, TA_OVR_HEADERS).deleteRow(ovr[id]._row);
  return { success: true };
}

function getTransportAccountsData(authToken) {
  requireTransportAccountsPermission_(authToken);

  var sheet = getSpreadsheet_().getSheetByName("Bookings");
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var lastCol = sheet.getLastColumn();
  var allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = allData[0];

  var idx = {};
  headers.forEach(function(h, i) { idx[h] = i; });

  var result = [];
  var _ovr = _taOverrides_();   // ✏️ (V4.134) تجاوزات المورد/البيان المسجَّلة من الشاشة

  for (var r = 1; r < allData.length; r++) {
    var row = allData[r];
    var transportCompany = String(row[idx["شركة النقل الداخلي"]] || "").trim();

    // نتجاهل الحجوزات اللي مفيهاش بيانات نقل داخلي أصلاً
    if (!transportCompany) continue;

    var isClientManaged = transportCompany === "النقل بمعرفة العميل";
    var supplier = "";
    if (transportCompany === "الوكيل") {
      supplier = String(row[idx["الوكيل السعودي"]] || "");
    } else if (!isClientManaged) {
      supplier = transportCompany; // مورد آخر بالاسم المكتوب يدويًا
    }

    var busPrice = parseFloat(row[idx["سعر الباص"]]) || 0;
    var operationValue = parseFloat(row[idx["قيمة التشغيلة"]]) || 0;

    // 🧩 (V4.43) البيان: اسم المجموعة + «دورة نقل [مطار الوصول] - [مطار المغادرة]» + بيان كل مقطع إضافي
    // (إن وُجد) — وقيمة كل مقطع تُضاف لإجمالي قيمة التشغيلة — بطلب صريح
    var groupName = String(row[idx["اسم المجموعة"]] || "").trim();
    var arrPortShort = _taSaudiPort_(row[idx["منفذ الوصول"]], true);
    var depPortShort = _taSaudiPort_(row[idx["منفذ المغادرة"]], false);
    var desc = (groupName ? groupName + " + " : "") + "دورة نقل " + (arrPortShort || "؟") + " - " + (depPortShort || "؟");
    var segments = [];
    try {
      var segRaw = idx["مقاطع نقل إضافية"] !== undefined ? row[idx["مقاطع نقل إضافية"]] : "";
      segments = JSON.parse(segRaw || "[]") || [];
    } catch (eSeg) { segments = []; }
    segments.forEach(function(s) {
      var sd = String((s && s.desc) || "").trim();
      var sv = parseFloat(s && s.value) || 0;
      if (sd) desc += " + " + sd;
      operationValue += sv;
    });

    var _bid = String(row[idx["رقم الإشعار"]] || "");
    var _ov = _ovr[_bid];
    if (_ov) {
      if (_ov.supplier) supplier = _ov.supplier;
      if (_ov.desc) desc = _ov.desc;
    }
    result.push({
      edited: !!_ov,
      editNotes: _ov ? _ov.notes : "",
      id: _bid,
      operationNo: String(row[idx["رقم التشغيلة"]] || ""),
      client: String(row[idx["العميل"]] || ""),
      company: String(row[idx["الشركة المصرية"]] || ""),
      agent: String(row[idx["الوكيل السعودي"]] || ""),
      arrivalDate: row[idx["تاريخ الوصول"]] instanceof Date
        ? Utilities.formatDate(row[idx["تاريخ الوصول"]], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : String(row[idx["تاريخ الوصول"]] || ""),
      departureDate: row[idx["تاريخ المغادرة"]] instanceof Date
        ? Utilities.formatDate(row[idx["تاريخ المغادرة"]], Session.getScriptTimeZone(), "dd/MM/yyyy")
        : String(row[idx["تاريخ المغادرة"]] || ""),
      transportCompany: transportCompany,
      isClientManaged: isClientManaged,
      supplier: supplier,
      desc: desc, // 🧩 (V4.43) بيان كشف حساب النقل السعودي
      busCount: row[idx["عدد الباصات"]],
      busPrice: busPrice,
      operationValue: operationValue
    });
  }

  return result;
}


// يسمح بالوصول لسجل التعديلات لصاحب صلاحية admin/ALL أو صلاحية AUDIT_LOG تحديداً
function requireAuditLogPermission_(authToken) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, "audit.view")) {
    throw new Error("هذه الشاشة متاحة فقط لمستخدم بصلاحية سجل التعديلات أو admin");
  }
  return session;
}

// يرجع سجلات التعديلات (الأحدث أولاً) مع إمكانية الفلترة برقم إشعار / مستخدم / نطاق تاريخ
// 📜 سجل تغييرات رحلة واحدة — كل عمليات AuditLog التي مرجعها اسم الرحلة (متاح لمن يرى الرحلات)
function getTripChangeLog(authToken, tripName) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, "trips.view")) throw new Error("لا تملك صلاحية عرض الرحلات");
  tripName = String(tripName || "").trim();
  if (!tripName) return [];
  var sheet = ensureAuditLogSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var result = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    if (String(r[3] || "").trim() !== tripName) continue;
    var ts = r[0];
    var tsStr = (ts instanceof Date)
      ? Utilities.formatDate(ts, Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm:ss')
      : String(ts || '-');
    result.push({
      timestamp: tsStr,
      username: String(r[1] || '-'),
      action: String(r[2] || '-'),
      field: String(r[4] || '-'),
      oldValue: r[5] === '' || r[5] === null || r[5] === undefined ? '-' : String(r[5]),
      newValue: r[6] === '' || r[6] === null || r[6] === undefined ? '-' : String(r[6])
    });
  }
  return result;
}

// يستنتج "الشاشة" من نوع العملية/الحقل لدعم الفلاتر المتتالية (الشاشة → قائمة العمليات)
function _auditScreen_(action, field) {
  var a = String(action || '') + ' ' + String(field || '');
  if (/مستخدم|دخول|خروج|كلمة المرور|صلاحي/.test(a)) return 'users';
  if (/معتمر|كشف|تسكين|جواز|محرم/.test(a))         return 'pilgrims';
  // ⚠️ (V4.91) قبل فحص «رحلة» عمداً: أفعال حسابات العملاء كثيرًا ما تذكر اسم الرحلة كحقل (مثال:
  // «دمج رحلات دائم بكشف حساب») فتقع خطأً بتصنيف «الرحلات» لولا هذا الترتيب
  if (/حساب/.test(a)) return 'accounts';
  if (/رحلة|الرحلات/.test(a))                       return 'trips';
  if (/إشعار|الحجز|حجز/.test(a))                    return 'bookings';
  if (/اتفاقية إعاشة|اتفاقيات إعاشة/.test(a))        return 'catering';
  if (/شركة|إعداد|Drive|مجلد|دالة إدارية|النظام/.test(a)) return 'settings';
  return 'other';
}
var AUDIT_SCREEN_LABELS_ = {
  bookings: 'الإشعارات', trips: 'الرحلات', pilgrims: 'المعتمرون / الكشف', accounts: 'حسابات العملاء',
  users: 'إدارة المستخدمين', settings: 'الإعدادات', catering: 'اتفاقيات الإعاشة', other: 'أخرى'
};

function getAuditLog(authToken, filters) {
  requireAuditLogPermission_(authToken);
  filters = filters || {};

  var sheet = ensureAuditLogSheet_();
  var lastRow = sheet.getLastRow();
  Logger.log('getAuditLog: lastRow=' + lastRow + ', filters=' + JSON.stringify(filters));
  if (lastRow < 2) return [];

  var maxRows = 500;
  var startRow = Math.max(2, lastRow - maxRows + 1);
  var numRows = lastRow - startRow + 1;
  var data = sheet.getRange(startRow, 1, numRows, 7).getValues();
  Logger.log('getAuditLog: read ' + data.length + ' rows, startRow=' + startRow);

  // تجاهل الفلاتر الفارغة تماماً (لا تُطبَّق لو كانت '' أو undefined)
  var filterRecordId = (filters.recordId || '').trim();
  var filterUsername  = (filters.username  || '').trim();
  var filterAction    = (filters.action    || '').trim();
  var filterScreen    = (filters.screen    || '').trim();
  var filterEntity    = (filters.entity    || '').trim(); // معتمر/جواز/رحلة — يطابق المرجع أو الحقل أو القيم
  var filterFromDate  = (filters.fromDate  || '').trim(); // yyyy-mm-dd
  var filterToDate    = (filters.toDate    || '').trim();
  var showLoginLogout = !!filters.showLoginLogout;

  var LOGIN_LOGOUT_ACTIONS = ["تسجيل دخول", "تسجيل خروج"];

  var result = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    // تخطّى الصفوف الفارغة كلياً
    if (!row[0] && !row[1] && !row[2]) continue;

  // تنظيف قيم التواريخ الخام في القيم القديمة/الجديدة قبل الإرسال للمتصفح
  function cleanDateVal(val) {
    if (!val) return '-';
    var s = String(val);
    // نمط التاريخ الخام من getValues(): "Sun Jun 21 2026 00:00:00 GMT+0300 (...)"
    var rawDatePattern = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\s+(\d{2}:\d{2}):\d{2}\s+GMT[+-]\d{4}.*/i;
    var m = s.match(rawDatePattern);
    if (m) {
      var months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
      var day = m[3].padStart(2,'0');
      var mon = months[m[2]] || '??';
      var yr = m[4];
      var time = m[5];
      // لو الوقت "00:00" ما نُظهره
      return time === '00:00' ? day + '/' + mon + '/' + yr : day + '/' + mon + '/' + yr + ' ' + time;
    }
    return s;
  }

    var ts = row[0];
    var tsStr = '-';
    var tsDate = (ts instanceof Date) ? ts : null;
    if (ts) {
      try {
        if (ts instanceof Date) {
          tsStr = Utilities.formatDate(ts, Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm:ss');
        } else {
          // إذا كان نصاً (مكتوباً من logChange_)، نعيده كما هو
          tsStr = String(ts);
        }
      } catch(e) { tsStr = String(ts); }
    }
    var entry = {
      timestamp: tsStr,
      username:  row[1] ? String(row[1]) : '-',
      action:    row[2] ? String(row[2]) : '-',
      recordId:  row[3] ? String(row[3]) : '-',
      field:     row[4] ? String(row[4]) : '-',
      oldValue:  cleanDateVal(row[5]),
      newValue:  cleanDateVal(row[6])
    };
    entry.screen = _auditScreen_(entry.action, entry.field);
    entry.screenLabel = AUDIT_SCREEN_LABELS_[entry.screen] || 'أخرى';

    // إخفاء عمليات الدخول/الخروج افتراضياً إلا لو الفلتر مفعّل صراحة
    if (LOGIN_LOGOUT_ACTIONS.indexOf(entry.action) !== -1 && !showLoginLogout) continue;

    if (filterScreen    && entry.screen !== filterScreen) continue;
    if (filterRecordId && entry.recordId.indexOf(filterRecordId) === -1) continue;
    if (filterUsername  && entry.username.indexOf(filterUsername)  === -1) continue;
    if (filterAction    && entry.action.indexOf(filterAction)    === -1) continue;
    // 🔎 فلتر الكيان (معتمر/جواز/رحلة): يطابق المرجع أو الحقل أو القيمة القديمة/الجديدة
    if (filterEntity) {
      var _hay = entry.recordId + ' ' + entry.field + ' ' + entry.oldValue + ' ' + entry.newValue;
      if (_hay.indexOf(filterEntity) === -1) continue;
    }

    if ((filterFromDate || filterToDate) && tsDate) {
      if (filterFromDate && tsDate < new Date(filterFromDate)) continue;
      if (filterToDate && tsDate > new Date(filterToDate + 'T23:59:59')) continue;
    }

    result.push(entry);
  }
  Logger.log('getAuditLog: returning ' + result.length + ' entries');
  return result;
}


/* ============================================================================
   🧪 نظام الاختبارات الآلية (Unit Tests)
   ------------------------------------------------------------------------
   هدفه: التأكد من سلامة الدوال الحرجة تلقائياً بعد أي تعديل، بدل الاعتماد
   الكامل على اختبار يدوي بعد كل رفع. الاختبارات هنا تغطي بالتحديد الدوال
   اللي لقينا فيها bugs فعلية في جلسات سابقة (تطبيع التواريخ لسجل التعديلات،
   تحليل التذاكر، استخراج أكواد المطارات...) — عشان أي تعديل مستقبلي عليها
   يُكتشف كسره فوراً بدل ما يوصل للمستخدم.

   طريقة التشغيل:
     - من محرر Apps Script: شغّل الدالة runAllTests() مباشرة وراجع الـ Logger
     - من الواجهة: زر "🧪 تشغيل الاختبارات" في شاشة الإعدادات (يستدعي runAllTestsForUI)

   إضافة اختبار جديد: أضف كائن { name, fn } لمصفوفة TEST_SUITE، حيث fn ترجع
   true عند النجاح، أو ترمي Error (أو ترجع false) عند الفشل.
   ============================================================================ */

// ===== أدوات مساعدة للتأكيد (Assertions) =====
function assertEqual_(actual, expected, message) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((message || 'assertEqual failed') + ' — توقعت: ' + e + ' لكن حصلت على: ' + a);
  }
  return true;
}

function assertTrue_(condition, message) {
  if (!condition) throw new Error(message || 'assertTrue failed — القيمة كانت false');
  return true;
}

function assertFalse_(condition, message) {
  if (condition) throw new Error(message || 'assertFalse failed — القيمة كانت true');
  return true;
}

function assertContains_(haystack, needle, message) {
  if (String(haystack).indexOf(needle) === -1) {
    throw new Error((message || 'assertContains failed') + ' — لم يوجد "' + needle + '" داخل: ' + haystack);
  }
  return true;
}


// ===== مجموعة الاختبارات =====
var TEST_SUITE = [

  // ---------- normalizeValueForCompare_ (سجل التعديلات — إصلاح خطأ التواريخ الوهمية) ----------
  {
    name: 'normalizeValueForCompare_: تاريخ مخزَّن كـ Date مطابق لنفس التاريخ كنص',
    fn: function() {
      var dateObj = new Date(2026, 6, 29); // 29/07/2026
      var normalized1 = normalizeValueForCompare_(dateObj, 10); // عمود تاريخ عادي (مش وقت)
      var normalized2 = normalizeValueForCompare_('29/07/2026', 10);
      return assertEqual_(normalized1, normalized2, 'يجب أن يتطابق تاريخ Date مع نفس التاريخ كنص');
    }
  },
  {
    name: 'normalizeValueForCompare_: تاريخين مختلفين فعلياً لا يتطابقان',
    fn: function() {
      var d1 = normalizeValueForCompare_(new Date(2026, 6, 29), 10);
      var d2 = normalizeValueForCompare_('30/07/2026', 10);
      return assertTrue_(d1 !== d2, 'تاريخان مختلفان يجب ألا يتطابقا بعد التطبيع');
    }
  },
  {
    name: 'normalizeValueForCompare_: حقل وقت فقط (30/12/1899 + وقت) يطابق نص الوقت',
    fn: function() {
      // محاكاة الطريقة اللي بيخزن بيها Google Sheets خلايا "وقت فقط"
      var timeAsDate = new Date(1899, 11, 30, 17, 0); // 17:00
      var normalized1 = normalizeValueForCompare_(timeAsDate, 11); // عمود 11 = وقت الوصول
      var normalized2 = normalizeValueForCompare_('17:00', 11);
      return assertEqual_(normalized1, normalized2, 'حقل الوقت يجب أن يتجاهل التاريخ الثابت 30/12/1899 ويقارن الوقت فقط');
    }
  },
  {
    name: 'normalizeValueForCompare_: قيمة فارغة/null ترجع نص فارغ',
    fn: function() {
      return assertEqual_(normalizeValueForCompare_(null, 5), '', 'القيمة الفارغة يجب أن ترجع نص فارغ');
    }
  },

  // ---------- normalizeMovementsForCompare_ (منع اعتبار نفس التحركات "تغييراً" لمجرد اختلاف ترتيب JSON) ----------
  {
    name: 'normalizeMovementsForCompare_: نفس التحركات بترتيب مفاتيح مختلف تتطابق',
    fn: function() {
      var json1 = JSON.stringify([{ date: '17/07/2026', time: '', type: 'مزارات المدينة', buses: '1' }]);
      var json2 = JSON.stringify([{ buses: '1', time: '', date: '17/07/2026', type: 'مزارات المدينة' }]);
      return assertEqual_(normalizeMovementsForCompare_(json1), normalizeMovementsForCompare_(json2),
        'نفس محتوى التحركات بترتيب مفاتيح مختلف يجب أن يُعتبر متطابقاً');
    }
  },
  {
    name: 'normalizeMovementsForCompare_: تحركات مختلفة فعلياً لا تتطابق',
    fn: function() {
      var json1 = JSON.stringify([{ date: '17/07/2026', type: 'مزارات المدينة' }]);
      var json2 = JSON.stringify([{ date: '18/07/2026', type: 'مزارات المدينة' }]);
      return assertTrue_(normalizeMovementsForCompare_(json1) !== normalizeMovementsForCompare_(json2),
        'تحركات بتواريخ مختلفة فعلياً يجب ألا تتطابق');
    }
  },
  {
    name: 'normalizeMovementsForCompare_: قيمة فارغة أو [] تُعامَل كـ "لا يوجد تحركات"',
    fn: function() {
      return assertEqual_(normalizeMovementsForCompare_(''), normalizeMovementsForCompare_('[]'),
        'نص فارغ و [] يجب أن يُعاملا بنفس الطريقة');
    }
  },

  // ---------- extractAirportCode_ (تحديد أكواد المطارات من نص التذكرة) ----------
  {
    name: 'extractAirportCode_: يتعرف على "King Abdulaziz" كمطار جدة',
    fn: function() {
      var airports = { JED: 'مطار جدة', MED: 'مطار المدينة المنورة', CAI: 'مطار القاهرة' };
      return assertEqual_(extractAirportCode_('King Abdulaziz International Airport', airports), 'JED');
    }
  },
  {
    name: 'extractAirportCode_: يتعرف على "Mohammad Bin Abdulaziz" كمطار المدينة',
    fn: function() {
      var airports = { JED: 'مطار جدة', MED: 'مطار المدينة المنورة', CAI: 'مطار القاهرة' };
      return assertEqual_(extractAirportCode_('MADINAH MOHAMMAD BIN ABDULAZIZ', airports), 'MED');
    }
  },
  {
    name: 'extractAirportCode_: يتعرف على القاهرة',
    fn: function() {
      var airports = { CAI: 'مطار القاهرة' };
      return assertEqual_(extractAirportCode_('CAIRO CAIRO INTL', airports), 'CAI');
    }
  },
  {
    name: 'extractAirportCode_: كود ثلاثي بين أقواس يُقرأ مباشرة',
    fn: function() {
      var airports = { JED: 'مطار جدة' };
      return assertEqual_(extractAirportCode_('Jeddah (JED)', airports), 'JED');
    }
  },

  // ---------- parseTicketText_ (تحليل التذاكر — الأنماط المختلفة) ----------
  {
    name: 'parseTicketText_: نمط الجدول (Alexandria Airlines) يستخرج رحلتي الوصول والمغادرة بشكل صحيح',
    fn: function() {
      var text = 'Date Flight From Depart To Arrive Cabin 13 Feb 26 DQ0303 Cairo 02:01 King Abdulaziz International Airport 05:16 Y Fare Type: Fare Rules: 25 Mar 26 DQ0304 King Abdulaziz International Airport 23:45 Cairo 01:00 Y Fare Type: Fare Rules:';
      var result = parseTicketText_(text);
      assertEqual_(result.arrivalFlight, 'DQ 0303', 'رقم رحلة الوصول');
      assertEqual_(result.arrivalPort, 'مطار جدة', 'منفذ الوصول');
      assertEqual_(result.departureFlight, 'DQ 0304', 'رقم رحلة المغادرة');
      return true;
    }
  },
  {
    name: 'parseTicketText_: نمط الإيصال الإلكتروني (EgyptAir) يحدد الوصول/المغادرة حسب اتجاه الرحلة الفعلي',
    fn: function() {
      var text = 'CAIRO CAIRO INTL Terminal: S JEDDAH KING ABDULAZIZ INTL Terminal: 1 MS665 03:05 14Aug(Thu) 05:15 14Aug(Thu) Class: G MADINAH MOHAMMAD BIN ABDULAZIZ CAIRO CAIRO INTL Terminal: S MS678 20:30 21Aug(Thu) 22:25 21Aug(Thu) Class: G';
      var result = parseTicketText_(text);
      assertEqual_(result.arrivalFlight, 'MS 665', 'MS665 (القاهرة→جدة) يجب أن يكون رحلة الوصول');
      assertEqual_(result.departureFlight, 'MS 678', 'MS678 (المدينة→القاهرة) يجب أن يكون رحلة المغادرة');
      return true;
    }
  },
  {
    name: 'parseTicketText_: نمط From/Departure/To/Arrive (Almasria) يعمل مع DEPARTING/RETURNING منفصلين',
    fn: function() {
      var text = 'DEPARTING: Date Sat 21 Feb 26 All Times Local Flight-Number Cabin (Book Class) From: Cairo int. airport terminal 1 Departure 13:45 UJ 0909 (HK) Y (O) To: Jeddah Arrive 17:00 Info Flight 1: RETURNING: Date Mon 23 Mar 26 All Times Local Flight-Number Cabin (Book Class) From: Jeddah Departure 07:00 UJ 0906 (HK) Y (O) To: Cairo int. airport terminal 1 Arrive 08:15 Info Flight 2:';
      var result = parseTicketText_(text);
      assertEqual_(result.arrivalFlight, 'UJ 0909');
      assertEqual_(result.departureFlight, 'UJ 0906');
      return true;
    }
  },
  {
    name: 'parseTicketText_: سنة التاريخ لا تنحرف أبداً عن نطاق معقول (حماية ضد بق "سنة 2000")',
    fn: function() {
      var text = 'Date: 06Aug2025 ELECTRONIC TICKET RECEIPT CAIRO CAIRO INTL JEDDAH KING ABDULAZIZ INTL MS665 03:05 14Aug(Thu) 05:15 14Aug(Thu)';
      var result = parseTicketText_(text);
      if (!result.arrivalDate) return true; // لو مفيش تاريخ اتستخرج، مش الاختبار ده اللي بيفشل
      var year = parseInt(result.arrivalDate.split('/')[2]);
      var currentYear = new Date().getFullYear();
      return assertTrue_(year >= currentYear - 2 && year <= currentYear + 3,
        'السنة المستخرجة (' + year + ') يجب أن تكون ضمن نطاق معقول حول السنة الحالية');
    }
  },

  // ---------- validateRequiredFields_ (التحقق من الحقول الإلزامية قبل الحفظ) ----------
  {
    name: 'validateRequiredFields_: بيانات كاملة (بكل الحقول الافتراضية) تمر بدون خطأ',
    fn: function() {
      var completeBooking = {};
      DEFAULT_REQUIRED_FIELDS.forEach(function(id) { completeBooking[id] = 'قيمة تجريبية'; });
      var result = validateRequiredFields_(completeBooking);
      return assertEqual_(result, null, 'بيانات مكتملة يجب ألا ترجع أي رسالة خطأ');
    }
  },
  {
    name: 'validateRequiredFields_: بيانات فارغة تماماً ترجع رسالة خطأ تحتوي على الحقول الناقصة',
    fn: function() {
      var result = validateRequiredFields_({});
      assertTrue_(result !== null, 'بيانات فارغة يجب أن ترجع رسالة خطأ');
      return assertContains_(result, 'الحقول الإلزامية', 'رسالة الخطأ يجب أن تذكر الحقول الإلزامية');
    }
  },

  // ---------- convertDate (تحويل تاريخ GDS من صيغة "14AUG" إلى dd/mm/yyyy — يُستخدم في تحليل التذاكر) ----------
  {
    name: 'convertDate: يحوّل "14AUG" مع سنة صريحة في النص المحيط إلى dd/mm/yyyy الصحيح',
    fn: function() {
      var result = convertDate('14AUG', 'some text mentioning year 2026 here');
      return assertEqual_(result, '14/08/2026');
    }
  },
  {
    name: 'convertDate: نص بدون تاريخ صالح (فارغ) يرجع نص فارغ',
    fn: function() {
      return assertEqual_(convertDate(''), '');
    }
  },
  {
    name: 'convertDate: نص لا يحتوي رقم+شهر مختصر يُرجَع كما هو دون تعديل',
    fn: function() {
      return assertEqual_(convertDate('غير معروف'), 'غير معروف');
    }
  },

  // ---------- getCachedData/setCachedData (إصلاح الكاش المجزّأ) ----------
  {
    name: 'setCachedData/getCachedData: بيانات صغيرة (غير مجزّأة) ترجع كما هي',
    fn: function() {
      var testKey = '_test_cache_small_';
      var data = { hello: 'world', arr: [1,2,3] };
      setCachedData(testKey, data);
      var result = getCachedData(testKey);
      CacheService.getScriptCache().remove(testKey);
      return assertEqual_(result, data, 'بيانات صغيرة يجب أن ترجع مطابقة تماماً بعد التخزين');
    }
  },
  {
    name: 'setCachedData/getCachedData: بيانات كبيرة (>90KB، مجزّأة) ترجع كاملة وسليمة',
    fn: function() {
      var testKey = '_test_cache_large_';
      // نبني مصفوفة كبيرة تتخطى حد الـ 90000 حرف عشان تجبر الكود على مسار التجزئة
      var bigArray = [];
      for (var i = 0; i < 3000; i++) {
        bigArray.push({ id: i, name: 'عنصر رقم ' + i, note: 'نص تجريبي لاختبار التجزئة رقم ' + i });
      }
      setCachedData(testKey, bigArray);
      var result = getCachedData(testKey);
      var isChunked = CacheService.getScriptCache().get(testKey + '_chunked');
      // تنظيف مفاتيح الاختبار بعد التحقق
      CacheService.getScriptCache().removeAll([testKey, testKey + '_chunked', testKey + '_count']);
      for (var c = 0; c < _CACHE_MAX_CHUNKS_; c++) CacheService.getScriptCache().remove(testKey + '_' + c);

      assertEqual_(isChunked, 'true', 'بيانات أكبر من 90KB يجب أن تُخزَّن مجزّأة');
      assertTrue_(Array.isArray(result), 'النتيجة المُرجعة يجب أن تكون مصفوفة');
      assertEqual_(result.length, bigArray.length, 'عدد العناصر بعد التجميع يجب أن يطابق الأصل');
      return assertEqual_(result[2999].note, bigArray[2999].note, 'آخر عنصر في المصفوفة يجب أن يصل سليماً بعد تجميع الأجزاء');
    }
  },
  {
    name: 'setCachedData/getCachedData: الكتابة فوق بيانات مجزّأة ببيانات صغيرة لا تُبقي أجزاء يتيمة',
    fn: function() {
      var testKey = '_test_cache_switch_';
      var bigArray = [];
      for (var i = 0; i < 3000; i++) bigArray.push({ id: i, note: 'نص طويل نسبياً رقم ' + i + ' '.repeat(5) });
      setCachedData(testKey, bigArray); // أول مرة: مجزّأة

      var smallData = { small: true };
      setCachedData(testKey, smallData); // ثاني مرة: صغيرة (فوق نفس المفتاح)

      var chunkedFlagAfter = CacheService.getScriptCache().get(testKey + '_chunked');
      var result = getCachedData(testKey);

      CacheService.getScriptCache().remove(testKey);
      return assertTrue_(chunkedFlagAfter === null && result && result.small === true,
        'بعد الكتابة الصغيرة فوق كتابة مجزّأة قديمة، يجب ألا تبقى علامة chunked قديمة وتُقرأ القيمة الصغيرة الصحيحة');
    }
  },

  // ========================================================================
  // 🔒 خرائط أعمدة الأسماء (إعادة هيكلة القراءة/الكتابة) — تحرس ضد أي انزياح
  // ========================================================================
  {
    name: 'BOOKINGS_COL_ ↔ BOOKINGS_HEADERS_: كل مفتاح منطقي يشير لعنوان موجود، وكل العناوين فريدة (39)',
    fn: function() {
      var seen = {}, dup = false;
      BOOKINGS_HEADERS_.forEach(function(h) { if (seen[h]) dup = true; seen[h] = true; });
      assertFalse_(dup, 'عناوين الإشعارات يجب ألا تتكرر');
      // 39 (لا 38): عمود "اسم المجموعة" أُضيف لاحقاً (V4.16) — شاشة فقط، لا يظهر بالطباعة
      assertEqual_(BOOKINGS_HEADERS_.length, 39, 'عدد أعمدة الإشعارات القانوني');
      Object.keys(BOOKINGS_COL_).forEach(function(k) {
        assertTrue_(BOOKINGS_HEADERS_.indexOf(BOOKINGS_COL_[k]) !== -1,
          'المفتاح "' + k + '" يشير لعنوان غير موجود في BOOKINGS_HEADERS_: ' + BOOKINGS_COL_[k]);
      });
      return true;
    }
  },
  {
    name: 'TRIPS_COL_ ↔ TRIPS_HEADERS_ و PILGRIMS_COL_ ↔ PILGRIMS_HEADERS_: كل مفتاح يشير لعنوان موجود بلا تكرار',
    fn: function() {
      [[TRIPS_COL_, TRIPS_HEADERS_, 'الرحلات'], [PILGRIMS_COL_, PILGRIMS_HEADERS_, 'المعتمرين']].forEach(function(pair) {
        var col = pair[0], headers = pair[1], label = pair[2];
        var seen = {}, dup = false;
        headers.forEach(function(h) { if (seen[h]) dup = true; seen[h] = true; });
        assertFalse_(dup, 'عناوين ' + label + ' يجب ألا تتكرر');
        Object.keys(col).forEach(function(k) {
          assertTrue_(headers.indexOf(col[k]) !== -1, label + ': المفتاح "' + k + '" يشير لعنوان غير موجود: ' + col[k]);
        });
      });
      return true;
    }
  },
  {
    name: '_buildRowByName_: يضع القيم بمواضعها بالاسم ويحافظ على العرض والصف الأساسي',
    fn: function() {
      var colMap = { 'أ': 0, 'ب': 1, 'ج': 2 };
      var row = _buildRowByName_(colMap, 4, { 'ب': 'قيمة‑ب', 'أ': 'قيمة‑أ' });
      assertEqual_(row.length, 4, 'العرض يجب أن يساوي 4');
      assertEqual_(row[0], 'قيمة‑أ', 'العمود أ');
      assertEqual_(row[1], 'قيمة‑ب', 'العمود ب');
      assertEqual_(row[2], '', 'عمود بلا قيمة يبقى فارغاً');
      // مع صف أساسي: القيم غير المذكورة تُحفَظ
      var row2 = _buildRowByName_(colMap, 3, { 'ج': 'X' }, ['a', 'b', 'c']);
      assertEqual_(row2[0], 'a', 'قيمة الصف الأساسي تُحفَظ');
      assertEqual_(row2[2], 'X', 'القيمة الجديدة تُكتب فوق الأساسي');
      return true;
    }
  },
  {
    name: '_cellReader_: يقرأ بالاسم المنطقي ويرجع فراغاً للأعمدة غير الموجودة',
    fn: function() {
      var colMap = { 'اسم': 0, 'جواز': 2 };
      var dict = { name: 'اسم', passport: 'جواز', missing: 'غير موجود' };
      var R = _cellReader_(colMap, dict);
      var row = ['أحمد', 'x', 'A123'];
      assertEqual_(R(row, 'name'), 'أحمد', 'قراءة الاسم');
      assertEqual_(R(row, 'passport'), 'A123', 'قراءة الجواز بموضعه الصحيح');
      assertEqual_(R(row, 'missing'), '', 'عمود غير موجود يرجع فراغاً وليس undefined');
      return true;
    }
  },

  // ========================================================================
  // 🎯 تحليل MRZ بخانات التحقق (ICAO 9303) — المثال القانوني الرسمي
  // ========================================================================
  {
    name: '_mrzCheckDigit_: يحسب خانة التحقق الرسمية لرقم الجواز L898902C3 = 6',
    fn: function() {
      return assertEqual_(_mrzCheckDigit_('L898902C3'), 6, 'خانة تحقق رقم الجواز القانوني');
    }
  },
  {
    name: '_parseTd3Line2_: السطر القانوني ICAO يستخرج الجواز/الميلاد/الجنس/الانتهاء وكلها موثوقة',
    fn: function() {
      var td3 = _parseTd3Line2_('L898902C36UTO7408122F1204159ZE184226B<<<<<10');
      assertTrue_(!!td3, 'يجب أن يُحلَّل السطر');
      assertEqual_(td3.passport, 'L898902C3', 'رقم الجواز الخام');
      assertTrue_(td3.passValid, 'خانة تحقق الجواز يجب أن تنجح');
      assertTrue_(td3.birthValid, 'خانة تحقق الميلاد يجب أن تنجح');
      assertTrue_(td3.expValid, 'خانة تحقق الانتهاء يجب أن تنجح');
      assertEqual_(td3.sex, 'F', 'الجنس');
      assertEqual_(_mrzYymmddToDmy_(td3.expiry, true), '15/04/2012', 'تاريخ الانتهاء dd/mm/yyyy');
      assertEqual_(_mrzYymmddToDmy_(td3.birth, false), '12/08/1974', 'تاريخ الميلاد dd/mm/yyyy');
      return true;
    }
  },

  {
    name: '_mrzStructScan_: سطر مُزاح (حرف ساقط قبل الميلاد) يستخرج الميلاد/الجنس/الانتهاء صحيحة',
    fn: function() {
      // السطر القانوني ICAO بعد إسقاط حرف من منطقة الجنسية — القراءة الموضعية تنكسر، والبنيوية تنجح
      var shifted = 'L898902C36UT7408122F1204159ZE184226B<<<<<10';
      var ss = _mrzStructScan_(shifted);
      assertTrue_(!!ss, 'يجب أن يجد النمط رغم الإزاحة');
      assertTrue_(ss.birthValid, 'خانة تحقق الميلاد تنجح');
      assertTrue_(ss.expValid, 'خانة تحقق الانتهاء تنجح');
      assertEqual_(ss.sex, 'F', 'الجنس');
      assertEqual_(_mrzYymmddToDmy_(ss.expiry, true), '15/04/2012', 'الانتهاء');
      assertEqual_(_mrzYymmddToDmy_(ss.birth, false), '12/08/1974', 'الميلاد');
      return true;
    }
  },
  {
    name: '_findLabeledDate_: يلتقط التاريخ من السطر التالي لتسمية الانتهاء ويتجاهل شهراً غير منطقي',
    fn: function() {
      var lines = ['تاريخ الانتهاء / Date of Expiry', '11/06/2026', 'غيره'];
      assertEqual_(_findLabeledDate_(lines, /الانتهاء|Expiry/i), '11/06/2026', 'التاريخ من السطر التالي');
      var bad = ['Date of Expiry', '40/13/2026'];
      assertEqual_(_findLabeledDate_(bad, /Expiry/i), '', 'يوم/شهر غير منطقي يُرفَض');
      return true;
    }
  },
  {
    name: '_findLabeledDate_ preferFuture: مع تسميتَي الإصدار والانتهاء بجوار بعض، يختار الأبعد مستقبلاً للانتهاء',
    fn: function() {
      // الحالة الحقيقية: التسميتان في سطر واحد وتحتهما تاريخان — الإصدار أولاً ثم الانتهاء
      var lines = ['Date of Issue    Date of Expiry', '10/10/2024', '09/10/2031'];
      assertEqual_(_findLabeledDate_(lines, /Expiry/i, 'future'), '09/10/2031', 'الانتهاء = الأبعد مستقبلاً');
      assertEqual_(_findLabeledDate_(lines, /Issue/i, 'past'), '10/10/2024', 'الإصدار = الأقدم');
      return true;
    }
  },
  {
    name: 'سطرا MRZ ملتصقان بسطر واحد (نص OCR حقيقي): يفصلهما ويستخرج الميلاد والنوع والانتهاء',
    fn: function() {
      // النص الفعلي من ملف PASSPORT_OCR_TEMP لجواز فشل استخلاص ميلاده — السطران ملتصقان بمسافة
      var real = 'الاسم\nصباح محمود عطيه سالم\nP<EGYSALEM<<SABAH<MAHMOUD<ATTIA<<<<<<<<<<<<< A442391854EGY6601247F3301111<<<<<<<<<<<<<<06';
      var r = _parsePassportMrz_(real, '', '');
      assertTrue_(!!r.success, 'يجب أن ينجح التحليل');
      assertEqual_(r.birthDate, '24/01/1966', 'الميلاد بعد فصل السطرين');
      assertEqual_(r.expiryDate, '11/01/2033', 'الانتهاء بعد فصل السطرين');
      assertEqual_(r.type, 'أنثى', 'النوع بعد فصل السطرين');
      assertEqual_(r.passport, 'A44239185', 'رقم الجواز');
      return true;
    }
  },
  {
    name: 'مرساة EGY: سطر MRZ سفلي مكسور لسطرين يستخرج الميلاد/الجنس/الانتهاء من بعد حروف الجنسية',
    fn: function() {
      // جواز صباح محمود (المثال الحقيقي): "A442391854EGY" في سطر و"6601247F3301111..." في سطر آخر
      var brokenText = 'الاسم\nصباح محمود عطيه سالم\nP<EGYSALEM<<SABAH<MAHMOUD<ATTIA<<<<<<<<<<<<<\nA442391854EGY\n6601247F3301111<<<<<<<<<<<<06';
      var r = _parsePassportMrz_(brokenText, '', '');
      assertTrue_(!!r.success, 'يجب أن ينجح التحليل');
      assertEqual_(r.birthDate, '24/01/1966', 'الميلاد من مرساة EGY');
      assertEqual_(r.expiryDate, '11/01/2033', 'الانتهاء من مرساة EGY');
      assertEqual_(r.type, 'أنثى', 'النوع من مرساة EGY');
      return true;
    }
  },
  {
    name: 'جوازان بصورة واحدة: مقطع لكل جواز → الاسم العربي المطبوع الحقيقي لكل منهما (لا تعريب صوتي)',
    fn: function() {
      // نص حقيقي مختصر: سطرا MRZ ملتصقان + < مقروءة > في الجواز الأول
      var twoPassports = [
        'A42977773', 'فريجه سليمان صباح سليمان', 'Full Name', 'FREGA SOLIMAN SABBAH SOLIMAN',
        'P<EGYSOLIMAN><FREGA<SOLIMAN<SABBAH<<<<<<<<<< A429777738EGY7605079F3209240<<<<<<<<<<<<<<04',
        'A42587476', 'مرفت محمد ابراهيم سويلم', 'Full Name', 'MERFAT MOHAMED IBRAHIM SEWELAM',
        'P<EGYSEWELAM<<MERFAT<MOHAMED<IBRAHIM<<<<<<<< A425874765EGY7603293F3208195<<<<<<<<<<<<<<04'
      ].join('\n');
      var r = _parsePassportMulti_(twoPassports, '', '');
      assertTrue_(!!(r.persons && r.persons.length === 2), 'يجب استخلاص جوازين — وجد: ' + (r.persons ? r.persons.length : 'persons غائبة'));
      assertEqual_(r.persons[0].name, 'فريجه سليمان صباح سليمان', 'اسم الجواز الأول المطبوع');
      assertEqual_(r.persons[1].name, 'مرفت محمد ابراهيم سويلم', 'اسم الجواز الثاني المطبوع (لا ميرفات سيويلام)');
      assertEqual_(r.persons[0].birthDate, '07/05/1976', 'ميلاد الأول');
      assertEqual_(r.persons[1].expiryDate, '19/08/2032', 'انتهاء الثاني');
      return true;
    }
  },
  {
    name: 'سطرا MRZ بترتيب معكوس (البيانات قبل الاسم) + بقية الاسم على سطر التسمية: يستخرج كل شيء',
    fn: function() {
      // نمط جواز أمينة الحقيقي: سطر البيانات قبل سطر الاسم، والاسم مقسوم على سطر "الاسم ..."
      var reversed = [
        'الاسم امينه المتولى محمد', 'EGY', 'المتولى', 'Full Name', 'AMINA ELMETWALLY MOHAMED ELMETWALLY',
        'A439867166EGY6411286F3212275<<<<',
        'P<EGYELMETWALLY<<AMINA<ELMETWALLY <MOHAMED <<<'
      ].join('\n');
      var r = _parsePassportMrz_(reversed, '', '');
      assertTrue_(!!r.success, 'يجب أن ينجح التحليل');
      assertEqual_(r.name, 'امينه المتولى محمد المتولى', 'الاسم المطبوع الكامل (بادئة سطر التسمية + التكملة)');
      assertEqual_(r.birthDate, '28/11/1964', 'الميلاد رغم الترتيب المعكوس');
      assertEqual_(r.expiryDate, '27/12/2032', 'الانتهاء رغم الترتيب المعكوس');
      assertEqual_(r.type, 'أنثى', 'النوع');
      return true;
    }
  },
  {
    name: 'التعريب: فك الكلمات الملتصقة بـK (MOUSTAFAKALI) وإكمال المبتورة (AHM) واسم مسلم لا يُستبعد',
    fn: function() {
      assertEqual_(_latinToArabicName_('BOTHAINA MOUSTAFAKALI HASSAN AHM HAMAD'),
        'بثينه مصطفى على حسن احمد حماد', 'فك K + إكمال AHM + القاموس');
      var r = _parsePassportMrz_('A43276734\nفاطمه سالم مسلم عطيه\nFATMA SALEM MESALLAM ATTIA\nP<EGYATTIA<<FATMA<SALEM<MESALLAM<<<<<<<<<<<<\nA432767348EGY6305109F3210215<<<<<<', '', '');
      assertEqual_(r.name, 'فاطمه سالم مسلم عطيه', 'مسلم كاسم عائلة لا يُستبعد كديانة');
      var r2 = _parsePassportMrz_('A41772222\nسوسن سالم هو يشل محمد\nSAWSAN SALEM HOWISHEL MOHAMED\nP<EGYMOHAMED<<SAWSAN<SALEM<HOWISHEL<<<<<<<<<\nA417722227EGY7604119F3206249<<<<<<<<<<<<<<08', '', '');
      assertEqual_(r2.name, 'سوسن سالم هويشل محمد', 'دمج الشظية القصيرة هو+يشل');
      return true;
    }
  },
  {
    name: '_collectDatesIn_: يقرأ صيغة الوجه العربي المعكوسة yyyy/mm/dd صحيحة ولا يلتقط جزءاً من منتصفها',
    fn: function() {
      // "2023/09/13" (تطبيع ٢٠٢٣/٠٩/١٣) — القراءة الوحيدة الصحيحة 13/09/2023،
      // والالتقاط الجزئي القديم "23/09/13→2013" كان يفسد تاريخ الإصدار
      var ds = _collectDatesIn_('تاريخ الاصدار 2023/09/13');
      assertEqual_(ds.length, 1, 'تاريخ واحد فقط');
      assertEqual_(ds[0].s, '13/09/2023', 'الصيغة المعكوسة تُقرأ صحيحة');
      var ds2 = _collectDatesIn_('Date of Issue 13/09/2023');
      assertEqual_(ds2[0].s, '13/09/2023', 'الصيغة العادية dd/mm/yyyy');
      return true;
    }
  },
  {
    name: '_plausibleYymmdd_: يقبل تاريخاً منطقياً ويرفض شهر 13 أو نصاً غير رقمي',
    fn: function() {
      assertTrue_(_plausibleYymmdd_('260611'), 'تاريخ سليم');
      assertFalse_(_plausibleYymmdd_('261340'), 'شهر 13 مرفوض');
      assertFalse_(_plausibleYymmdd_('26A611'), 'حرف وسط الأرقام مرفوض');
      return true;
    }
  },

  // ========================================================================
  // 🔐 محرك الصلاحيات الذكي + صلاحية «الإعدادات الأساسية» المجمَّعة
  // ========================================================================
  {
    name: '_sessionHasPerm_: settings_basic يمنح إعدادات أساسية فقط ولا يمنح صلاحيات الشاشات',
    fn: function() {
      var s = { permissions: 'settings_basic' };
      assertTrue_(_sessionHasPerm_(s, 'settings_basic'), 'يجب أن يملك settings_basic');
      assertFalse_(_sessionHasPerm_(s, 'bookings.edit'), 'يجب ألا يملك تعديل الإشعارات');
      assertFalse_(_sessionHasPerm_(s, 'users.view'), 'يجب ألا يملك شاشة المستخدمين');
      return true;
    }
  },
  {
    name: '_sessionHasPerm_ / _isFullAdminSession_: admin يمنح كل شيء، وsettings_basic ليس أدمن كاملاً',
    fn: function() {
      var admin = { permissions: 'admin' };
      assertTrue_(_sessionHasPerm_(admin, 'settings_basic'), 'admin يمرّ لأي صلاحية');
      assertTrue_(_sessionHasPerm_(admin, 'bookings.delete'), 'admin يمرّ لأي صلاحية');
      assertTrue_(_isFullAdminSession_({ permissions: 'all' }), 'all = أدمن كامل');
      assertTrue_(_isFullAdminSession_(admin), 'admin = أدمن كامل');
      assertFalse_(_isFullAdminSession_({ permissions: 'settings_basic' }), 'settings_basic ليس أدمن كاملاً');
      return true;
    }
  }

];


/**
 * ينفّذ كل الاختبارات في TEST_SUITE ويطبع تقريراً مفصّلاً في Logger.
 * 📞 يُستدعى من: محرر Apps Script مباشرة (تشغيل يدوي)، أو runAllTestsForUI() من الواجهة
 * @return {Object} { total, passed, failed, results: [{name, passed, error}] }
 */
function runAllTests() {
  var results = [];
  var passed = 0, failed = 0;

  Logger.log('🧪 ===== بدء تشغيل ' + TEST_SUITE.length + ' اختبار =====');

  TEST_SUITE.forEach(function(test) {
    try {
      var ok = test.fn();
      if (ok === false) throw new Error('الدالة رجعت false');
      passed++;
      results.push({ name: test.name, passed: true, error: null });
      Logger.log('✅ ' + test.name);
    } catch (e) {
      failed++;
      results.push({ name: test.name, passed: false, error: e.message });
      Logger.log('❌ ' + test.name + ' — ' + e.message);
    }
  });

  var summary = '🧪 النتيجة النهائية: ' + passed + '/' + TEST_SUITE.length + ' اختبار ناجح' +
    (failed > 0 ? ' — ⚠️ ' + failed + ' اختبار فاشل يحتاج مراجعة فورية قبل النشر' : ' — كل شيء سليم ✅');
  Logger.log(summary);

  return {
    total: TEST_SUITE.length,
    passed: passed,
    failed: failed,
    summary: summary,
    results: results
  };
}

// نقطة دخول آمنة للواجهة — تتطلب صلاحية admin، وتُستخدم من زر "تشغيل الاختبارات" في شاشة الإعدادات
function runAllTestsForUI(authToken) {
  requireAdminPermission_(authToken);
  return runAllTests();
}


/* ============================================================
   🧳 نظام الرحلات (Trips) + كشوف المعتمرين (Pilgrims)
   ------------------------------------------------------------
   شيتان جديدان:
   - Trips: بيانات كل رحلة (الاسم، الشركة، الوكيل، المشرف، التواريخ، السكن...)
   - Pilgrims: كشف المعتمرين، كل صف مرتبط باسم رحلة (واختيارياً رقم إشعار)
   ============================================================ */

var TRIPS_SHEET_NAME_ = "Trips";
var PILGRIMS_SHEET_NAME_ = "Pilgrims";

var TRIPS_HEADERS_ = [
  "اسم الرحلة", "الشركة المصرية", "الوكيل السعودي", "المشرف",
  "تاريخ الذهاب", "تاريخ العودة", "الخطوط",
  "سكن المدينة", "تاريخ دخول المدينة", "تاريخ الخروج من المدينة", "ليالي المدينة",
  "سكن مكة", "تاريخ دخول مكة", "تاريخ الخروج من مكة", "ليالي مكة",
  "رقم الإشعار المرتبط", "تاريخ الإنشاء", "عدد الأماكن المحجوزة", "اتجاه الإقامة", "رابط تذكرة الرحلة", "معرف تذكرة الرحلة",
  "مسودة الإشعار (JSON)", "دور المشرف", "الرقم المرجعي",
  "فنادق إضافية - المدينة (JSON)", "فنادق إضافية - مكة (JSON)",
  "منفذ الوصول",        // فهرس 26
  "منفذ المغادرة",      // فهرس 27
  "ساعة الوصول",        // فهرس 28
  "ساعة المغادرة",      // فهرس 29
  "رقم رحلة الوصول",    // فهرس 30
  "رقم رحلة المغادرة",  // فهرس 31
  "المشرفون (JSON)",    // فهرس 32
  "رمز مشاركة العميل",  // فهرس 33 — رابط القراءة-فقط لعميل الرحلة
  // 📱 (V4.139) حقل نص حر لأرقام جوالات المشرف/المشرفين — مشرف واحد أو أكثر بأي فاصل يكتبه المستخدم
  "أرقام جوالات المشرف"  // فهرس 34
];

var PILGRIMS_HEADERS_ = [
  "مسلسل", "اسم المعتمر", "رقم الجواز", "النوع", "العميل",
  "طبيعة التسكين", "رقم الغرفة", "ملاحظات", "اسم الرحلة", "رقم الإشعار",
  // أعمدة الجواز التفصيلية (أُضيفت لاحقاً في النهاية حفاظاً على ثبات الفهارس القديمة)
  "الاسم بالإنجليزية", "تاريخ الميلاد", "تاريخ إصدار الجواز", "تاريخ انتهاء الجواز",
  "معرف المعتمر", "معرف المحرم", "علاقة المحرم", "فندق المدينة", "فندق مكة",
  "مجموعة الغرفة",  // ربط الغرف المغلقة — كان يعيش في ذاكرة الصفحة فقط ويضيع عند إعادة الفتح
  // 🚷 علامة استبعاد صريح من التسكين (يُخرجه المستخدم يدوياً من الغرف) — بدون هذا العمود، إعادة توليد
  // التسكين كانت تُعيد تسكينه تلقائياً من جديد لأن رقم غرفته وحده لا يميّز "لم يُسكَّن بعد" عن "أُخرِج عمداً"
  "مستبعد من التسكين",
  // 🏨 غرفتا المدينتين منفصلتان: عمود "رقم الغرفة" الظاهر واحد بينما التسكين مدينتان — تطبيق تسكين
  // مكة كان يستبدل أرقام غرف المدينة بالكامل (والعكس)، فيَظهر فندق المدينة الأخرى دائماً "0 غرفة"
  // بالإحصائيات وملخص التسكين. العمودان يحفظان تسكين كل مدينة على حدة بشكل دائم
  "رقم غرفة المدينة", "رقم غرفة مكة",
  // 🏙️ (V4.47) فصل استبعاد التسكين بين المدينتين — عمود "مستبعد من التسكين" القديم كان مشتركاً بين
  // مكة والمدينة، فإخراج معتمر من غرف مكة كان يجعله يظهر مستبعداً بغرف المدينة أيضاً والعكس.
  // العمودان الجديدان يحلّان محله بالمنطق الحيّ للتسكين (القديم يبقى للتوافق مع أدوات الترحيل القديمة فقط)
  "مستبعد من تسكين المدينة", "مستبعد من تسكين مكة"
];

/* ========== 🔒 القراءة/الكتابة بأسماء الأعمدة بدل الفهارس الرقمية ==========
   يجعل الكود مستقلاً عن ترتيب الأعمدة داخل الشيت: أي إعادة ترتيب للأعمدة لن تكسر النظام.
   _sheetColMap_: يبني {اسم العمود العربي → الفهرس 0-based} من صف العناوين الفعلي.
   _buildRowByName_: يبني صف كتابة بطول عرض الشيت من كائن {اسم العمود: قيمة} مع الحفاظ على القيم الموجودة. */
function _sheetColMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").trim();
    if (h && map[h] === undefined) map[h] = i;
  }
  return map;
}
// خريطة أعمدة متينة: تستخدم موضع العمود الفعلي بالاسم (يقاوم إعادة الترتيب)،
// ومع اختلاف نص العنوان (فراغ/محرف مختلف) ترجع للموضع القانوني من مصفوفة العناوين (يقاوم تعديل النص).
// النتيجة: كل اسم قانوني يتحوّل دائماً لفهرس صالح — لا قراءة فارغة صامتة ولا كتابة مُهمَلة.
function _robustColMap_(sheet, headerArray) {
  var actual = _sheetColMap_(sheet);
  var map = {};
  for (var i = 0; i < headerArray.length; i++) {
    var h = headerArray[i];
    map[h] = (actual[h] !== undefined) ? actual[h] : i;
  }
  // احتفظ بأي عناوين فعلية إضافية غير موجودة في المصفوفة القانونية (غير ضار)
  Object.keys(actual).forEach(function(h) { if (map[h] === undefined) map[h] = actual[h]; });
  return map;
}
function _buildRowByName_(colMap, width, valuesByName, baseRow) {
  var row = baseRow ? baseRow.slice() : [];
  for (var i = row.length; i < width; i++) row[i] = "";
  Object.keys(valuesByName).forEach(function(nm) {
    var idx = colMap[nm];
    if (idx !== undefined) row[idx] = valuesByName[nm];
  });
  return row;
}
// المصدر الوحيد لأسماء أعمدة الرحلات — يطابق TRIPS_HEADERS_ (يُتحقَّق منه في الاختبارات)
var TRIPS_COL_ = {
  name: 'اسم الرحلة', company: 'الشركة المصرية', agent: 'الوكيل السعودي', supervisor: 'المشرف',
  departDate: 'تاريخ الذهاب', returnDate: 'تاريخ العودة', airline: 'الخطوط',
  madinahHotel: 'سكن المدينة', madinahCheckIn: 'تاريخ دخول المدينة', madinahCheckOut: 'تاريخ الخروج من المدينة', madinahNights: 'ليالي المدينة',
  makkahHotel: 'سكن مكة', makkahCheckIn: 'تاريخ دخول مكة', makkahCheckOut: 'تاريخ الخروج من مكة', makkahNights: 'ليالي مكة',
  linkedBookingId: 'رقم الإشعار المرتبط', createdAt: 'تاريخ الإنشاء', bookedSeats: 'عدد الأماكن المحجوزة', direction: 'اتجاه الإقامة',
  ticketUrl: 'رابط تذكرة الرحلة', ticketFileId: 'معرف تذكرة الرحلة', draftJson: 'مسودة الإشعار (JSON)', supervisorRole: 'دور المشرف',
  tripRef: 'الرقم المرجعي', madinahExtra: 'فنادق إضافية - المدينة (JSON)', makkahExtra: 'فنادق إضافية - مكة (JSON)',
  arrivalPort: 'منفذ الوصول', departurePort: 'منفذ المغادرة', arrivalTime: 'ساعة الوصول', departureTime: 'ساعة المغادرة',
  arrivalFlight: 'رقم رحلة الوصول', departureFlight: 'رقم رحلة المغادرة', supervisorsJson: 'المشرفون (JSON)',
  shareToken: 'رمز مشاركة العميل',
  supervisorPhones: 'أرقام جوالات المشرف'  // 📱 (V4.139)
};
var PILGRIMS_COL_ = {
  serial: 'مسلسل', name: 'اسم المعتمر', passport: 'رقم الجواز', type: 'النوع', client: 'العميل',
  accommodation: 'طبيعة التسكين', roomNo: 'رقم الغرفة', notes: 'ملاحظات', tripName: 'اسم الرحلة', bookingId: 'رقم الإشعار',
  latinName: 'الاسم بالإنجليزية', birthDate: 'تاريخ الميلاد', issueDate: 'تاريخ إصدار الجواز', expiryDate: 'تاريخ انتهاء الجواز',
  pid: 'معرف المعتمر', mahramPid: 'معرف المحرم', mahramRel: 'علاقة المحرم', hotelMadinah: 'فندق المدينة', hotelMakkah: 'فندق مكة',
  roomGroup: 'مجموعة الغرفة', housingExcluded: 'مستبعد من التسكين',
  roomNoMadinah: 'رقم غرفة المدينة', roomNoMakkah: 'رقم غرفة مكة',
  // 🏙️ (V4.47) استبعاد منفصل لكل مدينة — انظر التعليق أعلى PILGRIMS_HEADERS_
  housingExcludedMadinah: 'مستبعد من تسكين المدينة', housingExcludedMakkah: 'مستبعد من تسكين مكة'
};
// المصدر القانوني لأعمدة شيت الإشعارات (Bookings) — مطابق للترتيب الفعلي في الشيت (مؤكَّد من القراءة والكتابة معاً).
// الأعمدة 0-31 من عناوين الإعداد، و32-35 امتدادات لاحقة. _robustColMap_ يرجع للموضع القانوني عند اختلاف النص، فلا انحدار.
var BOOKINGS_HEADERS_ = [
  'مراجعة واعتماد', 'رقم الإشعار', 'الوكيل السعودي', 'الشركة المصرية', 'أرقام المجموعات', 'العميل', 'العدد', 'المشرف',
  'وسيلة السفر', 'منفذ الوصول', 'تاريخ الوصول', 'ساعة الوصول', 'رقم رحلة الوصول',
  'تاريخ المغادرة', 'رقم رحلة المغادرة', 'ساعة المغادرة', 'منفذ المغادرة',
  'شركة النقل الداخلي', 'رقم التشغيلة', 'عدد الباصات', 'اتجاه الإقامة',
  'عدد ليالي المدينة', 'عدد ليالي مكة', 'سكن المدينة', 'دخول المدينة', 'خروج المدينة',
  'سكن مكة', 'دخول مكة', 'خروج مكة', 'extraMovements', 'ملاحظات الإشعار', 'رابط تذكرة الطيران',
  'معرّف ملف التذكرة', 'سعر الباص', 'قيمة التشغيلة', 'اسم الرحلة', 'تاريخ التحرك الداخلي الأساسي',
  'توقيت التحرك الداخلي الأساسي', 'اسم المجموعة',
  'مقاطع نقل إضافية' // 🧩 (V4.43) بيان+قيمة لكل مقطع نقل إضافي (JSON) — كشف حساب النقل السعودي
];
var BOOKINGS_COL_ = {
  status: 'مراجعة واعتماد', id: 'رقم الإشعار', agent: 'الوكيل السعودي', company: 'الشركة المصرية',
  groupNumbers: 'أرقام المجموعات', client: 'العميل', count: 'العدد', supervisor: 'المشرف',
  travelMethod: 'وسيلة السفر', arrivalPort: 'منفذ الوصول', arrivalDate: 'تاريخ الوصول', arrivalTime: 'ساعة الوصول', arrivalFlight: 'رقم رحلة الوصول',
  departureDate: 'تاريخ المغادرة', departureFlight: 'رقم رحلة المغادرة', departureTime: 'ساعة المغادرة', departurePort: 'منفذ المغادرة',
  transportCompany: 'شركة النقل الداخلي', operationNo: 'رقم التشغيلة', busCount: 'عدد الباصات', direction: 'اتجاه الإقامة',
  madinahNights: 'عدد ليالي المدينة', makkahNights: 'عدد ليالي مكة', madinahHotel: 'سكن المدينة', madinahCheckIn: 'دخول المدينة', madinahCheckOut: 'خروج المدينة',
  makkahHotel: 'سكن مكة', makkahCheckIn: 'دخول مكة', makkahCheckOut: 'خروج مكة', extraMovements: 'extraMovements',
  internalTransferDate: 'تاريخ التحرك الداخلي الأساسي', internalTransferTime: 'توقيت التحرك الداخلي الأساسي',
  notes: 'ملاحظات الإشعار', ticketUrl: 'رابط تذكرة الطيران', ticketFileId: 'معرّف ملف التذكرة',
  busPrice: 'سعر الباص', operationValue: 'قيمة التشغيلة', tripName: 'اسم الرحلة',
  groupName: 'اسم المجموعة', transportSegments: 'مقاطع نقل إضافية'
};
// مُنشئ دالة وصول للصف بالاسم المنطقي: T = _cellReader_(colMap, TRIPS_COL_) ثم T(r,'supervisor')
function _cellReader_(colMap, nameDict) {
  return function(row, key) {
    var idx = colMap[nameDict[key]];
    return idx === undefined ? "" : row[idx];
  };
}

/* ========== تعدّد المشرفين (مشرف لكل 50 معتمر) ==========
   القائمة القانونية الكاملة تُخزَّن في العمود 32 (0-based) "المشرفون (JSON)".
   للتوافق الرجعي: العمود 3 = اسم المشرف الأول، العمود 22 = دور المشرف الأول.
   مرافق = تذكرة + سكن + مقعد | استقبال فقط = سكن بلا تذكرة/مقعد. */
function _buildSupervisorsList_(d) {
  d = d || {};
  var list = [];
  // من مصفوفة صريحة supervisors إن أُرسلت
  if (Array.isArray(d.supervisors) && d.supervisors.length) {
    d.supervisors.forEach(function(s) {
      var nm = String((s && s.name) || "").trim();
      if (nm) list.push({ name: nm, role: String((s && s.role) || "مرافق") });
    });
    if (list.length) return list;
  }
  // وإلا: الأساسي (supervisor/supervisorRole) + supervisorsExtra
  var primaryName = String(d.supervisor || "").trim();
  if (primaryName) list.push({ name: primaryName, role: String(d.supervisorRole || "مرافق") });
  (d.supervisorsExtra || []).forEach(function(s) {
    var nm = String((s && s.name) || "").trim();
    if (nm) list.push({ name: nm, role: String((s && s.role) || "مرافق") });
  });
  return list;
}
// يقرأ قائمة المشرفين من صف الرحلة (عمود "المشرفون (JSON)" أولاً ثم الاحتياطي المشرف/دور المشرف)
// colMap اختياري: لو مرّرته، تُقرأ الأعمدة بالاسم (مستقلة عن الترتيب)؛ وإلا بالفهارس الثابتة 32/3/22
function _parseSupervisorsRow_(row, colMap) {
  var jsonIdx = colMap ? colMap[TRIPS_COL_.supervisorsJson] : 32;
  var nameIdx = colMap ? colMap[TRIPS_COL_.supervisor] : 3;
  var roleIdx = colMap ? colMap[TRIPS_COL_.supervisorRole] : 22;
  var raw = String((row && jsonIdx !== undefined && row[jsonIdx]) || "").trim();
  if (raw) {
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        var out = arr.map(function(s) {
          return { name: String((s && s.name) || "").trim(), role: String((s && s.role) || "مرافق") };
        }).filter(function(s) { return s.name; });
        if (out.length) return out;
      }
    } catch (e) {}
  }
  var nm = String((row && nameIdx !== undefined && row[nameIdx]) || "").trim();
  return nm ? [{ name: nm, role: String((row && roleIdx !== undefined && row[roleIdx]) || "مرافق") }] : [];
}
// نص العرض المُجمَّع (مطابق للفنادق: مفصولون بـ /) مع تمييز "استقبال فقط"
function _supervisorsDisplay_(list) {
  return (list || []).map(function(s) {
    return s.name + (s.role === "استقبال فقط" ? " (استقبال)" : "");
  }).join(" / ");
}
// عدد المقاعد التي يشغلها المشرفون: كل "مرافق" ليس اسمه صفاً بالكشف = مقعد
function _supervisorSeatCount_(list, kashfNamesMap) {
  var n = 0;
  (list || []).forEach(function(s) {
    if (s.role !== "استقبال فقط" && !(kashfNamesMap && kashfNamesMap[s.name])) n++;
  });
  return n;
}

// إنشاء الشيتين لو مش موجودين (idempotent) — يُستدعى من زر في شاشة الإعدادات
function setupTripsSystem_() {
  var ss = getSpreadsheet_();
  var created = [];

  var tripsSheet = ss.getSheetByName(TRIPS_SHEET_NAME_);
  if (!tripsSheet) {
    tripsSheet = ss.insertSheet(TRIPS_SHEET_NAME_);
    tripsSheet.getRange(1, 1, 1, TRIPS_HEADERS_.length).setValues([TRIPS_HEADERS_])
      .setBackground("#1e3d59").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
    tripsSheet.setFrozenRows(1);
    created.push(TRIPS_SHEET_NAME_);
  } else {
    // ترحيل تلقائي: إضافة أي أعمدة جديدة انضافت للـTRIPS_HEADERS_ بعد إنشاء الشيت
    var existingLastCol = tripsSheet.getLastColumn();
    var existingHeaders = tripsSheet.getRange(1, 1, 1, existingLastCol).getValues()[0];
    var missing = TRIPS_HEADERS_.filter(function(h) { return existingHeaders.indexOf(h) === -1; });
    if (missing.length) {
      tripsSheet.getRange(1, existingLastCol + 1, 1, missing.length).setValues([missing])
        .setBackground("#1e3d59").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
      created.push("أعمدة جديدة في Trips: " + missing.join('، '));
    }
  }

  var pilgrimsSheet = ss.getSheetByName(PILGRIMS_SHEET_NAME_);
  if (!pilgrimsSheet) {
    pilgrimsSheet = ss.insertSheet(PILGRIMS_SHEET_NAME_);
    pilgrimsSheet.getRange(1, 1, 1, PILGRIMS_HEADERS_.length).setValues([PILGRIMS_HEADERS_])
      .setBackground("#065f46").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
    pilgrimsSheet.setFrozenRows(1);
    created.push(PILGRIMS_SHEET_NAME_);
  }

  try { var refsFilled = backfillTripRefs_(); if (refsFilled) created.push("أرقام مرجعية لرحلات قديمة: " + refsFilled); } catch (re1) {}
  return { success: true, message: created.length ? ("تم إنشاء: " + created.join('، ')) : "الشيتان موجودان بالفعل" };
}

function _getTripsSheet_() {
  var sheet = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_);
  if (!sheet) { setupTripsSystem_(); sheet = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_); }
  // ترحيل ذاتي: لو الهيدر أقصر من التعريف الحالي (نسخة قديمة) نوسّع أعمدة الشيت فعلياً —
  // بدونه، أي getRange() يطلب أعمدة أكتر من الموجودة فعلياً بالشيت يفشل بخطأ سيرفر حقيقي
  if (sheet && sheet.getLastColumn() < TRIPS_HEADERS_.length) {
    // وسّع شبكة الأعمدة الفعلية أولاً لو كانت أضيق من التعريف — بدونه getRange لعمود غير موجود يفشل
    var _maxCols = sheet.getMaxColumns();
    if (_maxCols < TRIPS_HEADERS_.length) {
      sheet.insertColumnsAfter(_maxCols, TRIPS_HEADERS_.length - _maxCols);
    }
    sheet.getRange(1, 1, 1, TRIPS_HEADERS_.length).setValues([TRIPS_HEADERS_])
      .setBackground("#1e3d59").setFontColor("white").setFontWeight("bold");
  }
  return sheet;
}

function _getPilgrimsSheet_() {
  var sheet = getSpreadsheet_().getSheetByName(PILGRIMS_SHEET_NAME_);
  if (!sheet) { setupTripsSystem_(); sheet = getSpreadsheet_().getSheetByName(PILGRIMS_SHEET_NAME_); }
  // ترحيل ذاتي: لو الهيدر أقصر من التعريف الحالي (نسخة قديمة) نوسّعه في مكانه
  if (sheet && sheet.getLastColumn() < PILGRIMS_HEADERS_.length) {
    // وسّع شبكة الأعمدة الفعلية أولاً لو كانت أضيق من التعريف — بدونه getRange لعمود غير موجود يفشل
    var _pMaxCols = sheet.getMaxColumns();
    if (_pMaxCols < PILGRIMS_HEADERS_.length) {
      sheet.insertColumnsAfter(_pMaxCols, PILGRIMS_HEADERS_.length - _pMaxCols);
    }
    sheet.getRange(1, 1, 1, PILGRIMS_HEADERS_.length).setValues([PILGRIMS_HEADERS_])
      .setBackground("#065f46").setFontColor("white").setFontWeight("bold");
  }
  return sheet;
}

// تنسيق موحّد للتواريخ القادمة من الشيت (Date أو نص) إلى dd/MM/yyyy
function _tripFormatDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
  return val ? String(val) : "";
}

// تنسيق موحّد لأوقات الشيت (Date أو نص خام) إلى "HH:mm"
function _tripFormatTime_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "Asia/Riyadh", "HH:mm");
  }
  var s = val ? String(val).trim() : "";
  if (!s) return "";
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m && !/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(s)) return ("0" + m[1]).slice(-2) + ":" + m[2];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone() || "Asia/Riyadh", "HH:mm");
  return s;
}

// يرجع كل الرحلات (الأحدث أولاً) مع عدد المعتمرين المحسوب لكل رحلة من كشف المعتمرين
function getTripsList(authToken) {
  requireAuth_(authToken);

  // ⚡ كاش: قائمة الرحلات تقرأ 3 شيتات (Trips/Pilgrims/Bookings) — تُمسح تلقائياً مع أي حفظ/حذف
  var _cachedTrips = getCachedData('trips_list_cache');
  if (_cachedTrips) return _cachedTrips;

  var sheet = _getTripsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 🔒 قراءة بأسماء الأعمدة (مستقلة عن الترتيب، مع رجوع قانوني عند اختلاف نص العنوان)
  var C = _robustColMap_(sheet, TRIPS_HEADERS_);
  var T = _cellReader_(C, TRIPS_COL_);
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // عدّ المعتمرين لكل رحلة — بنفس منطق كشف الرحلة تماماً:
  // المقاعد = المحتسبون - الرضّع (الرضيع دائماً بلا سرير وبلا مقعد)؛ المشرف يُضاف إن لم يكن صفاً بالكشف
  var pilgrimCounts = {}, infantCounts = {}, housingFlags = {}, namesByTrip = {};
  var countedByTrip = {}, supRowCounts = {};
  var pSheet = _getPilgrimsSheet_();
  var pLastRow = pSheet.getLastRow();
  if (pLastRow >= 2) {
    var P = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var Pg = _cellReader_(P, PILGRIMS_COL_);
    var pData = pSheet.getRange(2, 1, pLastRow - 1, pSheet.getLastColumn()).getValues();
    pData.forEach(function(pr) {
      var tName = String(Pg(pr, 'tripName') || "").trim();
      var pName = String(Pg(pr, 'name') || "").trim();
      if (!tName || !pName) return;
      var pType = String(Pg(pr, 'type') || "").trim();
      var pAcc = String(Pg(pr, 'accommodation') || "").trim();
      pilgrimCounts[tName] = (pilgrimCounts[tName] || 0) + 1;
      if (pType === "رضيع") infantCounts[tName] = (infantCounts[tName] || 0) + 1;
      // 🧑‍✈️ صفوف المشرفين بالكشف (عمود العميل يبدأ بـ"المشرف") — تُعدّ منفصلة لاستبعادها من
      // «العدد المحتسب» لقاعدة عودة الـ70% (المعتمرون + الأطفال فقط، بلا مشرفين وبلا رضّع)
      if (String(Pg(pr, 'client') || "").trim().indexOf("المشرف") === 0) supRowCounts[tName] = (supRowCounts[tName] || 0) + 1;
      if (String(Pg(pr, 'roomNo') || "").trim()) housingFlags[tName] = true;
      (namesByTrip[tName] = namesByTrip[tName] || {})[pName] = true;
      // 🎫 المُحتسَبون لأغراض عدّ المقاعد (كما في updatePilgrimsCount بعد التصحيح): كل معتمر مسمّى
      // يُحتسب دائماً — الرضيع فقط لا يشغل مقعد طيران مستقلاً (يسافر على حضن مرافقه)، بغض النظر
      // عن حالة السرير بالتسكين، لأن "بلا سرير" أصبح بياناً خاصاً بالتسكين فقط ولا علاقة له بالمقعد
      countedByTrip[tName] = (countedByTrip[tName] || 0) + 1;
    });
  }

  // ربط الإشعارات: هل يوجد إشعار مرتبط بالرحلة (عمود اسم الرحلة) وهل عليه تذكرة مرفوعة
  var bookingFlags = {}, ticketFlags = {}, bookingIds = {}, bookingRetDates = {}, bookingCounts = {};
  var bSheet = getSpreadsheet_().getSheetByName("Bookings");
  if (bSheet && bSheet.getLastRow() >= 2) {
    var bLastCol = bSheet.getLastColumn();
    var bHeaders = bSheet.getRange(1, 1, 1, bLastCol).getValues()[0];
    var tripCol = bHeaders.indexOf("اسم الرحلة");
    var ticketCol = bHeaders.indexOf("رابط التذكرة");
    var idCol = bHeaders.indexOf("رقم الإشعار");
    // 🏛️ تاريخ المغادرة بالإشعار = تاريخ العودة المعتمد لقاعدة عودة الـ70% عند وجود إشعار مرتبط
    var depDateCol = bHeaders.indexOf("تاريخ المغادرة");
    // 🏛️ عدد الإشعار = العدد النهائي المعتمد للرحلات التي سافرت (قاعدة عودة الـ70%)
    var cntCol = bHeaders.indexOf("العدد");
    if (tripCol !== -1) {
      var bData = bSheet.getRange(2, 1, bSheet.getLastRow() - 1, bLastCol).getValues();
      bData.forEach(function(br) {
        var tName = String(br[tripCol] || "").trim();
        if (!tName) return;
        bookingFlags[tName] = true;
        if (idCol !== -1 && br[idCol]) bookingIds[tName] = String(br[idCol]);
        if (ticketCol !== -1 && String(br[ticketCol] || "").trim()) ticketFlags[tName] = true;
        if (depDateCol !== -1 && br[depDateCol]) {
          var _brd = _tripFormatDate_(br[depDateCol]);
          if (_brd) bookingRetDates[tName] = _brd;
        }
        if (cntCol !== -1 && br[cntCol] !== "" && br[cntCol] !== null) {
          var _bcn = Number(br[cntCol]);
          if (_bcn > 0) bookingCounts[tName] = _bcn;
        }
      });
    }
  }

  // 💵 (V4.22) رحلات مسعَّرة فعليًا (pricing.applied=true) — لتلوين زر «تسعير الرحلة» بشاشة قائمة الرحلات
  var pricedTrips = {};
  try {
    var tpSh = _accSheet_(ACC_TRIP_PRICES_SHEET, ACC_TRIP_PRICES_HEADERS);
    if (tpSh.getLastRow() >= 2) {
      tpSh.getRange(2, 1, tpSh.getLastRow() - 1, 2).getValues().forEach(function(tpr) {
        var tn = String(tpr[0] || '').trim();
        if (!tn) return;
        try { if (JSON.parse(String(tpr[1] || '')).applied) pricedTrips[tn] = true; } catch (e2) {}
      });
    }
  } catch (e) {}

  var result = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    var name = String(T(r, 'name') || "").trim();
    if (!name) continue;
    var pilgrimCount = pilgrimCounts[name] || 0;
    var infants = infantCounts[name] || 0;
    var supervisorsList = _parseSupervisorsRow_(r, C);
    var _bs = T(r, 'bookedSeats');
    var bookedSeats = (_bs !== "" && _bs !== null && _bs !== undefined) ? Number(_bs) : "";
    var _mn = T(r, 'madinahNights'), _kn = T(r, 'makkahNights');
    var _linked = String(T(r, 'linkedBookingId') || "");
    var _ret = T(r, 'returnDate');
    var seatsOccupied = ((countedByTrip[name] || 0) - (supRowCounts[name] || 0) - (infantCounts[name] || 0)) +
      _supervisorSeatCount_(supervisorsList, null);
    var isArchived = (function() {
      var rd = (_ret instanceof Date) ? _ret : _parseDmy_(_tripFormatDate_(_ret));
      if (!rd) return false;
      var t0 = new Date(); t0.setHours(0, 0, 0, 0);
      return rd.getTime() < t0.getTime();
    })();
    if (isArchived && bookedSeats === "" && seatsOccupied > 0) {
      bookedSeats = seatsOccupied;
      try {
        var bsCol = C[TRIPS_COL_.bookedSeats];
        if (bsCol !== undefined) sheet.getRange(i + 2, bsCol + 1).setValue(seatsOccupied);
      } catch (e) {}
    }
    result.push({
      row: i + 2,
      name: name,
      company: String(T(r, 'company') || ""),
      agent: String(T(r, 'agent') || ""),
      supervisor: String(T(r, 'supervisor') || ""),
      departDate: _tripFormatDate_(T(r, 'departDate')),
      returnDate: _tripFormatDate_(_ret),
      airline: String(T(r, 'airline') || ""),
      madinahHotel: String(T(r, 'madinahHotel') || ""),
      madinahCheckIn: _tripFormatDate_(T(r, 'madinahCheckIn')),
      madinahCheckOut: _tripFormatDate_(T(r, 'madinahCheckOut')),
      madinahNights: (_mn !== "" && _mn !== null) ? Number(_mn) : "",
      makkahHotel: String(T(r, 'makkahHotel') || ""),
      makkahCheckIn: _tripFormatDate_(T(r, 'makkahCheckIn')),
      makkahCheckOut: _tripFormatDate_(T(r, 'makkahCheckOut')),
      makkahNights: (_kn !== "" && _kn !== null) ? Number(_kn) : "",
      linkedBookingId: _linked || (bookingIds[name] || ""),
      pricingApplied: !!pricedTrips[name],
      pilgrimCount: pilgrimCount,
      infantCount: infants,
      supervisors: supervisorsList,
      supervisorsDisplay: _supervisorsDisplay_(supervisorsList),
      supervisorPhones: String(T(r, 'supervisorPhones') || ""),
      seatsOccupied: seatsOccupied,
      bookedSeats: bookedSeats,
      direction: String(T(r, 'direction') || ""),
      ticketUrl: String(T(r, 'ticketUrl') || ""),
      ticketFileId: String(T(r, 'ticketFileId') || ""),
      availableSeats: bookedSeats !== "" ? (bookedSeats - seatsOccupied) : "",
      hasDraft: !!String(T(r, 'draftJson') || "").trim(),
      supervisorRole: String(T(r, 'supervisorRole') || "مرافق"),
      tripRef: String(T(r, 'tripRef') || ""),
      ruleCount: Math.max(0, (countedByTrip[name] || 0) - (infantCounts[name] || 0) - (supRowCounts[name] || 0)),
      bookingReturnDate: bookingRetDates[name] || "",
      bookingCount: bookingCounts[name] || 0,
      archived: isArchived,
      // 🧭 حقول خط السير
      arrivalPort: String(T(r, 'arrivalPort') || ""),
      departurePort: String(T(r, 'departurePort') || ""),
      arrivalTime: _tripFormatTime_(T(r, 'arrivalTime')),
      departureTime: _tripFormatTime_(T(r, 'departureTime')),
      arrivalFlight: String(T(r, 'arrivalFlight') || ""),
      departureFlight: String(T(r, 'departureFlight') || ""),
      readiness: {
        manifest: pilgrimCount > 0,
        housing: !!housingFlags[name],
        booking: !!bookingFlags[name] || !!_linked.trim(),
        ticket: !!ticketFlags[name]
      }
    });
  }
  setCachedData('trips_list_cache', result);
  return result;
}

/* 🏛️ (V3.87) إشعارات الوصول غير المرتبطة بأي رحلة — تدخل قاعدة عودة الـ70% ببياناتها هي:
   العدد من الإشعار، الشركة من الإشعار، السفر = تاريخ الوصول، العودة = تاريخ المغادرة.
   «مرتبط» = اسم الرحلة مكتوب بالإشعار، أو رقم الإشعار مسجَّل بحقل الربط في أي رحلة */
function getRule70Bookings(authToken) {
  requireAuth_(authToken);
  var out = [];
  var ss = getSpreadsheet_();
  var bSheet = ss.getSheetByName("Bookings");
  if (!bSheet || bSheet.getLastRow() < 2) return out;

  var linkedIds = {};
  var tSheet = _getTripsSheet_();
  if (tSheet && tSheet.getLastRow() >= 2) {
    var tC = _robustColMap_(tSheet, TRIPS_HEADERS_);
    var T = _cellReader_(tC, TRIPS_COL_);
    tSheet.getRange(2, 1, tSheet.getLastRow() - 1, tSheet.getLastColumn()).getValues().forEach(function(r) {
      var lb = String(T(r, 'linkedBookingId') || '').trim();
      if (lb) linkedIds[lb] = true;
    });
  }

  var bC = _robustColMap_(bSheet, BOOKINGS_HEADERS_);
  var B = _cellReader_(bC, BOOKINGS_COL_);
  bSheet.getRange(2, 1, bSheet.getLastRow() - 1, bSheet.getLastColumn()).getValues().forEach(function(r) {
    var id = String(B(r, 'id') || '').trim();
    if (!id) return;
    if (String(B(r, 'tripName') || '').trim()) return; // مرتبط برحلة عبر اسم الرحلة
    if (linkedIds[id]) return;                          // مرتبط عبر رقم الإشعار بالرحلة
    out.push({
      id: id,
      company: String(B(r, 'company') || '').trim(),
      client: String(B(r, 'client') || '').trim(),
      count: Number(B(r, 'count')) || 0,
      arrivalDate: _tripFormatDate_(B(r, 'arrivalDate')),
      departureDate: _tripFormatDate_(B(r, 'departureDate'))
    });
  });
  return out;
}

/* 👤 (V3.89) إحصائية العميل: أعداد معتمريه (كبير/طفل/رضيع) مقسّمة برحلاته من كشوف الرحلات —
   القاعدة الموحّدة: الكشوف المرتبطة برحلات فقط؛ صفوف "بدون رحلة" تُعاد عدداً منفصلاً (noTripCount)
   للإحاطة دون دخولها التقرير. صفوف المشرفين (عميلها يبدأ بـ"المشرف") خارج الحساب لأنها ليست عملاء */
function getClientTripStats(authToken, clientName) {
  requireAuth_(authToken);
  clientName = String(clientName || '').trim();
  if (!clientName) throw new Error('اسم العميل مطلوب');

  var byTrip = {}, noTripCount = 0;
  var pSheet = _getPilgrimsSheet_();
  if (pSheet && pSheet.getLastRow() >= 2) {
    var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var P = _cellReader_(C, PILGRIMS_COL_);
    pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
      if (String(P(r, 'client') || '').trim() !== clientName) return;
      if (!String(P(r, 'name') || '').trim()) return;
      var tn = String(P(r, 'tripName') || '').trim();
      if (!tn) { noTripCount++; return; }
      var type = String(P(r, 'type') || '').trim();
      var e = (byTrip[tn] = byTrip[tn] || { adults: 0, children: 0, infants: 0, total: 0, hotels: {}, accom: {} });
      if (type === 'طفل') e.children++;
      else if (type === 'رضيع') e.infants++;
      else e.adults++;
      e.total++;
      // 🏨 (V4.30) بصمة التسكين/المستوى (فندق المدينة/مكة + طبيعة التسكين) — لرصد أي تغيير عنها لاحقًا بالحساب
      var hm = String(P(r, 'hotelMadinah') || '').trim(), hk = String(P(r, 'hotelMakkah') || '').trim();
      if (hm) e.hotels['M:' + hm] = (e.hotels['M:' + hm] || 0) + 1;
      if (hk) e.hotels['K:' + hk] = (e.hotels['K:' + hk] || 0) + 1;
      var acc = String(P(r, 'accommodation') || '').trim();
      if (acc) e.accom[acc] = (e.accom[acc] || 0) + 1;
    });
  }

  // بيانات الرحلات (الشركة/الوكيل/التواريخ) للرحلات التي ظهر فيها العميل فقط
  var trips = {};
  var tSheet = _getTripsSheet_();
  if (tSheet && tSheet.getLastRow() >= 2) {
    var tC = _robustColMap_(tSheet, TRIPS_HEADERS_);
    var T = _cellReader_(tC, TRIPS_COL_);
    tSheet.getRange(2, 1, tSheet.getLastRow() - 1, tSheet.getLastColumn()).getValues().forEach(function(r) {
      var n = String(T(r, 'name') || '').trim();
      if (!n || !byTrip[n]) return;
      trips[n] = {
        company: String(T(r, 'company') || ''),
        agent: String(T(r, 'agent') || ''),
        departDate: _tripFormatDate_(T(r, 'departDate')),
        returnDate: _tripFormatDate_(T(r, 'returnDate'))
      };
    });
  }

  var rows = Object.keys(byTrip).map(function(tn) {
    var t = trips[tn] || {};
    var e = byTrip[tn];
    return { trip: tn, company: t.company || '', agent: t.agent || '',
      departDate: t.departDate || '', returnDate: t.returnDate || '',
      adults: e.adults, children: e.children, infants: e.infants, total: e.total,
      hotels: e.hotels, accom: e.accom };
  });
  // ترتيب زمني بتاريخ الذهاب (الأقدم أولاً)، والرحلات بلا تاريخ في الآخر
  var toMs = function(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 8640000000000000;
  };
  rows.sort(function(a, b) { return toMs(a.departDate) - toMs(b.departDate); });
  return { rows: rows, noTripCount: noTripCount };
}

/* ============================================================
   💰 حسابات العملاء (V4.00)
   نمطان لكل رحلة: «برنامج» (بنود بالجنيه فقط) أو «بنود» (جنيه + ريال معاً)
   بنود + خصومات + دفعات بالعملتين + تحويل رصيد ريال→جنيه بسعر صرف يدوي
   + لقطة أعداد لكل حساب مع تنبيه مراجعة عند تغيّر أعداد الرحلة (بدون تعديل تلقائي)
   ============================================================ */
var ACC_ITEMS_SHEET = 'ClientAccounts_Items';
var ACC_PAY_SHEET   = 'ClientAccounts_Payments';
var ACC_META_SHEET  = 'ClientAccounts_Meta';
var ACC_ITEMS_HEADERS = ['المعرف','العميل','اسم الرحلة','البيان','الفئة','العملة','العدد','السعر','القيمة','خصم؟','ملاحظات','أنشئ بواسطة','أنشئ في','عُدّل بواسطة','عُدّل في','الليالي','الشركة','تلقائي؟','الترتيب','قيمة مباشرة؟'];
// عمود «تلقائي؟» (18): 'نعم' = بند ولّده محرك تسعير الرحلة ويُعاد حسابه تلقائياً مع كل تغيير بالكشف
// · 'معدّل' = كان تلقائياً ثم عدّله المستخدم يدوياً — يُحترم ولا يُلمس أبداً · فارغ = بند يدوي عادي
var ACC_TRIP_PRICES_SHEET = 'ClientAccounts_TripPrices';
var ACC_TRIP_PRICES_HEADERS = ['اسم الرحلة','الأسعار (JSON)','عُدّل بواسطة','عُدّل في'];
// 🏷️ (V4.13) أسعار بنود العميل بفترات سريان — لنمط «بنود»: JSON = {items:{'<بند>':{currency,periods:[{price,from,to}]}}}
var ACC_CLIENT_PRICES_SHEET = 'ClientAccounts_ClientPrices';
var ACC_CLIENT_PRICES_HEADERS = ['العميل','الأسعار (JSON)','عُدّل بواسطة','عُدّل في'];
// البنود الأساسية لنمط «بنود» (مفاتيح المطابقة الثابتة بين التوليد والمزامنة والتسعير)
var ACC_BOND_BASE_ = [
  { key: 'رسوم غرفة',        cur: 'EGP' }, { key: 'رسوم غرفة المشرف', cur: 'EGP' },
  { key: 'إشراف',            cur: 'EGP' }, { key: 'تذاكر',            cur: 'EGP' },
  { key: 'تذاكر الأطفال',    cur: 'EGP' }, { key: 'تذاكر الرضع',      cur: 'EGP' },
  { key: 'تأشيرات',          cur: 'SAR' }, { key: 'نقل سعودي',        cur: 'SAR' },
  { key: 'سكن المدينة',      cur: 'SAR' }, { key: 'سكن مكة',          cur: 'SAR' },
  { key: 'بدلات المشرف',     cur: 'SAR' },
  { key: 'شركة',             cur: 'EGP' }, { key: 'ضرائب',            cur: 'EGP' },
  { key: 'الإعاشة',          cur: 'SAR' }
];
var ACC_PAY_HEADERS   = ['المعرف','العميل','اسم الرحلة','النوع','التاريخ','المبلغ','العملة','سعر الصرف','البيان','أنشئ بواسطة','أنشئ في','الرقم التسلسلي'];
var ACC_META_HEADERS  = ['العميل','اسم الرحلة','نمط الحساب','لقطة الأعداد','تنبيه مقروء','عُدّل بواسطة','عُدّل في','اسم العرض'];
// 🔗 (V4.31) دمج ثابت لرحلات عميل بكشف الحساب — يبقى مفعّلاً حتى يُفكّ صراحةً بزر «فك الدمج»
var ACC_MERGE_SHEET   = 'ClientAccounts_MergeGroups';
var ACC_MERGE_HEADERS = ['العميل','الرحلات (JSON)','أنشئ/عُدّل بواسطة','أنشئ/عُدّل في'];

// 📑 (V4.54) بيان اتفاقيات الإعاشة — شيت مستقل
var CATERING_SHEET = 'CateringContracts';
// 📑 (V4.76) أُضيف عمود «المورد» بنهاية المصفوفة (index 17) — إضافي بحت، لا يغيّر مواضع الأعمدة
// 📝 (V4.77) أُضيف عمود «ملاحظات» بنهاية المصفوفة أيضاً (index 18) — نفس المبدأ الإضافي البحت
// القائمة فلا حاجة لتحديث أي فهرس ثابت قديم يشير لـ createdBy/createdAt/updatedBy/updatedAt/sourceFile
var CATERING_HEADERS = [
  'رقم الاتفاقية', 'اسم مقدم الخدمة', 'منطقة الخدمة', 'عدد أيام الاتفاقية',
  'تاريخ بداية الاتفاقية', 'تاريخ نهاية الاتفاقية', 'عدد المعتمرين', 'المدة',
  'المبلغ الإجمالي للمعتمرين', 'العميل / الرحلة', 'اسم شركة العمرة', 'رقم المجموعة',
  'أنشئ بواسطة', 'أنشئ في', 'عُدّل بواسطة', 'عُدّل في', 'مصدر الملف', 'المورد', 'ملاحظات'
];
// 🕘 (V4.86) أعمدة meta لا تُسجَّل كـ"حقل تغيّر" بسجل التعديلات (تُدار تلقائياً، وليست إدخال مستخدم)
var CATERING_LOG_SKIP_COLS_ = { 12: 1, 13: 1, 14: 1, 15: 1 };
// 🕘 (V4.86) يبني قائمة إدخالات سجل تعديلات (حقل/قديم/جديد) بمقارنة صف قديم بصف جديد لنفس الاتفاقية
function _ccLogDiffEntries_(contractNo, oldRow, newRow) {
  var entries = [];
  for (var i = 0; i < CATERING_HEADERS.length; i++) {
    if (CATERING_LOG_SKIP_COLS_[i]) continue;
    var ov = oldRow ? oldRow[i] : '';
    var nv = newRow[i];
    var ovS = (ov === undefined || ov === null || ov === '') ? '-' : String(ov);
    var nvS = (nv === undefined || nv === null || nv === '') ? '-' : String(nv);
    if (ovS === nvS) continue;
    entries.push({ action: 'تعديل اتفاقية إعاشة', recordId: contractNo, field: CATERING_HEADERS[i], oldVal: ovS, newVal: nvS });
  }
  return entries;
}

function getClientMergeGroup(authToken, client) {
  _accPerm_(authToken, 'view');
  client = String(client || '').trim();
  var sh = _accSheet_(ACC_MERGE_SHEET, ACC_MERGE_HEADERS);
  if (sh.getLastRow() < 2) return { success: true, trips: null };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_MERGE_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === client) {
      var trips = [];
      try { trips = JSON.parse(vals[i][1] || '[]'); } catch (e) { trips = []; }
      return { success: true, trips: trips.length ? trips : null };
    }
  }
  return { success: true, trips: null };
}

function saveClientMergeGroup(authToken, client, trips) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim();
  if (!client || !Array.isArray(trips) || trips.length < 2) return { success: false, error: 'الدمج يحتاج رحلتين على الأقل' };
  var sh = _accSheet_(ACC_MERGE_SHEET, ACC_MERGE_HEADERS);
  var last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === client) {
        sh.getRange(i + 2, 2, 1, 3).setValues([[JSON.stringify(trips), session.username, new Date()]]);
        logChange_(session.username, 'حفظ دمج رحلات دائم بكشف حساب', client, '-', '-', trips.join('، '));
        return { success: true };
      }
    }
  }
  sh.appendRow([client, JSON.stringify(trips), session.username, new Date()]);
  logChange_(session.username, 'حفظ دمج رحلات دائم بكشف حساب', client, '-', '-', trips.join('، '));
  return { success: true };
}

function clearClientMergeGroup(authToken, client) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim();
  var sh = _accSheet_(ACC_MERGE_SHEET, ACC_MERGE_HEADERS);
  if (sh.getLastRow() < 2) return { success: true };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === client) {
      sh.deleteRow(i + 2);
      logChange_(session.username, 'فك دمج رحلات بكشف حساب', client, '-', '-', '-');
      return { success: true };
    }
  }
  return { success: true };
}

/* ============================================================
   🔔 (V4.32) نظام التنبيهات — سجل مركزي بصلاحيات، عميل جديد على رحلة + تغيّر تسكين/عدد/فندق
   لعميل له حساب مسجَّل مسبقًا على تلك الرحلة
   ============================================================ */
var NOTIF_SHEET   = 'Notifications';
var NOTIF_HEADERS = ['المعرف', 'النوع', 'الرسالة', 'العميل', 'اسم الرحلة', 'الصلاحية المطلوبة', 'مقروء؟', 'أنشئ بواسطة', 'أنشئ في'];

/* ============================================================
   🔔 (V4.125) مركز التنبيهات بالإعدادات — مفتاح تفعيل/تعطيل مستقل لكل نوع تنبيه
   يُحفظ في Script Properties (نفس أسلوب إعدادات جروبات تليجرام)، والافتراضي: الكل مُفعَّل،
   فأي تنبيه لم يُسجَّل له مفتاح بعد يظل يعمل كما كان قبل هذه الميزة تماماً.
   ============================================================ */
var NOTIF_TYPES_ = [
  { key: 'tg_tomorrow',    name: 'تليجرام: تحركات الغد',              desc: 'رسالة تليجرام اليومية بتحركات الغد (وصول/مغادرة) لجروبات التنبيهات' },
  { key: 'email_tomorrow', name: 'إيميل: تحركات الغد',                desc: 'رسالة البريد اليومية بتحركات الغد لعناوين البريد المسجَّلة بالإعدادات' },
  { key: 'tg_movements',   name: 'تليجرام: تحركات يوم محدَّد',         desc: 'إرسال تحركات تاريخ بعينه لتليجرام (يدوي أو من البوت)' },
  { key: 'notif_new_client', name: 'جرس: عميل جديد على رحلة',         desc: 'تنبيه داخل البرنامج عند ظهور عميل جديد بكشف رحلة' },
  { key: 'notif_acct_change', name: 'جرس: تغيّر تسكين/عدد/فندق',      desc: 'تنبيه داخل البرنامج عند تغيّر أعداد أو تسكين أو فندق عميل له حساب مسجَّل' },
  { key: 'mf_urgent',      name: 'ملفات الوزارة العاجلة',             desc: 'تنبيه الملفات التي لم تُراجع وباقٍ على سفرها 3 أيام أو أقل' },
  { key: 'mf_trips_no_file', name: 'رحلات بلا ملف مراجعة وزارة',      desc: 'البانر الأحمر أعلى قائمة الرحلات وشارة «بلا ملف وزارة» للرحلات التي باقٍ لها 3 أيام أو أقل بلا ملف مراجعة (أو بملف لم يُراجع)' },
  { key: 'trips_no_notice', name: 'رحلات بلا إشعار خلال 72 ساعة',     desc: 'كارت التنبيه الأحمر بلوحة التحكم للرحلات التي بلا إشعار وسفرها قريب' },
  { key: 'trips_urgent48', name: 'رقاقة «عاجل 48 ساعة» للرحلات',      desc: 'الرقاقة الحمراء النابضة بشريط تصفية الرحلات للرحلات التي يقترب سفرها' },
  { key: 'passport_expiry', name: 'جوازات منتهية أو قاربت الانتهاء',  desc: 'شريط التنبيه بالسجل العام للمعتمرين (منتهية / تنتهي خلال 6 أشهر)' }
];
function _notifCfg_() {
  var cfg = null;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('NOTIF_TOGGLES');
    if (raw) cfg = JSON.parse(raw);
  } catch (e) { cfg = null; }
  return (cfg && typeof cfg === 'object') ? cfg : {};
}
// الافتراضي مُفعَّل دائماً — لا يُعطَّل تنبيه إلا لو عُطِّل صراحةً من شاشة الإعدادات
function _notifEnabled_(key) {
  var cfg = _notifCfg_();
  return cfg[key] === false ? false : true;
}
function getNotifSettings(authToken) {
  requireAuth_(authToken);
  var cfg = _notifCfg_();
  return {
    success: true,
    types: NOTIF_TYPES_.map(function(t) {
      return { key: t.key, name: t.name, desc: t.desc, enabled: cfg[t.key] === false ? false : true };
    })
  };
}
function saveNotifSettings(authToken, settings) {
  var session = requireAdminPermission_(authToken);
  var clean = {};
  NOTIF_TYPES_.forEach(function(t) {
    if (settings && settings[t.key] === false) clean[t.key] = false;
  });
  PropertiesService.getScriptProperties().setProperty('NOTIF_TOGGLES', JSON.stringify(clean));
  var offList = Object.keys(clean);
  logChange_(session.username, 'تعديل إعدادات التنبيهات', 'الإعدادات', 'التنبيهات المعطَّلة', '-',
    offList.length ? offList.join(', ') : 'لا يوجد (الكل مُفعَّل)');
  return { success: true, disabled: offList };
}

function _notifPush_(type, message, client, trip, perm, username) {
  // 🔕 (V4.125) احترام مفتاح التفعيل الخاص بهذا النوع من شاشة الإعدادات
  if (!_notifEnabled_('notif_' + type)) return;
  try {
    var sh = _accSheet_(NOTIF_SHEET, NOTIF_HEADERS);
    sh.appendRow([_accId_('N'), type, message, client || '', trip || '', perm || '', 'لا', username || '', new Date()]);
  } catch (e) { Logger.log('notif push failed: ' + e); }
}

function getNotifications(authToken) {
  var session = requireAuth_(authToken);
  var sh = _accSheet_(NOTIF_SHEET, NOTIF_HEADERS);
  if (sh.getLastRow() < 2) return { success: true, notifications: [] };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, NOTIF_HEADERS.length).getValues();
  var out = [];
  vals.forEach(function(r) {
    var perm = String(r[5] || '').trim();
    if (perm && !_sessionHasPerm_(session, perm) && !_sessionHasPerm_(session, 'all')) return;
    out.push({
      id: String(r[0]), type: String(r[1] || ''), message: String(r[2] || ''),
      client: String(r[3] || ''), trip: String(r[4] || ''), read: String(r[6]) === 'نعم',
      date: (r[8] instanceof Date) ? Utilities.formatDate(r[8], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : String(r[8] || '')
    });
  });
  out.reverse(); // الأحدث أولاً
  return { success: true, notifications: out.slice(0, 200) };
}

function markNotificationRead(authToken, id) {
  requireAuth_(authToken);
  var sh = _accSheet_(NOTIF_SHEET, NOTIF_HEADERS);
  if (sh.getLastRow() < 2) return { success: true };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { sh.getRange(i + 2, 7).setValue('نعم'); return { success: true }; }
  }
  return { success: false };
}

function markAllNotificationsRead(authToken) {
  var session = requireAuth_(authToken);
  var sh = _accSheet_(NOTIF_SHEET, NOTIF_HEADERS);
  if (sh.getLastRow() < 2) return { success: true };
  var last = sh.getLastRow();
  var vals = sh.getRange(2, 1, last - 1, NOTIF_HEADERS.length).getValues();
  var col7 = vals.map(function(r) {
    var perm = String(r[5] || '').trim();
    var visible = !perm || _sessionHasPerm_(session, perm) || _sessionHasPerm_(session, 'all');
    return [visible ? 'نعم' : r[6]];
  });
  sh.getRange(2, 7, col7.length, 1).setValues(col7);
  return { success: true };
}

function deleteNotification(authToken, id) {
  requireAuth_(authToken);
  var sh = _accSheet_(NOTIF_SHEET, NOTIF_HEADERS);
  if (sh.getLastRow() < 2) return { success: true };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { sh.deleteRow(i + 2); return { success: true }; }
  }
  return { success: false };
}

// 👤🏨 (V4.32) يُستدعى بعد حفظ كشف رحلة: عميل جديد على الرحلة، أو تغيّر تسكين/عدد/فندق لعميل له حساب مسجَّل مسبقًا
function _pushKashfChangeNotifications_(tripName, oldRows, newPilgrims, C, username) {
  var buildSigs = function(rows, getField) {
    var sigs = {};
    rows.forEach(function(r) {
      var client = String(getField(r, 'client') || '').trim();
      if (!client) return;
      var s = sigs[client] = sigs[client] || { a: 0, c: 0, i: 0, hotels: {}, accom: {} };
      var type = String(getField(r, 'type') || '').trim();
      if (type === 'طفل') s.c++; else if (type === 'رضيع') s.i++; else s.a++;
      var hm = String(getField(r, 'hotelMadinah') || '').trim(), hk = String(getField(r, 'hotelMakkah') || '').trim();
      if (hm) s.hotels['M:' + hm] = (s.hotels['M:' + hm] || 0) + 1;
      if (hk) s.hotels['K:' + hk] = (s.hotels['K:' + hk] || 0) + 1;
      var acc = String(getField(r, 'accommodation') || '').trim();
      if (acc) s.accom[acc] = (s.accom[acc] || 0) + 1;
    });
    return sigs;
  };
  var oldSigs = buildSigs(oldRows || [], function(r, key) { var idx = C[PILGRIMS_COL_[key]]; return idx !== undefined ? r[idx] : ''; });
  var newSigs = buildSigs(newPilgrims || [], function(r, key) { return r[key]; });
  var hashOf = function(s) { return JSON.stringify({ a: s.a, c: s.c, i: s.i, hotels: s.hotels, accom: s.accom }); };

  Object.keys(newSigs).forEach(function(client) {
    if (!oldSigs[client]) {
      _notifPush_('new_client', '👤 عميل جديد على رحلة ' + tripName + ': ' + client, client, tripName, 'accounts.view', username);
    }
  });

  var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  var metaByClientTrip = {};
  if (mSh.getLastRow() >= 2) {
    mSh.getRange(2, 1, mSh.getLastRow() - 1, 2).getValues().forEach(function(r) {
      metaByClientTrip[String(r[0] || '').trim() + '||' + String(r[1] || '').trim()] = true;
    });
  }
  Object.keys(newSigs).forEach(function(client) {
    if (!oldSigs[client]) return; // عميل جديد — عولج أعلاه
    if (!metaByClientTrip[client + '||' + tripName]) return; // لا حساب مسجَّل بعد لهذه الرحلة — لا داعي للتنبيه
    if (hashOf(oldSigs[client]) === hashOf(newSigs[client])) return;
    _notifPush_('acct_change', '⚠️ تغيّر تسكين/عدد/فندق للعميل ' + client + ' في رحلة ' + tripName + ' — راجع كشف حسابه', client, tripName, 'accounts.view', username);
  });
}

function _accSheet_(name, headers) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    // 🛡️ (V4.139) سباق تزامني: طلبان يفتحان الشاشة في نفس اللحظة قد يريا الشيت غير موجود معاً
    // فيحاول كلاهما إنشاءه — الثاني يفشل بخطأ "هناك ورقة موجودة من قبل" رغم أن الشيت بات موجوداً
    // فعلاً (أنشأه الأول للتو). بدل فشل الشاشة بالكامل، نُعيد القراءة ونستخدم الشيت الذي أُنشئ.
    try {
      sh = ss.insertSheet(name);
      sh.appendRow(headers);
      sh.setFrozenRows(1);
    } catch (e) {
      sh = ss.getSheetByName(name);
      if (!sh) throw e; // خطأ حقيقي غير متعلق بالتزامن
    }
  } else if (sh.getLastColumn() < headers.length) {
    // 🧱 ترقية شيت قديم: أعمدة أُضيفت لاحقاً (الليالي/الشركة) — أعد كتابة صف العناوين كاملاً
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function _accPerm_(authToken, cap) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'accounts.' + cap)) {
    throw new Error('لا تملك صلاحية ' + ({view:'عرض',add:'إضافة',edit:'تعديل',delete:'حذف'}[cap] || cap) + ' حسابات العملاء');
  }
  return session;
}

// 📑 (V4.60) صلاحية شاشة اتفاقيات الإعاشة — مستقلة عن حسابات العملاء (تُقبل catering.* أو accounts.* توافقاً خلفياً)
function _ccPerm_(authToken, cap) {
  var session = requireAuth_(authToken);
  if (_sessionHasPerm_(session, 'catering.' + cap)) return session;
  if (_sessionHasPerm_(session, 'accounts.' + cap)) return session; // توافق للمستخدمين القدماء
  throw new Error('لا تملك صلاحية ' + ({view:'عرض',add:'إضافة',edit:'تعديل',delete:'حذف'}[cap] || cap) + ' اتفاقيات الإعاشة');
}

// 🏷️ (V4.22) صلاحية تسعير الرحلات منفصلة عن صلاحية حسابات العملاء
function _pricingPerm_(authToken, cap) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'pricing.' + cap)) {
    throw new Error('لا تملك صلاحية ' + ({view:'عرض',add:'إضافة',edit:'تعديل',delete:'حذف'}[cap] || cap) + ' تسعير الرحلات');
  }
  return session;
}

function _accId_(prefix) {
  return prefix + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

// 🔢 (V4.24) رقم تسلسلي تلقائي لكل دفعة جديدة — عدّاد مستمر بخصائص السكربت، لا يتكرر ولا يُعاد ترقيمه
function _accNextPaySerial_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var next = (parseInt(props.getProperty('ACC_PAY_SERIAL_CTR'), 10) || 0) + 1;
    props.setProperty('ACC_PAY_SERIAL_CTR', String(next));
    return next;
  } finally {
    lock.releaseLock();
  }
}

function _accNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

// 🔁 (V4.45) حلّ نوع قيد كل تحويل عملة حسب حالة رصيد عملة المصدر لحظة إجرائه — بطلب صريح ومُؤكَّد
// برقم مثال: لو عملة المصدر دائنة، التحويل يُسجَّل كبند يزيد مستحقها (ويقلّل مستحق العملة الأخرى
// كأنه دفعة)؛ ولو مدينة، يُسجَّل كدفعة تقلّل مستحقها (ويزيد مستحق العملة الأخرى كبند). نسخة سيرفر-
// سايد مطابقة تمامًا لدالة _accResolveFx_ بالواجهة.
function _accResolveFx_(items, payments, carryInE, carryInS) {
  carryInE = Number(carryInE) || 0; carryInS = Number(carryInS) || 0;
  var dueE = 0, dueS = 0, discE = 0, discS = 0, paidE = 0, paidS = 0, fxE = 0, fxS = 0;
  var fxDueE = 0, fxPayE = 0, fxDueS = 0, fxPayS = 0;
  (items || []).forEach(function(it) {
    var v = Number(it.value) || 0;
    if (it.isDiscount) { if (it.currency === 'SAR') discS += v; else discE += v; }
    else { if (it.currency === 'SAR') dueS += v; else dueE += v; }
  });
  var nonFx = [], fxList = [];
  (payments || []).forEach(function(p) { if (p.ptype === 'تحويل') fxList.push(p); else nonFx.push(p); });
  nonFx.forEach(function(p) {
    var v = Number(p.amount) || 0;
    if (p.currency === 'SAR') paidS += v; else paidE += v;
  });
  var parseD = function(s) { var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; };
  var sortedFx = fxList.slice().sort(function(a, b) { return parseD(a.date) - parseD(b.date); });
  sortedFx.forEach(function(p) {
    var amt = Number(p.amount) || 0, rate = Number(p.rate) || 0, conv = amt * rate;
    var srcSAR = p.currency === 'SAR';
    var curNetSrc = srcSAR ? (carryInS + (dueS - discS) - paidS - fxS) : (carryInE + (dueE - discE) + fxE - paidE);
    var srcCredit = curNetSrc < -0.004;
    if (srcSAR) {
      if (srcCredit) { fxS -= amt; fxE -= conv; p._fxRole = 'due'; fxDueS += amt; fxPayE += conv; }
      else { fxS += amt; fxE += conv; p._fxRole = 'pay'; fxPayS += amt; fxDueE += conv; }
    } else {
      if (srcCredit) { fxE += amt; fxS += conv; p._fxRole = 'due'; fxDueE += amt; fxPayS += conv; }
      else { fxE -= amt; fxS -= conv; p._fxRole = 'pay'; fxPayE += amt; fxDueS += conv; }
    }
    p._fxSrcCredit = srcCredit;
  });
  return { dueE: dueE, dueS: dueS, discE: discE, discS: discS, paidE: paidE, paidS: paidS, fxE: fxE, fxS: fxS,
    fxDueE: fxDueE, fxPayE: fxPayE, fxDueS: fxDueS, fxPayS: fxPayS, sortedFx: sortedFx };
}
function _accCalc_(items, payments, carryInE, carryInS) {
  var r = _accResolveFx_(items, payments, carryInE, carryInS);
  var t = { dueE: r.dueE, dueS: r.dueS, discE: r.discE, discS: r.discS, paidE: r.paidE, paidS: r.paidS, fxS: r.fxS, fxE: r.fxE };
  var cE = Number(carryInE) || 0, cS = Number(carryInS) || 0;
  t.netS = cS + (t.dueS - t.discS) - t.paidS - t.fxS;
  t.netE = cE + (t.dueE - t.discE) + t.fxE - t.paidE;
  return t;
}

// لقطة أعداد الرحلة للعميل — أساس تنبيه المراجعة
// 🏨 (V4.33) البصمة تشمل الآن التسكين/المستوى (الفنادق وطبيعة التسكين) بجانب الأعداد — بطلب صريح
function _accStatsHash_(row) {
  return row ? JSON.stringify({ a: row.adults, c: row.children, i: row.infants, t: row.total,
    hotels: row.hotels || {}, accom: row.accom || {} }) : '';
}
// 🧹 (V4.92) نص مقروء للقطة أعداد/تسكين (بدل JSON خام غير مفهوم) — لعرضه بسجل التعديلات فقط،
// لا يمسّ _accStatsHash_ نفسها (تبقى كما هي لمقارنة التغيّر بدقة)
function _accStatsHashLabel_(hashStr) {
  if (!hashStr) return '-';
  var o;
  try { o = JSON.parse(hashStr); } catch (e) { return '-'; }
  if (!o) return '-';
  var parts = ['رجال ' + (o.a || 0), 'أطفال ' + (o.c || 0), 'رضّع ' + (o.i || 0)];
  var hotelsTxt = Object.keys(o.hotels || {}).map(function(k) {
    var city = k.charAt(0) === 'M' ? 'المدينة' : 'مكة';
    return city + ': ' + k.slice(2) + (o.hotels[k] > 1 ? ' (' + o.hotels[k] + ')' : '');
  }).join('، ');
  if (hotelsTxt) parts.push('فنادق: ' + hotelsTxt);
  var accomTxt = Object.keys(o.accom || {}).map(function(k) {
    return k + (o.accom[k] > 1 ? ' (' + o.accom[k] + ')' : '');
  }).join('، ');
  if (accomTxt) parts.push('تسكين: ' + accomTxt);
  return parts.join(' · ');
}

// ⚠️ (V4.33) مسح عام: أي عملاء لهم رحلات تغيّرت أعدادها أو تسكينها/فنادقها منذ حفظ حساباتهم — لشاشة الحسابات
// العامة (بزر عند الطلب فقط، غير تلقائي، لأنه يعيد حساب إحصاء كل عميل له لقطة حساب محفوظة)
function getClientsWithAlerts(authToken) {
  requireAuth_(authToken);
  var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  if (mSh.getLastRow() < 2) return { success: true, clients: [] };
  var vals = mSh.getRange(2, 1, mSh.getLastRow() - 1, ACC_META_HEADERS.length).getValues();
  var byClient = {};
  vals.forEach(function(r, i) {
    var client = String(r[0] || '').trim(), trip = String(r[1] || '').trim();
    var snapshot = String(r[3] || ''), readHash = String(r[4] || '');
    if (!client || !trip || !snapshot) return;
    (byClient[client] = byClient[client] || []).push({ trip: trip, snapshot: snapshot, readHash: readHash, rowNum: i + 2 });
  });
  var out = [];
  Object.keys(byClient).forEach(function(client) {
    var stats;
    try { stats = getClientTripStats(authToken, client); } catch (e) { return; }
    var rowByTrip = {};
    stats.rows.forEach(function(r) { rowByTrip[r.trip] = r; });
    var count = 0;
    byClient[client].forEach(function(m) {
      var row = rowByTrip[m.trip];
      if (!row) return;
      var old = null;
      try { old = JSON.parse(m.snapshot); } catch (e) { old = null; }
      // 🔁 (V4.38) نفس الترقية الصامتة للقطات القديمة (بلا مفتاح hotels) — راجع getClientAccount لنفس المنطق
      if (old && old.hotels === undefined) {
        try { mSh.getRange(m.rowNum, 4).setValue(_accStatsHash_(row)); } catch (eHeal) {}
        return;
      }
      var curHash = _accStatsHash_(row);
      if (m.snapshot !== curHash && m.readHash !== curHash) count++;
    });
    if (count) out.push({ client: client, count: count });
  });
  out.sort(function(a, b) { return b.count - a.count; });
  return { success: true, clients: out };
}

/**
 * 📊 (V4.34) كشف إجمالي كل العملاء: مستحق/مدفوع/رصيد بكل العملات — كل عميل له معتمرون على رحلات
 * أو له بنود أو دفعات ولو بلا معتمرين (دفعات عامة فقط). لا يستبعد أي رحلة من الإجمالي لمجرد عدم
 * وجود «حساب» مُهيَّأ لها رسميًا — أي بند/دفعة فعلية تُحسب دائمًا (بطلب صريح).
 */
function getAllClientsSummary(authToken) {
  _accPerm_(authToken, 'view');
  // 1) رحلات كل عميل (من كشوف المعتمرين) — لتحديد الرحلات «لم تُحاسَب عليها بعد» فقط
  var clientTrips = {};
  var pSheet = _getPilgrimsSheet_();
  if (pSheet && pSheet.getLastRow() >= 2) {
    var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var P = _cellReader_(C, PILGRIMS_COL_);
    pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
      var client = String(P(r, 'client') || '').trim();
      var trip = String(P(r, 'tripName') || '').trim();
      var name = String(P(r, 'name') || '').trim();
      if (!client || !trip || !name) return;
      (clientTrips[client] = clientTrips[client] || {})[trip] = true;
    });
  }
  // 2) بنود كل العملاء
  var clientItems = {};
  var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  if (iSh.getLastRow() >= 2) {
    iSh.getRange(2, 1, iSh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues().forEach(function(r) {
      var client = String(r[1] || '').trim();
      if (!client) return;
      (clientItems[client] = clientItems[client] || []).push({
        trip: String(r[2] || ''), currency: String(r[5] || 'EGP'), value: _accNum_(r[8]), isDiscount: String(r[9]) === 'نعم'
      });
    });
  }
  // 3) دفعات كل العملاء
  var clientPays = {};
  var paySh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (paySh.getLastRow() >= 2) {
    paySh.getRange(2, 1, paySh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues().forEach(function(r) {
      var client = String(r[1] || '').trim();
      if (!client) return;
      (clientPays[client] = clientPays[client] || []).push({
        trip: String(r[2] || ''), ptype: String(r[3] || 'دفعة'), amount: _accNum_(r[5]), currency: String(r[6] || 'EGP'), rate: _accNum_(r[7])
      });
    });
  }
  var allClients = {};
  Object.keys(clientTrips).forEach(function(c) { allClients[c] = true; });
  Object.keys(clientItems).forEach(function(c) { allClients[c] = true; });
  Object.keys(clientPays).forEach(function(c) { allClients[c] = true; });

  var out = [];
  Object.keys(allClients).forEach(function(client) {
    var items = clientItems[client] || [];
    var pays = clientPays[client] || [];
    var t = _accCalc_(items, pays);
    var tripsWithData = {};
    items.forEach(function(it) { if (it.trip) tripsWithData[it.trip] = true; });
    pays.forEach(function(p) { if (p.trip) tripsWithData[p.trip] = true; });
    var notAccounted = Object.keys(clientTrips[client] || {}).filter(function(tn) { return !tripsWithData[tn]; });
    out.push({
      client: client,
      dueE: t.dueE - t.discE + t.fxE, dueS: t.dueS - t.discS,
      paidE: t.paidE, paidS: t.paidS + t.fxS,
      netE: t.netE, netS: t.netS,
      notAccounted: notAccounted
    });
  });
  // ⬇️ ترتيب تنازلي حسب أعلى رصيد مستحق (مدين) بالجنيه أولًا ثم بالريال كفاصل تعادل
  out.sort(function(a, b) {
    var da = Math.max(a.netE, 0), db = Math.max(b.netE, 0);
    if (Math.abs(db - da) > 0.004) return db - da;
    return Math.max(b.netS, 0) - Math.max(a.netS, 0);
  });
  return { success: true, clients: out };
}

// ---------- إعدادات التسعير (رسوم الغرف بفترات + ثوابت) ----------
function _accPricing_() {
  // ملاحظة: أسعار التذاكر ليست تسعيرًا عامًا — تُدخل داخل بنود كل رحلة على حدة (بطلب صريح)
  // 🏛️ (V4.106) barcodePeriods = رسوم تجديد الباركود بفترات صلاحية · vipSurcharge = زيادة رسوم غرفة المعتمر في VIP (قديم)
  // 🏛️ (V4.113) vipRoomFee = إجمالي رسوم غرفة المعتمر الثابت عند المراجعة VIP (بدل روم فى + الزيادة)
  var d = { roomFeePeriods: [], supRoomFee: 200, barcodePeriods: [], vipSurcharge: 100, vipRoomFee: 3100 };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('ACC_PRICING');
    if (!raw) return d;
    var c = JSON.parse(raw);
    if (!Array.isArray(c.roomFeePeriods)) c.roomFeePeriods = [];
    if (!Array.isArray(c.barcodePeriods)) c.barcodePeriods = [];
    if (c.supRoomFee === undefined) c.supRoomFee = d.supRoomFee;
    if (c.vipSurcharge === undefined) c.vipSurcharge = d.vipSurcharge;
    if (c.vipRoomFee === undefined) c.vipRoomFee = d.vipRoomFee;
    return c;
  } catch (e) { return d; }
}

function getAccPricing(authToken) {
  _accPerm_(authToken, 'view');
  return { success: true, cfg: _accPricing_() };
}

function saveAccPricing(authToken, cfg) {
  var session = _accPerm_(authToken, 'edit');
  var clean = {
    roomFeePeriods: [],
    supRoomFee: _accNum_(cfg && cfg.supRoomFee) || 200,
    barcodePeriods: [],
    vipSurcharge: (cfg && cfg.vipSurcharge !== undefined) ? _accNum_(cfg.vipSurcharge) : 100,
    vipRoomFee: (cfg && cfg.vipRoomFee !== undefined) ? (_accNum_(cfg.vipRoomFee) || 3100) : 3100
  };
  ((cfg && cfg.roomFeePeriods) || []).forEach(function(p) {
    var from = String(p.from || '').trim(), to = String(p.to || '').trim();
    var price = _accNum_(p.price);
    if (!from || !price) return;
    clean.roomFeePeriods.push({ from: from, to: to, price: price }); // to فارغة = مفتوحة النهاية
  });
  // 🏛️ (V4.106) رسوم تجديد الباركود — نفس منطق الفترات
  ((cfg && cfg.barcodePeriods) || []).forEach(function(p) {
    var from = String(p.from || '').trim(), to = String(p.to || '').trim();
    var price = _accNum_(p.price);
    if (!from || !price) return;
    clean.barcodePeriods.push({ from: from, to: to, price: price });
  });
  PropertiesService.getScriptProperties().setProperty('ACC_PRICING', JSON.stringify(clean));
  logChange_(session.username, 'تعديل تسعير الحسابات', '-', 'ACC_PRICING', '-',
    clean.roomFeePeriods.length + ' فترة رسوم غرفة، رسوم غرفة المشرف ' + clean.supRoomFee + ' ج');
  return { success: true, cfg: clean };
}

// رسوم الغرفة السارية في تاريخ معيّن (dd/mm/yyyy) حسب الفترات المسجلة
function _accRoomFeeAt_(dateStr) {
  var m = String(dateStr || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  var t = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  var periods = _accPricing_().roomFeePeriods;
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    var fm = String(p.from).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!fm) continue;
    var fromMs = new Date(+fm[3], +fm[2] - 1, +fm[1]).getTime();
    var toMs = 8640000000000000;
    var tm = String(p.to || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (tm) toMs = new Date(+tm[3], +tm[2] - 1, +tm[1]).getTime();
    if (t >= fromMs && t <= toMs) return p.price;
  }
  return '';
}

// ---------- جلب حساب عميل كامل (بنود + دفعات + أنماط + تنبيهات المراجعة) ----------
function getClientAccount(authToken, client) {
  _accPerm_(authToken, 'view');
  client = String(client || '').trim();
  if (!client) throw new Error('اسم العميل مطلوب');

  var stats = getClientTripStats(authToken, client); // رحلات العميل وأعداده الحالية

  var items = [];
  var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  if (iSh.getLastRow() >= 2) {
    iSh.getRange(2, 1, iSh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues().forEach(function(r) {
      if (String(r[1] || '').trim() !== client) return;
      items.push({ id: String(r[0]), trip: String(r[2] || ''), desc: String(r[3] || ''), cat: String(r[4] || ''),
        currency: String(r[5] || 'EGP'), count: _accNum_(r[6]), price: _accNum_(r[7]), value: _accNum_(r[8]),
        isDiscount: String(r[9]) === 'نعم', notes: String(r[10] || ''),
        nights: _accNum_(r[15]), company: String(r[16] || ''), auto: String(r[17] || ''), order: _accNum_(r[18]),
        isDirect: String(r[19]) === 'نعم' });
    });
    // 🔀 (V4.26) ترتيب عرض البنود حسب الترتيب المحفوظ (السحب والإفلات) — تعادل الترتيب يحافظ على تسلسل القراءة الأصلي
    items.sort(function(a, b) { return a.order - b.order; });
  }

  var payments = [];
  var pSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (pSh.getLastRow() >= 2) {
    pSh.getRange(2, 1, pSh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues().forEach(function(r) {
      if (String(r[1] || '').trim() !== client) return;
      payments.push({ id: String(r[0]), trip: String(r[2] || ''), ptype: String(r[3] || 'دفعة'),
        date: (r[4] instanceof Date) ? Utilities.formatDate(r[4], Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(r[4] || ''),
        amount: _accNum_(r[5]), currency: String(r[6] || 'EGP'), rate: _accNum_(r[7]), desc: String(r[8] || ''),
        serial: r[11] || '' });
    });
  }

  var meta = {};
  var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  if (mSh.getLastRow() >= 2) {
    mSh.getRange(2, 1, mSh.getLastRow() - 1, ACC_META_HEADERS.length).getValues().forEach(function(r, i) {
      if (String(r[0] || '').trim() !== client) return;
      meta[String(r[1] || '')] = { mode: String(r[2] || 'برنامج'), snapshot: String(r[3] || ''), readHash: String(r[4] || ''), displayName: String(r[7] || ''), rowNum: i + 2 };
    });
  }

  // ⚠️ (V4.33) تنبيهات المراجعة: تغيّرت أعداد الرحلة أو تسكينها/فنادقها عن لقطة الحساب المحفوظة (ولم يُعلَّم التغيير كمقروء)
  var alerts = {};
  stats.rows.forEach(function(row) {
    var m = meta[row.trip];
    if (!m || !m.snapshot) return;
    var old = null;
    try { old = JSON.parse(m.snapshot); } catch (e) { old = null; }
    // 🔁 (V4.38) لقطة قديمة بصيغة ما قبل تتبّع التسكين/الفنادق (بلا مفتاح hotels) — تُرقَّى بصمت لصيغتها
    // الحالية بلا تنبيه رجعي، وإلا كانت كل رحلة قديمة تظهر «متغيّرة» لمجرد ترقية صيغة اللقطة نفسها
    if (old && old.hotels === undefined) {
      var healedHash = _accStatsHash_(row);
      try { mSh.getRange(m.rowNum, 4).setValue(healedHash); } catch (eHeal) {}
      m.snapshot = healedHash;
      return;
    }
    var curHash = _accStatsHash_(row);
    if (m.snapshot !== curHash && m.readHash !== curHash) {
      var countsChanged = !old || old.a !== row.adults || old.c !== row.children || old.i !== row.infants;
      alerts[row.trip] = { old: old, cur: { a: row.adults, c: row.children, i: row.infants, t: row.total, hotels: row.hotels || {}, accom: row.accom || {} }, countsChanged: countsChanged };
    }
  });

  // ⚡ (V4.41) حالة الدمج المحفوظة تُدمَج بنفس استجابة تحميل الحساب — بلا أي طلب شبكة إضافي لاحقًا،
  // فتظهر شارة الدمج فورًا لحظة فتح شاشة الكشف الشامل بدل انتظار طلب منفصل (بطلب صريح)
  var mergeTrips = null;
  try { mergeTrips = getClientMergeGroup(authToken, client).trips; } catch (eMg) { mergeTrips = null; }

  return { success: true, client: client, trips: stats.rows, noTripCount: stats.noTripCount,
           items: items, payments: payments, meta: meta, alerts: alerts, mergeTrips: mergeTrips };
}

// 🕘 (V4.90) سجل تعديلات كامل لحساب عميل واحد — كل عمليات AuditLog التي مرجعها اسم هذا العميل
// (إضافة/تعديل/حذف بند أو دفعة، دمج/فك دمج، تغيير تسعير، تعليم تنبيه مقروء... كل شيء)، من أول
// إنشاء الحساب حتى آخر تعديل، بنفس صلاحية عرض شاشة حسابات العملاء — بلا حاجة لصلاحية سجل التعديلات
// العامة. نسخة مطابقة لمبدأ getTripChangeLog/getCateringContractHistory لكن على مستوى العميل.
function getClientAccountHistory(authToken, client) {
  _accPerm_(authToken, 'view');
  client = String(client || '').trim();
  if (!client) return [];
  var sheet = ensureAuditLogSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var result = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    if (String(r[3] || '').trim() !== client) continue;
    var ts = r[0];
    var tsStr = (ts instanceof Date)
      ? Utilities.formatDate(ts, Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm:ss')
      : String(ts || '-');
    result.push({
      timestamp: tsStr,
      username: String(r[1] || '-'),
      action: String(r[2] || '-'),
      field: String(r[4] || '-'),
      oldValue: r[5] === '' || r[5] === null || r[5] === undefined ? '-' : String(r[5]),
      newValue: r[6] === '' || r[6] === null || r[6] === undefined ? '-' : String(r[6])
    });
  }
  return result;
}

// إنشاء/تحديث صف الميتا لرحلة (يُستدعى داخلياً عند أول حفظ) — يلتقط لقطة الأعداد وقتها
function _accEnsureMeta_(authToken, client, trip, username) {
  var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  var last = mSh.getLastRow();
  if (last >= 2) {
    var vals = mSh.getRange(2, 1, last - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === client && String(vals[i][1]).trim() === trip) return;
    }
  }
  var snap = '';
  try {
    var stats = getClientTripStats(authToken, client);
    var row = null;
    stats.rows.forEach(function(r) { if (r.trip === trip) row = r; });
    snap = _accStatsHash_(row);
  } catch (e) { snap = ''; }
  mSh.appendRow([client, trip, 'برنامج', snap, '', username, new Date()]);
}

// 🏷️ (V4.22) اسم عرض مخصَّص للرحلة داخل كشف حساب عميل معيَّن فقط — لا يمسّ اسم الرحلة الفعلي
// إطلاقًا (الربط الحقيقي يبقى بمعرّف/اسم الرحلة كما هو)؛ فارغ = رجوع للافتراضي «رحلة {تاريخ السفر}»
function setAccDisplayName(authToken, client, trip, displayName) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  displayName = String(displayName || '').trim();
  _accEnsureMeta_(authToken, client, trip, session.username);
  var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  var vals = mSh.getRange(2, 1, mSh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === client && String(vals[i][1]).trim() === trip) {
      mSh.getRange(i + 2, 8).setValue(displayName);
      mSh.getRange(i + 2, 6, 1, 2).setValues([[session.username, new Date()]]);
      logChange_(session.username, 'تغيير اسم عرض رحلة بحساب عميل', client, trip, '-', displayName || '(رجوع للافتراضي)');
      return { success: true, displayName: displayName };
    }
  }
  return { success: false, error: 'تعذر الوصول لبيانات الحساب' };
}

function setAccMode(authToken, client, trip, mode) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  mode = (mode === 'بنود') ? 'بنود' : 'برنامج';
  _accEnsureMeta_(authToken, client, trip, session.username);
  var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  var vals = mSh.getRange(2, 1, mSh.getLastRow() - 1, ACC_META_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === client && String(vals[i][1]).trim() === trip) {
      var old = String(vals[i][2] || '');
      mSh.getRange(i + 2, 3).setValue(mode);
      mSh.getRange(i + 2, 6, 1, 2).setValues([[session.username, new Date()]]);
      logChange_(session.username, 'تغيير نمط حساب رحلة', client, trip, old, mode);
      return { success: true };
    }
  }
  return { success: false, error: 'تعذر الوصول لبيانات الحساب' };
}

// حل تنبيه المراجعة: 'apply' = راجعت وعدّلت — حدّث اللقطة | 'read' = علِّم كمقروء فقط
function accResolveAlert(authToken, client, trip, action) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  var stats = getClientTripStats(authToken, client);
  var row = null;
  stats.rows.forEach(function(r) { if (r.trip === trip) row = r; });
  var curHash = _accStatsHash_(row);
  var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  var vals = mSh.getRange(2, 1, mSh.getLastRow() - 1, ACC_META_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === client && String(vals[i][1]).trim() === trip) {
      if (action === 'apply') {
        mSh.getRange(i + 2, 4).setValue(curHash);
        mSh.getRange(i + 2, 5).setValue('');
        logChange_(session.username, 'اعتماد لقطة أعداد الحساب', client, trip, _accStatsHashLabel_(String(vals[i][3] || '')), _accStatsHashLabel_(curHash));
      } else {
        mSh.getRange(i + 2, 5).setValue(curHash);
        logChange_(session.username, 'تعليم تنبيه حساب كمقروء', client, trip, '-', _accStatsHashLabel_(curHash));
      }
      mSh.getRange(i + 2, 6, 1, 2).setValues([[session.username, new Date()]]);
      return { success: true };
    }
  }
  return { success: false, error: 'لا يوجد حساب محفوظ لهذه الرحلة بعد' };
}

// ---------- بنود الحساب ----------
function saveAccItem(authToken, item) {
  var session = _accPerm_(authToken, item && item.id ? 'edit' : 'add');
  var client = String(item.client || '').trim(), trip = String(item.trip || '').trim();
  if (!client || !trip) return { success: false, error: 'العميل والرحلة مطلوبان' };
  if (!String(item.desc || '').trim()) return { success: false, error: 'البيان مطلوب' };
  var count = _accNum_(item.count), price = _accNum_(item.price), nights = _accNum_(item.nights);
  // 🏨 بنود السكن: القيمة = عدد الغرف × الليالي × سعر الغرفة/الليلة — وبقية البنود: عدد × سعر
  var value = Math.round(count * price * (nights > 0 ? nights : 1) * 100) / 100;
  var currency = (item.currency === 'SAR') ? 'SAR' : 'EGP';
  var isDisc = item.isDiscount === true || item.cat === 'خصم';
  // 🔢 (V4.42) قيمة مباشرة: تُحفَظ كعلَم مستقل — بطلب صريح لإخفاء عمودي العدد/السعر بالعرض والطباعة لاحقًا
  var isDirect = item.isDirect === true;
  var sh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  var now = new Date();
  if (item.id) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === String(item.id)) {
        // 🔒 احترام التعديل اليدوي: لو البند مولَّد تلقائياً من تسعير الرحلة وتغيّرت قيمه فعلاً،
        // يُعلَّم «معدّل» فلا يعيد محرك المزامنة حسابه أبداً بعد الآن
        var _r = vals[i];
        var _changed = String(_r[3]) !== String(item.desc) || _accNum_(_r[6]) !== count ||
                       _accNum_(_r[7]) !== price || String(_r[5] || 'EGP') !== currency ||
                       _accNum_(_r[15]) !== nights;
        if (String(_r[17]) === 'نعم' && _changed) sh.getRange(i + 2, 18).setValue('معدّل');
        // 🔁 حافظ على علامة ربط ترحيل الرصيد ⟦cf:...⟧ إن وُجدت بالبيان الأصلي حتى لو عُدِّل البيان الظاهر
        var _oldD = String(_r[3] || ''); var _cfM = _oldD.match(/⟦cf:[a-z0-9]+⟧/i);
        var _newD = String(item.desc || '');
        if (_cfM && _newD.indexOf('⟦cf:') === -1) _newD += ' ' + _cfM[0];
        sh.getRange(i + 2, 4, 1, 8).setValues([[_newD, item.cat || '', currency, count, price, value, isDisc ? 'نعم' : 'لا', item.notes || '']]);
        sh.getRange(i + 2, 14, 1, 4).setValues([[session.username, now, nights || '', item.company || '']]);
        sh.getRange(i + 2, 20).setValue(isDirect ? 'نعم' : 'لا');
        // 🕘 (V4.90) القيمة القديمة الحقيقية بدل «-» — لسجل تعديلات شاشة حسابات العملاء
        // 🧹 (V4.92) بلا علامة ربط ترحيل الرصيد الداخلية ⟦cf:...⟧ — تبقى محفوظة بالبيان الفعلي أعلاه فقط
        var _oldCur = String(_r[5] || 'EGP') === 'SAR' ? 'ريال' : 'جنيه';
        logChange_(session.username, 'تعديل بند حساب', client, trip,
          _oldD.replace(/\s*⟦cf:[a-z0-9]+⟧\s*$/i, '') + ' = ' + (_accNum_(_r[8]) || 0) + ' ' + _oldCur,
          item.desc + ' = ' + value + ' ' + currency);
        return { success: true, id: item.id, value: value };
      }
    }
    return { success: false, error: 'البند غير موجود' };
  }
  var id = _accId_('I');
  sh.appendRow([id, client, trip, item.desc, item.cat || '', currency, count, price, value, isDisc ? 'نعم' : 'لا', item.notes || '', session.username, now, '', '', nights || '', item.company || '', '', '', isDirect ? 'نعم' : 'لا']);
  _accEnsureMeta_(authToken, client, trip, session.username);
  logChange_(session.username, 'إضافة بند حساب', client, trip, '-', item.desc + ' = ' + value + ' ' + currency);
  return { success: true, id: id, value: value };
}

// حفظ دفعة واحدة من بنود مولّدة (🪄) — تُحفظ كلها في نداء واحد
// asAuto=true (توليد 🪄): تُعلَّم البنود ⚙️ 'نعم' فتدخل المزامنة التلقائية — الإضافة اليدوية تبقى بلا علامة
function saveAccItemsBulk(authToken, client, trip, itemsArr, asAuto) {
  var session = _accPerm_(authToken, 'add');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  if (!client || !trip || !Array.isArray(itemsArr) || !itemsArr.length) return { success: false, error: 'لا توجد بنود' };
  var sh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  var now = new Date(), rows = [], created = [], n = 0;
  itemsArr.forEach(function(item) {
    if (!String(item.desc || '').trim()) return;
    var count = _accNum_(item.count), price = _accNum_(item.price), nights = _accNum_(item.nights);
    var value = Math.round(count * price * (nights > 0 ? nights : 1) * 100) / 100;
    var currency = (item.currency === 'SAR') ? 'SAR' : 'EGP';
    var isDisc = item.cat === 'خصم';
    var newId = _accId_('I');
    rows.push([newId, client, trip, item.desc, item.cat || '', currency, count, price, value, isDisc ? 'نعم' : 'لا', item.notes || '', session.username, now, '', '', nights || '', item.company || '', (asAuto === true && !isDisc) ? 'نعم' : '', (item.order !== undefined && item.order !== null) ? item.order : '', item.isDirect === true ? 'نعم' : 'لا']);
    // 🚀 (V4.89) نُرجع id/value لكل بند جديد — يسمح للواجهة بتحديث محلي فوري بدل إعادة تحميل الحساب كاملاً
    created.push({ id: newId, value: value, isDiscount: isDisc });
    n++;
  });
  if (!rows.length) return { success: false, error: 'لا توجد بنود صالحة' };
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ACC_ITEMS_HEADERS.length).setValues(rows);
  _accEnsureMeta_(authToken, client, trip, session.username);
  logChange_(session.username, 'توليد بنود حساب', client, trip, '-', n + ' بند مولَّد');
  return { success: true, count: n, created: created };
}

// 🗑️ حذف مجموعة بنود دفعة واحدة (المحددة أو كل بنود رحلة)
function deleteAccItemsBulk(authToken, ids) {
  var session = _accPerm_(authToken, 'delete');
  if (!Array.isArray(ids) || !ids.length) return { success: false, error: 'لا توجد بنود محددة' };
  var idSet = {};
  ids.forEach(function(x) { idSet[String(x)] = true; });
  var sh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  if (sh.getLastRow() < 2) return { success: false, error: 'لا توجد بنود' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  var toDelete = [], client = '', trip = '';
  for (var i = 0; i < vals.length; i++) {
    if (idSet[String(vals[i][0])]) {
      toDelete.push(i + 2);
      client = String(vals[i][1] || client); trip = String(vals[i][2] || trip);
    }
  }
  if (!toDelete.length) return { success: false, error: 'البنود غير موجودة' };
  // الحذف من الأسفل للأعلى حتى لا تنزاح أرقام الصفوف
  for (var j = toDelete.length - 1; j >= 0; j--) sh.deleteRow(toDelete[j]);
  logChange_(session.username, 'حذف بنود حساب دفعة واحدة', client, trip, toDelete.length + ' بند', '-');
  return { success: true, count: toDelete.length };
}

// 🔁 (V4.18) ترحيل رصيد بين رحلتين — قيد مزدوج بعلامة رابطة مخفية ⟦cf:marker⟧ بآخر البيان:
// الطرفان يُحذفان معًا (حذف أي منهما يحذف الآخر تلقائيًا فيعود الرصيد لرحلته الأصلية)
function _accCfMarker_() { return 'cf' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
function _accCfMarkerOf_(desc) { var m = String(desc || '').match(/⟦cf:([a-z0-9]+)⟧/i); return m ? m[1] : null; }
function _accCfFindAndDelete_(marker, exceptSheetName, exceptId) {
  [[ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS, 3], [ACC_PAY_SHEET, ACC_PAY_HEADERS, 8]].forEach(function(cfg) {
    var sh = _accSheet_(cfg[0], cfg[1]);
    if (sh.getLastRow() < 2) return;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, cfg[1].length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var id = String(vals[i][0]);
      if (cfg[0] === exceptSheetName && id === exceptId) continue;
      if (_accCfMarkerOf_(vals[i][cfg[2]]) === marker) { sh.deleteRow(i + 2); break; }
    }
  });
}

function carryForwardTripBalance(authToken, client, fromTrip, toTrip) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim(); fromTrip = String(fromTrip || '').trim(); toTrip = String(toTrip || '').trim();
  if (!client || !fromTrip || !toTrip) return { success: false, error: 'بيانات ناقصة' };
  if (fromTrip === toTrip) return { success: false, error: 'اختر رحلتين مختلفتين' };
  var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  var pSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  // 🔁 (V4.45) يُبنى items/payments ثم يُمرَّر لـ_accCalc_ الموحَّدة — بدل تكرار حساب fx هنا يدويًا،
  // فيرث تلقائيًا حسم نوع قيد كل تحويل حسب حالة رصيد عملة مصدره لحظة إجرائه
  var items = [], pays = [];
  if (iSh.getLastRow() >= 2) {
    iSh.getRange(2, 1, iSh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues().forEach(function(r) {
      if (String(r[1] || '').trim() !== client || String(r[2] || '').trim() !== fromTrip) return;
      items.push({ value: _accNum_(r[8]), currency: String(r[5] || 'EGP'), isDiscount: String(r[9]) === 'نعم' });
    });
  }
  if (pSh.getLastRow() >= 2) {
    pSh.getRange(2, 1, pSh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues().forEach(function(r) {
      if (String(r[1] || '').trim() !== client || String(r[2] || '').trim() !== fromTrip) return;
      pays.push({ ptype: String(r[3] || 'دفعة'), date: String(r[4] || ''), amount: _accNum_(r[5]), currency: String(r[6] || 'EGP'), rate: _accNum_(r[7]) });
    });
  }
  var _tCarry = _accCalc_(items, pays);
  var netE = Math.round(_tCarry.netE * 100) / 100;
  var netS = Math.round(_tCarry.netS * 100) / 100;
  if (!netE && !netS) return { success: false, error: 'لا يوجد رصيد لترحيله من هذه الرحلة (مُقفلة أو بلا حساب)' };

  var now = new Date();
  var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  [['EGP', netE], ['SAR', netS]].forEach(function(cc) {
    var cur = cc[0], amt = cc[1];
    if (!amt) return;
    var marker = _accCfMarker_();
    if (amt > 0) {
      // fromTrip مدين (مستحق عليه) → دفعة تُسدِّده بـfromTrip + بند يضيف نفس المبلغ دَينًا بـtoTrip
      pSh.appendRow([_accId_('P'), client, fromTrip, 'دفعة', nowStr, amt, cur, '', 'رصيد مرحّل إلى رحلة ' + toTrip + ' ⟦cf:' + marker + '⟧', session.username, now]);
      iSh.appendRow([_accId_('I'), client, toTrip, 'رصيد مرحّل من رحلة ' + fromTrip + ' ⟦cf:' + marker + '⟧', 'أخرى', cur, 1, amt, amt, 'لا', '', session.username, now, '', '', '', '', '']);
    } else {
      var a = -amt;
      // fromTrip دائن (فائض مدفوعات) → بند يمتص الفائض بـfromTrip + دفعة تُخفِّض مستحق toTrip بنفس المبلغ
      iSh.appendRow([_accId_('I'), client, fromTrip, 'ترحيل رصيد إلى رحلة ' + toTrip + ' ⟦cf:' + marker + '⟧', 'أخرى', cur, 1, a, a, 'لا', '', session.username, now, '', '', '', '', '']);
      pSh.appendRow([_accId_('P'), client, toTrip, 'دفعة', nowStr, a, cur, '', 'رصيد مرحّل من رحلة ' + fromTrip + ' ⟦cf:' + marker + '⟧', session.username, now]);
    }
  });
  _accEnsureMeta_(authToken, client, fromTrip, session.username);
  _accEnsureMeta_(authToken, client, toTrip, session.username);
  logChange_(session.username, 'ترحيل رصيد بين رحلتين', client, fromTrip + ' → ' + toTrip, '-', 'جنيه ' + netE + ' / ريال ' + netS);
  return { success: true, netE: netE, netS: netS };
}

function deleteAccItem(authToken, id) {
  var session = _accPerm_(authToken, 'delete');
  var sh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      logChange_(session.username, 'حذف بند حساب', String(vals[i][1]), String(vals[i][2]),
        String(vals[i][3]).replace(/\s*⟦cf:[a-z0-9]+⟧\s*$/i, '') + ' = ' + vals[i][8] + ' ' + vals[i][5], '-');
      // 🔁 بند ترحيل رصيد: يُحذف طرفه المقابل معه تلقائيًا فيعود الرصيد لرحلته الأصلية
      var marker = _accCfMarkerOf_(vals[i][3]);
      sh.deleteRow(i + 2);
      if (marker) _accCfFindAndDelete_(marker, ACC_ITEMS_SHEET, String(id));
      return { success: true, cfLinked: !!marker };
    }
  }
  return { success: false, error: 'البند غير موجود' };
}

// ---------- الدفعات والتحويل ----------
// p.id (اختياري): تعديل دفعة موجودة بدل إضافة جديدة — يُبقي الرحلة وتاريخ الإنشاء الأصليين
function saveAccPayment(authToken, p) {
  var isEdit = !!(p && p.id);
  var session = _accPerm_(authToken, isEdit ? 'edit' : 'add');
  var client = String(p.client || '').trim(), trip = String(p.trip || '').trim();
  if (!client || !trip) return { success: false, error: 'العميل والرحلة مطلوبان' };
  var amount = _accNum_(p.amount);
  if (amount <= 0) return { success: false, error: 'المبلغ غير صالح' };
  var ptype = (p.ptype === 'تحويل') ? 'تحويل' : 'دفعة';
  // 🔁 (V4.42) تحويل بالاتجاهين — بطلب صريح: العملة المرسَلة من العميل تُحدِّد عملة المصدر (SAR الأصلي
  // أو EGP الجديد بالاتجاه العكسي)، بدل فرض SAR دائمًا كما كان سابقًا
  var currency = (p.currency === 'SAR') ? 'SAR' : 'EGP';
  var rate = _accNum_(p.rate);
  if (ptype === 'تحويل' && rate <= 0) return { success: false, error: 'سعر الصرف مطلوب للتحويل' };
  var desc = String(p.desc || '').trim();
  // 🖊️ (V4.44) البيان الافتراضي بطلب صريح: «قيمة تحويل 76495 ريال × 13.55 الى المعادل بالجنيه» (ريال←جنيه)
  // أو «قيمة تحويل 76745 جنيه / 13.55 الى المعادل بالريال» (جنيه←ريال — عامل قسمة بدل ضرب، مطابقًا للحساب
  // الفعلي)؛ المبلغ يُقرَّب لأقرب رقم صحيح (كبقية أرصدة الحسابات)، وسعر الصرف يبقى بدقته الأصلية
  if (ptype === 'تحويل' && !desc) {
    var srcTxt = currency === 'SAR' ? 'ريال' : 'جنيه', dstTxt = currency === 'SAR' ? 'جنيه' : 'ريال';
    var fxOp = currency === 'SAR' ? '×' : '/';
    desc = 'قيمة تحويل ' + Math.round(amount) + ' ' + srcTxt + ' ' + fxOp + ' ' + rate + ' الى المعادل بال' + dstTxt;
  }
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (isEdit) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === String(p.id)) {
        // 🔁 دفعة رصيد مرحّل: علامة الربط المخفية ⟦cf:...⟧ (تُنظَّف من العرض دائمًا) يجب أن تبقى بالشيت
        // حتى لو عُدِّل البيان الظاهر — وإلا ينكسر الحذف المزدوج المرتبط بها
        var oldDesc = String(vals[i][8] || '');
        var cfM = oldDesc.match(/⟦cf:[a-z0-9]+⟧/i);
        var newDesc = desc + (cfM && desc.indexOf('⟦cf:') === -1 ? ' ' + cfM[0] : '');
        // 🕘 (V4.90) القيمة القديمة الحقيقية بدل «-» — لسجل تعديلات شاشة حسابات العملاء
        var _oldAmt = _accNum_(vals[i][5]) || 0, _oldCurTxt = String(vals[i][6] || 'EGP') === 'SAR' ? 'ريال' : 'جنيه';
        sh.getRange(i + 2, 4, 1, 6).setValues([[ptype, String(p.date || ''), amount, currency, ptype === 'تحويل' ? rate : '', newDesc]]);
        logChange_(session.username, 'تعديل دفعة حساب', client, trip,
          _oldAmt + ' ' + _oldCurTxt + ' — ' + oldDesc.replace(/\s*⟦cf:[a-z0-9]+⟧\s*$/i, ''),
          amount + ' ' + currency + ' — ' + desc);
        return { success: true, id: p.id };
      }
    }
    return { success: false, error: 'الدفعة غير موجودة' };
  }
  var id = _accId_('P');
  var serial = _accNextPaySerial_();
  sh.appendRow([id, client, trip, ptype, String(p.date || ''), amount, currency, ptype === 'تحويل' ? rate : '', desc, session.username, new Date(), serial]);
  // 💠 (V4.13) الدفعة العامة (رحلة = «عام») لا تحتاج صف ميتا — الميتا للقطات أعداد الرحلات فقط
  if (trip !== 'عام') _accEnsureMeta_(authToken, client, trip, session.username);
  logChange_(session.username, ptype === 'تحويل' ? 'تحويل عملة بحساب' : 'تسجيل دفعة حساب', client, trip, '-',
    amount + ' ' + currency + (ptype === 'تحويل' ? ' × ' + rate + ' = ' + Math.round(amount * rate * 100) / 100 + ' ' + (currency === 'SAR' ? 'EGP' : 'SAR') : '') + ' — ' + desc);
  return { success: true, id: id, serial: serial };
}

// ✏️ (V4.20) تعديل دفعات رحلة كاملة دفعة واحدة (مثل تعديل البنود الجماعي)
function updateAccPaymentsBulk(authToken, client, trip, list) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (sh.getLastRow() < 2) return { success: false, error: 'لا توجد دفعات' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  var rowById = {};
  vals.forEach(function(r, i) { rowById[String(r[0])] = i + 2; });
  var n = 0;
  (list || []).forEach(function(p) {
    var rowIdx = rowById[String(p.id)];
    if (!rowIdx) return;
    var amount = _accNum_(p.amount);
    if (amount <= 0) return;
    var currency = (p.currency === 'SAR') ? 'SAR' : 'EGP';
    // 🔁 حافظ على علامة ربط ترحيل الرصيد ⟦cf:...⟧ إن وُجدت بالبيان الأصلي حتى لو عُدِّل البيان الظاهر
    var oldDesc2 = String(sh.getRange(rowIdx, 9).getValue() || '');
    var cfM2 = oldDesc2.match(/⟦cf:[a-z0-9]+⟧/i);
    var newDesc2 = String(p.desc || '').trim();
    if (cfM2 && newDesc2.indexOf('⟦cf:') === -1) newDesc2 += ' ' + cfM2[0];
    sh.getRange(rowIdx, 5, 1, 5).setValues([[String(p.date || ''), amount, currency, '', newDesc2]]);
    n++;
  });
  if (!n) return { success: false, error: 'لم تُعدَّل أي دفعة' };
  logChange_(session.username, 'تعديل دفعات حساب دفعة واحدة', client, trip, '-', n + ' دفعة');
  return { success: true, count: n };
}

// 💵 تسجيل دفعات متعددة دفعة واحدة (جدول: تاريخ/مبلغ/عملة/بيان لكل صف)
function saveAccPaymentsBulk(authToken, client, trip, list) {
  var session = _accPerm_(authToken, 'add');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  if (!client || !trip || !Array.isArray(list) || !list.length) return { success: false, error: 'لا توجد دفعات' };
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  var now = new Date(), rows = [], total = { EGP: 0, SAR: 0 };
  list.forEach(function(p) {
    var amount = _accNum_(p.amount);
    if (amount <= 0) return;
    var currency = (p.currency === 'SAR') ? 'SAR' : 'EGP';
    rows.push([_accId_('P'), client, trip, 'دفعة', String(p.date || ''), amount, currency, '', String(p.desc || '').trim(), session.username, now, _accNextPaySerial_()]);
    total[currency] += amount;
  });
  if (!rows.length) return { success: false, error: 'لا توجد دفعات صالحة (المبلغ مطلوب)' };
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ACC_PAY_HEADERS.length).setValues(rows);
  if (trip !== 'عام') _accEnsureMeta_(authToken, client, trip, session.username);
  logChange_(session.username, 'تسجيل دفعات متعددة', client, trip, '-',
    rows.length + ' دفعة (جنيه ' + total.EGP + ' / ريال ' + total.SAR + ')');
  return { success: true, count: rows.length };
}

// 💠 (V4.24) تسجيل دفعات عامة متعددة لعملاء مختلفين دفعة واحدة — كل صف بعميله الخاص (بحث تنبئي بالواجهة)
function saveGeneralPaymentsBulk(authToken, list) {
  var session = _accPerm_(authToken, 'add');
  if (!Array.isArray(list) || !list.length) return { success: false, error: 'لا توجد دفعات' };
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  var now = new Date(), rows = [], total = { EGP: 0, SAR: 0 }, byClient = {};
  list.forEach(function(p) {
    var client = String(p.client || '').trim();
    var amount = _accNum_(p.amount);
    if (!client || amount <= 0) return;
    var currency = (p.currency === 'SAR') ? 'SAR' : 'EGP';
    rows.push([_accId_('P'), client, 'عام', 'دفعة', String(p.date || ''), amount, currency, '', String(p.desc || '').trim(), session.username, now, _accNextPaySerial_()]);
    total[currency] += amount;
    byClient[client] = (byClient[client] || 0) + 1;
  });
  if (!rows.length) return { success: false, error: 'لا توجد دفعات صالحة (العميل والمبلغ مطلوبان بكل صف)' };
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ACC_PAY_HEADERS.length).setValues(rows);
  logChange_(session.username, 'تسجيل دفعات عامة متعددة العملاء', Object.keys(byClient).join('، '), 'عام', '-',
    rows.length + ' دفعة (جنيه ' + total.EGP + ' / ريال ' + total.SAR + ')');
  return { success: true, count: rows.length };
}

/**
 * 📋 (V4.24) سجل الدفعات العامة (غير المخصصة لرحلة) عبر كل العملاء — بفلاتر تاريخ/عميل/مبلغ
 * لعرضها ومراجعتها من شاشة واحدة بدل فتح كل حساب عميل على حدة.
 */
function getGeneralPayments(authToken, filters) {
  _accPerm_(authToken, 'view');
  filters = filters || {};
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (sh.getLastRow() < 2) return { success: true, payments: [] };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues();
  var fClient = String(filters.client || '').trim().toLowerCase();
  var fFrom = _dmyToDate_(filters.dateFrom), fTo = _dmyToDate_(filters.dateTo);
  var fMin = filters.amountMin !== undefined && filters.amountMin !== '' ? Number(filters.amountMin) : null;
  var fMax = filters.amountMax !== undefined && filters.amountMax !== '' ? Number(filters.amountMax) : null;
  var out = [];
  vals.forEach(function(r) {
    if (String(r[2] || '').trim() !== 'عام') return; // «عام» فقط — دفعات مخصصة لرحلة لها كشوفها الخاصة
    var client = String(r[1] || '');
    if (fClient && client.toLowerCase().indexOf(fClient) === -1) return;
    var d = _dmyToDate_(String(r[4] || ''));
    if (fFrom && (!d || d < fFrom)) return;
    if (fTo && (!d || d > fTo)) return;
    var amount = Number(r[5]) || 0;
    if (fMin !== null && amount < fMin) return;
    if (fMax !== null && amount > fMax) return;
    out.push({
      id: String(r[0] || ''), client: client, ptype: String(r[3] || ''), date: String(r[4] || ''),
      amount: amount, currency: String(r[6] || 'EGP'), desc: String(r[8] || ''), serial: r[11] || ''
    });
  });
  // 🔃 الأحدث أولاً (بترتيب الإدخال بالشيت — الأحدث في الأسفل)
  out.reverse();
  return { success: true, payments: out };
}

// 🔀 (V4.17) نقل دفعة لرحلة أخرى أو من/إلى «عام» — بلا حذف وإعادة إضافة (يحافظ على تاريخ الإنشاء الأصلي)
function transferAccPayment(authToken, id, toTrip) {
  var session = _accPerm_(authToken, 'edit');
  toTrip = String(toTrip || '').trim();
  if (!toTrip) return { success: false, error: 'حدّد الرحلة الهدف' };
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (sh.getLastRow() < 2) return { success: false, error: 'لا توجد دفعات' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      var client = String(vals[i][1] || ''), fromTrip = String(vals[i][2] || '');
      if (fromTrip === toTrip) return { success: false, error: 'الدفعة بالفعل بهذه الرحلة' };
      sh.getRange(i + 2, 3).setValue(toTrip);
      if (toTrip !== 'عام') _accEnsureMeta_(authToken, client, toTrip, session.username);
      logChange_(session.username, 'نقل دفعة بين رحلات', client, 'الدفعات',
        (fromTrip || 'عام'), toTrip);
      return { success: true };
    }
  }
  return { success: false, error: 'الدفعة غير موجودة' };
}

// 🔀 (V4.20) نقل دفعات متعددة دفعة واحدة لرحلة أخرى أو من/إلى «عام»
function transferAccPaymentsBulk(authToken, ids, toTrip) {
  var session = _accPerm_(authToken, 'edit');
  toTrip = String(toTrip || '').trim();
  if (!toTrip) return { success: false, error: 'حدّد الرحلة الهدف' };
  if (!Array.isArray(ids) || !ids.length) return { success: false, error: 'لا توجد دفعات محددة' };
  var idSet = {}; ids.forEach(function(x) { idSet[String(x)] = true; });
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (sh.getLastRow() < 2) return { success: false, error: 'لا توجد دفعات' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues();
  var n = 0, client = '';
  for (var i = 0; i < vals.length; i++) {
    if (!idSet[String(vals[i][0])]) continue;
    var fromTrip = String(vals[i][2] || '');
    if (fromTrip === toTrip) continue;
    client = String(vals[i][1] || client);
    sh.getRange(i + 2, 3).setValue(toTrip);
    n++;
  }
  if (!n) return { success: false, error: 'لا توجد دفعات صالحة للنقل (ربما بالفعل بهذه الرحلة)' };
  if (toTrip !== 'عام') _accEnsureMeta_(authToken, client, toTrip, session.username);
  logChange_(session.username, 'نقل دفعات متعددة بين رحلات', client, 'الدفعات', '-', n + ' دفعة → ' + toTrip);
  return { success: true, count: n };
}

function deleteAccPayment(authToken, id) {
  var session = _accPerm_(authToken, 'delete');
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      logChange_(session.username, 'حذف ' + (String(vals[i][3]) === 'تحويل' ? 'تحويل عملة' : 'دفعة حساب'), String(vals[i][1]), String(vals[i][2]), vals[i][5] + ' ' + vals[i][6], '-');
      // 🔁 دفعة ترحيل رصيد: يُحذف طرفها المقابل معها تلقائيًا فيعود الرصيد لرحلته الأصلية
      var marker = _accCfMarkerOf_(vals[i][8]);
      sh.deleteRow(i + 2);
      if (marker) _accCfFindAndDelete_(marker, ACC_PAY_SHEET, String(id));
      return { success: true, cfLinked: !!marker };
    }
  }
  return { success: false, error: 'السجل غير موجود' };
}

// 📊 تفصيلة معتمري العميل في الرحلة — بنفس مسميات كشف حساب الإكسل المعتمد:
// • غرفة مقفولة (طبيعة تسكين مسجَّلة): «برنامج {الفندق} {النوع}» — والطفل بسرير داخلها يُحسب بسريره ضمن العدد
// • كل ما عداها = «برنامج {الفندق} — تسكين عادي» بلا مسمى غرفة وبغض النظر عن توزيعة الغرف الفعلية
// • الأطفال بدون سرير سطر واحد مجمَّع «أطفال بدون سكن» — والرضع سطر «رضيع»
function _accClientBreakdown_(client, trip) {
  var out = [];
  var pSheet = _getPilgrimsSheet_();
  if (!pSheet || pSheet.getLastRow() < 2) return out;
  var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(C, PILGRIMS_COL_);
  var closed = {}, closedOrder = [];   // برنامج {فندق} {نوع الغرفة المقفولة}
  var normal = {}, normalOrder = [];   // برنامج {فندق} — تسكين عادي
  var childNoBed = 0, infants = 0;
  pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
    if (String(P(r, 'client') || '').trim() !== client) return;
    if (String(P(r, 'tripName') || '').trim() !== trip) return;
    if (!String(P(r, 'name') || '').trim()) return;
    var type = String(P(r, 'type') || '').trim();
    var acc = String(P(r, 'accommodation') || '').trim();
    var hotel = String(P(r, 'hotelMakkah') || '').trim() || String(P(r, 'hotelMadinah') || '').trim();
    if (type === 'رضيع') { infants++; return; }
    if (type === 'طفل' && !acc) { childNoBed++; return; }
    // 🛏️ (V4.05 — بطلب صريح) الرباعي والخماسي والسداسي بلا تفرقة = تسكين عادي للفندق نفسه؛
    // الغرف المقفولة المميزة بالتسعير هي سنجل/دابل/ثلاثي فقط
    if (['رباعي', 'خماسي', 'سداسي', 'رباعي أسرة', 'خماسي أسرة'].indexOf(acc) > -1) acc = '';
    // بالغ أو طفل بسرير: غرفة مقفولة لو له طبيعة تسكين، وإلا تسكين عادي
    if (acc) {
      var ck = hotel + '|' + acc;
      if (!(ck in closed)) { closed[ck] = 0; closedOrder.push(ck); }
      closed[ck]++;
    } else {
      if (!(hotel in normal)) { normal[hotel] = 0; normalOrder.push(hotel); }
      normal[hotel]++;
    }
  });
  closedOrder.sort();
  closedOrder.forEach(function(k) {
    var p = k.split('|');
    out.push({ desc: (p[0] ? 'برنامج ' + p[0] + ' - ' : 'غرفة ') + p[1], cat: 'كبير', count: closed[k], notes: '', hotel: p[0], acc: p[1] });
  });
  normalOrder.sort();
  normalOrder.forEach(function(h) {
    out.push({ desc: (h ? 'برنامج ' + h + ' - ' : '') + 'تسكين عادي', cat: 'كبير', count: normal[h], notes: '', hotel: h, acc: 'عادي' });
  });
  if (childNoBed) out.push({ desc: 'أطفال بدون سكن', cat: 'طفل بدون سرير', count: childNoBed, notes: '', hotel: '', acc: 'طفل' });
  if (infants) out.push({ desc: 'رضيع', cat: 'رضيع', count: infants, notes: '', hotel: '', acc: 'رضيع' });
  return out;
}

/* ============================================================
   💵 (V4.12) محرك تسعير الرحلة — أسعار بيع لكل مستوى برنامج (فندق) × طبيعة تسكين
   + سعر الطفل (بدون سكن) + سعر الرضيع لكل رحلة.
   «تطبيق» أول مرة ينشئ حسابات كل عملاء الرحلة، وبعدها كل حفظ للكشف يعيد
   مزامنة البنود التلقائية ('نعم') فقط — البنود المعدّلة يدوياً ('معدّل') تُحترم
   ولا تُلمس، والتنبيه يظهر عبر آلية لقطة الأعداد القائمة.
   ============================================================ */
function _accTripPricing_(trip) {
  var sh = _accSheet_(ACC_TRIP_PRICES_SHEET, ACC_TRIP_PRICES_HEADERS);
  if (sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === trip) {
      try { return JSON.parse(String(vals[i][1] || '')); } catch (e) { return null; }
    }
  }
  return null;
}

function getTripPricing(authToken, trip) {
  _pricingPerm_(authToken, 'view');
  trip = String(trip || '').trim();
  if (!trip) throw new Error('اسم الرحلة مطلوب');
  return { success: true, pricing: _accTripPricing_(trip) };
}

// سعر مجموعة تفصيلة واحدة حسب قائمة أسعار الرحلة — مفاتيح الفندق: سنجل/دابل/ثلاثي/عادي
function _accPriceFor_(pricing, g) {
  if (!pricing) return 0;
  if (g.acc === 'رضيع') return _accNum_(pricing.infant);
  if (g.acc === 'طفل') return _accNum_(pricing.child);
  var h = (pricing.hotels || {})[g.hotel || ''] || (g.hotel ? null : (pricing.hotels || {})['']);
  if (!h) return 0;
  return _accNum_(h[g.acc || 'عادي']);
}

// حفظ أسعار الرحلة (+ التطبيق الأول اختيارياً) — apply=true يفعّل المزامنة التلقائية الدائمة
function applyTripPricing(authToken, trip, pricing, apply) {
  var session = _pricingPerm_(authToken, 'edit');
  trip = String(trip || '').trim();
  if (!trip) throw new Error('اسم الرحلة مطلوب');
  var prev = _accTripPricing_(trip) || {};
  var clean = { hotels: {}, child: _accNum_(pricing && pricing.child), infant: _accNum_(pricing && pricing.infant),
                applied: !!prev.applied };
  var anyHotel = false;
  Object.keys((pricing && pricing.hotels) || {}).forEach(function(h) {
    var name = String(h || '').trim();
    var src = pricing.hotels[h] || {};
    var row = {};
    ['سنجل', 'دابل', 'ثلاثي', 'عادي'].forEach(function(k) { var v = _accNum_(src[k]); if (v) row[k] = v; });
    if (Object.keys(row).length) { clean.hotels[name] = row; anyHotel = true; }
  });
  if (!anyHotel && !clean.child && !clean.infant) return { success: false, error: 'أدخل سعراً واحداً على الأقل قبل الحفظ' };
  if (apply) clean.applied = true;

  var sh = _accSheet_(ACC_TRIP_PRICES_SHEET, ACC_TRIP_PRICES_HEADERS);
  var now = new Date(), found = false;
  if (sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === trip) {
        sh.getRange(i + 2, 2, 1, 3).setValues([[JSON.stringify(clean), session.username, now]]);
        found = true; break;
      }
    }
  }
  if (!found) sh.appendRow([trip, JSON.stringify(clean), session.username, now]);
  logChange_(session.username, 'حفظ تسعير رحلة', trip, 'ClientAccounts_TripPrices', '-',
    Object.keys(clean.hotels).length + ' مستوى، طفل ' + clean.child + '، رضيع ' + clean.infant + (clean.applied ? ' — مفعّل' : ''));

  var sync = null;
  if (clean.applied) sync = _syncTripAccounts_(authToken, trip, session.username);
  return { success: true, applied: clean.applied, sync: sync };
}

/* ---------- 🏷️ (V4.13) أسعار بنود العميل بفترات سريان (نمط «بنود») ---------- */
function _accClientPricing_(client) {
  var sh = _accSheet_(ACC_CLIENT_PRICES_SHEET, ACC_CLIENT_PRICES_HEADERS);
  if (sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === client) {
      try { return JSON.parse(String(vals[i][1] || '')); } catch (e) { return null; }
    }
  }
  return null;
}

function getClientPricing(authToken, client) {
  _accPerm_(authToken, 'view');
  client = String(client || '').trim();
  if (!client) throw new Error('اسم العميل مطلوب');
  return { success: true, pricing: _accClientPricing_(client), baseItems: ACC_BOND_BASE_ };
}

function saveClientPricing(authToken, client, pricing) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim();
  if (!client) throw new Error('اسم العميل مطلوب');
  var clean = { items: {} };
  var nItems = 0, nPeriods = 0;
  var dOk = function(s) { return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(s || '').trim()); };
  Object.keys((pricing && pricing.items) || {}).forEach(function(k) {
    var key = String(k || '').trim();
    if (!key) return;
    var src = pricing.items[k] || {};
    var periods = [];
    (src.periods || []).forEach(function(p) {
      var price = _accNum_(p.price);
      var from = String(p.from || '').trim(), to = String(p.to || '').trim();
      if (!price || !dOk(from)) return;
      if (to && !dOk(to)) to = '';
      periods.push({ price: price, from: from, to: to }); // to فارغة = مثبت حتى إشعار آخر
    });
    if (!periods.length) return;
    clean.items[key] = { currency: (src.currency === 'SAR') ? 'SAR' : 'EGP', periods: periods };
    nItems++; nPeriods += periods.length;
  });
  var sh = _accSheet_(ACC_CLIENT_PRICES_SHEET, ACC_CLIENT_PRICES_HEADERS);
  var now = new Date(), found = false;
  if (sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === client) {
        sh.getRange(i + 2, 2, 1, 3).setValues([[JSON.stringify(clean), session.username, now]]);
        found = true; break;
      }
    }
  }
  if (!found) sh.appendRow([client, JSON.stringify(clean), session.username, now]);
  logChange_(session.username, 'حفظ تسعير بنود عميل', client, 'ClientAccounts_ClientPrices', '-',
    nItems + ' بند / ' + nPeriods + ' فترة سعر');
  return { success: true, itemsCount: nItems };
}

// السعر الساري لبند عميل في تاريخ (dd/mm/yyyy) — null لو لا سعر مثبتًا يشمل التاريخ
function _accClientPriceAt_(pricing, key, dateStr) {
  if (!pricing || !pricing.items || !pricing.items[key]) return null;
  var m = String(dateStr || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  var t = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  var periods = pricing.items[key].periods || [];
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    var fm = String(p.from).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!fm) continue;
    var fromMs = new Date(+fm[3], +fm[2] - 1, +fm[1]).getTime();
    var toMs = 8640000000000000;
    var tm = String(p.to || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (tm) toMs = new Date(+tm[3], +tm[2] - 1, +tm[1]).getTime();
    if (t >= fromMs && t <= toMs) return _accNum_(p.price);
  }
  return null;
}

/* 🛂 (V4.134) مجموعات التأشيرات المسجَّلة لهذا العميل في هذه الرحلة — عددُ أفراده فيها
   وبيانٌ يذكر أرقام المجموعات ووكلاءها. تُستخدَم لبند «تأشيرات» بنمط «بنود». */
function _accVisaGroupsFor_(client, trip) {
  client = String(client || '').trim(); trip = String(trip || '').trim();
  var out = { count: 0, desc: '', refs: [], agents: [] };
  if (!client) return out;
  var files = [];
  try { files = _vzReadAll_(); } catch (e) { return out; }
  files.forEach(function (f) {
    if (trip && String(f.tripName || '').trim() !== trip) return;
    var n = 0;
    (f.breakdown || []).forEach(function (b) { if (String(b.name || '').trim() === client) n += _mfNum_(b.count); });
    if (!n) return;
    out.count += n;
    if (f.ref && out.refs.indexOf(f.ref) < 0) out.refs.push(f.ref);
    if (f.agent && out.agents.indexOf(f.agent) < 0) out.agents.push(f.agent);
  });
  if (!out.count) return out;
  out.desc = 'تأشيرات' + (out.refs.length ? ' — مجموعة ' + out.refs.join('، ') : '') +
    (out.agents.length ? ' (الوكيل: ' + out.agents.join('، ') + ')' : '');
  return out;
}

// مفتاح المطابقة الموحّد لبند «بنود»: البيانات الديناميكية (تذاكر بخط السير، سكن بالفندق) تُرجَع لمفتاحها الثابت
function _accBondKey_(desc) {
  desc = String(desc || '').trim();
  for (var i = 0; i < ACC_BOND_BASE_.length; i++) if (desc === ACC_BOND_BASE_[i].key) return desc;
  if (desc.indexOf('تأشيرات') === 0) return 'تأشيرات';   // 🛂 (V4.134) «تأشيرات — مجموعة … (الوكيل …)»
  if (desc.indexOf('تذاكر الأطفال') === 0) return 'تذاكر الأطفال';
  if (desc.indexOf('تذاكر الرضع') === 0) return 'تذاكر الرضع';
  if (desc.indexOf('تذاكر') === 0) return 'تذاكر';
  if (desc.indexOf('سكن المدينة') === 0) return 'سكن المدينة';
  if (desc.indexOf('سكن مكة') === 0) return 'سكن مكة';
  return desc; // البنود المخصصة تُطابَق ببيانها الكامل
}

// 📐 البنود المطلوبة لعميل×رحلة بنمط «بنود» (نفس أسطر التوليد) مع الأسعار السارية بتاريخ سفر الرحلة
// price=null يعني «لا سعر مثبتًا لهذا البند» — المزامنة تُبقي السعر الموجود بالصف كما هو
function _accBondsDesired_(authToken, client, trip) {
  var stats = getClientTripStats(authToken, client);
  var row = null;
  stats.rows.forEach(function(r) { if (r.trip === trip) row = r; });
  if (!row) return null;
  var cp = _accClientPricing_(client);
  var cfg = _accPricing_();
  var roomFee = _accRoomFeeAt_(row.departDate);
  var hz = _accClientHousing_(client, trip);
  var cpAt = function(key) { return _accClientPriceAt_(cp, key, row.departDate); };
  var lines = [];
  var push = function(key, desc, cat, currency, count, nights, company, fallback) {
    var p = cpAt(key);
    lines.push({ key: key, desc: desc, cat: cat, currency: currency, count: count,
      nights: nights || 0, company: company || '',
      price: (p !== null) ? p : null, fallback: fallback || 0 });
  };
  push('رسوم غرفة', 'رسوم غرفة', 'كبير', 'EGP', row.adults + row.children, 0, row.company || '', roomFee || 0);
  push('رسوم غرفة المشرف', 'رسوم غرفة المشرف', 'مشرف', 'EGP', 1, 0, row.company || '', cfg.supRoomFee || 200);
  push('إشراف', 'إشراف', 'كبير', 'EGP', row.adults + row.children, 0, '', 0);
  var tkRoute = (hz.arrRoute || '') + (hz.depRoute ? ' - ' + hz.depRoute : '');
  var tkDesc = tkRoute ? ('تذاكر ' + (hz.airline ? hz.airline + ' ' : '') + tkRoute) : 'تذاكر طيران';
  if (row.adults) push('تذاكر', tkDesc, 'كبير', 'EGP', row.adults, 0, '', 0);
  if (row.children) push('تذاكر الأطفال', 'تذاكر الأطفال', 'طفل بسرير', 'EGP', row.children, 0, '', 0);
  if (row.infants) push('تذاكر الرضع', 'تذاكر الرضع', 'رضيع', 'EGP', row.infants, 0, '', 0);
  // 🛂 (V4.134) لو العميل له أفراد في مجموعات تأشيرات مسجَّلة بهذه الرحلة، يظهر بند «تأشيرات»
  // بعدد أفراده في تلك المجموعات وبيانها يذكر رقم المجموعة والوكيل — أما سعر البيع فيبقى
  // من تسعير بنود العميل أو يدوياً من داخل حساب العميل (لا علاقة له بسعر الوكيل إطلاقاً).
  var vz = _accVisaGroupsFor_(client, trip);
  push('تأشيرات', vz.desc || 'تأشيرات', 'كبير', 'SAR', vz.count || row.total, 0, '', 0);
  push('نقل سعودي', 'نقل سعودي', 'أخرى', 'SAR', 1, 0, '', 0);
  // 🏨 (V4.39) فترة الإقامة (دخول/خروج) تُكتب جنب اسم الفندق بطلب صريح، مثال: «ديوان المدينة من 1-8 الى 4-8»
  var madSuffix = hz.madHotel ? (' - ' + hz.madHotel + _accStayRange_(hz.madCheckIn, hz.madCheckOut)) : '';
  var makSuffix = hz.makHotel ? (' - ' + hz.makHotel + _accStayRange_(hz.makCheckIn, hz.makCheckOut)) : '';
  push('سكن المدينة', 'سكن المدينة' + madSuffix, 'أخرى', 'SAR', hz.madRooms, hz.madNights, '', 0);
  push('سكن مكة', 'سكن مكة' + makSuffix, 'أخرى', 'SAR', hz.makRooms, hz.makNights, '', 0);
  push('بدلات المشرف', 'بدلات المشرف', 'مشرف', 'SAR', 1, 0, '', 0);
  // 🧾 (V4.39) بنود شركة/ضرائب لكل معتمر بالجنيه، والإعاشة لكل معتمر بالريال — بطلب صريح
  push('شركة', 'شركة', 'كبير', 'EGP', row.total, 0, '', 0);
  push('ضرائب', 'ضرائب', 'كبير', 'EGP', row.total, 0, '', 0);
  push('الإعاشة', 'الإعاشة', 'كبير', 'SAR', row.total, 0, '', 0);
  // 🧩 البنود المخصصة المسعّرة للعميل وغير المغطاة بالأساسية — تُدرج بعدد 1 بسعرها الساري
  if (cp && cp.items) {
    var baseKeys = {};
    lines.forEach(function(l) { baseKeys[l.key] = 1; });
    Object.keys(cp.items).forEach(function(k) {
      if (baseKeys[k]) return;
      var p = cpAt(k);
      if (p === null) return; // لا فترة سارية بتاريخ الرحلة
      lines.push({ key: k, desc: k, cat: 'أخرى', currency: (cp.items[k].currency === 'SAR') ? 'SAR' : 'EGP',
        count: 1, nights: 0, company: '', price: p, fallback: 0 });
    });
  }
  return { row: row, lines: lines, hasPricing: !!(cp && cp.items && Object.keys(cp.items).length) };
}

// 🔄 مزامنة حسابات كل عملاء الرحلة مع الكشف الحالي وقائمة الأسعار:
// يُنشئ البنود الناقصة ويحدّث التلقائية ('نعم') ويحذف اليتيمة منها — ولا يقترب من 'معدّل' أو اليدوية
function _syncTripAccounts_(authToken, trip, username) {
  // ⚡ (V4.53) إعادة كتابة كاملة لتفادي البطء الشديد (+4 دقائق سابقًا): كل الكتابات كانت خلية-بخلية
  // داخل حلقات (setValues لكل بند مُحدَّث، deleteRow لكل بند محذوف، ونداءات getClientTripStats
  // ثم قراءات ميتا لكل عميل على حدة). الحل: قراءة كل شيء دفعة واحدة، تعديل بالذاكرة، ثم كتابة واحدة.
  var tripPricing = _accTripPricing_(trip);
  var tripApplied = !!(tripPricing && tripPricing.applied);

  var pSheet = _getPilgrimsSheet_();
  if (!pSheet || pSheet.getLastRow() < 2) return { skipped: true };
  var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(C, PILGRIMS_COL_);
  // ⚡ قراءة كشف المعتمرين مرة واحدة — بيُستخدَم لتجميع كل الأعداد لكل عميل بلا استعلامات متكررة
  var pRowsAll = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues();

  var clients = {}, clientOrder = [];
  pRowsAll.forEach(function(r) {
    if (String(P(r, 'tripName') || '').trim() !== trip) return;
    var cl = String(P(r, 'client') || '').trim();
    if (!cl || cl.indexOf('المشرف') === 0) return;
    if (!(cl in clients)) { clients[cl] = true; clientOrder.push(cl); }
  });

  // نمط حساب كل (عميل × هذه الرحلة) من الميتا — الافتراضي «برنامج»
  var mShR = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
  var metaVals = mShR.getLastRow() >= 2 ? mShR.getRange(2, 1, mShR.getLastRow() - 1, ACC_META_HEADERS.length).getValues() : [];
  var modeOf = {};
  metaVals.forEach(function(r) {
    if (String(r[1] || '').trim() === trip) modeOf[String(r[0] || '').trim()] = String(r[2] || 'برنامج');
  });

  var sh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  var itemVals = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues() : [];
  var now = new Date();
  var newRows = [], toDelete = {}, updatedRows = {}, created = 0, updated = 0, removed = 0;
  // ⚡ حالة لقطة الأعداد بعد المزامنة — تُحسَب من الذاكرة (بلا نداءات getClientTripStats إضافية)
  var statsHashByClient = {}, hasManualByClient = {};

  // ⚡ فهرس صفوف البنود حسب (client|trip) — يمنع O(N × clients) في كل بحث
  var idxByClient = {};
  itemVals.forEach(function(r, i) {
    var k = String(r[1] || '').trim() + '|' + String(r[2] || '').trim();
    (idxByClient[k] = idxByClient[k] || []).push(i);
  });

  clientOrder.forEach(function(client) {
    var mode = modeOf[client] || 'برنامج';
    var hasManual = false, synced = false;
    var idxs = idxByClient[client + '|' + trip] || [];

    if (mode !== 'بنود' && tripApplied) {
      synced = true;
      var breakdown = _accClientBreakdown_(client, trip);
      var desired = {}, order = [];
      breakdown.forEach(function(g) {
        desired[g.desc] = { count: g.count, price: _accPriceFor_(tripPricing, g), cat: g.cat, done: false };
        order.push(g.desc);
      });
      idxs.forEach(function(i) {
        var r = itemVals[i];
        var desc = String(r[3] || ''), flag = String(r[17] || '');
        if (flag === 'معدّل') hasManual = true;
        if (flag === 'نعم') {
          var d = desired[desc];
          if (d) {
            d.done = true;
            if (_accNum_(r[6]) !== d.count || _accNum_(r[7]) !== d.price) {
              var value = Math.round(d.count * d.price * 100) / 100;
              r[6] = d.count; r[7] = d.price; r[8] = value;
              r[13] = username; r[14] = now;
              updatedRows[i] = true; updated++;
            }
          } else { toDelete[i] = true; removed++; }
        } else if (desired[desc]) {
          desired[desc].done = true;
        }
      });
      order.forEach(function(desc) {
        var d = desired[desc];
        if (d.done) return;
        var value = Math.round(d.count * d.price * 100) / 100;
        newRows.push([_accId_('I'), client, trip, desc, d.cat, 'EGP', d.count, d.price, value, 'لا', '', username, now, '', '', '', '', 'نعم', '', 'لا']);
        created++;
      });
    } else if (mode === 'بنود') {
      var hasAuto = idxs.some(function(i) { return String(itemVals[i][17] || '') === 'نعم'; });
      if (!hasAuto) return;
      var bonds = null;
      try { bonds = _accBondsDesired_(authToken, client, trip); } catch (eB) { bonds = null; }
      if (!bonds) return;
      synced = true;
      var desiredK = {}, orderK = [];
      bonds.lines.forEach(function(l) {
        if (l.count > 0 && !(l.key in desiredK)) { desiredK[l.key] = l; orderK.push(l.key); }
      });
      idxs.forEach(function(i) {
        var r = itemVals[i];
        var flag = String(r[17] || '');
        if (flag === 'معدّل') hasManual = true;
        var key = _accBondKey_(String(r[3] || ''));
        var l = desiredK[key];
        if (flag === 'نعم') {
          if (l && !l.done) {
            l.done = true;
            var nPrice = (l.price !== null) ? l.price : _accNum_(r[7]);
            var nVal = Math.round(l.count * nPrice * (l.nights > 0 ? l.nights : 1) * 100) / 100;
            var changed = _accNum_(r[6]) !== l.count || _accNum_(r[7]) !== nPrice ||
                          _accNum_(r[15]) !== (l.nights || 0) || String(r[3]) !== l.desc;
            if (changed) {
              r[3] = l.desc; r[6] = l.count; r[7] = nPrice; r[8] = nVal;
              r[13] = username; r[14] = now; r[15] = l.nights || '';
              updatedRows[i] = true; updated++;
            }
          } else if (!l) { toDelete[i] = true; removed++; }
        } else if (l) {
          l.done = true;
        }
      });
      orderK.forEach(function(key) {
        var l = desiredK[key];
        if (l.done) return;
        var price = (l.price !== null) ? l.price : l.fallback;
        var value = Math.round(l.count * price * (l.nights > 0 ? l.nights : 1) * 100) / 100;
        newRows.push([_accId_('I'), client, trip, l.desc, l.cat, l.currency, l.count, price, value, 'لا', '', username, now, '', '', l.nights || '', l.company || '', 'نعم', '', 'لا']);
        created++;
      });
    } else {
      return;
    }
    if (!synced) return;
    hasManualByClient[client] = hasManual;
  });

  // ⚡ (V4.53) بدل مسح صفوف بـ deleteRow (كل نداء يعيد ترقيم الشيت) + append منفصل =
  // نعيد كتابة قسم البيانات مرة واحدة كاملاً: (الصفوف الباقية بعد الحذف + الصفوف الجديدة)
  var hadChanges = newRows.length || Object.keys(toDelete).length || Object.keys(updatedRows).length;
  if (hadChanges) {
    var kept = [];
    itemVals.forEach(function(r, i) { if (!toDelete[i]) kept.push(r); });
    var finalRows = kept.concat(newRows);
    // امسح النطاق القديم ثم اكتب النطاق الجديد بنداء setValues واحد
    var oldRows = itemVals.length;
    if (oldRows > 0) sh.getRange(2, 1, oldRows, ACC_ITEMS_HEADERS.length).clearContent();
    if (finalRows.length) {
      sh.getRange(2, 1, finalRows.length, ACC_ITEMS_HEADERS.length).setValues(finalRows);
    }
  }

  // ⚡ (V4.53) لقطة الأعداد لكل العملاء المزامنَين — نحسبها في نداء واحد لـgetClientTripStats
  // للرحلة كلها بدل نداء منفصل لكل عميل (كانت تُقرأ كل الشيتات عشرات المرات)
  var updatedClients = Object.keys(hasManualByClient);
  if (updatedClients.length) {
    var statsByRowClient = {};
    try {
      // نبني إحصائيات كل الرحلة دفعة واحدة من pRowsAll — نفس منطق getClientTripStats مبسَّط
      var HOUSING_CAPACITY_LOCAL = { 'سنجل': 1, 'دابل': 2, 'ثلاثي': 3, 'رباعي': 4, 'رباعي أسرة': 4, 'خماسي': 5, 'خماسي أسرة': 5, 'سداسي': 6 };
      var perClient = {};
      pRowsAll.forEach(function(r) {
        if (String(P(r, 'tripName') || '').trim() !== trip) return;
        var cl = String(P(r, 'client') || '').trim();
        if (!cl || cl.indexOf('المشرف') === 0) return;
        var type = String(P(r, 'type') || '').trim();
        var acc = perClient[cl] = perClient[cl] || { adults: 0, children: 0, infants: 0 };
        if (type === 'طفل') acc.children++;
        else if (type === 'رضيع') acc.infants++;
        else acc.adults++;
      });
      updatedClients.forEach(function(cl) {
        var a = perClient[cl] || { adults: 0, children: 0, infants: 0 };
        // نمط توقيع خفيف كافٍ لكشف تغيّر الأعداد (نفس فكرة _accStatsHash_ الحالية على مستوى الأعداد)
        statsByRowClient[cl] = String(a.adults) + '/' + String(a.children) + '/' + String(a.infants);
      });
    } catch (eSt) { Logger.log('bulk stats build failed: ' + eSt); }

    // ⚡ حدّث ميتا الأعداد لكل العملاء دفعة واحدة (بدل بحث + setValues لكل عميل)
    var metaByKey = {};
    metaVals.forEach(function(r, i) {
      var k = String(r[0] || '').trim() + '|' + String(r[1] || '').trim();
      metaByKey[k] = i;
    });
    var metaWrites = []; // {rowIdx, hash}
    updatedClients.forEach(function(cl) {
      if (hasManualByClient[cl]) return; // مع بنود يدوية — لا نلمس اللقطة (يظهر تنبيه المراجعة)
      var mi = metaByKey[cl + '|' + trip];
      if (mi !== undefined && cl in statsByRowClient) metaWrites.push({ i: mi, hash: statsByRowClient[cl] });
      // ملاحظة: _accEnsureMeta_ يبقى بالنداء العادي لضمان وجود صف الميتا لمن لم يكن له صف
      try { _accEnsureMeta_(authToken, cl, trip, username); } catch (_eM) {}
    });
    if (metaWrites.length) {
      // إعادة قراءة الميتا (قد تكون _accEnsureMeta_ أضافت صفوفًا جديدة)، ثم كتابة اللقطات فيها
      var metaNow = mShR.getLastRow() >= 2 ? mShR.getRange(2, 1, mShR.getLastRow() - 1, ACC_META_HEADERS.length).getValues() : [];
      var metaKeyNow = {};
      metaNow.forEach(function(r, i) { metaKeyNow[String(r[0] || '').trim() + '|' + String(r[1] || '').trim()] = i; });
      updatedClients.forEach(function(cl) {
        if (hasManualByClient[cl] || !(cl in statsByRowClient)) return;
        var mi = metaKeyNow[cl + '|' + trip];
        if (mi === undefined) return;
        metaNow[mi][3] = statsByRowClient[cl]; // عمود اللقطة
        metaNow[mi][4] = ''; // مسح أي تنبيه سابق
      });
      if (metaNow.length) mShR.getRange(2, 1, metaNow.length, ACC_META_HEADERS.length).setValues(metaNow);
    }
  }

  if (created || updated || removed) {
    logChange_(username, 'مزامنة حسابات رحلة تلقائياً', trip, 'تسعير الرحلة', '-',
      clientOrder.length + ' عميل: +' + created + ' بند، ~' + updated + ' تحديث، −' + removed + ' حذف');
  }
  return { clients: clientOrder.length, created: created, updated: updated, removed: removed };
}

/* ============================================================
   📑 (V4.54) بيان اتفاقيات الإعاشة — CRUD + استخلاص بالذكاء الاصطناعي
   شيت مستقل CateringContracts، صلاحية «الحسابات» (نفس صلاحية شاشة الحسابات)،
   منع تكرار «رقم الاتفاقية» — عند التكرار تُملأ الحقول الفارغة فقط بلا لمس ما هو مُدخَل
   ============================================================ */

// 📖 قراءة كل الاتفاقيات — للعرض بالجدول
function getCateringContracts(authToken) {
  _ccPerm_(authToken, 'view');
  var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS);
  if (sh.getLastRow() < 2) return { success: true, contracts: [] };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, CATERING_HEADERS.length).getValues();
  var fmt = function(v) {
    if (!v) return '';
    if (v instanceof Date) {
      var d = v.getDate(), m = v.getMonth() + 1, y = v.getFullYear();
      return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
    }
    return String(v);
  };
  var out = [];
  vals.forEach(function(r) {
    var no = String(r[0] || '').trim();
    if (!no) return;
    out.push({
      contractNo: no,
      provider: String(r[1] || '').trim(),
      area: String(r[2] || '').trim(),
      days: _accNum_(r[3]),
      fromDate: fmt(r[4]),
      toDate: fmt(r[5]),
      pilgrims: _accNum_(r[6]),
      duration: _accNum_(r[7]),
      totalAmount: _accNum_(r[8]),
      tripClient: String(r[9] || '').trim(),
      umrahCompany: String(r[10] || '').trim(),
      groupNo: String(r[11] || '').trim(),
      createdBy: String(r[12] || '').trim(),
      createdAt: fmt(r[13]),
      updatedBy: String(r[14] || '').trim(),
      updatedAt: fmt(r[15]),
      sourceFile: String(r[16] || '').trim(),
      vendor: String(r[17] || '').trim(),
      notes: String(r[18] || '').trim()
    });
  });
  return { success: true, contracts: out };
}

// 💾 حفظ دفعة اتفاقيات — جديدة تُضاف، والمكرَّرة (نفس رقم الاتفاقية) يستكمل الحقول الفارغة فقط بطلب صريح
function saveCateringContracts(authToken, list) {
  var session = _ccPerm_(authToken, 'add');
  if (!Array.isArray(list) || !list.length) return { success: false, error: 'لا توجد اتفاقيات للحفظ' };
  // 🔒 (V4.73) قفل صريح يمنع تكرار الصفوف عند نداءين متزامنين (نقرتين سريعتين، أو حفظ من الويب
  // والبوت في نفس اللحظة) — بدونه قد يقرأ كلا النداءين "غير موجود" معاً فيُضيفان صفّين مكرَّرين
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (eLock) { return { success: false, error: 'الشيت مشغول بعملية حفظ أخرى — أعد المحاولة بعد لحظات' }; }
  try {
  var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS);
  var now = new Date();
  var existing = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, CATERING_HEADERS.length).getValues() : [];
  var byNo = {};
  existing.forEach(function(r, i) {
    var no = String(r[0] || '').trim();
    if (no) byNo[no] = { row: i + 2, values: r };
  });
  var created = 0, updatedFilled = 0, skipped = 0, appended = [], updates = [];
  var logEntries = []; // 🕘 (V4.86) إدخالات سجل التعديلات — حقل/قديم/جديد لكل اتفاقية تغيّرت فعلياً
  list.forEach(function(c) {
    var no = String(c.contractNo || '').trim();
    if (!no) { skipped++; return; }
    var newVals = [
      no, String(c.provider || '').trim(), String(c.area || '').trim(),
      _accNum_(c.days) || '', String(c.fromDate || '').trim(), String(c.toDate || '').trim(),
      _accNum_(c.pilgrims) || '', _accNum_(c.duration) || '', _accNum_(c.totalAmount) || '',
      String(c.tripClient || '').trim(), String(c.umrahCompany || '').trim(), String(c.groupNo || '').trim(),
      session.username, now, '', '', String(c.sourceFile || '').trim(), String(c.vendor || '').trim(), String(c.notes || '').trim()
    ];
    var isEmpty_ = function(v) { return v === '' || v === null || v === undefined; };
    if (byNo[no]) {
      var origRow = byNo[no].values;
      var oldRow = origRow.slice();
      // ✏️ (V4.62) وضع «تعديل صريح» — يُستبدَل كل حقل حتى لو المُدخل جديد فارغاً (المستخدم قصد ذلك)
      var isEdit = !!c._isEdit;
      if (isEdit) {
        for (var k2 = 0; k2 < 12; k2++) oldRow[k2] = newVals[k2];
        oldRow[14] = session.username; oldRow[15] = now;
        if (c.sourceFile) oldRow[16] = String(c.sourceFile).trim();
        oldRow[17] = String(c.vendor || '').trim(); // 📑 (V4.76) المورد — يُستبدَل صراحةً في وضع التعديل
        oldRow[18] = String(c.notes || '').trim(); // 📝 (V4.77) ملاحظات — يُستبدَل صراحةً في وضع التعديل
        updates.push({ row: byNo[no].row, values: oldRow });
        updatedFilled++;
        logEntries = logEntries.concat(_ccLogDiffEntries_(no, origRow, oldRow));
      } else {
        // تحديث ذكي: املأ الحقول الفارغة فقط بدون لمس ما هو مُدخَل
        var anyFilled = false;
        for (var k = 0; k < 12; k++) {
          if (isEmpty_(oldRow[k]) && !isEmpty_(newVals[k])) {
            oldRow[k] = newVals[k];
            anyFilled = true;
          }
        }
        if (isEmpty_(oldRow[17]) && !isEmpty_(newVals[17])) { oldRow[17] = newVals[17]; anyFilled = true; } // المورد
        if (isEmpty_(oldRow[18]) && !isEmpty_(newVals[18])) { oldRow[18] = newVals[18]; anyFilled = true; } // ملاحظات
        if (anyFilled) {
          oldRow[14] = session.username; oldRow[15] = now;
          if (c.sourceFile && !oldRow[16]) oldRow[16] = String(c.sourceFile).trim();
          updates.push({ row: byNo[no].row, values: oldRow });
          updatedFilled++;
          logEntries = logEntries.concat(_ccLogDiffEntries_(no, origRow, oldRow));
        } else {
          skipped++;
        }
      }
    } else {
      appended.push(newVals);
      byNo[no] = { row: sh.getLastRow() + 1 + appended.length, values: newVals };
      created++;
      logEntries.push({
        action: 'إنشاء اتفاقية إعاشة', recordId: no, field: 'اتفاقية جديدة', oldVal: '-',
        newVal: (c.provider || '-') + ' — ' + (c.area || '-') + (c.totalAmount ? ' — ' + _accNum_(c.totalAmount) : '')
      });
    }
  });
  // كتابة دفعية واحدة لكل عملية (بدل نداء لكل صف)
  updates.forEach(function(u) {
    sh.getRange(u.row, 1, 1, CATERING_HEADERS.length).setValues([u.values]);
  });
  if (appended.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appended.length, CATERING_HEADERS.length).setValues(appended);
  }
  SpreadsheetApp.flush();
  // 🕘 (V4.86) سجل تعديلات بتفاصيل كل حقل تغيّر فعلياً (بدل سطر ملخّص واحد فقط) — يدعم زر
  // «سجل تعديلات الاتفاقية» بجوار كل اتفاقية بشاشة الاتفاقيات
  if (logEntries.length) logChangesBatch_(session.username, logEntries);
  else logChange_(session.username, 'حفظ اتفاقيات إعاشة', '-', CATERING_SHEET, '-', 'حفظ بلا تغييرات فعلية (' + list.length + ')');
  return { success: true, created: created, updated: updatedFilled, skipped: skipped };
  } finally { lock.releaseLock(); }
}

// 🗑️ حذف اتفاقية واحدة برقمها
function deleteCateringContract(authToken, contractNo) {
  var session = _ccPerm_(authToken, 'delete');
  contractNo = String(contractNo || '').trim();
  if (!contractNo) return { success: false, error: 'رقم الاتفاقية مطلوب' };
  var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS);
  if (sh.getLastRow() < 2) return { success: false, error: 'الاتفاقية غير موجودة' };
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === contractNo) {
      sh.deleteRow(i + 2);
      SpreadsheetApp.flush();
      logChange_(session.username, 'حذف اتفاقية إعاشة', contractNo, CATERING_SHEET, '-', 'حُذفت الاتفاقية رقم ' + contractNo);
      return { success: true };
    }
  }
  return { success: false, error: 'الاتفاقية غير موجودة' };
}

// 🕘 (V4.86) سجل تعديلات اتفاقية إعاشة واحدة — كل عمليات AuditLog التي مرجعها رقم هذه الاتفاقية،
// من أول إنشائها حتى آخر تعديل، بنفس صلاحية عرض شاشة الاتفاقيات (بلا حاجة لصلاحية سجل التعديلات
// العامة). نسخة مطابقة لمبدأ getTripChangeLog لكن لسجل اتفاقيات الإعاشة.
function getCateringContractHistory(authToken, contractNo) {
  _ccPerm_(authToken, 'view');
  contractNo = String(contractNo || '').trim();
  if (!contractNo) return [];
  var sheet = ensureAuditLogSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var result = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    if (String(r[3] || '').trim() !== contractNo) continue;
    var ts = r[0];
    var tsStr = (ts instanceof Date)
      ? Utilities.formatDate(ts, Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm:ss')
      : String(ts || '-');
    result.push({
      timestamp: tsStr,
      username: String(r[1] || '-'),
      action: String(r[2] || '-'),
      field: String(r[4] || '-'),
      oldValue: r[5] === '' || r[5] === null || r[5] === undefined ? '-' : String(r[5]),
      newValue: r[6] === '' || r[6] === null || r[6] === undefined ? '-' : String(r[6])
    });
  }
  return result;
}

// 🔍 (V4.73) فحص التكرار — يبحث في شيت الاتفاقيات كله عن أرقام اتفاقيات مكرَّرة (صفّان أو أكثر
// لنفس الرقم)، ويعيدها كمجموعات جاهزة للمراجعة قبل الدمج
function findDuplicateCateringContracts(authToken) {
  _ccPerm_(authToken, 'view');
  var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS);
  if (sh.getLastRow() < 3) return { success: true, groups: [] };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, CATERING_HEADERS.length).getValues();
  var fmt = function(v) {
    if (!v) return '';
    if (v instanceof Date) {
      var d = v.getDate(), m = v.getMonth() + 1, y = v.getFullYear();
      return (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + y;
    }
    return String(v);
  };
  var byNo = {};
  vals.forEach(function(r, i) {
    var no = String(r[0] || '').trim();
    if (!no) return;
    (byNo[no] = byNo[no] || []).push({
      rowIndex: i + 2,
      contractNo: no, provider: String(r[1] || '').trim(), area: String(r[2] || '').trim(),
      days: r[3] || '', fromDate: fmt(r[4]), toDate: fmt(r[5]),
      pilgrims: r[6] || '', duration: r[7] || '', totalAmount: r[8] || '',
      tripClient: String(r[9] || '').trim(), umrahCompany: String(r[10] || '').trim(), groupNo: String(r[11] || '').trim(),
      createdBy: String(r[12] || '').trim(), createdAt: fmt(r[13]), sourceFile: String(r[16] || '').trim(),
      vendor: String(r[17] || '').trim(), notes: String(r[18] || '').trim()
    });
  });
  var groups = [];
  Object.keys(byNo).forEach(function(no) {
    if (byNo[no].length > 1) groups.push({ contractNo: no, rows: byNo[no] });
  });
  groups.sort(function(a, b) { return String(a.contractNo).localeCompare(String(b.contractNo)); });
  return { success: true, groups: groups };
}

// 🔗 (V4.73) دمج كل الصفوف المكرَّرة لنفس رقم الاتفاقية في صفّ واحد — يأخذ أول قيمة غير فارغة لكل
// حقل من كل النسخ بالترتيب (فيُكمِّل الحقول الناقصة من أي نسخة)، ثم يحذف بقية الصفوف المكرَّرة
function mergeCateringDuplicates(authToken, contractNo) {
  var session = _ccPerm_(authToken, 'edit');
  contractNo = String(contractNo || '').trim();
  if (!contractNo) return { success: false, error: 'رقم الاتفاقية مطلوب' };
  var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS);
  if (sh.getLastRow() < 3) return { success: false, error: 'لا توجد بيانات' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, CATERING_HEADERS.length).getValues();
  var matches = []; // { rowIndex1based, values }
  vals.forEach(function(r, i) {
    if (String(r[0] || '').trim() === contractNo) matches.push({ row: i + 2, values: r });
  });
  if (matches.length < 2) return { success: false, error: 'لا يوجد تكرار فعلي لهذا الرقم' };

  var isEmpty_ = function(v) { return v === '' || v === null || v === undefined; };
  // 🧩 دمج: أول 12 عمود بيانات — نأخذ أول قيمة غير فارغة عبر كل النسخ بالترتيب
  var merged = matches[0].values.slice();
  for (var k = 0; k < 12; k++) {
    if (!isEmpty_(merged[k])) continue;
    for (var m = 1; m < matches.length; m++) {
      if (!isEmpty_(matches[m].values[k])) { merged[k] = matches[m].values[k]; break; }
    }
  }
  // مصدر الملف: اجمع كل المصادر المختلفة في خانة واحدة (مفيد للتتبع)
  var sources = [];
  matches.forEach(function(mm) {
    var sf = String(mm.values[16] || '').trim();
    if (sf && sources.indexOf(sf) === -1) sources.push(sf);
  });
  merged[14] = session.username; merged[15] = new Date();
  if (sources.length) merged[16] = sources.join(' + ');
  // 📑 (V4.76) المورد — أول قيمة غير فارغة عبر كل النسخ
  if (isEmpty_(merged[17])) {
    for (var mv = 1; mv < matches.length; mv++) {
      if (!isEmpty_(matches[mv].values[17])) { merged[17] = matches[mv].values[17]; break; }
    }
  }
  // 📝 (V4.77) ملاحظات — أول قيمة غير فارغة عبر كل النسخ
  if (isEmpty_(merged[18])) {
    for (var mn = 1; mn < matches.length; mn++) {
      if (!isEmpty_(matches[mn].values[18])) { merged[18] = matches[mn].values[18]; break; }
    }
  }

  // نُبقي أقدم صف (الأول) ونكتب فيه القيم المدموجة، ونحذف الباقي (من الأسفل للأعلى حتى لا تتغيّر الأرقام)
  var keepRow = matches[0].row;
  sh.getRange(keepRow, 1, 1, CATERING_HEADERS.length).setValues([merged]);
  var rowsToDelete = matches.slice(1).map(function(mm) { return mm.row; }).sort(function(a, b) { return b - a; });
  rowsToDelete.forEach(function(r) { sh.deleteRow(r); });
  SpreadsheetApp.flush();
  logChange_(session.username, 'دمج اتفاقيات إعاشة مكرَّرة', contractNo, CATERING_SHEET, '-',
    'دُمجت ' + matches.length + ' نسخة لرقم الاتفاقية ' + contractNo + ' في صف واحد');
  return { success: true, mergedCount: matches.length };
}

// 🤖 (V4.55) استخلاص بيانات الاتفاقيات — يدعم عدة اتفاقيات بالملف الواحد، ومحاولة استخلاص يدوي
// (قواعد نصية Regex) لو تعذَّر رد الذكاء الاصطناعي أو لم يكن مفهومًا.
// الردّ الآن دائماً {success, contracts:[...]} — مصفوفة (اتفاقية أو أكثر أو صفر).
// 📆 (V4.58) توليد الحقل الناقص بين (days, fromDate, toDate) عبر: days = to - from + 1
function _ccComputeMissingDates_(c) {
  var parseD = function(s) {
    if (!s) return null;
    var m = String(s).trim().replace(/-/g, '/').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    var y = +m[3]; if (y < 100) y += 2000;
    return new Date(y, +m[2] - 1, +m[1]);
  };
  var fmt = function(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    var pad = function(n) { return (n < 10 ? '0' + n : n); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  };
  var f = parseD(c.fromDate), t = parseD(c.toDate), d = c.days ? Number(c.days) : 0;
  var MS = 86400000;
  if (f && t && !d) { c.days = Math.round((t.getTime() - f.getTime()) / MS) + 1; }
  else if (f && d && !t) { c.toDate = fmt(new Date(f.getTime() + (d - 1) * MS)); }
  else if (t && d && !f) { c.fromDate = fmt(new Date(t.getTime() - (d - 1) * MS)); }
}

/* ============================================================
   🧠 (V4.71) محرك موحَّد للاستخلاص المحلي بلا ذكاء اصطناعي — يحل محل 3 نسخ مكرَّرة كانت
   متفرقة بين الويب والبوت. يدعم 3 صيغ ويجرّبها بالترتيب حتى ينجح واحدة:
   1) مُعنونة (رقم الاتفاقية: 123 ...)
   2) قائمة (سطر لكل حقل)
   3) جدولية — صف بيانات واحد لكل سطر (رقم/شركة/منطقة/أيام/تاريخ/تاريخ/عدد...) بأي ترتيب أعمدة —
      يُستخدَم لكشوف اتفاقيات مصدَّرة كجدول من نفس الشاشة أو أي كشف Excel/PDF مشابه
   يُستخدَم من: extractCateringContract (الويب، fallback عند فشل AI)، extractCateringContractText
   (لصق نص بالويب)، و_tgccExtractDirect_/dispatcher (البوت) — نسخة واحدة بدل ثلاث متفرقة
   ============================================================ */
// 📆 (V4.74) يدعم الآن dd/mm/yyyy وأيضاً yyyy-mm-dd (تنسيق ISO — تظهر بشاشات تفاصيل النظام نفسه
// عند تصويرها كمصدر استخلاص). يميّز بينهما بعدد أرقام المجموعة الأولى (4 أرقام = سنة أولاً)
function _ccFmtDate_(s) {
  var str = String(s || '').trim();
  var iso = str.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  var pad = function(n) { return (+n < 10 ? '0' + (+n) : String(+n)); };
  if (iso) return pad(iso[3]) + '/' + pad(iso[2]) + '/' + iso[1];
  var m = str.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return '';
  var y = +m[3]; if (y < 100) y += 2000;
  return pad(m[1]) + '/' + pad(m[2]) + '/' + y;
}
// 📆 نمط التقاط تاريخ عام يقبل الترتيبين (dd-mm-yyyy أو yyyy-mm-dd) بأي فاصل شائع
var CC_DATE_CAP_ = '[0-9]{1,4}[\\/\\-\\.][0-9]{1,2}[\\/\\-\\.][0-9]{1,4}';
function _ccMkEmptyContract_(src) {
  return { contractNo:'', provider:'', area:'', days:'', fromDate:'', toDate:'',
           pilgrims:'', duration:'', totalAmount:'', tripClient:'', umrahCompany:'', groupNo:'', sourceFile: src || '', vendor:'', notes:'' };
}
var CC_AREA_WORDS_ = ['مكة المكرمة','المدينة المنورة','مكة','المدينة','جدة المكرمة','جدة','الطائف','بريدة','الرياض','ينبع'];

// 🧱 (V4.74) صيغة 0: عمودية — تسمية الحقل بسطر مستقل والقيمة بالسطر الذي يليه مباشرة (بلا فاصل «:»
// إطلاقاً) — نمط شاشات تفاصيل الأنظمة عند تصويرها كمصدر استخلاص. تُجرَّب أولاً لأنها الأدق حين تنطبق.
var CC_VERTICAL_LABELS_ = [
  { key: 'contractNo',   res: [/^رقم\s*ا?لاتفاق[يّ]ة$/i] },
  { key: 'totalAmount',  res: [/^المبلغ\s*(?:ا?ل)?إجمالي\s*للمعتمرين$/i, /^إجمالي\s*القيمة\s*للمعتمرين$/i] },
  { key: '_perPilgrim',  res: [/^المبلغ\s*(?:ا?ل)?إجمالي\s*للمعتمر$/i] }, // مبلغ الفرد الواحد — يُتجاهَل عمداً، لا يُخلَط بالإجمالي
  { key: 'pilgrims',     res: [/^عدد\s*المعتمرين$/i] },
  { key: 'days',         res: [/^عدد\s*(?:أيام|ا?لأيام)\s*ا?لاتفاق[يّ]ة$/i, /^عدد\s*ا?لأيام$/i] },
  { key: 'fromDate',     res: [/^تاريخ\s*بداية\s*ا?لاتفاق[يّ]ة$/i, /^تاريخ\s*ا?لبداية$/i] },
  { key: 'toDate',       res: [/^تاريخ\s*نهاية\s*ا?لاتفاق[يّ]ة$/i, /^تاريخ\s*ا?لنهاية$/i] },
  { key: 'area',         res: [/^منطقة\s*الخدمة$/i, /^المنطقة$/i] },
  { key: 'provider',     res: [/^اسم\s*مقدم\s*الخدمة$/i, /^مقدم\s*الخدمة$/i] },
  { key: 'umrahCompany', res: [/^اسم\s*شركة\s*ا?لعمرة$/i, /^شركة\s*ا?لعمرة$/i] },
  { key: 'groupNo',      res: [/^رقم\s*ا?لمجموعة$/i] },
  { key: 'tripClient',   res: [/^العميل\s*\/\s*الرحلة$/i, /^العميل$/i, /^ا?لرحلة$/i] }
];
function _ccExtractVertical_(text) {
  var lines = String(text).split(/\r?\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l; });
  var c = _ccMkEmptyContract_();
  var found = 0;
  for (var i = 0; i < lines.length - 1; i++) {
    for (var d = 0; d < CC_VERTICAL_LABELS_.length; d++) {
      var def = CC_VERTICAL_LABELS_[d];
      if (!def.res.some(function(re) { return re.test(lines[i]); })) continue;
      var val = lines[i + 1];
      found++;
      if (def.key === '_perPilgrim') break; // نتجاهله عمداً حتى لا يُخلَط بالإجمالي الحقيقي
      if (def.key === 'contractNo') c.contractNo = val.replace(/[^A-Za-z0-9\-\/\.]/g, '');
      else if (def.key === 'days') c.days = val.replace(/[^0-9]/g, '');
      else if (def.key === 'pilgrims') c.pilgrims = val.replace(/[^0-9]/g, '');
      else if (def.key === 'totalAmount') { if (!c.totalAmount) c.totalAmount = val.replace(/[^0-9]/g, ''); }
      else if (def.key === 'fromDate') c.fromDate = _ccFmtDate_(val);
      else if (def.key === 'toDate') c.toDate = _ccFmtDate_(val);
      else c[def.key] = val;
      break;
    }
  }
  if (!found || (!c.contractNo && !c.provider && !c.umrahCompany)) return [];
  _ccComputeMissingDates_(c);
  return [c];
}

// 🧾 صيغة 1: مُعنونة — كل حقل مسبوق بتسميته الصريحة على نفس السطر (رقم الاتفاقية: ... / اسم مقدم الخدمة: ...)
function _ccExtractLabeled_(text) {
  var contracts = [];
  var labeledRe = /(?:رقم\s*الاتفاق[يّ]ة|اتفاق[يّ]ة\s*رقم)/i;
  if (!labeledRe.test(text)) return contracts;
  var parts = text.split(labeledRe);
  for (var i = 1; i < parts.length; i++) {
    var chunk = 'رقم الاتفاقية ' + parts[i];
    var c = _ccMkEmptyContract_();
    var pick = function(re, gr) { var m = chunk.match(re); return m ? String(m[gr || 1] || '').trim() : ''; };
    c.contractNo   = pick(/(?:رقم\s*الاتفاق[يّ]ة|اتفاق[يّ]ة\s*رقم)\s*[:؛\-–—]?\s*([A-Z0-9\-\/\.]{2,25})/i);
    c.provider     = pick(/(?:اسم\s*مقدم\s*الخدمة|مقدم\s*الخدمة|شركة\s*ريادة|مطعم|مطبخ)\s*[:؛\-]?\s*([^\n\r]{3,80})/i);
    c.area         = pick(/(?:منطقة\s*الخدمة|المنطقة|مكان)\s*[:؛\-]?\s*([^\n\r]{2,40})/i);
    c.days         = String(pick(/(?:عدد\s*(?:أيام|ا?لأيام)\s*ا?لاتفاق[يّ]ة|عدد\s*ا?لأيام|أيام\s*ا?لاتفاق[يّ]ة)\s*[:؛\-]?\s*([0-9]{1,3})/)).replace(/[^0-9]/g, '');
    c.fromDate     = _ccFmtDate_(pick(new RegExp('(?:تاريخ\\s*بداية\\s*ا?لاتفاق[يّ]ة|تاريخ\\s*البداية|من\\s*تاريخ)\\s*[:؛\\-]?\\s*(' + CC_DATE_CAP_ + ')', 'i')));
    c.toDate       = _ccFmtDate_(pick(new RegExp('(?:تاريخ\\s*نهاية\\s*ا?لاتفاق[يّ]ة|تاريخ\\s*النهاية|إلى\\s*تاريخ|حتى)\\s*[:؛\\-]?\\s*(' + CC_DATE_CAP_ + ')', 'i')));
    c.pilgrims     = String(pick(/(?:عدد\s*المعتمرين|عدد\s*ا?لأفراد)\s*[:؛\-]?\s*([0-9]{1,4})/)).replace(/[^0-9]/g, '');
    // 💰 (V4.74) الإجمالي الحقيقي = "للمعتمرين" (جمع) صراحة — لا يُخلَط بـ"للمعتمر" (مفرد، سعر الفرد)
    // الذي غالباً يسبقه بالنص، فيُجرَّب أولاً وإن لم يوجد نُرجع لصيغة عامة أوسع كبديل أخير
    c.totalAmount  = String(
        pick(/(?:المبلغ\s*(?:ا?ل)?إجمالي\s*للمعتمرين|إجمالي\s*القيمة\s*للمعتمرين)\s*[:؛\-]?\s*([0-9,،\.\s]{2,15})/) ||
        pick(/(?:المبلغ\s*ا?لإجمالي|الإجمالي)\s*[:؛\-]?\s*([0-9,،\.\s]{2,15})/)
      ).replace(/[^0-9]/g, '');
    c.umrahCompany = pick(/(?:اسم\s*شركة\s*ا?لعمرة|شركة\s*ا?لعمرة)\s*[:؛\-]?\s*([^\n\r]{3,80})/i);
    _ccComputeMissingDates_(c);
    if (c.contractNo || c.provider || c.pilgrims) contracts.push(c);
  }
  return contracts;
}

// 📋 صيغة 2: قائمة — سطر لكل حقل بالترتيب: رقم / شركة / منطقة / أيام / تاريخ بداية / تاريخ نهاية / عدد
function _ccExtractList_(text) {
  var contracts = [];
  var lines = text.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l; });
  var i2 = 0;
  while (i2 < lines.length) {
    if (!/^\d{4,8}$/.test(lines[i2])) { i2++; continue; }
    var c2 = _ccMkEmptyContract_();
    c2.contractNo = lines[i2]; var j = i2 + 1;
    if (j < lines.length && !/^\d/.test(lines[j])) { c2.provider = lines[j]; c2.umrahCompany = lines[j]; j++; }
    if (j < lines.length && !/^\d/.test(lines[j]) && lines[j].length < 40) { c2.area = lines[j]; j++; }
    if (j < lines.length && /^\d{1,3}$/.test(lines[j])) { c2.days = lines[j]; j++; }
    if (j < lines.length && /^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}$/.test(lines[j])) { c2.fromDate = _ccFmtDate_(lines[j]); j++; }
    if (j < lines.length && /^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}$/.test(lines[j])) { c2.toDate = _ccFmtDate_(lines[j]); j++; }
    if (j < lines.length && /^\d{1,4}$/.test(lines[j])) { c2.pilgrims = lines[j]; j++; }
    _ccComputeMissingDates_(c2);
    contracts.push(c2);
    i2 = j;
  }
  return contracts;
}

// 🧮 تحليل سطر جدولي واحد (صف بيانات من جدول/كشف اتفاقيات) — لا يعتمد على ترتيب أعمدة ثابت،
// بل على تصنيف كل رمز (تاريخ/رقم/منطقة معروفة/نص) وموضعه النسبي بالسطر. رقم الاتفاقية = آخر
// رقم صحيح بالسطر (يطابق كل الأمثلة الفعلية: يظهر كعمود أول بصرياً/أخير قرائياً في جداول RTL)،
// عدد المعتمرين = أول رقم قبل أول تاريخ، عدد الأيام = رقم بين آخر تاريخ والمنطقة/النص التالي،
// وأي رقم متبقٍّ (الأكبر قيمة) = المبلغ الإجمالي.
function _ccParseTableRow_(line) {
  if (!line || line.replace(/\s/g, '').length < 4) return null;
  // تجاهل صف العناوين نفسه (كلمات دلالية بلا أي رقم فعلي أو تاريخ)
  if (/رقم\s*الاتفاق[يّ]ة/.test(line) && !/\d{3,}/.test(line)) return null;

  // 📆 (V4.74) يقبل الآن dd-mm-yyyy و yyyy-mm-dd معاً — _ccFmtDate_ يميّز بينهما تلقائياً
  var dateRe = /\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/g;
  var dates = [];
  var dm;
  while ((dm = dateRe.exec(line))) dates.push({ idx: dm.index, raw: dm[0] });

  var areaMatch = null;
  for (var a = 0; a < CC_AREA_WORDS_.length; a++) {
    var aIdx = line.indexOf(CC_AREA_WORDS_[a]);
    if (aIdx > -1 && (!areaMatch || CC_AREA_WORDS_[a].length > areaMatch.word.length)) areaMatch = { idx: aIdx, word: CC_AREA_WORDS_[a] };
  }

  // إخفاء التواريخ قبل البحث عن الأرقام المستقلة حتى لا يُلتقط جزء من تاريخ كرقم منفصل
  var masked = line;
  dates.forEach(function(d) { masked = masked.split(d.raw).join(Array(d.raw.length + 1).join(' ')); });
  var numRe = /\d{1,3}(?:,\d{3})+|\d{1,8}/g;
  var numbers = [];
  var nm;
  while ((nm = numRe.exec(masked))) numbers.push({ idx: nm.index, raw: nm[0], val: parseInt(nm[0].replace(/,/g, ''), 10) });
  if (!numbers.length && !dates.length) return null;

  var firstDateIdx = dates.length ? dates[0].idx : Infinity;
  var lastDateIdx = dates.length ? dates[dates.length - 1].idx : -Infinity;
  var areaIdx = areaMatch ? areaMatch.idx : Infinity;

  var contractNo = '', pilgrims = '', days = '', totalAmount = '';
  var used = {};
  if (numbers.length) {
    var last = numbers[numbers.length - 1];
    contractNo = String(last.val);
    used[numbers.length - 1] = true;
    for (var i = 0; i < numbers.length; i++) {
      if (used[i]) continue;
      if (numbers[i].idx < firstDateIdx) { pilgrims = String(numbers[i].val); used[i] = true; break; }
    }
    for (var j = 0; j < numbers.length; j++) {
      if (used[j]) continue;
      if (numbers[j].idx > lastDateIdx && numbers[j].idx < areaIdx) { days = String(numbers[j].val); used[j] = true; break; }
    }
    var restVals = [];
    for (var k = 0; k < numbers.length; k++) if (!used[k]) restVals.push(numbers[k].val);
    if (restVals.length) totalAmount = String(Math.max.apply(null, restVals));
  }

  var textOnly = line;
  dates.forEach(function(d) { textOnly = textOnly.split(d.raw).join(' '); });
  numbers.forEach(function(n) { textOnly = textOnly.split(n.raw).join(' '); });
  if (areaMatch) textOnly = textOnly.split(areaMatch.word).join(' ');
  textOnly = textOnly.replace(/[|,،؛]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!contractNo && !textOnly) return null;

  var fromDate = '', toDate = '';
  if (dates.length >= 2) {
    var d1 = _ccFmtDate_(dates[0].raw), d2 = _ccFmtDate_(dates[1].raw);
    var toTime = function(s) { var p = s.split('/'); return new Date(+p[2], +p[1] - 1, +p[0]).getTime(); };
    if (d1 && d2) { if (toTime(d1) <= toTime(d2)) { fromDate = d1; toDate = d2; } else { fromDate = d2; toDate = d1; } }
  } else if (dates.length === 1) {
    fromDate = _ccFmtDate_(dates[0].raw);
  }

  var c = _ccMkEmptyContract_();
  c.contractNo = contractNo; c.provider = textOnly; c.umrahCompany = textOnly;
  c.area = areaMatch ? areaMatch.word : ''; c.days = days;
  c.fromDate = fromDate; c.toDate = toDate; c.pilgrims = pilgrims; c.totalAmount = totalAmount;
  _ccComputeMissingDates_(c);
  return c;
}

// 📊 صيغة 3: جدولية — عدة أسطر، كل سطر صف بيانات اتفاقية واحدة (كشف مُصدَّر أو جدول مصوَّر)
function _ccExtractTable_(text) {
  var lines = text.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l; });
  var contracts = [];
  lines.forEach(function(l) {
    var c = _ccParseTableRow_(l);
    // نقبل الصف فقط لو فيه رقم اتفاقية معقول (3+ أرقام) — يمنع التقاط أسطر ملاحظات عشوائية
    if (c && c.contractNo && c.contractNo.length >= 3) contracts.push(c);
  });
  return contracts;
}

// 🎯 (V4.74) نقطة الدخول الموحَّدة — تُجرَّب 4 صيغ بالترتيب وتُعاد أول نتيجة غير فارغة:
// عمودية (الأدق حين تنطبق) ← مُعنونة بنفس السطر ← قائمة ← جدولية (الأكثر تساهلاً، تُختبَر أخيراً)
function _ccUnifiedLocalExtract_(text, sourceLabel) {
  text = String(text || '');
  if (!text.trim()) return [];
  var out = _ccExtractVertical_(text);
  if (!out.length) out = _ccExtractLabeled_(text);
  if (!out.length) out = _ccExtractList_(text);
  if (!out.length) out = _ccExtractTable_(text);
  if (sourceLabel) out.forEach(function(c) { if (!c.sourceFile) c.sourceFile = sourceLabel; });
  return out;
}

function extractCateringContract(authToken, base64Data, mimeType, fileName) {
  _ccPerm_(authToken, 'add');
  if (!base64Data) return { success: false, error: 'لا يوجد ملف' };
  var GKEYS = _geminiKeys_();

  // 🚫 (V4.66) قائمة كلمات تشير لعناوين أعمدة (لا يجب أن تُعتبر بيانات)
  var _headerWords_ = [
    'رقم الاتفاقية','اسم مقدم الخدمة','مقدم الخدمة','المنطقة','منطقة الخدمة',
    'عدد الأيام','عدد أيام','تاريخ البداية','تاريخ بداية','تاريخ النهاية','تاريخ نهاية',
    'عدد المعتمرين','عدد المعتمرمين','المبلغ الإجمالي','المبلغ الاجمالي','الإجمالي','الاجمالي',
    'شركة العمرة','اسم شركة العمرة','نوع الطلب','رقم الطلب'
  ];
  var _isHeader_ = function(s) {
    var v = String(s || '').trim();
    if (!v) return false;
    for (var h = 0; h < _headerWords_.length; h++) if (v.indexOf(_headerWords_[h]) > -1) return true;
    return false;
  };
  // 🧹 (V4.55) تطبيع + تنظيف كائن اتفاقية واحدة قادمة من أي مصدر (AI أو Regex)
  var _sanitizeContract_ = function(d) {
    var numify = function(v) { if (v === '' || v === null || v === undefined) return ''; return _accNum_(String(v).replace(/[,،\s]/g, '')); };
    var textOrEmpty = function(v) { var s = String(v || '').trim(); return _isHeader_(s) ? '' : s; };
    var out = {
      contractNo: String(d.contractNo || '').trim(),
      provider: textOrEmpty(d.provider),
      area: textOrEmpty(d.area),
      days: numify(d.days) || '',
      fromDate: String(d.fromDate || '').trim(),
      toDate: String(d.toDate || '').trim(),
      pilgrims: numify(d.pilgrims) || '',
      duration: numify(d.duration) || '',
      totalAmount: numify(d.totalAmount) || '',
      tripClient: String(d.tripClient || '').trim(),
      umrahCompany: textOrEmpty(d.umrahCompany),
      groupNo: String(d.groupNo || '').trim(),
      sourceFile: fileName || '',
      vendor: textOrEmpty(d.vendor),
      notes: String(d.notes || '').trim()
    };
    _ccComputeMissingDates_(out);
    return out;
  };

  // 🤖 محاولة استخلاص AI — تدعم عدة اتفاقيات
  var _tryAi_ = function() {
    if (!GKEYS.length) return { ok: false, err: 'مفتاح Gemini غير مُعدّ' };
    // 🧠 (V4.74) بنص أوسع يميّز 3 صيغ: جدولية / بطاقات منفصلة / شاشة تفاصيل ببنية عمودية (label فوق value)
    var prompt =
      "This image/PDF may contain ONE OR MORE Arabic 'اتفاقية إعاشة' (Umrah catering) contracts — scan the ENTIRE image/all pages for every contract present, even if there are several separate blocks or many table rows. " +
      "CRITICAL — detect which layout applies: " +
      "(1) TABLE: column HEADERS (like 'رقم الاتفاقية', 'اسم مقدم الخدمة', 'المنطقة', 'عدد الأيام', 'تاريخ البداية', 'تاريخ النهاية', 'عدد المعتمرين', 'المبلغ الإجمالي') appear as ONE ROW, DATA in row(s) BELOW — EVERY data row is a separate contract, never skip/merge rows. " +
      "(2) SEPARATE CARDS: each has its own رقم الاتفاقية — one entry per card. " +
      "(3) SINGLE DETAIL/PROFILE SCREEN (common — a system's own 'تفاصيل الاتفاقية' page): a 2-column grid where a small gray LABEL sits directly above/beside its black VALUE (e.g. label 'رقم الاتفاقية' with '25456' right under it). Scan the WHOLE screen carefully for every label+value pair, even interleaved across columns — don't stop early. " +
      "AMOUNT DISAMBIGUATION (common mistake on detail screens): they may show BOTH 'المبلغ الإجمالي للمعتمر' (per-PILGRIM rate, singular — IGNORE) AND 'المبلغ الإجمالي للمعتمرين' (grand TOTAL, plural — this is totalAmount, USE THIS). مفرد=تجاهل، جمع=استخدمه. " +
      "DATES may appear dd/mm/yyyy OR ISO yyyy-mm-dd (e.g. '2026-08-26') — recognize both, always output dd/mm/yyyy. " +
      "You MUST extract DATA/VALUES, NEVER return column/field labels as values. " +
      "Each data row/card/screen = ONE contract entry. If you see e.g. header row and one data row: [12454, مجموعة قافلة, مكة, 6, 19-08-2026, 24-08-2026, 9, 270] → return {contractNo:'12454', provider:'مجموعة قافلة', area:'مكة', days:'6', fromDate:'19/08/2026', toDate:'24/08/2026', pilgrims:'9', totalAmount:'270'}. " +
      "Amounts always Saudi Riyals (SAR). Numbers digits only.\n" +
      "Also handle vertical 'label: value' same-line format and plain lists (one field per line without labels).\n" +
      "Return ONLY pure JSON (no markdown, no explanation, no comments):\n" +
      '{"contracts":[' +
      '{' +
        '"contractNo":"<as printed digits>",' +
        '"provider":"<Arabic company/agency name — NOT the header word>",' +
        '"area":"<Makkah/Madinah in Arabic>",' +
        '"days":"<integer>",' +
        '"fromDate":"<dd/mm/yyyy>",' +
        '"toDate":"<dd/mm/yyyy>",' +
        '"pilgrims":"<integer>",' +
        '"duration":"",' +
        '"totalAmount":"<SAR total digits only>",' +
        '"umrahCompany":"<Arabic>"' +
      '}]}\n' +
      "Rules: multiple data rows → multiple entries. Empty string ONLY when a cell is truly missing/blank. NEVER return column-header words as data. If unreadable: {\"contracts\":[]}.";
    var payload = {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }] }]
    };
    // 🧠 (V4.63) بعد إيقاف gemini-1.5-flash أيضاً — نُبقي 2.5-flash فقط (نموذج المستقر الحالي)
  // 🧠 (V4.65) استعادة قائمة النماذج الكاملة من V4.47 — كانت تعمل ممتازاً مع التذاكر والجوازات
  // ونحتفظ بها متعددة حتى ينتقل بينها الكود تلقائياً عند نفاد كوتا أو رفض مفتاح لنموذج بعينه
  var MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
    var jsonRes = null, lastErr = '', minQuotaWait = 0, rawText = '';
    for (var ki = 0; ki < GKEYS.length && !jsonRes; ki++) {
      for (var mi = 0; mi < MODELS.length; mi++) {
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[mi] + ':generateContent?key=' + GKEYS[ki];
        var resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json',
          payload: JSON.stringify(payload), muteHttpExceptions: true });
        var httpCode = resp.getResponseCode();
        try { jsonRes = JSON.parse(resp.getContentText()); } catch (pe) { jsonRes = null; }
        if (httpCode === 200 && jsonRes && jsonRes.candidates && jsonRes.candidates.length && jsonRes.candidates[0].content) {
          rawText = jsonRes.candidates[0].content.parts[0].text || ''; lastErr = ''; break;
        }
        lastErr = (jsonRes && jsonRes.error && jsonRes.error.message) ? jsonRes.error.message : ('HTTP ' + httpCode);
        var rm = String(lastErr).match(/retry in ([0-9.]+)s/i);
        if (rm) { var w = Math.ceil(parseFloat(rm[1])); if (!minQuotaWait || w < minQuotaWait) minQuotaWait = w; }
        jsonRes = null;
        // 🔁 (V4.65) اسمح بالتنقّل بين النماذج عند 400/404 أيضاً — نموذج غير موجود على المفتاح
        if (httpCode === 401 || httpCode === 403) break;
      }
    }
    if (!rawText) return { ok: false, err: lastErr || 'رد غير صالح', quotaWait: minQuotaWait };
    var text = rawText.replace(/```json|```/g, '').trim();
    var m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
    try {
      var data = JSON.parse(text);
      var arr = Array.isArray(data.contracts) ? data.contracts
              : Array.isArray(data.persons)   ? data.persons // توافق خلفي
              : (data && data.contractNo)      ? [data]       // ردٌ فردي قديم
              : [];
      return { ok: true, contracts: arr, rawText: rawText };
    } catch (pe) {
      Logger.log('extractCateringContract JSON parse failed. Raw: ' + rawText.substring(0, 300));
      return { ok: false, err: 'رد الذكاء الاصطناعي غير مفهوم', rawText: rawText };
    }
  };

  // 🧮 (V4.71) الاستخلاص اليدوي — بديل عند فشل/نفاد كوتا AI. يحتاج نصًا خامًا:
  // 1) OCR.Space أولاً (مجاني، لا يستهلك كوتا Gemini) — نفس المفتاح المُستخدَم في إعدادات بوت الاتفاقيات
  // 2) فشل OCR.Space → Gemini «OCR فقط» عبر كل المفاتيح/النماذج
  // 3) تحليل النص عبر المحرك الموحَّد (_ccUnifiedLocalExtract_) بدل منطق تجزئة محلي مكرَّر
  var _tryManual_ = function(baseText) {
    var text = baseText || '';
    var viaOcrSpace = false;
    if (!text) {
      try {
        var cfgOs = _tgccCfg_();
        var osRes = _tgccOcrSpace_(base64Data, mimeType, cfgOs.ocrSpaceKey || '');
        if (osRes && osRes.ok && osRes.text) { text = osRes.text; viaOcrSpace = true; }
      } catch (_eOs) {}
    }
    if (!text) {
      if (!GKEYS.length) return { ok: false, err: 'لا يوجد مفتاح Gemini للـOCR اليدوي' };
      var ocrPrompt = 'Perform OCR only. Return ALL Arabic text in the image/PDF exactly as it appears, line by line, without any interpretation, translation, or markdown.';
      var payload = { contents: [{ parts: [{ text: ocrPrompt }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }] }] };
      var MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
      for (var ki = 0; ki < GKEYS.length && !text; ki++) {
        for (var mi = 0; mi < MODELS.length; mi++) {
          try {
            var resp = UrlFetchApp.fetch(
              'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[mi] + ':generateContent?key=' + GKEYS[ki],
              { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
            var jr = JSON.parse(resp.getContentText());
            if (jr && jr.candidates && jr.candidates[0] && jr.candidates[0].content) {
              text = jr.candidates[0].content.parts[0].text || '';
              if (text) break;
            }
          } catch (_e) {}
        }
      }
    }
    if (!text || text.length < 20) return { ok: false, err: 'تعذر الحصول على نص للاستخلاص اليدوي' };
    var out = _ccUnifiedLocalExtract_(text, fileName || '');
    return { ok: true, contracts: out, rawText: text, viaManual: true, viaOcrSpace: viaOcrSpace };
  };

  // 1️⃣ جرب AI أولاً
  var aiRes = _tryAi_();
  var contracts = null, viaManual = false, aiRawText = '';

  if (aiRes.ok) {
    contracts = aiRes.contracts || [];
    aiRawText = aiRes.rawText || '';
    // لو AI أرجع مصفوفة فارغة أو ما فيها contractNo لأي اتفاقية — جرب اليدوي على نص AI
    var anyGoodAi = contracts.some(function(c) { return String(c.contractNo || '').trim() || String(c.provider || '').trim(); });
    if (!anyGoodAi) {
      var manRes = _tryManual_(aiRawText);
      if (manRes.ok && manRes.contracts.length) {
        contracts = manRes.contracts; viaManual = true;
      }
    }
  } else {
    // 🐛 (V4.71) الجذر الحقيقي لخطأ "حد الاستخلاص المؤقت": كان يُرجَع فوراً حتى لو المفتاحان
    // المسجَّلان (كما في تذاكر الطيران) استُنفدا معاً — بدل تجربة الاستخلاص اليدوي (OCR.Space/محلي)
    // كخطة بديلة أولاً، ولا يُرجَع quotaWait كفشل نهائي إلا لو فشل اليدوي أيضاً
    var manRes2 = _tryManual_(aiRes.rawText);
    if (manRes2.ok && manRes2.contracts.length) {
      contracts = manRes2.contracts; viaManual = true;
    } else if (aiRes.quotaWait) {
      return { success: false, quotaWait: aiRes.quotaWait, error: 'حد الاستخلاص المؤقت (استُنفد المفتاحان المسجَّلان) — ' + (manRes2.err || 'تعذّر الاستخلاص المحلي أيضاً') };
    } else {
      return { success: false, error: 'الذكاء الاصطناعي: ' + (aiRes.err || '') + (manRes2.err ? ' — والاستخلاص اليدوي: ' + manRes2.err : '') };
    }
  }

  var cleaned = (contracts || []).map(_sanitizeContract_);
  return { success: true, contracts: cleaned, viaManual: viaManual };
}

// 📝 (V4.58) استخلاص من نص مُلصَق مباشرة — يدعم الصيغة المعنونة والصيغة القائمة (سطر لكل حقل)
function extractCateringContractText(authToken, rawText) {
  _ccPerm_(authToken, 'add');
  var text = String(rawText || '').trim();
  if (!text) return { success: false, error: 'النص فارغ' };
  // 🧠 (V4.71) محرك موحَّد — يدعم الصيغة المُعنونة والقائمة والجدولية (عدة صفوف/اتفاقيات معاً)
  var contracts = _ccUnifiedLocalExtract_(text, '(نص مُلصَق)');
  if (!contracts.length) return { success: false, error: 'تعذّر التعرف على أي اتفاقية داخل النص' };
  return { success: true, contracts: contracts, viaText: true };
}

// 🏨 بيانات سكن العميل بالرحلة (للتوليد بنمط البنود): الفندق الأكثر تسكينًا وعدد الغرف المميزة
// لكل مدينة من كشف العميل + ليالي كل مدينة من تواريخ الرحلة نفسها
function _accClientHousing_(client, trip) {
  var res = { madHotel: '', makHotel: '', madRooms: 0, makRooms: 0, madNights: 0, makNights: 0,
    madCheckIn: '', madCheckOut: '', makCheckIn: '', makCheckOut: '' };
  var pSheet = _getPilgrimsSheet_();
  if (pSheet && pSheet.getLastRow() >= 2) {
    var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var P = _cellReader_(C, PILGRIMS_COL_);
    var madH = {}, makH = {}, madR = {}, makR = {};
    pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
      if (String(P(r, 'client') || '').trim() !== client) return;
      if (String(P(r, 'tripName') || '').trim() !== trip) return;
      var hm = String(P(r, 'hotelMadinah') || '').trim(), hk = String(P(r, 'hotelMakkah') || '').trim();
      if (hm) madH[hm] = (madH[hm] || 0) + 1;
      if (hk) makH[hk] = (makH[hk] || 0) + 1;
      var rm = String(P(r, 'roomNoMadinah') || '').trim(), rk = String(P(r, 'roomNoMakkah') || '').trim();
      if (rm) madR[rm] = 1;
      if (rk) makR[rk] = 1;
    });
    var top = function(o) { var b = '', n = 0; Object.keys(o).forEach(function(k) { if (o[k] > n) { n = o[k]; b = k; } }); return b; };
    res.madHotel = top(madH); res.makHotel = top(makH);
    res.madRooms = Object.keys(madR).length; res.makRooms = Object.keys(makR).length;
  }
  var _dmyDiff_ = function(a, b) {
    var ma = String(a || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), mb = String(b || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!ma || !mb) return 0;
    return Math.max(0, Math.round((new Date(+mb[3], +mb[2] - 1, +mb[1]) - new Date(+ma[3], +ma[2] - 1, +ma[1])) / 86400000));
  };
  // 📨 (V4.05 — بطلب صريح) إشعار الوصول المرتبط بالرحلة هو المصدر الافتراضي الأول
  // لأسماء الفنادق وعدد الليالي وبيان التذاكر (خط السير والخطوط)
  var notice = null;
  try {
    var bks = getAllBookings();
    for (var bi = 0; bi < bks.length; bi++) {
      if (String(bks[bi].tripName || '').trim() === trip) { notice = bks[bi]; break; }
    }
  } catch (eB) { notice = null; }
  var _cleanPort_ = function(p) { return String(p || '').replace(/مطار\s*/g, '').replace(/\s*→\s*/g, '/').trim(); };
  res.arrRoute = ''; res.depRoute = ''; res.airline = '';
  if (notice) {
    if (notice.madinahHotel) res.madHotel = notice.madinahHotel;
    if (notice.makkahHotel) res.makHotel = notice.makkahHotel;
    var nMad = _dmyDiff_(notice.madinahCheckIn, notice.madinahCheckOut);
    var nMak = _dmyDiff_(notice.makkahCheckIn, notice.makkahCheckOut);
    if (nMad) res.madNights = nMad;
    if (nMak) res.makNights = nMak;
    if (notice.madinahCheckIn) res.madCheckIn = String(notice.madinahCheckIn);
    if (notice.madinahCheckOut) res.madCheckOut = String(notice.madinahCheckOut);
    if (notice.makkahCheckIn) res.makCheckIn = String(notice.makkahCheckIn);
    if (notice.makkahCheckOut) res.makCheckOut = String(notice.makkahCheckOut);
    res.arrRoute = _cleanPort_(notice.arrivalPort);
    res.depRoute = _cleanPort_(notice.departurePort);
    var fCode = String(notice.arrivalFlight || '').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2);
    res.airline = ({ MS: 'مصر للطيران', SV: 'الخطوط السعودية', SM: 'سما', NP: 'النيل للطيران', XY: 'طيران ناس', F3: 'طيران أديل', AT: 'العربية' })[fCode] || '';
  }
  var tSheet = _getTripsSheet_();
  if (tSheet && tSheet.getLastRow() >= 2) {
    var tC = _robustColMap_(tSheet, TRIPS_HEADERS_);
    var T = _cellReader_(tC, TRIPS_COL_);
    tSheet.getRange(2, 1, tSheet.getLastRow() - 1, tSheet.getLastColumn()).getValues().forEach(function(r) {
      if (String(T(r, 'name') || '').trim() !== trip) return;
      if (!res.airline) res.airline = String(T(r, 'airline') || '').trim();
      if (!res.madNights) res.madNights = _dmyDiff_(_tripFormatDate_(T(r, 'madinahCheckIn')), _tripFormatDate_(T(r, 'madinahCheckOut')));
      if (!res.makNights) res.makNights = _dmyDiff_(_tripFormatDate_(T(r, 'makkahCheckIn')), _tripFormatDate_(T(r, 'makkahCheckOut')));
      if (!res.madHotel) res.madHotel = String(T(r, 'madinahHotel') || '').trim();
      if (!res.makHotel) res.makHotel = String(T(r, 'makkahHotel') || '').trim();
      if (!res.madCheckIn) res.madCheckIn = _tripFormatDate_(T(r, 'madinahCheckIn'));
      if (!res.madCheckOut) res.madCheckOut = _tripFormatDate_(T(r, 'madinahCheckOut'));
      if (!res.makCheckIn) res.makCheckIn = _tripFormatDate_(T(r, 'makkahCheckIn'));
      if (!res.makCheckOut) res.makCheckOut = _tripFormatDate_(T(r, 'makkahCheckOut'));
    });
  }
  return res;
}

// 📅 (V4.39) تنسيق مختصر «يوم-شهر» بلا سنة لعرض فترة إقامة (١/٨ → 1-8)، يقبل dd/MM/yyyy أو yyyy-MM-dd
function _accShortDM_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return (+m[1]) + '-' + (+m[2]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return (+m[3]) + '-' + (+m[2]);
  return '';
}
// 📅 (V4.39) نص فترة الإقامة «من D-M الى D-M» ليُكتب جنب اسم الفندق ببنود سكن المدينة/مكة
function _accStayRange_(checkIn, checkOut) {
  var a = _accShortDM_(checkIn), b = _accShortDM_(checkOut);
  if (!a && !b) return '';
  return ' من ' + (a || '؟') + ' الى ' + (b || '؟');
}
// 🔤 (V4.39) تطبيع نص عربي لمطابقة تساهلية: يتجاهل التشكيل وحالة الهمزة/التاء المربوطة
function _accNormAr_(s) {
  return String(s || '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[ةه]/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .toLowerCase();
}
// 🛂 (V4.39) هل ملاحظة المعتمر تذكر نوع تأشيرة/فيزا؟ (بطلب صريح: تجاهل حالة الأحرف/الهمزات/التاء المربوطة)
function _accIsVisaNote_(notes) {
  return /تاشير|فيزا|visa/.test(_accNormAr_(notes));
}
// 👥 (V4.39) أسماء وملاحظات معتمري عميل×رحلة — لاكتشاف بنود التأشيرة الخاصة المكتوبة بالملاحظات
function _accClientPilgrimNotes_(client, trip) {
  var out = [];
  var pSheet = _getPilgrimsSheet_();
  if (pSheet && pSheet.getLastRow() >= 2) {
    var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var P = _cellReader_(C, PILGRIMS_COL_);
    pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
      if (String(P(r, 'client') || '').trim() !== client) return;
      if (String(P(r, 'tripName') || '').trim() !== trip) return;
      var nt = String(P(r, 'notes') || '').trim();
      if (nt) out.push({ name: String(P(r, 'name') || '').trim(), notes: nt });
    });
  }
  return out;
}

// 💰 (V4.10) تجميع أرصدة العملاء من شيتي البنود والدفعات — لكل العملاء أو لرحلة محددة
// الرصيد: موجب = مدين (مستحق عليه) · سالب = دائن (له) — بالجنيه والريال كلٌّ على حدة
// 🔁 (V4.45) يبني items/payments لكل عميل ثم يمرّرها لـ_accCalc_ الموحَّدة — بدل تكرار حساب fx يدويًا،
// فيرث تلقائيًا حسم نوع قيد كل تحويل حسب حالة رصيد عملة مصدره لحظة إجرائه
function _accAggBalances_(tripFilter) {
  var itemsByClient = {}, paysByClient = {};
  var get = function(map, cl) { return (map[cl] = map[cl] || []); };
  var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  if (iSh.getLastRow() >= 2) {
    iSh.getRange(2, 1, iSh.getLastRow() - 1, 10).getValues().forEach(function(r) {
      var cl = String(r[1] || '').trim();
      if (!cl) return;
      if (tripFilter && String(r[2] || '').trim() !== tripFilter) return;
      get(itemsByClient, cl).push({ value: _accNum_(r[8]), currency: String(r[5] || 'EGP'), isDiscount: String(r[9]) === 'نعم' });
    });
  }
  var pSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (pSh.getLastRow() >= 2) {
    pSh.getRange(2, 1, pSh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues().forEach(function(r) {
      var cl = String(r[1] || '').trim();
      if (!cl) return;
      if (tripFilter && String(r[2] || '').trim() !== tripFilter) return;
      get(paysByClient, cl).push({ ptype: String(r[3] || 'دفعة'), date: String(r[4] || ''), amount: _accNum_(r[5]), currency: String(r[6] || 'EGP'), rate: _accNum_(r[7]) });
    });
  }
  var clients = {};
  Object.keys(itemsByClient).forEach(function(cl) { clients[cl] = 1; });
  Object.keys(paysByClient).forEach(function(cl) { clients[cl] = 1; });
  var res = {};
  Object.keys(clients).forEach(function(cl) {
    var t = _accCalc_(itemsByClient[cl] || [], paysByClient[cl] || []);
    res[cl] = { netE: Math.round(t.netE * 100) / 100, netS: Math.round(t.netS * 100) / 100 };
  });
  return res;
}

// أرصدة كل العملاء (لدليل العملاء) — لأصحاب صلاحية عرض الحسابات فقط
function getClientsBalances(authToken) {
  _accPerm_(authToken, 'view');
  return { success: true, balances: _accAggBalances_(null) };
}

// أرصدة عملاء رحلة محددة (لعمود «المستحق» بإحصائية الرحلة)
function getTripClientsBalances(authToken, trip) {
  _accPerm_(authToken, 'view');
  return { success: true, balances: _accAggBalances_(String(trip || '').trim()) };
}

// 📊 (V4.48) ملخص حسابات كل عملاء رحلة واحدة في جدول واحد — شاشة «ملخص حسابات الرحلة» الجديدة.
// لكل عميل: الأعداد (رجال/سيدات/أطفال/رضّع) + بيان نصي لبنود حسابه + المستحق/المسدد/الرصيد بالعملتين.
// يشمل أيضاً عملاء لهم معتمرون بالرحلة لكن بلا حساب مفتوح بعد (hasAccount:false) بدل إسقاطهم بصمت.
function getTripAccountsSummary(authToken, tripName) {
  _accPerm_(authToken, 'view');
  tripName = String(tripName || '').trim();
  if (!tripName) return { success: false, error: 'اسم الرحلة مطلوب' };

  var itemsByClient = {}, paysByClient = {};
  var get = function(map, cl) { return (map[cl] = map[cl] || []); };

  var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  if (iSh.getLastRow() >= 2) {
    iSh.getRange(2, 1, iSh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues().forEach(function(r) {
      var cl = String(r[1] || '').trim();
      if (!cl || String(r[2] || '').trim() !== tripName) return;
      get(itemsByClient, cl).push({
        // 🧹 (V4.92) تنظيف علامة ربط ترحيل الرصيد الداخلية ⟦cf:...⟧ من البيان — كانت تظهر كحروف
        // غير مفهومة ببيان الحساب هنا (نفس التنظيف المطبَّق بالفعل بكشف حساب العميل نفسه)
        desc: String(r[3] || '').replace(/\s*⟦cf:[a-z0-9]+⟧\s*$/i, ''),
        currency: String(r[5] || 'EGP'), count: r[6], price: r[7],
        value: _accNum_(r[8]), isDiscount: String(r[9]) === 'نعم', isDirect: String(r[19]) === 'نعم',
        nights: Number(r[15]) || 0, order: _accNum_(r[18])
      });
    });
  }
  var pSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (pSh.getLastRow() >= 2) {
    pSh.getRange(2, 1, pSh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues().forEach(function(r) {
      var cl = String(r[1] || '').trim();
      if (!cl || String(r[2] || '').trim() !== tripName) return;
      get(paysByClient, cl).push({ ptype: String(r[3] || 'دفعة'), date: String(r[4] || ''), amount: _accNum_(r[5]), currency: String(r[6] || 'EGP'), rate: _accNum_(r[7]) });
    });
  }

  // 👤 أعداد كل عميل بهذه الرحلة (رجال/سيدات/أطفال/رضّع) من كشف المعتمرين — المشرف مُستبعَد
  var countsByClient = {};
  var pSheet = _getPilgrimsSheet_();
  if (pSheet && pSheet.getLastRow() >= 2) {
    var pC = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var P = _cellReader_(pC, PILGRIMS_COL_);
    pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
      if (String(P(r, 'tripName') || '').trim() !== tripName) return;
      var cl = String(P(r, 'client') || '').trim();
      if (!cl || cl.indexOf('المشرف') === 0) return;
      var type = String(P(r, 'type') || '').trim();
      var c = countsByClient[cl] = countsByClient[cl] || { men: 0, women: 0, children: 0, infants: 0 };
      if (type === 'ذكر') c.men++;
      else if (type === 'أنثى') c.women++;
      else if (type === 'طفل') c.children++;
      else if (type === 'رضيع') c.infants++;
    });
  }

  // 🔗 (V4.79) تحميل مجموعات الدمج لمعرفة لو العميل لديه حساب مدمج يشمل هذه الرحلة
  var mergeByClient = {};
  try {
    var mSh = _accSheet_(ACC_MERGE_SHEET, ACC_MERGE_HEADERS);
    if (mSh.getLastRow() >= 2) {
      mSh.getRange(2, 1, mSh.getLastRow() - 1, 2).getValues().forEach(function(mr) {
        var cl = String(mr[0] || '').trim();
        if (!cl) return;
        try { var trips = JSON.parse(mr[1] || '[]'); if (trips.indexOf(tripName) !== -1) mergeByClient[cl] = trips; } catch (e) {}
      });
    }
  } catch (e) {}
  // 💠 (V4.79) تحميل الدفعات العامة + دفعات رحلات مدمجة أخرى لحساب الرصيد الصحيح
  var genPaysByClient = {}, mergedPaysByClient = {};
  if (Object.keys(mergeByClient).length > 0 && pSh.getLastRow() >= 2) {
    pSh.getRange(2, 1, pSh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues().forEach(function(r) {
      var cl = String(r[1] || '').trim();
      var pTrip = String(r[2] || '').trim();
      if (!cl || !mergeByClient[cl]) return;
      if (pTrip === 'عام') { get(genPaysByClient, cl).push({ ptype: String(r[3] || 'دفعة'), date: String(r[4] || ''), amount: _accNum_(r[5]), currency: String(r[6] || 'EGP'), rate: _accNum_(r[7]) }); }
      else if (pTrip !== tripName && mergeByClient[cl].indexOf(pTrip) !== -1) { get(mergedPaysByClient, cl).push({ ptype: String(r[3] || 'دفعة'), date: String(r[4] || ''), amount: _accNum_(r[5]), currency: String(r[6] || 'EGP'), rate: _accNum_(r[7]) }); }
    });
  }

  // 🌊 (V4.83) نظام «الشلال»: توزيع الدفعات المشتركة (عامة + رحلات مدمجة أخرى) على كل رحلات
  // العميل المدمجة بترتيب تاريخ السفر من الأقدم للأحدث — كل رحلة تُستوفى بالكامل من المجمَّع
  // قبل الانتقال للتالية، والفائض يترحّل تلقائياً للرحلة الأحدث تباعًا (بطلب صريح)
  var mergedTripDueByClient = {}, mergedTripNamesSet = {};
  Object.keys(mergeByClient).forEach(function(cl) {
    mergeByClient[cl].forEach(function(tn) { mergedTripNamesSet[tn] = true; });
  });
  var tripDepartMs = {};
  if (Object.keys(mergedTripNamesSet).length > 0) {
    if (iSh.getLastRow() >= 2) {
      iSh.getRange(2, 1, iSh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues().forEach(function(r) {
        var cl = String(r[1] || '').trim();
        var tn = String(r[2] || '').trim();
        if (!cl || !mergeByClient[cl] || mergeByClient[cl].indexOf(tn) === -1) return;
        var m = mergedTripDueByClient[cl] = mergedTripDueByClient[cl] || {};
        var d = m[tn] = m[tn] || { dueE: 0, dueS: 0 };
        var v = _accNum_(r[8]); var isDisc = String(r[9]) === 'نعم'; var cur = String(r[5] || 'EGP');
        var signed = isDisc ? -v : v;
        if (cur === 'SAR') d.dueS += signed; else d.dueE += signed;
      });
    }
    var trSh = _getTripsSheet_();
    if (trSh.getLastRow() >= 2) {
      var trC = _robustColMap_(trSh, TRIPS_HEADERS_);
      var trT = _cellReader_(trC, TRIPS_COL_);
      trSh.getRange(2, 1, trSh.getLastRow() - 1, trSh.getLastColumn()).getValues().forEach(function(r) {
        var nm = String(trT(r, 'name') || '').trim();
        if (!nm || !mergedTripNamesSet[nm]) return;
        var d = trT(r, 'departDate');
        var dd = (d instanceof Date) ? d : _parseDmy_(_tripFormatDate_(d));
        tripDepartMs[nm] = dd ? dd.getTime() : 0;
      });
    }
  }

  var allClients = {};
  Object.keys(countsByClient).forEach(function(cl) { allClients[cl] = 1; });
  Object.keys(itemsByClient).forEach(function(cl) { allClients[cl] = 1; });
  Object.keys(paysByClient).forEach(function(cl) { allClients[cl] = 1; });

  // 📝 (V4.82) بيان الحساب نصاً واحداً: بند [مسافة] عدد/غرف×ليالي×سعر [مسافة] عملة — بيان توضيحي
  // فقط بلا كتابة حاصل الضرب (القيمة الناتجة) إطلاقاً؛ العملة تُفصل بمسافة لا بعلامة رياضية؛
  // تُكتب القيمة فقط للبنود المباشرة (isDirect) التي لا يوجد لها عدد/سعر أصلاً لعرضهما بديلاً
  // 🔀 (V4.88) نفس ترتيب البنود المحفوظ بكشف حساب العميل الفعلي لهذه الرحلة (حقل order — السحب
  // والإفلات)، مع دفع بنود الخصم دومًا لآخر القائمة (خصم الجنيه بعد آخر بند جنيه، وخصم الريال بعد
  // آخر بند ريال) — بطلب صريح ومؤكَّد
  var orderStatementItems_ = function(items) {
    var sorted = items.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    return sorted.filter(function(it) { return !it.isDiscount; }).concat(sorted.filter(function(it) { return it.isDiscount; }));
  };
  // 🔀 (V4.90) الفاصل بين كل بند والتالي: «+» دائمًا، إلا لو التالي بند خصم فيكون «−» بدلاً منه — بلا
  // فاصل مزدوج (كان يظهر «+ −خصم» معًا وهو خطأ)؛ أول بند بلا فاصل أصلاً
  var fmtStatement_ = function(rawItems) {
    var items = orderStatementItems_(rawItems);
    if (!items.length) return '';
    var out = '';
    items.forEach(function(it, idx) {
      var curTxt = it.currency === 'SAR' ? 'ريال' : 'جنيه';
      var nightsTxt = it.nights > 0 ? ' × ' + it.nights + ' ليلة' : '';
      var qty = (!it.isDirect && it.count) ? (it.count + nightsTxt + (it.price ? (' × ' + it.price) : '')) : '';
      var txt;
      if (qty) txt = it.desc + ' ' + qty + ' ' + curTxt;
      else if (it.price) txt = it.desc + ' ' + it.price + ' ' + curTxt;
      else txt = it.desc + ' ' + _accNum_(it.value) + ' ' + curTxt;
      // 🩹 (V4.105 / V4.123 / V4.128) لا تُكرَّر كلمة "خصم" لو كان بيان البند نفسه بادئاً بها
      // (مثال: بند وصفه "خصم فرق تذكرة" كان يظهر "خصم خصم فرق تذكرة" ببيان الحساب).
      // 🐞 سبب استمرار العطل رغم محاولتَي الإصلاح السابقتين: كان الفحص /^خصم\b/ يستخدم حدّ الكلمة
      // \b، وهو في جافاسكربت معرَّف على [A-Za-z0-9_] فقط — فلا يوجد "حدّ كلمة" بعد حرف عربي إطلاقاً،
      // وبالتالي كان الشرط يفشل دائماً مع أي نص عربي فتُضاف "خصم" مرة ثانية في كل مرة.
      // البديل: مطابقة بادئة صريحة (الكلمة وحدها، أو متبوعة بمسافة/علامة ترقيم).
      var descNorm = String(it.desc || '').replace(/^[\s‎‏؜\-–—]+/, '');
      if (it.isDiscount && !/^خصم(?:$|[\s:،.\-–—])/.test(descNorm)) txt = 'خصم ' + txt;
      out += (idx === 0 ? '' : (it.isDiscount ? ' − ' : ' + ')) + txt;
    });
    return out;
  };

  var rows = Object.keys(allClients).sort().map(function(cl) {
    var items = itemsByClient[cl] || [], pays = paysByClient[cl] || [];
    var c = countsByClient[cl] || { men: 0, women: 0, children: 0, infants: 0 };
    var hasAccount = items.length > 0 || pays.length > 0;
    var isMerged = !!mergeByClient[cl];
    var dueE = 0, dueS = 0, paidE = 0, paidS = 0, netE = 0, netS = 0;
    if (hasAccount && isMerged) {
      // 🌊 (V4.83) شلال: نحلّ إجمالي الدفعات الفعّالة (بعد تسوية أي تحويلات عملة) على مستوى كل
      // المجموعة المدمجة مرة واحدة، ثم نوزّعها على الرحلات بترتيب تاريخ السفر — كل رحلة تُستوفى
      // بالكامل قبل الانتقال للتالية، فتُظهر هذه الرحلة فقط حصتها الفعلية من السداد لا كل الدفعات
      var allPays = pays.slice().concat(genPaysByClient[cl] || []).concat(mergedPaysByClient[cl] || []);
      var mtDue = mergedTripDueByClient[cl] || {};
      var pooledItemsForFx = [];
      Object.keys(mtDue).forEach(function(tn) {
        var d = mtDue[tn];
        if (d.dueE) pooledItemsForFx.push({ value: Math.abs(d.dueE), currency: 'EGP', isDiscount: d.dueE < 0 });
        if (d.dueS) pooledItemsForFx.push({ value: Math.abs(d.dueS), currency: 'SAR', isDiscount: d.dueS < 0 });
      });
      var r = _accResolveFx_(pooledItemsForFx, allPays, 0, 0);
      var availE = Math.round((r.paidE - r.fxE) * 100) / 100;
      var availS = Math.round((r.paidS + r.fxS) * 100) / 100;
      var orderedTrips = Object.keys(mtDue).sort(function(a, b) { return (tripDepartMs[a] || 0) - (tripDepartMs[b] || 0); });
      orderedTrips.forEach(function(tn) {
        var d = mtDue[tn];
        var allocE = Math.max(0, Math.min(availE, d.dueE));
        availE = Math.round((availE - allocE) * 100) / 100;
        var allocS = Math.max(0, Math.min(availS, d.dueS));
        availS = Math.round((availS - allocS) * 100) / 100;
        if (tn === tripName) { dueE = d.dueE; dueS = d.dueS; paidE = allocE; paidS = allocS; }
      });
      dueE = Math.round(dueE * 100) / 100; dueS = Math.round(dueS * 100) / 100;
      netE = Math.round((dueE - paidE) * 100) / 100; netS = Math.round((dueS - paidS) * 100) / 100;
    } else if (hasAccount) {
      var t = _accCalc_(items, pays);
      dueE = Math.round((t.dueE - t.discE + t.fxE) * 100) / 100;
      dueS = Math.round((t.dueS - t.discS) * 100) / 100;
      paidE = Math.round(t.paidE * 100) / 100;
      paidS = Math.round((t.paidS + t.fxS) * 100) / 100;
      netE = Math.round(t.netE * 100) / 100;
      netS = Math.round(t.netS * 100) / 100;
    }
    return {
      client: cl, men: c.men, women: c.women, children: c.children, infants: c.infants,
      statementText: fmtStatement_(items),
      hasAccount: hasAccount,
      merged: isMerged,
      dueE: dueE, dueS: dueS, paidE: paidE, paidS: paidS, netE: netE, netS: netS
    };
  });

  return { success: true, trip: tripName, rows: rows };
}

// 📤 تحويل كشف الحساب (المبني في الواجهة بنفس تصميم الطباعة) إلى PDF على Drive للمشاركة/التنزيل
function accStatementPdf(authToken, htmlDoc, fileName) {
  _accPerm_(authToken, 'view');
  var folder = getDriveFolder_('TEMP');
  fileName = String(fileName || 'كشف حساب').replace(/[\\/:*?"<>|]/g, '-').trim();
  var htmlBlob = Utilities.newBlob(htmlDoc, 'text/html', fileName + '.html');
  var pdfBlob = htmlBlob.getAs('application/pdf');
  pdfBlob.setName(fileName + '.pdf');
  var file = folder.createFile(pdfBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    success: true,
    fileId: file.getId(),
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
    pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()),
    fileName: fileName
  };
}

// ---------- 🪄 توليد بنود مقترحة (لا يحفظ شيئاً — معاينة فقط) ----------
function accGenerateDraft(authToken, client, trip, mode) {
  _accPerm_(authToken, 'add');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  var stats = getClientTripStats(authToken, client);
  var row = null;
  stats.rows.forEach(function(r) { if (r.trip === trip) row = r; });
  if (!row) return { success: false, error: 'لا يوجد معتمرون مسجَّلون لهذا العميل في هذه الرحلة' };
  var cfg = _accPricing_();
  var roomFee = _accRoomFeeAt_(row.departDate);
  var items = [];
  // 🛂 (V4.39) معتمرو هذا العميل×الرحلة اللي ملاحظاتهم تذكر نوع تأشيرة/فيزا — تُفرَد ببند خاص (بطلب صريح)
  var visaPilgrims = _accClientPilgrimNotes_(client, trip).filter(function(p) { return _accIsVisaNote_(p.notes); });
  // ملاحظة: كل البنود المولّدة بلا أي نصوص شرح، والسعر يُترك فارغًا ليُدخل يدويًا (بطلب صريح)
  var push = function(desc, cat, currency, count, price, nights, company, notes) {
    items.push({ desc: desc, cat: cat, currency: currency, count: count, price: price || 0,
      nights: nights || 0, company: company || '', notes: notes || '' });
  };
  // 📊 التفصيلة الفعلية حسب (الفندق × طبيعة التسكين) بنفس مسميات كشف الإكسل
  // 💵 (V4.15 — بطلب صريح) لو للرحلة تسعير محفوظ (شاشة تسعير الرحلة) تُملأ أسعار التوليد
  // منه تلقائيًا حسب المستوى وطبيعة التسكين — ولو لا تسعير تبقى فارغة للإدخال اليدوي المعتاد
  var breakdown = _accClientBreakdown_(client, trip);
  var _tp = (mode !== 'بنود') ? _accTripPricing_(trip) : null;
  var pushBreakdown = function() {
    breakdown.forEach(function(g) { push(g.desc, g.cat, 'EGP', g.count, _tp ? _accPriceFor_(_tp, g) : 0, 0, ''); });
  };
  if (mode === 'بنود') {
    var hz = _accClientHousing_(client, trip);
    // 🏷️ (V4.13) أسعار العميل المثبتة بفترات: السعر الساري بتاريخ سفر الرحلة يتقدم على أي افتراضي
    var cp = _accClientPricing_(client);
    var pr = function(key, fb) {
      var v = _accClientPriceAt_(cp, key, row.departDate);
      return (v !== null) ? v : (fb || 0);
    };
    // بنود الجنيه المصري
    push('رسوم غرفة', 'كبير', 'EGP', row.adults + row.children, pr('رسوم غرفة', roomFee), 0, row.company || '');
    push('رسوم غرفة المشرف', 'مشرف', 'EGP', 1, pr('رسوم غرفة المشرف', cfg.supRoomFee || 200), 0, row.company || '');
    push('إشراف', 'كبير', 'EGP', row.adults + row.children, pr('إشراف'), 0, '');
    // ✈️ بيان التذاكر من إشعار الرحلة إن وُجد: الخطوط + خط السير (مثل: تذاكر مصر للطيران القاهرة/المدينة - جدة/القاهرة)
    var tkRoute = (hz.arrRoute || '') + (hz.depRoute ? ' - ' + hz.depRoute : '');
    var tkDesc = tkRoute ? ('تذاكر ' + (hz.airline ? hz.airline + ' ' : '') + tkRoute) : 'تذاكر طيران';
    if (row.adults) push(tkDesc, 'كبير', 'EGP', row.adults, pr('تذاكر'), 0, '');
    if (row.children) push('تذاكر الأطفال', 'طفل بسرير', 'EGP', row.children, pr('تذاكر الأطفال'), 0, '');
    if (row.infants) push('تذاكر الرضع', 'رضيع', 'EGP', row.infants, pr('تذاكر الرضع'), 0, '');
    // بنود الريال السعودي
    // 🛂 (V4.39) المعتمرون بملاحظة تأشيرة خاصة يُفردون ببند مستقل بدل احتسابهم ضمن عدد «تأشيرات» العام
    var _visaCount = visaPilgrims.length;
    var _regVisaCount = row.total - _visaCount;
    if (_regVisaCount > 0) push('تأشيرات', 'كبير', 'SAR', _regVisaCount, pr('تأشيرات'), 0, '');
    visaPilgrims.forEach(function(p) {
      push('تأشيرة ' + p.name + ' (' + p.notes + ')', 'كبير', 'SAR', 1, 0, 0, '');
    });
    push('نقل سعودي', 'أخرى', 'SAR', 1, pr('نقل سعودي'), 0, '');
    // 🏨 (V4.39) الفندق + فترة الإقامة (دخول/خروج) معًا بحقل الشركة، مثال: «ديوان المدينة من 1-8 الى 4-8»
    var madStay = hz.madHotel ? (hz.madHotel + _accStayRange_(hz.madCheckIn, hz.madCheckOut)) : '';
    var makStay = hz.makHotel ? (hz.makHotel + _accStayRange_(hz.makCheckIn, hz.makCheckOut)) : '';
    push('سكن المدينة', 'أخرى', 'SAR', hz.madRooms, pr('سكن المدينة'), hz.madNights, madStay, '');
    push('سكن مكة', 'أخرى', 'SAR', hz.makRooms, pr('سكن مكة'), hz.makNights, makStay, '');
    push('بدلات المشرف', 'مشرف', 'SAR', 1, pr('بدلات المشرف'), 0, '');
    // 🧾 (V4.39) شركة/ضرائب لكل معتمر بالجنيه، والإعاشة لكل معتمر بالريال — بطلب صريح
    push('شركة', 'كبير', 'EGP', row.total, pr('شركة'), 0, '');
    push('ضرائب', 'كبير', 'EGP', row.total, pr('ضرائب'), 0, '');
    push('الإعاشة', 'كبير', 'SAR', row.total, pr('الإعاشة'), 0, '');
    // 🧩 بنود مخصصة مسعّرة للعميل (خارج الأساسية) وسارية بتاريخ الرحلة — تُقترح بعدد 1
    if (cp && cp.items) {
      var _baseSet = {};
      ACC_BOND_BASE_.forEach(function(b) { _baseSet[b.key] = 1; });
      Object.keys(cp.items).forEach(function(k) {
        if (_baseSet[k]) return;
        var v = _accClientPriceAt_(cp, k, row.departDate);
        if (v === null) return;
        push(k, 'أخرى', (cp.items[k].currency === 'SAR') ? 'SAR' : 'EGP', 1, v, 0, '');
      });
    }
  } else {
    // نمط «برنامج»: سطر لكل (مستوى/فندق × طبيعة تسكين) بالتقسيم الفعلي من الكشف
    if (breakdown.length) pushBreakdown();
    else {
      if (row.adults) push('برنامج الرحلة - كبار', 'كبير', 'EGP', row.adults, 0, 0, '');
      if (row.children) push('برنامج الرحلة - أطفال', 'طفل بسرير', 'EGP', row.children, 0, 0, '');
      if (row.infants) push('برنامج الرحلة - رضع', 'رضيع', 'EGP', row.infants, 0, 0, '');
    }
    // 🛂 (V4.39) نمط «برنامج»: العدد يبقى كما هو، ويُضاف سطر «خصم تأشيرة» إضافي بالجنيه لكل معتمر بملاحظة تأشيرة خاصة
    visaPilgrims.forEach(function(p) {
      push('خصم تأشيرة - ' + p.name + ' (' + p.notes + ')', 'خصم', 'EGP', 1, 0, 0, '');
    });
  }
  return { success: true, items: items, counts: { a: row.adults, c: row.children, i: row.infants, t: row.total } };
}

// ---------- ✏️ تعديل بنود رحلة كاملة دفعة واحدة ----------
function updateAccItemsBulk(authToken, client, trip, itemsArr) {
  var session = _accPerm_(authToken, 'edit');
  client = String(client || '').trim(); trip = String(trip || '').trim();
  var sh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
  if (sh.getLastRow() < 2) return { success: false, error: 'لا توجد بنود' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues();
  var rowById = {}, dataById = {};
  vals.forEach(function(r, i) { rowById[String(r[0])] = i + 2; dataById[String(r[0])] = r; });
  var now = new Date(), n = 0;
  var updated = []; // 🚀 (V4.89) value/isDiscount لكل بند مُعدَّل — لتحديث محلي فوري بدل إعادة تحميل الحساب كاملاً
  (itemsArr || []).forEach(function(item) {
    var rowIdx = rowById[String(item.id)];
    if (!rowIdx || !String(item.desc || '').trim()) return;
    var count = _accNum_(item.count), price = _accNum_(item.price), nights = _accNum_(item.nights);
    var value = Math.round(count * price * (nights > 0 ? nights : 1) * 100) / 100;
    var currency = (item.currency === 'SAR') ? 'SAR' : 'EGP';
    var isDisc = item.cat === 'خصم';
    updated.push({ id: String(item.id), value: value, isDiscount: isDisc });
    // 🔒 التعديل الجماعي يحفظ كل الصفوف — نعلّم «معدّل» فقط لو قيم البند التلقائي تغيّرت فعلاً
    // (وإلا يفقد كل بنود الرحلة مزامنتها التلقائية بمجرد فتح نافذة التعديل والحفظ بلا تغيير)
    var _r = dataById[String(item.id)];
    if (_r && String(_r[17]) === 'نعم') {
      var _changed = String(_r[3]) !== String(item.desc) || _accNum_(_r[6]) !== count ||
                     _accNum_(_r[7]) !== price || String(_r[5] || 'EGP') !== currency ||
                     _accNum_(_r[15]) !== nights;
      if (_changed) sh.getRange(rowIdx, 18).setValue('معدّل');
    }
    // 🔁 حافظ على علامة ربط ترحيل الرصيد ⟦cf:...⟧ إن وُجدت بالبيان الأصلي حتى لو عُدِّل البيان الظاهر
    var _oldD2 = _r ? String(_r[3] || '') : ''; var _cfM2 = _oldD2.match(/⟦cf:[a-z0-9]+⟧/i);
    var _newD2 = String(item.desc || '');
    if (_cfM2 && _newD2.indexOf('⟦cf:') === -1) _newD2 += ' ' + _cfM2[0];
    sh.getRange(rowIdx, 4, 1, 8).setValues([[_newD2, item.cat || '', currency, count, price, value, isDisc ? 'نعم' : 'لا', item.notes || '']]);
    sh.getRange(rowIdx, 14, 1, 4).setValues([[session.username, now, nights || '', item.company || '']]);
    // 🔀 (V4.26) السحب والإفلات لترتيب البنود — يُحفظ ترتيبها الجديد هنا لو أُرسل مع التعديل الجماعي
    if (item.order !== undefined && item.order !== null) sh.getRange(rowIdx, 19).setValue(item.order);
    n++;
  });
  if (!n) return { success: false, error: 'لم يُعدَّل أي بند' };
  logChange_(session.username, 'تعديل بنود حساب دفعة واحدة', client, trip, '-', n + ' بند');
  return { success: true, count: n, updated: updated };
}

// حفظ رحلة (إضافة جديدة لو targetRow فارغ، تعديل لو موجود)
// ليالي المدينة/مكة تُحسب سيرفر-سايد دائماً من فرق التواريخ (المصدر المعتمد الوحيد)
function saveTrip(authToken, targetRow, tripData) {
  var session = requireAuth_(authToken);

  var name = String(tripData.name || "").trim();
  if (!name) throw new Error("اسم الرحلة مطلوب");

  var sheet = _getTripsSheet_();

  // 🔒 خريطة أعمدة متينة (بالاسم مع رجوع قانوني)
  var C = _robustColMap_(sheet, TRIPS_HEADERS_);
  var width = sheet.getLastColumn();
  var colAt = function(key) { var idx = C[TRIPS_COL_[key]]; return idx === undefined ? -1 : idx; };
  var nameCol = colAt('name');

  // منع تكرار اسم الرحلة (لأنه المفتاح الرابط مع كشف المعتمرين) — بقراءة عمود الاسم بالخريطة
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2 && nameCol !== -1) {
    var names = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    for (var i = 0; i < names.length; i++) {
      var existingRow = i + 2;
      if (String(names[i][nameCol] || "").trim() === name && existingRow !== Number(targetRow)) {
        throw new Error("يوجد رحلة أخرى بنفس الاسم بالفعل: " + name);
      }
    }
  }

  var madinahNights = _diffDays_(tripData.madinahCheckIn, tripData.madinahCheckOut);
  var makkahNights = _diffDays_(tripData.makkahCheckIn, tripData.makkahCheckOut);

  // نحافظ على القيم غير المُرسَلة عبر قراءة الصف الحالي كأساس
  var base = targetRow ? sheet.getRange(Number(targetRow), 1, 1, width).getValues()[0] : null;
  var baseGet = function(key) { var idx = colAt(key); return (base && idx !== -1) ? base[idx] : ""; };

  var vals = {};
  vals[TRIPS_COL_.name] = name;
  vals[TRIPS_COL_.company] = tripData.company || "";
  vals[TRIPS_COL_.agent] = tripData.agent || "";
  vals[TRIPS_COL_.supervisor] = tripData.supervisor || "";
  vals[TRIPS_COL_.departDate] = tripData.departDate || "";
  vals[TRIPS_COL_.returnDate] = tripData.returnDate || "";
  vals[TRIPS_COL_.airline] = tripData.airline || "";
  vals[TRIPS_COL_.madinahHotel] = tripData.madinahHotel || "";
  vals[TRIPS_COL_.madinahCheckIn] = tripData.madinahCheckIn || "";
  vals[TRIPS_COL_.madinahCheckOut] = tripData.madinahCheckOut || "";
  vals[TRIPS_COL_.madinahNights] = madinahNights === null ? "" : madinahNights;
  vals[TRIPS_COL_.makkahHotel] = tripData.makkahHotel || "";
  vals[TRIPS_COL_.makkahCheckIn] = tripData.makkahCheckIn || "";
  vals[TRIPS_COL_.makkahCheckOut] = tripData.makkahCheckOut || "";
  vals[TRIPS_COL_.makkahNights] = makkahNights === null ? "" : makkahNights;
  vals[TRIPS_COL_.linkedBookingId] = tripData.linkedBookingId || (targetRow ? String(baseGet('linkedBookingId') || "") : "");
  vals[TRIPS_COL_.createdAt] = targetRow ? baseGet('createdAt') : new Date();
  vals[TRIPS_COL_.bookedSeats] = (tripData.bookedSeats !== undefined && tripData.bookedSeats !== "") ? Number(tripData.bookedSeats) : "";
  vals[TRIPS_COL_.direction] = tripData.direction || "";
  vals[TRIPS_COL_.ticketUrl] = tripData.ticketUrl || "";
  vals[TRIPS_COL_.ticketFileId] = tripData.ticketFileId || "";

  var rowArr = _buildRowByName_(C, width, vals, base);

  var oldName = null;
  var _savedRow;
  if (targetRow) {
    oldName = String(baseGet('name') || "").trim();
    // ✍️ كتابة ضيّقة: نكتب فقط النطاق المتصل الذي يغطي حقول vals، فلا نلمس الأعمدة المحفوظة
    // (المسودة/الدور/المرجع/الفنادق الإضافية/خط السير/المشرفون) — يطابق سلوك الأصل ويتفادى أي سباق كتابة
    var _idxs = [];
    Object.keys(vals).forEach(function(nm) { if (C[nm] !== undefined) _idxs.push(C[nm]); });
    var minI = Math.min.apply(null, _idxs), maxI = Math.max.apply(null, _idxs);
    var slice = rowArr.slice(minI, maxI + 1);
    sheet.getRange(Number(targetRow), minI + 1, 1, slice.length).setValues([slice]);
    logChange_(session.username, "تعديل رحلة", name, "بيانات الرحلة", oldName, name);
    // لو اسم الرحلة اتغيّر، حدّث اسمها في كشف المعتمرين والإشعارات المرتبطة عشان الربط ما ينكسرش
    // 🔗 (V4.125) الانتشار الكامل: كشف المعتمرين + الإشعارات + كل شيتات الحسابات والتسعير
    // ومجموعات الدمج وملفات الوزارة وملاحظات التسكين — وإلا تفقد كلها ارتباطها بالرحلة بعد التسمية
    if (oldName && oldName !== name) {
      _renameTripInPilgrims_(oldName, name);
      _renameTripInBookings_(oldName, name);
      _cascadeTripRename_(oldName, name);
    }
    _savedRow = Number(targetRow);
  } else {
    sheet.appendRow(rowArr);
    logChange_(session.username, "إنشاء رحلة", name, "رحلة جديدة", "-", name);
    _savedRow = sheet.getLastRow();
  }

  // 🧭 حقول خط السير — تُكتب فقط لو أرسلها العميل صراحةً (بأسماء الأعمدة)
  var setByName = function(key, value) { var idx = colAt(key); if (idx !== -1) sheet.getRange(_savedRow, idx + 1).setValue(value); };
  if (tripData.arrivalPort     !== undefined) setByName('arrivalPort', tripData.arrivalPort || "");
  if (tripData.departurePort   !== undefined) setByName('departurePort', tripData.departurePort || "");
  if (tripData.arrivalTime     !== undefined) setByName('arrivalTime', tripData.arrivalTime || "");
  if (tripData.departureTime   !== undefined) setByName('departureTime', tripData.departureTime || "");
  if (tripData.arrivalFlight   !== undefined) setByName('arrivalFlight', tripData.arrivalFlight || "");
  if (tripData.departureFlight !== undefined) setByName('departureFlight', tripData.departureFlight || "");
  // 📱 (V4.139) أرقام جوالات المشرف/المشرفين — حقل نص حر، يُكتب فقط لو أُرسل صراحةً (كتابة خلية واحدة
  // مستقلة كباقي حقول خط السير أعلاه، فلا يتّسع نطاق الكتابة الضيّق لبقية الرحلة ولا يتصادم مع أي تعديل متزامن)
  if (tripData.supervisorPhones !== undefined) setByName('supervisorPhones', tripData.supervisorPhones || "");

  // 👥 المشرفون: عمود المشرفون(JSON) + الدور (للتوافق) — يُكتب فقط عند إرسال بيانات مشرف
  if (tripData.supervisors !== undefined || tripData.supervisor !== undefined || tripData.supervisorRole !== undefined) {
    var supList = _buildSupervisorsList_(tripData);
    setByName('supervisorsJson', JSON.stringify(supList));
    if (supList.length) {
      setByName('supervisor', supList[0].name);   // اسم المشرف الأول (لا نص مُجمَّع)
      setByName('supervisorRole', supList[0].role);
    } else {
      setByName('supervisorRole', tripData.supervisorRole || "مرافق");
    }
  }

  // 🔄 مزامنة الرحلة → الإشعار المرتبط (لا توقف الحفظ لو فشلت)
  try { _propagateTripChangesToBooking_(name); } catch (e) { Logger.log('propagate trip→booking failed: ' + e); }

  clearAllCache(); // ضمان تحديث قائمة الرحلات حتى لو لا يوجد إشعار مرتبط
  return { success: true, madinahNights: madinahNights, makkahNights: makkahNights };
}

/* ============================================================
   🔄 المزامنة الثنائية الاتجاه بين الإشعار (Bookings) والرحلة (Trips)
   ⚠️ لا تستدعي saveTrip أو saveBookingToServer داخلياً — تكتب مباشرة على الشيت لتفادي الحلقة اللانهائية
   ============================================================ */

/**
 * تحديث الرحلة المرتبطة عند تعديل الإشعار (المصدر: Bookings → الهدف: Trips)
 * تُستدعى في نهاية saveBookingToServer.
 */
function _propagateBookingChangesToTrip_(bookingId, bookingData) {
  var tripName = String((bookingData && bookingData.tripName) || "").trim();
  if (!tripName) return;

  var sheet = _getTripsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // 🔒 خريطة أعمدة متينة + كتابة بالاسم
  var C = _robustColMap_(sheet, TRIPS_HEADERS_);
  var width = sheet.getLastColumn();
  var nameCol = C[TRIPS_COL_.name];
  var setT = function(rowIdx, key, value) { var idx = C[TRIPS_COL_[key]]; if (idx !== undefined) sheet.getRange(rowIdx, idx + 1).setValue(value); };

  var names = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (var i = 0; i < names.length; i++) {
    if (nameCol !== undefined && String(names[i][nameCol] || "").trim() === tripName) {
      var rowIdx = i + 2;
      // 👥 مزامنة بيانات الهوية الأساسية (إشعار → رحلة): الشركة والوكيل والمشرف
      if (bookingData.company)    setT(rowIdx, 'company', bookingData.company);
      if (bookingData.agent)      setT(rowIdx, 'agent', bookingData.agent);
      // 👥 المشرفون: خزّن القائمة الكاملة + الاسم/الدور الأساسي للتوافق
      var _bSupList = _buildSupervisorsList_(bookingData);
      if (_bSupList.length) {
        setT(rowIdx, 'supervisorsJson', JSON.stringify(_bSupList));
        setT(rowIdx, 'supervisor', _bSupList[0].name);
        setT(rowIdx, 'supervisorRole', _bSupList[0].role);
      } else if (bookingData.supervisor) {
        setT(rowIdx, 'supervisor', bookingData.supervisor);
      }
      // حقول خط السير
      setT(rowIdx, 'arrivalPort', bookingData.arrivalPort || "");
      setT(rowIdx, 'departurePort', bookingData.departurePort || "");
      setT(rowIdx, 'arrivalTime', bookingData.arrivalTime || "");
      setT(rowIdx, 'departureTime', bookingData.departureTime || "");
      setT(rowIdx, 'arrivalFlight', bookingData.arrivalFlight || "");
      setT(rowIdx, 'departureFlight', bookingData.departureFlight || "");
      // التواريخ الأساسية (الذهاب=الوصول للسعودية، العودة=المغادرة) واتجاه الإقامة
      if (bookingData.arrivalDate)   setT(rowIdx, 'departDate', bookingData.arrivalDate);
      if (bookingData.departureDate) setT(rowIdx, 'returnDate', bookingData.departureDate);
      if (bookingData.direction)     setT(rowIdx, 'direction', bookingData.direction);
      clearAllCache();
      return;
    }
  }
}

/**
 * تحديث الإشعار المرتبط عند تعديل الرحلة (المصدر: Trips → الهدف: Bookings)
 * تُستدعى في نهاية saveTrip و saveTripDraft.
 * أعمدة Bookings (1-based): 10=منفذ الوصول, 11=تاريخ الوصول, 12=ساعة الوصول, 13=رقم رحلة الوصول,
 *                          14=تاريخ المغادرة, 15=رقم رحلة المغادرة, 16=ساعة المغادرة, 17=منفذ المغادرة
 */
function _propagateTripChangesToBooking_(tripName) {
  tripName = String(tripName || "").trim();
  if (!tripName) return false;

  var tripsSheet = _getTripsSheet_();
  var tLastRow = tripsSheet.getLastRow();
  if (tLastRow < 2) return false;

  // 🔒 قراءة صف الرحلة بأسماء الأعمدة
  var TC = _robustColMap_(tripsSheet, TRIPS_HEADERS_);
  var T = _cellReader_(TC, TRIPS_COL_);
  var tData = tripsSheet.getRange(2, 1, tLastRow - 1, tripsSheet.getLastColumn()).getValues();
  var tripRow = null, tripRowNum = -1;
  for (var i = 0; i < tData.length; i++) {
    if (String(T(tData[i], 'name') || "").trim() === tripName) { tripRow = tData[i]; tripRowNum = i + 2; break; }
  }
  if (!tripRow) return false;

  var linkedBookingId = String(T(tripRow, 'linkedBookingId') || "").trim();

  var bookingsSheet = getSpreadsheet_().getSheetByName("Bookings");
  if (!bookingsSheet) return false;
  var bData = bookingsSheet.getDataRange().getValues();
  // 🔒 خريطة أعمدة الإشعارات بالاسم + كاتب صف بالاسم (يقاوم إعادة الترتيب)
  var BC = _robustColMap_(bookingsSheet, BOOKINGS_HEADERS_);
  var BR = _cellReader_(BC, BOOKINGS_COL_);
  var setB = function(rowIdx, key, value) { var idx = BC[BOOKINGS_COL_[key]]; if (idx !== undefined) bookingsSheet.getRange(rowIdx, idx + 1).setValue(value); };

  for (var b = 1; b < bData.length; b++) {
    var _bId = String(BR(bData[b], 'id') || "").trim();
    var idMatch = linkedBookingId && _bId === linkedBookingId;
    var nameMatch = !idMatch && String(BR(bData[b], 'tripName') || "").trim() === tripName;
    if (idMatch || nameMatch) {
      var rowIdx = b + 1;
      // إصلاح ذاتي: خزّن رقم الإشعار في عمود الربط بالرحلة لو كان فارغاً
      if (!linkedBookingId && _bId && tripRowNum !== -1) {
        try { var _lbIdx = TC[TRIPS_COL_.linkedBookingId]; if (_lbIdx !== undefined) tripsSheet.getRange(tripRowNum, _lbIdx + 1).setValue(_bId); } catch (le) {}
      }
      // القيم من صف الرحلة (بالاسم)
      var _company = T(tripRow, 'company'), _agent = T(tripRow, 'agent');
      var _ticketUrl = T(tripRow, 'ticketUrl'), _ticketFileId = T(tripRow, 'ticketFileId');
      var _aPort = T(tripRow, 'arrivalPort'), _dPort = T(tripRow, 'departurePort');
      var _aTime = T(tripRow, 'arrivalTime'), _dTime = T(tripRow, 'departureTime');
      var _aFlight = T(tripRow, 'arrivalFlight'), _dFlight = T(tripRow, 'departureFlight');
      var _departD = T(tripRow, 'departDate'), _returnD = T(tripRow, 'returnDate');
      var _madH0 = T(tripRow, 'madinahHotel'), _makH0 = T(tripRow, 'makkahHotel');
      var _madCI = T(tripRow, 'madinahCheckIn'), _madCO = T(tripRow, 'madinahCheckOut');
      var _makCI = T(tripRow, 'makkahCheckIn'), _makCO = T(tripRow, 'makkahCheckOut');
      var _madN = T(tripRow, 'madinahNights'), _makN = T(tripRow, 'makkahNights');
      var _dir = T(tripRow, 'direction');
      // 👥 مزامنة بيانات الهوية الأساسية: الشركة المصرية والوكيل السعودي والمشرف (بالاسم)
      if (_company) setB(rowIdx, 'company', _company);   // الشركة المصرية
      if (_agent)   setB(rowIdx, 'agent', _agent);       // الوكيل السعودي
      // المشرف: نص العرض المُجمَّع لكل المشرفين (مطابق للفنادق: مفصولون بـ /)
      var _supDisp = _supervisorsDisplay_(_parseSupervisorsRow_(tripRow, TC));
      if (_supDisp) setB(rowIdx, 'supervisor', _supDisp);        // المشرف
      // 🎫 مرجع تذكرة الرحلة (لو مرفوعة بالرحلة)
      if (_ticketUrl)    setB(rowIdx, 'ticketUrl', _ticketUrl); // رابط التذكرة
      if (_ticketFileId) setB(rowIdx, 'ticketFileId', _ticketFileId); // معرف ملف التذكرة
      if (_aPort)   setB(rowIdx, 'arrivalPort', _aPort); // منفذ الوصول
      if (_dPort)   setB(rowIdx, 'departurePort', _dPort); // منفذ المغادرة
      if (_aTime)   setB(rowIdx, 'arrivalTime', _aTime); // ساعة الوصول
      if (_dTime)   setB(rowIdx, 'departureTime', _dTime); // ساعة المغادرة
      if (_aFlight) setB(rowIdx, 'arrivalFlight', _aFlight); // رقم رحلة الوصول
      if (_dFlight) setB(rowIdx, 'departureFlight', _dFlight); // رقم رحلة المغادرة
      if (_departD) setB(rowIdx, 'arrivalDate', _departD);  // تاريخ الوصول
      if (_returnD) setB(rowIdx, 'departureDate', _returnD);  // تاريخ المغادرة
      // 🏨 مزامنة السكن والليالي: الفندق الأساسي + الفنادق الإضافية (JSON) مدموجة بـ " / "
      var _madExtra = [], _makExtra = [];
      try { _madExtra = JSON.parse(T(tripRow, 'madinahExtra') || "[]"); } catch (je1) {}
      try { _makExtra = JSON.parse(T(tripRow, 'makkahExtra') || "[]"); } catch (je2) {}
      var _madHotels = [_madH0].concat(_madExtra).filter(Boolean).join(" / ");
      var _makHotels = [_makH0].concat(_makExtra).filter(Boolean).join(" / ");
      if (_madHotels) setB(rowIdx, 'madinahHotel', _madHotels);   // فندق المدينة
      if (_madCI)  setB(rowIdx, 'madinahCheckIn', _madCI);  // دخول المدينة
      if (_madCO)  setB(rowIdx, 'madinahCheckOut', _madCO);  // خروج المدينة
      if (_madN !== "" && _madN !== null && _madN !== undefined) setB(rowIdx, 'madinahNights', _madN); // ليالي المدينة
      if (_makHotels) setB(rowIdx, 'makkahHotel', _makHotels);   // فندق مكة
      if (_makCI)  setB(rowIdx, 'makkahCheckIn', _makCI); // دخول مكة
      if (_makCO)  setB(rowIdx, 'makkahCheckOut', _makCO); // خروج مكة
      if (_makN !== "" && _makN !== null && _makN !== undefined) setB(rowIdx, 'makkahNights', _makN); // ليالي مكة
      if (_dir) setB(rowIdx, 'direction', _dir); // اتجاه الإقامة
      clearAllCache();
      return true;
    }
  }
  return false;
}

/**
 * غلاف مُصادَق يُستدعى من الواجهة لمزامنة الرحلة → الإشعار المرتبط عند الطلب
 * (يُستعمل بعد رفع تذكرة الرحلة لضمان بقاء الإشعار متسقاً مع حالة الرحلة المحفوظة)
 */
function syncTripBookingByName(authToken, tripName) {
  requireAuth_(authToken);
  try {
    var synced = _propagateTripChangesToBooking_(tripName);
    return synced
      ? { success: true, synced: true }
      : { success: false, synced: false, error: "لا يوجد إشعار مرتبط بهذه الرحلة بعد — أنشئ الإشعار من زر ✈️ إشعار وصول أولاً" };
  } catch (e) {
    Logger.log('syncTripBookingByName failed: ' + e);
    return { success: false, error: String(e) };
  }
}

/**
 * 🔗 (V4.23) مقارنة بيانات الوصول/المغادرة/الفنادق بين رحلة وإشعارها المرتبط — للعرض جنبًا إلى جنب
 * بشاشة الرحلة مع زر اعتماد لكل مجموعة، بدل مزامنة صامتة تلقائية باتجاه واحد فقط.
 */
function getTripBookingCompare(authToken, tripName) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  if (!tripName) return { success: false, error: "اسم الرحلة مطلوب" };

  var tripsSheet = _getTripsSheet_();
  var tLastRow = tripsSheet.getLastRow();
  if (tLastRow < 2) return { success: false, error: "لا توجد رحلات" };
  var TC = _robustColMap_(tripsSheet, TRIPS_HEADERS_);
  var T = _cellReader_(TC, TRIPS_COL_);
  var tData = tripsSheet.getRange(2, 1, tLastRow - 1, tripsSheet.getLastColumn()).getValues();
  var tripRow = null;
  for (var i = 0; i < tData.length; i++) {
    if (String(T(tData[i], 'name') || "").trim() === tripName) { tripRow = tData[i]; break; }
  }
  if (!tripRow) return { success: false, error: "الرحلة غير موجودة" };

  var linkedBookingId = String(T(tripRow, 'linkedBookingId') || "").trim();
  var bookingsSheet = getSpreadsheet_().getSheetByName("Bookings");
  if (!bookingsSheet || bookingsSheet.getLastRow() < 2) return { success: false, error: "لا يوجد إشعار مرتبط بهذه الرحلة بعد" };
  var BC = _robustColMap_(bookingsSheet, BOOKINGS_HEADERS_);
  var BR = _cellReader_(BC, BOOKINGS_COL_);
  var bData = bookingsSheet.getDataRange().getValues();
  var bookingRow = null;
  for (var b = 1; b < bData.length; b++) {
    var _bId = String(BR(bData[b], 'id') || "").trim();
    var idMatch = linkedBookingId && _bId === linkedBookingId;
    var nameMatch = !idMatch && String(BR(bData[b], 'tripName') || "").trim() === tripName;
    if (idMatch || nameMatch) { bookingRow = bData[b]; break; }
  }
  if (!bookingRow) return { success: false, error: "لا يوجد إشعار مرتبط بهذه الرحلة بعد" };

  var trip = {
    arrivalPort: String(T(tripRow, 'arrivalPort') || ""), arrivalDate: _tripFormatDate_(T(tripRow, 'departDate')),
    arrivalTime: String(T(tripRow, 'arrivalTime') || ""), arrivalFlight: String(T(tripRow, 'arrivalFlight') || ""),
    departurePort: String(T(tripRow, 'departurePort') || ""), departureDate: _tripFormatDate_(T(tripRow, 'returnDate')),
    departureTime: String(T(tripRow, 'departureTime') || ""), departureFlight: String(T(tripRow, 'departureFlight') || ""),
    madinahHotel: String(T(tripRow, 'madinahHotel') || ""), madinahCheckIn: _tripFormatDate_(T(tripRow, 'madinahCheckIn')),
    madinahCheckOut: _tripFormatDate_(T(tripRow, 'madinahCheckOut')), madinahNights: String(T(tripRow, 'madinahNights') || ""),
    makkahHotel: String(T(tripRow, 'makkahHotel') || ""), makkahCheckIn: _tripFormatDate_(T(tripRow, 'makkahCheckIn')),
    makkahCheckOut: _tripFormatDate_(T(tripRow, 'makkahCheckOut')), makkahNights: String(T(tripRow, 'makkahNights') || "")
  };
  var booking = {
    arrivalPort: String(BR(bookingRow, 'arrivalPort') || ""), arrivalDate: String(BR(bookingRow, 'arrivalDate') || ""),
    arrivalTime: String(BR(bookingRow, 'arrivalTime') || ""), arrivalFlight: String(BR(bookingRow, 'arrivalFlight') || ""),
    departurePort: String(BR(bookingRow, 'departurePort') || ""), departureDate: String(BR(bookingRow, 'departureDate') || ""),
    departureTime: String(BR(bookingRow, 'departureTime') || ""), departureFlight: String(BR(bookingRow, 'departureFlight') || ""),
    madinahHotel: String(BR(bookingRow, 'madinahHotel') || ""), madinahCheckIn: String(BR(bookingRow, 'madinahCheckIn') || ""),
    madinahCheckOut: String(BR(bookingRow, 'madinahCheckOut') || ""), madinahNights: String(BR(bookingRow, 'madinahNights') || ""),
    makkahHotel: String(BR(bookingRow, 'makkahHotel') || ""), makkahCheckIn: String(BR(bookingRow, 'makkahCheckIn') || ""),
    makkahCheckOut: String(BR(bookingRow, 'makkahCheckOut') || ""), makkahNights: String(BR(bookingRow, 'makkahNights') || "")
  };
  return { success: true, trip: trip, booking: booking, bookingId: String(BR(bookingRow, 'id') || "") };
}

/**
 * 🔗 (V4.23) اعتماد بيانات مجموعة واحدة (وصول/مغادرة/مدينة/مكة) من الإشعار المرتبط إلى الرحلة —
 * نسخة يدوية لمرة واحدة بضغطة المستخدم، تبقى بعدها بيانات الرحلة قابلة للتعديل العادي دون أي مزامنة تلقائية عكسية.
 */
function adoptBookingGroupToTrip(authToken, tripName, group) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'trips.edit')) throw new Error('لا تملك صلاحية تعديل الرحلات');
  tripName = String(tripName || "").trim();
  var cmp = getTripBookingCompare(authToken, tripName);
  if (!cmp.success) return cmp;
  var b = cmp.booking;

  var tripsSheet = _getTripsSheet_();
  var TC = _robustColMap_(tripsSheet, TRIPS_HEADERS_);
  var T = _cellReader_(TC, TRIPS_COL_);
  var tLastRow = tripsSheet.getLastRow();
  var tData = tripsSheet.getRange(2, 1, tLastRow - 1, tripsSheet.getLastColumn()).getValues();
  var rowNum = -1;
  for (var i = 0; i < tData.length; i++) {
    if (String(T(tData[i], 'name') || "").trim() === tripName) { rowNum = i + 2; break; }
  }
  if (rowNum === -1) return { success: false, error: "الرحلة غير موجودة" };
  var setT = function(key, value) { var idx = TC[TRIPS_COL_[key]]; if (idx !== undefined && value) tripsSheet.getRange(rowNum, idx + 1).setValue(value); };

  var groups = {
    arrival: function() { setT('arrivalPort', b.arrivalPort); setT('departDate', b.arrivalDate); setT('arrivalTime', b.arrivalTime); setT('arrivalFlight', b.arrivalFlight); },
    departure: function() { setT('departurePort', b.departurePort); setT('returnDate', b.departureDate); setT('departureTime', b.departureTime); setT('departureFlight', b.departureFlight); },
    madinah: function() { setT('madinahHotel', b.madinahHotel); setT('madinahCheckIn', b.madinahCheckIn); setT('madinahCheckOut', b.madinahCheckOut); setT('madinahNights', b.madinahNights); },
    makkah: function() { setT('makkahHotel', b.makkahHotel); setT('makkahCheckIn', b.makkahCheckIn); setT('makkahCheckOut', b.makkahCheckOut); setT('makkahNights', b.makkahNights); }
  };
  if (!groups[group]) return { success: false, error: "مجموعة غير معروفة" };
  groups[group]();
  clearAllCache();
  logChange_(session.username, 'اعتماد بيانات إشعار على رحلة', tripName, group, '-', 'من الإشعار #' + cmp.bookingId);
  return { success: true };
}

/**
 * مصالحة البيانات المتضاربة بين الرحلات والإشعارات المرتبطة (تُشغَّل مرة واحدة يدوياً من الإعدادات)
 * القاعدة: لو الإشعار يملك منفذ وصول ويختلف عن الرحلة → الإشعار هو المصدر (ينسخ للرحلة)؛
 *          لو الرحلة تملك بيانات والإشعار فارغ → الرحلة هي المصدر (تنسخ للإشعار).
 * @return {Object} { tripsUpdated, bookingsUpdated, conflicts: [] }
 */
function runOneTimeReconciliation(authToken) {
  requireAdminPermission_(authToken);

  var tripsSheet = _getTripsSheet_();
  var tLastRow = tripsSheet.getLastRow();
  if (tLastRow < 2) return { tripsUpdated: 0, bookingsUpdated: 0, conflicts: [] };

  var tData = tripsSheet.getRange(2, 1, tLastRow - 1, TRIPS_HEADERS_.length).getValues();
  var bookingsSheet = getSpreadsheet_().getSheetByName("Bookings");
  if (!bookingsSheet) return { tripsUpdated: 0, bookingsUpdated: 0, conflicts: [] };
  var bData = bookingsSheet.getDataRange().getValues();

  var tripsUpdated = 0, bookingsUpdated = 0, conflicts = [];

  // خريطة اسم الرحلة → رقم الإشعار من عمود "اسم الرحلة" في شيت الإشعارات (fallback للربط الفارغ)
  var nameToBookingId = {};
  var recTripNameCol = (bData.length && bData[0]) ? bData[0].indexOf("اسم الرحلة") : -1;
  if (recTripNameCol !== -1) {
    for (var nb = 1; nb < bData.length; nb++) {
      var nbName = String(bData[nb][recTripNameCol] || "").trim();
      if (nbName && !nameToBookingId[nbName]) nameToBookingId[nbName] = String(bData[nb][1] || "").trim();
    }
  }

  for (var i = 0; i < tData.length; i++) {
    var tripRow = tData[i];
    var tripName = String(tripRow[0] || "").trim();
    var linkedId = String(tripRow[15] || "").trim() || (nameToBookingId[tripName] || "");
    if (!tripName || !linkedId) continue;

    for (var b = 1; b < bData.length; b++) {
      if (String(bData[b][1] || "").trim() !== linkedId) continue;

      var bookingArrPort = String(bData[b][9] || "").trim();  // Bookings r[9] = منفذ الوصول
      var tripArrPort = String(tripRow[26] || "").trim();

      if (bookingArrPort && bookingArrPort !== tripArrPort) {
        // الإشعار هو المصدر الأصلي — انسخ منه للرحلة
        _propagateBookingChangesToTrip_(linkedId, {
          tripName: tripName,
          arrivalPort: bData[b][9],
          departurePort: bData[b][16],
          arrivalTime: bData[b][11],
          departureTime: bData[b][15],
          arrivalFlight: bData[b][12],
          departureFlight: bData[b][14],
          arrivalDate: bData[b][10],
          departureDate: bData[b][13]
        });
        tripsUpdated++;
        conflicts.push({ trip: tripName, bookingId: linkedId, resolvedFrom: "booking", field: "منفذ الوصول" });
      } else if (!bookingArrPort && tripArrPort) {
        // الرحلة فيها بيانات والإشعار فارغ — انسخ من الرحلة للإشعار
        _propagateTripChangesToBooking_(tripName);
        bookingsUpdated++;
        conflicts.push({ trip: tripName, bookingId: linkedId, resolvedFrom: "trip", field: "منفذ الوصول" });
      }
      break;
    }
  }

  clearAllCache();
  return { tripsUpdated: tripsUpdated, bookingsUpdated: bookingsUpdated, conflicts: conflicts };
}

// فرق الأيام بين تاريخين بصيغة dd/mm/yyyy — يرجع null لو أي تاريخ ناقص/غير صالح
function _diffDays_(fromStr, toStr) {
  var from = _parseDmy_(fromStr);
  var to = _parseDmy_(toStr);
  if (!from || !to) return null;
  var diff = Math.round((to.getTime() - from.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

function _parseDmy_(str) {
  if (!str) return null;
  var m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

// حذف رحلة (لا يحذف المعتمرين المرتبطين — يفك ربطهم فقط بمسح اسم الرحلة من صفوفهم)
function deleteTrip(authToken, targetRow) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, "trips.delete")) {
    throw new Error("حذف الرحلات متاح فقط لصاحب صلاحية DELETE أو admin");
  }

  var sheet = _getTripsSheet_();
  var name = String(sheet.getRange(Number(targetRow), 1).getValue() || "").trim();
  sheet.deleteRow(Number(targetRow));
  logChange_(session.username, "حذف", name, "حذف رحلة", name, "-");
  clearAllCache();
  return { success: true };
}

// تحديث اسم الرحلة في عمود "اسم الرحلة" بشيت الإشعارات (عند إعادة تسمية رحلة)
function _renameTripInBookings_(oldName, newName) {
  try {
    var sheet = getSpreadsheet_().getSheetByName("Bookings");
    if (!sheet || sheet.getLastRow() < 2) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var col = headers.indexOf("اسم الرحلة");
    if (col === -1) return;
    var range = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || "").trim() === oldName) { values[i][0] = newName; changed = true; }
    }
    if (changed) { range.setValues(values); clearAllCache(); }
  } catch (e) { Logger.log('_renameTripInBookings_ failed: ' + e); }
}

// تحديث اسم الرحلة في كل صفوف كشف المعتمرين المرتبطة (عند إعادة تسمية رحلة)
// 🛡️ (V4.125) كانت تكتب على العمود رقم 9 بفهرس ثابت — لو أُعيد ترتيب أعمدة كشف المعتمرين (أو
// أُضيف عمود قبله) كانت تكتب اسم الرحلة فوق عمود آخر تماماً فتتلف بيانات الكشف («تتلخبط وتصفّر»).
// الآن تعتمد خريطة الأعمدة بالاسم مثل بقية النظام.
function _renameTripInPilgrims_(oldName, newName) {
  var sheet = _getPilgrimsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var C = _robustColMap_(sheet, PILGRIMS_HEADERS_);
  var col = C[PILGRIMS_COL_.tripName];
  if (col === undefined) return 0;
  var range = sheet.getRange(2, col + 1, lastRow - 1, 1);
  var values = range.getValues();
  var n = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === oldName) { values[i][0] = newName; n++; }
  }
  if (n) range.setValues(values);
  return n;
}

/* ============================================================
   🔗 (V4.125) انتشار إعادة التسمية عبر كل الشيتات المرتبطة
   اسم العميل واسم الرحلة مفتاحان رابطان بين شيتات كثيرة (الحسابات، الدفعات، التسعير، مجموعات
   الدمج، ملفات الوزارة، الإشعارات، كشوف المعتمرين، ملاحظات التسكين). كان التعديل يغيّر الاسم في
   مكانه فقط، فتفقد كل السجلات المرتبطة ارتباطها فوراً (حسابات العميل «تختفي» حتى يُعاد الاسم
   القديم، وكشوف الرحلة «تتصفّر»). هذه الدوال تنشر التعديل على كل المواضع دفعةً واحدة.
   ============================================================ */
// إعادة تسمية قيمة نصية في عمود بعينه (بالاسم لا بالفهرس) داخل شيت بعينه — تُرجع عدد الصفوف المعدَّلة
function _renameInSheetCol_(sheetName, headerName, oldVal, newVal) {
  try {
    var sh = getSpreadsheet_().getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return 0;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var col = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim() === headerName) { col = i; break; }
    }
    if (col === -1) return 0;
    var rng = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1);
    var vals = rng.getValues();
    var n = 0;
    for (var r = 0; r < vals.length; r++) {
      if (String(vals[r][0] || '').trim() === oldVal) { vals[r][0] = newVal; n++; }
    }
    if (n) rng.setValues(vals);
    return n;
  } catch (e) {
    Logger.log('_renameInSheetCol_ ' + sheetName + '/' + headerName + ' failed: ' + e);
    return 0;
  }
}
// إعادة التسمية داخل عمود يحفظ JSON: إما مصفوفة نصوص (["رحلة أ","رحلة ب"]) أو مصفوفة كائنات
// يُطابَق فيها الحقل field (مثل بنود العميل بملف الوزارة: [{name:"عميل"}])
function _renameInJsonCol_(sheetName, headerName, oldVal, newVal, field) {
  try {
    var sh = getSpreadsheet_().getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return 0;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var col = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim() === headerName) { col = i; break; }
    }
    if (col === -1) return 0;
    var rng = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1);
    var vals = rng.getValues();
    var n = 0;
    for (var r = 0; r < vals.length; r++) {
      var raw = String(vals[r][0] || '').trim();
      if (!raw) continue;
      var arr;
      try { arr = JSON.parse(raw); } catch (e2) { continue; }
      if (!Array.isArray(arr)) continue;
      var hit = false;
      for (var k = 0; k < arr.length; k++) {
        if (field) {
          if (arr[k] && String(arr[k][field] || '').trim() === oldVal) { arr[k][field] = newVal; hit = true; }
        } else if (String(arr[k] || '').trim() === oldVal) { arr[k] = newVal; hit = true; }
      }
      if (hit) { vals[r][0] = JSON.stringify(arr); n++; }
    }
    if (n) rng.setValues(vals);
    return n;
  } catch (e) {
    Logger.log('_renameInJsonCol_ ' + sheetName + '/' + headerName + ' failed: ' + e);
    return 0;
  }
}
// كل مواضع اسم العميل خارج دليل العملاء نفسه وكشف المعتمرين (هما يُعالجان بمكانهما)
function _cascadeClientRename_(oldName, newName) {
  var n = 0;
  n += _renameInSheetCol_(ACC_ITEMS_SHEET, 'العميل', oldName, newName);          // بنود الحساب
  n += _renameInSheetCol_(ACC_PAY_SHEET, 'العميل', oldName, newName);            // الدفعات
  n += _renameInSheetCol_(ACC_META_SHEET, 'العميل', oldName, newName);           // نمط الحساب واللقطات
  n += _renameInSheetCol_(ACC_CLIENT_PRICES_SHEET, 'العميل', oldName, newName);  // تسعير العميل
  n += _renameInSheetCol_(ACC_MERGE_SHEET, 'العميل', oldName, newName);          // مجموعات دمج الرحلات
  n += _renameInSheetCol_('Bookings', 'العميل', oldName, newName);               // إشعارات الوصول
  n += _renameInSheetCol_(MF_SHEET, 'العميل', oldName, newName);                 // ملفات الوزارة (لو الاسم مفرد)
  n += _renameInJsonCol_(MF_SHEET, 'بنود العميل (JSON)', oldName, newName, 'name');
  try { clearAllCache(); } catch (e) {}
  try { _mfClearBootstrapCache_(); } catch (e) {}
  return n;
}
// كل مواضع اسم الرحلة خارج شيت الرحلات نفسه (كشف المعتمرين والإشعارات لهما دالتاهما أعلاه)
function _cascadeTripRename_(oldName, newName) {
  var n = 0;
  n += _renameInSheetCol_(ACC_ITEMS_SHEET, 'اسم الرحلة', oldName, newName);
  n += _renameInSheetCol_(ACC_PAY_SHEET, 'اسم الرحلة', oldName, newName);
  n += _renameInSheetCol_(ACC_META_SHEET, 'اسم الرحلة', oldName, newName);
  n += _renameInSheetCol_(ACC_TRIP_PRICES_SHEET, 'اسم الرحلة', oldName, newName);
  n += _renameInSheetCol_(MF_SHEET, 'الرحلة المرتبطة', oldName, newName);
  // ملاحظات التسكين: مفتاحها مبنيّ من أسماء الرحلات — نُصلح عمود الرحلات للحالة المفردة
  n += _renameInSheetCol_(HOUSING_NOTES_SHEET_, 'الرحلات', oldName, newName);
  // مجموعات الدمج تحفظ الرحلات كمصفوفة نصوص JSON
  n += _renameInJsonCol_(ACC_MERGE_SHEET, 'الرحلات (JSON)', oldName, newName, null);
  try { clearAllCache(); } catch (e) {}
  try { _mfClearBootstrapCache_(); } catch (e) {}
  return n;
}

// يرجع كشف معتمرين رحلة معينة (بالمسلسل الأصلي)
/* ============================================================
   🧳 التوحيد الكامل: الرحلة = مسودة إشعار كاملة (JSON) بلا رقم
   ============================================================ */

function _nextTripRef_(sheet) {
  var lastRow = sheet.getLastRow();
  var maxN = 0;
  if (lastRow >= 2) {
    var vals = sheet.getRange(2, 24, lastRow - 1, 1).getValues();
    vals.forEach(function(v) {
      var m = String(v[0] || "").match(/^TRP-(\d+)$/);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });
  }
  return 'TRP-' + ('000' + (maxN + 1)).slice(-4);
}

function backfillTripRefs_() {
  var sheet = _getTripsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var vals = sheet.getRange(2, 24, lastRow - 1, 1).getValues();
  var filled = 0;
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i][0] || "").trim()) {
      sheet.getRange(i + 2, 24).setValue(_nextTripRef_(sheet));
      filled++;
    }
  }
  return filled;
}

function saveTripDraft(authToken, draft) {
  var session = requireAuth_(authToken);
  draft = draft || {};
  var name = String(draft.tripName || "").trim();
  if (!name) throw new Error("اسم الرحلة مطلوب");

  // 🛡️ حل الفجوة الجذرية: validateMovementsLogic لم يكن يُستدعى إطلاقاً من مسار حفظ المسودة —
  // فأي تحرك غير منطقي (زي مزارات المدينة أثناء الإقامة بمكة) كان يُحفَظ بصمت تام بلا أي تحقق،
  // لأن الفحص كله كان مقصوراً على saveBookingToServer (إشعار الوصول النهائي) فقط. وضع التساهل
  // الافتراضي (__strictDates__ غير مُفعَّل) يسمح للمسودة بعدم وجود تواريخ أساسية بعد كما هو متوقَّع،
  // لكنه يفحص أي تحركات فعلية مُدخَلة فعلاً بحثاً عن تعارض منطقي حقيقي — يُرمى هنا (throw) بنفس
  // نمط بقية أخطاء هذه الدالة، ويلتقطه withFailureHandler الموجود بالفعل في الواجهة
  // 🎯 الخطأ المُهيكَل يُرسَل مُرمَّزاً بعلامة "MVERR::" + JSON حتى تقدر الواجهة تكتشفه وتبني منه
  // نافذة تنبيه غنية — ولو فشل تحليله لأي سبب، الرسالة الأصلية النصية تبقى مقروءة كما هي كـ fallback
  var draftMovementsError = validateMovementsLogic(draft);
  if (draftMovementsError) {
    throw new Error('MVERR::' + JSON.stringify(draftMovementsError));
  }

  var sheet = _getTripsSheet_();
  // 🔒 خريطة أعمدة متينة (بالاسم مع رجوع قانوني)
  var C = _robustColMap_(sheet, TRIPS_HEADERS_);
  var width = sheet.getLastColumn();
  var nameCol = C[TRIPS_COL_.name];
  var lastRow = sheet.getLastRow();
  var rowIdx = -1;
  if (lastRow >= 2 && nameCol !== undefined) {
    var names = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][nameCol] || "").trim() === name) { rowIdx = i + 2; break; }
    }
    // 🏷️ إعادة تسمية: الاسم الجديد غير موجود لكن الرحلة قيد التعديل باسمها الأصلي —
    // نستخدم صفها الأصلي ونعيد تسمية الكشوف والإشعارات المرتبطة بدل إنشاء رحلة جديدة يتيمة
    var origName = String(draft.originalTripName || "").trim();
    if (rowIdx === -1 && origName && origName !== name) {
      for (var oi = 0; oi < names.length; oi++) {
        if (String(names[oi][nameCol] || "").trim() === origName) { rowIdx = oi + 2; break; }
      }
      if (rowIdx !== -1) {
        _renameTripInPilgrims_(origName, name);
        _renameTripInBookings_(origName, name);
        _cascadeTripRename_(origName, name);   // 🔗 (V4.125) نفس الانتشار الكامل لمسار حفظ المسودة
      }
    }
  }

  // 🔒 تمييز إنشاء رحلة جديدة (trips.add) عن تعديل رحلة موجودة بالفعل (trips.edit) — كانت هذه
  // الدالة تتحقق من تسجيل الدخول فقط بلا أي فحص صلاحية، فأي مستخدم يقدر يعدّل أي رحلة موجودة
  // بغض النظر عن صلاحياته الفعلية على شاشة الرحلات. يُبنى على rowIdx المحسوب أعلاه مباشرة
  var requiredPerm = (rowIdx !== -1) ? "trips.edit" : "trips.add";
  if (!_sessionHasPerm_(session, requiredPerm)) {
    throw new Error(rowIdx !== -1
      ? "لا تملك صلاحية تعديل بيانات الرحلات — تواصل مع مدير النظام إن كنت تحتاج هذه الصلاحية"
      : "لا تملك صلاحية إضافة رحلات جديدة — تواصل مع مدير النظام إن كنت تحتاج هذه الصلاحية");
  }

  var existing = rowIdx !== -1 ? sheet.getRange(rowIdx, 1, 1, width).getValues()[0] : [];
  var existingGet = function(key) { var idx = C[TRIPS_COL_[key]]; return (existing && idx !== undefined) ? existing[idx] : ""; };

  var vals = {};
  vals[TRIPS_COL_.name] = name;
  vals[TRIPS_COL_.company] = String(draft.company || "");
  vals[TRIPS_COL_.agent] = String(draft.agent || "");
  vals[TRIPS_COL_.supervisor] = String(draft.supervisor || "");
  vals[TRIPS_COL_.departDate] = String(draft.arrivalDate || "");
  vals[TRIPS_COL_.returnDate] = String(draft.departureDate || "");
  vals[TRIPS_COL_.airline] = String(draft.airline || existingGet('airline') || "");
  vals[TRIPS_COL_.madinahHotel] = String(draft.madinahHotel || "");
  vals[TRIPS_COL_.madinahCheckIn] = String(draft.madinahCheckIn || "");
  vals[TRIPS_COL_.madinahCheckOut] = String(draft.madinahCheckOut || "");
  vals[TRIPS_COL_.madinahNights] = String(draft.madinahNights || "");
  vals[TRIPS_COL_.makkahHotel] = String(draft.makkahHotel || "");
  vals[TRIPS_COL_.makkahCheckIn] = String(draft.makkahCheckIn || "");
  vals[TRIPS_COL_.makkahCheckOut] = String(draft.makkahCheckOut || "");
  vals[TRIPS_COL_.makkahNights] = String(draft.makkahNights || "");
  vals[TRIPS_COL_.linkedBookingId] = String(existingGet('linkedBookingId') || "");
  vals[TRIPS_COL_.createdAt] = existingGet('createdAt') || new Date();
  vals[TRIPS_COL_.bookedSeats] = String(draft.count || existingGet('bookedSeats') || "");
  vals[TRIPS_COL_.direction] = String(draft.direction || "");
  vals[TRIPS_COL_.ticketUrl] = String(draft.ticketUrl || existingGet('ticketUrl') || "");
  vals[TRIPS_COL_.ticketFileId] = String(draft.ticketFileId || existingGet('ticketFileId') || "");
  vals[TRIPS_COL_.draftJson] = JSON.stringify(draft);
  vals[TRIPS_COL_.supervisorRole] = String(draft.supervisorRole || existingGet('supervisorRole') || "مرافق");
  vals[TRIPS_COL_.tripRef] = String(existingGet('tripRef') || "") || _nextTripRef_(sheet);
  vals[TRIPS_COL_.madinahExtra] = JSON.stringify((draft.madinahHotelsExtra || []).filter(String));
  vals[TRIPS_COL_.makkahExtra] = JSON.stringify((draft.makkahHotelsExtra || []).filter(String));
  // 🧭 خط السير — من المسودة مع الحفاظ على القيمة السابقة لو غابت
  vals[TRIPS_COL_.arrivalPort] = String(draft.arrivalPort || existingGet('arrivalPort') || "");
  vals[TRIPS_COL_.departurePort] = String(draft.departurePort || existingGet('departurePort') || "");
  vals[TRIPS_COL_.arrivalTime] = String(draft.arrivalTime || existingGet('arrivalTime') || "");
  vals[TRIPS_COL_.departureTime] = String(draft.departureTime || existingGet('departureTime') || "");
  vals[TRIPS_COL_.arrivalFlight] = String(draft.arrivalFlight || existingGet('arrivalFlight') || "");
  vals[TRIPS_COL_.departureFlight] = String(draft.departureFlight || existingGet('departureFlight') || "");
  // 👥 المشرفون (JSON)
  var _supList0 = _buildSupervisorsList_(draft);
  vals[TRIPS_COL_.supervisorsJson] = _supList0.length ? JSON.stringify(_supList0) : String(existingGet('supervisorsJson') || "");
  // الاسم/الدور الأساسي للتوافق = المشرف الأول (لا نص مُجمَّع)
  if (_supList0.length) {
    vals[TRIPS_COL_.supervisor] = String(_supList0[0].name || "");
    vals[TRIPS_COL_.supervisorRole] = String(_supList0[0].role || "مرافق");
  }

  var row = _buildRowByName_(C, width, vals, (rowIdx !== -1 ? existing : null));
  if (rowIdx === -1) sheet.appendRow(row);
  else sheet.getRange(rowIdx, 1, 1, width).setValues([row]);

  try {
    var sess1 = requireAuth_(authToken);
    logChange_(sess1.username, rowIdx === -1 ? "إنشاء رحلة (مسودة)" : "تحديث رحلة (مسودة)", name, "رحلة", "-", "-");
  } catch (ae) {}

  // 🔄 مزامنة المسودة → الإشعار المرتبط (لا توقف الحفظ لو فشلت)
  try { _propagateTripChangesToBooking_(name); } catch (e) { Logger.log('propagate draft→booking failed: ' + e); }

  clearAllCache(); // ضمان تحديث قائمة الرحلات حتى لو لا يوجد إشعار مرتبط
  return { success: true, tripName: name };
}

// قائمة أسماء عملاء فريدة من كشوف المعتمرين — للاقتراح التنبؤي عند كتابة اسم العميل
/* ============================================================
   👥 دليل العملاء — سجل رسمي (اسم/جوال/ملاحظات) مستقل عن نص "العميل" الحر بالكشوف.
   يُستخدم لملء القائمة المنسدلة عند تسجيل المعتمرين، ويسمح بالإضافة أثناء التسجيل
   وبتعديل بيانات العميل مركزياً — تعديل الاسم ينتشر تلقائياً لكل كشوف الرحلات.
   ============================================================ */
var CLIENTS_HEADERS_ = ["اسم العميل", "رقم الجوال", "ملاحظات"];
function _ensureClientsDirSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Clients");
  if (!sheet) {
    sheet = ss.insertSheet("Clients");
    sheet.appendRow(CLIENTS_HEADERS_);
    sheet.getRange(1, 1, 1, CLIENTS_HEADERS_.length).setFontWeight("bold").setBackground("#1e3d59").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// كل سجلات العملاء (اسم/جوال/ملاحظات) مرتّبة أبجدياً
function getClientsDirectory(authToken) {
  requireAuth_(authToken);
  var sheet = _ensureClientsDirSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, CLIENTS_HEADERS_.length).getValues();
  var list = [];
  data.forEach(function(r, i) {
    var name = String(r[0] || '').trim();
    if (!name) return;
    list.push({ name: name, mobile: String(r[1] || '').trim(), notes: String(r[2] || '').trim(), row: i + 2 });
  });
  list.sort(function(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
  return list;
}

// إضافة عميل جديد للدليل — يرفض الاسم الفارغ أو المكرر (بلا حساسية لحالة الأحرف/الفراغات الزائدة)
// 🛡️ (V4.36) منع تكرار العملاء يراعي الهمزات/التشكيل/الفراغات (لا حرفيًا فقط) — نفس منطق مطابقة أسماء الحجوزات
// force=true: تجاوز صريح بعد تحذير المستخدم بالواجهة (لحالة نادرة: شخصان مختلفان فعلًا بأسماء متقاربة كتابيًا)
function addClientRecord(authToken, name, mobile, notes, force) {
  requireAuth_(authToken);
  name = String(name || '').trim();
  if (!name) throw new Error('اسم العميل مطلوب');
  var sheet = _ensureClientsDirSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2 && !force) {
    var normNew = _normalizeArabicName_(name).toLowerCase();
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      var exName = String(existing[i][0] || '').trim();
      if (exName && _normalizeArabicName_(exName).toLowerCase() === normNew) {
        throw new Error('هذا العميل مسجَّل بالفعل باسم مطابق أو مقارب: «' + exName + '» — اختره من القائمة بدل إضافة تكرار جديد');
      }
    }
  }
  sheet.appendRow([name, String(mobile || '').trim(), String(notes || '').trim()]);
  return { success: true, client: { name: name, mobile: String(mobile || '').trim(), notes: String(notes || '').trim() } };
}

// 🗑️ (V4.35) حذف عميل — يُرفض لو له معتمرون على رحلات فعلية، ويُسمح لو معتمروه (إن وُجدوا) كلهم
// بدون رحلة — ويُحذفون معه تلقائيًا
function deleteClientRecord(authToken, row) {
  var session = requireAuth_(authToken);
  row = Number(row);
  if (!row || row < 2) throw new Error('سجل غير صالح');
  var sheet = _ensureClientsDirSheet_();
  var lastRow = sheet.getLastRow();
  if (row > lastRow) throw new Error('السجل غير موجود');
  var name = String(sheet.getRange(row, 1).getValue() || '').trim();
  if (!name) throw new Error('السجل غير موجود');

  var pSheet = _getPilgrimsSheet_();
  var withTrip = 0, withoutTripRows = [];
  if (pSheet && pSheet.getLastRow() >= 2) {
    var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var P = _cellReader_(C, PILGRIMS_COL_);
    var data = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues();
    data.forEach(function(r, i) {
      if (String(P(r, 'client') || '').trim() !== name) return;
      if (String(P(r, 'tripName') || '').trim()) withTrip++;
      else withoutTripRows.push(i + 2);
    });
  }
  if (withTrip > 0) {
    return { success: false, error: 'لا يمكن حذف العميل «' + name + '» — له ' + withTrip + ' معتمر مسجَّل على رحلات فعلية. انقل أو احذف معتمريه من الرحلات أولاً.' };
  }
  // 🗑️ معتمرو هذا العميل بدون رحلة (إن وُجدوا) يُحذفون معه — من الأسفل للأعلى حتى لا تتزحزح أرقام الصفوف
  if (withoutTripRows.length) {
    withoutTripRows.sort(function(a, b) { return b - a; });
    withoutTripRows.forEach(function(rn) { pSheet.deleteRow(rn); });
  }
  sheet.deleteRow(row);
  clearAllCache();
  logChange_(session.username, 'حذف عميل', name, '-', '-', withoutTripRows.length ? ('حُذف معه ' + withoutTripRows.length + ' معتمر بدون رحلة') : '-');
  return { success: true, deletedPilgrims: withoutTripRows.length };
}

// تعديل عميل — لو تغيّر الاسم، يُستبدَل تلقائياً في عمود "العميل" بكل كشوف كل الرحلات
function updateClientRecord(authToken, row, newName, mobile, notes) {
  requireAuth_(authToken);
  row = Number(row);
  newName = String(newName || '').trim();
  if (!row || row < 2) throw new Error('سجل غير صالح');
  if (!newName) throw new Error('اسم العميل مطلوب');

  var sheet = _ensureClientsDirSheet_();
  var lastRow = sheet.getLastRow();
  if (row > lastRow) throw new Error('السجل غير موجود');

  var oldName = String(sheet.getRange(row, 1).getValue() || '').trim();
  // 🛡️ (V4.36) امنع تكرار الاسم مع عميل آخر (غير هذا السجل نفسه) — مطابقة تراعي الهمزات/التشكيل/الفراغات
  if (lastRow >= 2) {
    var normNew2 = _normalizeArabicName_(newName).toLowerCase();
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (i + 2 === row) continue;
      var exName2 = String(existing[i][0] || '').trim();
      if (exName2 && _normalizeArabicName_(exName2).toLowerCase() === normNew2) {
        throw new Error('اسم آخر مطابق أو مقارب مسجَّل بالفعل: ' + exName2);
      }
    }
  }

  sheet.getRange(row, 1, 1, CLIENTS_HEADERS_.length).setValues([[newName, String(mobile || '').trim(), String(notes || '').trim()]]);

  // 🔁 انتشار تعديل الاسم لكل كشوف الرحلات (كل الصفوف بعمود "العميل" المطابق للاسم القديم)
  var renamedCount = 0;
  if (oldName && oldName !== newName) {
    var pSheet = _getPilgrimsSheet_();
    var pLastRow = pSheet.getLastRow();
    if (pLastRow >= 2) {
      var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
      var clientCol = C[PILGRIMS_COL_.client];
      var width = pSheet.getLastColumn();
      var pData = pSheet.getRange(2, 1, pLastRow - 1, width).getValues();
      var changed = false;
      for (var pi = 0; pi < pData.length; pi++) {
        if (String(pData[pi][clientCol] || '').trim() === oldName) {
          pData[pi][clientCol] = newName;
          renamedCount++;
          changed = true;
        }
      }
      if (changed) pSheet.getRange(2, 1, pData.length, width).setValues(pData);
    }
    // 🔗 (V4.125) الانتشار الكامل لبقية الشيتات: بنود الحساب والدفعات ونمط الحساب وتسعير العميل
    // ومجموعات الدمج والإشعارات وملفات الوزارة — كانت حسابات العميل «تختفي» بعد التسمية لأن
    // ارتباطها كان لا يزال بالاسم القديم وحده
    renamedCount += _cascadeClientRename_(oldName, newName);
  }

  return { success: true, renamedCount: renamedCount };
}

function getKnownClientNames(authToken) {
  requireAuth_(authToken);
  var sheet = _getPilgrimsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 5, lastRow - 1, 1).getValues(); // عمود العميل (فهرس 4، عمود شيت 5)
  var seen = {}, list = [];
  data.forEach(function(r) {
    var name = String(r[0] || "").trim();
    if (name && !seen[name] && name !== "المشرف") { seen[name] = true; list.push(name); }
  });
  list.sort();
  return list;
}

// نسخة داخلية بلا تحقق صلاحيات — لاستخدامها من دوال قد تعمل بسياق توكن طباعة مؤقت لا جلسة عادية
function _getTripHotelsListInternal_(tripName) {
  var sheet = _getTripsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { madinah: [], makkah: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, TRIPS_HEADERS_.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (String(r[0] || "").trim() !== tripName) continue;
    var madinahList = [], makkahList = [];
    if (String(r[7] || "").trim()) madinahList.push(String(r[7]).trim());
    try { (JSON.parse(String(r[24] || "[]")) || []).forEach(function(h) { if (h) madinahList.push(h); }); } catch (e1) {}
    if (String(r[11] || "").trim()) makkahList.push(String(r[11]).trim());
    try { (JSON.parse(String(r[25] || "[]")) || []).forEach(function(h) { if (h) makkahList.push(h); }); } catch (e2) {}
    return { madinah: madinahList, makkah: makkahList };
  }
  return { madinah: [], makkah: [] };
}

function getTripHotelsList(authToken, tripName) {
  requireAuth_(authToken);
  var res = getTripDraft(authToken, tripName);
  if (!res) return { madinah: [], makkah: [] };
  var d = res.draft || {};

  var splitJoined_ = function(name) {
    // حماية رجعية: لو الحقل مصاب سابقاً بقيمة مدموجة "فندق1 / فندق2" نفكّها لأسماء مستقلة
    return String(name || "").split(" / ").map(function(s) { return s.trim(); }).filter(Boolean);
  };
  var dedupe_ = function(list) {
    var seen = {}, out = [];
    list.forEach(function(h) { if (h && !seen[h]) { seen[h] = true; out.push(h); } });
    return out;
  };

  var madinahList = splitJoined_(d.madinahHotel).concat((d.madinahHotelsExtra || []).filter(Boolean));
  var makkahList = splitJoined_(d.makkahHotel).concat((d.makkahHotelsExtra || []).filter(Boolean));
  return { madinah: dedupe_(madinahList), makkah: dedupe_(makkahList) };
}

function getTripDraft(authToken, tripName) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  var sheet = _getTripsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var C = _robustColMap_(sheet, TRIPS_HEADERS_);
  var T = _cellReader_(C, TRIPS_COL_);
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (String(T(r, 'name') || "").trim() !== tripName) continue;
    var raw = String(T(r, 'draftJson') || "").trim();
    var draft = null;
    if (raw) { try { draft = JSON.parse(raw); } catch (e) { draft = null; } }
    var mExtra = [], kExtra = [];
    try { mExtra = JSON.parse(String(T(r, 'madinahExtra') || "[]")); } catch (pe1) {}
    try { kExtra = JSON.parse(String(T(r, 'makkahExtra') || "[]")); } catch (pe2) {}
    var supList = _parseSupervisorsRow_(r, C);
    if (draft) {
      draft.madinahHotelsExtra = mExtra;
      draft.makkahHotelsExtra = kExtra;
      draft.supervisors = supList;
    }
    if (!draft) {
      draft = {
        tripName: tripName, company: String(T(r, 'company') || ""), agent: String(T(r, 'agent') || ""),
        supervisor: String(T(r, 'supervisor') || ""),
        arrivalDate: _tripFormatDate_(T(r, 'departDate')), departureDate: _tripFormatDate_(T(r, 'returnDate')),
        madinahHotel: String(T(r, 'madinahHotel') || ""), madinahCheckIn: _tripFormatDate_(T(r, 'madinahCheckIn')),
        madinahCheckOut: _tripFormatDate_(T(r, 'madinahCheckOut')), madinahNights: String(T(r, 'madinahNights') || ""),
        makkahHotel: String(T(r, 'makkahHotel') || ""), makkahCheckIn: _tripFormatDate_(T(r, 'makkahCheckIn')),
        makkahCheckOut: _tripFormatDate_(T(r, 'makkahCheckOut')), makkahNights: String(T(r, 'makkahNights') || ""),
        count: String(T(r, 'bookedSeats') || ""), direction: String(T(r, 'direction') || ""),
        ticketUrl: String(T(r, 'ticketUrl') || ""), ticketFileId: String(T(r, 'ticketFileId') || ""),
        madinahHotelsExtra: mExtra, makkahHotelsExtra: kExtra
      };
    }
    return { draft: draft, supervisorRole: String(T(r, 'supervisorRole') || "مرافق"), supervisors: supList, linkedBooking: String(T(r, 'linkedBookingId') || "") };
  }
  return null;
}

function linkTripNotification(authToken, tripName, bookingId) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  var sheet = _getTripsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false };
  var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0] || "").trim() === tripName) {
      sheet.getRange(i + 2, 16).setValue(String(bookingId || ""));
      try {
        var sess2 = requireAuth_(authToken);
        logChange_(sess2.username, "ربط إشعار برحلة", tripName, "رقم الإشعار", "-", String(bookingId || ""));
      } catch (ae2) {}
      return { success: true };
    }
  }
  return { success: false };
}

function _dmyToDate_(s) {
  var m = String(s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

/**
 * هل الاسمان يعودان على الأرجح لنفس الشخص؟ (اسم كامل مقابل اسم جزئي)
 * القاعدة: بعد تطبيع المسافات والتشكيل، تكون كل كلمات الاسم الأقصر موجودة بالترتيب في الأطول،
 * والأقصر لا يقل عن كلمتين (اسم أول + أب) لتفادي المطابقات العابرة.
 */
function _normalizeArabicName_(s) {
  return String(s || "")
    .replace(/[ً-ْٰ]/g, "")   // إزالة التشكيل
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/\s+/g, " ").trim();
}
function _namesLikelySame_(a, b) {
  a = _normalizeArabicName_(a); b = _normalizeArabicName_(b);
  if (!a || !b) return false;
  if (a === b) return true;
  var ta = a.split(" "), tb = b.split(" ");
  var shortA = ta.length <= tb.length ? ta : tb;
  var longA = ta.length <= tb.length ? tb : ta;
  if (shortA.length < 2) return false;           // اسم من كلمة واحدة غير كافٍ
  var j = 0;
  for (var i = 0; i < longA.length && j < shortA.length; i++) {
    if (longA[i] === shortA[j]) j++;
  }
  return j === shortA.length;                     // كل كلمات الأقصر ظهرت بالترتيب في الأطول
}

function _checkTripConflicts_(tripName, pilgrims) {
  var conflicts = [];
  try {
    var tSheet = _getTripsSheet_();
    var tLast = tSheet.getLastRow();
    if (tLast < 2) return conflicts;
    var tData = tSheet.getRange(2, 1, tLast - 1, TRIPS_HEADERS_.length).getValues();

    var trips = {};
    tData.forEach(function(r) {
      var nm = String(r[0] || "").trim();
      if (!nm) return;
      trips[nm] = {
        go: r[4] instanceof Date ? r[4] : _dmyToDate_(_tripFormatDate_(r[4])),
        ret: r[5] instanceof Date ? r[5] : _dmyToDate_(_tripFormatDate_(r[5])),
        supervisor: String(r[3] || "").trim(),
        role: String(r[22] || "مرافق")
      };
    });

    var cur = trips[tripName];
    if (!cur || !cur.go || !cur.ret) return conflicts;

    var overlaps = function(o) {
      return o.go && o.ret && o.go.getTime() <= cur.ret.getTime() && cur.go.getTime() <= o.ret.getTime();
    };

    var pSheet = _getPilgrimsSheet_();
    var pLast = pSheet.getLastRow();
    var byPassport = {};
    var otherRows = []; // كل صفوف الرحلات الأخرى (لمطابقة الاسم الجزئي)
    if (pLast >= 2) {
      var pData = pSheet.getRange(2, 1, pLast - 1, 10).getValues();
      pData.forEach(function(r) {
        var pass = String(r[2] || "").trim();
        var trip = String(r[8] || "").trim();
        if (!trip || trip === tripName) return;
        if (pass) (byPassport[pass] = byPassport[pass] || []).push({ trip: trip, name: String(r[1] || "") });
        otherRows.push({ trip: trip, name: String(r[1] || ""), passport: pass, client: String(r[4] || "") });
      });
    }

    var seenConflictKey = {};
    pilgrims.forEach(function(p) {
      var pass = String(p.passport || "").trim();
      var pName = String(p.name || "").trim();
      var pClient = String(p.client || "").trim();

      // (1) مطابقة رقم الجواز (الأدق)
      if (pass && byPassport[pass]) {
        byPassport[pass].forEach(function(o) {
          if (trips[o.trip] && overlaps(trips[o.trip])) {
            var k = pass + '|' + o.trip;
            if (seenConflictKey[k]) return; seenConflictKey[k] = true;
            conflicts.push({
              kind: "passport", passport: pass, pilgrimName: pName, otherTrip: o.trip,
              message: "🛂 " + pName + " (جواز " + pass + ") مسجَّل أيضاً في رحلة \"" + o.trip + "\" المتقاطعة التواريخ"
            });
          }
        });
      }

      // (2) مطابقة الاسم الجزئي/الكامل لنفس الشخص (اسم أحدهما يحتوي كل كلمات الآخر) —
      // تُشترط مطابقة العميل عند غياب الجواز لتقليل الإيجابيات الكاذبة
      if (pName) {
        otherRows.forEach(function(o) {
          if (!trips[o.trip] || !overlaps(trips[o.trip])) return;
          if (pass && o.passport && pass === o.passport) return; // غطّاه فحص الجواز
          if (!_namesLikelySame_(pName, o.name)) return;
          // لو لا يوجد جواز مطابق، اشترط نفس العميل لتأكيد أنه نفس الشخص
          var sameByPassport = pass && o.passport && pass === o.passport;
          if (!sameByPassport && pClient && o.client && pClient !== o.client) return;
          var k = 'N:' + pName + '|' + o.trip;
          if (seenConflictKey[k]) return; seenConflictKey[k] = true;
          conflicts.push({
            kind: "passport", passport: pass || o.passport || "", pilgrimName: pName, otherTrip: o.trip,
            message: "👥 " + pName + " يُطابق \"" + o.name + "\" المسجَّل في رحلة \"" + o.trip + "\" المتقاطعة التواريخ (اسم كامل/جزئي لنفس الشخص)"
          });
        });
      }
    });

    // 🧑‍✈️ «الوكيل» ليس مشرفًا فعليًا (= لا يوجد مشرف أصلًا) — لا تنطبق عليه قاعدة تقاطع الرحلات إطلاقًا
    if (cur.supervisor && cur.role !== "استقبال فقط" && cur.role !== "الوكيل") {
      Object.keys(trips).forEach(function(nm) {
        if (nm === tripName) return;
        var o = trips[nm];
        if (o.supervisor && o.supervisor === cur.supervisor && o.role !== "استقبال فقط" && o.role !== "الوكيل" && overlaps(o)) {
          conflicts.push({
            kind: "supervisor",
            otherTrip: nm,
            message: "🧑‍✈️ المشرف \"" + cur.supervisor + "\" مُسند أيضاً لرحلة \"" + nm + "\" المتقاطعة التواريخ (يمكن ضبط إحداهما \"استقبال فقط\")"
          });
        }
      });
    }
  } catch (e) {
    Logger.log("_checkTripConflicts_ ERROR: " + e);
  }
  return conflicts;
}

function getTripPilgrims(authToken, tripName) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  if (!tripName) return [];

  var sheet = _getPilgrimsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 🔒 قراءة بأسماء الأعمدة (مستقلة عن الترتيب)
  var C = _robustColMap_(sheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(C, PILGRIMS_COL_);
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (String(P(r, 'tripName') || "").trim() !== tripName) continue;
    result.push({
      row: i + 2,
      serial: P(r, 'serial'),
      name: String(P(r, 'name') || ""),
      passport: String(P(r, 'passport') || ""),
      type: String(P(r, 'type') || ""),
      client: String(P(r, 'client') || ""),
      accommodation: String(P(r, 'accommodation') || ""),
      roomNo: String(P(r, 'roomNo') || ""),
      notes: String(P(r, 'notes') || ""),
      bookingId: String(P(r, 'bookingId') || ""),
      latinName: String(P(r, 'latinName') || ""),
      birthDate: _tripFormatDate_(P(r, 'birthDate')),
      issueDate: _tripFormatDate_(P(r, 'issueDate')),
      expiryDate: _tripFormatDate_(P(r, 'expiryDate')),
      pid: String(P(r, 'pid') || ""),
      mahramPid: String(P(r, 'mahramPid') || ""),
      mahramRel: String(P(r, 'mahramRel') || ""),
      hotelMadinah: String(P(r, 'hotelMadinah') || ""),
      hotelMakkah: String(P(r, 'hotelMakkah') || ""),
      roomGroup: String(P(r, 'roomGroup') || ""),
      housingExcluded: String(P(r, 'housingExcluded') || "") === "1",
      roomNoMadinah: String(P(r, 'roomNoMadinah') || ""),
      roomNoMakkah: String(P(r, 'roomNoMakkah') || ""),
      // 🏙️ (V4.47) استبعاد منفصل لكل مدينة
      housingExcludedMadinah: String(P(r, 'housingExcludedMadinah') || "") === "1",
      housingExcludedMakkah: String(P(r, 'housingExcludedMakkah') || "") === "1"
    });
  }
  return result;
}

/* ============================================================
   🔗 (V4.102) دمج تسكين عدة رحلات معاً — شاشة الرحلات: اختيار رحلتين+ لهما
   فترة متداخلة بمدينة واحدة (مكة أو المدينة) وعرض تسكينهما معاً في كارت واحد
   قابل لنقل المعتمرين بين الغرف بحرية، بلا أي مساس بتسكين كل رحلة الأصلي —
   يُحفَظ الترتيب المدموج بشكل منفصل تماماً، ويُستعاد فقط عند فتح نفس توليفة
   الرحلات + المدينة من هذه الشاشة تحديداً
   ============================================================ */

// 👥 يجمع معتمري عدة رحلات معاً (كل معتمر يحمل اسم رحلته الأصلية بحقل tripName إضافي)
function getPilgrimsForMergedHousing(authToken, tripNames) {
  requireAuth_(authToken);
  var merged = [];
  (Array.isArray(tripNames) ? tripNames : []).forEach(function(tn) {
    var list = getTripPilgrims(authToken, tn);
    // getTripPilgrims يُرجع mahramPid فقط بلا اسم — نحلّه هنا داخل نفس الرحلة (المحرم دائماً من نفس الرحلة)
    var byPid = {};
    list.forEach(function(p) { if (p.pid) byPid[p.pid] = p.name; });
    list.forEach(function(p) {
      p.tripName = tn;
      p.mahramName = p.mahramPid ? (byPid[p.mahramPid] || '') : '';
      merged.push(p);
    });
  });
  return merged;
}

var MERGED_HOUSING_SHEET_ = 'MergedHousing';
var MERGED_HOUSING_HEADERS_ = ['مفتاح الدمج', 'الرحلات', 'المدينة', 'بيانات الغرف', 'آخر تحديث', 'آخر مستخدم'];
function _mhKey_(tripNames, city) {
  return String(city || '') + '::' + (Array.isArray(tripNames) ? tripNames.slice().sort().join('|') : '');
}
// 💾 حفظ ترتيب التسكين المدموج — منفصل تماماً عن تسكين كل رحلة، مفتاحه توليفة الرحلات+المدينة
function saveMergedHousing(authToken, tripNames, city, roomsData) {
  var session = requireAuth_(authToken);
  var sh = _accSheet_(MERGED_HOUSING_SHEET_, MERGED_HOUSING_HEADERS_);
  var key = _mhKey_(tripNames, city);
  var lastRow = sh.getLastRow();
  var rowIdx = -1;
  if (lastRow >= 2) {
    var keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) { rowIdx = i + 2; break; }
  }
  var rowVals = [key, JSON.stringify(tripNames || []), city, JSON.stringify(roomsData || []), new Date(), session.username || ''];
  if (rowIdx === -1) sh.appendRow(rowVals); else sh.getRange(rowIdx, 1, 1, rowVals.length).setValues([rowVals]);
  return { success: true };
}
// 📂 استرجاع آخر ترتيب مدموج محفوظ لنفس توليفة الرحلات+المدينة (إن وُجد)
function getMergedHousing(authToken, tripNames, city) {
  requireAuth_(authToken);
  var sh = _accSheet_(MERGED_HOUSING_SHEET_, MERGED_HOUSING_HEADERS_);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { success: true, rooms: null };
  var key = _mhKey_(tripNames, city);
  var data = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      var rooms = null;
      try { rooms = JSON.parse(data[i][3] || '[]'); } catch (e) {}
      return { success: true, rooms: rooms };
    }
  }
  return { success: true, rooms: null };
}

/* ============================================================
   📝 (V4.117) ملاحظات وتوضيحات كشف التسكين — نص حر يكتبه المستخدم على أي تسكين
   (رحلة واحدة أو تسكين مدموج لعدة رحلات) ويُطبَع ضمن الكشف بشكل منسّق.
   المفتاح نفس مفتاح التسكين المدموج: «المدينة::أسماء الرحلات مرتبةً» — فيصلح للحالتين
   بلا أي تعارض، ومخزَّن في شيت مستقل لا يمسّ بيانات الغرف ولا كشوف المعتمرين.
   ============================================================ */
var HOUSING_NOTES_SHEET_ = 'HousingNotes';
var HOUSING_NOTES_HEADERS_ = ['المفتاح', 'الرحلات', 'المدينة', 'الملاحظات', 'آخر تحديث', 'آخر مستخدم'];
function saveHousingNote(authToken, tripNames, city, note) {
  var session = requireAuth_(authToken);
  var sh = _accSheet_(HOUSING_NOTES_SHEET_, HOUSING_NOTES_HEADERS_);
  var key = _mhKey_(tripNames, city);
  var txt = String(note == null ? '' : note).slice(0, 4000);
  var lastRow = sh.getLastRow();
  var rowIdx = -1;
  if (lastRow >= 2) {
    var keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) { rowIdx = i + 2; break; }
  }
  var rowVals = [key, JSON.stringify(tripNames || []), city, txt, new Date(), session.username || ''];
  if (rowIdx === -1) sh.appendRow(rowVals); else sh.getRange(rowIdx, 1, 1, rowVals.length).setValues([rowVals]);
  return { success: true, note: txt };
}
function getHousingNote(authToken, tripNames, city) {
  requireAuth_(authToken);
  var sh = _accSheet_(HOUSING_NOTES_SHEET_, HOUSING_NOTES_HEADERS_);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { success: true, note: '' };
  var key = _mhKey_(tripNames, city);
  var data = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      return { success: true, note: String(data[i][3] || ''),
        by: String(data[i][5] || ''),
        at: (data[i][4] instanceof Date)
          ? Utilities.formatDate(data[i][4], Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm')
          : String(data[i][4] || '') };
    }
  }
  return { success: true, note: '' };
}

/* ============================================================
   📖 السجل العام للمعتمرين — تجميع كل صفوف كشوف الرحلات بلا تكرار
   المفتاح: رقم الجواز (أو الاسم عند غياب الجواز). المعتمر قد يشترك في
   عدة رحلات (صف لكل رحلة) أو يُسجَّل مباشرةً بلا رحلة (اسم الرحلة فارغ)
   ============================================================ */
function getGlobalPilgrimsRegistry(authToken) {
  requireAuth_(authToken);

  // ⚡ كاش السجل العام — يُمسح مع أي تعديل على المعتمرين/الكشوف
  var _cachedReg = getCachedData('registry_cache');
  if (_cachedReg) return _cachedReg;

  var pSheet = _getPilgrimsSheet_();
  var pLast = pSheet.getLastRow();
  // 🔒 قراءة المعتمرين بأسماء الأعمدة
  var Pc = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(Pc, PILGRIMS_COL_);
  var pData = pLast >= 2 ? pSheet.getRange(2, 1, pLast - 1, pSheet.getLastColumn()).getValues() : [];

  // خريطة الرحلات: الاسم → تواريخ الذهاب/العودة (بأسماء الأعمدة)
  var tSheet = _getTripsSheet_();
  var tLast = tSheet.getLastRow();
  var Tc = _robustColMap_(tSheet, TRIPS_HEADERS_);
  var T = _cellReader_(Tc, TRIPS_COL_);
  var tData = tLast >= 2 ? tSheet.getRange(2, 1, tLast - 1, tSheet.getLastColumn()).getValues() : [];
  var tripDates = {};
  tData.forEach(function(r) {
    var n = String(T(r, 'name') || "").trim();
    // 🔗 (V4.115) نحمل أيضاً رقم الإشعار المرتبط والرقم المرجعي للرحلة — لعرض الربط الثلاثي
    // (المعتمر ⇄ الرحلة ⇄ الإشعار ⇄ ملف الوزارة) في السجل العام والبحث العام
    if (n) tripDates[n] = { depart: _tripFormatDate_(T(r, 'departDate')), ret: _tripFormatDate_(T(r, 'returnDate')),
      bookingId: String(T(r, 'linkedBookingId') || "").trim(), tripRef: String(T(r, 'tripRef') || "").trim() };
  });

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var parseDmy = function(s) {
    var m = String(s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
  };

  var byKey = {}, order = [];
  pData.forEach(function(r) {
    var name = String(P(r, 'name') || "").trim();
    if (!name) return;
    var passport = String(P(r, 'passport') || "").trim();
    var key = passport ? ('P:' + passport) : ('N:' + name);
    var rec = byKey[key];
    if (!rec) {
      rec = { name: name, passport: passport, type: "", client: "", notes: "",
              latinName: "", birthDate: "", issueDate: "", expiryDate: "", pid: "", trips: [] };
      byKey[key] = rec; order.push(key);
    }
    // استكمال البيانات الأساسية من أي صف فيه قيمة (آخر قيمة غير فارغة تفوز)
    rec.name = name;
    if (String(P(r, 'type') || "").trim())      rec.type = String(P(r, 'type'));
    if (String(P(r, 'client') || "").trim())    rec.client = String(P(r, 'client'));
    if (String(P(r, 'notes') || "").trim())     rec.notes = String(P(r, 'notes'));
    if (String(P(r, 'latinName') || "").trim()) rec.latinName = String(P(r, 'latinName'));
    if (String(P(r, 'birthDate') || "").trim()) rec.birthDate = _tripFormatDate_(P(r, 'birthDate'));
    if (String(P(r, 'issueDate') || "").trim()) rec.issueDate = _tripFormatDate_(P(r, 'issueDate'));
    if (String(P(r, 'expiryDate') || "").trim()) rec.expiryDate = _tripFormatDate_(P(r, 'expiryDate'));
    if (String(P(r, 'pid') || "").trim())       rec.pid = String(P(r, 'pid'));

    var trip = String(P(r, 'tripName') || "").trim();
    if (trip && !rec.trips.some(function(t) { return t.name === trip; })) {
      var d = tripDates[trip] || {};
      var from = parseDmy(d.depart), to = parseDmy(d.ret);
      var active = !!(from && to && today >= from && today <= to);
      // رقم الإشعار: من صف المعتمر نفسه إن وُجد، وإلا من الإشعار المرتبط بالرحلة
      var bId = String(P(r, 'bookingId') || "").trim() || (d.bookingId || "");
      rec.trips.push({ name: trip, depart: d.depart || "", ret: d.ret || "", active: active,
        bookingId: bId, tripRef: d.tripRef || "" });
    }
  });

  var list = order.map(function(k) { return byKey[k]; });
  var _regResult = { pilgrims: list, total: list.length };
  setCachedData('registry_cache', _regResult);
  return _regResult;
}

/**
 * تسجيل/تحديث معتمر مباشرةً في السجل العام.
 * لو المعتمر موجود (بأي رحلة): تُحدَّث بياناته الأساسية في كل صفوفه للحفاظ على الاتساق.
 * لو غير موجود: يُضاف صف جديد باسم رحلة فارغ (بدون رحلة).
 */
function saveGlobalPilgrim(authToken, p) {
  var session = requireAuth_(authToken);
  p = p || {};
  var name = String(p.name || "").trim();
  var passport = String(p.passport || "").trim();
  if (!name) throw new Error("اسم المعتمر مطلوب");

  var sheet = _getPilgrimsSheet_();
  // 🔒 خريطة أعمدة متينة + قراءة/كتابة بالاسم
  var C = _robustColMap_(sheet, PILGRIMS_HEADERS_);
  var width = sheet.getLastColumn();
  var P = _cellReader_(C, PILGRIMS_COL_);
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];

  var matches = [];
  data.forEach(function(r, i) {
    var rp = String(P(r, 'passport') || "").trim(), rn = String(P(r, 'name') || "").trim();
    if ((passport && rp === passport) || (!passport && !rp && rn === name)) matches.push(i + 2);
  });

  // القيم الأساسية بالاسم (تُكتب فقط لو غير فارغة — كما الأصل)
  var baseVals = { name: name, passport: passport, type: String(p.type || ""), client: String(p.client || ""),
                   notes: String(p.notes || ""), latinName: String(p.latinName || ""), birthDate: String(p.birthDate || ""),
                   issueDate: String(p.issueDate || ""), expiryDate: String(p.expiryDate || "") };

  if (matches.length) {
    matches.forEach(function(rowIdx) {
      Object.keys(baseVals).forEach(function(key) {
        var idx = C[PILGRIMS_COL_[key]];
        if (idx !== undefined && String(baseVals[key]) !== "") sheet.getRange(rowIdx, idx + 1).setValue(baseVals[key]);
      });
    });
    logChange_(session.username, "تحديث معتمر (السجل العام)", name, "معتمر", "-", "عدد الصفوف: " + matches.length);
    clearAllCache();
    return { success: true, existed: true, updatedRows: matches.length };
  }

  var vals = {};
  vals[PILGRIMS_COL_.name] = name;
  vals[PILGRIMS_COL_.passport] = passport;
  vals[PILGRIMS_COL_.type] = String(p.type || "");
  vals[PILGRIMS_COL_.client] = String(p.client || "");
  vals[PILGRIMS_COL_.notes] = String(p.notes || "");
  vals[PILGRIMS_COL_.latinName] = String(p.latinName || "");
  vals[PILGRIMS_COL_.birthDate] = String(p.birthDate || "");
  vals[PILGRIMS_COL_.issueDate] = String(p.issueDate || "");
  vals[PILGRIMS_COL_.expiryDate] = String(p.expiryDate || "");
  vals[PILGRIMS_COL_.pid] = 'P' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  sheet.appendRow(_buildRowByName_(C, width, vals));
  logChange_(session.username, "تسجيل معتمر بالسجل العام", name, "معتمر", "-", "بدون رحلة");
  clearAllCache();
  return { success: true, existed: false };
}

/**
 * تخصيص معتمر من السجل العام لرحلة: لو له صف "بدون رحلة" يُستهلك (يُكتب فيه اسم الرحلة)،
 * وإلا يُنسخ صف جديد ببياناته الأساسية للرحلة الجديدة (يسمح بتعدد الرحلات غير المتقاطعة)
 */
function assignPilgrimToTrip(authToken, passportOrName, tripName, force) {
  var session = requireAuth_(authToken);
  var key = String(passportOrName || "").trim();
  tripName = String(tripName || "").trim();
  if (!key || !tripName) throw new Error("بيانات ناقصة");

  var sheet = _getPilgrimsSheet_();
  // 🔒 خريطة أعمدة متينة + قراءة/كتابة بالاسم
  var C = _robustColMap_(sheet, PILGRIMS_HEADERS_);
  var width = sheet.getLastColumn();
  var P = _cellReader_(C, PILGRIMS_COL_);
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];

  var noTripRow = -1, template = null;
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var rp = String(P(r, 'passport') || "").trim(), rn = String(P(r, 'name') || "").trim();
    if (rp !== key && rn !== key) continue;
    var rTrip = String(P(r, 'tripName') || "").trim();
    if (rTrip === tripName) return { success: false, error: "المعتمر مسجَّل بالفعل في هذه الرحلة" };
    if (!rTrip && noTripRow === -1) noTripRow = i + 2;
    template = r;
  }
  if (!template) return { success: false, error: "المعتمر غير موجود بالسجل العام" };

  // ⛔ كشف تعارض التواريخ: هل المعتمر مسجَّل في رحلة أخرى تتقاطع تواريخها مع الرحلة المستهدفة؟
  if (!force) {
    var conflicts = _checkTripConflicts_(tripName, [{ name: String(P(template, 'name') || ""), passport: String(P(template, 'passport') || "") }]);
    var pConflicts = conflicts.filter(function(c) { return c.kind === "passport"; });
    if (pConflicts.length) {
      return {
        success: false, conflict: true,
        error: pConflicts.map(function(c) { return c.message; }).join("\n")
      };
    }
  }

  if (noTripRow !== -1) {
    var _tripIdx = C[PILGRIMS_COL_.tripName];
    if (_tripIdx !== undefined) sheet.getRange(noTripRow, _tripIdx + 1).setValue(tripName);
  } else {
    var vals = {};
    vals[PILGRIMS_COL_.name] = P(template, 'name');
    vals[PILGRIMS_COL_.passport] = P(template, 'passport');
    vals[PILGRIMS_COL_.type] = P(template, 'type');
    vals[PILGRIMS_COL_.client] = P(template, 'client');
    vals[PILGRIMS_COL_.tripName] = tripName;
    vals[PILGRIMS_COL_.latinName] = P(template, 'latinName');
    vals[PILGRIMS_COL_.birthDate] = _tripFormatDate_(P(template, 'birthDate'));
    vals[PILGRIMS_COL_.issueDate] = _tripFormatDate_(P(template, 'issueDate'));
    vals[PILGRIMS_COL_.expiryDate] = _tripFormatDate_(P(template, 'expiryDate'));
    vals[PILGRIMS_COL_.pid] = String(P(template, 'pid') || "") || ('P' + new Date().getTime().toString(36));
    sheet.appendRow(_buildRowByName_(C, width, vals));
  }
  logChange_(session.username, "تخصيص معتمر لرحلة", String(P(template, 'name')), "معتمر", "-", tripName);
  clearAllCache();
  return { success: true };
}

/**
 * نقل معتمر من رحلة إلى أخرى (مع توابعه المرتبطين به كمحرم في نفس الرحلة).
 * يُنقل صف الرحلة المصدر بتغيير اسم الرحلة، مع مسح رقم الغرفة والفنادق (خاصة بالرحلة القديمة)
 */
function movePilgrimBetweenTrips(authToken, ident, fromTrip, toTrip, force) {
  var session = requireAuth_(authToken);
  ident = ident || {};
  fromTrip = String(fromTrip || "").trim();
  toTrip = String(toTrip || "").trim();
  if (!fromTrip || !toTrip || fromTrip === toTrip) throw new Error("حدد رحلتين مختلفتين");

  var sheet = _getPilgrimsSheet_();
  // 🔒 خريطة أعمدة متينة + قراءة/كتابة بالاسم
  var C = _robustColMap_(sheet, PILGRIMS_HEADERS_);
  var width = sheet.getLastColumn();
  var P = _cellReader_(C, PILGRIMS_COL_);
  var setP = function(rowIdx, key, value) { var idx = C[PILGRIMS_COL_[key]]; if (idx !== undefined) sheet.getRange(rowIdx, idx + 1).setValue(value); };
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];

  var pid = String(ident.pid || "").trim();
  var passport = String(ident.passport || "").trim();
  var name = String(ident.name || "").trim();

  // صف المعتمر الأساسي في الرحلة المصدر
  var mainIdx = -1;
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (String(P(r, 'tripName') || "").trim() !== fromTrip) continue;
    var match = (pid && String(P(r, 'pid') || "").trim() === pid) ||
                (passport && String(P(r, 'passport') || "").trim() === passport) ||
                (!pid && !passport && name && String(P(r, 'name') || "").trim() === name);
    if (match) { mainIdx = i; break; }
  }
  if (mainIdx === -1) return { success: false, error: "المعتمر غير موجود في الرحلة المصدر (احفظ الكشف أولاً؟)" };

  var mainPid = String(P(data[mainIdx], 'pid') || "").trim();
  var mainPassport = String(P(data[mainIdx], 'passport') || "").trim();

  // منع التكرار في الرحلة الهدف
  for (var d2 = 0; d2 < data.length; d2++) {
    if (String(P(data[d2], 'tripName') || "").trim() !== toTrip) continue;
    if ((mainPassport && String(P(data[d2], 'passport') || "").trim() === mainPassport) ||
        (!mainPassport && String(P(data[d2], 'name') || "").trim() === String(P(data[mainIdx], 'name') || "").trim())) {
      return { success: false, error: "المعتمر مسجَّل بالفعل في الرحلة الهدف" };
    }
  }

  // المعتمر + توابعه (المرتبطون به كمحرم بنفس الرحلة المصدر) — مراعاة المحارم
  var toMove = [mainIdx];
  if (mainPid) {
    for (var j = 0; j < data.length; j++) {
      if (j === mainIdx) continue;
      if (String(P(data[j], 'tripName') || "").trim() !== fromTrip) continue;
      if (String(P(data[j], 'mahramPid') || "").trim() === mainPid) toMove.push(j);
    }
  }

  // ⛔ كشف تعارض التواريخ: هل المعتمر (أو أحد توابعه) مسجَّل في رحلة ثالثة تتقاطع
  // تواريخها مع الرحلة الهدف؟ (نستثني الرحلة المصدر لأنه يغادرها بالنقل)
  if (!force) {
    var checkList = toMove.map(function(idx) {
      return { name: String(P(data[idx], 'name') || ""), passport: String(P(data[idx], 'passport') || "") };
    });
    var conflicts = _checkTripConflicts_(toTrip, checkList).filter(function(c) {
      return c.kind === "passport" && c.otherTrip !== fromTrip;
    });
    if (conflicts.length) {
      return {
        success: false, conflict: true,
        error: conflicts.map(function(c) { return c.message; }).join("\n")
      };
    }
  }

  // ⛔ منع التكرار للتوابع أيضاً: أي فرد من المجموعة المنقولة موجود مسبقاً بالرحلة الهدف يوقف النقل
  var dupNames = [];
  toMove.forEach(function(idx) {
    var mp = String(P(data[idx], 'passport') || "").trim(), mn = String(P(data[idx], 'name') || "").trim();
    for (var dd = 0; dd < data.length; dd++) {
      if (String(P(data[dd], 'tripName') || "").trim() !== toTrip) continue;
      if ((mp && String(P(data[dd], 'passport') || "").trim() === mp) || (!mp && mn && String(P(data[dd], 'name') || "").trim() === mn)) {
        dupNames.push(mn); break;
      }
    }
  });
  if (dupNames.length) {
    return { success: false, error: "موجود بالفعل في الرحلة الهدف: " + dupNames.join("، ") };
  }

  var movedNames = [];
  var movedRoomNos = []; // 🔗 أرقام غرف من غادروا — تُستخدَم لإعادة ضبط من تبقّى منهم في الرحلة المصدر
  toMove.forEach(function(idx) {
    var rowIdx = idx + 2;
    var oldRoomNo = String(P(data[idx], 'roomNo') || "").trim();
    if (oldRoomNo) movedRoomNos.push(oldRoomNo);
    setP(rowIdx, 'tripName', toTrip);   // اسم الرحلة
    setP(rowIdx, 'roomNo', "");          // رقم الغرفة (تسكين الرحلة القديمة)
    setP(rowIdx, 'bookingId', "");       // رقم الإشعار (خاص بالرحلة القديمة)
    setP(rowIdx, 'hotelMadinah', "");    // فندق المدينة
    setP(rowIdx, 'hotelMakkah', "");     // فندق مكة
    movedNames.push(String(P(data[idx], 'name') || ""));
  });

  // 🔓 من تبقّى في الرحلة المصدر بنفس رقم غرفة أحد من غادروا (دابل/ثلاثي/رباعي أسرة/خماسي أسرة
  // مرتبطة) يعودون للتسكين الافتراضي — نفس منطق _resetRoomGroupCascade_ من واجهة الكشف، لكن هنا
  // للحالة التي لم تكن مغطاة سابقاً: النقل المباشر بين الرحلات (لا يمر بشاشة الكشف المفتوحة إطلاقاً)
  var movedIdxSet = {}; toMove.forEach(function(idx) { movedIdxSet[idx] = true; });
  if (movedRoomNos.length) {
    for (var k = 0; k < data.length; k++) {
      if (movedIdxSet[k]) continue; // هو نفسه من غادر — تعامَلنا معه فوق بالفعل
      if (String(P(data[k], 'tripName') || "").trim() !== fromTrip) continue;
      var kRoomNo = String(P(data[k], 'roomNo') || "").trim();
      if (!kRoomNo || movedRoomNos.indexOf(kRoomNo) === -1) continue;
      var kRowIdx = k + 2;
      setP(kRowIdx, 'roomNo', "");
      var kType = String(P(data[k], 'type') || "").trim();
      // الأطفال/الرضّع بلا سرير أصلاً (لا طبيعة تسكين مستقلة لهم) — لا نلمس نوع تسكينهم
      if (kType !== 'طفل' && kType !== 'رضيع') {
        setP(kRowIdx, 'accommodation', 'رباعي'); // نفس الافتراضي المستخدَم في _resetRoomGroupCascade_
      }
    }
  }

  logChange_(session.username, "نقل معتمر بين رحلتين", movedNames.join("، "), "معتمر",
             fromTrip, toTrip + " (عدد: " + movedNames.length + ")");
  clearAllCache();
  return { success: true, moved: movedNames.length, names: movedNames };
}

/**
 * نقل مجمّع: ينقل عدة معتمرين (بتوابعهم) من رحلة لأخرى ويجمع النتائج.
 * التابع المنقول تلقائياً مع محرمه يُتخطى تلقائياً عند دوره ("غير موجود بالمصدر").
 */
function movePilgrimsBulk(authToken, idents, fromTrip, toTrip, force) {
  requireAuth_(authToken);
  idents = idents || [];
  var movedTotal = 0, movedNames = [], errors = [];
  idents.forEach(function(ident) {
    try {
      var res = movePilgrimBetweenTrips(authToken, ident, fromTrip, toTrip, force);
      if (res && res.success) { movedTotal += res.moved; movedNames = movedNames.concat(res.names || []); }
      else if (res && res.error) {
        // تابع نُقل بالفعل ضمن محرمه — ليس خطأ حقيقياً
        if (String(res.error).indexOf("غير موجود في الرحلة المصدر") === -1) {
          errors.push((ident.name || ident.passport || "?") + ": " + res.error);
        }
      }
    } catch (e) { errors.push((ident.name || "?") + ": " + (e.message || e)); }
  });
  clearAllCache();
  return { success: errors.length === 0, moved: movedTotal, names: movedNames, errors: errors };
}

/** تخصيص مجمّع: يخصص عدة معتمرين من السجل العام لرحلة ويجمع النتائج */
function assignPilgrimsBulk(authToken, keys, tripName, force) {
  requireAuth_(authToken);
  keys = keys || [];
  var assigned = 0, errors = [];
  keys.forEach(function(k) {
    try {
      var res = assignPilgrimToTrip(authToken, k, tripName, force);
      if (res && res.success) assigned++;
      else if (res && res.error) errors.push(k + ": " + res.error);
    } catch (e) { errors.push(k + ": " + (e.message || e)); }
  });
  clearAllCache();
  return { success: errors.length === 0, assigned: assigned, errors: errors };
}

/**
 * حذف مجمّع من السجل العام: يحذف كل صفوف المعتمرين المطابقين (بكل رحلاتهم)
 * بصلاحية DELETE/admin + نسخة احتياطية كاملة قبل التنفيذ.
 */
function deleteGlobalPilgrims(authToken, keys) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, "registry.delete")) {
    throw new Error("الحذف المجمّع متاح فقط لصاحب صلاحية DELETE أو admin");
  }
  keys = (keys || []).map(function(k) { return String(k || "").trim(); }).filter(Boolean);
  if (!keys.length) return { success: false, error: "لا يوجد اختيار" };

  _backupSpreadsheet_('قبل حذف مجمّع من سجل المعتمرين');

  var sheet = _getPilgrimsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, removed: 0 };
  var C = _robustColMap_(sheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(C, PILGRIMS_COL_);
  var width = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var kept = [], removed = 0;
  data.forEach(function(r) {
    var pass = String(P(r, 'passport') || "").trim(), name = String(P(r, 'name') || "").trim();
    var match = keys.indexOf(pass) !== -1 || (!pass && keys.indexOf(name) !== -1);
    if (match) removed++; else kept.push(r);
  });
  sheet.getRange(2, 1, lastRow - 1, width).clearContent();
  if (kept.length) sheet.getRange(2, 1, kept.length, width).setValues(kept);
  clearAllCache();
  logChange_(session.username, "حذف مجمّع من سجل المعتمرين", keys.join("، "), "معتمر", "-", "صفوف: " + removed);
  return { success: true, removed: removed };
}

// حفظ كشف معتمرين رحلة دفعة واحدة: يستبدل كل الصفوف القديمة للرحلة بالقائمة الجديدة
// (أبسط وأأمن من مزامنة صف-بصف، والحجم المتوقع لكل رحلة صغير)
// معاينة التعارضات قبل الحفظ الفعلي — بلا أي كتابة على الشيت (dry-run)
function checkTripConflictsPreview(authToken, tripName, pilgrims) {
  requireAuth_(authToken);
  return _checkTripConflicts_(tripName, pilgrims || []);
}

function saveTripPilgrims(authToken, tripName, pilgrims) {
  var session = requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  if (!tripName) throw new Error("اسم الرحلة مطلوب");
  pilgrims = pilgrims || [];

  var sheet = _getPilgrimsSheet_();
  var lastRow = sheet.getLastRow();

  // 🔒 خريطة أعمدة متينة + كتابة/قراءة بالاسم
  var C = _robustColMap_(sheet, PILGRIMS_HEADERS_);
  var width = sheet.getLastColumn();
  var nameCol = C[PILGRIMS_COL_.name], tripCol = C[PILGRIMS_COL_.tripName];

  // ⚡ تحديث دفعي بدل حذف-وإعادة-إضافة صفاً بصف (كان بطيئاً وخطِراً على البيانات لو انقطع التنفيذ):
  // نقرأ كل الصفوف مرة واحدة، نُبقي صفوف الرحلات الأخرى كما هي، ونستبدل مجموعة هذه الرحلة فقط.
  var keptRows = [];
  var oldThisTrip = [];
  if (lastRow >= 2) {
    var allData = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    allData.forEach(function(r) {
      if (String((tripCol !== undefined ? r[tripCol] : "") || "").trim() !== tripName) keptRows.push(r);
      else oldThisTrip.push(r);
    });
  }

  // 🔒 فحص صلاحية الحذف: saveTripPilgrims يُستخدم لكل عمليات حفظ الكشف (إضافة/تعديل/حذف معاً)،
  // فكان أي مستخدم مسجَّل دخوله — بغض النظر عن صلاحياته — يقدر يحذف معتمرين بمجرد حفظ كشف فيه عدد
  // أقل من المحفوظ، لأن الدالة كانت تتحقق من تسجيل الدخول فقط (requireAuth_) بلا أي فحص صلاحية حذف.
  // الفحص هنا يقارن هوية كل معتمر قديم (نفس منطق _logKashfDiff_ بالضبط: pid ثم جواز ثم اسم) مقابل
  // القائمة الجديدة — لو فيه معتمر قديم مفقود فعلاً من الجديد (حذف حقيقي) ولا يملك المستخدم صلاحية
  // kashf.delete، يُرفض الحفظ بالكامل قبل أي كتابة على الشيت (حماية كل من التعديل والحذف معاً أفضل
  // من قبول تعديلات جزئية وحظر الحذف فقط، لتفادي حفظ حالة نصف محدَّثة قد تُربك المستخدم)
  if (oldThisTrip.length) {
    var _keyOf_ = function(name, passport, pid) {
      return String(pid || "").trim() || String(passport || "").trim() || String(name || "").trim();
    };
    var _oldKeys_ = {};
    oldThisTrip.forEach(function(r) {
      var k = _keyOf_(nameCol !== undefined ? r[nameCol] : "", C[PILGRIMS_COL_.passport] !== undefined ? r[C[PILGRIMS_COL_.passport]] : "", C[PILGRIMS_COL_.pid] !== undefined ? r[C[PILGRIMS_COL_.pid]] : "");
      if (k) _oldKeys_[k] = true;
    });
    var _newKeys_ = {};
    pilgrims.forEach(function(p) {
      var k = _keyOf_(p.name, p.passport, p.pid);
      if (k) _newKeys_[k] = true;
    });
    var _anyDeleted_ = Object.keys(_oldKeys_).some(function(k) { return !_newKeys_[k]; });
    if (_anyDeleted_ && !_sessionHasPerm_(session, "kashf.delete")) {
      throw new Error("لا تملك صلاحية حذف معتمرين من الكشف — يمكنك إضافة/تعديل البيانات، لكن الحذف متاح فقط لصاحب صلاحية DELETE أو admin");
    }
  }

  // أضف القائمة الجديدة دفعة واحدة (بناء الصف بأسماء الأعمدة ليطابق ترتيب الشيت الفعلي)
  if (pilgrims.length) {
    var rows = pilgrims.map(function(p, idx) {
      var vals = {};
      vals[PILGRIMS_COL_.serial] = idx + 1;
      vals[PILGRIMS_COL_.name] = String(p.name || "").trim();
      vals[PILGRIMS_COL_.passport] = String(p.passport || "").trim();
      vals[PILGRIMS_COL_.type] = String(p.type || "");
      vals[PILGRIMS_COL_.client] = String(p.client || "");
      // 👶 الرضيع دائماً بدون تسكين/سرير — حماية سيرفر-سايد أخيرة بغض النظر عمّا يرسله العميل
      vals[PILGRIMS_COL_.accommodation] = (String(p.type || "") === "رضيع") ? "" : String(p.accommodation || "");
      vals[PILGRIMS_COL_.roomNo] = String(p.roomNo || "");
      vals[PILGRIMS_COL_.notes] = String(p.notes || "");
      vals[PILGRIMS_COL_.tripName] = tripName;
      vals[PILGRIMS_COL_.bookingId] = String(p.bookingId || "");
      vals[PILGRIMS_COL_.latinName] = String(p.latinName || "").trim();
      vals[PILGRIMS_COL_.birthDate] = String(p.birthDate || "").trim();
      vals[PILGRIMS_COL_.issueDate] = String(p.issueDate || "").trim();
      vals[PILGRIMS_COL_.expiryDate] = String(p.expiryDate || "").trim();
      vals[PILGRIMS_COL_.pid] = String(p.pid || "").trim();
      vals[PILGRIMS_COL_.mahramPid] = String(p.mahramPid || "").trim();
      vals[PILGRIMS_COL_.mahramRel] = String(p.mahramRel || "").trim();
      vals[PILGRIMS_COL_.hotelMadinah] = String(p.hotelMadinah || "").trim();
      vals[PILGRIMS_COL_.hotelMakkah] = String(p.hotelMakkah || "").trim();
      vals[PILGRIMS_COL_.roomGroup] = String(p.roomGroup || "").trim();
      vals[PILGRIMS_COL_.housingExcluded] = p.housingExcluded ? "1" : "";
      vals[PILGRIMS_COL_.roomNoMadinah] = String(p.roomNoMadinah || "").trim();
      vals[PILGRIMS_COL_.roomNoMakkah] = String(p.roomNoMakkah || "").trim();
      // 🏙️ (V4.47) استبعاد منفصل لكل مدينة
      vals[PILGRIMS_COL_.housingExcludedMadinah] = p.housingExcludedMadinah ? "1" : "";
      vals[PILGRIMS_COL_.housingExcludedMakkah] = p.housingExcludedMakkah ? "1" : "";
      return _buildRowByName_(C, width, vals);
    }).filter(function(r) { return nameCol !== undefined && String(r[nameCol] || "").trim(); }); // تجاهل الصفوف بدون اسم
    keptRows = keptRows.concat(rows);
  }

  // 🗂️ المعتمرون المحذوفون من الرحلة يُحوَّلون لصفوف "بدون رحلة" (يبقون بالسجل العام)
  // بحيث يمكن لاحقاً تخصيص رحلة لهم أو حذفهم نهائياً من السجل العام — بدل فقدانهم عند حفظ الكشف
  if (oldThisTrip.length) {
    var _passC = C[PILGRIMS_COL_.passport], _pidC = C[PILGRIMS_COL_.pid], _nameC = C[PILGRIMS_COL_.name];
    var _tripC = C[PILGRIMS_COL_.tripName], _roomC = C[PILGRIMS_COL_.roomNo], _bkC = C[PILGRIMS_COL_.bookingId];
    var _hmC = C[PILGRIMS_COL_.hotelMadinah], _hkC = C[PILGRIMS_COL_.hotelMakkah];
    var _newKeys = {};
    (pilgrims || []).forEach(function(p) {
      var k = String(p.passport || "").trim() || String(p.pid || "").trim() || String(p.name || "").trim();
      if (k) _newKeys[k] = true;
    });
    var _keptKeys = {};
    keptRows.forEach(function(r) {
      var kp = _passC !== undefined ? String(r[_passC] || "").trim() : "";
      var kn = _nameC !== undefined ? String(r[_nameC] || "").trim() : "";
      if (kp) _keptKeys['P:' + kp] = true;
      if (kn) _keptKeys['N:' + kn] = true;
    });
    oldThisTrip.forEach(function(r) {
      var pass = _passC !== undefined ? String(r[_passC] || "").trim() : "";
      var pid = _pidC !== undefined ? String(r[_pidC] || "").trim() : "";
      var nm = _nameC !== undefined ? String(r[_nameC] || "").trim() : "";
      if (!nm) return;
      var key = pass || pid || nm;
      if (_newKeys[key]) return;                                                     // ما زال ضمن الرحلة
      if ((pass && _keptKeys['P:' + pass]) || (!pass && _keptKeys['N:' + nm])) return; // موجود بالفعل برحلة أخرى
      var noTrip = r.slice();
      if (_tripC !== undefined) noTrip[_tripC] = "";
      if (_roomC !== undefined) noTrip[_roomC] = "";
      if (_bkC !== undefined) noTrip[_bkC] = "";
      if (_hmC !== undefined) noTrip[_hmC] = "";
      if (_hkC !== undefined) noTrip[_hkC] = "";
      keptRows.push(noTrip);
      _keptKeys[pass ? ('P:' + pass) : ('N:' + nm)] = true;
    });
  }

  // ✍️ كتابة دفعية واحدة: امسح كل صفوف البيانات ثم اكتب (صفوف الرحلات الأخرى + صفوف هذه الرحلة) مرة واحدة
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, width).clearContent();
  if (keptRows.length) {
    sheet.getRange(2, 1, keptRows.length, width).setValues(keptRows);
  }

  // 📝 سجل تدقيق تفصيلي: أضيف/عُدّل/حُذف معتمر مع القيم القديمة/الجديدة (تُقرأ الصفوف القديمة بالاسم)
  try { _logKashfDiff_(session.username, tripName, oldThisTrip, pilgrims, C); }
  catch (e) { Logger.log('kashf diff log failed: ' + e); }

  // 🧑‍✈️ (V4.15) مزامنة مشرفي الرحلة من الكشف: صف عميله «المشرف...» = مشرف فعلي بملف الرحلة
  // (إضافة مشرف ثانٍ بتعديل خانة العميل، وحذف مشرف بحذف صفه) — داخل try فلا يفشل الحفظ بسببها
  try { _syncTripSupervisorsFromKashf_(tripName, pilgrims, session.username); }
  catch (eSup) { Logger.log('supervisors sync failed: ' + eSup); }

  // 🔔 (V4.32) تنبيهات: عميل جديد على الرحلة، أو تغيّر تسكين/عدد/فندق لعميل له حساب مسجَّل مسبقًا
  try { _pushKashfChangeNotifications_(tripName, oldThisTrip, pilgrims, C, session.username); }
  catch (eNotif) { Logger.log('kashf change notifications failed: ' + eNotif); }

  clearAllCache(); // الكشف يؤثر على قائمة الرحلات (المقاعد/الجاهزية) والسجل العام

  // 💵 (V4.12) مزامنة حسابات العملاء تلقائياً لو للرحلة تسعير مفعَّل («تطبيق» ضُغط من قبل):
  // معتمرون جدد/تغيّر مستوى أو تسكين ← تتحدث البنود التلقائية فوراً، والمعدّلة يدوياً لا تُمس.
  // داخل try حتى لا يفشل حفظ الكشف نفسه أبداً بسبب المحاسبة
  var accSync = null;
  try { accSync = _syncTripAccounts_(authToken, tripName, session.username); }
  catch (eSync) { Logger.log('acc sync failed: ' + eSync); }

  var conflicts = _checkTripConflicts_(tripName, pilgrims);
  return { success: true, count: pilgrims.length , conflicts: conflicts, accSync: accSync };
}

// 🧑‍✈️ (V4.15) مزامنة قائمة مشرفي الرحلة (بملف الرحلة) مع صفوف «المشرف» بالكشف المحفوظ:
// • صف جديد عميله «المشرف/مشرف» → يُضاف مشرفًا للرحلة (الأول مشرف رئيسي، والتالي مشرف ثانٍ)
// • حذف صف مشرف من الكشف → يُحذف من إشراف الرحلة
// • الدور من لاحقة الخانة: (استقبال) → استقبال فقط · (الوكيل) → الوكيل · وإلا يُحفَظ دوره السابق أو «مرافق»
// • مشرفو «الوكيل» بلا صفوف كشف أصلًا — يُحافَظ عليهم دائمًا كما هم
function _syncTripSupervisorsFromKashf_(tripName, pilgrims, username) {
  var sheet = _getTripsSheet_();
  if (!sheet || sheet.getLastRow() < 2) return;
  var C = _robustColMap_(sheet, TRIPS_HEADERS_);
  var width = sheet.getLastColumn();
  var nameCol = C[TRIPS_COL_.name];
  var supCol = C[TRIPS_COL_.supervisor], roleCol = C[TRIPS_COL_.supervisorRole], jsonCol = C[TRIPS_COL_.supervisorsJson];
  if (nameCol === undefined || jsonCol === undefined) return;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][nameCol] || '').trim() !== tripName) continue;

    var cur = [];
    try { cur = JSON.parse(String(data[i][jsonCol] || '[]')) || []; } catch (e) { cur = []; }
    if (!cur.length && supCol !== undefined) {
      var s1 = String(data[i][supCol] || '').trim();
      if (s1) cur = [{ name: s1, role: (roleCol !== undefined ? String(data[i][roleCol] || '') : '') || 'مرافق' }];
    }
    var roleOf = {};
    cur.forEach(function(s) { if (s && s.name) roleOf[String(s.name).trim()] = s.role || 'مرافق'; });

    var kashfSups = [], seen = {};
    (pilgrims || []).forEach(function(p) {
      var cl = String(p.client || '').trim();
      if (cl !== 'مشرف' && cl.indexOf('المشرف') !== 0) return;
      var nm = String(p.name || '').trim();
      if (!nm || seen[nm]) return;
      seen[nm] = 1;
      var role = cl.indexOf('الوكيل') > -1 ? 'الوكيل'
               : cl.indexOf('استقبال') > -1 ? 'استقبال فقط'
               : (roleOf[nm] || 'مرافق');
      kashfSups.push({ name: nm, role: role });
    });
    cur.forEach(function(s) {
      var nm = s && s.name ? String(s.name).trim() : '';
      if (nm && (s.role || '') === 'الوكيل' && !seen[nm]) { kashfSups.push({ name: nm, role: 'الوكيل' }); seen[nm] = 1; }
    });

    var oldJson = cur.length ? JSON.stringify(cur) : '';
    var newJson = kashfSups.length ? JSON.stringify(kashfSups) : '';
    if (oldJson === newJson) return;
    sheet.getRange(i + 2, jsonCol + 1).setValue(newJson);
    if (supCol !== undefined) sheet.getRange(i + 2, supCol + 1).setValue(kashfSups.length ? kashfSups[0].name : '');
    if (roleCol !== undefined) sheet.getRange(i + 2, roleCol + 1).setValue(kashfSups.length ? (kashfSups[0].role || 'مرافق') : '');
    logChange_(username, 'مزامنة مشرفي الرحلة من الكشف', tripName, 'المشرفون',
      cur.map(function(s) { return s.name + ' (' + (s.role || 'مرافق') + ')'; }).join('، ') || '-',
      kashfSups.map(function(s) { return s.name + ' (' + s.role + ')'; }).join('، ') || '-');
    return;
  }
}

// يقارن الكشف القديم بالجديد ويسجّل كل إضافة/تعديل/حذف بقيمه القديمة والجديدة
// colMap اختياري: لو مُرِّر، تُقرأ الصفوف القديمة بأسماء الأعمدة؛ وإلا بالفهارس الثابتة
function _logKashfDiff_(username, tripName, oldRows, newPilgrims, colMap) {
  var keyOf = function(name, passport, pid) {
    return String(pid || "").trim() || String(passport || "").trim() || String(name || "").trim();
  };
  var g = function(r, key, fixedIdx) {
    var idx = colMap ? colMap[PILGRIMS_COL_[key]] : fixedIdx;
    return (idx === undefined) ? "" : r[idx];
  };
  var oldMap = {}, oldOrder = [];
  (oldRows || []).forEach(function(r) {
    var k = keyOf(g(r, 'name', 1), g(r, 'passport', 2), g(r, 'pid', 14));
    if (!k) return;
    oldMap[k] = {
      name: String(g(r, 'name', 1) || ""), passport: String(g(r, 'passport', 2) || ""), type: String(g(r, 'type', 3) || ""),
      client: String(g(r, 'client', 4) || ""), accommodation: String(g(r, 'accommodation', 5) || ""), roomNo: String(g(r, 'roomNo', 6) || ""),
      notes: String(g(r, 'notes', 7) || ""), hotelMadinah: String(g(r, 'hotelMadinah', 17) || ""), hotelMakkah: String(g(r, 'hotelMakkah', 18) || "")
    };
    oldOrder.push(k);
  });
  var newMap = {};
  (newPilgrims || []).forEach(function(p) {
    if (!String(p.name || "").trim()) return;
    var k = keyOf(p.name, p.passport, p.pid);
    newMap[k] = {
      name: String(p.name || ""), passport: String(p.passport || ""), type: String(p.type || ""),
      client: String(p.client || ""), accommodation: String(p.accommodation || ""), roomNo: String(p.roomNo || ""),
      notes: String(p.notes || ""), hotelMadinah: String(p.hotelMadinah || ""), hotelMakkah: String(p.hotelMakkah || "")
    };
  });
  var FIELDS = [
    { k: 'name', l: 'الاسم' }, { k: 'passport', l: 'الجواز' }, { k: 'type', l: 'النوع' },
    { k: 'client', l: 'العميل' }, { k: 'accommodation', l: 'التسكين' }, { k: 'roomNo', l: 'الغرفة' },
    { k: 'hotelMadinah', l: 'فندق المدينة' }, { k: 'hotelMakkah', l: 'فندق مكة' }, { k: 'notes', l: 'ملاحظات' }
  ];
  var entries = [];
  // محذوفون: في القديم وليسوا في الجديد
  // 🧾 اسم المعتمر + عميله يظهران دائماً في عمود "الحقل" بسجل التعديلات — بغض النظر عن نوع العملية
  // (إضافة/حذف/تعديل)، بدل ما يظهر العميل بس لو كان هو نفسه الحقل اللي اتغيّر
  var withClient_ = function(name, client) {
    return name + (client ? ' (العميل: ' + client + ')' : '');
  };
  oldOrder.forEach(function(k) {
    if (!newMap[k]) entries.push({ action: 'حذف معتمر', recordId: tripName, field: withClient_(oldMap[k].name, oldMap[k].client), oldVal: oldMap[k].name + (oldMap[k].passport ? ' / ' + oldMap[k].passport : ''), newVal: '-' });
  });
  // مضافون أو معدّلون
  Object.keys(newMap).forEach(function(k) {
    var nw = newMap[k], od = oldMap[k];
    if (!od) {
      entries.push({ action: 'تسجيل معتمر', recordId: tripName, field: withClient_(nw.name, nw.client), oldVal: '-', newVal: nw.name + (nw.passport ? ' / ' + nw.passport : '') });
    } else {
      var changed = FIELDS.filter(function(f){ return String(od[f.k]) !== String(nw[f.k]); });
      if (changed.length) {
        entries.push({
          action: 'تحديث معتمر', recordId: tripName, field: withClient_(nw.name, nw.client) + ' — ' + changed.map(function(f){ return f.l; }).join('، '),
          oldVal: changed.map(function(f){ return f.l + ': ' + (od[f.k] || '—'); }).join(' | '),
          newVal: changed.map(function(f){ return f.l + ': ' + (nw[f.k] || '—'); }).join(' | ')
        });
      }
    }
  });
  if (entries.length) logChangesBatch_(username, entries);
  else logChange_(username, 'حفظ الكشف', tripName, 'كشف المعتمرين', '-', 'حفظ بلا تغييرات (' + (newPilgrims || []).length + ')');
}

// يبني قالب إكسيل جاهز للتعبئة لكشف المعتمرين ويرجع رابط تحميله
// tripName اختياري: لو مُمرَّر ولها فنادق مسجَّلة (getTripHotelsList) تُضاف قائمة منسدلة
// بأسماء فنادق المدينة/مكة الخاصة بالرحلة لعمودي التسكين — وإلا يبقى العمودان نصاً حراً
// (كل هذا اختياري بالكامل: المستخدم يقدر يسيب الخانتين فارغتين سواء وُجدت قائمة أم لا)
function generatePilgrimsTemplate(authToken, tripName) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();

  var ss = SpreadsheetApp.create("قالب_كشف_المعتمرين");
  var sheet = ss.getSheets()[0];
  sheet.setName("كشف المعتمرين");
  sheet.setRightToLeft(true);

  var templateHeaders = ["اسم المعتمر", "الاسم بالإنجليزية", "رقم الجواز", "النوع", "تاريخ الميلاد", "تاريخ إصدار الجواز", "تاريخ انتهاء الجواز", "العميل", "طبيعة التسكين", "رقم الغرفة", "ملاحظات", "فندق المدينة", "فندق مكة"];
  sheet.getRange(1, 1, 1, templateHeaders.length).setValues([templateHeaders])
    .setBackground("#065f46").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);

  // تحقق منسدل لعمود النوع
  var typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["ذكر", "أنثى", "طفل", "رضيع"], true).setAllowInvalid(false).build();
  sheet.getRange(2, 4, 500, 1).setDataValidation(typeRule);

  // 🏨 لو الرحلة مُمرَّرة ولها فنادق مسجَّلة، نضيف قائمة منسدلة لعمودي فندق المدينة/فندق مكة
  // (allowInvalid=true حتى لا نمنع الكتابة اليدوية، لكن عند الرفع أي اسم لا يطابق فنادق
  //  الرحلة تماماً يُتجاهل ويُترك الحقل فارغاً ليُختار يدوياً من داخل النظام — راجع parsePilgrimsExcel)
  if (tripName) {
    try {
      var tripHotels = getTripHotelsList(authToken, tripName);
      if (tripHotels && tripHotels.madinah && tripHotels.madinah.length) {
        var madinahRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(tripHotels.madinah, true).setAllowInvalid(true).build();
        sheet.getRange(2, 12, 500, 1).setDataValidation(madinahRule);
      }
      if (tripHotels && tripHotels.makkah && tripHotels.makkah.length) {
        var makkahRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(tripHotels.makkah, true).setAllowInvalid(true).build();
        sheet.getRange(2, 13, 500, 1).setDataValidation(makkahRule);
      }
    } catch (hErr) {
      Logger.log('generatePilgrimsTemplate: تعذر تحميل فنادق الرحلة (' + tripName + '): ' + hErr);
    }
  }

  for (var c = 1; c <= templateHeaders.length; c++) sheet.setColumnWidth(c, 140);

  var file = DriveApp.getFileById(ss.getId());
  var folder = getDriveFolder_('EXPORTS');
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  SpreadsheetApp.flush();

  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  return url;
}

// 📥 (V4.58) قالب «صفا» — نفس ترتيب الأعمدة الرسمي لبرنامج صفا لاستيراد بيانات المعتمرين
function generatePilgrimsTemplateSafa(authToken) {
  requireAuth_(authToken);
  var ss = SpreadsheetApp.create("قالب_صفا_للمعتمرين");
  var sheet = ss.getSheets()[0];
  sheet.setName("كشف صفا");
  sheet.setRightToLeft(true);
  var headers = ["م","س","رقم الجواز","الاسم","الجنسية","الجنس","العمر","رقم قومي","نسك","الموفا","رقم الحدود","ENumber","تأمين","رقم الفيزا","العميل","تم التدقيق","",
                 "اللقب","First","Father","Grand","Last","Mother",
                 "الاسم الأول","اسم الأب","اسم الجد","الاسم الأخير","اسم الأم",
                 "تاريخ الميلاد","بلد الميلاد","مكان الميلاد",
                 "الحالة الاجتماعية","المستوى التعليمي","المهنة","العنوان",
                 "بلد الاصدار","مكان الاصدار","تاريخ الاصدار","تاريخ الصلاحية",
                 "Health_Status","ملاحظات","الهاتف","الموبايل","الايميل","رقم الاقامة"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground("#075985").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  for (var c = 1; c <= headers.length; c++) sheet.setColumnWidth(c, 120);
  var file = DriveApp.getFileById(ss.getId());
  var folder = getDriveFolder_('EXPORTS');
  folder.addFile(file); DriveApp.getRootFolder().removeFile(file);
  SpreadsheetApp.flush();
  return 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
}

// يستقبل ملف إكسيل معبأ (base64) ويحوّله لصفوف معتمرين ويرجعها للواجهة للمراجعة قبل الحفظ
// tripName اختياري: لو مُمرَّر، تُقرأ فنادق الرحلة المسجَّلة (getTripHotelsList) ويُقارَن بها
// عمودا فندق المدينة/فندق مكة بالملف — تطابق تام فقط يُسجَّل، وأي اسم غير مطابق يُترك فارغاً
// ليختاره المستخدم يدوياً من داخل النظام بعد الاستيراد
function parsePilgrimsExcel(authToken, base64Data, fileName, tripName) {
  requireAuth_(authToken);

  var tempFile = null, tempSs = null;
  try {
    var contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, fileName || 'pilgrims_upload.xlsx');

    // التحويل لـ Google Sheet مؤقت عشان نقدر نقرأه بـ SpreadsheetApp
    var resource = { title: 'temp_pilgrims_import_' + Date.now(), mimeType: MimeType.GOOGLE_SHEETS };
    tempFile = Drive.Files.insert(resource, blob, { convert: true });
    tempSs = SpreadsheetApp.openById(tempFile.id);
    var sheet = tempSs.getSheets()[0];

    var lastRow = sheet.getLastRow();
    // 📥 (V4.58) نقرأ الأعمدة كاملةً لدعم قالب «صفا» ذو 40+ عمود مع الاحتفاظ بدعم القالبين الأقدم
    var actualLastCol = sheet.getLastColumn();
    var lastCol = Math.min(actualLastCol, 60);
    if (lastRow < 2) return { success: true, pilgrims: [] };

    // 🏨 خرائط فنادق الرحلة (لو مُمرَّرة) للتحقق من تطابق ما بالملف — تطابق تام بعد إزالة الفراغات الطرفية فقط
    var madinahSet = null, makkahSet = null;
    tripName = String(tripName || "").trim();
    if (tripName) {
      try {
        var tripHotels = getTripHotelsList(authToken, tripName);
        madinahSet = {}; (tripHotels.madinah || []).forEach(function(h) { madinahSet[h.trim()] = h.trim(); });
        makkahSet = {}; (tripHotels.makkah || []).forEach(function(h) { makkahSet[h.trim()] = h.trim(); });
      } catch (hErr) {
        Logger.log('parsePilgrimsExcel: تعذر تحميل فنادق الرحلة (' + tripName + '): ' + hErr);
      }
    }
    var matchHotel_ = function(val, set) {
      var v = String(val || "").trim();
      if (!v) return "";
      if (!set) return v; // لا رحلة مُمرَّرة (أو تعذر التحميل) → لا تحقق، يُقبل كما هو
      return set[v] || ""; // غير مطابق لقائمة فنادق الرحلة → يُتجاهل ويُترك فارغاً
    };

    // 🧠 (V4.58) نقرأ صف الترويسة أولاً للتفرقة بين القوالب: قالب النظام (اسم أول عمود) وقالب «صفا» (خرائط أعمدة معنونة)
    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(x) { return String(x || '').trim(); });
    var normH = header.map(function(h) { return h.replace(/\s+/g, '').toLowerCase(); });
    // كشف قالب صفا: يحوي أعمدة «رقم الجواز» + «الاسم» + «First» + «تاريخ الميلاد» متفرقة
    var idxOf_ = function(candidates) {
      for (var i = 0; i < normH.length; i++) for (var j = 0; j < candidates.length; j++) {
        var c = String(candidates[j]).replace(/\s+/g, '').toLowerCase();
        if (normH[i] === c) return i;
      }
      return -1;
    };
    var iName = idxOf_(['الاسم','اسم المعتمر']);
    var iPass = idxOf_(['رقم الجواز','رقمالجواز','passport']);
    var iFirstEn = idxOf_(['first','firstname','الاسم الأول بالإنجليزية']);
    var iBirth = idxOf_(['تاريخ الميلاد','birthdate']);
    var isSafaTpl = (iName > -1 && iPass > -1 && iFirstEn > -1 && iBirth > -1);

    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var pilgrims = [];

    if (isSafaTpl) {
      var iGender = idxOf_(['الجنس']);
      var iClient = idxOf_(['العميل']);
      var iFather = idxOf_(['father','fathername','اسم الأب']);
      var iGrand  = idxOf_(['grand','grandname','اسم الجد']);
      var iLastEn = idxOf_(['last','lastname','الاسم الأخير']);
      var iIssue  = idxOf_(['تاريخ الاصدار','تاريخ الإصدار','issuedate']);
      var iExpiry = idxOf_(['تاريخ الصلاحية','expirydate']);
      var iNotes  = idxOf_(['ملاحظات','notes']);
      // 📝 (V4.66) بطلب صريح: لا يتم كتابة أرقام الموبايل/الهاتف تلقائياً في الملاحظات — تُترك فارغة إن لم يكن هناك عمود «ملاحظات» مُدخل يدوياً
      data.forEach(function(r) {
        var nm = String(r[iName] || '').trim();
        if (!nm) return;
        var latin = [iFirstEn, iFather, iGrand, iLastEn].map(function(k) { return k > -1 ? String(r[k] || '').trim() : ''; }).filter(Boolean).join(' ');
        var g = iGender > -1 ? String(r[iGender] || '').trim() : '';
        var typ = /(ذكر|رجل|male)/i.test(g) ? 'ذكر' : /(انثى|أنثى|امرأة|female)/i.test(g) ? 'أنثى' : '';
        pilgrims.push({
          name: nm,
          latinName: latin,
          passport: iPass > -1 ? String(r[iPass] || '').trim() : '',
          type: typ,
          birthDate: iBirth > -1 ? _tripFormatDate_(r[iBirth]) : '',
          issueDate: iIssue > -1 ? _tripFormatDate_(r[iIssue]) : '',
          expiryDate: iExpiry > -1 ? _tripFormatDate_(r[iExpiry]) : '',
          client: iClient > -1 ? String(r[iClient] || '').trim() : '',
          accommodation: '',
          roomNo: '',
          notes: iNotes > -1 ? String(r[iNotes] || '').trim() : '',
          hotelMadinah: '',
          hotelMakkah: ''
        });
      });
    } else {
      // دعم القالبين: القديم 7 أعمدة (اسم/جواز/نوع/عميل/تسكين/غرفة/ملاحظات)
      // والجديد 11-13 عموداً (+ إنجليزي وميلاد وإصدار وانتهاء [+ فندق المدينة وفندق مكة])
      var isNewTpl = lastCol >= 10;
      data.forEach(function(r) {
        var name = String(r[0] || "").trim();
        if (!name) return;
        if (isNewTpl) {
          pilgrims.push({
            name: name,
            latinName: String(r[1] || "").trim(),
            passport: String(r[2] || "").trim(),
            type: String(r[3] || ""),
            birthDate: _tripFormatDate_(r[4]),
            issueDate: _tripFormatDate_(r[5]),
            expiryDate: _tripFormatDate_(r[6]),
            client: String(r[7] || ""),
            accommodation: String(r[8] || ""),
            roomNo: String(r[9] || ""),
            notes: String(r[10] || ""),
            hotelMadinah: matchHotel_(r[11], madinahSet),
            hotelMakkah: matchHotel_(r[12], makkahSet)
          });
        } else {
          pilgrims.push({
            name: name,
            passport: String(r[1] || "").trim(),
            type: String(r[2] || ""),
            client: String(r[3] || ""),
            accommodation: String(r[4] || ""),
            roomNo: String(r[5] || ""),
            notes: String(r[6] || "")
          });
        }
      });
    }

    return { success: true, pilgrims: pilgrims, viaSafa: isSafaTpl };
  } catch (e) {
    Logger.log('parsePilgrimsExcel ERROR: ' + e);
    return { success: false, error: 'تعذر قراءة الملف: ' + e.message };
  } finally {
    // تنظيف الملف المؤقت دائماً
    try { if (tempFile) DriveApp.getFileById(tempFile.id).setTrashed(true); } catch (e2) {}
  }
}

// أسماء الرحلات فقط (لقائمة الاختيار في نموذج الإشعار)
function getTripNamesList(authToken) {
  requireAuth_(authToken);
  var sheet = _getTripsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var result = [];
  names.forEach(function(r) {
    var n = String(r[0] || "").trim();
    if (n) result.push(n);
  });
  return result.sort();
}

// بيانات رحلة كاملة بالاسم + العدد المحسوب من كشف المعتمرين (شامل المشرف) —
// تُستخدم لتعبئة نموذج إشعار جديد افتراضياً من بيانات الرحلة
function getTripByName(authToken, tripName) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  if (!tripName) return null;

  var trips = getTripsList(authToken);
  for (var i = 0; i < trips.length; i++) {
    if (trips[i].name === tripName) {
      var t = trips[i];
      // العدد = المعتمرين في الكشف + المشرف (لو موجود)
      t.totalCount = t.pilgrimCount + (t.supervisor ? 1 : 0);
      return t;
    }
  }
  return null;
}

/* ============================================================
   🔗 رابط قراءة-فقط لعميل الرحلة: يعرض كشف رحلته (الأسماء + حالة الإشعار)
   بلا تسجيل دخول وبلا أي إمكانية تعديل — رمز عشوائي لكل رحلة يُخزَّن بعمودها
   ============================================================ */
/* ============================================================
   🔗 روابط العملاء (قراءة فقط) — رابط مستقل لكل عميل داخل الرحلة أو رابط "الكل"
   شيت مستقل ClientLinks: يدعم عدة روابط لنفس الرحلة، وإلغاء أي رابط في أي وقت
   بلا التأثير على البقية. صلاحية مخصصة منفصلة: trips.client_link
   ============================================================ */
var CLIENT_LINKS_HEADERS_ = ["رمز الرابط", "اسم الرحلة", "العميل", "تاريخ الإنشاء", "أنشأه", "نشط"];
function _ensureClientLinksSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("ClientLinks");
  if (!sheet) {
    sheet = ss.insertSheet("ClientLinks");
    sheet.appendRow(CLIENT_LINKS_HEADERS_);
    sheet.getRange(1, 1, 1, CLIENT_LINKS_HEADERS_.length).setFontWeight("bold").setBackground("#1e3d59").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function _requireClientLinkPerm_(authToken) {
  var session = requireAuth_(authToken);
  if (!_isFullAdminSession_(session) && !_sessionHasPerm_(session, 'trips.client_link')) {
    throw new Error('لا تملك صلاحية إنشاء/إلغاء روابط العميل');
  }
  return session;
}

// أسماء العملاء المميّزة في كشف رحلة معيّنة (لملء قائمة الاختيار عند إنشاء رابط)
function getTripClientsList(authToken, tripName) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  if (!tripName) return [];
  var pSheet = _getPilgrimsSheet_();
  var lastRow = pSheet.getLastRow();
  if (lastRow < 2) return [];
  var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(C, PILGRIMS_COL_);
  var data = pSheet.getRange(2, 1, lastRow - 1, pSheet.getLastColumn()).getValues();
  var seen = {}, clients = [];
  data.forEach(function(r) {
    if (String(P(r, 'tripName') || '').trim() !== tripName) return;
    var cl = String(P(r, 'client') || '').trim();
    if (cl && !seen[cl]) { seen[cl] = true; clients.push(cl); }
  });
  return clients.sort();
}

// كل روابط رحلة معيّنة (نشطة وملغاة) + قائمة العملاء — بطلب واحد لتسريع فتح النافذة
function getTripClientLinksInfo(authToken, tripName) {
  requireAuth_(authToken);
  tripName = String(tripName || "").trim();
  if (!tripName) throw new Error("اسم الرحلة مطلوب");
  var sheet = _ensureClientLinksSheet_();
  var lastRow = sheet.getLastRow();
  var links = [];
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var base = ScriptApp.getService().getUrl();
    data.forEach(function(r, i) {
      if (String(r[1] || '').trim() !== tripName) return;
      links.push({
        token: String(r[0] || ''),
        client: String(r[2] || ''),
        createdAt: String(r[3] || ''),
        createdBy: String(r[4] || ''),
        active: r[5] === true || String(r[5]).toLowerCase() === 'true',
        url: base + '?view=trip&t=' + String(r[0] || ''),
        row: i + 2
      });
    });
    links.sort(function(a, b) { return b.row - a.row; }); // الأحدث أولاً
  }
  return { clients: getTripClientsList(authToken, tripName), links: links };
}

// إنشاء رابط جديد — clientFilter فارغ = رابط لكل معتمري الرحلة
function createTripClientLink(authToken, tripName, clientFilter) {
  var session = _requireClientLinkPerm_(authToken);
  tripName = String(tripName || "").trim();
  if (!tripName) throw new Error("اسم الرحلة مطلوب");
  clientFilter = String(clientFilter || "").trim();

  var sheet = _ensureClientLinksSheet_();
  var token = Utilities.getUuid().replace(/-/g, '');
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Africa/Cairo', 'dd/MM/yyyy HH:mm');
  sheet.appendRow([token, tripName, clientFilter, stamp, session.username || '', true]);

  var url = ScriptApp.getService().getUrl() + '?view=trip&t=' + token;
  return { success: true, url: url, token: token };
}

// إلغاء رابط في أي وقت — لا يمس بقية روابط نفس الرحلة
function revokeTripClientLink(authToken, token) {
  _requireClientLinkPerm_(authToken);
  token = String(token || "").trim();
  if (!token) throw new Error("رمز الرابط مطلوب");
  var sheet = _ensureClientLinksSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '') === token) {
        sheet.getRange(i + 2, 6).setValue(false);
        return { success: true, message: '✅ أُلغي الرابط' };
      }
    }
  }
  throw new Error("الرابط غير موجود");
}

// يبني صفحة العميل (HTML كامل خفيف RTL) من رمز الرابط — قراءة فقط، بلا جلسة
// يدعم رابطاً عاماً لكل الرحلة أو رابطاً مخصصاً لعميل واحد فقط (clientFilter بالشيت)
function _renderClientTripView_(token) {
  var esc = function(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var page = function(title, bodyHtml) {
    var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>' + esc(title) + '</title><style>' +
      // padding-bottom يحجز مساحة للفوتر المثبَّت أسفل الشاشة حتى لا يُغطّي آخر صف بالجدول
      'html,body{margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Tahoma,Arial,sans-serif;}' +
      'body{padding-bottom:44px;}' +
      '.hd{background:#1e3d59;color:#fff;padding:14px 16px;text-align:center;}' +
      '.hd h2{margin:0;font-size:18px;} .hd .sub{color:#cbd5e1;font-size:12px;margin-top:4px;}' +
      // ملء عرض الشاشة (بدل عرض ثابت 680px) — الجدول يستخدم كل المساحة المتاحة، والفائض يُمرَّر أفقياً بدل النزول لسطر
      '.wrap{max-width:1400px;margin:14px auto;padding:0 12px;}' +
      '.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.05);padding:12px 14px;margin-bottom:12px;}' +
      '.tbl-scroll{overflow-x:auto;}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;table-layout:auto;}' +
      'th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:center;white-space:nowrap;}' +
      'th{background:#1e3d59;color:#fff;} tr:nth-child(even) td{background:#f8fafc;}' +
      '.lbl{background:#f1f5f9;font-weight:bold;width:120px;white-space:nowrap;} .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:bold;}' +
      '.b-ok{background:#d1fae5;color:#065f46;} .b-wait{background:#fef3c7;color:#92400e;}' +
      // فوتر ثابت أسفل الشاشة دائماً — لا يظهر في آخر الجدول بعد التمرير
      '.ft{position:fixed;left:0;right:0;bottom:0;text-align:center;color:#94a3b8;font-size:10.5px;padding:8px 6px;background:#1e3d59;box-shadow:0 -2px 10px rgba(0,0,0,.15);}' +
      '</style></head><body>' + bodyHtml +
      '<div class="ft">© جميع الحقوق محفوظة — Smart Software Solutions • للتواصل: 01002864926</div>' +
      '</body></html>';
    return HtmlService.createHtmlOutput(html).setTitle(title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  };
  var invalidPage = function() {
    return page('رابط غير صالح', '<div class="hd"><h2>⚠️ رابط غير صالح</h2></div><div class="wrap"><div class="card">هذا الرابط غير صحيح أو أُلغي — تواصل مع المكتب.</div></div>');
  };

  token = String(token || '').trim();
  if (!token || token.length < 16) return invalidPage();

  // إيجاد الرابط في شيت ClientLinks (يجب أن يكون نشطاً)
  var lSheet = _ensureClientLinksSheet_();
  var lLast = lSheet.getLastRow();
  var tripName = '', clientFilter = '';
  if (lLast >= 2) {
    var lData = lSheet.getRange(2, 1, lLast - 1, lSheet.getLastColumn()).getValues();
    for (var li = 0; li < lData.length; li++) {
      if (String(lData[li][0] || '') !== token) continue;
      var isActive = lData[li][5] === true || String(lData[li][5]).toLowerCase() === 'true';
      if (!isActive) return invalidPage();
      tripName = String(lData[li][1] || '').trim();
      clientFilter = String(lData[li][2] || '').trim();
      break;
    }
  }
  if (!tripName) return invalidPage();

  // بيانات الرحلة
  var tSheet = _getTripsSheet_();
  var tLast = tSheet.getLastRow();
  var tC = _robustColMap_(tSheet, TRIPS_HEADERS_);
  var T = _cellReader_(tC, TRIPS_COL_);
  var trip = null;
  if (tLast >= 2) {
    var tData = tSheet.getRange(2, 1, tLast - 1, tSheet.getLastColumn()).getValues();
    for (var ti = 0; ti < tData.length; ti++) {
      if (String(T(tData[ti], 'name') || '').trim() === tripName) { trip = tData[ti]; break; }
    }
  }
  if (!trip) return invalidPage();

  var depart = _tripFormatDate_(T(trip, 'departDate'));
  var ret = _tripFormatDate_(T(trip, 'returnDate'));
  var tripMadinah = String(T(trip, 'madinahHotel') || '').trim();
  var tripMakkah = String(T(trip, 'makkahHotel') || '').trim();

  // كشف المعتمرين: الاسم + النوع + الملاحظات + فندق المدينة/مكة لكل معتمر + طبيعة التسكين
  // بلا جوازات وبلا أي علاقة بحالة الإشعار — هذه صفحة كشف أسماء وتسكين فقط، يرجع لها العميل أول بأول
  // clientFilter فارغ = كل معتمري الرحلة؛ وإلا فقط معتمرو هذا العميل
  var pSheet = _getPilgrimsSheet_();
  var pC = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(pC, PILGRIMS_COL_);
  var pLast = pSheet.getLastRow();
  var rowsHtml = '', n = 0;
  if (pLast >= 2) {
    var pData = pSheet.getRange(2, 1, pLast - 1, pSheet.getLastColumn()).getValues();
    for (var pi = 0; pi < pData.length; pi++) {
      if (String(P(pData[pi], 'tripName') || '').trim() !== tripName) continue;
      if (clientFilter && String(P(pData[pi], 'client') || '').trim() !== clientFilter) continue;
      n++;
      // فندق المدينة/مكة الخاص بالمعتمر، وعند غيابه يُستخدم فندق الرحلة الرئيسي لتلك المدينة
      var pMadinah = String(P(pData[pi], 'hotelMadinah') || '').trim() || tripMadinah;
      var pMakkah = String(P(pData[pi], 'hotelMakkah') || '').trim() || tripMakkah;
      var pHousing = [pMadinah, pMakkah].filter(function(h) { return h && h !== '-'; }).join(' / ') || '-';
      rowsHtml += '<tr><td>' + n + '</td><td style="text-align:right;">' + esc(P(pData[pi], 'name')) + '</td>' +
        '<td>' + esc(P(pData[pi], 'type') || '') + '</td>' +
        '<td style="text-align:right;">' + esc(P(pData[pi], 'notes') || '-') + '</td>' +
        '<td>' + esc(pHousing) + '</td>' +
        '<td>' + esc(P(pData[pi], 'accommodation') || '-') + '</td></tr>';
    }
  }
  if (!rowsHtml) rowsHtml = '<tr><td colspan="6">لم يُسجَّل معتمرون بعد</td></tr>';

  var clientLine = clientFilter
    ? '<div class="sub">كشف معتمري: <b>' + esc(clientFilter) + '</b> — عرض للقراءة فقط</div>'
    : '<div class="sub">كشف كل المعتمرين — عرض للقراءة فقط</div>';

  var body =
    '<div class="hd"><h2>🕋 ' + esc(tripName) + '</h2>' + clientLine + '</div>' +
    '<div class="wrap">' +
    '<div class="card"><table><tbody>' +
    '<tr><td class="lbl">تاريخ الذهاب</td><td>' + esc(depart || '-') + '</td><td class="lbl">تاريخ العودة</td><td>' + esc(ret || '-') + '</td></tr>' +
    '</tbody></table></div>' +
    '<div class="card"><div class="tbl-scroll"><table><thead><tr><th>م</th><th>الاسم</th><th>النوع</th><th>الملاحظات</th><th>فندق المدينة / مكة</th><th>طبيعة التسكين</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
    '<div style="color:#64748b;font-size:11.5px;margin-top:6px;">الإجمالي: ' + n + ' معتمر</div></div>' +
    '</div>';
  return page(tripName + ' — كشف المعتمرين', body);
}

/* ============================================================
   📊 بيانات لوحة الإحصائيات: معتمرون شهرياً + توزيعات (عميل/وكيل/شركة)
   + أكثر الفنادق + أعداد الرحلات + الخط الزمني (قادمة/جارية)
   ============================================================ */
function getStatsData(authToken) {
  // admin أو صاحب صلاحية «لوحة الإحصائيات» المخصّصة من شاشة المستخدمين
  var _statsSession = requireAuth_(authToken);
  if (!_isFullAdminSession_(_statsSession) && !_sessionHasPerm_(_statsSession, 'stats.view')) {
    throw new Error('لا تملك صلاحية شاشة الإحصائيات');
  }

  var toDate = function(v) {
    if (v instanceof Date) return v;
    var m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  };
  var ymKey = function(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); };
  var bump = function(obj, key, inc) { if (!key) key = '(غير محدد)'; obj[key] = (obj[key] || 0) + (inc === undefined ? 1 : inc); };
  var topN = function(obj, nn) {
    return Object.keys(obj).map(function(k) { return [k, obj[k]]; })
      .filter(function(p) { return p[1] > 0; })
      .sort(function(a, b) { return b[1] - a[1]; }).slice(0, nn || 12);
  };

  // ===== 1) الرحلات: الخريطة الأساسية (تواريخ/شركة/وكيل/فنادق) + الشهور + الخط الزمني =====
  var tripsMap = {};           // اسم الرحلة → {dep, company, agent}
  var tripsMonthly = {}, hotels = {};
  var upcoming = [], ongoing = [];
  var totalTrips = 0, endedTrips = 0;
  var today = new Date(); today.setHours(0, 0, 0, 0);

  // عدد معتمري كل رحلة من شيت الكشوف (يُقرأ أولاً لاستخدامه في الخط الزمني)
  var countByTrip = {};
  var pSheet = _getPilgrimsSheet_();
  var pRows = [];
  if (pSheet && pSheet.getLastRow() >= 2) {
    var pC = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var Pr = _cellReader_(pC, PILGRIMS_COL_);
    pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues()
      .map(function(r) {
        var clientVal = String(Pr(r, 'client') || '').trim();
        return {
          name: String(Pr(r, 'name') || '').trim(),
          tripName: String(Pr(r, 'tripName') || '').trim(),
          client: clientVal,
          type: String(Pr(r, 'type') || '').trim(),
          // 🧑‍✈️ صفوف المشرف تُدرَج ضمن كشف المعتمرين بعمود عميل يبدأ بـ"المشرف" (مثال: "المشرف"
          // أو "المشرف (استقبال)") — يُستبعدون من كل إحصائيات "عدد المعتمرين" لأنهم ليسوا معتمرين
          isSupervisor: clientVal.indexOf('المشرف') === 0,
          hotelMadinah: String(Pr(r, 'hotelMadinah') || '').trim(),
          hotelMakkah: String(Pr(r, 'hotelMakkah') || '').trim(),
          roomNo: String(Pr(r, 'roomNo') || '').trim(),
          roomNoMadinah: String(Pr(r, 'roomNoMadinah') || '').trim(),
          roomNoMakkah: String(Pr(r, 'roomNoMakkah') || '').trim(),
          accommodation: String(Pr(r, 'accommodation') || '').trim(),
          // 🏙️ (V4.47) إحصائية عامة: مستبعد من أي مدينة = يُحتسَب مستبعداً هنا (الشاشة الحيّة تفرّق بينهما)
          housingExcluded: String(Pr(r, 'housingExcluded') || '') === '1' ||
            String(Pr(r, 'housingExcludedMadinah') || '') === '1' || String(Pr(r, 'housingExcludedMakkah') || '') === '1'
        };
      })
      .filter(function(p) { return p.name; });
    // 🎯 المشرف مُستبعَد من عدّ الرحلة أيضاً — نفس استبعاده من الإجمالي العام، لضمان أن مجموع
    // أعداد المعتمرين بكل الرحلات = الرقم الإجمالي المعروض بأعلى الشاشة دائماً (كانا يتعارضان سابقاً)
    pRows.forEach(function(p) { if (p.tripName && !p.isSupervisor) countByTrip[p.tripName] = (countByTrip[p.tripName] || 0) + 1; });
  }

  var linkedBookingIds = {}; // 🔗 (V4.16) معرّفات الإشعارات المرتبطة بأي رحلة فعلياً (حتى لو اختلف الاسم)
  var tSheet = _getTripsSheet_();
  if (tSheet && tSheet.getLastRow() >= 2) {
    var tC = _robustColMap_(tSheet, TRIPS_HEADERS_);
    var T = _cellReader_(tC, TRIPS_COL_);
    tSheet.getRange(2, 1, tSheet.getLastRow() - 1, tSheet.getLastColumn()).getValues().forEach(function(r) {
      var name = String(T(r, 'name') || '').trim();
      if (!name) return;
      totalTrips++;
      var dep = toDate(T(r, 'departDate'));
      var retD = toDate(T(r, 'returnDate'));
      // الفنادق الإضافية (JSON) لكل مدينة
      var parseExtras = function(k) {
        try {
          return (JSON.parse(String(T(r, k) || '[]')) || [])
            .map(function(h) { return String(h && h.name || h || '').trim(); })
            .filter(Boolean);
        } catch (e) { return []; }
      };
      var madExtras = parseExtras('madinahExtra'), makExtras = parseExtras('makkahExtra');
      var _bsv = T(r, 'bookedSeats');
      // 🔗 (V4.16) إشعار الوصول المرتبط بهذه الرحلة — يُستبعد من مسار «إشعارات غير مرتبطة» أدناه
      // حتى لو اختلف اسمه الحالي عن bookingData.tripName المخزَّن بصف الإشعار (رحلة أُعيدت تسميتها)
      var _lbid = String(T(r, 'linkedBookingId') || '').trim();
      if (_lbid) linkedBookingIds[_lbid] = true;
      tripsMap[name] = {
        seats: (_bsv === '' || _bsv === null || _bsv === undefined) ? null : Number(_bsv),
        dep: dep,
        company: String(T(r, 'company') || '').trim(),
        agent: String(T(r, 'agent') || '').trim(),
        madMain: String(T(r, 'madinahHotel') || '').trim(),
        makMain: String(T(r, 'makkahHotel') || '').trim(),
        madExtras: madExtras, makExtras: makExtras,
        madIn: _tripFormatDate_(T(r, 'madinahCheckIn')), madOut: _tripFormatDate_(T(r, 'madinahCheckOut')),
        makIn: _tripFormatDate_(T(r, 'makkahCheckIn')), makOut: _tripFormatDate_(T(r, 'makkahCheckOut'))
      };
      if (dep) bump(tripsMonthly, ymKey(dep), 1);
      // الفنادق: سكن المدينة + سكن مكة + الفنادق الإضافية
      [tripsMap[name].madMain, tripsMap[name].makMain].concat(madExtras).concat(makExtras).forEach(function(h) {
        if (h && h !== '-') bump(hotels, h, 1);
      });
      // الخط الزمني: قادمة (لم تسافر) / جارية (سافرت ولم تعد)
      var item = {
        name: name,
        depart: dep ? _tripFormatDate_(dep) : '',
        ret: retD ? _tripFormatDate_(retD) : '',
        // 🎯 العدد المعروض هنا = المعتمرون الفعليون المسجَّلون بالكشف فقط (لا "أماكن محجوزة" مستهدَفة
        // من bookedSeats — قد تكون رقماً تسويقياً لم يُسجَّل بعد أحد بمقابله في الكشف الفعلي)
        count: countByTrip[name] || 0
      };
      if (dep && dep.getTime() > today.getTime()) {
        item.daysTo = Math.round((dep.getTime() - today.getTime()) / 86400000);
        upcoming.push(item);
      } else if (dep && retD && retD.getTime() >= today.getTime()) {
        item.daysLeft = Math.round((retD.getTime() - today.getTime()) / 86400000);
        var span = Math.max(1, Math.round((retD.getTime() - dep.getTime()) / 86400000));
        item.progress = Math.min(100, Math.round(((today.getTime() - dep.getTime()) / 86400000) / span * 100));
        ongoing.push(item);
      } else {
        endedTrips++; // منتهية (عودتها قبل اليوم) أو بلا تواريخ صالحة للتصنيف
      }
    });
  }
  upcoming.sort(function(a, b) { return a.daysTo - b.daysTo; });
  ongoing.sort(function(a, b) { return a.daysLeft - b.daysLeft; });

  // ===== 2) المعتمرون: من كشوف الرحلات الفعلية (المصدر الحقيقي للأعداد) =====
  // الشهر = شهر سفر رحلة المعتمر، والعميل من صف المعتمر نفسه،
  // والشركة/الوكيل من رحلته — أدق بكثير من «العدد» المكتوب بالإشعار
  var monthly = {}, byClient = {}, byAgent = {}, byCompany = {};
  var totalPilgrims = 0, totalChildren = 0, totalInfants = 0, totalSupervisors = 0;
  pRows.forEach(function(p) {
    // 🎯 القاعدة المعتمَدة (طلب صريح): الإحصائيات كلها من كشوف الرحلات المرتبطة برحلة موجودة
    // فعلاً فقط — صفوف السجل العام "بدون رحلة" (أو المرتبطة برحلة محذوفة/مُعاد تسميتها يدوياً)
    // خارج كل الأرقام تماماً. النتيجة المضمونة رياضياً: الإجمالي = مجموع أعداد كل رحلة =
    // مجموع توزيع الشركات المصرية = مجموع توزيع الوكلاء، بلا أي فجوة غامضة بينها
    var tr = tripsMap[p.tripName];
    if (!tr) return;
    if (p.isSupervisor) { totalSupervisors++; return; } // 🧑‍✈️ المشرف يُحصى منفصلاً — ليس معتمراً
    totalPilgrims++; // 🕋 إجمالي المعتمرين الفعليين بكشوف الرحلات (بالغون + أطفال + رضّع)
    if (p.type === 'طفل') totalChildren++;
    else if (p.type === 'رضيع') totalInfants++;
    bump(byClient, p.client);
    if (tr.dep) bump(monthly, ymKey(tr.dep), 1);
    bump(byCompany, tr.company);
    bump(byAgent, tr.agent);
  });

  // 📨 (V4.00 — طلب صريح) الإشعارات غير المرتبطة بأي رحلة موجودة تدخل الأعداد أيضاً:
  // عددها المسجَّل «العدد» يُضاف لإجمالي المعتمرين ولتوزيعات العميل/الشركة/الوكيل والشهور
  // (شهر الوصول). الإشعارات المرتبطة برحلة موجودة لا تُلمس — معتمروها محسوبون من الكشف أعلاه،
  // فلا يحدث أي احتساب مزدوج. التطابق محفوظ: الإجمالي = مجموع كل توزيع كما كان.
  var unlinkedNoticePax = 0;
  try {
    getAllBookings().forEach(function(b) {
      var tn = String(b.tripName || '').trim();
      // 🔗 (V4.16) مرتبط برحلة موجودة — بالاسم (المسار المعتاد) أو بمعرّف الإشعار (لو أُعيدت تسمية
      // الرحلة بعد الربط فاختلف اسمها الحالي عن الاسم المخزَّن بصف الإشعار وقت الإنشاء)
      if ((tn && tripsMap[tn]) || linkedBookingIds[String(b.id || '').trim()]) return; // خارج هذا المسار
      var c = parseInt(b.count) || 0;
      if (c <= 0) return;
      unlinkedNoticePax += c;
      totalPilgrims += c;
      bump(byClient, String(b.client || '').trim(), c);
      bump(byCompany, String(b.company || '').trim(), c);
      bump(byAgent, String(b.agent || '').trim(), c);
      var am = String(b.arrivalDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (am) bump(monthly, ymKey(new Date(+am[3], +am[2] - 1, +am[1])), c);
    });
  } catch (eUb) { Logger.log('unlinked bookings stats error: ' + eUb); }

  // 🛏️ (V4.12) فرصة البيع — الأسرّة الفارغة بالرحلات التي لم تسافر بعد فقط (القادمة):
  // الرحلة التي سافرت فعلاً خارج الحساب تماماً (لا يمكن بيعها)، والفرصة بكل رحلة قادمة
  // مسقوفة بمقاعد الطيران المتاحة (الأماكن المحجوزة − شاغلي المقاعد الفعليين بالكشف) —
  // فمن ليس له مكان بالطيران لا يمكن تسويقه حتى لو السرير فارغ.
  // قواعد الأسرّة نفسها: شاغل السرير بالغ أو طفل بطبيعة تسكين، النقص لا يُنزِّل النوع،
  // والزيادة تُرقّيه (5 في رباعي = خماسي بلا نقص)، والمستبعد من التسكين لا يدخل الحساب
  var _activeTripSet = {};
  upcoming.forEach(function(i) { _activeTripSet[i.name] = 1; });
  var _CAPS_ = { 'سنجل': 1, 'دابل': 2, 'ثلاثي': 3, 'رباعي': 4, 'رباعي أسرة': 4, 'خماسي': 5, 'خماسي أسرة': 5, 'سداسي': 6 };
  var _roomsAgg = {};
  var _seatTaken = {}; // شاغلو مقاعد الطيران بكل رحلة قادمة: كل الأنواع عدا الرضيع، والمشرف «مرافق» فقط
  pRows.forEach(function(p) {
    if (!_activeTripSet[p.tripName]) return;
    if (p.type !== 'رضيع' && !(p.isSupervisor && (p.client.indexOf('استقبال') > -1 || p.client.indexOf('الوكيل') > -1))) {
      _seatTaken[p.tripName] = (_seatTaken[p.tripName] || 0) + 1;
    }
    if (p.housingExcluded || p.isSupervisor) return;
    var isBed = (p.type === 'ذكر' || p.type === 'أنثى') || (p.type === 'طفل' && p.accommodation);
    if (!isBed) return;
    // غرفة كل مدينة تُحصى على حدة (المعتمر يشغل سريراً في المدينتين بليالٍ مختلفة)
    [['M', p.roomNoMadinah || p.roomNo], ['K', p.roomNoMakkah || '']].forEach(function(pair) {
      var rn = String(pair[1] || '').trim();
      if (!rn) return;
      var k = p.tripName + '|' + pair[0] + '|' + rn;
      var e = (_roomsAgg[k] = _roomsAgg[k] || { n: 0, acc: {}, trip: p.tripName, city: pair[0] });
      e.n++;
      if (p.accommodation) bump(e.acc, p.accommodation);
    });
  });
  // أسرّة فارغة لكل رحلة = الأعلى بين فراغ غرف المدينة وفراغ غرف مكة (نفس السرير يُحسب مرة)
  var _emptyByTripCity = {};
  Object.keys(_roomsAgg).forEach(function(k) {
    var e = _roomsAgg[k];
    var domPair = topN(e.acc, 1)[0];
    var t = domPair ? domPair[0] : (e.n === 1 ? 'سنجل' : 'رباعي');
    var cap = _CAPS_[t] || 4;
    if (e.n >= cap) return;
    var byCity = (_emptyByTripCity[e.trip] = _emptyByTripCity[e.trip] || { M: 0, K: 0 });
    byCity[e.city] += (cap - e.n);
  });
  var emptyBeds = 0;
  Object.keys(_emptyByTripCity).forEach(function(tn) {
    var bc = _emptyByTripCity[tn];
    var beds = Math.max(bc.M, bc.K);
    var tr = tripsMap[tn];
    // سقف مقاعد الطيران: يُطبَّق فقط لو للرحلة عدد أماكن محجوزة مسجَّل
    if (tr && tr.seats !== null && !isNaN(tr.seats)) {
      beds = Math.min(beds, Math.max(0, tr.seats - (_seatTaken[tn] || 0)));
    }
    emptyBeds += beds;
  });

  // ℹ️ تاريخ القاعدة: V3.83 حصرت الأرقام في كشوف الرحلات فقط، ثم V4.00 (بطلب صريح) أعادت
  // إدخال الإشعارات «غير المرتبطة برحلة» تحديداً بعددها المسجَّل (المسار أعلاه) — بلا أي
  // احتساب مزدوج لأن الإشعارات المرتبطة برحلة موجودة تُستبعد منه وتُحسب من كشوفها.

  // ===== 2-ب) تفاصيل الفنادق: لكل فندق — عدد رحلاته + إجمالي غرفه + تفصيلة كل رحلة =====
  // غرف الرحلة على الفندق = أرقام الغرف المميزة لمعتمري الرحلة المسكّنين به
  var hotelAgg = {}; // فندق → { اسم الرحلة → {city, rooms:{}} }
  var hAdd = function(hotel, tripName, city, roomNo) {
    hotel = String(hotel || '').trim();
    if (!hotel || hotel === '-' || !tripName) return;
    var byTrip = (hotelAgg[hotel] = hotelAgg[hotel] || {});
    var e = (byTrip[tripName] = byTrip[tripName] || { city: city, rooms: {} });
    var rn = String(roomNo || '').trim();
    if (rn) e.rooms[rn] = 1;
  };
  // من كشوف المعتمرين: فندق المعتمر الفعلي (أو الفندق الرئيسي للمدينة عند غيابه)
  // 🎯 النسبة الدقيقة للغرف: أرقام الغرف المولَّدة من شاشة التسكين تحمل اسم الفندق صراحةً بصيغة
  // "(اسم الفندق) غرفة N" — نعتمدها كمصدر الحقيقة فتُنسَب الغرفة لفندقها المذكور حصراً. النمط القديم
  // (نسبة نفس رقم الغرفة لفندقَي المدينة ومكة معاً) كان يضخّم فندقاً ويُصفّر آخر لأن عمود رقم الغرفة
  // واحد بينما التسكين مدينتان — الأرقام بلا بادئة فندق (بيانات يدوية قديمة) تبقى على السلوك السابق
  // 🏨 غرفة كل مدينة من عمودها المخصص أولاً (رقم غرفة المدينة/مكة — الحل الجذري لعمود الغرفة
  // الواحد الذي كان يجعل آخر تسكين مُطبَّق يمحو غرف المدينة الأخرى فتظهر فنادقها "0 غرفة").
  // البيانات الأقدم (قبل العمودين): fallback على العمود الظاهر — البادئة "(فندق)" تُنسب لفندقها
  // حصراً، وبلا بادئة تُقبل للمدينتين (السلوك القديم)
  var _legacyCityRoom = function(rn, hotel) {
    rn = String(rn || '').trim();
    if (!rn) return '';
    var pm = rn.match(/^\((.+?)\)\s*/);
    if (!pm) return rn;
    return pm[1].trim() === String(hotel || '').trim() ? rn : '';
  };
  pRows.forEach(function(p) {
    var tr = tripsMap[p.tripName];
    if (!tr) return;
    var madHotel = p.hotelMadinah || tr.madMain;
    var makHotel = p.hotelMakkah || tr.makMain;
    hAdd(madHotel, p.tripName, 'madinah', p.roomNoMadinah || _legacyCityRoom(p.roomNo, madHotel));
    hAdd(makHotel, p.tripName, 'makkah', p.roomNoMakkah || _legacyCityRoom(p.roomNo, makHotel));
  });
  // رحلات بلا كشوف بعد: تُسجَّل فنادقها بصفر غرف حتى تظهر في التفصيلة
  Object.keys(tripsMap).forEach(function(tn) {
    var tr = tripsMap[tn];
    [tr.madMain].concat(tr.madExtras).forEach(function(h) { if (h) hAdd(h, tn, 'madinah', ''); });
    [tr.makMain].concat(tr.makExtras).forEach(function(h) { if (h) hAdd(h, tn, 'makkah', ''); });
  });
  var hotelStats = Object.keys(hotelAgg).map(function(h) {
    var byTrip = hotelAgg[h];
    var detail = Object.keys(byTrip).map(function(tn) {
      var e = byTrip[tn];
      var tr = tripsMap[tn] || {};
      return {
        trip: tn,
        city: e.city === 'makkah' ? 'مكة' : 'المدينة',
        checkIn: e.city === 'makkah' ? (tr.makIn || '') : (tr.madIn || ''),
        checkOut: e.city === 'makkah' ? (tr.makOut || '') : (tr.madOut || ''),
        rooms: Object.keys(e.rooms).length
      };
    });
    return {
      name: h,
      trips: detail.length,
      rooms: detail.reduce(function(s, d) { return s + d.rooms; }, 0),
      detail: detail
    };
  }).sort(function(a, b) { return b.trips - a.trips || b.rooms - a.rooms; }).slice(0, 15);

  // ===== 3) الشهور: فقط التي بها بيانات فعلية (ماضية أو مستقبلية) — بلا أي نافذة زمنية =====
  var monthSet = {};
  Object.keys(monthly).forEach(function(k) { monthSet[k] = 1; });
  Object.keys(tripsMonthly).forEach(function(k) { monthSet[k] = 1; });
  var months = Object.keys(monthSet).sort().map(function(k) {
    return { ym: k, pilgrims: monthly[k] || 0, trips: tripsMonthly[k] || 0 };
  });

  // 👤 عدد العملاء وفق القاعدة الموحّدة نفسها: عميل يُحتسب فقط إذا كان له معتمرون مسجَّلون
  // بكشوف رحلات مرتبطة برحلة موجودة فعلاً (byClient كله خلف حارس tripsMap أعلاه) — صفوف
  // السجل العام "بدون رحلة" لا تُدخِل أي عميل في هذا العدد، و"(غير محدد)" ليس عميلاً مسجَّلاً
  var activeClients = Object.keys(byClient).filter(function(k) {
    return k && k !== '(غير محدد)' && byClient[k] > 0;
  }).length;

  return {
    months: months,
    // 👤 (V3.86) القوائم كاملة (لا أعلى-12 فقط): مجموع توزيع العملاء/الشركات/الوكلاء المعروض
    // بالدونات = إجمالي المعتمرين تماماً — كان الاقتطاع عند 12 يُسقط الباقي فيختل التطابق البصري
    byClient: topN(byClient, 10000),
    byAgent: topN(byAgent, 10000),
    byCompany: topN(byCompany, 10000),
    topHotels: topN(hotels, 12),
    hotelStats: hotelStats,
    upcoming: upcoming.slice(0, 20),
    ongoing: ongoing.slice(0, 20),
    totals: {
      totalPilgrims: totalPilgrims,
      totalChildren: totalChildren,
      totalInfants: totalInfants,
      totalSupervisors: totalSupervisors,
      totalTrips: totalTrips,
      // 🧩 بيانات شريط KPI بالتصميم الجديد
      openTrips: upcoming.length,
      ongoingTrips: ongoing.length,
      endedTrips: endedTrips,
      ongoingPilgrims: ongoing.reduce(function(s, i) { return s + (i.count || 0); }, 0),
      upcomingPilgrims: upcoming.reduce(function(s, i) { return s + (i.count || 0); }, 0),
      nearestReturnDays: ongoing.length ? ongoing[0].daysLeft : null,
      nearestDepartDays: upcoming.length ? upcoming[0].daysTo : null,
      emptyBeds: emptyBeds,
      activeClients: activeClients
    }
  };
}


/* ============================================================
   💡 (V4.13) مستشار توفير التسكين بين الرحلات:
   غرفة بها سرير فارغ (رجال أو سيدات) برحلة + معتمر بنفس الجنس برحلة أخرى
   (خارج التسكين أو ساكن بمفرده) — نفس الفندق والمدينة وفترة متداخلة
   ← اقتراح جمعهما بغرفة مشتركة بين الرحلتين لاستغلال الفراغات
   ============================================================ */
function getHousingShareSuggestions(authToken) {
  requireAuth_(authToken);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var parseD = function(s) {
    var m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : null;
  };

  // 1) الرحلات النشطة (لم تنته عودتها) وفترات إقامة كل مدينة
  var trips = {};
  var tSheet = _getTripsSheet_();
  if (tSheet && tSheet.getLastRow() >= 2) {
    var tC = _robustColMap_(tSheet, TRIPS_HEADERS_);
    var T = _cellReader_(tC, TRIPS_COL_);
    tSheet.getRange(2, 1, tSheet.getLastRow() - 1, tSheet.getLastColumn()).getValues().forEach(function(r) {
      var name = String(T(r, 'name') || '').trim();
      if (!name) return;
      var ret = parseD(_tripFormatDate_(T(r, 'returnDate')));
      if (!ret || ret < today.getTime()) return; // الرحلات المنتهية خارج الاقتراح
      trips[name] = {
        madHotel: String(T(r, 'madinahHotel') || '').trim(),
        makHotel: String(T(r, 'makkahHotel') || '').trim(),
        M: { inD: parseD(_tripFormatDate_(T(r, 'madinahCheckIn'))), outD: parseD(_tripFormatDate_(T(r, 'madinahCheckOut'))),
             inS: _tripFormatDate_(T(r, 'madinahCheckIn')), outS: _tripFormatDate_(T(r, 'madinahCheckOut')) },
        K: { inD: parseD(_tripFormatDate_(T(r, 'makkahCheckIn'))), outD: parseD(_tripFormatDate_(T(r, 'makkahCheckOut'))),
             inS: _tripFormatDate_(T(r, 'makkahCheckIn')), outS: _tripFormatDate_(T(r, 'makkahCheckOut')) }
      };
    });
  }
  if (!Object.keys(trips).length) return { success: true, suggestions: [], tripsScanned: 0 };

  // 2) كشوف المعتمرين: غرف كل (رحلة × مدينة) + المرشّحون (خارج التسكين)
  var _CAPS_ = { 'سنجل': 1, 'دابل': 2, 'ثلاثي': 3, 'رباعي': 4, 'رباعي أسرة': 4, 'خماسي': 5, 'خماسي أسرة': 5, 'سداسي': 6 };
  var rooms = {}, loose = [];
  var pSheet = _getPilgrimsSheet_();
  if (pSheet && pSheet.getLastRow() >= 2) {
    var pC = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
    var P = _cellReader_(pC, PILGRIMS_COL_);
    pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
      var tn = String(P(r, 'tripName') || '').trim();
      var tr = trips[tn];
      if (!tr) return;
      var name = String(P(r, 'name') || '').trim();
      if (!name) return;
      // 🏙️ (V4.47) الاستبعاد منفصل لكل مدينة الآن — كان الاستبعاد بمكة يُخفي المعتمر من اقتراحات المدينة أيضاً والعكس
      var housingExclM = String(P(r, 'housingExcluded') || '') === '1' || String(P(r, 'housingExcludedMadinah') || '') === '1';
      var housingExclK = String(P(r, 'housingExcluded') || '') === '1' || String(P(r, 'housingExcludedMakkah') || '') === '1';
      var type = String(P(r, 'type') || '').trim();
      var gender = type === 'ذكر' ? 'M' : (type === 'أنثى' ? 'F' : '');
      if (!gender) return; // الأطفال والرضع خارج اقتراح الدمج (يتبعون ذويهم)
      var acc = String(P(r, 'accommodation') || '').trim();
      [
        { city: 'M', hotel: String(P(r, 'hotelMadinah') || '').trim() || tr.madHotel,
          roomNo: String(P(r, 'roomNoMadinah') || '').trim() || String(P(r, 'roomNo') || '').trim(), excluded: housingExclM },
        { city: 'K', hotel: String(P(r, 'hotelMakkah') || '').trim() || tr.makHotel,
          roomNo: String(P(r, 'roomNoMakkah') || '').trim(), excluded: housingExclK }
      ].forEach(function(c) {
        if (c.excluded) return;
        if (!c.hotel || !tr[c.city].inD || !tr[c.city].outD) return;
        if (!c.roomNo) {
          loose.push({ trip: tn, city: c.city, hotel: c.hotel, name: name, gender: gender, status: 'خارج التسكين' });
          return;
        }
        var k = tn + '|' + c.city + '|' + c.roomNo;
        var e = (rooms[k] = rooms[k] || { trip: tn, city: c.city, hotel: c.hotel, roomNo: c.roomNo, n: 0, acc: {}, genders: {}, names: [] });
        e.n++;
        e.names.push(name);
        e.genders[gender] = 1;
        if (acc) e.acc[acc] = (e.acc[acc] || 0) + 1;
      });
    });
  }

  // 3) الغرف العارضة (أسرّة فارغة بجنس موحّد) + السكان المنفردون كمرشّحين أيضًا
  var offers = [];
  Object.keys(rooms).forEach(function(k) {
    var e = rooms[k];
    var gKeys = Object.keys(e.genders);
    if (gKeys.length !== 1) return; // غرفة مختلطة (عائلية) — لا تدخل الدمج
    var dom = '', domN = 0;
    Object.keys(e.acc).forEach(function(a) { if (e.acc[a] > domN) { domN = e.acc[a]; dom = a; } });
    var typ = dom || (e.n === 1 ? 'سنجل' : 'رباعي');
    var cap = _CAPS_[typ] || 4;
    var empty = cap - e.n;
    if (empty > 0) {
      offers.push({ trip: e.trip, city: e.city, hotel: e.hotel, roomNo: e.roomNo, type: typ,
        empty: empty, gender: gKeys[0], occupants: e.names.slice(0, 6), n: e.n });
    }
    if (e.n === 1 && cap > 1) {
      // الساكن بمفرده مرشّح للانضمام لغرفة رحلة أخرى (توفير غرفته بالكامل)
      loose.push({ trip: e.trip, city: e.city, hotel: e.hotel, name: e.names[0], gender: gKeys[0],
        status: 'ساكن بمفرده بغرفة ' + e.roomNo + ' (' + typ + ')' });
    }
  });

  // 4) المطابقة: نفس المدينة والفندق والجنس + رحلتان مختلفتان + فترة متداخلة
  var overlap = function(a, b) {
    if (!a.inD || !a.outD || !b.inD || !b.outD) return null;
    var s = Math.max(a.inD, b.inD), e = Math.min(a.outD, b.outD);
    if (s >= e) return null;
    var fmt = function(ms) { var d = new Date(ms); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); };
    return { from: fmt(s), to: fmt(e), exact: a.inD === b.inD && a.outD === b.outD };
  };
  var suggestions = [];
  offers.forEach(function(o) {
    var oPer = trips[o.trip][o.city];
    var cands = [];
    loose.forEach(function(c) {
      if (c.trip === o.trip || c.city !== o.city || c.hotel !== o.hotel || c.gender !== o.gender) return;
      var ov = overlap(oPer, trips[c.trip][c.city]);
      if (!ov) return;
      cands.push({ trip: c.trip, name: c.name, status: c.status, overlap: ov });
    });
    if (!cands.length) return;
    suggestions.push({
      hotel: o.hotel,
      city: o.city === 'M' ? 'المدينة' : 'مكة',
      trip: o.trip, roomNo: o.roomNo, type: o.type, empty: o.empty, n: o.n,
      gender: o.gender === 'M' ? 'رجال' : 'سيدات',
      occupants: o.occupants,
      period: { from: oPer.inS, to: oPer.outS },
      candidates: cands.slice(0, 8)
    });
  });
  // الترتيب: الفنادق الأكثر فرصًا أولًا ثم الأسرّة الأكثر فراغًا — وسقف 60 اقتراحًا
  suggestions.sort(function(a, b) { return b.candidates.length - a.candidates.length || b.empty - a.empty; });
  return { success: true, suggestions: suggestions.slice(0, 60), tripsScanned: Object.keys(trips).length };
}

/* ============================================================
   🛂 استخلاص بيانات المعتمر من صورة جواز السفر (عبر Gemini)
   يُستخدم من شاشة الرحلات لتعبئة كشف المعتمرين من صور الجوازات
   (صورة واحدة أو دفعة صور تُرسل من الواجهة تسلسلياً)
   ============================================================ */
function extractPassportData(authToken, base64Image, mimeType) {
  requireAuth_(authToken);

  var GKEYS = _geminiKeys_();
  if (!GKEYS.length) {
    return { success: false, error: "مفتاح Gemini غير مُعدّ — أضفه من شاشة الإعدادات" };
  }
  if (!base64Image) return { success: false, error: "لا توجد صورة" };

  try {
    var prompt =
      "This image contains ONE OR MORE identity documents: PASSPORTS (Egyptian or other) and/or SAUDI E-VISAS. Extract EVERY person found and respond with pure JSON only (no markdown):\n" +
      '{"persons":[{' +
      '"docType": "<passport or visa>", ' +
      '"name": "<full name — the ARABIC name exactly as printed is REQUIRED if visible; otherwise English>", ' +
      '"latinName": "<the LATIN/English full name exactly as printed under Full Name, or from MRZ>", ' +
      '"issueDate": "<passport issue date dd/mm/yyyy or empty>", ' +
      '"passport": "<passport number>", ' +
      '"gender": "<M or F — MANDATORY: from the sex field, MRZ, or infer confidently from the first name. Never empty>", ' +
      '"birthDate": "<dd/mm/yyyy or empty>", ' +
      '"expiryDate": "<passport expiry dd/mm/yyyy or empty>", ' +
      '"militaryStatus": "<Egyptian male passports: الموقف من التجنيد text exactly as printed, else empty>", ' +
      '"visaType": "<if visa: type as printed e.g. عمرة / Personal Visit, else empty>"}]}\n' +
      "If two passports appear side by side, return TWO entries. If unreadable, return {\"persons\":[]}.";

    var payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || "image/jpeg", data: base64Image } }
        ]
      }]
    };

    // 🔁 سلسلة موديلات: كل موديل له حصة مجانية مستقلة — التبديل بينهم يضاعف السعة الفعلية
    // ويلغي الحاجة للنوم الطويل داخل النداء (كان سبب الـ84 ثانية اللي حسبتها "هنج")
    // 🧠 (V4.63) بعد إيقاف gemini-1.5-flash أيضاً — نُبقي 2.5-flash فقط (نموذج المستقر الحالي)
  // 🧠 (V4.65) استعادة قائمة النماذج الكاملة من V4.47 — كانت تعمل ممتازاً مع التذاكر والجوازات
  // ونحتفظ بها متعددة حتى ينتقل بينها الكود تلقائياً عند نفاد كوتا أو رفض مفتاح لنموذج بعينه
  var MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
    var jsonRes = null, lastErr = '', minQuotaWait = 0, fatal = false;

    for (var ki = 0; ki < GKEYS.length && !jsonRes && !fatal; ki++) {
    for (var mi = 0; mi < MODELS.length; mi++) {
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODELS[mi] + ":generateContent?key=" + GKEYS[ki];
      var response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var httpCode = response.getResponseCode();
      try { jsonRes = JSON.parse(response.getContentText()); } catch (pe) { jsonRes = null; }

      if (httpCode === 200 && jsonRes && jsonRes.candidates && jsonRes.candidates.length && jsonRes.candidates[0].content) {
        lastErr = '';
        break;
      }
      lastErr = (jsonRes && jsonRes.error && jsonRes.error.message) ? jsonRes.error.message : ('HTTP ' + httpCode);
      var rm = String(lastErr).match(/retry in ([0-9.]+)s/i);
      if (rm) {
        var w = Math.ceil(parseFloat(rm[1]));
        if (!minQuotaWait || w < minQuotaWait) minQuotaWait = w;
      }
      jsonRes = null;
      // 429 → الموديل التالي (أو المفتاح التالي)؛ خطأ غير مؤقت → توقف كلي
      if (httpCode !== 429 && httpCode !== 503 && httpCode !== 500) { fatal = true; break; }
    }
    }

    if (!jsonRes) {
      // كل الموديلات محدودة حالياً: نرجّع مدة الانتظار للواجهة (هي اللي تعدّ للمستخدم وتعيد)
      if (minQuotaWait) {
        return { success: false, quotaWait: minQuotaWait, error: "جاري استخلاص البيانات — إعادة محاولة تلقائية" };
      }
      return { success: false, error: "الذكاء الاصطناعي: " + (lastErr || "رد غير صالح") };
    }

    var text = jsonRes.candidates[0].content.parts[0].text || "";
    // إزالة أسوار Markdown + استخراج كائن الـJSON نفسه حتى لو الموديل أضاف كلاماً حوله
    text = text.replace(/```json|```/g, "").trim();
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) text = jsonMatch[0];

    var data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      Logger.log("extractPassportData JSON parse failed. Raw: " + text.substring(0, 300));
      return { success: false, error: "رد الذكاء الاصطناعي غير مفهوم — أعد المحاولة أو استخدم الاستخلاص اليدوي" };
    }

    // دعم شخصين+ في الصورة الواحدة: persons مصفوفة؛ التوافق الخلفي مع الرد المفرد القديم
    var rawPersons = data.persons && data.persons.length ? data.persons : (data.name ? [data] : []);
    if (!rawPersons.length) return { success: false, error: "لم يُعثر على أي مستند مقروء في الصورة" };

    var persons = [];
    rawPersons.forEach(function(p) {
      var pName = String(p.name || "").trim();
      if (!pName) return;

      var gender = String(p.gender || "").toUpperCase();
      if (gender !== "M" && gender !== "F") gender = "";
      var birth = _parseDmy_(String(p.birthDate || ""));
      var ageYears = birth ? (Date.now() - birth.getTime()) / (365.25 * 86400000) : null;
      if (ageYears !== null && ageYears < 0) ageYears = null;
      var pType = _resolvePilgrimType_(gender, ageYears, pName);

      // 🎖️ التجنيد: للذكور فقط، والملاحظة فقط لو النص "في سن التجنيد" حرفياً
      var militaryNote = "";
      if (pType === "ذكر" && /في سن التجنيد/.test(String(p.militaryStatus || ""))) {
        militaryNote = "مطلوب تصريح سفر";
      }

      var vType = String(p.visaType || "").trim();
      if (vType) {
        if (/Personal Visit/i.test(vType)) vType = 'زيارة شخصية';
        else if (/Family Visit/i.test(vType)) vType = 'زيارة عائلية';
        else if (/Umrah/i.test(vType)) vType = 'عمرة';
        else if (/Hajj/i.test(vType)) vType = 'حج';
        else if (/Tourist/i.test(vType)) vType = 'سياحية';
        var arPart = vType.match(/[\u0600-\u06FF][\u0600-\u06FF\s]*/);
        if (arPart) vType = arPart[0].trim();
      }

      persons.push({
        name: pName, passport: String(p.passport || "").trim(), type: pType,
        docType: String(p.docType || "passport"), visaType: vType,
        latinName: String(p.latinName || "").trim(),
        birthDate: String(p.birthDate || "").trim(),
        issueDate: String(p.issueDate || "").trim(),
        expiryDate: String(p.expiryDate || "").trim(),
        militaryNote: militaryNote
      });
    });

    if (!persons.length) return { success: false, error: "لم يُعثر على اسم مقروء في الصورة" };

    var first = persons[0];
    return {
      success: true,
      name: first.name, passport: first.passport, type: first.type,
      docType: first.docType, visaType: first.visaType,
      latinName: first.latinName, birthDate: first.birthDate,
      issueDate: first.issueDate, expiryDate: first.expiryDate,
      militaryNote: first.militaryNote,
      persons: persons
    };

  } catch (e) {
    Logger.log("extractPassportData ERROR: " + e);
    return { success: false, error: "خطأ في المعالجة: " + e.message };
  }
}


/* ============================================================
   🛂 استخلاص يدوي من صور الجوازات (OCR + تحليل MRZ) — بدون AI
   نفس نمط الـfallback اليدوي المستخدم في محلل التذاكر:
   Drive OCR → استخراج نص → قراءة سطري الـMRZ أسفل الجواز
   ============================================================ */
/* استخلاص من نص OCR جاهز (Tesseract في المتصفح) — بديل كامل لحدود Drive OCR:
   القراءة تتم على جهاز المستخدم، والسيرفر يحلل النص فقط (استدعاء خفيف بلا حصص) */
function extractPassportFromText(authToken, rawText, nameHint, latinHint) {
  requireAuth_(authToken);
  if (!rawText || String(rawText).trim().length < 10) {
    return { success: false, error: "نص OCR فارغ أو قصير جداً" };
  }
  return _parsePassportMulti_(String(rawText), String(nameHint || ''), String(latinHint || ''));
}

function extractPassportDataManual(authToken, base64Image, mimeType) {
  requireAuth_(authToken);
  if (!base64Image) return { success: false, error: "لا يوجد ملف" };

  var isPdf = String(mimeType || '').toLowerCase() === 'application/pdf';
  var ocrDocId = null;
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Image), mimeType || 'image/jpeg', isPdf ? 'passport_ocr.pdf' : 'passport_ocr');
    // إعادة محاولة بتراجع زمني: حدود Drive OCR هي سبب موجة "User rate limit exceeded"
    var ocrFile = null, lastOcrErr = null;
    var OCR_WAITS = [0, 4000, 8000, 15000]; // صبر متصاعد على الحصة — 27ث كحد أقصى للملف العنيد
    for (var attempt = 0; attempt < OCR_WAITS.length; attempt++) {
      if (OCR_WAITS[attempt]) Utilities.sleep(OCR_WAITS[attempt]);
      try {
        ocrFile = Drive.Files.insert(
          { title: 'PASSPORT_OCR_TEMP_' + Date.now() },
          blob,
          { convert: true, ocr: true, ocrLanguage: 'ar' }
        );
        lastOcrErr = null;
        break;
      } catch (ocrErr) {
        lastOcrErr = ocrErr;
        if (!/rate limit|quota|limit exceeded|backend/i.test(String(ocrErr))) throw ocrErr;
      }
    }
    if (!ocrFile) throw lastOcrErr;
    ocrDocId = ocrFile.id;
    // 📄 ملفات PDF متعددة الصفحات: تحويل Drive OCR ينتج مستند Google Docs قد يحمّل الصفحات
    // بتأخير طفيف إضافي عن حالة الصورة المفردة — صبر أطول قليلاً قبل القراءة يقلل حالات النص الفارغ
    Utilities.sleep(isPdf ? 2500 : 1500);
    var doc = DocumentApp.openById(ocrDocId);
    // 📚 قراءة كل عناصر المستند بدل getBody().getText() وحدها: بعض تحويلات PDF متعددة الصفحات
    // تضع كل صفحة في عنصر Body منفصل عملياً غير مضمون الدمج التلقائي في نص واحد بكل الحالات —
    // هذا يضمن التقاط محتوى الصفحة الأولى والثانية ونحوها معاً بدل الاكتفاء بأول صفحة فقط
    var text = doc.getBody().getText();
    try {
      var footer = doc.getFooter(), header = doc.getHeader();
      if (footer) text += '\n' + footer.getText();
      if (header) text += '\n' + header.getText();
    } catch (e2) { /* تذييل/ترويسة غير موجودين — تجاهل */ }
    DriveApp.getFileById(ocrDocId).setTrashed(true);
    ocrDocId = null;

    if (!text || text.trim().length < 5) {
      return {
        success: false,
        error: isPdf
          ? "لم يُستخرج أي نص من ملف الـPDF — قد يكون الملف صورة ممسوحة بجودة منخفضة أو صفحة فارغة. جرّب تحويله لصورة (JPG/PNG) وارفعها بدلاً منه، أو التقط صورة واضحة للمستند مباشرة."
          : "لم يُستخرج أي نص من الصورة — تأكد من وضوحها وحاول مرة أخرى."
      };
    }

    return _parsePassportMulti_(text);

  } catch (e) {
    if (ocrDocId) { try { DriveApp.getFileById(ocrDocId).setTrashed(true); } catch(e2) {} }
    Logger.log('extractPassportDataManual ERROR: ' + e);
    return { success: false, error: "فشل OCR: " + e.message };
  }
}

// 🔐 خانة التحقق في MRZ (المواصفة ICAO 9303): أوزان 7,3,1 دوّارة — تتيح التأكد أن الحقل قُرئ صحيحاً
function _mrzCheckDigit_(str) {
  var w = [7, 3, 1], sum = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i), v;
    if (c >= '0' && c <= '9') v = c.charCodeAt(0) - 48;
    else if (c >= 'A' && c <= 'Z') v = c.charCodeAt(0) - 55;
    else v = 0; // '<'
    sum += v * w[i % 3];
  }
  return sum % 10;
}
// تصحيح أخطاء OCR الشائعة في منطقة رقمية بحتة (O→0, I/L→1, S→5, B→8, Z→2)
function _mrzDigitsOnly_(s) {
  return String(s).replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5')
    .replace(/B/g, '8').replace(/Z/g, '2').replace(/[^0-9]/g, '0');
}
// YYMMDD → dd/mm/yyyy مع منطق القرن (الميلاد ماضٍ، الانتهاء مستقبلي)
function _mrzYymmddToDmy_(s6, isExpiry) {
  if (!/^\d{6}$/.test(s6)) return '';
  var yy = parseInt(s6.substring(0, 2), 10);
  var mm = s6.substring(2, 4), dd = s6.substring(4, 6);
  if (isExpiry) return dd + '/' + mm + '/' + (2000 + yy);
  var century = yy > (new Date().getFullYear() % 100) ? 1900 : 2000;
  var cand = new Date(century + yy, parseInt(mm, 10) - 1, parseInt(dd, 10));
  if (cand.getTime() > Date.now()) cand.setFullYear(cand.getFullYear() - 100);
  return ('0' + cand.getDate()).slice(-2) + '/' + ('0' + (cand.getMonth() + 1)).slice(-2) + '/' + cand.getFullYear();
}
// هل السداسية YYMMDD تاريخ منطقي؟ (شهر 01-12 ويوم 01-31) — يمنع قبول قراءة مُزاحة كتاريخ
function _plausibleYymmdd_(s6) {
  if (!/^\d{6}$/.test(s6)) return false;
  var mm = parseInt(s6.substring(2, 4), 10), dd = parseInt(s6.substring(4, 6), 10);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

// 🧭 مسح بنيوي مستقل عن المواضع لسطر MRZ الثاني: يبحث عن نمط
// [ميلاد 6 أرقام][خانة تحقق][الجنس M/F][انتهاء 6 أرقام][خانة تحقق] في أي موضع من السطر.
// ينقذ الحالات التي أسقط فيها الـOCR حرفاً فانزاحت كل المواضع الثابتة (سبب رئيسي لغياب الانتهاء والنوع)
function _mrzStructScan_(line2) {
  var s = String(line2 || '').replace(/\s+/g, '');
  var m = s.match(/([0-9OILSBZ]{6})([0-9OILSBZ])([MF])([0-9OILSBZ]{6})([0-9OILSBZ])/);
  var sexExplicit = true;
  if (!m) {
    // الجنس نفسه مقروء غلط (حرف آخر أو <): نقبل أي حرف ونعتمد على خانات التحقق وحدها
    m = s.match(/([0-9OILSBZ]{6})([0-9OILSBZ])([A-Z<])([0-9OILSBZ]{6})([0-9OILSBZ])/);
    sexExplicit = false;
  }
  if (!m) return null;
  var birth = _mrzDigitsOnly_(m[1]);
  var birthCd = _mrzDigitsOnly_(m[2]);
  var exp = _mrzDigitsOnly_(m[4]);
  var expCd = _mrzDigitsOnly_(m[5]);
  return {
    birth: birth,
    birthValid: _mrzCheckDigit_(birth) === parseInt(birthCd, 10) && _plausibleYymmdd_(birth),
    sex: (m[3] === 'M' || m[3] === 'F') ? m[3] : '',
    sexExplicit: sexExplicit,
    expiry: exp,
    expValid: _mrzCheckDigit_(exp) === parseInt(expCd, 10) && _plausibleYymmdd_(exp)
  };
}

// 📅 التقاط تاريخ مطبوع بجوار تسميته (نفس السطر أو السطرين التاليين أو السابق) —
// تخطيط الجواز يضع القيمة كثيراً في سطر مستقل تحت التسمية فلا يلتقطها البحث بنفس السطر
// يجمع كل التواريخ الصريحة في نص: dd/mm/yyyy (الوجه الإنجليزي) + yyyy/mm/dd (الوجه العربي المُطبَّع)
// شرط السنة 4 خانات + حدود رقمية صارمة — يمنع التقاط جزء من منتصف تاريخ معكوس
// (كان "2023/09/13" يُقرأ منه "23/09/13" فيُفسَّر 23/09/2013 ويُفسد تاريخ الإصدار)
function _collectDatesIn_(str) {
  var out = [];
  var norm = function(dd, mm, yr) {
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yr < 1900 || yr > 2100) return null;
    return { ts: new Date(yr, mm - 1, dd).getTime(),
             s: ('0' + dd).slice(-2) + '/' + ('0' + mm).slice(-2) + '/' + yr };
  };
  var re1 = /(?:^|[^0-9])(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{4})(?![0-9])/g;   // dd/mm/yyyy
  var re2 = /(?:^|[^0-9])(\d{4})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})(?![0-9])/g;   // yyyy/mm/dd
  var m;
  while ((m = re1.exec(str))) { var c1 = norm(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)); if (c1) out.push(c1); }
  while ((m = re2.exec(str))) { var c2 = norm(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10)); if (c2) out.push(c2); }
  return out;
}

// preferKind: 'future' → عند وجود عدة تواريخ بجوار التسمية، يفضّل الأحدث/الأبعد مستقبلاً
//             (يمنع التقاط تاريخ الإصدار بدل الانتهاء لما يكونا في سطور متجاورة أو نفس السطر)
//             'past' → يفضّل الأقدم/الأبعد ماضياً (للإصدار والميلاد).
function _findLabeledDate_(rawLines, labelRe, preferKind) {
  for (var i = 0; i < rawLines.length; i++) {
    if (!labelRe.test(rawLines[i])) continue;
    // اجمع كل التواريخ المرشحة من نفس السطر + الثلاثة التالية + السابق
    // (OCR يبعثر التخطيط: القيم قد تنزل 3 أسطر تحت تسميتها)
    var near = [rawLines[i], rawLines[i + 1] || '', rawLines[i + 2] || '', rawLines[i + 3] || '', rawLines[i - 1] || ''];
    var cands = [];
    for (var j = 0; j < near.length; j++) {
      cands = cands.concat(_collectDatesIn_(near[j]));
    }
    if (!cands.length) continue;
    if (preferKind === 'future') {
      cands.sort(function(a, b) { return b.ts - a.ts; }); // الأحدث أولاً
    } else if (preferKind === 'past') {
      cands.sort(function(a, b) { return a.ts - b.ts; }); // الأقدم أولاً
    }
    return cands[0].s;
  }
  return '';
}

// 🎯 تحليل بنيوي لسطر MRZ الثاني (TD3) مع التحقق بخانات التحقق — الحقول التي تنجح خانتها موثوقة ~100%
function _parseTd3Line2_(l2) {
  var s = String(l2 || '').replace(/\s+/g, '');
  if (s.length < 28) return null;
  var passRaw = s.substring(0, 9);
  var passCd = s.substring(9, 10);
  var birthRaw = s.substring(13, 19);
  var birthCd = s.substring(19, 20);
  var sex = s.substring(20, 21);
  var expRaw = s.substring(21, 27);
  var expCd = s.substring(27, 28);
  // رقم الجواز: نستخدم القراءة الخام إن نجحت خانة التحقق (قد تحوي حروفاً مشروعة كـ C)،
  // ولا نلجأ لتصحيح OCR الرقمي إلا لو فشلت الخام (نمط جوازات مصر: حرف أول + أرقام)
  var passport = passRaw.replace(/</g, '');
  var passValid = /^[0-9]$/.test(passCd) && _mrzCheckDigit_(passRaw) === parseInt(passCd, 10);
  if (!passValid && passRaw.length >= 2) {
    var fixed9 = passRaw.charAt(0) + _mrzDigitsOnly_(passRaw.substring(1));
    if (/^[0-9]$/.test(passCd) && _mrzCheckDigit_(fixed9) === parseInt(passCd, 10)) {
      passport = fixed9.replace(/</g, '');
      passValid = true;
    }
  }
  var birth = _mrzDigitsOnly_(birthRaw);
  var exp = _mrzDigitsOnly_(expRaw);
  return {
    passport: passport,
    passValid: passValid,
    birth: birth,
    birthValid: /^[0-9]$/.test(birthCd) && _mrzCheckDigit_(birth) === parseInt(birthCd, 10),
    sex: (sex === 'M' || sex === 'F') ? sex : '',
    expiry: exp,
    expValid: /^[0-9]$/.test(expCd) && _mrzCheckDigit_(exp) === parseInt(expCd, 10)
  };
}

// 👤 يبني شخصاً واحداً من زوج سطري MRZ (لصور تحوي أكثر من جواز): الحقول الآلية موثوقة بخانات التحقق،
// والاسم العربي تقريبي بالتعريب من اللاتيني (الـMRZ لاتيني بحت — لا يمكن قراءة العربي منه)
function _personFromMrzPair_(line1, line2) {
  // الاسم اللاتيني من السطر الأول (P<EGY<SURNAME><<GIVEN<NAMES)
  var latinName = '';
  if (line1 && line1.length > 5) {
    // إزالة البادئة P<EGY بمرونة: لو قُرئ "P<" كـ"P " (فاختفت <) لا تنكسر الإزاحة الثابتة substring(5)
    var _nameSec1 = line1.replace(/^P<{0,2}[A-Z]{3}<?/, '');
    if (_nameSec1 === line1) _nameSec1 = line1.substring(5);
    var parts = _nameSec1.split('<<');
    var surname = (parts[0] || '').replace(/</g, ' ').trim();
    var given = (parts[1] || '').replace(/</g, ' ').trim();
    latinName = (given + ' ' + surname).trim().split(/\s+/)
      .filter(function(w) { return /^[A-Z]{2,}$/.test(w); }).join(' ');
  }
  var td3 = _parseTd3Line2_(line2);
  if (!td3) return null;
  var passport = td3.passport || '';
  var gender = td3.sex || '';
  var birthDate = td3.birthValid ? _mrzYymmddToDmy_(td3.birth, false) : '';
  var expiryDate = td3.expValid ? _mrzYymmddToDmy_(td3.expiry, true) : '';
  // 🧭 إنقاذ الأسطر المُزاحة: مسح بنيوي مستقل عن المواضع للحقول الناقصة
  if (!gender || !birthDate || !expiryDate) {
    var ss = _mrzStructScan_(line2);
    if (ss) {
      if (!gender && ss.sex) gender = ss.sex;
      if (!birthDate && (ss.birthValid || (ss.sexExplicit && _plausibleYymmdd_(ss.birth)))) birthDate = _mrzYymmddToDmy_(ss.birth, false);
      if (!expiryDate && (ss.expValid || (ss.sexExplicit && _plausibleYymmdd_(ss.expiry)))) expiryDate = _mrzYymmddToDmy_(ss.expiry, true);
    }
  }
  // الإصدار (تقديري): جواز مصر = الانتهاء − 7 سنوات + يوم (الانتهاء = الإصدار + 7س − يوم)
  var issueDate = '';
  if (expiryDate) {
    var _pe = _parseDmy_(expiryDate);
    if (_pe) {
      var _pi = new Date(_pe.getTime());
      _pi.setFullYear(_pi.getFullYear() - 7);
      _pi.setDate(_pi.getDate() + 1);
      issueDate = ('0' + _pi.getDate()).slice(-2) + '/' + ('0' + (_pi.getMonth() + 1)).slice(-2) + '/' + _pi.getFullYear();
    }
  }
  // الاسم العربي: تعريب اللاتيني (تقريبي — يُراجَع)
  var arabic = _latinToArabicName_(latinName);
  var finalName = (arabic && arabic.split(/\s+/).length >= 2) ? arabic : latinName;
  if (!finalName) return null;
  var birth = _parseDmy_(birthDate);
  var ageYears = birth ? (Date.now() - birth.getTime()) / (365.25 * 86400000) : null;
  if (ageYears !== null && ageYears < 0) ageYears = null;
  var type = _resolvePilgrimType_(gender, ageYears, finalName);
  return {
    success: true, name: finalName, latinName: latinName, passport: passport,
    birthDate: birthDate, issueDate: issueDate, expiryDate: expiryDate,
    type: type, docType: 'passport', visaType: '', militaryNote: ''
  };
}

// 🔧 سطرا MRZ ملتصقان في سطر OCR واحد يفصلهما فراغ (حالة حقيقية متكررة من Drive OCR):
// "P<EGYSALEM<<... A442391854EGY..." — نفصلهما لسطرين مستقلين قبل أي اكتشاف
// (مشتركة بين المحلل المفرد والمتعدد)
function _splitMergedMrzLines_(lines) {
  var out = [];
  lines.forEach(function(l) {
    var toks = l.split(/\s+/).filter(Boolean);
    var mrzToks = toks.filter(function(t) { return t.length >= 19 && /^[A-Za-z0-9<>«‹]+$/.test(t) && /[<>«‹]/.test(t); });
    if (toks.length >= 2 && mrzToks.length >= 2) {
      toks.forEach(function(t) { out.push(t); });
    } else {
      out.push(l);
    }
  });
  return out;
}

// يكتشف كل أزواج MRZ في النص. لو وُجد أكثر من جواز (صورة بها جوازان+):
// يقسّم النص لمقاطع (مقطع لكل جواز: متنه + سطرا MRZ خاصته) ويشغّل المحلل الكامل على كل مقطع —
// فيلتقط الاسم العربي الحقيقي المطبوع لكل جواز بدل التعريب الصوتي التقريبي من اللاتيني
function _parsePassportMulti_(text, nameHint, latinHint) {
  if (!text) return { success: false, error: "لم يُستخرج نص من الصورة" };
  var ARABIC_DIGIT_MAP_ = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                             '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
  var t = String(text).replace(/[٠-٩۰-۹]/g, function(d) { return ARABIC_DIGIT_MAP_[d] || d; });
  var lines = t.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  lines = _splitMergedMrzLines_(lines);
  var normalizeMrz = function(l) {
    // '>' يُقرأ كثيراً بدل '<' في الـOCR — نطبّعه أيضاً
    return l.replace(/\s+/g, '').replace(/[«‹>]/g, '<').replace(/([KLCE])\1{2,}/g, '<<<').replace(/[KLCE]{5,}(?=<|$)/g, '<').replace(/KKK/g, '<<<');
  };
  // هل هذا سطر بيانات (line2)؟ النمط الموضعي الصارم، أو مرساة EGY+ميلاد لو الرقم فقد خانة
  var isLine2 = function(nl2) {
    if (!/^[A-Z0-9<]{25,}$/.test(nl2) || nl2.charAt(0) === 'P') return false;
    var z = nl2.replace(/O/g, '0');
    return /^[A-Z0-9<]{9}[0-9<][A-Z<]{3}[0-9]{6}/.test(z) || /EGY[0-9ILSBZ]{6}/.test(z);
  };
  var pairs = [];
  var usedLine2 = {};
  for (var i = 0; i < lines.length; i++) {
    var nl = normalizeMrz(lines[i]);
    // سطر أول لجواز: يبدأ عادةً بـ P، فيه << وحروف كثيرة وليس نمط السطر الثاني
    if (/^P[A-Z0-9<]{24,}$/.test(nl) && nl.indexOf('<<') !== -1 && /[A-Z]{4,}/.test(nl)) {
      // سطر البيانات قد يأتي بعد سطر الاسم أو قبله (الـOCR يعكس الترتيب أحياناً)
      var offsets = [1, 2, -1, -2];
      for (var oi = 0; oi < offsets.length; oi++) {
        var j = i + offsets[oi];
        if (j < 0 || j >= lines.length || usedLine2[j]) continue;
        var nl2 = normalizeMrz(lines[j]);
        if (isLine2(nl2)) {
          pairs.push({ line1: nl, line2: nl2, endIdx: Math.max(i, j) });
          usedLine2[j] = true;
          if (j > i) i = j;
          break;
        }
      }
    }
  }
  if (pairs.length <= 1) return _parsePassportMrz_(text, nameHint, latinHint);

  // 🧩 مقطع لكل جواز: من نهاية MRZ الجواز السابق حتى نهاية MRZ جوازه —
  // المحلل الكامل على المقطع يلتقط الاسم العربي المطبوع والتواريخ بكل شبكات الأمان
  var persons = [];
  var prevEnd = 0;
  pairs.forEach(function(pr) {
    var segText = lines.slice(prevEnd, pr.endIdx + 1).join('\n');
    prevEnd = pr.endIdx + 1;
    var one = null;
    try { one = _parsePassportMrz_(segText, '', ''); } catch (e) { one = null; }
    if (one && one.success && !one.persons) {
      persons.push(one);
    } else {
      var fb = _personFromMrzPair_(pr.line1, pr.line2);
      if (fb) persons.push(fb);
    }
  });
  if (!persons.length) return _parsePassportMrz_(text, nameHint, latinHint);
  return { success: true, persons: persons };
}

// تحليل نص OCR لجواز أو تأشيرة:
// 1) لو فيه MRZ (السطران السفليان بالجواز): نقرأ منه رقم الجواز والجنس والميلاد (لاتيني بطبيعته)
// 2) نبحث عن الاسم العربي في متن النص (الـMRZ نفسه لا يحتوي عربي أبداً — قيد في مواصفة الجوازات ذاتها)
// 3) لو المستند تأشيرة: نلتقط نوعها ونرجعه في visaType
function _parsePassportMrz_(text, nameHint, latinHint) {
  if (!text) return { success: false, error: "لم يُستخرج نص من الصورة" };

  // 🔢 تطبيع الأرقام العربية-الهندية/الفارسية لأرقام إنجليزية — Drive OCR بلغة عربية (ocrLanguage:'ar')
  // بيرجّع الأرقام أحياناً بالصيغة العربية (٠١٢٣...)، وده بيكسر كل الـregex اللي بتستخدم \d بصمت
  var ARABIC_DIGIT_MAP_ = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                             '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
  text = String(text).replace(/[٠-٩۰-۹]/g, function(d) { return ARABIC_DIGIT_MAP_[d] || d; });

  var rawLines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);

  // 🔧 سطرا الـMRZ ملتصقان في سطر OCR واحد يفصلهما فراغ — نفصلهما قبل الاكتشاف
  // وإلا اعتُبر كله «السطر الأول» ولا يُعثر على سطر البيانات إطلاقاً فتضيع كل الحقول
  rawLines = _splitMergedMrzLines_(rawLines);

  // ===== 1) اكتشاف أسطر الـMRZ بشكل عام (جواز P< أو تأشيرة KSA اللي بتبدأ بـ 1< أو V<) =====
  var normalizeMrz = function(l) {
    // '>' يُقرأ كثيراً بدل '<' في الـOCR — نطبّعه أيضاً
    return l.replace(/\s+/g, '').replace(/[«‹>]/g, '<').replace(/([KLCE])\1{2,}/g, '<<<').replace(/[KLCE]{5,}(?=<|$)/g, '<').replace(/KKK/g, '<<<');
  };
  var line1 = null, line2 = null, mrzIsPassport = false;
  for (var i = 0; i < rawLines.length; i++) {
    var nl = normalizeMrz(rawLines[i]);
    if (/^[A-Z0-9<]{25,}$/.test(nl) && nl.indexOf('<<') !== -1 && /[A-Z]{4,}/.test(nl) && !/^[A-Z]\d{7,}/.test(nl)) {
      line1 = nl;
      mrzIsPassport = nl.charAt(0) === 'P';
      // سطر البيانات قد يأتي بعد سطر الاسم أو قبله (الـOCR يعكس ترتيب السطرين أحياناً)
      var _l2Offsets = [1, 2, -1, -2];
      for (var oj = 0; oj < _l2Offsets.length; oj++) {
        var j = i + _l2Offsets[oj];
        if (j < 0 || j >= rawLines.length) continue;
        var nl2 = normalizeMrz(rawLines[j]);
        if (/^[A-Z0-9<]{25,}$/.test(nl2) && nl2 !== nl && nl2.charAt(0) !== 'P') { line2 = nl2; break; }
      }
      break;
    }
  }

  // line2 منفرد (بدون سطر الاسم): نمط جواز+جنسية+ميلاد+جنس — شائع في الصور المقصوصة
  var line2Standalone = false;
  if (!line1) {
    for (var st = 0; st < rawLines.length; st++) {
      var cand = normalizeMrz(rawLines[st]).replace(/O/g, '0').replace(/[IL]/g, '1');
      var sm = cand.match(/^([A-Z]{1,2}[0-9]{7,8})[0-9]([A-Z]{3})([0-9]{6})[0-9]([MF])?([0-9]{6})?/);
      if (sm) { line2 = cand; line2Standalone = true; break; }
    }
  }

  // ===== 2) هل المستند تأشيرة؟ =====
  // 🛂 كان الاكتشاف يعتمد فقط على كلمات مفتاحية ضيقة (تأشيرة/KSA VISA/Visa No|Type) أو على وجود
  // line1 لا يبدأ بـP — فلو تدهورت جودة الـOCR وأخفت هذه الكلمات، أو دخلت الصورة من مسار
  // line2Standalone (بلا line1 إطلاقاً — شائع في الصور المقصوصة)، كان isVisa يبقى false وتُقرأ
  // حقول التأشيرة (رقم/تاريخ) خطأً على أنها ميلاد/إصدار/انتهاء جواز. التوسعة هنا تضيف: كلمات مفتاحية
  // أكثر تسامحاً مع أخطاء OCR، إشارة نوع التأشيرة (عمرة/زيارة/حج...)، وحالة line2Standalone
  // المصحوبة بسياق تأشيرة سعودية نموذجي (بلا أي لغة "جواز سفر" تدل على أنه المستند الأساسي)
  var visaKeywordHit = /تأشير[ةه]|VISA|Umrah|Hajj|Personal\s*Visit|Family\s*Visit|Entry\s*Visa|رخصة\s*دخول/i.test(text);
  var visaTypePhraseHit = /زيارة شخصية|زيارة عائلية|عمرة|سياح[ةي]+|حج(?![\u0600-\u06FF])/.test(text);
  var looksLikePassportBook = /جواز\s*سفر|Passport\s*No|P<[A-Z]{3}/i.test(text);
  var isVisa = visaKeywordHit || visaTypePhraseHit || (line1 && !mrzIsPassport) ||
    (line2Standalone && !looksLikePassportBook && /السعودية|KSA|Saudi/i.test(text));

  // ===== 3) الاسم العربي: تنظيف الترقيم/التشويه + دمج الأسطر المتجاورة + اختيار أفضل مرشح =====
  var docWords = /جمهورية|مملكة|المملكة|العربية|السعودية|جواز|سفر|تأشيرة|التأشيرة|وزارة|الخارجية|الداخلية|رقم|تاريخ|الجنسية|مصر|صالحة|اعتبارا|اعتباراً|لغاية|مدة|الإقامة|الغرض|متعددة|الممثلية|القاهرة|مصرح|بالعمل|الاستعلام|يرجى|مسح|رمز|الاستجابة|مكان|الإصدار|عدد|مرات|الدخول|نوع|الاسم|الإسم|الرسوم|يوم|زيارة|شخصية|عائلية|بصمة|العنوان|عنوان|مركز|محافظة|محافظه|قسم|شارع|قرية|قريه|مدينة|مدينه|الديانة|الديانه|المهنة|المهنه|طالب|ربة|منزل|الميلاد|محل|إقامة|اقامة|الزوج|الزوجة|السلطة|سلطة|صفحة|ملاحظات|امارة|الامارة|إمارة|ولاية|الولاية|دولة|الدولة/;
  // تنظيف: توحيد الياء الفارسية، وإبقاء الحروف العربية والمسافات فقط (يشيل ، . : ي التشويه)
  var cleanAr = function(l) {
    return String(l || '').replace(/[یى]/g, 'ي')
      .replace(/[^\u0621-\u064A\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  };
  var isNameCandidate = function(l) {
    var words = l.split(' ');
    return l && /^[\u0621-\u064A ]+$/.test(l) && words.length >= 2 && words.length <= 6 && l.length >= 7 && !docWords.test(l);
  };

  // بناء المرشحين: tier 0 = بجوار تسمية "الاسم"، tier 1 = سطر مفرد، tier 2 = دمج سطرين متتاليين
  var candidates = [];
  for (var k = 0; k < rawLines.length; k++) {
    if (/الاسم|^Name\b/i.test(rawLines[k])) {
      var same = cleanAr(rawLines[k].replace(/الاسم|Name/gi, ''));
      if (isNameCandidate(same)) candidates.push({ text: same, tier: 0 });
      [rawLines[k+1], rawLines[k+2], rawLines[k-1]].forEach(function(nb) {
        var c = cleanAr(nb);
        if (isNameCandidate(c)) candidates.push({ text: c, tier: 0 });
      });
    }
  }
  for (var m1 = 0; m1 < rawLines.length; m1++) {
    var c1 = cleanAr(rawLines[m1]);
    if (isNameCandidate(c1)) candidates.push({ text: c1, tier: 1 });
    // دمج سطرين: الـOCR كثيراً يقسم الاسم ("هناء ابراهيم" / "عبد الفتاح")
    if (m1 + 1 < rawLines.length) {
      var c2 = cleanAr(rawLines[m1 + 1]);
      if (c1 && c2 && c1.split(' ').length <= 4 && c2.split(' ').length <= 4) {
        var merged = c1 + ' ' + c2;
        if (isNameCandidate(merged) && merged.split(' ').length >= 3) candidates.push({ text: merged, tier: 1 });
      }
    }
  }

  // الاختيار: أفضل tier، ثم الأكثر كلمات (الاسم الكامل يغلب الشظايا)، ثم الأطول
  var arabicName = '';
  // تنظيف سطر من الترقيم وأخطاء OCR الفارسية (ی→ي، ک→ك) — سبب "والا،" و"بدوی"
  var cleanLine = function(l) {
    return String(l || '').replace(/[یﯼﯽ]/g, 'ي').replace(/[کﮎ]/g, 'ك')
      .replace(/[،,\.:؛;"'()\-_ـ]/g, ' ').replace(/\s+/g, ' ').trim();
  };
  var isNamePart = function(l) {
    var w = l.split(/\s+/);
    return /^[\u0600-\u06FF\s]+$/.test(l) && w.length >= 1 && w.length <= 6 && l.length >= 3 && !docWords.test(l);
  };

  // بناء المرشحين: دمج الأسطر العربية المتتالية (الاسم كثيراً يتقسم لسطرين في الـOCR —
  // سبب "عبد الفتا" المبتور و"فؤاد بدوي" الجزئي) واختيار الأفضل بنظام نقاط
  var candidates = [];
  var labelIdx = -1;
  for (var li = 0; li < rawLines.length; li++) {
    // «الإسم» بهمزة تحت الألف شائعة في الجوازات — نقبل الرسمين
    if (/الاسم|الإسم|^Name\b/i.test(rawLines[li])) { labelIdx = li; break; }
  }
  // 🧷 بقية الاسم على سطر التسمية نفسه ("الإسم هبه"): تُحفظ كبادئة تُضم لأقرب سطر اسم تالٍ —
  // الـOCR كثيراً يفصل أول كلمة من الاسم مع التسمية ويترك الباقي بعد أسطر
  var labelRemnant = '';
  if (labelIdx !== -1) {
    var _rem = cleanLine(String(rawLines[labelIdx]).replace(/الاسم|الإسم|Full|Name/gi, ' '));
    if (_rem && /^[؀-ۿ\s]+$/.test(_rem) && !docWords.test(_rem) && _rem.length >= 2) labelRemnant = _rem;
  }
  var run = [];
  var flushRun = function(endIdx) {
    if (!run.length) return;
    var joined = run.join(' ').replace(/\s+/g, ' ').trim();
    var wc = joined.split(/\s+/).length;
    var startIdx = endIdx - run.length;
    var dist = labelIdx !== -1 ? (startIdx - labelIdx) : null;
    // القيم تنزل حتى 4 أسطر تحت تسميتها في تخطيطات OCR المبعثرة
    var nearLabel = (dist !== null && dist >= -2 && dist <= 4) ? 100 : 0;
    if (wc >= 2 && wc <= 7) {
      candidates.push({ text: joined, score: nearLabel + wc * 10 + joined.length });
    }
    // بادئة سطر التسمية + هذا السطر = الاسم الكامل ("هبه" + "احمد عبد الرازق ابو المعاطى")
    if (labelRemnant && dist !== null && dist >= 1 && dist <= 4) {
      var withRem = (labelRemnant + ' ' + joined).replace(/\s+/g, ' ').trim();
      var remWc = withRem.split(/\s+/).length;
      if (remWc >= 2 && remWc <= 7) {
        candidates.push({ text: withRem, score: 160 + remWc * 10 + withRem.length });
      }
    }
    run = [];
  };
  for (var ci = 0; ci < rawLines.length; ci++) {
    var cl = cleanLine(rawLines[ci]);
    if (cl && isNamePart(cl)) run.push(cl);
    else flushRun(ci);
  }
  flushRun(rawLines.length);

  if (candidates.length) {
    candidates.sort(function(x, y) { return y.score - x.score; });
    // فلتر جودة صارم: كل كلمة ≥3 حروف (باستثناء بادئات مركبة: عبد/ابو/ابن/ام)
    // و≥3 كلمات إلا لو المرشح ملاصق لتسمية "الاسم" — الشظايا زي "ذا رد لمغاتية" ترسب هنا
    // وعندها نفضّل الاسم اللاتيني الموثوق من الـMRZ بدل عربي مشوّه
    var COMPOUND_OK = /^(عبد|ابو|أبو|ابن|ام|أم|ال)$/;
    // 🔗 دمج الشظايا: الـOCR يكسر الكلمة أحياناً ("هو يشل" = هويشل) — ندمج أي كلمة ≤ حرفين
    // في الكلمة التالية (إلا لو أيٌّ منهما بادئة مركبة مثل عبد/ابو فتبقى مستقلة بحق)
    var _mergeShortFrags = function(txt) {
      var ws = txt.split(/\s+/);
      var out = [];
      for (var mi = 0; mi < ws.length; mi++) {
        var w = ws[mi];
        if (w.length <= 2 && !COMPOUND_OK.test(w) && mi + 1 < ws.length && !COMPOUND_OK.test(ws[mi + 1])) {
          out.push(w + ws[mi + 1]);
          mi++;
        } else {
          out.push(w);
        }
      }
      return out.join(' ');
    };
    for (var pi = 0; pi < candidates.length; pi++) {
      var candText = _mergeShortFrags(candidates[pi].text);
      var cw = candText.split(/\s+/);
      var allSolid = cw.every(function(w) { return w.length >= 3 || COMPOUND_OK.test(w); });
      var nearLbl = candidates[pi].score >= 100;
      if (allSolid && (cw.length >= 3 || (nearLbl && cw.length >= 2))) {
        arabicName = candText;
        break;
      }
    }
    if (arabicName) {
      var wds = arabicName.split(/\s+/);
      // سقف 6 كلمات: الأسماء المصرية بمركّبات (عبد/ابو) تبلغ 6 مقاطع بسهولة
      // ("هبه احمد عبد الرازق ابو المعاطى") — سقف 5 كان يبتر آخر مقطع
      if (wds.length > 6) arabicName = wds.slice(0, 6).join(' ');
    }
  }

  // 🎯 الهنت الهندسي (المنطقة فوق "Full Name" من الواجهة): أعلى أولوية —
  // منطقة صغيرة مركزة = أدق قراءة، ولو عدّى فلتر الجودة نثق به ونتخطى الإسقاط التقاطعي
  var hintTrusted = false;
  if (nameHint) {
    var hLines = String(nameHint).split(/\r?\n/).map(function(l) {
      return cleanLine(String(l).replace(/الاسم|Full|Name/gi, ' '));
    }).filter(function(l) { return l && /^[\u0600-\u06FF\s]+$/.test(l); });
    var hJoined = hLines.join(' ').replace(/\s+/g, ' ').trim();
    if (hJoined) {
      var hw = hJoined.split(/\s+/).filter(function(w) { return !docWords.test(w); });
      var hClean = hw.join(' ');
      var hSolid = hw.every(function(w) { return w.length >= 3 || /^(عبد|ابو|أبو|ابن|ام|أم|ال)$/.test(w); });
      if (hSolid && hw.length >= 2 && hw.length <= 6) {
        arabicName = hw.slice(0, 5).join(' ');
        hintTrusted = true;
      }
    }
  }

  // ===== 4) رقم الجواز: أولوية بجوار تسميته، ثم نمط عام =====
  var passportNo = '';
  for (var p = 0; p < rawLines.length && !passportNo; p++) {
    if (!/رقم الجواز|Passport\s*No/i.test(rawLines[p])) continue;
    var searchIn = [rawLines[p], rawLines[p+1] || '', rawLines[p+2] || '', rawLines[p-1] || ''].join(' ');
    var pmNear = searchIn.match(/\b([A-Z]{1,2}\d{6,9})\b/);
    if (pmNear) passportNo = pmNear[1];
  }
  if (!passportNo) {
    var pm = text.match(/\b([A-Z]{1,2}\d{6,9})\b/);
    if (pm) passportNo = pm[1];
  }

  // ===== 5) نوع التأشيرة =====
  var visaType = '';
  if (isVisa) {
    var vm = text.match(/زيارة شخصية|زيارة عائلية|عمرة|سياح[ةي]+|حج(?![\u0600-\u06FF])|Umrah|Personal Visit|Family Visit|Hajj|Tourist/i);
    if (vm) {
      var v = vm[0];
      if (/Personal Visit/i.test(v)) v = 'زيارة شخصية';
      else if (/Family Visit/i.test(v)) v = 'زيارة عائلية';
      else if (/Umrah/i.test(v)) v = 'عمرة';
      else if (/Hajj/i.test(v)) v = 'حج';
      else if (/Tourist/i.test(v)) v = 'سياحية';
      visaType = v;
    }
  }

  // ===== 6) قراءة MRZ: الاسم اللاتيني (fallback) + رقم الجواز + الميلاد + الجنس =====
  var latinName = '', gender = '', birthDate = '', expiryDate = '';
  var birthTrusted = false, expiryTrusted = false; // نجحت خانة التحقق (ICAO) → لا تلمسها الشبكات الاحتياطية
  if (line1) {
    // إزالة البادئة P<EGY بمرونة: لو قُرئ "P<" كـ"P " (فاختفت <) لا تنكسر الإزاحة الثابتة substring(5)
    var nameSection = line1.replace(/^P<{0,2}[A-Z]{3}<?/, '');
    if (nameSection === line1) nameSection = line1.substring(5);
    var nameParts = nameSection.split('<<');
    var surname = (nameParts[0] || '').replace(/</g, ' ').trim();
    var given = (nameParts[1] || '').replace(/</g, ' ').trim();
    latinName = (given + ' ' + surname).trim()
      // حروف A-Z فقط وبطول ≥2: يُسقط K/X المنفردة (< مقروءة غلط) وأي كلمة فيها أرقام (شظايا line2)
      .split(/\s+/)
      .map(function(w) { return w.replace(/^KK(?=[A-Z]{3,})/, ''); })
      .filter(function(w) { return /^[A-Z]{2,}$/.test(w); }).join(' ');
  }

  // 🅰️ الاسم اللاتيني المطبوع (تحت "Full Name" — من إحداثيات الصفحة): مصدر أصدق من MRZ
  // عندما يُقرأ حرف < كحروف C/S/K فيلتصق الاسم أو ينعكس ترتيبه (لقب أولاً)
  if (latinHint) {
    var LH_STOP = /^(FULL|NAME|DATE|BIRTH|PLACE|OF|SEX|NATIONALITY|EGYPTIAN|PROFESSION|ISSUE|EXPIRY|OFFICE|TYPE|CODE|COUNTRY|PASSPORT|NO|ISSUING)$/;
    var lhWords = String(latinHint).toUpperCase().split(/\s+/)
      .map(function(w) { return w.replace(/[^A-Z]/g, ''); })
      .filter(function(w) { return /^[A-Z]{3,}$/.test(w) && !LH_STOP.test(w); });
    if (lhWords.length >= 2 && lhWords.length <= 6) {
      latinName = lhWords.slice(0, 5).join(' ');
    }
  }
  if (line2) {
    // تطبيع أخطاء OCR الشائعة في الأرقام (بعد موضع الجواز اللي ممكن يحتوي حروفاً شرعية)
    var l2digits = line2.substring(9).replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
    line2 = line2.substring(0, 9) + l2digits;
    if (!passportNo) {
      var rawPass = line2.substring(0, 9).replace(/</g, '').trim();
      // جوازات مصر: حرف واحد + 8 أرقام — نطبّع أخطاء OCR في الجزء الرقمي فقط
      if (rawPass.length > 1) {
        passportNo = rawPass.charAt(0) + rawPass.substring(1)
          .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
      } else {
        passportNo = rawPass;
      }
    }
    var birthRaw = line2.substring(13, 19);
    var genderChar = line2.substring(20, 21);
    if (genderChar !== 'M' && genderChar !== 'F') {
      var sexWindow = line2.substring(18, 24);
      var sexHit = sexWindow.match(/[MF]/);
      if (sexHit) genderChar = sexHit[0];
    }
    var expiryRaw = line2.substring(21, 27);
    // حارس منطقية: القراءة الموضعية تنتج هراءً (شهر 40 مثلاً) لو انزاح السطر بحرف ساقط
    if (_plausibleYymmdd_(expiryRaw)) {
      var eyy = parseInt(expiryRaw.substring(0, 2), 10);
      // الانتهاء دائماً مستقبلي أو قريب: قرن 2000 افتراضاً
      expiryDate = expiryRaw.substring(4, 6) + '/' + expiryRaw.substring(2, 4) + '/' + (2000 + eyy);
    }
    if (_plausibleYymmdd_(birthRaw)) {
      var yy = parseInt(birthRaw.substring(0, 2), 10);
      var century = yy > (new Date().getFullYear() % 100) ? 1900 : 2000;
      var candidate = new Date(century + yy, parseInt(birthRaw.substring(2, 4), 10) - 1, parseInt(birthRaw.substring(4, 6), 10));
      // لو التاريخ طلع في المستقبل (زي yy مساوية للسنة الحالية) فهو قطعاً من القرن الماضي
      if (candidate.getTime() > Date.now()) candidate.setFullYear(candidate.getFullYear() - 100);
      birthDate = ('0' + candidate.getDate()).slice(-2) + '/' + ('0' + (candidate.getMonth() + 1)).slice(-2) + '/' + candidate.getFullYear();
    }
    if (genderChar === 'M' || genderChar === 'F') gender = genderChar;

    // 🎯 ترجيح القراءة البنيوية المُتحقَّقة بخانات التحقق (ICAO 9303) — دقة ~100% حين تنجح الخانة
    var _td3 = _parseTd3Line2_(line2);
    if (_td3) {
      if (_td3.passValid && _td3.passport) passportNo = _td3.passport;
      if (_td3.sex) gender = _td3.sex;
      if (_td3.birthValid && _plausibleYymmdd_(_td3.birth)) { var _bd = _mrzYymmddToDmy_(_td3.birth, false); if (_bd) { birthDate = _bd; birthTrusted = true; } }
      if (_td3.expValid && _plausibleYymmdd_(_td3.expiry)) { var _ed = _mrzYymmddToDmy_(_td3.expiry, true); if (_ed) { expiryDate = _ed; expiryTrusted = true; } }
    }

    // 🧭 مسح بنيوي مستقل عن المواضع: ينقذ الأسطر المُزاحة (حرف ساقط يهدم كل المواضع الثابتة)
    if (!birthTrusted || !expiryTrusted || !gender) {
      var _ss = _mrzStructScan_(line2);
      if (_ss) {
        if (!gender && _ss.sex) gender = _ss.sex;
        if (!birthTrusted && _ss.birthValid) { var _bd2 = _mrzYymmddToDmy_(_ss.birth, false); if (_bd2) { birthDate = _bd2; birthTrusted = true; } }
        if (!expiryTrusted && _ss.expValid) { var _ed2 = _mrzYymmddToDmy_(_ss.expiry, true); if (_ed2) { expiryDate = _ed2; expiryTrusted = true; } }
        // النمط الكامل بجنس صريح M/F ثقته عالية حتى لو خانة التحقق نفسها مقروءة غلط — يملأ الفراغ فقط
        if (!birthDate && _ss.sexExplicit && _plausibleYymmdd_(_ss.birth)) birthDate = _mrzYymmddToDmy_(_ss.birth, false);
        if (!expiryDate && _ss.sexExplicit && _plausibleYymmdd_(_ss.expiry)) expiryDate = _mrzYymmddToDmy_(_ss.expiry, true);
      }
    }
  }

  // ===== 6-أ) 🇪🇬 مرساة الجنسية: "EGY" يليها مباشرةً [ميلاد 6][خانة][جنس][انتهاء 6][خانة] =====
  // نبحث في النص كله بعد لصق كل الأسطر الشبيهة بالـMRZ — ينقذ الحالات التي تكسّر فيها
  // سطر الـMRZ السفلي لسطرين (مثل "A442391854EGY" + "6601247F3301111") فلا يُكتشف line2 أصلاً
  if (!birthTrusted || !expiryTrusted || !gender) {
    // ملاحظة: لا نستبعد الأسطر التي تبدأ بـP< — قد يكون سطر الاسم والبيانات ملتصقين في سطر واحد،
    // وEGY داخل قسم الاسم يتبعها حروف الاسم (ليست أرقاماً) فلا تُطابق النمط أصلاً — الأمان محفوظ
    var _flat = rawLines.map(normalizeMrz)
      .filter(function(l) { return /^[A-Z0-9<]{3,}$/.test(l); })
      .join('');
    var _am = _flat.match(/EGY<?([0-9OILSBZ]{6})([0-9OILSBZ])([A-Z<])?([0-9OILSBZ]{6})?([0-9OILSBZ])?/);
    if (_am) {
      var _aBirth = _mrzDigitsOnly_(_am[1]);
      var _aCd = _mrzDigitsOnly_(_am[2]);
      var _aSex = (_am[3] === 'M' || _am[3] === 'F') ? _am[3] : '';
      var _aBirthValid = _mrzCheckDigit_(_aBirth) === parseInt(_aCd, 10) && _plausibleYymmdd_(_aBirth);
      if (!gender && _aSex) gender = _aSex;
      // خانة تحقق ناجحة = موثوق؛ وإلا نقبل فقط لو التاريخ منطقي والجنس M/F صريح بعده (سياق مؤكد)
      if (!birthTrusted && (_aBirthValid || (_aSex && _plausibleYymmdd_(_aBirth)))) {
        var _abd = _mrzYymmddToDmy_(_aBirth, false);
        if (_abd) { birthDate = _abd; if (_aBirthValid) birthTrusted = true; }
      }
      if (!expiryTrusted && _am[4]) {
        var _aExp = _mrzDigitsOnly_(_am[4]);
        var _aExpCd = _am[5] ? _mrzDigitsOnly_(_am[5]) : '';
        var _aExpValid = _aExpCd !== '' && _mrzCheckDigit_(_aExp) === parseInt(_aExpCd, 10) && _plausibleYymmdd_(_aExp);
        if (_aExpValid || (_aSex && _plausibleYymmdd_(_aExp))) {
          var _aed = _mrzYymmddToDmy_(_aExp, true);
          if (_aed) { expiryDate = _aed; if (_aExpValid) expiryTrusted = true; }
        }
      }
    }
  }

  // ===== 6-ب) شبكات أمان من النص المطبوع — حين يعجز الـMRZ (مفقود/مشوّه/مُزاح) =====
  // تاريخ الانتهاء المطبوع بجوار تسميته: أصدق من قراءة موضعية غير مُتحقَّقة
  if (!expiryTrusted) {
    // 'future': لما التسميتان بجوار بعض، الأقرب مستقبلاً هو الانتهاء (الإصدار في الماضي)
    var printedExp = _findLabeledDate_(rawLines, /ال[اإأ]نتهاء|نهاية\s*الصلاحية|صالح[ةه]?\s*(?:حتى|لغاية)|Date\s*of\s*Expiry|Expiry/i, 'future');
    if (printedExp) expiryDate = printedExp;
  }
  // تاريخ الميلاد المطبوع (تسمية محددة حتى لا نلتقط "محل الميلاد")
  // "Date\s*(?:of\s*)?Birth": الـOCR كثيراً يُسقط "of" فتصبح "Date Birth" — نقبلها،
  // و"Place of Birth" آمنة لأنها بلا "Date"
  if (!birthTrusted) {
    var printedBirth = _findLabeledDate_(rawLines, /تاريخ\s*الميلاد|Date\s*(?:of\s*)?Birth/i, 'past');
    if (printedBirth) {
      // عقلانية الميلاد: في الماضي وعمر ≤ 110 سنة
      var _pb = _parseDmy_(printedBirth);
      if (_pb && _pb.getTime() < Date.now() && (Date.now() - _pb.getTime()) < 110 * 365.25 * 86400000) {
        birthDate = printedBirth;
      }
    }
  }
  // شبكة أخيرة للانتهاء (جوازات فقط): أبعد تاريخ مستقبلي منطقي في المستند (صلاحية الجواز ≤ 10 سنوات)
  if (!expiryDate && !isVisa) {
    var _allDatesRe = /(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{4})/g, _dm, _best = null;
    while ((_dm = _allDatesRe.exec(text))) {
      var _dd = parseInt(_dm[1], 10), _mm = parseInt(_dm[2], 10), _yy = parseInt(_dm[3], 10);
      if (_mm < 1 || _mm > 12 || _dd < 1 || _dd > 31) continue;
      var _cand = new Date(_yy, _mm - 1, _dd);
      var _years = (_cand.getTime() - Date.now()) / (365.25 * 86400000);
      if (_years > -0.5 && _years < 11 && (!_best || _cand.getTime() > _best.getTime())) _best = _cand;
    }
    if (_best) expiryDate = ('0' + _best.getDate()).slice(-2) + '/' + ('0' + (_best.getMonth() + 1)).slice(-2) + '/' + _best.getFullYear();
  }
  // الجنس من النص المطبوع: كلمة ذكر/أنثى صريحة (بحدود حروف عربية حتى لا تطابق "تذكرة")،
  // ثم قيمة M/F بجوار تسمية Sex/الجنس — ثم يبقى الاستنتاج من الاسم كشبكة أخيرة في _resolvePilgrimType_
  if (!gender) {
    if (/(^|[^؀-ۿ])ذكر($|[^؀-ۿ])/.test(text)) gender = 'M';
    else if (/(^|[^؀-ۿ])[اأ]نث[ىي]($|[^؀-ۿ])/.test(text)) gender = 'F';
  }
  if (!gender) {
    var _sx = text.match(/(?:Sex|الجنس|النوع)[^MFmf؀-ۿ]{0,12}([MF])(?![A-Za-z])/i);
    if (_sx) gender = _sx[1].toUpperCase();
  }

  // تحقق تقاطعي: لو عندنا اسم لاتيني موثوق من الـMRZ، الاسم العربي لازم حروفه الأولى
  // تطابق نظيرتها اللاتينية بنفس الترتيب (≥60%) — وإلا فهو هلوسة OCR ونفضّل اللاتيني
  if (arabicName && latinName && !hintTrusted) {
    var AR_INIT = { 'ا':'AEIO','أ':'AEIO','إ':'AEIO','آ':'A','ع':'AEO','ب':'B','ت':'T','ط':'T','ث':'TS','ج':'GJ','ح':'H','ه':'H','خ':'HK','د':'D','ض':'D','ذ':'ZD','ر':'R','ز':'Z','س':'S','ص':'S','ش':'S','غ':'G','ف':'F','ق':'KQ','ك':'K','ل':'L','م':'M','ن':'N','و':'WOU','ي':'YEI','ى':'YEI' };
    var aw = arabicName.split(/\s+/);
    var lw = latinName.split(/\s+/);
    var matches = 0, checked = Math.min(aw.length, lw.length);
    for (var xi = 0; xi < checked; xi++) {
      var expect = AR_INIT[aw[xi].charAt(0)] || '';
      if (expect.indexOf(lw[xi].charAt(0)) !== -1) matches++;
    }
    // شرط إضافي: أول كلمة عربية توافق أول كلمة لاتينية — اسم مطبوع حقيقي يبدأ دائماً
    // بالاسم الأول نفسه؛ يرفض مرشحاً مبعثر الترتيب أو مبتور البداية ("احمد السيد طه" لفايزة)
    var firstOk = (AR_INIT[aw[0].charAt(0)] || '').indexOf(lw[0].charAt(0)) !== -1;
    if (checked >= 2 && (matches / checked < 0.6 || !firstOk)) {
      arabicName = ''; // هلوسة/مبعثر — اللاتيني أصدق ثم التعريب بالقاموس
    }
  }

  var finalName = arabicName || latinName;

  // 🔤 تعريب تلقائي: لا اسم عربي موثوق لكن اللاتيني نظيف → قاموس الأسماء المصرية
  // (النوع بعدها يُستنتج من الاسم العربي الناتج تلقائياً)
  var arabized = '';
  if (!arabicName && latinName && !/[\u0600-\u06FF]/.test(finalName)) {
    arabized = _latinToArabicName_(latinName);
    if (arabized && arabized.split(/\s+/).length >= 2) {
      finalName = arabized;
      arabicName = arabized;
    }
  }
  if (!finalName) {
    // رقم بدون اسم = صف مشوّه بلا فائدة — نفشل برسالة تفيد إعادة المحاولة
    var hint = passportNo ? ' (قُرئ رقم الجواز ' + passportNo + ' فقط)' : '';
    return { success: false, error: (isVisa ? "تعذر قراءة اسم التأشيرة" : "لم يُقرأ الاسم من الصورة") + hint };
  }

  var birth = _parseDmy_(birthDate);
  var ageYears = birth ? (Date.now() - birth.getTime()) / (365.25 * 86400000) : null;
  if (ageYears !== null && ageYears < 0) ageYears = null;
  // العمر من MRZ موثوق في الجوازات فقط (تنسيق التأشيرات ثبت عملياً إنه غير قياسي)
  var type = _resolvePilgrimType_(gender, (mrzIsPassport || line2Standalone) ? ageYears : null, finalName);

  // الموقف التجنيدي من متن الجواز (ذكور مصر): "معفى/أدى الخدمة" آمن، غير ذلك يتطلب تصريح سفر
  var militaryNote = '';
  if (type === 'ذكر' && /في سن التجنيد/.test(text)) {
    militaryNote = 'مطلوب تصريح سفر';
  }

  // 📅 الحقول التفصيلية للأعمدة الجديدة
  var birthDateStr = birth ? (('0' + birth.getDate()).slice(-2) + '/' + ('0' + (birth.getMonth() + 1)).slice(-2) + '/' + birth.getFullYear()) : '';
  var issueDateStr = '';
  // تسمية الإصدار: نفس السطر أو الأسطر المجاورة (القيمة كثيراً في سطر مستقل تحت التسمية)
  // 'past': لما التسميتان بجوار بعض، الأبعد ماضياً هو الإصدار (والانتهاء في المستقبل)
  var printedIssue = _findLabeledDate_(rawLines, /تاريخ\s*الإصدار|تاريخ\s*الاصدار|Date\s*of\s*Issue|Issue/i, 'past');
  if (printedIssue) issueDateStr = printedIssue;

  // 🛡️ عقلانية الإصدار: يجب أن يكون في الماضي، وقبل الانتهاء، والفارق بينهما ≤ 10.5 سنة
  // (جواز مصر = 7 سنوات بالضبط) — قراءة تكسر هذه القواعد = OCR مشوّه ونرفضها
  var _issueOk = false;
  if (issueDateStr) {
    var _dIss = _parseDmy_(issueDateStr);
    if (_dIss && _dIss.getTime() <= Date.now() + 86400000) {
      if (expiryDate) {
        var _dExpV = _parseDmy_(expiryDate);
        if (_dExpV) {
          var _diffY = (_dExpV.getTime() - _dIss.getTime()) / (365.25 * 86400000);
          _issueOk = _diffY > 0 && _diffY <= 10.5;
        } else { _issueOk = true; }
      } else { _issueOk = true; }
    }
  }
  // قراءة مرفوضة أو غائبة + الانتهاء معلوم → الاشتقاق الدقيق لجواز مصر:
  // الانتهاء = الإصدار + 7 سنوات − يوم  ⇒  الإصدار = الانتهاء − 7 سنوات + يوم
  if (!_issueOk) {
    issueDateStr = '';
    if (expiryDate) {
      var _dExpD = _parseDmy_(expiryDate);
      if (_dExpD) {
        var _dCalc = new Date(_dExpD.getTime());
        _dCalc.setFullYear(_dCalc.getFullYear() - 7);
        _dCalc.setDate(_dCalc.getDate() + 1);
        issueDateStr = ('0' + _dCalc.getDate()).slice(-2) + '/' + ('0' + (_dCalc.getMonth() + 1)).slice(-2) + '/' + _dCalc.getFullYear();
      }
    }
  }

  // 🛡️ حارس أخير: لو الإصدار > الانتهاء (مستحيل فيزيائياً) فقد جرى تبديلهما — نُعيد ترتيبهما
  // مصدر التبديل الأشهر: OCR يقرأ التسميتين متجاورتين ويُحيل التاريخين لبعضهما
  if (expiryTrusted === false && issueDateStr && expiryDate) {
    var _di = _parseDmy_(issueDateStr), _de = _parseDmy_(expiryDate);
    if (_di && _de && _di.getTime() > _de.getTime()) {
      var _tmp = expiryDate; expiryDate = issueDateStr; issueDateStr = _tmp;
    }
  }
  // حارس ثانٍ: تاريخ الانتهاء في الماضي البعيد (> سنة) = غالباً قراءة خاطئة (الإصدار مُسنَد للانتهاء)
  // لا يوجد جواز صالح للسفر انتهاؤه أقدم من ذلك — نُفرغه بدل بيان مضلّل
  if (expiryTrusted === false && expiryDate) {
    var _dee = _parseDmy_(expiryDate);
    if (_dee && (Date.now() - _dee.getTime()) > 365 * 86400000) {
      expiryDate = '';
    }
  }

  // 🛂 التأشيرات: MRZ التأشيرة (تنسيق TD2 خاص بالسعودية) ليس جواز سفر قانوني — مواضعه الرقمية
  // لا تعني ميلاد/إصدار/انتهاء الجواز إطلاقاً، وقراءتها كذلك كانت تُسجِّل تاريخ ميلاد خاطئاً.
  // "صالحة من/لغاية" على التأشيرة هي مدة صلاحية التأشيرة نفسها، وليست تاريخ انتهاء الجواز —
  // فنُفرغ الحقول الثلاثة صراحة بدل تسجيل بيانات مضلِّلة؛ الموظف يُدخلها يدوياً من الجواز الحقيقي
  if (isVisa) { birthDateStr = ''; issueDateStr = ''; expiryDate = ''; }

  return {
    success: true,
    latinName: latinName || '',
    birthDate: birthDateStr,
    issueDate: issueDateStr,
    name: finalName,
    passport: passportNo,
    type: type,
    docType: isVisa ? 'visa' : 'passport',
    visaType: visaType,
    expiryDate: expiryDate,
    militaryNote: militaryNote
  };
}


/* ============================================================
   🏨 توليد PDF كشف التسكين الفندقي للمشاركة (واتساب/تنزيل)
   نفس نمط مشاركة الإشعار: يرجع pdfBase64 + fileName + downloadUrl
   الـHTML يُبنى في الواجهة (بشعار الشركة) ويُحوَّل هنا لـPDF
   ============================================================ */
function generateHousingPdf(authToken, htmlContent, tripName) {
  requireAuth_(authToken);
  if (!htmlContent) throw new Error("لا يوجد محتوى");

  try {
    // 🏷️ الاسم يصل جاهزاً كاملاً من الواجهة (مثل "تسكين مكة المكرمة — رحلة كذا" أو "ملخص تسكين
    // الرحلات") — كانت البادئة الثابتة 'تسكين رحلة' هنا تمنع تحديد المدينة وتشوّه اسم الملخص المتعدد
    var safeName = String(tripName || "تسكين رحلة").replace(/[\\/:*?"<>|]/g, '-');
    var fileName = safeName + ' - ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    var htmlBlob = Utilities.newBlob(htmlContent, MimeType.HTML, fileName + '.html');
    var pdfBlob = htmlBlob.getAs(MimeType.PDF).setName(fileName + '.pdf');

    var folder = getDriveFolder_('EXPORTS');
    var file = folder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()),
      fileName: fileName,
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId()
    };
  } catch (e) {
    Logger.log('generateHousingPdf ERROR: ' + e);
    throw new Error('فشل إنشاء PDF: ' + e.message);
  }
}


/* ============================================================
   🚻 استنتاج النوع من الاسم الأول العربي — شبكة الأمان الأخيرة
   عندما يعجز المستند والـMRZ عن تحديد النوع (مشكلة متكررة عملياً)
   ============================================================ */
var MALE_NAMES_ = ['محمد','احمد','أحمد','محمود','مصطفى','على','علي','حسن','حسين','ابراهيم','إبراهيم','خالد','عمر','عمرو','طارق','سيد','السيد','يوسف','كريم','وليد','هشام','ماجد','سامح','شريف','عادل','عصام','صلاح','رمضان','جمال','كمال','سعيد','فتحي','فتحى','رجب','شعبان','حمدي','حمدى','صبري','صبرى','ناصر','أشرف','اشرف','هاني','هانى','وائل','ايمن','أيمن','علاء','عاطف','مدحت','نبيل','فؤاد','حازم','باسم','تامر','عماد','يحيى','زياد','مازن','انور','أنور','سعد','فارس','عبده','حمادة','حماده','رضا','عيد','جابر','صابر','منصور','فوزي','فوزى','لطفي','لطفى','مجدي','مجدى','ياسر','نادر','سمير','منير','أمير','امير','بلال','معاذ','عثمان','حمزة','آدم','ادم','مروان','زكريا','اسلام','إسلام','عبدالله','عبدالرحمن','عبدالعزيز','عبدالفتاح','عبدالحميد','عبدالمنعم','عبدالسلام','عبدالناصر','عبدالوهاب','عبدالغني','عبدالحكيم','عبدالمجيد','عبدالرازق','عبدالستار','عبدالمنتصر','عبدالقادر','عبداللطيف','تيم','ادهم','أدهم','ياسين','سليم','عمار','جاسر','باسل','ايهاب','إيهاب'];
var FEMALE_NAMES_ = ['فاطمة','فاطمه','عائشة','عائشه','زينب','مريم','خديجة','خديجه','أمينة','امينة','سعاد','نادية','ناديه','هدى','منى','منال','هالة','هاله','وفاء','صفاء','شيماء','اسماء','أسماء','ايمان','إيمان','امال','آمال','سمر','سحر','نورا','نورة','نوره','رانيا','داليا','دينا','ريهام','شرين','شيرين','نجلاء','علا','غادة','غاده','عبير','حنان','ابتسام','سلوى','ليلى','لبنى','ياسمين','ولاء','والاء','دعاء','اسراء','إسراء','هبة','هبه','رحاب','نهى','نهال','سارة','ساره','امل','أمل','نرمين','نيرة','نيره','مروة','مروه','أميرة','اميرة','اميره','جميلة','جميله','حياة','كريمة','كريمه','سهام','نعمة','نعمه','فايزة','فايزه','عزة','عزه','نجوى','ثريا','صباح','هند','رقية','رقيه','حبيبة','حبيبه','جنى','ملك','روان','رنا','تسنيم','آية','اية','ايه','ايسل','أيسل','هناء','والا','لمى','ليان','جوري','ميرال','تاليا','كنزي','لوجين','جودي','مايا','فريدة','فريده'];

var LATIN_MALE_ = ['MOHAMED','MOHAMMED','MUHAMMAD','AHMED','AHMAD','MAHMOUD','MOSTAFA','MUSTAFA','ALI','ALY','HASSAN','HUSSEIN','IBRAHIM','KHALED','KHALID','OMAR','AMR','TAREK','TARIQ','SAYED','ELSAYED','YOUSSEF','YOUSEF','KARIM','KAREEM','WALID','WALEED','HESHAM','HISHAM','MAGED','SAMEH','SHERIF','ADEL','ESSAM','SALAH','RAMADAN','GAMAL','KAMAL','SAID','SAEED','FATHY','RAGAB','SHAABAN','HAMDY','SABRY','NASSER','ASHRAF','HANY','WAEL','AYMAN','ALAA','ATEF','MEDHAT','NABIL','FOUAD','FUAD','HAZEM','BASSEM','TAMER','EMAD','YEHIA','ZIAD','MAZEN','ANWAR','SAAD','FARES','REDA','EID','GABER','SABER','MANSOUR','FAWZY','LOTFY','MAGDY','YASSER','NADER','SAMIR','MONIR','MOUNIR','AMIR','BILAL','OSMAN','HAMZA','ADAM','MARWAN','ZAKARIA','ESLAM','ISLAM','ABDALLAH','ABDULLAH','TAHA','TAREQ'];
var LATIN_FEMALE_ = ['FATMA','FATIMA','AISHA','AYA','ZEINAB','ZAINAB','MARIAM','MARYAM','KHADIJA','AMINA','SOAD','NADIA','HODA','HUDA','MONA','MANAL','HALA','WAFAA','SAFAA','SHAIMAA','ASMAA','EMAN','IMAN','AMAL','SAMAR','SAHAR','NORA','NOURA','RANIA','DALIA','DINA','REHAM','SHERIN','SHIREEN','NAGLAA','OLA','GHADA','ABEER','HANAN','EBTESAM','SALWA','LAILA','LEILA','LOBNA','YASMIN','YASMINE','WALAA','DOAA','DUAA','ESRAA','ISRAA','HEBA','REHAB','NOHA','NIHAL','SARA','SARAH','NERMIN','NERMEEN','MARWA','AMIRA','HAYAT','KARIMA','SEHAM','FAYZA','AZZA','NAGWA','SABAH','HEND','HIND','ROKAYA','HABIBA','MALAK','RAWAN','RANA','TASNIM','HANAA','NAHLA'];

function _genderFromArabicName_(fullName) {
  var first = String(fullName || '').trim().split(/\s+/)[0] || '';
  if (!first) return '';

  // أسماء لاتينية (من MRZ لما الاسم العربي مش مقروء)
  if (/[A-Za-z]/.test(first)) {
    var fu = first.toUpperCase();
    if (LATIN_MALE_.indexOf(fu) !== -1) return 'M';
    if (LATIN_FEMALE_.indexOf(fu) !== -1) return 'F';
    if (/^ABD/.test(fu)) return 'M'; // ABDEL... مركبة = ذكر
    return '';
  }

  // توحيد: الهمزات، التاء المربوطة، الياء الفارسية، وإسقاط الهمزة المنفردة (ولاء=ولا)
  var norm = function(s) { return s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[یى]/g, 'ي').replace(/ء/g, '').replace(/[،,\.'\"()\-]/g, ''); };
  var nf = norm(first);
  for (var i = 0; i < MALE_NAMES_.length; i++) if (norm(MALE_NAMES_[i]) === nf) return 'M';
  for (var j = 0; j < FEMALE_NAMES_.length; j++) if (norm(FEMALE_NAMES_[j]) === nf) return 'F';
  if (/^عبد/.test(nf)) return 'M';
  return '';
}

// تحويل موحّد: gender/عمر → نوع الكشف، مع الاستنتاج من الاسم لو النوع مفقود
function _resolvePilgrimType_(gender, ageYears, arabicName) {
  if (ageYears !== null && ageYears >= 0 && ageYears < 2) return "رضيع";
  if (ageYears !== null && ageYears >= 2 && ageYears < 12) return "طفل";
  var g = gender || _genderFromArabicName_(arabicName);
  if (g === 'M') return "ذكر";
  if (g === 'F') return "أنثى";
  return "";
}


/* ============================================================
   🔤 تعريب الاسم اللاتيني: قاموس الأسماء المصرية الشائعة أولاً
   (الأسماء المصرية توليفات من مخزون محدود) + نقل صوتي للنادر
   ============================================================ */
var LATIN_AR_DICT_ = {
  // ذكور
  'MOHAMED':'محمد','MOHAMMED':'محمد','MOHAMAD':'محمد','MUHAMMAD':'محمد','AHMED':'احمد','AHMAD':'احمد','MAHMOUD':'محمود','MAHMOD':'محمود','MOSTAFA':'مصطفى','MOUSTAFA':'مصطفى','MUSTAFA':'مصطفى','ALI':'على','ALY':'على','HASSAN':'حسن','HASAN':'حسن','HUSSEIN':'حسين','HUSSIEN':'حسين','HOSSEIN':'حسين','IBRAHIM':'ابراهيم','EBRAHIM':'ابراهيم','KHALED':'خالد','KHALID':'خالد','OMAR':'عمر','AMR':'عمرو','TAREK':'طارق','TARIK':'طارق','TAREQ':'طارق','SAYED':'سيد','ELSAYED':'السيد','YOUSSEF':'يوسف','YOUSEF':'يوسف','YUSUF':'يوسف','KARIM':'كريم','KAREEM':'كريم','WALID':'وليد','WALEED':'وليد','HESHAM':'هشام','HISHAM':'هشام','MAGED':'ماجد','SAMEH':'سامح','SHERIF':'شريف','ADEL':'عادل','ESSAM':'عصام','SALAH':'صلاح','RAMADAN':'رمضان','GAMAL':'جمال','KAMAL':'كمال','SAID':'سعيد','SAEED':'سعيد','FATHY':'فتحي','FATHI':'فتحي','RAGAB':'رجب','SHAABAN':'شعبان','HAMDY':'حمدي','HAMDI':'حمدي','SABRY':'صبري','SABRI':'صبري','NASSER':'ناصر','ASHRAF':'أشرف','HANY':'هاني','HANI':'هاني','WAEL':'وائل','AYMAN':'أيمن','ALAA':'علاء','ATEF':'عاطف','MEDHAT':'مدحت','NABIL':'نبيل','FOUAD':'فؤاد','FUAD':'فؤاد','HAZEM':'حازم','BASSEM':'باسم','BASEM':'باسم','TAMER':'تامر','EMAD':'عماد','YEHIA':'يحيى','YAHIA':'يحيى','ZIAD':'زياد','MAZEN':'مازن','ANWAR':'أنور','SAAD':'سعد','FARES':'فارس','ABDO':'عبده','HAMADA':'حماده','REDA':'رضا','EID':'عيد','GABER':'جابر','SABER':'صابر','MANSOUR':'منصور','FAWZY':'فوزي','FAWZI':'فوزي','LOTFY':'لطفي','LOTFI':'لطفي','MAGDY':'مجدي','MAGDI':'مجدي','YASSER':'ياسر','NADER':'نادر','SAMIR':'سمير','MOUNIR':'منير','MONIR':'منير','AMIR':'أمير','BILAL':'بلال','MOAZ':'معاذ','OSMAN':'عثمان','OTHMAN':'عثمان','HAMZA':'حمزة','ADAM':'آدم','MARWAN':'مروان','ZAKARIA':'زكريا','ISLAM':'اسلام','SOLIMAN':'سليمان','SULIMAN':'سليمان','SELIM':'سليم','SALEM':'سالم','AMER':'عامر','KHALIL':'خليل','ISMAIL':'اسماعيل','ESMAIL':'اسماعيل','METWALLY':'متولى','METWALY':'متولى','NABIH':'نبيه','FAYEZ':'فايز','OMRAN':'عمران','BADAWY':'بدوي','BADAWI':'بدوي','RASHWAN':'رشوان','GOUDA':'جوده','GODA':'جوده','SHARAB':'شراب','NASRALLA':'نصرالله','NASRALLAH':'نصرالله','SHALABY':'شلبي','SHALBY':'شلبي','SHELBY':'شلبي','ABOUZEID':'ابوزيد','ABOZEID':'ابوزيد','ABOUZID':'ابوزيد','RASHAD':'رشاد','FAHMY':'فهمي','FAHMI':'فهمي','SHOUKRY':'شكري','SHOKRY':'شكري','ZAKY':'زكي','ZAKI':'زكي','HELMY':'حلمي','HELMI':'حلمي','KOTB':'قطب','GHANEM':'غانم','HAFEZ':'حافظ','DIAB':'دياب','EMARA':'عماره','SHAHIN':'شاهين','SHAHEEN':'شاهين','HASSANEIN':'حسنين','SEWILAM':'سويلم','SOWEILAM':'سويلم','SWELAM':'سويلم','TAIM':'تيم','TAYM':'تيم','ADHAM':'أدهم','YASSIN':'ياسين','YASEEN':'ياسين','AMMAR':'عمار','GASSER':'جاسر','BASEL':'باسل','EHAB':'ايهاب','IHAB':'ايهاب','SHAWKY':'شوقي','FARAG':'فرج','FARRAG':'فراج','MORSY':'مرسي','MORSI':'مرسي','DESOUKY':'دسوقي','DESOKY':'دسوقي','KHATTAB':'خطاب','SHEHATA':'شحاته','SHHATA':'شحاته','GHONEIM':'غنيم','BAKR':'بكر','BAKRY':'بكري','SROUR':'سرور','MABROUK':'مبروك','BARAKAT':'بركات','SALAMA':'سلامه','SELMY':'سلمي','AWAD':'عوض','AWADALLAH':'عوض الله','GADALLAH':'جاد الله','GAD':'جاد','RIZK':'رزق','NAGY':'ناجي','NAGI':'ناجي','WAHBA':'وهبه','HABIB':'حبيب','AZAB':'عزب','ASHOUR':'عاشور','AMIN':'أمين','AMEEN':'أمين','ZAYED':'زايد','ZAID':'زيد','SHAKER':'شاكر','SHOKR':'شكر','MOUSA':'موسى','MOSA':'موسى','MOUSSA':'موسى','HAROUN':'هارون','DAWOUD':'داود','DAOUD':'داود','SULTAN':'سلطان','SOLTAN':'سلطان','HEGAZY':'حجازي','HEGAZI':'حجازي','SHARKAWY':'شرقاوي','BELTAGY':'بلتاجي','KHODARY':'خضري','KHEDR':'خضر','KHIDR':'خضر','TAHA':'طه','HHER':'',
  // مركبات عبد
  'ABDALLA':'عبدالله','ABDALLAH':'عبدالله','ABDULLAH':'عبدالله','ABDELRAHMAN':'عبدالرحمن','ABDELRAHMAN':'عبدالرحمن','ABDELAZIZ':'عبدالعزيز','ABDELFATTAH':'عبدالفتاح','ABDELHAMID':'عبدالحميد','ABDELMONEM':'عبدالمنعم','ABDELSALAM':'عبدالسلام','ABDELNASSER':'عبدالناصر','ABDELWAHAB':'عبدالوهاب','ABDELGHANY':'عبدالغني','ABDELGHANI':'عبدالغني','ABDELHAKIM':'عبدالحكيم','ABDELMAGID':'عبدالمجيد','ABDELMEGID':'عبدالمجيد','ABDELMEGUID':'عبدالمجيد','ABDELRAZEK':'عبدالرازق','ABDELRAZIK':'عبدالرازق','ABDELSATTAR':'عبدالستار','ABDELMONTASER':'عبدالمنتصر','ABDELKADER':'عبدالقادر','ABDELLATIF':'عبداللطيف','ABDELGHAFFAR':'عبدالغفار','ABDELHAFIZ':'عبدالحفيظ','ABDELHALIM':'عبدالحليم','ABDELAAL':'عبدالعال','ABDELAL':'عبدالعال','ABDELMAKSOUD':'عبدالمقصود','ABDRABO':'عبدربه','ABDELDAYEM':'عبدالدايم','ABDELGAWAD':'عبدالجواد','ABDELMAWLA':'عبدالمولى','ABDELAATY':'عبدالعاطي','ABDELATY':'عبدالعاطي',
  // إناث
  'FATMA':'فاطمه','FATIMA':'فاطمه','AISHA':'عائشه','AYSHA':'عائشه','ZEINAB':'زينب','ZAINAB':'زينب','MARIAM':'مريم','MARYAM':'مريم','KHADIGA':'خديجه','AMINA':'أمينه','SOAD':'سعاد','SOUAD':'سعاد','NADIA':'ناديه','HODA':'هدى','HUDA':'هدى','MONA':'منى','MANAL':'منال','HALA':'هاله','WAFAA':'وفاء','SAFAA':'صفاء','SHAIMAA':'شيماء','SHIMAA':'شيماء','ASMAA':'اسماء','EMAN':'ايمان','IMAN':'ايمان','AMAL':'امال','SAMAR':'سمر','SAHAR':'سحر','NOURA':'نوره','NORA':'نورا','RANIA':'رانيا','DALIA':'داليا','DINA':'دينا','REHAM':'ريهام','SHEREEN':'شيرين','SHIRIN':'شيرين','NAGLAA':'نجلاء','OLA':'علا','GHADA':'غاده','ABEER':'عبير','HANAN':'حنان','EBTESAM':'ابتسام','SALWA':'سلوى','LAILA':'ليلى','LAYLA':'ليلى','LOBNA':'لبنى','YASMIN':'ياسمين','YASMEEN':'ياسمين','WALAA':'ولاء','DOAA':'دعاء','ESRAA':'اسراء','ISRAA':'اسراء','HEBA':'هبه','REHAB':'رحاب','NOHA':'نهى','NAHLA':'نهله','SARA':'ساره','SARAH':'ساره','NERMIN':'نرمين','NERMEEN':'نرمين','MARWA':'مروه','AMIRA':'أميره','SEHAM':'سهام','NEAMA':'نعمه','FAYZA':'فايزه','AZZA':'عزه','NAGWA':'نجوى','SABAH':'صباح','HEND':'هند','ROKAYA':'رقيه','HABIBA':'حبيبه','GANA':'جنى','JANA':'جنى','MALAK':'ملك','RAWAN':'روان','RANA':'رنا','TASNIM':'تسنيم','TASNEEM':'تسنيم','AYA':'آيه','ESMAT':'عصمت','HANAA':'هناء','NADA':'ندا','AISEL':'ايسل','AYSEL':'ايسل','ATTIA':'عطيه','ATIA':'عطيه','ATTEYA':'عطيه','EBADA':'عباده','ABADA':'عباده','NASHWA':'نشوى','SOMAYA':'سميه','SOMIA':'سميه','KARIMA':'كريمه','GAMILA':'جميله','THANAA':'ثناء','SANAA':'سناء','HAYAM':'هيام','ENAS':'ايناس','INAS':'ايناس','GHALIA':'غاليه','FERIAL':'فريال','NAIMA':'نعيمه','ZOBAIDA':'زبيده','HAMIDA':'حميده',
  // أسماء وألقاب من جوازات حقيقية فشل تعريبها سابقاً
  'FAIZA':'فايزه','FAYZA':'فايزه','SOHIR':'سهير','SOHEIR':'سهير','SOHAIR':'سهير','BOTHAINA':'بثينه','BOSSAINA':'بثينه',
  'SOUMAIA':'سوميه','SOMAIA':'سوميه','SOUMAYA':'سوميه','AMINA':'أمينه','AMNA':'آمنه','GHAFRAH':'غفره','GHOFRAH':'غفره',
  'SABAH':'صباح','MERFAT':'مرفت','MERVAT':'مرفت','MIRFAT':'مرفت','FREGA':'فريجه','FARIDA':'فريده','SALMA':'سالمه',
  'ELMETWALLY':'المتولى','SOBIH':'صبيح','SOBHI':'صبحي','OMEISH':'عميش','MOSLEH':'مصلح','MESLEH':'مصلح',
  'ELSAYED':'السيد','ELSAID':'السيد','GABRIEL':'جبريل','GEBRIL':'جبريل','GIBRIL':'جبريل','DIAB':'دياب',
  'OMELNASR':'ام النصر','HEMIDAN':'حميدان','SEWELAM':'سويلم','ATTIA':'عطيه','ATTWA':'عطوه','SOBHIA':'صبحيه',
  'HAMDA':'حمده','HAMAD':'حماد','SAWSAN':'سوسن','HOWISHEL':'هويشل','MESALLAM':'مسلم','ATTIATALLA':'عطيه الله',
  'ABOUELMAATY':'ابو المعاطى','GHANEM':'غانم','AWAD':'عوض','AWADA':'عواده','OUDA':'عوده','MOUSTAFA':'مصطفى'
};

// نقل صوتي للكلمات غير الموجودة بالقاموس (ثنائيات الحروف أولاً)
function _transliterateWord_(w) {
  var s = String(w).toUpperCase();
  var digraphs = [['SH','ش'],['KH','خ'],['GH','غ'],['TH','ث'],['DH','ذ'],['PH','ف'],['OU','و'],['OO','و'],['EE','ي'],['AA','ا'],['EI','ي'],['AI','اي'],['EY','ي'],['CH','تش']];
  for (var i = 0; i < digraphs.length; i++) {
    s = s.split(digraphs[i][0]).join('\u0000' + i + '\u0000');
  }
  var singles = { 'A':'ا','B':'ب','C':'ك','D':'د','E':'ي','F':'ف','G':'ج','H':'ه','I':'ي','J':'ج','K':'ك','L':'ل','M':'م','N':'ن','O':'و','P':'ب','Q':'ق','R':'ر','S':'س','T':'ت','U':'و','V':'ف','W':'و','X':'كس','Y':'ي','Z':'ز' };
  var out = '';
  for (var c = 0; c < s.length; c++) {
    var ch = s.charAt(c);
    if (ch === '\u0000') {
      var end = s.indexOf('\u0000', c + 1);
      out += digraphs[parseInt(s.substring(c + 1, end), 10)][1];
      c = end;
    } else {
      out += singles[ch] || '';
    }
  }
  return out;
}

// الاسم اللاتيني الكامل → عربي: قاموس لكل كلمة، والنقل الصوتي للنادر فقط
// حارس جودة: لو أقل من نصف الكلمات معروفة بالقاموس فالمدخل غالباً MRZ مشوّه — لا تعريب
// 🔧 كلمة مجهولة قد تكون كلمتين لُصقتا بحرف K (< مقروءة K في الـMRZ):
// MOUSTAFAKALI = MOUSTAFA + ALI — نجرب كل موضع K ولو الشطران معروفان بالقاموس نفكّها
function _splitFusedByK_(w) {
  for (var i = 3; i < w.length - 2; i++) {
    if (w.charAt(i) !== 'K') continue;
    var left = w.substring(0, i), right = w.substring(i + 1);
    if (LATIN_AR_DICT_[left] && LATIN_AR_DICT_[right]) {
      return LATIN_AR_DICT_[left] + ' ' + LATIN_AR_DICT_[right];
    }
  }
  return '';
}
// 🔧 كلمة مبتورة (سطر MRZ مقصوص): AHM = بداية AHMED/AHMAD — لو كل مفاتيح القاموس
// التي تبدأ بها تُجمِع على نفس العربي، نعتمدها
function _dictPrefixMatch_(w) {
  if (w.length < 3) return '';
  var found = '';
  for (var k in LATIN_AR_DICT_) {
    if (k.length > w.length && k.substring(0, w.length) === w) {
      var v = LATIN_AR_DICT_[k];
      if (!v) continue;
      if (found && found !== v) return ''; // مفاتيح متعارضة — لا نخمّن
      found = v;
    }
  }
  return found;
}

function _latinToArabicName_(latinName) {
  if (!latinName) return '';
  var words = String(latinName).toUpperCase().split(/\s+/).filter(Boolean);
  var out = [], dictHits = 0, counted = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i].replace(/[^A-Z]/g, '');
    if (!w) continue;
    counted++;
    var ar = LATIN_AR_DICT_[w];
    if (ar === '') continue; // مدخلات محذوفة عمداً
    if (!ar) {
      // إنقاذ الكلمات الملتصقة بـK والمبتورة قبل اللجوء للنقل الصوتي
      ar = _splitFusedByK_(w) || _dictPrefixMatch_(w);
      if (ar) dictHits++;
    } else {
      dictHits++;
    }
    if (!ar && w.length > 13) return ''; // كلمة ملتصقة غير قابلة للفك — لا نعرّب قمامة
    out.push(ar || _transliterateWord_(w));
  }
  if (!counted || dictHits < Math.ceil(counted / 2)) return '';
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
/* ==================================================================================
   🏛️ (V4.106) شاشة «مراجعة ملفات الوزارة»
   ملفات مراجعة بوابة العمرة الإلكترونية: بيانات الملف والشركة والوكيل والمشرفين
   والمعتمرين والتسعير والسكن + سجل المشرفين + إيصالات رسوم الغرفة وحركتها.
   المعادلات مطابقة تماماً لملف «ملفات عمرة 1448هـ» (المخالصة بالريال معادلة عكسية).
   ================================================================================== */

var MF_SHEET = 'MinistryFiles';
var MF_HEADERS = [
  'معرف الملف','مسلسل','رقم الملف','معتمد','فاتورة إلكترونية','القيد',
  'الشركة المصرية','الوكيل السعودي','تاريخ المراجعة','نوع المراجعة','سبب VIP اليدوي','وسيلة السفر',
  'العميل','بنود العميل (JSON)','الرحلة المرتبطة','تاريخ الذهاب','تاريخ العودة',
  'معتمرين','مشرفين','المشرفون (JSON)',
  'سعر البرنامج','التذكرة','رسوم الغرفة للفرد','رسوم إدارية للفرد','النسبة','سعر صرف الريال',
  'فندق المدينة','دخول المدينة','خروج المدينة','فندق مكة','دخول مكة','خروج مكة',
  'شركة النقل','ملاحظات','المعتمرون المختارون (JSON)',
  'أنشئ بواسطة','أنشئ في','عُدّل بواسطة','عُدّل في'
];

var MF_SUP_SHEET = 'MinistrySupervisors';
var MF_SUP_HEADERS = [
  'اسم المشرف','النوع','الشركة الأساسية','شركات المشاركة','رقم الجوال','ملاحظات',
  'أنشئ بواسطة','أنشئ في','عُدّل بواسطة','عُدّل في'
];

var MF_REC_SHEET = 'RoomFeeReceipts';
var MF_REC_HEADERS = [
  'رقم الإيصال','التاريخ','الوقت','الشركة','رقم الترخيص','المبلغ','اسم المودع','المصدر','ملاحظات',
  'أنشئ بواسطة','أنشئ في'
];

// أسماء الحقول للسجل (تُستخدم في سجل التعديلات لكل ملف)
var MF_FIELD_LABELS_ = {
  fileNo:'رقم الملف', approved:'الاعتماد', eInvoice:'فاتورة إلكترونية', ref:'القيد',
  company:'الشركة المصرية', agent:'الوكيل السعودي', reviewDate:'تاريخ المراجعة',
  reviewType:'نوع المراجعة', vipReason:'سبب VIP اليدوي', travelMode:'وسيلة السفر',
  clientLabel:'العميل', tripName:'الرحلة المرتبطة', goDate:'تاريخ الذهاب', retDate:'تاريخ العودة',
  pilgrims:'عدد المعتمرين', supCount:'عدد المشرفين', progPrice:'سعر البرنامج', ticket:'سعر التذكرة',
  roomFee:'رسوم الغرفة للفرد', adminFee:'رسوم إدارية للفرد', pct:'النسبة', fxRate:'سعر صرف الريال',
  madinahHotel:'فندق المدينة', madinahIn:'دخول المدينة', madinahOut:'خروج المدينة',
  makkahHotel:'فندق مكة', makkahIn:'دخول مكة', makkahOut:'خروج مكة',
  transport:'شركة النقل', notes:'ملاحظات', breakdown:'بنود العميل', sups:'المشرفون',
  selected:'المعتمرون المختارون'
};

/* ---------- صلاحية الشاشة ---------- */
function _mfPerm_(authToken, cap) {
  var session = requireAuth_(authToken);
  if (_sessionHasPerm_(session, 'ministry.' + cap)) return session;
  throw new Error('لا تملك صلاحية ' + ({view:'عرض',add:'إضافة',edit:'تعديل',delete:'حذف'}[cap] || cap) + ' مراجعة ملفات الوزارة');
}

/* ---------- أدوات مساعدة ---------- */
// تطبيع الأرقام العربية/الفارسية إلى لاتينية (يُطبَّق على كل مُدخل نصّي قادم من الموبايل)
function _mfLatin_(s) {
  return String(s == null ? '' : s)
    .replace(/[٠-٩]/g, function(d) { return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48); })
    .replace(/[۰-۹]/g, function(d) { return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48); })
    .replace(/٫/g, '.').replace(/٬/g, ',');
}
function _mfStr_(v) { return _mfLatin_(v).trim(); }
function _mfNum_(v) { var n = parseFloat(_mfLatin_(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }

// تاريخ إلى dd/mm/yyyy — يقبل Date أو نص بأي فاصل، ويكمل السنة الحالية لو غابت
function _mfDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy');
  }
  var s = _mfStr_(v).replace(/[-.\\]/g, '/');
  if (!s) return '';
  var p = s.split('/').filter(function(x) { return x !== ''; });
  if (p.length < 2) return '';
  var d = p[0].replace(/\D/g, ''), m = p[1].replace(/\D/g, ''), y = (p[2] || '').replace(/\D/g, '');
  if (!d || !m) return '';
  if (!y) y = String(new Date().getFullYear());
  else if (y.length === 2) y = '20' + y;
  if (y.length !== 4) return '';
  if (d.length === 1) d = '0' + d;
  if (m.length === 1) m = '0' + m;
  return d + '/' + m + '/' + y;
}
function _mfMs_(dmy) {
  var m = String(dmy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : NaN;
}
function _mfToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy');
}
function _mfStamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm');
}
// 🕓 (V4.111) خانات الإنشاء/آخر تعديل تُخزَّن كنص «dd/MM/yyyy HH:mm»، لكن جوجل شيت يحوّلها تلقائياً
// إلى كائن Date، فكان _mfStr_ يُخرجها بالشكل الخام (Tue Sep 08 2026 23:57:00 GMT+0300 …) كما ظهر
// للمستخدم بعمودَي الإنشاء والتعديل. هذه الدالة تُعيدها دائماً بالصيغة المطلوبة.
function _mfDateTime_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm');
  }
  var s = _mfStr_(v);
  if (!s) return '';
  // نص خام من متصفح/تاريخ JS (Tue Sep 08 2026 23:57:00 GMT+0300 …) → صيغة موحّدة
  if (/^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d/.test(s)) {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm');
    }
  }
  return s;
}
// وقت الإيصال — يقبل Date (يحوّله لصيغة 12 ساعة) أو نصاً كما هو
function _mfTime_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Riyadh', 'hh:mm a');
  }
  return _mfStr_(v);
}
function _mfJson_(v, fallback) {
  try { var o = JSON.parse(String(v || '')); return o || fallback; } catch (e) { return fallback; }
}
// يوم الأسبوع: 5 = جمعة، 6 = سبت
function _mfDow_(dmy) {
  var t = _mfMs_(dmy);
  return isNaN(t) ? -1 : new Date(t).getDay();
}
// نسبة الربح الافتراضية: من 3.00% تنازلياً حتى 2.50% عند 120 معتمر فأكثر، برقمين عشريين
function _mfDefaultPct_(pilgrims) {
  var n = Math.max(0, Math.min(120, Number(pilgrims) || 0));
  var base = 3.00 - (n / 120) * 0.5;
  var jitter = (Math.random() - 0.5) * 0.04;
  var v = Math.max(2.50, Math.min(3.00, base + jitter));
  return Math.round(v * 100) / 100;
}
// رسوم تجديد الباركود السارية في تاريخ معيّن
function _mfBarcodeFeeAt_(dateStr) {
  var t = _mfMs_(_mfDate_(dateStr));
  if (isNaN(t)) return 0;
  var periods = (_accPricing_().barcodePeriods) || [];
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    var fromMs = _mfMs_(_mfDate_(p.from));
    if (isNaN(fromMs)) continue;
    var toMs = p.to ? _mfMs_(_mfDate_(p.to)) : 8640000000000000;
    if (isNaN(toMs)) toMs = 8640000000000000;
    if (t >= fromMs && t <= toMs) return _mfNum_(p.price);
  }
  return 0;
}

/* ---------- محرك الحسابات (مطابق لمعادلات ملف عمرة 1448هـ) ----------
   U = ROUND( (Q − R*(N+O) − (N*S + مرافقون*رسوم مشرف) − T*(N+O) − Q*AC) / (N+O) / V , 0 )
   حيث Q=الإيراد، R=التذكرة، S=رسوم غرفة المعتمر، T=رسوم إدارية، V=سعر الريال، AC=النسبة
------------------------------------------------------------------- */
function _mfCompute_(f, cfg) {
  cfg = cfg || _accPricing_();
  var N = _mfNum_(f.pilgrims);
  var sups = Array.isArray(f.sups) ? f.sups : [];
  // 🧑‍✈️ (V4.113) المشرف «مرافق» فقط يُحتسب ضمن عدد المشرفين وله رسوم غرفة — «استقبال» (سواء
  // مشرف فعلي أو الوكيل السعودي نفسه) لا يُحسب أصلاً: لا رسوم غرفة ولا مخالصة ولا يدخل ضمن الأعداد.
  var murafiq = sups.filter(function(s) { return String(s.type || '').indexOf('مرافق') >= 0; }).length;
  var O = murafiq;
  var heads = N + O;
  // 🏛️ (V4.113) رسوم غرفة المراجعة VIP إجمالي ثابت للفرد (من الإعدادات — افتراضياً 3,100 ج)،
  // وليست رسوم الغرفة المسجَّلة + 100 ج كما كان سابقاً. لا تُطبَّق إطلاقاً على تجديد الباركود
  // (نوعا المراجعة متنافيان أصلاً).
  // 🏛️ (V4.115) قاعدة إضافية: الملف الذي عدد معتمريه أقل من 4 أفراد تُحتسب له رسوم غرفة VIP
  // أيضاً (بغضّ النظر عن نوع المراجعة) — عدا تجديد الباركود الذي له تسعيره الخاص.
  var vipByCount = (N > 0 && N < 4 && f.reviewType !== 'تجديد باركود');
  var S = (f.reviewType === 'VIP' || vipByCount) ? (_mfNum_(cfg.vipRoomFee) || 3100) : _mfNum_(f.roomFee);
  var supFee = _mfNum_(cfg.supRoomFee) || 200;
  var R = _mfNum_(f.ticket), T = _mfNum_(f.adminFee), V = _mfNum_(f.fxRate);
  var AC = _mfNum_(f.pct) / 100;
  var barcode = (f.reviewType === 'تجديد باركود') ? _mfBarcodeFeeAt_(f.reviewDate) * N : 0;

  var Q = N * _mfNum_(f.progPrice);                          // الإيراد
  var W = R * heads;                                         // إجمالي التذاكر
  var X = (N * S) + (murafiq * supFee);                      // إجمالي رسوم الغرفة
  var Z = T * heads;                                         // مصروفات أخرى
  var U = 0;
  if (heads > 0 && V > 0) U = Math.round((Q - W - X - Z - (Q * AC) - barcode) / heads / V);
  var Y = U * heads;                                         // إجمالي الريال
  var AA = (Y * V) + W + X + Z + barcode;                    // إجمالي المصروف
  var AB = Q - AA;                                           // هامش الربح
  var AL = N > 0 ? (AB / N) : 0;                             // هامش الفرد

  return {
    heads: heads, murafiq: murafiq, roomFeeEffective: S, supRoomFee: supFee, barcodeFee: barcode,
    vipByCount: vipByCount,
    revenue: Q, totalTickets: W, totalRoomFee: X, otherExp: Z,
    clearanceSAR: U, totalSAR: Y, totalExp: Math.round(AA), margin: Math.round(AB),
    perPersonMargin: Math.round(AL)
  };
}

// 🧾 (V4.111) تفاصيل حساب رسوم الغرفة بين قوسين داخل بيان كشف الحركة — مثل:
// «42 × 3,000 ج + 1 مشرف × 200 ج» أو مع زيادة VIP ورسوم تجديد الباركود
function _mfRoomFeeDetail_(f, c) {
  c = c || _mfCompute_(f);
  var fmt = function(n) { return (Math.round(Number(n) || 0)).toLocaleString('en-US'); };
  var N = _mfNum_(f.pilgrims);
  var parts = [];
  if (N > 0) {
    parts.push(N + ' × ' + fmt(c.roomFeeEffective) + ' ج' +
      (f.reviewType === 'VIP' ? ' (سعر VIP)' : (c.vipByCount ? ' (سعر VIP — أقل من 4 أفراد)' : '')));
  }
  if (c.murafiq > 0) parts.push(c.murafiq + ' مشرف × ' + fmt(c.supRoomFee) + ' ج');
  if (c.barcodeFee > 0) parts.push(N + ' باركود × ' + fmt(c.barcodeFee / (N || 1)) + ' ج');
  return parts.length ? parts.join(' + ') : '';
}

/* ---------- فحص قواعد العمل ---------- */
function _mfRules_(f, allFiles, balances) {
  var out = [];
  var c = _mfCompute_(f);
  var sups = Array.isArray(f.sups) ? f.sups : [];
  var reviewed = !!_mfStr_(f.reviewDate);
  var hasFileNo = !!_mfStr_(f.fileNo);

  // 🧑‍✈️ (V4.113) المشرف الذي يطابق اسمه الوكيل السعودي = لا يوجد مشرف أصلاً — لا تُطبَّق عليه
  // أي قاعدة من قواعد المشرفين إطلاقاً (لا حد الـ50 ولا شرط عودة الاستقبال).
  var agentName = _mfStr_(f.agent);

  // 1) حد المشرف المرافق: 50 معتمر إجمالاً على الملفات المتطابقة في تاريخي السفر والعودة
  sups.forEach(function(s) {
    if (String(s.type || '').indexOf('مرافق') < 0) return;
    if (agentName && _mfStr_(s.name) === agentName) return;
    var total = 0;
    (allFiles || []).forEach(function(o) {
      if (o.id === f.id) return;
      if (_mfStr_(o.goDate) !== _mfStr_(f.goDate) || _mfStr_(o.retDate) !== _mfStr_(f.retDate)) return;
      (o.sups || []).forEach(function(os) { if (_mfStr_(os.name) === _mfStr_(s.name)) total += _mfNum_(o.pilgrims); });
    });
    total += _mfNum_(f.pilgrims);
    if (total > 50) {
      out.push({ level:'warn', code:'SUP50',
        msg:'المشرف «' + s.name + '» (مرافق) مُسند إليه ' + total + ' معتمر على الملفات المتطابقة في تاريخي السفر والعودة — الحد الأقصى 50 معتمر إجمالاً.' });
    }
  });

  // 2) مشرف الاستقبال: تاريخ سفر الملف يجب أن يكون في يوم عودته من رحلته الحالية أو بعده
  sups.forEach(function(s) {
    if (String(s.type || '').indexOf('استقبال') < 0) return;
    if (agentName && _mfStr_(s.name) === agentName) return;
    var busy = _mfStr_(s.busyTo);
    if (!busy) return;
    var g = _mfMs_(_mfStr_(f.goDate)), b = _mfMs_(busy);
    if (!isNaN(g) && !isNaN(b) && g < b) {
      out.push({ level:'warn', code:'RECEP',
        msg:'مشرف الاستقبال «' + s.name + '» لم يعد بعد من رحلته الحالية (عودته ' + busy + ') وتاريخ سفر هذا الملف ' + f.goDate + '.' });
    }
  });

  // 3) منطقية تواريخ السكن
  var g = _mfMs_(_mfStr_(f.goDate)), r = _mfMs_(_mfStr_(f.retDate));
  [['madinahIn','madinahOut','المدينة'], ['makkahIn','makkahOut','مكة']].forEach(function(p) {
    var i = _mfMs_(_mfStr_(f[p[0]])), o = _mfMs_(_mfStr_(f[p[1]]));
    if (!isNaN(i) && !isNaN(o) && o <= i) {
      out.push({ level:'warn', code:'HDATE', msg:'تاريخ الخروج من سكن ' + p[2] + ' يجب أن يكون بعد تاريخ الدخول.' });
    }
    [[i, 'دخول'], [o, 'خروج']].forEach(function(x) {
      if (isNaN(x[0])) return;
      if (!isNaN(g) && x[0] < g) out.push({ level:'warn', code:'HRANGE', msg:'تاريخ ' + x[1] + ' سكن ' + p[2] + ' قبل تاريخ الذهاب.' });
      if (!isNaN(r) && x[0] > r) out.push({ level:'warn', code:'HRANGE', msg:'تاريخ ' + x[1] + ' سكن ' + p[2] + ' بعد تاريخ العودة.' });
    });
  });

  // 4) مطابقة إجمالي بنود العميل مع عدد المعتمرين
  var bd = Array.isArray(f.breakdown) ? f.breakdown : [];
  if (bd.length) {
    var sum = bd.reduce(function(a, b) { return a + _mfNum_(b.count); }, 0);
    if (sum !== _mfNum_(f.pilgrims)) {
      out.push({ level:'warn', code:'CLISUM', msg:'إجمالي بنود العميل (' + sum + ') لا يطابق عدد المعتمرين (' + _mfNum_(f.pilgrims) + ').' });
    }
  }

  // 5) رصيد رسوم الغرفة — التنبيه يظهر عند تسجيل رقم الملف، وهو غير مانع
  if (hasFileNo && !reviewed && balances) {
    var bal = _mfNum_((balances[_mfStr_(f.company)] || {}).balance);
    if (c.totalRoomFee > bal) {
      out.push({ level:'warn', code:'NOBAL',
        msg:'رصيد رسوم الغرفة لشركة «' + f.company + '» (' + bal + ') لا يكفي المطلوب لهذا الملف (' + c.totalRoomFee + ') — تنبيه غير مانع، السحب يتم عند تسجيل تاريخ المراجعة.' });
    }
  }

  // 6) سفر خلال 3 أيام أو أقل ولم تتم المراجعة
  if (!reviewed && !isNaN(g)) {
    var days = Math.ceil((g - _mfMs_(_mfToday_())) / 86400000);
    if (days <= 3 && days >= 0) {
      out.push({ level:'warn', code:'URGENT', msg:'السفر بعد ' + days + ' يوم ولم تتم المراجعة بعد — نوع المراجعة الافتراضي VIP.' });
    }
  }
  return out;
}

// نوع المراجعة التلقائي: VIP لو تاريخ المراجعة جمعة/سبت أو لو تبقّى أقل من 3 أيام على السفر
// (الإجازات الرسمية والمراجعة بعد 4 عصراً يحدّدها الموظف يدوياً — لا يمكن للنظام استنتاجها)
function _mfAutoReviewType_(reviewDate, goDate, current) {
  if (current === 'تجديد باركود') return current;
  var d = _mfDate_(reviewDate);
  if (d) {
    var dow = _mfDow_(d);
    if (dow === 5 || dow === 6) return 'VIP';
    var g = _mfMs_(_mfDate_(goDate));
    if (!isNaN(g)) {
      var diff = Math.ceil((g - _mfMs_(d)) / 86400000);
      if (diff <= 3 && diff >= 0) return 'VIP';
    }
  }
  return current === 'VIP' ? 'VIP' : 'عادية'; // VIP اليدوي يبقى كما اختاره الموظف
}

/* ---------- قراءة/كتابة صفوف الشيت ---------- */
function _mfRowToObj_(r) {
  return {
    id: _mfStr_(r[0]), seq: _mfNum_(r[1]), fileNo: _mfStr_(r[2]),
    approved: (_mfStr_(r[3]) === 'نعم'), eInvoice: _mfStr_(r[4]), ref: _mfStr_(r[5]),
    company: _mfStr_(r[6]), agent: _mfStr_(r[7]),
    reviewDate: _mfDate_(r[8]), reviewType: _mfStr_(r[9]) || 'عادية', vipReason: _mfStr_(r[10]),
    travelMode: _mfStr_(r[11]) || 'طيران',
    clientLabel: _mfStr_(r[12]), breakdown: _mfJson_(r[13], []), tripName: _mfStr_(r[14]),
    goDate: _mfDate_(r[15]), retDate: _mfDate_(r[16]),
    pilgrims: _mfNum_(r[17]), supCount: _mfNum_(r[18]), sups: _mfJson_(r[19], []),
    progPrice: _mfNum_(r[20]), ticket: _mfNum_(r[21]), roomFee: _mfNum_(r[22]),
    adminFee: _mfNum_(r[23]), pct: _mfNum_(r[24]), fxRate: _mfNum_(r[25]),
    madinahHotel: _mfStr_(r[26]), madinahIn: _mfDate_(r[27]), madinahOut: _mfDate_(r[28]),
    makkahHotel: _mfStr_(r[29]), makkahIn: _mfDate_(r[30]), makkahOut: _mfDate_(r[31]),
    transport: _mfStr_(r[32]), notes: _mfStr_(r[33]), selected: _mfJson_(r[34], []),
    createdBy: _mfStr_(r[35]), createdAt: _mfDateTime_(r[36]),
    updatedBy: _mfStr_(r[37]), updatedAt: _mfDateTime_(r[38])
  };
}
function _mfObjToRow_(f) {
  return [
    f.id, f.seq, f.fileNo, (f.approved ? 'نعم' : 'لا'), f.eInvoice, f.ref,
    f.company, f.agent, f.reviewDate, f.reviewType, f.vipReason, f.travelMode,
    f.clientLabel, JSON.stringify(f.breakdown || []), f.tripName, f.goDate, f.retDate,
    f.pilgrims, f.supCount, JSON.stringify(f.sups || []),
    f.progPrice, f.ticket, f.roomFee, f.adminFee, f.pct, f.fxRate,
    f.madinahHotel, f.madinahIn, f.madinahOut, f.makkahHotel, f.makkahIn, f.makkahOut,
    f.transport, f.notes, JSON.stringify(f.selected || []),
    f.createdBy, f.createdAt, f.updatedBy, f.updatedAt
  ];
}
function _mfNextSeq_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var next = (parseInt(props.getProperty('MF_SEQ_CTR'), 10) || 0) + 1;
    props.setProperty('MF_SEQ_CTR', String(next));
    return next;
  } finally { lock.releaseLock(); }
}
function _mfReadAll_() {
  var sh = _accSheet_(MF_SHEET, MF_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, MF_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!_mfStr_(vals[i][0])) continue;
    var o = _mfRowToObj_(vals[i]);
    o._row = i + 2;
    out.push(o);
  }
  return out;
}

/* ---------- إيصالات رسوم الغرفة ---------- */
function _mfReadReceipts_() {
  var sh = _accSheet_(MF_REC_SHEET, MF_REC_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, MF_REC_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!_mfStr_(vals[i][0]) && !_mfStr_(vals[i][3])) continue;
    out.push({
      receiptNo: _mfStr_(vals[i][0]), date: _mfDate_(vals[i][1]), time: _mfTime_(vals[i][2]),
      company: _mfStr_(vals[i][3]), licence: _mfStr_(vals[i][4]), amount: _mfNum_(vals[i][5]),
      depositor: _mfStr_(vals[i][6]), source: _mfStr_(vals[i][7]) || 'يدوي', notes: _mfStr_(vals[i][8]),
      createdBy: _mfStr_(vals[i][9]), createdAt: _mfDateTime_(vals[i][10]), _row: i + 2
    });
  }
  return out;
}
// الرصيد لكل شركة: الإيداعات − المسحوب للملفات التي سُجِّل لها تاريخ مراجعة
function _mfBalances_(files, receipts) {
  var cfg = _accPricing_();
  var bal = {};
  function slot(c) {
    if (!bal[c]) bal[c] = { company: c, deposits: 0, withdrawn: 0, balance: 0, pending: 0 };
    return bal[c];
  }
  (receipts || []).forEach(function(x) { slot(x.company).deposits += _mfNum_(x.amount); });
  (files || []).forEach(function(f) {
    var amt = _mfCompute_(f, cfg).totalRoomFee;
    var s = slot(_mfStr_(f.company));
    if (_mfStr_(f.reviewDate)) s.withdrawn += amt; else s.pending += amt;
  });
  Object.keys(bal).forEach(function(k) { bal[k].balance = bal[k].deposits - bal[k].withdrawn; });
  return bal;
}
// كشف حركة رسوم الغرفة (إيداعات + سحوبات) مرتّب زمنياً مع الرصيد بعد كل حركة
function getRoomFeeLedger(authToken, company) {
  _mfPerm_(authToken, 'view');
  var files = _mfReadAll_(), receipts = _mfReadReceipts_(), cfg = _accPricing_();
  var mv = [];
  receipts.forEach(function(x) {
    mv.push({ date: x.date, ms: _mfMs_(x.date), company: x.company,
      desc: 'إيداع إيصال رقم ' + x.receiptNo + (x.depositor ? ' — ' + x.depositor : ''),
      inn: _mfNum_(x.amount), out: 0 });
  });
  files.forEach(function(f) {
    if (!_mfStr_(f.reviewDate)) return;
    var c = _mfCompute_(f, cfg);
    mv.push({ date: f.reviewDate, ms: _mfMs_(f.reviewDate), company: f.company,
      desc: 'سحب رسوم غرفة — ملف رقم ' + (f.fileNo || '—') + (f.clientLabel ? ' (' + f.clientLabel + ')' : ''),
      detail: _mfRoomFeeDetail_(f, c),
      inn: 0, out: c.totalRoomFee });
  });
  var comp = _mfStr_(company);
  if (comp && comp !== 'الكل') mv = mv.filter(function(m) { return m.company === comp; });
  mv.sort(function(a, b) { return (isNaN(a.ms) ? 0 : a.ms) - (isNaN(b.ms) ? 0 : b.ms); });
  var run = {};
  mv.forEach(function(m) {
    run[m.company] = (run[m.company] || 0) + m.inn - m.out;
    m.balance = run[m.company];
  });
  return { success: true, moves: mv };
}

function saveRoomFeeReceipt(authToken, rec) {
  var session = _mfPerm_(authToken, 'add');
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (e) { return { success: false, error: 'الشيت مشغول بعملية حفظ أخرى — أعد المحاولة بعد لحظات' }; }
  try {
    var sh = _accSheet_(MF_REC_SHEET, MF_REC_HEADERS);
    var no = _mfStr_(rec && rec.receiptNo);
    var company = _mfStr_(rec && rec.company);
    var amount = _mfNum_(rec && rec.amount);
    if (!no) return { success: false, error: 'رقم الإيصال مطلوب' };
    if (!company) return { success: false, error: 'اسم الشركة مطلوب' };
    if (amount <= 0) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };

    var existing = _mfReadReceipts_();
    var dup = existing.filter(function(x) { return x.receiptNo === no; })[0];
    var row = [ no, _mfDate_(rec.date) || _mfToday_(), _mfStr_(rec.time), company,
      _mfStr_(rec.licence), amount, _mfStr_(rec.depositor), _mfStr_(rec.source) || 'يدوي',
      _mfStr_(rec.notes), session.username, _mfStamp_() ];
    if (dup) {
      if (!rec._allowUpdate) return { success: false, error: 'رقم الإيصال ' + no + ' مسجَّل من قبل لشركة ' + dup.company };
      sh.getRange(dup._row, 1, 1, MF_REC_HEADERS.length).setValues([row]);
      logChange_(session.username, 'تعديل إيصال رسوم غرفة', no, 'المبلغ', dup.amount, amount);
      _mfClearBootstrapCache_();
    } else {
      sh.appendRow(row);
      logChange_(session.username, 'تسجيل إيصال رسوم غرفة', no, company, '-', amount + ' ج');
      _mfClearBootstrapCache_();
    }
    SpreadsheetApp.flush();
    return { success: true };
  } finally { lock.releaseLock(); }
}

function deleteRoomFeeReceipt(authToken, receiptNo) {
  var session = _mfPerm_(authToken, 'delete');
  var sh = _accSheet_(MF_REC_SHEET, MF_REC_HEADERS);
  var list = _mfReadReceipts_();
  var hit = list.filter(function(x) { return x.receiptNo === _mfStr_(receiptNo); })[0];
  if (!hit) return { success: false, error: 'الإيصال غير موجود' };
  sh.deleteRow(hit._row);
  SpreadsheetApp.flush();
  logChange_(session.username, 'حذف إيصال رسوم غرفة', hit.receiptNo, hit.company, hit.amount, '-');
  _mfClearBootstrapCache_();
  return { success: true };
}

/* ---------- سجل المشرفين ---------- */
function _mfReadSupervisors_() {
  var sh = _accSheet_(MF_SUP_SHEET, MF_SUP_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, MF_SUP_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!_mfStr_(vals[i][0])) continue;
    out.push({
      name: _mfStr_(vals[i][0]), type: _mfStr_(vals[i][1]) || 'مرافق',
      home: _mfStr_(vals[i][2]),
      shared: _mfStr_(vals[i][3]) ? _mfStr_(vals[i][3]).split(/[،,]/).map(function(s){return s.trim();}).filter(String) : [],
      mobile: _mfStr_(vals[i][4]), notes: _mfStr_(vals[i][5]),
      createdBy: _mfStr_(vals[i][6]), createdAt: _mfStr_(vals[i][7]), _row: i + 2
    });
  }
  return out;
}
function saveMinistrySupervisor(authToken, sup) {
  var session = _mfPerm_(authToken, 'edit');
  var name = _mfStr_(sup && sup.name);
  if (!name) return { success: false, error: 'اسم المشرف مطلوب' };
  var home = _mfStr_(sup.home);
  if (!home) return { success: false, error: 'الشركة الأساسية مطلوبة' };
  var sh = _accSheet_(MF_SUP_SHEET, MF_SUP_HEADERS);
  var list = _mfReadSupervisors_();
  var old = list.filter(function(x) { return x.name === (_mfStr_(sup._origName) || name); })[0];
  var shared = Array.isArray(sup.shared) ? sup.shared.map(_mfStr_).filter(String) : [];
  var row = [ name, _mfStr_(sup.type) || 'مرافق', home, shared.join('، '),
    _mfStr_(sup.mobile), _mfStr_(sup.notes),
    old ? old.createdBy : session.username, old ? old.createdAt : _mfStamp_(),
    session.username, _mfStamp_() ];
  if (old) {
    sh.getRange(old._row, 1, 1, MF_SUP_HEADERS.length).setValues([row]);
    logChange_(session.username, 'تعديل مشرف', name, 'بيانات المشرف',
      old.type + ' / ' + old.home, row[1] + ' / ' + home);
  } else {
    if (list.filter(function(x) { return x.name === name; }).length) return { success: false, error: 'المشرف مسجَّل من قبل' };
    sh.appendRow(row);
    logChange_(session.username, 'إضافة مشرف', name, '-', '-', row[1] + ' / ' + home);
  }
  SpreadsheetApp.flush();
  _mfClearBootstrapCache_();
  return { success: true };
}
function deleteMinistrySupervisor(authToken, name) {
  var session = _mfPerm_(authToken, 'delete');
  var sh = _accSheet_(MF_SUP_SHEET, MF_SUP_HEADERS);
  var hit = _mfReadSupervisors_().filter(function(x) { return x.name === _mfStr_(name); })[0];
  if (!hit) return { success: false, error: 'المشرف غير موجود' };
  sh.deleteRow(hit._row);
  SpreadsheetApp.flush();
  logChange_(session.username, 'حذف مشرف', hit.name, '-', hit.name, '-');
  _mfClearBootstrapCache_();
  return { success: true };
}

// آخر تاريخ عودة مسجَّل لكل مشرف (يُحتسب منه شرط مشرف الاستقبال)
function _mfSupBusy_(files) {
  var busy = {};
  (files || []).forEach(function(f) {
    (f.sups || []).forEach(function(s) {
      var n = _mfStr_(s.name); if (!n) return;
      var t = _mfMs_(_mfStr_(f.retDate));
      if (isNaN(t)) return;
      if (!busy[n] || t > busy[n].ms) busy[n] = { ms: t, date: f.retDate, trip: f.clientLabel || f.tripName };
    });
  });
  return busy;
}
// عبء كل مشرف مرافق على مجموعة تواريخ سفر/عودة معيّنة
function _mfSupLoad_(files, name, goDate, retDate, excludeId) {
  var total = 0;
  (files || []).forEach(function(f) {
    if (excludeId && f.id === excludeId) return;
    if (goDate && _mfStr_(f.goDate) !== _mfStr_(goDate)) return;
    if (retDate && _mfStr_(f.retDate) !== _mfStr_(retDate)) return;
    (f.sups || []).forEach(function(s) { if (_mfStr_(s.name) === _mfStr_(name)) total += _mfNum_(f.pilgrims); });
  });
  return total;
}

// 🎯 اقتراح مشرف لرحلة: الافتراضي المتاحون فقط، و showAll يعرض الجميع مع سبب الاستبعاد
function suggestMinistrySupervisors(authToken, opts) {
  _mfPerm_(authToken, 'view');
  opts = opts || {};
  var company = _mfStr_(opts.company);
  var goDate = _mfDate_(opts.goDate);
  var retDate = _mfDate_(opts.retDate);
  var count = _mfNum_(opts.pilgrims);
  var showAll = !!opts.showAll;

  var files = _mfReadAll_();
  var busy = _mfSupBusy_(files);
  var out = [];
  _mfReadSupervisors_().forEach(function(s) {
    var allowed = (s.home === company) || (s.home === 'الكل') || (s.shared.indexOf(company) >= 0);
    var ok = false, why = '';
    var load = _mfSupLoad_(files, s.name, goDate, retDate, opts.excludeId);
    var b = busy[s.name];
    if (!company) { ok = false; why = 'اختر الشركة أولاً'; }
    else if (!allowed) { why = 'غير مسجّل بالشركة ولا مُشارَك فيها'; }
    else if (s.type.indexOf('مرافق') >= 0 && (load + count) > 50) {
      why = 'عبؤه الحالي ' + load + ' + ' + count + ' يتجاوز الحد الأقصى 50 معتمر';
    } else if (s.type.indexOf('استقبال') >= 0 && b && goDate && _mfMs_(goDate) < b.ms) {
      why = 'لم يعد بعد من رحلته الحالية (عودته ' + b.date + ')';
    } else {
      ok = true;
      why = (s.home === company ? 'مسجّل بالشركة' : (s.home === 'الكل' ? 'متاح لكل الشركات' : 'مُشارَك في الشركة')) +
        (s.type.indexOf('مرافق') >= 0 ? ' · متاح له ' + Math.max(0, 50 - load) + ' معتمر' : ' · بدون رسوم غرفة ولا مخالصة');
    }
    if (ok || showAll) out.push({ name: s.name, type: s.type, home: s.home, shared: s.shared, load: load, eligible: ok, reason: why, busyTo: b ? b.date : '' });
  });
  return { success: true, list: out };
}

/* ---------- تحميل كل بيانات الشاشة في نداء واحد ---------- */
// 🚀 (V4.109) الجزء المشترك بين كل المستخدمين (لا يتضمن can/user الخاصَّين بالجلسة) يُخزَّن في
// الكاش 5 دقائق — كان يُعاد قراءة 6 شيتات كاملة عند كل فتح للشاشة، وأي بحث عام، وأي اقتراح مشرف،
// وهو ما ساهم في تباطؤ التطبيق كله تحت الاستخدام المتزامن. يُمسح تلقائياً مع أي حفظ/حذف بالشاشة.
var MF_BOOTSTRAP_CACHE_KEY = 'ministry_bootstrap_cache';
function getMinistryBootstrap(authToken) {
  var session = _mfPerm_(authToken, 'view');
  var shared = getCachedData(MF_BOOTSTRAP_CACHE_KEY);
  if (!shared) {
    shared = _mfBuildSharedBootstrap_();
    setCachedData(MF_BOOTSTRAP_CACHE_KEY, shared);
  }
  var out = {};
  for (var k in shared) out[k] = shared[k];
  out.success = true;
  out.user = session.username;
  out.can = {
    add: _sessionHasPerm_(session, 'ministry.add'),
    edit: _sessionHasPerm_(session, 'ministry.edit'),
    del: _sessionHasPerm_(session, 'ministry.delete'),
    approve: _sessionHasPerm_(session, 'ministry.approve')
  };
  return out;
}
// قراءة عمود JSON كمصفوفة بأمان (الفنادق الإضافية بالرحلات)
function _mfParseJsonArr_(v) {
  try { var a = JSON.parse(_mfStr_(v) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function _mfBuildSharedBootstrap_() {
  var files = _mfReadAll_();
  var receipts = _mfReadReceipts_();
  var supervisors = _mfReadSupervisors_();
  var cfg = _accPricing_();
  var balances = _mfBalances_(files, receipts);
  var busy = _mfSupBusy_(files);

  // إثراء كل ملف بالقيم المحسوبة + التنبيهات + آخر تعديل
  files.forEach(function(f) {
    (f.sups || []).forEach(function(s) { if (busy[s.name]) s.busyTo = busy[s.name].date; });
    f.calc = _mfCompute_(f, cfg);
    f.flags = _mfRules_(f, files, balances);
    delete f._row;
  });

  // الشركات مع رقم الترخيص والوكيل الافتراضي
  var companies = [];
  try {
    var ash = getSpreadsheet_().getSheetByName('Agents_Settings');
    if (ash && ash.getLastRow() > 1) {
      var need = Math.max(4, ash.getLastColumn());
      var av = ash.getRange(2, 1, ash.getLastRow() - 1, need).getValues();
      av.forEach(function(r, i) {
        if (!_mfStr_(r[1])) return;
        companies.push({ row: i + 2, agent: _mfStr_(r[0]), company: _mfStr_(r[1]),
          logoUrl: _mfStr_(r[2]), licence: _mfStr_(r[3]) });
      });
    }
  } catch (e) {}

  // الرحلات (اسم + تواريخ + فنادق) والعملاء المسجلون
  var trips = [], clients = [];
  try {
    var tsh = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_);
    if (tsh && tsh.getLastRow() > 1) {
      var tmap = _robustColMap_(tsh, TRIPS_HEADERS_);
      var tv = tsh.getRange(2, 1, tsh.getLastRow() - 1, tsh.getLastColumn()).getValues();
      var rd = _cellReader_(tmap, TRIPS_COL_);
      tv.forEach(function(row) {
        var nm = _mfStr_(rd(row, 'name'));
        if (!nm) return;
        trips.push({ name: nm, company: _mfStr_(rd(row, 'company')), agent: _mfStr_(rd(row, 'agent')),
          supervisor: _mfStr_(rd(row, 'supervisor')), supervisorRole: _mfStr_(rd(row, 'supervisorRole')),
          goDate: _mfDate_(rd(row, 'departDate')), retDate: _mfDate_(rd(row, 'returnDate')),
          madinahHotel: _mfStr_(rd(row, 'madinahHotel')), madinahIn: _mfDate_(rd(row, 'madinahCheckIn')),
          madinahOut: _mfDate_(rd(row, 'madinahCheckOut')),
          makkahHotel: _mfStr_(rd(row, 'makkahHotel')), makkahIn: _mfDate_(rd(row, 'makkahCheckIn')),
          makkahOut: _mfDate_(rd(row, 'makkahCheckOut')),
          // 🏨 (V4.134) الفنادق الإضافية لكل مدينة — لتُجلب تلقائياً في نموذج مجموعة التأشيرات
          madinahExtra: _mfParseJsonArr_(rd(row, 'madinahExtra')),
          makkahExtra: _mfParseJsonArr_(rd(row, 'makkahExtra')),
          madinahNights: _mfNum_(rd(row, 'madinahNights')), makkahNights: _mfNum_(rd(row, 'makkahNights')),
          airline: _mfStr_(rd(row, 'airline')), direction: _mfStr_(rd(row, 'direction')),
          tripRef: _mfStr_(rd(row, 'tripRef')),
          seats: _mfNum_(rd(row, 'bookedSeats')) });
      });
    }
  } catch (e) {}
  try {
    var csh = getSpreadsheet_().getSheetByName('Clients');
    if (csh && csh.getLastRow() > 1) {
      csh.getRange(2, 1, csh.getLastRow() - 1, 1).getValues().forEach(function(r) {
        var n = _mfStr_(r[0]); if (n && clients.indexOf(n) < 0) clients.push(n);
      });
    }
  } catch (e) {}

  return {
    files: files, receipts: receipts, supervisors: supervisors,
    companies: companies, trips: trips, clients: clients,
    balances: balances, cfg: cfg, today: _mfToday_()
  };
}
// تُستدعى بعد أي حفظ/حذف في شاشة مراجعة ملفات الوزارة حتى لا يرى المستخدمون بيانات قديمة من الكاش
function _mfClearBootstrapCache_() {
  try { CacheService.getScriptCache().remove(MF_BOOTSTRAP_CACHE_KEY); } catch (e) {}
}

/* ============================================================
   🏨 (V4.123) مستويات تسكين رحلة — لتنبيه المستخدم عند ربط ملف مراجعة جديد برحلة بها أكثر من
   مستوى تسكين (كل فندق × طبيعة تسكين تُعتبر مستوى، ما عدا الرباعي والخماسي وما فوقهما فتُجمَع
   معاً كمستوى "عادي" واحد لكل فندق — نفس تجميع _accClientBreakdown_ بالضبط، لكن على مستوى
   الرحلة كلها بلا فلترة بعميل بعينه)، فيسأله هل يراجع كل المستويات في ملف واحد أم يُنشئ ملفاً
   منفصلاً لكل مستوى (بسكنه وسعر بيعه الخاص من جدول تسعير الرحلة إن وُجد).
   ============================================================ */
function getTripAccommodationLevels(authToken, tripName) {
  _mfPerm_(authToken, 'view');
  tripName = String(tripName || '').trim();
  if (!tripName) return { success: true, levels: [] };
  var pSheet = _getPilgrimsSheet_();
  if (!pSheet || pSheet.getLastRow() < 2) return { success: true, levels: [] };
  var C = _robustColMap_(pSheet, PILGRIMS_HEADERS_);
  var P = _cellReader_(C, PILGRIMS_COL_);
  var groups = {}, order = [];
  pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function(r) {
    if (String(P(r, 'tripName') || '').trim() !== tripName) return;
    if (!String(P(r, 'name') || '').trim()) return;
    var type = String(P(r, 'type') || '').trim();
    if (type === 'رضيع') return; // لا يُحتسب مستوى مستقل
    var acc = String(P(r, 'accommodation') || '').trim();
    // 🛏️ نفس قاعدة _accClientBreakdown_: الرباعي/الخماسي/السداسي بلا تفرقة = مستوى "عادي" واحد؛
    // الغرف المقفولة المميزة كمستوى منفصل هي سنجل/دابل/ثلاثي فقط
    if (['رباعي', 'خماسي', 'سداسي', 'رباعي أسرة', 'خماسي أسرة'].indexOf(acc) > -1) acc = '';
    var mHotel = String(P(r, 'hotelMakkah') || '').trim();
    var dHotel = String(P(r, 'hotelMadinah') || '').trim();
    var hotel = mHotel || dHotel;
    var key = hotel + '|' + (acc || 'عادي');
    if (!(key in groups)) {
      groups[key] = { hotel: hotel, acc: acc || 'عادي', count: 0, madinahHotel: dHotel, makkahHotel: mHotel };
      order.push(key);
    }
    groups[key].count++;
  });
  if (order.length < 2) return { success: true, levels: [] }; // مستوى واحد فقط — لا داعي للتنبيه
  var pricing = _accTripPricing_(tripName);
  var levels = order.map(function(key) {
    var g = groups[key];
    var priceRow = pricing ? (pricing.hotels || {})[g.hotel || ''] : null;
    var price = priceRow ? _accNum_(priceRow[g.acc]) : 0;
    return {
      key: key, label: (g.hotel ? g.hotel + ' ' : '') + g.acc, count: g.count,
      madinahHotel: g.madinahHotel, makkahHotel: g.makkahHotel, price: price
    };
  });
  return { success: true, levels: levels };
}

/* ---------- حفظ ملف مراجعة (إضافة/تعديل) ---------- */
function saveMinistryFile(authToken, data) {
  var isNew = !_mfStr_(data && data.id);
  var session = _mfPerm_(authToken, isNew ? 'add' : 'edit');
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (e) { return { success: false, error: 'الشيت مشغول بعملية حفظ أخرى — أعد المحاولة بعد لحظات' }; }
  try {
    var sh = _accSheet_(MF_SHEET, MF_HEADERS);
    var all = _mfReadAll_();
    var old = isNew ? null : all.filter(function(x) { return x.id === _mfStr_(data.id); })[0];
    if (!isNew && !old) return { success: false, error: 'الملف غير موجود' };

    // تطبيع الأرقام العربية وتوحيد صيغة التواريخ
    var bd = Array.isArray(data.breakdown) ? data.breakdown.map(function(b) {
      return { name: _mfStr_(b.name), count: _mfNum_(b.count), sups: _mfNum_(b.sups),
        note: _mfStr_(b.note), isTrip: !!b.isTrip };
    }) : (old ? old.breakdown : []);
    var sups = Array.isArray(data.sups) ? data.sups.map(function(s) {
      return { name: _mfStr_(s.name), type: _mfStr_(s.type) || 'مرافق', directTo: _mfStr_(s.directTo) };
    }) : (old ? old.sups : []);

    var pilg = _mfNum_(data.pilgrims);
    if (!pilg && bd.length) pilg = bd.reduce(function(a, b) { return a + b.count; }, 0);

    var f = {
      id: isNew ? _accId_('MF') : old.id,
      seq: isNew ? _mfNextSeq_() : old.seq,
      fileNo: _mfStr_(data.fileNo),
      approved: !!data.approved,
      eInvoice: _mfStr_(data.eInvoice), ref: _mfStr_(data.ref),
      company: _mfStr_(data.company), agent: _mfStr_(data.agent),
      reviewDate: _mfDate_(data.reviewDate),
      reviewType: _mfStr_(data.reviewType) || 'عادية',
      vipReason: _mfStr_(data.vipReason),
      travelMode: _mfStr_(data.travelMode) || 'طيران',
      clientLabel: _mfStr_(data.clientLabel) || bd.map(function(b) { return b.name; }).join(' + '),
      breakdown: bd, tripName: _mfStr_(data.tripName),
      goDate: _mfDate_(data.goDate), retDate: _mfDate_(data.retDate),
      pilgrims: pilg, supCount: 0,   // 🧑‍✈️ (V4.113) يُحتسب أدناه بعد تطبيق قاعدة الوكيل ⇒ استقبال (مرافق فقط يُحتسب)
      sups: sups,
      progPrice: _mfNum_(data.progPrice), ticket: _mfNum_(data.ticket),
      roomFee: _mfNum_(data.roomFee) || _mfNum_(_accRoomFeeAt_(_mfDate_(data.reviewDate) || _mfToday_())),
      adminFee: _mfNum_(data.adminFee),
      pct: _mfNum_(data.pct) || (old ? old.pct : 0) || _mfDefaultPct_(pilg),
      fxRate: _mfNum_(data.fxRate),
      madinahHotel: _mfStr_(data.madinahHotel), madinahIn: _mfDate_(data.madinahIn), madinahOut: _mfDate_(data.madinahOut),
      makkahHotel: _mfStr_(data.makkahHotel), makkahIn: _mfDate_(data.makkahIn), makkahOut: _mfDate_(data.makkahOut),
      transport: _mfStr_(data.transport), notes: _mfStr_(data.notes),
      selected: Array.isArray(data.selected) ? data.selected : (old ? old.selected : []),
      createdBy: isNew ? session.username : old.createdBy,
      createdAt: isNew ? _mfStamp_() : old.createdAt,
      updatedBy: session.username, updatedAt: _mfStamp_()
    };

    // نوع المراجعة التلقائي (جمعة/سبت أو أقل من 3 أيام) — ما لم يُثبّته الموظف يدوياً
    if (!data._manualType) f.reviewType = _mfAutoReviewType_(f.reviewDate, f.goDate, f.reviewType);
    // 🧾 (V4.111) الملف الذي له رقم قيد مسجَّل يُعتبر معتمداً تلقائياً
    if (_mfStr_(f.ref)) f.approved = true;
    // 🧑‍✈️ (V4.111) المشرف الذي يطابق اسمه الوكيل السعودي نوعه «استقبال» تلقائياً
    var agentNm = _mfStr_(f.agent);
    if (agentNm) {
      f.sups.forEach(function(s) {
        if (_mfStr_(s.name) && _mfStr_(s.name) === agentNm) s.type = 'استقبال';
      });
    }
    // 🧑‍✈️ (V4.113) «عدد المشرفين» يعكس فقط من نوعه «مرافق» — «استقبال» (مشرف فعلي أو الوكيل نفسه)
    // لا يُحسب ضمن العدد، ولا رسوم غرفة له ولا مخالصة (نفس منطق _mfCompute_)
    f.supCount = f.sups.filter(function(s) { return String(s.type || '').indexOf('مرافق') >= 0; }).length;
    // شركة النقل الافتراضية: اسم الوكيل، و«بدون» لو المشرف هو الوكيل نفسه (لا يوجد مشرف حقيقي أصلاً)
    if (!f.transport) {
      var isAgentSup = agentNm && f.sups.some(function(s) { return _mfStr_(s.name) === agentNm; });
      f.transport = isAgentSup ? 'بدون' : f.agent;
    }
    // 🔒 (V4.113) اعتماد الملف يدوياً صلاحية فرعية منفصلة عن التعديل — الاعتماد التلقائي بسبب رقم
    // القيد (أعلاه) يبقى مسموحاً دائماً بلا هذه الصلاحية.
    if (data.approved && !_mfStr_(f.ref) && !(old && old.approved) && !_sessionHasPerm_(session, 'ministry.approve')) {
      f.approved = false;
    }

    var row = _mfObjToRow_(f);
    if (isNew) sh.appendRow(row);
    else sh.getRange(old._row, 1, 1, MF_HEADERS.length).setValues([row]);
    SpreadsheetApp.flush();

    // سجل التعديلات: فرق حقل بحقل
    var recId = 'MF:' + f.id;
    var entries = [];
    if (isNew) {
      entries.push({ action: 'إنشاء ملف مراجعة وزارة', recordId: recId, field: '-', oldVal: '-',
        newVal: (f.fileNo ? 'ملف رقم ' + f.fileNo : 'بدون رقم ملف') + ' — ' + (f.clientLabel || '') + ' — ' + f.company });
    } else {
      Object.keys(MF_FIELD_LABELS_).forEach(function(k) {
        var a = old[k], b = f[k];
        if (k === 'breakdown' || k === 'sups' || k === 'selected') { a = JSON.stringify(a || []); b = JSON.stringify(b || []); }
        if (k === 'approved') { a = a ? 'معتمد' : 'غير معتمد'; b = b ? 'معتمد' : 'غير معتمد'; }
        if (String(a == null ? '' : a) === String(b == null ? '' : b)) return;
        entries.push({ action: 'تعديل ملف مراجعة وزارة', recordId: recId, field: MF_FIELD_LABELS_[k],
          oldVal: String(a == null || a === '' ? '-' : a).slice(0, 300),
          newVal: String(b == null || b === '' ? '-' : b).slice(0, 300) });
      });
      // سحب رسوم الغرفة يتم عند تسجيل تاريخ المراجعة
      if (!_mfStr_(old.reviewDate) && _mfStr_(f.reviewDate)) {
        entries.push({ action: 'سحب رسوم غرفة', recordId: recId, field: 'رصيد ' + f.company,
          oldVal: '-', newVal: _mfCompute_(f).totalRoomFee + ' ج عند تسجيل تاريخ المراجعة ' + f.reviewDate });
      }
    }
    if (entries.length) logChangesBatch_(session.username, entries);
    _mfClearBootstrapCache_();

    // ⚡ (V4.126) كان هنا قراءة كاملة ثانية للشيت (_mfReadAll_) بعد الكتابة مباشرةً — أي أن كل حفظ
    // (وكل ضغطة «اعتماد») كان يقرأ شيت الملفات مرتين كاملتين، وهو السبب الأساسي لبطء الحفظ
    // والاعتماد. النسخة المقروءة أول الدالة كافية: نحدّثها في الذاكرة بالسجل المحفوظ بدل إعادة
    // القراءة — نفس النتيجة تماماً بنصف زمن القراءة.
    var allAfter = all.slice();
    var _ix = -1;
    for (var _ai = 0; _ai < allAfter.length; _ai++) { if (allAfter[_ai].id === f.id) { _ix = _ai; break; } }
    if (_ix >= 0) allAfter[_ix] = f; else allAfter.push(f);

    var balances = _mfBalances_(allAfter, _mfReadReceipts_());
    f.calc = _mfCompute_(f);
    f.flags = _mfRules_(f, allAfter, balances);
    return { success: true, file: f, balances: balances };
  } finally { lock.releaseLock(); }
}

/* ⚡ (V4.126) اعتماد/إلغاء اعتماد ملف مراجعة — مسار خفيف مخصَّص بدل تمرير الملف كاملاً عبر
   saveMinistryFile (الذي يقرأ الشيت ويعيد حساب الأرصدة والقواعد لكل الملفات في كل ضغطة).
   هنا نكتب خلية «معتمد» وحدها فقط، فتتغيّر الحالة فوراً بدل الانتظار الطويل الذي اشتكى منه
   المستخدم. نفس فحص الصلاحية الفرعية بالضبط: الاعتماد اليدوي يحتاج ministry.approve، أما الملف
   الذي له رقم قيد أو كان معتمداً بالفعل فيُعامَل كما في saveMinistryFile تماماً. */
function setMinistryFileApproved(authToken, id, approved) {
  var session = _mfPerm_(authToken, 'edit');
  id = _mfStr_(id);
  approved = !!approved;
  var sh = _accSheet_(MF_SHEET, MF_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return { success: false, error: 'الملف غير موجود' };

  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  var row = -1;
  for (var i = 0; i < ids.length; i++) {
    if (_mfStr_(ids[i][0]) === id) { row = i + 2; break; }
  }
  if (row === -1) return { success: false, error: 'الملف غير موجود' };

  var iApproved = MF_HEADERS.indexOf('معتمد');
  var iRef = MF_HEADERS.indexOf('القيد');
  var iUpdBy = MF_HEADERS.indexOf('عُدّل بواسطة');
  var iUpdAt = MF_HEADERS.indexOf('عُدّل في');
  if (iApproved === -1) return { success: false, error: 'عمود الاعتماد غير موجود' };

  var rowVals = sh.getRange(row, 1, 1, MF_HEADERS.length).getValues()[0];
  var wasApproved = (_mfStr_(rowVals[iApproved]) === 'نعم');   // نفس تمثيل _mfRowToObj_ بالضبط
  var ref = iRef === -1 ? '' : _mfStr_(rowVals[iRef]);
  if (approved && !ref && !wasApproved && !_sessionHasPerm_(session, 'ministry.approve')) {
    return { success: false, error: 'لا تملك صلاحية اعتماد ملفات مراجعة الوزارة' };
  }
  if (wasApproved === approved) return { success: true, approved: approved, unchanged: true };

  sh.getRange(row, iApproved + 1).setValue(approved ? 'نعم' : 'لا');
  if (iUpdBy !== -1) sh.getRange(row, iUpdBy + 1).setValue(session.username);
  if (iUpdAt !== -1) sh.getRange(row, iUpdAt + 1).setValue(_mfStamp_());
  _mfClearBootstrapCache_();
  logChange_(session.username, approved ? 'اعتماد ملف مراجعة' : 'إلغاء اعتماد ملف مراجعة',
    _mfStr_(rowVals[MF_HEADERS.indexOf('رقم الملف')]) || id, 'معتمد',
    wasApproved ? 'نعم' : 'لا', approved ? 'نعم' : 'لا');
  return { success: true, approved: approved };
}

function deleteMinistryFile(authToken, id) {
  var session = _mfPerm_(authToken, 'delete');
  var sh = _accSheet_(MF_SHEET, MF_HEADERS);
  var hit = _mfReadAll_().filter(function(x) { return x.id === _mfStr_(id); })[0];
  if (!hit) return { success: false, error: 'الملف غير موجود' };
  sh.deleteRow(hit._row);
  SpreadsheetApp.flush();
  _mfClearBootstrapCache_();
  logChange_(session.username, 'حذف ملف مراجعة وزارة', 'MF:' + hit.id, '-',
    (hit.fileNo ? 'ملف رقم ' + hit.fileNo : 'بدون رقم') + ' — ' + hit.clientLabel, '-');
  return { success: true };
}

// سجل تعديلات ملف واحد
function getMinistryFileHistory(authToken, id) {
  _mfPerm_(authToken, 'view');
  var sh = ensureAuditLogSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { success: true, entries: [] };
  var vals = sh.getRange(2, 1, last - 1, 7).getValues();
  var key = 'MF:' + _mfStr_(id);
  var tz = Session.getScriptTimeZone() || 'Asia/Riyadh';
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    if (_mfStr_(vals[i][3]) !== key) continue;
    var ts = vals[i][0];
    out.push({
      when: (ts instanceof Date) ? Utilities.formatDate(ts, tz, 'dd/MM/yyyy HH:mm:ss') : _mfStr_(ts),
      who: _mfStr_(vals[i][1]), action: _mfStr_(vals[i][2]),
      field: _mfStr_(vals[i][4]), oldVal: _mfStr_(vals[i][5]), newVal: _mfStr_(vals[i][6])
    });
  }
  return { success: true, entries: out };
}

// 🔗 ربط شاشة الرحلات: أي رحلة مرتبطة بملف مراجعة + الرحلات التي تسافر خلال 3 أيام ولم تُراجع
function getMinistryTripLinks(authToken) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'ministry.view') && !_sessionHasPerm_(session, 'trips.view')) {
    return { success: true, links: {}, alerts: [] };
  }
  var files = _mfReadAll_();
  var links = {}, alerts = [];
  var todayMs = _mfMs_(_mfToday_());
  files.forEach(function(f) {
    var t = _mfStr_(f.tripName);
    if (!t) return;
    if (!links[t]) links[t] = [];
    links[t].push({ id: f.id, fileNo: f.fileNo, seq: f.seq, reviewDate: f.reviewDate,
      reviewed: !!_mfStr_(f.reviewDate), approved: f.approved, pilgrims: f.pilgrims,
      // 🔎 (V4.111) clientLabel + selected يتيحان للبحث العام والسجل العام عرض ملفات
      // المراجعة الخاصة بكل معتمر (وليس الرحلات فقط)
      clientLabel: f.clientLabel, company: f.company, ref: f.ref,
      // 🗓️ (V4.124) تاريخ إنشاء الملف — لعرضه ضمن خط سير الرحلة (إنشاء الملف ثم تاريخ مراجعته)
      createdAt: f.createdAt,
      selected: Array.isArray(f.selected) ? f.selected : [] });
  });
  // 🔕 (V4.125) تنبيه الملفات العاجلة يُعطَّل كلياً من قسم التنبيهات بشاشة الإعدادات
  if (_notifEnabled_('mf_urgent')) {
    files.forEach(function(f) {
      if (_mfStr_(f.reviewDate)) return;
      var g = _mfMs_(_mfStr_(f.goDate));
      if (isNaN(g)) return;
      var days = Math.ceil((g - todayMs) / 86400000);
      if (days <= 3 && days >= 0) {
        alerts.push({ id: f.id, tripName: f.tripName, client: f.clientLabel, goDate: f.goDate,
          days: days, linked: !!_mfStr_(f.tripName), fileNo: f.fileNo });
      }
    });
  }
  // 🔗 (V4.115) الربط الثلاثي: الرحلة ⇄ رقم الإشعار ⇄ رقم ملف الوزارة.
  // نُرجع لكل رحلة رقم إشعارها المرتبط ورقمها المرجعي، فتستطيع كل الشاشات (الرحلات، الإشعارات،
  // السجل العام، البحث العام، وملفات الوزارة) عرض الثلاثة معاً أياً كانت نقطة البداية.
  var tripInfo = {}, byBooking = {};
  try {
    var tsh = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_);
    if (tsh && tsh.getLastRow() > 1) {
      var tmap = _robustColMap_(tsh, TRIPS_HEADERS_);
      var rd = _cellReader_(tmap, TRIPS_COL_);
      tsh.getRange(2, 1, tsh.getLastRow() - 1, tsh.getLastColumn()).getValues().forEach(function(row) {
        var nm = _mfStr_(rd(row, 'name'));
        if (!nm) return;
        var bk = _mfStr_(rd(row, 'linkedBookingId'));
        var rf = _mfStr_(rd(row, 'tripRef'));
        tripInfo[nm] = { bookingId: bk, tripRef: rf };
        if (bk) byBooking[bk] = nm;   // رقم الإشعار → اسم الرحلة (لشاشة الإشعارات)
      });
    }
  } catch (e) {}
  return { success: true, links: links, alerts: alerts, tripInfo: tripInfo, byBooking: byBooking };
}

/* ==================================================================================
   🏛️ (V4.108) استخلاص إيصالات رسوم الغرفة بالذكاء الاصطناعي (دفعة واحدة، صور/PDF)
   يعتمد نفس نمط استخلاص اتفاقيات الإعاشة (extractCateringContract) — Gemini vision،
   مع تحويل تلقائي للأرقام العربية ومطابقة الشركة عبر رقم الترخيص (كود العميل بالإيصال).
   ================================================================================== */
function extractRoomFeeReceiptImage(authToken, base64Data, mimeType) {
  _mfPerm_(authToken, 'add');
  if (!base64Data) return { success: false, error: 'لا يوجد ملف' };
  var GKEYS = _geminiKeys_();
  if (!GKEYS.length) return { success: false, error: 'مفتاح Gemini غير مُعدّ' };

  var prompt =
    "This is an Egyptian bank cash-deposit receipt (إيصال إيداع نقدية), typically Banque Misr format. " +
    "Extract these Arabic-labelled fields exactly as printed: " +
    "'الرقم المرجعى' (reference number) -> receiptNo. " +
    "'كود العميل' (customer/client code, a short numeric code identifying the company) -> licence. " +
    "'المبلغ بالارقام' (amount in digits) -> amount (digits only, no commas). " +
    "'التاريخ' (date, may include time like '12:12PM') -> date (dd/mm/yyyy) and time (e.g. '12:12 PM'). " +
    "'اسم المودع' (depositor's name) -> depositor. " +
    "'المودع لحساب شركة' or 'المودع لحساب' (company name if printed) -> companyNamePrinted. " +
    "Return ONLY pure JSON, no markdown:\n" +
    '{"receiptNo":"","licence":"","amount":"","date":"","time":"","depositor":"","companyNamePrinted":""}\n' +
    "Numbers must be Latin digits only (convert Arabic-Indic ٠-٩ to 0-9). Empty string if a field is unreadable.";

  var payload = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }] }] };
  // ⚠️ (V4.111) حُذف gemini-1.5-pro — أوقفته جوجل على v1beta وكان يُظهر للمستخدم رسالة
  // «models/gemini-1.5-pro is not found for API version v1beta» بعد إبطاء المحاولة لكل مفتاح.
  var MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  var rawText = '', lastErr = '';
  for (var ki = 0; ki < GKEYS.length && !rawText; ki++) {
    for (var mi = 0; mi < MODELS.length; mi++) {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[mi] + ':generateContent?key=' + GKEYS[ki];
      var resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
      var httpCode = resp.getResponseCode();
      var jsonRes = null;
      try { jsonRes = JSON.parse(resp.getContentText()); } catch (pe) { jsonRes = null; }
      if (httpCode === 200 && jsonRes && jsonRes.candidates && jsonRes.candidates.length && jsonRes.candidates[0].content) {
        rawText = jsonRes.candidates[0].content.parts[0].text || '';
        break;
      }
      lastErr = (jsonRes && jsonRes.error && jsonRes.error.message) ? jsonRes.error.message : ('HTTP ' + httpCode);
      if (httpCode === 401 || httpCode === 403) break;
    }
  }
  if (!rawText) return { success: false, error: lastErr || 'تعذّر الاتصال بالذكاء الاصطناعي' };

  var text = rawText.replace(/```json|```/g, '').trim();
  var m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];
  var d;
  try { d = JSON.parse(text); } catch (e) { return { success: false, error: 'رد غير صالح من الذكاء الاصطناعي' }; }

  var out = {
    receiptNo: _mfStr_(d.receiptNo), licence: _mfStr_(d.licence).replace(/\D/g, ''),
    amount: _mfNum_(d.amount), date: _mfDate_(d.date), time: _mfStr_(d.time), depositor: _mfStr_(d.depositor)
  };
  if (!out.amount) return { success: false, error: 'تعذّر قراءة المبلغ من الإيصال' };

  var comp = null;
  try {
    var ash = getSpreadsheet_().getSheetByName('Agents_Settings');
    if (ash && ash.getLastRow() > 1 && out.licence) {
      var av = ash.getRange(2, 1, ash.getLastRow() - 1, Math.max(4, ash.getLastColumn())).getValues();
      for (var i = 0; i < av.length; i++) { if (_mfStr_(av[i][3]) === out.licence) { comp = _mfStr_(av[i][1]); break; } }
    }
  } catch (e) {}
  out.company = comp || '';
  out.engine = 'ai';
  return { success: true, data: out };
}

/* ==================================================================================
   ⚡ (V4.111) استخلاص إيصال رسوم الغرفة بلا ذكاء اصطناعي
   إيصال بنك مصر صيغته ثابتة ومعروفة الحقول، والذكاء الاصطناعي كان بطيئاً ويفشل أحياناً،
   فصار المسار: محلّل نصي محلي فوري أولاً (على النص الملصق أو الناتج من OCR درايف)،
   والذكاء الاصطناعي احتياطي لا يُستدعى إلا عند فشل المحلّل.
   ================================================================================== */
function _mfParseReceiptText_(raw) {
  var t = _mfLatin_(String(raw || '')).replace(/\r/g, '\n');
  if (!t.trim()) return null;
  var lines = t.split('\n').map(function(x) { return x.trim(); }).filter(String);

  // يلتقط قيمة حقل معنون: يقبل القيمة على نفس السطر بعد النقطتين/المسافة أو في السطر التالي
  function pick(labels, valueRe) {
    for (var li = 0; li < lines.length; li++) {
      for (var k = 0; k < labels.length; k++) {
        var idx = lines[li].indexOf(labels[k]);
        if (idx < 0) continue;
        var after = lines[li].slice(idx + labels[k].length).replace(/^[\s:：\-–]+/, '');
        var m = after.match(valueRe);
        if (m) return m[0];
        if (lines[li + 1]) {
          var m2 = lines[li + 1].match(valueRe);
          if (m2) return m2[0];
        }
      }
    }
    return '';
  }

  var out = {
    // «الرقم المرجعى» يُكتب أحياناً «المرجعي» — الحرفان مقبولان
    receiptNo: pick(['الرقم المرجعى', 'الرقم المرجعي', 'رقم المرجع', 'Reference'], /[A-Za-z0-9\-\/]{4,}/),
    licence: (pick(['كود العميل', 'كود العميل/', 'Customer Code'], /[0-9\/\-]{2,}/) || '').replace(/\D/g, ''),
    amount: _mfNum_((pick(['المبلغ بالارقام', 'المبلغ بالأرقام', 'المبلغ', 'Amount'], /[0-9][0-9,\.]*/) || '').replace(/,/g, '')),
    date: _mfDate_(pick(['التاريخ', 'تاريخ', 'Date'], /\d{1,2}\s*[\/\-\.]\s*\d{1,2}\s*[\/\-\.]\s*\d{2,4}/)),
    time: pick(['التاريخ', 'الوقت', 'Time'], /\d{1,2}:\d{2}\s*(AM|PM|ص|م)?/i),
    depositor: ''
  };
  // اسم المودع: نص عربي بعد العنوان مباشرةً على نفس السطر أو السطر التالي
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('اسم المودع') < 0 && lines[i].indexOf('المودع') < 0) continue;
    if (lines[i].indexOf('لحساب') >= 0) continue;
    var rest = lines[i].replace(/.*?(اسم\s*المودع|المودع)/, '').replace(/^[\s:：\-–]+/, '');
    if (!rest && lines[i + 1]) rest = lines[i + 1];
    rest = rest.replace(/[^؀-ۿ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (rest.length >= 3) { out.depositor = rest; break; }
  }
  // بلا مبلغ لا فائدة من النتيجة — يتحوّل النداء للذكاء الاصطناعي
  if (!out.amount) return null;
  return out;
}

function _mfMatchCompanyByLicence_(licence) {
  if (!licence) return '';
  try {
    var ash = getSpreadsheet_().getSheetByName('Agents_Settings');
    if (!ash || ash.getLastRow() < 2) return '';
    var av = ash.getRange(2, 1, ash.getLastRow() - 1, Math.max(4, ash.getLastColumn())).getValues();
    for (var i = 0; i < av.length; i++) {
      if (_mfStr_(av[i][3]) === _mfStr_(licence)) return _mfStr_(av[i][1]);
    }
  } catch (e) {}
  return '';
}

// استخلاص من نص ملصق — فوري تماماً وبلا أي نداء خارجي
function extractRoomFeeReceiptText(authToken, text) {
  _mfPerm_(authToken, 'add');
  var d = _mfParseReceiptText_(text);
  if (!d) return { success: false, error: 'تعذّر قراءة المبلغ من النص — تأكد من لصق نص الإيصال كاملاً' };
  d.company = _mfMatchCompanyByLicence_(d.licence);
  d.engine = 'local';
  return { success: true, data: d };
}

// استخلاص من صورة/PDF: OCR مجاني عبر جوجل درايف ثم المحلّل المحلي، والذكاء الاصطناعي احتياطي
function extractRoomFeeReceiptSmart(authToken, base64Data, mimeType, aiFallback) {
  _mfPerm_(authToken, 'add');
  if (!base64Data) return { success: false, error: 'لا يوجد ملف' };
  var localErr = '';
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType || 'image/jpeg', 'receipt');
    var file = Drive.Files.insert({ title: 'mf_ocr_' + new Date().getTime() }, blob,
      { ocr: true, ocrLanguage: 'ar', convert: true });
    var doc = DocumentApp.openById(file.id);
    var txt = doc.getBody().getText();
    try { DriveApp.getFileById(file.id).setTrashed(true); } catch (e) {}
    var d = _mfParseReceiptText_(txt);
    if (d) {
      d.company = _mfMatchCompanyByLicence_(d.licence);
      d.engine = 'ocr';
      return { success: true, data: d };
    }
    localErr = 'قرأ النص لكن لم يجد المبلغ';
  } catch (e) {
    // خدمة درايف المتقدمة غير مفعّلة أو تعذّر التحويل — نكمل بالذكاء الاصطناعي
    localErr = String(e && e.message ? e.message : e);
  }
  if (aiFallback === false) {
    return { success: false, error: 'تعذّر الاستخلاص المحلي (' + localErr + ')' };
  }
  return extractRoomFeeReceiptImage(authToken, base64Data, mimeType);
}

/* ==================================================================================
   💱 (V4.111) سعر بيع الريال السعودي من بنك مصر بتاريخ تسجيل الملف — استرشادي فقط
   يُقرَّب لرقمين عشريين، ويُخزَّن مؤقتاً بالكاش ليوم واحد لتقليل النداءات.
   ================================================================================== */
function fetchSarSellRate(authToken, dateStr) {
  _mfPerm_(authToken, 'view');
  var day = _mfDate_(dateStr) || _mfToday_();
  var cacheKey = 'sar_sell_' + day.replace(/\//g, '_');
  var cache = CacheService.getScriptCache();
  try {
    var hit = cache.get(cacheKey);
    if (hit) {
      var c = JSON.parse(hit);
      return { success: true, rate: c.rate, source: c.source, date: day, cached: true };
    }
  } catch (e) {}

  var urls = [
    'https://www.banquemisr.com/en/exchange-rates',
    'https://www.banquemisr.com/ar/%D8%A3%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%B5%D8%B1%D9%81'
  ];
  var lastErr = '';
  for (var i = 0; i < urls.length; i++) {
    try {
      var resp = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (resp.getResponseCode() !== 200) { lastErr = 'HTTP ' + resp.getResponseCode(); continue; }
      var html = String(resp.getContentText()).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
      var rate = _mfPickSarSell_(html);
      if (rate) {
        var out = { rate: rate, source: 'بنك مصر — سعر البيع' };
        try { cache.put(cacheKey, JSON.stringify(out), 86400); } catch (e2) {}
        return { success: true, rate: rate, source: out.source, date: day };
      }
      lastErr = 'لم يُعثر على سطر الريال السعودي بالصفحة';
    } catch (e) { lastErr = String(e && e.message ? e.message : e); }
  }
  return { success: false, error: 'تعذّر جلب سعر الريال من بنك مصر (' + lastErr + ') — أدخله يدوياً' };
}

// يلتقط سعر البيع من نص صفحة أسعار الصرف: أول رقمين بعد اسم الريال السعودي = شراء ثم بيع
function _mfPickSarSell_(text) {
  var t = _mfLatin_(String(text || '')).replace(/\s+/g, ' ');
  var labels = ['Saudi Riyal', 'SAR', 'الريال السعودي', 'ريال سعودي'];
  for (var i = 0; i < labels.length; i++) {
    var idx = t.indexOf(labels[i]);
    while (idx >= 0) {
      var seg = t.substr(idx, 160);
      var nums = seg.match(/\d+\.\d{2,6}/g) || [];
      // نتجاهل القيم غير المنطقية لسعر الريال مقابل الجنيه
      var ok = nums.filter(function(n) { var v = parseFloat(n); return v > 3 && v < 60; });
      if (ok.length >= 2) return Math.round(parseFloat(ok[1]) * 100) / 100;   // الثاني = البيع
      if (ok.length === 1) return Math.round(parseFloat(ok[0]) * 100) / 100;
      idx = t.indexOf(labels[i], idx + 1);
    }
  }
  return 0;
}

/* ==================================================================================
   🏛️ (V4.108) استيراد ملفات مراجعة قديمة من إكسيل (للأدمن فقط)
   التحليل يتم في المتصفح (SheetJS)، هذه الدالة فقط تُدرج السجلات — بلا ربط برحلة
   (يتم لاحقاً يدوياً من الشاشة). كل صف يُعلَّم في الملاحظات بأنه مستورد.
   ================================================================================== */
function importMinistryFilesBatch(authToken, rows) {
  var session = requireAdminPermission_(authToken);
  rows = Array.isArray(rows) ? rows : [];
  if (!rows.length) return { success: false, error: 'لا توجد صفوف صالحة للاستيراد' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (e) { return { success: false, error: 'الشيت مشغول بعملية حفظ أخرى — أعد المحاولة بعد لحظات' }; }
  try {
    var sh = _accSheet_(MF_SHEET, MF_HEADERS);
    var out = [];
    var now = _mfStamp_();

    /* 🚫 (V4.128) تجاهل الملفات المستوردة سابقاً: كان كل استيراد يُلحق كل الصفوف بلا أي فحص،
       فإعادة رفع نفس ملف الإكسيل (أو ملف يتقاطع معه) تُنشئ نسخاً مكرَّرة. الآن نبني بصمة لكل ملف
       موجود ونتخطّى أي صف يطابقها — والبصمة: «رقم الملف» وحده لأنه المعرِّف الفعلي للملف لدى
       الوزارة، وإن كان فارغاً نستخدم بصمة مركَّبة (الشركة + الذهاب + العدد + سعر البرنامج). */
    var sigOf = function (fileNo, company, goDate, pilgrims, progPrice) {
      var fn = _mfStr_(fileNo);
      if (fn) return 'F|' + fn;
      return 'C|' + _mfStr_(company) + '|' + _mfDate_(goDate) + '|' + _mfNum_(pilgrims) + '|' + _mfNum_(progPrice);
    };
    var existing = {};
    _mfReadAll_().forEach(function (o) {
      existing[sigOf(o.fileNo, o.company, o.goDate, o.pilgrims, o.progPrice)] = true;
    });

    var skipped = 0, skippedNos = [];
    rows.forEach(function (r) {
      // تخطٍّ مزدوج: ما هو مسجَّل بالفعل بالشيت، وما تكرَّر داخل دفعة الاستيراد نفسها
      var sig = sigOf(r.fileNo, r.company, r.goDate, r.pilgrims, r.progPrice);
      if (existing[sig]) {
        skipped++;
        if (skippedNos.length < 25 && _mfStr_(r.fileNo)) skippedNos.push(_mfStr_(r.fileNo));
        return;
      }
      existing[sig] = true;

      var pilgrims = _mfNum_(r.pilgrims), supCount = _mfNum_(r.supCount);
      var clientLabel = _mfStr_(r.clientLabel) || ('مستورد — ملف ' + _mfStr_(r.fileNo));
      var breakdown = pilgrims ? [{ name: clientLabel, count: pilgrims, sups: supCount, note: 'مستورد من إكسيل — يحتاج ربط يدوي بالرحلة' }] : [];
      var sups = _mfStr_(r.supName) ? [{ name: _mfStr_(r.supName), type: 'مرافق', directTo: '' }] : [];
      var pct = _mfNum_(r.pct);
      if (pct && pct < 1) pct = pct * 100; // النسبة بالملف الأصلي كسر عشري (0.03) — نخزّنها كنسبة مئوية (3)
      var f = {
        id: _accId_('MF'), seq: _mfNextSeq_(), fileNo: _mfStr_(r.fileNo),
        approved: !!r.approved, eInvoice: _mfStr_(r.eInvoice), ref: _mfStr_(r.ref),
        company: _mfStr_(r.company), agent: _mfStr_(r.agent),
        reviewDate: _mfDate_(r.reviewDate), reviewType: 'عادية', vipReason: '',
        travelMode: _mfStr_(r.travelMode) || 'طيران',
        clientLabel: clientLabel, breakdown: breakdown, tripName: '',
        goDate: _mfDate_(r.goDate), retDate: _mfDate_(r.retDate),
        pilgrims: pilgrims, supCount: supCount, sups: sups,
        progPrice: _mfNum_(r.progPrice), ticket: _mfNum_(r.ticket), roomFee: _mfNum_(r.roomFee),
        adminFee: _mfNum_(r.adminFee), pct: pct, fxRate: _mfNum_(r.fxRate),
        madinahHotel: _mfStr_(r.madinahHotel), madinahIn: _mfDate_(r.madinahIn), madinahOut: _mfDate_(r.madinahOut),
        makkahHotel: _mfStr_(r.makkahHotel), makkahIn: _mfDate_(r.makkahIn), makkahOut: _mfDate_(r.makkahOut),
        transport: _mfStr_(r.transport), notes: (_mfStr_(r.notes) ? _mfStr_(r.notes) + ' — ' : '') + '📤 مستورد من إكسيل قديم — بحاجة لربط يدوي بالرحلة',
        selected: [], createdBy: session.username, createdAt: now, updatedBy: session.username, updatedAt: now
      };
      out.push(_mfObjToRow_(f));
    });
    if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, MF_HEADERS.length).setValues(out);
    SpreadsheetApp.flush();
    logChange_(session.username, 'استيراد ملفات مراجعة من إكسيل', '-', 'عدد الصفوف', '-',
      String(out.length) + (skipped ? (' (تُخطّي ' + skipped + ' مكرَّر)') : ''));
    _mfClearBootstrapCache_();
    return { success: true, imported: out.length, skipped: skipped, skippedNos: skippedNos };
  } finally { lock.releaseLock(); }
}

/* ==================================================================================
   📅 (V4.109) بوت تليجرام — الاستعلام عن تحركات بتاريخ معيّن
   محادثة قصيرة مستقلة (مفتاح كاش mvq_) — تقبل صيغة قصيرة يوم/شهر وتُكمل السنة الحالية تلقائياً.
   ================================================================================== */
function _tgMoveStateKey_(chatId, userId) { return 'mvq_' + chatId + '_' + userId; }
function _tgMoveGetState_(chatId, userId) {
  var raw = CacheService.getScriptCache().get(_tgMoveStateKey_(chatId, userId));
  return raw ? JSON.parse(raw) : null;
}
function _tgMoveSetState_(chatId, userId, state) {
  CacheService.getScriptCache().put(_tgMoveStateKey_(chatId, userId), JSON.stringify(state), 600); // 10 دقائق
}
function _tgMoveClearState_(chatId, userId) {
  CacheService.getScriptCache().remove(_tgMoveStateKey_(chatId, userId));
}

// يقبل يوم/شهر (يُكمِّل السنة الحالية) أو يوم/شهر/سنة كاملة — بأرقام عربية أو لاتينية وأي فاصل شائع
function _tgMoveParseShortOrFullDate_(s) {
  var v = String(s || '').trim()
    .replace(/[٠-٩]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48); })
    .replace(/[۰-۹]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48); })
    .replace(/[\-.]/g, '/');
  var dd, mm, yy;
  var mFull = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  var mShort = v.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mFull) {
    dd = parseInt(mFull[1], 10); mm = parseInt(mFull[2], 10); yy = parseInt(mFull[3], 10);
    if (mFull[3].length === 2) yy += 2000;
  } else if (mShort) {
    dd = parseInt(mShort[1], 10); mm = parseInt(mShort[2], 10); yy = new Date().getFullYear();
  } else {
    return null;
  }
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 2020 || yy > 2100) return null;
  var dt = new Date(yy, mm - 1, dd);
  if (dt.getDate() !== dd || dt.getMonth() !== mm - 1) return null;
  return ('0' + dd).slice(-2) + '/' + ('0' + mm).slice(-2) + '/' + yy;
}

/* ==================================================================================
   🔎 (V4.138) بوت تليجرام — البحث عن معتمر بالاسم (تقريبي/جزئي) أو رقم الجواز
   يعرض: الاسم، الجواز، العميل، الرحلة (وإن كانت جارية الآن)، المشرف، مكانه الحالي (الفندق
   وطبيعة التسكين ورقم الغرفة في المدينة التي هو بها فعلياً وقت الاستعلام)، ملف مراجعة الوزارة،
   رقم الإشعار، مجموعة التأشيرات، الوكيل السعودي، والشركة المصرية.
   يعمل بزر من القائمة (محادثة قصيرة تنتظر الاسم/الجواز) وبأمر مباشر «بحث: ...» في أي وقت.
   ================================================================================== */
// تطبيع عربي للمقارنة التقريبية: حذف التشكيل + توحيد الألف/الهمزة + الياء/الألف المقصورة + التاء
// المربوطة + المسافات الزائدة — نفس منطق _normalizeArabic_ في الواجهة (index_web.html) بالضبط
function _tgNormAr_(s) {
  return String(s || '')
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[إأآٱا]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
// محادثة قصيرة بعد زر «بحث عن معتمر» — تنتظر نص البحث من المستخدم (10 دقائق ثم تنتهي صلاحيتها)
function _tgSrchStateKey_(chatId, userId) { return 'srchq_' + chatId + '_' + userId; }
function _tgSrchSetState_(chatId, userId) { CacheService.getScriptCache().put(_tgSrchStateKey_(chatId, userId), '1', 600); }
function _tgSrchGetState_(chatId, userId) { return !!CacheService.getScriptCache().get(_tgSrchStateKey_(chatId, userId)); }
function _tgSrchClearState_(chatId, userId) { CacheService.getScriptCache().remove(_tgSrchStateKey_(chatId, userId)); }

// قراءة خام لكل صفوف شيت المعتمرين — كل صف = تسجيل معتمر على رحلة بعينها (بلا تجميع)
function _tgReadPilgrimRows_() {
  var sh = _getPilgrimsSheet_();
  var last = sh.getLastRow(); if (last < 2) return [];
  var C = _robustColMap_(sh, PILGRIMS_HEADERS_);
  var P = _cellReader_(C, PILGRIMS_COL_);
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var out = [];
  data.forEach(function (r) {
    var name = String(P(r, 'name') || '').trim();
    if (!name) return;
    out.push({
      name: name, passport: String(P(r, 'passport') || '').trim(),
      client: String(P(r, 'client') || '').trim(), tripName: String(P(r, 'tripName') || '').trim(),
      bookingId: String(P(r, 'bookingId') || '').trim(),
      accommodation: String(P(r, 'accommodation') || '').trim(),
      hotelMadinah: String(P(r, 'hotelMadinah') || '').trim(), hotelMakkah: String(P(r, 'hotelMakkah') || '').trim(),
      roomNoMadinah: String(P(r, 'roomNoMadinah') || '').trim(), roomNoMakkah: String(P(r, 'roomNoMakkah') || '').trim(),
      roomNo: String(P(r, 'roomNo') || '').trim()
    });
  });
  return out;
}
// خريطة بيانات الرحلات (اسم الرحلة → بياناتها اللازمة): الشركة/الوكيل/المشرف/تواريخ الذهاب
// والعودة وفندقا مكة والمدينة الأساسيان بتواريخ الدخول/الخروج + رقم الإشعار المرتبط
function _tgReadTripsMap_() {
  var sh = _getTripsSheet_();
  var last = sh.getLastRow(); var map = {};
  if (last < 2) return map;
  var C = _robustColMap_(sh, TRIPS_HEADERS_);
  var T = _cellReader_(C, TRIPS_COL_);
  sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (r) {
    var n = String(T(r, 'name') || '').trim(); if (!n) return;
    map[n] = {
      name: n, company: String(T(r, 'company') || '').trim(), agent: String(T(r, 'agent') || '').trim(),
      supervisor: String(T(r, 'supervisor') || '').trim(),
      supervisorPhones: String(T(r, 'supervisorPhones') || '').trim(),
      departDate: _tripFormatDate_(T(r, 'departDate')), returnDate: _tripFormatDate_(T(r, 'returnDate')),
      madinahHotel: String(T(r, 'madinahHotel') || '').trim(),
      madinahIn: _tripFormatDate_(T(r, 'madinahCheckIn')), madinahOut: _tripFormatDate_(T(r, 'madinahCheckOut')),
      makkahHotel: String(T(r, 'makkahHotel') || '').trim(),
      makkahIn: _tripFormatDate_(T(r, 'makkahCheckIn')), makkahOut: _tripFormatDate_(T(r, 'makkahCheckOut')),
      linkedBookingId: String(T(r, 'linkedBookingId') || '').trim()
    };
  });
  return map;
}
// مطابقة تقريبية: الجواز = تضمين نصّي بلا مسافات، الاسم = كل كلمات البحث موجودة (بأي ترتيب) داخل
// الاسم بعد التطبيع — هذا يحقق «تقريبي وغير كامل» ويتسامح مع اختلاف المسافات وحالات الأحرف معاً
function _tgPilgrimMatches_(row, qNameTokens, qPassNorm) {
  if (qPassNorm && row.passport && row.passport.replace(/\s+/g, '').toLowerCase().indexOf(qPassNorm) >= 0) return true;
  if (qNameTokens.length) {
    var nn = _tgNormAr_(row.name);
    return qNameTokens.every(function (tok) { return nn.indexOf(tok) >= 0; });
  }
  return false;
}
/* 🔎 البحث الرئيسي: يُرجع «أشخاصاً» مجمَّعين (المفتاح: رقم الجواز، وإلا الاسم) — لكل شخص
   نختار الصف الذي يمثّل حالته الآن: رحلة جارية أولاً، وإلا آخر رحلة بتاريخ ذهاب (الأحدث). */
function _tgSearchPilgrim_(query) {
  query = String(query || '').trim();
  if (!query) return [];
  var qNorm = _tgNormAr_(query);
  var qNameTokens = qNorm ? qNorm.split(' ').filter(Boolean) : [];
  var qPassNorm = query.replace(/\s+/g, '').toLowerCase();
  var rows = _tgReadPilgrimRows_();
  var trips = _tgReadTripsMap_();
  var todayMs = _mfMs_(_mfToday_());

  var byKey = {}, order = [];
  rows.forEach(function (r) {
    if (!_tgPilgrimMatches_(r, qNameTokens, qPassNorm)) return;
    var key = r.passport ? ('P:' + r.passport) : ('N:' + r.name + '|' + r.tripName);
    if (!byKey[key]) { byKey[key] = []; order.push(key); }
    byKey[key].push(r);
  });

  return order.map(function (key) {
    var group = byKey[key];
    var best = group[0], bestActive = false, bestMs = -Infinity;
    group.forEach(function (r) {
      var t = trips[r.tripName] || {};
      var dMs = _mfMs_(_mfDate_(t.departDate)), rMs = _mfMs_(_mfDate_(t.returnDate));
      var active = (!isNaN(dMs) && !isNaN(rMs) && todayMs >= dMs && todayMs <= rMs);
      var dCmp = isNaN(dMs) ? -Infinity : dMs;
      if (active && !bestActive) { best = r; bestActive = true; bestMs = dCmp; }
      else if (active === bestActive && dCmp > bestMs) { best = r; bestMs = dCmp; }
    });
    return { row: best, trip: trips[best.tripName] || {}, active: bestActive };
  });
}
// مكانه الحالي فعلياً وقت الاستعلام: يقارن اليوم بفترتي دخول/خروج مكة والمدينة بالرحلة —
// ويعيد فندق وغرفة ذلك المعتمر تحديداً (قد يختلفان عن فندق الرحلة الأساسي في مجموعات متعددة الفنادق)
function _tgCurrentStay_(row, trip) {
  var todayMs = _mfMs_(_mfToday_());
  var within = function (a, b) { return !isNaN(a) && !isNaN(b) && todayMs >= a && todayMs < b; };
  if (within(_mfMs_(_mfDate_(trip.madinahIn)), _mfMs_(_mfDate_(trip.madinahOut)))) {
    return { city: 'المدينة المنوَّرة 🕌', hotel: row.hotelMadinah || trip.madinahHotel, room: row.roomNoMadinah || row.roomNo };
  }
  if (within(_mfMs_(_mfDate_(trip.makkahIn)), _mfMs_(_mfDate_(trip.makkahOut)))) {
    return { city: 'مكة المكرَّمة 🕋', hotel: row.hotelMakkah || trip.makkahHotel, room: row.roomNoMakkah || row.roomNo };
  }
  return null;
}
// ملف/ملفات مراجعة الوزارة الخاصة بهذا المعتمر بهذه الرحلة (نفس منطق _mfFilesForTrip_ بالواجهة)
function _tgMfForPilgrim_(tripName, passport) {
  if (!tripName) return [];
  var files;
  try { files = _mfReadAll_().filter(function (f) { return f.tripName === tripName; }); } catch (e) { return []; }
  return files.filter(function (f) {
    if (!(f.selected || []).length) return true;
    if (!passport) return true;
    return f.selected.indexOf(passport) >= 0 || f.selected.indexOf('P:' + passport) >= 0;
  });
}
// مجموعة/مجموعات التأشيرات الخاصة بهذا المعتمر بهذه الرحلة (بالجواز إن حُدِّد، وإلا بالعميل)
function _tgVzForPilgrim_(tripName, passport, client) {
  if (!tripName) return [];
  var files;
  try { files = _vzReadAll_().filter(function (f) { return f.tripName === tripName; }); } catch (e) { return []; }
  return files.filter(function (f) {
    if ((f.selected || []).length) return passport && (f.selected.indexOf(passport) >= 0 || f.selected.indexOf('P:' + passport) >= 0);
    if ((f.breakdown || []).length) return f.breakdown.some(function (b) { return b.name === client; });
    return true;
  });
}
// كل نتائج بحث دُفعة واحدة (لبناء قائمة اختيار عند تعدّد المطابقات) — تُخزَّن مؤقتاً في الكاش
// بمعرِّف قصير (sid) لأن أزرار تيليجرام محدودة الحجم فلا يمكن حمل الاسم والجواز كاملين بها
function _tgSrchResultsKey_(chatId, sid) { return 'srchres_' + chatId + '_' + sid; }
function _tgSrchStoreResults_(chatId, people) {
  var sid = Utilities.getUuid().replace(/-/g, '').substring(0, 8);
  var slim = people.map(function (p) { return { t: p.row.tripName, p: p.row.passport, n: p.row.name }; });
  CacheService.getScriptCache().put(_tgSrchResultsKey_(chatId, sid), JSON.stringify(slim), 600);
  return sid;
}
function _tgSrchLoadResult_(chatId, sid, idx) {
  var raw = CacheService.getScriptCache().get(_tgSrchResultsKey_(chatId, sid));
  if (!raw) return null;
  var list = JSON.parse(raw);
  var item = list[idx]; if (!item) return null;
  var row = _tgReadPilgrimRows_().filter(function (r) {
    return r.tripName === item.t && (item.p ? r.passport === item.p : (r.name === item.n && !r.passport));
  })[0];
  if (!row) return null;
  var trips = _tgReadTripsMap_();
  var trip = trips[row.tripName] || {};
  var todayMs = _mfMs_(_mfToday_());
  var dMs = _mfMs_(_mfDate_(trip.departDate)), rMs = _mfMs_(_mfDate_(trip.returnDate));
  var active = (!isNaN(dMs) && !isNaN(rMs) && todayMs >= dMs && todayMs <= rMs);
  return { row: row, trip: trip, active: active };
}
// رسالة بيانات معتمر واحد كاملة — بكل الحقول المطلوبة
function _tgPilgrimDetailMsg_(person) {
  var r = person.row, t = person.trip || {};
  var stay = _tgCurrentStay_(r, t);
  var msg = '🔎 <b>بيانات المعتمر</b>\n━━━━━━━━━━━━━━━━━━\n';
  msg += '👤 <b>الاسم:</b> ' + (r.name || '—') + '\n';
  msg += '🛂 <b>رقم الجواز:</b> ' + (r.passport || '—') + '\n';
  msg += '👥 <b>العميل:</b> ' + (r.client || '—') + '\n';
  msg += '🧳 <b>الرحلة:</b> ' + (r.tripName || '—') + (person.active ? '  ▶ <b>جارية الآن</b>' : '') + '\n';
  msg += '🧑‍✈️ <b>المشرف:</b> ' + (t.supervisor || '—') + '\n';
  if (t.supervisorPhones) msg += '📱 <b>جوال المشرف:</b> ' + t.supervisorPhones + '\n';
  if (stay) {
    msg += '📍 <b>مكانه الآن — ' + stay.city + ':</b>\n' +
      '   🏨 الفندق: ' + (stay.hotel || '—') + (r.accommodation ? '  |  🛏️ ' + r.accommodation : '') +
      (stay.room ? '  |  🔑 غرفة ' + stay.room : '') + '\n';
  } else {
    msg += '📍 <b>السكن (خارج فترتي الإقامة المسجَّلتين حالياً):</b>\n' +
      '   🕌 المدينة: ' + (r.hotelMadinah || t.madinahHotel || '—') + (r.roomNoMadinah ? ' — غرفة ' + r.roomNoMadinah : '') + '\n' +
      '   🕋 مكة: ' + (r.hotelMakkah || t.makkahHotel || '—') + (r.roomNoMakkah ? ' — غرفة ' + r.roomNoMakkah : '') + '\n';
  }
  var mfHits = _tgMfForPilgrim_(r.tripName, r.passport);
  msg += '🏛️ <b>ملف مراجعة الوزارة:</b> ' + (mfHits.length
    ? mfHits.map(function (f) { return (f.fileNo || 'بلا رقم') + (f.reviewDate ? ' ✓' : ' ⏳'); }).join('، ')
    : 'لا يوجد') + '\n';
  msg += '🎫 <b>رقم الإشعار:</b> ' + (r.bookingId || t.linkedBookingId || '—') + '\n';
  var vzHits = _tgVzForPilgrim_(r.tripName, r.passport, r.client);
  msg += '🛂 <b>مجموعة التأشيرات:</b> ' + (vzHits.length
    ? vzHits.map(function (f) { return (f.ref || ('#' + f.seq)) + (f.status ? ' (' + f.status + ')' : ''); }).join('، ')
    : 'لا يوجد') + '\n';
  msg += '🇸🇦 <b>الوكيل السعودي:</b> ' + (t.agent || '—') + '\n';
  msg += '🏢 <b>الشركة المصرية:</b> ' + (t.company || '—');
  return msg;
}
// نقطة الدخول الموحَّدة: يُشغَّل من الأمر المباشر «بحث: ...» ومن محادثة الزر معاً
function _tgRunSearch_(chatId, query) {
  query = String(query || '').trim();
  if (!query) { sendTelegramMessageDirect(chatId, '⚠️ اكتب اسم المعتمر أو رقم جوازه بعد «بحث:».'); return; }
  var people = _tgSearchPilgrim_(query);
  if (!people.length) {
    sendTelegramMessageDirect(chatId, '🚫 لم يُعثر على معتمر مطابق لـ «' + query + '».\nجرِّب اسماً أقصر أو جزءاً من رقم الجواز.');
    return;
  }
  if (people.length === 1) {
    sendTelegramMessageDirect(chatId, _tgPilgrimDetailMsg_(people[0]));
    return;
  }
  if (people.length > 20) {
    sendTelegramMessageDirect(chatId, '⚠️ عدد النتائج كبير جداً (' + people.length + ') — اكتب اسماً أكثر تحديداً أو رقم الجواز كاملاً.');
    return;
  }
  var sid = _tgSrchStoreResults_(chatId, people);
  var rows = people.map(function (p, i) {
    var label = '👤 ' + p.row.name + (p.row.passport ? ' — 🛂 ' + p.row.passport : '') +
      (p.row.tripName ? ' — 🧳 ' + p.row.tripName : '');
    if (label.length > 60) label = label.substring(0, 57) + '...';
    return [{ text: label, callback_data: 'srch:' + sid + ':' + i }];
  });
  var token = TELEGRAM_CONFIG.token;
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  var payload = {
    "chat_id": chatId,
    "text": "🔎 <b>تعدَّدت المطابقات (" + people.length + ") — اختر المعتمر المطلوب:</b>",
    "parse_mode": "HTML",
    "reply_markup": JSON.stringify({ "inline_keyboard": rows })
  };
  UrlFetchApp.fetch(url, { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload) });
}

/* ==================================================================================
   🛂 (V4.131) متابعة التأشيرات والوكلاء — شاشة مستقلة على غرار «مراجعة ملفات الوزارة»:
   لكل قيد تأشيرات: رقم قيد يدوي + تاريخ + حالة + شركة مصرية + وكيل سعودي + ربط رحلة/رحلات +
   جلب أسماء المعتمرين وتخصيصهم لعملاء + عدد تأشيرات = مستحق الوكيل (عدد × سعر التأشيرة بالريال).
   سعر التأشيرة يُجلب تلقائياً من «تسعير الوكلاء» حسب الوكيل وتاريخ القيد (فترات صلاحية مثل رسوم
   الغرفة: من تاريخ → إلى تاريخ/مفتوح)، وقابل للتعديل يدوياً بالقيد. لكل وكيل حساب مستقل تماماً
   عن حسابات العملاء (دفعات + بنود مدينة/دائنة + كشف)، وإحصائيات بفلاتر متعددة.
   ================================================================================== */
var VZ_FILES_SHEET   = 'VisaFiles';
// 🧩 (V4.132) توسّع الشيت لنموذج «المجموعات والوكلاء»: رقم المجموعة (ref) + العدد (visaCount) +
// حالة السداد + سكن مكة/المدينة بتواريخ دخول/خروج + أرقام اتفاقيات السكن والإعاشة للمدينتين.
// الأعمدة الجديدة مُلحَقة بالنهاية (17→25) فلا تتأثر فهارس البيانات القديمة، و_accSheet_ يُرقّي
// صف العناوين تلقائياً عند فتح شيت أقدم.
var VZ_FILES_HEADERS = ['المعرف','مسلسل','رقم المجموعة','الحالة','التاريخ','الشركة المصرية','الوكيل السعودي',
  'الرحلة المرتبطة','بنود العملاء (JSON)','المعتمرون المختارون (JSON)','العدد','سعر الفرد','ملاحظات',
  'أنشئ بواسطة','أنشئ في','عُدّل بواسطة','عُدّل في',
  'حالة السداد','سكن مكة دخول','سكن مكة خروج','سكن المدينة دخول','سكن المدينة خروج',
  'رقم اتفاقية سكن مكة','رقم اتفاقية سكن المدينة','رقم اتفاقية اعاشة مكة','رقم اتفاقية اعاشة المدينة',
  // 🏨 (V4.134) السكن متعدد الفنادق: مصفوفة {city,hotel,count,in,out,hAgr,cAgr,supplier} — المجموعة
  // الواحدة قد تُوزَّع على أكثر من فندق في المدينة الواحدة، ومجموع أعدادها لكل مدينة = عدد المجموعة.
  // الأعمدة 18→25 تبقى كما هي للتوافق الرجعي (أول سكن لكل مدينة يُكتب فيها أيضاً).
  'السكن والاتفاقيات (JSON)'];
var VZ_PAY_STATUSES_ = ['', 'تم إصدار الموقّع', 'تم الإرسال', 'تم السداد'];
var VZ_PRICES_SHEET  = 'VisaAgentPrices';
var VZ_PRICES_HEADERS = ['الوكيل','السعر','من تاريخ','إلى تاريخ','أنشئ بواسطة','أنشئ في'];
var VZ_ITEMS_SHEET   = 'AgentAccounts_Items';
var VZ_ITEMS_HEADERS = ['المعرف','الوكيل','البيان','العملة','القيمة','دائن؟','ملاحظات','الترتيب','أنشئ بواسطة','أنشئ في'];
var VZ_PAY_SHEET     = 'AgentAccounts_Payments';
var VZ_PAY_HEADERS   = ['المعرف','الوكيل','التاريخ','المبلغ','العملة','ملاحظات','أنشئ بواسطة','أنشئ في'];
var VZ_STATUSES_     = ['تم الإرسال','تم السداد','تم إصدار الموفا'];
var VZ_BOOTSTRAP_CACHE_KEY = 'visa_bootstrap_cache';

function _vzPerm_(authToken, cap) {
  var session = requireAuth_(authToken);
  if (_sessionHasPerm_(session, 'visas.' + cap)) return session;
  throw new Error('لا تملك صلاحية ' + ({view:'عرض',add:'إضافة',edit:'تعديل',delete:'حذف'}[cap] || cap) + ' متابعة التأشيرات والوكلاء');
}
function _vzClearCache_() { try { CacheService.getScriptCache().remove(VZ_BOOTSTRAP_CACHE_KEY); } catch (e) {} }

function _vzRowToObj_(r) {
  var bd = []; try { bd = JSON.parse(_mfStr_(r[8]) || '[]'); if (!Array.isArray(bd)) bd = []; } catch (e) { bd = []; }
  var sel = []; try { sel = JSON.parse(_mfStr_(r[9]) || '[]'); if (!Array.isArray(sel)) sel = []; } catch (e) { sel = []; }
  var hz = []; try { hz = JSON.parse(_mfStr_(r[26]) || '[]'); if (!Array.isArray(hz)) hz = []; } catch (e) { hz = []; }
  return {
    id: _mfStr_(r[0]), seq: _mfNum_(r[1]), ref: _mfStr_(r[2]), status: _mfStr_(r[3]) || VZ_STATUSES_[0],
    date: _mfStr_(r[4]), company: _mfStr_(r[5]), agent: _mfStr_(r[6]), tripName: _mfStr_(r[7]),
    breakdown: bd, selected: sel, visaCount: _mfNum_(r[10]), price: _mfNum_(r[11]), notes: _mfStr_(r[12]),
    createdBy: _mfStr_(r[13]), createdAt: _mfDateTime_(r[14]), updatedBy: _mfStr_(r[15]), updatedAt: _mfDateTime_(r[16]),
    payStatus: _mfStr_(r[17]), makkahIn: _mfStr_(r[18]), makkahOut: _mfStr_(r[19]),
    madinahIn: _mfStr_(r[20]), madinahOut: _mfStr_(r[21]),
    makkahHousingAgr: _mfStr_(r[22]), madinahHousingAgr: _mfStr_(r[23]),
    makkahCateringAgr: _mfStr_(r[24]), madinahCateringAgr: _mfStr_(r[25]),
    housing: hz
  };
}
// 🏨 (V4.134) ترقية السكن القديم (حقول مكة/المدينة المفردة) إلى مصفوفة السكن المتعدد
function _vzHousingNormalize_(f) {
  var hz = Array.isArray(f.housing) ? f.housing.slice() : [];
  hz = hz.filter(function (h) { return h && (_mfStr_(h.hotel) || _mfStr_(h.in) || _mfStr_(h.out) || _mfStr_(h.hAgr) || _mfStr_(h.cAgr) || _mfNum_(h.count)); });
  if (!hz.length) {
    if (_mfStr_(f.makkahIn) || _mfStr_(f.makkahOut) || _mfStr_(f.makkahHousingAgr) || _mfStr_(f.makkahCateringAgr)) {
      hz.push({ city: 'مكة', hotel: '', count: _mfNum_(f.visaCount), in: _mfStr_(f.makkahIn), out: _mfStr_(f.makkahOut),
        hAgr: _mfStr_(f.makkahHousingAgr), cAgr: _mfStr_(f.makkahCateringAgr), supplier: '' });
    }
    if (_mfStr_(f.madinahIn) || _mfStr_(f.madinahOut) || _mfStr_(f.madinahHousingAgr) || _mfStr_(f.madinahCateringAgr)) {
      hz.push({ city: 'المدينة', hotel: '', count: _mfNum_(f.visaCount), in: _mfStr_(f.madinahIn), out: _mfStr_(f.madinahOut),
        hAgr: _mfStr_(f.madinahHousingAgr), cAgr: _mfStr_(f.madinahCateringAgr), supplier: '' });
    }
  }
  return hz.map(function (h) {
    return { city: _mfStr_(h.city) || 'مكة', hotel: _mfStr_(h.hotel), count: _mfNum_(h.count),
      in: _mfDate_(h.in), out: _mfDate_(h.out), hAgr: _mfStr_(h.hAgr), cAgr: _mfStr_(h.cAgr), supplier: _mfStr_(h.supplier) };
  });
}
// أول سكن لمدينة — لملء الأعمدة المفردة (التوافق الرجعي والفلاتر والطباعة)
function _vzHousingFirst_(hz, city) {
  for (var i = 0; i < (hz || []).length; i++) if (hz[i].city === city) return hz[i];
  return null;
}
function _vzObjToRow_(f) {
  return [f.id, f.seq, _mfStr_(f.ref), _mfStr_(f.status), _mfDate_(f.date), _mfStr_(f.company), _mfStr_(f.agent),
    _mfStr_(f.tripName), JSON.stringify(f.breakdown || []), JSON.stringify(f.selected || []),
    _mfNum_(f.visaCount), _mfNum_(f.price), _mfStr_(f.notes),
    f.createdBy, f.createdAt, f.updatedBy, f.updatedAt,
    _mfStr_(f.payStatus), _mfDate_(f.makkahIn), _mfDate_(f.makkahOut), _mfDate_(f.madinahIn), _mfDate_(f.madinahOut),
    _mfStr_(f.makkahHousingAgr), _mfStr_(f.madinahHousingAgr), _mfStr_(f.makkahCateringAgr), _mfStr_(f.madinahCateringAgr),
    JSON.stringify(f.housing || [])];
}
function _vzReadAll_() {
  var sh = _accSheet_(VZ_FILES_SHEET, VZ_FILES_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, VZ_FILES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!_mfStr_(vals[i][0])) continue;
    var o = _vzRowToObj_(vals[i]); o._row = i + 2; out.push(o);
  }
  return out;
}
function _vzNextSeq_() {
  var sh = _accSheet_(VZ_FILES_SHEET, VZ_FILES_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var vals = sh.getRange(2, 2, last - 1, 1).getValues();
  var mx = 0; vals.forEach(function (r) { var n = _mfNum_(r[0]); if (n > mx) mx = n; });
  return mx + 1;
}
// كل أسعار الوكلاء (مصفوفة صفوف) — تُقرأ مرة وتُمرَّر لـ_vzPriceAt_ لتفادي القراءة المتكررة
function _vzReadPrices_() {
  var sh = _accSheet_(VZ_PRICES_SHEET, VZ_PRICES_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, VZ_PRICES_HEADERS.length).getValues().map(function (r, i) {
    return { agent: _mfStr_(r[0]), price: _mfNum_(r[1]), from: _mfDate_(r[2]), to: _mfDate_(r[3]), _row: i + 2 };
  }).filter(function (p) { return p.agent; });
}
// سعر تأشيرة الوكيل الساري في تاريخ بعينه — أحدث فترة تحتوي التاريخ (وإلا 0)
function _vzPriceAt_(agent, dateStr, prices) {
  agent = _mfStr_(agent);
  var t = _mfMs_(_mfDate_(dateStr));
  if (!agent || isNaN(t)) return 0;
  prices = prices || _vzReadPrices_();
  var best = null, bestFrom = -1;
  prices.forEach(function (p) {
    if (_mfStr_(p.agent) !== agent) return;
    var fm = _mfMs_(p.from); if (isNaN(fm)) return;
    var to = p.to ? _mfMs_(p.to) : 8640000000000000; if (isNaN(to)) to = 8640000000000000;
    if (t >= fm && t <= to && fm >= bestFrom) { best = p.price; bestFrom = fm; }
  });
  return best === null ? 0 : best;
}
// المستحق على كل وكيل من قيود التأشيرات (عدد × سعر) — خريطة {agent: totalالسعودي}
function _vzAgentVisaDue_(files) {
  var m = {};
  (files || []).forEach(function (f) {
    var a = _mfStr_(f.agent); if (!a) return;
    m[a] = (m[a] || 0) + (_mfNum_(f.visaCount) * _mfNum_(f.price));
  });
  return m;
}

/* -------- حساب الوكيل: بنود يدوية + دفعات (بالريال والجنيه) -------- */
function _vzReadItems_(agent) {
  var sh = _accSheet_(VZ_ITEMS_SHEET, VZ_ITEMS_HEADERS);
  var last = sh.getLastRow(); if (last < 2) return [];
  var a = _mfStr_(agent);
  return sh.getRange(2, 1, last - 1, VZ_ITEMS_HEADERS.length).getValues().map(function (r, i) {
    return { id: _mfStr_(r[0]), agent: _mfStr_(r[1]), desc: _mfStr_(r[2]), currency: _mfStr_(r[3]) || 'SAR',
      value: _accNum_(r[4]), isCredit: _mfStr_(r[5]) === 'نعم', notes: _mfStr_(r[6]), order: _accNum_(r[7]),
      createdBy: _mfStr_(r[8]), createdAt: _mfStr_(r[9]), _row: i + 2 };
  }).filter(function (x) { return x.id && (!a || x.agent === a); });
}
function _vzReadPays_(agent) {
  var sh = _accSheet_(VZ_PAY_SHEET, VZ_PAY_HEADERS);
  var last = sh.getLastRow(); if (last < 2) return [];
  var a = _mfStr_(agent);
  return sh.getRange(2, 1, last - 1, VZ_PAY_HEADERS.length).getValues().map(function (r, i) {
    return { id: _mfStr_(r[0]), agent: _mfStr_(r[1]), date: _mfStr_(r[2]), amount: _accNum_(r[3]),
      currency: _mfStr_(r[4]) || 'SAR', notes: _mfStr_(r[5]), createdBy: _mfStr_(r[6]), createdAt: _mfStr_(r[7]), _row: i + 2 };
  }).filter(function (x) { return x.id && (!a || x.agent === a); });
}
// صافي حساب وكيل: مستحق (بالريال من التأشيرات + بنود مدينة) − دائن − مدفوع، لكل عملة على حدة
/* ============================================================
   🧑‍💼 (V4.134) حسابات الوكيل مع الشركات المصرية
   ------------------------------------------------------------
   الوكيل الواحد قد يعمل مع أكثر من شركة مصرية، وقد يريد المستخدم لكل شركة
   حساباً مالياً منفصلاً تماماً (دفعات وبنود مستقلة)، أو دمج عدة شركات في حساب
   واحد تحت «الشركة الرئيسية». يُضبط ذلك من زر «إعدادات حسابات الوكلاء».
   مفتاح الحساب:
     • بلا إعداد           ⇒ «الوكيل»            (حساب عام يجمع كل شركاته)
     • نمط «منفصل»          ⇒ «الوكيل - الشركة»
     • نمط «مشترك» + رئيسية ⇒ «الوكيل - الشركة الرئيسية»
   جدول المجموعات يظل يعرض الشركة المصرية الحقيقية لكل مجموعة مهما كان الدمج.
   ============================================================ */
var VZ_ACCT_SHEET   = 'AgentCompanyAccounts';
var VZ_ACCT_HEADERS = ['الوكيل','الشركة المصرية','نمط الحساب','الشركة الرئيسية','ملاحظات','عُدّل بواسطة','عُدّل في'];
var VZ_ACCT_MODES_  = ['عام', 'منفصل', 'مشترك'];

function _vzAcctRead_() {
  var sh = _accSheet_(VZ_ACCT_SHEET, VZ_ACCT_HEADERS);
  var last = sh.getLastRow(); if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, VZ_ACCT_HEADERS.length).getValues()
    .filter(function (r) { return _mfStr_(r[0]) && _mfStr_(r[1]); })
    .map(function (r, i) {
      return { agent: _mfStr_(r[0]), company: _mfStr_(r[1]), mode: _mfStr_(r[2]) || 'عام',
        mainCompany: _mfStr_(r[3]), notes: _mfStr_(r[4]), _row: i + 2 };
    });
}
// خريطة سريعة: "الوكيل|الشركة" → إعداد
function _vzAcctMap_(rows) {
  var m = {};
  (rows || _vzAcctRead_()).forEach(function (r) { m[r.agent + '|' + r.company] = r; });
  return m;
}
// مفتاح الحساب المالي لزوج (وكيل، شركة)
function _vzAcctKey_(agent, company, map) {
  agent = _mfStr_(agent); company = _mfStr_(company);
  if (!agent) return '';
  var c = map[agent + '|' + company];
  if (!c || c.mode === 'عام') return agent;
  if (c.mode === 'مشترك') return agent + ' - ' + (_mfStr_(c.mainCompany) || company);
  return agent + ' - ' + company;
}
// كل مفاتيح الحسابات المتاحة (وكيل عام + الحسابات الفرعية المُعدَّة) مرتَّبة
function _vzAcctKeys_(agents, map) {
  var keys = {}, sub = {};
  (agents || []).forEach(function (a) { if (a) keys[a] = { key: a, agent: a, company: '', kind: 'عام' }; });
  Object.keys(map).forEach(function (k) {
    var c = map[k]; if (c.mode === 'عام') return;
    var key = _vzAcctKey_(c.agent, c.company, map);
    if (!keys[c.agent]) keys[c.agent] = { key: c.agent, agent: c.agent, company: '', kind: 'عام' };
    if (!sub[key]) sub[key] = { key: key, agent: c.agent, company: key.slice(c.agent.length + 3), kind: c.mode, companies: [] };
    if (sub[key].companies.indexOf(c.company) < 0) sub[key].companies.push(c.company);
  });
  var out = Object.keys(keys).map(function (k) { return keys[k]; })
    .concat(Object.keys(sub).map(function (k) { return sub[k]; }));
  out.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
  return out;
}
// هل هذه المجموعة تنتمي لمفتاح الحساب المطلوب؟ (المفتاح العام يجمع كل شركات الوكيل)
function _vzFileInAcct_(f, acctKey, map) {
  var agent = _mfStr_(f.agent); if (!agent) return false;
  if (acctKey === agent) return true;
  return _vzAcctKey_(agent, f.company, map) === acctKey;
}
function getAgentCompanyAccounts(authToken) {
  _vzPerm_(authToken, 'view');
  var rows = _vzAcctRead_().map(function (r) { var c = {}; for (var k in r) if (k !== '_row') c[k] = r[k]; return c; });
  return { success: true, rows: rows, modes: VZ_ACCT_MODES_ };
}
function saveAgentCompanyAccounts(authToken, rows) {
  var session = _vzFinancePerm_(authToken);   // 🔒 ضبط الحسابات المالية للوكلاء
  rows = Array.isArray(rows) ? rows : [];
  var sh = _accSheet_(VZ_ACCT_SHEET, VZ_ACCT_HEADERS);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, VZ_ACCT_HEADERS.length).clearContent();
  var now = _mfStamp_();
  var out = rows.filter(function (r) { return _mfStr_(r.agent) && _mfStr_(r.company); }).map(function (r) {
    var mode = _mfStr_(r.mode); if (VZ_ACCT_MODES_.indexOf(mode) < 0) mode = 'عام';
    return [_mfStr_(r.agent), _mfStr_(r.company), mode, _mfStr_(r.mainCompany), _mfStr_(r.notes), session.username, now];
  });
  if (out.length) sh.getRange(2, 1, out.length, VZ_ACCT_HEADERS.length).setValues(out);
  _vzClearCache_();
  return { success: true, count: out.length };
}

function _vzAgentBalance_(agent, files, items, pays) {
  // ملاحظة: القائمة تصل مُصفّاة مسبقاً على حساب الوكيل (قد يكون حساباً فرعياً مع شركة بعينها)
  var visaDueS = 0;
  (files || []).forEach(function (f) { visaDueS += _mfNum_(f.visaCount) * _mfNum_(f.price); });
  var dueS = visaDueS, dueE = 0, credS = 0, credE = 0, paidS = 0, paidE = 0;
  (items || []).forEach(function (it) {
    var v = _accNum_(it.value), sar = it.currency !== 'EGP';
    if (it.isCredit) { if (sar) credS += v; else credE += v; }
    else { if (sar) dueS += v; else dueE += v; }
  });
  (pays || []).forEach(function (p) { if (p.currency === 'EGP') paidE += _accNum_(p.amount); else paidS += _accNum_(p.amount); });
  return {
    visaDueS: visaDueS, dueS: dueS, dueE: dueE, credS: credS, credE: credE, paidS: paidS, paidE: paidE,
    netS: Math.round((dueS - credS - paidS) * 100) / 100,
    netE: Math.round((dueE - credE - paidE) * 100) / 100
  };
}

// 🍽️ (V4.132) خريطة أرقام اتفاقيات الإعاشة المسجَّلة بشاشة اتفاقيات الإعاشة، مفهرسة برقم المجموعة
// ثم بالمنطقة (مكة/المدينة) — تُعرض تلقائياً بشاشة المجموعات لو المجموعة مسجَّلة هناك.
// { "رقم المجموعة": { makkah: ["25456", ...], madinah: [...] } }
function _vzCateringByGroup_() {
  var out = {};
  try {
    var sh = getSpreadsheet_().getSheetByName(CATERING_SHEET);
    if (!sh || sh.getLastRow() < 2) return out;
    var H = CATERING_HEADERS;
    var iNo = H.indexOf('رقم الاتفاقية'), iArea = H.indexOf('منطقة الخدمة'), iGrp = H.indexOf('رقم المجموعة');
    if (iGrp < 0 || iNo < 0) return out;
    sh.getRange(2, 1, sh.getLastRow() - 1, H.length).getValues().forEach(function (r) {
      var grp = _mfStr_(r[iGrp]); if (!grp) return;
      var no = _mfStr_(r[iNo]); if (!no) return;
      var area = _mfStr_(iArea >= 0 ? r[iArea] : '');
      var city = (area.indexOf('مكة') >= 0 || area.indexOf('مكه') >= 0) ? 'makkah'
        : (area.indexOf('مدين') >= 0 ? 'madinah' : 'other');
      if (!out[grp]) out[grp] = { makkah: [], madinah: [], other: [] };
      if (out[grp][city].indexOf(no) < 0) out[grp][city].push(no);
    });
  } catch (e) {}
  return out;
}

function getVisaBootstrap(authToken) {
  var session = _vzPerm_(authToken, 'view');
  var shared = getCachedData(VZ_BOOTSTRAP_CACHE_KEY);
  if (!shared) {
    var files = _vzReadAll_();
    var prices = _vzReadPrices_();
    files.forEach(function (f) { f.dueSAR = _mfNum_(f.visaCount) * _mfNum_(f.price); delete f._row; });
    // نُعيد استخدام نفس شركات/وكلاء/رحلات/عملاء بوتستراب الوزارة (بلا تكرار الكود)
    var base = _mfBuildSharedBootstrap_();
    // أرصدة الوكلاء (صافي كل وكيل) من التأشيرات + البنود + الدفعات
    var allItems = _vzReadItems_(''), allPays = _vzReadPays_('');
    var agentsSet = {};
    (base.companies || []).forEach(function (c) { if (c.agent) agentsSet[c.agent] = true; });
    files.forEach(function (f) { if (f.agent) agentsSet[f.agent] = true; });
    allItems.forEach(function (it) { if (it.agent) agentsSet[it.agent] = true; });
    allPays.forEach(function (p) { if (p.agent) agentsSet[p.agent] = true; });
    // 🧑‍💼 (V4.134) الأرصدة تُحسب لكل «مفتاح حساب» (الوكيل العام + حساباته الفرعية مع الشركات)
    // ⚡ (V4.139) قراءة شيت الربط مرة واحدة فقط بدل مرتين (كانت acctMap وacctRows تقرآنه منفصلتين)
    var acctRowsRaw = _vzAcctRead_();
    var acctMap = _vzAcctMap_(acctRowsRaw);
    var accounts = _vzAcctKeys_(Object.keys(agentsSet), acctMap);
    var agentBalances = {};
    accounts.forEach(function (ac) {
      agentBalances[ac.key] = _vzAgentBalance_(ac.key,
        files.filter(function (f) { return _vzFileInAcct_(f, ac.key, acctMap); }),
        allItems.filter(function (it) { return it.agent === ac.key; }),
        allPays.filter(function (p) { return p.agent === ac.key; }));
    });
    shared = {
      files: files, prices: prices, companies: base.companies, trips: base.trips, clients: base.clients,
      agents: Object.keys(agentsSet).sort(), statuses: VZ_STATUSES_, payStatuses: VZ_PAY_STATUSES_,
      accounts: accounts, acctRows: acctRowsRaw.map(function (r) { var c = {}; for (var k in r) if (k !== '_row') c[k] = r[k]; return c; }),
      acctModes: VZ_ACCT_MODES_,
      agentBalances: agentBalances, cateringByGroup: _vzCateringByGroup_(),
      housingByGroup: _vzHousingAgrByGroup_(), today: _mfToday_()
    };
    setCachedData(VZ_BOOTSTRAP_CACHE_KEY, shared);
  }
  var out = {}; for (var k in shared) out[k] = shared[k];
  out.success = true; out.user = session.username;
  var finance = _vzHasFinance_(session);
  out.can = {
    add: _sessionHasPerm_(session, 'visas.add'), edit: _sessionHasPerm_(session, 'visas.edit'),
    del: _sessionHasPerm_(session, 'visas.delete'), finance: finance
  };
  // 🔒 (V4.133) الجانب المالي (الأسعار/المستحق/أرصدة الوكلاء) لا يُرسَل إطلاقاً لمن لا يملك صلاحية
  // visas.finance — فلا يراه من يسجّل ويتابع فقط. نُعيد بناء نسخة منزوعة القيم المالية.
  if (!finance) {
    out.prices = []; out.agentBalances = {};
    out.files = (out.files || []).map(function (f) {
      var c = {}; for (var k2 in f) c[k2] = f[k2];
      c.price = 0; c.dueSAR = 0; return c;
    });
  }
  return out;
}
/* 🔗 (V4.133) أرقام مجموعات التأشيرات مفهرسة بالرحلة — ليعرض السجل العام رقم المجموعة
   مع بيانات كل معتمر/عميل (نفس أسلوب ربط ملفات الوزارة بالسجل). لا تُرسَل أي بيانات مالية. */
function getVisaTripLinks(authToken) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'visas.view') && !_sessionHasPerm_(session, 'registry.view') &&
      !_sessionHasPerm_(session, 'trips.view')) return { success: true, links: {} };
  var links = {};
  _vzReadAll_().forEach(function (f) {
    var t = _mfStr_(f.tripName); if (!t) return;
    if (!links[t]) links[t] = [];
    links[t].push({
      id: f.id, ref: f.ref, seq: f.seq, status: f.status, date: f.date,
      agent: f.agent, company: f.company,
      clients: (f.breakdown || []).map(function (b) { return _mfStr_(b.name); }),
      selected: Array.isArray(f.selected) ? f.selected : []
    });
  });
  return { success: true, links: links };
}
function _vzHasFinance_(session) { return _sessionHasPerm_(session, 'visas.finance'); }
function _vzFinancePerm_(authToken) {
  var session = requireAuth_(authToken);
  if (_vzHasFinance_(session)) return session;
  throw new Error('لا تملك صلاحية الجانب المالي في متابعة التأشيرات والوكلاء');
}

function saveVisaFile(authToken, data) {
  var isNew = !_mfStr_(data && data.id);
  var session = _vzPerm_(authToken, isNew ? 'add' : 'edit');
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { success: false, error: 'الشيت مشغول — أعد المحاولة بعد لحظات' }; }
  try {
    var sh = _accSheet_(VZ_FILES_SHEET, VZ_FILES_HEADERS);
    var all = _vzReadAll_();
    var old = isNew ? null : all.filter(function (x) { return x.id === _mfStr_(data.id); })[0];
    if (!isNew && !old) return { success: false, error: 'القيد غير موجود' };
    var bd = Array.isArray(data.breakdown) ? data.breakdown.map(function (b) {
      return { name: _mfStr_(b.name), count: _mfNum_(b.count) };
    }).filter(function (b) { return b.name; }) : (old ? old.breakdown : []);
    var visaCount = _mfNum_(data.visaCount);
    if (!visaCount && bd.length) visaCount = bd.reduce(function (a, b) { return a + b.count; }, 0);
    var price = _mfNum_(data.price);
    if (!price) price = _vzPriceAt_(data.agent, data.date);
    var now = _mfStamp_();
    var f = {
      id: isNew ? _accId_('VZ') : old.id, seq: isNew ? _vzNextSeq_() : old.seq,
      ref: _mfStr_(data.ref), status: _mfStr_(data.status) || VZ_STATUSES_[0], date: _mfDate_(data.date),
      company: _mfStr_(data.company), agent: _mfStr_(data.agent), tripName: _mfStr_(data.tripName),
      breakdown: bd, selected: Array.isArray(data.selected) ? data.selected : (old ? old.selected : []),
      visaCount: visaCount, price: price, notes: _mfStr_(data.notes),
      createdBy: isNew ? session.username : old.createdBy, createdAt: isNew ? now : old.createdAt,
      updatedBy: session.username, updatedAt: now,
      payStatus: _mfStr_(data.payStatus), makkahIn: _mfDate_(data.makkahIn), makkahOut: _mfDate_(data.makkahOut),
      madinahIn: _mfDate_(data.madinahIn), madinahOut: _mfDate_(data.madinahOut),
      makkahHousingAgr: _mfStr_(data.makkahHousingAgr), madinahHousingAgr: _mfStr_(data.madinahHousingAgr),
      makkahCateringAgr: _mfStr_(data.makkahCateringAgr), madinahCateringAgr: _mfStr_(data.madinahCateringAgr),
      housing: Array.isArray(data.housing) ? data.housing : (old ? old.housing : [])
    };
    // 🏨 (V4.134) تطبيع السكن المتعدد + مزامنة الحقول المفردة منه (أول فندق لكل مدينة)
    f.housing = _vzHousingNormalize_(f);
    var _hMk = _vzHousingFirst_(f.housing, 'مكة'), _hMd = _vzHousingFirst_(f.housing, 'المدينة');
    if (_hMk) { f.makkahIn = _hMk.in; f.makkahOut = _hMk.out; f.makkahHousingAgr = _hMk.hAgr; f.makkahCateringAgr = _hMk.cAgr; }
    if (_hMd) { f.madinahIn = _hMd.in; f.madinahOut = _hMd.out; f.madinahHousingAgr = _hMd.hAgr; f.madinahCateringAgr = _hMd.cAgr; }
    var row = _vzObjToRow_(f);
    if (isNew) sh.appendRow(row); else sh.getRange(old._row, 1, 1, VZ_FILES_HEADERS.length).setValues([row]);
    SpreadsheetApp.flush();
    // 🔗 (V4.134) ربط ثنائي الاتجاه: أرقام اتفاقيات السكن المكتوبة بالمجموعة تُسجَّل تخصيصاً
    // في شاشة اتفاقيات السكن تلقائياً (والعكس مُنفَّذ في saveHousingAllocation)
    try { _vzSyncGroupHousingAllocs_(f, session.username); } catch (eSync) {}
    logChange_(session.username, isNew ? 'إضافة قيد تأشيرات' : 'تعديل قيد تأشيرات',
      f.agent || '-', 'قيد ' + (f.ref || f.seq), old ? (old.visaCount + '×' + old.price) : '-', f.visaCount + '×' + f.price);
    _vzClearCache_();
    f.dueSAR = f.visaCount * f.price;
    return { success: true, file: f };
  } finally { lock.releaseLock(); }
}

/* 📥 (V4.134) استيراد المجموعات القديمة دفعةً واحدة بعد معاينتها وتعديلها بالشاشة.
   يتخطّى أي مجموعة برقم مسجَّل من قبل (منعاً للتكرار) ويُرجع ما استُورد وما تُخطِّي. */
function importVisaFilesBatch(authToken, rows) {
  var session = _vzPerm_(authToken, 'add');
  rows = Array.isArray(rows) ? rows : [];
  if (!rows.length) return { success: false, error: 'لا توجد صفوف للاستيراد' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success: false, error: 'الشيت مشغول — أعد المحاولة' }; }
  try {
    var sh = _accSheet_(VZ_FILES_SHEET, VZ_FILES_HEADERS);
    var all = _vzReadAll_();
    var existing = {};
    all.forEach(function (f) { if (f.ref) existing[f.ref] = 1; });
    var seq = all.reduce(function (m, f) { return Math.max(m, _mfNum_(f.seq)); }, 0);
    var now = _mfStamp_();
    var out = [], skipped = [], imported = 0;
    rows.forEach(function (r) {
      var ref = _mfStr_(r.ref);
      if (ref && existing[ref]) { skipped.push(ref); return; }
      if (ref) existing[ref] = 1;
      var bd = Array.isArray(r.breakdown) ? r.breakdown.map(function (b) {
        return { name: _mfStr_(b.name), count: _mfNum_(b.count) };
      }).filter(function (b) { return b.name; }) : [];
      var cnt = _mfNum_(r.visaCount);
      if (!cnt && bd.length) cnt = bd.reduce(function (a, b) { return a + b.count; }, 0);
      var price = _mfNum_(r.price);
      if (!price) price = _vzPriceAt_(r.agent, r.date);
      var f = {
        id: _accId_('VZ'), seq: ++seq, ref: ref,
        status: _mfStr_(r.status) || VZ_STATUSES_[0], date: _mfDate_(r.date),
        company: _mfStr_(r.company), agent: _mfStr_(r.agent), tripName: _mfStr_(r.tripName),
        breakdown: bd, selected: [], visaCount: cnt, price: price, notes: _mfStr_(r.notes),
        createdBy: session.username, createdAt: now, updatedBy: '', updatedAt: '',
        payStatus: '', makkahIn: _mfDate_(r.makkahIn), makkahOut: _mfDate_(r.makkahOut),
        madinahIn: _mfDate_(r.madinahIn), madinahOut: _mfDate_(r.madinahOut),
        makkahHousingAgr: _mfStr_(r.makkahHousingAgr), madinahHousingAgr: _mfStr_(r.madinahHousingAgr),
        makkahCateringAgr: _mfStr_(r.makkahCateringAgr), madinahCateringAgr: _mfStr_(r.madinahCateringAgr),
        housing: Array.isArray(r.housing) ? r.housing : []
      };
      f.housing = _vzHousingNormalize_(f);
      out.push(_vzObjToRow_(f));
      imported++;
    });
    if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, VZ_FILES_HEADERS.length).setValues(out);
    SpreadsheetApp.flush();
    logChange_(session.username, 'استيراد مجموعات تأشيرات', '-', 'استيراد دفعة',
      '-', 'استُورد ' + imported + ' — تُخطِّي ' + skipped.length);
    _vzClearCache_();
    return { success: true, imported: imported, skipped: skipped.length, skippedRefs: skipped };
  } finally { lock.releaseLock(); }
}

function deleteVisaFile(authToken, id) {
  var session = _vzPerm_(authToken, 'delete');
  var sh = _accSheet_(VZ_FILES_SHEET, VZ_FILES_HEADERS);
  var hit = _vzReadAll_().filter(function (x) { return x.id === _mfStr_(id); })[0];
  if (!hit) return { success: false, error: 'القيد غير موجود' };
  sh.deleteRow(hit._row);
  logChange_(session.username, 'حذف قيد تأشيرات', hit.agent || '-', 'قيد ' + (hit.ref || hit.seq), '-', '-');
  _vzClearCache_();
  return { success: true };
}

/* -------- تسعير الوكلاء (فترات) -------- */
function getVisaAgentPrices(authToken) {
  _vzFinancePerm_(authToken);   // 🔒 (V4.133) مالي
  return { success: true, prices: _vzReadPrices_() };
}
function saveVisaAgentPrices(authToken, agent, periods) {
  var session = _vzFinancePerm_(authToken);   // 🔒 (V4.133) مالي
  agent = _mfStr_(agent);
  if (!agent) return { success: false, error: 'اسم الوكيل مطلوب' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { success: false, error: 'الشيت مشغول — أعد المحاولة' }; }
  try {
    var sh = _accSheet_(VZ_PRICES_SHEET, VZ_PRICES_HEADERS);
    // احذف كل فترات هذا الوكيل ثم أعد كتابتها (تحديث ذرّي بسيط)
    var all = _vzReadPrices_();
    var keepRows = all.filter(function (p) { return _mfStr_(p.agent) !== agent; }).map(function (p) {
      return [p.agent, p.price, p.from, p.to, '', ''];
    });
    var now = _mfStamp_();
    var mine = (Array.isArray(periods) ? periods : []).map(function (p) {
      return [agent, _mfNum_(p.price), _mfDate_(p.from), _mfDate_(p.to), session.username, now];
    }).filter(function (r) { return r[2]; }); // لا بد من تاريخ بداية
    var out = keepRows.concat(mine);
    var lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, VZ_PRICES_HEADERS.length).clearContent();
    if (out.length) sh.getRange(2, 1, out.length, VZ_PRICES_HEADERS.length).setValues(out);
    SpreadsheetApp.flush();
    logChange_(session.username, 'تسعير وكيل تأشيرات', agent, 'عدد الفترات', '-', String(mine.length));
    _vzClearCache_();
    return { success: true, count: mine.length };
  } finally { lock.releaseLock(); }
}

/* -------- حساب وكيل: عرض/دفعات/بنود -------- */
/* 🧾 (V4.134) كشف حساب الوكيل — يقبل «مفتاح حساب»: اسم الوكيل وحده (كل شركاته)
   أو «الوكيل - الشركة» (حساب فرعي منفصل/مشترك كما ضُبط من إعدادات حسابات الوكلاء).
   الدفعات والبنود تُخزَّن بنفس المفتاح فيبقى لكل حساب دفعاته المستقلة. */
function getAgentAccount(authToken, agent, filters) {
  _vzFinancePerm_(authToken);   // 🔒 (V4.133) مالي
  agent = _mfStr_(agent);
  if (!agent) return { success: false, error: 'اسم الوكيل مطلوب' };
  filters = filters || {};
  var map = _vzAcctMap_();
  var files = _vzReadAll_().filter(function (f) { return _vzFileInAcct_(f, agent, map); });
  files.forEach(function (f) {
    f.dueSAR = _mfNum_(f.visaCount) * _mfNum_(f.price);
    f.clientsLabel = (f.breakdown || []).map(function (b) { return b.name + (b.count ? ' (' + b.count + ')' : ''); }).join('، ');
    delete f._row;
  });
  // 🗓️ فلترة الكشف بفترة (مفتوحة البداية أو النهاية) وبالشركة
  var fromMs = _mfMs_(_mfDate_(filters.from)); if (isNaN(fromMs)) fromMs = -8640000000000000;
  var toMs = _mfMs_(_mfDate_(filters.to)); if (isNaN(toMs)) toMs = 8640000000000000;
  var compF = _mfStr_(filters.company);
  var inRange = function (dateStr) {
    var t = _mfMs_(_mfDate_(dateStr));
    if (isNaN(t)) return (fromMs === -8640000000000000 && toMs === 8640000000000000);
    return t >= fromMs && t <= toMs;
  };
  files = files.filter(function (f) { return inRange(f.date) && (!compF || f.company === compF); });
  files.sort(function (a, b) { var x = _mfMs_(a.date), y = _mfMs_(b.date); return (isNaN(x) ? 0 : x) - (isNaN(y) ? 0 : y); });
  // 🧮 الحساب العام (اسم الوكيل وحده) يُجمِّع أيضاً بنود ودفعات حساباته الفرعية، فيكون كشفاً
  // موحَّداً صادقاً؛ أما الحساب الفرعي فيرى بنوده ودفعاته وحده كما طُلب.
  var myKeys = [agent];
  var isGeneral = true;
  Object.keys(map).forEach(function (k) { if (map[k].agent === agent) return; });
  if (agent.indexOf(' - ') > 0) isGeneral = false;
  if (isGeneral) {
    _vzAcctKeys_([agent], map).forEach(function (ac) { if (ac.agent === agent && myKeys.indexOf(ac.key) < 0) myKeys.push(ac.key); });
  }
  var items = [], pays = [];
  myKeys.forEach(function (k) {
    _vzReadItems_(k).forEach(function (x) { items.push(x); });
    _vzReadPays_(k).forEach(function (x) { pays.push(x); });
  });
  pays = pays.filter(function (p) { return inRange(p.date); });
  items.forEach(function (x) { delete x._row; }); pays.forEach(function (x) { delete x._row; });
  pays.sort(function (a, b) { var x = _mfMs_(a.date), y = _mfMs_(b.date); return (isNaN(x) ? 0 : x) - (isNaN(y) ? 0 : y); });
  // الشركات التي يضمّها هذا الحساب فعلياً (تُعرض بترويسة الكشف)
  var comps = {}; files.forEach(function (f) { if (f.company) comps[f.company] = 1; });
  return {
    success: true, agent: agent, files: files, items: items, payments: pays,
    companies: Object.keys(comps).sort(),
    filters: { from: _mfDate_(filters.from), to: _mfDate_(filters.to), company: compF },
    balance: _vzAgentBalance_(agent, files, items, pays)
  };
}
function saveAgentAccItem(authToken, item) {
  var session = _vzFinancePerm_(authToken);   // 🔒 (V4.133) مالي
  var agent = _mfStr_(item && item.agent);
  if (!agent || !_mfStr_(item.desc)) return { success: false, error: 'الوكيل والبيان مطلوبان' };
  var sh = _accSheet_(VZ_ITEMS_SHEET, VZ_ITEMS_HEADERS);
  var now = _mfStamp_();
  var id = _mfStr_(item.id);
  var rowVals = [id || _accId_('AI'), agent, _mfStr_(item.desc), _mfStr_(item.currency) || 'SAR',
    _accNum_(item.value), item.isCredit ? 'نعم' : 'لا', _mfStr_(item.notes), _accNum_(item.order), session.username, now];
  if (id) {
    var hit = _vzReadItems_('').filter(function (x) { return x.id === id; })[0];
    if (!hit) return { success: false, error: 'البند غير موجود' };
    sh.getRange(hit._row, 1, 1, VZ_ITEMS_HEADERS.length).setValues([rowVals]);
  } else { sh.appendRow(rowVals); }
  logChange_(session.username, id ? 'تعديل بند حساب وكيل' : 'إضافة بند حساب وكيل', agent, _mfStr_(item.desc),
    '-', _accNum_(item.value) + ' ' + (item.currency || 'SAR') + (item.isCredit ? ' (دائن)' : ' (مدين)'));
  _vzClearCache_();
  return { success: true };
}
function deleteAgentAccItem(authToken, id) {
  var session = _vzFinancePerm_(authToken);   // 🔒 (V4.133) مالي
  var hit = _vzReadItems_('').filter(function (x) { return x.id === _mfStr_(id); })[0];
  if (!hit) return { success: false, error: 'البند غير موجود' };
  _accSheet_(VZ_ITEMS_SHEET, VZ_ITEMS_HEADERS).deleteRow(hit._row);
  logChange_(session.username, 'حذف بند حساب وكيل', hit.agent, hit.desc, '-', '-');
  _vzClearCache_();
  return { success: true };
}
function saveAgentPayment(authToken, pay) {
  var session = _vzFinancePerm_(authToken);   // 🔒 (V4.133) مالي
  var agent = _mfStr_(pay && pay.agent);
  if (!agent || !_accNum_(pay.amount)) return { success: false, error: 'الوكيل والمبلغ مطلوبان' };
  var sh = _accSheet_(VZ_PAY_SHEET, VZ_PAY_HEADERS);
  var now = _mfStamp_();
  var id = _mfStr_(pay.id);
  var rowVals = [id || _accId_('AP'), agent, _mfDate_(pay.date) || _mfToday_(), _accNum_(pay.amount),
    _mfStr_(pay.currency) || 'SAR', _mfStr_(pay.notes), session.username, now];
  if (id) {
    var hit = _vzReadPays_('').filter(function (x) { return x.id === id; })[0];
    if (!hit) return { success: false, error: 'الدفعة غير موجودة' };
    sh.getRange(hit._row, 1, 1, VZ_PAY_HEADERS.length).setValues([rowVals]);
  } else { sh.appendRow(rowVals); }
  logChange_(session.username, id ? 'تعديل دفعة وكيل' : 'إضافة دفعة وكيل', agent,
    _accNum_(pay.amount) + ' ' + (pay.currency || 'SAR'), '-', '-');
  _vzClearCache_();
  return { success: true };
}
function deleteAgentPayment(authToken, id) {
  var session = _vzFinancePerm_(authToken);   // 🔒 (V4.133) مالي
  var hit = _vzReadPays_('').filter(function (x) { return x.id === _mfStr_(id); })[0];
  if (!hit) return { success: false, error: 'الدفعة غير موجودة' };
  _accSheet_(VZ_PAY_SHEET, VZ_PAY_HEADERS).deleteRow(hit._row);
  logChange_(session.username, 'حذف دفعة وكيل', hit.agent, _accNum_(hit.amount) + ' ' + hit.currency, '-', '-');
  _vzClearCache_();
  return { success: true };
}

/* -------- إحصائيات الوكلاء بفلاتر متعددة -------- */
/* 📊 (V4.134) إحصائيات المجموعات والوكلاء — أعداد فقط بلا أي قيم مالية (فلا تحتاج
   الصلاحية المالية): إجماليات + حسب الوكيل + حسب الحالة + حسب الشركة المصرية
   + جدول متقاطع «الوكيل × الشركة المصرية». الحالات والشركات اختيار متعدد مع «الكل». */
function getAgentVisaStats(authToken, filters) {
  _vzPerm_(authToken, 'view');
  filters = filters || {};
  var fromMs = _mfMs_(_mfDate_(filters.from)); if (isNaN(fromMs)) fromMs = -8640000000000000;
  var toMs = _mfMs_(_mfDate_(filters.to)); if (isNaN(toMs)) toMs = 8640000000000000;
  var companies = Array.isArray(filters.companies) ? filters.companies.map(_mfStr_).filter(Boolean) : [];
  var statuses = Array.isArray(filters.statuses) ? filters.statuses.map(_mfStr_).filter(Boolean) : [];
  var agentsFilter = Array.isArray(filters.agents) ? filters.agents.map(_mfStr_).filter(Boolean) : [];
  var openPeriod = (fromMs === -8640000000000000 && toMs === 8640000000000000);

  var files = _vzReadAll_().filter(function (f) {
    var t = _mfMs_(f.date);
    if (!isNaN(t) && (t < fromMs || t > toMs)) return false;
    if (isNaN(t) && !openPeriod) return false;
    if (companies.length && companies.indexOf(f.company) < 0) return false;
    if (statuses.length && statuses.indexOf(f.status) < 0) return false;
    if (agentsFilter.length && agentsFilter.indexOf(f.agent) < 0) return false;
    return true;
  });

  var byAgent = {}, byStatus = {}, byCompany = {}, cross = {};
  var agentsOrder = [], compsOrder = [];
  var totalVisas = 0, totalFiles = files.length, totalClients = {};
  files.forEach(function (f) {
    var n = _mfNum_(f.visaCount);
    totalVisas += n;
    var A = f.agent || '(بلا وكيل)', S = f.status || '(بلا حالة)', C = f.company || '(بلا شركة)';
    (f.breakdown || []).forEach(function (b) { if (b.name) totalClients[b.name] = 1; });
    (byAgent[A] = byAgent[A] || { agent: A, files: 0, visas: 0 });  byAgent[A].files++;  byAgent[A].visas += n;
    (byStatus[S] = byStatus[S] || { status: S, files: 0, visas: 0 }); byStatus[S].files++; byStatus[S].visas += n;
    (byCompany[C] = byCompany[C] || { company: C, files: 0, visas: 0 }); byCompany[C].files++; byCompany[C].visas += n;
    if (agentsOrder.indexOf(A) < 0) agentsOrder.push(A);
    if (compsOrder.indexOf(C) < 0) compsOrder.push(C);
    var k = A + '|' + C;
    (cross[k] = cross[k] || { agent: A, company: C, files: 0, visas: 0 });
    cross[k].files++; cross[k].visas += n;
  });
  agentsOrder.sort(); compsOrder.sort();
  var arr = function (m) { return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.visas - a.visas; }); };
  return {
    success: true, totalFiles: totalFiles, totalVisas: totalVisas,
    totalClients: Object.keys(totalClients).length,
    byAgent: arr(byAgent), byStatus: arr(byStatus), byCompany: arr(byCompany),
    crossAgents: agentsOrder, crossCompanies: compsOrder,
    cross: Object.keys(cross).map(function (k) { return cross[k]; })
  };
}
/* ============================================================
   🏨 (V4.133 — المرحلة 2) اتفاقيات سكن مكة والمدينة + محرك المتاح
   ------------------------------------------------------------
   نموذج «كثير إلى كثير»: كل اتفاقية سكن لها سعة وفترة (من/إلى)، وتُقسَّم على
   عدة مجموعات؛ وكل مجموعة يمكن أن ترتبط بأكثر من اتفاقية في مكة والمدينة.
   محرك المتاح يحسب المتاح على محور الزمن: يقطع فترة الاتفاقية عند كل حدود
   تخصيص، فيظهر المتاح في كل مقطع على حدة + المتاح طوال الفترة كاملة (الأدنى).
   مثال: اتفاقية 100 من 1-9 إلى 4-9 ومجموعة 40 من 1-9 إلى 4-9 ⇒ متاح 60 (1-9→4-9).
   ثم مجموعة 40 من 1-9 إلى 3-9 ⇒ متاح 20 (1-9→3-9) و60 (3-9→4-9) — أي 20 للفترة كاملة.
   ============================================================ */
var VZ_HAGR_SHEET    = 'HousingAgreements';
var VZ_HAGR_HEADERS  = ['المعرف','مسلسل','رقم الاتفاقية','المدينة','الفندق','العدد','من تاريخ','إلى تاريخ',
  'الحالة','ملاحظات','أنشئ بواسطة','أنشئ في','عُدّل بواسطة','عُدّل في',
  // 🏢 (V4.134) المورد عمود مستقل عن الفندق — ولو كان المورد هو الوكيل السعودي أمكن ترحيل قيمة
  // الاتفاقية إلى الجانب الدائن بحساب ذلك الوكيل. و«نوع الاتفاقية» يفصل اتفاقيات السكن عن الإعاشة.
  'المورد','نوع الاتفاقية'];
var VZ_HA_KINDS_ = ['سكن', 'إعاشة'];
var VZ_HALLOC_SHEET  = 'HousingAllocations';
var VZ_HALLOC_HEADERS = ['المعرف','معرف الاتفاقية','رقم المجموعة','العدد','من تاريخ','إلى تاريخ','ملاحظات','أنشئ بواسطة','أنشئ في'];
var VZ_HA_CITIES_    = ['مكة','المدينة'];
var VZ_HA_STATUSES_  = ['مبدئية','مؤكَّدة','مُوقَّعة','ملغاة'];
var VZ_HA_CACHE_KEY  = 'visa_housing_cache';

function _vzHaClearCache_() { try { CacheService.getScriptCache().remove(VZ_HA_CACHE_KEY); } catch (e) {} try { _vzClearCache_(); } catch (e2) {} }

function _vzHaRowToObj_(r) {
  return { id: _mfStr_(r[0]), seq: _mfNum_(r[1]), agrNo: _mfStr_(r[2]), city: _mfStr_(r[3]), hotel: _mfStr_(r[4]),
    capacity: _mfNum_(r[5]), from: _mfStr_(r[6]), to: _mfStr_(r[7]), status: _mfStr_(r[8]), notes: _mfStr_(r[9]),
    createdBy: _mfStr_(r[10]), createdAt: _mfStr_(r[11]), updatedBy: _mfStr_(r[12]), updatedAt: _mfStr_(r[13]),
    supplier: _mfStr_(r[14]), kind: _mfStr_(r[15]) || 'سكن' };
}
function _vzHaReadAll_() {
  var sh = _accSheet_(VZ_HAGR_SHEET, VZ_HAGR_HEADERS);
  var last = sh.getLastRow(); if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, VZ_HAGR_HEADERS.length).getValues()
    .filter(function (r) { return _mfStr_(r[0]); })
    .map(function (r, i) { var o = _vzHaRowToObj_(r); o._row = i + 2; return o; });
}
function _vzAllocReadAll_() {
  var sh = _accSheet_(VZ_HALLOC_SHEET, VZ_HALLOC_HEADERS);
  var last = sh.getLastRow(); if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, VZ_HALLOC_HEADERS.length).getValues()
    .filter(function (r) { return _mfStr_(r[0]); })
    .map(function (r, i) {
      return { id: _mfStr_(r[0]), agrId: _mfStr_(r[1]), groupRef: _mfStr_(r[2]), count: _mfNum_(r[3]),
        from: _mfStr_(r[4]), to: _mfStr_(r[5]), notes: _mfStr_(r[6]),
        createdBy: _mfStr_(r[7]), createdAt: _mfStr_(r[8]), _row: i + 2 };
    });
}

/* 🧮 محرك المتاح: يقسّم فترة الاتفاقية إلى مقاطع عند كل حدود تخصيص، ويحسب لكل
   مقطع المستخدَم والمتاح، ثم يدمج المقاطع المتجاورة المتساوية. */
function _vzHaSegments_(capacity, from, to, allocs) {
  var cap = _mfNum_(capacity);
  var F = _mfMs_(_mfDate_(from)), T = _mfMs_(_mfDate_(to));
  var used = allocs.reduce(function (a, x) { return a + _mfNum_(x.count); }, 0);
  if (isNaN(F) || isNaN(T) || T <= F) {
    return { segments: [{ from: _mfStr_(from), to: _mfStr_(to), used: used, remaining: cap - used }],
             minRemaining: cap - used, maxUsed: used, totalAllocated: used };
  }
  var pts = {}; pts[F] = 1; pts[T] = 1;
  allocs.forEach(function (x) {
    var f = _mfMs_(_mfDate_(x.from)), t = _mfMs_(_mfDate_(x.to));
    if (isNaN(f)) f = F; if (isNaN(t)) t = T;
    f = Math.max(F, Math.min(T, f)); t = Math.max(F, Math.min(T, t));
    pts[f] = 1; pts[t] = 1;
  });
  var keys = Object.keys(pts).map(Number).sort(function (a, b) { return a - b; });
  var raw = [];
  for (var i = 0; i < keys.length - 1; i++) {
    var a = keys[i], b = keys[i + 1];
    var u = 0;
    allocs.forEach(function (x) {
      var f = _mfMs_(_mfDate_(x.from)), t = _mfMs_(_mfDate_(x.to));
      if (isNaN(f)) f = F; if (isNaN(t)) t = T;
      f = Math.max(F, Math.min(T, f)); t = Math.max(F, Math.min(T, t));
      if (f <= a && t >= b) u += _mfNum_(x.count);
    });
    raw.push({ a: a, b: b, used: u });
  }
  // دمج المقاطع المتجاورة المتساوية في المستخدَم
  var merged = [];
  raw.forEach(function (s) {
    var last = merged[merged.length - 1];
    if (last && last.used === s.used) last.b = s.b; else merged.push({ a: s.a, b: s.b, used: s.used });
  });
  var d = function (ms) { return Utilities.formatDate(new Date(ms), 'Africa/Cairo', 'dd/MM/yyyy'); };
  var segs = merged.map(function (s) { return { from: d(s.a), to: d(s.b), used: s.used, remaining: cap - s.used }; });
  var minRem = segs.length ? Math.min.apply(null, segs.map(function (s) { return s.remaining; })) : cap;
  var maxUsed = segs.length ? Math.max.apply(null, segs.map(function (s) { return s.used; })) : 0;
  return { segments: segs, minRemaining: minRem, maxUsed: maxUsed, totalAllocated: used };
}

// أرقام المجموعات المسجَّلة بشاشة التأشيرات — للبحث التنبّئي وملء العدد والتواريخ تلقائياً
function _vzGroupIndex_() {
  var out = [];
  _vzReadAll_().forEach(function (f) {
    var ref = _mfStr_(f.ref); if (!ref) return;
    out.push({ ref: ref, count: _mfNum_(f.visaCount), agent: f.agent, company: f.company,
      tripName: f.tripName, status: f.status,
      makkahIn: f.makkahIn, makkahOut: f.makkahOut, madinahIn: f.madinahIn, madinahOut: f.madinahOut,
      clients: (f.breakdown || []).map(function (b) { return _mfStr_(b.name); }) });
  });
  return out;
}

/* 🏨 (V4.134) اتفاقيات السكن/الإعاشة مع محرك المتاح + «من في الاتفاقية» في أي تاريخ.
   filters: { from, to, onDate } — الفترة مفتوحة البداية أو النهاية، و onDate يعرض
   المجموعات (وبالتالي العملاء) الموجودة داخل كل اتفاقية في ذلك اليوم تحديداً. */
function getHousingAgreements(authToken, filters) {
  _vzPerm_(authToken, 'view');
  filters = filters || {};
  var fromMs = _mfMs_(_mfDate_(filters.from)); if (isNaN(fromMs)) fromMs = -8640000000000000;
  var toMs = _mfMs_(_mfDate_(filters.to)); if (isNaN(toMs)) toMs = 8640000000000000;
  var onMs = _mfMs_(_mfDate_(filters.onDate));

  var agrs = _vzHaReadAll_(), allocs = _vzAllocReadAll_();
  var byAgr = {};
  allocs.forEach(function (x) { (byAgr[x.agrId] = byAgr[x.agrId] || []).push(x); });
  // فهرس المجموعات: رقم المجموعة → عملاؤها ورحلتها ووكيلها (لعرض «من بالداخل» كاملاً)
  var gIdx = {}; _vzGroupIndex_().forEach(function (g) { gIdx[g.ref] = g; });

  agrs.forEach(function (a) {
    a.allocations = (byAgr[a.id] || []).map(function (x) {
      var c = {}; for (var k in x) if (k !== '_row') c[k] = x[k];
      var g = gIdx[c.groupRef];
      c.clients = g ? (g.clients || []) : [];
      c.tripName = g ? g.tripName : '';
      c.agent = g ? g.agent : '';
      c.company = g ? g.company : '';
      // هل هذا التخصيص ساري في تاريخ الاستعلام؟
      var f = _mfMs_(_mfDate_(c.from)), t = _mfMs_(_mfDate_(c.to));
      c.onDate = !isNaN(onMs) && !isNaN(f) && !isNaN(t) ? (onMs >= f && onMs < t) : false;
      return c;
    });
    var av = _vzHaSegments_(a.capacity, a.from, a.to, a.allocations);
    a.segments = av.segments; a.minRemaining = av.minRemaining; a.totalAllocated = av.totalAllocated;
    // 📅 لقطة التاريخ المطلوب: المشغول والمتاح ومن بالداخل
    if (!isNaN(onMs)) {
      var seg = null;
      (a.segments || []).forEach(function (sg) {
        var f2 = _mfMs_(_mfDate_(sg.from)), t2 = _mfMs_(_mfDate_(sg.to));
        if (!isNaN(f2) && !isNaN(t2) && onMs >= f2 && onMs < t2) seg = sg;
      });
      a.onDateUsed = seg ? seg.used : 0;
      a.onDateRemaining = seg ? seg.remaining : _mfNum_(a.capacity);
      a.onDateGroups = a.allocations.filter(function (c) { return c.onDate; });
      a.onDateInside = !!(seg || a.onDateGroups.length);
    }
    delete a._row;
  });
  // ⏳ فلترة بالفترة: تبقى الاتفاقية التي تتقاطع فترتها مع الفترة المطلوبة
  agrs = agrs.filter(function (a) {
    if (fromMs === -8640000000000000 && toMs === 8640000000000000) return true;
    var f = _mfMs_(_mfDate_(a.from)), t = _mfMs_(_mfDate_(a.to));
    if (isNaN(f) && isNaN(t)) return false;
    if (isNaN(f)) f = t; if (isNaN(t)) t = f;
    return f <= toMs && t >= fromMs;
  });
  if (!isNaN(onMs) && filters.onlyOnDate) agrs = agrs.filter(function (a) { return a.onDateInside; });
  agrs.sort(function (x, y) { return (y.seq || 0) - (x.seq || 0); });
  return { success: true, agreements: agrs, groups: _vzGroupIndex_(),
    cities: VZ_HA_CITIES_, kinds: VZ_HA_KINDS_, suppliers: _vzSupplierList_(),
    onDate: _mfDate_(filters.onDate), today: _mfToday_() };
}
// قائمة الموردين المقترحة: الوكلاء السعوديون + كل مورد سبق تسجيله باتفاقية
function _vzSupplierList_() {
  var set = {};
  try { _vzHaReadAll_().forEach(function (a) { if (a.supplier) set[a.supplier] = 1; }); } catch (e) {}
  try { _vzReadAll_().forEach(function (f) { if (f.agent) set[f.agent] = 1; }); } catch (e2) {}
  return Object.keys(set).sort();
}
/* 🔗 (V4.134) ربط ثنائي الاتجاه — أرقام اتفاقيات السكن المسجَّلة بالمجموعة، مفهرسة برقم المجموعة
   ثم بالمدينة، لتُجلب تلقائياً في نموذج المجموعة كما تُجلب اتفاقيات الإعاشة. */
function _vzHousingAgrByGroup_() {
  var out = {}, byId = {};
  try { _vzHaReadAll_().forEach(function (a) { byId[a.id] = a; }); } catch (e) { return out; }
  try {
    _vzAllocReadAll_().forEach(function (x) {
      var g = _mfStr_(x.groupRef); if (!g) return;
      var a = byId[x.agrId]; if (!a) return;
      var city = a.city === 'المدينة' ? 'madinah' : 'makkah';
      var kind = (a.kind || 'سكن') === 'إعاشة' ? 'catering' : 'housing';
      if (!out[g]) out[g] = { makkah: [], madinah: [], makkahCatering: [], madinahCatering: [] };
      var bucket = kind === 'catering' ? (city + 'Catering') : city;
      var rec = { agrNo: a.agrNo, hotel: a.hotel, supplier: a.supplier, count: x.count, from: x.from, to: x.to };
      if (!out[g][bucket].some(function (y) { return y.agrNo === rec.agrNo; })) out[g][bucket].push(rec);
    });
  } catch (e2) {}
  return out;
}
/* 🔁 (V4.134) عند حفظ المجموعة: كل رقم اتفاقية سكن مكتوب بأحد سكنات المجموعة يُسجَّل
   تخصيصاً في شاشة اتفاقيات السكن تلقائياً (إن لم يكن مسجَّلاً) — والعكس في saveHousingAllocation. */
function _vzSyncGroupHousingAllocs_(f, username) {
  var ref = _mfStr_(f.ref); if (!ref) return;
  var agrs = _vzHaReadAll_(); if (!agrs.length) return;
  var allocs = _vzAllocReadAll_();
  var sh = _accSheet_(VZ_HALLOC_SHEET, VZ_HALLOC_HEADERS);
  var stamp = _mfStamp_();
  (f.housing || []).forEach(function (h) {
    [[_mfStr_(h.hAgr), 'سكن'], [_mfStr_(h.cAgr), 'إعاشة']].forEach(function (pair) {
      var no = pair[0], kind = pair[1]; if (!no) return;
      var a = agrs.filter(function (x) { return x.agrNo === no && x.city === h.city && (x.kind || 'سكن') === kind; })[0];
      if (!a) return;
      if (allocs.some(function (x) { return x.agrId === a.id && x.groupRef === ref; })) return;
      sh.appendRow(['HL' + new Date().getTime() + Math.floor(Math.random() * 999), a.id, ref,
        _mfNum_(h.count) || _mfNum_(f.visaCount), _mfDate_(h.in) || a.from, _mfDate_(h.out) || a.to,
        'ربط تلقائي من بيانات المجموعة', username, stamp]);
    });
  });
  _vzHaClearCache_();
}

function saveHousingAgreement(authToken, data) {
  var isNew = !_mfStr_(data && data.id);
  var session = _vzPerm_(authToken, isNew ? 'add' : 'edit');
  data = data || {};
  var agrNo = _mfStr_(data.agrNo);
  if (!agrNo) throw new Error('أدخل رقم الاتفاقية');
  var city = _mfStr_(data.city);
  if (VZ_HA_CITIES_.indexOf(city) < 0) throw new Error('اختر المدينة (مكة أو المدينة)');
  var sh = _accSheet_(VZ_HAGR_SHEET, VZ_HAGR_HEADERS);
  var all = _vzHaReadAll_();
  // منع تكرار رقم الاتفاقية داخل نفس المدينة
  var kind = _mfStr_(data.kind) || 'سكن';
  var dup = all.filter(function (a) { return a.agrNo === agrNo && a.city === city && (a.kind || 'سكن') === kind && a.id !== _mfStr_(data.id); });
  if (dup.length) throw new Error('اتفاقية ' + kind + ' رقم ' + agrNo + ' مسجَّلة من قبل في ' + city);
  var stamp = _mfStamp_();
  var row = [null, 0, agrNo, city, _mfStr_(data.hotel), _mfNum_(data.capacity),
    _mfDate_(data.from), _mfDate_(data.to), _mfStr_(data.status), _mfStr_(data.notes)];
  if (isNew) {
    var seq = all.reduce(function (m, a) { return Math.max(m, _mfNum_(a.seq)); }, 0) + 1;
    row[0] = 'HA' + new Date().getTime(); row[1] = seq;
    sh.appendRow(row.concat([session.username, stamp, '', '', _mfStr_(data.supplier), kind]));
  } else {
    var cur = all.filter(function (a) { return a.id === _mfStr_(data.id); })[0];
    if (!cur) throw new Error('الاتفاقية غير موجودة');
    row[0] = cur.id; row[1] = cur.seq;
    sh.getRange(cur._row, 1, 1, VZ_HAGR_HEADERS.length)
      .setValues([row.concat([cur.createdBy, cur.createdAt, session.username, stamp, _mfStr_(data.supplier), kind])]);
  }
  _vzHaClearCache_();
  return { success: true };
}

function deleteHousingAgreement(authToken, id) {
  _vzPerm_(authToken, 'delete');
  id = _mfStr_(id);
  var a = _vzHaReadAll_().filter(function (x) { return x.id === id; })[0];
  if (!a) throw new Error('الاتفاقية غير موجودة');
  // حذف تخصيصاتها أولاً (من الأسفل للأعلى حفاظاً على أرقام الصفوف)
  var ash = _accSheet_(VZ_HALLOC_SHEET, VZ_HALLOC_HEADERS);
  _vzAllocReadAll_().filter(function (x) { return x.agrId === id; })
    .sort(function (x, y) { return y._row - x._row; })
    .forEach(function (x) { ash.deleteRow(x._row); });
  _accSheet_(VZ_HAGR_SHEET, VZ_HAGR_HEADERS).deleteRow(a._row);
  _vzHaClearCache_();
  return { success: true };
}

function saveHousingAllocation(authToken, data) {
  var isNew = !_mfStr_(data && data.id);
  var session = _vzPerm_(authToken, isNew ? 'add' : 'edit');
  data = data || {};
  var agrId = _mfStr_(data.agrId);
  var agr = _vzHaReadAll_().filter(function (a) { return a.id === agrId; })[0];
  if (!agr) throw new Error('اختر اتفاقية صحيحة');
  var ref = _mfStr_(data.groupRef);
  if (!ref) throw new Error('أدخل رقم المجموعة');
  var cnt = _mfNum_(data.count);
  if (cnt <= 0) throw new Error('أدخل عدداً أكبر من صفر');
  var from = _mfDate_(data.from) || agr.from, to = _mfDate_(data.to) || agr.to;
  // ✅ التحقق من المتاح: نحسب المقاطع بعد إضافة/تعديل هذا التخصيص ونرفض أي مقطع سالب
  var others = _vzAllocReadAll_().filter(function (x) { return x.agrId === agrId && x.id !== _mfStr_(data.id); });
  var av = _vzHaSegments_(agr.capacity, agr.from, agr.to,
    others.concat([{ count: cnt, from: from, to: to }]));
  if (av.minRemaining < 0) {
    var bad = av.segments.filter(function (s) { return s.remaining < 0; })[0];
    throw new Error('تجاوز سعة الاتفاقية: المطلوب يفوق المتاح بـ ' + Math.abs(bad.remaining) +
      ' في الفترة ' + bad.from + ' → ' + bad.to);
  }
  var sh = _accSheet_(VZ_HALLOC_SHEET, VZ_HALLOC_HEADERS);
  var stamp = _mfStamp_();
  var row = [null, agrId, ref, cnt, from, to, _mfStr_(data.notes)];
  if (isNew) {
    row[0] = 'HL' + new Date().getTime();
    sh.appendRow(row.concat([session.username, stamp]));
  } else {
    var cur = _vzAllocReadAll_().filter(function (x) { return x.id === _mfStr_(data.id); })[0];
    if (!cur) throw new Error('التخصيص غير موجود');
    row[0] = cur.id;
    sh.getRange(cur._row, 1, 1, VZ_HALLOC_HEADERS.length).setValues([row.concat([cur.createdBy, cur.createdAt])]);
  }
  // 🔁 (V4.134) الاتجاه العكسي: رقم الاتفاقية يُسجَّل تلقائياً في بيانات سكن المجموعة
  try { _vzSyncAllocToGroup_(agr, ref, cnt, from, to, session.username); } catch (eBack) {}
  _vzHaClearCache_();
  return { success: true };
}
/* 🔁 (V4.134) تسجيل رقم الاتفاقية في سكن المجموعة المطابق للمدينة — ينشئ سطر سكن جديداً
   إن لم يوجد سكن لتلك المدينة، ولا يمسّ رقماً سبق للمستخدم كتابته يدوياً. */
function _vzSyncAllocToGroup_(agr, groupRef, count, from, to, username) {
  groupRef = _mfStr_(groupRef); if (!groupRef) return;
  var sh = _accSheet_(VZ_FILES_SHEET, VZ_FILES_HEADERS);
  var all = _vzReadAll_();
  var kind = (agr.kind || 'سكن') === 'إعاشة' ? 'cAgr' : 'hAgr';
  var touched = false;
  all.forEach(function (f) {
    if (_mfStr_(f.ref) !== groupRef) return;
    var hz = _vzHousingNormalize_(f);
    var hit = null;
    for (var i = 0; i < hz.length; i++) {
      if (hz[i].city !== agr.city) continue;
      if (_mfStr_(hz[i][kind]) === _mfStr_(agr.agrNo)) { hit = hz[i]; break; }   // مسجَّل بالفعل
      if (!_mfStr_(hz[i][kind]) && !hit) hit = hz[i];                            // أول خانة فارغة
    }
    if (hit && _mfStr_(hit[kind]) === _mfStr_(agr.agrNo)) return;
    if (!hit) {
      hit = { city: agr.city, hotel: _mfStr_(agr.hotel), count: _mfNum_(count), in: _mfDate_(from), out: _mfDate_(to),
        hAgr: '', cAgr: '', supplier: _mfStr_(agr.supplier) };
      hz.push(hit);
    }
    hit[kind] = _mfStr_(agr.agrNo);
    if (!_mfStr_(hit.hotel) && kind === 'hAgr') hit.hotel = _mfStr_(agr.hotel);
    if (!_mfStr_(hit.supplier)) hit.supplier = _mfStr_(agr.supplier);
    if (!_mfStr_(hit.in)) hit.in = _mfDate_(from);
    if (!_mfStr_(hit.out)) hit.out = _mfDate_(to);
    f.housing = hz;
    var mk = _vzHousingFirst_(hz, 'مكة'), md = _vzHousingFirst_(hz, 'المدينة');
    if (mk) { f.makkahIn = mk.in; f.makkahOut = mk.out; f.makkahHousingAgr = mk.hAgr; f.makkahCateringAgr = mk.cAgr; }
    if (md) { f.madinahIn = md.in; f.madinahOut = md.out; f.madinahHousingAgr = md.hAgr; f.madinahCateringAgr = md.cAgr; }
    f.updatedBy = username; f.updatedAt = _mfStamp_();
    sh.getRange(f._row, 1, 1, VZ_FILES_HEADERS.length).setValues([_vzObjToRow_(f)]);
    touched = true;
  });
  if (touched) { SpreadsheetApp.flush(); _vzClearCache_(); }
}

/* 💳 (V4.134) ترحيل قيمة اتفاقية سكن/إعاشة موردها هو الوكيل السعودي إلى الجانب الدائن
   بحساب ذلك الوكيل — البيان يُبنى من بيانات الاتفاقية (رقمها، الفندق، العميل/الرحلة، المجموعة)
   والقيمة تُدخَل يدوياً من الشاشة. */
function postAgreementToAgentAccount(authToken, payload) {
  var session = _vzFinancePerm_(authToken);
  payload = payload || {};
  var agrId = _mfStr_(payload.agrId);
  var a = _vzHaReadAll_().filter(function (x) { return x.id === agrId; })[0];
  if (!a) return { success: false, error: 'الاتفاقية غير موجودة' };
  var acct = _mfStr_(payload.agent) || _mfStr_(a.supplier);
  if (!acct) return { success: false, error: 'حدّد حساب الوكيل' };
  var value = _accNum_(payload.value);
  if (value <= 0) return { success: false, error: 'أدخل قيمة أكبر من صفر' };
  var allocs = _vzAllocReadAll_().filter(function (x) { return x.agrId === agrId; });
  var gIdx = {}; _vzGroupIndex_().forEach(function (g) { gIdx[g.ref] = g; });
  var refs = allocs.map(function (x) { return x.groupRef; });
  var trips = {}, clients = {};
  allocs.forEach(function (x) {
    var g = gIdx[x.groupRef]; if (!g) return;
    if (g.tripName) trips[g.tripName] = 1;
    (g.clients || []).forEach(function (c) { if (c) clients[c] = 1; });
  });
  var parts = ['اتفاقية ' + (a.kind || 'سكن') + ' رقم ' + a.agrNo];
  if (a.hotel) parts.push(a.hotel);
  if (a.city) parts.push(a.city);
  var who = Object.keys(clients).join('، ') || Object.keys(trips).join('، ');
  if (who) parts.push(who);
  if (refs.length) parts.push('مجموعة ' + refs.join('، '));
  var desc = _mfStr_(payload.desc) || parts.join(' - ');
  return saveAgentAccItem(authToken, { agent: acct, desc: desc,
    currency: _mfStr_(payload.currency) || 'SAR', value: value, isCredit: true,
    notes: _mfStr_(payload.notes) || ('مُرحَّل من اتفاقية ' + a.agrNo) });
}

function deleteHousingAllocation(authToken, id) {
  _vzPerm_(authToken, 'delete');
  id = _mfStr_(id);
  var x = _vzAllocReadAll_().filter(function (a) { return a.id === id; })[0];
  if (!x) throw new Error('التخصيص غير موجود');
  _accSheet_(VZ_HALLOC_SHEET, VZ_HALLOC_HEADERS).deleteRow(x._row);
  _vzHaClearCache_();
  return { success: true };
}

// يعرض كل التحركات المسجَّلة في تاريخ بعينه — نفس تنسيق أزرار «تحركات اليوم/الغد» (غير مُصفّاة)
function sendTelegramMovementsByDate_(dateStr, chatId) {
  // 🔕 (V4.125) مفتاح التفعيل من قسم التنبيهات بشاشة الإعدادات
  if (!_notifEnabled_('tg_movements')) return { sent: 0, disabled: true };
  var movements = getAllMovements();
  var filtered = movements.filter(function (m) { return m.movementDate && String(m.movementDate).trim() === dateStr; });

  var msg = "🚌 <b>تحركات بتاريخ (" + dateStr + ")</b> 📋 العدد: (" + filtered.length + ")\n━━━━━━━━━━━━━━━━━━\n";
  if (filtered.length === 0) {
    msg += "⚪ لا توجد تحركات مسجَّلة في هذا التاريخ.";
  } else {
    filtered.forEach(function (m, i) {
      var _lbl = _tgMovementLabel_(m.movementType);
      var _title = _lbl ? (_lbl + " : " + m.movementType) : m.movementType;
      msg += "🔹 <b>(" + (i + 1) + ") " + _title + "</b>\n🎫 <b>الإشعار:</b> <code>" + (m.bookingId || "—") + "</code>\n👥 <b>العميل:</b> " + (m.client || "—") + "\n⏰ <b>الساعة:</b> " + (m.movementTime || "—") + "\n🚌 <b>الباصات:</b> " + (m.buses || "—") + "  |  🧑‍🤝‍🧑 <b>العدد:</b> " + (m.count || "—") + " معتمر\n🏢 <b>الشركة:</b> " + (m.company || "—") + "\n🇸🇦 <b>الوكيل:</b> " + (m.agent || "—") + "\n";
      if (i < filtered.length - 1) msg += "▪️\n";
    });
  }
  sendTelegramMessageDirect(chatId, msg);
}
