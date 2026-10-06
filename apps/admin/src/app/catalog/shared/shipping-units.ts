import type { Dimensions } from '@ecommerce/domain';

// Peso y dimensiones se guardan en gramos y milímetros enteros (FR-014); se escriben y se muestran en
// kilos y centímetros, que es como los dice la gente.

/** Gramos a kilos, o milímetros a centímetros: `show(450, 1000)` → "0.45". */
export const show = (value: number | null | undefined, unit: number): string => (value == null ? '' : String(value / unit));

/** Lo escrito en kilos o centímetros, en la unidad entera; vacío es `null`. Admite coma decimal. */
export function amount(written: string, unit: number): number | null | 'invalid' {
  const text = written.trim().replace(',', '.');
  if (text === '') return null;
  const value = Math.round(Number(text) * unit);
  return Number.isFinite(value) && value > 0 ? value : 'invalid';
}

/** "30 × 20 × 2", en centímetros. */
export function showDimensions(mm: Dimensions | null | undefined): string {
  return mm ? [mm.length, mm.width, mm.height].map((side) => show(side, 10)).join(' × ') : '';
}

/** "60 x 40 x 3,5" en centímetros → milímetros; vacío es `null`; a medias o mal escrito, 'invalid'. */
export function parseDimensions(written: string): Dimensions | null | 'invalid' {
  if (written.trim() === '') return null;
  const sides = written.split(/[x×*]/i).map((side) => amount(side, 10));
  if (sides.length !== 3 || sides.some((side) => side === null || side === 'invalid')) return 'invalid';
  const [length, width, height] = sides as number[];
  return { length: length as number, width: width as number, height: height as number };
}
