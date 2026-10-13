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
  // T024: los estados compartidos, que usan todas las vistas.
  'libs/ui/src/lib/states/empty-state.ts',
  'libs/ui/src/lib/states/error-state.ts',
  'libs/ui/src/lib/states/skeleton.ts',
  // T025: los diálogos compartidos.
  'apps/admin/src/app/shared/confirm-dialog.ts',
  'apps/admin/src/app/shared/pending-changes/pending-changes.ts',
  // T026: el marco. Los literales de index.html son copias de tokens, verificadas por boot.spec.ts.
  'apps/admin/src/index.html',
  'apps/admin/src/styles/_shell.scss',
  'apps/admin/src/app/tenant/tenant-shell/tenant-shell.ts',
  // T027: autenticación.
  'apps/admin/src/app/auth/login/login.ts',
  'apps/admin/src/app/auth/sign-up/sign-up.ts',
  // T028: comercios e invitación.
  'apps/admin/src/app/tenant/tenant-switcher/tenant-picker.ts',
  'apps/admin/src/app/team/accept-invitation/accept-invitation.ts',
];
