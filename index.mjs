#!/usr/bin/env node
/**
 * Context Governor — intent-based MCP aggregator
 *
 * Claude Code connects to this single MCP. The governor exposes two layers:
 *
 * Layer 1 — high-level intent tools (gov.*)  ← Claude should prefer these
 *   gov.search_code      → Serena (code intelligence)
 *   gov.search_docs      → Context7 (library/framework docs)
 *   gov.browser_task     → Playwright (on-demand browser automation)
 *   gov.project_tool     → Supabase / Webflow / GitHub / Figma (on-demand)
 *   gov.list_tools       → discover available tools by category
 *   gov.tool_status      → backend running/stopped state
 *   gov.cleanup_idle     → kill idle on-demand processes
 *
 * Layer 2 — backend passthrough (backend__tool_name)  ← debug / escape hatch
 *   serena__*  context7__*  playwright__*  supabase__*  webflow__*  github__*
 *
 * Backend modes:
 *   always_on=true  → HTTP service managed by mcpd, reconnected at startup
 *   always_on=false → stdio process spawned on first call, killed after idle
 *   disabled=true   → never started, tools not listed
 *
 * CLI commands (skip MCP server):
 *   --status         print backend state table and exit
 *   --refresh-tools  connect every enabled backend, update tools_cache, exit
 *   --cleanup-idle   SIGTERM all running on-demand stdio processes and exit
 */

import fs from 'fs';
import net from 'net';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatAuditReport, readAuditEvents, writeAuditEvent } from './lib/audit.mjs';
import { expandHeaders, redact } from './lib/core.mjs';
import { collectMeasurement, formatMeasurement, parseMeasureArgs } from './lib/measure.mjs';
import { parsePrefix, prefixed } from './src/mcp/names.mjs';
import { buildGovTools } from './src/tools/gov-tools.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = process.env.CONTEXT_GOVERNOR_REGISTRY_PATH || path.join(__dirname, 'registry.json');
const LOG_PATH = process.env.CONTEXT_GOVERNOR_LOG_PATH || path.join(__dirname, 'governor.log');
const AUDIT_PATH = process.env.CONTEXT_GOVERNOR_AUDIT_PATH || path.join(__dirname, 'audit.jsonl');
const MCPD_PIDS_DIR = process.env.CONTEXT_GOVERNOR_MCPD_PIDS_DIR || path.join(path.dirname(__dirname), 'mcpd', 'pids');

if (process.argv[2] === 'measure') {
  const options = parseMeasureArgs(process.argv.slice(3));
  process.stdout.write(formatMeasurement(collectMeasurement(options)));
  process.exit(0);
}

if (process.argv[2] === 'audit') {
  process.stdout.write(formatAuditReport(readAuditEvents(AUDIT_PATH)));
  process.exit(0);
}

const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

// ─── Logging ────────────────────────────────────────────────────────────────

