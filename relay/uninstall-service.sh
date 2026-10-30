#!/bin/bash
# Run with: sudo ~/Developer/CleanFrame/relay/uninstall-service.sh
[ "$(id -u)" = 0 ] || { echo "Please run this with sudo: sudo $0"; exit 1; }
launchctl bootout system/com.cleanframe.relay 2>/dev/null || true
rm -f /Library/LaunchDaemons/com.cleanframe.relay.plist
echo "The upload relay service is removed. (Power settings were left as they are.)"
