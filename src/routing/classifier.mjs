export const OPUS_PATTERNS = [
  /\bauth(entication|orization|n|z)?\b/,
  /\b(rls|row[-\s]level\s+security)\b/,
  /\bmigration|migrate|schema\s+change\b/,
  /\b(db|database)\s+(schema|migration|design)/,
  /\bsecurity\s+(audit|review|hardening)/,
  /\bencryption|crypto(graphy)?\b/,
  /\bbilling|payment|stripe|checkout\b/,
  /\bpermission(s)?\s+(model|system|design)/,
  /\b(large|big|major)\s+refactor/,
  /\bplan(ning)?\s+(this|the|a)\s+(rewrite|refactor|migration|architecture)/,
  /\b(architectural|architecture)\s+(decision|review|change)/,
  /\b(failed|broke|broken)\s+(again|repeatedly|multiple)/,
  /\b(audit|review)\s+(everything|the\s+whole|entire)/,
];

export const HAIKU_PATTERNS = [
  /^\s*(why|what|where|when|how|which|who)\b/,
  /\b(summari[sz]e|tldr|tl;dr|give me a summary)\b/,
  /\b(find|locate|search\s+for|grep|where\s+is)\b/,
  /\b(check|inspect|look\s+at|show\s+me)\s+(the\s+)?(log|logs|error|errors|output)/,
  /\b(diagnose|investigate)\b.*\b(error|failure|bug|issue|problem)/,
  /\bexplain\s+(this|that|how|what)\b/,
  /\blist\s+(all|the)\b/,
  /\bread[-\s]only\b/,
];

export function classifyPrompt(text) {
  const normalized = String(text || '').toLowerCase();
  for (const re of OPUS_PATTERNS) if (re.test(normalized)) return 'opus';
  for (const re of HAIKU_PATTERNS) if (re.test(normalized)) return 'haiku';
  return 'sonnet';
}
