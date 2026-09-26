// ==========================================================
// مزامنة شيت العهد الخارجي مع سجل الدفعات
// ==========================================================
// الغرض: شيت خارجي مستقل لحسابات العهدة (عهدة موظف في مكة/المدينة مثلاً). كلما كُتب اسم
// عميل أو مورد في العمود G لصف ما، تُسجَّل الحركة تلقائيًا في هذا البرنامج كدفعة على ذلك
// الحساب، وأي تغيير لاحق في قيم الصف يُحدِّث نفس الدفعة (لا يُنشئ ثانية)، ومسحُ الاسم أو
// المبلغ يحذفها.
//
// الإعداد كله من شاشة الإعدادات ← "شيت العهد الخارجي": إضافة أكثر من شيت عهدة، تفعيل/تعطيل
// كل شيت على حدة (تعطيل = تجميد كامل: لا إنشاء ولا تحديث ولا حذف لدفعاته، وسجلّه التاريخي
// يبقى كما هو بلا أي مساس)، وتفعيل/تعطيل تنبيهات تليجرام الخاصة بحركات العهدة وحدها (مستقل
// عن تفعيل/تعطيل كل شيت — تعطيل التنبيهات لا يوقف المزامنة نفسها، فقط يكتم رسائل تليجرام).
//
// ⚠️ أين يُلصَق هذا الملف؟ هنا، في *نفس مشروع Apps Script الخاص بالبرنامج* (بجوار Code.gs)
// — وليس في الشيت الخارجي. السبب جوهري: كود داخل الشيت الخارجي لا يستطيع نداء دوال هذا
// البرنامج، فأقصى ما يفعله هو الكتابة المباشرة في ورقة الدفعات — فيفقد تنبيه تليجرام وسجل
// التعديلات والتحقق من الصلاحيات. بوضع المزامنة هنا تمرّ كل حركة بالمسار الرسمي نفسه الذي
// تمرّ به أي دفعة تُسجَّل من الشاشة.
// الشيت الخارجي لا يحتاج أي كود إطلاقًا — يكفي مشاركته مع نفس حساب جوجل المالك لهذا المشروع.
//
// خريطة الأعمدة في شيت العهد (ثابتة، لا تُضبَط من الواجهة):
//   A = مبلغ يُسجَّل في الجانب الدائن  ← بيانه: "دفعة ليد <صاحب العهدة>"
//   B = مبلغ يُسجَّل في الجانب المدين  ← بيانه: "دفعة مسددة من عهدة <صاحب العهدة>"
//       (B لا يُقرأ إلا إذا كانت A فارغة — A لها الأولوية دائمًا)
//   D = تاريخ الحركة        F = رقم القيد        G = اسم العميل/المورد
//   H = عمود نكتب فيه نحن فقط (لا يُقرأ من هذا العمود إطلاقًا) — بعد ترحيل الصف بنجاح نكتب
//       فيه "تم التسجيل آلياً في حساب العميل" كتأكيد مرئي للمستخدم داخل شيت العهدة نفسه.
//       صف اسمه في G لا يطابق (بالتقريب) أي عميل أو مورد مسجَّل فعلاً في البرنامج ⇐ يُتجاهَل
//       كليًا (لا تسجيل ولا علامة H) حتى لا تُنشأ حسابات بأسماء مغلوطة تلقائيًا
// ==========================================================

var CUSTODY_PROP_KEY_ = 'CUSTODY_SHEETS_CFG';
var CUSTODY_ID_PREFIX_ = 'CUSTODY:';       // بادئة معرّف الدفعة — بها نعرف ما نملكه وما لا نملكه
var CUSTODY_SYNC_FLAG_ = 'custody_sync_at';
var CUSTODY_SYNC_EVERY_MS_ = 120000;       // لا نفتح الشيت الخارجي أكثر من مرة كل دقيقتين
var CUSTODY_MARK_TEXT_ = 'تم التسجيل آلياً في حساب العميل';   // نص العلامة في العمود H

// ==========================================================
// التخزين: { sheets: [{id, sheet, startRow, holder, active}], notifyEnabled }
// ==========================================================
function custodyDefaultState_() { return { sheets: [], notifyEnabled: true }; }

