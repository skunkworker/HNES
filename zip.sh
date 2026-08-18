#!/bin/bash
set -e

# One manifest in the tree, Chrome-shaped, because Chrome is what the test
# suites drive. The two builds cannot share a background key: Chrome has no
# event page and Firefox has no service worker (bug 1573659), and carrying both
# keys makes each browser warn about the other's. Firefox also has no offscreen
# permission and no minimum_chrome_version, so those go with it — the point is a
# package that loads without a warning in either store.
#
# To run the Firefox build unpacked: ./zip.sh, then about:debugging -> Load
# Temporary Add-on -> ../HNES-firefox.zip.

# Absolute, because the chrome package is zipped from the parent directory.
MANIFEST="$PWD/manifest.json"
BACKUP=$(mktemp)
cp "$MANIFEST" "$BACKUP"
trap 'cp "$BACKUP" "$MANIFEST"; rm -f "$BACKUP"' EXIT

python3 - <<'PY'
import json, collections
m = json.load(open('manifest.json'), object_pairs_hook=collections.OrderedDict)
m['background'] = collections.OrderedDict([('scripts', [m['background']['service_worker']])])
m['permissions'] = [p for p in m['permissions'] if p != 'offscreen']
m.pop('minimum_chrome_version', None)
json.dump(m, open('manifest.json', 'w'), indent=2)
PY

#package for firefox
zip -r -FS ../HNES-firefox.zip * -x \*.git\* *screenshots\* *proposals\* \*test\* *notes* *zip.sh* js/jquery-3.2.1.js

cp "$BACKUP" "$MANIFEST"

#package for chrome web store
cd ..
zip -r -FS HNES-chrome.zip HNES -x \*.git\* *screenshots* *proposals* \*test\* HNES/notes HNES/zip.sh HNES/js/jquery-3.2.1.js