const LOG_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function rotateLogIfNeeded() {
  try {
    const stat = fs.statSync(LOG_PATH);
    if (stat.size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, LOG_PATH + '.1');
    }
  } catch {
    // file doesn't exist yet or stat failed — nothing to rotate
  }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${redact(msg)}`;
  process.stderr.write(line + '\n');
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {}
}

function audit(action, details = {}) {
  writeAuditEvent(AUDIT_PATH, { action, ...details });
}

// ─── Registry ───────────────────────────────────────────────────────────────

let registry;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
} catch (e) {
  process.stderr.write(`FATAL: cannot read registry.json: ${e.message}\n`);
  process.exit(1);
}

function saveRegistry() {
  try {
    const tmp = REGISTRY_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2));
    fs.renameSync(tmp, REGISTRY_PATH);
  } catch (e) {
    log(`Warning: could not save registry: ${e.message}`);
  }
}

// ─── Backend connections ────────────────────────────────────────────────────

// Map<name, { client, transport, tools, lastUsedAt, pid }>
const active = new Map();

// Expand ${ENV_VAR} placeholders in header values. Used so registry.json can
// reference env vars (e.g. "Authorization": "Bearer ${LAZYWEB_TOKEN}") without
// storing the secret in the file.
async function connect(name) {
  if (active.has(name)) {
    active.get(name).lastUsedAt = Date.now();
    return active.get(name).client;
  }

  const cfg = registry[name];
  if (!cfg || cfg.disabled) {
    audit('backend_blocked', { backend: name, reason: cfg?.disabled ? 'disabled' : 'unknown' });
    throw new Error(`Backend '${name}' is disabled or unknown`);
  }

  log(`Connecting: ${name} (${cfg.transport})`);
  audit('backend_connect_start', { backend: name, transport: cfg.transport });

  let transport;
  if (cfg.transport === 'streamable-http') {
    const opts = cfg.headers ? { requestInit: { headers: expandHeaders(cfg.headers, name, process.env, log) } } : undefined;
    transport = new StreamableHTTPClientTransport(new URL(cfg.endpoint), opts);
  } else if (cfg.transport === 'sse') {
    const opts = cfg.headers ? { requestInit: { headers: expandHeaders(cfg.headers, name, process.env, log) } } : undefined;
    transport = new SSEClientTransport(new URL(cfg.endpoint), opts);
  } else if (cfg.transport === 'stdio') {
    const env = { ...process.env };
    transport = new StdioClientTransport({ command: cfg.command, args: cfg.args || [], env });
  } else {
    throw new Error(`Unknown transport: ${cfg.transport}`);
  }

  const client = new Client(
    { name: 'context-governor', version: '1.0.0' },
    { capabilities: {} }
  );
  await client.connect(transport);

  const toolsResult = await client.listTools();
  const tools = toolsResult.tools || [];
  const toolNames = tools.map(t => t.name);

  if (toolNames.length > 0) {
    cfg.tools_cache = toolNames;
    saveRegistry();
  }

  const pid = transport.pid ?? null;
  active.set(name, { client, transport, tools, lastUsedAt: Date.now(), pid });
  log(`Connected: ${name} — ${tools.length} tools${pid ? ` (pid ${pid})` : ''}`);
  audit('backend_connected', { backend: name, transport: cfg.transport, tools: tools.length, pid });
  return client;
}

async function disconnect(name) {
  const entry = active.get(name);
  if (!entry) return;
  try { await entry.transport.close(); } catch {}
  active.delete(name);
  log(`Disconnected: ${name}`);
  audit('backend_disconnected', { backend: name });
}

// ─── Idle cleanup (runs every 60 s) ────────────────────────────────────────

setInterval(async () => {
  const now = Date.now();
  for (const [name, entry] of active.entries()) {
    const cfg = registry[name];
    if (!cfg || cfg.always_on) continue;
    const limit = (cfg.idle_timeout_seconds ?? 300) * 1000;
    if (now - entry.lastUsedAt > limit) {
      log(`Idle timeout: ${name}`);
      await disconnect(name).catch(() => {});
    }
  }
}, 60_000).unref();

// ─── Shared helpers ──────────────────────────────────────────────────────────

function mcpError(msg) {
  return { isError: true, content: [{ type: 'text', text: msg }] };
}

function mcpText(text) {
  return { content: [{ type: 'text', text }] };
}

function extractTextContent(result) {
  if (!result || !Array.isArray(result.content)) return '';
  return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
}

// callBackendTool: single entry point for all backend calls (gov.* and passthrough)
async function callBackendTool(backendName, toolName, args = {}) {
  const cfg = registry[backendName];
  if (!cfg) throw new Error(`Unknown backend: ${backendName}`);
  if (cfg.disabled) {
    audit('backend_blocked', { backend: backendName, tool: toolName, reason: 'disabled' });
    throw new Error(`Backend '${backendName}' is disabled`);
  }

  await connect(backendName);
  active.get(backendName).lastUsedAt = Date.now();
  audit('tool_call_start', { backend: backendName, tool: toolName });

  const client = active.get(backendName).client;
  const timeoutSec = cfg.call_timeout_seconds ?? 30;
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      audit('tool_call_timeout', { backend: backendName, tool: toolName, timeout_seconds: timeoutSec });
      reject(new Error(`timeout after ${timeoutSec}s`));
      disconnect(backendName).catch(() => {});
    }, timeoutSec * 1000);
  });

  try {
    const result = await Promise.race([
      client.callTool({ name: toolName, arguments: args }),
      timeoutPromise,
    ]);
    clearTimeout(timeoutHandle);
    audit('tool_call_success', { backend: backendName, tool: toolName });
    return result;
  } catch (e) {
    clearTimeout(timeoutHandle);
    audit('tool_call_error', { backend: backendName, tool: toolName, reason: e.message });
    if (e.message?.match(/not connected|ECONNREFUSED|ECONNRESET|closed|timeout/i)) {
      await disconnect(backendName).catch(() => {});
    }
    throw e;
  }
}

// ─── Process / port helpers (shared by CLI and gov.tool_status) ─────────────

function checkPort(host, port) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

function getMcpdPid(name) {
  try {
    const pid = parseInt(fs.readFileSync(path.join(MCPD_PIDS_DIR, `${name}.pid`), 'utf8').trim());
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function findProcessesByPattern(pattern) {
  try {
    // pgrep -f matches against the full command line; much faster than `ps aux | grep`
    const out = execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8', timeout: 5000 });
    return out.trim().split('\n')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n !== process.pid)  // exclude self
      .map(pid => ({ pid, cmd: '' }));
  } catch {
    // pgrep exits with code 1 (no match) or throws on timeout — both mean no processes found
    return [];
  }
}

function getPackagePattern(cfg) {
  if (cfg.transport !== 'stdio') return null;
  const packageArg = (cfg.args || []).find(
    a => (a.startsWith('@') || a.includes('-mcp') || a.includes('mcp-server')) && !a.startsWith('-')
  );
  if (packageArg) return packageArg.replace(/@latest|@\d+\.\d+.*/, '');
  return cfg.command;
}

// ─── Status report (async, returns string; used by CLI and gov.tool_status) ──

async function buildStatusReport(filter) {
  const W = 60;
  const lines = ['', 'Context Governor — Backend Status', '═'.repeat(W), ''];

  for (const [name, cfg] of Object.entries(registry)) {
    if (name.startsWith('_')) continue;
    if (filter && name !== filter) continue;

    lines.push(`  ${name}`);

    if (cfg.disabled) {
      lines.push(`    mode:      DISABLED`);
      if (cfg.notes) lines.push(`    notes:     ${cfg.notes}`);
      lines.push('');
      continue;
    }

    lines.push(`    mode:      ${cfg.always_on ? 'shared (always_on)' : 'on-demand'}`);

    if (cfg.transport === 'streamable-http' || cfg.transport === 'sse') {
      const url = new URL(cfg.endpoint);
      const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
      const running = await checkPort(url.hostname, port);
      lines.push(`    transport: ${cfg.transport} → ${cfg.endpoint}`);
      lines.push(`    running:   ${running ? 'YES' : 'NO (port unreachable)'}`);
      const pid = getMcpdPid(name);
      if (pid) lines.push(`    pid:       ${pid} (mcpd)`);
      lines.push(`    idle:      ∞ (always_on)`);
    } else if (cfg.transport === 'stdio') {
      const pattern = getPackagePattern(cfg);
      const procs = pattern ? findProcessesByPattern(pattern) : [];
      lines.push(`    transport: stdio`);
      lines.push(`    running:   ${procs.length > 0 ? `YES (${procs.length} process${procs.length !== 1 ? 'es' : ''})` : 'NO'}`);
      if (procs.length > 0) lines.push(`    pid(s):    ${procs.map(p => p.pid).join(', ')}`);
      if (active.has(name)) lines.push(`    session:   connected (pid ${active.get(name).pid ?? '?'})`);
      lines.push(`    idle:      ${cfg.idle_timeout_seconds ?? 300}s`);
    }

    const toolCount = Array.isArray(cfg.tools_cache) ? cfg.tools_cache.length : 0;
    lines.push(`    tools:     ${toolCount > 0 ? `${toolCount} (cached)` : 'none — run --refresh-tools'}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Idle cleanup (shared by CLI and gov.cleanup_idle) ──────────────────────

