/* ============================================================================
   ⚡ SupaSync.gs — (المرحلة 3-ب) مزامنة نتائج شاشتين (قائمة الرحلات + كشف الرحلة) إلى Supabase
   ----------------------------------------------------------------------------
   • الشيتات تبقى المصدر الوحيد للحقيقة. كل دقيقة (إن تغيّرت بصمات المجموعات) تُعاد حسابات الشاشتين بنفس دوال القراءة
     الحالية وتُرفع إلى جدول read_cache، ثم تُرفع البصمات إلى data_versions (بعد البيانات لا قبلها).
   • المتصفح يقرأ read_cache مباشرة (<0.3 ث) ولا يعتمد عليه إلا إن كانت بصماته ≥ آخر بصمات يعرفها من الخادم؛ وإلا يعود للمسار الحالي.
   • الإعداد (Script properties): SUPA_URL · SUPA_SERVICE_KEY · SUPA_ANON_KEY · SUPA_JWT_SECRET · SUPA_ENABLED=1 (افتراضياً معطَّل)
   • التشغيل مرة واحدة من المحرر: supaSyncInstall()   (يُنشئ مشغّلاً كل دقيقة)   ·   إيقاف: supaSyncUninstall()
   ============================================================================ */

var SUPA_FNS_ = ['getTripsList', 'getTripPilgrims'];
var SUPA_BUDGET_MS_ = 240000;

function _supaP_(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || '').replace(/^[\s"']+|[\s"']+$/g, ''); }
function _supaOn_() { return _supaP_('SUPA_ENABLED') === '1' && !!_supaP_('SUPA_URL') && !!_supaP_('SUPA_SERVICE_KEY'); }

function _supaReq_(method, path, body, prefer) {
  var key = _supaP_('SUPA_SERVICE_KEY'), h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  var opt = { method: method, headers: h, muteHttpExceptions: true };
  if (body !== undefined && body !== null) opt.payload = JSON.stringify(body);
  var r, tries = 0;
  while (true) {
    r = UrlFetchApp.fetch(_supaP_('SUPA_URL').replace(/\/+$/, '') + '/rest/v1/' + path, opt);
    var c = r.getResponseCode();
    if ((c === 429 || c >= 500) && tries < 2) { tries++; Utilities.sleep(1200 * tries); continue; }
    break;
  }
  return { code: r.getResponseCode(), text: r.getContentText() };
}
function _supaUpsert_(table, rows, conflict) {
  if (!rows.length) return true;
  var r = _supaReq_('post', table + '?on_conflict=' + conflict, rows, 'resolution=merge-duplicates,return=minimal');
  if (r.code < 200 || r.code >= 300) { Logger.log('supa upsert ' + table + ' ' + r.code + ' ' + String(r.text).slice(0, 200)); return false; }
  return true;
}

/* بصمة بيانات بنفس صيغة lfFetch (LiveSync.gs) ⇒ المتصفح يقارنها بنسخته المحفوظة مباشرة */
function _supaHash_(fn, data) { var vol = {}; return _lfHash_(_lfJson_(fn, data, vol)); }

/* ⚡ (V4.374) توسيع الصلاحيات كما يفعل _sessionHasPerm_ (Code.gs): المستوى الأعلى يشمل ما دونه (حذف ⊃ تعديل ⊃ إضافة ⊃ عرض) + الخريطة القديمة + «delete» العام */
function _supaExpandPerms_(list) {
  var set = {}, out = [];
  (list || []).forEach(function (p0) {
    var t = String(p0 || '').toLowerCase().trim(); if (!t) return;
    set[t] = true;
    try { if (typeof _PERM_LEGACY_MAP_ !== 'undefined' && _PERM_LEGACY_MAP_[t]) { t = _PERM_LEGACY_MAP_[t]; set[t] = true; } } catch (e) {}
    var dot = t.indexOf('.');
    if (dot > 0) {
      var scr = t.slice(0, dot), cap = t.slice(dot + 1);
      set[scr + '.view'] = true;
      if (cap === 'edit' || cap === 'delete') set[scr + '.add'] = true;
      if (cap === 'delete') set[scr + '.edit'] = true;
    }
  });
  try { if (set['delete'] && typeof _PERM_SCREENS_ !== 'undefined') _PERM_SCREENS_.forEach(function (s) { set[s + '.delete'] = true; set[s + '.edit'] = true; set[s + '.add'] = true; set[s + '.view'] = true; }); } catch (e2) {}
  Object.keys(set).forEach(function (k) { out.push(k); });
  return out;
}

/* رمز قراءة قصير العمر للمتصفح (HS256) — يعمل لكل أنواع الجلسات (حتى «تذكّر الجهاز» بلا كلمة مرور) */
function supaIssueToken(authToken) { return _supaTokenFor_(requireAuth_(authToken)); }
/* ⚡ (V4.378) الرمز نفسه يُرجَع مع loginUser/resumeSession (حقل supa) فتقرأ الواجهة من Supabase منذ أول لحظة بلا نداء supaIssueToken منفصل (≈6 ث)؛
   supaIssueToken يبقى للتجديد قبل انتهاء الرمز بساعة. لا يخرج للمتصفح إلا: SUPA_URL (عام) · SUPA_ANON_KEY (عام بطبيعته) · JWT قصير العمر (8 ساعات) — لا SERVICE_KEY ولا JWT_SECRET أبداً. */
function _supaBootCfg_(username, fullName, permissions) {
  try { return _supaTokenFor_({ username: username, fullName: fullName, permissions: permissions }); } catch (e) { return { success: true, enabled: false }; }
}
function _supaTokenFor_(s) {
  if (!_supaOn_() || !_supaP_('SUPA_JWT_SECRET') || !_supaP_('SUPA_ANON_KEY')) return { success: true, enabled: false };
  var perms = []; try { var pv = s.permissions; perms = Array.isArray(pv) ? pv : String(pv || '').split(/[,،;|]/).map(function (x) { return x.trim(); }).filter(Boolean); } catch (e) {}
  perms = _supaExpandPerms_(perms);   // ⚡ (V4.374) نفس تدرّج _sessionHasPerm_ (تعديل ⇒ إضافة+عرض…) كي تطابق فحوص Postgres فحوص الخادم
  var now = Math.floor(Date.now() / 1000), exp = now + 8 * 3600;
  var b64 = function (o) { return Utilities.base64EncodeWebSafe(Utilities.newBlob(typeof o === 'string' ? o : JSON.stringify(o)).getBytes()).replace(/=+$/, ''); };
  var head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64({ role: 'authenticated', aud: 'authenticated', sub: String(s.username), app_user: String(s.username), name: String(s.fullName || s.username), perms: perms, iat: now, exp: exp });   // name: اسم العرض للمتصلين الآن (app_pulse)
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(head + '.' + body, _supaP_('SUPA_JWT_SECRET'))).replace(/=+$/, '');
  var webUrl = ''; try { webUrl = ScriptApp.getService().getUrl() || ''; } catch (eW) {}   // ⚡ (V4.385) رابط التطبيق للطباعة بلا نداء getWebAppUrl
  return { success: true, enabled: true, webUrl: webUrl, url: _supaP_('SUPA_URL').replace(/\/+$/, ''), anon: _supaP_('SUPA_ANON_KEY'), token: head + '.' + body + '.' + sig, expiresAt: exp * 1000,
    glStore: _supaP_('GL_STORE') === 'supabase',
    store: _supaStoreInfo_() };   // 🗄️ (المرحلة 4) المجموعات الحيّة بـ Postgres + هل data_versions مرجع النبضة ⇒ الواجهة تقرأ الرحلات/المعتمرين/الحركات… بـ RPC   // ⚡ (V4.374) شاشات الحسابات تقرأ من Postgres فقط حين تكون قيود GL فيه (المصدر الوحيد)
}

/* ---------- المزامنة ---------- */
function supaSyncInstall() {
  requireScriptOwner_();   // 🔒 (V4.372)
  _supaUninstall_();
  ScriptApp.newTrigger('supaSyncTick_').timeBased().everyMinutes(1).create();
  return 'تم إنشاء مشغّل المزامنة (كل دقيقة)';
}
function supaSyncUninstall() { requireScriptOwner_(); _supaUninstall_(); }
function _supaUninstall_() { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'supaSyncTick_' || t.getHandlerFunction() === 'supaSyncTick') { try { ScriptApp.deleteTrigger(t); } catch (e) {} } }); }

