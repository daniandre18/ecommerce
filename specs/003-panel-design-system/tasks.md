---

description: "Task list for 003-panel-design-system"
---

# Tasks: Sistema de Diseño del Panel

**Input**: Design documents from `/specs/003-panel-design-system/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen. La spec pide cuatro compuertas nuevas que bloquean (FR-005, FR-031,
FR-035, FR-038, FR-039), una quinta para adoptar componentes (FR-021a) y la suite e2e como compuerta
(FR-033a). Las pruebas de cada compuerta van **antes** de lo que verifican, y se comprueba que fallan.

**Organization**: agrupadas por historia de usuario, como en la 001 y la 002. Tres reglas propias de
esta feature:

1. **T001 es la primera tarea y bloquea a todas las demás.** Ninguna tarea de tokens o estilos
   empieza antes de que T001 cierre con sus cuatro criterios de salida.
2. **Los tokens se aplican vista por vista** (T024 a T035), en el orden del plan. Cada tarea es
   verificable por separado: sus archivos quedan en 0 valores literales, y sus e2e y sus casos de
   `design-system.spec.ts` pasan en los tres proyectos. Hay seis tareas globales, y cada una lo declara: el tema de
   Material (T021) y su tratamiento (T022), porque Material tiene un tema por aplicación; y el foco,
   el ícono de error, el deshabilitado y los colores forzados (T036 a T039), porque cada uno es una
   sola regla que alcanza a todos los controles. Ninguna "aplica el sistema al panel": cada una
   cambia un aspecto acotado, y **todas se verifican con la suite e2e completa en los tres
   proyectos**, además de sus casos propios.
3. **El trinquete de literales**: mientras dura la migración, el verificador **bloquea** en los
   archivos que figuran en `apps/admin/design-system/migrated-files.ts` y solo **informa** en el
   resto. Cada tarea de vista agrega sus archivos a esa lista. T050 la elimina y la compuerta pasa a
   bloquear en todo el panel. Así, cada vista ya migrada tiene compuerta en CI desde el commit que la
   migra.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo. Toca archivos distintos y no depende de una tarea pendiente
- **[Story]**: US1, US2, US3, US4 según `spec.md`
- Toda tarea lleva su ruta de archivo exacta

## Path Conventions

- Catálogo de tokens: `apps/admin/src/styles/` (`_palette`, `_tokens`, `_theme`, `_components`, `_shell`)
- Compuertas y declaraciones: `apps/admin/design-system/` (Vitest, objetivo `admin:design-check`)
- Compuerta de tamaño: `apps/admin/bundle-check/` (objetivo `admin:bundle-check`)
- Vistas: `apps/admin/src/app/`. Estados compartidos: `libs/ui/src/lib/states/`
- e2e: `apps/admin-e2e/src/`, con los proyectos `escritorio`, `movil-360` y `oscuro`
- "Los tres proyectos" significa `escritorio`, `movil-360` y `oscuro`. `oscuro` corre solo
  `a11y.spec.ts` y `design-system.spec.ts` (T018)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: poner la compuerta e2e en CI con su línea base, y preparar las herramientas de las
compuertas nuevas.

- [ ] T001 **PRIMERA TAREA. Bloquea a todas las demás.** Trabajo `e2e` en `.github/workflows/ci.yml`, según `research.md` §15:
  - **Pasos**: `./.github/actions/setup-workspace`; `./.github/actions/setup-emulators` con `firebase-tools-version: ${{ env.FIREBASE_TOOLS_VERSION }}`; `npm install -g firebase-tools@${{ env.FIREBASE_TOOLS_VERSION }}`, porque el `webServer` de `apps/admin-e2e/playwright.config.ts` llama a `firebase emulators:start` y no a `npx`; `npx playwright install --with-deps chromium`; `npx nx run admin-e2e:e2e --skip-nx-cache` con `CI=true`; y `actions/upload-artifact` de `test-results/` con `if: failure()`.
  - **Comentario de cabecera de `ci.yml`**: "los seis trabajos" pasa a "los siete trabajos". El trabajo `e2e` se describe como en los demás, citando FR-033a.
  - **No** incluye `admin-e2e:perf` (FR-033a: en máquinas compartidas da ruido).
  - **PR borrador de la feature**: `ci.yml` solo corre en `pull_request` y en push a `main`, así que subir la rama no dispara nada. Antes del criterio (a), se abre `gh pr create --draft --base main --head feat/003-panel-design-system` y se anota su número aquí. Cada push a la rama vuelve a correr los trabajos en ese PR, y ese PR es el que se mezcla al final de la feature.
  - **Criterio de salida**. Se cumplen **los cuatro** y queda anotado al pie de esta tarea:
    - (a) **Línea base en verde**: la suite **completa**, sin cambios, en los proyectos `escritorio` y `movil-360`, pasa en este trabajo dentro del PR borrador, **antes** de que exista ningún token ni estilo nuevo. Se anotan el SHA y el enlace a la corrida.
    - (b) **Duración medida**: se anota la duración del paso e2e en el runner, en esta tarea y en `research.md` §15, con su margen respecto de `globalTimeout` (10 minutos).
    - (c) **Required status check**: `e2e` queda marcado como obligatorio en la protección de `main`, junto a los otros seis. Se verifica con `gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'`, que debe listar `e2e`.
    - (d) **El check bloquea de verdad**: desde esta rama se crea `ci-check/e2e-bloquea` con una sola modificación, `expect(true).toBe(false)` en la primera prueba de `apps/admin-e2e/src/shell.spec.ts`. Se abre un PR contra `main` y se verifica que `e2e` falla **y** que GitHub impide mezclar ("Required" en rojo, botón de merge bloqueado). Se anota el enlace al PR. El PR se cierra **sin mezclar** y la rama se borra. Un check marcado como obligatorio que no bloquea da confianza falsa: si (d) no se cumple, T001 no cierra.
  - **Prohibido** para llegar al verde: omitir, borrar, marcar `skip` o `fixme`, o cambiar el umbral de una prueba (FR-033). Un fallo que solo aparece en CI se corrige en el entorno del trabajo. Si es un defecto real del panel, se registra y se resuelve antes de cerrar T001, porque una línea base con fallos conocidos no es línea base.
- [ ] T002 [P] Dependencias de desarrollo en `package.json` y `package-lock.json`: agregar `postcss-scss` con versión exacta, y declarar `sass` `1.104.1` y `postcss` `8.5.28` como directas, con la misma versión que ya instala `@angular/build` (`research.md` §0). `npm ls sass postcss` no debe mostrar dos versiones
- [ ] T003 [P] Base de `design-check`: `apps/admin/design-system/vite.config.mts` y `apps/admin/design-system/tsconfig.json`, como en `apps/admin/bundle-check/`. En `apps/admin/project.json`: objetivo `design-check` (`vitest run --config apps/admin/design-system/vite.config.mts`); `test` con `"dependsOn": ["design-check"]`, para que `npx nx run-many -t test` del trabajo `unit` lo corra (`contracts/gates.md`); y `typecheck` que también compile `apps/admin/design-system/tsconfig.json`. Se verifica con `npx nx run admin:test --skip-nx-cache`, que debe ejecutar `design-check`

