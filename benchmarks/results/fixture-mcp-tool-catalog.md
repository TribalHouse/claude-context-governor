# Context Governor Benchmark: Fixture MCP Tool Catalog

This benchmark compares a representative multi-MCP Claude Code settings file against the governor registry shape.

Caveat: this is a heuristic fixture benchmark, not a live Claude usage run. It reports projected context pressure and should be paired with real task-quality checks before making broad savings claims.

```text
Baseline:
3 MCP servers, 10 tools, estimated 106 tokens
0 skills, estimated 0 tokens

Governor:
1 MCP entry, 13 gov/backend tools, estimated 132 tokens
0 active skills, estimated 0 tokens

Estimated saved: -26 tokens / session
```

Quality notes:
- No task-quality claim is made by this fixture.
- The next benchmark layer should run fake and real MCP calls through the stdio harness and record timeout/disconnect behavior.
