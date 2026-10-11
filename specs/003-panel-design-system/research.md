# Research: Sistema de Diseño del Panel

**Feature**: 003-panel-design-system · **Fecha**: 2026-10-10 · **Fase**: 0

Decisiones cerradas para el plan. Las §1 a §4 fijan el mecanismo (dónde viven los tokens y cómo
llegan al navegador sin código); las §5 a §9, las cuatro compuertas nuevas; las §10 a §13, lo que el
relevamiento del código encontró y la spec no previó.

## 0. Stack y relevamiento

Sin cambios de versión: Angular 22.2, Material + CDK 22.2.1, Nx 23.2.1, TypeScript ~6.0.3,
Vitest 5.0.3, Playwright 1.63, `@axe-core/playwright` 4.13.

**Dependencias**: una nueva, `postcss-scss`, solo de desarrollo (§5). `sass` 1.104.1 y `postcss`
8.5.28 ya están instalados como dependencias de `@angular/build`. Se declaran como dependencias
directas de desarrollo con esa misma versión exacta, porque las compuertas los importan y no deben
depender de que otra herramienta los arrastre.

**Relevamiento del panel** (rama base `be4aa57`):

| Qué | Hoy |
|---|---|
| Valores escritos a mano en estilos | **258**: 81 en `.scss`, 177 en estilos y plantillas dentro de `.ts`. Los más frecuentes son `8px` (112), `16px` (37), `4px` y `12px` (30 cada uno), `48px` (18) y `1px` (13) |
| Estilos de componentes | 9 archivos `.scss` y 27 componentes con `styles:` en línea |
| Tokens consumidos | 30 `--mat-sys-*` distintos, sobre todo `on-surface-variant`, `error`, `body-medium` y `title-*` |
| Componentes de Material usados | button, input, form-field, dialog, snack-bar, checkbox, radio, menu, chips, progress-bar |
| **No usados** | card, table, toolbar, paginator, tabs (§11) |
| Voseo | En **29 archivos**: 27 del panel, `apps/functions/src/bootstrap/guard.ts` y `libs/application/src/use-cases/team/invitations.ts` |
| Carga inicial (gzip -9) | JS: `main` 169.683 B + `chunk-D2t…` (modulepreload) 65.205 B. CSS: `styles.css` 1.929 B, más el CSS crítico en línea de `index.html` |

## 1. Dónde viven los tokens: SCSS compilado a propiedades CSS, sin código

**Decisión**: el catálogo es un conjunto de parciales SCSS en `apps/admin/src/styles/`, compilados a
**propiedades personalizadas CSS** `--ds-*` en `:root`. Cada token de color y de elevación tiene un
valor por esquema y se emite con `light-dark(claro, oscuro)`. El esquema lo elige el navegador por
`color-scheme: light dark`, que el panel ya declara en `<html>` y en la meta de `index.html`.

- `_palette.scss`: **la única** parte del código con valores de color. Son variables Sass (`$blue-600`),
  que no llegan al CSS como tales.
- `_tokens.scss`: los papeles (`--ds-surface-card`, `--ds-text-secondary`, `--ds-action-accent`…),
  definidos solo a partir de la paleta y de las escalas.
- `_theme.scss`: `mat.theme()` con la paleta propia, y `mat.theme-overrides()` para que los
  `--mat-sys-*` que usa Material apunten a los papeles.
- `_components.scss`: el tratamiento de cada componente (§10), con los `mat.<componente>-overrides()`
  de Material 22.
- `_shell.scss`: los estilos del componente raíz, que hoy viajan en el JS inicial (§3).

**Por qué**: FR-034 pide 0 bytes de JavaScript, y `light-dark()` resuelve los dos esquemas sin código
de arranque. Material 22 ya emite sus tokens de sistema así: en el build actual se ven valores como
`--mat-sys-surface-container-low: light-dark(#f4f3f6, #1a1b1f)`. Las vistas consumen
`var(--ds-*)`, que se resuelve en ejecución. Cambiar un valor en `_palette.scss` llega a todas las
vistas sin tocar ningún componente (historia 4, escenario 3).

**Prefijo `--ds-`**: lo que el panel define se distingue a simple vista de lo que define Material
(`--mat-sys-*`). La compuerta de §5 prohíbe que una vista use `--mat-sys-*` de color, superficie o
tipografía: la única entrada es `--ds-*`. Así hay una sola fuente (FR-001) y nadie mezcla papeles
propios con los de Material.

