import { composite, contrastRatio, parseColor, round2 } from './color';
import type { CompiledTokens, Scheme } from './compiled-tokens';

export type ContrastKind = 'text' | 'large-text' | 'ui' | 'two-tone';
export type ContrastState = 'rest' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error' | 'empty';
export type ContrastPlane = 'page' | 'card' | 'bar' | 'overlay' | 'control';
export type DsToken = `--ds-${string}`;

/** Un par de color del catálogo: data-model.md, "Par de contraste". */
export interface ContrastPair {
  readonly id: string;
  readonly foreground: DsToken;
  /**
   * El otro tono de un indicador de dos tonos (el anillo de foco): contra el fondo cuenta el tono que
   * más contrasta, porque basta con que uno de los dos se distinga (técnica C40 de WCAG).
   */
  readonly alternate?: DsToken;
  readonly background: DsToken;
  /**
   * Velos que Material pinta sobre el fondo en un estado, en orden: hover o foco, y la onda al presionar
   * (T058). Cada uno es un color a una opacidad, los dos como tokens. Sin esto, el par mide el reposo.
   */
  readonly layers?: readonly Layer[];
  readonly kind: ContrastKind;
  readonly state: ContrastState;
  readonly plane: ContrastPlane;
  /** La razón por esquema, con dos decimales. */
  readonly declared: { readonly light: number; readonly dark: number };
}

export interface Layer {
  readonly color: DsToken;
  /** Sin opacidad, la capa va entera: un token que ya trae su transparencia, como `--ds-surface-hover`. */
  readonly opacity?: DsToken;
}

/** El fondo con sus velos compuestos encima, opaco, como `rgb(...)`. */
export function layered(background: string, layers: readonly { readonly color: string; readonly opacity: number }[]): string {
  let bottom = parseColor(background);
  for (const layer of layers) {
    const top = parseColor(layer.color);
    bottom = composite({ ...top, a: top.a * layer.opacity }, bottom);
  }
  return `rgb(${bottom.r}, ${bottom.g}, ${bottom.b})`;
}

/** El fondo de un par en un esquema: el token, con los velos de su estado si los declara. */
export function backgroundOf(tokens: CompiledTokens, pair: ContrastPair, scheme: Scheme): string {
  const background = tokens.value(pair.background, scheme);
  if (!pair.layers?.length) return background;
  return layered(background, pair.layers.map((layer) => ({ color: tokens.value(layer.color, scheme), opacity: layer.opacity ? Number(tokens.value(layer.opacity, scheme)) : 1 })));
}

/**
 * WCAG 2.2 AA (FR-030). `two-tone` es la razón entre los dos tonos de un indicador (técnica C40): con
 * 9:1 entre ellos, todo fondo contrasta 3:1 o más con uno de los dos.
 */
export const THRESHOLD: Readonly<Record<ContrastKind, number>> = { text: 4.5, 'large-text': 3, ui: 3, 'two-tone': 9 };

/**
 * Política de margen del panel: cada par exige 0,5 sobre su umbral de WCAG (5,0 para texto, 3,5 para
 * componentes). Con 0,2, seis colores compartidos tuvieron que moverse para entrar, y varios pares
 * quedaron a 0,01 del mínimo: un velo del 5 % los bajaba de AA (T058). Con 0,5, la paleta se deriva de
 * ese objetivo (palette-derivation.ts) y un ajuste futuro de un fondo no la tumba (T059).
 */
export const MARGIN = 0.5;

const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const PLANES: readonly DsToken[] = ['--ds-surface-page', '--ds-surface-card', '--ds-surface-bar'];
const FOCUS_BACKGROUNDS: readonly DsToken[] = [...PLANES, '--ds-surface-overlay', '--ds-action-accent'];
const FOCUS_INNER = '--ds-focus-ring-inner';
const FOCUS_OUTER = '--ds-focus-ring-outer';

const decimal = (value: number) => (Number.isInteger(value) ? String(value) : String(value).replace('.', ','));
const fixed = (value: number) => value.toFixed(2).replace('.', ',');

/** Cada par contra su umbral y contra la razón declarada, en los dos esquemas (FR-031). */
export function checkPairs(tokens: CompiledTokens, pairs: readonly ContrastPair[]): string[] {
  const problems: string[] = [];
  for (const pair of pairs) {
    for (const scheme of SCHEMES) {
      let ratio: number;
      try {
        const background = backgroundOf(tokens, pair, scheme);
        const tones = [pair.foreground, ...(pair.alternate ? [pair.alternate] : [])];
        ratio = round2(Math.max(...tones.map((tone) => contrastRatio(tokens.value(tone, scheme), background))));
      } catch (error) {
        problems.push(`${pair.id} [${scheme}]: ${(error as Error).message}`);
        break;
      }
      const threshold = THRESHOLD[pair.kind];
      const required = round2(threshold + MARGIN);
      // WCAG exime a los controles deshabilitados: se declaran para que se vean, no se exigen.
      if (pair.state !== 'disabled' && ratio < required) {
        problems.push(`${pair.id} [${scheme}]: calculada ${fixed(ratio)} < ${decimal(required)} (${pair.kind}: ${decimal(threshold)} de WCAG + ${decimal(MARGIN)} de margen)`);
      }
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
  const mustPair = tokens.names().filter((name) => /^--ds-(text|on|icon)-/.test(name) || name === FOCUS_INNER || name === FOCUS_OUTER);
  const appears = (token: string) => pairs.some((pair) => pair.foreground === token || pair.alternate === token || (pair.kind === 'two-tone' && pair.background === token));
  for (const token of mustPair) {
    if (!appears(token)) problems.push(`${token} aparece en _tokens.scss y en ningún par`);
  }
  for (const token of tokens.names().filter((name) => name.startsWith('--ds-text-'))) {
    if (foregrounds(token).length === 0) continue;
    for (const plane of PLANES) {
      if (!foregrounds(token).some((pair) => pair.background === plane)) problems.push(`${token} no se declara contra ${plane}`);
    }
  }
  if (tokens.names().includes(FOCUS_INNER)) {
    const twoTone = pairs.some((pair) => pair.kind === 'two-tone' && pair.foreground === FOCUS_INNER && pair.background === FOCUS_OUTER);
    if (!twoTone) problems.push(`El anillo de foco no declara el par de dos tonos entre ${FOCUS_INNER} y ${FOCUS_OUTER} (C40)`);
    // Lo garantiza el par de dos tonos; contra cada fondo se declara igual, para que el margen se vea.
    for (const background of FOCUS_BACKGROUNDS) {
      if (!foregrounds(FOCUS_INNER).some((pair) => pair.background === background && pair.alternate === FOCUS_OUTER)) problems.push(`${FOCUS_INNER} no se declara contra ${background}`);
    }
  }
  return problems;
}
