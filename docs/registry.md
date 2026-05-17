# Registry Guide

`registry.json` is the control plane inventory. Copy `registry.example.json` to `registry.json`, then add one top-level key per backend.

The top-level key is meaningful. Built-in intent tools appear only when their expected backend names exist:

- `serena` enables `gov.search_code`
- `context7` enables `gov.search_docs`
- `playwright` enables `gov.browser_task`
- any other enabled on-demand backend appears as a `gov.project_tool` target

## Lifecycle Modes

```json
{
  "playwright": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@playwright/mcp@latest"],
    "always_on": false,
    "idle_timeout_seconds": 300
  }
}
```

`always_on: false` means the governor starts the backend on the first call and disconnects after idle cleanup.

```json
{
  "serena": {
    "transport": "streamable-http",
    "endpoint": "http://127.0.0.1:12301/mcp",
    "always_on": true
  }
}
```

`always_on: true` is for shared services you manage outside the session, such as launchd-backed local HTTP MCP servers.

## Secrets

Put secrets in environment variables and reference them with `${ENV_VAR}` placeholders:

```json
{
  "private-api": {
    "transport": "streamable-http",
    "endpoint": "https://example.com/mcp",
    "headers": {
      "Authorization": "Bearer ${EXAMPLE_API_TOKEN}"
    }
  }
}
```

The governor expands placeholders at connect time. Secrets stay out of `registry.json`, logs, and audit events.

## Disabled Backends

```json
{
  "experimental": {
    "transport": "stdio",
    "command": "node",
    "args": ["experimental-mcp.js"],
    "disabled": true
  }
}
```

Disabled backends are not started, not listed, and calls to them return a clear disabled-backend error.
