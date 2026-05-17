import { enabledBackends } from '../registry/registry.mjs';

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
