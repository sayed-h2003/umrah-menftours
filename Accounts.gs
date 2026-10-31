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
  hbpay:    { name: 'GL_HB_Pay',   headers: ['معرّف الدفعة', 'الحساب النقدي', 'العملة', 'المبلغ بالعملة', 'سعر الصرف', 'بواسطة', 'في', 'حساب الطرف', 'ربط يدوي (دفعة مرتبطة)'] },
  hbtrip:   { name: 'GL_HB_Trip',  headers: ['مفتاح الحجز', 'الرحلة', 'بواسطة', 'في'] },
  // (V4.241) القيود التي كُتبت لها نسخة عاكسة بسجل دفعات برنامج الحجوزات (لتحديثها/حذفها لاحقاً بلا فتح ملف الحجوزات مع كل حفظ)
  hbmir:    { name: 'GL_HB_Mirror', headers: ['رقم القيد', 'عدد الصفوف', 'في'] },
  // (V4.227) قيود الحجوزات التلقائية المستبدَلة بقيد الـ ERP المطابق (اختيار «اعتماد الـ ERP») — لا يُعاد إنشاؤها بالمزامنة
  hbkeep:   { name: 'GL_HB_KeepERP', headers: ['مفتاح القيد التلقائي', 'قيد الـ ERP المعتمد', 'بيان قيد الحجوزات المحذوف', 'بواسطة', 'في'] },
  // (V4.210-H3) عقود الشارت: شراء غرف لفترة طويلة بدفعات، تُباع حجوزات منفصلة
  // (V4.216) أسعار الصرف اليومية (بيع/شراء بنك مصر للريال والدولار) — تُسجَّل يومياً ويُحسب منها المعادل بتاريخ كل قيد
  // (V4.219) مستندات مرفقة بالقيود والسندات (ملفات بالدرايف)
  attach:   { name: 'GL_Attachments', headers: ['رقم القيد', 'معرّف الملف', 'الاسم', 'النوع', 'الرابط', 'بواسطة', 'في'] },
  fxdaily:  { name: 'GL_FX_Daily', headers: ['التاريخ', 'ريال بيع', 'ريال شراء', 'دولار بيع', 'دولار شراء', 'المصدر', 'بواسطة', 'في'] },
  hbchar:   { name: 'GL_HB_Charters', headers: ['المعرّف', 'الشارت', 'الفندق', 'المدينة', 'من', 'إلى', 'عدد الغرف', 'قيمة العقد', 'العملة', 'ملاحظات', 'بواسطة', 'في'] },
  // (V4.290) تاريخ استحقاق حركات البنوك (القيمة المتاحة) — يُحفظ فقط لو اختلف عن تاريخ القيد
  bankdue:  { name: 'GL_BankDue', headers: ['رقم القيد', 'تاريخ الاستحقاق', 'بواسطة', 'في'] },
  // ✍️ (V4.319) تعديلات يدوية دائمة على القيود التلقائية (تغيير حساب سطر / رأس القيد / تجميد / إلغاء) — تُطبَّق فوق ما يبنيه المصدر بكل مزامنة
  autoovr:  { name: 'GL_AutoOverride', headers: ['مفتاح القيد', 'النوع', 'رقم السطر', 'من حساب', 'إلى حساب', 'العملة', 'الجانب', 'بيان السطر', 'بيانات', 'بواسطة', 'في'] },
  // 🗂️ (V4.324) نسخة احتياطية لكل صف حُذف/عُدِّل مع «حذف حساب مع قيوده» (للاستعادة اليدوية): HDR ملخص العملية · ROW صف محذوف · MOVE صف عُدِّل (أصله) · EXT صف بشيت خارجي
  deleted:  { name: 'GL_Deleted', headers: ['معرّف الحذف', 'النوع', 'الشيت/المفتاح (أو الحالة)', 'رقم الصف الأصلي', 'البيانات (JSON)', 'الحساب', 'بواسطة', 'في'] }
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
var GL_ENTRY_TYPES_ = ['قيد يومية', 'سند قبض', 'سند صرف', 'إيداع بنكي', 'سحب بنكي', 'صرف عهدة', 'تسوية عهدة', 'تحويل نقدية', 'تحويل عملة', 'تحويل بين طرفين', 'قيد افتتاحي', 'قيد مستورد', 'قيد تلقائي', 'قيد إقفال'];
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
/* 🔐 (V4.276) صلاحيات تفصيلية لكل شاشة ونموذج فرعي بالحسابات العامة (gl_<شاشة>.<عرض|إضافة|تعديل|حذف>)
   • توافق كامل: مستخدم بلا أي صلاحية gl_… يبقى كما كان (gl.view/add/edit/delete تشمل كل الشاشات)
   • بمجرد منح أي صلاحية gl_… للمستخدم تصبح كل شاشة فرعية بصلاحيتها هي فقط (مع بقاء gl.view لدخول الحسابات) */
var GL_SUBS_ = [['safe', 'الخزينة (سند قبض/صرف/تحويل نقدية)'], ['bank', 'البنوك (إيداع/سحب)'], ['cust', 'العهد (صرف/تسوية)'], ['sheets', 'مزامنة الشيتات واعتماد صفوفها'],
  ['je', 'القيود اليومية وشاشة القيود'], ['pt', 'التحويل بين طرفين'], ['fx', 'تحويل العملة'], ['stmt', 'كشف الحساب والكشوف'], ['rep', 'التقارير والميزان'],
  ['auto', 'القيود التلقائية والاعتماد'], ['hb', 'ربط الحجوزات ودفعات الفنادق'], ['cp', 'توجيه دفعات العملاء'], ['coa', 'دليل الحسابات (حساب/قسم)']];
var GL_TYPE_SUB_ = { 'سند قبض': 'safe', 'سند صرف': 'safe', 'تحويل نقدية': 'safe', 'إيداع بنكي': 'bank', 'سحب بنكي': 'bank', 'صرف عهدة': 'cust', 'تسوية عهدة': 'cust',
  'تحويل بين طرفين': 'pt', 'تحويل عملة': 'fx' };
function _glSubOn_(session) { return /(^|,)\s*gl_[a-z]+\./i.test(String((session && session.permissions) || '')); }
function _glHasSub_(session, sub, cap) {
  if (_sessionHasPerm_(session, 'admin')) return true;
  if (!sub || !_glSubOn_(session)) return _sessionHasPerm_(session, 'gl.' + cap);
  return _sessionHasPerm_(session, 'gl.view') && _sessionHasPerm_(session, 'gl_' + sub + '.' + cap);
}
function _glSubOfAcc_(code) { var a = _glAccounts_().map[_glStr_(code)], k = a && a.kind; return k === 'bank' ? 'bank' : k === 'custody' ? 'cust' : k === 'safe' ? 'safe' : ''; }
function _glSubOfType_(t) { return GL_TYPE_SUB_[_glStr_(t)] || 'je'; }
function _glPermErr_(cap, sub) {
  var lbl = (GL_SUBS_.filter(function (x) { return x[0] === sub; })[0] || [])[1];
  return new Error('لا تملك صلاحية ' + ({ view: 'عرض', add: 'إضافة', edit: 'تعديل/ترحيل', delete: 'حذف/إلغاء' }[cap] || cap) + (lbl ? ' «' + lbl + '»' : ' الحسابات العامة'));
}
function _glPerm_(authToken, cap, sub) {
  var session = requireAuth_(authToken);
  if (typeof sub === 'function') { try { sub = sub(); } catch (e) { sub = ''; } }
  if (!_glHasSub_(session, sub || '', cap)) throw _glPermErr_(cap, sub || '');
  return session;
}
// فحص إضافي داخل الدالة بعد معرفة نوع القيد/الحساب
function _glSubCheck_(session, sub, cap) { if (!_glHasSub_(session, sub, cap)) throw _glPermErr_(cap, sub); }
function glSubsList(authToken) { requireAuth_(authToken); return { success: true, subs: GL_SUBS_ }; }
function _glIsAdmin_(session) { return _sessionHasPerm_(session, 'admin'); }
// 🔒 (V4.220) الإعدادات والاستيراد والمزامنات الخارجية والعمليات المؤثرة جوهرياً = للمدير فقط
function _glAdminPerm_(authToken) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('هذا الإجراء للمدير فقط (إعدادات / استيراد / مزامنة خارجية / عملية مؤثرة)');
  return session;
}
// ✅ (V4.220) صلاحية خاصة لاعتماد التغييرات على القيود بعد تسجيلها (المدير يملكها تلقائياً)
function _glCanApprove_(session) { return _glIsAdmin_(session) || _sessionHasPerm_(session, 'gl.approve'); }
// ✍️ (V4.319) تعديل القيود التلقائية: المدير أو صاحب صلاحية الاعتماد أو صلاحية تعديل «القيود التلقائية والاعتماد» (gl_auto.edit، أو gl.edit بلا صلاحيات تفصيلية)
function _glCanEditAuto_(session) { return _glCanApprove_(session) || _glHasSub_(session, 'auto', 'edit'); }
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
  // 🗓️ (V4.300) سنة من رقمين (مثل 7/10/26) ⇒ تُفسَّر 20yy بدل أن تُرفَض فارغة
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/20' + m[3];
  return '';
}
function _glDKey_(d) { var m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? (m[3] + m[2] + m[1]) : ''; }   // yyyymmdd للمقارنة والترتيب
function _glNow_() { return Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy HH:mm:ss'); }
function _glToday_() { return Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy'); }
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
// ⚡ (V4.252) أي وصول للشيت عبر _glSheet_ يُعتبر «كتابة محتملة» ⇒ يُعلَّم التنفيذ متسخاً ويتغيّر رقم إصدار البيانات فيُبطَل الكاش.
// القراءة البحتة تمر عبر _glSheetR_ (لا تُبطل شيئاً)
function _glSheet_(key) { _glTouch_(key); return _glSheetR_(key); }
function _glSheetR_(key) {
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
    if (key === 'bankdue') sh.getRange('A:B').setNumberFormat('@');
    if (key === 'autoovr') sh.getRange('A:H').setNumberFormat('@');
    if (key === 'hbtrip') sh.getRange('A:B').setNumberFormat('@');
    if (key === 'hbchar') sh.getRange('A:F').setNumberFormat('@');
    if (key === 'fxdaily') sh.getRange('A:A').setNumberFormat('@');
    if (key === 'deleted') { sh.getRange('A:D').setNumberFormat('@'); sh.getRange('F:F').setNumberFormat('@'); }
  } else if (sh.getLastColumn() < def.headers.length) {
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
  }
  return sh;
}
// قراءة بعرض الأعمدة المعرّفة حتى لو الشيت أُنشئ بنسخة أقدم أقل أعمدة
function _glRowsW_(key) { return GL_CACHE_KEYS_[key] ? _glRowsC_(key, true) : _glRowsWRaw_(key); }
function _glRowsWRaw_(key) {
  var sh = _glSheetR_(key), last = sh.getLastRow(), W = GL_SHEETS_[key].headers.length;
  if (last < 2) return [];
  var have = Math.max(1, Math.min(W, sh.getLastColumn()));
  return sh.getRange(2, 1, last - 1, have).getValues().map(function (r) { while (r.length < W) r.push(''); return r; });
}
function _glRows_(key) { return GL_CACHE_KEYS_[key] ? _glRowsC_(key, false) : _glRowsRaw_(key); }
function _glRowsRaw_(key) {
  var sh = _glSheetR_(key), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, GL_SHEETS_[key].headers.length).getValues();
}

/* ⚡ (V4.252) كاش بيانات الحسابات العامة برقم إصدار
   • كل شيتات الحسابات الثقيلة (السطور/القيود/الدليل/المرفقات/الاعتماد/خريطة الحجوزات) تُقرأ مرة واحدة لكل «إصدار بيانات»
     وتُحفظ مضغوطة (gzip) في CacheService على أجزاء — فالكشف والأرصدة والميزان والخزينة تُبنى من الذاكرة بدل قراءة الشيت.
   • أي كتابة (عبر _glSheet_) تغيّر رقم الإصدار فوراً وعند فك القفل (_glUnlock_) ⇒ لا يُقرأ كاش قديم أبداً.
   • لا يُكتب الكاش إلا من تنفيذ «نظيف» (بلا كتابة) ولم يتغير الإصدار أثناء القراءة ولا توجد كتابة جارية (gl_wip). */
var GL_CACHE_KEYS_ = { lines: 1, entries: 1, accounts: 1, attach: 1, pending: 1, hbmap: 1, fxdaily: 1 };
var _GL_VER_ = null, _GL_DIRTY_ = false, _GL_ROWS_MEMO_ = {}, _GL_LOCKN_ = 0;
function _glVerFresh_() { var v = '0'; try { v = PropertiesService.getScriptProperties().getProperty('GL_DATA_VER') || '0'; } catch (e) {} return (_GL_VER_ = v); }
function _glVer_() { return _GL_VER_ !== null ? _GL_VER_ : _glVerFresh_(); }
function _glBump_() {
  _GL_VER_ = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { PropertiesService.getScriptProperties().setProperty('GL_DATA_VER', _GL_VER_); } catch (e) {}
  _GL_ROWS_MEMO_ = {};
}
function _glTouch_(key) {
  if (!GL_CACHE_KEYS_[key]) return;
  _GL_ROWS_MEMO_ = {};
  if (_GL_DIRTY_) return;
  _GL_DIRTY_ = true; _glBump_();
  try { CacheService.getScriptCache().put('gl_wip', String(Date.now()), 600); } catch (e) {}
}
/* 🔒 (V4.276) قفل مُسمّى مستقل للحسابات العامة — الحل الجذري لـ«مهلة التأمين»
   كان كل البرنامج (حفظ الرحلات/الملفات/الحجوزات + الحسابات + مزامنة الشيتات) يتشارك قفل السكربت الوحيد، فأي عملية حسابات
   طويلة (بناء القيود التلقائية، مزامنة شيت، تطبيق دفعات) تُوقف كل عمليات الحفظ في البرنامج حتى تنتهي المهلة.
   الآن: قفل «gl» مستقل محفوظ بالكاش، يُحجز ويُفك بفحص-وتعيين ذرّي يمسك قفل السكربت **أجزاء من الثانية فقط**.
   • نفس واجهة القفل القديم: tryLock(ms) / waitLock(ms) / releaseLock() / hasLock()
   • متداخل (reentrant) داخل نفس التنفيذ · لا يفك إلا مالكه · ينتهي ذاتياً بعد 330 ثانية لو توقف التنفيذ فجأة
   • لو تعذّر الكاش لأي سبب ⇒ يرجع تلقائياً لقفل السكربت كما كان */
var _GL_NL_OWN_ = null, _GL_NL_DEPTH_ = {};
function _glNamedLock_(name) {
  var key = 'nl_' + name, TTL = 330;
  if (!_GL_NL_OWN_) _GL_NL_OWN_ = Utilities.getUuid();
  var held = false, fb = null;
  var attempt = function () {   // فحص وتعيين ذرّي تحت قفل السكربت (لحظي)
    var sl = LockService.getScriptLock(), had = false;
    try { had = sl.hasLock(); } catch (e0) {}
    if (!had && !sl.tryLock(8000)) return false;
    try {
      var c = CacheService.getScriptCache(), cur = c.get(key), now = Date.now();
      if (cur) { var p = cur.split('|'); if (p[0] !== _GL_NL_OWN_ && +p[1] > now) return false; }
      c.put(key, _GL_NL_OWN_ + '|' + (now + TTL * 1000), TTL);
      return true;
    } finally { if (!had) try { sl.releaseLock(); } catch (e1) {} }
  };
  var take = function (ms) {
    if (_GL_NL_DEPTH_[name] > 0) { _GL_NL_DEPTH_[name]++; held = true; return true; }
    var t0 = Date.now(), end = t0 + Math.max(0, ms || 0), wait = 150;
    try {
      for (;;) {
        if (attempt()) { _GL_NL_DEPTH_[name] = 1; held = true; try { if (typeof _perfLockWait_ === 'function') _perfLockWait_(name, Date.now() - t0); } catch (eP) {} return true; }
        if (Date.now() + wait > end) return false;
        Utilities.sleep(wait); wait = Math.min(1000, Math.round(wait * 1.5));
      }
    } catch (eC) {   // الكاش/القفل غير متاح ⇒ قفل السكربت التقليدي
      fb = LockService.getScriptLock(); held = fb.tryLock(Math.max(1, ms || 0)); return held;
    }
  };
  return {
    tryLock: function (ms) { return take(ms); },
    waitLock: function (ms) { if (!take(ms)) throw new Error('الحسابات مشغولة بعملية أخرى حالياً (قفل الحسابات) — تُوضع العملية بالطابور وتُنفَّذ تلقائياً'); },
    hasLock: function () { return held; },
    releaseLock: function () {
      if (!held) return; held = false;
      if (fb) { try { fb.releaseLock(); } catch (e) {} fb = null; return; }
      if (--_GL_NL_DEPTH_[name] > 0) return;
      _GL_NL_DEPTH_[name] = 0;
      // الفك بلا قفل السكربت: لا يكتب الرمز إلا مالكه، فحذفه آمن — ولا يبقى القفل عالقاً لو كان البرنامج مشغولاً بحفظ
      try { var c = CacheService.getScriptCache(), cur = c.get(key); if (cur && cur.split('|')[0] === _GL_NL_OWN_) c.remove(key); } catch (e3) {}
    }
  };
}
function _glLock_() { if (typeof _audGate_ === 'function') _audGate_(); _GL_LOCKN_++; return _glNamedLock_('gl'); }   // 🛡️ (V4.345) لا حفظ مالي بلا سجل تتبع
function _glUnlock_(lock) {
  if (_GL_DIRTY_) { _glBump_(); try { CacheService.getScriptCache().remove('gl_wip'); } catch (e) {} }
  _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1);
  try { lock.releaseLock(); } catch (e) {}
}
function _glCK_(k) { return 'glc_' + _glSSId_().slice(-10) + '_' + k; }
// تخزين مضغوط على أجزاء (حد القيمة الواحدة 100KB) — التواريخ تُحفظ كـ {$d:ms} وتعود كائنات Date كما بالشيت
function _glCPut_(key, obj, ttl) {
  try {
    var js = JSON.stringify(obj, function (k, v) { return (this[k] instanceof Date) ? { $d: this[k].getTime() } : v; });
    var b = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(js, 'application/json')).getBytes()), CH = 95000;
    var n = Math.ceil(b.length / CH); if (!n || n > 400) return false;
    var m = {}; for (var i = 0; i < n; i++) m[key + ':' + i] = b.substr(i * CH, CH);
    var c = CacheService.getScriptCache();
    c.putAll(m, ttl || 21600); c.put(key, String(n), ttl || 21600);
    return true;
  } catch (e) { return false; }
}
function _glCGet_(key) {
  try {
    var c = CacheService.getScriptCache(), n = +(c.get(key) || 0); if (!n) return null;
    var ks = []; for (var i = 0; i < n; i++) ks.push(key + ':' + i);
    var got = c.getAll(ks), parts = [];
    for (var j = 0; j < n; j++) { var p = got[key + ':' + j]; if (p == null) return null; parts.push(p); }
    var js = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(parts.join('')), 'application/x-gzip')).getDataAsString();
    return JSON.parse(js, function (k, v) { return (v && typeof v === 'object' && v.$d !== undefined && Object.keys(v).length === 1) ? new Date(v.$d) : v; });
  } catch (e) { return null; }
}
function _glCacheOk_(v0) {   // يجوز حفظ ما قُرئ للتو؟
  if (_GL_DIRTY_ || _GL_LOCKN_ > 0 || _glVerFresh_() !== v0) return false;
  try { var w = +(CacheService.getScriptCache().get('gl_wip') || 0); if (w && Date.now() - w < 360000) return false; } catch (e) {}
  return true;
}
function _glRowsC_(key, wide) {
  // داخل قسم مقفول (كتابة) أو بعد كتابة: قراءة مباشرة من الشيت دائماً — نفس السلوك القديم تماماً
  if (_GL_DIRTY_ || _GL_LOCKN_ > 0) return wide ? _glRowsWRaw_(key) : _glRowsRaw_(key);
  var mk = key + (wide ? ':w' : '');
  if (_GL_ROWS_MEMO_[mk]) return _GL_ROWS_MEMO_[mk].slice();
  var v0 = _glVer_(), ck = _glCK_(mk + '_' + v0), got = _glCGet_(ck);
  if (got) { _GL_ROWS_MEMO_[mk] = got; return got.slice(); }
  var rows = wide ? _glRowsWRaw_(key) : _glRowsRaw_(key);
  if (_GL_DIRTY_) return rows;
  _GL_ROWS_MEMO_[mk] = rows;
  if (_glCacheOk_(v0)) _glCPut_(ck, rows);
  return rows.slice();
}
// الصفوف من الذاكرة/الكاش فقط (بلا قراءة الشيت) — null لو غير متاحة
function _glRowsPeek_(key) {
  if (_GL_DIRTY_ || _GL_LOCKN_ > 0) return null;
  if (_GL_ROWS_MEMO_[key]) return _GL_ROWS_MEMO_[key];
  var got = _glCGet_(_glCK_(key + '_' + _glVer_()));
  if (got) _GL_ROWS_MEMO_[key] = got;
  return got;
}
// 🔥 تسخين الكاش بعد الحفظ (الواجهة تستدعيه بلا انتظار) + رقم الإصدار الحالي
function glWarm(authToken) {
  _glPerm_(authToken, 'view');
  if (!_glSSId_()) return { success: true, ver: '' };
  ['lines', 'entries', 'accounts'].forEach(function (k) { try { _glRows_(k); } catch (e) {} });
  return { success: true, ver: _glVer_() };
}
// 🔄 إبطال الكاش يدوياً (بعد تعديل شيتات الحسابات باليد مباشرة)
function glCacheReset(authToken) {
  _glAdminPerm_(authToken);
  _glBump_(); _GL_ACC_MEMO_ = null;
  return { success: true, ver: _GL_VER_ };
}

/* ---------------------------- الإعدادات ---------------------------- */
var _GL_SET_MEMO_ = null;
// ⚡ (V4.236) الإعدادات تُقرأ من الكاش (10 دقائق) بدل فتح ملف الحسابات وقراءة الشيت بكل نداء — كانت تكلّف 1-2 ثانية
// بكل نبضة/شاشة. أي كتابة بالإعدادات من البرنامج تمسح الكاش فوراً (_glSetDrop_)
function _glSetCK_() { return 'gl_set_v1_' + _glSSId_(); }
function _glSetDrop_() { _GL_SET_MEMO_ = null; try { CacheService.getScriptCache().remove(_glSetCK_()); } catch (e) {} }
function _glSettings_() {
  if (_GL_SET_MEMO_) return _GL_SET_MEMO_;
  var ck = '', c = null;
  try { ck = _glSetCK_(); c = CacheService.getScriptCache().get(ck); } catch (e0) {}
  if (c) { try { return (_GL_SET_MEMO_ = JSON.parse(c)); } catch (e1) {} }
  var o = { startDate: '01/07/2026', baseCurrency: 'EGP', rate_SAR: '13.3', rate_USD: '50' };
  _glRows_('settings').forEach(function (r) { var k = _glStr_(r[0]); if (k) o[k] = _glStr_(r[1]); });
  try { var js = JSON.stringify(o); if (ck && js.length < 90000) CacheService.getScriptCache().put(ck, js, 600); } catch (e2) {}
  return (_GL_SET_MEMO_ = o);
}
function _glSetSetting_(k, v) {
  var sh = _glSheet_('settings'), rows = _glRows_('settings');
  for (var i = 0; i < rows.length; i++) if (_glStr_(rows[i][0]) === k) { sh.getRange(i + 2, 2).setNumberFormat('@').setValue(String(v)); _glSetDrop_(); return; }
  sh.appendRow([k, String(v)]);
  try { sh.getRange(sh.getLastRow(), 2).setNumberFormat('@'); } catch (e) {}
  _glSetDrop_();
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
  // 🗂️ (V4.324) أكواد الحسابات المحذوفة «مُحالة للتقاعد» — لا تُعطى لحساب جديد أبداً (فلا يشير لها مرجع قديم بالخطأ)
  var codes = _glAccounts_().list.map(function (a) { return a.code; }).concat(Object.keys(taken)).concat(Object.keys(_glAccDeleted_().codes));
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
function glBootstrap(authToken, knownVer) {
  var session = _glPerm_(authToken, 'view');
  var admin = _glIsAdmin_(session);
  if (!_glSSId_()) return { success: true, ready: false, isAdmin: admin };
  var can = { add: _sessionHasPerm_(session, 'gl.add'), edit: _sessionHasPerm_(session, 'gl.edit'), del: _sessionHasPerm_(session, 'gl.delete'), approve: _glCanApprove_(session), autoEdit: _glCanEditAuto_(session) };
  can.sub = _glSubOn_(session) && !_sessionHasPerm_(session, 'admin') ? (function () { var o = {}; GL_SUBS_.forEach(function (x) { o[x[0]] = { view: _glHasSub_(session, x[0], 'view'), add: _glHasSub_(session, x[0], 'add'), edit: _glHasSub_(session, x[0], 'edit'), del: _glHasSub_(session, x[0], 'delete') }; }); return o; })() : null;   // 🔐 (V4.276) صلاحيات الشاشات الفرعية
  // ⚡ (V4.252) الواجهة عندها نفس الإصدار (من آخر تحميل أو من المتصفح) ⇒ لا شيء تغيّر: رد فوري بلا قراءة أي شيت
  if (knownVer && String(knownVer) === _glVerFresh_()) return { success: true, ready: true, same: true, ver: _GL_VER_, isAdmin: admin, can: can, balMine: _glBalMine_(session), balUserOn: _glBalUserOn_(),
    pendingCount: (function () { try { return _glPendingCount_(); } catch (e) { return 0; } })(), csPend: _glCsPendTotal_() };
  var ver = _glVer_();
  var accs = _glAccounts_().list.map(function (a) { var c = {}; for (var k in a) if (k !== '_row') c[k] = a[k]; return c; });
  // 💱 (V4.305) العملة الافتراضية لكل حساب بلا عملة ثابتة (dc) + أطراف برنامج الحجوزات (hb ⇒ كشف بالريال) — لاقتراح عملة الطرف المقابل
  try { var dcm = _glDefCurMap_(); accs.forEach(function (c) { if (!c.currency && dcm.cur[c.code]) c.dc = dcm.cur[c.code]; if (dcm.hb[c.code]) c.hb = 1; }); } catch (eDc) {}
  var bal = _glBalances_(null);
  return {
    success: true, ready: true, isAdmin: admin, url: 'https://docs.google.com/spreadsheets/d/' + _glSSId_() + '/edit', ver: ver,
    fxDaily: (function () { var m = _glFxDailyMap_(), o = {}; Object.keys(m).forEach(function (k) { o[k] = [m[k].SAR || 0, m[k].USD || 0, m[k].src || '']; }); return o; })(),
    settings: _glSettingsOut_(), rates: _glRates_(), types: GL_TYPES_, kinds: GL_KINDS_, entryTypes: GL_ENTRY_TYPES_,
    accounts: accs, balances: bal,
    can: can, balMine: _glBalMine_(session), balUserOn: _glBalUserOn_(),
    csPend: _glCsPendTotal_(), pendingCount: (function () { try { return _glPendingCount_(); } catch (e) { return 0; } })(), tripMode: (function () { try { return _glTripMode_(); } catch (e) { return false; } })()
  };
}
// 🏦 (V4.343) المعلّق لكل بنك (لبطاقات شاشة الأرصدة): حركات مرحّلة تاريخ استحقاقها (أو تاريخها) بعد اليوم = إيداعات/تحويلات لم تُتَح بعد
function glBankPending(authToken) {
  _glPerm_(authToken, 'view');
  var accs = _glAccounts_().map, due = _glDueMap_(), todayK = _glDKey_(_glToday_()), out = {};
  _glRows_('lines').forEach(function (r) {
    if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
    var code = _glStr_(r[4]), a = accs[code]; if (!a || a.kind !== 'bank') return;
    var dk = _glDKey_(due[_glStr_(r[0])] || '') || _glDKey_(_glDate_(r[2])); if (!dk || dk <= todayK) return;
    var cur = _glCur_(r[7]), o = (out[code] = out[code] || { EGP: 0, SAR: 0, USD: 0 });
    o[cur] = _glR2_(o[cur] + _glNum_(r[5]) - _glNum_(r[6]));
  });
  return { success: true, pending: out };
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

/* ---------------------------- 🏠 شاشة الأرصدة المرنة (V4.335) ---------------------------- */
// التخطيط العام (للجميع) يُحفظ بإعداد bal_layout (المدير فقط) · وتفضيل كل مستخدم بخاصية خاصة به GL_BALU_<user> (لا يمس بقية المستخدمين
// ولا يرفع إصدار البيانات) ويعمل فقط إن فعّل المدير «تخصيص الصلاحيات» (bal_user_cust = نعم).
function _glBalUserKey_(u) { return 'GL_BALU_' + String(u || '').toLowerCase().replace(/[^a-z0-9_.\u0600-\u06FF]/g, '_').slice(0, 60); }
function _glBalUserOn_() { try { return _glStr_(_glSettings_().bal_user_cust) === 'نعم'; } catch (e) { return false; } }
function _glBalMine_(session) {
  if (!_glBalUserOn_()) return '';
  try { return PropertiesService.getScriptProperties().getProperty(_glBalUserKey_(session.username)) || ''; } catch (e) { return ''; }
}
function _glBalSanitize_(L) {
  if (typeof L === 'string') L = JSON.parse(L);
  if (!L || !Array.isArray(L.secs)) throw new Error('تخطيط غير صالح');
  var codeArr = function (a, n) { return (Array.isArray(a) ? a : []).map(function (x) { return String(x == null ? '' : x).replace(/[^0-9A-Za-z_.\-]/g, '').slice(0, 24); }).filter(Boolean).slice(0, n || 400); };
  var txt = function (x, n) { return String(x == null ? '' : x).replace(/[<>]/g, '').trim().slice(0, n); };
  var seen = {}, secs = [];
  L.secs.slice(0, 30).forEach(function (c, i) {
    if (!c || (c.t !== 'acc' && c.t !== 'top')) return;
    var id = String(c.id || '').replace(/[^\w-]/g, '').slice(0, 24) || ('s' + i); while (seen[id]) id += 'x'; seen[id] = 1;
    var o = { id: id, t: c.t, title: txt(c.title, 60) || 'قسم', icon: txt(c.icon, 4), color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#475569', off: c.off ? 1 : 0 };
    if (c.t === 'acc') { o.prefixes = codeArr(c.prefixes, 20); o.extra = codeArr(c.extra); o.hide = codeArr(c.hide); o.order = codeArr(c.order); }
    else o.groups = (Array.isArray(c.groups) ? c.groups : []).slice(0, 10).map(function (g, j) {
      var k = String(g && g.k || '').replace(/[^\w-]/g, '').slice(0, 24) || ('g' + j);
      return { k: k, title: txt(g && g.title, 60) || k, prefix: String(g && g.prefix || '').replace(/[^0-9]/g, '').slice(0, 12), dir: g && g.dir === 'cr' ? 'cr' : 'dr', n: Math.max(1, Math.min(50, parseInt(g && g.n, 10) || 10)) };
    }).filter(function (g) { return g.prefix; });
    secs.push(o);
  });
  var out = JSON.stringify({ v: 1, secs: secs });
  if (out.length > 8500) throw new Error('التخطيط كبير جداً — قلّل عدد الأقسام/الحسابات المخصَّصة');
  return out;
}
function glBalLayoutSave(authToken, layout, scope) {
  var session = _glPerm_(authToken, 'view'), admin = _glIsAdmin_(session);
  scope = scope === 'mine' ? 'mine' : 'global';
  var json = layout ? _glBalSanitize_(layout) : '';   // فارغ ⇒ إعادة الافتراضي
  if (scope === 'global') {
    if (!admin) throw new Error('تخصيص شاشة الأرصدة للجميع متاح للمدير فقط');
    _glSetSetting_('bal_layout', json);
    logChange_(session.username, 'تخصيص شاشة الأرصدة (للجميع)', 'GL:bal_layout', '-', '-', json ? 'حفظ' : 'افتراضي');
    return { success: true, scope: scope, layout: json };
  }
  if (!admin && !_glBalUserOn_()) throw new Error('تخصيص الأرصدة الشخصي غير مفعَّل — اطلب من المدير تفعيل «تخصيص الصلاحيات»');
  var P = PropertiesService.getScriptProperties(), k = _glBalUserKey_(session.username);
  if (json) P.setProperty(k, json); else P.deleteProperty(k);
  return { success: true, scope: scope, layout: json };
}
function glBalUserCustSet(authToken, on) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('هذا الإعداد للمدير فقط');
  _glSetSetting_('bal_user_cust', on ? 'نعم' : 'لا');
  logChange_(session.username, 'تخصيص الصلاحيات لشاشة الأرصدة', 'GL:bal_user_cust', '-', '-', on ? 'مفعَّل' : 'موقوف');
  return { success: true, on: !!on };
}
// أعلى الأرصدة لمجموعات حسابات: groups = [{k, prefix, dir:'dr'|'cr', n}] — رصيد تراكمي حتى اليوم + الرصيد النهائي (كل الحركات المرحّلة)
// dir=dr (عملاء): الموجب مدين · dir=cr (موردون): الدائن يظهر موجباً. الترتيب بالمعادل بالجنيه، ويُستبعد الصفري/العكسي
function glPartyBalances(authToken, groups) {
  _glPerm_(authToken, 'view');
  var accs = _glAccounts_(), todayK = _glDKey_(_glToday_()), want = {}, G = (Array.isArray(groups) ? groups : []).slice(0, 10).map(function (g) {
    return { k: String(g && g.k || ''), prefix: String(g && g.prefix || '').replace(/[^0-9]/g, '').slice(0, 12), dir: g && g.dir === 'cr' ? 'cr' : 'dr', n: Math.max(1, Math.min(50, parseInt(g && g.n, 10) || 10)) };
  }).filter(function (g) { return g.prefix; });
  accs.list.forEach(function (a) { if (a.isGroup) return; G.forEach(function (g) { if (a.code.indexOf(g.prefix) === 0) want[a.code] = 1; }); });
  var td = {}, fn = {};
  _glRows_('lines').forEach(function (r) {
    if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
    var code = _glStr_(r[4]); if (!want[code]) return;
    var cur = _glCur_(r[7]), dk = _glDKey_(_glDate_(r[2])), dr = _glNum_(r[5]) - _glNum_(r[6]), bs = _glNum_(r[9]) - _glNum_(r[10]);
    var add = function (m) { var o = (m[code] = m[code] || { EGP: 0, SAR: 0, USD: 0, base: 0 }); o[cur] += dr; o.base += bs; };
    add(fn); if (!dk || dk <= todayK) add(td);
  });
  var out = {};
  G.forEach(function (g) {
    var sg = g.dir === 'cr' ? -1 : 1, rows = [];
    Object.keys(want).forEach(function (code) {
      if (code.indexOf(g.prefix) !== 0) return;
      var t = td[code] || { EGP: 0, SAR: 0, USD: 0, base: 0 }, f = fn[code] || { EGP: 0, SAR: 0, USD: 0, base: 0 };
      if (!(sg * t.base > 0.004) && !(sg * f.base > 0.004)) return;
      var ex = function (o) { return { EGP: _glR2_(sg * o.EGP), SAR: _glR2_(sg * o.SAR), USD: _glR2_(sg * o.USD), base: _glR2_(sg * o.base) }; };
      rows.push({ code: code, name: (accs.map[code] || {}).name || code, today: ex(t), fin: ex(f) });
    });
    rows.sort(function (a, b) { return b.today.base - a.today.base; });
    out[g.k] = { total: rows.length, rows: rows.slice(0, g.n) };
  });
  return { success: true, asOf: _glToday_(), groups: out };
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
  // 🍽️ (V4.323) حساب «فروق اتفاقيات الإعاشة» (الافتراضي يُنشأ تحت إيرادات العمرة 41) — قابل للتغيير لأي حساب ورقي
  if (s.auto_acc_cat_diff !== undefined) { var cd = _glStr_(s.auto_acc_cat_diff), cdA = _glAccounts_().map[cd]; if (cd && (!cdA || cdA.isGroup)) throw new Error('حساب فروق اتفاقيات الإعاشة غير صالح'); if (cd) _glSetSetting_('auto_acc_cat_diff', cd); }
  // 💱 (V4.323) قاعدة العملة الافتراضية للطرف المقابل بصفوف الشيتات (all / hb / fixed) — انظر _glCcyRule_
  if (s.ccy_def_rule !== undefined) { var cr = _glStr_(s.ccy_def_rule); if (!/^(all|hb|fixed)$/.test(cr)) throw new Error('قاعدة العملة غير صالحة'); _glSetSetting_('ccy_def_rule', cr); _GL_DEFCUR_MEMO_ = null; }
  // (V4.216) بيانات الشركة في رأس/تذييل السندات المطبوعة
  Object.keys(GL_VCH_BRAND_DEF_).forEach(function (k) { if (s[k] !== undefined) _glSetSetting_(k, _glStr_(s[k])); });
  logChange_(session.username, 'تعديل إعدادات الحسابات العامة', 'GL:settings', '-', '-', JSON.stringify(s));
  return { success: true, settings: _glSettingsOut_(), rates: _glRates_() };
}
// 🔗 (V4.251) دمج الملاحظات الظاهرة مع وسوم الربط ⟦alias:…⟧ — تُحفظ وسوم الفئات الأخرى كما هي، وتُستبدل وسوم الرحلات بالقائمة الجديدة
function _glAccNotesMerge_(oldNotes, newNotes, tripLinks) {
  var re = /⟦alias:([^|⟧]*)\|([^⟧]+)⟧/g, keep = [];
  String(oldNotes || '').replace(re, function (m, k) { if (!(Array.isArray(tripLinks) && k === 'trip')) keep.push(m); return m; });
  var vis = _glStr_(String(newNotes || '').replace(re, ''));
  if (!Array.isArray(tripLinks)) String(newNotes || '').replace(re, function (m) { if (keep.indexOf(m) < 0) keep.push(m); return m; });
  var seen = {};
  (tripLinks || []).forEach(function (n) { n = _glStr_(n); var k = _glNorm_(n); if (n && !seen[k]) { seen[k] = 1; keep.push('⟦alias:trip|' + n + '⟧'); } });
  return _glStr_(vis + (keep.length ? ' ' + keep.join('') : ''));
}
// رحلة واحدة ⇐ حساب واحد: نزيل نفس الرحلة من وسوم أي حساب آخر
function _glAccTripUnlinkOthers_(selfCode, tripLinks) {
  if (!Array.isArray(tripLinks) || !tripLinks.length) return;
  var want = {}; tripLinks.forEach(function (n) { want[_glNorm_(n)] = 1; });
  var sh = _glSheet_('accounts');
  _glAccounts_().list.forEach(function (x) {
    if (x.code === selfCode || String(x.notes || '').indexOf('⟦alias:trip|') < 0) return;
    var nn = String(x.notes).replace(/⟦alias:trip\|([^⟧]+)⟧/g, function (m, n) { return want[_glNorm_(n)] ? '' : m; });
    if (nn !== x.notes) sh.getRange(x._row, 10).setValue(_glStr_(nn));
  });
  _GL_ACC_MEMO_ = null;
}
function glSaveAccount(authToken, a) {
  a = a || {};
  var isEdit = !!_glStr_(a.code) && !!_glAccounts_().map[_glStr_(a.code)] && a.isEdit;
  var session = _glPerm_(authToken, isEdit ? 'edit' : 'add', 'coa');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null;
    if (!_glStr_(a.name)) throw new Error('اسم الحساب مطلوب');
    if (isEdit) {
      var acc = _glAccounts_().map[_glStr_(a.code)];
      var old = acc.name;
      var sh = _glSheet_('accounts');
      sh.getRange(acc._row, 2).setValue(_glStr_(a.name));
      sh.getRange(acc._row, 6, 1, 5).setValues([[a.currency ? _glCur_(a.currency) : '', _glStr_(a.kind || acc.kind), _glStr_(a.link !== undefined ? a.link : acc.link),
        a.active === false ? 'لا' : 'نعم', _glAccNotesMerge_(acc.notes, a.notes, a.tripLinks)]]);
      _GL_ACC_MEMO_ = null;
      _glAccTripUnlinkOthers_(acc.code, a.tripLinks);
      logChange_(session.username, 'تعديل حساب بالدليل', 'GL:' + acc.code, 'اسم الحساب', old, a.name);
      return { success: true, account: _glAccounts_().map[acc.code] };
    }
    var created = _glCreateAccount_({ parent: _glStr_(a.parent), name: a.name, isGroup: !!a.isGroup, currency: a.currency, kind: a.kind, link: a.link, notes: _glAccNotesMerge_('', a.notes, a.tripLinks) }, session.username);
    _glAccTripUnlinkOthers_(created.code, a.tripLinks);
    logChange_(session.username, 'إضافة حساب بالدليل', 'GL:' + created.code, '-', '-', created.code + ' — ' + created.name);
    return { success: true, account: created };
  } finally { _glUnlock_(lock); }
}
function glDeleteAccount(authToken, code) {
  var session = _glPerm_(authToken, 'delete', 'coa');
  var lock = _glLock_(); lock.waitLock(30000);
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
  } finally { _glUnlock_(lock); }
}
/* 🗂️ (V4.324) حذف حساب من دليل الحسابات مع كل قيوده — للمدير فقط
   • كل قيد له سطر على الحساب يُحذف نهائياً بكل أطرافه (الرأس وكل الأسطر — لا «إلغاء»)، عدا قيود الأرصدة الافتتاحية المجمّعة
     (AUTO:OPEN / AUTO:HBOPEN، أو قيد افتتاحي فيه حسابان آخران فأكثر): يُحوَّل سطر الحساب فيها فقط إلى 34 «فروق أرصدة افتتاحية»
     فلا تُمسح أرصدة الحسابات الأخرى. الأسطر اليتيمة (بلا رأس) على الحساب تُحذف أيضاً.
   • قبل أي حذف: نسخة كاملة لكل صف محذوف/معدَّل بشيت GL_Deleted (برقم العملية DEL-…) للاستعادة اليدوية.
   • لا تُعيده المزامنة: الكود يُحال للتقاعد (لا يُعطى لحساب جديد)، وربط الطرف (عميل/وكيل/مورد/رحلة…) يُسجَّل «محذوفاً» فلا يُفتح
     له حساب تلقائياً، وكل قيد تلقائي محذوف يأخذ قاعدة «إلغاء يدوي» (void) فلا يُعاد ترحيله ما دام مصدره موجوداً بشاشته.
   • تنظيف المراجع: خريطة الحجوزات ومراجعة دفعاتها، توجيه دفعات العملاء، قواعد التعديل اليدوي، شيت العهدة وأسماؤه المتعلَّمة،
     اتفاقيات الإعاشة، المرفقات/تواريخ الاستحقاق/بنود الاعتماد للقيود المحذوفة، ونسخها بحسابات العملاء وبكشف برنامج الحجوزات.
   • مرفوض: حساب أساسي/يستخدمه النظام (أدوار القيود التلقائية، وسيط العملات، فروق الافتتاحي…)، قسم له فروع، قيد إقفال/ترحيل
     أرباح موسم، أو قيد بفترة مقفلة. المعاينة أولاً ثم تأكيد بكتابة كود الحساب أو اسمه + بصمة المعاينة (تغيّرت القيود ⇒ رفض). */
var GL_TOMB_ = '∅';   // كود وهمي لطرف حُذف حسابه (الأكواد أرقام فلا يتعارض) ⇒ القيد الذي يحويه لا يُبنى
var GL_SYS_CODES_ = { '33': 1, '34': 1, '46': 1, '53': 1, '1101': 1, '1102': 1, '1201': 1, '1203': 1, '2101': 1, '2102': 1, '2103': 1, '4101': 1 };
var GL_PARTY_KINDS_ = { client: 1, agent: 1, supplier: 1, trip: 1, roomfee: 1, hbrev: 1 };
var GL_DELCAT_LBL_ = { MANUAL: 'قيود يدوية', VCH: 'سندات قبض/صرف', CUST: 'قيود شيتات العهد/الخزينة/البنوك', ERP: 'قيود منقولة من الـ ERP', IMP: 'قيود مستوردة', HBCHARTER: 'قيود عقود الشارت', OTHER: 'قيود أخرى', ORPHAN: 'أسطر يتيمة (بلا رأس قيد)' };
var GL_SRC_SCREEN_ = { CP: 'حسابات عملاء العمرة', CI: 'حسابات عملاء العمرة', TRIP: 'حسابات عملاء العمرة', AP: 'حسابات الوكلاء', AI: 'حسابات الوكلاء', VZ: 'مجموعات التأشيرات', MF: 'ملفات الوزارة',
  RF: 'إيصالات رسوم الغرفة', TR: 'دورات النقل', HB: 'برنامج حجوزات الفنادق', HBP: 'برنامج حجوزات الفنادق', HBL: 'برنامج حجوزات الفنادق', CAT: 'اتفاقيات الإعاشة' };
var _GL_ACCDEL_MEMO_ = null;
// الأكواد المحالة للتقاعد وأطراف الحسابات المحذوفة: {codes: {كود: {n, d, at}}, tomb: {'الفئة|الاسم المطبَّع': {c, n, l, d}}}
function _glAccDeleted_() {
  var raw = ''; try { raw = _glStr_(_glSettings_().acc_deleted); } catch (e) {}
  if (_GL_ACCDEL_MEMO_ && _GL_ACCDEL_MEMO_.raw === raw) return _GL_ACCDEL_MEMO_.v;
  var v = { codes: {}, tomb: {} };
  try { var o = JSON.parse(raw || '{}') || {}; v.codes = o.codes || {}; v.tomb = o.tomb || {}; } catch (e2) {}
  _GL_ACCDEL_MEMO_ = { raw: raw, v: v };
  return v;
}
function _glTombOf_(e) { return (e.lines || []).some(function (l) { return l.account === GL_TOMB_; }); }
function _glDelSetting_(k) {
  var sh = _glSheet_('settings'), rows = _glRows_('settings');
  for (var i = rows.length - 1; i >= 0; i--) if (_glStr_(rows[i][0]) === k) sh.deleteRow(i + 2);
  _glSetDrop_();
}
// اتفاقيات الإعاشة التي حسابها (المورد أو العميل/الرحلة) هو الكود
function _glAccDelCatScan_(code) {
  if (typeof CATERING_SHEET === 'undefined') return [];
  var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS), last = sh.getLastRow(), out = [];
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 23).getValues().forEach(function (r, i) {
    var v = _glStr_(r[21]), t = _glStr_(r[22]);
    if (v === code || t === code) out.push({ row: i + 2, no: _glStr_(r[0]), id: _glStr_(r[20]), vendorAcc: v, targetAcc: t });
  });
  return out;
}
function _glAccDelCatClear_(code) {   // نفس قفل حذف/دمج صفوف الاتفاقيات (كتابة بموضع الصف) كـ _glCatRecode_
  if (typeof CATERING_SHEET === 'undefined') return 0;
  var sl = LockService.getScriptLock(), had = false; try { had = sl.hasLock(); } catch (e0) {}
  if (!had) try { sl.tryLock(15000); } catch (e1) {}
  try {
    var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS), last = sh.getLastRow(); if (last < 2) return 0;
    var rg = sh.getRange(2, 22, last - 1, 2), v = rg.getValues(), n = 0;
    v.forEach(function (r) { for (var i = 0; i < 2; i++) if (_glStr_(r[i]) === code) { r[i] = ''; n++; } });
    if (n) rg.setNumberFormat('@').setValues(v);
    return n;
  } finally { if (!had) try { sl.releaseLock(); } catch (e2) {} }
}
// دفعات «حسابات عملاء العمرة» المنسوخة من سندات ستُحذف (وسم ⟦src:gl-رقم القيد⟧ بعمود البيان)
function _glAccDelPayScan_(delSet) {
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), last = sh.getLastRow(), rows = [];
  if (last >= 2 && Object.keys(delSet).length) sh.getRange(2, 9, last - 1, 1).getValues().forEach(function (r, i) {
    var m = String(r[0] == null ? '' : r[0]).match(/⟦src:gl-([^⟧]+)⟧/); if (m && delSet[m[1]]) rows.push(i + 2);
  });
  return { sh: sh, rows: rows, last: last };
}
// 🧑‍💼 (V4.328) دفعات/بنود «حسابات الوكلاء» المنسوخة من قيود ستُحذف (نفس الوسم بعمود الملاحظات)
function _glAccDelApScan_(delSet) {
  var S = _glApSheets_(), out = { S: S, rows: { pay: [], item: [] }, n: 0 };
  if (!Object.keys(delSet).length) return out;
  ['pay', 'item'].forEach(function (t) {
    var s = S[t], last = s.sh.getLastRow(); if (last < 2) return;
    s.sh.getRange(2, s.nc, last - 1, 1).getValues().forEach(function (r, i) { var m = GL_AP_TAG_RX_.exec(String(r[0] == null ? '' : r[0])); if (m && delSet[m[1]]) { out.rows[t].push(i + 2); out.n++; } });
  });
  return out;
}
// خطة الحذف (مشتركة بين المعاينة والتنفيذ): الموانع، القيود المحذوفة/المحوَّلة، الأثر على الحسابات الأخرى، المراجع، والبصمة
function _glAccDelPlan_(code) {
  code = _glStr_(code);
  var set = _glSettings_(), roleN = {}, roleHit = [];
  [GL_AUTO_ROLES_, GL_HB_ROLES_].forEach(function (D) { Object.keys(D).forEach(function (r) { roleN[r] = D[r][1]; }); });
  var addRole = function (r) { var n = roleN[r] || r; if (roleHit.indexOf(n) < 0) roleHit.push(n); };
  Object.keys(set).forEach(function (k) { var m = k.match(/^auto_acc_(.+)$/); if (m && _glStr_(set[k]) === code) addRole(m[1]); });
  try { var dr = _glAutoRoles_('', true); Object.keys(dr).forEach(function (r) { if (r !== '_new' && dr[r] === code) addRole(r); }); } catch (eR) {}
  _GL_ACC_MEMO_ = null;   // معاينة الأدوار قد تضيف حسابات افتراضية للذاكرة
  var accs = _glAccounts_(), acc = accs.map[code], accM = accs.map;
  if (!acc) throw new Error('الحساب ' + code + ' غير موجود بالدليل (ربما حُذف بالفعل) — حدّث الشاشة');
  var block = [], notes = [], lockDate = _glStr_(set.lockDate);
  var kids = accs.list.filter(function (x) { return x.code !== code && (x.parent === code || (x.code.length > code.length && x.code.indexOf(code) === 0)); });
  if (kids.length) block.push('حساب تجميعي (قسم) له ' + kids.length + ' حساباً فرعياً — احذف حساباته الفرعية أو انقلها أولاً');
  if (code.length <= 2 || GL_SYS_CODES_[code]) block.push('حساب أساسي بالدليل يعتمد عليه النظام — لا يُحذف (يمكن إعادة تسميته أو إيقافه)');
  if (roleHit.length) block.push('حساب يستخدمه النظام للقيود التلقائية («' + roleHit.join('»، «') + '») — لا يُحذف');
  var fxB = ''; try { fxB = _glFxBridgeAcc_(); } catch (eF) {}
  if (acc.kind === 'fx' || code === _glStr_(set.fx_bridge_acc) || code === fxB) block.push('حساب «وسيط تحويل العملات» — يدخل في كل القيود متعددة العملات فلا يُحذف');
  var tg = ''; try { tg = _glTripGroup_(); } catch (eT) {}
  if (tg && code === tg) block.push('مجموعة حسابات الرحلات — لا تُحذف');
  // القيود
  var lRows = _glRows_('lines'), eRows = _glRows_('entries'), hit = {}, onAcc = 0;
  lRows.forEach(function (r) { if (_glStr_(r[4]) === code) { hit[_glStr_(r[0])] = 1; onAcc++; } });
  var eAt = {}; eRows.forEach(function (r, i) { var id = _glStr_(r[0]); if (id && hit[id] && eAt[id] === undefined) eAt[id] = i; });
  var ls = {}; lRows.forEach(function (r) { var id = _glStr_(r[0]); if (hit[id]) (ls[id] = ls[id] || []).push(r); });
  var del = [], re = [], orphan = [], locked = [], closing = [];
  Object.keys(hit).sort().forEach(function (id) {
    if (eAt[id] === undefined) { orphan.push(id); if (ls[id].some(function (l) { return _glLocked_(l[2]); })) locked.push(id); return; }
    var e = eRows[eAt[id]], sk = _glStr_(e[6]), ty = _glStr_(e[3]);
    if (ty === 'قيد إقفال' || /^(CLOSE|HBSEASON):/.test(sk)) closing.push(id);
    if (_glLocked_(e[2])) locked.push(id);
    var oth = {}; ls[id].forEach(function (l) { var c = _glStr_(l[4]); if (c !== code) oth[c] = 1; });
    if (/^AUTO:(HB)?OPEN$/.test(sk) || (ty === 'قيد افتتاحي' && Object.keys(oth).length >= 2)) re.push(id); else del.push(id);
  });
  if (closing.length) block.push('الحساب داخل في ' + closing.length + ' قيد إقفال سنة/ترحيل أرباح موسم (' + closing.slice(0, 5).join('، ') + ') — أعد فتح السنة من «الإعدادات» أولاً');
  if (locked.length) block.push(locked.length + ' قيداً في فترة مقفلة حتى ' + lockDate + ' (' + locked.slice(0, 5).join('، ') + (locked.length > 5 ? '…' : '') + ') — افتح الفترة مؤقتاً من «الإعدادات» ثم أعد المحاولة');
  if (re.length) {
    var a34 = accM[GL_ACC_OPEN_DIFF_];
    if (!a34 || a34.isGroup || !a34.active) block.push('حساب «فروق أرصدة افتتاحية» (' + GL_ACC_OPEN_DIFF_ + ') غير موجود أو تجميعي أو موقوف — مطلوب لتحويل سطر الحساب في قيود الأرصدة الافتتاحية المجمّعة');
    else if (a34.currency) { var bad = 0; re.forEach(function (id) { ls[id].forEach(function (l) { if (_glStr_(l[4]) === code && _glCur_(l[7]) !== a34.currency) bad++; }); });
      if (bad) block.push('حساب «فروق أرصدة افتتاحية» بعملة ' + a34.currency + ' فقط وسطور الحساب بالقيود الافتتاحية بعملة أخرى — أزل تحديد عملته أولاً'); }
  }
  // الملخص
  var catOf = function (sk) { var m = sk.match(/^AUTO:([A-Z]+)/); if (m) return 'AUTO:' + m[1]; return (sk.match(/^(VCH|CUST|ERP|IMP|HBCHARTER):/) || [])[1] || (sk ? 'OTHER' : 'MANUAL'); };
  var lblOf = function (c) { return /^AUTO:/.test(c) ? 'قيود تلقائية — ' + (GL_SRC_LBL_[c.slice(5)] || c.slice(5)) : (GL_DELCAT_LBL_[c] || c); };
  var cats = {}, list = [], st = {}, dMin = '', dMax = '', nDelLines = 0, others = {}, srcs = {}, autoKeys = {}, custBy = {}, delSet = {}, reSet = {};
  del.concat(orphan).forEach(function (id) { delSet[id] = 1; }); re.forEach(function (id) { reSet[id] = 1; });
  var stOf = function (s) { return s === GL_ST_DRAFT_ ? 'draft' : (s === GL_ST_VOID_ ? 'void' : 'posted'); };
  del.concat(orphan).concat(re).forEach(function (id) {
    var e = eAt[id] !== undefined ? eRows[eAt[id]] : null, L = ls[id] || [], isRe = !!reSet[id];
    var sk = e ? _glStr_(e[6]) : '', c = e ? catOf(sk) : 'ORPHAN', s = e ? _glStr_(e[5]) : (_glStr_((L[0] || [])[3]) || GL_ST_POSTED_), d = e ? _glDate_(e[2]) : _glDate_((L[0] || [])[2]);
    var dk = _glDKey_(d); if (dk) { if (!dMin || dk < _glDKey_(dMin)) dMin = d; if (!dMax || dk > _glDKey_(dMax)) dMax = d; }
    if (!isRe) {
      var o = (cats[c] = cats[c] || { key: c, label: lblOf(c), n: 0, posted: 0, draft: 0, 'void': 0 }); o.n++; o[stOf(s)]++;
      st[stOf(s)] = (st[stOf(s)] || 0) + 1; nDelLines += L.length;
      _glLineDelta_(L.filter(function (l) { return _glStr_(l[4]) !== code; }), -1, others);
      if (/^AUTO:/.test(sk)) { autoKeys[sk] = 1; var so = (sk.match(/^AUTO:([A-Z]+)/) || [])[1]; if (s === GL_ST_POSTED_ && so && so !== 'OPEN' && so !== 'HBOPEN') srcs[so] = (srcs[so] || 0) + 1; }
      var cm = sk.match(/^CUST:(.+)$/); if (cm && s !== GL_ST_VOID_) custBy[cm[1]] = (custBy[cm[1]] || 0) + 1;
    } else _glLineDelta_(L.filter(function (l) { return _glStr_(l[4]) === code; }).map(function (l) { var n = l.slice(); n[4] = GL_ACC_OPEN_DIFF_; return n; }), 1, others);
    if (list.length < 300) list.push({ id: id, date: d, type: e ? _glStr_(e[3]) : '—', desc: (e ? _glStr_(e[4]) : _glStr_((L[0] || [])[15])).slice(0, 90), status: s, cat: isRe ? 'يُحوَّل سطره لـ34' : lblOf(c),
      amt: _glAmtTxt_(L, accM), lines: L.length, act: isRe ? 're' : 'del' });
  });
  list.sort(function (a, b) { var x = _glDKey_(a.date), y = _glDKey_(b.date); return x < y ? -1 : (x > y ? 1 : (a.id < b.id ? -1 : 1)); });
  var liveKeys = {}; eRows.forEach(function (r) { var k = _glStr_(r[6]), id = _glStr_(r[0]); if (autoKeys[k] && !delSet[id]) liveKeys[k] = 1; });
  var bal = (_glLineDelta_(lRows.filter(function (l) { return _glStr_(l[4]) === code; }), 1, {}))[code] || { EGP: 0, SAR: 0, USD: 0, base: 0 };
  var othList = Object.keys(others).filter(function (c) { var o = others[c]; return c !== code && (Math.abs(o.EGP) >= 0.01 || Math.abs(o.SAR) >= 0.01 || Math.abs(o.USD) >= 0.01 || Math.abs(o.base) >= 0.01); })
    .map(function (c) { var o = others[c], a = accM[c]; return { code: c, name: a ? a.name : '(غير موجود بالدليل)', fx: !!(a && a.kind === 'fx'), EGP: o.EGP, SAR: o.SAR, USD: o.USD, base: o.base }; })
    .sort(function (a, b) { return Math.abs(b.base) - Math.abs(a.base); });
  // ربط الطرف ⇒ «محذوف» (لا يُفتح له حساب تلقائياً) — حساب آخر بنفس الربط يتقدّم عليه
  var tomb = [], tombKeys = [], byLink = {};
  accs.list.forEach(function (a) {
    if (a.isGroup || a.code === code) return;
    if (a.link) byLink[a.kind + '|' + _glNorm_(a.link)] = a.code;
    String(a.notes || '').replace(/⟦alias:([^|⟧]*)\|([^⟧]+)⟧/g, function (m, k, n) { byLink[k + '|' + _glNorm_(n)] = a.code; return m; });
  });
  var addT = function (k, n) { if (!GL_PARTY_KINDS_[k] || acc.isGroup) return; var key = k + '|' + _glNorm_(n); if (tombKeys.indexOf(key) >= 0) return; tombKeys.push(key);
    tomb.push({ key: key, kind: k, kindLbl: GL_KINDS_[k] || (k === 'hbrev' ? 'إيرادات حجوزات مورد' : k), name: _glStr_(n), other: byLink[key] ? byLink[key] + ' — ' + ((accM[byLink[key]] || {}).name || '') : '' }); };
  if (acc.link) addT(acc.kind, acc.link);
  String(acc.notes || '').replace(/⟦alias:([^|⟧]*)\|([^⟧]+)⟧/g, function (m, k, n) { addT(k, n); return m; });
  // المراجع
  var refs = { hbmap: 0, hbpay: 0, cpdir: 0, ovr: 0, cat: 0, csMap: 0, custsheet: set['custsheet:' + code] !== undefined, bankdue: 0, attach: 0, pending: 0, hbmir: 0, cpMirror: 0, apMirror: 0, hbkeep: 0 }, hbmirIds = [];
  try { _glRows_('hbmap').forEach(function (r) { if (_glStr_(r[2]) === code) refs.hbmap++; }); } catch (e1) {}
  try { _glRowsW_('hbpay').forEach(function (r) { if (_glStr_(r[1]) === code || _glStr_(r[7]) === code) refs.hbpay++; }); } catch (e2) {}
  try { _glRows_('cpdir').forEach(function (r) { if (_glStr_(r[1]) === code) refs.cpdir++; }); } catch (e3) {}
  try { _glRowsW_('autoovr').forEach(function (r) { if (_glStr_(r[1]) === 'acc' && (_glStr_(r[3]) === code || _glStr_(r[4]) === code)) refs.ovr++; }); } catch (e4) {}
  try { var csm = _glCsMap_(); Object.keys(csm).forEach(function (k) { if (_glStr_(csm[k]) === code) refs.csMap++; }); } catch (e5) {}
  try { _glRows_('bankdue').forEach(function (r) { if (delSet[_glStr_(r[0])]) refs.bankdue++; }); } catch (e6) {}
  try { _glRows_('attach').forEach(function (r) { if (delSet[_glStr_(r[0])]) refs.attach++; }); } catch (e7) {}
  try { var pr = _glPendingRows_(); Object.keys(pr).forEach(function (k) { if ((autoKeys[k] && !liveKeys[k]) || (/^CCY:/.test(k) && delSet[k.slice(4)])) refs.pending++; }); } catch (e8) {}
  try { _glRows_('hbmir').forEach(function (r) { var id = _glStr_(r[0]); if (delSet[id] && hbmirIds.indexOf(id) < 0) hbmirIds.push(id); }); refs.hbmir = hbmirIds.length; } catch (e9) {}
  try { _glRows_('hbkeep').forEach(function (r) { if (delSet[_glStr_(r[1])]) refs.hbkeep++; }); } catch (e10) {}
  var catHit = []; try { catHit = _glAccDelCatScan_(code); } catch (e11) {} refs.cat = catHit.length;
  try { refs.cpMirror = _glAccDelPayScan_(delSet).rows.length; } catch (e12) {}
  try { refs.apMirror = _glAccDelApScan_(delSet).n; } catch (e13) {}
  // ملاحظات النتائج للمدير
  var nAuto = Object.keys(srcs).reduce(function (s, k) { return s + srcs[k]; }, 0);
  if (nAuto) notes.push('🔸 ' + nAuto + ' قيداً تلقائياً ما زالت مصادرها موجودة بشاشاتها: ' + Object.keys(srcs).map(function (k) { return (GL_SRC_LBL_[k] || k) + (GL_SRC_SCREEN_[k] ? ' («' + GL_SRC_SCREEN_[k] + '»)' : '') + ': ' + srcs[k]; }).join(' · ') +
    ' — تبقى السجلات كما هي بشاشاتها لكن قيودها لن تُرحَّل للحسابات العامة مرة أخرى (تُسجَّل «ملغاة يدوياً»)، فيختلف رصيد الطرف بالحسابات العامة عن شاشته');
  tomb.forEach(function (t) {
    notes.push(t.other ? '🔗 الحساب مربوط بـ«' + t.kindLbl + ': ' + t.name + '» — سيستمر تسجيل قيوده الجديدة على الحساب ' + t.other + ' المربوط بنفس الاسم'
      : '🔗 الحساب مربوط بـ«' + t.kindLbl + ': ' + t.name + '» — بعد الحذف لن يُفتح له حساب تلقائياً ولن تُسجَّل له أي قيود تلقائية جديدة (تظهر تنبيهاً بالمزامنة) ما دام موجوداً بشاشات البرنامج. لإعادته أنشئ حساباً جديداً مربوطاً بنفس الاسم');
  });
  if (re.length) notes.push('🔁 ' + re.length + ' قيد أرصدة افتتاحية مجمّع (فيه أرصدة حسابات أخرى) لن يُحذف: يُحوَّل سطر هذا الحساب فيه إلى «' + GL_ACC_OPEN_DIFF_ + ' فروق أرصدة افتتاحية» فتبقى أرصدة الحسابات الأخرى كما هي' +
    (re.some(function (id) { return /^AUTO:/.test(_glStr_(eRows[eAt[id]][6])); }) ? ' — وقد يظهر قيد الأرصدة الافتتاحية التلقائي بالمزامنة التالية لإعادة ترتيبه (بنفس الأرصدة)؛ اعتمده إن ظهر بتبويب الاعتماد' : ''));
  if (orphan.length) notes.push('🩺 ' + orphan.length + ' قيداً بلا رأس (أسطر يتيمة) على الحساب — تُحذف أسطرها كاملة');
  Object.keys(custBy).forEach(function (c) { if (c === code) return; notes.push('📄 ' + custBy[c] + ' صفاً بشيت «' + ((accM[c] || {}).name || c) + '» مسجلة بقيود ستُحذف — تظهر بالمزامنة التالية للشيت كمشكلة «رقم القيد غير موجود» حتى تمسح رقم القيد من الصف (لتسجيله من جديد) أو تحذف الصف'); });
  if (refs.custsheet) notes.push('📄 سيُفك ربط شيت العهدة/الخزينة/البنك الخاص بهذا الحساب وتتوقف مزامنته');
  if (refs.cpMirror) notes.push('👥 ' + refs.cpMirror + ' دفعة منسوخة من السندات إلى «حسابات عملاء العمرة» ستُحذف من هناك');
  if (refs.apMirror) notes.push('🧑‍💼 ' + refs.apMirror + ' دفعة/بند منسوخ من القيود إلى «حسابات الوكلاء» سيُحذف من هناك');
  if (refs.hbmir) notes.push('🏨 ' + refs.hbmir + ' قيداً منسوخاً لسجل دفعات برنامج الحجوزات — تُحذف نسخها هناك تلقائياً');
  if (refs.hbkeep) notes.push('🏨 ' + refs.hbkeep + ' حجز فنادق كان مستبدَلاً بقيد ERP سيُحذف — يبقى الحجز بلا قيد');
  var cl = [['hbmap', 'خريطة أسماء الحجوزات (يُفرَّغ الحساب)'], ['hbpay', 'مراجعة دفعات الحجوزات'], ['cpdir', 'توجيه دفعات العملاء'], ['ovr', 'تعديلات يدوية للقيود التلقائية'], ['cat', 'اتفاقيات الإعاشة (يُفرَّغ الحساب فيها)'],
    ['csMap', 'أسماء متعلَّمة لشيتات العهد'], ['attach', 'مرفقات (تبقى ملفاتها بالدرايف)'], ['bankdue', 'تواريخ استحقاق بنكية'], ['pending', 'بنود بانتظار الاعتماد']].filter(function (x) { return refs[x[0]]; });
  if (cl.length) notes.push('🧹 تنظيف المراجع: ' + cl.map(function (x) { return x[1] + ' (' + refs[x[0]] + ')'; }).join(' · '));
  notes.push('🔒 الكود ' + code + ' لن يُعطى لأي حساب جديد بعد الحذف');
  notes.push('💾 تُحفظ نسخة كاملة من كل صف محذوف أو معدَّل بشيت «' + GL_SHEETS_.deleted.name + '» بملف الحسابات (برقم عملية الحذف) للاستعادة اليدوية عند الحاجة');
  var sig = _glHash_(JSON.stringify([code, del, re, orphan, onAcc, nDelLines, lockDate, kids.length]));
  return { acc: acc, lRows: lRows, eRows: eRows, delSet: delSet, reSet: reSet, del: del, re: re, orphan: orphan, autoKeys: autoKeys, liveKeys: liveKeys, tombKeys: tomb.map(function (t) { return { key: t.key, name: t.name }; }), catHit: catHit, hbmirIds: hbmirIds,
    out: { account: { code: code, name: acc.name, kind: acc.kind, kindLbl: GL_KINDS_[acc.kind] || '', link: acc.link, currency: acc.currency, active: acc.active, isGroup: acc.isGroup, parent: acc.parent, parentName: (accM[acc.parent] || {}).name || '' },
      balance: bal, blockers: block, notes: notes, sig: sig, lockDate: lockDate,
      entries: { del: del.length, re: re.length, orphan: orphan.length, lines: nDelLines, linesOnAcc: onAcc, posted: st.posted || 0, draft: st.draft || 0, 'void': st['void'] || 0, from: dMin, to: dMax },
      cats: Object.keys(cats).map(function (k) { return cats[k]; }).sort(function (a, b) { return b.n - a.n; }), list: list, listN: del.length + orphan.length + re.length,
      others: othList.slice(0, 40), othersN: othList.length, sources: Object.keys(srcs).map(function (k) { return { src: k, label: GL_SRC_LBL_[k] || k, screen: GL_SRC_SCREEN_[k] || '', n: srcs[k] }; }), tomb: tomb, refs: refs } };
}
function glAccountDeletePreview(authToken, code) {
  _glAdminPerm_(authToken);
  _GL_ACC_MEMO_ = null;
  return Object.assign({ success: true }, _glAccDelPlan_(code).out);
}
function glAccountDelete(authToken, code, confirmText, sig) {
  var session = _glAdminPerm_(authToken), user = session.username;
  code = _glStr_(code);
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var P = _glAccDelPlan_(code), acc = P.acc, O = P.out;
    var ct = _glStr_(_glLatin_(confirmText));
    if (ct !== code && !(ct && _glNorm_(ct) === _glNorm_(acc.name))) throw new Error('للتأكيد اكتب كود الحساب «' + code + '» أو اسمه كما هو تماماً');
    if (O.blockers.length) throw new Error('لا يمكن حذف الحساب:\n• ' + O.blockers.join('\n• '));
    if (_glStr_(sig) !== O.sig) throw new Error('تغيّرت قيود الحساب منذ فتح نافذة الحذف — أغلقها وافتحها من جديد لمراجعة ما سيُحذف');
    var now = _glNow_(), delId = 'DEL-' + Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyyMMdd-HHmmss') + '-' + code;
    var delSet = P.delSet, reSet = P.reSet, bk = [], tagTxt = 'حساب محذوف ' + code + ' — ' + acc.name;
    var J = function (v) { return JSON.stringify(v, function (k, x) { return this[k] instanceof Date ? _glStr_(this[k]) : x; }); };
    var B = function (kind, key, row, data) { bk.push([delId, kind, key, row == null ? '' : String(row), J(data), code, user, now]); };
    // 1) حساب التغييرات كلها أولاً (قراءة فقط) مع النسخة الاحتياطية لكل صف
    var lRows = P.lRows, keptL = [], delL = [], movedL = [];
    lRows.forEach(function (r, i) {
      var id = _glStr_(r[0]);
      if (delSet[id]) { B('ROW', 'lines', i + 2, r); delL.push(r); return; }
      if (reSet[id] && _glStr_(r[4]) === code) {
        B('MOVE', 'lines', i + 2, r);
        var n = r.slice(); n[4] = GL_ACC_OPEN_DIFF_; n[13] = ''; n[14] = ''; n[15] = _glStr_(_glStr_(r[15]) + ' (' + tagTxt + ')');
        keptL.push(n); movedL.push([r, n]); return;
      }
      keptL.push(r);
    });
    var eRows = P.eRows, keptE = [], delE = [];
    eRows.forEach(function (r, i) { if (delSet[_glStr_(r[0])]) { B('ROW', 'entries', i + 2, r); delE.push(r); } else keptE.push(r); });
    var side = [], refN = {};
    var scan = function (key, fn) {   // fn(صف) ⇒ null يبقى · 'del' يُحذف · مصفوفة تحل محله
      var rows = [], out = [], n = 0; try { rows = _glRowsWRaw_(key); } catch (e) { rows = []; }
      rows.forEach(function (r, i) { var t = fn(r); if (!t) { out.push(r); return; } n++; B(t === 'del' ? 'ROW' : 'MOVE', key, i + 2, r); if (t !== 'del') out.push(t); });
      if (n) side.push({ key: key, rows: out });
      return (refN[key] = n);
    };
    scan('bankdue', function (r) { return delSet[_glStr_(r[0])] ? 'del' : null; });
    scan('attach', function (r) { return delSet[_glStr_(r[0])] ? 'del' : null; });   // ملفات الدرايف تبقى (للاستعادة)
    scan('cpdir', function (r) { return _glStr_(r[1]) === code ? 'del' : null; });
    scan('hbmap', function (r) { if (_glStr_(r[2]) !== code) return null; var n = r.slice(); n[2] = ''; n[4] = _glStr_(_glStr_(r[4]) + ' (حُذف حسابه ' + code + ' مع قيوده — ' + delId + ')'); return n; });
    scan('hbpay', function (r) {
      var c1 = _glStr_(r[1]) === code, c7 = _glStr_(r[7]) === code; if (!c1 && !c7) return null;
      var n = r.slice(); if (c1) n[1] = ''; if (c7) n[7] = '';
      return (!_glStr_(n[1]) && !_glStr_(n[7]) && !_glStr_(n[8])) ? 'del' : n;   // نفس قاعدة glHbSavePay: بلا حساب ولا ربط ⇒ تُحذف المراجعة
    });
    // قواعد التعديل اليدوي: «إلغاء يدوي» لكل مفتاح تلقائي محذوف (فلا تعيد المزامنة ترحيله) — عدا مفتاح ما زال لقيد قائم آخر، واتفاقية
    // إعاشة فُرِّغ حسابها (لا تُبنى أصلاً حتى يُحدَّد لها حساب جديد فتُرحَّل عادي) · قواعد قيود الشيتات المحذوفة وقواعد الحساب تُزال
    var om = _glOvrMap_(), ovrAff = {}, vdKeys = [], catKeys = {}, vdNote = 'حُذف مع حذف الحساب ' + code + ' — ' + acc.name + ' (' + delId + ')';
    P.catHit.forEach(function (x) { if (x.id) catKeys['AUTO:CAT:' + x.id] = 1; });
    Object.keys(P.autoKeys).forEach(function (k) {
      if (P.liveKeys[k]) return;
      if (catKeys[k]) { if (om[k]) { delete om[k]; ovrAff[k] = 1; } return; }
      om[k] = { acc: [], hdr: null, freeze: null, vd: { by: user, at: now, note: vdNote } }; ovrAff[k] = 1; vdKeys.push(k);
    });
    Object.keys(om).forEach(function (k) {
      if (ovrAff[k] && om[k] && om[k].vd && om[k].vd.note === vdNote) return;
      var m = k.match(/^CUST:[^#]*#(.+)$/); if (m && delSet[m[1]]) { delete om[k]; ovrAff[k] = 1; return; }
      var a0 = om[k].acc.length; om[k].acc = om[k].acc.filter(function (a) { return a.from !== code && a.to !== code; }); if (om[k].acc.length !== a0) ovrAff[k] = 1;
    });
    var ovrN = 0; try { _glRowsW_('autoovr').forEach(function (r, i) { if (ovrAff[_glStr_(r[0])]) { B('MOVE', 'autoovr', i + 2, r); ovrN++; } }); } catch (eO) {}
    var pr = _glPendingRows_(), pDrop = [];
    Object.keys(pr).forEach(function (k) { if ((P.autoKeys[k] && !P.liveKeys[k]) || (/^CCY:/.test(k) && delSet[k.slice(4)])) { pDrop.push(k); B('ROW', 'pending', pr[k].i + 2, pr[k].row); } });
    var set = _glSettings_(), csKey = 'custsheet:' + code, csCfg = set[csKey];
    if (csCfg !== undefined) B('ROW', 'settings', '', [csKey, csCfg]);
    var csMap = _glCsMap_(), csMap2 = {}, csGone = {};
    Object.keys(csMap).forEach(function (k) { if (_glStr_(csMap[k]) === code) csGone[k] = csMap[k]; else csMap2[k] = csMap[k]; });
    if (Object.keys(csGone).length) B('MOVE', 'settings', '', { custsheet_map_removed: csGone });
    P.catHit.forEach(function (x) { B('EXT', typeof CATERING_SHEET !== 'undefined' ? CATERING_SHEET : 'CateringContracts', x.row, x); });
    var pay = { rows: [] }; try { pay = _glAccDelPayScan_(delSet); } catch (eP) {}
    if (pay.rows.length) { var pAll = pay.sh.getRange(2, 1, pay.last - 1, ACC_PAY_HEADERS.length).getValues(); pay.rows.forEach(function (rw) { B('EXT', ACC_PAY_SHEET, rw, pAll[rw - 2]); }); }
    var apS = null; try { apS = _glAccDelApScan_(delSet); } catch (eAp) {}
    if (apS && apS.n) ['pay', 'item'].forEach(function (t) {
      var s = apS.S[t]; if (!apS.rows[t].length) return;
      var all = s.sh.getRange(2, 1, s.sh.getLastRow() - 1, s.W).getValues(); apS.rows[t].forEach(function (rw) { B('EXT', s.name, rw, all[rw - 2]); });
    });
    _GL_ACC_MEMO_ = null;
    var accNow = _glAccounts_().map[code], aW = GL_SHEETS_.accounts.headers.length, aRow = accNow._row;
    B('ROW', 'accounts', aRow, _glSheetR_('accounts').getRange(aRow, 1, 1, aW).getValues()[0]);
    var sum = { code: code, name: acc.name, kind: acc.kind, link: acc.link, deleted: delE.length, orphans: P.orphan.length, reassigned: P.re.length, lines: delL.length, moved: movedL.length,
      voidKeys: vdKeys.slice(0, 300), voidKeysN: vdKeys.length, tomb: P.tombKeys, refs: refN, at: now, by: user };
    // 2) النسخة الاحتياطية أولاً (قبل أي حذف)
    var dSh = _glSheet_('deleted'), hdrRow = dSh.getLastRow() + 1;
    dSh.getRange(hdrRow, 1, 1 + bk.length, 8).setValues([[delId, 'HDR', 'جارٍ', '', J(sum), code, user, now]].concat(bk));
    // 3) منع الإعادة بالمزامنة قبل الحذف: تقاعد الكود + الطرف «محذوف» + قواعد الإلغاء اليدوي
    var AD = JSON.parse(JSON.stringify(_glAccDeleted_()));
    AD.codes[code] = { n: acc.name, d: delId, at: now };
    P.tombKeys.forEach(function (t) { AD.tomb[t.key] = { c: code, n: acc.name, l: t.name, d: delId }; });
    _glSetSetting_('acc_deleted', JSON.stringify(AD)); _GL_ACCDEL_MEMO_ = null;
    if (Object.keys(ovrAff).length) _glOvrSave_(om);
    // 4) الأسطر ثم رؤوس القيود (بإعادة كتابة كاملة — الأسطر أولاً فلا تبقى أسطر بلا رأس تؤثر على الأرصدة)
    var rewrite = function (key, kept, oldN) {
      var sh = _glSheet_(key), W = GL_SHEETS_[key].headers.length, old = Math.max(oldN, sh.getLastRow() - 1);
      if (kept.length) sh.getRange(2, 1, kept.length, W).setValues(kept);
      if (kept.length < old) sh.getRange(2 + kept.length, 1, old - kept.length, W).clearContent();
    };
    if (delL.length || movedL.length) rewrite('lines', keptL, lRows.length);
    if (delE.length) rewrite('entries', keptE, eRows.length);
    side.forEach(function (s) { var sh = _glSheet_(s.key), W = GL_SHEETS_[s.key].headers.length, last = sh.getLastRow(); if (last > 1) sh.getRange(2, 1, last - 1, W).clearContent(); if (s.rows.length) sh.getRange(2, 1, s.rows.length, W).setValues(s.rows); });
    if (pDrop.length) _glPendingDrop_(pDrop);
    // 5) شيت العهدة الخاص بالحساب + الأسماء المتعلَّمة + اتفاقيات الإعاشة + الحساب نفسه
    if (csCfg !== undefined) {
      _glDelSetting_(csKey);
      try { var PP = PropertiesService.getScriptProperties(); PP.deleteProperty('GLBOT_CS_' + code);
        ['GL_CS_SIG', 'GL_CS_LAST_AUTO'].forEach(function (pk) { try { var o = JSON.parse(PP.getProperty(pk) || '{}') || {}; if (o[code] !== undefined) { delete o[code]; PP.setProperty(pk, JSON.stringify(o)); } } catch (e1) {} });
      } catch (eS) {}
      _GL_SET_MEMO_ = null; try { _glCsEnsureTrigger_(); } catch (eT) { Logger.log('accdel custsheet trigger: ' + eT.message); }
    }
    if (Object.keys(csGone).length) _glSetSetting_('custsheet_map', JSON.stringify(csMap2));
    refN.cat = 0; if (P.catHit.length) try { refN.cat = _glAccDelCatClear_(code); } catch (eC) { Logger.log('accdel catering: ' + eC.message); }
    _GL_ACC_MEMO_ = null; accNow = _glAccounts_().map[code];
    if (accNow) _glSheet_('accounts').deleteRow(accNow._row);
    _GL_ACC_MEMO_ = null;
    // 6) النسخ المعكوسة: دفعات حسابات العملاء (من السندات) + كشف برنامج الحجوزات (طابور خارج القفل)
    refN.cpMirror = 0;
    try { var pay2 = _glAccDelPayScan_(delSet); pay2.rows.sort(function (a, b) { return b - a; }).forEach(function (rw) { pay2.sh.deleteRow(rw); }); refN.cpMirror = pay2.rows.length; } catch (eM) { Logger.log('accdel cp mirror: ' + eM.message); }
    refN.apMirror = 0;   // 🧑‍💼 (V4.328) ونسخها بحسابات الوكلاء
    try {
      var ap2 = _glAccDelApScan_(delSet);
      ['pay', 'item'].forEach(function (t) { _glRowBlocks_(ap2.rows[t].map(function (rw) { return { row: rw }; })).forEach(function (b) { ap2.S[t].sh.deleteRows(b[0], b[1]); }); });
      refN.apMirror = ap2.n; if (ap2.n) { _vzClearCache_(); try { CacheService.getScriptCache().remove(GL_AP_IDX_KEY_); } catch (eC2) {} }
    } catch (eAm) { Logger.log('accdel agent mirror: ' + eAm.message); }
    var hbBy = ''; try { hbBy = _glHbStaffName_(user); } catch (eN) {}
    P.hbmirIds.forEach(function (id) { _glMirQ_(id, { notify: P.hbmirIds.length <= 10, by: hbBy }); });
    // البيانات المحاسبية للدفعات داخل ملف برنامج الحجوزات (حساب نقدي = الكود ⇒ يُحذف الصف كما يفعل برنامج الحجوزات للحساب الفارغ)
    var nMeta = 0;
    try {
      var hbId = _glSettings_().hb_ss_id, mSh = hbId ? SpreadsheetApp.openById(hbId).getSheetByName('البيانات المحاسبية للدفعات') : null;
      if (mSh && mSh.getLastRow() > 1) {
        var mv = mSh.getRange(2, 1, mSh.getLastRow() - 1, 6).getValues(), mDel = [];
        mv.forEach(function (r, i) { if (_glStr_(r[1]) === code) mDel.push(i + 2); });
        if (mDel.length) {
          dSh.getRange(dSh.getLastRow() + 1, 1, mDel.length, 8).setValues(mDel.map(function (rw) { return [delId, 'EXT', 'HB:البيانات المحاسبية للدفعات', String(rw), J(mv[rw - 2]), code, user, now]; }));
          mDel.sort(function (a, b) { return b - a; }).forEach(function (rw) { mSh.deleteRow(rw); }); nMeta = mDel.length;
        }
      }
    } catch (eMe) { Logger.log('accdel hb meta: ' + eMe); }
    // 7) الكاش والسجلات والتنبيه
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_DEFCUR_MEMO_ = null; _GL_HB_MEMO_ = null; _glSetDrop_();
    try { CacheService.getScriptCache().removeAll(['gll_accs', 'gll_accs2', 'gll_ents']); } catch (eCa) {}
    _glTouch_('accounts');
    var txt = delE.length + ' قيداً (' + delL.length + ' سطراً)' + (P.orphan.length ? ' + ' + P.orphan.length + ' قيداً بلا رأس' : '') + (movedL.length ? ' · حُوِّل ' + movedL.length + ' سطراً افتتاحياً لـ' + GL_ACC_OPEN_DIFF_ : '') + (vdKeys.length ? ' · قواعد إلغاء ' + vdKeys.length : '');
    logChange_(user, 'حذف حساب من الدليل مع قيوده', 'GL:' + code, acc.name, txt, delId);
    if (delE.length) logChangesBatch_(user, delE.map(function (r) { return { action: 'حذف قيد نهائياً (مع حذف حساب)', recordId: 'GL:' + _glStr_(r[0]), field: _glStr_(r[3]) + ' — ' + _glStr_(r[5]),
      oldVal: _glStr_(r[4]) + ' — ' + _glNum_(r[8]) + ' ج', newVal: 'حُذف مع الحساب ' + code + ' — ' + acc.name + ' (' + delId + ')' }; }));
    _glBotQ_('entry_void', { accDel: { code: code, name: acc.name, n: delE.length, lines: delL.length, re: P.re.length, delId: delId }, deleted: true, by: user });
    dSh.getRange(hdrRow, 3).setValue('تم');
    var delta = _glLineDelta_(delL, -1, {}); movedL.forEach(function (p) { _glLineDelta_([p[0]], -1, delta); _glLineDelta_([p[1]], 1, delta); });
    refN.ovr = ovrN; refN.pending = pDrop.length; refN.meta = nMeta; refN.custsheet = csCfg !== undefined; refN.csMap = Object.keys(csGone).length;
    return { success: true, delId: delId, code: code, name: acc.name, deleted: delE.length, orphans: P.orphan.length, reassigned: P.re.length, lines: delL.length, moved: movedL.length,
      voidRules: vdKeys.length, tomb: P.tombKeys.length, refs: refN, balancesDelta: delta, pendingCount: _glCpPending_(), mirQ: _GL_MIRQ_N_ };
  } finally { _glUnlock_(lock); }
}
/* ↩️ (V4.362) استعادة حساب حُذف من الدليل مع قيوده — تعكس glAccountDelete من نسختها بشيت GL_Deleted (برقم العملية DEL-…):
   الحساب بنفس الكود، القيود والأسطر بنفس أرقامها، الأسطر الافتتاحية المحوَّلة لـ34 تعود لحسابها، المراجع الجانبية (الاستحقاق،
   المرفقات، توجيه الدفعات، ربط الحجوزات ومراجعة دفعاتها، بنود الاعتماد، قواعد التعديل اليدوي)، ربط شيت العهدة/الخزينة واسمه،
   حساب اتفاقيات الإعاشة، نسخ الدفعات بحسابات العملاء والوكلاء، البيانات المحاسبية لدفعات برنامج الحجوزات — ثم يُلغى تقاعد الكود
   وعلامات «الطرف محذوف» وقواعد «الإلغاء اليدوي» التي أضافها الحذف. للمدير فقط · معاينة أولاً (dry) · تُرفض عند التعارض. */
function _glDelOps_(delId) {
  var sh = _glSheet_('deleted'), last = sh.getLastRow(), out = { hdr: null, hdrRow: 0, ops: [] };
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 8).getValues().forEach(function (r, i) {
    if (_glStr_(r[0]) !== delId) return;
    var data = null; try { data = JSON.parse(String(r[4] || 'null')); } catch (e) { data = null; }
    if (_glStr_(r[1]) === 'HDR') { out.hdr = { state: _glStr_(r[2]), sum: data || {}, by: _glStr_(r[6]), at: _glStr_(r[7]), code: _glStr_(r[5]) }; out.hdrRow = i + 2; return; }
    out.ops.push({ kind: _glStr_(r[1]), key: _glStr_(r[2]), row: +r[3] || 0, data: data });
  });
  return out;
}
function glAccDeletedList(authToken) {
  _glAdminPerm_(authToken);
  var sh = _glSheetR_('deleted'), last = sh.getLastRow(), out = [];
  if (last >= 2) sh.getRange(2, 1, last - 1, 8).getValues().forEach(function (r) {
    if (_glStr_(r[1]) !== 'HDR') return;
    var s = {}; try { s = JSON.parse(String(r[4] || '{}')) || {}; } catch (e) {}
    out.push({ delId: _glStr_(r[0]), state: _glStr_(r[2]), code: _glStr_(r[5]), name: _glStr_(s.name), kind: _glStr_(s.kind), deleted: +s.deleted || 0, lines: +s.lines || 0,
      moved: +s.moved || 0, voidN: +s.voidKeysN || 0, by: _glStr_(r[6]), at: _glStr_(r[7]), exists: !!_glAccounts_().map[_glStr_(r[5])] });
  });
  return { success: true, rows: out.reverse() };
}
function glAccountRestore(authToken, delId, dry) {
  var session = _glAdminPerm_(authToken), user = session.username;
  delId = _glStr_(delId);
  if (!/^DEL-/.test(delId)) throw new Error('رقم عملية الحذف غير صحيح');
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var D = _glDelOps_(delId);
    if (!D.hdr) throw new Error('لا توجد عملية حذف بهذا الرقم في GL_Deleted');
    if (/مُستعاد/.test(D.hdr.state)) throw new Error('هذه العملية استُعيدت من قبل (' + D.hdr.state + ')');
    if (D.hdr.state !== 'تم') throw new Error('عملية الحذف لم تكتمل (الحالة: ' + (D.hdr.state || '؟') + ') — راجع المدير');
    var code = D.hdr.code, sum = D.hdr.sum || {}, ops = D.ops;
    var of = function (kind, key) { return ops.filter(function (o) { return o.kind === kind && o.key === key && Array.isArray(o.data); }); };
    var accRows = of('ROW', 'accounts'), entRows = of('ROW', 'entries'), lineRows = of('ROW', 'lines'), moveLines = of('MOVE', 'lines');
    var conflicts = [];
    if (!accRows.length) conflicts.push('صف الحساب نفسه غير موجود بالنسخة الاحتياطية');
    if (_glAccounts_().map[code]) conflicts.push('يوجد الآن حساب بنفس الكود ' + code);
    var curE = {}; _glRows_('entries').forEach(function (r) { curE[_glStr_(r[0])] = 1; });
    entRows.forEach(function (o) { if (curE[_glStr_(o.data[0])]) conflicts.push('رقم القيد ' + _glStr_(o.data[0]) + ' مستخدم الآن لقيد آخر'); });
    var parent = accRows.length ? _glStr_(accRows[0].data[3]) : '';
    if (parent && !_glAccounts_().map[parent]) conflicts.push('الحساب الأب ' + parent + ' لم يعد موجوداً');
    // الأسطر الافتتاحية المحوَّلة: نجد كل سطر بمكانه الحالي (القيد + رقم السطر + الحساب 34)
    var lRows = _glRowsW_('lines'), lIdx = {};
    lRows.forEach(function (r, i) { lIdx[_glStr_(r[0]) + '#' + _glStr_(r[1]) + '#' + _glStr_(r[4])] = i; });
    var moveFix = [], moveMiss = [];
    moveLines.forEach(function (o) {
      var i = lIdx[_glStr_(o.data[0]) + '#' + _glStr_(o.data[1]) + '#' + GL_ACC_OPEN_DIFF_];
      if (i === undefined) moveMiss.push(_glStr_(o.data[0]) + ' سطر ' + _glStr_(o.data[1])); else moveFix.push({ i: i, row: o.data });
    });
    var plan = { delId: delId, code: code, name: _glStr_(sum.name), entries: entRows.length, lines: lineRows.length, moved: moveFix.length, movedMissing: moveMiss,
      side: {}, voidRules: 0, conflicts: conflicts, at: D.hdr.at, by: D.hdr.by };
    ops.forEach(function (o) { if (o.kind !== 'HDR' && ['accounts', 'entries', 'lines'].indexOf(o.key) < 0) plan.side[o.key] = (plan.side[o.key] || 0) + 1; });
    var om = _glOvrMap_(), vdOwn = Object.keys(om).filter(function (k) { return om[k].vd && String(om[k].vd.note || '').indexOf(delId) >= 0; });
    plan.voidRules = vdOwn.length;
    if (dry || conflicts.length) { plan.success = true; plan.dry = true; plan.ok = !conflicts.length; return plan; }
    if (typeof _snapPreRisk_ === 'function') { try { _snapPreRisk_('قبل استعادة الحساب المحذوف ' + code + ' (' + delId + ')', user); } catch (eS) {} }
    var app = function (key, rows) {   // إلحاق صفوف بعرض الشيت المعرّف
      if (!rows.length) return;
      var sh = _glSheet_(key), W = GL_SHEETS_[key].headers.length;
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, W).setValues(rows.map(function (r) { var x = r.slice(0, W); while (x.length < W) x.push(''); return x; }));
    };
    var byRow = function (a, b) { return a.row - b.row; };
    // 1) الحساب ثم رؤوس القيود ثم الأسطر (والأسطر المحوَّلة تعود لحسابها)
    app('accounts', accRows.map(function (o) { return o.data; }));
    app('entries', entRows.sort(byRow).map(function (o) { return o.data; }));
    if (moveFix.length) {
      var lSh = _glSheet_('lines'), W = GL_SHEETS_.lines.headers.length;
      moveFix.forEach(function (m) { var x = m.row.slice(0, W); while (x.length < W) x.push(''); lSh.getRange(m.i + 2, 1, 1, W).setValues([x]); });
    }
    app('lines', lineRows.sort(byRow).map(function (o) { return o.data; }));
    // 2) المراجع الجانبية: الصفوف المحذوفة تُلحق، والمعدَّلة تعود لأصلها بمفتاحها
    ['bankdue', 'attach', 'cpdir', 'pending'].forEach(function (k) { app(k, of('ROW', k).map(function (o) { return o.data; })); });
    ['hbmap', 'hbpay'].forEach(function (k) {
      var moved = of('MOVE', k), dels = of('ROW', k);
      if (moved.length) {
        var sh = _glSheet_(k), W = GL_SHEETS_[k].headers.length, cur = _glRowsWRaw_(k), at = {};
        cur.forEach(function (r, i) { at[_glStr_(r[0]) + '|' + (k === 'hbmap' ? _glStr_(r[1]) : '')] = i; });
        moved.forEach(function (o) {
          var i = at[_glStr_(o.data[0]) + '|' + (k === 'hbmap' ? _glStr_(o.data[1]) : '')], x = o.data.slice(0, W); while (x.length < W) x.push('');
          if (i === undefined) dels.push(o); else sh.getRange(i + 2, 1, 1, W).setValues([x]);
        });
      }
      app(k, dels.map(function (o) { return o.data; }));
    });
    // قواعد التعديل اليدوي: تُحذف قواعد «الإلغاء اليدوي» التي أضافها الحذف، وتعود القواعد التي عُدِّلت لأصلها
    var ovrOrig = of('MOVE', 'autoovr'), ovrKeys = {};
    ovrOrig.forEach(function (o) { ovrKeys[_glStr_(o.data[0])] = 1; });
    vdOwn.forEach(function (k) { ovrKeys[k] = 1; });
    if (Object.keys(ovrKeys).length) {
      var oSh = _glSheet_('autoovr'), OW = GL_SHEETS_.autoovr.headers.length, cur = _glRowsWRaw_('autoovr');
      var keep = cur.filter(function (r) { return !ovrKeys[_glStr_(r[0])]; }).concat(ovrOrig.map(function (o) { var x = o.data.slice(0, OW); while (x.length < OW) x.push(''); return x; }));
      var lastO = oSh.getLastRow(); if (lastO >= 2) oSh.getRange(2, 1, lastO - 1, OW).clearContent();
      if (keep.length) oSh.getRange(2, 1, keep.length, OW).setNumberFormat('@').setValues(keep);
    }
    // 3) الإعدادات: ربط شيت العهدة/الخزينة + أسماؤه المتعلَّمة
    of('ROW', 'settings').forEach(function (o) { if (o.data.length >= 2 && _glStr_(o.data[0])) _glSetSetting_(_glStr_(o.data[0]), o.data[1]); });
    ops.forEach(function (o) {
      if (o.kind === 'MOVE' && o.key === 'settings' && o.data && o.data.custsheet_map_removed) {
        var m = _glCsMap_(); Object.keys(o.data.custsheet_map_removed).forEach(function (k) { m[k] = o.data.custsheet_map_removed[k]; });
        _glSetSetting_('custsheet_map', JSON.stringify(m));
      }
    });
    // 4) خارج الدفتر: حساب اتفاقيات الإعاشة · نسخ دفعات العملاء والوكلاء · البيانات المحاسبية لدفعات الحجوزات
    var ext = ops.filter(function (o) { return o.kind === 'EXT'; }), extN = 0;
    var catOps = ext.filter(function (o) { return o.data && !Array.isArray(o.data) && o.data.id !== undefined; });
    if (catOps.length && typeof CATERING_SHEET !== 'undefined') {
      try {
        var cSh = _accSheet_(CATERING_SHEET, CATERING_HEADERS), cl = cSh.getLastRow();
        if (cl >= 2) {
          var cv = cSh.getRange(2, 21, cl - 1, 3).getValues(), ch = false;
          catOps.forEach(function (o) { cv.forEach(function (r) { if (_glStr_(r[0]) === _glStr_(o.data.id)) { if (!_glStr_(r[1]) && o.data.vendorAcc === code) { r[1] = code; ch = true; } if (!_glStr_(r[2]) && o.data.targetAcc === code) { r[2] = code; ch = true; } } }); });
          if (ch) { cSh.getRange(2, 21, cl - 1, 3).setNumberFormat('@').setValues(cv); extN += catOps.length; }
        }
      } catch (eC) { Logger.log('accrestore catering: ' + eC.message); }
    }
    var extApp = function (sh, W, rows) { if (!rows.length) return; sh.getRange(sh.getLastRow() + 1, 1, rows.length, W).setValues(rows.map(function (r) { var x = r.slice(0, W); while (x.length < W) x.push(''); return x; })); extN += rows.length; };
    try { extApp(_accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), ACC_PAY_HEADERS.length, ext.filter(function (o) { return o.key === ACC_PAY_SHEET && Array.isArray(o.data); }).sort(byRow).map(function (o) { return o.data; })); } catch (eP) { Logger.log('accrestore cp: ' + eP.message); }
    try { var AS = _glApSheets_(); ['pay', 'item'].forEach(function (t) { extApp(AS[t].sh, AS[t].W, ext.filter(function (o) { return o.key === AS[t].name && Array.isArray(o.data); }).sort(byRow).map(function (o) { return o.data; })); }); } catch (eA) { Logger.log('accrestore ap: ' + eA.message); }
    var metaRows = ext.filter(function (o) { return o.key === 'HB:البيانات المحاسبية للدفعات' && Array.isArray(o.data); }).map(function (o) { return o.data; });
    if (metaRows.length) {
      try { var hbId = _glSettings_().hb_ss_id, mSh = hbId ? SpreadsheetApp.openById(hbId).getSheetByName('البيانات المحاسبية للدفعات') : null; if (mSh) extApp(mSh, 6, metaRows); } catch (eMe) { Logger.log('accrestore hb meta: ' + eMe.message); }
    }
    // 5) إلغاء التقاعد وعلامات «الطرف محذوف»
    var AD = JSON.parse(JSON.stringify(_glAccDeleted_()));
    delete AD.codes[code];
    Object.keys(AD.tomb).forEach(function (k) { if (AD.tomb[k] && AD.tomb[k].d === delId) delete AD.tomb[k]; });
    _glSetSetting_('acc_deleted', JSON.stringify(AD)); _GL_ACCDEL_MEMO_ = null;
    // 6) الحالة + الكاش + المرايا + السجل
    var now = _glNow_();
    _glSheet_('deleted').getRange(D.hdrRow, 3).setValue('مُستعاد ' + now + ' — ' + user);
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; _GL_DEFCUR_MEMO_ = null; _GL_HB_MEMO_ = null; _glSetDrop_();
    try { CacheService.getScriptCache().removeAll(['gll_accs', 'gll_accs2', 'gll_ents']); } catch (eCa) {}
    try { if (extN) { _vzClearCache_(); CacheService.getScriptCache().remove(GL_AP_IDX_KEY_); } } catch (eV) {}
    if (sum.refs && sum.refs.custsheet) { try { _glCsEnsureTrigger_(); } catch (eT) {} }
    _glTouch_('accounts'); _glTouch_('entries'); _glTouch_('lines');
    var hbBy = ''; try { hbBy = _glHbStaffName_(user); } catch (eN) {}
    entRows.forEach(function (o) { try { _glMirQ_(_glStr_(o.data[0]), { notify: false, by: hbBy }); } catch (eQ) {} });
    var txt = entRows.length + ' قيداً (' + lineRows.length + ' سطراً)' + (moveFix.length ? ' · أُعيد ' + moveFix.length + ' سطراً افتتاحياً لحسابه' : '') + (vdOwn.length ? ' · أُزيلت ' + vdOwn.length + ' قاعدة إلغاء' : '');
    logChange_(user, 'استعادة حساب محذوف مع قيوده', 'GL:' + code, _glStr_(sum.name), delId, txt);
    var restored = []; entRows.concat(lineRows).forEach(function (o) { restored.push(o.data); });
    var delta = {}; try { delta = _glLineDelta_(lineRows.map(function (o) { return o.data; }), 1, {}); moveFix.forEach(function (m) { _glLineDelta_([lRows[m.i]], -1, delta); _glLineDelta_([m.row], 1, delta); }); } catch (eD) {}
    plan.success = true; plan.dry = false; plan.ok = true; plan.ext = extN; plan.balancesDelta = delta;
    return plan;
  } finally { _glUnlock_(lock); }
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
  var session = _glPerm_(authToken, 'edit', 'coa');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    return _glMoveAccountCore_(code, newParent, session.username);
  } finally { _glUnlock_(lock); }
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
  if (nSet) _glSetDrop_();
  // 4) خريطة الحجوزات ومراجعة الدفعات
  var fix = function (key, col) {
    var sh = _glSheet_(key), rows = _glRows_(key), n = 0;
    rows.forEach(function (r, i) { var v = _glStr_(r[col]); if (map[v]) { sh.getRange(i + 2, col + 1).setNumberFormat('@').setValue(map[v]); n++; } });
    return n;
  };
  var nHb = fix('hbmap', 2) + fix('hbpay', 1);
  try { fix('autoovr', 3); fix('autoovr', 4); } catch (eOv) {}   // ✍️ (V4.319) قواعد التعديل اليدوي للقيود التلقائية تتبع الكود الجديد
  try { _glCatRecode_(map); } catch (eCat) {}   // 🍽️ (V4.323) أكواد حسابات اتفاقيات الإعاشة (المورد/العميل-الرحلة) تتبع الكود الجديد
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
  try { CacheService.getScriptCache().removeAll(['gll_accs', 'gll_accs2', 'gll_ents']); } catch (eC) {}
  logChange_(user, 'نقل حساب بالدليل', 'GL:' + newCode, acc.name, code + ' (تحت ' + acc.parent + ')', newCode + ' (تحت ' + newParent + ' — ' + np.name + ')');
  return { success: true, code: newCode, map: map, lines: nLines, settings: nSet, hb: nHb, meta: nMeta, hashes: nHash };
}

/* 🔀 (V4.223) دمج حسابين: كل قيود الحساب «المدموج» تنتقل للحساب «الباقي» ثم يُحذف المدموج (للمدير).
   مثال: «بنك مصر ايجيبشيان» + «بنك مصر ايجيبشيان بالجنيه»، أو حساب رحلة تلقائي + حساب لنفس الرحلة فُتح يدوياً.
   يُنقل معه: ربطه بشاشات البرنامج (فلا يُعاد فتحه بالمزامنة)، وإعدادات القيود التلقائية، وخريطة الحجوزات، وتوجيه الدفعات،
   وشيت العهدة — وتُحدَّث بصمات القيود التلقائية فلا تظهر كتغيير. dry=true معاينة. */
function glMergeAccounts(authToken, from, to, dry) {
  var session = _glAdminPerm_(authToken);
  var lock = _glLock_(); lock.waitLock(60000);
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
    _glSetDrop_();
    var fix = function (key, col) { try { var sh = _glSheet_(key); _glRows_(key).forEach(function (r, i) { if (_glStr_(r[col]) === from) sh.getRange(i + 2, col + 1).setNumberFormat('@').setValue(to); }); } catch (e) {} };
    fix('hbmap', 2); fix('hbpay', 1); fix('cpdir', 1); fix('autoovr', 3); fix('autoovr', 4);   // (V4.319) قواعد التعديل اليدوي للقيود التلقائية
    try { var catM = {}; catM[from] = to; _glCatRecode_(catM); } catch (eCat) {}   // 🍽️ (V4.323) اتفاقيات الإعاشة تتبع الحساب المدموج فيه
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
    try { CacheService.getScriptCache().removeAll(['gll_accs', 'gll_accs2', 'gll_ents']); } catch (eC) {}
    logChange_(session.username, 'دمج حساب في حساب', 'GL:' + to, 'دليل الحسابات', from + ' — ' + A.name + ' (' + n + ' سطر)', to + ' — ' + B.name);
    info.dry = false; return info;
  } finally { _glUnlock_(lock); }
}
// ربط تلقائي: حساب لكل عميل (تحت 1201) ولكل وكيل سعودي (تحت 2101) لا يوجد له حساب بعد
function glSyncParties(authToken) {
  var session = _glAdminPerm_(authToken);
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null;
    var accs = _glAccounts_().list, linked = {};
    accs.forEach(function (a) { if (a.link) linked[a.kind + '|' + _glNorm_(a.link)] = 1; });
    var _ad = _glAccDeleted_(); Object.keys(_ad.tomb).forEach(function (k) { linked[k] = 1; });   // 🗂️ (V4.324) طرف حُذف حسابه من الدليل لا يُفتح له حساب تلقائياً
    var clients = [], agents = {};
    try { getClientsDirectory(authToken).forEach(function (c) { if (c.name) clients.push(c.name); }); } catch (e) {}
    try { _vzReadAll_().forEach(function (f) { if (_glStr_(f.agent)) agents[_glStr_(f.agent)] = 1; }); } catch (e) {}
    try { _vzReadPrices_().forEach(function (p) { if (_glStr_(p.agent)) agents[_glStr_(p.agent)] = 1; }); } catch (e) {}
    var rows = [], made = { clients: 0, agents: 0 };
    var nextCodes = {};
    var nextOf = function (parent) {
      if (nextCodes[parent] === undefined) {
        var max = 0; accs.forEach(function (a) { if (a.parent === parent && a.code.length === parent.length + 3) { var n = parseInt(a.code.slice(parent.length), 10); if (n > max) max = n; } });
        Object.keys(_ad.codes).forEach(function (c) { if (c.indexOf(parent) === 0 && c.length === parent.length + 3) { var n = parseInt(c.slice(parent.length), 10); if (n > max) max = n; } });   // 🗂️ (V4.324) لا إعادة لكود محذوف
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
  } finally { _glUnlock_(lock); }
}

/* ---------------------------- القيود ---------------------------- */
/* 🔢 (V4.353) حجز أرقام القيود — الحل الجذري لتكرار رقم القيد (قيدان تلقائيان مختلفان بنفس الرقم فتندمج أسطرهما)
   كان العدّاد يُقرأ من ذاكرة/كاش الإعدادات (_glSettings_) ⇒ المزامنة اللحظية تبني خارج القفل فتملأ الذاكرة، وفي الأثناء تنشئ
   عملية أخرى قيوداً وتزيد العدّاد، ثم تحجز المزامنة الأرقام من القيمة القديمة ⇒ نفس الرقم لقيدين.
   الآن: قفل مستقل «seq» + قراءة العدّاد مباشرة من الشيت + لا يقل أبداً عن أكبر رقم قيد موجود فعلاً */
function _glNextEntrySeq_(n) {
  n = Math.max(1, parseInt(n, 10) || 1);
  var lk = _glNamedLock_('seq'); lk.waitLock(60000);
  try {
    var sh = _glSheetR_('settings'), last = sh.getLastRow(), row = 0, cur = 0;
    if (last >= 2) {
      var v = sh.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < v.length; i++) if (_glStr_(v[i][0]) === 'seq_entry') { row = i + 2; cur = parseInt(_glStr_(v[i][1]), 10) || 0; break; }
    }
    cur = Math.max(cur, _glMaxEntrySeq_());
    var nv = String(cur + n);
    if (row) sh.getRange(row, 2).setNumberFormat('@').setValue(nv);
    else { sh.appendRow(['seq_entry', nv]); try { sh.getRange(sh.getLastRow(), 2).setNumberFormat('@'); } catch (e0) {} }
    try { SpreadsheetApp.flush(); } catch (e1) {}
    _glSetDrop_();
    return cur + 1;
  } finally { lk.releaseLock(); }
}
// أكبر رقم قيد مستخدم فعلاً (عمود التسلسل + الرقم داخل JE-xxxxxx) — قراءة مباشرة من الشيت (لا كاش)
function _glMaxEntrySeq_() {
  var sh = _glSheetR_('entries'), last = sh.getLastRow(), mx = 0;
  if (last < 2) return 0;
  sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
    var s = parseInt(_glStr_(r[1]), 10) || 0, m = /^JE-(\d+)$/.exec(_glStr_(r[0]));
    if (s > mx) mx = s;
    if (m && +m[1] > mx) mx = +m[1];
  });
  return mx;
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
// ⚡ (V4.237) بحث بمحرك الشيت (TextFinder) عن صفوف قيد بعينه بدل قراءة الشيت كاملاً (آلاف السطور) — يقرأ صفوفه فقط.
// يُرجع null لو البحث غير متاح (فيُستخدم المسح الكامل القديم)
function _glFindRows_(key, id) {
  id = _glStr_(id); if (!id) return [];
  var sh = _glSheetR_(key), last = sh.getLastRow(); if (last < 2) return [];
  var col = sh.getRange(2, 1, last - 1, 1);
  if (typeof col.createTextFinder !== 'function') return null;
  var nums; try { nums = col.createTextFinder(id).matchEntireCell(true).matchCase(true).findAll().map(function (h) { return h.getRow(); }); } catch (e) { return null; }
  nums.sort(function (a, b) { return a - b; });
  var W = GL_SHEETS_[key].headers.length, out = [];
  for (var i = 0; i < nums.length;) {
    var j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    sh.getRange(nums[i], 1, j - i + 1, W).getValues().forEach(function (v, k) { if (_glStr_(v[0]) === id) out.push({ row: nums[i] + k, r: v }); });
    i = j + 1;
  }
  return out;
}
function _glRowBlocks_(rows) {   // أرقام صفوف ⇒ كتل متصلة [بداية، عدد] من الأسفل للأعلى (للحذف)
  var n = rows.map(function (x) { return x.row; }).sort(function (a, b) { return a - b; }), out = [];
  for (var i = 0; i < n.length;) { var j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; out.push([n[i], j - i + 1]); i = j + 1; }
  return out.reverse();
}
function _glDeleteLinesOf_(ids) {
  if (ids.length === 1) {
    var hit = _glFindRows_('lines', ids[0]);
    if (hit && hit.length) { var sh1 = _glSheet_('lines'); _glRowBlocks_(hit).forEach(function (b) { sh1.deleteRows(b[0], b[1]); }); return; }
  }
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
  if (ids.length === 1) {
    var hit = _glFindRows_('lines', ids[0]);
    if (hit && hit.length) { var sh1 = _glSheet_('lines'); _glRowBlocks_(hit).forEach(function (b) { var v = []; for (var k = 0; k < b[1]; k++) v.push([status]); sh1.getRange(b[0], 4, b[1], 1).setValues(v); }); return; }
  }
  var set = {}; ids.forEach(function (id) { set[id] = 1; });
  var sh = _glSheet_('lines'), last = sh.getLastRow(); if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, 4).getValues();
  var changed = false;
  vals.forEach(function (r) { if (set[_glStr_(r[0])]) { r[3] = status; changed = true; } });
  if (changed) sh.getRange(2, 4, vals.length, 1).setValues(vals.map(function (r) { return [r[3]]; }));
}
function _glFindEntry_(id) {
  var hit = _glFindRows_('entries', id);
  if (hit && hit.length) return { row: hit[0].row, r: hit[0].r };
  var rows = _glRows_('entries');
  for (var i = 0; i < rows.length; i++) if (_glStr_(rows[i][0]) === id) return { row: i + 2, r: rows[i] };
  return null;
}
// ⚡ (V4.232) تحديث محلي بلا إعادة تحميل كامل: دوال الحفظ/الإلغاء/الحذف تُرجع «دلتا أرصدة» محسوبة من
// سطور القيد نفسه (المرحّلة فقط) بدل مسح كل السطور (_glBalances_) وإعادة جلب الحسابات مع كل حفظ.
function _glLinesOf_(id) {
  id = _glStr_(id);
  var hit = _glFindRows_('lines', id); if (hit && hit.length) return hit.map(function (x) { return x.r; });
  return _glRows_('lines').filter(function (r) { return _glStr_(r[0]) === id; });
}
function _glLineDelta_(rows, sign, out) {
  out = out || {};
  (rows || []).forEach(function (l) {
    if (_glStr_(l[3]) !== GL_ST_POSTED_) return;   // الأرصدة تجمع المرحّل فقط (نفس مرشّح _glBalances_)
    var code = _glStr_(l[4]); if (!code) return;
    var cur = _glCur_(l[7]), o = (out[code] = out[code] || { EGP: 0, SAR: 0, USD: 0, base: 0 });
    o[cur] = _glR2_(o[cur] + sign * (_glNum_(l[5]) - _glNum_(l[6])));
    o.base = _glR2_(o.base + sign * (_glNum_(l[9]) - _glNum_(l[10])));
  });
  return out;
}
function _glRowToListEntry_(eRow, lRows) {   // صف بشكل glListEntries من صفوف بالذاكرة (بلا إعادة قراءة)
  var e = _glEntryObj_(eRow);
  e.lines = (lRows || []).map(_glLineObj_).sort(function (a, b) { return a.lineNo - b.lineNo; });
  e._k = _glDKey_(e.date);
  return e;
}
function _glListEntryRow_(id) {   // صف بشكل glListEntries بقراءة السطور الحالية (بعد كتابتها)
  var f = _glFindEntry_(id); if (!f) return null;
  return _glRowToListEntry_(f.r, _glLinesOf_(id));
}
function glSaveEntry(authToken, e, post) {
  e = e || {};
  var isEdit = !!_glStr_(e.id);
  var session = _glPerm_(authToken, isEdit ? 'edit' : 'add', function () { return _glSubOfType_(e.type); });   // (V4.276) صلاحية نوع السند/القيد
  var lock = _glLock_(); lock.waitLock(30000);
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
      if (isAuto && !_glCanEditAuto_(session)) throw new Error('تعديل القيود التلقائية يحتاج صلاحية تعديل «القيود التلقائية والاعتماد» أو صلاحية الاعتماد');
      if (_glStr_(f.r[3]) === 'قيد إقفال') throw new Error('قيد إقفال السنة لا يُعدَّل يدوياً');
      if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
      if (oldSt === GL_ST_POSTED_) status = GL_ST_POSTED_;
      var _mc2 = (oldSt === GL_ST_DRAFT_ && post && /^SCR:/.test(_glStr_(f.r[9])) && typeof _ledgerPostCheck_ === 'function') ? _ledgerPostCheck_(_glStr_(f.r[0]), session) : null;   // 🏛️ (V4.349) Maker-Checker
      if (isAuto) v.type = _glStr_(f.r[3]) || v.type;
      var _oldLines = (oldSt === GL_ST_POSTED_) ? _glLinesOf_(_glStr_(f.r[0])) : [];   // ⚡ (V4.232) للدلتا — قبل الحذف
      var _curL = _glLinesOf_(_glStr_(f.r[0])), _audB = (typeof _audSnapRows_ === 'function') ? _audSnapRows_(f.r, _curL) : null;
      // 🔐 (V4.346) تعديل متزامن: القيد تغيّر بعد فتحه بنافذة هذا المستخدم ⇒ رفض بدل مسح تعديل الآخر بصمت
      if (_glStr_(e.baseVer) && typeof _glEntryVer_ === 'function' && _glStr_(e.baseVer) !== _glEntryVer_(f.r, _curL))
        throw new Error('⚠️ عدّل مستخدم آخر هذا القيد بعد فتحك له' + (_glStr_(f.r[16]) ? ' (' + _glStr_(f.r[16]) + (_glStr_(f.r[17]) ? ' — ' + _glStr_(f.r[17]) : '') + ')' : '') + ' — أغلق النافذة وافتح القيد من جديد لترى التعديل ثم أعد تعديلك');
      (typeof _snapEntryTake_ === 'function') && _snapEntryTake_(_glStr_(f.r[0]), f.r, _curL, oldSt === GL_ST_POSTED_ ? 'قبل تعديل قيد مرحّل' : 'قبل تعديل قيد', session.username);   // ⏪ (V4.346) نسخة قابلة للاستعادة   // 🛡️ (V4.345) حالة القيد قبل التعديل — للسجل المحصّن
      var sk = _glStr_(f.r[6]);
      if (GL_VCH_PREFIX_[v.type] && !sk) sk = 'VCH:' + _glNextVoucherNo_(v.type);   // سند قديم بلا رقم ⇒ يأخذ رقماً
      // ✅ (V4.323) الحفظ اليدوي = اعتماد القيد كما حُفظ: لو للقيد تغيير مصدر معلَّق بقائمة «⏳ تغييرات تنتظر الاعتماد» تُعتمد بصمة
      // المصدر الحالية كما هي (فلا يُقترح القيد من جديد إلا لو تغيّر مصدره بعد هذا الحفظ)، وبند «💱 تحويل عملة» للقيد يُزال —
      // كان البند لقطة ثابتة لا تُمسح بالحفظ فيظهر القيد بالاعتمادات «بعد تحويله» رغم حفظه يدوياً بلا تحويل
      // 🛡️ (V4.323 مراجعة) الاعتماد بالحفظ صريح فقط: نافذة القيد تعرض التغيير المعلَّق وتُرسل بصمته (pendAck) وبند العملة (ccyAck)
      // بعد موافقة المستخدم — فلا يمتص التعديلُ الجماعي (بيان/رحلة/حساب مقابل) ولا نافذةٌ فُتحت قبل وصول التغيير تغييراً لم يره أحد
      var _pend = _glPendingRows_(), _pa = (isAuto && _pend[sk] && _glStr_(e.pendAck) && _glStr_(e.pendAck) === _glStr_(_pend[sk].row[7])) ? _pend[sk] : null;
      var _pStale = !!(isAuto && _pend[sk] && !_pa && _glStr_(e.pendAck));
      var _accH = (_pa && _glStr_(_pa.row[2]) === 'تعديل') ? _glStr_(_pa.row[7]).replace(/\|ovr-fail$/, '') : '';
      // ✍️ (V4.319) التعديل يُحفظ كقاعدة دائمة فلا تمسحه المزامنة · بصمة المصدر بالمرجع تبقى كما هي (التلقائي وقيود الشيتات CUST)
      var w = _glWriteEntry_(v, { id: f.r[0], seq: f.r[1], status: status, sourceKey: sk, batchId: f.r[7], desc: e.desc, ref: (isAuto || /^CUST:/.test(sk)) ? (_accH || f.r[9]) : e.ref, trip: e.trip, company: e.company,
        createdBy: f.r[12], createdAt: f.r[13], row: f.row }, session.username);

      eSh.getRange(f.row, 1, 1, w.eRow.length).setValues([w.eRow]);
      _glDeleteLinesOf_([_glStr_(f.r[0])]);
      lSh.getRange(lSh.getLastRow() + 1, 1, w.lRows.length, w.lRows[0].length).setValues(w.lRows);
      if (isAuto) _glOvrRecord_(sk, f, _oldLines, v, e, session.username);   // بعد نجاح الكتابة فقط
      else if (/^CUST:/.test(sk)) _glCsOvrRecord_(sk, _glStr_(f.r[0]), _oldLines, w.lRows, session.username);
      var _pDrop = []; if (e.ccyAck && _pend['CCY:' + _glStr_(f.r[0])]) _pDrop.push('CCY:' + _glStr_(f.r[0])); if (_pa) _pDrop.push(sk);
      if (_pDrop.length) _glPendingDrop_(_pDrop);
      if (_mc2) _ledgerMark_(_mc2.row, LEDGER_OK_, session.username, _mc2.self ? 'اعتماد ذاتي (مدير)' : 'رُحِّل من الحسابات العامة');
      if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(session.username, _glStr_(f.r[0]), _audB, _audSnapRows_(w.eRow, w.lRows), oldSt === GL_ST_POSTED_ ? 'تعديل قيد مرحّل' : 'تعديل قيد');
      if (_pa && _glStr_(_pa.row[2]) === 'إلغاء') _glOvrKeep_(sk, session.username);   // حُذف مصدره وحفظه المستخدم ⇒ يبقى القيد كما حُفظ
      logChange_(session.username, oldSt === GL_ST_POSTED_ ? 'تعديل قيد مرحّل' : (post ? 'تعديل وترحيل قيد' : 'تعديل قيد مسودة'), 'GL:' + f.r[0], 'القيد',
        _glStr_(f.r[4]) + ' — ' + _glNum_(f.r[8]) + ' ج', v.type + ' — ' + _glStr_(e.desc) + ' — ' + v.totalBase + ' ج');
      _glSyncVoucherPays_(_glStr_(f.r[0]), session.username, { eRow: w.eRow, lRows: w.lRows });   // (V4.222) إيصال على حساب عميل ⇒ دفعة بحسابات العملاء
      var _delta = {}; _glLineDelta_(_oldLines, -1, _delta); if (status === GL_ST_POSTED_) _glLineDelta_(w.lRows, 1, _delta);
      if (status === GL_ST_POSTED_) _glBotQ_(oldSt === GL_ST_POSTED_ ? 'entry_edit' : 'vch_new', _glBotWho_(_glBotEntryInfo_(_glStr_(f.r[0]), w.eRow, w.lRows), session));   // 📲 (V4.254)
      var _due = e.due !== undefined ? _glDueSet_(_glStr_(f.r[0]), e.due, v.date, session.username) : undefined, _sr = _glRowToListEntry_(w.eRow, w.lRows);
      if (_due !== undefined) _sr.due = _due;
      return { success: true, id: _glStr_(f.r[0]), status: status, voucherNo: (sk.match(/^VCH:(.+)$/) || [])[1] || '', due: _due, approved: _pa ? _glStr_(_pa.row[2]) : '', pendStale: _pStale,
        balancesDelta: _delta, pendingCount: _glCpPending_(), savedRow: _sr, hbMirror: _GL_HB_MIRROR_LAST_, mirQ: _GL_MIRQ_N_ };
    }
    var seq = _glNextEntrySeq_(1), id = _glEntryId_(seq);
    var vno = (GL_VCH_PREFIX_[v.type] && !_glStr_(e.sourceKey)) ? _glNextVoucherNo_(v.type) : '';
    var w2 = _glWriteEntry_(v, { id: id, seq: seq, status: status, sourceKey: vno ? 'VCH:' + vno : e.sourceKey, desc: e.desc, ref: e.ref, trip: e.trip, company: e.company }, session.username);
    eSh.getRange(eSh.getLastRow() + 1, 1, 1, w2.eRow.length).setValues([w2.eRow]);
    lSh.getRange(lSh.getLastRow() + 1, 1, w2.lRows.length, w2.lRows[0].length).setValues(w2.lRows);
    if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(session.username, id, null, _audSnapRows_(w2.eRow, w2.lRows), post ? 'تسجيل وترحيل قيد' : 'تسجيل قيد مسودة');
    logChange_(session.username, post ? 'تسجيل وترحيل قيد' : 'تسجيل قيد مسودة', 'GL:' + id, 'القيد', '-', (vno ? vno + ' — ' : '') + v.type + ' — ' + _glStr_(e.desc) + ' — ' + v.totalBase + ' ج');
    _GL_HB_MIRROR_LAST_ = null;
    if (status === GL_ST_POSTED_) _glSyncVoucherPays_(id, session.username, { eRow: w2.eRow, lRows: w2.lRows });
    var _delta2 = {}; if (status === GL_ST_POSTED_) _glLineDelta_(w2.lRows, 1, _delta2);
    if (status === GL_ST_POSTED_) _glBotQ_('vch_new', _glBotWho_(_glBotEntryInfo_(id, w2.eRow, w2.lRows), session));   // 📲 (V4.254)
    var _due2 = e.due !== undefined ? _glDueSet_(id, e.due, v.date, session.username) : undefined, _sr2 = _glRowToListEntry_(w2.eRow, w2.lRows);
    if (_due2 !== undefined) _sr2.due = _due2;
    return { success: true, id: id, status: status, voucherNo: vno, due: _due2,
      balancesDelta: _delta2, pendingCount: _glCpPending_(), savedRow: _sr2, hbMirror: _GL_HB_MIRROR_LAST_, mirQ: _GL_MIRQ_N_ };
  } finally { _glUnlock_(lock); }
}
/* ✏️ (V4.314) تعديل جماعي لعدة قيود دفعة واحدة — نفس فلسفة saveVisaFilesBulk/saveMinistryFilesBulk: تستدعي
   glSaveEntry الحقيقية لكل قيد، فتحصل على كل حراسات السلامة المحاسبية بالضبط (قيد ملغى/تلقائي بلا صلاحية
   مدير/قيد إقفال/فترة مقفلة) بلا أي تخطٍّ أو إعادة تنفيذ لها — فشل قيد واحد بهذه الحراسات يُقرَّر له وحده
   ولا يوقف حفظ الباقي. حقول رأس القيد الآمنة فقط (لا تلمس lines[] ولا المبالغ إطلاقاً، تفادياً لمخاطر
   سلامة التوازن المحاسبي ببطاقة مصغَّرة): البيان، المرجع، الرحلة، الشركة. (لا تاريخ استحقاق هنا عمداً —
   glListEntries لا يُرجعه أصلاً فالبطاقة ستُظهره فارغاً دوماً، وحفظ قيمة فارغة كان سيمحو أي تاريخ استحقاق
   مسجَّل سابقاً صامتاً؛ تعديله يبقى من نافذة القيد المنفردة التي تقرأه فعلاً أولاً)
   items: [{id, desc?, ref?, trip?, company?, lines?:[{lineNo, account}]}]
   ✏️ (V4.315) lines: تغيير «الحساب المقابل» فقط — حساب السطر المحدَّد برقمه، والمبالغ والعملات كما هي تماماً.
   السطر الذي تغيّر حسابه يُفرَّغ عميله/وكيله المشتقَّين ليُعاد اشتقاقهما من الحساب الجديد (_glValidate_ يُبقي القيمة
   القديمة لو مُرِّرت). سطر بعملة أجنبية يُمرَّر بسعره الفعلي المحفوظ (المعادل ÷ المبلغ، exact) — وإلا أعاد _glValidate_
   حساب المعادل بالسعر المقرَّب لخانتين فيتغيّر معادل قيد لم يُلمَس مبلغه (قيود التحويل/الحجوزات المحفوظة بمعادل دقيق) */
function glSaveEntriesBulk(authToken, items) {
  var results = [], okN = 0;
  var editable = ['desc', 'ref', 'trip', 'company'];
  (items || []).forEach(function (it) {
    var id = _glStr_(it && it.id); if (!id) return;
    try {
      var old = _glEntryFull_(id);
      if (!old) throw new Error('القيد غير موجود');
      var _sysRef = /^(AUTO|CUST):/.test(_glStr_(old.sourceKey));   // ✍️ (V4.319) التلقائي قابل للتعديل الآن · مرجعه بصمة مصدر لا تُكتب يدوياً
      var chg = {}, from = {}, changed = false;
      (it.lines || []).forEach(function (x) { var n = +(x && x.lineNo), c = _glStr_(x && x.account); if (n && c) { chg[n] = c; from[n] = _glStr_(x.from); } });
      // 🛡️ البطاقة قد تكون قديمة (القيد عُدِّل/أُعيد ترقيم أسطره منذ فتحها) — رقم السطر وحده قد يشير الآن لسطر آخر
      // (مثلاً سطر الخزينة)، فيُشترط أن يكون حساب السطر الحالي هو نفسه الذي رآه المستخدم
      Object.keys(chg).forEach(function (n) {
        var cur = old.lines.filter(function (l) { return +l.lineNo === +n; })[0];
        if (!cur || (from[n] && cur.account !== from[n])) throw new Error('القيد تغيّر منذ فتح البطاقة — أعد تحميل الشاشة ثم أعد المحاولة');
      });
      var lines = old.lines.map(function (l) {
        var o = { account: l.account, debit: l.debit, credit: l.credit, currency: l.currency, rate: l.rate,
          trip: l.trip, company: l.company, client: l.client, agent: l.agent, desc: l.desc };
        var amt = _glNum_(l.debit) + _glNum_(l.credit), bAmt = _glNum_(l.bDebit) + _glNum_(l.bCredit);
        if (l.currency !== 'EGP' && amt && bAmt) { o.rate = bAmt / amt; o.exact = 1; }
        if (chg[l.lineNo] && chg[l.lineNo] !== l.account) { o.account = chg[l.lineNo]; o.client = ''; o.agent = ''; changed = true; }
        return o;
      });
      var e = { id: id, date: old.date, type: old.type, desc: old.desc, ref: old.ref, trip: old.trip, company: old.company, lines: lines };
      editable.forEach(function (k) { if (k === 'ref' && _sysRef) return; if (it[k] !== undefined && _glStr_(it[k]) !== _glStr_(old[k])) { e[k] = it[k]; changed = true; } });
      if (!changed) { okN++; results.push({ id: id, success: true, unchanged: true }); return; }
      var r = glSaveEntry(authToken, e, old.status === GL_ST_POSTED_);
      okN++; results.push({ id: id, success: true, result: r });
    } catch (eErr) { results.push({ id: id, success: false, error: eErr.message }); }
  });
  // ⚡ نسخ كشف الحجوزات مؤجَّل لطابور خارج القفل — glRun يُفرغه فقط لو رجع mirQ بالمستوى الأعلى
  return { success: true, done: okN, total: (items || []).length, results: results, mirQ: _GL_MIRQ_N_ };
}
/* 🏁 (V4.324) رصيد أول المدة لحساب واحد (قديم أو جديد): أسطر القيود الافتتاحية الحالية لهذا الحساب — اليدوية/المستوردة (تُعدَّل
   من نافذة القيد) والتلقائية من شاشات البرنامج (AUTO:OPEN / AUTO:HBOPEN — تُصحَّح من مصدرها أو بقيد افتتاحي إضافي) — لنافذة
   «🏁 رصيد أول المدة» التي تسجّل قيداً افتتاحياً بتاريخ بداية الحسابات مقابل «34 فروق أرصدة افتتاحية» (أو أي حساب يختاره المستخدم) */
function glOpeningInfo(authToken, code) {
  _glPerm_(authToken, 'view');
  code = _glStr_(code);
  var a = _glAccounts_().map[code]; if (!a || a.isGroup) throw new Error('اختر حساباً فرعياً');
  var set = _glSettings_(), ents = {}, out = [];
  _glRows_('entries').forEach(function (r) { if (_glStr_(r[3]) === 'قيد افتتاحي' && _glStr_(r[5]) !== GL_ST_VOID_) ents[_glStr_(r[0])] = r; });
  _glRows_('lines').forEach(function (l) {
    var r = ents[_glStr_(l[0])]; if (!r || _glStr_(l[4]) !== code) return;
    out.push({ id: _glStr_(r[0]), date: _glDate_(r[2]), status: _glStr_(r[5]), auto: /^AUTO:/.test(_glStr_(r[6])), sk: _glStr_(r[6]), desc: _glCleanDesc_(_glStr_(l[15]) || _glStr_(r[4])),
      debit: _glNum_(l[5]), credit: _glNum_(l[6]), cur: _glCur_(l[7]), rate: _glNum_(l[8]) || 1, base: _glR2_(_glNum_(l[9]) - _glNum_(l[10])) });
  });
  return { success: true, account: { code: a.code, name: a.name, kind: a.kind || '', currency: a.currency || '' }, startDate: set.startDate, lockDate: set.lockDate || '',
    diffAcc: GL_ACC_OPEN_DIFF_, lines: out };
}
// 📥 (V4.315) قراءة عدة قيود كاملة (بسطورها) بنداء واحد — لبطاقات تعديل الحساب المقابل من كشف الحساب/الخزن/البنوك/العهد
function glGetEntriesBulk(authToken, ids) {
  _glPerm_(authToken, 'view');
  var out = [];
  (ids || []).forEach(function (id) { var e = _glEntryFull_(_glStr_(id)); if (e) out.push(e); });
  return { success: true, entries: out };
}
function glPostEntry(authToken, id) {
  var session = _glPerm_(authToken, 'edit', function () { var f0 = _glFindEntry_(_glStr_(id)); return f0 ? _glSubOfType_(f0.r[3]) : 'je'; });   // (V4.276)
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var f = _glFindEntry_(_glStr_(id)); if (!f) throw new Error('القيد غير موجود');
    if (_glStr_(f.r[5]) !== GL_ST_DRAFT_) throw new Error('القيد ليس مسودة');
    var _mc = (/^SCR:/.test(_glStr_(f.r[9])) && typeof _ledgerPostCheck_ === 'function') ? _ledgerPostCheck_(_glStr_(id), session) : null;   // 🏛️ (V4.349) Maker-Checker
    // إعادة الفحص قبل الترحيل (ربما تغيّر الحساب أو أُوقف)
    var ent = _glEntryFull_(_glStr_(id));
    _glValidate_(ent);
    _glSheet_('entries').getRange(f.row, 6).setValue(GL_ST_POSTED_);
    _glSheet_('entries').getRange(f.row, 15, 1, 2).setValues([[session.username, _glNow_()]]);
    _glSetLinesStatus_([_glStr_(id)], GL_ST_POSTED_);
    logChange_(session.username, 'ترحيل قيد', 'GL:' + id, 'الحالة', GL_ST_DRAFT_, GL_ST_POSTED_);
    if (_mc) _ledgerMark_(_mc.row, LEDGER_OK_, session.username, _mc.self ? 'اعتماد ذاتي (مدير)' : 'رُحِّل من الحسابات العامة');
    _glSyncVoucherPays_(_glStr_(id), session.username);
    try { var _pf = _glFindEntry_(_glStr_(id)); if (_pf) _glBotQ_('vch_new', _glBotWho_(_glBotEntryInfo_(_glStr_(id), _pf.r, _glLinesOf_(_glStr_(id))), session)); } catch (eB) {}   // 📲 (V4.254)
    return { success: true, id: _glStr_(id), balancesDelta: _glLineDelta_(_glLinesOf_(_glStr_(id)), 1, {}),
      pendingCount: _glCpPending_(), savedRow: _glListEntryRow_(_glStr_(id)), hbMirror: _GL_HB_MIRROR_LAST_, mirQ: _GL_MIRQ_N_ };   // ⚡ (V4.232) دلتا محلية
  } finally { _glUnlock_(lock); }
}
// wantDelta: (V4.232) تُرجع دلتا الأرصدة للتحديث المحلي — يمرّرها نداء الواجهة فقط، لا حلقة glHbErpVoid الداخلية
function glVoidEntry(authToken, id, reason, wantDelta) {
  var session = _glPerm_(authToken, 'delete', function () { var f0 = _glFindEntry_(_glStr_(id)); return f0 ? _glSubOfType_(f0.r[3]) : 'je'; });   // (V4.276)
  reason = _glStr_(reason);
  if (!reason) throw new Error('سبب الإلغاء مطلوب');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var f = _glFindEntry_(_glStr_(id)); if (!f) throw new Error('القيد غير موجود');
    var st = _glStr_(f.r[5]);
    if (st === GL_ST_VOID_) throw new Error('القيد ملغى بالفعل');
    // ✍️ (V4.319) إلغاء القيد التلقائي يدوياً مسموح لصاحب صلاحية تعديل التلقائي — يُسجَّل كقاعدة فلا تعيد المزامنة ترحيله
    // (كانت المزامنة التالية تعيده مرحّلاً لأن مصدره ما زال موجوداً). «↺ إعادة للتلقائي» يلغي القاعدة فيعود
    var _autoK = /^AUTO:/.test(_glStr_(f.r[6])) ? _glStr_(f.r[6]) : '';
    if (_autoK && !_glCanEditAuto_(session)) throw new Error('إلغاء القيد التلقائي يحتاج صلاحية تعديل «القيود التلقائية والاعتماد» — أو عدّل/احذف مصدره بالشاشة');
    if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
    if (st === GL_ST_DRAFT_) {   // المسودة تُحذف نهائياً (لم تؤثر على أي رصيد)
      (typeof _snapEntryTake_ === 'function') && _snapEntryTake_(_glStr_(id), f.r, _glLinesOf_(_glStr_(id)), 'قبل حذف قيد مسودة', session.username);   // ⏪ (V4.346)
      if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(session.username, _glStr_(id), _audSnapRows_(f.r, _glLinesOf_(_glStr_(id))), null, 'حذف قيد مسودة');   // 🛡️ (V4.345)
      _glDeleteLinesOf_([_glStr_(id)]);
      _glSheet_('entries').deleteRow(f.row);
      logChange_(session.username, 'حذف قيد مسودة', 'GL:' + id, 'القيد', _glStr_(f.r[4]), '-');
      return { success: true, deleted: true, removedId: _glStr_(id), balancesDelta: {}, pendingCount: wantDelta ? _glCpPending_() : undefined };
    }
    var _voidLines = wantDelta ? _glLinesOf_(_glStr_(id)) : [];   // ⚡ (V4.232) قبل تغيير الحالة (مرحّلة) — وللتنبيه
    if (wantDelta) _glBotQ_('entry_void', _glBotWho_(Object.assign(_glBotEntryInfo_(_glStr_(id), f.r, _voidLines), { reason: reason }), session));   // 📲 (V4.254)
    (typeof _snapEntryTake_ === 'function') && _snapEntryTake_(_glStr_(id), f.r, _glLinesOf_(_glStr_(id)), 'قبل إلغاء قيد', session.username);   // ⏪ (V4.346)
    var sh = _glSheet_('entries');
    sh.getRange(f.row, 6).setValue(GL_ST_VOID_);
    sh.getRange(f.row, 17, 1, 3).setValues([[session.username, _glNow_(), reason]]);
    _glSetLinesStatus_([_glStr_(id)], GL_ST_VOID_);
    if (_autoK) { var _om = _glOvrMap_(); (_om[_autoK] = _om[_autoK] || { acc: [], hdr: null, freeze: null, vd: null }).vd = { by: session.username, at: _glNow_(), note: reason }; _glOvrSave_(_om); }
    _glPendingDrop_((_autoK ? [_autoK] : []).concat(['CCY:' + _glStr_(id)]));   // ✅ (V4.323) وبند «💱 تحويل عملة» للقيد الملغى أيضاً
    logChange_(session.username, 'إلغاء قيد مرحّل', 'GL:' + id, 'الحالة', GL_ST_POSTED_, GL_ST_VOID_ + ' — ' + reason);
    _glSyncVoucherPays_(_glStr_(id), session.username);
    if (!wantDelta) return { success: true };   // حلقة glHbErpVoid الداخلية — بلا دلتا
    return { success: true, id: _glStr_(id), balancesDelta: _glLineDelta_(_voidLines, -1, {}),
      pendingCount: _glCpPending_(), savedRow: _glListEntryRow_(_glStr_(id)), mirQ: _GL_MIRQ_N_ };
  } finally { _glUnlock_(lock); }
}
/* 🗑️ (V4.314) حذف/إلغاء جماعي لعدة قيود دفعة واحدة — تستدعي glVoidEntry الحقيقية لكل قيد (فتحصل بالضبط
   على نفس تمييزها بين المسودة التي تُحذف نهائياً والمرحّل الذي يُلغى بحالة «ملغى» مع سبب، ونفس حراسات
   السلامة: لا إلغاء لقيد تلقائي ولا لقيد بفترة مقفلة) — فشل قيد واحد بهذه الحراسات لا يوقف إلغاء الباقي.
   items: [{id, reason}] — reason مطلوب حتى للمسودة (يُستخدم 'حذف مسودة' تلقائياً من الواجهة لها) */
function glVoidEntriesBulk(authToken, items) {
  var results = [], okN = 0;
  (items || []).forEach(function (it) {
    var id = _glStr_(it && it.id); if (!id) return;
    try {
      var r = glVoidEntry(authToken, id, it && it.reason, true);
      okN++; results.push({ id: id, success: true, result: r });
    } catch (eErr) { results.push({ id: id, success: false, error: eErr.message }); }
  });
  return { success: true, done: okN, total: (items || []).length, results: results };
}
// 🗑️ (V4.217) حذف قيد نهائياً (للمدير): المسودة/المرحّل/الملغى اليدوي أو المستورد — لا القيود التلقائية (تُدار من
// مصدرها) ولا قيود الفترات المقفلة. السند المحذوف لا يُعاد استخدام رقمه.
function glDeleteEntry(authToken, id) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('الحذف النهائي للقيود للمدير فقط — يمكنك «إلغاء» القيد بدلاً من ذلك');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var f = _glFindEntry_(_glStr_(id)); if (!f) throw new Error('القيد غير موجود');
    // (V4.218) القيد التلقائي يُحذف أيضاً للمدير — لكنه يُعاد إنشاؤه في المزامنة التالية ما دام مصدره موجوداً بالشاشات
    if (_glStr_(f.r[3]) === 'قيد إقفال') throw new Error('قيد إقفال السنة يُلغى من «الإعدادات ← إعادة فتح السنة»');
    if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
    var _delLines = _glLinesOf_(_glStr_(id));   // ⚡ (V4.232) قبل الحذف — للدلتا (المرحّل فقط يؤثر)
    (typeof _snapEntryTake_ === 'function') && _snapEntryTake_(_glStr_(id), f.r, _delLines, 'قبل حذف قيد نهائياً', session.username);   // ⏪ (V4.346) يُستعاد من «القيود المحذوفة»
    if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(session.username, _glStr_(id), _audSnapRows_(f.r, _delLines), null, 'حذف قيد نهائياً');   // 🛡️ (V4.345) صورة كاملة قبل الحذف
    if (_glStr_(f.r[5]) === GL_ST_POSTED_) _glBotQ_('entry_void', _glBotWho_(Object.assign(_glBotEntryInfo_(_glStr_(id), f.r, _delLines), { deleted: true }), session));   // 📲 (V4.254)
    _glDeleteLinesOf_([_glStr_(id)]);
    _glSheet_('entries').deleteRow(f.row);
    try { _glPendingDrop_(['CCY:' + _glStr_(id)].concat(/^AUTO:/.test(_glStr_(f.r[6])) ? [_glStr_(f.r[6])] : [])); } catch (ePd) {}   // ✅ (V4.323) لا بنود اعتماد يتيمة لقيد محذوف
    _glSyncVoucherPays_(_glStr_(id), session.username);   // (V4.222) تُحذف الدفعة المقابلة بحسابات العملاء
    logChange_(session.username, 'حذف قيد نهائياً', 'GL:' + id, _glStr_(f.r[3]) + ' — ' + _glStr_(f.r[5]), _glStr_(f.r[4]) + ' — ' + _glNum_(f.r[8]) + ' ج', '-');
    return { success: true, deleted: true, removedId: _glStr_(id), balancesDelta: _glLineDelta_(_delLines, -1, {}), pendingCount: _glCpPending_(), mirQ: _GL_MIRQ_N_ };
  } finally { _glUnlock_(lock); }
}
/* 🗑️ (V4.333) الحذف المجمع النهائي للقيود — للمدير فقط (يُفحص بالخادم بحارس صارم، وزره لا يظهر لغيره بالواجهة).
   مثل glDeleteEntry لكن على دفعة واحدة بقفل واحد: يُتخطى قيد الإقفال والفترة المقفلة (مع بيان السبب)، تُحذف أسطر القيود وصفوفها
   بكتل متجاورة (لا حذف صف-صف)، وتُنظَّف نسخها المرتبطة (دفعات العملاء/الوكلاء/كشوف الفنادق) بنفس مسار الحذف المنفرد.
   القيود التلقائية تُحذف أيضاً كالحذف المنفرد لكنها تُعاد بالمزامنة ما دام مصدرها قائماً (يُبلَّغ عددها). حد 300 قيد للنداء. */
function glDeleteEntriesBulk(authToken, ids) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('الحذف المجمع النهائي للقيود للمدير فقط');
  var seen = {}; ids = (Array.isArray(ids) ? ids : []).map(_glStr_).filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; });
  if (!ids.length) throw new Error('اختر قيداً واحداً على الأقل');
  if (ids.length > 300) throw new Error('الحد الأقصى 300 قيد بالمرة الواحدة (المحدَّد ' + ids.length + ')');
  if (typeof _snapPreRisk_ === 'function') _snapPreRisk_('حذف مجمع لـ ' + ids.length + ' قيد', session.username);   // ⏪ (V4.346) نقطة استعادة فورية قبل العملية الخطرة
  var lock = _glLock_(); lock.waitLock(90000);
  try {
    var eRows = _glRows_('entries'), at = {}, skipped = [], del = [], autoN = 0;
    eRows.forEach(function (r, i) { var id = _glStr_(r[0]); if (id && seen[id] && at[id] === undefined) at[id] = i; });
    ids.forEach(function (id) {
      if (at[id] === undefined) { skipped.push({ id: id, reason: 'غير موجود (ربما حُذف)' }); return; }
      var r = eRows[at[id]];
      if (_glStr_(r[3]) === 'قيد إقفال') { skipped.push({ id: id, reason: 'قيد إقفال سنة — يُلغى من إعادة فتح السنة' }); return; }
      if (_glLocked_(r[2])) { skipped.push({ id: id, reason: 'في فترة مقفلة حتى ' + _glSettings_().lockDate }); return; }
      del.push(id); if (/^AUTO:/.test(_glStr_(r[6]))) autoN++;
    });
    if (!del.length) return { success: true, deleted: 0, skipped: skipped, autoN: 0 };
    var lAll = _glRows_('lines'), byE = {}, delta = {};
    var delSet = {}; del.forEach(function (id) { delSet[id] = 1; });
    lAll.forEach(function (l) { var id = _glStr_(l[0]); if (delSet[id]) (byE[id] = byE[id] || []).push(l); });
    var pendKeys = [], sums = [];
    del.forEach(function (id) {
      var r = eRows[at[id]], sk = _glStr_(r[6]);
      _glLineDelta_(byE[id] || [], -1, delta);
      pendKeys.push('CCY:' + id); if (/^AUTO:/.test(sk)) pendKeys.push(sk);
      sums.push(id + ' ' + _glStr_(r[3]) + ' ' + _glNum_(r[8]));
    });
    if (typeof _snapEntryTake_ === 'function') del.forEach(function (id) { _snapEntryTake_(id, eRows[at[id]], byE[id] || [], 'قبل حذف مجمع', session.username); });   // ⏪ (V4.346)
    if (typeof _audEntryDiff_ === 'function') del.forEach(function (id) { _audEntryDiff_(session.username, id, _audSnapRows_(eRows[at[id]], byE[id] || []), null, 'حذف مجمع نهائي للقيود'); });   // 🛡️ (V4.345)
    _glDeleteLinesOf_(del);                                              // أسطرها أولاً (فلا يبقى سطر بلا رأس يؤثر بالأرصدة)
    var sh = _glSheet_('entries'), fresh = _glRows_('entries'), rowsDel = [];
    fresh.forEach(function (r, i) { if (delSet[_glStr_(r[0])]) rowsDel.push({ row: i + 2 }); });
    _glRowBlocks_(rowsDel).forEach(function (b) { sh.deleteRows(b[0], b[1]); });
    try { _glPendingDrop_(pendKeys); } catch (ePd) {}
    del.forEach(function (id) { try { _glSyncVoucherPays_(id, session.username); } catch (eS) {} });   // نسخها بحسابات العملاء/الوكلاء/كشوف الفنادق
    logChange_(session.username, 'حذف مجمع نهائي للقيود', 'GL:bulkdel', '-', sums.slice(0, 8).join(' | ') + (sums.length > 8 ? ' …' : ''), del.length + ' قيد' + (autoN ? ' (منها ' + autoN + ' تلقائي)' : ''));
    return { success: true, deleted: del.length, skipped: skipped, autoN: autoN, balancesDelta: delta, removedIds: del, pendingCount: _glCpPending_(), mirQ: _GL_MIRQ_N_ };
  } finally { _glUnlock_(lock); }
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
// 📜 (V4.237) سجل تعديلات صف بكشف الحساب: القيد نفسه + مصدره بشاشات البرنامج (الدفعة/البند/المجموعة/الملف/الإيصال…)
function _glAutoSrc_(sk) { var m = _glStr_(sk).match(/^AUTO:([A-Z]+):(.*)$/); return m ? { src: m[1], id: m[2].replace(/#\d+$/, '') } : null; }
var GL_SRC_LBL_ = { CP: 'دفعة العميل', CI: 'بنود العميل بالرحلة', TRIP: 'بنود العميل بالرحلة', AP: 'دفعة الوكيل', AI: 'بند حساب الوكيل', VZ: 'مجموعة التأشيرات',
  MF: 'ملف المراجعة', RF: 'إيصال رسوم الغرفة', TR: 'تشغيلة النقل', HB: 'حجز الفنادق', HBP: 'دفعة الحجوزات', OPEN: 'الأرصدة الافتتاحية', CAT: 'اتفاقية الإعاشة' };
/* 🩺 (V4.321) قيود بلا رأس: أسطر GL_Lines تشير لرقم قيد لا صف له بـGL_Entries — تؤثر على الأرصدة (تُحسب من الأسطر
   مباشرة) لكن تظهر «القيد غير موجود» عند محاولة فتحه/تعديله/حذفه لأن كل هذه المسارات تبحث عن صف الرأس أولاً.
   السبب المعتاد: صف حُذف يدوياً من شيت GL_Entries مباشرة بجوجل شيتس (بدل زر الحذف بالبرنامج، الذي يحذف
   الرأس والأسطر معاً دائماً). الإصلاح: يُعاد بناء رأس قيد عادي (غير تلقائي، قابل للتعديل والحذف كأي قيد يدوي)
   من بيانات أسطره نفسها بنفس رقم القيد — فلا تتغيّر الأرصدة إطلاقاً (الأسطر لم تُمَس)، ويصير القيد مرئياً وقابلاً
   للتعديل/الحذف من جديد. يُنصَح بمراجعة بيانه وتاريخه بعد الإصلاح لأنها مُستنتَجة من الأسطر لا مضمونة الدقة */
function _glOrphanIds_(only) {
  var eIds = {}; _glRows_('entries').forEach(function (r) { var id = _glStr_(r[0]); if (id) eIds[id] = 1; });
  var set = null; if (Array.isArray(only) && only.length) { set = {}; only.forEach(function (i) { set[_glStr_(i)] = 1; }); }
  var byId = {};
  _glRows_('lines').forEach(function (r) {
    var id = _glStr_(r[0]); if (!id || eIds[id]) return;
    if (set && !set[id]) return;
    (byId[id] = byId[id] || []).push(r);
  });
  return byId;
}
function glFindOrphanEntries(authToken) {
  var session = _glAdminPerm_(authToken);
  var byId = _glOrphanIds_(), accM = _glAccounts_().map;
  var out = Object.keys(byId).map(function (id) {
    var ls = byId[id].slice().sort(function (a, b) { return (+a[1] || 0) - (+b[1] || 0); });
    var date = _glDate_(ls[0][2]);
    var statusCount = {}; ls.forEach(function (l) { var s = _glStr_(l[3]) || GL_ST_POSTED_; statusCount[s] = (statusCount[s] || 0) + 1; });
    var status = Object.keys(statusCount).sort(function (a, b) { return statusCount[b] - statusCount[a]; })[0] || GL_ST_POSTED_;
    var dB = 0, cB = 0, accs = [];
    ls.forEach(function (l) { dB += _glNum_(l[9]); cB += _glNum_(l[10]); var a = accM[_glStr_(l[4])]; accs.push((a && a.name) || _glStr_(l[4])); });
    return { id: id, date: date, status: status, lines: ls.length, totalBase: _glR2_(dB),
      balanced: Math.abs(_glR2_(dB - cB)) < 0.05, accounts: accs.filter(function (x, i, A) { return A.indexOf(x) === i; }) };
  }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return { success: true, orphans: out };
}
function glRepairOrphanEntries(authToken, ids) {
  var session = _glAdminPerm_(authToken);
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    var byId = _glOrphanIds_(ids), ids2 = Object.keys(byId);
    if (!ids2.length) return { success: true, repaired: 0, ids: [] };
    var now = _glNow_(), newRows = [];
    ids2.forEach(function (id) {
      var ls = byId[id].slice().sort(function (a, b) { return (+a[1] || 0) - (+b[1] || 0); });
      var date = _glDate_(ls[0][2]);
      var statusCount = {}; ls.forEach(function (l) { var s = _glStr_(l[3]) || GL_ST_POSTED_; statusCount[s] = (statusCount[s] || 0) + 1; });
      var status = Object.keys(statusCount).sort(function (a, b) { return statusCount[b] - statusCount[a]; })[0] || GL_ST_POSTED_;
      var dB = 0; ls.forEach(function (l) { dB += _glNum_(l[9]); });
      var descParts = ls.map(function (l) { return _glStr_(l[15]); }).filter(Boolean);
      var desc = '🩺 قيد مُستعاد (كان بلا رأس) — راجع بياناته: ' + (descParts[0] || '-');
      var trip = _glStr_(ls[0][11]) || '', company = _glStr_(ls[0][12]) || '';
      var seq = parseInt((String(id).match(/(\d+)$/) || [])[1], 10) || 0;
      newRows.push([id, seq, date, 'قيد يومية', desc, status, '', '', _glR2_(dB), '', trip, company,
        session.username, now, status === GL_ST_POSTED_ ? session.username : '', status === GL_ST_POSTED_ ? now : '', session.username, now, '']);
      logChange_(session.username, 'استعادة رأس قيد مفقود', 'GL:' + id, 'القيد', '-', desc);
    });
    var eSh = _glSheet_('entries');
    eSh.getRange(eSh.getLastRow() + 1, 1, newRows.length, GL_SHEETS_.entries.headers.length).setValues(newRows);
    return { success: true, repaired: newRows.length, ids: ids2 };
  } finally { _glUnlock_(lock); }
}
/* 🔢 (V4.353) قيود مكررة الرقم: أكثر من صف رأس بنفس رقم القيد ⇒ أسطرهما مدموجة تحت رقم واحد (نتيجة خلل العدّاد قبل V4.353)
   الإصلاح للتلقائية فقط: لقطة + سجل محصّن ⇒ حذف الرؤوس والأسطر المدموجة ⇒ إعادة إنشاء كل قيد من مصدره برقم جديد
   (التعديلات اليدوية المحفوظة على القيود التلقائية تُطبَّق كما هي). المختلط (يدوي + تلقائي) يُعرض للإصلاح اليدوي. */
function _glDupIdGroups_() {
  var eRows = _glRows_('entries'), by = {};
  eRows.forEach(function (r, i) { var id = _glStr_(r[0]); if (id) (by[id] = by[id] || []).push(i); });
  var out = {};
  Object.keys(by).forEach(function (id) { if (by[id].length > 1) out[id] = by[id].map(function (i) { return eRows[i]; }); });
  return out;
}
function glFindDupEntryIds(authToken) {
  _glAdminPerm_(authToken);
  var g = _glDupIdGroups_(), ids = Object.keys(g), nL = {};
  if (ids.length) _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (g[id]) nL[id] = (nL[id] || 0) + 1; });
  var out = ids.map(function (id) {
    var hs = g[id], auto = hs.every(function (r) { return /^AUTO:/.test(_glStr_(r[6])); });
    return { id: id, lines: nL[id] || 0, auto: auto, locked: hs.some(function (r) { return _glLocked_(r[2]); }),
      heads: hs.map(function (r) { return { date: _glDate_(r[2]), type: _glStr_(r[3]), desc: _glStr_(r[4]), src: _glStr_(r[6]), base: _glNum_(r[8]), status: _glStr_(r[5]) }; }) };
  }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  return { success: true, dups: out };
}
function glRepairDupEntryIds(authToken, ids) {
  var session = _glAdminPerm_(authToken), user = session.username;
  var want = {}; (Array.isArray(ids) ? ids : []).forEach(function (x) { x = _glStr_(x); if (x) want[x] = 1; });
  if (typeof _snapPreRisk_ === 'function') _snapPreRisk_('إصلاح قيود مكررة الرقم', user);
  var lock = _glLock_(); lock.waitLock(90000);
  try {
    var g = _glDupIdGroups_(), fix = [], skipped = [], keys = [];
    Object.keys(g).forEach(function (id) {
      if (!want[id]) return;
      var hs = g[id];
      if (!hs.every(function (r) { return /^AUTO:/.test(_glStr_(r[6])); })) { skipped.push({ id: id, reason: 'يحتوي قيداً يدوياً — يُصلح يدوياً' }); return; }
      if (hs.some(function (r) { return _glLocked_(r[2]); })) { skipped.push({ id: id, reason: 'في فترة مقفلة حتى ' + _glSettings_().lockDate }); return; }
      fix.push(id); hs.forEach(function (r) { var k = _glStr_(r[6]); if (keys.indexOf(k) < 0) keys.push(k); });
    });
    if (!fix.length) return { success: true, fixed: 0, skipped: skipped, created: [] };
    var fixSet = {}; fix.forEach(function (id) { fixSet[id] = 1; });
    var byE = {}; _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (fixSet[id]) (byE[id] = byE[id] || []).push(l); });
    fix.forEach(function (id) {
      g[id].forEach(function (r) {
        if (typeof _snapEntryTake_ === 'function') _snapEntryTake_(id, r, byE[id] || [], 'قبل إصلاح رقم مكرر', user);
        if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(user, id, _audSnapRows_(r, byE[id] || []), null, 'إصلاح قيد مكرر الرقم (يُعاد إنشاؤه برقم جديد)');
      });
    });
    _glDeleteLinesOf_(fix);
    var sh = _glSheet_('entries'), rowsDel = [];
    _glRows_('entries').forEach(function (r, i) { if (fixSet[_glStr_(r[0])]) rowsDel.push({ row: i + 2 }); });
    _glRowBlocks_(rowsDel).forEach(function (b) { sh.deleteRows(b[0], b[1]); });
    try { _glPendingDrop_(keys); } catch (ePd) {}
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var r = _glAutoRun_(user, false, { onlyKeys: keys, bypass: true });
    var created = (r.createdList || []).map(function (x) { return x.id; });
    logChange_(user, 'إصلاح قيود مكررة الرقم', 'GL:dupfix', fix.join('، '), '-', 'أُعيد إنشاء ' + created.length + ' قيد: ' + created.slice(0, 12).join('، '));
    return { success: true, fixed: fix.length, skipped: skipped, created: created, keys: keys.length, errors: (r.errors || []).slice(0, 20) };
  } finally { _glUnlock_(lock); }
}
function glRowHistory(authToken, entryId) {
  _glPerm_(authToken, 'view');
  var id = _glStr_(entryId), f = _glFindEntry_(id); if (!f) throw new Error('القيد غير موجود');
  var so = _glAutoSrc_(f.r[6]), keys = {}, ct = null;
  keys['GL:' + id] = 'القيد ' + id;
  if (so) {
    var L = GL_SRC_LBL_[so.src] || 'المصدر';
    if (/^(AP|AI|VZ|MF)$/.test(so.src)) keys[so.src + ':' + so.id] = L;
    else if (so.src === 'TR' || so.src === 'RF') { keys[so.id] = L; var rn = (_glStr_(f.r[4]).match(/إيصال\s+(\S+)/) || [])[1]; if (rn && rn !== '—') keys[rn] = L; }
    else if (so.src === 'TRIP' || so.src === 'CI') { var p = so.id.split('|'); ct = { client: p[0], trip: p[1] || 'عام', rx: null, lbl: L }; }
    else if (so.src === 'CP') {
      try {
        var pSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
        if (pSh.getLastRow() >= 2) pSh.getRange(2, 1, pSh.getLastRow() - 1, 3).getValues().some(function (r) {
          if (_glStr_(r[0]) !== so.id) return false; ct = { client: _glStr_(r[1]), trip: _glStr_(r[2]) || 'عام', rx: /دفعة|تحويل/, lbl: 'دفعات العميل بالرحلة' }; return true; });
      } catch (e) {}
    }
  }
  var sheet = ensureAuditLogSheet_(), last = sheet.getLastRow(), out = [];
  if (last >= 2) sheet.getRange(2, 1, last - 1, 7).getValues().forEach(function (r) {
    var rec = _glStr_(r[3]), scope = keys[rec];
    if (!scope && ct && rec === ct.client && _glStr_(r[4]) === ct.trip && (!ct.rx || ct.rx.test(_glStr_(r[2])))) scope = ct.lbl;
    if (!scope) return;
    out.push({ timestamp: _glStr_(r[0]), username: _glStr_(r[1]) || '-', action: _glStr_(r[2]) || '-', recordId: scope, field: _glStr_(r[4]) || '-',
      oldValue: _glStr_(r[5]) || '-', newValue: _glStr_(r[6]) || '-' });
  });
  return { success: true, rows: out.reverse(), source: so ? (GL_SRC_LBL_[so.src] || so.src) : '', auto: !!so };
}
// 🗑️ (V4.237) حذف صف من كشف الحساب: قيد يدوي ⇒ حذف نهائي (المدير) · قيد تلقائي مصدره سجل منفرد (دفعة/بند/مجموعة/ملف/إيصال)
// ⇒ يُحذف المصدر من شاشته (بصلاحياتها) ويُلغى القيد فوراً بلا انتظار المزامنة · القيود المجمّعة (بنود رحلة/افتتاحي/نقل/حجوزات) تُعدَّل من مصدرها
function glRowDelete(authToken, entryId) {
  var session = requireAuth_(authToken);
  var id = _glStr_(entryId), f = _glFindEntry_(id); if (!f) throw new Error('القيد غير موجود');
  var so = _glAutoSrc_(f.r[6]);
  if (!so) return glDeleteEntry(authToken, id);
  if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
  var r;
  switch (so.src) {
    case 'CP': r = deleteAccPayment(authToken, so.id); break;
    case 'AP': r = deleteAgentPayment(authToken, so.id); break;
    case 'AI': r = deleteAgentAccItem(authToken, so.id); break;
    case 'VZ': r = deleteVisaFile(authToken, so.id); break;
    case 'MF': r = deleteMinistryFile(authToken, so.id); break;
    case 'CAT': r = deleteCateringContract(authToken, '', so.id); break;   // 🍽️ (V4.323) حذف الاتفاقية نفسها ⇒ يُلغى قيدها
    case 'RF':
      if (/\|/.test(so.id)) throw new Error('إيصال رسوم غرفة بلا رقم — احذفه من شاشة ملفات الوزارة ← الإيصالات');
      r = deleteRoomFeeReceipt(authToken, so.id); break;
    default:
      throw new Error('هذا قيد مجمَّع من «' + (GL_SRC_LBL_[so.src] || so.src) + '» — يُعدَّل أو يُحذف من مصدره بالشاشة (مثلاً حذف البند من حسابات العميل) فيتحدّث القيد تلقائياً');
  }
  if (r && r.success === false) throw new Error(r.error || 'تعذّر حذف المصدر');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var g = _glFindEntry_(id); if (!g || _glStr_(g.r[5]) === GL_ST_VOID_) return { success: true, id: id, sourceDeleted: so.src, removedId: id, deleted: true, balancesDelta: {} };
    var was = _glLinesOf_(id), sh = _glSheet_('entries');
    sh.getRange(g.row, 6).setValue(GL_ST_VOID_);
    sh.getRange(g.row, 17, 1, 3).setValues([[session.username, _glNow_(), 'حُذف مصدره من كشف الحساب']]);
    _glSetLinesStatus_([id], GL_ST_VOID_);
    logChange_(session.username, 'حذف صف من كشف الحساب', 'GL:' + id, GL_SRC_LBL_[so.src] || so.src, _glStr_(f.r[4]) + ' — ' + _glNum_(f.r[8]) + ' ج', 'ملغى (حُذف المصدر)');
    return { success: true, id: id, sourceDeleted: so.src, balancesDelta: _glLineDelta_(was, -1, {}), pendingCount: _glCpPending_(), savedRow: _glListEntryRow_(id) };
  } finally { _glUnlock_(lock); }
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
  vch_note: 'لا يعتد بهذا الإيصال بعد انتهاء الرحلة أو بعد مرور 30 يوماً من تاريخ الإيصال',
  // 🏢 (V4.251) شركات إضافية لإصدار الكشوف — JSON: [{id,name_ar,name_en,tagline,address,phone,email,logo_company,logo_file}]
  vch_companies: '[]'
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
  try { logo = typeof getCompanyLogoBase64_ === 'function' ? getCompanyLogoBase64_(brand.vch_logo_company || e.company || '') : ''; } catch (eL) {}
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
  e.lines = _glLinesOf_(id).map(_glLineObj_)
    .sort(function (a, b) { return a.lineNo - b.lineNo; });
  e.attachments = _glAttachMap_()[id] || [];
  return e;
}
function glGetEntry(authToken, id) {
  _glPerm_(authToken, 'view');
  var e = _glEntryFull_(_glStr_(id));
  if (!e) throw new Error('القيد غير موجود');
  e.due = _glDueMap_()[e.id] || '';
  try { var _fv = _glFindEntry_(e.id); if (_fv && typeof _glEntryVer_ === 'function') e.ver = _glEntryVer_(_fv.r, _glLinesOf_(e.id)); } catch (eV) {}   // 🔐 (V4.346) بصمة الإصدار
  // ✍️ (V4.319) التعديلات اليدوية الدائمة على القيد التلقائي/قيد الشيت (لعرض «معدَّل يدوياً» وزر «↺ إعادة للتلقائي»)
  if (/^(AUTO|CUST):/.test(_glStr_(e.sourceKey))) { var x = _glOvrMap_()[/^CUST:/.test(e.sourceKey) ? e.sourceKey + '#' + e.id : e.sourceKey];
    if (x) e.ovr = { acc: x.acc.map(function (a) { return { from: a.from, to: a.to, cur: a.cur, side: a.side, by: a.by, at: a.at }; }), hdr: x.hdr || null, freeze: x.freeze || null, vd: x.vd || null, keep: x.keep || null }; }
  // ✅ (V4.323) تغيير مصدر معلَّق / بند تحويل عملة — يُعرض بنافذة القيد، والحفظ بعد الموافقة الصريحة يعتمد القيد كما حُفظ (بصمة pendAck)
  try {
    var _pr = _glPendingRows_(), _pk = /^AUTO:/.test(_glStr_(e.sourceKey)) ? _pr[_glStr_(e.sourceKey)] : null, _pc = _pr['CCY:' + e.id];
    if (_pk) e.pend = { kind: _glStr_(_pk.row[2]), hash: _glStr_(_pk.row[7]), at: _glStr_(_pk.row[8]), rejected: _glStr_(_pk.row[9]) === 'مرفوض',
      newAmt: _glStr_(_pk.row[13]), diff: _glStr_(_pk.row[14]).slice(0, 1500) };
    if (_pc) e.ccyPend = { amt: _glStr_(_pc.row[13]), note: _glStr_(_pc.row[14]) };
  } catch (eP) {}
  return { success: true, entry: e };
}
// ↺ (V4.319) إعادة القيد التلقائي لما يبنيه مصدره: حذف كل التعديلات اليدوية الدائمة ثم إعادة بنائه فوراً
function glAutoOvrRelease(authToken, id) {
  var session = requireAuth_(authToken);
  if (!_glCanEditAuto_(session)) throw new Error('يحتاج صلاحية تعديل «القيود التلقائية والاعتماد»');
  var _pre = _glAutoPreBuild_(session.username);
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    var f = _glFindEntry_(_glStr_(id)); if (!f) throw new Error('القيد غير موجود');
    var sk = _glStr_(f.r[6]), k = /^CUST:/.test(sk) ? sk + '#' + _glStr_(f.r[0]) : sk;
    if (!/^(AUTO|CUST):/.test(sk)) throw new Error('ليس قيداً تلقائياً');
    if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
    _glOvrDrop_([k]);
    _glPendingDrop_([sk, 'CCY:' + _glStr_(f.r[0])]);   // ✅ (V4.323) وبند «💱 تحويل عملة» إن وُجد
    var r = { updated: 0 };
    if (/^CUST:/.test(sk)) _glSheet_('entries').getRange(f.row, 10).setValue('cs:');   // بصمة صف فارغة ⇒ مزامنة الشيت التالية تعيد بناءه من الصف
    if (/^AUTO:/.test(sk)) {
      _glSheet_('entries').getRange(f.row, 10).setValue('');   // بصمة فارغة ⇒ يُعاد بناؤه الآن من المصدر
      var only = {}; only[sk] = 1; r = _glAutoRunPre_(session.username, _pre, { bypass: true, onlyKeys: only });
    }
    logChange_(session.username, 'إعادة قيد تلقائي لمصدره', 'GL:' + id, 'القيد', 'تعديل يدوي', 'المصدر');
    return { success: true, updated: r.updated || 0, note: /^CUST:/.test(sk) ? 'يُعاد حساب الطرف من الشيت عند المزامنة التالية للشيت' : '' };
  } finally { _glUnlock_(lock); }
}
/* 🏦 (V4.290) تاريخ الاستحقاق لحركات البنوك: الإيداع/التحويل يُضاف للرصيد المتاح من تاريخ استحقاقه (الافتراضي = تاريخ القيد) */
function _glDueMap_() {
  var m = {};
  try { _glRows_('bankdue').forEach(function (r) { var id = _glStr_(r[0]), d = _glDate_(r[1]); if (id && d) m[id] = d; }); } catch (e) {}
  return m;
}
function _glDueSet_(id, due, date, user) {
  var d = _glDate_(due); if (d && d === _glDate_(date)) d = '';
  var sh = _glSheet_('bankdue'), at = -1;
  _glRows_('bankdue').forEach(function (r, i) { if (_glStr_(r[0]) === id) at = i + 2; });
  if (!d) { if (at > 0) sh.deleteRow(at); return ''; }
  if (at > 0) sh.getRange(at, 2, 1, 3).setValues([[d, user, _glNow_()]]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([[id, d, user, _glNow_()]]);
  return d;
}
// قائمة القيود بفلاتر: from/to/type/status/account/q/batch — الأحدث أولاً (حد 400)
function glListEntries(authToken, f) {
  _glPerm_(authToken, 'view', 'je');
  f = f || {};
  var fromK = _glDKey_(_glDate_(f.from)), toK = _glDKey_(_glDate_(f.to)), q = _glNorm_(f.q || ''), acc = _glStr_(f.account);
  // ⚡ (V4.301) فهرسة الأسطر الخام حسب القيد (بلا بناء كائنات)
  var byEntry = {};
  _glRows_('lines').forEach(function (r) { var id = _glStr_(r[0]); (byEntry[id] = byEntry[id] || []).push(r); });
  // ⚡ (V4.301) الترشيح والترتيب على الصفوف الخام فقط — كان يُبنى كائن كامل لكل قيد و«كائن سطر» لكل سطر (مع تنسيق
  // تاريخ لكل سطر) لكل القيود المطابقة ثم يُرتَّب الكل ثم يُقتطع 400 فقط (هدر O(كل الأسطر) حتى لو المعروض 400).
  // الآن: ترشيح/ترتيب خفيف على الخام، ثم بناء الكائنات الكاملة (وتنسيق تواريخ الأسطر) لأول 400 المعروضة فقط.
  var picked = [];
  _glRows_('entries').forEach(function (r) {
    var k = _glDKey_(_glDate_(r[2]));
    if (fromK && k < fromK) return; if (toK && k > toK) return;
    if (f.type && _glStr_(r[3]) !== f.type) return;
    if (f.status && _glStr_(r[5]) !== f.status) return;
    if (f.batch && _glStr_(r[7]) !== f.batch) return;
    var rawLs = byEntry[_glStr_(r[0])] || [];
    if (acc && !rawLs.some(function (l) { return _glStr_(l[4]).indexOf(acc) === 0; })) return;
    if (q) {
      var hay = _glNorm_([_glStr_(r[0]), (_glStr_(r[6]).match(/^VCH:(.+)$/) || [])[1] || '', _glStr_(r[4]), _glStr_(r[9]), _glStr_(r[3]), _glStr_(r[10]), _glStr_(r[11])]
        .concat(rawLs.map(function (l) { return _glStr_(l[15]) + ' ' + _glStr_(l[13]) + ' ' + _glStr_(l[14]) + ' ' + _glStr_(l[11]); })).join(' '));
      if (hay.indexOf(q) < 0) return;
    }
    picked.push({ r: r, k: k, seq: +r[1] || 0, ls: rawLs });
  });
  picked.sort(function (a, b) { return a.k < b.k ? 1 : (a.k > b.k ? -1 : (b.seq - a.seq)); });
  var total = picked.length, cap = f.all ? 2500 : 400;   // ⚡ (V4.351) all ⇒ القائمة كاملة مرة واحدة لتُصفّى محلياً بالمتصفح
  var out = picked.slice(0, cap).map(function (p) {
    var e = _glEntryObj_(p.r); e._k = p.k;
    e.lines = p.ls.map(_glLineObj_).sort(function (a, b) { return a.lineNo - b.lineNo; });
    return e;
  });
  return { success: true, total: total, entries: out, truncated: total > cap };
}

/* ---------------------------- دفتر الأستاذ والميزان ---------------------------- */
// دفتر الأستاذ لحساب (أو مجموعة: كل الحسابات التي يبدأ كودها بهذا الكود) بفترة
function glLedger(authToken, code, from, to) {
  _glPerm_(authToken, 'view', 'stmt');
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
  ctx.trips = _glTripsInfo_();
  try { _glRows_('hbmap').forEach(function (r) { var c = _glStr_(r[2]); if (c) (ctx.hbNames[c] = ctx.hbNames[c] || []).push({ name: _glStr_(r[0]), type: _glStr_(r[1]) }); }); } catch (e) {}
  return ctx;
}
// ⚡ (V4.245) سياق كشف حساب واحد: بدل قراءة شيت السطور كاملاً (16 عموداً × كل السطور منذ نقل الـ ERP) تُقرأ الأعمدة A:E فقط
// لكل السطور (للأطراف المقابلة)، ثم سطور الحساب نفسه كاملة على دفعات متجاورة، والقيود A:L فقط
function _glStmtCtxFor_(code) {
  var ctx = { accs: _glAccounts_(), entries: {}, byAcc: {}, byEntry: {}, pend: {}, att: {}, trips: {}, hbNames: {}, hb: null };
  // ⚡ (V4.252) السطور في الكاش ⇒ كل شيء من الذاكرة (بلا أي قراءة للشيت)
  var cl = _glRowsPeek_('lines');
  if (cl) {
    var need0 = {}, own = [];
    cl.forEach(function (r) { if (_glStr_(r[3]) === GL_ST_POSTED_ && _glStr_(r[4]) === code) { own.push(r); need0[_glStr_(r[0])] = 1; } });
    cl.forEach(function (r) { var id = _glStr_(r[0]); if (need0[id] && _glStr_(r[3]) === GL_ST_POSTED_) (ctx.byEntry[id] = ctx.byEntry[id] || []).push(r); });
    ctx.byAcc[code] = own;
    if (own.length) _glRows_('entries').forEach(function (r) { var id = _glStr_(r[0]); if (need0[id]) ctx.entries[id] = r; });
    _glStmtCtxAux_(ctx);
    return ctx;
  }
  var lSh = _glSheetR_('lines'), last = lSh.getLastRow(), W = GL_SHEETS_.lines.headers.length, mine = [];
  if (last >= 2) {
    var ae = lSh.getRange(2, 1, last - 1, 5).getValues(), need = {};
    ae.forEach(function (r, i) {
      if (_glStr_(r[3]) !== GL_ST_POSTED_) return;
      var id = _glStr_(r[0]);
      if (_glStr_(r[4]) === code) { mine.push(i); need[id] = 1; }
    });
    ae.forEach(function (r) { var id = _glStr_(r[0]); if (need[id] && _glStr_(r[3]) === GL_ST_POSTED_) (ctx.byEntry[id] = ctx.byEntry[id] || []).push(r); });
    var rows = [];
    if (mine.length) {
      var runs = [], a = mine[0], b = mine[0];
      for (var k = 1; k < mine.length; k++) { if (mine[k] - b <= 4) b = mine[k]; else { runs.push([a, b]); a = b = mine[k]; } }
      runs.push([a, b]);
      if (runs.length > 60) {   // حساب حركاته متناثرة جداً ⇒ قراءة واحدة كاملة أسرع من عشرات القراءات
        var full = lSh.getRange(2, 1, last - 1, W).getValues(); mine.forEach(function (i) { rows.push(full[i]); });
      } else {
        var set = {}; mine.forEach(function (i) { set[i] = 1; });
        runs.forEach(function (ru) { lSh.getRange(ru[0] + 2, 1, ru[1] - ru[0] + 1, W).getValues().forEach(function (r, j) { if (set[ru[0] + j]) rows.push(r); }); });
      }
    }
    ctx.byAcc[code] = rows;
    var ce = _glRowsPeek_('entries');
    if (ce && mine.length) ce.forEach(function (r) { var id = _glStr_(r[0]); if (need[id]) ctx.entries[id] = r; });
    else {
      var eSh = _glSheetR_('entries'), eLast = eSh.getLastRow();
      if (eLast >= 2 && mine.length) eSh.getRange(2, 1, eLast - 1, 12).getValues().forEach(function (r) {
        var id = _glStr_(r[0]); if (!need[id]) return; while (r.length < 19) r.push(''); ctx.entries[id] = r;
      });
    }
  }
  _glStmtCtxAux_(ctx);
  return ctx;
}
// بيانات مساعدة للكشف: الاعتماد + المرفقات + الرحلات (كاش 5 دقائق) + خريطة أسماء الحجوزات
function _glStmtCtxAux_(ctx) {
  var pr = _glPendingRows_(); Object.keys(pr).forEach(function (k) { var r = pr[k].row; if (_glStr_(r[9]) !== 'مرفوض') ctx.pend[_glStr_(r[1])] = _glStr_(r[2]) || 'تعديل'; });
  try { ctx.att = _glAttachMap_(); } catch (e) {}
  ctx.trips = _glTripsInfo_();
  try { _glRows_('hbmap').forEach(function (r) { var c = _glStr_(r[2]); if (c) (ctx.hbNames[c] = ctx.hbNames[c] || []).push({ name: _glStr_(r[0]), type: _glStr_(r[1]) }); }); } catch (e) {}
}
var _GL_TRIPS_MEMO_ = null;
function _glTripsInfo_() {
  if (_GL_TRIPS_MEMO_) return _GL_TRIPS_MEMO_;
  var out = {}, ck = _glCK_('trips');
  try { var c = CacheService.getScriptCache().get(ck); if (c) return (_GL_TRIPS_MEMO_ = JSON.parse(c)); } catch (e0) {}
  try {
    var sh = getSpreadsheet_().getSheetByName(TRIPS_SHEET_NAME_);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (r) {
      var n = _glStr_(r[0]); if (n) out[n] = { company: _glStr_(r[1]), go: _glAutoDate_(r[4]), back: _glAutoDate_(r[5]) };
    });
    var js = JSON.stringify(out); if (js.length < 90000) CacheService.getScriptCache().put(ck, js, 300);
  } catch (e) {}
  return (_GL_TRIPS_MEMO_ = out);
}
function _glStmtHb_(ctx) {
  if (ctx.hb !== null) return ctx.hb;
  ctx.hb = false;
  try {
    if (_glHbOn_()) {   // ⚡ (V4.252) بيانات العرض فقط (الفندق/التواريخ/بلا سعر) ⇒ كاش دقيقتين بدل فتح ملف الحجوزات مع كل كشف
      var ck = _glCK_('hbread'), got = _glCGet_(ck);
      if (got) ctx.hb = got; else { ctx.hb = _glHbRead_(); _glCPut_(ck, ctx.hb, 120); }
    }
  } catch (e) { ctx.hb = false; }
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
  var unpriced = [], hbLater = false;
  if ((hasHb || hbN.length) && ctx.skipHb) hbLater = true;   // (V4.245) بيانات الحجز تُجلب بنداء ثانٍ — الكشف يظهر فوراً
  else if (hasHb || hbN.length) {
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
    rows: rows, unpriced: unpriced, hbLater: hbLater, trips: tripInfo, pending: pendN, aging: sign ? _glAging_(all, sign, asOf) : {} };
}
// opts.fast: (V4.245) سياق الحساب وحده + بيانات الحجز لاحقاً (glStatementHb) — الواجهة تطلبه هكذا
function glStatement(authToken, code, from, to, opts) {
  _glPerm_(authToken, 'view', 'stmt');
  code = _glStr_(code);
  if (opts && opts.fast) { var c = _glStmtCtxFor_(code); c.skipHb = true; return _glStmtCore_(code, from, to, c); }
  return _glStmtCore_(code, from, to, _glStmtCtx_());
}
// بيانات الحجز لسطور الكشف + الحجوزات بلا سعر (نفس منطق _glStmtCore_) — تُدمج بالواجهة بعد ظهور الكشف
function glStatementHb(authToken, code, from, to) {
  _glPerm_(authToken, 'view', 'stmt');
  code = _glStr_(code);
  var c = _glStmtCtxFor_(code), r = _glStmtCore_(code, from, to, c), byKey = {};
  r.rows.forEach(function (x) { if (x.hbKey && x.hb) byKey[x.hbKey] = x.hb; });
  return { success: true, code: code, byKey: byKey, unpriced: r.unpriced };
}
// كشوف جماعية: كل الحسابات المختارة (أو كل حسابات نوع له رصيد) بسياق قراءة واحد
function glStatements(authToken, codes, from, to, opts) {
  _glPerm_(authToken, 'view', 'stmt');
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
/* ============================================================
   🔁 (V4.302) مطابقة كشوف الشاشات (السكن/العمرة) مع كشف الحساب العام
   الهدف: مقارنة رصيد كل طرف في كشف الشاشة برصيده في الحساب العام، وإظهار الفروق
   (دفعة/حركة موجودة بأحد الكشفين دون الآخر) لإضافة الناقص للعام أو حذف المكرر مجمّعاً.
   ============================================================ */
// فرق الأيام بين مفتاحَي تاريخ yyyymmdd (موجب لو الأول أحدث)
function _glReconDayDiff_(k1, k2) {
  var s1 = String(k1), s2 = String(k2);
  if (!/^\d{8}$/.test(s1) || !/^\d{8}$/.test(s2)) return 1e9;
  var d1 = Date.UTC(+s1.slice(0, 4), +s1.slice(4, 6) - 1, +s1.slice(6, 8));
  var d2 = Date.UTC(+s2.slice(0, 4), +s2.slice(4, 6) - 1, +s2.slice(6, 8));
  return Math.round((d1 - d2) / 86400000);
}
// نواة المطابقة النقية: prog/gl مصفوفتا حركات [{k:'yyyymmdd', amt: مبلغ بإشارة (+مدين/−دائن), id, ...}]
// بنفس العملة (يُرشِّح المتصل العملة). تُطابق بالإشارة + المبلغ (±tol) + التاريخ (±days، الأقرب أولاً).
// تُعيد {matched:[{p,g}], onlyP:[شاشة بلا مقابل ⇒ ناقص بالعام], onlyG:[عام بلا مقابل ⇒ زائد/مكرر]}.
function _glReconMatch_(prog, gl, opts) {
  opts = opts || {};
  var days = opts.days == null ? 3 : opts.days, tol = opts.tol == null ? 0.5 : opts.tol;
  var G = (gl || []).map(function (g, i) { return { g: g, i: i }; }), usedG = {}, matched = [], onlyP = [];
  (prog || []).forEach(function (p) {
    var best = -1, bestScore = Infinity;
    for (var j = 0; j < G.length; j++) {
      if (usedG[j]) continue;
      var g = G[j].g;
      if ((p.amt < 0) !== (g.amt < 0)) continue;
      var da = Math.abs(Math.abs(p.amt) - Math.abs(g.amt)); if (da > tol) continue;
      var dd = Math.abs(_glReconDayDiff_(p.k, g.k)); if (dd > days) continue;
      var score = dd * 1e6 + da;
      if (score < bestScore) { bestScore = score; best = j; }
    }
    if (best >= 0) { usedG[best] = 1; matched.push({ p: p, g: G[best].g }); }
    else onlyP.push(p);
  });
  var onlyG = []; G.forEach(function (x, j) { if (!usedG[j]) onlyG.push(x.g); });
  return { matched: matched, onlyP: onlyP, onlyG: onlyG };
}
// تقرير أعمار الديون المجمّع لكل العملاء (أو الموردين/الوكلاء)
function glAgingReport(authToken, role, to) {
  _glPerm_(authToken, 'view', 'stmt');
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
  var session = _glPerm_(authToken, 'view', 'stmt');
  info = info || {};
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var sh = _glSheet_('stmts'), rows = _glRows_('stmts'), yr = Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyy'), last = 0;
    rows.forEach(function (r) { var m = _glStr_(r[0]).match(/^ST-(\d{4})-(\d+)$/); if (m && m[1] === yr && +m[2] > last) last = +m[2]; });
    var serial = 'ST-' + yr + '-' + ('000' + (last + 1)).slice(-4), at = _glNow_();
    _glBotQ_('stmt', { serial: serial, name: _glStr_(info.name), balances: _glStr_(info.balances), by: session.username, output: _glStr_(info.output) });   // 📲 (V4.254)
    var bal = _glStr_(info.balances), hash = _glHash_([serial, info.code, info.to, bal, at].join('|')).slice(0, 10).toUpperCase();
    sh.appendRow([serial, at, session.username, _glStr_(info.code), _glStr_(info.name), _glStr_(info.from), _glStr_(info.to), bal, _glStr_(info.output), hash, _glStr_(info.note)]);
    logChange_(session.username, 'إصدار كشف حساب', 'GL:' + _glStr_(info.code), _glStr_(info.output), '', serial + ' — ' + _glStr_(info.name) + ' — ' + bal);
    return { success: true, serial: serial, hash: hash, at: at, by: session.username };
  } finally { _glUnlock_(lock); }
}
function glStmtVerify(authToken, serial) {
  _glPerm_(authToken, 'view', 'stmt');
  serial = _glStr_(serial).toUpperCase().replace(/^.*?(ST-\d{4}-\d+).*$/, '$1');
  var hit = null;
  _glRows_('stmts').forEach(function (r) { if (_glStr_(r[0]) === serial) hit = { serial: serial, at: _glStr_(r[1]), by: _glStr_(r[2]), code: _glStr_(r[3]), name: _glStr_(r[4]), from: _glStr_(r[5]), to: _glStr_(r[6]), balances: _glStr_(r[7]), output: _glStr_(r[8]), hash: _glStr_(r[9]) }; });
  return { success: true, found: !!hit, rec: hit };
}
function glStmtLog(authToken, code) {
  _glPerm_(authToken, 'view', 'stmt');
  code = _glStr_(code);
  var out = [];
  _glRows_('stmts').forEach(function (r) { if (!code || _glStr_(r[3]) === code) out.push({ serial: _glStr_(r[0]), at: _glStr_(r[1]), by: _glStr_(r[2]), code: _glStr_(r[3]), name: _glStr_(r[4]), from: _glStr_(r[5]), to: _glStr_(r[6]), balances: _glStr_(r[7]), output: _glStr_(r[8]), hash: _glStr_(r[9]) }); });
  return { success: true, rows: out.reverse().slice(0, 300) };
}
// 📄 PDF نصي من مستند الكشف المطبوع نفسه (مجلد مؤقت، مشاركة برابط) — للمشاركة/التنزيل من الواجهة
function glStmtPdf(authToken, htmlDoc, fileName) {
  _glPerm_(authToken, 'view', 'stmt');
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
  _glPerm_(authToken, 'view', function () { return _glSubOfAcc_(code) || 'safe'; });
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
  var rows = [], attMap = _glAttachMap_(), dueMap = acc.kind === 'bank' ? _glDueMap_() : {};
  mine.forEach(function (r) {
    var l = _glLineObj_(r), k = _glDKey_(l.date);
    if (k > lastK) lastK = k;
    if (toK && k > toK) return;
    if (fromK && k < fromK) { open[l.currency] = _glR2_(open[l.currency] + l.debit - l.credit); return; }
    var e = entries[l.entryId], eo = e ? _glEntryObj_(e) : {};
    var names = [], fxN = [];
    (byEntry[l.entryId] || []).forEach(function (o) {
      var c = _glStr_(o[4]); if (c === code) return;
      var a = accs.map[c], n = a ? (a.link || a.name) : c, arr = a && a.kind === 'fx' ? fxN : names;   // (V4.290) وسيط العملات لا يُذكر كطرف مقابل إلا وحده
      if (arr.indexOf(n) < 0) arr.push(n);
    });
    if (!names.length) names = fxN;
    rows.push({ entryId: l.entryId, due: dueMap[l.entryId] || '', voucherNo: eo.voucherNo || ((_glStr_(eo.ref).match(/^(REC|PAY)-\d+$/) || [])[0]) || '', type: eo.type || '', date: l.date, _k: k,
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
  _glPerm_(authToken, 'view', 'rep');
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
  if (typeof _snapPreRisk_ === 'function') _snapPreRisk_('استيراد ' + (kind === 'entries' ? 'قيود' : 'أرصدة افتتاحية'), session.username);   // ⏪ (V4.346)
  var lock = _glLock_(); lock.waitLock(30000);
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
  } finally { _glUnlock_(lock); }
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
  var lock = _glLock_(); lock.waitLock(30000);
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
  } finally { _glUnlock_(lock); }
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
/* ============================================================================
   ⚙ (V4.207) المرحلة 2 — القيود التلقائية من شاشات البرنامج («وضع الظل»)
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
  rev_exec:   ['41', 'إيرادات رسوم التنفيذ', 'REV', 0, '', ''],   // (V4.230) رسوم تنفيذ ملفات الوزارة (بدل رسوم الغرفة)
  rev_ticket: ['41', 'إيرادات التذاكر', 'REV', 0, '', ''],
  rev_sup:    ['41', 'إيرادات الإشراف', 'REV', 0, '', ''],
  cat_diff:   ['41', 'فروق اتفاقيات الإعاشة', 'REV', 0, '', ''],
  cs_susp:    ['15', 'متعلقات — مبالغ معلقة بانتظار التسوية', 'ASSET', 0, '', ''],   // ⏳ (V4.324) «مبالغ معلقة» بشيتات الخزن/البنوك/العهد   // 🍽️ (V4.323) فرق سعر البيع والتكلفة باتفاقيات الإعاشة (قابل للتغيير من الإعدادات)
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
      code = (prefer && !accs.map[prefer] && !taken[prefer] && !_glAccDeleted_().codes[prefer] && prefer.length === parent.length + (parent.length === 1 ? 1 : (parent.length === 2 ? 2 : 3))) ? prefer : _glNextCodeIn_(parent, taken);
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
  var accs = _glAccounts_(), byLink = {}, pending = [], pendKeys = [], taken = {}, madeNames = [];
  accs.list.forEach(function (a) { if (a.link && !a.isGroup) byLink[a.kind + '|' + _glNorm_(a.link)] = a.code; });
  // (V4.223) روابط الحسابات المدموجة فيه ⟦alias:الفئة|الاسم⟧ — لا يُعاد فتح الحساب المحذوف بالمزامنة
  // (V4.251) تُطبَّق بعد الروابط لتتغلب عليها: ربط أكثر من رحلة بحساب محاسبي واحد ⟦alias:trip|اسم الرحلة⟧
  accs.list.forEach(function (a) {
    if (a.isGroup) return;
    String(a.notes || '').replace(/⟦alias:([^|⟧]*)\|([^⟧]+)⟧/g, function (m, k, n) { byLink[k + '|' + _glNorm_(n)] = a.code; return m; });
  });
  var parentOf = { client: '1201', agent: '2101', supplier: '2102', roomfee: roles.roomGroup, hbrev: roles.hb_revgrp, trip: _glTripGroup_() };
  var typeOf = { client: 'ASSET', agent: 'LIAB', supplier: 'LIAB', roomfee: 'ASSET', hbrev: 'REV', trip: 'REV' };
  var tomb = _glAccDeleted_().tomb, tombHits = {};
  var get = function (kind, name) {
    name = _glStr_(name); if (!name) return '';
    var k = kind + '|' + _glNorm_(name);
    if (byLink[k]) return byLink[k];
    // 🗂️ (V4.324) طرف حُذف حسابه من الدليل (مع قيوده) ⇒ لا يُفتح له حساب جديد، وقيده لا يُبنى (GL_TOMB_) — حساب جديد مربوط بنفس الاسم يتقدّم عليه
    if (tomb[k]) { tombHits[k] = (tombHits[k] || 0) + 1; return GL_TOMB_; }
    var parent = parentOf[kind];
    if (!accs.map[parent]) throw new Error(kind === 'trip' ? 'مجموعة «إيرادات رحلات العمرة» (4101) غير موجودة — شغّل «إعادة بناء قيود الرحلات» من تبويب القيود التلقائية' : 'المجموعة ' + parent + ' غير موجودة بالدليل');
    var code = _glNextCodeIn_(parent, taken); taken[code] = 1;
    var row = _glAccRow_({ code: code, name: kind === 'roomfee' ? 'رسوم الغرفة — ' + name : (kind === 'hbrev' ? 'إيرادات حجوزات — ' + name : name), type: typeOf[kind], parent: parent, kind: kind, link: name,
      notes: kind === 'hbrev' ? 'ربح حجوزات الفنادق من هذا المورد — يُرحَّل لإيرادات السكن نهاية الموسم' : (kind === 'trip' ? 'حساب الرحلة: إيرادات عملائها (دائن) وتكاليفها — رسوم الغرف والتأشيرات والنقل (مدين) — رصيده = ربح الرحلة' : 'أُنشئ تلقائياً من شاشات البرنامج') }, user);
    pending.push(row); pendKeys.push(k); _glMemoAddAcc_(row); madeNames.push(code + ' — ' + row[1]);
    byLink[k] = code;
    return code;
  };
  // ⚡ (V4.236) البناء يتم خارج القفل: قبل كتابة الحسابات الجديدة (داخل القفل) نتأكد أن أحداً لم ينشئ نفس الكود أو حساباً
  // لنفس الطرف في الأثناء — وإلا يُعاد البناء كاملاً داخل القفل (نفس السلوك القديم)
  get.stale = function (freshAccs) {
    if (!pending.length) return false;
    var fm = freshAccs.map, fl = {};
    freshAccs.list.forEach(function (a) {
      if (a.link && !a.isGroup) fl[a.kind + '|' + _glNorm_(a.link)] = 1;
      String(a.notes || '').replace(/⟦alias:([^|⟧]*)\|([^⟧]+)⟧/g, function (m, k2, n) { if (!a.isGroup) fl[k2 + '|' + _glNorm_(n)] = 1; return m; });
    });
    return pending.some(function (r, i) { return !!fm[r[0]] || !!fl[pendKeys[i]]; });
  };
  get.flush = function () {
    if (!pending.length) return 0;
    var sh = _glSheet_('accounts');
    sh.getRange(sh.getLastRow() + 1, 1, pending.length, GL_SHEETS_.accounts.headers.length).setValues(pending);
    var n = pending.length; pending = []; pendKeys = []; _GL_ACC_MEMO_ = null;
    return n;
  };
  get.pendingCount = function () { return pending.length; };
  get.made = function () { return madeNames; };
  get.tombHits = function () { return tombHits; };
  return get;
}
// 🏷️ (V4.285) خريطة: اسم الوكيل الخام (كما يُكتب بملفات التأشيرات/متابعة الوكلاء) ⟶ اسم حساب الوكيل
// الحالي بدليل الحسابات العامة — قد يختلف عن الاسم الخام لو أُعيد تسمية الحساب يدوياً، أو دُمجت عدة
// أسماء وكلاء/شركات بحساب واحد (⟦alias:agent|اسم آخر⟧ بملاحظات الحساب، أو ⟦alias:agent|وكيل - شركة⟧).
// للعرض فقط (إحصائيات) — لا تُنشئ أي حساب، وتُرجع خريطة فارغة بأمان لو الحسابات العامة غير مفعَّلة.
function _glAgentAccNames_() {
  var map = {};
  try {
    if (!_glSSId_()) return map;
    _glAccounts_().list.forEach(function (a) {
      if (a.isGroup || a.kind !== 'agent') return;
      if (a.link) map[_glNorm_(a.link)] = a.name;
      String(a.notes || '').replace(/⟦alias:agent\|([^⟧]+)⟧/g, function (m, n) { if (n) map[_glNorm_(n)] = a.name; return m; });
    });
  } catch (e) {}
  return map;
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
  if (/تنفيذ/.test(d)) return 'rev_exec';   // (V4.230) رسوم التنفيذ — قبل فحص رسوم الغرفة
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
function _glAutoBuild_(user, write, scope) {
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
  var tombN = 0;   // 🗂️ (V4.324) حركات لأطراف حُذفت حساباتها من الدليل ⇒ لا تُبنى قيودها (ولا تدخل الافتتاحي)
  var push = function (e) { if (e.lines.length < 2) return; if (_glTombOf_(e)) { tombN++; return; } out.push(e); };

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
    if (ACC_HB_RX_.test(_glStr_(r[3]))) return;   // 🏨 (V4.326) حجز فندقي له قيده AUTO:HB ⇒ خارج قيد الرحلة المجمّع (لا تكرار على العميل)
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

  // ⚡ (V4.236) scope='cp': توجيه/حذف دفعات العملاء يحتاج قسم العملاء فقط — لا قراءة للوكلاء/الوزارة/الحجوزات
  var files = [], tRows = [], tPrices = [], mfFiles = [], receipts = [], hbOut = [];
  if (scope !== 'cp') {
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
    if (GL_AP_TAG_RX_.test(it.notes)) return;   // 🧑‍💼 (V4.328) نسخة قيد بالحسابات العامة — قيدها هو القيد نفسه
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
    if (GL_AP_TAG_RX_.test(p.notes)) return;   // 🧑‍💼 (V4.328) نسخة سند/قيد بالحسابات العامة — لا يُقيَّد مرتين
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
    // 🏛️ (V4.230) ملف «رسوم تنفيذ»: لا يُسجَّل رسم الغرفة محاسبياً على الرحلة/العميل — يُحاسَب العميل
    // برسم تنفيذ ثابت للفرد (بند تسعير عميل «رسوم التنفيذ») يصل للدفتر عبر بنود حساب العميل (AUTO:TRIP/CI).
    // ورسم الغرفة الفعلي يظل مسحوباً من رصيد إيداعات الشركة بشاشة رسوم الغرفة فقط (بلا قيد).
    if (f.execFee) return;
    var c = _mfCompute_(f, cfg), v = _glR2_(c.totalRoomFee); if (!v) return;
    var acc = party('roomfee', f.company);
    // 🧳 (V4.222) رسوم غرفة الملف على حساب الرحلة المرتبطة (موزّعة بعدد معتمري كل رحلة بالملف)
    if (tripMode) {
      var mTrips = _mfTripsOf_(f), N = _mfNum_(f.pilgrims), mAmt = Math.abs(v), ml = [];
      var mStmt = 'رسوم غرفة ' + f.company + ' (' + N + ' × ' + _glFmtN_(c.roomFeeEffective) + (c.murafiqFee ? ' + ' + c.murafiqFee + ' مرافق × ' + _glFmtN_(c.supRoomFee) : '') + ' = ' + _glFmtN_(mAmt) + ') ملف رقم ' + (f.fileNo || '—')
        // (V4.259) + «العنوان الظاهر» للملف (أو ملاحظاته لو فارغ) بآخر البيان
        + (_glStr_(f.clientLabel) ? ' — ' + _glStr_(f.clientLabel) : (_glStr_(f.notes) ? ' — ' + _glStr_(f.notes).slice(0, 80) : ''));
      if (mTrips.length) _glSplitByWeight_(mAmt, mTrips, _glTripWeights_(mTrips, f.breakdown)).forEach(function (x) {
        if (x.amt) ml.push(mkLine(party('trip', x.name), x.amt, v > 0, 'EGP', { trip: x.name, company: f.company, desc: mStmt + (mTrips.length > 1 ? ' — حصة ' + x.name + (x.w > 1 ? ' (' + x.w + ' معتمر)' : '') : '') }));
      });
      else { ml.push(mkLine(R('cost_room'), mAmt, v > 0, 'EGP', { company: f.company, desc: mStmt })); warn.push('ملف وزارة ' + (f.fileNo || '—') + ' بلا رحلة مرتبطة — سُجّلت رسومه على «رسوم غرفة الوزارة» العامة'); }
      ml.push(mkLine(acc, mAmt, v < 0, 'EGP', { trip: mTrips.length === 1 ? mTrips[0] : '', company: f.company, desc: mStmt }));
      push({ key: 'AUTO:MF:' + f.id, date: f.reviewDate, desc: mStmt + (mTrips.length ? ' — ' + mTrips.join('، ') : ''), trip: mTrips.length === 1 ? mTrips[0] : '', company: f.company, lines: ml, src: 'room' });
      return;
    }
    var tag = { trip: f.tripName, company: f.company, client: '', desc: 'رسوم غرفة ملف ' + (f.fileNo || '—') + (f.clientLabel ? ' (' + f.clientLabel + ')' : (_glStr_(f.notes) ? ' — ' + _glStr_(f.notes).slice(0, 80) : '')) };
    push({ key: 'AUTO:MF:' + f.id, date: f.reviewDate, desc: 'سحب رسوم الغرفة — ملف ' + (f.fileNo || '—') + ' — ' + f.company + (f.tripName ? ' — ' + f.tripName : ''), trip: f.tripName, company: f.company,
      lines: [mkLine(R('cost_room'), Math.abs(v), v > 0, 'EGP', tag), mkLine(acc, Math.abs(v), v < 0, 'EGP', tag)], src: 'room' });
  });

  /* ---------- 3ب) (V4.208) برنامج حجوزات الفنادق ---------- */
  var hbOut = [];
  if (_glHbOn_()) {
    try { hbOut = _glHbBuild_(roles, warn, party); }
    catch (e) { warn.push('تعذّرت قراءة برنامج حجوزات الفنادق: ' + e.message); }
    hbOut = hbOut.filter(function (e) { if (_glTombOf_(e)) { tombN++; return false; } return true; });   // 🗂️ (V4.324)
    // 🔀 (V4.217) «الـ ERP هو المصدر حتى تاريخ …»: حجوزات ودفعات ما قبله لا تُسجَّل من برنامج الحجوزات (ولا قيدها
    // الافتتاحي) لأنها داخلة بالفعل في الأرصدة/القيود المنقولة من الـ ERP — منعاً للتكرار
    var hbFromK = _glDKey_(_glDate_(set.hb_from || '')), hpp = _glHbPayPolicy_();
    // 💵 (V4.238) فصل مصدر الدفعات عن الحجوزات: دفعات الحجوزات قبل «hb_pay_from» مصدرها الـ ERP فلا تُسجَّل من برنامج
    // الحجوزات — عدا دفعات بلا مقابل بالـ ERP اختار المستخدم إبقاءها (hb_pay_keep)
    hbOut = hbOut.filter(function (e) {
      var k = _glDKey_(e.date);
      if (hbFromK && k < hbFromK) return false;
      if (hpp.fromK && k < hpp.fromK && /^AUTO:HB[PL]:/.test(e.key) && !hpp.keep[e.key]) return false;
      return true;
    });
  }

  /* ---------- 3ج) (V4.323) اتفاقيات الإعاشة ---------- */
  try { _glCatEntries_(R, accMap, set, warn).forEach(push); } catch (eCat) { warn.push('اتفاقيات الإعاشة: ' + eCat.message); }

  }   // scope

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
  // (V4.243) تحذيرات متكررة (مجموعة تأشيرات/ملف وزارة بلا رحلة) تُجمَّع في سطر واحد لكل نوع بدل مئات السطور
  var grpW = [[/^مجموعة تأشيرات (.*) بلا رحلة مرتبطة/, 'مجموعة تأشيرات بلا رحلة مرتبطة — سُجّلت على تكلفة التأشيرات العامة'],
    [/^ملف وزارة (.*) بلا رحلة مرتبطة/, 'ملف وزارة بلا رحلة مرتبطة — سُجّلت رسومه على «رسوم غرفة الوزارة» العامة']], grpRefs = [[], []];
  warn = warn.filter(function (w) { for (var gi = 0; gi < grpW.length; gi++) { var gm = String(w).match(grpW[gi][0]); if (gm) { grpRefs[gi].push(gm[1]); return false; } } return true; });
  grpW.forEach(function (g, gi) { var L = grpRefs[gi]; if (L.length) warn.push(L.length + ' ' + g[1] + ': ' + L.slice(0, 12).join('، ') + (L.length > 12 ? ' …و' + (L.length - 12) + ' غيرها' : '')); });
  if (tombN) { var tH = party.tombHits(), tL = _glAccDeleted_().tomb, tK = Object.keys(tH);   // 🗂️ (V4.324)
    warn.push(tombN + ' حركة لأطراف حُذفت حساباتها من دليل الحسابات لم تُسجَّل: ' + tK.slice(0, 8).map(function (k) { return '«' + ((tL[k] || {}).l || k.split('|').slice(1).join('|')) + '»'; }).join('، ') + (tK.length > 8 ? ' …و' + (tK.length - 8) + ' غيرهم' : '') +
      ' — لإعادة تسجيلها أنشئ حساباً جديداً مربوطاً بنفس الاسم'); }
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
  // ⚡ (V4.252) فتح الشيت للقراءة فقط — لا يُبطَل الكاش إلا لو هناك كتابة فعلية (المزامنة بلا تغيير لا تمس الإصدار)
  var eSh = _glSheetR_('entries'), lSh = _glSheetR_('lines');
  var eRows = _glRows_('entries'), existing = {};
  eRows.forEach(function (r, i) { var k = _glStr_(r[6]); if (/^AUTO:/.test(k)) existing[k] = i; });
  var res = { created: 0, updated: 0, voided: 0, same: 0, pending: 0, blocked: [], errors: [], samples: { created: [], updated: [], voided: [] }, createdList: [] };
  var creates = [], updates = [], voids = [];
  var want = {}, fxMap = _glFxDailyMap_(), defR = _glRates_();
  var only = opts.onlyKeys || null, approval = !opts.bypass && _glApprovalOn_(), onlyRx = opts.onlyRx || null;
  if (Array.isArray(only)) { var ok_ = {}; only.forEach(function (k) { ok_[k] = 1; }); only = ok_; }
  // (V4.238) onlyRx: قصر التطبيق على نمط مفاتيح (مثل دفعات الحجوزات) · onlyCV: إنشاء/إلغاء فقط بلا تعديل القيود القائمة
  var restricted = !!(only || onlyRx), inOnly = function (k) { return (!only || !!only[k]) && (!onlyRx || onlyRx.test(k)); };
  var ovr = _glOvrMap_(), anyFrozen = Object.keys(ovr).some(function (k) { return ovr[k].freeze; }), frozenQ = {}, unfrozen = [];   // ✍️ (V4.319)
  var pend = (approval || anyFrozen) ? _glPendingRows_() : {}, newPend = {}, oldLines = null, accM = _glAccounts_().map;
  var newDate = '', newType = '';
  var oldOf = function (id) { if (!oldLines) { oldLines = {}; _glRows_('lines').forEach(function (l) { (oldLines[_glStr_(l[0])] = oldLines[_glStr_(l[0])] || []).push(l); }); } return oldLines[id] || []; };
  var queue = function (k, ix, kind, newDesc, newBase, hash, newLines, hint) {   // تغيير ينتظر الاعتماد (الرفض السابق لنفس البصمة يبقى مرفوضاً)
    var r = eRows[ix], old = pend[k];
    if (old && _glStr_(old.row[9]) === 'مرفوض' && _glStr_(old.row[7]) === hash) { newPend[k] = old.row; return; }
    if (!oldLines) { oldLines = {}; _glRows_('lines').forEach(function (l) { (oldLines[_glStr_(l[0])] = oldLines[_glStr_(l[0])] || []).push(l); }); }
    newPend[k] = [k, _glStr_(r[0]), kind, _glStr_(r[4]), _glNum_(r[8]), newDesc, newBase, hash, old && _glStr_(old.row[7]) === hash ? old.row[8] : _glNow_(), 'بانتظار', '', '',
      _glAmtTxt_(oldLines[_glStr_(r[0])] || [], accM), newLines ? _glAmtTxt_(newLines, accM) : '0',
      (kind === 'تعديل' && hint ? hint + '\n' : '') + _glLinesDiff_(r, oldLines[_glStr_(r[0])] || [], newLines, accM, { date: newLines && newDate, type: newType, desc: newLines && newDesc, hint: hint || '' })];   // (V4.319) سبب ✋ للتعديل أيضاً
    res.pending++;
  };
  // (V4.223) تغيّر شكلي فقط (بيان سطر الوسيط بين العملات — مثلاً بعد دمج/إعادة تسمية حساب) يُحدَّث بلا انتظار اعتماد
  var looseH = function (date, type, desc, trip, co, ls) {
    // (V4.226) بيانات الأسطر نفسها (نص البيان فقط) شكلية أيضاً — الحساب والمبلغ والعملة والسعر والوسوم وبيان القيد تبقى جوهرية
    return _glHash_(JSON.stringify([date, type, desc, trip, co, ls.map(function (l) { return JSON.stringify([l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8]]); }).sort()]));   // ترتيب الأسطر شكلي أيضاً
  };
  var cosmetic = function (r, e, v) {   // e: {desc, trip, company} الفعلية (بعد القواعد اليدوية)
    if (!oldLines) { oldLines = {}; _glRows_('lines').forEach(function (l) { (oldLines[_glStr_(l[0])] = oldLines[_glStr_(l[0])] || []).push(l); }); }
    var num = function (x) { return x === '' || x == null ? 0 : _glNum_(x); };
    var o = (oldLines[_glStr_(r[0])] || []).map(function (l) { return [_glStr_(l[4]), num(l[5]), num(l[6]), _glStr_(l[7]), _glNum_(l[8]), _glStr_(l[11]), _glStr_(l[12]), _glStr_(l[13]), _glStr_(l[14]), _glStr_(l[15])]; });
    var n = v.lines.map(function (l) { return [l.account, l.debit, l.credit, l.currency, l.rate, l.trip, l.company, l.client, l.agent, l.desc]; });
    return o.length && looseH(_glDate_(r[2]), _glStr_(r[3]), _glStr_(r[4]), _glStr_(r[10]), _glStr_(r[11]), o) === looseH(v.date, v.type, e.desc, e.trip || '', e.company || '', n);
  };
  var keepErp = _glHbKeepMap_(), unkeep = [];
  built.entries.forEach(function (e) {
    if (ovr[e.key] && ovr[e.key].keep) unkeep.push(e.key);   // ✅ (V4.323 مراجعة) عاد مصدره ⇒ تنتهي قاعدة «الإبقاء» (حذفه لاحقاً يُقترح إلغاؤه من جديد)
    if (restricted && !inOnly(e.key)) { want[e.key] = 1; return; }
    if (want[e.key]) { res.errors.push({ key: e.key, msg: 'مفتاح مكرر' }); return; }
    want[e.key] = 1;
    if (keepErp[e.key]) { res.same++; return; }   // (V4.227) اعتُمد قيد الـ ERP بدلاً منه — لا يُنشأ ولا يُعدَّل
    var x = ovr[e.key];
    if (x && x.vd) { res.same++; return; }   // ✍️ (V4.319) أُلغي يدوياً — لا يُعاد إنشاؤه ولا ترحيله
    if (!e._pv) _glAutoPrepOne_(e, fxMap, defR);
    if (e._pv.err) { res.errors.push({ key: e.key, date: e.date, desc: e.desc, msg: e._pv.err }); return; }
    var hash = e._pv.hash, eff = (x && (x.acc.length || x.hdr)) ? _glOvrEff_(e, x, accM) : null;
    var v = eff ? eff.v : e._pv.v, H = eff ? { desc: eff.desc, trip: eff.trip, company: eff.company } : { desc: e.desc, trip: e.trip || '', company: e.company || '' };
    if (eff && eff.warn) { res.errors.push({ key: e.key, date: e.date, desc: e.desc, msg: '⚠️ لم يُطبَّق التعديل اليدوي (' + eff.warn + ') — سُجّل كما في المصدر' }); hash = hash + '|ovr-fail'; }   // بصمة مختلفة ⇒ يُعاد المحاولة بالمزامنة التالية
    var ix = existing[e.key];
    if (ix === undefined) {
      if (_glLocked_(v.date)) { res.blocked.push({ key: e.key, date: v.date, desc: H.desc, why: 'حدث جديد بفترة مقفلة' }); return; }
      creates.push({ e: e, v: v, hash: hash, H: H }); res.created++; if (e.key.indexOf('AUTO:HB:') === 0) res.hbTouched = 1;
      if (res.samples.created.length < 30) res.samples.created.push({ date: v.date, desc: H.desc, base: v.totalBase, amt: _glAmtTxt_(v.lines, accM) });
      return;
    }
    var r = eRows[ix];
    if (_glStr_(r[5]) === GL_ST_POSTED_ && _glStr_(r[9]) === hash) { res.same++; return; }
    if (opts.onlyCV && opts.onlyCV.test(e.key)) { res.same++; return; }   // (V4.238) تصحيح المصادر: لا يعدّل قيود الدفعات القائمة
    if (_glLocked_(r[2]) || _glLocked_(v.date)) { res.blocked.push({ key: e.key, date: v.date, desc: H.desc, why: 'تغيّر مصدره بعد إقفال الفترة' }); return; }
    // ✍️ (V4.319) قيد عُدِّل جوهرياً يدوياً (مبالغ/تاريخ/أسطر) وتغيّر مصدره ⇒ دائماً للاعتماد (بأي وضع وبأي مسار مباشر) إلا عند اعتماده هو صراحة
    if (x && x.freeze && _glStr_(r[5]) === GL_ST_POSTED_) {
      if (!(opts.approveKeys && opts.approveKeys[e.key])) { newDate = v.date; newType = v.type; queue(e.key, ix, 'تعديل', H.desc, v.totalBase, hash, v.lines, '✋ قيد معدَّل يدوياً وتغيّر مصدره — الاعتماد يستبدل التعديل اليدوي بالمصدر (مع إبقاء تغييرات الحسابات/البيان)، والرفض يُبقي تعديلك'); frozenQ[e.key] = 1; return; }
      unfrozen.push(e.key);
    }
    else if (approval && _glStr_(r[5]) === GL_ST_POSTED_ && !cosmetic(r, H, v)) { newDate = v.date; newType = v.type; queue(e.key, ix, 'تعديل', H.desc, v.totalBase, hash, v.lines); return; }
    updates.push({ ix: ix, e: e, v: v, hash: hash, H: H }); res.updated++; if (e.key.indexOf('AUTO:HB:') === 0) res.hbTouched = 1;
    if (res.samples.updated.length < 30) res.samples.updated.push({ id: _glStr_(r[0]), date: v.date, desc: H.desc, base: v.totalBase, oldBase: _glNum_(r[8]), amt: _glAmtTxt_(v.lines, accM), oldAmt: _glAmtTxt_(oldOf(_glStr_(r[0])), accM) });
  });
  Object.keys(existing).forEach(function (k) {
    if (want[k] || (restricted && !inOnly(k))) return;
    var r = eRows[existing[k]];
    if (_glStr_(r[5]) === GL_ST_VOID_) return;
    if (ovr[k] && ovr[k].keep) {   // ✅ (V4.323) حُفظ يدوياً بعد حذف مصدره ⇒ يبقى كما هو بالمزامنة العادية
      if (!(only && only[k]) && !(opts.approveKeys && opts.approveKeys[k])) { res.same++; return; }
      unkeep.push(k);   // حذف صريح للمصدر من شاشته (تشغيل مقصور على مفتاحه) أو اعتماد صريح لإلغائه ⇒ يتقدّم على «الإبقاء»
    }
    if (_glLocked_(r[2])) { res.blocked.push({ key: k, date: _glDate_(r[2]), desc: _glStr_(r[4]), why: 'حُذف مصدره بعد إقفال الفترة' }); return; }
    if (ovr[k] && ovr[k].freeze && !(opts.approveKeys && opts.approveKeys[k])) { queue(k, existing[k], 'إلغاء', 'حُذف مصدره من شاشات البرنامج', 0, 'void', null, '✋ قيد معدَّل يدوياً وحُذف مصدره'); frozenQ[k] = 1; return; }   // ✍️ (V4.319)
    if (ovr[k] && ovr[k].freeze) unfrozen.push(k);   // اعتُمد إلغاؤه ⇒ ينتهي التجميد
    if (approval) {
      // 🔎 (V4.305) إلغاء قيد حساب عميل لأن العميل نُقل لرحلة أخرى (قيدها الجديد أُنشئ بنفس المزامنة) ⇒ يُذكر ذلك صراحة
      var vh = '', mT = k.match(/^AUTO:(?:TRIP|CI):(.*)\|([^|]*)$/);
      if (mT) { var to = creates.filter(function (c) { return c.e.key.indexOf('AUTO:TRIP:' + mT[1] + '|') === 0 || c.e.key.indexOf('AUTO:CI:' + mT[1] + '|') === 0; }).map(function (c) { return c.e.key.split('|').pop(); }).filter(function (t) { return t && t !== mT[2]; });
        if (to.length) vh = '🔸 الرحلة: ' + mT[2] + ' ← ' + to.join('، ') + ' (نُقل العميل لرحلة أخرى)'; }
      queue(k, existing[k], 'إلغاء', 'حُذف مصدره من شاشات البرنامج', 0, 'void', null, vh); return;
    }
    voids.push(existing[k]); res.voided++; if (k.indexOf('AUTO:HB:') === 0) res.hbTouched = 1;
    if (res.samples.voided.length < 30) res.samples.voided.push({ id: _glStr_(r[0]), date: _glDate_(r[2]), desc: _glStr_(r[4]), base: _glNum_(r[8]), amt: _glAmtTxt_(oldOf(_glStr_(r[0])), accM) });
  });
  // قائمة الاعتماد: تُستبدل كاملة بما يحتاج اعتماداً الآن (ما عاد مصدره كما كان يخرج منها تلقائياً)
  if (!dry && approval && !restricted) {
    // 🐛 (V4.319) القائمة كانت تُستبدل بمفاتيح AUTO فقط فتسقط صفوف مراجعة العملة (CCY:) وغيرها — تُرحَّل كما هي
    Object.keys(pend).forEach(function (k) { if (!/^AUTO:/.test(k) && !newPend[k]) newPend[k] = pend[k].row; });
    if (_glPendSame_(pend, newPend)) { try { CacheService.getScriptCache().put('gl_pend_n', String(Object.keys(newPend).filter(function (k) { return _glStr_(newPend[k][9]) !== 'مرفوض'; }).length), 21600); } catch (eC) {} }
    else _glPendingWrite_(newPend);   // ⚡ (V4.236) لا إعادة كتابة لقائمة الاعتماد بكل مزامنة إن لم تتغيّر
  } else if (!dry && (Object.keys(frozenQ).length || anyFrozen)) {
    // ✍️ (V4.319) بلا وضع الاعتماد (أو تشغيل مقصور): دمج صفوف القيود المعدَّلة يدوياً فقط، وإسقاط صفوفها التي عاد مصدرها كما كان
    var cur0 = _glPendingRows_(), mg = {}, chg = false;
    Object.keys(cur0).forEach(function (k) {
      if (/^AUTO:/.test(k) && ovr[k] && ovr[k].freeze && !frozenQ[k] && want[k] && (!restricted || inOnly(k)) && !approval) { chg = true; return; }
      mg[k] = cur0[k].row;
    });
    Object.keys(frozenQ).forEach(function (k) { if (!mg[k] || _glStr_(mg[k][7]) !== _glStr_(newPend[k][7]) || _glStr_(mg[k][9]) === 'مرفوض' && _glStr_(newPend[k][9]) !== 'مرفوض') { mg[k] = newPend[k]; chg = true; } });
    if (chg) _glPendingWrite_(mg);
  }
  if (!dry && only) _glPendingDrop_(Object.keys(only).filter(function (k) { return !frozenQ[k]; }));
  if (!dry && unfrozen.length) _glOvrDrop_(unfrozen, ['freeze']);   // اعتُمد مصدره ⇒ ينتهي التجميد (تبقى قواعد الحساب/البيان)
  if (!dry && unkeep.length) _glOvrDrop_(unkeep, ['keep']);
  res.manualPending = Object.keys(frozenQ).length;
  if (dry || (!creates.length && !updates.length && !voids.length)) return res;
  _glTouch_('entries');
  // الكتابة: رؤوس القيود بمصفوفة واحدة، وأسطر القيود المتغيّرة تُستبدل بإعادة كتابة الشيت كاملاً مرة واحدة
  var now = _glNow_(), replaced = {}, voidIds = {};
  updates.forEach(function (u) {
    var r = eRows[u.ix], id = _glStr_(r[0]);
    var w = _glWriteEntry_(u.v, { id: id, seq: r[1], status: GL_ST_POSTED_, sourceKey: u.e.key, desc: u.H.desc, ref: u.hash, trip: u.H.trip, company: u.H.company,
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
      var w = _glWriteEntry_(c.v, { id: id, seq: first + i, status: GL_ST_POSTED_, sourceKey: c.e.key, desc: c.H.desc, ref: c.hash, trip: c.H.trip, company: c.H.company }, user);
      newE.push(w.eRow); newL = newL.concat(w.lRows);
      res.createdList.push({ id: id, desc: c.H.desc, base: c.v.totalBase, src: c.e.src || '', key: c.e.key });
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
/* ✍️ (V4.319) كل القيود قابلة للتعديل بلا استثناء — بما فيها التلقائية — دون أن تمسح المزامنة التعديل لاحقاً.
   القيد التلقائي يُعاد بناؤه من مصدره كلما تغيّر المصدر (بصمته بعمود المرجع) فكان أي تعديل يدوي يضيع بصمت. الآن يُحفظ
   التعديل كـ«قاعدة دائمة» لمفتاح القيد بشيت GL_AutoOverride، وتُطبَّق القواعد فوق ما يبنيه المصدر في كل مزامنة:
   • acc: تغيير حساب سطر (يُعرَّف السطر بحسابه الأصلي + العملة + الجانب [+ بيانه]) ⇒ يبقى التغيير ويتدفق ما يتغيّر بالمصدر (المبالغ…)
   • hdr: البيان/الرحلة/الشركة · freeze: تعديل جوهري آخر (مبالغ/تاريخ/أسطر) ⇒ تغيّر المصدر يذهب لقائمة الاعتماد دائماً
     (الاعتماد يستبدل التعديل اليدوي بالمصدر مع إبقاء قواعد الحساب/الرأس، والرفض يُبقي التعديل) · void: إلغاء يدوي ⇒ لا يُعاد ترحيله
   البصمة بعمود المرجع تبقى بصمة المصدر الخام (قبل القواعد) فلا يتغيّر سلوك القيود غير المعدَّلة إطلاقاً. «↺ إعادة للتلقائي» يحذف القواعد */
function _glOvrMap_() {
  var o = {};
  try {
    _glRowsW_('autoovr').forEach(function (r) {
      var k = _glStr_(r[0]), t = _glStr_(r[1]); if (!k || !t) return;
      var x = (o[k] = o[k] || { acc: [], hdr: null, freeze: null, vd: null });
      var meta = { by: _glStr_(r[9]), at: _glStr_(r[10]) };
      if (t === 'acc') x.acc.push({ lineNo: +r[2] || 0, from: _glStr_(r[3]), to: _glStr_(r[4]), cur: _glCur_(r[5] || 'EGP'), side: _glStr_(r[6]) === 'C' ? 'C' : 'D', desc: _glStr_(r[7]), by: meta.by, at: meta.at });
      else if (t === 'hdr') { try { x.hdr = JSON.parse(_glStr_(r[8]) || '{}'); x.hdrMeta = meta; } catch (e) {} }
      else if (t === 'freeze') x.freeze = meta;
      else if (t === 'void') x.vd = { by: meta.by, at: meta.at, note: _glStr_(r[8]) };
      else if (t === 'keep') x.keep = meta;   // ✅ (V4.323) حُذف مصدره وحفظه المستخدم يدوياً ⇒ يبقى ولا يُلغى بالمزامنة
    });
  } catch (e) {}
  return o;
}
function _glOvrSave_(map) {
  var rows = [];
  Object.keys(map).forEach(function (k) {
    var x = map[k]; if (!x) return;
    (x.acc || []).forEach(function (a) { if (a.from && a.to && a.from !== a.to) rows.push([k, 'acc', a.lineNo || '', a.from, a.to, a.cur || 'EGP', a.side || 'D', a.desc || '', '', a.by || '', a.at || '']); });
    if (x.hdr && Object.keys(x.hdr).length) rows.push([k, 'hdr', '', '', '', '', '', '', JSON.stringify(x.hdr), (x.hdrMeta || {}).by || '', (x.hdrMeta || {}).at || '']);
    if (x.freeze) rows.push([k, 'freeze', '', '', '', '', '', '', '', x.freeze.by || '', x.freeze.at || '']);
    if (x.vd) rows.push([k, 'void', '', '', '', '', '', '', x.vd.note || '', x.vd.by || '', x.vd.at || '']);
    if (x.keep) rows.push([k, 'keep', '', '', '', '', '', '', '', x.keep.by || '', x.keep.at || '']);
  });
  var sh = _glSheet_('autoovr'), W = GL_SHEETS_.autoovr.headers.length, last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, W).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, W).setNumberFormat('@').setValues(rows);
}
// قيد شيت عهدة/خزينة/بنك (CUST:): تغيير الطرف المقابل يدوياً يُحفظ بمفتاح القيد نفسه (مفتاح المصدر مشترك بين كل صفوف الشيت)
function _glCsOvrRecord_(sk, id, oldRows, newRows, user) {
  var code = sk.replace(/^CUST:/, ''), pick = function (rows) { return (rows || []).filter(function (r) { return _glStr_(r[4]) !== code; }).map(function (r) { return _glStr_(r[4]); }); };
  var o = pick(oldRows), n = pick(newRows); if (!o.length || !n.length || o[0] === n[0]) return false;
  var m = _glOvrMap_(), k = sk + '#' + id, x = m[k] || (m[k] = { acc: [], hdr: null, freeze: null, vd: null });
  x.acc = [{ lineNo: 0, from: (x.acc[0] && x.acc[0].from) || o[0], to: n[0], cur: 'EGP', side: 'D', desc: '', by: user, at: _glNow_() }];
  if (x.acc[0].from === x.acc[0].to) x.acc = [];
  _glOvrSave_(m); return true;
}
function _glOvrDrop_(keys, kinds) {   // kinds: ['freeze'] … أو بلا ⇒ كل القواعد
  var set = {}; (keys || []).forEach(function (k) { set[k] = 1; });
  var m = _glOvrMap_(), ch = false;
  Object.keys(set).forEach(function (k) {
    if (!m[k]) return;
    if (!kinds) { delete m[k]; ch = true; return; }
    kinds.forEach(function (t) { if (t === 'acc' && m[k].acc.length) { m[k].acc = []; ch = true; } else if (t === 'hdr' && m[k].hdr) { m[k].hdr = null; ch = true; } else if (t === 'freeze' && m[k].freeze) { m[k].freeze = null; ch = true; } else if (t === 'void' && m[k].vd) { m[k].vd = null; ch = true; } else if (t === 'keep' && m[k].keep) { m[k].keep = null; ch = true; } });
  });
  if (ch) _glOvrSave_(m);
  return ch;
}
// ✅ (V4.323) قيد تلقائي حُذف مصدره وعُدِّل/حُفظ يدوياً بدل اعتماد إلغائه ⇒ يبقى كما حُفظ (لا يُلغى ولا يُقترح إلغاؤه)
function _glOvrKeep_(key, user) {
  var m = _glOvrMap_(), x = m[key] || (m[key] = { acc: [], hdr: null, freeze: null, vd: null });
  x.keep = { by: user, at: _glNow_() }; _glOvrSave_(m);
}
// القيد الفعلي = ما بناه المصدر + القواعد اليدوية (لا يمس البصمة الخام e._pv.hash)
function _glOvrEff_(e, x, accM) {
  var lines = (e.lines || []).map(function (l) { var c = {}; for (var k in l) c[k] = l[k]; return c; }), done = {}, applied = 0;
  var side = function (l) { return _glNum_(l.debit) ? 'D' : 'C'; };
  var curOf = function (l) { return _glCur_(l.currency || ((accM[_glStr_(l.account)] || {}).currency) || 'EGP'); };
  (x.acc || []).forEach(function (a) {
    var c = []; lines.forEach(function (l, i) { if (!done[i] && _glStr_(l.account) === a.from && curOf(l) === a.cur && side(l) === a.side) c.push(i); });
    if (c.length > 1 && a.desc) { var d = c.filter(function (i) { return _glStr_(lines[i].desc || e.desc) === a.desc; }); if (d.length) c = d; }
    if (c.length > 1) { var byN = c.filter(function (i) { return i + 1 === a.lineNo; }); c = [byN.length ? byN[0] : c[0]]; }   // القاعدة لسطر واحد فقط (السطر الذي عدّله المستخدم)
    var fk = (accM[a.from] || {}).kind, party = fk === 'client' || fk === 'agent' || fk === 'supplier';
    c.forEach(function (i) { lines[i].account = a.to; if (party) { lines[i].client = ''; lines[i].agent = ''; } done[i] = 1; applied++; });
  });
  var h = x.hdr || {}, desc = h.desc !== undefined ? h.desc : e.desc, trip = h.trip !== undefined ? h.trip : (e.trip || ''), co = h.company !== undefined ? h.company : (e.company || '');
  try {
    var v = _glValidate_({ date: e.date, type: e.type || 'قيد تلقائي', desc: desc, trip: trip, company: co, lines: lines }, { allowBeforeStart: true, ignoreLock: true, allowSystem: true });
    return { v: v, desc: desc, trip: trip, company: co, applied: applied };
  } catch (err) { return { v: e._pv.v, desc: e.desc, trip: e.trip || '', company: e.company || '', warn: err.message }; }   // حساب القاعدة حُذف/أوقف ⇒ المصدر كما هو
}
// يُستدعى من glSaveEntry لقيد تلقائي: يقارن الأسطر القديمة بالجديدة ويسجّل القاعدة المناسبة
function _glOvrRecord_(key, f, oldRows, v, e, user) {
  var m = _glOvrMap_(), x = m[key] || (m[key] = { acc: [], hdr: null, freeze: null, vd: null }), now = _glNow_(), ch = false;
  var old = (oldRows || []).slice().sort(function (a, b) { return (+a[1] || 0) - (+b[1] || 0); }), nl = v.lines || [];
  var eq = function (a, b) { return Math.abs(_glNum_(a) - _glNum_(b)) < 0.005; };
  var structural = _glDate_(f.r[2]) !== v.date || old.length !== nl.length;
  // سعر الصرف (المحفوظ بخانتين) جوهري أيضاً — تعديله يدوياً كان يضيع بصمت مع أول إعادة بناء · بيان السطر شكلي
  if (!structural) old.forEach(function (o, i) { var n = nl[i]; if (!eq(o[5], n.debit) || !eq(o[6], n.credit) || _glCur_(o[7]) !== _glCur_(n.currency) || (_glCur_(n.currency) !== 'EGP' && Math.abs(_glNum_(o[8]) - _glNum_(n.rate)) >= 0.005)) structural = true; });
  if (structural && !x.freeze) { x.freeze = { by: user, at: now }; ch = true; }
  // تغيير الحسابات يُسجَّل قاعدةً حتى مع تعديل جوهري بنفس الحفظ (نفس عدد الأسطر) — فيبقى بعد اعتماد تغيّر المصدر كما يَعِد التنبيه
  if (old.length === nl.length) old.forEach(function (o, i) {
    var oa = _glStr_(o[4]), na = _glStr_(nl[i].account); if (oa === na) return;
    var cur = _glCur_(o[7]), sd = _glNum_(o[5]) ? 'D' : 'C', ds = _glStr_(o[15]);
    var exs = x.acc.filter(function (a) { return a.to === oa && a.cur === cur && a.side === sd; }), ex = exs.filter(function (a) { return a.desc === ds; })[0] || exs[0];   // البيان قد يتغيّر (تعديل الرأس) فلا يُشترط
    if (ex) { ex.to = na; ex.by = user; ex.at = now; if (ex.to === ex.from) x.acc.splice(x.acc.indexOf(ex), 1); }
    else x.acc.push({ lineNo: i + 1, from: oa, to: na, cur: cur, side: sd, desc: ds, by: user, at: now });
    ch = true;
  });
  var hd = { desc: [_glStr_(f.r[4]), e.desc], trip: [_glStr_(f.r[10]), e.trip], company: [_glStr_(f.r[11]), e.company] };
  Object.keys(hd).forEach(function (k) { var nv = hd[k][1]; if (nv === undefined || _glStr_(nv) === hd[k][0]) return; x.hdr = x.hdr || {}; x.hdr[k] = _glStr_(nv); x.hdrMeta = { by: user, at: now }; ch = true; });
  if (ch) _glOvrSave_(m);
  return ch;
}
/* 🍽️ (V4.323) اتفاقيات الإعاشة ⇒ قيد تلقائي AUTO:CAT:<معرف الاتفاقية> (المعرف ثابت حتى لو تغيّر رقم الاتفاقية):
   من ح/ العميل أو الرحلة بسعر البيع — إلى ح/ المورد بسعر التكلفة (= إجمالي الاتفاقية) — والفرق (إن وُجد) إلى ح/ «فروق اتفاقيات
   الإعاشة» (إيرادات العمرة، قابل للتغيير من الإعدادات): فرق موجب دائن (ربح) وسالب مدين. يُسجَّل فقط لو حُدِّد بالاتفاقية حساب المورد
   وحساب العميل/الرحلة والإجمالي. المبالغ بالريال؛ سعر البيع الفارغ = سعر التكلفة (بلا فرق). حساب بعملة ثابتة غير الريال يُسجَّل بعملته
   بسعر صرف تاريخ الاتفاقية (كل أسطر القيد عندها بنفس سعر الريال فيتوازن المعادل). يُبنى بنفس الدالة بالمزامنة الكاملة وبالحفظ الفوري. */
function _glCatEntries_(roleOf, accMap, set, warn) {
  var out = [], rows = [];
  try { var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS); if (sh.getLastRow() >= 2) rows = sh.getRange(2, 1, sh.getLastRow() - 1, CATERING_HEADERS.length).getValues(); }
  catch (e) { warn.push('تعذّرت قراءة اتفاقيات الإعاشة: ' + e.message); return out; }
  var rates = _glRates_(), fx = null;
  var fixedCur = function (code) { var a = accMap[code] || {}; return a.currency && _glCur_(a.currency) !== 'SAR' ? _glCur_(a.currency) : ''; };
  rows.forEach(function (r) {
    var id = _glStr_(r[20]), no = _glStr_(r[0]), ven = _glStr_(r[21]), tgt = _glStr_(r[22]);
    if (!id || !no || !ven || !tgt) return;
    var cost = _glR2_(_accNum_(r[8])); if (!(cost > 0)) return;
    var va = accMap[ven], ta = accMap[tgt];
    if (!va || va.isGroup || !va.active) { warn.push('اتفاقية إعاشة ' + no + ': حساب المورد «' + ven + '» غير موجود أو موقوف — لم تُسجَّل'); return; }
    if (!ta || ta.isGroup || !ta.active) { warn.push('اتفاقية إعاشة ' + no + ': حساب العميل/الرحلة «' + tgt + '» غير موجود أو موقوف — لم تُسجَّل'); return; }
    var sell = _glR2_(_accNum_(r[23])); if (!(sell > 0)) sell = cost;
    var date = _glAutoDate_(r[4]) || _glAutoDate_(r[13]) || set.startDate, diff = _glR2_(sell - cost), dAcc = diff ? roleOf('cat_diff') : '';
    var trip = ta.kind === 'trip' ? (ta.link || ta.name) : '', company = _glStr_(r[10]), pil = _accNum_(r[6]), days = _accNum_(r[3]);
    var stmt = 'اتفاقية إعاشة ' + no + ' — ' + (_glStr_(r[1]) || va.name) + (_glStr_(r[2]) ? ' — ' + _glStr_(r[2]) : '') + (pil ? ' — ' + pil + ' معتمر' : '') + (days ? ' × ' + days + ' يوم' : '');
    var conv = !!(fixedCur(tgt) || fixedCur(ven) || (dAcc && fixedCur(dAcc))), rS = rates.SAR;
    if (conv) { if (!fx) fx = _glFxDailyMap_(); rS = _glFxRateAt_('SAR', date, fx).rate || rates.SAR; }
    var line = function (acc, amt, dr, d) {
      var c = conv ? fixedCur(acc) : '', o;
      if (!c) o = { account: acc, debit: dr ? amt : 0, credit: dr ? 0 : amt, currency: 'SAR', rate: rS, desc: d };
      else { var rc = c === 'EGP' ? 1 : (_glFxRateAt_(c, date, fx).rate || rates[c]), v = _glR2_(amt * rS / rc);
        // 🐛 (V4.323 مراجعة) السعر الفعلي الضمني (معادل الريال ÷ المبلغ المقرَّب) كما في glSaveEntriesBulk — بسعر العملة المقرَّب كان
        // معادل السطر الأجنبي يختلف عن معادل سطر الريال بقروش ⇒ «القيد غير متوازن بعملة الأساس» لحسابات الدولار
        o = { account: acc, debit: dr ? v : 0, credit: dr ? 0 : v, currency: c, rate: v ? amt * rS / v : rc, desc: d + ' (' + _glFmtN_(amt) + ' ريال × ' + rS + ')' }; }
      if (conv) o.exact = 1;
      if (trip) o.trip = trip; if (company) o.company = company;
      return o;
    };
    var L = [line(tgt, sell, true, stmt + ' — سعر البيع'), line(ven, cost, false, stmt + ' — سعر التكلفة')];
    if (diff) L.push(line(dAcc, Math.abs(diff), diff < 0, stmt + ' — فرق البيع والتكلفة'));
    out.push({ key: 'AUTO:CAT:' + id, date: date, desc: stmt + ' — ' + (ta.name || tgt), trip: trip, company: company, lines: L, src: 'catering' });
  });
  return out;
}
// 🍽️ (V4.323) نقل/دمج حساب ⇒ تُحدَّث أكواده المحفوظة باتفاقيات الإعاشة (حساب المورد + حساب العميل/الرحلة) بكتابة واحدة
function _glCatRecode_(map) {
  if (!map || !Object.keys(map).length || typeof CATERING_SHEET === 'undefined') return 0;
  var sl = LockService.getScriptLock(), had = false; try { had = sl.hasLock(); } catch (e0) {}
  if (!had) try { sl.tryLock(15000); } catch (e1) {}   // 🔒 (V4.323 مراجعة) نفس قفل حذف/دمج صفوف الاتفاقيات (كتابة بموضع الصف)
  try {
    var sh = _accSheet_(CATERING_SHEET, CATERING_HEADERS), last = sh.getLastRow(); if (last < 2) return 0;
    var rg = sh.getRange(2, 22, last - 1, 2), v = rg.getValues(), n = 0;
    v.forEach(function (r) { for (var i = 0; i < 2; i++) { var c = _glStr_(r[i]); if (c && map[c]) { r[i] = map[c]; n++; } } });
    if (n) rg.setNumberFormat('@').setValues(v);
    return n;
  } finally { if (!had) try { sl.releaseLock(); } catch (e2) {} }
}
// 🍽️ (V4.323) تسجيل/تحديث/إلغاء قيود اتفاقيات محددة فوراً عند حفظها أو حذفها (بلا انتظار المزامنة وبلا قائمة اعتماد — الحفظ اعتماد)
// يقرأ شيت الاتفاقيات فقط (ثوانٍ) ويطبّق مفاتيحها وحدها. لو قفل الحسابات مشغول ⇒ علامة «تغيّر» فتلتقطها المزامنة التالية
// 🛡️ (V4.323 مراجعة) • القفل مشغول طويلاً (مزامنة كاملة) ⇒ تُحفظ المعرّفات بطابور دائم (gl_cat_q) يُطبَّق بنفس الأسلوب (الحفظ = اعتماد)
// أول ما تأخذ أي مزامنة القفل — بدل تركها للمزامنة العادية التي ترسل التعديل/الحذف لقائمة الاعتماد
// • ختم gl_cat_at بعد كل تطبيق ⇒ بناء بدأ قبله خارج القفل (بيانات اتفاقيات قديمة) يُرفض ويُعاد البناء داخل القفل
// • gl_dirty بعد كل حفظ ⇒ المزامنة التالية تُكمل ما لا يُرحَّل فوراً (اتفاقيات قبل تاريخ البداية ⇒ قيد الأرصدة الافتتاحية)
var GL_CATQ_P_ = 'gl_cat_q';
function _glCatQAdd_(ids) {
  try {
    var sl = LockService.getScriptLock(), had = false; try { had = sl.hasLock(); } catch (e0) {}
    if (!had) sl.tryLock(5000);
    try {
      var P = PropertiesService.getScriptProperties(), q = []; try { q = JSON.parse(P.getProperty(GL_CATQ_P_) || '[]'); } catch (e1) {}
      ids.forEach(function (id) { if (q.indexOf(id) < 0) q.push(id); });
      P.setProperty(GL_CATQ_P_, JSON.stringify(q.slice(-500)));
    } finally { if (!had) try { sl.releaseLock(); } catch (e2) {} }
  } catch (e) {}
}
// داخل قفل الحسابات: يطبّق طابور الاتفاقيات المؤجَّل (إن وُجد) قبل المزامنة
function _glCatFlushQ_(user) {
  var q = [];
  try { var P = PropertiesService.getScriptProperties(); q = JSON.parse(P.getProperty(GL_CATQ_P_) || '[]'); if (q.length) P.deleteProperty(GL_CATQ_P_); } catch (e) { q = []; }
  if (!q.length) return null;
  try { return _glCatApplyLocked_(user, q); } catch (e) { _glCatQAdd_(q); return { error: e.message }; }
}
function _glCatApplyLocked_(user, ids) {
  var keys = {}; ids.forEach(function (id) { keys['AUTO:CAT:' + id] = 1; });
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
  var set = _glSettings_(), startK = _glDKey_(set.startDate), roles = _glAutoRoles_(user, false), warn = [];
  _GL_ACC_MEMO_ = null;
  var ents = _glCatEntries_(function (rl) { return roles[rl]; }, _glAccounts_().map, set, warn)
    .filter(function (e) { return keys[e.key] && _glDKey_(e.date) >= startK; });   // ما قبل تاريخ البداية يدخل قيد الأرصدة الافتتاحية بالمزامنة الكاملة
  var r = _glAutoApply_({ entries: ents }, user, false, { bypass: true, onlyKeys: keys });
  try { CacheService.getScriptCache().put('gl_cat_at', String(Date.now()), 21600); } catch (eS) {}
  return { created: r.created, updated: r.updated, voided: r.voided, errors: r.errors.map(function (x) { return x.msg; }), warn: warn,
    blocked: (r.blocked || []).map(function (b) { return b.why + (b.date ? ' (' + b.date + ')' : ''); }), manualPending: r.manualPending || 0 };
}
function _glCatPostNow_(user, ids) {
  ids = (ids || []).map(_glStr_).filter(String);
  if (!ids.length || !_glSSId_()) return null;
  var dirty = function () { try { CacheService.getScriptCache().put('gl_dirty', String(Date.now()), 21600); } catch (e) {} };
  var lock = _glLock_();
  if (!lock.tryLock(45000)) { _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1); _glCatQAdd_(ids); dirty(); return { queued: true }; }
  try { var res = _glCatApplyLocked_(user, ids); dirty(); return res; }
  catch (e) { _glCatQAdd_(ids); dirty(); return { error: e.message }; }
  finally { _glUnlock_(lock); }
}
// 🍽️ (V4.323) رقم القيد التلقائي لكل اتفاقية (بمفتاح مصدرها) + هل له تغيير بانتظار الاعتماد — لعمود «القيد التلقائي» بالشاشة
function _glCatEntryMap_() {
  var o = {}; if (!_glSSId_()) return o;
  var pend = {}; try { pend = _glPendingRows_(); } catch (e) {}
  _glRows_('entries').forEach(function (r) {
    var k = _glStr_(r[6]); if (!/^AUTO:CAT:/.test(k)) return;
    var st = _glStr_(r[5]), cur = o[k.slice(9)];
    if (cur && cur.status === GL_ST_POSTED_ && st !== GL_ST_POSTED_) return;   // المرحّل أولى من ملغى قديم بنفس المفتاح
    o[k.slice(9)] = { id: _glStr_(r[0]), status: st, base: _glNum_(r[8]), pending: !!pend[k] };
  });
  return o;
}
// ⚡ (V4.236) التحقق المسبق من القيود (التوازن/الحسابات/السعر اليومي) — يُنفَّذ خارج القفل أثناء المزامنة اللحظية
function _glAutoPrepOne_(e, fxMap, defR) {
  _glAutoDailyRate_(e, fxMap, defR);
  var v;
  try { v = _glValidate_({ date: e.date, type: e.type || 'قيد تلقائي', desc: e.desc, trip: e.trip, company: e.company, lines: e.lines }, { allowBeforeStart: true, ignoreLock: true, allowSystem: true }); }
  catch (err) { e._pv = { err: err.message }; return; }
  e._pv = { v: v, hash: 'h:' + _glHash_(JSON.stringify([v.date, v.type, e.desc, e.trip || '', e.company || '', v.lines.map(function (l) { return [l.account, l.debit, l.credit, l.currency, l.rate, l.trip, l.company, l.client, l.agent, l.desc]; })])) };
}
function _glAutoPrep_(built) {
  var fxMap = _glFxDailyMap_(), defR = _glRates_();
  built.entries.forEach(function (e) { _glAutoPrepOne_(e, fxMap, defR); });
}
// داخل القفل: هل ما بُني خارج القفل ما زال صالحاً؟ (الحسابات الجديدة لم يسبقنا إليها أحد + كل حسابات الأسطر موجودة وفعّالة)
function _glAutoBuiltOk_(built) {
  // 🛡️ (V4.323 مراجعة) بُني قبل حفظ اتفاقية إعاشة رُحِّل قيدها فوراً ⇒ بيانات الاتفاقيات فيه قديمة (كان يعيد القيد للمبلغ القديم/يعيد ترحيل المحذوفة)
  try { var cat = +(CacheService.getScriptCache().get('gl_cat_at') || 0); if (built._t0 && cat && cat >= built._t0) return false; } catch (eC) {}
  _GL_ACC_MEMO_ = null;
  var fresh = _glAccounts_();
  if (built.party.stale(fresh)) return false;
  built._newParties = built.party.pendingCount();
  if (built._newParties) { built.party.flush(); _GL_ACC_MEMO_ = null; fresh = _glAccounts_(); }
  var m = fresh.map;
  return built.entries.every(function (e) {
    return !e._pv || !e._pv.v || e._pv.v.lines.every(function (l) { var a = m[l.account]; return a && !a.isGroup && a.active; });
  });
}
/* ⚡ (V4.307) «اعتماد التغييرات» كان يعيد بناء كل القيود التلقائية (قراءة كل الشاشات + ملف الحجوزات الخارجي، 20-60 ثانية)
   **داخل قفل الحسابات** لمجرد اعتماد تغيير أو اثنين ⇒ يتجمد الحفظ بكل الشاشات حتى ينتهي. الآن البناء الثقيل خارج القفل
   (نفس نهج المزامنة اللحظية V4.236)، وداخل القفل فقط التحقق من صلاحية ما بُني ثم كتابة الفرق (ثوانٍ). */
function _glAutoPreBuild_(user) {
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var t0 = Date.now(), b = _glAutoBuild_(user, false); b._t0 = t0;
    if ((b.roles._new || []).length) return null;   // أدوار تحتاج إنشاء حسابات ⇒ البناء داخل القفل كما كان
    _glAutoPrep_(b); return b;
  } catch (e) { return null; }
}
// داخل القفل: يستخدم ما بُني خارج القفل لو ما زال صالحاً، وإلا يبني من جديد
function _glAutoRunPre_(user, built, opts) {
  _glCatFlushQ_(user);   // 🛡️ (V4.323 مراجعة) طابور اتفاقيات الإعاشة المؤجَّل أولاً
  if (built && !_glAutoBuiltOk_(built)) { built = null; _GL_ACC_MEMO_ = null; }
  return _glAutoRun_(user, false, Object.assign({}, opts || {}, built ? { built: built } : {}));
}
function _glPendSame_(a, b) {
  var ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  var W = GL_SHEETS_.pending.headers.length, cell = function (x) { return x instanceof Date ? x.getTime() : _glStr_(x); };
  return kb.every(function (k) {
    if (!a[k]) return false;
    var ra = a[k].row, rb = b[k];
    for (var i = 0; i < W; i++) if (cell(ra[i]) !== cell(rb[i])) return false;
    return true;
  });
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
  if (Object.keys(keep).length === Object.keys(cur).length) return;
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
  var built = opts && opts.built;
  if (!built) { _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; built = _glAutoBuild_(user, !dry, opts && opts.scope); }
  var newParties = built._newParties != null ? built._newParties : built.party.pendingCount();
  var newNames = (built.roles._new || []).concat(built.party.made());
  if (!dry) built.party.flush();
  var res = _glAutoApply_(built, user, dry, opts);
  if (!dry) _glAutoLogAdd_(res.createdList, 'جديد');
  // 🏨 (V4.326) تغيّرت قيود حجوزات فنادق ⇒ بنود الحجوزات بحسابات عملاء العمرة تتبعها (القيمة/الإلغاء/العميل)
  if (!dry && res.hbTouched && typeof _accHbMirror_ === 'function') try { res.hbMirror = _accHbMirror_(null, user); } catch (eHm) { res.hbMirror = { error: eHm.message }; }
  res.newAccounts = newParties + (built.roles._new || []).length; res.newAccountNames = newNames.slice(0, 300); res.preCount = built.preCount; res.warnings = built.warnings;
  res.total = built.entries.length;
  res.bySrc = {}; built.entries.forEach(function (e) { res.bySrc[e.src] = (res.bySrc[e.src] || 0) + 1; });
  res.blocked = res.blocked.slice(0, 200); res.errors = res.errors.slice(0, 200);
  return res;
}
function glAutoPreview(authToken) {
  _glPerm_(authToken, 'view', 'auto');
  var r = _glAutoRun_('', true);
  r.success = true; r.last = _glAutoLast_(); r.cron = _glSettings_().auto_cron === 'نعم'; r.autoOpen = _glSettings_().auto_open !== 'لا';
  _GL_ACC_MEMO_ = null;
  return r;
}
function glAutoSync(authToken) {
  var session = _glAdminPerm_(authToken);
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    _glCatFlushQ_(session.username);   // 🛡️ (V4.323 مراجعة)
    var r = _glAutoRun_(session.username, false);
    _glAutoSaveLast_(r, session.username);
    if (r.created || r.updated || r.voided) logChange_(session.username, 'مزامنة القيود التلقائية', 'GL:auto', '-', '-',
      'جديد ' + r.created + '، معدّل ' + r.updated + '، ملغى ' + r.voided + (r.blocked.length ? '، محجوز بفترة مقفلة ' + r.blocked.length : ''));
    r.success = true; r.last = _glAutoLast_();
    return r;
  } finally { _glUnlock_(lock); }
}
// مُشغِّل مجدول (كل ساعة) — يُفعَّل من تبويب القيود التلقائية؛ يعمل بصلاحية صاحب السكربت
function glAutoSyncCron() {
  if (_glIdleHours_()) return;   // 🌙 (V4.322) خمول ليلي 2ص–10ص: لا مزامنة ساعية مجدولة (المستخدم النشط يحصل على القيود عبر المزامنة اللحظية، والأزرار اليدوية فورية)
  if (!_glSSId_() || _glSettings_().auto_cron !== 'نعم') return;
  var _pre = _glAutoPreBuild_('مزامنة مجدولة');   // ⚡ (V4.307) البناء (20-45 ثانية) خارج القفل — القفل للكتابة فقط
  var lock = _glLock_(); if (!lock.tryLock(30000)) return;
  try {
    var r = _glAutoRunPre_('مزامنة مجدولة', _pre); _glAutoSaveLast_(r, 'مزامنة مجدولة');
    _glBotPendCheck_();   // 📲 (V4.254)
  }
  catch (e) { try { _glSetSetting_('auto_last_error', _glNow_() + ' — ' + e.message); } catch (e2) {} }
  _glUnlock_(lock);
  // (V4.219) شيتات العهد المربوطة بخيار «تلقائي» — ⚡ (V4.307) عبر حارس عدم-التداخل (كانت تعمل بالتوازي مع مشغّلها المستقل)
  try { glCustSheetCron(); } catch (e3) {}
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
// 👁️ (V4.276) محتوى مرفق لمعاينته داخل البرنامج (صورة/PDF) — بلا حاجة لمشاركة ملف الدرايف مع المستخدم
function glAttachData(authToken, fileId) {
  _glPerm_(authToken, 'view');
  fileId = _glStr_(fileId); var hit = null;
  _glRows_('attach').forEach(function (r) { if (_glStr_(r[1]) === fileId) hit = r; });
  if (!hit) throw new Error('المرفق غير موجود');
  var f = DriveApp.getFileById(fileId), size = f.getSize();
  if (size > 12 * 1024 * 1024) return { success: true, big: true, url: f.getUrl(), name: _glStr_(hit[2]), mime: f.getMimeType() };
  var b = f.getBlob();
  return { success: true, name: _glStr_(hit[2]) || f.getName(), mime: b.getContentType() || _glStr_(hit[3]), b64: Utilities.base64Encode(b.getBytes()), url: f.getUrl() };
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
function glVchLogo(authToken, coId) {
  _glPerm_(authToken, 'view');
  var b = _glVchBrand_(), logo = '', lc = b.vch_logo_company || '', lf = '';
  if (_glStr_(coId)) {   // (V4.251) شركة إصدار أخرى: شعار مرفوع (ملف درايف) أو شعار شركة من إعدادات الإشعارات
    var co = []; try { co = JSON.parse(b.vch_companies || '[]') || []; } catch (eJ) {}
    var c = co.filter(function (x) { return x && String(x.id) === String(coId); })[0];
    if (c) { lc = _glStr_(c.logo_company); lf = _glStr_(c.logo_file); }
  }
  if (lf) try { var bl = DriveApp.getFileById(lf).getBlob(); logo = 'data:' + bl.getContentType() + ';base64,' + Utilities.base64Encode(bl.getBytes()); } catch (eF) {}
  if (!logo) try { logo = typeof getCompanyLogoBase64_ === 'function' ? getCompanyLogoBase64_(lc) : ''; } catch (e) {}
  return { success: true, logo: logo };
}
// رفع شعار شركة إصدار (صورة) — يُحفظ بمجلد مرفقات الحسابات ويعود بمعرّف الملف
function glVchCoLogoUpload(authToken, name, mime, b64) {
  var session = _glAdminPerm_(authToken);
  if (!/^image\//.test(_glStr_(mime))) throw new Error('الشعار يجب أن يكون صورة');
  var bytes = Utilities.base64Decode(String(b64 || '').replace(/^data:[^,]*,/, ''));
  if (bytes.length > 1.5 * 1024 * 1024) throw new Error('حجم الشعار أكبر من 1.5 ميجا');
  var f = getDriveFolder_('GLATT').createFile(Utilities.newBlob(bytes, mime, 'شعار — ' + (_glStr_(name) || 'شركة')));
  logChange_(session.username, 'رفع شعار شركة إصدار', 'GL:settings', 'شعار', '-', _glStr_(name));
  return { success: true, fileId: f.getId() };
}


/* ============================================================================
   🧳 (V4.222) المرحلة الثالثة: قيود الرحلات + الاعتماد + المزامنة الحية + الدفعات بالاتجاهين + إعادة البناء
   ============================================================================ */
// 🔔 قائمة التغييرات بانتظار الاعتماد
// 🔍 (V4.226) ماذا تغيّر فعلاً بالقيد (سطراً بسطر) — يظهر بشاشة الاعتماد حين يتطابق البيان والمبلغ ظاهرياً
// 🔎 (V4.259) ما الذي تغيّر بالبيان تحديداً: أجزاء البيان (الغرف/الليالي/التواريخ/أنواع السكن/الأعداد/الأسعار/الخصم…)
// التي حُذفت وأُضيفت بدل «بيان السطر تغيّر» — فيظهر بالاعتماد وتنبيه تليجرام مثلاً «2 ثنائي ← 3 ثنائي»
function _glDescDiff_(a, b) {
  var tok = function (s) { return _glCleanDesc_(s).replace(/\((\d+(?:\.\d+)?)\)/g, ' $1').split(/\s*(?:،|\+|\(|\)|—|\||,|؛)\s*/).map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).filter(function (x) { return x && x.length > 1; }); };
  var A = tok(a), B = tok(b), inB = {}, inA = {};
  B.forEach(function (x) { inB[x] = 1; }); A.forEach(function (x) { inA[x] = 1; });
  var rem = A.filter(function (x) { return !inB[x]; }), add = B.filter(function (x) { return !inA[x]; });
  if (!rem.length && !add.length) return '';
  var cut = function (L) { var t = L.slice(0, 4).join('، '); return (t.length > 140 ? t.slice(0, 140) + '…' : t) + (L.length > 4 ? ' …' : ''); };
  return 'قبل: «' + (rem.length ? cut(rem) : '—') + '» ← بعد: «' + (add.length ? cut(add) : '—') + '»';
}
// 📅 (V4.297) استخراج نطاق التواريخ من بيان القيد (مثل «من 14/10 إلى 25/10») لعرض تغيّر التواريخ وحده بدل البيان كاملاً
function _glDatesOf_(s) {
  s = _glCleanDesc_(s || '');
  var m = s.match(/من\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:إلى|الى|-|–|—)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/);
  if (m) return m[0].replace(/\s+/g, ' ').replace('الى', 'إلى').trim();
  var all = s.match(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g);
  return all ? all.join('، ') : '';
}
/* 🔎 (V4.305) «ما الذي تغيّر بالمصدر» لتغيير قيد تلقائي بانتظار الاعتماد (الشاشة وتنبيه تليجرام): يُقرأ من نص أسطر القيد القديم
   والجديد — وكلاهما مولَّد من المصدر نفسه بصيغة ثابتة — فيعمل فوراً مع القيود القائمة بلا تخزين إضافي:
   • حجز سكن (AUTO:HB): الفندق/الحجز، تاريخ الدخول والخروج، الليالي، عدد الغرف لكل نوع، سعر البيع والتكلفة لكل نوع، العميل والمورد، والإجماليات.
   • حساب عميل عمرة (AUTO:TRIP / AUTO:CI): كل بند بالإضافة والحذف والتعديل (العدد/الليالي/السعر) — وطبيعة التسكين والكبار/الأطفال/الرضع
     والخصم بنودٌ بذاتها؛ وتغيّر الرحلة يظهر في تنبيه الإلغاء («نُقل لرحلة …»). */
function _glHbLineRole_(d) {
  d = _glCleanDesc_(d);
  if (/^(ايراد|إيراد|خسارة) حجز /.test(d)) return 'rev';
  if (/^تكلفة حجز /.test(d)) return 'costh';
  if (/^حجز /.test(d)) return / — العميل: /.test(d) ? 'sup' : 'cli';
  return '';
}
function _glHbStmtParse_(d) {
  d = _glCleanDesc_(d).replace(/^تكلفة /, '');
  var m = d.match(/^حجز (.+?) من (\d{2}\/\d{2}) إلى (\d{2}\/\d{2})(?: \((.*?)\))? لمدة \(([\d.]+)\)/);
  if (!m) return null;
  var rooms = {}, re = /([\d.]+) (\S+) × ([\d.]+) ريال/g, x;
  while ((x = re.exec(m[4] || ''))) rooms[x[2]] = { n: +x[1], p: +x[3] };
  return { refHotel: m[1], ci: m[2], co: m[3], rooms: rooms, priced: !!m[4], nights: +m[5] };
}
function _glSrcDiffHb_(O, N, accM) {
  var nm = function (c) { var a = accM[c]; return a ? (a.link || a.name) : c; };
  var pick = function (L, role) { return L.filter(function (l) { return _glHbLineRole_(l.desc) === role; })[0] || null; };
  var oC = pick(O, 'cli'), nC = pick(N, 'cli'), oS = pick(O, 'sup'), nS = pick(N, 'sup'), out = [];
  var oP = _glHbStmtParse_((oC || oS || {}).desc), nP = _glHbStmtParse_((nC || nS || {}).desc);
  if (!oP || !nP) return out;
  if (oP.refHotel !== nP.refHotel) out.push('الحجز/الفندق: ' + oP.refHotel + ' ← ' + nP.refHotel);
  if (oP.ci !== nP.ci) out.push('تاريخ الدخول: ' + oP.ci + ' ← ' + nP.ci);
  if (oP.co !== nP.co) out.push('تاريخ الخروج: ' + oP.co + ' ← ' + nP.co);
  if (oP.nights !== nP.nights) out.push('عدد الليالي: ' + oP.nights + ' ← ' + nP.nights);
  var oSa = oC ? _glHbStmtParse_(oC.desc) : null, nSa = nC ? _glHbStmtParse_(nC.desc) : null, oCo = oS ? _glHbStmtParse_(oS.desc) : null, nCo = nS ? _glHbStmtParse_(nS.desc) : null;
  var rOf = function (a, b) { return (a && a.priced ? a.rooms : null) || (b && b.priced ? b.rooms : null) || {}; };
  var oR = rOf(oSa, oCo), nR = rOf(nSa, nCo), types = {};
  Object.keys(oR).concat(Object.keys(nR)).forEach(function (t) { types[t] = 1; });
  Object.keys(types).forEach(function (t) { var a = (oR[t] || {}).n || 0, b = (nR[t] || {}).n || 0; if (a !== b) out.push('عدد الغرف (' + t + '): ' + a + ' ← ' + b); });
  var prices = function (lbl, a, b) {
    if (!a || !b || !a.priced || !b.priced) return;
    Object.keys(b.rooms).forEach(function (t) { if (a.rooms[t] && a.rooms[t].p !== b.rooms[t].p) out.push(lbl + ' (' + t + '): ' + _glFmtN_(a.rooms[t].p) + ' ← ' + _glFmtN_(b.rooms[t].p) + ' ريال'); });
  };
  prices('سعر البيع', oSa, nSa); prices('التكلفة', oCo, nCo);
  if (oC && nC && oC.acc !== nC.acc) out.push('العميل: ' + nm(oC.acc) + ' ← ' + nm(nC.acc));
  else if (!oC && nC) out.push('➕ سُعِّر البيع للعميل ' + nm(nC.acc)); else if (oC && !nC) out.push('➖ أُزيل سعر البيع (' + nm(oC.acc) + ')');
  if (oS && nS && oS.acc !== nS.acc) out.push('المورد: ' + nm(oS.acc) + ' ← ' + nm(nS.acc));
  else if (!oS && nS) out.push('➕ سُعِّرت التكلفة للمورد ' + nm(nS.acc)); else if (oS && !nS) out.push('➖ أُزيلت التكلفة (' + nm(oS.acc) + ')');
  var v = function (l) { return l ? _glR2_(l.d || l.c) : 0; };
  if (oC && nC && v(oC) !== v(nC)) out.push('إجمالي البيع: ' + _glFmtN_(v(oC)) + ' ← ' + _glFmtN_(v(nC)) + ' ريال');
  if (oS && nS && v(oS) !== v(nS)) out.push('إجمالي التكلفة: ' + _glFmtN_(v(oS)) + ' ← ' + _glFmtN_(v(nS)) + ' ريال');
  return out;
}
// بنود بيان حساب الرحلة «وصف العدد [× الليالي ليلة] [× السعر] العملة» مفصولة بـ « + » أو « − » (الخصم)
function _glTripStmtItems_(stmt) {
  var out = [];
  String(stmt || '').split(/(?<=(?:جنيه|ريال)) (?=[+−] )/).forEach(function (p, i) {
    var t = p.replace(/^[+−] /, '').trim(); if (!t) return;
    var m = t.match(/^(.*?) (\d+(?:\.\d+)?)(?: × (\d+(?:\.\d+)?) ليلة)?(?: × (\d+(?:\.\d+)?))? (جنيه|ريال)$/);
    out.push(m ? { d: m[1], n: +m[2], ni: m[3] ? +m[3] : 0, p: m[4] !== undefined ? +m[4] : null, cur: m[5], txt: t } : { d: t, txt: t });
  });
  return out;
}
function _glItemsDiff_(A, B, fmtQty) {
  var out = [], used = {};
  var qty = function (x) { return x.txt.slice(x.d.length).trim(); };
  A.forEach(function (a) {
    var j = -1; B.forEach(function (b, k) { if (j < 0 && !used[k] && b.d === a.d) j = k; });
    if (j < 0) { out.push('➖ حُذف بند: ' + a.txt); return; }
    used[j] = 1; var b = B[j];
    if (a.txt === b.txt) return;
    var bits = [];
    if (a.p !== null && a.p !== undefined && b.p !== null && b.p !== undefined && a.n !== undefined && b.n !== undefined) {
      if (a.n !== b.n) bits.push('العدد ' + a.n + ' ← ' + b.n);
      if ((a.ni || 0) !== (b.ni || 0)) bits.push('الليالي ' + (a.ni || 0) + ' ← ' + (b.ni || 0));
      if (a.p !== b.p) bits.push('السعر ' + _glFmtN_(a.p) + ' ← ' + _glFmtN_(b.p) + ' ' + b.cur);
      if (a.cur !== b.cur) bits.push('العملة ' + a.cur + ' ← ' + b.cur);
    }
    out.push(a.d + ': ' + (bits.length ? bits.join(' · ') : qty(a) + ' ← ' + qty(b)));
  });
  B.forEach(function (b, k) { if (!used[k]) out.push('➕ بند جديد: ' + b.txt); });
  return out;
}
function _glSrcDiffTrip_(key, O, N) {
  var k = key.replace(/^AUTO:TRIP:/, ''), i = k.lastIndexOf('|'), trip = i >= 0 ? k.slice(i + 1) : '', client = i >= 0 ? k.slice(0, i) : k;
  var stmtOf = function (L) {
    var hit = '';
    L.forEach(function (l) {
      if (hit) return; var d = _glCleanDesc_(l.desc);
      [trip, client].forEach(function (pre) { if (!hit && pre && d.indexOf(pre + ' (') === 0 && /\)$/.test(d)) hit = d.slice(pre.length + 2, -1); });
    });
    return hit;
  };
  var a = stmtOf(O), b = stmtOf(N);
  if (!a || !b || a === b) return [];
  return _glItemsDiff_(_glTripStmtItems_(a), _glTripStmtItems_(b));
}
function _glSrcDiffCi_(O, N, accM) {
  var items = function (L) {
    return L.filter(function (l) { var a = accM[l.acc]; return !/^بنود حساب /.test(_glCleanDesc_(l.desc)) && !(a && a.kind === 'fx'); }).map(function (l) {
      var d = _glCleanDesc_(l.desc) || 'بند', v = _glR2_(l.d || l.c), lbl = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' }[l.cur] || l.cur;
      return { d: d, txt: d + ' ' + _glFmtN_(v) + ' ' + lbl, n: v, p: null, cur: l.cur };
    });
  };
  return _glItemsDiff_(items(O), items(N));
}
function _glSrcDiff_(key, oldRows, newLines, accM) {
  key = _glStr_(key);
  var O = (oldRows || []).map(function (l) { return { acc: _glStr_(l[4]), d: _glNum_(l[5]), c: _glNum_(l[6]), cur: _glStr_(l[7]), desc: _glStr_(l[15]) }; });
  var N = (newLines || []).map(function (l) { return { acc: l.account, d: +l.debit || 0, c: +l.credit || 0, cur: l.currency, desc: _glStr_(l.desc) }; });
  try {
    if (/^AUTO:HB:/.test(key)) return _glSrcDiffHb_(O, N, accM);
    if (/^AUTO:TRIP:/.test(key)) return _glSrcDiffTrip_(key, O, N);
    if (/^AUTO:CI:/.test(key)) return _glSrcDiffCi_(O, N, accM);
  } catch (e) { Logger.log('_glSrcDiff_: ' + e.message); }
  return [];
}
function _glLinesDiff_(eRow, oldRows, newLines, accM, hdr) {
  if (!newLines) {
    var vk = _glStr_(eRow[6]);   // (V4.305) سبب الإلغاء بلغة المصدر
    if (/^AUTO:HB:/.test(vk)) return 'إلغاء القيد — الحجز صار «لاغي» أو حُذف من برنامج الحجوزات' + (hdr && hdr.hint ? '\n' + hdr.hint : '');
    if (/^AUTO:(TRIP|CI):/.test(vk)) return 'إلغاء القيد — لم يعد للعميل بنود بهذه الرحلة' + (hdr && hdr.hint ? '\n' + hdr.hint : ' (حُذفت بنوده أو نُقل لرحلة أخرى)');
    return 'إلغاء القيد (المصدر حُذف)';
  }
  // 🔎 (V4.297) القيود التلقائية (الحجوزات…) بيانها نصّ مُولَّد من البنود، فمقارنته رمزاً برمز تُحدث تشتتاً بصرياً.
  // لها: نكتفي بالتغيّرات الجوهرية (المبالغ = سعر البيع/التكلفة، والتواريخ، والرحلة/العميل/المورد)؛ القيود اليدوية
  // تبقى بمقارنة البيان الكاملة كالسابق لأن بيانها مكتوب يدوياً وقد يكون جوهرياً.
  var isAuto = /^AUTO:/.test(_glStr_(eRow[6]));
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
  var usedN = {}, seenDD = {};
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
    if (_glCleanDesc_(o.desc) !== _glCleanDesc_(n.desc)) {
      // 🔎 (V4.297) للقيود التلقائية: نعرض تغيّر التواريخ وحده (البيان نصّ مُولَّد؛ تغيّر السعر/التكلفة يظهره فرق المبلغ أعلاه)،
      // دون المقارنة الرمزية الطويلة لبيان الحجز التي كانت تُحدث زحمة بصرية. القيود اليدوية تبقى بالمقارنة الكاملة.
      var od = _glDatesOf_(o.desc), nd = _glDatesOf_(n.desc);
      if (od !== nd && (od || nd)) { var dl = 'التواريخ: ' + (od || '—') + ' ← ' + (nd || '—'); if (!seenDD[dl]) { seenDD[dl] = 1; out.push(dl); } }
      if (!isAuto) { var dd = _glDescDiff_(o.desc, n.desc); if (dd && !seenDD[dd]) { seenDD[dd] = 1; out.push(a + ' — ' + dd); } else if (!dd && key(o) === key(n)) out.push(a + ' — بيان السطر تغيّر'); }
    }
  });
  if (hdr && hdr.desc && _glCleanDesc_(eRow[4]) !== _glCleanDesc_(hdr.desc)) {
    if (!isAuto) { var hd = _glDescDiff_(eRow[4], hdr.desc); if (hd && !seenDD[hd]) out.unshift('البيان — ' + hd); }
    else { var ohd = _glDatesOf_(eRow[4]), nhd = _glDatesOf_(hdr.desc); if (ohd !== nhd && (ohd || nhd)) { var hl = 'التواريخ: ' + (ohd || '—') + ' ← ' + (nhd || '—'); if (!seenDD[hl]) out.unshift(hl); } }
  }
  // 🔎 (V4.305) ما تغيّر بالمصدر أولاً (🔸)، ثم من الأثر المحاسبي ما لا يكرّره فقط: الرحلة المرتبطة وسعر الصرف (المبالغ ظاهرة بعمودَي المبلغ)
  var src = isAuto ? _glSrcDiff_(_glStr_(eRow[6]), oldRows, newLines, accM) : [];
  if (src.length) {
    var keep = [], tripSeen = {};
    out.forEach(function (x) {
      var tm = x.match(/ — الرحلة: «(.*)» ← «(.*)»$/);
      if (tm) { var tl = 'الرحلة المرتبطة: ' + (tm[1] || '—') + ' ← ' + (tm[2] || '—'); if (!tripSeen[tl]) { tripSeen[tl] = 1; keep.push(tl); } return; }
      if (/ — سعر الصرف: /.test(x)) keep.push(x);
    });
    out = src.map(function (x) { return '🔸 ' + x; }).concat(keep);
  }
  if (!out.length) out.push('تغيير بترتيب الأسطر أو بأسطر الوسيط فقط');
  return out.slice(0, 18).join('\n');
}
function glPendingList(authToken) {
  var session = _glPerm_(authToken, 'view', 'auto');
  var rows = [];
  try { _glRowsW_('pending').forEach(function (r) { if (_glStr_(r[0])) rows.push({ key: _glStr_(r[0]), id: _glStr_(r[1]), kind: _glStr_(r[2]), oldDesc: _glStr_(r[3]), oldBase: _glNum_(r[4]),
    newDesc: _glStr_(r[5]), newBase: _glNum_(r[6]), at: _glStr_(r[8]), status: _glStr_(r[9]) || 'بانتظار', by: _glStr_(r[10]), note: _glStr_(r[11]), oldAmt: _glStr_(r[12]), newAmt: _glStr_(r[13]), diff: _glStr_(r[14]) }); }); } catch (e) {}
  // 👜 (V4.262) صفوف شيتات العهد الناقصة (تُحدَّث مع كل مزامنة) — تظهر أعلى شاشة الاعتماد
  var cust = [], P = PropertiesService.getScriptProperties(), accM = _glAccounts_().map;
  try { _glCsCodes_().forEach(function (code) { var n = +(P.getProperty('GLBOT_CS_' + code) || 0); if (n) cust.push({ code: code, name: (accM[code] || {}).name || code, n: n }); }); } catch (eC) {}
  return { success: true, rows: rows, canApprove: _glCanApprove_(session), cust: cust };
}
// (V4.259) أحدث التغييرات بانتظار الاعتماد بنص مقروء (البيان + المبلغ قبل/بعد + ما الذي تغيّر) — لتنبيه وأمر تليجرام
function _glPendTop_(n) {
  var rows = [];
  try { _glRowsW_('pending').forEach(function (r) { if (_glStr_(r[0]) && _glStr_(r[9]) !== 'مرفوض') rows.push(r); }); } catch (e) {}
  rows.sort(function (a, b) { return _glAutoTsKey_(_glStr_(b[8])) > _glAutoTsKey_(_glStr_(a[8])) ? 1 : -1; });
  return rows.slice(0, n || 3).map(function (r) {
    var d = _glStr_(r[14]).split('\n').slice(0, 14).map(function (x) { return '   ' + (/^🔸/.test(x) ? '' : '▫️ ') + x; }).join('\n');   // (V4.305) ما تغيّر بالمصدر (🔸) كاملاً
    var eo = null; try { var fe = _glStr_(r[1]) ? _glFindEntry_(_glStr_(r[1])) : null; if (fe) eo = _glEntryObj_(fe.r); } catch (eF) {}   // (V4.277) تاريخ القيد ونوعه
    return { key: _glStr_(r[0]), id: _glStr_(r[1]), txt: '• <b>' + _glBotEsc_(_glCleanDesc_(_glStr_(r[5]) || _glStr_(r[3])).slice(0, 160)) + '</b>' + (r[1] ? ' (' + _glBotEsc_(_glStr_(r[1])) + ')' : '') +
      '\n   🔄 ' + _glBotEsc_(_glStr_(r[2]) || 'تعديل') + (eo ? ' · ' + _glBotEsc_(eo.type) + ' · 📅 تاريخ القيد: <b>' + _glBotEsc_(eo.date) + '</b>' : '') + (_glStr_(r[8]) ? ' · 🕒 رُصد ' + _glBotEsc_(_glStr_(r[8])) : '') +
      (_glStr_(r[12]) || _glStr_(r[13]) ? '\n   💰 المبلغ القديم: ' + _glBotEsc_(_glStr_(r[12]) || '—') + ' · المبلغ الجديد: ' + _glBotEsc_(_glStr_(r[13]) || '—') : '') + (d ? '\n' + _glBotEsc_(d) : '') };
  });
}
// 📲 تنبيه «تغييرات تنتظر الاعتماد» عند زيادة عددها (من المزامنة المجدولة واللحظية) — كل تغيير برسالة وأزرار
function _glBotPendCheck_() {
  try {
    var PP = PropertiesService.getScriptProperties(), lp = +(PP.getProperty('GLBOT_PEND') || 0), np = _glPendingCount_() || 0;
    if (np === lp) return;
    PP.setProperty('GLBOT_PEND', String(np));
    if (np > lp) { var ptop = _glPendTop_(Math.min(3, np - lp)); _glBotQ_('pending', { n: np, more: Math.max(0, np - lp - ptop.length), items: ptop.map(function (x) { return x.txt; }), keys: ptop.map(function (x) { return x.key; }) }); }
  } catch (e) {}
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
  var _pre = Object.keys(only).some(function (k) { return !/^CCY:/.test(k); }) ? _glAutoPreBuild_(session.username) : null;   // ⚡ (V4.307) خارج القفل
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    // 💱 (V4.306) تغييرات «تحويل عملة» (CCY:) ليست تعديلاً على قيد قائم تُعاد بنايته من المصدر — القيد مسجَّل بالفعل
    // بمبلغه المستنتج، فاعتمادها لا يفعل شيئاً سوى إزالتها من القائمة (مراجعة فقط)؛ الباقي كالمعتاد عبر _glAutoRun_
    var ccyKeys = Object.keys(only).filter(function (k) { return /^CCY:/.test(k); });
    var autoKeys = {}; Object.keys(only).forEach(function (k) { if (!/^CCY:/.test(k)) autoKeys[k] = 1; });
    var r = { updated: 0, voided: 0, created: 0, blocked: [], createdList: [] };
    if (Object.keys(autoKeys).length) { r = _glAutoRunPre_(session.username, _pre, { bypass: true, onlyKeys: autoKeys, approveKeys: autoKeys }); _glAutoLogAdd_(r.createdList, 'جديد'); }
    if (ccyKeys.length) _glPendingDrop_(ccyKeys);
    logChange_(session.username, 'اعتماد تغيير قيود تلقائية', 'GL:approve', 'القيود', Object.keys(only).length + ' تغيير', 'معدّل ' + r.updated + '، ملغى ' + r.voided + (ccyKeys.length ? '، مراجعة عملة ' + ccyKeys.length : '') + (r.blocked.length ? '، محجوز بفترة مقفلة ' + r.blocked.length : ''));
    return { success: true, updated: r.updated, voided: r.voided, created: r.created, blocked: r.blocked, pending: _glPendingCount_() };
  } finally { _glUnlock_(lock); }
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
  if (_glLiveDue_()) {
    try { var r = _glLiveSync_(session.username); if (r) { out.ran = true; out.created = r.created; out.errors = r.errors.length; } }
    catch (e) { out.error = e.message; try { _glSetSetting_('auto_last_error', _glNow_() + ' — ' + e.message); } catch (e2) {} }
  }
  return Object.assign(out, _glKickStatus_(session, since));
}
/* ⚡ (V4.236) المزامنة اللحظية بلا تعطيل للحفظ: كانت تعيد بناء كل القيود (25-90 ثانية) وهي ممسكة بالقفل العام للسكربت —
   فيتوقف أي حفظ بأي شاشة حتى تنتهي. الآن: القراءة والبناء والتحقق من كل القيود خارج القفل، ثم داخل القفل فقط كتابة
   الفرق (ثوانٍ). ولا تتكرر أكثر من مرة كل 20 ثانية مهما كثرت الشاشات المفتوحة (تغييرات الفترة تُجمَّع بمزامنة واحدة). */
var GL_LIVE_GAP_MS_ = 180000;   // ⚡ (V4.322) كان 20 ثانية ⇒ بناء القيود التلقائية اللحظي كان يعمل كل ~دقيقة (38-57 ثانية كل مرة) ويحجز قفل الحسابات فيتأخر كل حفظ. الآن 3 دقائق على الأكثر (المشغّل الساعي glAutoSyncCron يبقى شبكة أمان، والأزرار اليدوية فورية)
// 🌙 (V4.322) ساعات الخمول (2ص–10ص بتوقيت البرنامج): لا تعمل المزامنات الخلفية الثقيلة (بناء القيود اللحظي + مزامنة شيتات العهد المجدولة).
// الحفظ والمزامنة اليدوية (أزرار «🔄 مزامنة الآن») لا تتأثر إطلاقاً وتعمل في أي وقت — فقط المشغّلات التلقائية هي التي تتوقف ليلاً.
function _glIdleHours_() {
  try { var h = +Utilities.formatDate(new Date(), (typeof _tz_ === 'function' ? _tz_() : 'Asia/Riyadh') || 'Asia/Riyadh', 'H'); return h >= 2 && h < 10; } catch (e) { return false; }
}
function _glLiveDue_() {
  try {
    // ملاحظة: بناء القيود اللحظي لا يخضع لساعات الخمول — فهو لا يعمل إلا عندما يكون مستخدم فعلاً يحفظ (متصفح مفتوح)،
    // فلو كان هناك عمل ليلي (رمضان/الحج) تظهر قيوده التلقائية كالمعتاد. الخمول يوقف المهام المجدولة فقط (مزامنة الشيتات/الساعية).
    var c = CacheService.getScriptCache();
    return !!c.get('gl_dirty') && !c.get('gl_live_busy') && Date.now() - (+c.get('gl_live_at') || 0) > GL_LIVE_GAP_MS_;
  } catch (e) { return false; }
}
function _glLiveSync_(who) {
  var cache = CacheService.getScriptCache();
  cache.put('gl_live_busy', '1', 300); cache.remove('gl_dirty'); cache.put('gl_live_at', String(Date.now()), 21600);
  var user = 'مزامنة لحظية (' + who + ')', ok = false;
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var built = null;
    var t0 = Date.now();
    try { built = _glAutoBuild_(user, false); built._t0 = t0; if ((built.roles._new || []).length) built = null; else _glAutoPrep_(built); }
    catch (eB) { built = null; }   // يُعاد البناء داخل القفل ليظهر الخطأ كما كان
    var lock = _glLock_();
    if (!lock.tryLock(30000)) return null;
    var r;
    try {
      _glCatFlushQ_(user);   // 🛡️ (V4.323 مراجعة) طابور اتفاقيات الإعاشة المؤجَّل (بالحفظ = اعتماد) قبل المزامنة
      if (built && !_glAutoBuiltOk_(built)) { built = null; _GL_ACC_MEMO_ = null; }
      r = _glAutoRun_(user, false, built ? { built: built } : null);
      var changed = r.created || r.updated || r.voided;
      if (changed || !cache.get('gl_last_w')) { _glAutoSaveLast_(r, 'مزامنة لحظية'); cache.put('gl_last_w', '1', 900); }
    } finally { _glUnlock_(lock); }
    if (r.created || r.updated || r.voided) logChange_(who, 'مزامنة القيود التلقائية', 'GL:auto', 'لحظية', '-', 'جديد ' + r.created + '، بانتظار الاعتماد ' + r.pending);
    if (r.pending) _glBotPendCheck_();
    ok = true;
    return r;
  } finally {
    cache.remove('gl_live_busy');
    if (!ok) cache.put('gl_dirty', String(Date.now()), 21600);   // لم تكتمل ⇒ تُعاد بالنبضة التالية
  }
}
// حالة سريعة بلا أي قراءة ثقيلة: عدد التغييرات بانتظار الاعتماد + القيود الجديدة منذ آخر نبضة
function _glKickStatus_(session, since) {
  var out = {};
  if (_sessionHasPerm_(session, 'gl.view')) {
    out.pending = _glPendingCount_(); out.csPend = _glCsPendTotal_();
    out.recent = [];
    var sk = _glStr_(since), lastAt = null;
    try { lastAt = CacheService.getScriptCache().get('gl_autolog_at'); } catch (e0) {}
    if (sk && lastAt && _glAutoTsKey_(lastAt) > _glAutoTsKey_(sk)) try { _glRows_('autolog').forEach(function (r) { var at = _glStr_(r[0]); if (_glAutoTsKey_(at) > _glAutoTsKey_(sk)) out.recent.push({ at: at, id: _glStr_(r[1]), desc: _glStr_(r[2]), base: _glNum_(r[3]), src: _glStr_(r[4]), what: _glStr_(r[5]) }); }); } catch (e) {}
    out.recent = out.recent.slice(-20);
  }
  out.now = _glNow_();
  return out;
}
function _glAutoTsKey_(s) { var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/); return m ? m[3] + m[2] + m[1] + m[4] + m[5] + m[6] : ''; }

// 💵 توجيه دفعات العملاء: الدفعات المسجلة بشاشة حسابات العملاء تذهب لـ«نقدية تحت التسوية» حتى يُحدَّد حسابها النقدي
function glCpList(authToken) {
  _glPerm_(authToken, 'view', 'cp');
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
  var session = _glPerm_(authToken, 'edit', 'cp');
  code = _glStr_(code); var a = _glAccounts_().map[code];
  if (!a || a.isGroup) throw new Error('اختر حساباً ورقياً صالحاً');
  var ids = (payIds || []).map(_glStr_).filter(String); if (!ids.length) throw new Error('اختر دفعة واحدة على الأقل');
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    var rows = _glRows_('cpdir'), at = {}, now = _glNow_();
    rows.forEach(function (r, i) { at[_glStr_(r[0])] = i; });
    ids.forEach(function (id) {
      if (at[id] !== undefined) rows[at[id]] = [id, code, session.username, now];
      else rows.push([id, code, session.username, now]);
    });
    _glCpDirWrite_(rows);
    var only = {}; ids.forEach(function (id) { only['AUTO:CP:' + id] = 1; });
    var r = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: only, scope: 'cp' });   // توجيه صريح من المستخدم ⇒ يُطبَّق مباشرة
    logChange_(session.username, 'توجيه دفعات عملاء لحساب', 'GL:' + code, a.name, ids.length + ' دفعة', 'معدّل ' + r.updated);
    return { success: true, updated: r.updated };
  } finally { _glUnlock_(lock); }
}
// 🏦 (V4.259) من شاشة حسابات عملاء العمرة: الحساب المقابل للدفعة عند تسجيلها (بدل «نقدية تحت التسوية») —
// يُكتب التوجيه فقط، والقيد يُسجَّل/يتحدّث بالمزامنة اللحظية التالية
function accCounterAccounts(authToken) {
  _accPerm_(authToken, 'view');
  if (!_glSSId_()) return { success: true, accounts: [] };
  return { success: true, accounts: _glAccounts_().list.filter(function (a) { return !a.isGroup && a.active !== false && !/^(fx|trip|hbrev)$/.test(a.kind); })
    .map(function (a) { return { code: a.code, name: a.name, currency: a.currency || '', kind: a.kind || '' }; }) };
}
function accPayCounterSet(authToken, payId, code) {
  var session = _accPerm_(authToken, 'add');
  payId = _glStr_(payId); code = _glStr_(code); if (!payId) throw new Error('دفعة غير محددة');
  var a = code ? _glAccounts_().map[code] : null; if (code && (!a || a.isGroup)) throw new Error('اختر حساباً فرعياً صالحاً');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var rows = _glRows_('cpdir').filter(function (r) { return _glStr_(r[0]) !== payId; });
    if (code) rows.push([payId, code, (session && session.username) || '', _glNow_()]);
    _glCpDirWrite_(rows);
    try { CacheService.getScriptCache().put('gl_dirty', String(Date.now()), 21600); } catch (eC) {}
    logChange_((session && session.username) || '', 'توجيه دفعة عميل لحساب', 'GL:' + (code || '-'), a ? a.name : 'تحت التسوية', payId, '-');
    return { success: true };
  } finally { _glUnlock_(lock); }
}
// إعادة كتابة شيت توجيه الدفعات كاملاً (يسمح بحذف صفوف عند إلغاء التوجيه)
function _glCpDirWrite_(rows) {
  var sh = _glSheet_('cpdir'), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 4).clearContent();
  if (rows && rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
}
function _glCpPending_() { try { return _glPendingCount_(); } catch (e) { return 0; } }   // (V4.319) القيد التلقائي المعدَّل يدوياً قد ينتظر الاعتماد بأي وضع
// (V4.229) توجيه مجمّع لكل دفعة على حدة لأي حساب: items=[{payId, code}] — code فارغ = إلغاء التوجيه (يعود لنقدية تحت التسوية)
function glCpApply(authToken, items) {
  var session = _glPerm_(authToken, 'edit', 'cp');
  items = (items || []).map(function (it) { return { payId: _glStr_(it && it.payId), code: _glStr_(it && it.code) }; }).filter(function (it) { return it.payId; });
  if (!items.length) throw new Error('اختر دفعة واحدة على الأقل');
  var accMap = _glAccounts_().map;
  items.forEach(function (it) { if (it.code) { var a = accMap[it.code]; if (!a || a.isGroup) throw new Error('حساب غير صالح: ' + it.code); } });
  var lock = _glLock_(); lock.waitLock(60000);
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
    var r = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: only, scope: 'cp' });
    logChange_(session.username, 'توجيه دفعات عملاء (مجمّع)', 'GL', '', items.length + ' دفعة', 'موجَّه ' + setN + ' · مُلغى توجيه ' + clrN + ' · معدّل ' + r.updated);
    return { success: true, updated: r.updated, directed: setN, cleared: clrN, rows: glCpList(authToken).rows, balances: _glBalances_(null), pendingCount: _glCpPending_() };
  } finally { _glUnlock_(lock); }
}
// (V4.229) حذف دفعات عملاء (قد تكون مكررة) من شاشة التوجيه — يُحذف السجل بشاشة حسابات العملاء ويُلغى قيدها التلقائي
function glCpDelete(authToken, payIds) {
  var session = _glPerm_(authToken, 'edit', 'cp');
  var ids = (payIds || []).map(_glStr_).filter(String); if (!ids.length) throw new Error('اختر دفعة واحدة على الأقل');
  var idset = {}; ids.forEach(function (id) { idset[id] = 1; });
  var lock = _glLock_(); lock.waitLock(60000);
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
    var r = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: only, scope: 'cp' });   // الدفعة اختفت من البناء ⇒ يُلغى قيدها
    return { success: true, deleted: del, voided: r.voided, rows: glCpList(authToken).rows, balances: _glBalances_(null), pendingCount: _glCpPending_() };
  } finally { _glUnlock_(lock); }
}

/* 🔎 (V4.364) دفعات عملاء منسوخة من إيصال بالحسابات العامة فقدت علامتها المخفية ⟦src:gl-…⟧ (تعديل البيان من الشاشة قبل V4.364)
   فرحّلها المحرك التلقائي مرة ثانية كقيد AUTO:CP فوق الإيصال نفسه ⇒ رصيد العميل مخصوم مرتين.
   الكشف: دفعة بلا علامة لها قيد AUTO:CP مرحّل + إيصال (قيد غير تلقائي) على حساب نفس العميل بنفس التاريخ والمبلغ والعملة
   لا تحمل علامته أي دفعة أخرى. الإصلاح: إعادة العلامة للدفعة ⇒ المزامنة تُلغي القيد المكرر (AUTO:CP) وتبقى الدفعة نسخة الإيصال. */
function _glCpSrcLostFind_() {
  var accs = _glAccounts_().map, cliAcc = {};
  Object.keys(accs).forEach(function (c) { var a = accs[c]; if (a && a.kind === 'client' && a.link) cliAcc[c] = a.link; });
  var ents = _glRows_('entries'), byId = {}, autoCp = {};
  ents.forEach(function (r) {
    var e = _glEntryObj_(r); if (e.status !== GL_ST_POSTED_) return;
    byId[e.id] = e;
    var m = /^AUTO:CP:(.+)$/.exec(e.sourceKey); if (m) autoCp[m[1]] = e.id;
  });
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), last = sh.getLastRow(), data = last >= 2 ? sh.getRange(2, 1, last - 1, ACC_PAY_HEADERS.length).getValues() : [];
  var tagged = {};   // رقم القيد|العميل ⇒ له نسخة بعلامتها
  data.forEach(function (r) { var m = /⟦src:gl-([^⟧]+)⟧/.exec(_glStr_(r[8])); if (m) tagged[m[1] + '|' + _glStr_(r[1])] = 1; });
  var vk = {};   // العميل|التاريخ|المبلغ|العملة ⇒ [إيصالات]
  _glRows_('lines').forEach(function (r) {
    var l = _glLineObj_(r), e = byId[l.entryId]; if (!e || /^AUTO:/.test(e.sourceKey) || !cliAcc[l.account]) return;
    var ca = _glCpAmtOf_(l); if (!ca.amt) return;
    var k = cliAcc[l.account] + '|' + e.date + '|' + _glR2_(ca.amt) + '|' + ca.cur;
    (vk[k] = vk[k] || []).push(e);
  });
  var out = [], used = {};
  data.forEach(function (r, i) {
    var pid = _glStr_(r[0]), desc = _glStr_(r[8]);
    if (!pid || /⟦(src|cf):/.test(desc) || !autoCp[pid] || _glStr_(r[3]) === 'تحويل') return;
    var k = _glStr_(r[1]) + '|' + _glDate_(r[4]) + '|' + _glR2_(_glNum_(r[5])) + '|' + (_glStr_(r[6]) || 'EGP');
    var cands = (vk[k] || []).filter(function (e) { return !tagged[e.id + '|' + _glStr_(r[1])] && !used[e.id + '|' + _glStr_(r[1])]; });
    if (!cands.length) return;
    var v = cands[0]; used[v.id + '|' + _glStr_(r[1])] = 1;
    out.push({ pid: pid, row: i + 2, client: _glStr_(r[1]), trip: _glStr_(r[2]), date: _glDate_(r[4]), amount: _glNum_(r[5]), cur: _glStr_(r[6]) || 'EGP', desc: desc,
      entryId: v.id, voucherNo: _glStr_(v.ref), voucherDesc: v.desc, autoEntry: autoCp[pid] });
  });
  return out;
}
function glCpSrcLostScan(authToken) {
  _glAdminPerm_(authToken);
  return { success: true, rows: _glCpSrcLostFind_() };
}
function glCpSrcLostFix(authToken, pids) {
  var session = _glAdminPerm_(authToken), user = session.username, want = {};
  (pids || []).forEach(function (p) { want[_glStr_(p)] = 1; });
  var lock = _glLock_(), fixed = [], res = null; lock.waitLock(60000);
  try {
    var list = _glCpSrcLostFind_().filter(function (x) { return want[x.pid]; });
    if (!list.length) return { success: true, fixed: 0, voided: 0 };
    if (typeof _snapPreRisk_ === 'function') { try { _snapPreRisk_('إصلاح دفعات رُحِّلت مرتين', user); } catch (eS) {} }
    var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
    list.forEach(function (x) {
      var cell = sh.getRange(x.row, 1, 1, 9), v = cell.getValues()[0];
      if (_glStr_(v[0]) !== x.pid) return;   // تغيّر موضع الصف — يُتخطّى بأمان
      if (typeof _snapRowTake_ === 'function') _snapRowTake_(ACC_PAY_SHEET, x.pid, sh.getRange(x.row, 1, 1, ACC_PAY_HEADERS.length).getValues()[0], 'قبل إصلاح الترحيل المزدوج', user);
      sh.getRange(x.row, 9).setValue((_glStr_(v[8]) + ' ⟦src:gl-' + x.entryId + '⟧').trim());
      fixed.push(x);
    });
    logChange_(user, 'إصلاح دفعات رُحِّلت مرتين', 'GL:AUTO:CP', fixed.length + ' دفعة', '-', fixed.map(function (x) { return x.pid + '→' + x.entryId + ' (يُلغى ' + x.autoEntry + ')'; }).join('، ').slice(0, 1500));
    // المزامنة تُلغي قيود AUTO:CP التي لم يعد مصدرها دفعة شاشة (الدفعة صارت نسخة الإيصال) — إصلاح صريح من المدير ⇒ مباشرة
    var only = {}; fixed.forEach(function (x) { only['AUTO:CP:' + x.pid] = 1; });
    if (fixed.length) try { res = _glAutoRun_(user, false, { bypass: true, onlyKeys: only, scope: 'cp' }); } catch (eA) { Logger.log('srclost sync: ' + eA.message); }
  } finally { _glUnlock_(lock); }
  return { success: true, fixed: fixed.length, voided: res ? (res.voided || 0) : 0, pending: res ? (res.pending || 0) : 0 };
}
// 🔁 إيصال استلام/صرف على حساب عميل بالحسابات العامة ⇒ دفعة بشاشة حسابات العملاء (عامة، أو على الرحلة لو حُددت بالإيصال
// وللعميل بنود بها) بعلامة مخفية ⟦src:gl-رقم القيد⟧ — تُحدَّث مع تعديل الإيصال وتُحذف بإلغائه/حذفه، ولا تُقيَّد مرة ثانية
function _glSyncVoucherPays_(entryId, user, pre) {
  _GL_HB_MIRROR_LAST_ = null;
  try {   // (V4.241) نسخة بسجل دفعات الحجوزات — (V4.246) والنتيجة/سبب عدم النسخ تُعاد للواجهة
    var mr = null;
    if (_GL_LOCKN_ > 0) {   // ⚡ (V4.307) داخل قفل الحسابات ⇒ معاينة محلية للتنبيه + طابور للنسخ الفعلي خارج القفل
      var pk = _glHbMirrorPeek_(_glStr_(entryId));
      if (pk && pk.need && !_glMirQ_(entryId, { notify: true, by: _glHbStaffName_(user) })) mr = _glHbMirrorSync_(entryId, { notify: true, by: _glHbStaffName_(user) });
      else if (pk) mr = { written: pk.written, skipped: pk.skipped, queued: pk.need };
    } else mr = _glHbMirrorSync_(entryId, { notify: true, by: _glHbStaffName_(user) });
    if (mr && mr.written) _GL_HB_MIRROR_LAST_ = { written: mr.written };
    else { var wy = _glHbMirrorWhy_(_glStr_(entryId)); if (wy) _GL_HB_MIRROR_LAST_ = wy; }
    // 💱 (V4.305) سطر طرف حجوزات بغير الريال لا يُنسخ لكشف الفندق (لا تحويل تلقائي) ⇒ تنبيه للمستخدم ليحدّد مبلغه بالريال
    if (mr && mr.skipped && mr.skipped.length) _GL_HB_MIRROR_LAST_ = Object.assign(_GL_HB_MIRROR_LAST_ || {}, { names: mr.skipped,
      why: 'كشف حساب الفندق بالريال ولا يُحوَّل إليه أي مبلغ تلقائياً: سطر «' + mr.skipped.join('» و«') + '» بعملة غير الريال فلم يُنسخ لكشفه ببرنامج الحجوزات — عدّل القيد واجعل مبلغ هذا الطرف بالريال (اختر «ريال» بجوار مبلغه واكتب المبلغ المتفق عليه)' });
  } catch (eM) { try { Logger.log('hb mirror: ' + eM.message); } catch (e0) {} }
  try { _glCpSyncVoucher_(entryId, user); } catch (err) { Logger.log('voucher→payments ' + entryId + ': ' + err.message); }
  try { _glApSyncEntry_(entryId, user, pre); } catch (eAp) { Logger.log('voucher→agent ' + entryId + ': ' + eAp.message); }   // 🧑‍💼 (V4.328) ⇒ حسابات الوكلاء
}
// 💰 نسخ سند قبض/صرف/إيداع/سحب على حساب عميل عمرة إلى «حسابات عملاء العمرة» (ACC_PAY_SHEET) — مستخرجة من
// _glSyncVoucherPays_ (V4.309) لاستدعائها أيضاً من مزامنة شيتات العهد/الخزينة/البنوك (_glCsSync_)، التي لم تكن
// تستدعيها إطلاقاً فلا تظهر دفعاتها هناك تلقائياً رغم ظهورها بكشف الحساب العام
// (V4.315) مطابقة صفوف دفعات قيد قائمة (rows:[{row,client}]) بالدفعات المطلوبة (want:[[client,…]]): نفس العميل أولاً،
// ثم أي صف متبقٍّ — يُرجع assign (صف أو null لكل مطلوب) وunused (صفوف تُحذف)
function _glCpPair_(rows, want) {
  var used = {}, assign = want.map(function () { return null; });
  want.forEach(function (w, k) { for (var i = 0; i < rows.length; i++) if (!used[i] && rows[i].client === w[0]) { used[i] = 1; assign[k] = rows[i]; return; } });
  want.forEach(function (w, k) { if (assign[k]) return; for (var i = 0; i < rows.length; i++) if (!used[i]) { used[i] = 1; assign[k] = rows[i]; return; } });
  return { assign: assign, unused: rows.filter(function (r, i) { return !used[i]; }) };
}
// 🔁 (V4.330) أي قيد يدوي/شيت مرحّل له سطر على حساب عميل يصير دفعة بحسابات العملاء (سند، بنك، خزينة، عهدة، تحويل بين طرفين،
// قيد يومية…) — كانت السندات والإيداع/السحب البنكي فقط. لا تُنسخ القيود التلقائية (AUTO) ولا الافتتاحية/المستوردة/الإقفال
// (لها أرصدتها وقيودها الخاصة بالشاشة). المبلغ = دائن − مدين سطر العميل (موجب = استلمنا منه، سالب = دفعنا له).
// 🙈 (V4.336) سجل «المحذوف من الشاشة فقط»: دفعة/بند حُذف من شاشة حسابات العملاء مع بقاء قيده بالحسابات العامة ⇒ لا تعيده أي مزامنة.
// المفاتيح: cp|<رقم القيد>|<العميل> (دفعة) · hb|<مفتاح الحجز>|<العميل> (بند حجز فندقي). مخزَّن بإعداد scr_hide.
function _glScrHide_() { var o = {}; try { o = JSON.parse(_glSettings_().scr_hide || '{}') || {}; } catch (e) { o = {}; } return o; }
function _glScrHideSave_(o) { var j = JSON.stringify(o); if (j.length > 45000) throw new Error('سجل المحذوف من الشاشة امتلأ — اطلب من المدير تنظيفه'); _glSetSetting_('scr_hide', j); }
function _glScrHideAdd_(keys) { var o = _glScrHide_(); keys.forEach(function (k) { o[k] = 1; }); _glScrHideSave_(o); }
// مبلغ/عملة نسخة الدفعة بحساب العميل: الريال والجنيه كما هما، وأي عملة أخرى (دولار…) بمعادلها بالجنيه مع ذكر الأصل بالبيان (كانت تُكتب خطأً بالجنيه)
function _glCpAmtOf_(l) {
  var cur = _glStr_(l.currency) || 'EGP', net = _glR2_(l.credit - l.debit);
  if (cur === 'SAR' || cur === 'EGP') return { amt: net, cur: cur, note: '' };
  var b = _glR2_((+l.bCredit || 0) - (+l.bDebit || 0));
  return { amt: b, cur: 'EGP', note: ' (' + _glFmtN_(Math.abs(net)) + ' ' + cur + ')' };
}
// 🔓 (V4.336) فكّ ارتباط قيد دفعة تلقائي (AUTO:CP:<معرّف>) من شاشة حسابات العملاء: يصبح قيداً يدوياً عادياً (مفتاح المصدر فارغ)
// فلا يلغيه/يحذفه المحرك التلقائي عند حذف الدفعة من الشاشة. يُرجع رقم القيد ('' لو لا قيد). يعمل تحت قفل الحسابات.
function _glCpDetach_(payId) {
  var key = 'AUTO:CP:' + _glStr_(payId), rows = _glRows_('entries');
  for (var i = 0; i < rows.length; i++) {
    if (_glStr_(rows[i][6]) !== key) continue;
    var id = _glStr_(rows[i][0]);
    if (_glLocked_(rows[i][2])) throw new Error('القيد ' + id + ' في فترة مقفلة — لا يمكن فك ارتباطه');
    _glSheet_('entries').getRange(i + 2, 7).setNumberFormat('@').setValue('');
    _glTouch_('entries');
    return id;
  }
  return '';
}
function _glCpEligible_(type, sk) { return !GL_AP_NOSYNC_TYPES_[_glStr_(type)] && !/^(AUTO|CLOSE):/.test(_glStr_(sk)); }
function _glCpSyncVoucher_(entryId, user) {
  entryId = _glStr_(entryId); if (!entryId) return;
  var tag = '⟦src:gl-' + entryId + '⟧', want = [], f = _glFindEntry_(entryId);
  // (V4.240) إيداع/سحب البنك مثل سند القبض/الصرف بالنسبة لدفعات العملاء (بلا رقم إيصال)
  if (f && _glStr_(f.r[5]) === GL_ST_POSTED_ && _glCpEligible_(f.r[3], f.r[6])) {
    var e = _glEntryFull_(entryId), accs = _glAccounts_().map;
    var hid = _glScrHide_();
    e.lines.forEach(function (l) {
      var a = accs[l.account]; if (!a || a.kind !== 'client' || !a.link) return;
      if (hid['cp|' + entryId + '|' + a.link]) return;   // 🙈 محذوفة من الشاشة فقط بقرار المستخدم
      var ca = _glCpAmtOf_(l), amt = ca.amt; if (!amt) return;
      // 🐛 (V4.309) إصلاح: كانت الرحلة المحدَّدة صراحةً بالقيد تُستبدَل بـ«عام» ما لم يكن للعميل «بند» مسجَّل سلفاً
      // بنفس اسم الرحلة بالضبط — فحتى بعد تحديد الرحلة يدوياً بالقيد لا تظهر الدفعة تحتها. الآن تُؤخَذ الرحلة المحدَّدة
      // بالقيد كما هي (بلا شرط وجود بند مسبق) — تماماً كتسجيل الدفعة المباشر من شاشة حسابات العملاء (saveAccPayment)
      var trip = _glStr_(l.trip || e.trip) || 'عام';
      want.push([a.link, trip, 'دفعة', e.date, amt, ca.cur, '', (e.voucherNo ? 'إيصال ' + e.voucherNo + ' — ' : '') + (l.desc || e.desc || '') + ca.note + ' ' + tag]);
    });
  }
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), last = sh.getLastRow(), rowsIdx = [];
  // ⚡ (V4.307) بحث على الخادم (TextFinder) بدل نقل عمود البيان كاملاً مع كل حفظ قيد
  var tf = null; try { if (last >= 2) tf = sh.getRange(2, 9, last - 1, 1).createTextFinder(tag).matchCase(true).findAll().map(function (h) { return h.getRow(); }).sort(function (a, b) { return a - b; }); } catch (eTf) { tf = null; }
  if (tf) rowsIdx = tf;
  else if (last >= 2) sh.getRange(2, 9, last - 1, 1).getValues().forEach(function (r, i) { if (String(r[0]).indexOf(tag) >= 0) rowsIdx.push(i + 2); });
  // تحديث في المكان (يحافظ على المعرّف والتخصيص)، والزائد يُضاف والناقص يُحذف — 🐛 (V4.315) المطابقة بالعميل أولاً لا بالترتيب:
  // سند بعدة عملاء تغيّر أحد أطرافه كان يُكتب فوق دفعة عميل آخر (فتضيع رحلتها المعدَّلة يدوياً ومعرّفها)
  var cur = rowsIdx.map(function (rw) { var v = sh.getRange(rw, 2, 1, 2).getValues()[0]; return { row: rw, client: _glStr_(v[0]), trip: _glStr_(v[1]) }; });
  var pr = _glCpPair_(cur, want), toAdd = [];
  want.forEach(function (w, k) {
    var o = pr.assign[k]; if (!o) { toAdd.push(w); return; }
    sh.getRange(o.row, 2, 1, 8).setValues([[w[0], w[1] === 'عام' ? ((o.client === w[0] && o.trip) || 'عام') : w[1], w[2], w[3], w[4], w[5], w[6], w[7]]]);
  });
  pr.unused.map(function (o) { return o.row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { sh.deleteRow(rw); });
  for (var j = 0; j < toAdd.length; j++) {
    var w = toAdd[j];
    sh.appendRow([_accId_('P'), w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7], user || 'الحسابات العامة', new Date(), '']);   // (V4.330) بلا رقم تسلسلي قديم — رقم القيد هو المرجع
    // (V4.309) تسجيل ارتباط العميل بالرحلة — مثل saveAccPayment تماماً — حتى تظهر الرحلة بقوائمه ولا تُعامَل كأنها بلا حساب
    if (w[1] !== 'عام') try { _accEnsureMeta_(null, w[0], w[1], user || 'الحسابات العامة'); } catch (eEm) {}
  }
}

/* 🧑‍💼 (V4.328) مرآة قيود الوكلاء ⇒ شاشة «حسابات الوكلاء» (مثل مرآة دفعات العملاء _glCpSyncVoucher_):
   كل قيد يدوي مرحّل (سند صرف/قبض، إيداع/سحب بنكي، صفوف شيتات الخزينة/البنك/العهدة، تحويل بين طرفين، قيد يومية…) فيه سطر على
   حساب وكيل (فئة «وكيل» + «مرتبط بـ») يظهر بكشف الوكيل بعلامة مخفية ⟦src:gl-رقم القيد⟧ ورقم القيد بعمود القيد:
     • قيد نقدي (فيه خزينة/بنك/عهدة، أو من أنواع السندات/التحويل بين طرفين) ⇒ «دفعة» (AgentAccounts_Payments) — موجبة = مدفوع للوكيل
     • غير نقدي (قيد يومية/تسوية) ⇒ «بند» (AgentAccounts_Items): مدين حساب الوكيل = بند «مدين» يخصم من المستحق له، والدائن = بند «دائن»
   المبلغ = مدين − دائن سطور حساب الوكيل بعملة السطر (ريال/جنيه)، والحساب الفرعي للوكيل من شركة السطر أو القيد (_vzAcctKey_).
   تُحدَّث بتعديل القيد وتُحذف بإلغائه/حذفه، ولا يبنيها مولّد القيود التلقائية (AUTO:AP / AUTO:AI) فلا تُقيَّد مرتين.
   القيود الافتتاحية/المستوردة/التلقائية لا تُنسخ (للشاشة أرصدتها الافتتاحية وقيودها الخاصة). */
var GL_AP_TAG_RX_ = /⟦src:gl-([^⟧]+)⟧/;
var GL_AP_NOSYNC_TYPES_ = { 'قيد افتتاحي': 1, 'قيد مستورد': 1, 'قيد تلقائي': 1, 'قيد إقفال': 1 };
var GL_AP_CASH_TYPES_ = /^(سند قبض|سند صرف|إيداع بنكي|سحب بنكي|صرف عهدة|تسوية عهدة|تحويل نقدية|تحويل بين طرفين)$/;
var GL_AP_IDX_KEY_ = 'gl_apmir_idx';
var _GL_AP_NAMES_MEMO_ = null, _GL_AP_SEQ_ = 0;
function _glApEligible_(e) { return !!e && e.status === GL_ST_POSTED_ && !GL_AP_NOSYNC_TYPES_[e.type] && !/^(AUTO|CLOSE):/.test(_glStr_(e.sourceKey)); }
function _glApNewId_(p) { return _accId_(p) + 'g' + (++_GL_AP_SEQ_).toString(36); }
function _glApSheets_() {   // nc = عمود الملاحظات (مكان العلامة)
  return { pay: { sh: _accSheet_(VZ_PAY_SHEET, VZ_PAY_HEADERS), W: VZ_PAY_HEADERS.length, nc: 6, name: VZ_PAY_SHEET },
    item: { sh: _accSheet_(VZ_ITEMS_SHEET, VZ_ITEMS_HEADERS), W: VZ_ITEMS_HEADERS.length, nc: 7, name: VZ_ITEMS_SHEET } };
}
function _glApCtx_() {   // خريطة حسابات الوكلاء والأسماء — تُقرأ فقط عند وجود سطر وكيل فعلاً
  var c = { _m: null, _n: null };
  c.map = function () { return c._m || (c._m = _vzAcctMap_()); };
  c.names = function () { return c._n || (c._n = _glApAgentNames_()); };
  return c;
}
// الاسم كما هو بشاشة الوكلاء لكل اسم ربط (بلا حساسية للهمزات/المسافات) — من المجموعات والتسعير وإعدادات الحسابات
function _glApAgentNames_() {
  if (_GL_AP_NAMES_MEMO_) return _GL_AP_NAMES_MEMO_;
  var m = {}, col = function (name, headers, c) {
    try {
      var sh = _accSheet_(name, headers), last = sh.getLastRow();
      if (last >= 2) sh.getRange(2, c, last - 1, 1).getValues().forEach(function (r) { var n = _glStr_(r[0]), k = _glNorm_(n); if (n && !m[k]) m[k] = n; });
    } catch (e) {}
  };
  col(VZ_FILES_SHEET, VZ_FILES_HEADERS, 7); col(VZ_PRICES_SHEET, VZ_PRICES_HEADERS, 1); col(VZ_ACCT_SHEET, VZ_ACCT_HEADERS, 1);
  return (_GL_AP_NAMES_MEMO_ = m);
}
// سطور المرآة لقيد واحد: want [{sheet:'pay'|'item', acct, agent, cur, amt, date, desc, entryNo, vno, type, unknown, code}] + skipped (عملة غير مدعومة)
function _glApWant_(e, lines, accs, ctx) {
  var res = { want: [], skipped: [] };
  if (!_glApEligible_(e)) return res;
  var agL = lines.filter(function (l) { var a = accs[l.account]; return a && !a.isGroup && a.kind === 'agent' && _glStr_(a.link); });
  if (!agL.length) return res;
  var cash = GL_AP_CASH_TYPES_.test(e.type) || lines.some(function (l) { var a = accs[l.account]; return !!a && /^(safe|bank|custody)$/.test(a.kind || ''); });
  var by = {}, ord = [];
  agL.forEach(function (l) {
    var a = accs[l.account], cur = _glStr_(l.currency) || 'EGP';
    if (cur !== 'SAR' && cur !== 'EGP') { res.skipped.push({ id: e.id, code: a.code, name: a.name, cur: cur, amt: _glR2_(_glNum_(l.debit) - _glNum_(l.credit)) }); return; }
    var nm = ctx.names()[_glNorm_(a.link)], agent = nm || _glStr_(a.link);
    var acct = _vzAcctKey_(agent, _glStr_(l.company) || _glStr_(e.company), ctx.map()) || agent;
    var k = acct + '|' + cur, w = by[k];
    if (!w) { w = by[k] = { sheet: cash ? 'pay' : 'item', acct: acct, agent: agent, cur: cur, amt: 0, date: e.date, desc: '', entryNo: e.id, vno: e.voucherNo, type: e.type, unknown: !nm, code: a.code, accName: a.name }; ord.push(k); }
    w.amt += _glNum_(l.debit) - _glNum_(l.credit);
    if (!w.desc) w.desc = _glCleanDesc_(l.desc);
  });
  ord.forEach(function (k) { var w = by[k]; w.amt = _glR2_(w.amt); if (!w.amt) return; w.desc = w.desc || _glCleanDesc_(e.desc) || e.type; res.want.push(w); });
  return res;
}
// صف الشيت لسطر مرآة — old: الصف الحالي (يُحفظ معرّفه وبيانات إنشائه وترتيبه)
function _glApRow_(w, old) {
  var tag = ' ⟦src:gl-' + w.entryNo + '⟧';
  if (w.sheet === 'pay') return [old ? old[0] : _glApNewId_('AP'), w.acct, w.date, w.amt, w.cur, (w.vno ? 'سند ' + w.vno + ' — ' : '') + w.desc + tag, old ? old[6] : w.by, old ? old[7] : w.at, w.entryNo];
  return [old ? old[0] : _glApNewId_('AI'), w.acct, w.desc, w.cur, Math.abs(w.amt), w.amt > 0 ? 'نعم' : 'لا', w.type + ' بالحسابات العامة' + tag,
    old ? old[7] : 0, old ? old[8] : w.by, old ? old[9] : w.at, w.entryNo, w.date];
}
function _glApSame_(sheet, a, b) {
  var n = function (r) {
    return sheet === 'pay' ? [_glStr_(r[1]), _mfDate_(r[2]), _glR2_(_accNum_(r[3])), _glStr_(r[4]) || 'SAR', _glStr_(r[5]), _glStr_(r[8])]
      : [_glStr_(r[1]), _glStr_(r[2]), _glStr_(r[3]) || 'SAR', _glR2_(_accNum_(r[4])), _glStr_(r[5]), _glStr_(r[6]), _glStr_(r[10]), _mfDate_(r[11])];
  };
  return JSON.stringify(n(a)) === JSON.stringify(n(b));
}
// مطابقة صفوف القيد الحالية (have) بالمطلوب (want): نفس الشيت والحساب والعملة أولاً ثم أي صف بنفس الشيت — والزائد يُحذف.
// w.adopt: دفعة/بند يدوي قائم يُعتمد كنسخة القيد (دمج مكرر) بدل إضافة صف جديد
function _glApOps_(want, have, user) {
  var at = _mfStamp_(), ops = { upd: [], del: [], add: [] }, used = {}, asg = want.map(function () { return null; });
  var acctOf = function (h) { return _glStr_(h.vals[1]); }, curOf = function (h) { return _glStr_(h.vals[h.sheet === 'pay' ? 4 : 3]) || 'SAR'; };
  want.forEach(function (w, k) { for (var i = 0; i < have.length; i++) if (!used[i] && have[i].sheet === w.sheet && acctOf(have[i]) === w.acct && curOf(have[i]) === w.cur) { used[i] = 1; asg[k] = have[i]; return; } });
  want.forEach(function (w, k) { if (asg[k]) return; for (var i = 0; i < have.length; i++) if (!used[i] && have[i].sheet === w.sheet) { used[i] = 1; asg[k] = have[i]; return; } });
  want.forEach(function (w, k) {
    w.by = user || 'الحسابات العامة'; w.at = at;
    var h = asg[k] || w.adopt || null;
    if (h) { var nv = _glApRow_(w, h.vals); if (!asg[k] || !_glApSame_(w.sheet, h.vals, nv)) ops.upd.push({ sheet: w.sheet, row: h.row, vals: nv, old: h.vals, w: w, adopt: !asg[k] }); }
    else ops.add.push({ sheet: w.sheet, vals: _glApRow_(w, null), w: w });
  });
  have.forEach(function (h, i) { if (!used[i]) ops.del.push({ sheet: h.sheet, row: h.row, old: h.vals }); });
  return ops;
}
// الكتابة: تحديث بكتل متجاورة ← حذف بكتل من الأسفل ← إلحاق دفعة واحدة (أرقام الصفوف من نفس القراءة)
function _glApExec_(S, ops) {
  var n = { created: 0, updated: 0, deleted: 0 };
  ['pay', 'item'].forEach(function (t) {
    var s = S[t], up = ops.upd.filter(function (x) { return x.sheet === t; }).sort(function (a, b) { return a.row - b.row; });
    for (var i = 0; i < up.length;) {
      var j = i, block = [up[i].vals];
      while (j + 1 < up.length && up[j + 1].row === up[j].row + 1) { j++; block.push(up[j].vals); }
      var rg = s.sh.getRange(up[i].row, 1, block.length, s.W); if (t === 'item') rg.setNumberFormat('@'); rg.setValues(block);
      i = j + 1;
    }
    n.updated += up.length;
    var dl = ops.del.filter(function (x) { return x.sheet === t; });
    _glRowBlocks_(dl).forEach(function (b) { s.sh.deleteRows(b[0], b[1]); });
    n.deleted += dl.length;
    var ad = ops.add.filter(function (x) { return x.sheet === t; }).map(function (x) { return x.vals; });
    if (ad.length) { var rg2 = s.sh.getRange(s.sh.getLastRow() + 1, 1, ad.length, s.W); if (t === 'item') rg2.setNumberFormat('@'); rg2.setValues(ad); n.created += ad.length; }
  });
  if (n.created || n.updated || n.deleted) try { _vzClearCache_(); } catch (eC) {}
  return n;
}
// فهرس القيود التي لها نسخة بشاشة الوكلاء (كاش 6 ساعات) — يتخطّى البحث بالشيت تماماً لقيد لا علاقة له بالوكلاء
function _glApIdx_() {
  var C = CacheService.getScriptCache();
  try { var s = C.get(GL_AP_IDX_KEY_); if (s) return JSON.parse(s); } catch (e) {}
  var S = _glApSheets_(), idx = {};
  ['pay', 'item'].forEach(function (t) {
    var s2 = S[t], last = s2.sh.getLastRow(); if (last < 2) return;
    s2.sh.getRange(2, s2.nc, last - 1, 1).getValues().forEach(function (r) { var m = GL_AP_TAG_RX_.exec(String(r[0] == null ? '' : r[0])); if (m) idx[m[1]] = 1; });
  });
  _glApIdxSave_(idx);
  return idx;
}
function _glApIdxSave_(idx) {
  var C = CacheService.getScriptCache();
  try { C.put(GL_AP_IDX_KEY_, JSON.stringify(idx), 21600); } catch (e) { try { C.remove(GL_AP_IDX_KEY_); } catch (e2) {} }
}
// مزامنة قيد واحد (حفظ/ترحيل/إلغاء/حذف) — pre: {eRow, lRows} من الحفظ نفسه لتفادي إعادة البحث بالدفتر
function _glApSyncEntry_(entryId, user, pre) {
  entryId = _glStr_(entryId); if (!entryId) return null;
  var eRow = pre && pre.eRow;
  if (!eRow) { var f = _glFindEntry_(entryId); eRow = f ? f.r : null; }
  var e = eRow ? _glEntryObj_(eRow) : null, want = [];
  if (_glApEligible_(e)) want = _glApWant_(e, ((pre && pre.lRows) || _glLinesOf_(entryId)).map(_glLineObj_), _glAccounts_().map, _glApCtx_()).want;
  var idx = _glApIdx_();
  if (!want.length && !idx[entryId]) return null;
  var S = _glApSheets_(), tag = '⟦src:gl-' + entryId + '⟧', have = [];
  ['pay', 'item'].forEach(function (t) {
    var s = S[t], last = s.sh.getLastRow(); if (last < 2) return;
    var rg = s.sh.getRange(2, s.nc, last - 1, 1), rows = null;
    try { rows = rg.createTextFinder(tag).matchCase(true).findAll().map(function (h) { return h.getRow(); }); } catch (eTf) { rows = null; }
    if (!rows) { rows = []; rg.getValues().forEach(function (r, i) { if (String(r[0]).indexOf(tag) >= 0) rows.push(i + 2); }); }
    rows.forEach(function (rw) { have.push({ sheet: t, row: rw, vals: s.sh.getRange(rw, 1, 1, s.W).getValues()[0] }); });
  });
  var n = _glApExec_(S, _glApOps_(want, have, user));
  if (want.length) idx[entryId] = 1; else delete idx[entryId];
  _glApIdxSave_(idx);
  return n;
}
// مزامنة عدة قيود من صفوفها بالذاكرة (قيود شيتات الخزينة/البنك/العهدة) — قراءة واحدة لشيتي الوكلاء لو لزم
function _glApSyncRows_(eRows, lRows, user) {
  var byE = {}; (lRows || []).forEach(function (l) { var id = _glStr_(l[0]); if (id) (byE[id] = byE[id] || []).push(l); });
  var accs = _glAccounts_().map, ctx = _glApCtx_(), idx = null, items = [];
  (eRows || []).forEach(function (r) {
    var e = _glEntryObj_(r), want = _glApEligible_(e) ? _glApWant_(e, (byE[e.id] || []).map(_glLineObj_), accs, ctx).want : [];
    if (!want.length) { if (!idx) idx = _glApIdx_(); if (!idx[e.id]) return; }
    items.push({ id: e.id, want: want });
  });
  if (!items.length) return null;
  var P = _glApLoad_(), ops = { upd: [], del: [], add: [] };
  items.forEach(function (it) { var o = _glApOps_(it.want, P.have[it.id] || [], user); ops.upd = ops.upd.concat(o.upd); ops.del = ops.del.concat(o.del); ops.add = ops.add.concat(o.add); });
  var n = _glApExec_(P.S, ops);
  idx = idx || _glApIdx_(); items.forEach(function (it) { if (it.want.length) idx[it.id] = 1; else delete idx[it.id]; }); _glApIdxSave_(idx);
  return n;
}
// قراءة شيتي الوكلاء كاملين مرة واحدة: النسخ الموسومة لكل قيد (have) والصفوف اليدوية (manual) ومفاتيح الحسابات الموجودة
function _glApLoad_() {
  var S = _glApSheets_(), have = {}, manual = { pay: [], item: [] }, keys = {};
  ['pay', 'item'].forEach(function (t) {
    var s = S[t], last = s.sh.getLastRow(); if (last < 2) return;
    s.sh.getRange(2, 1, last - 1, s.W).getValues().forEach(function (r, i) {
      if (!_glStr_(r[0])) return;
      var h = { sheet: t, row: i + 2, vals: r }, m = GL_AP_TAG_RX_.exec(_glStr_(r[s.nc - 1]));
      if (m) (have[m[1]] = have[m[1]] || []).push(h); else manual[t].push(h);
      if (_glStr_(r[1])) keys[_glStr_(r[1])] = 1;
    });
  });
  return { S: S, have: have, manual: manual, keys: keys };
}
/* 🔁 (V4.328) مزامنة شاملة لقيود الوكلاء من الحسابات العامة (للمدير) — معاينة أولاً (dry) ثم تنفيذ:
   تنسخ كل قيد قديم لم يُنسخ، وتصحّح النسخ التي تغيّر قيدها، وتحذف نسخ القيود الملغاة/المحذوفة. وتكشف «المكرر المحتمل»: دفعة/بند
   مسجَّل يدوياً بشاشة الوكيل لنفس الحساب والعملة والمبلغ (برقم القيد نفسه بعمود القيد، أو بفارق ≤ win أيام) — يُقترح «دمجه»:
   يصير السطر اليدوي نسخة القيد نفسه (يبقى معرّفه وتاريخ إنشائه)، فيُلغى قيده التلقائي AUTO:AP/AUTO:AI ولا يُسجَّل المبلغ مرتين.
   opts: { noMerge: {مفتاح: 1} — مكررات اختار المستخدم إبقاءها منفصلة، win: أيام نافذة التطابق (افتراضي 3) } */
function _glApResyncPlan_(opts) {
  opts = opts || {};
  var win = parseInt(opts.win, 10); if (isNaN(win) || win < 0) win = 3;
  var noMerge = opts.noMerge || {}, accs = _glAccounts_().map, ctx = _glApCtx_(), P = _glApLoad_();
  var linesBy = {}; _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (id) (linesBy[id] = linesBy[id] || []).push(l); });
  var ents = {}, items = [], skipped = [], excluded = {}, unknown = {}, scanned = 0;
  var isAgL = function (ls) { return ls.some(function (l) { var a = accs[_glStr_(l[4])]; return a && !a.isGroup && a.kind === 'agent'; }); };
  _glRows_('entries').forEach(function (r) {
    var id = _glStr_(r[0]); if (!id) return;
    var e = _glEntryObj_(r), ls = linesBy[id] || []; ents[id] = 1;
    if (!_glApEligible_(e)) {
      if (e.status === GL_ST_POSTED_ && GL_AP_NOSYNC_TYPES_[e.type] && !/^AUTO:/.test(e.sourceKey) && isAgL(ls)) excluded[e.type] = (excluded[e.type] || 0) + 1;
      if (P.have[id]) items.push({ id: id, e: e, want: [] });
      return;
    }
    var wr = _glApWant_(e, ls.map(_glLineObj_), accs, ctx);
    if (wr.want.length || wr.skipped.length) scanned++;
    skipped = skipped.concat(wr.skipped);
    wr.want.forEach(function (w) { if (w.unknown && !P.keys[w.agent] && !unknown[w.code]) unknown[w.code] = { code: w.code, name: w.accName, link: w.agent }; });
    if (wr.want.length || P.have[id]) items.push({ id: id, e: e, want: wr.want });
  });
  Object.keys(P.have).forEach(function (id) { if (!ents[id]) items.push({ id: id, e: null, want: [] }); });   // قيد حُذف نهائياً
  // المكرر المحتمل: لكل سطر سيُضاف (لا نسخة له) ⇒ أقرب سطر يدوي مطابق (رقم القيد أولاً ثم أقرب تاريخ) — تخصيص واحد لواحد
  var dayOf = function (d) { var k = _glDKey_(d); return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : NaN; };
  var digits = function (s) { return _glStr_(s).replace(/\D+/g, '').replace(/^0+/, ''); };
  var pairs = [], mIdx = { pay: {}, item: {} };   // السطور اليدوية مفهرسة بالعملة والمبلغ الموقَّع (بدل مسحها كلها لكل قيد)
  ['pay', 'item'].forEach(function (t) {
    P.manual[t].forEach(function (h, mi) {
      var r = h.vals, amt = t === 'pay' ? _glR2_(_accNum_(r[3])) : _glR2_((_glStr_(r[5]) === 'نعم' ? 1 : -1) * _accNum_(r[4]));
      if (!amt) return;
      h.mk = t + ':' + mi;
      var k = (_glStr_(r[t === 'pay' ? 4 : 3]) || 'SAR') + '|' + amt.toFixed(2); (mIdx[t][k] = mIdx[t][k] || []).push(h);
    });
  });
  items.forEach(function (it) {
    var base = _glApOps_(it.want, P.have[it.id] || [], '');
    base.add.forEach(function (a) {
      var w = a.w;
      (mIdx[w.sheet][w.cur + '|' + w.amt.toFixed(2)] || []).forEach(function (h) {
        var r = h.vals, acct = _glStr_(r[1]);
        if (!(acct === w.acct || acct === w.agent || acct.indexOf(w.agent + ' - ') === 0)) return;
        var dd = Math.abs(dayOf(_mfDate_(r[w.sheet === 'pay' ? 2 : 11])) - dayOf(w.date)); if (isNaN(dd)) dd = 9999;
        var en = digits(r[w.sheet === 'pay' ? 8 : 10]), strong = !!en && (en === digits(w.entryNo) || (!!w.vno && en === digits(w.vno)));
        if (!strong && dd > win) return;
        pairs.push({ w: w, h: h, mk: h.mk, strong: strong, dd: dd });
      });
    });
  });
  pairs.sort(function (a, b) { return (b.strong - a.strong) || (a.dd - b.dd); });
  var takenW = [], takenH = {}, dups = [];
  pairs.forEach(function (p) {
    if (takenW.indexOf(p.w) >= 0 || takenH[p.mk]) return;
    takenW.push(p.w); takenH[p.mk] = 1;
    var key = p.w.entryNo + '|' + p.w.sheet + '|' + p.w.acct + '|' + p.w.cur, merge = !noMerge[key], r = p.h.vals;
    if (merge) p.w.adopt = p.h;
    dups.push({ key: key, merge: merge, strong: p.strong, days: p.dd, entryNo: p.w.entryNo, vno: p.w.vno || '', date: p.w.date, acct: p.w.acct, sheet: p.w.sheet, amt: p.w.amt, cur: p.w.cur, desc: p.w.desc,
      manual: { id: _glStr_(r[0]), date: _mfDate_(r[p.w.sheet === 'pay' ? 2 : 11]), notes: _glCleanDesc_(r[p.w.sheet === 'pay' ? 5 : 2]), entryNo: _glStr_(r[p.w.sheet === 'pay' ? 8 : 10]), by: _glStr_(r[p.w.sheet === 'pay' ? 6 : 8]) } });
  });
  var ops = { upd: [], del: [], add: [] };
  items.forEach(function (it) { var o = _glApOps_(it.want, P.have[it.id] || [], opts.user || ''); ops.upd = ops.upd.concat(o.upd); ops.del = ops.del.concat(o.del); ops.add = ops.add.concat(o.add); });
  return { P: P, items: items, ops: ops, dups: dups, skipped: skipped, unknown: Object.keys(unknown).map(function (k) { return unknown[k]; }), excluded: excluded, scanned: scanned };
}
function glApMirrorResync(authToken, dry, opts) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('مزامنة قيود الوكلاء من الحسابات العامة للمدير فقط');
  opts = Object.assign({}, opts || {}, { user: session.username });
  var row = function (x, kind) {
    var w = x.w || {}, v = x.vals || x.old || [], pay = x.sheet === 'pay';
    return { kind: kind, sheet: x.sheet, entryNo: w.entryNo || _glStr_(v[pay ? 8 : 10]), date: w.date || _mfDate_(v[pay ? 2 : 11]), acct: w.acct || _glStr_(v[1]),
      amt: w.amt !== undefined ? w.amt : (pay ? _glR2_(_accNum_(v[3])) : _glR2_((_glStr_(v[5]) === 'نعم' ? 1 : -1) * _accNum_(v[4]))), cur: w.cur || _glStr_(v[pay ? 4 : 3]) || 'SAR',
      desc: w.desc || _glCleanDesc_(v[pay ? 5 : 2]) };
  };
  var summary = function (R) {
    var rows = R.ops.add.map(function (x) { return row(x, 'new'); })
      .concat(R.ops.upd.map(function (x) { return row(x, x.adopt ? 'merge' : 'update'); }))
      .concat(R.ops.del.map(function (x) { return row(x, 'delete'); }));
    return { scanned: R.scanned, create: R.ops.add.length, update: R.ops.upd.filter(function (x) { return !x.adopt; }).length, merge: R.ops.upd.filter(function (x) { return x.adopt; }).length,
      del: R.ops.del.length, rows: rows.slice(0, 600), rowsN: rows.length, dups: R.dups.slice(0, 300), dupsN: R.dups.length,
      skipped: R.skipped.slice(0, 100), unknown: R.unknown.slice(0, 100), excluded: R.excluded };
  };
  if (dry) return Object.assign({ success: true, dry: true }, summary(_glApResyncPlan_(opts)));
  var lock = _glLock_(); lock.waitLock(150000);
  try {
    var R = _glApResyncPlan_(opts), out = summary(R);
    var n = _glApExec_(R.P.S, R.ops);
    var idx = {}; R.items.forEach(function (it) { if (it.want.length) idx[it.id] = 1; });   // كل قيد له نسخة قائمة ضمن items أصلاً
    _glApIdxSave_(idx);
    // السطور اليدوية التي دُمجت صارت نسخة القيد ⇒ قيدها التلقائي يختفي من البناء فيُلغى (بلا انتظار اعتماد — قرار صريح من المدير)
    var keys = R.ops.upd.filter(function (x) { return x.adopt; }).map(function (x) { return (x.sheet === 'pay' ? 'AUTO:AP:' : 'AUTO:AI:') + _glStr_(x.vals[0]); }), ar = null;
    R.ops.upd.filter(function (x) { return x.adopt; }).forEach(function (x) {
      logChange_(session.username, 'دمج ' + (x.sheet === 'pay' ? 'دفعة' : 'بند') + ' وكيل مع قيد الحسابات العامة', (x.sheet === 'pay' ? 'AP:' : 'AI:') + _glStr_(x.vals[0]),
        'القيد', _glStr_(x.old[x.sheet === 'pay' ? 5 : 2]) + ' — ' + _glStr_(x.old[x.sheet === 'pay' ? 3 : 4]), x.w.entryNo);
    });
    if (keys.length) try { ar = _glAutoRun_(session.username, false, { bypass: true, onlyKeys: keys }); } catch (eA) { ar = { error: eA.message }; }
    logChange_(session.username, 'مزامنة قيود الوكلاء من الحسابات العامة', 'GL:apmirror', '-', '-',
      'جديدة ' + n.created + ' · محدَّثة ' + (out.update) + ' · مدموجة ' + out.merge + ' · محذوفة ' + n.deleted);
    return Object.assign({ success: true, dry: false, written: n, autoVoided: ar ? (ar.voided || 0) : 0, autoBlocked: ar && ar.blocked ? ar.blocked.length : 0, autoError: ar && ar.error || '' }, out);
  } finally { _glUnlock_(lock); }
}

/* 🏨 (V4.326) مرآة حجوزات الفنادق ⇒ بنود حسابات عملاء العمرة (مثل مرآة سندات الدفعات _glCpSyncVoucher_):
   كل قيد حجز مرحّل AUTO:HB:<مفتاح> على حساب عميل (kind=client + link) يصبح بنداً بحساب العميل (link) بقيمة سطر العميل وعملته
   وبيانه، بعلامة ⟦src:HB.<مفتاح مرمَّز>⟧. الرحلة عند الإنشاء: رحلة القيد لو نمطها للعميل «بنود»، وإلا «عام» — وبعدها لا تُمس أبداً
   (تخصيص المستخدم). تغيّر القيمة/البيان/العميل ⇒ يُحدَّث البند؛ أُلغي القيد/حُذف ⇒ يُحذف البند. الحساب غير المحدد = كل العملاء. */
// 🏨 (V4.330) عدد الغرف + الليالي + سعر الغرفة/الليلة من بيان سطر العميل بقيد الحجز (حجز X فندق من..إلى.. (2 دبل × 150 ريال + 1 ثلاثي × 200 ريال)
// لمدة (3) ليالي) — بلا قراءة ملف الحجوزات. السعر = القيمة ÷ (الغرف × الليالي) فيطابق العدد × السعر × الليالي القيمةَ المقيَّدة.
// لو تعذّر التحليل (بيان قديم/ناقص) ⇒ عدد 1 وسعر = القيمة وبلا ليالٍ كما كان.
function _accHbParse_(desc, amt) {
  var d = _glStr_(desc), rooms = 0, m, rx = /(\d+(?:\.\d+)?)\s+([^\s×()]+)\s*×\s*[\d.,]+\s*ريال/g;
  while ((m = rx.exec(d))) rooms += parseFloat(m[1]) || 0;
  var nm = /لمدة\s*\((\d+(?:\.\d+)?)\)/.exec(d), nights = nm ? parseFloat(nm[1]) || 0 : 0;
  if (!(rooms > 0) || !(nights > 0) || !(amt > 0)) return { rooms: 1, nights: '', price: amt };
  return { rooms: rooms, nights: nights, price: Math.round(amt / (rooms * nights) * 10000) / 10000 };
}
function _accHbMirror_(onlyClient, user) {
  if (!_glSSId_()) return { skipped: 'no-gl' };
  var lk = LockService.getScriptLock(), own = false;
  try { if (!lk.hasLock()) { if (!lk.tryLock(15000)) return { busy: true }; own = true; } } catch (eL) { return { busy: true }; }
  var C = CacheService.getScriptCache(), ck = onlyClient ? ('hbm_' + _accHbEnc_(_glNorm_(onlyClient)).slice(0, 80) + '_' + _glVer_()) : '';
  try { if (ck && C.get(ck)) return { cached: true }; } catch (eC) {}   // لا تغيير بالحسابات العامة منذ آخر مزامنة لهذا العميل
  try {
    var map = _glAccounts_().map, ents = {}, want = {};
    _glRows_('entries').forEach(function (r) { var k = _glStr_(r[6]); if (k.indexOf('AUTO:HB:') === 0 && _glStr_(r[5]) === GL_ST_POSTED_) ents[_glStr_(r[0])] = r; });
    _glRows_('lines').forEach(function (l) {
      var e = ents[_glStr_(l[0])]; if (!e) return;
      var a = map[_glStr_(l[4])]; if (!a || a.isGroup || a.kind !== 'client' || !a.link) return;
      var cur = _glStr_(l[7]) || 'SAR'; if (cur !== 'SAR' && cur !== 'EGP') return;
      var key = _glStr_(e[6]).slice(8), w = want[key];
      if (!w) w = want[key] = { key: key, client: _glStr_(a.link), code: a.code, amt: 0, cur: cur, desc: '', trip: _glStr_(l[11]) || _glStr_(e[10]) };
      if (a.code !== w.code) return;   // طرف عميل واحد لكل حجز
      w.amt += _glNum_(l[5]) - _glNum_(l[6]);
      if (!w.desc) w.desc = _glCleanDesc_(l[15]) || _glCleanDesc_(e[4]);
    });
    var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS), W = ACC_ITEMS_HEADERS.length, last = iSh.getLastRow();
    var vals = last >= 2 ? iSh.getRange(2, 1, last - 1, W).getValues() : [];
    var names = {}, have = {}, modeOf = {}, nz = function (x) { return _glNorm_(x); };
    vals.forEach(function (r, i) { var cl = _glStr_(r[1]); if (cl && !names[nz(cl)]) names[nz(cl)] = cl; var k = _accHbKeyOf_(r[3]); if (k) (have[k] = have[k] || []).push(i); });
    var mSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS);
    if (mSh.getLastRow() >= 2) mSh.getRange(2, 1, mSh.getLastRow() - 1, 3).getValues().forEach(function (r) { var cl = _glStr_(r[0]); if (!cl) return; if (!names[nz(cl)]) names[nz(cl)] = cl; modeOf[cl + '|' + _glStr_(r[1])] = _glStr_(r[2]); });
    var only = onlyClient ? nz(onlyClient) : '', now = new Date(), who = user || 'الحسابات العامة', hidH = _glScrHide_();
    var initTrip = function (cl, t) { return t && modeOf[cl + '|' + t] === 'بنود' ? t : 'عام'; };
    var touched = {}, adds = [], dels = {}, nUpd = 0;
    Object.keys(want).forEach(function (k) {
      var w = want[k]; w.amt = _glR2_(w.amt); if (!w.amt) return;
      var cl = names[nz(w.client)] || w.client, rows = have[k] || [];
      if (only && nz(cl) !== only && !rows.some(function (i) { return nz(vals[i][1]) === only; })) return;
      var desc = w.desc + ' ⟦src:HB.' + _accHbEnc_(k) + '⟧';
      var pz = _accHbParse_(w.desc, w.amt);   // 🏨 (V4.330) الغرف/الليالي/السعر بأعمدتها المستقلة بجانب بيان الحجز
      if (!rows.length && hidH['hb|' + k + '|' + cl]) return;   // 🙈 حُذف من الشاشة فقط
      if (!rows.length) { adds.push([_accId_('I'), cl, initTrip(cl, w.trip), desc, 'أخرى', w.cur, pz.rooms, pz.price, w.amt, 'لا', '', who, now, '', '', pz.nights, '', '', '', 'نعم']); return; }
      rows.slice(1).forEach(function (j) { dels[j] = 1; });   // مكرر لنفس الحجز
      var r = vals[rows[0]], same = nz(r[1]) === nz(cl);
      if (same && _glStr_(r[3]) === desc && _glR2_(_accNum_(r[8])) === w.amt && _glStr_(r[5]) === w.cur && _glStr_(r[19]) === 'نعم' &&
        _accNum_(r[6]) === pz.rooms && _accNum_(r[15]) === _accNum_(pz.nights) && Math.abs(_accNum_(r[7]) - pz.price) < 0.00005) return;
      if (!same) { r[1] = cl; r[2] = initTrip(cl, w.trip); }
      r[3] = desc; r[4] = r[4] || 'أخرى'; r[5] = w.cur; r[6] = pz.rooms; r[7] = pz.price; r[8] = w.amt; r[9] = 'لا'; r[13] = who; r[14] = now; r[15] = pz.nights; r[17] = ''; r[19] = 'نعم';
      touched[rows[0]] = 1; nUpd++;
    });
    Object.keys(have).forEach(function (k) {
      if (want[k] && want[k].amt) return;   // القيد قائم
      have[k].forEach(function (i) { if (!only || nz(vals[i][1]) === only) dels[i] = 1; });
    });
    Object.keys(touched).forEach(function (i) { i = +i; if (!dels[i]) iSh.getRange(i + 2, 1, 1, W).setValues([vals[i]]); });
    if (adds.length) iSh.getRange(iSh.getLastRow() + 1, 1, adds.length, W).setValues(adds);
    var dl = Object.keys(dels).map(Number).sort(function (a, b) { return b - a; });
    dl.forEach(function (i) { iSh.deleteRow(i + 2); });
    if (adds.length || dl.length || nUpd) {
      try { _ACC_HB_CITY_MEMO_ = null; } catch (eM) {}
      try { logChange_(who, 'مزامنة حجوزات الفنادق لحسابات العملاء', 'GL:hbmirror', onlyClient || 'كل العملاء', '-', 'إضافة ' + adds.length + ' · تحديث ' + nUpd + ' · حذف ' + dl.length); } catch (eLg) {}
    }
    if (ck) try { C.put(ck, '1', 21600); } catch (eC2) {}
    return { added: adds.length, updated: nUpd, removed: dl.length };
  } finally { if (own) try { lk.releaseLock(); } catch (eR) {} }
}

// 📘 رقم قيد الرحلة لكل رحلة بحساب العميل (لشاشة حسابات العملاء)
function _glClientLinks_(client) {
  if (!_glSSId_()) return null;
  // (V4.259) + رقم قيد كل دفعة (AUTO:CP:<معرّف الدفعة>) — وأرقام قيود الرحلات في وضع قيود الرحلات فقط
  client = _glStr_(client); var tm = _glTripMode_(), pre = 'AUTO:TRIP:' + client + '|', preCi = 'AUTO:CI:' + client + '|', out = { __tm: tm, __pay: {}, __hb: {}, __ct: {} }, pend = _glPendingRows_(), myPays = {}, myHb = {};
  try {
    var pSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS);
    if (pSh.getLastRow() >= 2) pSh.getRange(2, 1, pSh.getLastRow() - 1, 9).getValues().forEach(function (r) {
      if (_glStr_(r[1]) !== client) return;
      var gm = /⟦src:gl-([^⟧]+)⟧/.exec(String(r[8] == null ? '' : r[8]));
      if (gm) out.__pay[_glStr_(r[0])] = { id: gm[1], pending: false, src: 1 };   // 🔁 (V4.330) نسخة قيد بالحسابات العامة — رقمه من العلامة مباشرة
      else myPays['AUTO:CP:' + _glStr_(r[0])] = _glStr_(r[0]);
    });
    // 🏨 (V4.326) أرقام قيود حجوزات الفنادق المنقولة لحساب العميل
    var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS);
    if (iSh.getLastRow() >= 2) iSh.getRange(2, 1, iSh.getLastRow() - 1, 4).getValues().forEach(function (r) { if (_glStr_(r[1]) !== client) return; var hk = _accHbKeyOf_(r[3]); if (hk) myHb['AUTO:HB:' + hk] = hk; });
  } catch (eP) {}
  _glRows_('entries').forEach(function (r) {
    var k = _glStr_(r[6]); if (_glStr_(r[5]) === GL_ST_VOID_) return;
    var isP = pend[k] && _glStr_(pend[k].row[9]) !== 'مرفوض';
    if (k.indexOf(preCi) === 0) out.__ct[k.slice(preCi.length)] = { id: _glStr_(r[0]), pending: !!isP };   // 📘 (V4.336) قيد استحقاقات كل رحلة (يضم بنودها) — يظهر بجوار كل بند
    if (k.indexOf(pre) === 0) { out.__ct[k.slice(pre.length)] = { id: _glStr_(r[0]), pending: !!isP }; }
    if (tm && k.indexOf(pre) === 0) out[k.slice(pre.length)] = { id: _glStr_(r[0]), pending: !!isP };
    else if (myPays[k]) out.__pay[myPays[k]] = { id: _glStr_(r[0]), pending: !!isP };
    else if (myHb[k]) out.__hb[myHb[k]] = { id: _glStr_(r[0]), pending: !!isP };
  });
  return out;
}
// ⚡ (V4.236) تحديث رقم قيد الرحلة بشاشة حسابات العملاء بعد المزامنة — بدل إعادة تحميل حساب العميل كاملاً (7-10 ثوانٍ)
function glClientLinks(authToken, client) {
  _accPerm_(authToken, 'view');
  return { success: true, client: _glStr_(client), gl: _glClientLinks_(client) };
}

// 🧹 إعادة بناء قيود الرحلات (للمدير): نسخة احتياطية ⇒ حذف القيود التلقائية القديمة للرحلات ⇒ تحويل 4101 لمجموعة
// «إيرادات رحلات العمرة» ⇒ تفعيل الوضع الجديد ⇒ تسجيل كل القيود بالشكل الجديد مباشرة
var GL_TRIP_REBUILD_RX_ = /^AUTO:(CI|VZ|TR|MF|TRIP):|^AUTO:OPEN$/;
function glTripRebuild(authToken, dry) {
  var session = _glAdminPerm_(authToken);
  var lock = _glLock_(); lock.waitLock(120000);
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
    (function () { var keepP = {}, cur = _glPendingRows_(); Object.keys(cur).forEach(function (k) { if (!/^AUTO:/.test(k)) keepP[k] = cur[k].row; }); _glPendingWrite_(keepP); })();   // ✅ (V4.323) تبقى بنود مراجعة العملة وغيرها
    try { _glOvrDrop_(hits.map(function (h) { return _glStr_(h.r[6]); }), ['freeze']); } catch (eOv) {}   // ✍️ (V4.320) القيود حُذفت وتُبنى من جديد ⇒ لا تجميد معلَّق (تبقى قواعد الحساب/البيان)
    var r = _glAutoRun_(session.username, false, { bypass: true });
    _glAutoSaveLast_(r, session.username);
    var tb = 0, tc = 0; try { _glRows_('lines').forEach(function (l) { if (_glStr_(l[3]) === GL_ST_POSTED_) { tb += _glNum_(l[9]); tc += _glNum_(l[10]); } }); } catch (e) {}
    logChange_(session.username, 'إعادة بناء قيود الرحلات', 'GL:auto', 'القيود التلقائية', 'حُذف ' + hits.length + ' (نسخة: ' + bkName + ')',
      'جديد ' + r.created + (moved ? ' — أُعيد ترقيم 4101 القديم إلى ' + moved : ''));
    info.dry = false; info.deleted = hits.length; info.backup = bkName; info.movedOld4101 = moved; info.created = r.created; info.updated = r.updated;
    info.errors = r.errors.slice(0, 50); info.warnings = r.warnings; info.trial = { debit: _glR2_(tb), credit: _glR2_(tc) };
    return info;
  } finally { _glUnlock_(lock); }
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
  var s = [_glR2_(x.inAmt), _glR2_(x.outAmt), x.date, x.desc, x.hint].join('|') + (x.cur ? '|' + x.cur : ''), h = 5381;
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
// 🏦 (V4.262) شيت خزينة/بنك (أو عهدة) متعدد العملات: عمودا وارد/صادر لكل عملة (العملة = عمود القيمة) + عمود «ok»
// (الصف سُجّل من شاشات البرنامج ⇒ يُربط بقيده القائم بدل تسجيله مرتين) — كلها اختيارية (فارغ = غير مستخدم)
var GL_CS_COLS_OPT_ = { inEGP: '', outEGP: '', inSAR: '', outSAR: '', inUSD: '', outUSD: '', ok: '', fee: '' };   // (V4.290) fee = مصاريف بنكية (شيت البنك)
// 🏦 (V4.290) حساب «المصروفات البنكية» الافتراضي لعمود مصاريف البنك: بالاسم من الدليل وإلا 5204
function _glBankFeeAcc_() {
  var accs = _glAccounts_(), rx = /(مصروفات|مصاريف|عمولات|رسوم)\s*(ال)?بنك/;
  var hit = accs.list.filter(function (a) { return !a.isGroup && a.active && rx.test(_glStr_(a.name)); })[0];
  if (hit) return hit.code;
  var d = accs.map['5204']; return d && !d.isGroup && d.active ? '5204' : '';
}
function _glColIdx_(L) { L = _glStr_(L).toUpperCase(); var n = 0; for (var i = 0; i < L.length; i++) n = n * 26 + (L.charCodeAt(i) - 64); return n - 1; }
function _glCsCols_(cfg) {
  var c = Object.assign({}, GL_CS_COLS_DEF_, GL_CS_COLS_OPT_, (cfg && cfg.cols) || {}), o = {};
  Object.keys(GL_CS_COLS_DEF_).forEach(function (k) { o[k] = _glColIdx_(/^[A-Z]{1,2}$/i.test(_glStr_(c[k])) ? c[k] : GL_CS_COLS_DEF_[k]); });
  Object.keys(GL_CS_COLS_OPT_).forEach(function (k) { o[k] = /^[A-Z]{1,2}$/i.test(_glStr_(c[k])) ? _glColIdx_(c[k]) : -1; });
  o.multi = ['inEGP', 'outEGP', 'inSAR', 'outSAR', 'inUSD', 'outUSD'].some(function (k) { return o[k] >= 0; });
  if (o.multi) { o.in = -1; o.out = -1; }   // (V4.271) أعمدة العملات تُغني عن الوارد/الصادر العام — لا يُقرأ عمود عام (A/B الافتراضيان) ولا يتداخل معها
  o.letters = c; return o;
}
function _glCsReadRows_(sh, startRow, cfg) {
  var last = sh.getLastRow(), out = [], C = _glCsCols_(cfg), OLD = 5;   // F = عمود رقم القيد القديم (ترحيل تلقائي لأرقام JE- المكتوبة فيه)
  if (last < startRow) return out;
  var W = Math.max(C.in, C.out, C.desc, C.date, C.party, C.qaid, OLD, C.inEGP, C.outEGP, C.inSAR, C.outSAR, C.inUSD, C.outUSD, C.ok, C.fee) + 1;
  W = Math.max(W, Math.min(26, sh.getLastColumn() || W));   // (V4.249) قراءة كل أعمدة الصف لاكتشاف صفوف «الإجمالي»
  // (V4.273) صف «الإجماليات/المجموع» = نهاية الشيت: آخر صف يُزامَن هو ما قبله، وكل ما بعده (إجماليات/أرصدة/جداول أخرى) لا يُقرأ
  var stop = false, TOT = /^\s*((ال)?[اإأ]جمال[يى](ات)?|(ال)?مجموع(ات)?)(\s|$|:|\/)/;
  sh.getRange(startRow, 1, last - startRow + 1, W).getValues().forEach(function (r, i) {
    if (stop) return;
    if (r.some(function (v) { return typeof v === 'string' && TOT.test(v); })) { stop = true; return; }
    var num = function (ci) { return ci < 0 || r[ci] instanceof Date ? 0 : _glR2_(_glNum_(r[ci])); };
    var raw = _glStr_(r[C.qaid]);
    // 🗓️ (V4.300) تاريخ صف العهدة: سنة غير منطقية (خطأ إدخال بالشيت مثل 0202/202 — أقل من 2000) تُعتبر خطأ كتابة في
    // السنة فقط، فنُصحِّح السنة إلى السنة الحالية مع إبقاء اليوم/الشهر كما بالشيت (07/10/0202 ⇒ 07/10/2026) — فيُسجَّل
    // الصف كقيد جديد بتاريخه الصحيح بدل رفضه بـ«تاريخ قبل بداية الحسابات»، مع ملاحظة شفافة قصيرة بالبيان. ثابت (لا يتغيّر يومياً).
    var _dte = _glDate_(r[C.date]), _ym = _dte.match(/^(\d{2}\/\d{2})\/(\d{4})$/), _badDate = '';
    if (_ym && parseInt(_ym[2], 10) < 2000) { _badDate = _dte; _dte = _ym[1] + '/' + Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'yyyy'); }
    var x = { row: startRow + i, inAmt: num(C.in), outAmt: num(C.out),
      desc: _glStr_(r[C.desc]) + (_badDate ? ' [صُحِّحت سنة التاريخ من «' + _badDate + '»]' : ''),
      date: _dte, f: raw, hint: _glStr_(r[C.party]) };
    if (_badDate) x.badDate = _badDate;
    var parts = null;
    if (C.multi) {   // (V4.262) العملة = العمود الذي فيه القيمة — (V4.273) أكثر من عملة بالصف ⇒ يُفصل لقيد مستقل لكل عملة
      var hit = ['EGP', 'SAR', 'USD'].filter(function (c) { return num(C['in' + c]) || num(C['out' + c]); });
      if (hit.length) { x.cur = hit[0]; x.inAmt = num(C['in' + hit[0]]); x.outAmt = num(C['out' + hit[0]]); if (hit.length > 1) parts = hit; }
      else if (!x.inAmt && !x.outAmt) x.inAmt = x.outAmt = 0;
    }
    if (C.ok >= 0) x.ok = /^(ok|تم|نعم|yes|✓|✔|✅|x|y|1)$/i.test(_glStr_(r[C.ok]).trim());
    if (!x.f && C.qaid !== OLD && /^JE-\d{6}$/.test(_glStr_(r[OLD]))) { x.f = _glStr_(r[OLD]); x.fOld = 1; }
    // 🏦 (V4.290) عمود المصاريف البنكية: جزء مستقل من نفس الصف بقيد خاص (طرفه الافتراضي «المصروفات البنكية») ورقم قيده
    // يُكتب بجوار رقم قيد الصف في نفس الخلية «JE-1 | JE-2» — يُعتمد مثل الطرف الناقص ويمكن تغيير حسابه عند الاعتماد
    var fee = C.fee >= 0 ? num(C.fee) : 0;
    if (!x.inAmt && !x.outAmt && !fee) return;
    if (parts || fee) {
      var items = [];
      if (parts) parts.forEach(function (c) { items.push(Object.assign({}, x, { cur: c, inAmt: num(C['in' + c]), outAmt: num(C['out' + c]) })); });
      else if (x.inAmt || x.outAmt) items.push(x);
      if (fee) items.push(Object.assign({}, x, { inAmt: 0, outAmt: fee, isFee: 1, hint: '', cur: x.cur || (parts ? parts[0] : undefined),
        desc: (x.desc ? x.desc + ' — ' : '') + 'مصاريف بنكية' }));
      var ids = raw.indexOf('|') >= 0 ? raw.split('|').map(function (t) { t = t.trim(); return t === '-' ? '' : t; }) : [raw.trim()];
      items.forEach(function (it, k) {
        var y = Object.assign({}, it, { sub: k, subN: items.length, f: ids[k] || '', fRaw: raw });
        if (y.isFee) y.rk = y.row + 0.5;   // مفتاح اعتماد مستقل لجزء المصاريف (لا يختلط بطرف الصف نفسه)
        y.hash = _glCsHash_(y); out.push(y);
      });
      return;
    }
    x.hash = _glCsHash_(x);
    out.push(x);
  });
  return out;
}
// 🔎 (V4.247) مفتاح مطابقة تقريبي للأسماء: بلا همزات (أ إ آ ⇒ ا) ولا ى/ي ولا ة/ه ولا تشكيل ولا «ال» التعريف ولا رموز ومسافات
function _glFuzzyKey_(s) {
  var t = _glHbKey_(String(s || '').replace(/^\s*ح\s*\/\s*/, '').replace(/^\s*حساب\s+/, '')).toLowerCase()
    .replace(/[\-_.,،؛;:\/\\()\[\]{}"'«»|+*]/g, ' ');
  return t.split(/\s+/).map(function (w) { return w.length > 3 ? w.replace(/^(ال|لل)/, '') : w; }).join('');
}
// 🔎 (V4.267) كلمات الاسم الجوهرية: بلا «شركة/مؤسسة/للسياحة/السفر…» فيتطابق «الاقصر» و«شركة الاقصر» و«الأقصر للسياحه» مع «الاقصر للسياحة»
var _GL_NOISE_ = null;
function _glFuzzyWords_(s) {
  var t = _glHbKey_(String(s || '').replace(/^\s*ح\s*\/\s*/, '').replace(/^\s*حساب\s+/, '')).toLowerCase().replace(/[\-_.,،؛;:\/\\()\[\]{}"'«»|+*]/g, ' ');
  return t.split(/\s+/).filter(String).map(function (w) { return w.length > 3 ? w.replace(/^(ال|لل)/, '') : w; });
}
function _glFuzzyCore_(s) {
  if (!_GL_NOISE_) { _GL_NOISE_ = {}; ['شركة', 'شركه', 'مؤسسة', 'موسسة', 'مكتب', 'للسياحة', 'السياحة', 'سياحة', 'والسياحة', 'وسياحة', 'للسفر', 'السفر', 'سفر', 'والسفر', 'للرحلات', 'الرحلات', 'رحلات', 'للعمرة', 'العمرة', 'عمرة', 'والعمرة', 'للحج', 'والحج', 'السياحيه', 'السياحية', 'للخدمات', 'للتجارة', 'التجارية', 'المحدودة', 'ذمم', 'عميل', 'مورد', 'وكيل', 'للاستثمار', 'travel', 'tours', 'tourism', 'co', 'company', 'for']
    .forEach(function (n) { _glFuzzyWords_(n).forEach(function (w) { _GL_NOISE_[w] = 1; }); }); }
  var w = _glFuzzyWords_(s), core = w.filter(function (x) { return !_GL_NOISE_[x] && !/^[\d٠-٩]+$/.test(x); });   // (V4.273) الأرقام (سنة/رقم 2027) ليست جزءاً من الاسم الجوهري
  return core.length ? core : w;   // لو كل الكلمات «ضوضاء» نُبقيها كما هي
}
// كل كلمة بالتلميح لها كلمة مقابلة بالاسم (تطابق/بداية/فرق حرف واحد للكلمات الطويلة)
function _glFuzzyNums_(s) { return _glFuzzyWords_(s).filter(function (x) { return /^[\d٠-٩]+$/.test(x); }).map(function (x) { return x.replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }); }); }
function _glWordHit_(w, a) {
  if (w === a) return true;
  if (w.length >= 4 && a.length >= 4 && (a.indexOf(w) === 0 || w.indexOf(a) === 0)) return true;
  return w.length >= 5 && a.length >= 5 && Math.abs(w.length - a.length) <= 1 && _glLev_(w, a) <= 1;
}
// أسماء كل حساب للمطابقة: اسمه + ربطه + الأسماء المربوطة به بخريطة برنامج الحجوزات
function _glCsNameIndex_(accs, self) {
  var idx = [], hb = {};
  try { _glRows_('hbmap').forEach(function (r) { var c = _glStr_(r[2]); if (c) (hb[c] = hb[c] || []).push(_glStr_(r[0])); }); } catch (e) {}
  accs.list.forEach(function (a) {
    if (a.isGroup || !a.active || a.code === self) return;
    var keys = {}, cores = [], nums = []; [a.name, a.link].concat(hb[a.code] || []).forEach(function (n) { var k = _glFuzzyKey_(n); if (k && k.length >= 2) keys[k] = 1; var w = _glFuzzyCore_(n); if (w.length) { cores.push(w); nums.push(_glFuzzyNums_(n)); } });
    idx.push({ code: a.code, keys: Object.keys(keys), cores: cores, nums: nums });
  });
  return idx;
}
function _glCsResolve_(hint, accs, learned, self, idx) {
  var k = _glCsKey_(hint); if (!k) return '';
  var ok = function (c) { var a = accs.map[c]; return a && !a.isGroup && a.active && c !== self ? c : ''; };
  if (learned[k] && ok(learned[k])) return learned[k];
  var m = String(hint).match(/^\s*(\d{2,})(?:\s|$|[-—–])/); if (m && ok(m[1])) return m[1];
  var ex = accs.list.filter(function (a) { return !a.isGroup && a.active && a.code !== self && _glCsKey_(a.name) === k; });
  if (ex.length === 1) return ex[0].code;
  // (V4.247) مطابقة تقريبية — تُقبل فقط لو كانت النتيجة حساباً واحداً بلا لبس، وإلا يبقى الصف «ناقصاً» للمراجعة
  idx = idx || _glCsNameIndex_(accs, self);
  var f = _glFuzzyKey_(hint); if (!f || f.length < 3) return '';
  _glFuzzyCore_(hint); if (_glFuzzyWords_(hint).every(function (w) { return _GL_NOISE_[w]; })) return '';   // كلمات عامة فقط («شركة»/«للسياحة») لا تدل على حساب
  var uniq = function (arr) { var o = {}; arr.forEach(function (x) { o[x.code] = 1; }); var c = Object.keys(o); return c.length === 1 ? c[0] : ''; };
  var eq = idx.filter(function (x) { return x.keys.indexOf(f) >= 0; }); if (eq.length) return uniq(eq);
  if (f.length >= 4) {
    var ct = idx.filter(function (x) { return x.keys.some(function (q) { return q.length >= 4 && (q.indexOf(f) >= 0 || f.indexOf(q) >= 0); }); });
    if (ct.length) return uniq(ct);
  }
  // (V4.267) مطابقة بالكلمات الجوهرية بلا ترتيب ولا «شركة/للسياحة…»: كل كلمات التلميح موجودة بكلمات اسم الحساب
  var hw = _glFuzzyCore_(hint).filter(function (w) { return w.length >= 2; });
  if (hw.length && hw.join('').length >= 3) {
    var tk = idx.filter(function (x) { return (x.cores || []).some(function (cw) { return hw.every(function (w) { return cw.some(function (a) { return _glWordHit_(w, a); }); }); }); });
    var hn = _glFuzzyNums_(hint);
    if (tk.length > 1 && hn.length) {   // «برستيج 2027» ⇒ يُفضَّل الحساب الذي يحمل نفس الرقم/السنة
      var tn = tk.filter(function (x) { return (x.nums || []).some(function (nw) { return hn.every(function (n) { return nw.indexOf(n) >= 0; }); }); });
      if (tn.length) tk = tn;
    }
    if (tk.length === 1) return tk[0].code;
    if (tk.length > 1) {   // الأقرب: نفس عدد الكلمات الجوهرية تماماً
      var ex2 = tk.filter(function (x) { return x.cores.some(function (cw) { return cw.length === hw.length && hw.every(function (w) { return cw.some(function (a) { return _glWordHit_(w, a); }); }); }); });
      if (ex2.length === 1) return ex2[0].code;
    }
  }
  var lim = f.length >= 8 ? 2 : (f.length >= 5 ? 1 : 0); if (!lim) return '';
  var best = 99, hits = [];
  idx.forEach(function (x) { x.keys.forEach(function (q) { if (Math.abs(q.length - f.length) > lim) return; var d = _glLev_(q, f); if (d < best) { best = d; hits = [x]; } else if (d === best) hits.push(x); }); });
  return best <= lim ? uniq(hits) : '';
}
function _glCsSuggest_(hint, accs, self) {
  var k = _glCsKey_(hint); if (!k || k.length < 2) return [];
  var hw = _glFuzzyCore_(hint).filter(function (w) { return w.length >= 2; }); if (!hw.length) return [];
  return accs.list.filter(function (a) { return !a.isGroup && a.active && a.code !== self; }).map(function (a) {
    var cw = _glFuzzyCore_(a.name), sc = 0, n = _glCsKey_(a.name);
    hw.forEach(function (w) { if (cw.some(function (x) { return _glWordHit_(w, x); })) sc += 2; else if (w.length >= 3 && cw.some(function (x) { return x.indexOf(w) >= 0 || w.indexOf(x) >= 0; })) sc += 1; });
    if (n.indexOf(k) >= 0 || k.indexOf(n) >= 0) sc += 2;
    return { code: a.code, name: a.name, sc: sc, miss: Math.abs(cw.length - hw.length) };
  }).filter(function (s) { return s.sc >= 2; }).sort(function (a, b) { return b.sc - a.sc || a.miss - b.miss; }).slice(0, 4).map(function (s) { return { code: s.code, name: s.name }; });
}
// قيد صف الشيت: الوارد «صرف عهدة» والمصروف «تسوية عهدة» — بعملة العهدة وسعر يوم الصف
// ✔ (V4.262) قيد قائم على نفس الحساب يطابق صف «ok»: نفس العملة والمبلغ والاتجاه وتاريخ ±3 أيام، غير مربوط بصف آخر
var _GL_CS_OK_IDX_ = null;
function _glCsOkMatch_(code, x, cur, used) {
  if (!_GL_CS_OK_IDX_ || _GL_CS_OK_IDX_.code !== code) {
    var L = []; _glRows_('lines').forEach(function (l) { if (_glStr_(l[4]) === code && _glStr_(l[3]) === GL_ST_POSTED_) L.push(_glLineObj_(l)); });
    _GL_CS_OK_IDX_ = { code: code, L: L };
  }
  var amt = x.inAmt || x.outAmt, isIn = x.inAmt > 0, k = _glDKey_(x.date), best = null, bd = 99;
  var day = function (dk) { return Date.UTC(+dk.slice(0, 4), +dk.slice(4, 6) - 1, +dk.slice(6, 8)) / 864e5; };
  _GL_CS_OK_IDX_.L.forEach(function (l) {
    if (used[l.entryId] || l.currency !== cur) return;
    var v = isIn ? l.debit : l.credit; if (Math.abs(v - amt) > 0.009) return;
    var d = Math.abs(day(_glDKey_(l.date)) - day(k)); if (d <= 3 && d < bd) { bd = d; best = l.entryId; }
  });
  return best;
}
// (V4.284) هل يطابق اسم الطرف بالشيت (hint) طرفَ القيد المطابق؟ — إشارة ثانية تجعل الربط التلقائي شبه مؤكَّد.
// يقارن الاسم المُطبَّع (بلا تشكيل/مسافات) مع أطراف سطور القيد غير النقدية (عميل/وكيل أو اسم الحساب) بالاحتواء.
function _glCsPartyMatch_(hint, entId) {
  var h = _glCashDupPartyKey_(hint); if (!h || h.length < 4) return false;
  var accM = _glAccounts_().map, hit = false;
  _glLinesOf_(entId).map(_glLineObj_).forEach(function (l) {
    if (hit) return; var a = accM[l.account];
    if (a && /^(safe|bank|custody)$/.test(a.kind)) return;   // تخطّى سطر النقدية
    [l.client, l.agent, a ? (a.link || a.name) : ''].forEach(function (n) {
      var k = _glCashDupPartyKey_(n); if (k && k.length >= 4 && (k === h || k.indexOf(h) >= 0 || h.indexOf(k) >= 0)) hit = true;
    });
  });
  return hit;
}
// ov: (V4.305) مبلغ الطرف المقابل وعملته {cur, amt} لو مختلفة عن عملة الصف — قيد بعملتين بسعر ضمني من المبلغين (آلية السندات
// العادية): سطر الشيت بعملته ومبلغه، وسطر الطرف بعملته ومبلغه المعتمد، ويوازن «وسيط تحويل العملات» كل عملة تلقائياً عند الحفظ
/* ➗ (V4.333) طرف مقابل بأكثر من حساب (Split): splits = [{account, amt}] بعملة الصف نفسها ومجموعها = مبلغ الصف بالضبط (±0.01).
   يُنتج القيد سطر الحساب النقدي + سطراً لكل حساب مقابل. يُعتمد مرة واحدة من شاشة «استكمال واعتماد»؛ وتعديل مبلغ الصف بالشيت لاحقاً
   يعيد توزيع المبلغ الجديد على نفس الحسابات بنفس النسب (آخر حساب يأخذ فرق التقريب). */
function _glCsSplitNorm_(arr, accs) {
  if (!Array.isArray(arr)) return null;
  var out = [];
  arr.forEach(function (z) {
    var c = _glStr_(z && z.account), a = _glR2_(_glNum_(z && z.amt));
    if (!c || !(a > 0)) return;
    var ac = accs.map[c]; if (!ac || ac.isGroup) throw new Error('حساب التقسيم ' + c + ' غير صالح (غير موجود أو تجميعي)');
    var o = { account: c, amt: a }, zc = _glStr_(z && z.cur);   // 💱 (V4.356) عملة ومبلغ لكل جزء (اختياري)
    if (zc) { o.cur = _glCur_(zc); var ca = _glR2_(_glNum_(z.camt)); if (ca > 0) o.camt = ca; }
    out.push(o);
  });
  return out.length >= 2 ? out : null;
}
function _glCsEntry_(x, code, cp, cur, fx, ov, split) {
  var isIn = x.inAmt > 0, amt = isIn ? x.inAmt : x.outAmt, rate = _glFxRateAt_(cur, x.date, fx).rate;
  if (split && split.length >= 2) {
    var kd0 = (_glAccounts_().map[code] || {}).kind, T0 = kd0 === 'bank' ? ['إيداع بنكي', 'سحب بنكي', 'إيداع', 'سحب'] : kd0 === 'safe' ? ['سند قبض', 'سند صرف', 'استلام نقدية', 'صرف نقدية'] : ['صرف عهدة', 'تسوية عهدة', 'استلام عهدة', 'مصروفات عهدة'];
    var desc0 = x.desc || (isIn ? T0[2] : T0[3]) + (x.hint ? ' — ' + x.hint : ''), sum0 = 0;
    split.forEach(function (z) { sum0 += z.amt; });
    if (Math.abs(sum0 - amt) > 0.01) throw new Error('مجموع الأطراف المقسَّمة (' + _glFmtN_(sum0) + ') لا يساوي مبلغ الصف (' + _glFmtN_(amt) + ')');
    var e0 = { date: x.date, type: isIn ? T0[0] : T0[1], desc: desc0, lines: [{ account: code, debit: isIn ? amt : 0, credit: isIn ? 0 : amt, currency: cur, rate: rate, desc: desc0 }] };
    // 💱 (V4.356) جزء بعملة أخرى: مبلغه بعملته (camt) وسعره يُحسب بدقة بحيث يساوي معادله حصته من الصف (القيد متوازن تماماً)
    var mixed = split.some(function (z) { return z.cur && z.cur !== cur && z.camt > 0; }), baseSum = 0;
    if (mixed) {
      split.forEach(function (z) {
        var pc = z.cur && z.camt > 0 ? z.cur : cur, base = pc === 'EGP' && cur !== 'EGP' ? z.camt : (cur === 'EGP' ? z.amt : z.amt * rate);
        z._pc = pc; z._qa = pc === cur ? Math.abs(z.amt) : z.camt; z._rt = pc === 'EGP' ? 1 : Math.abs(base) / z._qa; baseSum += Math.abs(base) * (z.amt > 0 ? 1 : -1);
      });
      if (cur !== 'EGP') { e0.lines[0].rate = Math.abs(baseSum) / amt; e0.lines[0].exact = true; }
    }
    split.forEach(function (z) {
      var pz = z.amt > 0, az = mixed ? z._qa : Math.abs(z.amt), pcur = mixed ? z._pc : cur;
      var ln = { account: z.account, debit: isIn ? (pz ? 0 : az) : (pz ? az : 0), credit: isIn ? (pz ? az : 0) : (pz ? 0 : az), currency: pcur, rate: mixed ? z._rt : rate,
        desc: desc0 + ' (جزء ' + _glFmtN_(az) + (pcur !== cur ? ' ' + ({ EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' }[pcur] || pcur) : '') + ')' };
      if (mixed && pcur !== 'EGP') ln.exact = true;
      e0.lines.push(ln);
    });
    if (x.trip) { e0.lines.forEach(function (l, i) { if (i) l.trip = x.trip; }); }   // (V4.343) رحلة اختيارية على أسطر الأطراف
    return { e: e0, v: _glValidate_(e0, {}), cc: null, split: true };
  }
  var kd = (_glAccounts_().map[code] || {}).kind;   // (V4.262) نوع القيد حسب الحساب: خزينة/بنك/عهدة
  var T = kd === 'bank' ? ['إيداع بنكي', 'سحب بنكي', 'إيداع', 'سحب'] : kd === 'safe' ? ['سند قبض', 'سند صرف', 'استلام نقدية', 'صرف نقدية'] : ['صرف عهدة', 'تسوية عهدة', 'استلام عهدة', 'مصروفات عهدة'];
  var desc = x.desc || (isIn ? T[2] : T[3]) + (x.hint ? ' — ' + x.hint : '');
  var oc = ov && ov.cur ? _glCur_(ov.cur) : cur, oa = amt, mRate = rate, cRate = rate;
  if (oc !== cur) {
    oa = _glR2_(_glNum_(ov.amt)); if (!(oa > 0)) throw new Error('أدخل مبلغ الطرف المقابل بعملته (' + oc + ')');
    var r2 = function (n) { return Math.max(0.01, Math.round(n * 100) / 100); };
    if (cur === 'EGP') { mRate = 1; cRate = r2(amt / oa); }
    else if (oc === 'EGP') { cRate = 1; mRate = r2(oa / amt); }
    else cRate = r2(amt * rate / oa);
  }
  var e = { date: x.date, type: isIn ? T[0] : T[1], desc: desc, lines: [
    { account: code, debit: isIn ? amt : 0, credit: isIn ? 0 : amt, currency: cur, rate: mRate, desc: desc },
    { account: cp, debit: isIn ? 0 : oa, credit: isIn ? oa : 0, currency: oc, rate: cRate, desc: desc + (x.hint && x.desc ? ' — ' + x.hint : '') }] };
  if (oc !== cur) _glFxSmartDescSrv_(e.lines);
  if (x.trip) { e.lines[1].trip = x.trip; }   // (V4.343) رحلة اختيارية على سطر الطرف المقابل
  return { e: e, v: _glValidate_(e, {}), cc: oc !== cur ? { cur: oc, amt: oa } : null };
}
// 💱 (V4.305) بيان تحويل العملة على سطري قيد بعملتين (جنيه + أجنبية) — نفس صيغة السندات العادية (glFxSmartDesc_ بالواجهة)
function _glFxSmartDescSrv_(lines) {
  var curs = {}; lines.forEach(function (l) { curs[l.currency] = 1; }); var cs = Object.keys(curs);
  if (cs.length !== 2 || cs.indexOf('EGP') < 0) return;
  var F = cs[0] === 'EGP' ? cs[1] : cs[0], lbl = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' }, dr = {}, cr = {};
  lines.forEach(function (l) { dr[l.currency] = (dr[l.currency] || 0) + (+l.debit || 0); cr[l.currency] = (cr[l.currency] || 0) + (+l.credit || 0); });
  var tE = Math.max(dr.EGP || 0, cr.EGP || 0), tF = Math.max(dr[F] || 0, cr[F] || 0); if (!tE || !tF) return;
  var rate = Math.round(tE / tF * 100) / 100, has = /تحويل عملة: [\d,.]+ |قيمة [\d,.]+ (جنيه|ريال|دولار) (\/|×) [\d.]+/;
  lines.forEach(function (l) {
    var d = String(l.desc || '').trim(); if (has.test(d)) return;
    l.desc = (d ? d + ' ' : '') + (l.currency === F ? '(تحويل عملة: ' + _glFmtN_(tE) + ' جنيه ÷ ' + rate + ' = ' + _glFmtN_(tF) + ' ' + lbl[F] + ')'
      : '(تحويل عملة: ' + _glFmtN_(tF) + ' ' + lbl[F] + ' × ' + rate + ' = ' + _glFmtN_(tE) + ' جنيه)');
  });
}
function _glLatin_(s) { return String(s == null ? '' : s).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/٫/g, '.').replace(/٬/g, ','); }
// 💱 (V4.305) اقتراح مبلغ الطرف المقابل بعملته (ينتظر اعتماد المستخدم — لا تحويل صامت):
//   1) مبلغ مكتوب بالبيان بجوار اسم العملة (الأقرب لتقدير سعر اليوم، وضمن نصفه إلى ضعفه) ⇐ «من البيان»
//   2) سعر صرف مكتوب بالبيان («بسعر 13.5» / «سعر الصرف 13.5» / «@13.5») قريب من سعر النظام ⇐ «بسعر البيان»
//   3) وإلا التحويل بسعر صرف يوم الحركة (سجل الأسعار اليومية) ⇐ «بسعر اليوم»
var GL_CCY_W_ = { SAR: '(?:ريالات|ريال|ر\\.\\s?س|SAR|SR)', EGP: '(?:جنيهات|جنيها|جنيه|جنية|ج\\.\\s?م|جم|EGP|LE)', USD: '(?:دولارات|دولار|\\$|USD)' };
function _glCcyGuess_(desc, amt, fromCur, toCur, date, fx) {
  amt = _glR2_(amt); fromCur = _glCur_(fromCur); toCur = _glCur_(toCur);
  if (!amt || fromCur === toCur) return { amt: amt, cur: fromCur, src: '' };
  var rF = _glFxRateAt_(fromCur, date, fx).rate || 1, rT = _glFxRateAt_(toCur, date, fx).rate || 1, est = _glR2_(amt * rF / rT);
  var t = _glLatin_(desc), num = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)', nb = '(?![\\u0600-\\u06FFA-Za-z])', cands = [], m;
  var re1 = new RegExp(num + '\\s*' + GL_CCY_W_[toCur] + nb, 'gi'), re2 = new RegExp(GL_CCY_W_[toCur] + nb + '\\s*' + num, 'gi');
  while ((m = re1.exec(t))) cands.push(_glNum_(m[1].replace(/,/g, '')));
  while ((m = re2.exec(t))) cands.push(_glNum_(m[1].replace(/,/g, '')));
  var best = null;
  cands.forEach(function (v) { if (!(v > 0)) return; var q = v / est; if (q >= 0.5 && q <= 2 && (best === null || Math.abs(v - est) < Math.abs(best - est))) best = v; });
  if (best !== null) return { amt: _glR2_(best), cur: toCur, src: 'desc' };
  var sys = fromCur === 'EGP' ? rT : (toCur === 'EGP' ? rF : 0), mr = t.match(/(?:بسعر\s*(?:الصرف|التحويل)?|سعر\s*(?:الصرف|التحويل)|@)\s*[:=]?\s*(\d+(?:\.\d+)?)/);
  if (sys && mr) {
    var rr = _glNum_(mr[1]);
    if (rr > 0 && Math.abs(rr / sys - 1) <= 0.5) return { amt: _glR2_(fromCur === 'EGP' ? amt / rr : amt * rr), cur: toCur, src: 'rate', rate: rr };
  }
  return { amt: est, cur: toCur, src: 'fx', rate: sys || _glR2_(rF / rT) };
}
// 💱 (V4.305) العملة الافتراضية لكل حساب: عملته الثابتة، وإلا الريال لأطراف برنامج الحجوزات (كشف الفندق بالريال)، وإلا عملة
// أغلب حركاته المرحّلة. hb = أطراف الحجوزات. تُستخدم لاقتراح عملة الطرف المقابل بشاشة استكمال صفوف الشيتات والسندات
var _GL_DEFCUR_MEMO_ = null;
/* 💱 (V4.323) قاعدة «العملة الافتراضية» للطرف المقابل صارت إعداداً (ccy_def_rule) يختاره المدير — هي التي تقرر متى يُحوَّل
   مبلغ صف شيت عهدة/خزينة/بنك تلقائياً لعملة أخرى (مع أسطر وسيط تحويل العملات + بند مراجعة «💱 تحويل عملة»):
   • all (الافتراضي — السلوك السابق كما هو): العملة الثابتة للحساب ← الريال لأطراف برنامج الحجوزات ← عملة «أغلب» حركاته المرحّلة
   • hb: العملة الثابتة ← الريال لأطراف برنامج الحجوزات فقط (بلا تخمين من أغلب الحركات)
   • fixed: العملة الثابتة للحساب فقط — الحساب «متعدد العملات» (بلا عملة ثابتة) لا يُحوَّل له أي مبلغ إطلاقاً
   (الحساب ذو العملة الثابتة يُحوَّل له دائماً بأي قاعدة — القيد بعملة غير عملته الثابتة مرفوض محاسبياً) */
function _glCcyRule_() { var r = _glStr_(_glSettings_().ccy_def_rule); return r === 'hb' || r === 'fixed' ? r : 'all'; }
function _glDefCurMap_() {
  if (_GL_DEFCUR_MEMO_) return _GL_DEFCUR_MEMO_;
  var accs = _glAccounts_(), hb = {}, cnt = {}, cur = {}, rule = _glCcyRule_();
  try { _glRows_('hbmap').forEach(function (r) { var c = _glStr_(r[2]); if (c && /^(عميل|مورد|شارت)$/.test(_glStr_(r[1]))) hb[c] = 1; }); } catch (e) {}
  if (rule === 'all') _glRows_('lines').forEach(function (l) {   // ⚡ يُقرأ دفتر الأسطر فقط عند قاعدة «أغلب الحركات»
    if (_glStr_(l[3]) !== GL_ST_POSTED_) return;
    var c = _glStr_(l[4]), cu = _glCur_(l[7]), o = cnt[c] || (cnt[c] = {}); o[cu] = (o[cu] || 0) + 1;
  });
  accs.list.forEach(function (a) {
    if (a.isGroup || a.kind === 'fx') return;
    if (a.currency) { cur[a.code] = a.currency; return; }
    if (rule === 'fixed') return;
    if (hb[a.code]) { cur[a.code] = 'SAR'; return; }
    if (rule === 'hb') return;
    var o = cnt[a.code], best = '', bn = 0; if (!o) return;
    Object.keys(o).forEach(function (cu) { if (o[cu] > bn) { bn = o[cu]; best = cu; } });
    if (best) cur[a.code] = best;
  });
  return (_GL_DEFCUR_MEMO_ = { cur: cur, hb: hb });
}
// 💱 (V4.306) قيد عهدة/خزينة/بنك سُجِّل تلقائياً بمبلغ طرف مقابل مستنتَج (بعملة مختلفة عن الشيت): يدخل تبويب «⏳ تغييرات
// تنتظر الاعتماد» (نفس قائمة GL_Pending التي تستخدمها AUTO:TRIP/CI/HB) للمراجعة — بلا حجب تسجيله. اعتماده لاحقاً لا يُعيد
// بناء شيء (القيد مسجَّل بالفعل بصيغته الصحيحة)؛ فقط يُزال من القائمة. idempotent: لا يُكرَّر لو استُدعيت أكثر من مرة لنفس القيد.
function _glCcyPendQueue_(id, v, e, ccy) { _glCcyPendQueueMany_([{ id: id, v: v, e: e, ccy: ccy }]); }
// ⚡ (V4.308) جذر بطء مزامنة شيت العهدة: كان كل صف بعملة مختلفة يُعيد كتابة شيت «تغييرات تنتظر الاعتماد» كاملاً
// (clearContent + setValues لكل الصفوف) داخل قفل الحسابات ⇒ O(عدد الصفوف الجديدة × حجم شيت الاعتماد). الآن تُجمَّع
// كل صفوف العملة من المزامنة الواحدة وتُكتب **مرة واحدة** بعد حلقة الإنشاء
function _glCcyPendQueueMany_(items) {
  if (!items || !items.length) return;
  try {
    var cur = _glPendingRows_(), map = {}, changed = false;
    Object.keys(cur).forEach(function (k) { map[k] = cur[k].row; });
    var lbl = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' };
    items.forEach(function (it) {
      var key = 'CCY:' + it.id; if (map[key]) return;
      var ccy = it.ccy, srcTxt = { desc: 'من البيان', rate: 'بسعر الصرف المكتوب بالبيان', fx: 'بسعر صرف تاريخ الحركة' }[ccy.src] || 'بسعر صرف تاريخ الحركة';
      map[key] = [key, it.id, 'تحويل عملة', '', 0, _glCleanDesc_(it.e.desc), it.v.totalBase, 'ccy:' + it.id, _glNow_(), 'بانتظار', '', '', '',
        _glFmtN_(ccy.amt) + ' ' + (lbl[ccy.cur] || ccy.cur),
        '🔸 مبلغ الطرف المقابل استُنتج تلقائياً (' + srcTxt + ') ومُقرَّب لأقرب رقم صحيح — راجعه، أو افتح القيد وعدّله يدوياً'];
      changed = true;
    });
    if (changed) _glPendingWrite_(map);
  } catch (eQ) { Logger.log('_glCcyPendQueueMany_: ' + eQ.message); }
}
function glCustSheetGet(authToken, code) {
  _glPerm_(authToken, 'view', 'sheets');
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
    var cc = {}, used = {}, multi = ['inEGP', 'outEGP', 'inSAR', 'outSAR', 'inUSD', 'outUSD'].some(function (k) { return _glStr_(cfg.cols[k]); });
    Object.keys(GL_CS_COLS_DEF_).forEach(function (k) {
      if (multi && (k === 'in' || k === 'out')) { cc[k] = ''; return; }   // (V4.271) تُحفظ فارغة — كان يعود A/B تلقائياً
      var v = _glStr_(cfg.cols[k] || GL_CS_COLS_DEF_[k]).toUpperCase();
      if (!/^[A-Z]{1,2}$/.test(v)) throw new Error('حرف عمود غير صالح: ' + v);
      if (multi && (k === 'in' || k === 'out')) { cc[k] = v; return; }   // أعمدة العملات تُغني عن الوارد/الصادر العام
      if (used[v]) throw new Error('العمود ' + v + ' مستخدم لأكثر من حقل'); used[v] = 1; cc[k] = v;
    });
    Object.keys(GL_CS_COLS_OPT_).forEach(function (k) {
      var v = _glStr_(cfg.cols[k]).toUpperCase(); if (!v) return;
      if (!/^[A-Z]{1,2}$/.test(v)) throw new Error('حرف عمود غير صالح: ' + v);
      if (used[v]) throw new Error('العمود ' + v + ' مستخدم لأكثر من حقل'); used[v] = 1; cc[k] = v;
    });
    o.cols = cc;
  }
  var S = _glCsOpen_(o);
  o.tab = S.sh.getName(); o.title = S.ss.getName(); o.cur = _glCur_(a.currency || cfg.cur || 'SAR'); o.auto = !!cfg.auto;   // (V4.249) الافتراضي ريال ويمكن تغييره
  o.dupAutoLink = cfg.dupAutoLink !== false;   // (V4.284) ربط تلقائي صامت للصف المطابق لقيد قائم بنفس الطرف (افتراضي مُفعّل) — يقلّل زحمة الاعتمادات
  // ⏱️ (V4.250) تكرار المزامنة التلقائية: كل N دقيقة (1-59) أو كل N ساعة (1-24)
  var ev = cfg.every || {}, unit = ev.unit === 'min' ? 'min' : 'hour', n = parseInt(ev.n, 10) || 1;
  if (unit === 'min') n = Math.max(1, Math.min(59, n));   // (V4.270) الحد الأدنى دقيقة واحدة
  if (unit === 'hour' && (n < 1 || n > 24)) throw new Error('عدد الساعات من 1 إلى 24');
  o.every = { unit: unit, n: n };
  o.by = session.username; o.at = _glNow_();
  if (cfg.last === undefined) { var old = _glCsCfg_(a.code); if (old.last) o.last = old.last; }
  _glSetSetting_('custsheet:' + a.code, JSON.stringify(o));
  _GL_SET_MEMO_ = null; try { _glCsEnsureTrigger_(); } catch (eT) { Logger.log('custsheet trigger: ' + eT.message); }
  logChange_(session.username, 'ربط شيت عهدة', 'GL:' + a.code, 'شيت العهدة', '-', o.title + ' / ' + o.tab + (o.auto ? ' — تلقائي كل ' + o.every.n + (o.every.unit === 'min' ? ' دقيقة' : ' ساعة') : ''));
  return { success: true, cfg: o, rows: _glCsReadRows_(S.sh, o.startRow, o).length };
}
// preview=true ⇒ معاينة فقط بلا كتابة
function glCustSheetSync(authToken, code, preview) {
  var session = preview ? _glPerm_(authToken, 'view', 'sheets') : _glAdminPerm_(authToken);
  var lock = _glLock_(); lock.waitLock(120000);
  try { return _glCsSync_(_glStr_(code), session.username, { preview: !!preview }); }
  finally { _glUnlock_(lock); }
}
// اعتماد صفوف الطرف غير المعروف: items = [{row, account}] — ويُتذكَّر اسم الطرف ⇒ حسابه للمرات القادمة
// 👜 (V4.268) مجموع صفوف الشيتات (عهدة/خزينة/بنك) الناقصة بانتظار تحديد الطرف — من آخر مزامنة لكل شيت (بلا فتح أي شيت)
function _glCsPendTotal_() {
  var n = 0; try { var set = _glSettings_(); Object.keys(set).forEach(function (k) { if (k.indexOf('custsheet:') !== 0) return; try { var c = JSON.parse(set[k] || '{}'); if (c && c.id && c.last) n += (+c.last.pending || 0) + (+c.last.susp || 0); } catch (e) {} }); } catch (e2) {}   // ⏳ (V4.324) + المبالغ المعلقة
  return n;
}
function _glCsPendBrief_() {
  var out = [], accM = {}; try { accM = _glAccounts_().map; } catch (e0) {}
  try { var set = _glSettings_(); Object.keys(set).forEach(function (k) { if (k.indexOf('custsheet:') !== 0) return; try { var c = JSON.parse(set[k] || '{}'), code = k.slice(10); if (c && c.id && c.last && +c.last.pending > 0) out.push({ code: code, name: (accM[code] || {}).name || code, n: +c.last.pending }); } catch (e) {} }); } catch (e2) {}
  return out;
}
/* ⏳ (V4.324) «مبالغ معلقة»: صف شيت خزينة/بنك/عهدة بلا طرف معروف بعد (بانتظار التنفيذ/التسوية) يُقيَّد على حساب معلقات
   («متعلقات — مبالغ معلقة بانتظار التسوية» أو «نقدية تحت التسوية») فتصبح أرصدة الخزن/البنوك/العهد فعلية، ويُسجَّل رقم قيده بسجل
   cs_susp — فيظهر بكل مزامنة تالية ضمن «استكمال واعتماد» حتى يُختار حسابه الحقيقي فيُنقل القيد نفسه إليه (نفس الرقم بالشيت) */
function _glCsSuspReg_() { var o = {}; try { o = JSON.parse(_glSettings_().cs_susp || '{}') || {}; } catch (e) { o = {}; } return o; }
function _glCsSuspSave_(reg) {
  var ents = {}; try { _glRows_('entries').forEach(function (r) { ents[_glStr_(r[0])] = _glStr_(r[5]); }); } catch (e) {}
  var o = {}; Object.keys(reg || {}).forEach(function (id) { if (ents[id] === GL_ST_POSTED_) o[id] = reg[id]; });   // تنظيف الملغاة/المحذوفة
  _glSetSetting_('cs_susp', JSON.stringify(o));
}
// حسابات المعلقات المتاحة للاختيار: «متعلقات» (يُنشأ عند أول استخدام) + «نقدية تحت التسوية»
function _glCsSuspAccs_() {
  var out = [];
  try { var r = _glAutoRoles_('', true), m = _glAccounts_().map;
    out.push({ code: m[r.cs_susp] ? r.cs_susp : '', key: 'susp', name: (m[r.cs_susp] || {}).name || GL_AUTO_ROLES_.cs_susp[1] });
    if (r.cash && m[r.cash]) out.push({ code: r.cash, key: 'cash', name: m[r.cash].name }); } catch (e) {}
  return out;
}
// الحساب المطلوب (لو صالح وكان من حسابات المعلقات) وإلا «متعلقات» (يُنشأ داخل القفل لو لم يوجد)
function _glCsSuspAcc_(code, user) {
  code = _glStr_(code);
  var r = _glAutoRoles_(user || '', true), m = _glAccounts_().map;
  if (code && (code === r.cs_susp || code === r.cash) && m[code] && !m[code].isGroup && m[code].active) return code;
  if (!m[r.cs_susp]) { r = _glAutoRoles_(user || '', false); _GL_ACC_MEMO_ = null; }
  return r.cs_susp;
}
// يجمع الصفوف الناقصة من كل الشيتات المربوطة (معاينة بلا تسجيل) — لشاشة «استكمال واعتماد» بالحسابات العامة
function glCsPendAll(authToken, force) {
  var session = _glPerm_(authToken, 'view', 'sheets');
  var groups = [], errs = [], t0 = Date.now(), accM = _glAccounts_().map;
  _glCsCodes_().forEach(function (code) {
    var cfg = _glCsCfg_(code); if (!cfg || !cfg.id) return;
    if (!force && !(cfg.last && (+cfg.last.pending > 0 || +cfg.last.susp > 0))) return;
    if (Date.now() - t0 > 150000) { errs.push((accM[code] || {}).name || code); return; }
    try {
      var r = _glCsSync_(code, session.username, { preview: true });
      if ((r.pending && r.pending.length) || (r.susp && r.susp.length)) groups.push({ code: code, name: (accM[code] || {}).name || code, currency: (r.account || {}).currency || '', url: (r.sheet || {}).url || '', rows: r.pending || [], susp: r.susp || [] });
    } catch (e) { errs.push(((accM[code] || {}).name || code) + ': ' + e.message); }
  });
  try { _glCsSuspBkSugg_(groups); } catch (eBk) { Logger.log('susp bk sugg: ' + eBk.message); }   // 🏨 (V4.355)
  return { success: true, autoSusp: _glStr_(_glSettings_().cs_auto_susp) === 'نعم', groups: groups, errors: errs, canApprove: _sessionHasPerm_(session, 'admin') || _sessionHasPerm_(session, 'gl.edit'), csPend: _glCsPendTotal_(), suspAccs: _glCsSuspAccs_() };
}
// ⏳ (V4.356) تشغيل/إيقاف «التسجيل التلقائي على المتعلقات» للصفوف بلا طرف (افتراضياً: إيقاف = تنتظر الاستكمال)
function glCsAutoSuspSet(authToken, on) {
  var session = _glPerm_(authToken, 'edit', 'sheets');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    _glSetSetting_('cs_auto_susp', on ? 'نعم' : 'لا');
    logChange_(session.username, 'إعداد شيتات العهد', 'GL:cs', 'التسجيل التلقائي على المتعلقات', '-', on ? 'تشغيل' : 'إيقاف');
    return { success: true, on: !!on };
  } finally { _glUnlock_(lock); }
}
/* 🏨 (V4.355) اقتراح الحجز المطابق لكل مبلغ معلق: صادر ⇒ تكلفة الحجز على المورد/الفندق · وارد ⇒ سعر البيع على العميل.
   المطابقة بالمعادل بالريال (فارق ≤ 2% أو 5 ريال للريال، ≤ 4% لعملة أخرى بسعر صرف تقريبي) وتاريخ دخول خلال ±30 يوماً.
   أفضل 3 اقتراحات لكل صف (الأقرب مبلغاً ثم تاريخاً) — الحساب المقترح هو حساب الطرف المربوط بخريطة الحسابات. */
var GL_SUSP_BK_DAYS_ = 30;
function _glCsSuspBkSugg_(groups) {
  var any = (groups || []).some(function (g) { return g.susp && g.susp.length; });
  if (!any || !_glHbOn_()) return;
  var H = _glHbRead_(), map = _glHbMap_(), accs = _glAccounts_().map, rates = _glRates_(), ents = _glHbEntryIds_();
  var dDay = function (s) { var k = _glDKey_(_glDate_(s)); return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : null; };
  var side = function (name, wantSale) {
    var m = map[_glHbKey_(name)];
    if (!m || !GL_HB_TYPES_[m.type]) return { code: '', name: name, unmapped: 1 };   // اسم جديد غير مربوط ⇒ يُقترح مع تنبيه الربط أولاً
    if (!m.code) return { code: '', name: name, unmapped: 1 };
    var a = accs[m.code]; if (!a || a.isGroup || a.active === false) return null;
    var k = GL_HB_TYPES_[m.type].kind; if (wantSale ? k !== 'client' : k !== 'supplier') return null;
    return { code: m.code, name: a.name };
  };
  var cands = { out: [], in: [] };
  H.bookings.forEach(function (b) {
    if (b.status === 'لاغي') return;
    var day = dDay(b.ci); if (day === null) return;
    var e = ents['AUTO:HB:' + b.key], ref = b.hotelRef || b.inner || ('صف ' + b.row);
    var lbl = 'حجز ' + ref + ' · ' + b.hotel + ' · دخول ' + String(b.ci || '').slice(0, 5);
    var sp = b.supplier && b.cost.hasPrice && b.cost.value > 0 ? side(b.supplier, false) : null;
    if (sp) cands.out.push({ code: sp.code, name: sp.name, unmapped: sp.unmapped || 0, sar: b.cost.value, day: day, label: lbl + ' · ' + b.client, entry: e ? e.id : '', key: b.key });
    var cl = b.client && b.sale.hasPrice && b.sale.value > 0 ? side(b.client, true) : null;
    if (cl) cands.in.push({ code: cl.code, name: cl.name, unmapped: cl.unmapped || 0, sar: b.sale.value, day: day, label: lbl + (b.supplier ? ' · ' + b.supplier : ''), entry: e ? e.id : '', key: b.key });
  });
  var toSar = function (amt, cur) {
    cur = _glCur_(cur || 'SAR');
    if (cur === 'SAR') return amt;
    var sr = rates.SAR || 0; if (!sr) return null;
    return cur === 'EGP' ? amt / sr : cur === 'USD' ? amt * (rates.USD || 0) / sr : null;
  };
  groups.forEach(function (g) {
    (g.susp || []).forEach(function (x) {
      var amt = x.outAmt || x.inAmt, cur = _glCur_(x.cur || g.currency || 'SAR'), sar = toSar(amt, cur), day = dDay(x.date);
      if (!amt || sar === null || day === null) return;
      var tol = cur === 'SAR' ? Math.max(5, sar * 0.02) : sar * 0.04;
      var hits = (x.outAmt ? cands.out : cands.in).filter(function (c) { return Math.abs(c.sar - sar) <= tol && Math.abs(c.day - day) <= GL_SUSP_BK_DAYS_; })
        .map(function (c) { return { code: c.code, name: c.name, unmapped: c.unmapped, label: c.label, entry: c.entry, key: c.key, sar: _glR2_(c.sar), diff: _glR2_(sar - c.sar), days: Math.abs(c.day - day), exact: Math.abs(c.sar - sar) < 0.01 && cur === 'SAR' }; })
        .sort(function (a, b) { return (a.unmapped ? 1 : 0) - (b.unmapped ? 1 : 0) || Math.abs(a.diff) - Math.abs(b.diff) || a.days - b.days; });
      if (hits.length) x.bk = hits.slice(0, 3);
    });
  });
}
// اعتماد دفعة واحدة لصفوف عدة شيتات: [{code, items:[{row, account, desc?}]}] — البيان المعدَّل يحلّ محل بيان الصف بالقيد
function glCsApproveAll(authToken, groups) {
  var session = _glPerm_(authToken, 'edit', 'sheets');
  // ⚡ (V4.308) قراءة كل الشيتات الخارجية (الجزء البطيء) قبل القفل — الاعتماد الجماعي لم يعد يُجمّد بقية البرنامج
  var preMap = {};
  (groups || []).forEach(function (g) {
    var code = _glStr_(g && g.code); if (!code || preMap[code]) return;
    try { var cfg0 = _glCsCfg_(code); if (cfg0 && cfg0.id) { var S0 = _glCsOpen_(cfg0); preMap[code] = { S: S0, rows: _glCsReadRows_(S0.sh, cfg0.startRow || 2, cfg0) }; } } catch (eP) {}
  });
  var lock = _glLock_(); lock.waitLock(150000);
  try {
    var created = 0, problems = [], left = 0, warns = [];
    (groups || []).forEach(function (g) {
      var pick = {}, ov = {}, tov = {};
      var lnk = {}, frc = {}, cc = {}, sus = {}, rep = {}, spl = {}, accsS = _glAccounts_();
      (g.items || []).forEach(function (it) {
        if (!it || !it.row) return;
        if (_glStr_(it.link)) { lnk[+it.row] = _glStr_(it.link); return; }   // (V4.278) نفس الحركة ⇒ ربط بالقيد القائم
        // ⏳ (V4.324) «مبلغ معلق» ⇒ يُقيَّد على حساب المعلقات · repoint ⇒ مبلغ معلق سابق يُنقل لحسابه الحقيقي (نفس القيد)
        if (it.susp) { pick[+it.row] = _glCsSuspAcc_(it.account, session.username); sus[+it.row] = 1; if (it.force) frc[+it.row] = 1; if (_glStr_(it.desc)) ov[+it.row] = _glStr_(it.desc); return; }
        var sp0 = null;
        if (it.repoint && Array.isArray(it.splits)) { try { sp0 = _glCsSplitNorm_(it.splits, accsS); } catch (eSp1) { problems.push({ code: g.code, row: it.row, msg: eSp1.message }); return; } if (sp0) { rep[+it.row] = sp0[0].account; spl[+it.row] = sp0; return; } }   // ➗ نقل المعلق لأكثر من حساب
        if (it.repoint && _glStr_(it.account)) { rep[+it.row] = _glStr_(it.account); if (_glStr_(it.ccur)) cc[+it.row] = { cur: _glCur_(it.ccur), amt: _glNum_(it.camt) }; return; } try { sp0 = _glCsSplitNorm_(it.splits, accsS); } catch (eSp) { problems.push({ code: g.code, row: it.row, msg: eSp.message }); return; }
        if (sp0) { pick[+it.row] = sp0[0].account; spl[+it.row] = sp0; if (it.force) frc[+it.row] = 1; if (_glStr_(it.desc)) ov[+it.row] = _glStr_(it.desc); return; }   // ➗ (V4.333)
        if (_glStr_(it.account)) { pick[+it.row] = _glStr_(it.account); if (it.force) frc[+it.row] = 1; if (_glStr_(it.desc)) ov[+it.row] = _glStr_(it.desc); if (_glStr_(it.ccur)) cc[+it.row] = { cur: _glCur_(it.ccur), amt: _glNum_(it.camt) }; }   // (V4.305) مبلغ/عملة الطرف المقابل
      });
      (g.items || []).forEach(function (it) { if (it && it.row && _glStr_(it.trip) && pick[+it.row]) tov[+it.row] = _glStr_(it.trip); });
      if (!Object.keys(pick).length && !Object.keys(lnk).length && !Object.keys(rep).length) return;
      try {
        var r = _glCsSync_(_glStr_(g.code), session.username, { approve: pick, descOv: ov, tripOv: tov, link: lnk, force: frc, ccy: cc, susp: sus, repoint: rep, split: spl, pre: preMap[_glStr_(g.code)] });
        created += (r.merged || []).length;
        created += (r.created || []).length; left += (r.pending || []).length;
        (r.problems || []).forEach(function (x) { problems.push({ code: g.code, row: x.row, msg: x.msg }); });
        (r.warns || []).forEach(function (x) { warns.push({ code: g.code, row: x.row, msg: x.msg }); });
      } catch (e) { problems.push({ code: g.code, row: 0, msg: e.message }); }
    });
    return { success: true, created: created, left: left, problems: problems, warns: warns, csPend: _glCsPendTotal_(), mirQ: _GL_MIRQ_N_, pendingCount: (function () { try { return _glPendingCount_(); } catch (e) { return 0; } })() };
  } finally { _glUnlock_(lock); }
}
// 🔁 (V4.278) وصف القيد المطابق (مصدره) لعرضه بالمراجعة
function _glCsSrcLbl_(sk) {
  sk = _glStr_(sk);
  if (/^AUTO:CP:/.test(sk)) return { k: 'auto', l: 'دفعة مسجّلة من حسابات عملاء العمرة (تلقائي)' };
  if (/^AUTO:HB/.test(sk)) return { k: 'auto', l: 'دفعة حجوزات الفنادق (تلقائي)' };
  if (/^AUTO:/.test(sk)) return { k: 'auto', l: 'قيد تلقائي من شاشات البرنامج' };
  if (/^VCH:/.test(sk)) return { k: 'manual', l: 'سند مسجّل يدوياً (' + sk.slice(4) + ')' };
  if (/^CUST:/.test(sk)) { var a = _glAccounts_().map[sk.slice(5)]; return { k: 'sheet', l: 'من شيت «' + ((a && a.name) || sk.slice(5)) + '»' }; }
  if (/^ERP:/.test(sk)) return { k: 'manual', l: 'قيد مستورد من الـ ERP' };
  return { k: 'manual', l: 'قيد مسجّل يدوياً' };
}
function _glCsDupInfo_(r) {
  var eo = _glEntryObj_(r), sl = _glCsSrcLbl_(eo.sourceKey);
  return { id: eo.id, date: eo.date, type: eo.type, desc: _glCleanDesc_ ? _glCleanDesc_(eo.desc) : eo.desc, src: sl.l, kind: sl.k, vno: eo.voucherNo || '' };
}
/* 🔁 (V4.278) فحص التكرار القائم: قيود سُجّلت من شيت (عهدة/خزينة/بنك) ولها قيد مطابق مسجّل من شاشات البرنامج أو يدوياً
   على نفس الحساب (نفس العملة والمبلغ والاتجاه، ±3 أيام). التوصية: الإبقاء على قيد الشاشات (التلقائي يُعاد إنشاؤه من مصدره دائماً
   ويغذّي حسابات العملاء، واليدوي له رقم سند ومرفقات) وإلغاء قيد الشيت مع ربط صف الشيت بالقيد الباقي فلا يتكرر مستقبلاً. */
function glCsDupScan(authToken, onlyCode) {
  var session = _glPerm_(authToken, 'view', 'sheets');
  var accM = _glAccounts_().map, ents = {}, out = [], errs = [], t0 = Date.now();
  _glRows_('entries').forEach(function (r) { var id = _glStr_(r[0]); if (id) ents[id] = r; });
  var linesBy = {}; _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (ents[id] && _glStr_(ents[id][5]) === GL_ST_POSTED_) (linesBy[id] = linesBy[id] || []).push(_glLineObj_(l)); });
  var day = function (d) { var k = _glDKey_(d); return Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5; };
  (onlyCode ? [_glStr_(onlyCode)] : _glCsCodes_()).forEach(function (code) {
    var cfg = _glCsCfg_(code); if (!cfg || !cfg.id) return;
    if (Date.now() - t0 > 240000) { errs.push((accM[code] || {}).name || code); return; }
    var refs = {}, rowOf = {};
    try {
      var S = _glCsOpen_(cfg); _glCsReadRows_(S.sh, cfg.startRow || 2, cfg).forEach(function (x) {
        String(x.fRaw || x.f || '').split('|').forEach(function (t) { t = t.trim(); if (t && t !== '-') { refs[t] = 1; rowOf[t] = x.row; } });
      });
    } catch (e) { errs.push(((accM[code] || {}).name || code) + ': ' + e.message); return; }
    var mine = [], other = [];
    Object.keys(linesBy).forEach(function (id) {
      var sk = _glStr_(ents[id][6]);
      linesBy[id].forEach(function (l) { if (l.account !== code) return; var o = { id: id, amt: _glR2_(l.debit || l.credit), dir: l.debit ? 'D' : 'C', cur: l.currency, d: day(l.date), date: l.date };
        if (sk === 'CUST:' + code) mine.push(o); else if (!refs[id]) other.push(o); });
    });
    var used = {};
    mine.forEach(function (m) {
      var best = null, bd = 99;
      other.forEach(function (o) { if (used[o.id] || o.cur !== m.cur || o.dir !== m.dir || Math.abs(o.amt - m.amt) > 0.009) return; var dd = Math.abs(o.d - m.d); if (dd <= 3 && dd < bd) { bd = dd; best = o; } });
      if (!best) return; used[best.id] = 1;
      var a = _glCsDupInfo_(ents[m.id]), b = _glCsDupInfo_(ents[best.id]);
      out.push({ code: code, sheet: (accM[code] || {}).name || code, row: rowOf[m.id] || 0, amt: m.amt, cur: m.cur, dir: m.dir, dd: bd, mine: a, other: b,
        rec: 'keepOther', why: b.kind === 'auto' ? 'القيد التلقائي يُعاد إنشاؤه من مصدره دائماً ويظهر في شاشات العمرة — احذف نسخة الشيت واربط الصف به'
          : b.kind === 'sheet' ? 'نفس الحركة مسجّلة في شيتين — احذف نسخة هذا الشيت واربط صفه بقيد الشيت الآخر' : 'السند اليدوي له رقم وطباعة ومرفقات — احذف نسخة الشيت واربط الصف به',
        canKeepSheet: b.kind === 'manual' });
    });
  });
  return { success: true, pairs: out, errors: errs, canEdit: _glHasSub_(session, 'sheets', 'edit') };
}
// items: [{code, mine, other, action:'keepOther'|'keepSheet'}]
function glCsDupResolve(authToken, items) {
  var session = _glPerm_(authToken, 'edit', 'sheets');
  var lock = _glLock_(); lock.waitLock(120000);
  try {
    var done = 0, probs = [], byCode = {};
    (items || []).forEach(function (it) { if (it && it.code && it.mine && it.other) (byCode[it.code] = byCode[it.code] || []).push(it); });
    var voidOne = function (id, reason) {
      var f = _glFindEntry_(id); if (!f) throw new Error('القيد ' + id + ' غير موجود');
      if (_glStr_(f.r[5]) === GL_ST_VOID_) return;
      if (_glLocked_(f.r[2])) throw new Error('القيد ' + id + ' في فترة مقفلة');
      var sh = _glSheet_('entries'); sh.getRange(f.row, 6).setValue(GL_ST_VOID_); sh.getRange(f.row, 17, 1, 3).setValues([[session.username, _glNow_(), reason]]);
      _glSetLinesStatus_([id], GL_ST_VOID_);
      try { _glSyncVoucherPays_(id, session.username); } catch (eS) {}
      logChange_(session.username, 'إلغاء قيد مكرر (شيت ↔ شاشات)', 'GL:' + id, 'الحالة', GL_ST_POSTED_, GL_ST_VOID_ + ' — ' + reason);
    };
    Object.keys(byCode).forEach(function (code) {
      var cfg = _glCsCfg_(code), S = null, QC = _glCsCols_(cfg).qaid + 1, rows = null;
      try { S = _glCsOpen_(cfg); rows = _glCsReadRows_(S.sh, cfg.startRow || 2, cfg); } catch (e) { probs.push(code + ': ' + e.message); return; }
      byCode[code].forEach(function (it) {
        try {
          var o = _glFindEntry_(_glStr_(it.other)); if (!o || _glStr_(o.r[5]) !== GL_ST_POSTED_) throw new Error('القيد ' + it.other + ' لم يعد قائماً');
          if (it.action === 'keepSheet') {
            if (_glCsSrcLbl_(o.r[6]).k !== 'manual') throw new Error('القيد ' + it.other + ' تلقائي من شاشات البرنامج — لا يُحذف (يُعاد إنشاؤه من مصدره)؛ احذف نسخة الشيت بدلاً منه');
            voidOne(_glStr_(it.other), 'مكرر مع صف شيت ' + ((_glAccounts_().map[code] || {}).name || code) + ' (' + it.mine + ')');
          } else {
            voidOne(_glStr_(it.mine), 'مكرر مع ' + it.other + ' المسجّل من شاشات البرنامج');
            var hit = null; rows.forEach(function (x) { if (!hit && String(x.fRaw || x.f || '').split('|').map(function (t) { return t.trim(); }).indexOf(_glStr_(it.mine)) >= 0) hit = x; });
            if (hit) {
              var raw = String(hit.fRaw || hit.f || ''), val = raw.indexOf('|') >= 0 ? raw.split('|').map(function (t) { t = t.trim(); return t === _glStr_(it.mine) ? _glStr_(it.other) : t; }).join(' | ') : _glStr_(it.other);
              S.sh.getRange(hit.row, QC).setNumberFormat('@').setValue(val);
            }
          }
          done++;
        } catch (e) { probs.push(it.mine + ': ' + e.message); }
      });
    });
    return { success: true, done: done, problems: probs };
  } finally { _glUnlock_(lock); }
}

/* ============================================================================
   🔁🔁 (V4.283) فحص التكرار العام — عبر كل حسابات النقدية (الخزائن + البنوك + العهد) وكل المصادر
   ----------------------------------------------------------------------------
   يلتقط الدفعة/الحركة الواحدة حين تُسجَّل أكثر من مرة من مصادر مختلفة (سند يدوي + قيد تلقائي من
   حسابات عملاء العمرة + صف شيت + استيراد ERP…) على نفس الحساب النقدي، بنفس (العملة + الاتجاه +
   المبلغ) وبفارق أيام ضمن النافذة. ليس حصراً مؤكَّداً — بل مرشَّحات «قد تكون مكررة» والقرار للمستخدم.
   التوصية تلقائياً: الإبقاء على القيد التلقائي (يُعاد إنشاؤه من مصدره ويغذّي الشاشات فلا يُحذف) وإلا
   السند اليدوي (له رقم ومرفقات)، وإلغاء النسخ الأخرى؛ ونسخة الشيت يُعاد ربط صفها بالقيد الباقي. */
var GL_CASHDUP_RANK_ = { auto: 4, manual: 3, erp: 2, sheet: 1 };   // أولوية «الإبقاء» عند الترشيح
function _glCashDupPartyKey_(s) { return _glStr_(s).replace(/[ـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase(); }
// يبني «الطرف المقابل» لقيد: أطراف السطور غير النقدية (عميل/وكيل أو اسم الحساب) — للعرض وكإشارة ثانوية بالمطابقة
function _glCashDupCounter_(lines, cashCode, accM) {
  var seen = {}, out = [];
  (lines || []).forEach(function (l) {
    if (l.account === cashCode) return;
    var a = accM[l.account], nm = _glStr_(l.client) || _glStr_(l.agent) || (a ? _glStr_(a.link || a.name) : l.account);
    if (nm && !seen[nm]) { seen[nm] = 1; out.push(nm); }
  });
  return out.join(' + ');
}
// opts: { window:3, kinds:['safe','bank','custody'], minAmt:0, crossOnly:false }
function glCashDupScan(authToken, opts) {
  var session = _glPerm_(authToken, 'view');
  opts = opts || {};
  var win = Math.max(0, parseInt(opts.window, 10)); if (isNaN(win)) win = 3;
  var kinds = (opts.kinds && opts.kinds.length) ? opts.kinds : ['safe', 'bank', 'custody'];
  var kindOk = {}; kinds.forEach(function (k) { kindOk[k === 'cust' ? 'custody' : k] = 1; });
  var minAmt = _glNum_(opts.minAmt) || 0;
  var accM = _glAccounts_().map, ents = {}, linesBy = {};
  _glRows_('entries').forEach(function (r) { var id = _glStr_(r[0]); if (id && _glStr_(r[5]) === GL_ST_POSTED_) ents[id] = r; });
  _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (ents[id] && _glStr_(l[3]) === GL_ST_POSTED_) (linesBy[id] = linesBy[id] || []).push(_glLineObj_(l)); });
  var day = function (d) { var k = _glDKey_(d); return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : 0; };
  var subKind = function (k) { return k === 'bank' ? 'bank' : k === 'custody' ? 'cust' : k === 'safe' ? 'safe' : ''; };
  var buckets = {}, stat = { lines: 0, accs: {}, byKind: { safe: 0, bank: 0, custody: 0 } };
  Object.keys(linesBy).forEach(function (id) {
    var e = ents[id], sl = _glCsSrcLbl_(_glStr_(e[6])), seenSig = {};
    linesBy[id].forEach(function (l) {
      var a = accM[l.account]; if (!a || a.isGroup || !kindOk[a.kind]) return;
      var amt = _glR2_(l.debit || l.credit); if (!amt || amt < minAmt) return;
      stat.lines++; stat.accs[l.account] = 1; stat.byKind[a.kind] = (stat.byKind[a.kind] || 0) + 1;
      var dir = l.debit ? 'D' : 'C', sig = l.account + '|' + l.currency + '|' + dir + '|' + amt.toFixed(2);
      if (seenSig[sig]) return; seenSig[sig] = 1;   // نفس القيد له السطر مرتين على نفس الحساب ⇒ مرة واحدة
      (buckets[sig] = buckets[sig] || []).push({
        id: id, account: l.account, accName: (a.link || a.name), kind: a.kind, sub: subKind(a.kind),
        cur: l.currency, dir: dir, amt: amt, day: day(l.date), date: _glDate_(l.date),
        srcKind: sl.k, src: sl.l, vno: (_glStr_(e[6]).match(/^VCH:(.+)$/) || [])[1] || '',
        type: _glStr_(e[3]), desc: _glCleanDesc_(_glStr_(e[4])),
        party: _glCashDupCounter_(linesBy[id], l.account, accM)
      });
    });
  });
  var clusters = [];
  Object.keys(buckets).forEach(function (sig) {
    var arr = buckets[sig]; if (arr.length < 2) return;
    arr.sort(function (a, b) { return a.day - b.day; });
    var i = 0;
    while (i < arr.length) {
      var grp = [arr[i]], j = i + 1, lo = arr[i].day;
      while (j < arr.length && (arr[j].day - lo) <= win) { grp.push(arr[j]); j++; }
      i = j;
      // أزِل تكرار نفس القيد داخل المجموعة، واشترط قيدين مختلفين على الأقل
      var byId = {}; grp = grp.filter(function (m) { if (byId[m.id]) return false; byId[m.id] = 1; return true; });
      if (grp.length < 2) continue;
      // الترشيح: احتفظ بأعلى رتبة (التلقائي ثم اليدوي)، ولا تُدرِج التلقائي ضمن ما يُحذف (يُعاد إنشاؤه)
      var keep = grp.slice().sort(function (a, b) {
        var ra = GL_CASHDUP_RANK_[a.srcKind] || 2, rb = GL_CASHDUP_RANK_[b.srcKind] || 2;
        if (rb !== ra) return rb - ra;
        if (a.vno && !b.vno) return -1; if (b.vno && !a.vno) return 1;
        if (a.day !== b.day) return a.day - b.day;
        return a.id < b.id ? -1 : 1;
      })[0];
      var voids = grp.filter(function (m) { return m.id !== keep.id && m.srcKind !== 'auto'; });
      if (!voids.length) continue;   // لا شيء يُحذف فعلياً (مثلاً تكرار تلقائي×تلقائي) — تُخطّى
      var kinds2 = {}; grp.forEach(function (m) { kinds2[m.srcKind] = 1; });
      var cross = Object.keys(kinds2).length > 1;
      var pk = _glCashDupPartyKey_(grp[0].party), sameParty = !!pk && grp.every(function (m) { return _glCashDupPartyKey_(m.party) === pk; });
      var span = grp[grp.length - 1].day - grp[0].day;
      var score = 55 + (cross ? 25 : 0) + (sameParty ? 12 : 0) + (span === 0 ? 8 : 0);
      if (score > 98) score = 98;
      var why = keep.srcKind === 'auto'
        ? 'نسخة تلقائية (من شاشات البرنامج) تُعاد إنشاؤها من مصدرها وتغذّي الشاشات — تُبقى، وتُلغى النسخ الأخرى المكرّرة'
        : (keep.vno ? 'السند اليدوي ' + keep.vno + ' له رقم ومرفقات — يُبقى، وتُلغى النسخ المكرّرة' : 'يُبقى القيد الأقدم/الأوثق وتُلغى النسخ المكرّرة');
      clusters.push({
        sig: sig, account: keep.account, accName: keep.accName, kind: keep.kind, sub: keep.sub,
        cur: keep.cur, dir: keep.dir, amt: keep.amt, span: span, cross: cross, sameParty: sameParty, score: score,
        party: grp[0].party, keep: keep.id, voids: voids.map(function (m) { return m.id; }), why: why,
        members: grp.map(function (m) { return { id: m.id, date: m.date, type: m.type, desc: m.desc, src: m.src, srcKind: m.srcKind, vno: m.vno, party: m.party, isKeep: m.id === keep.id, canVoid: m.srcKind !== 'auto' && m.id !== keep.id }; })
      });
    }
  });
  clusters.sort(function (a, b) { return b.score - a.score || b.amt - a.amt; });
  if (opts.crossOnly) clusters = clusters.filter(function (c) { return c.cross; });
  var canEdit = ['safe', 'bank', 'cust'].some(function (s) { return _glHasSub_(session, s, 'edit'); }) || _sessionHasPerm_(session, 'gl.edit') || _glIsAdmin_(session);
  return { success: true, clusters: clusters, count: clusters.length, canEdit: canEdit, window: win,
    scanned: { lines: stat.lines, accounts: Object.keys(stat.accs).length, byKind: stat.byKind } };
}
// items: [{keep, voids:[id,...]}] — يُلغي النسخ المختارة، ويمنع إلغاء التلقائي، ويعيد ربط صف الشيت بالقيد الباقي
function glCashDupResolve(authToken, items) {
  var session = _glPerm_(authToken, 'view');
  var lock = _glLock_(); lock.waitLock(120000);
  try {
    var done = 0, probs = [], accM = _glAccounts_().map;
    var cashSubOf = function (id) {   // نوع صلاحية حسب حساب النقدية بالقيد (خزينة/بنك/عهدة)
      var subs = {}; _glLinesOf_(id).map(_glLineObj_).forEach(function (l) { var a = accM[l.account]; if (a && /^(safe|bank|custody)$/.test(a.kind)) subs[_glSubOfAcc_(l.account)] = 1; });
      return Object.keys(subs);
    };
    (items || []).forEach(function (it) {
      if (!it || !it.keep || !it.voids || !it.voids.length) return;
      var keepF = _glFindEntry_(_glStr_(it.keep));
      if (!keepF || _glStr_(keepF.r[5]) !== GL_ST_POSTED_) { probs.push('القيد الباقي ' + it.keep + ' لم يعد قائماً — تُخطّي المجموعة'); return; }
      it.voids.forEach(function (vid) {
        vid = _glStr_(vid);
        try {
          var f = _glFindEntry_(vid); if (!f) throw new Error('غير موجود');
          if (_glStr_(f.r[5]) === GL_ST_VOID_) { return; }
          var sk = _glStr_(f.r[6]), sl = _glCsSrcLbl_(sk);
          if (sl.k === 'auto') throw new Error('قيد تلقائي يُعاد إنشاؤه من مصدره — لا يُحذف (احذف النسخة اليدوية/الشيت بدلاً منه)');
          if (_glLocked_(f.r[2])) throw new Error('في فترة مقفلة');
          // صلاحية التعديل على نوع حساب النقدية بالقيد
          cashSubOf(vid).forEach(function (sub) { if (sub) _glSubCheck_(session, sub, 'edit'); });
          var sh = _glSheet_('entries');
          sh.getRange(f.row, 6).setValue(GL_ST_VOID_);
          sh.getRange(f.row, 17, 1, 3).setValues([[session.username, _glNow_(), 'مكرر مع ' + it.keep]]);
          _glSetLinesStatus_([vid], GL_ST_VOID_);
          try { _glSyncVoucherPays_(vid, session.username); } catch (eS) {}
          // نسخة شيت ⇒ أعِد ربط صفها بالقيد الباقي حتى لا يُعاد إنشاؤها بالمزامنة
          var mC = sk.match(/^CUST:(.+)$/);
          if (mC) { try { _glDupRelinkSheetRow_(mC[1], vid, _glStr_(it.keep)); } catch (eR) { probs.push('تعذّر إعادة ربط صف الشيت للقيد ' + vid + ': ' + eR.message); } }
          logChange_(session.username, 'إلغاء قيد مكرر (فحص عام)', 'GL:' + vid, 'الحالة', GL_ST_POSTED_, GL_ST_VOID_ + ' — مكرر مع ' + it.keep);
          done++;
        } catch (e) { probs.push(vid + ': ' + e.message); }
      });
    });
    return { success: true, done: done, problems: probs };
  } finally { _glUnlock_(lock); }
}
// يعيد كتابة رقم القيد بصف شيت العهدة/الخزينة الذي كان يشير للقيد الملغى ليشير للقيد الباقي
function _glDupRelinkSheetRow_(code, oldId, newId) {
  var cfg = _glCsCfg_(code); if (!cfg || !cfg.id) return;
  var S = _glCsOpen_(cfg), QC = _glCsCols_(cfg).qaid + 1, rows = _glCsReadRows_(S.sh, cfg.startRow || 2, cfg), hit = null;
  rows.forEach(function (x) { if (!hit && String(x.fRaw || x.f || '').split('|').map(function (t) { return t.trim(); }).indexOf(oldId) >= 0) hit = x; });
  if (!hit) return;
  var raw = String(hit.fRaw || hit.f || ''), val = raw.indexOf('|') >= 0 ? raw.split('|').map(function (t) { t = t.trim(); return t === oldId ? newId : t; }).join(' | ') : newId;
  S.sh.getRange(hit.row, QC).setNumberFormat('@').setValue(val);
}
function glCustSheetApprove(authToken, code, items) {
  var session = _glPerm_(authToken, 'edit', 'sheets');
  var pick = {}, lnk = {}, frc = {}, cc = {}, sus = {}, susAcc = {}, rep = {}, spl = {}, tov = {}, accsS = _glAccounts_();
  (items || []).forEach(function (it) { if (!it || !it.row) return; if (_glStr_(it.trip)) tov[+it.row] = _glStr_(it.trip); if (_glStr_(it.link)) { lnk[+it.row] = _glStr_(it.link); return; }
    var sp0 = _glCsSplitNorm_(it.splits, accsS); if (sp0) { if (it.repoint) rep[+it.row] = sp0[0].account; else pick[+it.row] = sp0[0].account; spl[+it.row] = sp0; if (it.force) frc[+it.row] = 1; return; }   // ➗ (V4.333/334)
    if (it.susp) { sus[+it.row] = 1; susAcc[+it.row] = _glStr_(it.account); if (it.force) frc[+it.row] = 1; return; }   // ⏳ (V4.324) مبلغ معلق
    if (it.repoint && _glStr_(it.account)) { rep[+it.row] = _glStr_(it.account); if (_glStr_(it.ccur)) cc[+it.row] = { cur: _glCur_(it.ccur), amt: _glNum_(it.camt) }; return; }
    if (_glStr_(it.account)) { pick[+it.row] = _glStr_(it.account); if (it.force) frc[+it.row] = 1; if (_glStr_(it.ccur)) cc[+it.row] = { cur: _glCur_(it.ccur), amt: _glNum_(it.camt) }; } });
  if (!Object.keys(pick).length && !Object.keys(lnk).length && !Object.keys(sus).length && !Object.keys(rep).length) throw new Error('اختر حساب الطرف (أو الربط بالقيد القائم) لصف واحد على الأقل');
  // ⚡ (V4.308) فتح الشيت الخارجي وقراءته (الجزء البطيء) قبل أخذ القفل — فلا يتجمّد حفظ بقية المستخدمين أثناء الاعتماد
  var pre = null; try { var cfg0 = _glCsCfg_(_glStr_(code)); if (cfg0 && cfg0.id) { var S0 = _glCsOpen_(cfg0); pre = { S: S0, rows: _glCsReadRows_(S0.sh, cfg0.startRow || 2, cfg0) }; } } catch (eP) { pre = null; }
  var lock = _glLock_(); lock.waitLock(120000);
  try {
    Object.keys(sus).forEach(function (rw) { pick[rw] = _glCsSuspAcc_(susAcc[rw], session.username); });   // داخل القفل (قد يُنشأ حساب المعلقات)
    return _glCsSync_(_glStr_(code), session.username, { approve: pick, tripOv: tov, link: lnk, force: frc, ccy: cc, susp: sus, repoint: rep, split: spl, pre: pre });   // (V4.278 / V4.305 مبلغ وعملة الطرف المقابل)
  } finally { _glUnlock_(lock); }
}
function _glHbCustPays_() {
  var ck = _glCK_('hbcustpays'), got = null;
  try { got = _glCGet_(ck); } catch (e0) {}
  if (got && got.list) return got.list;
  var list = (_glHbRead_().pays || []).filter(function (p) { return /^CUSTODY:/.test(p.id); });
  try { _glCPut_(ck, { list: list }, 1800); } catch (e1) {}
  return list;
}
function _glCsSync_(code, user, opts) {
  opts = opts || {};
  _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
  var accs = _glAccounts_(), a = accs.map[code];
  if (!a || a.isGroup) throw new Error('حساب العهدة غير موجود');
  var cfg = _glCsCfg_(code); if (!cfg.id) throw new Error('لم يُربط شيت لهذه العهدة بعد');
  var S = opts.pre ? opts.pre.S : _glCsOpen_(cfg), rows = opts.pre ? opts.pre.rows : _glCsReadRows_(S.sh, cfg.startRow || 2, cfg), QC = _glCsCols_(cfg).qaid + 1;   // (V4.275) القراءة المسبقة (خارج القفل) للمزامنة المجدولة
  // نقل أرقام القيود القديمة من F إلى عمود القيد الجديد (مرة واحدة، بلا مسح F)
  // (V4.279/S4) تجميع الكتابة بسلاسل متصلة بدل خلية-خلية (غالبًا بلا أثر بعد أول ترحيل)
  if (!opts.preview) {
    var mg = []; rows.forEach(function (x) { if (x.fOld) mg.push({ row: x.row, val: x.f }); });
    mg.sort(function (a, b) { return a.row - b.row; });
    for (var mi = 0; mi < mg.length;) {
      var ms = mg[mi].row, mj = mi, mb = [[mg[mi].val]];
      while (mj + 1 < mg.length && mg[mj + 1].row === mg[mj].row + 1) { mj++; mb.push([mg[mj].val]); }
      try { S.sh.getRange(ms, QC, mb.length, 1).setNumberFormat('@').setValues(mb); } catch (e) { }
      mi = mj + 1;
    }
  }
  var learned = _glCsMap_(), cur = _glCur_(a.currency || cfg.cur || 'SAR'), fx = _glFxDailyMap_();
  // 💱 (V4.305) عملة الطرف الافتراضية + اقتراح مبلغه بعملته لكل اقتراح حساب (للشاشة وأزرار تليجرام)
  _GL_DEFCUR_MEMO_ = null;
  var dcOf = function (c) { return (_glDefCurMap_().cur[c]) || ''; };
  var ccAnn = function (b, x) {
    var rc = x.cur || cur, am = x.inAmt || x.outAmt;
    (b.sugg || []).forEach(function (sg) { var d = dcOf(sg.code); if (d && d !== rc) sg.cc = _glCcyGuess_(x.desc, am, rc, d, x.date, fx); });
    return b;
  };
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
  // ⚡ (V4.307) كانت تقرأ ملف الحجوزات الخارجي كاملاً (الحجوزات + الدفعات) مع **كل** مزامنة شيت عهدة داخل القفل، وكل دقيقة.
  // المطلوب فقط دفعات «CUSTODY:» القديمة (سجّلها برنامج الحجوزات قبل إيقاف مزامنة العهد هناك ⇒ لا تتغيّر تقريباً) ⇒ كاش 30 دقيقة
  try { _glHbCustPays_().forEach(function (p) { if (p.id.indexOf('CUSTODY:' + seg + ':') === 0) hbPays[p.id] = p; }); } catch (e) {}
  var out = { success: true, account: { code: a.code, name: a.name, currency: cur }, sheet: { title: cfg.title || '', tab: S.sh.getName(), url: 'https://docs.google.com/spreadsheets/d/' + cfg.id },
    rows: rows.length, linked: 0, created: [], updated: [], hb: [], hbWait: [], pending: [], problems: [], orphans: [], preview: !!opts.preview };
  var seen = {}, toCreate = [], toUpdate = [], nameIdx = null, okUsed = {};
  var susReg = _glCsSuspReg_(), susOm = null, susDirty = false; out.susp = [];   // ⏳ (V4.324) المبالغ المعلقة المسجَّلة من هذا الشيت (تظهر بالاستكمال حتى تحديد حسابها)
  rows.forEach(function (y) { if (y.f) okUsed[y.f] = 1; });
  var feeAcc = null;
  rows.forEach(function (x) {
    var rk = x.rk || x.row;
    var base = { row: rk, date: x.date, desc: x.desc, inAmt: x.inAmt, outAmt: x.outAmt, hint: x.hint };
    if (x.isFee) { base.fee = 1; base.feeOf = x.row; }
    if (x.cur) base.cur = x.cur;
    if (x.inAmt && x.outAmt) { base.msg = 'الصف فيه مبلغ وارد وصادر معاً — افصلهما في صفين'; out.problems.push(base); return; }
    if (x.inAmt < 0 || x.outAmt < 0) { base.msg = 'مبلغ سالب'; out.problems.push(base); return; }
    if (x.f) {
      if (ents[x.f]) {
        seen[x.f] = 1;
        if (mine[x.f]) {
          var er = ents[x.f].r, st = _glStr_(er[5]);
          if (st === GL_ST_VOID_) { base.msg = 'قيده ' + x.f + ' ملغى — امسح رقم القيد من الشيت لتسجيله من جديد'; out.problems.push(base); return; }
          var rp = susReg[x.f] && opts.repoint && opts.repoint[x.rk || x.row];
          if (susReg[x.f] && !rp) {   // ⏳ (V4.324) غيّر المستخدم طرفه يدوياً (نافذة القيد/التعديل الجماعي) ⇒ لم يعد معلقاً
            var oS = (susOm || (susOm = _glOvrMap_()))['CUST:' + code + '#' + x.f];
            if (oS && oS.acc.length && oS.acc[oS.acc.length - 1].to !== susReg[x.f].a) { delete susReg[x.f]; susDirty = true; }
            else if (st === GL_ST_POSTED_) out.susp.push({ row: x.rk || x.row, id: x.f, date: x.date, desc: x.desc, diff: susReg[x.f].d !== undefined ? 1 : 0,
              inAmt: susReg[x.f].d !== undefined ? (x.inAmt > 0 ? Math.abs(susReg[x.f].d) : 0) : x.inAmt, outAmt: susReg[x.f].d !== undefined ? (x.outAmt > 0 ? Math.abs(susReg[x.f].d) : 0) : x.outAmt, cur: x.cur || '', hint: x.hint,
              acc: susReg[x.f].a, accName: (accs.map[susReg[x.f].a] || {}).name || susReg[x.f].a, sugg: _glCsSuggest_(x.hint, accs, code) });
          }
          if (rp || (_glStr_(er[9]).match(/^cs:(.+)$/) || [])[1] !== x.hash) { toUpdate.push({ x: x, id: x.f, er: ents[x.f], repoint: rp || '', split: rp && opts.split && opts.split[x.rk || x.row] || null, ccy: rp && opts.ccy && opts.ccy[x.rk || x.row] || null }); return; }
        }
        out.linked++; return;
      }
      if (erp[x.f]) { seen[erp[x.f]] = 1; out.linked++; return; }
      base.msg = 'رقم القيد «' + x.f + '» غير موجود بالحسابات العامة — امسحه من الشيت لتسجيل الصف'; out.problems.push(base); return;
    }
    var hbId = 'CUSTODY:' + seg + ':' + x.row;
    if (x.subN > 1 || x.isFee) hbId = '';   // صف متعدد العملات لا يُربط بدفعة حجوزات واحدة
    if (hbId && hbAuto[hbId]) { seen[hbAuto[hbId]] = 1; toCreate.push({ x: x, linkOnly: hbAuto[hbId] }); return; }
    if (hbId && hbPays[hbId]) { base.msg = 'دفعة مسجلة ببرنامج الحجوزات (' + hbPays[hbId].party + ') — يُقيَّد عبر مزامنة الحجوزات'; out.hbWait.push(base); return; }
    if (!x.date) { base.msg = 'بلا تاريخ (العمود D)'; out.problems.push(base); return; }
    // ✔ (V4.262) صف معلَّم «ok» = سُجّل من شاشات البرنامج ⇒ يُربط بقيده القائم على نفس الحساب (نفس العملة والمبلغ والاتجاه، ±3 أيام)
    if (x.ok && !x.isFee) {
      var mm = _glCsOkMatch_(code, x, x.cur || cur, okUsed);
      if (mm) { okUsed[mm] = 1; seen[mm] = 1; toCreate.push({ x: x, linkOnly: mm, okLink: 1 }); return; }
      base.msg = 'معلَّم «ok» ولم يُعثر على قيده بالحساب (نفس المبلغ والعملة ±3 أيام) — امسح ok لتسجيله من الشيت، أو سجّله من الشاشات';
      out.problems.push(base); return;
    }
    // 🔁 (V4.278) منع التكرار: صف جديد يطابق قيداً قائماً على نفس الحساب (دفعة من شاشات البرنامج/حسابات العملاء/سند يدوي/شيت آخر)
    // بنفس العملة والمبلغ والاتجاه ±3 أيام ⇒ لا يُسجَّل تلقائياً بل ينتظر قرارك: «نفس الحركة ⇒ اربط بالقيد القائم» أو «حركة مختلفة ⇒ سجّلها»
    if (opts.link && opts.link[rk] && ents[opts.link[rk]]) { var lk = opts.link[rk]; okUsed[lk] = 1; seen[lk] = 1; toCreate.push({ x: x, linkOnly: lk, okLink: 1, approved: true }); return; }
    if (!(opts.force && opts.force[rk]) && !x.isFee) {
      var dm = _glCsOkMatch_(code, x, x.cur || cur, okUsed);
      if (dm && ents[dm] && _glStr_(ents[dm].r[6]) !== 'CUST:' + code && _glStr_(ents[dm].r[5]) === GL_ST_POSTED_) {
        okUsed[dm] = 1;
        // ⚡ (V4.284) تطابق قوي (نفس الطرف أيضاً) ⇒ ربط تلقائي صامت بالقيد القائم بلا انتظار اعتماد — يقلّل «زحمة الاعتمادات
        // المتكررة». يُكتب رقم القيد القائم بالشيت فلا يتكرر، ويُسجَّل في سجل التعديلات. يُعطَّل بـ cfg.dupAutoLink=false.
        if (cfg.dupAutoLink !== false && _glCsPartyMatch_(x.hint, dm)) {
          seen[dm] = 1; toCreate.push({ x: x, linkOnly: dm, okLink: 1, autoDup: 1 }); out.autoLinked = (out.autoLinked || 0) + 1; return;
        }
        base.dup = _glCsDupInfo_(ents[dm].r); base.sugg = _glCsSuggest_(x.hint, accs, code); out.pending.push(ccAnn(base, x)); return;
      }
    }
    var cp = (opts.approve && opts.approve[rk]) || (x.isFee ? '' : _glCsResolve_(x.hint, accs, learned, code, nameIdx || (nameIdx = _glCsNameIndex_(accs, code))));
    if (!cp && x.isFee) {   // (V4.290) المصاريف البنكية تنتظر الاعتماد بحساب «المصروفات البنكية» مختاراً مسبقاً (قابل للتغيير)
      if (feeAcc === null) feeAcc = _glBankFeeAcc_();
      base.preAcc = feeAcc; base.sugg = feeAcc ? [{ code: feeAcc, name: accs.map[feeAcc].name }] : []; out.pending.push(base); return;
    }
    // ⏳ (V4.334) صف بطرف غير معروف يُسجَّل تلقائياً على حساب «المتعلقات/المعلقات» فورًا — فيتحدّث رصيد الخزينة/البنك/العهدة بلا انتظار —
    // ويبقى ظاهراً بشاشة «استكمال واعتماد» (جدول المبالغ المعلقة) لتحديد الطرف الحقيقي أو الأطراف (➗) فيُنقل القيد نفسه إليها.
    // يُعطَّل بإعداد cs_auto_susp = «لا». المعاينة لا تُنشئ حسابات، والمصاريف البنكية لها مسارها (حساب مصروفات مختار مسبقاً).
    var spAuto = false;
    // (V4.356) أصبح اختيارياً (معطَّل افتراضياً): الصف بلا طرف ينتظر بشاشة الاستكمال حتى تحدد حسابه/حساباته وعملته ومبلغه أو تختار «مبلغ معلق»
    if (!cp && !x.isFee && !opts.preview && _glStr_(_glSettings_().cs_auto_susp) === 'نعم') { cp = _glCsSuspAcc_('', user); spAuto = !!cp; }
    if (!cp) { if (x.sub > 0 && !x.isFee) return; if (x.subN > 1) base.desc = (base.desc || '') + ' [صف متعدد العملات — يُفصل لقيد لكل عملة]'; base.sugg = _glCsSuggest_(x.hint, accs, code); out.pending.push(ccAnn(base, x)); return; }
    // 💱 (V4.306) الطرف عملته الافتراضية غير عملة الصف (مثل عميل فندقي بالريال وصف خزينة بالجنيه): يُسجَّل تلقائياً بالمبلغ
    // المستنتج من البيان (مقرَّباً لأقرب رقم صحيح)، وإلا بسعر صرف تاريخ الحركة عبر وسيط تحويل العملات — بلا انتظار اختيار
    // المستخدم. القيد يدخل مع إنشائه تبويب «⏳ تغييرات تنتظر الاعتماد» (كبقية القيود التلقائية) للمراجعة فقط، بلا حجب التسجيل.
    // اختيارك الصريح لمبلغ/عملة الطرف من شاشة الاستكمال (اعتماد بـccy محدَّد) يبقى يتقدّم على الاستنتاج التلقائي.
    var spl = opts.split && opts.split[rk] ? opts.split[rk] : null;   // ➗ (V4.333)
    var multi = x.subN > 1;   // صف متعدد العملات (يُفصل لقيد لكل عملة) يبقى بعملة كل جزء كما كان — لتخصيصه استخدم «📝 قيد»
    var appr = !!(opts.approve && opts.approve[rk]) || spAuto, rowCur = x.cur || cur, ccy = appr && !multi && !spl && opts.ccy && opts.ccy[rk] ? opts.ccy[rk] : null;
    var dc0 = x.isFee || multi || spl || spAuto || (opts.susp && opts.susp[rk]) ? '' : dcOf(cp);   // ⏳ (V4.324) المعلق بعملة الصف نفسها
    var ccyGuessed = false;
    if (dc0 && dc0 !== rowCur && !ccy) {
      var g0 = _glCcyGuess_(x.desc, x.inAmt || x.outAmt, rowCur, dc0, x.date, fx);
      ccy = { cur: dc0, amt: Math.round(g0.amt), src: g0.src }; ccyGuessed = true;
    }
    toCreate.push({ x: x, cp: cp, approved: appr, ccy: ccy, ccyGuessed: ccyGuessed, susp: !!(opts.susp && opts.susp[rk]) || spAuto, split: spl });
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
    out.hb = toCreate.filter(function (c) { return c.linkOnly && !c.okLink; }).map(function (c) { return { row: c.x.row, id: c.linkOnly }; });
    out.merged = toCreate.filter(function (c) { return c.okLink; }).map(function (c) { return { row: c.x.row, id: c.linkOnly, date: c.x.date, desc: c.x.desc, inAmt: c.x.inAmt, outAmt: c.x.outAmt, cur: c.x.cur || cur }; });
    out.updated = toUpdate.map(function (u) { return { row: u.x.row, id: u.id }; });
    return out;
  }
  // ⚡ (V4.322) لا تُفتح/تُلمس شيتات القيود إلا عند وجود كتابة فعلية (تسجيل/تعديل). كان _glSheet_ يُستدعى دائماً فيرفع رقم إصدار
  // بيانات الحسابات (GL_DATA_VER) ⇒ يُبطل كاش الدفتر لكل المستخدمين حتى في المزامنات التي لا تكتب شيئاً. الآن بقارئ كسول.
  var _eSh = null, _lSh = null, eSh = function () { return _eSh || (_eSh = _glSheet_('entries')); }, lSh = function () { return _lSh || (_lSh = _glSheet_('lines')); }, fW = [];
  // 1) قيود جديدة (دفعة واحدة)
  var built = [];
  toCreate.forEach(function (c) {
    if (c.linkOnly) { fW.push({ x: c.x, id: c.linkOnly }); if (c.okLink) (out.merged = out.merged || []).push({ row: c.x.row, id: c.linkOnly }); else out.hb.push({ row: c.x.row, id: c.linkOnly }); return; }
    var crk = c.x.rk || c.x.row;
    if (opts.descOv && opts.descOv[crk]) c.x = Object.assign({}, c.x, { desc: opts.descOv[crk] });   // (V4.268) بيان معدَّل بشاشة الاستكمال
    if (opts.tripOv && opts.tripOv[crk]) c.x = Object.assign({}, c.x, { trip: opts.tripOv[crk] });   // (V4.343) رحلة اختيارية
    try { var b = _glCsEntry_(c.x, code, c.cp, c.x.cur || cur, fx, c.ccy, c.split); b.c = c; built.push(b); }
    catch (err) { out.problems.push({ row: c.x.row, date: c.x.date, desc: c.x.desc, inAmt: c.x.inAmt, outAmt: c.x.outAmt, hint: c.x.hint, msg: err.message }); }
  });
  if (built.length) {
    var first = _glNextEntrySeq_(built.length), eRows = [], lRows = [], ccyQ = [];
    built.forEach(function (b, i) {
      var id = b.id = _glEntryId_(first + i);
      var w = _glWriteEntry_(b.v, { id: id, seq: first + i, status: GL_ST_POSTED_, sourceKey: 'CUST:' + code, desc: b.e.desc, trip: b.c.x.trip || '', ref: 'cs:' + b.c.x.hash }, user);
      eRows.push(w.eRow); lRows = lRows.concat(w.lRows);
      fW.push({ x: b.c.x, id: id });
      out.created.push({ row: b.c.x.row, id: id, date: b.c.x.date, desc: b.e.desc, inAmt: b.c.x.inAmt, outAmt: b.c.x.outAmt, account: b.c.cp, cc: b.cc || null, ccSrc: (b.c.ccy && b.c.ccy.src) || '' });
      if (b.c.ccyGuessed) ccyQ.push({ id: id, v: b.v, e: b.e, ccy: b.c.ccy });   // ⚡ (V4.308) تُجمَّع وتُكتب مرة واحدة بعد الحلقة
      if (b.c.approved && b.c.x.hint && !b.c.x.isFee && !b.c.susp) learned[_glCsKey_(b.c.x.hint)] = b.c.cp;   // ⏳ (V4.324) المعلق لا يُتعلَّم كطرف
      if (b.c.susp) (out._susNew = out._susNew || []).push({ id: id, a: b.c.cp });
    });
    eSh().getRange(eSh().getLastRow() + 1, 1, eRows.length, eRows[0].length).setValues(eRows);
    lSh().getRange(lSh().getLastRow() + 1, 1, lRows.length, lRows[0].length).setValues(lRows);
    _glCcyPendQueueMany_(ccyQ);   // (V4.306) للمراجعة بتبويب «⏳ تغييرات تنتظر الاعتماد» — ⚡ (V4.308) كتابة واحدة
    // 🐛 (V4.309) إصلاح: قيود مُنشأة تلقائياً من شيت عهدة/خزينة/بنك على حساب عميل عمرة لم تكن تُنسخ أبداً إلى
    // «حسابات عملاء العمرة» (لا تستدعي هذه الدالة إطلاقاً) فتظهر بكشف الحساب العام فقط لا بشاشة دفعات العميل.
    // تُستدعى فقط لحسابات الخزينة/البنك (نوع القيد الناتج سند قبض/صرف أو إيداع/سحب بنكي يطابق الشرط داخل الدالة)
    built.forEach(function (b) { try { _glCpSyncVoucher_(b.id, user); } catch (eCp) { Logger.log('cs cp sync: ' + eCp.message); } });   // (V4.330) + العهدة أيضاً
    try { _glApSyncRows_(eRows, lRows, user); } catch (eAp) { Logger.log('cs agent sync: ' + eAp.message); }   // 🧑‍💼 (V4.328) صف على حساب وكيل ⇒ دفعة بحسابات الوكلاء
    if (built.some(function (b) { return b.c.approved; })) _glSetSetting_('custsheet_map', JSON.stringify(learned));
    if (out._susNew) { out._susNew.forEach(function (z) { susReg[z.id] = { c: code, a: z.a, by: user, at: _glNow_() }; }); _glCsSuspSave_(susReg); out.suspended = out._susNew.length; delete out._susNew; }
  }
  // 2) صفوف تغيّرت بعد قيدها ⇒ تحديث القيد في مكانه (الطرف: من الشيت لو معروف وإلا طرف القيد الحالي)
  if (toUpdate.length) {
    var oldLines = {}; _glRows_('lines').forEach(function (r) { var id = _glStr_(r[0]); if (id) (oldLines[id] = oldLines[id] || []).push(r); });
    var csOvr = {}; (function () { var om = _glOvrMap_(); Object.keys(om).forEach(function (k) { if (/^CUST:/.test(k) && om[k].acc.length) csOvr[k] = om[k].acc[om[k].acc.length - 1].to; }); })();
    var done = [];
    toUpdate.forEach(function (u) {
      try {
        if (_glLocked_(u.er.r[2])) throw new Error('القيد ' + u.id + ' في فترة مقفلة — لم يُحدَّث');
        var prevAll = (oldLines[u.id] || []).filter(function (r) { return _glStr_(r[4]) !== code && (accs.map[_glStr_(r[4])] || {}).kind !== 'fx'; }), prev = prevAll[0];
        var cashOld = (oldLines[u.id] || []).filter(function (r) { return _glStr_(r[4]) === code; })[0];
        // ➗ (V4.333/334) قيد بأطراف مقسَّمة: تعديل مبلغ الصف بالشيت لا يُعيد توزيع الجديد على الحسابات — يبقى كل جزء كما اعتُمد ويُسجَّل
        // «الفرق» (زيادة/نقص) على حساب المعلقات (طرفا القيد متساويان دائماً) ويظهر بشاشة الاستكمال لتحديد حسابه (أو أكثر من حساب ➗).
        var sdReg = susReg[u.id], sdMode = !!(sdReg && sdReg.d !== undefined);
        if (u.split || (prevAll.length > 1 && !u.repoint) || (u.repoint && sdMode)) {
          var nAmtS = u.x.inAmt || u.x.outAmt, spU = [], isInS = u.x.inAmt > 0, susA = _glCsSuspAcc_('', user), keepS = 0;
          if (!u.x.date) throw new Error('بلا تاريخ (العمود D)');
          if (u.split && !sdMode) spU = u.split;   // ➗ نقل معلق عادي لأكثر من حساب (المجموع مُتحقَّق منه في _glCsEntry_)
          else {
            // الأجزاء المعتمدة تبقى بمبالغها (بعملة القيد) · أجزاء المعلقات القديمة تُعاد حسابها كفرق جديد
            var rowCurS = u.x.cur || cur, rowRtS = cashOld ? (_glNum_(cashOld[8]) || 1) : 1;
            prevAll.forEach(function (r) {
              if (_glStr_(r[4]) === susA) return;
              var lc = _glCur_(_glStr_(r[7]) || rowCurS), la = _glR2_(_glNum_(r[5]) || _glNum_(r[6]));
              if (lc === rowCurS) spU.push({ account: _glStr_(r[4]), amt: la });
              else spU.push({ account: _glStr_(r[4]), amt: _glR2_((_glNum_(r[9]) || _glNum_(r[10])) / (rowCurS === 'EGP' ? 1 : rowRtS)), cur: lc, camt: la });   // 💱 (V4.356) جزء بعملة أخرى يبقى بعملته
              keepS += spU[spU.length - 1].amt;
            });
            var diffS = _glR2_(nAmtS - keepS);
            if (sdMode && u.repoint) {   // نقل الفرق المعلق لحسابه الحقيقي (أو أكثر)
              var sgn = diffS < 0 ? -1 : 1, parts = u.split ? u.split : [{ account: u.repoint, amt: Math.abs(diffS) }];
              parts.forEach(function (z) { spU.push(Object.assign({}, z, { amt: _glR2_(sgn * z.amt) })); });
            } else if (Math.abs(diffS) >= 0.01) spU.push({ account: susA, amt: diffS });
          }
          var needSus = spU.some(function (z) { return z.account === susA; });
          if (spU.length < 2) spU.push({ account: susA, amt: 0 });
          spU = spU.filter(function (z) { return Math.abs(z.amt) >= 0.01; });
          if (spU.length < 2) throw new Error('تعذّر توزيع قيد مقسَّم');
          var bS = _glCsEntry_(u.x, code, spU[0].account, u.x.cur || cur, fx, null, spU), rS = u.er.r;
          var wS = _glWriteEntry_(bS.v, { id: u.id, seq: rS[1], status: _glStr_(rS[5]) || GL_ST_POSTED_, sourceKey: 'CUST:' + code, batchId: rS[7], desc: bS.e.desc, ref: 'cs:' + u.x.hash,
            createdBy: rS[12], createdAt: rS[13], row: u.er.row }, user);
          eSh().getRange(u.er.row, 1, 1, wS.eRow.length).setValues([wS.eRow]);
          done.push({ id: u.id, lRows: wS.lRows, eRow: wS.eRow, repoint: (u.repoint || u.split) && !needSus ? (u.repoint || spU[0].account) : '', split: !!u.split, oldRows: oldLines[u.id] || [] });
          if (!needSus && sdMode && !u.repoint) { delete susReg[u.id]; susDirty = true; }   // الفرق صار صفراً ⇒ لم يعد معلقاً
          if (needSus) { var dS = spU.filter(function (z) { return z.account === susA; })[0]; susReg[u.id] = { c: code, a: susA, d: dS.amt, by: user, at: _glNow_() }; susDirty = true; }
          out.updated.push({ row: u.x.row, id: u.id, date: u.x.date, desc: bS.e.desc, inAmt: u.x.inAmt, outAmt: u.x.outAmt, account: spU[0].account });
          return;
        }
        var cpO = csOvr['CUST:' + code + '#' + u.id];   // ✍️ (V4.319) طرف غيّره المستخدم يدوياً يبقى رغم تعديل الصف بالشيت
        var sR = susReg[u.id];   // ⏳ (V4.324) مبلغ معلق: يبقى على حساب المعلقات حتى يُحدَّد حسابه صراحة (repoint)
        if (u.repoint && !(accs.map[u.repoint] && accs.map[u.repoint].active && !accs.map[u.repoint].isGroup)) throw new Error('الحساب المختار غير صالح');
        var cp = u.repoint || (sR && !cpO ? sR.a : '') || (cpO && accs.map[cpO] && accs.map[cpO].active && !accs.map[cpO].isGroup ? cpO : '') || _glCsResolve_(u.x.hint, accs, learned, code) || (prev ? _glStr_(prev[4]) : '');
        if (!cp) throw new Error('طرف الصف غير معروف');
        if (!u.x.date) throw new Error('بلا تاريخ (العمود D)');
        // 💱 (V4.305) قيد معتمد بعملة طرف مختلفة: يبقى بعملته — نفس المبلغ ⇒ نفس المقابل المعتمد، وإلا من البيان أو بنفس السعر المعتمد
        var uCur = u.x.cur || cur, uov = null, nAmt = u.x.inAmt || u.x.outAmt;
        var uExp = false;
        if (u.repoint && u.ccy && u.ccy.cur) {   // 💱 (V4.356) عملة ومبلغ الطرف المقابل كما اختارهما المستخدم صراحة (بلا مراجعة لاحقة)
          if (_glCur_(u.ccy.cur) !== uCur) { if (!(u.ccy.amt > 0)) throw new Error('أدخل مبلغ الطرف المقابل بعملته'); uov = { cur: _glCur_(u.ccy.cur), amt: _glR2_(u.ccy.amt), src: 'man' }; }
          uExp = true;
        } else if (u.repoint) {   // ⏳ (V4.324) نقل مبلغ معلق لطرف عملته الافتراضية مختلفة ⇒ مبلغه بعملته مستنتجاً (للمراجعة بـ«💱 تحويل عملة»)
          var dcr = dcOf(cp); if (dcr && dcr !== uCur) { var gr = _glCcyGuess_(u.x.desc, nAmt, uCur, dcr, u.x.date, fx); uov = { cur: dcr, amt: Math.round(gr.amt), src: gr.src }; }
        } else if (prev && _glCur_(prev[7]) !== uCur && cp === _glStr_(prev[4])) {
          var pc = _glCur_(prev[7]), pAmt = _glNum_(prev[5]) || _glNum_(prev[6]), oAmt = cashOld ? (_glNum_(cashOld[5]) || _glNum_(cashOld[6])) : 0;
          if (oAmt && Math.abs(nAmt - oAmt) < 0.005) uov = { cur: pc, amt: pAmt };
          else { var ug = _glCcyGuess_(u.x.desc, nAmt, uCur, pc, u.x.date, fx); uov = { cur: pc, amt: ug.src === 'desc' || !oAmt ? ug.amt : _glR2_(pAmt * nAmt / oAmt) }; }
        } else if (dcOf(cp) && dcOf(cp) !== uCur && (!prev || cp !== _glStr_(prev[4]))) throw new Error('تغيّر طرف الصف إلى «' + ((accs.map[cp] || {}).name || cp) + '» وعملته ' + dcOf(cp) + ' — امسح رقم القيد من الشيت ليُعاد اعتماده بمبلغ الطرف بعملته');
        var b = _glCsEntry_(u.x, code, cp, uCur, fx, uov), r = u.er.r;
        var w = _glWriteEntry_(b.v, { id: u.id, seq: r[1], status: _glStr_(r[5]) || GL_ST_POSTED_, sourceKey: 'CUST:' + code, batchId: r[7], desc: b.e.desc, ref: 'cs:' + u.x.hash,
          createdBy: r[12], createdAt: r[13], row: u.er.row }, user);
        eSh().getRange(u.er.row, 1, 1, w.eRow.length).setValues([w.eRow]);
        done.push({ id: u.id, lRows: w.lRows, eRow: w.eRow, repoint: u.repoint, oldRows: oldLines[u.id] || [] });
        if (u.repoint && uov && !uExp) (out._rpCcy = out._rpCcy || []).push({ id: u.id, v: b.v, e: b.e, ccy: uov });
        out.updated.push({ row: u.x.row, id: u.id, date: u.x.date, desc: b.e.desc, inAmt: u.x.inAmt, outAmt: u.x.outAmt, account: cp });
      } catch (err) { out.problems.push({ row: u.x.row, date: u.x.date, desc: u.x.desc, inAmt: u.x.inAmt, outAmt: u.x.outAmt, hint: u.x.hint, msg: err.message }); }
    });
    if (done.length) {
      _glDeleteLinesOf_(done.map(function (d) { return d.id; }));
      var nl = []; done.forEach(function (d) { nl = nl.concat(d.lRows); });
      lSh().getRange(lSh().getLastRow() + 1, 1, nl.length, nl[0].length).setValues(nl);
      // ⏳ (V4.324) مبلغ معلق نُقل لحسابه الحقيقي: يخرج من قائمة المعلقات، ويُحفظ الطرف كتعديل يدوي (تعديل الصف لاحقاً لا يعيده)، ويُتعلَّم
      var rpd = done.filter(function (d) { return d.repoint; });
      if (rpd.length) {
        rpd.forEach(function (d) { delete susReg[d.id]; try { _glCsOvrRecord_('CUST:' + code, d.id, d.oldRows, d.lRows, user); } catch (eO) {}
          var ux = toUpdate.filter(function (u) { return u.id === d.id; })[0]; if (ux && ux.x.hint && !d.split) learned[_glCsKey_(ux.x.hint)] = d.repoint; });
        _glCsSuspSave_(susReg); susDirty = false; _glSetSetting_('custsheet_map', JSON.stringify(learned)); out.repointed = rpd.length;
      }
      if (out._rpCcy) { _glCcyPendQueueMany_(out._rpCcy); delete out._rpCcy; }
      // (V4.309) نفس إصلاح القيود المُنشأة — صف تغيّر مبلغه/بيانه بالشيت يُحدِّث دفعته المقابلة بشاشة حسابات العملاء
      done.forEach(function (d) { try { _glCpSyncVoucher_(d.id, user); } catch (eCp) { Logger.log('cs cp sync: ' + eCp.message); } });   // (V4.330) + العهدة
      try { _glApSyncRows_(done.map(function (d) { return d.eRow; }), nl, user); } catch (eAp) { Logger.log('cs agent sync: ' + eAp.message); }   // 🧑‍💼 (V4.328)
    }
  }
  // 3) كتابة رقم القيد في العمود F — بعد إعادة قراءة الشيت: نفس الصف لو لم يتغيّر، وإلا أول صف مطابق بلا رقم (لو أُدرجت صفوف أثناء المزامنة)
  if (fW.length) {
    var now = _glCsReadRows_(S.sh, cfg.startRow || 2, cfg), byRow = {}, byHash = {};
    now.forEach(function (y) { byRow[y.row + ':' + (y.sub || 0)] = y; if (!y.f) (byHash[y.hash] = byHash[y.hash] || []).push(y); });
    var wrote = {};   // صف ⇒ {y, ids[]} — الصف المفصول لعملات يُكتب فيه «JE-1 | JE-2» بترتيب العملات
    fW.forEach(function (w) {
      var sub = w.x.sub || 0, y = byRow[w.x.row + ':' + sub];
      if (!(y && !y.f && y.hash === w.x.hash)) y = (byHash[w.x.hash] || []).filter(function (z) { return !z._used && !z.f; })[0];
      if (!y) { out.problems.push({ row: w.x.row, date: w.x.date, desc: w.x.desc, inAmt: w.x.inAmt, outAmt: w.x.outAmt, msg: 'سُجّل القيد ' + w.id + ' لكن تعذّر كتابة رقمه بالشيت (تغيّر الصف) — اكتبه يدوياً في F' }); return; }
      y._used = 1; y.f = w.id;
      var rec = wrote[y.row] = wrote[y.row] || { y: y, ids: [] };
      rec.ids[y.sub || 0] = w.id;
    });
    // (V4.279/S4) تجميع كتابة أرقام القيود للشيت الخارجي: كانت خلية-خلية (جولة شبكية لكل صف)؛
    // الآن نجمع {صف، قيمة} ونكتب كل سلسلة صفوف متصلة بـ setValues واحدة (مع ضبط التنسيق نصيًا
    // للمدى كله). الصفوف غير المتجاورة تبقى بكتل منفصلة فلا يُمسّ عمود رقم القيد لأي صف بينها
    var qWrites = [];
    Object.keys(wrote).forEach(function (k) {
      var rec = wrote[k], y = rec.y, ids = rec.ids;
      if (y.subN > 1) { var old = (y.fRaw || '').indexOf('|') >= 0 ? y.fRaw.split('|').map(function (t) { t = t.trim(); return t === '-' ? '' : t; }) : [(y.fRaw || '').trim()]; for (var q = 0; q < y.subN; q++) if (!ids[q]) ids[q] = old[q] || ''; }
      var val = y.subN > 1 ? ids.slice(0, y.subN).map(function (t) { return t || '-'; }).join(' | ') : ids[0];
      qWrites.push({ row: y.row, val: val });
    });
    qWrites.sort(function (a, b) { return a.row - b.row; });
    for (var wi = 0; wi < qWrites.length;) {
      var start = qWrites[wi].row, wj = wi, block = [[qWrites[wi].val]];
      while (wj + 1 < qWrites.length && qWrites[wj + 1].row === qWrites[wj].row + 1) { wj++; block.push([qWrites[wj].val]); }
      S.sh.getRange(start, QC, block.length, 1).setNumberFormat('@').setValues(block);
      wi = wj + 1;
    }
  }
  // 🏨 (V4.258) نسخ قيود العهدة على حسابات أطراف الحجوزات إلى سجل دفعات برنامج الحجوزات (مثل سندات القبض/الصرف)
  if (!opts.preview && (out.created.length || out.updated.length)) {
    var mOpt = { notify: true, by: 'شيت العهدة — ' + ((accs.map[code] || {}).name || code) };
    try { mOpt.parties = _glHbMirrorParties_(); } catch (eP) {}
    // ⚡ (V4.294) جذر «البرنامج مشغول/مهلة التأمين»: كان كل قيد بالحلقة يفتح ملف الحجوزات الخارجي من جديد
    // (SpreadsheetApp.openById ~١-٣ث لكل صف) ويعيد بناء خريطة الصرف، فيُمسَك قفل الحسابات عشرات الثواني عند
    // اعتماد/مزامنة عدة صفوف عهدة ⇒ تفشل أي عملية حسابات أخرى (البوت/الاعتماد/المزامنة). الآن: فتح الملف وبناء
    // خريطة الصرف مرة واحدة لكل الحلقة، وتمرير isNew للقيود المنشأة للتوّ (تتخطّى قراءة عمود H) ⇒ القفل يُمسَك
    // لحظة الكتابة المحلية فقط تقريباً.
    // ⚡ (V4.307) ولا يُفتح ملف الحجوزات هنا أصلاً: معاينة محلية للتنبيه + طابور ينفَّذ خارج قفل الحسابات (_glMirFlush_)
    try { mOpt.fx = _glFxDailyMap_(); } catch (eFx) {}
    var _runMir = function (c, isNew) {
      try {
        var mr = null;
        if (_GL_LOCKN_ > 0) {
          var pk = _glHbMirrorPeek_(c.id, mOpt.parties, mOpt.fx);
          if (pk && pk.need && !_glMirQ_(c.id, { notify: true, by: mOpt.by, isNew: !!isNew })) mr = _glHbMirrorSync_(c.id, isNew ? Object.assign({ isNew: true }, mOpt) : mOpt);
          else mr = pk;
        } else mr = _glHbMirrorSync_(c.id, isNew ? Object.assign({ isNew: true }, mOpt) : mOpt);
        if (mr && mr.written) c.hbMirror = mr.written;
        if (mr && mr.skipped && mr.skipped.length) (out.warns = out.warns || []).push({ row: c.row, msg: 'لم يُنسخ لكشف الفندق (' + mr.skipped.join('، ') + '): مبلغ الطرف ليس بالريال ولا تحويل تلقائي — عدّل القيد ' + c.id + ' بمبلغ الطرف بالريال' });
      } catch (eM) { Logger.log('cs hb mirror: ' + eM.message); }
    };
    out.created.forEach(function (c) { _runMir(c, true); });   // قيود منشأة للتوّ ⇒ isNew
    out.updated.forEach(function (c) { _runMir(c, false); });   // قيود مُعدَّلة ⇒ قد يكون لها صفوف سابقة
  }
  if (_GL_MIRQ_N_) out.mirQ = _GL_MIRQ_N_;
  if (susDirty) try { _glCsSuspSave_(susReg); } catch (eSs) {}
  var n = out.created.length + out.updated.length + out.hb.length + (out.autoLinked || 0);
  cfg.last = { at: _glNow_(), by: user, created: out.created.length, updated: out.updated.length, pending: out.pending.length, problems: out.problems.length, autoLinked: out.autoLinked || 0,
    susp: out.susp.filter(function (z) { return !(opts.repoint && opts.repoint[z.row]); }).length };
  _glSetSetting_('custsheet:' + code, JSON.stringify(cfg));
  if (n) logChange_(user, opts.approve ? 'اعتماد صفوف شيت عهدة' : 'مزامنة شيت عهدة', 'GL:' + code, 'شيت العهدة', '-',
    'جديدة ' + out.created.length + ' · معدّلة ' + out.updated.length + ' · مربوطة بالحجوزات ' + out.hb.length +
    (out.autoLinked ? ' · رُبطت تلقائياً كمكرر ' + out.autoLinked : '') + ' · بانتظار الاعتماد ' + out.pending.length);
  return out;
}
// المزامنة المجدولة لكل عهدة مربوطة فُعّل لها «تلقائي» — (V4.250) كلٌّ حسب تكراره (دقائق/ساعات) ولا تُكرَّر قبل موعدها
function _glCsEveryMin_(cfg) { var e = (cfg && cfg.every) || {}, n = parseInt(e.n, 10) || 1; return e.unit === 'min' ? Math.max(1, n) : n * 60; }   // (V4.270) الحد الأدنى دقيقة واحدة
function _glCsAutoAll_() {
  _GL_SET_MEMO_ = null;
  var set = _glSettings_(), res = [], P = PropertiesService.getScriptProperties(), last = {};
  try { last = JSON.parse(P.getProperty('GL_CS_LAST_AUTO') || '{}') || {}; } catch (e) {}
  var now = Date.now(), t0 = now, BUDGET = 90000;   // ⚡ (V4.264) ميزانية زمنية: لا تتجاوز الدورة الواحدة 90 ثانية (تُكمَل بالدورة التالية)
  // أقدم الشيتات المستحقة أولاً (دوران عادل)، وشيت واحد مستحق فقط لكل دورة لو كان البرنامج مشغولاً بعملية مستخدم
  var busy = false; try { busy = !!CacheService.getScriptCache().get('gl_live_busy'); } catch (eB) {}
  var codes = Object.keys(set).filter(function (k) { return k.indexOf('custsheet:') === 0; }).map(function (k) { return { k: k, code: k.slice(10) }; })
    .sort(function (a, b) { return (last[a.code] || 0) - (last[b.code] || 0); });
  codes.forEach(function (it) {
    if (Date.now() - t0 > BUDGET) return;   // نفدت الميزانية ⇒ البقية بالدورة القادمة
    var k = it.k, code = it.code, cfg; try { cfg = JSON.parse(set[k] || '{}'); } catch (e) { return; }
    if (!cfg || !cfg.id || !cfg.auto) return;
    if (last[code] && now - last[code] < _glCsEveryMin_(cfg) * 60000 - 45000) return;   // لم يحن موعدها (هامش 45 ثانية لتذبذب المشغّل)
    if (busy) { busy = false; if (res.length) return; }   // البرنامج مشغول بحفظ مستخدم ⇒ أجّل الباقي
    // ⏳ (V4.258) «مهلة التأمين»: المزامنة المجدولة كانت تحجز القفل العام طوال قراءة كل شيتات العهد (كل دقيقة أحياناً)
    // فينتظر حفظ المستخدمين حتى تنتهي المهلة. الآن قفل قصير لكل شيت على حدة، وتتخطى الشيت لو البرنامج مشغول (تُعاد بالدورة التالية)
    // ⚡ (V4.275) فتح الشيت الخارجي وقراءته (الجزء البطيء) **خارج** القفل: لا يتأخر حفظ/اعتماد المستخدم بسبب المزامنة المجدولة
    // («مهلة التأمين»). ولو لم يتغيّر الشيت ولا بيانات الحسابات منذ آخر مزامنة ⇒ تُتخطى بلا قفل (وكل 10 دقائق مزامنة كاملة احتياطاً)
    var sigs = {}; try { sigs = JSON.parse(P.getProperty('GL_CS_SIG') || '{}') || {}; } catch (eS) {}
    // ⚡ (V4.322) فحص رخيص قبل فتح/قراءة الشيت: لو لم يتغيّر «آخر تعديل» لملف الشيت منذ آخر مزامنة (وضمن نافذة المزامنة
    // الكاملة الاحتياطية 30 دقيقة) ⇒ تخطَّ الشيت بلا openById ولا قراءة كاملة. هذا يوفّر فتح وقراءة كل شيت غير متغيّر كل دورة.
    var luNow = 0; try { luNow = DriveApp.getFileById(cfg.id).getLastUpdated().getTime(); } catch (eLU) { luNow = 0; }
    if (luNow && sigs[code] && sigs[code].lu === luNow && now - (sigs[code].t || 0) < 1800000) { last[code] = now; return; }
    var pre = null, sig = '';
    try {
      var cs0 = _glCsOpen_(cfg), rows0 = _glCsReadRows_(cs0.sh, cfg.startRow || 2, cfg);
      // (V4.307) البصمة = محتوى الشيت فقط (تغييرات الدفتر الخاصة بالشيت تلتقطها المزامنة الكاملة الاحتياطية كل 30 دقيقة)
      sig = _glHash_(JSON.stringify(rows0.map(function (y) { return [y.row, y.hash, y.f, y.ok ? 1 : 0, y.sub || 0]; })));
      pre = { S: cs0, rows: rows0 };
    } catch (eP) { pre = null; }
    if (pre && sigs[code] && sigs[code].s === sig && now - (sigs[code].t || 0) < 1800000) { last[code] = now; if (luNow) { sigs[code].lu = luNow; try { P.setProperty('GL_CS_SIG', JSON.stringify(sigs)); } catch (e9) {} } return; }
    var lock = _glLock_(); if (!lock.tryLock(2000)) { _GL_LOCKN_ = Math.max(0, _GL_LOCKN_ - 1); return; }
    last[code] = now;
    try {
      var r = _glCsSync_(code, 'مزامنة مجدولة', pre ? { pre: pre } : {}); res.push(code + ': ' + r.created.length + '/' + r.pending.length);
      if (pre) { sigs[code] = { s: sig, t: now, lu: luNow }; try { P.setProperty('GL_CS_SIG', JSON.stringify(sigs)); } catch (eW) {} }
      var nPend = r.pending.length, lastN = +(P.getProperty('GLBOT_CS_' + code) || 0);   // 📲 (V4.254) تنبيه عند ظهور صفوف ناقصة جديدة فقط
      if (nPend !== lastN) { P.setProperty('GLBOT_CS_' + code, String(nPend)); if (nPend > lastN) _glBotQ_('custody_err', { name: (_glAccounts_().map[code] || {}).name || code, n: nPend, code: code,
        rows: r.pending.slice(lastN - nPend).slice(-3).map(function (x) { return { row: x.row, date: x.date, desc: String(x.desc || '').slice(0, 80), inAmt: x.inAmt, outAmt: x.outAmt, cur: x.cur || (r.account || {}).currency || '', hint: String(x.hint || '').slice(0, 40), msg: x.msg ? String(x.msg).slice(0, 120) : '', sugg: (x.sugg || []).slice(0, 3) }; }) }); }
    }
    catch (e) { res.push(code + ': ' + e.message); }
    finally { _glUnlock_(lock); }
  });
  try { P.setProperty('GL_CS_LAST_AUTO', JSON.stringify(last)); } catch (e) {}
  return res;
}
// ⏱️ (V4.250) مشغّل مستقل لمزامنة شيتات العهد بأقصر تكرار مطلوب (دقيقة/5/10/15/30 أو كل ساعة) — يُعاد ضبطه عند حفظ أي إعداد
function glCustSheetCron() {
  // ⚡ (V4.268) المشغّل القديم كان مضبوطاً كل دقيقة (يُعاد ضبطه فقط عند حفظ إعداد) — يُصحَّح ذاتياً مرة واحدة
  try { var P0 = PropertiesService.getScriptProperties(); if (P0.getProperty('GL_CS_TRIG_V') !== '322') { P0.setProperty('GL_CS_TRIG_V', '322'); _glCsEnsureTrigger_(); return; } } catch (eT) {}
  if (_glIdleHours_()) return;   // 🌙 (V4.322) خمول ليلي 2ص–10ص: لا مزامنة خلفية مجدولة (المزامنة اليدوية من البرنامج تعمل في أي وقت)
  // 🧱 (V4.300) حارس عدم-التداخل: كانت دورات المزامنة المجدولة تتكدّس فوق بعضها (دورة تستغرق دقائق والمشغّل كل دقيقة)
  // فتُشبع حصة Apps Script وتُبطّئ كل الشاشات وتُفشل الحفظ بـ«مهلة التأمين». الآن: نبضة في Properties — لو دورة سابقة
  // ما زالت تعمل (نبضتها خلال آخر ٥ دقائق) تُتخطى هذه الدورة تماماً، فلا تكدّس. تُحدَّث النبضة بالبداية وتُمحى بالنهاية.
  var PH = null;
  try {
    PH = PropertiesService.getScriptProperties();
    var hb = +(PH.getProperty('GL_CS_CRON_HB') || 0);
    if (hb && Date.now() - hb < 300000) return;   // دورة سابقة قيد التنفيذ ⇒ تخطَّ
    PH.setProperty('GL_CS_CRON_HB', String(Date.now()));
  } catch (eH) { PH = null; }
  try { _glCsAutoAll_(); } catch (e) { Logger.log('glCustSheetCron: ' + e.message); }   // (V4.258) القفل لكل شيت داخل _glCsAutoAll_
  try { _glMirFlush_(20000); } catch (eQ) { Logger.log('mirror flush: ' + eQ.message); }   // ⚡ (V4.307) طابور النسخ لكشف الحجوزات (احتياطاً) — (V4.322) ميزانية 20 ثانية بدل 60 (الدورة الآن كل 10 دقائق لا كل دقيقة)
  finally { try { if (PH) PH.deleteProperty('GL_CS_CRON_HB'); } catch (eF) {} }
}
function _glCsEnsureTrigger_() {
  var set = _glSettings_(), minI = 0;
  Object.keys(set).forEach(function (k) {
    if (k.indexOf('custsheet:') !== 0) return;
    var cfg; try { cfg = JSON.parse(set[k] || '{}'); } catch (e) { return; }
    if (!cfg || !cfg.id || !cfg.auto) return;
    var m = _glCsEveryMin_(cfg); if (!minI || m < minI) minI = m;
  });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'glCustSheetCron') ScriptApp.deleteTrigger(t); });
  if (!minI) return { every: 0 };
  // ⚡ (V4.322) الحد الأدنى للتكرار الخلفي 10 دقائق (كان دقيقة واحدة ⇒ دورات تتكدّس 30-133 ثانية وتُبطّئ كل البرنامج).
  // الفحص صار رخيصاً (DriveApp.getLastUpdated قبل فتح أي شيت) فلا داعي للتكرار كل دقيقة؛ والأزرار اليدوية «🔄 مزامنة الآن» فورية.
  if (minI >= 60) { ScriptApp.newTrigger('glCustSheetCron').timeBased().everyHours(1).create(); return { every: 60 }; }
  var mEff = Math.max(10, minI);
  var step = [30, 15, 10].filter(function (x) { return x <= mEff && mEff % x === 0; })[0] || 10;
  ScriptApp.newTrigger('glCustSheetCron').timeBased().everyMinutes(step).create();
  return { every: step };
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
function _glFxFetchToday_(by, src) {
  var r = _fxFetchBanqueMisr_(), today = _glDate_(new Date());
  _glFxDailyUpsert_(today, { SAR: r.SAR ? r.SAR.sell : 0, SARbuy: r.SAR ? r.SAR.buy : 0, USD: r.USD ? r.USD.sell : 0, USDbuy: r.USD ? r.USD.buy : 0, src: src || 'بنك مصر' }, by);
  return _glFxDailyMap_()[_glDKey_(today)];
}
// 🕚 (V4.290) مشغّل الصباح (يُفعَّل من الإعدادات): سعر الافتتاح التقريبي — يبقى سعر اليوم مبدئياً حتى يُستبدَل بسعر الإغلاق
function glFxDailyCron() {
  if (!_glSSId_()) return;
  try { _glFxFetchToday_('تسجيل صباحي تلقائي', 'بنك مصر (صباحاً)'); _glSetSetting_('fx_daily_err', ''); }
  catch (e) { try { _glSetSetting_('fx_daily_err', _glNow_() + ' — ' + e.message); } catch (e2) {} }
}
// 🕓 (V4.290) مشغّل الإغلاق: السعر الحقيقي الفعلي ليوم العمل هو سعر إغلاق البنك (قد يختلف عن سعر الافتتاح الصباحي
// بالزيادة أو النقصان) — يُعاد الجلب بعد إغلاق البنك فيستبدل (upsert لنفس تاريخ اليوم) سعر الصباح ليصبح هو سعر اليوم المعتمد
function glFxDailyCronClose() {
  if (!_glSSId_()) return;
  try { _glFxFetchToday_('تسجيل إغلاق تلقائي', 'بنك مصر (إغلاق)'); _glSetSetting_('fx_daily_err', ''); }
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
  return { success: true, row: _glFxFetchToday_(session.username, 'بنك مصر (يدوي)') };
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
// ⏰ (V4.290) جلبان تلقائيان يومياً: صباحاً (11) يثبّت سعراً مبدئياً، وإغلاقاً (16 — بعد إغلاق بنك مصر) يستبدله
// بسعر الإغلاق الفعلي ليوم العمل (مثل تعامل البنوك: سعر الصباح تقريبي، وسعر الإغلاق هو المعتمد لليوم)
function glFxDailyCronSet(authToken, on) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'glFxDailyCron' || t.getHandlerFunction() === 'glFxDailyCronClose') ScriptApp.deleteTrigger(t); });
  if (on) {
    ScriptApp.newTrigger('glFxDailyCron').timeBased().everyDays(1).atHour(11).create();
    ScriptApp.newTrigger('glFxDailyCronClose').timeBased().everyDays(1).atHour(16).create();
  }
  _glSetSetting_('fx_daily_cron', on ? 'نعم' : 'لا');
  if (on) { try { _glFxFetchToday_(session.username, 'بنك مصر (صباحاً)'); } catch (e) {} }
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
  _glPerm_(authToken, 'view', 'auto');
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
  var cl = _accAggBalances_(null, true);   // 🏨 (V4.326) بنود الحجوزات تُستبعد هنا كما تُستبعد أسطر قيودها من الطرف الآخر
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
  if (typeof _snapPreRisk_ === 'function') _snapPreRisk_('إقفال سنة ' + year, session.username);   // ⏪ (V4.346)
  var lock = _glLock_(); lock.waitLock(30000);
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
  } finally { _glUnlock_(lock); }
}
// إلغاء قيد إقفال سنة (بعد فتح الفترة)
function glReopenYear(authToken, year) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  if (typeof _snapPreRisk_ === 'function') _snapPreRisk_('إعادة فتح سنة ' + year, session.username);   // ⏪ (V4.346)
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
  _glPerm_(authToken, 'view', 'rep');
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
  _glPerm_(authToken, 'view', 'rep');
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
  _glPerm_(authToken, 'view', 'rep');
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
  _glPerm_(authToken, 'view', 'stmt');
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
  _glPerm_(authToken, 'view', 'rep');
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
    viaKw: s.hb_via_kw === undefined ? 'حجز|حجوزات|فندق|فنادق|تسكين' : s.hb_via_kw, hbFrom: s.hb_from || '', hbPayFrom: s.hb_pay_from || '', hbGlOnly: s.hb_gl_only_from || '' };
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
  var pays = [], psh = ss.getSheetByName(c.pay), onlyK = _glDKey_(_glDate_(_glSettings_().hb_gl_only_from || ''));
  if (psh && psh.getLastRow() > 1) psh.getRange(2, 1, psh.getLastRow() - 1, 10).getValues().forEach(function (r, i) {
    var party = _glStr_(r[1]), date = _glAutoDate_(r[0]); if (!party || !date) return;
    // 🔗 (V4.241 — دمج المرحلة 1) النسخ العاكسة «GL:» أصلها قيود الحسابات العامة نفسها ⇒ لا تُقرأ كدفعات؛ وبعد تاريخ القطع
    // الدفعات تُسجَّل من البرنامج الرئيسي فقط ⇒ أي دفعة لاحقة بشيت الحجوزات (عدا مزامنة العهد CUSTODY:) لا تُقيَّد مرتين
    var pid = _glStr_(r[7]);
    if (/^GL:/.test(pid) || /^GL:/.test(_glStr_(r[9]))) return;
    // (دفعة بتاريخ لاحق سُجّلت قبل القطع تبقى — مسجَّلة قبل قفل الأزرار)
    if (onlyK && _glDKey_(date) >= onlyK && !/^CUSTODY:/.test(pid) && !(r[6] && _glDKey_(_glAutoDate_(r[6])) && _glDKey_(_glAutoDate_(r[6])) < onlyK)) return;
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
  _glRowsW_('hbpay').forEach(function (r) { var id = _glStr_(r[0]); if (id) o[id] = { cash: _glStr_(r[1]), cur: _glStr_(r[2]) ? _glCur_(r[2]) : '', amount: _glNum_(r[3]), rate: _glNum_(r[4]), by: _glStr_(r[5]), at: _glStr_(r[6]), party: _glStr_(r[7]), linkGroup: _glStr_(r[8]) }; });
  return o;
}
// 🔗 (V4.239) مفتاح التجميع الفعلي لدفعة: رقم الربط من برنامج الحجوزات نفسه، وإلا رابط يدوي مُسجَّل هنا (شاشة مراجعة
// الدفعات) — فيُقيَّد الطرفان بقيد واحد مباشر (بلا مرور على أي حساب نقدي) تماماً كالدفعة المرتبطة من المصدر
function _glHbLinkOf_(p, rev) { return p.linkId || ((rev[p.id] || {}).linkGroup) || ''; }
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
// 🎯 (V4.310) حارس التعادل: اقتراح الربط التلقائي يُستخدَم أحياناً باعتماد جماعي بلا مراجعة لكل سطر («✔️ اعتماد
// المقترح لكل غير المربوط» بشاشة خريطة الحسابات) — فلو تعادلت أكثر من مطابقة لا يُختار أحدها صامتاً (قد يُسجَّل
// المال بحساب طرف آخر خطأً)، بل يبقى الاقتراح بلا كود فيضطر المدير لاختياره يدوياً لهذا الاسم تحديداً
function _glHbSuggest_(p, pr, accs) {
  var n = p.name, nk = _glNorm_(n), type;
  var umrahList = accs.list.filter(function (a) { return !a.isGroup && a.kind === 'client' && a.code.indexOf('1201') === 0 && a.link && _glNorm_(a.link) === nk; });
  var umrah = umrahList.length === 1 ? umrahList[0] : null;   // تعادل بين أكثر من حساب بنفس الاسم ⇒ غامض
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
    var best = null, bs = 0, tied = false;
    accs.list.forEach(function (a) {
      if (a.isGroup || a.kind !== 'custody') return;
      var an = _glNorm_(a.name), sc = 0; toks.forEach(function (t) { if (an.indexOf(t) >= 0) sc++; });
      if (sc > bs) { bs = sc; best = a; tied = false; }
      else if (sc > 0 && sc === bs && best && a.code !== best.code) tied = true;   // (V4.310) تعادل حقيقي بين حسابين مختلفين
    });
    if (best && !tied) code = best.code;
  } else if (T.parent) {
    var ex = accs.list.filter(function (a) { return !a.isGroup && a.code.indexOf(T.parent) === 0 && ((a.link && _glNorm_(a.link) === nk) || _glNorm_(a.name) === nk); });
    if (ex.length === 1) code = ex[0].code;   // (V4.310) أكثر من مطابقة ⇒ غامض، لا يُختار أحدها صامتاً
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
// 🏨 (V4.292) حجوزات السكن الفعلية (بقيمة بيعها الحقيقية) لعميل×رحلة بعينهما — مُجمَّعة بالمدينة (مكة/المدينة)،
// لتُستخدم بدل تقدير اتفاقية السكن ببندي «سكن مكة/سكن المدينة» بحسابات عملاء العمرة حين تتوفر حجوزات فعلية.
// المطابقة بنفس آلية قيد الحجز الآلي بالحسابات العامة: اسم الحجز ← خريطة GL_HB_Map ← (رابط الحساب أو الاسم
// نفسه) يُطابَق بالاسم المطبَّع مع اسم العميل بالوحدة القديمة، والرحلة بنفس محرك التحديد التلقائي/اليدوي
// (_glHbTripOf_) — تماماً كما تُحدَّد الرحلة على القيد الآلي للحجز.
function _glHbCityActual_(client, trip) {
  client = _glStr_(client); trip = _glStr_(trip);
  if (!client || !trip) return null;
  try { if (!_glHbCfg_().ssId) return null; } catch (e0) { return null; }
  var out = null;
  try {
    var H = _glHbRead_(), map = _glHbMap_(), ov = _glHbTripOv_(), ctx = _glHbTripCtx_(), accs = _glAccounts_().map;
    var ck = _glHbKey_(client);
    H.bookings.forEach(function (b) {
      if (b.status === 'لاغي' || !b.client || !b.sale.hasPrice || !b.sale.value) return;
      var m = map[_glHbKey_(b.client)];
      if (!m || m.type !== 'عميل عمرة') return;
      var a = m.code && accs[m.code], name = (a && a.link) || m.name;
      if (_glHbKey_(name) !== ck) return;
      if (_glHbTripOf_(b, m, ov, ctx, accs) !== trip) return;
      out = out || {};
      var c = out[b.city] || (out[b.city] = { value: 0, hotels: {}, ci: null, co: null, keys: [] });
      c.value = _glR2_(c.value + b.sale.value);
      if (b.hotel) c.hotels[b.hotel] = 1;
      if (!c.ci || b.ci < c.ci) c.ci = b.ci;
      if (!c.co || b.co > c.co) c.co = b.co;
      c.keys.push(b.key);
    });
  } catch (e1) { Logger.log('_glHbCityActual_: ' + e1.message); return null; }
  return out;
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
  // 💱 (V4.280) تثبيت سعر صرف الريال لكل قيد حجز على ما سُجِّل به أول مرة: قيد الحجز بالريال لا يتغيّر
  // مبلغه، لكن «المعادل بالجنيه» كان يُعاد حسابه بسعر الريال «الحالي» بالإعدادات، فتغيير السعر لاحقاً كان
  // يُعيد كتابة معادل كل الحجوزات ويفتحها للاعتماد بلا سبب مالي حقيقي. الآن نقرأ سعر الصرف من القيد المرحّل
  // القائم (إن وُجد) ونعيد استخدامه؛ الحجوزات الجديدة فقط تأخذ سعر اليوم الحالي.
  var frozenSar = (function () {
    var byId = {}, map = {};
    _glRows_('entries').forEach(function (r) {
      var sk = _glStr_(r[6]); if (sk.indexOf('AUTO:HB:') !== 0) return;
      if (_glStr_(r[5]) !== GL_ST_POSTED_) return;   // القيود المرحّلة فقط (لا المسودة ولا الملغاة)
      byId[_glStr_(r[0])] = sk;
    });
    _glRows_('lines').forEach(function (r) {
      var sk = byId[_glStr_(r[0])]; if (!sk || map[sk]) return;
      if (_glCur_(_glStr_(r[7])) !== 'SAR') return;
      var rt = _glNum_(r[8]); if (rt > 0) map[sk] = rt;
    });
    return map;
  })();
  H.bookings.forEach(function (b) {
    if (b.status === 'لاغي') return;
    var cm = b.client ? info(b.client) : null, sm = b.supplier ? info(b.supplier) : null;
    var bSar = frozenSar['AUTO:HB:' + b.key] || sar;   // سعر الريال المثبَّت لهذا الحجز (أو الحالي للجديد)
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
      var sv = b.sale.value, l1 = L(cm.code, Math.abs(sv), sv > 0, 'SAR', bSar, Object.assign({ desc: custStmt }, base, ptag(cm, b.client)));
      l1.hbParty = 1; lines.push(l1);
    }
    if (hasCost) {
      var cv = b.cost.value, l2 = L(sm.code, Math.abs(cv), cv < 0, 'SAR', bSar, Object.assign({ desc: supStmt }, base, ptag(sm, b.supplier)));
      l2.hbParty = 1; lines.push(l2);
      if (!hasSale) lines.push(L(roles.cost_house, Math.abs(cv), cv > 0, 'SAR', bSar, Object.assign({ desc: 'تكلفة ' + supStmt + (cm && cm.type === 'رحلة' ? '' : ' (بلا بيع مسجَّل)') }, base)));
    }
    if (hasSale) {
      var mg = _glR2_(b.sale.value - (hasCost ? b.cost.value : 0));
      // (V4.241) حجز بلا مورد: إيراده لحساب «إيرادات حجوزات — بدون مورد» (فرعي) — كان يذهب لـ«إيرادات السكن» مباشرة
      // فيفشل لو صار حساباً تجميعياً بالدليل
      var hbRevAcc = accs[roles.hb_rev], revAcc = (sm && sm.type !== 'رحلة') ? party('hbrev', sm.name || b.supplier)
        : (hbRevAcc && !hbRevAcc.isGroup ? roles.hb_rev : party('hbrev', 'بدون مورد'));
      if (Math.abs(mg) >= 0.005) lines.push(L(revAcc, Math.abs(mg), mg < 0, 'SAR', bSar, Object.assign({ client: b.client, agent: b.supplier,
        desc: !hasCost ? revStmt + ' (التكلفة غير مسعَّرة)' : mg < 0 ? 'خسارة حجز ' + refNum + ' ' + b.hotel + ' — ' + Math.abs(mg).toFixed(2) + ' SAR' : revStmt }, base)));
    }
    // ⚠️ (V4.259) قيد حجز ناقص (بلا مورد/عميل أو بلا سعر بيع/تكلفة): يُسجَّل الطرف المسعَّر فقط ويُوسم «غير مكتمل»
    // بالبيان حتى يُستكمل — ويتحدّث القيد نفسه تلقائياً عند إدخال الناقص ببرنامج الحجوزات
    var miss = [];
    if (!b.client) miss.push('بلا عميل'); else if (cm && GL_HB_TYPES_[cm.type].sale && !hasSale) miss.push('بلا سعر بيع');
    if (!b.supplier) miss.push('بلا مورد'); else if (sm && sm.type !== 'رحلة' && !hasCost) miss.push('بلا سعر تكلفة');
    if (miss.length && lines.length >= 2) headStmt += ' — ⚠️ غير مكتمل (' + miss.join('، ') + ')';
    if (lines.length >= 2) out.push({ key: 'AUTO:HB:' + b.key, date: b.ci, desc: headStmt,
      trip: trip, company: tc, lines: lines, src: 'hotel' });
  });
  // الدفعات: المرتبطة تُجمع بقيد واحد، والباقي مقابل الحساب النقدي المراجَع
  var groups = {}, singles = [];
  H.pays.forEach(function (p) { var lg = _glHbLinkOf_(p, rev); if (lg) (groups[lg] = groups[lg] || []).push(p); else singles.push(p); });
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
function _glHbPayPolicy_() {
  var s = _glSettings_(), keep = {};
  try { JSON.parse(s.hb_pay_keep || '[]').forEach(function (k) { keep[k] = 1; }); } catch (e) {}
  return { from: s.hb_pay_from || '', fromK: _glDKey_(_glDate_(s.hb_pay_from || '')), keep: keep };
}
/* 🔗 (V4.241 — دمج المرحلة 1) دفعات الفنادق من البرنامج الرئيسي فقط بعد «hb_gl_only_from»:
   • أي قيد يدوي/سند (خزينة، بنوك، عهد، قيود، دفعات الفنادق) مرحّل بتاريخ القطع أو بعده وفيه سطر على حساب طرف من أطراف
     الحجوزات (خريطة الأسماء: عميل سكن/مورد/شارت) ⇒ تُكتب له نسخة بسجل دفعات برنامج الحجوزات بمعرّف GL:<القيد>:<n>
     ليبقى كشف الحساب والبوت والبوابة هناك صحيحاً خلال الفترة الانتقالية. قيد بطرفين أو أكثر ⇒ رقم ربط GL:<القيد>.
   • دائن الطرف = «استلمنا منه» · مدين الطرف = «دفعنا له» · المبلغ بالريال (غير الريال ⇒ المعادل ÷ سعر الريال بتاريخ القيد).
   • عملاء العمرة والرحلات والعهد لا تُنسخ (العهد لها مزامنة شيت العهدة CUSTODY: الخاصة بها).
   • النسخ العاكسة لا تُقرأ كدفعات بالمزامنة (_glHbRead_) فلا يتكرر القيد. */
function _glHbOnlyK_() { return _glDKey_(_glDate_(_glSettings_().hb_gl_only_from || '')); }
/* 🔙 (V4.331) نسخ قيد يدوي سابق لتاريخ القطع إلى كشف الفندق: قبل التاريخ مصدر دفعات الفنادق هو برنامج الحجوزات نفسه (وقيودها
   AUTO:HBP تُبنى منه)، فكان السند/القيد اليدوي على حساب الفندق قبل القطع يظهر بالحسابات العامة فقط ولا يصل لكشف الفندق، وتسجيله
   ثانيةً من برنامج الحجوزات يولّد قيداً تلقائياً مكرراً. الحل: المدير يختار هذه القيود (VCH/CUST اليدوية فقط) فتُنسخ كالمعتاد بمعرّف
   GL:<القيد>:<n> (لا تُقرأ كدفعة بالمزامنة فلا تتكرر) وتُحفظ في قائمة hb_premir فتتبعها التعديلات/الإلغاء كأي نسخة. */
var _GL_PREMIR_MEMO_ = null;
function _glHbPreMir_() {
  var raw = ''; try { raw = _glSettings_().hb_premir || ''; } catch (e) {}
  if (_GL_PREMIR_MEMO_ && _GL_PREMIR_MEMO_.raw === raw) return _GL_PREMIR_MEMO_.map;
  var m = {}; try { JSON.parse(raw || '[]').forEach(function (id) { m[id] = 1; }); } catch (e2) {}
  _GL_PREMIR_MEMO_ = { raw: raw, map: m }; return m;
}
function _glHbMirrorParties_() {
  var o = {}, accs = _glAccounts_().map;
  _glRows_('hbmap').forEach(function (r) {
    var n = _glStr_(r[0]), t = _glStr_(r[1]), code = _glStr_(r[2]);
    if (!n || !code || o[code] || !/^(عميل|مورد|شارت)$/.test(t)) return;
    var a = accs[code]; if (!a || a.isGroup) return;
    o[code] = n;
  });
  return o;
}
/* 🧾 (V4.338) كشف حساب الفندق: رقم قيد الحسابات العامة لكل دفعة منسوخة + رقم إيصال سند القبض/الصرف (REC-/PAY-) تحته بحجم صغير.
   خريطة «رقم القيد ⇒ رقم السند» تُبنى من مفاتيح مصدر القيود VCH:… (دفعات النقدية فقط لها سند). */
function _glHbVoucherMap_() {
  var m = {}; try { _glRows_('entries').forEach(function (r) { var mm = /^VCH:(.+)$/.exec(_glStr_(r[6])); if (mm) m[_glStr_(r[0])] = mm[1]; }); } catch (e) {}
  return m;
}
// يفكّ معرّف دفعة منسوخة «GL:<قيد>:<n>» ⇒ {entry, voucher} (فارغ لدفعة ليست منسوخة)
function _glHbPayRef_(pid, vmap) {
  var m = /^GL:(.+):\d+$/.exec(String(pid || '')); if (!m) return null;
  return { entry: m[1], voucher: (vmap || {})[m[1]] || '' };
}
/* 🔗 (V4.339) رقم القيد والسند والطرف المقابل لكل دفعة بكشف الفندق — لكل أنواع الدفعات:
   • نسخة قيد (GL:<قيد>:<n>) ⇒ قيدها مباشرة · • دفعة سجّلها برنامج الحجوزات (أو مزامنة العهدة CUSTODY:…) ⇒ قيدها التلقائي AUTO:HBP:<معرّف الدفعة>
   • دفعة مرتبطة بدفعة طرف آخر ⇒ AUTO:HBL:<معرّف الارتباط>.
   الطرف المقابل = أسماء الحسابات الأخرى بالقيد (خزينة/بنك/عهدة/حساب آخر) عدا حساب الطرف نفسه.
   pays: [{id, link, party}] ⇒ {id: {entry, voucher, cp}} — مسح واحد لقيود الدفتر وأسطر القيود المعنية فقط. */
function _glHbPayRefs_(pays) {
  var want = {}, byPid = {}, how = {};
  (pays || []).forEach(function (p) {
    var id = String(p.id || ''); if (!id) return;
    var m = /^GL:(.+):\d+$/.exec(id);
    if (m) { byPid[id] = m[1]; return; }
    want['AUTO:HBP:' + id] = id;
    var lk = String(p.link || ''); if (lk && !/^GL:/.test(lk)) want['AUTO:HBL:' + lk] = id;
  });
  var vm = {}, info = {}, plink = {}, pnoent = {};
  try { plink = JSON.parse(_glSettings_().hb_paylink || '{}') || {}; pnoent = JSON.parse(_glSettings_().hb_paynoent || '{}') || {}; } catch (eL) {}
  _glRows_('entries').forEach(function (r) {
    var sk = _glStr_(r[6]), eid = _glStr_(r[0]), st = _glStr_(r[5]);
    info[eid] = { sk: sk, st: st, type: _glStr_(r[3]) };
    var mm = /^VCH:(.+)$/.exec(sk); if (mm) vm[eid] = mm[1];
    if (st === GL_ST_VOID_) return;
    if (want[sk] && !byPid[want[sk]]) byPid[want[sk]] = eid;
  });
  // 🔗 (V4.341) ربط يدوي اختاره المستخدم (دفعة ⇒ قيد) — له الأولوية على التلقائي ما دام القيد حياً
  (pays || []).forEach(function (p) { var id = String(p.id || ''), le = plink[id]; if (le && info[le] && info[le].st !== GL_ST_VOID_) { byPid[id] = le; how[id] = 'manual'; } });
  var parties = {}; try { parties = _glHbMirrorParties_(); } catch (e0) {}
  var accs = _glAccounts_().map;
  // 🔎 (V4.340) دفعة بلا قيد مرتبط (قيدها التلقائي أُلغي أو استُبدل بقيد مستورد من الـ ERP أو قيد آخر): مطابقة بالطرف + الاتجاه + المبلغ + التاريخ
  // (نفس اليوم أولاً ثم ±3 أيام) مع أي قيد مرحَّل بأي نوع/مصدر (مستورد · تلقائي للدفعات · يدوي…) عدا قيود الحجوزات/الرحلات/الافتتاحي/الإقفال، وكل قيد يُستخدم مرة
  var unres = (pays || []).filter(function (p) { return p.id && !byPid[String(p.id)] && p.date && p.amount; });
  if (unres.length) {
    var keyOf = {}; unres.forEach(function (p) { keyOf[_glHbKey_(p.party || '')] = 1; });
    var party = {}; Object.keys(parties).forEach(function (code) { if (keyOf[_glHbKey_(parties[code])]) party[code] = _glHbKey_(parties[code]); });
    var sarRate = _glRates_().SAR || 1, DENY = /^(AUTO:(HB:|HBOPEN|TRIP:|CI:|CAT|TR|MF|VZ|OPEN|CP:)|CLOSE:)/, cand = {}, claimed = {};
    Object.keys(byPid).forEach(function (k) { claimed[byPid[k]] = 1; });
    _glRows_('lines').forEach(function (l) {
      var code = _glStr_(l[4]), pk = party[code]; if (!pk) return;
      var eid = _glStr_(l[0]), e = info[eid]; if (!e || e.st !== GL_ST_POSTED_ || DENY.test(e.sk) || e.type === 'قيد افتتاحي' || e.type === 'قيد إقفال') return;
      var net = _glNum_(l[5]) - _glNum_(l[6]); if (Math.abs(net) < 0.005) return;
      var cur = _glCur_(l[7]), amt = cur === 'SAR' ? Math.abs(net) : Math.abs(_glNum_(l[9]) - _glNum_(l[10])) / sarRate;
      (cand[pk] = cand[pk] || []).push({ eid: eid, k: _glDKey_(_glDate_(l[2])), amt: amt, dir: net < 0 ? 'استلمنا منه' : 'دفعنا له', sar: cur === 'SAR' });
    });
    var day = function (k) { return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : 0; };
    unres.sort(function (a, b) { return _glDKey_(a.date).localeCompare(_glDKey_(b.date)); }).forEach(function (p) {
      var pk = _glHbKey_(p.party || ''), pa = _glR2_(parseFloat(p.amount) || 0), pdir = /استلمنا/.test(p.dir || '') ? 'استلمنا منه' : 'دفعنا له', pd = day(_glDKey_(p.date)), best = null, bd = 99;
      (cand[pk] || []).forEach(function (c) {
        if (claimed[c.eid] || c.dir !== pdir) return;
        if (Math.abs(c.amt - pa) > (c.sar ? 0.01 : Math.max(0.01, pa * 0.015))) return;
        var d = Math.abs(day(c.k) - pd); if (d > 3) return;
        if (d < bd) { bd = d; best = c; }
      });
      if (best) { claimed[best.eid] = 1; byPid[String(p.id)] = best.eid; how[String(p.id)] = 'match'; }
    });
  }
  var need = {}; Object.keys(byPid).forEach(function (pid) { need[byPid[pid]] = 1; });
  var linesBy = {};
  _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (need[id]) (linesBy[id] = linesBy[id] || []).push(l); });
  var out = {};
  (pays || []).forEach(function (p) {
    var id = String(p.id || ''), eid = byPid[id]; if (!eid) return;
    var own = _glHbKey_(p.party || ''), seen = {}, cp = [];
    (linesBy[eid] || []).forEach(function (l) {
      var code = _glStr_(l[4]); if (seen[code]) return; seen[code] = 1;
      if (parties[code] && _glHbKey_(parties[code]) === own) return;   // سطر الطرف نفسه
      cp.push((accs[code] || {}).name || code);
    });
    out[id] = { entry: eid, voucher: vm[eid] || '', cp: cp.join('، '), how: how[id] || '' };
  });
  // دفعة بلا قيد: تُوسَم «لا تحتاج قيداً» لو قرّر المستخدم ذلك (وإلا تظهر لها أزرار الحل بالكشف)
  (pays || []).forEach(function (p) { var id = String(p.id || ''); if (id && !out[id] && pnoent[id]) out[id] = { entry: '', voucher: '', cp: '', how: 'ignored' }; });
  return out;
}
/* 🧾 (V4.341) رقم السند + الطرف المقابل لقيود دفعات حسابات العملاء/الوكلاء (للشاشة فقط — لا تدخل الكشوف المطبوعة/المصدَّرة).
   list: [{k, eid, sk, own}] — eid رقم قيد معلوم، أو sk مفتاح مصدر القيد (AUTO:CP:<id>…) يُبحث عنه؛ own(code) ⇒ أسطر الطرف نفسه تُستبعد من «الطرف المقابل».
   يُرجع {k: {entry, voucher, cp}} بمسح واحد للقيود وللأسطر المعنية فقط. */
function _glRefsFor_(list) {
  var wantSk = {}, out = {}, byK = {}, vm = {}, need = {};
  (list || []).forEach(function (x) { if (x.eid) byK[x.k] = x.eid; else if (x.sk) wantSk[x.sk] = x.k; });
  _glRows_('entries').forEach(function (r) {
    var sk = _glStr_(r[6]), eid = _glStr_(r[0]);
    var m = /^VCH:(.+)$/.exec(sk); if (m) vm[eid] = m[1];
    if (wantSk[sk] && _glStr_(r[5]) !== GL_ST_VOID_ && !byK[wantSk[sk]]) byK[wantSk[sk]] = eid;
  });
  Object.keys(byK).forEach(function (k) { need[byK[k]] = 1; });
  var accs = _glAccounts_().map, linesBy = {};
  _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (need[id]) (linesBy[id] = linesBy[id] || []).push(l); });
  (list || []).forEach(function (x) {
    var eid = byK[x.k]; if (!eid) return;
    var seen = {}, cp = [];
    (linesBy[eid] || []).forEach(function (l) { var code = _glStr_(l[4]); if (seen[code]) return; seen[code] = 1; if (x.own && x.own(code, accs[code])) return; cp.push((accs[code] || {}).name || code); });
    out[x.k] = { entry: eid, voucher: vm[eid] || '', cp: cp.join('، ') };
  });
  return out;
}
/* 🛠️ (V4.341) حل «دفعة بلا قيد مطابق» بكشف الفندق: ① مرشَّحات قريبة (نفس الطرف والاتجاه، مبلغ/تاريخ قريب) لربط الدفعة بقيد منها ② إنشاء قيدها
   التلقائي AUTO:HBP بالحسابات العامة ③ تعليمها «لا تحتاج قيداً». كل ذلك بسجل ربط بإعدادات الحسابات (hb_paylink / hb_paynoent) بلا لمس شيتات الحجوزات. */
function _glHbPayFind_(payId) {
  var c = _glHbCfg_(); if (!c.ssId) throw new Error('برنامج الحجوزات غير مربوط');
  var sh = SpreadsheetApp.openById(c.ssId).getSheetByName(c.pay); if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  for (var i = 0; i < vals.length; i++) if (_glStr_(vals[i][7]) === _glStr_(payId)) {
    var r = vals[i]; return { id: _glStr_(r[7]), party: _glStr_(r[1]), date: _glAutoDate_(r[0]), dir: _glStr_(r[2]), amount: _glR2_(parseFloat(r[3]) || 0), note: _glStr_(r[4]) };
  }
  return null;
}
function _glHbPayCands_(payId) {
  var p = _glHbPayFind_(payId); if (!p) throw new Error('الدفعة غير موجودة');
  var parties = _glHbMirrorParties_(), accs = _glAccounts_().map, pk = _glHbKey_(p.party), codes = {}, taken = {}, DENY = /^(AUTO:(HB:|HBOPEN|TRIP:|CI:|CAT|TR|MF|VZ|OPEN|CP:)|CLOSE:)/;
  Object.keys(parties).forEach(function (c) { if (_glHbKey_(parties[c]) === pk) codes[c] = 1; });
  var info = {}, vm = {};
  _glRows_('entries').forEach(function (r) { var eid = _glStr_(r[0]), sk = _glStr_(r[6]); info[eid] = { sk: sk, st: _glStr_(r[5]), type: _glStr_(r[3]), desc: _glStr_(r[4]) }; var m = /^VCH:(.+)$/.exec(sk); if (m) vm[eid] = m[1]; });
  var plink = {}; try { plink = JSON.parse(_glSettings_().hb_paylink || '{}') || {}; } catch (e) {}
  Object.keys(plink).forEach(function (k) { if (k !== p.id) taken[plink[k]] = 1; });
  var day = function (k) { return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : 0; }, pd = day(_glDKey_(p.date)), sar = _glRates_().SAR || 1, out = [], seen = {};
  _glRows_('lines').forEach(function (l) {
    var code = _glStr_(l[4]); if (!codes[code]) return;
    var eid = _glStr_(l[0]), e = info[eid]; if (!e || e.st !== GL_ST_POSTED_ || DENY.test(e.sk) || e.type === 'قيد افتتاحي' || e.type === 'قيد إقفال' || seen[eid] || taken[eid]) return;
    var net = _glNum_(l[5]) - _glNum_(l[6]); if (Math.abs(net) < 0.005) return;
    if ((net < 0 ? 'استلمنا منه' : 'دفعنا له') !== (/استلمنا/.test(p.dir) ? 'استلمنا منه' : 'دفعنا له')) return;
    var cur = _glCur_(l[7]), amt = cur === 'SAR' ? Math.abs(net) : Math.abs(_glNum_(l[9]) - _glNum_(l[10])) / sar, dd = Math.abs(day(_glDKey_(_glDate_(l[2]))) - pd);
    if (dd > 60) return;
    seen[eid] = 1; out.push({ entry: eid, date: _glDate_(l[2]), amount: _glR2_(amt), cur: cur, type: e.type, desc: e.desc, voucher: vm[eid] || '', score: Math.abs(amt - p.amount) / Math.max(1, p.amount) * 100 + dd });
  });
  out.sort(function (a, b) { return a.score - b.score; });
  var cpOf = {}; var need = {}; out.slice(0, 10).forEach(function (x) { need[x.entry] = 1; });
  _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (!need[id]) return; var code = _glStr_(l[4]); if (codes[code]) return; (cpOf[id] = cpOf[id] || {})[((accs[code] || {}).name || code)] = 1; });
  return { pay: p, cands: out.slice(0, 10).map(function (x) { x.cp = Object.keys(cpOf[x.entry] || {}).join('، '); return x; }) };
}
function _glHbPayMapSet_(setting, payId, val) {
  var o = {}; try { o = JSON.parse(_glSettings_()[setting] || '{}') || {}; } catch (e) {}
  if (val) o[payId] = val; else delete o[payId];
  var ks = Object.keys(o); if (ks.length > 600) { var keep = {}; ks.slice(-600).forEach(function (k) { keep[k] = o[k]; }); o = keep; }
  _glSetSetting_(setting, JSON.stringify(o));
}
/* 🔍 (V4.338) دفعات مشتبه بتكرارها بسجل دفعات الحجوزات: نفس الطرف + نفس التاريخ + نفس المبلغ والاتجاه (نسخة قيد حسابات عامة مع دفعة مسجَّلة
   بالحجوزات، أو نسختان). لكل صف: مصدره (قيد/حجوزات) ورقم القيد والسند والطرف المقابل — ليقرر المستخدم: حذف/دمج/إبقاء أحدها/تجاهل. */
function _glHbDupScan_(onlyParty) {
  var c = _glHbCfg_(); if (!c.ssId) return [];
  var ss = SpreadsheetApp.openById(c.ssId), psh = ss.getSheetByName(c.pay); if (!psh || psh.getLastRow() < 2) return [];
  var vals = psh.getRange(2, 1, psh.getLastRow() - 1, 10).getValues(), nz = onlyParty ? _glHbKey_(onlyParty) : '', groups = {}, ign = {};
  try { ign = JSON.parse(_glSettings_().hb_dup_ign || '{}') || {}; } catch (e0) {}
  vals.forEach(function (r, i) {
    var party = _glStr_(r[1]), date = _glAutoDate_(r[0]), dir = _glStr_(r[2]);
    if (!party || !date || /يدوي/.test(dir)) return;
    if (nz && _glHbKey_(party) !== nz) return;
    var amt = _glR2_(parseFloat(r[3]) || 0); if (!amt) return;
    var k = _glHbKey_(party) + '|' + _glDKey_(date) + '|' + amt + '|' + (dir === 'استلمنا منه' ? 'in' : 'out');
    (groups[k] = groups[k] || []).push({ id: _glStr_(r[7]) || ('row' + (i + 2)), party: party, date: date, dir: dir, amount: amt, note: _glStr_(r[4]), at: _glAutoDate_(r[6]) || '', link: _glStr_(r[9]) });
  });
  var keys = Object.keys(groups).filter(function (k) { return groups[k].length > 1; });
  if (!keys.length) return [];
  var accs = _glAccounts_().map, pcodes = _glHbMirrorParties_(), vmap = _glHbVoucherMap_(), meta = {}, linesBy = null, entType = {};
  var msh = ss.getSheetByName('البيانات المحاسبية للدفعات');
  if (msh && msh.getLastRow() > 1) msh.getRange(2, 1, msh.getLastRow() - 1, 6).getValues().forEach(function (r) { if (_glStr_(r[0])) meta[_glStr_(r[0])] = { cash: _glStr_(r[1]), by: _glStr_(r[4]) }; });
  var need = {}; keys.forEach(function (k) { groups[k].forEach(function (x) { var m = /^GL:(.+):\d+$/.exec(x.id); if (m) need[m[1]] = 1; }); });
  linesBy = {}; _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (need[id]) (linesBy[id] = linesBy[id] || []).push(l); });
  _glRows_('entries').forEach(function (r) { var id = _glStr_(r[0]); if (need[id]) entType[id] = _glStr_(r[3]); });
  var out = [];
  keys.forEach(function (k) {
    var g = groups[k], ids = g.map(function (x) { return x.id; }).sort(), sig = k + '|' + ids.join(',');
    if (ign[sig]) return;
    out.push({ sig: sig, party: g[0].party, date: g[0].date, amount: g[0].amount, dir: g[0].dir, rows: g.map(function (x) {
      var m = /^GL:(.+):\d+$/.exec(x.id), cp = '', by = '';
      if (m) {
        var seen = {}; (linesBy[m[1]] || []).forEach(function (l) { var code = _glStr_(l[4]); if (pcodes[code] || seen[code]) return; seen[code] = 1; cp += (cp ? '، ' : '') + ((accs[code] || {}).name || code); });
      } else { var mt = meta[x.id]; if (mt) { cp = (accs[mt.cash] || {}).name || mt.cash; by = mt.by; } }
      return { id: x.id, kind: m ? 'gl' : 'hb', entry: m ? m[1] : '', voucher: m ? (vmap[m[1]] || '') : '', type: m ? (entType[m[1]] || '') : 'دفعة مسجَّلة ببرنامج الحجوزات', note: x.note, cp: cp, at: x.at, by: by };
    }) });
  });
  out.sort(function (a, b) { return _glDKey_(b.date).localeCompare(_glDKey_(a.date)); });
  return out.slice(0, 150);
}
// تطبيق قرارات المستخدم: ops = [{act:'del', ids:[…]} | {act:'ignore', sig}]. حذف نسخة قيد = «إخفاء بالكشف فقط» (القيد يبقى) · حذف دفعة حجوزات = حذفها بالكشف
// opts.delNative(id) ⇒ يحذف دفعة حجوزات (من HB_Bridge بصلاحياتها). يُرجع {done, errors}
function _glHbDupApply_(ops, delNative) {
  var c = _glHbCfg_(), ss = SpreadsheetApp.openById(c.ssId), psh = ss.getSheetByName(c.pay), done = 0, errors = [], hid = _glScrHide_(), touched = {}, ign = null;
  var rowsOfId = {}; if (psh && psh.getLastRow() >= 2) psh.getRange(2, 1, psh.getLastRow() - 1, 8).getValues().forEach(function (r) { var id = _glStr_(r[7]); if (id) rowsOfId[id] = _glStr_(r[1]); });
  (ops || []).forEach(function (op) {
    if (op && op.act === 'ignore' && op.sig) { if (!ign) { try { ign = JSON.parse(_glSettings_().hb_dup_ign || '{}') || {}; } catch (e) { ign = {}; } } ign[String(op.sig).slice(0, 300)] = 1; done++; return; }
    ((op && op.ids) || []).forEach(function (id) {
      id = _glStr_(id); var m = /^GL:(.+):\d+$/.exec(id);
      if (m) {
        var party = rowsOfId[id]; if (!party) { errors.push(id + ': الصف غير موجود'); return; }
        hid['hbp|' + m[1] + '|' + _glHbKey_(party)] = 1; touched[m[1]] = 1; done++;
      } else {
        var r = delNative ? delNative(id) : { ok: false, error: 'غير مدعوم' };
        if (r && r.ok) done++; else errors.push(id + ': ' + ((r && r.error) || 'تعذّر الحذف'));
      }
    });
  });
  if (Object.keys(touched).length) {
    _glScrHideSave_(hid);
    var parties = _glHbMirrorParties_(), fx = _glFxDailyMap_();
    Object.keys(touched).forEach(function (eid) { try { _glHbMirrorSync_(eid, { parties: parties, fx: fx, ss: ss }); } catch (eS) { errors.push(eid + ': ' + eS.message); } });
  }
  if (ign) { var ks = Object.keys(ign); if (ks.length > 500) { var keep = {}; ks.slice(-500).forEach(function (k) { keep[k] = 1; }); ign = keep; } _glSetSetting_('hb_dup_ign', JSON.stringify(ign)); }
  return { done: done, errors: errors };
}
function _glHbMirrorRows_(id, cutK, parties, fx, dup, allowConv) {
  var f = _glFindEntry_(id); if (!f) return [];
  var e = _glEntryObj_(f.r);
  // (V4.258) قيود مزامنة شيت العهدة (CUST:) تُنسخ أيضاً — دفعة عميل فندقي بالعهدة كانت تظهر بكشف الحسابات العامة فقط
  // لا بحساب العميل ببرنامج الحجوزات بعد إيقاف مزامنة العهد هناك
  if (e.status !== GL_ST_POSTED_ || /^AUTO:HB/.test(e.sourceKey || '')) return [];   // (V4.344) كل القيود تُنسخ (يدوي/شيت/تلقائي/مستورد) عدا قيود دفعات الحجوزات نفسها — المنع من التكرار بالمبلغ+الطرف+التاريخ
  // 🔄 (V4.332) لا قيد على التاريخ: أي سند/قيد شيت يدوي على طرف حجوزات يُنسخ لكشف الفندق مهما كان تاريخه (تاريخ القطع يبقى فقط لقفل
  // أزرار الدفع ببرنامج الحجوزات). قيود AUTO:HBP التلقائية مستثناة أعلاه (sourceKey) فلا تتكرر دفعات الحجوزات الأصلية.
  var k = _glDKey_(e.date); if (!k) return [];
  // قيد شيت عهدة قبل القطع قد يكون مسجَّلاً أصلاً بمزامنة العهدة ببرنامج الحجوزات (CUSTODY:) ⇒ يُتحقَّق منها لتفادي التكرار
  if (!dup) { try { dup = {}; var own = 'GL:' + id + ':'; (_glHbRead_().pays || []).forEach(function (p) { if (String(p.id || '').indexOf(own) === 0) return; dup[p.party + '|' + _glR2_(p.amount) + '|' + _glDKey_(p.date)] = 1; }); } catch (eD) { dup = null; } }
  parties = parties || _glHbMirrorParties_();
  var sarRate = _glFxRateAt_('SAR', e.date, fx).rate || _glRates_().SAR || 1, out = [], skip = [], hidP = _glScrHide_();
  _glLinesOf_(id).map(_glLineObj_).sort(function (a, b) { return a.lineNo - b.lineNo; }).forEach(function (l) {
    var nm = parties[l.account]; if (!nm) return;
    if (hidP['hbp|' + id + '|' + _glHbKey_(nm)]) return;   // 🙈 (V4.338) حُذفت من كشف الفندق فقط بقرار المستخدم (القيد باقٍ)
    var net = _glR2_(l.debit - l.credit); if (Math.abs(net) < 0.005) return;
    if (l.currency !== 'SAR' && !allowConv) { if (skip.indexOf(nm) < 0) skip.push(nm); return; }   // 💱 (V4.305) لا تحويل تلقائي لكشف الفندق
    var amt = l.currency === 'SAR' ? Math.abs(net) : _glR2_(Math.abs(l.bDebit - l.bCredit) / sarRate);
    if (!amt) return;
    if (dup && dup[nm + '|' + _glR2_(amt) + '|' + k]) return;
    out.push({ name: nm, dir: net < 0 ? 'استلمنا منه' : 'دفعنا له', amt: amt, note: l.desc || e.desc,
      cur: l.currency !== 'SAR' ? ' (' + _glR2_(Math.abs(net)) + ' ' + l.currency + ')' : '' });
  });
  var m = e.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/), d = new Date(+m[3], +m[2] - 1, +m[1]), ref = e.voucherNo || id;
  var link = out.length >= 2 ? 'GL:' + id : '', now = new Date();
  var rows = out.map(function (x, i) {
    return [d, x.name, x.dir, x.amt, (x.note || e.type) + x.cur, ref, now, 'GL:' + id + ':' + (i + 1), false, link];   // (V4.247) رقم القيد بعموده فقط لا بالبيان
  });
  rows.skipped = skip;
  return rows;
}
// يُستدعى بعد حفظ/ترحيل/إلغاء/حذف أي قيد. opt.force: إعادة كتابة كل الصفوف (أداة المزامنة الشاملة)
// (V4.246) سبب عدم النسخ لبرنامج الحجوزات لقيد على حساب طرف حجوزات — يُعرض للمستخدم بعد الحفظ بدل الصمت
var _GL_HB_MIRROR_LAST_ = null;
function _glHbStaffName_(u) {   // اسم الموظف كما يظهر في تنبيهات برنامج الحجوزات (اسم العرض هناك إن وُجد)
  u = _glStr_(u); if (!u) return 'البرنامج الرئيسي';
  try { if (typeof ensureUsersSheet_ === 'function') { var sh = ensureUsersSheet_(), i = findUserRow_(sh, u); if (i !== -1) return _glStr_(sh.getRange(i, 2).getValue()) || u; } } catch (e) {}
  return u;
}
function _glHbMirrorWhy_(id) {
  try {
    var f = _glFindEntry_(id); if (!f) return null;
    var parties = _glHbMirrorParties_(), names = [];
    _glLinesOf_(id).forEach(function (l) { var n = parties[_glStr_(l[4])]; if (n && names.indexOf(n) < 0) names.push(n); });
    if (!names.length) return null;
    var e = _glEntryObj_(f.r), from = _glSettings_().hb_gl_only_from || '', why = '';
    if (!_glSettings_().hb_ss_id) why = 'برنامج الحجوزات غير مربوط بالحسابات';
    else if (!from) why = 'لم يُفعَّل بعد «تاريخ القطع» — الحسابات العامة ← 🏨 الحجوزات ← 💳 دفعات الفنادق ← 🔒 تاريخ القطع (بعد تطبيقه تُنسخ القيود من التاريخ تلقائياً، ومنها هذا القيد)';
    else if (e.status !== GL_ST_POSTED_) why = 'القيد مسودة غير مرحّل';
    
    return why ? { names: names, why: why } : null;
  } catch (x) { return null; }
}
/* ⚡ (V4.307) الحل الجذري لبطء «تعديل قيد / اعتماد صفوف الشيت / اعتماد التغييرات»: نسخ القيد لكشف برنامج الحجوزات
   كان يتم **داخل قفل الحسابات**: فتح ملف الحجوزات الخارجي (SpreadsheetApp.openById) + قراءة عمود المعرّفات كاملاً +
   الكتابة + تنبيه تليجرام — ثوانٍ لكل قيد، وعشرات الثواني عند اعتماد عدة صفوف، فتنتظر كل عمليات الحفظ الأخرى
   وتفشل بـ«البرنامج مشغول/مهلة التأمين». الآن: داخل القفل يُحسب فقط (محلياً من ملف الحسابات) ما سيُنسخ وما يُستبعد
   لعملته — للتنبيه الفوري كما كان — ويُضاف القيد لطابور صغير (Script Properties)، ثم يُنفَّذ النسخ الفعلي **خارج القفل**:
   فوراً بنداء خلفي من الواجهة بعد ظهور النتيجة للمستخدم، أو بالمزامنة المجدولة التالية احتياطاً. قفل مستقل «hbmir»
   يمنع تنفيذين متوازيين للطابور (فلا تتكرر الصفوف بكشف الحجوزات). */
var _GL_MIRQ_N_ = 0;
function _glMirQ_(id, o) {
  try {
    PropertiesService.getScriptProperties().setProperty('GLMQ_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      JSON.stringify(Object.assign({ id: _glStr_(id) }, o || {})));
    _GL_MIRQ_N_++; return true;
  } catch (e) { return false; }
}
// ما سيُنسخ لقيد (بلا فتح ملف الحجوزات): null ⇒ لا تاريخ قطع/لا شيء للنسخ ولا نسخة سابقة
function _glHbMirrorPeek_(id, parties, fx) {
  var cutK = _glHbOnlyK_(); if (!cutK) return null;
  var was = _glFindRows_('hbmir', id), wasRow = false;
  if (was === null) wasRow = _glRows_('hbmir').some(function (r) { return _glStr_(r[0]) === id; }); else wasRow = was.length > 0;
  var rows = _glHbMirrorRows_(id, cutK, parties, fx, null, wasRow);
  if (!rows.length && !wasRow) return (rows.skipped || []).length ? { written: 0, skipped: rows.skipped, was: false, need: false } : null;
  return { written: rows.length, skipped: wasRow ? [] : (rows.skipped || []), was: wasRow, need: true };
}
// تنفيذ طابور النسخ (خارج قفل الحسابات) — ميزانية زمنية، والباقي للنداء التالي
function _glMirFlush_(budgetMs) {
  var P = PropertiesService.getScriptProperties();
  var list = function () { var all = P.getProperties(); return { all: all, keys: Object.keys(all).filter(function (k) { return k.indexOf('GLMQ_') === 0; }).sort() }; };
  var L = list(); if (!L.keys.length) return { done: 0, left: 0 };
  var lk = _glNamedLock_('hbmir'); if (!lk.tryLock(1500)) return { busy: true, left: L.keys.length };
  var t0 = Date.now(), done = 0, written = 0, left = 0;
  try {
    L = list();
    var by = {}, order = [];
    L.keys.forEach(function (k) {
      var o = null; try { o = JSON.parse(L.all[k]); } catch (e) {}
      if (!o || !o.id) { try { P.deleteProperty(k); } catch (e2) {} return; }
      var g = by[o.id]; if (!g) { g = by[o.id] = { id: o.id, keys: [], notify: false, isNew: true, by: '' }; order.push(o.id); }
      g.keys.push(k); g.notify = g.notify || !!o.notify; g.isNew = g.isNew && !!o.isNew; if (o.by) g.by = o.by;
    });
    var opt = {};
    try { opt.parties = _glHbMirrorParties_(); } catch (eP) {}
    try { opt.fx = _glFxDailyMap_(); } catch (eF) {}
    try { var c = _glHbCfg_(); if (c.ssId) opt.ss = SpreadsheetApp.openById(c.ssId); } catch (eS) {}
    order.forEach(function (id) {
      var g = by[id];
      if (Date.now() - t0 > (budgetMs || 60000)) { left++; return; }
      g.keys.forEach(function (k) { try { P.deleteProperty(k); } catch (eD) {} });   // قبل التنفيذ: لا إعادة لا نهائية لقيد معطوب
      try {
        var r = _glHbMirrorSync_(id, Object.assign({ notify: g.notify, by: g.by, isNew: g.isNew }, opt));
        done++; if (r && r.written) written += r.written;
      } catch (eM) { Logger.log('mirror flush ' + id + ': ' + eM.message); }
    });
  } finally { lk.releaseLock(); }
  return { done: done, written: written, left: left };
}
// نداء الواجهة الخلفي بعد الحفظ/الاعتماد (لا ينتظره المستخدم)
function glMirFlush(authToken) {
  requireAuth_(authToken);
  return Object.assign({ success: true }, _glMirFlush_(90000));
}
function _glHbMirrorSync_(entryId, opt) {
  opt = opt || {};
  var id = _glStr_(entryId); if (!id) return null;
  var cutK = opt.cutK || _glHbOnlyK_(), was = _glFindRows_('hbmir', id), wasRow = was && was.length ? was[0].row : 0;
  if (was === null) _glRows_('hbmir').some(function (r, i) { if (_glStr_(r[0]) === id) { wasRow = i + 2; return true; } return false; });
  var want = cutK ? _glHbMirrorRows_(id, cutK, opt.parties, opt.fx, opt.dup, !!wasRow || !!opt.keepConv) : [];   // (V4.305) التحويل القديم للمنسوخ سابقاً فقط
  var skipped = want.skipped || [];
  if (!want.length && !wasRow) return skipped.length ? { written: 0, removed: 0, skipped: skipped } : null;   // لا نسخة سابقة ولا جديدة ⇒ بلا فتح ملف الحجوزات
  var c = _glHbCfg_(); if (!c.ssId) return null;
  var ss = opt.ss || SpreadsheetApp.openById(c.ssId), sh = ss.getSheetByName(c.pay); if (!sh) return null;
  var pre = 'GL:' + id + ':', last = sh.getLastRow(), have = [];
  // ⚡ (V4.294) قيد منشأ للتوّ (opt.isNew): معرّفه تسلسلي جديد لم يُنسَخ قطّ ⇒ لا صفوف «GL:id:» سابقة له بشيت
  // الدفعات، فنتخطّى قراءة عمود H كاملاً. كانت هذه القراءة جولة شبكية لكل قيد عند اعتماد/مزامنة عدة صفوف عهدة،
  // فيُمسَك قفل الحسابات طويلاً ⇒ «البرنامج مشغول/مهلة التأمين». لا يُمرَّر isNew إلا لقيد أنشأته هذه المزامنة.
  if (!opt.isNew && last >= 2) sh.getRange(2, 8, last - 1, 1).getValues().forEach(function (r, i) { if (String(r[0]).indexOf(pre) === 0) have.push(i + 2); });
  var n = Math.min(have.length, want.length), oldVals = [];
  if (opt.notify && have.length) oldVals = have.map(function (r) { return sh.getRange(r, 1, 1, 10).getValues()[0]; });   // (V4.247) للمقارنة في تنبيه التعديل/الحذف
  for (var i = 0; i < n; i++) sh.getRange(have[i], 1, 1, 10).setValues([want[i]]);
  for (var j = have.length - 1; j >= want.length; j--) sh.deleteRow(have[j]);
  if (want.length > n) sh.getRange(sh.getLastRow() + 1, 1, want.length - n, 10).setValues(want.slice(n));
  var mSh = _glSheet_('hbmir');
  if (want.length) {
    var row = [id, want.length, _glNow_()];
    if (wasRow) mSh.getRange(wasRow, 1, 1, 3).setValues([row]); else mSh.getRange(mSh.getLastRow() + 1, 1, 1, 3).setValues([row]);
  } else if (wasRow) mSh.deleteRow(wasRow);
  _GL_HB_MEMO_ = null;
  try { if (typeof invalidatePaymentsMemo_ === 'function') invalidatePaymentsMemo_(); } catch (eI) {}
  // 🔔 (V4.246) تنبيه تليجرام «دفعة» كما كان يرسله برنامج الحجوزات عند تسجيل الدفعة هناك — لأول نسخة فقط
  // (لا عند تعديل القيد ولا في إعادة النسخ الشاملة)
  var _tgOn = typeof _alertOn_ !== 'function' || _alertOn_('tg_pay_glmirror');   // 🔔 (V4.324) مفتاح مستقل من مركز التنبيهات
  if (opt.notify && _tgOn && wasRow && typeof tgEnqueue_ === 'function') try { _glHbMirrorTgChange_(oldVals, want, opt.by); } catch (eTc) { Logger.log('hb mirror tg change: ' + eTc.message); }
  if (opt.notify && _tgOn && !wasRow && want.length && typeof tgEnqueue_ === 'function') {
    want.forEach(function (w) {
      try {
        tgEnqueue_('payment', { client: w[1], amount: w[3], note: w[2] + (w[4] ? ' — ' + w[4] : ''), by: opt.by || 'البرنامج الرئيسي',
          payDate: _glDate_(w[0]), qaid: w[5] || '', balParties: [{ name: w[1], roleHint: w[2] === 'دفعنا له' ? 'supplier' : 'client' }], ts: new Date().getTime() });
      } catch (eT) { Logger.log('hb mirror tg: ' + eT.message); }
    });
  }
  return { written: want.length, removed: Math.max(0, have.length - want.length), skipped: skipped };
}
// 🔔 (V4.247) تنبيه تليجرام عند تعديل قيد منسوخ (ما تغيّر لكل طرف) أو إلغائه/حذفه — مثل تنبيه «تعديل بيان دفعة» ببرنامج الحجوزات
function _glHbMirrorTgChange_(oldVals, want, by) {
  var esc = function (v) { return typeof tgEsc_ === 'function' ? tgEsc_(v) : String(v == null ? '' : v); };
  var stamp = typeof tgStamp_ === 'function' ? tgStamp_() : _glNow_(), who = by || 'البرنامج الرئيسي';
  var fmt = function (r) { return { date: _glDate_(r[0]), party: _glStr_(r[1]), dir: _glStr_(r[2]), amt: _glR2_(_glNum_(r[3])), note: _glStr_(r[4]) }; };
  var O = oldVals.map(fmt), N = want.map(fmt);
  var byParty = function (L) { var o = {}; L.forEach(function (x) { o[x.party] = x; }); return o; }, oP = byParty(O), nP = byParty(N);
  Object.keys(oP).forEach(function (p) {
    var a = oP[p], b = nP[p], lines;
    if (!b) {
      lines = ['🗑️ <b>إلغاء دفعة</b>', '━━━━━━━━━━━━━━', '👤 <b>الطرف:</b> ' + esc(p), '💰 <b>المبلغ:</b> ' + esc(a.amt) + ' ريال — ' + esc(a.dir),
        '📅 <b>تاريخ الدفعة:</b> ' + esc(a.date), '📝 ' + esc(a.note), '━━━━━━━━━━━━━━', '👤 <b>بواسطة:</b> ' + esc(who), '⏰ ' + stamp];
    } else {
      var d = [];
      if (a.amt !== b.amt) d.push(['المبلغ', a.amt + ' ريال', b.amt + ' ريال']);
      if (a.dir !== b.dir) d.push(['الاتجاه', a.dir, b.dir]);
      if (a.date !== b.date) d.push(['التاريخ', a.date, b.date]);
      if (a.note !== b.note) d.push(['البيان', a.note, b.note]);
      if (!d.length) return;
      lines = ['✏️ <b>تعديل بيان دفعة</b>', '━━━━━━━━━━━━━━', '👤 <b>الطرف:</b> ' + esc(p), '━━━━━━━━━━━━━━', '📝 <b>ما الذي تغيّر:</b>'];
      d.forEach(function (x) { lines.push('   • <b>' + esc(x[0]) + '</b>'); lines.push('      القيمة القديمة: <s>' + esc(x[1]) + '</s>'); lines.push('      القيمة الجديدة: <b>' + esc(x[2]) + '</b>'); });
      lines.push('━━━━━━━━━━━━━━', '👤 <b>بواسطة:</b> ' + esc(who), '⏰ ' + stamp);
    }
    tgEnqueue_('payment', { preformatted: lines.join('\n'), client: p, balParties: [{ name: p, roleHint: (b || a).dir === 'دفعنا له' ? 'supplier' : 'client' }], ts: new Date().getTime() });
  });
  // طرف جديد أُضيف للقيد بالتعديل ⇒ تنبيه دفعة عادي
  Object.keys(nP).forEach(function (p) {
    if (oP[p]) return; var b = nP[p];
    tgEnqueue_('payment', { client: p, amount: b.amt, note: b.dir + (b.note ? ' — ' + b.note : ''), by: who, payDate: b.date, balParties: [{ name: p, roleHint: b.dir === 'دفعنا له' ? 'supplier' : 'client' }], ts: new Date().getTime() });
  });
}
// ضبط تاريخ القطع (للمدير) + مزامنة النسخ العاكسة لكل القيود من التاريخ. date فارغ ⇒ إيقاف (تُحذف كل النسخ العاكسة)
function glHbGlOnlySet(authToken, date) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  var d = _glDate_(date); if (_glStr_(date) && !d) throw new Error('تاريخ غير صالح');
  var lock = _glLock_(); lock.waitLock(120000);
  try {
    var old = _glSettings_().hb_gl_only_from || '';
    _glSetSetting_('hb_gl_only_from', d || '');
    _GL_SET_MEMO_ = null; _GL_HB_MEMO_ = null;
    var r = _glHbMirrorAll_();
    logChange_(session.username, 'تاريخ قطع دفعات الحجوزات', 'GL:SETTINGS', 'hb_gl_only_from', old || '-', d || '-');
    return Object.assign({ success: true, from: d || '' }, r);
  } finally { _glUnlock_(lock); }
}
function glHbMirrorResync(authToken) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('للمدير فقط');
  var lock = _glLock_(); lock.waitLock(120000);
  try { return Object.assign({ success: true, from: _glSettings_().hb_gl_only_from || '' }, _glHbMirrorAll_()); }
  finally { _glUnlock_(lock); }
}
/* 💵 (V4.308) إعادة مزامنة دفعات العملاء — إصلاح بضغطة واحدة لأي سند قبض/صرف/إيداع/سحب مرحّل على حساب عميل لم يظهر
   في «حسابات عملاء العمرة». آمن ومتكرر بلا أي تكرار بفضل علامة ⟦src:gl-ID⟧ (يُحدِّث الصف في مكانه أو يُنشئه). ويبلّغ عن
   الحسابات التي اسم ربطها لا يطابق أي عميل له بنود — وهو السبب الأشيع لتسجيل الدفعة باسم مختلف فلا تظهر تحت العميل المتوقَّع. */
/* ⚡ (V4.310) الحل الجذري لبطء «إعادة مزامنة دفعات العملاء»: كانت كل مزامنة لسند واحد (عبر _glSyncVoucherPays_ ←
   _glCpSyncVoucher_) تبحث (TextFinder) من جديد بشيتي القيود/السطور (مرتين فعلياً — مرة هنا ومرة داخل _glEntryFull_)
   ثم تمسح عمود البيان **كاملاً** بشيت «حسابات عملاء العمرة» — نحو ١٠-١٤ نداء خدمة شيت حقيقي لكل سند (يفسّر توقّف
   سجل المستخدم عند ٤٢ سنداً فقط بعد مهلة ٢٤٠ ثانية). الآن: القيود والسطور مُحمَّلة أصلاً بالذاكرة (بلا أي بحث)،
   وشيت حسابات عملاء العمرة يُقرأ **مرة واحدة** كاملاً، وكل المطابقة والحساب يتم بالذاكرة، ثم تُكتب الفروق بعدد
   قليل جداً من النداءات (كتل متجاورة محدَّثة + حذف مجمَّع + إلحاق كل الصفوف الجديدة دفعة واحدة) — بصرف النظر عن
   عدد السندات، فلم تعد هناك حاجة لمهلة زمنية داخلية ولا لتكرار الضغط لإكمال الباقي.
   ⚠️ لم تعد تمسّ نسخ دفعات الفنادق/الحجوزات إطلاقاً (كانت تستدعيها ضمنياً عبر _glSyncVoucherPays_) — لها أداتها
   المستقلة «🔁 إعادة النسخ» بتبويب 💳 دفعات الفنادق (glHbMirrorResync)؛ هذا الزر لحسابات عملاء العمرة فقط كاسمه
   بالضبط، فلا تتكرر تنبيهات تليجرام الحجوزات عند إعادة مزامنة إدارية لا علاقة لها بها. */
function glCpMirrorResync(authToken) {
  var session = requireAuth_(authToken);
  if (!_glIsAdmin_(session)) throw new Error('إعادة مزامنة دفعات العملاء للمدير فقط');
  return _glCpResyncCore_(session.username, {});
}
// 🔄 (V4.336) زر «جلب الدفعات من الحسابات العامة» بشاشة حسابات العملاء — بصلاحية تعديل الحسابات (لا يشترط المدير).
// opts.restoreHidden ⇒ يُفرغ سجل «المحذوف من الشاشة فقط» فتعود تلك الدفعات أيضاً
function accGlPullPayments(authToken, restoreHidden) {
  var session = _accPerm_(authToken, 'edit');
  return _glCpResyncCore_(session.username, { restoreHidden: !!restoreHidden });
}
function _glCpResyncCore_(user, opts) {
  opts = opts || {};
  var lock = _glLock_(); lock.waitLock(150000);
  try {
    if (opts.restoreHidden) { var hd0 = _glScrHide_(), kept = {}; Object.keys(hd0).forEach(function (k) { if (k.indexOf('cp|') !== 0) kept[k] = 1; }); _glScrHideSave_(kept); }
    var accs = _glAccounts_().map, mismatches = [], seenCode = {};
    // أسماء العملاء المسجَّلين (لهم بنود) — لكشف أخطاء اسم الربط
    var clientSet = {};
    try { var iSh = _accSheet_(ACC_ITEMS_SHEET, ACC_ITEMS_HEADERS); if (iSh.getLastRow() > 1) iSh.getRange(2, 2, iSh.getLastRow() - 1, 1).getValues().forEach(function (r) { var n = _glStr_(r[0]); if (n) clientSet[n] = 1; }); } catch (e0) {}
    // السطور: فهرس واحد بالذاكرة (بدل بحث TextFinder مستقل لكل سند)
    var linesByEntry = {};
    _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (id) (linesByEntry[id] = linesByEntry[id] || []).push(l); });
    // القيود المرشَّحة (مرحّلة + سند قبض/صرف/إيداع/سحب) مع أسطرها من الفهرس — بلا أي بحث حي بعد هذه النقطة
    var items = [], tagged = {}, drafts = [];   // tagged: قيود لها نسخ قائمة بحسابات العملاء (لتصحيحها/حذفها حتى لو فقدت سطر العميل)
    try { var tSh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS); if (tSh.getLastRow() > 1) tSh.getRange(2, 9, tSh.getLastRow() - 1, 1).getValues().forEach(function (r) { var m = /⟦src:gl-([^⟧]+)⟧/.exec(String(r[0] == null ? '' : r[0])); if (m) tagged[m[1]] = 1; }); } catch (eT) {}
    _glRows_('entries').forEach(function (r) {
      var id = _glStr_(r[0]); if (!id) return;
      if (_glStr_(r[5]) !== GL_ST_POSTED_) {   // مسودة بسطر عميل ⇒ لا تُنسخ قبل الترحيل (تُعدّ للتنبيه فقط)
        if (_glStr_(r[5]) === GL_ST_DRAFT_ && _glCpEligible_(r[3], r[6]) && (linesByEntry[id] || []).some(function (l) { var a1 = accs[_glStr_(l[4])]; return a1 && a1.kind === 'client' && a1.link; })) drafts.push(id);
        return;
      }
      if (!_glCpEligible_(r[3], r[6])) return;
      var lines = linesByEntry[id] || [];
      if (!lines.some(function (l) { var a0 = accs[_glStr_(l[4])]; return a0 && a0.kind === 'client' && a0.link; }) && !tagged[id]) return;   // 🔁 (V4.330) كل أنواع القيود الآن — لا نمسّ إلا ما له سطر عميل أو نسخة قائمة
      items.push({ id: id, r: r, lines: lines });
      lines.forEach(function (l) {
        var a = accs[_glStr_(l[4])]; if (!a || a.kind !== 'client' || !a.link || seenCode[a.code]) return;
        if (!clientSet[a.link]) { seenCode[a.code] = 1; mismatches.push({ id: id, code: a.code, name: a.name, link: a.link }); }
      });
    });
    var r2 = _glCpSyncVouchersBatch_(items, accs, user);
    var hidN = Object.keys(_glScrHide_()).filter(function (k) { return k.indexOf('cp|') === 0; }).length;
    logChange_(user, 'إعادة مزامنة دفعات العملاء', 'GL:cp', '-', '-',
      'سندات ' + items.length + ' · جديدة ' + r2.created + ' · محدَّثة ' + r2.updated + (r2.deleted ? ' · محذوفة ' + r2.deleted : '') + (mismatches.length ? ' · ربط غير مطابق ' + mismatches.length : '') + (drafts.length ? ' · مسودات ' + drafts.length : ''));
    return { success: true, done: items.length, created: r2.created, updated: r2.updated, deleted: r2.deleted, mismatches: mismatches.slice(0, 100), drafts: drafts.slice(0, 30), draftsN: drafts.length, hiddenN: hidN, timedOut: false };
  } finally { _glUnlock_(lock); }
}
// ⚡ (V4.310) الكتابة الفعلية لحسابات عملاء العمرة لعدة سندات دفعة واحدة — نفس حساب المبلغ/العملة/الرحلة ونفس
// حماية «لا تُستبدَل رحلة عُدِّلت يدوياً بـ”عام“» الموجودة في _glCpSyncVoucher_ تماماً، لكن بقراءة/كتابة
// ACC_PAY_SHEET و ACC_META_SHEET **مرة واحدة** بدل نداء مستقل لكل سند
function _glCpSyncVouchersBatch_(items, accs, user) {
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), last = sh.getLastRow(), W = ACC_PAY_HEADERS.length;
  var data = last >= 2 ? sh.getRange(2, 1, last - 1, W).getValues() : [];
  // فهرس العلامة ⟦src:gl-ID⟧ ⇒ أرقام الصفوف (من عمود البيان — العمود التاسع) بدل TextFinder مستقل لكل سند
  var tagIndex = {}, tagRx = /⟦src:gl-([^⟧]+)⟧/;
  data.forEach(function (row, i) {
    var m = tagRx.exec(_glStr_(row[8])); if (!m) return;
    (tagIndex[m[1]] = tagIndex[m[1]] || []).push(i + 2);
  });
  var updates = [], deleteRows = [], creates = [], newMetaPairs = {}, created = 0, updated = 0, hid = _glScrHide_();
  // مفاتيح الارتباط الموجودة سلفاً بشيت الميتا — تُقرأ مرة واحدة بدل مرة لكل صف جديد
  var metaSh = _accSheet_(ACC_META_SHEET, ACC_META_HEADERS), metaLast = metaSh.getLastRow(), haveMeta = {};
  if (metaLast >= 2) metaSh.getRange(2, 1, metaLast - 1, 2).getValues().forEach(function (r) { haveMeta[_glStr_(r[0]) + '|' + _glStr_(r[1])] = 1; });

  items.forEach(function (it) {
    try {
      var e = _glEntryObj_(it.r), want = [];
      it.lines.map(_glLineObj_).forEach(function (l) {
        var a = accs[l.account]; if (!a || a.kind !== 'client' || !a.link) return;
        if (hid['cp|' + it.id + '|' + a.link]) return;   // 🙈 محذوفة من الشاشة فقط
        var ca = _glCpAmtOf_(l), amt = ca.amt; if (!amt) return;
        var trip = _glStr_(l.trip || e.trip) || 'عام';
        want.push([a.link, trip, 'دفعة', e.date, amt, ca.cur, '', (e.voucherNo ? 'إيصال ' + e.voucherNo + ' — ' : '') + (l.desc || e.desc || '') + ca.note + ' ⟦src:gl-' + it.id + '⟧']);
      });
      var rowsIdx = (tagIndex[it.id] || []).slice().sort(function (a, b) { return a - b; });
      // (V4.315) مطابقة الصفوف بالعميل أولاً لا بالترتيب (نفس _glCpSyncVoucher_)
      var pr = _glCpPair_(rowsIdx.map(function (rw) { return { row: rw, client: _glStr_(data[rw - 2][1]), trip: _glStr_(data[rw - 2][2]) }; }), want), adds = [];
      want.forEach(function (w, k) {
        var o = pr.assign[k]; if (!o) { adds.push(w); return; }
        // (V4.309) دفعة عُدِّلت رحلتها يدوياً من شاشة حسابات العملاء — لا تُستبدَل بـ«عام» لمجرد أن القيد فقد رحلته
        // (V4.315) …لكن فقط لو العميل نفسه — لا تُنقَل رحلة عميل سابق لعميل جديد بعد تغيير الحساب المقابل
        var trip2 = w[1] === 'عام' ? ((o.client === w[0] && o.trip) || 'عام') : w[1];
        updates.push({ row: o.row, vals: [w[0], trip2, w[2], w[3], w[4], w[5], w[6], w[7]] }); updated++;
      });
      pr.unused.forEach(function (o) { deleteRows.push(o.row); });
      for (var j = 0; j < adds.length; j++) {
        var w2 = adds[j];
        creates.push([null, w2[0], w2[1], w2[2], w2[3], w2[4], w2[5], w2[6], w2[7], user || 'الحسابات العامة', new Date(), null]);
        created++;
        if (w2[1] !== 'عام') newMetaPairs[w2[0] + '|' + w2[1]] = w2;
      }
    } catch (eIt) { Logger.log('cp batch ' + it.id + ': ' + eIt.message); }
  });

  // تطبيق التحديثات: كتل صفوف متجاورة بنداء setValues واحد لكل كتلة
  updates.sort(function (a, b) { return a.row - b.row; });
  for (var ui = 0; ui < updates.length;) {
    var start = updates[ui].row, uj = ui, block = [updates[ui].vals];
    while (uj + 1 < updates.length && updates[uj + 1].row === updates[uj].row + 1) { uj++; block.push(updates[uj].vals); }
    sh.getRange(start, 2, block.length, 8).setValues(block);
    ui = uj + 1;
  }
  // تطبيق الحذف: كتل من الأسفل للأعلى حتى لا تتزحزح أرقام الصفوف المتبقية أثناء الحذف (مثل _glDeleteLinesOf_)
  _glRowBlocks_(deleteRows.map(function (r) { return { row: r }; })).forEach(function (b) { sh.deleteRows(b[0], b[1]); });
  // الإلحاق: دفعة واحدة لكل الصفوف الجديدة بنطاق تسلسلي واحد محجوز (بدل قفل+خاصية لكل صف)
  if (creates.length) {
    creates.forEach(function (c) { c[0] = _accId_('P'); c[11] = ''; });   // (V4.330) بلا رقم تسلسلي قديم — رقم القيد هو المرجع
    sh.getRange(sh.getLastRow() + 1, 1, creates.length, W).setValues(creates);
  }
  // ربط العملاء الجدد بالرحلات — مرة واحدة لكل زوج (عميل، رحلة) فريد لم يكن مسجَّلاً، لا لكل صف
  Object.keys(newMetaPairs).forEach(function (k) {
    if (haveMeta[k]) return;
    var w = newMetaPairs[k];
    try { _accEnsureMeta_(null, w[0], w[1], user || 'الحسابات العامة'); haveMeta[k] = 1; } catch (eEm) {}
  });
  return { created: created, updated: updated, deleted: deleteRows.length };
}
/* 🔗 (V4.310) الحلّ الموحَّد لإيجاد حساب دفتر الأستاذ لاسم طرف حجوزات (فندق/مورد/عميل) — الحل الجذري لمشكلة
   «غير مربوط بحساب عام» الوهمية بشاشة مطابقة الكشوف: كانت تتحقق فقط من حقل «كود الحساب» القديم بشاشة «بيانات
   الحساب» (مُصمَّم أصلاً كمُعرِّف تسلسلي لاسم ملف PDF لا كود حساب) — بينما الربط الفعلي الذي تعمل عليه كل الدفعات
   فعلاً (التسجيل من الخزينة/البنك/العهدة/القيد الذي ينسخ بنجاح لكشف الفندق) مصدره «خريطة الأسماء» (hbmap). الآن
   كل نقاط القراءة تستخدم هذا المصدر أولاً، وتتراجع لحقل «مرتبط بـ» بشاشة تعديل الحساب لو لم يوجد بخريطة الأسماء،
   وأخيراً للحقل اليدوي القديم فقط حين لا يوجد أي ربط حقيقي إطلاقاً — فلا ينكسر أي حساب يعمل اليوم. */
function _glHbCodeOf_(name) {
  name = _glStr_(name); if (!name) return { code: '', type: '', src: '' };
  var accs = _glAccounts_();
  try {
    var m = _glHbMap_()[_glHbKey_(name)];
    if (m && m.code && accs.map[m.code] && !accs.map[m.code].isGroup && !/^(رحلة|تجاهل)$/.test(m.type)) return { code: m.code, type: m.type, src: 'hbmap' };
  } catch (e) {}
  try {
    var k = _glHbKey_(name);
    var a = accs.list.filter(function (x) { return !x.isGroup && x.link && _glHbKey_(x.link) === k; })[0];
    if (a) return { code: a.code, type: '', src: 'link' };
  } catch (e2) {}
  return { code: '', type: '', src: '' };
}
// (V4.248) حساب طرف برنامج الحجوزات بالاسم (لأزرار الدفعة داخل كشفه الفندقي) — (V4.310) عبر المحلّل الموحَّد أعلاه
function glHbPartyCode(authToken, name) {
  _glPerm_(authToken, 'view', 'hb');
  var r = _glHbCodeOf_(name);
  return { success: true, name: _glStr_(name), code: r.code, type: r.type };
}
// قائمة القيود المنسوخة لبرنامج الحجوزات (لتبويب «💳 دفعات الفنادق»)
function glHbMirrorList(authToken) {
  _glPerm_(authToken, 'view', 'hb');
  var m = {}; _glRows_('hbmir').forEach(function (r) { var id = _glStr_(r[0]); if (id) m[id] = { n: _glNum_(r[1]), at: _glStr_(r[2]) }; });
  var ids = Object.keys(m), out = [];
  if (ids.length) {
    var lines = {}; _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (m[id]) (lines[id] = lines[id] || []).push(_glLineObj_(l)); });
    _glRows_('entries').forEach(function (r) {
      var id = _glStr_(r[0]); if (!m[id]) return;
      var e = _glEntryObj_(r);
      out.push({ id: id, date: e.date, type: e.type, desc: e.desc, status: e.status, voucherNo: e.voucherNo, rows: m[id].n, at: m[id].at,
        lines: (lines[id] || []).map(function (l) { return { account: l.account, debit: l.debit, credit: l.credit, currency: l.currency }; }) });
    });
  }
  out.sort(function (a, b) { return _glDKey_(b.date).localeCompare(_glDKey_(a.date)) || b.id.localeCompare(a.id); });
  return { success: true, from: _glSettings_().hb_gl_only_from || '', rows: out.slice(0, 1500), parties: _glHbMirrorParties_() };
}
function _glHbMirrorAll_(onlyParty) {
  var cutK = _glHbOnlyK_(), ids = {}, parties = _glHbMirrorParties_(), fx = _glFxDailyMap_();
  // onlyParty: اسم طرف واحد (زر المزامنة الاحتياطية بكشف الفندق) ⇒ قيوده فقط، بلا تنظيف اليتيم العام
  var codes = null;
  if (onlyParty) { codes = {}; var nz0 = _glNorm_(onlyParty); Object.keys(parties).forEach(function (c) { if (_glNorm_(parties[c]) === nz0) codes[c] = 1; }); }
  _glRows_('hbmir').forEach(function (r) { var id = _glStr_(r[0]); if (id) ids[id] = 1; });
  Object.keys(_glHbPreMir_()).forEach(function (id) { ids[id] = 1; });   // (V4.331) قيود ما قبل القطع المختارة
  if (cutK) {
    var lines = {}; _glRows_('lines').forEach(function (l) { if (parties[_glStr_(l[4])]) lines[_glStr_(l[0])] = 1; });
    _glRows_('entries').forEach(function (r) {
      var id = _glStr_(r[0]), sk = _glStr_(r[6]);
      if (lines[id] && _glStr_(r[5]) === GL_ST_POSTED_ && !/^AUTO:HB/.test(sk)) ids[id] = 1;   // (V4.332) أي تاريخ
    });
  }
  // (V4.258) قيود العهدة: لا تُنسخ لو سجّلها برنامج الحجوزات نفسه من قبل (CUSTODY:) بنفس الطرف والمبلغ والتاريخ
  var dup = {}; try { (_glHbRead_().pays || []).forEach(function (p) { if (/^CUSTODY:/.test(p.id)) dup[p.party + '|' + _glR2_(p.amount) + '|' + _glDKey_(p.date)] = 1; }); } catch (eD) {}
  var c = _glHbCfg_(); if (!c.ssId) return { mirrored: 0, rows: 0 };
  if (codes) {   // قيود الطرف المطلوب فقط
    var mine = {}; _glRows_('lines').forEach(function (l) { if (codes[_glStr_(l[4])]) mine[_glStr_(l[0])] = 1; });
    Object.keys(ids).forEach(function (id) { if (!mine[id]) delete ids[id]; });
  }
  var ss = SpreadsheetApp.openById(c.ssId), n = 0, rows = 0;
  Object.keys(ids).forEach(function (id) {
    var r = _glHbMirrorSync_(id, { cutK: cutK, parties: parties, fx: fx, ss: ss, dup: dup });
    if (r && r.written) { n++; rows += r.written; }
  });
  // صفوف GL: يتيمة (قيد لم يعد موجوداً بالسجل) ⇒ تُحذف
  var sh = ss.getSheetByName(c.pay), orphan = 0;
  if (!codes && sh && sh.getLastRow() >= 2) {
    var keep = {}; _glRows_('hbmir').forEach(function (r) { keep[_glStr_(r[0])] = 1; });
    var del = [];
    sh.getRange(2, 8, sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) {
      var m = String(r[0]).match(/^GL:(.+):\d+$/); if (m && !keep[m[1]]) del.push(i + 2);
    });
    for (var j = del.length - 1; j >= 0; j--) { sh.deleteRow(del[j]); orphan++; }
  }
  return { mirrored: n, rows: rows, orphans: orphan };
}
function _glHbKeepMap_() { var o = {}; try { _glRows_('hbkeep').forEach(function (r) { var k = _glStr_(r[0]); if (k) o[k] = _glStr_(r[1]); }); } catch (e) { } return o; }
function glHbKeepList(authToken) {
  _glPerm_(authToken, 'view', 'hb');
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
  _glPerm_(authToken, 'view', 'hb');
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
    var lg = _glHbLinkOf_(p, rev), manual = !p.linkId && !!lg;
    var e = ents['AUTO:HBP:' + p.id] || (lg ? ents['AUTO:HBL:' + lg] : null);
    return { id: p.id, date: p.date, party: p.party, dir: p.dir, amount: p.amount, note: p.note, qaid: p.qaid, linkId: lg, manualLink: manual,
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
  var lock = _glLock_(); lock.waitLock(30000);
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
  } finally { _glUnlock_(lock); }
}
function _glHbWriteAll_(key, rows) {
  var sh = _glSheet_(key), n = GL_SHEETS_[key].headers.length, last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, n).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, n).setValues(rows);
}
// مراجعة الدفعات: [{id, cash, cur, amount, rate}] — cash فارغ يحذف المراجعة (ترجع لتحت التسوية)
function glHbSavePay(authToken, rows) {
  var session = _glPerm_(authToken, 'add', 'hb');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    _glAutoRoles_(session.username, false); _GL_ACC_MEMO_ = null;   // حسابات الأدوار (تحت التسوية/عبر الوكيل…) قد تُختار هنا قبل أول مزامنة
    var accs = _glAccounts_().map, rev = _glHbPayRev_(), now = _glNow_(), n = 0;
    (rows || []).forEach(function (x) {
      var id = _glStr_(x.id); if (!id) return;
      var lg = (rev[id] && rev[id].linkGroup) || '';   // 🔗 (V4.264) لا يمس «حفظ/اعتماد الدفعات» الربط اليدوي — كان يُمسح فتعود الدفعتان قيدين منفصلين على تحت التسوية
      var party = _glStr_(x.party);
      if (party) { var pa = accs[party]; if (!pa || pa.isGroup) throw new Error('حساب الطرف ' + party + ' غير صالح'); }
      if (!_glStr_(x.cash) && !party) {
        if (lg) { rev[id] = Object.assign({}, rev[id], { by: session.username, at: now }); n++; return; }   // دفعة مرتبطة: أبقِها كما هي
        delete rev[id]; n++; return;
      }
      var a = _glStr_(x.cash) ? accs[x.cash] : null;
      if (_glStr_(x.cash) && (!a || a.isGroup)) throw new Error('الحساب النقدي ' + x.cash + ' غير صالح');
      var cur = _glCur_(x.cur || (a && a.currency) || 'SAR');
      if (a && a.currency && a.currency !== cur) throw new Error('عملة الحساب «' + a.name + '» هي ' + a.currency);
      rev[id] = { cash: _glStr_(x.cash), cur: cur, amount: _glR2_(_glNum_(x.amount)), rate: _glNum_(x.rate), by: session.username, at: now, party: party, linkGroup: lg }; n++;
    });
    _glHbWriteAll_('hbpay', Object.keys(rev).map(function (id) { var r = rev[id]; return [id, r.cash, r.cur, r.amount || '', r.rate || '', r.by, r.at, r.party || '', r.linkGroup || '']; }));
    logChange_(session.username, 'مراجعة دفعات برنامج الحجوزات', 'GL:hb', '-', '-', n + ' دفعة');
    return { success: true, saved: n };
  } finally { _glUnlock_(lock); }
}
// 🔗 (V4.239) ربط دفعتين (أو أكثر) من برنامج الحجوزات يدوياً كـ«دفعة مرتبطة»: تحويل مباشر بين الطرفين بلا مرور
// على أي حساب نقدي — لحالة دفعتين منفصلتين بسجل الدفعات (برنامج الحجوزات لا يدعم ربطهما هناك) تمثلان نفس التحويل
// الواحد فعلياً (مثلاً: استلمنا من مورد أ + دفعنا لمورد ب بنفس المبلغ تقريباً = تحويل مباشر بينهما)
function glHbLinkPays(authToken, ids) {
  var session = _glPerm_(authToken, 'edit', 'hb');
  ids = (ids || []).map(_glStr_).filter(String);
  if (ids.length < 2) throw new Error('اختر دفعتين على الأقل');
  // 🔒 (V4.265) الكتابة + التطبيق داخل قفل واحد (waitLock): كان الكتابة بلا قفل ثم تطبيق بـ tryLock
  // يفشل صامتاً عند انشغال الخادم ⇒ يُكتب الربط ولا يُعاد بناء القيد فتبقى الدفعتان قيدين منفصلين (أو يختفيان)
  var lock = _glLock_(); lock.waitLock(45000);
  try {
    var H = _glHbRead_(), rev = _glHbPayRev_(), by = {}; H.pays.forEach(function (p) { by[p.id] = p; });
    ids.forEach(function (id) {
      var p = by[id]; if (!p) throw new Error('الدفعة ' + id + ' غير موجودة');
      if (_glHbLinkOf_(p, rev)) throw new Error('الدفعة ' + id + ' مرتبطة بالفعل');
    });
    var key = 'm' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    ids.forEach(function (id) { rev[id] = Object.assign({}, rev[id] || {}, { by: session.username, at: _glNow_(), linkGroup: key }); });
    _glHbWriteAll_('hbpay', Object.keys(rev).map(function (k) { var r = rev[k]; return [k, r.cash || '', r.cur || '', r.amount || '', r.rate || '', r.by, r.at, r.party || '', r.linkGroup || '']; }));
    logChange_(session.username, 'ربط دفعات برنامج الحجوزات يدوياً', 'GL:hb', '-', '-', ids.length + ' دفعة — ' + ids.join('، '));
    // 🔗 (V4.264) تطبيق فوري بلا اعتماد منفصل: يُلغى قيدا الدفعتين ويُنشأ قيد واحد مرتبط الآن
    var applied = _glHbApplyKeysLocked_(session.username, ['AUTO:HBL:' + key].concat(ids.map(function (id) { return 'AUTO:HBP:' + id; })));
    return { success: true, key: key, n: ids.length, applied: applied };
  } finally { _glUnlock_(lock); }
}
// يطبّق مفاتيح قيود حجوزات بعينها فوراً (بلا اعتماد) — لربط/فك ربط الدفعات من شاشة المراجعة. القفل محجوز من المستدعي
function _glHbApplyKeysLocked_(user, keys) {
  try {
    var only = {}; keys.forEach(function (k) { only[k] = 1; });
    var r = _glAutoRun_(user, false, { bypass: true, onlyKeys: only });
    return { created: r.created, voided: r.voided, updated: r.updated };
  } catch (e) { Logger.log('_glHbApplyKeysLocked_: ' + e.message); try { CacheService.getScriptCache().put('gl_dirty', String(Date.now()), 21600); } catch (e0) {} return null; }
}
// 🗑️ (V4.258) حذف دفعة مكررة من سجل الدفعات ببرنامج الحجوزات نفسه (من شاشة مراجعة الدفعات) — قيدها الآلي يُلغى بالمزامنة التالية
function glHbDeletePays(authToken, ids) {
  var session = _glPerm_(authToken, 'delete', 'hb');
  ids = (ids || []).map(_glStr_).filter(String); if (!ids.length) throw new Error('اختر دفعة على الأقل');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var c = _glHbCfg_(); if (!c.ssId) throw new Error('ملف الحجوزات غير مربوط');
    var sh = SpreadsheetApp.openById(c.ssId).getSheetByName(c.pay); if (!sh) throw new Error('لم أجد شيت «' + c.pay + '»');
    var last = sh.getLastRow(); if (last < 2) throw new Error('سجل الدفعات فارغ');
    var want = {}; ids.forEach(function (id) { want[id] = 1; });
    var vals = sh.getRange(2, 1, last - 1, 10).getValues(), rows = [], gone = [];
    vals.forEach(function (r, i) { var id = _glStr_(r[7]) || ('row' + (i + 2)); if (want[id]) { rows.push(i + 2); gone.push(id + ' — ' + _glStr_(r[1]) + ' ' + _glNum_(r[3])); } });
    if (!rows.length) throw new Error('لم أجد الدفعات المحددة بالسجل (ربما حُذفت أو تغيّر ترتيبها — حدّث الشاشة)');
    rows.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    var rev = _glHbPayRev_(), ch = false; ids.forEach(function (id) { if (rev[id]) { delete rev[id]; ch = true; } });
    if (ch) _glHbWriteAll_('hbpay', Object.keys(rev).map(function (k) { var r = rev[k]; return [k, r.cash || '', r.cur || '', r.amount || '', r.rate || '', r.by, r.at, r.party || '', r.linkGroup || '']; }));
    _GL_HB_MEMO_ = null; try { CacheService.getScriptCache().remove(_glCK_('hbread')); } catch (e) {}
    logChange_(session.username, 'حذف دفعات من سجل دفعات الحجوزات', 'GL:hb', '-', gone.join(' | ').slice(0, 900), '-');
    return { success: true, n: rows.length };
  } finally { _glUnlock_(lock); }
}
/* 🔍 (V4.262) فحص الدفعات المكررة والمتقابلة عبر «دفعات تحت التسوية» (حسابات العملاء) و«تحت التسوية — حجوزات الفنادق»
   و«مقاصة عبر الوكلاء»: نفس المبلغ تقريباً (±1% أو 50 جنيه معادل) خلال 7 أيام.
   • متقابلة (داخل الحساب الوسيط وخارج منه): دفعة واحدة فعلية مسجلة مرتين من طرفيها — مثل «دفعنا للمورد» ببرنامج الحجوزات
     + «استلمنا من العميل» بحسابات العملاء لنفس التحويل ⇒ المقاصة تجعل الطرفين يقابلان بعضهما فيصفر الوسيط وتصبح الحركة
     الفعلية تحويلاً من العميل للمورد (دفعتا حجوزات ⇒ ربط كدفعة مرتبطة بقيد واحد · دفعة عميل ⇒ توجيهها لنفس وسيط دفعة الحجوزات)
   • مكررة (نفس الاتجاه ونفس الطرف تقريباً): تسجيل مزدوج لنفس الدفعة ⇒ حذف إحداهما */
function glDupScan(authToken, opts) {
  _glPerm_(authToken, 'view', 'hb');
  opts = opts || {};
  var roles = _glAutoRoles_('', true), accs = _glAccounts_().map, fx = _glFxDailyMap_(), rates = _glRates_(), items = [];
  var base = function (amt, cur, date) { return cur === 'EGP' ? amt : _glR2_(amt * (_glFxRateAt_(cur, date, fx).rate || rates[cur] || 1)); };
  // 1) دفعات حسابات العملاء غير الموجَّهة (تحت التسوية)
  try {
    var cp = glCpList(authToken).rows;
    cp.forEach(function (x) { if (!x.unsettled || !x.amount) return;
      items.push({ src: 'cp', id: x.payId, entry: x.entryId, date: x.date, party: x.client, amount: Math.abs(x.amount), cur: x.currency || 'EGP', sign: x.amount > 0 ? 1 : -1,
        susp: x.cash, desc: _glCleanDesc_(x.desc), base: base(Math.abs(x.amount), x.currency || 'EGP', x.date) }); });
  } catch (e) {}
  // 2) دفعات برنامج الحجوزات على «تحت التسوية» أو «مقاصة عبر الوكلاء» (غير المرتبطة)
  if (_glHbOn_()) try {
    var H = _glHbRead_(), rev = _glHbPayRev_(), hbOnlyK = _glHbOnlyK_();
    H.pays.forEach(function (p) {
      if (_glHbLinkOf_(p, rev) || GL_HB_MANUAL_DIRS_[p.dir]) return;
      var r = rev[p.id], cash = r && r.cash && accs[r.cash] ? r.cash : roles.hb_cash;
      if (cash !== roles.hb_cash && cash !== roles.hb_via) return;
      var cur = (r && r.cur) || 'SAR', amt = r && r.amount && r.cur === cur && cur !== 'SAR' ? r.amount : p.amount;
      items.push({ src: 'hb', id: p.id, date: p.date, party: p.party, amount: amt, cur: cur, sign: GL_HB_CREDIT_DIRS_[p.dir] ? 1 : -1, susp: cash,
        desc: _glStr_(p.note) + (p.dir ? ' (' + p.dir + ')' : ''), base: base(amt, cur, p.date), via: cash === roles.hb_via });
    });
  } catch (e2) {}
  var dk = function (d) { var m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5 : 0; };
  var nm = function (s) { return _glNorm_ ? _glNorm_(s) : String(s || ''); };
  var toks = function (s) { return nm(s).split(/\s+/).filter(function (t) { return t.length >= 3; }); };
  var simParty = function (a, b) { var A = toks(a.party), B = toks(b.party + ' ' + b.desc); return A.some(function (t) { return B.indexOf(t) >= 0; }) ? 1 : 0; };
  var pairs = [];
  items.forEach(function (a, i) { a.k = dk(a.date); });
  for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
    var a = items[i], b = items[j]; if (a.src === 'cp' && b.src === 'cp' && a.sign === b.sign && a.id === b.id) continue;
    var dd = Math.abs(a.k - b.k); if (dd > 7) continue;
    var same = a.cur === b.cur ? Math.abs(a.amount - b.amount) <= Math.max(1, a.amount * 0.005) : false;
    var close = Math.abs(a.base - b.base) <= Math.max(50, Math.max(a.base, b.base) * 0.01);
    if (!same && !close) continue;
    var sp = simParty(a, b) || simParty(b, a);
    var type = a.sign !== b.sign ? 'offset' : 'dup';
    if (type === 'dup' && !sp && !(same && dd === 0)) continue;   // مكرر = نفس الطرف (أو نفس المبلغ واليوم تماماً)
    if (type === 'offset' && a.src === 'cp' && b.src === 'cp') continue;
    var score = (same ? 40 : 25) + (dd === 0 ? 30 : Math.max(0, 25 - dd * 4)) + (sp ? 20 : 0) + (type === 'offset' && (a.via || b.via) ? 10 : 0);
    pairs.push({ type: type, score: Math.min(100, score), a: a, b: b, dd: dd, diff: _glR2_(Math.abs(a.base - b.base)) });
  }
  pairs.sort(function (x, y) { return y.score - x.score; });
  var used = {}, out = [];
  pairs.forEach(function (p) { var ka = p.a.src + p.a.id, kb = p.b.src + p.b.id; if (used[ka] || used[kb]) return; used[ka] = used[kb] = 1; out.push(p); });
  items.forEach(function (x) { delete x.k; });
  var cross = { pairs: [], scanned: 0 };
  try { cross = _glDupCrossScan_(opts); } catch (eX) { cross.error = eX.message; }
  return { success: true, pairs: out.slice(0, 300), scanned: items.length, roles: { hb_cash: roles.hb_cash, hb_via: roles.hb_via, cash: roles.cash }, cross: cross.pairs, crossScanned: cross.scanned, crossErr: cross.error || '' };
}
/* ⧉ (V4.323) دفعة واحدة مسجلة مرتين من مصدرين مختلفين على نفس حساب الطرف — مثل دفعة سُجّلت من شاشة الحجوزات لعميل عمرة
   (يُقيَّد بها حساب العميل دائناً مقابل «تحت التسوية — حجوزات») + نفس الدفعة من شاشة عملاء العمرة موجَّهة لمورد السكن (دائن العميل
   مقابل المورد) ⇒ العميل مُقيَّد له مرتين. الفحص القديم يبحث في الحسابات الوسيطة/النقدية فقط ويتخطى أزواج القيود التلقائية،
   فلم يكن يراها. هنا الفحص على حساب الطرف نفسه (عميل/مورد/وكيل) بنفس الجانب، بين مصدرين مختلفين، بمبلغ متطابق تقريباً خلال
   أيام قليلة. المصادر: 🏨 دفعات الحجوزات (HBP/HBL) · 👤 دفعات عملاء العمرة (CP) · 🏦 شيتات الخزن/البنوك/العهد (CUST) · 🧾 سندات/قيود يدوية */
var GL_DUPX_FAM_LBL_ = { hb: '🏨 دفعة الحجوزات', cp: '👤 دفعة عملاء العمرة', cs: '🏦 صف شيت خزينة/بنك/عهدة', vch: '🧾 سند/قيد يدوي' };
function _glDupxFam_(sk) {
  sk = _glStr_(sk);
  if (/^AUTO:(HBP|HBL):/.test(sk)) return 'hb';
  if (/^AUTO:CP:/.test(sk)) return 'cp';
  if (/^CUST:/.test(sk)) return 'cs';
  if (!sk || /^VCH:/.test(sk)) return 'vch';
  return '';
}
// قيد يدوي «كبير» (افتتاحي/مستورد/إقفال، أو أكثر من 3 أسطر فعلية، أو أكثر من طرفين) ⇒ ليس دفعة منفردة: لا يُفحص ولا يُلغى كله
function _glDupxBig_(type, lines) {
  if (/^(قيد افتتاحي|قيد مستورد|قيد إقفال)$/.test(_glStr_(type))) return true;
  var accM = _glAccounts_().map, n = 0, pt = {};
  (lines || []).forEach(function (l) { var a = accM[_glStr_(l[4])] || {}; if (a.kind === 'fx') return; n++; if (/^(client|supplier|agent)$/.test(a.kind)) pt[_glStr_(l[4])] = 1; });
  return n > 3 || Object.keys(pt).length > 2;
}
function _glDupxPosKey_(sk) { return /^AUTO:CP:#|^AUTO:HBP:row\d+$/.test(_glStr_(sk)); }   // مفتاح موضعي (دفعة بلا معرّف ثابت)
function _glDupxOk_() { var o = {}; try { JSON.parse(_glSettings_().dupx_ok || '[]').forEach(function (k) { o[k] = 1; }); } catch (e) {} return o; }
function _glDupCrossScan_(opts) {
  opts = opts || {};
  var accM = _glAccounts_().map, roles = _glAutoRoles_('', true), days = Math.max(1, Math.min(60, parseInt(_glSettings_().dupx_days, 10) || 10));
  var susp = {}; [roles.cash, roles.hb_cash, roles.hb_via].forEach(function (c) { if (c) susp[c] = 1; });
  var ok = _glDupxOk_(), ents = {};
  _glRows_('entries').forEach(function (r) {
    var id = _glStr_(r[0]); if (!id || _glStr_(r[5]) !== GL_ST_POSTED_) return;
    var fam = _glDupxFam_(r[6]); if (!fam || _glLocked_(r[2])) return;
    ents[id] = { id: id, sk: _glStr_(r[6]), fam: fam, type: _glStr_(r[3]), date: _glDate_(r[2]), desc: _glCleanDesc_(_glStr_(r[4])), trip: _glStr_(r[10]), lines: [] };
  });
  _glRows_('lines').forEach(function (l) { var e = ents[_glStr_(l[0])]; if (e) e.lines.push(l); });
  Object.keys(ents).forEach(function (id) { if (ents[id].fam === 'vch' && _glDupxBig_(ents[id].type, ents[id].lines)) delete ents[id]; });   // 🛡️ (V4.323 مراجعة)
  var dk = function (d) { var m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5) : 0; };
  var kindLbl = function (c) { var a = accM[c] || {}; if (susp[c]) return 'تحت التسوية'; return ({ safe: 'خزينة', bank: 'بنك', custody: 'عهدة', supplier: 'مورد', client: 'عميل', agent: 'وكيل', trip: 'رحلة' })[a.kind] || ''; };
  var buckets = {}, scanned = 0;
  Object.keys(ents).forEach(function (id) {
    var e = ents[id], per = {};
    e.lines.forEach(function (l) { var c = _glStr_(l[4]), a = accM[c]; if (a && /^(client|supplier|agent)$/.test(a.kind)) per[c] = (per[c] || 0) + 1; });
    Object.keys(per).forEach(function (c) {
      if (per[c] > 1) return;   // تحويل عملة على نفس الحساب (سطران للطرف) ليس دفعة
      var l = e.lines.filter(function (x) { return _glStr_(x[4]) === c; })[0], dr = _glNum_(l[5]), cr = _glNum_(l[6]), side = dr ? 'D' : 'C', amt = dr || cr; if (!amt) return;
      var ctr = e.lines.filter(function (x) { var xc = _glStr_(x[4]); return xc !== c && (accM[xc] || {}).kind !== 'fx'; }).map(function (x) { var xc = _glStr_(x[4]); return { code: xc, name: (accM[xc] || {}).name || xc, lbl: kindLbl(xc) }; });
      var it = { id: id, sk: e.sk, fam: e.fam, date: e.date, k: dk(e.date), desc: e.desc, trip: _glStr_(l[11]) || e.trip, acc: c, accName: (accM[c] || {}).name || c, side: side,
        amt: _glR2_(amt), cur: _glCur_(l[7]), base: _glR2_(_glNum_(l[9]) || _glNum_(l[10])), ctr: ctr, suspOnly: ctr.length > 0 && ctr.every(function (x) { return x.lbl === 'تحت التسوية'; }) };
      (buckets[c + '|' + side] = buckets[c + '|' + side] || []).push(it); scanned++;
    });
  });
  var toks = function (s) { return _glNorm_(s).split(/\s+/).filter(function (t) { return t.length >= 3; }); };
  var pairs = [];
  Object.keys(buckets).forEach(function (bk) {
    var L = buckets[bk].sort(function (a, b) { return a.k - b.k; });
    for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length && L[j].k - L[i].k <= days; j++) {
      var a = L[i], b = L[j]; if (a.fam === b.fam || a.id === b.id) continue;
      var same = a.cur === b.cur && Math.abs(a.amt - b.amt) <= Math.max(1, Math.max(a.amt, b.amt) * 0.005);
      var close = a.base > 0 && b.base > 0 && Math.abs(a.base - b.base) <= Math.max(50, Math.max(a.base, b.base) * 0.03);
      if (!same && !close) continue;
      var pk = [a.id, b.id].sort().join('|'); if (ok[pk]) continue;
      var dd = b.k - a.k, ta = toks(a.desc), tb = toks(b.desc), sim = ta.some(function (t) { return tb.indexOf(t) >= 0; });
      var score = (same ? 45 : 25) + (dd === 0 ? 30 : Math.max(0, 26 - dd * 3)) + (sim ? 10 : 0) + (a.trip && a.trip === b.trip ? 10 : 0) + (a.suspOnly !== b.suspOnly ? 5 : 0);
      var keep = a.suspOnly && !b.suspOnly ? 'b' : (b.suspOnly && !a.suspOnly ? 'a' : '');
      pairs.push({ pk: pk, score: Math.min(100, score), dd: dd, a: a, b: b, keep: keep, diff: _glR2_(Math.abs(a.base - b.base)) });
    }
  });
  pairs.sort(function (x, y) { return y.score - x.score; });
  var used = {}, out = [];
  pairs.forEach(function (p) { if (used[p.a.id + '|' + p.a.acc] || used[p.b.id + '|' + p.b.acc]) return; used[p.a.id + '|' + p.a.acc] = used[p.b.id + '|' + p.b.acc] = 1; out.push(p); });
  out.forEach(function (p) { [p.a, p.b].forEach(function (x) {
    delete x.k; x.famLbl = GL_DUPX_FAM_LBL_[x.fam];
    // طرق الإلغاء المتاحة: «من المصدر» لدفعة عملاء العمرة ولدفعة حجوزات منفردة (لا المرتبطة ولا المنقولة من شيت عهدة) — وإلا «إلغاء القيد» فقط
    x.posKey = _glDupxPosKey_(x.sk);   // 🛡️ (V4.323 مراجعة) بلا معرّف ثابت ⇒ لا حذف ولا إلغاء من هنا
    x.canSrc = !x.posKey && (x.fam === 'cp' || (/^AUTO:HBP:/.test(x.sk) && !/^AUTO:HBP:CUSTODY:/.test(x.sk)));
  }); });
  return { pairs: out.slice(0, 200), scanned: scanned };
}
// حل زوج مكرر عبر المصادر: يُبقي قيداً ويلغي الآخر — من مصدره (حذف الدفعة من شاشتها) أو بإلغاء قيده فقط (يبقى المصدر بشاشته)
function glDupCrossResolve(authToken, o) {
  o = o || {};
  var session = requireAuth_(authToken), dropId = _glStr_(o.dropId), keepId = _glStr_(o.keepId), method = o.method === 'src' ? 'src' : 'void';
  if (!dropId || !keepId || dropId === keepId) throw new Error('بيانات الزوج غير مكتملة');
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    var f = _glFindEntry_(dropId), k = _glFindEntry_(keepId);
    if (!f || _glStr_(f.r[5]) !== GL_ST_POSTED_) throw new Error('القيد ' + dropId + ' لم يعد مرحّلاً — حدّث الفحص');
    if (!k || _glStr_(k.r[5]) !== GL_ST_POSTED_) throw new Error('القيد المُبقى ' + keepId + ' لم يعد مرحّلاً — حدّث الفحص');
    if (_glLocked_(f.r[2])) throw new Error('القيد في فترة مقفلة حتى ' + _glSettings_().lockDate);
    var sk = _glStr_(f.r[6]), reason = 'مكرر عبر المصادر مع ' + keepId + (_glStr_(o.note) ? ' — ' + _glStr_(o.note) : ''), warn = '';
    // 🛡️ (V4.323 مراجعة) دفعة بلا معرّف ثابت (مفتاحها موضعها بالشيت: AUTO:CP:#n / AUTO:HBP:rowN) لا تُحذف ولا يُلغى قيدها من هنا —
    // الحذف قد يصيب صفاً آخر بعد انزياح الصفوف، وقاعدة الإلغاء الدائمة تُثبَّت على الموضع فتُخفي دفعة أخرى تنتقل إليه
    if (_glDupxPosKey_(sk)) throw new Error('هذه الدفعة بلا معرّف ثابت (مفتاحها موضع صفها) — احذفها أو عدّلها من شاشتها نفسها');
    // 🛡️ (V4.323 مراجعة) القيد المعدَّل يدوياً يبقى إلغاؤه للاعتماد لمن لا يملك صلاحية تعديل التلقائي (كما بالحذف من شاشة المصدر)
    var voidNow = function (fx) { if (!fx || _glStr_(fx.r[5]) !== GL_ST_POSTED_) return; if (_glCanEditAuto_(session) || !(_glOvrMap_()[sk] || {}).freeze) _glVoidPostedNow_(fx, session.username, reason); else warn = 'حُذفت الدفعة من مصدرها — قيدها معدَّل يدوياً فإلغاؤه ينتظر الاعتماد بقائمة «⏳ تغييرات تنتظر الاعتماد»'; };
    if (method === 'src') {
      if (/^AUTO:CP:/.test(sk)) {
        glCpDelete(authToken, [sk.slice(8)]);
        // الحذف يُلغي القيد بتشغيل مقصور — لكنه قد يبقى مرحّلاً (معدَّل يدوياً ⇒ يذهب للاعتماد، أو مصدره محذوف أصلاً) ⇒ يُلغى الآن
        voidNow(_glFindEntry_(dropId));
      }
      else if (/^AUTO:HBP:/.test(sk) && !/^AUTO:HBP:CUSTODY:/.test(sk)) {
        glHbDeletePays(authToken, [sk.slice(9)]);
        voidNow(_glFindEntry_(dropId));   // يُلغى قيدها الآن (لا انتظار للمزامنة)
      } else throw new Error('هذا النوع لا يُحذف من مصدره هنا — استخدم «إلغاء القيد فقط»');
    } else {
      // 🛡️ (V4.323 مراجعة) قيد يدوي متعدد الأطراف/الأسطر (افتتاحي، تسوية جماعية…) لا يُلغى كله لأجل سطر واحد
      if (_glDupxFam_(sk) === 'vch' && _glDupxBig_(_glStr_(f.r[3]), _glLinesOf_(dropId))) throw new Error('القيد ' + dropId + ' يحوي أطرافاً/أسطراً أخرى — لا يُلغى كله هنا؛ افتحه وعدّل سطر الطرف المكرر يدوياً');
      // 🛡️ (V4.323 مراجعة) صف شيت خزينة/بنك/عهدة لا يُلغى قيده إلا لو القيد المُبقى نفسه على نفس حساب النقدية — وإلا تختفي
      // حركة البنك/الخزينة من الحسابات بينما الشيت يُظهرها (والإبقاء الصحيح عندها: قيد الشيت، أو توجيه دفعة العميل لهذا الحساب أولاً)
      var mC = sk.match(/^CUST:(.+)$/);
      if (mC && !_glLinesOf_(keepId).some(function (l) { return _glStr_(l[4]) === mC[1]; }))
        throw new Error('القيد المُبقى ' + keepId + ' ليس على حساب ' + (((_glAccounts_().map[mC[1]] || {}).name) || mC[1]) + ' — إلغاء قيد الشيت يُخفي حركة النقدية. أبقِ قيد الشيت بدلاً منه، أو وجّه الدفعة الأخرى لنفس الحساب أولاً');
      glVoidEntry(authToken, dropId, reason);
      // صف الشيت ⇒ يُعاد ربط رقم القيد بالصف بالقيد المُبقى (كما بفحص النقدية) فلا يظهر بالمشاكل ولا يُسجَّل من جديد
      if (mC) { try { _glDupRelinkSheetRow_(mC[1], dropId, keepId); } catch (eR) { warn = 'أُلغي القيد لكن تعذّرت إعادة ربط صف الشيت (' + eR.message + ') — اكتب رقم القيد ' + keepId + ' بدلاً من ' + dropId + ' بالشيت يدوياً'; } }
    }
    logChange_(session.username, 'حل دفعة مكررة عبر المصادر', 'GL:' + dropId, 'المُبقى ' + keepId, sk, method === 'src' ? 'حُذفت من مصدرها' : 'أُلغي قيدها');
    return { success: true, method: method, warn: warn };
  } finally { _glUnlock_(lock); }
}
// «ليست مكررة» ⇒ لا يظهر الزوج مرة أخرى بالفحص
function glDupCrossDismiss(authToken, pk) {
  var session = _glPerm_(authToken, 'view', 'hb');
  pk = _glStr_(pk); if (!/^[^|]+\|[^|]+$/.test(pk)) throw new Error('زوج غير صالح');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var arr = []; try { arr = JSON.parse(_glSettings_().dupx_ok || '[]'); } catch (e) {}
    if (arr.indexOf(pk) < 0) arr.push(pk);
    _glSetSetting_('dupx_ok', JSON.stringify(arr.slice(-1500)));
    logChange_(session.username, 'تمييز زوج دفعات كغير مكرر', 'GL:dupx', '-', '-', pk);
    return { success: true };
  } finally { _glUnlock_(lock); }
}
// إلغاء قيد مرحّل فوراً (بعد حذف مصدره) — نفس أثر glVoidEntry للمرحّل بلا شرط صلاحية تعديل التلقائي (المصدر حُذف بصلاحيته)
function _glVoidPostedNow_(f, user, reason) {
  var id = _glStr_(f.r[0]), sk = _glStr_(f.r[6]), sh = _glSheet_('entries');
  sh.getRange(f.row, 6).setValue(GL_ST_VOID_);
  sh.getRange(f.row, 17, 1, 3).setValues([[user, _glNow_(), reason]]);
  _glSetLinesStatus_([id], GL_ST_VOID_);
  if (/^AUTO:/.test(sk)) { var om = _glOvrMap_(); (om[sk] = om[sk] || { acc: [], hdr: null, freeze: null, vd: null }).vd = { by: user, at: _glNow_(), note: reason }; _glOvrSave_(om); }
  _glPendingDrop_((/^AUTO:/.test(sk) ? [sk] : []).concat(['CCY:' + id]));
  try { _glSyncVoucherPays_(id, user); } catch (e) {}
}
// مقاصة دفعة عميل (تحت التسوية) مع دفعة حجوزات متقابلة: توجيه دفعة العميل لنفس الحساب الوسيط لدفعة الحجوزات ⇒ يصفر
function glDupOffsetCp(authToken, cpId, hbId) {
  _glPerm_(authToken, 'edit', 'hb');
  var roles = _glAutoRoles_('', true), rev = _glHbPayRev_(), accs = _glAccounts_().map, r = rev[_glStr_(hbId)];
  var susp = r && r.cash && accs[r.cash] ? r.cash : roles.hb_cash;
  return glCpDirect(authToken, [_glStr_(cpId)], susp);
}
function glHbUnlinkPay(authToken, id) {
  var session = _glPerm_(authToken, 'edit', 'hb');
  id = _glStr_(id);
  var lock = _glLock_(); lock.waitLock(45000);   // 🔒 (V4.265) الكتابة + التطبيق ذرّيان داخل قفل واحد
  try {
    var rev = _glHbPayRev_();
    if (!rev[id] || !rev[id].linkGroup) throw new Error('الدفعة غير مرتبطة يدوياً');
    var grp = rev[id].linkGroup, mates = Object.keys(rev).filter(function (k) { return rev[k].linkGroup === grp; });
    rev[id].linkGroup = ''; rev[id].by = session.username; rev[id].at = _glNow_();
    _glHbWriteAll_('hbpay', Object.keys(rev).map(function (k) { var r = rev[k]; return [k, r.cash || '', r.cur || '', r.amount || '', r.rate || '', r.by, r.at, r.party || '', r.linkGroup || '']; }));
    logChange_(session.username, 'فك ربط دفعة برنامج حجوزات', 'GL:hb', '-', '-', id);
    // (V4.264) تطبيق فوري: يُلغى القيد المرتبط وتعود الدفعات قيوداً منفصلة الآن
    var applied = _glHbApplyKeysLocked_(session.username, ['AUTO:HBL:' + grp].concat(mates.map(function (k) { return 'AUTO:HBP:' + k; })));
    return { success: true, applied: applied };
  } finally { _glUnlock_(lock); }
}
// تحديد رحلة حجز يدوياً: trip='' يعيد التلقائي، '-' بلا رحلة
function glHbSaveTrip(authToken, rows) {
  var session = _glPerm_(authToken, 'add', 'hb');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var ov = {}, now = _glNow_(), meta = {};
    _glRows_('hbtrip').forEach(function (r) { var k = _glStr_(r[0]); if (k) { ov[k] = _glStr_(r[1]); meta[k] = [_glStr_(r[2]), _glStr_(r[3])]; } });
    (rows || []).forEach(function (x) { var k = _glStr_(x.key); if (!k) return; if (x.trip === null || _glStr_(x.trip) === '') { delete ov[k]; return; } ov[k] = _glStr_(x.trip); meta[k] = [session.username, now]; });
    _glHbWriteAll_('hbtrip', Object.keys(ov).map(function (k) { return [k, ov[k], meta[k][0], meta[k][1]]; }));
    logChange_(session.username, 'ربط حجوزات الفنادق بالرحلات', 'GL:hb', '-', '-', (rows || []).length + ' حجز');
    return { success: true };
  } finally { _glUnlock_(lock); }
}
// المطابقة: رصيد كل طرف بمنطق كشف الحساب ببرنامج الحجوزات ↔ رصيد حسابه من قيود الحجوزات بالدفتر (بالريال)
function glHbReconcile(authToken) {
  _glPerm_(authToken, 'view', 'hb');
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
  // (V4.241) «إيرادات السكن» صار تجميعياً بالدليل ⇒ الترحيل لأول حساب فرعي تحته (يفضَّل ما اسمه به «سكن»)
  var tgt = roles.hb_rev, ta = accs.map[tgt];
  if (ta && ta.isGroup) {
    var kids = accs.list.filter(function (x) { return x.parent === tgt && !x.isGroup && x.active !== false && x.kind !== 'hbrev'; });
    var pick = kids.filter(function (x) { return /سكن/.test(x.name); })[0] || kids[0];
    tgt = pick ? pick.code : '';
  }
  return { date: d, rows: rows, total: tot, target: tgt, targetName: tgt ? (accs.map[tgt] || {}).name : '⚠️ «إيرادات السكن» حساب تجميعي بلا حساب فرعي — أضف حساباً فرعياً تحته أولاً' };
}
function glHbSeasonPreview(authToken, date) { _glPerm_(authToken, 'view', 'hb'); _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null; var r = _glHbSeasonPlan_(date); r.success = true; return r; }
function glHbSeasonClose(authToken, date) {
  var session = _glAdminPerm_(authToken);
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    _GL_ACC_MEMO_ = null; _GL_SET_MEMO_ = null;
    var P = _glHbSeasonPlan_(date);
    if (!P.rows.length) throw new Error('لا توجد أرباح موردين غير مرحّلة حتى ' + P.date);
    if (!P.target) throw new Error(P.targetName);
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
  } finally { _glUnlock_(lock); }
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
  _glPerm_(authToken, 'view', 'hb');
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
  _glPerm_(authToken, 'view', 'hb');
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
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var sh = _glSheet_('hbchar'), rows = _glHbCharterRows_(), id = _glStr_(c.id) || ('CH' + Date.now().toString(36).toUpperCase());
    var row = [id, name, _glStr_(c.hotel), _glStr_(c.city), from, to, _glNum_(c.rooms), _glR2_(_glNum_(c.value)), _glCur_(c.cur || 'SAR'), _glStr_(c.notes), session.username, _glNow_()];
    var ex = rows.filter(function (x) { return x.id === id; })[0];
    if (ex) sh.getRange(ex._row, 1, 1, row.length).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    logChange_(session.username, ex ? 'تعديل عقد شارت' : 'إضافة عقد شارت', 'GL:hbchar', '-', '-', name + ' ' + from + ' → ' + to + ' — ' + c.rooms + ' غرفة');
    return { success: true, id: id };
  } finally { _glUnlock_(lock); }
}
function glHbDeleteCharter(authToken, id) {
  var session = _glPerm_(authToken, 'delete', 'hb');
  var r = _glHbCharterRows_().filter(function (x) { return x.id === _glStr_(id); })[0];
  if (!r) throw new Error('العقد غير موجود');
  _glSheet_('hbchar').deleteRow(r._row);
  logChange_(session.username, 'حذف عقد شارت', 'GL:hbchar', '-', '-', r.name + ' ' + r.from + ' → ' + r.to);
  return { success: true };
}
// تسوية شارت: المدفوع للشارت ولم يُستهلك بحجوزات (غرف غير مستغلة) يُحمَّل تكلفةً نهاية العقد — قيد يومية مرحّل
function glHbCharterSettle(authToken, code, date, amount, note) {
  var session = _glPerm_(authToken, 'edit', 'hb');
  var lock = _glLock_(); lock.waitLock(30000);
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
  } finally { _glUnlock_(lock); }
}

/* ============================================================================
   📲 (V4.254) بوت الحسابات — نفس بوت الحجوزات (توكن واحد) بمجموعة ثانية خاصة بالحسابات
   • تنبيهات تُختار من الإعدادات (سند/قيد جديد فوق حد أدنى، تعديل، إلغاء/حذف، عهد تحتاج مراجعة، تغييرات بانتظار
     الاعتماد، ملخص يومي للنقدية، إصدار كشف) — تُدرَج في طابور سريع (بلا انتظار تليجرام وقت الحفظ) وتُرسَل كل دقيقة
     من نفس مهمة البوت الدورية.
   • أوامر: في مجموعة الحسابات بالكلمة العربية أو بالأمر (/glbal …)، وفي المحادثة الخاصة بالأمر فقط ولموظف مربوط
     بالبوت ولديه صلاحية عرض الحسابات العامة. لا تظهر بيانات الحسابات في أي مجموعة أخرى.
   • قابل للتوسع: كل تنبيه/أمر سطر في GLBOT_EVENTS_ / GLBOT_CMDS_ + دالة.
   ============================================================================ */
var GLBOT_EVENTS_ = [
  ['vch_new', 'سند أو قيد جديد مرحّل', true], ['entry_edit', 'تعديل قيد مرحّل', true], ['entry_void', 'إلغاء أو حذف قيد', true],
  ['custody_err', 'صفوف عهدة لم تُقيَّد (تحتاج مراجعة)', true], ['pending', 'تغييرات تنتظر الاعتماد', false],
  ['daily_cash', 'ملخص يومي لأرصدة الخزائن والبنوك والعهد', true], ['stmt', 'إصدار كشف حساب', false]
];
var GLBOT_CMDS_ = [   // [مفتاح، أمر، كلمة عربية (بمجموعة الحسابات)، شرح]
  ['help', '/gl', 'حسابات', 'قائمة أوامر الحسابات'], ['bal', '/glbal', 'رصيد', 'رصيد حساب: رصيد اسم العميل أو الكود'],
  ['cash', '/cash', 'خزينة', 'أرصدة الخزائن والبنوك'], ['custody', '/custody', 'عهد', 'أرصدة العهد'],
  ['stmt', '/glst', 'كشف', 'آخر 15 حركة لحساب: كشف اسم الحساب'], ['entry', '/entry', 'قيد', 'تفاصيل قيد أو سند: قيد JE-000123 أو REC-00012'],
  ['pending', '/pending', 'اعتماد', 'عدد التغييرات بانتظار الاعتماد'], ['id', '/glid', '', 'رقم هذه المحادثة (لضبط مجموعة الحسابات)']
];
function _glBotCfg_() {
  var c = {}; try { c = JSON.parse(_glSettings_().bot_gl || '{}') || {}; } catch (e) { c = {}; }
  var ev = {}; GLBOT_EVENTS_.forEach(function (x) { ev[x[0]] = c.events && c.events[x[0]] !== undefined ? !!c.events[x[0]] : x[2]; });
  var cm = {}; GLBOT_CMDS_.forEach(function (x) { cm[x[0]] = c.cmds && c.cmds[x[0]] !== undefined ? !!c.cmds[x[0]] : true; });
  return { enabled: !!c.enabled, chatId: _glStr_(c.chatId), title: _glStr_(c.title), minAmount: _glNum_(c.minAmount) || 0,
    dailyHour: c.dailyHour === undefined || c.dailyHour === '' ? 21 : Math.max(0, Math.min(23, parseInt(c.dailyHour, 10) || 0)), events: ev, cmds: cm,
    token: _glStr_(PropertiesService.getScriptProperties().getProperty('GLBOT_TOKEN') || '') };   // (V4.261) بوت حسابات مستقل اختياري
}
function glBotGet(authToken) {
  _glAdminPerm_(authToken);
  var hb = {}; try { hb = typeof tgCfg_ === 'function' ? tgCfg_() : {}; } catch (e) {}
  var cfg = _glBotCfg_(), own = !!cfg.token; cfg.token = own ? '••••' + cfg.token.slice(-4) : '';
  return { success: true, cfg: cfg, events: GLBOT_EVENTS_, cmds: GLBOT_CMDS_, own: own,
    hasToken: own || !!(typeof tgToken_ === 'function' && tgToken_()), hbChat: _glStr_(hb.chatId), hbTitle: _glStr_(hb.chatTitle) };
}
function glBotSave(authToken, c) {
  var session = _glAdminPerm_(authToken);
  c = c || {};
  var o = { enabled: !!c.enabled, chatId: _glStr_(c.chatId), title: _glStr_(c.title), minAmount: _glNum_(c.minAmount) || 0,
    dailyHour: Math.max(0, Math.min(23, parseInt(c.dailyHour, 10) || 0)), events: c.events || {}, cmds: c.cmds || {} };
  if (o.enabled && !/^-?\d+$/.test(o.chatId)) throw new Error('رقم مجموعة الحسابات غير صحيح — أضف البوت للمجموعة وأرسل فيها /glid لمعرفة الرقم');
  _glSetSetting_('bot_gl', JSON.stringify(o));
  // (V4.261) توكن بوت حسابات مستقل (اختياري): فارغ = نفس بوت الحجوزات · «-» = حذف التوكن والعودة لبوت الحجوزات
  var tk = _glStr_(c.token);
  if (tk === '-') PropertiesService.getScriptProperties().deleteProperty('GLBOT_TOKEN');
  else if (tk && tk.indexOf('••••') !== 0) {
    if (!/^\d+:[\w-]{20,}$/.test(tk)) throw new Error('توكن البوت غير صحيح — انسخه كما هو من BotFather');
    PropertiesService.getScriptProperties().setProperty('GLBOT_TOKEN', tk);
  }
  logChange_(session.username, 'إعدادات بوت الحسابات', 'GL:bot', '-', '-', (o.enabled ? 'مفعّل' : 'متوقف') + ' — ' + o.chatId);
  return { success: true, cfg: _glBotCfg_() };
}
// 🔔 (V4.324) تفعيل/تعطيل أحداث بوت الحسابات من «مركز التنبيهات» بالإعدادات — يدمج في events فقط
function _glBotSetEventFlags_(flags) {
  _GL_SET_MEMO_ = null;
  var c = {}; try { c = JSON.parse(_glSettings_().bot_gl || '{}') || {}; } catch (e) { c = {}; }
  var cur = _glBotCfg_().events, n = 0; c.events = c.events || {};
  GLBOT_EVENTS_.forEach(function (x) { if (flags && flags.hasOwnProperty(x[0]) && !!flags[x[0]] !== !!cur[x[0]]) { c.events[x[0]] = !!flags[x[0]]; n++; } });
  if (n) { _glSetSetting_('bot_gl', JSON.stringify(c)); _GL_SET_MEMO_ = null; }
  return n;
}
function glBotTest(authToken) {
  _glAdminPerm_(authToken);
  var c = _glBotCfg_();
  if (!c.chatId) throw new Error('اكتب رقم مجموعة الحسابات أولاً');
  _glBotSend_(c.chatId, '✅ <b>بوت الحسابات يعمل</b>\nهذه مجموعة الحسابات — اكتب <code>حسابات</code> لقائمة الأوامر.');
  return { success: true };
}
// (V4.261) طبقة نداء تليجرام لبوت الحسابات: توكنه المستقل لو ضُبط، وإلا نفس بوت الحجوزات (tgApi_)
function _glBotApi_(method, payload) {
  var tok = _glStr_(PropertiesService.getScriptProperties().getProperty('GLBOT_TOKEN') || '');
  if (!tok) { if (typeof tgApi_ !== 'function') throw new Error('بوت برنامج الحجوزات غير مركَّب بالمشروع'); return tgApi_(method, payload); }
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/' + method, { method: 'post', muteHttpExceptions: true, payload: payload });
  var body = {}; try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !body.ok) throw new Error('تليجرام(' + method + '): ' + (body.description || ('HTTP ' + res.getResponseCode())));
  return body.result;
}
function _glBotSend_(chatId, text, kb) {
  var p = { chat_id: String(chatId), text: String(text || '').slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: 'true' };
  if (kb) p.reply_markup = JSON.stringify(kb);
  return _glBotApi_('sendMessage', p);
}
function _glBotEdit_(chatId, msgId, text, kb) {
  var p = { chat_id: String(chatId), message_id: String(msgId), text: String(text || '').slice(0, 4090), parse_mode: 'HTML', disable_web_page_preview: 'true' };
  p.reply_markup = JSON.stringify(kb || { inline_keyboard: [] });
  try { return _glBotApi_('editMessageText', p); } catch (e) { if (!/not modified/i.test(e.message)) throw e; }
}
// 👤 (V4.290) مثل بوت الحجوزات: في المجموعة يُكتب اسم من ضغط الزر أو أرسل الأمر قبل الرد (واسم دخوله بالبرنامج إن كان مربوطاً)
function _glBotWhoName_(from) {
  var n = (((from && from.first_name) || '') + ' ' + ((from && from.last_name) || '')).trim() || (from && from.username ? '@' + from.username : 'مستخدم');
  try { var u = _glBotTgUser_(from); if (u && u.username && n.indexOf(u.username) < 0) n += ' (' + u.username + ')'; } catch (e) {}
  return n;
}
function _glBotAnnounce_(chatId, chat, from, label) {
  if (chat && chat.type === 'private') return;
  try { _glBotSend_(chatId, '👤 <b>' + _glBotEsc_(_glBotWhoName_(from)) + '</b> طلب: ' + label); } catch (e) {}
}
function _glBotAns_(cbId, text, alert) { try { _glBotApi_('answerCallbackQuery', { callback_query_id: cbId, text: String(text || '').slice(0, 190), show_alert: alert ? 'true' : 'false' }); } catch (e) {} }
function _glBotDoc_(chatId, blob, caption, kb) {
  // (V4.290) نفس رافع بوت الحجوزات: اسم الملف العربي يصل كما هو (للجوال والواتساب والكمبيوتر)
  if (typeof tgSendDocTok_ === 'function') {
    var tok = _glStr_(PropertiesService.getScriptProperties().getProperty('GLBOT_TOKEN') || '') || (typeof tgToken_ === 'function' ? tgToken_() : '');
    if (tok) return tgSendDocTok_(tok, chatId, blob, caption, kb);
  }
  var p = { chat_id: String(chatId), document: blob, caption: String(caption || '').slice(0, 1000), parse_mode: 'HTML' };
  if (kb) p.reply_markup = JSON.stringify(kb);
  return _glBotApi_('sendDocument', p);
}
function _glBotPhoto_(chatId, blob, caption) { return _glBotApi_('sendPhoto', { chat_id: String(chatId), photo: blob, caption: String(caption || '').slice(0, 1000), parse_mode: 'HTML' }); }
// زر ملوّن (حقل style بتليجرام الحديث؛ العملاء الأقدم يتجاهلونه ويبقى الرمز التعبيري يميّزه)
function _glBtn_(t, d, st) { var b = { text: t, callback_data: d }; if (st) b.style = st; return b; }
function _glBotEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// طابور سريع (خصائص السكربت) — لا يُبطئ الحفظ؛ يُفرَّغ كل دقيقة
function _glBotQ_(type, p) {
  try {
    var c = _glBotCfg_(); if (!c.enabled || !c.chatId || !c.events[type]) return;
    if (type === 'vch_new' && c.minAmount && (_glNum_(p && p.base) < c.minAmount)) return;   // أقل من الحد الأدنى (بالمعادل)
    var P = PropertiesService.getScriptProperties(), q = [];
    try { q = JSON.parse(P.getProperty('GLBOT_Q') || '[]') || []; } catch (e) { q = []; }
    q.push({ t: type, p: p || {}, at: Date.now() }); if (q.length > 60) q = q.slice(-60);
    P.setProperty('GLBOT_Q', _glBotQPack_(q));
  } catch (e) { Logger.log('_glBotQ_: ' + e.message); }
}
// (V4.277) حدّ خاصية السكربت ~9KB: يُقلَّص أقدم تفاصيل الأسطر ثم أقدم العناصر — بدل قصّ نص JSON (كان يُفسد الطابور كله)
function _glBotQPack_(q) {
  var js = JSON.stringify(q), i = 0;
  while (js.length > 8500 && i < q.length) { if (q[i].p && q[i].p.ls && q[i].p.ls.length > 3) { q[i].p.lsN = q[i].p.lsN || q[i].p.ls.length; q[i].p.ls = q[i].p.ls.slice(0, 3); } i++; js = JSON.stringify(q); }
  while (js.length > 8500 && q.length > 1) { q.shift(); js = JSON.stringify(q); }
  return js.length > 8500 ? '[]' : js;
}
function _glBotWho_(o, session) { o.by = session && session.username || ''; return o; }
function _glBotEntryInfo_(id, eRow, lRows) {
  var accM = _glAccounts_().map, eo = _glEntryObj_(eRow), names = [];
  (lRows || []).forEach(function (l) { var a = accM[_glStr_(l[4])]; if (a && a.kind !== 'fx') { var n = a.link || a.name; if (names.indexOf(n) < 0) names.push(n); } });
  var maxBase = 0; (lRows || []).forEach(function (l) { maxBase = Math.max(maxBase, _glNum_(l[9])); });
  // 🧾 (V4.277) تفاصيل القيد كاملة لتنبيه تليجرام: كل سطر (الحساب، مدين/دائن، المبلغ بعملته، بيانه، الرحلة/العميل) + التاريخ ووقت التسجيل
  var ls = [];
  (lRows || []).forEach(function (l) {
    var lo = _glLineObj_(l), a = accM[lo.account]; if (!lo.debit && !lo.credit) return;
    ls.push([lo.debit ? 'م' : 'د', (a ? (a.link || a.name) : lo.account).slice(0, 40), _glR2_(lo.debit || lo.credit), lo.currency, String(_glCleanDesc_ ? _glCleanDesc_(lo.desc) : lo.desc || '').slice(0, 70),
      String(lo.trip || lo.client || lo.agent || '').slice(0, 30), lo.currency !== 'EGP' && lo.rate ? lo.rate : '']);
  });
  return { id: id, vno: eo.voucherNo || '', type: eo.type, date: eo.date, desc: _glCleanDesc_ ? _glCleanDesc_(eo.desc) : eo.desc, amt: _glAmtTxt_(lRows, accM),
    parties: names.slice(0, 4).join(' ← '), base: _glR2_(eo.totalBase || maxBase), trip: eo.trip || '', at: eo.updatedAt || eo.postedAt || eo.createdAt || '',
    st: eo.status || '', ls: ls.slice(0, 12), lsN: ls.length };
}
// نص الأسطر لرسالة تليجرام
function _glBotLinesTxt_(p) {
  var E = _glBotEsc_, curL = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' };
  if (!p.ls || !p.ls.length) return '';
  return '\n━━━━━━━━━━━━\n' + p.ls.map(function (l) {
    return (l[0] === 'م' ? '🟢 مدين ' : '🔴 دائن ') + '<b>' + E(l[1]) + '</b>: ' + _glFmtN_(l[2]) + ' ' + (curL[l[3]] || l[3]) + (l[6] ? ' <i>(سعر ' + l[6] + ')</i>' : '') +
      (l[5] ? ' · 🏷️ ' + E(l[5]) : '') + (l[4] ? '\n    📝 ' + E(l[4]) : '');
  }).join('\n') + (p.lsN > p.ls.length ? '\n… و' + (p.lsN - p.ls.length) + ' سطر آخر' : '');
}
function _glBotHead_(p) {
  var E = _glBotEsc_;
  return '\n📅 تاريخ القيد: <b>' + E(p.date || '—') + '</b>' + (p.vno ? ' · 🔖 ' + E(p.vno) : '') + (p.id ? ' · 🆔 ' + E(p.id) : '') +
    '\n💰 ' + E(p.amt) + (p.base ? ' <i>(المعادل ' + _glFmtN_(p.base) + ' جنيه)</i>' : '') +
    '\n👥 ' + E(p.parties) + (p.trip ? '\n🧳 الرحلة: ' + E(p.trip) : '') + (p.desc ? '\n📝 ' + E(p.desc) : '');
}
function _glBotFmt_(it) {
  var p = it.p || {}, E = _glBotEsc_, ref = (p.vno ? p.vno + ' · ' : '') + (p.id || '');
  if (it.t === 'entry_void' && p.accDel) { var d0 = p.accDel;   // 🗂️ (V4.324) حذف حساب من الدليل مع قيوده
    return '🗑️ <b>حذف حساب من دليل الحسابات مع قيوده</b>\n📒 ' + E(d0.code + ' — ' + d0.name) + '\n🧾 قيود محذوفة بكل أطرافها: <b>' + (d0.n || 0) + '</b> (' + (d0.lines || 0) + ' سطراً)' +
      (d0.re ? '\n🔁 قيود أرصدة افتتاحية حُوِّل سطره فيها لفروق الأرصدة الافتتاحية: ' + d0.re : '') + '\n💾 نسخة احتياطية: ' + E(d0.delId) + '\n━━━━━━━━━━━━\n👤 ' + E(p.by) + ' · 🕒 ' + E(_glNow_()); }
  switch (it.t) {
    // (V4.277) بيانات كاملة: النوع والرقم وتاريخ القيد والمبلغ والأطراف والرحلة والبيان + كل الأسطر + المستخدم ووقت التسجيل
    case 'vch_new': return '🧾 <b>' + E(p.type || 'قيد') + ' جديد</b>' + _glBotHead_(p) + _glBotLinesTxt_(p) + '\n━━━━━━━━━━━━\n👤 ' + E(p.by) + (p.at ? ' · 🕒 ' + E(p.at) : '');
    case 'entry_edit': return '✏️ <b>تعديل ' + E(p.type || 'قيد') + ' مرحّل</b>' + _glBotHead_(p) + _glBotLinesTxt_(p) + '\n━━━━━━━━━━━━\n👤 ' + E(p.by) + (p.at ? ' · 🕒 ' + E(p.at) : '');
    case 'entry_void': return '🗑️ <b>' + (p.deleted ? 'حذف' : 'إلغاء') + ' ' + E(p.type || 'قيد') + '</b>' + _glBotHead_(p) + (p.reason ? '\n❓ السبب: ' + E(p.reason) : '') + _glBotLinesTxt_(p) + '\n━━━━━━━━━━━━\n👤 ' + E(p.by) + ' · 🕒 ' + E(_glNow_());
    case 'custody_err': return '👜 <b>عهدة تحتاج مراجعة</b> — ' + E(p.name) + '\n' + p.n + ' صف بالشيت لم يُقيَّد (حساب غير معروف أو بيانات ناقصة) — راجعها من شاشة العهد.';
    case 'pending': return '⏳ <b>تغييرات تنتظر الاعتماد</b>: ' + p.n + ' — من تبويب «القيود التلقائية»' + (p.keys && p.keys.length ? ' أو بالأزرار تحت كل تغيير:' : '.') + (!p.keys && p.items && p.items.length ? '\n━━━━━━━━━━━━\n' + p.items.join('\n') : '');
    case 'stmt': return '📒 <b>صدر كشف حساب</b> ' + E(p.serial) + ' — ' + E(p.name) + '\n' + E(p.balances) + '\n👤 ' + E(p.by) + ' · ' + E(p.output);
    default: return E(JSON.stringify(p));
  }
}
// يُستدعى كل دقيقة من مهمة بوت الحجوزات الدورية (drainTelegramQueue)
function glBotTick_() {
  // ⚡ (V4.365) يعمل كل دقيقة: لا نفتح ملف الحسابات لقراءة الإعدادات إلا إن كان هناك ما يُرسل (طابور غير فارغ أو ملخص يومي مستحق)
  try {
    var P0 = PropertiesService.getScriptProperties(), q0 = P0.getProperty('GLBOT_Q');
    if (!q0 || q0 === '[]') {
      var n0 = new Date(), tz0 = _tz_() || 'Africa/Cairo', day0 = Utilities.formatDate(n0, tz0, 'yyyyMMdd'), dh0 = CacheService.getScriptCache().get('glbot_dh');
      if (P0.getProperty('GLBOT_DAILY') === day0) return;
      if (dh0 !== null && +Utilities.formatDate(n0, tz0, 'H') < +dh0) return;
    }
  } catch (eQ) {}
  var c; try { if (!_glSSId_()) return; _GL_SET_MEMO_ = null; c = _glBotCfg_(); } catch (e0) { return; }
  try { CacheService.getScriptCache().put('glbot_dh', String(c.enabled && c.chatId && c.events.daily_cash ? (+c.dailyHour || 0) : 99), 600); } catch (eD0) {}
  if (!c.enabled || !c.chatId) return;
  var P = PropertiesService.getScriptProperties(), q = [];
  try { q = JSON.parse(P.getProperty('GLBOT_Q') || '[]') || []; } catch (e) { q = []; }
  if (q.length) {
    P.setProperty('GLBOT_Q', '[]');
    var left = [];
    q.forEach(function (it, i) {
      if (i >= 15) { left.push(it); return; }
      try {
        // 🔔 (V4.305) تنبيه واحد لكل عملية: كان صف الشيت الناقص يصل برسالتين («عهدة تحتاج مراجعة» ثم رسالة الصف بأزراره)
        // وتغيّر القيد بانتظار الاعتماد كذلك (عنوان عام ثم رسالة التغيير) — الآن رسالة واحدة لكل صف/تغيير تحمل العنوان والتفاصيل
        // والأزرار معاً. ما يُرسَل يُزال من العنصر أولاً بأول، فلو فشل الإرسال بالمنتصف تُعاد المحاولة للباقي فقط (بلا تكرار).
        if (it.t === 'custody_err' && it.p && it.p.code && it.p.rows && it.p.rows.length) _glBotCsxAlert_(c.chatId, it.p);
        else if (it.t === 'pending' && it.p && it.p.keys && it.p.keys.length) _glBotPendAlert_(c.chatId, it.p);
        else _glBotSend_(c.chatId, _glBotFmt_(it));
      } catch (e) { if ((it.n = (it.n || 0) + 1) < 4) left.push(it); Logger.log('glBotTick_: ' + e.message); }
    });
    if (left.length) { var q2 = []; try { q2 = JSON.parse(P.getProperty('GLBOT_Q') || '[]') || []; } catch (e) {} P.setProperty('GLBOT_Q', _glBotQPack_(left.concat(q2))); }
  }
  // الملخص اليومي مرة واحدة في الساعة المحددة
  try {
    if (!c.events.daily_cash) return;
    var now = new Date(), tz = _tz_() || 'Africa/Cairo', day = Utilities.formatDate(now, tz, 'yyyyMMdd'), hr = +Utilities.formatDate(now, tz, 'H');
    if (hr < c.dailyHour || P.getProperty('GLBOT_DAILY') === day) return;
    P.setProperty('GLBOT_DAILY', day);
    _glBotSend_(c.chatId, '🌙 <b>ملخص النقدية — ' + Utilities.formatDate(now, tz, 'dd/MM/yyyy') + '</b>\n' + _glBotCashTxt_(['safe', 'bank', 'custody']));
  } catch (eD) { Logger.log('glBotTick_/daily: ' + eD.message); }
}
function _glBotBalTxt_(b) {
  var lbl = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' }, out = [];
  ['EGP', 'SAR', 'USD'].forEach(function (k) { var v = b && b[k] || 0; if (Math.abs(v) >= 0.01) out.push(_glFmtN_(Math.abs(v)) + ' ' + lbl[k] + (v > 0 ? ' مدين' : ' دائن')); });
  return out.join(' · ') || '0';
}
function _glBotCashTxt_(kinds) {
  var accs = _glAccounts_().list, bal = _glBalances_(null), lbl = { safe: '💵 الخزائن', bank: '🏦 البنوك', custody: '👜 العهد' }, out = [];
  kinds.forEach(function (k) {
    var rows = accs.filter(function (a) { return !a.isGroup && a.kind === k && a.active; }).map(function (a) {
      var b = bal[a.code]; if (!b || !['EGP', 'SAR', 'USD'].some(function (c) { return Math.abs(b[c] || 0) >= 0.01; })) return '';
      return '• ' + _glBotEsc_(a.name) + ': ' + _glBotBalTxt_(b);
    }).filter(Boolean);
    if (rows.length) out.push('<b>' + lbl[k] + '</b>\n' + rows.join('\n'));
  });
  return out.join('\n\n') || 'لا توجد أرصدة.';
}
function _glBotFindAcc_(q) {
  q = _glStr_(q); if (!q) return [];
  var accs = _glAccounts_().list.filter(function (a) { return !a.isGroup; });
  if (accs.some(function (a) { return a.code === q; })) return accs.filter(function (a) { return a.code === q; });
  var n = _glNorm_(q), exact = accs.filter(function (a) { return _glNorm_(a.name) === n || _glNorm_(a.link) === n; });
  if (exact.length) return exact;
  return accs.filter(function (a) { return _glNorm_(a.name).indexOf(n) >= 0 || _glNorm_(a.link).indexOf(n) >= 0; }).slice(0, 10);
}
// يُستدعى من بوت الحجوزات لكل رسالة نصية قبل أوامره — يرجع وصفاً للسجل لو عالجها، أو '' لتكمل أوامر الحجوزات
function glBotHandle_(msg, opt) {
  try {
    if (!_glSSId_()) return '';
    var text = _glStr_(msg && msg.text), chat = msg && msg.chat || {}, chatId = String(chat.id || ''), from = msg.from || {};
    if (!text) return '';
    var li = _glBotLinkIncoming_(text, from, chatId); if (li) return li;   // (V4.269)
    var c = _glBotCfg_(), inGroup = !!(c.chatId && chatId === c.chatId), isPriv = chat.type === 'private';
    var w = text.replace(/@\w+/, '').trim(), first = w.split(/\s+/)[0], arg = w.slice(first.length).trim();
    var cmd = GLBOT_CMDS_.filter(function (x) { return first.toLowerCase() === x[1] || (inGroup && x[2] && first === x[2]); })[0];
    // (V4.261) زر بالقائمة طلب بيانة (اسم الحساب/رقم القيد) ⇒ الرسالة التالية من نفس الشخص هي الرد
    var askK = 'glbot_ask_' + chatId + '_' + (from.id || ''), ask = null;
    try { ask = CacheService.getScriptCache().get(askK); } catch (eA) {}
    if (!cmd && ask && /^csfix\|/.test(ask) && !/^\//.test(w)) {
      try { CacheService.getScriptCache().remove(askK); } catch (eR) {}
      var cp = ask.split('|'), wh = _glBotTgUser_(from), hits = _glBotFindAcc_(w);
      if (!wh || !(_sessionHasPerm_(wh, 'admin') || _sessionHasPerm_(wh, 'gl.edit'))) { _glBotSend_(chatId, '⛔ يحتاج صلاحية تعديل الحسابات'); return 'بوت الحسابات: عهدة غير مصرح'; }
      if (hits.length !== 1) { _glBotSend_(chatId, hits.length ? '🔎 أكثر من حساب — اختر:' : '🔎 لا يوجد حساب يطابق «' + _glBotEsc_(w) + '»', hits.length ? { inline_keyboard: hits.slice(0, 8).map(function (a) { return [_glBtn_(a.name.slice(0, 40), 'gl:cs:' + cp[1] + ':' + cp[2] + ':' + a.code)]; }) } : null); return 'بوت الحسابات: عهدة بحث'; }
      _glBotSend_(chatId, _glBotCsApprove_(cp[1], +cp[2], hits[0].code, wh.username)); return 'بوت الحسابات: عهدة اعتماد';
    }
    if (!cmd && ask && !/^\//.test(w)) { try { CacheService.getScriptCache().remove(askK); } catch (eR) {} cmd = GLBOT_CMDS_.filter(function (x) { return x[0] === ask; })[0]; arg = w; }
    if (!cmd && (opt && opt.own) && /^\/(start|menu)$/i.test(first)) cmd = GLBOT_CMDS_[0];
    if (!cmd) return '';
    if (cmd[0] === 'id') { _glBotSend_(chatId, '🆔 رقم هذه المحادثة: <code>' + _glBotEsc_(chatId) + '</code>\n(انسخه في إعدادات بوت الحسابات ← رقم مجموعة الحسابات)'); return 'بوت الحسابات: رقم المحادثة'; }
    if (!c.enabled) return '';
    if (!inGroup) {   // خارج مجموعة الحسابات: محادثة خاصة لموظف مربوط بالبوت ولديه صلاحية الحسابات فقط
      if (!isPriv) return '';
      var lu = _glBotTgUser_(from);   // (V4.269) ربط البرنامج الحالي أولاً ثم ربط الحجوزات القديم
      if (!lu || !(_sessionHasPerm_(lu, 'admin') || _sessionHasPerm_(lu, 'gl.view'))) { _glBotSend_(chatId, '⛔ أوامر الحسابات لموظف مربوط بالبوت ولديه صلاحية «الحسابات العامة».'); return 'بوت الحسابات: غير مصرح'; }
    }
    if (!c.cmds[cmd[0]]) { _glBotSend_(chatId, '⛔ هذا الأمر متوقف من إعدادات بوت الحسابات.'); return 'بوت الحسابات: أمر متوقف'; }
    _glBotAnnounce_(chatId, chat, from, _glBotEsc_((cmd[3] || cmd[2] || cmd[1]).split(':')[0] + (arg ? ' — ' + arg : '')));
    if (cmd[0] === 'help') { _glBotSend_(chatId, _glBotRun_('help', '', inGroup), _glBotMenuKb_(c)); return 'بوت الحسابات: القائمة'; }
    if (cmd[0] === 'pending') { _glBotPendSend_(chatId, 8); return 'بوت الحسابات: الاعتماد'; }
    var out = _glBotRun_(cmd[0], arg, inGroup), kb = null;
    if (cmd[0] === 'stmt' && _glBotLastAcc_) kb = { inline_keyboard: [[_glBtn_('📄 كشف PDF', 'gl:sp:' + _glBotLastAcc_, 'primary'), _glBtn_('🖼️ صورة HD', 'gl:si:' + _glBotLastAcc_, 'success')]] };
    _glBotSend_(chatId, out, kb);
    return 'بوت الحسابات: ' + cmd[0];
  } catch (e) {
    try { _glBotSend_(msg.chat.id, '⚠️ تعذّر تنفيذ أمر الحسابات: ' + _glBotEsc_(e.message)); } catch (e2) {}
    return 'بوت الحسابات: خطأ ' + e.message;
  }
}
var _glBotLastAcc_ = '';
// ⌨️ (V4.261) قائمة أزرار ملوّنة لمجموعة الحسابات (مثل مجموعة الحجوزات) — كل زر = أمر
function _glBotMenuKb_(c) {
  c = c || _glBotCfg_();
  var on = function (k) { return c.cmds[k] !== false; }, rows = [], row = [];
  var add = function (b) { row.push(b); if (row.length === 2) { rows.push(row); row = []; } };
  if (on('cash')) add(_glBtn_('💰 الخزائن والبنوك', 'gl:m:cash', 'success'));
  if (on('custody')) add(_glBtn_('👜 العهد', 'gl:m:custody', 'success'));
  if (on('bal')) add(_glBtn_('📊 رصيد حساب', 'gl:m:bal', 'primary'));
  if (on('stmt')) add(_glBtn_('📒 كشف حساب PDF/صورة', 'gl:m:stmt', 'primary'));
  if (on('pending')) add(_glBtn_('⏳ تغييرات بانتظار الاعتماد', 'gl:m:pending', 'danger'));
  if (on('entry')) add(_glBtn_('🧾 تفاصيل قيد/سند', 'gl:m:entry'));
  add(_glBtn_('👜 صفوف عهد ناقصة', 'gl:m:csx', 'danger'));
  if (row.length) rows.push(row);
  return { inline_keyboard: rows };
}
// تغييرات بانتظار الاعتماد — رسالة لكل تغيير بأزرار ثابتة (اعتماد/رفض/التفاصيل) تعمل في أي وقت لاحق (بلا حالة محفوظة)
function _glPendHash_(k) { return _glHash_(String(k)).slice(0, 12); }
function _glBotPendSend_(chatId, n) {
  var top = _glPendTop_(n || 5), all = _glPendingCount_() || 0;
  _glBotSend_(chatId, '⏳ بانتظار الاعتماد: <b>' + all + '</b>' + (all > top.length ? ' — أحدث ' + top.length : ''));
  top.forEach(function (x) { _glBotSend_(chatId, x.txt, _glBotPendKb_(x.key)); });
}
function _glBotPendKb_(key) {
  var h = _glPendHash_(key);
  return { inline_keyboard: [[_glBtn_('✅ اعتماد', 'gl:ap:' + h, 'success'), _glBtn_('❌ رفض', 'gl:rj:' + h, 'danger'), _glBtn_('🔍 التفاصيل', 'gl:pd:' + h, 'primary')]] };
}
function _glPendByHash_(h) {
  var hit = null; try { _glRowsW_('pending').forEach(function (r) { var k = _glStr_(r[0]); if (k && !hit && _glPendHash_(k) === h) hit = r; }); } catch (e) {}
  return hit;
}
// 🔗 (V4.264) شرح ربط الموظف بالبوت ومنحه صلاحية الاعتماد — يُرسَل كرسالة كاملة للمحادثة (التنبيه المنبثق قصير)
function _glBotLinkHelp_(chatId, needApprove) {
  _glBotSend_(chatId, '🔗 <b>كيف تعتمد من تليجرام؟</b>\nلازم حساب تليجرام الخاص بك يكون <b>مربوطاً بالبوت</b>' + (needApprove ? ' وله صلاحية <b>«✅ اعتماد تغييرات القيود»</b>' : '') + ':\n' +
    '① افتح محادثة خاصة مع البوت واضغط <b>Start</b> (أو أرسل <code>/start</code>).\n' +
    '② من البرنامج (مدير): <b>الإعدادات ← قسم «📒 بوت وتنبيهات الحسابات» ← فتح / إغلاق ← «🔗 ربط موظفي البرنامج بالبوت»</b> → أدخِل اسم مستخدمك على تليجرام (بدون @) أمام اسمك ثم «ربط» — يكتمل الربط تلقائياً أول رسالة منك للبوت. أو اضغط «كود ربط» وأرسله للبوت هكذا: <code>/link الكود</code>.' +
    (needApprove ? '\n③ تأكد أن صلاحياتك تشمل <b>«✅ اعتماد تغييرات القيود»</b> من <b>إدارة المستخدمين</b>.' : ''));
}
/* 🔗 (V4.269) ربط موظفي البرنامج الحالي ببوت الحسابات — مستقل عن ربط موظفي برنامج الحجوزات (صلاحيات وشاشات منفصلة)
   • المستخدمون من جدول «Users» بالبرنامج الحالي وصلاحياتهم (gl.view / gl.edit / gl.approve / admin)
   • التخزين بخصائص السكربت: GLBOT_LINKS {tgId:{u,name,ts,on}} · GLBOT_LPEND [{id,norm,raw,u,ts}] · GLBOT_CODES {code:{u,ts}} */
function _glBotJson_(k, d) { try { var v = PropertiesService.getScriptProperties().getProperty(k), o = v ? JSON.parse(v) : d; return (Array.isArray(d) !== Array.isArray(o) || (o === null)) ? d : o; } catch (e) { return d; } }   // (V4.274) يرجع الافتراضي لو النوع المخزَّن غير المتوقع
function _glBotJsonSave_(k, o) { PropertiesService.getScriptProperties().setProperty(k, JSON.stringify(o)); }
function _glBotMainUsers_() {
  var users = null; try { users = typeof getCachedData_ === 'function' ? getCachedData_('users_cache') : null; } catch (e) {}
  if (!users) { try { var sh = getSpreadsheet_().getSheetByName('Users'); users = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(function (r) { return { username: String(r[0]), fullName: String(r[2] || ''), active: r[3], permissions: r[4] }; }) : []; } catch (e2) { users = []; } }
  return users.filter(function (u) { return u && u.username; });
}
function _glBotMainUser_(username) {
  var k = String(username || '').toLowerCase(), hit = null;
  _glBotMainUsers_().forEach(function (u) { if (String(u.username).toLowerCase() === k) hit = u; });
  return hit && hit.active !== false && String(hit.active) !== 'FALSE' ? hit : null;
}
function _glBotPermFlags_(u) {
  var s = { username: u.username, permissions: u.permissions }, ad = _sessionHasPerm_(s, 'admin');
  return { admin: ad, view: ad || _sessionHasPerm_(s, 'gl.view'), edit: ad || _sessionHasPerm_(s, 'gl.edit'), approve: ad || _sessionHasPerm_(s, 'gl.approve') };
}
function glBotLinkList(authToken) {
  _glAdminPerm_(authToken);
  var links = _glBotJson_('GLBOT_LINKS', {}), pend = _glBotJson_('GLBOT_LPEND', []), bot = '';
  try { if (!_glBotCfg_().token && typeof tgBotUsername_ === 'function') bot = tgBotUsername_(); } catch (e) {}
  var by = {}; Object.keys(links).forEach(function (id) { var l = links[id]; (by[String(l.u).toLowerCase()] = by[String(l.u).toLowerCase()] || []).push({ tgId: id, name: l.name || '', ts: l.ts || '', on: l.on !== false }); });
  var users = _glBotMainUsers_().map(function (u) {
    var f = _glBotPermFlags_(u);
    return { username: u.username, fullName: u.fullName || '', active: !(u.active === false || String(u.active) === 'FALSE'), flags: f, links: by[String(u.username).toLowerCase()] || [] };
  });
  return { success: true, users: users, pending: pend.map(function (r) { return { id: r.id, raw: r.raw, username: r.u, ts: r.ts }; }), bot: bot };
}
function glBotLinkPend(authToken, username, tgUser) {
  var session = _glAdminPerm_(authToken);
  username = _glStr_(username); if (!_glBotMainUser_(username)) throw new Error('مستخدم غير موجود أو غير نشط بالبرنامج');
  var raw = _glStr_(tgUser), norm = raw.replace(/^@/, '').toLowerCase(); if (!/^[a-z0-9_]{4,}$/.test(norm)) throw new Error('اسم مستخدم تليجرام غير صالح (بدون @، حروف إنجليزية وأرقام و_)');
  var list = _glBotJson_('GLBOT_LPEND', []).filter(function (r) { return r.norm !== norm; });
  list.push({ id: Utilities.getUuid().slice(0, 8), norm: norm, raw: raw, u: username, ts: Date.now(), by: session.username });
  _glBotJsonSave_('GLBOT_LPEND', list);
  logChange_(session.username, 'ربط موظف ببوت الحسابات (معلَّق)', 'GL:bot', username, '-', '@' + norm);
  return { success: true };
}
function glBotLinkPendDel(authToken, id) {
  _glAdminPerm_(authToken);
  _glBotJsonSave_('GLBOT_LPEND', _glBotJson_('GLBOT_LPEND', []).filter(function (r) { return r.id !== id; }));
  return { success: true };
}
function glBotLinkCode(authToken, username) {
  var session = _glAdminPerm_(authToken);
  username = _glStr_(username); if (!_glBotMainUser_(username)) throw new Error('مستخدم غير موجود أو غير نشط بالبرنامج');
  var codes = _glBotJson_('GLBOT_CODES', {}), now = Date.now();
  Object.keys(codes).forEach(function (c) { if (now - codes[c].ts > 1800000) delete codes[c]; });
  var al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', code = 'G';
  for (var i = 0; i < 6; i++) code += al.charAt(Math.floor(Math.random() * al.length));
  codes[code] = { u: username, ts: now }; _glBotJsonSave_('GLBOT_CODES', codes);
  logChange_(session.username, 'كود ربط بوت الحسابات', 'GL:bot', username, '-', '-');
  var bot = ''; try { if (!_glBotCfg_().token && typeof tgBotUsername_ === 'function') bot = tgBotUsername_(); } catch (e) {}
  return { success: true, code: code, minutes: 30, bot: bot, deepLink: bot ? 'https://t.me/' + bot + '?start=' + code : '' };
}
function glBotLinkSet(authToken, tgId, op) {
  var session = _glAdminPerm_(authToken);
  var links = _glBotJson_('GLBOT_LINKS', {}); tgId = _glStr_(tgId);
  if (!links[tgId]) throw new Error('الربط غير موجود');
  if (op === 'del') delete links[tgId]; else links[tgId].on = (op === 'on');
  _glBotJsonSave_('GLBOT_LINKS', links);
  logChange_(session.username, op === 'del' ? 'فك ربط موظف ببوت الحسابات' : 'تغيير حالة ربط بوت الحسابات', 'GL:bot', '-', '-', tgId + ' ' + op);
  return { success: true };
}
function _glBotLinkDo_(from, u, how) {
  var links = _glBotJson_('GLBOT_LINKS', {}), name = ((from.first_name || '') + ' ' + (from.last_name || '')).trim() || from.username || '';
  links[String(from.id)] = { u: u.username, name: name, ts: _glNow_(), on: true }; _glBotJsonSave_('GLBOT_LINKS', links);
  try { logChange_('بوت الحسابات', 'الإعدادات', u.username, 'ربط حساب تليجرام (' + name + ') بمستخدم البرنامج عبر ' + how, '', u.username); } catch (e) {}
}
// يُستدعى أول كل رسالة: ربط تلقائي باسم مستخدم تليجرام المعلَّق، أو «/link الكود» / «/start الكود» لأكواد بوت الحسابات (تبدأ بـ G).
// يرجع نصاً فقط لو استهلك الأمر (فلا يصل لمعالج الحجوزات)، وإلا '' ليكمل المعالج الطبيعي
function _glBotLinkIncoming_(text, from, chatId) {
  try {
    if (!from || !from.id) return '';
    var links = _glBotJson_('GLBOT_LINKS', {}), mine = links[String(from.id)];
    var m = String(text || '').trim().match(/^\/(?:link|start|glink)(?:@\w+)?\s+([A-Za-z0-9]{6,10})\s*$/i);
    if (m) {
      var codes = _glBotJson_('GLBOT_CODES', {}), cd = m[1].toUpperCase(), rec = codes[cd];
      if (rec && Date.now() - rec.ts <= 1800000) {
        var u = _glBotMainUser_(rec.u); delete codes[cd]; _glBotJsonSave_('GLBOT_CODES', codes);
        if (!u) { _glBotSend_(chatId, '⚠️ المستخدم غير موجود أو غير نشط.'); return 'بوت الحسابات: ربط فاشل'; }
        _glBotLinkDo_(from, u, 'كود الربط'); var f = _glBotPermFlags_(u);
        _glBotSend_(chatId, '✅ تم ربطك بحسابات البرنامج.\n👤 ' + _glBotEsc_(u.fullName || u.username) + '\nصلاحيات الحسابات: ' + (f.admin ? 'مدير' : (f.view ? 'عرض' : 'لا يوجد') + (f.edit ? ' · تعديل' : '') + (f.approve ? ' · اعتماد' : '')) + '\nاكتب «قائمة» لعرض الأزرار.');
        return 'بوت الحسابات: تم الربط';
      }
      if (rec) return '';
    }
    if (!mine) {
      var uname = String(from.username || '').toLowerCase(); if (!uname) return '';
      var pend = _glBotJson_('GLBOT_LPEND', []), ix = -1;
      pend.forEach(function (r, i) { if (ix < 0 && r.norm === uname) ix = i; });
      if (ix < 0) return '';
      var pu = _glBotMainUser_(pend[ix].u); var rr = pend.splice(ix, 1)[0]; _glBotJsonSave_('GLBOT_LPEND', pend);
      if (pu) { _glBotLinkDo_(from, pu, 'اسم المستخدم'); _glBotSend_(chatId, '✅ تم ربط حسابك تلقائياً بحسابات البرنامج: ' + _glBotEsc_(pu.fullName || pu.username)); }
    }
  } catch (e) { Logger.log('_glBotLinkIncoming_: ' + e.message); }
  return '';
}
function _glBotTgUser_(from) {
  try {   // (V4.269) ربط موظفي البرنامج الحالي أولاً (صلاحياتهم من جدول مستخدمي هذا البرنامج)
    var ol = from && from.id ? _glBotJson_('GLBOT_LINKS', {})[String(from.id)] : null;
    if (ol) { if (ol.on === false) return null; var mu = _glBotMainUser_(ol.u); return mu ? { username: mu.username, permissions: mu.permissions } : null; }
  } catch (eO) {}
  var lu = typeof tgUserByTgId_ === 'function' ? tgUserByTgId_(from && from.id) : null;
  if (!lu || !lu.active) return null;
  var rec = null;
  try {
    var sh = getSpreadsheet_().getSheetByName('Users');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) { if (String(r[0]).toLowerCase() === String(lu.username).toLowerCase()) rec = { username: String(r[0]), permissions: r[4], active: r[3] }; });
  } catch (e) {}
  if (!rec || rec.active === false || String(rec.active) === 'FALSE') return null;
  return { username: rec.username, permissions: rec.permissions };
}
// 🖱️ أزرار بوت الحسابات (callback_data تبدأ بـ gl:) — يرجع true لو عالجها
function glBotCallback_(cq) {
  var d = String(cq && cq.data || ''); if (d.indexOf('gl:') !== 0) return false;
  var chatId = String(cq.message && cq.message.chat && cq.message.chat.id || ''), msgId = cq.message && cq.message.message_id, from = cq.from || {};
  try {
    if (!_glSSId_()) { _glBotAns_(cq.id, 'الحسابات العامة غير مربوطة', true); return true; }
    var c = _glBotCfg_(), inGroup = !!(c.chatId && chatId === c.chatId);
    var who = _glBotTgUser_(from);
    if (!inGroup && !(who && (_sessionHasPerm_(who, 'admin') || _sessionHasPerm_(who, 'gl.view')))) { _glBotAns_(cq.id, '⛔ اربط حسابك بالبوت أولاً — التفاصيل بالرسالة', true); _glBotLinkHelp_(chatId, false); return true; }
    var parts = d.split(':'), act = parts[1], arg = parts.slice(2).join(':');
    var chatO = (cq.message && cq.message.chat) || {};
    var btnLbl = { cash: '💰 الخزائن والبنوك', custody: '👜 العهد', pending: '⏳ الاعتماد', csx: '👜 صفوف الشيتات الناقصة', bal: '📊 رصيد حساب', stmt: '📒 كشف حساب', entry: '🧾 تفاصيل قيد' };
    if (act === 'm' && btnLbl[arg] && !/^(bal|stmt|entry)$/.test(arg)) _glBotAnnounce_(chatId, chatO, from, btnLbl[arg]);
    if (act === 'm') {   // أزرار القائمة
      if (arg === 'cash' || arg === 'custody') { _glBotAns_(cq.id, ''); _glBotSend_(chatId, _glBotRun_(arg, '', inGroup)); return true; }
      if (arg === 'pending') { _glBotAns_(cq.id, ''); _glBotPendSend_(chatId, 8); return true; }
      if (arg === 'csx') { _glBotAns_(cq.id, ''); _glBotCsxSend_(chatId); return true; }
      if (/^(bal|stmt|entry)$/.test(arg)) {
        try { CacheService.getScriptCache().put('glbot_ask_' + chatId + '_' + (from.id || ''), arg, 600); } catch (eC) {}
        _glBotAns_(cq.id, '');
        _glBotSend_(chatId, (chatO.type === 'private' ? '✍️ ' : '👤 <b>' + _glBotEsc_(_glBotWhoName_(from)) + '</b> طلب: ' + btnLbl[arg] + '\n✍️ ') + _glBotEsc_(((from.first_name || '') + '').trim()) + '، اكتب ' + (arg === 'entry' ? 'رقم القيد أو السند (مثل REC-00012)' : 'اسم الحساب أو جزءاً منه أو كوده') + ':', { force_reply: true, selective: true });
        return true;
      }
    }
    if (act === 'sp' || act === 'si') {   // كشف حساب PDF / صورة
      _glBotAns_(cq.id, act === 'sp' ? '📄 جارٍ تجهيز PDF…' : '🖼️ جارٍ تجهيز الصورة…');
      var a = _glAccounts_().map[arg]; if (!a) { _glBotSend_(chatId, 'الحساب غير موجود'); return true; }
      var pdf = _glBotStmtPdf_(a.code), cap = '📒 كشف حساب <b>' + _glBotEsc_(a.name) + '</b> — ' + Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy') +
        (chatO.type === 'private' ? '' : '\n👤 طلبه: <b>' + _glBotEsc_(_glBotWhoName_(from)) + '</b>');
      if (act === 'sp') { _glBotDoc_(chatId, pdf, cap); return true; }
      var img = _glPdfToPng_(pdf);
      if (img) _glBotPhoto_(chatId, img, cap); else { _glBotDoc_(chatId, pdf, cap + '\n(تعذّر تحويله لصورة الآن — أُرسل PDF)'); }
      return true;
    }
    if (act === 'ap' || act === 'rj' || act === 'pd') {   // اعتماد/رفض/تفاصيل تغيير
      var r = _glPendByHash_(arg);
      if (!r) { _glBotAns_(cq.id, 'هذا التغيير لم يعد بانتظار الاعتماد (اعتُمد أو تغيّر مصدره)', true); try { _glBotEdit_(chatId, msgId, (cq.message.text ? _glBotEsc_(cq.message.text) : '') + '\n\n✔️ <i>لم يعد معلّقاً</i>'); } catch (eE) {} return true; }
      var key = _glStr_(r[0]);
      if (act === 'pd') {
        _glBotAns_(cq.id, '');
        _glBotSend_(chatId, '🔍 <b>تفاصيل التغيير</b>' + (r[1] ? ' — قيد ' + _glBotEsc_(_glStr_(r[1])) : '') + '\n📝 قبل: ' + _glBotEsc_(_glCleanDesc_(_glStr_(r[3])) || '—') + '\n📝 بعد: ' + _glBotEsc_(_glCleanDesc_(_glStr_(r[5])) || '—') +
          '\n💰 المبلغ القديم: ' + _glBotEsc_(_glStr_(r[12]) || '—') + ' · الجديد: ' + _glBotEsc_(_glStr_(r[13]) || '—') + '\n━━━━━━━━━━━━\n' + _glBotEsc_(_glStr_(r[14]) || '—'), _glBotPendKb_(key));
        return true;
      }
      if (!who || !_glCanApprove_(who)) { _glBotAns_(cq.id, '⛔ اربط حسابك ومنحه صلاحية الاعتماد — التفاصيل بالرسالة', true); _glBotLinkHelp_(chatId, true); return true; }
      if (act === 'rj') {
        var cur = _glPendingRows_(), keep = {};
        Object.keys(cur).forEach(function (k) { var rr = cur[k].row; if (k === key) { rr[9] = 'مرفوض'; rr[10] = who.username; rr[11] = 'من تليجرام ' + _glNow_(); } keep[k] = rr; });
        _glPendingWrite_(keep);
        logChange_(who.username, 'رفض تغيير قيود تلقائية', 'GL:approve', 'تليجرام', '1 تغيير', key);
        _glBotAns_(cq.id, '❌ رُفض');
        _glBotEdit_(chatId, msgId, _glBotEsc_(cq.message.text || '') + '\n\n❌ <b>رُفض</b> بواسطة ' + _glBotEsc_(who.username));
        return true;
      }
      var _pre = /^CCY:/.test(key) ? null : _glAutoPreBuild_(who.username);   // ⚡ (V4.307) البناء الثقيل خارج القفل
      var res = { blocked: [] }, lock = _glLock_(); lock.waitLock(60000);
      try {
        // 💱 (V4.306) تغيير «تحويل عملة»: القيد مسجَّل بالفعل بمبلغه المستنتج — الاعتماد هنا مراجعة فقط، يزيله من القائمة
        if (/^CCY:/.test(key)) _glPendingDrop_([key]);
        else { var only = {}; only[key] = 1; res = _glAutoRunPre_(who.username, _pre, { bypass: true, onlyKeys: only, approveKeys: only }); _glAutoLogAdd_(res.createdList, 'جديد'); }
      } finally { _glUnlock_(lock); }
      logChange_(who.username, 'اعتماد تغيير قيود تلقائية', 'GL:approve', 'تليجرام', '1 تغيير', key);
      _glBotAns_(cq.id, res.blocked && res.blocked.length ? '⚠️ محجوز بفترة مقفلة' : '✅ اعتُمد');
      _glBotEdit_(chatId, msgId, _glBotEsc_(cq.message.text || '') + '\n\n' + (res.blocked && res.blocked.length ? '⚠️ <b>لم يُعتمد</b> — القيد في فترة مقفلة' : '✅ <b>اعتُمد</b> بواسطة ' + _glBotEsc_(who.username)));
      return true;
    }
    if (act === 'cs') { _glBotCsxCb_(cq, chatId, msgId, who, arg); return true; }
    if (act === 'csall') { _glBotCsAllCb_(cq, chatId, msgId, who, arg); return true; }
    _glBotAns_(cq.id, '');
    return true;
  } catch (e) {
    _glBotAns_(cq.id, '⚠️ ' + e.message, true);
    return true;
  }
}
// 📄 كشف حساب (كل الحركات من البداية) كملف PDF مرتب للإرسال من البوت
function _glBotStmtPdf_(code) {
  var a = _glAccounts_().map[code], ctx = _glStmtCtxFor_(code); ctx.skipHb = true;
  var st = _glStmtCore_(code, '', '', ctx), E = _glBotEsc_, lbl = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' };
  var curs = GL_CURS_.filter(function (c) { return st.rows.some(function (x) { return x.currency === c; }) || Math.abs((st.closing || {})[c] || 0) >= 0.01; });
  if (!curs.length) curs = ['EGP'];
  var co = '', set = _glSettings_(); try { co = (JSON.parse(set.vch_companies || '[]')[0] || {}).name || ''; } catch (e) {}
  var bal = function (v) { return _glFmtN_(Math.abs(v)) + (Math.abs(v) < 0.01 ? '' : (v > 0 ? ' مدين' : ' دائن')); };
  var html = '<html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:10.5px;color:#0f172a;margin:18px;}h2{margin:0;color:#1e3a8a;}' +
    '.hd{border-bottom:3px solid #c8a24a;padding-bottom:6px;margin-bottom:8px;}table{width:100%;border-collapse:collapse;margin-top:6px;}th{background:#1e3a8a;color:#fff;padding:5px;font-size:10px;}' +
    'td{border-bottom:1px solid #e2e8f0;padding:4px;text-align:center;}td.d{text-align:right;}tr.c td{background:#f1f5f9;font-weight:bold;}.cur{margin-top:12px;font-weight:bold;color:#1e3a8a;font-size:12px;}</style></head><body>' +
    '<div class="hd">' + (co ? '<div style="font-weight:bold;">' + E(co) + '</div>' : '') + '<h2>كشف حساب: ' + E(a.name) + '</h2><div>الكود ' + E(a.code) + ' · حتى ' + Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy') + '</div></div>';
  curs.forEach(function (c) {
    var rows = st.rows.filter(function (x) { return x.currency === c; });
    html += '<div class="cur">العملة: ' + lbl[c] + '</div><table><tr><th>التاريخ</th><th>السند/القيد</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr>' +
      rows.map(function (x) { return '<tr><td>' + E(x.date) + '</td><td>' + E(x.voucherNo || x.entryId) + '</td><td class="d">' + E(String(x.desc || '').slice(0, 110)) + '</td><td>' + (x.debit ? _glFmtN_(x.debit) : '') + '</td><td>' + (x.credit ? _glFmtN_(x.credit) : '') + '</td><td>' + bal(x.bal) + '</td></tr>'; }).join('') +
      '<tr class="c"><td colspan="3">الإجمالي / الرصيد النهائي</td><td>' + _glFmtN_(st.totals ? (st.totals[c] || {}).dr || 0 : rows.reduce(function (s, x) { return s + x.debit; }, 0)) + '</td><td>' + _glFmtN_(st.totals ? (st.totals[c] || {}).cr || 0 : rows.reduce(function (s, x) { return s + x.credit; }, 0)) + '</td><td>' + bal((st.closing || {})[c] || 0) + '</td></tr></table>';
  });
  html += '</body></html>';
  var name = ('كشف حساب ' + a.name).replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
  return Utilities.newBlob(html, 'text/html', 'st.html').getAs('application/pdf').setName(name);
}
// 🖼️ PDF ⇒ صورة عالية الدقة للصفحة الأولى (صورة المعاينة من جوجل درايف بدقة 1600px)
function _glPdfToPng_(pdf) {
  var f = null;
  try {
    f = getDriveFolder_('TEMP').createFile(pdf);
    var tok = ScriptApp.getOAuthToken(), link = '';
    for (var i = 0; i < 8 && !link; i++) {
      if (i) Utilities.sleep(1500);
      var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + f.getId() + '?fields=thumbnailLink', { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true });
      try { link = JSON.parse(r.getContentText()).thumbnailLink || ''; } catch (e) {}
    }
    if (!link) return null;
    var img = UrlFetchApp.fetch(link.replace(/=s\d+$/, '') + '=s1600', { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true });
    if (img.getResponseCode() !== 200) return null;
    return img.getBlob().setName(pdf.getName().replace(/\.pdf$/i, '') + '.png');
  } catch (e) { Logger.log('_glPdfToPng_: ' + e.message); return null; }
  finally { try { if (f) f.setTrashed(true); } catch (e2) {} }
}
// 🔗 بوت حسابات مستقل: ويب هوك خاص (?glbot=<سر>) — بلا أي محتوى بالرد (تليجرام يرفض تحويل 302)
function glBotWebhook_(e) {
  try {
    var sec = PropertiesService.getScriptProperties().getProperty('GLBOT_HOOK') || '';
    if (!sec || String(e.parameter.glbot) !== sec) return;
    var upd = JSON.parse(e.postData.contents || '{}');
    try { var cc = CacheService.getScriptCache(), uk = 'glbot_u_' + upd.update_id; if (upd.update_id && cc.get(uk)) return; if (upd.update_id) cc.put(uk, '1', 600); } catch (eU) {}
    if (upd.callback_query) { if (!glBotCallback_(upd.callback_query)) _glBotAns_(upd.callback_query.id, ''); return; }
    if (upd.message && upd.message.text) glBotHandle_(upd.message, { own: true });
  } catch (err) { Logger.log('glBotWebhook_: ' + err.message); }
}
function glBotSetWebhook(authToken) {
  _glAdminPerm_(authToken);
  var P = PropertiesService.getScriptProperties();
  if (!P.getProperty('GLBOT_TOKEN')) throw new Error('احفظ توكن بوت الحسابات المستقل أولاً');
  var sec = P.getProperty('GLBOT_HOOK'); if (!sec) { sec = Utilities.getUuid().replace(/-/g, '').slice(0, 24); P.setProperty('GLBOT_HOOK', sec); }
  var base = '';
  try { base = typeof tgExecBase_ === 'function' ? tgExecBase_(P.getProperty(typeof TG_PROP_HOOKURL_ !== 'undefined' ? TG_PROP_HOOKURL_ : 'x') || '') : ''; } catch (e) {}
  if (!/^https:/.test(base)) base = ScriptApp.getService().getUrl();
  var url = base + '?glbot=' + sec;
  _glBotApi_('setWebhook', { url: url, allowed_updates: JSON.stringify(['message', 'callback_query']), drop_pending_updates: 'true', max_connections: '5' });
  try { _glBotApi_('setMyCommands', { commands: JSON.stringify(GLBOT_CMDS_.map(function (x) { return { command: x[1].slice(1), description: x[3].slice(0, 60) }; })) }); } catch (eC) {}
  return { success: true, url: url.replace(sec, '•••') };
}
// 👜 (V4.261) صفوف شيتات العهد الناقصة (طرف غير معروف/بيانات ناقصة) بتليجرام: كل صف برسالة وأزرار الحسابات المقترحة
// + «✏️ حساب آخر» (اكتب اسمه) — الاختيار يعتمد الصف فوراً ويكتب رقم القيد بالشيت، تماماً كشاشة العهد
function _glCsCodes_() { var set = _glSettings_(); return Object.keys(set).filter(function (k) { return k.indexOf('custsheet:') === 0; }).map(function (k) { return k.slice(10); }); }
// 👜 (V4.305) نص صف شيت ناقص وأزراره (رسالة واحدة): العنوان + التاريخ والمبلغ بعملته + البيان + الطرف بالشيت + اقتراحات الحساب
function _glBotCsxRowMsg_(code, x, accM, opt) {
  opt = opt || {};
  var E = _glBotEsc_, curL = { EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' }, cu = curL[x.cur] || '', nm = (accM[code] || {}).name || code;
  var kb = [], row = [];
  var cS = { EGP: 'ج', SAR: 'ر', USD: '$' };   // (V4.305) اقتراح بعملة مختلفة ⇒ المقابل يظهر بالزر نفسه (الاعتماد = اعتماد هذا المبلغ)
  (x.sugg || []).slice(0, 3).forEach(function (sg) { row.push(_glBtn_('✅ ' + String(sg.name).slice(0, sg.cc ? 18 : 28) + (sg.cc ? ' ⇄ ' + _glFmtN_(sg.cc.amt) + ' ' + (cS[sg.cc.cur] || sg.cc.cur) : ''), 'gl:cs:' + code + ':' + x.row + ':' + sg.code, 'success')); if (row.length === 2) { kb.push(row); row = []; } });
  row.push(_glBtn_('✏️ حساب آخر', 'gl:cs:' + code + ':' + x.row + ':?', 'primary')); kb.push(row);
  if (opt.bulk) kb.push([_glBtn_('✅ اعتماد أول اقتراح لكل الصفوف الناقصة بالشيت (' + opt.bulk + ')', 'gl:csall:' + code, 'success')]);
  var txt = '👜 <b>' + E(nm) + '</b> — صف ' + x.row + (opt.alert ? ' جديد بالشيت ينتظر تحديد الطرف' : '') +
    '\n📅 ' + E(x.date || '—') + (x.inAmt ? ' · وارد ' + _glFmtN_(x.inAmt) : '') + (x.outAmt ? ' · منصرف ' + _glFmtN_(x.outAmt) : '') + (cu ? ' ' + cu : '') +
    '\n📝 ' + E(x.desc || '—') + '\n🏷️ الطرف بالشيت: <b>' + E(x.hint || '— فارغ —') + '</b>' + (x.msg ? '\n⚠️ ' + E(x.msg) : '') +
    (opt.total > 1 ? '\n⏳ إجمالي الصفوف الناقصة بهذا الشيت: <b>' + opt.total + '</b>' : '') + '\nاختر الحساب الصحيح:';
  return { text: txt, kb: { inline_keyboard: kb } };
}
// تنبيه صفوف ناقصة جديدة: رسالة واحدة لكل صف (العنوان مدمج)، وزر «اعتماد كل المقترحات» بآخر رسالة فقط لو بالشيت أكثر من صف
function _glBotCsxAlert_(chatId, p) {
  var accM = _glAccounts_().map, total = +p.n || p.rows.length, anySg = p.rows.some(function (x) { return x.sugg && x.sugg.length; });
  while (p.rows.length) {
    var last = p.rows.length === 1, m = _glBotCsxRowMsg_(p.code, p.rows[0], accM, { alert: true, total: total, bulk: last && total > 1 && anySg ? total : 0 });
    _glBotSend_(chatId, m.text, m.kb);
    p.rows.shift();
  }
}
// تنبيه تغييرات بانتظار الاعتماد: رسالة واحدة لكل تغيير (عنوانه + تفاصيله + أزرار اعتماد/رفض/تفاصيل)
function _glBotPendAlert_(chatId, p) {
  while (p.keys.length) {
    var k = p.keys[0], txt = (p.items || [])[0] || _glBotEsc_(k), more = p.keys.length === 1 ? (+p.more || 0) : 0;
    _glBotSend_(chatId, '⏳ <b>تغيير على قيد مسجَّل ينتظر الاعتماد</b>' + (p.n > 1 ? ' (الإجمالي بانتظار الاعتماد: ' + p.n + ')' : '') + '\n' + txt +
      (more ? '\n━━━━━━━━━━━━\n… و' + more + ' تغيير آخر — من تبويب «القيود التلقائية»' : ''), _glBotPendKb_(k));
    p.keys.shift(); if (p.items) p.items.shift();
  }
}
function _glBotCsxSend_(chatId, onlyCode, rowsIn) {
  var accM = _glAccounts_().map, sent = 0;
  (onlyCode ? [onlyCode] : _glCsCodes_()).forEach(function (code) {
    var rows = rowsIn;
    if (!rows) { try { rows = _glCsSync_(code, 'تليجرام', { preview: true }).pending; } catch (e) { _glBotSend_(chatId, '⚠️ ' + _glBotEsc_((accM[code] || {}).name || code) + ': ' + _glBotEsc_(e.message)); return; } }
    if ((rows || []).some(function (x) { return x.sugg && x.sugg.length; })) _glBotSend_(chatId, '👜 <b>' + _glBotEsc_((accM[code] || {}).name || code) + '</b> — صفوف ناقصة بانتظار تحديد الطرف', { inline_keyboard: [[_glBtn_('✅ اعتماد كل المقترحات الأولى دفعة واحدة', 'gl:csall:' + code, 'success')]] });   // (V4.268)
    (rows || []).slice(0, 10).forEach(function (x) {
      var m = _glBotCsxRowMsg_(code, x, accM, {});
      _glBotSend_(chatId, m.text, m.kb);
      sent++;
    });
  });
  if (!sent) _glBotSend_(chatId, '✅ لا توجد صفوف عهد ناقصة الآن.');
}
function _glBotCsxCb_(cq, chatId, msgId, who, arg) {
  var p = arg.split(':'), code = p[0], row = +p[1], acc = p[2];
  if (!who || !(_sessionHasPerm_(who, 'admin') || _sessionHasPerm_(who, 'gl.edit'))) { _glBotAns_(cq.id, '⛔ اربط حسابك ومنحه صلاحية تعديل الحسابات — التفاصيل بالرسالة', true); _glBotLinkHelp_(chatId, true); return; }
  if (acc === '?') {
    try { CacheService.getScriptCache().put('glbot_ask_' + chatId + '_' + (cq.from.id || ''), 'csfix|' + code + '|' + row, 600); } catch (e) {}
    _glBotAns_(cq.id, '');
    _glBotSend_(chatId, '✍️ اكتب اسم الحساب الصحيح لصف ' + row + ' (أو جزءاً منه أو كوده):', { force_reply: true, selective: true });
    return;
  }
  _glBotAns_(cq.id, '⏳ جارٍ الاعتماد…');
  var r = _glBotCsApprove_(code, row, acc, who.username);
  _glBotEdit_(chatId, msgId, _glBotEsc_(cq.message.text || '') + '\n\n' + r);
}
// ✅ (V4.268) اعتماد أول اقتراح لكل صف ناقص بشيت واحد دفعة واحدة (الصفوف بلا اقتراح تبقى للاختيار اليدوي)
function _glBotCsAllCb_(cq, chatId, msgId, who, code) {
  if (!who || !(_sessionHasPerm_(who, 'admin') || _sessionHasPerm_(who, 'gl.edit'))) { _glBotAns_(cq.id, '⛔ اربط حسابك ومنحه صلاحية تعديل الحسابات — التفاصيل بالرسالة', true); _glBotLinkHelp_(chatId, true); return; }
  _glBotAns_(cq.id, '⏳ جارٍ الاعتماد…');
  var lock = _glLock_(); lock.waitLock(60000);
  try {
    var pv = _glCsSync_(code, who.username, { preview: true }), pick = {}, skipped = 0;
    (pv.pending || []).forEach(function (x) { if (x.sugg && x.sugg.length) pick[x.row] = x.sugg[0].code; else skipped++; });
    if (!Object.keys(pick).length) { _glBotEdit_(chatId, msgId, _glBotEsc_(cq.message.text || '') + '\n\nℹ️ لا توجد اقتراحات للاعتماد — اختر الحساب لكل صف يدوياً'); return; }
    var out = _glCsSync_(code, who.username, { approve: pick });
    _glBotEdit_(chatId, msgId, _glBotEsc_(cq.message.text || '') + '\n\n✅ <b>قُيِّد ' + (out.created || []).length + ' صف</b> بأول اقتراح (بواسطة ' + _glBotEsc_(who.username) + ')' + (skipped ? '\n⏳ بقي ' + skipped + ' صف بلا اقتراح — اخترها يدوياً' : '') + ((out.problems || []).length ? '\n⚠️ ' + (out.problems || []).length + ' مشكلة' : ''));
  } catch (e) { _glBotEdit_(chatId, msgId, _glBotEsc_(cq.message.text || '') + '\n\n⚠️ ' + _glBotEsc_(e.message)); }
  finally { _glUnlock_(lock); }
}
function _glBotCsApprove_(code, row, acc, user) {
  var a = _glAccounts_().map[acc]; if (!a || a.isGroup) return '⚠️ الحساب غير صالح';
  var lock = _glLock_(); lock.waitLock(90000);
  try {
    var pick = {}; pick[row] = acc;
    var out = _glCsSync_(code, user, { approve: pick });
    var hit = (out.created || []).filter(function (x) { return +x.row === +row; })[0];
    if (hit) return '✅ <b>قُيِّد</b> على «' + _glBotEsc_(a.name) + '» — ' + _glBotEsc_(hit.id) + (hit.cc ? ' ⇄ ' + _glFmtN_(hit.cc.amt) + ' ' + ({ EGP: 'جنيه', SAR: 'ريال', USD: 'دولار' }[hit.cc.cur] || hit.cc.cur) + ({ desc: ' (من البيان)', rate: ' (بسعر البيان)', fx: ' (بسعر اليوم)' }[hit.ccSrc] || '') : '') + ' (بواسطة ' + _glBotEsc_(user) + ')';
    var pr = (out.problems || []).filter(function (x) { return +x.row === +row; })[0];
    return pr ? '⚠️ ' + _glBotEsc_(pr.msg) : 'ℹ️ الصف لم يعد بانتظار الاعتماد (قُيِّد أو تغيّر)';
  } catch (e) { return '⚠️ ' + _glBotEsc_(e.message); }
  finally { _glUnlock_(lock); }
}
function _glBotUserCanGl_(username) {
  try {
    var users = typeof getCachedData_ === 'function' ? getCachedData_('users_cache') : null, rec = null;
    if (!users) { var sh = getSpreadsheet_().getSheetByName('Users'); users = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(function (r) { return { username: String(r[0]), active: r[3], permissions: r[4] }; }) : []; }
    users.forEach(function (u) { if (String(u.username).toLowerCase() === String(username).toLowerCase()) rec = u; });
    if (!rec || rec.active === false || String(rec.active) === 'FALSE') return false;
    var s = { username: rec.username, permissions: rec.permissions };
    return _sessionHasPerm_(s, 'admin') || _sessionHasPerm_(s, 'gl.view');
  } catch (e) { return false; }
}
function _glBotRun_(k, arg, inGroup) {
  var E = _glBotEsc_;
  if (k === 'help') return '📖 <b>أوامر الحسابات</b>\n' + GLBOT_CMDS_.filter(function (x) { return x[0] !== 'id'; }).map(function (x) { return (inGroup && x[2] ? '<code>' + x[2] + '</code> أو ' : '') + '<code>' + x[1] + '</code> — ' + E(x[3]); }).join('\n');
  if (k === 'cash') return '💰 <b>النقدية الآن</b>\n' + _glBotCashTxt_(['safe', 'bank']);
  if (k === 'custody') return '👜 <b>العهد الآن</b>\n' + _glBotCashTxt_(['custody']);
  if (k === 'pending') { var pt = _glPendTop_(5); return '⏳ بانتظار الاعتماد: <b>' + (_glPendingCount_() || 0) + '</b>' + (pt.length ? '\n━━━━━━━━━━━━\n' + pt.map(function (x) { return x.txt; }).join('\n') : ''); }
  if (k === 'bal' || k === 'stmt') {
    if (!arg) return 'اكتب الاسم بعد الأمر، مثال: <code>' + (k === 'bal' ? 'رصيد' : 'كشف') + ' شركة النور</code>';
    var hits = _glBotFindAcc_(arg);
    if (!hits.length) return '🔎 لا يوجد حساب يطابق «' + E(arg) + '».';
    if (hits.length > 1) return '🔎 أكثر من حساب — أعد الأمر بالكود:\n' + hits.map(function (a) { return '<code>' + E(a.code) + '</code> ' + E(a.name); }).join('\n');
    var a = hits[0]; _glBotLastAcc_ = a.code;
    if (k === 'bal') return '📊 <b>' + E(a.name) + '</b> (' + E(a.code) + ')\nالرصيد: ' + _glBotBalTxt_(_glBalances_(null)[a.code]);
    var st = _glStmtCore_(a.code, '', '', (function () { var cx = _glStmtCtxFor_(a.code); cx.skipHb = true; return cx; })());
    var rows = st.rows.slice(-15), lbl = { EGP: 'ج', SAR: 'ر', USD: '$' };
    return '📒 <b>كشف ' + E(a.name) + '</b> — آخر ' + rows.length + ' حركة\n' + rows.map(function (x) {
      return E(x.date) + ' · ' + (x.debit ? '+' + _glFmtN_(x.debit) : '−' + _glFmtN_(x.credit)) + ' ' + lbl[x.currency] + ' · ' + E(String(x.desc || '').slice(0, 45));
    }).join('\n') + '\n<b>الرصيد:</b> ' + _glBotBalTxt_(st.closing);
  }
  if (k === 'entry') {
    if (!arg) return 'اكتب رقم القيد أو السند، مثال: <code>قيد REC-00012</code>';
    var id = arg.toUpperCase(), f = _glFindEntry_(id);
    if (!f) { var r0 = null; _glRows_('entries').some(function (r) { if (_glStr_(r[6]) === 'VCH:' + id) { r0 = r; return true; } return false; }); if (r0) f = { r: r0 }; }
    if (!f) return '🔎 لا يوجد قيد/سند برقم «' + E(arg) + '».';
    var eid = _glStr_(f.r[0]), info = _glBotEntryInfo_(eid, f.r, _glLinesOf_(eid)), eo = _glEntryObj_(f.r);
    return '🧾 <b>' + E(info.type) + '</b> ' + E((info.vno ? info.vno + ' · ' : '') + eid) + ' — ' + E(eo.status) + '\n📅 ' + E(info.date) + '\n💰 ' + E(info.amt) + '\n👥 ' + E(info.parties) + '\n📝 ' + E(info.desc) + '\n👤 ' + E(eo.createdBy);
  }
  return '؟';
}


/* ⏳ (V4.333) طابور عمليات الحسابات (Job Queue) — بديل رسالة «البرنامج مشغول… أعد المحاولة».
   كانت عمليات الحسابات (مزامنة/اعتماد/حفظ قيد…) تنتظر قفل الحسابات مدة ثم تفشل برسالة تطلب إعادة المحاولة يدوياً. الآن:
   • الواجهة (_runExec_) ترصد فشل القفل وتُسلِّم العملية بنفسها لـglJobSubmit تلقائياً (بلا تدخل المستخدم) وتتابع حالتها.
   • الطابور: فهرس معرّفات بخصائص السكربت (GLJQ_IDX) + جسم كل عملية ونتيجتها بالكاش المضغوط (6 ساعات). التنفيذ **تتابعي** (FIFO)
     بقفل مسمّى مستقل «jq» (عامل واحد في كل لحظة)، والعملية تأخذ قفل الحسابات بنفسها كأي نداء عادي.
   • العامل يعمل من: نداء التسليم نفسه، ثم كل نداء متابعة (glJobStatus) من أي مستخدم، ثم مهمة الدقيقة (glJobTick_) — فلا تعلق عملية
     لو أُغلقت الصفحة. فشل القفل داخل العامل يُعاد للطابور حتى 4 مرات قبل الإبلاغ.
   • الأمان: لا تُقبل إلا دوال gl* (نفس صلاحيات المستخدم لأن الرمز يُمرَّر لها وتتحقق بنفسها)، والنتيجة لا يقرؤها غير صاحبها. */
var GL_JQ_IDX_ = 'GLJQ_IDX', GL_JQ_TTL_ = 21600, GL_JQ_STALE_MS_ = 400000;
function _glJqIdxMod_(fn) {
  var sl = LockService.getScriptLock(), had = false; try { had = sl.hasLock(); } catch (e0) {}
  if (!had) sl.waitLock(8000);
  try {
    var P = PropertiesService.getScriptProperties(), l = []; try { l = JSON.parse(P.getProperty(GL_JQ_IDX_) || '[]'); } catch (e1) { l = []; }
    var out = fn(l) || l; P.setProperty(GL_JQ_IDX_, JSON.stringify(out.slice(-300))); return out;
  } finally { if (!had) try { sl.releaseLock(); } catch (e2) {} }
}
function _glJqRes_(id) { return _glCGet_('gljqr_' + id); }
function _glJqPut_(id, o) { return _glCPut_('gljqr_' + id, o, GL_JQ_TTL_); }
function _glJqState_(id) {
  if (!id) return { st: 'none' };
  var r = _glJqRes_(id); if (!r) return { st: 'lost' };
  if (r.st === 'running' && Date.now() - (r.t || 0) > GL_JQ_STALE_MS_) { r = { st: 'error', u: r.u, error: 'انقطع تنفيذ العملية (انتهت مهلة التنفيذ) — راجع النتيجة ثم أعدها إن لزم' }; _glJqPut_(id, r); }
  return r;
}
function _glJqRun_(id) {
  var body = _glCGet_('gljqb_' + id), r0 = _glJqRes_(id) || {};
  if (!body) { _glJqPut_(id, { st: 'error', u: r0.u, error: 'انتهت صلاحية العملية بالطابور — أعد المحاولة' }); return; }
  _glJqPut_(id, { st: 'running', u: body.user, t: Date.now(), n: r0.n || 0 });
  try {
    var G = (typeof globalThis !== 'undefined') ? globalThis : this, f = G[body.fn];
    if (typeof f !== 'function') throw new Error('العملية غير معروفة: ' + body.fn);
    var res = f.apply(null, [body.token].concat(body.args || []));
    var put = { st: 'done', u: body.user, result: res === undefined ? null : res };
    if (!_glJqPut_(id, put)) _glJqPut_(id, { st: 'done', u: body.user, big: true });   // نتيجة أكبر من الكاش ⇒ الواجهة تُحدِّث الشاشة
  } catch (e) {
    var msg = String(e && e.message || e), n = (r0.n || 0) + 1;
    if (/الحسابات مشغولة|البرنامج مشغول|مهلة التأمين|lock/i.test(msg) && n < 4) {   // قفل مشغول ⇒ يعود لآخر الطابور (قبل أي كتابة)
      _glJqPut_(id, { st: 'q', u: body.user, n: n });
      _glJqIdxMod_(function (l) { var i = l.indexOf(id); if (i >= 0) l.splice(i, 1); l.push(id); return l; });
      return 'requeued';
    }
    _glJqPut_(id, { st: 'error', u: body.user, error: msg });
  }
  _glJqIdxMod_(function (l) { var i = l.indexOf(id); if (i >= 0) l.splice(i, 1); return l; });
}
// عامل الطابور: ينفّذ بالترتيب حتى تنتهي العملية المنتظَرة (waitId) أو تنفد الميزانية؛ بلا waitId يفرغ ما يستطيع
function _glJqPump_(waitId, budgetMs) {
  var lk = _glNamedLock_('jq');
  if (!lk.tryLock(1500)) return _glJqState_(waitId);
  var t0 = Date.now(), guard = 0;
  try {
    for (;;) {
      if (++guard > 60) break;
      if (waitId) { var cur = _glJqState_(waitId); if (cur.st === 'done' || cur.st === 'error' || cur.st === 'lost') break; }
      var l = []; try { l = JSON.parse(PropertiesService.getScriptProperties().getProperty(GL_JQ_IDX_) || '[]'); } catch (e0) {}
      var next = null;
      for (var i = 0; i < l.length; i++) { var s = _glJqState_(l[i]); if (s.st === 'q') { next = l[i]; break; } if (s.st === 'done' || s.st === 'error' || s.st === 'lost') _glJqIdxMod_(function (L) { var k = L.indexOf(l[i]); if (k >= 0) L.splice(k, 1); return L; }); }
      if (!next) break;
      if (Date.now() - t0 > budgetMs) break;
      _glJqRun_(next);
    }
  } finally { lk.releaseLock(); }
  return _glJqState_(waitId);
}
function glJobSubmit(authToken, fn, args) {
  var session = requireAuth_(authToken);
  fn = String(fn || '');
  if (!/^gl[A-Z][A-Za-z0-9_]*$/.test(fn) || /^glJob/.test(fn)) throw new Error('عملية غير مسموحة بالطابور');
  var G = (typeof globalThis !== 'undefined') ? globalThis : this; if (typeof G[fn] !== 'function') throw new Error('عملية غير معروفة: ' + fn);
  var id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (!_glCPut_('gljqb_' + id, { fn: fn, args: Array.isArray(args) ? args : [], token: authToken, user: session.username }, GL_JQ_TTL_)) throw new Error('حجم العملية أكبر من أن يُوضع بالطابور');
  _glJqPut_(id, { st: 'q', u: session.username, n: 0 });
  _glJqIdxMod_(function (l) { l.push(id); return l; });
  return Object.assign({ success: true, id: id }, _glJqPump_(id, 25000));
}
function glJobStatus(authToken, id) {
  var session = requireAuth_(authToken);
  var s = _glJqState_(id);
  if (s.u && s.u !== session.username) throw new Error('عملية تخص مستخدماً آخر');
  if (s.st === 'q' || s.st === 'running') s = Object.assign({}, _glJqPump_(id, 20000));
  var out = { success: true, st: s.st === 'lost' ? 'error' : s.st };
  if (s.st === 'lost') out.error = 'انتهت صلاحية نتيجة العملية — حدّث الشاشة وتأكد من أثرها';
  if (s.st === 'done') { out.result = s.result; if (s.big) out.big = true; }
  if (s.st === 'error') out.error = s.error;
  return out;
}
// مهمة الدقيقة (من drainTelegramQueue): تفريغ ما تبقى بالطابور حتى لو أُغلقت صفحة صاحبه
function glJobTick_() { try { var P = PropertiesService.getScriptProperties().getProperty(GL_JQ_IDX_); if (P && P !== '[]') _glJqPump_('', 40000); } catch (e) { Logger.log('glJobTick_: ' + e.message); } }
