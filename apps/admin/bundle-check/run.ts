import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureInitialLoad } from './initial-load';

// `npx nx run admin:bundle-check [--base=<ref>]` (T016 de la 003). Construye la rama base en un
// worktree, mide su carga inicial y después corre las pruebas de este directorio: la frontera de capas
// (layers.spec.ts) y el tamaño contra la base (size.spec.ts). La base se mide al integrar, no se guarda
// como número: así otra feature no consume el presupuesto de esta (research §8). Es un solo script, y
// no una cadena de comandos, porque Nx agrega los argumentos al final del comando.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORKTREE = join(ROOT, '.bundle-base');
const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length) || 'origin/main';

const run = (command: string, args: string[], cwd: string) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true' } });

function removeWorktree() {
  if (existsSync(WORKTREE)) execFileSync('git', ['worktree', 'remove', '--force', WORKTREE], { cwd: ROOT });
  rmSync(WORKTREE, { recursive: true, force: true });
  execFileSync('git', ['worktree', 'prune'], { cwd: ROOT });
}

removeWorktree();
const sha = execFileSync('git', ['rev-parse', base], { cwd: ROOT, encoding: 'utf8' }).trim();
console.log(`\nbundle-check: midiendo la base ${base} (${sha.slice(0, 7)})\n`);
execFileSync('git', ['worktree', 'add', '--detach', WORKTREE, sha], { cwd: ROOT, stdio: 'inherit' });
try {
  // Sus propias dependencias: la base tiene otro package.json (I2/U2 del análisis de la 003).
  run('npm', ['ci', '--no-audit', '--no-fund'], WORKTREE);
  run('npx', ['nx', 'run', 'admin:build:production', '--skip-nx-cache'], WORKTREE);
  const load = measureInitialLoad(join(WORKTREE, 'dist/apps/admin/browser'));
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/base-initial.json'), JSON.stringify({ ref: base, sha, ...load }, null, 2));
} finally {
  removeWorktree();
}

const tests = spawnSync('npx', ['vitest', 'run', '--config', 'apps/admin/bundle-check/vite.config.mts'], { cwd: ROOT, stdio: 'inherit' });
process.exit(tests.status ?? 1);