**Checkpoint**: T001 cerrada con sus cuatro criterios. `design-check` corre (todavía sin pruebas)
dentro de `admin:test`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el catálogo de tokens y las compuertas que lo vigilan, **sin cambiar el aspecto de
ninguna vista**. Los tokens `--ds-*` existen en el CSS, pero ninguna vista los usa todavía. Material
sigue con el tema azure.

**⚠️ CRITICAL**: depende de T001. Ninguna historia visual (US1, US2, US4) empieza antes de terminar
esta fase. La US3 solo depende de la Fase 1.

### Pruebas primero

- [ ] T004 [P] Pruebas del lector de tokens compilados en `apps/admin/design-system/compiled-tokens.spec.ts`, con un SCSS de prueba en `apps/admin/design-system/fixtures/tokens/`:
  - `light-dark(a, b)` se separa en `light: a` y `dark: b`, y un valor sin `light-dark` vale igual en los dos.
  - Las cadenas `var(--ds-x)` → `var(--ds-y)` → valor se resuelven.
  - Un color con alfa se compone sobre un fondo dado.
  - Una referencia a un token inexistente lanza un error que lo nombra.
- [ ] T005 [P] Pruebas de contraste en `apps/admin/design-system/contrast.spec.ts`, con las reglas de `data-model.md` ("Par de contraste") al pie de la letra:
  - Umbral por `kind`: `text` 4,5; `large-text` 3; `ui` 3.
  - `declared` coincide con la razón calculada, redondeada a 2 decimales, en **los dos** esquemas.
  - "Todo token `--ds-text-*`, `--ds-on-*`, `--ds-icon-*` y `--ds-focus-ring` aparece en al menos un par".
  - "Todo `--ds-text-*` se declara contra los **tres** planos".
  - `--ds-focus-ring` se declara contra los tres planos, el superpuesto y el fondo del acento.
  - Un par que nombra un token inexistente falla.
  - Un par en `state: 'disabled'` se declara con `kind: 'ui'` y no se exige.
  - Los mensajes son los de `contracts/gates.md`.
- [ ] T006 [P] Pruebas de jerarquía tipográfica (FR-015) en `apps/admin/design-system/typography.spec.ts`: recorre los niveles de `typography-levels.ts` en orden y exige que dos niveles contiguos difieran en al menos **dos** de: tamaño, peso, color y espaciado. El espaciado entre letras y el interlineado cuentan como **un** solo atributo (`contracts/tokens.md`). Con un caso que falla sobre `fixtures/typography/`: dos niveles que solo cambian de peso
- [ ] T007 [P] Pruebas de planos en el catálogo (la mitad de SC-005 que no necesita navegador) en `apps/admin/design-system/planes.spec.ts`: `--ds-surface-page`, `--ds-surface-card` y `--ds-surface-bar` son distintos entre sí en **cada** esquema; `--ds-border-width` es mayor que 0; `--ds-border-subtle` existe. El mensaje es el de `contracts/gates.md`
- [ ] T008 [P] Pruebas del verificador de literales en `apps/admin/design-system/literals.spec.ts`, con `apps/admin/design-system/fixtures/literals/` (`research.md` §5):
  - Un `.scss` con `color: #ff0000; font-size: 13px; padding: 10px; border-radius: 3px` produce **exactamente 4** hallazgos, cada uno con `archivo:línea:columna`, propiedad, valor y token sugerido.
  - Un `.ts` con `styles:` en línea reporta la línea **del `.ts`**.
  - `0`, `100%`, `auto` y `currentColor` no producen hallazgos.
  - `width: 560px` y `max-width: 1200px` no se revisan.
  - `var(--mat-sys-primary)` en una vista es un hallazgo.
  - `calc(-1 * var(--ds-space-3))` se admite, y `calc(100% - 16px)` es un hallazgo.
  - Una excepción sin `reason` hace fallar, y una excepción cuyo `scope` no coincide con ningún archivo también.
  - **Trinquete**: un hallazgo en un archivo de `migrated-files.ts` hace fallar, y uno fuera de la lista solo se informa (código de salida 0).
  - **`_theme.scss`**: una variable de la paleta (`$blue-600`) se admite; `#3c5afe` o una variable que no viene de la paleta, no (`data-model.md`).
- [ ] T009 [P] Pruebas de la medida de la carga inicial en `apps/admin/bundle-check/initial-load.spec.ts`, con un `index.html` de prueba en `apps/admin/bundle-check/fixtures/`:
  - Lo inicial es el `<script src>` de `main`, cada `<link rel="modulepreload">`, cada `<link rel="stylesheet">` y cada `<style>` en línea (`research.md` §8), incluido el `<link media="print" data-beasties-media>`.
  - Gzip nivel 9 con `node:zlib`.
  - La comparación falla con JS Δ > 0 o con CSS Δ > 10.240 B.
  - La salida lista los archivos de cada lado.

### Implementación de la base

- [ ] T010 [P] `apps/admin/design-system/compiled-tokens.ts`: compila `apps/admin/src/styles.scss` con `sass` (con los `loadPaths` de `node_modules`), lee las `--ds-*` de `:root` y expone `light`/`dark` resueltos, hasta que T004 pase
- [ ] T011 [P] `apps/admin/src/styles/_palette.scss`: los valores de partida de `research.md` §2, para el esquema claro y el oscuro, solo como variables Sass. Encabezado con la decisión de la referencia que origina cada grupo, citando el archivo de `~/Documents/github/angular-admin/src/app/styles/`. Sin una línea copiada (FR-006)
- [ ] T012 `apps/admin/src/styles/_tokens.scss`:
  - **Todos** los tokens de `contracts/tokens.md`, con los nombres textuales: planos, texto, marca y acción (incluido `--ds-action-destructive` como papel propio, distinto de `--ds-status-error`, FR-009a), estados con significado, bordes y foco, tipografía (`-size`, `-weight`, `-line-height`, `-tracking` y el atajo `--ds-type-{nivel}`), espaciado, radio, borde, elevación, densidad y movimiento.
  - Color y elevación con `light-dark()`. Todo definido **solo** desde `_palette.scss`, las escalas u otro token, con un comentario de origen por token (`data-model.md`).
  - `styles.scss` lo incluye. Ninguna vista lo usa todavía.
  - Depende de T011.