/* فحص فوري من المحرر (صاحب السكربت): يعرض حالة الإعداد، يشغّل مزامنة الآن، ويعدّ ما بـ Supabase — بلا أسرار */
function supaSyncNow() {
  requireScriptOwner_();
  var L = ['SUPA_URL: ' + (_supaP_('SUPA_URL') ? 'موجود' : '❌ ناقص'), 'SUPA_SERVICE_KEY: ' + (_supaP_('SUPA_SERVICE_KEY') ? 'موجود' : '❌ ناقص'),
    'SUPA_ANON_KEY: ' + (_supaP_('SUPA_ANON_KEY') ? 'موجود' : '❌ ناقص'), 'SUPA_JWT_SECRET: ' + (_supaP_('SUPA_JWT_SECRET') ? 'موجود' : '❌ ناقص'), 'SUPA_ENABLED: ' + (_supaP_('SUPA_ENABLED') || '❌ غير مضبوط') + (_supaP_('SUPA_ENABLED') === '1' ? '' : ' (يجب 1)')];
  if (typeof _getTripsListCore_ !== 'function') L.push('❌ Code.gs قديم: الدالة _getTripsListCore_ غير موجودة — استبدل Code.gs');
  var trig = ScriptApp.getProjectTriggers().filter(function (t) { return /^supaSyncTick_?$/.test(t.getHandlerFunction()); }).length;
  L.push('مشغّل المزامنة: ' + (trig ? 'موجود' : '❌ غير موجود — شغّل supaSyncInstall()'));
  if (_supaOn_() && typeof _getTripsListCore_ === 'function') {
    var t0 = Date.now(), r = supaSyncTick_();
    L.push('نتيجة المزامنة الآن: ' + r + ' (' + (Date.now() - t0) + ' مل ث)');
    var q = _supaReq_('get', 'read_cache?select=fn,args_key&limit=5000');
    if (q.code === 200) { var rows = JSON.parse(q.text), c = {}; rows.forEach(function (x) { c[x.fn] = (c[x.fn] || 0) + 1; }); L.push('read_cache بـ Supabase: ' + (rows.length ? JSON.stringify(c) : '❌ فارغ')); }
    else L.push('❌ تعذّر قراءة read_cache: ' + q.code + ' ' + String(q.text).slice(0, 160) + ' (هل شغّلت SQL المرحلة 3-أ؟)');
    var d = _supaReq_('get', 'data_versions?select=group_name');
    if (d.code === 200) L.push('data_versions: ' + JSON.parse(d.text).length + ' مجموعة');
  }
  var out = L.join('\n'); Logger.log(out); return out;
}

/* ============================================================================
   ⚡ (V4.374) gl_aux — البيانات المساعدة لدوال glx_* (005_gl_screens.sql): كل ما يلزم شاشات الحسابات وليس بجدولَي القيود/السطور:
   الحسابات · عدد/قائمة المرفقات · التغييرات المعلّقة · تواريخ استحقاق البنوك · خريطة أسماء الحجوزات · تواريخ الرحلات · قائمة الاعتماد.
   تُبنى بنفس دوال الخادم الحالية (فالشكل مطابق) وتُرفع عند تغيّر GL_DATA_VER (المشغّل كل دقيقة)، ويحمل كل صف الإصدار الذي بُني منه.
   ============================================================================ */
function _supaGlAuxBuild_() {
  var A = {}; _glAccounts_().list.forEach(function (a) { var c = {}; for (var k in a) c[k] = a[k]; A[a.code] = c; });
  var att = {}; try { att = _glAttachMap_(); } catch (e0) {}
  var pend = {}, pr = {}; try { pr = _glPendingRows_(); } catch (e1) {}
  Object.keys(pr).forEach(function (k) { var r = pr[k].row; if (_glStr_(r[9]) !== 'مرفوض') pend[_glStr_(r[1])] = _glStr_(r[2]) || 'تعديل'; });
  var due = {}; try { due = _glDueMap_(); } catch (e2) {}
  var hbn = {}; try { _glRows_('hbmap').forEach(function (r) { var c = _glStr_(r[2]); if (c) (hbn[c] = hbn[c] || []).push({ name: _glStr_(r[0]), type: _glStr_(r[1]) }); }); } catch (e3) {}
  var trips = {}; try { trips = JSON.parse(JSON.stringify(_glTripsInfo_())); } catch (e4) {}
  // قائمة الاعتماد: نفس حقول glPendingList (الصلاحية canApprove تُحسب من JWT بـPostgres)
  var rows = [];
  try { _glRowsW_('pending').forEach(function (r) { if (_glStr_(r[0])) rows.push({ key: _glStr_(r[0]), id: _glStr_(r[1]), kind: _glStr_(r[2]), oldDesc: _glStr_(r[3]), oldBase: _glNum_(r[4]),
    newDesc: _glStr_(r[5]), newBase: _glNum_(r[6]), at: _glStr_(r[8]), status: _glStr_(r[9]) || 'بانتظار', by: _glStr_(r[10]), note: _glStr_(r[11]), oldAmt: _glStr_(r[12]), newAmt: _glStr_(r[13]), diff: _glStr_(r[14]) }); }); } catch (e5) {}
  var cust = [], P = PropertiesService.getScriptProperties();
  try { _glCsCodes_().forEach(function (code) { var n = +(P.getProperty('GLBOT_CS_' + code) || 0); if (n) cust.push({ code: code, name: (A[code] || {}).name || code, n: n }); }); } catch (e6) {}
  return { accounts: A, att: att, pend: pend, due: due, hbnames: hbn, trips: trips, pendlist: { rows: rows, cust: cust } };
}
// يرفع gl_aux لـSupabase إن تغيّر GL_DATA_VER منذ آخر رفع (يُستدعى من مشغّل الدقيقة؛ ومن المحرر: supaGlAuxSyncNow)
function supaGlAuxSync_(force) {
  if (!_supaOn_() || _supaP_('GL_STORE') !== 'supabase') return 'skip';
  var P = PropertiesService.getScriptProperties(), ver = _glVerFresh_();   // الإصدار يُقرأ قبل البناء: لو تغيّر أثناءه يُعاد الرفع بالدقيقة التالية
  if (!force && P.getProperty('SUPA_GLAUX_VER') === ver) return 'same';
  var data = _supaGlAuxBuild_(), now = new Date().toISOString();
  var ok = _supaUpsert_('gl_aux', Object.keys(data).map(function (k) { return { key: k, data: data[k], ver: ver, updated_at: now }; }), 'key');
  if (!ok) return 'fail';
  P.setProperty('SUPA_GLAUX_VER', ver);
  return 'ok';
}
// (V4.417) gl_aux.meta = {url, csPend}: ما يحتاجه glBootstrap من حالة الشيتات (يتغيّر بلا تغيّر GL_DATA_VER) — يُرفع عند التغيّر فقط
function supaGlMetaSync_() {
  if (!_supaOn_() || _supaP_('GL_STORE') !== 'supabase') return 'skip';
  var id = _glSSId_(), m = { url: id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '', csPend: 0 };
  try { m.csPend = _glCsPendTotal_() || 0; } catch (e) {}
  var js = JSON.stringify(m), P = PropertiesService.getScriptProperties();
  if (P.getProperty('SUPA_GLMETA') === js) return 'same';
  var ok = _supaUpsert_('gl_aux', [{ key: 'meta', data: m, ver: _glVerFresh_(), updated_at: new Date().toISOString() }], 'key');
  if (ok) P.setProperty('SUPA_GLMETA', js);
  return ok ? 'ok' : 'fail';
}
/* (V4.418) تخطيط الأرصدة الشخصي لكل مستخدم: نقل مرة واحدة من خصائص السكربت GL_BALU_<user> إلى جدول gl_bal_user (044) — شغّلها يدوياً مرة */
function supaBalUserMigrateNow() {
  requireScriptOwner_();
  if (!_supaOn_()) return 'Supabase غير مفعّل';
  var all = PropertiesService.getScriptProperties().getProperties(), rows = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('GL_BALU_') !== 0 || !all[k]) return;
    rows.push({ username: k.slice(8), layout: all[k], updated_at: new Date().toISOString() });
  });
  var ok = rows.length ? _supaUpsert_('gl_bal_user', rows, 'username') : true;
  Logger.log('gl_bal_user: ' + rows.length + ' تخطيط → ' + (ok ? 'تم' : 'فشل'));
  return rows.length + (ok ? ' تخطيط نُقل' : ' فشل');
}
function _supaBalUserPut_(username, json) {   // مرآة اختيارية عند حفظ المستخدم عبر Apps Script (احتياطي)
  try {
    if (!_supaOn_()) return;
    var u = String(username || '').toLowerCase().replace(/[^a-z0-9_.\u0600-\u06FF]/g, '_').slice(0, 60);
    if (json) _supaUpsert_('gl_bal_user', [{ username: u, layout: json, updated_at: new Date().toISOString() }], 'username');
    else _supaReq_('DELETE', 'gl_bal_user?username=eq.' + encodeURIComponent(u));
  } catch (e) {}
}
/* ============================================================
   👥 (V4.419) المستخدمون: app_users بـPostgres = المرجع الوحيد (USERS_SOT=1). ورقة Users مرآة قراءة فقط (باتجاه واحد).
   usersSotOn() لتفعيل · usersSotOff() للتراجع · usersMirrorNow() لإعادة كتابة الورقة يدوياً.
   ============================================================ */
