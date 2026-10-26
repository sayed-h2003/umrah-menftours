/* ============================================================
   🏛️ (V4.349) توحيد قنوات التسجيل المالي + طابور الاعتماد (Maker-Checker) — المرحلة 3
   ------------------------------------------------------------
   «الشاشات تقترح والحسابات تقرر»: (يُفعَّل افتراضياً — إعداد ledger_central = «لا» لإيقافه)
   • التسجيل المالي من الحسابات العامة. الاستثناء: شاشتا «حسابات عملاء العمرة» و«حسابات الوكلاء» — بشرط إلزامي: اختيار
     الحساب المقابل (خزينة/بنك/عهدة/…) من دليل الحسابات.
   • الدفعة من الشاشة لا تُكتب بالشاشة مباشرة: تُنشأ «سند قبض/صرف» مسودة برقم سند بالحسابات العامة + سطر بطابور الاعتماد.
     عند الاعتماد يُرحَّل السند وتظهر الدفعة بشاشتها فوراً (نفس مرآة V4.330) — وعند الرفض يُحذف السند (بنسخة قبله).
   • فحص التكرار الذكي قبل الإرسال: نفس الطرف + نفس المبلغ والعملة + نفس اليوم (V4.352) (بالدفتر — مرحّل أو مسودة — وبالشاشة).
     المكرر المحتمل يحتاج تأكيداً صريحاً، ويُعلَّم بالطابور ليراه المعتمِد.
   • Maker-Checker: لا يعتمد المُدخِل دفعته بنفسه (إلا المدير ويُسجَّل «اعتماد ذاتي»)، والاعتماد لصاحب صلاحية الاعتماد.
   • التسجيل من برنامج الحجوزات مغلق تماماً (إضافة/تعديل الدفعات) — يبقى الحذف القسري للمدير من المطابقة.
   • التحويل الداخلي بين عملتين بحساب العميل («تحويل») ليس حركة نقدية فيبقى كما هو.
   ============================================================ */
var LEDGER_Q_ = { name: 'GL_MakerChecker', headers: ['رقم القيد', 'الأسرة', 'الطرف', 'الرحلة', 'التاريخ', 'المبلغ', 'العملة', 'المُدخِل', 'وقت الإدخال', 'تنبيه تكرار', 'الحالة', 'المعتمِد', 'وقت القرار', 'السبب', 'رقم السند', 'الحساب المقابل'] };
var LEDGER_PEND_ = 'بانتظار الاعتماد', LEDGER_OK_ = 'معتمد', LEDGER_REJ_ = 'مرفوض', LEDGER_CAN_ = 'ملغى من المُدخِل';
var LEDGER_NEED_CP_MSG_ = '⚠️ الحساب المقابل إلزامي (خزينة/بنك/عهدة… من دليل الحسابات) — التسجيل المالي من الشاشات يمر بالحسابات العامة واعتمادها';

