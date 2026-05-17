import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { classifyPrompt } from '../../src/routing/classifier.mjs';

function route(input) {
  return spawnSync(process.execPath, ['hooks/route-prompt.mjs'], {
    cwd: new URL('../..', import.meta.url),
    input: JSON.stringify({ user_prompt: input }),
    encoding: 'utf8',
  });
}

test('routes high-risk prompts to opus advice', () => {
  assert.equal(classifyPrompt('Design the auth schema migration for billing permissions'), 'opus');

  const result = route('Design the auth schema migration for billing permissions');

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[ROUTING ADVICE: opus/);
  assert.equal(result.stderr, '');
});

test('routes read-only lookup prompts to haiku advice', () => {
  assert.equal(classifyPrompt('Where is the registry parser defined?'), 'haiku');

  const result = route('Where is the registry parser defined?');

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[ROUTING ADVICE: haiku/);
  assert.equal(result.stderr, '');
});

test('keeps default sonnet route quiet', () => {
  assert.equal(classifyPrompt('Change the button label to Save'), 'sonnet');

  const result = route('Change the button label to Save');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
