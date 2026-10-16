import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTokens } from './compiled-tokens';
import type { LiteralException } from './literal-exceptions';
import { LITERAL_EXCEPTIONS } from './literal-exceptions';
import { checkLiterals, panelFiles, type LiteralsResult } from './literals';

// T008 — FR-004, FR-005, SC-001: ningún color, tamaño de fuente, espaciado, radio, elevación ni ancho
// de borde escrito a mano en los estilos del panel, con el token sugerido para cada hallazgo
// (research §5). Las reglas se prueban contra fixtures/literals/; la última, contra el panel.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = 'apps/admin/design-system/fixtures/literals';
const tokens = compileTokens();

const BASE: LiteralException[] = LITERAL_EXCEPTIONS.filter((exception) => exception.scope === 'everywhere');

function run(files: string[], options: { exceptions?: LiteralException[] } = {}): LiteralsResult {
  return checkLiterals({ root: ROOT, files: files.map((file) => `${FIXTURES}/${file}`), tokens, exceptions: options.exceptions ?? BASE });
}

const lines = (result: LiteralsResult) => result.findings.map((finding) => finding.message);

describe('el verificador de literales', () => {
  it('rechaza exactamente los cuatro valores a mano, con archivo, línea, columna y token sugerido (historia 4, escenario 1)', () => {
    expect(lines(run(['views/four.scss']))).toEqual([
      `${FIXTURES}/views/four.scss:3:3  color: #ff0000  → usa var(--ds-status-error)`,
      `${FIXTURES}/views/four.scss:4:3  font-size: 13px  → usa var(--ds-type-help-size)`,
      `${FIXTURES}/views/four.scss:5:3  padding: 10px  → usa var(--ds-space-2)`,
      `${FIXTURES}/views/four.scss:6:3  border-radius: 3px  → usa var(--ds-radius-sm)`,
    ]);
  });

  it('acepta los tokens y las excepciones declaradas (historia 4, escenario 2)', () => {
    expect(lines(run(['views/clean.scss']))).toEqual([]);
  });

  it('ve las formas de esquivar el catálogo: calc con literal, --mat-sys-*, una sombra, un borde y una propiedad propia', () => {
    expect(lines(run(['views/escapes.scss']))).toEqual([
      `${FIXTURES}/views/escapes.scss:3:3  margin: calc(100% - 16px)  → usa var(--ds-space-4)`,
      `${FIXTURES}/views/escapes.scss:4:3  color: var(--mat-sys-primary)  → usa un --ds-*; los --mat-sys-* solo en _theme.scss`,
      `${FIXTURES}/views/escapes.scss:5:3  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2)  → usa var(--ds-elevation-card)`,
      `${FIXTURES}/views/escapes.scss:6:3  border: 1px solid var(--ds-border-subtle)  → usa var(--ds-border-width)`,
      `${FIXTURES}/views/escapes.scss:7:3  --local-gap: 8px  → usa var(--ds-space-2)`,
    ]);
  });

  it('en un .ts lee los estilos en línea y la plantilla, y da la línea del .ts', () => {
    expect(lines(run(['views/inline.ts']))).toEqual([
      `${FIXTURES}/views/inline.ts:5:24  padding: 4px  → usa var(--ds-space-1)`,
      `${FIXTURES}/views/inline.ts:9:7  gap: 8px  → usa var(--ds-space-2)`,
      `${FIXTURES}/views/inline.ts:21:9  font-weight: 600  → usa var(--ds-type-section-title-weight)`,
      // En la misma línea del .ts: la columna se cuenta desde donde empieza la cadena.
      `${FIXTURES}/views/inline.ts:31:18  gap: 4px  → usa var(--ds-space-1)`,
    ]);
  });

  it('en _theme.scss admite la paleta y nada más', () => {
    expect(lines(run(['styles/_theme.scss']))).toEqual([
      `${FIXTURES}/styles/_theme.scss:11:3  color: #3c5afe  → usa var(--ds-primary)`,
      `${FIXTURES}/styles/_theme.scss:15:3  color: $local  → una variable Sass que no viene de la paleta`,
    ]);
  });

  // T050: sin trinquete. Un valor fuera del catálogo bloquea en cualquier archivo del panel.
  it('todo hallazgo bloquea, en cualquier archivo', () => {
    const result = run(['views/four.scss', 'views/escapes.scss']);
    expect(result.findings.map((finding) => finding.file)).toEqual([...Array(5).fill(`${FIXTURES}/views/escapes.scss`), ...Array(4).fill(`${FIXTURES}/views/four.scss`)]);
  });

  it('una excepción de alcance general que nada usa está muerta', () => {
    const exceptions: LiteralException[] = [...BASE, { value: '7px', category: 'space', scope: 'everywhere', reason: 'nadie la usa' }];
    expect(run(['views/four.scss'], { exceptions }).unused).toContain('La excepción "7px" (space) no excusa ningún valor del panel');
  });

  it('rechaza una excepción sin razón y una cuyo alcance no coincide con ningún archivo', () => {
    const result = run(['views/clean.scss'], {
      exceptions: [...BASE, { value: '8px', category: 'space', scope: 'everywhere', reason: '' }, { value: '*', category: 'any', scope: { files: ['apps/admin/src/no-existe.html'] }, reason: 'muerta' }],
    });
    expect(result.problems).toEqual([
      'La excepción "8px" (space) no dice por qué existe',
      'La excepción "*" (any) no coincide con ningún archivo: apps/admin/src/no-existe.html',
    ]);
  });
});

describe('el panel', () => {
  const result = checkLiterals({ root: ROOT, files: panelFiles(ROOT), tokens, exceptions: LITERAL_EXCEPTIONS });

  it('no tiene ningún valor fuera del catálogo (SC-001)', () => {
    expect(result.findings.map((finding) => finding.message)).toEqual([]);
  });

  it('ninguna excepción del catálogo está mal declarada o muerta', () => {
    expect(result.problems).toEqual([]);
    expect(result.unused).toEqual([]);
  });
});
