/* ============================================================================
   Store.gs — (V4.376) طبقة التخزين العامة: Postgres (Supabase) مصدر الحقيقة لأي شيت، والشيت احتياطي/انتقالي فقط
   ----------------------------------------------------------------------------
   • مفتاح التشغيل: Script property  STORE_TABLES = قائمة مفصولة بفواصل من: أسماء الجداول (mf_files…) أو أسماء المجموعات
     (ministry · core · acc · bookings · visa · misc · glaux) أو all. الافتراضي فارغ = السلوك القديم حرفياً (الشيتات) بلا أي فرق.
     يلزم أيضاً SUPA_URL و SUPA_SERVICE_KEY (كبقية الطبقات).
   • نقطة اختناق واحدة: getSpreadsheet_() (الملف الرئيسي) و _glSS_() (ملف الحسابات) يرجعان «غلاف مصنّف» (Proxy). getSheetByName(اسم)
     يرجع واجهة شيت (facade) فوق صورة بالذاكرة للجدول إن كان مفعّلاً، وإلا الشيت الحقيقي. كل الكود الحالي يعمل كما هو
     (getLastRow/getRange.getValues/setValues/setValue/clearContent/appendRow/deleteRow(s)/getDataRange…) بأرقام صفوف الشيت حرفياً.
   • النموذج: صف الشيت = (rid ثابت، ord ترتيب، raw = خلايا الشيت حرفياً jsonb). الترويسة (الصف 1) تُحفظ بـ store_meta.hdr.
     الكتابة تُجمَّع بالذاكرة وتُرفع كفرق (diff) بنداء RPC واحد ذرّي store_put لكل جدول عند: فك أي قفل مسمّى (_glNamedLock_/_resTry_) ·
     فك قفل السكربت (_stLk_) · _dvBump_ (كل إبطال كاش) · نهاية الطلب (Perf.gs). نفس لحظات SpreadsheetApp.flush القديمة.
   • الجداول المنمّطة (clients/trips/pilgrims…) تُحدَّث بنفس المعاملة كمرآة للـSQL (تحويلات Migration.gs نفسها) بأفضل جهد: فشل صف
     (مفتاح أجنبي/فريد) لا يُضيّع بيانات الشيت — يُسجَّل بـ store_mirror_errors ويظهر في storeCompare().
   • القراءة: صفحات 1000 صف بالتوازي (UrlFetchApp.fetchAll) بنداء store_read الذي يرجع الإصدار مع الصفحة (لقطة متسقة)؛ الكاش
     (CacheService، gzip على أجزاء) بمفتاح (جدول + إصدار) فلا يُقرأ كاش قديم أبداً؛ رمز الإصدار بالكاش بمهلة 120 ثانية ثم يُعاد
     من القاعدة. الصورة تُعاد قراءتها عند أخذ أي قفل مسمّى/قفل سكربت (مثل _glStOnAcquire_) وإذا تغيّر الرمز وعمرها > 1.5 ثانية.
   • أدوات المالك (من المحرر): storeCompare* · storeCutover*(Apply) · storeRollback* — انظر DEPLOY_GUIDE.md «طبقة التخزين العامة».
   ============================================================================ */
var ST_PAGE_ = 1000, ST_CHUNK_ = 1500, ST_TOK_TTL_ = 120, ST_FRESH_MS_ = 1500, ST_CACHE_TTL_ = 21600;
var ST_GROUPS_ = {
  ministry: ['mf_supervisors', 'mf_files', 'mf_receipts', 'mf_quota_transfers'],
  core: ['companies', 'clients', 'trips', 'pilgrims', 'client_links'],
  acc: ['acc_items', 'acc_payments', 'acc_meta', 'acc_trip_prices', 'acc_client_prices', 'acc_merge_groups'],
  bookings: ['bookings', 'movements'],
  visa: ['vz_files', 'vz_items', 'vz_payments', 'vz_housing_agreements', 'vz_housing_allocations', 'vz_transport_prices', 'vz_agent_prices', 'agent_company_accounts', 'transport_overrides'],
  misc: ['app_users', 'user_ui_prefs', 'notifications', 'housing_notes', 'merged_housing', 'catering_contracts'],
  // جداول ملف الحسابات الجانبية التي لا يقرؤها أي برنامج آخر مباشرة من الشيت. (gl_accounts/gl_settings خارجها: HB_GlLink.gs:64,68 و HB_Code.gs:4685 يقرؤونها من الشيت)
  hb: ['hb_payments', 'hb_profiles', 'hb_mecca', 'hb_medina'],
  glaux: ['gl_batches', 'gl_pending', 'gl_pay_direct', 'gl_auto_log', 'gl_statements', 'gl_attachments', 'gl_fx_daily', 'gl_hb_map', 'gl_hb_pay', 'gl_hb_trip', 'gl_hb_mirror', 'gl_hb_keep_erp',
          'gl_recon_links', 'gl_auto_override', 'gl_bank_due', 'gl_maker_checker', 'gl_charters', 'gl_deleted']
};
var ST_NEVER_ = { gl_entries: 1, gl_lines: 1 };   // لهما طبقتهما الخاصة (GlStore.gs / GL_STORE)
// أعمدة المبالغ لمقارنة المجاميع (مثل mgVerify): [جدول منمّط ← عمود]
var ST_MONEY_ = { acc_items: ['amount'], acc_payments: ['amount'], mf_receipts: ['amount'], vz_items: ['amount'], vz_payments: ['amount'], mf_files: ['program_price', 'ticket'], vz_files: ['price_per'], gl_pending: ['cur_base', 'new_base'] };

var _ST_CFG_ = null, _ST_IMG_ = {}, _ST_SHEETS_ = {}, _ST_WRAP_ = {}, _ST_BYPASS_ = false, _ST_FLUSHING_ = false, _ST_EX_ = null, _ST_WARM_ = {}, _ST_FAIL_ = null;

/* ---------------- الإعداد ---------------- */
function _stSpecs_() {
  if (!_stSpecs_.c) { var m = {}; MG_SPECS_.forEach(function (s) { if (s.t) m[s.t] = s; }); _stSpecs_.c = m; }
  return _stSpecs_.c;
}
function _stExpand_(list) {
  var specs = _stSpecs_(), out = {};
  String(list || '').split(/[,\s;]+/).forEach(function (x) {
    x = x.trim(); if (!x) return;
    if (x === 'all') { Object.keys(specs).forEach(function (t) { if (!ST_NEVER_[t]) out[t] = 1; }); return; }
    if (ST_GROUPS_[x]) { ST_GROUPS_[x].forEach(function (t) { out[t] = 1; }); return; }
    if (specs[x] && !ST_NEVER_[x]) out[x] = 1;
  });
  return out;
}
function _stCfg_() {
  if (_ST_CFG_) return _ST_CFG_;
  var cfg = { on: false, set: {}, bySheet: { main: {}, gl: {}, hb: {} } };
  try {
    var raw = _supaP_('STORE_TABLES');
    if (raw && _supaP_('SUPA_URL') && _supaP_('SUPA_SERVICE_KEY')) {
      cfg.set = _stExpand_(raw);
      var specs = _stSpecs_();
      Object.keys(cfg.set).forEach(function (t) { var sp = specs[t]; if (sp.snap) { cfg.on = true; return; } cfg.bySheet[_stWhich_(sp)][sp.sheet] = sp; cfg.on = true; });
    }
  } catch (e) { cfg = { on: false, set: {}, bySheet: { main: {}, gl: {}, hb: {} } }; }
  _ST_CFG_ = cfg; return cfg;
}
function _stWhich_(sp) { return sp.ss === 'gl' ? 'gl' : sp.ss === 'hb' ? 'hb' : 'main'; }
function _stSsOf_(sp) { return sp.ss === 'gl' ? _glSS_() : sp.ss === 'hb' ? getSS_() : getSpreadsheet_(); }
function _stActive_() { return _stCfg_().on; }
// للاختبارات/بعد تغيير المفتاح: إعادة قراءة المفتاح وتفريغ الصور
function _stReset_() { _ST_CFG_ = null; _ST_IMG_ = {}; _ST_SHEETS_ = {}; _ST_WRAP_ = {}; _ST_BYPASS_ = false; _ST_FLUSHING_ = false; _ST_EX_ = null; _ST_WARM_ = {}; _ST_FAIL_ = null; }
function _stSpecFor_(which, sheetName) { if (_ST_BYPASS_) return null; var m = _stCfg_().bySheet[which === 'gl' ? 'gl' : which === 'hb' ? 'hb' : 'main']; return m.hasOwnProperty(sheetName) ? m[sheetName] : null; }

