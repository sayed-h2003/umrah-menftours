/* ============================================================================
   GlParity.gs — (V4.373) المرحلة 2-أ: قراءات GL داخل Supabase + أداة مطابقة (للمالك من المحرر فقط)
   • glShadowSync(): يحدّث gl_accounts/gl_entries/gl_lines من الشيتات (حذف سطور القيود ثم إعادة تحميلها) — للاختبار والمقارنة فقط،
     الشيتات ما زالت مصدر الحقيقة حتى تنتقل كتابة GL (المرحلة 2-ب).
   • glParityCheck(): يقارن _glBalances_() (الشيت) مع rpc/gl_balances_raw (Supabase) لكل حساب|عملة|معادل — 0 فروق = جاهز لتحويل القراءة.
   لا تُستدعى من المتصفح (requireScriptOwner_).
   ============================================================================ */
var GP_BUDGET_MS_ = 270000;

function glShadowSync() {
  requireScriptOwner_();
  var t0 = Date.now(), log = [];
  _mgNewCtx_();
  var refs = _mgRefs_();
  var by = function (t) { return MG_SPECS_.filter(function (s) { return s.t === t; })[0]; };
  // 1) سطور القيود تُمسح لتُعاد (تعديل قيد = إعادة كتابة سطوره بالشيت، فالرفع التراكمي يُبقي سطوراً قديمة)
  var w = _mgReq_('delete', 'gl_lines?entry_id=neq.__none__');
  if (w.code >= 300) throw new Error('تعذّر مسح gl_lines: ' + w.code + ' ' + String(w.text).slice(0, 160));
  ['gl_accounts', 'gl_batches', 'gl_entries', 'gl_lines'].forEach(function (t) {
    var sp = by(t); if (!sp) return;
    if (Date.now() - t0 > GP_BUDGET_MS_) { log.push('⏳ ' + t + ' لم يُنقل (انتهى الوقت) — أعد التشغيل'); return; }
    var b = _mgBuild_(sp, refs), rows = _mgClean_(b.rows), size = sp.chunk || 500, st = { sent: 0, failed: 0, errors: [] };
    for (var i = 0; i < rows.length; i += size) {
      if (Date.now() - t0 > GP_BUDGET_MS_) { log.push('⏳ ' + t + ' توقف عند ' + i + ' من ' + rows.length + ' — أعد التشغيل'); break; }
      _mgPost_(sp, rows.slice(i, i + size), st, false);
    }
    log.push(t + ': ' + st.sent + ' / ' + rows.length + (st.failed ? ' · فشل ' + st.failed : '') + (b.skipped ? ' · مُتخطّى ' + b.skipped : ''));
    st.errors.slice(0, 5).forEach(function (e) { log.push('   ' + e); });
  });
  var out = log.join('\n'); Logger.log(out); return out;
}

function glParityCheck() {
  requireScriptOwner_();
  var sheet = _glBalances_(), L = [];
  var r = _mgReq_('post', 'rpc/gl_balances_raw', { p_to: null });
  if (r.code !== 200) { var m = '❌ تعذّر استدعاء gl_balances_raw: ' + r.code + ' ' + String(r.text).slice(0, 200) + ' (هل شغّلت 002_gl_reads.sql؟)'; Logger.log(m); return m; }
  var db = {}; JSON.parse(r.text).forEach(function (x) { db[x.account_code] = { EGP: +x.egp, SAR: +x.sar, USD: +x.usd, base: +x.base }; });
  var codes = {}; Object.keys(sheet).forEach(function (k) { codes[k] = 1; }); Object.keys(db).forEach(function (k) { codes[k] = 1; });
  var bad = 0, n = 0, z = { EGP: 0, SAR: 0, USD: 0, base: 0 };
  Object.keys(codes).forEach(function (c) {
    var a = sheet[c] || z, b = db[c] || z; n++;
    var d = ['EGP', 'SAR', 'USD', 'base'].filter(function (k) { return Math.abs((a[k] || 0) - (b[k] || 0)) > 0.01; });
    if (d.length) { bad++; if (L.length < 30) L.push('❌ ' + c + ' : ' + d.map(function (k) { return k + ' شيت=' + a[k] + ' · DB=' + b[k]; }).join(' | ')); }
  });
  var out = (bad ? '⚠️ فروق في ' + bad + ' من ' + n + ' حساب\n' + L.join('\n') + '\n(الفروق الشائعة: قيد جديد منذ آخر glShadowSync، أو أسطر يتيمة بلا رأس تتخطاها الهجرة)'
                 : '✅ تطابق كامل: ' + n + ' حساب (EGP/SAR/USD/المعادل)');
  Logger.log(out); return out;
}
