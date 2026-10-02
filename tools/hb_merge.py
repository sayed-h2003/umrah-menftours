#!/usr/bin/env python3
"""
H4 — يولّد ملفات برنامج الحجوزات المدموجة داخل مشروع برنامج العمرة (HB_*) من مصادر hotels/.
كل ما يفعله: إعادة تسمية الأسماء السبعة المتعارضة، وتوجيه الملفات/القوالب بالبادئة HB_، وفتح ملف
بيانات الحجوزات بمعرّفه بدل «الملف النشط». يُعاد تشغيله بعد أي تعديل على hotels/ فيعيد التوليد.
  python3 tools/hb_merge.py
"""
import re, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'hotels')

IDENT = [  # (قديم، جديد) — استبدال بحدود الكلمة
    ('doGet', 'hbDoGet_'), ('doPost', 'hbDoPost_'), ('APP_VERSION', 'HB_APP_VERSION'),
    ('getAppVersion', 'hbGetAppVersion'), ('deleteTempFile', 'hbDeleteTempFile'),
    ('hashPassword_', 'hbHashPassword_'), ('logChange_', 'hbLogChange_'),
]
TEMPLATES = ['App', 'Portal', 'PrintTemplate', 'ConfirmationTemplate', 'ArrivalsReportTemplate', 'BalancesReportTemplate']

def ident(s, pairs=IDENT):
    for a, b in pairs:
        s = re.sub(r'(?<![\w$])' + re.escape(a) + r'(?![\w$])', b, s)
    return s

def must(s, old, new, count=1):
    n = s.count(old)
    if n != count: sys.exit('✗ النمط غير موجود/مكرر (%d): %s' % (n, old[:90]))
    return s.replace(old, new)

def server(s):
    s = ident(s)
    s = re.sub(r'^function onEdit\(', 'function hbOnEdit_(', s, flags=re.M)   # لا نريده مشغّلاً بسيطاً على شيت العمرة
    for t in TEMPLATES:
        s = re.sub(r"(createTemplateFromFile|createHtmlOutputFromFile)\('" + t + r"'\)", r"\1('HB_" + t + "')", s)
    s = s.replace("'GEMINI_API_KEY_1'", "'HB_GEMINI_API_KEY_1'").replace("'GEMINI_API_KEY_2'", "'HB_GEMINI_API_KEY_2'")
    return s

