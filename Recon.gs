/* ============================================================
   🔗 (V4.348) محرك المطابقة الموحّد — دفعات الشاشات ⇄ القيود بالدفتر العام
   ------------------------------------------------------------
   • الأسر: «cp» دفعات عملاء العمرة · «ap» دفعات الوكلاء · «hb» دفعات الحجوزات (السكن والموردون).
   • لكل دفعة: يُحدَّد قيدها (العلامة ⟦src:gl-…⟧ للنسخ من الحسابات العامة، أو القيد التلقائي AUTO:CP/AP/HBP بمعرّفها، أو ربط
     يدوي محفوظ) ثم يُفحص: القيد موجود ومرحّل؟ المبلغ والعملة والتاريخ مطابقة؟ — وبالعكس: كل قيد مرحّل على حساب طرف
     (عميل/وكيل/طرف حجوزات) له دفعة بشاشته؟
   • الحالات: ✅ مطابقة · ⚠️ فرق (مبلغ/عملة/تاريخ) · ❌ دفعة بلا قيد · ❌ قيد بلا دفعة بالشاشة · ⛔ قيدها ملغى/محذوف · 🔁 مكرر محتمل
     · ⚪ معلَّمة «لا تحتاج قيداً».
   • «زر المطابقة الواحد»: يفحص الكل ويصلح الآمن تلقائياً فقط (ربط دفعة بقيد مرشَّح وحيد مطابق تماماً، إنشاء نسخة الشاشة الناقصة
     لقيد، إعادة مزامنة نسخة تختلف عن قيدها) ويحفظ الفهرس (GL_ReconIndex) — والباقي بتقرير الفروقات للربط اليدوي/فتح القيد.
   • الروابط اليدوية بورقة GL_ReconLinks (تُقرأ أيضاً بشاشات العملاء/الوكلاء/كشف الفندق لعرض رقم القيد والسند).
   ============================================================ */
var RECON_IDX_ = { name: 'GL_ReconIndex', headers: ['الأسرة', 'المفتاح', 'الطرف', 'الرحلة', 'التاريخ', 'المبلغ', 'العملة', 'البيان', 'رقم القيد', 'رقم السند', 'الحالة', 'ملاحظة', 'فُحص في'] };
var RECON_LNK_ = { name: 'GL_ReconLinks', headers: ['المفتاح', 'رقم القيد', 'النوع', 'بواسطة', 'في'] };
var RECON_FAM_ = { cp: 'دفعات عملاء العمرة', ap: 'دفعات الوكلاء', hb: 'دفعات الحجوزات' };
var RECON_ST_ = { ok: '✅ مطابقة', diff: '⚠️ فرق', noentry: '❌ دفعة بلا قيد', nopay: '❌ قيد بلا دفعة بالشاشة', void: '⛔ قيدها ملغى/محذوف', dup: '🔁 مكرر محتمل', ignored: '⚪ لا تحتاج قيداً' };
var _RECON_LNK_MEMO_ = null;