**Alternativas descartadas**:

- **Tokens en un JSON o TS que genera el SCSS**: agrega un paso de generación al build y una segunda
  copia que puede desfasarse. Las compuertas leen el SCSS **compilado**, que es la verdad (§6).
- **Clase `.dark` en `<html>`**: necesita código antes del primer pintado para leer la preferencia.
  Es exactamente lo que la spec deja fuera junto con el interruptor.
- **`@media (prefers-color-scheme: dark)` con un bloque por esquema**: funciona, pero duplica cada
  token en dos bloques separados. `light-dark()` deja el par en una sola línea, que es más fácil de
  revisar, y es el mismo mecanismo que ya usa Material. Navegadores: `light-dark()` está en Chrome
  123, Safari 17.5 y Firefox 120. El panel **ya depende** de esa función a través de `mat.theme`:
  no se agrega un requisito de navegador.

## 2. Valores de partida: la referencia, ajustada a AA

La referencia (`~/Documents/github/angular-admin/src/app/styles/`) se leyó entera. Se toman sus
**decisiones**: el papel y el tono de cada color, el fondo con tinte del primario, la tarjeta clara
con sombra difusa, la tabla transparente, la barra y el paginador sin fondo propio, y las pestañas sin
borde inferior. Ninguna línea de su código se copia, ni nada de su capa `m2-*` (FR-006).

Los valores que no cumplen AA se ajustan **en luminosidad HSL, conservando el tono y la saturación**,
hasta pasar contra los tres planos a la vez. El cálculo se hizo con la fórmula de WCAG 2.2 y es
reproducible:

| Papel | Referencia | Razón original | Valor de partida (claro) | Razón contra página / tarjeta / barra |
|---|---|---|---|---|
| Primario (texto, enlaces, activo) | `#536DFE` | 4,21 sobre blanco | `#3c5afe` | 4,81 / 5,14 / 4,54 |
| Error | `#ff4081` | 3,33 con texto blanco | `#d9004a` | 4,86 / 5,19 / 4,58 |
| Éxito | `#31C2A0` | — | `#1f7b65` | 4,82 / 5,15 / 4,55 |
| Información | `#9013FE` | ya cumple | `#9013fe` | 5,30 / 5,66 / 5,00 |
| Aviso (texto) | `#ffc260` | 1,6 sobre blanco | `#9b5f00` | 4,88 / 5,21 / 4,60 |
| Texto secundario | `#6E6E6E` | ya cumple | `#6e6e6e` | 4,78 / 5,10 / 4,50 |
| Acento (fondo del botón) | `#ffc260` | 1,6 con texto blanco | `#ffc260` con texto `#1f1f1f` | 10,31 |

Planos claros de partida: página `#f6f7ff` (el fondo de la referencia), tarjeta `#ffffff` y barra
`#eef0ff`. En el esquema oscuro, la referencia usa página `#13131A` y tarjeta `#23232D`. El primario
se aclara a `#6a80fe` (5,40 / 4,54 / 4,99), el error se conserva y el texto secundario se aclara a
`#8a8a8a` (5,36 / 4,51 / 4,95).

**Por qué no se usa el texto blanco sobre el acento**: el amarillo es la decisión de la referencia y
se conserva. Con texto blanco da 1,6:1. Con texto oscuro da 10,31:1, y la referencia ya lo hace así
en su toolbar. El acento deja así de competir con el primario azul por tono **y** por luminosidad,
que es justo lo que la historia 1 pide de la acción principal.

**El valor exacto se fija en la implementación**: la tabla es el punto de partida. Lo que obliga es
la prueba de §6. Si un ajuste visual cambia un valor, la prueba recalcula la razón y el catálogo de
pares se actualiza con la razón nueva.

## 3. JavaScript inicial: 0 bytes de crecimiento, con los estilos del raíz fuera del JS

**Hallazgo**: Angular empaqueta los estilos de cada componente **dentro de su JavaScript**. El
componente raíz `App` (`apps/admin/src/app/app.ts`) se carga en el arranque, así que sus estilos
(enlace para saltar al contenido, falla de navegación, estructura de arranque) son bytes del **JS
inicial**. Reemplazar sus `8px` por `var(--ds-space-2)` haría crecer `main.js`, y FR-034 no admite
ni un byte.

