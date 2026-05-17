<!-- One thing per PR. Smaller is easier to review and merge. -->

## What this changes

<!-- One paragraph. What does this PR do? -->

## Why

<!-- One paragraph. What problem does it solve? Link the issue if there is one. Closes #N -->

## How to verify

```bash
# Commands a reviewer can run to see this working
```

## Checklist

- [ ] One thing per PR (no drive-by refactors)
- [ ] Smoke tests pass: `node index.mjs --status && node install.mjs --dry-run`
- [ ] README updated if a public-facing flag, env var, or behavior changed
- [ ] "What this is NOT" section in the README is still accurate after this change
- [ ] No marketing language in code, docs, or commit messages
- [ ] No fake metrics or unverifiable claims
- [ ] Commit message follows `type(scope): subject` convention

## Scope check

This PR keeps Context Governor as plumbing:

- [ ] It does not bundle an MCP backend
- [ ] It does not bundle a skill
- [ ] It does not force a workflow opinion on the user
- [ ] It does not bloat startup context

If any of these are unchecked, explain why this is the right place for the change.
