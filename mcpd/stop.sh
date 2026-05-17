#!/usr/bin/env bash
# Stop shared always_on backends managed by launchd.

set -euo pipefail

REGISTRY="$HOME/.claude/context-governor/registry.json"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

services=$(node -e "
  const r = require('$REGISTRY');
  console.log(Object.entries(r)
    .filter(([k,v]) => !k.startsWith('_') && v.always_on)
    .map(([k]) => k).join('\n'));
")

for name in $services; do
  plist="$LAUNCH_AGENTS/com.claude.mcpd.${name}.plist"
  label="com.claude.mcpd.${name}"

  if ! launchctl list 2>/dev/null | awk '{print $3}' | grep -q "^${label}$"; then
    echo "[$name] not loaded"
    continue
  fi

  if [ -f "$plist" ]; then
    launchctl unload "$plist" && echo "[$name] unloaded" || echo "[$name] unload failed"
  else
    # plist missing but label is loaded — use remove fallback
    launchctl remove "$label" 2>/dev/null && echo "[$name] removed (plist missing)" || echo "[$name] remove failed"
  fi
done
