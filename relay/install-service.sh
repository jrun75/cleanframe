#!/bin/bash
# Run once with: sudo ~/Developer/CleanFrame/relay/install-service.sh
# Installs the upload relay as a background service that starts when the Mac boots
# (no login needed), restarts itself if it ever stops, and keeps the Mac awake.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Please run this with sudo:"; echo "  sudo $0"; exit 1; }
USER_NAME="${SUDO_USER:-}"
[ -n "$USER_NAME" ] && [ "$USER_NAME" != root ] || { echo "Run it with sudo from your own account."; exit 1; }
USER_HOME="$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory | awk '{print $2}')"
DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.cleanframe.relay"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
LOGDIR="$USER_HOME/Library/Logs/CleanFrame"

chmod +x "$DIR/run.sh"
mkdir -p "$LOGDIR" && chown "$USER_NAME" "$LOGDIR"
NODE="$(sudo -u "$USER_NAME" HOME="$USER_HOME" "$DIR/run.sh" --which-node)"
[ -x "$NODE" ] || { echo "Couldn't find Node.js for $USER_NAME."; exit 1; }
echo "Using Node at $NODE"

# Stop a relay you may have running in Terminal, so the service can take the port.
pkill -u "$USER_NAME" -f "relay/server.js" 2>/dev/null || true

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>UserName</key><string>$USER_NAME</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/run.sh</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>HOME</key><string>$USER_HOME</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGDIR/relay.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/relay.log</string>
</dict>
</plist>
PLIST
chown root:wheel "$PLIST" && chmod 644 "$PLIST"

launchctl bootout "system/$LABEL" 2>/dev/null || true
sleep 1
launchctl bootstrap system "$PLIST"
launchctl enable "system/$LABEL"

# Let Node accept connections if the macOS firewall is on.
FW=/usr/libexec/ApplicationFirewall/socketfilterfw
if "$FW" --getglobalstate 2>/dev/null | grep -qi enabled; then
  "$FW" --add "$NODE" >/dev/null && "$FW" --unblockapp "$NODE" >/dev/null && echo "Firewall: allowed Node."
fi

# Never sleep, wake for network access, and start again after a power cut.
pmset -a sleep 0 disksleep 0 womp 1 autorestart 1
echo "Power: the Mac will stay awake and restart after a power cut."

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -m 2 -X POST http://127.0.0.1:4796/api/sessions >/dev/null; then
    echo; echo "The upload relay is running and will start on its own from now on."
    echo "Log: $LOGDIR/relay.log"; exit 0
  fi
  sleep 1
done
echo; echo "The service is installed but didn't answer yet. Check the log: $LOGDIR/relay.log"; exit 1
