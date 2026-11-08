/* ============================================================================
   GlStore.gs — (V4.373 / المرحلة 2-ب/أ) طبقة تخزين قيود الحسابات العامة (GL_Entries + GL_Lines)
   ----------------------------------------------------------------------------
   • مفتاح التشغيل: Script property  GL_STORE=supabase  (افتراضياً غير موجود = المسار القديم بالشيت بلا أي تغيير سلوك).
   • الفكرة: كل الكود الحالي يصل لشيتي القيود/السطور عبر _glSheet_/_glSheetR_/_glRows_. عند تفعيل المفتاح تُرجع هاتان الدالتان
     «واجهة شيت» (_glStSheet_) تحاكي getLastRow/getRange/getValues/setValues/setValue/clearContent/appendRow/deleteRow(s)
     فوق صورة بالذاكرة (image) للجدول، فيعمل منطق الأعمال كما هو حرفياً (أرقام الصفوف ضمن التنفيذ الواحد تبقى متسقة).
   • الكتابة: تُجمَّع تعديلات الصورة وتُرفع عند فك قفل الحسابات (_glUnlock_) بنداء RPC واحد ذرّي (gl_store_put) كفرق (diff)
     بين الصورة الأصلية والنهائية بمفتاح (entry_id) و(entry_id,line_no). خارج القفل: كتابة فورية بعد كل عملية.
   • القراءة: خارج القفل تمر عبر طبقة CacheService الحالية (_glRowsC_ ← _glRowsRaw_ ← _glStReadRows_) بصفحات 1000 صف.
     داخل القفل: تُبذَّر الصورة من الكاش بنسخة البيانات السابقة لأول لمس، وإلا من القاعدة. وبعد فك القفل يُسخَّن الكاش بالصورة النهائية.
   • كل صف يُخزَّن في Postgres بعمودين: الأعمدة المنمّطة (للأرصدة/التقارير SQL) + raw (jsonb = خلايا الشيت حرفياً) للقراءة
     الدقيقة بنفس شكل الشيت. الترتيب: ord (تسلسل إدراج).
   • أرقام القيود: gl_store_next_seq (SEQUENCE) — لا يُعاد استخدام رقم أبداً.
   ملاحظة: التفعيل من المحرر فقط بعد glStoreCutover() — انظر DEPLOY_GUIDE.md.
   ============================================================================ */
var GL_ST_TABLE_ = { entries: 'gl_entries', lines: 'gl_lines' };
var GL_ST_PAGE_ = 1000;
var GL_ST_CHUNK_ = 3000;          // أقصى عدد صفوف (قيود+سطور) بنداء RPC واحد
var _GL_ST_ON_ = null, _GL_ST_IMG_ = {}, _GL_ST_SHEETS_ = {}, _GL_ST_V0_ = null, _GL_ST_BYPASS_ = false, _GL_ST_FLUSHING_ = false;

function _glStOn_() {
  if (_GL_ST_ON_ === null) {
    var on = false;
    try { on = _supaP_('GL_STORE') === 'supabase' && !!_supaP_('SUPA_URL') && !!_supaP_('SUPA_SERVICE_KEY'); } catch (e) { on = false; }
    _GL_ST_ON_ = on;
  }
  return _GL_ST_ON_ && !_GL_ST_BYPASS_;
}
function _glStKey_(key) { return key === 'entries' || key === 'lines'; }
// للاختبارات/بعد تغيير المفتاح: إعادة قراءة المفتاح وتفريغ الصور
function _glStReset_() { _GL_ST_ON_ = null; _GL_ST_IMG_ = {}; _GL_ST_SHEETS_ = {}; _GL_ST_V0_ = null; _GL_ST_BYPASS_ = false; _GL_ST_FLUSHING_ = false; }
function _glStDrop_() { _GL_ST_IMG_ = {}; _GL_ST_V0_ = null; }
// يُستدعى من _glTouch_ عند أول لمس: نسخة البيانات قبل أي كتابة بهذا التنفيذ (كاشها ما زال صالحاً لتبذير الصورة)
function _glStPre_() { if (_GL_ST_V0_ === null) { try { _GL_ST_V0_ = _glVerFresh_(); } catch (e) {} } }
// يُستدعى عند أخذ قفل الحسابات لأول مرة (غير متداخل): أي صورة قديمة قد تكون متقادمة
function _glStOnAcquire_() { if (_glStOn_()) { _GL_ST_IMG_ = {}; } }

