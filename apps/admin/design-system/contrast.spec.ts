import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTokens } from './compiled-tokens';
import { checkCoverage, checkPairs, type ContrastPair } from './contrast';
import { CONTRAST_PAIRS } from './contrast-pairs';

// T005 — FR-029 a FR-031, SC-002: cada par se calcula con los valores reales de los tokens, en los
// dos esquemas, y se compara con su umbral y con la razón declarada. Las reglas son las de
// data-model.md, "Par de contraste".
const fixture = compileTokens(fileURLToPath(new URL('./fixtures/contrast/tokens.scss', import.meta.url)));

const pair = (overrides: Partial<ContrastPair> & Pick<ContrastPair, 'foreground' | 'background' | 'declared'>): ContrastPair => ({
  id: `${overrides.foreground.slice(5)}/${overrides.background.slice(5)}`,
  kind: 'text',
  state: 'rest',
  plane: 'card',
  ...overrides,
});

describe('el verificador de contraste', () => {
  const primaryOnCard = pair({ foreground: '--ds-text-primary', background: '--ds-surface-card', declared: { light: 8.86, dark: 13.21 } });

  it('acepta un par que cumple su umbral y coincide con lo declarado', () => {
    expect(checkPairs(fixture, [primaryOnCard])).toEqual([]);
  });

  it('rechaza un par bajo el umbral de su tipo, por esquema', () => {
    const faint = pair({ foreground: '--ds-text-faint', background: '--ds-surface-card', declared: { light: 1.92, dark: 1.61 } });
    expect(checkPairs(fixture, [faint])).toEqual([
      'text-faint/surface-card [light]: calculada 1,92 < 4,5 (text)',
      'text-faint/surface-card [dark]: calculada 1,61 < 4,5 (text)',
    ]);
  });

  it('rechaza una razón declarada que no coincide con la calculada', () => {
    const wrong = { ...primaryOnCard, declared: { light: 8.9, dark: 13.21 } };
    expect(checkPairs(fixture, [wrong])).toEqual(['text-primary/surface-card [light]: declarada 8,90, calculada 8,86']);
  });

  it('un texto grande o un componente de interfaz se miden contra 3, no contra 4,5', () => {
    const large = pair({ foreground: '--ds-text-faint', background: '--ds-surface-card', kind: 'large-text', declared: { light: 1.92, dark: 1.61 } });
    expect(checkPairs(fixture, [large])[0]).toBe('text-faint/surface-card [light]: calculada 1,92 < 3 (large-text)');
  });

  it('un par deshabilitado no se exige (WCAG lo exime), pero su razón declarada sí se verifica', () => {
    const disabled = pair({ foreground: '--ds-text-faint', background: '--ds-surface-card', kind: 'ui', state: 'disabled', declared: { light: 1.92, dark: 1.61 } });
    expect(checkPairs(fixture, [disabled])).toEqual([]);
    expect(checkPairs(fixture, [{ ...disabled, declared: { light: 2, dark: 1.61 } }])).toEqual(['text-faint/surface-card [light]: declarada 2,00, calculada 1,92']);
  });

  it('rechaza un par que nombra un token que no existe', () => {
    const ghost = pair({ foreground: '--ds-text-ghost', background: '--ds-surface-card', declared: { light: 5, dark: 5 } });
    expect(checkPairs(fixture, [ghost])).toEqual([expect.stringContaining('--ds-text-ghost')]);
  });

  it('exige que todo token de texto esté en un par, contra los tres planos, y el foco contra los planos, el superpuesto y el acento', () => {
    const problems = checkCoverage(fixture, [primaryOnCard]);
    expect(problems).toContain('--ds-text-orphan aparece en _tokens.scss y en ningún par');
    expect(problems).toContain('--ds-text-primary no se declara contra --ds-surface-page');
    expect(problems).toContain('--ds-text-primary no se declara contra --ds-surface-bar');
    expect(problems).toContain('--ds-focus-ring no se declara contra --ds-action-accent');
    expect(problems).not.toContain('--ds-text-primary no se declara contra --ds-surface-card');
  });
});

describe('el catálogo del panel', () => {
  const tokens = compileTokens();

  it('el 100 % de los pares cumple AA en los dos esquemas, con la razón declarada (SC-002)', () => {
    expect(checkPairs(tokens, CONTRAST_PAIRS)).toEqual([]);
  });

  it('ningún token de texto, de "sobre" ni el foco quedan sin par', () => {
    expect(checkCoverage(tokens, CONTRAST_PAIRS)).toEqual([]);
  });
});