function _usersSot_() { try { return _supaOn_() && _supaP_('USERS_SOT') === '1'; } catch (e) { return false; } }
function _usersPermStr_(v) { return Array.isArray(v) ? v.join(',') : String(v == null ? '' : v); }
// صفوف PG بشكل getDataRange().getValues(): [رأس, [username, hash, fullName, active, permissions, mustChangePwd], …]
function _usersData_() {
  var r = _supaReq_('get', 'app_users?select=username,password_hash,full_name,active,permissions,must_change_pwd&order=ord.asc.nullslast,username.asc');
  if (r.code !== 200) throw new Error('تعذّر قراءة المستخدمين من Postgres (' + r.code + ')');
  var rows = JSON.parse(r.text || '[]');
  var out = [['Username', 'Password', 'FullName', 'Active', 'Permissions', 'MustChangePwd']];
  rows.forEach(function (u) { out.push([String(u.username), String(u.password_hash || ''), String(u.full_name || ''), !(u.active === false || String(u.active).toLowerCase() === 'false'), _usersPermStr_(u.permissions), u.must_change_pwd === true || String(u.must_change_pwd).toLowerCase() === 'true']); });
  return out;
}
// بيانات المستخدمين للقراءة (PG عند التفعيل وإلا الورقة)
function _usersGrid_() { return _usersSot_() ? _usersData_() : getSpreadsheet_().getSheetByName('Users').getDataRange().getValues(); }
// تمرير دالة إدارة مستخدم لـPostgres بجلسة المنادي (احتياطي: إن سقط مسار المتصفح المباشر) — الورقة لا تُكتب أبداً بوضع SOT
function _usersProxy_(authToken, fn, args, read) {
  var session = requireAuth_(authToken), t = _supaTokenFor_(session);
  if (!t || !t.enabled) throw new Error('Supabase غير متاح');
  var path = read ? 'rx_call2' : 'rw_call';
  var r = UrlFetchApp.fetch(t.url + '/rest/v1/rpc/' + path, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: t.anon, Authorization: 'Bearer ' + t.token }, payload: JSON.stringify({ p_fn: fn, p_args: [null].concat(args || []) }) });
  var j = {}; try { j = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
  if (r.getResponseCode() >= 300) throw new Error(String(j.message || j.hint || ('Postgres ' + r.getResponseCode())));
  return j.d;
}
// مرآة باتجاه واحد PG → ورقة Users (تُعاد الكتابة عند تغيّر users_rev فقط)
function usersMirrorTick_(force) {
  if (!_usersSot_()) return 'off';
  var rr = _supaReq_('get', 'users_rev?select=rev&id=eq.1'), rev = '';
  try { rev = String((JSON.parse(rr.text || '[]')[0] || {}).rev); } catch (e) {}
  var P = PropertiesService.getScriptProperties();
  if (!force && rev && P.getProperty('USERS_MIRROR_REV') === rev) return 'same';
  var d = _usersData_(), sh = getSpreadsheet_().getSheetByName('Users');
  if (!sh) return 'no-sheet';
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(6, sh.getLastColumn())).clearContent();
  if (d.length > 1) {
    try { sh.getRange(2, 5, d.length - 1, 1).setDataValidation(null); } catch (e2) {}
    sh.getRange(2, 1, d.length - 1, 6).setValues(d.slice(1));
  }
  try { _cacheBust_('users'); } catch (e3) {}
  if (rev) P.setProperty('USERS_MIRROR_REV', rev);
  return 'ok ' + (d.length - 1);
}
function usersMirrorNow() { requireScriptOwner_(); var r = usersMirrorTick_(true); Logger.log('users mirror: ' + r); return r; }
// تفعيل: يملأ app_users بما ينقصه من الورقة (لا يكتب فوق صف موجود)، يوقف مزامنة الورقة→PG لجدول المستخدمين، ثم يضبط USERS_SOT=1
function usersSotOn() {
  requireScriptOwner_();
  if (!_supaOn_()) throw new Error('Supabase غير مفعّل');
  var chk = _supaReq_('get', 'app_users?select=ord,updated_at&limit=1');
  if (chk.code !== 200) throw new Error('شغّل supabase/045_users_sot.sql أولاً (' + chk.code + ' ' + String(chk.text).slice(0, 120) + ')');
  var have = {}; try { JSON.parse(_supaReq_('get', 'app_users?select=username').text || '[]').forEach(function (u) { have[String(u.username)] = 1; }); } catch (e) {}
  var data = getSpreadsheet_().getSheetByName('Users').getDataRange().getValues(), add = [];
  for (var i = 1; i < data.length; i++) {
    var nm = String(data[i][0] || '').trim(); if (!nm || have[nm]) continue;
    var ps = String(data[i][4] || '').trim(), pl = ps ? ps.split(/[,،;|]/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
    add.push({ username: nm, password_hash: String(data[i][1] || ''), full_name: String(data[i][2] || ''), active: !(data[i][3] === false || String(data[i][3]).toLowerCase() === 'false'),
      permissions: pl, must_change_pwd: data[i][5] === true || String(data[i][5]).toLowerCase() === 'true' });
  }
  if (add.length && !_supaUpsert_('app_users', add, 'username')) throw new Error('تعذّر نقل مستخدمي الورقة الناقصين إلى Postgres');
  var P = PropertiesService.getScriptProperties();
  P.setProperty('USERS_SOT', '1');
  try { _ST_CFG_ = null; } catch (e1) {}
  var m = usersMirrorTick_(true);
  var msg = 'تم: Postgres مرجع المستخدمين (نُقل ' + add.length + ' ناقص من الورقة) — مرآة الورقة: ' + m + ' | للتراجع usersSotOff()';
  Logger.log(msg); return msg;
}
function usersSotOff() { requireScriptOwner_(); PropertiesService.getScriptProperties().deleteProperty('USERS_SOT'); try { _ST_CFG_ = null; } catch (e) {} var m = 'أُوقف: الورقة مرجع المستخدمين من جديد (آخر مرآة من Postgres بقيت بها)'; Logger.log(m); return m; }
/* ============================================================
   🏨 (V4.420) نسخة قراءة من بيانات برنامج الحجوزات بـPostgres (046_hb_snap.sql) — المرحلة 2 من HB_UNIFICATION_PLAN.md
   الشيتات تبقى المصدر (لا شيء يُكتب بها من هنا). hbSnapOn() للتفعيل · hbSnapVerify() للمطابقة مع القراءة الحيّة ·
   hbSnapReadOn() لاستعمال النسخة بكشوف الحسابات (يشترط نجاح المطابقة) · hbSnapOff() للإيقاف.
   ============================================================ */
function _hbSnapOn_() { try { return _supaOn_() && _supaP_('HB_SNAP') === '1'; } catch (e) { return false; } }
function _hbSnapEnc_(rows, startRow) { return rows.map(function (r, i) { return [startRow + i, _stEncRow_(r)]; }).filter(function (x) { return !_stBlank_(x[1]); }); }
function _hbSnapMd5_(str) { return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str, Utilities.Charset.UTF_8).map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join(''); }
// يقرأ الشيتات الخمسة كما يقرؤها _glHbRead_ تماماً (نفس الأعمدة والصفوف) ⇒ { mk, md, pay, meta, prof } بصفوف مرمّزة [rn, cells]
function _hbSnapRead_() {
  var c = _glHbCfg_(); if (!c.ssId) throw new Error('لم يُربط ملف برنامج الحجوزات بعد');
  var ss = SpreadsheetApp.openById(c.ssId), src = (c.srcId && c.srcId !== c.ssId) ? SpreadsheetApp.openById(c.srcId) : ss, out = {};
  var rd = function (book, name, from, cols) {
    var sh = book.getSheetByName(name); if (!sh) return [];
    var last = sh.getLastRow(); if (last < from) return [];
    return _hbSnapEnc_(sh.getRange(from, 1, last - from + 1, cols).getValues(), from);
  };
  out.mk = rd(src, c.mk, c.mkRow, 34); out.md = rd(src, c.md, c.mdRow, 34);
  out.pay = rd(ss, c.pay, 1, 10); out.meta = rd(ss, 'البيانات المحاسبية للدفعات', 1, 6); out.prof = rd(ss, c.prof, 1, 7);
  out.hbusers = _hbSnapUsers_();
  return out;
}
// (V4.423) مستخدمو برنامج الحجوزات (شيت «المستخدمون») بعد حجب الملح وكلمة المرور (العمودان 3 و4) — لخريطة الصلاحيات بـPostgres
function _hbSnapUsers_() {
  var sh = null; try { sh = hbProgramSS_().getSheetByName(USERS_SHEET_NAME); } catch (e) {}
  if (!sh || sh.getLastRow() < 1) return [];
  return _hbSnapEnc_(sh.getRange(1, 1, sh.getLastRow(), 8).getValues().map(function (r) { return [r[0], r[1], '', '', r[4], r[5], r[6], '']; }), 1);
}
// رفع فوري لمستخدمي الحجوزات فقط (بعد حفظ صلاحياتهم من برنامج العمرة) فيرى المدير تعديله مباشرة
function hbSnapSyncUsers_() {
  if (!_hbSnapOn_()) return 'off';
  var rows = _hbSnapUsers_(), h = _hbSnapMd5_(JSON.stringify(rows)) + ':' + rows.length, P = PropertiesService.getScriptProperties();
  if (P.getProperty('HB_SNAP_H_hbusers') === h) return 'same';
  var r = _supaReq_('post', 'rpc/hb_snap_put', { p_tbl: 'hbusers', p_part: 1, p_parts: 1, p_rows: rows, p_hash: h });
  if (r.code < 300) { P.setProperty('HB_SNAP_H_hbusers', h); return 'ok'; }
  Logger.log('hbusers snap ' + r.code + ' ' + String(r.text).slice(0, 160)); return 'fail';
}
function hbSnapSync_(force) {
  if (!_hbSnapOn_()) return 'off';
  var P = PropertiesService.getScriptProperties(), nowMs = Date.now();
  if (!force && nowMs - (+P.getProperty('HB_SNAP_AT') || 0) < 110000) return 'throttled';
  P.setProperty('HB_SNAP_AT', String(nowMs));
  var data = _hbSnapRead_(), same = {}, up = [], t0 = Date.now();
  Object.keys(data).forEach(function (t) {
    var js = JSON.stringify(data[t]), h = _hbSnapMd5_(js) + ':' + data[t].length;
    if (!force && P.getProperty('HB_SNAP_H_' + t) === h) { same[t] = h; return; }
    up.push({ t: t, rows: data[t], h: h });
  });
  var CH = 400, done = [];
  up.forEach(function (u) {
    if (Date.now() - t0 > 40000) return;
    var parts = Math.max(1, Math.ceil(u.rows.length / CH)), ok = true;
    for (var k = 0; k < parts && ok; k++) {
      var r = _supaReq_('post', 'rpc/hb_snap_put', { p_tbl: u.t, p_part: k + 1, p_parts: parts, p_rows: u.rows.slice(k * CH, (k + 1) * CH), p_hash: u.h });
      if (r.code >= 300) { Logger.log('hb_snap_put ' + u.t + ' ' + r.code + ' ' + String(r.text).slice(0, 160)); ok = false; }
    }
    if (ok) { P.setProperty('HB_SNAP_H_' + u.t, u.h); done.push(u.t); }
  });
  if (Object.keys(same).length) _supaReq_('post', 'rpc/hb_snap_touch', { p_hashes: same });
  return 'رُفع: ' + (done.join(',') || '—') + ' | دون تغيير: ' + (Object.keys(same).join(',') || '—');
}
function hbSnapOn() {
  requireScriptOwner_();
  if (!_supaOn_()) throw new Error('Supabase غير مفعّل');
  var chk = _supaReq_('get', 'hb_snap_meta?select=tbl&limit=1');
  if (chk.code !== 200) throw new Error('شغّل supabase/046_hb_snap.sql أولاً (' + chk.code + ')');
  PropertiesService.getScriptProperties().setProperty('HB_SNAP', '1');
  var r = hbSnapSync_(true); Logger.log('hb_snap: ' + r); return r;
}
function hbSnapOff() { requireScriptOwner_(); var P = PropertiesService.getScriptProperties(); P.deleteProperty('HB_SNAP'); P.deleteProperty('HB_SNAP_READ'); return 'أُوقفت نسخة الحجوزات (ورجعت القراءة من الشيتات)'; }
function hbSnapSyncNow() { requireScriptOwner_(); var r = hbSnapSync_(true); Logger.log('hb_snap: ' + r); return r; }
// مطابقة: القراءة الحيّة من الشيتات (_glHbRead_) مقابل نسخة Postgres — نفس الحقول الحاكمة (مفتاح/عميل/مورد/تواريخ/بيع/تكلفة/دفعات)
function hbSnapVerify() {
  requireScriptOwner_();
  var s = hbSnapSync_(true); _GL_HB_MEMO_ = null;
  var live = _glHbRead_(), r = _supaReq_('post', 'rpc/hbx_read_raw', {});
  if (r.code !== 200) throw new Error('hbx_read_raw: ' + r.code + ' ' + String(r.text).slice(0, 200));
  var pg = JSON.parse(r.text), L = [], bad = 0;
  var stab = function (v) { if (Array.isArray(v)) return v.map(stab); if (v && typeof v === 'object') { var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = stab(v[k]); }); return o; } return v; };   // (V4.428) ترتيب مفاتيح الكائن لا يُعدّ فرقاً
  var cmp = function (what, a, b, fields, keyf) {
    var ma = {}, mb = {}; a.forEach(function (x) { ma[keyf(x)] = x; }); b.forEach(function (x) { mb[keyf(x)] = x; });
    var n = 0, miss = 0, extra = 0, diff = 0, ex = [];
    Object.keys(ma).forEach(function (k) {
      var x = ma[k], y = mb[k]; if (!y) { miss++; if (ex.length < 5) ex.push('ناقص بـPG: ' + k); return; }
      fields.forEach(function (f) {
        var va = f(x), vb = f(y); if (typeof va === 'number') { va = Math.round(va * 100) / 100; vb = Math.round(vb * 100) / 100; }
        if (JSON.stringify(stab(va)) !== JSON.stringify(stab(vb))) { diff++; if (ex.length < 5) ex.push(k + ': ' + JSON.stringify(va) + ' ≠ ' + JSON.stringify(vb)); }
      });
      n++;
    });
    Object.keys(mb).forEach(function (k) { if (!ma[k]) { extra++; if (ex.length < 5) ex.push('زائد بـPG: ' + k); } });
    var ok = !miss && !extra && !diff; if (!ok) bad++;
    L.push((ok ? '✓ ' : '✗ ') + what + ': حيّ ' + a.length + ' · PG ' + b.length + (ok ? '' : ' — ناقص ' + miss + ' · زائد ' + extra + ' · فروق حقول ' + diff + '\n   ' + ex.join('\n   ')));
  };
  var F = function (p) { return function (x) { return p.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, x); }; };
  cmp('الحجوزات', live.bookings, pg.bookings, ['city', 'row', 'qaid', 'inner', 'client', 'hotel', 'ci', 'co', 'nights', 'supplier', 'status', 'hotelRef', 'sale.value', 'sale.hasPrice', 'sale.rooms', 'sale.breakdown', 'cost.value', 'cost.hasPrice', 'cost.breakdown', 'rooms'].map(F), function (x) { return x.key; });
  cmp('الدفعات', live.pays, pg.pays, ['date', 'party', 'dir', 'amount', 'note', 'qaid', 'linkId', 'meta'].map(F), function (x) { return x.id; });
  var lp = Object.keys(live.prof).map(function (k) { return { k: k, v: live.prof[k] }; }), pp = Object.keys(pg.prof).map(function (k) { return { k: k, v: pg.prof[k] }; });
  cmp('بيانات الحسابات', lp, pp, ['v.name', 'v.type', 'v.notes', 'v.agent', 'v.role', 'v.code'].map(F), function (x) { return x.k; });
  var out = (bad ? '⚠️ فروق بـ' + bad + ' من 3\n' : '✅ مطابقة كاملة — يمكن تفعيل hbSnapReadOn()\n') + L.join('\n') + '\n(مزامنة: ' + s + ')';
  PropertiesService.getScriptProperties().setProperty('HB_SNAP_VERIFIED', bad ? '' : String(Date.now()));
  Logger.log(out); return out;
}
function hbSnapReadOn() {
  requireScriptOwner_();
  var v = +PropertiesService.getScriptProperties().getProperty('HB_SNAP_VERIFIED') || 0;
  if (!_hbSnapOn_() || Date.now() - v > 86400000) throw new Error('شغّل hbSnapVerify() أولاً (يجب أن تنجح المطابقة خلال آخر 24 ساعة)');
  PropertiesService.getScriptProperties().setProperty('HB_SNAP_READ', '1'); return 'كشوف الحسابات تقرأ بيانات الحجوزات من Postgres (عمر النسخة ≤ 4 دقائق وإلا ترجع للشيتات تلقائياً)';
}
// قراءة بنفس شكل _glHbRead_ من Postgres (عرض فقط) — null إن لم تُفعَّل/قديمة/فشلت ⇒ الاستدعاء يرجع للشيتات
function _glHbReadSnap_() {
  try {
    if (!_hbSnapOn_() || _supaP_('HB_SNAP_READ') !== '1') return null;
    var r = _supaReq_('post', 'rpc/hbx_read_raw', {}); if (r.code !== 200) return null;
    var j = JSON.parse(r.text); if (!j || typeof j.ageSec !== 'number' || j.ageSec > 240) return null;
    return { bookings: j.bookings, pays: j.pays, prof: j.prof };
  } catch (e) { return null; }
}
/* (V4.425) كتابة قيود الحسابات العامة من Postgres (051_gl_write_path.sql): glWriteOn() للتفعيل · glWriteOff() للإيقاف */
function glWriteOn() {
  requireScriptOwner_();
  if (!_supaOn_() || _supaP_('GL_STORE') !== 'supabase') throw new Error('يتطلب Supabase مفعّلاً وGL_STORE=supabase');
  var r = _supaReq_('post', 'rpc/rw_call', { p_fn: 'glSaveEntry', p_args: [] }), txt = String(r.text || '');
  if (/غير مدعومة|PGRST202|Could not find/.test(txt)) throw new Error('شغّل supabase/051_gl_write_path.sql أولاً');
  PropertiesService.getScriptProperties().setProperty('SUPA_W_GL', '1');
  var m = 'تم: قيود الحسابات العامة (حفظ/ترحيل/إلغاء/حذف) تُكتب من Postgres — سجّل خروجاً ودخولاً. للإيقاف glWriteOff()'; Logger.log(m); return m;
}
function glWriteOff() { requireScriptOwner_(); PropertiesService.getScriptProperties().deleteProperty('SUPA_W_GL'); return 'أُوقفت كتابة الحسابات العامة من Postgres (الكتابة بـApps Script)'; }
/* (V4.427) كتابة دفعة القيود التلقائية من Postgres (053_gl_auto_write.sql): glAutoWriteOn() · glAutoWriteOff() */
function glAutoWriteOn() {
  requireScriptOwner_();
  if (!_supaOn_() || _supaP_('GL_STORE') !== 'supabase') throw new Error('يتطلب Supabase مفعّلاً وGL_STORE=supabase');
  var r = _supaReq_('post', 'rpc/gl_auto_write_raw', { p: { user: 'probe' } });
  if (r.code === 404 || /PGRST202|Could not find/.test(String(r.text))) throw new Error('شغّل supabase/051 و053 أولاً');
  PropertiesService.getScriptProperties().setProperty('SUPA_W_GLAUTO', '1');
  var m = 'تم: مزامنة القيود التلقائية تكتب بـPostgres (معاملة ذرّية). للإيقاف glAutoWriteOff()'; Logger.log(m); return m;
}
function glAutoWriteOff() { requireScriptOwner_(); PropertiesService.getScriptProperties().deleteProperty('SUPA_W_GLAUTO'); return 'عادت كتابة القيود التلقائية للمسار القديم'; }
function supaGlAuxSyncNow() { requireScriptOwner_(); var r = supaGlAuxSync_(true); Logger.log('gl_aux: ' + r + ' (GL_STORE=' + _supaP_('GL_STORE') + ')'); return r; }

