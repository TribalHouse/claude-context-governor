# Security Policy

## Reporting a vulnerability

**Don't open a public issue.** Use [GitHub's private vulnerability reporting](https://github.com/TribalHouse/claude-context-governor/security):

1. Open the repo's Security tab.
2. Click **Report a vulnerability**.
3. Include: impact, repro steps or PoC, affected versions, and whether you want credit in the fix.

Acknowledgement within 72 hours. Fix or mitigation plan within 7 days for confirmed issues. CVE request if severity warrants it.

## Scope

In scope:

- The aggregator (`index.mjs`): MCP traffic, secret handling, child process management.
- The installer (`install.mjs`): files written outside its own directory.
- The routing hook (`hooks/route-prompt.mjs`): prompt-injection concerns.
- Skill CLIs (`skill-*`).
- Log redaction (`SECRET_PATTERNS` in `index.mjs`).

Out of scope:

- Bugs in third-party MCP backends. Report upstream.
- Bugs in `@modelcontextprotocol/sdk`. Report to Anthropic.
- User misconfiguration: putting a raw secret in `registry.json` instead of using `${ENV_VAR}` placeholders.

## Supported versions

`main` and the latest tagged release.

## Hardening notes

- Use `${ENV_VAR}` placeholders for every secret. Never paste a token into `registry.json`.
- `chmod 700 ~/.claude/context-governor` after install.
- `governor.log` caps at 2 MB and rotates once. Long-running setups should rotate further.
- The redactor strips `Bearer <token>`, JWTs, and `(token|key|secret|password|authorization)=value` patterns. Verify your backend's auth shape is covered before trusting log output.
- The routing hook regex-matches untrusted prompt text. It does not `eval` or `exec` anything. If you fork it, preserve that property.