// يضمن أن كل عنصر يحمل خاصية active حتى لو جاء من صيغة تخزين أقدم لا تعرفها (=== undefined
// فقط تُعامَل كـ"مفعّلة" افتراضيًا — false الصريحة تبقى false). لا نستخدم Object.assign هنا
// لأنه يكتب فوق القيمة الافتراضية حتى لو كانت الخاصية الأصلية undefined صراحةً
function custodyWithDefaults_(c) {
  return {
    id: (c.id || '').toString(), sheet: (c.sheet || '').toString(),
    startRow: c.startRow || 2, holder: (c.holder || '').toString(),
    active: c.active === undefined ? true : !!c.active
  };
}
function getCustodyState_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(CUSTODY_PROP_KEY_);
    if (!raw) return custodyDefaultState_();
    var parsed = JSON.parse(raw);
    // ترحيل الصيغة القديمة: كانت الخاصية تُخزَّن كمصفوفة مباشرة بلا notifyEnabled ولا active
    var rawSheets = Array.isArray(parsed) ? parsed : (parsed.sheets || []);
    var notifyEnabled = Array.isArray(parsed) ? true : (parsed.notifyEnabled !== false);
    return { sheets: rawSheets.map(custodyWithDefaults_), notifyEnabled: notifyEnabled };
  } catch (e) { return custodyDefaultState_(); }
}
function saveCustodyState_(sheets, notifyEnabled) {
  PropertiesService.getScriptProperties().setProperty(CUSTODY_PROP_KEY_,
    JSON.stringify({ sheets: sheets || [], notifyEnabled: notifyEnabled !== false }));
}
// الأوراق المفعَّلة فقط — هذه وحدها تدخل المزامنة الفعلية (قراءة/إنشاء/تحديث/حذف)
function getActiveCustodySheets_() {
  return getCustodyState_().sheets.filter(function (s) { return s.active !== false; });
}
// تنظيف قائمة قادمة من الواجهة أو من إعداد يدوي: يستبعد أي عنصر بلا معرّف شيت حقيقي
function custodySanitizeSheets_(list) {
  return (list || [])
    .filter(function (c) { return c && c.id && String(c.id).trim() && String(c.id).indexOf('ضع-هنا') === -1; })
    .map(function (c) {
      return {
        id: String(c.id).trim(),
        sheet: String(c.sheet || '').trim(),
        startRow: Math.max(2, parseInt(c.startRow, 10) || 2),
        holder: String(c.holder || '').trim(),
        active: c.active !== false
      };
    });
}

// ---------- الإعداد اليدوي (اختياري) ----------
// ⚠️ الطريقة الموصى بها الآن: شاشة الإعدادات ← "شيت العهد الخارجي" — تُدخِل كل البيانات من
// الواجهة مباشرة بلا فتح محرر الأكواد، مع اختبار الاتصال وتفعيل/تعطيل كل شيت بضغطة. هذه
// الدالة تبقى فقط لمن يفضّل الإعداد اليدوي من هنا مباشرة.
function setupCustodySheet() {
  requireScriptOwner_();   // (7.15.0) كانت عامة: أي زائر يستبدل إعداد العهد بقيمة وهمية
  saveCustodyConfig_([{
    id: 'ضع-هنا-معرّف-شيت-العهد',
    sheet: 'ورقة1', startRow: 2, holder: 'مودي في المدينة'
  }]);
}
// يقبل عدة أوراق عهدة (صاحب عهدة لكل مدينة مثلاً) — يحافظ على إعداد notifyEnabled الحالي
// (7.15.0) أصبحت داخلية (كانت عامة بلا أي صلاحية: أي زائر لرابط البرنامج يستطيع توجيه المزامنة لشيت
// يملكه فتُحقن دفعات وهمية في كشوف الحسابات). الإعداد من الواجهة يمر بـ saveCustodySettings المحمية.
function saveCustodyConfig_(list) {
  var clean = custodySanitizeSheets_(list);
  saveCustodyState_(clean, getCustodyState_().notifyEnabled);
  return { ok: true, count: clean.length };
}