**Decisión**: los estilos de `App` pasan a `_shell.scss`, en la hoja global. El JS inicial
**decrece**, en unos 1,1 KB sin comprimir. La hoja global crece en lo mismo y lo absorbe el
presupuesto de 10 KB de estilos. Ningún otro componente con estilos está en la carga inicial: todas
las vistas son `loadComponent` diferidas (`app.routes.ts`).

**Regla para el resto**: los componentes diferidos conservan sus estilos junto al componente. Sus
bytes están en fragmentos diferidos, fuera de la medida de FR-034, y bajo el tope de 8 KB por
componente que ya existe (FR-036).

## 4. La estructura de arranque de `index.html`: literales verificados contra los tokens

**Hallazgo**: `index.html` dibuja una estructura estática antes de que llegue el código (SC-009 de la
001), con colores escritos a mano (`#49454f`, `#ece6f0`, `#cac4d0`, `#2b2930`): son los de Material
azure. El build de producción carga la hoja global **sin bloquear** (`media="print"` con
`data-beasties-media`), así que esos estilos **no pueden** usar `var(--ds-*)`: en el primer pintado
las propiedades todavía no existen.

**Decisión**: los literales de `index.html` son una **excepción declarada** (`index-boot`), y una
prueba verifica que cada uno es **igual** al valor compilado del token que representa, en cada
esquema. Si alguien cambia el token del fondo de tarjeta, la prueba falla hasta que `index.html` lo
acompañe. La fuente sigue siendo una: el literal es una copia **verificada**, no una segunda decisión.

**Alternativa descartada**: generar `index.html` en el build. Agrega un paso propio al ejecutor de
Angular para cuatro valores.

## 5. Compuerta de valores literales (FR-004, FR-005, SC-001)

**Decisión**: un verificador propio, `apps/admin/design-system/literals.ts`, que corre en el
`lint` del panel, el mismo trabajo que ya bloquea en CI (`npx nx run-many -t lint`).

- **Qué lee**: los `.scss` del panel y de `libs/ui`, y los estilos de cada `.ts`. Estos últimos se
  extraen con la API de TypeScript (`styles:` de `@Component`, cadena o arreglo), que ya está
  instalada. Las líneas reportadas son las del archivo original: se suma el desplazamiento de la
  cadena dentro del `.ts`. También lee los enlaces de estilo de las plantillas (`[style.x]`,
  `style="…"`). Hoy hay uno: `skeleton.ts`, con un alto que llega por entrada y no es literal.
- **Cómo parsea**: con `postcss-scss`, que entiende `//`, anidamiento y `@include`. El parser por
  defecto de PostCSS se rompe con la sintaxis SCSS. Es la única dependencia nueva.
- **Qué revisa, por propiedad**:

  | Categoría | Propiedades |
  |---|---|
  | Color | `color`, `background`, `background-color`, `border-color` y sus lados, `outline-color`, `fill`, `stroke`, `box-shadow` (su color), `text-decoration-color`, `caret-color`, `accent-color` |
  | Tipografía | `font`, `font-size`, `font-weight`, `line-height`, `letter-spacing` |
  | Espaciado | `margin*`, `padding*`, `gap`, `row-gap`, `column-gap`, `inset*`, `top`, `right`, `bottom`, `left` |
  | Radio | `border-radius` y sus esquinas |
  | Elevación | `box-shadow` |
  | Borde | `border`, `border-width` y sus lados, `outline`, `outline-width`, `outline-offset` |

  Peso, interlineado y espaciado entre letras se suman a "tamaño de fuente" porque FR-015 construye
  la jerarquía con ellos. Si quedaran libres, una vista podría romperla sin tocar ningún tamaño.

- **Qué no revisa**: anchos y altos de diseño (`width`, `max-width`, `min-height`,
  `grid-template-*`): `560px` de un diálogo o `200px` de una columna no son ninguna de las categorías
  de FR-004. Las zonas táctiles de 48 px **sí** pasan a un token de densidad (`--ds-touch-target`),
  por convención y no por la compuerta: así el umbral de 44 px de FR-020 queda en un solo lugar, y las
  e2e de `mobile.spec.ts` siguen verificándolo.
- **Qué admite**: `var(--ds-*)`, palabras clave (`inherit`, `currentColor`, `transparent`, `none`,
  `auto`), `0`, porcentajes, funciones de cálculo **solo sobre tokens**
  (`calc(-1 * var(--ds-space-3))`), y la lista de excepciones (`literal-exceptions.ts`), cada una con
  valor, categoría, alcance (archivo o patrón) y razón.