- [ ] T013 `apps/admin/design-system/contrast-pairs.ts`: el catálogo de pares de `data-model.md` con las razones declaradas por esquema, hasta que T005 pase. Si un par no cumple, se ajusta el valor en `_palette.scss` **en luminosidad, conservando tono y saturación** (`research.md` §2), y se anota el valor final. Depende de T010 y T012
- [ ] T014 [P] (después de T010 y T012) `apps/admin/design-system/typography-levels.ts`, con el orden `page-title`, `section-title`, `subtitle`, `body`, `label`, `help` y su color (`contracts/tokens.md`), hasta que T006 pase. Con los tokens de T012, T007 también pasa
- [ ] T015 [P] Verificador de literales (después de T010 y T012, porque sugiere tokens a partir del catálogo compilado):
  - **Archivos**: `apps/admin/design-system/literals.ts` (CLI y función), `apps/admin/design-system/literal-exceptions.ts` y `apps/admin/design-system/migrated-files.ts`, esta última vacía.
  - **Funcionamiento**: lee con `postcss-scss` y extrae los `styles:` de los `.ts` con la API de TypeScript. Las propiedades por categoría son las de `research.md` §5, y el token sugerido sale de invertir los tokens compilados (T010).
  - **Excepciones iniciales**, textuales de `data-model.md`: `0`, `auto`, `inherit`, `none`, `transparent`, `currentColor` y porcentajes con `scope: 'everywhere'`, más `index-boot` con `scope: { files: ['apps/admin/src/index.html'] }`. `_palette.scss` y `_tokens.scss` no se revisan.
  - **`_theme.scss`** se revisa con una sola concesión: puede usar variables Sass de `_palette.scss` (`$…`), porque `mat.theme` las necesita para generar sus paletas. Cualquier otro valor literal, o una variable que no venga de la paleta, es un hallazgo. Con su caso en `literals.spec.ts` (T008).
  - **Lint**: el objetivo `lint` de `apps/admin/project.json` pasa a `eslint apps/admin … && tsx apps/admin/design-system/literals.ts`.
  - **Cierre**: hasta que T008 pase. `npx nx run admin:lint` sale con 0 e informa el total actual de hallazgos, del orden de 258 (`research.md` §0).
- [ ] T016 Compuerta de tamaño:
  - `apps/admin/bundle-check/initial-load.ts`, hasta que T009 pase, y `apps/admin/bundle-check/size.spec.ts`, que compara `dist/apps/admin/browser/index.html` con `dist/base-initial.json`.
  - En `apps/admin/project.json`, `bundle-check` acepta `--base=<ref>`, por omisión `origin/main`. Construye la base en un `git worktree` en `.bundle-base/` (agregado a `.gitignore`), con **su propio `npm ci`** dentro del worktree antes del build: la base tiene otro `package.json`, porque T002 agrega dependencias, y no puede usar los `node_modules` de la rama. Escribe `dist/base-initial.json`. Se anota el tiempo total del trabajo `bundle-check` en CI.
  - En `.github/workflows/ci.yml`, el trabajo `bundle-check` hace checkout con `fetch-depth: 0` y pasa `--base=${{ github.event.pull_request.base.sha || github.event.before }}`.
  - `layers.spec.ts` no cambia.
  - Comparte `project.json` con T015: no va en paralelo con ella.
  - Se verifica en esta rama: el JS crece 0 B, y el CSS crece lo que agregan `_tokens.scss` y `_shell.scss`, impreso.
- [ ] T017 Estilos del componente raíz fuera del JS inicial (`research.md` §3): el bloque `styles:` de `apps/admin/src/app/app.ts` pasa **sin cambios de valor** a `apps/admin/src/styles/_shell.scss`, incluido desde `apps/admin/src/styles.scss`, y `app.ts` queda sin `styles:`. Las clases (`.boot`, `.skip-link`, `.navigation-failure`) y el selector `:host` pasan a `app-root`. Se verifica con `npx nx run admin:bundle-check` (JS inicial con Δ < 0) y con `shell.spec.ts` en verde
- [ ] T018 [P] Proyecto `oscuro` en `apps/admin-e2e/playwright.config.ts`: `Desktop Chrome` con `colorScheme: 'dark'` y `testMatch: ['a11y.spec.ts', 'design-system.spec.ts']`. Se corre **antes de tocar ninguna vista** para fijar la línea base oscura. Si el panel actual (tema azure) ya falla axe en oscuro, esos fallos se anotan aquí y se corrigen **en esta tarea**: son previos al rediseño, y corregirlos ahora mantiene atribuible cualquier fallo posterior. Ninguna prueba se omite. Se mide la duración nueva en el trabajo `e2e`. Si el margen de `globalTimeout` no alcanza, se sube con esa medida anotada (`research.md` §15: es una protección contra cuelgues, no un umbral)

**Checkpoint**: `design-check`, `lint`, `bundle-check` y `e2e` en verde en CI. Los tokens están en el
CSS y ninguna vista cambió de aspecto. El JS inicial es menor que en la base.

---

## Phase 3: User Story 1 — Jerarquía visual (Priority: P1) 🎯 MVP

**Goal**: tres planos distintos, una tipografía con jerarquía real y, como máximo, un acento por
pantalla, en la acción principal.

**Independent Test**: los casos de `design-system.spec.ts` de cada pantalla de
`contracts/primary-actions.md` pasan en los tres proyectos: el acento computado (cantidad y nombre),
los tres planos con la tarjeta separada, y la jerarquía tipográfica.

### Declaraciones y pruebas primero

- [ ] T019 [P] [US1] `apps/admin/design-system/primary-actions.ts`, que transcribe `contracts/primary-actions.md` fila por fila (`screen`, `kind`, `action`, `why`, con `action: null` donde dice "—"), y `apps/admin/design-system/screens.spec.ts`, que falla si alguna ruta con `loadComponent` de `apps/admin/src/app/app.routes.ts` o algún componente pasado a `MatDialog.open(...)` no figura en la lista. Incluye el `open` dinámico de `shared/pending-changes/pending-changes.ts`. Inventario esperado: 10 vistas y 5 diálogos. Cada entrada transcribe `planes` (`'page-card'` en inicio de sesión, alta de cuenta, comercios e invitación; `'page-card-bar'` en las vistas del marco del comercio; un diálogo hereda los de la vista que lo abre) y `destructive`: los nombres de los botones destructivos visibles en esa pantalla, que el contrato nombra en "Por qué" (`data-model.md`)
- [ ] T020 [P] [US1] Ayudas de e2e en `apps/admin-e2e/src/design-system-support.ts`:
  - `accentElements(page)`: los elementos visibles cuyo `background-color` computado es igual al de una sonda con `background: var(--ds-action-accent)`. Se compara el color computado, no la clase (`research.md` §9).
  - `expectPlanes(page, planes)`: con `'page-card-bar'`, `body`, `.ds-card` y `.ds-bar` con fondos distintos; con `'page-card'`, `body` y `.ds-card` distintos, y **ningún** `.ds-bar` en la vista (SC-005 y FR-010, corregidos). En los dos casos, `.ds-card` con borde visible o `box-shadow` distinto de `none`.
  - `expectTypeHierarchy(page)`: `h1` > `h2` > `h3` > texto, con dos atributos de diferencia.
  - `expectDestructive(page, names)`: el conjunto de elementos visibles cuyo `background-color` computado es igual al de una sonda con `var(--ds-action-destructive)` es **exactamente** el de los nombres declarados. Si hay uno de más, se rompió "no se usa para nada más" de FR-009a; si falta uno, se rompió el tratamiento.
  - `readOnlyCollaborator(run)`, que **se mueve** desde `apps/admin-e2e/src/categories.spec.ts` sin cambiar su comportamiento, y `categories.spec.ts` pasa a importarlo.