function _reconSheet_(def) {
  var ss = _glSS_(), sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try { sh.getRange('A:B').setNumberFormat('@'); } catch (e) {}
  }
  return sh;
}
// الروابط اليدوية: {مفتاح: {entry, kind}} — kind: link (ربط بقيد) | noent (لا تحتاج قيداً)
function _reconLinks_() {
  if (_RECON_LNK_MEMO_) return _RECON_LNK_MEMO_;
  var m = {};
  try { var sh = _reconSheet_(RECON_LNK_), n = sh.getLastRow(); if (n >= 2) sh.getRange(2, 1, n - 1, 3).getValues().forEach(function (r) { var k = _glStr_(r[0]); if (k) m[k] = { entry: _glStr_(r[1]), kind: _glStr_(r[2]) || 'link' }; }); } catch (e) {}
  try { var hl = JSON.parse(_glSettings_().hb_paylink || '{}') || {}, hn = JSON.parse(_glSettings_().hb_paynoent || '{}') || {};   // الروابط القديمة لكشف الفندق (V4.341)
    Object.keys(hl).forEach(function (k) { if (!m['hb:' + k]) m['hb:' + k] = { entry: hl[k], kind: 'link' }; });
    Object.keys(hn).forEach(function (k) { if (!m['hb:' + k]) m['hb:' + k] = { entry: '', kind: 'noent' }; }); } catch (e) {}
  return (_RECON_LNK_MEMO_ = m);
}
function _reconLinkOf_(key) { var x = _reconLinks_()[key]; return x && x.kind === 'link' ? x.entry : ''; }
function _reconLinkSet_(key, entry, kind, user) {
  var sh = _reconSheet_(RECON_LNK_), n = sh.getLastRow(), at = -1;
  if (n >= 2) { var ks = sh.getRange(2, 1, n - 1, 1).getValues(); for (var i = 0; i < ks.length; i++) if (_glStr_(ks[i][0]) === key) { at = i + 2; break; } }
  if (!kind) { if (at > 0) sh.deleteRow(at); }
  else { var row = [[key, entry || '', kind, user || '', _glNow_()]]; if (at > 0) sh.getRange(at, 1, 1, 5).setValues(row); else sh.getRange(n + 1, 1, 1, 5).setValues(row); }
  if (/^hb:/.test(key)) { var pid = key.slice(3); try { _glHbPayMapSet_('hb_paylink', pid, kind === 'link' ? entry : ''); _glHbPayMapSet_('hb_paynoent', pid, kind === 'noent' ? '1' : ''); } catch (e) {} }
  _RECON_LNK_MEMO_ = null;
}
var GL_TAG_RX_ = /⟦src:gl-([^⟧]+)⟧/;
function _reconDay_(k) { return k ? Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)) / 864e5 : 0; }

/* ---------- البناء: سياق الدفتر مرة واحدة ---------- */
function _reconCtx_() {
  var E = {}, L = {}, bySk = {}, accs = _glAccounts_().map;
  _glRows_('entries').forEach(function (r) {
    var id = _glStr_(r[0]); if (!id) return;
    var sk = _glStr_(r[6]), vm = /^VCH:(.+)$/.exec(sk);
    E[id] = { id: id, sk: sk, st: _glStr_(r[5]), type: _glStr_(r[3]), date: _glDate_(r[2]), desc: _glStr_(r[4]), vno: vm ? vm[1] : '' };
    if (sk && E[id].st !== GL_ST_VOID_) bySk[sk] = id;
  });
  _glRows_('lines').forEach(function (l) { var id = _glStr_(l[0]); if (id) (L[id] = L[id] || []).push(l); });
  return { E: E, L: L, bySk: bySk, accs: accs, hid: _glScrHide_(), links: _reconLinks_() };
}
function _reconRow_(fam, key, o) {
  return { fam: fam, key: key, party: o.party || '', trip: o.trip || '', date: o.date || '', amount: _glR2_(o.amount || 0), cur: o.cur || '', desc: String(o.desc || '').replace(GL_TAG_RX_, '').trim().slice(0, 160),
    entry: o.entry || '', voucher: o.voucher || '', status: o.status, note: o.note || '', how: o.how || '', cands: o.cands || [] };
}
// مبلغ طرف بقيد: مجموع أسطر حسابات الطرف (pred) بعملة معيّنة — sign: +1 دائن−مدين (عميل) · −1 مدين−دائن (وكيل)
function _reconPartyAmt_(lines, pred, accs, sign) {
  var by = {};
  (lines || []).forEach(function (l) {
    var a = accs[_glStr_(l[4])]; if (!a || !pred(a)) return;
    var c = _glCur_(l[7]), net = (_glNum_(l[6]) - _glNum_(l[5])) * sign;
    if (c !== 'EGP' && c !== 'SAR') { c = 'EGP'; net = (_glNum_(l[10]) - _glNum_(l[9])) * sign; }
    by[c] = _glR2_((by[c] || 0) + net);
  });
  return by;
}