/* ---------------- ترميز الخلايا ---------------- */
function _glStIsD_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
function _glStEnc_(v) { if (_glStIsD_(v)) return { $d: v.getTime() }; return (v === undefined || v === null) ? '' : v; }
function _glStDec_(v) { return (v && typeof v === 'object' && v.$d !== undefined) ? new Date(v.$d) : v; }
function _glStW_(key) { return GL_SHEETS_[key].headers.length; }
function _glStBlank_(r) { for (var i = 0; i < r.length; i++) { var v = r[i]; if (v !== '' && v !== null && v !== undefined) return false; } return true; }
function _glStPad_(row, W) { var x = row.slice(0, W); while (x.length < W) x.push(''); return x; }
function _glStJs_(row, W) { return JSON.stringify(_glStPad_(row, W).map(_glStEnc_)); }
// مفتاح الصف (null = صف غير قابل للتخزين: بلا رقم قيد/سطر/حساب)
function _glStRowKey_(key, r) {
  var id = _glStr_(r[0]); if (!id) return null;
  if (key === 'entries') return id;
  var n = Math.round(+_glStr_(r[1])); if (!isFinite(n) || _glStr_(r[1]) === '') return null;
  if (!_glStr_(r[4])) return null;
  return id + '\u0001' + n;
}

/* ---------------- القراءة من Supabase ---------------- */
function _glStReadRows_(key) {
  var t = GL_ST_TABLE_[key], W = _glStW_(key), out = [], off = 0;
  var ord = 'ord.asc.nullsfirst,entry_id.asc' + (key === 'lines' ? ',line_no.asc' : '');
  for (;;) {
    var r = _supaReq_('get', t + '?select=raw&order=' + ord + '&limit=' + GL_ST_PAGE_ + '&offset=' + off);
    if (r.code !== 200) throw new Error('GL_STORE: تعذّرت قراءة ' + t + ' (' + r.code + ') ' + String(r.text).slice(0, 160));
    var a = JSON.parse(r.text);
    for (var i = 0; i < a.length; i++) {
      var raw = a[i].raw;
      if (!raw) throw new Error('GL_STORE: صف بلا raw في ' + t + ' — شغّل glStoreCutover() (لا glShadowSync وحدها)');
      out.push(_glStPad_(raw.map(_glStDec_), W));
    }
    if (a.length < GL_ST_PAGE_) break;
    off += GL_ST_PAGE_;
  }
  return out;
}
// قراءة بطبقة الكاش: النسخة v (إن وُجد كاشها) وإلا القاعدة. putOk: يُسمح بحفظ ما قُرئ في الكاش
function _glStLoadRows_(key, v, putOk) {
  var ck = _glCK_(key + '_' + v), got = _glCGet_(ck);
  if (got) return got;
  var rows = _glStReadRows_(key);
  if (putOk) { try { if (_glVerFresh_() === v) _glCPut_(ck, rows); } catch (e) {} }
  return rows;
}
function _glStTrim_(rows) { var n = rows.length; while (n > 0 && _glStBlank_(rows[n - 1])) n--; return n === rows.length ? rows : rows.slice(0, n); }
function _glStClone_(rows) { var o = new Array(rows.length); for (var i = 0; i < rows.length; i++) o[i] = rows[i].slice(); return o; }

