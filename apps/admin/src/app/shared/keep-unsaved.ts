/**
 * Para un borrador que sigue a lo guardado (`linkedSignal`): cada campo que la persona cambió y
 * todavía no guardó se conserva; el resto toma lo que llegó del servidor. Así una actualización en
 * tiempo real no pisa lo que se está escribiendo (FR-039).
 */
export function keepUnsaved<T extends object>(stored: T, previous?: { readonly source: T; readonly value: T }): T {
  if (!previous) return stored;
  const merged = { ...stored };
  for (const field of Object.keys(stored) as (keyof T)[]) {
    if (previous.value[field] !== previous.source[field]) merged[field] = previous.value[field];
  }
  return merged;
}
