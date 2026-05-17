export const SEP = '__';

export function prefixed(backendName, toolName) {
  return `${backendName}${SEP}${toolName}`;
}

export function parsePrefix(prefixedName) {
  const idx = prefixedName.indexOf(SEP);
  if (idx < 1) return null;
  return {
    backend: prefixedName.slice(0, idx),
    tool: prefixedName.slice(idx + SEP.length),
  };
}
