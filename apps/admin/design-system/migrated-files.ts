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
  // T029: catálogo.
  'apps/admin/src/app/catalog/product-list/product-list.ts',
  'apps/admin/src/app/catalog/product-list/bulk-actions.ts',
  'apps/admin/src/app/catalog/create-product/create-product-dialog.ts',
  // T031: editor de producto, cabecera y secciones de datos.
  'apps/admin/src/app/catalog/product-editor/product-editor.html',
  'apps/admin/src/app/catalog/product-editor/product-editor.scss',
  'apps/admin/src/app/catalog/product-editor/details-section.ts',
  'apps/admin/src/app/catalog/product-editor/storefront-section/storefront-section.html',
  'apps/admin/src/app/catalog/product-editor/storefront-section/storefront-section.scss',
  'apps/admin/src/app/catalog/product-editor/storefront-section/storefront-section.ts',
  'apps/admin/src/app/catalog/product-editor/shipping-section/shipping-section.html',
  'apps/admin/src/app/catalog/product-editor/shipping-section/shipping-section.scss',
  'apps/admin/src/app/catalog/product-editor/shipping-section/shipping-section.ts',
  'apps/admin/src/app/catalog/product-editor/status-control/status-control.html',
  'apps/admin/src/app/catalog/product-editor/status-control/status-control.scss',
  'apps/admin/src/app/catalog/product-editor/presentation-section/presentation-section.ts',
  'apps/admin/src/app/catalog/product-editor/categories-section/categories-section.ts',
  'apps/admin/src/app/catalog/product-editor/external-catalogs-section/external-catalogs-section.ts',
  // T032: editor de producto, variantes, opciones e imágenes.
  'apps/admin/src/app/catalog/variant-table/variant-table.ts',
  'apps/admin/src/app/catalog/variant-table/variant-row.html',
  'apps/admin/src/app/catalog/variant-table/variant-row.scss',
  'apps/admin/src/app/catalog/variant-table/variant-row.ts',
  'apps/admin/src/app/catalog/variant-table/bulk-edit/bulk-edit.ts',
  'apps/admin/src/app/catalog/variant-table/assign-option-dialog/assign-option-dialog.ts',
  'apps/admin/src/app/catalog/variant-table/variant-images-dialog.ts',
  'apps/admin/src/app/catalog/image-upload/image-upload.html',
  'apps/admin/src/app/catalog/image-upload/image-upload.scss',
  'apps/admin/src/app/catalog/image-upload/image-upload.ts',
  'apps/admin/src/app/catalog/image-upload/product-video.ts',
  'apps/admin/src/app/catalog/image-upload/storage-image.ts',
  'apps/admin/src/app/catalog/product-editor/options-editor/options-editor.html',
  'apps/admin/src/app/catalog/product-editor/options-editor/options-editor.scss',
  'apps/admin/src/app/catalog/product-editor/options-editor/options-editor.ts',
  // T033: categorías.
  'apps/admin/src/app/catalog/categories/categories-page.html',
  'apps/admin/src/app/catalog/categories/categories-page.scss',
  'apps/admin/src/app/catalog/categories/categories-page.ts',
  'apps/admin/src/app/catalog/categories/category-row.ts',
  // T034: equipo y rol.
  'apps/admin/src/app/team/team-page.ts',
  'apps/admin/src/app/team/members/members-section.ts',
  'apps/admin/src/app/team/members/invitations-section.ts',
  'apps/admin/src/app/team/members/transfer-ownership-dialog.ts',
  'apps/admin/src/app/team/roles/roles-section.ts',
  'apps/admin/src/app/team/role-editor/role-editor.ts',
  // T035: bitácora.
  'apps/admin/src/app/audit/audit-log/audit-log.ts',
  'apps/admin/src/app/audit/entry-detail/entry-detail.ts',
];