/* ---------------- الغلاف (نقطة الاختناق) ---------------- */
function _stWrapSS_(ss, which) {
  if (!ss || !_stActive_()) return ss;
  var memo = _ST_WRAP_[which]; if (memo && memo.raw === ss) return memo.w;
  var w = null;
  var over = {
    getSheetByName: function (n) {
      var sp = _stSpecFor_(which, n);
      if (sp) return _stExists_(sp) ? _stSheet_(sp, w) : null;
      return ss.getSheetByName(n);
    },
    insertSheet: function (n) {
      var sp = _stSpecFor_(which, n);
      if (!sp) return ss.insertSheet.apply(ss, arguments);
      if (_stExists_(sp)) throw new Error('هناك ورقة موجودة من قبل بالاسم ' + n);
      var im = _stImg_(sp); im.exists = true; im.metaDirty = true; _stMarkEx_(sp.t, true); _stDirty_(im);
      return _stSheet_(sp, w);
    },
    deleteSheet: function (sh) {
      var n = sh && sh.getName ? sh.getName() : '', sp = _stSpecFor_(which, n);
      if (!sp) return ss.deleteSheet(sh);
      throw new Error('STORE: حذف جدول مخزَّن غير مدعوم (' + sp.t + ') — أعده للشيت أولاً من أدوات المالك');
    }
    // getSheets(): تُرجع الشيتات الحقيقية كما هي (لا تُحمَّل الجداول المخزَّنة لمجرد العدّ — Perf.gs يعدّها فقط)
  };
  w = new Proxy(ss, { get: function (t, k) { if (typeof k === 'string' && over.hasOwnProperty(k)) return over[k]; var v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  _ST_WRAP_[which] = { raw: ss, w: w };
  return w;
}
// وجود الشيت = له صف بـ store_meta (يُنشأ عند أول كتابة/نقل). خريطة صغيرة بالكاش
function _stExistsMap_() {
  if (_ST_EX_) return _ST_EX_;
  var got = null;
  try { var c = CacheService.getScriptCache().get('st_ex'); if (c) got = JSON.parse(c); } catch (e) {}
  if (!got) {
    var r = _stRpc_('store_vers', {});
    got = {}; Object.keys(r || {}).forEach(function (t) { got[t] = 1; });
    try { CacheService.getScriptCache().put('st_ex', JSON.stringify(got), ST_TOK_TTL_); } catch (e2) {}
  }
  _ST_EX_ = got; return got;
}
function _stExists_(sp) { var im = _ST_IMG_[sp.t]; if (im && im.exists) return true; return !!_stExistsMap_()[sp.t]; }
function _stMarkEx_(t, yes) { try { var m = _stExistsMap_(); if (yes) m[t] = 1; else delete m[t]; CacheService.getScriptCache().remove('st_ex'); } catch (e) {} }

/* ---------------- ترميز الخلايا ---------------- */
function _stIsD_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function _stEnc_(v) { if (_stIsD_(v)) return isNaN(v.getTime()) ? '' : { $d: v.getTime() }; if (v === undefined || v === null) return ''; if (typeof v === 'number' && !isFinite(v)) return ''; return v; }
function _stDec_(v) { return (v && typeof v === 'object' && v.$d !== undefined) ? new Date(v.$d) : v; }
function _stCellIn_(v) { if (_stIsD_(v)) return new Date(v.getTime()); return (v === undefined || v === null || (typeof v === 'number' && !isFinite(v))) ? '' : v; }
function _stCellOut_(v) { return _stIsD_(v) ? new Date(v.getTime()) : v; }
function _stBlank_(c) { for (var i = 0; i < c.length; i++) { var v = c[i]; if (v !== '' && v !== null && v !== undefined) return false; } return true; }
function _stTrimCells_(c) { var n = c.length; while (n > 0 && (c[n - 1] === '' || c[n - 1] === null || c[n - 1] === undefined)) n--; return n === c.length ? c : c.slice(0, n); }
function _stEncRow_(c) { return _stTrimCells_(c).map(_stEnc_); }
function _stJs_(c) { return JSON.stringify(_stEncRow_(c)); }
function _stNewRid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }

/* ---------------- الشبكة ---------------- */
function _stRpc_(fn, body) {
  var r = _supaReq_('post', 'rpc/' + fn, body === undefined ? {} : body);
  if (r.code < 200 || r.code >= 300) throw new Error('STORE: فشل ' + fn + ' (' + r.code + ') ' + String(r.text).slice(0, 240));
  var t = String(r.text || '');
  try { return t ? JSON.parse(t) : null; } catch (e) { return t; }
}
function _stReqObj_(path, body) {
  var key = _supaP_('SUPA_SERVICE_KEY');
  return { url: _supaP_('SUPA_URL').replace(/\/+$/, '') + '/rest/v1/' + path, method: 'post', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, payload: JSON.stringify(body), muteHttpExceptions: true };
}
// قراءة كاملة للجدول من القاعدة: الصفحة الأولى تُعلم العدد ثم الباقي بالتوازي. الإصدار يجب أن يتطابق بكل الصفحات وإلا إعادة
function _stReadAll_(t) {
  for (var attempt = 0; attempt < 3; attempt++) {
    var p0 = _stRpc_('store_read', { p_tbl: t, p_off: 0, p_lim: ST_PAGE_ });
    var rows = p0.rows.slice(), ok = true, n = Number(p0.n) || 0;
    if (n > ST_PAGE_) {
      var reqs = [];
      for (var off = ST_PAGE_; off < n; off += ST_PAGE_) reqs.push(_stReqObj_('rpc/store_read', { p_tbl: t, p_off: off, p_lim: ST_PAGE_ }));
      var resp = [];
      if (typeof UrlFetchApp.fetchAll === 'function') resp = UrlFetchApp.fetchAll(reqs);
      else resp = reqs.map(function (q) { return UrlFetchApp.fetch(q.url, q); });
      for (var i = 0; i < resp.length; i++) {
        var code = resp[i].getResponseCode();
        if (code < 200 || code >= 300) throw new Error('STORE: تعذّرت قراءة ' + t + ' (' + code + ') ' + String(resp[i].getContentText()).slice(0, 160));
        var pg = JSON.parse(resp[i].getContentText());
        if (String(pg.ver) !== String(p0.ver)) { ok = false; break; }
        rows = rows.concat(pg.rows);
      }
    }
    if (ok) {
      if (rows.length !== n) { if (attempt < 2) continue; }
      return { ver: String(p0.ver), exists: !!p0.exists, hdr: p0.hdr || [], rows: rows };
    }
  }
  throw new Error('STORE: ' + t + ' تتغيّر أثناء القراءة (إصدار غير متسق) — أعد المحاولة');
}

/* ---------------- كاش (gzip على أجزاء) — مفتاحه (جدول + إصدار) فلا يُقرأ قديم ---------------- */
function _stCPut_(key, obj) {
  try {
    var js = JSON.stringify(obj), b = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(js, 'application/json')).getBytes()), CH = 95000;
    var n = Math.ceil(b.length / CH); if (!n || n > 400) return false;
    var m = {}; for (var i = 0; i < n; i++) m[key + ':' + i] = b.substr(i * CH, CH);
    var c = CacheService.getScriptCache(); c.putAll(m, ST_CACHE_TTL_); c.put(key, String(n), ST_CACHE_TTL_);
    return true;
  } catch (e) { return false; }
}
function _stCGet_(key) {
  try {
    var c = CacheService.getScriptCache(), n = +(c.get(key) || 0); if (!n) return null;
    var ks = []; for (var i = 0; i < n; i++) ks.push(key + ':' + i);
    var got = c.getAll(ks), parts = [];
    for (var j = 0; j < n; j++) { var p = got[key + ':' + j]; if (p == null) return null; parts.push(p); }
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(parts.join('')), 'application/x-gzip')).getDataAsString());
  } catch (e) { return null; }
}
function _stTokGet_(t) { try { var v = CacheService.getScriptCache().get('stv_' + t); return v === null || v === undefined ? null : String(v); } catch (e) { return null; } }
function _stTokPut_(t, v) { try { CacheService.getScriptCache().put('stv_' + t, String(v), ST_TOK_TTL_); } catch (e) {} }
function _stVerFetch_(t) { var r = _stRpc_('store_vers', { p_tbls: [t] }); var v = (r && r[t] !== undefined) ? String(r[t]) : '0'; _stTokPut_(t, v); return v; }
function _stVerNow_(t) { var v = _stTokGet_(t); return v === null ? _stVerFetch_(t) : v; }

/* ---------------- الصورة بالذاكرة ---------------- */
function _stFromData_(data) {   // {ver, exists, hdr, rows:[[ord, rid, raw]]} ⇒ صورة
  var rows = [], orig = {};
  data.rows.forEach(function (r) { var cells = (r[2] || []).map(_stDec_); rows.push({ id: String(r[1]), c: cells }); orig[String(r[1])] = JSON.stringify(r[2] || []); });
  var hdr = (data.hdr || []).map(_stDec_);
  return { t: null, hdr: hdr, hdrOrig: JSON.stringify(data.hdr || []), rows: rows, orig: orig, dirty: false, metaDirty: false, exists: !!data.exists, ver: String(data.ver), at: Date.now(), lr: null, lc: null };
}
function _stImg_(sp) {
  var t = sp.t, im = _ST_IMG_[t];
  if (im) {
    if (im.dirty || Date.now() - im.at <= ST_FRESH_MS_) return im;
    if (String(_stVerNow_(t)) === im.ver) { im.at = Date.now(); return im; }
    delete _ST_IMG_[t];
  }
  var ver = _stVerNow_(t), cached = _stCGet_('stc_' + t + '_' + ver), data = null;
  if (cached) data = { ver: ver, exists: cached.x !== 0, hdr: cached.h, rows: cached.r.map(function (r) { return [0, r[0], r[1]]; }) };
  if (!data) {
    data = _stReadAll_(t);
    _stTokPut_(t, data.ver);
    _stCPut_('stc_' + t + '_' + data.ver, { x: data.exists ? 1 : 0, h: data.hdr, r: data.rows.map(function (r) { return [r[1], r[2]]; }) });
  }
  im = _stFromData_(data); im.t = t; _ST_IMG_[t] = im;
  return im;
}
function _stDirty_(im) { im.dirty = true; im.lr = null; im.lc = null; }
function _stDrop_() { _ST_IMG_ = {}; }