async function doCleanupIdle(force = false) {
  const killed = [];

  for (const [name, cfg] of Object.entries(registry)) {
    if (name.startsWith('_') || cfg.disabled || cfg.always_on) continue;
    if (cfg.transport !== 'stdio') continue;

    const pattern = getPackagePattern(cfg);
    if (!pattern) continue;

    const procs = findProcessesByPattern(pattern);
    for (const { pid } of procs) {
      try {
        process.kill(pid, 'SIGTERM');
        killed.push(`${name}(pid ${pid})`);
        log(`Cleanup: killed ${name} pid ${pid}`);
      } catch (e) {
        log(`Cleanup: could not kill ${name} pid ${pid}: ${e.message}`);
      }
    }

    if (active.has(name)) {
      await disconnect(name).catch(() => {});
      if (!killed.find(k => k.startsWith(name))) killed.push(`${name}(session)`);
    }
  }

  return killed;
}

// ─── Aggregate tool list ─────────────────────────────────────────────────────

function buildToolList() {
  // Gov tools always appear first so Claude encounters them before passthrough tools.
  // Built dynamically — intent tools whose backend isn't registered are hidden.
  const tools = buildGovTools(registry).map(t => ({ ...t }));

  // Only expose raw backend passthrough tools when explicitly enabled
  const settings = registry._settings || {};
  if (!(settings.exposePassthroughTools ?? false)) return tools;

  for (const [name, cfg] of Object.entries(registry)) {
    if (cfg.disabled || name.startsWith('_')) continue;

    if (active.has(name)) {
      for (const t of active.get(name).tools) {
        tools.push({
          ...t,
          name: prefixed(name, t.name),
          description: `[${name}] ${t.description ?? t.name}`,
        });
      }
    } else if (Array.isArray(cfg.tools_cache) && cfg.tools_cache.length > 0) {
      const label = cfg.always_on ? ' ⚠ offline' : ' (on-demand)';
      for (const toolName of cfg.tools_cache) {
        tools.push({
          name: prefixed(name, toolName),
          description: `[${name}${label}] ${cfg.description ?? name}`,
          inputSchema: { type: 'object', additionalProperties: true },
        });
      }
    }
  }

  return tools;
}

