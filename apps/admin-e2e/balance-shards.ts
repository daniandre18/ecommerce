import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reparte la e2e en dos mitades por duración medida en CI, no por cantidad de pruebas (research §15 de
 * la 003). Lee los reportes JSON que publica el trabajo `e2e-shard` (artefactos `e2e-durations-*`) y
 * escribe `shards.ts`: los pares proyecto–archivo de la primera mitad. La segunda es todo lo demás, así
 * que una prueba nueva nunca queda fuera de las dos.
 *
 *   gh run download <corrida> --pattern 'e2e-durations-*' --dir <carpeta>
 *   npx tsx apps/admin-e2e/balance-shards.ts <carpeta>/*\/e2e.json
 */

interface Suite {
  readonly file?: string;
  readonly specs?: readonly { readonly tests: readonly { readonly projectName: string; readonly results: readonly { readonly duration: number }[] }[] }[];
  readonly suites?: readonly Suite[];
}

const durations = new Map<string, number>();
const add = (suite: Suite, file?: string) => {
  const current = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const key = `${test.projectName}|${current}`;
      durations.set(key, (durations.get(key) ?? 0) + test.results.reduce((sum, result) => sum + result.duration, 0));
    }
  }
  for (const child of suite.suites ?? []) add(child, current);
};
for (const report of process.argv.slice(2)) for (const suite of (JSON.parse(readFileSync(report, 'utf8')) as { suites: Suite[] }).suites) add(suite);
if (durations.size === 0) throw new Error('Sin duraciones: pasa los e2e.json de las dos mitades');

// El más largo primero, a la mitad más liviana: con grupos de tamaños tan distintos, queda a pocos
// segundos del reparto perfecto.
const halves: [string[], string[]] = [[], []];
const totals: [number, number] = [0, 0];
for (const [key, ms] of [...durations].sort((a, b) => b[1] - a[1])) {
  const lighter = totals[0] <= totals[1] ? 0 : 1;
  halves[lighter].push(key);
  totals[lighter] += ms;
}

const first: Record<string, string[]> = {};
for (const key of halves[0].sort()) {
  const [project, file] = key.split('|') as [string, string];
  (first[project] ??= []).push(file);
}
const seconds = totals.map((ms) => Math.round(ms / 1000));
writeFileSync(
  join(__dirname, 'shards.ts'),
  `// Generado por balance-shards.ts con las duraciones de CI: no se edita a mano.\n` +
    `// Mitad 1: ${seconds[0]} s de pruebas; mitad 2: ${seconds[1]} s (todo lo que no está aquí).\n` +
    `export const FIRST_HALF: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(first, null, 2)};\n`,
);
console.log(`mitad 1: ${seconds[0]} s, mitad 2: ${seconds[1]} s`);