### Tratamiento global de Material (tareas globales: ver la regla 2)

- [ ] T021 [US1] `apps/admin/src/styles/_theme.scss`: `mat.theme` con la paleta propia en lugar de `mat.$azure-palette`, la tipografía del sistema y `density: 0`. `mat.theme-overrides` hace que los `--mat-sys-*` que usa Material apunten a los `--ds-*` (primario, superficies, texto, error, contorno). `apps/admin/src/styles.scss` lo usa en lugar del `mat.theme` actual. Antes de escribir cada override, verificar el nombre del token en `node_modules/@angular/material/core/tokens/` y en el `_m3-*.scss` del componente: un nombre mal escrito no da error, simplemente no aplica. **Verificación**: la suite e2e completa en los tres proyectos y `design-check` en verde. Es global porque Material tiene un solo tema por aplicación
- [ ] T022 [US1] Tratamiento de los componentes de Material en `apps/admin/src/styles/_components.scss`, fila por fila de la tabla "Componentes de Material" de `contracts/component-treatments.md`:
  - **Botones**: sin sombra en reposo y sin mayúsculas. `.ds-primary-action` → `button-overrides` con `--ds-action-accent` y `--ds-on-action-accent`. `.ds-destructive` → `--ds-action-destructive` y `--ds-on-action-destructive`.
  - **Resto de componentes**: campo de formulario, checkbox, radio, chip (conservando `.chip-touch-target`), diálogo (elevación `overlay`, `--ds-radius-lg`, título en `section-title`), menú, snack-bar y barra de progreso.
  - **Mixins sin incluir** (FR-021a): `ds-paginator`, `ds-tabs`, `ds-mat-table`, `ds-mat-card` y `ds-mat-toolbar`, **definidos y sin `@include`**.
  - **Verificación**: la suite e2e completa en los tres proyectos.
- [ ] T023 [US1] Clases de patrón en `apps/admin/src/styles/_components.scss`, con los valores de la tabla "Marcado propio del panel" de `contracts/component-treatments.md`:
  - `.ds-card`: `--ds-surface-card`, borde `--ds-border-width` `--ds-border-subtle`, `--ds-radius-lg`, `--ds-elevation-card`, relleno `--ds-space-4` y `--ds-space-6` desde 600 px.
  - `.ds-table-row`: sin fondo propio, separador `--ds-border-subtle`, sin separador en la última fila, hover `--ds-surface-hover`.
  - `.ds-bar`: `--ds-surface-bar` y `--ds-elevation-bar`.
  - `.ds-notice`, `.ds-notice--error` y `.ds-notice--warning`.

  Ninguna vista las usa todavía. Mismo archivo que T022: va después.

### Aplicación vista por vista (en este orden; cada una verificable por separado)

**Cada tarea de vista**:

- **Estilos**: reemplaza en **sus** archivos todo valor literal y todo `var(--mat-sys-*)` por `var(--ds-*)`. Agrega las clases `ds-*` a elementos que **ya existen**, sin envolver, mover ni quitar nada (FR-032). Lleva su `<h1>` a `page-title`, sus `<h2>` a `section-title` y el texto de ayuda a `help`.
- **Esqueleto**: ajusta el de la vista para que conserve alto, radio y espaciado (FR-027).
- **Trinquete**: agrega sus archivos a `migrated-files.ts`.
- **Pruebas**: agrega sus casos a `apps/admin-e2e/src/design-system.spec.ts` (acento, destructivas con `expectDestructive`, planos y tipografía de cada pantalla, según `primary-actions.ts`). Cada caso se titula `pantalla: <screen>`, con el `screen` textual de `primary-actions.ts` (G1, ver T035).
- **Cierra cuando**:
  - `npx nx run admin:lint` da 0 hallazgos en sus archivos (ya bloqueante por el trinquete);
  - sus e2e existentes y sus casos nuevos pasan en los tres proyectos;
  - `npx nx run admin:bundle-check` queda dentro del presupuesto.

Todas comparten `migrated-files.ts` y `design-system.spec.ts`, así que **ninguna lleva [P]**.

- [ ] T024 [US1] **Estados compartidos**: `libs/ui/src/lib/states/skeleton.ts`, `empty-state.ts` y `error-state.ts`. El esqueleto toma `--ds-row-height` y `--ds-radius-md`, y el error, `.ds-notice--error`. Van primero porque todas las vistas los usan. e2e: `loading-states.spec.ts` y `offline.spec.ts`. Crea `design-system.spec.ts` con su primer caso: el estado de error del catálogo sin red, sin acento
- [ ] T025 [US1] **Diálogos compartidos**: `apps/admin/src/app/shared/confirm-dialog.ts` (el botón de confirmar lleva `ds-destructive`: sus cinco usos son destructivos según `contracts/primary-actions.md`) y `apps/admin/src/app/shared/pending-changes/pending-changes.ts`. Casos: el diálogo de "Salir sin guardar" tiene 0 acentos, y su botón tiene el fondo de `--ds-action-destructive`. e2e: `pending-changes.spec.ts`
- [ ] T026 [US1] **Marco**:
  - `apps/admin/src/styles/_shell.scss`: el enlace para saltar al contenido con `--ds-radius-sm`; la falla de navegación con `.ds-notice--error`.
  - `apps/admin/src/app/tenant/tenant-shell/tenant-shell.ts`: el `header` lleva `.ds-bar`, el nombre del comercio va en `section-title` y el enlace activo en `--ds-text-link`.
  - `apps/admin/src/index.html`: sus literales pasan a ser **iguales** a los valores compilados de los tokens que representan, en cada esquema, y `apps/admin/design-system/boot.spec.ts` lo verifica (`research.md` §4).
  - e2e: `shell.spec.ts` y `tenant-switcher.spec.ts`.
  - `npx nx run admin-e2e:perf` en local: estructura visible por debajo de 1 s, sin cambio de umbral.
