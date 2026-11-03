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

function _supaP_(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || ''); }
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

/* رمز قراءة قصير العمر للمتصفح (HS256) — يعمل لكل أنواع الجلسات (حتى «تذكّر الجهاز» بلا كلمة مرور) */
function supaIssueToken(authToken) {
  var s = requireAuth_(authToken);
  if (!_supaOn_() || !_supaP_('SUPA_JWT_SECRET') || !_supaP_('SUPA_ANON_KEY')) return { success: true, enabled: false };
  var perms = []; try { var pv = s.permissions; perms = Array.isArray(pv) ? pv : String(pv || '').split(/[,،;|]/).map(function (x) { return x.trim(); }).filter(Boolean); } catch (e) {}
  var now = Math.floor(Date.now() / 1000), exp = now + 8 * 3600;
  var b64 = function (o) { return Utilities.base64EncodeWebSafe(typeof o === 'string' ? o : JSON.stringify(o)).replace(/=+$/, ''); };
  var head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64({ role: 'authenticated', aud: 'authenticated', sub: String(s.username), app_user: String(s.username), perms: perms, iat: now, exp: exp });
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(head + '.' + body, _supaP_('SUPA_JWT_SECRET'))).replace(/=+$/, '');
  return { success: true, enabled: true, url: _supaP_('SUPA_URL').replace(/\/+$/, ''), anon: _supaP_('SUPA_ANON_KEY'), token: head + '.' + body + '.' + sig, expiresAt: exp * 1000 };
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
      _supaUpsert_('data_versions', keys.map(function (g) { return { group_name: g, token: okGroups[g], updated_at: new Date().toISOString() }; }), 'group_name');
      keys.forEach(function (g) { done[g] = okGroups[g]; });
      PropertiesService.getScriptProperties().setProperty('SUPA_SYNCED', JSON.stringify(done));
    }
    return 'ok work=' + work + ' ms=' + (Date.now() - t0);
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