- **Qué prohíbe además**: `var(--mat-sys-*)` de color, superficie y tipografía en las vistas
  (§1). Material sigue usándolos por dentro. El panel los toca solo desde `_theme.scss`.
- **Mensaje**: `archivo:línea  propiedad: valor  → usa var(--ds-space-2)`. El token sugerido sale de
  invertir el catálogo compilado: un valor que coincide exacto con un token se sugiere por nombre. Si
  no coincide ninguno, se sugiere el paso más cercano de la escala de esa categoría.

**Alternativa descartada**: Stylelint con `stylelint-declaration-strict-value`. Suma cuatro
dependencias (stylelint, el plugin, `postcss-scss` y una sintaxis para estilos dentro de `.ts`), no
sugiere el token por valor, que FR-005 exige, y la sintaxis para Angular en `.ts` es un paquete
comunitario con poco mantenimiento. El verificador propio son unas 200 líneas con pruebas, y su
lógica es la de esta spec, no una configuración aproximada.

**Las pruebas del verificador** son de dos tipos. Por **fixtures**: un componente con un color, un
tamaño, un espaciado y un radio a mano produce exactamente 4 hallazgos con el token sugerido
(historia 4, escenario 1), y un `0` o un `100%` no produce ninguno (escenario 2). Y **sobre el
repositorio**: 0 hallazgos en el panel (SC-001).

## 6. Compuerta de contraste (FR-029 a FR-031, SC-002)

**Decisión**: una prueba Vitest compila `styles.scss` con `sass` y lee el valor **real** de cada
`--ds-*` del CSS resultante. Separa `light-dark(a, b)` en sus dos esquemas, resuelve las referencias
`var()` encadenadas y calcula la razón de cada par del catálogo `contrast-pairs.ts`.

- **Cada par declara**: texto o elemento, fondo, tipo (`text`, `large-text` o `ui`), estado, plano y
  la razón declarada **por esquema**, con dos decimales.
- **Falla si**: la razón calculada está bajo el umbral del tipo (4,5, 3 o 3); la razón calculada,
  redondeada a dos decimales, difiere de la declarada; un token de texto que aparece en
  `_tokens.scss` no figura en ningún par (sin esto, un color nuevo escaparía a la prueba); o un par
  nombra un token que no existe.
- **Colores con transparencia** (capas de estado de hover, por ejemplo): se componen sobre el fondo
  del par antes de calcular. Es lo que ve la persona.
- **Foco**: el indicador (`--ds-focus-ring`) se declara como par `ui` contra **cada uno** de los tres
  planos y contra el fondo del acento. FR-023 lo pide sobre cualquier plano.

**Por qué compilar y no leer el SCSS**: la razón tiene que salir de lo que llega al navegador, con
los ajustes de `light-dark()` y las referencias resueltas. Leer las variables Sass reproduciría la
lógica de Sass dentro de la prueba.

**SC-003 (axe en los dos esquemas)**: `a11y.spec.ts` suma un proyecto de Playwright con
`colorScheme: 'dark'`. Las mismas pruebas y el mismo `expectAccessible`, sin aflojar nada, corren
en los dos esquemas. La prueba de §6 cubre los pares **declarados**. axe cubre los pares que
**aparecen** en una vista, incluidos los que alguien armó sin declararlos.

## 7. Compuerta de lenguaje (FR-037 a FR-040, SC-008)

**Qué texto se recorre**: el que el panel muestra o anuncia, extraído con la API de TypeScript de
las **cadenas literales** y las **plantillas** de `apps/admin/src/app` y `libs/ui/src`, y del texto
de los `.html`. Los comentarios quedan fuera por construcción: el AST no los incluye, y en las
plantillas se quitan los `<!-- -->`. Los mensajes de `BusinessRuleError` y `HttpsError` de
`libs/application` y `apps/functions` también se recorren (§12). Las pruebas (`*.spec.ts`) y los datos de
siembra quedan fuera: no los ve la persona.

**Primera compuerta, voseo (FR-038)**: el voseo **sí** tiene marcas morfológicas, pero comparten
forma con palabras correctas. "Será" termina en `-á` igual que "borrá", y "estás" es voseo y
tuteo a la vez. Por eso la regla combina tres partes:

