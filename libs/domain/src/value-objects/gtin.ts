/**
 * Código de barras GTIN de una variante (FR-030), como el SKU: la forma que escribió la persona y,
 * aparte, la normalizada a 14 dígitos sobre la que se evalúa la unicidad y que es el id del
 * documento de `gtinIndex`.
 *
 * Por ahora solo el tipo, para que la variante lo declare (T012). La factoría que valida la
 * longitud y el dígito de control GS1 llega con sus pruebas en T083 y T087 (Historia 4).
 */
export interface Gtin {
  readonly raw: string;
  readonly normalized: string;
}