// ─── Gov tool handlers ────────────────────────────────────────────────────────

async function handleSearchCode({ query, file, symbol, mode = 'search' }) {
  const symbolName = symbol || query;
  try {
    switch (mode) {
      case 'overview':
        // get_symbols_overview requires a file/directory path
        if (!file) return mcpError(
          'gov.search_code: overview mode requires a file or directory path.\n' +
          'Provide: gov.search_code(query="...", file="path/to/file_or_dir", mode="overview")\n' +
          'For symbol search without a file, use mode="search" (default).'
        );
        return await callBackendTool('serena', 'get_symbols_overview', { relative_path: file });

      case 'references':
        return await callBackendTool('serena', 'find_referencing_symbols',
          { symbol_name: symbolName, ...(file ? { relative_path: file } : {}) });

      case 'implementations':
        return await callBackendTool('serena', 'find_implementations',
          { symbol_name: symbolName, ...(file ? { relative_path: file } : {}) });

      case 'diagnostics':
        if (!file) return mcpError('gov.search_code: diagnostics mode requires a file path');
        return await callBackendTool('serena', 'get_diagnostics_for_file', { relative_path: file });

      default: // 'search' | 'symbol'
        return await callBackendTool('serena', 'find_symbol',
          { name_path_pattern: symbolName, ...(file ? { relative_path: file } : {}) });
    }
  } catch (e) {
    log(`gov.search_code error: ${e.message}`);
    return mcpError(`gov.search_code failed: ${e.message}`);
  }
}

