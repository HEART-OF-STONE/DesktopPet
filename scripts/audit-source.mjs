// Read-only audit: output locations and categories, never matching secret text.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
const git = (...args) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['provider-token', /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{15,})\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g],
  ['credential-literal-review', /["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|token)["']?\s*[:=]\s*["'][^"'\r\n]{6,}["']/gi],
  ['absolute-local-path', /(?:[A-Z]:[\\/](?:[^\s"'<>`]|\\){2,}|\/(?:Users|home)\/[A-Za-z0-9._-]+\/)/g],
  ['email-review', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['embedded-url-credential', /https?:\/\/[^\s/@:]+:[^\s/@]+@/gi],
  ['bearer-token-review', /\bBearer\s+[A-Za-z0-9_+/.=-]{16,}/g],
  ['npm-auth-review', /(?:_authToken|_password|_auth)\s*=\s*[^\s$][^\s]{8,}/gi],
];
const findings=[];
function scan(location, data) {
  if (data.includes(0)) return;
  const text=data.toString('utf8');
  for(const [type,re] of rules) {
    re.lastIndex=0;
    for(const m of text.matchAll(re)) findings.push({location, line:text.slice(0,m.index).split('\n').length, type});
  }
}
const candidates=git('ls-files','--cached','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
for(const p of new Set(candidates)) if(existsSync(p)) scan(`worktree:${p}`,readFileSync(p));
const objects=git('cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype)').toString().trim().split('\n');
const locations=new Map();
for(const line of git('rev-list','--objects','--all','--reflog').toString().split('\n')) {
  const i=line.indexOf(' '); if(i>0) locations.set(line.slice(0,i),line.slice(i+1));
}
let blobs=0, commits=0, tags=0;
for(const row of objects) {
  const [oid,type]=row.trim().split(' ');
  if(!['blob','commit','tag'].includes(type)) continue;
  if(type==='blob') blobs++; else if(type==='commit') commits++; else tags++;
  scan(`git:${oid}:${locations.get(oid)??type}`,git('cat-file',type,oid));
}
const ignoredTracked=git('ls-files','-ci','--exclude-standard','-z').toString().split('\0').filter(Boolean);
console.log(JSON.stringify({scope:{workingFiles:new Set(candidates).size,blobs,commits,tags,allObjectsIncludingUnreachable:true},ignoredTracked,findings},null,2));
