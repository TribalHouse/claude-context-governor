#!/usr/bin/env bash
# Claude MCP Daemon — start shared always_on backends via launchd
#
# Reads always_on=true entries from ~/.claude/context-governor/registry.json,
# expects matching launchd plists at ~/Library/LaunchAgents/com.claude.mcpd.<name>.plist
# (generate them once with: install-services.sh).
#
# This is the canonical entry point. Do not run a duplicate background process.

set -euo pipefail

REGISTRY="$HOME/.claude/context-governor/registry.json"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

if [ ! -f "$REGISTRY" ]; then
  echo "✗ Registry not found: $REGISTRY" >&2
  exit 1
fi

# Extract always_on service names from registry.json
services=$(node -e "
  const r = require('$REGISTRY');
  console.log(Object.entries(r)
    .filter(([k,v]) => !k.startsWith('_') && v.always_on && !v.disabled)
    .map(([k]) => k).join('\n'));
")

if [ -z "$services" ]; then
  echo "No always_on backends in registry — nothing to start."
  exit 0
fi

for name in $services; do
  plist="$LAUNCH_AGENTS/com.claude.mcpd.${name}.plist"
  label="com.claude.mcpd.${name}"

  if [ ! -f "$plist" ]; then
    echo "[$name] plist missing: $plist"
    echo "        run install-services.sh to generate it"
    continue
  fi

  if launchctl list 2>/dev/null | awk '{print $3}' | grep -q "^${label}$"; then
    echo "[$name] already loaded"
    continue
  fi

  if launchctl load "$plist" 2>/dev/null; then
    echo "[$name] loaded"
  else
    echo "[$name] launchctl load failed — check plist syntax"
  fi
done