// ---------- نصوص البيان ----------
// نفس الصياغة التي طلبتَها حرفيًا، مع اسم صاحب العهدة من الإعداد
function custodyNoteIn_(holder) { return 'دفعة ليد ' + (holder || 'العهدة'); }
function custodyNoteOut_(holder) { return 'دفعة مسددة من عهدة ' + (holder || 'العهدة'); }

// معرّف ثابت لكل صف في شيت العهد: هو مفتاح التحديث لاحقًا. تغيّر قيم الصف يُحدِّث نفس
// الدفعة بدل إنشاء أخرى، وحذف الاسم/المبلغ يحذفها — كل ذلك بلا أي عمود إضافي في الشيتين
function custodyPaymentId_(cfgId, rowNumber) {
  return CUSTODY_ID_PREFIX_ + cfgId.slice(-10) + ':' + rowNumber;
}

// ---------- التحقق من أن اسم الطرف معروف فعلاً كعميل أو مورد ----------
// يجلب كل الأسماء المسجَّلة في ورقة "العملاء والموردين" مرة واحدة فقط لكل دورة مزامنة (لا
// مرة لكل صف) — يُمرَّر الناتج بعدها لكل استدعاء custodyRowToPayment_. null فقط لو تعذّر
// الوصول لورقة الأطراف إطلاقًا (لا تحقق ممكن حينها، فلا نُعطِّل المزامنة بلا داعٍ)؛ خلاف ذلك
// نُرجع مصفوفة (قد تكون فارغة) فيُطبَّق التحقق الفعلي دومًا
function custodyKnownNames_() {
  var clients = tgPartyColumnNames_('client');
  var suppliers = tgPartyColumnNames_('supplier');
  if (clients === null && suppliers === null) return null;
  var all = (clients || []).concat(suppliers || []);
  return all.length ? all : null;   // (7.15.0) قائمة فارغة (قراءة فاشلة جزئيًا) كانت ترفض كل الصفوف فتُحذف دفعاتها
}
// تطابق تقريبي بنفس منطق tgNamesRelated_ المستخدَم في كل مطابقات الأسماء بالبرنامج (يتجاهل
// فروق الهمزة/الياء/التاء المربوطة/المسافات الزائدة، ويقبل احتواء أحدهما داخل الآخر)
function custodyPartyKnown_(name, allNames) {
  for (var i = 0; i < allNames.length; i++) {
    if (tgNamesRelated_(allNames[i], name)) return true;
  }
  return false;
}

// ---------- تحويل صف واحد من شيت العهد إلى دفعة ----------
// دالة نقية (بلا أي خدمة من خدمات جوجل سوى ما يُمرَّر لها جاهزًا) — هنا تعيش قاعدة الأولوية:
// العمود A له الأسبقية دائمًا، ولا يُقرأ B إلا إذا كانت A فارغة أو صفرًا. صف بلا اسم في G، أو
// بلا مبلغ في A وB معًا، ليس حركةً أصلاً فيُتجاهَل (ولا تُنشَأ له دفعة ولا يبقى له أثر لو كان
// له سابقًا). كذلك صف اسمه في G لا يطابق (بالتقريب) أي عميل/مورد معروف — لو مُرِّرت knownNames.
// row = مصفوفة قيم الأعمدة A..G لهذا الصف. knownNames اختياري: مصفوفة كل الأسماء المعروفة
// (من custodyKnownNames_) — تُركت بلا تمرير (undefined) في نداءات لا تحتاج هذا التحقق
function custodyRowToPayment_(row, holder, knownNames) {
  var r = row || [];
  var party = (r[6] || '').toString().trim();              // G
  if (!party) return null;
  if (knownNames && !custodyPartyKnown_(party, knownNames)) return null;
  var credit = parseAmountLoose_(r[0]);                     // A — الجانب الدائن
  var debit = parseAmountLoose_(r[1]);                      // B — الجانب المدين
  var amount, direction, note;
  if (credit && credit > 0) {
    amount = credit; direction = 'استلمنا منه'; note = custodyNoteIn_(holder);
  } else if (debit && debit > 0) {
    amount = debit; direction = 'دفعنا له'; note = custodyNoteOut_(holder);
  } else {
    return null;
  }
  var d = (r[3] && typeof r[3].getTime === 'function') ? r[3] : (r[3] ? new Date(r[3]) : null);  // D
  if (!d || isNaN(d.getTime())) d = new Date();
  return {
    partyName: party, amount: amount, direction: direction, note: note,
    qaid: (r[5] === null || r[5] === undefined) ? '' : String(r[5]).trim(),   // F
    date: d, holder: holder
  };
}

