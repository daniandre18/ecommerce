import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// T103 de la 002 — la frontera de capas, verificada sobre lo que de verdad llega al navegador. La
// regla de módulos impide que el panel importe el barril de `@ecommerce/application`; esta prueba lee
// el metafile de esbuild del build de producción y falla si algún fragmento del panel trae código del
// proyecto de servidor: casos de uso, puertos de repositorio, servicio de autorización. Esos casos de
// uso tienen campos estáticos con efecto (`requires = requirePermission(...)`) que esbuild no puede
// descartar: importados por cualquier camino, viajan enteros. Se corre con `npx nx run admin:bundle-check`,
// que construye antes.

const STATS = fileURLToPath(new URL('../../../dist/apps/admin/browser-stats.json', import.meta.url));
const SERVER = 'libs/application/src/';
const CLIENT = 'libs/application/client/src/';

interface Metafile {
  readonly outputs: Readonly<Record<string, { readonly inputs: Readonly<Record<string, { readonly bytesInOutput: number }>> }>>;
}

function readMetafile(): Metafile {
  if (!existsSync(STATS)) throw new Error(`No está ${STATS}. Corre "npx nx run admin:bundle-check", que construye el panel antes.`);
  return JSON.parse(readFileSync(STATS, 'utf8')) as Metafile;
}

describe('el bundle del panel', () => {
  const chunks = Object.entries(readMetafile().outputs).filter(([name]) => name.endsWith('.js'));
  const inputsOf = (chunk: Metafile['outputs'][string]) => Object.keys(chunk.inputs);

  it('se lee del build de verdad: el dominio y el cliente de application están en sus fragmentos', () => {
    // Sin esto, un cambio en la forma de las rutas del metafile haría pasar la prueba sin verificar nada.
    const inputs = chunks.flatMap(([, chunk]) => inputsOf(chunk));
    expect(inputs.some((path) => path.startsWith('libs/domain/src/'))).toBe(true);
    expect(inputs.some((path) => path.startsWith(CLIENT))).toBe(true);
  });

  it('ningún fragmento trae código de servidor de application', () => {
    const leaks = chunks.flatMap(([name, chunk]) => inputsOf(chunk).filter((path) => path.startsWith(SERVER)).map((path) => `${name}: ${path}`));
    expect(leaks).toEqual([]);
  });
});
