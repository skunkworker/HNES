#!/bin/bash

#package for firefox
zip -r -FS ../HNES-firefox.zip * -x \*.git\* *screenshots\* *proposals\* \*test\* *notes* *zip.sh* js/jquery-3.2.1.js

#package for chrome web store
cd ..
zip -r -FS HNES-chrome.zip HNES -x \*.git\* *screenshots* *proposals* \*test\* HNES/notes HNES/zip.sh HNES/js/jquery-3.2.1.js
