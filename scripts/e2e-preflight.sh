#!/bin/sh
# Playwright validates webServer.url BEFORE running webServer.command and
# errors with reuseExistingServer:false, so stale listeners must be cleared
# here. The firebase emulator CLI is killed by Playwright at run end but its
# java child can survive and keep :8082/:9100/:9199 bound. test:rules shares
# the firestore port (8082) via firebase.json, so it runs this too.
set -u
for p in $(lsof -nP -iTCP:8082 -iTCP:9100 -iTCP:9199 -sTCP:LISTEN -t 2>/dev/null); do
  kill -9 "$p" 2>/dev/null || true
done
exit 0
