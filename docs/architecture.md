# Architecture

Context Governor is intentionally split into small runtime surfaces:

```text
index.mjs              CLI and MCP server entrypoint
src/security/          secret redaction and env-var expansion
src/registry/          registry parsing and backend filtering
src/tools/             tool-list visibility helpers
src/logging/           JSONL audit trail
src/measure/           token-estimation helpers
lib/                   compatibility exports used by existing CLIs/tests
hooks/                 Claude Code prompt-routing hook
mcpd/                  macOS launchd helper scripts
tests/                 unit and stdio runtime tests
```

The largest remaining file is `index.mjs` because it still owns MCP server wiring and tool handlers. The next structural step is to move backend connection/lifecycle code and `gov.*` handlers into `src/runtime/` and `src/tools/` modules.