// نقطة الدخول من _glRowsRaw_/_glRowsWRaw_
function _glStRows_(key) {
  var im = _GL_ST_IMG_[key];
  if (im) return _glStClone_(_glStTrim_(im.rows));
  if (_GL_LOCKN_ > 0) return _glStClone_(_glStTrim_(_glStImg_(key).rows));   // داخل القفل: أنشئ الصورة لتُستعمل بقية العملية
  var v = _glVerFresh_();
  return _glStClone_(_glStLoadRows_(key, v, _GL_DIRTY_ && !_GL_ST_V0_ && _glStClean_()));
}
function _glStClean_() { try { var w = +(CacheService.getScriptCache().get('gl_wip') || 0); return !(w && Date.now() - w < 360000); } catch (e) { return true; } }
function _glStImg_(key) {
  var im = _GL_ST_IMG_[key]; if (im) return im;
  var v = _GL_ST_V0_ || _glVerFresh_();
  var rows = _glStLoadRows_(key, v, false);
  im = { rows: _glStClone_(rows), orig: rows, dirty: false };
  _GL_ST_IMG_[key] = im;
  return im;
}

/* ---------------- واجهة الشيت (facade) ---------------- */
function _glStSheet_(key) {
  var S = _GL_ST_SHEETS_[key]; if (S) return S;
  var W = _glStW_(key);
  var rowsOf = function () { return _glStImg_(key).rows; };
  var touch = function () { var im = _glStImg_(key); im.dirty = true; return im; };
  var after = function () { if (_GL_LOCKN_ === 0 && !_GL_ST_FLUSHING_) { _glStFlush_(); _glBump_(); _glStDrop_(); } };
  var lastRow = function () { var r = rowsOf(), i = r.length - 1; while (i >= 0 && _glStBlank_(r[i])) i--; return i + 2; };
  var blankRow = function () { var x = []; for (var i = 0; i < W; i++) x.push(''); return x; };
  var cellIn = function (v) { return (v === undefined || v === null) ? '' : v; };
  var mkRange = function (r, c, nr, nc) {
    nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
    var R = {
      getRow: function () { return r; }, getColumn: function () { return c; }, getNumRows: function () { return nr; }, getNumColumns: function () { return nc; },
      getValues: function () {
        var rows = rowsOf(), out = [];
        for (var i = 0; i < nr; i++) {
          var src = (r + i === 1) ? GL_SHEETS_[key].headers : rows[r + i - 2], line = [];
          for (var j = 0; j < nc; j++) { var v = src ? src[c - 1 + j] : ''; line.push(v === undefined || v === null ? '' : v); }
          out.push(line);
        }
        return out;
      },
      getValue: function () { return R.getValues()[0][0]; },
      setValues: function (vals) {
        if (r < 2) throw new Error('GL_STORE: لا يمكن الكتابة بصف الترويسة');
        var im = touch(), rows = im.rows;
        for (var i = 0; i < vals.length; i++) {
          var idx = r - 2 + i; while (rows.length <= idx) rows.push(blankRow());
          for (var j = 0; j < vals[i].length; j++) { if (c - 1 + j < W) rows[idx][c - 1 + j] = cellIn(vals[i][j]); }
        }
        after(); return R;
      },
      setValue: function (v) {
        if (r < 2) throw new Error('GL_STORE: لا يمكن الكتابة بصف الترويسة');
        var im = touch(), rows = im.rows;
        for (var i = 0; i < nr; i++) { var idx = r - 2 + i; while (rows.length <= idx) rows.push(blankRow()); for (var j = 0; j < nc; j++) if (c - 1 + j < W) rows[idx][c - 1 + j] = cellIn(v); }
        after(); return R;
      },
      clearContent: function () {
        var im = touch(), rows = im.rows;
        for (var i = 0; i < nr; i++) { var row = rows[r - 2 + i]; if (!row) continue; for (var j = 0; j < nc; j++) if (c - 1 + j < W) row[c - 1 + j] = ''; }
        after(); return R;
      }
    };
    ['setNumberFormat', 'setNumberFormats', 'setFontWeight', 'setBackground', 'setFontColor', 'setHorizontalAlignment', 'setWrap', 'setNote'].forEach(function (m) { R[m] = function () { return R; }; });
    return R;
  };
  S = {
    getName: function () { return GL_SHEETS_[key].name; },
    getLastRow: lastRow,
    getLastColumn: function () { return W; }, getMaxColumns: function () { return W; },
    getMaxRows: function () { return Math.max(1000, rowsOf().length + 1); },
    getRange: function (r, c, nr, nc) {
      if (typeof r !== 'number') throw new Error('GL_STORE: getRange(A1) غير مدعوم لشيت ' + key);
      return mkRange(r, c || 1, nr, nc);
    },
    getDataRange: function () { return mkRange(1, 1, lastRow(), W); },
    appendRow: function (arr) {
      var im = touch(), i = lastRow() - 1, row = blankRow();
      for (var j = 0; j < arr.length && j < W; j++) row[j] = cellIn(arr[j]);
      while (im.rows.length < i) im.rows.push(blankRow());
      im.rows[i] = row;
      after(); return S;
    },
    deleteRow: function (n) { return S.deleteRows(n, 1); },
    deleteRows: function (n, cnt) {
      if (n < 2) throw new Error('GL_STORE: لا يمكن حذف الترويسة');
      var im = touch(); im.rows.splice(n - 2, cnt === undefined ? 1 : cnt); after(); return S;
    },
    setFrozenRows: function () { return S; }, hideSheet: function () { return S; }, insertColumnsAfter: function () { return S; },
    getSheetId: function () { return 0; }
  };
  _GL_ST_SHEETS_[key] = S;
  return S;
}

