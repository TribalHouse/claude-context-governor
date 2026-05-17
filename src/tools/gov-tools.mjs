export const INTENT_BACKENDS = {
  search_code: 'serena',
  search_docs: 'context7',
  browser_task: 'playwright',
};

export const GOV_TOOL_DEFS = {
  search_code: {
    name: 'gov.search_code',
    description: [
      `Search the codebase for symbols, definitions, references, and diagnostics. Routes to backend "${INTENT_BACKENDS.search_code}" — expects Serena's tool surface (find_symbol, find_referencing_symbols, get_symbols_overview, etc.).`,
      'mode=search → find_symbol (default)',
      'mode=overview → get_symbols_overview (all symbols in file or project)',
      'mode=references → find_referencing_symbols',
      'mode=diagnostics → get_diagnostics_for_file (requires file)',
      'mode=implementations → find_implementations',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Symbol name, search term, or description of what to find' },
        file: { type: 'string', description: 'Optional: restrict to this file path (relative to project root)' },
        symbol: { type: 'string', description: 'Optional: explicit symbol name (overrides query for symbol lookup)' },
        mode: {
          type: 'string',
          enum: ['search', 'symbol', 'overview', 'references', 'implementations', 'diagnostics'],
          description: 'Lookup strategy. Defaults to search (find_symbol).',
        },
      },
      required: ['query'],
    },
  },
  search_docs: {
    name: 'gov.search_docs',
    description: [
      `Look up documentation for any library, framework, or API. Routes to backend "${INTENT_BACKENDS.search_docs}" — expects Context7's tool surface (resolve-library-id + query-docs).`,
      'Automatically resolves the library ID then queries docs in one call.',
      'Examples: react/useEffect, supabase/row-level-security, nextjs/app-router',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        library: { type: 'string', description: 'Library or framework name (e.g. "react", "supabase", "nextjs", "typescript")' },
        topic: { type: 'string', description: 'Topic or question (e.g. "useEffect cleanup", "RLS policies", "middleware")' },
        version: { type: 'string', description: 'Optional version hint (e.g. "18", "2.x")' },
      },
      required: ['library', 'topic'],
    },
  },
  browser_task: {
    name: 'gov.browser_task',
    description: [
      `Run browser automation — navigation, screenshots, snapshots, interaction. Routes to backend "${INTENT_BACKENDS.browser_task}" — expects Playwright's tool surface (browser_navigate, browser_click, browser_fill, etc.). Starts on demand, stops after idle.`,
      'action=snapshot (default): navigate + return accessibility tree',
      'action=screenshot: navigate + take screenshot',
      'action=navigate: navigate only',
      'action=evaluate: run JS via params.script',
      'action=click: click element via params.selector',
      'action=fill: fill input via params.selector + params.value',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What to do in the browser (human-readable description)' },
        url: { type: 'string', description: 'Optional: URL to navigate to before the action' },
        action: {
          type: 'string',
          enum: ['snapshot', 'screenshot', 'navigate', 'evaluate', 'click', 'fill'],
          description: 'Browser action. Defaults to snapshot.',
        },
        params: { type: 'object', description: 'Action-specific params: selector, value, script, fullPage, etc.' },
      },
      required: ['task'],
    },
  },
};

export const GOV_TOOL_STATIC = [
  {
    name: 'gov.list_tools',
    description: 'List all available tools grouped by purpose. Shows gov.* tools and backend groups. Set show_backend_tools=true for full raw list.',
    inputSchema: {
      type: 'object',
      properties: {
        show_backend_tools: { type: 'boolean', description: 'If true, list all raw backend tool names (verbose)' },
        filter: { type: 'string', description: 'Optional: filter by backend name or keyword' },
      },
    },
  },
  {
    name: 'gov.tool_status',
    description: 'Show running/stopped status of all MCP backends. Equivalent to --status CLI flag.',
    inputSchema: {
      type: 'object',
      properties: {
        backend: { type: 'string', description: 'Optional: show status for a single backend only' },
      },
    },
  },
  {
    name: 'gov.cleanup_idle',
    description: 'Stop any running on-demand backend processes. Never stops shared (always_on) services.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'If true, stop all on-demand backends even if recently used' },
      },
    },
  },
];

export function buildGovTools(registry) {
  const registeredBackends = new Set(
    Object.entries(registry)
      .filter(([k, v]) => !k.startsWith('_') && !v.disabled)
      .map(([k]) => k)
  );

  const tools = [];
  for (const [key, backendName] of Object.entries(INTENT_BACKENDS)) {
    if (registeredBackends.has(backendName)) tools.push(GOV_TOOL_DEFS[key]);
  }

  const intentCovered = new Set(Object.values(INTENT_BACKENDS));
  const projectTargets = [...registeredBackends]
    .filter(name => !registry[name].always_on && !intentCovered.has(name))
    .sort();

  if (projectTargets.length > 0) {
    tools.push({
      name: 'gov.project_tool',
      description: [
        `Access on-demand backends by name. Currently registered: ${projectTargets.join(', ')}.`,
        'Starts the backend on demand. Stops after idle.',
        'If tool is omitted: lists available tools for the target (from cache — no backend startup if cache populated).',
        'If tool is provided: calls target__tool with args.',
        'Example: target=github tool=list_pull_requests args={owner:"org",repo:"name"}',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', enum: projectTargets, description: 'Which backend to use' },
          tool: { type: 'string', description: 'Optional: specific tool name without prefix. If omitted, lists available tools.' },
          args: { type: 'object', description: 'Optional: arguments to pass to the tool' },
        },
        required: ['target'],
      },
    });
  }

  tools.push(...GOV_TOOL_STATIC);
  return tools;
}
