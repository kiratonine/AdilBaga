#!/bin/sh
# Forced SSH command + exact zero-argument sudo only. Not an admin shell.
set -eu
test "$#" -eq 0
exec /usr/bin/env -i PATH=/usr/local/go/bin:/usr/bin:/bin LANG=C.UTF-8 \
  /usr/bin/python3 -I -B /usr/local/libexec/aktau-sync-promotion/publisher-promotion.py
