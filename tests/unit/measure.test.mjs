import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectMeasurement, formatMeasurement } from '../../lib/measure.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-measure-'));
  const baselinePath = path.join(root, 'settings.json');
  const registryPath = path.join(root, 'registry.json');
  const skillsDir = path.join(root, 'skills');
  fs.mkdirSync(path.join(skillsDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(skillsDir, 'figma'), { recursive: true });

  fs.writeFileSync(baselinePath, JSON.stringify({
    mcpServers: {
      docs: { command: 'node', args: ['docs.mjs'], tools_cache: ['query', 'resolve'] },
      browser: { command: 'node', args: ['browser.mjs'], tools_cache: ['navigate'] },
    },
  }, null, 2));

  fs.writeFileSync(registryPath, JSON.stringify({
    _settings: {},
    docs: { transport: 'stdio', tools_cache: ['query', 'resolve'] },
    disabled: { transport: 'stdio', disabled: true, tools_cache: ['hidden'] },
  }, null, 2));

  return { baselinePath, registryPath, skillsDir };
}

test('collects baseline and governor measurement counts', () => {
  const paths = fixture();
  const measurement = collectMeasurement(paths);

  assert.equal(measurement.baseline.mcpServers, 2);
  assert.equal(measurement.baseline.tools, 3);
  assert.equal(measurement.baseline.skills, 2);
  assert.equal(measurement.governor.mcpEntries, 1);
  assert.equal(measurement.governor.registeredBackends, 2);
  assert.equal(measurement.governor.enabledBackends, 1);
  assert.equal(measurement.governor.activeSkills, 2);
});

test('formats measurement output with baseline and governor sections', () => {
  const output = formatMeasurement(collectMeasurement(fixture()));

  assert.match(output, /Baseline:/);
  assert.match(output, /Governor:/);
  assert.match(output, /Estimated saved:/);
});

test('context-governor measure runs without registry.json in the repo root', () => {
  const paths = fixture();
  const result = spawnSync(process.execPath, [
    'index.mjs',
    'measure',
    '--baseline',
    paths.baselinePath,
    '--registry',
    paths.registryPath,
    '--skills-dir',
    paths.skillsDir,
  ], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Baseline:/);
  assert.match(result.stdout, /2 MCP servers, 3 tools/);
  assert.match(result.stdout, /Governor:/);
});
