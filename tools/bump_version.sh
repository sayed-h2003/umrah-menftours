#!/bin/sh
# usage: tools/bump_version.sh 4.410  — يضبط رقم الإصدار بالخادم (Code.gs) والواجهة (index_web.html) معاً
set -e; V="$1"; [ -n "$V" ] || { echo "usage: $0 4.410"; exit 1; }
cd "$(dirname "$0")/.."
sed -i "s/var APP_VERSION = \"[0-9.]*\"/var APP_VERSION = \"$V\"/" Code.gs
sed -i "s/var CLIENT_APP_VERSION = \"[0-9.]*\"/var CLIENT_APP_VERSION = \"$V\"/; s/إصدار الواجهة: V[0-9.]* /إصدار الواجهة: V$V /" index_web.html
grep -n "APP_VERSION = " Code.gs index_web.html | cut -c1-80