/* ---------- 💳 دفعات عملاء العمرة ---------- */
function _reconCp_(X, out, claimed) {
  var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), n = sh.getLastRow(); if (n < 2) return;
  var vals = sh.getRange(2, 1, n - 1, ACC_PAY_HEADERS.length).getValues(), mirrored = {}, rows = [];
  var isCl = function (client) { var k = _glNorm_(client); return function (a) { return a.kind === 'client' && a.link && _glNorm_(a.link) === k; }; };
  vals.forEach(function (v) {
    var id = _glStr_(v[0]); if (!id) return;
    var p = { id: id, client: _glStr_(v[1]), trip: _glStr_(v[2]), type: _glStr_(v[3]), date: _glDate_(v[4]), amount: _glNum_(v[5]), cur: _glStr_(v[6]) || 'EGP', desc: _glStr_(v[8]) };
    var tag = (GL_TAG_RX_.exec(p.desc) || [])[1] || '', man = X.links['cp:' + id], how = '', eid = '';
    if (tag) { eid = tag; how = 'نسخة قيد'; mirrored[tag] = (mirrored[tag] || 0) + 1; }
    else if (man && man.kind === 'noent') { out.push(_reconRow_('cp', 'cp:' + id, { party: p.client, trip: p.trip, date: p.date, amount: p.amount, cur: p.cur, desc: p.desc, status: 'ignored' })); return; }
    else if (man && man.entry) { eid = man.entry; how = 'ربط يدوي'; }
    else if (X.bySk['AUTO:CP:' + id]) { eid = X.bySk['AUTO:CP:' + id]; how = 'قيد تلقائي'; }
    rows.push({ p: p, eid: eid, how: how, tag: !!tag });
    if (eid) claimed[eid] = 1;
  });
  rows.forEach(function (x) {
    var p = x.p, base = { party: p.client, trip: p.trip, date: p.date, amount: p.amount, cur: p.cur, desc: p.desc, how: x.how };
    if (!x.eid) { base.status = 'noentry'; base.cands = _reconCands_(X, isCl(p.client), 1, p, claimed); out.push(_reconRow_('cp', 'cp:' + p.id, base)); return; }
    var e = X.E[x.eid]; base.entry = x.eid; base.voucher = e ? e.vno : '';
    if (!e || e.st === GL_ST_VOID_) { base.status = 'void'; base.note = e ? 'القيد ملغى' : 'القيد غير موجود بالدفتر'; out.push(_reconRow_('cp', 'cp:' + p.id, base)); return; }
    if (e.st !== GL_ST_POSTED_) { base.status = 'diff'; base.note = 'القيد مسودة غير مرحّل'; out.push(_reconRow_('cp', 'cp:' + p.id, base)); return; }
    var by = _reconPartyAmt_(X.L[x.eid], isCl(p.client), X.accs, 1), notes = [];
    if (!x.tag || (X.links['cp:' + p.id] || {}).kind === 'link') {
      var ga = by[p.cur]; if (ga == null) notes.push('لا سطر للعميل بعملة ' + p.cur + ' بالقيد');
      else if (Math.abs(Math.abs(ga) - Math.abs(p.amount)) > 0.5) notes.push('المبلغ: الشاشة ' + _glFmtN_(p.amount) + ' ⇐ القيد ' + _glFmtN_(ga));
      if (_glDKey_(e.date) !== _glDKey_(p.date)) notes.push('التاريخ: الشاشة ' + p.date + ' ⇐ القيد ' + e.date);
    }
    base.status = notes.length ? 'diff' : 'ok'; base.note = notes.join(' · ');
    out.push(_reconRow_('cp', 'cp:' + p.id, base));
  });
  // قيد مرحّل بسطر على حساب عميل بلا نسخة بالشاشة
  Object.keys(X.E).forEach(function (eid) {
    var e = X.E[eid]; if (e.st !== GL_ST_POSTED_ || mirrored[eid] || claimed[eid] || !_glCpEligible_(e.type, e.sk)) return;
    var seen = {};
    (X.L[eid] || []).forEach(function (l) {
      var a = X.accs[_glStr_(l[4])]; if (!a || a.kind !== 'client' || !a.link || seen[a.link]) return; seen[a.link] = 1;
      if (X.hid['cp|' + eid + '|' + a.link]) return;
      var by = _reconPartyAmt_(X.L[eid], function (b) { return b === a; }, X.accs, 1), c = Object.keys(by)[0] || 'EGP';
      if (!by[c]) return;
      out.push(_reconRow_('cp', 'gl:' + eid + ':' + a.link, { party: a.link, date: e.date, amount: by[c], cur: c, desc: e.desc, entry: eid, voucher: e.vno, status: 'nopay', note: 'القيد على حساب العميل ولا دفعة له بشاشة حسابات العملاء' }));
    });
  });
}
// مرشَّحات قيود لدفعة بلا قيد: نفس الطرف + نفس الإشارة والعملة + مبلغ ±0.5 + تاريخ ±7 أيام، غير مربوطة بدفعة أخرى
function _reconCands_(X, pred, sign, p, claimed) {
  var pd = _reconDay_(_glDKey_(p.date)), out = [], DENY = /^(AUTO:(HB:|HBOPEN|TRIP:|CI:|CAT|TR|MF|VZ|OPEN)|CLOSE:)/;
  Object.keys(X.L).forEach(function (eid) {
    var e = X.E[eid]; if (!e || e.st !== GL_ST_POSTED_ || claimed[eid] || DENY.test(e.sk) || e.type === 'قيد افتتاحي') return;
    var by = _reconPartyAmt_(X.L[eid], pred, X.accs, sign), ga = by[p.cur]; if (ga == null) return;
    if (Math.abs(ga - p.amount) > 0.5) return;
    var dd = Math.abs(_reconDay_(_glDKey_(e.date)) - pd); if (dd > 7) return;
    out.push({ entry: eid, date: e.date, amount: ga, voucher: e.vno, desc: e.desc, type: e.type, dd: dd });
  });
  return out.sort(function (a, b) { return a.dd - b.dd; }).slice(0, 5);
}

