/**
 * Skill Governor — shared helpers
 *
 * Filesystem is the source of truth for active/inactive state.
 * skills-registry.json is a catalog: aliases, descriptions, _protected list.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// CLAUDE_HOME mirrors install.mjs: defaults to ~/.claude, overridable for
// sandboxed installs and CI. Resolve lazily so tests and subprocesses can
// change CLAUDE_HOME without fighting module cache.
function claudeHome() {
  return process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
}

export const SKILLS_DIR = path.join(claudeHome(), 'skills');
export const INACTIVE_DIR = path.join(claudeHome(), 'skills-inactive');
export const REGISTRY_PATH = path.join(claudeHome(), 'context-governor', 'skills-registry.json');

function skillsDir() { return path.join(claudeHome(), 'skills'); }
function inactiveDir() { return path.join(claudeHome(), 'skills-inactive'); }
function registryPath() { return path.join(claudeHome(), 'context-governor', 'skills-registry.json'); }

export function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
  } catch (e) {
    return { _protected: [] };
  }
}

export function getProtected() {
  const reg = loadRegistry();
  return Array.isArray(reg._protected) ? reg._protected : [];
}

function listSubdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

export function listActive() { return listSubdirs(skillsDir()); }
export function listInactive() { return listSubdirs(inactiveDir()); }

export function statusOf(name) {
  const active = fs.existsSync(path.join(skillsDir(), name));
  const inactive = fs.existsSync(path.join(inactiveDir(), name));
  return { active, inactive };
}

export function enableSkill(name) {
  const { active, inactive } = statusOf(name);
  if (active) return { ok: true, alreadyActive: true };
  if (!inactive) return { ok: false, notFound: true };
  fs.renameSync(path.join(inactiveDir(), name), path.join(skillsDir(), name));
  return { ok: true, moved: true };
}

export function disableSkill(name, force = false) {
  const protectedList = getProtected();
  if (protectedList.includes(name) && !force) {
    return { ok: false, protected: true };
  }
  const { active, inactive } = statusOf(name);
  if (inactive) return { ok: true, alreadyInactive: true };
  if (!active) return { ok: false, notFound: true };
  fs.renameSync(path.join(skillsDir(), name), path.join(inactiveDir(), name));
  return { ok: true, moved: true };
}

const norm = s => s.toLowerCase().replace(/\./g, '').replace(/_/g, '-').replace(/\s+/g, '-');

export function resolveAlias(query) {
  const reg = loadRegistry();
  const q = norm(query);
  let best = { score: -1, name: null, entry: null };

  for (const [name, entry] of Object.entries(reg)) {
    if (name.startsWith('_')) continue;
    if (typeof entry !== 'object' || entry === null) continue;

    const nameNorm = norm(name);
    const aliasesNorm = (entry.aliases || []).map(norm);

    let score = -1;
    if (nameNorm === q) score = 4;
    else if (aliasesNorm.includes(q)) score = 3;
    else if (aliasesNorm.some(a => a.includes(q))) score = 2;
    else if (nameNorm.includes(q)) score = 1;
    else if (aliasesNorm.some(a => a.startsWith(q))) score = 0;

    if (score > best.score) best = { score, name, entry };
  }

  return best.score < 0 ? null : best;
}
