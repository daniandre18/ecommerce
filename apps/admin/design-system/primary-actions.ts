/** La acción principal declarada de una pantalla: data-model.md, "Acción principal declarada". */
export interface PrimaryAction {
  /** El nombre de la pantalla en `contracts/primary-actions.md`; titula su caso en `design-system.spec.ts`. */
  readonly screen: string;
  readonly kind: 'view' | 'dialog';
  /** La clase del componente: con ella `screens.spec.ts` cruza la lista con las rutas y los diálogos. */
  readonly component: string;
  /** El nombre accesible del botón que lleva el acento, o `null` si la pantalla no tiene acción principal. */
  readonly action: string | null;
  /** Los botones destructivos visibles en reposo (FR-009a): los únicos con el color destructivo. */
  readonly destructive: readonly string[];
  /** Los planos de la pantalla (SC-005): fuera del marco del comercio no hay barra. Un diálogo hereda los de su vista. */
  readonly planes: 'page-card-bar' | 'page-card';
  /** Qué tarea completa la acción, o por qué no hay. */
  readonly why: string;
}

/**
 * Transcripción de `contracts/primary-actions.md`. El principio (FR-008): el acento señala la acción
 * principal de una pantalla; una pantalla sin acción principal no lleva acento. Si la pantalla cambia,
 * esta fila se actualiza en el mismo cambio.
 */
export const PRIMARY_ACTIONS: readonly PrimaryAction[] = [
  // ── Vistas ──────────────────────────────────────────────────────────────────────────────────────
  { screen: 'iniciar sesión', kind: 'view', component: 'Login', action: 'Entrar', destructive: [], planes: 'page-card', why: 'Es la tarea de la vista' },
  { screen: 'crear cuenta', kind: 'view', component: 'SignUp', action: 'Crear cuenta', destructive: [], planes: 'page-card', why: 'Es la tarea de la vista' },
  {
    screen: 'tus comercios',
    kind: 'view',
    component: 'TenantPicker',
    action: null,
    destructive: [],
    planes: 'page-card',
    why: 'Se elige un comercio con un enlace de la lista; "Cerrar sesión" es secundaria',
  },
  {
    screen: 'invitación',
    kind: 'view',
    component: 'AcceptInvitation',
    action: 'Aceptar invitación',
    destructive: [],
    planes: 'page-card',
    why: 'Si la cuenta ya es miembro, el acento lo lleva "Entrar al comercio": los estados son excluyentes. "Cerrar sesión" es secundaria',
  },
  {
    screen: 'catálogo',
    kind: 'view',
    component: 'ProductList',
    action: 'Nuevo producto',
    destructive: [],
    planes: 'page-card-bar',
    why: 'Solo con catalog.write; sin el permiso, ninguna. "Crear producto" del estado vacío es confirmación de sección: el acento no cambia de lugar',
  },
  {
    screen: 'producto',
    kind: 'view',
    component: 'ProductEditor',
    action: null,
    destructive: ['Archivar producto'],
    planes: 'page-card-bar',
    why: 'La tarea es editar un producto por partes; cada sección se guarda por separado y ninguna acción la completa sola (historia 1, escenario 1)',
  },
  {
    screen: 'categorías',
    kind: 'view',
    component: 'CategoriesPage',
    action: 'Crear categoría',
    destructive: [],
    planes: 'page-card-bar',
    why: 'Es la tarea de la vista. "Eliminar" de una fila aparece solo en edición, con el color destructivo',
  },
  {
    screen: 'equipo',
    kind: 'view',
    component: 'TeamPage',
    action: 'Invitar',
    destructive: [],
    planes: 'page-card-bar',
    why: 'Solo para el Propietario. "Crear rol" es confirmación de sección; "Dar de baja" abre la confirmación, que es la destructiva',
  },
  { screen: 'rol', kind: 'view', component: 'RoleEditor', action: 'Guardar rol', destructive: ['Eliminar rol'], planes: 'page-card-bar', why: 'Es la tarea de la vista' },
  { screen: 'bitácora', kind: 'view', component: 'AuditLog', action: null, destructive: [], planes: 'page-card-bar', why: 'Vista de consulta' },

  // ── Diálogos ────────────────────────────────────────────────────────────────────────────────────
  { screen: 'diálogo: nuevo producto', kind: 'dialog', component: 'CreateProductDialog', action: 'Crear', destructive: [], planes: 'page-card-bar', why: 'Es la tarea del diálogo' },
  {
    screen: 'diálogo: qué valor tiene cada variante',
    kind: 'dialog',
    component: 'AssignOptionDialog',
    action: 'Confirmar',
    destructive: [],
    planes: 'page-card-bar',
    why: 'Es la tarea del diálogo',
  },
  {
    screen: 'diálogo: imágenes de una variante',
    kind: 'dialog',
    component: 'VariantImagesDialog',
    action: null,
    destructive: [],
    planes: 'page-card-bar',
    why: '"Listo" solo cierra: cada imagen se guarda en su propio control',
  },
  {
    screen: 'diálogo: traspaso de propiedad',
    kind: 'dialog',
    component: 'TransferOwnershipDialog',
    action: null,
    destructive: ['Traspasar la propiedad'],
    planes: 'page-card-bar',
    why: 'El Propietario pierde su papel: es destructiva',
  },
  {
    screen: 'diálogo: confirmación',
    kind: 'dialog',
    component: 'ConfirmDialog',
    action: null,
    destructive: ['Salir sin guardar'],
    planes: 'page-card-bar',
    why: 'Sus cinco usos son destructivos; el botón cambia de texto según el uso, y el caso e2e usa "Salir sin guardar"',
  },
];
