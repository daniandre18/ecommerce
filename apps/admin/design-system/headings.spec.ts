import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileStyles } from './compiled-tokens';
import { headingFindings, globalHeadings } from './headings';
import { panelFiles } from './literals';

// T060: el tipo de h1 y h2 es una sola regla global (_components.scss). Una vista solo cambia lo que es
// suyo, como el margen; si repite el tipo, vuelve a pagar los bytes y puede apartarse del catálogo.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = 'apps/admin/design-system/fixtures/headings';

describe('la compuerta de títulos', () => {
  it('encuentra el tipo de un h1 o un h2 en los estilos de una vista, y deja el margen', () => {
    expect(headingFindings(ROOT, [`${FIXTURES}/page.ts`, `${FIXTURES}/section.scss`])).toEqual([
      `${FIXTURES}/page.ts:10  h1 { font }: el tipo de los títulos es global (_components.scss); la vista solo cambia lo suyo, como el margen`,
      `${FIXTURES}/page.ts:11  h1 { letter-spacing }: el tipo de los títulos es global (_components.scss); la vista solo cambia lo suyo, como el margen`,
      `${FIXTURES}/section.scss:7  .card h2 { font-weight }: el tipo de los títulos es global (_components.scss); la vista solo cambia lo suyo, como el margen`,
    ]);
  });
});

describe('el panel', () => {
  it('declara el tipo de h1 y h2 una sola vez, en _components.scss', () => {
    expect(globalHeadings(compileStyles())).toEqual({
      h1: { margin: '0 0 var(--ds-space-4)', font: 'var(--ds-type-page-title)', 'letter-spacing': 'var(--ds-type-page-title-tracking)' },
      h2: { margin: '0 0 var(--ds-space-2)', font: 'var(--ds-type-section-title)' },
    });
  });

  it('ninguna vista repite el tipo de un título', () => {
    expect(headingFindings(ROOT, panelFiles(ROOT))).toEqual([]);
  });
});