/* ---------------- واجهة الشيت (facade) ---------------- */
function _stColNum_(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
function _stSheet_(sp, parent) {
  var S = _ST_SHEETS_[sp.t]; if (S) return S;
  var im = function () { return _stImg_(sp); };
  var lastRow = function () {
    var m = im(); if (m.lr !== null) return m.lr;
    var i = m.rows.length - 1; while (i >= 0 && _stBlank_(m.rows[i].c)) i--;
    m.lr = i >= 0 ? i + 2 : (_stBlank_(m.hdr) ? 0 : 1); return m.lr;
  };
  var lastCol = function () {
    var m = im(); if (m.lc !== null) return m.lc;
    var w = _stTrimCells_(m.hdr).length;
    for (var i = 0; i < m.rows.length; i++) { var c = m.rows[i].c, j = c.length; if (j <= w) continue; while (j > w && (c[j - 1] === '' || c[j - 1] === null || c[j - 1] === undefined)) j--; if (j > w) w = j; }
    m.lc = w; return w;
  };
  var cellAt = function (m, r, cc) { var src = r === 1 ? m.hdr : (m.rows[r - 2] ? m.rows[r - 2].c : null); var v = src ? src[cc - 1] : ''; return (v === undefined || v === null) ? '' : _stCellOut_(v); };
  var ensureRow = function (m, idx) { while (m.rows.length <= idx) m.rows.push({ id: _stNewRid_(), c: [] }); return m.rows[idx]; };
  var setCell = function (m, r, cc, v) {
    if (r === 1) { while (m.hdr.length < cc) m.hdr.push(''); m.hdr[cc - 1] = _stCellIn_(v); m.metaDirty = true; m.exists = true; return; }
    var row = ensureRow(m, r - 2); while (row.c.length < cc) row.c.push(''); row.c[cc - 1] = _stCellIn_(v);
  };
  var mkRange = function (r, c, nr, nc) {
    nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
    var R = {
      getRow: function () { return r; }, getColumn: function () { return c; }, getNumRows: function () { return nr; }, getNumColumns: function () { return nc; },
      getSheet: function () { return S; },
      getValues: function () {
        var m = im(), out = [];
        for (var i = 0; i < nr; i++) { var line = []; for (var j = 0; j < nc; j++) line.push(cellAt(m, r + i, c + j)); out.push(line); }
        return out;
      },
      getValue: function () { return cellAt(im(), r, c); },
      getDisplayValues: function () { return R.getValues().map(function (l) { return l.map(function (v) { return v === '' ? '' : (_stIsD_(v) ? Utilities.formatDate(v, _mgTz_(), 'yyyy-MM-dd') : String(v)); }); }); },
      getDisplayValue: function () { return R.getDisplayValues()[0][0]; },
      getFormulas: function () { var o = []; for (var i = 0; i < nr; i++) { var l = []; for (var j = 0; j < nc; j++) l.push(''); o.push(l); } return o; },
      setValues: function (vals) {
        var m = im(); _stDirty_(m);
        for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) setCell(m, r + i, c + j, vals[i][j]);
        _stDirty_(m); return R;
      },
      setValue: function (v) {
        var m = im(); _stDirty_(m);
        for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) setCell(m, r + i, c + j, v);
        _stDirty_(m); return R;
      },
      clearContent: function () {
        var m = im(); _stDirty_(m);
        for (var i = 0; i < nr; i++) {
          if (r + i === 1) { for (var j0 = 0; j0 < nc; j0++) if (c + j0 - 1 < m.hdr.length) m.hdr[c + j0 - 1] = ''; m.metaDirty = true; continue; }
          var row = m.rows[r + i - 2]; if (!row) continue;
          for (var j = 0; j < nc; j++) if (c + j - 1 < row.c.length) row.c[c + j - 1] = '';
        }
        _stDirty_(m); return R;
      }
    };
    R.clear = R.clearContent; R.setFormula = R.setValue;
    R.getA1Notation = function () { return 'R' + r + 'C' + c; };
    ['setNumberFormat', 'setNumberFormats', 'setFontWeight', 'setFontColor', 'setBackground', 'setBackgrounds', 'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap', 'setNote', 'setDataValidation', 'setFontSize',
      'setFontFamily', 'merge', 'setBorder', 'setFontStyle', 'setTextRotation', 'setFormulas', 'setRichTextValue', 'protect', 'setFontColors', 'setFontWeights', 'clearFormat', 'clearNote', 'clearDataValidations', 'breakApart', 'activate', 'check', 'uncheck'
    ].forEach(function (mth) { R[mth] = function () { return R; }; });
    return R;
  };
  var parseA1 = function (a) {
    var m = /^\$?([A-Za-z]+)?\$?(\d+)?(?::\$?([A-Za-z]+)?\$?(\d+)?)?$/.exec(String(a).trim());
    if (!m) throw new Error('STORE: صيغة A1 غير مدعومة: ' + a);
    var c1 = m[1] ? _stColNum_(m[1].toUpperCase()) : 1, r1 = m[2] ? +m[2] : 1;
    var c2 = m[3] ? _stColNum_(m[3].toUpperCase()) : (m[4] ? c1 : c1), r2 = m[4] ? +m[4] : (m[3] ? Math.max(lastRow(), 1) : r1);
    if (!m[3] && !m[4]) { c2 = c1; r2 = r1; }
    if (m[1] && !m[2] && !m[4]) { r1 = 1; r2 = Math.max(lastRow(), 1); }
    return [r1, c1, Math.max(1, r2 - r1 + 1), Math.max(1, c2 - c1 + 1)];
  };
  var rawS = {
    getName: function () { return sp.sheet; },
    getParent: function () { return parent; },
    getSheetId: function () { return 0; }, getIndex: function () { return 1; },
    getLastRow: lastRow, getLastColumn: lastCol,
    getMaxColumns: function () { return Math.max(26, lastCol()); },
    getMaxRows: function () { return Math.max(1000, im().rows.length + 100); },
    getRange: function (r, c, nr, nc) {
      if (typeof r === 'string') { var a = parseA1(r); return mkRange(a[0], a[1], a[2], a[3]); }
      return mkRange(r, c || 1, nr, nc);
    },
    getDataRange: function () { return mkRange(1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)); },
    appendRow: function (arr) {
      var m = im(); _stDirty_(m);
      var n = lastRow();
      if (n === 0) { m.hdr = arr.map(_stCellIn_); m.metaDirty = true; m.exists = true; _stDirty_(m); return S; }
      var row = ensureRow(m, n - 1);   // الصف رقم n+1 = الفهرس n-1 بعد الترويسة
      row.c = arr.map(_stCellIn_);
      _stDirty_(m); return S;
    },
    deleteRow: function (n) { return rawS.deleteRows(n, 1); },
    deleteRows: function (n, cnt) {
      if (n < 2) throw new Error('STORE: لا يمكن حذف الترويسة');
      var m = im(); _stDirty_(m); m.rows.splice(n - 2, cnt === undefined ? 1 : cnt); _stDirty_(m); return S;
    },
    clear: function () { var m = im(); _stDirty_(m); m.rows = []; m.hdr = []; m.metaDirty = true; return S; },
    clearContents: function () { return rawS.clear(); },
    insertRowsAfter: function () { throw new Error('STORE: insertRowsAfter غير مدعوم على جدول مخزَّن (' + sp.t + ')'); },
    insertRowAfter: function () { throw new Error('STORE: insertRowAfter غير مدعوم على جدول مخزَّن (' + sp.t + ')'); },
    insertRowBefore: function () { throw new Error('STORE: insertRowBefore غير مدعوم على جدول مخزَّن (' + sp.t + ')'); },
    insertRows: function () { throw new Error('STORE: insertRows غير مدعوم على جدول مخزَّن (' + sp.t + ')'); },
    _stTable: sp.t
  };
  S = new Proxy(rawS, { get: function (t, k) {
    if (typeof k !== 'string') return undefined;
    if (k in t) return t[k];
    if (/^(set|hide|show|insertColumn|autoResize|freeze|activate|protect|clearFormat|clearNote|addDeveloper|setTab)/.test(k)) return function () { return S; };
    return undefined;
  } });
  _ST_SHEETS_[sp.t] = S;
  return S;
}