async function handleSearchDocs({ library, topic, version }) {
  try {
    // Ensure connected (needed for both calls)
    await connect('context7');
    const c7 = active.get('context7');

    // ── Step 1: resolve library ID ──────────────────────────────────────────
    // Context7 resolve tool: libraryName (the lib to find) + query (for relevance ranking)
    const libValue = version ? `${library}@${version}` : library;
    const resolveResult = await callBackendTool('context7', 'resolve-library-id', {
      libraryName: libValue,
      query: topic,   // helps Context7 rank results by relevance to the user's goal
    });
    const resolveText = extractTextContent(resolveResult);

    // Extract the first library ID (pattern: /org/name or /name/sub)
    const idMatch = resolveText.match(/\/[a-zA-Z0-9][a-zA-Z0-9\-_.]*(?:\/[a-zA-Z0-9][a-zA-Z0-9\-_.@]*)+/);
    if (!idMatch) {
      return { content: [{ type: 'text', text: `Could not auto-extract library ID. Resolve result:\n${resolveText}` }] };
    }
    const libraryId = idMatch[0];
    log(`gov.search_docs: "${library}" → "${libraryId}"`);

    // ── Step 2: query docs ──────────────────────────────────────────────────
    const queryTool = c7.tools.find(t => t.name === 'query-docs')
                   || c7.tools.find(t => t.name === 'get-library-docs')
                   || c7.tools.find(t => t.name !== 'resolve-library-id');
    if (!queryTool) return mcpError('Context7 docs query tool not found');

    // Context7 query-docs tool: libraryId + query (verified from live schema)
    const queryArgs = {
      libraryId,
      query: topic,
    };
    const qProps = queryTool.inputSchema?.properties || {};
    if (qProps.tokens) queryArgs.tokens = 5000;

    return await callBackendTool('context7', queryTool.name, queryArgs);
  } catch (e) {
    log(`gov.search_docs error: ${e.message}`);
    return mcpError(`gov.search_docs failed: ${e.message}`);
  }
}

async function handleBrowserTask({ task, url, action = 'snapshot', params = {} }) {
  try {
    // Navigate first when a URL is given (unless the action itself is navigate)
    if (url && action !== 'navigate') {
      await callBackendTool('playwright', 'browser_navigate', { url });
    }

    switch (action) {
      case 'navigate':
        if (!url) return mcpError('gov.browser_task: navigate action requires url');
        return await callBackendTool('playwright', 'browser_navigate', { url });

      case 'screenshot':
        return await callBackendTool('playwright', 'browser_take_screenshot', params);

      case 'evaluate': {
        const script = params.script || task;
        return await callBackendTool('playwright', 'browser_evaluate', { script });
      }

      case 'click':
        if (!params.element && !params.selector && !params.ref)
          return mcpError('gov.browser_task: click requires params.element, params.selector, or params.ref');
        return await callBackendTool('playwright', 'browser_click', params);

      case 'fill':
        if (!params.element && !params.selector)
          return mcpError('gov.browser_task: fill requires params.element or params.selector and params.value');
        return await callBackendTool('playwright', 'browser_fill', params);

      case 'snapshot':
      default:
        return await callBackendTool('playwright', 'browser_snapshot', {});
    }
  } catch (e) {
    log(`gov.browser_task error: ${e.message}`);
    return mcpError(`gov.browser_task failed: ${e.message}`);
  }
}

