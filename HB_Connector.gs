/* ============================================================================
   🔌 HB_Connector.gs — (V4.452) موصل لحظي لشيتات إدخال برنامج الحجوزات: حجوزات مكة · حجوزات المدينة · العملاء والموردين
   ----------------------------------------------------------------------------
   الشيتات تبقى للإدخال اليدوي بجوجل شيتس. سكربت صغير داخل ملفها (يولّده hbSrcConnectorSetup) يدفع صورتها لـ Supabase (cs_sheets —
   نفس بنية موصل العهدة) فور أي تعديل وكل دقيقة. البرنامج (Apps Script وgas معاً) يقرأ هذه الصورة عبر «شيت افتراضي» بنفس واجهة الشيت
   بلا فتح الملف الخارجي، وكتاباته (تعديل حجز/حجز جديد/تأكيد…) تُسجَّل طابوراً يكتبه الموصل بالشيت خلال ثوانٍ — مع تحديد الصف
   برقم الحجز الداخلي (العمود C) لو أُدرجت/حُذفت صفوف بين التسجيل والكتابة. الإيقاف: hbSrcConnectorOff ⇒ رجوع لفتح الملف مباشرة.
   ============================================================================ */
var HB_CONN_PROP_ = 'HB_SRC_CONN';
var _HB_CONN_MEMO_ = undefined, _HB_CONN_DATA_ = {};

function _hbConn_() {
  if (_HB_CONN_MEMO_ !== undefined) return _HB_CONN_MEMO_;
  var c = null; try { c = JSON.parse(PropertiesService.getScriptProperties().getProperty(HB_CONN_PROP_) || 'null'); } catch (e) { c = null; }
  return (_HB_CONN_MEMO_ = (c && c.sheetId && c.tabs) ? c : null);
}
// صورة ورقة موصولة من قاعدة البيانات (مرة لكل تنفيذ)
function _hbConnData_(code) {
  if (_HB_CONN_DATA_[code]) return _HB_CONN_DATA_[code];
  var r = _supaReq_('post', 'rpc/cs_get', { p_code: code });
  if (r.code >= 300) throw new Error('تعذّر قراءة شيت الحجوزات من قاعدة البيانات (' + r.code + '): ' + String(r.text).slice(0, 200));
  var d = JSON.parse(r.text || 'null');
  if (!d || !d.rows || !d.rows.length) throw new Error('لم تصل بيانات شيت «' + code + '» بعد عبر الموصل — افتح شيت الحجوزات وشغّل setup من «الإضافات ← Apps Script»');
  d.orig = JSON.parse(JSON.stringify(d.rows));   // للبصمة: قيمة عمود المفتاح قبل كتابات هذا التنفيذ
  return (_HB_CONN_DATA_[code] = d);
}
function _hbConnDec_(v) { return (v && typeof v === 'object' && v.$d !== undefined) ? new Date(v.$d) : (v === null || v === undefined ? '' : v); }
function _hbConnEnc_(v) { if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : { $d: v.getTime() }; return v === null || v === undefined ? '' : v; }
function _hbConnKey_(row, sc) { var x = (row || [])[sc - 1]; if (x === null || x === undefined) return ''; if (typeof x === 'object' && x.$d !== undefined) return 'd' + x.$d; return String(x).trim(); }

