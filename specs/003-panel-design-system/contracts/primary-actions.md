# Contrato: acción principal de cada pantalla

**Feature**: 003-panel-design-system · Requisitos: FR-008, SC-004 · Decisión: [research §13](../research.md)

Lista declarada que pide la spec (Assumptions, "Acción principal"). `primary-actions.ts` la
transcribe, y `design-system.spec.ts` la verifica en las vistas reales, en los dos esquemas.

**El principio** (FR-008): el acento señala la acción principal de una pantalla; una pantalla sin
acción principal no lleva acento. Si una pantalla tiene acción principal se decide por su
**tarea**: ¿hay una acción que la complete? Cuántos botones muestra no cuenta. Si una pantalla cambia,
la pregunta se vuelve a hacer y la fila de esta lista se actualiza en el mismo cambio.

## Tres niveles de botón

| Nivel | Marca en el código | Aspecto | Regla |
|---|---|---|---|
| Acción principal | `matButton="filled" class="ds-primary-action"` | Acento | Como máximo una por pantalla. Es la de esta lista |
| Confirmación de sección | `matButton="filled"` | Primario | Guarda o aplica dentro de una tarjeta, una fila o una barra de selección |
| Destructiva | `matButton="filled" class="ds-destructive"` | Error (`--ds-action-destructive`) | Archiva, elimina, da de baja, traspasa o descarta. **Nunca** lleva el acento: el acento invita, y una acción destructiva no debe invitar. El color de error en un botón significa "destructiva" y nada más (FR-009a): un botón nunca se pinta de error para señalar una validación fallida, que se comunica en el campo con texto, ícono y color (FR-024) |
| Secundaria | `matButton` (text) o `matButton="outlined"` | Neutro | Todo lo demás: cancelar, volver, quitar filtros |

Una pantalla es una vista o un diálogo. Mientras un diálogo está abierto, la vista de fondo no cuenta
(edge case de la spec).

**Planos por pantalla** (SC-005, FR-010): las vistas dentro del marco del comercio (`/t/:id/…`)
tienen página, tarjeta y barra. Inicio de sesión, alta de cuenta, comercios e invitación tienen
página y tarjeta: la barra pertenece al marco, y agregarla a esas vistas violaría FR-032. La
tarjeta va sobre un elemento que ya existe: el `<form>` en inicio de sesión y alta de cuenta, la
`<ul>` en comercios (o el estado vacío, que ya es tarjeta) y el propio componente en invitación.

## Vistas

| Pantalla | Acción principal | Por qué |
|---|---|---|
| Iniciar sesión (`/login`) | **Entrar** | Es la tarea de la vista |
| Crear cuenta (`/signup`) | **Crear cuenta** | Es la tarea de la vista |
| Tus comercios (`/`) | — | Se elige un comercio con un enlace de la lista. "Cerrar sesión" es secundaria |
| Invitación (`/invitation/…`) | **Aceptar invitación**; si ya es miembro, **Entrar al comercio** | Estados excluyentes: nunca se ven juntos. "Cerrar sesión" (cuenta equivocada) es secundaria |
| Catálogo (`/t/:id/catalog`) | **Nuevo producto**, solo con `catalog.write` | Sin el permiso: ninguna (historia 1, escenario 2). En el catálogo vacío, "Crear producto" del estado vacío es confirmación de sección: el acento no cambia de lugar según haya productos o no. "Asignar" y "Agregar a la sección" de la barra de selección son confirmaciones de sección |
| Producto (`/t/:id/catalog/:productId`) | — | La tarea es editar un producto por partes. Cada sección se guarda por separado, y ninguna acción completa por sí sola esa tarea (historia 1, escenario 1). "Archivar producto" es destructiva |
| Categorías (`/t/:id/categories`) | **Crear categoría** | Es la tarea de la vista. En cada fila, "Guardar", "Mover" y "Ocultar" son confirmaciones de sección, y "Eliminar" es destructiva |
| Equipo (`/t/:id/team`) | **Invitar**, solo para el Propietario | Sumar personas es la tarea por la que existe la vista (historia 1 la nombra). "Crear rol" es confirmación de sección |
| Rol (`/t/:id/team/roles/:roleId`) | **Guardar rol** | Es la tarea de la vista. "Eliminar rol" es destructiva |
| Bitácora (`/t/:id/audit`) | — | Vista de consulta |

## Diálogos

| Diálogo | Acción principal | Por qué |
|---|---|---|
| Nuevo producto (`CreateProductDialog`) | **Crear** | Es la tarea del diálogo |
| ¿Qué valor tiene cada variante? (`AssignOptionDialog`) | **Confirmar** | Es la tarea del diálogo |
| Imágenes de una variante (`VariantImagesDialog`) | — | "Listo" solo cierra: cada imagen se guarda en su propio control |
| Traspaso de propiedad (`TransferOwnershipDialog`) | — | "Traspasar la propiedad" es destructiva: el Propietario pierde su papel |
| Confirmación (`ConfirmDialog`) | — | Sus cinco usos son destructivos: "Guardar y archivar", "Archivar producto", "Eliminar rol", "Dar de baja" y "Salir sin guardar". El botón de confirmar es destructivo. Si algún día se usa para algo no destructivo, `ConfirmData` suma un campo `tone` y ese uso declara su acción principal |

## Verificación

1. **Inventario completo**: una prueba unitaria compara la lista con las rutas `loadComponent` de
   `app.routes.ts` y con los componentes que aparecen en `MatDialog.open(...)`. Una pantalla nueva
   sin declarar hace fallar la prueba.
2. **Acento computado**: en cada pantalla, los elementos visibles cuyo `background-color` computado
   es igual al acento son 0 si la acción es "—", y 1 con el nombre declarado si no.
   - **Catálogo sin permiso de crear** (historia 1, escenario 2): la prueba crea un rol con solo
     `catalog.read`. **Depende de T102 de la 001**: si T102 se cierra quitando `catalog.read` del
     enumerado `Permission`, la prueba tiene que crear el rol **sin permisos**. Lo que verifica no
     cambia: un colaborador sin `catalog.write` no ve ningún acento.
3. **Destructiva sin acento**: en cada diálogo de confirmación, el botón destructivo tiene el fondo
   de error y no el del acento.