/* ---------------- المرآة المنمّطة (تحويلات Migration.gs) ---------------- */
function _stFkInfo_(sp) {
  var nullfk = [], stubs = {};
  Object.keys(sp.fk || {}).forEach(function (col) {
    var mode = sp.fk[col], set = mode.split('_')[0], act = mode.indexOf('_') > 0 ? mode.split('_')[1] : 'stub';
    if (act === 'null') nullfk.push(col);
    else if (act === 'stub' && (set === 'clients' || set === 'trips')) stubs[col] = set;
  });
  return { nullfk: nullfk, stubs: stubs };
}
// صف شيت ⇒ كائن منمّط (أو null إن نقص حقل إلزامي). idx = رقم الصف 0-based بين صفوف البيانات
function _stTypedRow_(sp, hdr, cells, idx, rid) {
  var o = {}, used = {}, h = hdr.map(function (x) { return String(x === null || x === undefined ? '' : _stCellOut_(x)).trim(); });
  var row = cells.slice(); while (row.length < h.length) row.push('');
  sp.cols.forEach(function (c) {
    var ix = c[1], j = (typeof ix === 'number') ? ix : h.indexOf(ix);
    if (j >= 0) used[j] = 1;
    var v = j >= 0 ? row[j] : '';
    o[c[0]] = c[2] === 'perms' ? _mgPerms_(v) : _mgConv_(c[2], v, sp.t + '.' + c[0]);
  });
  if (sp.konst) { for (var k in sp.konst) o[k] = sp.konst[k]; }
  if (sp.genId && !o[sp.genId]) o[sp.genId] = 'MG-' + sp.t + '-' + (idx + 2);
  if (sp.extra) {
    var ex = {};
    h.forEach(function (name, j) { if (!used[j] && name && row[j] !== '' && row[j] !== null && row[j] !== undefined) { var key = ex.hasOwnProperty(name) ? name + '#' + (j + 1) : name; ex[key] = _mgRaw_(row[j]); } });
    (sp.rawExtra || []).forEach(function (name) { var j = h.indexOf(name); if (j >= 0 && row[j] !== '') ex['raw:' + name] = _mgRaw_(row[j]); });
    o[sp.extra] = ex;
  }
  if (sp.rowObj) o[sp.rowObj] = _mgRowObj_(h, row);
  var bad = (sp.req || []).some(function (c) { var v = o[c]; return v === null || v === undefined || v === ''; });
  if (bad) return null;
  if (sp.wipe) o.store_rid = rid;
  return o;
}
function _stPkOf_(sp, o) { var k = {}; sp.pk.forEach(function (c) { k[c] = o[c]; }); return k; }
function _stMirror_(sp, hdr, upRows, delRows) {   // upRows: [{rid, c, idx}] · delRows: [{rid, c(encoded), idx}]
  var fk = _stFkInfo_(sp), up = [], rids = [], del = [], stubs = {}, skipped = 0;
  _mgQuiet_(function () {
    upRows.forEach(function (r) {
      var o = _stTypedRow_(sp, hdr, r.c, r.idx, r.rid);
      if (!o) { skipped++; return; }
      up.push(o); rids.push(r.rid);
      Object.keys(fk.stubs).forEach(function (col) { var v = o[col]; if (v) { var set = fk.stubs[col]; (stubs[set] = stubs[set] || {})[v] = 1; } });
    });
    delRows.forEach(function (r) {
      var o = _stTypedRow_(sp, hdr, r.c.map(_stDec_), r.idx, r.rid);
      if (o) del.push(sp.wipe ? { store_rid: r.rid } : _stPkOf_(sp, o));
    });
  });
  // صف تغيّر مفتاحه (إعادة تسمية) ⇒ المفتاح القديم يُحذف من المرآة
  var upKeys = {}; if (!sp.wipe) up.forEach(function (o) { upKeys[JSON.stringify(_stPkOf_(sp, o))] = 1; });
  if (!sp.wipe) del = del.filter(function (d) { return !upKeys[JSON.stringify(d)]; });
  var stubArr = [];
  if (stubs.clients) stubArr.push({ t: 'clients', rows: Object.keys(stubs.clients).map(function (n) { return { name: n, notes: '[مخزن: غير موجود بالأصل — أنشئ كظل]' }; }) });
  if (stubs.trips) stubArr.push({ t: 'trips', rows: Object.keys(stubs.trips).map(function (n) { return { name: n, archived: true, extra: { _migrated_stub: true } }; }) });
  return { mirror: { t: sp.t, mode: sp.wipe ? 'rid' : 'pk', pk: sp.pk, nullfk: fk.nullfk, up: up, rids: rids, del: del }, stubs: stubArr, skipped: skipped };
}

/* ---------------- الرفع (flush) ---------------- */
function _stDiff_(im) {
  var cur = im.rows, n = cur.length;
  while (n > 0 && _stBlank_(cur[n - 1].c)) n--;
  var up = [], upMir = [], seen = {}, i;
  for (i = 0; i < n; i++) {
    var rw = cur[i], js = _stJs_(rw.c); seen[rw.id] = 1;
    if (im.orig[rw.id] === undefined || im.orig[rw.id] !== js) { up.push({ rid: rw.id, raw: JSON.parse(js) }); upMir.push({ rid: rw.id, c: rw.c, idx: i }); }
  }
  var del = [], delMir = [];
  Object.keys(im.orig).forEach(function (rid) { if (!seen[rid]) { del.push(rid); delMir.push({ rid: rid, c: JSON.parse(im.orig[rid]), idx: 0 }); } });
  return { up: up, upMir: upMir, del: del, delMir: delMir, n: n };
}
function _stFlushOne_(sp, im) {
  var d = _stDiff_(im), hdrJs = JSON.stringify(_stEncRow_(im.hdr)), hdrChanged = hdrJs !== im.hdrOrig;
  if (!d.up.length && !d.del.length && !hdrChanged && !im.metaDirty) { im.dirty = false; return; }
  var hdrDec = im.hdr, mir = null;
  var mirrorOn = !sp.nomirror;
  var parts = Math.max(1, Math.ceil(d.up.length / ST_CHUNK_)), ver = im.ver, first = true, expect = Number(im.ver), lastRes = null;
  for (var k = 0; k < parts; k++) {
    var a = k * ST_CHUNK_, b = a + ST_CHUNK_;
    var upSlice = d.up.slice(a, b), mSlice = d.upMir.slice(a, b);
    var m = mirrorOn ? _stMirror_(sp, hdrDec, mSlice, first ? d.delMir : []) : { mirror: null, stubs: [] };
    var p = { t: sp.t, up: upSlice, del: first ? d.del : [], exists: true, mirror: m.mirror, stubs: m.stubs };
    if (first) p.hdr = _stEncRow_(im.hdr);
    lastRes = _stRpc_('store_put', { p: p });
    first = false; expect++;
  }
  var newVer = String(lastRes.ver);
  // الصورة تطابق القاعدة إن لم يكتب أحد غيرنا بين القراءة والرفع (الإصدار زاد بعدد دفعاتنا فقط)
  var mine = String(newVer) === String(expect);
  im.orig = {}; for (var i = 0; i < d.n; i++) im.orig[im.rows[i].id] = _stJs_(im.rows[i].c);
  im.rows = im.rows.slice(0, d.n); im.hdrOrig = hdrJs; im.dirty = false; im.metaDirty = false; im.exists = true; im.lr = null; im.lc = null; im.ver = newVer; im.at = Date.now();
  _stTokPut_(sp.t, newVer); _stMarkEx_(sp.t, true);
  if (mine) _ST_WARM_[sp.t] = newVer; else { delete _ST_WARM_[sp.t]; delete _ST_IMG_[sp.t]; }
  var mres = lastRes.mirror; if (mres && mres.err) _ST_FAIL_ = (_ST_FAIL_ || 0) + mres.err;
}
// يرفع كل الصور المتسخة. strict=false (من _dvBump_/فك قفل): الخطأ يُحفظ ويُرمى بنهاية الطلب. بلا صور متسخة = لا شيء
function _stFlush_(strict) {
  if (_ST_FLUSHING_) return false;
  var dirty = Object.keys(_ST_IMG_).filter(function (t) { return _ST_IMG_[t].dirty || _ST_IMG_[t].metaDirty; });
  if (!dirty.length) return false;
  _ST_FLUSHING_ = true;
  var err = null;
  try {
    dirty.forEach(function (t) {
      try { _stFlushOne_(_stSpecs_()[t], _ST_IMG_[t]); }
      catch (e) { if (!err) err = e; }
    });
  } finally { _ST_FLUSHING_ = false; }
  if (err) { if (strict !== false) throw err; return false; }
  return true;
}
// فك أي قفل: ارفع ثم أعد الخطأ إن وُجد (القفل يُفك قبل الرمي في موضع الاستدعاء)
function _stFlushOnRelease_() { try { _stFlush_(true); return null; } catch (e) { return e; } }
// عند أخذ قفل (أول مرة غير متداخل): ارفع المتسخ ثم أسقط الصور النظيفة المتقادمة — مثل _glStOnAcquire_
function _stOnAcquire_() {
  if (!_stActive_()) return;
  try { _stFlush_(false); } catch (e) {}
  // الصورة النظيفة تبقى فقط إن كان رمز إصدارها بالكاش يطابقها (قراءة كاش واحدة)، وإلا تُسقَط وتُعاد قراءتها من الكاش/القاعدة
  Object.keys(_ST_IMG_).forEach(function (t) {
    var im = _ST_IMG_[t]; if (im.dirty || im.metaDirty) return;
    var tok = _stTokGet_(t);
    if (tok !== null && tok === im.ver) im.at = Date.now(); else delete _ST_IMG_[t];
  });
}
// نهاية الطلب (Perf.gs): ارفع ما تبقّى (يرمي عند الفشل ⇒ المستخدم يرى فشل الحفظ) ثم سخّن الكاش بالصور النهائية
function _stEndRequest_() {
  if (!_stActive_()) return;
  var err = null;
  try { _stFlush_(true); } catch (e) { err = e; }
  Object.keys(_ST_WARM_).forEach(function (t) {
    var im = _ST_IMG_[t], v = _ST_WARM_[t]; delete _ST_WARM_[t];
    if (!im || im.dirty || im.ver !== v) return;
    try { _stCPut_('stc_' + t + '_' + v, { x: 1, h: _stEncRow_(im.hdr), r: im.rows.map(function (r) { return [r.id, _stEncRow_(r.c)]; }) }); } catch (e2) {}
  });
  if (err) throw err;
}
// غلاف قفل السكربت (يُستدعى من _stLk_ بـ Code.gs): نفس الواجهة مع رفع الكتابات قبل الفك وإعادة تحميل الصور عند الأخذ
function _stWrapLock_(l) {
  if (!_stActive_()) return l;
  var after = function (ok) { if (ok) _stOnAcquire_(); return ok; };
  return {
    tryLock: function (ms) { return after(l.tryLock(ms)); },
    waitLock: function (ms) { l.waitLock(ms); _stOnAcquire_(); },
    hasLock: function () { return l.hasLock(); },
    releaseLock: function () { var e = _stFlushOnRelease_(); try { l.releaseLock(); } catch (e2) {} if (e) throw e; }
  };
}