# (V4.248) وضع التضمين: بلا شاشة دخول (حالة «جارٍ الفتح…» بدلها) · شريط واحد (يُخفى شريط البرنامج إلا كروت الإحصاءات) ·
# جرس طلبات العملاء رقماً على تبويب البرنامج الرئيسي · أزرار الدفعات بالكشف تفتح نموذج البرنامج الرئيسي · كل المدفوعات للعرض فقط
HB_EMBED_JS = r'''
if (HB_EMBED) {
  try { document.documentElement.classList.add('hb-embed'); } catch (eE) {}
  // (V4.253) Apps Script يغلّف كل صفحة بإطارين (sandbox ثم userHtml) ⇒ «الأب» المباشر ليس برنامج العمرة: الرسالة تُرسَل
  // لكل الأسلاف حتى تصل لإطار برنامج العمرة أيّاً كان عمقه (أي إطار آخر يتجاهلها). sec يميّز إطارات الإعدادات المضمَّنة
  var hbPost_ = window.hbPost_ = function (m) {
    try { m.sec = HB_SEC || ''; } catch (eS) {}
    var w = window, n = 0;
    try { while (n < 8 && w.parent && w.parent !== w) { w = w.parent; n++; try { w.postMessage(m, '*'); } catch (eP) {} } } catch (eW) {}
  };
  window.hbEmbedReady_ = function () { var o = document.getElementById('hbEmbedLoad'); if (o) o.remove(); hbPost_({ hbReady: 1 }); };
  window.hbEmbedFail_ = function (msg) {
    var o = document.getElementById('hbEmbedLoad'); if (!o) return;
    o.innerHTML = '<div class="hbel-box"><b>تعذّر فتح برنامج الحجوزات</b><span>' + String(msg || '').replace(/[<>&]/g, '') + '</span><button type="button" onclick="hbPost_({hbRetry:1})">↻ إعادة المحاولة</button></div>';
  };
  document.addEventListener('DOMContentLoaded', function () {
    var o = document.createElement('div'); o.id = 'hbEmbedLoad';
    o.innerHTML = '<div class="hbel-box"><span class="hbel-spin"></span><span>جارٍ فتح الشاشة…</span></div>';
    document.body.appendChild(o);
    setTimeout(function () { if (document.getElementById('hbEmbedLoad') && !(typeof currentUser !== 'undefined' && currentUser)) hbEmbedFail_('انتهت مهلة الدخول الموحّد'); }, 30000);
    var last = null;
    setInterval(function () {   // جرس طلبات العملاء ⇒ رقم على تبويب «بوابة العملاء» بالبرنامج الرئيسي
      var b = document.getElementById('portalReqBellBadge'), n = b && !b.hidden ? (parseInt(b.textContent, 10) || 0) : 0;
      if (n !== last) { last = n; hbPost_({ hbBell: n }); }
    }, 3000);
  });
  // أزرار الدفعات (الكشف وكل المدفوعات) ⇒ نموذج الدفعة بالبرنامج الرئيسي بالطرف المحدد
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest && ev.target.closest('#stmtAddPaymentBtn,#stmtAddBatchBtn,#stmtAddLinkedBtn');
    if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    var c = document.getElementById('customer');
    hbPost_({ hbPay: { kind: t.id === 'stmtAddLinkedBtn' ? 'link' : (t.id === 'stmtAddBatchBtn' ? 'multi' : 'single'), party: c ? String(c.value || '').trim() : '' } });
  }, true);
  // (V4.253) جزء من الإعدادات مضمَّن داخل إعدادات برنامج العمرة: core = إعدادات الحجوزات · bot = تليجرام والبوت
  if (HB_SEC) {
    try { document.documentElement.classList.add('hb-sec'); } catch (eS) {}
    document.addEventListener('DOMContentLoaded', function () {
      var pg = document.getElementById('page-settings'); if (!pg) return;
      var bot = /تليجرام/, gone = /شيتات العهدة|مدة الجلسة/;
      Array.prototype.forEach.call(pg.querySelectorAll('details'), function (d) {
        if (d.parentElement && d.parentElement.closest('details')) return;
        var sm = d.querySelector('summary'), t = sm ? sm.textContent : '';
        var show = HB_SEC === 'bot' ? bot.test(t) : (!bot.test(t) && !gone.test(t));
        d.style.display = show ? '' : 'none';
      });
    });
  }
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data; if (!d) return;
    if (d.hbRefresh) { try { if (typeof currentPageKey_ === 'function' && currentPageKey_() === 'statement' && typeof refreshStatement === 'function' && typeof cacheData !== 'undefined' && cacheData) refreshStatement(); } catch (eR) {} return; }
    if (!d.hbShow) return;
    try { if (typeof currentUser !== 'undefined' && currentUser) showPage(String(d.hbShow)); else INITIAL_PAGE = String(d.hbShow); } catch (eM) {}
  });
}'''