/* ---------------- الكتابة ---------------- */
function _glStTyped_(key, rows) {   // صفوف شيت ⇒ كائنات منمّطة + raw (دفعة واحدة)
  var sp = MG_SPECS_.filter(function (s) { return s.t === GL_ST_TABLE_[key]; })[0], W = _glStW_(key), out = [];
  _mgQuiet_(function () {
    rows.forEach(function (row) {
      var o = {}, k = key + ' ' + _glStr_(row[0]);
      sp.cols.forEach(function (c, j) { o[c[0]] = _mgConv_(c[2], row[j], k); });
      o.raw = _glStPad_(row, W).map(_glStEnc_);
      out.push(o);
    });
  });
  return out;
}
function _glStAccStubs_(lines) {   // حسابات الشيت المشار إليها (قيد FK) — تُنشأ كظلّ بالقاعدة إن لم تكن موجودة
  var need = {}; lines.forEach(function (l) { var c = _glStr_(l.account_code); if (c) need[c] = 1; });
  var codes = Object.keys(need); if (!codes.length) return [];
  var out = [];
  _glRows_('accounts').forEach(function (a) { var c = _glStr_(a[0]); if (need[c]) out.push({ code: c, name: _glStr_(a[1]) || c, acc_type: _glStr_(a[2]) || 'أصول' }); });
  return out;
}
// ops: {ents:[eRow], lines:[lRow], delEntries:[ids], delLines:[[id,no]], delLinesOf:[ids], wipe:bool, resetOrd:bool}
function _glStApply_(ops) {
  var ents = _glStTyped_('entries', ops.ents || []), lines = _glStTyped_('lines', ops.lines || []);
  ents.forEach(function (e) { if (ops.mvEntries && ops.mvEntries[e.entry_id]) e._mv = true; });
  lines.forEach(function (l) { if (ops.mvLines && ops.mvLines[l.entry_id + '\u0001' + l.line_no]) l._mv = true; });
  var byE = {}; lines.forEach(function (l) { (byE[l.entry_id] = byE[l.entry_id] || []).push(l); });
  var chunks = [], cur = null, size = 0, inEnt = {};
  var open = function () { cur = { entries: [], lines: [] }; size = 0; chunks.push(cur); };
  ents.forEach(function (e) {
    var ls = byE[e.entry_id] || []; inEnt[e.entry_id] = 1;
    if (!cur || (size && size + 1 + ls.length > GL_ST_CHUNK_)) open();
    cur.entries.push(e); cur.lines = cur.lines.concat(ls); size += 1 + ls.length;
  });
  var rest = lines.filter(function (l) { return !inEnt[l.entry_id]; });
  for (var i = 0; i < rest.length; i += GL_ST_CHUNK_) chunks.push({ entries: [], lines: rest.slice(i, i + GL_ST_CHUNK_) });
  if (!chunks.length) chunks.push({ entries: [], lines: [] });
  chunks.forEach(function (ch, ix) {
    var p = { entries: ch.entries, lines: ch.lines, accs: _glStAccStubs_(ch.lines) };
    if (ix === 0) { p.del_lines = ops.delLines || []; p.del_lines_of = ops.delLinesOf || []; p.del_entries = ops.delEntries || []; if (ops.wipe) p.wipe = true; }
    if (ops.resetOrd) p.reset_ord = true;
    _glStRpc_('gl_store_put', { p: p });
  });
}
function _glStRpc_(fn, body) {
  var r = _supaReq_('post', 'rpc/' + fn, body);
  if (r.code < 200 || r.code >= 300) throw new Error('GL_STORE: فشل ' + fn + ' (' + r.code + ') ' + String(r.text).slice(0, 240));
  var t = String(r.text || '');
  try { return t ? JSON.parse(t) : null; } catch (e) { return t; }
}
// فرق الصورة عن أصلها. الترتيب (ord): الصف الذي تغيّر موضعه النسبي (حذف+إلحاق بالشيت مثلاً) أو الجديد يأخذ ord جديداً
// (_mv) — فتبقى القراءة بنفس ترتيب الشيت: صفوف مستقرة بترتيبها القديم ثم المنقولة بترتيب الصورة
function _glStDiff_(key, im, ops) {
  var W = _glStW_(key), base = {}, baseIx = {}, i;
  for (i = 0; i < im.orig.length; i++) { var kb = _glStRowKey_(key, im.orig[i]); if (kb !== null) { base[kb] = _glStJs_(im.orig[i], W); baseIx[kb] = i; } }
  var last = {}, cur = [];
  for (i = 0; i < im.rows.length; i++) { var k = _glStRowKey_(key, im.rows[i]); if (k !== null) last[k] = i; }
  var out = key === 'entries' ? ops.ents : ops.lines, mv = key === 'entries' ? ops.mvEntries : ops.mvLines, hi = -1, moving = false;
  for (i = 0; i < im.rows.length; i++) {
    var k2 = _glStRowKey_(key, im.rows[i]); if (k2 === null || last[k2] !== i) continue;
    cur.push(k2);
    var isNew = base[k2] === undefined, moved = false;
    if (isNew) moving = true;
    else if (moving || baseIx[k2] < hi) { moving = true; moved = true; }
    else hi = baseIx[k2];
    if (isNew || moved || base[k2] !== _glStJs_(im.rows[i], W)) {
      out.push(_glStPad_(im.rows[i], W));
      if (moved) mv[k2] = 1;
    }
  }
  var has = {}; cur.forEach(function (k3) { has[k3] = 1; });
  Object.keys(base).forEach(function (k4) {
    if (has[k4]) return;
    if (key === 'entries') ops.delEntries.push(k4);
    else { var p = k4.split('\u0001'); ops.delLines.push([p[0], +p[1]]); }
  });
}
function _glStFlush_() {
  var E = _GL_ST_IMG_.entries, L = _GL_ST_IMG_.lines;
  if (!(E && E.dirty) && !(L && L.dirty)) return false;
  if (_GL_ST_FLUSHING_) return false;
  var ops = { ents: [], lines: [], delEntries: [], delLines: [], delLinesOf: [], mvEntries: {}, mvLines: {} };
  if (E && E.dirty) _glStDiff_('entries', E, ops);
  if (L && L.dirty) _glStDiff_('lines', L, ops);
  _GL_ST_FLUSHING_ = true;
  try {
    if (ops.ents.length || ops.lines.length || ops.delEntries.length || ops.delLines.length) _glStApply_(ops);
  } catch (e) { _glStDrop_(); throw e; }
  finally { _GL_ST_FLUSHING_ = false; }
  [E, L].forEach(function (im) { if (im && im.dirty) { im.orig = _glStClone_(im.rows); im.dirty = false; im.written = true; } });
  _GL_ST_V0_ = null;
  return true;
}
// بعد فك القفل الأخير: سخّن الكاش بالصورة النهائية (الإصدار الجديد) ثم أفرغ الصور
function _glStWarm_() {
  try {
    ['entries', 'lines'].forEach(function (k) { var im = _GL_ST_IMG_[k]; if (im && im.written) _glCPut_(_glCK_(k + '_' + _glVer_()), _glStTrim_(im.rows)); });
  } catch (e) {}
  _glStDrop_();
}

