#!/usr/bin/env bash
# Status of shared always_on MCP services under launchd.
# Reads service list from ~/.claude/context-governor/registry.json (no hardcoded names).

set -euo pipefail

REGISTRY="$HOME/.claude/context-governor/registry.json"

if [ ! -f "$REGISTRY" ]; then
  echo "✗ Registry not found: $REGISTRY" >&2
  exit 1
fi

# Parse: for each always_on backend, emit "name<TAB>endpoint"
services=$(node -e "
  const r = require('$REGISTRY');
  for (const [k,v] of Object.entries(r)) {
    if (k.startsWith('_') || !v.always_on || v.disabled) continue;
    const ep = v.endpoint || '';
    console.log(k + '\t' + ep);
  }
")

echo ""
echo "=== Shared MCP Services (always_on) ==="

while IFS=$'\t' read -r name endpoint; do
  [ -z "$name" ] && continue
  label="com.claude.mcpd.${name}"
  launchd_pid=$(launchctl list 2>/dev/null | awk -v n="$label" '$3 == n {print $1}')

  if [ -n "$launchd_pid" ] && [ "$launchd_pid" != "-" ] && [ "$launchd_pid" -gt 0 ] 2>/dev/null; then
    mem=$(ps -o %mem= -p "$launchd_pid" 2>/dev/null | tr -d ' ')
    echo "  $name: RUNNING (pid=$launchd_pid mem=${mem}%)"
    if [ -n "$endpoint" ]; then
      port=$(echo "$endpoint" | sed -E 's|.*:([0-9]+).*|\1|')
      if [ -n "$port" ]; then
        nc -z -w1 127.0.0.1 "$port" 2>/dev/null \
          && echo "    port $port: reachable" \
          || echo "    port $port: UNREACHABLE"
      fi
    fi
  else
    echo "  $name: STOPPED"
    echo "        start with: launchctl load ~/Library/LaunchAgents/${label}.plist"
  fi
done <<< "$services"

echo ""
echo "=== On-demand backends ==="
echo "  (managed by governor process; live state via the governor's --status)"
node "$HOME/.claude/context-governor/index.mjs" --status 2>/dev/null | sed -n '/on-demand/,$p' | head -50
