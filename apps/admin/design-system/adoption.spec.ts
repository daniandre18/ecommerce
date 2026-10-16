import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { adoptionFiles, checkAdoption } from './adoption';

// T051 — FR-021a: un componente de Material que el panel todavía no usa tiene su tratamiento definido y
// sin emitir. Quien lo adopte tiene que incluir su mixin en el mismo cambio (research §11).
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = 'apps/admin/design-system/fixtures/adoption';
const scss = (name: string) => readFileSync(join(ROOT, FIXTURES, name), 'utf8');

describe('la compuerta de adopción', () => {
  it('falla si una vista importa un componente sin tratamiento y su mixin no está incluido', () => {
    expect(checkAdoption(ROOT, [`${FIXTURES}/uses-paginator.ts`], scss('without-include.scss'))).toEqual([
      `${FIXTURES}/uses-paginator.ts importa @angular/material/paginator y _components.scss no incluye ds-paginator. Ver contracts/component-treatments.md, "Adoptar uno de estos componentes"`,
    ]);
  });

  it('pasa cuando el mixin está incluido, no solo definido', () => {
    expect(checkAdoption(ROOT, [`${FIXTURES}/uses-paginator.ts`], scss('with-include.scss'))).toEqual([]);
  });
});

describe('el panel', () => {
  it('no usa ninguno de los cinco componentes sin su tratamiento', () => {
    const components = readFileSync(join(ROOT, 'apps/admin/src/styles/_components.scss'), 'utf8');
    expect(checkAdoption(ROOT, adoptionFiles(ROOT), components)).toEqual([]);
  });
});