/* ---------- 🧑‍💼 دفعات الوكلاء ---------- */
function _reconAp_(X, out, claimed) {
  var pays = _vzReadPays_(''), mirrored = {};
  var isAg = function (a) { return a.kind === 'agent'; };
  var agentPred = function (agent) { var k = _glNorm_(agent); return function (a) { return a.kind === 'agent' && (!a.link || _glNorm_(a.link) === k || _glNorm_(a.link).indexOf(k) >= 0 || k.indexOf(_glNorm_(a.link)) >= 0); }; };
  var rows = [];
  pays.forEach(function (p) {
    if (!p.id) return;
    var tag = _vzGlSrc_(p.notes), man = X.links['ap:' + p.id], eid = '', how = '';
    if (tag) { eid = tag; how = 'نسخة قيد'; mirrored[tag] = 1; }
    else if (man && man.kind === 'noent') { out.push(_reconRow_('ap', 'ap:' + p.id, { party: p.agent, date: p.date, amount: p.amount, cur: p.currency, desc: p.notes, status: 'ignored' })); return; }
    else if (man && man.entry) { eid = man.entry; how = 'ربط يدوي'; }
    else if (X.bySk['AUTO:AP:' + p.id]) { eid = X.bySk['AUTO:AP:' + p.id]; how = 'قيد تلقائي'; }
    rows.push({ p: p, eid: eid, how: how, tag: !!tag }); if (eid) claimed[eid] = 1;
  });
  rows.forEach(function (x) {
    var p = x.p, base = { party: p.agent, date: _glDate_(p.date), amount: p.amount, cur: p.currency || 'SAR', desc: p.notes, how: x.how };
    if (!x.eid) { base.status = 'noentry'; base.cands = _reconCands_(X, agentPred(p.agent), -1, { date: base.date, amount: p.amount, cur: base.cur }, claimed); out.push(_reconRow_('ap', 'ap:' + p.id, base)); return; }
    var e = X.E[x.eid]; base.entry = x.eid; base.voucher = e ? e.vno : '';
    if (!e || e.st === GL_ST_VOID_) { base.status = 'void'; base.note = e ? 'القيد ملغى' : 'القيد غير موجود بالدفتر'; out.push(_reconRow_('ap', 'ap:' + p.id, base)); return; }
    var by = _reconPartyAmt_(X.L[x.eid], isAg, X.accs, -1), ga = by[base.cur], notes = [];
    if (!x.tag) {
      if (ga == null) notes.push('لا سطر وكيل بعملة ' + base.cur + ' بالقيد');
      else if (Math.abs(Math.abs(ga) - Math.abs(p.amount)) > 0.5) notes.push('المبلغ: الشاشة ' + _glFmtN_(p.amount) + ' ⇐ القيد ' + _glFmtN_(ga));
      if (_glDKey_(e.date) !== _glDKey_(base.date)) notes.push('التاريخ: الشاشة ' + base.date + ' ⇐ القيد ' + e.date);
    }
    base.status = notes.length ? 'diff' : 'ok'; base.note = notes.join(' · ');
    out.push(_reconRow_('ap', 'ap:' + p.id, base));
  });
  // قيود نقدية على حساب وكيل بلا نسخة بالشاشة (المرآة تنسخ القيود المؤهلة فقط)
  var apIdx = {}; try { apIdx = _glApIdx_() || {}; } catch (e) {}
  Object.keys(X.E).forEach(function (eid) {
    var e = X.E[eid]; if (e.st !== GL_ST_POSTED_ || mirrored[eid] || claimed[eid] || apIdx[eid]) return;
    if (!_glApEligible_({ status: e.st, type: e.type, sourceKey: e.sk })) return;
    var agL = (X.L[eid] || []).filter(function (l) { var a = X.accs[_glStr_(l[4])]; return a && a.kind === 'agent' && _glStr_(a.link); });
    if (!agL.length) return;
    var a0 = X.accs[_glStr_(agL[0][4])], by = _reconPartyAmt_(agL, isAg, X.accs, -1), c = Object.keys(by)[0] || 'SAR';
    out.push(_reconRow_('ap', 'gl:' + eid + ':' + a0.link, { party: a0.link, date: e.date, amount: by[c] || 0, cur: c, desc: e.desc, entry: eid, voucher: e.vno, status: 'nopay', note: 'القيد على حساب وكيل ولا نسخة له بشاشة حسابات الوكلاء' }));
  });
}

