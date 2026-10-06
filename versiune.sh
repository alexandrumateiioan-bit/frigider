#!/bin/sh
# Schimbă numărul de versiune din toate legăturile (?v=N), ca telefoanele
# să descarce fișierele noi imediat, nu după ce expiră copia din cache.
# Folosire: ./versiune.sh 4
set -e
[ -n "$1" ] || { echo "Folosire: ./versiune.sh NUMAR"; exit 1; }
sed -i -E "s/\?v=[0-9]+/?v=$1/g" index.html js/*.js
grep -c "?v=$1" index.html js/*.js
