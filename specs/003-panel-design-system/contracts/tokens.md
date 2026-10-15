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
| `--ds-surface-selected` | Barra de selección (acciones masivas) y edición masiva de variantes | El primario al 8 % sobre la tarjeta (20 % en oscuro), compuesto en la compilación: sigue a la paleta derivada (T059). Nunca es el único indicador de selección: la casilla y el contador ("N seleccionados") lo dicen sin color (WCAG 1.4.1) |

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

### Derivación de la paleta semántica (T059)

Los colores semánticos **no se eligen y después se corrigen**: se derivan de su objetivo de contraste.
De la referencia se toman el tono y la saturación (en OKLCH); la luminosidad es la más cercana a la de
la referencia con la que el color cumple su objetivo **contra todas las superficies en que se usa a la
vez**, en su esquema. Esas superficies son los pares de `contrast-pairs.ts` en los que aparece el color,
como primer plano o como fondo. Lo hace `apps/admin/design-system/palette-derivation.ts`, y
`palette-derivation.spec.ts` exige que `_palette.scss` tenga exactamente el valor derivado.

**Objetivo**: el umbral de WCAG más 0,5 (`MARGIN` en `contrast.ts`): 5,0 para texto, 3,5 para texto
grande y componentes, 9,5 entre los dos tonos del foco. Con 0,2, seis colores compartidos tuvieron que
moverse para entrar, y varios pares quedaron a 0,01 del mínimo (T058).

**Para cambiar un color**: no se edita el hex. Se cambia la referencia, o el objetivo, o se agrega el
par del uso nuevo, y se vuelve a derivar. Si un uso nuevo deja a un color sin luminosidad posible, la
derivación lo dice en vez de elegir un valor que no cumple.

Valores al cierre de la feature (T056, 2026-10-15), generados con las funciones de `palette-derivation.ts`;
cada uno es exactamente el que deriva la compuerta.

| Papel | Esquema | Variable | Referencia | Valor | Objetivo | Lo restringe | Medido | Pares |
|---|---|---|---|---|---|---|---|---|
| Primario: texto, enlaces, confirmación de sección y anillo activo | claro | `$blue-500` | `#536dfe` | `#3848d7` | 5 | `primary/surface-selected/con-foco` | 5,05 (de 5,05 a 6,83) | 19 |
| Primario en oscuro | oscuro | `$blue-300` | `#536dfe` | `#a6bbff` | 5 | `primary/surface-selected/con-foco` | 5,01 (de 5,01 a 9,84) | 19 |
| Error y acción destructiva | claro | `$pink-600` | `#ff4081` | `#cb005c` | 5 | `status-error/surface-selected` | 5,02 (de 5,02 a 5,69) | 8 |
| Error y acción destructiva en oscuro | oscuro | `$pink-400` | `#ff4081` | `#ff7e9e` | 5 | `status-error/surface-selected` | 5,02 (de 5,02 a 7,89) | 8 |
| Aviso (texto) | claro | `$yellow-700` | `#ffc260` | `#8b5e00` | 5 | `status-warning/surface-bar` | 5,01 (de 5,01 a 5,68) | 3 |
| Éxito | claro | `$green-600` | `#31c2a0` | `#00755e` | 5 | `status-success/surface-bar` | 5,00 (de 5,00 a 5,67) | 3 |
| Éxito en oscuro | oscuro | `$green-400` | `#31c2a0` | `#31c2a0` | 5 | `status-success/surface-card` | 6,93 (de 6,93 a 8,24) | 3 |
| Información | claro | `$violet-600` | `#9013fe` | `#9012fe` | 5 | `status-info/surface-bar` | 5,01 (de 5,01 a 5,67) | 3 |
| Información en oscuro | oscuro | `$violet-300` | `#9013fe` | `#ab76ff` | 5 | `status-info/surface-card` | 5,01 (de 5,01 a 5,96) | 3 |
| Texto secundario | claro | `$gray-600` | `#6e6e6e` | `#666666` | 5 | `text-secondary/surface-selected` | 5,07 (de 5,07 a 5,74) | 6 |
| Texto secundario en oscuro | oscuro | `$gray-350` | `#6e6e6e` | `#a7a7a7` | 5 | `text-secondary/surface-selected` | 5,02 (de 5,02 a 7,69) | 6 |
| Contorno de control | claro | `$gray-500` | `#80809a` | `#7d7d97` | 3,5 | `border-control/surface-selected` | 3,53 (de 3,53 a 4,00) | 4 |
| Contorno de control en oscuro | oscuro | `$gray-550` | `#80809a` | `#8888a2` | 3,5 | `border-control/surface-selected` | 3,50 (de 3,50 a 5,36) | 4 |