/* ---------- 🏨 دفعات الحجوزات ---------- */
function _reconHb_(X, out) {
  var c = _glHbCfg_(); if (!c.ssId) return;
  var sh = SpreadsheetApp.openById(c.ssId).getSheetByName(c.pay); if (!sh || sh.getLastRow() < 2) return;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues(), pays = [], mirrored = {};
  vals.forEach(function (r, i) {
    var party = _glStr_(r[1]), amt = _glR2_(parseFloat(r[3]) || 0), dir = _glStr_(r[2]); if (!party || !amt || /يدوي/.test(dir)) return;
    var id = _glStr_(r[7]) || ('row' + (i + 2)), m = /^GL:(.+):\d+$/.exec(id); if (m) mirrored[m[1]] = 1;
    pays.push({ id: id, party: party, date: _glAutoDate_(r[0]), dir: dir, amount: amt, note: _glStr_(r[4]), link: _glStr_(r[9]) });
  });
  var refs = _glHbPayRefs_(pays);
  pays.forEach(function (p) {
    var ref = refs[p.id], base = { party: p.party, date: p.date, amount: /استلمنا/.test(p.dir) ? p.amount : -p.amount, cur: 'SAR', desc: p.note };
    if (ref && ref.how === 'ignored') { base.status = 'ignored'; out.push(_reconRow_('hb', 'hb:' + p.id, base)); return; }
    if (!ref || !ref.entry) { base.status = 'noentry'; base.note = 'دفعة بكشف الفندق بلا قيد مطابق'; out.push(_reconRow_('hb', 'hb:' + p.id, base)); return; }
    var e = X.E[ref.entry]; base.entry = ref.entry; base.voucher = ref.voucher; base.how = { manual: 'ربط يدوي', match: 'مطابقة تلقائية' }[ref.how] || (/^GL:/.test(p.id) ? 'نسخة قيد' : 'قيد تلقائي');
    base.status = (!e || e.st === GL_ST_VOID_) ? 'void' : 'ok';
    out.push(_reconRow_('hb', 'hb:' + p.id, base));
  });
  // قيود على أطراف الحجوزات بلا نسخة بكشف الفندق (القيد مؤهل للنسخ ولم يُنسخ)
  var parties = {}; try { parties = _glHbMirrorParties_(); } catch (e0) {}
  var claimed = {}; Object.keys(refs).forEach(function (k) { if (refs[k] && refs[k].entry) claimed[refs[k].entry] = 1; });
  Object.keys(X.E).forEach(function (eid) {
    var e = X.E[eid]; if (e.st !== GL_ST_POSTED_ || mirrored[eid] || claimed[eid] || /^AUTO:HB/.test(e.sk)) return;
    if (e.type === 'قيد افتتاحي' || e.type === 'قيد إقفال') return;
    (X.L[eid] || []).some(function (l) {
      var nm = parties[_glStr_(l[4])]; if (!nm) return false;
      if (X.hid['hbp|' + eid + '|' + _glHbKey_(nm)]) return false;
      var net = _glR2_(_glNum_(l[6]) - _glNum_(l[5])); if (!net) return false;
      out.push(_reconRow_('hb', 'gl:' + eid + ':' + nm, { party: nm, date: e.date, amount: net, cur: _glCur_(l[7]), desc: e.desc, entry: eid, voucher: e.vno, status: 'nopay', note: 'القيد على طرف حجوزات ولا نسخة له بكشف الفندق' }));
      return true;
    });
  });
}