function _ledgerOn_() { try { return !!_glSSId_() && _glSettings_().ledger_central !== 'لا'; } catch (e) { return false; } }
function _ledgerSheet_() {
  var ss = _glSS_(), sh = ss.getSheetByName(LEDGER_Q_.name);
  if (!sh) {
    sh = ss.insertSheet(LEDGER_Q_.name);
    sh.getRange(1, 1, 1, LEDGER_Q_.headers.length).setValues([LEDGER_Q_.headers]).setFontWeight('bold');
    sh.setFrozenRows(1); try { sh.getRange('A:A').setNumberFormat('@'); sh.getRange('E:E').setNumberFormat('@'); } catch (e) {}
  }
  return sh;
}
function _ledgerRows_() {
  var sh = _ledgerSheet_(), n = sh.getLastRow(); if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, LEDGER_Q_.headers.length).getValues().map(function (r, i) { return { row: i + 2, r: r }; });
}
// حساب الطرف بدليل الحسابات (عميل: فئة عميل + «مرتبط بـ» = اسمه · وكيل: فئة وكيل — يُفضَّل الحساب الفرعي لشركته)
function _ledgerPartyAcc_(fam, party, company) {
  var k = _glNorm_(party), kind = fam === 'ap' ? 'agent' : 'client';
  var list = _glAccounts_().list.filter(function (a) { return !a.isGroup && a.active !== false && a.kind === kind && a.link && _glNorm_(a.link) === k; });
  if (!list.length) throw new Error('لا يوجد حساب بدليل الحسابات مرتبط بـ«' + party + '» (' + (kind === 'agent' ? 'وكيل' : 'عميل') + ') — أنشئه أو اربطه من دليل الحسابات أولاً');
  if (company && list.length > 1) { var c = _glNorm_(company), hit = list.filter(function (a) { return _glNorm_(a.name).indexOf(c) >= 0; })[0]; if (hit) return hit; }
  return list[0];
}
// 🔁 فحص التكرار: بالدفتر (مرحّل/مسودة) على نفس حساب الطرف + بالشاشة
function _ledgerDups_(fam, acc, party, amount, cur, date) {
  var out = [], dk = _glDKey_(date), day = function (k) { return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : 0; }, pd = day(dk);
  var near = function (d) { var k = _glDKey_(_glDate_(d)); return k && k === dk; };   // (V4.352) نفس اليوم فقط
  var E = {}; _glRows_('entries').forEach(function (r) { E[_glStr_(r[0])] = r; });
  _glRows_('lines').forEach(function (l) {
    if (_glStr_(l[4]) !== acc.code) return;
    var e = E[_glStr_(l[0])]; if (!e || _glStr_(e[5]) === GL_ST_VOID_) return;
    if (_glCur_(l[7]) !== cur || Math.abs(Math.abs(_glNum_(l[5]) - _glNum_(l[6])) - amount) > 0.5 || !near(e[2])) return;
    out.push({ where: 'الحسابات العامة', ref: _glStr_(e[0]) + (/^VCH:/.test(_glStr_(e[6])) ? ' (سند ' + _glStr_(e[6]).slice(4) + ')' : ''), date: _glDate_(e[2]), status: _glStr_(e[5]), desc: _glStr_(e[4]) });
  });
  try {
    if (fam === 'cp') {
      var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), n = sh.getLastRow();
      if (n >= 2) sh.getRange(2, 1, n - 1, 9).getValues().forEach(function (r) {
        if (_glNorm_(r[1]) !== _glNorm_(party) || Math.abs(_glNum_(r[5]) - amount) > 0.5 || (_glStr_(r[6]) || 'EGP') !== cur || !near(r[4]) || /⟦src:gl-/.test(_glStr_(r[8]))) return;
        out.push({ where: 'شاشة حسابات العملاء', ref: _glStr_(r[0]), date: _glDate_(r[4]), status: 'دفعة', desc: _glStr_(r[8]) });
      });
    } else {
      _vzReadPays_('').forEach(function (p) {
        if (_glNorm_(p.agent) !== _glNorm_(party) || Math.abs(p.amount - amount) > 0.5 || (p.currency || 'SAR') !== cur || !near(p.date) || /⟦src:gl-/.test(p.notes)) return;
        out.push({ where: 'شاشة حسابات الوكلاء', ref: p.id, date: _glDate_(p.date), status: 'دفعة', desc: p.notes });
      });
    }
  } catch (e) {}
  return out.slice(0, 8);
}
// p: {party, trip, company, date, amount, currency, desc, cp(كود الحساب المقابل), dir:'in'|'out', force}
function _ledgerSubmit_(session, fam, p) {
  var user = session.username, party = _glStr_(p.party), amount = _glR2_(_glNum_(p.amount)), cur = _glCur_(p.currency || (fam === 'ap' ? 'SAR' : 'EGP'));
  var date = _glDate_(p.date) || Utilities.formatDate(new Date(), _tz_() || 'Africa/Cairo', 'dd/MM/yyyy');
  if (!party) throw new Error('الطرف مطلوب');
  if (!(amount > 0)) throw new Error('المبلغ غير صالح');
  var cpCode = _glStr_(p.cp); if (!cpCode) return { success: false, code: 'LEDGER_NEED_CP', error: LEDGER_NEED_CP_MSG_ };
  var accs = _glAccounts_().map, cpA = accs[cpCode];
  if (!cpA || cpA.isGroup || cpA.active === false) throw new Error('الحساب المقابل ' + cpCode + ' غير صالح (اختر حساباً فرعياً نشطاً)');
  if (cpA.currency && cpA.currency !== cur && /^(safe|bank|custody)$/.test(cpA.kind || '')) throw new Error('الحساب المقابل «' + cpA.name + '» بعملة ' + cpA.currency + ' والدفعة بعملة ' + cur);
  var pA = _ledgerPartyAcc_(fam, party, p.company);
  if (pA.code === cpCode) throw new Error('الحساب المقابل هو نفس حساب الطرف');
  var dups = _ledgerDups_(fam, pA, party, amount, cur, date);
  if (dups.length && !p.force) return { success: false, dup: true, dups: dups, error: '🔁 دفعة مشابهة مسجَّلة بالفعل (نفس الطرف والمبلغ في نفس اليوم) — راجعها أو أكّد التسجيل' };
  var dirIn = fam === 'ap' ? p.dir === 'in' : p.dir !== 'out';   // عميل: قبض افتراضياً · وكيل: صرف افتراضياً
  var type = dirIn ? 'سند قبض' : 'سند صرف', fx = _glFxDailyMap_(), rate = cur === 'EGP' ? 1 : _glFxRateAt_(cur, date, fx).rate;
  var desc = _glStr_(p.desc) || ((dirIn ? 'دفعة من ' : 'دفعة إلى ') + party);
  var trip = fam === 'cp' ? (_glStr_(p.trip) || '') : '';
  var partyLine = { account: pA.code, debit: dirIn ? 0 : amount, credit: dirIn ? amount : 0, currency: cur, rate: rate, trip: trip === 'عام' ? '' : trip, company: _glStr_(p.company), desc: desc };
  var cashLine = { account: cpCode, debit: dirIn ? amount : 0, credit: dirIn ? 0 : amount, currency: cur, rate: rate, desc: desc };
  var e = { date: date, type: type, desc: desc, ref: 'SCR:' + fam, company: _glStr_(p.company), lines: [cashLine, partyLine] };
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var v = _glValidate_(e, {}), seq = _glNextEntrySeq_(1), id = _glEntryId_(seq), vno = _glNextVoucherNo_(type);
    var w = _glWriteEntry_(v, { id: id, seq: seq, status: GL_ST_DRAFT_, sourceKey: 'VCH:' + vno, desc: desc, ref: 'SCR:' + fam, trip: trip === 'عام' ? '' : trip, company: _glStr_(p.company) }, user);
    var eSh = _glSheet_('entries'), lSh = _glSheet_('lines');
    eSh.getRange(eSh.getLastRow() + 1, 1, 1, w.eRow.length).setValues([w.eRow]);
    lSh.getRange(lSh.getLastRow() + 1, 1, w.lRows.length, w.lRows[0].length).setValues(w.lRows);
    var q = _ledgerSheet_();
    q.getRange(q.getLastRow() + 1, 1, 1, LEDGER_Q_.headers.length).setValues([[id, fam, party, trip, date, dirIn ? amount : -amount, cur, user, _glNow_(),
      dups.length ? dups.map(function (d) { return d.where + ': ' + d.ref + ' ' + d.date; }).join(' · ') : '', LEDGER_PEND_, '', '', '', vno, cpA.code + ' — ' + cpA.name]]);
    if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(user, id, null, _audSnapRows_(w.eRow, w.lRows), 'دفعة من شاشة ⇒ طابور الاعتماد');
    logChange_(user, 'دفعة من الشاشة بانتظار الاعتماد', 'GL:' + id, fam === 'ap' ? 'حسابات الوكلاء' : 'حسابات العملاء', '-', party + ' — ' + amount + ' ' + cur + ' — سند ' + vno + (dups.length ? ' (⚠️ تكرار محتمل)' : ''));
    try { _glBotQ_('vch_new', _glBotWho_(_glBotEntryInfo_(id, w.eRow, w.lRows), session)); } catch (eB) {}
    return { success: true, pending: true, id: id, voucherNo: vno, dupFlag: dups.length > 0 };
  } finally { _glUnlock_(lock); }
}
// تسجيل من الشاشات (يُستدعى من saveAccPayment / saveAgentPayment وأخواتها عند تفعيل التوحيد)
function _ledgerFromScreen_(session, fam, rows, opts) {
  opts = opts || {};
  var res = [], need = rows.some(function (r) { return !_glStr_(r.cp); });
  if (need) return { success: false, code: 'LEDGER_NEED_CP', error: LEDGER_NEED_CP_MSG_ };
  for (var i = 0; i < rows.length; i++) {
    var r = _ledgerSubmit_(session, fam, Object.assign({ force: opts.bulk }, rows[i]));
    if (!r.success) { if (rows.length === 1) return r; res.push({ ok: false, error: r.error }); continue; }
    res.push({ ok: true, id: r.id, voucherNo: r.voucherNo, dupFlag: r.dupFlag });
  }
  var okN = res.filter(function (x) { return x.ok; }).length;
  return { success: okN > 0, pending: true, count: okN, results: res, id: (res[0] || {}).id, voucherNo: (res[0] || {}).voucherNo,
    error: okN ? '' : (res[0] || {}).error };
}

