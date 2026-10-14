import { contrastRatio, parseColor, round2, type Rgba } from './color';
import type { CompiledTokens, Scheme } from './compiled-tokens';
import { layered, MARGIN, THRESHOLD, type ContrastKind, type ContrastPair } from './contrast';

/**
 * Los colores semánticos de la paleta no se eligen y después se corrigen: se derivan de su objetivo de
 * contraste (T059 de la 003). Cada uno toma de la referencia solo el tono y la saturación; la
 * luminosidad sale de lo que exige contra cada superficie en la que se usa, en su esquema. Esas
 * superficies no se escriben aquí: son los pares de `contrast-pairs.ts` en los que aparece el color,
 * como primer plano o como fondo. Un uso nuevo es un par nuevo, y el par nuevo vuelve a derivar el color.
 *
 * `palette-derivation.spec.ts` exige que `_palette.scss` tenga exactamente el valor derivado: un hex
 * escrito a mano, o un par nuevo que el color ya no cumple, hace fallar la compuerta.
 */

/** El objetivo de diseño de cada tipo de par: el umbral de WCAG más el margen del panel. */
export const TARGET: Readonly<Record<ContrastKind, number>> = {
  text: round2(THRESHOLD.text + MARGIN),
  'large-text': round2(THRESHOLD['large-text'] + MARGIN),
  ui: round2(THRESHOLD.ui + MARGIN),
  'two-tone': round2(THRESHOLD['two-tone'] + MARGIN),
};

export interface DerivedColor {
  /** La variable de `_palette.scss`, sin el `$`. */
  readonly variable: string;
  readonly scheme: Scheme;
  /** El color de la referencia del que se toman el tono y la saturación (research §2). */
  readonly reference: string;
  /** Qué papel cumple: lo que se documenta en contracts/tokens.md. */
  readonly role: string;
}

/** Los colores que se derivan. El resto de la paleta son planos, tintes de contenedor y "sobre": se verifican, no se derivan. */
export const DERIVED: readonly DerivedColor[] = [
  { variable: 'blue-500', scheme: 'light', reference: '#536dfe', role: 'Primario: texto, enlaces, confirmación de sección y anillo activo' },
  { variable: 'blue-300', scheme: 'dark', reference: '#536dfe', role: 'Primario en oscuro' },
  { variable: 'pink-600', scheme: 'light', reference: '#ff4081', role: 'Error y acción destructiva' },
  { variable: 'pink-400', scheme: 'dark', reference: '#ff4081', role: 'Error y acción destructiva en oscuro' },
  { variable: 'yellow-700', scheme: 'light', reference: '#ffc260', role: 'Aviso (texto)' },
  { variable: 'green-600', scheme: 'light', reference: '#31c2a0', role: 'Éxito' },
  { variable: 'green-400', scheme: 'dark', reference: '#31c2a0', role: 'Éxito en oscuro' },
  { variable: 'violet-600', scheme: 'light', reference: '#9013fe', role: 'Información' },
  { variable: 'violet-300', scheme: 'dark', reference: '#9013fe', role: 'Información en oscuro' },
  { variable: 'gray-600', scheme: 'light', reference: '#6e6e6e', role: 'Texto secundario' },
  { variable: 'gray-350', scheme: 'dark', reference: '#6e6e6e', role: 'Texto secundario en oscuro' },
  { variable: 'gray-500', scheme: 'light', reference: '#80809a', role: 'Contorno de control' },
  { variable: 'gray-550', scheme: 'dark', reference: '#80809a', role: 'Contorno de control en oscuro' },
];

/** Un lado de un par: un valor fijo, o el color que se está derivando. */
export type Side = string | 'self';

export interface Requirement {
  readonly pair: string;
  readonly foreground: Side;
  readonly background: Side;
  /** Los velos del estado del par (contrast.ts, `layers`), que también pueden ser del color mismo. */
  readonly layers: readonly { readonly color: Side; readonly opacity: number }[];
  readonly kind: ContrastKind;
  readonly target: number;
}

/** La razón de un requisito si el color derivado vale `hex`. */
export function ratioOf(requirement: Requirement, hex: string): number {
  const at = (side: Side) => (side === 'self' ? hex : side);
  const background = requirement.layers.length ? layered(at(requirement.background), requirement.layers.map((layer) => ({ color: at(layer.color), opacity: layer.opacity }))) : at(requirement.background);
  return contrastRatio(at(requirement.foreground), background);
}

