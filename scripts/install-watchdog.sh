#!/bin/bash
# Run once (no sudo): ~/Developer/CleanFrame/scripts/install-watchdog.sh
# Checks the TV every 10 minutes while you're logged in to this Mac and reinstalls CleanFrame if it disappears.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.cleanframe.watchdog"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
STORE="$HOME/Library/Application Support/CleanFrame"
LOGDIR="$HOME/Library/Logs/CleanFrame"
mkdir -p "$HOME/Library/LaunchAgents" "$STORE" "$LOGDIR"
chmod +x "$DIR/tv-watchdog.sh"

# Save the current signed build, if there is one, so the watchdog has something to install.
if [ -f "$DIR/../build/CleanFrame.wgt" ]; then cp "$DIR/../build/CleanFrame.wgt" "$STORE/CleanFrame.wgt"; fi

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/tv-watchdog.sh</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>600</integer>
  <key>StandardOutPath</key><string>$LOGDIR/watchdog.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/watchdog.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "The TV watchdog is on. It checks every 10 minutes and reinstalls CleanFrame if it's missing."
[ -f "$STORE/CleanFrame.wgt" ] || echo "Run scripts/deploy-tv.sh once so it has a build to reinstall."
echo "Log: $LOGDIR/watchdog.log"
