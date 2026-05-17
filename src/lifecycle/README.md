# Backend Lifecycle

`index.mjs` still owns live MCP client connection orchestration today. This
directory is reserved for moving stdio, SSE, HTTP, idle cleanup, timeout, and
disconnect behavior behind a smaller lifecycle API.