// ---------- قراءة صفوف العهدة المطلوبة ----------
// configs (اختياري): قائمة الأوراق المراد قراءتها — الافتراضي كل الأوراق المفعَّلة حاليًا.
// knownNames (اختياري): ناتج custodyKnownNames_ — يُمرَّر لتفعيل تجاهل الصفوف بأسماء غير معروفة.
// يُرجع { wanted: {id: {...دفعة}}, sheetsById: {cfgId: ورقة} } — sheetsById يُستخدَم لاحقًا
// لكتابة علامة "تم التسجيل آليًا..." في العمود H بلا إعادة فتح كل شيت من جديد
function collectCustodyRows_(configs, knownNames) {
  var list = configs || getActiveCustodySheets_();
  var wanted = {};
  var sheetsById = {};
  list.forEach(function (cfg) {
    var ss, sh;
    try {
      ss = SpreadsheetApp.openById(cfg.id);
      sh = cfg.sheet ? ss.getSheetByName(cfg.sheet) : ss.getSheets()[0];
    } catch (e) {
      Logger.log('custody: تعذّر فتح الشيت ' + cfg.id + ' — ' + e.message);
      return;
    }
    if (!sh) { Logger.log('custody: لا توجد ورقة باسم ' + cfg.sheet); return; }
    sheetsById[cfg.id] = sh;
    var lastRow = sh.getLastRow();
    if (lastRow < cfg.startRow) return;
    // A..H في قراءة واحدة (H = علامة التسجيل التي نكتبها نحن) — نداء شبكي واحد لكل ورقة
    var vals = sh.getRange(cfg.startRow, 1, lastRow - cfg.startRow + 1, 8).getValues();
    vals.forEach(function (r, i) {
      var rowNumber = cfg.startRow + i;
      var pay = custodyRowToPayment_(r, cfg.holder, knownNames);
      if (!pay) return;
      pay.rowNumber = rowNumber;
      pay.cfgId = cfg.id;
      pay.existingMark = (r[7] || '').toString().trim();
      wanted[custodyPaymentId_(cfg.id, rowNumber)] = pay;
    });
  });
  return { wanted: wanted, sheetsById: sheetsById };
}

