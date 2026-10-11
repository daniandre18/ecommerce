import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTokens } from './compiled-tokens';
import { checkPlanes } from './planes';

// T007 — la mitad de SC-005 que no necesita navegador: en el catálogo, los tres planos son distintos
// en cada esquema y la tarjeta tiene con qué separarse del fondo. Que cada vista los aplique es de la e2e.
const fixture = (name: string) => compileTokens(fileURLToPath(new URL(`./fixtures/planes/${name}.scss`, import.meta.url)));

describe('el verificador de planos', () => {
  it('acepta tres planos distintos en los dos esquemas, con un borde de ancho real', () => {
    expect(checkPlanes(fixture('good'))).toEqual([]);
  });

  it('rechaza dos planos iguales en un esquema y un borde de ancho cero', () => {
    expect(checkPlanes(fixture('bad'))).toEqual([
      '[dark] --ds-surface-card y --ds-surface-bar valen lo mismo (#23232d)',
      '--ds-border-width es 0: la tarjeta no tiene borde con qué separarse del fondo',
    ]);
  });
});

describe('el catálogo del panel', () => {
  it('tiene tres planos distintos en claro y en oscuro, y un borde para la tarjeta', () => {
    expect(checkPlanes(compileTokens())).toEqual([]);
  });
});