- [ ] T027 [US1] **Autenticación**: `apps/admin/src/app/auth/login/login.ts` y `apps/admin/src/app/auth/sign-up/sign-up.ts`. "Entrar" y "Crear cuenta" llevan `ds-primary-action`. El `<form>` que ya existe en cada una lleva `.ds-card`: dos planos, página y tarjeta, sin barra (SC-005). Casos de `/login` y `/signup`. e2e: los casos de autenticación de `a11y.spec.ts` y `keyboard.spec.ts`
- [ ] T028 [US1] **Comercios e invitación**: dos planos, página y tarjeta, sin barra (SC-005). En `apps/admin/src/app/tenant/tenant-switcher/tenant-picker.ts`, la `<ul>` que ya existe lleva `.ds-card` (el estado vacío ya es tarjeta por T024). En `accept-invitation.ts`, el propio componente lleva `.ds-card` con `host: { class: 'ds-card' }`, sin agregar elementos. Comercios: 0 acentos y `apps/admin/src/app/team/accept-invitation/accept-invitation.ts` ("Aceptar invitación" o "Entrar al comercio", según el estado, con `ds-primary-action`; "Cerrar sesión" pasa de `filled` a texto, que es un cambio de aspecto y no de estructura). e2e: `tenant-switcher.spec.ts` y `team-and-permissions.spec.ts` (invitación)
- [ ] T029 [US1] **Catálogo**: `apps/admin/src/app/catalog/product-list/product-list.ts`, `apps/admin/src/app/catalog/product-list/bulk-actions.ts` y `apps/admin/src/app/catalog/create-product/create-product-dialog.ts`.
  - **Acento**: "Nuevo producto" lleva `ds-primary-action`. "Crear producto" del estado vacío sigue `filled` en primario. "Crear" del diálogo lleva `ds-primary-action`.
  - **Filas**: llevan `.ds-table-row`, con `--ds-row-height`.
  - **Casos**: catálogo con productos (1 acento, "Nuevo producto"); catálogo vacío de `t2` (1 acento, "Nuevo producto", no "Crear producto"); y el diálogo (1 acento, "Crear").
  - e2e: `catalog.spec.ts`, `loading-states.spec.ts` y `mobile.spec.ts`.
- [ ] T030 [US1] **Caso "catálogo sin acento"** (historia 1, escenario 2) en `apps/admin-e2e/src/design-system.spec.ts`: con `readOnlyCollaborator(run)` de `design-system-support.ts` (T020), un colaborador cuyo rol tiene **solo `catalog.read`** abre el catálogo y la prueba verifica **0** elementos con el acento.
  - **Depende de T102 de la 001** (`specs/001-catalog-rbac/tasks.md`, "Decisiones pendientes"). `readOnlyCollaborator` crea un rol con solo `catalog.read`. Si T102 se cierra quitando `catalog.read` del enumerado `Permission` (salida b), `updateRole` rechazará ese permiso: el caso debe pasar a crear el rol **sin permisos**, y la prueba tiene que seguir verificando lo mismo (un colaborador sin `catalog.write` no ve ningún acento). Si T102 se cierra exigiendo el permiso en las reglas (salida a), el caso no cambia.
  - Dejar en la prueba el comentario: `// Depende de T102 de la 001: si catalog.read sale del enumerado, usar un rol sin permisos.`
- [ ] T031 [US1] **Editor de producto: cabecera y secciones de datos**:
  - **Archivos**: `apps/admin/src/app/catalog/product-editor/product-editor.html` y `product-editor.scss`, `details-section.ts`, `storefront-section/storefront-section.html`, `.scss` y `.ts`, `shipping-section/shipping-section.html`, `.scss` y `.ts`, `status-control/status-control.html` y `.scss`, `presentation-section/presentation-section.ts`, `categories-section/categories-section.ts` y `external-catalogs-section/external-catalogs-section.ts`.
  - **Clases**: cada `<section>` del editor lleva `.ds-card`. "Archivar producto" lleva `ds-destructive`. Los guardados de cada sección y "Cambiar estado" siguen `filled` en primario.
  - **Caso**: el editor tiene **0** acentos, y todos los botones `filled` que guardan una sección tienen el mismo fondo (historia 1, escenario 1 corregido).
  - e2e: `product-editor.spec.ts`, `sections.spec.ts`, `storefront.spec.ts` y `pending-changes.spec.ts`.
- [ ] T032 [US1] **Editor de producto: variantes, opciones e imágenes**:
  - **Archivos**: `apps/admin/src/app/catalog/variant-table/variant-table.ts`, `variant-row.html`, `variant-row.scss` y `variant-row.ts`, `bulk-edit/bulk-edit.ts`, `assign-option-dialog/assign-option-dialog.ts`, `variant-images-dialog.ts`, `apps/admin/src/app/catalog/image-upload/image-upload.html`, `.scss` y `.ts`, `product-video.ts`, `storage-image.ts` y `apps/admin/src/app/catalog/product-editor/options-editor/options-editor.html`, `.scss` y `.ts`.
  - **Clases**: las filas de variantes llevan `.ds-table-row`. "Confirmar" de `AssignOptionDialog` lleva `ds-primary-action`.
  - **Casos**: `AssignOptionDialog` (1 acento, "Confirmar") y `VariantImagesDialog` (0).
  - e2e: `variant-data.spec.ts` y `product-editor.spec.ts`.
- [ ] T033 [US1] **Categorías**: `apps/admin/src/app/catalog/categories/categories-page.html`, `.scss` y `.ts`, y `category-row.ts`.
  - **Clases**: "Crear categoría" lleva `ds-primary-action`. En la fila, "Guardar", "Mover" y "Ocultar" siguen `filled` en primario, y "Eliminar" lleva `ds-destructive`.
  - **Casos**: 1 acento ("Crear categoría"), y una fila en edición no agrega ninguno.
  - e2e: `categories.spec.ts`.
- [ ] T034 [US1] **Equipo y rol**:
  - **Archivos**: `apps/admin/src/app/team/team-page.ts`, `members/members-section.ts`, `members/invitations-section.ts`, `members/transfer-ownership-dialog.ts`, `roles/roles-section.ts` y `role-editor/role-editor.ts`.
  - **Clases**: "Invitar" lleva `ds-primary-action`. "Crear rol" sigue `filled`. "Traspasar la propiedad" y "Eliminar rol" llevan `ds-destructive`. "Guardar rol" lleva `ds-primary-action`.
  - **Casos**: Equipo como Propietario (1 acento, "Invitar"); `TransferOwnershipDialog` (0); Rol (1 acento, "Guardar rol").
  - e2e: `team-and-permissions.spec.ts`.
- [ ] T035 [US1] **Bitácora**: `apps/admin/src/app/audit/audit-log/audit-log.ts` y `apps/admin/src/app/audit/entry-detail/entry-detail.ts`. Caso: 0 acentos. e2e: `audit.spec.ts`. **Al cerrar la última vista**, `apps/admin/design-system/screens.spec.ts` suma una verificación: cada `screen` de `primary-actions.ts` aparece como título `pantalla: <screen>` de algún caso de `apps/admin-e2e/src/design-system.spec.ts`. Así el "100 % de las pantallas" de SC-004 lo hace cumplir una compuerta de CI, no la disciplina (G1 de `/speckit-analyze`)