/* ---------- 🔁 مكرر محتمل: دفعتان لنفس الطرف بنفس المبلغ والتاريخ (إحداهما نسخة قيد والأخرى من الشاشة) ---------- */
function _reconDups_(out) {
  var g = {};
  out.forEach(function (r, i) { if (!/^(cp|ap|hb):/.test(r.key) || r.status === 'ignored') return; var k = r.fam + '|' + _glNorm_(r.party) + '|' + _glDKey_(r.date) + '|' + Math.abs(r.amount) + '|' + r.cur; (g[k] = g[k] || []).push(i); });
  Object.keys(g).forEach(function (k) {
    var ix = g[k]; if (ix.length < 2) return;
    var ents = {}; ix.forEach(function (i) { if (out[i].entry) ents[out[i].entry] = 1; });
    if (Object.keys(ents).length === 1 && ix.every(function (i) { return out[i].entry; })) return;   // نفس القيد لأطراف/رحلات مختلفة — طبيعي
    var noEnt = ix.filter(function (i) { return !out[i].entry; }), mark = noEnt.length ? noEnt : ix;   // الدفعة الزائدة (بلا قيد) هي المشتبه بها — لا نسختها المطابقة
    mark.forEach(function (i) { if (out[i].status === 'ok' || out[i].status === 'noentry') { out[i].status = 'dup'; out[i].note = (out[i].note ? out[i].note + ' · ' : '') + 'دفعة أخرى لنفس الطرف بنفس المبلغ والتاريخ (' + ix.length + ')'; } });
  });
}

