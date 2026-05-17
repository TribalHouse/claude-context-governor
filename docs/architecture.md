# Architecture

Context Governor is intentionally split into small runtime surfaces:

```text
index.mjs              CLI and MCP server entrypoint
src/cli/               command-surface extraction point
src/install/           installer extraction point
src/lifecycle/         backend lifecycle extraction point
src/mcp/               MCP naming and passthrough conventions
src/routing/           prompt-router classification logic
src/security/          secret redaction and env-var expansion
src/registry/          registry parsing and backend filtering
src/skills/            active/inactive skill filesystem lifecycle
src/tools/             gov.* tool definitions and tool-list visibility helpers
src/logging/           JSONL audit trail
src/measure/           token-estimation helpers
types/                 TypeScript contract declarations
lib/                   compatibility exports used by existing CLIs/tests
hooks/                 Claude Code prompt-routing hook
mcpd/                  macOS launchd helper scripts
tests/                 unit and stdio runtime tests
```

The largest remaining file is `index.mjs` because it still owns MCP server wiring, backend connection lifecycle, and handler orchestration. Compatibility exports stay in `lib/` so existing CLIs and tests keep working while internals move under `src/`.