export interface Derivation {
  readonly hex: string;
  readonly requirements: readonly Requirement[];
  /** La razón más baja que logra, y contra qué par: lo que lo restringe. */
  readonly binding: { readonly pair: string; readonly ratio: number; readonly target: number };
}

/** Las variables de color de `_palette.scss` (`$nombre: #hex !default;`). */
export function paletteColors(scss: string): Map<string, string> {
  const colors = new Map<string, string>();
  for (const match of scss.matchAll(/^\$([\w-]+):\s*(#[0-9a-f]{6})\s*(?:!default\s*)?;/gim)) colors.set(match[1] as string, (match[2] as string).toLowerCase());
  return colors;
}

const same = (a: string, b: string) => {
  try {
    const [x, y] = [parseColor(a), parseColor(b)];
    return x.r === y.r && x.g === y.g && x.b === y.b && x.a === y.a;
  } catch {
    return false;
  }
};

/**
 * Lo que exige el color: cada par en el que un token del esquema resuelve a su valor, en cualquiera de
 * los dos lados o en uno de sus velos de estado.
 */
export function requirementsOf(value: string, scheme: Scheme, tokens: CompiledTokens, pairs: readonly ContrastPair[]): Requirement[] {
  const requirements: Requirement[] = [];
  for (const pair of pairs) {
    // Un deshabilitado no se exige (WCAG lo exime), y el anillo de dos tonos no depende de la paleta semántica.
    if (pair.state === 'disabled' || pair.kind === 'two-tone' || pair.alternate) continue;
    const side = (token: string): Side => (same(tokens.value(token, scheme), value) ? 'self' : tokens.value(token, scheme));
    const layers = (pair.layers ?? []).map((layer) => ({ color: side(layer.color), opacity: layer.opacity ? Number(tokens.value(layer.opacity, scheme)) : 1 }));
    const [foreground, background] = [side(pair.foreground), side(pair.background)];
    if (foreground === 'self' || background === 'self' || layers.some((layer) => layer.color === 'self')) {
      requirements.push({ pair: pair.id, foreground, background, layers, kind: pair.kind, target: TARGET[pair.kind] });
    }
  }
  return requirements;
}

// ── OKLCH: luminosidad perceptual, con tono y croma fijos ────────────────────────────────────────────

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklch({ r, g, b }: Rgba): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map((c) => toLinear(c / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** El color en sRGB, o `undefined` si cae fuera de la gama. */
function fromOklch(L: number, C: number, h: number): string | undefined {
  const [A, B] = [C * Math.cos(h), C * Math.sin(h)];
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const linear = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  if (linear.some((c) => c < -1e-6 || c > 1 + 1e-6)) return undefined;
  return `#${linear.map((c) => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** El color de luminosidad L con el tono de la referencia; si no entra en la gama, con la croma más alta que entra. */
function atLightness(L: number, C: number, h: number): string {
  const inGamut = fromOklch(L, C, h);
  if (inGamut) return inGamut;
  let [low, high] = [0, C];
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (fromOklch(L, mid, h)) low = mid;
    else high = mid;
  }
  return fromOklch(L, low, h) as string;
}

function lowest(hex: string, requirements: readonly Requirement[]) {
  return requirements
    .map((requirement) => ({ pair: requirement.pair, ratio: round2(ratioOf(requirement, hex)), target: requirement.target, slack: ratioOf(requirement, hex) - requirement.target }))
    .reduce((worst, next) => (next.slack < worst.slack ? next : worst));
}

/**
 * La luminosidad más cercana a la de la referencia con la que el color cumple su objetivo contra todas
 * sus superficies a la vez. Si la referencia ya cumple, se queda como está.
 */
export function derive(reference: string, requirements: readonly Requirement[]): Derivation {
  if (requirements.length === 0) throw new Error(`${reference} no aparece en ningún par: no hay contra qué derivarlo`);
  const [L, C, h] = toOklch(parseColor(reference));
  const meets = (hex: string) => requirements.every((requirement) => ratioOf(requirement, hex) >= requirement.target);
  for (let step = 0; step <= 2000; step++) {
    const delta = step * 0.0005;
    for (const candidate of [L - delta, L + delta]) {
      if (candidate < 0 || candidate > 1) continue;
      const hex = atLightness(candidate, C, h);
      if (meets(hex)) {
        const binding = lowest(hex, requirements);
        return { hex, requirements, binding: { pair: binding.pair, ratio: binding.ratio, target: binding.target } };
      }
    }
  }
  throw new Error(`${reference}: ninguna luminosidad cumple a la vez ${requirements.map((r) => r.pair).join(', ')}`);
}
