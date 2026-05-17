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
