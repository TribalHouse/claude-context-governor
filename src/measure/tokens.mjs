export function estimateTokens(value) {
  if (value == null) return 0;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
