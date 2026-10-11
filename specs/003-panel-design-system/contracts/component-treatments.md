# Contrato: tratamiento de componentes y estados

**Feature**: 003-panel-design-system · Requisitos: FR-021 a FR-028 · Decisiones: [research §10, §11](../research.md)

Para cada componente, qué token usa en cada estado. "—" significa que el estado no le aplica.
Todos los valores son `--ds-*` ([tokens.md](./tokens.md)). Material se ajusta **solo** con
`mat.<componente>-overrides()`, nunca con selectores de sus clases internas (FR-006).

**Estados comunes**, que no se repiten por fila:

- **Foco**: `outline: var(--ds-focus-ring-width) solid var(--ds-focus-ring)` con
  `outline-offset: var(--ds-focus-ring-offset)`. Lo tiene todo elemento con `:focus-visible` (FR-023).
  El anillo es un `outline`: no lo tapa un borde ni una sombra, y no ocupa espacio.
- **Hover**: capa `--ds-surface-hover` compuesta sobre el reposo. Nunca agrega información (FR-026).
- **Deshabilitado**: `--ds-text-disabled`, `opacity` del token de Material y `cursor: not-allowed`.
  Nunca usa el tono de error ni su borde (FR-025).
- **Movimiento**: las transiciones duran `--ds-motion-short`, y con `prefers-reduced-motion: reduce`
  se anulan, como hoy en `styles.scss` (FR-028).

## Componentes de Material

| Componente | Reposo | Activo / seleccionado | Error | Cargando | Notas |
|---|---|---|---|---|---|
| Botón: acción principal | fondo `action-accent`, texto `on-action-accent`, sin sombra | capa de pulsado de Material sobre el acento | — | se deshabilita mientras envía (como hoy) | Clase `ds-primary-action` |
| Botón: confirmación de sección | fondo `primary`, texto `on-primary` | ídem | — | ídem | `matButton="filled"` |
| Botón: destructivo | fondo `action-destructive`, texto `on-action-destructive` | ídem | — | ídem | Clase `ds-destructive` |
| Botón: secundario | texto `primary`; contorno `border-control` si es `outlined` | — | — | — | |
| Campo de formulario | contorno `border-control`, etiqueta `text-secondary` | contorno `primary` de ancho `border-width-strong` | contorno y texto `status-error`, más **ícono** de error y `mat-error` (FR-024) | — | El ícono se agrega con `matSuffix` en el mismo campo: no cambia la estructura |
| Checkbox, radio | contorno `border-control` | relleno `primary` | — | — | |
| Chip | fondo `primary-container`, texto `on-primary-container` | — | — | — | La cruz conserva su zona táctil de 48 px (`.chip-touch-target`) |
| Diálogo | fondo `surface-overlay`, radio `radius-lg`, elevación `overlay` | — | — | — | Título en `section-title` |
| Menú | fondo `surface-overlay`, elevación `overlay` | opción con `surface-selected` | — | — | |
| Snack-bar | fondo `text-primary` invertido (contenedor inverso) | — | — | — | |
| Barra de progreso | pista `primary-container`, indicador `primary` | — | — | indeterminada | |

## Marcado propio del panel

| Patrón | Clase | Reposo | Hover | Vacío / cargando / error |
|---|---|---|---|---|
| Tarjeta (`<section>` de editor, equipo y categorías) | `ds-card` | fondo `surface-card`, borde `border-width` `border-subtle`, radio `radius-lg`, elevación `card`, relleno `space-4` → `space-6` desde 600 px | — | `ui-empty-state` / `ui-error-state` dentro de la tarjeta, con sus tokens |
| Fila de tabla (listado, variantes) | `ds-table-row` | sin fondo propio, separador inferior `border-subtle`, sin separador en la última fila | `surface-hover` | esqueleto con `--ds-row-height` y `radius-md` |
| Barra (encabezado de `tenant-shell`) | `ds-bar` | fondo `surface-bar`, elevación `bar`, nombre del comercio en `section-title` | — | — |
| Enlace de navegación activo | `.active` (ya existe) | `text-link`, subrayado | — | — |
| Aviso en bloque (falla de navegación, bloqueo de estado) | `ds-notice` + `ds-notice--error` / `--warning` | `status-{s}-container`, texto `on-status-{s}-container`, radio `radius-md`, más ícono | — | — |
| Esqueleto (`ui-skeleton`) | — | fondo `surface-hover` sobre el plano, radio `radius-md`, alto `--ds-row-height` | — | el mismo alto, radio y espaciado que el contenido (FR-027) |

