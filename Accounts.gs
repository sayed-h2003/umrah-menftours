/* ============================================================================
   📒 الحسابات العامة (الدفتر العام بالقيد المزدوج) — V4.206 (المرحلتان 0 و1 + نقل بيانات الـ ERP)
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
  lines:    { name: 'GL_Lines',    headers: ['رقم القيد', 'رقم السطر', 'التاريخ', 'الحالة', 'الحساب', 'مدين', 'دائن', 'العملة', 'سعر الصرف', 'مدين معادل', 'دائن معادل', 'الرحلة', 'الشركة المنفذة', 'العميل', 'الوكيل', 'البيان'] },
  settings: { name: 'GL_Settings', headers: ['المفتاح', 'القيمة'] },
  batches:  { name: 'GL_Batches',  headers: ['رقم الدفعة', 'النوع', 'الوصف', 'عدد القيود', 'الحالة', 'أنشئ بواسطة', 'أنشئ في'] }
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
var GL_ENTRY_TYPES_ = ['قيد يومية', 'سند قبض', 'سند صرف', 'صرف عهدة', 'تسوية عهدة', 'تحويل نقدية', 'تحويل عملة', 'قيد افتتاحي', 'قيد مستورد'];
// الفئة (kind) تحدد سلوك الحساب بالشاشات: خزينة/بنك/عهدة تظهر بلوحة الأرصدة، عميل/وكيل تُربط بكيانات البرنامج
var GL_KINDS_ = { safe: 'خزينة', bank: 'بنك', custody: 'عهدة', client: 'عميل', agent: 'وكيل', supplier: 'مورد', fx: 'وسيط عملات', other: '' };

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
function _glStr_(v) { return String(v == null ? '' : v).trim(); }
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
  } else if (sh.getLastColumn() < def.headers.length) {
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
  }
  return sh;
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
  for (var i = 0; i < rows.length; i++) if (_glStr_(rows[i][0]) === k) { sh.getRange(i + 2, 2).setValue(String(v)); _GL_SET_MEMO_ = null; return; }
  sh.appendRow([k, String(v)]);
  _GL_SET_MEMO_ = null;
}
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
function _glNextChildCode_(parentCode) {
  var accs = _glAccounts_().list, width = parentCode.length === 1 ? 1 : (parentCode.length === 2 ? 2 : 3), max = 0;
  accs.forEach(function (a) {
    if (a.parent === parentCode && a.code.indexOf(parentCode) === 0 && a.code.length === parentCode.length + width) {
      var n = parseInt(a.code.slice(parentCode.length), 10); if (n > max) max = n;
    }
  });
  var next = String(max + 1);
  if (next.length > width) throw new Error('امتلأت أكواد الحسابات تحت ' + parentCode);
  while (next.length < width) next = '0' + next;
  return parentCode + next;
}
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
    settings: _glSettings_(), rates: _glRates_(), types: GL_TYPES_, kinds: GL_KINDS_, entryTypes: GL_ENTRY_TYPES_,
    accounts: accs, balances: bal,
    can: { add: _sessionHasPerm_(session, 'gl.add'), edit: _sessionHasPerm_(session, 'gl.edit'), del: _sessionHasPerm_(session, 'gl.delete') }
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
  logChange_(session.username, 'تعديل إعدادات الحسابات العامة', 'GL:settings', '-', '-', JSON.stringify(s));
  return { success: true, settings: _glSettings_(), rates: _glRates_() };
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
// ربط تلقائي: حساب لكل عميل (تحت 1201) ولكل وكيل سعودي (تحت 2101) لا يوجد له حساب بعد
function glSyncParties(authToken) {
  var session = _glPerm_(authToken, 'add');
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
  if (!opts.allowBeforeStart && type !== 'قيد افتتاحي' && type !== 'قيد مستورد' && _glDKey_(date) < _glDKey_(set.startDate)) {
    throw new Error('تاريخ القيد قبل تاريخ بداية الحسابات (' + set.startDate + ') — استخدم الأرصدة الافتتاحية أو الاستيراد المجمّع للبيانات القديمة');
  }
  var lines = [], dB = 0, cB = 0, curs = {}, dC = {}, cC = {};
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
    var rate = cur === 'EGP' ? 1 : (_glNum_(l.rate) || rates[cur]);
    if (!(rate > 0)) throw new Error('السطر ' + (i + 1) + ': سعر الصرف مطلوب');
    var bd = _glR2_(d * rate), bc = _glR2_(c * rate);
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
    throw new Error('القيد غير متوازن بعملة الأساس: المدين المعادل ' + _glR2_(dB) + ' ≠ الدائن المعادل ' + _glR2_(cB) + ' جنيه');
  }
  return { date: date, type: type, lines: lines, totalBase: _glR2_(dB) };
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
    var v = _glValidate_(e);
    var status = post ? GL_ST_POSTED_ : GL_ST_DRAFT_;
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    if (isEdit) {
      var f = _glFindEntry_(_glStr_(e.id));
      if (!f) throw new Error('القيد غير موجود');
      if (_glStr_(f.r[5]) !== GL_ST_DRAFT_) throw new Error('لا يُعدَّل إلا القيد المسودة — القيد المرحّل يُلغى ويُسجَّل غيره');
      var w = _glWriteEntry_(v, { id: f.r[0], seq: f.r[1], status: status, sourceKey: f.r[6], batchId: f.r[7], desc: e.desc, ref: e.ref, trip: e.trip, company: e.company,
        createdBy: f.r[12], createdAt: f.r[13], row: f.row }, session.username);
      eSh.getRange(f.row, 1, 1, w.eRow.length).setValues([w.eRow]);
      _glDeleteLinesOf_([_glStr_(f.r[0])]);
      lSh.getRange(lSh.getLastRow() + 1, 1, w.lRows.length, w.lRows[0].length).setValues(w.lRows);
      logChange_(session.username, post ? 'تعديل وترحيل قيد' : 'تعديل قيد مسودة', 'GL:' + f.r[0], 'القيد', '-', v.type + ' — ' + _glStr_(e.desc) + ' — ' + v.totalBase + ' ج');
      return { success: true, id: _glStr_(f.r[0]), status: status };
    }
    var seq = _glNextEntrySeq_(1), id = _glEntryId_(seq);
    var w2 = _glWriteEntry_(v, { id: id, seq: seq, status: status, sourceKey: e.sourceKey, desc: e.desc, ref: e.ref, trip: e.trip, company: e.company }, session.username);
    eSh.getRange(eSh.getLastRow() + 1, 1, 1, w2.eRow.length).setValues([w2.eRow]);
    lSh.getRange(lSh.getLastRow() + 1, 1, w2.lRows.length, w2.lRows[0].length).setValues(w2.lRows);
    logChange_(session.username, post ? 'تسجيل وترحيل قيد' : 'تسجيل قيد مسودة', 'GL:' + id, 'القيد', '-', v.type + ' — ' + _glStr_(e.desc) + ' — ' + v.totalBase + ' ج');
    return { success: true, id: id, status: status };
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
    return { success: true };
  } finally { lock.releaseLock(); }
}
function _glEntryObj_(r) {
  return { id: _glStr_(r[0]), seq: r[1], date: _glDate_(r[2]), type: _glStr_(r[3]), desc: _glStr_(r[4]), status: _glStr_(r[5]),
    sourceKey: _glStr_(r[6]), batchId: _glStr_(r[7]), totalBase: _glNum_(r[8]), ref: _glStr_(r[9]), trip: _glStr_(r[10]), company: _glStr_(r[11]),
    createdBy: _glStr_(r[12]), createdAt: _glStr_(r[13]), postedBy: _glStr_(r[14]), postedAt: _glStr_(r[15]),
    updatedBy: _glStr_(r[16]), updatedAt: _glStr_(r[17]), voidReason: _glStr_(r[18]) };
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
      var hay = _glNorm_([e.id, e.desc, e.ref, e.type, e.trip, e.company].concat(ls.map(function (l) { return l.desc + ' ' + l.client + ' ' + l.agent + ' ' + l.trip; })).join(' '));
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
  _glPerm_(authToken, 'add');
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
  var session = _glPerm_(authToken, 'add');
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
  var session = _glPerm_(authToken, 'delete');
  batchId = _glStr_(batchId);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var eSh = _glSheet_('entries'), rows = _glRows_('entries'), ids = [], now = _glNow_();
    rows.forEach(function (r, i) {
      if (_glStr_(r[7]) !== batchId || _glStr_(r[5]) === GL_ST_VOID_) return;
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
  _glPerm_(authToken, 'add');
  var p = _glErpPlan_(url, opts);
  var byParent = {};
  p.accounts.forEach(function (a) { var k = a.parent; var o = (byParent[k] = byParent[k] || { parent: k, name: (_glAccounts_().map[k] || {}).name || k, n: 0, newN: 0, reuse: 0 }); o.n++; if (a.action === 'new') o.newN++; if (a.action === 'reuse') o.reuse++; });
  var done = _glRows_('batches').filter(function (r) { return _glStr_(r[1]) === 'نقل بيانات الـ ERP' && _glStr_(r[4]) === 'فعّالة'; }).map(function (r) { return _glStr_(r[0]); });
  return { success: true, erpName: p.erpName, cutoff: p.cutoff, rates: p.rates, openYear: p.openYear, openYears: p.openYears, stats: p.stats,
    accounts: p.accounts, totals: p.totals, groups: Object.keys(byParent).map(function (k) { return byParent[k]; }),
    after: p.after.map(function (v) { return { vid: v.vid, date: v.date, desc: v.desc, n: v.lines.length, balanced: v.balanced, amt: v.amt }; }),
    alreadyMigrated: done };
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
    _glSetSetting_('erp_rate_SAR_' + p.cutoff.replace(/\//g, ''), rates.SAR);
    _glSetSetting_('erp_rate_USD_' + p.cutoff.replace(/\//g, ''), rates.USD);
    logChange_(session.username, 'نقل بيانات الـ ERP إلى الحسابات العامة', 'GL:' + batchId, 'النقل', '-',
      newRows.length + ' حساب جديد، ' + validated.length + ' قيد، ' + lRows.length + ' سطر' + (skipped.length ? '، تُخطّي ' + skipped.length + ' مستند غير متوازن' : ''));
    return { success: true, batchId: batchId, newAccounts: newRows.length, entries: validated.length, lines: lRows.length, diff: diff, skipped: skipped };
  } finally { lock.releaseLock(); }
}
