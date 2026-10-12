#!/bin/sh
# Owner installs this fixed root-owned wrapper; never execute an uploaded script.
set -eu
test "$#" -eq 0
exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 \
  /usr/bin/python3 -I -B /usr/local/lib/adilbaga-deploy/auto_broker.py