function _supaSynced_() { try { return JSON.parse(_supaP_('SUPA_SYNCED') || '{}') || {}; } catch (e) { return {}; } }

function supaSyncTick_() {   // خاصة (مشغّل الدقيقة) — لا تُستدعى من المتصفح
  if (!_supaOn_()) return 'off';
  var lk = _glNamedLock_('supasync');   // قفل مسمّى (لا قفل السكربت العام) — لا يوقف حفظ أحد
  if (!lk.tryLock(1)) return 'busy';
  var t0 = Date.now();
  try {
    var dv = _dvAll_(), done = _supaSynced_(), pushedDv = {}, work = 0;
    SUPA_FNS_.forEach(function (fn) {
      if (Date.now() - t0 > SUPA_BUDGET_MS_) return;
      var groups = LF_READ_[fn] || [];
      var stale = groups.some(function (g) { return done[g] !== dv[g]; });
      if (!stale) return;
      var ok = fn === 'getTripsList' ? _supaPushTrips_(dv, groups) : _supaPushTripPilgrims_(dv, groups, t0);
      if (ok) { groups.forEach(function (g) { pushedDv[g] = dv[g]; }); work++; }
    });
    // البصمات تُرفع بعد البيانات: مجموعة لا تُعتبر مزامَنة إلا إذا نجحت كل الدوال التي تعتمد عليها
    var okGroups = {};
    Object.keys(pushedDv).forEach(function (g) {
      var all = SUPA_FNS_.every(function (fn) { return (LF_READ_[fn] || []).indexOf(g) < 0 || (LF_READ_[fn] || []).every(function (x) { return pushedDv[x] === dv[x] || done[x] === dv[x]; }); });
      if (all) okGroups[g] = dv[g];
    });
    var keys = Object.keys(okGroups);
    if (keys.length) {
      var dvr = {}; keys.forEach(function (g) { dvr[g] = okGroups[g]; });
      _supaReq_('post', 'rpc/dv_set', { p: dvr, p_force: false });   // (المرحلة 4) رفع فقط (لا يُرجع رمزاً للخلف ولا يولّد تغييراً وهمياً)
      keys.forEach(function (g) { done[g] = okGroups[g]; });
      PropertiesService.getScriptProperties().setProperty('SUPA_SYNCED', JSON.stringify(done));
    }
    try { _dvPgReconcile_(); } catch (eDv) { Logger.log('dvPg: ' + eDv); }   // (المرحلة 4)
    var gx = ''; try { gx = supaGlAuxSync_(false); } catch (eGx) { gx = 'err:' + String(eGx && eGx.message || eGx).slice(0, 80); Logger.log('supaGlAux: ' + gx); }   // ⚡ (V4.374)
    try { hbSnapSync_(false); } catch (eHs) { Logger.log('hbSnap: ' + eHs); }   // (V4.420) نسخة قراءة الحجوزات
    try { usersMirrorTick_(false); } catch (eUm) { Logger.log('usersMirror: ' + eUm); }   // (V4.419) مرآة المستخدمين PG→الورقة
    try { supaGlMetaSync_(); } catch (eGm) { Logger.log('supaGlMeta: ' + eGm); }   // ⚡ (V4.417) رابط ملف الحسابات + عدد صفوف شيتات العهد الناقصة (لـ glx_bootstrap)
    var b378 = _supaBootSync_();   // ⚡ (V4.378) app_config + حالة القيود + سجل التعديلات
    return 'ok work=' + work + ' glaux=' + gx + ' boot=' + b378 + ' ms=' + (Date.now() - t0);
  } finally { try { lk.releaseLock(); } catch (e) {} }
}