async function handleProjectTool({ target, tool, args = {} }) {
  const cfg = registry[target];
  if (!cfg) {
    audit('backend_blocked', { backend: target, reason: 'unknown' });
    return mcpError(`Unknown target "${target}". Available: supabase, webflow, github, figma`);
  }
  if (cfg.disabled) {
    audit('backend_blocked', { backend: target, reason: 'disabled' });
    return mcpError(`Backend '${target}' is disabled in registry.json`);
  }

  // No tool specified → list available tools without starting the backend
  if (!tool) {
    let toolLines;
    if (active.has(target)) {
      toolLines = active.get(target).tools.map(t =>
        `  ${t.name}${t.description ? ` — ${t.description.slice(0, 80)}` : ''}`
      );
    } else if (Array.isArray(cfg.tools_cache) && cfg.tools_cache.length > 0) {
      toolLines = cfg.tools_cache.map(t => `  ${t}`);
    } else {
      // Nothing cached: connect once to fetch
      await connect(target);
      toolLines = active.get(target).tools.map(t =>
        `  ${t.name}${t.description ? ` — ${t.description.slice(0, 80)}` : ''}`
      );
    }
    const mode = cfg.always_on ? 'always_on' : 'on-demand';
    return mcpText(
      `${target} tools (${mode}):\n${toolLines.join('\n')}\n\n` +
      `Usage: gov.project_tool(target="${target}", tool="<name>", args={...})`
    );
  }

  // Tool specified → call it
  try {
    return await callBackendTool(target, tool, args);
  } catch (e) {
    log(`gov.project_tool(${target}.${tool}) error: ${e.message}`);
    return mcpError(`gov.project_tool failed: ${e.message}`);
  }
}

function handleListTools({ show_backend_tools = false, filter } = {}) {
  audit('tool_list', { show_backend_tools, filter });
  const lines = ['', 'Context Governor — Available Tools', '═'.repeat(60), ''];

  lines.push('High-level intent tools (use these):');
  for (const t of buildGovTools(registry)) {
    if (filter && !t.name.includes(filter) && !t.description.includes(filter)) continue;
    lines.push(`  ${t.name}`);
    lines.push(`    ${t.description.split('\n')[0]}`);
  }
  lines.push('');

  if (show_backend_tools) {
    lines.push('Backend passthrough tools (debug / escape hatch):');
    const backendTools = buildToolList().filter(t => !t.name.startsWith('gov.'));
    for (const t of backendTools) {
      if (filter && !t.name.includes(filter)) continue;
      lines.push(`  ${t.name}`);
    }
    lines.push('');
  } else {
    lines.push('Backend groups (prefer gov.* tools above):');
    for (const [name, cfg] of Object.entries(registry)) {
      if (name.startsWith('_') || cfg.disabled) continue;
      if (filter && !name.includes(filter)) continue;
      const count = Array.isArray(cfg.tools_cache) ? cfg.tools_cache.length : 0;
      const mode = cfg.always_on ? 'always_on' : 'on-demand';
      const status = active.has(name) ? '●' : '○';
      lines.push(`  ${status} ${name}: ${count} tools (${mode}) — use gov.project_tool or ${name}__*`);
    }
    lines.push('');
    lines.push('Tip: set show_backend_tools=true to list all raw tool names.');
  }

  return mcpText(lines.join('\n'));
}

async function handleGovToolStatus({ backend } = {}) {
  try {
    const report = await buildStatusReport(backend);
    return mcpText(report);
  } catch (e) {
    return mcpError(`gov.tool_status failed: ${e.message}`);
  }
}

async function handleGovCleanupIdle({ force = false } = {}) {
  try {
    const killed = await doCleanupIdle(force);
    const text = killed.length > 0
      ? `Stopped: ${killed.join(', ')}`
      : 'No on-demand backends were running.';
    return mcpText(text);
  } catch (e) {
    return mcpError(`gov.cleanup_idle failed: ${e.message}`);
  }
}

