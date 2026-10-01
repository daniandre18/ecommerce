import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Empaqueta las funciones en un único archivo con las librerías del monorepo adentro: Cloud Functions
// instala dependencias desde un package.json y no conoce los alias de TypeScript. Solo el SDK de
// Firebase queda afuera, con la versión exacta del package.json de la raíz.

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const outdir = path('../../dist/apps/functions/');
const RUNTIME = ['firebase-admin', 'firebase-functions'] as const;

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path('src/index.ts')],
  tsconfig: path('tsconfig.json'),
  outfile: `${outdir}index.js`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: [...RUNTIME],
  sourcemap: true,
  logLevel: 'warning',
});

const root = JSON.parse(await readFile(path('../../package.json'), 'utf8')) as { dependencies: Record<string, string> };
const deployManifest = {
  name: 'ecommerce-functions',
  private: true,
  main: 'index.js',
  engines: { node: '22' },
  dependencies: Object.fromEntries(RUNTIME.map((name) => [name, root.dependencies[name]])),
};
await writeFile(`${outdir}package.json`, `${JSON.stringify(deployManifest, null, 2)}\n`);