// ---------- المزامنة ----------
// تُقارن ما في أوراق العهدة *المفعَّلة* بما سبق تسجيله، فتُنشئ الجديد وتُحدِّث المتغيّر وتحذف
// الملغى — وكل عملية من الثلاث تُرسل تنبيه تليجرام (ما لم تكن التنبيهات موقوفة من الإعدادات)
// وتُسجَّل في سجل التعديلات كأي دفعة عادية. أوراق مُعطَّلة أو أُزيلت من القائمة لا تُلمَس
// دفعاتها إطلاقًا — لا تحديث ولا حذف — فتعطيل شيت لا يعني فقدان تاريخه المحاسبي
function syncCustodySheets() {
  var state = getCustodyState_();
  var active = state.sheets.filter(function (s) { return s.active !== false; });
  if (!active.length) {
    return { ok: true, skipped: state.sheets.length
      ? 'كل أوراق العهدة معطَّلة حاليًا — فعّل واحدة على الأقل من الإعدادات'
      : 'لم يُضبَط أي شيت عهدة بعد (من الإعدادات ← شيت العهد الخارجي)' };
  }
  var notifyEnabled = state.notifyEnabled !== false;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: true, skipped: 'مزامنة أخرى قيد التنفيذ' };
  try {
    var knownNames = custodyKnownNames_();
    var collected = collectCustodyRows_(active, knownNames);
    var wanted = collected.wanted, sheetsById = collected.sheetsById;
    // (7.15.0) إصلاح حذف جماعي: الدفعات القائمة تُقارَن فقط بأوراق قُرئت فعلاً في هذه الدورة — ورقة تعذّر
    // فتحها (انقطاع/صلاحية/اسم ورقة تغيّر) كانت تُعامَل كأنها فارغة فتُحذف كل دفعاتها من سجل الدفعات
    var activeIdSegments = {};
    active.forEach(function (c) { if (sheetsById[c.id]) activeIdSegments[c.id.slice(-10)] = true; });

    var sh = ensurePaymentsSheet_();
    var lastRow = sh.getLastRow();
    var existing = {};   // id ⟶ {rowInSheet, vals} — فقط لأوراق مفعَّلة حاليًا
    if (lastRow > 1) {
      var rows = sh.getRange(2, 1, lastRow - 1, PAYMENTS_COLS_).getValues();
      rows.forEach(function (r, i) {
        var id = (r[7] || '').toString();
        if (id.indexOf(CUSTODY_ID_PREFIX_) !== 0) return;
        var seg = id.split(':')[1];
        if (activeIdSegments[seg]) existing[id] = { rowInSheet: i + 2, vals: r };
      });
    }
    var created = 0, updated = 0, deleted = 0;
    var now = new Date();
    var toAppend = [];

    Object.keys(wanted).forEach(function (id) {
      var w = wanted[id];
      var ex = existing[id];
      if (!ex) {
        toAppend.push([w.date, cellSafe_(w.partyName), w.direction, w.amount, cellSafe_(w.note), cellSafe_(w.qaid), now, id, false, '']);
        created++;
        custodyNotify_(w, 'تسجيل', notifyEnabled);
        return;
      }
      // تغيّر أي قيمة مؤثّرة في الصف ⇒ نُحدِّث نفس الدفعة في مكانها، ونحسب أيضًا أيّ الحقول
      // تغيّرت تحديدًا (لا مجرد "تغيّر شيء ما") حتى يُفصِح تنبيه تليجرام عمّا تغيّر بالضبط
      var sameDate = (ex.vals[0] instanceof Date) && Math.abs(ex.vals[0].getTime() - w.date.getTime()) < 86400000 &&
        ex.vals[0].getDate() === w.date.getDate();
      var oldParty = (ex.vals[1] || '').toString().trim();
      var oldDirection = (ex.vals[2] || '').toString().trim();
      var oldAmount = parseFloat(ex.vals[3]) || 0;
      var oldNote = (ex.vals[4] || '').toString().trim();
      var oldQaid = (ex.vals[5] === null || ex.vals[5] === undefined) ? '' : String(ex.vals[5]).trim();
      var changed = !sameDate || oldParty !== w.partyName || oldDirection !== w.direction ||
        oldAmount !== w.amount || oldNote !== w.note || oldQaid !== w.qaid;
      if (changed) {
        var fmtCustodyDate_ = function (v) { return (v instanceof Date) ? Utilities.formatDate(v, 'GMT+3', 'dd/MM/yyyy') : '—'; };
        var custodyDiffs = [
          { label: 'التاريخ', oldVal: fmtCustodyDate_(ex.vals[0]), newVal: fmtCustodyDate_(w.date) },
          { label: 'اسم الطرف', oldVal: oldParty || '—', newVal: w.partyName || '—' },
          { label: 'الاتجاه', oldVal: oldDirection || '—', newVal: w.direction || '—' },
          { label: 'المبلغ', oldVal: String(oldAmount), newVal: String(w.amount) },
          { label: 'البيان', oldVal: oldNote || '—', newVal: w.note || '—' },
          { label: 'رقم القيد', oldVal: oldQaid || '—', newVal: w.qaid || '—' }
        ].filter(function (d) { return d.oldVal !== d.newVal; });
        sh.getRange(ex.rowInSheet, 1, 1, 6).setValues([[w.date, w.partyName, w.direction, w.amount, w.note, w.qaid]]);
        updated++;
        custodyNotify_(w, 'تعديل', notifyEnabled, custodyDiffs);
      }
    });

    if (toAppend.length) {
      sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, PAYMENTS_COLS_).setValues(toAppend);
    }

    // صفوف اختفت من شيت عهدة *مفعَّل* (مُسِح اسمها أو مبلغها) ⇒ تُحذف دفعتها حتى لا يبقى أثر
    // مالي لحركة لم تعد موجودة. الحذف من الأسفل للأعلى حتى لا تنزاح أرقام الصفوف أثناء الحذف
    var orphanRows = [];
    Object.keys(existing).forEach(function (id) {
      if (!wanted[id]) orphanRows.push({ id: id, rowInSheet: existing[id].rowInSheet, vals: existing[id].vals });
    });
    // (7.15.0) صمام أمان: لو كان المطلوب حذفه كثيرًا بشكل غير طبيعي (أكثر من 10 صفوف ونصف دفعات
    // الورقة أو أكثر) نوقف الحذف ونسجّل تحذيرًا — غالبًا خلل مؤقت في قراءة الورقة لا حذف فعلي من المستخدم
    var bySeg = {}, orphBySeg = {};
    Object.keys(existing).forEach(function (id) { var sg = id.split(':')[1]; bySeg[sg] = (bySeg[sg] || 0) + 1; });
    orphanRows.forEach(function (o) { var sg = o.id.split(':')[1]; orphBySeg[sg] = (orphBySeg[sg] || 0) + 1; });
    var blockedSeg = {};
    Object.keys(orphBySeg).forEach(function (sg) { if (orphBySeg[sg] > 10 && orphBySeg[sg] >= bySeg[sg] / 2) blockedSeg[sg] = true; });
    if (Object.keys(blockedSeg).length) {
      orphanRows = orphanRows.filter(function (o) { return !blockedSeg[o.id.split(':')[1]]; });
      hbLogChange_('مزامنة العهدة', 'دفعة', 'شيت العهد', '[مزامنة شيت العهد] ⚠️ أُوقف حذف جماعي مريب لدفعات ورقة عهدة — راجع الورقة يدويًا', '', '');
    }
    orphanRows.sort(function (a, b) { return b.rowInSheet - a.rowInSheet; });
    orphanRows.forEach(function (o) {
      sh.deleteRow(o.rowInSheet);
      deleted++;
      custodyNotify_({
        partyName: (o.vals[1] || '').toString(), amount: parseFloat(o.vals[3]) || 0,
        direction: (o.vals[2] || '').toString(), note: (o.vals[4] || '').toString(),
        qaid: (o.vals[5] || '').toString(), date: o.vals[0] instanceof Date ? o.vals[0] : new Date()
      }, 'حذف', notifyEnabled);
    });

    // علامة "تم التسجيل آليًا..." في العمود H لكل صف مطابَق بنجاح (اسمه معروف وله مبلغ صالح)
    // لم تُكتب علامته من قبل — يشمل هذا صفوفًا سُجِّلت في دورات مزامنة سابقة قبل وجود هذه
    // الميزة، فتُستكمَل علاماتها تلقائيًا بلا أي إجراء يدوي. لا صلة لهذا بعدّاد created/updated
    // أعلاه (صف بلا تغيير في قيمه يظل بحاجة للعلامة أول مرة فقط)
    Object.keys(wanted).forEach(function (id) {
      var w = wanted[id];
      if (w.existingMark === CUSTODY_MARK_TEXT_) return;
      var srcSheet = sheetsById[w.cfgId];
      if (!srcSheet) return;
      try { srcSheet.getRange(w.rowNumber, 8).setValue(CUSTODY_MARK_TEXT_); }
      catch (eMark) { Logger.log('custody mark H: ' + eMark.message); }
    });

    if (created || updated || deleted) {
      invalidatePaymentsMemo_();
      SpreadsheetApp.flush();
      hbLogChange_('مزامنة العهدة', 'دفعة', 'شيت العهد',
        '[مزامنة شيت العهد] جديدة: ' + created + ' · معدَّلة: ' + updated + ' · محذوفة: ' + deleted, '', '');
    }
    return { ok: true, created: created, updated: updated, deleted: deleted };
  } catch (e) {
    Logger.log('syncCustodySheets: ' + e.message);
    return { ok: false, error: e.message };
  } finally { lock.releaseLock(); }
}

