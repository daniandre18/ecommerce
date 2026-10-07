/**
 * Código de barras GTIN de una variante (FR-030), como el SKU: la forma que escribió la persona y,
 * aparte, la normalizada a 14 dígitos sobre la que se evalúa la unicidad y que es el id del
 * documento de `gtinIndex`. Así un EAN-13 y el mismo código con un cero delante chocan.
 */
export interface Gtin {
  readonly raw: string;
  readonly normalized: string;
}

/** EAN-8, UPC-A, EAN-13 y GTIN-14. */
export const GTIN_LENGTHS = [8, 12, 13, 14] as const;

export class InvalidGtinError extends Error {
  override readonly name = 'InvalidGtinError';

  constructor(
    readonly reason: 'length' | 'digits' | 'check-digit',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Valida un GTIN y lo normaliza (FR-030): solo dígitos, de 8, 12, 13 o 14, con el dígito de control
 * GS1 correcto —módulo 10, con pesos 3 y 1 desde la derecha, sin contar el de control—.
 */
export function gtin(input: string): Gtin {
  const raw = input.trim();
  if (!/^\d*$/.test(raw)) throw new InvalidGtinError('digits', 'Un GTIN lleva solo dígitos');
  if (!(GTIN_LENGTHS as readonly number[]).includes(raw.length)) {
    throw new InvalidGtinError('length', `Un GTIN tiene ${GTIN_LENGTHS.join(', ')} dígitos`);
  }
  if (checkDigit(raw.slice(0, -1)) !== Number(raw.at(-1))) {
    throw new InvalidGtinError('check-digit', 'El dígito de control del GTIN no corresponde');
  }
  return Object.freeze({ raw, normalized: raw.padStart(14, '0') });
}

function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // El dígito más cercano al de control pesa 3, el siguiente 1, y así alternando.
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}
