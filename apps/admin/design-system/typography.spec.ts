import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTokens } from './compiled-tokens';
import { checkTypography } from './typography';
import { TYPOGRAPHY_LEVELS } from './typography-levels';

// T006 — FR-015: cada nivel se diferencia del siguiente en al menos dos atributos entre tamaño, peso,
// color y espaciado. El espaciado entre letras y el interlineado cuentan como uno solo
// (contracts/tokens.md). Un nivel que solo cambia el tamaño, o solo el peso, no cumple.
const fixture = compileTokens(fileURLToPath(new URL('./fixtures/typography/tokens.scss', import.meta.url)));

describe('el verificador de jerarquía tipográfica', () => {
  it('acepta niveles que difieren en dos atributos o más', () => {
    expect(
      checkTypography(fixture, [
        { level: 'title', color: '--ds-text-primary' },
        { level: 'heading', color: '--ds-text-primary' },
        { level: 'strong', color: '--ds-text-primary' },
      ]),
    ).toEqual([]);
  });

  it('rechaza dos niveles contiguos que solo cambian de peso', () => {
    expect(
      checkTypography(fixture, [
        { level: 'strong', color: '--ds-text-primary' },
        { level: 'plain', color: '--ds-text-primary' },
      ]),
    ).toEqual(['strong → plain: difieren solo en [peso]; FR-015 pide al menos dos de tamaño, peso, color y espaciado']);
  });

  it('el color cuenta como atributo: peso y color ya son dos', () => {
    expect(
      checkTypography(fixture, [
        { level: 'strong', color: '--ds-text-primary' },
        { level: 'plain', color: '--ds-text-secondary' },
      ]),
    ).toEqual([]);
  });

  it('rechaza un nivel sin sus tokens', () => {
    expect(checkTypography(fixture, [{ level: 'ghost', color: '--ds-text-primary' }])).toEqual([expect.stringContaining('--ds-type-ghost-size')]);
  });
});

describe('la escala del panel', () => {
  it('tiene los seis niveles de FR-014, y cada uno se distingue del siguiente (FR-015)', () => {
    expect(TYPOGRAPHY_LEVELS.map((level) => level.level)).toEqual(['page-title', 'section-title', 'subtitle', 'body', 'label', 'help']);
    expect(checkTypography(compileTokens(), TYPOGRAPHY_LEVELS)).toEqual([]);
  });
});
