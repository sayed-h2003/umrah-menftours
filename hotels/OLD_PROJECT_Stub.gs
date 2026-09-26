/* ============================================================================
   🔁 (H4) ملف المشروع القديم لبرنامج الحجوزات — بعد نقله داخل برنامج العمرة
   ----------------------------------------------------------------------------
   يحل هذا الملف محلّ كل أكواد المشروع القديم (المرتبط بشيت الحجوزات). يفعل ثلاثة أشياء فقط:
     1) hbExportPropsForMerge(): يكتب إعدادات المشروع القديم (توكن البوت، سر البوابة، إعداد العهد،
        مصدر الحجوزات، مفاتيح Gemini …) في ورقة مخفية «_hb_migration» ليقرأها المشروع الجديد مرة واحدة.
     2) removeOldTriggers(): يحذف كل مشغّلات المشروع القديم (حتى لا يعمل برنامجان على نفس البيانات).
     3) doGet/doPost: أي رابط قديم (بوابة العملاء المرسلة للعملاء، أو المفضلة لدى الموظفين) يتحوّل تلقائياً
        لنفس الصفحة على رابط برنامج العمرة، ورسائل تليجرام — لو وصلت للرابط القديم — تُمرَّر للجديد.
   ⚠️ ضع رابط نشر برنامج العمرة (/exec) في NEW_APP_URL قبل النشر.
   ============================================================================ */
var NEW_APP_URL = 'ضع-هنا-رابط-نشر-برنامج-العمرة/exec';

function hbExportPropsForMerge() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet(), name = '_hb_migration';
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  var rows = [['المفتاح', 'القيمة']];
  Object.keys(props).sort().forEach(function (k) { if (k !== 'ACTIVE_SESSIONS') rows.push([k, props[k]]); });
  sh.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  try { sh.hideSheet(); } catch (e) {}
  Logger.log('تم تصدير ' + (rows.length - 1) + ' إعداداً إلى الورقة ' + name + ' — شغّل hbFinishMigration في مشروع برنامج العمرة الآن');
}
function removeOldTriggers() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); n++; });
  Logger.log('حُذف ' + n + ' مشغّل من المشروع القديم');
}
function newUrl_(params) {
  var q = [];
  Object.keys(params || {}).forEach(function (k) { q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); });
  if (!params || !params.page) q.unshift('page=hotels');
  return NEW_APP_URL + (q.length ? '?' + q.join('&') : '');
}
function doGet(e) {
  var url = newUrl_(e && e.parameter);
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Tahoma,Arial;direction:rtl;text-align:center;padding:40px;">' +
    '<h3>انتقل برنامج حجوزات الفنادق إلى رابط جديد</h3><p><a href="' + url + '" target="_top">اضغط هنا إن لم يُفتح تلقائياً</a></p></div>' +
    '<script>try{window.top.location.href=' + JSON.stringify(url) + ';}catch(e){}</script>'
  ).setTitle('حجوزات الفنادق').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e) {
  try {
    if (!e || !e.parameter || !e.parameter.tghook) return;
    UrlFetchApp.fetch(NEW_APP_URL + '?tghook=' + encodeURIComponent(e.parameter.tghook), {
      method: 'post', contentType: 'application/json', payload: e.postData.contents, muteHttpExceptions: true, followRedirects: true });
  } catch (err) { Logger.log('forward: ' + err.message); }
}
