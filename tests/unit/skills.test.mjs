import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function loadSkillsFixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-skills-'));
  process.env.CLAUDE_HOME = home;

  const skillsDir = path.join(home, 'skills');
  const inactiveDir = path.join(home, 'skills-inactive');
  const governorDir = path.join(home, 'context-governor');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(inactiveDir, { recursive: true });
  fs.mkdirSync(governorDir, { recursive: true });

  const moduleUrl = new URL(`../../lib/skills.mjs?fixture=${Date.now()}-${Math.random()}`, import.meta.url);
  const skills = await import(moduleUrl);

  return { home, skillsDir, inactiveDir, governorDir, skills };
}

test('enables and disables skills by moving directories', async () => {
  const { skillsDir, inactiveDir, skills } = await loadSkillsFixture();
  fs.mkdirSync(path.join(inactiveDir, 'docs'));

  assert.deepEqual(skills.enableSkill('docs'), { ok: true, moved: true });
  assert.equal(fs.existsSync(path.join(skillsDir, 'docs')), true);
  assert.equal(fs.existsSync(path.join(inactiveDir, 'docs')), false);

  assert.deepEqual(skills.disableSkill('docs'), { ok: true, moved: true });
  assert.equal(fs.existsSync(path.join(skillsDir, 'docs')), false);
  assert.equal(fs.existsSync(path.join(inactiveDir, 'docs')), true);
});

test('does not disable protected skills unless forced', async () => {
  const { skillsDir, inactiveDir, governorDir, skills } = await loadSkillsFixture();
  fs.mkdirSync(path.join(skillsDir, 'core'));
  fs.writeFileSync(
    path.join(governorDir, 'skills-registry.json'),
    JSON.stringify({ _protected: ['core'] }, null, 2)
  );

  assert.deepEqual(skills.disableSkill('core'), { ok: false, protected: true });
  assert.equal(fs.existsSync(path.join(skillsDir, 'core')), true);

  assert.deepEqual(skills.disableSkill('core', true), { ok: true, moved: true });
  assert.equal(fs.existsSync(path.join(inactiveDir, 'core')), true);
});

test('resolves registry aliases predictably', async () => {
  const { governorDir, skills } = await loadSkillsFixture();
  fs.writeFileSync(
    path.join(governorDir, 'skills-registry.json'),
    JSON.stringify({
      _protected: [],
      'openai-docs': { aliases: ['docs', 'api docs'] },
    }, null, 2)
  );

  const match = skills.resolveAlias('api_docs');

  assert.equal(match.name, 'openai-docs');
  assert.equal(match.score, 3);
});
