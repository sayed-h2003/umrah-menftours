
// ==========================================================
// إصدار البرنامج - يُحدَّث يدوياً (رقم النسخة فقط) بعد كل تعديل
// لتتبع آخر نسخة مرفوعة، ويظهر تلقائياً في الشريط الجانبي وصفحة كشف الحساب
// ==========================================================
var APP_VERSION = "7.15.0";

// سقف عدد صفوف نتائج شاشة "كل الحجوزات" المُرسلة للمتصفح في الطلب الواحد
var BOOKINGS_RESULT_CAP_ = 1500;


// ==========================================================
// مقارنة أسماء الأطراف بشكل متسامح — إزالة التشكيل واختلافات
// الألف/الياء/التاء المربوطة والمسافات الزائدة. سبب الحاجة:
// الاسم في شيت المصدر قد يختلف بحرف "ي/ى" أو مسافة زائدة عن
// نفس الاسم في سجل الدفعات، فيفشل مطابقة كشف الحساب رغم أن
// المستخدم يرى نفس الاسم في القائمة.
// ==========================================================
function normalizeName_(s) {
  if (s === null || s === undefined) return '';
  return s.toString()
    .replace(/[​-‏؜﻿]/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}
var APP_VERSION_DATE = "24/09/2026";

// ==========================================================
// 🔒 (7.15.0) حمايات عامة
// ==========================================================
// دوال الإعداد/الصيانة التي تُشغَّل يدويًا من محرر السكربت فقط: كانت عامة بلا أي فحص، فأي زائر
// لرابط التطبيق (بما فيه بوابة العملاء العامة) يستطيع استدعاءها عبر google.script.run. الآن لا تعمل
// إلا لصاحب السكربت نفسه (المحرر، أو هو شخصيًا من المتصفح).
function requireScriptOwner_() {
  var a = '', e = '';
  try { a = Session.getActiveUser().getEmail() || ''; } catch (x) {}
  try { e = Session.getEffectiveUser().getEmail() || ''; } catch (x) {}
  if (!a || !e || a.toLowerCase() !== e.toLowerCase()) throw new Error('هذه الدالة تُشغَّل من محرر السكربت بواسطة صاحبه فقط');
}
// منع حقن المعادلات: نص يبدأ بـ = + - @ يُكتب في الشيت كمعادلة تُنفَّذ. نُسبقه بعلامة ' فيُحفظ نصًا
// كما هو (لا تظهر العلامة في الخلية). الأرقام الحقيقية والتواريخ لا تُلمس.
function cellSafe_(v) {
  if (typeof v !== 'string') return v;
  if (/^[=+\-@]/.test(v) && !/^[-+]?\d+([.,]\d+)?$/.test(v.trim())) return "'" + v;
  return v;
}

// ==========================================================
// تسجيل الدخول والصلاحيات
// ==========================================================
// المستخدمون في شيت "المستخدمون" داخل ملف البرنامج نفسه (وليس ملف المصدر الخارجي).
// كلمة المرور تُخزَّن كـ hash (SHA-256 + ملح فريد لكل مستخدم) — لا نص صريح أبدًا.
// الجلسات تُخزَّن في خصائص السكربت (PropertiesService) ككائن واحد {token: {username, expiresAt}}؛
// أبسط من شيت منفصل، وتُنظَّف الجلسات المنتهية تلقائيًا عند كل قراءة.
var USERS_SHEET_NAME = 'المستخدمون';
var SESSIONS_PROP_KEY_ = 'ACTIVE_SESSIONS';
var SESSION_DURATION_PROP_KEY_ = 'SESSION_DURATION_MIN';
var DEFAULT_SESSION_DURATION_MIN = 60;
// أسماء الشاشات القابلة للتحكم بصلاحية الوصول إليها — نفس مفاتيح الصفحات في showPage(key).
// "import" و"users" ليستا هنا عمدًا: وصولهما محكوم فقط بالدور (مدير) مباشرة على مستوى
// الواجهة والخادم معًا (استيراد/مزامنة الدفعات القديمة صلاحية مدير فقط بلا استثناء —
// وضع مؤقت — وشاشة إدارة المستخدمين بديهيًا لا تُمنح كصلاحية عادية قابلة للتفعيل لمستخدم عادي)
// "balancesReport" (بيان الأرصدة بتاريخ محدد) صلاحية مستقلة تمامًا عن "arrivals" رغم أن
// زر فتحه موجود داخل شاشة متابعة الأرصدة — طلب صريح من المستخدم: مستخدم يملك وصولًا
// لمتابعة الأرصدة لا يرى هذا التقرير تلقائيًا إلا بمنحه هذه الصلاحية تحديدًا
// "clientPortal" (بوابة العملاء) صلاحية واحدة تحكم كل إدارة البوابة: إنشاء/إعادة تعيين كلمة
// المرور/تعطيل/تفعيل/حذف اللينك + التحكم بعرض أسعار البيع للعميل — طلب صريح: مشاركة اللينك
// وإدارته صلاحية واحدة لا تتجزأ
// "statsReport" (الإحصائيات الشاملة) صلاحية مستقلة تمامًا: مبيعات/تكلفة/ربح لكل مورد وعميل
// ومسؤول بيع + أعلى الفنادق/العملاء/الموردين — طلب صريح: تقرير مالي حساس يُمنَح تحديدًا
var ALL_SCREENS_ = ['statement', 'bookings', 'arrivals', 'balancesReport', 'statsReport', 'payments', 'clientPortal', 'settings', 'changelog'];
var SCREEN_LABELS_SRV_ = { statement: 'كشف الحساب', bookings: 'كل الحجوزات', arrivals: 'متابعة الأرصدة', balancesReport: 'بيان الأرصدة بتاريخ محدد', statsReport: 'الإحصائيات', payments: 'الدفعات', clientPortal: 'بوابة العملاء', settings: 'الإعدادات', changelog: 'سجل التعديلات' };

// ==========================================================
// نظام الصلاحيات الهرمي (4 مستويات لكل شاشة) — يطابق تصميم "بوابة الصلاحيات" المتفق
// عليه: اختيار مستوى واحد فقط لكل شاشة يمنح تلقائيًا كل ما دونه (لا حاجة لصناديق اختيار
// منفصلة قد تؤدي لحالات متناقضة مثل "حذف" بدون "عرض"). تُخزَّن المستويات كنصوص داخل نفس
// عمود "الصلاحيات (JSON)" في شيت المستخدمون — كل مفتاح شاشة يحمل قيمة من PERM_LEVELS_
// بدل true/false كما كانت في المرحلة الأولى (ترحيل توافقي في userRecordFromRow_ أدناه).
// ==========================================================
var PERM_LEVELS_ = ['none', 'view', 'add', 'edit', 'delete'];
var PERM_LEVEL_LABELS_ = { none: 'بدون', view: 'عرض', add: 'إضافة', edit: 'تعديل', delete: 'حذف' };
function permLevelRank_(level) {
  var i = PERM_LEVELS_.indexOf(level);
  return i < 0 ? 0 : i;
}
// true = يملك المستخدم مستوى requiredLevel على الأقل لهذه الشاشة (المدير يملك كل شيء دائمًا)
function hasScreenLevel_(user, screenKey, requiredLevel) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return permLevelRank_(user.permissions && user.permissions[screenKey]) >= permLevelRank_(requiredLevel);
}
// الحماية الفعلية (وليست مجرد إخفاء أزرار بالواجهة): تُستدعى في بداية كل دالة حفظ/حذف
// حساسة — ترمي استثناء فورًا لو كانت الجلسة غير صالحة أو المستوى غير كافٍ، فيُرفض التنفيذ
// من الخادم بصرف النظر عمّا تعرضه الواجهة للمستخدم
function requirePermission_(token, screenKey, requiredLevel) {
  var user = requireSession_(token);
  if (!hasScreenLevel_(user, screenKey, requiredLevel)) {
    throw new Error('لا تملك صلاحية "' + (PERM_LEVEL_LABELS_[requiredLevel] || requiredLevel) + '" في شاشة "' + (SCREEN_LABELS_SRV_[screenKey] || screenKey) + '"');
  }
  return user;
}

// ---- تقييد شاشة الحجوزات على مدينة محددة (مكة أو المدينة فقط) ----
// مخزَّنة كمفتاح إضافي (bookingCityScope) داخل نفس عمود الصلاحيات — 'all' (افتراضي) تعني بلا
// قيد؛ أي قيمة أخرى ('مكة' أو 'المدينة') تحصر المستخدم على تلك المدينة فقط، فرضًا فعليًا من
// الخادم في searchBookings/editBookingField — وليس فقط إخفاء فلتر المدينة بالواجهة
function bookingCityAllowed_(user, city) {
  if (!user || user.role === 'admin') return true;
  if (!user.bookingCityScope || user.bookingCityScope === 'all') return true;
  return user.bookingCityScope === city;
}

// ---- صلاحية الجانب المالي في الحجوزات (مستقلة تمامًا عن صلاحية شاشة الحجوزات نفسها) ----
// 4 مستويات هرمية: بدون < تكلفة (أسعار وإجمالي التكلفة) < بيع (أسعار وإجمالي البيع، وتشمل
// التكلفة تلقائيًا) < الفرق (أعلى مستوى، ويشمل ما دونه). تُخزَّن كمفتاح financeLevel داخل نفس
// عمود الصلاحيات. الإنفاذ الفعلي: searchBookings تحذف (تُرجع null/فارغ) لأي بيانات مالية
// لا يملك المستخدم مستوى كافٍ لرؤيتها — قبل إرسال الرد للمتصفح، وليس مجرد إخفاء عمود بالواجهة
var FINANCE_LEVELS_ = ['none', 'cost', 'sale', 'diff'];
var FINANCE_LEVEL_LABELS_ = { none: 'بدون', cost: 'أسعار وإجمالي التكلفة', sale: 'أسعار وإجمالي البيع (وتشمل التكلفة)', diff: 'الفرق (وتشمل البيع والتكلفة)' };
function financeLevelRank_(level) {
  var i = FINANCE_LEVELS_.indexOf(level);
  return i < 0 ? 0 : i;
}
function hasFinanceLevel_(user, minLevel) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return financeLevelRank_(user.financeLevel) >= financeLevelRank_(minLevel);
}
// يحذف حقول التكلفة/البيع (وأسعار الغرف الفردية المرتبطة بها ضمن raw[]) من صفوف نتائج
// searchBookings حسب مستوى المستخدم — يُطبَّق دائمًا قبل إرجاع النتيجة للمتصفح
function redactBookingFinance_(rows, user) {
  var showCost = hasFinanceLevel_(user, 'cost');
  var showSale = hasFinanceLevel_(user, 'sale');
  if (showCost && showSale) return rows;
  rows.forEach(function (r) {
    if (!showCost) {
      r.cost = null; r.hasCost = false;
      if (r.raw) [21, 22, 23, 24].forEach(function (i) { r.raw[i] = ''; });
    }
    if (!showSale) {
      r.sale = null; r.hasSale = false;
      if (r.raw) [25, 26, 27, 28].forEach(function (i) { r.raw[i] = ''; });
    }
  });
  return rows;
}

// ---- تقييد العرض على حسابات محددة (ضمن كشف الحساب فقط) ----
// شيت جديد منفصل: كل صف = (مستخدم، اسم حساب، نوعه، مستوى الوصول لهذا الحساب تحديدًا).
// وضع المستخدم العام (accountScope داخل عمود الصلاحيات: 'all'|'restricted') يقرر هل تُطبَّق
// هذه القائمة أصلًا: 'all' تعني وصول لكل الحسابات دون قيد رغم وجود صفوف هنا أو عدمه.
var ACCOUNT_PERMS_SHEET_NAME = 'صلاحيات الحسابات';
function ensureAccountPermsSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(ACCOUNT_PERMS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ACCOUNT_PERMS_SHEET_NAME);
    sh.getRange(1, 1, 1, 4).setValues([['اسم المستخدم', 'اسم الحساب', 'النوع', 'المستوى']]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function getUserAccountPerms_(username) {
  var sh = ensureAccountPermsSheet_();
  if (sh.getLastRow() < 2) return [];
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var norm = (username || '').toString().trim().toLowerCase();
  var out = [];
  data.forEach(function (r) {
    if ((r[0] || '').toString().trim().toLowerCase() === norm) {
      out.push({ name: r[1], type: r[2] === 'مورد' ? 'supplier' : 'client', level: r[3] === 'edit' ? 'edit' : 'view' });
    }
  });
  return out;
}
// يستبدل كامل قائمة الحسابات المسموحة لمستخدم معيّن دفعة واحدة (يُستدعى من createUser/updateUser)
function setUserAccountPerms_(username, list) {
  var sh = ensureAccountPermsSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var data = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    var norm = (username || '').toString().trim().toLowerCase();
    for (var i = data.length - 1; i >= 0; i--) {
      if ((data[i][0] || '').toString().trim().toLowerCase() === norm) sh.deleteRow(i + 2);
    }
  }
  (list || []).forEach(function (a) {
    if (!a || !a.name) return;
    sh.appendRow([username, a.name, a.type === 'supplier' ? 'مورد' : 'عميل', a.level === 'edit' ? 'edit' : 'view']);
  });
}
// هل يملك هذا المستخدم صلاحية الوصول لحساب "partyName" تحديدًا ضمن كشف الحساب؟
// (المدير ومستخدم بنطاق 'all' يمرّان دائمًا؛ المقيَّد يُفحص اسمه في قائمته الخاصة)
function statementAccountAllowed_(user, partyName) {
  if (user.role === 'admin' || user.accountScope !== 'restricted') return true;
  var accounts = getUserAccountPerms_(user.username);
  var norm = normalizeName_(partyName);
  return accounts.some(function (a) { return normalizeName_(a.name) === norm; });
}
function getUserAccountPerms(token, username) {
  try {
    requireAdmin_(token);
    return safeReturn_(getUserAccountPerms_(username));
  } catch (e) {
    return safeReturn_({ error: e.message });
  }
}

function ensureUsersSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(USERS_SHEET_NAME);
    sh.getRange(1, 1, 1, 8).setValues([[
      'اسم المستخدم', 'الاسم الظاهر', 'ملح', 'كلمة المرور (مشفّرة)', 'الدور', 'الصلاحيات (JSON)', 'نشط', 'تاريخ الإنشاء'
    ]]);
    sh.setFrozenRows(1);
    // مستخدم افتراضي واحد فقط عند إنشاء الشيت لأول مرة — بدونه لا يمكن الدخول للبرنامج
    // إطلاقًا (مشكلة "الدجاجة والبيضة"). يجب تغيير كلمة المرور فورًا من داخل البرنامج.
    var salt = Utilities.getUuid();
    sh.appendRow(['admin', 'المدير', salt, hashPassword_('admin123', salt), 'admin', '{}', true, new Date()]);
  }
  return sh;
}

function hashPassword_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function findUserRow_(sh, username) {
  var data = sh.getDataRange().getValues();
  var norm = (username || '').toString().trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim().toLowerCase() === norm) return i + 1; // 1-based لاستخدامه مباشرة مع getRange
  }
  return -1;
}

// role='admin' يملك كل الصلاحيات (أعلى مستوى) تلقائيًا بصرف النظر عمّا هو مخزَّن بالعمود.
// ترحيل توافقي: صلاحيات المرحلة الأولى كانت true/false فقط (وصول/لا وصول) — قيمة true
// القديمة تُقرأ الآن كمستوى 'edit' (أقرب تعبير لما كانت تمنحه فعليًا) دون أي تعديل على
// البيانات المخزَّنة نفسها؛ أول حفظ لاحق من شاشة إدارة المستخدمين الجديدة يكتب مستوى صريحًا.
function userRecordFromRow_(row) {
  var saved = {};
  try { saved = JSON.parse(row[5] || '{}'); } catch (e) {}
  var isAdmin = row[4] === 'admin';
  var permissions = {};
  ALL_SCREENS_.forEach(function (s) {
    if (isAdmin) { permissions[s] = 'delete'; return; }
    var v = saved[s];
    if (v === true) permissions[s] = 'edit';
    else if (PERM_LEVELS_.indexOf(v) !== -1) permissions[s] = v;
    else permissions[s] = 'none';
  });
  var bookingCityScope = (!isAdmin && (saved.bookingCityScope === 'مكة' || saved.bookingCityScope === 'المدينة')) ? saved.bookingCityScope : 'all';
  var financeLevel = (!isAdmin && FINANCE_LEVELS_.indexOf(saved.financeLevel) !== -1) ? saved.financeLevel : (isAdmin ? 'diff' : 'none');
  return {
    username: row[0], displayName: row[1] || row[0], role: isAdmin ? 'admin' : 'user',
    permissions: permissions,
    accountScope: (!isAdmin && saved.accountScope === 'restricted') ? 'restricted' : 'all',
    bookingCityScope: bookingCityScope,
    financeLevel: financeLevel,
    // تفضيلات الواجهة الشخصية (تخصيص/ترتيب/عرض أعمدة الجداول، وترتيب الفرز) — خزن حر داخل
    // نفس عمود "الصلاحيات (JSON)" تحت مفتاح uiPrefs، فتبقى محفوظة بالحساب لا بالمتصفح، وتصل
    // العميل تلقائيًا ضمن بيانات المستخدم عند كل دخول أو تحقّق من الجلسة بلا نداء إضافي
    uiPrefs: (saved.uiPrefs && typeof saved.uiPrefs === 'object') ? saved.uiPrefs : {},
    active: row[6] !== false
  };
}

function readSessions_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SESSIONS_PROP_KEY_);
  var all = raw ? JSON.parse(raw) : {};
  var now = Date.now(), changed = false;
  Object.keys(all).forEach(function (tok) { if (!all[tok] || all[tok].expiresAt < now) { delete all[tok]; changed = true; } });
  if (changed) writeSessions_(all);
  return all;
}
function writeSessions_(all) {
  PropertiesService.getScriptProperties().setProperty(SESSIONS_PROP_KEY_, JSON.stringify(all));
}

function getSessionDurationMinutes() {
  return Number(PropertiesService.getScriptProperties().getProperty(SESSION_DURATION_PROP_KEY_)) || DEFAULT_SESSION_DURATION_MIN;
}
function setSessionDurationMinutes(token, minutes) {
  try {
    var admin = requireAdmin_(token);
    minutes = parseInt(minutes, 10);
    if (!minutes || minutes < 5 || minutes > 1440) throw new Error('المدة يجب أن تكون بين 5 دقائق و24 ساعة (1440 دقيقة)');
    PropertiesService.getScriptProperties().setProperty(SESSION_DURATION_PROP_KEY_, String(minutes));
    logChange_(admin, 'الإعدادات', '', 'تغيير مدة الجلسة الافتراضية', '', minutes + ' دقيقة');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function login(username, password) {
  try {
    username = (username || '').toString().trim();
    if (!username || !password) throw new Error('اسم المستخدم وكلمة المرور مطلوبان');
    var sh = ensureUsersSheet_();
    var rowIdx = findUserRow_(sh, username);
    if (rowIdx === -1) throw new Error('بيانات الدخول غير صحيحة');
    var row = sh.getRange(rowIdx, 1, 1, 8).getValues()[0];
    if (row[6] === false) throw new Error('هذا الحساب معطَّل — تواصل مع المدير');
    if (hashPassword_(password, row[2]) !== row[3]) throw new Error('بيانات الدخول غير صحيحة');
    var user = userRecordFromRow_(row);
    var minutes = getSessionDurationMinutes();
    var token = Utilities.getUuid();
    var sessions = readSessions_();
    sessions[token] = { username: user.username, expiresAt: Date.now() + minutes * 60000 };
    writeSessions_(sessions);
    logChange_(user, 'الدخول', user.username, 'تسجيل دخول', '', '');
    return safeReturn_({ ok: true, token: token, user: user, sessionMinutes: minutes });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// تُستدعى عند فتح البرنامج (بعد قراءة أي رمز جلسة محفوظ محليًا) وأيضًا دوريًا من الواجهة
// للتأكد من استمرار صلاحية الجلسة. أهم دالة على الأداء: تُستدعى مرات كثيرة في الدقيقة
// من كل تبويب مفتوح. تحسينات جذرية:
// 1) كاش داخل نفس التنفيذ (SESSION_MEMO_) — نداءات متتابعة تعيد نفس النتيجة بلا عمل
// 2) كاش عبر التنفيذات (ScriptCache 30ث) لبطاقة المستخدم — الأصل هو الشيت لكن قراءته
//    عملية شبكية ثقيلة، وتغيّرات المستخدم نادرة، فالتبريد بلا خسارة عملية
// 3) الكتابة إلى خصائص السكربت (writeSessions_) هي أبطأ عملية هنا — كل نداء كان يكتب
//    فقط لتمديد الجلسة. الآن: نكتب فقط إذا اقتربت الجلسة من الانتهاء (أقل من 15 دقيقة
//    متبقية). للمستخدم النشط يعني كتابة واحدة كل ~50 دقيقة بدل واحدة كل دقيقة
var SESSION_MEMO_ = {};
var SESSION_CACHE_TTL_ = 30;   // ثوانٍ — قصير جدًا حتى تُلتقط قيود الجلسة والصلاحيات بسرعة
function checkSession(token) {
  try {
    if (!token) return { ok: false };
    if (SESSION_MEMO_[token]) return SESSION_MEMO_[token];   // نفس التنفيذ

    var cache = null;
    try { cache = CacheService.getScriptCache(); } catch (e) {}
    var cacheKey = 'sess_' + token;
    if (cache) {
      var cached = cache.get(cacheKey);
      if (cached) {
        var obj = null;
        try { obj = JSON.parse(cached); } catch (e2) {}
        if (obj) { SESSION_MEMO_[token] = obj; return obj; }
      }
    }

    var sessions = readSessions_();
    var sess = sessions[token];
    if (!sess) return { ok: false };
    var sh = ensureUsersSheet_();
    var rowIdx = findUserRow_(sh, sess.username);
    if (rowIdx === -1) return { ok: false };
    var row = sh.getRange(rowIdx, 1, 1, 8).getValues()[0];
    if (row[6] === false) return { ok: false };
    var minutes = getSessionDurationMinutes();
    // تمديد كسول: لا نكتب على القرص إلا إذا اقتربنا فعلاً من الانتهاء — يقلّل كتابات
    // PropertiesService من ~عشرات في الدقيقة إلى واحدة كل ~50 دقيقة للمستخدم النشط
    var remaining = (sess.expiresAt || 0) - Date.now();
    if (remaining < 15 * 60000) {
      sessions[token].expiresAt = Date.now() + minutes * 60000;
      writeSessions_(sessions);
    }
    var out = safeReturn_({ ok: true, user: userRecordFromRow_(row), sessionMinutes: minutes });
    SESSION_MEMO_[token] = out;
    if (cache) { try { cache.put(cacheKey, JSON.stringify(out), SESSION_CACHE_TTL_); } catch (e3) {} }
    return out;
  } catch (e) {
    return { ok: false };
  }
}
// أي تغيير في المستخدم أو الجلسة يجب أن يمسح الكاش وإلا بقيت البيانات القديمة حتى انتهاء
// TTL — تُستدعى من كل دالة تكتب في شيت المستخدمين أو خصائص الجلسات
function invalidateSessionCache_(token) {
  SESSION_MEMO_ = {};
  try {
    var cache = CacheService.getScriptCache();
    if (token) cache.remove('sess_' + token);
    // لا يمكن مسح كل المفاتيح — نعتمد على TTL 30 ثانية للجلسات الأخرى
  } catch (e) {}
}

function logout(token) {
  try {
    var sessions = readSessions_();
    var s = sessions[token];
    if (s) {
      delete sessions[token];
      writeSessions_(sessions);
      invalidateSessionCache_(token);
      presenceLeave_(s.username);
      logChange_(s.username, 'الخروج', s.username, 'تسجيل خروج', '', '');
    }
    return { ok: true };
  } catch (e) { return { ok: false }; }
}

// يُرجع بيانات المستخدم صاحب الجلسة أو يرمي استثناء لو كانت الجلسة غير صالحة/منتهية —
// تُستخدَم في أي دالة خادم تحتاج معرفة "مَن قام بهذا الإجراء" أو تفرض قيدًا على الوصول
function requireSession_(token) {
  var res = checkSession(token);
  if (!res.ok) throw new Error('انتهت صلاحية الجلسة — الرجاء تسجيل الدخول من جديد');
  return res.user;
}
function requireAdmin_(token) {
  var user = requireSession_(token);
  if (user.role !== 'admin') throw new Error('هذا الإجراء يتطلب صلاحية المدير');
  return user;
}

function changeOwnPassword(token, oldPassword, newPassword) {
  try {
    var user = requireSession_(token);
    if (!newPassword || newPassword.toString().length < 3) throw new Error('كلمة المرور الجديدة قصيرة جدًا (3 أحرف على الأقل)');
    var sh = ensureUsersSheet_();
    var rowIdx = findUserRow_(sh, user.username);
    if (rowIdx === -1) throw new Error('المستخدم غير موجود');
    var row = sh.getRange(rowIdx, 1, 1, 8).getValues()[0];
    if (hashPassword_(oldPassword, row[2]) !== row[3]) throw new Error('كلمة المرور الحالية غير صحيحة');
    var newSalt = Utilities.getUuid();
    sh.getRange(rowIdx, 3, 1, 2).setValues([[newSalt, hashPassword_(newPassword, newSalt)]]);
    invalidateUserRecordCache_(user.username);
    logChange_(user, 'المستخدمون', user.username, 'تغيير كلمة المرور الشخصية', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// يحفظ تفضيلات واجهة المستخدم الحالي (تخصيص/عرض/ترتيب أعمدة الجداول في كل شاشة، وحالة
// الفرز) — تُستبدَل كليًا بما يُرسَل هنا في كل مرة (العميل يرسل الكائن الكامل دائمًا، لا
// تصحيحًا جزئيًا)، فلا حاجة لدمج حقل بحقل هنا. لا صلاحية شاشة مطلوبة أبعد من جلسة صالحة —
// كل مستخدم يملك تفضيلاته الشخصية بصرف النظر عن الشاشات المتاحة له. لا سجل تعديلات لهذا
// (logChange_) عمدًا: تغيير عرض عمود بالسحب ليس "حدثًا" يستحق التوثيق في سجل التعديلات
function saveUserUiPrefs(token, prefs) {
  try {
    var user = requireSession_(token);
    var sh = ensureUsersSheet_();
    var rowIdx = findUserRow_(sh, user.username);
    if (rowIdx === -1) throw new Error('المستخدم غير موجود');
    var cell = sh.getRange(rowIdx, 6); // العمود F: الصلاحيات (JSON) — نفس عمود إعدادات المستخدم الأخرى
    var saved = {};
    try { saved = JSON.parse(cell.getValue() || '{}'); } catch (e) {}
    saved.uiPrefs = (prefs && typeof prefs === 'object') ? prefs : {};
    cell.setValue(JSON.stringify(saved));
    invalidateUserRecordCache_(user.username);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ==========================================================
// المتصلون الآن — مبنية كليًا على CacheService (ذاكرة مؤقتة سريعة) بلا أي قراءة/كتابة في
// الشيت: مفتاح لكل مستخدم بمهلة صلاحية = نافذة "متصل" نفسها، فيختفي تلقائيًا بمجرد توقّف
// نبضاته (إغلاق التبويب/انقطاع/خمول) بلا أي تنظيف يدوي. مفتاح فهرس واحد يحمل أسماء المستخدمين
// فقط (يُكتب نادرًا: عند أول ظهور لمستخدم) لقراءة الكل بنداء getAll واحد. نبضة كل مستخدم
// تكتب مفتاحه هو فقط، فلا يدهس مستخدمان نبضة بعضهما حتى لو تزامنا
// ==========================================================
var PRESENCE_TTL_SEC_ = 150;              // بلا نبضة خلال هذه المدة ⇐ غير متصل
var PRESENCE_IDX_KEY_ = 'pres_idx_v1';
function presenceKey_(username) { return 'pres_u_' + String(username || '').trim().toLowerCase(); }
function presenceReadAll_(cache) {
  var idx = [];
  try { idx = JSON.parse(cache.get(PRESENCE_IDX_KEY_) || '[]') || []; } catch (e) { idx = []; }
  var keys = idx.map(presenceKey_);
  var got = keys.length ? cache.getAll(keys) : {};
  var online = [], alive = [];
  idx.forEach(function (u) {
    var raw = got[presenceKey_(u)];
    if (!raw) return;
    try { var rec = JSON.parse(raw); online.push({ username: u, name: rec.name || u }); alive.push(u); } catch (e) {}
  });
  return { online: online, idx: idx, alive: alive };
}
function presencePing(token) {
  try {
    var user = requireSession_(token);
    var cache = CacheService.getScriptCache();
    var me = String(user.username || '').trim().toLowerCase();
    cache.put(presenceKey_(me), JSON.stringify({ name: user.displayName || user.username, ts: Date.now() }), PRESENCE_TTL_SEC_);
    var st = presenceReadAll_(cache);
    // الفهرس يُعاد كتابته فقط لو تغيّر فعلًا (أُضيف مستخدم جديد أو زال منتهٍ) — لا في كل نبضة
    var alive = st.alive.slice();
    if (alive.indexOf(me) === -1) { alive.push(me); st.online.push({ username: me, name: user.displayName || user.username }); }
    if (alive.length !== st.idx.length || alive.some(function (u) { return st.idx.indexOf(u) === -1; })) {
      cache.put(PRESENCE_IDX_KEY_, JSON.stringify(alive), 21600);
    }
    var list = st.online.map(function (o) { return { name: o.name, me: o.username === me }; });
    list.sort(function (a, b) { return (b.me - a.me) || String(a.name).localeCompare(String(b.name), 'ar'); });
    return { ok: true, online: list };
  } catch (e) { return { ok: false }; }
}
function presenceLeave_(username) {
  try { CacheService.getScriptCache().remove(presenceKey_(username)); } catch (e) {}
}

// ---- إدارة المستخدمين (مدير فقط) ----
function listUsers(token) {
  try {
    requireAdmin_(token);
    var sh = ensureUsersSheet_();
    var data = sh.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < data.length; i++) out.push(userRecordFromRow_(data[i]));
    return safeReturn_(out);
  } catch (e) {
    return safeReturn_({ error: e.message });
  }
}

function createUser(token, payload) {
  try {
    var admin = requireAdmin_(token);
    var username = (payload.username || '').toString().trim();
    if (!username) throw new Error('اسم المستخدم مطلوب');
    if (!/^[A-Za-z0-9_.\-@]+$/.test(username)) throw new Error('اسم المستخدم يجب أن يكون أحرف/أرقام إنجليزية فقط (بدون مسافات)');
    if (!payload.password || payload.password.toString().length < 3) throw new Error('كلمة المرور قصيرة جدًا (3 أحرف على الأقل)');
    var sh = ensureUsersSheet_();
    if (findUserRow_(sh, username) !== -1) throw new Error('اسم المستخدم موجود بالفعل');
    var salt = Utilities.getUuid();
    var role = payload.role === 'admin' ? 'admin' : 'user';
    // الوضع الافتراضي لأي مستخدم جديد: بدون وصول لأي شاشة إطلاقًا — المدير يفعّل ما يشاء يدويًا.
    // كل شاشة تحمل الآن مستوى واحد من PERM_LEVELS_ (بدون/عرض/إضافة/تعديل/حذف) بدل true/false.
    var perms = {};
    ALL_SCREENS_.forEach(function (s) {
      var lvl = payload.permissions && payload.permissions[s];
      perms[s] = PERM_LEVELS_.indexOf(lvl) !== -1 ? lvl : 'none';
    });
    perms.accountScope = payload.accountScope === 'restricted' ? 'restricted' : 'all';
    perms.bookingCityScope = (payload.bookingCityScope === 'مكة' || payload.bookingCityScope === 'المدينة') ? payload.bookingCityScope : 'all';
    perms.financeLevel = FINANCE_LEVELS_.indexOf(payload.financeLevel) !== -1 ? payload.financeLevel : 'none';
    sh.appendRow([username, payload.displayName || username, salt, hashPassword_(payload.password, salt), role, JSON.stringify(perms), true, new Date()]);
    setUserAccountPerms_(username, payload.statementAccounts || []);
    invalidateUserRecordCache_(username);
    logChange_(admin, 'المستخدمون', username, 'إنشاء مستخدم جديد (' + (role === 'admin' ? 'مدير' : 'مستخدم') + ')', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function updateUser(token, payload) {
  try {
    var admin = requireAdmin_(token);
    var sh = ensureUsersSheet_();
    var rowIdx = findUserRow_(sh, payload.username);
    if (rowIdx === -1) throw new Error('المستخدم غير موجود');
    if (payload.username === admin.username && payload.active === false) throw new Error('لا يمكنك تعطيل حسابك الخاص وأنت داخل به');
    var row = sh.getRange(rowIdx, 1, 1, 8).getValues()[0];
    var role = payload.role === 'admin' ? 'admin' : 'user';
    // نبدأ بنسخة من كل ما هو محفوظ أصلًا في عمود الإعدادات (يشمل uiPrefs — تفضيلات واجهة
    // المستخدم الشخصية) بدل بناء كائن جديد من الصفر، وإلا فإن أي حفظ لصلاحيات المستخدم من
    // هذه الشاشة كان يمحو تفضيلاته المحفوظة صامتًا (وأي مفتاح آخر غير معروف هنا مستقبلاً)
    var existingSaved = {};
    try { existingSaved = JSON.parse(row[5] || '{}'); } catch (eParse) {}
    var perms = {};
    Object.keys(existingSaved).forEach(function (k) { perms[k] = existingSaved[k]; });
    ALL_SCREENS_.forEach(function (s) {
      var lvl = payload.permissions && payload.permissions[s];
      perms[s] = PERM_LEVELS_.indexOf(lvl) !== -1 ? lvl : 'none';
    });
    perms.accountScope = payload.accountScope === 'restricted' ? 'restricted' : 'all';
    perms.bookingCityScope = (payload.bookingCityScope === 'مكة' || payload.bookingCityScope === 'المدينة') ? payload.bookingCityScope : 'all';
    perms.financeLevel = FINANCE_LEVELS_.indexOf(payload.financeLevel) !== -1 ? payload.financeLevel : 'none';
    sh.getRange(rowIdx, 2, 1, 1).setValue(payload.displayName || row[1]);
    sh.getRange(rowIdx, 5, 1, 2).setValues([[role, JSON.stringify(perms)]]);
    sh.getRange(rowIdx, 7, 1, 1).setValue(payload.active !== false);
    if (payload.password) {
      if (payload.password.toString().length < 3) throw new Error('كلمة المرور الجديدة قصيرة جدًا (3 أحرف على الأقل)');
      var newSalt = Utilities.getUuid();
      sh.getRange(rowIdx, 3, 1, 2).setValues([[newSalt, hashPassword_(payload.password, newSalt)]]);
    }
    setUserAccountPerms_(payload.username, payload.statementAccounts || []);
    invalidateUserRecordCache_(payload.username);
    logChange_(admin, 'المستخدمون', payload.username, 'تعديل بيانات/صلاحيات مستخدم' + (payload.password ? ' (وإعادة تعيين كلمة المرور)' : ''), '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}


// يُستدعى من الواجهة فور بناء بيانات تأكيد الحجز (قبل الطباعة/المشاركة) لتسجيل أن هذا
// التأكيد أُصدر فعليًا — لا يتطلب جلسة صارمة (لا نريد منع إصدار تأكيد حجز فعلي بسبب جلسة
// منتهية)، فقط يسجّل "غير معروف" لو لم تكن هناك جلسة صالحة وقت الاستدعاء
function logConfirmationIssued(token, resNo, confirmType, clientName) {
  try {
    var actingUser = checkSession(token).user || null;
    var typeLabel = confirmType === 'tentative' ? 'Tentative' : 'Definite';
    logChange_(actingUser, 'إصدار تأكيد حجز', resNo, '[' + typeLabel + '] طباعة/إصدار مستند تأكيد حجز', '', '',
      { hotelRef: resNo, clientName: clientName, recordKey: bookingRecordKey_(resNo) });
    tgEnqueue_('confirmation', {
      client: clientName, ref: resNo, confirmType: typeLabel,
      by: staffDisplayName_(actingUser), ts: new Date().getTime()
    });
  } catch (e) { Logger.log('logConfirmationIssued error: ' + e.message); }
}

// filters: { dateFrom, dateTo (yyyy-MM-dd أو فارغ), user (نص substring), type (نص substring),
//   q (نص حر يُطابق أي عمود), includeLoginLogout (bool — افتراضيًا false: يستبعد سجلات
//   الدخول/الخروج لتقليل الضجيج، يُفعَّل صراحةً من زر تبديل في شاشة سجل التعديلات) }
// الوصول: مدير دائمًا، أو أي مستخدم مُنحت له صلاحية "changelog" صراحةً
// ترقية عرض سجلات قديمة (من قبل ترقية نظام تسجيل التغييرات) كانت تكتب "عمود N" مبهمًا بدل
// اسم الحقل الحقيقي — تُبدَّل هنا فقط عند القراءة/العرض (لا تُعدَّل بيانات الشيت نفسها)، فتظهر
// السجلات القديمة والجديدة معًا بنفس الوضوح دون أي عملية ترحيل فعلية للبيانات التاريخية
function humanizeChangelogDesc_(desc) {
  if (!desc) return desc;
  var s = desc.toString()
    .replace(/^\[تعديل من داخل البرنامج\]\s*/, '')
    .replace(/عمود\s+(\d+)/g, function (m, n) {
      var idx = parseInt(n, 10) - 1;
      return '"' + (BOOKING_COL_LABELS[idx] || ('عمود ' + colLetter_(idx))) + '"';
    })
    .replace(/\s*\|\s*/g, '  •  ');
  return s;
}

function getChangelogEntries(token, filters) {
  try {
    var user = requireSession_(token);
    if (!hasScreenLevel_(user, 'changelog', 'view')) throw new Error('لا تملك صلاحية الوصول إلى سجل التعديلات');
    filters = filters || {};
    var log = ensureChangelogSheet_();
    var lastRow = log.getLastRow();
    if (lastRow < 2) return safeReturn_([]);
    var data = log.getRange(2, 1, lastRow - 1, CHANGELOG_COLS_).getValues();

    var dateFromTs = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00').getTime() : null;
    var dateToTs = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').getTime() : null;
    var userQ = (filters.user || '').toString().trim().toLowerCase();
    var typeQ = (filters.type || '').toString().trim().toLowerCase();
    var freeQ = (filters.q || '').toString().trim().toLowerCase();
    var includeLoginLogout = !!filters.includeLoginLogout;

    var out = [];
    for (var i = data.length - 1; i >= 0; i--) { // الأحدث أولاً
      var r = data[i];
      var ts = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
      var type = (r[6] || '').toString();
      if (!includeLoginLogout && (type === 'الدخول' || type === 'الخروج')) continue;
      if (dateFromTs !== null && ts < dateFromTs) continue;
      if (dateToTs !== null && ts > dateToTs) continue;
      var uname = (r[5] || '').toString();
      if (userQ && uname.toLowerCase().indexOf(userQ) === -1) continue;
      if (typeQ && type.toLowerCase().indexOf(typeQ) === -1) continue;
      if (freeQ) {
        var hay = (r[1] + ' ' + r[3] + ' ' + r[4] + ' ' + r[5] + ' ' + r[6] + ' ' + r[7] + ' ' + r[8]).toLowerCase();
        if (hay.indexOf(freeQ) === -1) continue;
      }
      out.push({
        ts: ts, ref: r[1] || '', hotelRef: r[2] || '', clientName: r[3] || '', desc: humanizeChangelogDesc_(r[4] || ''),
        user: uname || 'غير معروف', type: type || 'تعديل حجز (سجل قديم)', oldValue: r[7] || '', newValue: r[8] || '',
        recordKey: (r[9] || r[1] || '').toString(),
        refDisp: changelogRefDisp_(r[1], r[2], (r[9] || '').toString())   // عمود "المرجع" المقروء
      });
      if (out.length >= 500) break; // حد أقصى لتفادي إبطاء الشاشة — استخدم الفلاتر لتضييق النطاق
    }
    return safeReturn_(out);
  } catch (e) {
    return safeReturn_({ error: e.message });
  }
}

// المرجع المعروض في سجل التعديلات: ما يتعرّف عليه الموظف فعلاً (رقم حجز الفندق، رقم الدفعة،
// رقم الحجز الداخلي...) لا المفتاح الداخلي الخام مثل "مكة|H:12345" أو "PAY:abc123"
function changelogRefDisp_(rawRef, hotelRef, recordKey) {
  var hr = (hotelRef || '').toString().trim();
  if (hr) return hr;
  var key = (recordKey || '').toString().trim();
  var m;
  if ((m = key.match(/^PAY:(.+)$/)))   return 'دفعة ' + m[1];
  if ((m = key.match(/^CONF:(.+)$/)))  return 'تأكيد ' + m[1];
  if ((m = key.match(/^NEWBK:[^:]*:(.+)$/))) return m[1];
  if ((m = key.match(/^REQ:(.+)$/)))   return 'طلب بوابة ' + m[1];
  if ((m = key.match(/^BULK:([^:]+):/))) return 'رفع مجمَّع ' + m[1];
  if ((m = key.match(/^PARTY:(.+)$/))) return m[1];
  if ((m = key.match(/^ARR:(.+)$/)))   return m[1];
  if (/^TG:/.test(key)) return 'تليجرام';
  // مفتاح حجز: "مكة|H:12345" أو "مكة|R:MED001|D:2026-09-05"
  var raw = (rawRef || key || '').toString().trim();
  if ((m = raw.match(/\|H:(.+)$/))) return m[1];
  if ((m = raw.match(/\|R:([^|]+)/))) return m[1];
  return raw;
}

function getAppVersion() {
  return { version: APP_VERSION, date: APP_VERSION_DATE };
}

// ==========================================================
// الحل الجذري لمشكلة "رد فارغ من الخادم" / اختفاء الحجوزات:
// عند القراءة المباشرة من المصدر، أعمدة الإجماليات (AE/AF) معادلات؛ لو
// كانت خلية فارغة أو بها خطأ صيغة تُرجع getValues القيمة NaN. وقناة
// google.script.run لا تستطيع نقل NaN/Infinity، فإذا احتوى ردّ الخادم على
// قيمة واحدة كهذه يصل الرد كله للمتصفح كـ null — فتختفي كل الحجوزات
// (خلية واحدة تالفة وسط 500 صف تُسقط الرد بأكمله) ولا يظهر كشف بعض
// الحسابات. الحل: تمرير كل ردّ يُرسَل للمتصفح عبر دورة JSON تحوّل
// NaN/Infinity إلى null وتضمن أن الناتج JSON نقي قابل للنقل دائمًا.
// ==========================================================
function safeReturn_(x) {
  if (x === undefined || x === null) return null;
  try {
    return JSON.parse(JSON.stringify(x, function (key, value) {
      return (typeof value === 'number' && !isFinite(value)) ? null : value;
    }));
  } catch (e) {
    return { error: 'تعذّر تجهيز البيانات للإرسال: ' + e.message };
  }
}

// خلية "التنفيذ" قد تُقرأ Boolean حقيقي (خانة اختيار منسّقة في الشيت) أو نصًا — هذه الدالة
// توحّد التفسير بأمان (لا تعتبر النص "FALSE" صحيحًا كما تفعل جافاسكريبت افتراضيًا)
function truthy_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined || v === '') return false;
  var s = v.toString().trim().toLowerCase();
  return s === 'true' || s === 'نعم' || s === '1' || s === 'yes';
}


// ==========================================================
// إعدادات مصدر الحجوزات — قابلة للتعديل لاحقاً من شاشة إعدادات
// في الواجهة (بدل التعديل اليدوي في الكود). تُخزَّن في خصائص
// السكربت (PropertiesService) وليست في شيت ظاهر.
// ==========================================================
var SOURCE_DEFAULTS = {
  spreadsheetId: '1HV_6ADA0o9MkA-YYPu180CczVtzU_uHfy4ya6ZTVxh8',
  meccaSheet: 'حجوزات مكة',
  meccaStartRow: 5,
  medinaSheet: 'حجوزات المدينة',
  medinaStartRow: 6
};
var SOURCE_LAST_COL = 34; // من العمود A إلى العمود AH كما في شيتات المصدر

// تخزين كائن جدول البيانات مرة واحدة لكل تنفيذ — كل نداء getActiveSpreadsheet يكلّف ~100ms،
// والبرنامج يستدعيه عشرات المرات في الطلب الواحد (كل ensure*Sheet_ وقراءة). الآن نداء واحد.
var _SS_MEMO_ = null;
function getSS_() {
  if (!_SS_MEMO_) _SS_MEMO_ = SpreadsheetApp.getActiveSpreadsheet();
  return _SS_MEMO_;
}

// نسخة داخلية بلا صلاحية — تُستخدَم من كل مكان بالكود يحتاج قراءة إعدادات المصدر (قراءة
// الحجوزات، البحث عن صف حجز، إلخ)، وليس فقط من شاشة الإعدادات نفسها
function getSourceSettings_() {
  var p = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: p.getProperty('SRC_SS_ID') || SOURCE_DEFAULTS.spreadsheetId,
    meccaSheet: p.getProperty('SRC_MECCA_SHEET') || SOURCE_DEFAULTS.meccaSheet,
    meccaStartRow: Number(p.getProperty('SRC_MECCA_ROW')) || SOURCE_DEFAULTS.meccaStartRow,
    medinaSheet: p.getProperty('SRC_MEDINA_SHEET') || SOURCE_DEFAULTS.medinaSheet,
    medinaStartRow: Number(p.getProperty('SRC_MEDINA_ROW')) || SOURCE_DEFAULTS.medinaStartRow,
    makkahPrefix: p.getProperty('SRC_MAKKAH_PREFIX') || '',
    medinaPrefix: p.getProperty('SRC_MEDINA_PREFIX') || ''
  };
}
// نقطة الدخول العامة المستدعاة من الواجهة — كانت بلا أي صلاحية إطلاقًا (ثغرة: تكشف معرّف
// ملف الحجوزات الفعلي (spreadsheetId) لأي مستخدم بصرف النظر عن صلاحية شاشة الإعدادات)
function getSourceSettings(token) {
  requirePermission_(token, 'settings', 'view');
  var s = getSourceSettings_();
  var activeId = '';
  try { activeId = getSS_().getId(); } catch (e) {}
  s.activeId = activeId;
  s.sameFile = (!s.spreadsheetId || s.spreadsheetId === 'ACTIVE' || s.spreadsheetId === activeId);
  return s;
}

// يفتح ملف مصدر الحجوزات. لو كانت شيتات مكة/المدينة داخل ملف البرنامج نفسه (وهو ما فعله
// المستخدم الآن) نستخدم getActiveSpreadsheet مباشرة — أسرع كثيرًا من openById الذي يفتح
// ملفًا خارجيًا عبر الشبكة في كل مرة. القيمة 'ACTIVE' أو مطابقة معرّف الملف النشط = نفس الملف.
var ACTIVE_SS_MEMO_ = null;
function openSourceSpreadsheet_(s) {
  s = s || getSourceSettings_();
  var active = null;
  try { active = ACTIVE_SS_MEMO_ || (ACTIVE_SS_MEMO_ = getSS_()); } catch (e) {}
  if (active && (!s.spreadsheetId || s.spreadsheetId === 'ACTIVE' || s.spreadsheetId === active.getId())) {
    return active;
  }
  return SpreadsheetApp.openById(s.spreadsheetId);
}
// زر "استخدم ملف البرنامج نفسه": يضبط المصدر على الملف النشط بعد التأكد أن الشيتين موجودان
function useProgramSpreadsheetAsSource(token) {
  try {
    requirePermission_(token, 'settings', 'edit');
    var s = getSourceSettings_();
    var active = getSS_();
    var miss = [];
    if (!active.getSheetByName(s.meccaSheet)) miss.push(s.meccaSheet);
    if (!active.getSheetByName(s.medinaSheet)) miss.push(s.medinaSheet);
    if (miss.length) throw new Error('لم أجد في ملف البرنامج الشيت(ات): ' + miss.join('، ') +
      ' — تأكد أن أسماءها مطابقة تمامًا قبل التبديل.');
    PropertiesService.getScriptProperties().setProperty('SRC_SS_ID', active.getId());
    invalidateSourceCache_();
    return { ok: true, id: active.getId() };
  } catch (e) { return { ok: false, error: e.message }; }
}

function saveSourceSettings(settings, token) {
  requirePermission_(token, 'settings', 'edit');
  var p = PropertiesService.getScriptProperties();
  if (settings.spreadsheetId) p.setProperty('SRC_SS_ID', settings.spreadsheetId.trim());
  if (settings.meccaSheet) p.setProperty('SRC_MECCA_SHEET', settings.meccaSheet.trim());
  if (settings.medinaSheet) p.setProperty('SRC_MEDINA_SHEET', settings.medinaSheet.trim());
  if (settings.meccaStartRow) p.setProperty('SRC_MECCA_ROW', String(settings.meccaStartRow));
  if (settings.medinaStartRow) p.setProperty('SRC_MEDINA_ROW', String(settings.medinaStartRow));
  // البوادئ: نسمح بمسحها بإرسال '' صراحةً (بخلاف بقية الحقول التي تُترك كما هي لو فارغة)
  if (settings.makkahPrefix !== undefined) p.setProperty('SRC_MAKKAH_PREFIX', String(settings.makkahPrefix || '').trim());
  if (settings.medinaPrefix !== undefined) p.setProperty('SRC_MEDINA_PREFIX', String(settings.medinaPrefix || '').trim());
  invalidateSourceCache_(); // إعدادات المصدر تغيّرت — أي كاش قديم لم يعد صالحًا
  return getSourceSettings_();
}

// حرف العمود في الشيت (0-based) — A=0..Z=25, AA=26... تُستخدَم لتسمية الأعمدة المجهولة
// بحرفها الحقيقي بدل رقم تسلسلي بلا معنى، حتى يسهل على المستخدم مطابقتها بالشيت الفعلي
function colLetter_(index0based) {
  var n = index0based + 1, s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// عناوين الأعمدة الـ 34 (A..AH) — مكتوبة يدويًا بدل الاعتماد على قراءة صف رأس شيت المصدر
// حيّة (كانت تُرجع "عمود 1"/"عمود 2"... لأغلب الأعمدة بسبب خلايا عناوين فارغة/مدمجة في
// الشيت الفعلي، وهو بالضبط ما اشتكى منه المستخدم). الأعمدة غير المؤكدة (لم تُستخدم من قبل
// في أي دالة هنا ولم يذكرها المستخدم صراحةً) تحمل اسم حرفها كعنوان مؤقت أمين بدل تخمين خاطئ
var BOOKING_COL_LABELS = (function () {
  var known = {
    0: 'رقم القيد', 1: 'التنفيذ', 2: 'رقم الحجز الداخلي', 3: 'اسم العميل', 4: 'الفندق',
    5: 'اجمالي عدد الأفراد', 6: 'اجمالي عدد الغرف',
    7: 'تاريخ الدخول', 8: 'تاريخ الخروج', 9: 'عدد الليالي',
    10: 'غرف ثنائي', 11: 'غرف ثلاثي', 12: 'غرف رباعي', 13: 'غرف خماسي',
    14: 'اسم المورد', 15: 'حالة الحجز', 16: 'OPTION DATE', 17: 'رقم حجز الفندق', 19: 'مسئول البيع',
    20: 'ملاحظات',
    21: 'سعر تكلفة - ثنائي', 22: 'سعر تكلفة - ثلاثي', 23: 'سعر تكلفة - رباعي', 24: 'سعر تكلفة - خماسي',
    25: 'سعر بيع - ثنائي', 26: 'سعر بيع - ثلاثي', 27: 'سعر بيع - رباعي', 28: 'سعر بيع - خماسي',
    30: 'اجمالي التكلفة', 31: 'اجمالي البيع',
    32: 'الفرق', 33: 'اجمالي عدد الليالي'
  };
  var out = [];
  for (var i = 0; i < SOURCE_LAST_COL; i++) out.push(known[i] || ('عمود ' + colLetter_(i)));
  return out;
})();

function getSourceColumnLabels() {
  return BOOKING_COL_LABELS;
}


// ==========================================================
// قراءة الحجوزات مباشرة من ملف المصدر الخارجي (بدون أي نسخ/مزامنة محلية).
// "حجوزات مكة" و"حجوزات المدينة" في الملف الخارجي هما مصدر الحقيقة الوحيد
// للحجوزات — كل شاشات العرض تقرأ من هنا مباشرة (عبر getSourceRowsCached_)،
// وأي تعديل حجز من داخل البرنامج يُكتب في هذا الملف الخارجي مباشرة
// (editBookingField) بدون أي نسخة محلية وسيطة يمكن أن تتأخر أو تتعارض معه.
// ==========================================================
var CHANGELOG_SHEET_NAME = 'سجل تعديلات الحجوزات';

// مفتاح فريد لكل حجز — المدينة مضمّنة في بداية المفتاح نفسه (قبل أول '|')
// حتى تُعرف مباشرة من نص المفتاح فقط أي شيت (مكة/المدينة) ينتمي له الحجز
function bookingKey_(row, city) {
  var hotelRef = (row[17] || '').toString().trim(); // رقم حجز الفندق (العمود R)
  if (hotelRef) return city + '|H:' + hotelRef;
  var innerRef = (row[2] || '').toString().trim();  // رقم الحجز الداخلي (العمود C)
  var checkIn = row[7] instanceof Date ? Utilities.formatDate(row[7], 'GMT+3', 'yyyy-MM-dd') : row[7];
  return city + '|R:' + innerRef + '|D:' + checkIn;
}

// مفتاح ثابت لتجميع "سجل التعديلات" لحجز واحد — مبني على الرقم الداخلي وحده، خلافًا لـ
// bookingKey_ الذي يتحوّل من صيغة "R:...|D:..." إلى "H:رقم حجز الفندق" فور إضافة رقم حجز
// الفندق (وهو تعديل شائع جدًا: يحدث لكل حجز يُصبح "مؤكدًا"). ذلك التحوّل كان يجعل كل حدث
// مسجَّل قبل إضافة الرقم "يتيمًا" لا يطابقه أي بحث لاحق بمفتاح الحجز الحالي — فتظهر الشاشة
// دائمًا بلا أي أحداث لأي حجز تقريبًا. الرقم الداخلي فريد وثابت طوال عمر الحجز عمليًا،
// وبادئته تختلف باختلاف المدينة أصلاً (بادئة مكة/المدينة منفصلتان بالإعدادات) فلا حاجة
// لتضمين المدينة صراحةً في المفتاح
function bookingRecordKey_(innerRef) {
  return 'BK:' + (innerRef || '').toString().trim();
}

function readSourceRows_() {
  var s = getSourceSettings_();
  var ss = openSourceSpreadsheet_(s);
  var out = [];
  [{ name: s.meccaSheet, start: s.meccaStartRow, city: 'مكة' },
   { name: s.medinaSheet, start: s.medinaStartRow, city: 'المدينة' }].forEach(function (src) {
    var sh = ss.getSheetByName(src.name);
    if (!sh) return;
    var lastRow = sh.getLastRow();
    if (lastRow < src.start) return;
    var values = sh.getRange(src.start, 1, lastRow - src.start + 1, SOURCE_LAST_COL).getValues();
    values.forEach(function (row, idx) {
      // صف واحد تالف (مثلاً خطأ صيغة #REF!/#N/A في تاريخ الدخول) لا يجب أن يُسقط الشاشة
      // بأكملها — نتخطاه ونسجّله بدل رمي استثناء يوقف قراءة كل الحجوزات
      try {
        // نعتبر الصف "حجزًا حقيقيًا" فقط لو كان له تاريخ دخول وتاريخ خروج معًا (H و I) — صف
        // بدون أي منهما غالبًا صف فارغ/مسودة في الشيت، وتضمينه يُثقل كل قراءة بلا فائدة
        var hasDates = row[7] !== '' && row[7] !== null && row[8] !== '' && row[8] !== null;
        if (hasDates) out.push({ row: row, city: src.city, key: bookingKey_(row, src.city) });
      } catch (rowErr) {
        Logger.log('تخطي صف تالف في "' + src.name + '" صف ' + (src.start + idx) + ': ' + rowErr.message);
      }
    });
  });
  return out;
}

var CHANGELOG_COLS_ = 10; // العمود العاشر = "مفتاح السجل" لتجميع تاريخ كل سجل على حدة
function ensureChangelogSheet_() {
  var ss = getSS_();
  var log = ss.getSheetByName(CHANGELOG_SHEET_NAME);
  var HEADERS = ['تاريخ ووقت التغيير', 'مفتاح الحجز', 'رقم حجز الفندق', 'اسم العميل', 'التفاصيل',
                 'المستخدم', 'النوع', 'القيمة القديمة', 'القيمة الجديدة', 'مفتاح السجل'];
  if (!log) {
    log = ss.insertSheet(CHANGELOG_SHEET_NAME);
    log.getRange(1, 1, 1, CHANGELOG_COLS_).setValues([HEADERS]);
    log.setFrozenRows(1);
  } else if (log.getLastColumn() < CHANGELOG_COLS_) {
    // ترقية شيت أُنشئ بنسخة سابقة (5 ثم 9 أعمدة) — الأعمدة الجديدة تُضاف في النهاية فقط
    // (بلا أي إدراج/إزاحة لعمود قديم) حتى لا تختل بيانات الصفوف التاريخية الموجودة فعلاً
    var from = Math.max(1, log.getLastColumn() + 1);
    log.getRange(1, from, 1, CHANGELOG_COLS_ - from + 1).setValues([HEADERS.slice(from - 1)]);
  }
  return log;
}

// user: كائن مستخدم (من requireSession_/requireAdmin_) أو نص اسم مستخدم مباشر أو null
// extra (اختياري): { hotelRef, clientName, recordKey } — recordKey هو المعرّف الثابت الذي
// يجمع كل أحداث السجل الواحد (حجز/دفعة/طلب بوابة/حساب) ليُعرض تاريخه الكامل بزر واحد
function logChange_(user, type, ref, desc, oldVal, newVal, extra) {
  try {
    var log = ensureChangelogSheet_();
    var uname = (user && user.displayName) || (user && user.username) || (typeof user === 'string' ? user : 'غير معروف');
    extra = extra || {};
    var str = function (v) { return (v === null || v === undefined) ? '' : String(v); };
    log.appendRow([
      new Date(), ref || '', str(extra.hotelRef), str(extra.clientName), desc || '', uname, type || '',
      str(oldVal), str(newVal),
      // بلا مفتاح صريح نستخدم المرجع نفسه — يكفي لتجميع أحداث الحجز/الطرف بمرجعه الثابت
      str(extra.recordKey || ref || '')
    ]);
  } catch (e) { Logger.log('logChange_ error: ' + e.message); }
}

// كل أحداث سجل واحد مرتّبة زمنيًا من الأقدم للأحدث — يغذّي زر "📜 السجل الكامل" لكل صف
function getRecordHistory(token, recordKey) {
  try {
    var user = requireSession_(token);
    if (!hasScreenLevel_(user, 'changelog', 'view')) throw new Error('لا تملك صلاحية الوصول إلى سجل التعديلات');
    recordKey = (recordKey || '').toString().trim();
    if (!recordKey) return safeReturn_({ ok: true, items: [] });
    var log = ensureChangelogSheet_();
    var lastRow = log.getLastRow();
    if (lastRow < 2) return safeReturn_({ ok: true, items: [] });
    var data = log.getRange(2, 1, lastRow - 1, CHANGELOG_COLS_).getValues();
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      // الصفوف التاريخية (قبل إضافة عمود مفتاح السجل) تُطابَق بالمرجع نفسه
      var key = (r[9] || r[1] || '').toString();
      if (key !== recordKey) continue;
      var ts = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
      out.push({
        ts: ts, desc: humanizeChangelogDesc_(r[4] || ''), user: (r[5] || 'غير معروف').toString(),
        type: (r[6] || '').toString(), oldValue: (r[7] || '').toString(), newValue: (r[8] || '').toString()
      });
    }
    out.sort(function (a, b) { return a.ts - b.ts; }); // الأقدم أولاً: قصة السجل بالترتيب
    return safeReturn_({ ok: true, items: out, recordKey: recordKey });
  } catch (e) { return safeReturn_({ ok: false, error: e.message, items: [] }); }
}

// ==========================================================
// تنبيه "حجز عُدِّل بعد تسجيل رقم القيد" — حجز صار مُوثَّقًا (له رقم قيد) ثم تغيّرت قيمته
// المالية أو العميل/المورد بعد ذلك، فقد يكون القيد المسجَّل لم يعد يطابق الحجز الفعلي.
// تسجيل رقم القيد نفسه لا يُعتبر "تعديلاً" هنا أبدًا (لا يدخل في الأعمدة أدناه إطلاقًا) —
// وإلا كان كل تسجيل قيد يُشعل تنبيهه بلا نهاية (دائرة تنبيهات لا فائدة منها).
// ==========================================================
// الأعمدة (1-based، كما تصل fieldsMap) التي يُعَدّ تغييرها الفعلي "تعديلاً ذا قيمة" هنا:
// تاريخا الدخول/الخروج، عدد الغرف بكل نوع، المورد، أسعار التكلفة والبيع — واسم العميل صراحةً
// من طلب المستخدم. الحالة/OPTION DATE/رقم حجز الفندق/مسئول البيع/الملاحظات مستبعدة عمدًا.
var QAID_EDIT_TRIGGER_COLS_1BASED_ = {
  4: true,                          // اسم العميل
  8: true, 9: true,                 // تاريخ الدخول/الخروج
  11: true, 12: true, 13: true, 14: true,   // غرف ثنائي/ثلاثي/رباعي/خماسي
  15: true,                         // اسم المورد
  22: true, 23: true, 24: true, 25: true,   // أسعار التكلفة
  26: true, 27: true, 28: true, 29: true    // أسعار البيع
};
var QAID_EDIT_FLAG_SHEET_NAME = 'حجوزات معدَّلة بعد القيد';
var QAID_EDIT_FLAG_COLS_ = 8; // مفتاح السجل، الحجز الداخلي، حجز الفندق، العميل، آخر تعديل، الحقول، بواسطة، تمت المراجعة
function ensureQaidEditFlagsSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(QAID_EDIT_FLAG_SHEET_NAME);
  var HEADERS = ['مفتاح السجل', 'رقم الحجز الداخلي', 'رقم حجز الفندق', 'اسم العميل',
                 'آخر تعديل', 'الحقول المتغيّرة', 'بواسطة', 'تمت المراجعة'];
  if (!sh) {
    sh = ss.insertSheet(QAID_EDIT_FLAG_SHEET_NAME);
    sh.getRange(1, 1, 1, QAID_EDIT_FLAG_COLS_).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}
// يُستدعى من مسارات تعديل الحجز الثلاثة (شاشة البرنامج، تعديل خلية مباشر، بوت تليجرام) —
// upsert بمفتاح السجل: صف قائم يُحدَّث (وتُرفَع عنه "تمت المراجعة" لو رُفعت من قبل، فتعديل
// جديد بعد المراجعة يستحق تنبيهًا جديدًا)، وإلا يُضاف صف جديد
function flagQaidEditedBooking_(recordKey, innerRef, hotelRef, clientName, changedFieldLabels, actingUser) {
  try {
    recordKey = (recordKey || '').toString().trim();
    if (!recordKey) return;
    var sh = ensureQaidEditFlagsSheet_();
    var lastRow = sh.getLastRow();
    var uname = (actingUser && actingUser.displayName) || (actingUser && actingUser.username) ||
      (typeof actingUser === 'string' ? actingUser : 'غير معروف');
    var fieldsTxt = (changedFieldLabels || []).join('، ');
    var rowVals = [recordKey, innerRef || '', hotelRef || '', clientName || '', new Date(), fieldsTxt, uname, false];
    if (lastRow >= 2) {
      var keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < keys.length; i++) {
        if ((keys[i][0] || '').toString().trim() === recordKey) {
          sh.getRange(i + 2, 1, 1, QAID_EDIT_FLAG_COLS_).setValues([rowVals]);
          return;
        }
      }
    }
    sh.appendRow(rowVals);
  } catch (e) { Logger.log('flagQaidEditedBooking_ error: ' + e.message); }
}
// كل الحجوزات المُنبَّه عليها حاليًا (لم تُراجَع بعد) — الشيت صغير عادة فقراءته كاملاً كل مرة
// غير مكلفة، خلافًا لسجل التعديلات الكامل الذي قد يطول كثيرًا
function getQaidEditFlags_() {
  try {
    var sh = ensureQaidEditFlagsSheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return [];
    var data = sh.getRange(2, 1, lastRow - 1, QAID_EDIT_FLAG_COLS_).getValues();
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      if (r[7] === true) continue; // تمت مراجعتها
      out.push({
        recordKey: (r[0] || '').toString(), innerRef: (r[1] || '').toString(), hotelRef: (r[2] || '').toString(),
        clientName: (r[3] || '').toString(),
        ts: r[4] instanceof Date ? r[4].getTime() : new Date(r[4]).getTime(),
        fields: (r[5] || '').toString(), by: (r[6] || '').toString()
      });
    }
    return out;
  } catch (e) { Logger.log('getQaidEditFlags_ error: ' + e.message); return []; }
}
// قائمة التنبيهات الحالية لعرضها في الشاشة (اسم/رقم حجز ووقت التعديل) — تُقرأ فور فتح شاشة
// الحجوزات لبناء رسالة الكارت التفصيلية
function getQaidEditAlerts(token) {
  try {
    requireSession_(token);
    var flags = getQaidEditFlags_();
    flags.sort(function (a, b) { return b.ts - a.ts; }); // الأحدث أولاً
    return safeReturn_({ ok: true, items: flags.map(function (f) {
      return {
        innerRef: f.innerRef, hotelRef: f.hotelRef, clientName: f.clientName, fields: f.fields, by: f.by,
        tsDisp: Utilities.formatDate(new Date(f.ts), 'GMT+3', 'dd/MM/yyyy HH:mm')
      };
    }) });
  } catch (e) { return safeReturn_({ ok: false, error: e.message, items: [] }); }
}
// تعليم كل التنبيهات الحالية "تمت مراجعتها" — زر واحد في شاشة الحجوزات بعد فحص القائمة
// المفلترة، بدل تعليم كل حجز على حدة
function markAllQaidEditFlagsReviewed(token) {
  try {
    var user = requirePermission_(token, 'bookings', 'edit');
    var sh = ensureQaidEditFlagsSheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return safeReturn_({ ok: true, count: 0 });
    var rng = sh.getRange(2, 8, lastRow - 1, 1);
    var vals = rng.getValues();
    var count = 0;
    for (var i = 0; i < vals.length; i++) { if (vals[i][0] !== true) { vals[i][0] = true; count++; } }
    rng.setValues(vals);
    if (count) logChange_(user, 'حجوزات معدَّلة بعد القيد', '', 'تعليم ' + count + ' تنبيهًا كمُراجَع', '', '');
    return safeReturn_({ ok: true, count: count });
  } catch (e) { return safeReturn_({ ok: false, error: e.message }); }
}

// ==========================================================
// كاش (CacheService) لقراءة الحجوزات من المصدر الخارجي — بدونه كان كل
// فتح لكشف حساب أو شاشة "كل الحجوزات" أو "متابعة الأرصدة" سيفتح الملف
// الخارجي ويقرأه بالكامل من جديد (أبطأ لأنه طلب شبكة لملف منفصل). تُخزَّن
// آخر قراءة مجزّأة (لتفادي حد 100KB لكل مفتاح كاش) لمدة قصيرة، وتُلغى فورًا
// عند أي تعديل حجز أو إعادة تسمية طرف من داخل البرنامج (invalidateSourceCache_)
// حتى لا تُعرض بيانات قديمة بعد أي كتابة حقيقية. بما أنه لم يعد هناك أي
// نسخة محلية تُكتب في الخلفية، لا يوجد سباق قراءة/كتابة يستدعي قفلًا هنا.
// ==========================================================
var SRC_CACHE_PREFIX_ = 'srcRows_';
// كان 90 ثانية فقط — فكان كل نقرة تقريبًا تُعيد قراءة ملف المصدر الخارجي بالكامل عبر الشبكة
// (السبب الجذري لبطء كشف الحساب وكل الشاشات). رُفع إلى الحد الأقصى لـCacheService (6 ساعات):
// آمن تمامًا لأن أي كتابة من داخل البرنامج تستدعي invalidateSourceCache_ فورًا، وزر "تحديث"
// يمسحه يدويًا. الاستثناء الوحيد: تعديل يدوي مباشر في شيت المصدر خارج البرنامج — يظهر بعد
// الضغط على "تحديث" (أو خلال 6 ساعات).
var SRC_CACHE_TTL_SEC_ = 21600;
var SRC_CACHE_CHUNK_ = 100;

// ذاكرة داخل التنفيذ الواحد: كثير من الدوال تستدعي getSourceRowsCached_ عشرات المرات في
// الطلب الواحد (لقطة الحجز لكل طلب مثلًا) — بدون هذه الذاكرة يُعاد فك ضغط الكاش وتحليله
// في كل مرة. تُصفَّر تلقائيًا مع انتهاء التنفيذ، فلا خطر بيانات قديمة بين طلبين.
var SRC_MEMO_ = null;

// SpreadsheetApp.flush() أولاً ثم إبطال الكاش — والترتيب هو جوهر الإصلاح:
// كتابات Apps Script في الشيت مؤجَّلة (buffered) وتُرسَل فعليًا في نهاية التنفيذ. كان
// إبطال الكاش يتم قبل وصول الكتابة للملف، فتأتي قراءة الشاشة التالية (تنفيذ منفصل يبدأ
// فورًا بعد رد الخادم) فتقرأ الملف قبل أن تستقر الكتابة فيه، فتُخزّن في الكاش نسخةً ما
// زالت قديمة — ويظل التعديل غير ظاهر في كشف الحساب رغم نجاح الحفظ فعليًا.
// الآن: نُجبر إرسال الكتابة، ثم نُبطل الكاش، فأي قراءة تالية ترى البيانات الجديدة حتمًا.
function invalidateSourceCache_() {
  try { SpreadsheetApp.flush(); } catch (e) { Logger.log('flush: ' + e.message); }
  SRC_MEMO_ = null;
  PropertiesService.getScriptProperties().setProperty('SRC_CACHE_VER', String(Date.now()));
}

function dateReplacer_(key, value) {
  return this[key] instanceof Date ? { __d: this[key].getTime() } : value;
}
function dateReviver_(key, value) {
  return (value && typeof value === 'object' && value.__d !== undefined) ? new Date(value.__d) : value;
}

// يُرجع مصفوفة صفوف الحجوزات من المصدر الخارجي مباشرة، بعرض ثابت
// SOURCE_LAST_COL + 1 (عمود المدينة مضافًا في النهاية) — نفس شكل قراءة
// الشيت المركزي سابقًا، حتى تبقى بقية الدوال (كشف الحساب/البحث/الأرصدة)
// كما هي بدون أي تغيير في شكل البيانات المُستهلَكة
function getSourceRowsCached_() {
  if (SRC_MEMO_) return SRC_MEMO_; // نفس التنفيذ: أعِد النسخة المحمَّلة بلا أي نداء خدمة
  var ver = PropertiesService.getScriptProperties().getProperty('SRC_CACHE_VER') || '0';
  var cache = CacheService.getScriptCache();
  var metaKey = SRC_CACHE_PREFIX_ + ver + '_meta';

  // قراءة الكاش أيضًا "أفضل جهد" — أي خطأ فيها (JSON تالف، مفتاح منتهي أثناء القراءة، ...)
  // يجب أن يؤدي فقط لقراءة فعلية جديدة من المصدر، وليس لفشل الشاشة بأكملها
  try {
    var metaRaw = cache.get(metaKey);
    if (metaRaw) {
      var meta = JSON.parse(metaRaw);
      var chunkKeys = [];
      for (var i = 0; i < meta.chunks; i++) chunkKeys.push(SRC_CACHE_PREFIX_ + ver + '_c' + i);
      var chunksMap = cache.getAll(chunkKeys);
      var allFound = chunkKeys.every(function (k) { return !!chunksMap[k]; });
      if (allFound) {
        var rows = [];
        chunkKeys.forEach(function (k) { rows = rows.concat(JSON.parse(chunksMap[k], dateReviver_)); });
        SRC_MEMO_ = rows;
        return rows;
      }
    }
  } catch (readCacheErr) {
    Logger.log('تعذّرت قراءة كاش الحجوزات (تجاهل، ستُقرأ بيانات جديدة): ' + readCacheErr.message);
  }

  var fresh = readSourceRows_();
  var data = fresh.map(function (item) { return item.row.concat([item.city]); });

  // تخزين الكاش عملية "أفضل جهد" فقط — أي خطأ فيها (حجم، حصة الكاش، ...) يجب ألا
  // يمنع إرجاع البيانات الحقيقية المقروءة أعلاه، لذلك مغلّفة بمحاولة منفصلة
  try {
    var chunks = Math.ceil(data.length / SRC_CACHE_CHUNK_);
    var toStore = {};
    var ok = true;
    for (var c = 0; c < chunks; c++) {
      var slice = data.slice(c * SRC_CACHE_CHUNK_, (c + 1) * SRC_CACHE_CHUNK_);
      var json = JSON.stringify(slice, dateReplacer_);
      if (json.length >= 95000) { ok = false; break; } // مصفوفة أكبر من الحد المسموح لمفتاح واحد — تخطي التخزين لهذه المرة
      toStore[SRC_CACHE_PREFIX_ + ver + '_c' + c] = json;
    }
    if (ok && chunks > 0) {
      cache.putAll(toStore, SRC_CACHE_TTL_SEC_);
      cache.put(metaKey, JSON.stringify({ chunks: chunks }), SRC_CACHE_TTL_SEC_);
    }
  } catch (cacheErr) {
    Logger.log('تعذّر تخزين كاش الحجوزات (تجاهل، البيانات الحقيقية لم تتأثر): ' + cacheErr.message);
  }
  SRC_MEMO_ = data;
  return data;
}

// نقطة الدخول التي يستدعيها زر "تحديث" في الواجهة — لم تعد هناك مزامنة/نسخ
// (القراءة أصلاً من المصدر الخارجي دائمًا)؛ هذا الزر يُلغي الكاش المؤقت فقط
// (90 ثانية كحد أقصى) لضمان قراءة فورية بدل انتظار انتهاء صلاحيته من نفسه
// دفاع في العمق (defense-in-depth) — نتيجة المراجعة الشاملة: لا تسرّب بيانات حساسة بذاتها،
// لكن جلسة صالحة شرط أدنى معقول لأي دالة خادم عامة، بدل تركها مفتوحة بلا أي تحقق هوية
function refreshBookingsNow(token) {
  try {
    requireSession_(token);
    invalidateSourceCache_();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// أداة تشخيص من شاشة الإعدادات: تختبر الوصول الفعلي لملف/أوراق المصدر الخارجي
// وتُرجع رسالة الخطأ الحقيقية لو فشل الوصول (بدل رسالة عامة في شاشات أخرى)
function testSourceConnection(token) {
  try {
    requirePermission_(token, 'settings', 'view');
    var s = getSourceSettings_();
    var ss = openSourceSpreadsheet_(s);
    var meccaSh = ss.getSheetByName(s.meccaSheet);
    var medinaSh = ss.getSheetByName(s.medinaSheet);
    return {
      ok: true,
      spreadsheetName: ss.getName(),
      meccaFound: !!meccaSh, meccaLastRow: meccaSh ? meccaSh.getLastRow() : null,
      medinaFound: !!medinaSh, medinaLastRow: medinaSh ? medinaSh.getLastRow() : null
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// شغّلها مرة واحدة يدويًا من محرر السكربت إذا كان هناك مُشغِّل (trigger) قديم
// من نسخة سابقة للبرنامج كان يستدعي "syncBookingsFromSource" كل دقيقة —
// هذه الدالة أُلغيت مع إلغاء المزامنة، فيجب حذف ذلك المُشغِّل حتى لا يفشل
// كل دقيقة. آمنة الاستدعاء حتى لو لم يكن هناك مُشغِّل من الأساس.
function deleteBookingsSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncBookingsFromSource') ScriptApp.deleteTrigger(t);
  });
}

// ==========================================================
// تنظيف ما بعد إلغاء المزامنة والشيت المركزي — شغّلها مرة واحدة فقط يدويًا
// من محرر السكربت (اختر الدالة من القائمة المنسدلة أعلى المحرر ثم اضغط Run)
// بعد لصق هذا الإصدار من الكود. تحذف مُشغِّل المزامنة القديم (إن وُجد) وتحذف
// شيت "الحجوزات" المركزي نفسه من هذا الملف (لم يعد يُستخدَم إطلاقًا؛ كل
// الحجوزات تُقرأ الآن من "حجوزات مكة"/"حجوزات المدينة" في الملف الخارجي
// مباشرة). آمنة الاستدعاء أكثر من مرة — لن تفعل شيئًا في المرات التالية.
// ==========================================================
function cleanupOldSyncSetup() {
  requireScriptOwner_();   // (7.15.0) كانت عامة — أي زائر يحذف شيت "الحجوزات"
  deleteBookingsSyncTrigger();
  var ss = getSS_();
  var old = ss.getSheetByName('الحجوزات');
  if (old) ss.deleteSheet(old);
}

function showSourceSettingsDialog() {
  var tmpl = HtmlService.createTemplateFromFile('App');
  tmpl.baseUrl = getAppBaseUrl_();
  tmpl.initialPage = 'settings';
  var html = tmpl.evaluate().setWidth(900).setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'حجوزات وحسابات سكن');
}


// ==========================================================
// تعديل بيانات/سعر حجز من داخل البرنامج — يُكتب في شيت المصدر
// (مكة أو المدينة) مباشرة وفقط (لا يوجد شيت مركزي بعد الآن). المدينة
// تُستخرَج من بداية bookingKey نفسه (قبل أول '|')، فلا حاجة لمسح كل
// الحجوزات لتحديد أي شيت (مكة/المدينة) نبحث فيه عن الصف.
// ==========================================================
function findSourceRowIndex_(city, key) {
  var s = getSourceSettings_();
  var ss = openSourceSpreadsheet_(s);
  var cfg = city === 'مكة' ? { name: s.meccaSheet, start: s.meccaStartRow } : { name: s.medinaSheet, start: s.medinaStartRow };
  var sh = ss.getSheetByName(cfg.name);
  if (!sh) return null;
  var lastRow = sh.getLastRow();
  if (lastRow < cfg.start) return null;
  var values = sh.getRange(cfg.start, 1, lastRow - cfg.start + 1, SOURCE_LAST_COL).getValues();
  for (var i = 0; i < values.length; i++) {
    if (bookingKey_(values[i], city) === key) return { sheet: sh, rowInSheet: cfg.start + i };
  }
  return null;
}

// يجلب بيانات حجز كاملة لعرضها في نموذج التعديل الكامل
// خرائط أعمدة المصدر (0-based داخل raw، والاسم في التعليقات 1-based كما في الشيت):
//   0=A القيد | 2=C رقم داخلي | 3=D العميل | 4=E الفندق | 7=H تاريخ الدخول | 8=I تاريخ الخروج
//   9=J عدد الليالي (معادلة = الخروج - الدخول — لا تُكتب أبدًا، تحسبها الصيغة تلقائيًا)
//   10..13 = K..N عدد الغرف (دابل/ثلاثي/رباعي/خماسي)
//   14=O المورد | 15=P الحالة | 17=R رقم حجز الفندق
//   21..24 = V..Y سعر التكلفة لكل نوع غرفة (دابل/ثلاثي/رباعي/خماسي)
//   25..28 = Z..AC سعر البيع لكل نوع غرفة (دابل/ثلاثي/رباعي/خماسي)
//   30=AE إجمالي التكلفة | 31=AF إجمالي البيع (معادلات في المصدر — لا تُكتبان أبدًا)
// نقطة الدخول العامة — كانت بلا أي صلاحية إطلاقًا (ثغرة: أي مستخدم كان يستطيع طلب تفاصيل أي
// حجز كاملة، بصرف النظر عن صلاحيته على شاشة الحجوزات أو تقييد مدينته) — نفس فئة ثغرة
// searchBookings المُصلَحة سابقًا. ملاحظة: بعكس searchBookings، لا نُخفي هنا التكلفة/البيع حسب
// مستوى الصلاحية المالية عمدًا — هذه الدالة تُستخدَم أيضًا لتعبئة مستند "تأكيد الحجز" الذي
// يُشارَك مع العميل نفسه (سعر البيع جزء أساسي منه بالتصميم)، فتقييد إضافي هنا قد يكسر تلك
// الميزة لموظف لا يملك صلاحية مالية عامة لكنه مخوَّل بإصدار تأكيدات الحجز
function getBookingDetails(bookingKey, token) {
  var user = requirePermission_(token, 'bookings', 'view');
  var city = (bookingKey || '').split('|')[0];
  if (!city) return null;
  if (!bookingCityAllowed_(user, city)) throw new Error('لا تملك صلاحية الوصول لحجوزات مدينة ' + city);
  var src = findSourceRowIndex_(city, bookingKey);
  if (!src) return null;
  var raw = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
  var checkIn = raw[7], checkOut = raw[8];
  // التكلفة/البيع محسوبان من الأسعار والأعداد والليالي (computeBookingTotal_) — وليسا عمودي
  // المصدر الجاهزين — حتى تطابق القيمة المعروضة هنا (بما فيها إجمالي مستند تأكيد الحجز)
  // نفس القيمة المستخدمة في باقي التطبيق
  var costCalc = computeBookingTotal_(raw, 'supplier');
  var saleCalc = computeBookingTotal_(raw, 'client');
  var result = {
    key: bookingKey, city: city,
    qaid: raw[0], innerRef: raw[2], client: raw[3], hotel: raw[4],
    checkIn: checkIn instanceof Date ? Utilities.formatDate(checkIn, 'GMT+3', 'yyyy-MM-dd') : checkIn,
    // تاريخ الخروج (I) قابل للتعديل مباشرة؛ عدد الليالي (J) معادلة = الخروج - الدخول ولا يُكتب أبدًا
    checkOut: checkOut instanceof Date ? Utilities.formatDate(checkOut, 'GMT+3', 'yyyy-MM-dd') : checkOut,
    nights: raw[9],
    doubles: raw[10], triples: raw[11], quads: raw[12], quints: raw[13],
    supplier: raw[14], status: raw[15], hotelRef: raw[17], salesAgent: raw[19],
    note: raw[20], // عمود الملاحظات (U) — يُعرض ويُحرَّر في نموذج التعديل
    exec: truthy_(raw[1]),
    costDouble: raw[21], costTriple: raw[22], costQuad: raw[23], costQuint: raw[24],
    saleDouble: raw[25], saleTriple: raw[26], saleQuad: raw[27], saleQuint: raw[28],
    cost: costCalc.hasPrice ? costCalc.value : null, sale: saleCalc.hasPrice ? saleCalc.value : null
  };
  return safeReturn_(result);
}

// كل القيم المميّزة (غير الفارغة) المستخدمة من قبل في عمود "مسئول البيع" — لقائمة الإكمال
// التلقائي في نموذج تعديل الحجز
function getDistinctSalesAgents(token) {
  try {
    requireSession_(token);
    var set = {};
    getSourceRowsCached_().forEach(function (r) {
      var v = (r[19] || '').toString().trim();
      if (v) set[v] = true;
    });
    return safeReturn_(Object.keys(set).sort());
  } catch (e) {
    Logger.log('Error in getDistinctSalesAgents: ' + e.message);
    return [];
  }
}

// اقتراح "مسئول البيع" الافتراضي لعميل معيّن: آخر قيمة غير فارغة سُجِّلت لأحدث حجز لهذا
// العميل (حسب تاريخ الدخول) — لتسريع تعبئة الحجوزات الجديدة لنفس العميل بنفس المسؤول تلقائيًا
function getSuggestedSalesAgent(clientName, token) {
  try {
    requireSession_(token);
    var norm = normalizeName_(clientName);
    if (!norm) return '';
    // الأولوية دائمًا لمسؤول البيع الافتراضي المحدَّد صراحةً في بيانات العميل (بيانات الحسابات)
    // — اختيار واعٍ من المستخدم يفوق أي تخمين تلقائي؛ التخمين من آخر حجز (أدناه) يبقى فقط
    // احتياطيًا لعميل لم يُحدَّد له مسؤول بيع افتراضي بعد
    var profile = getAllAccountProfiles_()[(clientName || '').toString().trim()];
    if (profile && profile.salesAgent) return profile.salesAgent;
    var best = null, bestTs = -1;
    getSourceRowsCached_().forEach(function (r) {
      if (normalizeName_(r[3]) !== norm) return;
      var agent = (r[19] || '').toString().trim();
      if (!agent) return;
      var cin = r[7]; var d = cin instanceof Date ? new Date(cin.getTime()) : new Date(cin);
      var ts = isNaN(d.getTime()) ? 0 : d.getTime();
      if (ts >= bestTs) { bestTs = ts; best = agent; }
    });
    return best || '';
  } catch (e) {
    Logger.log('Error in getSuggestedSalesAgent: ' + e.message);
    return '';
  }
}

// تعديل عدة حقول لنفس الحجز دفعة واحدة — fieldsMap = {رقم_العمود(1 يعني A): القيمة}
// كل حقل يُكتب في شيت المصدر مباشرة (نفس آلية editBookingField لكل حقل)
// نداء واحد للقراءة (لا نداء لكل حقل) لتعديل عدة حقول دفعة واحدة — كانت تستدعي
// editBookingField لكل حقل، وكل استدعاء يُعيد قراءة الصف كاملاً (34 عمودًا) من جديد رغم أن
// القيم القديمة لكل الحقول متاحة أصلاً من أول قراءة؛ لعدد حقول N كانت التكلفة ~2N نداء شبكة
// (قراءة+كتابة لكل حقل)، والآن قراءة واحدة + كتابة واحدة لكل حقل فعليًا تغيّر (لا تُكتب
// الأعمدة التي تحمل معادلات مهما طُلب ذلك — نفس حارس SOURCE_FORMULA_COLS_ المستخدَم بكل مكان
// آخر يكتب في شيت المصدر، ولم يكن مطبَّقًا هنا من قبل)
function editBookingFields(bookingKey, fieldsMap, token) {
  try {
    var actingUser = requirePermission_(token, 'bookings', 'edit');
    var city = (bookingKey || '').split('|')[0];
    if (!city) throw new Error('مفتاح حجز غير صالح');
    if (!bookingCityAllowed_(actingUser, city)) throw new Error('لا تملك صلاحية الوصول لحجوزات مدينة "' + city + '"');
    var src = findSourceRowIndex_(city, bookingKey);
    if (!src) throw new Error('لم يتم العثور على الحجز في شيت المصدر (' + city + ')');

    var rowVals = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
    var hotelRefOrRef = rowVals[17] || rowVals[2];
    var clientName = rowVals[3];
    // يُلتقَط قبل أي تعديل في هذه الدفعة (حتى لو كان الرقم الداخلي نفسه أحد الحقول المعدَّلة)
    // ليبقى مفتاح تجميع سجل التعديلات لهذا الحجز ثابتًا بصرف النظر عمّا تغيّر فيه لاحقًا
    var innerRefForLog = (rowVals[2] || '').toString().trim();
    var now = new Date();
    // قاعدة: تعديل يحمل رقم حجز فندق ⇒ الحالة "مؤكد" (rowVals[15] = العمود 16 = الحالة الحالية)
    applyHotelRefConfirmRule_(fieldsMap, String(rowVals[15] || '').trim());
    // يُلتقَط قبل أي كتابة في هذه الدفعة — لو كان رقم القيد مسجَّلاً بالفعل، وتغيّر أحد الحقول
    // "ذات القيمة" أدناه فعليًا، يستحق الحجز تنبيه "عُدِّل بعد تسجيل القيد"
    var qaidWasSet_ = !!(rowVals[0] || '').toString().trim();

    var count = 0, diffs = [], sigChanged_ = [];
    Object.keys(fieldsMap).forEach(function (colStr) {
      var col = parseInt(colStr, 10);
      if (SOURCE_FORMULA_COLS_[col]) return; // عمود معادلة — لا يُكتب فيه أبدًا
      var val = fieldsMap[colStr];
      if ((col === 8 || col === 9) && val) { // تاريخ الدخول (H) أو الخروج (I): يُحوَّلان لتاريخ حقيقي قبل الكتابة
        // ملاحظة مهمة: val نص "yyyy-MM-dd" — استخدام new Date(val) يفسّره كـ UTC منتصف الليل،
        // فيظهر في توقيت GMT+3 كـ "03:00:00" من نفس اليوم بدل منتصف الليل تمامًا. هذا الفرق
        // بالساعات يكسر معادلة عدد الليالي في المصدر (تاريخ الخروج - تاريخ الدخول) فيصبح رقمًا
        // كسريًا (مثل 2.78) بدل عدد صحيح. لذلك نبني التاريخ يدويًا بالتوقيت المحلي بدون أي إزاحة.
        var dParts = String(val).split('-');
        var d = (dParts.length === 3)
          ? new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10))
          : new Date(val);
        if (!isNaN(d.getTime())) val = d;
      }
      var oldValue = rowVals[col - 1];
      src.sheet.getRange(src.rowInSheet, col).setValue(val);
      rowVals[col - 1] = val; // فحقل لاحق بنفس الدفعة (إن وُجد) يرى القيمة الجديدة كـ"سابقة" له
      count++;
      var fieldLabel = BOOKING_COL_LABELS[col - 1] || ('عمود ' + colLetter_(col - 1));
      logChange_(actingUser, 'تعديل حجز', bookingKey, 'تعديل "' + fieldLabel + '"', oldValue, val,
        { hotelRef: hotelRefOrRef, clientName: clientName, recordKey: bookingRecordKey_(innerRefForLog) });
      if (String(oldValue || '') !== String(val || '')) {
        diffs.push({ label: fieldLabel, oldVal: oldValue, newVal: val });
        if (QAID_EDIT_TRIGGER_COLS_1BASED_[col]) sigChanged_.push(fieldLabel);
      }
    });
    invalidateSourceCache_();
    if (qaidWasSet_ && sigChanged_.length) {
      flagQaidEditedBooking_(bookingRecordKey_(innerRefForLog), innerRefForLog, hotelRefOrRef, clientName, sigChanged_, actingUser);
    }
    if (diffs.length) { try { tgNotifyBookingEdit_(bookingKey, diffs, staffDisplayName_(actingUser), '🖥 من داخل البرنامج — شاشة الحجوزات'); } catch (eN) { Logger.log('tgNotifyBookingEdit_: ' + eN.message); } }
    return { ok: true, count: count, syncedAt: Utilities.formatDate(now, 'GMT+3', 'dd/MM/yyyy HH:mm') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// bookingKey: المفتاح الفريد للحجز — colIndex1based: رقم العمود (1=A) — يُكتب في شيت المصدر مباشرة
// token: يُفرض هنا فعليًا (وليس فقط للتسجيل) — يرمي استثناء ويُرفَض التعديل بالكامل لو لم
// يملك صاحب الجلسة مستوى "تعديل" على الأقل في شاشة "كل الحجوزات"؛ هذا هو التحقق الفعلي من
// الصلاحية داخل الخادم (وليس مجرد إخفاء زر بالواجهة)
function editBookingField(bookingKey, colIndex1based, newValue, token) {
  try {
    var actingUser = requirePermission_(token, 'bookings', 'edit');
    var city = (bookingKey || '').split('|')[0];
    if (!city) throw new Error('مفتاح حجز غير صالح');
    if (!bookingCityAllowed_(actingUser, city)) throw new Error('لا تملك صلاحية الوصول لحجوزات مدينة "' + city + '"');

    var src = findSourceRowIndex_(city, bookingKey);
    if (!src) throw new Error('لم يتم العثور على الحجز في شيت المصدر (' + city + ')');

    var rowVals = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
    var oldValue = rowVals[colIndex1based - 1];
    var hotelRefOrRef = rowVals[17] || rowVals[2];
    var clientName = rowVals[3];
    // يُلتقَط قبل الكتابة حتى لو كان الرقم الداخلي نفسه هو الحقل المعدَّل هنا
    var innerRefForLog = (rowVals[2] || '').toString().trim();
    var qaidWasSet_ = !!(rowVals[0] || '').toString().trim();

    src.sheet.getRange(src.rowInSheet, colIndex1based).setValue(newValue);

    var now = new Date();
    // اسم الحقل الحقيقي (من BOOKING_COL_LABELS) بدل "عمود N" المبهم — يظهر بوضوح في سجل
    // التعديلات أي بيان تحديدًا تغيّر، بدل رقم عمود مجرّد لا معنى له لغير المطّلع على الشيت
    var fieldLabel = BOOKING_COL_LABELS[colIndex1based - 1] || ('عمود ' + colLetter_(colIndex1based - 1));
    logChange_(actingUser, 'تعديل حجز', bookingKey, 'تعديل "' + fieldLabel + '"', oldValue, newValue,
      { hotelRef: hotelRefOrRef, clientName: clientName, recordKey: bookingRecordKey_(innerRefForLog) });
    if (qaidWasSet_ && QAID_EDIT_TRIGGER_COLS_1BASED_[colIndex1based] && String(oldValue || '') !== String(newValue || '')) {
      flagQaidEditedBooking_(bookingRecordKey_(innerRefForLog), innerRefForLog, hotelRefOrRef, clientName, [fieldLabel], actingUser);
    }

    invalidateSourceCache_();
    return { ok: true, oldValue: oldValue, newValue: newValue, syncedAt: Utilities.formatDate(now, 'GMT+3', 'dd/MM/yyyy HH:mm') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


function AutoOpen() {

showSidebar();


  // تحديث ورقة قائمة اسماء العملاء
  updateSheetLinks();

  var ui = SpreadsheetApp.getUi();

  // دمج جميع القوائم في مكان واحد ليكون الكود أنظف
  ui.createMenu('⚙️ الإعدادات')
      .addItem('قائمة العملاء', 'showSidebar')
      .addSeparator() // خط فاصل للترتيب
      .addItem('تنزيل نسخة احتياطية كملف Excel', 'downloadBackup')
      .addSeparator() // خط فاصل للترتيب
      .addItem('حفظ كملف PDF', 'saveAsPDF')
      .addSeparator() // خط فاصل للترتيب
      .addItem('إعدادات مصدر الحجوزات', 'showSourceSettingsDialog')
      .addToUi();







}


function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('قائمة التنقل')
      .setWidth(170) // تقليل العرض هنا ليكون الشريط أنحف
      .setHeight(500);
  // استخدام التراي والكاتش لضمان عدم توقف الكود إذا منع المتصفح النافذة
  try {
  SpreadsheetApp.getUi().showModelessDialog(html, ' ');
  } catch (e) {
    Logger.log('فشل فتح النافذة تلقائياً: ' + e.message);
  }
}




// دالة جديدة لمعرفة الورقة النشطة حالياً
function getActiveSheetName() {
  return getSS_().getActiveSheet().getName();
}


function getAllSheetNames() {
  var sheets = getSS_().getSheets();
  return sheets.map(function(sheet) {
    return sheet.getName();
  });
}

function setActiveSheet(sheetName) {
  var ss = getSS_();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.activate();
  }
}





function downloadBackup() {
  var ss = getSS_();
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  var params = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    }
  };
  var response = UrlFetchApp.fetch(url, params);
  var blob = response.getBlob().setName(ss.getName() + '.xlsx');
  var file = DriveApp.createFile(blob);

  // إنشاء رابط لتنزيل النسخة الاحتياطية مع JavaScript لإغلاق الرسالة وحذف الملف
  registerTempFile_(file.getId());
  var htmlOutput = HtmlService.createHtmlOutput('<html><body>' +
    '<a id="downloadLink" href="' + file.getDownloadUrl() + '" target="_blank">Download your backup</a>' +
    '<script>' +
    'document.getElementById("downloadLink").addEventListener("click", function() {' +
    '  google.script.run.deleteTempFile("' + file.getId() + '");' +
    '  setTimeout(function() {' +
    '    google.script.host.close();' +
    '  }, 2000);' + // زيادة الوقت هنا لضمان حذف الملف قبل إغلاق النافذة
    '});' +
    '</script>' +
    '</body></html>');
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Download Backup');
}

// (7.15.0) كانت تنقل أي ملف بالدرايف للسلة لأي زائر يعرف معرّفه — الآن فقط ملفات النسخة
// الاحتياطية/الـPDF المؤقتة التي أنشأها البرنامج نفسه خلال الساعة الأخيرة (مسجَّلة بالكاش)
function registerTempFile_(fileId) {
  try { CacheService.getScriptCache().put('tmpfile_' + fileId, '1', 3600); } catch (e) {}
}
function deleteTempFile(fileId) {
  try {
    fileId = String(fileId || '');
    if (!fileId || CacheService.getScriptCache().get('tmpfile_' + fileId) !== '1') throw new Error('ملف غير مسموح بحذفه');
    CacheService.getScriptCache().remove('tmpfile_' + fileId);
    var file = DriveApp.getFileById(fileId);
    Logger.log('Found file: ' + file.getName());
    file.setTrashed(true);
    Logger.log('File moved to trash: ' + file.getName());
  } catch (e) {
    Logger.log('Error: ' + e.toString());
  }
}




function onEdit(e) {
  // رصد تعديل الحجز اليدوي انتقل لمشغّل قابل للتثبيت (tgHandleSheetEditInstallable_، يُنشئه
  // ensureTelegramTrigger_ تلقائيًا) لأن onEdit البسيط هنا يعمل بصلاحية مقيَّدة لأي مستخدم لم
  // يُصرِّح للسكربت شخصيًا — فكان التنبيه يصل فقط حين يُعدِّل من صرّح للسكربت (المدير عادة)
  // ويفشل بصمت تام لأي موظف آخر
  if (e && (e.changeType == 'INSERT_GRID' || e.changeType == 'REMOVE_GRID')) {
    updateSheetLinks();
  }
}

function updateSheetLinks() {
  var ss = getSS_();
  var sheet = ss.getSheetByName('القائمة');

  if (!sheet) {
    sheet = ss.insertSheet('القائمة');
  } else {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      // مسح محتويات العمود A فقط
      sheet.getRange(2, 1, lastRow - 1).clearContent();
    }
  }

  var sheets = ss.getSheets();
  var sheetNames = [];

  // جمع أسماء الأوراق وقيم H1 و I1 في مصفوفة
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() !== 'القائمة') {
      var sheetName = sheets[i].getName();
      var H1Value = sheets[i].getRange('H1').getValue();
      var I1Value = sheets[i].getRange('I1').getValue();
      sheetNames.push({name: sheetName, H1: H1Value, I1: I1Value});
    }
  }

  // ترتيب الأسماء تصاعديا
  sheetNames.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  // إضافة الأسماء المرتبة إلى ورقة العمل
  var rowIndex = 2;
  for (var i = 0; i < sheetNames.length; i++) {
    var sheetData = sheetNames[i];
    var sheetId = ss.getSheetByName(sheetData.name).getSheetId();
    var formula = '=HYPERLINK("#gid=' + sheetId + '", "' + sheetData.name + '")';

    sheet.getRange(rowIndex, 1).setFormula(formula);

    // تنسيق العمود A
    var cell = sheet.getRange(rowIndex, 1);
    cell.setFontFamily("Arial");
    cell.setFontSize(12);
    cell.setFontWeight("bold");
    cell.setBackground("#007a37"); // لون الخلفية
    cell.setHorizontalAlignment("center"); // النص في الوسط
    cell.setVerticalAlignment("middle");
    cell.setFontLine("none");
    cell.setBorder(true, true, true, true, null, null);

    rowIndex++;
  }
}


function saveAsPDF() {
  var sheet = getSS_().getActiveSheet();
  var range = sheet.getActiveRange();
  var spreadsheetId = getSS_().getId();
  var sheetId = sheet.getSheetId();
  var rangeA1Notation = range.getA1Notation();

  // الحصول على التاريخ الحالي
  var today = new Date();
  var dd = String(today.getDate()).padStart(2, '0');
  var mm = String(today.getMonth() + 1).padStart(2, '0'); // يناير هو 0!
  var yyyy = today.getFullYear();
  var formattedDate = dd + '-' + mm + '-' + yyyy;

  var url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=pdf' +
            '&gid=' + sheetId +
            '&range=' + encodeURIComponent(rangeA1Notation) +
            '&portrait=true' +
            '&fitw=true' +
            '&size=letter' +
            '&top_margin=0.5' +
            '&bottom_margin=0.5' +
            '&left_margin=0.5' +
            '&right_margin=0.5' +
            '&sheetnames=false' +
            '&printtitle=false' +
            '&date=true' +
            '&pagenum=false' +
            '&gridlines=false' +
            '&fzr=false' +
            '&comments=false'; // لمنع طباعة التعليقات

  var params = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, params);
  if (response.getResponseCode() !== 200) {
    Logger.log(response.getContentText());
    throw new Error('Failed to fetch the PDF. Check the log for details.');
  }

  // إنشاء اسم الملف مع التاريخ
  var fileName = sheet.getSheetName() + ' ' + formattedDate + '.pdf';
  var blob = response.getBlob().setName(fileName);
  var file = DriveApp.createFile(blob);

  // إنشاء رابط لتنزيل النسخة الاحتياطية مع JavaScript لإغلاق الرسالة وحذف الملف
  registerTempFile_(file.getId());
  var htmlOutput = HtmlService.createHtmlOutput('<html><body>' +
    '<a id="downloadLink" href="' + file.getDownloadUrl() + '" target="_blank">Download your PDF</a>' +
    '<script>' +
    'document.getElementById("downloadLink").addEventListener("click", function() {' +
    '  google.script.run.deleteTempFile("' + file.getId() + '");' +
    '  setTimeout(function() {' +
    '    google.script.host.close();' +
    '  }, 2000);' + // زيادة الوقت هنا لضمان حذف الملف قبل إغلاق النافذة
    '});' +
    '</script>' +
    '</body></html>');
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Download PDF');
}




function sortSheetsByName() {
  const spreadsheet = getSS_();
  const sheets = spreadsheet.getSheets();

  // فرز الأوراق حسب الاسم بترتيب أبجدي
  const sortedSheets = sheets.sort((a, b) => {
    return a.getName().localeCompare(b.getName(), 'ar');
  });

  // إعادة ترتيب الأوراق فعليًا في ملف جوجل شيت
  sortedSheets.forEach((sheet, index) => {
    spreadsheet.setActiveSheet(sheet);
    spreadsheet.moveActiveSheet(index + 1);
  });

  // العودة إلى الورقة الأولى بعد إعادة الترتيب
  spreadsheet.setActiveSheet(sortedSheets[0]);
}


function setSheetNamesInDropdown() {
  const ss = getSS_();
  const sheetNames = ss.getSheets().map(sheet => sheet.getName()); // جلب أسماء الأوراق

  // الأوراق التي تريد تحديث الخلية D1 فيها
  const targetSheets = ["COMPANY", "CLIENT"];

  // إعداد قاعدة التحقق من البيانات
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(sheetNames, true) // إضافة أسماء الأوراق كقائمة منسدلة
    .setAllowInvalid(true)
    .build();

  // تعيين قاعدة التحقق لكل ورقة محددة
  targetSheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) { // تحقق أن الورقة موجودة
      const cell = sheet.getRange("D1");
      cell.setDataValidation(rule);
    }
  });
}



///////Code.gs خاص بصفحة الويب لعرض وطباعة كشف حساب عميل/////

// [حُذفت هنا] fetchStatementData وgetCustomersList — نسختان قديمتان جدًا من كشف الحساب/قائمة
// العملاء، من مرحلة سابقة للتطبيق الحالي، كانتا تقرآن من ملف جوجل شيتس خارجي مختلف تمامًا
// (معرّف ملف مكتوب مباشرة بالكود، غير معرّف المصدر الحالي المُدار من شاشة الإعدادات) وبمنطق
// حساب قديم (قراءة عمودي الإجمالي الجاهزين AE/AF مباشرة بدل احتسابهما من الأسعار والليالي —
// بالضبط الأسلوب الذي استُبدل لاحقًا بـ computeBookingTotal_ في كل مكان آخر بالتطبيق). لا
// استدعاء واحد لهما من أي واجهة حالية أو حتى قديمة — نتيجة المراجعة الشاملة لكل دوال الخادم.


// التوجيه بين صفحات الويب المختلفة عبر ?page= في رابط النشر
// بدون معامل: كشف الحساب (الوضع الحالي). page=bookings: شاشة كل الحجوزات
function getAppBaseUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (e) {
    return '';
  }
}

// البرنامج كله (كشف حساب / كل الحجوزات / متابعة الأرصدة / استيراد الدفعات / الإعدادات)
// أصبح صفحة واحدة (App.html) بتنقّل داخلي فوري بدون إعادة تحميل من السيرفر — أبسط في الصيانة
// وتجنّب مشكلة رابط جوجل المعزول (googleusercontent.com) في التنقل بين الصفحات القديمة.
function doGet(e) {
  var initialPage = (e && e.parameter && e.parameter.page) || 'statement';
  // بوابة العملاء: صفحة عميل منفصلة تمامًا (Portal.html) لا تحمل أي كود أو دوال للواجهة
  // الإدارية — الرابط عام لا يحمل هوية أي عميل (فمشاركته لا تسرّب شيئًا)، والدخول يتطلب كود
  // العميل + كلمة مروره، ويُصدَّر رمز جلسة موقَّع (HMAC) يقصر الوصول على حجوزات هذا العميل فقط
  if (initialPage === 'portal') {
    try {
      return HtmlService.createHtmlOutputFromFile('Portal')
        .setTitle('بوابة العملاء — شركة منف للسياحة الدولية')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (perr) {
      return HtmlService.createHtmlOutput('<div style="font-family:Arial;direction:rtl;padding:30px;">تعذّر فتح بوابة العملاء: ' + perr.message + '<br>تأكد أن اسم ملف الـ HTML هو <b>Portal</b>.</div>');
    }
  }
  try {
    var tmpl = HtmlService.createTemplateFromFile('App');
    tmpl.baseUrl = getAppBaseUrl_();
    tmpl.initialPage = initialPage;
    return tmpl.evaluate()
        .setTitle('حجوزات وحسابات سكن')
        // ⚠️ لا تحذف هذا السطر ولا تكتفِ بوسم <meta> المكتوب داخل App.html: Apps Script يحذف
        // كل وسوم <meta> من ملف الـHTML عند عرضه (يعيد بناء الـ<head> داخل إطاره المعزول)،
        // فالطريق الوحيد لوصول viewport للمتصفح هو addMetaTag من الخادم هنا. بدونه يرسم الموبايل
        // الصفحة بعرض سطح مكتب افتراضي (~980px) ثم يُصغّرها، فلا تُفعَّل أي قاعدة @media max-width
        // ويختفي تخطيط الموبايل بالكامل (الشريط السفلي وغيره) رغم وجود كوده كاملًا.
        // ⚠️ addMetaTag لا يقبل عند Apps Script إلا اسمَي "viewport" و"google-site-verification"
        // حصرًا — أي اسم آخر (theme-color مثلاً) يُفشل evaluate() بالكامل برسالة "غير مسموح
        // بالعلامة الوصفية" فيتعطّل البرنامج كله، لا هذا الوسم فقط. لا تُضِف addMetaTag أخرى هنا
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Tajawal,Arial,sans-serif;direction:rtl;padding:30px;max-width:600px;margin:0 auto;">' +
      '<h2 style="color:#b8382a;">تعذّر فتح البرنامج</h2>' +
      '<p style="color:#2a2721;">رسالة الخطأ: ' + err.message + '</p>' +
      '<p style="color:#756c5b;font-size:13px; line-height:1.8;">' +
      'تأكد أن اسم ملف الـ HTML الرئيسي في محرر Apps Script هو بالضبط <b>App</b> (بدون امتداد).' +
      '</p></div>'
    );
  }
}

function getPrintTemplate() {
  return HtmlService.createTemplateFromFile('PrintTemplate').getRawContent();
}

function getConfirmationTemplate() {
  return HtmlService.createTemplateFromFile('ConfirmationTemplate').getRawContent();
}

function getArrivalsReportTemplate() {
  return HtmlService.createTemplateFromFile('ArrivalsReportTemplate').getRawContent();
}
// نفس القالب لبوابة العميل — بتحقق رمز البوابة بدل جلسة الموظف، ليخرج تقرير حجوزات العميل
// بنفس تنسيق الطباعة تمامًا (حدود، هوامش، ترقيم حقيقي، توقيت أسفل كل صفحة)
function portalGetReportTemplate(ptoken) {
  verifyPortalToken_(ptoken);
  return HtmlService.createTemplateFromFile('ArrivalsReportTemplate').getRawContent();
}

function getBalancesReportTemplate() {
  return HtmlService.createTemplateFromFile('BalancesReportTemplate').getRawContent();
}


// ==========================================================
// مشاركة PDF حقيقي (نص متجه) عبر ملف مؤقت في Google Drive
// ==========================================================
// الفرق الجوهري عن الآلية القديمة: لا التقاط صورة إطلاقًا. الواجهة تبني نص HTML كاملًا
// (نفس تصميم الطباعة) وترسله هنا، فيحوّله جوجل مباشرةً إلى PDF عبر
// Utilities.newBlob(html,'text/html').getAs('application/pdf') — فيخرج نصًا حقيقيًا
// قابلًا للتحديد والبحث ولا يتبكسل مهما كُبِّر، ورؤوس الأعمدة تتكرر تلقائيًا في كل صفحة
// عبر thead{display:table-header-group}. الملف يُحفظ بمجلد مؤقت مخصص ويُتاح "لأي شخص لديه
// الرابط: عرض" ليصل للمستلم بلا تسجيل دخول، ثم يُحذف عند إغلاق نافذة المشاركة — إلا إذا
// فُتح رابطه فعلًا للمستخدم ليشاركه بنفسه (حذفه حينها يكسر الرابط عند المستلم).
var SHARE_TEMP_FOLDER_ = 'ملفات مشاركة مؤقتة';
var SHARE_TEMP_RETENTION_MIN_ = 3; // عمر الملف المؤقت بالدقائق قبل حذفه القسري

function ensureTempShareFolder_() {
  var it = DriveApp.getFoldersByName(SHARE_TEMP_FOLDER_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SHARE_TEMP_FOLDER_);
}

// شغّل هذه الدالة يدويًا مرة واحدة من محرر Apps Script (قائمة تشغيل) لمنح صلاحية Drive
// وإنشاء المجلد المؤقت مسبقًا. ليست شرطًا للعمل — كل شيء يُنشأ تلقائيًا عند أول مشاركة —
// لكنها تُظهر شاشة الموافقة مباشرةً بدل ظهورها لاحقًا. (الدوال المنتهية بـ"_" لا تظهر في
// قائمة التشغيل، ولهذا هذه بلا شرطة سفلية.)
function setupDriveAccess() {
  requireScriptOwner_();   // (7.15.0) دالة إعداد — من المحرر فقط
  var folder = ensureTempShareFolder_();
  purgeShareTempFolder();
  return 'تم التجهيز. مجلد الملفات المؤقتة: ' + folder.getName() + ' — معرّفه: ' + folder.getId();
}

// حذف قسري لكل ملف تجاوز عمره SHARE_TEMP_RETENTION_MIN_ — سواء تمت المشاركة أم لا.
// تُستدعى: (1) عند كل إنشاء ملف جديد، (2) من مؤقّت لمرة واحدة يُنشأ مع كل ملف ليضمن
// الحذف حتى لو أغلق المستخدم المتصفح ولم يُنشئ أي ملف بعدها.
function purgeShareTempFolder() {
  try {
    var folder = ensureTempShareFolder_();
    var cutoff = new Date(Date.now() - SHARE_TEMP_RETENTION_MIN_ * 60 * 1000);
    var files = folder.getFiles(), n = 0;
    while (files.hasNext()) {
      var f = files.next();
      if (f.getDateCreated() < cutoff) { f.setTrashed(true); n++; }
    }
    cleanupSpentPurgeTriggers_();
    return n;
  } catch (e) { Logger.log('purgeShareTempFolder: ' + e.message); return 0; }
}
// مؤقّت لمرة واحدة بعد مهلة الاحتفاظ — يضمن الحذف دون انتظار مشاركة تالية
function schedulePurge_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var pending = triggers.filter(function (t) { return t.getHandlerFunction() === 'purgeShareTempFolder'; });
    if (pending.length >= 3) return; // لا نُراكم مؤقّتات
    ScriptApp.newTrigger('purgeShareTempFolder')
      .timeBased().after((SHARE_TEMP_RETENTION_MIN_ + 1) * 60 * 1000).create();
  } catch (e) { /* المؤقّت إضافة أمان فقط — لا نُفشل المشاركة بسببه */ }
}
// إزالة المؤقّتات التي نفّذت مهمتها حتى لا تتجاوز حد المشروع
function cleanupSpentPurgeTriggers_() {
  try {
    var folder = ensureTempShareFolder_();
    if (folder.getFiles().hasNext()) return; // لا يزال هناك ملفات — أبقِ المؤقّتات
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'purgeShareTempFolder') ScriptApp.deleteTrigger(t);
    });
  } catch (e) {}
}

// html: مستند HTML كامل جاهز للطباعة (CSS مضمَّن بالكامل — لا موارد خارجية)
// fileName: اسم الملف بلا امتداد
function generateSharePdf(token, html, fileName) {
  try {
    requireSession_(token);
    if (!html || !html.toString().trim()) throw new Error('لا يوجد محتوى للتحويل');
    var folder = ensureTempShareFolder_();
    purgeShareTempFolder();  // حذف ما تجاوز مهلة الاحتفاظ قبل إنشاء الجديد
    var safeName = (fileName || 'ملف').toString().replace(/[\\\/:*?"<>|]/g, '-').trim() || 'ملف';
    var blob = Utilities.newBlob(html.toString(), 'text/html', safeName + '.html').getAs('application/pdf');
    blob.setName(safeName + '.pdf');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    schedulePurge_(); // يضمن الحذف بعد المهلة حتى لو أُغلق المتصفح ولم تتم أي مشاركة لاحقة
    return {
      ok: true,
      fileId: file.getId(),
      fileName: safeName + '.pdf',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      viewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      pdfBase64: Utilities.base64Encode(blob.getBytes())
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

function deleteSharedFile(token, fileId) {
  if (!fileId) return { ok: false };
  try {
    requireSession_(token);
    DriveApp.getFileById(fileId).setTrashed(true);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}


// ==========================================================
// بوابة العملاء (المرحلة 1) — لكل عميل بوابة واحدة: كود + كلمة مرور تُنشآن مع البوابة، يدخل
// العميل من رابط عام واحد (?page=portal) لا يحمل هويته، فيرى حجوزاته فقط (بيانات أساسية،
// والأسعار تظهر أو تُخفى حسب قرار الموظف). كل إدارة البوابة (إنشاء/إعادة تعيين كلمة المرور/
// تعطيل/تفعيل/حذف/عرض الأسعار) تتطلب صلاحية "clientPortal". الوصول مؤمَّن برمز جلسة موقَّع
// (HMAC-SHA256) لا يمكن تزويره، ويقصر كل نداء على حجوزات العميل صاحب الرمز فقط.
// ==========================================================
var PORTAL_SHEET_NAME = 'بوابة العملاء';
var PORTAL_SECRET_KEY_ = 'PORTAL_HMAC_SECRET';
var PORTAL_SESSION_MIN_ = 120; // مدة جلسة العميل في البوابة (دقائق)

function ensurePortalSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(PORTAL_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PORTAL_SHEET_NAME);
    sh.getRange(1, 1, 1, 9).setValues([['اسم العميل', 'كود العميل', 'الملح', 'كلمة المرور المجزّأة', 'الحالة', 'عرض الأسعار', 'تاريخ الإنشاء', 'آخر دخول', 'عرض الحجوزات السابقة']]);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < 9) {
    // ترقية ورقة قديمة (8 أعمدة) بإضافة عمود "عرض الحجوزات السابقة" التاسع دون فقدان بيانات
    sh.getRange(1, 9).setValue('عرض الحجوزات السابقة');
  }
  return sh;
}
function portalSecret_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty(PORTAL_SECRET_KEY_);
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty(PORTAL_SECRET_KEY_, s); }
  return s;
}
// رمز جلسة موقَّع: base64(payload).base64(HMAC) — الحمولة تحمل الكود فقط (نص لاتيني ASCII،
// بلا أي اسم عربي حتى لا تتأثر بترميز/فك ترميز UTF-8) + انتهاء الصلاحية؛ الاسم يُستخرَج دائمًا
// من سجل البوابة عبر الكود. لا يمكن تعديل الرمز أو تزويره دون السر المخزَّن في خصائص السكربت
function signPortalToken_(code) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ k: code, exp: Date.now() + PORTAL_SESSION_MIN_ * 60000 }));
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, portalSecret_()));
  return payload + '.' + sig;
}
function verifyPortalToken_(tok) {
  if (!tok || tok.indexOf('.') === -1) throw new Error('انتهت الجلسة — سجّل الدخول من جديد');
  var parts = tok.split('.');
  var expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], portalSecret_()));
  if (parts[1] !== expected) throw new Error('رمز جلسة غير صالح');
  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!payload || payload.exp < Date.now()) throw new Error('انتهت الجلسة — سجّل الدخول من جديد');
  // لا بد أن تبقى البوابة قائمة ونشطة (تعطيلها/حذفها يُبطل أي رمز فوري رغم بقاء صلاحيته الزمنية)
  var rec = getPortalRecordByCode_(payload.k);
  if (!rec || rec.status !== 'نشط') throw new Error('تم إيقاف هذه البوابة — تواصل مع الشركة');
  return rec;
}

function portalRows_() {
  var sh = ensurePortalSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().map(function (r, i) {
    return {
      rowIdx: i + 2, name: (r[0] || '').toString().trim(), code: (r[1] || '').toString().trim(),
      salt: r[2], hash: r[3], status: r[4] === 'معطّل' ? 'معطّل' : 'نشط',
      showPrices: r[5] === 'نعم' || r[5] === true, created: r[6], lastLogin: r[7],
      showPast: r[8] === 'نعم' || r[8] === true
    };
  });
}
function getPortalRecordByName_(name) {
  var n = normalizeName_(name);
  var all = portalRows_();
  for (var i = 0; i < all.length; i++) if (normalizeName_(all[i].name) === n) return all[i];
  return null;
}
function getPortalRecordByCode_(code) {
  var c = (code || '').toString().trim().toLowerCase();
  var all = portalRows_();
  for (var i = 0; i < all.length; i++) if (all[i].code.toLowerCase() === c) return all[i];
  return null;
}
function genPortalString_(len, alphabet) {
  var out = '';
  for (var i = 0; i < len; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return out;
}
function genUniquePortalCode_() {
  var alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // بلا أحرف/أرقام ملتبسة (0/O، 1/I/L)
  for (var t = 0; t < 40; t++) {
    var code = genPortalString_(6, alpha);
    if (!getPortalRecordByCode_(code)) return code;
  }
  return genPortalString_(8, alpha);
}

// ---- دوال إدارة البوابة (صلاحية clientPortal) ----
// الرابط العام لبوابة العملاء (نفس رابط النشر + ?page=portal) — يُشارَك كما هو مع كل العملاء،
// لا يحمل هوية أي عميل، والدخول بالكود + كلمة المرور
function getClientPortalUrl(token) {
  try {
    requirePermission_(token, 'clientPortal', 'view');
    var base = getAppBaseUrl_();
    return { ok: true, url: base ? (base + (base.indexOf('?') !== -1 ? '&' : '?') + 'page=portal') : '' };
  } catch (e) { return { ok: false, error: e.message }; }
}
// يُرجع البوابات القائمة فقط (قراءة شيت البوابة الصغير فقط — سريع جدًا) بدل قراءة كل أسماء
// العملاء من المصدر الخارجي الثقيل في كل مرة. إنشاء بوابة جديدة يتم عبر حقل بحث بأسماء العملاء
// في الواجهة (القائمة محمَّلة أصلًا هناك) ثم createClientPortal — فلا حاجة لتحميل كل الأسماء هنا
function getClientPortalList(token) {
  try {
    requirePermission_(token, 'clientPortal', 'view');
    var out = portalRows_().map(function (r) {
      return { name: r.name, hasPortal: true, code: r.code, status: r.status, showPrices: r.showPrices, showPast: r.showPast, lastLogin: r.lastLogin ? Utilities.formatDate(new Date(r.lastLogin), 'GMT+3', 'dd/MM/yyyy HH:mm') : '' };
    });
    out.sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    return safeReturn_(out);
  } catch (e) { return safeReturn_({ error: e.message }); }
}
// تعديل كود عميل يدويًا (مع ضمان عدم تكراره) — الطلب الصريح: إتاحة تعديل الكود
function editClientPortalCode(token, clientName, newCode) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    var rec = getPortalRecordByName_(clientName);
    if (!rec) throw new Error('لا توجد بوابة لهذا العميل');
    newCode = (newCode || '').toString().trim();
    if (!/^[A-Za-z0-9]{3,12}$/.test(newCode)) throw new Error('الكود يجب أن يكون 3–12 حرفًا/رقمًا إنجليزيًا بلا مسافات أو رموز');
    var existing = getPortalRecordByCode_(newCode);
    if (existing && existing.rowIdx !== rec.rowIdx) throw new Error('هذا الكود مستخدَم لعميل آخر — اختر كودًا مختلفًا');
    ensurePortalSheet_().getRange(rec.rowIdx, 2).setValue(newCode);
    logChange_(user, 'بوابة العملاء', rec.name, 'تعديل كود البوابة إلى: ' + newCode, rec.code, newCode);
    return { ok: true, code: newCode };
  } catch (e) { return { ok: false, error: e.message }; }
}
function createClientPortal(token, clientName) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    clientName = (clientName || '').toString().trim();
    if (!clientName) throw new Error('اسم العميل مطلوب');
    if (getPortalRecordByName_(clientName)) throw new Error('هذا العميل له بوابة بالفعل — استخدم "إعادة تعيين كلمة المرور" بدلًا من إنشاء جديدة');
    var sh = ensurePortalSheet_();
    var code = genUniquePortalCode_();
    var pw = genPortalString_(6, 'abcdefghjkmnpqrstuvwxyz23456789');
    var salt = Utilities.getUuid();
    sh.appendRow([clientName, code, salt, hashPassword_(pw, salt), 'نشط', 'لا', new Date(), '', 'لا']);
    logChange_(user, 'بوابة العملاء', clientName, 'إنشاء بوابة عميل (كود: ' + code + ')', '', '');
    return { ok: true, code: code, password: pw };
  } catch (e) { return { ok: false, error: e.message }; }
}
function resetClientPortalPassword(token, clientName) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    var rec = getPortalRecordByName_(clientName);
    if (!rec) throw new Error('لا توجد بوابة لهذا العميل');
    var pw = genPortalString_(6, 'abcdefghjkmnpqrstuvwxyz23456789');
    var salt = Utilities.getUuid();
    ensurePortalSheet_().getRange(rec.rowIdx, 3, 1, 2).setValues([[salt, hashPassword_(pw, salt)]]);
    logChange_(user, 'بوابة العملاء', rec.name, 'إعادة تعيين كلمة مرور البوابة', '', '');
    return { ok: true, code: rec.code, password: pw };
  } catch (e) { return { ok: false, error: e.message }; }
}
function setClientPortalStatus(token, clientName, active) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    var rec = getPortalRecordByName_(clientName);
    if (!rec) throw new Error('لا توجد بوابة لهذا العميل');
    ensurePortalSheet_().getRange(rec.rowIdx, 5).setValue(active ? 'نشط' : 'معطّل');
    logChange_(user, 'بوابة العملاء', rec.name, active ? 'تفعيل البوابة' : 'تعطيل البوابة', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
function setClientPortalPriceVisibility(token, clientName, show) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    var rec = getPortalRecordByName_(clientName);
    if (!rec) throw new Error('لا توجد بوابة لهذا العميل');
    ensurePortalSheet_().getRange(rec.rowIdx, 6).setValue(show ? 'نعم' : 'لا');
    logChange_(user, 'بوابة العملاء', rec.name, show ? 'إظهار الأسعار للعميل' : 'إخفاء الأسعار عن العميل', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// عرض/إخفاء الحجوزات السابقة (تاريخ الخروج أقل من اليوم) للعميل — افتراضيًا مخفية
function setClientPortalShowPast(token, clientName, show) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    var rec = getPortalRecordByName_(clientName);
    if (!rec) throw new Error('لا توجد بوابة لهذا العميل');
    ensurePortalSheet_().getRange(rec.rowIdx, 9).setValue(show ? 'نعم' : 'لا');
    logChange_(user, 'بوابة العملاء', rec.name, show ? 'إظهار الحجوزات السابقة للعميل' : 'إخفاء الحجوزات السابقة', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
function deleteClientPortal(token, clientName) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    var rec = getPortalRecordByName_(clientName);
    if (!rec) throw new Error('لا توجد بوابة لهذا العميل');
    ensurePortalSheet_().deleteRow(rec.rowIdx);
    logChange_(user, 'بوابة العملاء', rec.name, 'حذف البوابة نهائيًا', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---- دوال جهة العميل (بلا صلاحيات النظام — رمز جلسة موقَّع فقط) ----
function portalLogin(code, password) {
  try {
    var rec = getPortalRecordByCode_(code);
    // نفس رسالة الخطأ للكود الخاطئ وكلمة المرور الخاطئة (عدم كشف أي الكودين صحيح)
    if (!rec || rec.status !== 'نشط' || hashPassword_(password, rec.salt) !== rec.hash) {
      throw new Error('الكود أو كلمة المرور غير صحيحة');
    }
    ensurePortalSheet_().getRange(rec.rowIdx, 8).setValue(new Date());
    return safeReturn_({ ok: true, token: signPortalToken_(rec.code), clientName: rec.name, showPrices: rec.showPrices });
  } catch (e) { return { ok: false, error: e.message }; }
}
function portalCheckSession(ptoken) {
  try {
    var rec = verifyPortalToken_(ptoken);
    return safeReturn_({ ok: true, clientName: rec.name, showPrices: rec.showPrices });
  } catch (e) { return { ok: false }; }
}
function portalChangePassword(ptoken, oldPassword, newPassword) {
  try {
    var rec = verifyPortalToken_(ptoken);
    if (hashPassword_(oldPassword, rec.salt) !== rec.hash) throw new Error('كلمة المرور الحالية غير صحيحة');
    if (!newPassword || newPassword.toString().length < 4) throw new Error('كلمة المرور الجديدة قصيرة جدًا (4 أحرف على الأقل)');
    var salt = Utilities.getUuid();
    ensurePortalSheet_().getRange(rec.rowIdx, 3, 1, 2).setValues([[salt, hashPassword_(newPassword, salt)]]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// حجوزات العميل — بيانات أساسية فقط؛ الأسعار تُرفَق فقط إن كان الموظف قد فعّل إظهارها لهذا العميل.
// لا يُقبَل اسم عميل من الواجهة إطلاقًا — يُستخرَج حصرًا من الرمز الموقَّع فيستحيل عرض حجوزات غيره
function portalGetBookings(ptoken) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var target = normalizeName_(rec.name);
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var todayTs = todayStart.getTime();
    var rows = [];
    getSourceRowsCached_().forEach(function (r) {
      var raw = r.slice(0, SOURCE_LAST_COL);
      var city = r[SOURCE_LAST_COL];
      if (normalizeName_((raw[3] || '').toString()) !== target) return;
      if (raw[15] === 'لاغي') return; // لا نعرض الملغاة للعميل
      // حجز "سابق" = تاريخ خروجه أقل من اليوم (دخل وخرج فعليًا). افتراضيًا لا يُعرَض للعميل
      // إلا لو فعّل الموظف "عرض الحجوزات السابقة"؛ وحتى عند عرضه يكون للعرض فقط بلا تعديل
      var coRaw = raw[8];
      var coTs = coRaw instanceof Date ? (function () { var d = new Date(coRaw.getTime()); d.setHours(0, 0, 0, 0); return d.getTime(); })() : null;
      var isPast = coTs !== null && coTs < todayTs;
      if (isPast && !rec.showPast) return;
      var doubles = parseInt(raw[10]) || 0, triples = parseInt(raw[11]) || 0, quads = parseInt(raw[12]) || 0, quints = parseInt(raw[13]) || 0;
      var nights = parseInt(raw[9]) || 0;
      var roomsParts = [];
      if (doubles) roomsParts.push('ثنائي×' + doubles);
      if (triples) roomsParts.push('ثلاثي×' + triples);
      if (quads) roomsParts.push('رباعي×' + quads);
      if (quints) roomsParts.push('خماسي×' + quints);
      var row = {
        bookingKey: bookingKey_(raw, city),
        innerRef: (raw[2] || '').toString(), city: city, hotel: (raw[4] || '').toString(),
        checkIn: raw[7] instanceof Date ? Utilities.formatDate(raw[7], 'GMT+3', 'dd/MM/yyyy') : (raw[7] || ''),
        checkOut: raw[8] instanceof Date ? Utilities.formatDate(raw[8], 'GMT+3', 'dd/MM/yyyy') : (raw[8] || ''),
        checkInIso: raw[7] instanceof Date ? Utilities.formatDate(raw[7], 'GMT+3', 'yyyy-MM-dd') : '',
        checkOutIso: raw[8] instanceof Date ? Utilities.formatDate(raw[8], 'GMT+3', 'yyyy-MM-dd') : '',
        doubles: doubles, triples: triples, quads: quads, quints: quints,
        nights: nights, rooms: roomsParts.join('، '), status: (raw[15] || '').toString(),
        isPast: isPast,
        sortTs: raw[7] instanceof Date ? raw[7].getTime() : 0
      };
      if (rec.showPrices) {
        var sale = computeBookingTotal_(raw, 'client');
        row.sale = sale.hasPrice ? Math.round(sale.value) : null;
        // تفصيل سعر الليلة لكل نوع غرفة إلى جانب الإجمالي — العميل يرى على أي أساس حُسب
        // المبلغ لا رقمًا مجمَّعًا فقط. الأعمدة 26..29 (0-based 25..28) = سعر البيع لكل نوع.
        var rates = [];
        [[10, 25, 'ثنائية'], [11, 26, 'ثلاثية'], [12, 27, 'رباعية'], [13, 28, 'خماسية']].forEach(function (t) {
          var qty = parseInt(raw[t[0]]) || 0;
          var rate = parseFloat(raw[t[1]]) || 0;
          if (qty > 0 && rate > 0) rates.push({ label: t[2], qty: qty, rate: Math.round(rate * 100) / 100 });
        });
        row.rates = rates;
      }
      rows.push(row);
    });
    rows.sort(function (a, b) { return b.sortTs - a.sortTs; });
    rows.forEach(function (r) { delete r.sortTs; });
    return safeReturn_({ ok: true, clientName: rec.name, showPrices: rec.showPrices, rows: rows });
  } catch (e) { return { ok: false, error: e.message }; }
}


// ==========================================================
// بوابة العملاء (المرحلة 2) — نظام الطلبات: يطلب العميل تعديل بيانات حجز قائم (بيانات أساسية
// فقط، بلا أسعار) أو حجزًا جديدًا؛ لا يعدّل شيئًا مباشرة. يظهر الطلب للموظف (شاشة الطلبات +
// جرس) فيقبل/يرفض/يضعه "جاري بحث الإمكانية"، ويستطيع تعديل بيانات الطلب في النموذج قبل قبوله.
// قبول طلب تعديل: يكتب التغييرات على الحجز في المصدر. قبول حجز جديد: يُنشئ صفًا جديدًا برقم
// حجز داخلي تلقائي (أعلى رقم + 1) ومسؤول بيع افتراضي للعميل. لكل طلب محادثة نصية بين الطرفين.
// ==========================================================
var PORTAL_REQ_SHEET_NAME = 'طلبات العملاء';
var PORTAL_REQ_PENDING_ = 'جديد', PORTAL_REQ_APPROVED_ = 'مؤكد', PORTAL_REQ_REJECTED_ = 'مرفوض', PORTAL_REQ_HOLD_ = 'جاري بحث الإمكانية';
var PORTAL_REQ_CANCELLED_ = 'تم إلغاء الحجز'; // نتيجة قبول طلب إلغاء (تمييزًا عن "مؤكد")
var PORTAL_REQ_WITHDRAWN_ = 'ألغاه العميل'; // العميل سحب طلبه بنفسه قبل أي ردّ من الموظف
// رد وسيط لطلب حجز جديد: الحجز سُجِّل فعليًا في المصدر (حالته "مطلوب")، لكنه لم يُؤكَّد بعد لدى
// الفندق/المورد — يختلف عن "مؤكد" (تأكيد نهائي) وعن "جاري بحث الإمكانية" (لم يُسجَّل حجز بعد
// أصلاً). يبقى الطلب "جاريًا" (غير مؤرشَف) حتى يُتَّخذ قرار نهائي لاحقًا (تأكيد أو رفض)
var PORTAL_REQ_REGISTERED_ = 'تم تسجيل الطلب وجاري تأكيده';
// "تم التنفيذ": الطلب مُنفَّذ أصلًا — الموظف عدّل الحجز يدويًا قبل وصول الطلب أو بمعزل عنه،
// فلا يصح تطبيق بيانات الطلب فوق تعديله اليدوي. يُغلق الطلب بلا أي كتابة في بيانات الحجز
var PORTAL_REQ_DONE_ = 'تم التنفيذ';
var BOOKING_CONFIRMED_STATUS_ = 'مؤكد';       // حالة الحجز في المصدر بعد قبول طلب العميل
var PORTAL_CANCEL_MIN_DAYS_ = 7;              // أقل مهلة مسموح بها لطلب الإلغاء قبل الدخول
var PORTAL_REQ_TYPE_EDIT_ = 'تعديل', PORTAL_REQ_TYPE_NEW_ = 'حجز جديد', PORTAL_REQ_TYPE_CANCEL_ = 'إلغاء';
// حالة الحجز المسجَّل من قبول طلب عميل: "مطلوب" — الحجز سُجِّل فعلًا لكنه لم يُؤكَّد بعد
// لدى الفندق/المورد، فلا يصح وسمه "مؤكد" لمجرد أن الموظف قبل الطلب
var BOOKING_REQUESTED_STATUS_ = 'مطلوب';
var BOOKING_EDIT_PENDING_STATUS_ = 'طلب تعديل قيد الموافقة';
var BOOKING_CANCEL_PENDING_STATUS_ = 'طلب إلغاء قيد الموافقة';
var BOOKING_CANCELLED_STATUS_ = 'لاغي';
// حالات الإلغاء (صريحة أو قيد موافقة) — الاستثناء الوحيد لقاعدة "رقم حجز فندق ⇒ مؤكد":
// حجز أُلغي عمدًا لا يُقلب إلى "مؤكد" لمجرد أنه يحمل رقم فندق
function statusIsCancelState_(s) {
  s = String(s || '').trim();
  return s === BOOKING_CANCELLED_STATUS_ || s === BOOKING_CANCEL_PENDING_STATUS_;
}
// قاعدة موحّدة "رقم حجز فندق ⇒ مؤكد" لأي خريطة تعديل (fieldsMap بمفاتيح أرقام أعمدة 1-based):
// إن كتبت العملية رقم حجز فندق (العمود 18) غير فارغ، تُضبط الحالة (العمود 16) إلى "مؤكد" —
// إلا إذا ضبطت العملية نفسها حالة إلغاء صريحة، أو كان الحجز ملغى أصلًا ولم تُغيَّر حالته في
// نفس العملية (فلا نُبطل إلغاءً متعمَّدًا). currentStatus = الحالة الحالية على الشيت (اختياري).
function applyHotelRefConfirmRule_(fieldsMap, currentStatus) {
  var ref = fieldsMap[18];
  if (ref === undefined || String(ref || '').trim() === '') return;
  if (statusIsCancelState_(fieldsMap[16])) return;
  if (fieldsMap[16] === undefined && statusIsCancelState_(currentStatus)) return;
  fieldsMap[16] = BOOKING_CONFIRMED_STATUS_;
}
// حالة الحجز الجديد تلقائيًا: رقم حجز فندق ⇒ مؤكد (القاعدة الأصلية)، أو مورد + سعر تكلفة
// لأي نوع غرفة معًا ⇒ مؤكد أيضًا (حجز له تكلفة معروفة من مورد محدَّد يُعتبر واقعًا مؤكدًا).
// لا تُطبَّق القاعدتان لو كانت الحالة المطلوبة نفسها حالة إلغاء صريحة.
function computeNewBookingStatus_(data, requestedStatus) {
  var status = requestedStatus || BOOKING_REQUESTED_STATUS_;
  if (statusIsCancelState_(status)) return status;
  var hasCost = ['costDouble', 'costTriple', 'costQuad', 'costQuint'].some(function (k) {
    var v = data[k];
    return v !== undefined && v !== null && v !== '' && parseFloat(v) > 0;
  });
  var hasHotelRef = data.hotelRef && String(data.hotelRef).trim();
  var hasSupplierCost = data.supplier && String(data.supplier).trim() && hasCost;
  return (hasHotelRef || hasSupplierCost) ? BOOKING_CONFIRMED_STATUS_ : status;
}

function ensurePortalReqSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(PORTAL_REQ_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PORTAL_REQ_SHEET_NAME);
    sh.getRange(1, 1, 1, 16).setValues([['المعرّف', 'اسم العميل', 'كود العميل', 'نوع الطلب', 'مفتاح الحجز', 'المدينة', 'البيانات المطلوبة', 'الحالة', 'الحالة الأصلية', 'رقم الحجز الناتج', 'ردّ بواسطة', 'وقت الطلب', 'آخر تحديث', 'المحادثة', 'غير مقروء (عميل)', 'غير مقروء (موظف)']]);
    sh.setFrozenRows(1);
  }
  return sh;
}
var PORTAL_REQ_MEMO_ = null;
function invalidatePortalReqCache_() {
  PORTAL_REQ_MEMO_ = null;
  try { CacheService.getScriptCache().remove('portal_pending'); } catch (e) {}
}
function portalReqRows_() {
  if (PORTAL_REQ_MEMO_) return PORTAL_REQ_MEMO_;
  var sh = ensurePortalReqSheet_();
  if (sh.getLastRow() < 2) { PORTAL_REQ_MEMO_ = []; return PORTAL_REQ_MEMO_; }
  PORTAL_REQ_MEMO_ = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues().map(function (r, i) {
    var thread = [];
    try { thread = r[13] ? JSON.parse(r[13]) : []; } catch (e) { thread = []; }
    var data = {};
    try { data = r[6] ? JSON.parse(r[6]) : {}; } catch (e) { data = {}; }
    return {
      rowIdx: i + 2, id: (r[0] || '').toString(), clientName: (r[1] || '').toString(), code: (r[2] || '').toString(),
      type: (r[3] || '').toString(), bookingKey: (r[4] || '').toString(), city: (r[5] || '').toString(),
      data: data, status: (r[7] || '').toString(), origStatus: (r[8] || '').toString(), resultRef: (r[9] || '').toString(),
      respondedBy: (r[10] || '').toString(), createdTs: r[11], updatedTs: r[12], thread: thread,
      clientUnread: r[14] === 'نعم' || r[14] === true, staffUnread: r[15] === 'نعم' || r[15] === true
    };
  });
  return PORTAL_REQ_MEMO_;
}
function getPortalReqById_(id) {
  var all = portalReqRows_();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}
function writePortalReqRow_(rowIdx, req) {
  ensurePortalReqSheet_().getRange(rowIdx, 1, 1, 16).setValues([[
    req.id, req.clientName, req.code, req.type, req.bookingKey, req.city,
    JSON.stringify(req.data || {}), req.status, req.origStatus || '', req.resultRef || '',
    req.respondedBy || '', req.createdTs, req.updatedTs, JSON.stringify(req.thread || []),
    req.clientUnread ? 'نعم' : 'لا', req.staffUnread ? 'نعم' : 'لا'
  ]]);
  invalidatePortalReqCache_();
}
// لقطة من بيانات الحجز الحالية بنفس الحقول الأساسية التي يطلب العميل تعديلها — تُستخدَم
// لعرض "القيمة القديمة" أمام "القيمة المطلوبة" في شاشة رد الموظف على طلب تعديل/إلغاء
function bookingSnapshotByKey_(bookingKey) {
  if (!bookingKey) return null;
  var found = null;
  getSourceRowsCached_().some(function (r) {
    var raw = r.slice(0, SOURCE_LAST_COL);
    var city = r[SOURCE_LAST_COL];
    if (bookingKey_(raw, city) !== bookingKey) return false;
    found = {
      hotel: (raw[4] || '').toString(),
      checkIn: raw[7] instanceof Date ? Utilities.formatDate(raw[7], 'GMT+3', 'yyyy-MM-dd') : '',
      checkOut: raw[8] instanceof Date ? Utilities.formatDate(raw[8], 'GMT+3', 'yyyy-MM-dd') : '',
      doubles: parseInt(raw[10]) || 0, triples: parseInt(raw[11]) || 0, quads: parseInt(raw[12]) || 0, quints: parseInt(raw[13]) || 0,
      notes: (raw[20] || '').toString(),
      // بيانات تعريفية للموظف: المورد الذي سيتفاوض معه، ورقم حجز الفندق إن وُجد (وإلا الداخلي)
      supplier: (raw[14] || '').toString(),
      hotelRef: (raw[17] || '').toString(),
      innerRef: (raw[2] || '').toString(),
      city: city, status: (raw[15] || '').toString()
    };
    return true;
  });
  return found;
}
// الاسم الظاهر للموظف — يُستخدَم في كل ما يظهر للعميل وفي السجلات، بدل اسم تسجيل الدخول
function staffDisplayName_(user) {
  if (!user) return 'موظف';
  return (user.displayName && user.displayName.toString().trim()) || user.username || 'موظف';
}
function reqPublicView_(r, viewer) {
  var statusLabel = r.status;
  var out = {
    id: r.id, type: r.type, bookingKey: r.bookingKey, city: r.city, data: r.data,
    status: statusLabel, resultRef: r.resultRef, respondedBy: r.respondedBy,
    createdDisp: r.createdTs instanceof Date ? Utilities.formatDate(r.createdTs, 'GMT+3', 'dd/MM/yyyy HH:mm') : '',
    updatedDisp: r.updatedTs instanceof Date ? Utilities.formatDate(r.updatedTs, 'GMT+3', 'dd/MM/yyyy HH:mm') : '',
    clientName: r.clientName, thread: r.thread,
    unread: viewer === 'client' ? r.clientUnread : r.staffUnread
  };
  // اللقطة الأصلية لعرض "قديم ← جديد" للطرفين. الفرق: العميل لا يرى اسم المورد إطلاقًا
  // ولا رقم حجز الفندق (بيانات داخلية) — يرى المدينة ورقم الحجز الداخلي فقط
  if (r.bookingKey && (r.type === PORTAL_REQ_TYPE_EDIT_ || r.type === PORTAL_REQ_TYPE_CANCEL_)) {
    try {
      var snap = bookingSnapshotByKey_(r.bookingKey);
      if (snap && viewer === 'client') {
        delete snap.supplier;
        delete snap.hotelRef;
      }
      out.original = snap;
    } catch (e) { out.original = null; }
  }
  return out;
}

// حقول أساسية مسموح للعميل طلبها (بلا أي أسعار) → أعمدة المصدر (1-based)
function reqDataToSourceMap_(data) {
  var map = {};
  // (7.15.0) فراغ الفندق/الملاحظات في الطلب لا يمسح قيمة الحجز القائمة (قبول طلب تعديل كان يمسح ملاحظات الحجز)
  if (data.hotel !== undefined && String(data.hotel || '').trim() !== '') map[5] = cellSafe_((data.hotel || '').toString());
  if (data.checkIn) { var a = String(data.checkIn).split('-'); if (a.length === 3) map[8] = new Date(+a[0], +a[1] - 1, +a[2]); }
  if (data.checkOut) { var b = String(data.checkOut).split('-'); if (b.length === 3) map[9] = new Date(+b[0], +b[1] - 1, +b[2]); }
  // خلية غرف بلا عدد تُترك فارغة لا صفرًا: الشيت المصدر يعرض 9 رباعي فقط ويترك الدابل
  // والثلاثي والخماسي فارغة — وكتابة أصفار فيها تُشوّه المظهر وتُربك معادلات الإجماليات
  var roomCol = { doubles: 11, triples: 12, quads: 13, quints: 14 };
  Object.keys(roomCol).forEach(function (k) {
    if (data[k] === undefined) return;
    var n = parseInt(data[k], 10) || 0;
    map[roomCol[k]] = n > 0 ? n : '';
  });
  // أسعار البيع لكل نوع غرفة (اختيارية — يسجّلها الموظف عند الرد على الطلب)
  var saleCol = { saleDouble: 26, saleTriple: 27, saleQuad: 28, saleQuint: 29 };
  Object.keys(saleCol).forEach(function (k) {
    if (data[k] === undefined || data[k] === null || data[k] === '') return;
    var v = parseFloat(data[k]);
    if (!isNaN(v) && v > 0) map[saleCol[k]] = v;
  });
  // أسعار التكلفة لكل نوع غرفة (اختيارية — تُسجَّل من الموظف فقط عبر allowPrices=true في
  // sanitizeReqData_، لا تصل أبدًا من بوابة العميل التي تستدعيها دائمًا بلا هذا العَلم)
  var costCol = { costDouble: 22, costTriple: 23, costQuad: 24, costQuint: 25 };
  Object.keys(costCol).forEach(function (k) {
    if (data[k] === undefined || data[k] === null || data[k] === '') return;
    var v = parseFloat(data[k]);
    if (!isNaN(v) && v > 0) map[costCol[k]] = v;
  });
  if (data.notes !== undefined && String(data.notes || '').trim() !== '') map[21] = cellSafe_((data.notes || '').toString());
  return map;
}

// أعمدة تحمل معادلات في الشيت المصدر — الكتابة فيها تمسح المعادلة نهائيًا. تُستثنى من أي
// كتابة برمجية مهما كان مصدرها. (1-based: إجمالي الأفراد، إجمالي الغرف، الليالي،
// إجمالي التكلفة، إجمالي البيع، الفرق، إجمالي عدد الليالي)
var SOURCE_FORMULA_COLS_ = { 6: true, 7: true, 10: true, 31: true, 32: true, 33: true, 34: true };

// أول صف "فارغ" داخل نطاق الشيت = أول صف بلا تاريخ دخول (العمود H). الكتابة فيه بدل
// إضافة صف جديد أسفل الورقة هي ما يحافظ على معادلات الصف الجاهزة أصلًا في مكانها.
function firstEmptySourceRow_(sh, startRow) {
  var last = sh.getLastRow();
  if (last < startRow) return startRow;
  var n = last - startRow + 1;
  var checkIns = sh.getRange(startRow, 8, n, 1).getValues();
  for (var i = 0; i < n; i++) {
    var v = checkIns[i][0];
    if (v === '' || v === null || v === undefined) return startRow + i;
  }
  return last + 1; // كل الصفوف مشغولة — نضيف أسفلها (وحينها لا توجد معادلات لنحافظ عليها)
}

// مسؤول البيع الافتراضي للعميل: من بيانات الحساب أولاً، وإلا من أحدث حجز سابق له — ويُحفظ
// في بيانات الحساب ليصبح الافتراضي الثابت لاحقًا بلا إعادة بحث في كل مرة
function resolveSalesAgent_(clientName) {
  var name = (clientName || '').toString().trim();
  if (!name) return '';
  var profiles = {};
  try { profiles = getAllAccountProfiles_(); } catch (e) {}
  var fromProfile = (profiles[name] && profiles[name].salesAgent || '').toString().trim();
  if (fromProfile) return fromProfile;

  var target = normalizeName_(name), best = '', bestTs = -1;
  getSourceRowsCached_().forEach(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL);
    if (normalizeName_((raw[3] || '').toString()) !== target) return;
    var agent = (raw[19] || '').toString().trim();
    if (!agent) return;
    var d = raw[7] instanceof Date ? raw[7] : new Date(raw[7]);
    var ts = isNaN(d.getTime()) ? 0 : d.getTime();
    if (ts >= bestTs) { bestTs = ts; best = agent; }
  });
  if (best) { try { setAccountSalesAgent_(name, best); } catch (e) { Logger.log('setAccountSalesAgent_: ' + e.message); } }
  return best;
}
// كتابة مسؤول البيع في بيانات الحساب (ينشئ صف الحساب إن لم يوجد) بلا لمس بقية حقوله
function setAccountSalesAgent_(name, agent) {
  var sh = ensureAccountProfilesSheet_();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === name) {
      if (!(data[i][4] || '').toString().trim()) sh.getRange(i + 1, 5).setValue(agent);
      return;
    }
  }
  sh.appendRow([name, 'سكن', '', '', agent, '']);
}
// كتابة حقول على حجز قائم بلا تحقق صلاحية (المُستدعي تحقّق أصلًا) — يعالج التواريخ ككائنات Date
function setBookingFieldsRaw_(bookingKey, fieldsMap) {
  var city = (bookingKey || '').split('|')[0];
  var src = findSourceRowIndex_(city, bookingKey);
  if (!src) throw new Error('لم يُعثر على الحجز في المصدر');
  // قاعدة رقم حجز الفندق ⇒ "مؤكد" (تُقرأ الحالة الحالية فقط عند الحاجة لتفادي إبطال إلغاء متعمَّد)
  if (fieldsMap[18] !== undefined && String(fieldsMap[18] || '').trim() !== '') {
    var curStatus = '';
    if (fieldsMap[16] === undefined) {
      try { curStatus = String(src.sheet.getRange(src.rowInSheet, 16).getValue() || '').trim(); } catch (eSt) {}
    }
    applyHotelRefConfirmRule_(fieldsMap, curStatus);
  }
  // مسئول بيع فارغ حاليًا ولم تحدِّده هذه العملية صراحةً ⇒ نُكمله تلقائيًا بالمسؤول الافتراضي
  // لنفس العميل (resolveSalesAgent_: من بيانات حسابه أولًا، وإلا من أحدث حجز سابق له). هذا
  // التعبئة التلقائية كانت مطبَّقة فقط عند تسجيل حجز جديد (appendBookingRaw_) — أي تحديث لاحق
  // على حجز قائم (تعديل من البوت/الشاشة، أو دمج تأكيد فندق) لم يكن يملأ الفراغ إطلاقًا
  if (fieldsMap[20] === undefined) {
    try {
      var curAgent = String(src.sheet.getRange(src.rowInSheet, 20).getValue() || '').trim();
      if (!curAgent) {
        var curClient = String(src.sheet.getRange(src.rowInSheet, 4).getValue() || '').trim();
        var inferredAgent = curClient ? resolveSalesAgent_(curClient) : '';
        if (inferredAgent) fieldsMap[20] = inferredAgent;
      }
    } catch (eAgent) {}
  }
  Object.keys(fieldsMap).forEach(function (colStr) {
    var col = parseInt(colStr, 10);
    if (SOURCE_FORMULA_COLS_[col]) return; // عمود معادلة — الكتابة فيه تمسحها نهائيًا
    src.sheet.getRange(src.rowInSheet, col).setValue(cellSafe_(fieldsMap[colStr]));
  });
  invalidateSourceCache_();
}
// ---- توليد رقم الحجز الداخلي بنفس آلية سكربت الشيت المصدر تمامًا ----
// آلية المصدر: بادئة لكل مدينة تُقرأ من ورقة "Settings" في ملف المصدر (مفتاح/قيمة في العمودين
// A/B): MAKKAH_PREFIX و MEDINA_PREFIX. الرقم التالي = أعلى رقم موجود يحمل نفس البادئة في
// العمود C لنفس الورقة + 1، مُنسَّقًا بثلاث خانات (001). لكل مدينة تسلسلها المستقل — وليس
// رقمًا عامًا واحدًا لكل الحجوزات كما كان هنا سابقًا (كان يُنتج أرقامًا لا تطابق نمط المصدر).
function getSourceConst_(ss, key) {
  try {
    var sh = ss.getSheetByName('Settings');
    if (!sh) return '';
    var data = sh.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === key) return (data[i][1] || '').toString().trim();
    }
  } catch (e) {}
  return '';
}
// بادئة ترقيم الحجز للمدينة المطلوبة، بثلاثة مصادر بالترتيب:
// 1) ورقة Settings في ملف المصدر (MAKKAH_PREFIX/MEDINA_PREFIX) — كما في المصدر القديم
// 2) إعدادات البرنامج (خصائص السكربت SRC_MAKKAH_PREFIX/SRC_MEDINA_PREFIX) — للوضع الجديد
//    بعد نقل الشيتات لملف البرنامج بلا نقل ورقة Settings
// فبهذا يعمل الترقيم في الوضعين بلا تعطّل
function bookingPrefixFor_(ss, city) {
  var isMed = city === 'المدينة';
  var fromSettings = getSourceConst_(ss, isMed ? 'MEDINA_PREFIX' : 'MAKKAH_PREFIX');
  if (fromSettings) return fromSettings;
  var prop = PropertiesService.getScriptProperties().getProperty(isMed ? 'SRC_MEDINA_PREFIX' : 'SRC_MAKKAH_PREFIX');
  return (prop || '').toString().trim();
}
// يُرجع { prefix, next: 'PRE001' } للورقة/المدينة المطلوبة
function nextInternalBookingNumber_(ss, sh, city) {
  var prefix = bookingPrefixFor_(ss, city);
  if (!prefix) throw new Error('لم تُضبط بادئة أرقام الحجز لـ' + city + '. اضبطها من: الإعدادات ← مصدر الحجوزات ← بادئة أرقام مكة/المدينة (أو أضِف MAKKAH_PREFIX/MEDINA_PREFIX في ورقة Settings).');
  var lastRow = sh.getLastRow();
  var max = 0;
  if (lastRow >= 4) {
    var ids = sh.getRange(4, 3, lastRow - 3, 1).getValues(); // العمود C من الصف 4 كما في المصدر
    ids.forEach(function (v) {
      var id = (v[0] || '').toString().trim();
      if (!id || id.indexOf(prefix) !== 0) return;
      var n = parseInt(id.substring(prefix.length).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    });
  }
  return prefix + String(max + 1).padStart(3, '0');
}
// إنشاء حجز جديد بالمصدر (صف جديد في ورقة المدينة المناسبة) برقم داخلي بنمط المصدر.
// قفل السكربت أثناء توليد الرقم والكتابة — بنفس منطق LockService المستخدَم في سكربت المصدر،
// حتى لا يحصل طلبان مقبولان في نفس اللحظة على نفس الرقم
function appendBookingRaw_(city, data, clientName, salesAgent, status) {
  var s = getSourceSettings_();
  var ss = openSourceSpreadsheet_(s);
  var sheetName = city === 'المدينة' ? s.medinaSheet : s.meccaSheet;
  var startRow = city === 'المدينة' ? s.medinaStartRow : s.meccaStartRow;
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('ورقة "' + sheetName + '" غير موجودة في المصدر');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('الخادم مشغول بإنشاء حجز آخر — أعد المحاولة بعد لحظات');
  try {
    SpreadsheetApp.flush();
    var innerNo = nextInternalBookingNumber_(ss, sh, city);
    // أول صف بلا تاريخ دخول — لا الصف التالي لآخر صف: الصفوف الجاهزة تحمل معادلات
    // الإجماليات في أعمدتها، والكتابة أسفلها كانت تُنتج حجزًا بلا أي معادلة
    var targetRow = firstEmptySourceRow_(sh, startRow);
    var map = reqDataToSourceMap_(data);
    map[3] = innerNo;                     // رقم الحجز الداخلي (العمود C) بنمط المصدر
    map[4] = clientName;                  // اسم العميل
    // المورد ورقم حجز الفندق لا يمرّان عبر reqDataToSourceMap_ — نكتبهما هنا مباشرة إن وردا
    // (تسجيل من البوت/شاشة الحجوزات)، فيُسجَّل المورد بدل ضياعه، ويُطبَّق قاعدة الحالة أدناه
    if (data.supplier) map[15] = String(data.supplier).trim();       // العمود O = المورد
    if (data.hotelRef) map[18] = String(data.hotelRef).trim();       // العمود R = رقم حجز الفندق
    // الحالة: الممرَّرة، أو "مؤكد" تلقائيًا لو وُجد رقم حجز فندق أو (مورد + سعر تكلفة) معًا
    map[16] = computeNewBookingStatus_(data, status);
    var agent = (salesAgent || '').toString().trim() || resolveSalesAgent_(clientName);
    if (agent) map[20] = agent;
    Object.keys(map).forEach(function (colStr) {
      var col = parseInt(colStr, 10);
      if (SOURCE_FORMULA_COLS_[col]) return; // لا نمسح معادلة أبدًا
      sh.getRange(targetRow, col).setValue(cellSafe_(map[colStr]));
    });
    SpreadsheetApp.flush();
    invalidateSourceCache_();
    return innerNo;
  } finally {
    lock.releaseLock();
  }
}

// ==========================================================
// تسجيل حجز جديد من شاشة الحجوزات مباشرةً في شيت المصدر
// ==========================================================
// يمر بنفس appendBookingRaw_ المستخدَم لقبول طلبات العملاء — فيرث كل قواعده: الكتابة في أول
// صف فارغ (حفاظًا على المعادلات)، وعدم لمس أعمدة المعادلات، وترك خلايا الغرف الفارغة فراغًا،
// وحسم مسؤول البيع من بيانات الحساب أو من أحدث حجز سابق. لا منطق ثانٍ يتفرّع عنه.
// حجز آخر قائم (رقم داخلي مختلف) بنفس العميل والفندق وعدد الغرف وتواريخ الدخول/الخروج —
// يُستخدَم لتنبيه المستخدم قبل تسجيل حجز جديد أو حفظ تعديل قد يكون في الواقع تكرارًا لحجز
// مسجَّل من قبل بالفعل. d = {hotel, checkIn(yyyy-mm-dd), checkOut, doubles, triples, quads,
// quints}. excludeKey (اختياري، لحالة التعديل): لا يُطابَق الحجز نفسه مع نفسه.
function findSimilarBooking_(d, clientName, excludeKey) {
  if (!d.checkIn || !d.checkOut) return null;
  var dc = normalizeName_(clientName || '');
  if (!dc) return null;
  var dh = normalizeName_(d.hotel || '').toLowerCase();
  var rD = parseInt(d.doubles, 10) || 0, rT = parseInt(d.triples, 10) || 0,
    rQ = parseInt(d.quads, 10) || 0, rN = parseInt(d.quints, 10) || 0;
  var out = null;
  getSourceRowsCached_().some(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL];
    var key = bookingKey_(raw, city);
    if (excludeKey && key === excludeKey) return false;
    if (String(raw[15] || '').trim() === BOOKING_CANCELLED_STATUS_) return false;
    if (normalizeName_(raw[3] || '') !== dc) return false;
    var ci = raw[7] instanceof Date ? Utilities.formatDate(raw[7], 'GMT+3', 'yyyy-MM-dd') : '';
    var co = raw[8] instanceof Date ? Utilities.formatDate(raw[8], 'GMT+3', 'yyyy-MM-dd') : '';
    if (ci !== d.checkIn || co !== d.checkOut) return false;
    if (dh) {
      var h = normalizeName_(raw[4] || '').toLowerCase();
      if (!h || (h.indexOf(dh) < 0 && dh.indexOf(h) < 0)) return false;
    }
    if ((parseInt(raw[10], 10) || 0) !== rD || (parseInt(raw[11], 10) || 0) !== rT ||
      (parseInt(raw[12], 10) || 0) !== rQ || (parseInt(raw[13], 10) || 0) !== rN) return false;
    out = { bookingKey: key, city: city };
    return true;
  });
  return out;
}
function appendBookingFromForm(token, payload) {
  try {
    var user = requirePermission_(token, 'bookings', 'add');
    payload = payload || {};
    var city = payload.city === 'المدينة' ? 'المدينة' : 'مكة';
    if (!bookingCityAllowed_(user, city)) throw new Error('لا تملك صلاحية التسجيل في مدينة ' + city);
    var clientName = (payload.client || '').toString().trim();
    if (!clientName) throw new Error('اسم العميل مطلوب');
    if (!payload.checkIn || !payload.checkOut) throw new Error('تاريخا الدخول والخروج مطلوبان');
    var ci = new Date(payload.checkIn), co = new Date(payload.checkOut);
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) throw new Error('تاريخ غير صالح');
    if (co.getTime() <= ci.getTime()) throw new Error('تاريخ الخروج يجب أن يكون بعد تاريخ الدخول');
    var rooms = ['doubles', 'triples', 'quads', 'quints'].reduce(function (n, k) {
      return n + (parseInt(payload[k], 10) || 0);
    }, 0);
    if (rooms <= 0) throw new Error('أدخل عدد الغرف لنوع واحد على الأقل');

    if (!payload.forceRegister) {
      var ciIso = Utilities.formatDate(ci, 'GMT+3', 'yyyy-MM-dd'), coIso = Utilities.formatDate(co, 'GMT+3', 'yyyy-MM-dd');
      var dup = findSimilarBooking_({
        hotel: payload.hotel || '', checkIn: ciIso, checkOut: coIso,
        doubles: payload.doubles, triples: payload.triples, quads: payload.quads, quints: payload.quints
      }, clientName, null);
      if (dup) {
        var snap = null;
        try { snap = bookingSnapshotByKey_(dup.bookingKey); } catch (eSn) {}
        return safeReturn_({
          ok: false, duplicate: true,
          match: snap ? { innerRef: snap.innerRef, hotelRef: snap.hotelRef || '', status: snap.status || '' } : { innerRef: '', hotelRef: '', status: '' }
        });
      }
    }

    var data = sanitizeReqData_(payload, true); // الموظف يملك حق تسجيل أسعار البيع
    var status = (payload.status || '').toString().trim() || BOOKING_REQUESTED_STATUS_;
    var innerNo = appendBookingRaw_(city, data, clientName, (payload.salesAgent || '').toString().trim(), status);

    // حقول لا يمرّرها reqDataToSourceMap_ (المورد ورقم حجز الفندق وOPTION DATE) تُكتب بعد
    // الإنشاء بنفس حارس أعمدة المعادلات
    var extra = {};
    if (payload.supplier) extra[15] = payload.supplier.toString().trim();
    if (payload.hotelRef) extra[18] = payload.hotelRef.toString().trim();
    if (payload.optionDate) {
      var od = String(payload.optionDate).split('-');
      if (od.length === 3) extra[17] = new Date(+od[0], +od[1] - 1, +od[2]);
    }
    if (Object.keys(extra).length) {
      try {
        var key = city + '|R:' + innerNo + '|D:' + Utilities.formatDate(ci, 'GMT+3', 'yyyy-MM-dd');
        if (payload.hotelRef) key = city + '|H:' + payload.hotelRef.toString().trim();
        setBookingFieldsRaw_(key, extra);
      } catch (e) { Logger.log('appendBookingFromForm extra: ' + e.message); }
    }
    logChange_(user, 'حجز جديد', innerNo,
      'تسجيل حجز جديد من شاشة الحجوزات — ' + clientName + ' / ' + (payload.hotel || 'بلا فندق') + ' / ' + city,
      '', innerNo, { clientName: clientName, hotelRef: payload.hotelRef || '', recordKey: bookingRecordKey_(innerNo) });
    try {
      tgEnqueue_('booking_new', {
        client: clientName, hotel: payload.hotel || '', city: city,
        checkIn: Utilities.formatDate(ci, 'GMT+3', 'dd/MM/yyyy'), checkOut: Utilities.formatDate(co, 'GMT+3', 'dd/MM/yyyy'),
        rooms: tgRoomsCountStr_(payload) || (rooms + ' غرفة'), ref: innerNo,
        hotelRef: (payload.hotelRef || '').toString().trim(), by: staffDisplayName_(user),
        // حجز جديد = قيمة جديدة تدخل الترصيد فورًا، فرصيد الطرفين تغيّر بمجرد تسجيله
        balParties: [{ name: clientName, roleHint: 'client' }].concat(
          (payload.supplier || '').toString().trim() ? [{ name: payload.supplier.toString().trim(), roleHint: 'supplier' }] : []),
        ts: new Date().getTime()
      });
    } catch (eN) { Logger.log('tgEnqueue_ booking_new: ' + eN.message); }
    return safeReturn_({ ok: true, innerRef: innerNo, city: city });
  } catch (e) { return { ok: false, error: e.message }; }
}

// ==========================================================
// تسجيل حجوزات مجمَّعة من قالب CSV — من شاشة الحجوزات مباشرة (خلاف الرفع المجمَّع من بوابة
// العملاء الذي ينشئ طلبات معلَّقة بانتظار رد الموظف): هنا كل حجز يُسجَّل نهائيًا فورًا تمامًا
// كأنه سُجِّل عبر "حجز جديد" واحدًا واحدًا — لكن بقفل واحد وقراءة/كتابة مجمَّعة بدل نداء
// منفصل لكل حجز (وإلا استغرق استيراد عشرات الحجوزات دقائق — نفس الدرس من رفع البوابة)
// ==========================================================

// صفوف فارغة (بلا تاريخ دخول) داخل النطاق الحالي أولاً — تحافظ على معادلات تلك الصفوف
// كما تفعل appendBookingRaw_ تمامًا — ثم يُكمل الباقي بصفوف جديدة أسفل آخر صف
function findEmptySourceRowsBatch_(sh, startRow, count) {
  var last = sh.getLastRow();
  var rows = [];
  if (last >= startRow) {
    var n = last - startRow + 1;
    var checkIns = sh.getRange(startRow, 8, n, 1).getValues();
    for (var i = 0; i < n && rows.length < count; i++) {
      var v = checkIns[i][0];
      if (v === '' || v === null || v === undefined) rows.push(startRow + i);
    }
  }
  var nextRow = Math.max(last + 1, startRow);
  while (rows.length < count) { rows.push(nextRow); nextRow++; }
  return rows;
}
// نفس منطق nextInternalBookingNumber_ لكن بمسح واحد يُرجع عدة أرقام متتالية دفعة واحدة
function nextInternalBookingNumbersBatch_(ss, sh, city, count) {
  var prefix = bookingPrefixFor_(ss, city);
  if (!prefix) throw new Error('لم تُضبط بادئة أرقام الحجز لـ' + city + '. اضبطها من: الإعدادات ← مصدر الحجوزات ← بادئة أرقام مكة/المدينة.');
  var lastRow = sh.getLastRow();
  var max = 0;
  if (lastRow >= 4) {
    var ids = sh.getRange(4, 3, lastRow - 3, 1).getValues();
    ids.forEach(function (v) {
      var id = (v[0] || '').toString().trim();
      if (!id || id.indexOf(prefix) !== 0) return;
      var n = parseInt(id.substring(prefix.length).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    });
  }
  var out = [];
  for (var i = 1; i <= count; i++) out.push(prefix + String(max + i).padStart(3, '0'));
  return out;
}
// رسالة تليجرام واحدة مجمَّعة للدفعة كلها — تنبيه منفصل لكل حجز كان سيُغرق الجروب
function tgBulkBookingsMsg_(results, actor) {
  var lines = [
    '📦 <b>رفع مجمَّع لحجوزات — ' + results.length + ' حجز</b>',
    '━━━━━━━━━━━━━━'
  ];
  results.slice(0, 20).forEach(function (r) {
    lines.push(tgCityIcon_(r.city) + ' <b>' + tgEsc_(r.ref) + '</b> — ' + tgEsc_(r.client) +
      (r.hotel ? (' · ' + tgEsc_(r.hotel)) : '') + ' · ' + tgEsc_(r.checkIn) + ' ← ' + tgEsc_(r.checkOut) +
      ' · ' + r.rooms + ' غرفة');
  });
  if (results.length > 20) lines.push('… و' + (results.length - 20) + ' حجزًا آخر');
  lines.push('━━━━━━━━━━━━━━');
  lines.push('👤 <b>بواسطة:</b> ' + tgEsc_(actor));
  lines.push('⏰ ' + tgStamp_());
  return lines.join('\n');
}
// rows = [{city, client, hotel, supplier, hotelRef, checkIn(yyyy-mm-dd), checkOut, doubles,
//   triples, quads, quints, notes}] — بلا أسعار عمدًا (تُستكمَل لاحقًا كأي حجز بلا سعر، بنفس
// آلية "استكمال الأسعار الناقصة" المعتادة في كل الشاشات والبوت)
function registerBookingsBulk(token, rows) {
  try {
    var actingUser = requirePermission_(token, 'bookings', 'add');
    if (!rows || !rows.length) throw new Error('لا توجد حجوزات للاستيراد');
    if (rows.length > 150) throw new Error('الحد الأقصى 150 حجزًا في المرة الواحدة');

    var byCity = { 'مكة': [], 'المدينة': [] };
    var rejected = [];
    rows.forEach(function (r, idx) {
      var city = (r.city === 'المدينة') ? 'المدينة' : 'مكة';
      var client = (r.client || '').toString().trim();
      if (!client) { rejected.push({ idx: idx, reason: 'اسم العميل مطلوب' }); return; }
      if (!r.checkIn || !r.checkOut) { rejected.push({ idx: idx, reason: 'تاريخا الدخول والخروج مطلوبان' }); return; }
      var ci = new Date(r.checkIn), co = new Date(r.checkOut);
      if (isNaN(ci.getTime()) || isNaN(co.getTime()) || co.getTime() <= ci.getTime()) {
        rejected.push({ idx: idx, reason: 'تواريخ غير صالحة' }); return;
      }
      var rooms = ['doubles', 'triples', 'quads', 'quints'].reduce(function (n, k) { return n + (parseInt(r[k], 10) || 0); }, 0);
      if (rooms <= 0) { rejected.push({ idx: idx, reason: 'أدخل عدد الغرف لنوع واحد على الأقل' }); return; }
      if (!bookingCityAllowed_(actingUser, city)) { rejected.push({ idx: idx, reason: 'لا تملك صلاحية التسجيل في مدينة ' + city }); return; }
      byCity[city].push({ idx: idx, r: r, client: client, rooms: rooms });
    });

    var results = [];
    var s = getSourceSettings_();
    var ss = openSourceSpreadsheet_(s);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('الخادم مشغول بإنشاء حجز آخر — أعد المحاولة بعد لحظات');
    try {
      SpreadsheetApp.flush();
      ['مكة', 'المدينة'].forEach(function (city) {
        var list = byCity[city];
        if (!list.length) return;
        var sheetName = city === 'المدينة' ? s.medinaSheet : s.meccaSheet;
        var startRow = city === 'المدينة' ? s.medinaStartRow : s.meccaStartRow;
        var sh = ss.getSheetByName(sheetName);
        if (!sh) throw new Error('ورقة "' + sheetName + '" غير موجودة في المصدر');
        var targetRows = findEmptySourceRowsBatch_(sh, startRow, list.length);
        var numbers = nextInternalBookingNumbersBatch_(ss, sh, city, list.length);
        list.forEach(function (item, i) {
          var r = item.r, targetRow = targetRows[i], innerNo = numbers[i];
          var rowVals = sh.getRange(targetRow, 1, 1, SOURCE_LAST_COL).getValues()[0];
          var data = sanitizeReqData_({
            hotel: r.hotel, notes: r.notes, checkIn: r.checkIn, checkOut: r.checkOut,
            doubles: r.doubles, triples: r.triples, quads: r.quads, quints: r.quints
          }, false);
          var map = reqDataToSourceMap_(data);
          map[3] = innerNo;
          map[4] = item.client;
          map[16] = BOOKING_REQUESTED_STATUS_;
          var agent = resolveSalesAgent_(item.client);
          if (agent) map[20] = agent;
          if (r.supplier) map[15] = r.supplier.toString().trim();
          if (r.hotelRef) {
            map[18] = r.hotelRef.toString().trim();
            map[16] = BOOKING_CONFIRMED_STATUS_; // قاعدة: رقم حجز فندق ⇒ مؤكد (حجز جديد لا يكون ملغى)
          }
          Object.keys(map).forEach(function (colStr) {
            var col = parseInt(colStr, 10);
            if (SOURCE_FORMULA_COLS_[col]) return; // لا نمسح معادلة أبدًا
            rowVals[col - 1] = map[colStr];
          });
          sh.getRange(targetRow, 1, 1, SOURCE_LAST_COL).setValues([rowVals]);
          results.push({
            idx: item.idx, ref: innerNo, client: item.client, hotel: (r.hotel || '').toString(),
            city: city, checkIn: r.checkIn, checkOut: r.checkOut, rooms: item.rooms
          });
        });
      });
      SpreadsheetApp.flush();
    } finally { lock.releaseLock(); }
    invalidateSourceCache_();

    // سجل تعديلات مستقل لكل حجز (يطابق appendBookingFromForm) — يظهر عند فتح "📜 السجل
    // الكامل" لهذا الحجز بالذات لاحقًا، بدل سطر واحد مجمَّع يُخفي أصل كل حجز على حدة
    results.forEach(function (res) {
      logChange_(actingUser, 'حجز جديد', res.ref,
        'تسجيل حجز جديد (رفع مجمَّع) — ' + res.client + ' / ' + (res.hotel || 'بلا فندق') + ' / ' + res.city,
        '', res.ref, { clientName: res.client, recordKey: bookingRecordKey_(res.ref) });
    });
    if (results.length) {
      try {
        tgEnqueue_('booking_new', {
          preformatted: tgBulkBookingsMsg_(results, staffDisplayName_(actingUser)),
          client: results[0].client, ts: new Date().getTime()
        });
      } catch (eN) { Logger.log('tgEnqueue_ bulk booking_new: ' + eN.message); }
    }

    return safeReturn_({ ok: true, saved: results.length, rejected: rejected });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// تقرير حجوزات العميل كـPDF حقيقي — العميل يبني HTML في بوابته ويرسله هنا. نفس محرك
// generateSharePdf لكن بتحقق رمز البوابة (لا جلسة موظف) — فلا يستطيع أحد استخدامه بلا كود
function portalGenerateReportPdf(ptoken, html, fileName) {
  try {
    verifyPortalToken_(ptoken);
    if (!html || !html.toString().trim()) throw new Error('لا يوجد محتوى للتحويل');
    var folder = ensureTempShareFolder_();
    purgeShareTempFolder();
    var safeName = (fileName || 'تقرير حجوزاتي').toString().replace(/[\\\/:*?"<>|]/g, '-').trim() || 'تقرير';
    var blob = Utilities.newBlob(html.toString(), 'text/html', safeName + '.html').getAs('application/pdf');
    blob.setName(safeName + '.pdf');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    schedulePurge_();
    return {
      ok: true, fileId: file.getId(), fileName: safeName + '.pdf',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      pdfBase64: Utilities.base64Encode(blob.getBytes())
    };
  } catch (e) { return { ok: false, error: e.message }; }
}
function portalDeleteSharedFile(ptoken, fileId) {
  if (!fileId) return { ok: false };
  try {
    verifyPortalToken_(ptoken);
    DriveApp.getFileById(fileId).setTrashed(true);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---- جهة العميل (رمز جلسة موقَّع) ----
// يتحقق أن الحجز يخص هذا العميل فعلًا قبل قبول أي طلب تعديل عليه (منع طلب على حجز غيره)
function portalOwnsBooking_(rec, bookingKey) {
  var target = normalizeName_(rec.name), found = false;
  getSourceRowsCached_().some(function (r) {
    if (bookingKey_(r.slice(0, SOURCE_LAST_COL), r[SOURCE_LAST_COL]) === bookingKey) {
      found = normalizeName_((r[3] || '').toString()) === target; return true;
    }
    return false;
  });
  return found;
}
// تسجيل حدث صادر من العميل نفسه في سجل التعديلات — كان أي طلب/رسالة من العميل لا يُسجَّل
// إطلاقًا، فيظهر رد الموظف في السجل بلا الطلب الذي ردّ عليه
function logPortalClientEvent_(rec, req, desc, oldVal, newVal) {
  try {
    logChange_('العميل: ' + (rec && rec.name ? rec.name : ''), 'طلب بوابة',
      (rec && rec.name) || '', desc, oldVal, newVal,
      { clientName: (rec && rec.name) || '', hotelRef: (req && req.bookingKey) || '',
        recordKey: 'REQ:' + ((req && req.id) || '') });
  } catch (e) { Logger.log('logPortalClientEvent_: ' + e.message); }
}
// ملخص حجز مقروء لسجل التعديلات: الفندق/المدينة/التواريخ/الغرف/رقم الحجز — بدل ترك القارئ
// بلا أي فكرة عن "أي حجز بالتحديد" وراء مفتاح داخلي مثل "المدينة|R:M183|D:2026-09-25" أو
// رقم قيد وحده. يقبل أي كائن بحقول hotel/city/checkIn/checkOut/doubles/triples/quads/quints
// (لقطة حجز أو بيانات طلب مُنقّاة على حد سواء — نفس أسماء الحقول في كليهما)
function reqBookingSummary_(obj, innerRef) {
  if (!obj) return '';
  var fmtD = function (iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : (iso || '');
  };
  var bits = [];
  if (obj.hotel) bits.push(obj.hotel);
  if (obj.city) bits.push(obj.city);
  if (obj.checkIn || obj.checkOut) bits.push((fmtD(obj.checkIn) || '؟') + ' → ' + (fmtD(obj.checkOut) || '؟'));
  var roomLbl = { doubles: 'ثنائي', triples: 'ثلاثي', quads: 'رباعي', quints: 'خماسي' };
  var rooms = ['doubles', 'triples', 'quads', 'quints'].filter(function (k) { return obj[k]; }).map(function (k) { return obj[k] + ' ' + roomLbl[k]; });
  if (rooms.length) bits.push(rooms.join('، '));
  if (innerRef) bits.push('رقم ' + innerRef);
  return bits.join(' · ');
}
// صيغة سطر واحد (بلا تعداد نقطي ولا أسطر) من tgReqEditDiffText_ — لعرضه داخل عمود "ماذا
// تغيّر" في سجل التعديلات، حيث كل سطر منفصل يحتاج فاصلة لا سطرًا جديدًا
function reqEditDiffInline_(diffText) {
  if (!diffText) return '';
  return diffText.split('\n').map(function (l) { return l.replace(/^•\s*/, ''); }).join('، ');
}

// حمولة التنبيه من طلب مكتوب فعلًا — تُبنى بعد الكتابة لا قبلها
// نص "التعديل المطلوب" (قديم ⟶ جديد) لكل حقل تغيّر فعليًا — هذا بالضبط ما كان غائبًا عن
// رسالة تليجرام لطلب تعديل الحجز: كانت تعرض بيانات الحجز الحالية بلا أي إشارة لِما طلب
// العميل تغييره أو ما كانت قيمته السابقة، حتى لو تغيّرت عدة حقول معًا في نفس الطلب
function tgReqEditDiffText_(d, snap) {
  d = d || {};
  var o = snap || null;
  var fmtDate = function (iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : (iso || '');
  };
  var lines = [];
  var pushField = function (label, ov, nv, isDate) {
    if (nv === undefined || nv === null || nv === '') return;
    var nvDisp = isDate ? fmtDate(nv) : nv;
    if (o && String(ov || '') !== String(nv || '')) {
      lines.push('• ' + label + ': ' + (ov ? (isDate ? fmtDate(ov) : ov) : '—') + ' ⟶ ' + nvDisp);
    } else {
      lines.push('• ' + label + ': ' + nvDisp);
    }
  };
  pushField('الفندق', o && o.hotel, d.hotel, false);
  pushField('تاريخ الدخول', o && o.checkIn, d.checkIn, true);
  pushField('تاريخ الخروج', o && o.checkOut, d.checkOut, true);
  var roomLbl = { doubles: 'ثنائي', triples: 'ثلاثي', quads: 'رباعي', quints: 'خماسي' };
  var roomKeys = ['doubles', 'triples', 'quads', 'quints'];
  var roomsNew = [], roomsOld = [], changed = false, anyRoomVal = false;
  roomKeys.forEach(function (k) {
    var nv = d[k] || 0, ov = o ? (o[k] || 0) : 0;
    if (d[k] !== undefined) anyRoomVal = true;
    if (nv) roomsNew.push(roomLbl[k] + '×' + nv);
    if (o && ov) roomsOld.push(roomLbl[k] + '×' + ov);
    if (o && nv !== ov) changed = true;
  });
  if (anyRoomVal) {
    if (changed) lines.push('• الغرف: ' + (roomsOld.join('، ') || '—') + ' ⟶ ' + (roomsNew.join('، ') || '—'));
    else if (roomsNew.length) lines.push('• الغرف: ' + roomsNew.join('، '));
  }
  if (d.notes) lines.push('• ملاحظات: ' + d.notes);
  return lines.join('\n');
}
function tgReqPayload_(rec, req, extra) {
  var d = (req && req.data) || {};
  var snap = null;
  try { snap = req && req.bookingKey ? bookingSnapshotByKey_(req.bookingKey) : null; } catch (e) {}
  var pick = function (k) { return d[k] || (snap && snap[k]) || ''; };
  // عدد الغرف: من بيانات الطلب إن حملت أعدادًا، وإلا من لقطة الحجز الأصلية
  var roomsSrc = (d.doubles || d.triples || d.quads || d.quints) ? d : snap;
  var out = {
    reqId: (req && req.id) || '', // لازم لأزرار الرد المباشر من تليجرام
    client: (rec && rec.name) || (req && req.clientName) || '',
    hotel: pick('hotel'), city: (req && req.city) || d.city || '',
    checkIn: pick('checkIn'), checkOut: pick('checkOut'),
    rooms: tgRoomsCountStr_(roomsSrc) || (typeof d.rooms === 'string' ? d.rooms : ''), note: d.notes || '',
    ref: (snap && snap.innerRef) || (req && req.resultRef) || '',
    hotelRef: (snap && snap.hotelRef) || d.hotelRef || '', // رقم حجز الفندق إن وُجد على الحجز الأصلي
    ts: new Date().getTime()
  };
  // طلب تعديل فقط: نُرفق نص الفرق (قديم ⟶ جديد) — لا معنى له لطلب حجز جديد (لا أصل يُقارَن
  // به) ولا لطلب إلغاء (لا حقول تتغيّر، الحجز كما هو فقط يُطلَب إلغاؤه)
  if (req && req.type === PORTAL_REQ_TYPE_EDIT_) {
    var diffText = tgReqEditDiffText_(d, snap);
    if (diffText) out.diffText = diffText;
  }
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return out;
}

function portalSubmitEditRequest(ptoken, bookingKey, changes) {
  try {
    var rec = verifyPortalToken_(ptoken);
    if (!bookingKey || !portalOwnsBooking_(rec, bookingKey)) throw new Error('حجز غير صالح');
    var city = (bookingKey || '').split('|')[0];
    // منع طلب تعديل حجز انتهى فعلًا (تاريخ خروجه أقل من اليوم) — للعرض فقط
    var todayStart2 = new Date(); todayStart2.setHours(0, 0, 0, 0);
    // تحديد الحالة الأصلية للحجز ثم وضعه "طلب تعديل قيد الموافقة" ليظهر مميَّزًا للموظف
    var origStatus = '';
    getSourceRowsCached_().some(function (r) {
      if (bookingKey_(r.slice(0, SOURCE_LAST_COL), r[SOURCE_LAST_COL]) === bookingKey) {
        origStatus = (r[15] || '').toString();
        var co = r[8];
        if (co instanceof Date) { var cd = new Date(co.getTime()); cd.setHours(0, 0, 0, 0); if (cd.getTime() < todayStart2.getTime()) throw new Error('لا يمكن طلب تعديل حجز انتهى بالفعل'); }
        return true;
      }
      return false;
    });
    var now = new Date();
    var req = {
      id: Utilities.getUuid().slice(0, 8), clientName: rec.name, code: rec.code, type: PORTAL_REQ_TYPE_EDIT_,
      bookingKey: bookingKey, city: city, data: sanitizeReqData_(changes), status: PORTAL_REQ_PENDING_,
      origStatus: origStatus, resultRef: '', respondedBy: '', createdTs: now, updatedTs: now,
      thread: [], clientUnread: false, staffUnread: true
    };
    var sh = ensurePortalReqSheet_();
    var rowIdx = sh.getLastRow() + 1;
    writePortalReqRow_(rowIdx, req);
    try { setBookingFieldsRaw_(bookingKey, { 16: BOOKING_EDIT_PENDING_STATUS_ }); } catch (e) {}
    // ملخص الحجز المطلوب تعديله + التغيير نفسه (قديم ⟶ جديد) — بدل سطر "أرسل طلب تعديل"
    // المجرَّد الذي لا يوضّح أي حجز ولا ماذا طُلب تغييره فيه
    var snapForLog = null;
    try { snapForLog = bookingSnapshotByKey_(bookingKey); } catch (e1) {}
    var diffForLog = tgReqEditDiffText_(req.data, snapForLog);
    logPortalClientEvent_(rec, req, 'العميل أرسل طلب تعديل حجز — ' +
      (reqBookingSummary_(snapForLog, snapForLog && snapForLog.innerRef) || bookingKey) +
      (diffForLog ? (' — التعديل المطلوب: ' + reqEditDiffInline_(diffForLog)) : ''),
      origStatus, PORTAL_REQ_PENDING_);
    // التنبيه بعد اكتمال تسجيل الطلب — لا يؤخّر العميل ولا يُفشل طلبه إن تعطّل تليجرام
    tgEnqueue_('req_edit', tgReqPayload_(rec, req));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// طلب إلغاء حجز قائم — لا يعدّل بياناته، فقط يضعه "قيد موافقة الإلغاء" حتى يردّ الموظف؛
// نفس منع الحجوزات المنتهية المطبَّق على طلب التعديل
function portalSubmitCancelRequest(ptoken, bookingKey, reason) {
  try {
    var rec = verifyPortalToken_(ptoken);
    if (!bookingKey || !portalOwnsBooking_(rec, bookingKey)) throw new Error('حجز غير صالح');
    var city = (bookingKey || '').split('|')[0];
    var todayStart3 = new Date(); todayStart3.setHours(0, 0, 0, 0);
    var origStatus = '';
    getSourceRowsCached_().some(function (r) {
      if (bookingKey_(r.slice(0, SOURCE_LAST_COL), r[SOURCE_LAST_COL]) === bookingKey) {
        origStatus = (r[15] || '').toString();
        if (origStatus === BOOKING_CANCELLED_STATUS_) throw new Error('هذا الحجز ملغى بالفعل');
        var co = r[8];
        if (co instanceof Date) { var cd = new Date(co.getTime()); cd.setHours(0, 0, 0, 0); if (cd.getTime() < todayStart3.getTime()) throw new Error('لا يمكن طلب إلغاء حجز انتهى بالفعل'); }
        // مهلة الإلغاء: لا يُقبل الطلب إلا قبل تاريخ الدخول بـPORTAL_CANCEL_MIN_DAYS_ أيام على الأقل
        var ci = r[7];
        if (ci instanceof Date) {
          var cid = new Date(ci.getTime()); cid.setHours(0, 0, 0, 0);
          var daysLeft = Math.round((cid.getTime() - todayStart3.getTime()) / 86400000);
          if (daysLeft < PORTAL_CANCEL_MIN_DAYS_) {
            throw new Error('لا يمكن طلب الإلغاء إلا قبل تاريخ الدخول بـ' + PORTAL_CANCEL_MIN_DAYS_ +
              ' أيام على الأقل — تاريخ الدخول بعد ' + (daysLeft < 0 ? 0 : daysLeft) + ' يوم. تواصل مع الشركة مباشرةً.');
          }
        }
        return true;
      }
      return false;
    });
    var now = new Date();
    var req = {
      id: Utilities.getUuid().slice(0, 8), clientName: rec.name, code: rec.code, type: PORTAL_REQ_TYPE_CANCEL_,
      bookingKey: bookingKey, city: city, data: { notes: (reason || '').toString().trim() }, status: PORTAL_REQ_PENDING_,
      origStatus: origStatus, resultRef: '', respondedBy: '', createdTs: now, updatedTs: now,
      thread: [], clientUnread: false, staffUnread: true
    };
    var sh = ensurePortalReqSheet_();
    var rowIdx = sh.getLastRow() + 1;
    writePortalReqRow_(rowIdx, req);
    try { setBookingFieldsRaw_(bookingKey, { 16: BOOKING_CANCEL_PENDING_STATUS_ }); } catch (e) {}
    var snapForLog = null;
    try { snapForLog = bookingSnapshotByKey_(bookingKey); } catch (e1) {}
    logPortalClientEvent_(rec, req, 'العميل أرسل طلب إلغاء حجز — ' +
      (reqBookingSummary_(snapForLog, snapForLog && snapForLog.innerRef) || bookingKey) +
      (reason ? (' — السبب: ' + String(reason).slice(0, 150)) : ''),
      origStatus, PORTAL_REQ_PENDING_);
    tgEnqueue_('req_cancel', tgReqPayload_(rec, req, { reason: String(reason || '').slice(0, 200) }));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
function portalSubmitNewRequest(ptoken, data) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var d = sanitizeReqData_(data);
    var city = (data && data.city === 'المدينة') ? 'المدينة' : 'مكة';
    var now = new Date();
    var req = {
      id: Utilities.getUuid().slice(0, 8), clientName: rec.name, code: rec.code, type: PORTAL_REQ_TYPE_NEW_,
      bookingKey: '', city: city, data: d, status: PORTAL_REQ_PENDING_, origStatus: '', resultRef: '',
      respondedBy: '', createdTs: now, updatedTs: now, thread: [], clientUnread: false, staffUnread: true
    };
    writePortalReqRow_(ensurePortalReqSheet_().getLastRow() + 1, req);
    logPortalClientEvent_(rec, req, 'العميل أرسل طلب حجز جديد — ' + (d.hotel || '') + ' / ' + city +
      (d.checkIn ? (' · دخول ' + d.checkIn) : ''), '', PORTAL_REQ_PENDING_);
    tgEnqueue_('req_new', tgReqPayload_(rec, req));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// رفع مجمَّع: قائمة حجوزات دفعة واحدة → طلب مستقل لكل حجز (سطر منفصل في شيت الطلبات
// ليتخذ الموظف إجراءً منفردًا لكل حجز). تُكتب كلها بنداء setValues واحد بدل نداء لكل صف —
// وإلا استغرق استيراد 20 حجزًا دقائق (كل نداء للشيت يكلّف ثوانٍ على Apps Script).
function portalSubmitBulkRequests(ptoken, list) {
  try {
    var rec = verifyPortalToken_(ptoken);
    if (!list || !list.length) throw new Error('لا توجد حجوزات للاستيراد');
    if (list.length > 200) throw new Error('الحد الأقصى 200 حجز في المرة الواحدة');
    var now = new Date();
    var sh = ensurePortalReqSheet_();
    var startRow = sh.getLastRow() + 1;
    var values = list.map(function (item) {
      var d = sanitizeReqData_(item);
      var city = (item && item.city === 'المدينة') ? 'المدينة' : 'مكة';
      return [
        Utilities.getUuid().slice(0, 8), rec.name, rec.code, PORTAL_REQ_TYPE_NEW_, '', city,
        JSON.stringify(d), PORTAL_REQ_PENDING_, '', '', '', now, now, '[]', 'لا', 'نعم'
      ];
    });
    sh.getRange(startRow, 1, values.length, 16).setValues(values);
    invalidatePortalReqCache_();
    // سطر تسجيل واحد للدفعة كلها — سطر لكل حجز كان سيُغرق سجل التعديلات بلا فائدة
    logChange_('العميل: ' + rec.name, 'طلب بوابة', rec.name,
      'رفع مجمَّع: ' + values.length + ' طلب حجز جديد دفعة واحدة', '', values.length,
      { clientName: rec.name, recordKey: 'BULK:' + rec.code + ':' + now.getTime() });
    // تنبيه واحد للدفعة كلها — تنبيه لكل حجز كان سيتجاوز حد تليجرام ويُغرق الجروب
    tgEnqueue_('req_bulk', { client: rec.name, count: values.length, ts: now.getTime() });
    return { ok: true, count: values.length };
  } catch (e) { return { ok: false, error: e.message }; }
}
// allowPrices=true فقط من جهة الموظف: أسعار البيع يسجّلها الموظف عند الرد على الطلب، ولا
// يجوز أن يرسلها العميل من بوابته (وإلا سعّر حجزه بنفسه)
function sanitizeReqData_(data, allowPrices) {
  data = data || {};
  var out = {};
  ['hotel', 'notes', 'city'].forEach(function (k) { if (data[k] !== undefined && data[k] !== null) out[k] = data[k].toString(); });
  ['checkIn', 'checkOut'].forEach(function (k) { if (data[k]) out[k] = data[k].toString(); });
  ['doubles', 'triples', 'quads', 'quints'].forEach(function (k) { if (data[k] !== undefined && data[k] !== '') out[k] = parseInt(data[k]) || 0; });
  if (allowPrices) {
    ['saleDouble', 'saleTriple', 'saleQuad', 'saleQuint', 'costDouble', 'costTriple', 'costQuad', 'costQuint'].forEach(function (k) {
      if (data[k] === undefined || data[k] === null || data[k] === '') return;
      var v = parseFloat(data[k]);
      if (!isNaN(v) && v >= 0) out[k] = v;
    });
  }
  return out;
}
function portalGetRequests(ptoken) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var code = (rec.code || '').toLowerCase();
    var mine = portalReqRows_().filter(function (r) { return (r.code || '').toLowerCase() === code; });
    mine.sort(function (a, b) { return (b.updatedTs ? b.updatedTs.getTime() : 0) - (a.updatedTs ? a.updatedTs.getTime() : 0); });
    return safeReturn_({ ok: true, requests: mine.map(function (r) { return reqPublicView_(r, 'client'); }) });
  } catch (e) { return { ok: false, error: e.message }; }
}
function portalUnreadCount(ptoken) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var code = (rec.code || '').toLowerCase();
    var n = portalReqRows_().filter(function (r) { return (r.code || '').toLowerCase() === code && r.clientUnread; }).length;
    return { ok: true, count: n };
  } catch (e) { return { ok: false, count: 0 }; }
}
// تفاصيل تنبيهات جرس العميل — نظير getPortalBellItems لكن مقصورة على طلبات هذا العميل
function portalBellItems(ptoken) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var code = (rec.code || '').toLowerCase();
    var pending = portalReqRows_().filter(function (r) {
      return (r.code || '').toLowerCase() === code && r.clientUnread;
    });
    pending.sort(function (a, b) {
      return (b.updatedTs ? new Date(b.updatedTs).getTime() : 0) - (a.updatedTs ? new Date(a.updatedTs).getTime() : 0);
    });
    var items = pending.slice(0, 15).map(function (r) {
      var last = (r.thread && r.thread.length) ? r.thread[r.thread.length - 1] : null;
      var d = r.data || {};
      return {
        id: r.id, type: r.type, status: r.status, city: r.city,
        hotel: (d.hotel || '').toString(),
        checkIn: (d.checkIn || '').toString(), checkOut: (d.checkOut || '').toString(),
        ref: r.resultRef || '',
        lastFrom: last ? last.from : '', lastName: last ? (last.name || '') : '',
        lastText: last ? String(last.text || '').slice(0, 120) : '',
        ts: r.updatedTs ? new Date(r.updatedTs).getTime() : 0
      };
    });
    return safeReturn_({ ok: true, count: pending.length, items: items });
  } catch (e) { return { ok: false, count: 0, items: [], error: e.message }; }
}
// تعليم طلب واحد كمقروء للعميل — عند فتح كرته من الجرس
function portalMarkOneRead(ptoken, requestId) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var r = getPortalReqById_(requestId);
    if (!r) return { ok: true };
    if ((r.code || '').toLowerCase() !== (rec.code || '').toLowerCase()) throw new Error('طلب غير متاح');
    if (!r.clientUnread) return { ok: true };
    r.clientUnread = false;
    writePortalReqRow_(r.rowIdx, r);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function portalMarkRequestsRead(ptoken) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var code = (rec.code || '').toLowerCase();
    var sh = ensurePortalReqSheet_();
    if (sh.getLastRow() < 2) return { ok: true };
    // قراءة/كتابة العمود دفعة واحدة بدل نداء منفصل للشيت لكل صف — كان يبطئ الشاشة
    // كثيرًا مع تراكم عدد الطلبات (كل نداء SpreadsheetApp له زمن استجابة فعلي)
    var n = sh.getLastRow() - 1;
    var codes = sh.getRange(2, 3, n, 1).getValues();
    var unreadRng = sh.getRange(2, 15, n, 1);
    var unread = unreadRng.getValues();
    var changed = false;
    for (var i = 0; i < n; i++) {
      if ((codes[i][0] || '').toString().toLowerCase() === code && (unread[i][0] === 'نعم' || unread[i][0] === true)) {
        unread[i][0] = 'لا'; changed = true;
      }
    }
    if (changed) { unreadRng.setValues(unread); invalidatePortalReqCache_(); }
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
function portalAddMessage(ptoken, requestId, text) {
  try {
    var rec = verifyPortalToken_(ptoken);
    text = (text || '').toString().trim();
    if (!text) throw new Error('اكتب رسالة');
    var r = getPortalReqById_(requestId);
    if (!r || (r.code || '').toLowerCase() !== (rec.code || '').toLowerCase()) throw new Error('طلب غير موجود');
    r.thread.push({ from: 'client', name: rec.name, text: text, ts: new Date().getTime() });
    r.updatedTs = new Date(); r.staffUnread = true;
    writePortalReqRow_(r.rowIdx, r);
    logPortalClientEvent_(rec, r, 'رسالة من العميل على طلب (' + r.type + ')', '', text.slice(0, 200));
    tgEnqueue_('req_msg', tgReqPayload_(rec, r, { message: text.slice(0, 300) }));
    return safeReturn_({ ok: true, thread: r.thread });
  } catch (e) { return { ok: false, error: e.message }; }
}
// العميل يسحب طلبه بنفسه طالما لم يرد الموظف عليه بأي ردّ بعد (قبول/رفض/جاري بحث الإمكانية —
// r.respondedBy يُضبَط في الحالات الثلاث كلها). بعد الرد لا يعود السحب متاحًا؛ يبقى للعميل
// فقط متابعة المحادثة كالمعتاد. لو كان طلب تعديل/إلغاء نُعيد حالة الحجز الأصلية بنفس منطق الرفض.
function portalWithdrawRequest(ptoken, requestId) {
  try {
    var rec = verifyPortalToken_(ptoken);
    var r = getPortalReqById_(requestId);
    if (!r) throw new Error('طلب غير موجود');
    if ((r.code || '').toLowerCase() !== (rec.code || '').toLowerCase()) throw new Error('هذا الطلب لا يخصّك');
    if (r.respondedBy) throw new Error('تعذّر سحب الطلب — ردّ عليه الموظف بالفعل');
    var now = new Date();
    r.status = PORTAL_REQ_WITHDRAWN_;
    r.updatedTs = now;
    r.staffUnread = true;
    if ((r.type === PORTAL_REQ_TYPE_EDIT_ || r.type === PORTAL_REQ_TYPE_CANCEL_) && r.bookingKey) {
      try { setBookingFieldsRaw_(r.bookingKey, { 16: r.origStatus || '' }); } catch (e) {}
    }
    writePortalReqRow_(r.rowIdx, r);
    var snapForLog2 = null;
    try { snapForLog2 = r.bookingKey ? bookingSnapshotByKey_(r.bookingKey) : r.data; } catch (e3) {}
    logPortalClientEvent_(rec, r, 'العميل سحب طلبه (' + r.type + ') — ' + (reqBookingSummary_(snapForLog2, '') || ''),
      PORTAL_REQ_PENDING_, PORTAL_REQ_WITHDRAWN_);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---- جهة الموظف (صلاحية clientPortal) ----
function getPortalRequests(token) {
  try {
    requirePermission_(token, 'clientPortal', 'view');
    var all = portalReqRows_();
    all.sort(function (a, b) {
      // الجديد أولًا ثم الأحدث تحديثًا
      var an = a.status === PORTAL_REQ_PENDING_ ? 0 : 1, bn = b.status === PORTAL_REQ_PENDING_ ? 0 : 1;
      if (an !== bn) return an - bn;
      return (b.updatedTs ? b.updatedTs.getTime() : 0) - (a.updatedTs ? a.updatedTs.getTime() : 0);
    });
    return safeReturn_({ ok: true, requests: all.map(function (r) { return reqPublicView_(r, 'staff'); }) });
  } catch (e) { return safeReturn_({ ok: false, error: e.message }); }
}
function getPortalPendingCount(token) {
  try {
    var user = requireSession_(token);
    if (user.role !== 'admin' && !hasScreenLevel_(user, 'clientPortal', 'view')) return { ok: true, count: 0 };
    try {
      var cached = CacheService.getScriptCache().get('portal_pending');
      if (cached !== null && cached !== undefined) return { ok: true, count: parseInt(cached, 10) || 0 };
    } catch (e0) {}
    var n = portalReqRows_().filter(function (r) { return r.staffUnread; }).length;
    try { CacheService.getScriptCache().put('portal_pending', String(n), 20); } catch (e1) {}
    return { ok: true, count: n };
  } catch (e) { return { ok: false, count: 0 }; }
}
// تفاصيل تنبيهات الجرس للموظف: نفس عدّاد getPortalPendingCount مع بيانات كل تنبيه (العميل،
// نوع الطلب، الفندق/التواريخ، آخر رسالة، توقيتها) ليعرضها الجرس في قائمة منسدلة، ومعرّف
// الطلب لفتح كرته مباشرةً بضغطة واحدة. لا يُعلّم أي شيء كمقروء — القراءة فعل منفصل صريح.
function getPortalBellItems(token) {
  try {
    var user = requireSession_(token);
    if (user.role !== 'admin' && !hasScreenLevel_(user, 'clientPortal', 'view')) return { ok: true, count: 0, items: [] };
    var pending = portalReqRows_().filter(function (r) { return r.staffUnread; });
    pending.sort(function (a, b) {
      return (b.updatedTs ? new Date(b.updatedTs).getTime() : 0) - (a.updatedTs ? new Date(a.updatedTs).getTime() : 0);
    });
    var items = pending.slice(0, 15).map(function (r) {
      var last = (r.thread && r.thread.length) ? r.thread[r.thread.length - 1] : null;
      var d = r.data || {};
      return {
        id: r.id, client: r.clientName, type: r.type, status: r.status, city: r.city,
        hotel: (d.hotel || '').toString(),
        checkIn: (d.checkIn || '').toString(), checkOut: (d.checkOut || '').toString(),
        ref: r.resultRef || '',
        lastFrom: last ? last.from : '', lastText: last ? String(last.text || '').slice(0, 120) : '',
        ts: r.updatedTs ? new Date(r.updatedTs).getTime() : 0
      };
    });
    return safeReturn_({ ok: true, count: pending.length, items: items });
  } catch (e) { return { ok: false, count: 0, items: [], error: e.message }; }
}
// تعليم طلب واحد كمقروء للموظف — يُستدعى عند فتح كرت الطلب من الجرس، فينقص العدّاد فورًا
// بدل انتظار "تعليم الكل كمقروء" عند فتح الشاشة بأكملها
function markOnePortalRequestRead(token, requestId) {
  try {
    requirePermission_(token, 'clientPortal', 'view');
    var r = getPortalReqById_(requestId);
    if (!r || !r.staffUnread) return { ok: true };
    r.staffUnread = false;
    writePortalReqRow_(r.rowIdx, r);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function markPortalRequestsRead(token) {
  try {
    requirePermission_(token, 'clientPortal', 'view');
    var sh = ensurePortalReqSheet_();
    if (sh.getLastRow() < 2) return { ok: true };
    // نفس تحسين الأداء: عمود واحد يُقرأ ويُكتب دفعة واحدة بدل نداء منفصل لكل صف
    var n = sh.getLastRow() - 1;
    var rng = sh.getRange(2, 16, n, 1);
    var vals = rng.getValues();
    var changed = false;
    for (var i = 0; i < n; i++) {
      if (vals[i][0] === 'نعم' || vals[i][0] === true) { vals[i][0] = 'لا'; changed = true; }
    }
    if (changed) { rng.setValues(vals); invalidatePortalReqCache_(); }
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
function addStaffRequestMessage(token, requestId, text) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    text = (text || '').toString().trim();
    if (!text) throw new Error('اكتب رسالة');
    var r = getPortalReqById_(requestId);
    if (!r) throw new Error('طلب غير موجود');
    // الاسم الظاهر للموظف (وليس اسم المستخدم الذي يسجّل به الدخول) في كل ما يراه العميل
    r.thread.push({ from: 'staff', name: staffDisplayName_(user), text: text, ts: new Date().getTime() });
    r.updatedTs = new Date(); r.clientUnread = true;
    writePortalReqRow_(r.rowIdx, r);
    return safeReturn_({ ok: true, thread: r.thread });
  } catch (e) { return { ok: false, error: e.message }; }
}
// action: 'approve' | 'reject' | 'hold' ؛ editedData: بيانات معدَّلة من الموظف قبل القبول (اختياري)؛
// message: رسالة ردّ تُضاف للمحادثة (اختياري)
function respondPortalRequest(token, requestId, action, editedData, message) {
  try {
    var user = requirePermission_(token, 'clientPortal', 'edit');
    return respondPortalRequestAs_(user, requestId, action, editedData, message);
  } catch (e) { return { ok: false, error: e.message }; }
}
// نفس المنطق بالضبط لكن بكائن مستخدم جاهز بدل رمز جلسة — يستخدمه بوت تليجرام (حيث لا
// توجد جلسة متصفح). التحقق من الصلاحية يقع على المُنادي: هنا الواجهة تتحقق بـ
// requirePermission_ وهناك البوت يتحقق بـ tgRequire_ — فلا يوجد مسار يتخطى الصلاحيات
function respondPortalRequestAs_(user, requestId, action, editedData, message) {
  try {
    var r = getPortalReqById_(requestId);
    if (!r) throw new Error('طلب غير موجود');
    var now = new Date();
    var finalData = editedData ? sanitizeReqData_(editedData, true) : r.data;
    r.data = finalData;
    r.respondedBy = staffDisplayName_(user); // الاسم الفعلي للموظف وليس اسم الدخول
    r.updatedTs = now;
    r.clientUnread = true; r.staffUnread = false;
    var autoReply = ''; // رد تلقائي يُضاف للمحادثة إن لم يكتب الموظف رسالة (حالة الإلغاء)

    if (action === 'hold') {
      r.status = PORTAL_REQ_HOLD_;
    } else if (action === 'reject') {
      r.status = PORTAL_REQ_REJECTED_;
      // إعادة حالة الحجز الأصلية لو كان طلب تعديل/إلغاء (أزلنا عنه "قيد الموافقة")
      if ((r.type === PORTAL_REQ_TYPE_EDIT_ || r.type === PORTAL_REQ_TYPE_CANCEL_) && r.bookingKey) {
        try { setBookingFieldsRaw_(r.bookingKey, { 16: r.origStatus || '' }); } catch (e) {}
      }
    } else if (action === 'approve') {
      if (r.type === PORTAL_REQ_TYPE_EDIT_ && r.bookingKey) {
        var map = reqDataToSourceMap_(finalData);
        map[16] = BOOKING_CONFIRMED_STATUS_; // قبول التعديل = الحجز أصبح "مؤكد"
        setBookingFieldsRaw_(r.bookingKey, map);
        r.status = PORTAL_REQ_APPROVED_;
      } else if (r.type === PORTAL_REQ_TYPE_CANCEL_ && r.bookingKey) {
        setBookingFieldsRaw_(r.bookingKey, { 16: BOOKING_CANCELLED_STATUS_ }); // قبول الإلغاء = "لاغي"
        r.status = PORTAL_REQ_CANCELLED_;
        autoReply = 'تم إلغاء الحجز.';
      } else if (r.type === PORTAL_REQ_TYPE_NEW_) {
        // لو سبق تسجيل الحجز فعليًا لهذا الطلب (عبر رد "تسجيل الطلب وجاري تأكيده" مثلاً) لا
        // نُنشئ صفًا آخر مكرَّرًا — نكتفي بترقية حالة الطلب نفسه إلى "مؤكد"
        if (!r.resultRef) {
          // مسؤول البيع يُحسم داخل appendBookingRaw_ (بيانات الحساب ← أحدث حجز سابق ← يُحفظ)
          r.resultRef = appendBookingRaw_(r.city, finalData, r.clientName, '', BOOKING_REQUESTED_STATUS_);
          autoReply = 'تم تسجيل الحجز.';
        }
        r.status = PORTAL_REQ_APPROVED_;
      } else {
        r.status = PORTAL_REQ_APPROVED_;
      }
    } else if (action === 'register') {
      // رد وسيط: يُنشئ الحجز فعليًا بحالة "مطلوب" (كما لو قُبل الطلب) لكن حالة الطلب نفسه تبقى
      // "جاري تأكيده" لا "مؤكد" — يناسب حجز سُجِّل لدى المورد لكن لم يصل تأكيده النهائي بعد.
      // متاح فقط لطلبات الحجز الجديد (لا معنى له لطلب تعديل/إلغاء حجز قائم أصلاً)
      if (r.type !== PORTAL_REQ_TYPE_NEW_) throw new Error('هذا الرد متاح فقط لطلبات الحجز الجديد');
      if (!r.resultRef) {
        r.resultRef = appendBookingRaw_(r.city, finalData, r.clientName, '', BOOKING_REQUESTED_STATUS_);
        autoReply = 'تم تسجيل الحجز، وجاري تأكيده لدى الفندق/المورد.';
      }
      r.status = PORTAL_REQ_REGISTERED_;
    } else if (action === 'done') {
      // لا كتابة إطلاقًا في بيانات الحجز: الحجز مُعدَّل يدويًا بالفعل، وأي كتابة هنا ستدهس
      // تعديل الموظف ببيانات الطلب القديمة. الاستثناء الوحيد هو علامة "قيد الموافقة" التي
      // وضعها النظام نفسه عند تقديم الطلب — تُزال فقط إن كانت ما زالت قائمة كما هي، وإلا
      // بقي الحجز معلَّقًا شكليًا إلى الأبد رغم إغلاق طلبه
      r.status = PORTAL_REQ_DONE_;
      if ((r.type === PORTAL_REQ_TYPE_EDIT_ || r.type === PORTAL_REQ_TYPE_CANCEL_) && r.bookingKey) {
        try {
          var snapNow = bookingSnapshotByKey_(r.bookingKey);
          var stNow = snapNow ? snapNow.status : '';
          if (stNow === BOOKING_EDIT_PENDING_STATUS_ || stNow === BOOKING_CANCEL_PENDING_STATUS_) {
            setBookingFieldsRaw_(r.bookingKey, { 16: r.origStatus || '' });
          }
        } catch (e) {}
      }
      autoReply = 'تم تنفيذ طلبك.';
    } else {
      throw new Error('إجراء غير معروف');
    }
    var replyText = (message && message.toString().trim()) || autoReply;
    if (replyText) {
      r.thread.push({ from: 'staff', name: staffDisplayName_(user), text: replyText, ts: now.getTime() });
    }
    writePortalReqRow_(r.rowIdx, r);
    var summaryObj = null, summaryRef = '';
    if (r.bookingKey) {
      try { summaryObj = bookingSnapshotByKey_(r.bookingKey); } catch (e2) {}
      summaryRef = (summaryObj && summaryObj.innerRef) || '';
    }
    if (!summaryObj) { summaryObj = finalData; summaryRef = r.resultRef || ''; }
    var bkSummary = reqBookingSummary_(summaryObj, summaryRef);
    logChange_(user, 'طلب بوابة', r.clientName, 'رد الموظف على طلب (' + r.type + ') → ' + r.status +
      (bkSummary ? ' — ' + bkSummary : '') +
      (r.resultRef ? ' — رقم داخلي ' + r.resultRef : ''), r.origStatus || '', r.status,
      { hotelRef: r.resultRef || '', clientName: r.clientName, recordKey: 'REQ:' + r.id });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}


// ==========================================================
// شاشة "كل الحجوزات" — بحث وفلترة تُقرأ مباشرة من المصدر الخارجي (عبر الكاش)
// ==========================================================
function getDistinctBookingStatuses(token) {
  try {
    requireSession_(token);
    var data = getSourceRowsCached_();
    var set = {};
    data.forEach(function (r) { var v = (r[15] || '').toString().trim(); if (v) set[v] = true; }); // العمود P (16) = حالة الحجز
    return Object.keys(set).sort();
  } catch (e) {
    Logger.log('Error in getDistinctBookingStatuses: ' + e.message);
    return [];
  }
}

// إحصاءات سريعة لكروت شاشة "كل الحجوزات" (بدون فندق/مورد/سعر بيع + دخول اليوم/غدًا) —
// تُحسب من كامل الحجوزات (بصرف النظر عن أي فلتر حالي)، وتتجاهل الحجوزات الملغاة
function getBookingsQuickStats(token) {
  try {
    requireSession_(token);
    var data = getSourceRowsCached_();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayTs = today.getTime();
    var tomorrowTs = todayTs + 86400000;
    var stats = { missingHotel: 0, missingSupplier: 0, missingSale: 0, todayCount: 0, tomorrowCount: 0,
      qaidEdit: getQaidEditFlags_().length };
    data.forEach(function (r) {
      var raw = r.slice(0, SOURCE_LAST_COL);
      if (raw[15] === 'لاغي') return;
      if (!(raw[4] || '').toString().trim()) stats.missingHotel++;
      if (!(raw[14] || '').toString().trim()) stats.missingSupplier++;
      if (!computeBookingTotal_(raw, 'client').hasPrice && !(raw[0] || '').toString().trim()) stats.missingSale++;
      var cin = raw[7];
      var d = cin instanceof Date ? new Date(cin.getTime()) : new Date(cin);
      if (isNaN(d.getTime())) return;
      d.setHours(0, 0, 0, 0);
      var ts = d.getTime();
      if (ts === todayTs) stats.todayCount++;
      else if (ts === tomorrowTs) stats.tomorrowCount++;
    });
    stats.todayIso = Utilities.formatDate(today, 'GMT+3', 'yyyy-MM-dd');
    stats.tomorrowIso = Utilities.formatDate(new Date(tomorrowTs), 'GMT+3', 'yyyy-MM-dd');
    stats.todayDisp = Utilities.formatDate(today, 'GMT+3', 'dd/MM/yyyy');
    stats.tomorrowDisp = Utilities.formatDate(new Date(tomorrowTs), 'GMT+3', 'dd/MM/yyyy');
    return safeReturn_(stats);
  } catch (e) {
    Logger.log('Error in getBookingsQuickStats: ' + e.message);
    return { error: e.message };
  }
}

function searchBookings(filters, token) {
  try {
    var user = requirePermission_(token, 'bookings', 'view');
    filters = filters || {};
    // تقييد المدينة: لو المستخدم محصور على مدينة معيّنة ولم يوافق فلتره المطلوب (إن وُجد)
    // تلك المدينة، نُرجع نتيجة فارغة بدل تجاهل القيد أو استبدال طلبه صامتًا
    if (user.bookingCityScope && user.bookingCityScope !== 'all') {
      if (filters.city && filters.city !== user.bookingCityScope) {
        return safeReturn_({ rows: [], total: 0, truncated: false });
      }
      filters.city = user.bookingCityScope;
    }
    var res = searchBookings_(filters);
    res.rows = redactBookingFinance_(res.rows || [], user);
    return safeReturn_(res);
  } catch (e) {
    Logger.log('Error in searchBookings: ' + e.message);
    return { rows: [], total: 0, error: e.message };
  }
}

function searchBookings_(filters) {
  var data = getSourceRowsCached_();

  function norm(v) { return (v === null || v === undefined) ? '' : v.toString().trim().toLowerCase(); }
  function dateOnlyTs(v) {
    var d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  var f = filters || {};
  var fCheckInFrom = f.checkInFrom ? dateOnlyTs(f.checkInFrom) : null;
  var fCheckInTo = f.checkInTo ? dateOnlyTs(f.checkInTo) : null;
  var fCheckOutFrom = f.checkOutFrom ? dateOnlyTs(f.checkOutFrom) : null;
  var fCheckOutTo = f.checkOutTo ? dateOnlyTs(f.checkOutTo) : null;
  // خيار "تضمين الحجوزات الناقصة": يُظهر أي حجز بدون رقم قيد أو بدون تكلفة/بيع حتى لو
  // كان خارج نطاق تاريخ الدخول المُختار — حتى لا تُنسى حجوزات قديمة ناقصة البيانات
  var includeIncomplete = !!f.includeIncomplete;
  var todayTs = dateOnlyTs(new Date());

  var matched = [];

  // فلتر الحالة: إما مصفوفة حالات محددة (f.statuses، وضع "تخصيص")، أو استبعاد "لاغي" فقط
  // (f.excludeCancelled، وهو الوضع الافتراضي)، أو بلا فلتر إطلاقًا (وضع "الكل")
  var statusSet = null;
  if (f.statuses && f.statuses.length) {
    statusSet = {};
    f.statuses.forEach(function (s) { statusSet[norm(s)] = true; });
  }

  // فلتر كارت "حجوزات عُدِّلت بعد تسجيل القيد" — مجموعة صغيرة من مفاتيح السجل تُقرأ مرة
  // واحدة هنا بدل قراءتها لكل صف
  var qaidEditSet = null;
  if (f.qaidEdit) {
    qaidEditSet = {};
    getQaidEditFlags_().forEach(function (fl) { qaidEditSet[fl.recordKey] = true; });
  }

  data.forEach(function (r) {
    var raw = r.slice(0, SOURCE_LAST_COL);
    var city = r[SOURCE_LAST_COL];
    var qaid = raw[0], innerRef = raw[2], client = raw[3], hotel = raw[4],
        checkInRaw = raw[7], checkOutRaw = raw[8], nights = parseInt(raw[9]) || 0, supplier = raw[14],
        status = raw[15], optionDateRaw = raw[16], hotelRef = raw[17], salesAgent = (raw[19] || '').toString().trim();

    // إجمالي التكلفة/البيع محسوب من الأسعار والأعداد والليالي مباشرة (computeBookingTotal_)
    // بدل قراءة عمود إجمالي جاهز من المصدر — نفس مصدر الحساب المستخدم في كل شاشات التطبيق
    var costCalc = computeBookingTotal_(raw, 'supplier'); var hasCost = costCalc.hasPrice; var costNum = costCalc.value;
    var saleCalc = computeBookingTotal_(raw, 'client'); var hasSale = saleCalc.hasPrice; var saleNum = saleCalc.value;
    // حجز له رقم قيد يُعتبر مكتمل البيانات لأغراض هذا التوسيع رغم غياب السعر (نفس قاعدة #60):
    // القيد يعني أنه مُوثَّق/مُسوَّى، فلا داعي لسحبه من خارج نطاق التاريخ فقط لغياب السعر
    var incomplete = !norm(qaid) && (!hasCost || !hasSale);

    if (f.innerRef && norm(innerRef).indexOf(norm(f.innerRef)) === -1) return;
    if (f.hotelRef && norm(hotelRef).indexOf(norm(f.hotelRef)) === -1) return;
    if (f.hotel && norm(hotel).indexOf(norm(f.hotel)) === -1) return;
    if (f.client && norm(client).indexOf(norm(f.client)) === -1) return;
    if (f.supplier && norm(supplier).indexOf(norm(f.supplier)) === -1) return;
    if (statusSet && !statusSet[norm(status)]) return;
    if (!statusSet && f.excludeCancelled && norm(status) === norm('لاغي')) return;
    if (f.city && city !== f.city) return;
    if (f.noQaid && norm(qaid) !== '') return;
    if (f.noHotel && norm(hotel) !== '') return;
    if (f.noSupplier && norm(supplier) !== '') return;
    if (f.noSale && hasSale) return;
    if (qaidEditSet && !qaidEditSet[bookingRecordKey_((innerRef || '').toString().trim())]) return;

    var checkInTs = dateOnlyTs(checkInRaw);
    var checkOutTs = dateOnlyTs(checkOutRaw); // من عمود الخروج الفعلي (I) مباشرة، وليس محسوبًا من الليالي

    var passDates = true;
    if (fCheckInFrom && (!checkInTs || checkInTs < fCheckInFrom)) passDates = false;
    if (fCheckInTo && (!checkInTs || checkInTs > fCheckInTo)) passDates = false;
    if (fCheckOutFrom && (!checkOutTs || checkOutTs < fCheckOutFrom)) passDates = false;
    if (fCheckOutTo && (!checkOutTs || checkOutTs > fCheckOutTo)) passDates = false;
    if (!passDates && !(includeIncomplete && incomplete)) return;

    // حالة السكن: "سكن ولم يخرج" (دخل قبل اليوم ولم يخرج بعد) أو "سكن وخرج" (خرج قبل اليوم)
    var stayStatus = null;
    if (status !== 'لاغي' && checkInTs !== null && checkOutTs !== null) {
      if (checkInTs < todayTs && checkOutTs >= todayTs) stayStatus = 'active';
      else if (checkOutTs < todayTs) stayStatus = 'departed';
    }

    var doubles = parseInt(raw[10]) || 0, triples = parseInt(raw[11]) || 0, quads = parseInt(raw[12]) || 0, quints = parseInt(raw[13]) || 0;
    var totalRooms = doubles + triples + quads + quints;
    var totalOccupants = doubles * 2 + triples * 3 + quads * 4 + quints * 5;

    matched.push({
      sortTs: checkInTs || 0,
      key: bookingKey_(raw, city), city: city, qaid: qaid, innerRef: innerRef, hotelRef: hotelRef,
      client: client, supplier: supplier, hotel: hotel, salesAgent: salesAgent,
      exec: truthy_(raw[1]), optionDate: optionDateRaw instanceof Date ? Utilities.formatDate(optionDateRaw, 'GMT+3', 'dd/MM/yyyy') : (optionDateRaw || ''),
      totalRooms: totalRooms, totalOccupants: totalOccupants, totalRoomNights: totalRooms * nights,
      checkInTs: checkInTs, checkOutTs: checkOutTs, nights: nights, status: status, stayStatus: stayStatus,
      cost: hasCost ? costNum : null, hasCost: hasCost, sale: hasSale ? saleNum : null, hasSale: hasSale,
      raw: raw.map(function (v) { return v instanceof Date ? Utilities.formatDate(v, 'GMT+3', 'dd/MM/yyyy') : v; })
    });
  });

  matched.sort(function (a, b) { return a.sortTs - b.sortTs; }); // تصاعديًا حسب تاريخ الدخول
  var total = matched.length;
  // سقف النتائج المُعادة للمتصفح: ما زاد عنه لا يُرسَل إطلاقًا (تُضيَّق الفلاتر لرؤيته).
  // رُفع من 500 إلى 1500 — أكبر بكثير من أي بحث عملي، ويظل تحت حد حجم استجابة Apps Script.
  var page = matched.slice(0, BOOKINGS_RESULT_CAP_).map(function (m) {
    return {
      key: m.key, city: m.city, qaid: m.qaid, innerRef: m.innerRef, hotelRef: m.hotelRef,
      client: m.client, supplier: m.supplier, hotel: m.hotel, salesAgent: m.salesAgent,
      exec: m.exec, optionDate: m.optionDate, totalRooms: m.totalRooms, totalOccupants: m.totalOccupants, totalRoomNights: m.totalRoomNights,
      checkIn: m.checkInTs ? Utilities.formatDate(new Date(m.checkInTs), 'GMT+3', 'dd/MM/yyyy') : '',
      checkOut: m.checkOutTs ? Utilities.formatDate(new Date(m.checkOutTs), 'GMT+3', 'dd/MM/yyyy') : '',
      // القيمتان الخام (ملي ثانية) — تلزم الواجهة للترتيب الزمني الصحيح؛ النص "dd/MM/yyyy"
      // المعروض لا يصلح للترتيب الأبجدي (مثال: "01/12" يسبق "15/01" أبجديًا رغم تأخره زمنيًا)
      checkInTs: m.checkInTs || 0, checkOutTs: m.checkOutTs || 0,
      nights: m.nights, status: m.status, stayStatus: m.stayStatus, cost: m.cost, hasCost: m.hasCost, sale: m.sale, hasSale: m.hasSale,
      raw: m.raw
    };
  });
  return { rows: page, total: total, truncated: total > BOOKINGS_RESULT_CAP_, cap: BOOKINGS_RESULT_CAP_ };
}

// ==========================================================
// شاشة الإحصائيات الشاملة: مبيعات/تكلفة/ربح لكل مورد وعميل ومسؤول بيع وفندق، مع فلاتر
// متقاطعة (فترة/مدينة/عميل/مورد/مسؤول بيع). صلاحية مستقلة "statsReport" + احترام صلاحية
// الجانب المالي المتدرجة (financeLevel) نفسها المستخدَمة في شاشة الحجوزات — نفس أسلوب
// searchBookings_ في القراءة والفلترة، لكن تجميعًا لا عرض صفوف مباشرة
// ==========================================================
function statsNewBucket_(name) { return { name: name, count: 0, roomNights: 0, sales: 0, cost: 0, diff: 0, incomplete: 0 }; }

// دالة نقية: تُرجع { bySupplier, byClient, byAgent, byHotel, totals, rows }. الملغي (لاغي)
// مستبعد دائمًا من هذه الإحصائيات المالية (كما في كل حسابات المبالغ بالبرنامج) — لا خيار
// لإظهاره، فحجز ملغي ليس مبيعًا فعليًا. "sales"/"cost" لكل حاوية هي مجموع مستقل (يُحتسَب
// كل حجز في مجموع البيع لو كان له سعر بيع، بصرف النظر عن اكتمال سعر التكلفة والعكس)، و"diff"
// = الفرق بين المجموعين على مستوى الحاوية — أسلوب تقارير مالية معتاد، لا مجموع فروق فردية
function computeStatsReport_(filters) {
  var f = filters || {};
  function norm(v) { return (v === null || v === undefined) ? '' : v.toString().trim().toLowerCase(); }
  function dateOnlyTs(v) {
    var d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  var fCheckInFrom = f.checkInFrom ? dateOnlyTs(f.checkInFrom) : null;
  var fCheckInTo = f.checkInTo ? dateOnlyTs(f.checkInTo) : null;

  var data = getSourceRowsCached_();
  var bySupplier = {}, byClient = {}, byAgent = {}, byHotel = {};
  var totals = statsNewBucket_('الإجمالي');
  var rows = [];

  data.forEach(function (r) {
    var raw = r.slice(0, SOURCE_LAST_COL);
    var city = r[SOURCE_LAST_COL];
    var status = raw[15];
    if (norm(status) === norm('لاغي')) return;

    var client = (raw[3] || '').toString().trim();
    var supplier = (raw[14] || '').toString().trim();
    var hotel = (raw[4] || '').toString().trim();
    var salesAgent = (raw[19] || '').toString().trim();
    var checkInTs = dateOnlyTs(raw[7]);

    if (f.city && city !== f.city) return;
    if (f.client && norm(client) !== norm(f.client)) return;
    if (f.supplier && norm(supplier) !== norm(f.supplier)) return;
    if (f.salesAgent && norm(salesAgent) !== norm(f.salesAgent)) return;
    if (fCheckInFrom && (!checkInTs || checkInTs < fCheckInFrom)) return;
    if (fCheckInTo && (!checkInTs || checkInTs > fCheckInTo)) return;

    var saleCalc = computeBookingTotal_(raw, 'client'); var hasSale = saleCalc.hasPrice; var saleNum = saleCalc.value;
    var costCalc = computeBookingTotal_(raw, 'supplier'); var hasCost = costCalc.hasPrice; var costNum = costCalc.value;
    // إجمالي الليالي = إجمالي الغرف (ثنائي+ثلاثي+رباعي+خماسي) × عدد ليالي الحجز — نفس تعريف
    // totalRoomNights في searchBookings_ تمامًا (ليالي الغرف، لا ليالي الحجز المجردة)
    var roomNights = ((parseInt(raw[10]) || 0) + (parseInt(raw[11]) || 0) + (parseInt(raw[12]) || 0) + (parseInt(raw[13]) || 0)) * (parseInt(raw[9]) || 0);

    [
      { map: bySupplier, key: supplier },
      { map: byClient, key: client },
      { map: byAgent, key: salesAgent },
      { map: byHotel, key: hotel }
    ].forEach(function (g) {
      var key = g.key || 'غير محدد';
      if (!g.map[key]) g.map[key] = statsNewBucket_(key);
      var b = g.map[key];
      b.count++;
      b.roomNights += roomNights;
      if (hasSale) b.sales += saleNum;
      if (hasCost) b.cost += costNum;
      if (!hasSale || !hasCost) b.incomplete++;
    });

    totals.count++;
    totals.roomNights += roomNights;
    if (hasSale) totals.sales += saleNum;
    if (hasCost) totals.cost += costNum;
    if (!hasSale || !hasCost) totals.incomplete++;

    rows.push({
      key: bookingKey_(raw, city), city: city, client: client, supplier: supplier, hotel: hotel,
      salesAgent: salesAgent, qaid: raw[0], innerRef: raw[2], status: status, roomNights: roomNights,
      checkIn: checkInTs ? Utilities.formatDate(new Date(checkInTs), 'GMT+3', 'dd/MM/yyyy') : '', checkInTs: checkInTs || 0,
      sale: hasSale ? saleNum : null, hasSale: hasSale, cost: hasCost ? costNum : null, hasCost: hasCost
    });
  });

  function toSortedList(map) {
    return Object.keys(map).map(function (k) {
      var b = map[k]; b.diff = b.sales - b.cost; return b;
    }).sort(function (a, b) { return b.sales - a.sales; });
  }
  totals.diff = totals.sales - totals.cost;
  rows.sort(function (a, b) { return b.checkInTs - a.checkInTs; });

  return {
    bySupplier: toSortedList(bySupplier), byClient: toSortedList(byClient),
    byAgent: toSortedList(byAgent), byHotel: toSortedList(byHotel),
    totals: totals, rows: rows
  };
}

// يحذف أرقام البيع/التكلفة/الفرق من كل الحاويات حسب مستوى صلاحية الجانب المالي (financeLevel)
// — نفس مبدأ redactBookingFinance_ بالضبط: قبل إرسال الرد للمتصفح لا بعده
function statsRedact_(res, canSale, canCost, canDiff) {
  var lists = [res.bySupplier, res.byClient, res.byAgent, res.byHotel, [res.totals]];
  lists.forEach(function (list) {
    list.forEach(function (b) {
      if (!canCost) b.cost = null;
      if (!canSale) b.sales = null;
      if (!canDiff) b.diff = null;
    });
  });
  res.rows.forEach(function (r) {
    if (!canCost) { r.cost = null; r.hasCost = false; }
    if (!canSale) { r.sale = null; r.hasSale = false; }
  });
}

function getStatsReportData(token, filters) {
  try {
    var user = requirePermission_(token, 'statsReport', 'view');
    filters = filters || {};
    var canCost = hasFinanceLevel_(user, 'cost');
    var canSale = hasFinanceLevel_(user, 'sale');
    var canDiff = hasFinanceLevel_(user, 'diff');
    // نفس تقييد المدينة المفروض في searchBookings تمامًا: مستخدم محصور على مدينة لا يرى
    // إحصائيات غيرها حتى لو طلبها صراحةً بالفلتر
    if (user.bookingCityScope && user.bookingCityScope !== 'all') {
      if (filters.city && filters.city !== user.bookingCityScope) {
        return safeReturn_({
          ok: true, bySupplier: [], byClient: [], byAgent: [], byHotel: [],
          totals: statsNewBucket_('الإجمالي'), rows: [], canSale: canSale, canCost: canCost, canDiff: canDiff
        });
      }
      filters.city = user.bookingCityScope;
    }
    var res = computeStatsReport_(filters);
    statsRedact_(res, canSale, canCost, canDiff);
    res.ok = true; res.canSale = canSale; res.canCost = canCost; res.canDiff = canDiff;
    return safeReturn_(res);
  } catch (e) {
    Logger.log('Error in getStatsReportData: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// تسجيل/تعديل رقم القيد (المرجع) لحجز — العمود A (رقم 1) — يكتب في شيت المصدر مباشرة
// أي حجز له رقم قيد يُعتبر "منفَّذ" تلقائيًا — نفعّل عمود التنفيذ (B) معه لو لم يكن مفعّلًا
function registerBookingQaid(bookingKey, qaidValue, token) {
  var res = editBookingField(bookingKey, 1, qaidValue, token);
  if (res.ok && qaidValue) {
    try {
      var city = (bookingKey || '').split('|')[0];
      var src = findSourceRowIndex_(city, bookingKey);
      if (src) {
        var execVal = src.sheet.getRange(src.rowInSheet, 2).getValue();
        if (!truthy_(execVal)) editBookingField(bookingKey, 2, true, token);
      }
    } catch (e) { Logger.log('تعذّر تفعيل التنفيذ تلقائيًا: ' + e.message); }
  }
  return res;
}

// تبديل حالة "التنفيذ" (العمود B) يدويًا من شاشة كل الحجوزات
function setBookingExecution(bookingKey, value, token) {
  return editBookingField(bookingKey, 2, !!value, token);
}


// [حُذفت هنا] ensureNotesSheet_/getBookingNotes/saveBookingNote — نظام ملاحظات حجوزات قديم
// بشيت منفصل ('ملاحظات الحجوزات')، سبق نظام الملاحظات الحالي واستُبدل به: ملاحظات الحجز
// الآن تُقرأ مباشرة من عمود المصدر U نفسه (انظر case 'note' في cellForBookingCol_ بالواجهة)
// بلا شيت وسيط منفصل. لا استدعاء واحد لهما من أي واجهة — نتيجة المراجعة الشاملة. الشيت
// القديم نفسه (إن كان لا يزال موجودًا بملف الحجوزات) لم يُمَس — الحذف هنا للكود فقط.


// ملاحظة: بناء PDF على الخادم (كان هنا سابقًا) أُزيل — تحويل جوجل الخادمي
// Utilities.newBlob(html).getAs('application/pdf') كان يتجاهل ألوان الخلفية/النص تمامًا
// فيظهر PDF باهتًا لا يطابق الشاشة. استُبدل بالتقاط PrintTemplate.html فعليًا من المتصفح
// (html2pdf.js) في App.html (fetchStatementPdfBlob_) فينقل نفس الألوان المعروضة بدقة.

// ==========================================================
// دفتر الأرصدة الموحَّد — المصدر الوحيد لرصيد أي طرف "حتى تاريخ"
// ==========================================================
// كانت متابعة الأرصدة وبيان الأرصدة (والبوت) تحسب الرصيد بنسخة خاصة بها تطابق الاسم حرفيًا
// (trim فقط)، بينما كشف الحساب يطابق بتسامح (normalizeName_: ى/ي، ة/ه، أ/ا، مسافات مزدوجة،
// تشكيل، رموز خفية). النتيجة: دفعة أو حجز مكتوب باسم فيه اختلاف حرف واحد يدخل رصيد كشف الحساب
// ولا يدخل رصيد متابعة الأرصدة، بل يظهر الحساب نفسه كطرفين منفصلين برصيدين ناقصين. الدفتر هنا
// يبني حركات كل طرف مرة واحدة بنفس قواعد getUnifiedStatement_ حرفيًا (نفس المطابقة، نفس
// استبعاد الملغي والحجز بلا سعر، نفس اتجاه كل نوع دفعة/قيد، نفس تاريخ الدخول، ونفس ترتيب
// الحركات) فيستحيل أن يختلف رصيد "حتى يوم" هنا عن رصيد آخر صف لنفس اليوم في كشف الحساب
// opts: { data, payments (اختياريان للاختبار), onlyName (طرف واحد فقط — أسرع), profiles }
function buildBalanceLedger_(opts) {
  opts = opts || {};
  var onlyNorm = opts.onlyName ? normalizeName_(opts.onlyName) : '';
  var events = {};   // مفتاح الاسم المطبَّع ⇐ [{ts, delta}]
  var variants = {}; // مفتاح الاسم المطبَّع ⇐ {الاسم كما كُتب: عدد مرات ظهوره}
  var order = {};    // أول ظهور لكل كتابة — لكسر التعادل بثبات
  var seq = 0;
  function variant_(k, name) {
    var n = (name || '').toString().trim();
    if (!n) return;
    if (!variants[k]) variants[k] = {};
    variants[k][n] = (variants[k][n] || 0) + 1;
    if (order[n] === undefined) order[n] = seq++;
  }
  function add_(k, ts, delta) { (events[k] = events[k] || []).push({ ts: ts, delta: delta }); }
  function want_(k) { return k && (!onlyNorm || k === onlyNorm); }

  (opts.data || getSourceRowsCached_()).forEach(function (fullRow) {
    var raw = fullRow.slice(0, SOURCE_LAST_COL);
    if (raw[15] === 'لاغي') return;
    var cin = raw[7];
    var d = cin instanceof Date ? new Date(cin.getTime()) : new Date(cin);
    if (isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    var ts = d.getTime();
    var cK = normalizeName_(raw[3]), sK = normalizeName_(raw[14]);
    if (want_(cK)) {
      variant_(cK, raw[3]);
      var sale = computeBookingTotal_(raw, 'client');
      if (sale.hasPrice) add_(cK, ts, sale.value);
    }
    if (want_(sK)) {
      variant_(sK, raw[14]);
      var cost = computeBookingTotal_(raw, 'supplier');
      if (cost.hasPrice) add_(sK, ts, -cost.value);
    }
  });

  (opts.payments || getPaymentsRowsCached_()).forEach(function (p) {
    var k = normalizeName_(p[1]);
    if (!want_(k)) return;
    var pd = p[0] instanceof Date ? new Date(p[0].getTime()) : new Date(p[0]);
    if (isNaN(pd.getTime())) return;
    pd.setHours(0, 0, 0, 0);
    var amt = parseFloat(p[3]) || 0;
    var dir = String(p[2] || '');
    // نفس اتجاه كشف الحساب: "استلمنا منه" و"دائن يدوي" دائن، وكل ما عداهما مدين
    add_(k, pd.getTime(), (dir === 'استلمنا منه' || dir === 'دائن يدوي') ? -amt : amt);
    variant_(k, p[1]);
  });

  // ترتيب زمني ثابت (الحجوزات قبل الدفعات في نفس اليوم، كما في كشف الحساب) + مجاميع تراكمية
  // جاهزة، فيصبح سؤال "الرصيد حتى تاريخ" بحثًا ثنائيًا بدل المرور على كل الحركات لكل طرف
  var ledger = {};
  Object.keys(events).forEach(function (k) {
    var list = events[k].map(function (e, i) { e.i = i; return e; });
    list.sort(function (a, b) { return a.ts - b.ts || a.i - b.i; });
    var tss = [], cum = [], run = 0;
    list.forEach(function (e) { run += e.delta; tss.push(e.ts); cum.push(run); });
    ledger[k] = { ts: tss, cum: cum };
  });

  // الاسم الذي يُعرض للحساب عند تعدّد كتاباته: اسمه المسجَّل في "بيانات الحسابات" إن وُجد،
  // وإلا الكتابة الأكثر تكرارًا في الحجوزات والدفعات
  var profileName = {};
  Object.keys(opts.profiles || {}).forEach(function (n) {
    var k = normalizeName_(n);
    if (k && !profileName[k]) profileName[k] = n;
  });

  return {
    key: function (name) { return normalizeName_(name); },
    noteName: function (name) { var k = normalizeName_(name); if (k) variant_(k, name); return k; },
    balanceAsOf: function (nameOrKey, asOfTs, isKey) {
      var L = ledger[isKey ? nameOrKey : normalizeName_(nameOrKey)];
      if (!L || !L.ts.length) return 0;
      if (asOfTs === undefined || asOfTs === null || asOfTs === Infinity) return L.cum[L.cum.length - 1];
      var lo = 0, hi = L.ts.length - 1, idx = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (L.ts[mid] <= asOfTs) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return idx < 0 ? 0 : L.cum[idx];
    },
    displayName: function (k) {
      if (profileName[k]) return profileName[k];
      var v = variants[k];
      if (!v) return k;
      return Object.keys(v).sort(function (a, b) { return (v[b] - v[a]) || (order[a] - order[b]); })[0];
    }
  };
}

// ==========================================================
// متابعة أرصدة العملاء والموردين — الحجوزات الداخلة مجمّعة حسب
// اليوم ثم حسب العميل/المورد، مع حالة رصيد كل طرف حتى ذلك اليوم
// ==========================================================
// ثغرة صلاحيات كانت موجودة هنا فعليًا (بلا token ولا requirePermission_ إطلاقًا) — أي مستخدم
// (حتى بلا صلاحية "متابعة الأرصدة" أصلًا) كان يمكنه استدعاء هذه الدالة مباشرة ويحصل على كامل
// بيانات أرصدة كل العملاء والموردين، بنفس فئة ثغرة searchBookings التي اكتُشفت وأُصلحت سابقًا
function getArrivalsByDateRange(fromDate, toDate, includeExcluded, token) {
  try {
    requirePermission_(token, 'arrivals', 'view');
    return safeReturn_(getArrivalsByDateRange_(fromDate, toDate, includeExcluded));
  } catch (e) {
    Logger.log('Error in getArrivalsByDateRange: ' + e.message);
    return { days: [], error: e.message };
  }
}

// بيان أرصدة كل العملاء والموردين كما كانت "حتى تاريخ" محدَّد (وليس نطاقًا) — لكل طرف:
// الرصيد المتراكم حتى ذلك التاريخ + تاريخ آخر حجز سكن (تسكين) له حتى نفس التاريخ. نفس منطق
// الترصيد المستخدم بالضبط في getArrivalsByDateRange_ (balanceAsOf) لضمان تطابق الأرقام مع
// كشف الحساب وشاشة متابعة الأرصدة تمامًا، لكن مطبَّق هنا على كل الأطراف دفعة واحدة
// صلاحية "بيان الأرصدة بتاريخ محدد" مستقلة تمامًا عن صلاحية "متابعة الأرصدة" (شاشة
// arrivals) رغم أن زر فتحه موجود داخل نفس الشاشة — مستخدم يملك وصولًا لمتابعة الأرصدة
// لا يرى هذا التقرير تلقائيًا إلا لو مُنح صلاحية "balancesReport" بشكل صريح ومنفصل
function getPartyBalancesAsOf(cutoffDateIso, token) {
  try {
    requirePermission_(token, 'balancesReport', 'view');
    return getPartyBalancesAsOfCore_(cutoffDateIso);
  } catch (e) {
    Logger.log('Error in getPartyBalancesAsOf: ' + e.message);
    return { error: e.message };
  }
}
// نفس المنطق بلا فحص صلاحية الجلسة — للبوت (الذي تحقّق من صلاحيته أصلًا عبر tgRequire_)
// وأي مستدعٍ داخلي آخر، فلا يتكرر منطق الترصيد في مكانين ولا تختلف الأرقام بين الشاشة والبوت
function getPartyBalancesAsOfCore_(cutoffDateIso) {
  {
    // حقل التاريخ فارغ = بلا أي سقف زمني إطلاقًا (الرصيد النهائي الحقيقي شاملًا أي حجز/دفعة
    // بتاريخ مستقبلي أيضًا) — وليس معناه "اليوم" كما كان سابقًا (كان هذا هو الخلط الذي جعل
    // المستخدم يظن أن التاريخ المُدخَل لا يغيّر شيئًا: القيمة الافتراضية "اليوم" كانت في أغلب
    // الحالات مطابقة رقميًا للرصيد النهائي أصلًا لعدم وجود حجوزات مستقبلية بعد، فبدا وكأن
    // التاريخ بلا أثر). عند إدخال تاريخ فعليًا، الرصيد المُحتسَب هو التراكمي حتى ذلك التاريخ
    // بالضبط (نهاية اليوم المحدَّد) — وليس الرصيد النهائي لكشف الحساب الكامل
    var noCutoff = !cutoffDateIso;
    var cutoff = noCutoff ? null : new Date(cutoffDateIso + 'T23:59:59');
    var cutoffTs = noCutoff ? Infinity : cutoff.getTime();
    var cutoffKey = noCutoff ? '' : Utilities.formatDate(cutoff, 'GMT+3', 'yyyy-MM-dd');

    var data = getSourceRowsCached_();
    // حساب مُستبعَد صراحةً ("نوع الحساب" = آخر — رحلة/جهة خارجية بلا حسابات كاملة هنا) لا
    // يظهر في هذا البيان تحديدًا، رغم أن حجوزاته تبقى محتسَبة طبيعيًا لصالح الطرف الآخر في
    // نفس الحجز (لا يُستبعَد من الدفتر نفسه، فقط من قائمة الأطراف المعروضة)
    var accountProfilesMap = getAllAccountProfiles_();
    var ledger = buildBalanceLedger_({ data: data, profiles: accountProfilesMap });
    var excludedNorm = {};
    Object.keys(accountProfilesMap).forEach(function (n) {
      if (isExcludedAccount_(n, accountProfilesMap)) excludedNorm[normalizeName_(n)] = true;
    });

    // كل الأطراف تُفهرَس بالاسم المطبَّع (نفس مطابقة كشف الحساب): كتابتان لنفس الحساب
    // (ى/ي، ة/ه، مسافة زائدة...) = حساب واحد برصيد واحد كامل، لا صفّان برصيدين ناقصين
    var fullHistory = [];
    var clientSet = {}, supplierSet = {};
    data.forEach(function (fullRow) {
      var raw = fullRow.slice(0, SOURCE_LAST_COL);
      if (raw[15] === 'لاغي') return;
      var checkInRaw = raw[7];
      var d = checkInRaw instanceof Date ? new Date(checkInRaw.getTime()) : new Date(checkInRaw);
      if (isNaN(d.getTime())) return;
      d.setHours(0, 0, 0, 0);
      var cK = normalizeName_(raw[3]), sK = normalizeName_(raw[14]);
      if (cK && !excludedNorm[cK]) clientSet[cK] = true;
      if (sK && !excludedNorm[sK]) supplierSet[sK] = true;
      fullHistory.push({
        tDate: d.getTime(), cK: cK, sK: sK,
        hasSale: computeBookingTotal_(raw, 'client').hasPrice,
        hasCost: computeBookingTotal_(raw, 'supplier').hasPrice
      });
    });
    // حسابات مسجَّلة يدويًا (بدون أي حجز بعد) يجب أن تظهر في البيان أيضًا — إلا لو كانت هي
    // نفسها مُستبعَدة صراحةً
    getExtraParties_().forEach(function (p) {
      if (!p.name) return;
      var k = ledger.noteName(p.name);
      if (!k || excludedNorm[k]) return;
      if (p.role === 'supplier') supplierSet[k] = true; else clientSet[k] = true;
    });
    // "الدور الأساسي" (عميل/مورد) من نموذج بيانات الحساب الموحَّد هو المرجع الحاسم: متى حُدِّد
    // صراحةً يظهر الحساب في قسمه فقط ويُزال من القسم الآخر — حتى لو كانت له حجوزات بالصفتين
    // (كان يظهر في الجدولين معًا فيختلّ الفرق النهائي). أما بلا دور محدَّد فيبقى التصنيف
    // الطبيعي المستنتَج من بيانات الحجوزات كما هو.
    Object.keys(accountProfilesMap).forEach(function (name) {
      var p = accountProfilesMap[name];
      var k = normalizeName_(name);
      if (!p.role || !k || excludedNorm[k]) return;
      if (p.role === 'مورد') { supplierSet[k] = true; delete clientSet[k]; }
      else { clientSet[k] = true; delete supplierSet[k]; }
    });

    function lastCheckIn(k, role) {
      var best = null;
      fullHistory.forEach(function (b) {
        if (b.tDate > cutoffTs) return;
        var match = role === 'client' ? b.cK === k : b.sK === k;
        if (match && (best === null || b.tDate > best)) best = b.tDate;
      });
      return best;
    }
    // هل لهذا الطرف أي حجز (حتى تاريخ القطع، أو بلا سقف لو كان الحقل فارغًا) بدون سعر
    // بيع (عميل) أو تكلفة (مورد)؟ — تُستخدَم لتعبئة عمود الملاحظات تلقائيًا بملاحظة تنبيهية
    function hasUnpricedBooking_(k, role) {
      return fullHistory.some(function (b) {
        if (b.tDate > cutoffTs) return false;
        if (role === 'client') return b.cK === k && !b.hasSale;
        return b.sK === k && !b.hasCost;
      });
    }

    function buildList(set, role) {
      return Object.keys(set).map(function (k) {
        var lc = lastCheckIn(k, role);
        var lcKey = lc !== null ? Utilities.formatDate(new Date(lc), 'GMT+3', 'yyyy-MM-dd') : '';
        var bal = ledger.balanceAsOf(k, cutoffTs, true);
        return {
          name: ledger.displayName(k),
          balance: bal,               // رقم خام — شاشة البرنامج تنسّقه بنفسها (parseFloat/Math.round)
          // نص جاهز للعرض: مجبور لأقرب صحيح + فاصل آلاف + كلمة مدين/دائن. أُضيف لأن أي مستهلك
          // يعرض الرقم كما هو (البوت مثلاً) كان يُظهر كسورًا مثل 16860.37305657477، وأسوأ:
          // يفشل في تمييز مدين من دائن لأن الرقم الخام لا يحمل الكلمة أصلاً فيَعُدّه دائنًا دائمًا
          balanceFmt: fmtWithStatus_(bal),
          balanceNum: bal,
          lastCheckIn: lc !== null ? Utilities.formatDate(new Date(lc), 'GMT+3', 'dd/MM/yyyy') : '',
          isOnCutoffDate: !noCutoff && lcKey === cutoffKey,
          hasUnpricedBooking: hasUnpricedBooking_(k, role)
        };
      }).sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    }

    return safeReturn_({
      clients: buildList(clientSet, 'client'),
      suppliers: buildList(supplierSet, 'supplier'),
      noCutoff: noCutoff,
      cutoffDisp: noCutoff ? '' : Utilities.formatDate(cutoff, 'GMT+3', 'dd/MM/yyyy'),
      cutoffKey: cutoffKey
    });
  }
}

function getArrivalsByDateRange_(fromDate, toDate, includeExcluded) {
  var data = getSourceRowsCached_();
  var safeFrom = fromDate ? new Date(fromDate) : null; if (safeFrom) safeFrom.setHours(0, 0, 0, 0);
  var safeTo = toDate ? new Date(toDate) : null; if (safeTo) safeTo.setHours(23, 59, 59, 999);
  var accountProfilesMap_ = getAllAccountProfiles_();
  // الرصيد من دفتر الأرصدة الموحَّد (نفس قواعد كشف الحساب حرفيًا، ومنها مطابقة الاسم المتسامحة)
  // — كانت هذه الشاشة تحسبه بنسخة خاصة تطابق الاسم حرفيًا، فيختلف رقمها عن كشف الحساب
  var ledger = buildBalanceLedger_({ data: data, profiles: accountProfilesMap_ });
  var excludedNorm = {};
  Object.keys(accountProfilesMap_).forEach(function (n) {
    if (isExcludedAccount_(n, accountProfilesMap_)) excludedNorm[normalizeName_(n)] = true;
  });

  var byDate = {}, dayEndTs = {};
  // كل تاريخ الحجوزات (غير الملغاة) بصرف النظر عن الفترة — لازم لعدّ الحجوزات بلا سعر لكل طرف
  var fullHistory = [];

  data.forEach(function (fullRow) {
    var raw = fullRow.slice(0, SOURCE_LAST_COL);
    var city = fullRow[SOURCE_LAST_COL];
    if (raw[15] === 'لاغي') return;
    var checkInRaw = raw[7];
    var d = checkInRaw instanceof Date ? new Date(checkInRaw.getTime()) : new Date(checkInRaw);
    if (isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);

    var costCalc0 = computeBookingTotal_(raw, 'supplier'); var hasCost = costCalc0.hasPrice;
    var saleCalc0 = computeBookingTotal_(raw, 'client'); var hasSale = saleCalc0.hasPrice;
    var client = (raw[3] || '').toString().trim();
    var supplier = (raw[14] || '').toString().trim();

    fullHistory.push({
      tDate: d.getTime(), cK: normalizeName_(client), sK: normalizeName_(supplier), qaid: raw[0],
      hasCost: hasCost, hasSale: hasSale
    });

    if (safeFrom && d.getTime() < safeFrom.getTime()) return;
    if (safeTo && d.getTime() > safeTo.getTime()) return;

    var key = Utilities.formatDate(d, 'GMT+3', 'yyyy-MM-dd');
    if (!byDate[key]) {
      byDate[key] = [];
      // نهاية نفس اليوم محسوبة من تاريخ الحجز نفسه (لا بإعادة تحليل نص التاريخ) — فلا يمكن
      // أن يزحف حدّ القطع يومًا للأمام/للخلف لو اختلفت منطقة السكربت الزمنية عن GMT+3
      var end = new Date(d.getTime()); end.setHours(23, 59, 59, 999);
      dayEndTs[key] = end.getTime();
    }
    var nights = parseInt(raw[9]) || 0;
    var totalRooms = (parseInt(raw[10]) || 0) + (parseInt(raw[11]) || 0) + (parseInt(raw[12]) || 0) + (parseInt(raw[13]) || 0);
    byDate[key].push({
      bookingKey: bookingKey_(raw, city),
      client: client, supplier: supplier, hotel: raw[4],
      checkIn: Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy'), nights: nights,
      checkOut: Utilities.formatDate(new Date(d.getTime() + nights * 86400000), 'GMT+3', 'dd/MM/yyyy'),
      hotelRef: raw[17], qaid: raw[0], totalRooms: totalRooms,
      cost: hasCost ? costCalc0.value : null, hasCost: hasCost,
      sale: hasSale ? saleCalc0.value : null, hasSale: hasSale,
      dateKey: key
    });
  });

  // يفحص هل لهذا الطرف (بصفته عميل أو مورد) أي حجز آخر ضمن نفس الفترة المعروضة حاليًا في هذه
  // الشاشة (من/إلى المُختارين) بدون سعر بيع/تكلفة — وليس أي حجز في كل تاريخه بصرف النظر عن
  // الفترة (هذا كان الخطأ السابق: حجز مستقبلي خارج الفترة المعروضة كان يُحتسب "سابقًا" خطأً،
  // فتظهر الرسالة رغم عدم وجود أي حجز ناقص فعليًا ضمن الفترة المعروضة على الشاشة)
  // حجز بلا سعر لكنه مسجَّل برقم قيد يُعتبر مكتمل البيانات (القيد يعني أن الحجز مُوثَّق/مُسوَّى
  // فعليًا خارج التطبيق) — لا يُحتسَب "ناقصًا" في هذا التحذير ولا في أي عدّاد/شارة أخرى مشابهة،
  // رغم بقائه مستبعَدًا من احتساب الرصيد المالي نفسه (القيد لا يخبرنا بالقيمة الفعلية)
  function countHistoricalMissing_(k, role) {
    var count = 0;
    fullHistory.forEach(function (b) {
      if (safeFrom && b.tDate < safeFrom.getTime()) return;
      if (safeTo && b.tDate > safeTo.getTime()) return;
      if (b.qaid) return;
      if (role === 'client' && b.cK === k && !b.hasSale) count++;
      if (role === 'supplier' && b.sK === k && !b.hasCost) count++;
    });
    return count;
  }

  function groupArrivalsFast_(bookings, role, asOfTs) {
    var map = {};
    bookings.forEach(function (b) {
      var k = normalizeName_(role === 'client' ? b.client : b.supplier);
      if (!k) return;
      // حساب مُستبعَد صراحةً ("نوع الحساب" = آخر) من متابعة الأرصدة وبيان الأرصدة تحديدًا —
      // يبقى ظاهرًا بشاشة كل الحجوزات وكشف الحساب كما هو دائمًا؛ الاستبعاد هنا فقط.
      // includeExcluded=true (شيك بوكس "عرض كل الحسابات ذات الدخول" في الشاشة) يتجاوز هذا
      // الاستبعاد مؤقتًا عند الطلب فقط، دون تغيير الإعداد الافتراضي نفسه
      if (!includeExcluded && excludedNorm[k]) return;
      // التجميع بالاسم المطبَّع: كتابتان لنفس الحساب في نفس اليوم = كارت واحد برصيد واحد
      if (!map[k]) map[k] = { key: k, name: ledger.displayName(k), items: [], total: 0, missing: false };
      var g = map[k];
      g.items.push(b);
      var has = role === 'client' ? b.hasSale : b.hasCost;
      var val = role === 'client' ? b.sale : b.cost;
      if (has) g.total += val; else if (!b.qaid) g.missing = true; // له رقم قيد = بياناته مكتملة رغم غياب السعر
    });
    return Object.keys(map).map(function (k) {
      var g = map[k];
      var runningVal = ledger.balanceAsOf(k, asOfTs, true);
      // بلغة العمل لا بالمصطلح المحاسبي (طلب صريح): "مستحق عليه/رصيد له" للعميل و
      // "مستحق له/رصيد لنا" للمورد — نفس دالة الصياغة المستخدَمة في البوت حرفيًا فلا
      // يختلف وصف الرصيد نفسه بين شاشة ورسالة
      g.balance = tgBalanceText_(runningVal, role);
      g.balanceNum = Math.round(runningVal);
      // العميل: مدين(له علينا مستحق) = أحمر يحتاج تحصيل | دائن/صفر = أخضر مسدد
      // المورد: دائن(مطلوب سداده له) = أحمر | مدين/صفر(رصيد فائض لصالحنا) = أخضر
      if (role === 'client') g.status = runningVal > 0 ? 'bad' : 'ok';
      else g.status = runningVal < 0 ? 'bad' : 'ok';
      g.historicalMissing = countHistoricalMissing_(k, role);
      if (g.missing || g.historicalMissing > 0) g.status = 'warn';
      delete g.key;
      return g;
    }).sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
  }

  var days = Object.keys(byDate).sort().map(function (key) {
    var bookings = byDate[key];
    var asOfTs = dayEndTs[key];
    return {
      dateKey: key,
      dateDisp: Utilities.formatDate(new Date(key + 'T00:00:00'), 'GMT+3', 'dd/MM/yyyy'),
      count: bookings.length,
      clientGroups: groupArrivalsFast_(bookings, 'client', asOfTs),
      supplierGroups: groupArrivalsFast_(bookings, 'supplier', asOfTs)
    };
  });
  return { days: days };
}


// ==========================================================
// استيراد الدفعات السابقة بشكل مجمّع من الأوراق القديمة (شيت
// لكل عميل/مورد، نطاق الدفعات U6:Y5000) إلى "سجل الدفعات" المركزي.
// لا يحذف ولا يعدّل شيئًا في الأوراق القديمة — نسخ فقط.
// ==========================================================
var SYSTEM_SHEET_NAMES_ = { 'القائمة': 1, 'الحجوزات': 1, 'سجل تعديلات الحجوزات': 1, 'سجل الدفعات': 1 };

function buildPartyRoleMap_() {
  var map = {};
  getSourceRowsCached_().forEach(function (raw) {
    var client = (raw[3] || '').toString().trim();
    if (client) { map[client] = map[client] || {}; map[client].client = true; }
    var supplier = (raw[14] || '').toString().trim();
    if (supplier) { map[supplier] = map[supplier] || {}; map[supplier].supplier = true; }
  });
  return map;
}

function getImportedLegacySheets_() {
  var raw = PropertiesService.getScriptProperties().getProperty('IMPORTED_LEGACY_SHEETS');
  return raw ? JSON.parse(raw) : [];
}
function markLegacySheetsImported_(names) {
  var existing = getImportedLegacySheets_();
  names.forEach(function (n) { if (existing.indexOf(n) === -1) existing.push(n); });
  PropertiesService.getScriptProperties().setProperty('IMPORTED_LEGACY_SHEETS', JSON.stringify(existing));
}

// استيراد/مزامنة الدفعات القديمة صلاحية مدير فقط (وضع مؤقت لحين انتهاء نقل كل الأوراق
// القديمة) — requireAdmin_ يرمي استثناء لو الجلسة غير صالحة أو المستخدم ليس مديرًا
function scanLegacyPaymentSheets(token) {
  requireAdmin_(token);
  var ss = getSS_();
  var roleMap = buildPartyRoleMap_();
  var imported = getImportedLegacySheets_();
  var results = [];

  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (SYSTEM_SHEET_NAMES_[name]) return;
    var lastRow = sh.getLastRow();
    if (lastRow < 6) return;

    var numRows = Math.min(lastRow, 5000) - 5;
    var data = sh.getRange(6, 21, numRows, 3).getValues(); // U:W = المبلغ, البيان, التاريخ
    var count = 0, total = 0;
    data.forEach(function (row) {
      var amount = parseFloat(row[0]) || 0;
      if (row[0] !== '' && row[1] !== 'الإجمالي' && row[2]) { count++; total += amount; }
    });
    if (count === 0) return;

    var roles = roleMap[name] || {};
    var role = (roles.client && roles.supplier) ? 'both' : (roles.client ? 'client' : (roles.supplier ? 'supplier' : 'unknown'));
    results.push({
      sheetName: name, count: count, total: total, role: role,
      suggestedDirection: role === 'supplier' ? 'out' : 'in',
      ambiguous: role === 'both' || role === 'unknown',
      imported: imported.indexOf(name) !== -1
    });
  });
  return results;
}

function importLegacyPayments(sheetNames, token) {
  try {
    var admin = requireAdmin_(token);
    var ss = getSS_();
    var paySheet = ensurePaymentsSheet_();
    var roleMap = buildPartyRoleMap_();
    var importedTotal = 0, sheetsCount = 0;
    var now = new Date();

    sheetNames.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      var lastRow = sh.getLastRow();
      if (lastRow < 6) return;

      var numRows = Math.min(lastRow, 5000) - 5;
      var data = sh.getRange(6, 21, numRows, 5).getValues(); // U:Y = المبلغ, البيان, التاريخ, (X غير مستخدم), رقم القيد
      var roles = roleMap[name] || {};
      var direction = roles.supplier && !roles.client ? 'دفعنا له' : 'استلمنا منه';

      var rows = [];
      data.forEach(function (row) {
        var amount = parseFloat(row[0]) || 0;
        if (row[0] !== '' && row[1] !== 'الإجمالي' && row[2]) {
          var d = row[2] instanceof Date ? row[2] : new Date(row[2]);
          // ملاحظة نظيفة بدون أي إضافة نصية — "مستورد من الشيت القديم" أصبحت تلميحًا (tooltip)
          // في الشاشة فقط عبر علم منفصل (العمود التاسع)، فلا تظهر أبدًا في الطباعة/التصدير
          rows.push([d, name, direction, amount, (row[1] || ''), row[4] || '', now, Utilities.getUuid(), true]);
          importedTotal++;
        }
      });
      if (rows.length > 0) {
        paySheet.getRange(paySheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
        sheetsCount++;
      }
    });

    markLegacySheetsImported_(sheetNames);
    logChange_(admin, 'استيراد دفعات قديمة', sheetNames.join(', '), 'استيراد ' + importedTotal + ' دفعة من ' + sheetsCount + ' ورقة', '', '');
    return { ok: true, imported: importedTotal, sheets: sheetsCount };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// مزامنة عند الطلب: تفحص فقط الأوراق القديمة التي سبق استيرادها من قبل (زر "فحص
// الأوراق"/"استيراد المحدد")، وتضيف أي دفعة جديدة سُجِّلت فيها بعد ذلك ولم تُنقل
// بعد إلى سجل الدفعات — بدون تكرار أي دفعة سبق نقلها (مطابقة بالاسم+التاريخ+المبلغ)
function syncLegacyPayments(token) {
  try {
    requireAdmin_(token);
    var ss = getSS_();
    var paySheet = ensurePaymentsSheet_();
    var roleMap = buildPartyRoleMap_();
    var imported = getImportedLegacySheets_();
    if (imported.length === 0) return { ok: true, added: 0, sheets: 0 };

    var existingSig = {};
    var lastRow = paySheet.getLastRow();
    if (lastRow > 1) {
      paySheet.getRange(2, 1, lastRow - 1, 4).getValues().forEach(function (r) {
        var d = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
        if (isNaN(d)) return;
        existingSig[r[1] + '|' + d + '|' + (parseFloat(r[3]) || 0)] = true;
      });
    }

    var newRows = [], sheetsWithNew = {};
    var now = new Date();
    imported.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      var lr = sh.getLastRow();
      if (lr < 6) return;
      var numRows = Math.min(lr, 5000) - 5;
      var data = sh.getRange(6, 21, numRows, 5).getValues(); // U:Y = المبلغ, البيان, التاريخ, (X غير مستخدم), رقم القيد
      var roles = roleMap[name] || {};
      var direction = roles.supplier && !roles.client ? 'دفعنا له' : 'استلمنا منه';
      data.forEach(function (row) {
        var amount = parseFloat(row[0]) || 0;
        if (row[0] === '' || row[1] === 'الإجمالي' || !row[2]) return;
        var d = row[2] instanceof Date ? row[2] : new Date(row[2]);
        if (isNaN(d.getTime())) return;
        var sig = name + '|' + d.getTime() + '|' + amount;
        if (existingSig[sig]) return;
        existingSig[sig] = true; // يمنع إضافة نفس الصف مرتين لو تكرر داخل نفس الورقة
        newRows.push([d, name, direction, amount, (row[1] || ''), row[4] || '', now, Utilities.getUuid(), true]);
        sheetsWithNew[name] = true;
      });
    });

    if (newRows.length > 0) paySheet.getRange(paySheet.getLastRow() + 1, 1, newRows.length, 9).setValues(newRows);
    return { ok: true, added: newRows.length, sheets: Object.keys(sheetsWithNew).length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// ==========================================================
// كشف حساب موحّد للعملاء والموردين — يتعرّف تلقائيًا على دور
// الطرف (عميل/مورد/الاثنين معًا) من الحجوزات في المصدر الخارجي مباشرة،
// ويدمج معه سجل الدفعات المركزي الجديد بدل الشيتات الفردية القديمة.
// ==========================================================
var PAYMENTS_SHEET_NAME = 'سجل الدفعات';

function fmtMoney_(num) {
  if (num === 0 || !num) return "0";
  var absNum = Math.abs(num);
  var formatted = (absNum % 1 !== 0) ? absNum.toFixed(1) : absNum.toString();
  formatted = parseFloat(formatted).toLocaleString('en-US');
  return num < 0 ? "(" + formatted + ")" : formatted;
}
// نفس fmtMoney_ لكن مقرَّبة لأقرب رقم صحيح بدون أي كسور — للإجماليات والدفعات فقط (مدين/دائن/
// الرصيد/إجماليات الحركات في كشف الحساب)، وليس لأسعار الغرفة الفردية (سعر التكلفة/البيع لكل
// نوع غرفة في نص وصف الحجز) التي تبقى تستخدم fmtMoney_ بكسورها كما هي
function fmtMoneyRounded_(num) {
  if (num === 0 || !num) return "0";
  var formatted = Math.round(Math.abs(num)).toLocaleString('en-US');
  return num < 0 ? "(" + formatted + ")" : formatted;
}
function fmtWithStatus_(num) {
  var status = num > 0 ? " مدين" : (num < 0 ? " دائن" : "");
  return fmtMoneyRounded_(num) + status;
}

// يحسب إجمالي التكلفة (كمورد) أو البيع (كعميل) لحجز مباشرة من عدد كل نوع غرفة × سعرها ×
// عدد الليالي، بدل قراءة عمود إجمالي جاهز من ملف المصدر (عمودا AE/AF) — طلب صريح من
// المستخدم: كل الإجماليات المالية تُحسب داخل البرنامج نفسه من الأسعار والأعداد والليالي،
// وليست مجرد استيراد لقيمة معادلة خارجية قد لا تُطبَّق نفس المعادلة دائمًا. هذه الدالة
// نقطة الحساب الوحيدة (مصدر موحّد) المستخدمة في كل مكان يحتاج تكلفة/بيع حجز — كشف الحساب،
// شاشة كل الحجوزات، متابعة الأرصدة، وبيان الأرصدة بتاريخ محدد — بدل تكرار نفس المنطق أربع مرات.
// hasPrice=false يعني: يوجد نوع غرفة محجوز (عدد > 0) بدون سعر مُدخَل له — الحجز يُستبعد من
// حسابات الرصيد (بدل احتسابه خطأً بقيمة ناقصة) تمامًا كما كان السلوك السابق يفعل لخلية فارغة
function computeBookingTotal_(raw, role) {
  var nights = parseFloat(raw[9]) || 0;
  var counts = [raw[10], raw[11], raw[12], raw[13]];
  var priceCols = (role === 'client') ? [25, 26, 27, 28] : [21, 22, 23, 24];
  var perNight = 0, anyRoom = false, missingPrice = false;
  for (var i = 0; i < 4; i++) {
    var cnt = parseFloat(counts[i]) || 0;
    if (cnt <= 0) continue;
    anyRoom = true;
    var price = parseFloat(raw[priceCols[i]]);
    if (!isFinite(price)) { missingPrice = true; continue; }
    perNight += cnt * price;
  }
  var hasPrice = anyRoom && !missingPrice;
  return { value: hasPrice ? perNight * nights : 0, hasPrice: hasPrice };
}

// يبني وصف الحجز والقيمة المالية بحسب دور الطرف في هذا الحجز (عميل أو مورد)
function describeBooking_(raw, role, city) {
  var checkInRaw = raw[7];
  var tDateObj = checkInRaw instanceof Date ? new Date(checkInRaw.getTime()) : new Date(checkInRaw);
  tDateObj.setHours(0, 0, 0, 0);
  if (isNaN(tDateObj.getTime())) return null;

  var nights = parseInt(raw[9]) || 0;
  var endDate = new Date(tDateObj.getTime() + nights * 24 * 60 * 60 * 1000);
  var roomCols = (role === 'client') ? [25, 26, 27, 28] : [21, 22, 23, 24];
  var roomDetails = [];
  if (raw[10] > 0) roomDetails.push(raw[10] + " دابل × " + fmtMoney_(raw[roomCols[0]]) + " ريال");
  if (raw[11] > 0) roomDetails.push(raw[11] + " ثلاثي × " + fmtMoney_(raw[roomCols[1]]) + " ريال");
  if (raw[12] > 0) roomDetails.push(raw[12] + " رباعي × " + fmtMoney_(raw[roomCols[2]]) + " ريال");
  if (raw[13] > 0) roomDetails.push(raw[13] + " خماسي × " + fmtMoney_(raw[roomCols[3]]) + " ريال");
  var nightTxt = (nights >= 3 && nights <= 10) ? "ليالي" : "ليلة";

  var note = "حجز " + (raw[4] || '') + " من " + Utilities.formatDate(tDateObj, 'GMT+3', 'dd/MM') +
             " إلى " + Utilities.formatDate(endDate, 'GMT+3', 'dd/MM') +
             " ( " + roomDetails.join(" + ") + " ) لمدة (" + nights + ") " + nightTxt;

  var totalCalc = computeBookingTotal_(raw, role);
  var hasPrice = totalCalc.hasPrice;
  var val = totalCalc.value;

  // المرجع: رقم حجز الفندق (كمورد) أو رقم الحجز الداخلي (كعميل) — منفصل تمامًا عن رقم القيد
  var ref = role === 'supplier' ? (raw[17] || '') : (raw[2] || '');
  var counterparty = role === 'client' ? (raw[14] || '') : (raw[3] || '');

  return {
    tDate: tDateObj.getTime(), note: note, val: val, hasPrice: hasPrice,
    hotelRef: raw[17], qaid: raw[0], innerRef: raw[2], ref: ref, counterparty: counterparty,
    // تاريخا الدخول/الخروج لعمودي كشف الحساب الاختياريين. الخروج من عمود المصدر الفعلي (I)
    // متى وُجد، وإلا يُحسب من الليالي — نفس منطق نص البيان أعلاه بالضبط
    checkInTs: tDateObj.getTime(),
    checkOutTs: (function () {
      var co = raw[8] instanceof Date ? new Date(raw[8].getTime()) : (raw[8] ? new Date(raw[8]) : null);
      if (co && !isNaN(co.getTime())) { co.setHours(0, 0, 0, 0); return co.getTime(); }
      return endDate.getTime();
    })(),
    key: city ? bookingKey_(raw, city) : null
  };
}

// نسخة داخلية بلا صلاحية — تُستخدَم من دوال خادم أخرى (مثل getAccountProfilesList) تفرض
// صلاحيتها الخاصة أصلًا قبل استدعائها
function getUnifiedPartyList_() {
  var set = {};
  getSourceRowsCached_().forEach(function (raw) {
    var client = (raw[3] || '').toString().trim(); if (client) set[client] = true;   // العمود D
    var supplier = (raw[14] || '').toString().trim(); if (supplier) set[supplier] = true; // العمود O
  });
  getExtraParties_().forEach(function (p) { if (p.name) set[p.name] = true; });
  return Object.keys(set).sort();
}
// نقطة الدخول العامة — كانت بلا أي صلاحية إطلاقًا (ثغرة: قائمة كل أسماء العملاء والموردين
// كاملة، بيانات عمل حساسة، متاحة لأي زائر بصرف النظر عن تسجيل دخوله) — نتيجة المراجعة الشاملة
function getUnifiedPartyList(token) {
  requireSession_(token);
  return getUnifiedPartyList_();
}

// خريطة "دور" كل طرف (عميل/مورد/both) — تغذّي الاقتراح الافتراضي لاتجاه الدفعة عند تسجيلها
// (مورد ⇒ الافتراضي "دفعنا له"، عميل ⇐ "استلمنا منه"). نفس منطق تصنيف متابعة/بيان الأرصدة
// بالضبط: الدور الأساسي المحفوظ صراحةً في "بيانات الحسابات" هو المرجع الحاسم إن وُجد، وإلا
// فالتصنيف الطبيعي المستنتَج من عمود العميل/المورد في الحجوزات؛ ومن ظهر بالصفتين بلا دور
// محدَّد صراحةً يُعاد كـ"both" فلا يُقترَح له اتجاه افتراضي ولا يُنبَّه عند أي اختيار
function getPartyRoleMap_() {
  var clientSet = {}, supplierSet = {};
  getSourceRowsCached_().forEach(function (raw) {
    var client = (raw[3] || '').toString().trim();
    var supplier = (raw[14] || '').toString().trim();
    if (client) clientSet[client] = true;
    if (supplier) supplierSet[supplier] = true;
  });
  getExtraParties_().forEach(function (p) {
    if (!p.name) return;
    if (p.role === 'supplier') supplierSet[p.name] = true; else clientSet[p.name] = true;
  });
  var accountProfilesMap = getAllAccountProfiles_();
  Object.keys(accountProfilesMap).forEach(function (name) {
    var p = accountProfilesMap[name];
    if (!p.role) return;
    if (p.role === 'مورد') { supplierSet[name] = true; delete clientSet[name]; }
    else { clientSet[name] = true; delete supplierSet[name]; }
  });
  var map = {};
  Object.keys(clientSet).forEach(function (n) { map[n] = supplierSet[n] ? 'both' : 'عميل'; });
  Object.keys(supplierSet).forEach(function (n) { if (!map[n]) map[n] = 'مورد'; });
  return map;
}
function getPartyRoleMap(token) {
  try {
    requireSession_(token);
    return safeReturn_(getPartyRoleMap_());
  } catch (e) { return safeReturn_({ error: e.message }); }
}

// أسماء الفنادق الفريدة المسجَّلة فعليًا في الحجوزات — لتغذية البحث التنبؤي لحقل "الفندق"
// في فلتر شاشة كل الحجوزات (بدل الكتابة الحرة التي قد لا تطابق الاسم المسجَّل بالضبط)
// نتيجة المراجعة الشاملة: أُضيفت هنا صلاحية جلسة (لم تكن موجودة إطلاقًا)
function getDistinctHotels(token) {
  try {
    requireSession_(token);
    var set = {};
    getSourceRowsCached_().forEach(function (r) {
      var v = (r[4] || '').toString().trim(); // العمود E
      if (v) set[v] = true;
    });
    return safeReturn_(Object.keys(set).sort());
  } catch (e) {
    Logger.log('Error in getDistinctHotels: ' + e.message);
    return [];
  }
}

// ==========================================================
// أداة تشخيص: لماذا لا يظهر كشف حساب لاسم معيّن؟ تقارن الاسم المُدخَل
// (بعد توحيده عبر normalizeName_) مع كل الأسماء الموجودة فعليًا في
// الحجوزات وفي الدفعات، وتُرجع الأشكال الخام (الحرفية) المطابقة —
// حتى تظهر أي فروق خفية (مسافة زائدة، حرف مختلف) بمقارنة النص الخام
// المعروض مع ما كتبه المستخدم فعليًا.
// ==========================================================
// أداة تشخيص داخلية (لم تُستدعَ من أي واجهة قط) — قُيِّدت بصلاحية المدير نتيجة المراجعة
// الشاملة بدل تركها بلا أي صلاحية، رغم أنها لم تكن مصدر تسريب بيانات جديد بذاته
function debugPartyName(name, token) {
  try {
    requireAdmin_(token);
    var norm = normalizeName_(name);
    var bookingGroups = {}; // normalized -> { rawString: count }
    var activeMatches = 0, cancelledMatches = 0;
    var srcRows = getSourceRowsCached_();
    srcRows.forEach(function (raw) {
      [raw[3], raw[14]].forEach(function (v) {
        v = (v || '').toString().trim();
        if (!v) return;
        var n = normalizeName_(v);
        bookingGroups[n] = bookingGroups[n] || {};
        bookingGroups[n][v] = (bookingGroups[n][v] || 0) + 1;
        if (n === norm) { if (raw[15] === 'لاغي') cancelledMatches++; else activeMatches++; }
      });
    });

    var paymentGroups = {};
    var pSheet = ensurePaymentsSheet_();
    if (pSheet && pSheet.getLastRow() > 1) {
      pSheet.getRange(2, 2, pSheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
        var v = (r[0] || '').toString().trim();
        if (!v) return;
        var n = normalizeName_(v);
        paymentGroups[n] = paymentGroups[n] || {};
        paymentGroups[n][v] = (paymentGroups[n][v] || 0) + 1;
      });
    }

    // أقرب الأسماء المرشحة لو لم يوجد تطابق تام — نفس أول 4 أحرف موحّدة على الأقل
    var suggestions = [];
    if (!bookingGroups[norm] && !paymentGroups[norm] && norm.length >= 2) {
      var prefix = norm.slice(0, Math.min(4, norm.length));
      var seen = {};
      Object.keys(bookingGroups).concat(Object.keys(paymentGroups)).forEach(function (n) {
        if (n.indexOf(prefix) === 0 && n !== norm && !seen[n]) {
          seen[n] = true;
          suggestions.push(Object.keys(bookingGroups[n] || paymentGroups[n] || {})[0] || n);
        }
      });
    }

    // مقارنة مباشرة مع ما سيعرضه كشف الحساب فعليًا لنفس الاسم — لو التطابق هنا موجود لكن
    // الكشف الفعلي فارغ، فالسبب شيء آخر غير المطابقة نفسها (مثل استبعاد الحجوزات الملغاة)
    var stmt = getUnifiedStatement_(name, '', '');

    return {
      input: name,
      normalized: norm,
      bookingMatches: Object.keys(bookingGroups[norm] || {}),
      activeBookingCount: activeMatches,
      cancelledBookingCount: cancelledMatches,
      paymentMatches: Object.keys(paymentGroups[norm] || {}),
      suggestions: suggestions.slice(0, 8),
      statementRoles: stmt.roles,
      statementRowCount: (stmt.rows || []).length
    };
  } catch (e) {
    return { error: e.message };
  }
}

// كان يقرأ عمود المعرّفات كاملاً في كل نداء (وكشف الحساب وحده يستدعيه 3 مرات) — نداء شبكي
// مكلف بلا داعٍ. الآن: فحص التعبئة يجري مرة واحدة لكل تنفيذ فقط عبر علامة PAYMENTS_BACKFILL_DONE_
// العمود العاشر (معرّف الارتباط) يربط صفّي الدفعة المزدوجة برباط حقيقي بدل الاعتماد على
// علامة نصية داخل البيان: البيان صار مصاغًا لكل طرف على حدة وقابلًا لتعديل المستخدم، فأي
// ربط مبني عليه يضيع بأول تعديل — وبضياعه يستحيل تعديل الطرفين معًا أو كشف اختلال التوازن
var PAYMENTS_COLS_ = 10;
var PAYMENTS_BACKFILL_DONE_ = false;
function ensurePaymentsSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(PAYMENTS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PAYMENTS_SHEET_NAME);
    sh.getRange(1, 1, 1, PAYMENTS_COLS_).setValues([['التاريخ', 'اسم الطرف', 'الاتجاه', 'المبلغ', 'ملاحظة', 'رقم القيد', 'وقت الإدخال', 'معرّف', 'مستورد من شيت قديم؟', 'معرّف الارتباط']]);
    sh.setFrozenRows(1);
    PAYMENTS_BACKFILL_DONE_ = true;
    return sh;
  }
  if (PAYMENTS_BACKFILL_DONE_) return sh;   // فُحص مرة في هذا التنفيذ — لا نعيد قراءة العمود
  PAYMENTS_BACKFILL_DONE_ = true;
  // ترحيل ورقة قائمة أُنشئت بتسعة أعمدة: نوسّعها ونكتب ترويسة العمود العاشر مرة واحدة.
  // بدون هذا يرمي getRange(..., 10) خطأ "النطاق يتجاوز حدود الورقة" في كل قراءة لاحقة
  if (sh.getMaxColumns() < PAYMENTS_COLS_) sh.insertColumnsAfter(sh.getMaxColumns(), PAYMENTS_COLS_ - sh.getMaxColumns());
  if (!sh.getRange(1, PAYMENTS_COLS_).getValue()) sh.getRange(1, PAYMENTS_COLS_).setValue('معرّف الارتباط');
  // تعبئة المعرّف تلقائيًا لأي صف قديم لا يملكه (دفعات مستوردة قديمًا نُقلت بدون UUID) — مرة
  // واحدة لكل صف في تاريخ الملف كله، فبعد أول تنفيذ يكتب المعرّفات لا يتبقى أي صف ناقص
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var ids = sh.getRange(2, 8, lastRow - 1, 1).getValues();
    var updates = [], hasMissing = false;
    for (var i = 0; i < ids.length; i++) {
      if (!ids[i][0]) { updates.push([Utilities.getUuid()]); hasMissing = true; }
      else updates.push([ids[i][0]]);
    }
    if (hasMissing) sh.getRange(2, 8, updates.length, 1).setValues(updates);
  }
  return sh;
}
// قراءة كل صفوف الدفعات مرة واحدة لكل تنفيذ (memo) — كشف الحساب كان يقرأ الشيت 3 مرات في
// النداء الواحد (مرة للحركات، مرة للرصيد التراكمي، ومرة داخل ensurePaymentsSheet_)
var PAYMENTS_MEMO_ = null;
function invalidatePaymentsMemo_() { PAYMENTS_MEMO_ = null; }
function getPaymentsRowsCached_() {
  if (PAYMENTS_MEMO_) return PAYMENTS_MEMO_;
  var sh = ensurePaymentsSheet_();
  if (!sh || sh.getLastRow() < 2) { PAYMENTS_MEMO_ = []; return PAYMENTS_MEMO_; }
  PAYMENTS_MEMO_ = sh.getRange(2, 1, sh.getLastRow() - 1, PAYMENTS_COLS_).getValues();
  return PAYMENTS_MEMO_;
}

var DEFAULT_PAYMENT_NOTE = 'دفعة من حساب حجوزات سكن';

// يقبل 'in'/'out' المختصرين أو التسمية العربية الكاملة مباشرة (بما فيها أنواع البنود اليدوية)
function resolveDirectionLabel_(direction) {
  if (direction === 'in') return 'استلمنا منه';
  if (direction === 'out') return 'دفعنا له';
  return direction;
}

// يحوّل نص مبلغ إلى رقم بتسامح: يزيل فواصل الآلاف (10,000 أو 10٬000) والمسافات، ويحوّل
// الأرقام العربية — بدون هذا، parseFloat("10,000") يتوقف عند أول فاصلة ويُرجع 10 فقط (نفس
// عطل لصق مبلغ منسَّق بفاصلة آلاف من الإكسل/الواتساب في خانة المبلغ)
function parseAmountLoose_(v) {
  if (v === null || v === undefined || v === '') return NaN;
  var s = tgNormalizeDigits_(String(v).trim()).replace(/[,٬\s]/g, '');
  return parseFloat(s);
}
// payment = {partyName, date(yyyy-mm-dd), direction:'in'|'out'|<تسمية كاملة>, amount, note, qaid,
//   id (اختياري — لإعادة إنشاء دفعة محذوفة بنفس معرّفها الأصلي عند "تراجع" عن حذف، بدل توليد
//   معرّف جديد لا يطابق أي مرجع سابق), legacyImported (اختياري)}
function registerPayment(payment, token) {
  try {
    var actingUser = requirePermission_(token, 'payments', 'add');
    if (!payment.partyName) throw new Error('اسم الطرف مطلوب');
    var amount = parseAmountLoose_(payment.amount);
    if (!amount || amount <= 0) throw new Error('المبلغ غير صحيح');
    var sh = ensurePaymentsSheet_();
    var d = payment.date ? new Date(payment.date) : new Date();
    var id = payment.id || Utilities.getUuid();
    sh.appendRow([
      d, cellSafe_(payment.partyName), resolveDirectionLabel_(payment.direction),
      amount, cellSafe_(payment.note || DEFAULT_PAYMENT_NOTE), cellSafe_(payment.qaid || ''), new Date(), id, !!payment.legacyImported
    ]);
    // (7.15.0) البيانات المحاسبية للدفعة (الحساب النقدي والعملة الفعلية) — ملف GlLink.gs
    try { if (payment.glCash) glLinkSavePayMeta_(id, payment, actingUser); } catch (eGl) { Logger.log('glLink meta: ' + eGl.message); }
    invalidatePaymentsMemo_();
    logChange_(actingUser, 'دفعة', payment.partyName, '[تسجيل دفعة] ' + resolveDirectionLabel_(payment.direction) +
      (payment.qaid ? (' — قيد ' + payment.qaid) : '') + (payment.note ? (' — ' + payment.note) : ''), '', amount,
      { clientName: payment.partyName, recordKey: 'PAY:' + id });
    // التنبيه يحمل الآن: من سجّل الدفعة، وتاريخ السداد المسجَّل (لا لحظة الإرسال)، ورقم
    // القيد، ورصيد الطرف التراكمي بعدها — للمورد كما للعميل سواءً بسواء (كان الرصيد يظهر
    // في تنبيه العميل وحده عبر مسار balance_soon المشروط بدخول قريب)
    tgEnqueue_('payment', { client: payment.partyName, amount: amount,
      note: resolveDirectionLabel_(payment.direction) + (payment.note ? (' — ' + payment.note) : ''),
      by: staffDisplayName_(actingUser),
      payDate: Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy'),
      qaid: payment.qaid || '',
      balParties: [{ name: payment.partyName, roleHint: tgRoleFromDirection_(payment.direction) }],
      ts: new Date().getTime() });
    // تغيّر رصيد عميل له دخول اليوم أو غدًا — مسح واحد رخيص هنا، والرصيد نفسه يُحسَب لاحقًا
    // في مهمة التفريغ (needsBalance) حتى لا تتأخر استجابة تسجيل الدفعة
    try {
      var imminent = tgImminentForParty_(payment.partyName);
      if (imminent.length) {
        tgEnqueue_('balance_soon', {
          client: payment.partyName, amount: amount, needsBalance: true,
          note: resolveDirectionLabel_(payment.direction),
          arrivals: imminent, ts: new Date().getTime()
        });
      }
    } catch (e) { Logger.log('balance_soon: ' + e.message); }
    SpreadsheetApp.flush(); // تظهر الدفعة فورًا في إعادة تحميل كشف الحساب بعد الحفظ
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// بيان كل طرف في الدفعة المزدوجة يُصاغ من وجهة نظره هو: من دفع يرى "… إلى فلان"، ومن استُلم
// منه يرى "… من فلان". كان الطرفان يتشاركان بيانًا واحدًا ملحقًا بعلامة ربط تقنية
// ("[دفعة مزدوجة: س ← ص]") تظهر كما هي في كشف الحساب والطباعة، فلا تقول لقارئ الكشف أي
// اتجاه يخصّ الحساب الذي يطالعه أصلاً
function linkedPaymentNote_(rawNote, otherParty, dir) {
  var base = (rawNote || '').toString().trim() || 'تحويل';
  var other = (otherParty || '').toString().trim();
  if (!other) return base;
  // المستخدم ذكر الطرف الآخر بنفسه داخل البيان — لا نكرّر الاسم مرتين
  if (normalizeName_(base).indexOf(normalizeName_(other)) !== -1) return base;
  return base + (dir === 'to' ? ' إلى ' : ' من ') + other;
}

// دفعة مزدوجة بين طرفين: تسديد مباشر من طرف لآخر بدون مرور المبلغ عبرنا (مثال: عميل دفع
// مباشرة لمورد). تُسجَّل دفعتان بنفس التاريخ والمبلغ: "استلمنا منه" للطرف الأول (fromParty)
// كأنه دفع لنا، و"دفعنا له" للطرف الثاني (toParty) كأننا دفعنا له — فينعكس الأثر على رصيد
// كل طرف بشكل صحيح دون أن يمر أي مبلغ فعليًا عبر حساباتنا
function registerLinkedPayment(payload, token) {
  try {
    var actingUser = requirePermission_(token, 'payments', 'add');
    var fromParty = (payload.fromParty || '').toString().trim();
    var toParty = (payload.toParty || '').toString().trim();
    if (!fromParty || !toParty) throw new Error('الطرفان مطلوبان');
    if (fromParty === toParty) throw new Error('يجب أن يكون الطرفان مختلفين');
    var amount = parseAmountLoose_(payload.amount);
    if (!amount || amount <= 0) throw new Error('المبلغ غير صحيح');
    var sh = ensurePaymentsSheet_();
    var d = payload.date ? new Date(payload.date) : new Date();
    var now = new Date();
    var linkId = Utilities.getUuid();
    var id1 = Utilities.getUuid(), id2 = Utilities.getUuid();
    var noteFrom = linkedPaymentNote_(payload.note, toParty, 'to');
    var noteTo = linkedPaymentNote_(payload.note, fromParty, 'from');
    sh.appendRow([d, cellSafe_(fromParty), 'استلمنا منه', amount, cellSafe_(noteFrom), cellSafe_(payload.qaid || ''), now, id1, false, linkId]);
    sh.appendRow([d, cellSafe_(toParty), 'دفعنا له', amount, cellSafe_(noteTo), cellSafe_(payload.qaid || ''), now, id2, false, linkId]);
    invalidatePaymentsMemo_();
    // كانت هذه الدالة الوحيدة من مسارات تسجيل الدفعات الأربعة التي لا تُسجَّل في سجل
    // التعديلات ولا تُرسل تنبيه تليجرام إطلاقًا — سطرا logChange_/tgEnqueue_ هما الإصلاح
    logChange_(actingUser, 'دفعة', fromParty, '[دفعة مزدوجة] استلمنا من ' + fromParty + ' ودفعنا لـ' + toParty +
      (payload.note ? (' — ' + payload.note) : ''), '', amount, { clientName: fromParty, recordKey: 'PAY:' + id1 });
    // التنبيه يذكر الحسابين صراحةً واتجاه الأثر على كل منهما، ويُلحَق برصيدَيهما التراكميين
    // بعد الدفعة (يُحسبان في مهمة التفريغ) — فالدفعة المزدوجة تمسّ رصيدين لا رصيدًا واحدًا
    tgEnqueue_('payment', {
      client: fromParty + '  ←  ' + toParty, amount: amount,
      note: 'دفعة مزدوجة · ⬅️ استلمنا من «' + fromParty + '» · ➡️ دفعنا إلى «' + toParty + '»' +
        (payload.note ? (' — ' + payload.note) : ''),
      by: staffDisplayName_(actingUser),
      payDate: Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy'),
      qaid: payload.qaid || '',
      balParties: [{ name: fromParty, roleHint: 'client' }, { name: toParty, roleHint: 'supplier' }],
      ts: now.getTime()
    });
    SpreadsheetApp.flush();
    return { ok: true, linkId: linkId, ids: [id1, id2] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// تسجيل عدة دفعات لأطراف مختلفة بنفس الاتجاه دفعة واحدة
// rows = [{partyName, amount, note, qaid, date}], direction:'in'|'out'
function registerPaymentsBatch(direction, rows, token) {
  try {
    var actingUser = requirePermission_(token, 'payments', 'add');
    if (!rows || rows.length === 0) throw new Error('لا توجد دفعات لتسجيلها');
    var sh = ensurePaymentsSheet_();
    var now = new Date();
    var out = [];
    var dirLabel = resolveDirectionLabel_(direction);
    var skipped = 0;
    var notifyRows = [];
    rows.forEach(function (r) {
      if (!r.partyName || !r.amount) { skipped++; return; }
      var amount = parseAmountLoose_(r.amount);
      if (!amount || amount <= 0) { skipped++; return; }
      var d = r.date ? new Date(r.date) : now;
      var id = Utilities.getUuid();
      out.push([d, cellSafe_(r.partyName), dirLabel, amount, cellSafe_(r.note || DEFAULT_PAYMENT_NOTE), cellSafe_(r.qaid || ''), now, id]);
      notifyRows.push({ partyName: r.partyName, amount: amount, note: r.note, id: id, date: d, qaid: r.qaid || '' });
    });

    if (out.length > 0) sh.getRange(sh.getLastRow() + 1, 1, out.length, 8).setValues(out);
    invalidatePaymentsMemo_();
    // كانت هذه الدالة (وحدها مع الدفعة المزدوجة والبند اليدوي) لا تُسجَّل في سجل التعديلات
    // ولا تُرسل تنبيه تليجرام إطلاقًا رغم تفعيل التنبيه من الإعدادات — عطل مُبلَّغ عنه
    notifyRows.forEach(function (nr) {
      logChange_(actingUser, 'دفعة', nr.partyName, '[رفع مجمَّع] ' + dirLabel +
        (nr.note ? (' — ' + nr.note) : ''), '', nr.amount, { clientName: nr.partyName, recordKey: 'PAY:' + nr.id });
      tgEnqueue_('payment', { client: nr.partyName, amount: nr.amount,
        note: dirLabel + (nr.note ? (' — ' + nr.note) : ''),
        by: staffDisplayName_(actingUser),
        payDate: Utilities.formatDate(nr.date || now, 'GMT+3', 'dd/MM/yyyy'),
        qaid: nr.qaid || '',
        balParties: [{ name: nr.partyName, roleHint: tgRoleFromDirection_(direction) }],
        ts: now.getTime() });
    });
    return { ok: true, saved: out.length, skipped: skipped };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// بند يدوي مباشر في كشف الحساب (مدين أو دائن) بدون حجز أو دفعة عادية
function registerManualEntry(partyName, date, type, amount, note, token) {
  try {
    var actingUser = requirePermission_(token, 'payments', 'add');
    if (!partyName) throw new Error('اسم الطرف مطلوب');
    var amt = parseAmountLoose_(amount);
    if (!amt || amt <= 0) throw new Error('المبلغ غير صحيح');
    var sh = ensurePaymentsSheet_();
    var d = date ? new Date(date) : new Date();
    var dirLabel = type === 'debit' ? 'مدين يدوي' : 'دائن يدوي';
    var id = Utilities.getUuid();
    var now = new Date();
    sh.appendRow([d, partyName, dirLabel, amt, note || 'بند يدوي', '', now, id]);
    invalidatePaymentsMemo_();
    // نفس العطل: بند يدوي لم يكن يُسجَّل في سجل التعديلات ولا يُرسل تنبيه تليجرام إطلاقًا
    logChange_(actingUser, 'دفعة', partyName, '[بند يدوي] ' + dirLabel + (note ? (' — ' + note) : ''),
      '', amt, { clientName: partyName, recordKey: 'PAY:' + id });
    tgEnqueue_('payment', { client: partyName, amount: amt, note: dirLabel + (note ? (' — ' + note) : ''),
      by: staffDisplayName_(actingUser),
      payDate: Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy'),
      balParties: [{ name: partyName, roleHint: type === 'debit' ? 'client' : 'supplier' }],
      ts: now.getTime() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function findPaymentRowById_(sh, id) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sh.getRange(2, 8, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) { if (ids[i][0] === id) return i + 2; }
  return -1;
}

// نقطة الدخول العامة — كانت بلا أي صلاحية إطلاقًا (ثغرة: أي مستخدم كان يستطيع طلب كل دفعات
// أي طرف بالاسم مباشرة، بصرف النظر عن صلاحية كشف الحساب أو تقييد الحسابات المسموحة له)
function getPartyPayments(partyName, token) {
  var user = requirePermission_(token, 'statement', 'view');
  if (partyName && !statementAccountAllowed_(user, partyName)) {
    throw new Error('لا تملك صلاحية الوصول إلى حساب "' + partyName + '"');
  }
  var sh = ensurePaymentsSheet_(); // يضمن ملء المعرّفات الفارغة تلقائيًا
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, PAYMENTS_COLS_).getValues();
  var out = [];
  var partyNorm = normalizeName_(partyName);
  data.forEach(function (r) {
    if (normalizeName_(r[1]) !== partyNorm) return;
    out.push({
      id: r[7],
      date: r[0] instanceof Date ? Utilities.formatDate(r[0], 'GMT+3', 'yyyy-MM-dd') : r[0],
      direction: r[2], amount: r[3], note: r[4], qaid: r[5], legacyImported: !!r[8],
      linkId: (r[9] || '').toString()   // غير فارغ ⇒ طرف في دفعة مزدوجة يُعدَّل مع شقيقه
    });
  });
  return safeReturn_(out);
}

// أسماء حقول الدفعة كما تظهر في تنبيه التعديل — "البيان" لا "الملاحظات" (نفس تسمية الحقل في
// كل شاشات الدفعات: نافذة التسجيل/التعديل وكشف الحساب وشاشة كل المدفوعات)
var PAYMENT_DIFF_LABELS_ = {
  date: 'التاريخ', partyName: 'اسم الطرف', direction: 'الاتجاه',
  amount: 'المبلغ', note: 'البيان', qaid: 'رقم القيد'
};
// current/next = [date, partyName, direction, amount, note, qaid] (نفس ترتيب أعمدة A..F في
// ورقة الدفعات) — يُرجع فقط الحقول التي تغيّرت فعليًا، بتسمياتها العربية وقيمتيها المعروضتين
function paymentFieldDiffs_(current, next) {
  var fmtD = function (v) {
    if (v && typeof v.getTime === 'function' && typeof v.getMonth === 'function') {
      return Utilities.formatDate(v, 'GMT+3', 'dd/MM/yyyy');
    }
    return (v === '' || v === null || v === undefined) ? '—' : String(v);
  };
  var fmtTxt = function (v) { return (v === '' || v === null || v === undefined) ? '—' : String(v); };
  var rows = [
    { key: 'date', oldVal: fmtD(current[0]), newVal: fmtD(next[0]) },
    { key: 'partyName', oldVal: fmtTxt(current[1]), newVal: fmtTxt(next[1]) },
    { key: 'direction', oldVal: fmtTxt(current[2]), newVal: fmtTxt(next[2]) },
    { key: 'amount', oldVal: fmtTxt(current[3]), newVal: fmtTxt(next[3]) },
    { key: 'note', oldVal: fmtTxt(current[4]), newVal: fmtTxt(next[4]) },
    { key: 'qaid', oldVal: fmtTxt(current[5]), newVal: fmtTxt(next[5]) }
  ];
  return rows.filter(function (r) { return r.oldVal !== r.newVal; })
    .map(function (r) { return { label: PAYMENT_DIFF_LABELS_[r.key], oldVal: r.oldVal, newVal: r.newVal }; });
}
// رسالة "تعديل بيان دفعة" — عنوانها صريح (لا "تسجيل دفعة" العام) وتَسرد كل حقل تغيّر بصيغة
// "قديم ⟶ جديد"، بنفس أسلوب تنبيه تعديل الحجز (tgBookingEditMsg_) للاتساق بين التنبيهين
function tgPaymentEditMsg_(partyName, diffs, actor) {
  var lines = [
    '✏️ <b>تعديل بيان دفعة</b>',
    '━━━━━━━━━━━━━━',
    '👤 <b>الطرف:</b> ' + tgEsc_(partyName || '—'),
    '━━━━━━━━━━━━━━',
    '📝 <b>ما الذي تغيّر:</b>'
  ];
  diffs.forEach(function (d) {
    lines.push('   • <b>' + tgEsc_(d.label) + '</b>');
    lines.push('      <s>' + tgEsc_(d.oldVal) + '</s>  ⟶  <b>' + tgEsc_(d.newVal) + '</b>');
  });
  lines.push('━━━━━━━━━━━━━━');
  lines.push('👤 <b>بواسطة:</b> ' + tgEsc_(actor));
  lines.push('⏰ ' + tgStamp_());
  return lines.join('\n');
}
// fields = {date, direction:'in'|'out'|<تسمية كاملة>, amount, note, qaid, partyName} — كل
// الحقول تصل دائمًا معبَّأة كاملة من نموذج التعديل (ليست تصحيحًا جزئيًا)، فنعتمد "!== undefined"
// لا "||" في أخذ القيمة الجديدة؛ وإلا كان تفريغ حقل (رقم القيد أو البيان) لا يُطبَّق أبدًا لأن
// '' قيمة مزيَّفة (falsy) تُعيد القيمة القديمة كما كانت (عطل صامت سابق)
function updatePayment(id, fields, token) {
  try {
    var actingUser = requirePermission_(token, 'payments', 'edit');
    var sh = ensurePaymentsSheet_();
    var rowIdx = findPaymentRowById_(sh, id);
    if (rowIdx === -1) throw new Error('الدفعة غير موجودة (ربما حُذفت)');
    var current = sh.getRange(rowIdx, 1, 1, 6).getValues()[0];
    var d = fields.date ? new Date(fields.date) : current[0];
    var partyName = fields.partyName !== undefined ? (fields.partyName || current[1]) : current[1];
    var dirLabel = fields.direction ? resolveDirectionLabel_(fields.direction) : current[2];
    var amount = (fields.amount !== undefined ? parseAmountLoose_(fields.amount) : NaN) || current[3];
    var note = fields.note !== undefined ? fields.note : current[4];
    var qaid = fields.qaid !== undefined ? fields.qaid : current[5];
    var next = [d, partyName, dirLabel, amount, note, qaid];
    var diffs = paymentFieldDiffs_(current, next);
    sh.getRange(rowIdx, 1, 1, 6).setValues([next.map(cellSafe_)]);
    try { if (fields.glCash !== undefined) glLinkSavePayMeta_(id, fields, actingUser); } catch (eGl) { Logger.log('glLink meta: ' + eGl.message); }
    invalidatePaymentsMemo_();
    if (diffs.length) {
      logChange_(actingUser, 'دفعة', partyName,
        '[تعديل بيان دفعة] ' + diffs.map(function (x) { return x.label; }).join('، '),
        '', amount, { clientName: partyName, recordKey: 'PAY:' + id });
      var roleHint = dirLabel === 'دائن يدوي' ? 'supplier'
        : dirLabel === 'مدين يدوي' ? 'client' : tgRoleFromDirection_(dirLabel);
      tgEnqueue_('payment', {
        preformatted: tgPaymentEditMsg_(partyName, diffs, staffDisplayName_(actingUser)),
        client: partyName,
        balParties: [{ name: partyName, roleHint: roleHint }],
        ts: new Date().getTime()
      });
    }
    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ==========================================================
// الدفعة المزدوجة: قراءة الطرفين معًا وتعديلهما في عملية واحدة
// ==========================================================
// تعديل طرف واحد فقط في دفعة مزدوجة يكسر التوازن صامتًا: المبلغ المستلم من الأول لم يعد
// يساوي المدفوع للثاني، فيظهر فرق وهمي في رصيد أحدهما بلا أي أثر يشرحه. لذلك أي تعديل على
// المبلغ/التاريخ/القيد يُطبَّق على الصفّين معًا، والبيان يُعاد توليده لكل طرف من وجهة نظره
function findPaymentRowsByLinkId_(sh, linkId) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2 || !linkId) return [];
  var vals = sh.getRange(2, 1, lastRow - 1, PAYMENTS_COLS_).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if ((vals[i][9] || '').toString() === linkId) out.push({ rowInSheet: i + 2, vals: vals[i] });
  }
  return out;
}
// يُرجع طرفَي الدفعة المزدوجة جاهزين لشاشة التعديل (المستلَم منه أولاً ثم المدفوع له)
function getLinkedPaymentPair(linkId, token) {
  try {
    requirePermission_(token, 'statement', 'view');
    var sh = ensurePaymentsSheet_();
    var rows = findPaymentRowsByLinkId_(sh, linkId);
    if (rows.length < 2) return { ok: false, error: 'لم أجد طرفَي الدفعة المزدوجة (ربما حُذف أحدهما)' };
    var side = function (dir) {
      var r = rows.filter(function (x) { return x.vals[2] === dir; })[0];
      if (!r) return null;
      return {
        id: r.vals[7], party: (r.vals[1] || '').toString(), direction: r.vals[2],
        amount: r.vals[3], note: r.vals[4] || '', qaid: r.vals[5] || '',
        dateIso: r.vals[0] instanceof Date ? Utilities.formatDate(r.vals[0], 'GMT+3', 'yyyy-MM-dd') : r.vals[0]
      };
    };
    var from = side('استلمنا منه'), to = side('دفعنا له');
    if (!from || !to) return { ok: false, error: 'طرفا الدفعة المزدوجة غير متكاملين' };
    return safeReturn_({ ok: true, linkId: linkId, from: from, to: to });
  } catch (e) { return { ok: false, error: e.message }; }
}
// نسخة خادم من lpBaseNote_ (App.html) — يُزيل لاحقة "إلى/من <الطرف الآخر>" المضافة تلقائيًا
// عند التسجيل، لاستخلاص "البيان" المشترك الأصلي من بيان أي طرف قبل مقارنته بالبيان الجديد
function lpBaseNote_(note, otherParty) {
  var s = (note || '').toString().trim();
  var other = (otherParty || '').toString().trim();
  if (!other) return s;
  var esc = other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s.replace(new RegExp('\\s*(?:إلى|الى|من)\\s*' + esc + '\\s*$'), '').trim();
}
// نفس أسلوب tgPaymentEditMsg_ لكن للدفعة المزدوجة: يعرض الطرفين معًا وقائمة الحقول المشتركة
// التي تغيّرت (البيان هنا هو الأساس المشترك قبل صياغته لكل طرف من وجهة نظره)
function tgLinkedPaymentEditMsg_(fromParty, toParty, diffs, actor) {
  var lines = [
    '✏️ <b>تعديل بيان دفعة مزدوجة</b>',
    '━━━━━━━━━━━━━━',
    '⬅️ <b>استلمنا من:</b> ' + tgEsc_(fromParty || '—'),
    '➡️ <b>دفعنا إلى:</b> ' + tgEsc_(toParty || '—'),
    '━━━━━━━━━━━━━━',
    '📝 <b>ما الذي تغيّر:</b>'
  ];
  diffs.forEach(function (d) {
    lines.push('   • <b>' + tgEsc_(d.label) + '</b>');
    lines.push('      <s>' + tgEsc_(d.oldVal) + '</s>  ⟶  <b>' + tgEsc_(d.newVal) + '</b>');
  });
  lines.push('━━━━━━━━━━━━━━');
  lines.push('👤 <b>بواسطة:</b> ' + tgEsc_(actor));
  lines.push('⏰ ' + tgStamp_());
  return lines.join('\n');
}
// fields = {fromParty, toParty, date, amount, qaid, note} — البيان هنا هو "الأساس" المشترك،
// ويُصاغ لكل طرف تلقائيًا (…إلى فلان / …من فلان) كما عند التسجيل الأول تمامًا
function updateLinkedPayment(linkId, fields, token) {
  try {
    var actingUser = requirePermission_(token, 'payments', 'edit');
    var sh = ensurePaymentsSheet_();
    var rows = findPaymentRowsByLinkId_(sh, linkId);
    if (rows.length < 2) throw new Error('لم أجد طرفَي الدفعة المزدوجة (ربما حُذف أحدهما)');
    var fromParty = (fields.fromParty || '').toString().trim();
    var toParty = (fields.toParty || '').toString().trim();
    if (!fromParty || !toParty) throw new Error('الطرفان مطلوبان');
    if (fromParty === toParty) throw new Error('يجب أن يكون الطرفان مختلفين');
    var amount = parseAmountLoose_(fields.amount);
    if (!amount || amount <= 0) throw new Error('المبلغ غير صحيح');
    var d = fields.date ? new Date(fields.date) : new Date();
    var qaid = fields.qaid !== undefined ? fields.qaid : '';
    var note = fields.note !== undefined ? fields.note.toString().trim() : '';

    var fromRow = rows.filter(function (r) { return r.vals[2] === 'استلمنا منه'; })[0];
    var toRow = rows.filter(function (r) { return r.vals[2] === 'دفعنا له'; })[0];
    var fmtD = function (v) {
      if (v && typeof v.getTime === 'function' && typeof v.getMonth === 'function') return Utilities.formatDate(v, 'GMT+3', 'dd/MM/yyyy');
      return '—';
    };
    var fmtTxt = function (v) { return (v === '' || v === null || v === undefined) ? '—' : String(v); };
    var oldToParty = toRow ? (toRow.vals[1] || '').toString() : '';
    var diffs = [
      { label: 'الطرف (استلمنا منه)', oldVal: fmtTxt(fromRow ? (fromRow.vals[1] || '').toString() : ''), newVal: fmtTxt(fromParty) },
      { label: 'الطرف (دفعنا له)', oldVal: fmtTxt(oldToParty), newVal: fmtTxt(toParty) },
      { label: 'التاريخ', oldVal: fmtD(fromRow ? fromRow.vals[0] : null), newVal: fmtD(d) },
      { label: 'المبلغ', oldVal: fmtTxt(fromRow ? fromRow.vals[3] : ''), newVal: fmtTxt(amount) },
      { label: 'رقم القيد', oldVal: fmtTxt(fromRow ? fromRow.vals[5] : ''), newVal: fmtTxt(qaid) },
      { label: 'البيان', oldVal: fmtTxt(fromRow ? lpBaseNote_(fromRow.vals[4], oldToParty) : ''), newVal: fmtTxt(note) }
    ].filter(function (r) { return r.oldVal !== r.newVal; });

    rows.forEach(function (r) {
      var isFrom = r.vals[2] === 'استلمنا منه';
      var party = isFrom ? fromParty : toParty;
      var rowNote = linkedPaymentNote_(note, isFrom ? toParty : fromParty, isFrom ? 'to' : 'from');
      sh.getRange(r.rowInSheet, 1, 1, 6).setValues([[d, party, r.vals[2], amount, rowNote, qaid]]);
    });
    invalidatePaymentsMemo_();
    logChange_(actingUser, 'دفعة', fromParty,
      '[تعديل بيان دفعة مزدوجة] ' + fromParty + ' ← ' + toParty +
      (diffs.length ? (' — ' + diffs.map(function (x) { return x.label; }).join('، ')) : ''),
      '', amount, { clientName: fromParty, recordKey: 'PAY:' + linkId });
    if (diffs.length) {
      tgEnqueue_('payment', {
        preformatted: tgLinkedPaymentEditMsg_(fromParty, toParty, diffs, staffDisplayName_(actingUser)),
        client: fromParty + '  ←  ' + toParty,
        balParties: [{ name: fromParty, roleHint: 'client' }, { name: toParty, roleHint: 'supplier' }],
        ts: new Date().getTime()
      });
    }
    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// شاشة "كل المدفوعات" — كل الحركات (دفعات + بنود يدوية) لكل الأطراف، مع فلترة
// اختيارية باسم الطرف وفترة تاريخ (مفتوحة من أي جهة لو الحقل فاضي)
// نقطة الدخول العامة — كانت بلا أي صلاحية إطلاقًا (ثغرة: أي مستخدم كان يستطيع سحب كل حركات
// كل الأطراف الماليّة، بصرف النظر عن صلاحية شاشة "كل المدفوعات")
function searchPayments(filters, token) {
  try {
    requirePermission_(token, 'payments', 'view');
    var sh = ensurePaymentsSheet_(); // يضمن ملء المعرّفات الفارغة تلقائيًا
    if (!sh || sh.getLastRow() < 2) return { rows: [], totals: { count: 0, received: 0, paid: 0, net: 0 } };

    var data = sh.getRange(2, 1, sh.getLastRow() - 1, PAYMENTS_COLS_).getValues();
    var f = filters || {};
    var fParty = (f.party || '').toString().trim().toLowerCase();
    var fFrom = f.dateFrom ? new Date(f.dateFrom) : null; if (fFrom) fFrom.setHours(0, 0, 0, 0);
    var fTo = f.dateTo ? new Date(f.dateTo) : null; if (fTo) fTo.setHours(23, 59, 59, 999);

    var rows = [], received = 0, paid = 0;

    data.forEach(function (p) {
      var d = p[0] instanceof Date ? new Date(p[0].getTime()) : new Date(p[0]);
      if (isNaN(d.getTime())) return;
      d.setHours(0, 0, 0, 0);
      var ts = d.getTime();
      var party = (p[1] || '').toString().trim();
      if (fParty && party.toLowerCase().indexOf(fParty) === -1) return;
      if (fFrom && ts < fFrom.getTime()) return;
      if (fTo && ts > fTo.getTime()) return;

      var dir = p[2];
      var amount = parseFloat(p[3]) || 0;
      if (dir === 'استلمنا منه') received += amount;
      else if (dir === 'دفعنا له') paid += amount;

      rows.push({
        id: p[7], qaid: p[5] || '',
        dateDisp: Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy'), dateIso: Utilities.formatDate(d, 'GMT+3', 'yyyy-MM-dd'),
        party: party, note: p[4] || '', amount: amount, direction: dir, legacyImported: !!p[8],
        linkId: (p[9] || '').toString()
      });
    });

    rows.sort(function (a, b) { return b.dateIso.localeCompare(a.dateIso); });

    return safeReturn_({ rows: rows, totals: { count: rows.length, received: received, paid: paid, net: received - paid } });
  } catch (e) {
    return { rows: [], totals: { count: 0, received: 0, paid: 0, net: 0 }, error: e.message };
  }
}

function deletePayment(id, token) {
  try {
    var actingUser = requirePermission_(token, 'payments', 'delete');
    var sh = ensurePaymentsSheet_();
    var rowIdx = findPaymentRowById_(sh, id);
    if (rowIdx === -1) throw new Error('الدفعة غير موجودة (ربما حُذفت مسبقًا)');
    var rowVals = sh.getRange(rowIdx, 1, 1, 4).getValues()[0]; // التاريخ، اسم الطرف، الاتجاه، المبلغ
    sh.deleteRow(rowIdx);
    logChange_(actingUser, 'حذف دفعة', rowVals[1], '[حذف دفعة] ' + rowVals[2], rowVals[3], '',
      { clientName: rowVals[1], recordKey: 'PAY:' + rowVals[0] });
    SpreadsheetApp.flush(); // يختفي الصف فورًا من كشف الحساب بعد الحذف
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// ==========================================================
// ==========================================================
// بيانات الحسابات — نوع الحساب (سكن/آخر) + ملاحظات + رقم موبايل لكل عميل/مورد. الاستبعاد
// اختيار استبعاد (opt-out) مقصود: أي اسم بلا صف هنا يُعتبر "سكن" (يظهر عاديًا) افتراضيًا —
// المستخدم يستبعد فقط الحسابات الاستثنائية (رحلة/جهة خارجية بلا حسابات كاملة بهذا البرنامج)
// يدويًا مرة واحدة، فتختفي من متابعة الأرصدة وبيان الأرصدة تلقائيًا من حينها فصاعدًا — بعكس
// اختيار "علّم كل عميل حقيقي" الذي كان سيُخفي كل العملاء الحاليين فجأة حتى تُراجعهم يدويًا.
// شاشة كل الحجوزات وكشف الحساب غير متأثرتين إطلاقًا — تبقيان تعرضان كل الأسماء دائمًا.
// ==========================================================
var ACCOUNT_PROFILES_SHEET_NAME = 'بيانات الحسابات';
function ensureAccountProfilesSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(ACCOUNT_PROFILES_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ACCOUNT_PROFILES_SHEET_NAME);
    sh.getRange(1, 1, 1, 7).setValues([['اسم الحساب', 'نوع الحساب', 'ملاحظات', 'رقم الموبايل', 'مسؤول البيع الافتراضي', 'الدور الأساسي', 'كود الحساب']]);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < 7) {
    // ترقية ورقة قديمة (4 إلى 6 أعمدة فقط من إصدار سابق) بإضافة الأعمدة الناقصة حتى العمود
    // السابع "كود الحساب" (معرّف تسلسلي فريد لكل حساب — تُولِّده generateAccountCodes()
    // يدويًا، أو يُكتَب يدويًا من نافذة بيانات الحساب) بدون فقدان أي بيانات موجودة
    if (sh.getLastColumn() < 5) sh.getRange(1, 5).setValue('مسؤول البيع الافتراضي');
    if (sh.getLastColumn() < 6) sh.getRange(1, 6).setValue('الدور الأساسي');
    sh.getRange(1, 7).setValue('كود الحساب');
  }
  return sh;
}
function getAllAccountProfiles_() {
  var sh = ensureAccountProfilesSheet_();
  var map = {};
  if (sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach(function (r) {
    var name = (r[0] || '').toString().trim();
    if (!name) return;
    var role = (r[5] === 'عميل' || r[5] === 'مورد') ? r[5] : '';
    map[name] = { type: r[1] === 'آخر' ? 'آخر' : 'سكن', notes: r[2] || '', phone: r[3] || '', salesAgent: r[4] || '', role: role, code: (r[6] || '').toString().trim() };
  });
  return map;
}
function isExcludedAccount_(name, profilesMap) {
  var p = profilesMap[(name || '').toString().trim()];
  return !!(p && p.type === 'آخر');
}
// يُستدعى من زر "بيانات الحساب" في كشف الحساب — نفس صلاحية عرض كشف الحساب تكفي (قراءة فقط)
function getAccountProfile(token, name) {
  try {
    requirePermission_(token, 'statement', 'view');
    var map = getAllAccountProfiles_();
    var p = map[(name || '').toString().trim()] || { type: 'سكن', notes: '', phone: '', salesAgent: '', role: '', code: '' };
    return safeReturn_(p);
  } catch (e) { return safeReturn_({ error: e.message }); }
}
// نموذج بيانات الحساب الموحَّد: يحفظ التصنيف/الدور/الحقول المعتادة، ويتولى أيضًا إعادة تسمية
// الحساب نفسها إن اختلف payload.name عن payload.oldName — بدل زر "تعديل الاسم" المنفصل الذي
// كان مستقلًا تمامًا عن هذا النموذج (نفس البيانات تُعدَّل الآن من مكان واحد فقط). إعادة التسمية
// تتطلب صلاحية 'bookings'/'edit' إضافية (لأنها تكتب مباشرة في حجوزات المصدر)، تُفرَض فقط عند
// الحاجة الفعلية لها حتى لا تُطلَب من مستخدم يملك فقط صلاحية تعديل كشف الحساب لحفظ بيانات عادية
function saveAccountProfile(token, payload) {
  try {
    var user = requirePermission_(token, 'statement', 'edit');
    var name = (payload.name || '').toString().trim();
    if (!name) throw new Error('اسم الحساب مطلوب');
    var oldName = (payload.oldName || '').toString().trim() || name;
    var renameResult = null;
    if (oldName !== name) {
      requirePermission_(token, 'bookings', 'edit');
      renameResult = renameParty_(oldName, name, user);
    }
    var sh = ensureAccountProfilesSheet_();
    var data = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === oldName) { rowIdx = i + 1; break; }
    }
    var type = payload.type === 'آخر' ? 'آخر' : 'سكن';
    var role = (payload.role === 'عميل' || payload.role === 'مورد') ? payload.role : '';
    var code = (payload.code || '').toString().trim();
    if (code) {
      // فريد إلزامًا: نفس الغرض من رقم القيد — لا معنى لكود مكرَّر بين حسابين مختلفين.
      // نتجاهل صف الحساب نفسه (rowIdx) حتى لا يرفض الحفظ كوده الحالي عند تعديل بيانات أخرى فقط
      for (var j = 1; j < data.length; j++) {
        if (j + 1 === rowIdx) continue;
        if ((data[j][6] || '').toString().trim().toLowerCase() === code.toLowerCase()) {
          throw new Error('الكود "' + code + '" مستخدَم بالفعل للحساب "' + (data[j][0] || '') + '" — اختر كودًا آخر');
        }
      }
    }
    var row = [name, type, (payload.notes || '').toString(), (payload.phone || '').toString(), (payload.salesAgent || '').toString().trim(), role, code];
    if (rowIdx === -1) sh.appendRow(row);
    else sh.getRange(rowIdx, 1, 1, 7).setValues([row]);
    logChange_(user, 'بيانات حساب', name, 'تعديل بيانات حساب' + (renameResult ? (' (بعد إعادة تسمية من "' + oldName + '")') : '') + ' — النوع: ' + type + (role ? ' — الدور: ' + role : '') + (code ? (' — الكود: ' + code) : ''), '', '');
    return {
      ok: true, renamed: !!renameResult,
      bookingsUpdated: renameResult ? renameResult.bookingsUpdated : 0,
      paymentsUpdated: renameResult ? renameResult.paymentsUpdated : 0
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ==========================================================
// تُشغَّل يدويًا فقط من محرر Apps Script (اختر "generateAccountCodes" من القائمة المنسدلة
// أعلى المحرر ثم اضغط ▶ Run) — لا تُستدعى من الواجهة أبدًا. تولّد كودًا تسلسليًا (سيريال
// رقمي 4 خانات: 0001، 0002...) لكل حساب معروف (من الحجوزات أو المُضاف يدويًا) ليس له كود
// بعد، وتكتبه في عمود "كود الحساب" بشيت "بيانات الحسابات" — تُنشئ صف الحساب أولًا لو لم يكن
// له صف بيانات أصلًا. آمنة للتشغيل أكثر من مرة: لا تلمس إطلاقًا حسابًا له كود بالفعل (فلا
// تُعيد ترقيم من له كود مسبقًا)، وتُكمل الترقيم من أعلى رقم تسلسلي مستخدَم حاليًا — فتشغيلها
// لاحقًا بعد إضافة عملاء جدد يمنحهم أكوادًا جديدة فقط دون أي أثر على أكواد القدامى
// ==========================================================
function generateAccountCodes() {
  requireScriptOwner_();   // (7.15.0) دالة إعداد — من المحرر فقط
  var names = getUnifiedPartyList_(); // كل الأسماء المعروفة من الحجوزات + الحسابات اليدوية
  var sh = ensureAccountProfilesSheet_();
  var data = sh.getDataRange().getValues();

  var rowIdxByName = {}, usedCodes = {}, maxSerial = 0;
  for (var i = 1; i < data.length; i++) {
    var nm = (data[i][0] || '').toString().trim();
    if (nm) rowIdxByName[nm] = i + 1;
    var code = (data[i][6] || '').toString().trim();
    if (code) {
      usedCodes[code.toLowerCase()] = true;
      var m = code.match(/(\d+)$/);
      if (m) { var n = parseInt(m[1], 10); if (n > maxSerial) maxSerial = n; }
    }
  }

  function nextCode() {
    var candidate;
    do {
      maxSerial++;
      candidate = String(maxSerial).padStart(4, '0');
    } while (usedCodes[candidate.toLowerCase()]);
    usedCodes[candidate.toLowerCase()] = true;
    return candidate;
  }

  var assigned = 0, alreadyHad = 0, appendRows = [];
  names.forEach(function (name) {
    var rowIdx = rowIdxByName[name];
    if (rowIdx) {
      var existing = (data[rowIdx - 1][6] || '').toString().trim();
      if (existing) { alreadyHad++; return; }
      sh.getRange(rowIdx, 7).setValue(nextCode());
      assigned++;
    } else {
      // لا صف بيانات لهذا الحساب أصلًا — يُنشأ بالقيم الافتراضية (سكن، بلا ملاحظات/دور) + الكود الجديد
      appendRows.push([name, 'سكن', '', '', '', '', nextCode()]);
      assigned++;
    }
  });
  if (appendRows.length) sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, 7).setValues(appendRows);

  var summary = 'تم توليد ' + assigned + ' كود جديد — كان لدى ' + alreadyHad + ' حسابًا كود بالفعل فلم يُمسّ إطلاقًا. الإجمالي: ' + names.length + ' حسابًا معروفًا.';
  Logger.log(summary);
  try { logChange_('مدير النظام (تشغيل يدوي)', 'بيانات حساب', '', summary, '', ''); } catch (e) {}
  return summary;
}

// حذف حساب نهائيًا — مسموح فقط إن لم توجد له أي حركة (لا حجوزات بصفته عميلاً أو موردًا، ولا
// دفعات) حتى لا يضيع أي أثر مالي/تشغيلي حقيقي. يزيل صفه من "بيانات الحسابات" (إن وُجد) ومن
// قائمة الأطراف اليدوية EXTRA_PARTIES_KEY_ (إن كان حسابًا أُضيف يدويًا بلا حجوزات بعد)
function deleteAccount(name, token) {
  try {
    var user = requirePermission_(token, 'statement', 'edit');
    name = (name || '').toString().trim();
    if (!name) throw new Error('اسم الحساب مطلوب');
    var norm = normalizeName_(name);

    var hasBooking = getSourceRowsCached_().some(function (fullRow) {
      var raw = fullRow.slice(0, SOURCE_LAST_COL);
      return normalizeName_(raw[3] || '') === norm || normalizeName_(raw[14] || '') === norm;
    });
    if (hasBooking) throw new Error('لا يمكن حذف "' + name + '" — له حجوزات مسجَّلة. احذف/انقل هذه الحجوزات أولًا.');

    var paySheet = getSS_().getSheetByName(PAYMENTS_SHEET_NAME);
    if (paySheet && paySheet.getLastRow() > 1) {
      var pNames = paySheet.getRange(2, 2, paySheet.getLastRow() - 1, 1).getValues();
      var hasPayment = pNames.some(function (r) { return normalizeName_(r[0] || '') === norm; });
      if (hasPayment) throw new Error('لا يمكن حذف "' + name + '" — له دفعات مسجَّلة. احذف هذه الدفعات أولًا.');
    }

    var sh = ensureAccountProfilesSheet_();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === name) { sh.deleteRow(i + 1); break; }
    }
    var extra = getExtraParties_();
    var filtered = extra.filter(function (p) { return p.name !== name; });
    if (filtered.length !== extra.length) {
      PropertiesService.getScriptProperties().setProperty(EXTRA_PARTIES_KEY_, JSON.stringify(filtered));
    }
    logChange_(user, 'حذف حساب', name, 'حذف حساب "' + name + '" (بلا حركات)', name, '');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
// قائمة كل الحسابات المعروفة (من الحجوزات + الحسابات اليدوية) مع بياناتها الحالية — تغذّي
// جدول المراجعة الشاملة (شاشة الإعدادات)
function getAccountProfilesList(token) {
  try {
    requirePermission_(token, 'statement', 'edit');
    var names = getUnifiedPartyList_();
    var map = getAllAccountProfiles_();
    var out = names.map(function (n) {
      var p = map[n] || { type: 'سكن', notes: '', phone: '', salesAgent: '', role: '', code: '' };
      return { name: n, type: p.type, notes: p.notes, phone: p.phone, salesAgent: p.salesAgent, role: p.role, code: p.code || '' };
    });
    return safeReturn_(out);
  } catch (e) { return safeReturn_({ error: e.message }); }
}

// تسجيل عميل/مورد جديد (بدون حجوزات بعد) + إعادة تسمية طرف
// موجود مع مزامنة الاسم الجديد في كل حجوزاته بالمصدر
// ==========================================================
var EXTRA_PARTIES_KEY_ = 'EXTRA_PARTIES';

function getExtraParties_() {
  var raw = PropertiesService.getScriptProperties().getProperty(EXTRA_PARTIES_KEY_);
  return raw ? JSON.parse(raw) : [];
}

function registerNewParty(name, role, token) {
  try {
    requirePermission_(token, 'statement', 'edit');
    name = (name || '').toString().trim();
    if (!name) throw new Error('الاسم مطلوب');
    var list = getExtraParties_();
    if (list.some(function (p) { return p.name === name; })) throw new Error('هذا الاسم مسجّل بالفعل');
    list.push({ name: name, role: role || 'both' });
    PropertiesService.getScriptProperties().setProperty(EXTRA_PARTIES_KEY_, JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// فهرس سريع لموقع كل حجز في شيتي المصدر (مكة/المدينة) — قراءة واحدة لكل شيت
// بدل قراءة متكررة، يُستخدم في العمليات المجمّعة مثل إعادة التسمية
function buildSourceKeyIndex_() {
  var s = getSourceSettings_();
  var ss = openSourceSpreadsheet_(s);
  var idx = {};
  [{ name: s.meccaSheet, start: s.meccaStartRow, city: 'مكة' },
   { name: s.medinaSheet, start: s.medinaStartRow, city: 'المدينة' }].forEach(function (src) {
    var sh = ss.getSheetByName(src.name);
    if (!sh) return;
    var lastRow = sh.getLastRow();
    if (lastRow < src.start) return;
    var values = sh.getRange(src.start, 1, lastRow - src.start + 1, SOURCE_LAST_COL).getValues();
    values.forEach(function (row, i) {
      idx[bookingKey_(row, src.city)] = { sheet: sh, rowInSheet: src.start + i };
    });
  });
  return idx;
}

// إعادة تسمية طرف: يحدّث اسمه في كل حجوزاته (شيت المصدر مباشرة) وفي سجل الدفعات — دالة داخلية
// بلا أي تحقق صلاحية (يتولاه المستدعي)، تُستخدَم من renameParty (نقطة دخول عامة قديمة، لم تعد
// مستخدَمة من الواجهة بعد توحيد النموذج) ومن saveAccountProfile (النموذج الموحَّد الجديد الذي
// يحمل تعديل الاسم بنفسه بدل زر منفصل)
function renameParty_(oldName, newName, actingUser) {
  oldName = (oldName || '').toString().trim();
  newName = (newName || '').toString().trim();
  if (!oldName || !newName) throw new Error('الاسمان مطلوبان');
  if (oldName === newName) return { bookingsUpdated: 0, paymentsUpdated: 0 };

  // قراءة فعلية (بدون كاش) لأننا سنكتب فورًا بناءً عليها — نريد أحدث حالة للمصدر
  var srcRows = readSourceRows_();
  var srcIndex = buildSourceKeyIndex_();
  var bookingsUpdated = 0;

  srcRows.forEach(function (item) {
    var raw = item.row;
    var isClient = (raw[3] || '').toString().trim() === oldName;
    var isSupplier = (raw[14] || '').toString().trim() === oldName;
    if (!isClient && !isSupplier) return;

    var loc = srcIndex[item.key];
    if (!loc) return;
    if (isClient) loc.sheet.getRange(loc.rowInSheet, 4).setValue(newName);
    if (isSupplier) loc.sheet.getRange(loc.rowInSheet, 15).setValue(newName);
    bookingsUpdated++;
  });

  var paymentsUpdated = 0;
  var paySheet = getSS_().getSheetByName(PAYMENTS_SHEET_NAME);
  if (paySheet && paySheet.getLastRow() > 1) {
    var pRange = paySheet.getRange(2, 2, paySheet.getLastRow() - 1, 1);
    var pNames = pRange.getValues();
    for (var j = 0; j < pNames.length; j++) {
      if ((pNames[j][0] || '').toString().trim() === oldName) {
        paySheet.getRange(j + 2, 2).setValue(newName);
        paymentsUpdated++;
      }
    }
  }

  var extra = getExtraParties_();
  var changedExtra = false;
  extra.forEach(function (p) { if (p.name === oldName) { p.name = newName; changedExtra = true; } });
  if (changedExtra) PropertiesService.getScriptProperties().setProperty(EXTRA_PARTIES_KEY_, JSON.stringify(extra));

  if (bookingsUpdated > 0) {
    logChange_(actingUser, 'إعادة تسمية طرف', oldName, bookingsUpdated + ' حجز تأثر بإعادة التسمية', oldName, newName);
    invalidateSourceCache_();
  }
  return { bookingsUpdated: bookingsUpdated, paymentsUpdated: paymentsUpdated };
}
function renameParty(oldName, newName, token) {
  try {
    var actingUser = requirePermission_(token, 'bookings', 'edit');
    var r = renameParty_(oldName, newName, actingUser);
    return { ok: true, bookingsUpdated: r.bookingsUpdated, paymentsUpdated: r.paymentsUpdated };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// نقطة الدخول العامة المستدعاة من الواجهة — تفرض الصلاحية فعليًا (شاشة كشف الحساب +
// تقييد الحسابات المحددة إن كان المستخدم مقيَّدًا) قبل تفويض التنفيذ الفعلي إلى
// getUnifiedStatement_ الداخلية؛ الأدوات التشخيصية الداخلية (مثل debugPartyName) تستدعي
// النسخة الداخلية مباشرة بلا حاجة لتمرير جلسة، لأنها ليست استدعاءً من مستخدم عبر الواجهة
function getUnifiedStatement(partyName, start, end, token) {
  var user = requirePermission_(token, 'statement', 'view');
  if (partyName && !statementAccountAllowed_(user, partyName)) {
    throw new Error('لا تملك صلاحية الوصول إلى حساب "' + partyName + '" — تواصل مع المدير لإضافته لقائمة حساباتك المسموحة');
  }
  return getUnifiedStatement_(partyName, start, end);
}

function getUnifiedStatement_(partyName, start, end) {
  try {
    var todayStr = Utilities.formatDate(new Date(), 'GMT+3', 'dd/MM/yyyy HH:mm');
    if (!partyName) {
      return { party: partyName, roles: [], start: '---', end: '---', today: todayStr, rows: [], totals: null, warnings: [], accountCode: '' };
    }
    var accountCode = (getAllAccountProfiles_()[partyName.toString().trim()] || {}).code || '';

    var data = getSourceRowsCached_();
    var safeStart = start ? new Date(start) : null; if (safeStart) safeStart.setHours(0, 0, 0, 0);
    var safeEnd = end ? new Date(end) : null; if (safeEnd) safeEnd.setHours(23, 59, 59, 999);

    var roles = {}, prevTotal = 0, items = [], warnings = [];

    function pushItem(d, role) {
      if (!d) return;
      var beforePeriod = safeStart && d.tDate < safeStart.getTime();
      var inPeriod = (!safeStart || d.tDate >= safeStart.getTime()) && (!safeEnd || d.tDate <= safeEnd.getTime());
      var rawDebit = role === 'client' ? d.val : 0;
      var rawCredit = role === 'supplier' ? d.val : 0;
      if (beforePeriod) { if (d.hasPrice) prevTotal += (rawDebit - rawCredit); return; }
      if (!inPeriod) return;
      if (!d.hasPrice) warnings.push({ hotelRef: d.hotelRef, innerRef: d.innerRef, role: role, date: Utilities.formatDate(new Date(d.tDate), 'GMT+3', 'dd/MM/yyyy') });
      items.push({
        date: d.tDate, ref: d.ref, qaid: d.qaid, role: role, note: d.note, counterparty: d.counterparty,
        debit: rawDebit, credit: rawCredit, excluded: !d.hasPrice, paymentId: null, bookingKey: d.key,
        checkInTs: d.checkInTs || 0, checkOutTs: d.checkOutTs || 0
      });
    }

    var partyNorm = normalizeName_(partyName);
    data.forEach(function (fullRow) {
      var raw = fullRow.slice(0, SOURCE_LAST_COL);
      var city = fullRow[SOURCE_LAST_COL];
      if (raw[15] === 'لاغي') return;
      if (normalizeName_(raw[3]) === partyNorm) { roles.client = true; pushItem(describeBooking_(raw, 'client', city), 'client'); }
      if (normalizeName_(raw[14]) === partyNorm) { roles.supplier = true; pushItem(describeBooking_(raw, 'supplier', city), 'supplier'); }
    });

    var pData = getPaymentsRowsCached_(); // مقروءة مرة واحدة لكل تنفيذ — تخدم كل حسابات كشف الحساب
    if (pData.length) {
      pData.forEach(function (p) {
        if (normalizeName_(p[1]) !== partyNorm) return;
        var pDateObj = p[0] instanceof Date ? new Date(p[0].getTime()) : new Date(p[0]);
        if (isNaN(pDateObj.getTime())) return;
        pDateObj.setHours(0, 0, 0, 0);
        var pTs = pDateObj.getTime();
        var dir = p[2];
        var isReceived = dir === 'استلمنا منه' || dir === 'مدين يدوي';
        var rawDebit = isReceived ? 0 : (parseFloat(p[3]) || 0);
        var rawCredit = isReceived ? (parseFloat(p[3]) || 0) : 0;
        // بند يدوي (مدين/دائن) يُطبَّق مباشرة بنفس اتجاهه المُسمّى، وليس بمنطق دفعة
        if (dir === 'مدين يدوي') { rawDebit = parseFloat(p[3]) || 0; rawCredit = 0; }
        if (dir === 'دائن يدوي') { rawDebit = 0; rawCredit = parseFloat(p[3]) || 0; }
        var beforePeriod = safeStart && pTs < safeStart.getTime();
        var inPeriod = (!safeStart || pTs >= safeStart.getTime()) && (!safeEnd || pTs <= safeEnd.getTime());
        if (beforePeriod) { prevTotal += (rawDebit - rawCredit); return; }
        if (!inPeriod) return;
        items.push({
          date: pTs, ref: dir.indexOf('يدوي') !== -1 ? 'قيد يدوي' : 'دفعة', qaid: p[5] || '',
          role: dir.indexOf('يدوي') !== -1 ? 'manual' : 'payment', counterparty: '',
          note: p[4] || DEFAULT_PAYMENT_NOTE, debit: rawDebit, credit: rawCredit, excluded: false, paymentId: p[7],
          checkInTs: 0, checkOutTs: 0,   // دفعة/قيد يدوي — لا تاريخ دخول أو خروج لها
          legacyImported: !!p[8]
        });
      });
    }

    items.sort(function (a, b) { return a.date - b.date; });
    var running = prevTotal;
    var sumD = prevTotal > 0 ? prevTotal : 0, sumC = prevTotal < 0 ? Math.abs(prevTotal) : 0;

    var finalRows = items.map(function (it) {
      if (!it.excluded) { running += it.debit - it.credit; sumD += it.debit; sumC += it.credit; }
      return {
        ref: it.ref, qaid: it.qaid || '', role: it.role, counterparty: it.counterparty, paymentId: it.paymentId, bookingKey: it.bookingKey || null,
        note: it.note + (it.excluded ? ' — ⚠ مستبعد من الرصيد (بدون سعر)' : ''),
        legacyImported: !!it.legacyImported,
        debit: it.excluded ? null : fmtMoneyRounded_(it.debit),
        credit: it.excluded ? null : fmtMoneyRounded_(it.credit),
        balance: it.excluded ? null : fmtWithStatus_(running),
        excluded: it.excluded,
        dateDisp: Utilities.formatDate(new Date(it.date), 'GMT+3', 'dd/MM/yyyy'),
        dateIso: Utilities.formatDate(new Date(it.date), 'GMT+3', 'yyyy-MM-dd'),
        // عمودان اختياريان (مخفيان افتراضيًا) — النص للعرض والقيمة الخام للترتيب الزمني
        checkIn: it.checkInTs ? Utilities.formatDate(new Date(it.checkInTs), 'GMT+3', 'dd/MM/yyyy') : '',
        checkOut: it.checkOutTs ? Utilities.formatDate(new Date(it.checkOutTs), 'GMT+3', 'dd/MM/yyyy') : '',
        checkInTs: it.checkInTs || 0, checkOutTs: it.checkOutTs || 0
      };
    });

    var startDisp = safeStart ? Utilities.formatDate(safeStart, 'GMT+3', 'dd/MM/yyyy') : '';
    var endDisp = safeEnd ? Utilities.formatDate(safeEnd, 'GMT+3', 'dd/MM/yyyy') : '';

    // الرصيد التراكمي الحقيقي حتى اليوم (بغض النظر عن الفترة المعروضة) — نفس منطق الحساب
    // كامل التاريخ إلى نهاية اليوم الحالي، متطابق مع "متابعة الأرصدة"
    var todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    // من دفتر الأرصدة الموحَّد نفسه (مقصورًا على هذا الطرف فقط) — نفس الدالة التي تحسب رصيد
    // متابعة الأرصدة وبيان الأرصدة والبوت، فلا توجد نسخة ثالثة للمنطق قد تنحرف عنها لاحقًا
    var todayBalance = buildBalanceLedger_({ data: data, payments: pData, onlyName: partyName })
      .balanceAsOf(partyName, todayEnd.getTime());

    return safeReturn_({
      party: partyName,
      roles: Object.keys(roles),
      start: startDisp || '---', end: endDisp || '---', today: todayStr,
      opening: fmtWithStatus_(prevTotal),
      rows: finalRows,
      totals: { debit: fmtMoneyRounded_(sumD), credit: fmtMoneyRounded_(sumC), balance: fmtWithStatus_(sumD - sumC) },
      todayBalance: fmtWithStatus_(todayBalance),
      warnings: warnings,
      accountCode: accountCode
    });
  } catch (e) {
    Logger.log('Error in getUnifiedStatement: ' + e.message);
    throw new Error('حدث خطأ أثناء جلب كشف الحساب: ' + e.message);
  }
}


// ==========================================================
// تنبيهات تليجرام — المرحلة أ: محرّك الطابور والإرسال
// ==========================================================
// لماذا طابور ومشغّل زمني بدل إرسال مباشر داخل دالة الطلب؟
// إرسال UrlFetchApp من داخل portalSubmitEditRequest يضيف مئات المللي ثانية على نداء بطيء
// أصلًا، والأخطر: لو تعطّل تليجرام أو انتهت مهلة الطلب، يفشل تسجيل طلب العميل نفسه.
// الطابور يفصل الاثنين تمامًا: الطلب يُسجَّل أولًا ودائمًا، ثم يُدرَج التنبيه في ورقة، ثم
// يسحبه مشغّل زمني كل دقيقة ويرسله — ويعيد المحاولة تلقائيًا إن فشل. أقصى تأخير دقيقة،
// وهو مقبول تمامًا لغرض "نبّه الموظفين ليفتحوا البرنامج".
var TG_QUEUE_SHEET_ = 'قائمة تنبيهات تليجرام';
var TG_PROP_KEY_ = 'TELEGRAM_CFG';       // إعدادات بلا التوكن
var TG_PROP_TOKEN_ = 'TELEGRAM_TOKEN';   // التوكن وحده في مفتاح منفصل — لا يُعاد للواجهة أبدًا
var TG_MAX_PER_RUN_ = 15;                // حد تليجرام ~20 رسالة/دقيقة للجروب الواحد
var TG_MAX_ATTEMPTS_ = 5;

// كتالوج الأحداث: التوسعة لاحقًا = سطر هنا + نداء tgEnqueue_ واحد في مكان الحدث
var TG_EVENTS_ = [
  { key: 'req_edit',   label: 'طلب تعديل حجز من عميل',        def: true  },
  { key: 'req_new',    label: 'طلب حجز جديد من عميل',          def: true  },
  { key: 'req_cancel', label: 'طلب إلغاء حجز من عميل',         def: true  },
  { key: 'req_bulk',   label: 'رفع مجمَّع من عميل',             def: true  },
  { key: 'req_msg',       label: 'رسالة جديدة من عميل على طلب',            def: true  },
  // المرحلة ج — تنبيهات مجدولة (تُرسَل مرة واحدة يوميًا في وقت محدَّد)
  { key: 'daily_arrivals', label: 'ملخص الدخول اليومي (مجدول)',            def: true,  scheduled: true },
  { key: 'daily_missing',  label: 'حجوزات ناقصة البيانات (مجدول)',         def: false, scheduled: true },
  // المرحلة د — تنبيهات فورية اختيارية
  { key: 'payment',        label: 'تسجيل دفعة (عميل أو مورد)',             def: false },
  { key: 'balance_soon',   label: 'تغيّر رصيد عميل له دخول اليوم أو غدًا',  def: false },
  { key: 'confirmation',   label: 'إصدار مستند تأكيد حجز',                 def: false },
  { key: 'booking_new',    label: 'تسجيل حجز جديد',                        def: false },
  { key: 'booking_edit',   label: 'تعديل بيانات حجز',                      def: false }
];

function tgDefaultCfg_() {
  var ev = {};
  TG_EVENTS_.forEach(function (e) { ev[e.key] = e.def; });
  return {
    enabled: false, chatId: '', chatTitle: '', style: 'detailed',
    events: ev, quietFrom: '', quietTo: '', showPrices: false,
    dailyArrivalsHour: 7,  // ملخص الدخول: 7 صباحًا
    dailyMissingHour: 20   // الحجوزات الناقصة: 8 مساءً
  };
}
function tgCfg_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(TG_PROP_KEY_);
    if (!raw) return tgDefaultCfg_();
    var c = JSON.parse(raw), d = tgDefaultCfg_();
    // دمج مع الافتراضي: أي مفتاح حدث جديد يُضاف بقيمته الافتراضية بلا فقدان اختيارات المستخدم
    Object.keys(d).forEach(function (k) { if (c[k] === undefined) c[k] = d[k]; });
    Object.keys(d.events).forEach(function (k) { if (c.events[k] === undefined) c.events[k] = d.events[k]; });
    return c;
  } catch (e) { return tgDefaultCfg_(); }
}
function tgToken_() { return PropertiesService.getScriptProperties().getProperty(TG_PROP_TOKEN_) || ''; }

function ensureTgQueueSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(TG_QUEUE_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(TG_QUEUE_SHEET_);
    sh.getRange(1, 1, 1, 8).setValues([[
      'المعرّف', 'وقت الإدراج', 'نوع الحدث', 'البيانات', 'الحالة', 'المحاولات', 'آخر خطأ', 'وقت الإرسال'
    ]]);
    sh.setFrozenRows(1);
    sh.hideSheet(); // ورقة تشغيلية داخلية — لا يحتاج المستخدم رؤيتها
  }
  return sh;
}

// يُستدعى من داخل دوال الطلبات بعد نجاح الكتابة — صامت تمامًا: أي فشل هنا لا يمسّ الطلب
function tgEnqueue_(eventType, payload) {
  try {
    var skip = tgWhyNotSending_(eventType);
    if (skip) return { queued: false, reason: skip };
    ensureTgQueueSheet_().appendRow([
      Utilities.getUuid().slice(0, 8), new Date(), eventType,
      JSON.stringify(payload || {}), 'معلق', 0, '', ''
    ]);
    tgQueueFlagSet_();          // إشارة للمهمة الدورية: يوجد ما يُرسَل فعلاً
    return { queued: true };
  } catch (e) {
    Logger.log('tgEnqueue_: ' + e.message);
    return { queued: false, reason: e.message };
  }
}
// راية "الطابور غير فارغ" في الكاش. المهمة الدورية كانت تفتح ملف الشيت وتقرأ ورقة الطابور
// كل دقيقة حتى وهو فارغ تمامًا (2-14 ثانية من حصة التنفيذ في كل مرة، تُزاحم البوت التفاعلي).
// الراية تجعل الدورة الفارغة شبه مجانية. الكاش قد يُمسَح فجأة، فلا نعتمد عليه وحده: كل 10
// دقائق نفحص الورقة فعليًا مهما قالت الراية — فأسوأ حالة تأخير مسح الكاش عشر دقائق، لا الأبد
var TG_Q_FLAG_ = 'tgq_pending';
var TG_Q_SWEEP_ = 'tgq_sweep';
function tgQueueFlagSet_() {
  try { CacheService.getScriptCache().put(TG_Q_FLAG_, '1', 21600); } catch (e) {}
}
function tgQueueFlagClear_() {
  try { CacheService.getScriptCache().remove(TG_Q_FLAG_); } catch (e) {}
}
// true = يستحق فتح الشيت الآن (يوجد معلق، أو حان وقت الفحص الاحتياطي كل 10 دقائق)
function tgQueueShouldScan_() {
  try {
    var c = CacheService.getScriptCache();
    if (c.get(TG_Q_FLAG_)) return true;
    if (c.get(TG_Q_SWEEP_)) return false;
    c.put(TG_Q_SWEEP_, '1', 600);
    return true;
  } catch (e) { return true; }   // تعذّر الكاش — نعود للسلوك القديم (افحص دائمًا)
}
// سبب عدم الإرسال بنص مفهوم — كان الصمت هنا يجعل "لم تصل رسالة" لغزًا بلا أي أثر
function tgWhyNotSending_(eventType) {
  var cfg = tgCfg_();
  if (!tgToken_()) return 'توكن البوت غير مضبوط (قسم "تنبيهات تليجرام" ← الاتصال).';
  if (!cfg.enabled) return 'المفتاح الرئيسي "تفعيل تنبيهات تليجرام" غير مفعّل.';
  if (!cfg.chatId) return 'معرّف الجروب غير مضبوط — أرسل /chatid داخل الجروب ثم الصقه هنا.';
  if (eventType && cfg.events[eventType] === false) {
    var lbl = eventType;
    TG_EVENTS_.forEach(function (e) { if (e.key === eventType) lbl = e.label; });
    return 'التنبيه "' + lbl + '" غير مفعّل في قائمة التنبيهات.';
  }
  return '';
}

// ---- بناء نص الرسالة ----
function tgEsc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function tgCityIcon_(city) {
  var c = String(city || '');
  if (c.indexOf('مكة') >= 0) return '🕋';
  if (c.indexOf('مدين') >= 0) return '🕌';
  return '📍';
}
function tgEventTitle_(t) {
  return { req_edit: 'طلب تعديل حجز', req_new: 'طلب حجز جديد', req_cancel: 'طلب إلغاء حجز',
           req_bulk: 'رفع مجمَّع لحجوزات', req_msg: 'رسالة جديدة من عميل',
           payment: 'تسجيل دفعة', daily_arrivals: 'ملخص الدخول اليومي',
           daily_missing: 'حجوزات ناقصة البيانات', balance_soon: 'تغيّر رصيد عميل قريب الدخول',
           confirmation: 'إصدار تأكيد حجز', booking_new: 'تسجيل حجز جديد',
           booking_edit: 'تعديل بيانات حجز' }[t] || 'تنبيه';
}
function tgEventIcon_(t) {
  return { req_edit: '✏️', req_new: '🆕', req_cancel: '❌', req_bulk: '📦',
           req_msg: '💬', payment: '💰', daily_arrivals: '🌅', daily_missing: '⚠️',
           balance_soon: '📊', confirmation: '📄', booking_new: '🆕', booking_edit: '✏️' }[t] || '🔔';
}
// جمع صحيح بالعربية: ليلة / ليلتان / ليالي / ليلة — "5 ليلة" كانت ركيكة
function tgNights_(n) {
  n = parseInt(n, 10);
  if (!n || n < 1) return '';
  if (n === 1) return 'ليلة واحدة';
  if (n === 2) return 'ليلتان';
  if (n <= 10) return n + ' ليالي';
  return n + ' ليلة';
}
function tgRooms_(n) {
  n = parseInt(n, 10) || 0;
  if (n === 1) return 'غرفة واحدة';
  if (n === 2) return 'غرفتان';
  if (n <= 10) return n + ' غرف';
  return n + ' غرفة';
}
// جمع صحيح: حساب / حسابان / حسابات — "3 حسابًا" ركيكة كـ"3 حجز"
function tgAccounts_(n) {
  n = parseInt(n, 10) || 0;
  if (n === 1) return 'حساب واحد';
  if (n === 2) return 'حسابان';
  if (n <= 10) return n + ' حسابات';
  return n + ' حسابًا';
}
// جمع صحيح: حجز / حجزان / حجوزات — "3 حجز" ركيكة
function tgBookings_(n) {
  n = parseInt(n, 10) || 0;
  if (n === 1) return 'حجز واحد';
  if (n === 2) return 'حجزان';
  if (n <= 10) return n + ' حجوزات';
  return n + ' حجزًا';
}
// ==========================================================
// لبنات العرض المنظَّم في رسائل البوت (البيانات والأرصدة وكشف الحساب)
// ==========================================================
// كانت البيانات أسطرًا متتابعة تفصلها شَرطات ("عميل — فندق — 3 غرف 60 ليال")، فلا تعرف
// العين أين ينتهي بند ويبدأ الذي يليه ولا أي اسم هو العميل وأيهما الفندق. البديل هنا:
// كانت كل مجموعة داخل <blockquote> (شريط جانبي يحترم RTL تلقائيًا يفصل حدود المجموعة بلا
// رسم خطوط بأحرف يُفسدها البايدي) — لكن تليجرام يرسم <blockquote> بلون خلفية/نص من "لون
// التمييز" (accent) المضبوط في تطبيق المستخدم نفسه (أزرق افتراضيًا لدى كثيرين)، ولا توجد أي
// وسيلة عبر Bot API لتحييد هذا اللون أو اختيار لون مختلف — فيظهر خلفية زرقاء غير مقصودة عند
// من لم يغيّر لون التمييز الافتراضي. الفصل الآن بسطر فارغ فقط (بلا أي وسم)، فلا اعتماد على
// أي لون لا نتحكم فيه، مقابل فقدان الشريط الجانبي المرئي — تعويضه بعنوان غامق لكل مجموعة يبقى
// كافيًا لتمييزها.
//  (1) كل حقل بأيقونة ثابتة تسبقه، فيُعرف نوعه من الأيقونة لا من ترتيبه.
//  (2) الأرقام وحدها داخل <code> بعرض ثابت — الخط أحادي المسافة يضعها في عمود واحد فعلاً.
// جدول <pre> كامل بأعمدة محاذاة غير صالح هنا: خط تليجرام أحادي المسافة لا يشمل الحروف
// العربية (تسقط لخط متناسب)، فتنهار المحاذاة تمامًا، كما تُجبر الأسماء الطويلة القارئ على
// تمرير أفقي داخل الكتلة.
function tgQuote_(lines) {
  return (lines || []).filter(function (l) {
    return l !== null && l !== undefined && l !== false;
  }).join('\n');
}
// موازِن طول الرسالة: يبني الكتل بندًا بندًا ويتوقّف عند حدّ تليجرام، ويعدّ ما لم يتّسع له.
function tgBlockBuilder_(reservedLen) {
  return {
    left: TG_MSG_LIMIT_ - (reservedLen || 0) - 60,
    skipped: 0, blocks: [], rows: null,
    // يفتح كتلة جديدة بترويستها — false لو لم يبق في الرسالة متسع لها (فتُعدّ بنودها محذوفة)
    open: function (headerLine) {
      this.flush();
      var cost = headerLine.length + 4;
      if (this.left - cost < 0) { this.rows = null; return false; }
      this.left -= cost; this.rows = [headerLine]; return true;
    },
    // بند كامل (سطر أو عدة أسطر) — يُضاف إن اتّسع، وإلا يُعدّ ضمن المحذوف
    add: function (lines) {
      if (!this.rows) { this.skipped++; return false; }
      var cost = lines.join('\n').length + 1;
      if (this.left - cost < 0) { this.skipped++; return false; }
      this.left -= cost;
      var self = this; lines.forEach(function (l) { self.rows.push(l); });
      return true;
    },
    // سطر ختامي (إجماليات القسم) ليس بندًا — يُسقَط بصمت عند الضيق ولا يُعدّ محذوفًا
    note: function (lines) {
      if (!this.rows) return;
      var cost = lines.join('\n').length + 1;
      if (this.left - cost < 0) return;
      this.left -= cost;
      var self = this; lines.forEach(function (l) { self.rows.push(l); });
    },
    flush: function () {
      if (this.rows && this.rows.length > 1) this.blocks.push(tgQuote_(this.rows));
      this.rows = null;
    },
    render: function (unitWord) {
      this.flush();
      // سطر فارغ إضافي بين كل مجموعة والتالية (بلا <blockquote> الآن) هو الفاصل البصري
      // الوحيد المتبقي — عنوان كل مجموعة غامق أصلاً فيكفي مع هذه المسافة لتمييزها
      return this.blocks.join('\n\n') + (this.skipped
        ? ('\n… <i>و' + this.skipped + ' ' + (unitWord || 'بندًا') + ' آخر — افتح البرنامج للقائمة كاملة</i>')
        : '');
    }
  };
}
function tgMoney_(n) {
  return Math.round(parseFloat(n) || 0).toLocaleString('en-US');
}
// حشو يسار داخل <code> ⟵ العمود الرقمي الوحيد الذي تصح محاذاته في تليجرام
function tgPadNum_(s, w) {
  s = String(s === null || s === undefined ? '' : s);
  while (s.length < (w || 0)) s = ' ' + s;
  return s;
}
// أوسع مبلغ في القائمة يحدد عرض العمود، فلا يتضخّم العمود لأرقام غير موجودة أصلًا
function tgAmountWidth_(nums) {
  var w = 5;
  (nums || []).forEach(function (n) {
    var l = tgMoney_(Math.abs(parseFloat(n) || 0)).length;
    if (l > w) w = l;
  });
  return Math.min(w, 13);
}
// اسم طويل يلتف ثلاثة أسطر يُفقد البند شكله — نقصّه بثلاث نقاط
function tgTrim_(s, max) {
  s = String(s === null || s === undefined ? '' : s).trim();
  max = max || 40;
  return s.length > max ? (s.slice(0, max - 1) + '…') : s;
}
// سطر رصيد واحد موحَّد في كل شاشات البوت: الاسم ثم المبلغ داخل <code> ثم حالته بلغة العمل —
// سطر ممتد واحد لا سطران، فتملأ القائمة عرض الفقاعة بدل تطويلها رأسيًا بلا داعٍ
function tgBalLine_(name, num, role, warn) {
  var st = tgBalanceState_(num, role);
  return st.icon + ' <b>' + tgEsc_(tgTrim_(name, 34)) + '</b>  <code>' +
    (st.amount ? tgMoney_(st.amount) : '—') + '</code>  ' + tgEsc_(st.word) + (warn ? ' ⚠️' : '');
}
// تذييل الإجراء يختلف باختلاف الحدث — "افتح شاشة الطلبات" لا معنى لها بعد تسجيل دفعة
function tgCta_(t) {
  if (t === 'req_edit' || t === 'req_new' || t === 'req_cancel' || t === 'req_bulk' || t === 'req_msg') {
    return '🔗 افتح البرنامج ← شاشة الطلبات لاتخاذ إجراء';
  }
  if (t === 'balance_soon') return '🔗 افتح كشف حساب العميل للمراجعة قبل الدخول';
  if (t === 'payment') return '🔗 افتح كشف الحساب لمراجعة الحركة';
  return '';
}
function tgStamp_(d) {
  d = d || new Date();
  var p = function (n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// أربعة أنماط للرسالة يختار المستخدم بينها من شاشة الإعدادات (معاينة مباشرة هناك)
// compact  = سطران مضغوطان   · detailed = أقسام مفصّلة (الافتراضي)
// card     = بطاقة بخطوط فاصلة · minimal  = أقصر صيغة ممكنة
function tgBuildMessage_(eventType, p, style) {
  p = p || {};
  // رسالة مبنية مسبقًا بالكامل (تنبيه تعديل الحجز) — تُعرض كما هي بلا إعادة تنسيق. أسطر
  // الأرصدة وحدها تُلحَق بعدها لأنها لا تكون جاهزة وقت البناء (تُحسَب في مهمة التفريغ)
  if (p.preformatted) {
    var bbPre = tgBalancesBlock_(p.balances, false);
    return p.preformatted + (bbPre ? ('\n━━━━━━━━━━━━━━' + bbPre) : '');
  }
  // التنبيهات المجدولة قوائم مجمَّعة لا حجزًا واحدًا — لها بنّاء منفصل لا يتأثر بنمط العرض
  if (eventType === 'daily_arrivals' || eventType === 'daily_missing') return tgBuildDigest_(eventType, p);
  var cfg = tgCfg_();
  var icon = tgEventIcon_(eventType), title = tgEventTitle_(eventType);
  var when = p.ts ? tgStamp_(new Date(p.ts)) : tgStamp_();
  var city = p.city ? (tgCityIcon_(p.city) + ' ' + tgEsc_(p.city)) : '';
  var dates = (p.checkIn || p.checkOut) ? (tgEsc_(p.checkIn || '؟') + ' ← ' + tgEsc_(p.checkOut || '؟')) : '';
  var money = (cfg.showPrices && p.amount) ? ('\n💵 المبلغ: <b>' + tgEsc_(p.amount) + '</b>') : '';
  // تنبيه الدفعة (مفردة أو مزدوجة): سطر المبلغ أول رقم يريد الموظف رؤيته عند فتح التنبيه،
  // فيُكتَب في السطر التالي لاسم العميل/الحسابين مباشرة بدل ذيل الرسالة كباقي التنبيهات —
  // بنفس إعداد "إظهار المبالغ" الذي يتحكم بالمبلغ في كل تنبيه آخر (لا حساسية سعر حجز هنا،
  // لكن نبقيه خاضعًا لنفس المفتاح حتى لا نُفاجئ من أوقفه عمدًا)
  var isPayEvt = eventType === 'payment';
  var payAmountRaw = (isPayEvt && cfg.showPrices && p.amount) ? tgEsc_(p.amount) : '';
  if (isPayEvt) money = ''; // يُدرَج يدويًا في مكانه الصحيح أدناه داخل كل نمط بدل الذيل

  if (style === 'minimal') {
    var bits = [tgEsc_(p.client)];
    if (payAmountRaw) bits.push('💵 ' + payAmountRaw);
    if (p.hotel) bits.push(tgEsc_(p.hotel));
    if (dates) bits.push(dates);
    if (p.rooms) bits.push('🛏 ' + tgEsc_(p.rooms));
    if (p.hotelRef) bits.push('🏨🔖 ' + tgEsc_(p.hotelRef));
    if (p.count) bits.push(tgEsc_(p.count) + ' حجز');
    var tail = p.reason ? ('\n❗ ' + tgEsc_(p.reason)) : (p.message ? ('\n💬 ' + tgEsc_(p.message)) : '');
    // التعديل المطلوب (قديم ⟶ جديد) — بلا هذا السطر لا يظهر للموظف ماذا طلب العميل تحديدًا
    if (p.diffText) tail += '\n📝 <b>التعديل المطلوب:</b>\n' + tgEsc_(p.diffText);
    tail += tgBalancesBlock_(p.balances, true);
    return icon + ' <b>' + title + '</b> — ' + bits.filter(Boolean).join(' · ') + tail + money;
  }

  if (style === 'compact') {
    var l2 = [];
    if (payAmountRaw) l2.push('💵 ' + payAmountRaw);
    if (p.hotel) l2.push('🏨 ' + tgEsc_(p.hotel));
    if (city) l2.push(city);
    if (dates) l2.push('📅 ' + dates);
    if (p.nights) l2.push('🌙 ' + tgNights_(p.nights));
    if (p.rooms) l2.push('🛏 ' + tgEsc_(p.rooms));
    if (p.ref) l2.push('🔖 ' + tgEsc_(p.ref));
    if (p.hotelRef) l2.push('🏨🔖 ' + tgEsc_(p.hotelRef));
    if (p.count) l2.push('📦 ' + tgEsc_(p.count) + ' حجز');
    return icon + ' <b>' + title + '</b> · 👤 ' + tgEsc_(p.client) +
      (l2.length ? ('\n' + l2.join(' · ')) : '') +
      // السبب والرسالة هما جوهر تنبيه الإلغاء/الرسالة — إسقاطهما يُفرِغ التنبيه من معناه
      (p.arrivals && p.arrivals.length
        ? ('\n🚨 دخول قريب: ' + p.arrivals.slice(0, 3).map(function (a) {
            return a.when + ' ' + tgEsc_(a.hotel || '؟');
          }).join(' · ')) : '') +
      (p.balance ? ('\n📊 الرصيد بعد الحركة: <b>' + tgEsc_(p.balance) + '</b>') : '') +
      tgBalancesBlock_(p.balances, true) +
      (p.payDate ? ('\n📅 تاريخ السداد: <b>' + tgEsc_(p.payDate) + '</b>') : '') +
      (p.qaid ? ('\n🧾 رقم القيد: <code>' + tgEsc_(p.qaid) + '</code>') : '') +
      (p.confirmType ? ('\n📑 ' + tgEsc_(p.confirmType)) : '') +
      (p.by ? ('\n👥 ' + tgEsc_(p.by)) : '') +
      (p.reason ? ('\n❗ <b>السبب:</b> ' + tgEsc_(p.reason)) : '') +
      (p.message ? ('\n💬 ' + tgEsc_(p.message)) : '') +
      (p.note ? ('\n📝 ' + tgEsc_(p.note)) : '') +
      (p.diffText ? ('\n📝 <b>التعديل المطلوب:</b>\n' + tgEsc_(p.diffText)) : '') + money +
      '\n<i>⏰ ' + when + '</i>';
  }

  if (style === 'card') {
    var pad = function (k) { return (k + '            ').slice(0, 12); };
    var rows = [];
    if (p.client) rows.push(pad('العميل') + ': ' + tgEsc_(p.client));
    if (payAmountRaw) rows.push(pad('المبلغ') + ': ' + payAmountRaw);
    if (p.hotel) rows.push(pad('الفندق') + ': ' + tgEsc_(p.hotel));
    if (p.city) rows.push(pad('المدينة') + ': ' + tgEsc_(p.city));
    if (p.checkIn) rows.push(pad('الدخول') + ': ' + tgEsc_(p.checkIn));
    if (p.checkOut) rows.push(pad('الخروج') + ': ' + tgEsc_(p.checkOut));
    if (p.nights) rows.push(pad('الليالي') + ': ' + tgNights_(p.nights));
    if (p.rooms) rows.push(pad('الغرف') + ': ' + tgEsc_(p.rooms));
    if (p.ref) rows.push(pad('رقم الحجز') + ': ' + tgEsc_(p.ref));
    if (p.hotelRef) rows.push(pad('رقم الفندق') + ': ' + tgEsc_(p.hotelRef));
    if (p.count) rows.push(pad('عدد الحجوزات') + ': ' + tgEsc_(p.count));
    if (!isPayEvt && cfg.showPrices && p.amount) rows.push(pad('المبلغ') + ': ' + tgEsc_(p.amount));
    if (p.payDate) rows.push(pad('تاريخ السداد') + ': ' + tgEsc_(p.payDate));
    if (p.qaid) rows.push(pad('رقم القيد') + ': ' + tgEsc_(p.qaid));
    if (p.balance) rows.push(pad('الرصيد') + ': ' + tgEsc_(p.balance));
    (p.balances || []).forEach(function (b, i) {
      rows.push(pad(i === 0 ? 'الرصيد بعدها' : '') + ': ' + tgEsc_(b.name) + ' — ' + tgEsc_(b.text));
    });
    if (p.confirmType) rows.push(pad('نوع التأكيد') + ': ' + tgEsc_(p.confirmType));
    if (p.by) rows.push(pad('بواسطة') + ': ' + tgEsc_(p.by));
    if (p.arrivals && p.arrivals.length) {
      p.arrivals.slice(0, 4).forEach(function (a, i) {
        rows.push(pad(i === 0 ? 'دخول قريب' : '') + ': ' + a.when + ' ' + tgEsc_(a.hotel || '؟'));
      });
    }
    // \n بعد </pre> ضروري: بدونه يلتصق أول سطر تالٍ بآخر صف داخل الجدول
    return icon + ' <b>' + title + '</b>\n' +
      '<pre>' + rows.join('\n') + '</pre>\n' +
      (p.reason ? ('❗ <b>السبب:</b> ' + tgEsc_(p.reason) + '\n') : '') +
      (p.message ? ('💬 ' + tgEsc_(p.message) + '\n') : '') +
      (p.note ? ('📝 ' + tgEsc_(p.note) + '\n') : '') +
      (p.diffText ? ('📝 <b>التعديل المطلوب:</b>\n' + tgEsc_(p.diffText) + '\n') : '') +
      '<i>⏰ ' + when + '</i>';
  }

  // detailed (الافتراضي)
  var lines = [icon + ' <b>' + title + '</b>', ''];
  if (p.client) lines.push('👤 <b>العميل:</b> ' + tgEsc_(p.client));
  if (payAmountRaw) lines.push('💵 <b>المبلغ:</b> ' + payAmountRaw);
  if (p.hotel) lines.push('🏨 <b>الفندق:</b> ' + tgEsc_(p.hotel));
  if (city) lines.push('<b>المدينة:</b> ' + city);
  if (dates) lines.push('📅 <b>الفترة:</b> ' + dates + (p.nights ? (' <i>(' + tgNights_(p.nights) + ')</i>') : ''));
  if (p.rooms) lines.push('🛏 <b>الغرف:</b> ' + tgEsc_(p.rooms));
  if (p.ref) lines.push('🔖 <b>رقم الحجز:</b> ' + tgEsc_(p.ref));
  if (p.hotelRef) lines.push('🏨 <b>رقم حجز الفندق:</b> ' + tgEsc_(p.hotelRef));
  if (p.count) lines.push('📦 <b>عدد الحجوزات:</b> ' + tgEsc_(p.count));
  if (p.arrivals && p.arrivals.length) {
    lines.push('🚨 <b>دخول قريب:</b>');
    p.arrivals.slice(0, 5).forEach(function (a) {
      lines.push('   • ' + tgEsc_(a.when) + ' ' + tgEsc_(a.checkIn) + ' — ' +
        tgEsc_(a.hotel || 'بلا فندق') + ' ' + tgCityIcon_(a.city));
    });
    if (p.arrivals.length > 5) lines.push('   … و' + (p.arrivals.length - 5) + ' غيرها');
  }
  // الرصيد المتوقَّع يوم أول دخول — السطر الأهم للمراجعة قبل وصول الضيوف
  if (p.balanceAtCheckIn) {
    lines.push('💠 <b>رصيده يوم الدخول ' + tgEsc_(p.balanceAtDate || '') + ' هو:</b> ' + tgEsc_(p.balanceAtCheckIn));
  }
  if (p.balance) lines.push('📊 <b>الرصيد بعد الحركة:</b> ' + tgEsc_(p.balance));
  if (p.payDate) lines.push('📅 <b>تاريخ السداد:</b> ' + tgEsc_(p.payDate));
  if (p.qaid) lines.push('🧾 <b>رقم القيد:</b> <code>' + tgEsc_(p.qaid) + '</code>');
  if (p.balances && p.balances.length) lines.push(tgBalancesBlock_(p.balances, false).replace(/^\n/, ''));
  if (p.confirmType) lines.push('📑 <b>نوع التأكيد:</b> ' + tgEsc_(p.confirmType));
  if (p.by) lines.push('👥 <b>بواسطة:</b> ' + tgEsc_(p.by));
  if (p.reason) lines.push('❗ <b>السبب:</b> ' + tgEsc_(p.reason));
  if (p.message) lines.push('💬 <b>الرسالة:</b> ' + tgEsc_(p.message));
  if (p.note) lines.push('📝 <b>ملاحظات:</b> ' + tgEsc_(p.note));
  if (p.diffText) lines.push('📝 <b>التعديل المطلوب:</b>', tgEsc_(p.diffText));
  if (!isPayEvt && cfg.showPrices && p.amount) lines.push('💵 <b>المبلغ:</b> ' + tgEsc_(p.amount));
  lines.push('', '⏰ <i>' + when + '</i>');
  var cta = tgCta_(eventType);
  if (cta) lines.push(cta);
  return lines.join('\n');
}

// ==========================================================
// الرصيد التراكمي بعد الحركة — لطرف واحد أو لطرفي الدفعة المزدوجة
// ==========================================================
// يُحسَب في مهمة التفريغ الخلفية لا لحظة الحفظ: كشف الحساب عملية ثقيلة، وإقحامها في
// registerPayment أو في مسار تعديل الحجز كان سيُضيف ثوانيَ على انتظار المستخدم بلا داعٍ.
// لذلك يُدرَج في الطابور اسم الطرف ودوره المُرجَّح فقط (balParties)، ويُملأ balances قبل
// الإرسال مباشرةً — نفس مبدأ needsBalance المطبَّق أصلاً في تنبيه "رصيد عميل قريب الدخول"
function tgRoleFromDirection_(direction) {
  return resolveDirectionLabel_(direction) === 'دفعنا له' ? 'supplier' : 'client';
}
// الدور الحاسم من "بيانات الحسابات" إن وُجد، وإلا الدور المُرجَّح من اتجاه الحركة نفسها.
// حساب له الصفتان معًا (both) يبقى على الدور المُرجَّح: صياغة الرصيد تختلف جذريًا بين عميل
// ("مستحق عليه") ومورد ("مستحق له")، فاختيار الدور الخطأ يعكس معنى الرقم تمامًا
function tgResolveRole_(roleMap, name, hint) {
  var r = roleMap && roleMap[name];
  if (r === 'مورد') return 'supplier';
  if (r === 'عميل') return 'client';
  return hint || 'client';
}
function tgPartyBalanceLine_(name, role, asOfIso) {
  var st = getUnifiedStatement_(name, null, asOfIso || null);
  if (!st || !st.totals) return null;
  // بلا تاريخ محدَّد: الرصيد التراكمي "حتى اليوم" (todayBalance) لا الرصيد النهائي لكامل
  // الكشف (totals.balance يشمل أي حجز بتاريخ مستقبلي أيضًا لأن end=null هنا يعني بلا سقف) —
  // نفس الرقم بالضبط الذي تعرضه متابعة الأرصدة وبيان الأرصدة و"الرصيد الحالي" في كشف
  // الحساب، فلا يُفاجَأ من يقرأ تنبيه الدفعة برصيد أكبر يشمل حجوزات لم تبدأ بعد
  var balanceStr = asOfIso ? st.totals.balance : (st.todayBalance || st.totals.balance);
  var bst = tgBalanceState_(tgStmtSigned_(balanceStr), role);
  return { name: name, role: role,
    text: bst.icon + ' ' + (bst.amount ? tgMoney_(bst.amount) : '—') + ' ' + bst.word };
}
// أسطر الأرصدة كما تُعرَض في التنبيه — inline للأنماط المضغوطة (سطر واحد بفواصل)
function tgBalancesBlock_(balances, inline) {
  var arr = (balances || []).filter(Boolean);
  if (!arr.length) return '';
  var rows = arr.map(function (b) {
    return (b.role === 'supplier' ? '🤝' : '👤') + ' ' + tgEsc_(b.name) + ': ' + tgEsc_(b.text);
  });
  if (inline) return '\n📊 الرصيد بعدها — ' + rows.join(' · ');
  return '\n📊 <b>الرصيد التراكمي بعد الحركة:</b>\n' + rows.map(function (r) { return '   • ' + r; }).join('\n');
}
// يملأ payload.balances من payload.balParties — يُستدعى من مهمة التفريغ وحدها
function tgFillBalances_(payload) {
  if (!payload || !payload.balParties || !payload.balParties.length) return;
  var roleMap = {};
  try { roleMap = getPartyRoleMap_(); } catch (eRm) { /* تعذّرت الخريطة — نعتمد الدور المُرجَّح */ }
  var out = [];
  payload.balParties.forEach(function (bp) {
    if (!bp || !bp.name) return;
    try {
      var ln = tgPartyBalanceLine_(bp.name, tgResolveRole_(roleMap, bp.name, bp.roleHint), '');
      if (ln) out.push(ln);
    } catch (eBp) { /* طرف تعذّر حسابه — تُرسَل بقية الأطراف */ }
  });
  if (out.length) payload.balances = out;
  delete payload.balParties;
}

// ---- التنبيهات المجمَّعة (المرحلة ج) ----
// حد تليجرام للرسالة الواحدة 4096 حرفًا — نقصّ القائمة بأمان ونذكر كم بندًا لم يُعرض
var TG_MSG_LIMIT_ = 3900;
function tgClamp_(lines, headLen) {
  var out = [], len = headLen || 0;
  for (var i = 0; i < lines.length; i++) {
    if (len + lines[i].length + 1 > TG_MSG_LIMIT_) {
      out.push('… <i>و' + (lines.length - i) + ' بندًا آخر — افتح البرنامج للقائمة كاملة</i>');
      break;
    }
    out.push(lines[i]); len += lines[i].length + 1;
  }
  return out;
}

function tgBuildDigest_(eventType, p) {
  var icon = tgEventIcon_(eventType), title = tgEventTitle_(eventType);
  var head = icon + ' <b>' + title + '</b>\n📅 ' + tgEsc_(p.dateDisp || '') + '\n';

  if (eventType === 'daily_arrivals') {
    if (!p.groups || !p.groups.length) {
      return head + '\n✅ لا توجد حجوزات دخول اليوم.';
    }
    var tail = '\n📊 <b>الإجمالي:</b> ' + tgBookings_(p.totalBookings) + ' · ' + tgRooms_(p.totalRooms);
    if (p.unpriced) tail += '\n⚠️ <b>' + p.unpriced + '</b> منها بلا سعر مسجَّل';
    // كل مدينة كتلة مستقلة، وداخلها كل حجز سطر واحد مرقَّم يجمع اسم العميل والفندق ومرجعه
    // وتفاصيله — سطر ممتد بدل ثلاثة أسطر قصيرة متتالية: يقرأ أسرع ويملأ عرض الفقاعة بدل
    // تركها ضيقة طويلة رأسيًا (كل استعلامات البوت تتبع هذا المبدأ الآن)
    var b = tgBlockBuilder_(head.length + tail.length);
    p.groups.forEach(function (g) {
      b.open(tgCityIcon_(g.city) + ' <b>' + tgEsc_(g.city) + '</b>  ·  ' +
        tgBookings_(g.items.length) + '  ·  ' + tgRooms_(g.rooms));
      g.items.forEach(function (it, i) {
        var ref = it.hotelRef || it.innerRef;
        // 🆔 (لا 🔖) حين يكون المعروض رقم الحجز الداخلي (لا رقم حجز فندقي حقيقي) — رقمان
        // متجاوران بلا هذا التمييز كانا يُقرآن معًا كأن كلمة "غرفة" (من بند الغرف التالي)
        // تخص الرقم السابق له، خصوصًا لو تصادف الرقمان متقاربين أو تعطّل التفاف السطر
        var refIcon = it.hotelRef ? '🔖' : '🆔';
        var bits = ['<b>' + (i + 1) + '.</b> 👤 ' + (tgEsc_(tgTrim_(it.client, 28)) || '؟'),
          '🏨 ' + (tgEsc_(tgTrim_(it.hotel, 26)) || 'بلا فندق')];
        if (ref) bits.push(refIcon + ' ' + tgEsc_(tgTrim_(ref, 16)));
        bits.push('🛏 ' + tgRooms_(it.rooms));
        if (it.nights) bits.push('🌙 ' + tgNights_(it.nights));
        if (it.checkOut) bits.push('📤 ' + tgEsc_(it.checkOut));
        b.add(['', bits.join('  ·  ')]);
      });
    });
    return head + b.render('بندًا') + tail;
  }

  // daily_missing
  var tailM = '\n🔗 افتح "كل الحجوزات" لاستكمال البيانات';
  var bm = tgBlockBuilder_(head.length + tailM.length), any = false;
  var addSec = function (label, arr) {
    if (!arr || !arr.length) return;
    any = true;
    bm.open('<b>' + label + ' (' + arr.length + ')</b>');
    arr.slice(0, 12).forEach(function (it, i) {
      var bits = ['<b>' + (i + 1) + '.</b> 👤 ' + (tgEsc_(tgTrim_(it.client, 28)) || '؟'),
        '🏨 ' + (tgEsc_(tgTrim_(it.hotel, 26)) || 'بلا فندق')];
      if (it.checkIn) bits.push('📥 ' + tgEsc_(it.checkIn));
      bm.add(['', bits.join('  ·  ')]);
    });
    if (arr.length > 12) bm.note(['', '… و' + (arr.length - 12) + ' غيرها']);
  };
  addSec('🏨 بدون اسم فندق', p.noHotel);
  addSec('🏢 بدون مورد', p.noSupplier);
  addSec('💵 بدون سعر بيع', p.noSale);
  if (!any) return head + '\n✅ لا توجد حجوزات ناقصة البيانات — كل شيء مكتمل.';
  return head + bm.render('بندًا') + tailM;
}

// مسح خفيف على صفوف المصدر المخزَّنة (لا قراءة جديدة للملف الخارجي) — يُنفَّذ مرة يوميًا
function tgCollectArrivals_(dayTs) {
  var byCity = {}, order = [], total = 0, rooms = 0, unpriced = 0;
  getSourceRowsCached_().forEach(function (r) {
    var raw = r.slice(0, SOURCE_LAST_COL), city = r[SOURCE_LAST_COL] || '';
    if (raw[15] === 'لاغي') return;
    var cin = raw[7];
    var d = cin instanceof Date ? new Date(cin.getTime()) : new Date(cin);
    if (isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    if (d.getTime() !== dayTs) return;
    var rm = (parseInt(raw[10]) || 0) + (parseInt(raw[11]) || 0) + (parseInt(raw[12]) || 0) + (parseInt(raw[13]) || 0);
    if (!byCity[city]) { byCity[city] = { city: city, items: [], rooms: 0 }; order.push(city); }
    var co = raw[8] instanceof Date ? raw[8] : (raw[8] ? new Date(raw[8]) : null);
    byCity[city].items.push({
      client: (raw[3] || '').toString().trim(), hotel: (raw[4] || '').toString().trim(),
      rooms: rm, nights: parseInt(raw[9]) || 0,
      // رقم حجز الفندق وتاريخ الخروج يُغنيان البند عن فتح البرنامج لمعرفتهما — ولو لم يُسجَّل
      // رقم حجز فندقي بعد، رقم الحجز الداخلي أفضل من عدم عرض أي مرجع إطلاقًا
      hotelRef: (raw[17] || '').toString().trim(),
      innerRef: (raw[2] || '').toString().trim(),
      checkOut: (co && !isNaN(co.getTime())) ? Utilities.formatDate(co, 'GMT+3', 'dd/MM/yyyy') : ''
    });
    byCity[city].rooms += rm;
    total++; rooms += rm;
    if (!computeBookingTotal_(raw, 'client').hasPrice) unpriced++;
  });
  return {
    // ترتيب داخل المدينة بالفندق ثم العميل: حجوزات الفندق الواحد متجاورة فتُقرأ كمجموعة
    // واحدة بدل تناثرها بترتيب الشيت العشوائي
    groups: order.map(function (c) {
      byCity[c].items.sort(function (a, b) {
        return (a.hotel || '').localeCompare(b.hotel || '', 'ar') ||
               (a.client || '').localeCompare(b.client || '', 'ar');
      });
      return byCity[c];
    }),
    totalBookings: total, totalRooms: rooms, unpriced: unpriced,
    dateDisp: Utilities.formatDate(new Date(dayTs), 'GMT+3', 'dd/MM/yyyy')
  };
}

// الحجوزات الناقصة القادمة فقط (دخولها اليوم أو لاحقًا) — الماضية لا إجراء عليها
function tgCollectMissing_() {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var todayTs = today.getTime();
  var noHotel = [], noSupplier = [], noSale = [];
  getSourceRowsCached_().forEach(function (r) {
    var raw = r.slice(0, SOURCE_LAST_COL);
    if (raw[15] === 'لاغي') return;
    var cin = raw[7];
    var d = cin instanceof Date ? new Date(cin.getTime()) : new Date(cin);
    if (isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < todayTs) return;
    var item = {
      client: (raw[3] || '').toString().trim(), hotel: (raw[4] || '').toString().trim(),
      checkIn: Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy')
    };
    if (!item.hotel) noHotel.push(item);
    if (!(raw[14] || '').toString().trim()) noSupplier.push(item);
    // نفس قاعدة الشاشة: وجود رقم قيد يعني أن الحجز مكتمل ولو بلا سعر
    if (!computeBookingTotal_(raw, 'client').hasPrice && !(raw[0] || '').toString().trim()) noSale.push(item);
  });
  return {
    noHotel: noHotel, noSupplier: noSupplier, noSale: noSale,
    dateDisp: Utilities.formatDate(today, 'GMT+3', 'dd/MM/yyyy')
  };
}

// حجوزات طرف معيّن بدخول اليوم أو غدًا — مسح واحد رخيص يُستدعى عند تسجيل دفعة
function tgImminentForParty_(partyName) {
  var target = normalizeName_(partyName || '');
  if (!target) return [];
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var t0 = today.getTime(), t1 = t0 + 86400000;
  var out = [];
  getSourceRowsCached_().forEach(function (r) {
    var raw = r.slice(0, SOURCE_LAST_COL);
    if (raw[15] === 'لاغي') return;
    if (normalizeName_((raw[3] || '').toString()) !== target) return;
    var cin = raw[7];
    var d = cin instanceof Date ? new Date(cin.getTime()) : new Date(cin);
    if (isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    var ts = d.getTime();
    if (ts !== t0 && ts !== t1) return;
    out.push({
      hotel: (raw[4] || '').toString().trim(), city: r[SOURCE_LAST_COL] || '',
      when: ts === t0 ? 'اليوم' : 'غدًا',
      checkIn: Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy'),
      checkInIso: Utilities.formatDate(d, 'GMT+3', 'yyyy-MM-dd'), checkInTs: ts
    });
  });
  return out;
}

// ---- الإرسال الفعلي ----
function tgSend_(text, keyboard) {
  var token = tgToken_(), cfg = tgCfg_();
  if (!token || !cfg.chatId) throw new Error('التوكن أو معرّف الجروب غير مضبوط');
  var payload = { chat_id: String(cfg.chatId), text: text, parse_mode: 'HTML', disable_web_page_preview: 'true' };
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', muteHttpExceptions: true, payload: payload
  });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !body.ok) {
    throw new Error('تليجرام: ' + (body.description || ('HTTP ' + res.getResponseCode())));
  }
  return true;
}
// أزرار الرد تُرفَق فقط بتنبيهات طلبات العملاء التي ما زالت "جديدة" وقت الإرسال، وفقط لو
// كان الويب هوك مسجَّلاً — وإلا ظهرت أزرار لا تفعل شيئًا عند الضغط
function tgActionKeyboard_(eventType, payload) {
  if (!payload || !payload.reqId) return null;
  if (['req_edit', 'req_new', 'req_cancel', 'req_msg'].indexOf(eventType) === -1) return null;
  if (!PropertiesService.getScriptProperties().getProperty(TG_PROP_HOOK_)) return null;
  var id = payload.reqId;
  // كل الإجراءات المتاحة في شاشة الطلبات متاحة هنا حرفيًا، فيمكن حسم الطلب من التليجرام
  // مباشرةً بلا فتح البرنامج
  var rows = [
    [
      { text: '✅ تأكيد', callback_data: 'rq:ok:' + id },
      { text: '❌ رفض الطلب', callback_data: 'rq:no:' + id }
    ],
    [
      { text: '🔎 جاري بحث الإمكانية', callback_data: 'rq:hold:' + id },
      { text: '☑️ تم التنفيذ', callback_data: 'rq:done:' + id }
    ]
  ];
  // رد وسيط متاح فقط لطلب حجز جديد: يسجّل الحجز فعليًا بحالة "مطلوب" بلا تأكيد نهائي بعد
  if (eventType === 'req_new') rows.push([{ text: '🕓 تسجيل الطلب وجاري تأكيده', callback_data: 'rq:reg:' + id }]);
  return { inline_keyboard: rows };
}

// "hh:mm" → دقائق من منتصف الليل، أو null لو غير مضبوط
function tgMin_(hhmm) {
  var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
}
// ساعات الصمت: تُؤجَّل الرسائل للصباح ولا تُحذف. تدعم نطاقًا يعبر منتصف الليل (23:00→07:00)
function tgInQuietHours_(cfg, now) {
  var from = tgMin_(cfg.quietFrom), to = tgMin_(cfg.quietTo);
  if (from === null || to === null || from === to) return false;
  var cur = now.getHours() * 60 + now.getMinutes();
  return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
}

// هدف المشغّل الزمني (كل دقيقة) — عام بلا شرطة سفلية ليظهر في قائمة "تشغيل"
// ==========================================================
// وضع السحب (Polling) — الحل الجذري لعاصفة doPost
// ==========================================================
// المشكلة الجذرية: مع الويب هوك، أي بطء في doPost (بسبب ازدحام أو خطأ 302) يجعل تليجرام
// يُعيد إرسال نفس التحديث مرارًا، فتتكاثر تنفيذات doPost وتُشبع حصة تنفيذ الحساب بالكامل،
// فيبطؤ كل شيء (كشف الحساب، الجلسة، الحفظ). الحل: حذف الويب هوك نهائيًا والاعتماد على
// getUpdates من مشغّل زمني — لا doPost إطلاقًا، فلا عاصفة. السعر: زمن استجابة حتى دقيقة،
// وهو مقبول تمامًا مقابل استقرار البرنامج كله، ويعمل الربط والأوامر بلا أي اعتماد على 302.
function tgBotMode_() { return PropertiesService.getScriptProperties().getProperty(TG_PROP_MODE_) || ''; }

// يسحب التحديثات المعلقة من تليجرام ويعالجها بنفس معالجات الويب هوك تمامًا. آمن للتكرار:
// getUpdates(offset) يؤكّد ما قبله ويعيد ما بعده فقط، وtgSeenUpdate_ شبكة أمان إضافية.
function tgPollUpdates_() {
  if (tgBotMode_() !== 'polling') return { ok: true, mode: 'webhook', processed: 0 };
  var token = tgToken_();
  if (!token) return { ok: false, error: 'لا توكن' };
  var props = PropertiesService.getScriptProperties();
  var offset = parseInt(props.getProperty(TG_PROP_POLL_OFFSET_) || '0', 10) || 0;
  var processed = 0, maxId = offset - 1;
  try {
    var params = { timeout: 0, limit: 30, allowed_updates: JSON.stringify(['message', 'callback_query', 'my_chat_member']) };
    if (offset > 0) params.offset = offset;
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates?' +
      Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&'),
      { muteHttpExceptions: true });
    var body = {};
    try { body = JSON.parse(res.getContentText()); } catch (e) {}
    if (!body.ok) {
      // 409 = ويب هوك ما زال مسجّلاً — نحذفه ونعيد المحاولة في الدورة التالية
      if (/409/.test(String(body.error_code)) || /webhook/i.test(String(body.description || ''))) {
        try { tgApi_('deleteWebhook', { drop_pending_updates: 'false' }); } catch (e2) {}
      }
      return { ok: false, error: body.description || 'getUpdates فشل' };
    }
    (body.result || []).forEach(function (upd) {
      if (upd.update_id > maxId) maxId = upd.update_id;
      try { tgProcessUpdate_(upd); processed++; } catch (e3) { Logger.log('tgPollUpdates_ معالجة: ' + e3.message); }
    });
    if (maxId >= offset) props.setProperty(TG_PROP_POLL_OFFSET_, String(maxId + 1));
    return { ok: true, mode: 'polling', processed: processed };
  } catch (e) {
    Logger.log('tgPollUpdates_: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// المعالج الموحّد لأي تحديث — يُستدعى من doPost (وضع الويب هوك) ومن tgPollUpdates_ (وضع
// السحب) على السواء، فلا ازدواج في منطق المعالجة
function tgProcessUpdate_(upd) {
  var m = upd.message || (upd.callback_query && upd.callback_query.message) || upd.my_chat_member || {};
  var f = upd.message ? upd.message.from : (upd.callback_query ? upd.callback_query.from : null);
  var who = f ? (((f.first_name || '') + ' ' + (f.last_name || '')).trim() + ' #' + f.id) : '';
  var body = upd.callback_query ? ('[زر] ' + (upd.callback_query.data || ''))
           : (upd.message ? (upd.message.text || '[بلا نص]') : '[حدث]');
  if (upd.update_id && tgSeenUpdate_(upd.update_id)) {
    // إعادة تسليم من تليجرام نفسه لنفس التحديث (وليس المستخدم يرسل مرتين) — تحدث عادة حين لا
    // يصل ردّ 200 لتليجرام بالسرعة الكافية (أول تنفيذ بعد فترة خمول مثلًا) فيُعيد المحاولة عدة
    // مرات خلال دقيقة واحدة. الرد كان يظهر لكل محاولة إعادة (تجربة فعلية: 6 رسائل لأمر واحد!)
    // فرجعناه صامتًا كما كان — هذا حدث بروتوكولي داخلي لا يعني المستخدم بشيء، ولا شأن له بأي
    // تكرار حقيقي من طرفه (ذلك تحديث جديد بمعرّف مختلف يُعامَل طبيعيًا لا كتكرار)
    tgLog_(upd.update_id, m.chat && m.chat.id, m.chat && m.chat.type, who, body, 'تجاهل — تحديث مكرر (إعادة تسليم تليجرام)');
    return;
  }
  if (upd.callback_query) { tgHandleCallback_(upd.callback_query); tgLog_(upd.update_id, m.chat && m.chat.id, m.chat && m.chat.type, who, body, 'تم'); }
  else if (upd.message) {
    tgRememberChat_(upd.message);
    if (upd.message.text) {
      var r;
      try {
        r = tgHandleMessage_(upd.message);
      } catch (eMsg) {
        // عطل غير متوقَّع أثناء تنفيذ أمر نصي — كان يُسجَّل داخليًا فقط والمستخدم يرى صمتًا تامًا
        // بلا أي رد، فيظن أن البوت لا يستجيب. الآن يصله سبب العطل مباشرة في نفس المحادثة
        Logger.log('tgHandleMessage_: ' + eMsg.message);
        r = '⛔ عطل: ' + eMsg.message;
        try {
          tgSendTo_(upd.message.chat.id, '⚠️ <b>تعذّر تنفيذ طلبك</b>\n' + tgEsc_(eMsg.message) +
            '\n\nأعد المحاولة، أو راجع المدير لو تكرر العطل.');
        } catch (eNotify) {}
      }
      tgLog_(upd.update_id, upd.message.chat.id, upd.message.chat.type, who, body, r || 'تم');
    }
    else if (upd.message.contact) {
      var rC;
      try { rC = tgHandleContact_(upd.message); } catch (eC) {
        rC = '⛔ ' + eC.message;
        try { tgSendTo_(upd.message.chat.id, '⚠️ تعذّر معالجة رقم الموبايل: ' + tgEsc_(eC.message)); } catch (eNotify2) {}
      }
      tgLog_(upd.update_id, upd.message.chat.id, upd.message.chat.type, who, '[جهة اتصال]', rC || 'تم');
    }
    else if (upd.message.document) {
      // ملف مُرسَل (تأكيد فندق PDF/صورة) — نقرأه ونستخلص بيانات الحجز للمراجعة والتسجيل
      var rD = 'تم';
      try {
        tgHandleConfirmationDoc_(upd.message.chat.id, upd.message.from || {}, upd.message.document,
          (upd.message.chat && upd.message.chat.type) || 'private');
      } catch (eD) {
        Logger.log('tgHandleConfirmationDoc_: ' + eD.message);
        rD = '⛔ ' + eD.message;
        try { tgSendTo_(upd.message.chat.id, '⚠️ تعذّرت معالجة الملف: ' + tgEsc_(eD.message)); } catch (eNotify3) {}
      }
      tgLog_(upd.update_id, upd.message.chat.id, upd.message.chat.type, who, '[ملف: ' + ((upd.message.document && upd.message.document.file_name) || 'PDF') + ']', rD);
    }
    else if (upd.message.photo && upd.message.photo.length) {
      // صورة مُرسَلة (تأكيد فندق كصورة) — نأخذ أكبر حجم ونمرّره كمستند صورة لنفس التدفق
      var rP = 'تم';
      try {
        var ph = upd.message.photo[upd.message.photo.length - 1]; // آخر عنصر = أعلى دقة
        tgHandleConfirmationDoc_(upd.message.chat.id, upd.message.from || {},
          { file_id: ph.file_id, mime_type: 'image/jpeg', file_name: 'photo.jpg' },
          (upd.message.chat && upd.message.chat.type) || 'private');
      } catch (eP) {
        Logger.log('tgHandleConfirmationDoc_(photo): ' + eP.message);
        rP = '⛔ ' + eP.message;
        try { tgSendTo_(upd.message.chat.id, '⚠️ تعذّرت معالجة الصورة: ' + tgEsc_(eP.message)); } catch (eNotify4) {}
      }
      tgLog_(upd.update_id, upd.message.chat.id, upd.message.chat.type, who, '[صورة]', rP);
    }
    else tgLog_(upd.update_id, upd.message.chat.id, upd.message.chat.type, who, body, 'تجاهل — رسالة بلا نص');
  }
  else if (upd.my_chat_member) { tgRememberChat_(upd.my_chat_member); tgLog_(upd.update_id, m.chat && m.chat.id, m.chat && m.chat.type, who, body, 'تحديث عضوية البوت'); }
  else tgLog_(upd.update_id, m.chat && m.chat.id, m.chat && m.chat.type, who, body, 'تجاهل — نوع غير مدعوم');
}

function drainTelegramQueue() {
  // وضع السحب: نسحب التحديثات الواردة أولاً (الأوامر والأزرار والربط) ثم نُرسل الطابور.
  // في الوضع اللحظي (ويب هوك) ترجع هذه فورًا بلا أي نداء شبكة
  try { tgPollUpdates_(); } catch (ePoll) { Logger.log('drain/poll: ' + ePoll.message); }
  // فحص خفيف (نداء شبكة واحد) كل دقيقة في وضع الويب هوك فقط — يضمن عدم بقاء التسجيل معطَّلاً
  // بصمت لأكثر من دورة واحدة مهما كان سبب العطل
  try { tgWebhookSelfHeal_(); } catch (eHeal) { Logger.log('drain/heal: ' + eHeal.message); }
  // تفريغ دفعات تعديل الحجوزات المُجمَّعة التي انتهت مهلتها — بصرف النظر عن وضع البوت
  try { tgFlushDueBookingEditBatches_(); } catch (eBatch) { Logger.log('drain/batch: ' + eBatch.message); }
  // مزامنة شيت العهد الخارجي (CustodySync.gs) — مُقيَّدة بمهلتها الخاصة، ولا تعمل أصلاً ما
  // لم يُضبَط شيت عهدة. الحارس typeof يمنع أي عطل لو لم يُلصَق ملف المزامنة في المشروع
  try { if (typeof custodySyncTick_ === 'function') custodySyncTick_(); }
  catch (eCus) { Logger.log('drain/custody: ' + eCus.message); }
  // طابور فارغ = لا شيء نفعله: لا قفل، ولا فتح ملف الشيت، ولا قراءة ورقة
  if (!tgQueueShouldScan_()) return { ok: true, sent: 0, reason: 'الطابور فارغ' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: true, skipped: 'قفل مشغول' };
  try {
    var cfg = tgCfg_();
    if (!cfg.enabled || !cfg.chatId || !tgToken_()) return { ok: true, sent: 0, reason: 'غير مفعّل' };
    var now = new Date();
    if (tgInQuietHours_(cfg, now)) return { ok: true, sent: 0, reason: 'ساعات الصمت — مؤجَّل' };
    var sh = ensureTgQueueSheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) { tgQueueFlagClear_(); return { ok: true, sent: 0 }; }
    var n = lastRow - 1;
    var rng = sh.getRange(2, 1, n, 8);
    var vals = rng.getValues();
    var sent = 0, changed = false;
    for (var i = 0; i < n && sent < TG_MAX_PER_RUN_; i++) {
      if (vals[i][4] !== 'معلق') continue;
      var payload = {};
      try { payload = JSON.parse(vals[i][3] || '{}'); } catch (e) {}
      // الرصيد يُحسَب هنا (في المهمة الخلفية) لا عند تسجيل الدفعة: كشف الحساب عملية ثقيلة،
      // وإقحامها في registerPayment كان سيُضيف ثوانيَ على انتظار المستخدم بلا داعٍ
      if (payload.needsBalance && payload.client) {
        try {
          var st = getUnifiedStatement_(payload.client, null, null);
          if (st && st.totals) payload.balance = st.totals.balance;
        } catch (e2) { /* تعذّر الحساب — تُرسَل الرسالة بلا رقم الرصيد */ }
        // الرصيد كما سيكون يوم أول دخول قادم — هذا ما يهم فعلاً قبل استقبال الضيوف
        try {
          var firstArr = (payload.arrivals || []).slice().sort(function (a, b) {
            return (a.checkInTs || 0) - (b.checkInTs || 0);
          })[0];
          if (firstArr && firstArr.checkInIso) {
            var stAt = getUnifiedStatement_(payload.client, null, firstArr.checkInIso);
            if (stAt && stAt.totals) {
              payload.balanceAtCheckIn = stAt.totals.balance;
              payload.balanceAtDate = firstArr.checkIn;
            }
          }
        } catch (e4) { /* اختياري — الرسالة تُرسَل بدونه */ }
        delete payload.needsBalance;
      }
      // أرصدة أطراف الحركة بعدها (دفعة · دفعة مزدوجة · تعديل حجز يمسّ القيمة) — نفس مبدأ
      // needsBalance أعلاه: الحساب هنا في الخلفية لا لحظة حفظ المستخدم
      try { tgFillBalances_(payload); } catch (eBal) { Logger.log('tgFillBalances_: ' + eBal.message); }
      try {
        tgSend_(tgBuildMessage_(vals[i][2], payload, cfg.style), tgActionKeyboard_(vals[i][2], payload));
        vals[i][4] = 'مُرسل'; vals[i][7] = new Date(); vals[i][6] = '';
        sent++;
      } catch (err) {
        vals[i][5] = (parseInt(vals[i][5], 10) || 0) + 1;
        vals[i][6] = String(err.message).slice(0, 250);
        // بعد 5 محاولات فاشلة نتوقف عن إعادة المحاولة حتى لا يعلق الطابور للأبد
        if (vals[i][5] >= TG_MAX_ATTEMPTS_) vals[i][4] = 'فشل';
      }
      changed = true;
    }
    if (changed) rng.setValues(vals);
    var stillPending = false;
    for (var j = 0; j < n; j++) { if (vals[j][4] === 'معلق') { stillPending = true; break; } }
    if (stillPending) tgQueueFlagSet_(); else tgQueueFlagClear_();
    tgPruneQueue_(sh);
    return { ok: true, sent: sent };
  } catch (e) {
    Logger.log('drainTelegramQueue: ' + e.message);
    return { ok: false, error: e.message };
  } finally { lock.releaseLock(); }
}

// تنظيف: نُبقي آخر 500 سطر فقط حتى لا تنمو الورقة بلا حدود
function tgPruneQueue_(sh) {
  try {
    var last = sh.getLastRow();
    if (last <= 501) return;
    sh.deleteRows(2, last - 501);
  } catch (e) { Logger.log('tgPruneQueue_: ' + e.message); }
}

// ---- إدارة من شاشة الإعدادات (مدير فقط) ----
function getTelegramSettings(token) {
  try {
    requireAdmin_(token);
    var cfg = tgCfg_(), tk = tgToken_();
    // التوكن لا يُعاد أبدًا كاملًا — مقنَّع بآخر 4 خانات فقط
    return safeReturn_({
      ok: true, cfg: cfg, events: TG_EVENTS_,
      tokenMask: tk ? ('••••••' + tk.slice(-4)) : '',
      hasToken: !!tk,
      triggerActive: tgTriggerExists_('drainTelegramQueue'),
      dailyArrivalsTrigger: tgTriggerExists_('tgDailyArrivalsJob'),
      dailyMissingTrigger: tgTriggerExists_('tgDailyMissingJob')
    });
  } catch (e) { return { ok: false, error: e.message }; }
}
function saveTelegramSettings(token, cfg, botToken) {
  try {
    var admin = requireAdmin_(token);
    var props = PropertiesService.getScriptProperties();
    var cur = tgCfg_();
    var next = tgDefaultCfg_();
    next.enabled = !!(cfg && cfg.enabled);
    next.chatId = String((cfg && cfg.chatId) || '').trim();
    next.chatTitle = String((cfg && cfg.chatTitle) || cur.chatTitle || '').trim();
    next.style = ['compact', 'detailed', 'card', 'minimal'].indexOf(cfg && cfg.style) >= 0 ? cfg.style : 'detailed';
    next.quietFrom = String((cfg && cfg.quietFrom) || '').trim();
    next.quietTo = String((cfg && cfg.quietTo) || '').trim();
    next.showPrices = !!(cfg && cfg.showPrices);
    next.dailyArrivalsHour = tgSafeHour_(cfg && cfg.dailyArrivalsHour, 7);
    next.dailyMissingHour = tgSafeHour_(cfg && cfg.dailyMissingHour, 20);
    TG_EVENTS_.forEach(function (e) {
      next.events[e.key] = !!(cfg && cfg.events && cfg.events[e.key]);
    });
    props.setProperty(TG_PROP_KEY_, JSON.stringify(next));
    // التوكن يُحدَّث فقط لو أُرسل نص جديد فعلًا (الواجهة ترسل '' لتعني "اتركه كما هو")
    if (botToken && String(botToken).trim()) {
      props.setProperty(TG_PROP_TOKEN_, String(botToken).trim());
      props.deleteProperty('TELEGRAM_BOT_USERNAME'); // توكن جديد = بوت آخر غالبًا
    }
    // في وضع السحب يجب أن يبقى مشغّل الدقيقة عاملاً حتى لو كانت التنبيهات مطفأة — فهو الذي
    // يسحب الأوامر والأزرار والربط من تليجرام. لا نحذفه إلا لو لا تنبيهات ولا وضع سحب.
    if (next.enabled || tgBotMode_() === 'polling') ensureTelegramTrigger_(); else removeTelegramTrigger_();
    logChange_(admin, 'الإعدادات', 'تليجرام',
      'تعديل إعدادات تنبيهات تليجرام' + (botToken ? ' (وتحديث التوكن)' : ''),
      cur.enabled ? 'مفعّل' : 'متوقف', next.enabled ? 'مفعّل' : 'متوقف');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// ==========================================================
// مفاتيح Gemini (استخلاص تأكيدات الفنادق بالذكاء الاصطناعي) — مفتاحان يُستخدمان بالتبادل
// ==========================================================
var GEMINI_PROP_KEY1_ = 'GEMINI_API_KEY_1';
var GEMINI_PROP_KEY2_ = 'GEMINI_API_KEY_2';
var GEMINI_PROP_MODEL_ = 'GEMINI_MODEL';   // النموذج الفعّال المُتعلَّم (يُحدَّث ذاتيًا عند تقاعد نموذج)
var GEMINI_MODEL_ = 'gemini-3.6-flash';    // الافتراضي الحالي (سريع ومجاني الطبقة)
// جوجل تُقاعد أسماء النماذج دوريًا (gemini-2.0-flash تقاعد وصار الرد: "use models/gemini-3.6-flash")
// فبدل تعطُّل الاستخلاص حتى نُعدّل الكود، نجرّب سلسلة بدائل — والنموذج الذي ينجح يُحفظ ويصير
// الافتراضي تلقائيًا. رسالة الخطأ نفسها تُقرأ لاستخراج البديل الذي تقترحه جوجل ويُجرَّب أولاً.
var GEMINI_MODEL_FALLBACKS_ = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
function tgGeminiModel_() {
  try {
    var v = (PropertiesService.getScriptProperties().getProperty(GEMINI_PROP_MODEL_) || '').trim();
    return v || GEMINI_MODEL_;
  } catch (e) { return GEMINI_MODEL_; }
}
function tgGeminiSetModel_(m) {
  try { PropertiesService.getScriptProperties().setProperty(GEMINI_PROP_MODEL_, String(m || '').trim()); } catch (e) {}
}
// ترتيب التجربة: النموذج الفعّال أولاً ثم البدائل، بلا تكرار
function tgGeminiModelChain_() {
  var out = [], seen = {};
  [tgGeminiModel_()].concat(GEMINI_MODEL_FALLBACKS_).forEach(function (m) {
    m = String(m || '').trim();
    if (m && !seen[m]) { seen[m] = true; out.push(m); }
  });
  return out;
}
// اسم النموذج البديل الذي تقترحه رسالة الخطأ ذاتها: "...use models/gemini-3.6-flash for..."
// آخر اسم نموذج مذكور هو البديل (الأول هو المتقاعد نفسه). لا نقارنه بالنموذج الحالي هنا —
// tgGeminiCall_ تتجاهل أي نموذج جُرِّب فعلاً، فلا حاجة لحالة مخزَّنة داخل دالة قراءة نصّية
function tgGeminiSuggestedModel_(msg) {
  var m = String(msg || '').match(/models\/([A-Za-z0-9][A-Za-z0-9.\-]{2,60})/g);
  return m ? m[m.length - 1].replace(/^models\//, '') : '';
}
// نداء واحد لواجهة Gemini بمفتاح ونموذج محدَّدين — يجرّب v1beta ثم v1 عند 404 فقط (بعض
// النماذج تُتاح على إصدار مسار دون الآخر؛ أي خطأ آخر لن يُصلحه تغيير الإصدار)
var GEMINI_API_VERSIONS_ = ['v1beta', 'v1'];
function tgGeminiFetch_(key, model, payload) {
  var last = { ok: false, code: 0, msg: 'تعذّر الاتصال' };
  for (var v = 0; v < GEMINI_API_VERSIONS_.length; v++) {
    var url = 'https://generativelanguage.googleapis.com/' + GEMINI_API_VERSIONS_[v] +
      '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: payload, muteHttpExceptions: true });
    var code = res.getResponseCode(), raw = res.getContentText();
    if (code === 200) {
      var body = {}; try { body = JSON.parse(raw); } catch (e) {}
      return { ok: true, code: code, body: body };
    }
    var eb = {}; try { eb = JSON.parse(raw); } catch (e2) {}
    last = { ok: false, code: code, msg: String((eb.error && eb.error.message) || ('HTTP ' + code + ': ' + String(raw).slice(0, 160))) };
    if (code !== 404) break;
  }
  return last;
}
// النداء الكامل: يجرّب سلسلة النماذج حتى ينجح أحدها ويحفظه. أخطاء المفتاح (صلاحية/حد استخدام)
// تُنهي المحاولة فورًا — تجربة نماذج أخرى بنفس المفتاح المعطوب بلا فائدة
function tgGeminiCall_(key, payload) {
  var chain = tgGeminiModelChain_(), tried = {}, lastMsg = 'تعذّر الاتصال بـ Gemini';
  for (var i = 0; i < chain.length && i < 8; i++) {
    var model = chain[i];
    if (tried[model]) continue;
    tried[model] = true;
    var r = tgGeminiFetch_(key, model, payload);
    if (r.ok) {
      if (model !== tgGeminiModel_()) tgGeminiSetModel_(model);
      return { ok: true, body: r.body, model: model };
    }
    lastMsg = r.msg;
    if (r.code === 401 || r.code === 403 || r.code === 429) break;   // خطأ مفتاح لا خطأ نموذج
    var sug = tgGeminiSuggestedModel_(r.msg);
    if (sug && !tried[sug]) chain.splice(i + 1, 0, sug);             // بديل جوجل المقترَح يُجرَّب فورًا
  }
  return { ok: false, msg: lastMsg, model: chain[0] };
}
function tgGeminiKeys_() {
  var p = PropertiesService.getScriptProperties();
  return [p.getProperty(GEMINI_PROP_KEY1_) || '', p.getProperty(GEMINI_PROP_KEY2_) || ''].filter(function (k) { return k && k.trim(); });
}
// إخفاء المفتاح في الواجهة: نعرض وجوده فقط + آخر 4 خانات (لا نُعيد المفتاح كاملاً أبدًا)
function geminiKeyMask_(k) {
  k = String(k || '').trim();
  if (!k) return '';
  return '••••' + k.slice(-4);
}
function getGeminiConfig(token) {
  try {
    requireAdmin_(token);
    var p = PropertiesService.getScriptProperties();
    var k1 = p.getProperty(GEMINI_PROP_KEY1_) || '', k2 = p.getProperty(GEMINI_PROP_KEY2_) || '';
    return { ok: true, key1Set: !!k1, key2Set: !!k2, key1Mask: geminiKeyMask_(k1), key2Mask: geminiKeyMask_(k2), model: tgGeminiModel_() };
  } catch (e) { return { ok: false, error: e.message }; }
}
// الواجهة ترسل '' لأي مفتاح تعني "اتركه كما هو"؛ وقيمة "__CLEAR__" تعني احذفه
function setGeminiKeys(token, key1, key2) {
  try {
    var admin = requireAdmin_(token);
    var p = PropertiesService.getScriptProperties();
    [[GEMINI_PROP_KEY1_, key1], [GEMINI_PROP_KEY2_, key2]].forEach(function (pair) {
      var v = (pair[1] == null) ? '' : String(pair[1]).trim();
      if (v === '__CLEAR__') p.deleteProperty(pair[0]);
      else if (v) p.setProperty(pair[0], v);
    });
    logChange_(admin, 'الإعدادات', 'Gemini', 'تحديث مفاتيح الذكاء الاصطناعي لقراءة التأكيدات', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// حذف التوكن نهائيًا (مثلاً عند تسريبه) — وإيقاف التنبيهات معه
function clearTelegramToken(token) {
  try {
    var admin = requireAdmin_(token);
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty(TG_PROP_TOKEN_);
    props.deleteProperty('TELEGRAM_BOT_USERNAME');
    var cfg = tgCfg_(); cfg.enabled = false;
    props.setProperty(TG_PROP_KEY_, JSON.stringify(cfg));
    removeTelegramTrigger_();
    logChange_(admin, 'الإعدادات', 'تليجرام', 'حذف توكن بوت تليجرام وإيقاف التنبيهات', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// ==========================================================
// تثبيت قائمة الأوامر الرسمية في تليجرام (زر "Menu" الأزرق بجانب حقل الكتابة)
// ==========================================================
// هذه قائمة أوامر تليجرام الرسمية (setMyCommands) — مستقلة تمامًا عن أزرار /menu التفاعلية
// وعن الأوامر النصية المباشرة (بحث:/كشف وصول:...). تليجرام يشترط اسم الأمر هنا حروفًا
// إنجليزية صغيرة وأرقامًا وشرطة سفلية فقط، لذلك تقتصر القائمة على الصيغة الإنجليزية لكل أمر
// (حتى لو كان له أيضًا اسم عربي بديل يعمل به البوت فعليًا — كـ"رصيد" لـ/balance)، وتظل كل
// الأوامر النصية المباشرة تعمل كالمعتاد بصرف النظر عن هذه القائمة
function tgBotCommandsList_() {
  return [
    { command: 'start', description: '👋 بدء استخدام البوت وربط حسابك' },
    { command: 'menu', description: '📋 القائمة الرئيسية بالأزرار' },
    { command: 'help', description: '❓ كل الأوامر المتاحة لك' },
    { command: 'search', description: '🔍 بحث في الحجوزات' },
    { command: 'booking', description: '🔎 بيانات حجز برقمه' },
    { command: 'confirm', description: '📄 إصدار تأكيد حجز' },
    { command: 'statement', description: '📊 كشف حساب عميل أو مورد' },
    { command: 'balance', description: '💳 رصيد حساب معيّن' },
    { command: 'balances', description: '💰 أرصدة كل الحسابات' },
    { command: 'arrivals', description: '📋 كشف وصول لعميل' },
    { command: 'today', description: '🌅 ملخص دخول اليوم' },
    { command: 'tomorrow', description: '🌅 ملخص دخول غدًا' },
    { command: 'newbooking', description: '🆕 تسجيل حجز جديد' },
    { command: 'edit', description: '✏️ تعديل بيانات حجز' },
    { command: 'prices', description: '⚠️ حجوزات بلا أسعار مسجَّلة' },
    { command: 'link', description: '🔗 ربط حسابك بالبوت' },
    { command: 'cancel', description: '❌ إلغاء الإجراء الحالي' },
    { command: 'whoami', description: '👤 صلاحياتك الحالية' },
    { command: 'chatid', description: '🆔 معرّف هذه المحادثة' },
    { command: 'ping', description: '🏓 اختبار الاتصال بالبوت' }
  ];
}
// يُثبِّت القائمة أعلاه كأوامر تليجرام الرسمية (تظهر بزر "Menu" الأزرق بجانب حقل الكتابة،
// وفي اقتراحات "/" التلقائية) — بنطاق افتراضي واحد يشمل كل المحادثات (خاصة وجروبات) دفعة
// واحدة، فلا حاجة لضبطه لكل جروب على حدة
function pinTelegramCommandsMenu(token) {
  try {
    var admin = requireAdmin_(token);
    if (!tgToken_()) throw new Error('اضبط توكن البوت أولاً قبل تثبيت قائمة الأوامر');
    var list = tgBotCommandsList_();
    tgApi_('setMyCommands', { commands: JSON.stringify(list) });
    try { tgApi_('setChatMenuButton', { menu_button: JSON.stringify({ type: 'commands' }) }); } catch (eBtn) {}
    logChange_(admin, 'الإعدادات', 'تليجرام',
      '[تثبيت قائمة أوامر تليجرام] ' + list.length + ' أمرًا', '', '');
    return { ok: true, count: list.length };
  } catch (e) { return { ok: false, error: e.message }; }
}
// اكتشاف الجروب تلقائيًا: getUpdates يُعيد آخر الرسائل التي رآها البوت — يكفي أن يُرسل أحد
// أعضاء الجروب أي رسالة (أو يُضاف البوت) ليظهر معرّف الجروب هنا
function telegramDiscoverChat(token, botToken) {
  try {
    requireAdmin_(token);
    var tk = (botToken && String(botToken).trim()) || tgToken_();
    if (!tk) throw new Error('أدخل توكن البوت أولاً');
    var seen = {}, out = [], note = '';
    // الجروب الذي رآه الويب هوك أولاً: getUpdates يرفض العمل (409) ما دام الويب هوك مسجَّلاً،
    // فبدون هذا المصدر كان زر الاكتشاف يتعطّل نهائيًا بمجرد تفعيل الأوامر التفاعلية
    try {
      var raw = PropertiesService.getScriptProperties().getProperty(TG_PROP_SEENCHAT_);
      var rc = raw ? JSON.parse(raw) : null;
      if (rc && rc.id) { seen[rc.id] = true; out.push({ id: String(rc.id), title: rc.title || '', type: rc.type || 'group' }); }
    } catch (e0) { /* تجاهل */ }
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + tk + '/getUpdates', { muteHttpExceptions: true });
    var body = {};
    try { body = JSON.parse(res.getContentText()); } catch (e1) {}
    if (body.ok) {
      (body.result || []).forEach(function (u) {
        var m = u.message || u.channel_post || u.my_chat_member;
        var c = m && m.chat;
        if (!c || seen[c.id]) return;
        seen[c.id] = true;
        out.push({ id: String(c.id), title: c.title || c.username || c.first_name || '', type: c.type });
      });
    } else if (!out.length) {
      throw new Error((body.description || 'تعذّر الاتصال بتليجرام') +
        '\n\nإن كان الويب هوك مفعّلاً فهذا متوقَّع: أرسل <code>/chatid</code> داخل الجروب وانسخ الرقم من رد البوت.');
    } else {
      note = 'تعذّر قراءة getUpdates (الويب هوك مفعّل) — المعروض هو آخر جروب راسل البوت.';
    }
    return safeReturn_({ ok: true, chats: out, note: note });
  } catch (e) { return { ok: false, error: e.message }; }
}
function telegramTestMessage(token) {
  try {
    var user = requireAdmin_(token);
    var cfg = tgCfg_();
    var text = tgBuildMessage_('req_new', {
      client: 'عميل تجريبي', hotel: 'فندق تجريبي', city: 'مكة',
      checkIn: '15/09/2026', checkOut: '20/09/2026', nights: 5,
      rooms: '2 ثنائية · 1 ثلاثية', note: 'رسالة اختبار من ' + staffDisplayName_(user),
      ts: new Date().getTime()
    }, cfg.style);
    tgSend_('🧪 <b>رسالة اختبار</b>\n\n' + text);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// معاينة النص بلا إرسال — لاختيار النمط من شاشة الإعدادات
function telegramPreview(token, style) {
  try {
    requireAdmin_(token);
    return safeReturn_({ ok: true, text: tgBuildMessage_('req_new', {
      client: 'شركة النور للسياحة', hotel: 'دار التوحيد إنتركونتيننتال', city: 'مكة',
      checkIn: '15/09/2026', checkOut: '20/09/2026', nights: 5,
      rooms: '2 ثنائية · 1 ثلاثية', ref: 'MK-341', amount: '18,500',
      note: 'يفضّل دور مرتفع', ts: new Date().getTime()
    }, style) });
  } catch (e) { return { ok: false, error: e.message }; }
}
// آخر 20 سطرًا من الطابور — لتشخيص أي رسالة لم تصل
function telegramRecentLog(token) {
  try {
    requireAdmin_(token);
    var sh = ensureTgQueueSheet_();
    var last = sh.getLastRow();
    if (last < 2) return safeReturn_({ ok: true, items: [] });
    var start = Math.max(2, last - 19);
    var vals = sh.getRange(start, 1, last - start + 1, 8).getValues();
    var items = vals.map(function (r) {
      return {
        ts: r[1] ? new Date(r[1]).getTime() : 0, type: tgEventTitle_(r[2]),
        status: r[4], attempts: r[5], error: r[6] || '',
        sentTs: r[7] ? new Date(r[7]).getTime() : 0
      };
    }).reverse();
    var pending = 0, failed = 0;
    vals.forEach(function (r) { if (r[4] === 'معلق') pending++; if (r[4] === 'فشل') failed++; });
    return safeReturn_({ ok: true, items: items, pending: pending, failed: failed });
  } catch (e) { return { ok: false, error: e.message, items: [] }; }
}

// ---- المهام المجدولة (المرحلة ج) ----
// كلتاهما تُدرِج في نفس الطابور (لا ترسل مباشرة): فتستفيدان من إعادة المحاولة وساعات الصمت
// وحد المعدل بلا أي منطق مكرر
function tgDailyArrivalsJob() {
  try {
    var cfg = tgCfg_();
    if (!cfg.enabled || cfg.events.daily_arrivals === false) return;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    tgEnqueue_('daily_arrivals', tgCollectArrivals_(today.getTime()));
  } catch (e) { Logger.log('tgDailyArrivalsJob: ' + e.message); }
}
function tgDailyMissingJob() {
  try {
    var cfg = tgCfg_();
    if (!cfg.enabled || cfg.events.daily_missing === false) return;
    var d = tgCollectMissing_();
    // لا نُرسل تنبيهًا يوميًا يقول "كل شيء سليم" — ضجيج بلا فائدة
    if (!d.noHotel.length && !d.noSupplier.length && !d.noSale.length) return;
    tgEnqueue_('daily_missing', d);
  } catch (e) { Logger.log('tgDailyMissingJob: ' + e.message); }
}

// ---- المشغّلات الزمنية ----
function tgTriggerExists_(fn) {
  try {
    return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === fn; });
  } catch (e) { return false; }
}
function tgRemoveTrigger_(fn) {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
    });
  } catch (e) { Logger.log('tgRemoveTrigger_: ' + e.message); }
}
function tgSafeHour_(h, def) {
  h = parseInt(h, 10);
  return (isNaN(h) || h < 0 || h > 23) ? def : h;
}
// تُعاد بناء المشغّلات اليومية عند كل حفظ: لا سبيل لقراءة ساعة مشغّل قائم في Apps Script،
// فالحذف وإعادة الإنشاء هو الطريق الوحيد لضمان مطابقة الساعة المحفوظة في الإعدادات
function ensureTelegramTrigger_() {
  var cfg = tgCfg_();
  if (!tgTriggerExists_('drainTelegramQueue')) {
    ScriptApp.newTrigger('drainTelegramQueue').timeBased().everyMinutes(1).create();
  }
  // مراقبة التعديل المباشر على شيت الحجوزات: مشغّل قابل للتثبيت لا بسيط — يعمل بصلاحية كاملة
  // دومًا بصرف النظر عن هوية من يُعدّل فعليًا (خلاف onEdit البسيط المقيَّد لغير المُصرَّح لهم)
  if (!tgTriggerExists_('tgHandleSheetEditInstallable_')) {
    try {
      ScriptApp.newTrigger('tgHandleSheetEditInstallable_').forSpreadsheet(openSourceSpreadsheet_()).onEdit().create();
    } catch (eTrig) { Logger.log('ensureTelegramTrigger_/sheetEdit: ' + eTrig.message); }
  }
  tgRemoveTrigger_('tgDailyArrivalsJob');
  if (cfg.events.daily_arrivals) {
    ScriptApp.newTrigger('tgDailyArrivalsJob').timeBased()
      .atHour(tgSafeHour_(cfg.dailyArrivalsHour, 7)).everyDays(1).create();
  }
  tgRemoveTrigger_('tgDailyMissingJob');
  if (cfg.events.daily_missing) {
    ScriptApp.newTrigger('tgDailyMissingJob').timeBased()
      .atHour(tgSafeHour_(cfg.dailyMissingHour, 20)).everyDays(1).create();
  }
}
function removeTelegramTrigger_() {
  ['drainTelegramQueue', 'tgHandleSheetEditInstallable_', 'tgDailyArrivalsJob', 'tgDailyMissingJob'].forEach(tgRemoveTrigger_);
}
// تشغيل فوري للتنبيهين المجدولين من زر في الإعدادات (بلا انتظار موعدهما)
// التشغيل اليدوي يرسل فورًا لا عبر الطابور: المستخدم ضغط الزر وينتظر النتيجة الآن، فيجب أن
// يرى خطأ تليجرام الحقيقي ("chat not found" مثلاً) بدل "أُدرِج في الطابور" ثم صمت أبدي
function telegramRunDigestNow(token, which) {
  try {
    requireAdmin_(token);
    var block = tgWhyNotSending_('');   // '' = تجاوز مفتاح الحدث: الضغط اليدوي نيّة صريحة
    if (block) return { ok: false, error: block };
    var evt, data;
    if (which === 'missing') {
      evt = 'daily_missing'; data = tgCollectMissing_();
      if (!data.noHotel.length && !data.noSupplier.length && !data.noSale.length) {
        return { ok: true, empty: true, message: 'لا توجد حجوزات ناقصة البيانات — لم تُرسَل رسالة.' };
      }
    } else {
      evt = 'daily_arrivals';
      var today = new Date(); today.setHours(0, 0, 0, 0);
      data = tgCollectArrivals_(today.getTime());
    }
    tgSend_(tgBuildMessage_(evt, data, tgCfg_().style));
    return { ok: true, sent: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// تشخيص شامل بخطوة واحدة — يُظهر أين تنقطع السلسلة بالضبط بدل تخمين السبب
function telegramDiagnose(token) {
  try {
    requireAdmin_(token);
    var cfg = tgCfg_(), tk = tgToken_(), out = { ok: true, checks: [] };
    function add(label, pass, detail) { out.checks.push({ label: label, pass: !!pass, detail: detail || '' }); }

    add('توكن البوت مضبوط', !!tk, tk ? ('••••••' + tk.slice(-4)) : 'غير مضبوط');
    if (!tk) return safeReturn_(out);

    var me = null;
    try { me = tgApi_('getMe', {}); add('التوكن صالح (getMe)', true, '@' + (me.username || '')); }
    catch (e) { add('التوكن صالح (getMe)', false, e.message); return safeReturn_(out); }
    out.botUsername = me.username || '';

    add('المفتاح الرئيسي للتنبيهات مفعّل', !!cfg.enabled, cfg.enabled ? 'مفعّل' : 'غير مفعّل — لن تُرسل أي تنبيهات');
    add('معرّف الجروب مضبوط', !!cfg.chatId, cfg.chatId || 'فارغ — أرسل /chatid داخل الجروب');

    if (cfg.chatId) {
      try {
        var chat = tgApi_('getChat', { chat_id: String(cfg.chatId) });
        add('البوت يصل إلى الجروب (getChat)', true, (chat.title || '') + ' · ' + (chat.type || ''));
        out.chatTitle = chat.title || '';
      } catch (e) {
        add('البوت يصل إلى الجروب (getChat)', false, e.message +
          ' — تأكد أن الرقم بالإشارة السالبة وأن البوت ما زال عضوًا في الجروب.');
      }
    }
    var mode = tgBotMode_();
    if (mode === 'polling') {
      add('وضع الاستقبال', true, 'وضع السحب الموثوق (Polling) — لا ويب هوك، لا عاصفة doPost');
      try {
        var wi = tgApi_('getWebhookInfo', {});
        add('الويب هوك محذوف (مطلوب لوضع السحب)', !wi.url, wi.url ? ('ما زال مسجّلاً: ' + wi.url + ' — سيُحذف تلقائيًا') : 'محذوف ✓');
      } catch (e) {}
      add('مشغّل السحب/التفريغ (كل دقيقة)', tgTriggerExists_('drainTelegramQueue'),
        tgTriggerExists_('drainTelegramQueue') ? 'يعمل — يسحب التحديثات كل دقيقة' : 'غير موجود — احفظ الإعدادات مرة');
    } else {
      try {
        var info = tgApi_('getWebhookInfo', {});
        add('الويب هوك مسجَّل (الأوامر التفاعلية)', !!info.url, info.url ? ('معلّق: ' + (info.pending_update_count || 0) +
          (info.last_error_message ? (' · آخر خطأ: ' + info.last_error_message) : '')) : 'غير مسجَّل — فعّل الأوامر أو استخدم وضع السحب الموثوق');
        if (info.url) {
          var st = tgSelfTestWebhook_(info.url);
          add('الرابط يردّ بصيغة يقبلها تليجرام', st.ok, 'HTTP ' + st.code + (st.location ? (' → ' + st.location) : '') + ' — ' + st.verdict +
            (!st.ok ? ' — جرّب "الوضع الموثوق (السحب)" لتفادي خطأ 302 نهائيًا' : ''));
        }
      } catch (e) { add('الويب هوك مسجَّل (الأوامر التفاعلية)', false, e.message); }
    }

    add('مشغّل تفريغ الطابور (كل دقيقة)', tgTriggerExists_('drainTelegramQueue'),
      tgTriggerExists_('drainTelegramQueue') ? 'يعمل' : 'غير موجود — احفظ الإعدادات مرة لإنشائه');
    var q = tgInQuietHours_(cfg, new Date());
    add('خارج ساعات الصمت الآن', !q, q ? ('داخل ساعات الصمت ' + cfg.quietFrom + '→' + cfg.quietTo + ' — الرسائل مؤجَّلة') : 'لا صمت الآن');

    var off = [];
    TG_EVENTS_.forEach(function (e) { if (cfg.events[e.key] === false) off.push(e.label); });
    add('التنبيهات المفعَّلة', off.length < TG_EVENTS_.length,
      off.length ? ('غير مفعّل: ' + off.join(' · ')) : 'الكل مفعّل');

    var users = tgUsers_();
    add('موظفون مربوطون بالبوت', users.length > 0,
      users.length ? (users.length + ' مربوط') : 'لا أحد — ولّد كود ربط وافتح رابط الربط في محادثة البوت الخاصة');
    return safeReturn_(out);
  } catch (e) { return { ok: false, error: e.message }; }
}
// تُشغَّل يدويًا مرة واحدة من محرّر Apps Script (قائمة "تشغيل") لمنح الصلاحيات اللازمة:
// الاتصال بخدمة خارجية (تليجرام) وإنشاء مشغّل زمني — بعدها يعمل كل شيء تلقائيًا
function setupTelegramNotifications() {
  requireScriptOwner_();   // (7.15.0) دالة إعداد — من المحرر فقط
  ensureTgQueueSheet_();
  ensureTelegramTrigger_();
  Logger.log('تم تجهيز تنبيهات تليجرام: الورقة والمشغّلات الزمنية جاهزة.');
  return 'تم';
}


// ==========================================================
// بوت تليجرام التفاعلي — الهوية والصلاحيات ونقطة الاستقبال
// ==========================================================
// لماذا سرّ في الرابط لا في الترويسة؟ تليجرام يدعم secret_token يرسله في ترويسة HTTP، لكن
// Apps Script لا يتيح قراءة ترويسات الطلب إطلاقًا في doPost — فالسبيل الوحيد للتحقق أن
// الطلب من تليجرام فعلًا هو سرّ داخل الرابط المسجَّل بـsetWebhook (e.parameter.tghook).
//
// ولماذا ربط الهوية إجباري؟ doPost ينفَّذ دائمًا بصلاحيات مالك النشر ولا توجد جلسة متصفح،
// فبدون ربط telegram_user_id بحساب حقيقي في البرنامج يصبح أي عضو في الجروب قادرًا على
// إصدار مستندات باسم الشركة. كل أمر يمر بفحصين: صلاحية الشاشة في البرنامج + مفتاح البوت.
var TG_USERS_SHEET_ = 'مستخدمو بوت تليجرام';
var TG_PROP_HOOK_ = 'TELEGRAM_HOOK_SECRET';
var TG_PROP_HOOKURL_ = 'TELEGRAM_HOOK_BASEURL'; // رابط النشر /exec يدويًا عند الحاجة
var TG_PROP_LINKCODES_ = 'TELEGRAM_LINK_CODES';
var TG_PROP_SEENUPD_ = 'TELEGRAM_SEEN_UPDATES';
var TG_PROP_MODE_ = 'TELEGRAM_BOT_MODE';        // 'polling' | 'webhook' | '' (متوقف)
var TG_PROP_POLL_OFFSET_ = 'TELEGRAM_POLL_OFFSET';
var TG_PROP_SEENCHAT_ = 'TELEGRAM_SEEN_CHAT';
var TG_LINK_TTL_MIN_ = 30;
// كانت 20 دقيقة فقط — تنتهي الجلسة أثناء إدخال نشط فعلي (حجز/دفعة بعدة خطوات، خاصة لو
// توقف المستخدم قليلاً للتفكير أو نسخ رقم). كل خطوة تُعيد ضبط هذا العدّاد فعليًا (tgSetSession_
// يُستدعى بمهلة جديدة في كل تفاعل) فرفعه لا يُبقي جلسات مهجورة لمدة أطول من اللازم — يمنح فقط
// وقتًا كافيًا فعليًا أثناء الاستخدام النشط، مطابقًا لمهلة جلسة تسجيل الدخول بالتطبيق (60 دقيقة)
var TG_SESSION_TTL_MIN_ = 60;

// مفاتيح صلاحيات البوت — مستقلة عن صلاحيات البرنامج: يمكن السماح لموظف داخل البرنامج
// ومنعه من نفس الإجراء عبر تليجرام (الجروب بيئة أقل تحكمًا). الفحص دائمًا = الاثنان معًا.
var TG_PERMS_ = [
  { key: 'query',      label: 'استعلام (/booking · /today · /client)', screen: 'bookings',    level: 'view', def: true  },
  { key: 'respond',    label: 'الرد على طلبات العملاء بالأزرار',        screen: 'clientPortal', level: 'edit', def: false },
  { key: 'confirm',    label: 'إصدار تأكيد حجز (PDF)',                 screen: 'bookings',    level: 'edit', def: false },
  { key: 'statement',  label: 'كشف حساب (PDF) — بيانات مالية',          screen: 'statement',   level: 'view', def: false },
  { key: 'sendGroup',  label: 'العمل داخل الجروب مباشرة (تأكيد/كشف حساب) — بلا هذه الصلاحية يُحوَّل التفاعل للخاص تلقائيًا',  screen: 'bookings',    level: 'view', def: false },
  { key: 'newbooking', label: 'تسجيل حجز جديد (من نص حر أو نموذج)',     screen: 'bookings',    level: 'add',  def: false },
  { key: 'prices',     label: 'تسجيل أسعار التكلفة/البيع الناقصة',      screen: 'bookings',    level: 'edit', def: false }
];
function tgDefaultPerms_() {
  var o = {}; TG_PERMS_.forEach(function (p) { o[p.key] = p.def; }); return o;
}

// بناء كائن مستخدم كامل من اسم المستخدم — نفس ما تُنتجه الجلسة، لكن بلا جلسة متصفح
// (البوت لا يملك جلسة، فيلزمه هذا الطريق لقراءة صلاحيات الحساب الحقيقية من الشيت)
// تُستدعى في كل أمر تليجرام (عبر tgRequire_) وكانت تقرأ شيت المستخدمين مرتين في كل مرة
// (getDataRange للبحث عن الصف ثم getRange لقراءته) — أي ~2 نداء شبكة لشيت في كل خطوة محادثة.
// الآن: كاش داخل التنفيذ + كاش عبر التنفيذات (60 ثانية)، ويُبطَل فورًا عند أي تعديل مستخدم
var USER_REC_MEMO_ = {};
function invalidateUserRecordCache_(username) {
  USER_REC_MEMO_ = {};
  try {
    var c = CacheService.getScriptCache();
    if (username) c.remove('urec_' + String(username).trim().toLowerCase());
    else c.remove('urec_all_marker');
  } catch (e) {}
}
function getUserByUsername_(username) {
  var key = (username || '').toString().trim().toLowerCase();
  if (!key) return null;
  if (USER_REC_MEMO_[key] !== undefined) return USER_REC_MEMO_[key];
  try {
    var cached = CacheService.getScriptCache().get('urec_' + key);
    if (cached) {
      var parsed = JSON.parse(cached);
      USER_REC_MEMO_[key] = parsed;
      return parsed;
    }
  } catch (e) {}
  var sh = ensureUsersSheet_();
  var rowIdx = findUserRow_(sh, username);
  var rec = rowIdx === -1 ? null
    : userRecordFromRow_(sh.getRange(rowIdx, 1, 1, sh.getLastColumn()).getValues()[0]);
  USER_REC_MEMO_[key] = rec;
  try { if (rec) CacheService.getScriptCache().put('urec_' + key, JSON.stringify(rec), 60); } catch (e) {}
  return rec;
}

function ensureTgUsersSheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(TG_USERS_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(TG_USERS_SHEET_);
    sh.getRange(1, 1, 1, 7).setValues([[
      'معرّف تليجرام', 'الاسم في تليجرام', 'مستخدم البرنامج', 'تاريخ الربط', 'نشط', 'الصلاحيات', 'آخر استخدام'
    ]]);
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}
// كاش داخل التنفيذ + عبر التنفيذات — يُستدعى من كل رسالة تليجرام (tgUserByTgId_) ومن
// شاشة الإدارة، فتوفيره يوفر قراءة شيت في كل نداء تليجرام
var TG_USERS_MEMO_ = null;
var TG_USERS_CACHE_TTL_ = 60;
function invalidateTgUsersCache_() {
  TG_USERS_MEMO_ = null;
  try { CacheService.getScriptCache().remove('tg_users'); } catch (e) {}
}
function tgUsers_() {
  if (TG_USERS_MEMO_) return TG_USERS_MEMO_;
  try {
    var cached = CacheService.getScriptCache().get('tg_users');
    if (cached) {
      TG_USERS_MEMO_ = JSON.parse(cached);
      return TG_USERS_MEMO_;
    }
  } catch (e) {}
  var sh = ensureTgUsersSheet_();
  if (sh.getLastRow() < 2) { TG_USERS_MEMO_ = []; return TG_USERS_MEMO_; }
  var arr = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().map(function (r, i) {
    var perms = {};
    try { perms = r[5] ? JSON.parse(r[5]) : {}; } catch (e) { perms = {}; }
    var d = tgDefaultPerms_();
    Object.keys(d).forEach(function (k) { if (perms[k] === undefined) perms[k] = d[k]; });
    return {
      rowIdx: i + 2, tgId: (r[0] || '').toString(), tgName: (r[1] || '').toString(),
      username: (r[2] || '').toString(), linkedTs: r[3],
      active: r[4] === 'نعم' || r[4] === true, perms: perms, lastSeen: r[6]
    };
  });
  TG_USERS_MEMO_ = arr;
  try { CacheService.getScriptCache().put('tg_users', JSON.stringify(arr), TG_USERS_CACHE_TTL_); } catch (e) {}
  return arr;
}
function tgUserByTgId_(tgId) {
  var id = (tgId || '').toString();
  var all = tgUsers_();
  for (var i = 0; i < all.length; i++) if (all[i].tgId === id) return all[i];
  return null;
}
function tgWriteUserRow_(rowIdx, u) {
  ensureTgUsersSheet_().getRange(rowIdx, 1, 1, 7).setValues([[
    u.tgId, u.tgName, u.username, u.linkedTs, u.active ? 'نعم' : 'لا',
    JSON.stringify(u.perms || {}), u.lastSeen || ''
  ]]);
  invalidateTgUsersCache_();
}

// الحارس الموحّد لكل أمر: مربوط؟ نشط؟ حسابه في البرنامج قائم ونشط؟ يملك مفتاح البوت؟
// يملك صلاحية الشاشة المقابلة داخل البرنامج؟ — الفشل في أي منها يمنع الإجراء
// حماية من التكرار السريع: يعيد true لو نُفِّذ نفس الإجراء لنفس المستخدم خلال نافذة قصيرة.
// يمنع النقر المزدوج على زر أو إرسال نفس الأمر مرتين من إصدار مستندين أو تنفيذ مزدوج.
function tgRecentAction_(userId, key, ttlSec) {
  try {
    var cache = CacheService.getScriptCache();
    var ck = 'tgact_' + String(userId) + '_' + key;
    if (cache.get(ck)) return true;             // نُفِّذ لتوّه — تجاهل التكرار
    cache.put(ck, '1', ttlSec || 6);
    return false;
  } catch (e) { return false; }                 // الكاش متعذّر — لا نمنع الإجراء (الأصل السماح)
}
function tgRequire_(tgId, permKey) {
  var bu = tgUserByTgId_(tgId);
  if (!bu) throw new Error('غير مربوط. اطلب من المدير كود ربط ثم أرسل:\n/link الكود');
  if (!bu.active) throw new Error('حسابك على البوت موقوف — راجع المدير.');
  var user = null;
  try { user = getUserByUsername_(bu.username); } catch (e) {}
  if (!user) throw new Error('حساب البرنامج المرتبط لم يعد موجودًا — راجع المدير.');
  if (user.active === false) throw new Error('حساب البرنامج المرتبط موقوف.');
  var spec = null;
  TG_PERMS_.forEach(function (p) { if (p.key === permKey) spec = p; });
  if (!spec) throw new Error('صلاحية غير معروفة');
  if (!bu.perms[permKey]) throw new Error('غير مسموح لك بهذا الإجراء عبر تليجرام (' + spec.label + ').');
  if (user.role !== 'admin' && !hasScreenLevel_(user, spec.screen, spec.level)) {
    throw new Error('حسابك في البرنامج لا يملك صلاحية "' + (SCREEN_LABELS_SRV_[spec.screen] || spec.screen) + '".');
  }
  // "آخر استخدام" كان يُكتب في الشيت مع كل أمر — كتابة شيت (~400ms) + إبطال كاش المستخدمين
  // فتُعاد قراءة الشيت كاملاً في الأمر التالي (~400ms أخرى). أي أن حقل إحصائي غير حرج كان
  // يكلّف ثانية كاملة في كل خطوة محادثة. الآن يُكتب مرة كل 10 دقائق على الأكثر لكل مستخدم،
  // وهي دقة أكثر من كافية لحقل "آخر استخدام"
  try {
    var seenKey = 'tglastseen_' + String(tgId);
    var cacheLS = CacheService.getScriptCache();
    if (!cacheLS.get(seenKey)) {
      cacheLS.put(seenKey, '1', 600);
      bu.lastSeen = new Date();
      tgWriteUserRow_(bu.rowIdx, bu);
    }
  } catch (e) {}
  return { botUser: bu, user: user };
}

// ---- أكواد الربط (تُولَّد من شاشة الإعدادات، صالحة 30 دقيقة) ----
function tgLinkCodes_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(TG_PROP_LINKCODES_);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function tgSaveLinkCodes_(o) {
  PropertiesService.getScriptProperties().setProperty(TG_PROP_LINKCODES_, JSON.stringify(o));
}
function tgBotUsername_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var cached = props.getProperty('TELEGRAM_BOT_USERNAME');
    if (cached) return cached;
    var me = tgApi_('getMe', {});
    if (me && me.username) { props.setProperty('TELEGRAM_BOT_USERNAME', me.username); return me.username; }
  } catch (e) { Logger.log('tgBotUsername_: ' + e.message); }
  return '';
}
function generateTelegramLinkCode(token, username) {
  try {
    var admin = requireAdmin_(token);
    username = (username || '').toString().trim();
    if (!username) throw new Error('اختر المستخدم أولاً');
    if (!getUserByUsername_(username)) throw new Error('مستخدم غير موجود');
    var codes = tgLinkCodes_(), now = Date.now();
    // تنظيف المنتهية قبل الإضافة حتى لا تتراكم في خصائص السكربت
    Object.keys(codes).forEach(function (c) {
      if (now - codes[c].ts > TG_LINK_TTL_MIN_ * 60000) delete codes[c];
    });
    var code = '';
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا حروف/أرقام متشابهة (O/0، I/1)
    for (var i = 0; i < 6; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    codes[code] = { username: username, ts: now, by: admin.username };
    tgSaveLinkCodes_(codes);
    logChange_(admin, 'الإعدادات', username, 'توليد كود ربط بوت تليجرام', '', '');
    var bot = tgBotUsername_();
    return safeReturn_({
      ok: true, code: code, minutes: TG_LINK_TTL_MIN_, botUsername: bot,
      // رابط عميق يفتح محادثة البوت الخاصة ويرسل /start CODE بضغطة واحدة — أسهل وأأمن من
      // كتابة الكود يدويًا، ولا يعمل داخل الجروبات (وهذا مقصود: الربط شأن خاص)
      deepLink: bot ? ('https://t.me/' + bot + '?start=' + code) : ''
    });
  } catch (e) { return { ok: false, error: e.message }; }
}
function tgConsumeLinkCode_(code, tgId, tgName) {
  var codes = tgLinkCodes_();
  var rec = codes[(code || '').toString().trim().toUpperCase()];
  if (!rec) throw new Error('كود غير صحيح أو منتهٍ.');
  if (Date.now() - rec.ts > TG_LINK_TTL_MIN_ * 60000) throw new Error('انتهت صلاحية الكود — اطلب كودًا جديدًا.');
  delete codes[(code || '').toString().trim().toUpperCase()];
  tgSaveLinkCodes_(codes);
  var existing = tgUserByTgId_(tgId);
  var rec2 = {
    tgId: String(tgId), tgName: tgName || '', username: rec.username,
    linkedTs: new Date(), active: true,
    perms: existing ? existing.perms : tgDefaultPerms_(), lastSeen: new Date()
  };
  if (existing) tgWriteUserRow_(existing.rowIdx, rec2);
  else ensureTgUsersSheet_().appendRow([rec2.tgId, rec2.tgName, rec2.username, rec2.linkedTs,
    'نعم', JSON.stringify(rec2.perms), rec2.lastSeen]);
  invalidateTgUsersCache_();
  logChange_('بوت تليجرام', 'الإعدادات', rec.username,
    'ربط حساب تليجرام (' + (tgName || tgId) + ') بمستخدم البرنامج', '', rec.username);
  return rec2;
}


// ---- طبقة نداء تليجرام الكاملة (إرسال/تعديل/ملفات/أزرار) ----
function tgApi_(method, payload) {
  var token = tgToken_();
  if (!token) throw new Error('توكن البوت غير مضبوط');
  var opts = { method: 'post', muteHttpExceptions: true, payload: payload };
  // وجود Blob في الحمولة يجعل UrlFetchApp يرسلها multipart تلقائيًا (لازم لـsendDocument)
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, opts);
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !body.ok) {
    throw new Error('تليجرام(' + method + '): ' + (body.description || ('HTTP ' + res.getResponseCode())));
  }
  return body.result;
}
// <blockquote> مدعوم في Bot API 7.0 فأحدث. لو ردّ الخادم برفض الوسم لأي سبب، الخسارة
// الحقيقية هي ضياع الرسالة كلها لا شكلها — فنعيد الإرسال مرة واحدة بلا وسوم الاقتباس
// (النص نفسه يبقى كاملاً ومقروءًا) بدلاً من أن يفشل التقرير بالكامل
function tgSendTo_(chatId, text, keyboard) {
  var p = { chat_id: String(chatId), text: text, parse_mode: 'HTML', disable_web_page_preview: 'true' };
  if (keyboard) p.reply_markup = JSON.stringify(keyboard);
  try {
    return tgApi_('sendMessage', p);
  } catch (e) {
    var msg = String((e && e.message) || '');
    if (String(text || '').indexOf('<blockquote') === -1 || !/parse entities|unsupported start tag/i.test(msg)) throw e;
    p.text = String(text).replace(/<\/?blockquote[^>]*>/g, '');
    return tgApi_('sendMessage', p);
  }
}
function tgEditText_(chatId, messageId, text, keyboard) {
  var p = { chat_id: String(chatId), message_id: String(messageId), text: text, parse_mode: 'HTML' };
  p.reply_markup = JSON.stringify(keyboard || { inline_keyboard: [] }); // {} تُزيل الأزرار
  return tgApi_('editMessageText', p);
}
function tgAnswerCb_(cbId, text, alert) {
  try {
    tgApi_('answerCallbackQuery', {
      callback_query_id: cbId, text: (text || '').slice(0, 190),
      show_alert: alert ? 'true' : 'false'
    });
  } catch (e) { Logger.log('answerCallbackQuery: ' + e.message); }
}
// اسم احتياطي ASCII بحت لـfilename= التقليدي — بعض عملاء/أجهزة تليجرام تتجاهل filename*=
// (الترميز الحديث RFC 5987) وتعرض الاسم التقليدي فقط، فلو تُرك فارغًا (اسم عربي صرف) يستبدله
// تليجرام تلقائيًا باسم عشوائي يبدو أرقامًا — نُبقي كل ما هو ASCII بالفعل (تواريخ/أرقام/فواصل)
// ونحذف الحروف العربية فقط، فيبقى الاسم مفيدًا لا فارغًا
function tgAsciiFallbackName_(name) {
  var s = String(name || '');
  var m = s.match(/\.[a-zA-Z0-9]{1,5}$/);
  var ext = m ? m[0] : '';
  var base = ext ? s.slice(0, s.length - ext.length) : s;
  var safeBase = base.replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').replace(/\s+/g, ' ').trim();
  return (safeBase || 'document') + ext;
}
// سطر Content-Disposition لملف مُرسَل: filename تقليدي (احتياطي ASCII) + filename*=UTF-8''
// (RFC 5987) يحمل الاسم الحقيقي كاملاً بعربيته — العميل الحديث يقرأ الثاني، والقديم يكتفي
// بالأول بدل اسم عشوائي. هذا بالضبط سبب ظهور أسماء ملفات "كشف حساب/كشف وصول" كأرقام فقط سابقًا:
// الاعتماد على ترميز UrlFetchApp التلقائي لأسماء Blob لا يُرسل filename*= إطلاقًا، وتليجرام
// يرفض صراحةً وضع بايتات UTF-8 خامة داخل filename= التقليدي فيستبدله باسم عشوائي رقمي
function tgDocContentDisposition_(fieldName, name) {
  var fallback = tgAsciiFallbackName_(name).replace(/"/g, "'");
  var encoded = encodeURIComponent(name).replace(/'/g, '%27').replace(/\*/g, '%2A');
  return 'form-data; name="' + fieldName + '"; filename="' + fallback + '"; filename*=UTF-8\'\'' + encoded;
}
function tgSendDoc_(chatId, blob, caption) {
  var token = tgToken_();
  if (!token) throw new Error('توكن البوت غير مضبوط');
  var boundary = 'menfDoc' + new Date().getTime() + Math.floor(Math.random() * 1e6);
  var CRLF = '\r\n';
  var name = blob.getName() || 'مستند.pdf';
  var field = function (n, v) {
    return '--' + boundary + CRLF + 'Content-Disposition: form-data; name="' + n + '"' + CRLF + CRLF + (v || '') + CRLF;
  };
  var head = field('chat_id', String(chatId)) + field('parse_mode', 'HTML') +
    field('caption', (caption || '').slice(0, 1000)) +
    '--' + boundary + CRLF + 'Content-Disposition: ' + tgDocContentDisposition_('document', name) + CRLF +
    'Content-Type: ' + (blob.getContentType() || 'application/octet-stream') + CRLF + CRLF;
  var payloadBytes = Utilities.newBlob(head).getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob(CRLF + '--' + boundary + '--').getBytes());
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendDocument', {
    method: 'post', contentType: 'multipart/form-data; boundary=' + boundary,
    payload: Utilities.newBlob(payloadBytes), muteHttpExceptions: true
  });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !body.ok) {
    throw new Error('تليجرام(sendDocument): ' + (body.description || ('HTTP ' + res.getResponseCode())));
  }
  return body.result;
}
// صفّان من الأزرار كحد أقصى في السطر الواحد — أوضح على شاشة الجوال
function tgKb_(rows) { return { inline_keyboard: rows }; }
function tgBtn_(text, data) { return { text: text, callback_data: data }; }

// ---- حالة المحادثة (نماذج متعددة الخطوات) ----
// تُخزَّن في ورقة لا في الذاكرة: كل نداء doPost تنفيذ مستقل تمامًا في Apps Script، فلا
// توجد ذاكرة مشتركة بين الرسالة والتي تليها
// حالة المحادثة في CacheService لا في شيت — كانت كل رسالة للبوت تقرأ شيت الجلسات كاملاً
// وكل خطوة تكتب فيه (قراءة + كتابة شبكية لكل ردّ!)، وهو أكبر سبب لبطء إحساس البوت.
// الكاش ذاكرة فورية، والحالة مؤقتة بطبعها فلا قيمة لحفظها الدائم.
function tgSessKey_(chatId, userId) { return 'tgsess_' + String(chatId) + '_' + String(userId); }
function tgGetSession_(chatId, userId) {
  try {
    var raw = CacheService.getScriptCache().get(tgSessKey_(chatId, userId));
    if (!raw) return null;
    var o = JSON.parse(raw);
    return { flow: o.flow || '', step: o.step || '', data: o.data || {} };
  } catch (e) { return null; }
}
function tgSetSession_(chatId, userId, flow, step, data) {
  try {
    CacheService.getScriptCache().put(tgSessKey_(chatId, userId),
      JSON.stringify({ flow: flow, step: step, data: data || {} }), TG_SESSION_TTL_MIN_ * 60);
  } catch (e) { Logger.log('tgSetSession_: ' + e.message); }
}
function tgClearSession_(chatId, userId) {
  try { CacheService.getScriptCache().remove(tgSessKey_(chatId, userId)); } catch (e) {}
}

// ---- منع التكرار: تليجرام يعيد إرسال نفس التحديث عند انتهاء المهلة ----
// منع تكرار معالجة نفس التحديث. كان يستخدم PropertiesService (نداءان شبكيان: قراءة + كتابة
// في كل تحديث = ~200-300ms مهدرة على كل رسالة) — الآن مفتاح مستقل لكل تحديث في CacheService
// (ذاكرة سريعة جدًا). لا حاجة لقائمة مشتركة أصلاً: كل ما يلزم هو "هل رأينا هذا الرقم؟"،
// ونافذة ساعتين تكفي تمامًا (تليجرام لا يعيد إرسال تحديث أقدم من ذلك)
function tgSeenUpdate_(updateId) {
  if (!updateId) return false;
  try {
    var cache = CacheService.getScriptCache();
    var key = 'tgupd_' + String(updateId);
    if (cache.get(key)) return true;
    cache.put(key, '1', 7200);
    return false;
  } catch (e) { return false; }
}


// ==========================================================
// بناء مستندات PDF على الخادم بلا متصفح (للبوت)
// ==========================================================
// الواجهة تبني الـPDF بقياس الصفحات داخل المتصفح ثم ترسل HTML للخادم. البوت لا متصفح لديه،
// فيبني الخادم HTML مكافئًا بنفس هوية المستند ثم يحوّله بـ
// Utilities.newBlob(html,'text/html').getAs('application/pdf') — نفس المحوّل المستخدَم أصلًا.
// فرق واحد مقصود ومعلوم: لا يمكن حساب "صفحة X من Y" بلا قياس في متصفح، فنعتمد على تكرار
// رأس الجدول (thead) الذي يحترمه المحوّل، ونضع توقيت الإصدار في ترويسة المستند بدل تذييله.
function tgHtmlEsc_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var TG_CONF_CSS_ = [
  '@page { size: A4 portrait; margin: 14mm 12mm; }',
  '* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  'body { font-family: Arial, Helvetica, sans-serif; margin:0; padding:0; color:#1a1a1a; font-size:12.5px; }',
  '.arabic { font-family: Tahoma, Arial, sans-serif; }',
  '.cf-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }',
  '.cf-brand .name { font-size:19px; font-weight:800; color:#16332a; }',
  '.cf-brand .name-ar { font-size:11px; color:#555; margin-top:2px; }',
  '.cf-badge { background:#16332a; color:#fff; padding:9px 18px; text-align:center; min-width:210px; }',
  '.cf-badge .t1 { font-weight:700; font-size:14.5px; letter-spacing:1.5px; }',
  '.cf-badge .t2 { font-size:8.5px; letter-spacing:2.5px; margin-top:3px; opacity:.85; }',
  'hr.cf-rule { border:none; border-top:1px solid #ccc; margin:8px 0; }',
  '.cf-info-row { display:flex; gap:5px; margin:3px 0; }',
  '.cf-info-row .lbl { font-weight:700; width:52px; flex:none; }',
  '.cf-info-row .val { flex:1; text-align:left; }',
  '.cf-thanks { margin:12px 0; }',
  '.cf-two-col { display:grid; grid-template-columns:1fr 1fr; gap:3px 24px; margin-bottom:10px; }',
  '.cf-two-col .lbl { font-weight:700; display:inline-block; min-width:100px; }',
  'table.cf-tbl { width:100%; border-collapse:collapse; margin:10px 0; }',
  'table.cf-tbl th { background:#16332a; color:#fff; font-size:11px; padding:7px; font-weight:700; }',
  'table.cf-tbl td { border:1px solid #ccc; padding:7px; text-align:center; }',
  '.cf-total { font-weight:700; margin:10px 0; }',
  '.cf-total .amt { color:#16332a; font-size:14.5px; }',
  '.cf-box { border:1px solid #ccc; display:flex; margin:8px 0; }',
  '.cf-box .lbl { background:#f5f5f5; font-weight:700; padding:8px 12px; flex:none; width:118px; white-space:nowrap; border-right:1px solid #ccc; }',
  '.cf-box .val { padding:8px 12px; flex:1; text-align:left; }',
  '.cf-box.strong .val { font-weight:700; }',
  '.cf-terms { font-size:9.5px; color:#333; line-height:1.7; }',
  '.cf-terms p { margin:2px 0; }',
  '.cf-sign { text-align:center; margin-top:26px; }',
  '.cf-sign .thanks { font-size:11px; color:#555; }',
  '.cf-sign .mgr { font-weight:800; font-size:13px; margin-top:6px; }',
  '.cf-sign .role { font-size:10px; color:#7d8fa8; }',
  'tr, .cf-box, .cf-sign { page-break-inside: avoid; }'
].join('\n');

var TG_CONF_TERMS_ = [
  '* We hope that we have covered all your request waiting for your reply by the option date otherwise the reservation will be released automatically without prior notice.',
  '* Above rates are net and non-commissionable quoted in Saudi Riyals',
  '- Check in after 16:00 hour and check out at 12:00 hour',
  '- Check in or check out amendment for individuals should be done 48 hours prior to guest check in',
  '- Check in or check out amendment for Group should be done 7 days prior to guest check in',
  '- For definite group, 10% of the total number of rooms can be reduced without any charge',
  '- In case of no-show for Group full amount will be charged',
  '- Triple or Quad occupancy will be through extra bed if standard room is not available',
  '- This reservation should be guaranteed by cash or voucher'
];

// نفس بنية ConfirmationTemplate.html وترتيب أقسامه حرفيًا — أي تعديل هناك يجب أن يُعكَس هنا
function buildConfirmationHtml_(d) {
  d = d || {};
  var e = tgHtmlEsc_;
  var typeLabel = d.confirmType === 'tentative' ? 'TENTATIVE CONFIRMATION' : 'DEFINITE CONFIRMATION';
  var ROOM_LABELS = { doubles: 'DBL', triples: 'TPL', quads: 'Quad', quints: 'C.Quad' };
  var rows = (d.rooms || []).map(function (r) {
    return '<tr><td>' + e(r.qty) + '</td><td>' + e(ROOM_LABELS[r.type] || r.type) +
      '</td><td>' + e(r.rate) + '</td><td>' + e(d.meal || '') + '</td></tr>';
  }).join('') || '<tr><td colspan="4">-</td></tr>';

  return '<!DOCTYPE html><html dir="ltr" lang="en"><head><meta charset="UTF-8">' +
    '<title>' + e(typeLabel + ' - ' + (d.resNo || '')) + '</title><style>' + TG_CONF_CSS_ + '</style></head><body>' +
    '<div class="cf-header"><div class="cf-brand">' +
      '<div class="name">Menf International Tours</div>' +
      '<div class="name-ar arabic">شركة منف للسياحة الدولية</div></div>' +
      '<div class="cf-badge"><div class="t1">' + e(typeLabel) + '</div>' +
      '<div class="t2">R e s e r v a t i o n&nbsp; C o n f i r m e d</div></div></div>' +
    '<hr class="cf-rule">' +
    '<div class="cf-info-row"><span class="lbl">Date</span><span>:</span><span class="val">' + e(d.dateStamp) + '</span></div>' +
    '<div class="cf-info-row"><span class="lbl">To</span><span>:</span><span class="val arabic">' + e(d.to) + '</span></div>' +
    '<div class="cf-info-row"><span class="lbl">Attn.</span><span>:</span><span class="val arabic">' + e(d.attn) + '</span></div>' +
    '<div class="cf-info-row"><span class="lbl">From</span><span>:</span><span class="val">Menf International Tours</span></div>' +
    '<div class="cf-thanks">Thank you for your interest on Menf International Tours</div><hr class="cf-rule">' +
    '<div class="cf-two-col">' +
      '<div><span class="lbl">Res. NO</span>: ' + e(d.resNo) + '</div>' +
      '<div><span class="lbl">Hotel Name</span>: ' + e(d.hotel || '-') + '</div>' +
      '<div><span class="lbl">Arrival date</span>: ' + e(d.arrival) + '</div>' +
      '<div><span class="lbl">Departure date</span>: ' + e(d.departure) + '</div>' +
      '<div><span class="lbl">Guest Name</span>: <span class="arabic">' + e(d.guestName) + '</span></div>' +
    '</div>' +
    '<table class="cf-tbl"><thead><tr><th>QTY</th><th>Room Type</th><th>Room Rate</th><th>Meal</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<div class="cf-total">Total Net Value : <span class="amt">SAR ' + e(d.totalNet) + '</span></div>' +
    '<div class="cf-box strong"><div class="lbl">Option Date :</div><div class="val">' +
      (d.optionDate ? ('Please Send Payment by ' + e(d.optionDate)) : '') + '</div></div>' +
    '<div class="cf-box"><div class="lbl">Remarks</div><div class="val arabic">' + e(d.remarks) + '</div></div>' +
    '<div class="cf-terms">' + TG_CONF_TERMS_.map(function (t) { return '<p>' + e(t) + '</p>'; }).join('') + '</div>' +
    '<div class="cf-sign"><div class="thanks">Thanks and Best Regards</div>' +
      '<div class="mgr">' + e(d.manager || 'Eman Mohamed') + '</div>' +
      '<div class="role">Reservation Manager</div></div>' +
    '</body></html>';
}

// كشف حساب للبوت: تدفّق واحد مع تكرار رأس الجدول عبر الصفحات (thead) — بلا قياس متصفح
function buildStatementHtml_(st) {
  var e = tgHtmlEsc_;
  var css = [
    '@page { size: A4 portrait; margin: 10mm 8mm 12mm; }',
    '* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }',
    'body { font-family: Tahoma, Arial, sans-serif; margin:0; color:#333; }',
    '.hd { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #7d5a2c; padding-bottom:6px; margin-bottom:8px; font-weight:bold; font-size:12px; }',
    '.hd .val { color:#7d5a2c; }',
    'table { width:100%; border-collapse:collapse; }',
    'th, td { border:1px solid #ddd; padding:4px 6px; text-align:center; font-size:10px; }',
    'th { background:#7d5a2c; color:#fff; font-size:11px; }',
    'td.note { text-align:right; }',
    'thead { display: table-header-group; }',  // المحوّل يكرّر الرأس على كل صفحة
    'tr { page-break-inside: avoid; }',
    '.opening td { background:#faf8f3; font-weight:bold; }',
    '.total td { background:#34495e; color:#fff; font-weight:bold; font-size:12px; }',
    '.excl td { background:#faf0da; color:#92620a; }'
  ].join('\n');
  var rows = (st.rows || []).map(function (r) {
    return '<tr' + (r.excluded ? ' class="excl"' : '') + '>' +
      '<td>' + e(r.qaid) + '</td><td>' + e(r.ref) + '</td><td>' + e(r.dateDisp) + '</td>' +
      '<td class="note">' + e(String(r.note || '').replace(/<[^>]*>/g, '')) + '</td>' +
      '<td>' + e(r.debit == null ? '' : r.debit) + '</td>' +
      '<td>' + e(r.credit == null ? '' : r.credit) + '</td>' +
      '<td>' + e(r.balance == null ? '' : r.balance) + '</td></tr>';
  }).join('');
  var totals = st.totals
    ? ('<tr class="total"><td colspan="3"></td><td>الإجماليات</td><td>' + e(st.totals.debit) +
       '</td><td>' + e(st.totals.credit) + '</td><td>' + e(st.totals.balance) + '</td></tr>')
    : '';
  return '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">' +
    '<title>كشف حساب ' + e(st.party) + '</title><style>' + css + '</style></head><body>' +
    '<div class="hd"><span>اسم الحساب: <span class="val">' + e(st.party) + '</span></span>' +
    '<span>من: <span class="val">' + e(st.start || '---') + '</span></span>' +
    '<span>إلى: <span class="val">' + e(st.end || '---') + '</span></span>' +
    '<span>تاريخ الإصدار: <span class="val">' + e(st.today) + '</span></span></div>' +
    '<table><thead><tr><th>القيد</th><th>المرجع</th><th>التاريخ</th><th>تفاصيل البيان</th>' +
    '<th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>' +
    '<tr class="opening"><td colspan="3"></td><td class="note">رصيد أول المدة</td><td>0</td><td>0</td><td>' +
      e(st.opening) + '</td></tr>' +
    rows + totals + '</tbody></table></body></html>';
}

function tgHtmlToPdfBlob_(html, fileName) {
  var safe = (fileName || 'ملف').toString().replace(/[\\\/:*?"<>|]/g, '-').trim() || 'ملف';
  var blob = Utilities.newBlob(html, 'text/html', safe + '.html').getAs('application/pdf');
  blob.setName(safe + '.pdf');
  return blob;
}


// ==========================================================
// أوامر البوت
// ==========================================================
// بحث عن حجز برقم الحجز الداخلي (عمود C) أو رقم حجز الفندق (عمود R) — أيهما كتبه الموظف
// بحث عام متقاطع: كل كلمة في الاستعلام يجب أن ترد في أي حقل من حقول الحجز (تطابق جزئي).
// مثال: "جنادرية سويلم" يُرجع الحجوزات التي فيها الكلمتان معًا ولو كل واحدة في حقل مختلف.
// يفهم الأوامر المكتوبة مباشرةً بصيغة "الكلمة : المطلوب" (بحث / كشف وصول ...) بنقطتين
// عربية أو إنجليزية — فيكتب المستخدم طلبه كاملاً في رسالة واحدة بلا حوار خطوة بخطوة
// النقطتان اختياريتان في كل أمر هنا (":" أو "：" أو بلا شيء)، والتاريخ يُقبَل كاملاً أو
// يومًا/شهرًا بلا سنة أو بكلمة (اليوم/غدًا). الترتيب من الأخصّ إلى الأعمّ مقصود: "ارصدة من…
// الى…" يجب أن تُلتقط قبل "ارصدة <تاريخ>"، و"ارصدة عملاء" قبل "ارصدة" المجرّدة
function tgParseDirect_(text) {
  var t = tgNormalizeDigits_(String(text || '').trim()).replace(/\s+/g, ' ');
  var m;

  m = t.match(/^(?:بحث عام|بحث|search)\s*[:：]?\s+([\s\S]+)$/i);
  if (m) return { kind: 'search', query: m[1].trim() };

  m = t.match(/^كشف ?وصول\s*[:：]?\s+([\s\S]+)$/i);
  if (m) return tgParseArrivalsBody_(m[1]);

  m = t.match(/^كشف ?حساب\s*[:：]?\s+([\s\S]+)$/i);
  if (m) return { kind: 'statement', query: m[1].trim() };

  // تاكيد حجز <رقم> ⇐ نفس /confirm — يبدأ نموذج نوع التأكيد ثم بقية خطواته المعتادة
  m = t.match(/^ت[أا]كيد ?حجز\s*[:：]?\s+([\s\S]+)$/i);
  if (m) return { kind: 'confirm', ref: m[1].trim() };

  // أرصدة الدخول خلال فترة — نفس تقرير زر "أرصدة دخول خلال فترة" حرفيًا
  m = t.match(/^[اأإ]رصد[ةه]\s*[:：]?\s*من\s*[:：]?\s*(.+?)\s*(?:الى|إلى)\s*[:：]?\s*(.+)$/i);
  if (m) return { kind: 'balRange', fromRaw: m[1].trim(), toRaw: m[2].trim(),
                  fromIso: tgParseArDate_(m[1]), toIso: tgParseArDate_(m[2]) };

  // ارصدة دخول <تاريخ> — الرصيد التراكمي لكل عميل/مورد له دخول في ذلك اليوم تحديدًا (لا فترة)
  // يقبل أي تاريخ (وليس اليوم/غدًا فقط كما في "ارصدة اليوم/غدا" أدناه) — لذلك يُلتقط أولاً
  m = t.match(/^[اأإ]رصد[ةه]\s*[:：]?\s*دخول\s*[:：]?\s+(.+)$/i);
  if (m) return { kind: 'balArrivalDay', dayRaw: m[1].trim(), dayIso: tgParseArDate_(m[1]) };

  // كل الحسابات برصيد اليوم، ثم خيار إظهار الأرصدة الصفرية
  if (/^[اأإ]رصد[ةه]\s*[:：]?\s*الكل$/i.test(t)) return { kind: 'balAll' };

  // أرصدة أصحاب الدخول اليوم/غدًا (لا الأرصدة التراكمية لكل الحسابات)
  m = t.match(/^[اأإ]رصد[ةه]\s*[:：]?\s*(اليوم|النهارده|النهاردة|غدا|غدًا|غداً|الغد|بكرة|بكره)$/i);
  if (m) return { kind: 'balDay', offset: /اليوم|النهارد/.test(m[1]) ? 0 : 1 };

  m = t.match(/^[اأإ]رصد[ةه]\s*[:：]?\s*(عملاء|العملاء|موردين|الموردين|موردون|الموردون|موردين\b)\s*[:：]?\s*(.*)$/i);
  if (m) return { kind: 'balAsOf', scope: /مورد/.test(m[1]) ? 'suppliers' : 'clients',
                  asOfRaw: (m[2] || '').trim(), asOfIso: tgParseArDate_(m[2]) };

  m = t.match(/^[اأإ]رصد[ةه]\s*[:：]?\s*(.*)$/i);
  if (m) return { kind: 'balAsOf', scope: 'both', asOfRaw: (m[1] || '').trim(), asOfIso: tgParseArDate_(m[1]) };

  // دخول اليوم / دخول غدا / دخول <تاريخ>
  m = t.match(/^دخول\s*[:：]?\s+(.+)$/i);
  if (m) return { kind: 'arrivalsDay', dayRaw: m[1].trim(), dayIso: tgParseArDate_(m[1]) };

  m = t.match(/^رصيد\s*[:：]?\s+([\s\S]+)$/i);
  if (m) return tgParseBalanceQuery_(m[1]);

  return null;
}
// "رصيد شركة النور 5-9" ⟶ الاسم "شركة النور" والتاريخ 05/09. آخر كلمة تُقتطع كتاريخ فقط لو
// كانت تاريخًا صالحًا فعلاً، وإلا بقيت جزءًا من الاسم (أسماء حسابات تنتهي برقم واردة كثيرًا)
function tgParseBalanceQuery_(rest) {
  var parts = String(rest || '').trim().split(' ');
  var asOfIso = '';
  if (parts.length > 1) {
    var iso = tgParseArDate_(parts[parts.length - 1]);
    if (iso) { asOfIso = iso; parts.pop(); }
  }
  return { kind: 'balance', query: parts.join(' ').trim(), asOfIso: asOfIso };
}
// يفصل جسم أمر "كشف وصول: العميل من: ... الى: ... pdf/صورة" — كل جزء اختياري عدا اسم العميل
function tgParseArrivalsBody_(body) {
  var s = String(body || '').trim();
  var format = 'pdf';
  var fm = s.match(/\b(pdf|صورة|image|img)\b\s*$/i);
  if (fm) { format = /^(صورة|image|img)$/i.test(fm[1]) ? 'image' : 'pdf'; s = s.slice(0, fm.index).trim(); }
  var startIso = '', endIso = '';
  var toM = s.match(/(?:الى|إلى)\s*[:：]?\s*([^\n]+?)(?=\s*(?:من\s*[:：]|$))/i);
  if (toM) { endIso = tgParseArDate_(toM[1]); s = s.replace(toM[0], ''); }
  var fromM = s.match(/من\s*[:：]?\s*([^\n]+?)(?=\s*(?:الى|إلى)\s*[:：]|$)/i);
  if (fromM) { startIso = tgParseArDate_(fromM[1]); s = s.replace(fromM[0], ''); }
  var client = s.replace(/[:：]\s*$/, '').trim();
  return { kind: 'arrivals', client: client, startIso: startIso, endIso: endIso, format: format };
}
// يقبل — إضافةً إلى DD-MM-YYYY — صيغةَ اليوم/الشهر بلا سنة (تُكمَّل بالسنة الجارية، نفس قاعدة
// حقول التواريخ في الشاشات)، وكلماتِ اليوم/غدًا/أمس. كل أمر في البوت يأخذ تاريخًا يمرّ من هنا،
// فيستفيد الجميع من التوسعة بلا تكرار منطق التحليل في كل أمر على حدة
function tgParseArDate_(s) {
  s = tgNormalizeDigits_(String(s || '').trim());
  if (!s || /^(تخطي|skip|-|—)$/i.test(s)) return '';
  var rel = tgRelativeDayIso_(s);
  if (rel) return rel;
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return '';
  var y = m[3] ? (m[3].length === 2 ? ('20' + m[3]) : m[3]) : String(new Date().getFullYear());
  return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
}
// "اليوم"/"غدًا"/"أمس" وما يرادفها بكل صور الهمزة والتاء التي يكتبها المستخدمون فعلاً
function tgRelativeDayIso_(s) {
  var t = String(s || '').trim();
  var off = null;
  if (/^(اليوم|النهارده|النهاردة|today)$/i.test(t)) off = 0;
  else if (/^(غدا|غدًا|غداً|الغد|بكرة|بكره|tomorrow)$/i.test(t)) off = 1;
  else if (/^(امس|أمس|البارحة|yesterday)$/i.test(t)) off = -1;
  if (off === null) return '';
  var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + off);
  return Utilities.formatDate(d, 'GMT+3', 'yyyy-MM-dd');
}
function tgTodayIso_() { return Utilities.formatDate(new Date(), 'GMT+3', 'yyyy-MM-dd'); }
function tgNormalizeDigits_(s) {
  var ar = '٠١٢٣٤٥٦٧٨٩', out = '';
  for (var i = 0; i < s.length; i++) {
    var idx = ar.indexOf(s[i]);
    out += idx >= 0 ? String(idx) : s[i];
  }
  return out;
}
function tgSearchBookings_(query, maxOut) {
  var words = normalizeName_(query || '').toLowerCase().split(' ').filter(function (w) { return w.length >= 2; });
  if (!words.length) return { words: [], items: [], total: 0 };
  var out = [], total = 0;
  var fmt = function (d) {
    var dd = d instanceof Date ? d : new Date(d);
    return isNaN(dd.getTime()) ? '' : Utilities.formatDate(dd, 'GMT+3', 'dd/MM/yyyy');
  };
  getSourceRowsCached_().forEach(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL] || '';
    // الحقول القابلة للبحث مجمّعة في نص واحد — أرخص من فحص كل حقل على حدة لكل كلمة
    var hay = normalizeName_([
      raw[0], raw[2], raw[3], raw[4], raw[14], raw[15], raw[17], raw[19], raw[20], city
    ].join(' ')).toLowerCase();
    for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return;
    total++;
    if (out.length >= (maxOut || 25)) return;
    out.push({
      innerRef: (raw[2] || '').toString().trim(), hotelRef: (raw[17] || '').toString().trim(),
      client: (raw[3] || '').toString().trim(), hotel: (raw[4] || '').toString().trim(),
      supplier: (raw[14] || '').toString().trim(), status: (raw[15] || '').toString().trim(),
      city: city, checkIn: fmt(raw[7]), checkOut: fmt(raw[8]),
      rooms: (parseInt(raw[10]) || 0) + (parseInt(raw[11]) || 0) + (parseInt(raw[12]) || 0) + (parseInt(raw[13]) || 0),
      roomsTxt: tgRoomsBreakdown_(raw)
    });
  });
  return { words: words, items: out, total: total };
}
function tgSearchResultText_(query, res) {
  if (!res.total) {
    return '🔍 <b>بحث:</b> ' + tgEsc_(query) + '\n\n❌ لا توجد حجوزات تطابق كل الكلمات المطلوبة.';
  }
  var lines = ['🔍 <b>بحث:</b> ' + tgEsc_(query),
               '📊 النتائج: <b>' + res.total + '</b>' + (res.total > res.items.length ? (' — يُعرض أول ' + res.items.length) : ''), ''];
  res.items.forEach(function (b) {
    lines.push(tgCityIcon_(b.city) + ' <code>' + tgEsc_(b.innerRef || '—') + '</code>' +
      ' · 🏨 ' + tgEsc_(b.hotelRef || '—') +
      ' · ' + tgEsc_(b.client) +
      ' · ' + tgEsc_(b.hotel) +
      ' · 🤝 ' + tgEsc_(b.supplier || '—') +
      ' · 🛏 ' + tgEsc_(b.roomsTxt || (b.rooms + ' غرفة')) +
      ' · ' + tgEsc_(b.checkIn) + '→' + tgEsc_(b.checkOut) +
      (b.status ? (' · ' + tgEsc_(b.status)) : ''));
  });
  lines.push('', '💡 أرسل الآن <b>رقم الحجز</b> (الداخلي أو رقم الفندق) لعرض بياناته كاملة.');
  return lines.join('\n');
}
function tgCmdSearch_(chatId, from, query, chatType) {
  tgRequire_(from.id, 'query');
  if (!query) { tgSendTo_(chatId, 'أرسل: <code>بحث : كلمة1 كلمة2</code>'); return; }
  var res = tgSearchBookings_(query, 25);
  tgSendTo_(chatId, tgSearchResultText_(query, res));
  // بعد النتائج: أي رقم يكتبه المستخدم يُفهم كطلب تفاصيل حجز — بلا أمر جديد
  if (res.total) tgSetSession_(chatId, from.id, 'askArg', 'wait', { action: 'bk' });
}

function tgFindBooking_(ref) {
  var q = (ref || '').toString().trim().toLowerCase();
  if (!q) return null;
  var found = null;
  getSourceRowsCached_().some(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL] || '';
    var inner = (raw[2] || '').toString().trim().toLowerCase();
    var hotelRef = (raw[17] || '').toString().trim().toLowerCase();
    if (inner !== q && hotelRef !== q) return false;
    var nights = parseInt(raw[9]) || 0;
    var cin = raw[7] instanceof Date ? raw[7] : new Date(raw[7]);
    var cout = raw[8] instanceof Date ? raw[8] : new Date(raw[8]);
    var fmt = function (d) { return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy'); };
    var opt = raw[16] instanceof Date ? fmt(raw[16]) : (raw[16] || '').toString().trim();
    found = {
      key: bookingKey_(raw, city), city: city,
      innerRef: (raw[2] || '').toString().trim(), hotelRef: (raw[17] || '').toString().trim(),
      client: (raw[3] || '').toString().trim(), hotel: (raw[4] || '').toString().trim(),
      supplier: (raw[14] || '').toString().trim(), status: (raw[15] || '').toString().trim(),
      checkIn: fmt(cin), checkOut: fmt(cout), nights: nights, optionDate: opt,
      notes: (raw[20] || '').toString().trim(), qaid: (raw[0] || '').toString().trim(),
      salesAgent: (raw[19] || '').toString().trim(),
      // الغرف وأسعار البيع لكل نوع — مصدر جدول مستند التأكيد مباشرةً
      rooms: [
        { type: 'doubles', qty: parseInt(raw[10]) || 0, rate: parseFloat(raw[25]) || 0 },
        { type: 'triples', qty: parseInt(raw[11]) || 0, rate: parseFloat(raw[26]) || 0 },
        { type: 'quads',   qty: parseInt(raw[12]) || 0, rate: parseFloat(raw[27]) || 0 },
        { type: 'quints',  qty: parseInt(raw[13]) || 0, rate: parseFloat(raw[28]) || 0 }
      ].filter(function (r) { return r.qty > 0; }),
      totalSale: computeBookingTotal_(raw, 'client')
    };
    return true;
  });
  return found;
}
function tgBookingCard_(b) {
  var lines = [
    '🔖 <b>الحجز ' + tgEsc_(b.innerRef || b.hotelRef) + '</b>',
    '',
    '👤 <b>العميل:</b> ' + tgEsc_(b.client),
    '🏨 <b>الفندق:</b> ' + tgEsc_(b.hotel || 'بلا فندق'),
    '<b>المدينة:</b> ' + tgCityIcon_(b.city) + ' ' + tgEsc_(b.city),
    '📅 <b>الفترة:</b> ' + tgEsc_(b.checkIn) + ' ← ' + tgEsc_(b.checkOut) +
      (b.nights ? (' <i>(' + tgNights_(b.nights) + ')</i>') : ''),
    '🛏 <b>الغرف:</b> ' + (b.rooms.length
      ? b.rooms.map(function (r) { return r.qty + ' ' + tgRoomLbl_(r.type); }).join(' · ') : '—'),
    '📌 <b>الحالة:</b> ' + tgEsc_(b.status || '—')
  ];
  if (b.supplier) lines.push('🏢 <b>المورد:</b> ' + tgEsc_(b.supplier));
  if (b.hotelRef && b.hotelRef !== b.innerRef) lines.push('🏨 <b>رقم حجز الفندق:</b> ' + tgEsc_(b.hotelRef));
  if (b.optionDate) lines.push('⏰ <b>Option Date:</b> ' + tgEsc_(b.optionDate));
  if (b.qaid) lines.push('🧾 <b>رقم القيد:</b> ' + tgEsc_(b.qaid));
  if (b.salesAgent) lines.push('👥 <b>مسؤول البيع:</b> ' + tgEsc_(b.salesAgent));
  if (b.notes) lines.push('📝 <b>ملاحظات:</b> ' + tgEsc_(b.notes));
  return lines.join('\n');
}
function tgRoomLbl_(t) {
  return { doubles: 'ثنائية', triples: 'ثلاثية', quads: 'رباعية', quints: 'خماسية' }[t] || t;
}
// نص عدد الغرف بالأنواع من كائن يحمل مفاتيح doubles/triples/quads/quints (لقطة حجز أو بيانات طلب)
function tgRoomsCountStr_(obj) {
  if (!obj) return '';
  return ['doubles', 'triples', 'quads', 'quints'].filter(function (k) { return parseInt(obj[k], 10) > 0; })
    .map(function (k) { return parseInt(obj[k], 10) + ' ' + tgRoomLbl_(k); }).join(' · ');
}

// وجهة إرسال المستند: الجروب لمن يملك sendGroup، وإلا محادثة البوت الخاصة بالموظف نفسه.
// يُستدعى دائمًا بعد تمرير الأمر عبر tgRouteChat_ فتكون chatId/chatType هنا "الفعليتين"
// (بعد أي تحويل للخاص) — لذلك الحالة "جروب بلا sendGroup" لا تصل إلى هنا أصلًا عمليًا،
// والفحص أدناه شبكة أمان دفاعية فقط لا مسارًا متوقَّع الحدوث
function tgDocTarget_(ctx, chatId, chatType) {
  var cfg = tgCfg_();
  if (ctx.botUser.perms.sendGroup && cfg.chatId) return { id: cfg.chatId, isGroup: true };
  if (chatType && chatType !== 'private') {
    throw new Error('لا تملك صلاحية إرسال المستندات للجروب.\nافتح محادثة خاصة مع البوت وأعد الأمر هناك ليصلك الملف.');
  }
  return { id: chatId, isGroup: false };
}
// الأوامر المالية/الحسّاسة (تأكيد حجز، كشف حساب) تعمل من الجروب لكل موظف حسب صلاحياته:
// من يملك sendGroup يكمل التفاعل والنتيجة في الجروب مباشرة (هذا معنى الصلاحية أصلًا)،
// ومن لا يملكها يستخدم نفس الأمر من الجروب فيُحوَّل التفاعل كله لمحادثته الخاصة مع البوت
// تلقائيًا بدل رفض الأمر بالكامل — فلا تظهر الأسعار والأرصدة لبقية الأعضاء
function tgRouteChat_(ctx, chatId, chatType, label) {
  if (!chatType || chatType === 'private' || ctx.botUser.perms.sendGroup) {
    return { id: chatId, type: chatType, redirected: false };
  }
  var pm = String(ctx.botUser.tgId);
  try {
    tgSendTo_(pm, '👋 <b>' + tgEsc_(label) + '</b>\nتابعنا هنا — طلبته من الجروب وهذا بيانات مالية لا تُعرض هناك.');
  } catch (e) {
    // البوت لا يمكنه فتح محادثة خاصة إلا لو بدأها المستخدم بنفسه أولًا (زر ابدأ/ /start)
    throw new Error('لا تملك صلاحية عرض هذا في الجروب، وتعذّر مراسلتك في الخاص (' + e.message + ').\n' +
      'افتح محادثة خاصة مع البوت أولًا (ابحث عنه واضغط "ابدأ") ثم أعد الأمر من الجروب.');
  }
  tgSendTo_(chatId, '📩 ' + tgEsc_(label) + ' — أرسلت التفاصيل في محادثتنا الخاصة (بيانات مالية لا تُعرض في الجروب).');
  return { id: pm, type: 'private', redirected: true };
}


// ---- سجل نشاط البوت ----
// كل تحديث يصل يُسجَّل بنتيجته. بدون هذا السجل كان "الأمر لم يفعل شيئًا" لغزًا بلا أثر:
// لا نعرف هل وصل التحديث أصلًا، أم وصل وفشل، أم رُفض لصلاحية
// سجل نشاط البوت — انتقل من الكتابة في شيت (appendRow في كل تحديث كان يُبطئ doPost فيدفع
// تليجرام لإعادة الإرسال) إلى حلقة تخزين في CacheService: كتابة ذاكرة سريعة بلا أي نداء شيت.
// آخر 30 حدثًا تكفي تمامًا للتشخيص، والكاش يكفيها بسهولة.
var TG_LOG_CACHE_KEY_ = 'tg_actlog';
function tgLog_(updId, chatId, chatType, who, text, result) {
  try {
    var cache = CacheService.getScriptCache();
    var arr = [];
    try { var raw = cache.get(TG_LOG_CACHE_KEY_); if (raw) arr = JSON.parse(raw); } catch (e0) {}
    arr.push({ ts: Date.now(), updId: String(updId || ''), chatId: String(chatId || ''),
      chatType: String(chatType || ''), who: String(who || ''),
      text: String(text || '').slice(0, 160), result: String(result || '').slice(0, 200) });
    if (arr.length > 30) arr = arr.slice(-30);
    cache.put(TG_LOG_CACHE_KEY_, JSON.stringify(arr), 21600);
  } catch (e) { Logger.log('tgLog_: ' + e.message); }
  // أثر دائم في سجل التعديلات نفسه (الكاش أعلاه يحتفظ بآخر 30 حدثًا فقط ولمدة 6 ساعات):
  // كل أمر أو ضغطة زر أو طلب مستند من تليجرام يظهر لفريق العمل في الشاشة نفسها التي
  // يراجعون فيها بقية التغييرات، ومعه اسم من أرسله — لا في شاشة منفصلة يسهل تجاهلها
  try { tgLogToChangelog_(chatType, who, text, result); } catch (eCl) { Logger.log('tgLog_/changelog: ' + eCl.message); }
}
// أحداث لا قيمة لأرشفتها دائمًا (تكرار تسليم، رسالة بلا نص، تحديث عضوية) — تبقى في الكاش فقط
// نُسجِّل هنا فقط الأوامر النصية الصريحة (/أمر أو "بحث:/رصيد:/كشف وصول:" المباشرة) — لا
// ضغطات الأزرار ("[زر] rq:ok:...") ولا خطوات إكمال محادثة وسيطة. السبب: كل إجراء فعلي ناتج
// عن ضغطة زر له بالفعل سطر تسجيل خاص به تفصيلي في مكانه (رد الموظف على طلب بوابة، إصدار
// تأكيد حجز، حفظ سعر، حجز جديد...) — تسجيله هنا ثانية كان يُنتج سطرين لنفس الإجراء الواحد:
// الأول تفصيلي ومفيد، والثاني رمز خام مبهم مثل "rq:ok:53f1c09c" لا يحمل أي معلومة فعلية
function tgLogToChangelog_(chatType, who, text, result) {
  var res = String(result || '');
  if (/^تجاهل/.test(res) || /عضوية البوت/.test(res)) return;
  var body = String(text || '').trim();
  if (!body) return;
  if (!/^\//.test(body) && !/^(بحث|كشف\s*وصول|رصيد)\s*:/.test(body)) return;
  var where = (chatType && chatType !== 'private') ? 'جروب' : 'محادثة خاصة';
  logChange_(String(who || 'مستخدم تليجرام'), 'تليجرام',
    '', body.slice(0, 120) + ' — ' + res.slice(0, 80) + ' (' + where + ')', '', '',
    { recordKey: 'TG:' + Utilities.formatDate(new Date(), 'GMT+3', 'yyyy-MM-dd') });
}
function getTelegramBotLog(token) {
  try {
    requireAdmin_(token);
    var arr = [];
    try { var raw = CacheService.getScriptCache().get(TG_LOG_CACHE_KEY_); if (raw) arr = JSON.parse(raw); } catch (e0) {}
    return safeReturn_({ ok: true, items: arr.reverse() });
  } catch (e) { return { ok: false, error: e.message, items: [] }; }
}

// ---- نقطة استقبال تليجرام ----
// ترد دائمًا بـ200 حتى لو فشل المعالج: أي خطأ يُعاد إرسال نفس التحديث من تليجرام مرارًا
// فيتكرر الإجراء (إصدار مستند مرتين مثلاً). نبتلع الخطأ ونُعلم المستخدم برسالة بدلاً منه.
// ⚠️ قاعدة حاسمة (ثبتت بالمقارنة مع مشروع Apps Script آخر يعمل بوته بلا عطل واحد):
// **doPost يجب ألا تُرجع أي محتوى إطلاقًا — لا ContentService ولا HtmlService.**
// السبب: Apps Script يُصدر تحويل 302 إلى script.googleusercontent.com لسبب واحد فقط، هو
// تسليم *جسم الرد*. فإن لم تُرجع الدالة شيئًا فلا جسم يُسلَّم، ويردّ Apps Script بـ 200
// مباشرة بلا أي تحويل. وتليجرام لا يتّبع التحويلات إطلاقًا عند تسليم الويب هوك: يرى 302
// الخام فيعتبره فشلًا ويُعيد المحاولة بلا توقف (وهذا بالضبط ما ولّد
// "Wrong response from the webhook: 302 Found" وسيل الرسائل المكرر).
// كان الرد هنا ContentService.createTextOutput('ok') — وتليجرام لا يقرأ جسم الرد أصلًا،
// فلم يكن يفيد بشيء بينما كان هو نفسه سبب التحويل الذي عطّل الويب هوك بالكامل.
// لا تُضِف return لأي قيمة هنا مهما بدا ذلك منطقيًا.
function doPost(e) {
  var upd = null;
  try {
    var secret = PropertiesService.getScriptProperties().getProperty(TG_PROP_HOOK_);
    if (!secret || !e || !e.parameter || e.parameter.tghook !== secret) return; // ليس من تليجرام
    // في وضع السحب لا نعالج الويب هوك حتى لو وصل (احتياطًا لو بقي مسجّلاً لحظيًا) — يمنع
    // ازدواج المعالجة مع مشغّل السحب
    if (tgBotMode_() === 'polling') return;
    upd = JSON.parse(e.postData.contents);
    tgProcessUpdate_(upd);   // نفس المعالج الموحّد المستخدَم في وضع السحب — لا ازدواج منطق
  } catch (err) {
    Logger.log('doPost: ' + err.message);
    try { tgLog_(upd && upd.update_id, '', '', '', '', '⛔ عطل: ' + err.message); } catch (e2) {}
  }
}

// داخل الجروبات يلحق تليجرام اسم البوت بالأمر (/link@MenfBot ABC123) — وبدون تجريده كان
// "@MenfBot" يُقرأ كأنه كود الربط أو رقم الحجز، فيفشل كل أمر له وسيط داخل الجروب وحده
// بينما تنجح الأوامر بلا وسيط (/help) — وهو ما جعل العطل محيّرًا
function tgParseCommand_(raw) {
  var text = String(raw || '').trim();
  var m = text.match(/^\/([A-Za-z_\u0600-\u06FF]+)(?:@([A-Za-z0-9_]{3,}))?(?:\s+([\s\S]*))?$/);
  if (!m) return { name: '', arg: '', bot: '', text: text };
  var name = m[1].toLowerCase(), arg = (m[3] || '').trim();
  return { name: name, arg: arg, bot: m[2] || '', text: '/' + name + (arg ? (' ' + arg) : '') };
}
function tgHandleMessage_(msg) {
  var chatId = msg.chat.id, from = msg.from || {}, text = (msg.text || '').trim();
  var chatType = (msg.chat && msg.chat.type) || 'private';
  var tgName = ((from.first_name || '') + ' ' + (from.last_name || '')).trim() || (from.username || '');
  var cmd = tgParseCommand_(text);
  text = cmd.text;   // النص بعد تجريد @اسم_البوت من الأمر
  try {
    // ربط تلقائي: لو اسم مستخدم تليجرام لمن يكتب الآن يطابق ربطًا معلَّقًا أضافه المدير من
    // شاشة الإعدادات — يكتمل الربط فورًا بلا أي كود أو أمر
    if (!tgUserByTgId_(from.id)) {
      try {
        var autoLinked = tgTryAutoLinkByUsername_(from, tgName);
        if (autoLinked) {
          var uAuto = getUserByUsername_(autoLinked.username);
          tgSendTo_(chatId, '✅ تم ربط حسابك تلقائيًا.\n👤 ' + tgEsc_((uAuto && uAuto.displayName) || autoLinked.username) +
            '\n\nاكتب /menu لعرض الأزرار المتاحة لك.', tgMenuKeyboard_(from.id));
        }
      } catch (eAuto) { Logger.log('tgTryAutoLinkByUsername_: ' + eAuto.message); }
    }
    // أوامر نصية مباشرة بصيغة "كلمة : المطلوب" — تُنفَّذ فورًا بلا انتظار أي سؤال من البوت
    var direct = tgParseDirect_(text);
    if (direct && direct.kind === 'search') { tgCmdSearch_(chatId, from, direct.query, chatType); return 'تم بحث'; }
    if (direct && direct.kind === 'arrivals') { tgCmdArrivalsClient_(chatId, from, direct, chatType); return 'تم كشف وصول'; }
    if (direct && direct.kind === 'balance') { tgCmdBalance_(chatId, from, direct.query, chatType, direct.asOfIso); return 'تم رصيد'; }
    if (direct && direct.kind === 'statement') { tgCmdStatement_(chatId, from, direct.query, chatType); return 'تم كشف حساب'; }
    if (direct && direct.kind === 'confirm') { tgCmdConfirmStart_(chatId, from, direct.ref, chatType); return 'تم تأكيد حجز (مباشر)'; }
    if (direct && direct.kind === 'balAsOf') {
      tgCmdBalancesAsOfDirect_(chatId, from, chatType, direct.scope, direct.asOfIso, direct.asOfRaw); return 'تم أرصدة بتاريخ';
    }
    if (direct && direct.kind === 'balAll') { tgCmdBalancesAllDirect_(chatId, from, chatType); return 'تم أرصدة الكل'; }
    if (direct && direct.kind === 'balDay') { tgCmdDayBalances_(chatId, from, direct.offset, chatType); return 'تم أرصدة اليوم/غدًا'; }
    if (direct && direct.kind === 'balRange') {
      tgCmdBalancesRangeDirect_(chatId, from, chatType, direct.fromIso, direct.toIso, direct.fromRaw, direct.toRaw);
      return 'تم أرصدة فترة';
    }
    if (direct && direct.kind === 'arrivalsDay') {
      tgCmdArrivalsDayDirect_(chatId, from, chatType, direct.dayIso, direct.dayRaw); return 'تم دخول بتاريخ';
    }
    if (direct && direct.kind === 'balArrivalDay') {
      tgCmdArrivalsDayBalancesDirect_(chatId, from, chatType, direct.dayIso, direct.dayRaw); return 'تم أرصدة دخول بتاريخ';
    }
    // معرّف المحادثة: يُطلب من داخل الجروب لضبط الإعدادات — لا يكشف أي بيانات
    if (cmd.name === 'chatid' || cmd.name === 'id') { tgSendTo_(chatId, tgChatIdText_(msg)); return 'تم /chatid'; }
    if (cmd.name === 'ping') { tgSendTo_(chatId, tgPingText_(msg)); return 'تم /ping'; }
    // /link و /start و /help لا تتطلب ربطًا مسبقًا (وإلا استحال الربط أصلاً)
    // /start يحمل كود الربط عند فتح رابط t.me/Bot?start=CODE — لولا معالجته هنا لظهرت
    // رسالة المساعدة فقط وبقي الحساب غير مربوط رغم فتح الرابط
    var startPayload = (cmd.name === 'start') ? cmd.arg : '';
    if ((cmd.name === 'start' || cmd.name === 'help') && !startPayload) {
      // Fallback: عميل تليجرام أحيانًا لا يمرر كود الرابط العميق مع /start (وحدث ذلك مرارًا
      // في التجارب مع الحساب الجديد) — إن كان المستخدم غير مربوط، افتح نموذج askArg لكود
      // الربط بدل مجرد إظهار /help الذي يقول "أنت غير مربوط" بلا حل مباشر
      if (cmd.name === 'start' && !tgUserByTgId_(from.id)) {
        // لو المدير أضاف ربطًا معلَّقًا برقم موبايل (لا اسم مستخدم) نعرض زر مشاركة الرقم —
        // أبسط للموظف من كتابة كود، ويكتمل الربط بضغطة واحدة
        var hasPendingPhone = tgPendingLinks_().some(function (r) { return r.type === 'phone'; });
        tgSetSession_(chatId, from.id, 'askArg', 'wait', { action: 'link' });
        var startMsg = '👋 <b>أهلاً بك في بوت حجوزات منف</b>\n\n' +
          'لم يصلني كود الربط تلقائيًا (يحدث أحيانًا). أرسل الآن <b>كود الربط المكوَّن من 6 أحرف</b> الذي حصلت عليه من المدير' +
          (hasPendingPhone ? '،\nأو اضغط الزر أدناه لمشاركة رقم موبايلك ليكتمل الربط تلقائيًا لو كان مسجَّلاً.' : '.');
        tgSendTo_(chatId, startMsg, tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
        if (hasPendingPhone) {
          try {
            tgApi_('sendMessage', {
              chat_id: String(chatId), text: '📱 أو اضغط هنا لمشاركة رقمك:',
              reply_markup: JSON.stringify({ keyboard: [[{ text: '📱 مشاركة رقمي', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true })
            });
          } catch (eKb) {}
        }
        return 'بدء الربط بالسؤال';
      }
      tgSendTo_(chatId, tgHelpText_(from.id), tgMenuKeyboard_(from.id)); return 'تم /help';
    }
    if (cmd.name === 'menu') {
      var mkb = tgMenuKeyboard_(from.id);
      if (!mkb) { tgSendTo_(chatId, tgHelpText_(from.id)); return 'تم /menu (غير مربوط)'; }
      // تليجرام يجعل عرض لوحة الأزرار المرفقة برسالة = عرض "فقاعة" تلك الرسالة نفسها،
      // والفقاعة تتمدد بعرض أطول سطر نص فيها لا بعرض الشاشة — رسالة قصيرة كـ"اختر ما تريد"
      // تبقي الفقاعة (والأزرار معها) ضيقة رغم أن الأزرار مصفوفة صفين-صفين. لذا نستخدم هنا
      // سطرًا بطول مقارب لأطول سطر في /help فتتمدد الفقاعة لعرض المحادثة الكامل، فتظهر
      // الأزرار بنفس عرض /help تمامًا بدل عمود ضيق
      tgSendTo_(chatId, '🤖 <b>القائمة الرئيسية</b>\nاختر أحد الأزرار أدناه للوصول السريع لأي أمر بدل كتابته يدويًا — نفس أوامر /help بالضبط.', mkb);
      return 'تم /menu';
    }
    if (startPayload || cmd.name === 'link') {
      var code = startPayload || cmd.arg;
      if (!code) { tgSendTo_(chatId, 'أرسل: <code>/link الكود</code>\nالكود يولّده المدير من شاشة الإعدادات.'); return 'ربط بلا كود'; }
      var linked = tgConsumeLinkCode_(code, from.id, tgName);
      var u = getUserByUsername_(linked.username);
      tgSendTo_(chatId, '✅ تم الربط بنجاح.\n👤 ' + tgEsc_((u && u.displayName) || linked.username) +
        (chatType !== 'private' ? '\n\n⚠️ تم الربط من داخل جروب — يُفضَّل الربط في المحادثة الخاصة حتى لا يرى غيرك الكود.' : '') +
        '\n\nاكتب /help لعرض الأوامر المتاحة لك.');
      return 'تم الربط بـ' + linked.username;
    }
    if (cmd.name === 'cancel' || cmd.name === 'الغاء') { tgClearSession_(chatId, from.id); tgSendTo_(chatId, '❌ أُلغي الإجراء الحالي.'); return 'تم /cancel'; }

    // نموذج قيد التشغيل؟ الرسالة إجابة على سؤال لا أمر جديد — نستثني فقط لو تحققت فعلًا صيغة
    // أمر حقيقية (cmd.name غير فارغ)؛ اختبار "يبدأ بـ /" وحده كان يُسقِط رسائل بيانات صحيحة
    // بدأها المستخدم سهوًا بـ"/" متبوعة بمسافة (لا تُطابِق صيغة أمر أصلاً فيبقى cmd.name فارغًا)
    var sess = tgGetSession_(chatId, from.id);
    if (sess && sess.flow === 'confirm' && !cmd.name) { tgConfirmStep_(chatId, from, sess, text); return 'خطوة في نموذج التأكيد'; }
    if (sess && sess.flow === 'arwiz' && !cmd.name) { tgArrivalsWizStep_(chatId, from, sess, text); return 'خطوة كشف وصول'; }
    if (sess && sess.flow === 'newbk' && !cmd.name) { tgNewBookingStep_(chatId, from, sess, text); return 'خطوة تسجيل حجز'; }
    if (sess && sess.flow === 'pricewiz' && !cmd.name) { tgPriceWizStep_(chatId, from, sess, text, chatType); return 'خطوة تسجيل أسعار'; }
    if (sess && sess.flow === 'balasof' && !cmd.name) { tgBalancesAsOfStep_(chatId, from, sess, text, chatType); return 'خطوة أرصدة بتاريخ'; }
    if (sess && sess.flow === 'balrange' && !cmd.name) { tgBalancesRangeStep_(chatId, from, sess, text, chatType); return 'خطوة أرصدة فترة'; }
    if (sess && sess.flow === 'newbkform' && !cmd.name) { tgNewBookingFormStep_(chatId, from, sess, text, chatType); return 'نموذج حجز جديد'; }
    if (sess && sess.flow === 'ocrbk' && !cmd.name) { tgOcrStep_(chatId, from, sess, text); return 'خطوة قراءة تأكيد'; }
    if (sess && sess.flow === 'editbk' && !cmd.name) { tgEditBookingStep_(chatId, from, sess, text, chatType); return 'خطوة تعديل حجز'; }
    // إكمال بيانات من القائمة بالأزرار (mn:bk/cf/st) — المستخدم ضغط زرًا فطلب منه البوت رقم
    // الحجز أو اسم العميل، وهذه الرسالة هي إجابته لا أمرًا جديدًا
    if (sess && sess.flow === 'askArg' && !cmd.name) {
      tgClearSession_(chatId, from.id);
      var askAct = sess.data && sess.data.action;
      if (askAct === 'sr') { tgCmdSearch_(chatId, from, text.trim(), chatType); return 'تم بحث (من القائمة)'; }
      if (askAct === 'bk') { tgCmdBooking_(chatId, from, text.trim(), chatType); return 'تم /booking (من القائمة)'; }
      if (askAct === 'cf') { tgCmdConfirmStart_(chatId, from, text.trim(), chatType); return 'تم /confirm (من القائمة)'; }
      if (askAct === 'st') { tgCmdStatement_(chatId, from, text.trim(), chatType); return 'تم /statement (من القائمة)'; }
      if (askAct === 'rs') { tgCmdBalance_(chatId, from, text.trim(), chatType); return 'تم رصيد (من القائمة)'; }
      if (askAct === 'link') {
        var linked2 = tgConsumeLinkCode_(text.trim(), from.id, tgName);
        var u2 = getUserByUsername_(linked2.username);
        tgSendTo_(chatId, '✅ تم الربط بنجاح.\n👤 ' + tgEsc_((u2 && u2.displayName) || linked2.username) +
          '\n\nاكتب /menu لعرض الأزرار المتاحة لك.', tgMenuKeyboard_(from.id));
        return 'تم الربط عبر السؤال';
      }
      return 'إجراء قائمة غير معروف';
    }

    // أمر + بيانات في رسالة واحدة: أول سطر "حجز جديد" متبوعًا بنموذج "مفتاح: قيمة" — تُعرَض
    // شاشة مراجعة قبل التسجيل دائمًا (tgTryOneShotNewBooking_). !cmd.name (لا !/^\//) لأن
    // بعض المستخدمين يسبقون السطر بـ"/" سهوًا؛ tgParseCommand_ لا يعتبرها أمرًا أصلًا (لن
    // تُطابِق صيغة /كلمة إن كانت هناك مسافة بعد الشرطة) فيبقى cmd.name فارغًا ولا خطر من ذلك —
    // الدالة نفسها تتحقق أن أول سطر (بعد تجاهل أي "/" في مقدمته) هو فعلاً "حجز جديد" ونحوها
    if (!cmd.name && tgTryOneShotNewBooking_(chatId, from, chatType, text)) return 'تم تسجيل حجز جديد (أمر ببيانات كاملة)';
    if (cmd.name === 'whoami') { tgSendTo_(chatId, tgWhoamiText_(from.id)); return 'تم /whoami'; }
    if (cmd.name === 'search') { tgCmdSearch_(chatId, from, cmd.arg, chatType); return 'تم /search'; }
    if (cmd.name === 'booking') { tgCmdBooking_(chatId, from, cmd.arg, chatType); return 'تم /booking'; }
    if (cmd.name === 'confirm') { tgCmdConfirmStart_(chatId, from, cmd.arg, chatType); return 'تم /confirm'; }
    if (cmd.name === 'statement') { tgCmdStatement_(chatId, from, cmd.arg, chatType); return 'تم /statement'; }
    if (cmd.name === 'today') { tgCmdDay_(chatId, from, 0, chatType); return 'تم /today'; }
    if (cmd.name === 'tomorrow') { tgCmdDay_(chatId, from, 1, chatType); return 'تم /tomorrow'; }
    if (cmd.name === 'balance' || cmd.name === 'رصيد') { tgCmdBalance_(chatId, from, cmd.arg, chatType); return 'تم /رصيد'; }
    if (cmd.name === 'arrivals') { tgCmdArrivalsClient_(chatId, from, tgParseArrivalsBody_(cmd.arg), chatType); return 'تم /arrivals'; }
    if (cmd.name === 'newbooking' || cmd.name === 'حجز') { tgCmdNewBookingStart_(chatId, from, chatType); return 'تم /حجز جديد'; }
    if (cmd.name === 'edit' || cmd.name === 'تعديل') { tgCmdEditBookingStart_(chatId, from, cmd.arg, chatType); return 'تم /تعديل'; }
    if (cmd.name === 'prices' || cmd.name === 'اسعار') { tgCmdMissingPrices_(chatId, from, chatType); return 'تم /اسعار'; }
    if (cmd.name === 'balances' || cmd.name === 'ارصدة') { tgCmdBalancesAsOfStart_(chatId, from, chatType); return 'تم /ارصدة'; }
    if (/^\//.test(text)) { tgSendTo_(chatId, 'أمر غير معروف. اكتب /help للأوامر المتاحة.'); return 'أمر غير معروف'; }
    // رسالة حرة تصف حجزًا (تاريخان + عدد غرف) — يُقترَح تسجيلها تلقائيًا بعد مراجعة المستخدم.
    // فقط لمن يملك صلاحية "تسجيل حجز جديد" (اختيارية، معطَّلة افتراضيًا) — تجنبًا لبدء تدفق
    // غير مرغوب لكل رسالة عادية تحتوي أرقامًا وتواريخ بالمصادفة
    if (tgUserByTgId_(from.id) && tgUserByTgId_(from.id).perms.newbooking && tgLooksLikeBookingText_(text)) {
      tgStartNewBookingFlow_(chatId, from, chatType, text);
      return 'رُصدت رسالة حجز — بدأت المراجعة';
    }
    return 'نص عادي — بلا إجراء';
  } catch (err) {
    // الرفض والخطأ يصلان للمستخدم دائمًا: الصمت هو أسوأ ردّ ممكن من بوت
    try { tgSendTo_(chatId, '⛔ ' + tgEsc_(err.message)); } catch (e2) {}
    return '⛔ ' + err.message;
  }
}

// يُجيب بمعرّف المحادثة الحالية — الطريق الوحيد الموثوق لضبط "معرّف الجروب" بعد تفعيل
// الويب هوك، لأن getUpdates يرفض العمل ما دام الويب هوك مسجَّلاً (خطأ 409 من تليجرام)
function tgPingText_(msg) {
  var bu = tgUserByTgId_(msg.from && msg.from.id);
  return '🏓 <b>وصلت رسالتك</b>\n🕒 ' + Utilities.formatDate(new Date(), 'GMT+3', 'dd/MM/yyyy HH:mm:ss') +
    '\n🔗 الربط: ' + (bu ? ('مربوط بـ<code>' + tgEsc_(bu.username) + '</code>') : 'غير مربوط') +
    '\n📂 المحادثة: ' + tgEsc_((msg.chat && msg.chat.type) || '');
}
function tgChatIdText_(msg) {
  var c = msg.chat || {};
  var isGroup = c.type && c.type !== 'private';
  return '🆔 <b>معرّف هذه المحادثة</b>\n<code>' + tgEsc_(String(c.id)) + '</code>' +
    '\n📛 ' + tgEsc_(c.title || c.username || c.first_name || '') +
    '\n📂 النوع: ' + tgEsc_(c.type || '') +
    (isGroup
      ? '\n\nانسخ الرقم أعلاه كما هو (بالإشارة السالبة) والصقه في:\nالإعدادات ← تنبيهات تليجرام ← <b>معرّف الجروب</b>.'
      : '\n\nهذه محادثة خاصة — معرّف الجروب يُطلب من داخل الجروب نفسه.');
}
// نحفظ آخر جروب رآه البوت ليعمل زر "اكتشاف الجروب تلقائيًا" حتى مع الويب هوك مفعَّلاً
function tgRememberChat_(msg) {
  try {
    var c = (msg && msg.chat) || {};
    if (!c.id || !c.type || c.type === 'private') return;
    PropertiesService.getScriptProperties().setProperty(TG_PROP_SEENCHAT_, JSON.stringify({
      id: String(c.id), title: c.title || '', type: c.type, ts: Date.now()
    }));
  } catch (e) { /* التقاط مساعد فقط — لا يعطّل أي أمر */ }
}
// أزرار القائمة — بديل الكتابة اليدوية، مُصفّاة حسب صلاحيات الموظف على البوت فقط (الفحص
// الحقيقي عند الضغط عبر tgRequire_ يبقى قائمًا؛ التصفية هنا لتقليل الأزرار المرفوضة فقط)
// كانت أغلب الأزرار سطرًا مستقلاً لكل زر (قائمة طولية) — الآن كل الأزرار المتاحة تُجمَّع أولاً
// ثم تُقسَّم صفين-صفين (شبكة بعرض الشاشة) بدل قائمة عمودية ضيقة، بصرف النظر عن أي صلاحيات
// فُعِّلت فعليًا — فتبقى الشبكة مضغوطة سواء كانت الصلاحيات كاملة أو جزئية
function tgMenuKb_(perms) {
  var btns = [];
  if (perms.query) {
    btns.push(tgBtn_('🔎 استعلام عن حجز', 'mn:bk'), tgBtn_('🔍 بحث عام', 'mn:sr'),
      tgBtn_('🌅 دخول اليوم', 'mn:td'), tgBtn_('🌆 دخول غدًا', 'mn:tm'),
      tgBtn_('📋 كشف وصول', 'mn:ar'));
  }
  if (perms.confirm) btns.push(tgBtn_('📄 إصدار تأكيد حجز', 'mn:cf'));
  if (perms.statement) {
    btns.push(tgBtn_('📊 كشف حساب', 'mn:st'), tgBtn_('💳 رصيد عميل', 'mn:rs'),
      tgBtn_('💰 أرصدة اليوم', 'mn:bd'), tgBtn_('💰 أرصدة غدًا', 'mn:bt'),
      tgBtn_('📆 أرصدة بتاريخ / حتى تاريخه', 'mn:ba'),
      tgBtn_('📅 أرصدة دخول خلال فترة', 'mn:br'));
  }
  if (perms.newbooking) btns.push(tgBtn_('🆕 تسجيل حجز جديد', 'mn:nb'));
  if (perms.prices) btns.push(tgBtn_('✏️ تعديل حجز', 'mn:eb'), tgBtn_('💵 حجوزات بلا أسعار', 'mn:pr'));
  btns.push(tgBtn_('🔑 صلاحياتي', 'mn:wh'), tgBtn_('❓ المساعدة', 'mn:hp'));
  var rows = [];
  for (var i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  return rows.length ? tgKb_(rows) : null;
}
function tgMenuKeyboard_(tgId) {
  var bu = tgUserByTgId_(tgId);
  return bu ? tgMenuKb_(bu.perms) : null;
}
// معالج ضغطات القائمة: إجراء فوري (اليوم/غدًا/من أنا) أو طلب بيانة ناقصة (رقم حجز/اسم عميل)
// ثم انتظار الرد التالي كنموذج بخطوة واحدة (flow: 'askArg') — يمر بنفس فحص الصلاحية والتحويل
// للخاص (tgRouteChat_) الذي تمر به الأوامر النصية المكافئة بالضبط، فلا ثغرة عبر الأزرار
// اسم صاحب الطلب — يُعرض في الجروب قبل بدء أي حوار حتى يعرف الجميع من طلب الإجراء،
// ثم يُكمل البوت الخطوات مع صاحب الطلب نفسه
function tgWho_(from) {
  var n = (((from && from.first_name) || '') + ' ' + ((from && from.last_name) || '')).trim();
  return n || ((from && from.username) || 'مستخدم');
}
function tgCbMenu_(cb, chatId, msgId, from, action, chatType) {
  if (action === 'td') { tgCmdDay_(chatId, from, 0, chatType); tgAnswerCb_(cb.id, ''); return; }
  if (action === 'tm') { tgCmdDay_(chatId, from, 1, chatType); tgAnswerCb_(cb.id, ''); return; }
  if (action === 'bd') { tgCmdDayBalances_(chatId, from, 0, chatType); tgAnswerCb_(cb.id, ''); return; }
  if (action === 'bt') { tgCmdDayBalances_(chatId, from, 1, chatType); tgAnswerCb_(cb.id, ''); return; }
  if (action === 'ar') {
    var ctxAr = tgRequire_(from.id, 'query');
    tgSetSession_(chatId, from.id, 'arwiz', 'client', {});
    tgAnswerCb_(cb.id, '');
    tgArrivalsWizAsk_(chatId, { step: 'client', data: {} });
    return;
  }
  if (action === 'wh') { tgSendTo_(chatId, tgWhoamiText_(from.id)); tgAnswerCb_(cb.id, ''); return; }
  if (action === 'pr') { tgAnswerCb_(cb.id, ''); tgCmdMissingPrices_(chatId, from, chatType); return; }
  if (action === 'nb') { tgAnswerCb_(cb.id, ''); tgCmdNewBookingStart_(chatId, from, chatType); return; }
  if (action === 'eb') { tgAnswerCb_(cb.id, ''); tgCmdEditBookingStart_(chatId, from, '', chatType); return; }
  if (action === 'ba') { tgAnswerCb_(cb.id, ''); tgCmdBalancesAsOfStart_(chatId, from, chatType); return; }
  if (action === 'br') { tgAnswerCb_(cb.id, ''); tgCmdBalancesRangeStart_(chatId, from, chatType); return; }
  if (action === 'hp') { tgAnswerCb_(cb.id, ''); tgSendTo_(chatId, tgHelpText_(from.id)); return; }
  var spec = {
    sr: { perm: 'query',     label: 'كلمات البحث (مثال: جنادرية سويلم)',       icon: '🔍', route: false },
    bk: { perm: 'query',     label: 'رقم الحجز (الرقم الداخلي أو رقم الفندق)', icon: '🔎', route: false },
    cf: { perm: 'confirm',   label: 'رقم الحجز لإصدار تأكيد',                 icon: '📄', route: true  },
    st: { perm: 'statement', label: 'اسم العميل أو المورد',                   icon: '📊', route: true  },
    rs: { perm: 'statement', label: 'اسم العميل لعرض رصيده',                  icon: '💳', route: false, kind: 'balance' }
  }[action];
  if (!spec) { tgAnswerCb_(cb.id, ''); return; }
  var ctx = tgRequire_(from.id, spec.perm);
  var target = spec.route ? tgRouteChat_(ctx, chatId, chatType, spec.icon + ' ' + spec.label) : { id: chatId };
  tgSetSession_(target.id, from.id, 'askArg', 'wait', { action: action });
  var inGroup = chatType && chatType !== 'private';
  // في الجروب: أعلن من طلب الإجراء قبل السؤال، فلا تختلط الردود بين الأعضاء
  var head = (inGroup && !target.redirected) ? ('👤 <b>' + tgEsc_(tgWho_(from)) + '</b> طلب: ' + spec.icon + ' ' + tgEsc_(spec.label) + '\n') : '';
  tgSendTo_(target.id, head + spec.icon + ' أرسل الآن: <b>' + spec.label + '</b>' +
    (head ? '\n<i>(الردّ من صاحب الطلب)</i>' : ''), tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
function tgHelpText_(tgId) {
  var bu = tgUserByTgId_(tgId);
  if (!bu) {
    return '👋 <b>بوت حجوزات منف</b>\n\nحسابك غير مربوط بعد.\n' +
      'اطلب من المدير كود ربط من: الإعدادات ← بوت تليجرام ← "توليد كود ربط"،\n' +
      'ثم افتح رابط الربط الذي يرسله لك، أو أرسل هنا:\n<code>/link الكود</code>\n\n' +
      '🆔 <code>/chatid</code> — يعمل بلا ربط، ويعطي معرّف هذه المحادثة.';
  }
  var p = bu.perms, lines = ['🤖 <b>الأوامر المتاحة لك</b>',
    '<i>كل أمر هنا له زر مقابل في /menu — لا حاجة لحفظ أي صيغة.</i>', ''];
  if (p.query) {
    lines.push('🔎 <code>/booking 45670</code> — بيانات حجز (بالرقم الداخلي أو رقم الفندق)');
    lines.push('🔍 <code>بحث جنادرية سويلم</code> — بحث متقاطع (يعرض الغرف والمورد ورقم الفندق)');
    lines.push('🌅 <code>دخول اليوم</code> · <code>دخول غدا</code> · <code>دخول 5-9</code> — ملخص الدخول');
    lines.push('📋 <code>كشف وصول العميل من 3-9 الى 30-9 pdf</code> — الفترة والصيغة اختياريتان (بلا تحديد: من اليوم وبلا نهاية)');
  }
  if (p.confirm) {
    lines.push('📄 <code>/confirm 45670</code> أو <code>تاكيد حجز 45670</code> — تأكيد حجز (PDF أو صورة)' +
      (p.sendGroup ? '' : ' <i>(يصلك في الخاص لو طلبته من الجروب)</i>'));
  }
  if (p.statement) {
    lines.push('💳 <code>رصيد اسم العميل</code> — رصيده التراكمي اليوم (وأضف تاريخًا: <code>رصيد اسم العميل 5-9</code>)');
    lines.push('📊 <code>كشف حساب اسم العميل</code> — كشف حساب كامل (عرض هنا أو PDF أو صورة)');
    lines.push('👤 <code>ارصدة عملاء</code> · 🤝 <code>ارصدة موردين</code> · 👥 <code>ارصدة</code> — أرصدة تراكمية اليوم');
    lines.push('📆 وأضف تاريخًا لأيٍّ منها: <code>ارصدة عملاء 5-9</code> — الأرصدة حتى ذلك اليوم');
    lines.push('📚 <code>ارصدة الكل</code> — جرد كل الحسابات، مع زر لإظهار الأرصدة الصفرية');
    lines.push('💰 <code>ارصدة اليوم</code> · <code>ارصدة غدا</code> — أرصدة أصحاب الدخول اليوم/غدًا');
    lines.push('🌅 <code>ارصدة دخول 5-9</code> — أرصدة أصحاب الدخول بأي تاريخ (لا اليوم/غدًا فقط)');
    lines.push('📅 <code>ارصدة من 1-9 الى 30-9</code> — لكل يوم دخول: أرصدة عملائه ثم مورديه');
  }
  if (p.newbooking) {
    lines.push('🆕 <code>/حجز</code> — تسجيل حجز جديد بنموذج مجمَّع أو بنص حر');
    lines.push('⚡️ أو أرسل الأمر وبياناته في رسالة واحدة مباشرة (بلا انتظار الرد) — ابدأ الرسالة بسطر "حجز جديد" ثم بقية الحقول "مفتاح: قيمة" (العلامة ":" اختيارية)، وستُعرَض عليك شاشة مراجعة قبل التسجيل دائمًا');
    lines.push('📄 أرسل <b>تأكيد الفندق (PDF)</b> كملف وسأقرأه تلقائيًا، أستخلص بياناته، أعرضها لمراجعتك، ثم أطلب العميل والمورد وأسجّله حجزًا مؤكدًا');
  }
  if (p.prices) {
    lines.push('✏️ <code>/تعديل 45670</code> — تعديل حجز (فندق/مورد/تواريخ/غرف/أسعار/حالة)');
    lines.push('💵 <code>/اسعار</code> — استكمال أسعار البيع والتكلفة الناقصة');
  }
  lines.push('', '💡 <i>النقطتان بعد اسم الأمر اختيارية، والتاريخ يُقبَل يومًا وشهرًا فقط (تُكمَّل السنة تلقائيًا) أو بكلمة "اليوم"/"غدا".</i>');
  lines.push('', '👤 <code>/whoami</code> — من أنا وما صلاحياتي');
  lines.push('🆔 <code>/chatid</code> — معرّف هذه المحادثة (لضبط الجروب في الإعدادات)');
  lines.push('🏓 <code>/ping</code> — اختبار وصول الأوامر للبوت');
  lines.unshift('🧭 <code>/menu</code> — أزرار لكل ما سبق بدل كتابة الأوامر يدويًا');
  lines.push('❌ <code>/cancel</code> — إلغاء أي نموذج قيد التنفيذ');
  if (!p.query && !p.confirm && !p.statement && !p.prices && !p.newbooking) {
    lines.push('', '⚠️ لا توجد صلاحيات مفعّلة لك على البوت — راجع المدير.');
  }
  return lines.join('\n');
}
function tgWhoamiText_(tgId) {
  var bu = tgUserByTgId_(tgId);
  if (!bu) return 'غير مربوط. اكتب /help.';
  var u = getUserByUsername_(bu.username);
  var on = [];
  TG_PERMS_.forEach(function (p) { if (bu.perms[p.key]) on.push('✅ ' + p.label); });
  return '👤 <b>' + tgEsc_((u && u.displayName) || bu.username) + '</b>' +
    '\n🔑 حساب البرنامج: <code>' + tgEsc_(bu.username) + '</code>' +
    '\n📌 الحالة: ' + (bu.active ? 'نشط' : '<b>موقوف</b>') +
    '\n\n<b>صلاحيات البوت:</b>\n' + (on.length ? on.join('\n') : '— لا شيء');
}

function tgCmdBooking_(chatId, from, ref, chatType) {
  var ctx = tgRequire_(from.id, 'query');
  if (!ref) { tgSendTo_(chatId, 'أرسل: <code>/booking رقم الحجز</code>'); return; }
  var b = tgFindBooking_(ref);
  if (!b) { tgSendTo_(chatId, '❌ لم أجد حجزًا بالرقم <code>' + tgEsc_(ref) + '</code>'); return; }
  if (!bookingCityAllowed_(ctx.user, b.city)) { tgSendTo_(chatId, '⛔ هذا الحجز خارج نطاق مدينتك المسموحة.'); return; }
  var kb = [];
  if (ctx.botUser.perms.confirm && (!chatType || chatType === 'private')) {
    kb.push([tgBtn_('📄 إصدار تأكيد حجز', 'cf:start:' + b.innerRef)]);
  }
  tgSendTo_(chatId, tgBookingCard_(b), kb.length ? tgKb_(kb) : null);
}

function tgCmdDay_(chatId, from, offset, chatType) {
  tgRequire_(from.id, 'query');
  tgAnnounceIfGroup_(chatId, chatType, from, offset === 0 ? '🌅 دخول اليوم' : '🌆 دخول غدًا');
  var d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  tgSendTo_(chatId, tgBuildDigest_('daily_arrivals', tgCollectArrivals_(d.getTime())));
}
// أرصدة العملاء الذين لهم دخول اليوم/غدًا — بيانات مالية (صلاحية statement)
function tgCmdDayBalances_(chatId, from, offset, chatType) {
  tgRequire_(from.id, 'statement');
  tgAnnounceIfGroup_(chatId, chatType, from, offset === 0 ? '💰 أرصدة اليوم' : '💰 أرصدة غدًا');
  var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset);
  var iso = Utilities.formatDate(d, 'GMT+3', 'yyyy-MM-dd');
  tgAskBalanceScope_(chatId, from, chatType, 'day', iso, 'أرصدة أصحاب الدخول ' + (offset === 0 ? 'اليوم' : 'غدًا'));
}
// ==========================================================
// الأوامر المباشرة للأرصدة والدخول — تُنفَّذ من رسالة واحدة بلا حوار خطوة بخطوة
// ==========================================================
// "بلا تاريخ" هنا تعني تاريخ اليوم صراحةً، لا "بلا سقف زمني": الفرق جوهري — الثاني يضمّ
// حجوزات لم تبدأ بعد فيعطي رقمًا أكبر من الرصيد القائم فعلاً اليوم، وهو ما يسأل عنه الموظف
function tgBadDateMsg_(raw) {
  return '⚠️ لم أفهم التاريخ «' + tgEsc_(raw) + '».\n' +
    'اكتبه هكذا: <code>5-9</code> (تُكمَّل السنة تلقائيًا) أو <code>5-9-2026</code> أو <code>اليوم</code> أو <code>غدا</code>.';
}
function tgCmdBalancesAsOfDirect_(chatId, from, chatType, scope, asOfIso, asOfRaw) {
  var ctx = tgRequire_(from.id, 'statement');
  if (asOfRaw && !asOfIso) { tgSendTo_(chatId, tgBadDateMsg_(asOfRaw)); return; }
  var iso = asOfIso || tgTodayIso_();
  var label = scope === 'clients' ? 'أرصدة العملاء'
            : scope === 'suppliers' ? 'أرصدة الموردين' : 'أرصدة العملاء والموردين';
  tgAnnounceIfGroup_(chatId, chatType, from, '💰 ' + label + ' حتى ' + tgDispDate_(iso));
  tgSendTo_(chatId, '⏳ جارِ حساب ' + label + ' حتى <b>' + tgEsc_(tgDispDate_(iso)) + '</b>...');
  tgRenderBalances_(chatId, from, ctx, 'asof', iso, scope);
}
// كل الحسابات برصيد اليوم — تُعرَض بلا الأصفار أولاً (الغالب أنها ضوضاء)، مع زر يُعيد العرض
// شاملاً إياها لمن يريد جردًا كاملًا
function tgCmdBalancesAllDirect_(chatId, from, chatType) {
  var ctx = tgRequire_(from.id, 'statement');
  var iso = tgTodayIso_();
  tgAnnounceIfGroup_(chatId, chatType, from, '📚 أرصدة كل الحسابات');
  tgSendTo_(chatId, '⏳ جارِ حساب أرصدة كل الحسابات حتى <b>' + tgEsc_(tgDispDate_(iso)) + '</b>...');
  tgRenderBalances_(chatId, from, ctx, 'asof', iso, 'both', false, true);
}
// تاريخ القائمة يأتي من جلسة balnames التي يكتبها tgRenderBalances_ نفسه عند العرض — فيبقى
// زر تبديل الأصفار مرتبطًا بنفس تاريخ القائمة المعروضة لا بتاريخ اليوم دائمًا
function tgCbBalancesAll_(cb, chatId, msgId, from, action, arg, chatType) {
  var ctx = tgRequire_(from.id, 'statement');
  var sess = tgGetSession_(chatId, from.id);
  var iso = (sess && sess.data && sess.data.asOf) || tgTodayIso_();
  tgAnswerCb_(cb.id, '⏳ جارِ الحساب...');
  tgRenderBalances_(chatId, from, ctx, 'asof', iso, 'both', action === 'zeros', action !== 'zeros');
}
function tgCmdBalancesRangeDirect_(chatId, from, chatType, fromIso, toIso, fromRaw, toRaw) {
  var ctx = tgRequire_(from.id, 'statement');
  if (!fromIso) { tgSendTo_(chatId, tgBadDateMsg_(fromRaw)); return; }
  if (!toIso) { tgSendTo_(chatId, tgBadDateMsg_(toRaw)); return; }
  if (toIso < fromIso) { tgSendTo_(chatId, '⚠️ تاريخ النهاية قبل تاريخ البداية — أعد الأمر.'); return; }
  tgAnnounceIfGroup_(chatId, chatType, from, '📅 أرصدة الدخول من ' + tgDispDate_(fromIso) + ' إلى ' + tgDispDate_(toIso));
  tgSendTo_(chatId, '⏳ جارِ حساب أرصدة الفترة...');
  tgRenderBalancesRange_(chatId, from, ctx, fromIso, toIso);
}
// دخول اليوم/غدًا/بتاريخ — ملخص الدخول نفسه المُرسَل مجدولاً كل صباح
function tgCmdArrivalsDayDirect_(chatId, from, chatType, dayIso, dayRaw) {
  tgRequire_(from.id, 'query');
  if (!dayIso) { tgSendTo_(chatId, tgBadDateMsg_(dayRaw)); return; }
  tgAnnounceIfGroup_(chatId, chatType, from, '🌅 دخول ' + tgDispDate_(dayIso));
  var d = new Date(dayIso + 'T00:00:00'); d.setHours(0, 0, 0, 0);
  tgSendTo_(chatId, tgBuildDigest_('daily_arrivals', tgCollectArrivals_(d.getTime())));
}
// ارصدة دخول <تاريخ> — الرصيد التراكمي (لا رصيد ذلك اليوم وحده) لكل عميل ومورد له دخول في
// ذلك اليوم تحديدًا؛ يقبل أي تاريخ (وليس اليوم/غدًا فقط كما في أمر "ارصدة اليوم/غدا")
function tgCmdArrivalsDayBalancesDirect_(chatId, from, chatType, dayIso, dayRaw) {
  tgRequire_(from.id, 'statement');
  if (!dayIso) { tgSendTo_(chatId, tgBadDateMsg_(dayRaw)); return; }
  tgAnnounceIfGroup_(chatId, chatType, from, '💰 أرصدة دخول ' + tgDispDate_(dayIso));
  tgAskBalanceScope_(chatId, from, chatType, 'day', dayIso, 'أرصدة أصحاب الدخول يوم ' + tgDispDate_(dayIso));
}

function tgCmdStatement_(chatId, from, party, chatType) {
  var ctx = tgRequire_(from.id, 'statement');
  if (!party) { tgSendTo_(chatId, 'أرسل: <code>/statement اسم العميل</code>'); return; }
  // مطابقة تقريبية ذكية لاسم العميل (نفس آلية /رصيد) — لو أُرسل الاسم تقريبيًا نستنتج الصحيح
  var matches = tgMatchClientName_(party);
  if (!matches.length) { tgSendTo_(chatId, '❌ لم أجد حسابًا باسم قريب من "' + tgEsc_(party) + '".'); return; }
  var top = matches[0], second = matches[1];
  // تطابق حاسم (تام/بادئة) أو نتيجة قوية بفارق واضح ⇒ يُنفَّذ فورًا بلا سؤال
  if (top.score >= 90 || !second || (top.score - second.score) >= 25) {
    tgStatementProceed_(chatId, from, ctx, chatType, top.name);
    return;
  }
  // عدة أسماء متقاربة — نرشّح للمستخدم بدل التخمين (الاسم يُحفظ بالجلسة والزر يحمل الفهرس فقط)
  var names = matches.slice(0, 6).map(function (m) { return m.name; });
  tgSetSession_(chatId, from.id, 'stmtpick', 'ready', { names: names });
  var rows = names.map(function (n, i) { return [tgBtn_(n, 'sm:pick:' + i)]; });
  rows.push([tgBtn_('❌ إلغاء', 'cf:abort:1')]);
  tgSendTo_(chatId, '🤔 وجدت أكثر من اسم قريب من "' + tgEsc_(party) + '" — اختر المقصود:', tgKb_(rows));
}
// إصدار كشف الحساب بعد حسم الاسم الصحيح (مباشرة أو بعد اختيار المستخدم من المرشَّحين)
function tgStatementProceed_(chatId, from, ctx, chatType, party) {
  // كشف الحساب PDF عملية ثقيلة — نمنع إصدار نسختين لنفس العميل خلال 15 ثانية
  if (tgRecentAction_(from.id, 'stmt:' + party, 15)) { tgSendTo_(chatId, '⏳ كشف حساب <b>' + tgEsc_(party) + '</b> قيد التجهيز فعلاً — انتظر لحظات.'); return; }
  if (!statementAccountAllowed_(ctx.user, party)) {
    tgSendTo_(chatId, '⛔ لا تملك صلاحية الوصول إلى حساب "' + tgEsc_(party) + '".'); return;
  }
  tgAnnounceIfGroup_(chatId, chatType, from, '📊 كشف حساب — ' + party);
  var route = tgRouteChat_(ctx, chatId, chatType, 'كشف حساب — ' + party);
  tgAskDocFormat_(route.id, from, route.type, 'stmt', { client: party });
}
// اختيار اسم العميل من مرشَّحي كشف الحساب المتقاربين
function tgCbStatementPick_(cb, chatId, msgId, from, action, arg, chatType) {
  if (action !== 'pick') { tgAnswerCb_(cb.id, ''); return; }
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'stmtpick') { tgAnswerCb_(cb.id, 'انتهت المهلة', true); return; }
  var name = (sess.data.names || [])[parseInt(arg, 10)];
  tgClearSession_(chatId, from.id);
  tgAnswerCb_(cb.id, '');
  if (!name) return;
  var ctx = tgRequire_(from.id, 'statement');
  tgStatementProceed_(chatId, from, ctx, chatType, name);
}
// يُصدر كشف الحساب فعليًا بالصيغة المختارة — يُستدعى من معالج أزرار اختيار الصيغة
function tgIssueStatementDoc_(chatId, from, ctx, chatType, party, format) {
  tgSendTo_(chatId, '⏳ جارِ تجهيز كشف حساب <b>' + tgEsc_(party) + '</b>...');
  var st = getUnifiedStatement_(party, null, null);
  if (!st || !st.totals) { tgSendTo_(chatId, '❌ لا توجد حركات لهذا الطرف.'); return; }
  var name = 'كشف حساب - ' + party + ' - ' + Utilities.formatDate(new Date(), 'GMT+3', 'dd-MM-yyyy HH-mm');
  var target = tgDocTarget_(ctx, chatId, chatType);
  tgSendDocFormat_(target.id, format, buildStatementHtml_(st), name,
    '📊 <b>كشف حساب — ' + tgEsc_(party) + '</b>\n' +
    'الرصيد: <b>' + tgEsc_(st.totals.balance) + '</b>\nأصدره: ' + tgEsc_(staffDisplayName_(ctx.user)) + ' · عبر البوت');
  logChange_(ctx.user, 'كشف حساب', party, 'إصدار كشف حساب ' + (format === 'image' ? 'صورة' : 'PDF') + ' عبر بوت تليجرام', '', '',
    { clientName: party, recordKey: 'PARTY:' + party });
  if (target.isGroup && String(target.id) !== String(chatId)) tgSendTo_(chatId, '✅ أُرسل الكشف إلى الجروب.');
}


// ---- نموذج إصدار تأكيد الحجز (متعدد الخطوات) ----
// الخطوات: type ← attn ← guest ← option ← remarks ← review ← issue
function tgCmdConfirmStart_(chatId, from, ref, chatType) {
  var ctx = tgRequire_(from.id, 'confirm');
  if (!ref) { tgSendTo_(chatId, 'أرسل: <code>/confirm رقم الحجز</code>'); return; }
  var b = tgFindBooking_(ref);
  if (!b) { tgSendTo_(chatId, '❌ لم أجد حجزًا بالرقم <code>' + tgEsc_(ref) + '</code>'); return; }
  if (!bookingCityAllowed_(ctx.user, b.city)) { tgSendTo_(chatId, '⛔ هذا الحجز خارج نطاق مدينتك المسموحة.'); return; }
  if (!b.rooms.length) { tgSendTo_(chatId, '⚠️ هذا الحجز بلا غرف مسجَّلة — أكمل بياناته في البرنامج أولاً.'); return; }
  var route = tgRouteChat_(ctx, chatId, chatType, 'تأكيد حجز — ' + b.innerRef);
  var rc = route.id;
  tgSetSession_(rc, from.id, 'confirm', 'type', { ref: b.innerRef, booking: b });
  tgSendTo_(rc, tgBookingCard_(b) + '\n\n<b>نوع التأكيد؟</b>',
    tgKb_([[tgBtn_('✅ Definite', 'cf:type:definite'), tgBtn_('⏳ Tentative', 'cf:type:tentative')],
           [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
function tgConfirmAsk_(chatId, sess) {
  var d = sess.data, b = d.booking;
  if (sess.step === 'attn') {
    tgSendTo_(chatId, '✍️ <b>Attn</b> — اسم المسؤول لدى العميل؟\nاكتبه، أو تخطَّ.',
      tgKb_([[tgBtn_('⏭ تخطي', 'cf:skip:attn')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else if (sess.step === 'guest') {
    tgSendTo_(chatId, '👤 <b>Guest Name</b> — اسم الضيف الرئيسي؟',
      tgKb_([[tgBtn_('⏭ تخطي', 'cf:skip:guest')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else if (sess.step === 'option') {
    var rows = [];
    if (b.optionDate) rows.push([tgBtn_('📅 من الشيت: ' + b.optionDate, 'cf:optsheet:1')]);
    rows.push([tgBtn_('⏭ بلا', 'cf:skip:option')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]);
    tgSendTo_(chatId, '⏰ <b>Option Date</b>؟ اكتبه بصيغة DD/MM/YYYY أو اختر:', tgKb_(rows));
  } else if (sess.step === 'remarks') {
    var rr = [];
    if (b.notes) rr.push([tgBtn_('📝 ملاحظات الحجز', 'cf:remnotes:1')]);
    rr.push([tgBtn_('⏭ بلا', 'cf:skip:remarks')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]);
    tgSendTo_(chatId, '📝 <b>Remarks</b>؟', tgKb_(rr));
  } else if (sess.step === 'manager') {
    var suggested = d.manager || tgConfirmManager_(b);
    tgSendTo_(chatId, '👔 <b>مسؤول الحجز</b> الذي سيظهر في المستند:\n<b>' + tgEsc_(suggested) + '</b>\n\nأكِّده أو اكتب اسمًا آخر ليحل محله.',
      tgKb_([[tgBtn_('✅ تأكيد هذا الاسم', 'cf:mgrok:1')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else if (sess.step === 'review') {
    tgSendTo_(chatId, tgConfirmReview_(d),
      tgKb_([[tgBtn_('📤 إصدار PDF', 'cf:issue:pdf'), tgBtn_('🖼 إصدار صورة', 'cf:issue:image')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  }
}
function tgConfirmReview_(d) {
  var b = d.booking;
  var total = tgConfirmTotal_(b);
  return '📋 <b>المراجعة الأخيرة</b>\n\n' +
    '📑 ' + (d.confirmType === 'tentative' ? 'Tentative' : 'Definite') + ' Confirmation\n' +
    '🔖 ' + tgEsc_(b.innerRef) + ' · 👤 ' + tgEsc_(b.client) + '\n' +
    '🏨 ' + tgEsc_(b.hotel) + ' · ' + tgCityIcon_(b.city) + ' ' + tgEsc_(b.city) + '\n' +
    '📅 ' + tgEsc_(b.checkIn) + ' ← ' + tgEsc_(b.checkOut) + '\n' +
    '🛏 ' + b.rooms.map(function (r) { return r.qty + ' ' + tgRoomLbl_(r.type) + ' × ' + r.rate; }).join(' · ') + '\n' +
    '💵 Total Net: <b>SAR ' + total + '</b>\n' +
    'Attn: ' + tgEsc_(d.attn || '—') + '\n' +
    'Guest: ' + tgEsc_(d.guestName || '—') + '\n' +
    'Option: ' + tgEsc_(d.optionDate || '—') + '\n' +
    'Remarks: ' + tgEsc_(d.remarks || '—') + '\n' +
    '👔 مسؤول الحجز: ' + tgEsc_(d.manager || tgConfirmManager_(b));
}
// الإجمالي = مجموع (عدد الغرف × السعر × الليالي) — نفس معادلة البرنامج
// مسؤول الحجز المقترح للمستند: مسؤول بيع العميل المسجَّل ← مسؤول بيع الحجز نفسه ← الاسم
// الافتراضي الثابت "Eman Mohamed". يُعرَض دائمًا للتأكيد أو التعديل — لا يُكتب تلقائيًا بلا
// قرار من المستخدم (طلب صريح: "والقرار للمستخدم").
var TG_CONFIRM_MANAGER_DEFAULT_ = 'Eman Mohamed';
function tgConfirmManager_(b) {
  var agent = '';
  try { agent = resolveSalesAgent_(b.client) || ''; } catch (e) {}
  if (!agent) agent = (b.salesAgent || '').toString().trim();
  return agent || TG_CONFIRM_MANAGER_DEFAULT_;
}
function tgConfirmTotal_(b) {
  var t = 0;
  b.rooms.forEach(function (r) { t += (r.qty || 0) * (r.rate || 0) * (b.nights || 0); });
  return Math.round(t).toLocaleString('en-US');
}
function tgConfirmStep_(chatId, from, sess, text) {
  var d = sess.data;
  if (sess.step === 'attn') { d.attn = text; sess.step = 'guest'; }
  else if (sess.step === 'guest') { d.guestName = text; sess.step = 'option'; }
  else if (sess.step === 'option') {
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
      tgSendTo_(chatId, '⚠️ الصيغة يجب أن تكون DD/MM/YYYY — أعد الإدخال أو اختر من الأزرار.');
      return;
    }
    d.optionDate = text; sess.step = 'remarks';
  } else if (sess.step === 'remarks') { d.remarks = text; sess.step = 'manager'; }
  else if (sess.step === 'manager') { d.manager = text; sess.step = 'review'; }
  else return;
  tgSetSession_(chatId, from.id, 'confirm', sess.step, d);
  tgConfirmAsk_(chatId, { step: sess.step, data: d });
}
function tgConfirmIssue_(chatId, from, ctx, chatType, format) {
  format = format === 'image' ? 'image' : 'pdf';
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'confirm') throw new Error('انتهت مهلة النموذج — ابدأ من جديد بـ /confirm');
  var d = sess.data, b = d.booking;
  var stamp = Utilities.formatDate(new Date(), 'GMT+3', 'dd/MM/yyyy');
  var fileStamp = Utilities.formatDate(new Date(), 'GMT+3', 'dd-MM-yyyy HH-mm');
  var typeLabel = d.confirmType === 'tentative' ? 'Tentative Confirmation' : 'Definite Confirmation';
  var html = buildConfirmationHtml_({
    confirmType: d.confirmType, dateStamp: stamp, to: b.client, attn: d.attn || '',
    resNo: b.innerRef, hotel: b.hotel, arrival: b.checkIn, departure: b.checkOut,
    guestName: d.guestName || '', rooms: b.rooms, totalNet: tgConfirmTotal_(b),
    optionDate: d.optionDate || '', remarks: d.remarks || '', meal: '',
    // مسؤول الحجز = الاسم الذي أكّده أو عدّله المستخدم في خطوة "مسؤول الحجز" أعلاه
    manager: d.manager || tgConfirmManager_(b)
  });
  var target = tgDocTarget_(ctx, chatId, chatType);
  tgSendDocFormat_(target.id, format, html, typeLabel + ' - ' + b.innerRef + ' - ' + fileStamp,
    '📄 <b>' + typeLabel + '</b>\n👤 ' + tgEsc_(b.client) + ' · 🔖 ' + tgEsc_(b.innerRef) +
    '\n🏨 ' + tgEsc_(b.hotel) + ' · 📅 ' + tgEsc_(b.checkIn) + ' ← ' + tgEsc_(b.checkOut) +
    '\nأصدره: ' + tgEsc_(staffDisplayName_(ctx.user)) + ' · عبر البوت');
  logChange_(ctx.user, 'إصدار تأكيد حجز', b.innerRef,
    '[' + (d.confirmType === 'tentative' ? 'Tentative' : 'Definite') + '] إصدار مستند تأكيد حجز (' + (format === 'image' ? 'صورة' : 'PDF') + ') عبر بوت تليجرام',
    '', '', { hotelRef: b.innerRef, clientName: b.client, recordKey: bookingRecordKey_(b.innerRef) });
  tgClearSession_(chatId, from.id);
  if (target.isGroup && String(target.id) !== String(chatId)) tgSendTo_(chatId, '✅ أُرسل المستند إلى الجروب.');
}


// ---- معالج ضغطات الأزرار ----
// callback_data محدود بـ64 بايت — لذلك نمرّر معرّف الطلب فقط (8 خانات) لا بياناته
function tgHandleCallback_(cb) {
  var chatId = cb.message.chat.id, msgId = cb.message.message_id, from = cb.from || {};
  var chatType = (cb.message.chat && cb.message.chat.type) || 'private';
  var data = (cb.data || '').toString();
  // أهم سطر لإحساس السرعة: أغلق "الساعة الرملية" على الزر فورًا وبمعزل تام قبل أي منطق —
  // فيرى المستخدم استجابة لحظية حتى لو استغرقت المعالجة ثانية (توصية مرجع السرعة المرفق)
  // النقر المزدوج على نفس الزر خلال 6 ثوانٍ = تكرار — نتحقق قبل نداء answerCallbackQuery
  // الوحيد المسموح به لكل ضغطة حتى يحمل رد التكرار نصًّا مرئيًا (توست) بدل صمت تام يظنّه
  // المستخدم عطلًا فيضغط الزر مرارًا
  var isDup = tgRecentAction_(from.id, 'cb:' + data, 6);
  try {
    tgApi_('answerCallbackQuery', isDup
      ? { callback_query_id: cb.id, text: '⏳ نُفِّذ للتو — لا داعي لتكرار الضغط.', show_alert: 'false' }
      : { callback_query_id: cb.id });
  } catch (ackErr) { /* لا يوقف تنفيذ الزر */ }
  if (isDup) return;
  try {
    var parts = data.split(':');
    if (parts[0] === 'rq') { tgCbRequest_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':')); return; }
    if (parts[0] === 'cf') { tgCbConfirm_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'mn') { tgCbMenu_(cb, chatId, msgId, from, parts[1], chatType); return; }
    if (parts[0] === 'bl') { tgCbBalance_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'df') { tgCbDocFormat_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'nb') { tgCbNewBooking_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'ob') { tgCbOcr_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'sm') { tgCbStatementPick_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'pr') { tgCbPrices_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'ar') { tgCbArrivalsWiz_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'bs') { tgCbBalanceScope_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'ba2') { tgCbBalancesAll_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'bn') { tgCbBalanceName_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'ba') { tgCbBalancesAsOf_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return; }
    if (parts[0] === 'pn') { tgCbPartyReg_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':')); return; }
    if (parts[0] === 'eb') {
      if (parts[1] === 'again') {
        var sAg = tgGetSession_(chatId, from.id);
        tgAnswerCb_(cb.id, '');
        if (sAg && sAg.data && sAg.data.ref) tgEditBookingShow_(chatId, from, sAg.data.ref);
        return;
      }
      tgCbEditBooking_(cb, chatId, msgId, from, parts[1], parts.slice(2).join(':'), chatType); return;
    }
    tgAnswerCb_(cb.id, '');
  } catch (err) {
    tgAnswerCb_(cb.id, '⛔ ' + err.message, true);
  }
}

// أزرار الرد على طلب عميل — الفعل نفسه الذي تنفّذه الشاشة، بنفس الدالة تمامًا
function tgCbRequest_(cb, chatId, msgId, from, action, reqId) {
  var ctx = tgRequire_(from.id, 'respond');
  var r = getPortalReqById_(reqId);
  if (!r) { tgAnswerCb_(cb.id, 'الطلب لم يعد موجودًا', true); return; }
  // حارس التزامن: طلب رُدَّ عليه من الشاشة أو من زميل آخر لا يُرَد عليه مرتين
  if (r.status !== PORTAL_REQ_PENDING_) {
    tgAnswerCb_(cb.id, 'رُدَّ على هذا الطلب بالفعل: ' + r.status, true);
    try { tgEditText_(chatId, msgId, cb.message.text + '\n\n✅ <b>' + tgEsc_(r.status) + '</b> — ' + tgEsc_(r.respondedBy || '')); } catch (e) {}
    return;
  }
  var map = { ok: 'approve', hold: 'hold', no: 'reject', reg: 'register', done: 'done' };
  if (!map[action]) { tgAnswerCb_(cb.id, ''); return; }
  var res = respondPortalRequestAs_(ctx.user, reqId, map[action], null, null);
  if (!res.ok) { tgAnswerCb_(cb.id, '⛔ ' + res.error, true); return; }
  var after = getPortalReqById_(reqId);
  var stamp = Utilities.formatDate(new Date(), 'GMT+3', 'dd/MM/yyyy HH:mm');
  // الرسالة نفسها تُحدَّث فيرى الجروب من ردّ ومتى، وتختفي الأزرار فلا يُضغط عليها ثانيةً
  tgEditText_(chatId, msgId,
    (cb.message.text || '') + '\n\n' + tgReqResultIcon_(after.status) + ' <b>' + tgEsc_(after.status) + '</b>' +
    (after.resultRef ? (' — رقم داخلي ' + tgEsc_(after.resultRef)) : '') +
    '\n👥 ' + tgEsc_(staffDisplayName_(ctx.user)) + ' · ⏰ ' + stamp);
  tgAnswerCb_(cb.id, '✅ ' + after.status);
}
function tgReqResultIcon_(status) {
  if (status === PORTAL_REQ_APPROVED_) return '✅';
  if (status === PORTAL_REQ_CANCELLED_) return '🗑';
  if (status === PORTAL_REQ_REJECTED_) return '❌';
  if (status === PORTAL_REQ_REGISTERED_) return '🕓';
  if (status === PORTAL_REQ_DONE_) return '☑️';
  return '⏳';
}

function tgCbConfirm_(cb, chatId, msgId, from, action, arg, chatType) {
  var ctx = tgRequire_(from.id, 'confirm');
  if (action === 'abort') { tgClearSession_(chatId, from.id); tgAnswerCb_(cb.id, 'أُلغي'); tgEditText_(chatId, msgId, (cb.message.text || '') + '\n\n❌ <b>أُلغي الإجراء</b>'); return; }
  if (action === 'start') { tgAnswerCb_(cb.id, ''); tgCmdConfirmStart_(chatId, from, arg, chatType); return; }
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'confirm') { tgAnswerCb_(cb.id, 'انتهت مهلة النموذج — ابدأ بـ /confirm', true); return; }
  var d = sess.data, next = sess.step;
  if (action === 'type') { d.confirmType = (arg === 'tentative') ? 'tentative' : 'definite'; next = 'attn'; }
  else if (action === 'skip') {
    if (arg === 'attn') next = 'guest';
    else if (arg === 'guest') next = 'option';
    else if (arg === 'option') next = 'remarks';
    else if (arg === 'remarks') next = 'manager';
  }
  else if (action === 'optsheet') { d.optionDate = d.booking.optionDate || ''; next = 'remarks'; }
  else if (action === 'remnotes') { d.remarks = d.booking.notes || ''; next = 'manager'; }
  else if (action === 'mgrok') { d.manager = d.manager || tgConfirmManager_(d.booking); next = 'review'; }
  else if (action === 'issue') {
    tgAnswerCb_(cb.id, '⏳ جارِ التجهيز...');
    tgEditText_(chatId, msgId, (cb.message.text || '') + '\n\n⏳ <b>جارِ إصدار المستند...</b>');
    tgConfirmIssue_(chatId, from, ctx, chatType, arg === 'image' ? 'image' : 'pdf');
    return;
  }
  else { tgAnswerCb_(cb.id, ''); return; }
  tgSetSession_(chatId, from.id, 'confirm', next, d);
  tgAnswerCb_(cb.id, '');
  tgConfirmAsk_(chatId, { step: next, data: d });
}

// ---- إدارة الويب هوك من شاشة الإعدادات ----
// عنوان الويب هوك. الفخّ هنا حقيقي وكلّفنا يومًا كاملاً من الأوامر الصامتة:
// ScriptApp.getService().getUrl() قد يُعيد رابط الاختبار /dev، وهو رابط يتطلّب تسجيل دخول
// بحساب جوجل، فيردّ جوجل على تليجرام بتحويل 302 إلى صفحة الدخول. تليجرام يعتبر ذلك فشلًا،
// ويُعيد المحاولة على نفس التحديث ولا يُسلّم ما بعده إطلاقًا — فتتجمّد كل الأوامر التالية
// (هذا بالضبط معنى "pending: 4 · Wrong response from the webhook: 302 Found").
// لذلك: نُجبر /exec دائمًا، ونتيح للمدير لصق رابط النشر يدويًا، ونختبر الرابط قبل التسجيل.
function tgHookSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty(TG_PROP_HOOK_);
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    props.setProperty(TG_PROP_HOOK_, secret);
  }
  return secret;
}
function tgExecBase_(base) {
  var u = String(base || '').trim();
  if (!u) {
    try { u = ScriptApp.getService().getUrl() || ''; } catch (e) { u = ''; }
  }
  u = u.split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (/\/dev$/.test(u)) u = u.replace(/\/dev$/, '/exec');   // رابط الاختبار لا يصلح لتليجرام
  else if (!/\/exec$/.test(u) && /\/macros\/s\//.test(u)) u += '/exec';
  return u;
}
function tgWebhookUrl_(base) {
  var stored = PropertiesService.getScriptProperties().getProperty(TG_PROP_HOOKURL_) || '';
  return tgExecBase_(base || stored) + '?tghook=' + tgHookSecret_();
}
// الحقيقة الكاملة بعد تشخيصين متتاليين (الأول ظنّ 302 مقبولًا، والثاني ظنّه بنيويًا لا مفر
// منه — وكلاهما خطأ):
//   • تليجرام لا يتّبع أي تحويل إطلاقًا عند تسليم الويب هوك. يرى 302 الخام فيعتبره فشلًا
//     ويعيد المحاولة بلا توقف ("Wrong response from the webhook: 302 Found").
//   • لكن 302 ليس حتميًا في Apps Script: هو يظهر *فقط* حين تُرجع doPost محتوى
//     (ContentService/HtmlService)، لأن التحويل موجود أصلًا لتسليم جسم الرد. حين لا تُرجع
//     doPost شيئًا، يردّ Apps Script بـ 200 مباشرة بلا تحويل — وهذا ما يفعله بوت يعمل بلا
//     عطل في مشروع Apps Script آخر (كل مسارات doPost فيه "return;" مجردة).
// لذلك 302 هنا = دليل على أن النشر المُفعَّل ما زال يشغّل نسخة قديمة من doPost تُرجع محتوى،
// والحل نشر إصدار جديد — لا وسيط خارجي ولا تغيير صلاحيات
function tgSelfTestWebhook_(url) {
  var out = { url: url, code: 0, location: '', verdict: '', ok: false, body: '' };
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', payload: '{}',
      followRedirects: false, muteHttpExceptions: true
    });
    out.code = res.getResponseCode();
    var h = res.getAllHeaders() || {};
    out.location = h.Location || h.location || '';
    if (out.code === 200) { out.ok = true; out.verdict = 'الرابط يردّ 200 مباشرة في القفزة الأولى — سليم لتليجرام فعليًا.'; return out; }
    if (out.code === 301 || out.code === 302 || out.code === 307 || out.code === 308) {
      if (/accounts\.google\.com/.test(out.location)) {
        out.verdict = 'الرابط يطلب تسجيل دخول جوجل (تحويل إلى صفحة الدخول) — عطل إضافي في إعدادات النشر.\n' +
          'أعد النشر بـ «تنفيذ باسم: أنا» و«من له حق الوصول: أي شخص» — لكن هذا وحده لن يكفي (انظر التالي).';
        return out;
      }
      // نتحقق مما بعد التحويل للتشخيص فقط (هل النشر نفسه سليم؟) — لا لأن هذا يجعله صالحًا
      // كويب هوك مباشر، فتليجرام لن يصل إلى هذه النقطة إطلاقًا
      try {
        var r2 = UrlFetchApp.fetch(url, {
          method: 'post', contentType: 'application/json', payload: '{}',
          followRedirects: true, muteHttpExceptions: true
        });
        var c2 = r2.getResponseCode();
        try { out.body = (r2.getContentText() || '').slice(0, 120); } catch (eB) {}
        if (/accounts\.google\.com|ServiceLogin/i.test(out.body)) {
          out.verdict = 'التحويل ينتهي عند صفحة تسجيل دخول جوجل — النشر ليس بصلاحية «أي شخص» (عطل إضافي فوق مشكلة التحويل الأساسية).';
          return out;
        }
        out.ok = false;   // القفزة الأولى 302 = فشل مضمون مع تليجرام، بصرف النظر عمّا بعدها
        out.verdict = '⛔ الرابط يردّ 302 في القفزة الأولى — تليجرام سيرفض كل تسليم ويُعيد المحاولة بلا توقف.\n' +
          'السبب المؤكَّد: النشر المُفعَّل ما زال يشغّل نسخة قديمة من الكود تُرجع فيها doPost محتوى (ContentService). ' +
          'النسخة الحالية لا تُرجع شيئًا من doPost إطلاقًا، وهو ما يجعل الرد 200 مباشرة بلا تحويل.\n' +
          'الحل: انشر إصدارًا جديدًا (نشر ← تعديل النشر ← إصدار جديد) ثم أعد تفعيل الوضع اللحظي.';
      } catch (e2) { out.verdict = 'تعذّر اتّباع التحويل للتشخيص: ' + e2.message; }
      return out;
    }
    out.verdict = 'الرابط يردّ بالرمز ' + out.code + ' — غير متوقَّع.';
  } catch (e) { out.verdict = 'تعذّر اختبار الرابط: ' + e.message; }
  return out;
}
// الحقيقة القاطعة عن حالة الويب هوك تأتي من تليجرام نفسه لا من اختبارنا الذاتي:
// آخر خطأ سجّله عند محاولة التسليم، وعدد التحديثات العالقة
function tgWebhookHealth_() {
  var out = { ok: false, url: '', pending: 0, lastError: '', lastErrorAt: '', verdict: '' };
  try {
    var info = tgApi_('getWebhookInfo', {});
    out.url = info.url || '';
    out.pending = info.pending_update_count || 0;
    out.lastError = info.last_error_message || '';
    if (info.last_error_date) {
      out.lastErrorAt = Utilities.formatDate(new Date(info.last_error_date * 1000), 'GMT+3', 'dd/MM/yyyy HH:mm');
    }
    if (!out.url) { out.verdict = 'لا يوجد ويب هوك مسجَّل حاليًا.'; return out; }
    if (out.lastError) {
      out.verdict = '⚠️ آخر محاولة تسليم من تليجرام فشلت (' + out.lastErrorAt + '): ' + out.lastError;
      return out;
    }
    out.ok = true;
    out.verdict = '✅ تليجرام لم يسجّل أي خطأ تسليم' + (out.pending ? (' — لكن هناك ' + out.pending + ' تحديثًا معلّقًا.') : '.');
  } catch (e) { out.verdict = 'تعذّر قراءة حالة الويب هوك: ' + e.message; }
  return out;
}
// إصلاح ذاتي صامت لتسجيل الويب هوك — يعمل داخل مهمة الدقيقة الدورية بلا أي تدخل من المدير.
// حالة رأيناها فعليًا: مستخدم يبدّل بين الوضعين، أو نشر جديد يغيّر رابط /exec، أو تليجرام يُسقط
// التسجيل بصمت — وفي كل هذه الحالات كان العطل يبقى خفيًّا حتى يفتح أحدهم شاشة الإعدادات ويعيد
// التسجيل يدويًا. الآن أسوأ تأخير ممكن قبل عودة الاستجابة اللحظية هو دورة واحدة (دقيقة)
function tgWebhookSelfHeal_() {
  if (tgBotMode_() !== 'webhook') return;   // وضع السحب لا يعنيه هذا الفحص إطلاقًا
  try {
    var health = tgWebhookHealth_();
    var expected = tgWebhookUrl_();
    if (!expected) return;
    // نُعيد التسجيل عند: رابط قديم/غير مطابق (بعد نشر جديد)، أو غير مسجَّل، أو خطأ تسليم
    // مسجَّل لدى تليجرام. الخطأ الوحيد الذي لا تُصلحه إعادة التسجيل هو 302 الناتج عن نشر
    // قديم تُرجع فيه doPost محتوى — وذلك يحتاج نشر إصدار جديد بيد المدير، ويظهر صريحًا في
    // شاشة الإعدادات، فنكتفي بمحاولة واحدة كل عشر دقائق حتى لا نُهدر نداءً كل دقيقة بلا فائدة
    var mismatch = !!(health.url && health.url !== expected);
    var missing = !health.url;
    var failing = !!health.lastError;
    if (!mismatch && !missing && !failing) return;
    if (failing && !mismatch && !missing) {
      try {
        var c = CacheService.getScriptCache();
        if (c.get('tghook_heal_wait')) return;
        c.put('tghook_heal_wait', '1', 600);
      } catch (eC) {}
    }
    tgApi_('setWebhook', {
      url: expected,
      allowed_updates: JSON.stringify(['message', 'callback_query', 'my_chat_member']),
      drop_pending_updates: 'false', max_connections: '5'
    });
    Logger.log('tgWebhookSelfHeal_: أعاد تسجيل الويب هوك تلقائيًا — ' +
      (mismatch ? 'رابط غير مطابق' : (missing ? 'لم يكن مسجَّلاً' : ('خطأ تسليم: ' + health.lastError))));
  } catch (e) { Logger.log('tgWebhookSelfHeal_: ' + e.message); }
}
function registerTelegramWebhook(token, baseUrl) {
  try {
    var admin = requireAdmin_(token);
    if (!tgToken_()) throw new Error('احفظ توكن البوت أولاً');
    var props = PropertiesService.getScriptProperties();
    if (baseUrl && String(baseUrl).trim()) props.setProperty(TG_PROP_HOOKURL_, tgExecBase_(baseUrl));
    var url = tgWebhookUrl_();
    if (!/^https:\/\//.test(url)) throw new Error('تعذّر تحديد رابط النشر — الصق رابط /exec يدويًا في الحقل.');
    var testRes = tgSelfTestWebhook_(url);
    // max_connections=5: كان 1 (تسليم متسلسل تمامًا) لأن منع التكرار وقتها كان ضعيفًا، فكان
    // أي أمر بطيء يحبس الأوامر التالية خلفه في طابور. الآن منع التكرار عبر CacheService لكل
    // update_id (سريع وموثوق) فصار التوازي المحدود آمنًا ويجعل أوامر عدة مستخدمين في الجروب
    // تُنفَّذ معًا بدل الانتظار بالدور. drop_pending_updates: يمسح أي طابور عالق من وضع السحب
    tgApi_('setWebhook', {
      url: url,
      allowed_updates: JSON.stringify(['message', 'callback_query', 'my_chat_member']),
      drop_pending_updates: 'true', max_connections: '5'
    });
    props.setProperty(TG_PROP_MODE_, 'webhook');
    props.deleteProperty(TG_PROP_POLL_OFFSET_); // إزالة أثر وضع السحب حتى لا يختلط الوضعان
    var info = tgApi_('getWebhookInfo', {});
    var health = tgWebhookHealth_();   // رأي تليجرام نفسه — أدق من أي اختبار ذاتي
    logChange_(admin, 'الإعدادات', 'تليجرام', 'تسجيل ويب هوك بوت تليجرام (تفعيل الأوامر التفاعلية)', '', url);
    return safeReturn_({
      ok: true, url: url, pending: info.pending_update_count || 0,
      isDev: /\/dev(\?|$)/.test(url), test: testRes, health: health
    });
  } catch (e) { return { ok: false, error: e.message }; }
}
function unregisterTelegramWebhook(token) {
  try {
    var admin = requireAdmin_(token);
    tgApi_('deleteWebhook', { drop_pending_updates: 'true' });
    PropertiesService.getScriptProperties().deleteProperty(TG_PROP_MODE_);
    logChange_(admin, 'الإعدادات', 'تليجرام', 'إيقاف الأوامر التفاعلية (حذف الويب هوك)', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// ---- وضع السحب (Polling) — الوضع الموثوق: يحذف الويب هوك ويعتمد على مشغّل السحب ----
function enableTelegramPolling(token) {
  try {
    var admin = requireAdmin_(token);
    if (!tgToken_()) throw new Error('احفظ توكن البوت أولاً');
    var props = PropertiesService.getScriptProperties();
    // حذف الويب هوك شرط أساسي: getUpdates يفشل بخطأ 409 ما دام الويب هوك مسجّلاً
    tgApi_('deleteWebhook', { drop_pending_updates: 'false' });
    props.setProperty(TG_PROP_MODE_, 'polling');
    ensureTelegramTrigger_();   // يضمن وجود مشغّل الدقيقة الذي يسحب ويعالج
    // سحب فوري أول ليصل أي أمر/ربط معلّق فورًا بلا انتظار المشغّل
    var res = tgPollUpdates_();
    logChange_(admin, 'الإعدادات', 'تليجرام', 'تفعيل وضع السحب الموثوق (Polling) — حذف الويب هوك', '', 'polling');
    return safeReturn_({ ok: true, processed: (res && res.processed) || 0 });
  } catch (e) { return { ok: false, error: e.message }; }
}
// زر "استقبل التحديثات الآن" — سحب فوري يدوي (مفيد لحظة الربط: يلتقط /start أو /link فورًا)
function pollTelegramNow(token) {
  try {
    requireAdmin_(token);
    if (tgBotMode_() !== 'polling') return { ok: false, error: 'فعّل وضع السحب الموثوق أولاً' };
    var res = tgPollUpdates_();
    if (!res.ok) return { ok: false, error: res.error || 'تعذّر السحب' };
    return { ok: true, processed: res.processed || 0 };
  } catch (e) { return { ok: false, error: e.message }; }
}
function getTelegramBotStatus(token) {
  try {
    requireAdmin_(token);
    var out = { ok: true, hasToken: !!tgToken_(), users: [], perms: TG_PERMS_, botUsername: '', mode: tgBotMode_() };
    if (out.hasToken) {
      out.botUsername = tgBotUsername_();
      try {
        var info = tgApi_('getWebhookInfo', {});
        out.webhookUrl = info.url || '';
        out.webhookActive = !!info.url;
        out.pending = info.pending_update_count || 0;
        out.lastError = info.last_error_message || '';
      } catch (e) { out.webhookError = e.message; }
    }
    out.users = tgUsers_().map(function (u) {
      var au = null;
      try { au = getUserByUsername_(u.username); } catch (e) {}
      return {
        tgId: u.tgId, tgName: u.tgName, username: u.username,
        displayName: (au && au.displayName) || u.username,
        appActive: !!(au && au.active !== false),
        active: u.active, perms: u.perms,
        lastSeen: u.lastSeen ? new Date(u.lastSeen).getTime() : 0
      };
    });
    return safeReturn_(out);
  } catch (e) { return { ok: false, error: e.message }; }
}
function saveTelegramBotUser(token, tgId, active, perms) {
  try {
    var admin = requireAdmin_(token);
    var u = tgUserByTgId_(tgId);
    if (!u) throw new Error('مستخدم بوت غير موجود');
    var before = JSON.stringify(u.perms) + '|' + (u.active ? 'نشط' : 'موقوف');
    u.active = !!active;
    var np = tgDefaultPerms_();
    TG_PERMS_.forEach(function (p) { np[p.key] = !!(perms && perms[p.key]); });
    u.perms = np;
    tgWriteUserRow_(u.rowIdx, u);
    logChange_(admin, 'الإعدادات', u.username, 'تعديل صلاحيات بوت تليجرام لـ' + u.username,
      before, JSON.stringify(np) + '|' + (u.active ? 'نشط' : 'موقوف'));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
function deleteTelegramBotUser(token, tgId) {
  try {
    var admin = requireAdmin_(token);
    var u = tgUserByTgId_(tgId);
    if (!u) return { ok: true };
    ensureTgUsersSheet_().deleteRow(u.rowIdx);
    invalidateTgUsersCache_();
    logChange_(admin, 'الإعدادات', u.username, 'فكّ ربط حساب تليجرام عن ' + u.username, u.tgId, '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ==========================================================
// من طلب هذا؟ — إعلان صاحب الطلب في الجروب لكل أوامر البوت (لا القائمة بالأزرار فقط)
// ==========================================================
function tgAnnounceIfGroup_(chatId, chatType, from, label) {
  if (!chatType || chatType === 'private') return;
  try { tgSendTo_(chatId, '👤 <b>' + tgEsc_(tgWho_(from)) + '</b> طلب: ' + label); } catch (e) {}
}

// ==========================================================
// تنبيه تفاصيل تعديل حجز (قبل/بعد) — يُرسَل بعد كل تعديل ناجح من شاشة الحجوزات
// ==========================================================
// تنبيه تعديل حجز — يُبنى كرسالة مستقلة كاملة (لا عبر قالب التنبيهات العام) حتى يعرض هوية
// الحجز كاملة + جدول التغييرات "قديم ← جديد" + من عدّل ومتى. المصدر (البرنامج أو تعديل يدوي
// مباشر على جوجل شيت) يظهر صراحةً، لأن تعديل الشيت مباشرةً لا يمر بالبرنامج ولا يُسجَّل باسم
// مستخدم — وكان يمر بلا أي أثر يراه الفريق
// الأعمدة التي يتغيّر بتغيّرها رصيدُ العميل أو المورد فعليًا: الطرفان نفساهما، والتواريخ
// والليالي وعدد الغرف والأسعار والإجماليات، وحالة الحجز (التحويل إلى/من "لاغي" يُدخِل الحجز
// في الترصيد أو يُخرجه منه). بقية الأعمدة (رقم حجز الفندق، الملاحظات، مسئول البيع…) تعديلها
// لا يمسّ أي رصيد فلا داعي لإقحام حساب كشف الحساب الثقيل ولا لتخويف القارئ بلا سبب
var BOOKING_BALANCE_COLS_0BASED_ = [3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 33];
function bookingBalanceLabels_() {
  var out = {};
  BOOKING_BALANCE_COLS_0BASED_.forEach(function (i) {
    var lbl = BOOKING_COL_LABELS[i];
    if (lbl) out[lbl] = true;
  });
  return out;
}
function bookingEditAffectsBalance_(diffs) {
  var labels = bookingBalanceLabels_();
  return (diffs || []).some(function (d) { return !!labels[d.label]; });
}
function tgBookingEditMsg_(row, city, diffs, actor, source) {
  var fmtD = function (v) {
    // فحص بالسلوك لا بـ instanceof: قيمة التاريخ قد تصل من سياق آخر (أو من قراءة شيت) فيفشل
    // instanceof رغم أنها تاريخ فعلي — والنتيجة كانت طباعة نص التاريخ الخام المشوّه
    if (v && typeof v.getTime === 'function' && typeof v.getMonth === 'function') {
      return Utilities.formatDate(v, 'GMT+3', 'dd/MM/yyyy');
    }
    return (v === '' || v === null || v === undefined) ? '—' : String(v);
  };
  // حجز سبق ترحيله محاسبيًا (له رقم قيد) — تعديله لاحقًا يجعل القيد المُرحَّل مخالفًا لبيانات
  // الحجز الفعلية، وهو خطأ محاسبي صامت ما لم يُراجَع القيد يدويًا. لذلك يأخذ التنبيه هنا
  // ترويسة تحذيرية مختلفة كليًا عن تنبيه التعديل العادي حتى يُلتقط بالعين من أول نظرة
  var qaid = (row[0] === null || row[0] === undefined) ? '' : String(row[0]).trim();
  var affectsBalance = bookingEditAffectsBalance_(diffs);
  var lines = qaid ? [
    '🚨🧾 <b>تعديل حجز مُرحَّل بقيد محاسبي</b>',
    '⚠️ <b>هذا الحجز له رقم قيد مسجَّل — راجع القيد بعد هذا التعديل</b>',
    '🧾 <b>رقم القيد:</b> <code>' + tgEsc_(qaid) + '</code>',
    '━━━━━━━━━━━━━━',
    '🔖 <b>الحجز الداخلي:</b> <code>' + tgEsc_(row[2] || '—') + '</code>'
  ] : [
    '✏️ <b>تعديل بيانات حجز</b>',
    '━━━━━━━━━━━━━━',
    '🔖 <b>الحجز الداخلي:</b> <code>' + tgEsc_(row[2] || '—') + '</code>'
  ];
  lines = lines.concat([
    '🏨 <b>رقم حجز الفندق:</b> ' + tgEsc_(row[17] || '—'),
    '🏨 <b>الفندق:</b> ' + tgEsc_(row[4] || 'بلا فندق') + ' · ' + tgCityIcon_(city) + ' ' + tgEsc_(city),
    '👤 <b>العميل:</b> ' + tgEsc_(row[3] || '—'),
    '🤝 <b>المورد:</b> ' + tgEsc_(row[14] || '—'),
    '📅 <b>الدخول:</b> ' + fmtD(row[7]) + '  ←  <b>الخروج:</b> ' + fmtD(row[8]),
    '🛏 <b>الغرف:</b> ' + tgEsc_(tgRoomsBreakdown_(row)),
    '━━━━━━━━━━━━━━',
    '📝 <b>ما الذي تغيّر:</b>'
  ]);
  diffs.slice(0, 10).forEach(function (d) {
    lines.push('   • <b>' + tgEsc_(d.label) + '</b>');
    lines.push('      <s>' + tgEsc_(fmtD(d.oldVal)) + '</s>  ⟶  <b>' + tgEsc_(fmtD(d.newVal)) + '</b>');
  });
  if (diffs.length > 10) lines.push('   … و' + (diffs.length - 10) + ' حقلاً آخر');
  // تغيّر حقل مالي ⇒ قيمة الحجز نفسها تغيّرت، فتغيّر معها رصيد العميل والمورد. الرقم الجديد
  // لكل طرف يُلحَق بالرسالة من مهمة التفريغ (balParties) بعد حساب كشف الحساب
  if (affectsBalance) {
    lines.push('━━━━━━━━━━━━━━');
    lines.push('💠 <b>هذا التعديل غيّر قيمة الحجز — وتأثّر به رصيد العميل والمورد</b>');
  }
  lines.push('━━━━━━━━━━━━━━');
  lines.push('👤 <b>بواسطة:</b> ' + tgEsc_(actor));
  lines.push('📍 <b>المصدر:</b> ' + tgEsc_(source));
  lines.push('⏰ ' + tgStamp_());
  return lines.join('\n');
}
function tgNotifyBookingEdit_(bookingKey, diffs, actor, source) {
  var city = (bookingKey || '').split('|')[0];
  var src = findSourceRowIndex_(city, bookingKey);
  if (!src) return;
  var row = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
  tgEnqueue_('booking_edit', {
    preformatted: tgBookingEditMsg_(row, city, diffs, actor || 'غير محدد', source || 'من داخل البرنامج'),
    client: (row[3] || '').toString(), ref: (row[2] || '').toString(),
    balParties: bookingBalParties_(row, diffs), ts: new Date().getTime()
  });
}
// طرفا الحجز اللذان يجب إلحاق رصيدهما بالتنبيه — فقط حين يمسّ التعديل قيمة الحجز فعلاً،
// فحساب كشف الحساب لكل طرف مكلف ولا معنى له عند تعديل ملاحظة أو رقم حجز فندق
function bookingBalParties_(row, diffs) {
  if (!bookingEditAffectsBalance_(diffs)) return null;
  var out = [];
  var client = (row[3] || '').toString().trim();
  var supplier = (row[14] || '').toString().trim();
  if (client) out.push({ name: client, roleHint: 'client' });
  if (supplier && supplier !== client) out.push({ name: supplier, roleHint: 'supplier' });
  return out.length ? out : null;
}
// دفعة تعديلات من التعديل اليدوي المباشر على الشيت (خارج البرنامج) قد تكون في الحقيقة
// *تسجيل حجز جديد* يُكتَب خلية بخلية لا تعديلاً على حجز قائم فعلاً — لا فرق بينهما ظاهريًا في
// آلية الرصد (كلاهما "خلية تغيّرت")، فكانت كل دفعة تصل تُصنَّف "تعديل حجز" حتى لو كانت في
// الحقيقة أول بيانات يكتبها الموظف لحجز لم يكن موجودًا قبل قليل. المائز: عمود "تاريخ الدخول"
// هو هوية الحجز الأساسية (بلا تاريخ دخول لا يُعتبر حجزًا أصلاً حتى بمنطق tgHandleSheetEditInstallable_
// نفسه) — فإن ظهر ضمن حقول هذه الدفعة وكانت قيمته *قبل* هذا التعديل فارغة (لا تاريخ سابق
// إطلاقًا)، فهذا يعني أن هوية الحجز نفسها تكوّنت للتو ضمن هذه الدفعة، لا أنها تغيّرت
function tgBookingDiffsLookNew_(diffs) {
  var checkInLabel = BOOKING_COL_LABELS[7]; // 'تاريخ الدخول'
  return (diffs || []).some(function (d) {
    return d.label === checkInLabel && (d.oldVal === '—' || d.oldVal === '' || d.oldVal === null || d.oldVal === undefined);
  });
}
// يبني حمولة حدث "حجز جديد" القياسية (نفس شكل الحقول المستخدَم عند التسجيل من الشاشة/البوت)
// من صف مصدر خام — يُستخدَم حين يتبيّن أن دفعة تعديلات الشيت المباشر هي حجز جديد لا تعديل
function tgNewBookingPayloadFromRow_(row, city, by) {
  var fmtD = function (v) {
    var d = v instanceof Date ? v : (v ? new Date(v) : null);
    return (d && !isNaN(d.getTime())) ? Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy') : '';
  };
  var client = (row[3] || '').toString().trim();
  var supplier = (row[14] || '').toString().trim();
  return {
    client: client, hotel: (row[4] || '').toString().trim(), city: city,
    checkIn: fmtD(row[7]), checkOut: fmtD(row[8]),
    rooms: tgRoomsBreakdown_(row), ref: (row[2] || '').toString().trim(),
    hotelRef: (row[17] || '').toString().trim(), by: by,
    // حجز جديد = قيمة جديدة تدخل الترصيد فورًا، فرصيد الطرفين تغيّر بمجرد تسجيله — بلا شرط
    // "هل تغيّر حقل مالي" (خلافًا لـbookingBalParties_ المستخدَمة في التعديل العادي)
    balParties: [{ name: client, roleHint: 'client' }].concat(
      supplier && supplier !== client ? [{ name: supplier, roleHint: 'supplier' }] : []),
    ts: new Date().getTime()
  };
}

// ==========================================================
// رصد التعديلات اليدوية المباشرة على شيت الحجوزات (خارج البرنامج)
// ==========================================================
// onEdit البسيط يعمل بصلاحية مقيَّدة لأي مستخدم لم يُصرِّح للسكربت شخصيًا (وهذا كل الموظفين
// عمليًا عدا من فتح محرر السكربت بنفسه) — فيفشل بصمت تام قبل الوصول لإرسال أي تنبيه، وهو
// تحديدًا العطل المُبلَّغ عنه: "يعمل فقط حين أعدّل أنا". المشغّل القابل للتثبيت أدناه
// (tgHandleSheetEditInstallable_) يعمل دومًا بصلاحية كاملة بصرف النظر عن هوية من يُعدّل —
// لذلك حلّ محل onEdit البسيط في هذه المهمة تحديدًا (ensureTelegramTrigger_ يُنشئه تلقائيًا)
var TG_SHEET_WATCH_COLS_ = { 3: 1, 4: 1, 5: 1, 8: 1, 9: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 18: 1, 22: 1, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 28: 1, 29: 1 };
// الرقم التسلسلي الذي يمثّل تاريخًا في جوجل شيتس (أيام منذ 30/12/1899) إلى كائن Date حقيقي —
// e.oldValue من حدث onEdit يصل كرقم خام لخلية تاريخ منسَّقة (وليس Date)، بعكس e.range.getValue()
// (القيمة الجديدة) التي تصل ككائن Date حقيقي دومًا — فيظهر التاريخ القديم كرقم خام (46293.0)
// بدل تنسيقه في تنبيه "ما الذي تغيّر" ما لم نحوّله هنا صراحةً
function tgSheetSerialToDate_(n) {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}
function tgHandleSheetEditInstallable_(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var s = getSourceSettings_();
    var city = '';
    if (sh.getName() === s.meccaSheet) city = 'مكة';
    else if (sh.getName() === s.medinaSheet) city = 'المدينة';
    else return;                                  // ورقة أخرى — لا شأن لنا بها
    var col = e.range.getColumn(), rowIdx = e.range.getRow();
    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;  // تعديل جماعي — نتخطاه
    if (!TG_SHEET_WATCH_COLS_[col]) return;
    var startRow = city === 'المدينة' ? s.medinaStartRow : s.meccaStartRow;
    if (rowIdx < startRow) return;                // صف عناوين لا حجز
    var row = sh.getRange(rowIdx, 1, 1, SOURCE_LAST_COL).getValues()[0];
    if (!row[7]) return;                          // صف فارغ (بلا تاريخ دخول) — ليس حجزًا بعد
    var label = BOOKING_COL_LABELS[col - 1] || ('عمود ' + colLetter_(col - 1));
    var actor = '—';
    try { actor = (Session.getActiveUser().getEmail() || '—'); } catch (eU) {}
    invalidateSourceCache_();                     // الشيت تغيّر فعلًا — الكاش صار قديمًا
    // القيمة القديمة لخلية تاريخ (العمودان 8/9) تصل من onEdit كرقم تسلسلي خام لا Date — نحوّلها
    // هنا صراحةً حتى تُنسَّق كتاريخ في التنبيه بدل ظهورها رقمًا (46293.0)
    var oldValRaw = (e.oldValue === undefined ? '—' : e.oldValue);
    if ((col === 8 || col === 9) && typeof oldValRaw === 'number') oldValRaw = tgSheetSerialToDate_(oldValRaw);
    // لا يُرسَل التنبيه فورًا — يُجمَّع مع أي تعديل آخر على نفس الحجز خلال مهلة قصيرة
    // (انظر tgQueueBookingEditDiff_ أدناه) فيصل تنبيه واحد لا تنبيه لكل خلية
    tgQueueBookingEditDiff_(bookingKey_(row, city), city,
      { label: label, oldVal: oldValRaw, newVal: e.range.getValue() },
      actor, '📄 تعديل يدوي مباشر على جوجل شيت');
  } catch (err) { Logger.log('tgHandleSheetEditInstallable_: ' + err.message); }
}
// ==========================================================
// تجميع تعديلات الحجز الواحد في تنبيه واحد — مهلة قصيرة قبل الإرسال
// ==========================================================
// موظف يعدّل حقلين أو أكثر لنفس الحجز خلال ثوانٍ (مثال: يحذف سعر الثلاثي ويضيف سعر الرباعي)
// كان يولّد تنبيهًا منفصلاً لكل خلية. الآن تُجمَّع كل التعديلات على نفس الحجز خلال مهلة قصيرة
// في الكاش، وتُفرَّغ دفعة واحدة من مهمة الدقيقة الموجودة أصلًا (drainTelegramQueue) — بلا أي
// مشغّلات مؤقتة إضافية لكل حجز على حدة
var TG_EDIT_BATCH_WINDOW_MS_ = 25000;          // مهلة التجميع قبل الإرسال
var TG_EDIT_BATCH_REG_ = 'tgeb_reg';           // قائمة مفاتيح الحجوزات ذات تعديلات معلَّقة
var TG_EDIT_BATCH_TTL_ = 600;                  // ثوانٍ — أطول من أي تأخير محتمل قبل التفريغ
function tgEditBatchKeyHash_(bookingKey) {
  // مفتاح الكاش لا يقبل كل الرموز بأمان (عربي/رموز خاصة) — بصمة قصيرة بدل المفتاح الخام
  return 'tgebk_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bookingKey)
  ).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}
function tgQueueBookingEditDiff_(bookingKey, city, diff, actor, source) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;   // تزاحم نادر جدًا — التعديل سيُلتقط في الدورة القادمة
  try {
    var cache = CacheService.getScriptCache();
    var hk = tgEditBatchKeyHash_(bookingKey);
    var raw = cache.get(hk);
    // dateReviver_ إلزامي هنا: قيمة قديمة/جديدة لحقل تاريخ (الدخول/الخروج) قد تكون Date
    // محفوظة بصيغة {__d:...} عبر dateReplacer_ — بلا الإحياء تعود كائنًا عاديًا لا Date حقيقيًا
    var entry = raw ? JSON.parse(raw, dateReviver_) : { key: bookingKey, city: city, firstTs: Date.now(), fields: {} };
    // نفس الحقل عُدِّل أكثر من مرة خلال المهلة: نُبقي القيمة الأولى قبل أي تعديل ونحدّث فقط
    // القيمة الأخيرة — فتظهر رسالة واحدة "من كذا إلى كذا" لا خطوات وسيطة لا تهم أحدًا
    var f = entry.fields[diff.label];
    if (f) f.newVal = diff.newVal;
    else entry.fields[diff.label] = { oldVal: diff.oldVal, newVal: diff.newVal };
    entry.actor = actor; entry.source = source;   // آخر من عدَّل ضمن المهلة
    cache.put(hk, JSON.stringify(entry, dateReplacer_), TG_EDIT_BATCH_TTL_);
    var reg = [];
    try { reg = JSON.parse(cache.get(TG_EDIT_BATCH_REG_) || '[]'); } catch (eReg) {}
    if (reg.indexOf(hk) === -1) { reg.push(hk); cache.put(TG_EDIT_BATCH_REG_, JSON.stringify(reg), TG_EDIT_BATCH_TTL_); }
  } catch (e) { Logger.log('tgQueueBookingEditDiff_: ' + e.message); }
  finally { lock.releaseLock(); }
}
// يعمل كل دقيقة من drainTelegramQueue — يُرسل فقط الدفعات التي انتهت مهلتها، ويُبقي الأحدث
// لدورة لاحقة حتى تكتمل مهلتها هي الأخرى
function tgFlushDueBookingEditBatches_() {
  var cache = CacheService.getScriptCache();
  var reg = [];
  try { reg = JSON.parse(cache.get(TG_EDIT_BATCH_REG_) || '[]'); } catch (e) { return; }
  if (!reg.length) return;
  var stillPending = [], now = Date.now();
  reg.forEach(function (hk) {
    var raw = cache.get(hk);
    if (!raw) return;   // انتهت صلاحيته من الكاش (نادر) — لا شيء نفعله
    var entry;
    try { entry = JSON.parse(raw, dateReviver_); } catch (e2) { return; }
    if (now - entry.firstTs < TG_EDIT_BATCH_WINDOW_MS_) { stillPending.push(hk); return; }
    try {
      var src = findSourceRowIndex_(entry.city, entry.key);
      if (src) {
        var row = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
        var diffs = Object.keys(entry.fields).map(function (label) {
          return { label: label, oldVal: entry.fields[label].oldVal, newVal: entry.fields[label].newVal };
        }).filter(function (d) { return String(d.oldVal) !== String(d.newVal); });
        if (diffs.length) {
          if (tgBookingDiffsLookNew_(diffs)) {
            // تاريخ الدخول كان فارغًا قبل هذه الدفعة ⇐ هذا تسجيل حجز جديد كُتب خلية بخلية
            // مباشرة في الشيت، لا تعديل على حجز قائم — فيصل تنبيه "🆕 تسجيل حجز جديد" الصحيح
            tgEnqueue_('booking_new', tgNewBookingPayloadFromRow_(row, entry.city,
              (entry.actor || 'غير محدد') + ' — 📄 تسجيل مباشر على جوجل شيت'));
          } else {
            tgEnqueue_('booking_edit', {
              preformatted: tgBookingEditMsg_(row, entry.city, diffs, entry.actor || 'غير محدد',
                entry.source || '📄 تعديل يدوي مباشر على جوجل شيت'),
              client: (row[3] || '').toString(), ref: (row[2] || '').toString(),
              balParties: bookingBalParties_(row, diffs), ts: now
            });
          }
        }
      }
    } catch (e3) { Logger.log('tgFlushDueBookingEditBatches_: ' + e3.message); }
    cache.remove(hk);
  });
  cache.put(TG_EDIT_BATCH_REG_, JSON.stringify(stillPending), TG_EDIT_BATCH_TTL_);
}
// ==========================================================
// ربط الموظف بالتليجرام من داخل البرنامج (بديل كود /link اليدوي)
// المدير يختار الموظف من شاشة الإعدادات ويكتب اسم مستخدمه على تليجرام (بدون @) أو رقم
// موبايله؛ الربط يكتمل تلقائيًا أول مرة يصل فيها تحديث من هذا المعرّف — بلا أي تدخل إضافي
// من الموظف نفسه (لا كود، لا ضغط رابط)
// ==========================================================
var TG_PROP_PENDINGLINKS_ = 'TELEGRAM_PENDING_LINKS';
function tgPendingLinks_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(TG_PROP_PENDINGLINKS_);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function tgSavePendingLinks_(arr) {
  PropertiesService.getScriptProperties().setProperty(TG_PROP_PENDINGLINKS_, JSON.stringify(arr || []));
}
function createTelegramPendingLink(token, username, idType, idValue) {
  try {
    var admin = requireAdmin_(token);
    username = (username || '').toString().trim();
    if (!username) throw new Error('اختر الموظف أولاً');
    if (!getUserByUsername_(username)) throw new Error('مستخدم غير موجود');
    idType = (idType === 'phone') ? 'phone' : 'username';
    var raw = (idValue || '').toString().trim();
    if (!raw) throw new Error(idType === 'phone' ? 'أدخل رقم الموبايل' : 'أدخل اسم المستخدم على تليجرام');
    var norm = idType === 'phone' ? raw.replace(/[^0-9]/g, '').slice(-9) : raw.replace(/^@/, '').toLowerCase();
    if (!norm) throw new Error('قيمة غير صالحة');
    var list = tgPendingLinks_().filter(function (r) { return !(r.type === idType && r.norm === norm); });
    list.push({ id: Utilities.getUuid().slice(0, 8), type: idType, norm: norm, raw: raw, username: username, ts: Date.now(), by: admin.username });
    tgSavePendingLinks_(list);
    logChange_(admin, 'الإعدادات', username,
      'إضافة ربط تليجرام مُعلَّق لـ' + username + ' (' + (idType === 'phone' ? 'رقم موبايل' : 'اسم مستخدم') + ': ' + raw + ')', '', raw);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
function getTelegramPendingLinks(token) {
  try {
    requireAdmin_(token);
    return safeReturn_(tgPendingLinks_().map(function (r) {
      var u = getUserByUsername_(r.username);
      return { id: r.id, type: r.type, raw: r.raw, username: r.username, displayName: (u && u.displayName) || r.username, ts: r.ts };
    }));
  } catch (e) { return safeReturn_({ error: e.message }); }
}
function deleteTelegramPendingLink(token, id) {
  try {
    var admin = requireAdmin_(token);
    var list = tgPendingLinks_().filter(function (r) { return r.id !== id; });
    tgSavePendingLinks_(list);
    logChange_(admin, 'الإعدادات', '', 'حذف ربط تليجرام مُعلَّق', '', '');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
// يُستدعى في بداية كل رسالة من مستخدم غير مربوط — لو اسم مستخدمه على تليجرام يطابق ربطًا
// معلَّقًا يُتمّ الربط فورًا بلا أي أمر أو كود
function tgTryAutoLinkByUsername_(from, tgName) {
  var uname = ((from && from.username) || '').toString().trim().toLowerCase();
  if (!uname) return null;
  var list = tgPendingLinks_();
  var idx = -1;
  for (var i = 0; i < list.length; i++) if (list[i].type === 'username' && list[i].norm === uname) { idx = i; break; }
  if (idx === -1) return null;
  var rec = list[idx];
  list.splice(idx, 1); tgSavePendingLinks_(list);
  return tgCompletePendingLink_(rec, from.id, tgName);
}
// مطابقة رقم موبايل من جهة اتصال أرسلها المستخدم (زر "مشاركة رقمي")
function tgTryAutoLinkByPhone_(phone, from, tgName) {
  var norm = (phone || '').toString().replace(/[^0-9]/g, '').slice(-9);
  if (!norm) return null;
  var list = tgPendingLinks_();
  var idx = -1;
  for (var i = 0; i < list.length; i++) if (list[i].type === 'phone' && list[i].norm === norm) { idx = i; break; }
  if (idx === -1) return null;
  var rec = list[idx];
  list.splice(idx, 1); tgSavePendingLinks_(list);
  return tgCompletePendingLink_(rec, from.id, tgName);
}
function tgCompletePendingLink_(rec, tgId, tgName) {
  var existing = tgUserByTgId_(tgId);
  var rec2 = {
    tgId: String(tgId), tgName: tgName || '', username: rec.username,
    linkedTs: new Date(), active: true,
    perms: existing ? existing.perms : tgDefaultPerms_(), lastSeen: new Date()
  };
  if (existing) tgWriteUserRow_(existing.rowIdx, rec2);
  else ensureTgUsersSheet_().appendRow([rec2.tgId, rec2.tgName, rec2.username, rec2.linkedTs,
    'نعم', JSON.stringify(rec2.perms), rec2.lastSeen]);
  invalidateTgUsersCache_();
  logChange_('بوت تليجرام', 'الإعدادات', rec.username,
    'ربط تلقائي لحساب تليجرام (' + (tgName || tgId) + ') بمستخدم البرنامج عبر ' +
    (rec.type === 'phone' ? 'رقم الموبايل' : 'اسم المستخدم') + ' المُدخَل من الإعدادات', '', rec.username);
  return rec2;
}
// معالجة جهة اتصال يرسلها مستخدم غير مربوط ردًا على زر "📱 مشاركة رقمي"
function tgHandleContact_(msg) {
  var chatId = msg.chat.id, from = msg.from || {};
  var contact = msg.contact || {};
  // نتحقق أن صاحب جهة الاتصال هو المرسل نفسه لا شخصًا آخر أرسل رقمه بالخطأ
  if (String(contact.user_id || '') && String(contact.user_id) !== String(from.id)) {
    tgSendTo_(chatId, '⚠️ الرجاء مشاركة رقمك أنت فقط عبر الزر.');
    return 'رقم لشخص آخر — تجاهل';
  }
  var tgName = ((from.first_name || '') + ' ' + (from.last_name || '')).trim() || (from.username || '');
  var linked = tgTryAutoLinkByPhone_(contact.phone_number, from, tgName);
  if (!linked) { tgSendTo_(chatId, '⚠️ لم يُطابَق رقمك بأي ربط معلَّق. راجع المدير.'); return 'رقم غير مطابق'; }
  var u = getUserByUsername_(linked.username);
  try { tgApi_('sendMessage', { chat_id: String(chatId), text: '⌨️', reply_markup: JSON.stringify({ remove_keyboard: true }) }); } catch (eRk) {}
  tgSendTo_(chatId, '✅ تم الربط بنجاح عبر رقم الموبايل.\n👤 ' + tgEsc_((u && u.displayName) || linked.username) +
    '\n\nاكتب /menu لعرض الأزرار المتاحة لك.', tgMenuKeyboard_(from.id));
  return 'تم الربط عبر رقم الموبايل';
}

// ==========================================================
// مطابقة اسم عميل تقريبية — /رصيد اسم مبهم أو مختصر
// ==========================================================
function tgDistinctPartyNames_() {
  var seen = {};
  getSourceRowsCached_().forEach(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL);
    var c = (raw[3] || '').toString().trim(); if (c) seen[c] = true;
    var s = (raw[14] || '').toString().trim(); if (s) seen[s] = true;
  });
  try {
    Object.keys(getAllAccountProfiles_()).forEach(function (n) { if (n) seen[n] = true; });
  } catch (e) {}
  return Object.keys(seen);
}
// نقاط تشابه بسيطة: تطابق كامل > بادئة > احتواء > تشابه كلمات > مسافة تحرير تقريبية
function tgNameScore_(query, cand) {
  var q = normalizeName_(query).toLowerCase(), c = normalizeName_(cand).toLowerCase();
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.indexOf(q) === 0 || q.indexOf(c) === 0) return 90;
  if (c.indexOf(q) !== -1 || q.indexOf(c) !== -1) return 75;
  // كلمات قصيرة (أقل من 3 أحرف) تُستبعَد من تشابه الكلمات: كلمات شائعة قصيرة مثل "لا"/"من"
  // تتطابق حرفيًا بالمصادفة داخل أي اسم تقريبًا فتُنتج ترشيحات كاذبة لا علاقة لها بالبحث
  var qw = q.split(' ').filter(function (w) { return w.length >= 3; });
  var cw = c.split(' ').filter(function (w) { return w.length >= 3; });
  if (!qw.length || !cw.length) return 0;
  var hit = 0;
  qw.forEach(function (w) { if (cw.some(function (cwi) { return cwi.indexOf(w) !== -1 || w.indexOf(cwi) !== -1; })) hit++; });
  if (hit) return 40 + Math.round(60 * hit / Math.max(qw.length, 1));
  return 0;
}
function tgMatchClientName_(query) {
  var all = tgDistinctPartyNames_();
  var scored = all.map(function (n) { return { name: n, score: tgNameScore_(query, n) }; })
    .filter(function (r) { return r.score > 0; }).sort(function (a, b) { return b.score - a.score; });
  return scored;
}

// ==========================================================
// أمر /رصيد الذكي — رصيد فوري بمطابقة اسم تقريبية + ملاحظة الحجوزات بلا سعر بيع
// ==========================================================
// asOfIso اختياري: "رصيد اسم العميل 5-9" يعرض الرصيد التراكمي حتى ذلك اليوم بالضبط، وبدونه
// يعرض رصيد اليوم كالسابق تمامًا
function tgCmdBalance_(chatId, from, query, chatType, asOfIso) {
  var ctx = tgRequire_(from.id, 'statement');
  if (!query) { tgSendTo_(chatId, 'أرسل: <code>رصيد اسم العميل</code> — ويمكن إضافة تاريخ: <code>رصيد اسم العميل 5-9</code>'); return; }
  if (!statementAccountAllowed_(ctx.user, query)) { tgSendTo_(chatId, '⛔ لا تملك صلاحية الوصول لهذا الحساب.'); return; }
  var matches = tgMatchClientName_(query);
  if (!matches.length) { tgSendTo_(chatId, '❌ لم أجد حسابًا باسم قريب من "' + tgEsc_(query) + '".'); return; }
  tgAnnounceIfGroup_(chatId, chatType, from, '💰 رصيد — ' + query + (asOfIso ? (' حتى ' + tgDispDate_(asOfIso)) : ''));
  // تطابق حاسم (تام/بادئة) أو نتيجة وحيدة قوية بفارق واضح عن التالية — يُنفَّذ فورًا
  var top = matches[0], second = matches[1];
  if (top.score >= 90 || !second || (top.score - second.score) >= 25) {
    tgSendBalanceCard_(chatId, from, ctx, top.name, asOfIso || '', asOfIso ? tgDispDate_(asOfIso) : '');
    return;
  }
  // عدة أسماء متقاربة — نرشّح للمستخدم بدل التخمين. الأسماء تُحفظ في جلسة مؤقتة والزر
  // يحمل رقم الفهرس فقط (لا الاسم نفسه) تجنبًا لحد 64 بايت في بيانات الزر لأي اسم طويل
  var names = matches.slice(0, 6).map(function (m) { return m.name; });
  tgSetSession_(chatId, from.id, 'balpick', 'ready', { names: names, asOf: asOfIso || '' });
  var rows = names.map(function (n, i) { return [tgBtn_(n, 'bl:pick:' + i)]; });
  rows.push([tgBtn_('❌ إلغاء', 'cf:abort:1')]);
  tgSendTo_(chatId, '🤔 وجدت أكثر من اسم قريب من "' + tgEsc_(query) + '" — اختر المقصود:', tgKb_(rows));
}
// صياغة حالة الرصيد بلغة العمل لا بمصطلح محاسبي: "مدين/دائن" تُربك غير المحاسب، والمعنى
// نفسه ينعكس حسب دور الطرف. الاصطلاح في الترصيد: موجب = لصالحنا، سالب = علينا — وتفسيره
// يختلف بين عميل ومورد، لذلك الدور جزء أصيل من الصياغة لا مجرد تلوين
function tgBalanceState_(num, role) {
  var n = Math.round(parseFloat(num) || 0);
  if (n === 0) return { icon: '⚪', word: 'مُسوّى — لا رصيد قائم', amount: 0 };
  if (role === 'supplier') {
    return n < 0
      ? { icon: '🔴', word: 'مستحق له', amount: Math.abs(n) }
      : { icon: '🟢', word: 'رصيد لنا', amount: Math.abs(n) };
  }
  return n > 0
    ? { icon: '🔴', word: 'مستحق عليه', amount: Math.abs(n) }
    : { icon: '🟢', word: 'رصيد له', amount: Math.abs(n) };
}
// "16,860 مستحق عليه" — مجبور لأقرب صحيح مع فاصل آلاف، بلا أي كسور عشرية
function tgBalanceText_(num, role) {
  var st = tgBalanceState_(num, role);
  if (!st.amount) return st.word;
  return Math.round(st.amount).toLocaleString('en-US') + ' ' + st.word;
}
// سطر توضيح تاريخ الرصيد. تاريخ مستقبلي (مثل "أرصدة غدًا") ليس رصيدًا "تراكميًا حتى الآن"
// بل رصيدًا متوقَّعًا يشمل حجوزات لم تبدأ بعد — وصفه بـ"التراكمي حتى" كان مربكًا وغير منطقي
function tgBalanceAsOfLabel_(asOfIso, asOfLabel, todayStr) {
  if (!asOfIso) return '🕒 الرصيد التراكمي حتى الآن (' + tgEsc_(todayStr || '') + ')';
  var todayKey = Utilities.formatDate(new Date(), 'GMT+3', 'yyyy-MM-dd');
  if (asOfIso > todayKey) {
    return '🔮 <b>رصيد متوقَّع</b> بتاريخ ' + tgEsc_(asOfLabel) +
      '\n<i>(يشمل حجوزات تبدأ بعد اليوم — ليس الرصيد القائم الآن)</i>';
  }
  if (asOfIso === todayKey) return '🕒 الرصيد التراكمي حتى اليوم (' + tgEsc_(asOfLabel) + ')';
  return '🕒 الرصيد التراكمي حتى ' + tgEsc_(asOfLabel);
}
// asOfIso (اختياري): عند فتح البطاقة من قائمة "أرصدة بتاريخ" أو "أرصدة اليوم/غدًا"، يجب أن
// يكون الرقم المعروض هو نفسه رصيد ذلك التاريخ الذي ضغط عليه المستخدم — لا رصيد اليوم. نأخذه
// من نفس دالة الترصيد التي بنت القائمة (getPartyBalancesAsOfCore_) فيستحيل اختلاف الرقمين
function tgSendBalanceCard_(chatId, from, ctx, client, asOfIso, asOfDisp, role) {
  // يُحفَظ اسم العميل في جلسة قصيرة ليقرأه معالج أزرار "استكمال الأسعار"/"كشف الحساب" أدناه
  // بلا تمرير الاسم داخل بيانات الزر (قد يتجاوز 64 بايت لأسماء طويلة)
  tgSetSession_(chatId, from.id, 'balctx', 'ready', { client: client });
  var balNumRaw = null, asOfLabel = '';
  if (asOfIso) {
    var snap = getPartyBalancesAsOfCore_(asOfIso);
    var hit = null, hitRole = '';
    [['clients', 'client'], ['suppliers', 'supplier']].forEach(function (k) {
      ((snap && snap[k[0]]) || []).forEach(function (r) {
        if (!hit && normalizeName_(r.name) === normalizeName_(client)) { hit = r; hitRole = k[1]; }
      });
    });
    if (!hit) { tgSendTo_(chatId, '❌ لا توجد حركات لحساب "' + tgEsc_(client) + '" حتى ذلك التاريخ.'); return; }
    if (!role) role = hitRole;
    balNumRaw = hit.balanceNum !== undefined ? hit.balanceNum : parseFloat(hit.balance) || 0;
    asOfLabel = asOfDisp || (snap && snap.cutoffDisp) || asOfIso;
  }
  var st = getUnifiedStatement_(client, null, null);
  if (!st || !st.totals) { tgSendTo_(chatId, '❌ لا توجد حركات لحساب "' + tgEsc_(client) + '".'); return; }
  if (!role) role = (st.roles && st.roles.length === 1 && st.roles[0] === 'supplier') ? 'supplier' : 'client';
  // بلا تاريخ محدد: الرصيد التراكمي حتى اليوم (نفس رقم شاشة "متابعة الأرصدة")، وليس إجمالي
  // الفترة المعروضة — فالحجوزات المستقبلية لا تدخل رصيد اليوم. نص "مدين/دائن" يُفكَّك لرقم
  // ثم يُعاد صياغته بلغة الدور (مستحق عليه / رصيد له / مستحق له / رصيد لنا)
  if (asOfIso === undefined || asOfIso === null || asOfIso === '') {
    var tb = st.todayBalance || st.totals.balance || '0';
    var absNum = parseFloat(String(tb).replace(/[^0-9.]/g, '')) || 0;
    balNumRaw = /دائن/.test(tb) ? -absNum : absNum;
  }
  var stt = tgBalanceState_(balNumRaw, role);
  var balTxt = tgBalanceText_(balNumRaw, role);
  var statusIcon = stt.icon;
  var statusTxt = (role === 'supplier' ? '🤝 مورد' : '👤 عميل') + ' — ' + stt.word;
  var missing = [];
  getSourceRowsCached_().forEach(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL] || '';
    if (raw[15] === 'لاغي') return;
    if (normalizeName_((raw[3] || '')) !== normalizeName_(client)) return;
    if (!computeBookingTotal_(raw, 'client').hasPrice) {
      missing.push({ key: bookingKey_(raw, city), ref: (raw[2] || '').toString(), hotel: (raw[4] || '').toString() });
    }
  });
  var lines = [
    '💳 <b>كشف رصيد — ' + tgEsc_(client) + '</b>',
    '━━━━━━━━━━━━━━',
    statusIcon + ' <b>' + tgEsc_(balTxt) + '</b>',
    '📌 ' + statusTxt,
    tgBalanceAsOfLabel_(asOfIso, asOfLabel, st.today)
  ];
  if (missing.length) {
    lines.push('', '⚠️ <b>' + missing.length + '</b> حجزًا بلا سعر بيع مسجَّل — لا يظهر أثرها في الرصيد أعلاه.');
  }
  var kb = [];
  if (missing.length && ctx.botUser.perms.prices) kb.push([tgBtn_('💵 عرض واستكمال الأسعار الناقصة (' + missing.length + ')', 'bl:miss:1')]);
  // "عرض هنا" أولاً: مراجعة الحركات هي الحاجة الغالبة بعد رؤية الرصيد، وانتظار توليد PDF
  // لأجلها مبالغة — والتصدير يبقى متاحًا تحته لمن يريد ملفًا يرسله للعميل. asOfIso يرافق
  // الزر فيبقى معروفًا عبر أزرار "أقدم/أحدث" التالية — كشف الحساب يجب أن ينتهي برصيد
  // نفس التاريخ الذي عُرضت بطاقته، لا رصيد اليوم الجاري
  kb.push([tgBtn_('📄 عرض كشف الحساب هنا', 'bl:show:0:' + (asOfIso || ''))]);
  kb.push([tgBtn_('📥 تصدير كشف الحساب (PDF/صورة)', 'bl:stmt:1')]);
  tgSendTo_(chatId, lines.join('\n'), kb.length ? tgKb_(kb) : null);
}

// ==========================================================
// كشف الحساب نصًّا داخل المحادثة — بديل فوري عن انتظار توليد PDF/صورة لمجرد المراجعة
// ==========================================================
// المرساة (anchor) هي تاريخ اليوم أو تاريخ الاستعلام الذي جاء منه المستخدم (asOfIso) —
// نُخفي أي حجز بتاريخ بعدها (حجوزات مستقبلية لم تحن بعد لا معنى لظهورها في كشف "حتى
// تاريخ كذا")، والصفحة الأولى هي أحدث 7 حركات وصولاً لتلك المرساة، معروضة تصاعديًا
// (الأقدم أولاً) فينتهي القارئ عند رصيد المرساة نفسه — كأنه يقرأ كشف حساب حقيقي.
// كل حركة سطر واحد ممتد يجمع تاريخها وبيانها وقيمتها ورصيدها التراكمي بعدها، بدل عدة
// أسطر قصيرة متتالية — يملأ عرض فقاعة تليجرام ويقلّل عدد الأسطر الرأسية.
var TG_STMT_PAGE_ = 7;
function tgSendStatementText_(chatId, from, ctx, client, offset, asOfIso) {
  if (!statementAccountAllowed_(ctx.user, client)) {
    tgSendTo_(chatId, '⛔ لا تملك صلاحية عرض كشف حساب "' + tgEsc_(client) + '".'); return;
  }
  var st = getUnifiedStatement_(client, null, null);
  if (!st || !st.rows || !st.rows.length) {
    tgSendTo_(chatId, '❌ لا توجد حركات مسجَّلة لحساب "' + tgEsc_(client) + '".'); return;
  }
  // الجلسة تُجدَّد مع كل صفحة، وإلا انتهت مهلتها في منتصف تصفّح كشف طويل
  tgSetSession_(chatId, from.id, 'balctx', 'ready', { client: client });
  var role = (st.roles && st.roles.length === 1 && st.roles[0] === 'supplier') ? 'supplier' : 'client';

  var anchorIso = asOfIso || Utilities.formatDate(new Date(), 'GMT+3', 'yyyy-MM-dd');
  var allRows = st.rows;
  var rows = allRows.filter(function (r) { return (r.dateIso || '') <= anchorIso; });
  var hiddenFuture = allRows.length - rows.length;
  var total = rows.length;
  if (!total) {
    tgSendTo_(chatId, '❌ لا توجد حركات لحساب "' + tgEsc_(client) + '" حتى ' + tgEsc_(anchorIso) + '.'); return;
  }
  offset = Math.max(0, parseInt(offset, 10) || 0);
  if (offset >= total) offset = Math.max(0, total - TG_STMT_PAGE_);
  var end = total - offset, start = Math.max(0, end - TG_STMT_PAGE_);
  var page = rows.slice(start, end);
  var anchorBalTxt = rows[total - 1].balance;   // آخر حركة ضمن المرساة = رصيد ذلك التاريخ تحديدًا

  var head = '📄 <b>كشف حساب — ' + tgEsc_(tgTrim_(client, 38)) + '</b>' +
    (st.accountCode ? ('  ·  🆔 <code>' + tgEsc_(st.accountCode) + '</code>') : '') +
    '\n📑 الحركات <b>' + (start + 1) + '</b>–<b>' + end + '</b> من <b>' + total + '</b>' +
    '  ·  🕒 حتى ' + tgEsc_(asOfIso ? tgDispDate_(asOfIso) : (st.today || '')) +
    (hiddenFuture ? ('\n<i>+' + hiddenFuture + ' حجزًا بتاريخ لاحق غير معروض هنا</i>') : '') + '\n';
  var tail = '\n\n📊 <b>الرصيد ' + (asOfIso ? ('بتاريخ ' + tgEsc_(tgDispDate_(asOfIso))) : 'اليوم') +
    ': ' + tgEsc_(anchorBalTxt || '') + '</b>';

  var lines = page.map(function (r) {
    var bits = ['📅 <b>' + tgEsc_(r.dateDisp || '') + '</b>' +
      (r.qaid ? (' 🧾' + tgEsc_(tgTrim_(r.qaid, 12))) : '')];
    bits.push('📝 ' + tgEsc_(tgTrim_(r.note || '', 55)));
    if (r.excluded) {
      bits.push('⚠️ مستبعد (بلا سعر)');
    } else {
      if (tgStmtNum_(r.debit)) bits.push('🔺<code>' + r.debit + '</code>مدين');
      if (tgStmtNum_(r.credit)) bits.push('🔻<code>' + r.credit + '</code>دائن');
      // حالة الرصيد التراكمي بعد هذه الحركة تحديدًا، بلغة الدور (عميل/مورد) الفعلي لهذا
      // القيد — لا الدور العام للحساب، فحساب له دورا عميل ومورد معًا يبقى كل سطر صحيحًا
      var bst = tgBalanceState_(tgStmtSigned_(r.balance), r.role || role);
      bits.push(bst.icon + '<code>' + (bst.amount ? tgMoney_(bst.amount) : '—') + '</code>' + tgEsc_(bst.word));
    }
    return bits.join('  ');
  });

  var kb = [];
  var nav = [];
  if (start > 0) nav.push(tgBtn_('⬅️ حركات أقدم', 'bl:show:' + (offset + TG_STMT_PAGE_) + ':' + (asOfIso || '')));
  if (offset > 0) nav.push(tgBtn_('حركات أحدث ➡️', 'bl:show:' + Math.max(0, offset - TG_STMT_PAGE_) + ':' + (asOfIso || '')));
  if (nav.length) kb.push(nav);
  kb.push([tgBtn_('📥 تصدير كشف الحساب (PDF/صورة)', 'bl:stmt:1')]);
  tgSendTo_(chatId, head + tgQuote_(lines) + tail, tgKb_(kb));
}
// الأرقام تعود من getUnifiedStatement_ نصًّا منسَّقًا ("16,860" أو "16,860 مدين") — نستخرج
// القيمة العددية لحساب عرض العمود ولمعرفة أي الصفوف صفرية فلا تُعرض أصلاً
function tgStmtNum_(v) {
  if (v === null || v === undefined) return 0;
  return Math.abs(parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0);
}
// نفس تفكيك النص لكن بإشارة: "مدين" موجب (نفس اصطلاح الترصيد في كل الملف)، "دائن" سالب —
// يتيح تمرير رصيد الصف مباشرة إلى tgBalanceState_ فتُعاد صياغته بلغة الدور (مستحق
// عليه/رصيد له/مستحق له/رصيد لنا) بدل "مدين/دائن" المحاسبي المجرد
function tgStmtSigned_(v) {
  var n = tgStmtNum_(v);
  return /دائن/.test(String(v || '')) ? -n : n;
}
// معالج أزرار الرصيد: اختيار اسم مرشَّح، أو الانتقال لاستكمال الأسعار/كشف الحساب الكامل
function tgCbBalance_(cb, chatId, msgId, from, action, arg, chatType) {
  var ctx = tgRequire_(from.id, 'statement');
  if (action === 'pick') {
    var sess = tgGetSession_(chatId, from.id);
    if (!sess || sess.flow !== 'balpick' || !sess.data.names) { tgAnswerCb_(cb.id, 'انتهت المهلة — أعد /رصيد', true); return; }
    var idx = parseInt(arg, 10);
    var name = sess.data.names[idx];
    var pickAsOf = sess.data.asOf || '';   // التاريخ المكتوب في الأمر يرافق الاسم بعد الاختيار
    tgClearSession_(chatId, from.id);
    if (!name) { tgAnswerCb_(cb.id, ''); return; }
    tgAnswerCb_(cb.id, '');
    tgSendBalanceCard_(chatId, from, ctx, name, pickAsOf, pickAsOf ? tgDispDate_(pickAsOf) : '');
    return;
  }
  var bsess = tgGetSession_(chatId, from.id);
  var client = bsess && bsess.flow === 'balctx' && bsess.data && bsess.data.client;
  if (!client) { tgAnswerCb_(cb.id, 'انتهت المهلة — أعد /رصيد', true); return; }
  if (action === 'miss') {
    tgAnswerCb_(cb.id, '');
    tgStartPriceEntry_(chatId, from, ctx, chatType, client, 'both');
    return;
  }
  if (action === 'show') {
    tgAnswerCb_(cb.id, '');
    // arg = "<offset>:<asOfIso>" — asOfIso (قد تكون فارغة = اليوم) يرافق الزر عبر كل
    // ضغطات "أقدم/أحدث" التالية فيبقى المرساة نفسها طوال التصفّح
    var showBits = String(arg || '').split(':');
    tgSendStatementText_(chatId, from, ctx, client, showBits[0], showBits[1] || '');
    return;
  }
  if (action === 'stmt') {
    tgAnswerCb_(cb.id, '');
    tgAskDocFormat_(chatId, from, chatType, 'stmt', { client: client });
    return;
  }
  tgAnswerCb_(cb.id, '');
}

// ==========================================================
// إصدار مستند PDF أو صورة — اختيار الصيغة قبل الإصدار (كشف حساب/تأكيد/كشف وصول)
// ==========================================================
// تحويل HTML لصورة: نبني PDF أولاً (نفس المحرك المستقر) ثم نطلب من درايف صورة مصغَّرة له
// بعد رفعه لمجلد مؤقت — لا يوجد محرك HTML->صورة مباشر داخل Apps Script، وهذا أقرب بديل
// عملي يعطي صورة حقيقية لا وهمية؛ لو تعذّر (أحيانًا يستغرق درايف وقتًا لتوليد المصغَّرة) نُبلغ
// بوضوح ونقترح PDF بدلاً منها فورًا
function tgHtmlToImageBlob_(html, name) {
  var pdfBlob = tgHtmlToPdfBlob_(html, name);
  var folder = ensureTempShareFolder_();
  var file = folder.createFile(pdfBlob);
  var fileId = file.getId();
  var img = null, lastErr = '';
  try {
    // الطريق الموثوق: نقطة المصغَّرات في درايف مع تحديد العرض (w1600) — تعطي PNG بعرض
    // مقروء فعلاً، بخلاف DriveApp.getThumbnail() التي تُرجع صورة صغيرة جدًا (~220px) أو null.
    // توليد المصغَّرة غير فوري بعد الرفع، لذلك نعيد المحاولة بمهلة تصاعدية قصيرة.
    // نطلب أعلى عرض أولاً ثم ننزل تدريجيًا — درايف يتجاهل أحيانًا الأعراض الكبيرة جدًا،
    // فالمحاولة المتدرجة تعطي أوضح صورة ممكنة بدل الاكتفاء بعرض واحد متوسط
    var widths = [3200, 2400, 1600, 1200]; // نطلب أعلى دقة متاحة أولاً (درايف يعيد أكبر حجم يملكه ≤ المطلوب)
    for (var i = 0; i < 8 && !img; i++) {
      if (i > 0) Utilities.sleep(i <= 2 ? 1200 : 2500);
      var url = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + widths[Math.min(i, widths.length - 1)];
      try {
        var res = UrlFetchApp.fetch(url, {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true, followRedirects: true
        });
        if (res.getResponseCode() === 200) {
          var blob = res.getBlob();
          // درايف يردّ أحيانًا بصفحة HTML "قيد التجهيز" بدل صورة — نقبل الصور فقط
          if (/^image\//.test(blob.getContentType() || '') && blob.getBytes().length > 3000) img = blob;
          else lastErr = 'المصغَّرة لم تجهز بعد';
        } else { lastErr = 'HTTP ' + res.getResponseCode(); }
      } catch (eF) { lastErr = eF.message; }
    }
    // احتياطي أخير: مصغَّرة DriveApp (منخفضة الدقة لكنها أفضل من لا شيء)
    if (!img) { try { img = file.getThumbnail(); } catch (eT) {} }
  } finally {
    try { file.setTrashed(true); } catch (eD) {}
  }
  if (!img) throw new Error('تعذّر توليد صورة الآن (' + (lastErr || 'المصغَّرة غير جاهزة') + ')');
  var safe = (name || 'صورة').toString().replace(/[\\\/:*?"<>|]/g, '-').trim() || 'صورة';
  img.setName(safe + '.png');
  return img;
}
// يُرسل المستند بالصيغة المطلوبة إلى وجهة محدَّدة، مع تراجع تلقائي لـPDF لو تعذّرت الصورة
function tgSendDocFormat_(targetId, format, html, baseName, caption) {
  if (format === 'image') {
    try {
      var img = tgHtmlToImageBlob_(html, baseName);
      // sendPhoto يضغط الصورة ويُنقص دقتها؛ sendDocument يُرسل البكسل كما هو فتبقى واضحة
      // للقراءة والتكبير — وهو المطلوب لمستند مالي مليء بالأرقام الصغيرة
      tgSendDoc_(targetId, img, caption);
      return;
    } catch (e) {
      tgSendTo_(targetId, '⚠️ تعذّر إصدار صورة (' + tgEsc_(e.message) + ') — سيُرسَل PDF بدلاً منها.');
    }
  }
  var blob = tgHtmlToPdfBlob_(html, baseName);
  tgSendDoc_(targetId, blob, caption);
}
// يعرض زرَّي "PDF" و"صورة" ويحفظ سياق الطلب (نوعه وبياناته) في جلسة قصيرة — الاختيار
// يصل لاحقًا عبر tgCbDocFormat_ فيُصدر المستند فعليًا بالصيغة المطلوبة
function tgAskDocFormat_(chatId, from, chatType, kind, data) {
  tgSetSession_(chatId, from.id, 'docfmt', 'ask', { kind: kind, data: data || {}, chatType: chatType });
  var rows = [[tgBtn_('📄 PDF', 'df:pdf:1'), tgBtn_('🖼 صورة', 'df:image:1')]];
  // كشف الحساب وحده يُقرأ داخل المحادثة مباشرة — الملف يلزم لإرساله للعميل لا لمراجعته
  if (kind === 'stmt') rows.push([tgBtn_('💬 عرضه هنا بلا ملف', 'df:text:1')]);
  rows.push([tgBtn_('❌ إلغاء', 'cf:abort:1')]);
  tgSendTo_(chatId, '🗂 اختر صيغة الإصدار:', tgKb_(rows));
}
function tgCbDocFormat_(cb, chatId, msgId, from, action, arg, chatType) {
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'docfmt') { tgAnswerCb_(cb.id, 'انتهت المهلة — أعد الأمر', true); return; }
  var format = (action === 'image') ? 'image' : 'pdf';
  tgClearSession_(chatId, from.id);
  tgAnswerCb_(cb.id, '⏳ جارِ التجهيز...');
  var kind = sess.data.kind, d = sess.data.data, ct = sess.data.chatType;
  if (kind === 'stmt' && action === 'text') {
    tgSendStatementText_(chatId, from, tgRequire_(from.id, 'statement'), d.client, 0);
  } else if (kind === 'stmt') {
    var ctx = tgRequire_(from.id, 'statement');
    tgIssueStatementDoc_(chatId, from, ctx, ct, d.client, format);
  } else if (kind === 'arrivals') {
    var ctx2 = tgRequire_(from.id, 'query');
    tgIssueArrivalsDoc_(chatId, from, ctx2, ct, d, format);
  }
}

// ==========================================================
// كشف وصول لعميل محدَّد عبر التليجرام — نص مباشر "كشف وصول: العميل من: ... الى: ... pdf"
// أو نموذج تفاعلي خطوة بخطوة من زر القائمة
// ==========================================================
function tgCollectClientBookings_(client, startTs, endTs) {
  var out = [];
  getSourceRowsCached_().forEach(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL] || '';
    if (raw[15] === 'لاغي') return;   // نفس قاعدة البرنامج: الملغي لا يظهر في كشف الوصول
    if (normalizeName_(raw[3] || '') !== normalizeName_(client)) return;
    var cin = raw[7] instanceof Date ? raw[7] : new Date(raw[7]);
    if (isNaN(cin.getTime())) return;
    var d0 = new Date(cin.getTime()); d0.setHours(0, 0, 0, 0);
    if (startTs && d0.getTime() < startTs) return;
    if (endTs && d0.getTime() > endTs) return;
    var cout = raw[8] instanceof Date ? raw[8] : new Date(raw[8]);
    var fmt = function (dt) { return isNaN(dt.getTime()) ? '' : Utilities.formatDate(dt, 'GMT+3', 'dd/MM/yyyy'); };
    var rooms = (parseInt(raw[10]) || 0) + (parseInt(raw[11]) || 0) + (parseInt(raw[12]) || 0) + (parseInt(raw[13]) || 0);
    out.push({
      city: city, hotel: (raw[4] || '').toString(), checkIn: fmt(cin), checkOut: fmt(cout),
      checkInTs: d0.getTime(), rooms: rooms, status: (raw[15] || '').toString(),
      innerRef: (raw[2] || '').toString(), hotelRef: (raw[17] || '').toString()
    });
  });
  out.sort(function (a, b) { return a.checkInTs - b.checkInTs; });
  return out;
}
function buildArrivalsClientHtml_(client, items, startDisp, endDisp) {
  var e = function (v) { return (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var css = [
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
    'body{font-family:Tahoma,Arial,sans-serif;margin:0;color:#333;}',
    '.co{text-align:center;font-weight:bold;font-size:15px;color:#7d5a2c;margin-bottom:2px;}',
    '.ttl{text-align:center;font-weight:bold;font-size:13px;margin-bottom:6px;}',
    '.hd{display:flex;justify-content:space-between;border-bottom:2px solid #7d5a2c;padding-bottom:6px;margin-bottom:6px;font-weight:bold;font-size:11px;}',
    '.hd .val{color:#7d5a2c;}',
    '.flt{font-size:10px;color:#6b6b6b;margin-bottom:8px;}',
    'table{width:100%;border-collapse:collapse;}',
    'th,td{border:1px solid #ddd;padding:4px 6px;text-align:center;font-size:10px;}',
    'th{background:#7d5a2c;color:#fff;font-size:11px;}',
    'thead{display:table-header-group;} tr{page-break-inside:avoid;}',
    'tfoot td{background:#34495e;color:#fff;font-weight:bold;}',
    '.ftr{margin-top:8px;font-size:9px;color:#888;text-align:center;}'
  ].join('\n');
  var totalRooms = 0;
  var rows = items.map(function (b, i) {
    totalRooms += (b.rooms || 0);
    return '<tr><td>' + (i + 1) + '</td><td>' + e(b.city) + '</td><td>' + e(b.hotel || 'بلا فندق') +
      '</td><td>' + e(b.checkIn) + '</td><td>' + e(b.checkOut) + '</td><td>' + e(b.rooms) +
      '</td><td>' + e(b.hotelRef || b.innerRef) + '</td><td>' + e(b.status) + '</td></tr>';
  }).join('');
  var stamp = Utilities.formatDate(new Date(), 'GMT+3', 'dd/MM/yyyy HH:mm');
  return '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>كشف وصول ' + e(client) + '</title>' +
    '<style>' + css + '</style></head><body>' +
    '<div class="co">شركة منف للسياحة الدولية</div>' +
    '<div class="ttl">كشف وصول عميل: ' + e(client) + '</div>' +
    '<div class="hd"><span>من: <span class="val">' + e(startDisp || 'البداية') + '</span></span>' +
    '<span>إلى: <span class="val">' + e(endDisp || 'آخر حجز') + '</span></span>' +
    '<span>عدد الحجوزات: <span class="val">' + items.length + '</span></span>' +
    '<span>تاريخ الإصدار: <span class="val">' + e(stamp) + '</span></span></div>' +
    '<div class="flt">الفلاتر المطبَّقة: العميل «' + e(client) + '» · ' +
      (startDisp || endDisp ? ('الفترة ' + e(startDisp || 'البداية') + ' ← ' + e(endDisp || 'مفتوحة')) : 'كل الفترات') +
      ' · ماعدا الملغي</div>' +
    '<table><thead><tr><th>#</th><th>المدينة</th><th>الفندق</th><th>الدخول</th><th>الخروج</th><th>الغرف</th><th>رقم الحجز</th><th>الحالة</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="8">لا توجد حجوزات في الفترة المحددة</td></tr>') + '</tbody>' +
    (items.length ? ('<tfoot><tr><td colspan="5">الإجمالي</td><td>' + totalRooms + '</td><td colspan="2">' + items.length + ' حجزًا</td></tr></tfoot>') : '') +
    '</table>' +
    '<div class="ftr">شركة منف للسياحة الدولية — كشف وصول عميل: ' + e(client) + ' — صدر في ' + e(stamp) + '</div>' +
    '</body></html>';
}
function tgIssueArrivalsDoc_(chatId, from, ctx, chatType, d, format) {
  var startTs = d.startIso ? new Date(d.startIso).setHours(0, 0, 0, 0) : 0;
  var endTs = d.endIso ? new Date(d.endIso).setHours(23, 59, 59, 999) : 0;
  var items = tgCollectClientBookings_(d.client, startTs || null, endTs || null);
  tgSendTo_(chatId, '⏳ جارِ تجهيز كشف وصول <b>' + tgEsc_(d.client) + '</b> (' + items.length + ' حجزًا)...');
  var startDisp = d.startIso ? Utilities.formatDate(new Date(d.startIso), 'GMT+3', 'dd/MM/yyyy') : '';
  var endDisp = d.endIso ? Utilities.formatDate(new Date(d.endIso), 'GMT+3', 'dd/MM/yyyy') : '';
  var html = buildArrivalsClientHtml_(d.client, items, startDisp, endDisp);
  var name = 'كشف وصول عميل - ' + d.client + ' - ' + Utilities.formatDate(new Date(), 'GMT+3', 'dd-MM-yyyy HH-mm');
  var target = tgDocTarget_(ctx, chatId, chatType);
  tgSendDocFormat_(target.id, format, html, name,
    '📋 <b>كشف وصول — ' + tgEsc_(d.client) + '</b>\n📦 ' + items.length + ' حجزًا\nأصدره: ' + tgEsc_(staffDisplayName_(ctx.user)) + ' · عبر البوت');
  logChange_(ctx.user, 'كشف وصول', d.client, 'إصدار كشف وصول (' + (format === 'image' ? 'صورة' : 'PDF') + ') عبر بوت تليجرام', '', '',
    { clientName: d.client, recordKey: 'ARR:' + d.client });
  if (target.isGroup && String(target.id) !== String(chatId)) tgSendTo_(chatId, '✅ أُرسل الكشف إلى الجروب.');
}
// من رسالة مباشرة "كشف وصول: ..."
function tgCmdArrivalsClient_(chatId, from, parsed, chatType) {
  var ctx = tgRequire_(from.id, 'query');
  if (!parsed.client) { tgSendTo_(chatId, 'أرسل: <code>كشف وصول: اسم العميل من: 3-9-2026 الى: 30-9-2026 pdf</code>\n(الفترة والصيغة اختياريتان — بلا تحديد: من اليوم وبلا نهاية)'); return; }
  var matches = tgMatchClientName_(parsed.client);
  var client = matches.length && matches[0].score >= 60 ? matches[0].name : parsed.client;
  tgAnnounceIfGroup_(chatId, chatType, from, '📋 كشف وصول — ' + client);
  var route = tgRouteChat_(ctx, chatId, chatType, 'كشف وصول — ' + client);
  // بلا تحديد تاريخ بداية: الافتراضي من اليوم (لا من أول حجز قديم) — والنهاية تبقى مفتوحة ما لم تُحدَّد
  var startIso = parsed.startIso || tgTodayIso_();
  tgIssueArrivalsDoc_(route.id, from, ctx, route.type, { client: client, startIso: startIso, endIso: parsed.endIso }, parsed.format);
}
// نموذج تفاعلي خطوة بخطوة (زر القائمة "📋 كشف وصول")
function tgArrivalsWizAsk_(chatId, sess) {
  var d = sess.data;
  if (sess.step === 'client') {
    tgSendTo_(chatId, '👤 أرسل الآن: <b>اسم العميل</b>', tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else if (sess.step === 'start') {
    tgSendTo_(chatId, '📅 تاريخ البداية؟ اكتبه <code>DD-MM-YYYY</code> أو اضغط تخطي (افتراضيًا: من اليوم).',
      tgKb_([[tgBtn_('⏭ تخطي', 'ar:skip:start')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else if (sess.step === 'end') {
    tgSendTo_(chatId, '📅 تاريخ النهاية؟ اكتبه <code>DD-MM-YYYY</code> أو اضغط تخطي (حتى آخر حجز).',
      tgKb_([[tgBtn_('⏭ تخطي', 'ar:skip:end')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else if (sess.step === 'format') {
    tgSendTo_(chatId, '🗂 اختر صيغة الإصدار:', tgKb_([[tgBtn_('📄 PDF', 'ar:fmt:pdf'), tgBtn_('🖼 صورة', 'ar:fmt:image')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  }
}
function tgArrivalsWizStep_(chatId, from, sess, text) {
  var d = sess.data;
  if (sess.step === 'client') {
    var matches = tgMatchClientName_(text.trim());
    d.client = matches.length && matches[0].score >= 60 ? matches[0].name : text.trim();
    sess.step = 'start';
  } else { return; }
  tgSetSession_(chatId, from.id, 'arwiz', sess.step, d);
  tgArrivalsWizAsk_(chatId, { step: sess.step, data: d });
}
function tgCbArrivalsWiz_(cb, chatId, msgId, from, action, arg, chatType) {
  var ctx = tgRequire_(from.id, 'query');
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'arwiz') { tgAnswerCb_(cb.id, 'انتهت المهلة — أعد المحاولة', true); return; }
  var d = sess.data, next = sess.step;
  // تخطي البداية ⇐ الافتراضي من اليوم (لا فترة مفتوحة من أول حجز قديم) — النهاية تبقى مفتوحة عند تخطيها
  if (action === 'skip' && arg === 'start') { d.startIso = tgTodayIso_(); next = 'end'; }
  else if (action === 'skip' && arg === 'end') next = 'format';
  else if (action === 'fmt') {
    tgAnswerCb_(cb.id, '⏳ جارِ التجهيز...');
    tgClearSession_(chatId, from.id);
    var route = tgRouteChat_(ctx, chatId, chatType, 'كشف وصول — ' + d.client);
    tgIssueArrivalsDoc_(route.id, from, ctx, route.type, d, arg === 'image' ? 'image' : 'pdf');
    return;
  } else { tgAnswerCb_(cb.id, ''); return; }
  tgSetSession_(chatId, from.id, 'arwiz', next, d);
  tgAnswerCb_(cb.id, '');
  tgArrivalsWizAsk_(chatId, { step: next, data: d });
}

// ==========================================================
// حجوزات بلا أسعار تكلفة/بيع — تسجيل الأسعار الناقصة عبر التليجرام بعدة أوضاع إدخال
// ==========================================================
function tgCollectMissingPrices_(kind) {
  var out = [];
  getSourceRowsCached_().forEach(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL] || '';
    if (raw[15] === 'لاغي') return;
    var rooms = [
      { type: 'double', qty: parseInt(raw[10]) || 0 }, { type: 'triple', qty: parseInt(raw[11]) || 0 },
      { type: 'quad', qty: parseInt(raw[12]) || 0 }, { type: 'quint', qty: parseInt(raw[13]) || 0 }
    ].filter(function (r) { return r.qty > 0; });
    if (!rooms.length) return;
    var missSale = !computeBookingTotal_(raw, 'client').hasPrice;
    var missCost = !computeBookingTotal_(raw, 'supplier').hasPrice;
    var want = (kind === 'both') ? (missSale || missCost) : (kind === 'cost' ? missCost : missSale);
    if (!want) return;
    out.push({
      key: bookingKey_(raw, city), ref: (raw[2] || '').toString(), hotel: (raw[4] || '').toString(),
      client: (raw[3] || '').toString(), supplier: (raw[14] || '').toString(), city: city,
      rooms: rooms, missSale: missSale, missCost: missCost
    });
  });
  return out;
}
// تفصيل الغرف كنص مختصر: "10 رباعي · 3 ثلاثي"
function tgRoomsBreakdown_(raw) {
  return [
    (parseInt(raw[10]) || 0) > 0 ? (raw[10] + ' دبل') : '',
    (parseInt(raw[11]) || 0) > 0 ? (raw[11] + ' ثلاثي') : '',
    (parseInt(raw[12]) || 0) > 0 ? (raw[12] + ' رباعي') : '',
    (parseInt(raw[13]) || 0) > 0 ? (raw[13] + ' خماسي') : ''
  ].filter(Boolean).join(' · ') || '—';
}
// بطاقة بيانات الحجز الكاملة من صف المصدر — تُعرض قبل أي إدخال سعر أو تعديل حتى يرى الموظف
// الحجز الذي يسجّل له فعلاً (طلب صريح: رقم داخلي/رقم فندق/فندق/عميل/مورد/التواريخ/الغرف)
function tgBookingBriefRow_(raw, city) {
  var fmt = function (v) {
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? '—' : Utilities.formatDate(d, 'GMT+3', 'dd/MM/yyyy');
  };
  var priceLine = function (label, cols) {
    var parts = [];
    if ((parseInt(raw[10]) || 0) > 0) parts.push('دبل ' + (raw[cols[0]] === '' || raw[cols[0]] === null || raw[cols[0]] === undefined ? '—' : raw[cols[0]]));
    if ((parseInt(raw[11]) || 0) > 0) parts.push('ثلاثي ' + (raw[cols[1]] === '' || raw[cols[1]] === null || raw[cols[1]] === undefined ? '—' : raw[cols[1]]));
    if ((parseInt(raw[12]) || 0) > 0) parts.push('رباعي ' + (raw[cols[2]] === '' || raw[cols[2]] === null || raw[cols[2]] === undefined ? '—' : raw[cols[2]]));
    if ((parseInt(raw[13]) || 0) > 0) parts.push('خماسي ' + (raw[cols[3]] === '' || raw[cols[3]] === null || raw[cols[3]] === undefined ? '—' : raw[cols[3]]));
    return label + ': ' + (parts.join(' · ') || '—');
  };
  return [
    '🔖 <b>الحجز الداخلي:</b> <code>' + tgEsc_(raw[2] || '—') + '</code>',
    '🏨 <b>رقم حجز الفندق:</b> ' + tgEsc_(raw[17] || '—'),
    '🏨 <b>الفندق:</b> ' + tgEsc_(raw[4] || 'بلا فندق') + ' · ' + tgCityIcon_(city) + ' ' + tgEsc_(city),
    '👤 <b>العميل:</b> ' + tgEsc_(raw[3] || '—'),
    '🤝 <b>المورد:</b> ' + tgEsc_(raw[14] || '—'),
    '📅 <b>الدخول:</b> ' + fmt(raw[7]) + '  ←  <b>الخروج:</b> ' + fmt(raw[8]) +
      ((parseInt(raw[9]) || 0) ? ('  <i>(' + tgNights_(parseInt(raw[9])) + ')</i>') : ''),
    '🛏 <b>الغرف:</b> ' + tgEsc_(tgRoomsBreakdown_(raw)),
    '🏷 ' + tgEsc_(priceLine('تكلفة حالية', [21, 22, 23, 24])),
    '💰 ' + tgEsc_(priceLine('بيع حالي', [25, 26, 27, 28]))
  ].join('\n');
}
function tgRoomTypeWord_(w) {
  // normalizeName_ يحوّل الهمزة على الياء (ئ) إلى ياء عادية — فتصبح "ثنائي" بعد التطبيع
  // "ثنايي" لا "ثنائي"؛ لذلك القائمة هنا بالصيغة المطبَّعة (بعد normalizeName_) لا الأصلية
  w = normalizeName_(w || '').toLowerCase();
  if (/^(دبل|ثنايي|double|dbl)$/.test(w)) return 'double';
  if (/^(ثلاثي|تربل|triple|trp)$/.test(w)) return 'triple';
  if (/^(رباعي|كواد|quad)$/.test(w)) return 'quad';
  if (/^(خماسي|quint)$/.test(w)) return 'quint';
  return '';
}
function tgParsePriceTokens_(text) {
  var toks = tgNormalizeDigits_(text || '').trim().split(/\s+/).filter(Boolean);
  var map = {};
  for (var i = 0; i < toks.length - 1; i++) {
    var t = tgRoomTypeWord_(toks[i]);
    if (!t) continue;
    var n = parseAmountLoose_(toks[i + 1]);
    if (!isNaN(n) && n > 0) { map[t] = n; i++; }
  }
  return map;
}
// يفهم سطر أسعار يخلط البيع والتكلفة: "بيع رباعي 500 تكلفة رباعي 430"، أو سطرًا بنوع
// واحد فقط فيُنسب كله للنوع الافتراضي المختار في بداية التدفق ("بيع" أو "تكلفة")
function tgParsePriceEntry_(text, defaultKind) {
  var toks = tgNormalizeDigits_(text || '').trim().split(/\s+/).filter(Boolean);
  var out = { sale: {}, cost: {} };
  var cur = (defaultKind === 'cost') ? 'cost' : 'sale';
  for (var i = 0; i < toks.length; i++) {
    var w = normalizeName_(toks[i]).toLowerCase();
    if (/^(بيع|sale)$/.test(w)) { cur = 'sale'; continue; }
    if (/^(تكلفه|تكلفة|cost)$/.test(w)) { cur = 'cost'; continue; }
    var t = tgRoomTypeWord_(toks[i]);
    if (!t) continue;
    var n = parseAmountLoose_(toks[i + 1]);
    if (!isNaN(n) && n > 0) { out[cur][t] = n; i++; }
  }
  return out;
}
function tgPriceEntryCount_(entry) {
  return Object.keys(entry.sale).length + Object.keys(entry.cost).length;
}
function tgParsePriceLine_(line) {
  var parts = tgNormalizeDigits_(line || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  var ref = parts.shift();
  var map = {};
  for (var i = 0; i < parts.length - 1; i++) {
    var t = tgRoomTypeWord_(parts[i]);
    if (!t) continue;
    var n = parseFloat(parts[i + 1]);
    if (!isNaN(n) && n > 0) { map[t] = n; i++; }
  }
  return { ref: ref, prices: map };
}
// يطبّق أسعار البيع و/أو التكلفة لحجز واحد: نداء قراءة واحد للصف، ونداء كتابة واحد لكل نوع
// سعر مطلوب (الأعمدة الأربعة متجاورة) — بدل نداء get/set منفصل لكل نوع غرفة
function tgApplyBookingPrices_(ctx, bookingKey, entry) {
  var city = (bookingKey || '').split('|')[0];
  var src = findSourceRowIndex_(city, bookingKey);
  if (!src) throw new Error('لم يُعثر على الحجز في المصدر');
  var order = ['double', 'triple', 'quad', 'quint'];
  var row = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
  var diffs = [];
  [{ k: 'cost', start: 22, lbl: 'سعر تكلفة ' }, { k: 'sale', start: 26, lbl: 'سعر بيع ' }].forEach(function (spec) {
    var map = (entry && entry[spec.k]) || {};
    if (!Object.keys(map).length) return;
    var vals = order.map(function (t, i) { return row[spec.start - 1 + i]; });
    var touched = false;
    order.forEach(function (t, i) {
      if (map[t] === undefined) return;
      diffs.push({ label: spec.lbl + tgRoomLbl_(t + 's'), oldVal: row[spec.start - 1 + i], newVal: map[t] });
      vals[i] = map[t]; touched = true;
    });
    if (touched) src.sheet.getRange(src.rowInSheet, spec.start, 1, 4).setValues([vals]);
  });
  if (diffs.length) {
    invalidateSourceCache_();
    logChange_(ctx.user, 'تعديل حجز', bookingKey, 'تسجيل أسعار ناقصة عبر بوت تليجرام', '', '',
      { hotelRef: row[17] || row[2], clientName: row[3], recordKey: bookingRecordKey_(row[2]) });
    tgNotifyBookingEdit_(bookingKey, diffs, staffDisplayName_(ctx.user), '🤖 من بوت تليجرام — تسجيل أسعار');
  }
  return diffs.length;
}
function tgCmdMissingPrices_(chatId, from, chatType) {
  tgRequire_(from.id, 'prices');
  tgAnnounceIfGroup_(chatId, chatType, from, '💵 حجوزات بلا أسعار');
  var sale = tgCollectMissingPrices_('sale'), cost = tgCollectMissingPrices_('cost'), both = tgCollectMissingPrices_('both');
  var lines = ['💵 <b>حجوزات ناقصة الأسعار</b>', '',
    '💰 بلا سعر بيع: <b>' + sale.length + '</b>',
    '🏷 بلا سعر تكلفة: <b>' + cost.length + '</b>',
    '📦 حجوزات ينقصها سعر (أيًّا كان نوعه): <b>' + both.length + '</b>'];
  if (!both.length) { tgSendTo_(chatId, lines.join('\n') + '\n\n✅ لا يوجد نقص حاليًا.'); return; }
  tgSetSession_(chatId, from.id, 'pricesel', 'kind', {});
  var kb = [[tgBtn_('💰➕🏷 البيع والتكلفة معًا (' + both.length + ')', 'pr:kind:both')]];
  if (sale.length) kb.push([tgBtn_('💰 أسعار البيع فقط (' + sale.length + ')', 'pr:kind:sale')]);
  if (cost.length) kb.push([tgBtn_('🏷 أسعار التكلفة فقط (' + cost.length + ')', 'pr:kind:cost')]);
  kb.push([tgBtn_('❌ إلغاء', 'cf:abort:1')]);
  tgSendTo_(chatId, lines.join('\n'), tgKb_(kb));
}
function tgCbPrices_(cb, chatId, msgId, from, action, arg, chatType) {
  var ctx = tgRequire_(from.id, 'prices');
  if (action === 'kind') {
    var kind = (arg === 'cost') ? 'cost' : (arg === 'both' ? 'both' : 'sale');
    tgSetSession_(chatId, from.id, 'pricesel', 'mode', { kind: kind });
    tgAnswerCb_(cb.id, '');
    tgSendTo_(chatId, '🗂 اختر طريقة الإدخال:', tgKb_([
      [tgBtn_('🔂 واحدة تلو الأخرى', 'pr:mode:one')],
      [tgBtn_('📋 نموذج جماعي (رسالة واحدة لعدة حجوزات)', 'pr:mode:bulk')],
      [tgBtn_('🔖 حجز محدد', 'pr:mode:pick')],
      [tgBtn_('❌ إلغاء', 'cf:abort:1')]
    ]));
    return;
  }
  var sess = tgGetSession_(chatId, from.id);
  var kind2 = sess && sess.data && sess.data.kind;
  if (!kind2) { tgAnswerCb_(cb.id, 'انتهت المهلة — أعد المحاولة', true); return; }
  tgAnswerCb_(cb.id, '');
  if (action === 'mode' && arg === 'one') { tgStartPriceEntry_(chatId, from, ctx, chatType, null, kind2); return; }
  if (action === 'mode' && arg === 'bulk') {
    tgSetSession_(chatId, from.id, 'pricewiz', 'bulk', { kind: kind2 });
    tgSendTo_(chatId, '📋 أرسل سطرًا لكل حجز بالصيغة:\n<code>رقم_الحجز نوع سعر نوع سعر ...</code>\n\n' +
      'مثال (بيع فقط):\n<code>PRE045 رباعي 500 ثلاثي 450</code>\n' +
      'مثال (بيع وتكلفة معًا):\n<code>PRE045 بيع رباعي 500 تكلفة رباعي 430</code>',
      tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
    return;
  }
  if (action === 'mode' && arg === 'pick') {
    tgSetSession_(chatId, from.id, 'pricewiz', 'pickref', { kind: kind2 });
    tgSendTo_(chatId, '🔖 أرسل رقم الحجز (الداخلي أو رقم الفندق):', tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
    return;
  }
  if (action === 'skip') { tgPriceWizAdvance_(chatId, from); return; }
}
function tgStartPriceEntry_(chatId, from, ctx, chatType, clientFilter, kind) {
  var list = tgCollectMissingPrices_(kind);
  if (clientFilter) list = list.filter(function (b) { return normalizeName_(b.client) === normalizeName_(clientFilter); });
  if (!list.length) {
    tgSendTo_(chatId, '✅ لا توجد حجوزات ناقصة ' +
      (kind === 'cost' ? 'سعر تكلفة' : (kind === 'both' ? 'أسعار' : 'سعر بيع')) +
      (clientFilter ? (' لـ' + clientFilter) : '') + '.');
    return;
  }
  var d = { kind: kind, queue: list.map(function (b) { return b.key; }), idx: 0, total: list.length };
  tgSetSession_(chatId, from.id, 'pricewiz', 'one', d);
  tgPriceWizAsk_(chatId, { step: 'one', data: d });
}
function tgPriceWizAdvance_(chatId, from) {
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'pricewiz') return;
  var d = sess.data;
  d.idx++;
  if (d.idx >= d.queue.length) { tgClearSession_(chatId, from.id); tgSendTo_(chatId, '✅ انتهت قائمة الحجوزات الناقصة.'); return; }
  tgSetSession_(chatId, from.id, 'pricewiz', 'one', d);
  tgPriceWizAsk_(chatId, { step: 'one', data: d });
}
// نص التعليمات حسب نوع الأسعار المطلوبة — يوضّح الصيغة المقبولة بمثال حقيقي
function tgPriceHint_(kind, raw) {
  var sample = (parseInt(raw && raw[12]) || 0) > 0 ? 'رباعي' : ((parseInt(raw && raw[11]) || 0) > 0 ? 'ثلاثي' : 'دبل');
  if (kind === 'both') {
    return 'اكتب الأسعار — يمكنك الجمع بين النوعين في سطر واحد:\n' +
      '<code>بيع ' + sample + ' 500 تكلفة ' + sample + ' 430</code>\n' +
      '<i>(بدون كلمة "بيع"/"تكلفة" يُحتسب السعر كـسعر بيع)</i>';
  }
  return 'اكتب ' + (kind === 'cost' ? 'سعر التكلفة' : 'سعر البيع') + ' لكل نوع، مثال: <code>' + sample + ' 500</code>';
}
function tgPriceWizAsk_(chatId, sess) {
  var d = sess.data;
  if (sess.step === 'one') {
    var key = d.queue[d.idx];
    var city = (key || '').split('|')[0];
    var src = findSourceRowIndex_(city, key);
    if (!src) { tgSendTo_(chatId, '⚠️ حجز غير موجود — يُتخطى.'); return; }
    var row = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
    var missSale = !computeBookingTotal_(row, 'client').hasPrice;
    var missCost = !computeBookingTotal_(row, 'supplier').hasPrice;
    var missTxt = [];
    if (missSale) missTxt.push('سعر البيع');
    if (missCost) missTxt.push('سعر التكلفة');
    tgSendTo_(chatId,
      '💵 <b>استكمال الأسعار</b> (' + (d.idx + 1) + '/' + d.total + ')\n' +
      '━━━━━━━━━━━━━━\n' + tgBookingBriefRow_(row, city) +
      '\n━━━━━━━━━━━━━━\n⚠️ <b>الناقص:</b> ' + (missTxt.join(' + ') || '—') + '\n\n' +
      tgPriceHint_(d.kind, row),
      tgKb_([[tgBtn_('⏭ تخطي هذا الحجز', 'pr:skip:1')], [tgBtn_('❌ إنهاء', 'cf:abort:1')]]));
  } else if (sess.step === 'pickprice') {
    var city2 = (d.bookingKey || '').split('|')[0];
    var src2 = findSourceRowIndex_(city2, d.bookingKey);
    var row2 = src2 ? src2.sheet.getRange(src2.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0] : null;
    tgSendTo_(chatId, (row2 ? ('━━━━━━━━━━━━━━\n' + tgBookingBriefRow_(row2, city2) + '\n━━━━━━━━━━━━━━\n\n') : '') +
      tgPriceHint_(d.kind, row2), tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  }
}
function tgPriceWizStep_(chatId, from, sess, text, chatType) {
  var ctx = tgRequire_(from.id, 'prices');
  var d = sess.data;
  if (sess.step === 'one') {
    var entry = tgParsePriceEntry_(text, d.kind === 'cost' ? 'cost' : 'sale');
    if (!tgPriceEntryCount_(entry)) { tgSendTo_(chatId, '⚠️ لم أفهم الصيغة.\n' + tgPriceHint_(d.kind, null)); return; }
    try {
      var n = tgApplyBookingPrices_(ctx, d.queue[d.idx], entry);
      tgSendTo_(chatId, n ? ('✅ سُجِّل ' + n + ' سعرًا.') : '⚠️ لم يُطابَق أي نوع غرفة معروف.');
    } catch (e) { tgSendTo_(chatId, '⛔ ' + e.message); }
    tgPriceWizAdvance_(chatId, from);
    return;
  }
  if (sess.step === 'bulk') {
    var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var okN = 0, failN = [];
    lines.forEach(function (line) {
      var parts = tgNormalizeDigits_(line).trim().split(/\s+/).filter(Boolean);
      if (!parts.length) { failN.push(line); return; }
      var ref = parts.shift();
      var entry2 = tgParsePriceEntry_(parts.join(' '), d.kind === 'cost' ? 'cost' : 'sale');
      if (!tgPriceEntryCount_(entry2)) { failN.push(line); return; }
      var b = tgFindBooking_(ref);
      if (!b) { failN.push(line + ' (حجز غير موجود)'); return; }
      try { tgApplyBookingPrices_(ctx, b.key, entry2); okN++; } catch (e) { failN.push(line + ' (' + e.message + ')'); }
    });
    tgClearSession_(chatId, from.id);
    var resMsg = '✅ نُفِّذ ' + okN + ' سطرًا بنجاح.';
    if (failN.length) resMsg += '\n\n⚠️ لم يُفهم/يُطبَّق:\n' + failN.slice(0, 10).map(function (l) { return '• ' + tgEsc_(l); }).join('\n');
    tgSendTo_(chatId, resMsg);
    return;
  }
  if (sess.step === 'pickref') {
    var bk = tgFindBooking_(text.trim());
    if (!bk) { tgSendTo_(chatId, '❌ لم أجد حجزًا بهذا الرقم — أعد المحاولة أو أرسل /cancel.'); return; }
    d.bookingKey = bk.key;
    tgSetSession_(chatId, from.id, 'pricewiz', 'pickprice', d);
    tgPriceWizAsk_(chatId, { step: 'pickprice', data: d });
    return;
  }
  if (sess.step === 'pickprice') {
    var entry3 = tgParsePriceEntry_(text, d.kind === 'cost' ? 'cost' : 'sale');
    if (!tgPriceEntryCount_(entry3)) { tgSendTo_(chatId, '⚠️ لم أفهم الصيغة.\n' + tgPriceHint_(d.kind, null)); return; }
    tgClearSession_(chatId, from.id);
    try {
      var n2 = tgApplyBookingPrices_(ctx, d.bookingKey, entry3);
      tgSendTo_(chatId, n2 ? ('✅ سُجِّل ' + n2 + ' سعرًا.') : '⚠️ لم يُطابَق أي نوع غرفة معروف.');
    } catch (e) { tgSendTo_(chatId, '⛔ ' + e.message); }
    return;
  }
}

// ==========================================================
// تسجيل حجز جديد تلقائيًا من رسالة حرة في الجروب — تحليل أفضل جهد ثم مراجعة إلزامية
// من المستخدم (يستكمل المدينة/العميل الناقصين، ويعدّل أي حقل) قبل التسجيل الفعلي
// ==========================================================
var TG_ARABIC_MONTHS_ = {
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4, 'مايو': 5, 'يونيو': 6,
  'يوليو': 7, 'اغسطس': 8, 'أغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12
};
function tgParseAnyDate_(s, refYear) {
  s = tgNormalizeDigits_(String(s || '').trim());
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (m) {
    var y = m[3] ? (m[3].length === 2 ? ('20' + m[3]) : m[3]) : String(refYear);
    return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  var m2 = s.match(/^(\d{1,2})\s+([؀-ۿ]+)(?:\s+(\d{4}))?/);
  if (m2) {
    var mon = TG_ARABIC_MONTHS_[m2[2]];
    if (mon) return (m2[3] || String(refYear)) + '-' + String(mon).padStart(2, '0') + '-' + String(m2[1]).padStart(2, '0');
  }
  return '';
}
function tgParseBookingDates_(text) {
  var t = tgNormalizeDigits_(text);
  var refYear = new Date().getFullYear();
  // كل طرف يُلتقَط كـ"رمز تاريخ" محدود (أرقام+فواصل، أو رقم يوم+اسم شهر عربي) لا كل ما بعد
  // "من"/"الى" حتى أول فاصلة — التقاط فضفاض كان يبتلع نصًا لاحقًا (مثل "عدد 10 غرف") فيفشل
  // تحويل التاريخ الثاني لأن الرقم الأخير الملتَقط ليس جزءًا من التاريخ أصلاً
  var tok = '(\\d{1,2}[\\/\\-.]\\d{1,2}(?:[\\/\\-.]\\d{2,4})?|\\d{1,2}\\s+[ء-ي]+(?:\\s+\\d{4})?)';
  var m = t.match(new RegExp('من\\s+' + tok + '\\s+(?:الى|إلى|الي)\\s+' + tok));
  if (!m) return { checkIn: '', checkOut: '' };
  return { checkIn: tgParseAnyDate_(m[1], refYear), checkOut: tgParseAnyDate_(m[2], refYear) };
}
function tgGuessHotel_(text) {
  var names = {};
  getSourceRowsCached_().forEach(function (fr) { var h = (fr[4] || '').toString().trim(); if (h) names[h] = true; });
  var norm = normalizeName_(text).toLowerCase();
  var best = '', bestLen = 0;
  Object.keys(names).forEach(function (h) {
    var hn = normalizeName_(h).toLowerCase();
    if (hn.length >= 3 && norm.indexOf(hn) !== -1 && hn.length > bestLen) { best = h; bestLen = hn.length; }
  });
  return best;
}
function tgGuessCity_(text) {
  if (/مكة|مكه/.test(text)) return 'مكة';
  if (/المدينة|المدينه/.test(text)) return 'المدينة';
  return '';
}
// عدد الغرف بكل نوع من نص حر — يحاول مطابقة "رقم+نوع" أو "نوع+رقم"، وإن لم يجد نوعًا محددًا
// إطلاقًا يفترض الرباعي (الأشيع في حجوزات هذا العميل) لعدد وحيد مذكور بصيغة "عدد ١٠"/"١٠ غرفة"
function tgParseBookingRooms_(text) {
  var t = tgNormalizeDigits_(text);
  var rooms = { doubles: 0, triples: 0, quads: 0, quints: 0 };
  var found = false;
  // ملاحظة حرجة: \b (حدّ الكلمة) في JS يعتمد على \w (أحرف/أرقام لاتينية فقط) — فهو معطَّل
  // تمامًا مع الحروف العربية (لا يعتبر الفراغ بعد كلمة عربية "حدًّا"). البديل هنا نفي وجود
  // حرف عربي أو رقم مباشرة بعد الكلمة، لمنع التقاط جزء من كلمة أطول مثل "رباعية"
  var noMore = '(?![ء-يٱ-ۿ0-9])';
  var typeWords = 'دبل|ثنائي|ثلاثي|تربل|رباعي|كواد|خماسي';
  // الفاصل بين الرقم ونوع الغرفة مسافات/تبويب فقط لا سطر جديد (\s العادية تشمل \n) — نموذج
  // الحجز الآن يضع كل حقل بسطر مستقل، فرقم آخر سطر التاريخ (مثل ٩/١٠) لا يجب أن "يلتحم" عبر
  // نهاية السطر بكلمة نوع الغرفة في السطر التالي فيُحتسَب مرتين (مع تطابق النوع+الرقم لاحقًا)
  var sp = '[ \\t]*';
  var re1 = new RegExp('(\\d+)' + sp + '(' + typeWords + ')' + noMore, 'g'), m;
  while ((m = re1.exec(t))) {
    var ty = tgRoomTypeWord_(m[2]);
    if (ty) { rooms[ty + 's'] += parseInt(m[1], 10) || 0; found = true; }
  }
  var re2 = new RegExp('(' + typeWords + ')' + noMore + sp + '(\\d+)', 'g');
  while ((m = re2.exec(t))) {
    var ty2 = tgRoomTypeWord_(m[1]);
    if (ty2) { rooms[ty2 + 's'] += parseInt(m[2], 10) || 0; found = true; }
  }
  if (!found) {
    var m3 = t.match(/(?:عدد|غرفة|غرف|غ)\s*(\d+)/) || t.match(new RegExp('(\\d+)\\s*(?:غرفة|غرف|غ)' + noMore));
    if (m3) { rooms.quads += parseInt(m3[1], 10) || 0; found = true; }
  }
  return { rooms: rooms, found: found };
}
function tgLooksLikeBookingText_(text) {
  if (!text || /^\//.test(text) || text.length > 600) return false;
  var dates = tgParseBookingDates_(text);
  if (!dates.checkIn || !dates.checkOut) return false;
  return tgParseBookingRooms_(text).found;
}
function tgNewBookingFieldLabel_(f) {
  return { hotel: '🏨 اسم الفندق', city: '🏙 المدينة', client: '👤 اسم العميل', supplier: '🤝 اسم المورد', hotelRef: '🔖 رقم حجز الفندق' }[f] || f;
}
// نص عرض أسعار التكلفة/البيع لكل نوع غرفة في شاشة المراجعة — "—" لو لم يُدخَل أي سعر بعد
// (كلاهما اختياري تمامًا، لا يُطلب أبدًا ضمن الحقول الناقصة الإلزامية)
function tgNewBookingPricesTxt_(d) {
  var lbl = { double: 'دبل', triple: 'ثلاثي', quad: 'رباعي', quint: 'خماسي' };
  var sale = [], cost = [];
  ['double', 'triple', 'quad', 'quint'].forEach(function (k) {
    var Suf = k.charAt(0).toUpperCase() + k.slice(1);
    if (d['sale' + Suf] !== undefined && d['sale' + Suf] !== '') sale.push(lbl[k] + ' ' + d['sale' + Suf]);
    if (d['cost' + Suf] !== undefined && d['cost' + Suf] !== '') cost.push(lbl[k] + ' ' + d['cost' + Suf]);
  });
  var parts = [];
  if (sale.length) parts.push('بيع: ' + sale.join('، '));
  if (cost.length) parts.push('تكلفة: ' + cost.join('، '));
  return parts.join(' · ') || '—';
}
function tgStartNewBookingFlow_(chatId, from, chatType, text) {
  tgRequire_(from.id, 'newbooking');
  var dates = tgParseBookingDates_(text);
  var rr = tgParseBookingRooms_(text);
  var d = {
    hotel: tgGuessHotel_(text), city: tgGuessCity_(text), checkIn: dates.checkIn, checkOut: dates.checkOut,
    doubles: rr.rooms.doubles, triples: rr.rooms.triples, quads: rr.rooms.quads, quints: rr.rooms.quints,
    client: ''
  };
  tgAnnounceIfGroup_(chatId, chatType, from, '🆕 رصدت رسالة حجز محتملة — سأراجعها معك الآن');
  // اسم الفندق ليس حقلاً إلزاميًا — بعض الحجوزات تُسجَّل قبل تحديد الفندق أو بلا فندق معروف
  var missing = [];
  if (!d.city) missing.push('city');
  missing.push('client'); // العميل يُطلب صراحةً دائمًا — لا يُخمَّن أبدًا
  tgSetSession_(chatId, from.id, 'newbk', 'ask', { d: d, missing: missing, idx: 0 });
  tgNewBookingAsk_(chatId, { data: { d: d, missing: missing, idx: 0 } });
}
function tgNewBookingAsk_(chatId, sess) {
  var missing = sess.data.missing, idx = sess.data.idx;
  if (idx >= missing.length) { tgNewBookingShowReview_(chatId, sess.data.d); return; }
  var f = missing[idx];
  if (f === 'city') {
    tgSendTo_(chatId, '🏙 ما مدينة هذا الحجز؟', tgKb_([[tgBtn_('🕋 مكة', 'nb:city:mecca'), tgBtn_('🕌 المدينة', 'nb:city:medina')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else if (f === 'prices') {
    tgSendTo_(chatId, '💵 أرسل الأسعار، مثال: <code>بيع رباعي 500 تكلفة رباعي 430</code>\nيمكن ذكر أكثر من نوع غرفة في نفس الرسالة.', tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  } else {
    tgSendTo_(chatId, '📝 البيانات المستخرَجة من رسالتك ناقصة — أرسل الآن: <b>' + tgNewBookingFieldLabel_(f) + '</b>', tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
  }
}
function tgNewBookingStep_(chatId, from, sess, text) {
  var d = sess.data.d, missing = sess.data.missing, idx = sess.data.idx;
  var f = missing[idx];
  if (f === 'hotel') d.hotel = text.trim();
  else if (f === 'client') d.client = text.trim();
  else if (f === 'city') d.city = /مدين/.test(text) ? 'المدينة' : 'مكة';
  else if (f === 'supplier') d.supplier = text.trim();
  else if (f === 'hotelRef') d.hotelRef = text.trim();
  else if (f === 'prices') {
    var pe = tgParsePriceEntry_(text, 'sale');
    ['double', 'triple', 'quad', 'quint'].forEach(function (k) {
      var Suf = k.charAt(0).toUpperCase() + k.slice(1);
      if (pe.sale[k] !== undefined) d['sale' + Suf] = pe.sale[k];
      if (pe.cost[k] !== undefined) d['cost' + Suf] = pe.cost[k];
    });
  }
  idx++;
  tgSetSession_(chatId, from.id, 'newbk', 'ask', { d: d, missing: missing, idx: idx });
  tgNewBookingAsk_(chatId, { data: { d: d, missing: missing, idx: idx } });
}
function tgNewBookingRoomsTxt_(d) {
  return [
    d.doubles > 0 ? (d.doubles + ' دبل') : '', d.triples > 0 ? (d.triples + ' ثلاثي') : '',
    d.quads > 0 ? (d.quads + ' رباعي') : '', d.quints > 0 ? (d.quints + ' خماسي') : ''
  ].filter(Boolean).join(' · ') || '—';
}
function tgNewBookingShowReview_(chatId, d) {
  var predictedStatus = computeNewBookingStatus_(d, BOOKING_REQUESTED_STATUS_);
  var lines = [
    '📋 <b>مراجعة الحجز قبل التسجيل</b>',
    '👤 العميل: ' + tgEsc_(d.client || '—'),
    '🏨 الفندق: ' + tgEsc_(d.hotel || '—'),
    '🏙 المدينة: ' + tgEsc_(d.city || '—'),
    '📅 من: ' + tgEsc_(d.checkIn || '—') + '  إلى: ' + tgEsc_(d.checkOut || '—'),
    '🛏 الغرف: ' + tgEsc_(tgNewBookingRoomsTxt_(d)),
    '🤝 المورد: ' + tgEsc_(d.supplier || '—'),
    '🔖 رقم حجز الفندق: ' + tgEsc_(d.hotelRef || '—'),
    '💵 الأسعار: ' + tgEsc_(tgNewBookingPricesTxt_(d)),
    '📌 الحالة عند التسجيل: ' + tgEsc_(predictedStatus),
    '',
    'راجع البيانات — عدّل أي حقل ناقص أو غير صحيح ثم اعتمد التسجيل.'
  ];
  var kb = [
    [tgBtn_('✏️ الفندق', 'nb:edit:hotel'), tgBtn_('✏️ المدينة', 'nb:edit:city'), tgBtn_('✏️ العميل', 'nb:edit:client')],
    [tgBtn_('✏️ المورد', 'nb:edit:supplier'), tgBtn_('✏️ رقم حجز الفندق', 'nb:edit:hotelRef')],
    [tgBtn_('✏️ الأسعار', 'nb:edit:prices')],
    [tgBtn_('✅ اعتماد وتسجيل الحجز', 'nb:confirm:1')],
    [tgBtn_('❌ إلغاء', 'cf:abort:1')]
  ];
  tgSendTo_(chatId, lines.join('\n'), tgKb_(kb));
}
// ==========================================================
// تسجيل عميل/مورد جديد تلقائيًا في ورقة "العملاء والموردين" (نفس ملف مصدر الحجوزات) —
// هذه الورقة وعمودا B (عملاء)/E (موردون) فيها هما مصدر قائمة التحقق من صحة البيانات
// (Data Validation) لخانتَي العميل/المورد بالمصدر؛ اسم غير مُدرَج فيها يتصادم مع تلك القاعدة
// عند كتابته في حجز جديد. الصف 1 عنوان ثابت يُتخطّى دائمًا، والتسجيل في أول صف فارغ بعده.
// ==========================================================
var SRC_PARTY_SHEET_NAME_ = 'العملاء والموردين';
var TG_PARTY_COL_ = { client: 2, supplier: 5 }; // B = عميل، E = مورد
var TG_PARTY_START_ROW_ = 2; // الصف 1 عنوان — يُتخطّى دائمًا بحثًا وكتابةً
function tgPartySheet_() {
  try { return openSourceSpreadsheet_(getSourceSettings_()).getSheetByName(SRC_PARTY_SHEET_NAME_); }
  catch (e) { return null; }
}
// أسماء عمود نوع واحد (عميل/مورد) بعد تخطي صف العنوان — null لو لم تُوجَد الورقة أصلاً (لا
// تحقق ممكن حينها، فلا نمنع التسجيل بلا داعٍ)
function tgPartyColumnNames_(role) {
  var sh = tgPartySheet_();
  if (!sh) return null;
  var col = TG_PARTY_COL_[role];
  var last = sh.getLastRow();
  if (last < TG_PARTY_START_ROW_) return [];
  return sh.getRange(TG_PARTY_START_ROW_, col, last - TG_PARTY_START_ROW_ + 1, 1).getValues()
    .map(function (r) { return (r[0] || '').toString().trim(); }).filter(Boolean);
}
// تطابق "متقارب" بين اسمين: تطابق تام بعد التطبيع (يتجاهل أصلًا الفراغات الزائدة، الهمزات،
// ة/ه — عبر normalizeName_)، أو احتواء أحدهما داخل الآخر (مثال: "الاقصر" ضمن "شركة الاقصر
// للسياحة" أو "شركه الأقصر") — الاسم الأقصر يُشترط 3 أحرف فأكثر لتفادي تطابق كلمة قصيرة
// شائعة (مثل "شركة" وحدها) بالمصادفة مع أي اسم آخر لا علاقة له فعليًا
function tgNamesRelated_(a, b) {
  var na = normalizeName_(a).toLowerCase(), nb = normalizeName_(b).toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  var shorter = na.length <= nb.length ? na : nb, longer = na.length <= nb.length ? nb : na;
  if (shorter.length < 3) return false;
  return longer.indexOf(shorter) !== -1;
}
function tgPartyKnown_(role, name) {
  var list = tgPartyColumnNames_(role);
  if (list === null) return true; // لا ورقة ⇒ لا تحقق ممكن، لا نعطّل التسجيل
  var n = (name || '').toString().trim();
  if (!n) return true; // اسم فارغ لا يُكتب أصلًا فلا داعي لتنبيه
  return list.some(function (x) { return tgNamesRelated_(x, n); });
}
// الاسم الحرفي تمامًا كما هو مكتوب في عمود "العملاء والموردين" (بلا trim) — تحقق صحة البيانات
// في خلية العميل/المورد بالحجز يقارن حرفيًا مع نفس هذا العمود، فأي فرق ولو مسافة زائدة في
// آخر الاسم المسجَّل مسبقًا (مطابق تمامًا بعد normalizeName_/trim ومُعتبَر "معروفًا" لذلك) يجعل
// الكتابة بالنسخة "المنظَّفة" التي استخلصناها نحن (بلا تلك المسافة) تُرفَض من الشيت رغم أن
// الاسم نفسه معروف فعلًا — الحل: نكتب دومًا نفس السلسلة الحرفية الموجودة في القائمة، لا ما
// استخلصناه نحن. لا يوجد تطابق (اسم جديد لم يُسجَّل بعد) ⇒ يُعاد الاسم كما ورد بلا تغيير
function tgPartyExactName_(role, name) {
  name = (name || '').toString().trim();
  if (!name) return name;
  var sh = tgPartySheet_();
  if (!sh) return name;
  try {
    var col = TG_PARTY_COL_[role];
    var last = sh.getLastRow();
    if (last < TG_PARTY_START_ROW_) return name;
    var vals = sh.getRange(TG_PARTY_START_ROW_, col, last - TG_PARTY_START_ROW_ + 1, 1).getValues();
    var bestRaw = '', bestLen = -1;
    for (var i = 0; i < vals.length; i++) {
      var raw = (vals[i][0] || '').toString();
      if (!raw.trim() || !tgNamesRelated_(raw, name)) continue;
      // عند وجود أكثر من مطابقة متقاربة (مثلًا "الاقصر" تُطابق أكثر من اسم مسجَّل) نفضّل
      // الاسم الأطول (الأكمل) — الأقرب لكونه الاسم الكامل الصحيح المسجَّل بدل جزء منه فقط
      if (raw.length > bestLen) { bestRaw = raw; bestLen = raw.length; }
    }
    if (bestLen >= 0) return bestRaw;
  } catch (e) {}
  return name;
}
// يكتب الاسم في أول صف فارغ بعمود النوع المناسب (بعد صف العنوان)
function tgRegisterPartyInSheet_(role, name) {
  var sh = tgPartySheet_();
  if (!sh) throw new Error('لم أجد ورقة "' + SRC_PARTY_SHEET_NAME_ + '" في ملف المصدر — سجِّله يدويًا هناك.');
  var col = TG_PARTY_COL_[role];
  var last = sh.getLastRow();
  var row = Math.max(last + 1, TG_PARTY_START_ROW_);
  if (last >= TG_PARTY_START_ROW_) {
    var vals = sh.getRange(TG_PARTY_START_ROW_, col, last - TG_PARTY_START_ROW_ + 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (!(vals[i][0] || '').toString().trim()) { row = TG_PARTY_START_ROW_ + i; break; }
    }
  }
  sh.getRange(row, col).setValue(String(name).trim());
}
// أول اسم غير معروف بين العميل والمورد (العميل أولاً) — أو null لو كلاهما معروفان/فارغان
function tgFirstUnknownParty_(clientName, supplierName) {
  if (clientName && !tgPartyKnown_('client', clientName)) return { role: 'client', name: clientName };
  if (supplierName && !tgPartyKnown_('supplier', supplierName)) return { role: 'supplier', name: supplierName };
  return null;
}
// نقطة مرور موحَّدة قبل أي تسجيل/تحديث حجز فعلي: لو وُجد اسم عميل/مورد غير مسجَّل بورقة
// "العملاء والموردين"، تُعرَض شاشة تأكيد ("عميل/مورد جديد؟") وتُعلَّق العملية حتى يردّ
// المستخدم؛ resumeKind/resumePayload يحدّدان ماذا يُنفَّذ فعليًا بعد التأكيد. تُعيد true لو
// عُلِّقت العملية فعلًا (المنادي يجب أن يتوقف فورًا)، أو false لو كل الأسماء معروفة (يتابع).
function tgGateNewParties_(chatId, from, clientName, supplierName, resumeKind, resumePayload) {
  var unknown = tgFirstUnknownParty_(clientName, supplierName);
  if (!unknown) return false;
  tgSetSession_(chatId, from.id, 'partyreg', 'ask', {
    role: unknown.role, name: unknown.name, clientName: clientName || '', supplierName: supplierName || '',
    resumeKind: resumeKind, resumePayload: resumePayload
  });
  var lbl = unknown.role === 'client' ? 'عميل' : 'مورد';
  tgSendTo_(chatId, '🆕 "' + tgEsc_(unknown.name) + '" ' + lbl + ' جديد غير مسجَّل في ورقة "' + SRC_PARTY_SHEET_NAME_ + '".\n' +
    'تسجيله الآن يمنع تعارض هذا الاسم مع خاصية التحقق من صحة البيانات في شيت المصدر عند حفظ الحجز.',
    tgKb_([[tgBtn_('✅ نعم، سجّله ' + lbl + ' جديدًا', 'pn:yes:1')], [tgBtn_('✏️ لا، سأصحّح الاسم', 'pn:no:1')], [tgBtn_('❌ إلغاء العملية', 'cf:abort:1')]]));
  return true;
}
// بعد حسم اسم واحد قد يبقى الاسم الآخر (عميل أو مورد) غير معروف أيضًا — نعيد الفحص، وإلا ننفّذ
// العملية الأصلية المعلَّقة فعليًا حسب نوعها
function tgResumeAfterPartyGate_(chatId, from, sess) {
  var d0 = sess.data;
  if (tgGateNewParties_(chatId, from, d0.clientName, d0.supplierName, d0.resumeKind, d0.resumePayload)) return;
  tgClearSession_(chatId, from.id);
  if (d0.resumeKind === 'newbk') { tgNewBookingIssue_(chatId, from, d0.resumePayload, true); }
  else if (d0.resumeKind === 'newbkupdate') { tgNewBookingUpdateExisting_(chatId, from, d0.resumePayload.d, d0.resumePayload.dupKey); }
  else if (d0.resumeKind === 'ocrnew') { tgOcrCommitNew_(chatId, from, d0.resumePayload); }
  else if (d0.resumeKind === 'ocrupdate') { tgOcrCommitUpdate_(chatId, from, d0.resumePayload.data, d0.resumePayload.bookingKey); }
  else if (d0.resumeKind === 'editbk') {
    var ctx2;
    try { ctx2 = tgRequire_(from.id, 'prices'); } catch (e) { tgSendTo_(chatId, '⛔ ' + tgEsc_(e.message)); return; }
    tgApplyBookingEdits_(chatId, from, ctx2, d0.resumePayload.bookingKey, d0.resumePayload.form, d0.resumePayload.rawText);
  }
}
function tgCbPartyReg_(cb, chatId, msgId, from, action, arg) {
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'partyreg') { tgAnswerCb_(cb.id, 'انتهت المهلة', true); return; }
  if (action === 'yes') {
    tgAnswerCb_(cb.id, '⏳ جارِ التسجيل…');
    try { tgRegisterPartyInSheet_(sess.data.role, sess.data.name); }
    catch (e) { tgSendTo_(chatId, '⛔ ' + tgEsc_(e.message)); tgClearSession_(chatId, from.id); return; }
    tgResumeAfterPartyGate_(chatId, from, sess);
    return;
  }
  if (action === 'no') {
    tgAnswerCb_(cb.id, '');
    tgClearSession_(chatId, from.id);
    tgSendTo_(chatId, '✏️ أعد الأمر بالاسم الصحيح.');
    return;
  }
  tgAnswerCb_(cb.id, '');
}
function tgNewBookingIssue_(chatId, from, d, skipDupCheck) {
  var ctx = tgRequire_(from.id, 'newbooking');
  if (!d.client) { tgSendTo_(chatId, '⛔ اسم العميل مطلوب.'); return; }
  if (!d.city) { tgSendTo_(chatId, '⛔ المدينة مطلوبة.'); return; }
  if (!d.checkIn || !d.checkOut) { tgSendTo_(chatId, '⛔ تاريخا الدخول والخروج مطلوبان.'); return; }
  if ((d.doubles + d.triples + d.quads + d.quints) <= 0) { tgSendTo_(chatId, '⛔ أدخل عدد الغرف لنوع واحد على الأقل.'); return; }
  // حجز آخر بنفس العميل/الفندق/الغرف/التواريخ؟ قد يكون هذا تكرارًا لحجز مسجَّل من قبل — نعرض
  // الخيارات بدل التسجيل المباشر (نفس فكرة اكتشاف التكرار في مسار OCR، مطبَّقة هنا للتسجيل
  // اليدوي/المباشر عبر البوت أيضًا)
  if (!skipDupCheck) {
    var dup = findSimilarBooking_({ hotel: d.hotel, checkIn: d.checkIn, checkOut: d.checkOut,
      doubles: d.doubles, triples: d.triples, quads: d.quads, quints: d.quints }, d.client, null);
    if (dup) {
      tgSetSession_(chatId, from.id, 'newbk', 'dup', { d: d, dupKey: dup.bookingKey });
      var sn = null;
      try { sn = bookingSnapshotByKey_(dup.bookingKey); } catch (eSn) {}
      tgSendTo_(chatId, [
        '⚠️ يوجد حجز آخر مسجَّل بالفعل لنفس العميل والفندق ونفس التواريخ وعدد الغرف' +
          (sn ? (' — ' + tgEsc_(reqBookingSummary_(sn, sn.innerRef))) : '') + '.',
        'قد يكون هذا الحجز مسجَّلاً من قبل — اختر الإجراء:'
      ].join('\n'), tgKb_([
        [tgBtn_('🔄 تحديث الحجز المطابق', 'nb:dupupdate:1')],
        [tgBtn_('🆕 تسجيله حجزًا منفصلاً', 'nb:dupnew:1')],
        [tgBtn_('❌ إلغاء', 'cf:abort:1')]
      ]));
      return;
    }
  }
  if (tgGateNewParties_(chatId, from, d.client, d.supplier, 'newbk', d)) return;
  // نكتب الاسم الحرفي كما هو مسجَّل في ورقة "العملاء والموردين" (لا كما استُخلص) — تفاديًا لرفض
  // خاصية التحقق من صحة البيانات لفرق تافه (مسافة زائدة مثلاً) رغم أن الاسم نفسه معروف فعلًا
  d.client = tgPartyExactName_('client', d.client);
  if (d.supplier) d.supplier = tgPartyExactName_('supplier', d.supplier);
  try {
    // appendBookingRaw_ يكتب الآن المورد ورقم حجز الفندق من d مباشرةً، ويطبّق قواعد الحالة
    // التلقائية (رقم حجز فندق، أو مورد + سعر تكلفة) — فلا حاجة لأي كتابة إضافية بعده هنا
    var startStatus = computeNewBookingStatus_(d, BOOKING_REQUESTED_STATUS_);
    var innerNo = appendBookingRaw_(d.city, d, d.client, '', startStatus);
    logChange_(ctx.user, 'حجز جديد', innerNo,
      'تسجيل حجز جديد من التليجرام — ' + d.client + ' / ' + (d.hotel || 'بلا فندق') + ' / ' + d.city +
      (d.hotelRef ? (' — رقم حجز الفندق ' + d.hotelRef) : ''),
      '', innerNo, { clientName: d.client, hotelRef: d.hotelRef || '', recordKey: bookingRecordKey_(innerNo) });
    // لا نُرسل تنبيه "تسجيل حجز جديد" لهذا الحجز: هو مسجَّل للتو من التليجرام نفسه، فإرسال
    // تنبيه به إلى نفس القناة تكرار لا معنى له (المستخدم يرى رسالة النجاح أدناه مباشرةً)
    tgSendTo_(chatId, '✅ <b>سُجِّل الحجز بنجاح</b>\n🔖 رقم الحجز الداخلي: <code>' + tgEsc_(innerNo) + '</code>' +
      (d.hotelRef ? ('\n🏨 رقم حجز الفندق: <code>' + tgEsc_(d.hotelRef) + '</code>') : '') +
      '\n📌 الحالة: ' + tgEsc_(startStatus));
  } catch (e) {
    tgSendTo_(chatId, '⛔ فشل التسجيل: ' + tgEsc_(e.message));
  }
}
// بدل تسجيل حجز جديد مكرَّر: يطبّق بيانات النموذج (فندق/تواريخ/غرف/أسعار/مورد/رقم حجز فندق)
// على الحجز القائم المطابق مباشرة، بنفس منطق تحديث تأكيد الفندق للحجز المطابق (OCR)
function tgNewBookingUpdateExisting_(chatId, from, d, dupKey) {
  var ctx;
  try { ctx = tgRequire_(from.id, 'prices'); } catch (e) { tgSendTo_(chatId, '⛔ ' + tgEsc_(e.message)); return; }
  if (tgGateNewParties_(chatId, from, d.client, d.supplier, 'newbkupdate', { d: d, dupKey: dupKey })) return;
  d.client = tgPartyExactName_('client', d.client);
  if (d.supplier) d.supplier = tgPartyExactName_('supplier', d.supplier);
  try {
    // يُلتقَط قبل الكتابة (والتي قد تضيف رقم حجز فندق فتُغيّر bookingKey_ لهذا الصف مستقبلاً)
    // ليبقى مفتاح سجل التعديلات ثابتًا بالرقم الداخلي بصرف النظر عن ذلك
    var snapBefore = null; try { snapBefore = bookingSnapshotByKey_(dupKey); } catch (eSnap) {}
    var map = reqDataToSourceMap_(d);
    if (d.supplier) map[15] = d.supplier;
    if (d.hotelRef) map[18] = d.hotelRef;
    setBookingFieldsRaw_(dupKey, map);
    logChange_(ctx.user, 'تعديل حجز', dupKey,
      'تحديث حجز قائم بدل تسجيل حجز مكرَّر (تليجرام)' + (d.hotelRef ? (' — رقم حجز الفندق ' + d.hotelRef) : ''),
      '', '', { hotelRef: d.hotelRef || '', clientName: d.client || '', recordKey: bookingRecordKey_((snapBefore && snapBefore.innerRef) || dupKey) });
    tgClearSession_(chatId, from.id);
    tgSendTo_(chatId, '✅ <b>حُدِّث الحجز القائم بدل تسجيل حجز مكرَّر</b>');
  } catch (e) { tgSendTo_(chatId, '⛔ فشل التحديث: ' + tgEsc_(e.message)); }
}
function tgCbNewBooking_(cb, chatId, msgId, from, action, arg, chatType) {
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'newbk') { tgAnswerCb_(cb.id, 'انتهت المهلة', true); return; }
  var d = sess.data.d, missing = sess.data.missing, idx = sess.data.idx;
  if (action === 'dupupdate') {
    var dupKey = sess.data.dupKey;
    if (!dupKey) { tgAnswerCb_(cb.id, 'انتهت المهلة', true); return; }
    tgAnswerCb_(cb.id, '⏳ جارِ التحديث…');
    tgClearSession_(chatId, from.id);
    tgNewBookingUpdateExisting_(chatId, from, d, dupKey);
    return;
  }
  if (action === 'dupnew') {
    tgAnswerCb_(cb.id, '');
    tgClearSession_(chatId, from.id);
    tgNewBookingIssue_(chatId, from, d, true);
    return;
  }
  if (action === 'city') {
    d.city = arg === 'medina' ? 'المدينة' : 'مكة';
    idx++;
    tgSetSession_(chatId, from.id, 'newbk', 'ask', { d: d, missing: missing, idx: idx });
    tgAnswerCb_(cb.id, '');
    tgNewBookingAsk_(chatId, { data: { d: d, missing: missing, idx: idx } });
    return;
  }
  if (action === 'edit') {
    tgSetSession_(chatId, from.id, 'newbk', 'ask', { d: d, missing: [arg], idx: 0 });
    tgAnswerCb_(cb.id, '');
    tgNewBookingAsk_(chatId, { data: { d: d, missing: [arg], idx: 0 } });
    return;
  }
  if (action === 'confirm') {
    tgAnswerCb_(cb.id, '⏳ جارِ التسجيل...');
    tgClearSession_(chatId, from.id);
    tgNewBookingIssue_(chatId, from, d);
    return;
  }
  tgAnswerCb_(cb.id, '');
}

// ==========================================================
// أرصدة الأطراف: اليوم / غدًا / بتاريخ محدد — مع اختيار عملاء أم موردين أم كليهما
// وإتاحة فتح كشف حساب أي طرف من القائمة بضغطة زر
// ==========================================================
// أطراف لهم دخول في يوم محدد (للتفرقة بين "أرصدة اليوم" و"كل الأرصدة حتى تاريخه")
function tgPartiesArrivingOn_(dayTs) {
  var clients = [], suppliers = [];
  getSourceRowsCached_().forEach(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL);
    if (raw[15] === 'لاغي') return;
    var cin = raw[7] instanceof Date ? raw[7] : new Date(raw[7]);
    if (isNaN(cin.getTime())) return;
    var d0 = new Date(cin.getTime()); d0.setHours(0, 0, 0, 0);
    if (d0.getTime() !== dayTs) return;
    var c = (raw[3] || '').toString().trim(); if (c && clients.indexOf(c) === -1) clients.push(c);
    var sp = (raw[14] || '').toString().trim(); if (sp && suppliers.indexOf(sp) === -1) suppliers.push(sp);
  });
  return { clients: clients, suppliers: suppliers };
}
// يعرض خيار النوع أولاً (عملاء / موردون / كلاهما) ثم يبني القائمة حسب الاختيار
function tgAskBalanceScope_(chatId, from, chatType, kind, dayIso, label) {
  tgSetSession_(chatId, from.id, 'balscope', 'ask', { kind: kind, dayIso: dayIso || '', chatType: chatType });
  tgSendTo_(chatId, '👥 <b>' + tgEsc_(label) + '</b>\nاختر ما تريد عرضه:', tgKb_([
    [tgBtn_('👤 العملاء', 'bs:go:clients'), tgBtn_('🤝 الموردون', 'bs:go:suppliers')],
    [tgBtn_('👥 كلاهما', 'bs:go:both')],
    [tgBtn_('❌ إلغاء', 'cf:abort:1')]
  ]));
}
function tgCbBalanceScope_(cb, chatId, msgId, from, action, arg, chatType) {
  var ctx = tgRequire_(from.id, 'statement');
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'balscope') { tgAnswerCb_(cb.id, 'انتهت المهلة — أعد المحاولة', true); return; }
  if (action !== 'go') { tgAnswerCb_(cb.id, ''); return; }
  var d = sess.data;
  tgClearSession_(chatId, from.id);
  tgAnswerCb_(cb.id, '⏳ جارِ الحساب...');
  tgRenderBalances_(chatId, from, ctx, d.kind, d.dayIso, arg);
}
// المحرّك الموحّد لكل شاشات الأرصدة في البوت — يستخدم نفس دالة الترصيد المستخدَمة في
// شاشة "بيان الأرصدة بتاريخ محدد" داخل البرنامج، فتتطابق الأرقام حرفيًا
// showZeros: يُظهر الحسابات المُسوّاة (رصيد صفر) — يلزم في جرد "أرصدة الكل" وحده
// offerZeros: يُضيف زر تبديل إظهار/إخفاء الأصفار أسفل القائمة
function tgRenderBalances_(chatId, from, ctx, kind, dayIso, scope, showZeros, offerZeros) {
  var res = getPartyBalancesAsOfCore_(dayIso || '');
  if (!res || res.error) { tgSendTo_(chatId, '⛔ ' + tgEsc_((res && res.error) || 'تعذّر حساب الأرصدة')); return; }
  var only = null;   // kind 'day' يقصر القائمة على أطراف لهم دخول في ذلك اليوم
  var head;
  if (kind === 'day') {
    var dTs = new Date(dayIso + 'T00:00:00').setHours(0, 0, 0, 0);
    only = tgPartiesArrivingOn_(dTs);
    head = '💰 <b>أرصدة أصحاب الدخول يوم ' + tgEsc_(res.cutoffDisp || dayIso) + '</b>';
  } else {
    var todayK = Utilities.formatDate(new Date(), 'GMT+3', 'yyyy-MM-dd');
    head = (dayIso && dayIso > todayK)
      ? ('🔮 <b>أرصدة متوقَّعة بتاريخ ' + tgEsc_(res.cutoffDisp || dayIso) + '</b>\n<i>(تشمل حجوزات لم تبدأ بعد)</i>')
      : ('📆 <b>الأرصدة التراكمية حتى ' + tgEsc_(res.cutoffDisp || 'آخر حركة') + '</b>');
  }
  var pick = function (list, allowed) {
    return (list || []).filter(function (r) {
      // مطابقة بالاسم المطبَّع: البيان يعرض الحساب باسمه الموحَّد، بينما قائمة أصحاب الدخول
      // تحمل الاسم كما كُتب في الحجز (قد يختلف بحرف ى/ي أو مسافة)
      if (allowed && !allowed.some(function (n) { return normalizeName_(n) === normalizeName_(r.name); })) return false;
      if (!statementAccountAllowed_(ctx.user, r.name)) return false;
      var n = Math.round(parseFloat(r.balanceNum !== undefined ? r.balanceNum : r.balance) || 0);
      // كانت "!only" (معكوسة): تُخفي الأصفار فقط في وضع اليوم وتُظهرها دومًا في "حتى تاريخه" —
      // عكس المقصود تمامًا. only حقيقي فقط في وضع اليوم (kind==='day') فنعرض فيه الجميع (حتى
      // من رصيده صفر، فقد يكون له دخول اليوم بلا حركة مالية بعد)، وفي "حتى تاريخه" (only فارغ)
      // نُخفي الأصفار فعليًا — ما لم يطلب المستخدم جردًا كاملاً صراحةً (أمر "أرصدة الكل")
      return n !== 0 || only || showZeros;
    });
  };
  var btns = [], idx = [], any = false;
  var tail = '\n<i>⚠️ = لديه حجوزات بلا سعر مسجَّل</i>';
  var b = tgBlockBuilder_(head.length + tail.length + 40);
  var addSec = function (title, rows, role) {
    if (!rows.length) return;
    any = true;
    var shown = rows.slice(0, 40);
    b.open(title + '  ·  ' + tgAccounts_(rows.length));
    shown.forEach(function (r) {
      var n = r.balanceNum !== undefined ? r.balanceNum : r.balance;
      if (!b.add([tgBalLine_(r.name, n, role, r.hasUnpricedBooking)])) return;
      if (idx.length < 16) { idx.push({ name: r.name, role: role }); }
    });
    if (rows.length > 40) b.note(['… و' + (rows.length - 40) + ' طرفًا آخر']);
  };
  if (scope !== 'suppliers') addSec('👤 <b>العملاء</b>', pick(res.clients, only && only.clients), 'client');
  if (scope !== 'clients') addSec('🤝 <b>الموردون</b>', pick(res.suppliers, only && only.suppliers), 'supplier');
  if (!any) { tgSendTo_(chatId, head + '\n\n✅ لا توجد أرصدة لعرضها.'); return; }
  // أسماء الأطراف تُحفَظ في جلسة قصيرة، والأزرار تحمل الفهرس فقط (حد 64 بايت لبيانات الزر)
  tgSetSession_(chatId, from.id, 'balnames', 'ready', { names: idx, asOf: dayIso || '', asOfDisp: res.cutoffDisp || '' });
  if (offerZeros) {
    btns.push([tgBtn_(showZeros ? '🙈 إخفاء الأرصدة الصفرية' : '👁 إظهار الأرصدة الصفرية أيضًا',
      'ba2:' + (showZeros ? 'hide' : 'zeros') + ':1')]);
  }
  for (var i = 0; i < idx.length; i += 2) {
    var row = [tgBtn_('📄 ' + tgTrim_(idx[i].name, 22), 'bn:st:' + i)];
    if (idx[i + 1]) row.push(tgBtn_('📄 ' + tgTrim_(idx[i + 1].name, 22), 'bn:st:' + (i + 1)));
    btns.push(row);
  }
  tgSendTo_(chatId, head + '\n' + b.render('حسابًا') + tail +
    (btns.length ? '\n📄 اضغط أي اسم لعرض كشف حسابه:' : ''), btns.length ? tgKb_(btns) : null);
}
// زر فتح كشف حساب طرف من قائمة الأرصدة
function tgCbBalanceName_(cb, chatId, msgId, from, action, arg, chatType) {
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'balnames' || !sess.data.names) { tgAnswerCb_(cb.id, 'انتهت المهلة', true); return; }
  var pickd = sess.data.names[parseInt(arg, 10)];
  if (!pickd) { tgAnswerCb_(cb.id, ''); return; }
  tgAnswerCb_(cb.id, '');
  var ctx = tgRequire_(from.id, 'statement');
  // الرصيد المعروض يجب أن يطابق الرقم الذي ضغط عليه المستخدم في قائمة ذلك التاريخ تحديدًا،
  // لا رصيد اليوم — لذلك نمرّر تاريخ القائمة ودور الطرف كما ظهرا في القائمة. في تقرير
  // "أرصدة الدخول خلال فترة" لكل اسم تاريخ يومه هو، فيسبق تاريخُ البند تاريخَ القائمة
  tgSendBalanceCard_(chatId, from, ctx, pickd.name,
    pickd.asOf || sess.data.asOf || '', pickd.asOfDisp || sess.data.asOfDisp || '', pickd.role || '');
}
// ==========================================================
// أرصدة الدخول خلال فترة: لكل يوم دخول في الفترة — أرصدة عملائه التراكمية حتى ذلك اليوم
// ثم أرصدة موردي نفس اليوم. نفس بيانات شاشة "متابعة الأرصدة" حرفيًا (getArrivalsByDateRange_)
// فلا تختلف الأرقام بين الشاشة والبوت
// ==========================================================
function tgCmdBalancesRangeStart_(chatId, from, chatType) {
  tgRequire_(from.id, 'statement');
  tgAnnounceIfGroup_(chatId, chatType, from, '📅 أرصدة الدخول خلال فترة');
  tgSetSession_(chatId, from.id, 'balrange', 'from', { chatType: chatType });
  tgSendTo_(chatId, '📅 <b>أرصدة الدخول خلال فترة</b>\nأرسل <b>تاريخ بداية</b> الفترة بصيغة <code>DD-MM-YYYY</code>.',
    tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
function tgBalancesRangeStep_(chatId, from, sess, text, chatType) {
  var iso = tgParseArDate_(text);
  if (!iso) { tgSendTo_(chatId, '⚠️ صيغة التاريخ يجب أن تكون <code>DD-MM-YYYY</code> — أعد الإرسال أو /cancel.'); return; }
  if (sess.step === 'from') {
    tgSetSession_(chatId, from.id, 'balrange', 'to', { chatType: sess.data.chatType || chatType, fromIso: iso });
    tgSendTo_(chatId, '✅ البداية: <b>' + tgEsc_(tgDispDate_(iso)) + '</b>\n📅 الآن أرسل <b>تاريخ نهاية</b> الفترة بنفس الصيغة.',
      tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
    return;
  }
  var fromIso = sess.data.fromIso || '';
  tgClearSession_(chatId, from.id);
  if (fromIso && iso < fromIso) { tgSendTo_(chatId, '⚠️ تاريخ النهاية قبل تاريخ البداية — ابدأ من جديد.'); return; }
  var ctx = tgRequire_(from.id, 'statement');
  tgSendTo_(chatId, '⏳ جارِ حساب أرصدة الفترة...');
  tgRenderBalancesRange_(chatId, from, ctx, fromIso, iso);
}
function tgDispDate_(iso) {
  var p = String(iso || '').split('-');
  return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : String(iso || '');
}
function tgRenderBalancesRange_(chatId, from, ctx, fromIso, toIso) {
  var res = getArrivalsByDateRange_(fromIso, toIso, false);
  var days = (res && res.days) || [];
  var head = '📅 <b>أرصدة الدخول من ' + tgEsc_(tgDispDate_(fromIso)) + ' إلى ' + tgEsc_(tgDispDate_(toIso)) + '</b>';
  if (!days.length) { tgSendTo_(chatId, head + '\n\n✅ لا توجد حجوزات دخول في هذه الفترة.'); return; }
  var idx = [];
  var tail = '\n🟢 رصيد لصالحنا · 🔴 مستحق · ⚠️ حجوزات بلا سعر مسجَّل';
  var b = tgBlockBuilder_(head.length + tail.length + 40);
  days.forEach(function (d) {
    var allowed = function (groups) {
      return (groups || []).filter(function (g) { return statementAccountAllowed_(ctx.user, g.name); });
    };
    var cl = allowed(d.clientGroups), sp = allowed(d.supplierGroups);
    b.open('🗓 <b>' + tgEsc_(d.dateDisp) + '</b>  ·  📥 ' + tgBookings_(d.count));
    var sec = function (title, rows, role) {
      if (!rows.length) return;
      b.add(['', title]);
      rows.forEach(function (g) {
        if (!b.add([tgBalLine_(g.name, g.balanceNum, role, (g.missing || g.historicalMissing > 0))])) return;
        // كل اسم يحمل تاريخ يومه: الرصيد المعروض عند فتح الكشف يجب أن يطابق رصيد ذلك
        // اليوم تحديدًا لا رصيد اليوم الجاري
        if (idx.length < 16) idx.push({ name: g.name, role: role, asOf: d.dateKey || '', asOfDisp: d.dateDisp || '' });
      });
    };
    sec('👤 <b>العملاء</b> <i>(رصيد تراكمي حتى هذا اليوم)</i>', cl, 'client');
    sec('🤝 <b>الموردون</b>', sp, 'supplier');
  });
  var btns = [];
  if (idx.length && from && from.id) {
    tgSetSession_(chatId, from.id, 'balnames', 'ready', { names: idx });
    for (var i = 0; i < idx.length; i += 2) {
      var row = [tgBtn_('📄 ' + tgTrim_(idx[i].name, 22), 'bn:st:' + i)];
      if (idx[i + 1]) row.push(tgBtn_('📄 ' + tgTrim_(idx[i + 1].name, 22), 'bn:st:' + (i + 1)));
      btns.push(row);
    }
  }
  tgSendTo_(chatId, head + '\n' + b.render('حسابًا') + tail +
    (btns.length ? '\n📄 اضغط أي اسم لعرض كشف حسابه:' : ''), btns.length ? tgKb_(btns) : null);
}

// أمر/زر: أرصدة بتاريخ محدد — يسأل التاريخ ثم النوع
function tgCmdBalancesAsOfStart_(chatId, from, chatType) {
  tgRequire_(from.id, 'statement');
  tgAnnounceIfGroup_(chatId, chatType, from, '📆 أرصدة بتاريخ محدد');
  tgSetSession_(chatId, from.id, 'balasof', 'date', { chatType: chatType });
  tgSendTo_(chatId, '📆 أرسل التاريخ بصيغة <code>DD-MM-YYYY</code> لعرض الأرصدة التراكمية حتى نهايته،\n' +
    'أو اضغط "حتى تاريخه" للرصيد النهائي بلا سقف زمني.',
    tgKb_([[tgBtn_('📅 حتى تاريخه (بلا سقف)', 'ba:now:1')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
function tgBalancesAsOfStep_(chatId, from, sess, text, chatType) {
  var iso = tgParseArDate_(text);
  if (!iso) { tgSendTo_(chatId, '⚠️ صيغة التاريخ يجب أن تكون <code>DD-MM-YYYY</code> — أعد الإرسال أو /cancel.'); return; }
  tgClearSession_(chatId, from.id);
  tgAskBalanceScope_(chatId, from, sess.data.chatType || chatType, 'asof', iso, 'الأرصدة حتى ' + text.trim());
}
function tgCbBalancesAsOf_(cb, chatId, msgId, from, action, arg, chatType) {
  tgRequire_(from.id, 'statement');
  if (action === 'now') {
    tgClearSession_(chatId, from.id);
    tgAnswerCb_(cb.id, '');
    tgAskBalanceScope_(chatId, from, chatType, 'asof', '', 'الأرصدة حتى تاريخه');
    return;
  }
  tgAnswerCb_(cb.id, '');
}

// ==========================================================
// تسجيل حجز جديد من التليجرام — نموذج مجمَّع برسالة واحدة، أو خطوة بخطوة
// ==========================================================
var TG_NEWBK_TEMPLATE_ =
  'حجز جديد\n' +
  'العميل: \n' +
  'المدينة: مكة\n' +
  'الفندق: \n' +
  'المورد: \n' +
  'من: 03-09-2026\n' +
  'الى: 10-09-2026\n' +
  'رباعي: 0\n' +
  'ثلاثي: 0\n' +
  'دبل: 0\n' +
  'خماسي: 0\n' +
  'رقم حجز الفندق: \n' +
  'تكلفة رباعي: \n' +
  'بيع رباعي: ';
// أسماء الحقول الأساسية مقبولة أيضًا بلا علامة ":" — عبارة معروفة في بداية السطر متبوعة
// بمسافة ثم بقية السطر كقيمة (مثال: "الفندق نسمات الخير" بدل "الفندق: نسمات الخير").
// كل عبارة تُطابَق بحدّ سطر صريح (لا نهاية الكلمة \b، معطَّلة مع الحروف العربية) عبر نفي وجود
// حرف/رقم عربي مباشرة بعدها، لمنع التقاط جزء من كلمة أطول (مثال: "المدينة" لا تُطابِق "من").
var TG_NB_NOCOLON_FIELDS_ = [
  { key: 'hotelRef', words: ['رقم حجز الفندق', 'رقم الحجز بالفندق', 'حجز الفندق', 'hotelref'] },
  { key: 'client', words: ['اسم العميل', 'العميل', 'عميل', 'client'] },
  { key: 'city', words: ['المدينة', 'المدينه', 'مدينة', 'مدينه', 'city'] },
  { key: 'hotel', words: ['اسم الفندق', 'الفندق', 'فندق', 'hotel'] },
  { key: 'supplier', words: ['اسم المورد', 'المورد', 'مورد', 'supplier'] },
  { key: 'checkIn', words: ['تاريخ الدخول', 'الدخول', 'من', 'from'] },
  { key: 'checkOut', words: ['تاريخ الخروج', 'الخروج', 'الى', 'إلى', 'الي', 'to'] },
  { key: 'status', words: ['الحالة', 'الحاله', 'حالة', 'حاله', 'status'] }
];
function tgMatchNoColonField_(line) {
  var s = normalizeName_(line);
  for (var i = 0; i < TG_NB_NOCOLON_FIELDS_.length; i++) {
    var def = TG_NB_NOCOLON_FIELDS_[i];
    for (var j = 0; j < def.words.length; j++) {
      var w = normalizeName_(def.words[j]).replace(/ /g, '\\s+');
      var m = s.match(new RegExp('^' + w + '(?![ء-يٱ-ۿ0-9])\\s*(.*)$', 'i'));
      if (m) return { key: def.key, value: m[1].trim() };
    }
  }
  return null;
}
// يقرأ نموذج "المفتاح: القيمة" سطرًا سطرًا — يقبل أي ترتيب، بعلامة ":" أو بلا علامة لأسماء
// الحقول الأساسية، ويتجاهل الأسطر الفارغة والمفاتيح غير المعروفة، فلا يفشل لو أضاف المستخدم
// سطر ملاحظة من عنده
function tgParseKeyedForm_(text) {
  var out = {};
  String(text || '').split('\n').forEach(function (line) {
    var m = line.match(/^\s*([^:：]+)\s*[:：]\s*(.*)$/);
    var k, v;
    if (!m) {
      var nc = tgMatchNoColonField_(line);
      if (!nc || !nc.value) return;
      if (nc.key === 'client') out.client = nc.value;
      else if (nc.key === 'city') out.city = /مدين/.test(nc.value) ? 'المدينة' : 'مكة';
      else if (nc.key === 'hotel') out.hotel = nc.value;
      else if (nc.key === 'supplier') out.supplier = nc.value;
      else if (nc.key === 'checkIn') out.checkIn = tgParseArDate_(nc.value) || tgParseAnyDate_(nc.value, new Date().getFullYear());
      else if (nc.key === 'checkOut') out.checkOut = tgParseArDate_(nc.value) || tgParseAnyDate_(nc.value, new Date().getFullYear());
      else if (nc.key === 'hotelRef') out.hotelRef = nc.value;
      else if (nc.key === 'status') out.status = nc.value;
      return;
    }
    k = normalizeName_(m[1]).toLowerCase().replace(/\s+/g, '');
    v = m[2].trim();
    if (!v) return;
    if (/^(العميل|عميل|client)$/.test(k)) out.client = v;
    else if (/^(المدينه|مدينه|city)$/.test(k)) out.city = /مدين/.test(v) ? 'المدينة' : 'مكة';
    else if (/^(الفندق|فندق|hotel)$/.test(k)) out.hotel = v;
    else if (/^(المورد|مورد|supplier)$/.test(k)) out.supplier = v;
    else if (/^(من|الدخول|تاريخالدخول|from)$/.test(k)) out.checkIn = tgParseArDate_(v) || tgParseAnyDate_(v, new Date().getFullYear());
    else if (/^(الى|إلى|الي|الخروج|تاريخالخروج|to)$/.test(k)) out.checkOut = tgParseArDate_(v) || tgParseAnyDate_(v, new Date().getFullYear());
    else if (/^(رقمحجزالفندق|حجزالفندق|hotelref)$/.test(k)) out.hotelRef = v;
    else if (/^(الحاله|حاله|status)$/.test(k)) out.status = v;
    else {
      // سطر سعر لنوع غرفة محدَّد: "تكلفة رباعي: 200" أو "بيع رباعي: 500" أو "سعر تكلفة رباعي: 200"
      // — كلاهما اختياري، ولا يُطلب أبدًا. يُفحص قبل عدد الغرف العادي لأن كليهما ينتهي بنفس
      // كلمة نوع الغرفة (تكلفة رباعي vs رباعي وحدها)
      var priceM = k.match(/^(?:سعر)?(بيع|تكلفه)(دبل|ثنايي|ثلاثي|تربل|رباعي|كواد|خماسي)$/);
      if (priceM) {
        var rt = tgRoomTypeWord_(priceM[2]);
        if (rt) {
          var pv = parseAmountLoose_(v);
          if (!isNaN(pv) && pv >= 0) out[(priceM[1] === 'بيع' ? 'sale' : 'cost') + rt.charAt(0).toUpperCase() + rt.slice(1)] = pv;
        }
      } else {
        var t = tgRoomTypeWord_(m[1].trim());
        if (t) out[{ double: 'doubles', triple: 'triples', quad: 'quads', quint: 'quints' }[t]] = parseInt(tgNormalizeDigits_(v), 10) || 0;
      }
    }
  });
  return out;
}
function tgCmdNewBookingStart_(chatId, from, chatType) {
  tgRequire_(from.id, 'newbooking');
  tgAnnounceIfGroup_(chatId, chatType, from, '🆕 تسجيل حجز جديد');
  tgSetSession_(chatId, from.id, 'newbkform', 'wait', {});
  tgSendTo_(chatId,
    '🆕 <b>تسجيل حجز جديد</b>\n\n' +
    'انسخ النموذج التالي، املأه، وأرسله رسالة واحدة:\n\n' +
    '<code>' + tgEsc_(TG_NEWBK_TEMPLATE_) + '</code>\n\n' +
    '• احذف أي سطر لا يلزمك (الأنواع بصفر تُترك فارغة تلقائيًا) — واسم الفندق نفسه اختياري.\n' +
    '• يمكن حذف العلامة ":" وكتابة اسم الحقل ثم القيمة مباشرة (مثال: الفندق نسمات الخير).\n' +
    '• رقم حجز الفندق وأسعار التكلفة/البيع اختيارية — اتركها فارغة لتجاهلها، أو اكتب سطرًا لأي نوع غرفة آخر بنفس الصيغة (مثال: بيع دبل: 450، تكلفة ثلاثي: 380).\n' +
    '• أو أرسل وصف الحجز بنص حر وسأحاول قراءته وأعرضه عليك للمراجعة.\n' +
    '• الحالة الافتراضية: <b>' + tgEsc_(BOOKING_REQUESTED_STATUS_) + '</b> — وتتحول تلقائيًا إلى <b>' + tgEsc_(BOOKING_CONFIRMED_STATUS_) + '</b> عند وجود رقم حجز فندق، أو مورد + سعر تكلفة معًا.',
    tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
// استقبال النموذج المجمَّع أو النص الحر — كلاهما ينتهي لنفس شاشة المراجعة قبل التسجيل
function tgNewBookingFormStep_(chatId, from, sess, text, chatType) {
  tgRequire_(from.id, 'newbooking');
  var f = tgParseKeyedForm_(text);
  var hasForm = f.client || f.hotel || f.checkIn || f.checkOut;
  if (!hasForm) { tgClearSession_(chatId, from.id); tgStartNewBookingFlow_(chatId, from, chatType, text); return; }
  var rr = tgParseBookingRooms_(text);
  var d = {
    client: f.client || '', city: f.city || tgGuessCity_(text) || '',
    hotel: f.hotel || tgGuessHotel_(text) || '', supplier: f.supplier || '',
    hotelRef: f.hotelRef || '', checkIn: f.checkIn || '', checkOut: f.checkOut || '',
    doubles: f.doubles !== undefined ? f.doubles : rr.rooms.doubles,
    triples: f.triples !== undefined ? f.triples : rr.rooms.triples,
    quads: f.quads !== undefined ? f.quads : rr.rooms.quads,
    quints: f.quints !== undefined ? f.quints : rr.rooms.quints
  };
  // أسعار التكلفة/البيع لكل نوع غرفة — اختيارية تمامًا، تُنسَخ فقط لو وردت فعلاً في النموذج
  ['saleDouble', 'saleTriple', 'saleQuad', 'saleQuint', 'costDouble', 'costTriple', 'costQuad', 'costQuint'].forEach(function (pk) {
    if (f[pk] !== undefined) d[pk] = f[pk];
  });
  // اسم الفندق ليس حقلاً إلزاميًا — بعض الحجوزات تُسجَّل قبل تحديد الفندق أو بلا فندق معروف
  var missing = [];
  if (!d.city) missing.push('city');
  if (!d.client) missing.push('client');
  tgClearSession_(chatId, from.id);
  if (missing.length) {
    tgSetSession_(chatId, from.id, 'newbk', 'ask', { d: d, missing: missing, idx: 0 });
    tgNewBookingAsk_(chatId, { data: { d: d, missing: missing, idx: 0 } });
  } else {
    tgSetSession_(chatId, from.id, 'newbk', 'ask', { d: d, missing: [], idx: 0 });
    tgNewBookingShowReview_(chatId, d);
  }
}
// أمر + بيانات في رسالة واحدة، بلا حاجة لإرسال /حجز أولًا: أول سطر "حجز جديد" (أو "تسجيل
// حجز"/"تسجيل حجز جديد") متبوعًا بنموذج "مفتاح: قيمة" (بعلامة ":" أو بلاها). حتى لو اكتملت كل
// الحقول تُعرَض شاشة المراجعة دائمًا قبل أي تسجيل فعلي — لا تسجيل فوري بلا مراجعة من المستخدم
// مهما اكتملت البيانات؛ التسجيل الفعلي يطبّق قواعد الحجز المؤكد كالمعتاد (tgNewBookingIssue_)
function tgTryOneShotNewBooking_(chatId, from, chatType, text) {
  // نتجاهل علامة "/" لو أضافها المستخدم سهوًا في مقدمة السطر الأول (بمسافة أو بلاها) — لا
  // تصل هذه الدالة أصلًا لو تحققت صيغة أمر حقيقية (راجع الشرط عند نداء الدالة)
  var body = String(text || '').replace(/^\s*\/\s*/, '');
  var firstLine = normalizeName_(body.split('\n')[0] || '').toLowerCase();
  if (!/^(حجز جديد|تسجيل حجز جديد|تسجيل حجز)$/.test(firstLine)) return false;
  var bu = tgUserByTgId_(from.id);
  if (!bu || !bu.perms || !bu.perms.newbooking) return false;
  tgAnnounceIfGroup_(chatId, chatType, from, '🆕 تسجيل حجز جديد (أمر ببيانات في رسالة واحدة)');
  tgNewBookingFormStep_(chatId, from, null, body, chatType);
  return true;
}

// ==========================================================
// تعديل حجز قائم من التليجرام — بالأزرار حقلاً حقلاً، أو نموذج تعديل مجمَّع
// ==========================================================
var TG_EDIT_FIELDS_ = {
  hotel:    { col: 5,  label: '🏨 الفندق',           kind: 'text' },
  supplier: { col: 15, label: '🤝 المورد',            kind: 'text' },
  checkIn:  { col: 8,  label: '📅 تاريخ الدخول',      kind: 'date' },
  checkOut: { col: 9,  label: '📅 تاريخ الخروج',      kind: 'date' },
  hotelRef: { col: 18, label: '🔖 رقم حجز الفندق',    kind: 'text' },
  status:   { col: 16, label: '📌 الحالة',            kind: 'text' },
  rooms:    { col: 0,  label: '🛏 عدد الغرف',         kind: 'rooms' },
  prices:   { col: 0,  label: '💵 الأسعار (بيع/تكلفة)', kind: 'prices' }
};
function tgCmdEditBookingStart_(chatId, from, ref, chatType) {
  var ctx = tgRequire_(from.id, 'prices'); // تعديل الحجز يتطلب مستوى "تعديل" على شاشة الحجوزات
  tgAnnounceIfGroup_(chatId, chatType, from, '✏️ تعديل حجز' + (ref ? (' — ' + ref) : ''));
  if (!ref) {
    tgSetSession_(chatId, from.id, 'editbk', 'ref', {});
    tgSendTo_(chatId, '✏️ أرسل رقم الحجز المراد تعديله (الداخلي أو رقم الفندق):',
      tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
    return;
  }
  tgEditBookingShow_(chatId, from, ref);
}
function tgEditBookingShow_(chatId, from, ref) {
  var b = tgFindBooking_(ref);
  if (!b) { tgSendTo_(chatId, '❌ لم أجد حجزًا بالرقم <code>' + tgEsc_(ref) + '</code>'); return; }
  var src = findSourceRowIndex_(b.city, b.key);
  if (!src) { tgSendTo_(chatId, '❌ تعذّر الوصول لصف الحجز في المصدر.'); return; }
  var row = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
  tgSetSession_(chatId, from.id, 'editbk', 'menu', { key: b.key, ref: b.innerRef || b.hotelRef || ref });
  tgSendTo_(chatId,
    '✏️ <b>تعديل حجز</b>\n━━━━━━━━━━━━━━\n' + tgBookingBriefRow_(row, b.city) +
    '\n━━━━━━━━━━━━━━\n\nاختر ما تريد تعديله، أو أرسل تعديلاً مجمَّعًا بصيغة:\n' +
    '<code>الفندق: اسم جديد\nمن: 05-09-2026\nرباعي: 12</code>',
    tgKb_([
      [tgBtn_('🏨 الفندق', 'eb:f:hotel'), tgBtn_('🤝 المورد', 'eb:f:supplier')],
      [tgBtn_('📅 تاريخ الدخول', 'eb:f:checkIn'), tgBtn_('📅 تاريخ الخروج', 'eb:f:checkOut')],
      [tgBtn_('🛏 عدد الغرف', 'eb:f:rooms'), tgBtn_('💵 الأسعار', 'eb:f:prices')],
      [tgBtn_('🔖 رقم حجز الفندق', 'eb:f:hotelRef'), tgBtn_('📌 الحالة', 'eb:f:status')],
      [tgBtn_('❌ إنهاء', 'cf:abort:1')]
    ]));
}
function tgCbEditBooking_(cb, chatId, msgId, from, action, arg, chatType) {
  tgRequire_(from.id, 'prices');
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'editbk' || !sess.data.key) { tgAnswerCb_(cb.id, 'انتهت المهلة — أعد /تعديل', true); return; }
  if (action !== 'f') { tgAnswerCb_(cb.id, ''); return; }
  var spec = TG_EDIT_FIELDS_[arg];
  if (!spec) { tgAnswerCb_(cb.id, ''); return; }
  tgAnswerCb_(cb.id, '');
  var d = sess.data; d.field = arg;
  tgSetSession_(chatId, from.id, 'editbk', 'value', d);
  var hint = spec.kind === 'date' ? 'أرسل التاريخ بصيغة <code>DD-MM-YYYY</code>'
    : spec.kind === 'rooms' ? 'أرسل الأعداد، مثال: <code>رباعي 12 ثلاثي 3</code>'
    : spec.kind === 'prices' ? 'أرسل الأسعار، مثال: <code>بيع رباعي 500 تكلفة رباعي 430</code>'
    : 'أرسل القيمة الجديدة';
  tgSendTo_(chatId, '✏️ <b>' + spec.label + '</b>\n' + hint, tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
function tgEditBookingStep_(chatId, from, sess, text, chatType) {
  var ctx = tgRequire_(from.id, 'prices');
  var d = sess.data;
  if (sess.step === 'ref') { tgClearSession_(chatId, from.id); tgEditBookingShow_(chatId, from, text.trim()); return; }
  if (sess.step === 'menu') { tgApplyBookingEdits_(chatId, from, ctx, d.key, tgParseKeyedForm_(text), text); return; }
  if (sess.step === 'value') {
    var spec = TG_EDIT_FIELDS_[d.field];
    if (!spec) { tgClearSession_(chatId, from.id); return; }
    var form = {};
    if (spec.kind === 'date') {
      var iso = tgParseArDate_(text);
      if (!iso) { tgSendTo_(chatId, '⚠️ صيغة التاريخ يجب أن تكون <code>DD-MM-YYYY</code>.'); return; }
      form[d.field] = iso;
    } else if (spec.kind === 'rooms' || spec.kind === 'prices') {
      // تُعالَج عبر نفس محلّلي الغرف/الأسعار أدناه
    } else {
      form[d.field] = text.trim();
    }
    tgApplyBookingEdits_(chatId, from, ctx, d.key, form, text);
    return;
  }
}
// يطبّق تعديلات الحجز: الحقول النصية/التواريخ عبر editBookingFields (بتسجيل تغييرات وتنبيه)،
// والغرف والأسعار عبر محلّليهما — ثم يعرض بطاقة الحجز محدَّثة ليؤكد المستخدم النتيجة بعينه
function tgApplyBookingEdits_(chatId, from, ctx, bookingKey, form, rawText) {
  // العميل ليس من حقول التعديل هنا (TG_EDIT_FIELDS_ لا يشمله) — المورد فقط هو المرشَّح لاسم جديد
  if (form.supplier && tgGateNewParties_(chatId, from, '', form.supplier, 'editbk', { bookingKey: bookingKey, form: form, rawText: rawText })) return;
  // نكتب الاسم الحرفي المسجَّل في "العملاء والموردين" — يتفادى رفض تحقق صحة البيانات لفرق تافه
  if (form.supplier) form.supplier = tgPartyExactName_('supplier', form.supplier);
  var fieldsMap = {}, applied = [];
  Object.keys(TG_EDIT_FIELDS_).forEach(function (k) {
    var spec = TG_EDIT_FIELDS_[k];
    if (!spec.col || form[k] === undefined || form[k] === '') return;
    fieldsMap[spec.col] = form[k];
    applied.push(spec.label);
  });
  var rr = tgParseBookingRooms_(rawText || '');
  if (rr.found) {
    var roomCols = { doubles: 11, triples: 12, quads: 13, quints: 14 };
    Object.keys(roomCols).forEach(function (rk) {
      if (!rr.rooms[rk]) return;
      fieldsMap[roomCols[rk]] = rr.rooms[rk];
    });
    applied.push('🛏 الغرف');
  }
  var okMsg = [];
  if (Object.keys(fieldsMap).length) {
    var res = editBookingFieldsAsUser_(ctx.user, bookingKey, fieldsMap);
    if (!res.ok) { tgSendTo_(chatId, '⛔ ' + tgEsc_(res.error)); return; }
    okMsg.push('✅ عُدِّل ' + res.count + ' حقلاً: ' + applied.join('، '));
  }
  var entry = tgParsePriceEntry_(rawText || '', 'sale');
  if (tgPriceEntryCount_(entry)) {
    try {
      var n = tgApplyBookingPrices_(ctx, bookingKey, entry);
      if (n) okMsg.push('✅ سُجِّل ' + n + ' سعرًا.');
    } catch (e) { okMsg.push('⛔ الأسعار: ' + e.message); }
  }
  tgClearSession_(chatId, from.id);
  if (!okMsg.length) {
    tgSendTo_(chatId, '⚠️ لم أفهم أي تعديل من رسالتك. استخدم الأزرار أو صيغة <code>الحقل: القيمة</code>.');
    return;
  }
  var city = (bookingKey || '').split('|')[0];
  var src = findSourceRowIndex_(city, bookingKey);
  var brief = '';
  if (src) {
    var row = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
    brief = '\n\n━━━━━━━━━━━━━━\n' + tgBookingBriefRow_(row, city);
  }
  var refBack = '';
  try { if (src) { var rw = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0]; refBack = (rw[2] || rw[17] || '').toString(); } } catch (eR) {}
  tgSendTo_(chatId, okMsg.join('\n') + brief,
    tgKb_([[tgBtn_('✏️ تعديل حقل آخر', 'eb:again:1')], [tgBtn_('✅ إنهاء', 'cf:abort:1')]]));
  tgSetSession_(chatId, from.id, 'editbk', 'menu', { key: bookingKey, ref: refBack });
}
// نسخة من editBookingFields تعمل بهوية موظف محسومة مسبقًا (البوت) بلا رمز جلسة متصفح
function editBookingFieldsAsUser_(actingUser, bookingKey, fieldsMap) {
  try {
    var city = (bookingKey || '').split('|')[0];
    if (!city) throw new Error('مفتاح حجز غير صالح');
    if (!bookingCityAllowed_(actingUser, city)) throw new Error('لا تملك صلاحية الوصول لحجوزات مدينة "' + city + '"');
    var src = findSourceRowIndex_(city, bookingKey);
    if (!src) throw new Error('لم يتم العثور على الحجز في شيت المصدر (' + city + ')');
    var rowVals = src.sheet.getRange(src.rowInSheet, 1, 1, SOURCE_LAST_COL).getValues()[0];
    var hotelRefOrRef = rowVals[17] || rowVals[2], clientName = rowVals[3];
    var innerRefForLog = (rowVals[2] || '').toString().trim();
    // قاعدة: تعديل يحمل رقم حجز فندق ⇒ الحالة "مؤكد" (rowVals[15] = العمود 16 = الحالة الحالية)
    applyHotelRefConfirmRule_(fieldsMap, String(rowVals[15] || '').trim());
    var qaidWasSet_ = !!(rowVals[0] || '').toString().trim();
    var count = 0, diffs = [], sigChanged_ = [];
    Object.keys(fieldsMap).forEach(function (colStr) {
      var col = parseInt(colStr, 10);
      if (SOURCE_FORMULA_COLS_[col]) return;
      var val = fieldsMap[colStr];
      if ((col === 8 || col === 9) && val) {
        var dp = String(val).split('-');
        var dt = (dp.length === 3) ? new Date(parseInt(dp[0], 10), parseInt(dp[1], 10) - 1, parseInt(dp[2], 10)) : new Date(val);
        if (!isNaN(dt.getTime())) val = dt;
      }
      var oldValue = rowVals[col - 1];
      src.sheet.getRange(src.rowInSheet, col).setValue(val);
      rowVals[col - 1] = val;
      count++;
      var fieldLabel = BOOKING_COL_LABELS[col - 1] || ('عمود ' + colLetter_(col - 1));
      logChange_(actingUser, 'تعديل حجز', bookingKey, 'تعديل "' + fieldLabel + '" عبر بوت تليجرام', oldValue, val,
        { hotelRef: hotelRefOrRef, clientName: clientName, recordKey: bookingRecordKey_(innerRefForLog) });
      if (String(oldValue || '') !== String(val || '')) {
        diffs.push({ label: fieldLabel, oldVal: oldValue, newVal: val });
        if (QAID_EDIT_TRIGGER_COLS_1BASED_[col]) sigChanged_.push(fieldLabel);
      }
    });
    invalidateSourceCache_();
    if (qaidWasSet_ && sigChanged_.length) {
      flagQaidEditedBooking_(bookingRecordKey_(innerRefForLog), innerRefForLog, hotelRefOrRef, clientName, sigChanged_, actingUser);
    }
    if (diffs.length) { try { tgNotifyBookingEdit_(bookingKey, diffs, staffDisplayName_(actingUser), '🤖 من بوت تليجرام — تعديل حجز'); } catch (eN) {} }
    return { ok: true, count: count };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ==========================================================
// قراءة تأكيدات الفنادق (PDF) من التليجرام واستخلاص بيانات الحجز تلقائيًا (OCR عبر Drive)
// ==========================================================
// التدفق: يُرسل الموظف ملف تأكيد الفندق (PDF) للبوت ← نحمّله ← نحوّله لمستند Google بتقنية
// OCR فنقرأ نصّه ← نستخلص (الفندق/رقم التأكيد/التواريخ/الغرف/تكلفة الليلة) ← نعرضها للمراجعة
// وإمكانية تعديل أي بند ← نطلب اسم العميل واسم المورد (بمطابقة تقريبية كالمعتاد) ← نتحقق من
// تكرار رقم حجز الفندق (تحديث/إلغاء) أو مطابقة حجز بلا رقم (تحديثه) ← نسجّل بحالة "مؤكد".

// تنزيل ملف تليجرام (getFile ثم تحميله من مسار الملف) وإرجاعه Blob
function tgTelegramFileBlob_(fileId) {
  var info = tgApi_('getFile', { file_id: fileId });
  if (!info || !info.file_path) throw new Error('تعذّر جلب الملف من تليجرام');
  var token = tgToken_();
  var url = 'https://api.telegram.org/file/bot' + token + '/' + info.file_path;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('تعذّر تنزيل الملف (HTTP ' + res.getResponseCode() + ')');
  return res.getBlob();
}

// OCR: نرفع الملف إلى Drive فيُستورَد كمستند Google (تُشغَّل القراءة الضوئية أثناء التحويل)،
// ثم نصدّره نصًّا ونحذفه. نستخدم Drive عبر UrlFetchApp برمز OAuth الحالي (صلاحية Drive ممنوحة
// أصلًا من ميزة نسخ/حذف ملفات المشاركة) — فلا حاجة لتفعيل خدمة متقدمة أو إذن جديد من المستخدم.
// نجرّب طريقتين لأقصى موثوقية: (1) Drive v3 — الميتاداتا تحمل mimeType الهدف (مستند Google)
// والنوع الحقيقي (PDF) في جزء الوسائط، فيحوّله Drive ويقرأه ضوئيًا تلقائيًا. (2) احتياطي:
// Drive v2 بـconvert=true&ocr=true بلا mimeType هدف. الخطأ السابق كان من خلط الطريقتين
// (نقطة v2 مع mimeType هدف = "OCR is not supported for files of type ...google-apps.document").
function tgDriveOcrImport_(url, meta, blob, ct, token) {
  var boundary = 'menfOCR' + Date.now() + Math.floor(Math.random() * 1e6);
  var head = Utilities.newBlob(
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: ' + ct + '\r\n\r\n'
  ).getBytes();
  var tail = Utilities.newBlob('\r\n--' + boundary + '--').getBytes();
  var payloadBytes = head.concat(blob.getBytes()).concat(tail);
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'multipart/related; boundary=' + boundary,
    payload: Utilities.newBlob(payloadBytes), headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() < 300 && body.id) return body.id;
  Logger.log('tgDriveOcrImport_ ' + res.getResponseCode() + ': ' + String(res.getContentText()).slice(0, 200));
  return '';
}
function tgOcrPdfToText_(blob) {
  var token = ScriptApp.getOAuthToken();
  var ct = blob.getContentType() || 'application/pdf';
  // ocrLanguage ضروري لتشغيل القراءة الضوئية على الملفات الصورية (PDF مصوَّر/سكان): بدونه
  // يحوّل Drive ملفات النص فقط (كتأكيد برستيج) ويُرجع فارغًا لأي تأكيد صورة (كقافلة التوحيد).
  // ar يقرأ العربية وأيضًا الأرقام/اللاتينية جيدًا (الحقول الحرجة أرقام لاتينية في كل النماذج).
  var fileId = tgDriveOcrImport_('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=ar',
    { name: 'OCR_' + Date.now(), mimeType: 'application/vnd.google-apps.document' }, blob, ct, token);
  if (!fileId) {
    fileId = tgDriveOcrImport_('https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&convert=true&ocr=true&ocrLanguage=ar',
      { title: 'OCR_' + Date.now() }, blob, ct, token);
  }
  if (!fileId) throw new Error('تعذّر تحويل الملف لقراءته ضوئيًا (تحقّق أن الملف PDF صالح)');
  var text = '';
  try {
    var exp = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/export?mimeType=text/plain',
      { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (exp.getResponseCode() < 300) text = exp.getContentText();
    else Logger.log('OCR export ' + exp.getResponseCode() + ': ' + String(exp.getContentText()).slice(0, 200));
  } finally {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (eDel) {}
  }
  return text;
}

// ==========================================================
// استخلاص بيانات التأكيد بالذكاء الاصطناعي (Gemini) — رؤية مباشرة على ملف الـPDF، فيقرأ أي
// تنسيق مورد بدقة عالية (بديل موثوق للـregex الذي يفشل مع اختلاف التنسيقات). مفتاحان
// يُستخدمان بالتبادل: نبدأ بمفتاح مختلف كل مرة لتوزيع الحمل، وعند فشل/انتهاء أحدهما نجرّب الآخر.
// ==========================================================
// ملاحظة على bookings[]: أغلب التأكيدات حجز واحد ⇐ مصفوفة بعنصر واحد. بعض الموردين (مثال:
// تأكيد بجدول له عدة صفوف RSV#، كل صف بتواريخ/غرف/سعر مستقلة تحت رقم تأكيد رئيسي واحد Res.
// No) يضعون أكثر من حجز في نفس المستند — لكل صف عنصر خاص به في bookings.
var TG_GEMINI_PROMPT_ =
  'أنت خبير في قراءة تأكيدات حجوزات الفنادق (بأي تنسيق: عربي/إنجليزي، جدول أو نص). ' +
  'استخرج بيانات الحجز/الحجوزات من هذا الملف وأعد JSON فقط بلا أي شرح، بهذا الشكل بالضبط:\n' +
  '{"resNo":"الرقم الرئيسي للتأكيد ككل إن وُجد (مثل Res. No)، وإلا فراغ",' +
  '"bookings":[{"hotel":"اسم الفندق","hotelRef":"رقم حجز/تأكيد هذا الصف تحديدًا كنص (مثل RSV#/Conf#) إن وُجد رقم خاص به، وإلا فراغ — لا تكرّر resNo هنا",' +
  '"city":"مكة أو المدينة أو فراغ","checkIn":"yyyy-MM-dd","checkOut":"yyyy-MM-dd","nights":عدد الليالي رقم,' +
  '"doubles":عدد الغرف الثنائية,"triples":عدد الغرف الثلاثية,"quads":عدد الغرف الرباعية,"quints":عدد الغرف الخماسية,' +
  '"total":الإجمالي رقم,"currency":"العملة",' +
  '"costDouble":تكلفة الغرفة الثنائية لليلة,"costTriple":تكلفة الثلاثية لليلة,"costQuad":تكلفة الرباعية لليلة,"costQuint":تكلفة الخماسية لليلة}]}\n' +
  'قواعد مهمة: (1) لو احتوى المستند على أكثر من حجز فعلي (جدول له عدة صفوف بيانات، كل صف بتواريخ دخول/خروج أو عدد غرف مستقل عن الصفوف الأخرى) أعد كل صف كعنصر منفصل في bookings — لا تدمجها في عنصر واحد. مستند بحجز واحد فقط ⇐ bookings بعنصر واحد. ' +
  '(2) رقم حجز الفندق لكل صف (hotelRef) غالبًا بجانب Reserv/Conf/Voucher/No/رقم الحجز الخاص بذلك الصف تحديدًا — لا تخلطه أبدًا مع الإجمالي أو رقم التأكيد الرئيسي (resNo) أو أي رقم آخر؛ لو لم يكن لصف معيّن رقم خاص به مذكور بجانبه اترك hotelRef له فارغًا تمامًا (لا تخترع رقمًا ولا تكرّر resNo داخل hotelRef). ' +
  '(3) عدد الغرف هو عدد الغرف من كل نوع فقط لهذا الصف — لا تأخذ أرقامًا أخرى (أفراد/أسعار/أرقام صفوف). ' +
  '(4) total لكل صف يجب أن يكون إجمالي ذلك الصف شامل الضريبة (ابحث عن Total Net Value أو Net Total With Tax أو Grand Total لذلك الصف تحديدًا — لا Net Total/Accommodation Charge وحدهما فهما غالبًا قبل الضريبة؛ لو كان الإجمالي مذكورًا لكل صف في عمود Total Price بجدول، استخدمه هو). ' +
  '(5) تكلفة الغرفة الواحدة لليلة لكل صف: احسبها دائمًا بنفسك = total (لذلك الصف) ÷ عدد ليالي ذلك الصف ÷ إجمالي عدد غرف ذلك الصف، ولا تنسخ أي عمود Rate/سعر مطبوع في المستند حتى لو بدا واضحًا — هذا العمود غالبًا لا يشمل الضريبة فيكون أقل من القيمة الصحيحة. استخدم عمود Rate فقط لو تعذّر حساب total كليًا. ' +
  '(6) استخدم تواريخ الدخول/الخروج الفعلية لكل صف لا تاريخ الطباعة أو الإصدار. ' +
  '(7) أي حقل غير موجود اجعله "" أو 0.';
function tgGeminiExtract_(blob) {
  var keys = tgGeminiKeys_();
  if (!keys.length) return null; // لا مفاتيح مضبوطة ⇒ لا ذكاء اصطناعي (يرجع للاستخلاص اليدوي)
  var cache = null; try { cache = CacheService.getScriptCache(); } catch (e) {}
  var start = 0;
  try { start = parseInt((cache && cache.get('gem_rr')) || '0', 10) % keys.length; } catch (e2) {}
  if (isNaN(start) || start < 0) start = 0;
  try { if (cache) cache.put('gem_rr', String(start + 1), 21600); } catch (e3) {}
  var ordered = keys.slice(start).concat(keys.slice(0, start)); // ترتيب متبادل
  // camelCase (inlineData/mimeType) هي الصيغة الموثّقة لواجهة Generative Language REST — الصيغة
  // snake_case كانت سببًا محتملاً للفشل الصامت والرجوع للاستخلاص اليدوي
  var payload = JSON.stringify({
    contents: [{ parts: [
      { inlineData: { mimeType: blob.getContentType() || 'application/pdf', data: Utilities.base64Encode(blob.getBytes()) } },
      { text: TG_GEMINI_PROMPT_ }
    ] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  });
  for (var i = 0; i < ordered.length; i++) {
    try {
      var call = tgGeminiCall_(ordered[i], payload);
      if (!call.ok) { Logger.log('Gemini key#' + i + ': ' + call.msg); continue; }
      var body = call.body;
      var cand = body && body.candidates && body.candidates[0];
      var txt = cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
      if (!txt) { Logger.log('Gemini key#' + i + ' رد بلا نص من ' + call.model); continue; }
      var obj = JSON.parse(String(txt).replace(/^```json\s*|\s*```$/g, '').trim());
      return tgGeminiNormalizeMulti_(obj);
    } catch (eK) { Logger.log('Gemini key#' + i + ': ' + eK.message); }
  }
  return null; // كل المفاتيح فشلت ⇒ الرجوع للاستخلاص اليدوي
}
// يُرجع دومًا مصفوفة حجوزات (بعنصر واحد لمستند الحجز الواحد الاعتيادي، أو أكثر لمستند بجدول
// متعدد الصفوف) — رقم حجز فندق فارغ لأي صف بلا رقم خاص به يُعوَّض برقم التأكيد الرئيسي resNo
// (بدل تركه فارغًا تمامًا)، فتُتاح مطابقة/تحديث الحجوزات المتشابهة عبر نفس آلية اكتشاف تكرار
// رقم حجز الفندق الموجودة أصلًا — وهذا بالضبط ما يسمح بتكرار الرقم بين عدة صفوف بلا رقم خاص
function tgGeminiNormalizeMulti_(obj) {
  obj = obj || {};
  var resNo = String(obj.resNo || '').trim();
  var list = Array.isArray(obj.bookings) ? obj.bookings : (obj.hotel !== undefined ? [obj] : []); // توافق خلفي لصيغة كائن واحد
  if (!list.length) return [];
  return list.map(function (o) {
    var d = tgGeminiNormalize_(o);
    if (!d.hotelRef && resNo) d.hotelRef = resNo;
    return d;
  });
}
// اختبار مفتاح Gemini بنداء نصّي خفيف — يكشف الخطأ الفعلي (مفتاح غير صالح/نموذج غير موجود/تجاوز حد)
function tgGeminiPing_(key) {
  try {
    var payload = JSON.stringify({ contents: [{ parts: [{ text: 'رُدّ بكلمة OK فقط.' }] }], generationConfig: { temperature: 0 } });
    var call = tgGeminiCall_(key, payload);
    if (!call.ok) return { ok: false, msg: String(call.msg).slice(0, 200) };
    var cand = call.body.candidates && call.body.candidates[0];
    var txt = cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
    return { ok: true, model: call.model, msg: 'يعمل ✓ (' + call.model + ')' + (txt ? (' — رد: ' + String(txt).trim().slice(0, 20)) : '') };
  } catch (e) { return { ok: false, msg: e.message }; }
}
// يُستدعى من زر "اختبار المفاتيح" في الإعدادات (مدير فقط)
function testGeminiKeys(token) {
  try {
    requireAdmin_(token);
    var p = PropertiesService.getScriptProperties();
    var defs = [{ n: 1, k: p.getProperty(GEMINI_PROP_KEY1_) || '' }, { n: 2, k: p.getProperty(GEMINI_PROP_KEY2_) || '' }];
    var results = defs.map(function (it) {
      if (!it.k) return { n: it.n, set: false };
      var r = tgGeminiPing_(it.k);
      return { n: it.n, set: true, ok: r.ok, msg: r.msg };
    });
    return { ok: true, model: tgGeminiModel_(), results: results };
  } catch (e) { return { ok: false, error: e.message }; }
}
// تحويل مخرجات Gemini لنفس شكل كائن d المستخدَم في المراجعة والتسجيل، مع تطبيع القيم
function tgGeminiNormalize_(o) {
  o = o || {};
  var num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n; };
  var isoDate = function (v) { var m = String(v || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? (m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2)) : ''; };
  var city = String(o.city || '').trim();
  city = /مدين|madin|medina/i.test(city) ? 'المدينة' : (/مك|makk|mecca/i.test(city) ? 'مكة' : '');
  var d = {
    hotel: String(o.hotel || '').trim(),
    hotelRef: String(o.hotelRef || o.hotel_ref || '').trim(),
    city: city,
    checkIn: isoDate(o.checkIn), checkOut: isoDate(o.checkOut),
    doubles: Math.round(num(o.doubles)), triples: Math.round(num(o.triples)),
    quads: Math.round(num(o.quads)), quints: Math.round(num(o.quints)),
    total: num(o.total), nights: Math.round(num(o.nights)), perNight: '',
    costDouble: num(o.costDouble) || '', costTriple: num(o.costTriple) || '',
    costQuad: num(o.costQuad) || '', costQuint: num(o.costQuint) || ''
  };
  if (!d.nights && d.checkIn && d.checkOut) {
    d.nights = Math.max(0, Math.round((new Date(d.checkOut).getTime() - new Date(d.checkIn).getTime()) / 86400000));
  }
  var totalRooms = d.doubles + d.triples + d.quads + d.quints;
  // التكلفة/الليلة تُحسَب دائمًا من الإجمالي (شامل الضريبة) ÷ الليالي ÷ الغرف، حتى لو أعاد
  // النموذج قيمة "صريحة" — عمود Rate المطبوع بالمستند غالبًا لا يشمل الضريبة (لاحظنا هذا
  // فعليًا: مستند بإجمالي 6300 شامل الضريبة و10 ليالٍ و9 غرف صحيحه 70، لكن النموذج نسخ Rate
  // المطبوع 60.87 وهو الإجمالي *قبل* الضريبة ÷ نفس المقام) — فتجاهل قيمة النموذج المباشرة
  // هنا أوثق من الوثوق بها. نُبقي على قيمة النموذج فقط لو تعذّر حساب total كليًا.
  if (d.total && d.nights && totalRooms) {
    var per = Math.round((d.total / (d.nights * totalRooms)) * 100) / 100;
    if (d.doubles) d.costDouble = per; if (d.triples) d.costTriple = per;
    if (d.quads) d.costQuad = per; if (d.quints) d.costQuint = per;
  }
  return d;
}

// ---- استخلاص البيانات من نص التأكيد (أفضل جهد؛ المراجعة الإلزامية تصحّح أي خطأ) ----
// كل التواريخ مع مواضعها في النص — يُستخدَم لالتقاط تاريخ بعد وسم محدَّد (Check-in/out) ولترجيح
// الزوج الصحيح بعدد الليالي، بدل التخمين الأعمى بأصغر/أكبر تاريخ
function tgConfDateMatches_(s) {
  var mon = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var out = [], m;
  var add = function (idx, d, mo, y) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2020 || y > 2099) return;
    out.push({ idx: idx, iso: y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0') });
  };
  var re1 = /(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g; while ((m = re1.exec(s))) add(m.index, +m[3], +m[2], +m[1]);
  var re2 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/g; while ((m = re2.exec(s))) add(m.index, +m[1], +m[2], +m[3]);
  var re3 = /(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(20\d{2})/g; while ((m = re3.exec(s))) { var a = mon[m[2].toLowerCase().slice(0, 3)]; if (a) add(m.index, +m[1], a, +m[3]); }
  var re4 = /([A-Za-z]{3,9})[\s\-](\d{1,2})[\s\-,]+(20\d{2})/g; while ((m = re4.exec(s))) { var b = mon[m[1].toLowerCase().slice(0, 3)]; if (b) add(m.index, +m[2], b, +m[3]); }
  return out;
}
function tgConfFindDates_(text) { // توقيع قديم: قائمة تواريخ فريدة مرتَّبة (تُبقي الاختبارات القائمة)
  var seen = {}; tgConfDateMatches_(text).forEach(function (x) { seen[x.iso] = true; });
  return Object.keys(seen).sort();
}
// أول تاريخ يلي وسمًا محدَّدًا (ضمن ~35 حرفًا بعده) — للدخول/الخروج المعنونَين
function tgConfDateAfter_(text, labelSrc) {
  var re = new RegExp('(?:' + labelSrc + ')', 'i');
  var m = re.exec(text);
  if (!m) return '';
  var start = m.index + m[0].length;
  var ms = tgConfDateMatches_(text.slice(start, start + 35));
  if (!ms.length) return '';
  ms.sort(function (a, b) { return a.idx - b.idx; });
  return ms[0].iso;
}
// رقم يلي وسمًا مباشرةً (يُسمح فقط بعلامات ترقيم/مسافات بين الوسم والرقم) — دقيق ويتجنّب
// التقاط رقم عمود مجاور خاطئ
function tgConfNumAfter_(text, labelSrc) {
  var re = new RegExp('(?:' + labelSrc + ')\\s*[:#\\.\\-=]?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)', 'i');
  var m = text.match(re);
  return m ? (parseFloat(String(m[1]).replace(/,/g, '')) || 0) : 0;
}
// عدد الغرف بالأنواع: يعتمد على وسم QTY/Room/عدد الغرف (السلطة على العدد) + نوع الغرفة
// (Quad→رباعي...). نوع واحد ⇒ يأخذ عدد QTY. عدة أنواع ⇒ لكل نوع العدد المجاور له في سطره.
function tgConfFindRooms_(text) {
  var rooms = { doubles: 0, triples: 0, quads: 0, quints: 0 };
  var typeSpecs = [
    { k: 'quints', re: /quint|quintuple|خماسي/i },
    { k: 'quads', re: /quad|quadruple|رباعي/i },
    { k: 'triples', re: /triple|ثلاثي/i },
    { k: 'doubles', re: /double|\bdbl\b|twin|ثنائي|دبل|مزدوج/i }
  ];
  // "عدد الغرف": QTY / No of rooms / Rooms count / Room (وليس Room Type) / عدد الغرف
  var qty = tgConfNumAfter_(text, 'qty|q\\.?ty|no\\.?\\s*of\\s*rooms?|number\\s*of\\s*rooms?|rooms?\\s*count|\\broom(?:s)?\\b(?!\\s*type)|عدد\\s*الغرف');
  var perType = {};
  String(text || '').split(/[\n\r]+/).forEach(function (line) {
    typeSpecs.forEach(function (t) {
      if (!t.re.test(line) || perType[t.k] !== undefined) return;
      var nums = line.match(/\b(\d{1,3})\b/g);
      var c = nums ? parseInt(nums[0], 10) : 0;
      perType[t.k] = (c >= 1 && c <= 200) ? c : 0;
    });
  });
  var types = Object.keys(perType);
  if (types.length === 1) {
    rooms[types[0]] = qty || perType[types[0]] || 1;          // نوع وحيد ⇒ عدد QTY هو الأدق
  } else if (types.length > 1) {
    types.forEach(function (k) { rooms[k] = perType[k] || 1; }); // عدة أنواع ⇒ العدد المجاور لكل نوع
  } else if (qty) {
    rooms.quads = qty;                                         // عدد بلا نوع ⇒ رباعي مبدئيًا (قابل للتعديل)
  }
  return rooms;
}
// رقم حجز/تأكيد الفندق: من وسم صريح (Res.No / Reserv No / Conf No / Voucher / Booking / رقم الحجز)
function tgConfFindRef_(text) {
  var label = '(?:res(?:erv(?:ation)?)?\\.?\\s*(?:no|number|#)?|conf(?:irm(?:ation)?)?\\.?\\s*(?:no|number|#)?|voucher\\s*(?:no|#)?|booking\\s*(?:no|id|ref|#)?|رقم\\s*(?:الحجز|التأكيد|التاكيد))';
  var m = text.match(new RegExp(label + '\\s*[:#\\.\\-]?\\s*([A-Za-z]{0,4}\\d{3,12}[A-Za-z0-9\\-\\/]{0,6})', 'i'));
  if (m && m[1]) return m[1].trim();
  // القراءة الضوئية لمستند فيه عربية تقلب أحيانًا ترتيب الخلية فيسبق الرقمُ الوسمَ ("47511 Reserv No")
  m = text.match(new RegExp('(\\d{3,12})\\s*' + label, 'i'));
  return m && m[1] ? m[1].trim() : '';
}
// اسم الفندق: نفضّل "Hotel Name" ثم "Hotel"، ونقطع عند بداية عمود آخر شائع كي لا نلتقط اسم الشركة
function tgConfFindHotel_(text) {
  var m = text.match(/hotel\s*name\s*[:\-]\s*([^\n\r]{2,50})/i) ||
    text.match(/(?:^|\n)\s*hotel\s*[:\-]\s*([^\n\r]{2,50})/i) ||
    text.match(/(?:اسم\s*الفندق|الفندق)\s*[:\-]?\s*([^\n\r]{2,50})/);
  if (!m) return '';
  // نقطع عند فجوة عمود (مسافتان أو أكثر) لأن OCR يفصل الأعمدة بمسافات متعددة (فلا نلتقط المدينة
  // أو عمودًا مجاورًا)، ثم نزيل أي وسم عمود لاحق التصق بلا فجوة
  var v = String(m[1]).split(/\s{2,}/)[0].trim();
  return v.replace(/\s*(room\s*type|check[\s\-]?in|check[\s\-]?out|res\.?\s*no|conf|nights?|qty|rate|total|makkah|madinah|مكة|المدينة).*$/i, '').trim();
}
// اسم فندق بالإنجليزية يرد كسطر مستقل ينتهي بكلمة Hotel ("Maysan Al Moltazim Hotel") — شائع
// في التأكيدات التي يرد فيها اسم الفندق داخل خلية الجدول بالعربية والاسم الإنجليزي تحتها.
// نستبعد أسطر ترويسة الشركة (Hotel في وسط السطر مثل "… for Hotel Management & Operations")
function tgConfFindHotelLine_(text) {
  var lines = String(text || '').split(/[\n\r]+/), best = '';
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim();
    if (!/^[A-Za-z][A-Za-z\s\-'&.]{2,40}\s+hotels?$/i.test(l)) continue;
    if (/management|operations|group|company|travel|tourism/i.test(l)) continue;
    if (!best || l.length > best.length) best = l;
  }
  return best;
}
function tgConfCity_(text) {
  if (/مكة|مكه|makk|mecca/i.test(text)) return 'مكة';
  if (/المدين|madin|medina/i.test(text)) return 'المدينة';
  return '';
}
// ---- قراءة صف جدول التأكيد بالتحقق الحسابي (الأدق: لا تخمين بالترتيب ولا بالقرب) ----
// فقرات "الشروط والأحكام" في تأكيدات الفنادق مليئة بكلمات أنواع الغرف وأرقام تبدو كبيانات حجز
// ("Triple and Quad occupancy will be through extra bed"، "Check in after 16:00 hours") — قراءتها
// كانت تُنتج غرفًا وتواريخ وهمية، فنقطع النص عند أول عنوان منها قبل أي استخلاص
function tgConfStripBoilerplate_(text) {
  var s = String(text || '');
  var m = s.match(/(terms?\s*(?:&|and)?\s*conditions?|our\s+bank\s+account|bank\s+details|benificiary|beneficiary|الشروط\s*والأحكام|الشروط\s*والاحكام|بيانات\s*البنك|الحساب\s*البنكي)/i);
  return m ? s.slice(0, m.index) : s;
}
var TG_CONF_TYPE_SPECS_ = [
  { k: 'quints', re: /quint|quintuple|خماسي/i },
  { k: 'quads', re: /quad|quadruple|رباعي/i },
  { k: 'triples', re: /triple|ثلاثي/i },
  { k: 'doubles', re: /double|\bdbl\b|twin|ثنائي|دبل|مزدوج/i }
];
function tgConfRowType_(line) {
  for (var i = 0; i < TG_CONF_TYPE_SPECS_.length; i++) {
    if (TG_CONF_TYPE_SPECS_[i].re.test(line)) return TG_CONF_TYPE_SPECS_[i].k;
  }
  return '';
}
// أرقام السطر بعد إزالة التواريخ والأوقات — وإلا قُرِئت أجزاؤها (16 من 16/09) كعدد غرف أو سعر
function tgConfRowNumbers_(line) {
  var s = String(line || '')
    .replace(/\d{1,4}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}/g, ' ')
    .replace(/\d{1,2}\s*[A-Za-z]{3,9}\s*,?\s*20\d{2}/g, ' ')
    .replace(/\d{1,2}:\d{2}/g, ' ');
  var out = [], m, re = /\d[\d,]*(?:\.\d+)?/g;
  while ((m = re.exec(s))) {
    var v = parseFloat(m[0].replace(/,/g, ''));
    if (!isNaN(v)) out.push(v);
  }
  return out;
}
// خلية اسم الفندق داخل صف الجدول: أطول تتابع عربي في الصف (بقية خلاياه أرقام وتواريخ ووسوم
// إنجليزية) — يُستخدَم فقط لو لم يُطابَق اسمٌ مسجَّل في الشيت
function tgConfRowHotel_(blob) {
  var best = '', m, re = /[ء-ي][ء-ي\sـ\-]{2,60}/g;
  while ((m = re.exec(String(blob || '')))) {
    var v = m[0].replace(/\s+/g, ' ').trim();
    TG_CONF_TYPE_SPECS_.forEach(function (t) { v = v.replace(t.re, '').trim(); });
    v = v.replace(/^[\-\s]+|[\-\s]+$/g, '');
    if (v.length > best.length) best = v;
  }
  return best.length >= 3 ? best : '';
}
// من أرقام الصف: أي ثلاثية (عدد غرف × ليالٍ × سعر = إجمالي) تتحقق حسابيًا هي القراءة الصحيحة.
// هذا ما يفصل الأرقام الحقيقية عن جيرانها في نفس الصف (رقم الحجز، رقم الوجبات، الأصفار) بلا
// اعتماد على ترتيب الأعمدة — فيعمل مع تنسيقات فنادق مختلفة (العدد قبل النوع أو بعده) سواءً
function tgConfSolveRow_(nums, nights) {
  if (!nights || nights < 1) return null;
  var best = null;
  for (var q = 0; q < nums.length; q++) {
    var rooms = nums[q];
    if (rooms < 1 || rooms > 500 || Math.round(rooms) !== rooms) continue;
    for (var r = 0; r < nums.length; r++) {
      if (r === q) continue;
      var rate = nums[r];
      if (rate <= 0) continue;
      for (var t = 0; t < nums.length; t++) {
        if (t === q || t === r) continue;
        var total = nums[t];
        if (total < rate) continue;
        var tol = Math.max(1, total * 0.02);   // هامش تقريب/ضريبة بسيط
        if (Math.abs(rooms * nights * rate - total) > tol) continue;
        if (!best || total > best.total) best = { rooms: rooms, rate: rate, total: total };
      }
    }
  }
  return best;
}
// صفوف جدول التأكيد: كل صف = نوع غرفة + تاريخا دخول/خروج + أرقامه. الصف قد يرد في سطر واحد
// أو موزَّعًا على سطرين/ثلاثة (شائع مع القراءة الضوئية)، فنجرّب أضيق نافذة تُعطي حلاً حسابيًا
function tgConfParseRows_(text) {
  var lines = String(text || '').split(/[\n\r]+/).map(function (l) { return l.trim(); }).filter(Boolean);
  var scan = function (requireSolve) {
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var hit = null;
      for (var w = 1; w <= 3 && i + w <= lines.length && !hit; w++) {
        var blob = lines.slice(i, i + w).join(' ');
        var type = tgConfRowType_(blob);
        if (!type) continue;
        var iso = [];
        tgConfDateMatches_(blob).forEach(function (x) { if (iso.indexOf(x.iso) === -1) iso.push(x.iso); });
        if (iso.length < 2) continue;
        iso.sort();
        var checkIn = iso[0], checkOut = iso[iso.length - 1];
        var nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
        if (nights < 1 || nights > 400) continue;
        var nums = tgConfRowNumbers_(blob);
        var sol = tgConfSolveRow_(nums, nights);
        if (!sol && requireSolve) continue;
        var rooms = sol ? sol.rooms : 0;
        for (var n = 0; !rooms && n < nums.length; n++) {
          if (nums[n] >= 1 && nums[n] <= 200 && Math.round(nums[n]) === nums[n]) rooms = nums[n];
        }
        hit = { type: type, rooms: rooms || 1, nights: nights, checkIn: checkIn, checkOut: checkOut,
          rate: sol ? sol.rate : 0, total: sol ? sol.total : 0, span: w, hotel: tgConfRowHotel_(blob) };
      }
      if (hit) { rows.push(hit); i += hit.span - 1; }
    }
    return rows;
  };
  var solved = scan(true);
  return solved.length ? solved : scan(false);
}
// الإجمالي المطلوب للتسجيل هو الشامل للضريبة — تُجرَّب وسومه أولاً ثم الإجماليات الأخرى، كلٌّ
// في نداء مستقل حتى لا يسبق وسمٌ أقل أولوية وسمًا أعلى لمجرد وروده أولاً في النص
function tgConfTotalWithTax_(text) {
  return tgConfNumAfter_(text, 'net\\s*total\\s*with\\s*tax|total\\s*net\\s*value|grand\\s*total|total\\s*with\\s*tax|الاجمالي\\s*شامل|الإجمالي\\s*شامل')
    || tgConfNumAfter_(text, 'net\\s*total|net\\s*accommodation\\s*charge|total\\s*amount|اجمالي\\s*التكلفة|إجمالي\\s*التكلفة|صافي\\s*الاجمالي|صافي\\s*الإجمالي')
    || 0;
}
function tgConfExtract_(rawText) {
  var full = tgNormalizeDigits_(String(rawText || ''));
  var text = tgConfStripBoilerplate_(full);   // بلا فقرات الشروط والأحكام (مصدر أرقام وهمية)
  var out = { hotel: '', hotelRef: '', checkIn: '', checkOut: '', city: '',
    doubles: 0, triples: 0, quads: 0, quints: 0, total: 0, nights: 0, perNight: '',
    costDouble: '', costTriple: '', costQuad: '', costQuint: '' };

  // --- رقم حجز الفندق (وسم صريح) ---
  out.hotelRef = tgConfFindRef_(text);

  // --- المسار الأساسي: صفوف جدول الحجز (نوع + تاريخان + أرقام متحقَّقة حسابيًا) ---
  var rows = tgConfParseRows_(text);
  var rowsTotal = 0;
  if (rows.length) {
    var ins = [], outs = [];
    rows.forEach(function (r) {
      out[r.type] += r.rooms;
      ins.push(r.checkIn); outs.push(r.checkOut);
      rowsTotal += r.total;
    });
    ins.sort(); outs.sort();
    out.checkIn = ins[0]; out.checkOut = outs[outs.length - 1];
  } else {
    // --- الاحتياطي: وسوم مفردة (عدد الليالي، الدخول/الخروج، QTY/نوع الغرفة) ---
    var nights = tgConfNumAfter_(text, '\\bnts\\b|no\\.?\\s*of\\s*nights?|nights?|ليالي|الليالي|عدد\\s*الليالي');
    var ci = tgConfDateAfter_(text, 'check\\s*[\\-\\s]?in|arrival|arriv|تاريخ\\s*الدخول|الدخول|\\bدخول\\b');
    var co = tgConfDateAfter_(text, 'check\\s*[\\-\\s]?out|departure|depart|تاريخ\\s*الخروج|الخروج|\\bخروج\\b');
    if (ci && co && ci < co) { out.checkIn = ci; out.checkOut = co; }
    var allDates = tgConfFindDates_(text);
    if ((!out.checkIn || !out.checkOut) && nights && allDates.length >= 2) {
      for (var a = 0; a < allDates.length && !out.checkIn; a++) {
        for (var b = a + 1; b < allDates.length; b++) {
          var diff = Math.round((new Date(allDates[b]).getTime() - new Date(allDates[a]).getTime()) / 86400000);
          if (diff === nights) { out.checkIn = allDates[a]; out.checkOut = allDates[b]; break; }
        }
      }
    }
    if ((!out.checkIn || !out.checkOut) && allDates.length >= 2) { out.checkIn = allDates[0]; out.checkOut = allDates[allDates.length - 1]; }
    else if (!out.checkIn && allDates.length === 1) { out.checkIn = allDates[0]; }
    var rr = tgConfFindRooms_(text);
    out.doubles = rr.doubles; out.triples = rr.triples; out.quads = rr.quads; out.quints = rr.quints;
    if (nights && !out.checkOut) out.nights = nights;
  }
  if (out.checkIn && out.checkOut) {
    out.nights = Math.max(0, Math.round((new Date(out.checkOut).getTime() - new Date(out.checkIn).getTime()) / 86400000));
  }

  // --- الإجمالي: الشامل للضريبة أولاً (هو ما يُسجَّل كتكلفة)، وإلا مجموع صفوف الجدول ---
  var labeledTotal = tgConfTotalWithTax_(text);
  out.total = labeledTotal || rowsTotal || 0;
  // وسم التقط رقمًا أصغر من مجموع الصفوف نفسه ⇒ الوسم أصاب عمودًا جزئيًا، فالمجموع أوثق
  if (labeledTotal && rowsTotal && labeledTotal < rowsTotal * 0.9) out.total = rowsTotal;

  // --- سعر الغرفة/الليلة = الإجمالي (شامل الضريبة) ÷ الليالي ÷ عدد الغرف ---
  var totalRooms = out.doubles + out.triples + out.quads + out.quints;
  var perNight = (out.total && out.nights && totalRooms) ? (out.total / (out.nights * totalRooms)) : 0;
  if (!perNight && rows.length && rows[0].rate) perNight = rows[0].rate;
  out.perNight = perNight ? Math.round(perNight * 100) / 100 : '';
  if (out.perNight) {
    if (out.doubles) out.costDouble = out.perNight;
    if (out.triples) out.costTriple = out.perNight;
    if (out.quads) out.costQuad = out.perNight;
    if (out.quints) out.costQuint = out.perNight;
  }

  var rowHotel = rows.length ? (rows[0].hotel || '') : '';
  out.hotel = tgGuessHotel_(text) || rowHotel || tgConfFindHotel_(text) || tgConfFindHotelLine_(text);
  out.city = tgGuessCity_(text) || tgConfCity_(text);
  return out;
}

// تُطبَّع نتيجة tgGeminiExtract_ دومًا لمصفوفة (حتى لو أعاد كائنًا واحدًا من مصدر قديم/اختبار) —
// دفاعية بسيطة لا تُغيِّر أي سلوك عند مصفوفة صحيحة أصلًا
function tgGeminiResultAsArray_(res) {
  if (!res) return [];
  return Array.isArray(res) ? res : [res];
}
// نقطة الدخول: استقبال مستند PDF من الموظف — يبدأ التدفق فورًا (المعالجة متزامنة داخل نفس
// تنفيذ الويب هوك؛ حارس tgSeenUpdate_ يمنع تكرار المعالجة عند أي إعادة تسليم من تليجرام)
// يشغّل محرّك استخلاص على blob جاهز — 'ai' الذكاء الاصطناعي فقط، 'manual' القراءة الضوئية
// + الاستخلاص اليدوي فقط، أو 'auto' (الافتراضي عند أول رفع): AI أولًا ثم يدوي عند فشله.
// مُستخرَجة في دالة مستقلة ليعيد استخدامها زر "إعادة الاستخلاص" لاحقًا على نفس الملف. تُرسل
// رسائل الخطأ للمستخدم مباشرة وتُعيد null عند الفشل، أو {d, engine, queue} عند النجاح —
// queue = بقية الحجوزات المستخلَصة من نفس المستند (فارغة إلا لو احتوى المستند أكثر من حجز
// واحد واستُخلص بالذكاء الاصطناعي؛ المحرّك اليدوي دومًا حجز واحد فقط لكل مستند حاليًا)
function tgOcrExtractWith_(chatId, blob, engineWanted) {
  if (engineWanted === 'ai') {
    var listAi = [];
    try { listAi = tgGeminiResultAsArray_(tgGeminiExtract_(blob)); } catch (eAI) { Logger.log('tgGeminiExtract_ (إعادة): ' + eAI.message); }
    if (!listAi.length) { tgSendTo_(chatId, '⚠️ تعذّر الاستخلاص بالذكاء الاصطناعي (تحقّق من مفاتيح Gemini بالإعدادات) — لم يتغيّر شيء.'); return null; }
    return { d: listAi[0], engine: 'ai', queue: listAi.slice(1) };
  }
  if (engineWanted === 'manual') {
    var text1 = '';
    try { text1 = tgOcrPdfToText_(blob); }
    catch (e1) { tgSendTo_(chatId, '⛔ تعذّرت القراءة الضوئية: ' + tgEsc_(e1.message)); return null; }
    if (!text1 || text1.replace(/\s/g, '').length < 12) { tgSendTo_(chatId, '⚠️ لم أتمكن من قراءة نص واضح من الملف.'); return null; }
    return { d: tgConfExtract_(text1), engine: 'ocr', queue: [] };
  }
  // auto: الذكاء الاصطناعي أولًا (رؤية مباشرة على الملف) — الأدق مهما اختلف تنسيق المورد
  var list = [], engine = '';
  try { list = tgGeminiResultAsArray_(tgGeminiExtract_(blob)); if (list.length) engine = 'ai'; } catch (eAI2) { Logger.log('tgGeminiExtract_: ' + eAI2.message); }
  if (!list.length) {
    // احتياطي: قراءة ضوئية (Drive OCR) ثم استخلاص يدوي بالقواعد — عند غياب المفاتيح أو فشل الذكاء الاصطناعي
    var text2 = '';
    try { text2 = tgOcrPdfToText_(blob); }
    catch (e2) { tgSendTo_(chatId, '⛔ تعذّرت قراءة التأكيد: ' + tgEsc_(e2.message) + '\nجرّب إرسال ملف أوضح، أو سجّل الحجز يدويًا بأمر <code>/حجز</code>.'); return null; }
    if (!text2 || text2.replace(/\s/g, '').length < 12) {
      tgSendTo_(chatId, '⚠️ لم أتمكن من قراءة نص واضح من الملف (قد تكون جودة المسح ضعيفة). سجّل الحجز يدويًا بأمر <code>/حجز</code>، أو أرسل صورة/ملفًا أوضح.');
      return null;
    }
    list = [tgConfExtract_(text2)];
    engine = 'ocr';
  }
  return { d: list[0], engine: engine, queue: list.slice(1) };
}
// يضمن نوع المحتوى الصحيح على الـBlob (تنزيل تليجرام قد يعيده octet-stream) — مهم لـGemini/OCR
function tgOcrFixBlobType_(blob, meta) {
  try {
    var bt = (blob.getContentType() || '').toLowerCase();
    if (meta.isPdf && bt.indexOf('pdf') < 0) blob.setContentType('application/pdf');
    else if (meta.isImg && bt.indexOf('image') < 0) blob.setContentType(meta.mime && meta.mime.indexOf('image') >= 0 ? meta.mime : 'image/jpeg');
  } catch (eCt) {}
  return blob;
}
function tgHandleConfirmationDoc_(chatId, from, doc, chatType) {
  var ctx = tgRequire_(from.id, 'newbooking'); // تسجيل حجز = صلاحية "تسجيل حجز جديد"
  var name = (doc.file_name || '').toLowerCase();
  var mime = (doc.mime_type || '').toLowerCase();
  var isPdf = mime.indexOf('pdf') >= 0 || /\.pdf$/.test(name);
  var isImg = mime.indexOf('image') >= 0 || /\.(jpe?g|png|webp|heic|tiff?|bmp|gif)$/.test(name);
  if (!isPdf && !isImg) {
    tgSendTo_(chatId, 'ℹ️ أرسل تأكيد الفندق كملف <b>PDF</b> أو <b>صورة</b> لأقرأه تلقائيًا.');
    return;
  }
  tgAnnounceIfGroup_(chatId, chatType, from, '📄 قراءة تأكيد فندق');
  tgSendTo_(chatId, '⏳ جارِ قراءة التأكيد واستخلاص البيانات… قد يستغرق بضع ثوانٍ.');
  var meta = { fileId: doc.file_id, isPdf: isPdf, isImg: isImg, mime: mime };
  var blob;
  try { blob = tgTelegramFileBlob_(doc.file_id); }
  catch (e) { tgSendTo_(chatId, '⛔ تعذّر تنزيل الملف: ' + tgEsc_(e.message)); return; }
  tgOcrFixBlobType_(blob, meta);

  var res = tgOcrExtractWith_(chatId, blob, 'auto');
  if (!res) return;
  // نحفظ معرّف الملف (لا الـBlob نفسه — لا يُخزَّن في الجلسة) لإتاحة "إعادة الاستخلاص" لاحقًا
  // بمحرّك آخر على نفس الملف بلا حاجة لإعادة إرساله؛ رابط تنزيل تليجرام صالح نحو ساعة، يكفي
  // مدة المراجعة العادية
  var queue = res.queue || [];
  var sessData = { d: res.d, engine: res.engine, docMeta: meta, queue: queue, queueIndex: 1, queueTotal: 1 + queue.length };
  tgSetSession_(chatId, from.id, 'ocrbk', 'review', sessData);
  if (queue.length) tgSendTo_(chatId, 'ℹ️ وجدت <b>' + sessData.queueTotal + '</b> حجوزات في هذا الملف — سأعرضها واحدًا تلو الآخر للمراجعة والتسجيل.');
  tgOcrShowReview_(chatId, sessData);
}
// إعادة الاستخلاص على نفس الملف بمحرّك آخر (بعد استخلاص أوّلي غير دقيق) — يُعيد تنزيل الملف
// من تليجرام بمعرّفه المحفوظ في الجلسة بدل الاعتماد على Blob مخزَّن (الجلسات نفسها نصية/JSON)
function tgOcrReextract_(chatId, from, sess, engineWanted) {
  var meta = sess.data.docMeta;
  if (!meta || !meta.fileId) { tgSendTo_(chatId, '⛔ تعذّرت إعادة القراءة — أعد إرسال الملف من جديد.'); return; }
  tgSendTo_(chatId, '⏳ جارِ إعادة الاستخلاص ' + (engineWanted === 'ai' ? 'بالذكاء الاصطناعي' : 'يدويًا') + '...');
  var blob;
  try { blob = tgTelegramFileBlob_(meta.fileId); }
  catch (e) { tgSendTo_(chatId, '⛔ تعذّر تنزيل الملف: ' + tgEsc_(e.message) + ' — أعد إرساله من جديد.'); return; }
  tgOcrFixBlobType_(blob, meta);
  var res = tgOcrExtractWith_(chatId, blob, engineWanted);
  if (!res) { tgOcrShowReview_(chatId, sess.data); return; }
  // إعادة الاستخلاص تُعيد بناء طابور الحجوزات من الصفر (يستبدل أي طابور سابق كان معلَّقًا) —
  // العميل/المورد المحسومان سابقًا يُبقَيان كافتراض معقول لكل حجوزات نفس الملف
  var queue = res.queue || [];
  var sessData = { d: res.d, engine: res.engine, docMeta: meta, clientName: sess.data.clientName, supplier: sess.data.supplier,
    queue: queue, queueIndex: 1, queueTotal: 1 + queue.length };
  tgSetSession_(chatId, from.id, 'ocrbk', 'review', sessData);
  if (queue.length) tgSendTo_(chatId, 'ℹ️ وجدت <b>' + sessData.queueTotal + '</b> حجوزات في هذا الملف — سأعرضها واحدًا تلو الآخر.');
  tgOcrShowReview_(chatId, sessData);
}

function tgOcrRoomsTxt_(d) {
  return [d.doubles > 0 ? (d.doubles + ' دبل') : '', d.triples > 0 ? (d.triples + ' ثلاثي') : '',
    d.quads > 0 ? (d.quads + ' رباعي') : '', d.quints > 0 ? (d.quints + ' خماسي') : ''
  ].filter(Boolean).join(' · ') || '—';
}
function tgOcrCostTxt_(d) {
  var lbl = { costDouble: 'دبل', costTriple: 'ثلاثي', costQuad: 'رباعي', costQuint: 'خماسي' };
  var parts = ['costDouble', 'costTriple', 'costQuad', 'costQuint'].filter(function (k) { return d[k] !== '' && d[k] !== undefined && d[k] !== null; })
    .map(function (k) { return lbl[k] + ' ' + d[k]; });
  return parts.length ? parts.join('، ') + ' /ليلة' : '—';
}
// سعر البيع/الليلة — اختياري تمامًا، يُذكَر فقط لو سُجِّل فعلًا (عبر زر التكلفة "بيع رباعي 500
// تكلفة رباعي 430" أو التعديل الحر المجمَّع)؛ نص فارغ لا "—" حتى تُحذَف السطر كليًا لو لم يرد
function tgOcrSaleTxt_(d) {
  var lbl = { saleDouble: 'دبل', saleTriple: 'ثلاثي', saleQuad: 'رباعي', saleQuint: 'خماسي' };
  var parts = ['saleDouble', 'saleTriple', 'saleQuad', 'saleQuint'].filter(function (k) { return d[k] !== '' && d[k] !== undefined && d[k] !== null; })
    .map(function (k) { return lbl[k] + ' ' + d[k]; });
  return parts.length ? parts.join('، ') + ' /ليلة' : '';
}
function tgOcrFmtDate_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : (iso || '—');
}
// data = بيانات الجلسة الكاملة (d + engine + clientName/supplier إن سبق تحديدهما) — العميل
// والمورد يظهران هنا أيضًا فور تحديدهما (سواء بالتدفق الموجَّه أو بالتعديل الحر المجمَّع)
function tgOcrShowReview_(chatId, data) {
  var d = data.d, engine = data.engine;
  var badge = engine === 'ai' ? '🤖 بالذكاء الاصطناعي' : (engine === 'ocr' ? '🔍 قراءة ضوئية (احتياطي)' : '');
  var saleTxt = tgOcrSaleTxt_(d);
  var queueBadge = (data.queueTotal > 1) ? ('  📚 حجز ' + data.queueIndex + ' من ' + data.queueTotal) : '';
  var lines = [
    '📄 <b>مراجعة بيانات التأكيد المستخلَصة</b>' + (badge ? ('  <i>— ' + badge + '</i>') : '') + queueBadge,
    'راجع كل بند — عدّل أي حقل بزر، أو أرسل عدة بنود برسالة واحدة (كل بند بسطر "الحقل: القيمة"، مثال: <code>الفندق: ابراج الكسوة</code>) — يشمل العميل والمورد أيضًا.',
    '━━━━━━━━━━━━━━',
    '🏨 الفندق: ' + tgEsc_(d.hotel || '—'),
    '🏙 المدينة: ' + tgEsc_(d.city || '— (غير محدَّدة)'),
    '🔖 رقم حجز الفندق: ' + tgEsc_(d.hotelRef || '—'),
    '📅 الدخول: ' + tgEsc_(tgOcrFmtDate_(d.checkIn)) + '  ←  الخروج: ' + tgEsc_(tgOcrFmtDate_(d.checkOut)) +
      (d.nights ? ('  (' + d.nights + ' ليلة)') : ''),
    '🛏 الغرف: ' + tgEsc_(tgOcrRoomsTxt_(d)),
    '💰 تكلفة الغرفة/الليلة: ' + tgEsc_(tgOcrCostTxt_(d)) + (d.total ? ('  · الإجمالي المقروء: ' + d.total) : ''),
    saleTxt ? ('💵 سعر البيع/الليلة: ' + tgEsc_(saleTxt)) : '',
    '👤 العميل: ' + tgEsc_(data.clientName || '— (سيُطلَب عند المتابعة)'),
    '🤝 المورد: ' + tgEsc_(data.supplier || '—')
  ].filter(function (l) { return l !== ''; });
  var kb = [
    [tgBtn_('✏️ الفندق', 'ob:edit:hotel'), tgBtn_('✏️ المدينة', 'ob:edit:city'), tgBtn_('✏️ رقم الفندق', 'ob:edit:ref')],
    [tgBtn_('✏️ الدخول', 'ob:edit:checkIn'), tgBtn_('✏️ الخروج', 'ob:edit:checkOut')],
    [tgBtn_('✏️ الغرف', 'ob:edit:rooms'), tgBtn_('✏️ التكلفة', 'ob:edit:cost')],
    [tgBtn_('✏️ العميل', 'ob:edit:client'), tgBtn_('✏️ المورد', 'ob:edit:supplier')]
  ];
  // إعادة الاستخلاص على نفس الملف بمحرّك مختلف — متاحة فقط لو حُفظ معرّف الملف (كل استخلاص من
  // مستند حقيقي يحفظه؛ يغيب فقط لو استُدعيت الدالة بلا docMeta من مسار اختباري)
  if (data.docMeta && data.docMeta.fileId) {
    kb.push([tgBtn_('🤖 إعادة استخلاص AI', 'ob:re:ai'), tgBtn_('🔍 إعادة استخلاص يدوي', 'ob:re:man')]);
  }
  kb.push([tgBtn_(data.clientName ? '✅ اعتماد وتسجيل الحجز' : '✅ متابعة (العميل والمورد)', 'ob:go:1')]);
  kb.push([tgBtn_('❌ إلغاء', 'cf:abort:1')]);
  tgSendTo_(chatId, lines.join('\n'), tgKb_(kb));
}
// تعديل حر مجمَّع أثناء المراجعة: نموذج "الحقل: القيمة" (سطر أو أكثر) بنفس مفردات نموذج "حجز
// جديد" (tgParseKeyedForm_) — يشمل العميل والمورد مباشرةً، فلا حاجة لتكرار سؤالهما لاحقًا لو
// وردا هنا. يُعيد true لو فهم بندًا واحدًا على الأقل من النص، و false لو لم يفهم شيئًا منه.
function tgOcrApplyBulkForm_(data, text) {
  var f = tgParseKeyedForm_(text);
  var keys = Object.keys(f);
  if (!keys.length) return false;
  var d = data.d;
  ['hotel', 'city', 'checkIn', 'checkOut', 'hotelRef'].forEach(function (k) { if (f[k] !== undefined) d[k] = f[k]; });
  ['doubles', 'triples', 'quads', 'quints',
    'saleDouble', 'saleTriple', 'saleQuad', 'saleQuint',
    'costDouble', 'costTriple', 'costQuad', 'costQuint'].forEach(function (k) { if (f[k] !== undefined) d[k] = f[k]; });
  if (d.checkIn && d.checkOut) {
    d.nights = Math.max(0, Math.round((new Date(d.checkOut).getTime() - new Date(d.checkIn).getTime()) / 86400000));
  }
  if (f.client !== undefined) data.clientName = f.client;
  if (f.supplier !== undefined) data.supplier = f.supplier;
  return true;
}
// تطبيق قيمة حقل واحد مُدخلة نصًّا عبر زر "✏️" أثناء مراجعة التأكيد
function tgOcrApplyField_(d, field, text) {
  var v = String(text || '').trim();
  if (field === 'hotel') d.hotel = v;
  else if (field === 'ref') d.hotelRef = v;
  else if (field === 'city') d.city = /مدين|madin|medina/i.test(v) ? 'المدينة' : (/مك|makk|mecca/i.test(v) ? 'مكة' : v);
  else if (field === 'checkIn' || field === 'checkOut') {
    var iso = tgConfFindDates_(tgNormalizeDigits_(v))[0] || '';
    if (iso) { d[field] = iso; if (d.checkIn && d.checkOut) d.nights = Math.max(0, Math.round((new Date(d.checkOut).getTime() - new Date(d.checkIn).getTime()) / 86400000)); }
  } else if (field === 'rooms') {
    var rr = tgConfFindRooms_(tgNormalizeDigits_(v));
    d.doubles = rr.doubles; d.triples = rr.triples; d.quads = rr.quads; d.quints = rr.quints;
  } else if (field === 'cost') {
    var pe = tgParsePriceEntry_(v, 'cost');
    ['double', 'triple', 'quad', 'quint'].forEach(function (k) {
      var Suf = k.charAt(0).toUpperCase() + k.slice(1);
      if (pe.cost[k] !== undefined) d['cost' + Suf] = pe.cost[k];
      if (pe.sale[k] !== undefined) d['sale' + Suf] = pe.sale[k];
    });
    // لو أُرسل رقم مجرّد بلا نوع، طبّقه على كل نوع غرفة موجود
    if (!tgPriceEntryCount_(pe)) {
      var num = parseFloat(tgNormalizeDigits_(v));
      if (!isNaN(num) && num > 0) {
        if (d.doubles) d.costDouble = num; if (d.triples) d.costTriple = num;
        if (d.quads) d.costQuad = num; if (d.quints) d.costQuint = num;
      }
    }
  }
  return d;
}
function tgOcrEditPrompt_(field) {
  return {
    hotel: '🏨 أرسل اسم الفندق:', city: '🏙 أرسل المدينة (مكة/المدينة):', ref: '🔖 أرسل رقم حجز الفندق:',
    checkIn: '📅 أرسل تاريخ الدخول (يوم/شهر/سنة):', checkOut: '📅 أرسل تاريخ الخروج (يوم/شهر/سنة):',
    rooms: '🛏 أرسل الغرف، مثال: <code>رباعي 2 ثلاثي 1</code>',
    cost: '💰 أرسل تكلفة الغرفة/الليلة، مثال: <code>تكلفة رباعي 200</code> (أو رقمًا واحدًا يُطبَّق على كل الأنواع)'
  }[field] || 'أرسل القيمة:';
}
// أزرار تدفق قراءة التأكيد
function tgCbOcr_(cb, chatId, msgId, from, action, arg, chatType) {
  var sess = tgGetSession_(chatId, from.id);
  if (!sess || sess.flow !== 'ocrbk') { tgAnswerCb_(cb.id, 'انتهت المهلة', true); return; }
  var d = sess.data.d;
  if (action === 're') { // إعادة استخلاص نفس الملف بمحرّك آخر (بعد نتيجة أولية غير دقيقة)
    tgAnswerCb_(cb.id, '');
    tgOcrReextract_(chatId, from, sess, arg === 'ai' ? 'ai' : 'manual');
    return;
  }
  if (action === 'edit') {
    if (arg === 'client' || arg === 'supplier') { // العميل/المورد ليسا من حقول d — نمرّ بنفس تدفق المطابقة التقريبية
      sess.data.reqReview = true; // أعد العرض للمراجعة بعد الحسم، لا سلسلة الأسئلة المعتادة
      tgSetSession_(chatId, from.id, 'ocrbk', arg === 'client' ? 'client' : 'supplier', sess.data);
      tgAnswerCb_(cb.id, '');
      tgSendTo_(chatId, arg === 'client' ? '👤 أرسل اسم العميل الجديد:' : '🤝 أرسل اسم المورد الجديد:',
        tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
      return;
    }
    tgSetSession_(chatId, from.id, 'ocrbk', 'field:' + arg, sess.data);
    tgAnswerCb_(cb.id, '');
    tgSendTo_(chatId, tgOcrEditPrompt_(arg), tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
    return;
  }
  if (action === 'city') { // اختيار المدينة بالأزرار عند طلبها قبل المتابعة
    d.city = arg === 'medina' ? 'المدينة' : 'مكة'; // d = sess.data.d فالتعديل ينعكس في الجلسة
    tgAnswerCb_(cb.id, '');
    tgOcrContinueAfterReview_(chatId, from, sess);
    return;
  }
  if (action === 'go') {
    tgAnswerCb_(cb.id, '');
    if (!d.checkIn || !d.checkOut) { tgSendTo_(chatId, '⛔ لم تُحدَّد تواريخ الدخول/الخروج — عدّلها أولًا.'); tgOcrShowReview_(chatId, sess.data); return; }
    if ((d.doubles + d.triples + d.quads + d.quints) <= 0) { tgSendTo_(chatId, '⛔ حدِّد عدد الغرف لنوع واحد على الأقل.'); tgOcrShowReview_(chatId, sess.data); return; }
    if (!d.city) { // نطلب المدينة قبل المتابعة (إلزامية للتسجيل)
      tgSendTo_(chatId, '🏙 لم أتبيّن المدينة — اخترها:', tgKb_([[tgBtn_('🕋 مكة', 'ob:city:mecca'), tgBtn_('🕌 المدينة', 'ob:city:medina')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
      return;
    }
    tgOcrContinueAfterReview_(chatId, from, sess);
    return;
  }
  if (action === 'cl' || action === 'sp') { // اختيار اسم مرشَّح من القائمة
    var names = (action === 'cl') ? (sess.data.clNames || []) : (sess.data.spNames || []);
    var pick = names[parseInt(arg, 10)] || '';
    tgAnswerCb_(cb.id, '');
    tgOcrNameResolved_(chatId, from, sess, action, pick);
    return;
  }
  if (action === 'clnew' || action === 'spnew') { // استخدام الاسم المكتوب كما هو (طرف جديد)
    tgAnswerCb_(cb.id, '');
    var kind2 = action === 'clnew' ? 'cl' : 'sp';
    tgOcrNameResolved_(chatId, from, sess, kind2, kind2 === 'cl' ? (sess.data.clTyped || '') : (sess.data.spTyped || ''));
    return;
  }
  if (action === 'dup') { // تكرار رقم فندق: اعتماد التعديل، أو تسجيله حجزًا منفصلاً، أو الاحتفاظ بالقديم
    if (arg === 'update' && sess.data.dupKey) {
      tgAnswerCb_(cb.id, '⏳ جارِ التحديث…');
      tgOcrCommitUpdate_(chatId, from, sess.data, sess.data.dupKey);
    } else if (arg === 'asnew') {
      tgAnswerCb_(cb.id, '⏳ جارِ التسجيل كحجز منفصل…');
      tgOcrCommitNew_(chatId, from, sess.data);
    } else {
      tgAnswerCb_(cb.id, 'أُلغي');
      tgSendTo_(chatId, '◀️ احتُفظ بالتأكيد القائم كما هو — لم يُغيَّر شيء.');
      if (!tgOcrAdvanceQueue_(chatId, from, sess.data)) tgClearSession_(chatId, from.id);
    }
    return;
  }
  if (action === 'mrg') { // مطابقة حجز بلا رقم فندق: تحديثه بالرقم الجديد أو تسجيل جديد
    if (arg === 'update' && sess.data.mergeKey) {
      tgAnswerCb_(cb.id, '⏳ جارِ التحديث…');
      tgOcrCommitUpdate_(chatId, from, sess.data, sess.data.mergeKey);
    } else {
      tgAnswerCb_(cb.id, '');
      tgOcrCommitNew_(chatId, from, sess.data);
    }
    return;
  }
  tgAnswerCb_(cb.id, '');
}
// خطوة نصية أثناء تدفق قراءة التأكيد: تعديل حقل، اسم العميل/المورد، أو تعديل حر مجمَّع بمراجعة
function tgOcrStep_(chatId, from, sess, text) {
  var d = sess.data.d;
  var step = sess.step || '';
  if (step.indexOf('field:') === 0) {
    tgOcrApplyField_(d, step.slice(6), text);
    tgSetSession_(chatId, from.id, 'ocrbk', 'review', sess.data);
    tgOcrShowReview_(chatId, sess.data);
    return;
  }
  if (step === 'client') { tgOcrResolveName_(chatId, from, sess, text, 'cl'); return; }
  if (step === 'supplier') { tgOcrResolveName_(chatId, from, sess, text, 'sp'); return; }
  if (step === 'review') {
    // رسالة حرة أثناء المراجعة: نموذج "الحقل: القيمة" — نفس مفردات نموذج "حجز جديد"، ويشمل
    // العميل والمورد مباشرةً (لا حاجة لتكرار سؤالهما لو وردا هنا فعلًا)
    if (!tgOcrApplyBulkForm_(sess.data, text)) {
      tgSendTo_(chatId, '⚠️ لم أفهم أي بند من رسالتك. مثال: <code>الفندق: ابراج الكسوة</code>\nأو استخدم أزرار "✏️" أدناه.');
    }
    tgSetSession_(chatId, from.id, 'ocrbk', 'review', sess.data);
    tgOcrShowReview_(chatId, sess.data);
    return;
  }
  // خارج أي خطوة معروفة — أعد عرض المراجعة
  tgOcrShowReview_(chatId, sess.data);
}
function tgOcrAskClient_(chatId, from, data) {
  tgSetSession_(chatId, from.id, 'ocrbk', 'client', data);
  tgSendTo_(chatId, '👤 أرسل <b>اسم العميل</b> (سأطابقه تقريبيًا مع الحسابات المسجَّلة):',
    tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
function tgOcrAskSupplier_(chatId, from, data) {
  tgSetSession_(chatId, from.id, 'ocrbk', 'supplier', data);
  tgSendTo_(chatId, '🤝 أرسل <b>اسم المورد</b> (سأطابقه تقريبيًا):',
    tgKb_([[tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
}
// نقطة العبور الموحَّدة بعد اكتمال حقول d (تواريخ/غرف/مدينة): يطلب العميل إن كان ناقصًا، وإلا
// المورد إن كان ناقصًا، وإلا ينتقل للتحقق من التكرار/المطابقة ثم التسجيل. تُستدعى من زر
// "متابعة"، ومن اختيار المدينة، ومن حسم اسم عميل/مورد بالتدفق المعتاد (لا بتعديل من المراجعة)
function tgOcrContinueAfterReview_(chatId, from, sess) {
  if (!sess.data.clientName) { tgOcrAskClient_(chatId, from, sess.data); return; }
  if (!sess.data.supplier) { tgOcrAskSupplier_(chatId, from, sess.data); return; }
  tgSetSession_(chatId, from.id, 'ocrbk', 'finalize', sess.data);
  tgOcrFinalize_(chatId, from, sess.data);
}
// اسم عميل/مورد حُسم (تطابق قوي تلقائي، أو اختيار من الأزرار، أو "استخدمه كما هو"): لو جاء
// هذا التحديد من زر تعديل صريح على شاشة المراجعة (reqReview) نعود لعرضها، وإلا نتابع التدفق
// المعتاد (سؤال الطرف التالي الناقص، أو التحقق النهائي والتسجيل)
function tgOcrNameResolved_(chatId, from, sess, kind, name) {
  if (kind === 'cl') sess.data.clientName = name; else sess.data.supplier = name;
  if (sess.data.reqReview) {
    sess.data.reqReview = false;
    tgSetSession_(chatId, from.id, 'ocrbk', 'review', sess.data);
    tgOcrShowReview_(chatId, sess.data);
    return;
  }
  tgOcrContinueAfterReview_(chatId, from, sess);
}
// مطابقة تقريبية لاسم العميل/المورد — تطابق قوي يُعتمد فورًا، وإلا نعرض المرشَّحين + "استخدمه كما هو"
function tgOcrResolveName_(chatId, from, sess, text, kind) {
  var typed = String(text || '').trim();
  if (!typed) { tgSendTo_(chatId, 'أرسل الاسم من فضلك.'); return; }
  var matches = tgMatchClientName_(typed);
  var top = matches[0], second = matches[1];
  var strong = top && (top.score >= 90 || !second || (top.score - second.score) >= 25);
  if (strong) { tgOcrNameResolved_(chatId, from, sess, kind, top.name); return; }
  var names = matches.slice(0, 6).map(function (m) { return m.name; });
  if (kind === 'cl') { sess.data.clNames = names; sess.data.clTyped = typed; }
  else { sess.data.spNames = names; sess.data.spTyped = typed; }
  tgSetSession_(chatId, from.id, 'ocrbk', (kind === 'cl' ? 'client' : 'supplier'), sess.data);
  var rows = names.map(function (n, i) { return [tgBtn_(n, 'ob:' + kind + ':' + i)]; });
  rows.push([tgBtn_('➕ استخدم "' + typed.slice(0, 24) + '" كما هو', 'ob:' + (kind === 'cl' ? 'clnew' : 'spnew') + ':1')]);
  rows.push([tgBtn_('❌ إلغاء', 'cf:abort:1')]);
  tgSendTo_(chatId, (names.length ? '🤔 وجدت أسماء قريبة — اختر المقصود، أو استخدم ما كتبته كطرف جديد:' :
    'لا يوجد اسم قريب مسجَّل — سيُسجَّل كطرف جديد:'), tgKb_(rows));
}
// بحث عن حجز قائم بنفس رقم حجز الفندق (عبر المدينتين)
function tgFindBookingByHotelRef_(ref) {
  ref = String(ref || '').trim(); if (!ref) return null;
  var out = null;
  getSourceRowsCached_().some(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL];
    if (String(raw[17] || '').trim() === ref) { out = { bookingKey: bookingKey_(raw, city), city: city }; return true; }
    return false;
  });
  return out;
}
// بحث عن حجز مطابق (نفس العميل، نفس التواريخ، وفندق متوافق) بلا رقم حجز فندق — لتحديثه بدل
// تسجيل مكرر. clientName إلزامي فعليًا للمطابقة: بدونه (أو لو الفندق فارغًا في الطرفين) قد
// يُطابَق حجز عميل آخر تمامًا يتصادف مشاركته نفس الفندق والتواريخ — حالة شائعة جدًا في حجوزات
// العمرة/الحج الجماعية (عدة عملاء/مجموعات بنفس الفندق ونفس فترة الإقامة) — وهذا بالضبط ما كان
// يُحدِّث حجز عميل مختلف صامتًا مع رسالة "نجاح" بينما يبقى حجز العميل الفعلي دون تغيير
function tgFindBookingNoRefMatch_(d, clientName) {
  if (!d.checkIn || !d.checkOut) return null;
  var dh = normalizeName_(d.hotel || '').toLowerCase();
  var dc = normalizeName_(clientName || '');
  var out = null;
  getSourceRowsCached_().some(function (fr) {
    var raw = fr.slice(0, SOURCE_LAST_COL), city = fr[SOURCE_LAST_COL];
    if (String(raw[17] || '').trim()) return false;
    if (String(raw[15] || '').trim() === BOOKING_CANCELLED_STATUS_) return false;
    var ci = raw[7] instanceof Date ? Utilities.formatDate(raw[7], 'GMT+3', 'yyyy-MM-dd') : '';
    var co = raw[8] instanceof Date ? Utilities.formatDate(raw[8], 'GMT+3', 'yyyy-MM-dd') : '';
    if (ci !== d.checkIn || co !== d.checkOut) return false;
    // فندق فارغ في أي من الطرفين لم يعد يُعامَل كـ"لا مانع" — فراغ الفندق في الصف يعني على الأرجح
    // حجزًا آخر غير متعلق إطلاقًا، لا حجزًا يستحق الدمج بلا تحقق
    if (dh) {
      var h = normalizeName_(raw[4] || '').toLowerCase();
      if (!h || (h.indexOf(dh) < 0 && dh.indexOf(h) < 0)) return false;
    }
    if (dc && normalizeName_(raw[3] || '') !== dc) return false;
    out = { bookingKey: bookingKey_(raw, city), city: city };
    return true;
  });
  return out;
}
// خريطة أعمدة المصدر من بيانات التأكيد (للتسجيل والتحديث)
function tgOcrFieldsMap_(d) {
  var map = reqDataToSourceMap_(d); // فندق/تواريخ/غرف/تكلفة
  if (d.supplier) map[15] = String(d.supplier).trim();
  if (d.hotelRef) map[18] = String(d.hotelRef).trim();
  return map;
}
// يُستدعى عند انتهاء "أمر" هذا الحجز (سُجِّل/حُدِّث/أُلغي) — لو تبقّت حجوزات أخرى في طابور نفس
// المستند (تأكيد بعدة حجوزات) يعرض التالي منها للمراجعة بدل مسح الجلسة، ويُرجع true (على
// المستدعي عدم مسح الجلسة أو إرسال أي شيء آخر بعدها)؛ لا طابور متبقٍّ ⇒ يمسح الجلسة ويُرجع
// false كالسلوك المعتاد قبل هذه الميزة تمامًا
function tgOcrAdvanceQueue_(chatId, from, data) {
  var queue = data.queue || [];
  if (!queue.length) return false;
  var next = queue[0];
  var sessData = {
    d: next, engine: data.engine, docMeta: data.docMeta,
    clientName: data.clientName || '', supplier: data.supplier || '',
    queue: queue.slice(1), queueIndex: (data.queueIndex || 1) + 1, queueTotal: data.queueTotal || (queue.length + 1)
  };
  tgSetSession_(chatId, from.id, 'ocrbk', 'review', sessData);
  tgSendTo_(chatId, '➡️ الحجز التالي (' + sessData.queueIndex + ' من ' + sessData.queueTotal + ') من نفس الملف:');
  tgOcrShowReview_(chatId, sessData);
  return true;
}
function tgOcrFinalize_(chatId, from, data) {
  var d = data.d;
  d.supplier = data.supplier || '';
  // تكرار رقم حجز الفندق؟ — هذا التأكيد على الأرجح تعديل لنفس الحجز القائم (رقم فندق واحد لا
  // يتكرر لحجزين مختلفين)، فنقارن ونعرض 3 خيارات بدل افتراض أيّها المقصود
  var dup = d.hotelRef ? tgFindBookingByHotelRef_(d.hotelRef) : null;
  if (dup) {
    data.dupKey = dup.bookingKey;
    tgSetSession_(chatId, from.id, 'ocrbk', 'dup', data);
    var sn = null;
    try { sn = bookingSnapshotByKey_(dup.bookingKey); } catch (e) {}
    var diffTxt = sn ? tgReqEditDiffText_(d, sn) : '';
    tgSendTo_(chatId, [
      '⚠️ رقم حجز الفندق <code>' + tgEsc_(d.hotelRef) + '</code> مسجَّل بالفعل على حجز قائم' +
        (sn ? (' — ' + tgEsc_(reqBookingSummary_(sn, sn.innerRef))) : '') + ':',
      diffTxt ? tgEsc_(diffTxt) : 'لا فروق عن الحجز القائم في الفندق/التواريخ/الغرف.',
      '',
      'يبدو هذا التأكيد تعديلاً على نفس الحجز — اختر الإجراء:'
    ].join('\n'), tgKb_([
      [tgBtn_('✅ اعتماد التعديل (تحديث الحجز القائم)', 'ob:dup:update')],
      [tgBtn_('🆕 تسجيله حجزًا منفصلاً برقم جديد', 'ob:dup:asnew')],
      [tgBtn_('◀️ الاحتفاظ بالتأكيد القديم (تجاهل هذا)', 'ob:dup:cancel')]
    ]));
    return;
  }
  // مطابقة حجز بلا رقم فندق؟ (نفس العميل + التواريخ + فندق متوافق)
  var merge = tgFindBookingNoRefMatch_(d, data.clientName);
  if (merge) {
    data.mergeKey = merge.bookingKey;
    tgSetSession_(chatId, from.id, 'ocrbk', 'merge', data);
    var sn2 = null;
    try { sn2 = bookingSnapshotByKey_(merge.bookingKey); } catch (e2) {}
    var diffTxt2 = sn2 ? tgReqEditDiffText_(d, sn2) : '';
    tgSendTo_(chatId, [
      'ℹ️ يوجد حجز مطابق بنفس الفندق والتواريخ بلا رقم حجز فندق' +
        (sn2 ? (' — ' + tgEsc_(reqBookingSummary_(sn2, sn2.innerRef))) : '') + ':',
      diffTxt2 ? tgEsc_(diffTxt2) : '',
      '',
      'هل أحدّثه بهذا التأكيد (أضيف رقم الفندق وأؤكّده)، أم أسجّله حجزًا جديدًا منفصلاً؟'
    ].filter(Boolean).join('\n'),
      tgKb_([[tgBtn_('🔄 تحديث الحجز المطابق', 'ob:mrg:update')], [tgBtn_('🆕 تسجيل حجز جديد منفصل', 'ob:mrg:new')], [tgBtn_('❌ إلغاء', 'cf:abort:1')]]));
    return;
  }
  tgOcrCommitNew_(chatId, from, data);
}
function tgOcrCommitNew_(chatId, from, data) {
  var d = data.d;
  var ctx;
  try { ctx = tgRequire_(from.id, 'newbooking'); } catch (e) { tgSendTo_(chatId, '⛔ ' + tgEsc_(e.message)); return; }
  var clientName = (data.clientName || '').trim();
  if (!clientName) { tgSendTo_(chatId, '⛔ اسم العميل مطلوب.'); return; }
  if (tgGateNewParties_(chatId, from, clientName, data.supplier, 'ocrnew', data)) return;
  // نكتب الاسم الحرفي المسجَّل في "العملاء والموردين" — يتفادى رفض تحقق صحة البيانات لفرق تافه
  clientName = tgPartyExactName_('client', clientName);
  if (data.supplier) data.supplier = tgPartyExactName_('supplier', data.supplier);
  var city = d.city === 'المدينة' ? 'المدينة' : 'مكة';
  try {
    d.supplier = data.supplier || '';
    var innerNo = appendBookingRaw_(city, d, clientName, '', BOOKING_CONFIRMED_STATUS_);
    logChange_(ctx.user, 'حجز جديد', innerNo,
      'تسجيل حجز مؤكد من تأكيد فندق (تليجرام/OCR) — ' + clientName + ' / ' + (d.hotel || 'بلا فندق') + ' / ' + city +
      (d.hotelRef ? (' — رقم حجز الفندق ' + d.hotelRef) : ''),
      '', innerNo, { clientName: clientName, hotelRef: d.hotelRef || '', recordKey: bookingRecordKey_(innerNo) });
    tgSendTo_(chatId, '✅ <b>سُجِّل الحجز (مؤكد) من التأكيد</b>\n🔖 الرقم الداخلي: <code>' + tgEsc_(innerNo) + '</code>' +
      (d.hotelRef ? ('\n🏨 رقم حجز الفندق: <code>' + tgEsc_(d.hotelRef) + '</code>') : '') +
      '\n👤 العميل: ' + tgEsc_(clientName) + (data.supplier ? ('\n🤝 المورد: ' + tgEsc_(data.supplier)) : ''));
    if (!tgOcrAdvanceQueue_(chatId, from, data)) tgClearSession_(chatId, from.id);
  } catch (e) { tgSendTo_(chatId, '⛔ فشل التسجيل: ' + tgEsc_(e.message)); }
}
function tgOcrCommitUpdate_(chatId, from, data, bookingKey) {
  var d = data.d;
  var ctx;
  try { ctx = tgRequire_(from.id, 'prices'); } catch (e) { tgSendTo_(chatId, '⛔ ' + tgEsc_(e.message)); return; }
  if (tgGateNewParties_(chatId, from, data.clientName, data.supplier, 'ocrupdate', { data: data, bookingKey: bookingKey })) return;
  // نكتب الاسم الحرفي المسجَّل في "العملاء والموردين" — يتفادى رفض تحقق صحة البيانات لفرق تافه
  if (data.supplier) data.supplier = tgPartyExactName_('supplier', data.supplier);
  d.supplier = data.supplier || '';
  try {
    // يُلتقَط قبل الكتابة (والتي غالبًا تُضيف رقم حجز فندق فتُغيّر bookingKey_ لهذا الصف
    // مستقبلاً) ليبقى مفتاح سجل التعديلات ثابتًا بالرقم الداخلي بصرف النظر عن ذلك
    var snapBefore2 = null; try { snapBefore2 = bookingSnapshotByKey_(bookingKey); } catch (eSnap2) {}
    var map = tgOcrFieldsMap_(d); // hotelRef ⇒ الحالة "مؤكد" تلقائيًا داخل setBookingFieldsRaw_
    setBookingFieldsRaw_(bookingKey, map);
    logChange_(ctx.user, 'تعديل حجز', bookingKey, 'تحديث الحجز من تأكيد فندق (تليجرام/OCR)' +
      (d.hotelRef ? (' — رقم حجز الفندق ' + d.hotelRef) : ''), '', 'مؤكد',
      { hotelRef: d.hotelRef || '', clientName: data.clientName || '', recordKey: bookingRecordKey_((snapBefore2 && snapBefore2.innerRef) || bookingKey) });
    tgSendTo_(chatId, '✅ <b>حُدِّث الحجز من التأكيد وأصبح مؤكدًا</b>' +
      (d.hotelRef ? ('\n🏨 رقم حجز الفندق: <code>' + tgEsc_(d.hotelRef) + '</code>') : ''));
    if (!tgOcrAdvanceQueue_(chatId, from, data)) tgClearSession_(chatId, from.id);
  } catch (e) { tgSendTo_(chatId, '⛔ فشل التحديث: ' + tgEsc_(e.message)); }
}