/* ---------------- واجهة صريحة (للاستدعاء المباشر/الاختبار) ---------------- */
function _glStPutEntry_(eRow, lRows, opts) {
  opts = opts || {};
  var ops = { ents: [eRow], lines: lRows || [], delEntries: [], delLines: [], delLinesOf: opts.replaceLines === false ? [] : [_glStr_(eRow[0])] };
  _glStApply_(ops); return true;
}
function _glStPutEntries_(batch) {
  var ops = { ents: [], lines: [], delEntries: [], delLines: [], delLinesOf: [] };
  (batch || []).forEach(function (b) { ops.ents.push(b.eRow); (b.lRows || []).forEach(function (l) { ops.lines.push(l); }); if (b.replaceLines !== false) ops.delLinesOf.push(_glStr_(b.eRow[0])); });
  _glStApply_(ops); return true;
}
function _glStDeleteEntries_(ids) { if (!ids || !ids.length) return true; _glStRpc_('gl_store_delete', { ids: ids }); return true; }
function _glStDeleteLines_(ids) { if (!ids || !ids.length) return true; _glStRpc_('gl_store_put', { p: { entries: [], lines: [], del_lines_of: ids } }); return true; }
function _glStNextSeq_(n) { var v = _glStRpc_('gl_store_next_seq', { n: Math.max(1, parseInt(n, 10) || 1) }); return parseInt(v, 10); }