**Estados**: el inventario incluye el estado presionado de cada botón (pares con `layers`: el velo de
`:active` y la onda, los dos a `--ds-state-pressed-opacity`), así que el primario se deriva también contra
su propio velo. Las opacidades de estado son del panel (hover 4 %, presionado 6 %, foco 12 %); el foco
conserva el 12 % de Material porque, con menos, casillas y radios perdían su señal. Los pares `/con-foco`
lo miden, y hoy son los que restringen al primario en los dos esquemas.

**Inventario completo**: `expectDeclaredPairs` (`apps/admin-e2e/src/design-system-support.ts`) recorre en
cada caso `pantalla:` todo texto visible en reposo y exige que su color y su fondo sean un par declarado. Si
una vista estrena un emparejamiento, CI falla y obliga a declararlo, y con eso a re-derivar.

"Lo restringe" es el par que fija la luminosidad: el que queda más cerca de su objetivo. "Medido" es
esa razón, y el rango contra todas las superficies del color. Los planos, los tintes de contenedor y los
colores "sobre" no se derivan: se verifican con la misma compuerta, al mismo objetivo.

### Bordes y foco

| Token | Papel | Contraste |
|---|---|---|
| `--ds-border-subtle` | Separa la tarjeta del fondo, y las filas entre sí | Decorativo: la tarjeta ya se distingue por el tono |
| `--ds-border-control` | Límite de un campo, de un checkbox o de un botón con contorno | `ui`, 3:1 contra el plano (WCAG 1.4.11) |
| `--ds-focus-ring-inner` / `--ds-focus-ring-outer` | Indicador de foco de dos tonos: trazo claro por dentro, oscuro por fuera (técnica C40 de WCAG) | `two-tone`: 9:1 entre los dos tonos (hoy 17,26). Con eso, contra cualquier fondo uno de los dos da 3:1 o más; contra los fondos del sistema, el peor caso es 5,69, el botón destructivo claro (FR-023; 5,14 antes de T059) |

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
| `--ds-space-4` | 16 px | Relleno de tarjeta en móvil, margen de página; entre **grupos** distintos de una tarjeta |
| `--ds-space-5` | 20 px | — (paso de ritmo, sin uso fijo) |
| `--ds-space-6` | 24 px | Relleno de tarjeta en escritorio |
| `--ds-space-8` | 32 px | Entre tarjetas |
| `--ds-space-12` | 48 px | Entre bloques mayores de una vista |

**FR-019** queda en la tabla: dentro de un grupo, `space-2`; entre grupos, `space-4`; entre
tarjetas, `space-8`. Entre grupos era `space-6` hasta la revisión de T055 (2026-10-15): las vistas
migradas usaban `space-4` en todo el panel, y 8 < 16 < 32 ya cumple FR-019. Se ajustó el contrato al
panel, sin cambio de apariencia. La e2e mide el paso entre tarjetas en cada punto de medición
(`expectScale` de `design-system-support.ts`).

## Radio, borde y elevación (FR-011, FR-012)

| Token | Valor | Uso |
|---|---|---|
| `--ds-radius-sm` | 4 px | Chips de estado, enlace para saltar al contenido, snack-bar |
| `--ds-radius-md` | 8 px | Campos, filas de esqueleto, avisos, imágenes, grupos con borde dentro de una tarjeta o un diálogo |
| `--ds-radius-lg` | 12 px | Tarjetas, diálogos, barras de selección |
| `--ds-radius-pill` | 9999 px | Botones |

Un grupo con borde dentro de una tarjeta (la edición de una fila de categorías, las opciones, la
confirmación del tipo de envío, la vista previa de la tienda, una invitación) usa `radius-md`: lo que
está adentro tiene un radio menor que lo que lo contiene. Hasta la revisión de T055 cinco usaban
`radius-lg` y uno `radius-md`; pasaron todos a `radius-md` (**cambio de apariencia**, de 12 a 8 px). La
e2e lo mide en cada punto de medición (`expectScale`).
| `--ds-border-width` | 1 px | Tarjeta, filas, contorno de un control |
| `--ds-border-width-strong` | 2 px | Campo con foco o con error |
| `--ds-focus-ring-width` | 3 px | Trazo claro del anillo (el ancho que hoy usa `styles.scss`) |
| `--ds-focus-ring-outer-width` | 2 px | Trazo oscuro, por fuera del claro |
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
