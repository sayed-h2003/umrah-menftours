/* ⚙️ (V4.445) تعريفات تُلحق بآخر كود Apps Script داخل Edge Function «gas» — آخر تعريف للدالة هو المعتمد.
   الهوية من JWT · كل نداءات Supabase عبر الشريط (__EDGE.req) · جداول طبقة التخزين والقيود من اللقطة · السجل عبر صادر audit. */
function requireAuth_(token) { var s = __EDGE.session(); if (!s) throw new Error('جلسة غير صالحة أو منتهية - يرجى تسجيل الدخول مرة أخرى'); return s; }
function validateSession_(token) { return __EDGE.session(); }
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