function _supaPushTrips_(dv, groups) {
  var data = _getTripsListCore_();
  var dvUsed = {}; groups.forEach(function (g) { dvUsed[g] = dv[g]; });
  return _supaUpsert_('read_cache', [{ fn: 'getTripsList', args_key: '', data: data, h: _supaHash_('getTripsList', data), dv: dvUsed, updated_at: new Date().toISOString() }], 'fn,args_key');
}

/* كل رحلات كشف المعتمرين بقراءة واحدة للشيت؛ يُرفع فقط ما تغيّرت بصمته عمّا بـ Supabase */
function _supaPushTripPilgrims_(dv, groups, t0) {
  var sheet = _getPilgrimsSheet_(), lastRow = sheet.getLastRow(), byTrip = {};
  if (lastRow >= 2) {
    var C = _robustColMap_(sheet, PILGRIMS_HEADERS_), P = _cellReader_(C, PILGRIMS_COL_);
    var vals = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < vals.length; i++) {
      var tn = String(P(vals[i], 'tripName') || '').trim(); if (!tn) continue;
      (byTrip[tn] = byTrip[tn] || []).push(_pilgrimRowObj_(P, vals[i], i));
    }
  }
  // الرحلات التي بلا معتمرين تُرفع قائمة فارغة (كي لا يبقى بـ Supabase كشف قديم لرحلة أُفرغت)
  var tsh = _getTripsSheet_();
  if (tsh.getLastRow() >= 2) {
    var TC = _robustColMap_(tsh, TRIPS_HEADERS_), T = _cellReader_(TC, TRIPS_COL_), tv = tsh.getRange(2, 1, tsh.getLastRow() - 1, tsh.getLastColumn()).getValues();
    tv.forEach(function (row) { var n = String(T(row, 'name') || '').trim(); if (n && !byTrip[n]) byTrip[n] = []; });
  }
  var old = {}, rr = _supaReq_('get', 'read_cache?fn=eq.getTripPilgrims&select=args_key,h&limit=5000');
  if (rr.code === 200) { try { JSON.parse(rr.text).forEach(function (x) { old[x.args_key] = x.h; }); } catch (e) {} }
  var dvUsed = {}; groups.forEach(function (g) { dvUsed[g] = dv[g]; });
  var batch = [], ok = true, nowIso = new Date().toISOString();
  var flush = function () { if (batch.length) { ok = _supaUpsert_('read_cache', batch, 'fn,args_key') && ok; batch = []; } };
  Object.keys(byTrip).forEach(function (tn) {
    if (Date.now() - t0 > SUPA_BUDGET_MS_) { ok = false; return; }
    var h = _supaHash_('getTripPilgrims', byTrip[tn]);
    if (old[tn] === h) return;   // لم يتغيّر كشف هذه الرحلة — يكفيه تحديث البصمات أدناه
    batch.push({ fn: 'getTripPilgrims', args_key: tn, data: byTrip[tn], h: h, dv: dvUsed, updated_at: nowIso });
    if (batch.length >= 20) flush();
  });
  flush();
  // بصمات المجموعات لكل صفوف الكشف دفعة واحدة (بعد رفع المتغيّر منها)
  if (ok) { var pr = _supaReq_('patch', 'read_cache?fn=eq.getTripPilgrims', { dv: dvUsed, updated_at: nowIso }, 'return=minimal'); ok = pr.code >= 200 && pr.code < 300; }
  return ok;
}

