import fs from 'fs';

export function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function registryBackends(registry = {}) {
  return Object.entries(registry)
    .filter(([name, cfg]) => !name.startsWith('_') && cfg && typeof cfg === 'object')
    .map(([name, cfg]) => ({ name, ...cfg }));
}

export function enabledBackends(registry = {}) {
  return registryBackends(registry).filter(backend => !backend.disabled);
}

export function cachedToolCount(backends = []) {
  return backends.reduce((sum, backend) => (
    sum + (Array.isArray(backend.tools_cache) ? backend.tools_cache.length : 0)
  ), 0);
}
