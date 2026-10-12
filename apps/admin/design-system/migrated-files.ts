/**
 * El trinquete de la migración (tasks.md, regla 3): en estos archivos un valor literal **bloquea** la
 * integración; en el resto, mientras dura la migración, solo se informa. Cada tarea de vista (T024 a
 * T035) agrega aquí sus archivos, y T050 borra la lista: desde entonces bloquea en todo el panel.
 * Rutas desde la raíz del repositorio.
 */
export const MIGRATED_FILES: readonly string[] = [
  // Nacen limpios: el catálogo también pasa por la compuerta (T021, T022).
  'apps/admin/src/styles/_components.scss',
  'apps/admin/src/styles/_theme.scss',
];
