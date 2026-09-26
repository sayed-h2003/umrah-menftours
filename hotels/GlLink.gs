/* ============================================================================
   🔗 (7.15.0) ربط برنامج الحجوزات بالحسابات العامة (برنامج العمرة) — المرحلة H2
   ----------------------------------------------------------------------------
   • لا يغيّر شيئاً في كشف الحساب ولا في سجل الدفعات: البيانات المحاسبية لكل دفعة (الحساب النقدي
     الذي دخلت/خرجت منه، والعملة التي دُفعت بها فعلاً ومبلغها بتلك العملة) تُحفظ في شيت مخفي
     مستقل «البيانات المحاسبية للدفعات» مفتاحه معرّف الدفعة، ويقرؤه برنامج الحسابات عند المزامنة.
   • قائمة الخزائن والبنوك والعهد والوكلاء تُقرأ من ملف الحسابات العامة (GL_Accounts) للقراءة فقط.
   • رقم القيد الآلي (JE-xxxxxx) لكل دفعة وحجز يُقرأ من ملف الحسابات ويُعرض بجانب رقم القيد اليدوي
     الذي يبقى كما هو.
   ============================================================================ */
var GLL_META_SHEET_ = 'البيانات المحاسبية للدفعات';
var GLL_META_HEADERS_ = ['معرّف الدفعة', 'الحساب النقدي', 'العملة', 'المبلغ بالعملة', 'بواسطة', 'في'];
var GLL_CUR_ = { SAR: 1, EGP: 1, USD: 1 };

function glLinkId_() { return (PropertiesService.getScriptProperties().getProperty('GL_LINK_SS_ID') || '').trim(); }
function glLinkSS_() { var id = glLinkId_(); return id ? SpreadsheetApp.openById(id) : null; }

function glLinkMetaSheet_() {
  var ss = getSS_(), sh = ss.getSheetByName(GLL_META_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(GLL_META_SHEET_);
    sh.getRange(1, 1, 1, GLL_META_HEADERS_.length).setValues([GLL_META_HEADERS_]).setFontWeight('bold');
    sh.getRange('A:C').setNumberFormat('@');
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}
// {id: {cash, cur, amount, by, at}}
function glLinkMetaMap_() {
  var sh = getSS_().getSheetByName(GLL_META_SHEET_), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, GLL_META_HEADERS_.length).getValues().forEach(function (r) {
    var id = String(r[0] || '').trim(); if (!id) return;
    out[id] = { cash: String(r[1] || '').trim(), cur: String(r[2] || '').trim(), amount: Number(r[3]) || 0, by: String(r[4] || ''), at: r[5] };
  });
  return out;
}
// حفظ/حذف البيانات المحاسبية لدفعة. p = {glCash, glCur, glAmount} — glCash فارغ يحذفها
function glLinkSavePayMeta_(id, p, user) {
  id = String(id || '').trim(); if (!id) return;
  var cash = String(p.glCash || '').trim().replace(/[^0-9]/g, '');
  var cur = String(p.glCur || 'SAR').trim().toUpperCase(); if (!GLL_CUR_[cur]) cur = 'SAR';
  var amt = parseFloat(String(p.glAmount == null ? '' : p.glAmount).replace(/[,٬\s]/g, '')) || 0;
  if (cash && cur !== 'SAR' && !(amt > 0)) throw new Error('أدخل المبلغ بالعملة المدفوع بها (' + cur + ')');
  var sh = glLinkMetaSheet_(), last = sh.getLastRow(), row = -1;
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) { row = i + 2; break; }
  }
  var who = (user && (user.username || user.name)) || String(user || '');
  if (!cash) { if (row > 0) sh.deleteRow(row); return; }
  var vals = [[id, cash, cur, cur === 'SAR' ? '' : amt, who, new Date()]];
  if (row > 0) sh.getRange(row, 1, 1, vals[0].length).setValues(vals);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, vals[0].length).setValues(vals);
}