/* ============================================================================
   أدوات المالك (من المحرر فقط)
   ============================================================================ */
function _stSheetRaw_(sp) {   // الشيت الحقيقي متجاوزاً الطبقة ⇒ {exists, hdr, rows:[cells]} (الصفوف الفارغة بالوسط تبقى · الذيل يُقصّ)
  var save = _ST_BYPASS_; _ST_BYPASS_ = true;
  try {
    var ss = sp.snap ? SpreadsheetApp.openById(getSourceSettings_().spreadsheetId) : _stSsOf_(sp), sh = ss.getSheetByName(sp.snap ? getSourceSettings_()[sp.snap + 'Sheet'] : sp.sheet);
    if (!sh) return { exists: false, hdr: [], rows: [] };
    var lr = sh.getLastRow(), lc = sh.getLastColumn(), h0 = sp.snap ? Math.max(1, Number(getSourceSettings_()[sp.snap + 'StartRow']) - 1) : 1;   // صف الترويسة = قبل أول صف بيانات
    if (lr < h0 || lc < 1) return { exists: true, hdr: [], rows: [] };
    var vals = sh.getRange(h0, 1, lr - h0 + 1, lc).getValues(), rows = vals.slice(1);
    var n = rows.length; while (n > 0 && _stBlank_(rows[n - 1])) n--;
    return { exists: true, hdr: _stTrimCells_(vals[0]), rows: rows.slice(0, n) };
  } finally { _ST_BYPASS_ = save; }
}
function _stSeedTable_(sp) {
  var src = _stSheetRaw_(sp), rows = src.rows, up = [], upMir = [];
  rows.forEach(function (r, i) { var rid = 'S' + ('000000' + i.toString(36)).slice(-6); up.push({ rid: rid, raw: _stEncRow_(r) }); upMir.push({ rid: rid, c: r, idx: i }); });
  if (!src.exists) return { exists: false, rows: 0 };
  var parts = Math.max(1, Math.ceil(up.length / ST_CHUNK_)), skipped = 0, keep = [];
  for (var k = 0; k < parts; k++) {
    var m = sp.nomirror ? { mirror: null, stubs: [], skipped: 0 } : _stMirror_(sp, src.hdr, upMir.slice(k * ST_CHUNK_, (k + 1) * ST_CHUNK_), []);
    skipped += m.skipped;
    if (m.mirror) m.mirror.up.forEach(function (o) { keep.push(sp.wipe ? o.store_rid : _stPkOf_(sp, o)); });
    var p = { t: sp.t, up: up.slice(k * ST_CHUNK_, (k + 1) * ST_CHUNK_), del: [], exists: true, mirror: m.mirror, stubs: m.stubs, seeded: true, hdr: _stEncRow_(src.hdr) };
    if (k === 0) p.wipe = true;
    _stRpc_('store_put', { p: p });
  }
  // مفاتيح مكررة بالشيت (آخر صف يغلب) ⇒ قائمة keep بلا تكرار
  var seen = {}; keep = keep.filter(function (x) { var s = JSON.stringify(x); if (seen[s]) return false; seen[s] = 1; return true; });
  var pr = sp.nomirror ? null : _stRpc_('store_mirror_prune', { p_tbl: sp.t, m: { t: sp.t, mode: sp.wipe ? 'rid' : 'pk', pk: sp.pk }, keep: keep });
  return { exists: true, rows: rows.length, mirrorSkipped: skipped, pruned: pr && pr.pruned };
}
function _stMoneyCols_(sp) { return ST_MONEY_[sp.t] || []; }
// ملخص صفوف (شيت أو مخزن) لمقارنة المحتوى والمبالغ: عدد · بصمة كل صف · مجاميع منمّطة
function _stSummary_(sp, hdr, rows) {
  var js = rows.map(function (r) { return _stJs_(r); }), sums = {}, cnt = 0, keys = {};
  var mc = _stMoneyCols_(sp);
  _mgQuiet_(function () {
    rows.forEach(function (r, i) {
      var o = _stTypedRow_(sp, hdr, r, i, 'x'); if (!o) return;
      cnt++; mc.forEach(function (c) { sums[c] = (sums[c] || 0) + (Number(o[c]) || 0); });
      if (!sp.wipe) keys[sp.pk.map(function (c) { return String(o[c]); }).join('\u0001')] = 1;
    });
  });
  return { n: rows.length, js: js, sums: sums, typedN: sp.wipe ? cnt : Object.keys(keys).length };
}
function _stRound_(x) { return Math.round((+x || 0) * 100) / 100; }
function _stCompareTables_(tables) {
  var specs = _stSpecs_(), L = [], bad = 0, checks = [];
  _mgNewCtx_();
  tables.forEach(function (t) {
    var sp = specs[t], src = _stSheetRaw_(sp), st = _stReadAll_(t);
    var stRows = st.rows.map(function (r) { return (r[2] || []).map(_stDec_); }), stHdr = (st.hdr || []).map(_stDec_);
    var A = _stSummary_(sp, src.hdr, src.rows), B = _stSummary_(sp, stHdr, stRows), line = [], ok = true;
    if (!src.exists && !st.exists) { L.push('• ' + t + ' (' + sp.sheet + '): الشيت غير موجود ولا المخزن — يُنشأ عند أول استعمال'); return; }
    if (A.n !== B.n) { ok = false; line.push('عدد الصفوف شيت=' + A.n + ' · مخزن=' + B.n); }
    var diff = 0, firstBad = -1;
    for (var i = 0; i < Math.max(A.js.length, B.js.length); i++) { if (A.js[i] !== B.js[i]) { diff++; if (firstBad < 0) firstBad = i + 2; } }
    if (diff) { ok = false; line.push('صفوف مختلفة المحتوى/الترتيب: ' + diff + ' (أولها الصف ' + firstBad + ')'); }
    if (JSON.stringify(_stEncRow_(src.hdr)) !== JSON.stringify(_stEncRow_(stHdr))) { ok = false; line.push('الترويسة مختلفة'); }
    Object.keys(A.sums).forEach(function (c) { if (Math.abs((A.sums[c] || 0) - (B.sums[c] || 0)) > 0.005) { ok = false; line.push('مجموع ' + c + ' شيت=' + _stRound_(A.sums[c]) + ' · مخزن=' + _stRound_(B.sums[c])); } });
    checks.push({ tbl: t, typed: sp.t, sumcols: _stMoneyCols_(sp), exp: A.typedN, sums: A.sums, nStore: B.n });
    L.push((ok ? '✓ ' : '✗ ') + t + ' (' + sp.sheet + '): شيت ' + A.n + ' صف · مخزن ' + B.n + (line.length ? ' — ' + line.join(' | ') : '') + ' · ver=' + st.ver);
    if (!ok) bad++;
  });
  // المرآة المنمّطة مقابل المخزن
  var chk = null;
  try { chk = _stRpc_('store_check', { p: checks.map(function (c) { return { tbl: c.tbl, typed: c.typed, sumcols: c.sumcols }; }) }); } catch (e) { L.push('⚠️ store_check: ' + e.message); }
  if (chk) checks.forEach(function (c) {
    var d = chk[c.tbl]; if (!d) return;
    var msg = [];
    if (d.typed === null || d.typed === undefined) msg.push('الجدول المنمّط غير موجود');
    else {
      if (Number(d.typed) !== c.exp) msg.push('مرآة منمّطة ' + d.typed + ' ≠ متوقع ' + c.exp);
      Object.keys(c.sums).forEach(function (col) { if (Math.abs(Number((d.sums || {})[col] || 0) - c.sums[col]) > 0.01) msg.push('مجموع منمّط ' + col + ' ' + _stRound_((d.sums || {})[col]) + ' ≠ ' + _stRound_(c.sums[col])); });
    }
    if (Number(d.errors) > 0) msg.push('أخطاء مرآة مسجَّلة: ' + d.errors);
    if (msg.length) { L.push('  ⚠️ ' + c.tbl + ' (مرآة SQL): ' + msg.join(' | ')); }
  });
  var out = (bad ? '⚠️ فروق في ' + bad + ' جدول\n' : '✅ تطابق كامل (محتوى حرفي + ترتيب + مبالغ)\n') + L.join('\n');
  Logger.log(out); return { ok: bad === 0, text: out, bad: bad };
}
function _stTablesOf_(group) {
  var t = Object.keys(_stExpand_(group || ''));
  if (!t.length) throw new Error('مجموعة/جداول غير معروفة: ' + group + ' — المتاح: ' + Object.keys(ST_GROUPS_).join(' · ') + ' · all');
  return t;
}
function storeCompare(group) { requireScriptOwner_(); return _stCompareTables_(_stTablesOf_(group)).text; }
function _stHasGl_(tables) { return tables.some(function (t) { return _stSpecs_()[t].ss === 'gl'; }); }
function _stSetFlag_(tables, on) {
  var P = PropertiesService.getScriptProperties(), cur = Object.keys(_stExpand_(P.getProperty('STORE_TABLES') || '')), set = {};
  cur.forEach(function (t) { set[t] = 1; });
  tables.forEach(function (t) { if (on) set[t] = 1; else delete set[t]; });
  var v = Object.keys(set).join(',');
  if (v) P.setProperty('STORE_TABLES', v); else P.deleteProperty('STORE_TABLES');
  _stReset_();
  try { if (typeof _dvBump_ === 'function') _dvBump_(LF_GROUPS_); } catch (e) {}
  try { clearAllCache_(); } catch (e2) {}
}
function _stLockAll_(withGl) {
  var sl = LockService.getScriptLock(); sl.waitLock(120000);
  var res = null, gl = null;
  try {
    res = _resAllTry_(60000);
    if (!res) throw new Error('أقفال الموارد مشغولة بعمليات حفظ — أعد المحاولة بوقت أهدأ');
    if (withGl) { gl = _glLock_(); gl.waitLock(120000); }
  } catch (e) {
    try { if (gl) _glUnlock_(gl); } catch (e1) {} try { if (res) res.releaseLock(); } catch (e2) {} try { sl.releaseLock(); } catch (e3) {}
    throw e;
  }
  return { release: function () { try { if (gl) _glUnlock_(gl); } catch (e) {} try { if (res) res.releaseLock(); } catch (e1) {} try { sl.releaseLock(); } catch (e2) {} } };
}
// نقل الشيت ⇒ المخزن ثم مقارنة؛ apply=true يفعّل المجموعة فقط إن تطابق كل شيء. يُنفَّذ في وقت هادئ (يقفل كل شيء)
function storeCutover(group, apply) {
  requireScriptOwner_();
  var tables = _stTablesOf_(group), log = [], lk = _stLockAll_(_stHasGl_(tables));
  try {
    var on = _stCfg_().set, already = tables.filter(function (t) { return on[t]; });
    if (already.length) throw new Error('جداول مفعَّلة أصلاً: ' + already.join('، ') + ' — شغّل storeRollback أولاً قبل إعادة النقل');
    var specs = _stSpecs_();
    tables.forEach(function (t) { var r = _stSeedTable_(specs[t]); log.push('seed ' + t + ': ' + (r.exists ? r.rows + ' صف' + (r.mirrorSkipped ? ' · مرآة مُتخطّاة ' + r.mirrorSkipped : '') + (r.pruned ? ' · مرآة قديمة محذوفة ' + r.pruned : '') : 'الشيت غير موجود')); });
    var cmp = _stCompareTables_(tables); log.push(cmp.text);
    if (apply && cmp.ok) { _stSetFlag_(tables, true); log.push('✅ STORE_TABLES += ' + tables.join(',')); }
    else if (apply) log.push('⛔ لم يُفعَّل: توجد فروق');
    else log.push('ℹ️ نقل ومقارنة فقط — للتفعيل: storeCutover("' + group + '", true) أو دالة …Apply');
  } finally { lk.release(); }
  var out = log.join('\n'); Logger.log(out); return out;
}
// تراجع: المخزن ⇒ الشيتات (بقفل شامل) ثم إلغاء التفعيل
function storeRollback(group) {
  requireScriptOwner_();
  var tables = _stTablesOf_(group), log = [], lk = _stLockAll_(_stHasGl_(tables));
  try {
    _stFlush_(false);
    var specs = _stSpecs_();
    tables.forEach(function (t) {
      var sp = specs[t], st = _stReadAll_(t);
      if (!st.exists) { log.push('↩︎ ' + t + ': لا بيانات بالمخزن — تُرك الشيت'); return; }
      var save = _ST_BYPASS_; _ST_BYPASS_ = true;
      try {
        var ss = _stSsOf_(sp), sh = ss.getSheetByName(sp.sheet) || ss.insertSheet(sp.sheet);
        var hdr = (st.hdr || []).map(_stDec_), rows = st.rows.map(function (r) { return (r[2] || []).map(_stDec_); });
        var W = Math.max(hdr.length, rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0), 1), pad = function (r) { var x = r.slice(); while (x.length < W) x.push(''); return x; };
        var last = sh.getLastRow(), lc = Math.max(sh.getLastColumn(), W);
        if (last >= 1) sh.getRange(1, 1, last, lc).clearContent();
        if (hdr.length) sh.getRange(1, 1, 1, W).setValues([pad(hdr)]);
        if (rows.length) sh.getRange(2, 1, rows.length, W).setValues(rows.map(pad));
        log.push('↩︎ ' + t + ': ' + rows.length + ' صف إلى الشيت «' + sp.sheet + '»');
      } finally { _ST_BYPASS_ = save; }
    });
    try { SpreadsheetApp.flush(); } catch (eF) {}
    _stSetFlag_(tables, false);
    log.push('✅ أُزيلت من STORE_TABLES: ' + tables.join(','));
  } finally { lk.release(); }
  var out = log.join('\n'); Logger.log(out); return out;
}
function storeStatus() {
  requireScriptOwner_();
  var c = _stCfg_(), out = 'STORE_TABLES مفعَّلة (' + Object.keys(c.set).length + '): ' + (Object.keys(c.set).join(', ') || '—');
  Logger.log(out); return out;
}

