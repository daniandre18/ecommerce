// Los mapeadores no dependen de ningún SDK: el Admin SDK de las Functions y el SDK web del panel
// devuelven documentos con la misma forma, y así ambos leen con las mismas reglas de conversión.

/** Los campos de un documento de Firestore. */
export type DocumentData = Readonly<Record<string, unknown>>;

/** Las marcas de tiempo de los dos SDK son clases distintas, pero ambas saben convertirse a `Date`. */
interface TimestampLike {
  toDate(): Date;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return typeof value === 'object' && value !== null && typeof (value as Partial<TimestampLike>).toDate === 'function';
}

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (isTimestampLike(value)) return value.toDate();
  throw new TypeError(`Se esperaba una marca de tiempo; se recibió ${String(value)}`);
}

export function toDateOrNull(value: unknown): Date | null {
  return value == null ? null : toDate(value);
}