async function routeGovTool(name, args) {
  log(`gov: ${name}`);
  try {
    switch (name) {
      case 'gov.search_code':    return await handleSearchCode(args);
      case 'gov.search_docs':    return await handleSearchDocs(args);
      case 'gov.browser_task':   return await handleBrowserTask(args);
      case 'gov.project_tool':   return await handleProjectTool(args);
      case 'gov.list_tools':     return handleListTools(args);
      case 'gov.tool_status':    return await handleGovToolStatus(args);
      case 'gov.cleanup_idle':   return await handleGovCleanupIdle(args);
      default:                   return mcpError(`Unknown gov tool: ${name}`);
    }
  } catch (e) {
    log(`routeGovTool error ${name}: ${e.message}`);
    return mcpError(`Internal error in ${name}: ${e.message}`);
  }
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'context-governor', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = buildToolList();
  audit('mcp_list_tools', { tools: tools.length });
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args = {} } = request.params;

  // Gov intent tools take priority
  if (toolName.startsWith('gov.')) {
    return await routeGovTool(toolName, args);
  }

  // Backend passthrough (debug / escape hatch)
  const parsed = parsePrefix(toolName);
  if (!parsed) {
    return mcpError(`Unrecognized tool format: ${toolName}. Use gov.* tools or backend__toolname format.`);
  }

  const { backend, tool } = parsed;
  const cfg = registry[backend];

  if (!cfg) {
    audit('backend_blocked', { backend, tool, reason: 'unknown' });
    return mcpError(`Unknown backend: ${backend}`);
  }
  if (cfg.disabled) {
    audit('backend_blocked', { backend, tool, reason: 'disabled' });
    return mcpError(`Backend '${backend}' is disabled in registry.json`);
  }

  try {
    return await callBackendTool(backend, tool, args);
  } catch (e) {
    log(`Passthrough error ${toolName}: ${e.message}`);
    return mcpError(`Error from ${backend}: ${e.message}`);
  }
});

// ─── Startup ────────────────────────────────────────────────────────────────

async function init() {
  const refreshMode = process.argv.includes('--refresh-tools');

  for (const [name, cfg] of Object.entries(registry)) {
    if (cfg.disabled || name.startsWith('_')) continue;

    if (cfg.always_on || refreshMode) {
      await connect(name).catch(e => log(`Startup warning — ${name}: ${e.message}`));
      if (refreshMode && !cfg.always_on) {
        await disconnect(name).catch(() => {});
      }
    }
  }

  if (refreshMode) {
    log('Tool cache refreshed. Exiting.');
    process.exit(0);
  }
}

// ─── CLI: --status / --cleanup-idle ──────────────────────────────────────────

async function runStatus() {
  process.stdout.write(await buildStatusReport() + '\n');
}

async function runCleanupIdle() {
  process.stdout.write('Cleaning up on-demand backend processes...\n');
  const killed = await doCleanupIdle();
  process.stdout.write(
    killed.length > 0 ? `Done. Stopped: ${killed.join(', ')}\n` : 'Nothing to clean up.\n'
  );
}

// ─── Signal handlers ──────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  for (const name of active.keys()) await disconnect(name).catch(() => {});
  process.exit(0);
});

process.on('SIGINT', async () => {
  for (const name of active.keys()) await disconnect(name).catch(() => {});
  process.exit(0);
});

// ─── CLI early-exit (these never start the MCP server) ───────────────────────

if (process.argv.includes('--status'))       { await runStatus();      process.exit(0); }
if (process.argv.includes('--cleanup-idle')) { await runCleanupIdle(); process.exit(0); }

// ─── Start MCP server ─────────────────────────────────────────────────────────

await init();

const transport = new StdioServerTransport();
await server.connect(transport);
log(`Context Governor v2 started (cwd=${process.cwd()})`);