**Checkpoint**: las 10 vistas y los 5 diálogos tienen sus casos en verde en los tres proyectos.
`migrated-files.ts` contiene todo archivo del panel con estilos, y el informe de literales da 0.
Validar con `quickstart.md`, historia 1.

---

## Phase 4: User Story 2 — Estados claros y accesibles (Priority: P1)

**Goal**: cada control muestra su estado igual en todo el panel, sin depender solo del color, y con
contraste AA en los dos esquemas.

**Independent Test**: los casos de estados de `design-system.spec.ts` y `a11y.spec.ts` en
`escritorio` y `oscuro`, más `contrast.spec.ts` con los pares de estado.

**Depende de T035**: necesita los tratamientos de T022 y T023, el `design-system.spec.ts` que crea
T024 y las vistas ya migradas, sobre las que corren sus casos.

**Las cuatro tareas de esta fase son globales** (regla 2): cada una cierra cuando sus casos pasan
**y** la suite e2e completa queda en verde en los tres proyectos.

- [ ] T036 [US2] Foco (FR-023): en `apps/admin/src/styles.scss`, `:focus-visible` pasa de `3px solid var(--mat-sys-primary)` a `var(--ds-focus-ring-width) solid var(--ds-focus-ring)`, con `outline-offset: var(--ds-focus-ring-offset)`. Caso en `apps/admin-e2e/src/design-system.spec.ts`: con Tab, un control sobre cada plano (página, `.ds-card`, `.ds-bar`, diálogo) y "Nuevo producto" (fondo de acento) tiene un `outline` computado con el color y el ancho del anillo. e2e: `keyboard.spec.ts`
- [ ] T037 [US2] Error con ícono (FR-024): en `apps/admin/src/styles/_components.scss`, `.mat-mdc-form-field-error::before` y `.ds-notice--error::before` dibujan un ícono con `mask` sobre un SVG en línea (`data:`) y `background: currentColor`. Sin fuente de íconos, porque FR-017 no admite descargas, y sin tocar plantillas. **Actualizar** la fila "Campo de formulario" de `specs/003-panel-design-system/contracts/component-treatments.md`, que decía `matSuffix`, con este mecanismo y su razón: es global, no cambia la estructura y no requiere tocar cada campo. Caso: un SKU vacío muestra `mat-error` con texto y con un `::before` de `mask-image` distinto de `none`
- [ ] T038 [US2] Deshabilitado, hover y movimiento (FR-025, FR-026, FR-028): en `apps/admin/src/styles/_components.scss`, el deshabilitado usa `--ds-text-disabled` y `cursor: not-allowed`, nunca el tono ni el borde de error. Las transiciones usan `--ds-motion-short`, y la regla de `prefers-reduced-motion` de `styles.scss` queda igual. Caso: "Cambiar estado" deshabilitado junto a "Archivar producto" difieren en más que el color (opacidad o cursor), no reciben foco con Tab y un clic no hace nada. **Revisión manual de FR-026**: en cada vista, nada se ve **solo** con hover. Anotar el resultado al pie de esta tarea
- [ ] T039 [US2] Colores forzados (FR-013): reglas de `@media (forced-colors: active)` en `apps/admin/src/styles/_components.scss`, solo si hacen falta. Caso con `page.emulateMedia({ forcedColors: 'active' })` en catálogo y editor: `.ds-card`, `.ds-bar` y los campos tienen `border-style` distinto de `none` y ancho mayor que 0
- [ ] T040 [US2] Pares de estado en `apps/admin/design-system/contrast-pairs.ts` (historia 2, escenario 5):
  - hover (`--ds-surface-hover` compuesto sobre cada plano) con el texto encima;
  - fila seleccionada;
  - error (`--ds-status-error` sobre los tres planos; `--ds-on-status-error-container`);
  - aviso, éxito e información;
  - deshabilitado, declarado con `kind: 'ui'` y no exigido;
  - `--ds-focus-ring` sobre `--ds-action-accent` y sobre `--ds-action-destructive`.

  `contrast.spec.ts` en verde.

**Checkpoint**: `a11y.spec.ts` en `escritorio` y `oscuro` sin incumplimientos (SC-003).
`contrast.spec.ts` al 100 % (SC-002). Validar con `quickstart.md`, historia 2.

---

## Phase 5: User Story 3 — Tuteo neutro (Priority: P2)

**Goal**: todo el panel en tuteo neutro, sin voseo ni usted.

**Independent Test**: `design-check` (lenguaje) en verde, las e2e con sus textos actualizados, y la
revisión manual de T049.

**Depende solo de la Fase 1** (T001 y T003): no usa tokens, y puede avanzar en paralelo con las
fases 2 a 4. Comparte archivos con las tareas de vista de la US1 (ver "Archivos compartidos").

- [ ] T041 [P] [US3] Pruebas de lenguaje en `apps/admin/design-system/language.spec.ts`, con `apps/admin/design-system/fixtures/language/` (`research.md` §7):
  - **Voseo detectado**: formas conocidas (`tenés`, `querés`, `podés`, `sabés`, `sos`); candidatos morfológicos (`revisá`, `elegí`, `escribí`); enclíticos sin tilde (`revisalos`, `movelas`, `asegurate`).
  - **Léxico**: las palabras del léxico (`está`, `será`, `menú`) pasan, y una palabra candidata que no está en el léxico falla como "revisar".
  - **Usted**: la lista cerrada de FR-039, **textual**: revise, cree, ingrese, agregue, edite, guarde, elimine, defina, elija, seleccione, busque, confirme y cancele, como palabra completa y sin importar mayúsculas. Una excepción por texto exacto habilita **solo** ese texto.
  - **Excepciones muertas**: una entrada de léxico o una excepción que no aparece en ningún texto falla.
  - **Fuera de alcance**: los comentarios de TypeScript, los `<!-- -->` y los `*.spec.ts` no se recorren.
- [ ] T042 [US3] `apps/admin/design-system/language.ts` y `apps/admin/design-system/language-exceptions.ts`, hasta que T041 pase.
  - **Recorrido**: cadenas, plantillas y `.html` de `apps/admin/src/app` y `libs/ui/src`, y los mensajes de `BusinessRuleError` y `HttpsError` de `libs/application/src` y `apps/functions/src` (`research.md` §12).
  - **Léxico**: se arma clasificando la primera corrida, palabra por palabra, cada una con su razón (`data-model.md`: `{ word, reason }`).
  - **Cierre**: la compuerta falla con los textos con voseo que corrigen T043 a T046, y el número de hallazgos queda anotado aquí.