/* ============================================================================
   🗄️ (المرحلة 4) data_versions في Postgres = مرجع النبضة الوحيد حين تعمل طبقة التخزين (STORE_TABLES غير فارغة)
   ----------------------------------------------------------------------------
   • _dvBump_ (LiveSync.gs) يبدّل رموز الكاش كما كان ثم يستدعي _dvPgPush_ فيرفع نفس الرموز إلى Postgres (rpc/dv_set بمعاملة مستقلة بعد رفع
     الكتابات المعلّقة store_put، فالبيانات تسبق الرمز دائماً). dv_set يضمن رمزاً أكبر من الحالي مهما اختلفت الساعات.
   • فشل الرفع ⇒ علامة dv_pg_dirty بالكاش ⇒ مشغّل الدقيقة يطابق (soft) ويمسحها. أول تشغيل: يرفع كل الرموز مرة (DV_PG_SEEDED=1).
   • المتصفح ينبض من Postgres (app_poll) فقط إذا أعلن الخادم store.dv=true (STORE_TABLES + DV_PG_SEEDED) وإلا يبقى lfPoll.
   • إيقاف: Script property DV_PG=off (يرجع lfPoll). لا يمس سلوك Apps Script نفسه: الكاش يبقى المرجع للمسار القديم.
   ============================================================================ */
function _dvPgOn_() { return _supaOn_() && !!_supaP_('STORE_TABLES') && _supaP_('DV_PG') !== 'off'; }
function _dvPgPush_(o) {
  if (!_dvPgOn_() || !o) return;
  var r = _supaReq_('post', 'rpc/dv_set', { p: o });
  if (r.code < 200 || r.code >= 300) { Logger.log('dv_set ' + r.code + ' ' + String(r.text).slice(0, 160)); try { CacheService.getScriptCache().put('dv_pg_dirty', '1', 21600); } catch (e) {} }
}
function _dvPgReconcile_() {
  if (!_dvPgOn_()) return 'off';
  var P = PropertiesService.getScriptProperties(), c = CacheService.getScriptCache(), dirty = false;
  try { dirty = !!c.get('dv_pg_dirty'); } catch (e) {}
  if (!dirty && P.getProperty('DV_PG_SEEDED') === '1') return 'same';
  var r = _supaReq_('post', 'rpc/dv_set', { p: _dvAll_(), p_force: false });
  if (r.code < 200 || r.code >= 300) return 'fail ' + r.code;
  try { c.remove('dv_pg_dirty'); } catch (e2) {}
  P.setProperty('DV_PG_SEEDED', '1');
  return 'ok';
}
function supaDvSeedNow() { requireScriptOwner_(); var r = _dvPgReconcile_(); Logger.log('data_versions: ' + r); return r; }
// المجموعات الحيّة بالمخزن: مجموعة حيّة = كل جداولها بـ STORE_TABLES (ST_GROUPS_ بـ Store.gs)
function _supaStoreInfo_() {
  var out = _supaStoreInfo0_();
  // ⚡ (V4.378) مجموعات «زائفة» تعلن جاهزية ما يُقرأ من app_config/audit_log: cfg (الإعدادات) · glkick (عدّادات القيود) · audit (سجل التعديلات)
  try { if (!_supaBootOn_()) return out; if (_supaP_('SUPA_CFG_OK') === '1') out.groups.push('cfg'); if (_supaP_('SUPA_GLK_OK') === '1') out.groups.push('glkick'); if (_supaP_('SUPA_AUD_OK') === '1') out.groups.push('audit'); if (_supaP_('SUPA_AUD_OK') === '1' && _supaP_('SUPA_AUD_FULL') === '1') out.groups.push('audfull'); if (_supaP_('SUPA_KV_OK') === '1') out.groups.push('kv'); if (_supaP_('SUPA_BOT_OK') === '1') out.groups.push('bots'); if (_supaP_('SUPA_W_MF') === '1') out.groups.push('wmf'); if (_supaP_('SUPA_W_VZ') === '1') out.groups.push('wvz'); if (_supaP_('SUPA_W_BK') === '1') out.groups.push('wbk'); if (_usersSot_()) out.groups.push('wusr'); if (_supaP_('SUPA_W_GL') === '1') out.groups.push('wgl'); } catch (e) {}   // (V4.378) kv = ACC_PRICING/MF_EXEC_POLICY/NOTIF_TOGGLES منسوخة · bots = bookings_via_bot معبّأة
  return out;
}
function _supaStoreInfo0_() {
  var out = { groups: [], dv: false };
  try {
    if (typeof _stCfg_ !== 'function' || typeof ST_GROUPS_ === 'undefined') return out;
    var cfg = _stCfg_(); if (!cfg.on) return out;
    var sot = _usersSot_();   // (V4.433) app_users بمرجع Postgres (V4.419) يُعدّ «حيّاً» — حذفه من مزامنة الورقة كان يُسقط مجموعة misc كاملة فترتد شاشات كثيرة لـApps Script
    Object.keys(ST_GROUPS_).forEach(function (g) { if (ST_GROUPS_[g].every(function (t) { return cfg.set[t] || (t === 'app_users' && sot); })) out.groups.push(g); });
    out.dv = _dvPgOn_() && _supaP_('DV_PG_SEEDED') === '1';
  } catch (e) {}
  return out;
}