1. **Formas conocidas**: una lista de presentes y de imperativos irregulares de vos (`tenés`,
   `querés`, `podés`, `sabés`, `sos`, `vení`, `decí`, `hacé`, `poné`, `salí` en imperativo…).
2. **Candidatos morfológicos**: palabras de más de una sílaba terminadas en vocal tildada (`-á`, `-é`,
   `-í`), presentes en `-ás`, `-és` o `-ís`, e imperativos con pronombre enclítico **sin** tilde
   (`revisalos`, `movelas`, `asegurate`, `fijate`). En tuteo, estos últimos llevan tilde
   (`revísalos`, `muévelas`, `asegúrate`), y esa diferencia es la marca más confiable.
3. **Léxico revisado**: las palabras que coinciden con un candidato y son correctas (`está`, `más`,
   `aquí`, `será`, `podrá`, `también`, `menú`…) figuran en `language-exceptions.ts`, cada una con su
   razón. Una palabra **nueva** que coincide con un candidato y no está en el léxico hace fallar la
   compuerta. Clasificarla es una decisión de una persona, no de la regla.

**Segunda compuerta, usted (FR-039)**: la lista cerrada de la spec, como palabra completa y sin
importar mayúsculas: revise, cree, ingrese, agregue, edite, guarde, elimine, defina, elija,
seleccione, busque, confirme y cancele. Las excepciones son **por texto exacto**, no por palabra
("hasta que el servidor confirme"), cada una con su razón. Así una excepción no habilita la palabra
en otro texto.

**Los textos del comercio** (FR-040) no se recorren: viven en Firestore, no en el código.

**Por qué no un analizador morfológico** (por ejemplo, con un diccionario de español): agrega una
dependencia grande para un corpus de unas 1.500 cadenas. El léxico revisado es pequeño, cada entrada
se justifica, y su crecimiento es la señal de que hay texto nuevo para revisar.

## 8. Compuerta de tamaño contra la rama base (FR-034, FR-035, SC-007)

**Qué es "carga inicial"**: lo que **el `index.html` del build** pide al cargar:

- JS: el `<script src>` de `main` y cada `<link rel="modulepreload">`.
- CSS: cada `<link rel="stylesheet">` y cada `<style>` en línea, que incluye el CSS crítico de
  beasties y la estructura de arranque.

Se lee del HTML y no del metafile. El HTML es la definición operativa de "inicial", y si Angular
cambia cómo divide los fragmentos, la medida sigue siendo correcta.

**Cómo se mide**: gzip nivel 9 con `node:zlib`, el mismo en los dos lados. La comparación es una
diferencia, así que el nivel importa poco. Lo que importa es que sea el mismo.

**Contra qué**: el build de producción **de la rama base en el momento de integrar** (Assumptions de
la spec), no un número guardado.

- En un PR, el trabajo `bundle-check` de CI hace `git worktree add` del commit base
  (`github.event.pull_request.base.sha`), lo construye con la misma configuración y escribe
  `dist/base-initial.json`. Después construye la rama y compara.
- En un push a `main`, la base es `github.event.before`.
- En local, `npx nx run admin:bundle-check --base=<ref>`, y por omisión `origin/main`.

**Falla si** el JS crece **un byte** o el CSS crece más de **10.240 bytes**. El mensaje dice cuánto
creció cada uno y qué archivo lo explica.

**Costo**: un segundo `npm ci` y un segundo build del panel en CI, entre 2 y 4 minutos. El
`npm ci` es necesario porque la base tiene su propio `package.json` (esta feature agrega
dependencias) y no puede usar los `node_modules` de la rama. Se acepta: la alternativa, un
número fijo en el repositorio, deja que otra feature consuma el presupuesto de esta, que es justo lo
que la spec descarta.

**La prueba existente de capas** (`layers.spec.ts`) no cambia. La nueva es `size.spec.ts`, en la
misma carpeta y con el mismo objetivo Nx.

## 9. Acento y planos verificados en las vistas (FR-008, FR-010, SC-004, SC-005)

**Marca de la acción principal**: la clase `ds-primary-action` sobre el botón `matButton="filled"`.
`_components.scss` la traduce, con `mat.button-overrides()` dentro de ese selector, al fondo
`--ds-action-accent` y al texto `--ds-on-action-accent`. Es una clase, no una directiva: cero JS en
cualquier fragmento.

**Lista declarada** (`primary-actions.ts`): para cada vista y cada diálogo, el nombre accesible de su
acción principal, o `null` si no tiene. La lista completa está en
[contracts/primary-actions.md](./contracts/primary-actions.md).