// تنبيه تليجرام لكل حركة عهدة — نفس حدث "تسجيل دفعة" المستخدَم في الشاشة، فيظهر برصيد
// الطرف التراكمي بعد الحركة كما في أي دفعة أخرى (الرصيد يُحسَب في مهمة التفريغ).
// notifyEnabled=false توقف الرسالة وحدها؛ الدفعة نفسها تُسجَّل وتُسجَّل في سجل التعديلات
// بصرف النظر عنها — تعطيل التنبيهات لا يعني تعطيل المزامنة
// diffs (اختياري، مع action='تعديل' فقط): [{label, oldVal, newVal}] — عند توفّرها تُرسَل رسالة
// "تعديل بيان دفعة" مفصَّلة بكل حقل تغيّر (رقم القيد/البيان/المبلغ/...) بدل نص "تسجيل دفعة"
// العام الذي كان يُوهِم أنها دفعة جديدة رغم كونها تعديلاً على دفعة قائمة فعلاً
function custodyNotify_(w, action, notifyEnabled, diffs) {
  if (notifyEnabled === false) return;
  try {
    if (action === 'تعديل' && diffs && diffs.length) {
      var lines = [
        '✏️ <b>تعديل بيان دفعة (شيت العهد)</b>',
        '━━━━━━━━━━━━━━',
        '👤 <b>الطرف:</b> ' + tgEsc_(w.partyName || '—'),
        '━━━━━━━━━━━━━━',
        '📝 <b>ما الذي تغيّر:</b>'
      ];
      diffs.forEach(function (d) {
        lines.push('   • <b>' + tgEsc_(d.label) + '</b>');
        lines.push('      <s>' + tgEsc_(d.oldVal) + '</s>  ⟶  <b>' + tgEsc_(d.newVal) + '</b>');
      });
      lines.push('━━━━━━━━━━━━━━');
      lines.push('👤 <b>بواسطة:</b> مزامنة شيت العهد (تلقائي)');
      lines.push('⏰ ' + tgStamp_());
      tgEnqueue_('payment', {
        preformatted: lines.join('\n'),
        client: w.partyName,
        balParties: [{ name: w.partyName, roleHint: tgRoleFromDirection_(w.direction) }],
        ts: new Date().getTime()
      });
      return;
    }
    var verb = action === 'حذف' ? '🗑 حذف حركة عهدة' : '📥 حركة عهدة';
    tgEnqueue_('payment', {
      client: w.partyName, amount: w.amount,
      note: verb + ' · ' + resolveDirectionLabel_(w.direction) + (w.note ? (' — ' + w.note) : ''),
      by: 'مزامنة شيت العهد (تلقائي)',
      payDate: Utilities.formatDate(w.date, 'GMT+3', 'dd/MM/yyyy'),
      qaid: w.qaid || '',
      balParties: action === 'حذف' ? null
        : [{ name: w.partyName, roleHint: tgRoleFromDirection_(w.direction) }],
      ts: new Date().getTime()
    });
  } catch (e) { Logger.log('custodyNotify_: ' + e.message); }
}

