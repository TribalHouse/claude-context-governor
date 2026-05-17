#!/usr/bin/env node
/**
 * Context Governor — UserPromptSubmit routing hook
 *
 * Reads the user's prompt from stdin (Claude Code passes hook input as JSON on
 * stdin via $HOOK_INPUT), classifies it by regex, and emits a routing advice
 * line that gets injected into the agent's context for that turn.
 *
 * The agent then follows CLAUDE.md's routing policy: switch model with /model
 * <model>, delegate to the matching subagent, or escalate to opus-planner for
 * high-risk work.
 *
 * Wire into ~/.claude/settings.json under "hooks":
 *
 *   "UserPromptSubmit": [
 *     {
 *       "matcher": "*",
 *       "hooks": [
 *         {
 *           "type": "command",
 *           "command": "node ~/.claude/context-governor/hooks/route-prompt.mjs"
 *         }
 *       ]
 *     }
 *   ]
 */

import { readFileSync } from 'fs';
import { classifyPrompt } from '../src/routing/classifier.mjs';

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  // No input — silently exit, do not block prompt
  process.exit(0);
}

// Claude Code passes a JSON envelope. Extract user_prompt or fall back to raw.
let prompt = '';
try {
  const parsed = JSON.parse(input);
  prompt = parsed.user_prompt || parsed.prompt || parsed.message || '';
} catch {
  prompt = input;
}
prompt = prompt.toLowerCase();

if (!prompt.trim()) process.exit(0);

const route = classifyPrompt(prompt);

// ─── Output routing advice ───────────────────────────────────────────────────
//
// Don't emit anything for the sonnet (default) case — quieter prompts means
// less noise injected into Claude's context for everyday work.

if (route === 'opus') {
  process.stdout.write(
    `[ROUTING ADVICE: opus — prompt looks high-risk (auth, schema, security, billing, large refactor, or repeated failure). ` +
    `If not already on Opus, consider /model opus or delegating to the opus-planner subagent before editing files. ` +
    `Save the plan to .claude/last-opus-plan.md and wait for user approval.]\n`
  );
} else if (route === 'haiku') {
  process.stdout.write(
    `[ROUTING ADVICE: haiku — prompt looks like read-only diagnostics, summary, or search. ` +
    `Consider delegating to the haiku-scout / explorer subagent (Haiku 4.5 — read-only, ~5× cheaper). ` +
    `Do not edit files from the scout agent.]\n`
  );
}

process.exit(0);
