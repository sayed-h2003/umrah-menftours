/* ⚙️ (V4.445) تعريفات تُلحق بآخر كود Apps Script داخل Edge Function «gas» — آخر تعريف للدالة هو المعتمد.
   الهوية من JWT · كل نداءات Supabase عبر الشريط (__EDGE.req) · جداول طبقة التخزين والقيود من اللقطة · السجل عبر صادر audit. */
function requireAuth_(token) { var s = __EDGE.session(); if (!s || s.hb) throw new Error('جلسة غير صالحة أو منتهية - يرجى تسجيل الدخول مرة أخرى'); return s; }
function validateSession_(token) { var s = __EDGE.session(); return s && !s.hb ? s : null; }
function _supaReq_(method, path, body, prefer) { return __EDGE.req(method, path, body, prefer); }
function _stReadAll_(t) { return __EDGE.readTable(t); }
function _stVerFetch_(t) { var v = String(__EDGE.vers([t])[t] || '0'); try { _stTokPut_(t, v); } catch (e) {} return v; }
function _glStReadRows_(key) {
  var W = _glStW_(key), a = __EDGE.glRows(key), out = [];
  for (var i = 0; i < a.length; i++) { var raw = a[i]; if (!raw) throw new Error('GL_STORE: صف بلا raw'); out.push(_glStPad_(raw.map(_glStDec_), W)); }
  return out;
}
function _glStLoadRows_(key, v, putOk) { return _glStReadRows_(key); }
function logChange_(username, action, recordId, field, oldVal, newVal) {
  var s = function (v) { return v === undefined || v === null ? '-' : String(v); };
  _supaReq_('post', 'app_outbox', { kind: 'audit', payload: { user: username || 'غير معروف', action: action || '-', record: recordId || '-', field: field || '-', old: s(oldVal), 'new': s(newVal) } });
  try { _glMarkDirty_(action, recordId); } catch (e) {}
}
function __edgeEnd() {
  if (typeof _stEndRequest_ === 'function') _stEndRequest_();
  if (typeof _glStFlush_ === 'function') { if (_glStOn_()) _glStFlush_(); }
  // تغيّرت بيانات الحسابات ⇒ gl_aux (شاشات القراءة بـ Postgres) تُعاد بنفس الطلب بدل انتظار مشغّل الدقيقة
  if (__EDGE.propChanged('GL_DATA_VER') && typeof supaGlAuxSync_ === 'function') supaGlAuxSync_(true);
}
/* ⚙️ (V4.450) ملف برنامج الحجوزات يُقرأ من نسخة hb_snap (قراءة فقط) — أي كتابة به ⇒ غير مدعوم (يرجع لـApps Script) */
SpreadsheetApp = (function (base) {
  var ro = function (what) { return function () { __EDGE.unsup('كتابة بملف الحجوزات: ' + what); }; };
  var sheet = function (tbl, name) {
    var rows = null, load = function () { if (!rows) { rows = {}; __EDGE.hbRows(tbl).forEach(function (x) { rows[x[0]] = (x[1] || []).map(_stDec_); }); } return rows; };
    var last = function () { var m = 0; Object.keys(load()).forEach(function (k) { if (+k > m) m = +k; }); return m; };
    var lastC = function () { var m = 0; Object.keys(load()).forEach(function (k) { if (rows[k].length > m) m = rows[k].length; }); return m; };
    var range = function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return { getValues: function () { var out = [], R = load(); for (var i = 0; i < nr; i++) { var src = R[r + i] || [], row = []; for (var j = 0; j < nc; j++) { var v = src[c - 1 + j]; row.push(v === undefined || v === null ? '' : v); } out.push(row); } return out; },
        getDisplayValues: function () { return this.getValues().map(function (rw) { return rw.map(String); }); }, getValue: function () { return this.getValues()[0][0]; },
        setValue: ro('setValue'), setValues: ro('setValues'), clearContent: ro('clearContent'), setNumberFormat: function () { return this; }, getNumRows: function () { return nr; } };
    };
    return { getName: function () { return name; }, getLastRow: last, getLastColumn: lastC, getMaxRows: last, getRange: range,
      getDataRange: function () { return range(1, 1, Math.max(1, last()), Math.max(1, lastC())); },
      appendRow: ro('appendRow'), insertRowAfter: ro('insertRow'), insertRowsAfter: ro('insertRows'), deleteRow: ro('deleteRow'), deleteRows: ro('deleteRows') };
  };
  var book = function (id) {
    var c = _glHbCfg_(), isSrc = id === (c.srcId || c.ssId), isMain = id === c.ssId;
    return { getId: function () { return id; }, getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + id; }, getName: function () { return 'hb'; },
      getSpreadsheetTimeZone: function () { return Session.getScriptTimeZone(); },
      getSheetByName: function (n) {
        if (isSrc && n === c.mk) return sheet('mk', n); if (isSrc && n === c.md) return sheet('md', n);
        if (isMain && n === c.pay) return sheet('pay', n); if (isMain && n === 'البيانات المحاسبية للدفعات') return sheet('meta', n); if (isMain && n === c.prof) return sheet('prof', n);
        __EDGE.unsup('ورقة «' + n + '» بملف الحجوزات');
      }, insertSheet: ro('insertSheet'), getSheets: function () { __EDGE.unsup('getSheets بملف الحجوزات'); } };
  };
  var inCfg = false;
  return Object.assign({}, base, { openById: function (id) {
    if (inCfg || !id) return base.openById(id);
    try { if (id === _glSSId_()) return base.openById(id); } catch (e0) {}   // ملف الحسابات نفسه ⇒ طبقة التخزين
    var c = null; inCfg = true;
    try { c = _glHbCfg_(); } catch (e) { c = null; } finally { inCfg = false; }
    if (c && (id === c.ssId || id === c.srcId)) return book(id);
    return base.openById(id);
  } });
})(SpreadsheetApp);
/* ⚙️ (V4.453) جلسة برنامج الحجوزات من رمز Supabase (مطالبة hb) بدل خصائص الجلسات — رمز برنامج العمرة بلا hb ⇒ غير مدعوم (يرتد لـApps Script).
   رموز برنامج الحجوزات لا تفتح دوال برنامج العمرة (requireAuth_ يرفضها). المستخدم من ورقة «المستخدمون» (طبقة التخزين hb_users) + سقف الدخول الموحّد. */
function checkSession(token) {
  var s = __EDGE.session(), h = s && s.hb;
  if (!h || !h.u) __EDGE.unsup('جلسة برنامج الحجوزات');
  var sh = ensureUsersSheet_(), i = findUserRow_(sh, h.u);
  if (i === -1) return { ok: false };
  var row = sh.getRange(i, 1, 1, 8).getValues()[0];
  if (row[6] === false) return { ok: false };
  return safeReturn_({ ok: true, user: capUserBySso_(userRecordFromRow_(row), h.cap || null), sessionMinutes: getSessionDurationMinutes() });
}
/* اختبار محلي فقط (tools/hb_conn_test.mjs) — لا يُستدعى من الواجهة (الاسم ينتهي بـ _) */
function _hbConnTestWrite_() { var sh = openSourceSpreadsheet_().getSheetByName('حجوزات مكة'); sh.getRange(5, 16).setValue('ملغى'); return sh.getRange(5, 16).getValue(); }