/* ---------- 📥 طابور الاعتماد ---------- */
function ledgerQueue(authToken, opts) {
  var session = requireAuth_(authToken); opts = opts || {};
  var can = _glCanApprove_(session), E = {}, L = {}, accs = _glAccounts_().map;
  _glRows_('entries').forEach(function (r) { E[_glStr_(r[0])] = r; });
  var rows = _ledgerRows_().filter(function (x) { return can || _glStr_(x.r[7]) === session.username; });
  var pend = [], done = [];
  rows.forEach(function (x) {
    var r = x.r, o = { id: _glStr_(r[0]), fam: _glStr_(r[1]), party: _glStr_(r[2]), trip: _glStr_(r[3]), date: _glDate_(r[4]), amount: _glNum_(r[5]), cur: _glStr_(r[6]),
      maker: _glStr_(r[7]), at: _glStr_(r[8]), dup: _glStr_(r[9]), status: _glStr_(r[10]), checker: _glStr_(r[11]), decidedAt: _glStr_(r[12]), reason: _glStr_(r[13]), voucher: _glStr_(r[14]), counter: _glStr_(r[15]) };
    var e = E[o.id]; o.desc = e ? _glStr_(e[4]) : ''; o.exists = !!e;
    if (o.status === LEDGER_PEND_) { o.mine = o.maker === session.username; pend.push(o); } else done.push(o);
  });
  return { success: true, pending: pend, done: done.reverse().slice(0, opts.doneN || 60), canApprove: can, me: session.username, isAdmin: _glIsAdmin_(session), on: _ledgerOn_() };
}
// عدد الدفعات بانتظار الاعتماد (للشريط) — للمعتمِد: الكل · لغيره: دفعاته فقط
function ledgerCount(authToken) {
  var s = requireAuth_(authToken), can = _glCanApprove_(s);
  if (!_glSSId_()) return { success: true, n: 0 };
  var n = 0; _ledgerRows_().forEach(function (x) { if (_glStr_(x.r[10]) === LEDGER_PEND_ && (can || _glStr_(x.r[7]) === s.username)) n++; });
  return { success: true, n: n, canApprove: can };
}
// للشاشات: الدفعات بانتظار الاعتماد لطرف واحد
function ledgerPendingFor(authToken, fam, party) {
  requireAuth_(authToken);
  var k = _glNorm_(party);
  return { success: true, rows: _ledgerRows_().filter(function (x) { return _glStr_(x.r[10]) === LEDGER_PEND_ && _glStr_(x.r[1]) === fam && _glNorm_(x.r[2]) === k; })
    .map(function (x) { var r = x.r; return { id: _glStr_(r[0]), trip: _glStr_(r[3]), date: _glDate_(r[4]), amount: _glNum_(r[5]), cur: _glStr_(r[6]), maker: _glStr_(r[7]), voucher: _glStr_(r[14]), counter: _glStr_(r[15]), dup: _glStr_(r[9]) }; }) };
}
// يُستدعى قبل ترحيل أي قيد مصدره شاشة (من الطابور أو من glPostEntry/glSaveEntry) — يفرض Maker-Checker
function _ledgerPostCheck_(entryId, session) {
  var hit = _ledgerRows_().filter(function (x) { return _glStr_(x.r[0]) === _glStr_(entryId) && _glStr_(x.r[10]) === LEDGER_PEND_; }).pop();
  if (!hit) return null;
  if (!_glCanApprove_(session)) throw new Error('اعتماد دفعات الشاشات لصاحب صلاحية «اعتماد» الحسابات العامة أو المدير');
  var self = _glStr_(hit.r[7]) === session.username;
  if (self && !_glIsAdmin_(session)) throw new Error('🔒 مبدأ الفصل (Maker-Checker): لا يعتمد المُدخِل دفعته بنفسه — يعتمدها مستخدم آخر');
  return { row: hit.row, self: self };
}
function _ledgerMark_(row, status, user, reason) {
  _ledgerSheet_().getRange(row, 11, 1, 4).setValues([[status, user, _glNow_(), reason || '']]);
}
// decision: 'approve' | 'reject'
function ledgerDecide(authToken, ids, decision, reason) {
  var session = requireAuth_(authToken), out = [], user = session.username;
  ids = (Array.isArray(ids) ? ids : [ids]).map(_glStr_).filter(Boolean);
  // (V4.352) سبب الرفض اختياري
  ids.forEach(function (id) {
    try {
      var chk = _ledgerPostCheck_(id, session); if (!chk) throw new Error('ليس بانتظار الاعتماد');
      if (decision === 'approve') {
        var lock = _glLock_(); lock.waitLock(30000);
        try {
          var f = _glFindEntry_(id); if (!f) throw new Error('السند غير موجود (حُذف؟)');
          if (_glStr_(f.r[5]) !== GL_ST_DRAFT_) throw new Error('السند ليس مسودة');
          _glValidate_(_glEntryFull_(id));
          _glSheet_('entries').getRange(f.row, 6).setValue(GL_ST_POSTED_);
          _glSheet_('entries').getRange(f.row, 15, 1, 2).setValues([[user, _glNow_()]]);
          _glSetLinesStatus_([id], GL_ST_POSTED_);
          _ledgerMark_(chk.row, LEDGER_OK_, user, chk.self ? 'اعتماد ذاتي (مدير)' : '');
          logChange_(user, chk.self ? 'اعتماد ذاتي لدفعة شاشة (مدير)' : 'اعتماد دفعة شاشة', 'GL:' + id, 'الحالة', GL_ST_DRAFT_, GL_ST_POSTED_);
          _glSyncVoucherPays_(id, user);   // ⇒ تظهر الدفعة بشاشتها فوراً
        } finally { _glUnlock_(lock); }
      } else {
        var lock2 = _glLock_(); lock2.waitLock(30000);
        try {
          var f2 = _glFindEntry_(id);
          if (f2) {
            if (_glStr_(f2.r[5]) !== GL_ST_DRAFT_) throw new Error('السند ليس مسودة');
            var ls = _glLinesOf_(id);
            if (typeof _snapEntryTake_ === 'function') _snapEntryTake_(id, f2.r, ls, 'قبل رفض دفعة شاشة', user);
            if (typeof _audEntryDiff_ === 'function') _audEntryDiff_(user, id, _audSnapRows_(f2.r, ls), null, 'رفض دفعة شاشة');
            _glDeleteLinesOf_([id]); _glSheet_('entries').deleteRow(f2.row);
          }
          _ledgerMark_(chk.row, LEDGER_REJ_, user, reason);
          logChange_(user, 'رفض دفعة شاشة', 'GL:' + id, 'السبب', '-', _glStr_(reason));
        } finally { _glUnlock_(lock2); }
      }
      out.push({ id: id, ok: true });
    } catch (e) { out.push({ id: id, ok: false, error: e.message }); }
  });
  return { success: true, results: out, done: out.filter(function (x) { return x.ok; }).length };
}
// المُدخِل يسحب دفعته قبل اعتمادها
function ledgerCancel(authToken, id) {
  var session = requireAuth_(authToken); id = _glStr_(id);
  var hit = _ledgerRows_().filter(function (x) { return _glStr_(x.r[0]) === id && _glStr_(x.r[10]) === LEDGER_PEND_; }).pop();
  if (!hit) throw new Error('ليس بانتظار الاعتماد');
  if (_glStr_(hit.r[7]) !== session.username && !_glCanApprove_(session)) throw new Error('يسحبها مُدخِلها أو المعتمِد فقط');
  var lock = _glLock_(); lock.waitLock(30000);
  try {
    var f = _glFindEntry_(id);
    if (f && _glStr_(f.r[5]) === GL_ST_DRAFT_) { var ls = _glLinesOf_(id); if (typeof _snapEntryTake_ === 'function') _snapEntryTake_(id, f.r, ls, 'قبل سحب دفعة شاشة', session.username); _glDeleteLinesOf_([id]); _glSheet_('entries').deleteRow(f.row); }
    _ledgerMark_(hit.row, LEDGER_CAN_, session.username, '');
    logChange_(session.username, 'سحب دفعة شاشة قبل الاعتماد', 'GL:' + id, '-', '-', '-');
  } finally { _glUnlock_(lock); }
  return { success: true };
}
function ledgerSetMode(authToken, on) {
  var s = requireAuth_(authToken); if (!_glIsAdmin_(s)) throw new Error('للمدير فقط');
  _glSetSetting_('ledger_central', on ? 'نعم' : 'لا');
  logChange_(s.username, 'توحيد قنوات التسجيل المالي', 'GL:SETTINGS', 'ledger_central', on ? 'لا' : 'نعم', on ? 'نعم' : 'لا');
  return { success: true, on: !!on };
}

/* ⚡ (V4.351) نداء مجمّع: عدة قراءات بنداء واحد (كل نداء لـ Apps Script ثانية تقريباً مهما صغر) — قائمة بيضاء للقراءة فقط */
function _appBatchFns_() {
  return { ledgerCount: ledgerCount, ledgerPendingFor: ledgerPendingFor, ledgerQueue: ledgerQueue, glReconLast: glReconLast, audStatus: audStatus, snapPoints: snapPoints,
    snapScreens: snapScreens, glEntrySnaps: glEntrySnaps, glDeletedEntries: glDeletedEntries, glGetEntry: glGetEntry, snapRowList: snapRowList };
}
function appBatch(authToken, calls) {
  requireAuth_(authToken);
  var F = _appBatchFns_();
  return { success: true, results: (calls || []).slice(0, 12).map(function (c) {
    var fn = String((c && c.fn) || ''), f = F.hasOwnProperty(fn) ? F[fn] : null;
    if (typeof f !== 'function') return { ok: false, error: 'غير مسموح: ' + fn };
    try { return { ok: true, r: f.apply(null, [authToken].concat((c && c.args) || [])) }; } catch (e) { return { ok: false, error: e.message }; }
  }) };
}
