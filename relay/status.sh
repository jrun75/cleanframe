#!/bin/bash
# Quick health check: ~/Developer/CleanFrame/relay/status.sh
if curl -s -m 3 -X POST http://127.0.0.1:4796/api/sessions >/dev/null; then echo "Upload relay: running"; else echo "Upload relay: NOT answering"; fi
launchctl print system/com.cleanframe.relay 2>/dev/null | grep -E "state =|runs =|last exit" | sed 's/^\s*/  /' || echo "  (service not installed)"
echo "Last log lines:"; tail -n 5 "$HOME/Library/Logs/CleanFrame/relay.log" 2>/dev/null | sed 's/^/  /'
