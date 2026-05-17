#!/usr/bin/env node
/**
 * Context Governor — installer
 *
 * One-shot bootstrap. Idempotent — safe to re-run. Creates the standard
 * directory layout, scaffolds empty config files, makes scripts executable,
 * runs `npm install`, and wires the governor into ~/.claude/settings.json.
 *
 * Does NOT install any specific backends or skills — those are yours to add.
 *
 * Usage:
 *   node install.mjs                # full install (default)
 *   node install.mjs --dry-run      # print actions without making changes
 *   node install.mjs --no-settings  # skip settings.json patching
 *   node install.mjs --help
 *
 * Environment:
 *   CLAUDE_HOME   override the default ~/.claude install root
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

// ─── Args ────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const SKIP_SETTINGS = args.has('--no-settings');

if (args.has('--help') || args.has('-h')) {
  process.stdout.write([
    'Context Governor installer',
    '',
    'Usage: node install.mjs [options]',
    '',
    'Options:',
    '  --dry-run        Show planned actions without writing anything',
    '  --no-settings    Do not modify ~/.claude/settings.json',
    '  --help, -h       Show this help',
    '',
    'Environment:',
    '  CLAUDE_HOME      Override the install root (default: ~/.claude)',
    '',
  ].join('\n'));
  process.exit(0);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_HOME = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
const CG_DIR = path.join(CLAUDE_HOME, 'context-governor');
const MCPD_DIR = path.join(CLAUDE_HOME, 'mcpd');
const SKILLS_DIR = path.join(CLAUDE_HOME, 'skills');
const SKILLS_INACTIVE_DIR = path.join(CLAUDE_HOME, 'skills-inactive');
const SETTINGS_PATH = path.join(CLAUDE_HOME, 'settings.json');

// ─── Pretty output ───────────────────────────────────────────────────────────

const ICON = { ok: '✓', skip: '·', plan: '→', warn: '!', fail: '✗' };
let stepNum = 0;

function step(title) {
  stepNum++;
  process.stdout.write(`\n[${stepNum}] ${title}\n`);
}

function line(icon, msg) {
  process.stdout.write(`    ${icon} ${msg}\n`);
}

function banner() {
  const v = readJSON(path.join(__dirname, 'package.json'))?.version ?? '?';
  process.stdout.write(`\nContext Governor installer  v${v}${DRY ? '  (DRY RUN)' : ''}\n`);
  process.stdout.write(`Install root: ${CLAUDE_HOME}\n`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function writeJSON(p, obj) {
  if (DRY) return;
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function ensureDir(p) {
  if (fs.existsSync(p)) { line(ICON.skip, `exists: ${p}`); return false; }
  if (DRY) { line(ICON.plan, `mkdir -p ${p}`); return true; }
  fs.mkdirSync(p, { recursive: true });
  line(ICON.ok, `created: ${p}`);
  return true;
}

function ensureFile(p, defaultContents, label) {
  if (fs.existsSync(p)) { line(ICON.skip, `exists: ${label || p}`); return false; }
  if (DRY) { line(ICON.plan, `write: ${label || p}`); return true; }
  fs.writeFileSync(p, defaultContents);
  line(ICON.ok, `created: ${label || p}`);
  return true;
}

function chmodX(p) {
  if (!fs.existsSync(p)) return;
  if (DRY) { line(ICON.plan, `chmod +x ${p}`); return; }
  try {
    fs.chmodSync(p, 0o755);
    line(ICON.ok, `chmod +x ${path.basename(p)}`);
  } catch (e) {
    line(ICON.warn, `chmod failed for ${p}: ${e.message}`);
  }
}

function backupFile(p) {
  if (!fs.existsSync(p)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${p}.backup-${ts}`;
  if (DRY) { line(ICON.plan, `backup ${path.basename(p)} → ${path.basename(backup)}`); return backup; }
  fs.copyFileSync(p, backup);
  line(ICON.ok, `backup: ${path.basename(backup)}`);
  return backup;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function checkPrereqs() {
  step('Prerequisites');

  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 18) {
    line(ICON.fail, `Node.js ${process.versions.node} — require ≥18`);
    process.exit(1);
  }
  line(ICON.ok, `Node.js ${process.versions.node}`);

  try {
    execFileSync('npm', ['--version'], { stdio: 'pipe' });
    line(ICON.ok, 'npm present');
  } catch {
    line(ICON.fail, 'npm not found in PATH');
    process.exit(1);
  }
}

function createLayout() {
  step('Directory layout');
  ensureDir(CG_DIR);
  ensureDir(MCPD_DIR);
  ensureDir(path.join(MCPD_DIR, 'pids'));
  ensureDir(path.join(MCPD_DIR, 'logs'));
  ensureDir(SKILLS_DIR);
  ensureDir(SKILLS_INACTIVE_DIR);
}

// Files to copy from the source checkout into CG_DIR so the governor can run
// from ~/.claude/context-governor/ independently of where the user cloned it.
// Directories are copied recursively; everything else is a regular file.
const SOURCE_FILES = [
  'index.mjs',
  'install.mjs',
  'package.json',
  'package-lock.json',
  'README.md',
  'skill-status',
  'skill-enable',
  'skill-disable',
  'skill-use',
  'hooks',
  'lib',
  'src',
  'scripts',
  'benchmarks',
  'tests',
  'assets',
  'docs',
  'types',
  'tsconfig.json',
];

// Files copied into MCPD_DIR (sibling of CG_DIR).
const MCPD_FILES = ['start.sh', 'stop.sh', 'status.sh'];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copySource() {
  step('Copy governor source');

  for (const name of SOURCE_FILES) {
    const src = path.join(__dirname, name);
    const dest = path.join(CG_DIR, name);
    if (!fs.existsSync(src)) {
      line(ICON.warn, `source missing, skipped: ${name}`);
      continue;
    }
    if (DRY) { line(ICON.plan, `copy ${name} → ${dest}`); continue; }
    try {
      copyRecursive(src, dest);
      line(ICON.ok, `copied: ${name}`);
    } catch (e) {
      line(ICON.fail, `copy failed for ${name}: ${e.message}`);
      process.exit(1);
    }
  }

  for (const name of MCPD_FILES) {
    const src = path.join(__dirname, 'mcpd', name);
    const dest = path.join(MCPD_DIR, name);
    if (!fs.existsSync(src)) {
      line(ICON.warn, `source missing, skipped: mcpd/${name}`);
      continue;
    }
    if (DRY) { line(ICON.plan, `copy mcpd/${name} → ${dest}`); continue; }
    try {
      fs.copyFileSync(src, dest);
      line(ICON.ok, `copied: mcpd/${name}`);
    } catch (e) {
      line(ICON.fail, `copy failed for mcpd/${name}: ${e.message}`);
      process.exit(1);
    }
  }
}

function seedRegistry() {
  step('Backend registry (empty)');
  const p = path.join(CG_DIR, 'registry.json');
  const seed = {
    _comment: 'Context Governor MCP Registry. Add backends as top-level keys. See README.md for the schema and registry.example.json for examples.',
    _settings: {
      exposePassthroughTools: false,
    },
  };
  ensureFile(p, JSON.stringify(seed, null, 2) + '\n', 'registry.json');
}

function seedSkillsRegistry() {
  step('Skills registry (empty catalog)');
  const p = path.join(CG_DIR, 'skills-registry.json');
  const seed = {
    _comment: 'Skill Governor catalog — maps every skill to its aliases, mode, paths, and description. Used by skill-use for alias resolution and by skill-disable for the protected list. Filesystem is the source of truth for active/inactive state (presence in skills/ vs skills-inactive/); this file is a catalog with metadata.',
    _settings: {
      activeDir: '~/.claude/skills',
      inactiveDir: '~/.claude/skills-inactive',
      pathConvention: 'active → ~/.claude/skills/<name>  |  inactive → ~/.claude/skills-inactive/<name>',
    },
    _protected: [],
  };
  ensureFile(p, JSON.stringify(seed, null, 2) + '\n', 'skills-registry.json');
}

function installDeps() {
  step('Install npm dependencies');
  const pkgJson = path.join(CG_DIR, 'package.json');
  if (!fs.existsSync(pkgJson) && !DRY) {
    line(ICON.fail, `no package.json at ${CG_DIR} — earlier copy step failed`);
    process.exit(1);
  }
  const nm = path.join(CG_DIR, 'node_modules');
  if (fs.existsSync(nm)) { line(ICON.skip, 'node_modules already present'); return; }
  if (DRY) { line(ICON.plan, `npm install (cwd=${CG_DIR})`); return; }
  try {
    execFileSync('npm', ['install'], { cwd: CG_DIR, stdio: 'inherit' });
    line(ICON.ok, 'npm install complete');
  } catch (e) {
    line(ICON.fail, `npm install failed: ${e.message}`);
    process.exit(1);
  }
}

function makeScriptsExecutable() {
  step('Make scripts executable');
  for (const name of ['skill-enable', 'skill-disable', 'skill-status', 'skill-use', 'install.mjs']) {
    chmodX(path.join(CG_DIR, name));
  }
  for (const name of ['start.sh', 'stop.sh', 'status.sh']) {
    chmodX(path.join(MCPD_DIR, name));
  }
}

function patchSettings() {
  step('Claude Code settings.json');

  if (SKIP_SETTINGS) { line(ICON.skip, 'skipped (--no-settings)'); return; }

  const indexPath = path.join(CG_DIR, 'index.mjs');
  const desiredServer = {
    command: 'node',
    args: [indexPath],
  };

  let settings = readJSON(SETTINGS_PATH);
  const settingsExisted = settings !== null;
  if (!settings) settings = {};

  let changed = false;

  // mcpServers.context-governor
  settings.mcpServers ||= {};
  const existing = settings.mcpServers['context-governor'];
  const same =
    existing &&
    existing.command === desiredServer.command &&
    Array.isArray(existing.args) &&
    existing.args.length === desiredServer.args.length &&
    existing.args[0] === desiredServer.args[0];

  if (!same) {
    settings.mcpServers['context-governor'] = desiredServer;
    changed = true;
    line(existing ? ICON.ok : ICON.ok, existing ? 'updated mcpServers.context-governor' : 'added mcpServers.context-governor');
  } else {
    line(ICON.skip, 'mcpServers.context-governor already correct');
  }

  // permissions.allow includes mcp__context-governor__*
  settings.permissions ||= {};
  settings.permissions.allow ||= [];
  const allowEntry = 'mcp__context-governor__*';
  if (!settings.permissions.allow.includes(allowEntry)) {
    settings.permissions.allow.unshift(allowEntry);
    changed = true;
    line(ICON.ok, `added permission: ${allowEntry}`);
  } else {
    line(ICON.skip, `permission already present: ${allowEntry}`);
  }

  if (!changed) {
    line(ICON.skip, 'no settings changes needed');
    return;
  }

  if (settingsExisted) backupFile(SETTINGS_PATH);
  writeJSON(SETTINGS_PATH, settings);
  if (!DRY) line(ICON.ok, `wrote ${SETTINGS_PATH}`);
}

function refreshToolsHint() {
  step('Tool cache');
  const registry = readJSON(path.join(CG_DIR, 'registry.json'));
  const backendKeys = registry ? Object.keys(registry).filter(k => !k.startsWith('_')) : [];
  if (backendKeys.length === 0) {
    line(ICON.skip, 'registry is empty — add backends, then run `node index.mjs --refresh-tools`');
  } else {
    line(ICON.plan, `run \`node ${path.join(CG_DIR, 'index.mjs')} --refresh-tools\` once you have backends configured`);
  }
}

function nextSteps() {
  process.stdout.write('\n────────────────────────────────────────────────────────────\n');
  process.stdout.write('Next steps\n');
  process.stdout.write('────────────────────────────────────────────────────────────\n\n');
  process.stdout.write([
    '  1. Restart Claude Code so the mcpServers entry takes effect.',
    '  2. Open a session and run `gov.list_tools` to verify the governor responded.',
    '  3. Add backends to:',
    `       ${path.join(CG_DIR, 'registry.json')}`,
    '     See README.md for the schema and registry.example.json for examples.',
    '  4. After registering backends, refresh the tool cache:',
    `       node ${path.join(CG_DIR, 'index.mjs')} --refresh-tools`,
    '  5. (Optional) Drop skills into:',
    `       ${SKILLS_DIR}              # loaded at session start`,
    `       ${SKILLS_INACTIVE_DIR}     # parked until restored`,
    '     then manage them with the skill-* CLI tools.',
    '',
  ].join('\n'));

  if (DRY) {
    process.stdout.write('(DRY RUN — no changes were written. Re-run without --dry-run to apply.)\n\n');
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

banner();

try {
  checkPrereqs();
  createLayout();
  copySource();
  seedRegistry();
  seedSkillsRegistry();
  installDeps();
  makeScriptsExecutable();
  patchSettings();
  refreshToolsHint();
  nextSteps();
} catch (e) {
  process.stdout.write(`\n${ICON.fail} Installer failed: ${e.message}\n`);
  if (e.stack) process.stdout.write(e.stack + '\n');
  process.exit(1);
}