- [ ] T043 [P] [US3] Tuteo en autenticación, marco y errores:
  - **Archivos**: `apps/admin/src/app/app.ts` ("No pudimos abrir esa vista. Revisa tu conexión."), `auth/login/login.ts`, `auth/sign-up/sign-up.ts` y su `sign-up.spec.ts`, `tenant/tenant-shell/tenant-shell.ts`, `team/accept-invitation/accept-invitation.ts` y `shared/command-errors.ts` (todas sus entradas con voseo; entre ellas: "Recarga para ver los cambios", "Revísalos y reintenta", "Revisa los dígitos", "muévelas o elimínalas primero", "Reintenta", "No tienes permiso…", "Vuelve a iniciar sesión", "Recarga la página", "Revisa tu red y reintenta").
  - **Escenarios**: 1 a 3 de la historia 3.
- [ ] T044 [P] [US3] Tuteo en el catálogo y el editor:
  - **Archivos**: `apps/admin/src/app/catalog/product-list/product-list.ts` y `product-list.spec.ts`, `bulk-actions.ts`, `create-product/create-product-dialog.ts`, `product-editor/status-control/status-control.html`, `shipping-section/shipping-section.ts`, `categories-section/categories-section.ts`, `options-editor/options-editor.ts`, `shared/amount-input.ts`, `image-upload/image-upload.ts`, `image-upload/product-video.ts`, `variant-table/variant-row.ts`, `variant-table/variant-table.spec.ts`, `bulk-edit/bulk-edit.ts` y `bulk-edit.spec.ts`, y `assign-option-dialog/assign-option-dialog.ts` y `assign-option-dialog.spec.ts`.
  - **También**: nombres accesibles, ayudas y marcadores de posición (escenario 4).
- [ ] T045 [P] [US3] Tuteo en categorías y equipo: `apps/admin/src/app/catalog/categories/categories-page.html`, `categories-page.ts` y `category-row.ts`, `team/team-page.ts`, `members/invitations-section.ts`, `members/members-section.ts` y `members-section.spec.ts`, `members/transfer-ownership-dialog.ts` y `role-editor/role-editor.ts`
- [ ] T046 [P] [US3] Mensajes del servidor (`research.md` §12):
  - `apps/functions/src/bootstrap/guard.ts`: "No tienes permiso para realizar esta operación". El comentario de la línea 30 también pasa a tuteo. **Sigue siendo el mismo texto** para "no miembro" y para "sin permiso", para no revelar si el comercio existe.
  - `libs/application/src/use-cases/team/invitations.ts`: "Ya eres miembro de este comercio".
  - Las pruebas que asertan esos textos se actualizan con el texto nuevo, sin cambiar lo que verifican.
- [ ] T047 [US3] Textos esperados de las e2e: `apps/admin-e2e/src/loading-states.spec.ts`, `pending-changes.spec.ts`, `support.ts` y cualquier otro `*.spec.ts` de `apps/admin-e2e/src/` que espere un texto cambiado en T043 a T045. **Solo** cambia el texto esperado: misma aserción, mismo umbral y ninguna prueba quitada (FR-033). La suite completa en verde en el trabajo `e2e`. Depende de T043 a T045
- [ ] T048 [US3] `design-check` en verde: 0 voseo y 0 imperativos de usted fuera de las excepciones (SC-008). Ninguna excepción muerta. Depende de T042 a T046
- [ ] T049 [US3] Revisión manual del usted que la lista cerrada no cubre (FR-039, historia 3): leer cada vista y cada diálogo de `contracts/primary-actions.md`, con lector de pantalla en catálogo y editor (`quickstart.md`, historia 3, paso 4). Todo imperativo de usted encontrado se corrige y **se agrega a la lista cerrada** en el mismo cambio: en `language.ts`, en la lista de FR-039 de `specs/003-panel-design-system/spec.md` y en `language.spec.ts`. Anotar al pie de esta tarea qué se revisó y qué se encontró

**Checkpoint**: SC-008 en verde. Validar con `quickstart.md`, historia 3.

---

## Phase 6: User Story 4 — Un solo lugar (Priority: P3)

**Goal**: la identidad se mantiene desde el catálogo, y la revisión automática rechaza todo valor
escrito a mano.