/* ---------- ▶️ زر المطابقة الواحد ---------- */
// opts: {fix: true|false, fams: ['cp','ap','hb']}
function glReconRun(authToken, opts) {
  opts = opts || {};
  var session = opts.fix ? _glAdminPerm_(authToken) : _glPerm_(authToken, 'view', 'stmt');
  var fams = opts.fams && opts.fams.length ? opts.fams : ['cp', 'ap', 'hb'], t0 = Date.now(), fixed = { link: 0, mirror: 0, resync: 0 }, errs = [];
  var run = function () {
    _RECON_LNK_MEMO_ = null;
    var X = _reconCtx_(), out = [], claimed = {};
    if (fams.indexOf('cp') >= 0) try { _reconCp_(X, out, claimed); } catch (e) { errs.push('عملاء العمرة: ' + e.message); }
    if (fams.indexOf('ap') >= 0) try { _reconAp_(X, out, claimed); } catch (e) { errs.push('الوكلاء: ' + e.message); }
    if (fams.indexOf('hb') >= 0) try { _reconHb_(X, out); } catch (e) { errs.push('الحجوزات: ' + e.message); }
    _reconDups_(out);
    return out;
  };
  var rows = run();
  if (opts.fix) {
    var user = session.username, touchedMirror = {};
    rows.forEach(function (r) {
      if (Date.now() - t0 > 250000) return;
      try {
        // ① دفعة بلا قيد ولها مرشَّح وحيد مطابق تماماً (نفس اليوم والمبلغ) ⇒ ربط
        if (r.status === 'noentry' && r.fam !== 'hb' && r.cands.length === 1 && r.cands[0].dd === 0) { _reconLinkSet_(r.key, r.cands[0].entry, 'link', user); fixed.link++; return; }
        // ② قيد بلا نسخة بالشاشة ⇒ إنشاء النسخة من القيد
        if (r.status === 'nopay' && !touchedMirror[r.entry]) {
          touchedMirror[r.entry] = 1;
          if (r.fam === 'cp') _glCpSyncVoucher_(r.entry, user);
          else if (r.fam === 'ap') { var f = _glFindEntry_(r.entry); if (f) _glApSyncRows_([f.r], _glLinesOf_(r.entry), user); }
          else if (r.fam === 'hb') _glHbMirrorSync_(r.entry, {});
          fixed.mirror++; return;
        }
        // ③ نسخة قيد تختلف عن قيدها أو قيدها أُلغي ⇒ إعادة مزامنتها من القيد (القيد هو المرجع)
        if ((r.status === 'diff' || r.status === 'void') && r.how === 'نسخة قيد' && !touchedMirror[r.entry]) {
          touchedMirror[r.entry] = 1;
          if (r.fam === 'cp') _glCpSyncVoucher_(r.entry, user);
          else if (r.fam === 'ap') { var f2 = _glFindEntry_(r.entry); _glApSyncRows_(f2 ? [f2.r] : [], f2 ? _glLinesOf_(r.entry) : [], user); }
          fixed.resync++;
        }
      } catch (e) { errs.push(r.key + ': ' + e.message); }
    });
    if (fixed.link || fixed.mirror || fixed.resync) { try { SpreadsheetApp.flush(); } catch (e) {} rows = run(); }
    logChange_(user, 'مطابقة موحّدة (إصلاح تلقائي)', 'GL:recon', 'الإصلاح', '-', 'ربط ' + fixed.link + ' · نسخ ' + fixed.mirror + ' · إعادة مزامنة ' + fixed.resync);
  }
  // حفظ الفهرس (آخر نتيجة كاملة)
  try {
    var sh = _reconSheet_(RECON_IDX_), now = _glNow_(), n = sh.getLastRow();
    if (n >= 2) sh.getRange(2, 1, n - 1, RECON_IDX_.headers.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, RECON_IDX_.headers.length).setValues(rows.map(function (r) {
      return [RECON_FAM_[r.fam], r.key, r.party, r.trip, r.date, r.amount, r.cur, r.desc, r.entry, r.voucher, RECON_ST_[r.status] || r.status, r.note, now]; }));
    _glSetSetting_('recon_last', JSON.stringify({ at: now, by: session.username, n: rows.length, bad: rows.filter(function (r) { return r.status !== 'ok' && r.status !== 'ignored'; }).length }));
  } catch (eS) { errs.push('حفظ الفهرس: ' + eS.message); }
  var sum = {}; rows.forEach(function (r) { var k = r.fam + '|' + r.status; sum[k] = (sum[k] || 0) + 1; });
  return { success: true, rows: rows.filter(function (r) { return opts.all || (r.status !== 'ok' && r.status !== 'ignored'); }).slice(0, 3000), sum: sum, total: rows.length, fixed: fixed, errors: errs, ms: Date.now() - t0 };
}
function glReconLast(authToken) {
  _glPerm_(authToken, 'view', 'stmt');
  var o = null; try { o = JSON.parse(_glSettings_().recon_last || 'null'); } catch (e) {}
  return { success: true, last: o };
}

