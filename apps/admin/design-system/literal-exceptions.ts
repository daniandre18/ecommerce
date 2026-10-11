/** Las categorías de FR-004, más `any` para una excepción que vale en todas. */
export type LiteralCategory = 'color' | 'type' | 'space' | 'radius' | 'elevation' | 'border' | 'any';

/** Un valor admitido fuera de los tokens: data-model.md, "Excepción de valor literal". */
export interface LiteralException {
  /** El valor exacto; `<percentage>` admite cualquier porcentaje y `*`, cualquier valor. */
  readonly value: string;
  readonly category: LiteralCategory;
  /** Dónde vale: en todo el panel, o en los archivos nombrados (rutas desde la raíz del repositorio). */
  readonly scope: 'everywhere' | { readonly files: readonly string[] };
  /** Por qué existe. Una excepción sin razón hace fallar la compuerta. */
  readonly reason: string;
}

/**
 * Los únicos valores literales que el panel puede escribir en un estilo de color, tipografía,
 * espaciado, radio, elevación o borde (FR-004). Una excepción sin razón, o cuyo alcance no coincide con
 * ningún archivo, hace fallar la compuerta: una excepción muerta es una puerta abierta que nadie recuerda.
 */
export const LITERAL_EXCEPTIONS: readonly LiteralException[] = [
  { value: '0', category: 'any', scope: 'everywhere', reason: 'Cero no tiene unidad ni tono: es la ausencia de espacio, radio o borde.' },
  { value: 'auto', category: 'any', scope: 'everywhere', reason: 'Lo calcula el navegador a partir del resto del diseño.' },
  { value: 'inherit', category: 'any', scope: 'everywhere', reason: 'Toma el valor del elemento padre, que ya sale del catálogo.' },
  { value: 'none', category: 'any', scope: 'everywhere', reason: 'La ausencia de sombra, borde o contorno.' },
  { value: 'transparent', category: 'color', scope: 'everywhere', reason: 'La ausencia de color: deja ver el plano de abajo.' },
  { value: 'currentColor', category: 'color', scope: 'everywhere', reason: 'El color del texto del elemento, que ya sale del catálogo.' },
  { value: '<percentage>', category: 'any', scope: 'everywhere', reason: 'Una proporción del contenedor, no un paso de ninguna escala.' },
  {
    value: '*',
    category: 'any',
    scope: { files: ['apps/admin/src/index.html'] },
    reason:
      'index-boot: la estructura de arranque se pinta antes de que llegue la hoja global, así que no puede usar var(--ds-*) (research §4). Sus valores son copias de los tokens, verificadas por boot.spec.ts (T026).',
  },
];
