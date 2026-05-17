# Contributing

This is a small, focused tool. Contributions that keep it that way are most welcome.

## Three rules

1. **Honest scope.** If a feature claims to do X, the code must do X.
2. **Lean context.** New features should not bloat session startup cost.
3. **No batteries.** We route and govern. We don't ship MCP backends, skills, or workflow opinions.

If your idea conflicts with any of these, open a [discussion](https://github.com/TribalHouse/claude-context-governor/discussions) first.

## Dev setup

```bash
git clone https://github.com/TribalHouse/claude-context-governor
cd claude-context-governor
npm install
```

Wire your local checkout into Claude Code:

```jsonc
{
  "mcpServers": {
    "context-governor-dev": {
      "command": "node",
      "args": ["/absolute/path/to/your/checkout/index.mjs"]
    }
  }
}
```

## Smoke tests

```bash
node index.mjs --status            # backend state table
node index.mjs --refresh-tools     # connect every enabled backend once

./skill-status                     # active + inactive
./skill-use <name-or-alias>        # resolve and enable

echo '{"user_prompt":"design the billing schema"}' \
  | node hooks/route-prompt.mjs
# emits a [ROUTING ADVICE: opus ...] line
```

CI runs the same checks on Node 18/20/22 across Ubuntu and macOS. See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

A mock-MCP test harness is on the roadmap.

## Pull requests

The full checklist is in the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Short version: one thing per PR, smoke tests pass, README updated if you change a public-facing flag, no marketing language.

## Commit messages

`type(scope): subject`. Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.

```
fix(skill-disable): read _protected from registry instead of bash array
feat(routing): add HAIKU_PATTERNS for log/diagnostic prompts
docs(readme): add architecture diagram
```

## Reporting issues

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). It asks for Node version, OS, `--status` output, and relevant lines from `governor.log` (secrets are auto-redacted).

## Security

Don't open public issues for vulnerabilities. Use [GitHub's private vulnerability reporting](https://github.com/TribalHouse/claude-context-governor/security). See [SECURITY.md](./SECURITY.md).

## License

Contributions are licensed under the MIT License. See [LICENSE](./LICENSE).