/* ---------- ✋ الإجراءات اليدوية من تقرير الفروقات ---------- */
// act: {a:'link', key, entry} | {a:'unlink', key} | {a:'noent', key} | {a:'mirror', fam, entry} | {a:'delpay', key, entry: 'keep'|'void'}
function glReconAct(authToken, act) {
  act = act || {};
  var session = requireAuth_(authToken), key = _glStr_(act.key), user = session.username;
  var isAdmin = _glIsAdmin_(session);
  if (act.a === 'link' || act.a === 'unlink' || act.a === 'noent') {
    _glPerm_(authToken, 'edit');
    if (!/^(cp|ap|hb):/.test(key)) throw new Error('مفتاح دفعة غير صالح');
    if (act.a === 'link') {
      var eid = _glStr_(act.entry), f = _glFindEntry_(eid);
      if (!f) throw new Error('القيد ' + eid + ' غير موجود');
      if (_glStr_(f.r[5]) !== GL_ST_POSTED_) throw new Error('القيد ' + eid + ' غير مرحّل');
      _reconLinkSet_(key, eid, 'link', user);
    } else _reconLinkSet_(key, '', act.a === 'noent' ? 'noent' : '', user);
    logChange_(user, act.a === 'link' ? 'ربط دفعة بقيد (مطابقة)' : (act.a === 'noent' ? 'دفعة لا تحتاج قيداً (مطابقة)' : 'فك ربط دفعة بقيد (مطابقة)'), key, 'القيد', '-', _glStr_(act.entry) || '-');
    return { success: true };
  }
  if (act.a === 'mirror') {
    _glPerm_(authToken, 'edit');
    var e2 = _glStr_(act.entry);
    if (act.fam === 'cp') _glCpSyncVoucher_(e2, user);
    else if (act.fam === 'ap') { var f3 = _glFindEntry_(e2); if (f3) _glApSyncRows_([f3.r], _glLinesOf_(e2), user); }
    else if (act.fam === 'hb') _glHbMirrorSync_(e2, {});
    logChange_(user, 'إنشاء نسخة شاشة لقيد (مطابقة)', 'GL:' + e2, act.fam, '-', '-');
    return { success: true };
  }
  if (act.a === 'delpay') {
    // 🗑️ حذف دفعة خاطئة/مكررة من أي شاشة وبأي تاريخ — للمدير فقط (يتجاوز قفل النسخ وتاريخ القطع)، بنسخة قبل الحذف وتسجيل بالسجل المحصّن
    if (!isAdmin) throw new Error('حذف الدفعات من المطابقة للمدير فقط');
    var fam = key.slice(0, 2), pid = key.slice(3), linked = _glStr_(act.linkedEntry), res = {};
    if (fam === 'cp') {
      var sh = _accSheet_(ACC_PAY_SHEET, ACC_PAY_HEADERS), n = sh.getLastRow(), ids = n >= 2 ? sh.getRange(2, 1, n - 1, 1).getValues() : [], at = -1;
      for (var i = 0; i < ids.length; i++) if (_glStr_(ids[i][0]) === pid) { at = i + 2; break; }
      if (at < 0) throw new Error('الدفعة غير موجودة');
      var row = sh.getRange(at, 1, 1, ACC_PAY_HEADERS.length).getValues()[0];
      _snapRowTake_(ACC_PAY_SHEET, pid, row, 'قبل حذف من المطابقة', user);
      if (GL_TAG_RX_.test(_glStr_(row[8]))) { var tagE = GL_TAG_RX_.exec(_glStr_(row[8]))[1]; var lk = _glLock_(); lk.waitLock(30000); try { _glScrHideAdd_(['cp|' + tagE + '|' + _glStr_(row[1])]); } finally { _glUnlock_(lk); } }
      sh.deleteRow(at);
      res.row = row.map(String);
    } else if (fam === 'ap') {
      var hit = _vzReadPays_('').filter(function (x) { return x.id === pid; })[0]; if (!hit) throw new Error('الدفعة غير موجودة');
      var ash = _accSheet_(VZ_PAY_SHEET, VZ_PAY_HEADERS), arow = ash.getRange(hit._row, 1, 1, VZ_PAY_HEADERS.length).getValues()[0];
      _snapRowTake_(VZ_PAY_SHEET, pid, arow, 'قبل حذف من المطابقة', user);
      ash.deleteRow(hit._row); try { _vzClearCache_(); } catch (e) {}
      res.row = arow.map(String);
    } else if (fam === 'hb') {
      if (typeof deletePayment !== 'function') throw new Error('حذف دفعات الحجوزات غير متاح');
      var r = deletePayment(pid, authToken, true); if (!r || !r.ok) throw new Error((r && r.error) || 'تعذّر الحذف');
    } else throw new Error('مفتاح غير صالح');
    if (linked && act.entry === 'void') glVoidEntry(authToken, linked, 'حذف دفعة مكررة/خاطئة من المطابقة', false);
    _reconLinkSet_(key, '', '', user);
    logChange_(user, 'حذف دفعة من المطابقة (مدير)', key, 'الدفعة', JSON.stringify(res.row || pid).slice(0, 400), linked ? (act.entry === 'void' ? 'وأُلغي القيد ' + linked : 'وبقي القيد ' + linked) : '-');
    return { success: true };
  }
  throw new Error('إجراء غير معروف');
}