/* ============================================================================
   ⚡ (V4.378) التهيئة والدخول من Supabase — مرآة الإعدادات + حالة القيود + سجل التعديلات (009_boot_config.sql)
   ----------------------------------------------------------------------------
   • app_config: إعدادات Script properties التي تقرؤها الواجهة عند الإقلاع (notif_settings · session_cfg · sort_mode · app_version). تُرفع فور حفظ المدير
     للإعداد (saveNotifSettings/saveAlertCenter/saveSessionDurationConfig/saveBookingsSortDefault ⇒ _supaCfgKick_) وكل دقيقة بالمشغّل (بصمة ⇒ لا شبكة إن لم يتغيّر شيء).
   • gl_kick: {pending, csPend, autoAt, at} من نفس دوال appPulse (_glPendingCount_/_glCsPendTotal_) تُرفع بالمشغّل ⇒ نبضة المتصفح تقرأها من Postgres.
   • audit_log: ذيل شيت AuditLog (آخر 6000 صف، صفوف جديدة فقط بعلامة آخر صف) + تغييرات برنامج الحجوزات؛ الشاشة/التسمية تُحسب بدوال الخادم نفسها.
   • إيقاف كلّي: SUPA_BOOT=off (خاصية) ⇒ لا رفع ولا إعلان للواجهة ⇒ ترجع لنداءات Apps Script كما كانت.
   ============================================================================ */
function _supaBootOn_() { return _supaOn_() && _supaP_('SUPA_BOOT') !== 'off'; }
function _supaCfgBuild_() {
  return { app_version: { version: String(APP_VERSION) }, notif_settings: _notifSettingsObj_(), session_cfg: _sessionDurationObj_(), sort_mode: _sortModeObj_(), required_fields: _requiredFieldsObj_(),
    perm_maps: { legacy: (typeof _PERM_LEGACY_MAP_ !== 'undefined' ? _PERM_LEGACY_MAP_ : {}), screens: (typeof _PERM_SCREENS_ !== 'undefined' ? _PERM_SCREENS_ : []) } };   // ⚡ (V4.385) لدخول Postgres السريع (app_login)
}
function _supaCfgPush_(force) {
  if (!_supaBootOn_()) return 'off';
  var P = PropertiesService.getScriptProperties(), data = _supaCfgBuild_(), prev = {}, rows = [], H = {}, nowIso = new Date().toISOString();
  try { prev = JSON.parse(P.getProperty('SUPA_CFG_H') || '{}') || {}; } catch (e) { prev = {}; }
  Object.keys(data).forEach(function (k) { var h = _lfHash_(JSON.stringify(data[k])); H[k] = h; if (force || prev[k] !== h) rows.push({ key: k, value: data[k], updated_at: nowIso }); });
  if (!rows.length) return 'same';
  if (!_supaUpsert_('app_config', rows, 'key')) return 'fail';
  var merged = {}; Object.keys(prev).forEach(function (k) { merged[k] = prev[k]; }); Object.keys(H).forEach(function (k) { merged[k] = H[k]; });
  P.setProperty('SUPA_CFG_H', JSON.stringify(merged)); P.setProperty('SUPA_CFG_OK', '1');
  return 'ok:' + rows.length;
}
// يُستدعى من أي حافظ إعداد (بعد كتابة الخاصية): أي خطأ لا يكسر الحفظ
function _supaCfgKick_() { try { if (_supaBootOn_()) _supaCfgPush_(false); } catch (e) { Logger.log('supaCfg: ' + e); } }
function supaCfgSyncNow() { requireScriptOwner_(); var r = _supaCfgPush_(true); Logger.log('app_config: ' + r); return r; }

// حالة القيود للنبضة (الجزء المعدود من appPulse): تُرفع فقط إن تغيّرت القيم
function supaGlKickSync_() {
  if (!_supaBootOn_()) return 'off';
  if (typeof _glSSId_ !== 'function' || !_glSSId_() || typeof _glTripMode_ !== 'function' || !_glTripMode_()) return 'skip';
  var P = PropertiesService.getScriptProperties(), autoAt = '';
  try { autoAt = CacheService.getScriptCache().get('gl_autolog_at') || ''; } catch (e0) {}
  var v = { pending: _glPendingCount_(), csPend: _glCsPendTotal_(), autoAt: String(autoAt) };
  var h = _lfHash_(JSON.stringify(v));
  if (P.getProperty('SUPA_GLK_H') === h && P.getProperty('SUPA_GLK_OK') === '1') return 'same';
  v.at = _glNow_();
  if (!_supaUpsert_('app_config', [{ key: 'gl_kick', value: v, updated_at: new Date().toISOString() }], 'key')) return 'fail';
  P.setProperty('SUPA_GLK_H', h); P.setProperty('SUPA_GLK_OK', '1');
  return 'ok';
}

