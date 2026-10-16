import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareInitialLoad, describeComparison, measureInitialLoad, type InitialLoad } from './initial-load';

// T016 de la 003 — FR-034, FR-035, SC-007: la carga inicial del build de producción crece 0 B de
// JavaScript y como máximo 10 KB comprimidos de estilos respecto de la base. `run.ts` mide la base antes.
const HEAD = fileURLToPath(new URL('../../../dist/apps/admin/browser/', import.meta.url));
const BASE = fileURLToPath(new URL('../../../dist/base-initial.json', import.meta.url));

describe('la carga inicial del panel', () => {
  it('no crece en JavaScript y crece hasta 10 KB en estilos, respecto de la base', () => {
    if (!existsSync(BASE)) throw new Error(`No está ${BASE}. Corre "npx nx run admin:bundle-check", que mide la base antes.`);
    const base = JSON.parse(readFileSync(BASE, 'utf8')) as InitialLoad & { ref: string; sha: string };
    const head = measureInitialLoad(HEAD);
    console.log(`\nBase: ${base.ref} (${base.sha.slice(0, 7)})\n${describeComparison(base, head)}\n`);
    expect(compareInitialLoad(base, head)).toEqual([]);
  });
});