**Independent Test**: escenarios 1 a 3 de la historia 4 (`quickstart.md`, "Comprobar que de verdad
fallan" y "Historia 4").

**Depende de T035 y de T036**: el trinquete debe cubrir todo el panel antes de retirarse, y
`styles.scss` tiene `outline: 3px` y `outline-offset: 2px`, valores que la compuerta revisa, hasta
que T036 los reemplaza. `styles.scss` no pertenece a ninguna tarea de vista.

- [ ] T050 [US4] Retirar el trinquete: borrar `apps/admin/design-system/migrated-files.ts` y su uso en `literals.ts`. El verificador **bloquea en todo** el panel, y `var(--mat-sys-*)` solo se admite en `apps/admin/src/styles/_theme.scss`. Actualizar `literals.spec.ts` (los casos del trinquete pasan a "todo hallazgo bloquea"). `npx nx run admin:lint` con **0** hallazgos (SC-001). Revisar `literal-exceptions.ts`: cada `reason` se sostiene, ninguna excepción está muerta
- [ ] T051 [P] [US4] Compuerta de adopción (FR-021a) en `apps/admin/design-system/adoption.spec.ts`: falla si `apps/admin/src` o `libs/ui/src` importa `@angular/material/paginator`, `tabs`, `table`, `card` o `toolbar` y `apps/admin/src/styles/_components.scss` no tiene el `@include` del mixin correspondiente (`ds-paginator`, `ds-tabs`, `ds-mat-table`, `ds-mat-card`, `ds-mat-toolbar`). El mensaje es el de `contracts/gates.md` y remite a "Adoptar uno de estos componentes" de `contracts/component-treatments.md`. Con un caso sobre `fixtures/adoption/` que falla, y otro que pasa al incluir el mixin
- [ ] T052 [P] [US4] Aislamiento de la paleta (historia 4, escenario 3) en `apps/admin/design-system/palette-isolation.spec.ts`:
  - **Uso de la paleta**: solo `_tokens.scss` y `_theme.scss` hacen `@use` de `_palette.scss`.
  - **Propagación**: compilar con otro azul primario (`@use … with`) cambia `--ds-primary`, y la prueba de contraste reevalúa los pares que lo usan.

  Junto con T050, garantiza que cambiar un valor de la paleta llega a todas las vistas sin tocar ningún componente.

**Checkpoint**: escenarios 1 a 3 de la historia 4, verificados con `quickstart.md`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T053 [P] Validación completa con `specs/003-panel-design-system/quickstart.md`: las tres compuertas sin navegador, las cuatro comprobaciones "de verdad fallan" y las cuatro historias en escritorio y a 360 px, en claro y en oscuro. Anotar el resultado al pie de esta tarea
- [ ] T054 [P] Rendimiento en local (FR-033a lo deja fuera de CI): `npx nx run admin-e2e:perf` con los mismos umbrales (SC-009 y SC-008 de la 001). Anotar los números junto a los de la base
- [ ] T055 [P] Revisión manual de los requisitos sin compuerta (`plan.md`, "Decisión: las e2e pasan a ser compuerta en CI"):
  - FR-006: ninguna línea de la referencia en el diff (`git diff main -- apps libs` contra `~/Documents/github/angular-admin/src/app/styles/`).
  - FR-011: cada elemento usa el nivel de elevación de su papel.
  - FR-012: cada radio y borde, el paso declarado.
  - FR-019: dentro de un grupo `space-2`, entre grupos `space-6` y entre tarjetas `space-8`.
  - FR-022: cada componente con sus estados de `contracts/component-treatments.md`.
  - FR-032: el diff de plantillas solo agrega clases y cambia textos, sin mover, envolver ni quitar elementos.

  Anotar qué se revisó al pie de esta tarea.
- [ ] T056 Cierre de documentación: tamaño final de la carga inicial (Δ JS y Δ CSS contra `main`) en `specs/003-panel-design-system/research.md` §8, y el valor final de cada color de `_palette.scss` en la tabla de §2 si cambió en T013. `Status` de `spec.md` en `Implemented`

---

## Dependencies & Execution Order

### Phase Dependencies

- **T001**: sin dependencias. **Bloquea todo**, incluidas T002 y T003. Cierra solo con sus cuatro criterios de salida (línea base en verde, duración anotada, check obligatorio y PR de prueba bloqueado)
- **Setup (Fase 1)**: T002 y T003 después de T001
- **Foundational (Fase 2)**: depende de la Fase 1. **Bloquea US1, US2 y US4**
- **US1 (Fase 3)**: depende de la Fase 2. Sus tareas de vista (T024 a T035) van **en orden** y una por vez
- **US2 (Fase 4)**: depende de T035
- **US3 (Fase 5)**: depende **solo** de la Fase 1. Puede avanzar en paralelo con las fases 2 a 4
- **US4 (Fase 6)**: depende de T035 (todo el panel en el trinquete), de T036 (los literales de foco de `styles.scss`) y de T015
- **Polish (Fase 7)**: depende de todas las historias

### Orden dentro de cada fase

Pruebas de la compuerta primero, comprobando que fallan → implementación hasta que pasan. En la US1:
declaraciones y ayudas (T019, T020) → tema global (T021) → tratamientos (T022, T023) → compartidos
(T024, T025) → vistas (T026 a T035), cada una con sus propios casos e2e.

### Archivos compartidos entre tareas (por eso no llevan [P])

- `apps/admin/design-system/migrated-files.ts` y `apps/admin-e2e/src/design-system.spec.ts`: T024 a T035, T036 a T039 (solo el `.spec.ts`), T050 (borra la lista)
- `apps/admin/src/styles/_components.scss`: T022, T023, T037, T038, T039
- `apps/admin/src/styles.scss`: T012, T017, T021, T036
- `apps/admin/project.json`: T003, T015, T016
- `.github/workflows/ci.yml`: T001, T016
- `apps/admin/design-system/contrast-pairs.ts`: T013, T040
- `apps/admin/src/styles/_palette.scss`: T011, T013 (ajustes por contraste)
- **Entre US1 y US3** (fases que pueden ir en paralelo): `app.ts` (T017 y T043); `login.ts` y `sign-up.ts` (T027 y T043); `tenant-shell.ts` (T026 y T043); `accept-invitation.ts` (T028 y T043); los archivos del catálogo, del editor, de categorías y de equipo (T029 a T034 con T044 y T045). Si avanzan en paralelo, la tarea que llega segunda rebasa sobre la primera. Los cambios no se pisan, porque una toca estilos y la otra textos, pero el archivo es el mismo
- `apps/admin-e2e/src/categories.spec.ts`: T020 (mueve `readOnlyCollaborator`) y T047 (textos)

### Parallel Opportunities

- Fase 1: T002 y T003, después de T001
- Fase 2: las pruebas T004 a T009 en paralelo; después T010, T011 y T018 en paralelo; T012 después de T011; T013, T014 y T015 en paralelo, después de T010 y T012 (los tres leen los tokens compilados); T016 después de T015; T017 al final
- US1: T019 y T020 en paralelo. El resto, en orden
- US3: T041 primero; T043, T044, T045 y T046 en paralelo (archivos distintos); T047 y T048 al final
- US4: T051 y T052 en paralelo, con T050 o después de ella
- Polish: T053, T054 y T055 en paralelo
- **Entre historias**: la US3 completa puede correr en paralelo con las fases 2 a 4

---

## Parallel Example: User Story 3

```bash
# Primero, la prueba de la compuerta (debe fallar):
Task: "T041 Pruebas de lenguaje en apps/admin/design-system/language.spec.ts"

# Con el verificador listo (T042), los cuatro grupos de textos en paralelo:
Task: "T043 Tuteo en autenticación, marco y errores (app.ts, login.ts, sign-up.ts, command-errors.ts…)"
Task: "T044 Tuteo en el catálogo y el editor (product-list.ts, variant-row.ts, bulk-edit.ts…)"
Task: "T045 Tuteo en categorías y equipo (category-row.ts, members-section.ts…)"
Task: "T046 Mensajes del servidor en guard.ts e invitations.ts"
```

---

## Implementation Strategy

### MVP primero (Historia 1)

1. **T001**: la e2e en CI, con la línea base en verde y el bloqueo comprobado con un PR que falla
2. Fase 1 (T002, T003) y Fase 2: catálogo y compuertas, sin cambiar el aspecto
3. Historia 1, vista por vista: cada una se integra con su compuerta de literales ya bloqueante y sus
   casos e2e
4. **PARAR Y VALIDAR** con `quickstart.md`, historia 1
5. El panel ya tiene planos, jerarquía y acento

### Entrega incremental

1. T001 + Setup + Foundational → compuertas listas, sin cambio visual
2. Historia 1 → validar → **MVP**: identidad y jerarquía
3. Historia 2 → validar → estados y accesibilidad en los dos esquemas
4. Historia 3 (puede ir en paralelo desde el paso 1) → validar → tuteo neutro
5. Historia 4 → validar → la compuerta de literales bloquea en todo el panel

---

## Notes

- Las tareas marcadas [P] tocan archivos distintos y no dependen de una tarea pendiente
- Verificar que las pruebas **fallan** antes de implementar lo que verifican
- Confirmar después de cada tarea o grupo lógico. Cada tarea de vista es un commit, para que una
  regresión se pueda atribuir a una vista
- Ninguna prueba vigente se omite, se borra ni se afloja (FR-033). Cambiar un texto esperado por el
  tuteo no es aflojarla
- SC-009 y SC-010 del spec son **objetivos de producto**: se verifican con pruebas de usuario y
  **no** bloquean el despliegue
