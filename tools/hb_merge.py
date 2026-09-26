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

def build():
    out = {}
    code = server(open(os.path.join(SRC, 'Code.gs'), encoding='utf-8').read())
    code = must(code, "if (!_SS_MEMO_) _SS_MEMO_ = SpreadsheetApp.getActiveSpreadsheet();",
                "if (!_SS_MEMO_) _SS_MEMO_ = hbProgramSS_();   // (H4) ملف بيانات الحجوزات بمعرّفه — المشروع الآن مرتبط بشيت العمرة")
    code = must(code, "  var initialPage = (e && e.parameter && e.parameter.page) || 'statement';",
                "  var initialPage = (e && e.parameter && (e.parameter.hp || (e.parameter.page !== 'hotels' ? e.parameter.page : ''))) || 'statement';")
    code = must(code, "    tmpl.initialPage = initialPage;\n",
                "    tmpl.initialPage = initialPage;\n    tmpl.ssoCode = String((e && e.parameter && e.parameter.sso) || '').replace(/[^\\w-]/g, '');\n")
    code = must(code, "        .setTitle('حجوزات وحسابات سكن')", "        .setTitle('حجوزات الفنادق — منف')")
    code = must(code, 'var HB_APP_VERSION = "', '// (H4) مدموج داخل مشروع برنامج العمرة — ملفات HB_*\nvar HB_APP_VERSION = "')
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
    app = must(app, "  if (stored) {\n    google.script.run.withSuccessHandler(function (res) {\n      if (res && res.ok) onAuthSuccess_(stored, res.user, res.sessionMinutes);",
      "  if (SSO_CODE) {\n"
      "    google.script.run.withSuccessHandler(function (res) {\n"
      "      if (res && res.ok) { try { sessionStorage.setItem(SESSION_TOKEN_KEY_, res.token); } catch (ex) {} onAuthSuccess_(res.token, res.user, res.sessionMinutes); }\n"
      "      else { var er = document.getElementById('loginErr'); if (er) er.textContent = (res && res.error) || 'تعذّر الدخول الموحّد — سجّل الدخول يدويًا'; }\n"
      "    }).withFailureHandler(function (err) { var er = document.getElementById('loginErr'); if (er) er.textContent = 'خطأ: ' + err.message; }).hbSsoLogin(SSO_CODE);\n"
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
