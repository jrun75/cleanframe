#!/bin/bash
# Checks that CleanFrame is still installed on the TV and reinstalls it if it's gone.
# Runs every 10 minutes in the background (see scripts/install-watchdog.sh).
# It installs the last signed build saved by deploy-tv.sh, so it never needs your certificate password.
TV_IP="${TV_IP:-192.168.7.41}"
APP_ID="JayFrame01.CleanFrame"
SDB="$HOME/tizen-studio/tools/sdb"
TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
STORE="$HOME/Library/Application Support/CleanFrame"
STATE="$STORE/watchdog-state"
LOCK="$STORE/watchdog.lock"
mkdir -p "$STORE"

log() { echo "$(date '+%Y-%m-%d %H:%M') $*"; }
notify() {
  # One notification per kind per day, so a problem doesn't nag every 10 minutes.
  local kind="$1" msg="$2" stamp; stamp="$kind $(date +%F)"
  grep -qxF "$stamp" "$STATE" 2>/dev/null && return
  echo "$stamp" >> "$STATE"
  osascript -e "display notification \"$msg\" with title \"CleanFrame\"" >/dev/null 2>&1 || true
}

mkdir "$LOCK" 2>/dev/null || exit 0          # another check is still running
trap 'rmdir "$LOCK"' EXIT

# Keep the log short.
LOGF="$HOME/Library/Logs/CleanFrame/watchdog.log"
[ -f "$LOGF" ] && [ "$(wc -l < "$LOGF")" -gt 2000 ] && tail -n 500 "$LOGF" > "$LOGF.tmp" && mv "$LOGF.tmp" "$LOGF"

# Is the TV awake with Developer Mode on?
if ! nc -z -G 3 "$TV_IP" 26101 >/dev/null 2>&1; then
  if curl -s -m 3 "http://$TV_IP:8001/api/v2/" >/dev/null 2>&1; then
    log "TV is on but its developer connection is closed (Developer Mode may be off)."
    notify devmode "The TV's Developer Mode looks off, so CleanFrame can't be checked. Turn it on in Apps > App Settings (12345)."
  fi
  exit 0                                      # TV is off or asleep; try again later
fi

"$SDB" connect "$TV_IP:26101" >/dev/null 2>&1
TARGET="$("$SDB" devices | awk -v ip="$TV_IP" 'index($1, ip) == 1 && $2 == "device" {print $3; exit}')"
[ -n "$TARGET" ] || { log "TV answered but sdb couldn't attach."; exit 0; }

if "$SDB" -s "$TV_IP:26101" shell 0 vd_applist 2>/dev/null | grep -q "$APP_ID"; then
  exit 0                                      # all good, stay quiet
fi

log "CleanFrame is missing from the TV. Reinstalling."
if [ ! -f "$STORE/CleanFrame.wgt" ]; then
  log "No saved build yet. Run scripts/deploy-tv.sh once."
  notify nobuild "CleanFrame is missing from the TV. Run deploy-tv.sh once so it can be restored automatically."
  exit 1
fi
OUT="$("$TIZEN" install -n CleanFrame.wgt -t "$TARGET" -- "$STORE" 2>&1)"
if echo "$OUT" | grep -q "install completed"; then
  log "Reinstalled CleanFrame."
  notify reinstalled "CleanFrame was missing from the TV, so it was reinstalled."
else
  log "Reinstall failed: $(echo "$OUT" | tail -n 3 | tr '\n' ' ')"
  notify failed "CleanFrame is missing from the TV and couldn't be reinstalled. Run deploy-tv.sh."
  exit 1
fi