/* أزرار المحرر (الأمر بلا وسيط): المقارنة لكل مجموعة · النقل بلا تفعيل · النقل مع التفعيل · التراجع */
function storeCompareMinistry() { return storeCompare('ministry'); }
function storeCompareCore() { return storeCompare('core'); }
function storeCompareAcc() { return storeCompare('acc'); }
function storeCompareBookings() { return storeCompare('bookings'); }
function storeCompareVisa() { return storeCompare('visa'); }
function storeCompareMisc() { return storeCompare('misc'); }
function storeCompareGlAux() { return storeCompare('glaux'); }
function storeCutoverMinistry() { return storeCutover('ministry', false); }
function storeCutoverCore() { return storeCutover('core', false); }
function storeCutoverAcc() { return storeCutover('acc', false); }
function storeCutoverBookings() { return storeCutover('bookings', false); }
function storeCutoverVisa() { return storeCutover('visa', false); }
function storeCutoverMisc() { return storeCutover('misc', false); }
function storeCutoverGlAux() { return storeCutover('glaux', false); }
function storeCutoverMinistryApply() { return storeCutover('ministry', true); }
function storeCutoverCoreApply() { return storeCutover('core', true); }
function storeCutoverAccApply() { return storeCutover('acc', true); }
function storeCutoverBookingsApply() { return storeCutover('bookings', true); }
function storeCutoverVisaApply() { return storeCutover('visa', true); }
function storeCutoverMiscApply() { return storeCutover('misc', true); }
function storeCutoverGlAuxApply() { return storeCutover('glaux', true); }
function storeRollbackMinistry() { return storeRollback('ministry'); }
function storeRollbackCore() { return storeRollback('core'); }
function storeRollbackAcc() { return storeRollback('acc'); }
function storeRollbackBookings() { return storeRollback('bookings'); }
function storeRollbackVisa() { return storeRollback('visa'); }
function storeRollbackMisc() { return storeRollback('misc'); }
function storeRollbackGlAux() { return storeRollback('glaux'); }


