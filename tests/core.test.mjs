import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cachedToolCount,
  enabledBackends,
  estimateTokens,
  expandHeaders,
  listVisibleBackendTools,
  redact,
  registryBackends,
} from '../lib/core.mjs';

test('parses registry backends and filters disabled entries', () => {
  const registry = {
    _settings: {},
    docs: { transport: 'stdio', tools_cache: ['query'] },
    disabled: { transport: 'stdio', disabled: true, tools_cache: ['hidden'] },
  };

  assert.deepEqual(registryBackends(registry).map(backend => backend.name), ['docs', 'disabled']);
  assert.deepEqual(enabledBackends(registry).map(backend => backend.name), ['docs']);
});

test('estimates empty inputs as zero tokens', () => {
  assert.equal(estimateTokens({}), 0);
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
});

test('expands header env vars and reports missing values', () => {
  const warnings = [];
  const headers = expandHeaders(
    {
      Authorization: 'Bearer ${API_TOKEN}',
      Missing: 'Bearer ${MISSING_TOKEN}',
      Static: 42,
    },
    'docs',
    { API_TOKEN: 'secret-token' },
    warning => warnings.push(warning)
  );

  assert.equal(headers.Authorization, 'Bearer secret-token');
  assert.equal(headers.Missing, 'Bearer ');
  assert.equal(headers.Static, 42);
  assert.equal(warnings.length, 1);
});

test('redacts common secret formats', () => {
  const message = [
    'Authorization: Bearer abc.def-123',
    'api_key=supersecret',
    'jwt eyJabc.def.ghi',
  ].join('\n');

  const output = redact(message);

  assert.doesNotMatch(output, /supersecret|abc\.def-123|eyJabc\.def\.ghi/);
  assert.match(output, /\[REDACTED\]/);
});

test('filters backend passthrough tools unless explicitly enabled', () => {
  const registry = {
    _settings: { exposePassthroughTools: false },
    docs: { tools_cache: ['query'] },
  };

  assert.deepEqual(listVisibleBackendTools(registry), []);

  registry._settings.exposePassthroughTools = true;
  registry.disabled = { disabled: true, tools_cache: ['hidden'] };

  assert.deepEqual(listVisibleBackendTools(registry), ['docs__query']);
  assert.equal(cachedToolCount(enabledBackends(registry)), 1);
});