// ---------- قراءة ملف الحسابات (مع كاش 10 دقائق) ----------
function glLinkAccounts_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('gll_accs');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var ss = glLinkSS_(); if (!ss) return null;
  var out = [], roles = {};
  var set = ss.getSheetByName('GL_Settings');
  if (set && set.getLastRow() > 1) set.getRange(2, 1, set.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var k = String(r[0] || ''); if (/^auto_acc_hb_(cash|via|manual)$/.test(k)) roles[String(r[1] || '')] = k.replace('auto_acc_', '');
  });
  var sh = ss.getSheetByName('GL_Accounts');
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().forEach(function (r) {
    var code = String(r[0] || '').trim(), kind = String(r[6] || '').trim();
    if (!code || String(r[4]) === 'نعم' || String(r[8]) === 'لا') return;
    if (!/^(safe|bank|custody|agent)$/.test(kind) && !roles[code]) return;
    out.push({ code: code, name: String(r[1] || ''), kind: roles[code] ? 'role' : kind, currency: String(r[5] || ''), role: roles[code] || '' });
  });
  var ord = { safe: 1, bank: 2, custody: 3, agent: 4, role: 5 };
  out.sort(function (a, b) { return (ord[a.kind] || 9) - (ord[b.kind] || 9) || (a.code < b.code ? -1 : 1); });
  try { cache.put('gll_accs', JSON.stringify(out), 600); } catch (e) {}
  return out;
}
// {sourceKey: رقم القيد} لقيود الحجوزات والدفعات المرحّلة فقط (كاش 5 دقائق)
function glLinkEntryIndex_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('gll_ents');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var ss = glLinkSS_(), out = {}; if (!ss) return out;
  var sh = ss.getSheetByName('GL_Entries');
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach(function (r) {
    var k = String(r[6] || ''); if (k.indexOf('AUTO:HB') !== 0 || String(r[5]) !== 'مرحّل') return;
    out[k.slice(5)] = String(r[0]);   // بدون البادئة AUTO: لتصغير الكاش
  });
  try { cache.put('gll_ents', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

// ---------- واجهات للواجهة ----------
function glLinkConfig(token) {
  var user = requireSession_(token);
  var id = glLinkId_(), res = { linked: !!id, isAdmin: user.role === 'admin', accounts: [] };
  if (user.role === 'admin') res.glId = id;
  if (!id) return res;
  try { res.accounts = glLinkAccounts_() || []; } catch (e) { res.error = 'تعذّر فتح ملف الحسابات: ' + e.message; }
  return res;
}
function glLinkSaveConfig(token, glId) {
  requireAdmin_(token);
  var id = String(glId || '').trim().replace(/^.*\/d\/([a-zA-Z0-9_-]+).*$/, '$1');
  var p = PropertiesService.getScriptProperties();
  if (!id) { p.deleteProperty('GL_LINK_SS_ID'); return { ok: true, linked: false }; }
  var ss = SpreadsheetApp.openById(id);
  if (!ss.getSheetByName('GL_Accounts')) throw new Error('هذا ليس ملف الحسابات العامة (لا يوجد به GL_Accounts)');
  p.setProperty('GL_LINK_SS_ID', id);
  CacheService.getScriptCache().removeAll(['gll_accs', 'gll_ents']);
  return { ok: true, linked: true, name: ss.getName() };
}
// بيانات محاسبية + رقم القيد الآلي لقائمة دفعات: ids = [معرّف...] ⇒ {id: {cash, cashName, cur, amount, je}}
function glLinkPaymentsInfo(token, ids, linkIds) {
  requirePermission_(token, 'payments', 'view');
  var meta = glLinkMetaMap_(), ents = {}, names = {};
  try { ents = glLinkEntryIndex_(); } catch (e) {}
  try { (glLinkAccounts_() || []).forEach(function (a) { names[a.code] = a.name; }); } catch (e) {}
  var out = {};
  (ids || []).forEach(function (id, i) {
    id = String(id || ''); if (!id) return;
    var m = meta[id], lk = linkIds && linkIds[i] ? String(linkIds[i]) : '';
    var je = ents['HBP:' + id] || (lk ? ents['HBL:' + lk] : '') || '';
    if (!m && !je) return;
    out[id] = { cash: m ? m.cash : '', cashName: m ? (names[m.cash] || '') : '', cur: m ? m.cur : '', amount: m ? m.amount : 0, je: je };
  });
  return out;
}
// رقم القيد الآلي لحجوزات: keys = ['مكة|K123', ...] (المدينة|رقم الحجز الداخلي)
function glLinkBookingEntries(token, keys) {
  requireSession_(token);
  var ents = {}; try { ents = glLinkEntryIndex_(); } catch (e) {}
  var out = {};
  (keys || []).forEach(function (k) { var je = ents['HB:' + k]; if (je) out[k] = je; });
  return out;
}
function glLinkSetPayMeta(token, id, meta) {
  var user = requirePermission_(token, 'payments', 'edit');
  glLinkSavePayMeta_(id, meta || {}, user);
  return { ok: true };
}
