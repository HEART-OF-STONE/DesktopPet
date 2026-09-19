import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// Inspect only public-source candidates. Never read ignored local credentials or logs.
const staged = process.argv.includes('--staged');
const args = staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
const files = [...new Set(execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean))];
const forbidden = /(?:^|\/)(?:\.env(?:\..+)?|auth\.json|credentials\.json|secrets\.json|agent-bridge\.json|release-settings\.json|state(?:\.backup)?\.json|integrations(?:\.backup)?\.json|position\.json|restore-point\.json|\.codex|\.agents|\.cache|\.tools|node_modules|target|output|user-data|test-data|logs)(?:\/|$)|\.(?:pem|key|p12|pfx|keystore|jks|jsonl|db|sqlite3?|dmp)$/i;
const rules = [
  ['private key', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['API credential', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['Slack credential', /\bxox[baprs]-[A-Za-z0-9-]{25,}\b/],
  ['authenticated URL', /https?:\/\/[^\s/@:"'<>]+:[^\s/@"'<>]+@/],
];
const findings = [];
for (const file of files) {
  if (forbidden.test(file) && file !== '.env.example') { findings.push(`${file}: private runtime path`); continue; }
  let bytes;
  if (staged) bytes = execFileSync('git', ['show', `:${file}`], { maxBuffer: 32 * 1024 * 1024 });
  else { if (!existsSync(file)) continue; bytes = readFileSync(file); }
  if (bytes.includes(0)) continue;
  const content = bytes.toString('utf8');
  for (const [name, pattern] of rules) if (pattern.test(content)) findings.push(`${file}: ${name}`);
  for (const candidate of content.matchAll(/[A-Za-z0-9+/]{100,}={0,2}/g)) {
    const decoded = Buffer.from(candidate[0], 'base64').toString('utf8');
    if (/^untrusted comment: (?!signature\b)[^\r\n]*(?:secret|private) key/i.test(decoded)) { findings.push(`${file}: encoded signing private key`); break; }
  }
}
if (findings.length) { console.error('Public source check blocked (values are never printed):\n' + findings.join('\n')); process.exit(1); }
console.log(`Public source check passed: ${files.length} files${staged ? ' (staged contents)' : ''}. This check does not audit past commits.`);
