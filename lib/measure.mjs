import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  cachedToolCount,
  enabledBackends,
  estimateTokens,
  readJsonFile,
  registryBackends,
} from './core.mjs';

export function countSkillDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

export function collectMeasurement({
  baselinePath,
  registryPath,
  skillsDir,
  includeMcp = true,
  includeSkills = true,
} = {}) {
  const claudeHome = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
  const baseline = readJsonFile(baselinePath || path.join(claudeHome, 'settings.json'), {});
  const registry = readJsonFile(registryPath || path.join(claudeHome, 'context-governor', 'registry.json'), {});
  const activeSkillsDir = skillsDir || path.join(claudeHome, 'skills');

  const baselineServers = includeMcp ? Object.entries(baseline.mcpServers || {}) : [];
  const baselineTools = baselineServers.reduce((sum, [, server]) => (
    sum + (Array.isArray(server.tools_cache) ? server.tools_cache.length : 0)
  ), 0);
  const baselineMcpTokens = includeMcp ? estimateTokens(baseline.mcpServers || {}) : 0;

  const allBackends = includeMcp ? registryBackends(registry) : [];
  const liveBackends = includeMcp ? enabledBackends(registry) : [];
  const governorTools = includeMcp ? 3 + cachedToolCount(liveBackends) : 0;
  const governorMcpTokens = includeMcp ? estimateTokens(registry) : 0;

  const activeSkills = includeSkills ? countSkillDirs(activeSkillsDir) : 0;
  const skillsTokens = includeSkills ? estimateTokens(
    Array.from({ length: activeSkills }, (_, i) => `skill-${i}`).join('\n')
  ) : 0;

  return {
    baseline: {
      mcpServers: baselineServers.length,
      tools: baselineTools,
      estimatedTokens: baselineMcpTokens + skillsTokens,
      mcpEstimatedTokens: baselineMcpTokens,
      skills: activeSkills,
      skillsEstimatedTokens: skillsTokens,
    },
    governor: {
      mcpEntries: includeMcp ? 1 : 0,
      registeredBackends: allBackends.length,
      enabledBackends: liveBackends.length,
      tools: governorTools,
      estimatedTokens: governorMcpTokens + skillsTokens,
      mcpEstimatedTokens: governorMcpTokens,
      activeSkills,
      skillsEstimatedTokens: skillsTokens,
    },
  };
}

export function formatMeasurement(measurement) {
  const saved = measurement.baseline.estimatedTokens - measurement.governor.estimatedTokens;
  return [
    'Baseline:',
    `${measurement.baseline.mcpServers} MCP servers, ${measurement.baseline.tools} tools, estimated ${measurement.baseline.mcpEstimatedTokens.toLocaleString()} tokens`,
    `${measurement.baseline.skills} skills, estimated ${measurement.baseline.skillsEstimatedTokens.toLocaleString()} tokens`,
    '',
    'Governor:',
    `${measurement.governor.mcpEntries} MCP entry, ${measurement.governor.tools} gov/backend tools, estimated ${measurement.governor.mcpEstimatedTokens.toLocaleString()} tokens`,
    `${measurement.governor.activeSkills} active skills, estimated ${measurement.governor.skillsEstimatedTokens.toLocaleString()} tokens`,
    '',
    `Estimated saved: ${saved.toLocaleString()} tokens / session`,
    '',
  ].join('\n');
}

export function parseMeasureArgs(argv) {
  const options = { includeMcp: true, includeSkills: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') {
      options.baselinePath = argv[++i];
    } else if (arg === '--registry') {
      options.registryPath = argv[++i];
    } else if (arg === '--skills-dir') {
      options.skillsDir = argv[++i];
    } else if (arg === '--skills') {
      options.includeMcp = false;
      options.includeSkills = true;
    } else if (arg === '--mcp') {
      options.includeMcp = true;
      options.includeSkills = false;
    }
  }
  return options;
}
