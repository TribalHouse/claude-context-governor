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
// sandboxed installs and CI. Production paths are unchanged.
const CLAUDE_HOME = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
export const SKILLS_DIR = path.join(CLAUDE_HOME, 'skills');
export const INACTIVE_DIR = path.join(CLAUDE_HOME, 'skills-inactive');
export const REGISTRY_PATH = path.join(CLAUDE_HOME, 'context-governor', 'skills-registry.json');

export function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
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

export function listActive() { return listSubdirs(SKILLS_DIR); }
export function listInactive() { return listSubdirs(INACTIVE_DIR); }

export function statusOf(name) {
  const active = fs.existsSync(path.join(SKILLS_DIR, name));
  const inactive = fs.existsSync(path.join(INACTIVE_DIR, name));
  return { active, inactive };
}

export function enableSkill(name) {
  const { active, inactive } = statusOf(name);
  if (active) return { ok: true, alreadyActive: true };
  if (!inactive) return { ok: false, notFound: true };
  fs.renameSync(path.join(INACTIVE_DIR, name), path.join(SKILLS_DIR, name));
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
  fs.renameSync(path.join(SKILLS_DIR, name), path.join(INACTIVE_DIR, name));
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