/* ---------------- أدوات المالك (من المحرر فقط) ---------------- */
function _glStSheetRows_(key) {   // قراءة الشيت الحقيقي مباشرة (متجاوزة المفتاح)
  var save = _GL_ST_BYPASS_; _GL_ST_BYPASS_ = true;
  try { return _glRowsWRaw_(key).filter(function (r) { return !_glStBlank_(r); }); } finally { _GL_ST_BYPASS_ = save; }
}
function _glStRnd_(x) { return Math.round((+x || 0) * 100) / 100; }
function _glStSummary_(entries, lines) {
  var eIds = {}, sums = {}, bal = {};
  entries.forEach(function (r) { eIds[_glStr_(r[0])] = 1; });
  lines.forEach(function (r) {
    var id = _glStr_(r[0]), s = sums[id] = sums[id] || { n: 0, d: 0, c: 0 };
    s.n++; s.d += _glNum_(r[5]); s.c += _glNum_(r[6]);
    if (_glStr_(r[3]) === GL_ST_POSTED_) { var k = _glStr_(r[4]) + '|' + _glCur_(r[7]); bal[k] = (bal[k] || 0) + _glNum_(r[5]) - _glNum_(r[6]); }
  });
  return { eIds: eIds, sums: sums, bal: bal, nE: Object.keys(eIds).length, nL: lines.length };
}
function glStoreCompare() {
  requireScriptOwner_();
  var se = _glStSheetRows_('entries').filter(function (r) { return _glStRowKey_('entries', r) !== null; });
  var sl = _glStSheetRows_('lines').filter(function (r) { return _glStRowKey_('lines', r) !== null; });
  var de = _glStReadRows_('entries'), dl = _glStReadRows_('lines'), L = [];
  var A = _glStSummary_(se, sl), B = _glStSummary_(de, dl);
  if (A.nE !== B.nE) L.push('❌ عدد القيود: شيت=' + A.nE + ' · DB=' + B.nE);
  if (A.nL !== B.nL) L.push('❌ عدد السطور: شيت=' + A.nL + ' · DB=' + B.nL);
  var bad = 0;
  Object.keys(A.sums).forEach(function (id) {
    var a = A.sums[id], b = B.sums[id] || { n: 0, d: 0, c: 0 };
    if (a.n !== b.n || Math.abs(a.d - b.d) > 0.005 || Math.abs(a.c - b.c) > 0.005) { bad++; if (L.length < 30) L.push('❌ ' + id + ' : سطور ' + a.n + '/' + b.n + ' · مدين ' + _glStRnd_(a.d) + '/' + _glStRnd_(b.d) + ' · دائن ' + _glStRnd_(a.c) + '/' + _glStRnd_(b.c)); }
  });
  Object.keys(B.sums).forEach(function (id) { if (!A.sums[id]) { bad++; if (L.length < 30) L.push('❌ ' + id + ' : موجود بـDB فقط'); } });
  var codes = {}; Object.keys(A.bal).forEach(function (k) { codes[k] = 1; }); Object.keys(B.bal).forEach(function (k) { codes[k] = 1; });
  var badBal = 0; Object.keys(codes).forEach(function (k) { if (Math.abs((A.bal[k] || 0) - (B.bal[k] || 0)) > 0.01) { badBal++; if (L.length < 30) L.push('❌ رصيد ' + k + ' : شيت=' + _glStRnd_(A.bal[k]) + ' · DB=' + _glStRnd_(B.bal[k])); } });
  // معرّفات قيود مكررة بالشيت (علّة قديمة — شاشة «قيود مكررة المعرّف»): قاعدة DB مفتاحها الأساسي معرّف القيد فيبقى آخر رأس؛ تُعرض ولا تُحسب فرقاً
  var dupG = {}; se.forEach(function (r) { var id = _glStr_(r[0]); (dupG[id] = dupG[id] || []).push(r); });
  var dupIds = Object.keys(dupG).filter(function (id) { return dupG[id].length > 1; });
  se = _glStDedupe_('entries', se);
  var rowDiff = 0, W = _glStW_('entries'), WL = _glStW_('lines');
  var mapE = {}; de.forEach(function (r) { mapE[_glStRowKey_('entries', r)] = _glStJs_(r, W); });
  se.forEach(function (r) { if (mapE[_glStRowKey_('entries', r)] !== _glStJs_(r, W)) rowDiff++; });
  var mapL = {}; dl.forEach(function (r) { mapL[_glStRowKey_('lines', r)] = _glStJs_(r, WL); });
  sl.forEach(function (r) { if (mapL[_glStRowKey_('lines', r)] !== _glStJs_(r, WL)) rowDiff++; });
  if (rowDiff) L.push('❌ صفوف مختلفة المحتوى (رؤوس+سطور): ' + rowDiff);
  var dupNote = dupIds.length ? '\nℹ️ ' + dupIds.length + ' قيد مكرر المعرّف بالشيت (يبقى آخر رأس بالقاعدة، والسطور والأرصدة غير متأثرة): ' + dupIds.slice(0, 12).map(function (id) {
    return id + ' [' + dupG[id].map(function (r) { return _glStr_(r[2]) + ' ' + _glStr_(r[3]) + ' ' + _glStr_(r[5]) + ' ' + _glNum_(r[8]); }).join(' | ') + ']'; }).join(' ؛ ') : '';
  var out = (L.length || bad || badBal) ? '⚠️ فروق (قيود ' + bad + ' · أرصدة ' + badBal + ')\n' + L.join('\n')
    : '✅ تطابق كامل: ' + A.nE + ' قيد · ' + A.nL + ' سطر · ' + Object.keys(codes).length + ' رصيد (حساب|عملة)';
  out += dupNote;
  Logger.log(out); return out;
}
/* نقل البيانات من الشيتات إلى Supabase بكل خلايا الشيت حرفياً (raw) وبترتيب الشيت — يمسح gl_lines/gl_entries ثم يعيد تحميلهما */
function _glStDedupe_(key, rows) {   // آخر صف يغلب عند تكرار المفتاح (نفس قاعدة الهجرة)
  var last = {}, out = [];
  rows.forEach(function (r, i) { last[_glStRowKey_(key, r)] = i; });
  rows.forEach(function (r, i) { if (last[_glStRowKey_(key, r)] === i) out.push(r); });
  return out;
}
function _glStSeed_() {
  var allE = _glStSheetRows_('entries'), allL = _glStSheetRows_('lines');
  var ents = _glStDedupe_('entries', allE.filter(function (r) { return _glStRowKey_('entries', r) !== null; }));
  var inE = {}; ents.forEach(function (r) { inE[_glStr_(r[0])] = 1; });
  var lns = _glStDedupe_('lines', allL.filter(function (r) { return _glStRowKey_('lines', r) !== null && inE[_glStr_(r[0])]; }));
  _glStApply_({ ents: ents, lines: lns, delEntries: [], delLines: [], delLinesOf: [], wipe: true, resetOrd: true });
  return { entries: ents.length, lines: lns.length, skippedEntries: allE.length - ents.length, skippedLines: allL.length - lns.length };
}
/* ===== خطوات النقل (تُنفَّذ بالترتيب من المحرر، المفتاح GL_STORE غير مفعّل) =====
   1) نفّذ supabase/004_gl_store.sql ثم 003 (اختياري) · 2) ضع GL_STORE غير موجود (المسار القديم) وأوقف الكتابة في الحسابات (لا مستخدمين)
   3) glStoreCutover()        — قفل الحسابات ثم glShadowSync() لحسابات/دفعات ثم _glStSeed_ ثم gl_store_resync_seq ثم glStoreCompare
   4) glStoreCutover(true)     — نفس ما سبق ثم يضبط GL_STORE=supabase إن كانت المقارنة نظيفة
   تراجع: glStoreRollback() — ينسخ DB إلى الشيتات (بالقفل) ثم يحذف GL_STORE. */
