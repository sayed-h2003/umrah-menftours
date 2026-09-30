/* ============================================================================
   📒 الحسابات العامة (الدفتر العام بالقيد المزدوج) — V4.208 (المراحل 0–3 + ربط حجوزات الفنادق H1 + تحويل العملة التلقائي)
   ----------------------------------------------------------------------------
   • البيانات في ملف Google Sheets منفصل خاص بالحسابات (معرّفه في خاصية السكربت GL_SPREADSHEET_ID)
     فلا تُبطئ القيود الكثيرة شيتات الرحلات، ويسهل نسخها احتياطياً وأرشفتها وحدها.
   • دليل حسابات هرمي بأكواد (1 أصول ← 12 عملاء ← 1201 عملاء العمرة ← 1201001 عميل بعينه)،
     الكود نفسه يحدد الشجرة: كل حساب يبدأ كوده بكود أبيه — فالتجميع والأرصدة بالبادئة مباشرة.
   • قيد اليومية: رأس (GL_Entries) + أسطر (GL_Lines). الحالة: مسودة / مرحّل / ملغى. القيد المرحّل
     لا يُعدَّل — يُلغى بسبب مسجَّل (يبقى أثره) ويُسجَّل غيره. كل سطر بعملته (جنيه/ريال/دولار) وسعر
     صرفه ومعادله بعملة الأساس (الجنيه)، ووسوم مراكز التكلفة: الرحلة، الشركة المنفذة، العميل، الوكيل.
   • التوازن: مجموع المدين المعادل = مجموع الدائن المعادل (وبالعملة نفسها لو القيد بعملة واحدة).
   • الاستيراد المجمّع (أرصدة افتتاحية / قيود تاريخية) بدفعات: كل دفعة لها رقم ويمكن إلغاؤها كاملة.
   كل الدوال هنا تبدأ بـ gl / _gl فلا تتعارض مع أي دالة بـ Code.gs.
   ============================================================================ */

var GL_SHEETS_ = {
  accounts: { name: 'GL_Accounts', headers: ['الكود', 'اسم الحساب', 'النوع', 'الحساب الأب', 'تجميعي؟', 'العملة', 'الفئة', 'الربط', 'نشط', 'ملاحظات', 'أنشئ بواسطة', 'أنشئ في', 'المعرف القديم'] },
  entries:  { name: 'GL_Entries',  headers: ['رقم القيد', 'التسلسل', 'التاريخ', 'نوع القيد', 'البيان', 'الحالة', 'مفتاح المصدر', 'دفعة الاستيراد', 'إجمالي المعادل', 'المرجع', 'الرحلة', 'الشركة المنفذة', 'أنشئ بواسطة', 'أنشئ في', 'رُحِّل بواسطة', 'رُحِّل في', 'عُدّل بواسطة', 'عُدّل في', 'سبب الإلغاء'] },
  // (V4.222) تغييرات القيود التلقائية بانتظار الاعتماد · توجيه دفعات العملاء لحسابها النقدي · سجل القيود التلقائية الجديدة للتنبيه
  pending:  { name: 'GL_Pending',   headers: ['المفتاح', 'رقم القيد', 'النوع', 'البيان الحالي', 'المعادل الحالي', 'البيان الجديد', 'المعادل الجديد', 'البصمة الجديدة', 'اكتُشف في', 'الحالة', 'بواسطة', 'في', 'المبلغ الحالي', 'المبلغ الجديد', 'تفاصيل التغيير'] },
  cpdir:    { name: 'GL_PayDirect', headers: ['معرّف الدفعة', 'الحساب النقدي', 'بواسطة', 'في'] },
  autolog:  { name: 'GL_AutoLog',   headers: ['في', 'رقم القيد', 'البيان', 'المعادل', 'المصدر', 'الحدث'] },
  // (V4.225) سجل كشوف الحساب المُصدَرة (طباعة/PDF/صورة/Excel/مصادقة) برقم مسلسل وبصمة للتحقق
  stmts:    { name: 'GL_Statements', headers: ['رقم الكشف', 'أصدر في', 'بواسطة', 'كود الحساب', 'اسم الحساب', 'من', 'إلى', 'الأرصدة', 'الإخراج', 'البصمة', 'ملاحظات'] },
  lines:    { name: 'GL_Lines',    headers: ['رقم القيد', 'رقم السطر', 'التاريخ', 'الحالة', 'الحساب', 'مدين', 'دائن', 'العملة', 'سعر الصرف', 'مدين معادل', 'دائن معادل', 'الرحلة', 'الشركة المنفذة', 'العميل', 'الوكيل', 'البيان'] },
  settings: { name: 'GL_Settings', headers: ['المفتاح', 'القيمة'] },
  batches:  { name: 'GL_Batches',  headers: ['رقم الدفعة', 'النوع', 'الوصف', 'عدد القيود', 'الحالة', 'أنشئ بواسطة', 'أنشئ في'] },
  // (V4.208) ربط برنامج حجوزات الفنادق: خريطة الأسماء، ومراجعة الدفعات (الحساب النقدي والعملة الفعلية)، وربط الحجوزات بالرحلات
  hbmap:    { name: 'GL_HB_Map',   headers: ['الاسم', 'النوع', 'كود الحساب', 'الربط', 'ملاحظات', 'بواسطة', 'في'] },
  hbpay:    { name: 'GL_HB_Pay',   headers: ['معرّف الدفعة', 'الحساب النقدي', 'العملة', 'المبلغ بالعملة', 'سعر الصرف', 'بواسطة', 'في', 'حساب الطرف'] },
  hbtrip:   { name: 'GL_HB_Trip',  headers: ['مفتاح الحجز', 'الرحلة', 'بواسطة', 'في'] },
  // (V4.227) قيود الحجوزات التلقائية المستبدَلة بقيد الـ ERP المطابق (اختيار «اعتماد الـ ERP») — لا يُعاد إنشاؤها بالمزامنة
  hbkeep:   { name: 'GL_HB_KeepERP', headers: ['مفتاح القيد التلقائي', 'قيد الـ ERP المعتمد', 'بيان قيد الحجوزات المحذوف', 'بواسطة', 'في'] },
  // (V4.210-H3) عقود الشارت: شراء غرف لفترة طويلة بدفعات، تُباع حجوزات منفصلة
  // (V4.216) أسعار الصرف اليومية (بيع/شراء بنك مصر للريال والدولار) — تُسجَّل يومياً ويُحسب منها المعادل بتاريخ كل قيد
  // (V4.219) مستندات مرفقة بالقيود والسندات (ملفات بالدرايف)
  attach:   { name: 'GL_Attachments', headers: ['رقم القيد', 'معرّف الملف', 'الاسم', 'النوع', 'الرابط', 'بواسطة', 'في'] },
  fxdaily:  { name: 'GL_FX_Daily', headers: ['التاريخ', 'ريال بيع', 'ريال شراء', 'دولار بيع', 'دولار شراء', 'المصدر', 'بواسطة', 'في'] },
  hbchar:   { name: 'GL_HB_Charters', headers: ['المعرّف', 'الشارت', 'الفندق', 'المدينة', 'من', 'إلى', 'عدد الغرف', 'قيمة العقد', 'العملة', 'ملاحظات', 'بواسطة', 'في'] }
};
var GL_TYPES_ = {
  ASSET:  { label: 'أصول',         normal: 'D' },
  LIAB:   { label: 'خصوم',         normal: 'C' },
  EQUITY: { label: 'حقوق ملكية',   normal: 'C' },
  REV:    { label: 'إيرادات',      normal: 'C' },
  EXP:    { label: 'مصروفات',      normal: 'D' }
};
var GL_CURRENCIES_ = ['EGP', 'SAR', 'USD'];
var GL_ST_DRAFT_ = 'مسودة', GL_ST_POSTED_ = 'مرحّل', GL_ST_VOID_ = 'ملغى';
var GL_ENTRY_TYPES_ = ['قيد يومية', 'سند قبض', 'سند صرف', 'صرف عهدة', 'تسوية عهدة', 'تحويل نقدية', 'تحويل عملة', 'قيد افتتاحي', 'قيد مستورد', 'قيد تلقائي', 'قيد إقفال'];
// (V4.207) أنواع يولّدها النظام وحده — لا تُختار بقيد يدوي
var GL_SYS_TYPES_ = ['قيد تلقائي', 'قيد إقفال'];
// الفئة (kind) تحدد سلوك الحساب بالشاشات: خزينة/بنك/عهدة تظهر بلوحة الأرصدة، عميل/وكيل تُربط بكيانات البرنامج
var GL_KINDS_ = { safe: 'خزينة', bank: 'بنك', custody: 'عهدة', client: 'عميل', agent: 'وكيل', supplier: 'مورد', trip: 'رحلة عمرة', fx: 'وسيط عملات', roomfee: 'رسوم غرفة', other: '' };

// دليل الحسابات الأساسي (مستفاد من تصنيفات برنامج الـ ERP مع أكواد هرمية) — [كود، اسم، نوع، تجميعي؟، فئة]
var GL_SEED_COA_ = [
  ['1', 'الأصول', 'ASSET', 1, ''],
  ['11', 'النقدية وما في حكمها', 'ASSET', 1, ''],
  ['1101', 'الخزائن', 'ASSET', 1, 'safe'],
  ['1101001', 'الخزينة الرئيسية', 'ASSET', 0, 'safe'],
  ['1102', 'البنوك', 'ASSET', 1, 'bank'],
  ['12', 'العملاء', 'ASSET', 1, 'client'],
  ['1201', 'عملاء العمرة', 'ASSET', 1, 'client'],
  ['1202', 'عملاء الحج', 'ASSET', 1, 'client'],
  ['1203', 'عملاء السكن', 'ASSET', 1, 'client'],
  ['1204', 'عملاء النقل', 'ASSET', 1, 'client'],
  ['1205', 'عملاء التذاكر', 'ASSET', 1, 'client'],
  ['13', 'العُهد', 'ASSET', 1, 'custody'],
  ['14', 'دفعات مقدمة للموردين', 'ASSET', 1, ''],
  ['1401', 'دفعات مقدمة للوكلاء', 'ASSET', 0, ''],
  ['15', 'أصول أخرى', 'ASSET', 1, ''],
  ['1501', 'حساب وسيط تحويل العملات', 'ASSET', 0, 'fx'],
  ['2', 'الخصوم', 'LIAB', 1, ''],
  ['21', 'الموردون', 'LIAB', 1, 'supplier'],
  ['2101', 'الوكلاء السعوديون', 'LIAB', 1, 'agent'],
  ['2102', 'شركات النقل', 'LIAB', 1, 'supplier'],
  ['2103', 'الفنادق', 'LIAB', 1, 'supplier'],
  ['2104', 'شركات الطيران', 'LIAB', 1, 'supplier'],
  ['2105', 'موردون آخرون', 'LIAB', 1, 'supplier'],
  ['22', 'رسوم الوزارة المستحقة', 'LIAB', 0, ''],
  ['23', 'دفعات مقدمة من العملاء', 'LIAB', 0, ''],
  ['24', 'خصوم أخرى', 'LIAB', 1, ''],
  ['3', 'حقوق الملكية', 'EQUITY', 1, ''],
  ['31', 'رأس المال', 'EQUITY', 0, ''],
  ['32', 'جاري الشركاء', 'EQUITY', 1, ''],
  ['33', 'الأرباح المرحّلة', 'EQUITY', 0, ''],
  ['34', 'فروق أرصدة افتتاحية', 'EQUITY', 0, ''],
  ['4', 'الإيرادات', 'REV', 1, ''],
  ['41', 'إيرادات العمرة', 'REV', 1, ''],
  ['4101', 'إيرادات عمرة عامة', 'REV', 0, ''],
  ['42', 'إيرادات الحج', 'REV', 0, ''],
  ['43', 'إيرادات السكن', 'REV', 0, ''],
  ['44', 'إيرادات النقل', 'REV', 0, ''],
  ['45', 'إيرادات التذاكر', 'REV', 0, ''],
  ['46', 'أرباح فروق العملة', 'REV', 0, ''],
  ['49', 'إيرادات أخرى', 'REV', 0, ''],
  ['5', 'المصروفات', 'EXP', 1, ''],
  ['51', 'التكاليف المباشرة', 'EXP', 1, ''],
  ['5101', 'تكلفة التأشيرات', 'EXP', 0, ''],
  ['5102', 'تكلفة النقل', 'EXP', 0, ''],
  ['5103', 'تكلفة السكن والإعاشة', 'EXP', 0, ''],
  ['5104', 'رسوم غرفة الوزارة', 'EXP', 0, ''],
  ['5105', 'تكلفة التذاكر', 'EXP', 0, ''],
  ['52', 'المصروفات العمومية والإدارية', 'EXP', 1, ''],
  ['5201', 'رواتب وأجور', 'EXP', 0, ''],
  ['5202', 'إيجارات', 'EXP', 0, ''],
  ['5203', 'مصروفات مكتبية', 'EXP', 0, ''],
  ['5204', 'عمولات ومصروفات بنكية', 'EXP', 0, ''],
  ['5209', 'مصروفات أخرى', 'EXP', 0, ''],
  ['53', 'خسائر فروق العملة', 'EXP', 0, '']
];
var GL_ACC_FX_GAIN_ = '46', GL_ACC_FX_LOSS_ = '53', GL_ACC_OPEN_DIFF_ = '34';

/* ---------------------------- أدوات عامة ---------------------------- */
function _glPerm_(authToken, cap) {
  var session = requireAuth_(authToken);
  if (!_sessionHasPerm_(session, 'gl.' + cap)) {
    throw new Error('لا تملك صلاحية ' + ({ view: 'عرض', add: 'إضافة', edit: 'تعديل/ترحيل', delete: 'حذف/إلغاء' }[cap] || cap) + ' الحسابات العامة');
  }
  return session;
}
function _glIsAdmin_(session) { return _sessionHasPerm_(session, 'admin'); }
// 🔒 (V4.220) الإعدادات والاستيراد والمزامنات الخارجية والعمليات المؤثرة جوهرياً = للمدير فقط
function _glAdminPerm_(authToken) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('هذا الإجراء للمدير فقط (إعدادات / استيراد / مزامنة خارجية / عملية مؤثرة)');
  return session;
}
// ✅ (V4.220) صلاحية خاصة لاعتماد التغييرات على القيود بعد تسجيلها (المدير يملكها تلقائياً)
function _glCanApprove_(session) { return _glIsAdmin_(session) || _sessionHasPerm_(session, 'gl.approve'); }
// (V4.216) خلية حوّلها الشيت لتاريخ ⇒ نص dd/MM/yyyy (مع الوقت لو له وقت) — لا تظهر صيغة «Wed Jul 01 2026 … GMT» أبداً
function _glStr_(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    var tz = _tz_() || 'Africa/Cairo', t = Utilities.formatDate(v, tz, 'HH:mm:ss');
    return Utilities.formatDate(v, tz, 'dd/MM/yyyy') + (t === '00:00:00' ? '' : ' ' + t);
  }
  return String(v == null ? '' : v).trim();
}
function _glNum_(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,٬\s]/g, '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })); return isNaN(n) ? 0 : n; }
function _glR2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function _glCur_(c) { c = _glStr_(c).toUpperCase(); if (c === 'جنيه') c = 'EGP'; if (c === 'ريال') c = 'SAR'; if (c === 'دولار') c = 'USD'; return GL_CURRENCIES_.indexOf(c) >= 0 ? c : 'EGP'; }
// التاريخ نص dd/MM/yyyy دائماً (لو حوّله الشيت لتاريخ نعيده نصاً)
function _glDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, _tz_() || 'Africa/Cairo', 'dd/MM/yyyy');
  var s = _glStr_(v).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1];
  return '';
}
function _glDKey_(d) { var m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? (m[3] + m[2] + m[1]) : ''; }   // yyyymmdd للمقارنة والترتيب
function _glNow_() { return Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy HH:mm:ss'); }
function _glNorm_(s) {
  return (typeof _normalizeArabicName_ === 'function' ? _normalizeArabicName_(s) : String(s || '')).toLowerCase()
    .replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ي').replace(/\s+/g, ' ').trim();
}
function _glLev_(a, b) {
  if (a === b) return 0; var m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  var p = [], c = [], i, j; for (j = 0; j <= n; j++) p[j] = j;
  for (i = 1; i <= m; i++) { c = [i]; for (j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)); p = c; }
  return p[n];
}

/* ---------------------------- ملف الحسابات ---------------------------- */
var _GL_SS_MEMO_ = null;
function _glSSId_() { return _glStr_(PropertiesService.getScriptProperties().getProperty('GL_SPREADSHEET_ID')); }
function _glSS_() {
  if (_GL_SS_MEMO_) return _GL_SS_MEMO_;
  var id = _glSSId_();
  if (!id) throw new Error('لم يُجهَّز ملف الحسابات بعد — من «⚙️ إعدادات الحسابات» اضغط «إنشاء ملف الحسابات»');
  _GL_SS_MEMO_ = SpreadsheetApp.openById(id);
  return _GL_SS_MEMO_;
}
function _glSheet_(key) {
  var def = GL_SHEETS_[key], ss = _glSS_();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold').setBackground('#1e3d59').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // أعمدة الكود والتاريخ نصية دائماً حتى لا يحوّلها الشيت لأرقام أو تواريخ
    if (key === 'accounts') sh.getRange('A:A').setNumberFormat('@').getSheet().getRange('D:D').setNumberFormat('@');
    if (key === 'entries') sh.getRange('C:C').setNumberFormat('@');
    if (key === 'lines') { sh.getRange('C:C').setNumberFormat('@'); sh.getRange('E:E').setNumberFormat('@'); }
    if (key === 'settings') sh.getRange('B:B').setNumberFormat('@');
    if (key === 'hbmap' || key === 'hbpay') sh.getRange('A:C').setNumberFormat('@');
    if (key === 'hbtrip') sh.getRange('A:B').setNumberFormat('@');
    if (key === 'hbchar') sh.getRange('A:F').setNumberFormat('@');
    if (key === 'fxdaily') sh.getRange('A:A').setNumberFormat('@');
  } else if (sh.getLastColumn() < def.headers.length) {
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
  }
  return sh;
}
// قراءة بعرض الأعمدة المعرّفة حتى لو الشيت أُنشئ بنسخة أقدم أقل أعمدة
function _glRowsW_(key) {
  var sh = _glSheet_(key), last = sh.getLastRow(), W = GL_SHEETS_[key].headers.length;
  if (last < 2) return [];
  var have = Math.max(1, Math.min(W, sh.getLastColumn()));
  return sh.getRange(2, 1, last - 1, have).getValues().map(function (r) { while (r.length < W) r.push(''); return r; });
}
function _glRows_(key) {
  var sh = _glSheet_(key), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, GL_SHEETS_[key].headers.length).getValues();
}

/* ---------------------------- الإعدادات ---------------------------- */
var _GL_SET_MEMO_ = null;
function _glSettings_() {
  if (_GL_SET_MEMO_) return _GL_SET_MEMO_;
  var o = { startDate: '01/07/2026', baseCurrency: 'EGP', rate_SAR: '13.3', rate_USD: '50' };
  _glRows_('settings').forEach(function (r) { var k = _glStr_(r[0]); if (k) o[k] = _glStr_(r[1]); });
  return (_GL_SET_MEMO_ = o);
}
function _glSetSetting_(k, v) {
  var sh = _glSheet_('settings'), rows = _glRows_('settings');
  for (var i = 0; i < rows.length; i++) if (_glStr_(rows[i][0]) === k) { sh.getRange(i + 2, 2).setNumberFormat('@').setValue(String(v)); _GL_SET_MEMO_ = null; return; }
  sh.appendRow([k, String(v)]);
  try { sh.getRange(sh.getLastRow(), 2).setNumberFormat('@'); } catch (e) {}
  _GL_SET_MEMO_ = null;
}
function _glFxBridgeAcc_() {
  var accs = _glAccounts_(), set = _glSettings_().fx_bridge_acc;
  if (set && accs.map[set] && !accs.map[set].isGroup) return set;
  var a = accs.list.filter(function (x) { return x.kind === 'fx' && !x.isGroup && x.active; })[0];
  return a ? a.code : '';
}
function _glLocked_(date) { var lk = _glDKey_(_glSettings_().lockDate || ''), k = _glDKey_(_glDate_(date)); return !!(lk && k && k <= lk); }
function _glIsSysEntry_(r) { return GL_SYS_TYPES_.indexOf(_glStr_(r[3])) >= 0 || /^AUTO:/.test(_glStr_(r[6])); }
function _glRates_() { var s = _glSettings_(); return { EGP: 1, SAR: _glNum_(s.rate_SAR) || 13.3, USD: _glNum_(s.rate_USD) || 50 }; }

/* ---------------------------- الحسابات ---------------------------- */
var _GL_ACC_MEMO_ = null;
function _glAccounts_() {
  if (_GL_ACC_MEMO_) return _GL_ACC_MEMO_;
  var list = [], map = {};
  _glRows_('accounts').forEach(function (r, i) {
    var code = _glStr_(r[0]); if (!code) return;
    var a = { code: code, name: _glStr_(r[1]), type: _glStr_(r[2]) || 'ASSET', parent: _glStr_(r[3]), isGroup: _glStr_(r[4]) === 'نعم',
      currency: _glStr_(r[5]), kind: _glStr_(r[6]), link: _glStr_(r[7]), active: _glStr_(r[8]) !== 'لا', notes: _glStr_(r[9]),
      legacyId: _glStr_(r[12]), _row: i + 2 };
    list.push(a); map[code] = a;
  });
  list.sort(function (a, b) { return a.code < b.code ? -1 : (a.code > b.code ? 1 : 0); });
  return (_GL_ACC_MEMO_ = { list: list, map: map });
}
function _glAccRow_(a, user) {
  return [a.code, a.name, a.type, a.parent || '', a.isGroup ? 'نعم' : 'لا', a.currency || '', a.kind || '', a.link || '',
    a.active === false ? 'لا' : 'نعم', a.notes || '', user || '', _glNow_(), a.legacyId || ''];
}
// الكود التالي لحساب فرعي: كود الأب + تسلسل (3 أرقام لتحت المجموعات ذات 4 أرقام فأكثر، رقمان تحت ذات الرقم أو الرقمين)
// (V4.219) أول كود فرعي متاح تحت الأب — أول رقم شاغر (لا «الأكبر + 1» فيفشل مع وجود 99 مثلاً رغم فراغات)، ولو امتلأت كل
// أرقام العرض المعتاد يُكمل في نطاق إضافي «الأب + 00 + ثلاثة أرقام» (مثل 4100001) الذي لا يتعارض مع بادئة أي حساب قائم
function _glFreeChildCode_(parentCode, taken) {
  taken = taken || {};
  var codes = _glAccounts_().list.map(function (a) { return a.code; }).concat(Object.keys(taken));
  var used = {}; codes.forEach(function (c) { used[c] = 1; });
  var clash = function (c) {   // مستخدم، أو بادئة لحساب قائم، أو حساب قائم (غير الأب وأجداده) بادئة له
    if (used[c]) return true;
    for (var k = 0; k < codes.length; k++) {
      var x = codes[k];
      if (x.length > c.length && x.indexOf(c) === 0) return true;
      if (x.length < c.length && c.indexOf(x) === 0 && parentCode.indexOf(x) !== 0) return true;
    }
    return false;
  };
  var pad = function (n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; };
  var width = parentCode.length === 1 ? 1 : (parentCode.length === 2 ? 2 : 3), lim = Math.pow(10, width);
  for (var n = 1; n < lim; n++) { var c = parentCode + pad(n, width); if (!clash(c)) return c; }
  var base = parentCode + pad(0, width);
  for (var m = 1; m < 1000; m++) { var c2 = base + pad(m, 3); if (!clash(c2)) return c2; }
  throw new Error('امتلأت أكواد الحسابات تحت ' + parentCode);
}
function _glNextChildCode_(parentCode) { return _glFreeChildCode_(parentCode, {}); }
function _glCreateAccount_(a, user) {
  var accs = _glAccounts_();
  var parent = accs.map[a.parent];
  if (!parent) throw new Error('الحساب الأب غير موجود: ' + a.parent);
  if (!parent.isGroup) throw new Error('لا يمكن إضافة حساب تحت حساب غير تجميعي: ' + parent.name);
  var norm = _glNorm_(a.name);
  var dup = accs.list.filter(function (x) { return x.parent === a.parent && _glNorm_(x.name) === norm; })[0];
  if (dup) return dup;   // موجود بالفعل بنفس الاسم تحت نفس الأب — لا تكرار
  var acc = { code: a.code || _glNextChildCode_(a.parent), name: _glStr_(a.name), type: parent.type, parent: a.parent, isGroup: !!a.isGroup,
    currency: a.currency ? _glCur_(a.currency) : '', kind: a.kind || parent.kind || '', link: _glStr_(a.link), active: true,
    notes: _glStr_(a.notes), legacyId: _glStr_(a.legacyId) };
  _glSheet_('accounts').appendRow(_glAccRow_(acc, user));
  _GL_ACC_MEMO_ = null;
  return _glAccounts_().map[acc.code];
}

/* ---------------------------- التجهيز ---------------------------- */
function glSetupCreate(authToken) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('تجهيز ملف الحسابات متاح للمدير فقط');
  if (_glSSId_()) throw new Error('ملف الحسابات مُجهَّز بالفعل');
  var ss = SpreadsheetApp.create('حسابات منف — الدفتر العام');
  // وضع الملف بجوار شيت البرنامج نفسه بالدرايف (أفضل محاولة)
  try {
    var mainFile = DriveApp.getFileById(getSpreadsheet_().getId()), glFile = DriveApp.getFileById(ss.getId());
    var parents = mainFile.getParents();
    if (parents.hasNext()) glFile.moveTo(parents.next());
  } catch (e) {}
  PropertiesService.getScriptProperties().setProperty('GL_SPREADSHEET_ID', ss.getId());
  _GL_SS_MEMO_ = ss;
  _glInitSheets_(session.username);
  try { var s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1'); if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1); } catch (e) {}
  logChange_(session.username, 'تجهيز ملف الحسابات العامة', 'GL:setup', '-', '-', ss.getUrl());
  return { success: true, url: ss.getUrl() };
}
function glSetupLink(authToken, ssId) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('تجهيز ملف الحسابات متاح للمدير فقط');
  ssId = _glStr_(ssId).replace(/^.*\/d\/([^\/]+).*$/, '$1');
  var ss = SpreadsheetApp.openById(ssId);   // يفشل برسالة واضحة لو المعرّف خطأ أو بلا صلاحية
  PropertiesService.getScriptProperties().setProperty('GL_SPREADSHEET_ID', ss.getId());
  _GL_SS_MEMO_ = ss;
  _glInitSheets_(session.username);
  logChange_(session.username, 'ربط ملف الحسابات العامة', 'GL:setup', '-', '-', ss.getUrl());
  return { success: true, url: ss.getUrl() };
}
function _glInitSheets_(user) {
  Object.keys(GL_SHEETS_).forEach(function (k) { _glSheet_(k); });
  if (!_glAccounts_().list.length) {
    var rows = GL_SEED_COA_.map(function (s) {
      var code = s[0];
      var parent = code.length <= 1 ? '' : (code.length === 2 ? code.slice(0, 1) : (code.length === 4 ? code.slice(0, 2) : code.slice(0, 4)));
      return _glAccRow_({ code: code, name: s[1], type: s[2], parent: parent, isGroup: !!s[3], kind: s[4] }, user);
    });
    _glSheet_('accounts').getRange(2, 1, rows.length, GL_SHEETS_.accounts.headers.length).setValues(rows);
    _GL_ACC_MEMO_ = null;
  }
  var set = _glSettings_();
  ['startDate', 'baseCurrency', 'rate_SAR', 'rate_USD'].forEach(function (k) {
    var has = _glRows_('settings').some(function (r) { return _glStr_(r[0]) === k; });
    if (!has) _glSetSetting_(k, set[k]);
  });
}

/* ---------------------------- الإقلاع ---------------------------- */
function glBootstrap(authToken) {
  var session = _glPerm_(authToken, 'view');
  var admin = _glIsAdmin_(session);
  if (!_glSSId_()) return { success: true, ready: false, isAdmin: admin };
  var accs = _glAccounts_().list.map(function (a) { var c = {}; for (var k in a) if (k !== '_row') c[k] = a[k]; return c; });
  var bal = _glBalances_(null);
  return {
    success: true, ready: true, isAdmin: admin, url: _glSS_().getUrl(),
    fxDaily: (function () { var m = _glFxDailyMap_(), o = {}; Object.keys(m).forEach(function (k) { o[k] = [m[k].SAR || 0, m[k].USD || 0, m[k].src || '']; }); return o; })(),
    settings: _glSettingsOut_(), rates: _glRates_(), types: GL_TYPES_, kinds: GL_KINDS_, entryTypes: GL_ENTRY_TYPES_,
    accounts: accs, balances: bal,
    can: { add: _sessionHasPerm_(session, 'gl.add'), edit: _sessionHasPerm_(session, 'gl.edit'), del: _sessionHasPerm_(session, 'gl.delete'), approve: _glCanApprove_(session) },
    pendingCount: (function () { try { return _glTripMode_() ? _glPendingCount_() : 0; } catch (e) { return 0; } })(), tripMode: (function () { try { return _glTripMode_(); } catch (e) { return false; } })()
  };
}
// أرصدة الحسابات الورقية المرحّلة حتى تاريخ (أو كلها): {code: {EGP, SAR, USD, base}} (الموجب = مدين)
function _glBalances_(toDate) {
  var toK = toDate ? _glDKey_(toDate) : '', out = {};
  _glRows_('lines').forEach(function (r) {
    if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
    if (toK && _glDKey_(_glDate_(r[2])) > toK) return;
    var code = _glStr_(r[4]), cur = _glCur_(r[7]);
    var o = (out[code] = out[code] || { EGP: 0, SAR: 0, USD: 0, base: 0 });
    o[cur] = _glR2_(o[cur] + _glNum_(r[5]) - _glNum_(r[6]));
    o.base = _glR2_(o.base + _glNum_(r[9]) - _glNum_(r[10]));
  });
  return out;
}

/* ---------------------------- الإعدادات والحسابات (واجهة) ---------------------------- */
function glSaveSettings(authToken, s) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('إعدادات الحسابات متاحة للمدير فقط');
  s = s || {};
  if (s.startDate !== undefined) { var d = _glDate_(s.startDate); if (!d) throw new Error('تاريخ البداية غير صالح'); _glSetSetting_('startDate', d); }
  if (s.rate_SAR !== undefined) _glSetSetting_('rate_SAR', _glNum_(s.rate_SAR) || 13.3);
  if (s.rate_USD !== undefined) _glSetSetting_('rate_USD', _glNum_(s.rate_USD) || 50);
  if (s.fx_bridge !== undefined) _glSetSetting_('fx_bridge', s.fx_bridge ? 'نعم' : 'لا');
  if (s.fx_bridge_acc !== undefined) {
    var fa = _glStr_(s.fx_bridge_acc), am = _glAccounts_().map[fa];
    if (fa && (!am || am.isGroup)) throw new Error('حساب وسيط العملات غير صالح');
    _glSetSetting_('fx_bridge_acc', fa);
  }
  // (V4.216) بيانات الشركة في رأس/تذييل السندات المطبوعة
  Object.keys(GL_VCH_BRAND_DEF_).forEach(function (k) { if (s[k] !== undefined) _glSetSetting_(k, _glStr_(s[k])); });
  logChange_(session.username, 'تعديل إعدادات الحسابات العامة', 'GL:settings', '-', '-', JSON.stringify(s));
  return { success: true, settings: _glSettingsOut_(), rates: _glRates_() };
}
function glSaveAccount(authToken, a) {
  a = a || {};
  var isEdit = !!_glStr_(a.code) && !!_glAccounts_().map[_glStr_(a.code)] && a.isEdit;
  var session = _glPerm_(authToken, isEdit ? 'edit' : 'add');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    _GL_ACC_MEMO_ = null;
    if (!_glStr_(a.name)) throw new Error('اسم الحساب مطلوب');
    if (isEdit) {
      var acc = _glAccounts_().map[_glStr_(a.code)];
      var old = acc.name;
      var sh = _glSheet_('accounts');
      sh.getRange(acc._row, 2).setValue(_glStr_(a.name));
      sh.getRange(acc._row, 6, 1, 5).setValues([[a.currency ? _glCur_(a.currency) : '', _glStr_(a.kind || acc.kind), _glStr_(a.link !== undefined ? a.link : acc.link),
        a.active === false ? 'لا' : 'نعم', _glStr_(a.notes)]]);
      _GL_ACC_MEMO_ = null;
      logChange_(session.username, 'تعديل حساب بالدليل', 'GL:' + acc.code, 'اسم الحساب', old, a.name);
      return { success: true, account: _glAccounts_().map[acc.code] };
    }
    var created = _glCreateAccount_({ parent: _glStr_(a.parent), name: a.name, isGroup: !!a.isGroup, currency: a.currency, kind: a.kind, link: a.link, notes: a.notes }, session.username);
    logChange_(session.username, 'إضافة حساب بالدليل', 'GL:' + created.code, '-', '-', created.code + ' — ' + created.name);
    return { success: true, account: created };
  } finally { lock.releaseLock(); }
}
function glDeleteAccount(authToken, code) {
  var session = _glPerm_(authToken, 'delete');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    _GL_ACC_MEMO_ = null;
    var acc = _glAccounts_().map[_glStr_(code)];
    if (!acc) throw new Error('الحساب غير موجود');
    if (_glAccounts_().list.some(function (x) { return x.parent === acc.code; })) throw new Error('لا يمكن حذف حساب له حسابات فرعية');
    var used = _glRows_('lines').some(function (r) { return _glStr_(r[4]) === acc.code; });
    if (used) throw new Error('لا يمكن حذف حساب عليه قيود — يمكنك إيقافه بدل الحذف');
    _glSheet_('accounts').deleteRow(acc._row);
    _GL_ACC_MEMO_ = null;
    logChange_(session.username, 'حذف حساب من الدليل', 'GL:' + acc.code, acc.name, acc.code, '-');
    return { success: true };
  } finally { lock.releaseLock(); }
}
/* 🔀 (V4.216) نقل حساب (بفروعه) لقسم آخر — الشجرة مبنية على الكود (كود الفرع يبدأ بكود أبيه)، فالنقل يعني كوداً
   جديداً تحت القسم الجديد. يُستبدل الكود القديم في كل موضع: الدليل، أسطر القيود، إعدادات القيود التلقائية، خريطة
   حجوزات الفنادق ومراجعة دفعاتها، والبيانات المحاسبية للدفعات داخل ملف برنامج الحجوزات. بصمات القيود التلقائية
   تُحدَّث أيضاً فلا تعتبرها المزامنة التالية «تغيّرت» (ولا تُحجز بالفترات المقفلة). */
function _glLineHash_(eRow, lines, codeMap) {
  var num = function (v) { return v === '' || v == null ? 0 : _glNum_(v); };
  return 'h:' + _glHash_(JSON.stringify([_glDate_(eRow[2]), _glStr_(eRow[3]), _glStr_(eRow[4]), _glStr_(eRow[10]), _glStr_(eRow[11]), lines.map(function (l) {
    var acc = _glStr_(l[4]); if (codeMap && codeMap[acc]) acc = codeMap[acc];
    return [acc, num(l[5]), num(l[6]), _glStr_(l[7]), _glNum_(l[8]), _glStr_(l[11]), _glStr_(l[12]), _glStr_(l[13]), _glStr_(l[14]), _glStr_(l[15])];
  })]));
}
function glMoveAccount(authToken, code, newParent) {
  var session = _glPerm_(authToken, 'edit');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    return _glMoveAccountCore_(code, newParent, session.username);
  } finally { lock.releaseLock(); }
}
// (V4.222) لبّ نقل الحساب (يُستخدم أيضاً لإعادة ترقيم 4101 عند إعادة بناء قيود الرحلات) — opts.sameParent: إعادة ترقيم بنفس القسم
function _glMoveAccountCore_(code, newParent, user, opts) {
  _GL_ACC_MEMO_ = null;
  code = _glStr_(code); newParent = _glStr_(newParent);
  var accs = _glAccounts_(), acc = accs.map[code], np = accs.map[newParent];
  if (!acc) throw new Error('الحساب غير موجود');
  if (code.length <= 1) throw new Error('لا يمكن نقل حساب رئيسي (أصول/خصوم/…)');
  if (!np) throw new Error('القسم المختار غير موجود');
  if (!np.isGroup) throw new Error('يُنقل الحساب تحت حساب تجميعي (قسم) فقط');
  if (newParent === acc.parent && !(opts && opts.sameParent)) throw new Error('الحساب موجود بالفعل تحت هذا القسم');
  if (newParent.indexOf(code) === 0) throw new Error('لا يمكن نقل الحساب تحت نفسه أو تحت أحد فروعه');
  var newCode = _glNextCodeIn_(newParent, {});
  // خريطة الأكواد: الحساب وكل فروعه (استبدال البادئة)
  var map = {}, moved = accs.list.filter(function (x) { return x.code === code || (x.code.indexOf(code) === 0 && x.code.length > code.length); });
  moved.forEach(function (x) { map[x.code] = newCode + x.code.slice(code.length); });
  Object.keys(map).forEach(function (o) { if (accs.map[map[o]] && !map[map[o]]) throw new Error('الكود الجديد ' + map[o] + ' مستخدم بالفعل'); });
  // 1) الدليل
  var aSh = _glSheet_('accounts'), aRows = _glRows_('accounts');
  aRows.forEach(function (r) {
    var c = _glStr_(r[0]); if (!map[c]) return;
    r[0] = map[c]; r[3] = c === code ? newParent : (map[_glStr_(r[3])] || _glStr_(r[3])); r[2] = np.type;
  });
  aSh.getRange(2, 1, aRows.length, GL_SHEETS_.accounts.headers.length).setValues(aRows);
  // 2) أسطر القيود + بصمات القيود التلقائية
  var lSh = _glSheet_('lines'), lRows = _glRows_('lines'), nLines = 0, byEntry = {};
  lRows.forEach(function (r) { (byEntry[_glStr_(r[0])] = byEntry[_glStr_(r[0])] || []).push(r); });
  var eSh = _glSheet_('entries'), eRows = _glRows_('entries'), nHash = 0, eChanged = false;
  eRows.forEach(function (e) {
    var ls = byEntry[_glStr_(e[0])]; if (!ls || !ls.some(function (l) { return map[_glStr_(l[4])]; })) return;
    if (/^AUTO:/.test(_glStr_(e[6])) && /^h:/.test(_glStr_(e[9])) && _glLineHash_(e, ls, null) === _glStr_(e[9])) {
      e[9] = _glLineHash_(e, ls, map); nHash++; eChanged = true;
    }
  });
  lRows.forEach(function (r) { var c = _glStr_(r[4]); if (map[c]) { r[4] = map[c]; nLines++; } });
  if (nLines) lSh.getRange(2, 1, lRows.length, GL_SHEETS_.lines.headers.length).setValues(lRows);
  if (eChanged) eSh.getRange(2, 1, eRows.length, GL_SHEETS_.entries.headers.length).setValues(eRows);
  // 3) الإعدادات (أي قيمة تساوي كوداً منقولاً: حسابات القيود التلقائية، وسيط العملات…)
  var sSh = _glSheet_('settings'), sRows = _glRows_('settings'), nSet = 0;
  sRows.forEach(function (r, i) { var v = _glStr_(r[1]); if (map[v]) { sSh.getRange(i + 2, 2).setNumberFormat('@').setValue(map[v]); nSet++; } });
  // 4) خريطة الحجوزات ومراجعة الدفعات
  var fix = function (key, col) {
    var sh = _glSheet_(key), rows = _glRows_(key), n = 0;
    rows.forEach(function (r, i) { var v = _glStr_(r[col]); if (map[v]) { sh.getRange(i + 2, col + 1).setNumberFormat('@').setValue(map[v]); n++; } });
    return n;
  };
  var nHb = fix('hbmap', 2) + fix('hbpay', 1);
  // 5) البيانات المحاسبية للدفعات داخل ملف برنامج الحجوزات (لو مربوط)
  var nMeta = 0;
  try {
    var hbId = _glSettings_().hb_ss_id;
    var mSh = hbId ? SpreadsheetApp.openById(hbId).getSheetByName('البيانات المحاسبية للدفعات') : null;
    if (mSh && mSh.getLastRow() > 1) {
      var mv = mSh.getRange(2, 2, mSh.getLastRow() - 1, 1).getValues(), ch = false;
      mv.forEach(function (r) { var v = _glStr_(r[0]); if (map[v]) { r[0] = map[v]; nMeta++; ch = true; } });
      if (ch) mSh.getRange(2, 2, mv.length, 1).setNumberFormat('@').setValues(mv);
    }
  } catch (eM) { Logger.log('glMoveAccount meta: ' + eM); }
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
  try { CacheService.getScriptCache().removeAll(['gll_accs', 'gll_ents']); } catch (eC) {}
  logChange_(user, 'نقل حساب بالدليل', 'GL:' + newCode, acc.name, code + ' (تحت ' + acc.parent + ')', newCode + ' (تحت ' + newParent + ' — ' + np.name + ')');
  return { success: true, code: newCode, map: map, lines: nLines, settings: nSet, hb: nHb, meta: nMeta, hashes: nHash };
}

/* 🔀 (V4.223) دمج حسابين: كل قيود الحساب «المدموج» تنتقل للحساب «الباقي» ثم يُحذف المدموج (للمدير).
   مثال: «بنك مصر ايجيبشيان» + «بنك مصر ايجيبشيان بالجنيه»، أو حساب رحلة تلقائي + حساب لنفس الرحلة فُتح يدوياً.
   يُنقل معه: ربطه بشاشات البرنامج (فلا يُعاد فتحه بالمزامنة)، وإعدادات القيود التلقائية، وخريطة الحجوزات، وتوجيه الدفعات،
   وشيت العهدة — وتُحدَّث بصمات القيود التلقائية فلا تظهر كتغيير. dry=true معاينة. */
function glMergeAccounts(authToken, from, to, dry) {
  var session = _glAdminPerm_(authToken);
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    from = _glStr_(from); to = _glStr_(to);
    var accs = _glAccounts_(), A = accs.map[from], B = accs.map[to];
    if (!A || !B) throw new Error('اختر الحسابين');
    if (from === to) throw new Error('اختر حسابين مختلفين');
    if (A.isGroup || B.isGroup) throw new Error('الدمج للحسابات الفرعية فقط (ليس الأقسام)');
    var lRows = _glRows_('lines'), n = 0, curs = {}, ents = {};
    lRows.forEach(function (l) { if (_glStr_(l[4]) === from) { n++; curs[_glStr_(l[7]) || 'EGP'] = 1; ents[_glStr_(l[0])] = 1; } });
    if (B.currency && Object.keys(curs).some(function (c) { return c !== B.currency; }))
      throw new Error('الحساب الباقي «' + B.name + '» بعملة ' + B.currency + ' فقط، وقيود الحساب المدموج فيها ' + Object.keys(curs).join('، ') + ' — اختر حساباً بلا عملة محددة أو عدّل عملته أولاً');
    var locked = 0; _glRows_('entries').forEach(function (r) { if (ents[_glStr_(r[0])] && _glLocked_(r[2])) locked++; });
    var info = { success: true, from: { code: from, name: A.name, kind: A.kind, link: A.link }, to: { code: to, name: B.name, kind: B.kind, link: B.link }, lines: n, entries: Object.keys(ents).length, currencies: Object.keys(curs), locked: locked };
    if (dry) return info;
    if (locked) throw new Error(locked + ' قيداً للحساب المدموج في فترة مقفلة — افتح الفترة أولاً');
    var map = {}; map[from] = to;
    // 1) أسطر القيود + بصمات القيود التلقائية
    var byEntry = {}; lRows.forEach(function (r) { (byEntry[_glStr_(r[0])] = byEntry[_glStr_(r[0])] || []).push(r); });
    var eSh = _glSheet_('entries'), eRows = _glRows_('entries'), eCh = false;
    eRows.forEach(function (e) {
      var ls = byEntry[_glStr_(e[0])]; if (!ls || !ls.some(function (l) { return _glStr_(l[4]) === from; })) return;
      if (/^AUTO:/.test(_glStr_(e[6])) && /^h:/.test(_glStr_(e[9])) && _glLineHash_(e, ls, null) === _glStr_(e[9])) { e[9] = _glLineHash_(e, ls, map); eCh = true; }
    });
    lRows.forEach(function (r) { if (_glStr_(r[4]) === from) r[4] = to; });
    if (n) _glSheet_('lines').getRange(2, 1, lRows.length, GL_SHEETS_.lines.headers.length).setValues(lRows);
    if (eCh) eSh.getRange(2, 1, eRows.length, GL_SHEETS_.entries.headers.length).setValues(eRows);
    // 2) الإعدادات (قيم = الكود) + شيت العهدة (مفتاح = الكود)
    var sSh = _glSheet_('settings'), sRows = _glRows_('settings');
    sRows.forEach(function (r, i) {
      if (_glStr_(r[1]) === from) sSh.getRange(i + 2, 2).setNumberFormat('@').setValue(to);
      if (_glStr_(r[0]) === 'custsheet:' + from && !_glSettings_()['custsheet:' + to]) sSh.getRange(i + 2, 1).setValue('custsheet:' + to);
    });
    var fix = function (key, col) { try { var sh = _glSheet_(key); _glRows_(key).forEach(function (r, i) { if (_glStr_(r[col]) === from) sh.getRange(i + 2, col + 1).setNumberFormat('@').setValue(to); }); } catch (e) {} };
    fix('hbmap', 2); fix('hbpay', 1); fix('cpdir', 1);
    try {
      var hbId = _glSettings_().hb_ss_id, mSh = hbId ? SpreadsheetApp.openById(hbId).getSheetByName('البيانات المحاسبية للدفعات') : null;
      if (mSh && mSh.getLastRow() > 1) { var mv = mSh.getRange(2, 2, mSh.getLastRow() - 1, 1).getValues(), ch = false; mv.forEach(function (r) { if (_glStr_(r[0]) === from) { r[0] = to; ch = true; } }); if (ch) mSh.getRange(2, 2, mv.length, 1).setNumberFormat('@').setValues(mv); }
    } catch (eM) {}
    // 3) الحساب الباقي يرث ربط المدموج (وإلا يُحفظ كرابط إضافي) ثم حذف المدموج
    var aSh = _glSheet_('accounts'), aRows = _glRows_('accounts'), rowB = -1, rowA = -1;
    aRows.forEach(function (r, i) { if (_glStr_(r[0]) === to) rowB = i; if (_glStr_(r[0]) === from) rowA = i; });
    if (A.link) {
      var rb = aRows[rowB];
      if (!_glStr_(rb[7])) { rb[6] = rb[6] || A.kind; rb[7] = A.link; }
      else if (!(A.kind === _glStr_(rb[6]) && _glNorm_(A.link) === _glNorm_(rb[7]))) rb[9] = (_glStr_(rb[9]) + ' ⟦alias:' + A.kind + '|' + A.link + '⟧').trim();
      aSh.getRange(rowB + 2, 1, 1, GL_SHEETS_.accounts.headers.length).setValues([rb]);
    }
    (String(A.notes || '').match(/⟦alias:[^⟧]+⟧/g) || []).forEach(function (al) {
      var rb2 = aSh.getRange(rowB + 2, 1, 1, GL_SHEETS_.accounts.headers.length).getValues()[0];
      if (String(rb2[9]).indexOf(al) < 0) { rb2[9] = (_glStr_(rb2[9]) + ' ' + al).trim(); aSh.getRange(rowB + 2, 1, 1, rb2.length).setValues([rb2]); }
    });
    aSh.deleteRow(rowA + 2);
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    try { CacheService.getScriptCache().removeAll(['gll_accs', 'gll_ents']); } catch (eC) {}
    logChange_(session.username, 'دمج حساب في حساب', 'GL:' + to, 'دليل الحسابات', from + ' — ' + A.name + ' (' + n + ' سطر)', to + ' — ' + B.name);
    info.dry = false; return info;
  } finally { lock.releaseLock(); }
}
// ربط تلقائي: حساب لكل عميل (تحت 1201) ولكل وكيل سعودي (تحت 2101) لا يوجد له حساب بعد
function glSyncParties(authToken) {
  var session = _glAdminPerm_(authToken);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null;
    var accs = _glAccounts_().list, linked = {};
    accs.forEach(function (a) { if (a.link) linked[a.kind + '|' + _glNorm_(a.link)] = 1; });
    var clients = [], agents = {};
    try { getClientsDirectory(authToken).forEach(function (c) { if (c.name) clients.push(c.name); }); } catch (e) {}
    try { _vzReadAll_().forEach(function (f) { if (_glStr_(f.agent)) agents[_glStr_(f.agent)] = 1; }); } catch (e) {}
    try { _vzReadPrices_().forEach(function (p) { if (_glStr_(p.agent)) agents[_glStr_(p.agent)] = 1; }); } catch (e) {}
    var rows = [], made = { clients: 0, agents: 0 };
    var nextCodes = {};
    var nextOf = function (parent) {
      if (nextCodes[parent] === undefined) {
        var max = 0; accs.forEach(function (a) { if (a.parent === parent && a.code.length === parent.length + 3) { var n = parseInt(a.code.slice(parent.length), 10); if (n > max) max = n; } });
        nextCodes[parent] = max;
      }
      nextCodes[parent]++;
      var s = String(nextCodes[parent]); while (s.length < 3) s = '0' + s;
      return parent + s;
    };
    clients.forEach(function (n) {
      if (typeof _clientValIsSupervisor_ === 'function' && _clientValIsSupervisor_(n)) return;
      if (linked['client|' + _glNorm_(n)]) return;
      linked['client|' + _glNorm_(n)] = 1;
      rows.push(_glAccRow_({ code: nextOf('1201'), name: n, type: 'ASSET', parent: '1201', kind: 'client', link: n }, session.username)); made.clients++;
    });
    Object.keys(agents).sort().forEach(function (n) {
      if (linked['agent|' + _glNorm_(n)]) return;
      linked['agent|' + _glNorm_(n)] = 1;
      rows.push(_glAccRow_({ code: nextOf('2101'), name: n, type: 'LIAB', parent: '2101', kind: 'agent', link: n }, session.username)); made.agents++;
    });
    if (rows.length) {
      var sh = _glSheet_('accounts');
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, GL_SHEETS_.accounts.headers.length).setValues(rows);
    }
    _GL_ACC_MEMO_ = null;
    if (rows.length) logChange_(session.username, 'ربط العملاء والوكلاء بدليل الحسابات', 'GL:sync', '-', '-', made.clients + ' عميل، ' + made.agents + ' وكيل');
    return { success: true, clients: made.clients, agents: made.agents };
  } finally { lock.releaseLock(); }
}

/* ---------------------------- القيود ---------------------------- */
function _glNextEntrySeq_(n) {
  var s = _glSettings_(), cur = parseInt(s.seq_entry, 10) || 0;
  _glSetSetting_('seq_entry', cur + (n || 1));
  return cur + 1;
}
function _glEntryId_(seq) { var s = String(seq); while (s.length < 6) s = '0' + s; return 'JE-' + s; }
// تطبيع وفحص قيد قبل الحفظ — يُعيد {lines, totalBase} أو يرمي خطأً واضحاً
function _glValidate_(e, opts) {
  opts = opts || {};
  var accs = _glAccounts_().map, rates = _glRates_(), set = _glSettings_();
  var date = _glDate_(e.date);
  if (!date) throw new Error('تاريخ القيد مطلوب (dd/mm/yyyy)');
  var type = GL_ENTRY_TYPES_.indexOf(e.type) >= 0 ? e.type : 'قيد يومية';
  if (!opts.allowSystem && GL_SYS_TYPES_.indexOf(type) >= 0) type = 'قيد يومية';
  // 🔒 (V4.207) الفترات المقفلة: لا قيد بتاريخ ≤ تاريخ الإقفال
  if (!opts.ignoreLock && _glLocked_(date)) throw new Error('الفترة مقفلة حتى ' + _glSettings_().lockDate + ' — لا يمكن تسجيل أو تعديل قيد بتاريخ ' + date);
  if (!opts.allowBeforeStart && type !== 'قيد افتتاحي' && type !== 'قيد مستورد' && _glDKey_(date) < _glDKey_(set.startDate)) {
    throw new Error('تاريخ القيد قبل تاريخ بداية الحسابات (' + set.startDate + ') — استخدم الأرصدة الافتتاحية أو الاستيراد المجمّع للبيانات القديمة');
  }
  var lines = [], dB = 0, cB = 0, curs = {}, dC = {}, cC = {}, fxTol = 0;
  (e.lines || []).forEach(function (l, i) {
    var code = _glStr_(l.account), d = _glR2_(_glNum_(l.debit)), c = _glR2_(_glNum_(l.credit));
    if (!code && !d && !c) return;   // سطر فارغ
    var a = accs[code];
    if (!a) throw new Error('السطر ' + (i + 1) + ': الحساب غير موجود (' + code + ')');
    if (a.isGroup) throw new Error('السطر ' + (i + 1) + ': «' + a.name + '» حساب تجميعي — اختر حساباً فرعياً');
    if (!a.active) throw new Error('السطر ' + (i + 1) + ': الحساب «' + a.name + '» موقوف');
    if (d < 0 || c < 0) throw new Error('السطر ' + (i + 1) + ': المبالغ لا تكون سالبة');
    if ((d && c) || (!d && !c)) throw new Error('السطر ' + (i + 1) + ': أدخل مديناً أو دائناً (واحداً فقط)');
    var cur = _glCur_(l.currency || a.currency || 'EGP');
    if (a.currency && a.currency !== cur) throw new Error('السطر ' + (i + 1) + ': عملة الحساب «' + a.name + '» هي ' + a.currency);
    var rate0 = cur === 'EGP' ? 1 : (_glNum_(l.rate) || rates[cur]);
    if (!(rate0 > 0)) throw new Error('السطر ' + (i + 1) + ': سعر الصرف مطلوب');
    // 💱 (V4.219) سعر الصرف يُحفظ ويُعرض بخانتين عشريتين كحد أقصى. أسطر نقل الأرصدة (exact) تحفظ معادلها الدقيق
    var rate = cur === 'EGP' ? 1 : (Math.round(rate0 * 100) / 100 || rate0), brate = l.exact ? rate0 : rate;
    if (cur !== 'EGP' && !l.exact) fxTol += (d + c) * 0.005;
    var bd = _glR2_(d * brate), bc = _glR2_(c * brate);
    dB += bd; cB += bc; curs[cur] = 1; dC[cur] = (dC[cur] || 0) + d; cC[cur] = (cC[cur] || 0) + c;
    lines.push({ account: code, debit: d, credit: c, currency: cur, rate: rate, bDebit: bd, bCredit: bc,
      trip: _glStr_(l.trip || e.trip), company: _glStr_(l.company || e.company),
      client: _glStr_(l.client || (a.kind === 'client' ? a.link : '')), agent: _glStr_(l.agent || (a.kind === 'agent' ? a.link : '')),
      desc: _glStr_(l.desc || e.desc) });
  });
  if (lines.length < 2) throw new Error('القيد يحتاج سطرين على الأقل');
  var single = Object.keys(curs).length === 1;
  if (single) {
    var k = Object.keys(curs)[0];
    if (Math.abs(_glR2_(dC[k] - cC[k])) > 0.009) throw new Error('القيد غير متوازن: المدين ' + _glR2_(dC[k]) + ' ≠ الدائن ' + _glR2_(cC[k]) + ' ' + k);
  } else if (Math.abs(_glR2_(dB - cB)) > 0.05) {
    var diffB = _glR2_(dB - cB);
    if (Math.abs(diffB) > 0.05 + fxTol) throw new Error('القيد غير متوازن بعملة الأساس: المدين المعادل ' + _glR2_(dB) + ' ≠ الدائن المعادل ' + _glR2_(cB) + ' جنيه');
    // فرق تقريب السعر لخانتين: يمتصه «وسيط تحويل العملات» (كفروق تحويل مثل الـ ERP)، وإلا يُضاف لمعادل أكبر سطر أجنبي
    var brX = _glFxBridgeAcc_();
    var willBridge = !opts.noBridge && type !== 'قيد افتتاحي' && type !== 'قيد إقفال' && set.fx_bridge !== 'لا' && brX && !lines.some(function (l) { return l.account === brX; });
    if (!willBridge) {
      var big = null; lines.forEach(function (l) { if (l.currency !== 'EGP' && (!big || l.debit + l.credit > big.debit + big.credit)) big = l; });
      if (big) { if (big.debit) big.bDebit = _glR2_(big.bDebit - diffB); else big.bCredit = _glR2_(big.bCredit + diffB); dB = _glR2_(dB - (big.debit ? diffB : 0)); }
    }
  }
  // 💱 (V4.208) تحويل العملة التلقائي (آلية الـ ERP): قيد بأكثر من عملة ← تُضاف أسطر على حساب
  // «وسيط تحويل العملات» تُصفّي كل عملة داخل نفسها، فيتوازن القيد بكل عملة على حدة وتبقى مراكز
  // العملات ظاهرة في حساب الوسيط. لا يُطبَّق على الافتتاحي/الإقفال ولا على قيد فيه الوسيط أصلاً.
  if (!single && !opts.noBridge && type !== 'قيد افتتاحي' && type !== 'قيد إقفال' && _glSettings_().fx_bridge !== 'لا') {
    var br = _glFxBridgeAcc_();
    if (br && !lines.some(function (l) { return l.account === br; })) {
      var net = {}, bnet = {};
      lines.forEach(function (l) { net[l.currency] = (net[l.currency] || 0) + l.debit - l.credit; bnet[l.currency] = (bnet[l.currency] || 0) + l.bDebit - l.bCredit; });
      Object.keys(net).sort().forEach(function (c) {
        var n = _glR2_(net[c]), b = _glR2_(bnet[c]);
        if (Math.abs(n) < 0.005) return;
        var rate = c === 'EGP' ? 1 : Math.round(Math.abs(b / n) * 100) / 100;   // المعادل الدقيق في bDebit/bCredit
        lines.push({ account: br, debit: n < 0 ? -n : 0, credit: n > 0 ? n : 0, currency: c, rate: rate,
          bDebit: b < 0 ? -b : 0, bCredit: b > 0 ? b : 0, trip: _glStr_(e.trip), company: _glStr_(e.company), client: '', agent: '',
          desc: _glBridgeDesc_(lines, c, accs) });
      });
      dB = 0; lines.forEach(function (l) { dB += l.bDebit; });
    }
  }
  return { date: date, type: type, lines: lines, totalBase: _glR2_(dB) };
}
// (V4.223) بيان سطر وسيط العملات مثل الـ ERP: «بيان سطر نفس العملة — اسم حسابه» (وإلا «تحويل عملة (العملة)»)
function _glBridgeDesc_(lines, cur, accs) {
  var src = lines.filter(function (l) { return l.currency === cur; })[0];
  if (!src) return 'تحويل عملة (' + cur + ')';
  var a = accs[src.account];
  return (src.desc || 'تحويل عملة') + (a ? ' — ' + a.name : '');
}
function _glWriteEntry_(v, meta, user) {
  // meta: {id?, seq?, status, sourceKey, batchId, desc, ref, trip, company, row?(للتعديل)}
  var now = _glNow_();
  var eRow = [meta.id, meta.seq, v.date, v.type, _glStr_(meta.desc), meta.status, _glStr_(meta.sourceKey), _glStr_(meta.batchId), v.totalBase,
    _glStr_(meta.ref), _glStr_(meta.trip), _glStr_(meta.company), meta.createdBy || user, meta.createdAt || now,
    meta.status === GL_ST_POSTED_ ? user : '', meta.status === GL_ST_POSTED_ ? now : '', meta.row ? user : '', meta.row ? now : '', ''];
  var lRows = v.lines.map(function (l, i) {
    return [meta.id, i + 1, v.date, meta.status, l.account, l.debit || '', l.credit || '', l.currency, l.rate, l.bDebit || '', l.bCredit || '',
      l.trip, l.company, l.client, l.agent, l.desc];
  });
  return { eRow: eRow, lRows: lRows };
}
function _glDeleteLinesOf_(ids) {
  var set = {}; ids.forEach(function (id) { set[id] = 1; });
  var sh = _glSheet_('lines'), last = sh.getLastRow(); if (last < 2) return;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) {
    if (!set[_glStr_(col[i][0])]) continue;
    var j = i; while (j - 1 >= 0 && set[_glStr_(col[j - 1][0])]) j--;
    sh.deleteRows(j + 2, i - j + 1); i = j;
  }
}
function _glSetLinesStatus_(ids, status) {
  var set = {}; ids.forEach(function (id) { set[id] = 1; });
  var sh = _glSheet_('lines'), last = sh.getLastRow(); if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, 4).getValues();
  var changed = false;
  vals.forEach(function (r) { if (set[_glStr_(r[0])]) { r[3] = status; changed = true; } });
  if (changed) sh.getRange(2, 4, vals.length, 1).setValues(vals.map(function (r) { return [r[3]]; }));
}
function _glFindEntry_(id) {
  var rows = _glRows_('entries');
  for (var i = 0; i < rows.length; i++) if (_glStr_(rows[i][0]) === id) return { row: i + 2, r: rows[i] };
  return null;
}
function glSaveEntry(authToken, e, post) {
  e = e || {};
  var isEdit = !!_glStr_(e.id);
  var session = _glPerm_(authToken, isEdit ? 'edit' : 'add');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var fPeek = isEdit ? _glFindEntry_(_glStr_(e.id)) : null, autoPeek = !!(fPeek && /^AUTO:/.test(_glStr_(fPeek.r[6])));
    var v = _glValidate_(e, autoPeek ? { allowBeforeStart: true, allowSystem: true } : {});
    var status = post ? GL_ST_POSTED_ : GL_ST_DRAFT_;
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    if (isEdit) {
      var f = _glFindEntry_(_glStr_(e.id));
      if (!f) throw new Error('القيد غير موجود');
      // ✏️ (V4.219) تعديل القيد المرحّل مباشرة لمن له صلاحية التعديل (بدل الإلغاء وإعادة التسجيل)، والقيد التلقائي
      // للمدير فقط — يحتفظ بمفتاح مصدره وبصمته فلا تُعيد المزامنة كتابته إلا لو تغيّر مصدره نفسه بالشاشات
      var oldSt = _glStr_(f.r[5]), isAuto = /^AUTO:/.test(_glStr_(f.r[6]));
      if (oldSt === GL_ST_VOID_) throw new Error('القيد ملغى — لا يُعدَّل');
      if (isAuto && !_glIsAdmin_(session)) throw new Error('تعديل القيود التلقائية للمدير فقط');
      if (_glStr_(f.r[3]) === 'قيد إقفال') throw new Error('قيد إقفال السنة لا يُعدَّل يدوياً');
      if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
      if (oldSt === GL_ST_POSTED_) status = GL_ST_POSTED_;
      if (isAuto) v.type = _glStr_(f.r[3]) || v.type;
      var sk = _glStr_(f.r[6]);
      if (GL_VCH_PREFIX_[v.type] && !sk) sk = 'VCH:' + _glNextVoucherNo_(v.type);   // سند قديم بلا رقم ⇒ يأخذ رقماً
      var w = _glWriteEntry_(v, { id: f.r[0], seq: f.r[1], status: status, sourceKey: sk, batchId: f.r[7], desc: e.desc, ref: isAuto ? f.r[9] : e.ref, trip: e.trip, company: e.company,
        createdBy: f.r[12], createdAt: f.r[13], row: f.row }, session.username);
      eSh.getRange(f.row, 1, 1, w.eRow.length).setValues([w.eRow]);
      _glDeleteLinesOf_([_glStr_(f.r[0])]);
      lSh.getRange(lSh.getLastRow() + 1, 1, w.lRows.length, w.lRows[0].length).setValues(w.lRows);
      logChange_(session.username, oldSt === GL_ST_POSTED_ ? 'تعديل قيد مرحّل' : (post ? 'تعديل وترحيل قيد' : 'تعديل قيد مسودة'), 'GL:' + f.r[0], 'القيد',
        _glStr_(f.r[4]) + ' — ' + _glNum_(f.r[8]) + ' ج', v.type + ' — ' + _glStr_(e.desc) + ' — ' + v.totalBase + ' ج');
      _glSyncVoucherPays_(_glStr_(f.r[0]), session.username);   // (V4.222) إيصال على حساب عميل ⇒ دفعة بحسابات العملاء
      return { success: true, id: _glStr_(f.r[0]), status: status, voucherNo: (sk.match(/^VCH:(.+)$/) || [])[1] || '' };
    }
    var seq = _glNextEntrySeq_(1), id = _glEntryId_(seq);
    var vno = (GL_VCH_PREFIX_[v.type] && !_glStr_(e.sourceKey)) ? _glNextVoucherNo_(v.type) : '';
    var w2 = _glWriteEntry_(v, { id: id, seq: seq, status: status, sourceKey: vno ? 'VCH:' + vno : e.sourceKey, desc: e.desc, ref: e.ref, trip: e.trip, company: e.company }, session.username);
    eSh.getRange(eSh.getLastRow() + 1, 1, 1, w2.eRow.length).setValues([w2.eRow]);
    lSh.getRange(lSh.getLastRow() + 1, 1, w2.lRows.length, w2.lRows[0].length).setValues(w2.lRows);
    logChange_(session.username, post ? 'تسجيل وترحيل قيد' : 'تسجيل قيد مسودة', 'GL:' + id, 'القيد', '-', (vno ? vno + ' — ' : '') + v.type + ' — ' + _glStr_(e.desc) + ' — ' + v.totalBase + ' ج');
    if (status === GL_ST_POSTED_) _glSyncVoucherPays_(id, session.username);
    return { success: true, id: id, status: status, voucherNo: vno };
  } finally { lock.releaseLock(); }
}
function glPostEntry(authToken, id) {
  var session = _glPerm_(authToken, 'edit');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var f = _glFindEntry_(_glStr_(id)); if (!f) throw new Error('القيد غير موجود');
    if (_glStr_(f.r[5]) !== GL_ST_DRAFT_) throw new Error('القيد ليس مسودة');
    // إعادة الفحص قبل الترحيل (ربما تغيّر الحساب أو أُوقف)
    var ent = _glEntryFull_(_glStr_(id));
    _glValidate_(ent);
    _glSheet_('entries').getRange(f.row, 6).setValue(GL_ST_POSTED_);
    _glSheet_('entries').getRange(f.row, 15, 1, 2).setValues([[session.username, _glNow_()]]);
    _glSetLinesStatus_([_glStr_(id)], GL_ST_POSTED_);
    logChange_(session.username, 'ترحيل قيد', 'GL:' + id, 'الحالة', GL_ST_DRAFT_, GL_ST_POSTED_);
    _glSyncVoucherPays_(_glStr_(id), session.username);
    return { success: true };
  } finally { lock.releaseLock(); }
}
function glVoidEntry(authToken, id, reason) {
  var session = _glPerm_(authToken, 'delete');
  reason = _glStr_(reason);
  if (!reason) throw new Error('سبب الإلغاء مطلوب');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var f = _glFindEntry_(_glStr_(id)); if (!f) throw new Error('القيد غير موجود');
    var st = _glStr_(f.r[5]);
    if (st === GL_ST_VOID_) throw new Error('القيد ملغى بالفعل');
    if (/^AUTO:/.test(_glStr_(f.r[6]))) throw new Error('هذا قيد تلقائي من شاشات البرنامج — يتغيّر أو يُلغى تلقائياً عند تعديل مصدره (راجع تبويب «القيود التلقائية»)');
    if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
    if (st === GL_ST_DRAFT_) {   // المسودة تُحذف نهائياً (لم تؤثر على أي رصيد)
      _glDeleteLinesOf_([_glStr_(id)]);
      _glSheet_('entries').deleteRow(f.row);
      logChange_(session.username, 'حذف قيد مسودة', 'GL:' + id, 'القيد', _glStr_(f.r[4]), '-');
      return { success: true, deleted: true };
    }
    var sh = _glSheet_('entries');
    sh.getRange(f.row, 6).setValue(GL_ST_VOID_);
    sh.getRange(f.row, 17, 1, 3).setValues([[session.username, _glNow_(), reason]]);
    _glSetLinesStatus_([_glStr_(id)], GL_ST_VOID_);
    logChange_(session.username, 'إلغاء قيد مرحّل', 'GL:' + id, 'الحالة', GL_ST_POSTED_, GL_ST_VOID_ + ' — ' + reason);
    _glSyncVoucherPays_(_glStr_(id), session.username);
    return { success: true };
  } finally { lock.releaseLock(); }
}
// 🗑️ (V4.217) حذف قيد نهائياً (للمدير): المسودة/المرحّل/الملغى اليدوي أو المستورد — لا القيود التلقائية (تُدار من
// مصدرها) ولا قيود الفترات المقفلة. السند المحذوف لا يُعاد استخدام رقمه.
function glDeleteEntry(authToken, id) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('الحذف النهائي للقيود للمدير فقط — يمكنك «إلغاء» القيد بدلاً من ذلك');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var f = _glFindEntry_(_glStr_(id)); if (!f) throw new Error('القيد غير موجود');
    // (V4.218) القيد التلقائي يُحذف أيضاً للمدير — لكنه يُعاد إنشاؤه في المزامنة التالية ما دام مصدره موجوداً بالشاشات
    if (_glStr_(f.r[3]) === 'قيد إقفال') throw new Error('قيد إقفال السنة يُلغى من «الإعدادات ← إعادة فتح السنة»');
    if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
    _glDeleteLinesOf_([_glStr_(id)]);
    _glSheet_('entries').deleteRow(f.row);
    _glSyncVoucherPays_(_glStr_(id), session.username);   // (V4.222) تُحذف الدفعة المقابلة بحسابات العملاء
    logChange_(session.username, 'حذف قيد نهائياً', 'GL:' + id, _glStr_(f.r[3]) + ' — ' + _glStr_(f.r[5]), _glStr_(f.r[4]) + ' — ' + _glNum_(f.r[8]) + ' ج', '-');
    return { success: true };
  } finally { lock.releaseLock(); }
}
// 📜 (V4.217) سجل تعديلات قيد (إنشاء/تعديل/ترحيل/إلغاء/حذف) من سجل التعديلات العام
function glEntryHistory(authToken, id) {
  _glPerm_(authToken, 'view');
  var key = 'GL:' + _glStr_(id), sheet = ensureAuditLogSheet_(), last = sheet.getLastRow(), out = [];
  if (last < 2) return { success: true, rows: out };
  sheet.getRange(2, 1, last - 1, 7).getValues().forEach(function (r) {
    if (_glStr_(r[3]) !== key) return;
    out.push({ timestamp: _glStr_(r[0]), username: _glStr_(r[1]) || '-', action: _glStr_(r[2]) || '-', field: _glStr_(r[4]) || '-',
      oldValue: _glStr_(r[5]) || '-', newValue: _glStr_(r[6]) || '-' });
  });
  return { success: true, rows: out.reverse() };
}
function _glEntryObj_(r) {
  return { id: _glStr_(r[0]), seq: r[1], date: _glDate_(r[2]), type: _glStr_(r[3]), desc: _glStr_(r[4]), status: _glStr_(r[5]),
    sourceKey: _glStr_(r[6]), batchId: _glStr_(r[7]), totalBase: _glNum_(r[8]), ref: _glStr_(r[9]), trip: _glStr_(r[10]), company: _glStr_(r[11]),
    createdBy: _glStr_(r[12]), createdAt: _glStr_(r[13]), postedBy: _glStr_(r[14]), postedAt: _glStr_(r[15]),
    updatedBy: _glStr_(r[16]), updatedAt: _glStr_(r[17]), voidReason: _glStr_(r[18]),
    voucherNo: (_glStr_(r[6]).match(/^VCH:(.+)$/) || [])[1] || '' };
}
/* 🧾 (V4.216) رقم سند تلقائي — نفس نظام الـ ERP: REC-00001 لسندات القبض وPAY-00001 لسندات الصرف، عدّاد دائم لكل
   نوع (لا يتصفّر سنوياً ولا يُعاد استخدام رقم محذوف). يُحفظ بعمود «مفتاح المصدر» بالصيغة VCH:REC-00001. أول مرة
   يبدأ العدّاد بعد أعلى رقم موجود فعلاً (بالسندات السابقة أو بمراجع القيود المنقولة من الـ ERP) فلا تتكرر الأرقام. */
var GL_VCH_PREFIX_ = { 'سند قبض': 'REC-', 'سند صرف': 'PAY-' };
// بيانات الشركة بقالب السند (نفس قالب الـ ERP) — تُعدَّل من «الإعدادات»؛ الشعار من شعار الشركة المسجَّل بإعدادات الإشعارات
var GL_VCH_BRAND_DEF_ = {
  vch_name_ar: 'شركة منف للسياحة الدولية', vch_name_en: 'Menf International Tours',
  vch_tagline: 'رحلات حج وعمرة - تذاكر سفر - برامج سياحية', vch_address: '32 شارع الفلكي - باب اللوق - القاهرة',
  vch_phone: '+002 02 27926054', vch_email: 'mt@menftours.net', vch_logo_company: '',
  vch_note: 'لا يعتد بهذا الإيصال بعد انتهاء الرحلة أو بعد مرور 30 يوماً من تاريخ الإيصال'
};
function _glSettingsOut_() { var o = JSON.parse(JSON.stringify(_glSettings_())); o.vchBrand = _glVchBrand_(); return o; }
function _glVchBrand_() {
  var set = _glSettings_(), o = {};
  Object.keys(GL_VCH_BRAND_DEF_).forEach(function (k) { o[k] = set[k] !== undefined && set[k] !== '' ? set[k] : GL_VCH_BRAND_DEF_[k]; });
  return o;
}
// بيانات طباعة سند قبض/صرف: الخزينة/البنك (الطرف الرئيسي) والطرف المقابل والمبلغ بعملة السند
function glVoucherPrint(authToken, id) {
  var session = _glPerm_(authToken, 'view');
  var e = _glEntryFull_(_glStr_(id)); if (!e) throw new Error('القيد غير موجود');
  if (!GL_VCH_PREFIX_[e.type]) throw new Error('الطباعة بقالب السند لسندات القبض والصرف فقط');
  var accs = _glAccounts_().map, isRec = e.type === 'سند قبض';
  var isCash = function (l) { var a = accs[l.account]; return a && /^(safe|bank|custody)$/.test(a.kind); };
  var main = e.lines.filter(function (l) { return isCash(l) && (isRec ? l.debit > 0 : l.credit > 0); });
  if (!main.length) main = e.lines.filter(function (l) { return isRec ? l.debit > 0 : l.credit > 0; }).slice(0, 1);
  var counter = e.lines.filter(function (l) { return main.indexOf(l) < 0; });
  var cur = main.length ? main[0].currency : (e.lines[0] || {}).currency || 'EGP';
  var amount = _glR2_(main.reduce(function (a, l) { return a + (isRec ? l.debit : l.credit); }, 0));
  var nm = function (l) { var a = accs[l.account]; return a ? (a.link || a.name) : l.account; };
  var cn = []; counter.forEach(function (l) { var n = nm(l); if (cn.indexOf(n) < 0) cn.push(n); });
  var brand = _glVchBrand_(), logo = '';
  try { logo = typeof getCompanyLogoBase64 === 'function' ? getCompanyLogoBase64(brand.vch_logo_company || e.company || '') : ''; } catch (eL) {}
  var vno = e.voucherNo || ((_glStr_(e.ref).match(/^(REC|PAY)-\d+$/) || [])[0]) || e.id;
  return { success: true, voucherNo: vno, entryId: e.id, type: e.type, isReceipt: isRec, date: e.date, amount: amount, currency: cur,
    counterName: cn.length > 3 ? 'أطراف متعددة (' + cn.length + ')' : cn.join(' + '), safeName: main.map(nm).join(' + '),
    statement: e.desc || (counter[0] || {}).desc || '', user: e.createdBy, status: e.status, brand: brand, logo: logo, printedBy: session.username };
}
function _glNextVoucherNo_(type) {
  var pre = GL_VCH_PREFIX_[type]; if (!pre) return '';
  var key = 'seq_' + pre.replace('-', ''), last = parseInt(_glSettings_()[key], 10);
  if (isNaN(last)) {
    last = 0;
    var rx = new RegExp('^(?:VCH:)?' + pre + '(\\d+)$');
    _glRows_('entries').forEach(function (r) {
      [_glStr_(r[6]), _glStr_(r[9])].forEach(function (v) { var m = v.match(rx); if (m && +m[1] > last) last = +m[1]; });
    });
  }
  last++;
  _glSetSetting_(key, String(last));
  var n = String(last); while (n.length < 5) n = '0' + n;
  return pre + n;
}
function _glLineObj_(r) {
  return { entryId: _glStr_(r[0]), lineNo: r[1], date: _glDate_(r[2]), status: _glStr_(r[3]), account: _glStr_(r[4]),
    debit: _glNum_(r[5]), credit: _glNum_(r[6]), currency: _glCur_(r[7]), rate: _glNum_(r[8]) || 1,
    bDebit: _glNum_(r[9]), bCredit: _glNum_(r[10]), trip: _glStr_(r[11]), company: _glStr_(r[12]), client: _glStr_(r[13]), agent: _glStr_(r[14]), desc: _glStr_(r[15]) };
}
function _glEntryFull_(id) {
  var f = _glFindEntry_(id); if (!f) return null;
  var e = _glEntryObj_(f.r);
  e.lines = _glRows_('lines').filter(function (r) { return _glStr_(r[0]) === id; }).map(_glLineObj_)
    .sort(function (a, b) { return a.lineNo - b.lineNo; });
  e.attachments = _glAttachMap_()[id] || [];
  return e;
}
function glGetEntry(authToken, id) {
  _glPerm_(authToken, 'view');
  var e = _glEntryFull_(_glStr_(id));
  if (!e) throw new Error('القيد غير موجود');
  return { success: true, entry: e };
}
// قائمة القيود بفلاتر: from/to/type/status/account/q/batch — الأحدث أولاً (حد 400)
function glListEntries(authToken, f) {
  _glPerm_(authToken, 'view');
  f = f || {};
  var fromK = _glDKey_(_glDate_(f.from)), toK = _glDKey_(_glDate_(f.to)), q = _glNorm_(f.q || ''), acc = _glStr_(f.account);
  var byEntry = {};
  var linesAll = _glRows_('lines');
  linesAll.forEach(function (r) { var id = _glStr_(r[0]); (byEntry[id] = byEntry[id] || []).push(r); });
  var out = [];
  _glRows_('entries').forEach(function (r) {
    var e = _glEntryObj_(r), k = _glDKey_(e.date);
    if (fromK && k < fromK) return; if (toK && k > toK) return;
    if (f.type && e.type !== f.type) return;
    if (f.status && e.status !== f.status) return;
    if (f.batch && e.batchId !== f.batch) return;
    var ls = (byEntry[e.id] || []).map(_glLineObj_).sort(function (a, b) { return a.lineNo - b.lineNo; });
    if (acc && !ls.some(function (l) { return l.account.indexOf(acc) === 0; })) return;
    if (q) {
      var hay = _glNorm_([e.id, e.voucherNo, e.desc, e.ref, e.type, e.trip, e.company].concat(ls.map(function (l) { return l.desc + ' ' + l.client + ' ' + l.agent + ' ' + l.trip; })).join(' '));
      if (hay.indexOf(q) < 0) return;
    }
    e.lines = ls; e._k = k;
    out.push(e);
  });
  out.sort(function (a, b) { return a._k < b._k ? 1 : (a._k > b._k ? -1 : (b.seq - a.seq)); });
  var total = out.length;
  return { success: true, total: total, entries: out.slice(0, 400) };
}

/* ---------------------------- دفتر الأستاذ والميزان ---------------------------- */
// دفتر الأستاذ لحساب (أو مجموعة: كل الحسابات التي يبدأ كودها بهذا الكود) بفترة
function glLedger(authToken, code, from, to) {
  _glPerm_(authToken, 'view');
  code = _glStr_(code);
  var acc = _glAccounts_().map[code];
  if (!acc) throw new Error('اختر حساباً');
  var fromK = _glDKey_(_glDate_(from)), toK = _glDKey_(_glDate_(to));
  var open = { EGP: 0, SAR: 0, USD: 0, base: 0 }, rows = [];
  var entries = {}; _glRows_('entries').forEach(function (r) { entries[_glStr_(r[0])] = r; });
  _glRows_('lines').forEach(function (r) {
    if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
    var c = _glStr_(r[4]); if (c.indexOf(code) !== 0) return;
    var l = _glLineObj_(r), k = _glDKey_(l.date);
    if (toK && k > toK) return;
    if (fromK && k < fromK) {
      open[l.currency] = _glR2_(open[l.currency] + l.debit - l.credit); open.base = _glR2_(open.base + l.bDebit - l.bCredit); return;
    }
    var e = entries[l.entryId];
    l._k = k; l.seq = e ? e[1] : 0; l.type = e ? _glStr_(e[3]) : ''; l.entryDesc = e ? _glStr_(e[4]) : '';
    if (e) {   // (V4.216) رقم السند/المرجع وآخر تعديل — لأعمدة كشف الحساب بنظام الـ ERP
      var eo = _glEntryObj_(e);
      l.voucherNo = eo.voucherNo; l.ref = /^h:/.test(eo.ref) ? '' : eo.ref;
      l.mod = eo.updatedBy ? eo.updatedBy + ' — ' + eo.updatedAt : (eo.postedBy ? eo.postedBy + ' — ' + eo.postedAt : eo.createdBy + ' — ' + eo.createdAt);
    }
    rows.push(l);
  });
  rows.sort(function (a, b) { return a._k < b._k ? -1 : (a._k > b._k ? 1 : (a.seq - b.seq || a.lineNo - b.lineNo)); });
  var run = { EGP: open.EGP, SAR: open.SAR, USD: open.USD, base: open.base };
  rows.forEach(function (l) {
    run[l.currency] = _glR2_(run[l.currency] + l.debit - l.credit); run.base = _glR2_(run.base + l.bDebit - l.bCredit);
    l.balCur = run[l.currency]; l.balBase = run.base;
  });
  return { success: true, account: acc, opening: open, closing: run, rows: rows };
}
/* 📒 (V4.225) كشف الحساب الموحّد لأي حساب فرعي: الحركات بعملتها الأصلية (لكل عملة مدين/دائن/رصيد مستقل) + رصيد أول المدة
   + دور الحساب (عميل: مستحق عليه/رصيد له · مورد/وكيل: مستحق له/رصيد لنا · نقدية · عام) + وسوم التجميع (الرحلة/الشهر)
   + بيانات الحجز للحسابات المرتبطة ببرنامج الحجوزات + الحجوزات بلا سعر + التغييرات بانتظار الاعتماد + أعمار الديون. */
var GL_CURS_ = ['EGP', 'SAR', 'USD'];
function _glStmtRole_(acc) {
  var k = acc.kind || '';
  if (k === 'client') return 'client';
  if (k === 'agent' || k === 'supplier') return 'supplier';
  if (k === 'safe' || k === 'bank' || k === 'custody') return 'cash';
  if (acc.type === 'LIAB') return 'supplier';
  if (String(acc.code).indexOf('12') === 0) return 'client';
  return 'other';
}
function _glStmtCtx_() {
  var ctx = { accs: _glAccounts_(), entries: {}, byAcc: {}, byEntry: {}, pend: {}, att: {}, trips: {}, hbNames: {}, hb: null };
  _glRows_('entries').forEach(function (r) { ctx.entries[_glStr_(r[0])] = r; });
  _glRows_('lines').forEach(function (r) {
    if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
    var id = _glStr_(r[0]), c = _glStr_(r[4]);
    (ctx.byEntry[id] = ctx.byEntry[id] || []).push(r);
    (ctx.byAcc[c] = ctx.byAcc[c] || []).push(r);
  });
  var pr = _glPendingRows_(); Object.keys(pr).forEach(function (k) { var r = pr[k].row; if (_glStr_(r[9]) !== 'مرفوض') ctx.pend[_glStr_(r[1])] = _glStr_(r[2]) || 'تعديل'; });
  try { ctx.att = _glAttachMap_(); } catch (e) {}
  try {
    var sh = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (r) {
      var n = _glStr_(r[0]); if (n) ctx.trips[n] = { company: _glStr_(r[1]), go: _glAutoDate_(r[4]), back: _glAutoDate_(r[5]) };
    });
  } catch (e) {}
  try { _glRows_('hbmap').forEach(function (r) { var c = _glStr_(r[2]); if (c) (ctx.hbNames[c] = ctx.hbNames[c] || []).push({ name: _glStr_(r[0]), type: _glStr_(r[1]) }); }); } catch (e) {}
  return ctx;
}
function _glStmtHb_(ctx) {
  if (ctx.hb !== null) return ctx.hb;
  ctx.hb = false;
  try { if (_glHbOn_()) ctx.hb = _glHbRead_(); } catch (e) { ctx.hb = false; }
  return ctx.hb;
}
// أعمار الديون (FIFO): الحركات التي تزيد المستحق تُسدَّد بالأقدم أولاً — sign=+1 للعميل (المدين مستحق) و-1 للمورد
function _glAging_(lines, sign, asOf) {
  var day = function (d) { var m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5) : 0; };
  var now = day(asOf), out = {};
  GL_CURS_.forEach(function (cur) {
    var q = [], adv = 0, any = false;
    lines.forEach(function (l) {
      if (l.currency !== cur) return; any = true;
      var v = _glR2_(sign * (l.debit - l.credit));
      if (v > 0) { if (adv > 0) { var u = Math.min(adv, v); adv = _glR2_(adv - u); v = _glR2_(v - u); } if (v > 0) q.push({ d: day(l.date), v: v }); }
      else if (v < 0) { var pay = -v; while (pay > 0.004 && q.length) { var t = Math.min(pay, q[0].v); q[0].v = _glR2_(q[0].v - t); pay = _glR2_(pay - t); if (q[0].v <= 0.004) q.shift(); } adv = _glR2_(adv + pay); }
    });
    if (!any) return;
    var b = { d30: 0, d60: 0, d90: 0, d90p: 0, adv: adv, total: 0 };
    q.forEach(function (x) { var age = now - x.d, k = age <= 30 ? 'd30' : age <= 60 ? 'd60' : age <= 90 ? 'd90' : 'd90p'; b[k] = _glR2_(b[k] + x.v); b.total = _glR2_(b.total + x.v); });
    if (b.total || b.adv) out[cur] = b;
  });
  return out;
}
function _glStmtCore_(code, from, to, ctx) {
  var accs = ctx.accs, acc = accs.map[code];
  if (!acc) throw new Error('الحساب غير موجود: ' + code);
  if (acc.isGroup) throw new Error('كشف الحساب للحسابات الفرعية — استخدم دفتر الأستاذ للأقسام');
  var role = _glStmtRole_(acc), hbN = ctx.hbNames[code] || [];
  var hbRole = hbN.some(function (x) { return /مورد|شارت/.test(x.type); }) ? 'مورد سكن' : (hbN.some(function (x) { return /^عميل$/.test(x.type); }) || String(code).indexOf('1203') === 0 ? 'عميل سكن' : '');
  var fromK = _glDKey_(_glDate_(from)), toK = _glDKey_(_glDate_(to));
  var open = {}, tot = {}, rows = [], all = [], hasHb = false;
  GL_CURS_.forEach(function (c) { open[c] = 0; tot[c] = { dr: 0, cr: 0 }; });
  var openBase = 0, today = {}, todayK = Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyyMMdd');
  GL_CURS_.forEach(function (c) { today[c] = 0; });
  (ctx.byAcc[code] || []).forEach(function (r) {
    var l = _glLineObj_(r), k = _glDKey_(l.date);
    if (k <= todayK) today[l.currency] = _glR2_(today[l.currency] + l.debit - l.credit);   // (V4.226) الرصيد حتى اليوم (مستقل عن الفترة)
    if (toK && k > toK) return;
    all.push(l);
    if (fromK && k < fromK) { open[l.currency] = _glR2_(open[l.currency] + l.debit - l.credit); openBase = _glR2_(openBase + l.bDebit - l.bCredit); return; }
    var e = ctx.entries[l.entryId], eo = e ? _glEntryObj_(e) : {};
    var names = [];
    (ctx.byEntry[l.entryId] || []).forEach(function (o) {
      var c = _glStr_(o[4]); if (c === code) return;
      var a = accs.map[c]; if (a && a.kind === 'fx') return;
      var n = a ? (a.link || a.name) : c; if (names.indexOf(n) < 0) names.push(n);
    });
    var sk = eo.sourceKey || '', x = {
      entryId: l.entryId, lineNo: l.lineNo, date: l.date, _k: k, seq: e ? e[1] : 0, currency: l.currency,
      debit: l.debit, credit: l.credit, bDebit: l.bDebit, bCredit: l.bCredit, rate: l.rate,
      desc: _glCleanDesc_(l.desc || eo.desc || ''), entryDesc: _glCleanDesc_(eo.desc || ''), type: eo.type || '',
      voucherNo: eo.voucherNo || ((_glStr_(eo.ref).match(/^(REC|PAY)-\d+$/) || [])[0]) || '', ref: /^h:|^cs:/.test(eo.ref || '') ? '' : (eo.ref || ''),
      trip: l.trip || eo.trip || '', company: l.company || eo.company || '', counter: names.length > 3 ? 'متعدد (' + names.length + ')' : names.join(' + '),
      auto: /^AUTO:/.test(sk), src: (sk.match(/^AUTO:([A-Z]+)/) || [])[1] || '', att: (ctx.att[l.entryId] || []).length, pending: ctx.pend[l.entryId] || ''
    };
    if (/^AUTO:HB:/.test(sk)) { x.hbKey = sk.slice(8); hasHb = true; }
    rows.push(x);
  });
  var srt = function (a, b) { return a._k < b._k ? -1 : (a._k > b._k ? 1 : (a.seq - b.seq || a.lineNo - b.lineNo)); };
  rows.sort(srt); all.sort(function (a, b) { var ka = _glDKey_(a.date), kb = _glDKey_(b.date); return ka < kb ? -1 : ka > kb ? 1 : 0; });
  var run = {}; GL_CURS_.forEach(function (c) { run[c] = open[c]; }); var runB = openBase;
  rows.forEach(function (x) {
    run[x.currency] = _glR2_(run[x.currency] + x.debit - x.credit); runB = _glR2_(runB + x.bDebit - x.bCredit);
    tot[x.currency].dr = _glR2_(tot[x.currency].dr + x.debit); tot[x.currency].cr = _glR2_(tot[x.currency].cr + x.credit);
    x.bal = run[x.currency]; x.balBase = runB;
  });
  // بيانات الحجز + الحجوزات بلا سعر (لا تدخل الرصيد) — للحسابات المرتبطة ببرنامج الحجوزات
  var unpriced = [];
  if (hasHb || hbN.length) {
    var H = _glStmtHb_(ctx);
    if (H) {
      var bk = {}; H.bookings.forEach(function (b) { bk[b.key] = b; });
      rows.forEach(function (x) {
        var b = x.hbKey && bk[x.hbKey]; if (!b) return;
        x.hb = { ref: b.hotelRef || b.inner || '', inner: b.inner || '', hotel: b.hotel, city: b.city, ci: b.ci, co: b.co, nights: b.nights,
          rooms: (b.rooms || []).reduce(function (s, v) { return s + v; }, 0), client: b.client, supplier: b.supplier };
      });
      var keys = {}; hbN.forEach(function (x) { keys[_glHbKey_(x.name)] = /مورد|شارت/.test(x.type) ? 'supplier' : 'client'; });
      H.bookings.forEach(function (b) {
        if (b.status === 'لاغي') return;
        var ck = keys[_glHbKey_(b.client)] === 'client', sk2 = keys[_glHbKey_(b.supplier)] === 'supplier';
        var miss = (ck && !b.sale.hasPrice && b.sale.rooms) || (sk2 && !b.cost.hasPrice && b.cost.rooms);
        var bkK = _glDKey_(b.ci);
        if (!miss || (toK && bkK > toK) || (fromK && bkK < fromK)) return;
        unpriced.push({ ref: b.hotelRef || b.inner || '', hotel: b.hotel, city: b.city, ci: b.ci, co: b.co, nights: b.nights,
          rooms: (b.rooms || []).reduce(function (s, v) { return s + v; }, 0), client: b.client, supplier: b.supplier });
      });
    }
  }
  var tripInfo = {};
  rows.forEach(function (x) { if (x.trip && !tripInfo[x.trip]) tripInfo[x.trip] = ctx.trips[x.trip] || {}; });
  var sign = role === 'client' ? 1 : role === 'supplier' ? -1 : 0;
  var asOf = to ? _glDate_(to) : Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy');
  var closeBase = runB, pendN = rows.filter(function (x) { return x.pending; }).length;
  return { success: true, account: { code: acc.code, name: acc.name, kind: acc.kind, type: acc.type, link: acc.link, currency: acc.currency, parent: acc.parent, parentName: (accs.map[acc.parent] || {}).name || '' },
    role: role, hbRole: hbRole, from: _glDate_(from) || '', to: _glDate_(to) || '', asOf: asOf, opening: open, openingBase: openBase, closing: run, closingBase: closeBase, totals: tot, today: today,
    rows: rows, unpriced: unpriced, trips: tripInfo, pending: pendN, aging: sign ? _glAging_(all, sign, asOf) : {} };
}
function glStatement(authToken, code, from, to) {
  _glPerm_(authToken, 'view');
  return _glStmtCore_(_glStr_(code), from, to, _glStmtCtx_());
}
// كشوف جماعية: كل الحسابات المختارة (أو كل حسابات نوع له رصيد) بسياق قراءة واحد
function glStatements(authToken, codes, from, to, opts) {
  _glPerm_(authToken, 'view');
  opts = opts || {};
  var ctx = _glStmtCtx_(), out = [], list = (codes || []).map(_glStr_);
  if (!list.length && opts.kind) {
    ctx.accs.list.forEach(function (a) { if (!a.isGroup && _glStmtRole_(a) === opts.kind) list.push(a.code); });
  }
  list.forEach(function (c) {
    try {
      var st = _glStmtCore_(c, from, to, ctx);
      var has = GL_CURS_.some(function (k) { return Math.abs(st.closing[k]) >= 0.01; });
      if (opts.onlyBalance && !has) return;
      if (!opts.withRows) { st.rowsN = st.rows.length; }
      out.push(st);
    } catch (e) { out.push({ success: false, code: c, error: e.message }); }
  });
  return { success: true, list: out };
}
// تقرير أعمار الديون المجمّع لكل العملاء (أو الموردين/الوكلاء)
function glAgingReport(authToken, role, to) {
  _glPerm_(authToken, 'view');
  role = role === 'supplier' ? 'supplier' : 'client';
  var ctx = _glStmtCtx_(), asOf = to ? _glDate_(to) : Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy'), toK = to ? _glDKey_(asOf) : '', out = [];
  ctx.accs.list.forEach(function (a) {
    if (a.isGroup || _glStmtRole_(a) !== role) return;
    var ls = (ctx.byAcc[a.code] || []).map(_glLineObj_).filter(function (l) { return !toK || _glDKey_(l.date) <= toK; });
    if (!ls.length) return;
    ls.sort(function (x, y) { var kx = _glDKey_(x.date), ky = _glDKey_(y.date); return kx < ky ? -1 : kx > ky ? 1 : 0; });
    var ag = _glAging_(ls, role === 'client' ? 1 : -1, asOf);
    if (Object.keys(ag).length) out.push({ code: a.code, name: a.name, link: a.link, aging: ag });
  });
  return { success: true, role: role, asOf: asOf, rows: out };
}
// 🔢 رقم مسلسل لكل كشف يُصدَر (ST-yyyy-nnnn) + بصمة للتحقق (تُطبع برمز QR) + سجل التعديلات
function glStmtIssue(authToken, info) {
  var session = _glPerm_(authToken, 'view');
  info = info || {};
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _glSheet_('stmts'), rows = _glRows_('stmts'), yr = Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyy'), last = 0;
    rows.forEach(function (r) { var m = _glStr_(r[0]).match(/^ST-(\d{4})-(\d+)$/); if (m && m[1] === yr && +m[2] > last) last = +m[2]; });
    var serial = 'ST-' + yr + '-' + ('000' + (last + 1)).slice(-4), at = _glNow_();
    var bal = _glStr_(info.balances), hash = _glHash_([serial, info.code, info.to, bal, at].join('|')).slice(0, 10).toUpperCase();
    sh.appendRow([serial, at, session.username, _glStr_(info.code), _glStr_(info.name), _glStr_(info.from), _glStr_(info.to), bal, _glStr_(info.output), hash, _glStr_(info.note)]);
    logChange_(session.username, 'إصدار كشف حساب', 'GL:' + _glStr_(info.code), _glStr_(info.output), '', serial + ' — ' + _glStr_(info.name) + ' — ' + bal);
    return { success: true, serial: serial, hash: hash, at: at, by: session.username };
  } finally { lock.releaseLock(); }
}
function glStmtVerify(authToken, serial) {
  _glPerm_(authToken, 'view');
  serial = _glStr_(serial).toUpperCase().replace(/^.*?(ST-\d{4}-\d+).*$/, '$1');
  var hit = null;
  _glRows_('stmts').forEach(function (r) { if (_glStr_(r[0]) === serial) hit = { serial: serial, at: _glStr_(r[1]), by: _glStr_(r[2]), code: _glStr_(r[3]), name: _glStr_(r[4]), from: _glStr_(r[5]), to: _glStr_(r[6]), balances: _glStr_(r[7]), output: _glStr_(r[8]), hash: _glStr_(r[9]) }; });
  return { success: true, found: !!hit, rec: hit };
}
function glStmtLog(authToken, code) {
  _glPerm_(authToken, 'view');
  code = _glStr_(code);
  var out = [];
  _glRows_('stmts').forEach(function (r) { if (!code || _glStr_(r[3]) === code) out.push({ serial: _glStr_(r[0]), at: _glStr_(r[1]), by: _glStr_(r[2]), code: _glStr_(r[3]), name: _glStr_(r[4]), from: _glStr_(r[5]), to: _glStr_(r[6]), balances: _glStr_(r[7]), output: _glStr_(r[8]), hash: _glStr_(r[9]) }); });
  return { success: true, rows: out.reverse().slice(0, 300) };
}
// 📄 PDF نصي من مستند الكشف المطبوع نفسه (مجلد مؤقت، مشاركة برابط) — للمشاركة/التنزيل من الواجهة
function glStmtPdf(authToken, htmlDoc, fileName) {
  _glPerm_(authToken, 'view');
  var folder = getDriveFolder_('TEMP');
  fileName = String(fileName || 'كشف حساب').replace(/[\\/:*?"<>|]/g, '-').trim();
  var pdfBlob = Utilities.newBlob(htmlDoc, 'text/html', fileName + '.html').getAs('application/pdf');
  pdfBlob.setName(fileName + '.pdf');
  var file = folder.createFile(pdfBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, fileId: file.getId(), downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(), pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()), fileName: fileName };
}
/* 🏦 (V4.216) متابعة الخزينة (مثل شاشة الخزينة بالـ ERP): حساب نقدي واحد (خزينة/بنك/عهدة) — رصيد أول المدة والرصيد
   الحالي لكل عملة، وكل حركة: رقم السند/القيد، التاريخ، الحساب المقابل، البيان، وارد/صادر ورصيد تراكمي لكل عملة
   على حدة (بلا تحويل بين العملات)، مع لقطة أرصدة العملات الثلاث عند كل حركة وإجماليات الفترة. */
function glTreasury(authToken, code, from, to) {
  _glPerm_(authToken, 'view');
  code = _glStr_(code);
  var accs = _glAccounts_(), acc = accs.map[code];
  if (!acc || acc.isGroup) throw new Error('اختر خزينة أو بنكاً أو عهدة');
  var fromK = _glDKey_(_glDate_(from)), toK = _glDKey_(_glDate_(to));
  var open = { EGP: 0, SAR: 0, USD: 0 }, tot = { EGP: { in: 0, out: 0 }, SAR: { in: 0, out: 0 }, USD: { in: 0, out: 0 } };
  var entries = {}; _glRows_('entries').forEach(function (r) { entries[_glStr_(r[0])] = r; });
  var byEntry = {}, mine = [], lastK = '';
  _glRows_('lines').forEach(function (r) {
    if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
    var id = _glStr_(r[0]);
    (byEntry[id] = byEntry[id] || []).push(r);
    if (_glStr_(r[4]) === code) mine.push(r);
  });
  var rows = [], attMap = _glAttachMap_();
  mine.forEach(function (r) {
    var l = _glLineObj_(r), k = _glDKey_(l.date);
    if (k > lastK) lastK = k;
    if (toK && k > toK) return;
    if (fromK && k < fromK) { open[l.currency] = _glR2_(open[l.currency] + l.debit - l.credit); return; }
    var e = entries[l.entryId], eo = e ? _glEntryObj_(e) : {};
    var names = [];
    (byEntry[l.entryId] || []).forEach(function (o) {
      var c = _glStr_(o[4]); if (c === code) return;
      var a = accs.map[c], n = a ? (a.link || a.name) : c;
      if (names.indexOf(n) < 0) names.push(n);
    });
    rows.push({ entryId: l.entryId, voucherNo: eo.voucherNo || ((_glStr_(eo.ref).match(/^(REC|PAY)-\d+$/) || [])[0]) || '', type: eo.type || '', date: l.date, _k: k,
      seq: e ? e[1] : 0, lineNo: l.lineNo, currency: l.currency, inAmt: l.debit, outAmt: l.credit,
      counter: names.length > 3 ? 'قيد متعدد الأطراف (' + names.length + ' حسابات)' : names.join(' + '),
      desc: l.desc || eo.desc || '', entryDesc: eo.desc || '', createdBy: eo.createdBy || '', auto: /^AUTO:/.test(eo.sourceKey || ''), att: (attMap[l.entryId] || []).length });
  });
  rows.sort(function (a, b) { return a._k < b._k ? -1 : (a._k > b._k ? 1 : (a.seq - b.seq || a.lineNo - b.lineNo)); });
  var run = { EGP: open.EGP, SAR: open.SAR, USD: open.USD };
  rows.forEach(function (x) {
    run[x.currency] = _glR2_(run[x.currency] + x.inAmt - x.outAmt);
    tot[x.currency].in = _glR2_(tot[x.currency].in + x.inAmt); tot[x.currency].out = _glR2_(tot[x.currency].out + x.outAmt);
    x.snap = { EGP: run.EGP, SAR: run.SAR, USD: run.USD };
  });
  return { success: true, account: acc, opening: open, current: run, totals: tot, rows: rows,
    lastActivity: lastK ? lastK.slice(6, 8) + '/' + lastK.slice(4, 6) + '/' + lastK.slice(0, 4) : '' };
}
// ميزان المراجعة: لكل حساب ورقي عليه حركة — افتتاحي (قبل from) + حركة الفترة + ختامي، بالمعادل وبكل عملة
function glTrialBalance(authToken, from, to) {
  _glPerm_(authToken, 'view');
  var fromK = _glDKey_(_glDate_(from)), toK = _glDKey_(_glDate_(to));
  var t = {};
  _glRows_('lines').forEach(function (r) {
    if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
    var l = _glLineObj_(r), k = _glDKey_(l.date);
    if (toK && k > toK) return;
    var o = (t[l.account] = t[l.account] || { openD: 0, openC: 0, perD: 0, perC: 0, cur: { EGP: 0, SAR: 0, USD: 0 } });
    if (fromK && k < fromK) { o.openD += l.bDebit; o.openC += l.bCredit; } else { o.perD += l.bDebit; o.perC += l.bCredit; }
    o.cur[l.currency] = _glR2_(o.cur[l.currency] + l.debit - l.credit);
  });
  Object.keys(t).forEach(function (k) { var o = t[k]; ['openD', 'openC', 'perD', 'perC'].forEach(function (x) { o[x] = _glR2_(o[x]); }); });
  return { success: true, rows: t };
}

/* ---------------------------- الاستيراد المجمّع ---------------------------- */
// مطابقة نص حساب (كود أو اسم) مع الدليل: exact (كود/اسم بعد التطبيع) ثم تقريبي (فرق حرفين أو احتواء)
function _glMatchAccount_(txt) {
  var accs = _glAccounts_(), s = _glStr_(txt);
  if (!s) return { type: 'none', suggestions: [] };
  if (accs.map[s] && !accs.map[s].isGroup) return { type: 'code', code: s };
  var n = _glNorm_(s);
  var leaves = accs.list.filter(function (a) { return !a.isGroup && a.active; });
  var ex = leaves.filter(function (a) { return _glNorm_(a.name) === n || (a.link && _glNorm_(a.link) === n); });
  if (ex.length === 1) return { type: 'exact', code: ex[0].code };
  var ns = n.replace(/ /g, '');
  var scored = leaves.map(function (a) {
    var an = _glNorm_(a.name), as = an.replace(/ /g, '');
    var d = _glLev_(as, ns), L = Math.max(as.length, ns.length) || 1, sc = 1 - d / L;
    if (as === ns) sc = 0.99;
    else if (ns.length >= 4 && (as.indexOf(ns) >= 0 || ns.indexOf(as) >= 0)) sc = Math.max(sc, 0.8);
    return { code: a.code, name: a.name, score: sc };
  }).filter(function (x) { return x.score >= 0.72; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 4);
  if (ex.length > 1) return { type: 'ambiguous', suggestions: ex.map(function (a) { return { code: a.code, name: a.name, score: 1 }; }) };
  if (scored.length && scored[0].score >= 0.9) return { type: 'approx', code: scored[0].code, suggestions: scored };
  return { type: scored.length ? 'approx-weak' : 'none', suggestions: scored };
}
// معاينة: kind = 'opening' (صفوف: الحساب، مدين، دائن، العملة، سعر الصرف) أو 'entries' (رقم القيد، التاريخ، الحساب، مدين، دائن، العملة، سعر الصرف، البيان، الرحلة، العميل)
function glImportPreview(authToken, kind, rows) {
  _glAdminPerm_(authToken);
  if (!Array.isArray(rows) || !rows.length) throw new Error('لا توجد صفوف');
  if (rows.length > 5000) throw new Error('الحد الأقصى 5000 سطر في الدفعة الواحدة');
  var rates = _glRates_(), memo = {};
  var out = rows.map(function (r, i) {
    var o = { i: i, errors: [] };
    if (kind === 'entries') {
      o.group = _glStr_(r.group); o.date = _glDate_(r.date);
      if (!o.group) o.errors.push('رقم القيد مطلوب');
      if (!o.date) o.errors.push('التاريخ غير صالح');
      o.desc = _glStr_(r.desc); o.trip = _glStr_(r.trip); o.client = _glStr_(r.client);
    }
    o.accountText = _glStr_(r.account);
    o.debit = _glR2_(_glNum_(r.debit)); o.credit = _glR2_(_glNum_(r.credit));
    o.currency = _glCur_(r.currency || 'EGP'); o.rate = o.currency === 'EGP' ? 1 : (_glNum_(r.rate) || rates[o.currency]);
    if (!o.accountText) o.errors.push('الحساب مطلوب');
    if (o.debit && o.credit) o.errors.push('مدين ودائن معاً بنفس السطر');
    if (!o.debit && !o.credit) o.errors.push('لا يوجد مبلغ');
    var key = _glNorm_(o.accountText);
    o.match = memo[key] || (memo[key] = _glMatchAccount_(o.accountText));
    if (o.match.code) {
      var a = _glAccounts_().map[o.match.code];
      o.accountName = a.name;
      if (a.currency && a.currency !== o.currency) o.errors.push('عملة الحساب ' + a.currency);
    }
    o.bDebit = _glR2_(o.debit * o.rate); o.bCredit = _glR2_(o.credit * o.rate);
    return o;
  });
  var groups = {};
  if (kind === 'entries') {
    out.forEach(function (o) {
      var g = (groups[o.group] = groups[o.group] || { d: 0, c: 0, n: 0, dates: {} });
      g.d += o.bDebit; g.c += o.bCredit; g.n++; if (o.date) g.dates[o.date] = 1;
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k]; g.d = _glR2_(g.d); g.c = _glR2_(g.c);
      g.balanced = Math.abs(g.d - g.c) <= 0.05; g.oneDate = Object.keys(g.dates).length <= 1;
    });
  }
  var tot = { d: 0, c: 0 };
  out.forEach(function (o) { tot.d += o.bDebit; tot.c += o.bCredit; });
  return { success: true, rows: out, groups: groups, totals: { d: _glR2_(tot.d), c: _glR2_(tot.c) }, settings: _glSettings_(), rates: rates };
}
// الترحيل: payload = {kind, rows:[{group?, date?, accountCode | newKey, debit, credit, currency, rate, desc, trip, client}],
//   newAccounts:[{key, name, parent, kind, currency}], date (للافتتاحي), note}
function glImportCommit(authToken, payload) {
  var session = _glAdminPerm_(authToken);
  payload = payload || {};
  var kind = payload.kind === 'entries' ? 'entries' : 'opening';
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var set = _glSettings_();
    // 1) إنشاء الحسابات الجديدة المطلوبة
    var keyToCode = {};
    (payload.newAccounts || []).forEach(function (na) {
      var a = _glCreateAccount_({ parent: _glStr_(na.parent), name: na.name, kind: na.kind, currency: na.currency, link: na.link }, session.username);
      keyToCode[na.key] = a.code;
    });
    _GL_ACC_MEMO_ = null;
    var rows = (payload.rows || []).map(function (r) {
      var c = { account: _glStr_(r.accountCode) || keyToCode[r.newKey] || '', debit: r.debit, credit: r.credit, currency: r.currency, rate: r.rate,
        desc: r.desc, trip: r.trip, client: r.client, group: _glStr_(r.group), date: r.date };
      if (!c.account) throw new Error('يوجد سطر بلا حساب محدد (' + (r.accountText || '') + ')');
      return c;
    });
    if (!rows.length) throw new Error('لا توجد صفوف للترحيل');
    // 2) تكوين القيود
    var entries = [];
    if (kind === 'opening') {
      var date = _glDate_(payload.date) || set.startDate;
      var d = 0, c = 0;
      rows.forEach(function (r) { d += _glNum_(r.debit) * (_glCur_(r.currency) === 'EGP' ? 1 : _glNum_(r.rate)); c += _glNum_(r.credit) * (_glCur_(r.currency) === 'EGP' ? 1 : _glNum_(r.rate)); });
      var diff = _glR2_(d - c);
      if (Math.abs(diff) > 0.05) rows.push({ account: GL_ACC_OPEN_DIFF_, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, currency: 'EGP', rate: 1, desc: 'فروق أرصدة افتتاحية' });
      entries.push({ date: date, type: 'قيد افتتاحي', desc: _glStr_(payload.note) || ('أرصدة افتتاحية في ' + date), lines: rows });
    } else {
      var byG = {}, order = [];
      rows.forEach(function (r) { if (!byG[r.group]) { byG[r.group] = []; order.push(r.group); } byG[r.group].push(r); });
      order.forEach(function (g) {
        var ls = byG[g];
        entries.push({ date: ls[0].date, type: 'قيد مستورد', desc: _glStr_(ls[0].desc) || ('قيد مستورد ' + g), ref: g, lines: ls });
      });
    }
    // 3) الفحص الكامل قبل أي كتابة (كل القيود أو لا شيء)
    var validated = entries.map(function (e, i) {
      try { return _glValidate_(e, { allowBeforeStart: true }); }
      catch (err) { throw new Error('القيد ' + (e.ref || (i + 1)) + ': ' + err.message); }
    });
    // 4) الكتابة دفعة واحدة
    var batchId = 'B-' + Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyyMMdd-HHmmss');
    var firstSeq = _glNextEntrySeq_(validated.length);
    var eRows = [], lRows = [];
    validated.forEach(function (v, i) {
      var id = _glEntryId_(firstSeq + i);
      var w = _glWriteEntry_(v, { id: id, seq: firstSeq + i, status: GL_ST_POSTED_, sourceKey: 'IMP:' + batchId, batchId: batchId,
        desc: entries[i].desc, ref: entries[i].ref }, session.username);
      eRows.push(w.eRow); lRows = lRows.concat(w.lRows);
    });
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    eSh.getRange(eSh.getLastRow() + 1, 1, eRows.length, eRows[0].length).setValues(eRows);
    lSh.getRange(lSh.getLastRow() + 1, 1, lRows.length, lRows[0].length).setValues(lRows);
    _glSheet_('batches').appendRow([batchId, kind === 'opening' ? 'أرصدة افتتاحية' : 'قيود مستوردة', _glStr_(payload.note), validated.length, 'فعّالة', session.username, _glNow_()]);
    logChange_(session.username, 'استيراد مجمّع للحسابات العامة', 'GL:' + batchId, kind === 'opening' ? 'أرصدة افتتاحية' : 'قيود', '-', validated.length + ' قيد، ' + lRows.length + ' سطر');
    return { success: true, batchId: batchId, entries: validated.length, lines: lRows.length, created: Object.keys(keyToCode).length };
  } finally { lock.releaseLock(); }
}
function glListBatches(authToken) {
  _glPerm_(authToken, 'view');
  return { success: true, batches: _glRows_('batches').map(function (r) {
    return { id: _glStr_(r[0]), type: _glStr_(r[1]), note: _glStr_(r[2]), count: r[3], status: _glStr_(r[4]), by: _glStr_(r[5]), at: _glStr_(r[6]) };
  }).reverse() };
}
// إلغاء دفعة استيراد كاملة: كل قيودها تصبح «ملغى» (يبقى أثرها للمراجعة)
function glUndoBatch(authToken, batchId) {
  var session = _glAdminPerm_(authToken);
  batchId = _glStr_(batchId);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var eSh = _glSheet_('entries'), rows = _glRows_('entries'), ids = [], now = _glNow_();
    rows.forEach(function (r, i) {
      if (_glStr_(r[7]) !== batchId || _glStr_(r[5]) === GL_ST_VOID_) return;
      if (_glLocked_(r[2])) throw new Error('الدفعة بها قيد في فترة مقفلة (' + _glDate_(r[2]) + ') — افتح الفترة أولاً');
      ids.push(_glStr_(r[0]));
      r[5] = GL_ST_VOID_; r[16] = session.username; r[17] = now; r[18] = 'إلغاء دفعة الاستيراد ' + batchId;
    });
    if (!ids.length) throw new Error('لا توجد قيود فعّالة بهذه الدفعة');
    eSh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    _glSetLinesStatus_(ids, GL_ST_VOID_);
    var bRows = _glRows_('batches');
    for (var i = 0; i < bRows.length; i++) if (_glStr_(bRows[i][0]) === batchId) _glSheet_('batches').getRange(i + 2, 5).setValue('ملغاة');
    logChange_(session.username, 'إلغاء دفعة استيراد', 'GL:' + batchId, 'الحالة', 'فعّالة', 'ملغاة — ' + ids.length + ' قيد');
    return { success: true, count: ids.length };
  } finally { lock.releaseLock(); }
}

/* ============================================================================
   📦 (V4.206) نقل بيانات برنامج الـ ERP القديم إلى الحسابات العامة
   ----------------------------------------------------------------------------
   يقرأ شيت الـ ERP مباشرة برابطه (بصلاحية حساب جوجل الحالي) — أعمدته تُقرأ بأسماء العناوين:
     Chart_Of_Accounts: Account_ID, Account_Name, Account_Type, Category_ID, Sub_Type, Currency, Is_Active
     Account_Categories: Category_ID, Category_Name, Account_Type
     Journal_Entries:   Entry_ID, Voucher_ID, Date, Account_Type, Account_ID, Debit, Credit, Currency, Statement
     Journal_Vouchers / Vouchers / Bank_Transactions: لبيان كل مستند
   • الحسابات: كل حساب يُربط بمكانه بالدليل الجديد حسب تصنيفه/نوعه الفرعي؛ لو يوجد حساب بنفس الاسم تحت
     نفس المجموعة (مثل العملاء والوكلاء المربوطين من البرنامج) يُعاد استخدامه بدل إنشاء تكرار. يُحفظ
     معرّف الـ ERP في عمود «المعرف القديم».
   • الأرصدة حتى تاريخ القطع (30/06/2026): آخر سنة أرصدة افتتاحية بالـ ERP (JV-OPENING-سنة) ≤ سنة القطع
     + كل القيود من أول تلك السنة حتى تاريخ القطع (القيود الأقدم تلخّصها تلك الأرصدة — تفادياً لتكرار
     الحساب الموجود بميزان الـ ERP نفسه). تُرحَّل كقيد افتتاحي بتاريخ اليوم التالي، بأسعار صرف يحددها
     المستخدم ليوم القطع، والفرق (إن وُجد) لحساب «فروق أرصدة افتتاحية».
   • القيود بعد تاريخ القطع تُنقل كقيود مستوردة بتاريخها (اختياري).
   • كل ذلك دفعة واحدة قابلة للإلغاء، ولا تُنفَّذ إلا بعد معاينة كاملة.
   ============================================================================ */
var GL_ERP_CAT_MAP_ = {
  'CAT-AR-UMR': '1201', 'CAT-AR-HAJ': '1202', 'CAT-AR-SKN': '1203', 'CAT-AR-TRS': '1204', 'CAT-AR-TKT': '1205',
  'CAT-CASH': '1101', 'CAT-CUSTODY': '13', 'CAT-ADVANCE': '14', 'CAT-ASSET-O': '15',
  'CAT-AP-UMR': '2101', 'CAT-AP-HAJ': '2105', 'CAT-AP-SKN': '2103', 'CAT-AP-TRS': '2102', 'CAT-AP-TKT': '2104', 'CAT-LIAB-O': '24',
  'CAT-CAPITAL': '31', 'CAT-RETAIN': '33', 'CAT-EQUITY-O': '32',
  'CAT-REV-UMR': '41', 'CAT-REV-HAJ': '42', 'CAT-REV-SKN': '43', 'CAT-REV-TRS': '44', 'CAT-REV-TKT': '45', 'CAT-REV-O': '49',
  'CAT-EXP-DIR': '51', 'CAT-EXP-GEN': '52', 'CAT-EXP-O': '52'
};
var GL_ERP_TYPE_DEF_ = { ASSET: '15', LIABILITY: '24', LIAB: '24', EQUITY: '32', REVENUE: '49', REV: '49', EXPENSE: '52', EXP: '52' };
function _glErpSheetObjs_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = vals[0].map(function (h) { return _glStr_(h); });
  return vals.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { if (h) o[h] = r[i]; }); return o; });
}
function _glErpOpen_(url) {
  var id = _glStr_(url).replace(/^.*\/d\/([^\/?#]+).*$/, '$1');
  if (!id) throw new Error('أدخل رابط شيت الـ ERP');
  try { return SpreadsheetApp.openById(id); }
  catch (e) { throw new Error('تعذّر فتح شيت الـ ERP — تأكد أن حسابك يملك صلاحية الوصول إليه (' + e.message + ')'); }
}
// الخطة الكاملة (بلا أي كتابة): الحسابات وربطها + الأرصدة حتى القطع + قيود ما بعد القطع
function _glErpPlan_(url, opts) {
  opts = opts || {};
  var ss = _glErpOpen_(url);
  var cutoff = _glDate_(opts.cutoff) || '30/06/2026', cutK = _glDKey_(cutoff);
  var rates = { EGP: 1, SAR: _glNum_(opts.rates && opts.rates.SAR), USD: _glNum_(opts.rates && opts.rates.USD) };
  var coa = _glErpSheetObjs_(ss, 'Chart_Of_Accounts');
  var cats = {}; _glErpSheetObjs_(ss, 'Account_Categories').forEach(function (c) { cats[_glStr_(c.Category_ID)] = _glStr_(c.Category_Name); });
  var je = _glErpSheetObjs_(ss, 'Journal_Entries');
  if (!je.length && !coa.length) throw new Error('لم يُعثر على شيتات Chart_Of_Accounts / Journal_Entries في هذا الملف — تأكد أنه شيت برنامج الـ ERP');
  // بيان كل مستند
  var docDesc = {};
  [['Journal_Vouchers', 'JV_ID'], ['Vouchers', 'Voucher_ID'], ['Bank_Transactions', 'Transaction_ID']].forEach(function (p) {
    _glErpSheetObjs_(ss, p[0]).forEach(function (r) { var k = _glStr_(r[p[1]]); if (k) docDesc[k] = _glStr_(r.Statement); });
  });
  // 1) الحسابات
  var erpAcc = {};
  coa.forEach(function (a) {
    var id = _glStr_(a.Account_ID); if (!id) return;
    erpAcc[id] = { id: id, name: _glStr_(a.Account_Name) || id, type: _glStr_(a.Account_Type).toUpperCase(), cat: _glStr_(a.Category_ID),
      sub: _glStr_(a.Sub_Type), currency: _glStr_(a.Currency).toUpperCase(), active: _glStr_(a.Is_Active) !== 'FALSE' && _glStr_(a.Is_Active) !== 'لا' };
  });
  // حسابات مستخدمة بالقيود وغير موجودة بالدليل (دليل قديم) — تُستنتج من بادئة المعرّف
  je.forEach(function (l) {
    var id = _glStr_(l.Account_ID); if (!id || erpAcc[id]) return;
    erpAcc[id] = { id: id, name: 'حساب قديم ' + id, type: '', cat: '', sub: _glStr_(l.Account_Type), currency: '', active: true, orphan: true };
  });
  var target = function (a) {
    var id = a.id, sub = (a.sub || '').toLowerCase();
    if (/^(FX)?BRIDGE/i.test(id)) return { code: '1501', direct: true };
    if (sub === 'safe' || /^SAFE-/i.test(id)) return { code: '1101' };
    if (sub === 'bank' || /^BANK-/i.test(id)) return { code: '1102' };
    if (sub === 'custody' || /^CST-/i.test(id)) return { code: '13' };
    if (GL_ERP_CAT_MAP_[a.cat]) return { code: GL_ERP_CAT_MAP_[a.cat] };
    if (/^CAT-AR/.test(a.cat) || /^CUST-/i.test(id)) return { code: '1201' };
    if (/^CAT-AP/.test(a.cat) || /^SUP-/i.test(id)) return { code: '2105' };
    return { code: GL_ERP_TYPE_DEF_[a.type] || '15' };
  };
  var accs = _glAccounts_();
  var usedName = {};
  var plan = {};
  Object.keys(erpAcc).forEach(function (id) {
    var a = erpAcc[id], t = target(a), p = { erpId: id, name: a.name, cat: a.cat, catName: cats[a.cat] || '', sub: a.sub, orphan: !!a.orphan,
      parent: t.code, currency: (a.sub.toLowerCase() === 'bank' && GL_CURRENCIES_.indexOf(a.currency) >= 0) ? a.currency : '' };
    if (t.direct) { p.action = 'map'; p.code = t.code; plan[id] = p; return; }
    // إعادة استخدام: حساب مرتبط بنفس المعرف القديم، أو بنفس الاسم تحت نفس المجموعة (أو عميل/وكيل بنفس الاسم)
    var n = _glNorm_(a.name);
    var ex = accs.list.filter(function (x) { return x.legacyId === id; })[0] ||
      accs.list.filter(function (x) { return !x.isGroup && x.code.indexOf(t.code) === 0 && _glNorm_(x.name) === n; })[0] ||
      ((/^12/.test(t.code) || /^21/.test(t.code)) ? accs.list.filter(function (x) { return !x.isGroup && (x.kind === 'client' || x.kind === 'agent') && x.code.indexOf(t.code.slice(0, 2)) === 0 && (_glNorm_(x.name) === n || _glNorm_(x.link) === n); })[0] : null);
    if (ex) { p.action = 'reuse'; p.code = ex.code; p.codeName = ex.name; }
    else {
      p.action = 'new';
      var key = t.code + '|' + n;
      if (usedName[key]) p.name = a.name + ' (' + id + ')';   // اسمان متطابقان بالـ ERP تحت نفس المجموعة
      usedName[key] = 1;
    }
    plan[id] = p;
  });
  // 2) الأرصدة حتى القطع
  var openYears = {};
  je.forEach(function (l) { var m = _glStr_(l.Voucher_ID).match(/^JV-OPENING-(\d{4})/); if (m) openYears[m[1]] = (openYears[m[1]] || 0) + 1; });
  var cutY = parseInt(cutoff.slice(6), 10);
  var yrs = Object.keys(openYears).map(Number).filter(function (y) { return y <= cutY; }).sort();
  // 'all' = مثل ميزان مراجعة الـ ERP نفسه (كل قيود الافتتاح بكل السنوات + كل الحركات حتى القطع)
  var allMode = opts.openingYear === 'all';
  var openYear = allMode ? 0 : (opts.openingYear && opts.openingYear !== 'auto' ? parseInt(opts.openingYear, 10) : (yrs.length ? yrs[yrs.length - 1] : 0));
  var fromK = openYear ? (openYear + '0101') : '';
  var bal = {}, stats = { linesUsed: 0, linesExcludedOld: 0, linesOtherOpening: 0, linesAfter: 0, linesBadDate: 0 };
  var after = {};
  je.forEach(function (l) {
    var vid = _glStr_(l.Voucher_ID), id = _glStr_(l.Account_ID);
    var d = _glNum_(l.Debit), c = _glNum_(l.Credit); if (!id || (!d && !c)) return;
    var cur = _glCur_(l.Currency), op = vid.match(/^JV-OPENING-(\d{4})/);
    if (op) {
      if (!allMode && parseInt(op[1], 10) !== openYear) { stats.linesOtherOpening++; return; }
    } else {
      var date = _glDate_(l.Date), k = _glDKey_(date);
      if (!k) { stats.linesBadDate++; return; }
      if (k > cutK) { stats.linesAfter++; (after[vid] = after[vid] || { vid: vid, date: date, lines: [] }).lines.push({ id: id, d: d, c: c, cur: cur, desc: _glStr_(l.Statement) }); return; }
      if (fromK && k < fromK) { stats.linesExcludedOld++; return; }
    }
    stats.linesUsed++;
    var b = (bal[id] = bal[id] || { EGP: 0, SAR: 0, USD: 0 });
    b[cur] = _glR2_(b[cur] + d - c);
  });
  var accountsOut = Object.keys(plan).map(function (id) {
    var p = plan[id], b = bal[id] || { EGP: 0, SAR: 0, USD: 0 };
    p.bal = b; p.base = _glR2_(b.EGP + b.SAR * rates.SAR + b.USD * rates.USD);
    return p;
  }).sort(function (a, b) { return a.parent < b.parent ? -1 : (a.parent > b.parent ? 1 : a.name.localeCompare(b.name, 'ar')); });
  var tot = { EGP: 0, SAR: 0, USD: 0, base: 0 };
  accountsOut.forEach(function (p) { ['EGP', 'SAR', 'USD'].forEach(function (c) { tot[c] = _glR2_(tot[c] + p.bal[c]); }); tot.base = _glR2_(tot.base + p.base); });
  var afterList = Object.keys(after).map(function (k) {
    var v = after[k], byC = {};
    v.lines.forEach(function (l) { var o = (byC[l.cur] = byC[l.cur] || { d: 0, c: 0 }); o.d += l.d; o.c += l.c; });
    v.balanced = Object.keys(byC).every(function (c) { return Math.abs(byC[c].d - byC[c].c) < 0.01; });
    v.amt = Object.keys(byC).map(function (c) { return _glR2_(byC[c].d) + ' ' + c; }).join(' + ');
    v.desc = docDesc[k] || (v.lines[0] && v.lines[0].desc) || '';
    return v;
  }).sort(function (a, b) { return _glDKey_(a.date) < _glDKey_(b.date) ? -1 : 1; });
  return { ss: ss, cutoff: cutoff, rates: rates, openYear: allMode ? 'all' : openYear, openYears: openYears, stats: stats, accounts: accountsOut, totals: tot,
    after: afterList, catsCount: Object.keys(cats).length, erpName: ss.getName() };
}
function glErpPreview(authToken, url, opts) {
  _glAdminPerm_(authToken);
  var p = _glErpPlan_(url, opts);
  var byParent = {};
  p.accounts.forEach(function (a) { var k = a.parent; var o = (byParent[k] = byParent[k] || { parent: k, name: (_glAccounts_().map[k] || {}).name || k, n: 0, newN: 0, reuse: 0 }); o.n++; if (a.action === 'new') o.newN++; if (a.action === 'reuse') o.reuse++; });
  var done = _glRows_('batches').filter(function (r) { return _glStr_(r[1]) === 'نقل بيانات الـ ERP' && _glStr_(r[4]) === 'فعّالة'; }).map(function (r) { return _glStr_(r[0]); });
  return { success: true, erpName: p.erpName, cutoff: p.cutoff, rates: p.rates, openYear: p.openYear, openYears: p.openYears, stats: p.stats,
    accounts: p.accounts, totals: p.totals, groups: Object.keys(byParent).map(function (k) { return byParent[k]; }),
    after: p.after.map(function (v) { return { vid: v.vid, date: v.date, desc: v.desc, n: v.lines.length, balanced: v.balanced, amt: v.amt }; }),
    alreadyMigrated: done,
    // (V4.207) أرصدة افتتاحية مولّدة من شاشات البرنامج للعملاء والوكلاء — أرصدة الـ ERP لنفس الأطراف ستُضاف فوقها
    appOpening: _glRows_('entries').some(function (r) { return _glStr_(r[6]) === 'AUTO:OPEN' && _glStr_(r[5]) === GL_ST_POSTED_; }) };
}
// التحقق من أن مجموعة الوجهة تجميعية — حساب ورقي أساسي بلا قيود يتحوّل لمجموعة (مثل 42 إيرادات الحج)
function _glEnsureGroup_(code) {
  var a = _glAccounts_().map[code];
  if (!a) throw new Error('المجموعة غير موجودة: ' + code);
  if (a.isGroup) return code;
  var used = _glRows_('lines').some(function (r) { return _glStr_(r[4]) === code; });
  if (used) return a.parent || code.slice(0, 1);
  _glSheet_('accounts').getRange(a._row, 5).setValue('نعم');
  _GL_ACC_MEMO_ = null;
  return code;
}
function glErpCommit(authToken, url, opts) {
  var session = _glPerm_(authToken, 'add');
  if (!_glIsAdmin_(session)) throw new Error('تنفيذ نقل بيانات الـ ERP متاح للمدير فقط (المعاينة متاحة)');
  opts = opts || {};
  if (!(_glNum_(opts.rates && opts.rates.SAR) > 0) || !(_glNum_(opts.rates && opts.rates.USD) > 0)) throw new Error('أدخل سعري الريال والدولار ليوم القطع');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var active = _glRows_('batches').filter(function (r) { return _glStr_(r[1]) === 'نقل بيانات الـ ERP' && _glStr_(r[4]) === 'فعّالة'; });
    if (active.length && !opts.force) throw new Error('يوجد نقل سابق فعّال (' + _glStr_(active[0][0]) + ') — ألغِ دفعته أولاً من «دفعات الاستيراد» قبل إعادة النقل');
    var p = _glErpPlan_(url, opts);
    var rates = p.rates;
    // 1) الحسابات الجديدة (مجمّعة لكل مجموعة، بأكواد متتالية) + تحديث المعرف القديم للمعاد استخدامها
    var codeOf = {}, accSh = _glSheet_('accounts'), newRows = [];
    var nextOf = {};
    var nextCode = function (parent) {
      if (nextOf[parent] === undefined) {
        var width = parent.length === 1 ? 1 : (parent.length === 2 ? 2 : 3), max = 0;
        _glAccounts_().list.forEach(function (a) { if (a.parent === parent && a.code.length === parent.length + width) { var n = parseInt(a.code.slice(parent.length), 10); if (n > max) max = n; } });
        nextOf[parent] = { max: max, width: width };
      }
      var o = nextOf[parent]; o.max++;
      var s = String(o.max); if (s.length > o.width) throw new Error('امتلأت أكواد الحسابات تحت ' + parent + ' — راجع الدليل');
      while (s.length < o.width) s = '0' + s;
      return parent + s;
    };
    var groupOf = {};
    p.accounts.forEach(function (a) {
      if (a.action === 'map' || a.action === 'reuse') { codeOf[a.erpId] = a.code; return; }
      var parent = groupOf[a.parent] || (groupOf[a.parent] = _glEnsureGroup_(a.parent));
      var par = _glAccounts_().map[parent];
      var code = nextCode(parent);
      var kind = par.kind || ({ '1101': 'safe', '1102': 'bank', '13': 'custody' }[parent] || '');
      if (/^12/.test(parent)) kind = 'client';
      if (parent === '2101') kind = 'agent';
      newRows.push(_glAccRow_({ code: code, name: a.name, type: par.type, parent: parent, kind: kind, currency: a.currency,
        link: (kind === 'client' || kind === 'agent') ? a.name : '', notes: 'منقول من الـ ERP' + (a.catName ? ' — ' + a.catName : ''), legacyId: a.erpId }, session.username));
      codeOf[a.erpId] = code;
    });
    if (newRows.length) accSh.getRange(accSh.getLastRow() + 1, 1, newRows.length, GL_SHEETS_.accounts.headers.length).setValues(newRows);
    _GL_ACC_MEMO_ = null;
    var accMap = _glAccounts_().map;
    p.accounts.forEach(function (a) {   // المعرف القديم على الحسابات المعاد استخدامها
      if (a.action !== 'reuse') return;
      var x = accMap[a.code]; if (x && !x.legacyId) accSh.getRange(x._row, 13).setValue(a.erpId);
    });
    // 2) القيد الافتتاحي
    var set = _glSettings_(), entries = [];
    var dt = new Date(+p.cutoff.slice(6), +p.cutoff.slice(3, 5) - 1, +p.cutoff.slice(0, 2) + 1);
    var openDate = ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2) + '/' + dt.getFullYear();
    var oLines = [], dB = 0, cB = 0;
    p.accounts.forEach(function (a) {
      ['EGP', 'SAR', 'USD'].forEach(function (cur) {
        var v = a.bal[cur]; if (Math.abs(v) < 0.005) return;
        var code = codeOf[a.erpId];
        var acc = accMap[code];
        // حساب بعملة محددة ورصيده بعملة أخرى (نادر): يُسجَّل على الحساب بلا تقييد العملة غير ممكن — يُحوَّل لمعادل الجنيه بعملة الحساب
        oLines.push({ account: code, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0, currency: cur, rate: rates[cur], desc: 'رصيد منقول من الـ ERP (' + a.erpId + ')', _acc: acc });
        dB += (v > 0 ? v : 0) * rates[cur]; cB += (v < 0 ? -v : 0) * rates[cur];
      });
    });
    var diff = _glR2_(dB - cB);
    if (Math.abs(diff) > 0.05) oLines.push({ account: GL_ACC_OPEN_DIFF_, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, currency: 'EGP', rate: 1, desc: 'فروق تقييم العملات عند النقل من الـ ERP' });
    // أعمدة عملة الحسابات المقيّدة: لو الحساب بعملة واحدة ورصيده بعملة أخرى نفك التقييد عن سطره بجعل عملة الحساب فارغة لاحقاً — هنا نتحقق فقط
    oLines.forEach(function (l) { if (l._acc && l._acc.currency && l._acc.currency !== l.currency) { accSh.getRange(l._acc._row, 6).setValue(''); } delete l._acc; });
    _GL_ACC_MEMO_ = null;
    if (oLines.length) entries.push({ date: openDate, type: 'قيد افتتاحي', desc: 'أرصدة افتتاحية منقولة من برنامج الـ ERP حتى ' + p.cutoff, ref: 'ERP-OPENING', lines: oLines });
    // 3) قيود ما بعد القطع
    var skipped = [];
    if (opts.includeAfter !== false) {
      p.after.forEach(function (v) {
        if (!v.balanced) { skipped.push(v.vid); return; }   // مستند غير متوازن بالـ ERP نفسه — يُتخطّى ويُبلَّغ عنه
        entries.push({ date: v.date, type: 'قيد مستورد', desc: v.desc || ('مستند الـ ERP ' + v.vid), ref: v.vid,
          lines: v.lines.map(function (l) { return { account: codeOf[l.id], debit: l.d, credit: l.c, currency: l.cur, rate: rates[l.cur], desc: l.desc }; }) });
      });
    }
    if (!entries.length) throw new Error('لا توجد أرصدة أو قيود للنقل');
    var validated = entries.map(function (e) {
      try { return _glValidate_(e, { allowBeforeStart: true }); }
      catch (err) { throw new Error((e.ref || '') + ': ' + err.message); }
    });
    var batchId = 'ERP-' + Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyyMMdd-HHmmss');
    var firstSeq = _glNextEntrySeq_(validated.length), eRows = [], lRows = [];
    validated.forEach(function (v, i) {
      var id = _glEntryId_(firstSeq + i);
      var w = _glWriteEntry_(v, { id: id, seq: firstSeq + i, status: GL_ST_POSTED_, sourceKey: 'ERP:' + entries[i].ref, batchId: batchId, desc: entries[i].desc, ref: entries[i].ref }, session.username);
      eRows.push(w.eRow); lRows = lRows.concat(w.lRows);
    });
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    eSh.getRange(eSh.getLastRow() + 1, 1, eRows.length, eRows[0].length).setValues(eRows);
    lSh.getRange(lSh.getLastRow() + 1, 1, lRows.length, lRows[0].length).setValues(lRows);
    _glSheet_('batches').appendRow([batchId, 'نقل بيانات الـ ERP', 'من ' + p.erpName + ' — القطع ' + p.cutoff + ' — ريال ' + rates.SAR + ' / دولار ' + rates.USD, validated.length, 'فعّالة', session.username, _glNow_()]);
    try { _glSetSetting_('erp_url', _glStr_(url)); } catch (e) { }
    _glSetSetting_('erp_rate_SAR_' + p.cutoff.replace(/\//g, ''), rates.SAR);
    _glSetSetting_('erp_rate_USD_' + p.cutoff.replace(/\//g, ''), rates.USD);
    logChange_(session.username, 'نقل بيانات الـ ERP إلى الحسابات العامة', 'GL:' + batchId, 'النقل', '-',
      newRows.length + ' حساب جديد، ' + validated.length + ' قيد، ' + lRows.length + ' سطر' + (skipped.length ? '، تُخطّي ' + skipped.length + ' مستند غير متوازن' : ''));
    return { success: true, batchId: batchId, newAccounts: newRows.length, entries: validated.length, lines: lRows.length, diff: diff, skipped: skipped };
  } finally { lock.releaseLock(); }
}

/* ============================================================================
   🤖 (V4.207) المرحلة 2 — القيود التلقائية من شاشات البرنامج («وضع الظل»)
   ----------------------------------------------------------------------------
   الشاشات الحالية تبقى هي المصدر، والدفتر يُبنى منها تلقائياً بقيود مرحّلة لكل حدث، لكل قيد «مفتاح
   مصدر» ثابت (AUTO:…) وبصمة لمحتواه، فالمزامنة تكرارية آمنة: تُنشئ الجديد وتُحدِّث ما تغيّر مصدره وتُلغي
   ما حُذف مصدره، ولا تلمس غير ذلك. مصادر القيود:
     • حسابات العملاء: بنود كل (عميل، رحلة) = قيد واحد (من حـ/ العميل إلى حـ/ الإيراد المناسب لكل بند،
       والخصم من حـ/ الخصومات المسموح بها)، وكل دفعة قيد (من حـ/ نقدية تحت التسوية إلى حـ/ العميل)،
       والتحويل بين الجنيه والريال على حساب العميل نفسه بعملتين، وترحيل الرصيد بين رحلتين عبر حساب مقاصة.
     • الوكلاء: كل مجموعة تأشيرات (العدد × السعر) ودورة نقل (الباصات × السعر) تكلفة مباشرة دائنة للوكيل،
       وبنود حساب الوكيل (مدينة/دائنة) ودفعاته.
     • رسوم الغرفة: كل إيصال إيداع يزيد رصيد الشركة لدى الغرفة، وكل ملف له تاريخ مراجعة يسحب رسومه كتكلفة.
   النقدية: دفعات الشاشات لا تحدد خزينة/بنكاً، فتمر بحساب «نقدية تحت التسوية»، ويُنقل منه للخزينة أو البنك
   بسند «تحويل نقدية» — فلا يتكرر أي مبلغ مع سندات القبض والصرف اليدوية.
   ما قبل تاريخ بداية الحسابات يُجمَّع في قيد أرصدة افتتاحية واحد (للعملاء والوكلاء ورسوم الغرفة فقط،
   والباقي لحساب «فروق أرصدة افتتاحية»).
   ============================================================================ */
// أدوار الحسابات التي تستخدمها القيود التلقائية: [الأب، الاسم، النوع، تجميعي؟، الفئة، الكود المفضّل]
var GL_AUTO_ROLES_ = {
  cash:       ['11', 'نقدية تحت التسوية (من شاشات البرنامج)', 'ASSET', 0, '', '1103'],
  cfclear:    ['12', 'مقاصة ترحيل الأرصدة بين الرحلات', 'ASSET', 0, '', '1290'],
  roomGroup:  ['1', 'أرصدة رسوم الغرفة لدى الجهات', 'ASSET', 1, 'roomfee', '16'],
  rev_gen:    ['41', 'إيرادات عمرة عامة', 'REV', 0, '', '4101'],
  rev_visa:   ['41', 'إيرادات التأشيرات', 'REV', 0, '', ''],
  rev_house:  ['41', 'إيرادات السكن والإعاشة', 'REV', 0, '', ''],
  rev_trans:  ['41', 'إيرادات النقل', 'REV', 0, '', ''],
  rev_room:   ['41', 'إيرادات رسوم الغرفة والباركود', 'REV', 0, '', ''],
  rev_ticket: ['41', 'إيرادات التذاكر', 'REV', 0, '', ''],
  rev_sup:    ['41', 'إيرادات الإشراف', 'REV', 0, '', ''],
  disc:       ['41', 'خصومات مسموح بها للعملاء', 'REV', 0, '', '4199'],
  cost_visa:  ['51', 'تكلفة التأشيرات', 'EXP', 0, '', '5101'],
  cost_trans: ['51', 'تكلفة النقل', 'EXP', 0, '', '5102'],
  cost_house: ['51', 'تكلفة السكن والإعاشة', 'EXP', 0, '', '5103'],
  cost_room:  ['51', 'رسوم غرفة الوزارة', 'EXP', 0, '', '5104'],
  cost_other: ['51', 'تكاليف مباشرة أخرى', 'EXP', 0, '', '5109']
};
// تاريخ من أي قيمة (تاريخ، أو نص يبدأ بـ dd/mm/yyyy ولو معه وقت، أو yyyy-mm-dd)
function _glAutoDate_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : _glDate_(v);
  var s = _glStr_(v).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
  var m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  return m ? ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1] : '';
}
function _glHash_(str) {   // بصمة قصيرة ثابتة (djb2 مزدوج) — لاكتشاف تغيّر محتوى القيد
  var h1 = 5381, h2 = 52711;
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = ((h1 << 5) + h1 + c) | 0; h2 = ((h2 << 5) + h2 ^ c) | 0; }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
function _glCleanDesc_(s) { return _glStr_(s).replace(/\s*⟦(?:cf|src):[^⟧]+⟧\s*/gi, ' ').replace(/\s+/g, ' ').trim(); }
function _glNextCodeIn_(parent, taken) { return _glFreeChildCode_(parent, taken); }
// إضافة حساب للذاكرة فقط (للمعاينة قبل الإنشاء الفعلي، وليراه الفحص فوراً)
function _glMemoAddAcc_(row) {
  var m = _glAccounts_(), code = _glStr_(row[0]);
  if (m.map[code]) return;
  var a = { code: code, name: _glStr_(row[1]), type: _glStr_(row[2]) || 'ASSET', parent: _glStr_(row[3]), isGroup: _glStr_(row[4]) === 'نعم',
    currency: _glStr_(row[5]), kind: _glStr_(row[6]), link: _glStr_(row[7]), active: true, notes: _glStr_(row[9]), legacyId: '', _row: 0, _virtual: true };
  m.list.push(a); m.map[code] = a;
}
// حسابات الأدوار: من الإعدادات، أو حساب قائم بنفس الاسم تحت الأب، أو الكود المفضّل لو اسمه مطابق، وإلا يُنشأ
function _glAutoRoles_(user, dry) {
  var set = _glSettings_(), accs = _glAccounts_(), out = {}, newRows = [], taken = {}, saveKeys = [];
  var defs = _glHbOn_() ? Object.assign({}, GL_AUTO_ROLES_, GL_HB_ROLES_) : GL_AUTO_ROLES_;
  Object.keys(defs).forEach(function (role) {
    var d = defs[role], parent = d[0], name = d[1], prefer = d[5];
    var cur = set['auto_acc_' + role];
    if (cur && (accs.map[cur] || taken[cur])) { out[role] = cur; return; }
    var n = _glNorm_(name);
    var ex = (prefer && accs.map[prefer] && _glNorm_(accs.map[prefer].name) === n) ? accs.map[prefer]
      : accs.list.filter(function (a) { return a.parent === parent && _glNorm_(a.name) === n; })[0];
    var code;
    if (ex) code = ex.code;
    else {
      if (!accs.map[parent] || !accs.map[parent].isGroup) throw new Error('المجموعة ' + parent + ' غير موجودة أو غير تجميعية بالدليل — لا يمكن إنشاء «' + name + '»');
      code = (prefer && !accs.map[prefer] && !taken[prefer] && prefer.length === parent.length + (parent.length === 1 ? 1 : (parent.length === 2 ? 2 : 3))) ? prefer : _glNextCodeIn_(parent, taken);
      taken[code] = 1;
      var row = _glAccRow_({ code: code, name: name, type: d[2], parent: parent, isGroup: !!d[3], kind: d[4], notes: 'يستخدمه النظام للقيود التلقائية' }, user);
      newRows.push(row); _glMemoAddAcc_(row);
    }
    out[role] = code; saveKeys.push(role);
  });
  out._new = newRows.map(function (r) { return r[0] + ' — ' + r[1]; });
  if (dry) return out;
  if (newRows.length) { var sh = _glSheet_('accounts'); sh.getRange(sh.getLastRow() + 1, 1, newRows.length, GL_SHEETS_.accounts.headers.length).setValues(newRows); _GL_ACC_MEMO_ = null; }
  saveKeys.forEach(function (role) { _glSetSetting_('auto_acc_' + role, out[role]); });
  return out;
}
// حسابات الأطراف (عميل/وكيل/مورد نقل/شركة رسوم غرفة) — تُنشأ الناقصة دفعة واحدة
function _glPartyResolver_(roles, user) {
  var accs = _glAccounts_(), byLink = {}, pending = [], taken = {}, madeNames = [];
  accs.list.forEach(function (a) {
    if (a.link && !a.isGroup) byLink[a.kind + '|' + _glNorm_(a.link)] = a.code;
    // (V4.223) روابط الحسابات المدموجة فيه ⟦alias:الفئة|الاسم⟧ — لا يُعاد فتح الحساب المحذوف بالمزامنة
    String(a.notes || '').replace(/⟦alias:([^|⟧]*)\|([^⟧]+)⟧/g, function (m, k, n) { if (!a.isGroup) byLink[k + '|' + _glNorm_(n)] = a.code; return m; });
  });
  var parentOf = { client: '1201', agent: '2101', supplier: '2102', roomfee: roles.roomGroup, hbrev: roles.hb_revgrp, trip: _glTripGroup_() };
  var typeOf = { client: 'ASSET', agent: 'LIAB', supplier: 'LIAB', roomfee: 'ASSET', hbrev: 'REV', trip: 'REV' };
  var get = function (kind, name) {
    name = _glStr_(name); if (!name) return '';
    var k = kind + '|' + _glNorm_(name);
    if (byLink[k]) return byLink[k];
    var parent = parentOf[kind];
    if (!accs.map[parent]) throw new Error(kind === 'trip' ? 'مجموعة «إيرادات رحلات العمرة» (4101) غير موجودة — شغّل «إعادة بناء قيود الرحلات» من تبويب القيود التلقائية' : 'المجموعة ' + parent + ' غير موجودة بالدليل');
    var code = _glNextCodeIn_(parent, taken); taken[code] = 1;
    var row = _glAccRow_({ code: code, name: kind === 'roomfee' ? 'رسوم الغرفة — ' + name : (kind === 'hbrev' ? 'إيرادات حجوزات — ' + name : name), type: typeOf[kind], parent: parent, kind: kind, link: name,
      notes: kind === 'hbrev' ? 'ربح حجوزات الفنادق من هذا المورد — يُرحَّل لإيرادات السكن نهاية الموسم' : (kind === 'trip' ? 'حساب الرحلة: إيرادات عملائها (دائن) وتكاليفها — رسوم الغرف والتأشيرات والنقل (مدين) — رصيده = ربح الرحلة' : 'أُنشئ تلقائياً من شاشات البرنامج') }, user);
    pending.push(row); _glMemoAddAcc_(row); madeNames.push(code + ' — ' + row[1]);
    byLink[k] = code;
    return code;
  };
  get.flush = function () {
    if (!pending.length) return 0;
    var sh = _glSheet_('accounts');
    sh.getRange(sh.getLastRow() + 1, 1, pending.length, GL_SHEETS_.accounts.headers.length).setValues(pending);
    var n = pending.length; pending = []; _GL_ACC_MEMO_ = null;
    return n;
  };
  get.pendingCount = function () { return pending.length; };
  get.made = function () { return madeNames; };
  return get;
}
/* 🧳 (V4.222) حسابات الرحلات: مجموعة «4101 إيرادات رحلات العمرة» وحساب لكل رحلة تحتها (فئة «رحلة عمرة» مربوط باسمها).
   تعمل بعد «إعادة بناء قيود الرحلات» (trip_mode) — قبلها تبقى القيود بالشكل القديم. */
var GL_TRIP_GROUP_ = '4101';
function _glTripMode_() { return _glSettings_().trip_mode === 'نعم'; }
function _glTripGroup_() {
  var accs = _glAccounts_(), a = accs.map[GL_TRIP_GROUP_];
  if (a && a.isGroup) return a.code;
  var g = accs.list.filter(function (x) { return x.isGroup && x.kind === 'trip'; })[0];
  return g ? g.code : '';
}
function _glFmtN_(n) { var v = Math.round((+n || 0) * 100) / 100; var p = String(Math.abs(v)).split('.'); return (v < 0 ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p[1] ? '.' + p[1] : ''); }
// توزيع مبلغ على رحلات بأوزان (عدد المعتمرين) — المجموع يساوي المبلغ تماماً (الفرق على الأخيرة)
function _glSplitByWeight_(total, names, weights) {
  var W = weights.reduce(function (a, b) { return a + b; }, 0), out = [], acc = 0;
  names.forEach(function (n, i) {
    var v = i === names.length - 1 ? _glR2_(total - acc) : _glR2_(W > 0 ? total * weights[i] / W : total / names.length);
    acc = _glR2_(acc + v); out.push({ name: n, amt: v, w: weights[i] });
  });
  return out;
}
// أوزان الرحلات من تفصيل العملاء/الرحلات بالملف أو المجموعة (بند اسمه اسم الرحلة ⇒ عدده) وإلا بالتساوي
function _glTripWeights_(trips, breakdown) {
  var by = {}; (breakdown || []).forEach(function (b) { var n = _glNorm_(b && b.name); if (n) by[n] = (by[n] || 0) + (_glNum_(b.count) || 0); });
  var w = trips.map(function (t) { return by[_glNorm_(t)] || 0; });
  return w.some(function (x) { return x > 0; }) ? w : trips.map(function () { return 1; });
}
function _glCpDirMap_() { var o = {}; try { _glRows_('cpdir').forEach(function (r) { var id = _glStr_(r[0]); if (id && _glStr_(r[1])) o[id] = _glStr_(r[1]); }); } catch (e) {} return o; }
function _glRevRole_(desc) {
  var d = _glStr_(desc);
  if (/تأشير|تاشير|فيز/.test(d)) return 'rev_visa';
  if (/رسوم\s*(ال)?غرف|باركود/.test(d)) return 'rev_room';
  if (/تذاكر|تذكر|طيران/.test(d)) return 'rev_ticket';
  if (/سكن|فندق|إعاشة|اعاشة|اعاشه|إعاشه|وجبات/.test(d)) return 'rev_house';
  if (/نقل|باص|مواصلات/.test(d)) return 'rev_trans';
  if (/إشراف|اشراف|مشرف/.test(d)) return 'rev_sup';
  return 'rev_gen';
}
function _glCostRole_(desc) {
  var d = _glStr_(desc);
  if (/تأشير|تاشير|فيز|موفا/.test(d)) return 'cost_visa';
  if (/نقل|باص|دورة|مواصلات/.test(d)) return 'cost_trans';
  if (/سكن|فندق|إعاشة|اعاشة|اعاشه|إعاشه|وجبات/.test(d)) return 'cost_house';
  return 'cost_other';
}
// قراءة تواريخ الرحلات وشركاتها (تاريخ الذهاب = تاريخ استحقاق بنود العميل)
function _glTripsIndex_() {
  var out = {};
  try {
    var sh = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) {
      var n = _glStr_(r[0]); if (n) out[n] = { date: _glAutoDate_(r[4]), company: _glStr_(r[1]) };
    });
  } catch (e) {}
  return out;
}
// بناء القيود المطلوبة من كل الشاشات (بلا أي كتابة بالدفتر عدا إنشاء الحسابات الناقصة لو write=true)
function _glAutoBuild_(user, write) {
  var set = _glSettings_(), rates = _glRates_(), startK = _glDKey_(set.startDate);
  var roles = _glAutoRoles_(user, !write);
  var party = _glPartyResolver_(roles, user);
  var trips = _glTripsIndex_(), out = [], warn = [];
  var tripMode = _glTripMode_() && !!_glTripGroup_(), cpDir = _glCpDirMap_(), accMap = _glAccounts_().map;
  var R = function (role) { return roles[role]; };
  var sarRate = rates.SAR;
  var mkLine = function (acc, amt, dr, cur, extra) {
    var o = { account: acc, debit: dr ? amt : 0, credit: dr ? 0 : amt, currency: cur, rate: cur === 'EGP' ? 1 : (extra && extra.rate ? extra.rate : rates[cur]) };
    if (extra) ['trip', 'company', 'client', 'agent', 'desc', 'exact'].forEach(function (k) { if (extra[k]) o[k] = extra[k]; });
    return o;
  };
  var push = function (e) { if (e.lines.length >= 2) out.push(e); };

  /* ---------- 1) حسابات العملاء ---------- */
  var iRows = [], pRows = [];
  var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS), pSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
  if (iSh.getLastRow() >= 2) iRows = iSh.getRange(2, 1, iSh.getLastRow() - 1, ACC_ITEMS_HEADERS.length).getValues();
  if (pSh.getLastRow() >= 2) pRows = pSh.getRange(2, 1, pSh.getLastRow() - 1, ACC_PAY_HEADERS.length).getValues();
  var byCT = {}, calcItems = {}, calcPays = {};
  iRows.forEach(function (r) {
    var client = _glStr_(r[1]), trip = _glStr_(r[2]) || 'عام';
    if (!client) return;
    var cur = _glStr_(r[5]) === 'SAR' ? 'SAR' : 'EGP', v = _glR2_(_accNum_(r[8])), isDisc = _glStr_(r[9]) === 'نعم';
    (calcItems[client] = calcItems[client] || []).push({ value: _accNum_(r[8]), currency: cur, isDiscount: isDisc });
    if (!v) return;
    var k = client + '|' + trip;
    (byCT[k] = byCT[k] || { client: client, trip: trip, items: [], created: '' }).items.push({ id: _glStr_(r[0]), desc: _glStr_(r[3]), cur: cur, v: v, disc: isDisc, company: _glStr_(r[16]),
      count: r[6], price: r[7], nights: Number(r[15]) || 0, order: _accNum_(r[18]), direct: _glStr_(r[19]) === 'نعم' });
    if (!byCT[k].created) byCT[k].created = _glAutoDate_(r[12]);
  });
  Object.keys(byCT).forEach(function (k) {
    var g = byCT[k], acc = party('client', g.client), ti = trips[g.trip] || {};
    var date = ti.date || g.created || set.startDate;
    // 🧳 (V4.222) قيد إيرادات الرحلة: من ح/ العميل «الرحلة (بيان الحساب)» إلى ح/ الرحلة «العميل (بيان الحساب)» — نفس نص ملخص حسابات الرحلة
    if (tripMode && g.trip !== 'عام') {
      var tAcc = party('trip', g.trip), revItems = g.items.filter(function (it) { return !/⟦cf:/i.test(it.desc); });
      var stmt = _accTripStatement_(revItems.map(function (it) {
        return { desc: _glCleanDesc_(it.desc), currency: it.cur, count: it.count, price: it.price, value: it.v, isDiscount: it.disc, isDirect: it.direct, nights: it.nights, order: it.order };
      }));
      var tl = [], tnet = { EGP: 0, SAR: 0 }, ttag = { trip: g.trip, company: ti.company, client: g.client };
      revItems.forEach(function (it) { tnet[it.cur] = _glR2_(tnet[it.cur] + (it.disc ? -1 : 1) * it.v); });
      ['EGP', 'SAR'].forEach(function (c) {
        if (Math.abs(tnet[c]) < 0.005) return;
        tl.push(mkLine(acc, Math.abs(tnet[c]), tnet[c] > 0, c, Object.assign({ desc: g.trip + ' (' + stmt + ')' }, ttag)));
        tl.push(mkLine(tAcc, Math.abs(tnet[c]), tnet[c] < 0, c, Object.assign({ desc: g.client + ' (' + stmt + ')' }, ttag)));
      });
      // (V4.223) ترحيل رصيد العميل من رحلة لرحلة لا يُقيَّد بالحسابات العامة (رصيد العميل واحد — كان يظهر مديناً ودائناً معاً)
      push({ key: 'AUTO:TRIP:' + k, date: date, desc: 'إيرادات رحلة ' + g.trip + ' — ' + g.client, trip: g.trip, company: ti.company || '', lines: tl, src: 'trip', client: g.client });
      return;
    }
    var lines = [], net = { EGP: 0, SAR: 0 }, tTag = g.trip === 'عام' ? '' : g.trip;
    g.items.forEach(function (it) {
      var isCf = /⟦cf:/i.test(it.desc), d = _glCleanDesc_(it.desc) || 'بند';
      if (isCf) return;   // (V4.223) ترحيل الرصيد بين الرحلات لا يُقيَّد
      var role = isCf ? 'cfclear' : (it.disc ? 'disc' : _glRevRole_(d));
      // البند يزيد مستحق العميل (والخصم ينقصه) — القيمة السالبة تعكس الاتجاه
      var sign = (it.disc ? -1 : 1) * (it.v < 0 ? -1 : 1), amt = Math.abs(it.v);
      net[it.cur] = _glR2_(net[it.cur] + sign * amt);
      lines.push(mkLine(R(role), amt, sign < 0, it.cur, { trip: tTag, company: it.company || ti.company, client: g.client, desc: d }));
    });
    ['EGP', 'SAR'].forEach(function (c) { if (Math.abs(net[c]) >= 0.005) lines.unshift(mkLine(acc, Math.abs(net[c]), net[c] > 0, c, { trip: tTag, company: ti.company, client: g.client, desc: 'بنود حساب ' + g.client + ' — ' + g.trip })); });
    push({ key: 'AUTO:CI:' + k, date: date, desc: 'استحقاقات العميل ' + g.client + ' — ' + g.trip, trip: g.trip === 'عام' ? '' : g.trip, company: ti.company || '', lines: lines, src: 'client' });
  });
  var payObjs = {};
  pRows.forEach(function (r, i) {
    var client = _glStr_(r[1]); if (!client) return;
    var o = { id: _glStr_(r[0]) || ('#' + i), trip: _glStr_(r[2]) || 'عام', ptype: _glStr_(r[3]) || 'دفعة', date: _glAutoDate_(r[4]), amount: _accNum_(r[5]),
      currency: _glStr_(r[6]) === 'SAR' ? 'SAR' : 'EGP', rate: _accNum_(r[7]), desc: _glStr_(r[8]), created: _glAutoDate_(r[10]) };
    (payObjs[client] = payObjs[client] || []).push(o);
  });
  Object.keys(payObjs).forEach(function (client) {
    var pays = payObjs[client];
    calcPays[client] = pays;
    try { _accResolveFx_(calcItems[client] || [], pays); } catch (e) {}   // يحدد اتجاه كل تحويل عملة كما تحسبه الشاشة
    var acc = party('client', client);
    pays.forEach(function (p) {
      var amt = _glR2_(Math.abs(p.amount)); if (!amt) return;
      if (/⟦src:gl-/i.test(p.desc)) return;   // (V4.222) دفعة أصلها إيصال بالحسابات العامة — قيدها هو الإيصال نفسه
      if (/⟦cf:/i.test(p.desc) && p.ptype !== 'تحويل') return;   // (V4.223) ترحيل رصيد بين رحلتين — لا قيد
      var ti = trips[p.trip] || {}, date = p.date || p.created || set.startDate, d = _glCleanDesc_(p.desc);
      var tag = { trip: p.trip === 'عام' ? '' : p.trip, company: ti.company, client: client };
      var lines;
      if (p.ptype === 'تحويل') {
        var conv = _glR2_(amt * (p.rate || 0)); if (!conv) return;
        var src = p.currency, dst = src === 'SAR' ? 'EGP' : 'SAR';
        var sarAmt = src === 'SAR' ? amt : conv, egpAmt = src === 'SAR' ? conv : amt;
        var rSar = Math.round(egpAmt / sarAmt * 1e6) / 1e6;
        var srcCr = p._fxRole !== 'due';   // 'pay': ينقص مستحق عملة المصدر ويزيد مستحق العملة الأخرى
        lines = [
          mkLine(acc, src === 'SAR' ? sarAmt : egpAmt, !srcCr, src, Object.assign({ exact: 1, rate: src === 'SAR' ? rSar : 1, desc: d || 'تحويل عملة بحساب العميل' }, tag)),
          mkLine(acc, dst === 'SAR' ? sarAmt : egpAmt, srcCr, dst, Object.assign({ exact: 1, rate: dst === 'SAR' ? rSar : 1, desc: d || 'تحويل عملة بحساب العميل' }, tag))
        ];
      } else {
        var isCf = /⟦cf:/i.test(p.desc), neg = p.amount < 0;
        lines = [
          mkLine(isCf ? R('cfclear') : ((cpDir[p.id] && accMap[cpDir[p.id]] && !accMap[cpDir[p.id]].isGroup) ? cpDir[p.id] : R('cash')), amt, !neg, p.currency, Object.assign({ desc: d || 'دفعة من العميل ' + client }, tag)),
          mkLine(acc, amt, neg, p.currency, Object.assign({ desc: d || 'دفعة من العميل ' + client }, tag))
        ];
      }
      push({ key: 'AUTO:CP:' + p.id, date: date, desc: (p.ptype === 'تحويل' ? 'تحويل عملة — ' : 'دفعة — ') + client + (p.trip !== 'عام' ? ' — ' + p.trip : '') + (d ? ' — ' + d : ''),
        trip: tag.trip, company: ti.company || '', lines: lines, src: 'client' });
    });
  });

  /* ---------- 2) الوكلاء: التأشيرات والنقل والبنود والدفعات ---------- */
  var files = _vzReadAll_(), agentSet = {};
  files.forEach(function (f) { if (f.agent) agentSet[f.agent] = 1; });
  try { _vzReadPrices_().forEach(function (p) { if (p.agent) agentSet[p.agent] = 1; }); } catch (e) {}
  var agentNames = Object.keys(agentSet).sort(function (a, b) { return b.length - a.length; });
  var agentOfKey = function (key) {
    key = _glStr_(key); if (agentSet[key]) return { agent: key, company: '' };
    for (var i = 0; i < agentNames.length; i++) if (key.indexOf(agentNames[i] + ' - ') === 0) return { agent: agentNames[i], company: key.slice(agentNames[i].length + 3) };
    var ix = key.indexOf(' - ');
    return ix > 0 ? { agent: key.slice(0, ix), company: key.slice(ix + 3) } : { agent: key, company: '' };
  };
  files.forEach(function (f) {
    var v = _glR2_(_mfNum_(f.visaCount) * _mfNum_(f.price));
    if (!f.agent || !v) return;
    // 🧳 (V4.222) بعد إصدار الموفا فقط: من ح/ الرحلة (موزّعة بعدد أفراد كل رحلة) إلى ح/ الوكيل
    if (tripMode) {
      if (_vzStatusNorm_(f.status) !== 'تم إصدار الموفا') return;
      var vAcc = party('agent', f.agent), vTrips = _vzTripsOf_(f), vDate = f.date || _glAutoDate_(f.createdAt) || set.startDate;
      var vStmt = 'تأشيرات مجموعة ' + (f.ref || f.seq || '') + ' — ' + f.agent + ' (' + _mfNum_(f.visaCount) + ' × ' + _glFmtN_(_mfNum_(f.price)) + ' ريال)';
      var vl = [], vAmt = Math.abs(v), vNeg = v < 0;
      if (vTrips.length) _glSplitByWeight_(vAmt, vTrips, _glTripWeights_(vTrips, f.breakdown)).forEach(function (x) {
        if (x.amt) vl.push(mkLine(party('trip', x.name), x.amt, !vNeg, 'SAR', { trip: x.name, company: f.company, agent: f.agent, desc: vStmt + (vTrips.length > 1 ? ' — حصة ' + x.name : '') }));
      });
      else { vl.push(mkLine(R('cost_visa'), vAmt, !vNeg, 'SAR', { company: f.company, agent: f.agent, desc: vStmt })); warn.push('مجموعة تأشيرات ' + (f.ref || f.seq || '') + ' بلا رحلة مرتبطة — سُجّلت على تكلفة التأشيرات العامة'); }
      vl.push(mkLine(vAcc, vAmt, vNeg, 'SAR', { trip: vTrips.length === 1 ? vTrips[0] : '', company: f.company, agent: f.agent, desc: vStmt }));
      push({ key: 'AUTO:VZ:' + f.id, date: vDate, desc: vStmt + (vTrips.length ? ' — ' + vTrips.join('، ') : ''), trip: vTrips.length === 1 ? vTrips[0] : '', company: f.company, lines: vl, src: 'agent' });
      return;
    }
    var acc = party('agent', f.agent), date = f.date || _glAutoDate_(f.createdAt) || set.startDate, amt = Math.abs(v), neg = v < 0;
    var tag = { trip: f.tripName, company: f.company, agent: f.agent, desc: 'تأشيرات مجموعة ' + (f.ref || f.seq || '') + ' (' + _mfNum_(f.visaCount) + ' × ' + _mfNum_(f.price) + ')' };
    push({ key: 'AUTO:VZ:' + f.id, date: date, desc: 'تأشيرات — ' + f.agent + ' — مجموعة ' + (f.ref || f.seq || '') + (f.tripName ? ' — ' + f.tripName : ''), trip: f.tripName, company: f.company,
      lines: [mkLine(R('cost_visa'), amt, !neg, 'SAR', tag), mkLine(acc, amt, neg, 'SAR', tag)], src: 'agent' });
  });
  var tRows = [], tPrices = [];
  try { tRows = _taReadRowsRaw_(); tPrices = _vzReadTransportPrices_(); } catch (e) { warn.push('تعذّرت قراءة دورات النقل: ' + e.message); }
  var seenT = {};
  tRows.forEach(function (r) {
    if (!r.supplier) return;
    var busCount = _mfNum_(r.busCount), busPrice = _mfNum_(r.busPrice);
    if (!busPrice) busPrice = _vzTransportPriceAt_(r.supplier, r.arrivalDate, tPrices);
    var v = _glR2_(busCount * busPrice);
    if (tripMode && _mfNum_(r.operationValue) && _mfNum_(r.busPrice)) v = _glR2_(_mfNum_(r.operationValue));   // (V4.222) قيمة التشغيلة كاملة بالمقاطع الإضافية
    if (!v) return;
    var id = _glStr_(r.id) || ('?' + (r.arrivalDate || '')); seenT[id] = (seenT[id] || 0) + 1;
    var key = 'AUTO:TR:' + id + (seenT[id] > 1 ? '#' + seenT[id] : '');
    var isAgent = !!agentSet[r.supplier], acc = party(isAgent ? 'agent' : 'supplier', r.supplier);
    var tag = { trip: r.tripName, company: r.company, agent: r.supplier, desc: 'دورة نقل ' + (r.tripName || r.client || '') + ' (' + busCount + ' × ' + busPrice + ')' };
    if (tripMode) {   // 🧳 (V4.222) من ح/ الرحلة (من الإشعار) إلى ح/ الوكيل أو شركة النقل — بلا رحلة ⇒ تكلفة النقل بوسم العميل
      var tTrips = _tripListSplit_(r.tripName || ''), tl2 = [], tA = Math.abs(v), tStmt = 'دورة نقل إشعار ' + id + ' — ' + (r.tripName || r.client || '') +
        (r.arrivalDate ? ' وصول ' + _glAutoDate_(r.arrivalDate).slice(0, 5) : '') + (r.departureDate ? ' مغادرة ' + _glAutoDate_(r.departureDate).slice(0, 5) : '') +
        ' (' + busCount + ' باص × ' + _glFmtN_(busPrice) + (_glR2_(busCount * busPrice) !== v ? ' + مقاطع إضافية' : '') + ' = ' + _glFmtN_(v) + ')';
      if (tTrips.length) _glSplitByWeight_(tA, tTrips, tTrips.map(function () { return 1; })).forEach(function (x) {
        if (x.amt) tl2.push(mkLine(party('trip', x.name), x.amt, v > 0, 'SAR', { trip: x.name, company: r.company, agent: r.supplier, desc: tStmt }));
      });
      else tl2.push(mkLine(R('cost_trans'), tA, v > 0, 'SAR', { company: r.company, client: r.client, agent: r.supplier, desc: tStmt }));
      tl2.push(mkLine(acc, tA, v < 0, 'SAR', { trip: tTrips.length === 1 ? tTrips[0] : '', company: r.company, agent: r.supplier, desc: tStmt }));
      push({ key: key, date: _glAutoDate_(r.arrivalDate) || set.startDate, desc: tStmt, trip: tTrips.length === 1 ? tTrips[0] : '', company: r.company, lines: tl2, src: 'agent' });
      return;
    }
    push({ key: key, date: _glAutoDate_(r.arrivalDate) || set.startDate, desc: 'نقل — ' + r.supplier + ' — ' + (r.tripName || r.client || id), trip: r.tripName, company: r.company,
      lines: [mkLine(R('cost_trans'), Math.abs(v), v > 0, 'SAR', tag), mkLine(acc, Math.abs(v), v < 0, 'SAR', tag)], src: 'agent' });
  });
  var viaRx = null;
  if (roles.hb_via) { var kw = _glHbCfg_().viaKw; if (kw) try { viaRx = new RegExp(kw); } catch (e) { warn.push('كلمات بنود الوكيل عبر الفنادق غير صالحة: ' + kw); } }
  _vzReadItems_('').forEach(function (it) {
    var v = _glR2_(it.value); if (!v || !it.agent) return;
    var ao = agentOfKey(it.agent), acc = party('agent', ao.agent), cur = it.currency === 'EGP' ? 'EGP' : 'SAR';
    var d = _glCleanDesc_(it.desc) || 'بند حساب وكيل';
    var toAgent = !it.isCredit, amt = Math.abs(v); if (v < 0) toAgent = !toAgent;   // مدين بكشف الوكيل = مستحق له علينا
    var tag = { company: ao.company, agent: ao.agent, desc: d };
    // (V4.208) بند «على الوكيل» عن تحويل عميل فنادق عبره ← مقابله مقاصة دفعات الفنادق عبر الوكلاء (لا التكلفة)،
    // فيلتقي بدفعة برنامج الحجوزات المراجَعة «عبر الوكيل» ولا يتكرر المبلغ على الوكيل
    var offRole = (!toAgent && viaRx && viaRx.test(d)) ? 'hb_via' : _glCostRole_(d);
    push({ key: 'AUTO:AI:' + it.id, date: _glAutoDate_(it.date) || _glAutoDate_(it.createdAt) || _glDate_(set.startDate), desc: 'بند حساب الوكيل ' + it.agent + ' — ' + d, company: ao.company,
      lines: [mkLine(R(offRole), amt, toAgent, cur, tag), mkLine(acc, amt, !toAgent, cur, tag)], src: 'agent' });
  });
  _vzReadPays_('').forEach(function (p) {
    var v = _glR2_(p.amount); if (!v || !p.agent) return;
    var ao = agentOfKey(p.agent), acc = party('agent', ao.agent), cur = p.currency === 'EGP' ? 'EGP' : 'SAR', amt = Math.abs(v);
    var d = _glCleanDesc_(p.notes), tag = { company: ao.company, agent: ao.agent, desc: d || 'دفعة للوكيل ' + ao.agent };
    push({ key: 'AUTO:AP:' + p.id, date: p.date || _glAutoDate_(p.createdAt) || set.startDate, desc: 'دفعة للوكيل ' + p.agent + (d ? ' — ' + d : ''), company: ao.company,
      lines: [mkLine(acc, amt, v > 0, cur, tag), mkLine(R('cash'), amt, v < 0, cur, tag)], src: 'agent' });
  });

  /* ---------- 3) رسوم الغرفة: الإيصالات والملفات المراجَعة ---------- */
  var mfFiles = [], receipts = [];
  try { mfFiles = _mfReadAll_(); receipts = _mfReadReceipts_(); } catch (e) { warn.push('تعذّرت قراءة ملفات الوزارة: ' + e.message); }
  var cfg = null; try { cfg = _accPricing_(); } catch (e) {}
  var seenR = {};
  receipts.forEach(function (x) {
    var v = _glR2_(x.amount); if (!v || !x.company) return;
    var id = x.receiptNo || (x.date + '|' + x.company + '|' + v); seenR[id] = (seenR[id] || 0) + 1;
    var acc = party('roomfee', x.company), tag = { company: x.company, desc: 'إيداع رسوم غرفة — إيصال ' + (x.receiptNo || '—') };
    push({ key: 'AUTO:RF:' + id + (seenR[id] > 1 ? '#' + seenR[id] : ''), date: x.date || set.startDate, desc: 'إيداع رسوم الغرفة — ' + x.company + ' — إيصال ' + (x.receiptNo || '—'), company: x.company,
      lines: [mkLine(acc, Math.abs(v), v > 0, 'EGP', tag), mkLine(R('cash'), Math.abs(v), v < 0, 'EGP', tag)], src: 'room' });
  });
  mfFiles.forEach(function (f) {
    if (!f.reviewDate || !f.company) return;
    var c = _mfCompute_(f, cfg), v = _glR2_(c.totalRoomFee); if (!v) return;
    var acc = party('roomfee', f.company);
    // 🧳 (V4.222) رسوم غرفة الملف على حساب الرحلة المرتبطة (موزّعة بعدد معتمري كل رحلة بالملف)
    if (tripMode) {
      var mTrips = _mfTripsOf_(f), N = _mfNum_(f.pilgrims), mAmt = Math.abs(v), ml = [];
      var mStmt = 'رسوم غرفة ' + f.company + ' (' + N + ' × ' + _glFmtN_(c.roomFeeEffective) + (c.murafiqFee ? ' + ' + c.murafiqFee + ' مرافق × ' + _glFmtN_(c.supRoomFee) : '') + ' = ' + _glFmtN_(mAmt) + ') ملف رقم ' + (f.fileNo || '—');
      if (mTrips.length) _glSplitByWeight_(mAmt, mTrips, _glTripWeights_(mTrips, f.breakdown)).forEach(function (x) {
        if (x.amt) ml.push(mkLine(party('trip', x.name), x.amt, v > 0, 'EGP', { trip: x.name, company: f.company, desc: mStmt + (mTrips.length > 1 ? ' — حصة ' + x.name + (x.w > 1 ? ' (' + x.w + ' معتمر)' : '') : '') }));
      });
      else { ml.push(mkLine(R('cost_room'), mAmt, v > 0, 'EGP', { company: f.company, desc: mStmt })); warn.push('ملف وزارة ' + (f.fileNo || '—') + ' بلا رحلة مرتبطة — سُجّلت رسومه على «رسوم غرفة الوزارة» العامة'); }
      ml.push(mkLine(acc, mAmt, v < 0, 'EGP', { trip: mTrips.length === 1 ? mTrips[0] : '', company: f.company, desc: mStmt }));
      push({ key: 'AUTO:MF:' + f.id, date: f.reviewDate, desc: mStmt + (mTrips.length ? ' — ' + mTrips.join('، ') : ''), trip: mTrips.length === 1 ? mTrips[0] : '', company: f.company, lines: ml, src: 'room' });
      return;
    }
    var tag = { trip: f.tripName, company: f.company, client: '', desc: 'رسوم غرفة ملف ' + (f.fileNo || '—') + (f.clientLabel ? ' (' + f.clientLabel + ')' : '') };
    push({ key: 'AUTO:MF:' + f.id, date: f.reviewDate, desc: 'سحب رسوم الغرفة — ملف ' + (f.fileNo || '—') + ' — ' + f.company + (f.tripName ? ' — ' + f.tripName : ''), trip: f.tripName, company: f.company,
      lines: [mkLine(R('cost_room'), Math.abs(v), v > 0, 'EGP', tag), mkLine(acc, Math.abs(v), v < 0, 'EGP', tag)], src: 'room' });
  });

  /* ---------- 3ب) (V4.208) برنامج حجوزات الفنادق ---------- */
  var hbOut = [];
  if (_glHbOn_()) {
    try { hbOut = _glHbBuild_(roles, warn, party); }
    catch (e) { warn.push('تعذّرت قراءة برنامج حجوزات الفنادق: ' + e.message); }
    // 🔀 (V4.217) «الـ ERP هو المصدر حتى تاريخ …»: حجوزات ودفعات ما قبله لا تُسجَّل من برنامج الحجوزات (ولا قيدها
    // الافتتاحي) لأنها داخلة بالفعل في الأرصدة/القيود المنقولة من الـ ERP — منعاً للتكرار
    var hbFromK = _glDKey_(_glDate_(set.hb_from || ''));
    if (hbFromK) hbOut = hbOut.filter(function (e) { return _glDKey_(e.date) >= hbFromK; });
  }

  /* ---------- 4) ما قبل تاريخ البداية → قيد أرصدة افتتاحية واحد ---------- */
  // (V4.216) الحسابات الطرفية تُعرف أيضاً بفئتها (عميل/وكيل/مورد/رسوم غرفة) لا بكودها فقط — تبقى بالرصيد الافتتاحي لو نُقلت لقسم آخر
  var keepOpen = function (code) {
    var ka = _glAccounts_().map[code];
    if (ka && /^(client|agent|supplier|roomfee)$/.test(ka.kind)) return true;
    return (code.indexOf('12') === 0 && code !== R('cfclear')) || code.indexOf('21') === 0 || code.indexOf(R('roomGroup')) === 0;
  };
  var pre = out.filter(function (e) { return _glDKey_(e.date) < startK; });
  var post = out.filter(function (e) { return _glDKey_(e.date) >= startK; });
  var aggOpen = function (list, keep, key, desc) {
    var agg = {};
    list.forEach(function (e) {
      e.lines.forEach(function (l) {
        var code = keep(l.account) ? l.account : GL_ACC_OPEN_DIFF_;
        var k = code + '|' + l.currency, o = (agg[k] = agg[k] || { account: code, currency: l.currency, amt: 0, base: 0, client: l.client, agent: l.agent });
        var a = (l.debit || 0) - (l.credit || 0);
        o.amt += a; o.base += a * (l.rate || 1);
      });
    });
    var oLines = [], resid = 0;
    Object.keys(agg).sort().forEach(function (k) {
      var o = agg[k], amt = _glR2_(o.amt); if (Math.abs(amt) < 0.005) return;
      var rate = o.currency === 'EGP' ? 1 : Math.round(Math.abs(o.base / o.amt) * 1e6) / 1e6 || rates[o.currency];
      var acc = _glAccounts_().map[o.account];
      oLines.push({ account: o.account, debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, currency: o.currency, rate: rate, exact: 1,
        client: acc && acc.kind === 'client' ? acc.link : '', agent: acc && (acc.kind === 'agent' || acc.kind === 'supplier') ? acc.link : '',
        desc: o.account === GL_ACC_OPEN_DIFF_ ? 'مقابل أرصدة ما قبل ' + set.startDate : 'رصيد افتتاحي من شاشات البرنامج' });
      resid += _glR2_((amt > 0 ? amt : 0) * rate) - _glR2_((amt < 0 ? -amt : 0) * rate);
    });
    resid = _glR2_(resid);
    if (Math.abs(resid) >= 0.01) oLines.push({ account: GL_ACC_OPEN_DIFF_, debit: resid < 0 ? -resid : 0, credit: resid > 0 ? resid : 0, currency: 'EGP', rate: 1, desc: 'فروق تقريب تقييم العملات' });
    return oLines.length >= 2 ? { key: key, date: set.startDate, type: 'قيد افتتاحي', desc: desc, lines: oLines, src: 'open' } : null;
  };
  if (set.auto_open !== 'لا' && pre.length) {
    var oe = aggOpen(pre, keepOpen, 'AUTO:OPEN', 'أرصدة افتتاحية من شاشات البرنامج (العملاء والوكلاء ورسوم الغرفة) حتى ' + set.startDate);
    if (oe) post.unshift(oe);
  }
  // (V4.208) حجوزات الفنادق: ما قبل البداية بقيد افتتاحي خاص يُبقي حسابات الأطراف (ليطابق كشف الحساب هناك)
  var hbPre = hbOut.filter(function (e) { return _glDKey_(e.date) < startK; });
  hbOut.forEach(function (e) { if (_glDKey_(e.date) >= startK) post.push(e); });
  if (hbPre.length) {
    var hbParty = {}; hbPre.forEach(function (e) { e.lines.forEach(function (l) { if (l.hbParty) hbParty[l.account] = 1; }); });
    if (set.auto_open !== 'لا') {
      var he = aggOpen(hbPre, function (c) { return !!hbParty[c]; }, 'AUTO:HBOPEN', 'أرصدة افتتاحية من برنامج حجوزات الفنادق حتى ' + set.startDate);
      if (he) { he.src = 'hotel'; post.unshift(he); }
    } else hbPre.forEach(function (e) { post.push(e); });
  }
  pre = pre.concat(hbPre);
  return { entries: post, preCount: pre.length, warnings: warn, roles: roles, party: party, calcItems: calcItems, calcPays: calcPays, receipts: receipts, mfFiles: mfFiles, files: files, tRows: tRows, tPrices: tPrices };
}
/* 📈 (V4.217) القيود التلقائية: كل حركة بعملتها الطبيعية، والمعادل بسعر صرف يوم القيد من «أسعار الصرف اليومية»
   (نفس اليوم ⇒ أقرب يوم سابق). يُطبَّق على قيد بعملة أجنبية واحدة كانت أسطره بالسعر الافتراضي فقط — القيود المختلطة
   (جنيه + ريال) لها أسعار موازنة خاصة فتبقى كما هي، والرصيد الافتتاحي المجمّع يحسب سعره من مكوّناته. بلا أسعار مسجّلة
   يبقى السعر الافتراضي نفسه (لا تغيير). */
function _glAutoDailyRate_(e, fxMap, defR) {
  if (!e || !e.date || /^AUTO:(HB)?OPEN/.test(e.key || '')) return;
  var curs = {}; (e.lines || []).forEach(function (l) { curs[l.currency || 'EGP'] = 1; });
  var ks = Object.keys(curs); if (ks.length !== 1 || ks[0] === 'EGP') return;
  var c = ks[0];
  if (!(e.lines || []).every(function (l) { return Math.abs((+l.rate || 0) - defR[c]) < 1e-9; })) return;
  var r = _glFxRateAt_(c, e.date, fxMap).rate;
  if (r > 0 && r !== defR[c]) e.lines.forEach(function (l) { l.rate = r; });
}
// مقارنة المطلوب بالموجود وتطبيق الفرق — dry=true معاينة فقط
// ✅ (V4.222) بعد تفعيل قيود الرحلات: القيد الجديد يُسجَّل فوراً، أما تغيّر مصدر قيد قائم (أو حذفه) فلا يُكتب بصمت —
// يدخل «تغييرات بانتظار الاعتماد» (GL_Pending) حتى يعتمده صاحب صلاحية الاعتماد. opts.bypass: تطبيق مباشر (الاعتماد/إعادة البناء)،
// opts.onlyKeys: قصر التطبيق على مفاتيح بعينها (اعتماد صفوف محددة)
// (V4.223) مبلغ القيد بعملته الأصلية: مجموع المدين لكل عملة (بلا أسطر وسيط العملات) — «19,000 جنيه + 8,000 ريال»
function _glAmtTxt_(lines, accs) {
  accs = accs || _glAccounts_().map;
  var by = {}, lbl = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' };
  (lines || []).forEach(function (l) {
    var code = _glStr_(l.account != null ? l.account : l[4]), a = accs[code];
    if (a && a.kind === 'fx') return;
    var cur = _glStr_(l.currency != null ? l.currency : l[7]) || 'EGP', d = _glNum_(l.debit != null ? l.debit : l[5]);
    by[cur] = _glR2_((by[cur] || 0) + d);
  });
  return ['EGP', 'SAR', 'USD'].filter(function (c) { return by[c]; }).map(function (c) { return _glFmtN_(by[c]) + ' ' + lbl[c]; }).join(' + ') || '0';
}
function _glApprovalOn_() { var s = _glSettings_(); return s.trip_mode === 'نعم' && s.auto_approve !== 'لا'; }
function _glPendingRows_() { var o = {}; try { _glRowsW_('pending').forEach(function (r, i) { var k = _glStr_(r[0]); if (k) o[k] = { row: r, i: i }; }); } catch (e) {} return o; }
function _glAutoApply_(built, user, dry, opts) {
  opts = opts || {};
  var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
  var eRows = _glRows_('entries'), existing = {};
  eRows.forEach(function (r, i) { var k = _glStr_(r[6]); if (/^AUTO:/.test(k)) existing[k] = i; });
  var res = { created: 0, updated: 0, voided: 0, same: 0, pending: 0, blocked: [], errors: [], samples: { created: [], updated: [], voided: [] }, createdList: [] };
  var creates = [], updates = [], voids = [];
  var want = {}, fxMap = _glFxDailyMap_(), defR = _glRates_();
  var only = opts.onlyKeys || null, approval = !opts.bypass && _glApprovalOn_();
  if (Array.isArray(only)) { var ok_ = {}; only.forEach(function (k) { ok_[k] = 1; }); only = ok_; }
  var pend = approval ? _glPendingRows_() : {}, newPend = {}, oldLines = null, accM = _glAccounts_().map;
  var newDate = '', newType = '';
  var oldOf = function (id) { if (!oldLines) { oldLines = {}; _glRows_('lines').forEach(function (l) { (oldLines[_glStr_(l[0])] = oldLines[_glStr_(l[0])] || []).push(l); }); } return oldLines[id] || []; };
  var queue = function (k, ix, kind, newDesc, newBase, hash, newLines) {   // تغيير ينتظر الاعتماد (الرفض السابق لنفس البصمة يبقى مرفوضاً)
    var r = eRows[ix], old = pend[k];
    if (old && _glStr_(old.row[9]) === 'مرفوض' && _glStr_(old.row[7]) === hash) { newPend[k] = old.row; return; }
    if (!oldLines) { oldLines = {}; _glRows_('lines').forEach(function (l) { (oldLines[_glStr_(l[0])] = oldLines[_glStr_(l[0])] || []).push(l); }); }
    newPend[k] = [k, _glStr_(r[0]), kind, _glStr_(r[4]), _glNum_(r[8]), newDesc, newBase, hash, old && _glStr_(old.row[7]) === hash ? old.row[8] : _glNow_(), 'بانتظار', '', '',
      _glAmtTxt_(oldLines[_glStr_(r[0])] || [], accM), newLines ? _glAmtTxt_(newLines, accM) : '0',
      _glLinesDiff_(r, oldLines[_glStr_(r[0])] || [], newLines, accM, { date: newLines && newDate, type: newType })];
    res.pending++;
  };
  // (V4.223) تغيّر شكلي فقط (بيان سطر الوسيط بين العملات — مثلاً بعد دمج/إعادة تسمية حساب) يُحدَّث بلا انتظار اعتماد
  var looseH = function (date, type, desc, trip, co, ls) {
    // (V4.226) بيانات الأسطر نفسها (نص البيان فقط) شكلية أيضاً — الحساب والمبلغ والعملة والسعر والوسوم وبيان القيد تبقى جوهرية
    return _glHash_(JSON.stringify([date, type, desc, trip, co, ls.map(function (l) { return JSON.stringify([l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8]]); }).sort()]));   // ترتيب الأسطر شكلي أيضاً
  };
  var cosmetic = function (r, e, v) {
    if (!oldLines) { oldLines = {}; _glRows_('lines').forEach(function (l) { (oldLines[_glStr_(l[0])] = oldLines[_glStr_(l[0])] || []).push(l); }); }
    var num = function (x) { return x === '' || x == null ? 0 : _glNum_(x); };
    var o = (oldLines[_glStr_(r[0])] || []).map(function (l) { return [_glStr_(l[4]), num(l[5]), num(l[6]), _glStr_(l[7]), _glNum_(l[8]), _glStr_(l[11]), _glStr_(l[12]), _glStr_(l[13]), _glStr_(l[14]), _glStr_(l[15])]; });
    var n = v.lines.map(function (l) { return [l.account, l.debit, l.credit, l.currency, l.rate, l.trip, l.company, l.client, l.agent, l.desc]; });
    return o.length && looseH(_glDate_(r[2]), _glStr_(r[3]), _glStr_(r[4]), _glStr_(r[10]), _glStr_(r[11]), o) === looseH(v.date, v.type, e.desc, e.trip || '', e.company || '', n);
  };
  var keepErp = _glHbKeepMap_();
  built.entries.forEach(function (e) {
    if (only && !only[e.key]) { want[e.key] = 1; return; }
    if (want[e.key]) { res.errors.push({ key: e.key, msg: 'مفتاح مكرر' }); return; }
    want[e.key] = 1;
    if (keepErp[e.key]) { res.same++; return; }   // (V4.227) اعتُمد قيد الـ ERP بدلاً منه — لا يُنشأ ولا يُعدَّل
    _glAutoDailyRate_(e, fxMap, defR);
    var v;
    try { v = _glValidate_({ date: e.date, type: e.type || 'قيد تلقائي', desc: e.desc, trip: e.trip, company: e.company, lines: e.lines }, { allowBeforeStart: true, ignoreLock: true, allowSystem: true }); }
    catch (err) { res.errors.push({ key: e.key, date: e.date, desc: e.desc, msg: err.message }); return; }
    var hash = 'h:' + _glHash_(JSON.stringify([v.date, v.type, e.desc, e.trip || '', e.company || '', v.lines.map(function (l) { return [l.account, l.debit, l.credit, l.currency, l.rate, l.trip, l.company, l.client, l.agent, l.desc]; })]));
    var ix = existing[e.key];
    if (ix === undefined) {
      if (_glLocked_(v.date)) { res.blocked.push({ key: e.key, date: v.date, desc: e.desc, why: 'حدث جديد بفترة مقفلة' }); return; }
      creates.push({ e: e, v: v, hash: hash }); res.created++;
      if (res.samples.created.length < 30) res.samples.created.push({ date: v.date, desc: e.desc, base: v.totalBase, amt: _glAmtTxt_(v.lines, accM) });
      return;
    }
    var r = eRows[ix];
    if (_glStr_(r[5]) === GL_ST_POSTED_ && _glStr_(r[9]) === hash) { res.same++; return; }
    if (_glLocked_(r[2]) || _glLocked_(v.date)) { res.blocked.push({ key: e.key, date: v.date, desc: e.desc, why: 'تغيّر مصدره بعد إقفال الفترة' }); return; }
    if (approval && _glStr_(r[5]) === GL_ST_POSTED_ && !cosmetic(r, e, v)) { newDate = v.date; newType = v.type; queue(e.key, ix, 'تعديل', e.desc, v.totalBase, hash, v.lines); return; }
    updates.push({ ix: ix, e: e, v: v, hash: hash }); res.updated++;
    if (res.samples.updated.length < 30) res.samples.updated.push({ id: _glStr_(r[0]), date: v.date, desc: e.desc, base: v.totalBase, oldBase: _glNum_(r[8]), amt: _glAmtTxt_(v.lines, accM), oldAmt: _glAmtTxt_(oldOf(_glStr_(r[0])), accM) });
  });
  Object.keys(existing).forEach(function (k) {
    if (want[k] || (only && !only[k])) return;
    var r = eRows[existing[k]];
    if (_glStr_(r[5]) === GL_ST_VOID_) return;
    if (_glLocked_(r[2])) { res.blocked.push({ key: k, date: _glDate_(r[2]), desc: _glStr_(r[4]), why: 'حُذف مصدره بعد إقفال الفترة' }); return; }
    if (approval) { queue(k, existing[k], 'إلغاء', 'حُذف مصدره من شاشات البرنامج', 0, 'void'); return; }
    voids.push(existing[k]); res.voided++;
    if (res.samples.voided.length < 30) res.samples.voided.push({ id: _glStr_(r[0]), date: _glDate_(r[2]), desc: _glStr_(r[4]), base: _glNum_(r[8]), amt: _glAmtTxt_(oldOf(_glStr_(r[0])), accM) });
  });
  // قائمة الاعتماد: تُستبدل كاملة بما يحتاج اعتماداً الآن (ما عاد مصدره كما كان يخرج منها تلقائياً)
  if (!dry && approval && !only) _glPendingWrite_(newPend);
  if (!dry && only) _glPendingDrop_(Object.keys(only));
  if (dry || (!creates.length && !updates.length && !voids.length)) return res;
  // الكتابة: رؤوس القيود بمصفوفة واحدة، وأسطر القيود المتغيّرة تُستبدل بإعادة كتابة الشيت كاملاً مرة واحدة
  var now = _glNow_(), replaced = {}, voidIds = {};
  updates.forEach(function (u) {
    var r = eRows[u.ix], id = _glStr_(r[0]);
    var w = _glWriteEntry_(u.v, { id: id, seq: r[1], status: GL_ST_POSTED_, sourceKey: u.e.key, desc: u.e.desc, ref: u.hash, trip: u.e.trip, company: u.e.company,
      createdBy: r[12], createdAt: r[13], row: 1 }, user);
    w.eRow[14] = r[14] || user; w.eRow[15] = r[15] || now;
    eRows[u.ix] = w.eRow; replaced[id] = w.lRows;
  });
  voids.forEach(function (ix) { var r = eRows[ix]; r[5] = GL_ST_VOID_; r[16] = user; r[17] = now; r[18] = 'حُذف مصدره من شاشات البرنامج'; voidIds[_glStr_(r[0])] = 1; });
  var newE = [], newL = [];
  if (creates.length) {
    var first = _glNextEntrySeq_(creates.length);
    creates.forEach(function (c, i) {
      var id = _glEntryId_(first + i);
      var w = _glWriteEntry_(c.v, { id: id, seq: first + i, status: GL_ST_POSTED_, sourceKey: c.e.key, desc: c.e.desc, ref: c.hash, trip: c.e.trip, company: c.e.company }, user);
      newE.push(w.eRow); newL = newL.concat(w.lRows);
      res.createdList.push({ id: id, desc: c.e.desc, base: c.v.totalBase, src: c.e.src || '', key: c.e.key });
    });
  }
  if (updates.length || voids.length) eSh.getRange(2, 1, eRows.length, GL_SHEETS_.entries.headers.length).setValues(eRows);
  if (newE.length) eSh.getRange(eSh.getLastRow() + 1, 1, newE.length, GL_SHEETS_.entries.headers.length).setValues(newE);
  if (updates.length || voids.length) {
    var lRows = _glRows_('lines'), oldLen = lRows.length, kept = [];
    lRows.forEach(function (r) {
      var id = _glStr_(r[0]);
      if (replaced[id]) return;
      if (voidIds[id]) r[3] = GL_ST_VOID_;
      kept.push(r);
    });
    Object.keys(replaced).forEach(function (id) { kept = kept.concat(replaced[id]); });
    kept = kept.concat(newL);
    if (kept.length) lSh.getRange(2, 1, kept.length, GL_SHEETS_.lines.headers.length).setValues(kept);
    if (kept.length < oldLen) lSh.getRange(2 + kept.length, 1, oldLen - kept.length, GL_SHEETS_.lines.headers.length).clearContent();
  } else if (newL.length) {
    lSh.getRange(lSh.getLastRow() + 1, 1, newL.length, GL_SHEETS_.lines.headers.length).setValues(newL);
  }
  return res;
}
function _glPendingWrite_(map) {
  var sh = _glSheet_('pending'), W = GL_SHEETS_.pending.headers.length, last = sh.getLastRow();
  var rows = Object.keys(map).map(function (k) { var r = map[k].slice(0, W); while (r.length < W) r.push(''); return r; });
  try { if (sh.getLastColumn() < W) sh.getRange(1, 1, 1, W).setValues([GL_SHEETS_.pending.headers]); } catch (e) {}
  if (last >= 2) sh.getRange(2, 1, last - 1, W).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, W).setValues(rows);
  try { CacheService.getScriptCache().put('gl_pend_n', String(rows.filter(function (r) { return _glStr_(r[9]) !== 'مرفوض'; }).length), 21600); } catch (e) {}
}
function _glPendingDrop_(keys) {
  var set = {}; keys.forEach(function (k) { set[k] = 1; });
  var cur = _glPendingRows_(), keep = {};
  Object.keys(cur).forEach(function (k) { if (!set[k]) keep[k] = cur[k].row; });
  _glPendingWrite_(keep);
}
// سجل القيود التلقائية الجديدة/المعتمدة (آخر 300) — للتنبيه اللحظي لمستخدمي الحسابات
function _glAutoLogAdd_(list, what) {
  if (!list || !list.length) return;
  try {
    var sh = _glSheet_('autolog'), now = _glNow_();
    try { CacheService.getScriptCache().put('gl_autolog_at', now, 21600); } catch (e1) {}
    sh.getRange(sh.getLastRow() + 1, 1, list.length, 6).setValues(list.map(function (x) { return [now, x.id, x.desc, x.base, x.src || '', what]; }));
    var last = sh.getLastRow(); if (last > 400) sh.deleteRows(2, last - 301);
  } catch (e) {}
}
function _glAutoRun_(user, dry, opts) {
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
  var built = _glAutoBuild_(user, !dry);
  var newParties = built.party.pendingCount();
  var newNames = (built.roles._new || []).concat(built.party.made());
  if (!dry) built.party.flush();
  var res = _glAutoApply_(built, user, dry, opts);
  if (!dry) _glAutoLogAdd_(res.createdList, 'جديد');
  res.newAccounts = newParties + (built.roles._new || []).length; res.newAccountNames = newNames.slice(0, 300); res.preCount = built.preCount; res.warnings = built.warnings;
  res.total = built.entries.length;
  res.bySrc = {}; built.entries.forEach(function (e) { res.bySrc[e.src] = (res.bySrc[e.src] || 0) + 1; });
  res.blocked = res.blocked.slice(0, 200); res.errors = res.errors.slice(0, 200);
  return res;
}
function glAutoPreview(authToken) {
  _glPerm_(authToken, 'view');
  var r = _glAutoRun_('', true);
  r.success = true; r.last = _glAutoLast_(); r.cron = _glSettings_().auto_cron === 'نعم'; r.autoOpen = _glSettings_().auto_open !== 'لا';
  _GL_ACC_MEMO_ = null;
  return r;
}
function glAutoSync(authToken) {
  var session = _glAdminPerm_(authToken);
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    var r = _glAutoRun_(session.username, false);
    _glAutoSaveLast_(r, session.username);
    if (r.created || r.updated || r.voided) logChange_(session.username, 'مزامنة القيود التلقائية', 'GL:auto', '-', '-',
      'جديد ' + r.created + '، معدّل ' + r.updated + '، ملغى ' + r.voided + (r.blocked.length ? '، محجوز بفترة مقفلة ' + r.blocked.length : ''));
    r.success = true; r.last = _glAutoLast_();
    return r;
  } finally { lock.releaseLock(); }
}
// مُشغِّل مجدول (كل ساعة) — يُفعَّل من تبويب القيود التلقائية؛ يعمل بصلاحية صاحب السكربت
function glAutoSyncCron() {
  if (!_glSSId_() || _glSettings_().auto_cron !== 'نعم') return;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return;
  try { var r = _glAutoRun_('مزامنة مجدولة', false); _glAutoSaveLast_(r, 'مزامنة مجدولة'); }
  catch (e) { try { _glSetSetting_('auto_last_error', _glNow_() + ' — ' + e.message); } catch (e2) {} }
  try { _glCsAutoAll_(); } catch (e3) {}   // (V4.219) شيتات العهد المربوطة بخيار «تلقائي»
  lock.releaseLock();
}
function _glAutoSaveLast_(r, user) {
  _glSetSetting_('auto_last', JSON.stringify({ at: _glNow_(), by: user, created: r.created, updated: r.updated, voided: r.voided, same: r.same,
    blocked: r.blocked.length, errors: r.errors.length, newAccounts: r.newAccounts }));
  _glSetSetting_('auto_last_error', '');
}
function _glAutoLast_() { var s = _glSettings_(); var o = null; try { o = JSON.parse(s.auto_last || 'null'); } catch (e) {} if (o) o.error = s.auto_last_error || ''; return o; }
function glAutoSettings(authToken, o) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('إعدادات القيود التلقائية للمدير فقط');
  o = o || {};
  if (o.autoOpen !== undefined) _glSetSetting_('auto_open', o.autoOpen ? 'نعم' : 'لا');
  if (o.cron !== undefined) {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'glAutoSyncCron') ScriptApp.deleteTrigger(t); });
    if (o.cron) ScriptApp.newTrigger('glAutoSyncCron').timeBased().everyHours(1).create();
    _glSetSetting_('auto_cron', o.cron ? 'نعم' : 'لا');
  }
  logChange_(session.username, 'إعدادات القيود التلقائية', 'GL:auto', '-', '-', JSON.stringify(o));
  return { success: true };
}
/* 📎 (V4.219) مرفقات القيود والسندات (مثل برنامج الـ ERP): الملف يُحفظ بمجلد «GLAttachments» بالدرايف، وسطر بشيت
   GL_Attachments يربطه برقم القيد. الحذف يرسل الملف لسلة المهملات ويحذف سطره. */
function glAttachUpload(authToken, entryId, name, mime, b64) {
  var session = _glPerm_(authToken, 'add');
  entryId = _glStr_(entryId); if (!entryId || !_glFindEntry_(entryId)) throw new Error('القيد غير موجود');
  if (!b64) throw new Error('الملف فارغ');
  var bytes = Utilities.base64Decode(String(b64).replace(/^data:[^,]*,/, ''));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('حجم الملف أكبر من 15 ميجا');
  var file = getDriveFolder_('GLATT').createFile(Utilities.newBlob(bytes, _glStr_(mime) || 'application/octet-stream', entryId + ' — ' + (_glStr_(name) || 'مستند')));
  var sh = _glSheet_('attach');
  sh.appendRow([entryId, file.getId(), _glStr_(name) || file.getName(), _glStr_(mime), file.getUrl(), session.username, _glNow_()]);
  logChange_(session.username, 'إرفاق مستند بقيد', 'GL:' + entryId, 'مرفق', '-', _glStr_(name));
  return { success: true, file: { id: file.getId(), name: _glStr_(name), url: file.getUrl(), mime: _glStr_(mime) } };
}
function _glAttachMap_() {
  var out = {};
  try { _glRows_('attach').forEach(function (r) { var id = _glStr_(r[0]); if (id) (out[id] = out[id] || []).push({ id: _glStr_(r[1]), name: _glStr_(r[2]), mime: _glStr_(r[3]), url: _glStr_(r[4]), by: _glStr_(r[5]), at: _glStr_(r[6]) }); }); } catch (e) {}
  return out;
}
function glAttachList(authToken, entryId) { _glPerm_(authToken, 'view'); return { success: true, files: _glAttachMap_()[_glStr_(entryId)] || [] }; }
function glAttachDelete(authToken, fileId) {
  var session = _glPerm_(authToken, 'edit');
  var sh = _glSheet_('attach'), rows = _glRows_('attach'), hit = -1, ent = '';
  rows.forEach(function (r, i) { if (_glStr_(r[1]) === _glStr_(fileId)) { hit = i; ent = _glStr_(r[0]); } });
  if (hit < 0) throw new Error('المرفق غير موجود');
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
  sh.deleteRow(hit + 2);
  logChange_(session.username, 'حذف مرفق قيد', 'GL:' + ent, 'مرفق', _glStr_(rows[hit][2]), '-');
  return { success: true };
}
// شعار الشركة لرأس الكشوف المطبوعة (نفس شعار السندات)
function glVchLogo(authToken) {
  _glPerm_(authToken, 'view');
  var b = _glVchBrand_(), logo = '';
  try { logo = typeof getCompanyLogoBase64 === 'function' ? getCompanyLogoBase64(b.vch_logo_company || '') : ''; } catch (e) {}
  return { success: true, logo: logo };
}


/* ============================================================================
   🧳 (V4.222) المرحلة الثالثة: قيود الرحلات + الاعتماد + المزامنة الحية + الدفعات بالاتجاهين + إعادة البناء
   ============================================================================ */
// 🔔 قائمة التغييرات بانتظار الاعتماد
// 🔍 (V4.226) ماذا تغيّر فعلاً بالقيد (سطراً بسطر) — يظهر بشاشة الاعتماد حين يتطابق البيان والمبلغ ظاهرياً
function _glLinesDiff_(eRow, oldRows, newLines, accM, hdr) {
  if (!newLines) return 'إلغاء القيد (المصدر حُذف)';
  var nm = function (c) { var a = accM[c]; return a ? a.name : c; }, cl = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' };
  var num = function (x) { return x === '' || x == null ? 0 : _glNum_(x); };
  var O = oldRows.map(function (l) { return { acc: _glStr_(l[4]), d: num(l[5]), c: num(l[6]), cur: _glStr_(l[7]), rate: _glNum_(l[8]), trip: _glStr_(l[11]), co: _glStr_(l[12]), client: _glStr_(l[13]), agent: _glStr_(l[14]), desc: _glStr_(l[15]) }; });
  var N = newLines.map(function (l) { return { acc: l.account, d: l.debit || 0, c: l.credit || 0, cur: l.currency, rate: l.rate, trip: l.trip || '', co: l.company || '', client: l.client || '', agent: l.agent || '', desc: l.desc || '' }; });
  var isFx = function (x) { return (accM[x.acc] || {}).kind === 'fx'; };
  O = O.filter(function (x) { return !isFx(x); }); N = N.filter(function (x) { return !isFx(x); });
  var amtTxt = function (x) { return (x.d ? 'مدين ' : 'دائن ') + (Math.round((x.d || x.c) * 100) / 100).toLocaleString('en-US') + ' ' + (cl[x.cur] || x.cur); };
  var out = [];
  if (hdr && hdr.date && _glDate_(eRow[2]) !== hdr.date) out.push('التاريخ: ' + _glDate_(eRow[2]) + ' ← ' + hdr.date);
  var key = function (x) { return x.acc + '|' + x.cur + '|' + (x.d ? 'd' : 'c') + '|' + Math.round((x.d || x.c) * 100); };
  var usedN = {};
  var pairs = [];
  O.forEach(function (o, i) {
    var j = -1; N.forEach(function (n, k) { if (j < 0 && !usedN[k] && key(n) === key(o)) j = k; });
    if (j < 0) N.forEach(function (n, k) { if (j < 0 && !usedN[k] && n.acc === o.acc && n.cur === o.cur && !!n.d === !!o.d) j = k; });
    if (j >= 0) { usedN[j] = 1; pairs.push([o, N[j]]); } else out.push('− حُذف سطر: ' + nm(o.acc) + ' ' + amtTxt(o));
  });
  N.forEach(function (n, k) { if (!usedN[k]) out.push('+ سطر جديد: ' + nm(n.acc) + ' ' + amtTxt(n)); });
  pairs.forEach(function (p) {
    var o = p[0], n = p[1], a = nm(o.acc);
    if (key(o) !== key(n)) out.push(a + ': ' + amtTxt(o) + ' ← ' + amtTxt(n));
    if (o.cur !== 'EGP' && Math.abs((o.rate || 0) - (n.rate || 0)) >= 0.0001) out.push(a + ' — سعر الصرف: ' + o.rate + ' ← ' + n.rate);
    [['trip', 'الرحلة'], ['client', 'العميل'], ['agent', 'الوكيل/المورد'], ['co', 'الشركة']].forEach(function (f) {
      if (_glStr_(o[f[0]]) !== _glStr_(n[f[0]])) out.push(a + ' — ' + f[1] + ': «' + (o[f[0]] || '—') + '» ← «' + (n[f[0]] || '—') + '»');
    });
    if (key(o) === key(n) && _glCleanDesc_(o.desc) !== _glCleanDesc_(n.desc)) out.push(a + ' — بيان السطر تغيّر');
  });
  if (!out.length) out.push('تغيير بترتيب الأسطر أو بأسطر الوسيط فقط');
  return out.slice(0, 10).join('\n');
}
function glPendingList(authToken) {
  var session = _glPerm_(authToken, 'view');
  var rows = [];
  try { _glRowsW_('pending').forEach(function (r) { if (_glStr_(r[0])) rows.push({ key: _glStr_(r[0]), id: _glStr_(r[1]), kind: _glStr_(r[2]), oldDesc: _glStr_(r[3]), oldBase: _glNum_(r[4]),
    newDesc: _glStr_(r[5]), newBase: _glNum_(r[6]), at: _glStr_(r[8]), status: _glStr_(r[9]) || 'بانتظار', by: _glStr_(r[10]), note: _glStr_(r[11]), oldAmt: _glStr_(r[12]), newAmt: _glStr_(r[13]), diff: _glStr_(r[14]) }); }); } catch (e) {}
  return { success: true, rows: rows, canApprove: _glCanApprove_(session) };
}
function _glPendingCount_() {
  try { var c = CacheService.getScriptCache().get('gl_pend_n'); if (c !== null && c !== undefined && c !== '') return +c || 0; } catch (e0) {}
  var n = 0; try { _glRows_('pending').forEach(function (r) { if (_glStr_(r[0]) && _glStr_(r[9]) !== 'مرفوض') n++; }); } catch (e) {} return n; }
// ✅ اعتماد تغييرات محددة: تُطبَّق على قيودها (تعديل/إلغاء) وتخرج من القائمة
function glPendingApprove(authToken, keys) {
  var session = requireAuth_(authToken);
  if (!_glCanApprove_(session)) throw new Error('اعتماد تغييرات القيود يحتاج صلاحية «✅ اعتماد تغييرات القيود»');
  var only = {}; (keys || []).forEach(function (k) { if (_glStr_(k)) only[_glStr_(k)] = 1; });
  if (!Object.keys(only).length) throw new Error('اختر تغييراً واحداً على الأقل');
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    var r = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: only });
    _glAutoLogAdd_(r.createdList, 'جديد');
    logChange_(session.username, 'اعتماد تغيير قيود تلقائية', 'GL:approve', 'القيود', Object.keys(only).length + ' تغيير', 'معدّل ' + r.updated + '، ملغى ' + r.voided + (r.blocked.length ? '، محجوز بفترة مقفلة ' + r.blocked.length : ''));
    return { success: true, updated: r.updated, voided: r.voided, created: r.created, blocked: r.blocked, pending: _glPendingCount_() };
  } finally { lock.releaseLock(); }
}
// ⛔ رفض: يبقى القيد كما هو، ولا يعود التنبيه لنفس التغيير (يعود لو تغيّر المصدر مرة أخرى)
function glPendingReject(authToken, keys, note) {
  var session = requireAuth_(authToken);
  if (!_glCanApprove_(session)) throw new Error('رفض تغييرات القيود يحتاج صلاحية «✅ اعتماد تغييرات القيود»');
  var set = {}; (keys || []).forEach(function (k) { set[_glStr_(k)] = 1; });
  var cur = _glPendingRows_(), keep = {};
  Object.keys(cur).forEach(function (k) { var r = cur[k].row; if (set[k]) { r[9] = 'مرفوض'; r[10] = session.username; r[11] = _glStr_(note) || _glNow_(); } keep[k] = r; });
  _glPendingWrite_(keep);
  logChange_(session.username, 'رفض تغيير قيود تلقائية', 'GL:approve', 'القيود', Object.keys(set).length + ' تغيير', _glStr_(note) || '-');
  return { success: true, pending: _glPendingCount_() };
}
// ⚡ المزامنة الحية: أي حفظ بشاشات البرنامج يضع علامة «تغيّر» (logChange_) وأي متصفح مفتوح يستدعي هذه الدالة
// كل دقيقة/بعد الحفظ ⇒ تُسجَّل القيود الجديدة فوراً وتدخل التعديلات قائمة الاعتماد. بلا تغيير = رد سريع بلا قراءة للدفتر
function glAutoKick(authToken, since) {
  var session = requireAuth_(authToken);
  var out = { success: true, ran: false };
  if (!_glSSId_() || !_glTripMode_()) return out;
  var canGl = _sessionHasPerm_(session, 'gl.view');
  var cache = CacheService.getScriptCache(), dirty = cache.get('gl_dirty');
  if (dirty && !cache.get('gl_live_busy')) {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(500)) {
      try {
        cache.put('gl_live_busy', '1', 120); cache.remove('gl_dirty');
        var r = _glAutoRun_('مزامنة لحظية (' + session.username + ')', false);
        _glAutoSaveLast_(r, 'مزامنة لحظية');
        if (r.created || r.updated || r.voided) logChange_(session.username, 'مزامنة القيود التلقائية', 'GL:auto', 'لحظية', '-', 'جديد ' + r.created + '، بانتظار الاعتماد ' + r.pending);
        out.ran = true; out.created = r.created; out.errors = r.errors.length;
      } catch (e) { out.error = e.message; try { _glSetSetting_('auto_last_error', _glNow_() + ' — ' + e.message); } catch (e2) {} }
      finally { cache.remove('gl_live_busy'); lock.releaseLock(); }
    }
  }
  if (canGl) {
    out.pending = _glPendingCount_();
    out.recent = [];
    var sk = _glStr_(since), lastAt = null;
    try { lastAt = CacheService.getScriptCache().get('gl_autolog_at'); } catch (e0) {}
    if (sk && (!lastAt || _glAutoTsKey_(lastAt) > _glAutoTsKey_(sk))) try { _glRows_('autolog').forEach(function (r) { var at = _glStr_(r[0]); if (_glAutoTsKey_(at) > _glAutoTsKey_(sk)) out.recent.push({ at: at, id: _glStr_(r[1]), desc: _glStr_(r[2]), base: _glNum_(r[3]), src: _glStr_(r[4]), what: _glStr_(r[5]) }); }); } catch (e) {}
    out.recent = out.recent.slice(-20);
  }
  out.now = _glNow_();
  return out;
}
function _glAutoTsKey_(s) { var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/); return m ? m[3] + m[2] + m[1] + m[4] + m[5] + m[6] : ''; }

// 💵 توجيه دفعات العملاء: الدفعات المسجلة بشاشة حسابات العملاء تذهب لـ«نقدية تحت التسوية» حتى يُحدَّد حسابها النقدي
function glCpList(authToken) {
  _glPerm_(authToken, 'view');
  var roles = _glAutoRoles_('', true), cash = roles.cash, dir = _glCpDirMap_(), accs = _glAccounts_().map, out = [];
  var ents = _glRows_('entries'), lines = {};
  _glRows_('lines').forEach(function (l) { (lines[_glStr_(l[0])] = lines[_glStr_(l[0])] || []).push(l); });
  ents.forEach(function (r) {
    var k = _glStr_(r[6]); if (!/^AUTO:CP:/.test(k) || _glStr_(r[5]) === GL_ST_VOID_) return;
    var payId = k.slice(8), want = dir[payId] || '';
    var ls = lines[_glStr_(r[0])] || [], cl = ls.filter(function (l) { return _glStr_(l[4]) !== cash && accs[_glStr_(l[4])] && accs[_glStr_(l[4])].kind === 'client'; })[0];
    // (V4.229) سطر الطرف المقابل = الحساب الموجَّه إليه صراحةً، وإلا الخزينة/البنك/العهدة/تحت التسوية، وإلا أي طرف غير العميل
    var cashL = (want ? ls.filter(function (l) { return _glStr_(l[4]) === want; })[0] : null)
      || ls.filter(function (l) { var a = accs[_glStr_(l[4])]; return _glStr_(l[4]) === cash || (a && /^(safe|bank|custody)$/.test(a.kind)); })[0]
      || ls.filter(function (l) { var a = accs[_glStr_(l[4])]; return !(a && a.kind === 'client'); })[0];
    if (!cashL) return;   // تحويل عملة (طرفاه عميل) لا يُوجَّه
    out.push({ payId: payId, entryId: _glStr_(r[0]), date: _glDate_(r[2]), desc: _glStr_(r[4]), client: cl ? _glStr_(cl[13]) || (accs[_glStr_(cl[4])] || {}).name : '',
      amount: _glNum_(cashL[5]) || -_glNum_(cashL[6]), currency: _glStr_(cashL[7]), cash: _glStr_(cashL[4]), directed: !!want, unsettled: _glStr_(cashL[4]) === cash });
  });
  out.sort(function (a, b) { return _glDKey_(b.date) < _glDKey_(a.date) ? -1 : 1; });
  return { success: true, rows: out, cashRole: cash };
}
// (V4.229) توجيه صريح: أي حساب ورقي غير تجميعي (وليس النقديات فقط) — يُترك للبناء تحديد اتجاه القيد
function glCpDirect(authToken, payIds, code) {
  var session = _glPerm_(authToken, 'edit');
  code = _glStr_(code); var a = _glAccounts_().map[code];
  if (!a || a.isGroup) throw new Error('اختر حساباً ورقياً صالحاً');
  var ids = (payIds || []).map(_glStr_).filter(String); if (!ids.length) throw new Error('اختر دفعة واحدة على الأقل');
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    var rows = _glRows_('cpdir'), at = {}, now = _glNow_();
    rows.forEach(function (r, i) { at[_glStr_(r[0])] = i; });
    ids.forEach(function (id) {
      if (at[id] !== undefined) rows[at[id]] = [id, code, session.username, now];
      else rows.push([id, code, session.username, now]);
    });
    _glCpDirWrite_(rows);
    var only = {}; ids.forEach(function (id) { only['AUTO:CP:' + id] = 1; });
    var r = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: only });   // توجيه صريح من المستخدم ⇒ يُطبَّق مباشرة
    logChange_(session.username, 'توجيه دفعات عملاء لحساب', 'GL:' + code, a.name, ids.length + ' دفعة', 'معدّل ' + r.updated);
    return { success: true, updated: r.updated };
  } finally { lock.releaseLock(); }
}
// إعادة كتابة شيت توجيه الدفعات كاملاً (يسمح بحذف صفوف عند إلغاء التوجيه)
function _glCpDirWrite_(rows) {
  var sh = _glSheet_('cpdir'), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 4).clearContent();
  if (rows && rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
}
function _glCpPending_() { try { return _glTripMode_() ? _glPendingCount_() : 0; } catch (e) { return 0; } }
// (V4.229) توجيه مجمّع لكل دفعة على حدة لأي حساب: items=[{payId, code}] — code فارغ = إلغاء التوجيه (يعود لنقدية تحت التسوية)
function glCpApply(authToken, items) {
  var session = _glPerm_(authToken, 'edit');
  items = (items || []).map(function (it) { return { payId: _glStr_(it && it.payId), code: _glStr_(it && it.code) }; }).filter(function (it) { return it.payId; });
  if (!items.length) throw new Error('اختر دفعة واحدة على الأقل');
  var accMap = _glAccounts_().map;
  items.forEach(function (it) { if (it.code) { var a = accMap[it.code]; if (!a || a.isGroup) throw new Error('حساب غير صالح: ' + it.code); } });
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    var rows = _glRows_('cpdir'), at = {}, now = _glNow_(), setN = 0, clrN = 0;
    rows.forEach(function (r, i) { at[_glStr_(r[0])] = i; });
    items.forEach(function (it) {
      if (it.code) {
        if (at[it.payId] !== undefined) rows[at[it.payId]] = [it.payId, it.code, session.username, now];
        else { rows.push([it.payId, it.code, session.username, now]); at[it.payId] = rows.length - 1; }
        setN++;
      } else if (at[it.payId] !== undefined) { rows[at[it.payId]] = null; clrN++; }
    });
    rows = rows.filter(function (r) { return r; });
    _glCpDirWrite_(rows);
    var only = {}; items.forEach(function (it) { only['AUTO:CP:' + it.payId] = 1; });
    var r = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: only });
    logChange_(session.username, 'توجيه دفعات عملاء (مجمّع)', 'GL', '', items.length + ' دفعة', 'موجَّه ' + setN + ' · مُلغى توجيه ' + clrN + ' · معدّل ' + r.updated);
    return { success: true, updated: r.updated, directed: setN, cleared: clrN, rows: glCpList(authToken).rows, balances: _glBalances_(null), pendingCount: _glCpPending_() };
  } finally { lock.releaseLock(); }
}
// (V4.229) حذف دفعات عملاء (قد تكون مكررة) من شاشة التوجيه — يُحذف السجل بشاشة حسابات العملاء ويُلغى قيدها التلقائي
function glCpDelete(authToken, payIds) {
  var session = _glPerm_(authToken, 'edit');
  var ids = (payIds || []).map(_glStr_).filter(String); if (!ids.length) throw new Error('اختر دفعة واحدة على الأقل');
  var idset = {}; ids.forEach(function (id) { idset[id] = 1; });
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), last = sh.getLastRow(), del = 0;
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, 9).getValues();
      for (var i = vals.length - 1; i >= 0; i--) {
        if (!idset[String(vals[i][0])]) continue;
        logChange_(session.username, 'حذف ' + (String(vals[i][3]) === 'تحويل' ? 'تحويل عملة' : 'دفعة حساب') + ' (شاشة التوجيه)', String(vals[i][1]), String(vals[i][2]), vals[i][5] + ' ' + vals[i][6], '-');
        var marker = _accCfMarkerOf_(vals[i][8]);
        sh.deleteRow(i + 2);
        if (marker) try { _accCfFindAndDelete_(marker, ACC_PAY_SHEET, String(vals[i][0])); } catch (e) {}
        del++;
      }
    }
    var rows = _glRows_('cpdir').filter(function (r) { return !idset[_glStr_(r[0])]; });
    _glCpDirWrite_(rows);
    var only = {}; ids.forEach(function (id) { only['AUTO:CP:' + id] = 1; });
    var r = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: only });   // الدفعة اختفت من البناء ⇒ يُلغى قيدها
    return { success: true, deleted: del, voided: r.voided, rows: glCpList(authToken).rows, balances: _glBalances_(null), pendingCount: _glCpPending_() };
  } finally { lock.releaseLock(); }
}

// 🔁 إيصال استلام/صرف على حساب عميل بالحسابات العامة ⇒ دفعة بشاشة حسابات العملاء (عامة، أو على الرحلة لو حُددت بالإيصال
// وللعميل بنود بها) بعلامة مخفية ⟦src:gl-رقم القيد⟧ — تُحدَّث مع تعديل الإيصال وتُحذف بإلغائه/حذفه، ولا تُقيَّد مرة ثانية
function _glSyncVoucherPays_(entryId, user) {
  try {
    entryId = _glStr_(entryId); if (!entryId) return;
    var tag = '⟦src:gl-' + entryId + '⟧', want = [], f = _glFindEntry_(entryId);
    if (f && _glStr_(f.r[5]) === GL_ST_POSTED_ && (_glStr_(f.r[3]) === 'سند قبض' || _glStr_(f.r[3]) === 'سند صرف')) {
      var e = _glEntryFull_(entryId), accs = _glAccounts_().map, isRec = e.type === 'سند قبض';
      var tripsOf = {};
      try { var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS); if (iSh.getLastRow() > 1) iSh.getRange(2, 2, iSh.getLastRow() - 1, 2).getValues().forEach(function (r) { tripsOf[_glStr_(r[0]) + '|' + _glStr_(r[1])] = 1; }); } catch (e1) {}
      e.lines.forEach(function (l) {
        var a = accs[l.account]; if (!a || a.kind !== 'client' || !a.link) return;
        var amt = _glR2_(isRec ? (l.credit - l.debit) : -(l.debit - l.credit)); if (!amt) return;
        var trip = _glStr_(l.trip || e.trip); if (!trip || !tripsOf[a.link + '|' + trip]) trip = 'عام';
        want.push([a.link, trip, 'دفعة', e.date, amt, l.currency === 'SAR' ? 'SAR' : 'EGP', '', (e.voucherNo ? 'إيصال ' + e.voucherNo + ' — ' : '') + (l.desc || e.desc || '') + ' ' + tag]);
      });
    }
    var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), last = sh.getLastRow(), rowsIdx = [];
    if (last >= 2) sh.getRange(2, 9, last - 1, 1).getValues().forEach(function (r, i) { if (String(r[0]).indexOf(tag) >= 0) rowsIdx.push(i + 2); });
    // تحديث في المكان لنفس العدد (يحافظ على المعرّف والتخصيص)، والزائد يُضاف والناقص يُحذف
    var ids = [];
    rowsIdx.forEach(function (rw, k) {
      if (k < want.length) { var w = want[k]; sh.getRange(rw, 2, 1, 8).setValues([[w[0], w[1] === 'عام' ? sh.getRange(rw, 3).getValue() || 'عام' : w[1], w[2], w[3], w[4], w[5], w[6], w[7]]]); }
    });
    for (var k = rowsIdx.length - 1; k >= want.length; k--) sh.deleteRow(rowsIdx[k]);
    for (var j = rowsIdx.length; j < want.length; j++) {
      var w = want[j];
      sh.appendRow([_accId_('P'), w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], user || 'الحسابات العامة', new Date(), _accNextPaySerial_()]);
    }
  } catch (err) { Logger.log('voucher→payments ' + entryId + ': ' + err.message); }
}

// 📘 رقم قيد الرحلة لكل رحلة بحساب العميل (لشاشة حسابات العملاء)
function _glClientLinks_(client) {
  if (!_glSSId_() || !_glTripMode_()) return null;
  client = _glStr_(client); var pre = 'AUTO:TRIP:' + client + '|', out = {}, pend = _glPendingRows_();
  _glRows_('entries').forEach(function (r) {
    var k = _glStr_(r[6]); if (k.indexOf(pre) !== 0 || _glStr_(r[5]) === GL_ST_VOID_) return;
    out[k.slice(pre.length)] = { id: _glStr_(r[0]), pending: !!(pend[k] && _glStr_(pend[k].row[9]) !== 'مرفوض') };
  });
  return out;
}

// 🧹 إعادة بناء قيود الرحلات (للمدير): نسخة احتياطية ⇒ حذف القيود التلقائية القديمة للرحلات ⇒ تحويل 4101 لمجموعة
// «إيرادات رحلات العمرة» ⇒ تفعيل الوضع الجديد ⇒ تسجيل كل القيود بالشكل الجديد مباشرة
var GL_TRIP_REBUILD_RX_ = /^AUTO:(CI|VZ|TR|MF|TRIP):|^AUTO:OPEN$/;
function glTripRebuild(authToken, dry) {
  var session = _glAdminPerm_(authToken);
  var lock = LockService.getScriptLock(); lock.waitLock(120000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var eRows = _glRows_('entries'), hits = [], by = {};
    eRows.forEach(function (r, i) {
      var k = _glStr_(r[6]); if (!GL_TRIP_REBUILD_RX_.test(k)) return;
      var p = (k.match(/^AUTO:([A-Z]+)/) || [])[1]; by[p] = by[p] || { n: 0, base: 0 }; by[p].n++; by[p].base = _glR2_(by[p].base + _glNum_(r[8]));
      hits.push({ id: _glStr_(r[0]), row: i + 2, r: r, locked: _glLocked_(r[2]) });
    });
    var accs = _glAccounts_(), g = accs.map[GL_TRIP_GROUP_], gLines = 0;
    if (g && !g.isGroup) _glRows_('lines').forEach(function (l) { if (_glStr_(l[4]) === GL_TRIP_GROUP_) gLines++; });
    var info = { success: true, dry: !!dry, total: hits.length, byPrefix: by, locked: hits.filter(function (h) { return h.locked; }).length,
      group: !g ? 'absent' : (g.isGroup ? 'group' : 'leaf'), groupName: g ? g.name : '', groupLines: gLines, tripMode: _glTripMode_() };
    if (dry) return info;
    if (info.locked) throw new Error(info.locked + ' قيداً في فترة مقفلة — افتح الفترة أولاً ثم أعد المحاولة');
    // 1) نسخة احتياطية
    var ids = {}; hits.forEach(function (h) { ids[h.id] = 1; });
    var bkName = 'GL_Backup_' + Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyyMMdd_HHmm'), ss = _glSS_();
    var bk = ss.getSheetByName(bkName) || ss.insertSheet(bkName), bRows = [['قيود'].concat(GL_SHEETS_.entries.headers)];
    hits.forEach(function (h) { bRows.push(['قيد'].concat(h.r)); });
    bRows.push(['أسطر'].concat(GL_SHEETS_.lines.headers).concat(new Array(Math.max(0, GL_SHEETS_.entries.headers.length - GL_SHEETS_.lines.headers.length)).fill('')));
    _glRows_('lines').forEach(function (l) { if (ids[_glStr_(l[0])]) bRows.push(['سطر'].concat(l).concat(new Array(Math.max(0, GL_SHEETS_.entries.headers.length - GL_SHEETS_.lines.headers.length)).fill(''))); });
    var W = GL_SHEETS_.entries.headers.length + 1;
    bRows = bRows.map(function (r) { r = r.slice(0, W); while (r.length < W) r.push(''); return r; });
    bk.getRange(1, 1, bRows.length, W).setValues(bRows);
    // 2) الحذف النهائي
    if (hits.length) {
      _glDeleteLinesOf_(Object.keys(ids));
      var sh = _glSheet_('entries'), rs = hits.map(function (h) { return h.row; }).sort(function (a, b) { return b - a; });
      for (var i = 0; i < rs.length; i++) { var j = i; while (j + 1 < rs.length && rs[j + 1] === rs[j] - 1) j++; sh.deleteRows(rs[j], j - i + 1); i = j; }
    }
    // 3) مجموعة 4101 «إيرادات رحلات العمرة» — الحساب القديم بنفس الكود يُعاد ترقيمه تحت 41 (بأسطره وإعداداته)
    _GL_ACC_MEMO_ = null; accs = _glAccounts_(); g = accs.map[GL_TRIP_GROUP_];
    var moved = '';
    if (g && !g.isGroup) { var mv = _glMoveAccountCore_(GL_TRIP_GROUP_, g.parent || '41', session.username, { sameParent: true }); moved = mv.code; _GL_ACC_MEMO_ = null; accs = _glAccounts_(); g = accs.map[GL_TRIP_GROUP_]; }
    if (!g) {
      var aSh = _glSheet_('accounts');
      aSh.appendRow(_glAccRow_({ code: GL_TRIP_GROUP_, name: 'إيرادات رحلات العمرة', type: 'REV', parent: '41', isGroup: true, kind: 'trip', notes: 'حساب لكل رحلة عمرة: إيراداتها (دائن) وتكاليفها (مدين) — رصيده ربح الرحلة' }, session.username));
      _GL_ACC_MEMO_ = null;
    }
    // 4) تفعيل الوضع الجديد والتسجيل المباشر بلا انتظار اعتماد (أول بناء)
    _glSetSetting_('trip_mode', 'نعم'); _GL_SET_MEMO_ = null;
    _glPendingWrite_({});
    var r = _glAutoRun_(session.username, false, { bypass: true });
    _glAutoSaveLast_(r, session.username);
    var tb = 0, tc = 0; try { _glRows_('lines').forEach(function (l) { if (_glStr_(l[3]) === GL_ST_POSTED_) { tb += _glNum_(l[9]); tc += _glNum_(l[10]); } }); } catch (e) {}
    logChange_(session.username, 'إعادة بناء قيود الرحلات', 'GL:auto', 'القيود التلقائية', 'حُذف ' + hits.length + ' (نسخة: ' + bkName + ')',
      'جديد ' + r.created + (moved ? ' — أُعيد ترقيم 4101 القديم إلى ' + moved : ''));
    info.dry = false; info.deleted = hits.length; info.backup = bkName; info.movedOld4101 = moved; info.created = r.created; info.updated = r.updated;
    info.errors = r.errors.slice(0, 50); info.warnings = r.warnings; info.trial = { debit: _glR2_(tb), credit: _glR2_(tc) };
    return info;
  } finally { lock.releaseLock(); }
}
/* 🔗 (V4.219) ربط عهدة بشيت جوجل — بنفس تنسيق شيت العهدة:
     A العهدة (وارد) · B المصروفات (صادر) · C البيان · D التاريخ · E الرصيد التراكمي (لا يُلمس) · F القيد · G الحساب / الطرف
   المزامنة (يدوية من شاشة العهد، أو كل ساعة مع القيود التلقائية لو فُعّلت):
   • صف بلا رقم قيد وطرفه معروف (اسم حساب مطابق بعد «ح/» أو كوده أو اسم اعتُمد قبل ذلك) ⇒ قيد مرحّل:
       الوارد «صرف عهدة» (من ح/ العهدة إلى ح/ الطرف) · المصروف «تسوية عهدة» (من ح/ الطرف إلى ح/ العهدة) — ويُكتب رقم القيد في F.
   • الطرف غير معروف ⇒ «بانتظار الاعتماد» مثل الـ ERP (بلا حساب وسيط): يختار صاحب صلاحية التعديل الحساب فيُعتمد ويُتذكَّر الاسم.
   • صف تغيّر بعد قيده (مبلغ/تاريخ/بيان/طرف) ⇒ يُحدَّث قيده · قيد اختفى صفه من الشيت ⇒ يُعرض للمراجعة فقط (لا حذف تلقائي).
   • صف سجّله برنامج الحجوزات (دفعة عميل/مورد من نفس الشيت) ⇒ يُربط بقيده التلقائي ولا يتكرر. */
function _glCsCfg_(code) { try { return JSON.parse(_glSettings_()['custsheet:' + code] || '{}') || {}; } catch (e) { return {}; } }
function _glCsMap_() { try { return JSON.parse(_glSettings_().custsheet_map || '{}') || {}; } catch (e) { return {}; } }
function _glCsKey_(s) { return _glNorm_(String(s || '').replace(/^\s*ح\s*\/\s*/, '').replace(/^\s*حساب\s+/, '')); }
function _glCsSheetId_(v) { var s = _glStr_(v), m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/); return m ? m[1] : s; }
function _glCsHash_(x) {
  var s = [_glR2_(x.inAmt), _glR2_(x.outAmt), x.date, x.desc, x.hint].join('|'), h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function _glCsOpen_(cfg) {
  var ss; try { ss = SpreadsheetApp.openById(cfg.id); } catch (e) { throw new Error('تعذّر فتح شيت العهدة — تأكد من الرابط ومن مشاركته مع حساب البرنامج: ' + e.message); }
  var sh = cfg.tab ? ss.getSheetByName(cfg.tab) : ss.getSheets()[0];
  if (!sh) throw new Error('الورقة «' + cfg.tab + '» غير موجودة بشيت العهدة');
  return { ss: ss, sh: sh };
}
// (V4.226) أعمدة المزامنة قابلة للتغيير من إعدادات شيت العهدة — الافتراضي: رقم القيد بالعمود H (بدل F سابقاً)
var GL_CS_COLS_DEF_ = { in: 'A', out: 'B', desc: 'C', date: 'D', party: 'G', qaid: 'H' };
function _glColIdx_(L) { L = _glStr_(L).toUpperCase(); var n = 0; for (var i = 0; i < L.length; i++) n = n * 26 + (L.charCodeAt(i) - 64); return n - 1; }
function _glCsCols_(cfg) {
  var c = Object.assign({}, GL_CS_COLS_DEF_, (cfg && cfg.cols) || {}), o = {};
  Object.keys(GL_CS_COLS_DEF_).forEach(function (k) { o[k] = _glColIdx_(/^[A-Z]{1,2}$/i.test(_glStr_(c[k])) ? c[k] : GL_CS_COLS_DEF_[k]); });
  o.letters = c; return o;
}
function _glCsReadRows_(sh, startRow, cfg) {
  var last = sh.getLastRow(), out = [], C = _glCsCols_(cfg), OLD = 5;   // F = عمود رقم القيد القديم (ترحيل تلقائي لأرقام JE- المكتوبة فيه)
  if (last < startRow) return out;
  var W = Math.max(C.in, C.out, C.desc, C.date, C.party, C.qaid, OLD) + 1;
  sh.getRange(startRow, 1, last - startRow + 1, W).getValues().forEach(function (r, i) {
    var x = { row: startRow + i, inAmt: r[C.in] instanceof Date ? 0 : _glR2_(_glNum_(r[C.in])), outAmt: r[C.out] instanceof Date ? 0 : _glR2_(_glNum_(r[C.out])),
      desc: _glStr_(r[C.desc]), date: _glDate_(r[C.date]), f: _glStr_(r[C.qaid]), hint: _glStr_(r[C.party]) };
    if (!x.f && C.qaid !== OLD && /^JE-\d{6}$/.test(_glStr_(r[OLD]))) { x.f = _glStr_(r[OLD]); x.fOld = 1; }
    if (!x.inAmt && !x.outAmt) return;
    x.hash = _glCsHash_(x);
    out.push(x);
  });
  return out;
}
function _glCsResolve_(hint, accs, learned, self) {
  var k = _glCsKey_(hint); if (!k) return '';
  var ok = function (c) { var a = accs.map[c]; return a && !a.isGroup && a.active && c !== self ? c : ''; };
  if (learned[k] && ok(learned[k])) return learned[k];
  var m = String(hint).match(/^\s*(\d{2,})(?:\s|$|[-—–])/); if (m && ok(m[1])) return m[1];
  var ex = accs.list.filter(function (a) { return !a.isGroup && a.active && a.code !== self && _glCsKey_(a.name) === k; });
  return ex.length === 1 ? ex[0].code : '';
}
function _glCsSuggest_(hint, accs, self) {
  var k = _glCsKey_(hint); if (!k || k.length < 3) return [];
  var toks = k.split(' ').filter(function (t) { return t.length >= 3; });
  return accs.list.filter(function (a) { return !a.isGroup && a.active && a.code !== self; }).map(function (a) {
    var n = _glCsKey_(a.name), sc = 0;
    if (n.indexOf(k) >= 0 || k.indexOf(n) >= 0) sc += 5;
    toks.forEach(function (t) { if (n.indexOf(t) >= 0) sc++; });
    return { code: a.code, name: a.name, sc: sc };
  }).filter(function (s) { return s.sc >= 2; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 3).map(function (s) { return { code: s.code, name: s.name }; });
}
// قيد صف الشيت: الوارد «صرف عهدة» والمصروف «تسوية عهدة» — بعملة العهدة وسعر يوم الصف
function _glCsEntry_(x, code, cp, cur, fx) {
  var isIn = x.inAmt > 0, amt = isIn ? x.inAmt : x.outAmt, rate = _glFxRateAt_(cur, x.date, fx).rate;
  var desc = x.desc || (isIn ? 'استلام عهدة' : 'مصروفات عهدة') + (x.hint ? ' — ' + x.hint : '');
  var e = { date: x.date, type: isIn ? 'صرف عهدة' : 'تسوية عهدة', desc: desc, lines: [
    { account: code, debit: isIn ? amt : 0, credit: isIn ? 0 : amt, currency: cur, rate: rate, desc: desc },
    { account: cp, debit: isIn ? 0 : amt, credit: isIn ? amt : 0, currency: cur, rate: rate, desc: desc + (x.hint && x.desc ? ' — ' + x.hint : '') }] };
  return { e: e, v: _glValidate_(e, {}) };
}
function glCustSheetGet(authToken, code) {
  _glPerm_(authToken, 'view');
  var a = _glAccounts_().map[_glStr_(code)]; if (!a || a.isGroup) throw new Error('اختر عهدة');
  return { success: true, cfg: _glCsCfg_(a.code), account: { code: a.code, name: a.name, currency: a.currency || '' } };
}
function glCustSheetSave(authToken, code, cfg) {
  var session = _glAdminPerm_(authToken);
  var a = _glAccounts_().map[_glStr_(code)]; if (!a || a.isGroup) throw new Error('اختر عهدة');
  cfg = cfg || {};
  var id = _glCsSheetId_(cfg.url || cfg.id);
  if (!id) { _glSetSetting_('custsheet:' + a.code, ''); logChange_(session.username, 'فك ربط شيت عهدة', 'GL:' + a.code, 'شيت العهدة', '-', '-'); return { success: true, cfg: {} }; }
  var o = { id: id, tab: _glStr_(cfg.tab), startRow: Math.max(2, parseInt(cfg.startRow, 10) || 2) };
  if (cfg.cols) {
    var cc = {}, used = {};
    Object.keys(GL_CS_COLS_DEF_).forEach(function (k) {
      var v = _glStr_(cfg.cols[k] || GL_CS_COLS_DEF_[k]).toUpperCase();
      if (!/^[A-Z]{1,2}$/.test(v)) throw new Error('حرف عمود غير صالح: ' + v);
      if (used[v]) throw new Error('العمود ' + v + ' مستخدم لأكثر من حقل'); used[v] = 1; cc[k] = v;
    });
    o.cols = cc;
  }
  var S = _glCsOpen_(o);
  o.tab = S.sh.getName(); o.title = S.ss.getName(); o.cur = _glCur_(a.currency || cfg.cur || 'EGP'); o.auto = !!cfg.auto;
  o.by = session.username; o.at = _glNow_();
  _glSetSetting_('custsheet:' + a.code, JSON.stringify(o));
  logChange_(session.username, 'ربط شيت عهدة', 'GL:' + a.code, 'شيت العهدة', '-', o.title + ' / ' + o.tab);
  return { success: true, cfg: o, rows: _glCsReadRows_(S.sh, o.startRow, o).length };
}
// preview=true ⇒ معاينة فقط بلا كتابة
function glCustSheetSync(authToken, code, preview) {
  var session = preview ? _glPerm_(authToken, 'view') : _glAdminPerm_(authToken);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { return _glCsSync_(_glStr_(code), session.username, { preview: !!preview }); }
  finally { lock.releaseLock(); }
}
// اعتماد صفوف الطرف غير المعروف: items = [{row, account}] — ويُتذكَّر اسم الطرف ⇒ حسابه للمرات القادمة
function glCustSheetApprove(authToken, code, items) {
  var session = _glPerm_(authToken, 'edit');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var pick = {}; (items || []).forEach(function (it) { if (it && it.row && _glStr_(it.account)) pick[+it.row] = _glStr_(it.account); });
    if (!Object.keys(pick).length) throw new Error('اختر حساب الطرف لصف واحد على الأقل');
    return _glCsSync_(_glStr_(code), session.username, { approve: pick });
  } finally { lock.releaseLock(); }
}
function _glCsSync_(code, user, opts) {
  opts = opts || {};
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
  var accs = _glAccounts_(), a = accs.map[code];
  if (!a || a.isGroup) throw new Error('حساب العهدة غير موجود');
  var cfg = _glCsCfg_(code); if (!cfg.id) throw new Error('لم يُربط شيت لهذه العهدة بعد');
  var S = _glCsOpen_(cfg), rows = _glCsReadRows_(S.sh, cfg.startRow || 2, cfg), QC = _glCsCols_(cfg).qaid + 1;
  // نقل أرقام القيود القديمة من F إلى عمود القيد الجديد (مرة واحدة، بلا مسح F)
  if (!opts.preview) rows.forEach(function (x) { if (x.fOld) try { S.sh.getRange(x.row, QC).setNumberFormat('@').setValue(x.f); } catch (e) { } });
  var learned = _glCsMap_(), cur = _glCur_(a.currency || cfg.cur || 'EGP'), fx = _glFxDailyMap_();
  var ents = {}, erp = {}, mine = {}, hbAuto = {};
  _glRows_('entries').forEach(function (r, i) {
    var id = _glStr_(r[0]), sk = _glStr_(r[6]); if (!id) return;
    ents[id] = { row: i + 2, r: r };
    if (/^ERP:/.test(sk)) erp[sk.slice(4)] = id;
    if (sk === 'CUST:' + code) mine[id] = 1;
    if (/^AUTO:HBP:CUSTODY:/.test(sk)) hbAuto[sk.slice(9)] = id;
  });
  // دفعات برنامج الحجوزات المأخوذة من نفس الشيت (معرّفها CUSTODY:<آخر 10 من معرّف الملف>:<الصف>)
  var hbPays = {}, seg = String(cfg.id).slice(-10);
  try { (_glHbRead_().pays || []).forEach(function (p) { if (p.id.indexOf('CUSTODY:' + seg + ':') === 0) hbPays[p.id] = p; }); } catch (e) {}
  var out = { success: true, account: { code: a.code, name: a.name, currency: cur }, sheet: { title: cfg.title || '', tab: S.sh.getName(), url: 'https://docs.google.com/spreadsheets/d/' + cfg.id },
    rows: rows.length, linked: 0, created: [], updated: [], hb: [], hbWait: [], pending: [], problems: [], orphans: [], preview: !!opts.preview };
  var seen = {}, toCreate = [], toUpdate = [];
  rows.forEach(function (x) {
    var base = { row: x.row, date: x.date, desc: x.desc, inAmt: x.inAmt, outAmt: x.outAmt, hint: x.hint };
    if (x.inAmt && x.outAmt) { base.msg = 'الصف فيه مبلغ عهدة ومصروف معاً — افصلهما في صفين'; out.problems.push(base); return; }
    if (x.inAmt < 0 || x.outAmt < 0) { base.msg = 'مبلغ سالب'; out.problems.push(base); return; }
    if (x.f) {
      if (ents[x.f]) {
        seen[x.f] = 1;
        if (mine[x.f]) {
          var er = ents[x.f].r, st = _glStr_(er[5]);
          if (st === GL_ST_VOID_) { base.msg = 'قيده ' + x.f + ' ملغى — امسح رقم القيد من الشيت لتسجيله من جديد'; out.problems.push(base); return; }
          if ((_glStr_(er[9]).match(/^cs:(.+)$/) || [])[1] !== x.hash) { toUpdate.push({ x: x, id: x.f, er: ents[x.f] }); return; }
        }
        out.linked++; return;
      }
      if (erp[x.f]) { seen[erp[x.f]] = 1; out.linked++; return; }
      base.msg = 'رقم القيد «' + x.f + '» غير موجود بالحسابات العامة — امسحه من الشيت لتسجيل الصف'; out.problems.push(base); return;
    }
    var hbId = 'CUSTODY:' + seg + ':' + x.row;
    if (hbAuto[hbId]) { seen[hbAuto[hbId]] = 1; toCreate.push({ x: x, linkOnly: hbAuto[hbId] }); return; }
    if (hbPays[hbId]) { base.msg = 'دفعة مسجلة ببرنامج الحجوزات (' + hbPays[hbId].party + ') — يُقيَّد عبر مزامنة الحجوزات'; out.hbWait.push(base); return; }
    if (!x.date) { base.msg = 'بلا تاريخ (العمود D)'; out.problems.push(base); return; }
    var cp = (opts.approve && opts.approve[x.row]) || _glCsResolve_(x.hint, accs, learned, code);
    if (!cp) { base.sugg = _glCsSuggest_(x.hint, accs, code); out.pending.push(base); return; }
    toCreate.push({ x: x, cp: cp, approved: !!(opts.approve && opts.approve[x.row]) });
  });
  Object.keys(mine).forEach(function (id) {
    if (seen[id]) return; var r = ents[id].r; if (_glStr_(r[5]) === GL_ST_VOID_) return;
    out.orphans.push({ id: id, date: _glDate_(r[2]), desc: _glStr_(r[4]), amount: _glNum_(r[8]) });
    out._orphIds = (out._orphIds || []).concat([id]);
  });
  if (out._orphIds) {   // (V4.223) مبلغ القيود بلا صف بعملتها الأصلية
    var ol = {}; _glRows_('lines').forEach(function (l) { if (out._orphIds.indexOf(_glStr_(l[0])) >= 0) (ol[_glStr_(l[0])] = ol[_glStr_(l[0])] || []).push(l); });
    out.orphans.forEach(function (o) { o.amtTxt = _glAmtTxt_(ol[o.id] || []); });
    delete out._orphIds;
  }
  if (opts.approve) toCreate = toCreate.filter(function (c) { return c.approved; });
  if (opts.preview) {
    out.created = toCreate.filter(function (c) { return !c.linkOnly; }).map(function (c) { return { row: c.x.row, date: c.x.date, desc: c.x.desc, inAmt: c.x.inAmt, outAmt: c.x.outAmt, hint: c.x.hint, account: c.cp }; });
    out.hb = toCreate.filter(function (c) { return c.linkOnly; }).map(function (c) { return { row: c.x.row, id: c.linkOnly }; });
    out.updated = toUpdate.map(function (u) { return { row: u.x.row, id: u.id }; });
    return out;
  }
  var eSh = _glSheet_('entries'), lSh = _glSheet_('lines'), fW = [];
  // 1) قيود جديدة (دفعة واحدة)
  var built = [];
  toCreate.forEach(function (c) {
    if (c.linkOnly) { fW.push({ x: c.x, id: c.linkOnly }); out.hb.push({ row: c.x.row, id: c.linkOnly }); return; }
    try { var b = _glCsEntry_(c.x, code, c.cp, cur, fx); b.c = c; built.push(b); }
    catch (err) { out.problems.push({ row: c.x.row, date: c.x.date, desc: c.x.desc, inAmt: c.x.inAmt, outAmt: c.x.outAmt, hint: c.x.hint, msg: err.message }); }
  });
  if (built.length) {
    var first = _glNextEntrySeq_(built.length), eRows = [], lRows = [];
    built.forEach(function (b, i) {
      var id = _glEntryId_(first + i);
      var w = _glWriteEntry_(b.v, { id: id, seq: first + i, status: GL_ST_POSTED_, sourceKey: 'CUST:' + code, desc: b.e.desc, ref: 'cs:' + b.c.x.hash }, user);
      eRows.push(w.eRow); lRows = lRows.concat(w.lRows);
      fW.push({ x: b.c.x, id: id });
      out.created.push({ row: b.c.x.row, id: id, date: b.c.x.date, desc: b.e.desc, inAmt: b.c.x.inAmt, outAmt: b.c.x.outAmt, account: b.c.cp });
      if (b.c.approved && b.c.x.hint) learned[_glCsKey_(b.c.x.hint)] = b.c.cp;
    });
    eSh.getRange(eSh.getLastRow() + 1, 1, eRows.length, eRows[0].length).setValues(eRows);
    lSh.getRange(lSh.getLastRow() + 1, 1, lRows.length, lRows[0].length).setValues(lRows);
    if (built.some(function (b) { return b.c.approved; })) _glSetSetting_('custsheet_map', JSON.stringify(learned));
  }
  // 2) صفوف تغيّرت بعد قيدها ⇒ تحديث القيد في مكانه (الطرف: من الشيت لو معروف وإلا طرف القيد الحالي)
  if (toUpdate.length) {
    var oldLines = {}; _glRows_('lines').forEach(function (r) { var id = _glStr_(r[0]); if (id) (oldLines[id] = oldLines[id] || []).push(r); });
    var done = [];
    toUpdate.forEach(function (u) {
      try {
        if (_glLocked_(u.er.r[2])) throw new Error('القيد ' + u.id + ' في فترة مقفلة — لم يُحدَّث');
        var prev = (oldLines[u.id] || []).filter(function (r) { return _glStr_(r[4]) !== code; })[0];
        var cp = _glCsResolve_(u.x.hint, accs, learned, code) || (prev ? _glStr_(prev[4]) : '');
        if (!cp) throw new Error('طرف الصف غير معروف');
        if (!u.x.date) throw new Error('بلا تاريخ (العمود D)');
        var b = _glCsEntry_(u.x, code, cp, cur, fx), r = u.er.r;
        var w = _glWriteEntry_(b.v, { id: u.id, seq: r[1], status: _glStr_(r[5]) || GL_ST_POSTED_, sourceKey: 'CUST:' + code, batchId: r[7], desc: b.e.desc, ref: 'cs:' + u.x.hash,
          createdBy: r[12], createdAt: r[13], row: u.er.row }, user);
        eSh.getRange(u.er.row, 1, 1, w.eRow.length).setValues([w.eRow]);
        done.push({ id: u.id, lRows: w.lRows });
        out.updated.push({ row: u.x.row, id: u.id, date: u.x.date, desc: b.e.desc, inAmt: u.x.inAmt, outAmt: u.x.outAmt, account: cp });
      } catch (err) { out.problems.push({ row: u.x.row, date: u.x.date, desc: u.x.desc, inAmt: u.x.inAmt, outAmt: u.x.outAmt, hint: u.x.hint, msg: err.message }); }
    });
    if (done.length) {
      _glDeleteLinesOf_(done.map(function (d) { return d.id; }));
      var nl = []; done.forEach(function (d) { nl = nl.concat(d.lRows); });
      lSh.getRange(lSh.getLastRow() + 1, 1, nl.length, nl[0].length).setValues(nl);
    }
  }
  // 3) كتابة رقم القيد في العمود F — بعد إعادة قراءة الشيت: نفس الصف لو لم يتغيّر، وإلا أول صف مطابق بلا رقم (لو أُدرجت صفوف أثناء المزامنة)
  if (fW.length) {
    var now = _glCsReadRows_(S.sh, cfg.startRow || 2, cfg), byRow = {}, byHash = {};
    now.forEach(function (y) { byRow[y.row] = y; if (!y.f) (byHash[y.hash] = byHash[y.hash] || []).push(y); });
    fW.forEach(function (w) {
      var y = byRow[w.x.row];
      if (!(y && !y.f && y.hash === w.x.hash)) y = (byHash[w.x.hash] || []).filter(function (z) { return !z._used && !z.f; })[0];
      if (!y) { out.problems.push({ row: w.x.row, date: w.x.date, desc: w.x.desc, inAmt: w.x.inAmt, outAmt: w.x.outAmt, msg: 'سُجّل القيد ' + w.id + ' لكن تعذّر كتابة رقمه بالشيت (تغيّر الصف) — اكتبه يدوياً في F' }); return; }
      y._used = 1; y.f = w.id;
      S.sh.getRange(y.row, QC).setNumberFormat('@').setValue(w.id);
    });
  }
  var n = out.created.length + out.updated.length + out.hb.length;
  cfg.last = { at: _glNow_(), by: user, created: out.created.length, updated: out.updated.length, pending: out.pending.length, problems: out.problems.length };
  _glSetSetting_('custsheet:' + code, JSON.stringify(cfg));
  if (n) logChange_(user, opts.approve ? 'اعتماد صفوف شيت عهدة' : 'مزامنة شيت عهدة', 'GL:' + code, 'شيت العهدة', '-',
    'جديدة ' + out.created.length + ' · معدّلة ' + out.updated.length + ' · مربوطة بالحجوزات ' + out.hb.length + ' · بانتظار الاعتماد ' + out.pending.length);
  return out;
}
// المزامنة المجدولة لكل عهدة مربوطة فُعّل لها «تلقائي»
function _glCsAutoAll_() {
  var set = _glSettings_(), res = [];
  Object.keys(set).forEach(function (k) {
    if (k.indexOf('custsheet:') !== 0) return;
    var cfg; try { cfg = JSON.parse(set[k] || '{}'); } catch (e) { return; }
    if (!cfg || !cfg.id || !cfg.auto) return;
    try { var r = _glCsSync_(k.slice(10), 'مزامنة مجدولة', {}); res.push(k.slice(10) + ': ' + r.created.length + '/' + r.pending.length); }
    catch (e) { res.push(k.slice(10) + ': ' + e.message); }
  });
  return res;
}
/* 📈 (V4.216) أسعار الصرف اليومية — سجل يومي لأسعار بيع/شراء الريال والدولار من بنك مصر (مشغّل يومي تلقائي + جلب يدوي
   + إدخال/لصق للأيام السابقة). سعر أي تاريخ = سعر نفس اليوم، وإلا أقرب يوم سابق مسجَّل — فلا يُجلب السعر مع كل عملية. */
function _glFxDailyMap_() {
  var out = {};
  try {
    _glRows_('fxdaily').forEach(function (r, i) {
      var d = _glDate_(r[0]), k = _glDKey_(d); if (!k) return;
      out[k] = { date: d, SAR: _glNum_(r[1]), SARbuy: _glNum_(r[2]), USD: _glNum_(r[3]), USDbuy: _glNum_(r[4]), src: _glStr_(r[5]), by: _glStr_(r[6]), at: _glStr_(r[7]), _row: i + 2 };
    });
  } catch (e) {}
  return out;
}
function _glFxDailyUpsert_(d, o, by) {
  var k = _glDKey_(_glDate_(d)); if (!k) throw new Error('تاريخ غير صالح: ' + d);
  var map = _glFxDailyMap_(), sh = _glSheet_('fxdaily'), old = map[k] || {};
  var row = [_glDate_(d), o.SAR || old.SAR || '', o.SARbuy || old.SARbuy || '', o.USD || old.USD || '', o.USDbuy || old.USDbuy || '', o.src || old.src || '', by || '', _glNow_()];
  if (old._row) sh.getRange(old._row, 1, 1, row.length).setValues([row]);
  else { sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]); }
}
// سعر عملة في تاريخ: نفس اليوم ⇒ أقرب يوم سابق مسجَّل ⇒ السعر الافتراضي بالإعدادات
function _glFxRateAt_(cur, date, map) {
  if (cur === 'EGP') return { rate: 1, date: '', src: '' };
  map = map || _glFxDailyMap_();
  var k = _glDKey_(_glDate_(date)) || _glDKey_(_glDate_(new Date())), best = '';
  Object.keys(map).forEach(function (x) { if (x <= k && map[x][cur] > 0 && x > best) best = x; });
  if (best) return { rate: map[best][cur], date: map[best].date, src: map[best].src, exact: best === k };
  return { rate: _glRates_()[cur], date: '', src: 'السعر الافتراضي بالإعدادات' };
}
function _glFxFetchToday_(by) {
  var r = _fxFetchBanqueMisr_(), today = _glDate_(new Date());
  _glFxDailyUpsert_(today, { SAR: r.SAR ? r.SAR.sell : 0, SARbuy: r.SAR ? r.SAR.buy : 0, USD: r.USD ? r.USD.sell : 0, USDbuy: r.USD ? r.USD.buy : 0, src: 'بنك مصر' }, by);
  return _glFxDailyMap_()[_glDKey_(today)];
}
// مشغّل يومي (يُفعَّل من الإعدادات)
function glFxDailyCron() {
  if (!_glSSId_()) return;
  try { _glFxFetchToday_('تسجيل يومي تلقائي'); _glSetSetting_('fx_daily_err', ''); }
  catch (e) { try { _glSetSetting_('fx_daily_err', _glNow_() + ' — ' + e.message); } catch (e2) {} }
}
function glFxDaily(authToken) {
  _glPerm_(authToken, 'view');
  var map = _glFxDailyMap_(), rows = Object.keys(map).sort().reverse().map(function (k) { var o = map[k]; delete o._row; return o; });
  var s = _glSettings_();
  return { success: true, rows: rows, cron: s.fx_daily_cron === 'نعم', error: s.fx_daily_err || '' };
}
function glFxFetchNow(authToken) {
  var session = _glAdminPerm_(authToken);
  return { success: true, row: _glFxFetchToday_(session.username) };
}
// إدخال/لصق أسعار أيام سابقة: rows = [{date, SAR, USD, SARbuy?, USDbuy?}]
function glFxDailySave(authToken, rows) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('تسجيل أسعار الصرف للمدير فقط');
  var n = 0;
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    var d = _glDate_(r.date); if (!d || !(_glNum_(r.SAR) > 0 || _glNum_(r.USD) > 0)) return;
    _glFxDailyUpsert_(d, { SAR: _glNum_(r.SAR), SARbuy: _glNum_(r.SARbuy), USD: _glNum_(r.USD), USDbuy: _glNum_(r.USDbuy), src: r.src || 'إدخال يدوي' }, session.username); n++;
  });
  logChange_(session.username, 'تسجيل أسعار صرف يومية', 'GL:fx', '-', '-', n + ' يوم');
  return { success: true, count: n };
}
function glFxDailyCronSet(authToken, on) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'glFxDailyCron') ScriptApp.deleteTrigger(t); });
  if (on) ScriptApp.newTrigger('glFxDailyCron').timeBased().everyDays(1).atHour(11).create();
  _glSetSetting_('fx_daily_cron', on ? 'نعم' : 'لا');
  if (on) { try { _glFxFetchToday_(session.username); } catch (e) {} }
  return { success: true };
}
// سعر العملتين بتاريخ معيّن (لنموذج التحويل): لو اليوم غير مسجَّل بعد يُجلب من بنك مصر ويُسجَّل
function glFxRateAt(authToken, date) {
  var session = _glPerm_(authToken, 'view');
  var d = _glDate_(date) || _glDate_(new Date()), map = _glFxDailyMap_(), k = _glDKey_(d);
  var fetched = false, err = '';
  if (k === _glDKey_(_glDate_(new Date())) && !(map[k] && map[k].SAR && map[k].USD)) {
    try { _glFxFetchToday_(session.username); map = _glFxDailyMap_(); fetched = true; } catch (e) { err = e.message; }
  }
  return { success: true, date: d, SAR: _glFxRateAt_('SAR', d, map), USD: _glFxRateAt_('USD', d, map), fetched: fetched, error: err };
}
// تقرير المطابقة: رصيد كل عميل ووكيل وشركة رسوم غرفة كما تحسبه الشاشة ↔ رصيد حسابه بالدفتر
function glAutoReconcile(authToken) {
  _glPerm_(authToken, 'view');
  _GL_ACC_MEMO_ = null;
  var accs = _glAccounts_(), bal = _glBalances_(null), byLink = {};
  // (V4.208) أسطر قيود حجوزات الفنادق تُستبعد هنا — لها مطابقتها الخاصة بتبويب «🏨 الحجوزات»
  var hbB = _glHbLineBal_();
  Object.keys(hbB).forEach(function (c) { var o = bal[c]; if (o) ['EGP', 'SAR', 'USD'].forEach(function (k) { o[k] = _glR2_((o[k] || 0) - (hbB[c][k] || 0)); }); });
  accs.list.forEach(function (a) { if (a.link && !a.isGroup) byLink[a.kind + '|' + _glNorm_(a.link)] = a; });
  var glOf = function (kind, name, sign) {
    var a = byLink[kind + '|' + _glNorm_(name)], b = a ? (bal[a.code] || { EGP: 0, SAR: 0 }) : { EGP: 0, SAR: 0 };
    return { code: a ? a.code : '', E: _glR2_(sign * b.EGP), S: _glR2_(sign * b.SAR) };
  };
  var rows = [];
  var add = function (kind, label, name, appE, appS, g) {
    appE = _glR2_(appE); appS = _glR2_(appS);
    var dE = _glR2_(appE - g.E), dS = _glR2_(appS - g.S);
    if (!appE && !appS && !g.E && !g.S) return;
    rows.push({ kind: kind, label: label, name: name, code: g.code, appE: appE, appS: appS, glE: g.E, glS: g.S, dE: dE, dS: dS, ok: Math.abs(dE) < 0.05 && Math.abs(dS) < 0.05 });
  };
  // العملاء: نفس دالة أرصدة دليل العملاء (موجب = مستحق على العميل)
  var cl = _accAggBalances_();
  Object.keys(cl).forEach(function (n) { add('client', 'عميل', n, cl[n].netE, cl[n].netS, glOf('client', n, 1)); });
  // الوكلاء: نفس حساب كشف الوكيل العام بلا فلاتر (موجب = مستحق للوكيل علينا)
  var map = _vzAcctMap_(), files = _vzReadAll_(), items = _vzReadItems_(''), pays = _vzReadPays_('');
  var tRows = [], tPrices = []; try { tRows = _taReadRowsRaw_(); tPrices = _vzReadTransportPrices_(); } catch (e) {}
  var agents = {}; files.forEach(function (f) { if (f.agent) agents[f.agent] = 1; });
  try { _vzReadPrices_().forEach(function (p) { if (p.agent) agents[p.agent] = 1; }); } catch (e) {}
  Object.keys(agents).forEach(function (ag) {
    var keys = {}; keys[ag] = 1;
    _vzAcctKeys_([ag], map).forEach(function (k) { if (k.agent === ag) keys[k.key] = 1; });
    var myFiles = files.filter(function (f) { return _vzFileInAcct_(f, ag, map); });
    var tDue = 0; _vzTransportRunsFor_(ag, map, tRows, tPrices).rows.forEach(function (t) { tDue += _mfNum_(t.value); });
    var b = _vzAgentBalance_(ag, myFiles, items.filter(function (x) { return keys[x.agent]; }), pays.filter(function (x) { return keys[x.agent]; }), tDue);
    add('agent', 'وكيل', ag, b.netE, b.netS, glOf('agent', ag, -1));
  });
  // موردو النقل (غير الوكلاء): قيمة دوراتهم فقط
  var sup = {};
  tRows.forEach(function (r) {
    if (!r.supplier || agents[r.supplier]) return;
    var p = _mfNum_(r.busPrice) || _vzTransportPriceAt_(r.supplier, r.arrivalDate, tPrices);
    sup[r.supplier] = (sup[r.supplier] || 0) + _mfNum_(r.busCount) * p;
  });
  Object.keys(sup).forEach(function (n) { add('supplier', 'مورد نقل', n, 0, sup[n], glOf('supplier', n, -1)); });
  // رسوم الغرفة: رصيد الإيداعات − المسحوب لكل شركة
  try {
    var mb = _mfBalances_(_mfReadAll_(), _mfReadReceipts_());
    Object.keys(mb).forEach(function (c) { if (c) add('roomfee', 'رسوم غرفة', c, mb[c].balance, 0, glOf('roomfee', c, 1)); });
  } catch (e) {}
  rows.sort(function (a, b) { return (a.ok === b.ok ? 0 : (a.ok ? 1 : -1)) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'ar'); });
  var s = _glSettings_();
  return { success: true, rows: rows, startDate: s.startDate, autoOpen: s.auto_open !== 'لا', last: _glAutoLast_() };
}

/* ============================================================================
   📊 (V4.207) المرحلة 3 — التقارير المالية وإقفال الفترات
   ----------------------------------------------------------------------------
   كل التقارير من الأسطر المرحّلة فقط وبالمعادل بالجنيه (مع العملات الأصلية حيث يلزم):
     قائمة الدخل (بفلاتر رحلة/شركة)، المركز المالي في تاريخ، الربحية (رحلة/شركة/عميل)،
     أعمار الديون (عملاء/وكلاء وموردين) بطريقة الأقدم فالأقدم، والتدفق النقدي وحركة الخزائن.
   الإقفال: «تاريخ الإقفال» يمنع أي قيد جديد/تعديل/إلغاء بتاريخ ≤ هذا التاريخ (يدوي أو تلقائي أو استيراد)،
   و«قيد إقفال السنة» ينقل صافي الإيرادات والمصروفات للأرباح المرحّلة (33).
   ============================================================================ */
function _glPostedLines_() {
  var types = {};
  _glRows_('entries').forEach(function (r) { types[_glStr_(r[0])] = _glStr_(r[3]); });
  return _glRows_('lines').filter(function (r) { return _glStr_(r[3]) === GL_ST_POSTED_; }).map(function (r) {
    var l = _glLineObj_(r); l._k = _glDKey_(l.date); l.etype = types[l.entryId] || ''; return l;
  });
}
function glSetLockDate(authToken, date) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('إقفال الفترات للمدير فقط');
  var d = _glStr_(date) ? _glDate_(date) : '';
  if (_glStr_(date) && !d) throw new Error('تاريخ غير صالح');
  var old = _glSettings_().lockDate || '';
  _glSetSetting_('lockDate', d);
  logChange_(session.username, d ? 'إقفال الفترات حتى تاريخ' : 'فتح كل الفترات', 'GL:lock', 'تاريخ الإقفال', old || '-', d || '-');
  return { success: true, lockDate: d };
}
// قيد إقفال السنة: عكس رصيد كل حساب إيراد/مصروف (لكل عملة) عن السنة، والصافي بالمعادل للأرباح المرحّلة
function glCloseYear(authToken, year, lockAfter) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('إقفال السنة للمدير فقط');
  year = parseInt(year, 10); if (!(year > 2000)) throw new Error('السنة غير صالحة');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var key = 'CLOSE:' + year;
    var ex = _glRows_('entries').filter(function (r) { return _glStr_(r[6]) === key && _glStr_(r[5]) !== GL_ST_VOID_; });
    if (ex.length) throw new Error('السنة ' + year + ' مُقفلة بالفعل بالقيد ' + _glStr_(ex[0][0]) + ' — ألغِه أولاً لإعادة الإقفال');
    var fromK = year + '0101', toK = year + '1231', agg = {};
    _glPostedLines_().forEach(function (l) {
      if (l._k < fromK || l._k > toK || !/^[45]/.test(l.account)) return;
      var k = l.account + '|' + l.currency, o = (agg[k] = agg[k] || { account: l.account, currency: l.currency, amt: 0, base: 0 });
      o.amt += l.debit - l.credit; o.base += l.bDebit - l.bCredit;
    });
    var lines = [], resid = 0;
    Object.keys(agg).sort().forEach(function (k) {
      var o = agg[k], amt = _glR2_(o.amt), base = _glR2_(o.base);
      if (Math.abs(amt) < 0.005 && Math.abs(base) < 0.005) return;
      if (Math.abs(amt) < 0.005) return;   // فرق معادل بلا مبلغ بالعملة (نادر جداً) — يبقى كما هو
      var rate = o.currency === 'EGP' ? 1 : Math.round(Math.abs(base / amt) * 1e6) / 1e6;
      lines.push({ account: o.account, debit: amt < 0 ? -amt : 0, credit: amt > 0 ? amt : 0, currency: o.currency, rate: rate, exact: 1, desc: 'إقفال حساب ' + o.account + ' عن سنة ' + year });
      resid += _glR2_((amt > 0 ? amt : 0) * rate) - _glR2_((amt < 0 ? -amt : 0) * rate);
    });
    if (!lines.length) throw new Error('لا توجد إيرادات أو مصروفات مرحّلة في سنة ' + year);
    resid = _glR2_(resid);   // موجب = صافي مصروف (خسارة) ← مدين الأرباح المرحّلة
    if (Math.abs(resid) >= 0.005) lines.push({ account: '33', debit: resid > 0 ? resid : 0, credit: resid < 0 ? -resid : 0, currency: 'EGP', rate: 1,
      desc: (resid < 0 ? 'صافي ربح' : 'صافي خسارة') + ' سنة ' + year });
    var date = '31/12/' + year;
    var v = _glValidate_({ date: date, type: 'قيد إقفال', desc: 'قيد إقفال الإيرادات والمصروفات لسنة ' + year, lines: lines }, { allowBeforeStart: true, ignoreLock: true, allowSystem: true });
    var seq = _glNextEntrySeq_(1), id = _glEntryId_(seq);
    var w = _glWriteEntry_(v, { id: id, seq: seq, status: GL_ST_POSTED_, sourceKey: key, desc: 'قيد إقفال الإيرادات والمصروفات لسنة ' + year }, session.username);
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    eSh.getRange(eSh.getLastRow() + 1, 1, 1, w.eRow.length).setValues([w.eRow]);
    lSh.getRange(lSh.getLastRow() + 1, 1, w.lRows.length, w.lRows[0].length).setValues(w.lRows);
    var lk = _glSettings_().lockDate;
    if (lockAfter && (!lk || _glDKey_(lk) < toK)) _glSetSetting_('lockDate', date);
    logChange_(session.username, 'إقفال سنة مالية', 'GL:' + id, 'السنة', '-', year + ' — صافي ' + (-resid) + ' ج');
    return { success: true, id: id, net: -resid, lockDate: _glSettings_().lockDate };
  } finally { lock.releaseLock(); }
}
// إلغاء قيد إقفال سنة (بعد فتح الفترة)
function glReopenYear(authToken, year) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  var key = 'CLOSE:' + parseInt(year, 10);
  var eSh = _glSheet_('entries'), rows = _glRows_('entries'), hit = null;
  rows.forEach(function (r, i) { if (_glStr_(r[6]) === key && _glStr_(r[5]) !== GL_ST_VOID_) hit = { r: r, row: i + 2 }; });
  if (!hit) throw new Error('لا يوجد قيد إقفال فعّال لهذه السنة');
  if (_glLocked_(hit.r[2])) throw new Error('افتح الفترة أولاً (غيّر تاريخ الإقفال لما قبل 31/12/' + year + ')');
  eSh.getRange(hit.row, 6).setValue(GL_ST_VOID_);
  eSh.getRange(hit.row, 17, 1, 3).setValues([[session.username, _glNow_(), 'إعادة فتح السنة']]);
  _glSetLinesStatus_([_glStr_(hit.r[0])], GL_ST_VOID_);
  logChange_(session.username, 'إعادة فتح سنة مالية', 'GL:' + _glStr_(hit.r[0]), 'السنة', 'مُقفلة', 'مفتوحة');
  return { success: true };
}
function _glLineMatch_(l, f) {
  if (f.trip && l.trip !== f.trip) return false;
  if (f.company && l.company !== f.company) return false;
  if (f.client && l.client !== f.client) return false;
  return true;
}
// قائمة الدخل لفترة (بلا قيود الإقفال): لكل حساب إيراد/مصروف صافيه بالمعادل وبعملاته
function glIncomeStatement(authToken, from, to, f) {
  _glPerm_(authToken, 'view');
  f = f || {};
  var fromK = _glDKey_(_glDate_(from)), toK = _glDKey_(_glDate_(to)), acc = {}, tags = { trips: {}, companies: {} };
  _glPostedLines_().forEach(function (l) {
    if (!/^[45]/.test(l.account) || l.etype === 'قيد إقفال') return;
    if (l.trip) tags.trips[l.trip] = 1; if (l.company) tags.companies[l.company] = 1;
    if ((fromK && l._k < fromK) || (toK && l._k > toK) || !_glLineMatch_(l, f)) return;
    var rev = l.account.charAt(0) === '4', o = (acc[l.account] = acc[l.account] || { base: 0, cur: { EGP: 0, SAR: 0, USD: 0 } });
    o.base = _glR2_(o.base + (rev ? l.bCredit - l.bDebit : l.bDebit - l.bCredit));
    o.cur[l.currency] = _glR2_(o.cur[l.currency] + (rev ? l.credit - l.debit : l.debit - l.credit));
  });
  var rev = 0, exp = 0;
  Object.keys(acc).forEach(function (c) { if (c.charAt(0) === '4') rev += acc[c].base; else exp += acc[c].base; });
  return { success: true, accounts: acc, revenue: _glR2_(rev), expenses: _glR2_(exp), net: _glR2_(rev - exp),
    trips: Object.keys(tags.trips).sort(), companies: Object.keys(tags.companies).sort() };
}
// المركز المالي في تاريخ: أرصدة الأصول والخصوم وحقوق الملكية + صافي الربح غير المقفَل
function glBalanceSheet(authToken, asOf) {
  _glPerm_(authToken, 'view');
  var toK = _glDKey_(_glDate_(asOf)), acc = {}, pl = 0;
  _glPostedLines_().forEach(function (l) {
    if (toK && l._k > toK) return;
    var b = l.bDebit - l.bCredit;
    if (/^[45]/.test(l.account)) { pl -= b; return; }   // موجب = ربح
    var o = (acc[l.account] = acc[l.account] || { base: 0, cur: { EGP: 0, SAR: 0, USD: 0 } });
    o.base = _glR2_(o.base + b); o.cur[l.currency] = _glR2_(o.cur[l.currency] + l.debit - l.credit);
  });
  var tot = { assets: 0, liabs: 0, equity: 0 };
  Object.keys(acc).forEach(function (c) {
    var t = c.charAt(0), v = acc[c].base;
    if (t === '1') tot.assets += v; else if (t === '2') tot.liabs -= v; else if (t === '3') tot.equity -= v;
  });
  pl = _glR2_(pl);
  return { success: true, accounts: acc, profit: pl, assets: _glR2_(tot.assets), liabs: _glR2_(tot.liabs), equity: _glR2_(tot.equity + pl),
    balanced: Math.abs(_glR2_(tot.assets - tot.liabs - tot.equity - pl)) < 0.1 };
}
// الربحية حسب الرحلة/الشركة/العميل: إيرادات (4 بلا فروق العملة) وتكاليف مباشرة (51) وأخرى (باقي 5)
function glProfitability(authToken, from, to, by) {
  _glPerm_(authToken, 'view');
  by = { trip: 'trip', company: 'company', client: 'client' }[by] || 'trip';
  var fromK = _glDKey_(_glDate_(from)), toK = _glDKey_(_glDate_(to)), g = {}, discAcc = _glSettings_().auto_acc_disc || '4199';
  _glPostedLines_().forEach(function (l) {
    if (!/^[45]/.test(l.account) || l.etype === 'قيد إقفال') return;
    if ((fromK && l._k < fromK) || (toK && l._k > toK)) return;
    var k = l[by] || '', o = (g[k] = g[k] || { key: k, rev: 0, disc: 0, direct: 0, other: 0, byAcc: {} });
    var b = l.bCredit - l.bDebit;
    if (l.account.charAt(0) === '4') {
      if (l.account === GL_ACC_FX_GAIN_) o.other -= b;           // فروق العملة ليست إيراد نشاط
      else if (l.account === discAcc) o.disc -= b; else o.rev += b;
    } else if (l.account.indexOf('51') === 0) o.direct -= b; else o.other -= b;
    o.byAcc[l.account] = _glR2_((o.byAcc[l.account] || 0) + (l.account.charAt(0) === '4' ? b : -b));
  });
  var rows = Object.keys(g).map(function (k) {
    var o = g[k]; ['rev', 'disc', 'direct', 'other'].forEach(function (x) { o[x] = _glR2_(o[x]); });
    o.netRev = _glR2_(o.rev - o.disc); o.gross = _glR2_(o.netRev - o.direct); o.net = _glR2_(o.gross - o.other);
    o.margin = o.netRev ? Math.round(o.gross / o.netRev * 1000) / 10 : 0;
    return o;
  }).sort(function (a, b) { return b.netRev - a.netRev; });
  return { success: true, by: by, rows: rows };
}
// أعمار الديون (الأقدم فالأقدم) لكل حساب طرف ولكل عملة
function glAging(authToken, asOf, kind) {
  _glPerm_(authToken, 'view');
  kind = kind === 'agent' ? 'agent' : 'client';
  var toK = _glDKey_(_glDate_(asOf)) || _glDKey_(_glDate_(new Date()));
  var asD = new Date(+toK.slice(0, 4), +toK.slice(4, 6) - 1, +toK.slice(6, 8));
  var accs = _glAccounts_().map, grp = {};
  var isParty = function (code) {
    var a = accs[code]; if (!a) return false;
    return kind === 'client' ? (code.indexOf('12') === 0 && a.kind === 'client') : (code.indexOf('21') === 0);
  };
  _glPostedLines_().forEach(function (l) {
    if (l._k > toK || !isParty(l.account)) return;
    var k = l.account + '|' + l.currency;
    (grp[k] = grp[k] || { account: l.account, currency: l.currency, lines: [] }).lines.push(l);
  });
  var B = [30, 60, 90, 180], rows = [];
  Object.keys(grp).forEach(function (k) {
    var g = grp[k], sign = kind === 'client' ? 1 : -1, open = [], adv = 0;
    g.lines.sort(function (a, b) { return a._k < b._k ? -1 : (a._k > b._k ? 1 : 0); });
    g.lines.forEach(function (l) {
      var a = sign * (l.debit - l.credit);
      if (a > 0) {   // فاتورة/استحقاق — تمتص أولاً أي دفعات مقدمة سابقة
        if (adv > 0) { var u = Math.min(adv, a); adv -= u; a -= u; }
        if (a > 0.004) open.push({ k: l._k, amt: a });
      } else if (a < 0) {
        var pay = -a;
        while (pay > 0.004 && open.length) { var o = open[0], u2 = Math.min(o.amt, pay); o.amt -= u2; pay -= u2; if (o.amt <= 0.004) open.shift(); }
        if (pay > 0.004) adv += pay;
      }
    });
    var bk = [0, 0, 0, 0, 0], total = 0;
    open.forEach(function (o) {
      var d = new Date(+o.k.slice(0, 4), +o.k.slice(4, 6) - 1, +o.k.slice(6, 8)), days = Math.round((asD - d) / 86400000);
      var i = days <= B[0] ? 0 : days <= B[1] ? 1 : days <= B[2] ? 2 : days <= B[3] ? 3 : 4;
      bk[i] += o.amt; total += o.amt;
    });
    total = _glR2_(total - adv);
    if (Math.abs(total) < 0.005 && adv < 0.005) return;
    var a = accs[g.account];
    rows.push({ account: g.account, name: a ? a.name : g.account, currency: g.currency, total: total, buckets: bk.map(_glR2_), advance: _glR2_(adv),
      oldest: open.length ? open[0].k.slice(6, 8) + '/' + open[0].k.slice(4, 6) + '/' + open[0].k.slice(0, 4) : '' });
  });
  rows.sort(function (a, b) { return b.total - a.total; });
  return { success: true, kind: kind, asOf: toK.slice(6, 8) + '/' + toK.slice(4, 6) + '/' + toK.slice(0, 4), rows: rows, labels: ['0–30 يوم', '31–60', '61–90', '91–180', 'أكثر من 180'] };
}
// التدفق النقدي وحركة الخزائن: لكل حساب نقدي (خزينة/بنك/عهدة) افتتاحي ووارد ومنصرف وختامي بعملته،
// وتصنيف صافي التدفق حسب الطرف المقابل (بالمعادل)
function glCashFlow(authToken, from, to) {
  _glPerm_(authToken, 'view');
  var fromK = _glDKey_(_glDate_(from)), toK = _glDKey_(_glDate_(to)), accs = _glAccounts_().map;
  var isCash = function (code) { var a = accs[code]; return !!a && !a.isGroup && (a.kind === 'safe' || a.kind === 'bank' || a.kind === 'custody'); };
  var box = {}, byEntry = {};
  _glPostedLines_().forEach(function (l) {
    if (toK && l._k > toK) return;
    if (isCash(l.account)) {
      var k = l.account + '|' + l.currency, o = (box[k] = box[k] || { account: l.account, currency: l.currency, open: 0, inn: 0, out: 0 });
      if (fromK && l._k < fromK) o.open += l.debit - l.credit; else { o.inn += l.debit; o.out += l.credit; }
    }
    if (fromK && l._k < fromK) return;
    (byEntry[l.entryId] = byEntry[l.entryId] || []).push(l);
  });
  var CAT = [['12', 'تحصيلات من العملاء'], ['1103', 'تسويات دفعات شاشات البرنامج'], ['16', 'رسوم الغرفة'], ['14', 'دفعات مقدمة'], ['21', 'مدفوعات الوكلاء والموردين'],
    ['22', 'مستحقات أخرى'], ['23', 'دفعات مقدمة من العملاء'], ['24', 'خصوم أخرى'], ['3', 'الشركاء ورأس المال'], ['4', 'إيرادات أخرى'], ['51', 'تكاليف مباشرة'], ['52', 'مصروفات عمومية وإدارية'],
    ['53', 'فروق عملة'], ['5', 'مصروفات أخرى'], ['15', 'تحويل العملات والأصول الأخرى'], ['1', 'أصول أخرى'], ['2', 'خصوم أخرى']];
  var catOf = function (code) { for (var i = 0; i < CAT.length; i++) if (code.indexOf(CAT[i][0]) === 0) return CAT[i][1]; return 'أخرى'; };
  var cats = {};
  Object.keys(byEntry).forEach(function (id) {
    var ls = byEntry[id], cashNet = 0, other = [], otherTot = 0;
    ls.forEach(function (l) { if (isCash(l.account)) cashNet += l.bDebit - l.bCredit; else { other.push(l); otherTot += l.bCredit - l.bDebit; } });
    if (Math.abs(cashNet) < 0.005 || !other.length) return;   // تحويل بين خزائن/بنوك فقط
    other.forEach(function (l) {
      var share = Math.abs(otherTot) > 0.005 ? (l.bCredit - l.bDebit) / otherTot * cashNet : cashNet / other.length;
      var c = catOf(l.account), o = (cats[c] = cats[c] || { cat: c, inn: 0, out: 0 });
      if (share >= 0) o.inn += share; else o.out -= share;
    });
  });
  var boxes = Object.keys(box).map(function (k) {
    var o = box[k], a = accs[o.account];
    ['open', 'inn', 'out'].forEach(function (x) { o[x] = _glR2_(o[x]); });
    o.close = _glR2_(o.open + o.inn - o.out); o.name = a ? a.name : o.account; o.kind = a ? a.kind : '';
    return o;
  }).sort(function (a, b) { return a.account < b.account ? -1 : 1; });
  var catRows = Object.keys(cats).map(function (k) { var o = cats[k]; o.inn = _glR2_(o.inn); o.out = _glR2_(o.out); o.net = _glR2_(o.inn - o.out); return o; })
    .sort(function (a, b) { return Math.abs(b.net) - Math.abs(a.net); });
  return { success: true, boxes: boxes, cats: catRows };
}

/* ============================================================================
   🏨 (V4.208) المرحلة H1 — ربط برنامج حجوزات الفنادق بالدفتر العام (بلا أي تعديل ببرنامج الحجوزات)
   ----------------------------------------------------------------------------
   يقرأ ملف برنامج الحجوزات (حجوزات مكة/المدينة + سجل الدفعات + بيانات الحسابات) ويولّد قيوداً تلقائية
   تُزامَن مع باقي القيود التلقائية (نفس المفاتيح الثابتة والبصمة وقفل الفترات):
     • AUTO:HB:<المدينة>|<رقم الحجز الداخلي> بتاريخ الدخول —
         البيع: من ح/ العميل إلى ح/ إيرادات السكن (بسعر البيع؛ لا يُسجَّل لرحلات الشركة: تُسجَّل بالتكلفة فقط)
         التكلفة: من ح/ تكلفة السكن (موسومة بالرحلة) إلى ح/ المورد أو الشارت (بسعر التكلفة)
       نفس قواعد كشف الحساب ببرنامج الحجوزات: يُستبعد «لاغي» وأي طرف ينقصه سعر نوع غرفة محجوز.
     • AUTO:HBP:<معرّف الدفعة> — الدفعة بين الطرف والحساب النقدي المختار بالمراجعة (خزينة/بنك/عهدة/وكيل)
       وبعملتها الفعلية؛ الجنيه مقابل حساب بالريال يمر تلقائياً بحساب «وسيط تحويل العملات» (آلية الـ ERP).
       الدفعات المرتبطة (نفس معرّف الارتباط) قيد واحد بين الطرفين، والبنود اليدوية مقابل «تسويات يدوية».
   رقم القيد اليدوي ببرنامج الحجوزات يبقى كما هو ويظهر في البيان، ويُضاف رقم القيد الآلي JE-xxxxxx بجانبه.
   ============================================================================ */
var GL_HB_ROLES_ = {
  hb_cash:   ['11', 'نقدية تحت التسوية (حجوزات الفنادق)', 'ASSET', 0, '', '1104'],
  hb_rev:    ['4', 'إيرادات السكن', 'REV', 0, '', '43'],
  hb_revgrp: ['4', 'أرباح حجوزات الفنادق (حساب لكل مورد)', 'REV', 1, 'hbrev', '47'],
  hb_link:   ['15', 'وسيط الدفعات المرتبطة (حجوزات الفنادق)', 'ASSET', 0, '', ''],
  hb_manual: ['15', 'تسويات يدوية (حجوزات الفنادق)', 'ASSET', 0, '', ''],
  hb_trip:   ['15', 'جاري رحلات الشركة (حجوزات الفنادق)', 'ASSET', 0, '', ''],
  hb_via:    ['15', 'مقاصة دفعات الفنادق عبر الوكلاء', 'ASSET', 0, '', '']
};
// أنواع الأسماء: الأب الذي يُنشأ تحته الحساب، والفئة، وهل يُسجَّل البيع
var GL_HB_TYPES_ = {
  'عميل':       { parent: '1203', kind: 'client',   sale: true,  label: 'عميل سكن' },
  'عميل عمرة':  { parent: '1201', kind: 'client',   sale: true,  label: 'عميل عمرة (بنود)' },
  'مورد':       { parent: '2103', kind: 'supplier', sale: true,  label: 'مورد / فندق' },
  'شارت':       { parent: '2103', kind: 'supplier', sale: true,  label: 'شارت (عقد غرف)' },
  'عهدة':       { parent: '13',   kind: 'custody',  sale: true,  label: 'عهدة موظف' },
  'رحلة':       { parent: '',     kind: '',         sale: false, label: 'رحلة الشركة (تكلفة فقط)' },
  'تجاهل':      { parent: '',     kind: '',         sale: false, label: 'تجاهل' }
};
var GL_HB_CREDIT_DIRS_ = { 'استلمنا منه': 1, 'دائن يدوي': 1 };
var GL_HB_MANUAL_DIRS_ = { 'مدين يدوي': 1, 'دائن يدوي': 1 };

// نفس تطبيع الأسماء ببرنامج الحجوزات (normalizeName_) — فتتطابق الأسماء كما يطابقها كشف الحساب هناك
function _glHbKey_(s) {
  return String(s == null ? '' : s).replace(/[​-‏؜﻿]/g, '').replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
}
function _glHbOn_() { try { return !!_glSettings_().hb_ss_id; } catch (e) { return false; } }
function _glHbCfg_() {
  var s = _glSettings_();
  return { ssId: s.hb_ss_id || '', srcId: s.hb_src_id || '', mk: s.hb_mk_sheet || 'حجوزات مكة', mkRow: parseInt(s.hb_mk_row, 10) || 5,
    md: s.hb_md_sheet || 'حجوزات المدينة', mdRow: parseInt(s.hb_md_row, 10) || 6, pay: s.hb_pay_sheet || 'سجل الدفعات', prof: s.hb_prof_sheet || 'بيانات الحسابات',
    viaKw: s.hb_via_kw === undefined ? 'حجز|حجوزات|فندق|فنادق|تسكين' : s.hb_via_kw, hbFrom: s.hb_from || '' };
}
// نفس computeBookingTotal_ ببرنامج الحجوزات حرفياً: Σ(عدد الغرف × السعر) × الليالي، وأي نوع محجوز بلا سعر ⇐ بلا سعر
var GL_HB_ROOM_LBL_ = ['دابل', 'ثلاثي', 'رباعي', 'خماسي'];
function _glNightsWord_(n) { n = Math.round(n || 0); return n >= 3 && n <= 10 ? 'ليالي' : 'ليلة'; }
function _glHbTotal_(raw, role) {
  var nights = parseFloat(raw[9]) || 0, cols = role === 'client' ? [25, 26, 27, 28] : [21, 22, 23, 24], per = 0, any = false, miss = false, parts = [];
  for (var i = 0; i < 4; i++) {
    var cnt = parseFloat(raw[10 + i]) || 0; if (cnt <= 0) continue;
    any = true; var p = parseFloat(raw[cols[i]]);
    if (!isFinite(p)) { miss = true; continue; }
    per += cnt * p;
    parts.push(cnt + ' ' + GL_HB_ROOM_LBL_[i] + ' × ' + _glR2_(p) + ' ريال');   // (V4.219) تفصيل الغرف كقيد الـ ERP
  }
  var ok = any && !miss;
  return { value: ok ? _glR2_(per * nights) : 0, hasPrice: ok, rooms: any, breakdown: ok ? parts.join(' + ') : '' };
}
var _GL_HB_MEMO_ = null;
function _glHbRead_() {
  if (_GL_HB_MEMO_) return _GL_HB_MEMO_;
  var c = _glHbCfg_();
  if (!c.ssId) throw new Error('لم يُربط ملف برنامج الحجوزات بعد');
  var ss = SpreadsheetApp.openById(c.ssId), src = (c.srcId && c.srcId !== c.ssId) ? SpreadsheetApp.openById(c.srcId) : ss;
  var bookings = [], seen = {};
  [[c.mk, c.mkRow, 'مكة'], [c.md, c.mdRow, 'المدينة']].forEach(function (d) {
    var sh = src.getSheetByName(d[0]);
    if (!sh) throw new Error('لم أجد شيت «' + d[0] + '» بملف الحجوزات');
    var last = sh.getLastRow(); if (last < d[1]) return;
    sh.getRange(d[1], 1, last - d[1] + 1, 34).getValues().forEach(function (r, i) {
      var ci = _glAutoDate_(r[7]); if (!ci) return;
      var client = _glStr_(r[3]), sup = _glStr_(r[14]); if (!client && !sup) return;
      var inner = _glStr_(r[2]), base = d[2] + '|' + (inner || ('r' + (d[1] + i)));
      seen[base] = (seen[base] || 0) + 1;
      bookings.push({ key: base + (seen[base] > 1 ? '#' + seen[base] : ''), city: d[2], row: d[1] + i, qaid: _glStr_(r[0]), inner: inner, client: client,
        hotel: _glStr_(r[4]), ci: ci, co: _glAutoDate_(r[8]), nights: parseFloat(r[9]) || 0, supplier: sup, status: _glStr_(r[15]), hotelRef: _glStr_(r[17]),
        sale: _glHbTotal_(r, 'client'), cost: _glHbTotal_(r, 'supplier'), rooms: [10, 11, 12, 13].map(function (c) { return parseFloat(r[c]) || 0; }) });
    });
  });
  var pays = [], psh = ss.getSheetByName(c.pay);
  if (psh && psh.getLastRow() > 1) psh.getRange(2, 1, psh.getLastRow() - 1, 10).getValues().forEach(function (r, i) {
    var party = _glStr_(r[1]), date = _glAutoDate_(r[0]); if (!party || !date) return;
    pays.push({ id: _glStr_(r[7]) || ('row' + (i + 2)), date: date, party: party, dir: _glStr_(r[2]), amount: parseFloat(r[3]) || 0,
      note: _glStr_(r[4]), qaid: /^JE-\d{6}$/.test(_glStr_(r[5])) ? '' : _glStr_(r[5]), linkId: _glStr_(r[9]) });   // (V4.219) رقم قيد الحسابات العامة المكتوب بشيت العهدة ليس «قيداً يدوياً»
  });
  // (V4.208-H2) البيانات المحاسبية التي يسجّلها برنامج الحجوزات نفسه مع الدفعة (الحساب النقدي والعملة الفعلية)
  var meta = {}, msh = ss.getSheetByName('البيانات المحاسبية للدفعات');
  if (msh && msh.getLastRow() > 1) msh.getRange(2, 1, msh.getLastRow() - 1, 6).getValues().forEach(function (r) {
    var id = _glStr_(r[0]), cash = _glStr_(r[1]); if (!id || !cash) return;
    meta[id] = { cash: cash, cur: _glStr_(r[2]) ? _glCur_(r[2]) : 'SAR', amount: _glNum_(r[3]), by: _glStr_(r[4]), src: 'hotel' };
  });
  pays.forEach(function (p) { if (meta[p.id]) p.meta = meta[p.id]; });
  var prof = {}, fsh = ss.getSheetByName(c.prof);
  if (fsh && fsh.getLastRow() > 1) fsh.getRange(2, 1, fsh.getLastRow() - 1, 7).getValues().forEach(function (r) {
    var n = _glStr_(r[0]); if (!n || n === '-') return;
    prof[_glHbKey_(n)] = { name: n, type: _glStr_(r[1]), notes: _glStr_(r[2]), agent: _glStr_(r[4]), role: _glStr_(r[5]), code: _glStr_(r[6]) };
  });
  return (_GL_HB_MEMO_ = { bookings: bookings, pays: pays, prof: prof });
}
function _glHbMap_() {
  var o = {};
  _glRows_('hbmap').forEach(function (r, i) {
    var n = _glStr_(r[0]); if (!n) return;
    o[_glHbKey_(n)] = { name: n, type: _glStr_(r[1]), code: _glStr_(r[2]), link: _glStr_(r[3]), notes: _glStr_(r[4]), _row: i + 2 };
  });
  return o;
}
function _glHbPayRev_() {
  var o = {};
  _glRowsW_('hbpay').forEach(function (r) { var id = _glStr_(r[0]); if (id) o[id] = { cash: _glStr_(r[1]), cur: _glStr_(r[2]) ? _glCur_(r[2]) : '', amount: _glNum_(r[3]), rate: _glNum_(r[4]), by: _glStr_(r[5]), at: _glStr_(r[6]), party: _glStr_(r[7]) }; });
  return o;
}
function _glHbTripOv_() { var o = {}; _glRows_('hbtrip').forEach(function (r) { var k = _glStr_(r[0]); if (k) o[k] = _glStr_(r[1]); }); return o; }
// كل الأطراف بمجاميعها ورصيدها بمنطق كشف الحساب ببرنامج الحجوزات (موجب = مدين/مستحق على الطرف)
function _glHbParties_(H) {
  var P = {};
  var get = function (name) {
    var k = _glHbKey_(name); if (!k) return null;
    var p = P[k] || (P[k] = { key: k, name: name, v: {}, asClient: 0, asSup: 0, pays: 0, bal: 0, sale: 0, cost: 0, unpriced: 0 });
    p.v[name] = (p.v[name] || 0) + 1;
    return p;
  };
  H.bookings.forEach(function (b) {
    if (b.status === 'لاغي') return;
    var c = b.client ? get(b.client) : null, s = b.supplier ? get(b.supplier) : null;
    if (c) { c.asClient++; if (b.sale.hasPrice) { c.bal += b.sale.value; c.sale += b.sale.value; } else if (b.sale.rooms) c.unpriced++; }
    if (s) { s.asSup++; if (b.cost.hasPrice) { s.bal -= b.cost.value; s.cost += b.cost.value; } else if (b.cost.rooms) s.unpriced++; }
  });
  H.pays.forEach(function (x) { var p = get(x.party); if (!p) return; p.pays++; p.bal += GL_HB_CREDIT_DIRS_[x.dir] ? -x.amount : x.amount; });
  Object.keys(P).forEach(function (k) {
    var p = P[k], pr = H.prof[k];
    p.name = pr ? pr.name : Object.keys(p.v).sort(function (a, b) { return p.v[b] - p.v[a]; })[0];
    p.bal = _glR2_(p.bal); p.sale = _glR2_(p.sale); p.cost = _glR2_(p.cost); delete p.v;
  });
  return P;
}
// اقتراح نوع الاسم وحسابه (للمراجعة قبل الحفظ)
function _glHbSuggest_(p, pr, accs) {
  var n = p.name, nk = _glNorm_(n), type;
  var umrah = accs.list.filter(function (a) { return !a.isGroup && a.kind === 'client' && a.code.indexOf('1201') === 0 && a.link && _glNorm_(a.link) === nk; })[0];
  if (/(^|\s)رحل[ةه](\s|$)/.test(n)) type = 'رحلة';
  else if (/عهد[ةه]/.test(n)) type = 'عهدة';
  else if (/شارت|شارتر|charter/i.test(n)) type = 'شارت';
  else if (umrah) type = 'عميل عمرة';
  else if (pr && /مورد|فندق/.test(pr.role || '')) type = 'مورد';
  else if (pr && /عميل/.test(pr.role || '')) type = 'عميل';
  else type = p.asSup > p.asClient ? 'مورد' : 'عميل';
  var T = GL_HB_TYPES_[type], code = '';
  if (type === 'عميل عمرة' && umrah) code = umrah.code;
  else if (type === 'عهدة') {
    var toks = nk.split(' ').filter(function (t) { return t.length >= 3 && !/^(عهده|عهدة|مكه|مكة|المدينه|المدينة)$/.test(t); });
    var best = null, bs = 0;
    accs.list.forEach(function (a) {
      if (a.isGroup || a.kind !== 'custody') return;
      var an = _glNorm_(a.name), sc = 0; toks.forEach(function (t) { if (an.indexOf(t) >= 0) sc++; });
      if (sc > bs) { bs = sc; best = a; }
    });
    if (best) code = best.code;
  } else if (T.parent) {
    var ex = accs.list.filter(function (a) { return !a.isGroup && a.code.indexOf(T.parent) === 0 && ((a.link && _glNorm_(a.link) === nk) || _glNorm_(a.name) === nk); })[0];
    if (ex) code = ex.code;
  }
  return { type: type, code: code };
}
function _glHbDay_(d) { var m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5) : NaN; }
// رحلات برنامج العمرة (نوافذ السكن بكل مدينة) + رحلات كل عميل من كشوف المعتمرين — لربط حجوزات عملاء العمرة برحلاتهم
function _glHbTripCtx_() {
  var trips = {}, byClient = {}, pilg = {};
  try {
    var sh = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues().forEach(function (r) {
      var n = _glStr_(r[0]); if (!n) return;
      trips[n] = { name: n, company: _glStr_(r[1]), mdHotel: _glStr_(r[7]), mkHotel: _glStr_(r[11]), go: _glAutoDate_(r[4]), back: _glAutoDate_(r[5]), mdIn: _glAutoDate_(r[8]), mdOut: _glAutoDate_(r[9]), mkIn: _glAutoDate_(r[12]), mkOut: _glAutoDate_(r[13]) };
    });
  } catch (e) {}
  try {
    var ps = _getPilgrimsSheet_();
    if (ps && ps.getLastRow() >= 2) {
      var C = _robustColMap_(ps, PILGRIMS_HEADERS_), P = _cellReader_(C, PILGRIMS_COL_);
      ps.getRange(2, 1, ps.getLastRow() - 1, ps.getLastColumn()).getValues().forEach(function (r) {
        var cl = _glStr_(P(r, 'client')), t = _glStr_(P(r, 'tripName'));
        if (t && _glStr_(P(r, 'name'))) pilg[t] = (pilg[t] || 0) + 1;
        if (!cl || !t) return;
        (byClient[_glHbKey_(cl)] = byClient[_glHbKey_(cl)] || {})[t] = 1;
      });
    }
  } catch (e) {}
  return { trips: trips, byClient: byClient, pilg: pilg };
}
// الرحلة التلقائية لحجز عميل عمرة: من رحلات العميل، التي يقع تاريخ الدخول داخل نافذة سكنها بنفس المدينة (±2 يوم)
function _glHbAutoTrip_(b, umrahName, ctx) {
  var cand = Object.keys(ctx.byClient[_glHbKey_(umrahName)] || {}), d = _glHbDay_(b.ci), best = '', bd = 1e9, hits = 0;
  cand.forEach(function (t) {
    var T = ctx.trips[t]; if (!T) return;
    var a = _glHbDay_(b.city === 'مكة' ? T.mkIn : T.mdIn), z = _glHbDay_(b.city === 'مكة' ? T.mkOut : T.mdOut);
    if (isNaN(a)) { a = _glHbDay_(T.go); z = _glHbDay_(T.back); }
    if (isNaN(a)) return;
    if (isNaN(z)) z = a + 30;
    if (d >= a - 2 && d <= z) { hits++; if (Math.abs(d - a) < bd) { bd = Math.abs(d - a); best = t; } }
  });
  return { trip: best, hits: hits, cands: cand.length };
}
function _glHbTripOf_(b, cm, ov, ctx, accs) {
  if (ov[b.key] !== undefined) return ov[b.key] === '-' ? '' : ov[b.key];
  if (!cm) return '';
  if (cm.type === 'رحلة') return cm.link || '';
  if (cm.type === 'عميل عمرة') { var a = accs[cm.code]; return _glHbAutoTrip_(b, (a && a.link) || cm.name, ctx).trip; }
  return '';
}
// اقتراح الحساب النقدي والعملة الفعلية من ملاحظة الدفعة
function _glHbPaySuggest_(p, cands, roles) {
  var note = _glNorm_(p.note || ''), best = null, bs = 0;
  if (GL_HB_MANUAL_DIRS_[p.dir]) return { cash: roles.hb_manual, cur: 'SAR', amount: Math.abs(p.amount), why: 'بند يدوي' };
  if (/^CUSTODY:/.test(p.id)) note += ' عهده';
  cands.forEach(function (c) {
    var sc = 0;
    c.toks.forEach(function (t) { if (note.indexOf(t) >= 0) sc += 2; });
    if (c.kind === 'safe' && /نقد|كاش|نقدي|نقدا/.test(note)) sc += 1;
    if (c.kind === 'bank' && /تحويل|بنك|ايداع|انستا|instapay|محفظ/.test(note)) sc += 1;
    if (c.kind === 'custody' && /عهد/.test(note)) sc += 1;
    if (sc > bs) { bs = sc; best = c; }
  });
  var cash = '', why = '';
  if (/رياد[هة]|الوكيل/.test(note)) { cash = roles.hb_via; why = 'عبر الوكيل'; }
  if (!cash && best && bs >= 2) { cash = best.code; why = 'من الملاحظة: ' + best.name; }
  if (!cash) { cash = roles.hb_cash; why = 'تحت التسوية'; }
  var cur = 'SAR', amount = Math.abs(p.amount), raw = String(p.note || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
  var m = raw.match(/(\d[\d,٬.]*)\s*(?:جم|ج\.م|جنيه|ج\s|ج$|EGP)/i);
  if (m) { var e = _glNum_(m[1]); if (e > Math.abs(p.amount) * 2) { cur = 'EGP'; amount = e; } }
  else if (/دولار|\$|USD/i.test(raw)) { var m2 = raw.match(/(\d[\d,٬.]*)\s*(?:دولار|\$|USD)/i); if (m2 && _glNum_(m2[1])) { cur = 'USD'; amount = _glNum_(m2[1]); } }
  var est = false, ca = null;
  cands.forEach(function (c) { if (c.code === cash) ca = c; });
  if (ca && ca.currency && ca.currency !== cur) {   // الحساب بعملة محددة ولم تُذكر قيمتها بالملاحظة ← تقدير بسعر الإعدادات
    var rates = _glRates_(); cur = ca.currency; amount = Math.abs(p.amount) * rates.SAR / (rates[cur] || 1); est = true;
  }
  return { cash: cash, cur: cur, amount: _glR2_(amount), why: why, est: est };
}
function _glHbCashCands_() {
  return _glAccounts_().list.filter(function (a) { return !a.isGroup && a.active && /^(safe|bank|custody|agent)$/.test(a.kind); }).map(function (a) {
    var toks = _glNorm_(a.name).split(' ').filter(function (t) { return t.length >= 3 && !/^(عهده|عهدة|بنك|البنك|خزينه|خزينة|الخزينه|الخزينة|الرئيسيه|الرئيسية|حساب|الوكيل|مكه|مكة|المدينه|المدينة)$/.test(t); });
    return { code: a.code, name: a.name, kind: a.kind, toks: toks, currency: a.currency };
  });
}
// بناء قيود الحجوزات والدفعات (يُستدعى من _glAutoBuild_ فيمر بنفس المقارنة والتطبيق)
function _glHbBuild_(roles, warn, party) {
  var H = _glHbRead_(), map = _glHbMap_(), rev = _glHbPayRev_(), ov = _glHbTripOv_(), ctx = _glHbTripCtx_();
  var accs = _glAccounts_().map, rates = _glRates_(), out = [], miss = {}, st = { unpriced: 0, skipped: 0 };
  var info = function (name) {
    var k = _glHbKey_(name), m = map[k];
    if (!m || !GL_HB_TYPES_[m.type]) { miss[k] = name; return null; }
    if (m.type === 'تجاهل') return null;
    if (GL_HB_TYPES_[m.type].parent && !(m.code && accs[m.code] && !accs[m.code].isGroup)) { miss[k] = name; return null; }
    return m;
  };
  var L = function (acc, amt, dr, cur, rate, tag) {
    return { account: acc, debit: dr ? amt : 0, credit: dr ? 0 : amt, currency: cur, rate: rate, trip: tag.trip || '', company: tag.company || '', client: tag.client || '', agent: tag.agent || '', desc: tag.desc || '' };
  };
  var ptag = function (m, name) { var k = GL_HB_TYPES_[m.type].kind; return k === 'client' ? { client: name } : (k === 'supplier' ? { agent: name } : {}); };
  var sar = rates.SAR;
  H.bookings.forEach(function (b) {
    if (b.status === 'لاغي') return;
    var cm = b.client ? info(b.client) : null, sm = b.supplier ? info(b.supplier) : null;
    var trip = _glHbTripOf_(b, cm, ov, ctx, accs), tc = trip && ctx.trips[trip] ? ctx.trips[trip].company : '';
    // 📘 (V4.219) بيانات القيد بصيغة الـ ERP: رقم تأكيد الفندق (أو رقم الحجز الداخلي) + الفندق + من/إلى (dd/MM) + تفصيل الغرف + مدة الإقامة
    var refNum = b.hotelRef || b.inner || ('صف ' + b.row), nw = _glNightsWord_(b.nights);
    var span = b.hotel + ' من ' + String(b.ci || '').slice(0, 5) + ' إلى ' + String(b.co || '').slice(0, 5);
    var nRooms = (b.rooms || []).reduce(function (s, x) { return s + x; }, 0);
    var custStmt = 'حجز ' + refNum + ' ' + span + (b.sale.breakdown ? ' (' + b.sale.breakdown + ')' : '') + ' لمدة (' + b.nights + ') ' + nw;
    var supStmt = 'حجز ' + refNum + ' ' + span + (b.cost.breakdown ? ' (' + b.cost.breakdown + ')' : '') + ' لمدة (' + b.nights + ') ' + nw + ' — العميل: ' + b.client;
    var revStmt = 'ايراد حجز ' + refNum + ' ' + span + ' (' + nRooms + ' غرف لمدة ' + b.nights + ' ' + nw + ') العميل: ' + b.client + (b.supplier ? ' من ' + b.supplier : '');
    var headStmt = 'حجز ' + refNum + ' - ' + span + (b.inner && b.inner !== refNum ? ' — حجز داخلي ' + b.inner : '') + (b.qaid ? ' — قيد ' + b.qaid : '');
    // (V4.208-H2) آلية الـ ERP: من ح/ العميل (البيع) — إلى ح/ المورد (التكلفة) — إلى ح/ إيرادات حجوزات المورد (الفرق = هامش ربح الحجز).
    // لكل مورد حساب إيراد خاص به يُرحَّل رصيده لـ«إيرادات السكن» نهاية الموسم. رحلات الشركة (بالتكلفة) وحجز عميل غير مسعَّر/غير مربوط:
    // من ح/ تكلفة السكن (بوسم الرحلة) إلى ح/ المورد. وحجز مورد غير مسعَّر: البيع كله لإيراد المورد حتى تُسعَّر التكلفة.
    var lines = [];
    var hasSale = !!(cm && GL_HB_TYPES_[cm.type].sale && b.sale.hasPrice && b.sale.value);
    var hasCost = !!(sm && sm.type !== 'رحلة' && b.cost.hasPrice && b.cost.value);
    if (cm && GL_HB_TYPES_[cm.type].sale && !b.sale.hasPrice && b.sale.rooms) st.unpriced++;
    if (sm && sm.type !== 'رحلة' && !b.cost.hasPrice && b.cost.rooms) st.unpriced++;
    var base = { trip: trip, company: tc };
    if (hasSale) {
      var sv = b.sale.value, l1 = L(cm.code, Math.abs(sv), sv > 0, 'SAR', sar, Object.assign({ desc: custStmt }, base, ptag(cm, b.client)));
      l1.hbParty = 1; lines.push(l1);
    }
    if (hasCost) {
      var cv = b.cost.value, l2 = L(sm.code, Math.abs(cv), cv < 0, 'SAR', sar, Object.assign({ desc: supStmt }, base, ptag(sm, b.supplier)));
      l2.hbParty = 1; lines.push(l2);
      if (!hasSale) lines.push(L(roles.cost_house, Math.abs(cv), cv > 0, 'SAR', sar, Object.assign({ desc: 'تكلفة ' + supStmt + (cm && cm.type === 'رحلة' ? '' : ' (بلا بيع مسجَّل)') }, base)));
    }
    if (hasSale) {
      var mg = _glR2_(b.sale.value - (hasCost ? b.cost.value : 0));
      var revAcc = (sm && sm.type !== 'رحلة') ? party('hbrev', sm.name || b.supplier) : roles.hb_rev;
      if (Math.abs(mg) >= 0.005) lines.push(L(revAcc, Math.abs(mg), mg < 0, 'SAR', sar, Object.assign({ client: b.client, agent: b.supplier,
        desc: !hasCost ? revStmt + ' (التكلفة غير مسعَّرة)' : mg < 0 ? 'خسارة حجز ' + refNum + ' ' + b.hotel + ' — ' + Math.abs(mg).toFixed(2) + ' SAR' : revStmt }, base)));
    }
    if (lines.length >= 2) out.push({ key: 'AUTO:HB:' + b.key, date: b.ci, desc: headStmt,
      trip: trip, company: tc, lines: lines, src: 'hotel' });
  });
  // الدفعات: المرتبطة تُجمع بقيد واحد، والباقي مقابل الحساب النقدي المراجَع
  var groups = {}, singles = [];
  H.pays.forEach(function (p) { if (p.linkId) (groups[p.linkId] = groups[p.linkId] || []).push(p); else singles.push(p); });
  Object.keys(groups).forEach(function (g) { if (groups[g].length < 2) { singles = singles.concat(groups[g]); delete groups[g]; } });
  var partyLine = function (p, m) {
    var delta = GL_HB_CREDIT_DIRS_[p.dir] ? -p.amount : p.amount, amt = _glR2_(Math.abs(delta));
    if (!amt) return null;
    var acc = m.type === 'رحلة' ? roles.hb_trip : m.code;
    var tag = Object.assign({ trip: m.type === 'رحلة' ? (m.link || '') : '', desc: (p.dir || 'دفعة') + ' — ' + p.party + (p.note ? ' — ' + p.note : '') + (p.qaid ? ' — قيد يدوي ' + p.qaid : '') }, ptag(m, p.party));
    var ln = L(acc, amt, delta > 0, 'SAR', sar, tag); ln.hbParty = 1;
    return { line: ln, delta: delta, amt: amt, tag: tag };
  };
  // (V4.225) مراجعة الدفعة قد تغيّر حساب الطرف أيضاً (لا الحساب النقدي فقط) — يتقدّم على خريطة الأسماء
  var pinfo = function (p) {
    var pr = rev[p.id] && rev[p.id].party, a = pr && accs[pr];
    if (a && !a.isGroup) return { type: /^(agent|supplier)$/.test(a.kind) || a.type === 'LIAB' ? 'مورد' : 'عميل', code: pr, link: '' };
    return info(p.party);
  };
  singles.forEach(function (p) {
    var m = pinfo(p); if (!m) { st.skipped++; return; }
    var pl = partyLine(p, m); if (!pl) return;
    var r = (rev[p.id] && rev[p.id].cash) ? rev[p.id] : (p.meta || rev[p.id] || null);   // مراجعة الحسابات أولاً، ثم ما سُجّل مع الدفعة ببرنامج الحجوزات
    var cash = r && r.cash && accs[r.cash] ? r.cash : '';
    if (!cash) cash = GL_HB_MANUAL_DIRS_[p.dir] ? roles.hb_manual : roles.hb_cash;
    var acc = accs[cash], cur = (r && r.cur) || (acc && acc.currency) || 'SAR', amt2 = pl.amt, rate = sar;
    if (cur !== 'SAR') {
      amt2 = r && r.amount && r.cur === cur ? _glR2_(r.amount) : _glR2_(pl.amt * sar / (rates[cur] || 1));
      var base = cur === 'EGP' ? amt2 : _glR2_(amt2 * rates[cur]);
      rate = cur === 'EGP' ? 1 : rates[cur];
      pl.line.rate = Math.round(base / pl.amt * 1e6) / 1e6; pl.line.exact = 1;   // الريال بسعر التحويل الفعلي فيتساوى المعادل
    }
    var otag = Object.assign({}, pl.tag); delete otag.client; delete otag.agent;
    out.push({ key: 'AUTO:HBP:' + p.id, date: p.date, desc: (p.dir || 'دفعة') + ' — ' + p.party + (p.note ? ' — ' + p.note : '') + (p.qaid ? ' — قيد يدوي ' + p.qaid : ''),
      trip: pl.tag.trip, lines: [pl.line, L(cash, amt2, pl.delta < 0, cur, rate, otag)], src: 'hotel' });
  });
  Object.keys(groups).forEach(function (g) {
    var ps = groups[g], lines = [], net = 0, ok = true;
    ps.forEach(function (p) { var m = pinfo(p); if (!m) { ok = false; return; } var pl = partyLine(p, m); if (pl) { lines.push(pl.line); net += pl.delta; } });
    if (!ok) { st.skipped += ps.length; return; }
    net = _glR2_(net);
    if (Math.abs(net) >= 0.005) lines.push(L(roles.hb_link, Math.abs(net), net < 0, 'SAR', sar, { desc: 'فرق دفعة مرتبطة' }));
    var p0 = ps[0];
    if (lines.length >= 2) out.push({ key: 'AUTO:HBL:' + g, date: p0.date, desc: 'دفعة مرتبطة — ' + ps.map(function (p) { return p.party; }).join(' ⇄ ') + (p0.note ? ' — ' + p0.note : '') + (p0.qaid ? ' — قيد يدوي ' + p0.qaid : ''),
      lines: lines, src: 'hotel' });
  });
  var mk = Object.keys(miss);
  if (mk.length) warn.push('حجوزات الفنادق: ' + mk.length + ' اسماً بلا ربط بحساب (لم تُسجَّل حركاتهم) — من تبويب «🏨 الحجوزات ← خريطة الحسابات»: ' + mk.slice(0, 15).map(function (k) { return miss[k]; }).join('، ') + (mk.length > 15 ? '…' : ''));
  if (st.unpriced) warn.push('حجوزات الفنادق: ' + st.unpriced + ' طرف حجز بلا سعر لنوع غرفة محجوز — مستبعد كما في كشف الحساب');
  return out;
}
// أرصدة أسطر قيود الحجوزات فقط لكل حساب — للمطابقة، ولاستبعادها من مطابقة شاشات العمرة
// partyOnly: أسطر الأطراف فقط — يُستبعد جانب الحساب النقدي بقيود الدفعات (السطر 2) لأن العهدة قد تكون طرفاً وحساباً نقدياً معاً
function _glHbLineBal_(partyOnly, cashOut) {
  var ids = {}, out = {};
  _glRows_('entries').forEach(function (r) { var k = _glStr_(r[6]); if (/^AUTO:HB/.test(k) && _glStr_(r[5]) === GL_ST_POSTED_) ids[_glStr_(r[0])] = /^AUTO:HBP:/.test(k) ? 2 : 1; });
  _glRows_('lines').forEach(function (r) {
    var t = ids[_glStr_(r[0])];
    if (!t || _glStr_(r[3]) !== GL_ST_POSTED_) return;
    if (t === 2 && _glNum_(r[1]) === 2) {
      if (cashOut) { var cc = _glStr_(r[4]), co = (cashOut[cc] = cashOut[cc] || { EGP: 0, SAR: 0, USD: 0, n: 0 }); co[_glCur_(r[7])] = _glR2_(co[_glCur_(r[7])] + _glNum_(r[5]) - _glNum_(r[6])); co.n++; }
      if (partyOnly) return;
    }
    var code = _glStr_(r[4]), cur = _glCur_(r[7]), o = (out[code] = out[code] || { EGP: 0, SAR: 0, USD: 0 });
    o[cur] = _glR2_(o[cur] + _glNum_(r[5]) - _glNum_(r[6]));
  });
  return out;
}
function _glHbEntryIds_() {
  var o = {};
  _glRows_('entries').forEach(function (r) { var k = _glStr_(r[6]); if (/^AUTO:HB/.test(k)) o[k] = { id: _glStr_(r[0]), st: _glStr_(r[5]) }; });
  return o;
}

/* ---------------------------- واجهة الربط ---------------------------- */
function glHbSetup(authToken, cfg) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('ربط برنامج الحجوزات للمدير فقط');
  cfg = cfg || {};
  var id = _glStr_(cfg.ssId).replace(/^.*\/d\/([a-zA-Z0-9_-]+).*$/, '$1');
  var srcId = _glStr_(cfg.srcId).replace(/^.*\/d\/([a-zA-Z0-9_-]+).*$/, '$1');
  if (cfg.disconnect) { _glSetSetting_('hb_ss_id', ''); logChange_(session.username, 'فصل برنامج الحجوزات', 'GL:hb', '-', '-', ''); return { success: true, on: false }; }
  if (!id) throw new Error('أدخل رابط أو معرّف ملف برنامج الحجوزات');
  var keys = { hb_src_id: srcId, hb_mk_sheet: cfg.mk, hb_mk_row: cfg.mkRow, hb_md_sheet: cfg.md, hb_md_row: cfg.mdRow, hb_pay_sheet: cfg.pay, hb_prof_sheet: cfg.prof };
  var old = _glSettings_().hb_ss_id;
  _glSetSetting_('hb_ss_id', id);
  Object.keys(keys).forEach(function (k) { if (keys[k] !== undefined && keys[k] !== null) _glSetSetting_(k, _glStr_(keys[k])); });
  if (cfg.viaKw !== undefined) _glSetSetting_('hb_via_kw', _glStr_(cfg.viaKw));
  if (cfg.hbFrom !== undefined) { var hf = _glDate_(cfg.hbFrom); if (_glStr_(cfg.hbFrom) && !hf) throw new Error('تاريخ «مصدر الحركات» غير صالح'); _glSetSetting_('hb_from', hf); }
  _GL_HB_MEMO_ = null;
  var H;
  try { H = _glHbRead_(); }
  catch (e) { _glSetSetting_('hb_ss_id', old || ''); throw new Error('تعذّر فتح ملف الحجوزات: ' + e.message + ' — تأكد أن حساب السكربت يملك صلاحية الوصول للملف'); }
  logChange_(session.username, 'ربط برنامج الحجوزات بالحسابات', 'GL:hb', '-', '-', id);
  return { success: true, on: true, bookings: H.bookings.length, pays: H.pays.length, profiles: Object.keys(H.prof).length };
}
/* 🔀 (V4.217) تداخل الـ ERP المنقول مع قيود ربط برنامج الحجوزات: لكل حساب عليه أسطر من المصدرين — أرصدة ومعادل كل
   مصدر ونطاق تواريخه — ليتبيّن أين يتكرر نفس الحجز/الدفعة. */
function _glSrcOf_(r) {
  var k = _glStr_(r[6]), ref = _glStr_(r[9]);
  if (/^AUTO:HB/.test(k)) return 'hb';
  if (/^ERP:/.test(k) || ref === 'ERP-OPENING' || /^ERP-/.test(ref)) return 'erp';
  if (/^IMP:/.test(k)) return 'imp';
  return '';
}
function glHbErpOverlap(authToken) {
  _glPerm_(authToken, 'view');
  var ents = {}; _glRows_('entries').forEach(function (r) { if (_glStr_(r[5]) !== GL_ST_VOID_) ents[_glStr_(r[0])] = r; });
  var accs = _glAccounts_().map, by = {};
  _glRows_('lines').forEach(function (l) {
    var e = ents[_glStr_(l[0])]; if (!e) return;
    var src = _glSrcOf_(e); if (src !== 'hb' && src !== 'erp') return;
    var code = _glStr_(l[4]), d = _glDate_(e[2]), k = _glDKey_(d);
    var o = by[code] || (by[code] = { code: code, erp: { base: 0, cur: {}, n: 0, first: '', last: '', ids: {} }, hb: { base: 0, cur: {}, n: 0, first: '', last: '', ids: {} } });
    var x = o[src], cu = _glStr_(l[7]) || 'EGP'; x.base = _glR2_(x.base + _glNum_(l[9]) - _glNum_(l[10])); x.ids[_glStr_(l[0])] = 1;
    x.cur[cu] = _glR2_((x.cur[cu] || 0) + _glNum_(l[5]) - _glNum_(l[6]));   // (V4.226) الرصيد بالعملات الفعلية
    if (!x.first || k < x.first) x.first = k; if (!x.last || k > x.last) x.last = k;
  });
  var fmt = function (k) { return k ? k.slice(6, 8) + '/' + k.slice(4, 6) + '/' + k.slice(0, 4) : ''; };
  var rows = Object.keys(by).map(function (c) { return by[c]; }).filter(function (o) { return o.erp.base || o.hb.base || (Object.keys(o.erp.ids).length && Object.keys(o.hb.ids).length); })
    .filter(function (o) { return Object.keys(o.erp.ids).length && Object.keys(o.hb.ids).length; })
    .map(function (o) {
      var a = accs[o.code] || {};
      return { code: o.code, name: a.name || o.code, kind: a.kind || '',
        erp: { base: o.erp.base, cur: o.erp.cur, n: Object.keys(o.erp.ids).length, first: fmt(o.erp.first), last: fmt(o.erp.last) },
        hb: { base: o.hb.base, cur: o.hb.cur, n: Object.keys(o.hb.ids).length, first: fmt(o.hb.first), last: fmt(o.hb.last) } };
    }).sort(function (a, b) { return (b.hb.n + b.erp.n) - (a.hb.n + a.erp.n); });
  var s = _glSettings_();
  return { success: true, rows: rows, hbFrom: s.hb_from || '', startDate: s.startDate };
}
// إلغاء قيود الـ ERP المنقولة المؤرَّخة من تاريخ معيّن فأكثر والتي تمسّ حسابات بعينها (حسابات أطراف الحجوزات) —
// لأن نفس الحركات تُسجَّل من برنامج الحجوزات. dry=true معاينة فقط. القيد الملغى يبقى ظاهراً للمراجعة.
function glHbErpVoid(authToken, o) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  o = o || {};
  var fromK = _glDKey_(_glDate_(o.from)); if (!fromK) throw new Error('حدد التاريخ');
  var codes = {}; (o.codes || []).forEach(function (c) { codes[_glStr_(c)] = 1; });
  if (!Object.keys(codes).length) throw new Error('اختر الحسابات');
  var lines = {}; _glRows_('lines').forEach(function (l) { (lines[_glStr_(l[0])] = lines[_glStr_(l[0])] || []).push(l); });
  var hits = [];
  _glRows_('entries').forEach(function (r) {
    if (_glStr_(r[5]) === GL_ST_VOID_ || _glSrcOf_(r) !== 'erp' || _glStr_(r[9]) === 'ERP-OPENING') return;
    var k = _glDKey_(_glDate_(r[2])); if (!k || k < fromK) return;
    if (!(lines[_glStr_(r[0])] || []).some(function (l) { return codes[_glStr_(l[4])]; })) return;
    hits.push({ id: _glStr_(r[0]), date: _glDate_(r[2]), desc: _glStr_(r[4]), base: _glNum_(r[8]), amt: _glAmtTxt_(lines[_glStr_(r[0])] || []), locked: _glLocked_(r[2]) });
  });
  if (o.dry) return { success: true, preview: hits };
  var n = 0, skipped = 0;
  hits.forEach(function (h) {
    if (h.locked) { skipped++; return; }
    glVoidEntry(authToken, h.id, 'مكرر مع قيود برنامج الحجوزات (المصدر من ' + _glDate_(o.from) + ')'); n++;
  });
  return { success: true, voided: n, skippedLocked: skipped };
}
/* 🧩 (V4.219) مطابقة قيود الـ ERP المنقولة مع قيود برنامج الحجوزات (بلا تكرار) — لكل قيد حجز/دفعة من الحجوزات يُبحث عن
   قيد الـ ERP المقابل له:
     الحجز: ① رقم القيد المسجَّل بالحجز (عمود «رقم القيد») = رقم قيد الـ ERP ② رقم تأكيد الفندق ③ رقم الحجز الداخلي — داخل بيان قيد ERP «حجز …»
     الدفعة: نفس حساب الطرف + نفس المبلغ والعملة والاتجاه + تاريخ ±3 أيام (ويُرفض لو تعددت المرشحات أو سبق استخدام قيد الـ ERP)
   ثم «حذف المطابق» (للمدير) يحذف قيود الـ ERP المطابقة فتبقى قيود الحجوزات وحدها — القيود غير المطابقة تُعرض لمراجعتها يدوياً. */
function glHbErpMatch(authToken) {
  _glPerm_(authToken, 'view');
  _GL_HB_MEMO_ = null;
  var H = _glHbRead_(), ents = {}, hbEnt = {}, erpList = [], lines = {};
  _glRows_('lines').forEach(function (l) { (lines[_glStr_(l[0])] = lines[_glStr_(l[0])] || []).push(l); });
  _glRows_('entries').forEach(function (r) {
    var id = _glStr_(r[0]), sk = _glStr_(r[6]); if (!id || _glStr_(r[5]) === GL_ST_VOID_) return;
    ents[id] = r;
    if (/^AUTO:HB/.test(sk)) hbEnt[sk] = id;
    if (/^ERP:/.test(sk)) {
      var ls = lines[id] || [], txt = _glStr_(r[4]) + ' ' + ls.map(function (l) { return _glStr_(l[15]); }).join(' ');
      erpList.push({ id: id, vid: sk.slice(4), date: _glDate_(r[2]), k: _glDKey_(_glDate_(r[2])), desc: _glStr_(r[4]), base: _glNum_(r[8]), txt: txt,
        isBooking: /(^|\s)(ايراد\s+)?حجز\s/.test(' ' + txt) || /ايراد حجز|خسارة حجز/.test(txt), lines: ls, locked: _glLocked_(r[2]) });
    }
  });
  var byVid = {}; erpList.forEach(function (x) { byVid[x.vid] = x; });
  var used = {}, out = { success: true, bookings: [], payments: [], hbUnmatched: 0, erpLeft: [] };
  var hasTok = function (txt, tok) {
    tok = _glStr_(tok); if (tok.length < 3) return false;
    var i = txt.indexOf(tok); if (i < 0) return false;
    var pre = txt.charAt(i - 1), post = txt.charAt(i + tok.length);
    return !/[0-9A-Za-z]/.test(pre) && !/[0-9A-Za-z]/.test(post);
  };
  // ① الحجوزات
  H.bookings.forEach(function (b) {
    var hid = hbEnt['AUTO:HB:' + b.key]; if (!hid) return;
    var hit = null, how = '';
    if (b.qaid && byVid[b.qaid] && !used[byVid[b.qaid].id]) { hit = byVid[b.qaid]; how = 'رقم القيد المسجَّل بالحجز'; }
    [['hotelRef', 'رقم تأكيد الفندق'], ['inner', 'رقم الحجز الداخلي']].forEach(function (p) {
      if (hit || !b[p[0]]) return;
      var c = erpList.filter(function (x) { return x.isBooking && !used[x.id] && hasTok(x.txt, b[p[0]]); });
      if (c.length === 1) { hit = c[0]; how = p[1]; }
      else if (c.length > 1) { var near = c.filter(function (x) { return x.date === b.ci; }); if (near.length === 1) { hit = near[0]; how = p[1] + ' + تاريخ الدخول'; } }
    });
    if (!hit) { out.hbUnmatched++; return; }
    used[hit.id] = 1;
    out.bookings.push({ hb: hid, hbDesc: _glStr_(ents[hid][4]), hbBase: _glNum_(ents[hid][8]), erp: hit.id, erpVid: hit.vid, erpDate: hit.date, erpDesc: hit.desc, erpBase: hit.base, how: how, locked: hit.locked,
      hbAmt: _glAmtTxt_(lines[hid] || []), erpAmt: _glAmtTxt_(hit.lines || []) });
  });
  // ② الدفعات: سطر الطرف بقيد HBP مقابل سطر بنفس الحساب/المبلغ/الاتجاه بقيد ERP غير حجز خلال ±3 أيام
  var dayN = function (k) { return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : NaN; };
  Object.keys(hbEnt).forEach(function (sk) {
    if (!/^AUTO:HB[PL]:/.test(sk)) return;
    var hid = hbEnt[sk], r = ents[hid], hk = dayN(_glDKey_(_glDate_(r[2])));
    var pl = (lines[hid] || [])[0]; if (!pl) return;   // السطر الأول = سطر الطرف
    var acc = _glStr_(pl[4]), d = _glNum_(pl[5]), c = _glNum_(pl[6]), cur = _glStr_(pl[7]);
    var cand = erpList.filter(function (x) {
      if (used[x.id] || x.isBooking || Math.abs(dayN(x.k) - hk) > 3) return false;
      return x.lines.some(function (l) { return _glStr_(l[4]) === acc && _glStr_(l[7]) === cur && Math.abs(_glNum_(l[5]) - d) < 0.01 && Math.abs(_glNum_(l[6]) - c) < 0.01; });
    });
    if (cand.length > 1) { var same = cand.filter(function (x) { return dayN(x.k) === hk; }); if (same.length === 1) cand = same; }
    if (cand.length !== 1) { out.hbUnmatched++; return; }
    var x = cand[0]; used[x.id] = 1;
    var am = _glAccounts_().map, ec = _glErpCashOf_(x.lines, acc, am), hc = _glErpCashOf_(lines[hid] || [], acc, am);
    out.payments.push({ payId: /^AUTO:HBP:/.test(sk) ? sk.slice(9) : '', erpCash: ec, hbCash: hc,
      fxFix: !!(ec && hc && (ec.cur !== hc.cur || Math.abs(ec.amt - hc.amt) >= 0.01)), hb: hid, hbDesc: _glStr_(r[4]), hbBase: _glNum_(r[8]), erp: x.id, erpVid: x.vid, erpDate: x.date, erpDesc: x.desc, erpBase: x.base, hbAmt: _glAmtTxt_(lines[hid] || []), erpAmt: _glAmtTxt_(x.lines || []),
      how: 'الطرف + ' + (d || c) + ' ' + cur + (Math.abs(dayN(x.k) - hk) ? ' (فرق ' + Math.abs(dayN(x.k) - hk) + ' يوم)' : ''), locked: x.locked });
  });
  // ③ قيود ERP تمسّ حسابات أطراف الحجوزات ولم تُطابق — للمراجعة اليدوية
  var hbAccs = {}; Object.keys(hbEnt).forEach(function (sk) { (lines[hbEnt[sk]] || []).forEach(function (l) { hbAccs[_glStr_(l[4])] = 1; }); });
  var fromK = _glDKey_(_glSettings_().hb_from || '') || '';
  erpList.forEach(function (x) {
    if (used[x.id] || (fromK && x.k < fromK)) return;
    if (!x.lines.some(function (l) { return hbAccs[_glStr_(l[4])]; })) return;
    out.erpLeft.push({ erp: x.id, erpVid: x.vid, date: x.date, desc: x.desc, base: x.base, isBooking: x.isBooking, amt: _glAmtTxt_(x.lines || []) });
  });
  out.erpLeft = out.erpLeft.slice(0, 500);
  return out;
}
// سطر النقدية (خزينة/بنك/عهدة/وكيل) بقيد دفعة: غير حساب الطرف وغير وسيط العملات — الأولوية لغير الريال
function _glErpCashOf_(ls, partyAcc, am) {
  var c = (ls || []).filter(function (l) { var a = am[_glStr_(l[4])]; return _glStr_(l[4]) !== partyAcc && !(a && a.kind === 'fx') && (_glNum_(l[5]) || _glNum_(l[6])); });
  if (!c.length) return null;
  var pick = c.filter(function (l) { var a = am[_glStr_(l[4])]; return a && /^(safe|bank|custody|agent)$/.test(a.kind); });
  if (pick.length) c = pick;
  var nz = c.filter(function (l) { return _glStr_(l[7]) !== 'SAR'; }); if (nz.length) c = nz;
  var l = c[0]; return { acc: _glStr_(l[4]), cur: _glCur_(_glStr_(l[7]) || 'EGP'), amt: _glR2_(_glNum_(l[5]) || _glNum_(l[6])) };
}
// يكتب مراجعة دفعة الحجوزات من المبلغ الفعلي بعملة النقدية (يحتفظ بحساب الطرف المختار إن وُجد)
function _glHbRevFromErp_(list, user) {
  var rev = _glHbPayRev_(), am = _glAccounts_().map, now = _glNow_(), done = [];
  list.forEach(function (x) {
    var c = x.cash; if (!c || !x.payId) return;
    var old = rev[x.payId] || {}, oa = old.cash && am[old.cash];
    var cash = (oa && !oa.isGroup && (!oa.currency || oa.currency === c.cur)) ? old.cash : c.acc;
    var ca = am[cash]; if (!ca || ca.isGroup || (ca.currency && ca.currency !== c.cur)) return;
    rev[x.payId] = { cash: cash, cur: c.cur, amount: c.cur === 'SAR' ? '' : c.amt, rate: '', by: user + ' (من الـ ERP)', at: now, party: old.party || '' };
    done.push(x.payId);
  });
  if (done.length) _glHbWriteAll_('hbpay', Object.keys(rev).map(function (id) { var r = rev[id]; return [id, r.cash, r.cur, r.amount || '', r.rate || '', r.by, r.at, r.party || '']; }));
  return done;
}
/* 🩹 (V4.226) تصحيح دفعات الحجوزات التي حُذف قيد الـ ERP المقابل لها سابقاً وسُجِّل جنيهها بالتقدير:
   يقرأ شيت الـ ERP الأصلي (Journal_Entries) ويطابق كل دفعة (نفس حساب الطرف بالريال + نفس المبلغ والاتجاه ± 3 أيام)
   ثم يأخذ المبلغ الفعلي بعملة الخزينة/البنك — التطبيق يحتفظ بالريال والجنيه المسجلين ويعدّل سعر الصرف فقط. */
function glHbFxFix(authToken, url, apply, payIds) {
  var session = apply ? _glAdminPerm_(authToken) : _glPerm_(authToken, 'view');
  url = _glStr_(url) || _glSettings_().erp_url || '';
  if (!url) throw new Error('أدخل رابط شيت الـ ERP الأصلي');
  var ss = _glErpOpen_(url);
  if (apply) _glSetSetting_('erp_url', url);
  _GL_HB_MEMO_ = null; _GL_ACC_MEMO_ = null;
  var accs = _glAccounts_(), am = accs.map, byLegacy = {};
  accs.list.forEach(function (a) { if (a.legacyId) byLegacy[a.legacyId] = a.code; });
  var vouchers = {};
  _glErpSheetObjs_(ss, 'Journal_Entries').forEach(function (l) {
    var vid = _glStr_(l.Voucher_ID), code = byLegacy[_glStr_(l.Account_ID)]; if (!vid || /^JV-OPENING/.test(vid)) return;
    var d = _glNum_(l.Debit), c = _glNum_(l.Credit); if (!d && !c) return;
    var v = (vouchers[vid] = vouchers[vid] || { vid: vid, date: _glDate_(l.Date), lines: [] });
    v.lines.push(['', '', '', '', code || ('?' + _glStr_(l.Account_ID)), d, c, _glCur_(l.Currency)]);
  });
  var vl = Object.keys(vouchers).map(function (k) { var v = vouchers[k]; v.day = _glHbDay_(v.date); return v; });
  var H = _glHbRead_(), map = _glHbMap_(), rev = _glHbPayRev_(), roles = _glAutoRoles_('', true);
  var hbL = {}, ents = {};
  _glRows_('entries').forEach(function (r) { var sk = _glStr_(r[6]); if (/^AUTO:HBP:/.test(sk) && _glStr_(r[5]) !== GL_ST_VOID_) ents[sk.slice(9)] = _glStr_(r[0]); });
  _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); (hbL[id] = hbL[id] || []).push(l); });
  var used = {}, out = [], stat = { pays: 0, matched: 0, same: 0, noErp: 0, ambiguous: 0 };
  H.pays.forEach(function (p) {
    if (p.linkId || !ents[p.id]) return;
    stat.pays++;
    var pr = rev[p.id] && rev[p.id].party, m = map[_glHbKey_(p.party)];
    var party = pr || (m ? (m.type === 'رحلة' ? roles.hb_trip : m.code) : ''); if (!party) return;
    var delta = GL_HB_CREDIT_DIRS_[p.dir] ? -p.amount : p.amount, amt = _glR2_(Math.abs(delta)), dr = delta > 0, day = _glHbDay_(p.date);
    var cand = vl.filter(function (v) {
      if (used[v.vid] || Math.abs(v.day - day) > 3) return false;
      return v.lines.some(function (l) { return l[4] === party && l[7] === 'SAR' && Math.abs((dr ? l[5] : l[6]) - amt) < 0.01; });
    });
    if (cand.length > 1) { var same = cand.filter(function (v) { return v.day === day; }); if (same.length === 1) cand = same; }
    if (cand.length !== 1) { if (cand.length) stat.ambiguous++; else stat.noErp++; return; }
    var v = cand[0], ec = _glErpCashOf_(v.lines, party, am); used[v.vid] = 1;
    if (!ec || /^\?/.test(ec.acc)) { stat.noErp++; return; }
    stat.matched++;
    var hc = _glErpCashOf_(hbL[ents[p.id]] || [], party, am);
    if (hc && hc.cur === ec.cur && Math.abs(hc.amt - ec.amt) < 0.01) { stat.same++; return; }
    out.push({ payId: p.id, entry: ents[p.id], date: p.date, party: p.party, dir: p.dir, sar: amt, vid: v.vid, erpDate: v.date,
      now: hc ? { acc: hc.acc, name: (am[hc.acc] || {}).name || hc.acc, cur: hc.cur, amt: hc.amt } : null,
      erp: { acc: ec.acc, name: (am[ec.acc] || {}).name || ec.acc, cur: ec.cur, amt: ec.amt, rate: ec.cur === 'SAR' ? 1 : Math.round(ec.amt / amt * 10000) / 10000 } });
  });
  if (!apply) return { success: true, rows: out, stat: stat, url: url };
  var want = {}; (payIds || []).forEach(function (id) { want[_glStr_(id)] = 1; });
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var done = _glHbRevFromErp_(out.filter(function (x) { return want[x.payId]; }).map(function (x) { return { payId: x.payId, cash: x.erp }; }), session.username);
    var r = done.length ? _glAutoRun_(session.username, false, { bypass: true, onlyKeys: done.map(function (id) { return 'AUTO:HBP:' + id; }) }) : { updated: 0 };
    logChange_(session.username, 'تصحيح مبالغ دفعات الحجوزات من الـ ERP', 'GL:hb', 'دفعات', '', done.length + ' دفعة — الريال والجنيه الفعليان وتعديل سعر الصرف');
    return { success: true, fixed: done.length, updated: r.updated || 0 };
  } finally { lock.releaseLock(); }
}
// حذف قيود الـ ERP المطابقة (للمدير): ids = أرقام قيود الـ ERP — لا يُحذف قيد في فترة مقفلة
// (V4.227) items: [{erp, hb, keep:'hb'|'erp'}] — «الحجوزات» يحذف قيد الـ ERP (والجنيه الفعلي يُنقل لمراجعة الدفعة)،
// و«الـ ERP» يحذف قيد الحجوزات التلقائي ويسجّل استبداله فلا تُعيده المزامنة (يُلغى الاستبدال من قائمته فيعود). ids نصية = الحجوزات.
function glHbErpMatchApply(authToken, items) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    var pairs = (items || []).map(function (x) { return typeof x === 'string' ? { erp: x, keep: 'hb' } : { erp: _glStr_(x.erp), hb: _glStr_(x.hb), keep: x.keep === 'erp' ? 'erp' : 'hb' }; });
    var M = null; try { M = glHbErpMatch(authToken); } catch (e) { }
    var pairOf = {}; if (M) M.bookings.concat(M.payments).forEach(function (x) { pairOf[x.erp] = x; });
    var delErp = {}, delHb = {}, hbFor = {};
    pairs.forEach(function (p) {
      if (p.keep === 'hb') { delErp[p.erp] = 1; return; }
      var hb = p.hb || (pairOf[p.erp] || {}).hb; if (hb) { delHb[hb] = 1; hbFor[hb] = p.erp; }
    });
    var sh = _glSheet_('entries'), rows = _glRows_('entries'), del = [], skipped = [], keepRows = [], now = _glNow_();
    rows.forEach(function (r, i) {
      var id = _glStr_(r[0]), sk = _glStr_(r[6]);
      if (delErp[id]) {
        if (!/^ERP:/.test(sk)) { skipped.push(id + ' (ليس من الـ ERP)'); return; }
        if (_glLocked_(r[2])) { skipped.push(id + ' (فترة مقفلة)'); return; }
        del.push({ id: id, row: i + 2, kind: 'erp' });
      } else if (delHb[id]) {
        if (!/^AUTO:HB/.test(sk)) { skipped.push(id + ' (ليس من الحجوزات)'); return; }
        if (_glLocked_(r[2])) { skipped.push(id + ' (فترة مقفلة)'); return; }
        del.push({ id: id, row: i + 2, kind: 'hb' });
        keepRows.push([sk, hbFor[id], _glStr_(r[4]), session.username, now]);
      }
    });
    if (!del.length) return { success: true, deleted: 0, skipped: skipped };
    // «الحجوزات»: قبل حذف قيد الـ ERP ينتقل المبلغ الفعلي بعملة الخزينة/البنك لمراجعة دفعة الحجوزات (الريال يبقى والسعر يتعدّل)
    var fixed = [];
    try {
      if (M) {
        var wantDel = {}; del.forEach(function (d) { if (d.kind === 'erp') wantDel[d.id] = 1; });
        var fx = M.payments.filter(function (x) { return wantDel[x.erp] && x.payId && x.erpCash; });
        if (fx.length) fixed = _glHbRevFromErp_(fx.map(function (x) { return { payId: x.payId, cash: x.erpCash }; }), session.username);
      }
    } catch (e) { }
    if (keepRows.length) { var kSh = _glSheet_('hbkeep'); kSh.getRange(kSh.getLastRow() + 1, 1, keepRows.length, keepRows[0].length).setValues(keepRows); }
    _glDeleteLinesOf_(del.map(function (d) { return d.id; }));
    var rs = del.map(function (d) { return d.row; }).sort(function (a, b) { return b - a; });
    for (var i = 0; i < rs.length; i++) { var j = i; while (j + 1 < rs.length && rs[j + 1] === rs[j] - 1) j++; sh.deleteRows(rs[j], i === j ? 1 : j - i + 1); i = j; }
    var nE = del.filter(function (d) { return d.kind === 'erp'; }), nH = del.filter(function (d) { return d.kind === 'hb'; });
    if (nE.length) logChange_(session.username, 'حذف قيود ERP مكررة مع الحجوزات', 'GL:hb-erp', 'اعتماد الحجوزات', nE.length + ' قيد', nE.map(function (d) { return d.id; }).slice(0, 60).join('، '));
    if (nH.length) logChange_(session.username, 'اعتماد قيود ERP بدل قيود الحجوزات', 'GL:hb-erp', 'اعتماد الـ ERP', nH.length + ' قيد حجوزات', nH.map(function (d) { return d.id + '→' + hbFor[d.id]; }).slice(0, 60).join('، '));
    if (fixed.length) try { _glAutoRun_(session.username, false, { bypass: true, onlyKeys: fixed.map(function (id) { return 'AUTO:HBP:' + id; }) }); } catch (e) { }
    return { success: true, deleted: del.length, deletedErp: nE.length, deletedHb: nH.length, skipped: skipped, fxFixed: fixed.length };
  } finally { lock.releaseLock(); }
}
function _glHbKeepMap_() { var o = {}; try { _glRows_('hbkeep').forEach(function (r) { var k = _glStr_(r[0]); if (k) o[k] = _glStr_(r[1]); }); } catch (e) { } return o; }
function glHbKeepList(authToken) {
  _glPerm_(authToken, 'view');
  var ents = {}; _glRows_('entries').forEach(function (r) { ents[_glStr_(r[0])] = r; });
  var out = [];
  try { _glRows_('hbkeep').forEach(function (r) { var k = _glStr_(r[0]); if (!k) return; var e = ents[_glStr_(r[1])]; out.push({ key: k, erp: _glStr_(r[1]), erpDesc: e ? _glStr_(e[4]) : '(قيد الـ ERP غير موجود)', erpDate: e ? _glDate_(e[2]) : '', hbDesc: _glStr_(r[2]), by: _glStr_(r[3]), at: _glStr_(r[4]) }); }); } catch (e) { }
  return { success: true, rows: out.reverse() };
}
// إلغاء الاستبدال: يعود قيد الحجوزات التلقائي بالمزامنة التالية (ويبقى قيد الـ ERP — راجع المطابقة لحذف أحدهما)
function glHbKeepUndo(authToken, keys) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  var want = {}; (keys || []).forEach(function (k) { want[_glStr_(k)] = 1; });
  var sh = _glSheet_('hbkeep'), rows = _glRows_('hbkeep'), keep = rows.filter(function (r) { return _glStr_(r[0]) && !want[_glStr_(r[0])]; });
  var W = GL_SHEETS_.hbkeep.headers.length, last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, W).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, W).setValues(keep);
  logChange_(session.username, 'إلغاء اعتماد الـ ERP بدل الحجوزات', 'GL:hb-erp', 'قيود', '', (rows.length - keep.length) + ' قيد يعود من الحجوزات');
  return { success: true, restored: rows.length - keep.length };
}
function glHbState(authToken) {
  _glPerm_(authToken, 'view');
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_HB_MEMO_ = null;
  var c = _glHbCfg_();
  var res = { success: true, on: !!c.ssId, cfg: c, types: Object.keys(GL_HB_TYPES_).map(function (t) { return { v: t, label: GL_HB_TYPES_[t].label, parent: GL_HB_TYPES_[t].parent }; }) };
  if (!c.ssId) return res;
  var H = _glHbRead_(), roles = _glAutoRoles_('', true), accs = _glAccounts_(), map = _glHbMap_(), rev = _glHbPayRev_(), ov = _glHbTripOv_(), ctx = _glHbTripCtx_();
  var P = _glHbParties_(H), ents = _glHbEntryIds_(), hbBal = _glHbLineBal_(true);
  res.roles = {}; Object.keys(GL_HB_ROLES_).concat(['cost_house']).forEach(function (r) { var a = accs.map[roles[r]]; res.roles[r] = { code: roles[r], name: a ? a.name : GL_HB_ROLES_[r] ? GL_HB_ROLES_[r][1] : '', virtual: !!(a && a._virtual) }; });
  res.accounts = accs.list.filter(function (a) { return !a._virtual; }).map(function (a) { return { code: a.code, name: a.name, kind: a.kind, isGroup: a.isGroup, currency: a.currency, link: a.link }; });
  res.trips = Object.keys(ctx.trips).sort();
  res.parties = Object.keys(P).map(function (k) {
    var p = P[k], m = map[k], pr = H.prof[k];
    var g = m && m.code ? (hbBal[m.code] || { SAR: 0 }) : null;
    return { key: k, name: p.name, asClient: p.asClient, asSup: p.asSup, pays: p.pays, bal: p.bal, sale: p.sale, cost: p.cost, unpriced: p.unpriced,
      prof: pr ? { type: pr.type, role: pr.role, notes: pr.notes } : null, map: m ? { type: m.type, code: m.code, link: m.link, notes: m.notes } : null,
      sug: _glHbSuggest_(p, pr, accs), gl: g ? g.SAR : null };
  }).sort(function (a, b) { return (a.map ? 1 : 0) - (b.map ? 1 : 0) || (b.asClient + b.asSup + b.pays) - (a.asClient + a.asSup + a.pays); });
  var cands = _glHbCashCands_();
  res.pays = H.pays.map(function (p) {
    var e = ents['AUTO:HBP:' + p.id] || (p.linkId ? ents['AUTO:HBL:' + p.linkId] : null);
    return { id: p.id, date: p.date, party: p.party, dir: p.dir, amount: p.amount, note: p.note, qaid: p.qaid, linkId: p.linkId,
      rev: rev[p.id] || p.meta || null, sug: _glHbPaySuggest_(p, cands, roles), entry: e ? e.id : '',
      pcode: (function () { var m = map[_glHbKey_(p.party)]; return m ? (m.type === 'رحلة' ? ((roles.hb_trip || {}).code || roles.hb_trip || '') : m.code) : ''; })(), party2: (rev[p.id] || {}).party || '' };
  }).sort(function (a, b) { return _glDKey_(b.date).localeCompare(_glDKey_(a.date)); });
  // ربط الرحلات: حجوزات عملاء العمرة ورحلات الشركة، وأي حجز له تحديد يدوي
  res.tripRows = [];
  H.bookings.forEach(function (b) {
    if (b.status === 'لاغي') return;
    var m = map[_glHbKey_(b.client)];
    var rel = m && (m.type === 'عميل عمرة' || m.type === 'رحلة');
    if (!rel && ov[b.key] === undefined) return;
    var auto = { trip: '', hits: 0, cands: 0 };
    if (m && m.type === 'رحلة') auto = { trip: m.link || '', hits: m.link ? 1 : 0, cands: 1, byName: true };
    else if (m && m.type === 'عميل عمرة') { var a = accs.map[m.code]; auto = _glHbAutoTrip_(b, (a && a.link) || m.name, ctx); }
    var e = ents['AUTO:HB:' + b.key];
    res.tripRows.push({ key: b.key, city: b.city, inner: b.inner, client: b.client, supplier: b.supplier, hotel: b.hotel, ci: b.ci, co: b.co, nights: b.nights,
      type: m ? m.type : '', auto: auto.trip, hits: auto.hits, cands: auto.cands, ov: ov[b.key] === undefined ? null : ov[b.key], sale: b.sale.value, cost: b.cost.value, entry: e ? e.id : '' });
  });
  res.stats = { bookings: H.bookings.length, active: H.bookings.filter(function (b) { return b.status !== 'لاغي'; }).length, pays: H.pays.length,
    parties: res.parties.length, mapped: res.parties.filter(function (p) { return p.map; }).length, reviewed: res.pays.filter(function (p) { return p.rev; }).length,
    entries: Object.keys(ents).filter(function (k) { return ents[k].st === GL_ST_POSTED_; }).length };
  _GL_ACC_MEMO_ = null;
  return res;
}
// حفظ خريطة الأسماء — وإنشاء الحسابات الناقصة تحت آبائها (لا تكرار: حساب قائم بنفس الربط/الاسم يُعاد استخدامه)
function glHbSaveMap(authToken, rows) {
  var session = _glAdminPerm_(authToken);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var accs = _glAccounts_(), map = _glHbMap_(), taken = {}, newAcc = [], made = [], now = _glNow_();
    (rows || []).forEach(function (x) {
      var name = _glStr_(x.name), type = _glStr_(x.type); if (!name) return;
      if (!GL_HB_TYPES_[type]) throw new Error('نوع غير معروف للاسم «' + name + '»: ' + type);
      var T = GL_HB_TYPES_[type], code = _glStr_(x.code), nk = _glNorm_(name);
      if (T.parent) {
        if (code) {
          var a = accs.map[code];
          if (!a) throw new Error('الحساب ' + code + ' غير موجود («' + name + '»)');
          if (a.isGroup) throw new Error('«' + a.name + '» حساب تجميعي — اختر حساباً فرعياً («' + name + '»)');
        } else {
          var ex = accs.list.filter(function (a) { return !a.isGroup && a.code.indexOf(T.parent) === 0 && ((a.link && _glNorm_(a.link) === nk) || _glNorm_(a.name) === nk); })[0];
          if (ex) code = ex.code;
          else {
            var par = accs.map[T.parent];
            if (!par || !par.isGroup) throw new Error('المجموعة ' + T.parent + ' غير موجودة بالدليل');
            code = _glNextCodeIn_(T.parent, taken); taken[code] = 1;
            var row = _glAccRow_({ code: code, name: name, type: par.type, parent: T.parent, kind: T.kind, link: name, notes: 'من برنامج حجوزات الفنادق' }, session.username);
            newAcc.push(row); _glMemoAddAcc_(row); made.push(code + ' — ' + name);
          }
        }
      } else code = '';
      map[_glHbKey_(name)] = { name: name, type: type, code: code, link: _glStr_(x.link), notes: _glStr_(x.notes), by: session.username, at: now };
    });
    if (newAcc.length) { var sh = _glSheet_('accounts'); sh.getRange(sh.getLastRow() + 1, 1, newAcc.length, GL_SHEETS_.accounts.headers.length).setValues(newAcc); _GL_ACC_MEMO_ = null; }
    _glHbWriteAll_('hbmap', Object.keys(map).map(function (k) { var m = map[k]; return [m.name, m.type, m.code, m.link || '', m.notes || '', m.by || session.username, m.at || now]; }));
    logChange_(session.username, 'خريطة حسابات برنامج الحجوزات', 'GL:hb', '-', '-', (rows || []).length + ' اسم، حسابات جديدة ' + made.length);
    return { success: true, saved: (rows || []).length, made: made };
  } finally { lock.releaseLock(); }
}
function _glHbWriteAll_(key, rows) {
  var sh = _glSheet_(key), n = GL_SHEETS_[key].headers.length, last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, n).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, n).setValues(rows);
}
// مراجعة الدفعات: [{id, cash, cur, amount, rate}] — cash فارغ يحذف المراجعة (ترجع لتحت التسوية)
function glHbSavePay(authToken, rows) {
  var session = _glPerm_(authToken, 'add');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    _glAutoRoles_(session.username, false); _GL_ACC_MEMO_ = null;   // حسابات الأدوار (تحت التسوية/عبر الوكيل…) قد تُختار هنا قبل أول مزامنة
    var accs = _glAccounts_().map, rev = _glHbPayRev_(), now = _glNow_(), n = 0;
    (rows || []).forEach(function (x) {
      var id = _glStr_(x.id); if (!id) return;
      var party = _glStr_(x.party);
      if (party) { var pa = accs[party]; if (!pa || pa.isGroup) throw new Error('حساب الطرف ' + party + ' غير صالح'); }
      if (!_glStr_(x.cash) && !party) { delete rev[id]; n++; return; }
      var a = _glStr_(x.cash) ? accs[x.cash] : null;
      if (_glStr_(x.cash) && (!a || a.isGroup)) throw new Error('الحساب النقدي ' + x.cash + ' غير صالح');
      var cur = _glCur_(x.cur || (a && a.currency) || 'SAR');
      if (a && a.currency && a.currency !== cur) throw new Error('عملة الحساب «' + a.name + '» هي ' + a.currency);
      rev[id] = { cash: _glStr_(x.cash), cur: cur, amount: _glR2_(_glNum_(x.amount)), rate: _glNum_(x.rate), by: session.username, at: now, party: party }; n++;
    });
    _glHbWriteAll_('hbpay', Object.keys(rev).map(function (id) { var r = rev[id]; return [id, r.cash, r.cur, r.amount || '', r.rate || '', r.by, r.at, r.party || '']; }));
    logChange_(session.username, 'مراجعة دفعات برنامج الحجوزات', 'GL:hb', '-', '-', n + ' دفعة');
    return { success: true, saved: n };
  } finally { lock.releaseLock(); }
}
// تحديد رحلة حجز يدوياً: trip='' يعيد التلقائي، '-' بلا رحلة
function glHbSaveTrip(authToken, rows) {
  var session = _glPerm_(authToken, 'add');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var ov = {}, now = _glNow_(), meta = {};
    _glRows_('hbtrip').forEach(function (r) { var k = _glStr_(r[0]); if (k) { ov[k] = _glStr_(r[1]); meta[k] = [_glStr_(r[2]), _glStr_(r[3])]; } });
    (rows || []).forEach(function (x) { var k = _glStr_(x.key); if (!k) return; if (x.trip === null || _glStr_(x.trip) === '') { delete ov[k]; return; } ov[k] = _glStr_(x.trip); meta[k] = [session.username, now]; });
    _glHbWriteAll_('hbtrip', Object.keys(ov).map(function (k) { return [k, ov[k], meta[k][0], meta[k][1]]; }));
    logChange_(session.username, 'ربط حجوزات الفنادق بالرحلات', 'GL:hb', '-', '-', (rows || []).length + ' حجز');
    return { success: true };
  } finally { lock.releaseLock(); }
}
// المطابقة: رصيد كل طرف بمنطق كشف الحساب ببرنامج الحجوزات ↔ رصيد حسابه من قيود الحجوزات بالدفتر (بالريال)
function glHbReconcile(authToken) {
  _glPerm_(authToken, 'view');
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_HB_MEMO_ = null;
  var cashIn = {};
  var H = _glHbRead_(), P = _glHbParties_(H), map = _glHbMap_(), bal = _glHbLineBal_(true, cashIn), all = _glHbLineBal_(false), accs = _glAccounts_().map, roles = _glAutoRoles_('', true);
  var byCode = {}, rows = [], info = [];
  Object.keys(P).forEach(function (k) {
    var p = P[k], m = map[k];
    if (!m) { if (p.bal) info.push({ name: p.name, why: 'بلا ربط', app: p.bal }); return; }
    if (m.type === 'تجاهل') { if (p.bal) info.push({ name: p.name, why: 'متجاهَل', app: p.bal }); return; }
    if (m.type === 'رحلة') { info.push({ name: p.name, why: 'رحلة الشركة — بالتكلفة فقط (البيع لا يُسجَّل)', app: p.bal }); return; }
    var o = byCode[m.code] || (byCode[m.code] = { code: m.code, names: [], app: 0 });
    o.names.push(p.name); o.app = _glR2_(o.app + p.bal);
  });
  Object.keys(byCode).forEach(function (code) {
    var o = byCode[code], b = bal[code] || { EGP: 0, SAR: 0, USD: 0 }, a = accs[code];
    var d = _glR2_(o.app - b.SAR);
    rows.push({ code: code, acc: a ? a.name : '?', names: o.names, app: o.app, gl: b.SAR, glE: b.EGP, d: d, ok: Math.abs(d) < 0.5 });
  });
  rows.sort(function (a, b) { return (a.ok === b.ok ? 0 : (a.ok ? 1 : -1)) || Math.abs(b.d) - Math.abs(a.d); });
  var clear = ['hb_cash', 'hb_link', 'hb_manual', 'hb_trip', 'hb_via'].map(function (r) { var c = roles[r], b = all[c] || { EGP: 0, SAR: 0, USD: 0 }; return { role: r, code: c, name: GL_HB_ROLES_[r][1], SAR: b.SAR, EGP: b.EGP, USD: b.USD }; });
  var roleCodes = {}; clear.forEach(function (x) { roleCodes[x.code] = 1; });
  var cash = Object.keys(cashIn).filter(function (c) { return !roleCodes[c]; }).map(function (c) { var o = cashIn[c], a = accs[c]; return { code: c, name: a ? a.name : '?', kind: a ? a.kind : '', n: o.n, SAR: o.SAR, EGP: o.EGP, USD: o.USD }; })
    .sort(function (a, b) { return b.n - a.n; });
  _GL_ACC_MEMO_ = null;
  return { success: true, rows: rows, info: info, clearing: clear, cash: cash };
}
// 🏁 (V4.208-H2) ترحيل أرباح الموردين لإيرادات السكن نهاية الموسم: قيد يومية مرحّل (غير تلقائي) يُصفّي رصيد كل
// حساب «إيرادات حجوزات — المورد» حتى التاريخ إلى «إيرادات السكن». يمكن تكراره (يرحّل ما استجد بعد آخر ترحيل فقط).
function _glHbSeasonPlan_(date) {
  var d = _glDate_(date); if (!d) throw new Error('تاريخ الترحيل غير صالح');
  var roles = _glAutoRoles_('', true), accs = _glAccounts_(), grp = roles.hb_revgrp, bal = _glBalances_(d), rows = [], tot = 0;
  accs.list.forEach(function (a) {
    if (a.isGroup || a.code.indexOf(grp) !== 0 || a.code === grp) return;
    var b = bal[a.code]; if (!b) return;
    var net = _glR2_(b.SAR), base = _glR2_(b.base); if (Math.abs(net) < 0.005 && Math.abs(base) < 0.005) return;
    rows.push({ code: a.code, name: a.name, SAR: -net, base: -base }); tot = _glR2_(tot - net);
  });
  rows.sort(function (x, y) { return y.SAR - x.SAR; });
  return { date: d, rows: rows, total: tot, target: roles.hb_rev, targetName: (accs.map[roles.hb_rev] || {}).name || 'إيرادات السكن' };
}
function glHbSeasonPreview(authToken, date) { _glPerm_(authToken, 'view'); _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; var r = _glHbSeasonPlan_(date); r.success = true; return r; }
function glHbSeasonClose(authToken, date) {
  var session = _glAdminPerm_(authToken);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var P = _glHbSeasonPlan_(date);
    if (!P.rows.length) throw new Error('لا توجد أرباح موردين غير مرحّلة حتى ' + P.date);
    var lines = [], net = 0;
    P.rows.forEach(function (r) {   // رصيد دائن (ربح) ⇐ يُجعل مديناً لتصفيته
      var amt = Math.abs(r.SAR), rate = amt ? Math.round(Math.abs(r.base / r.SAR) * 1e6) / 1e6 : 1;
      if (amt >= 0.005) lines.push({ account: r.code, debit: r.SAR > 0 ? amt : 0, credit: r.SAR < 0 ? amt : 0, currency: 'SAR', rate: rate, exact: 1, desc: 'ترحيل ربح حجوزات ' + r.name + ' لإيرادات السكن' });
      net += r.base;
    });
    net = _glR2_(net);
    var tot = _glR2_(P.total);
    lines.push({ account: P.target, debit: tot < 0 ? -tot : 0, credit: tot > 0 ? tot : 0, currency: 'SAR', rate: tot ? Math.round(Math.abs(net / tot) * 1e6) / 1e6 : _glRates_().SAR, exact: 1, desc: 'أرباح حجوزات الفنادق حتى ' + P.date });
    var v = _glValidate_({ date: P.date, type: 'قيد يومية', desc: 'ترحيل أرباح حجوزات الفنادق (حسابات الموردين) إلى إيرادات السكن حتى ' + P.date, lines: lines }, { allowBeforeStart: true, noBridge: true });
    var seq = _glNextEntrySeq_(1), id = _glEntryId_(seq);
    var w = _glWriteEntry_(v, { id: id, seq: seq, status: GL_ST_POSTED_, sourceKey: 'HBSEASON:' + P.date, desc: 'ترحيل أرباح حجوزات الفنادق (حسابات الموردين) إلى إيرادات السكن حتى ' + P.date }, session.username);
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    eSh.getRange(eSh.getLastRow() + 1, 1, 1, w.eRow.length).setValues([w.eRow]);
    lSh.getRange(lSh.getLastRow() + 1, 1, w.lRows.length, w.lRows[0].length).setValues(w.lRows);
    logChange_(session.username, 'ترحيل أرباح حجوزات الفنادق لإيرادات السكن', 'GL:' + id, '-', '-', P.rows.length + ' مورد — ' + tot + ' ريال حتى ' + P.date);
    return { success: true, id: id, total: tot, count: P.rows.length };
  } finally { lock.releaseLock(); }
}

/* ============================================================================
   🛏️ (V4.210) المرحلة H3 — سكن الرحلات وعقود الشارت
   ----------------------------------------------------------------------------
   • سكن الرحلات: كل حجوزات الفنادق المرتبطة برحلة عمرة (رحلات الشركة، وحجوزات عملاء العمرة بالربط
     التلقائي أو اليدوي) مجمّعة بالرحلة والمدينة: الغرف والسعة (أفراد) مقابل عدد المعتمرين بالكشف،
     والفندق المخطط بالرحلة مقابل المحجوز فعلاً، والتكلفة والبيع ورقم القيد الآلي.
   • عقود الشارت: سجل العقود (الشارت، الفندق، الفترة، عدد الغرف، القيمة)، واستغلال كل ليلة من الفترة
     (المحجوز من الشارت مقابل المتعاقد عليه)، والفترات الفارغة المتاحة للبيع، والمدفوع مقابل المسحوب،
     وقيد «تسوية شارت» للغرف غير المستغلة نهاية العقد (من ح/ تكلفة السكن إلى ح/ الشارت).
   ============================================================================ */
function _glHbFromDay_(d) { var x = new Date(d * 864e5); return ('0' + x.getUTCDate()).slice(-2) + '/' + ('0' + (x.getUTCMonth() + 1)).slice(-2) + '/' + x.getUTCFullYear(); }
function _glHbRoomsN_(b) { return (b.rooms || []).reduce(function (a, n) { return a + (n > 0 ? n : 0); }, 0); }
function _glHbCap_(b) { var r = b.rooms || []; return (r[0] || 0) * 2 + (r[1] || 0) * 3 + (r[2] || 0) * 4 + (r[3] || 0) * 5; }

function glHbTripHousing(authToken) {
  _glPerm_(authToken, 'view');
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_HB_MEMO_ = null;
  var H = _glHbRead_(), map = _glHbMap_(), ov = _glHbTripOv_(), ctx = _glHbTripCtx_(), accs = _glAccounts_().map, ents = _glHbEntryIds_();
  var T = {};
  H.bookings.forEach(function (b) {
    if (b.status === 'لاغي') return;
    var cm = map[_glHbKey_(b.client)] || null;
    var trip = _glHbTripOf_(b, cm, ov, ctx, accs); if (!trip) return;
    var t = T[trip] || (T[trip] = { trip: trip, rows: [], city: {} });
    var e = ents['AUTO:HB:' + b.key], rn = _glHbRoomsN_(b);
    t.rows.push({ key: b.key, city: b.city, inner: b.inner, client: b.client, hotel: b.hotel, supplier: b.supplier, ci: b.ci, co: b.co, nights: b.nights,
      rooms: b.rooms, roomsN: rn, cap: _glHbCap_(b), cost: b.cost.hasPrice ? b.cost.value : null, sale: b.sale.hasPrice ? b.sale.value : null, status: b.status, entry: e ? e.id : '' });
    var c = t.city[b.city] || (t.city[b.city] = { rooms: 0, cap: 0, rn: 0, cost: 0, sale: 0, hotels: {} });
    c.rooms += rn; c.cap += _glHbCap_(b); c.rn += rn * (b.nights || 0); c.cost = _glR2_(c.cost + (b.cost.hasPrice ? b.cost.value : 0)); c.sale = _glR2_(c.sale + (b.sale.hasPrice ? b.sale.value : 0));
    c.hotels[b.hotel] = 1;
  });
  var out = Object.keys(T).map(function (k) {
    var t = T[k], ti = ctx.trips[k] || {}, pil = ctx.pilg[k] || 0, warn = [];
    t.company = ti.company || ''; t.go = ti.go || ''; t.back = ti.back || ''; t.pilgrims = pil; t.known = !!ctx.trips[k];
    t.planned = { 'مكة': ti.mkHotel || '', 'المدينة': ti.mdHotel || '' };
    ['مكة', 'المدينة'].forEach(function (cty) {
      var c = t.city[cty]; if (!c) return;
      c.hotels = Object.keys(c.hotels);
      if (pil && c.cap < pil) warn.push(cty + ': سعة الغرف ' + c.cap + ' فرد أقل من عدد المعتمرين ' + pil);
      var pl = _glNorm_(t.planned[cty]);
      if (pl && !c.hotels.some(function (h) { var hn = _glNorm_(h); return hn && (hn.indexOf(pl) >= 0 || pl.indexOf(hn) >= 0); })) warn.push(cty + ': الفندق المخطط «' + t.planned[cty] + '» غير موجود بالحجوزات');
    });
    if (!t.known) warn.push('اسم الرحلة غير موجود بشاشة الرحلات');
    t.warn = warn;
    t.cost = _glR2_(Object.keys(t.city).reduce(function (a, c) { return a + t.city[c].cost; }, 0));
    t.sale = _glR2_(Object.keys(t.city).reduce(function (a, c) { return a + t.city[c].sale; }, 0));
    t.rows.sort(function (a, b) { return _glDKey_(a.ci).localeCompare(_glDKey_(b.ci)); });
    return t;
  }).sort(function (a, b) { return _glDKey_(a.go || (a.rows[0] || {}).ci || '').localeCompare(_glDKey_(b.go || (b.rows[0] || {}).ci || '')); });
  return { success: true, trips: out };
}

function _glHbCharterRows_() {
  return _glRows_('hbchar').map(function (r, i) {
    return { id: _glStr_(r[0]), name: _glStr_(r[1]), hotel: _glStr_(r[2]), city: _glStr_(r[3]), from: _glDate_(r[4]), to: _glDate_(r[5]),
      rooms: _glNum_(r[6]), value: _glNum_(r[7]), cur: _glStr_(r[8]) ? _glCur_(r[8]) : 'SAR', notes: _glStr_(r[9]), _row: i + 2 };
  }).filter(function (c) { return c.id && c.name; });
}
function glHbCharters(authToken) {
  _glPerm_(authToken, 'view');
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_HB_MEMO_ = null;
  var H = _glHbRead_(), P = _glHbParties_(H), map = _glHbMap_(), bal = _glHbLineBal_(true), accs = _glAccounts_().map, rates = _glRates_();
  var contracts = _glHbCharterRows_(), names = {};
  Object.keys(map).forEach(function (k) { if (map[k].type === 'شارت') names[k] = map[k].name; });
  contracts.forEach(function (c) { var k = _glHbKey_(c.name); if (!names[k]) names[k] = c.name; });
  var out = Object.keys(names).map(function (k) {
    var m = map[k] || {}, p = P[k] || { bal: 0, cost: 0, sale: 0 };
    var asSup = H.bookings.filter(function (b) { return b.status !== 'لاغي' && _glHbKey_(b.supplier) === k; });
    var asCli = H.bookings.filter(function (b) { return b.status !== 'لاغي' && _glHbKey_(b.client) === k; });
    var paid = 0;
    H.pays.forEach(function (x) { if (_glHbKey_(x.party) === k) paid += GL_HB_CREDIT_DIRS_[x.dir] ? -x.amount : x.amount; });
    var drawn = 0, sold = 0, rnUsed = 0;
    asSup.forEach(function (b) { if (b.cost.hasPrice) drawn += b.cost.value; rnUsed += _glHbRoomsN_(b) * (b.nights || 0); });
    // البيع الفعلي لغرف الشارت = بيع الحجوزات التي مصدرها الشارت (للعملاء والرحلات)
    asSup.forEach(function (b) { if (b.sale.hasPrice) sold += b.sale.value; });
    var gl = m.code && bal[m.code] ? bal[m.code].SAR : 0;
    var cons = contracts.filter(function (c) { return _glHbKey_(c.name) === k; }).map(function (c) {
      var a = _glHbDay_(c.from), z = _glHbDay_(c.to);
      var mine = asSup.filter(function (b) { var d = _glHbDay_(b.ci); return isNaN(a) || isNaN(z) || (d >= a && d < z); });
      var o = { id: c.id, hotel: c.hotel, city: c.city, from: c.from, to: c.to, rooms: c.rooms, value: c.value, cur: c.cur, notes: c.notes, bookings: mine.length, drawn: 0, rnUsed: 0 };
      mine.forEach(function (b) { if (b.cost.hasPrice) o.drawn += b.cost.value; o.rnUsed += _glHbRoomsN_(b) * (b.nights || 0); });
      o.drawn = _glR2_(o.drawn);
      if (!isNaN(a) && !isNaN(z) && z > a && c.rooms > 0) {
        var used = {}, free = [], over = [];
        mine.forEach(function (b) { var d0 = _glHbDay_(b.ci), n = Math.round(b.nights || 0), rn = _glHbRoomsN_(b); for (var d = d0; d < d0 + n; d++) used[d] = (used[d] || 0) + rn; });
        var rangeOf = function (arr, d, v) { var last = arr[arr.length - 1]; if (last && last.z === d - 1 && last.v === v) last.z = d; else arr.push({ a: d, z: d, v: v }); };
        for (var d = a; d < z; d++) { var u = used[d] || 0; if (u < c.rooms) rangeOf(free, d, c.rooms - u); else if (u > c.rooms) rangeOf(over, d, u - c.rooms); }
        var fmt = function (r) { return { from: _glHbFromDay_(r.a), to: _glHbFromDay_(r.z + 1), nights: r.z - r.a + 1, rooms: r.v }; };
        o.nights = z - a; o.rnContract = c.rooms * (z - a);
        o.rnFree = free.reduce(function (s, r) { return s + r.v * (r.z - r.a + 1); }, 0);
        o.util = o.rnContract ? Math.round((o.rnContract - o.rnFree) / o.rnContract * 1000) / 10 : 0;
        o.free = free.map(fmt); o.over = over.map(fmt);
        o.unusedValue = o.rnContract ? _glR2_(c.value * o.rnFree / o.rnContract) : 0;
        var today = Math.floor(Date.now() / 864e5);
        o.ended = today >= z;
      }
      return o;
    });
    var value = cons.reduce(function (s, c) { return s + (c.cur === 'SAR' ? c.value : c.value * (rates[c.cur] || 1) / rates.SAR); }, 0);
    return { key: k, name: names[k], code: m.code || '', acc: m.code && accs[m.code] ? accs[m.code].name : '', mapped: m.type === 'شارت',
      bookings: asSup.length, rnUsed: rnUsed, drawn: _glR2_(drawn), sold: _glR2_(sold), margin: _glR2_(sold - drawn), paid: _glR2_(paid),
      appBal: _glR2_(p.bal), gl: gl, value: _glR2_(value), remainingPay: _glR2_(value - paid), prepaid: _glR2_(paid - drawn),
      shortBuys: asCli.length, shortSale: _glR2_(asCli.reduce(function (s, b) { return s + (b.sale.hasPrice ? b.sale.value : 0); }, 0)), contracts: cons };
  }).sort(function (a, b) { return b.drawn - a.drawn; });
  _GL_ACC_MEMO_ = null;
  return { success: true, charters: out, hotels: H.bookings.map(function (b) { return b.hotel; }).filter(function (h, i, a) { return h && a.indexOf(h) === i; }).sort() };
}
function glHbSaveCharter(authToken, c) {
  var session = _glPerm_(authToken, c && c.id ? 'edit' : 'add');
  c = c || {};
  var name = _glStr_(c.name); if (!name) throw new Error('اسم الشارت مطلوب (كما هو ببرنامج الحجوزات)');
  var from = _glDate_(c.from), to = _glDate_(c.to);
  if (!from || !to || _glDKey_(to) <= _glDKey_(from)) throw new Error('فترة العقد غير صحيحة (من … إلى)');
  if (!(_glNum_(c.rooms) > 0)) throw new Error('عدد الغرف مطلوب');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = _glSheet_('hbchar'), rows = _glHbCharterRows_(), id = _glStr_(c.id) || ('CH' + Date.now().toString(36).toUpperCase());
    var row = [id, name, _glStr_(c.hotel), _glStr_(c.city), from, to, _glNum_(c.rooms), _glR2_(_glNum_(c.value)), _glCur_(c.cur || 'SAR'), _glStr_(c.notes), session.username, _glNow_()];
    var ex = rows.filter(function (x) { return x.id === id; })[0];
    if (ex) sh.getRange(ex._row, 1, 1, row.length).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    logChange_(session.username, ex ? 'تعديل عقد شارت' : 'إضافة عقد شارت', 'GL:hbchar', '-', '-', name + ' ' + from + ' → ' + to + ' — ' + c.rooms + ' غرفة');
    return { success: true, id: id };
  } finally { lock.releaseLock(); }
}
function glHbDeleteCharter(authToken, id) {
  var session = _glPerm_(authToken, 'delete');
  var r = _glHbCharterRows_().filter(function (x) { return x.id === _glStr_(id); })[0];
  if (!r) throw new Error('العقد غير موجود');
  _glSheet_('hbchar').deleteRow(r._row);
  logChange_(session.username, 'حذف عقد شارت', 'GL:hbchar', '-', '-', r.name + ' ' + r.from + ' → ' + r.to);
  return { success: true };
}
// تسوية شارت: المدفوع للشارت ولم يُستهلك بحجوزات (غرف غير مستغلة) يُحمَّل تكلفةً نهاية العقد — قيد يومية مرحّل
function glHbCharterSettle(authToken, code, date, amount, note) {
  var session = _glPerm_(authToken, 'edit');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var a = _glAccounts_().map[_glStr_(code)];
    if (!a || a.isGroup) throw new Error('حساب الشارت غير موجود');
    var amt = _glR2_(_glNum_(amount)); if (!(amt > 0)) throw new Error('المبلغ غير صحيح');
    var d = _glDate_(date); if (!d) throw new Error('التاريخ غير صحيح');
    var roles = _glAutoRoles_(session.username, false);
    var desc = 'تسوية شارت ' + a.name + ' — غرف غير مستغلة' + (_glStr_(note) ? ' — ' + _glStr_(note) : '');
    var v = _glValidate_({ date: d, type: 'قيد يومية', desc: desc, lines: [
      { account: roles.cost_house, debit: amt, currency: 'SAR', desc: desc },
      { account: a.code, credit: amt, currency: 'SAR', agent: a.link, desc: desc }] });
    var seq = _glNextEntrySeq_(1), id = _glEntryId_(seq);
    var w = _glWriteEntry_(v, { id: id, seq: seq, status: GL_ST_POSTED_, sourceKey: 'HBCHARTER:' + a.code + ':' + d, desc: desc }, session.username);
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    eSh.getRange(eSh.getLastRow() + 1, 1, 1, w.eRow.length).setValues([w.eRow]);
    lSh.getRange(lSh.getLastRow() + 1, 1, w.lRows.length, w.lRows[0].length).setValues(w.lRows);
    logChange_(session.username, 'تسوية شارت', 'GL:' + id, '-', '-', a.name + ' — ' + amt + ' ريال');
    return { success: true, id: id };
  } finally { lock.releaseLock(); }
}