// ---- سجل التعديلات: نفس بناء حقول getAuditLog (Code.gs) لكل صف ----
var SUPA_AUD_WIN_ = 6000, SUPA_AUD_CHUNK_ = 500, SUPA_AUD_TICK_ = 3000;
function _supaAuditClean_(val) {   // = cleanDateVal بـ getAuditLog
  if (!val) return '-';
  var s = String(val), m = s.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\s+(\d{2}:\d{2}):\d{2}\s+GMT[+-]\d{4}.*/i);
  if (m) {
    var months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    var day = m[3].padStart(2, '0'), mon = months[m[2]] || '??', yr = m[4], time = m[5];
    return time === '00:00' ? day + '/' + mon + '/' + yr : day + '/' + mon + '/' + yr + ' ' + time;
  }
  return s;
}
function _supaAuditRow_(row, rn) {
  if (!row[0] && !row[1] && !row[2]) return null;
  var ts = row[0], tsStr = '-', tsDate = (ts instanceof Date) ? ts : null;
  if (ts) { try { tsStr = (ts instanceof Date) ? Utilities.formatDate(ts, _tz_() || 'Asia/Riyadh', 'dd/MM/yyyy HH:mm:ss') : String(ts); } catch (e) { tsStr = String(ts); } }
  var username = row[1] ? String(row[1]) : '-', action = row[2] ? String(row[2]) : '-', recordId = row[3] ? String(row[3]) : '-', field = row[4] ? String(row[4]) : '-';
  var screen = _auditScreen_(action, field, recordId);
  return { src: 'main', rn: rn, ts_str: tsStr, ts_ms: tsDate ? tsDate.getTime() : null, t_ms: tsDate ? tsDate.getTime() : _auditTsNum_(tsStr), username: username, action: action, record_id: recordId, field: field,
    old_value: _supaAuditClean_(row[5]), new_value: _supaAuditClean_(row[6]), screen: screen, screen_label: AUDIT_SCREEN_LABELS_[screen] || 'أخرى' };
}
// 📜 (V4.443) تحميل كامل سجل التعديلات القديم لـ Postgres (مرة واحدة) — المزامنة الدورية تحمل آخر 6000 صف فقط، فشاشات «سجل التعديلات»
// للرحلة/ملف الوزارة/مجموعة التأشيرات/حساب العميل تنتقل لـ Postgres فقط بعد اكتماله (مجموعة audfull). قابل للاستكمال: لو توقف عند حد
// زمن التنفيذ شغّله مرة أخرى فيكمل من حيث وقف. شغّله من المحرر: supaAuditBackfillAll
function supaAuditBackfillAll() {
  requireScriptOwner_();
  var P = PropertiesService.getScriptProperties(), sh = ensureAuditLogSheet_(), lastRow = sh.getLastRow(), t0 = Date.now();
  var winFrom = Math.max(2, lastRow - SUPA_AUD_WIN_ + 1);   // ما بعده تحمله المزامنة الدورية أصلاً
  var at = parseInt(P.getProperty('SUPA_AUD_BF_ROW') || '1', 10) || 1, n = 0;
  for (var s = Math.max(2, at + 1); s < winFrom; s += SUPA_AUD_CHUNK_) {
    if (Date.now() - t0 > 300000) { var m = 'توقف عند الصف ' + (s - 1) + ' من ' + (winFrom - 1) + ' (حد زمن التنفيذ) — شغّل الدالة مرة أخرى لتكمل'; Logger.log(m); return m; }
    var e = Math.min(winFrom - 1, s + SUPA_AUD_CHUNK_ - 1), vals = sh.getRange(s, 1, e - s + 1, 7).getValues(), rows = [];
    vals.forEach(function (r, i) { var o = _supaAuditRow_(r, s + i); if (o) rows.push(o); });
    if (!_supaUpsert_('audit_log', rows, 'src,rn')) { Logger.log('فشل الرفع عند الصف ' + s); return 'fail'; }
    n += rows.length; P.setProperty('SUPA_AUD_BF_ROW', String(e));
  }
  P.setProperty('SUPA_AUD_FULL', '1');
  try { if (typeof _dvBump_ === 'function') _dvBump_(['audit']); } catch (eD) {}
  var msg = '✅ اكتمل تحميل سجل التعديلات القديم (' + n + ' سطر بهذا التشغيل) — شاشات السجل تعمل الآن من Postgres';
  Logger.log(msg); return msg;
}
function supaAuditSync_() {
  if (!_supaBootOn_()) return 'off';
  var P = PropertiesService.getScriptProperties(), res = [];
  var sh = ensureAuditLogSheet_(), lastRow = sh.getLastRow(), mk = parseInt(P.getProperty('SUPA_AUD_ROW') || '0', 10) || 0, win = SUPA_AUD_WIN_;
  if (mk > lastRow) { var d = _supaReq_('delete', 'audit_log?src=eq.main'); if (d.code < 200 || d.code >= 300) return 'fail'; mk = 0; }   // الشيت قُصّ ⇒ إعادة بناء
  var from = mk ? mk + 1 : Math.max(2, lastRow - win + 1), to = Math.min(lastRow, from + SUPA_AUD_TICK_ - 1), moved = (mk === 0);
  for (var s = from; s <= to; s += SUPA_AUD_CHUNK_) {
    var e = Math.min(to, s + SUPA_AUD_CHUNK_ - 1), vals = sh.getRange(s, 1, e - s + 1, 7).getValues(), rows = [];
    vals.forEach(function (r, i) { var o = _supaAuditRow_(r, s + i); if (o) rows.push(o); });
    if (!_supaUpsert_('audit_log', rows, 'src,rn')) return 'fail';
    mk = e; moved = true; P.setProperty('SUPA_AUD_ROW', String(mk));
  }
  if (lastRow < 2) { mk = Math.max(lastRow, 0); moved = true; P.setProperty('SUPA_AUD_ROW', String(mk)); }
  var hbSeq = 0;
  // برنامج الحجوزات: صفوف جديدة فقط (rn تسلسلي) — اختياري (إن وُجد ملفه)
  try {
    var hs = (typeof getSS_ === 'function' && typeof CHANGELOG_SHEET_NAME !== 'undefined') ? getSS_().getSheetByName(CHANGELOG_SHEET_NAME) : null;
    if (hs) {
      var hl = hs.getLastRow(), hm = P.getProperty('SUPA_AUD_HB_ROW'); hm = (hm === null || hm === undefined || hm === '') ? -1 : parseInt(hm, 10); hbSeq = parseInt(P.getProperty('SUPA_AUD_HB_SEQ') || '0', 10) || 0;
      if (hm < 0 || hl < hm) { _supaReq_('delete', 'audit_log?src=eq.hb'); hm = Math.max(1, hl - win); hbSeq = 0; }
      if (hl > hm) {
        var list = _auditHotelsRows_(hl - hm), rows2 = list.map(function (x) { return { src: 'hb', rn: ++hbSeq, ts_str: x.timestamp, ts_ms: x.tsDate ? x.tsDate.getTime() : null, t_ms: x.tsDate ? x.tsDate.getTime() : _auditTsNum_(x.timestamp),
          username: x.username, action: x.action, record_id: x.recordId, field: x.field, old_value: x.oldValue, new_value: x.newValue, screen: x.screen, screen_label: x.screenLabel }; });
        for (var q = 0; q < rows2.length; q += SUPA_AUD_CHUNK_) if (!_supaUpsert_('audit_log', rows2.slice(q, q + SUPA_AUD_CHUNK_), 'src,rn')) return 'fail';
        _supaReq_('delete', 'audit_log?src=eq.hb&rn=lte.' + (hbSeq - win));
      }
      P.setProperty('SUPA_AUD_HB_ROW', String(hl)); P.setProperty('SUPA_AUD_HB_SEQ', String(hbSeq));
    }
  } catch (eHb) { Logger.log('supaAudit hb: ' + eHb); }
  if (moved || P.getProperty('SUPA_AUD_OK') !== '1') {
    if (!_supaUpsert_('app_config', [{ key: 'audit_meta', value: { lastRow: mk }, updated_at: new Date().toISOString() }], 'key')) return 'fail';
    if (mk > win) _supaReq_('delete', 'audit_log?src=eq.main&rn=lt.' + (mk - win + 1));
    P.setProperty('SUPA_AUD_OK', '1'); return 'ok to=' + mk;
  }
  return 'same';
}
function supaAuditResetNow() {   // من المحرر (المالك): يمسح النسخة ويعيد بناءها من الشيت
  requireScriptOwner_();
  _supaReq_('delete', 'audit_log?rn=gte.0&src=neq.pg');
  var P = PropertiesService.getScriptProperties(); ['SUPA_AUD_ROW', 'SUPA_AUD_HB_ROW', 'SUPA_AUD_HB_SEQ', 'SUPA_AUD_OK'].forEach(function (k) { P.deleteProperty(k); });
  var r = supaAuditSync_(); Logger.log('audit_log: ' + r); return r;
}

function _supaBootSync_() {
  var r = [];
  try { r.push('cfg=' + _supaCfgPush_(false)); } catch (e1) { r.push('cfg=err'); Logger.log('supaCfg: ' + e1); }
  try { r.push('glk=' + supaGlKickSync_()); } catch (e2) { r.push('glk=err'); Logger.log('supaGlKick: ' + e2); }
  try { r.push('aud=' + supaAuditSync_()); } catch (e3) { r.push('aud=err'); Logger.log('supaAudit: ' + e3); }
  return r.join(',');
}
// فحص فوري من المحرر لكل ما سبق
function supaBootSyncNow() { requireScriptOwner_(); var r = _supaBootSync_(); Logger.log(r); return r; }


/* ⚡ (V4.385) دخول سريع: شغّلها مرة واحدة من المحرر بعد تشغيل 021_fast_login.sql — ترفع سرّ JWT (جدول app_secrets بلا أي منح للمتصفح) + خرائط الصلاحيات */
function supaAuthSeedNow() {
  requireScriptOwner_();
  if (!_supaOn_() || !_supaP_('SUPA_JWT_SECRET')) { Logger.log('SUPA_ENABLED/SUPA_JWT_SECRET غير مضبوطة'); return 'off'; }
  var ok = _supaUpsert_('app_secrets', [{ k: 'jwt_secret', v: _supaP_('SUPA_JWT_SECRET') }], 'k');
  var c = _supaCfgPush_(true);
  Logger.log('app_secrets: ' + (ok ? 'ok' : 'fail') + ' | app_config: ' + c);
  return ok ? 'ok' : 'fail';
}
