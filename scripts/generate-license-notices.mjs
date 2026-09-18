import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const lock = JSON.parse(read(path.join(root, 'package-lock.json')));
const env = { ...process.env };
const localCargo = path.join(root, '.tools/cargo/bin/cargo.exe');
if (existsSync(localCargo)) {
  env.CARGO_HOME = path.join(root, '.tools/cargo');
  env.RUSTUP_HOME = path.join(root, '.tools/rustup');
}
const metadata = JSON.parse(execFileSync(existsSync(localCargo) ? localCargo : 'cargo',
  ['metadata', '--manifest-path', path.join(root, 'src-tauri/Cargo.toml'), '--format-version', '1', '--locked', '--offline', '--filter-platform', 'x86_64-pc-windows-msvc'],
  { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const resolved = new Set(metadata.resolve.nodes.map(n => n.id));
const licenseName = /^(?:(?:third[._-]party[._-])?licen[cs]e|copying|notice|copyright|authors)(?:[._-]|$)/i;
function texts(directory) {
  if (!existsSync(directory)) return [];
  const found = [];
  function visit(dir, nested = false) {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) {
        if (nested || /^(?:licenses?|licences?)$/i.test(name)) visit(file, true);
      } else if (nested || licenseName.test(name)) {
        if (!/\.(?:png|ico|exe|dll)$/i.test(name)) found.push({ name: path.relative(directory, file).replaceAll('\\', '/'), text: read(file) });
      }
    }
  }
  visit(directory);
  return found;
}
const entries = [], missing = [];
for (const [directory, pkg] of Object.entries(lock.packages).sort()) {
  if (!directory) continue;
  const name = pkg.name ?? directory.split('node_modules/').at(-1);
  const installed = existsSync(path.join(root, directory, 'package.json'));
  let notices = texts(path.join(root, directory));
  const parentPackages = { '@rolldown/binding-win32-x64-msvc': 'rolldown', '@tauri-apps/cli-win32-x64-msvc': '@tauri-apps/cli' };
  if (!notices.length && parentPackages[name]) {
    const parent = path.join(root, 'node_modules', parentPackages[name]);
    if (JSON.parse(read(path.join(parent, 'package.json'))).version !== pkg.version) throw new Error(`License version mismatch: ${name}`);
    notices = texts(parent);
  }
  if (!notices.length) notices = texts(path.join(root, 'licenses/supplemental', `${name.replaceAll('/', '__')}-${pkg.version}`));
  if (installed && !notices.length) missing.push(`npm:${name}@${pkg.version}`);
  entries.push({ ecosystem: 'npm', name, version: pkg.version, license: pkg.license,
    source: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${pkg.version}.tgz`,
    scope: pkg.dev ? 'development/build only' : 'frontend/runtime',
    status: installed ? 'installed' : 'platform-optional package; not installed or distributed by this Windows build', notices });
}
for (const pkg of metadata.packages.filter(p => p.source && resolved.has(p.id)).sort((a,b) => a.id.localeCompare(b.id))) {
  let notices = texts(path.dirname(pkg.manifest_path));
  if (!notices.length) notices = texts(path.join(root, 'licenses/supplemental', `${pkg.name}-${pkg.version}`));
  if (!notices.length) missing.push(`cargo:${pkg.name}@${pkg.version}`);
  entries.push({ ecosystem: 'cargo', name: pkg.name, version: pkg.version, license: pkg.license,
    source: `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`,
    scope: 'Windows dependency graph (includes build tools)', status: 'unmodified upstream package', notices });
}
if (missing.length) {
  console.error(JSON.stringify({ missingLicenseTexts: missing }, null, 2));
  process.exit(1);
}
const lines = [
  'DesktopPet — third-party dependency licenses',
  'Generated from package-lock.json and the locked Windows Cargo dependency graph.',
  'Original third-party copyright names and contact addresses below are public attribution, not local account data.',
  'Each Source URL provides the exact upstream source version. Dependencies retain their own licenses.',
  'MPL-2.0 components remain available under MPL-2.0 at their Source URLs. No dependency source modifications are shipped.',
  'Development tools and noninstalled optional packages are inventoried for transparency; they are not bundled application code.',
  '',
];
for (const e of entries) {
  lines.push('='.repeat(78), `${e.ecosystem}: ${e.name}@${e.version}`, `License: ${e.license}`, `Scope: ${e.scope}`, `Status: ${e.status}`, `Source: ${e.source}`, '');
  for (const n of e.notices) lines.push(`--- ${n.name} ---`, n.text.trim(), '');
}
writeFileSync(path.join(root, 'THIRD_PARTY_LICENSES.txt'), lines.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ packages: entries.length, npm: entries.filter(e => e.ecosystem === 'npm').length, cargo: entries.filter(e => e.ecosystem === 'cargo').length, missingLicenseTexts: missing }));