// شيت افتراضي لورقة موصولة: getLastRow/getLastColumn/getRange(r,c,nr,nc).getValues|getDisplayValues|getValue|setValue|setValues
function _hbConnSheet_(t) {
  var d = _hbConnData_(t.code), fr = d.firstRow || 1;
  var rng = function (r, c, nr, nc) {
    nr = nr || 1; nc = nc || 1;
    var o = {
      getValues: function () {
        var out = [];
        for (var i = 0; i < nr; i++) { var row = d.rows[r + i - fr] || [], a = []; for (var j = 0; j < nc; j++) a.push(_hbConnDec_(row[c - 1 + j])); out.push(a); }
        return out;
      },
      getDisplayValues: function () { return o.getValues().map(function (rw) { return rw.map(function (v) { return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(v); }); }); },
      getValue: function () { return o.getValues()[0][0]; },
      getDisplayValue: function () { return o.getDisplayValues()[0][0]; },
      getRow: function () { return r; }, getColumn: function () { return c; }, getNumRows: function () { return nr; }, getNumColumns: function () { return nc; },
      setNumberFormat: function () { return o; }, setNumberFormats: function () { return o; }, setBackground: function () { return o; }, setFontColor: function () { return o; }, setNote: function () { return o; },
      setValue: function (v) { return o.setValues([[v]]); },
      clearContent: function () { var a = []; for (var i = 0; i < nr; i++) { var b = []; for (var j = 0; j < nc; j++) b.push(''); a.push(b); } return o.setValues(a); },
      setValues: function (arr) {
        var cells = {};
        (arr || []).forEach(function (a, i) {
          (a || []).forEach(function (v, j) {
            var rr = r + i, cc = c + j, idx = rr - fr; if (idx < 0) return;
            while (d.rows.length <= idx) d.rows.push([]);
            var row = d.rows[idx];
            cells[rr + '|' + cc] = t.sc ? { v: _hbConnEnc_(v), sig: _hbConnKey_(d.orig[idx], t.sc), sc: t.sc } : { v: _hbConnEnc_(v) };
            while (row.length < cc) row.push('');
            row[cc - 1] = _hbConnEnc_(v);
          });
        });
        if (Object.keys(cells).length) {
          var q = _supaReq_('post', 'rpc/cs_queue', { p_code: t.code, p_cells: cells });
          if (q.code >= 300) throw new Error('تعذّر تسجيل التعديل بشيت الحجوزات: ' + String(q.text).slice(0, 200));
        }
        return o;
      }
    };
    return o;
  };
  var last = function () { return d.rows.length ? fr + d.rows.length - 1 : 0; };   // = getLastRow للشيت (الموصل يدفع حتى آخر صف به محتوى/معادلة)
  return {
    getName: function () { return t.tab; }, getSheetName: function () { return t.tab; },
    getLastRow: last, getMaxRows: function () { return fr + d.rows.length - 1; },
    getLastColumn: function () { return d.lastCol || d.rows.reduce(function (m, rw) { return Math.max(m, (rw || []).length); }, 0); },
    getMaxColumns: function () { return d.lastCol || 26; },
    getRange: function (r, c, nr, nc) {
      if (typeof r === 'string') throw new Error('موصل الحجوزات: نطاق نصي غير مدعوم (' + r + ')');
      return rng(r, c, nr, nc);
    },
    getDataRange: function () { return rng(1, 1, Math.max(1, last()), Math.max(1, this.getLastColumn())); },
    insertRowAfter: function () { throw new Error('موصل الحجوزات: إدراج صفوف من البرنامج غير مدعوم — أضفها من الشيت'); },
    deleteRow: function () { throw new Error('موصل الحجوزات: حذف صفوف من البرنامج غير مدعوم — احذفها من الشيت'); },
    appendRow: function () { throw new Error('موصل الحجوزات: إضافة صف بآخر الشيت غير مدعومة — يُكتب الحجز بأول صف فارغ'); },
    _conn: true
  };
}
// غلاف ملف المصدر: الأوراق الموصولة افتراضية، والباقي من الملف الحقيقي (يُفتح عند الحاجة فقط)
function _hbConnBook_(rawFn) {
  var c = _hbConn_(), raw = null, R = function () { return raw || (raw = rawFn()); }, byTab = {};
  Object.keys(c.tabs).forEach(function (k) { var t = c.tabs[k]; byTab[t.tab] = t; });
  return {
    getId: function () { return c.sheetId; }, getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + c.sheetId; },
    getName: function () { var t = c.tabs.mk || c.tabs.md; try { return t ? (_hbConnData_(t.code).title || '') : ''; } catch (e) { return ''; } },
    getSpreadsheetTimeZone: function () { return Session.getScriptTimeZone(); },
    getSheetByName: function (n) { return byTab[n] ? _hbConnSheet_(byTab[n]) : R().getSheetByName(n); },
    getSheets: function () { return R().getSheets(); },
    insertSheet: function () { var x = R(); return x.insertSheet.apply(x, arguments); },
    toast: function () {}
  };
}
// ملف البرنامج نفسه مصدرٌ للحجوزات ⇒ غلاف Proxy يحوّل أوراق الإدخال فقط ويترك كل شيء آخر كما هو
function _hbConnProxy_(ss) {
  var c = _hbConn_(); if (!c || !ss) return ss;
  var byTab = {}; Object.keys(c.tabs).forEach(function (k) { byTab[c.tabs[k].tab] = c.tabs[k]; });
  return new Proxy(ss, { get: function (t, k) {
    if (k === 'getSheetByName') return function (n) { return byTab[n] ? _hbConnSheet_(byTab[n]) : t.getSheetByName(n); };
    var v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
}
// يُستدعى من openSourceSpreadsheet_ وhbBookById_ وhbProgramSS_: لو الموصل مفعّل لهذا الملف ⇒ الغلاف
function _hbConnWrapId_(id, rawFn) {
  var c = _hbConn_();
  if (!c || String(id) !== String(c.sheetId)) return rawFn();
  return _hbConnBook_(rawFn);
}

/* ---------- أدوات المالك (من المحرر) ---------- */
// إعداد/تجديد الموصل: مفاتيح جديدة لأوراق الإدخال الثلاث ⇒ يطبع نص السكربت الذي يُلصق بملف الحجوزات (الإضافات ← Apps Script) ثم setup
function hbSrcConnectorSetup() {
  requireScriptOwner_();
  if (!_supaP_('SUPA_URL') || !_supaP_('SUPA_ANON_KEY')) throw new Error('إعداد Supabase ناقص (SUPA_URL / SUPA_ANON_KEY)');
  var s = getSourceSettings_(), id = (!s.spreadsheetId || s.spreadsheetId === 'ACTIVE') ? hbProgramId_() : s.spreadsheetId;
  if (!id) throw new Error('لم يُحدَّد ملف مصدر الحجوزات');
  var tabs = { mk: { tab: s.meccaSheet, cols: SOURCE_LAST_COL, txt: false, sc: 3 }, md: { tab: s.medinaSheet, cols: SOURCE_LAST_COL, txt: false, sc: 3 },
               party: { tab: SRC_PARTY_SHEET_NAME_, cols: 26, txt: false } };
  var list = [];
  Object.keys(tabs).forEach(function (k) {
    var t = tabs[k], key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    t.code = 'HBSRC:' + k;
    var r = _supaReq_('post', 'rpc/cs_setup', { p_code: t.code, p_key: key, p_sheet_id: id });
    if (r.code >= 300) throw new Error('تعذّر إعداد الموصل (طبّق 061): ' + String(r.text).slice(0, 200));
    _supaReq_('post', 'rpc/cs_set_every', { p_code: t.code, p_min: 1 });
    list.push({ code: t.code, key: key, tab: t.tab, cols: t.cols, txt: t.txt, sc: t.sc });
  });
  var cfg = { sheetId: id, tabs: tabs, at: new Date().toISOString(), on: false };
  PropertiesService.getScriptProperties().setProperty(HB_CONN_PROP_ + '_PENDING', JSON.stringify(cfg));
  var script = _glCsConnScript_(list, {}, 'موصل الحجوزات');
  Logger.log('انسخ كل ما بعد هذا السطر والصقه بملف الحجوزات: الإضافات ← Apps Script ← استبدل كل المحتوى ← احفظ ← اختر setup ← ▶ تشغيل\n\n' + script);
  return 'تم إنشاء المفاتيح. الصق السكربت بالملف وشغّل setup، ثم شغّل hbSrcConnectorOn() بعد أن يظهر ✅ داخل الشيت.';
}
// التفعيل بعد وصول أول صورة للأوراق الثلاث (يرفض لو لم تصل)
function hbSrcConnectorOn() {
  requireScriptOwner_();
  var P = PropertiesService.getScriptProperties(), cfg = JSON.parse(P.getProperty(HB_CONN_PROP_ + '_PENDING') || P.getProperty(HB_CONN_PROP_) || 'null');
  if (!cfg) throw new Error('شغّل hbSrcConnectorSetup أولاً');
  var miss = [];
  Object.keys(cfg.tabs).forEach(function (k) {
    var r = _supaReq_('post', 'rpc/cs_get', { p_code: cfg.tabs[k].code }), d = r.code < 300 ? JSON.parse(r.text || 'null') : null;
    if (!d || !d.rows || !d.rows.length) miss.push(cfg.tabs[k].tab);
  });
  if (miss.length) throw new Error('لم تصل بعد صورة: ' + miss.join('، ') + ' — تأكد من لصق السكربت وتشغيل setup بملف الحجوزات');
  cfg.on = true; P.setProperty(HB_CONN_PROP_, JSON.stringify(cfg)); P.deleteProperty(HB_CONN_PROP_ + '_PENDING');
  _HB_CONN_MEMO_ = undefined;
  try { invalidateSourceCache_(); } catch (e) {}
  try { if (typeof supaPropsSync_ === 'function') supaPropsSync_(true); } catch (e2) {}
  return '✅ البرنامج يقرأ ويكتب شيتات الحجوزات عبر الموصل الآن';
}
function hbSrcConnectorOff() {
  requireScriptOwner_();
  var P = PropertiesService.getScriptProperties(), cfg = _hbConn_();
  if (cfg) Object.keys(cfg.tabs).forEach(function (k) { try { _supaReq_('post', 'rpc/cs_off', { p_code: cfg.tabs[k].code }); } catch (e) {} });
  P.deleteProperty(HB_CONN_PROP_); _HB_CONN_MEMO_ = undefined;
  try { if (typeof supaPropsSync_ === 'function') supaPropsSync_(true); } catch (e2) {}
  return 'أُوقف موصل الحجوزات — البرنامج يفتح الشيتات مباشرة كما كان (احذف السكربت من ملف الحجوزات أو اتركه بلا ضرر)';
}
function hbSrcConnectorStatus() {
  requireScriptOwner_();
  var cfg = _hbConn_() || JSON.parse(PropertiesService.getScriptProperties().getProperty(HB_CONN_PROP_ + '_PENDING') || 'null');
  if (!cfg) return 'غير مُعدّ';
  var out = ['الحالة: ' + (_hbConn_() ? 'مفعّل' : 'بانتظار التفعيل')];
  Object.keys(cfg.tabs).forEach(function (k) {
    var t = cfg.tabs[k], r = _supaReq_('post', 'rpc/cs_get', { p_code: t.code }), d = r.code < 300 ? JSON.parse(r.text || 'null') : null;
    out.push(t.tab + ': ' + (d ? (d.rows || []).length + ' صف · آخر دفع ' + (d.pushedAt ? new Date(d.pushedAt).toLocaleString() : '—') + ' · طابور ' + Object.keys(d.pending || {}).length : 'لا بيانات'));
  });
  var msg = out.join('\n'); Logger.log(msg); return msg;
}
