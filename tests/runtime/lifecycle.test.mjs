import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readAuditEvents } from '../../lib/audit.mjs';

const repoRoot = new URL('../..', import.meta.url);
const fakeMcpPath = new URL('../fixtures/fake-stdio-mcp.mjs', import.meta.url);

function makeRuntimeFixture({ timeoutSeconds = 1 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-runtime-'));
  const registryPath = path.join(root, 'registry.json');
  const auditPath = path.join(root, 'audit.jsonl');
  const logPath = path.join(root, 'governor.log');
  fs.writeFileSync(registryPath, JSON.stringify({
    _settings: { exposePassthroughTools: true },
    fake: {
      transport: 'stdio',
      command: process.execPath,
      args: [fileURLPath(fakeMcpPath)],
      call_timeout_seconds: timeoutSeconds,
      idle_timeout_seconds: 60,
    },
    disabled: {
      transport: 'stdio',
      command: process.execPath,
      args: [fileURLPath(fakeMcpPath)],
      disabled: true,
      tools_cache: ['echo'],
    },
  }, null, 2));
  return { root, registryPath, auditPath, logPath };
}

function fileURLPath(url) {
  return decodeURIComponent(url.pathname);
}

async function withGovernor(fixture, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLPath(new URL('../../index.mjs', import.meta.url))],
    env: {
      ...process.env,
      CONTEXT_GOVERNOR_REGISTRY_PATH: fixture.registryPath,
      CONTEXT_GOVERNOR_AUDIT_PATH: fixture.auditPath,
      CONTEXT_GOVERNOR_LOG_PATH: fixture.logPath,
    },
  });
  const client = new Client(
    { name: 'runtime-test', version: '1.0.0' },
    { capabilities: {} }
  );
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await transport.close().catch(() => {});
  }
}

test('lists enabled fake stdio backend as project target and filters disabled backend tools', async () => {
  const fixture = makeRuntimeFixture();
  await withGovernor(fixture, async client => {
    const result = await client.listTools();
    const names = result.tools.map(tool => tool.name);
    const projectTool = result.tools.find(tool => tool.name === 'gov.project_tool');

    assert.equal(names.includes('gov.project_tool'), true);
    assert.equal(names.includes('disabled__echo'), false);
    assert.deepEqual(projectTool.inputSchema.properties.target.enum, ['fake']);
  });

  const events = readAuditEvents(fixture.auditPath);
  assert.equal(events.some(event => event.action === 'mcp_list_tools'), true);
});

test('calls a fake stdio backend on demand and records audit events', async () => {
  const fixture = makeRuntimeFixture();
  await withGovernor(fixture, async client => {
    const result = await client.callTool({
      name: 'fake__echo',
      arguments: { text: 'hello governor' },
    });

    assert.equal(result.content[0].text, 'hello governor');
  });

  const actions = readAuditEvents(fixture.auditPath).map(event => event.action);
  assert.equal(actions.includes('backend_connected'), true);
  assert.equal(actions.includes('tool_call_success'), true);
});

test('times out a slow stdio backend call and disconnects it', async () => {
  const fixture = makeRuntimeFixture({ timeoutSeconds: 0.05 });
  await withGovernor(fixture, async client => {
    const result = await client.callTool({
      name: 'fake__slow',
      arguments: { ms: 300 },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /timeout/i);
  });

  const actions = readAuditEvents(fixture.auditPath).map(event => event.action);
  assert.equal(actions.includes('tool_call_timeout'), true);
  assert.equal(actions.includes('backend_disconnected'), true);
});

test('disabled backend calls fail without spawning the backend', async () => {
  const fixture = makeRuntimeFixture();
  await withGovernor(fixture, async client => {
    const result = await client.callTool({
      name: 'disabled__echo',
      arguments: { text: 'blocked' },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /disabled/i);
  });

  const events = readAuditEvents(fixture.auditPath);
  assert.equal(events.some(event => event.action === 'backend_blocked' && event.backend === 'disabled'), true);
  assert.equal(events.some(event => event.action === 'backend_connected' && event.backend === 'disabled'), false);
});

test('audit CLI reports recorded runtime decisions', async () => {
  const fixture = makeRuntimeFixture();
  await withGovernor(fixture, async client => {
    await client.callTool({ name: 'fake__echo', arguments: { text: 'audit me' } });
  });

  const report = spawnSync(process.execPath, ['index.mjs', 'audit'], {
    cwd: fileURLPath(repoRoot),
    env: {
      ...process.env,
      CONTEXT_GOVERNOR_AUDIT_PATH: fixture.auditPath,
    },
    encoding: 'utf8',
  });

  assert.equal(report.status, 0);
  assert.match(report.stdout, /Audit Trail/);
  assert.match(report.stdout, /tool_call_success/);
});
