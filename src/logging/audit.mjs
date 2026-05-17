import fs from 'fs';
import { redact } from '../security/redaction.mjs';

export function writeAuditEvent(filePath, event) {
  if (!filePath) return;
  const record = { ts: new Date().toISOString(), ...event };
  try {
    fs.appendFileSync(filePath, redact(JSON.stringify(record)) + '\n');
  } catch {
    // Audit logging must never break runtime behavior.
  }
}

export function readAuditEvents(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

export function summarizeAuditEvents(events) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event.action, (counts.get(event.action) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([action, count]) => ({ action, count }));
}

export function formatAuditReport(events) {
  const lines = [
    'Context Governor — Audit Trail',
    '═'.repeat(60),
    '',
    `Events: ${events.length}`,
    '',
    'Summary:',
  ];

  const summary = summarizeAuditEvents(events);
  if (summary.length === 0) {
    lines.push('  none');
  } else {
    for (const { action, count } of summary) lines.push(`  ${action}: ${count}`);
  }

  lines.push('', 'Recent:');
  for (const event of events.slice(-20)) {
    const backend = event.backend ? ` backend=${event.backend}` : '';
    const tool = event.tool ? ` tool=${event.tool}` : '';
    const reason = event.reason ? ` reason=${event.reason}` : '';
    lines.push(`  ${event.ts} ${event.action}${backend}${tool}${reason}`);
  }

  return lines.join('\n') + '\n';
}