// يُستدعى من مهمة الدقيقة الموجودة أصلًا (drainTelegramQueue) — مُقيَّد بمهلة حتى لا نفتح
// الشيت الخارجي كل دقيقة بلا داعٍ. لا يحتاج أي مشغّل جديد
function custodySyncTick_() {
  if (!getActiveCustodySheets_().length) return;
  var cache = CacheService.getScriptCache();
  try {
    if (cache.get(CUSTODY_SYNC_FLAG_)) return;
    cache.put(CUSTODY_SYNC_FLAG_, '1', Math.round(CUSTODY_SYNC_EVERY_MS_ / 1000));
  } catch (e) { /* تعذّر الكاش — نُزامن على أي حال */ }
  syncCustodySheets();
}

// زر يدوي للمزامنة الفورية من محرر Apps Script بعد أي تعديل جماعي على شيت العهد
function syncCustodyNow() {
  var res = syncCustodySheets();
  Logger.log(JSON.stringify(res));
  return res;
}

// ==========================================================
// واجهة شاشة الإعدادات — كل الدوال هنا محمية بـrequireAdmin_ (نفس حماية إعدادات تليجرام
// ومفاتيح Gemini): شيت العهد مصدر مالي حساس، فلا يُضبَط إلا من مدير النظام
// ==========================================================
function getCustodySettings(token) {
  try {
    requireAdmin_(token);
    var st = getCustodyState_();
    return safeReturn_({ ok: true, sheets: st.sheets, notifyEnabled: st.notifyEnabled !== false });
  } catch (e) { return { ok: false, error: e.message }; }
}
// sheets = [{id, sheet, startRow, holder, active}] كما تُبنى من الواجهة
function saveCustodySettings(token, sheets, notifyEnabled) {
  try {
    var admin = requireAdmin_(token);
    var clean = custodySanitizeSheets_(sheets);
    saveCustodyState_(clean, !!notifyEnabled);
    var activeCount = clean.filter(function (s) { return s.active !== false; }).length;
    hbLogChange_(admin, 'الإعدادات', 'شيت العهد',
      '[إعداد شيت العهد] الإجمالي: ' + clean.length + ' · المفعَّل: ' + activeCount +
      ' · تنبيهات تليجرام: ' + (notifyEnabled ? 'مفعّلة' : 'متوقفة'), '', '');
    return { ok: true, count: clean.length, activeCount: activeCount };
  } catch (e) { return { ok: false, error: e.message }; }
}
// اختبار الاتصال بشيت عهدة قبل حفظه: يفتحه فعليًا، يُرجع أسماء أوراقه (لاختيار الصحيحة
// منها)، وإن حُدِّدت ورقة يُرجع معاينة سريعة لعدد الحركات الصالحة فيها — كل ذلك دون كتابة
// أي شيء، لا في شيت العهد ولا في سجل الدفعات
function testCustodySheetConnection(token, id, sheetName, startRow) {
  try {
    requireAdmin_(token);
    id = String(id || '').trim();
    if (!id) throw new Error('أدخل معرّف شيت العهد أولاً (الجزء بين d/ و/edit في رابطه)');
    var ss;
    try { ss = SpreadsheetApp.openById(id); }
    catch (eOpen) { throw new Error('تعذّر فتح الشيت — تأكد من صحة المعرّف ومن مشاركته مع نفس حساب جوجل مالك هذا المشروع'); }
    var sheetNames = ss.getSheets().map(function (s) { return s.getName(); });
    var wantSheet = String(sheetName || '').trim();
    var target = wantSheet ? ss.getSheetByName(wantSheet) : ss.getSheets()[0];
    if (wantSheet && !target) {
      return safeReturn_({
        ok: true, connected: true, fileName: ss.getName(), sheetNames: sheetNames,
        warning: 'الملف مفتوح بنجاح، لكن لا توجد ورقة باسم "' + wantSheet + '" فيه — اختر اسمًا من القائمة.'
      });
    }
    var sr = Math.max(2, parseInt(startRow, 10) || 2);
    var lastRow = target.getLastRow();
    var validRows = 0, totalDataRows = 0;
    var knownNames = custodyKnownNames_();
    if (lastRow >= sr) {
      totalDataRows = lastRow - sr + 1;
      var vals = target.getRange(sr, 1, Math.min(totalDataRows, 3000), 7).getValues();
      vals.forEach(function (r) { if (custodyRowToPayment_(r, '', knownNames)) validRows++; });
    }
    return safeReturn_({
      ok: true, connected: true, fileName: ss.getName(), sheetNames: sheetNames,
      usedSheet: target.getName(), totalDataRows: totalDataRows, validRows: validRows
    });
  } catch (e) { return { ok: false, error: e.message }; }
}
// زر "مزامنة الآن" من شاشة الإعدادات — نفس المزامنة الدورية لكن فورية ومُنتظَرة النتيجة
function runCustodySyncNow(token) {
  try {
    requireAdmin_(token);
    return safeReturn_(syncCustodySheets());
  } catch (e) { return { ok: false, error: e.message }; }
}
