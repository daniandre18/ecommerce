# Contrato: catálogo de tokens

**Feature**: 003-panel-design-system · Requisitos: FR-001 a FR-020 · Modelo: [data-model.md](../data-model.md)

Es la interfaz que consumen las vistas: **lo único** que un componente del panel puede escribir en
un estilo de color, tipografía, espaciado, radio, elevación o borde es `var(--ds-…)` de esta lista,
más las excepciones declaradas. Los valores de partida están en [research §2](../research.md). Los
definitivos, en `_tokens.scss`, y los fija la prueba de contraste, no este documento.

Agregar un token es cambiar este contrato: el token nuevo entra con su papel, y si es de texto, con
sus pares de contraste.

## Color (un valor por esquema, `light-dark()`)

### Planos (FR-010)

| Token | Papel | Decisión de la referencia |
|---|---|---|
| `--ds-surface-page` | Fondo de la página | Tinte muy claro del primario (`#F6F7FF`); oscuro `#13131A` |
| `--ds-surface-card` | Tarjeta: secciones del editor, de equipo y de categorías | Blanco; oscuro `#23232D` |
| `--ds-surface-bar` | Barra superior del comercio | Tinte del primario, distinto de la página |
| `--ds-surface-overlay` | Diálogo y menú | Como la tarjeta, separada por elevación `overlay` |
| `--ds-surface-hover` | Capa de hover de una fila o un control | Negro al 4 % (claro) y blanco al 6 % (oscuro), compuestos sobre el plano |
| `--ds-surface-selected` | Fila seleccionada | Contenedor del primario |

### Texto e íconos

| Token | Papel |
|---|---|
| `--ds-text-primary` | Texto corriente, títulos |
| `--ds-text-secondary` | Ayudas, estado, metadatos |
| `--ds-text-link` | Enlaces y "← Catálogo" |
| `--ds-text-disabled` | Texto de un control deshabilitado (exento de AA, declarado igual) |

### Marca y acción

| Token | Papel |
|---|---|
| `--ds-primary` / `--ds-on-primary` | Identidad: confirmación de sección, selección, indicadores activos |
| `--ds-primary-container` / `--ds-on-primary-container` | Chips y fila seleccionada |
| `--ds-action-accent` / `--ds-on-action-accent` | **Solo** la acción principal (FR-008) |
| `--ds-action-destructive` / `--ds-on-action-destructive` | **Solo** acciones destructivas (FR-009a). Es un papel distinto de `--ds-status-error`, el de la validación, aunque hoy compartan tono: así una de las dos puede cambiar sin arrastrar a la otra |

### Estados con significado (FR-009)

Para `{s}` en `error`, `warning`, `success` e `info`:

| Token | Papel |
|---|---|
| `--ds-status-{s}` | Texto e ícono sobre cualquier plano |
| `--ds-status-{s}-container` / `--ds-on-status-{s}-container` | Aviso en bloque: falla de navegación, error de carga, aviso de bloqueo |

### Bordes y foco

| Token | Papel | Contraste |
|---|---|---|
| `--ds-border-subtle` | Separa la tarjeta del fondo, y las filas entre sí | Decorativo: la tarjeta ya se distingue por el tono |
| `--ds-border-control` | Límite de un campo, de un checkbox o de un botón con contorno | `ui`, 3:1 contra el plano (WCAG 1.4.11) |
| `--ds-focus-ring` | Indicador de foco | `ui`, 3:1 contra los tres planos, el superpuesto y el acento (FR-023) |

## Tipografía (FR-014 a FR-017)

Familia única: `--ds-font-family`, la fuente del sistema de la 001. No se descarga nada.

Cada nivel tiene `-size`, `-weight`, `-line-height` y `-tracking`, más el atajo `--ds-type-{nivel}`
para la propiedad `font`. El color sale de `--ds-text-*`.

