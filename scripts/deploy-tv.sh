#!/bin/bash
# Build CleanFrame, sign it with your Samsung certificate, install it on the TV and open it.
# Usage: ~/Developer/CleanFrame/scripts/deploy-tv.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TV_IP="${TV_IP:-192.168.7.41}"
PROFILE="${PROFILE:-CleanFrame}"
APP_ID="JayFrame01.CleanFrame"
TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
SDB="$HOME/tizen-studio/tools/sdb"

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1"; exit 1; }

[ -x "$TIZEN" ] || fail "Tizen Studio isn't installed where expected ($TIZEN)."

step "1/4  Connecting to the TV at $TV_IP"
"$SDB" connect "$TV_IP:26101" >/dev/null 2>&1 || true
TARGET="$("$SDB" devices | awk -v ip="$TV_IP" 'index($1, ip) == 1 && $2 == "device" {print $3; exit}')"
if [ -z "$TARGET" ]; then
  fail "The TV didn't answer. Make sure it's on (not in Art Mode) and on Wi-Fi.
If it still fails, open Apps > App Settings on the TV, enter 12345, check Developer Mode is On
with Host PC IP set to this Mac, then unplug the TV at the wall for 10 seconds and try again."
fi
echo "Connected to $TARGET"

step "2/4  Building and signing"
rm -rf build && cp -R app build
"$TIZEN" package -t wgt -s "$PROFILE" -- build | tail -n 2
[ -f build/CleanFrame.wgt ] || fail "Packaging failed. Check the certificate profile \"$PROFILE\" in Tizen Studio's Certificate Manager."

step "3/4  Installing on the TV"
OUT="$("$TIZEN" install -n CleanFrame.wgt -t "$TARGET" -- build 2>&1)" || true
echo "$OUT" | grep -E "install completed|successfully installed|error|fail" || true
echo "$OUT" | grep -q "install completed" || fail "The TV didn't confirm the install. Full output:
$OUT"

step "4/4  Opening CleanFrame"
"$TIZEN" run -p "$APP_ID" -t "$TARGET" | grep -E "successfully launched|error" || true

printf '\n\033[32mDone. CleanFrame is updated on the TV.\033[0m\n'
