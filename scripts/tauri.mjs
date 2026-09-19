import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoHome = path.join(root, '.tools', 'cargo');
const rustupHome = path.join(root, '.tools', 'rustup');
const env = { ...process.env };
if (existsSync(path.join(cargoHome, 'bin', 'cargo.exe'))) {
  env.CARGO_HOME = cargoHome;
  env.RUSTUP_HOME = rustupHome;
  env.PATH = `${path.join(cargoHome, 'bin')}${path.delimiter}${env.PATH}`;
}
const args = process.argv.slice(2);
const checking = args[0] === 'check';
const verifying = args[0] === 'verify-update';
const command = checking || verifying ? 'cargo' : process.execPath;
const commandArgs = checking
  ? ['test', '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml')]
  : verifying ? ['run', '--locked', '--offline', '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml'), '--example', 'verify-update', '--', ...args.slice(1)]
  : [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...args];
const child = spawn(command, commandArgs, { cwd: root, env, stdio: 'inherit', shell: false });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
