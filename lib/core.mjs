import fs from 'fs';

export const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(token|key|secret|password|authorization)=[^\s&"'`]+/gi,
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g,
];

export function redact(msg) {
  let out = String(msg);
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

export function expandHeaders(headers = {}, backendName = 'unknown', env = process.env, warn = () => {}) {
  const out = {};
  const re = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v !== 'string') {
      out[k] = v;
      continue;
    }
    out[k] = v.replace(re, (_, varName) => {
      const value = env[varName];
      if (value === undefined) {
        warn(`Warning: backend '${backendName}' header '${k}' references missing env var ${varName}`);
        return '';
      }
      return value;
    });
  }
  return out;
}

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

export function estimateTokens(value) {
  if (value == null) return 0;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

export function listVisibleBackendTools(registry = {}, activeTools = new Map()) {
  const settings = registry._settings || {};
  if (!(settings.exposePassthroughTools ?? false)) return [];

  const tools = [];
  for (const backend of enabledBackends(registry)) {
    const liveTools = activeTools.get(backend.name);
    const toolNames = Array.isArray(liveTools)
      ? liveTools.map(tool => typeof tool === 'string' ? tool : tool.name)
      : backend.tools_cache || [];

    for (const toolName of toolNames) {
      tools.push(`${backend.name}__${toolName}`);
    }
  }
  return tools.sort();
}
