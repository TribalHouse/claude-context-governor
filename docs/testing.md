# Testing And Verification

Run the full gate:

```bash
npm run verify
```

That command runs:

- `npm test`
- `npm run bench`
- fixture-based `context-governor measure`
- installer dry-run against a temp Claude home

## Test Groups

```bash
npm run test:unit
npm run test:runtime
```

`test:unit` covers registry parsing, env-var expansion, secret redaction, tool-list filtering, measurement output, prompt routing, skill state transitions, and installer dry-run behavior.

`test:runtime` starts the governor over stdio and routes calls through `tests/fixtures/fake-stdio-mcp.mjs`. It covers:

- enabled backend exposure as a `gov.project_tool` target
- disabled backend filtering
- on-demand stdio startup
- successful tool calls
- timeout and disconnect behavior
- disabled-backend call blocking
- audit CLI output

## Benchmark Honesty

`npm run bench` regenerates `benchmarks/results/fixture-mcp-tool-catalog.*`. The fixture benchmark is intentionally allowed to produce negative savings. The goal is reproducible evidence, not flattering output.