**Prueba e2e** (`design-system.spec.ts`, nueva). Para cada vista y cada diálogo de la lista, y en los
dos esquemas:

- Cuenta los elementos visibles cuyo `background-color` **computado** es igual al valor del acento,
  y verifica que hay como máximo uno y que su nombre accesible es el declarado. Se compara el color
  computado y no la clase: así se atrapa también un acento puesto por otro camino.
- Verifica que los planos de la pantalla son distintos: página, tarjeta y barra dentro del marco
  del comercio, y página y tarjeta fuera de él (SC-005, corregido el 2026-10-10). Verifica también
  que la tarjeta tiene borde visible (`border-style` distinto de `none` y ancho mayor que 0) o sombra (SC-005).
- Con `page.emulateMedia({ forcedColors: 'active' })`, verifica que la tarjeta y los campos conservan
  un borde visible (FR-013).
- Verifica que cada nivel tipográfico difiere del contiguo en al menos dos de: tamaño, peso, color y
  espaciado entre letras o líneas (FR-015). La misma regla se prueba **también** en unitario, sobre los
  tokens compilados, para que falle antes de levantar el navegador.

**El colaborador sin permiso** (historia 1, escenario 2): la lista declara la acción principal del
catálogo como `Nuevo producto` **cuando existe**. La prueba crea un rol con solo `catalog.read`,
igual que `categories.spec.ts`, entra con un colaborador que tiene ese rol y verifica 0 acentos.
**Depende de T102 de la 001**: si `catalog.read` sale del enumerado, la prueba usa un rol sin
permisos. La dependencia va escrita en la tarea de esa prueba.

## 10. Tratamiento de componentes: lo que el panel usa, con las palancas de Material 22

Material 22 expone `mat.<componente>-overrides((token: valor))`. Cada tratamiento es una llamada
con valores `var(--ds-*)`, sin selectores internos de Material. La referencia, en cambio, apunta a
clases internas como `.mat-tab-label` y lo marca ella misma con `TODO(mdc-migration)`. Ese es el tipo
de código que FR-006 excluye.

| Componente | Cómo se aplica | Decisión tomada de la referencia |
|---|---|---|
| Botón (`filled`, `outlined`, `text`) | `button-overrides` | Sin sombra en reposo; mayúsculas descartadas, porque hacen perder legibilidad en español |
| Acción principal | `button-overrides` bajo `.ds-primary-action` | Acento cálido con texto oscuro (§2) |
| Acción destructiva | `button-overrides` bajo `.ds-destructive` | Tono de error. Nunca el acento (contracts/primary-actions.md) |
| Campo de formulario | `form-field-overrides` | Borde y etiqueta en primario con foco; error con ícono y texto (FR-024) |
| Diálogo | `dialog-overrides` | Plano superpuesto (elevación `overlay`), radio grande |
| Menú | `menu-overrides` | Plano superpuesto |
| Chip | `chips-overrides` | Contenedor con tinte del primario |
| Snack-bar, checkbox, radio, barra de progreso | sus `*-overrides` | Primario para lo activo |
| **Tarjeta** (`<section>` del editor, del equipo, de categorías) | Clase `ds-card` en `_components.scss` | Fondo de tarjeta, borde de 1 px, sombra difusa en claro |
| **Tabla** (filas del listado y de la tabla de variantes) | Clase `ds-table-row` | Sin fondo propio, hover tenue, sin borde en la última fila |
| **Barra** (encabezado de `tenant-shell`) | Clase `ds-bar` | Plano propio, sin sombra |

**Las clases nuevas no cambian la estructura** (FR-032): se agregan al elemento que ya existe, sin
envolverlo ni moverlo.

## 11. Paginador, pestañas, tabla, tarjeta y barra de Material: no se usan

**Hallazgo**: FR-021 nombra "al menos tabla, tarjeta, campo de formulario, paginador, pestañas,
barra de herramientas". El panel **no usa** `mat-table`, `mat-card`, `mat-toolbar`, `mat-paginator`
ni `mat-tabs`. Tarjeta, tabla y barra son marcado propio (§10). Paginador y pestañas no existen en
ninguna vista. Introducirlos sería cambiar la estructura, que FR-032 prohíbe.

**Decisión**:

- **Tarjeta, tabla y barra** reciben su tratamiento sobre el marcado propio (§10).
- **Paginador y pestañas** se **definen** (FR-021a): [contracts/component-treatments.md](./contracts/component-treatments.md)
  dice qué token usa cada estado, y `_components.scss` tiene su mixin (`ds-paginator`, `ds-tabs`).
  **No se incluyen** en la hoja global mientras ninguna vista los use.

**Por qué sin estilos**: la razón principal no es el peso, aunque también se ahorra. Un estilo de un
componente que ninguna vista usa no lo verifica ninguna prueba: ni axe, ni la e2e, ni la medida de
CLS. Envejece sin que nadie lo note, y el día que una vista lo adopte se encontraría con tokens
renombrados o con overrides que Material ya no reconoce. Lo que se conserva es la **decisión** (qué
token usa cada estado), no código sin probar.

**Para que nadie lo use sin su tratamiento**: `adoption.spec.ts` falla si una vista importa uno de
esos componentes y `_components.scss` no incluye su mixin. Los pasos que quien lo adopte hace en el
mismo cambio están en el contrato ("Adoptar uno de estos componentes").

Aprobado como corrección de la spec el 2026-10-10 (FR-021 y FR-021a).

## 12. Mensajes del servidor

**Hallazgo**: el panel **no muestra** el mensaje del servidor. `shared/command-errors.ts` traduce
cada `CommandErrorCode` a un texto propio ("El mensaje técnico del servidor no se muestra"). Los
mensajes con voseo de `guard.ts` ("No tenés permiso…") y de `invitations.ts` ("Ya sos miembro…")
llegan al cliente, pero no a la pantalla.

**Decisión**: se corrigen igual, y la compuerta de §7 los recorre. FR-037 los nombra de forma
explícita, el cambio es de dos líneas, y si mañana una vista mostrara el mensaje del servidor (un
registro de errores, por ejemplo), ya estaría en tuteo. La escena 3 de la historia 3 se verifica
sobre `command-errors.ts`, que es lo que de verdad se lee.

**Componentes de terceros**: el panel no usa el paginador (§11), que es el único componente de
Material con etiquetas propias visibles (`MatPaginatorIntl`). Los demás no muestran texto propio en
español. Si se adopta el paginador, su `MatPaginatorIntl` entra en la compuerta.

## 13. La acción principal en vistas con varias secciones que guardan por separado

**Hallazgo**: el escenario 1 de la historia 1 dice que en el editor de producto "«Guardar» es el
único control con el color de acento". El editor **no tiene** un "Guardar" único: tiene **más de diez**
botones `filled` que guardan cada uno su sección ("Guardar datos", "Guardar URL", "Guardar ficha",
"Guardar envío", "Guardar condiciones", "Guardar secciones", "Guardar categorías", "Guardar
opciones", "Guardar video", el de catálogos externos, el del texto alternativo de las imágenes y
"Cambiar estado"). Unificarlos en un
"Guardar" sería cambiar la estructura (FR-032).

**El principio** (FR-008, corregido el 2026-10-10): el acento señala la acción principal de una
pantalla; una pantalla sin acción principal no lleva acento. Si la tiene se decide por la tarea de la
pantalla, no por cuántos botones muestra. Así la regla sigue valiendo aunque el editor cambie: si
algún día tiene un guardado único que completa la tarea, ese botón lleva el acento.

**Decisión**: tres niveles de botón en lugar de dos.

| Nivel | Aspecto | Uso |
|---|---|---|
| **Acción principal** | Acento | La que completa la tarea de la pantalla. Como máximo una |
| **Confirmación de sección** | `filled` en primario | Guardar una tarjeta dentro de una vista que tiene varias |
| **Secundaria** | `outlined` o `text` | Todo lo demás |

El editor de producto queda **sin acento**, porque no tiene acción principal: su tarea es editar un
producto por partes, y ninguna acción la completa por sí sola. Elegir una, por ejemplo "Guardar
datos", sería decorar con acento una acción entre pares, que es lo que FR-008 prohíbe. Escenario 1
de la historia 1 corregido en la spec el 2026-10-10.

**El color de error en los botones** (FR-009a): marca solo acciones destructivas, con su propio papel
(`--ds-action-destructive`), distinto del error de validación (`--ds-status-error`), aunque hoy
compartan tono. Un botón nunca se pinta de error para señalar una validación fallida. La validación
se comunica en el campo, con texto, ícono y color (FR-024).

