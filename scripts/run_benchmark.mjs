#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectMeasurement, formatMeasurement } from '../lib/measure.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const baselinePath = path.join(root, 'benchmarks', 'fixtures', 'baseline-settings.json');
const registryPath = path.join(root, 'benchmarks', 'fixtures', 'governor-registry.json');
const resultsDir = path.join(root, 'benchmarks', 'results');

fs.mkdirSync(resultsDir, { recursive: true });

const measurement = collectMeasurement({
  baselinePath,
  registryPath,
  includeMcp: true,
  includeSkills: false,
});

const saved = measurement.baseline.estimatedTokens - measurement.governor.estimatedTokens;
const result = {
  benchmark: 'fixture-mcp-tool-catalog',
  generatedBy: 'npm run bench',
  caveat: 'Heuristic token estimate over fixture MCP settings and governor registry. This is not a live Claude usage run.',
  measurement,
  savedTokensPerSession: saved,
};

const markdown = [
  '# Context Governor Benchmark: Fixture MCP Tool Catalog',
  '',
  'This benchmark compares a representative multi-MCP Claude Code settings file against the governor registry shape.',
  '',
  'Caveat: this is a heuristic fixture benchmark, not a live Claude usage run. It reports projected context pressure and should be paired with real task-quality checks before making broad savings claims.',
  '',
  '```text',
  formatMeasurement(measurement).trimEnd(),
  '```',
  '',
  'Quality notes:',
  '- No task-quality claim is made by this fixture.',
  '- The next benchmark layer should run fake and real MCP calls through the stdio harness and record timeout/disconnect behavior.',
  '',
].join('\n');

fs.writeFileSync(path.join(resultsDir, 'fixture-mcp-tool-catalog.json'), JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync(path.join(resultsDir, 'fixture-mcp-tool-catalog.md'), markdown);
process.stdout.write(markdown);