/* ---------------- (V4.378) نسخ إعدادات الخادم + وسم إشعارات البوت إلى Supabase لقراءات الشاشات (010/013) ----------------
   خصائص السكربت ACC_PRICING · MF_EXEC_POLICY · NOTIF_TOGGLES تُنسخ حرفياً إلى app_kv عند كل حفظ لها (storeKvPush_) — دون ذلك تفشل قراءات الوزارة
   بـ55000 فتعود الواجهة لـ Apps Script تلقائياً. شغّل storeKvBackfill() مرة واحدة من المحرر بعد تشغيل 010 (يضع أيضاً علامة __seeded).
   bookings_via_bot: storeBotMark_ لحظة إنشاء بوت تليجرام لإشعار، و storeBotsBackfill() مرة واحدة تملؤها بأثر رجعي من شيت AuditLog ثم تضع __bots_seeded. */
var KV_KEYS_ = ['ACC_PRICING', 'MF_EXEC_POLICY', 'NOTIF_TOGGLES'];
function storeKvPush_(keys) {
  try {
    if (!_supaP_('SUPA_URL') || !_supaP_('SUPA_SERVICE_KEY')) return false;
    var p = {}, sp = PropertiesService.getScriptProperties();
    (keys || KV_KEYS_).forEach(function (k) { var v = sp.getProperty(k); p[k] = (v === null || v === undefined) ? '' : String(v); });
    var r = _supaReq_('post', 'rpc/kv_set', { p: p });
    return r.code >= 200 && r.code < 300;
  } catch (e) { Logger.log('storeKvPush_ failed: ' + e); return false; }
}
function storeKvBackfill() {
  requireScriptOwner_();
  var ok = storeKvPush_(KV_KEYS_);
  var r = _supaReq_('post', 'rpc/kv_set', { p: { __seeded: '1' } });
  if (ok && r.code < 300) PropertiesService.getScriptProperties().setProperty('SUPA_KV_OK', '1');   // يعلنها supaIssueToken كمجموعة «kv» فيبدأ المتصفح بقراءة الوزارة/التأشيرات من Supabase
  var msg = (ok && r.code < 300) ? 'تم نسخ ' + KV_KEYS_.join(' · ') + ' إلى app_kv' : 'فشل النسخ (' + r.code + ' ' + String(r.text).slice(0, 200) + ') — تأكد من تشغيل 010_screens_reads.sql';
  Logger.log(msg); return msg;
}
function storeBotMark_(id) {
  if (!_supaP_('SUPA_URL') || !_supaP_('SUPA_SERVICE_KEY')) return false;
  var r = _supaReq_('post', 'rpc/bot_mark', { p_ids: [String(id)] });
  return r.code >= 200 && r.code < 300;
}
function storeBotsBackfill() {
  requireScriptOwner_();
  var sh = getSpreadsheet_().getSheetByName('AuditLog'), ids = {}, n = 0;
  if (sh && sh.getLastRow() >= 2) sh.getRange(2, 2, sh.getLastRow() - 1, 3).getValues().forEach(function (ar) {
    if (String(ar[0]) === 'TelegramBot' && String(ar[1]).indexOf('إنشاء إشعار') > -1) ids[String(ar[2])] = true;
  });
  var all = Object.keys(ids);
  for (var i = 0; i < all.length; i += 500) {
    var r = _supaReq_('post', 'rpc/bot_mark', { p_ids: all.slice(i, i + 500) });
    if (r.code < 200 || r.code >= 300) { var fm = 'فشل (' + r.code + ' ' + String(r.text).slice(0, 200) + ') — تأكد من تشغيل 013_bookings_via_bot.sql'; Logger.log(fm); return fm; }
    n += Math.min(500, all.length - i);
  }
  var r2 = _supaReq_('post', 'rpc/kv_set', { p: { __bots_seeded: '1' } });
  if (r2.code < 300) PropertiesService.getScriptProperties().setProperty('SUPA_BOT_OK', '1');   // مجموعة «bots»
  var bm = (r2.code < 300 ? 'تم وسم ' : 'وُسمت ') + n + ' إشعار بوت وفُعِّلت قراءة الإشعارات من Supabase' + (r2.code < 300 ? '' : ' — لكن kv_set فشل ' + r2.code + ' ' + String(r2.text).slice(0, 160));
  Logger.log(bm); return bm;
}
// تشخيص: يطبع حالة كل علم ومجموعة تعلنها الواجهة (شغّله من المحرر وأرسل السجل)
function supaDiagNow() {
  requireScriptOwner_();
  var P = PropertiesService.getScriptProperties(), L = [];
  ['SUPA_CFG_OK', 'SUPA_GLK_OK', 'SUPA_AUD_OK', 'SUPA_KV_OK', 'SUPA_BOT_OK', 'DV_PG_SEEDED'].forEach(function (k) { L.push(k + '=' + (P.getProperty(k) || '—')); });
  try { L.push('groups: ' + JSON.stringify(_supaStoreInfo_())); } catch (e) { L.push('groups err ' + e); }
  var t = _supaReq_('post', 'rpc/kv_set', { p: { __ping: '1' } }); L.push('kv_set → ' + t.code + ' ' + String(t.text).slice(0, 160));
  var b = _supaReq_('post', 'rpc/bot_mark', { p_ids: [] }); L.push('bot_mark → ' + b.code + ' ' + String(b.text).slice(0, 160));
  var a = _supaReq_('get', 'audit_log?select=*&limit=1'); L.push('audit_log → ' + a.code + ' ' + String(a.text).slice(0, 200));
  var out = L.join('\n'); Logger.log(out); return out;
}

/* ---------------- (V4.379) الكتابة من Postgres: تفعيلها + تفريغ صندوق الإخراج ----------------
   016_ministry_write.sql: rw_call('saveMinistryFile') يكتب بـPostgres مباشرة من المتصفح ويضع أثره الجانبي (سجل التتبع المحصّن · إشعارات الجرس) في app_outbox.
   هنا: supaWriteOn('mf') لتفعيل المسار (يعلن المجموعة 'wmf') · supaWriteOff() للإيقاف · _outboxDrain_ يفرّغ الصندوق (يُستدعى من audFlushCron كل دقيقة). */