| Nivel | Tamaño | Peso | Interlineado | Espaciado | Color | Difiere del siguiente en |
|---|---|---|---|---|---|---|
| `page-title` | 28 px | 700 | 36 px | −0,01 em | primario | tamaño, peso, espaciado |
| `section-title` | 20 px | 600 | 28 px | 0 | primario | tamaño, color |
| `subtitle` | 16 px | 600 | 24 px | 0 | secundario | peso, color |
| `body` | 16 px | 400 | 24 px | 0 | primario | tamaño, peso, espaciado |
| `label` | 14 px | 500 | 20 px | 0,01 em | primario | tamaño, peso, color |
| `help` | 13 px | 400 | 18 px | 0 | secundario | — |

La escala de la referencia (de 48 px a 11,2 px, pesos de 400 a 700) se comprime: un panel de
gestión no necesita títulos de 48 px. Se conservan sus pesos, y el título de tarjeta toma el papel
del `card-title` de la referencia. "Espaciado" cuenta el espaciado entre letras **o** el interlineado
relativo, como un solo atributo (FR-015).

## Espaciado (FR-018, FR-019)

Unidad base: **4 px**. Progresión: lineal hasta 24 px, después de a 8 o 16 px.

| Token | Valor | Uso declarado |
|---|---|---|
| `--ds-space-1` | 4 px | Ícono y texto dentro de un control |
| `--ds-space-2` | 8 px | Entre elementos **relacionados**: campos de un grupo, botones de un grupo |
| `--ds-space-3` | 12 px | Relleno interno de chips y avisos compactos |
| `--ds-space-4` | 16 px | Relleno de tarjeta en móvil, margen de página |
| `--ds-space-5` | 20 px | — (paso de ritmo, sin uso fijo) |
| `--ds-space-6` | 24 px | Relleno de tarjeta en escritorio; entre **grupos** distintos de una tarjeta |
| `--ds-space-8` | 32 px | Entre tarjetas |
| `--ds-space-12` | 48 px | Entre bloques mayores de una vista |

**FR-019** queda en la tabla: dentro de un grupo, `space-2`; entre grupos, `space-6`; entre
tarjetas, `space-8`.

## Radio, borde y elevación (FR-011, FR-012)

| Token | Valor | Uso |
|---|---|---|
| `--ds-radius-sm` | 4 px | Chips de estado, enlace para saltar al contenido |
| `--ds-radius-md` | 8 px | Campos, filas de esqueleto, avisos |
| `--ds-radius-lg` | 12 px | Tarjetas, diálogos |
| `--ds-radius-pill` | 9999 px | Botones |
| `--ds-border-width` | 1 px | Tarjeta, filas, contorno de un control |
| `--ds-border-width-strong` | 2 px | Campo con foco o con error |
| `--ds-focus-ring-width` | 3 px | Anillo de foco (hoy `3px` en `styles.scss`) |
| `--ds-focus-ring-offset` | 2 px | Separación del anillo |
| `--ds-elevation-flat` | `none` | Página, barra, filas |
| `--ds-elevation-card` | Sombra difusa de la referencia; `none` en oscuro | Tarjeta |
| `--ds-elevation-bar` | `none`; la barra se distingue por el tono | Barra |
| `--ds-elevation-overlay` | Sombra marcada en los dos esquemas | Diálogo, menú |

**Esquema oscuro**: una sombra no separa nada sobre un fondo casi negro (edge case de la spec). En
oscuro, la tarjeta se separa por **tono** (`#23232D` sobre `#13131A`) y por **borde**
(`--ds-border-subtle`). El borde está en los dos esquemas, y además es lo que mantiene el límite en
el modo de colores forzados (FR-013).

## Densidad (FR-020)

| Token | Valor | Uso |
|---|---|---|
| `--ds-touch-target` | 48 px | Alto mínimo de botones, enlaces de acción y celdas táctiles |
| `--ds-row-height` | 72 px | Fila del listado y de su esqueleto (hoy `72px` en tres lugares) |

`mat.theme` se queda en `density: 0`. Ninguna densidad negativa (research §14).

## Movimiento (FR-028)

| Token | Valor | Uso |
|---|---|---|
| `--ds-motion-short` | 150 ms | Cambio de estado de un control (hover, foco, selección) |

La regla global de `prefers-reduced-motion: reduce` de `styles.scss` se mantiene tal como está. La
duración no está entre las categorías de FR-004, así que la compuerta no la exige: se declara para
que las transiciones tengan una sola duración.
