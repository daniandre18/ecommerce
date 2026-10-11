/** Un color sRGB con canales de 0 a 255 y alfa de 0 a 1. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const NAMED: Readonly<Record<string, Rgba>> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

/** Lo que escribe Sass en el CSS compilado: hex de 3, 4, 6 u 8 dígitos, rgb()/rgba() o un nombre básico. */
export function parseColor(value: string): Rgba {
  const text = value.trim().toLowerCase();
  const named = NAMED[text];
  if (named) return named;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const channel = (index: number) => parseInt(full.slice(index * 2, index * 2 + 2), 16);
    return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) / 255 : 1 };
  }
  const fn = /^rgba?\((.*)\)$/.exec(text)?.[1];
  if (fn) {
    const parts = fn.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every((part) => !Number.isNaN(part))) {
      const [r = 0, g = 0, b = 0, a = 1] = parts;
      return { r, g, b, a };
    }
  }
  throw new Error(`"${value}" no es un color que la prueba de contraste sepa leer`);
}

/** Un color con alfa, pintado sobre un fondo opaco: lo que de verdad ve la persona. */
export function composite(foreground: Rgba, background: Rgba): Rgba {
  const mix = (top: number, bottom: number) => top * foreground.a + bottom * (1 - foreground.a);
  return { r: mix(foreground.r, background.r), g: mix(foreground.g, background.g), b: mix(foreground.b, background.b), a: 1 };
}

/** Luminancia relativa de WCAG 2.2. */
export function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Razón de contraste de WCAG 2.2 entre un primer plano y su fondo. Un primer plano con alfa se compone
 * sobre el fondo; un fondo con alfa no se puede evaluar sin saber sobre qué plano está.
 */
export function contrastRatio(foreground: string, background: string): number {
  const bottom = parseColor(background);
  if (bottom.a < 1) throw new Error(`El fondo "${background}" tiene transparencia: el par tiene que nombrar el plano opaco que lo sostiene`);
  const top = composite(parseColor(foreground), bottom);
  const [light, dark] = [luminance(top), luminance(bottom)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Dos decimales: la precisión con la que se declaran las razones (SC-002). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