**Equipo** y **Categorías** también tienen varias secciones, pero sí tienen una tarea principal:
invitar a una persona y crear una categoría, que son además los ejemplos de la propia historia 1.
Esas acciones llevan el acento. "Crear rol" y las ediciones por fila de categorías son
confirmaciones de sección. El catálogo vacío muestra dos botones que crean un producto ("Nuevo
producto" en la cabecera y "Crear producto" en el estado vacío). El acento queda siempre en
"Nuevo producto", para que no cambie de lugar según haya productos o no. La lista completa está en
[contracts/primary-actions.md](./contracts/primary-actions.md).

## 14. Densidad, esqueletos y saltos de diseño

**Decisión**: densidad `0` en `mat.theme`, como hoy. No se usa densidad negativa en ningún
componente, porque baja los altos de Material por debajo de 48 px. Los esqueletos de `libs/ui`
(`ui-skeleton`) toman radios, alto de fila y espaciado de los **mismos** tokens que el contenido
final (`--ds-row-height`, `--ds-radius-md`, `--ds-space-*`). Si uno cambia, cambian los dos.
`loading-states.spec.ts` y la medida de CLS de `performance.spec.ts` lo verifican sin cambios.

**Riesgo conocido**: el tipo de letra pasa a la escala propia, que tiene otros interlineados. Una
vista cuyo alto dependía del interlineado de `--mat-sys-body-large` puede cambiar de alto, y si su
esqueleto tenía el alto viejo, aparece un salto. Las e2e de CLS lo detectan. La tarea de cada vista
incluye su esqueleto.

## 15. Las e2e como compuerta en CI (FR-033a)

**Decisión** (sesión del 2026-10-10): un trabajo `e2e` nuevo en `ci.yml` corre la suite completa
(`npx nx run admin-e2e:e2e`) y bloquea la integración. Es la **primera tarea** de la feature, y su
primera corrida en verde ocurre **antes** de aplicar ningún token. Esa corrida es la línea base: un
fallo posterior se atribuye al rediseño, no a la suite ni al entorno. Las razones están en las
Clarifications de la spec.

**Cómo es el trabajo**, sobre lo que ya existe:

- `setup-workspace` y `setup-emulators` (Java 21 y la caché de los emuladores), como los trabajos
  `rules` e `integration`.
- **firebase-tools global**, en la versión fijada en `FIREBASE_TOOLS_VERSION`: el `webServer` de
  `playwright.config.ts` llama a `firebase emulators:start`, no a `npx firebase-tools@…`. Los otros
  trabajos usan `npx --yes`, y este necesita el binario en el `PATH`.
- **Solo Chromium**: `npx playwright install --with-deps chromium`. Los dos proyectos actuales, y
  `oscuro` cuando llegue, son `Desktop Chrome`.
- `CI=true`, que la configuración ya interpreta: `forbidOnly`, `retries: 2`, reportero `github` y
  `reuseExistingServer: false`. El puerto 4320 del panel no choca con nada en el runner.
- **Artefactos al fallar**: `test-results/`, con las trazas de `trace: 'on-first-retry'`, subidos con
  `actions/upload-artifact`, para que un fallo en CI se pueda diagnosticar sin reproducirlo.
- **Required status check**: el comentario de `ci.yml` dice que los seis trabajos tienen que estar
  marcados como obligatorios en la protección de `main`. Pasan a ser siete. Marcarlo es un paso
  manual en GitHub, y la tarea lo deja como verificación explícita: sin eso, la compuerta no bloquea
  nada.

**Fuera**: `admin-e2e:perf`. En máquinas compartidas sus tiempos dan ruido, y un umbral que falla al
azar enseña a ignorar la compuerta. Sigue corriéndose antes de integrar.

**`globalTimeout` de 10 minutos**: hoy la suite corre en serie (`workers: 1`) por los cuelgues que se
vieron en paralelo, y el proyecto `oscuro` le suma `a11y` y `design-system`. La corrida de línea base
mide la duración real en el runner. Si el margen no alcanza para `oscuro`, se sube el tope **con esa
medida a la vista**. El tope es una protección contra cuelgues, no un umbral de ninguna garantía, así
que ajustarlo no afloja ninguna prueba (FR-033).

**Inestabilidad**: `retries: 2` absorbe un fallo aislado, y el reportero `github` lo marca como
*flaky* sin ocultarlo. Una prueba que necesita reintentos con frecuencia es un defecto que se
corrige, no algo que se tolera.
