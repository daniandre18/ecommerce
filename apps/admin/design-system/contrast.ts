import { contrastRatio, round2 } from './color';
import type { CompiledTokens, Scheme } from './compiled-tokens';

export type ContrastKind = 'text' | 'large-text' | 'ui';
export type ContrastState = 'rest' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error' | 'empty';
export type ContrastPlane = 'page' | 'card' | 'bar' | 'overlay' | 'control';
export type DsToken = `--ds-${string}`;

/** Un par de color del catálogo: data-model.md, "Par de contraste". */
export interface ContrastPair {
  readonly id: string;
  readonly foreground: DsToken;
  readonly background: DsToken;
  readonly kind: ContrastKind;
  readonly state: ContrastState;
  readonly plane: ContrastPlane;
  /** La razón por esquema, con dos decimales. */
  readonly declared: { readonly light: number; readonly dark: number };
}

/** WCAG 2.2 AA (FR-030). */
export const THRESHOLD: Readonly<Record<ContrastKind, number>> = { text: 4.5, 'large-text': 3, ui: 3 };

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const PLANES: readonly DsToken[] = ['--ds-surface-page', '--ds-surface-card', '--ds-surface-bar'];
const FOCUS_BACKGROUNDS: readonly DsToken[] = [...PLANES, '--ds-surface-overlay', '--ds-action-accent'];

const decimal = (value: number) => (Number.isInteger(value) ? String(value) : String(value).replace('.', ','));
const fixed = (value: number) => value.toFixed(2).replace('.', ',');

/** Cada par contra su umbral y contra la razón declarada, en los dos esquemas (FR-031). */
export function checkPairs(tokens: CompiledTokens, pairs: readonly ContrastPair[]): string[] {
  const problems: string[] = [];
  for (const pair of pairs) {
    for (const scheme of SCHEMES) {
      let ratio: number;
      try {
        ratio = round2(contrastRatio(tokens.value(pair.foreground, scheme), tokens.value(pair.background, scheme)));
      } catch (error) {
        problems.push(`${pair.id} [${scheme}]: ${(error as Error).message}`);
        break;
      }
      const threshold = THRESHOLD[pair.kind];
      // WCAG exime a los controles deshabilitados: se declaran para que se vean, no se exigen.
      if (pair.state !== 'disabled' && ratio < threshold) problems.push(`${pair.id} [${scheme}]: calculada ${fixed(ratio)} < ${decimal(threshold)} (${pair.kind})`);
      else if (ratio !== pair.declared[scheme]) problems.push(`${pair.id} [${scheme}]: declarada ${fixed(pair.declared[scheme])}, calculada ${fixed(ratio)}`);
    }
  }
  return problems;
}

/**
 * Lo que tiene que estar declarado (data-model.md): todo token de texto, "sobre", ícono y el foco en
 * algún par; todo texto contra los tres planos; el foco contra los planos, el superpuesto y el acento.
 * Sin esto, un color nuevo escaparía a la prueba.
 */
export function checkCoverage(tokens: CompiledTokens, pairs: readonly ContrastPair[]): string[] {
  const problems: string[] = [];
  const foregrounds = (token: string) => pairs.filter((pair) => pair.foreground === token);
  const mustPair = tokens.names().filter((name) => /^--ds-(text|on|icon)-/.test(name) || name === '--ds-focus-ring');
  for (const token of mustPair) {
    if (foregrounds(token).length === 0) problems.push(`${token} aparece en _tokens.scss y en ningún par`);
  }
  for (const token of tokens.names().filter((name) => name.startsWith('--ds-text-'))) {
    if (foregrounds(token).length === 0) continue;
    for (const plane of PLANES) {
      if (!foregrounds(token).some((pair) => pair.background === plane)) problems.push(`${token} no se declara contra ${plane}`);
    }
  }
  if (tokens.names().includes('--ds-focus-ring')) {
    for (const background of FOCUS_BACKGROUNDS) {
      if (!foregrounds('--ds-focus-ring').some((pair) => pair.background === background)) problems.push(`--ds-focus-ring no se declara contra ${background}`);
    }
  }
  return problems;
}