function glStoreCutover(apply) {
  requireScriptOwner_();
  var lock = _glLock_(); lock.waitLock(120000);
  var log = [];
  try {
    if (_glStOn_()) throw new Error('GL_STORE مفعّل أصلاً — أوقفه (احذف الخاصية) قبل إعادة النقل');
    try { var sh = glShadowSync(); log.push('glShadowSync:\n' + sh); } catch (e) { log.push('⚠️ glShadowSync: ' + e.message); }
    var s = _glStSeed_(); log.push('seed: قيود ' + s.entries + ' · سطور ' + s.lines + ' · مُتخطّى قيود ' + s.skippedEntries + ' / سطور ' + s.skippedLines);
    var rs = _glStRpc_('gl_store_resync_seq', {}); log.push('resync_seq: ' + JSON.stringify(rs));
    var cmp = glStoreCompare(); log.push(cmp);
    if (apply && cmp.charAt(0) === '✅') { PropertiesService.getScriptProperties().setProperty('GL_STORE', 'supabase'); _GL_ST_ON_ = null; _glBump_(); log.push('✅ GL_STORE=supabase'); }
    else if (apply) log.push('⛔ لم يُفعَّل: توجد فروق');
  } finally { _glUnlock_(lock); }
  var out = log.join('\n'); Logger.log(out); return out;
}
function glStoreRollback() {
  requireScriptOwner_();
  var lock = _glLock_(); lock.waitLock(120000);
  try {
    var save = _GL_ST_BYPASS_; var ents = _glStReadRows_('entries'), lns = _glStReadRows_('lines');
    _GL_ST_BYPASS_ = true;
    try {
      [['entries', ents], ['lines', lns]].forEach(function (p) {
        var sh = _glSheet_(p[0]), W = _glStW_(p[0]), last = sh.getLastRow();
        if (last > 1) sh.getRange(2, 1, last - 1, W).clearContent();
        if (p[1].length) sh.getRange(2, 1, p[1].length, W).setValues(p[1]);
      });
    } finally { _GL_ST_BYPASS_ = save; }
    PropertiesService.getScriptProperties().deleteProperty('GL_STORE'); _GL_ST_ON_ = null; _glStDrop_(); _glBump_();
    var m = '↩️ أُعيدت الشيتات من DB: قيود ' + ents.length + ' · سطور ' + lns.length + ' و GL_STORE أُلغي'; Logger.log(m); return m;
  } finally { _glUnlock_(lock); }
}