function supaWriteOn(which) {
  requireScriptOwner_();
  which = which || 'mf';
  var W = { mf: { prop: 'SUPA_W_MF', tbl: 'mf_files', fn: 'saveMinistryFile', label: 'ملفات الوزارة', grp: 'ministry' }, vz: { prop: 'SUPA_W_VZ', tbl: 'vz_files', fn: 'saveVisaFile', label: 'مجموعات التأشيرات', grp: 'visa' }, bk: { prop: 'SUPA_W_BK', tbl: 'bookings', fn: 'saveBookingToServer', label: 'الإشعارات', grp: 'bookings' } }[which];
  if (!W) throw new Error('غير مدعوم بعد: ' + which + ' (المتاح: mf · vz · bk)');
  if (!_stActive_() || !_stCfg_().set[W.tbl]) throw new Error('فعّل مجموعة ' + W.grp + ' أولاً — الكتابة بـPostgres تحتاج أن يكون المخزن هو مصدر ' + W.label);
  var r = _supaReq_('post', 'rpc/rw_call', { p_fn: W.fn, p_args: [] });
  var txt = String(r.text || '');
  if (r.code === 404 || /PGRST202|Could not find/.test(txt)) throw new Error('شغّل ملف SQL الخاص بالكتابة في Supabase أولاً (016 للوزارة · 017 للتأشيرات · 024 للإشعارات)');
  if (/غير مدعومة/.test(txt)) throw new Error('الدالة ' + W.fn + ' غير موجودة في Supabase — شغّل ملف SQL الخاص بالكتابة (017 للتأشيرات · 024 للإشعارات)');
  PropertiesService.getScriptProperties().setProperty(W.prop, '1');
  var m = 'تم تفعيل حفظ ' + W.label + ' من Supabase (' + W.prop + '=1) — سجّل خروجاً ودخولاً ليظهر. للإيقاف: supaWriteOff(\'' + which + '\')';
  Logger.log(m); return m;
}
function supaWriteOff(which) {
  requireScriptOwner_();
  var P = PropertiesService.getScriptProperties();
  if (!which) { P.deleteProperty('SUPA_W_MF'); P.deleteProperty('SUPA_W_VZ'); P.deleteProperty('SUPA_W_BK'); } else P.deleteProperty(which === 'vz' ? 'SUPA_W_VZ' : (which === 'bk' ? 'SUPA_W_BK' : 'SUPA_W_MF'));
  var m = 'أُوقف الحفظ من Supabase (' + (which || 'الكل') + ') — الحفظ يرجع لـApps Script'; Logger.log(m); return m;
}
function _outboxDrain_(maxMs) {
  if (!_supaP_('SUPA_URL') || !_supaP_('SUPA_SERVICE_KEY') || (_supaP_('SUPA_W_MF') !== '1' && _supaP_('SUPA_W_VZ') !== '1' && _supaP_('SUPA_W_BK') !== '1')) return 0;
  var t0 = Date.now(), n = 0;
  while (Date.now() - t0 < (maxMs || 20000)) {
    var r = _supaReq_('get', 'app_outbox?done_at=is.null&order=id.asc&limit=100&select=id,kind,payload');
    if (r.code !== 200) { Logger.log('outbox read ' + r.code + ' ' + String(r.text).slice(0, 160)); break; }
    var rows = []; try { rows = JSON.parse(r.text || '[]'); } catch (e) {}
    if (!rows.length) break;
    var recs = [], ids = [];
    rows.forEach(function (x) {
      ids.push(x.id); var p = x.payload || {};
      if (x.kind === 'audit') recs.push({ user: p.user, action: p.action, record: p.record, field: p.field, old: p.old, 'new': p['new'] });
      else if (x.kind === 'snaprow') {   // (V4.393) لقطة استرجاع صف (قبل حذف/تعديل دفعة) بنفس _snapRowTake_ — تُسجَّل بالخلفية بعد الكتابة من Postgres
        try { _RB_SKIP_ = true; _snapRowTake_(String(p.sheet), String(p.key), (p.row || []).map(function (c) { return (c && typeof c === 'object' && c['$d'] !== undefined) ? new Date(c['$d']) : c; }), String(p.action || ''), String(p.user || '')); }
        catch (eSn) { Logger.log('outbox snaprow: ' + eSn.message); } finally { _RB_SKIP_ = false; }
      }
      else if (x.kind === 'bkdiff') {   // (V4.388) أثر تدقيق حفظ الإشعار من Postgres: إنشاء ⇒ سطر إنشاء · تعديل ⇒ فرق حقل بحقل (نفس logBookingRowDiff_)
        try {
          var rv = function (row) { return (row || []).map(function (c) { return (c && typeof c === 'object' && c['$d'] !== undefined) ? new Date(c['$d']) : c; }); };
          if (p.isNew) logChange_(p.user, 'إنشاء إشعار جديد', String(p.id), '-', '-', 'تم إنشاء إشعار وصول رقم ' + p.id);
          else logBookingRowDiff_(p.user, String(p.id), rv(p.old), rv(p['new']));
        } catch (eB) { Logger.log('outbox bkdiff: ' + eB.message); }
      }
      else if (x.kind === 'tripsnap') { try { _tripSnapTakeState_(String(p.trip), String(p.user || ''), String(p.action || ''), p.state, !!p.base); } catch (eT) { Logger.log('outbox tripsnap: ' + eT.message); } }
      else if (x.kind === 'accsync') {   // (V4.403) مزامنة حسابات رحلات بعد كتابة Postgres — المتصفح ينفّذها فوراً؛ وإلا بعد ~دقيقتين
        if (Date.now() / 1000 - Number(p.at || 0) < 120) { ids.pop(); return; }
        try { _ACC_HB_CITY_MEMO_ = null; (p.trips || []).forEach(function (t) { try { _syncTripAccounts_(null, String(t), String(p.user || '')); } catch (eT) {} }); } catch (eA) { Logger.log('outbox accsync: ' + eA.message); }
      }
      else if (x.kind === 'kashfsave') {   // (V4.401/402) مزامنة حسابات العملاء بعد حفظ الكشف من Postgres — المتصفح ينفّذها فوراً؛ وإلا بعد ~دقيقتين هنا
        if (Date.now() / 1000 - Number(p.at || 0) < 120) { ids.pop(); return; }
        try { _kashfAfterSave_(p, null, String(p.user || '')); } catch (eK) { Logger.log('outbox kashfsave: ' + eK.message); }
      }
      else if (x.kind === 'accmoved') {   // (V4.398) المتصفح ينفّذها فوراً؛ إن لم يصل (أُغلقت الصفحة) نتولاها هنا بعد ~دقيقتين
        if (Date.now() / 1000 - Number(p.at || 0) < 120) { ids.pop(); return; }
        try { _accAfterPilgrimsMoved_(p.clients || [], String(p.from || ''), String(p.to || ''), String(p.user || ''), null); } catch (eM) { Logger.log('outbox accmoved: ' + eM.message); }
      }
      else if (x.kind === 'notif') { try { _notifPush_(p.type, p.message, '', p.trip || '', p.perm || '', p.user || ''); } catch (eN) { Logger.log('outbox notif: ' + eN.message); } }
    });
    if (!ids.length) break;   // (V4.398) كلها accmoved حديثة — ننتظر المتصفح
    if (recs.length) _audLog_(recs);   // تفشل ⇒ _audFail_ (البوابة تُغلق) كغيرها — ولا نُعلّم المنجَز
    var u = _supaReq_('patch', 'app_outbox?id=in.(' + ids.join(',') + ')', { done_at: new Date().toISOString() });
    if (u.code < 200 || u.code >= 300) { Logger.log('outbox mark ' + u.code + ' ' + String(u.text).slice(0, 160)); break; }
    n += ids.length;
  }
  return n;
}
/* ⚡ (V4.395) صندوق صادر الحسابات العامة (gl_outbox — 003): كتابات السندات من Postgres (031_ledger.sql: دفعة من شاشة ⇒ سند مسودة · اعتماد/رفض) تترك آثارها الجانبية هنا
   فتنفّذها Apps Script بنفس دوالها: مرآة الدفعات بالشاشات/كشف الفندق (_glSyncVoucherPays_) · تنبيه تليجرام (_glBotQ_) · علامة إعادة بناء AUTO (gl_dirty) · بصمات الكاش.
   تُستدعى من audFlushCron كل دقيقة ومن glOutboxKick (المتصفح بعد الاعتماد فتظهر الدفعة بشاشتها خلال ثوانٍ). فشل بند لا يوقف الباقي (يُسجَّل last_error ويُعاد لاحقاً حتى 5 محاولات). */
function _glOutboxDrain_(maxMs) {
  if (!_supaP_('SUPA_URL') || !_supaP_('SUPA_SERVICE_KEY') || _supaP_('SUPA_W_BK') !== '1') return 0;
  var t0 = Date.now(), n = 0;
  while (Date.now() - t0 < (maxMs || 20000)) {
    var r = _supaReq_('get', 'gl_outbox?done_at=is.null&attempts=lt.5&order=id.asc&limit=40&select=id,kind,payload,attempts');
    if (r.code !== 200) { Logger.log('gl_outbox read ' + r.code + ' ' + String(r.text).slice(0, 160)); break; }
    var rows = []; try { rows = JSON.parse(r.text || '[]'); } catch (e) {}
    if (!rows.length) break;
    rows.forEach(function (x) {
      var p = x.payload || {}, err = '';
      try {
        if (x.kind === 'mirror:voucher_pays') { _glSyncVoucherPays_(String(p.entryId), String(p.user || '')); }
        else if (/^bot:/.test(x.kind)) {
          var info = Object.assign({}, p); if (Array.isArray(info.parties)) info.parties = info.parties.join(' ← ');
          _glBotQ_(String(x.kind).slice(4), info);
        }
        else if (x.kind === 'gl:dirty') { try { CacheService.getScriptCache().put('gl_dirty', String(Date.now()), 21600); } catch (e1) {} }
        else if (x.kind === 'dv_bump') { try { if (typeof _dvBump_ === 'function') _dvBump_((p.groups || []).filter(function (g) { return LF_GROUPS_.indexOf(g) >= 0; })); } catch (e2) {} }
      } catch (eX) { err = String(eX && eX.message || eX).slice(0, 300); Logger.log('gl_outbox ' + x.kind + ': ' + err); }
      var patch = err ? { attempts: (x.attempts || 0) + 1, last_error: err } : { done_at: new Date().toISOString() };
      var u = _supaReq_('patch', 'gl_outbox?id=eq.' + x.id, patch);
      if (!err && u.code >= 200 && u.code < 300) n++;
    });
    if (rows.length < 40) break;
  }
  return n;
}
function glOutboxKick(authToken) { requireAuth_(authToken); return { success: true, n: _glOutboxDrain_(20000) }; }
function glOutboxDrainNow() { requireScriptOwner_(); var n = _glOutboxDrain_(60000); Logger.log('gl_outbox: فُرّغ ' + n); return n; }

function outboxDrainNow() { requireScriptOwner_(); var n = _outboxDrain_(60000); Logger.log('outbox: فُرّغ ' + n); return n; }

// (V4.380) المحرر يشغّل الدوال بلا معاملات ⇒ دوال مستقلة لكل حالة
function supaWriteOnMinistry() { return supaWriteOn('mf'); }
function supaWriteOnVisa() { return supaWriteOn('vz'); }
function supaWriteOnBookings() { return supaWriteOn('bk'); }   // (V4.388)
function supaWriteOffBookings() { return supaWriteOff('bk'); }
function supaWriteOffMinistry() { return supaWriteOff('mf'); }
function supaWriteOffVisa() { return supaWriteOff('vz'); }
function supaWriteOffAll() { return supaWriteOff(); }


/* 🏨 (المرحلة 2) نسخ حجوزات مكة/المدينة (للقراءة فقط — ملف المصدر منفصل): تُعاد النسخة كاملة. من المحرر: hbSnapSync() */
function hbSnapSync() {
  requireScriptOwner_();
  var on = _stCfg_().set, specs = _stSpecs_(), log = [];
  ['hb_mecca', 'hb_medina'].forEach(function (t) { if (on[t]) { var r = _stSeedTable_(specs[t]); log.push(t + ': ' + (r.exists ? r.rows + ' صف' : 'الشيت غير موجود')); } });
  Logger.log(log.join(' | ') || 'لا جدول مفعَّل — فعّل المجموعة hb بـ storeCutover(\'hb\')'); return log;
}
