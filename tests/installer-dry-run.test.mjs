import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('installer dry-run reports planned actions without writing install files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-install-'));
  const result = spawnSync(process.execPath, ['install.mjs', '--dry-run'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, CLAUDE_HOME: home },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /DRY RUN/);
  assert.match(result.stdout, /mkdir -p/);
  assert.equal(fs.existsSync(path.join(home, 'context-governor')), false);
  assert.equal(fs.existsSync(path.join(home, 'settings.json')), false);
});