def build():
    out = {}
    code = server(open(os.path.join(SRC, 'Code.gs'), encoding='utf-8').read())
    code = must(code, "if (!_SS_MEMO_) _SS_MEMO_ = SpreadsheetApp.getActiveSpreadsheet();",
                "if (!_SS_MEMO_) _SS_MEMO_ = hbProgramSS_();   // (H4) ملف بيانات الحجوزات بمعرّفه — المشروع الآن مرتبط بشيت العمرة")
    code = must(code, "  var initialPage = (e && e.parameter && e.parameter.page) || 'statement';",
                "  var initialPage = (e && e.parameter && (e.parameter.hp || (e.parameter.page !== 'hotels' ? e.parameter.page : ''))) || 'statement';")
    code = must(code, "    tmpl.initialPage = initialPage;\n",
                "    tmpl.initialPage = initialPage;\n    tmpl.ssoCode = String((e && e.parameter && e.parameter.sso) || '').replace(/[^\\w-]/g, '');\n"
                "    tmpl.embed = (e && e.parameter && e.parameter.embed === '1') ? '1' : '';   // (V4.245) مضمَّن داخل شاشة «الفنادق» ببرنامج العمرة\n"
                "    tmpl.hbSec = String((e && e.parameter && e.parameter.hs) || '').replace(/[^a-z]/g, '');   // (V4.253) جزء من الإعدادات فقط\n")
    code = must(code, "        .setTitle('حجوزات وحسابات سكن')", "        .setTitle('حجوزات الفنادق — منف')")
    code = must(code, 'var HB_APP_VERSION = "', '// (H4) مدموج داخل مشروع برنامج العمرة — ملفات HB_*\nvar HB_APP_VERSION = "')
    # 🤖 (V4.255) بوت واحد بمجموعتين: أوامر الحسابات (glBotHandle_) تُفحص قبل أوامر الحجوزات، وطابور تنبيهات
    # الحسابات (glBotTick_) يُفرَّغ من نفس المهمة الدورية — الدالتان ببرنامج العمرة (Accounts.gs)
    code = must(code, "      try {\n        r = tgHandleMessage_(upd.message);",
                "      try {\n        r = (typeof glBotHandle_ === 'function' && glBotHandle_(upd.message)) || tgHandleMessage_(upd.message);")
    code = must(code, "  try { if (typeof custodySyncTick_ === 'function') custodySyncTick_(); }",
                "  try { if (typeof glBotTick_ === 'function') glBotTick_(); } catch (eGlb) { Logger.log('drain/glbot: ' + eGlb.message); }\n"
                "  try { if (typeof custodySyncTick_ === 'function') custodySyncTick_(); }")
    out['HB_Code.gs'] = code
    out['HB_CustodySync.gs'] = server(open(os.path.join(SRC, 'CustodySync.gs'), encoding='utf-8').read())
    gl = server(open(os.path.join(SRC, 'GlLink.gs'), encoding='utf-8').read())
    gl = must(gl, "function glLinkId_() { return (PropertiesService.getScriptProperties().getProperty('GL_LINK_SS_ID') || '').trim(); }",
              "function glLinkId_() { var p = PropertiesService.getScriptProperties(); return (p.getProperty('GL_LINK_SS_ID') || p.getProperty('GL_SPREADSHEET_ID') || '').trim(); }   // (H4) نفس ملف الحسابات العامة للمشروع")
    out['HB_GlLink.gs'] = gl
    # الواجهة
    app = open(os.path.join(SRC, 'App.html'), encoding='utf-8').read()
    app = ident(app, [('getAppVersion', 'hbGetAppVersion')])
    app = must(app, "var SESSION_TOKEN_KEY_ = 'umrah_session_token';", "var SESSION_TOKEN_KEY_ = 'hb_session_token';   // (H4) لا يختلط بجلسة برنامج العمرة")
    app = must(app, 'var INITIAL_PAGE = "<?!= initialPage ?>";', 'var INITIAL_PAGE = "<?!= initialPage ?>";\nvar SSO_CODE = "<?!= ssoCode ?>";   // (H4) دخول موحّد من برنامج العمرة (رمز لمرة واحدة)')
    # (V4.245) وضع التضمين: برنامج الحجوزات كاملاً داخل شاشة «🏨 الفنادق والحجوزات» ببرنامج العمرة — كل الشاشات
    # والأزرار والفلاتر كما هي؛ يُخفى شريط تنقّله فقط (التنقّل من تبويبات برنامج العمرة عبر postMessage)
    app = must(app, 'var SSO_CODE = "<?!= ssoCode ?>";', 'var SSO_CODE = "<?!= ssoCode ?>";\n'
      'var HB_EMBED = "<?!= embed ?>" === \'1\';\n'
      'var HB_SEC = "<?!= hbSec ?>";\n'
      + HB_EMBED_JS)
    app = must(app, "  document.getElementById('page-' + key).classList.add('active');",
      "  document.getElementById('page-' + key).classList.add('active');\n"
      "  if (typeof HB_EMBED !== 'undefined' && HB_EMBED && typeof hbPost_ === 'function') { try { hbPost_({ hbPage: key }); } catch (eP) {} }")
    app = must(app, "function onAuthSuccess_(token, user, sessionMinutes) {\n  currentSessionToken = token; currentUser = user;",
      "function onAuthSuccess_(token, user, sessionMinutes) {\n  currentSessionToken = token; currentUser = user;\n"
      "  if (typeof HB_EMBED !== 'undefined' && HB_EMBED && typeof hbEmbedReady_ === 'function') setTimeout(hbEmbedReady_, 0);   // (V4.248) إخفاء «جارٍ الفتح…»")
    app = must(app, "  var wanted = ['statement','bookings','arrivals','payments','import','settings','users'].indexOf(INITIAL_PAGE) !== -1 ? INITIAL_PAGE : 'statement';",
      "  var wanted = ['statement','bookings','arrivals','payments','import','settings','users','statsReport','clientPortal','changelog'].indexOf(INITIAL_PAGE) !== -1 ? INITIAL_PAGE : 'statement';")
    app = must(app, "  if (stored) {\n    google.script.run.withSuccessHandler(function (res) {\n      if (res && res.ok) onAuthSuccess_(stored, res.user, res.sessionMinutes);",
      "  if (SSO_CODE) {\n"
      "    google.script.run.withSuccessHandler(function (res) {\n"
      "      if (res && res.ok) { try { sessionStorage.setItem(SESSION_TOKEN_KEY_, res.token); } catch (ex) {} onAuthSuccess_(res.token, res.user, res.sessionMinutes); }\n"
      "      else { var er = document.getElementById('loginErr'); if (er) er.textContent = (res && res.error) || 'تعذّر الدخول الموحّد — سجّل الدخول يدويًا'; if (HB_EMBED) hbEmbedFail_((res && res.error) || 'تعذّر الدخول الموحّد'); }\n"
      "    }).withFailureHandler(function (err) { var er = document.getElementById('loginErr'); if (er) er.textContent = 'خطأ: ' + err.message; if (HB_EMBED) hbEmbedFail_(err.message); }).hbSsoLogin(SSO_CODE);\n"
      "  } else if (stored) {\n    google.script.run.withSuccessHandler(function (res) {\n      if (res && res.ok) onAuthSuccess_(stored, res.user, res.sessionMinutes);")
    app = must(app, '      <button data-page="settings">⚙ الإعدادات</button>\n    </div>',
      '      <button data-page="settings">⚙ الإعدادات</button>\n'
      '      <button type="button" class="hb-back-umrah" onclick="window.open(APP_BASE_URL || \'/\', \'_top\')" title="العودة لبرنامج العمرة">↩ برنامج العمرة</button>\n    </div>')
    # (H4) تنسيق صفحة «الإحصائيات الشاملة» فقط بهوية برنامج العمرة (الكحلي + خط Cairo للعناوين) — بقية الشاشات
    # (كشف الحساب وغيره) تبقى بشكلها تماماً كما طُلب. رؤوس الجداول لا تُمسّ.
    app = must(app, '\n</head>', '''\n<style id="hb-umrah-theme">
  #page-statsReport { --brand:#1e3d59; --brand-dark:#14293d; --brand-soft:#e3ecf5; }
  #page-statsReport .gpage-title { font-family:'Cairo','Tajawal',Arial,sans-serif; color:#1e3d59; font-weight:800; }
  #page-statsReport .gpanel, #page-statsReport .stat { border-radius:12px; box-shadow:0 1px 3px rgba(30,61,89,.08); }
  #page-statsReport .stat .v { font-family:'Cairo','Tajawal',Arial,sans-serif; }
  #page-statsReport .stat { border-top:3px solid #1e3d59; }
  .app-nav .links .hb-back-umrah { background:#1e3d59; color:#fff; border-radius:8px; }
  html.hb-embed .app-nav-row1, html.hb-embed #navUserBox, html.hb-embed #loginScreen, html.hb-embed #mobileTabs { display:none !important; }
  html.hb-embed #page-payments button[onclick*="Modal"] { display:none !important; }   /* كل المدفوعات: عرض فقط */
  html.hb-embed .app-nav { padding-top:4px !important; padding-bottom:4px !important; }
  html.hb-sec .app-nav, html.hb-sec .hb-back-umrah { display:none !important; }
  html.hb-sec #page-settings .shell { padding-top:4px !important; }
  #hbEmbedLoad { position:fixed; inset:0; z-index:2147483000; background:#f4f6f9; display:grid; place-items:center; font-family:'Cairo','Tajawal',Tahoma,sans-serif; direction:rtl; }
  #hbEmbedLoad .hbel-box { display:grid; gap:10px; justify-items:center; color:#1e3d59; font-weight:700; text-align:center; max-width:420px; padding:0 16px; }
  #hbEmbedLoad .hbel-box span { color:#5b6b7b; font-weight:600; }
  #hbEmbedLoad button { background:#1e3d59; color:#fff; border:0; border-radius:8px; padding:6px 16px; font-weight:700; cursor:pointer; }
  .hbel-spin { width:30px; height:30px; border-radius:50%; border:3px solid #e3e9f0; border-top-color:#e0b043; animation:hbelS 1s linear infinite; }
  @keyframes hbelS { to { transform:rotate(360deg); } }
</style>
</head>''')
    out['HB_App.html'] = app
    portal = open(os.path.join(SRC, 'Portal.html'), encoding='utf-8').read()
    out['HB_Portal.html'] = ident(portal, [('getAppVersion', 'hbGetAppVersion')])
    for t in TEMPLATES[2:]:
        out['HB_' + t + '.html'] = open(os.path.join(SRC, t + '.html'), encoding='utf-8').read()
    for name, content in out.items():
        with open(os.path.join(ROOT, name), 'w', encoding='utf-8') as f: f.write(content)
        print('✓', name, len(content))

if __name__ == '__main__':
    build()
