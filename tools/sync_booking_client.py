#!/usr/bin/env python3
"""ينسخ دوال التحقق وبناء التحركات من Code.gs إلى index_web.html (BKSRV_) حرفياً — المصدر الوحيد = Code.gs.
تشغيل:  python3 tools/sync_booking_client.py   (يُحدّث الكتلة بين العلامتين) · مع --check يفشل إن اختلفت."""
import re, sys
FUNCS = ['_noJunk_', '_fmtDT_', '_portSaudiSide_', '_deriveStaySegments_', 'validateMovementsLogic_', 'buildAllMovements_']
src = open('Code.gs', encoding='utf-8').read()
def grab(name):
    m = re.search(r'^function ' + re.escape(name) + r'\(', src, re.M)
    if not m: raise SystemExit('missing ' + name)
    i = m.start(); j = src.index('\n}\n', i) + 3
    return src[i:j]
body = '\n'.join(grab(n) for n in FUNCS)
block = ('<script>\n/*BKSRV_BEGIN — مولَّدة آلياً من Code.gs بـ tools/sync_booking_client.py (لا تُعدَّل يدوياً)*/\nwindow.BKSRV_ = (function () {\n'
         + body + '\nreturn { validate: validateMovementsLogic_, build: buildAllMovements_ };\n})();\n/*BKSRV_END*/\n</script>')
html = open('index_web.html', encoding='utf-8').read()
if '/*BKSRV_BEGIN' in html:
    new = re.sub(r'<script>\n/\*BKSRV_BEGIN.*?/\*BKSRV_END\*/\n</script>', lambda m: block, html, flags=re.S)
else:
    anchor = '<script>\n/* 📑 (V4.324) تبويبات داخل البرنامج'
    if anchor not in html: raise SystemExit('anchor missing')
    new = html.replace(anchor, block + '\n' + anchor, 1)
if '--check' in sys.argv:
    sys.exit(0 if new == html else 1)
open('index_web.html', 'w', encoding='utf-8').write(new)
print('ok', len(block))