## Definidos y sin emitir (FR-021a, research §11)

El panel no los usa hoy. El mixin existe en `_components.scss`, pero no se incluye. La razón
principal no es el peso: un estilo de un componente que ninguna vista usa no lo verifica ninguna
prueba, ni axe, ni la e2e, ni la medida de CLS, y envejece sin que nadie lo note. Cuando por fin se
use, se encontraría con tokens renombrados o con un override que Material ya no reconoce. La tabla
dice qué token usa cada estado: es la decisión, no el código.

| Componente | Mixin | Tratamiento (de la referencia) |
|---|---|---|
| Paginador | `ds-paginator` | Sin fondo propio; selector sin borde; texto `text-secondary`. Si se adopta, `MatPaginatorIntl` en tuteo entra en la compuerta de lenguaje |
| Pestañas | `ds-tabs` | Sin borde inferior del encabezado; activa en `primary` con indicador `primary`; inactiva en `text-secondary` |
| `mat-table` | `ds-mat-table` | El mismo de `ds-table-row` |
| `mat-card` | `ds-mat-card` | El mismo de `ds-card` |
| `mat-toolbar` | `ds-mat-toolbar` | El mismo de `ds-bar` |

### Adoptar uno de estos componentes

Quien introduzca en una vista un paginador, pestañas, `mat-table`, `mat-card` o `mat-toolbar` hace,
**en el mismo cambio**:

1. **Incluye el mixin** (`@include ds-paginator;` y los demás) en `_components.scss`, y revisa contra
   `node_modules/@angular/material/<componente>/_m3-<componente>.scss` que cada token del override
   siga existiendo en la versión de Material instalada.
2. **Mueve su fila** de esta tabla a la de "Componentes de Material", con los estados que le apliquen.
3. **Declara sus pares de contraste** en `contrast-pairs.ts` si su tratamiento usa un texto o un
   fondo que no estaba en ningún par.
4. **Cubre la vista** en `design-system.spec.ts` y en `a11y.spec.ts`, en los dos esquemas. Si la
   vista es nueva, la agrega a `primary-actions.ts`.
5. **Paginador**: provee un `MatPaginatorIntl` en tuteo neutro. Sus textos entran en la compuerta de
   lenguaje como cualquier cadena del panel.
6. **Mide** con `bundle-check`: el tratamiento consume del presupuesto de CSS de la carga inicial.

**La compuerta que lo hace cumplir** (`adoption.spec.ts` en `design-check`): recorre los imports de
`apps/admin/src` y `libs/ui/src`. Si encuentra `@angular/material/paginator`, `tabs`, `table`, `card`
o `toolbar`, falla salvo que `_components.scss` incluya el mixin correspondiente. El mensaje remite a
esta sección. Los pasos 2 a 6 no se automatizan. El paso 1 es el que impide que el componente llegue
a una vista con el aspecto por defecto de Material, y la e2e de la vista cubre el resto.

## Modo de colores forzados (FR-013)

Bajo `@media (forced-colors: active)`, el navegador reemplaza fondos y sombras. Lo que mantiene los
límites:

- La tarjeta y la barra tienen **borde** (`border-subtle`). En colores forzados, el navegador lo pinta
  con `CanvasText`.
- Los campos de Material ya dibujan su contorno con borde.
- El acento **no** es lo único que marca la acción principal: su etiqueta lo dice. En colores
  forzados se ve como cualquier botón, y eso es correcto: el modo prioriza el contraste sobre la
  identidad.
- El foco es un `outline`, que el modo respeta.
