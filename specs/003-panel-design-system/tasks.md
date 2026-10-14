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

- [X] T001 **PRIMERA TAREA. Bloquea a todas las demás.** Trabajo `e2e` en `.github/workflows/ci.yml`, según `research.md` §15:
  - **Pasos**: `./.github/actions/setup-workspace`; `./.github/actions/setup-emulators` con `firebase-tools-version: ${{ env.FIREBASE_TOOLS_VERSION }}`; `npm install -g firebase-tools@${{ env.FIREBASE_TOOLS_VERSION }}`, porque el `webServer` de `apps/admin-e2e/playwright.config.ts` llama a `firebase emulators:start` y no a `npx`; `npx playwright install --with-deps chromium`; `npx nx run admin-e2e:e2e --skip-nx-cache` con `CI=true`; y `actions/upload-artifact` de `test-results/` con `if: failure()`.
  - **Comentario de cabecera de `ci.yml`**: "los seis trabajos" pasa a "los siete trabajos". El trabajo `e2e` se describe como en los demás, citando FR-033a.
  - **No** incluye `admin-e2e:perf` (FR-033a: en máquinas compartidas da ruido).
  - **PR borrador de la feature**: `ci.yml` solo corre en `pull_request` y en push a `main`, así que subir la rama no dispara nada. Antes del criterio (a), se abre `gh pr create --draft --base main --head feat/003-panel-design-system` y se anota su número aquí. Cada push a la rama vuelve a correr los trabajos en ese PR, y ese PR es el que se mezcla al final de la feature.
  - **Criterio de salida**. Se cumplen **los cuatro** y queda anotado al pie de esta tarea:
    - (a) **Línea base en verde**: la suite **completa**, sin cambios, en los proyectos `escritorio` y `movil-360`, pasa en este trabajo dentro del PR borrador, **antes** de que exista ningún token ni estilo nuevo. Se anotan el SHA y el enlace a la corrida.
    - (b) **Duración medida**: se anota la duración del paso e2e en el runner, en esta tarea y en `research.md` §15, con su margen respecto de `globalTimeout` (10 minutos).
    - (c) **Required status check**: `e2e` queda marcado como obligatorio en la protección de `main`, junto a los otros seis. Se verifica con `gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'`, que debe listar `e2e`.
    - (d) **El check bloquea de verdad**: desde esta rama se crea `ci-check/e2e-bloquea` con una sola modificación, `expect(true).toBe(false)` en la primera prueba de `apps/admin-e2e/src/shell.spec.ts`. Se abre un PR contra `main` y se verifica que `e2e` falla **y** que GitHub impide mezclar ("Required" en rojo, botón de merge bloqueado). Se anota el enlace al PR. El PR se cierra **sin mezclar** y la rama se borra. Un check marcado como obligatorio que no bloquea da confianza falsa: si (d) no se cumple, T001 no cierra.
  - **Avance (2026-10-11)**:
    - **PR borrador**: [#22](https://github.com/daniandre18/ecommerce/pull/22). Para que CI corriera hubo que mezclar `main` en la rama: el *squash* del #21 dejaba a `spec.md` y al checklist en conflicto add/add. El árbol de `main` era idéntico a `086aca9`, así que se conservaron las versiones de la rama, y el merge no cambió ningún archivo.
    - **(a)**: primera corrida, [38104416427](https://github.com/daniandre18/ecommerce/actions/runs/38104416427) sobre `4cc467e`: los siete trabajos en verde. En e2e, **130 pasadas**; **8 omitidas**, que son los `skip` por proyecto que ya existían (2 de `keyboard.spec.ts` en móvil y 6 de `mobile.spec.ts` en escritorio); y **2 flaky**, la misma prueba en los dos proyectos: `loading-states.spec.ts:117`, "el árbol que no llega del servidor da error con reintento". No se dio por línea base con esa flaky. Diagnóstico:
      - **La flaky era de la prueba, no del panel.** La prueba volvía la red (`setOffline(false)`) y **después** hacía clic en "Reintentar". Pero desde el #19 (`listen.ts`, T096 de la 001) la vista se recupera sola apenas el servidor responde. Un diagnóstico con `MutationObserver` mostró que el error sale del DOM **una sola vez**, unos 20 ms después de reconectar, y no vuelve (3 de 3 corridas): no hay ciclo de redibujado. Si la recuperación le ganaba al clic, el botón ya no existía y el clic esperaba hasta el tope de 30 s. En local falló 3 de 5 sin reintentos. La prueba entró con la 002, que se había rebasado sobre el #19, y daba por hecho un error que se queda hasta el clic. **Corrección**: el clic se hace **sin red**, cuando el error sí se queda; y la recuperación sola pasa a ser una prueba propia ("al volver la red, el árbol se recupera solo, sin reintentar").
      - **Al corregirla apareció un defecto real del panel**, registrado como T057.
      - **En local** aparecieron 2 fallas de otra forma, en la preparación compartida: sin red, la vista se quedó en el esqueleto más de 15 s, sin que disparara el reloj de 10 s. Una de ellas tardó 4 min con un tope de 30 s por prueba, lo que indica que el proceso entero se trabó en la máquina local. Esa preparación pasó en las 6 ejecuciones de CI. Se verifica en la corrida de CI con la corrección.
    - **Línea base, con la corrección**: corrida [38109953463](https://github.com/daniandre18/ecommerce/actions/runs/38109953463) sobre `7999ed9`: los siete trabajos en verde. En e2e, **134 pasadas**, **8 omitidas** (los mismos `skip` por proyecto) y **0 flaky, sin ningún reintento**. Son dos más que antes: la prueba nueva de recuperación sola, en los dos proyectos.
    - **(b)**: paso e2e en **7 min 39 s** (de 03:57:35 a 04:05:14 UTC); Playwright reporta 7,6 min; el trabajo completo, 9 min 21 s. El margen contra `globalTimeout` (10 min) es de unos **2 min 20 s**. La primera corrida, con la flaky, tardó 6 min 59 s: la diferencia es variación del runner, no reintentos. **Para T018**: el proyecto `oscuro` suma `a11y` y `design-system`, y con este margen es probable que haya que subir `globalTimeout` con la medida a la vista, como prevé `research.md` §15.
    - **(c) y (d)**: a cargo del usuario. **Pendientes al 2026-10-11**: según `gh api …/branches/main/protection`, `main` exige `lint`, `typecheck`, `unit`, `rules`, `integration` y `bundle-check`, pero no `e2e`, y no hay PR de prueba. Por decisión explícita del usuario, T002 a T018 arrancaron igual ese día, con T001 abierta. Mientras (c) no se cumpla, `e2e` corre en cada PR pero no bloquea el merge.
  - **Avance (2026-10-14), (c) y (d)**:
    - **Nombre del check**: con la e2e en dos mitades, GitHub registra tres check runs: `e2e (1/2)`, `e2e (2/2)` y `e2e` (consultado con `gh api repos/…/commits/ac97aa4/check-runs`). `e2e` es el trabajo agregador de `ci.yml` (`needs: e2e-shard`, `if: always()`): pasa solo si pasaron las dos mitades. Se verificó que de verdad falla: en la corrida 38588127445, con las dos mitades en rojo, `e2e` quedó en `failure`. Es el único que se marca; las mitades no hace falta.
    - **(c)**: `main` exigía `lint`, `typecheck`, `unit`, `rules`, `integration` y `bundle-check`. Se agregó `e2e` (GitHub Actions, app 15368) con `PATCH …/protection/required_status_checks`. Verificado con `gh api repos/daniandre18/ecommerce/branches/main/protection --jq '.required_status_checks.contexts'`: `["lint","typecheck","unit","rules","integration","bundle-check","e2e"]`.
    - **(d)**: rama `ci-check/e2e-bloquea` con una sola modificación, `expect(true).toBe(false)` en la primera prueba de `shell.spec.ts`, y PR [#23](https://github.com/daniandre18/ecommerce/pull/23) contra `main`. Las dos mitades fallaron exactamente en esa prueba (`shell.spec.ts:5`, en `movil-360` y en `escritorio`), `e2e` quedó en `FAILURE` con `isRequired: true`, y `mergeStateStatus` en `BLOCKED`. El PR se cerró sin mezclar (`mergedAt: null`) y la rama se borró (remota y local).
    - **`enforce_admins`**: la protección lo tenía en `false`, y la única cuenta con acceso (`daniandre18`) es administradora: GitHub le ofrecía mezclar saltándose los requisitos, así que para la única persona que puede mezclar el check no bloqueaba. Por decisión del usuario se activó (`POST …/protection/enforce_admins`). Verificado: `{"contexts":["lint","typecheck","unit","rules","integration","bundle-check","e2e"],"enforce_admins":true}`. No se intentó una mezcla real de un PR en rojo para comprobarlo: si fallara, una prueba rota entraría a `main`.
    - **Cerrada** el 2026-10-14 con los cuatro criterios: (a) línea base en verde (corrida 38109953463), (b) duración medida (research §15), (c) `e2e` obligatorio en `main`, (d) PR #23 bloqueado y cerrado sin mezclar, con `enforce_admins` activo.
  - **Prohibido** para llegar al verde: omitir, borrar, marcar `skip` o `fixme`, o cambiar el umbral de una prueba (FR-033). Un fallo que solo aparece en CI se corrige en el entorno del trabajo. Si es un defecto real del panel, se registra y se resuelve antes de cerrar T001, porque una línea base con fallos conocidos no es línea base.
- [X] T002 [P] Dependencias de desarrollo en `package.json` y `package-lock.json`: agregar `postcss-scss` con versión exacta, y declarar `sass` `1.104.1` y `postcss` `8.5.28` como directas, con la misma versión que ya instala `@angular/build` (`research.md` §0). `npm ls sass postcss` no debe mostrar dos versiones Hecho: `postcss-scss` 4.0.9 (de 2023); una sola versión de `sass` y otra de `postcss` en todo el árbol
- [X] T003 [P] Base de `design-check`: `apps/admin/design-system/vite.config.mts` y `apps/admin/design-system/tsconfig.json`, como en `apps/admin/bundle-check/`. En `apps/admin/project.json`: objetivo `design-check` (`vitest run --config apps/admin/design-system/vite.config.mts`); `test` con `"dependsOn": ["design-check"]`, para que `npx nx run-many -t test` del trabajo `unit` lo corra (`contracts/gates.md`); y `typecheck` que también compile `apps/admin/design-system/tsconfig.json`. Se verifica con `npx nx run admin:test --skip-nx-cache`, que debe ejecutar `design-check` Hecho: con `passWithNoTests` mientras no hay pruebas (U3 del análisis); `admin:test` corre `design-check` antes que las 391 del panel

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

- [X] T004 [P] Pruebas del lector de tokens compilados en `apps/admin/design-system/compiled-tokens.spec.ts`, con un SCSS de prueba en `apps/admin/design-system/fixtures/tokens/`:
  - `light-dark(a, b)` se separa en `light: a` y `dark: b`, y un valor sin `light-dark` vale igual en los dos.
  - Las cadenas `var(--ds-x)` → `var(--ds-y)` → valor se resuelven.
  - Un color con alfa se compone sobre un fondo dado.
  - Una referencia a un token inexistente lanza un error que lo nombra.
  - **Hecho**: más `color.spec.ts` (la fórmula de WCAG contra las razones de la referencia que cita research §2). Mutaciones: invertir el esquema tumba 4 casos; quitar la detección de ciclos, 1
- [X] T005 [P] Pruebas de contraste en `apps/admin/design-system/contrast.spec.ts`, con las reglas de `data-model.md` ("Par de contraste") al pie de la letra:
  - Umbral por `kind`: `text` 4,5; `large-text` 3; `ui` 3.
  - `declared` coincide con la razón calculada, redondeada a 2 decimales, en **los dos** esquemas.
  - "Todo token `--ds-text-*`, `--ds-on-*`, `--ds-icon-*` y `--ds-focus-ring` aparece en al menos un par".
  - "Todo `--ds-text-*` se declara contra los **tres** planos".
  - `--ds-focus-ring` se declara contra los tres planos, el superpuesto y el fondo del acento. (Revisado el 2026-10-12: el anillo es de dos tonos, `--ds-focus-ring-inner` y `--ds-focus-ring-outer`; ver la nota de T011.)
  - Un par que nombra un token inexistente falla.
  - Un par en `state: 'disabled'` se declara con `kind: 'ui'` y no se exige.
  - Los mensajes son los de `contracts/gates.md`.
  - **Hecho**: el verificador es `contrast.ts` (`checkPairs`, `checkCoverage`), probado contra `fixtures/contrast/` con pares que tienen que fallar (bajo el umbral, mal declarado, token inexistente, cobertura incompleta). Mutaciones: sin comparar con lo declarado, sin eximir el deshabilitado y sin exigir el foco contra lo superpuesto y el acento: cada una tumba su caso
- [X] T006 [P] Pruebas de jerarquía tipográfica (FR-015) en `apps/admin/design-system/typography.spec.ts`: recorre los niveles de `typography-levels.ts` en orden y exige que dos niveles contiguos difieran en al menos **dos** de: tamaño, peso, color y espaciado. El espaciado entre letras y el interlineado cuentan como **un** solo atributo (`contracts/tokens.md`). Con un caso que falla sobre `fixtures/typography/`: dos niveles que solo cambian de peso Hecho: `typography.ts`. Mutación: con un solo atributo de diferencia, cae el caso de "solo cambia de peso"
- [X] T007 [P] Pruebas de planos en el catálogo (la mitad de SC-005 que no necesita navegador) en `apps/admin/design-system/planes.spec.ts`: `--ds-surface-page`, `--ds-surface-card` y `--ds-surface-bar` son distintos entre sí en **cada** esquema; `--ds-border-width` es mayor que 0; `--ds-border-subtle` existe. El mensaje es el de `contracts/gates.md` Hecho: `planes.ts`. Mutación: mirando solo el esquema claro, cae el caso de la tarjeta y la barra iguales en oscuro
- [X] T008 [P] Pruebas del verificador de literales en `apps/admin/design-system/literals.spec.ts`, con `apps/admin/design-system/fixtures/literals/` (`research.md` §5):
  - Un `.scss` con `color: #ff0000; font-size: 13px; padding: 10px; border-radius: 3px` produce **exactamente 4** hallazgos, cada uno con `archivo:línea:columna`, propiedad, valor y token sugerido.
  - Un `.ts` con `styles:` en línea reporta la línea **del `.ts`**.
  - `0`, `100%`, `auto` y `currentColor` no producen hallazgos.
  - `width: 560px` y `max-width: 1200px` no se revisan.
  - `var(--mat-sys-primary)` en una vista es un hallazgo.
  - `calc(-1 * var(--ds-space-3))` se admite, y `calc(100% - 16px)` es un hallazgo.
  - Una excepción sin `reason` hace fallar, y una excepción cuyo `scope` no coincide con ningún archivo también.
  - **Trinquete**: un hallazgo en un archivo de `migrated-files.ts` hace fallar, y uno fuera de la lista solo se informa (código de salida 0).
  - **`_theme.scss`**: una variable de la paleta (`$blue-600`) se admite; `#3c5afe` o una variable que no viene de la paleta, no (`data-model.md`).
  - **Hecho**: 8 casos sobre `fixtures/literals/`, más el del panel (ninguna excepción mal declarada ni muerta). Validado por mutación: sin vigilar `--mat-sys-*`, con todo bloqueando, aceptando una excepción sin razón, admitiendo cualquier variable en `_theme.scss` o sin detectar longitudes, cae cada vez su caso. La mutación de la columna en los `.ts` **sobrevivió** la primera vez: ningún fixture tenía estilos en la misma línea que la cadena. Se agregó uno, y ahora cae.
- [X] T009 [P] Pruebas de la medida de la carga inicial en `apps/admin/bundle-check/initial-load.spec.ts`, con un `index.html` de prueba en `apps/admin/bundle-check/fixtures/`:
  - Lo inicial es el `<script src>` de `main`, cada `<link rel="modulepreload">`, cada `<link rel="stylesheet">` y cada `<style>` en línea (`research.md` §8), incluido el `<link media="print" data-beasties-media>`.
  - Gzip nivel 9 con `node:zlib`.
  - La comparación falla con JS Δ > 0 o con CSS Δ > 10.240 B.
  - La salida lista los archivos de cada lado.
  - **Hecho**: 8 casos. Mutaciones: sin la hoja de `media="print"`, tolerando 1 B de JS, con gzip al nivel por omisión y sin deduplicar, cae cada vez su caso. La del nivel de gzip **sobrevivió** la primera vez: con archivos chicos, los niveles 6 y 9 comprimen igual. Se agregó un caso que genera un archivo grande y verifica que los dos niveles dan tamaños distintos. Una línea que quitaba el `<noscript>` resultó redundante con la deduplicación (su mutación no cambiaba nada) y se sacó.

### Implementación de la base

- [X] T010 [P] `apps/admin/design-system/compiled-tokens.ts`: compila `apps/admin/src/styles.scss` con `sass` (con los `loadPaths` de `node_modules`), lee las `--ds-*` de `:root` y expone `light`/`dark` resueltos, hasta que T004 pase Hecho: más `color.ts` (luminancia, composición con alfa y razón de WCAG 2.2)
- [X] T011 [P] `apps/admin/src/styles/_palette.scss`: los valores de partida de `research.md` §2, para el esquema claro y el oscuro, solo como variables Sass. Encabezado con la decisión de la referencia que origina cada grupo, citando el archivo de `~/Documents/github/angular-admin/src/app/styles/`. Sin una línea copiada (FR-006) Hecho: dos ajustes sobre research §2 al calcular los 43 pares. `border-control` claro pasa a `#80809a` (2,98 → 3,39 sobre la barra). En oscuro, el anillo de foco (`#415efe`) tiene que dar 3:1 contra planos casi negros y contra el acento amarillo: solo cabe si lo superpuesto oscuro baja de `#2a2a35` a `#262631`, y aun así queda con margen mínimo (3,03 y 3,09). **Revisado el 2026-10-12**: un margen de 0,03 no es cumplir. El anillo pasó a ser de dos tonos (técnica C40): blanco por dentro, `#10173f` por fuera, a 17,26:1 entre sí. El peor fondo del sistema queda en 5,14 (el botón primario claro); lo superpuesto oscuro volvió a `#2a2a35` y salió `$blue-520`. Ver research §6
- [X] T012 `apps/admin/src/styles/_tokens.scss`:
  - **Todos** los tokens de `contracts/tokens.md`, con los nombres textuales: planos, texto, marca y acción (incluido `--ds-action-destructive` como papel propio, distinto de `--ds-status-error`, FR-009a), estados con significado, bordes y foco, tipografía (`-size`, `-weight`, `-line-height`, `-tracking` y el atajo `--ds-type-{nivel}`), espaciado, radio, borde, elevación, densidad y movimiento.
  - Color y elevación con `light-dark()`. Todo definido **solo** desde `_palette.scss`, las escalas u otro token, con un comentario de origen por token (`data-model.md`).
  - `styles.scss` lo incluye. Ninguna vista lo usa todavía.
  - Depende de T011.
  - **Hecho**: tipografía en `rem`, para que siga al tamaño de letra del sistema (edge case de texto ampliado)
- [X] T013 `apps/admin/design-system/contrast-pairs.ts`: el catálogo de pares de `data-model.md` con las razones declaradas por esquema, hasta que T005 pase. Si un par no cumple, se ajusta el valor en `_palette.scss` **en luminosidad, conservando tono y saturación** (`research.md` §2), y se anota el valor final. Depende de T010 y T012 Hecho: 43 pares, todos AA en los dos esquemas; las razones se calcularon con el mismo `color.ts` que las verifica. Mutación sobre la paleta real: con el texto secundario en `#8a8a8a`, el catálogo falla (el paso 3 de "de verdad fallan" del quickstart)
- [X] T014 [P] (después de T010 y T012) `apps/admin/design-system/typography-levels.ts`, con el orden `page-title`, `section-title`, `subtitle`, `body`, `label`, `help` y su color (`contracts/tokens.md`), hasta que T006 pase. Con los tokens de T012, T007 también pasa
- [X] T015 [P] Verificador de literales (después de T010 y T012, porque sugiere tokens a partir del catálogo compilado):
  - **Archivos**: `apps/admin/design-system/literals.ts` (CLI y función), `apps/admin/design-system/literal-exceptions.ts` y `apps/admin/design-system/migrated-files.ts`, esta última vacía.
  - **Funcionamiento**: lee con `postcss-scss` y extrae los `styles:` de los `.ts` con la API de TypeScript. Las propiedades por categoría son las de `research.md` §5, y el token sugerido sale de invertir los tokens compilados (T010).
  - **Excepciones iniciales**, textuales de `data-model.md`: `0`, `auto`, `inherit`, `none`, `transparent`, `currentColor` y porcentajes con `scope: 'everywhere'`, más `index-boot` con `scope: { files: ['apps/admin/src/index.html'] }`. `_palette.scss` y `_tokens.scss` no se revisan.
  - **`_theme.scss`** se revisa con una sola concesión: puede usar variables Sass de `_palette.scss` (`$…`), porque `mat.theme` las necesita para generar sus paletas. Cualquier otro valor literal, o una variable que no venga de la paleta, es un hallazgo. Con su caso en `literals.spec.ts` (T008).
  - **Lint**: el objetivo `lint` de `apps/admin/project.json` pasa a `eslint apps/admin … && tsx apps/admin/design-system/literals.ts`.
  - **Cierre**: hasta que T008 pase. `npx nx run admin:lint` sale con 0 e informa el total actual de hallazgos, del orden de 258 (`research.md` §0).
  - **Hecho**: informa **381** hallazgos y sale con 0, sin archivos migrados todavía. Son más que los 258 del relevamiento, porque ahora también cuentan los 184 usos de `--mat-sys-*` en las vistas, que esa cifra no incluía. `index.html` no da hallazgos: lo cubre su excepción declarada. Los 2 avisos de ESLint que aparecen (`childrenOf` sin uso en categorías) ya existían.
- [X] T016 Compuerta de tamaño:
  - `apps/admin/bundle-check/initial-load.ts`, hasta que T009 pase, y `apps/admin/bundle-check/size.spec.ts`, que compara `dist/apps/admin/browser/index.html` con `dist/base-initial.json`.
  - En `apps/admin/project.json`, `bundle-check` acepta `--base=<ref>`, por omisión `origin/main`. Construye la base en un `git worktree` en `.bundle-base/` (agregado a `.gitignore`), con **su propio `npm ci`** dentro del worktree antes del build: la base tiene otro `package.json`, porque T002 agrega dependencias, y no puede usar los `node_modules` de la rama. Escribe `dist/base-initial.json`. Se anota el tiempo total del trabajo `bundle-check` en CI.
  - En `.github/workflows/ci.yml`, el trabajo `bundle-check` hace checkout con `fetch-depth: 0` y pasa `--base=${{ github.event.pull_request.base.sha || github.event.before }}`.
  - `layers.spec.ts` no cambia.
  - Comparte `project.json` con T015: no va en paralelo con ella.
  - Se verifica en esta rama: el JS crece 0 B, y el CSS crece lo que agregan `_tokens.scss` y `_shell.scss`, impreso.
  - **Hecho**: `bundle-check` es un solo script, `apps/admin/bundle-check/run.ts`, y no una cadena de comandos, porque Nx agrega los argumentos (`--base=…`) al final del comando. `.bundle-base/` va también en `.nxignore`: si el worktree quedara colgado tras un corte, Nx vería dos proyectos `admin`. Primera medida, contra `origin/main` (`cf590a3`), antes de T017: JS 235.334 → 235.332 B (−2 B) y CSS 3.938 → 5.925 B (+1.987 B). Beasties copia los tokens de `:root` en el CSS crítico de `index.html`, así que cuentan dos veces; aun así quedan lejos del tope.
- [X] T017 Estilos del componente raíz fuera del JS inicial (`research.md` §3): el bloque `styles:` de `apps/admin/src/app/app.ts` pasa **sin cambios de valor** a `apps/admin/src/styles/_shell.scss`, incluido desde `apps/admin/src/styles.scss`, y `app.ts` queda sin `styles:`. Las clases (`.boot`, `.skip-link`, `.navigation-failure`) y el selector `:host` pasan a `app-root`. Se verifica con `npx nx run admin:bundle-check` (JS inicial con Δ < 0) y con `shell.spec.ts` en verde Hecho: JS inicial **antes 235.332 B, después 234.941 B: −391 B** (gzip -9); el CSS sube 343 B. Contra la base: JS −393 B, CSS +2.330 B (tope +10.240 B). Anidados bajo `app-root`, los selectores conservan una especificidad que gana a las reglas globales, como hacía el encapsulamiento: `main:focus` sigue ganándole al `:focus-visible` global. `shell.spec.ts` y `offline.spec.ts` (falla de navegación), 10 de 10 en los dos proyectos
- [X] T018 [P] Proyecto `oscuro` en `apps/admin-e2e/playwright.config.ts`: `Desktop Chrome` con `colorScheme: 'dark'` y `testMatch: ['a11y.spec.ts', 'design-system.spec.ts']`. Se corre **antes de tocar ninguna vista** para fijar la línea base oscura. Si el panel actual (tema azure) ya falla axe en oscuro, esos fallos se anotan aquí y se corrigen **en esta tarea**: son previos al rediseño, y corregirlos ahora mantiene atribuible cualquier fallo posterior. Ninguna prueba se omite. Se mide la duración nueva en el trabajo `e2e`. Si el margen de `globalTimeout` no alcanza, se sube con esa medida anotada (`research.md` §15: es una protección contra cuelgues, no un umbral) Hecho: en local, 9 de 9 en `oscuro` (24 s). El panel actual **no tenía ningún incumplimiento de axe en oscuro**. La única falla era de la prueba: `a11y.spec.ts:193` esperaba el rojo de error del tema claro con un valor fijo (`rgb(186, 26, 26)`). Ahora espera el color de una sonda con el mismo token que usa `mat-error` (`--mat-sys-error`): en claro resuelve exactamente a `rgb(186, 26, 26)`, así que no se afloja, y vale en los dos esquemas y después de T021. Mutación: con la sonda en `--mat-sys-primary`, falla en `escritorio` y en `oscuro`. En CI (corrida [38152439034](https://github.com/daniandre18/ecommerce/actions/runs/38152439034)): **143 pasadas** (las 134 de antes más 9 de `oscuro`), 8 omitidas, 0 flaky; el paso e2e tardó **6 min 19 s**, menos que los 7:39 de la línea base (la variación del runner pesa más que las 9 pruebas nuevas). Margen de unos 3 min 40 s: **`globalTimeout` no se tocó**. En esa misma corrida, `bundle-check` midió la base del PR (`cf590a3`) en su worktree y dio JS −393 B y CSS +2.330 B, idénticos a la medida local

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

- [X] T019 [P] [US1] `apps/admin/design-system/primary-actions.ts`, que transcribe `contracts/primary-actions.md` fila por fila (`screen`, `kind`, `action`, `why`, con `action: null` donde dice "—"), y `apps/admin/design-system/screens.spec.ts`, que falla si alguna ruta con `loadComponent` de `apps/admin/src/app/app.routes.ts` o algún componente pasado a `MatDialog.open(...)` no figura en la lista. Incluye el `open` dinámico de `shared/pending-changes/pending-changes.ts`. Inventario esperado: 10 vistas y 5 diálogos. Cada entrada transcribe `planes` (`'page-card'` en inicio de sesión, alta de cuenta, comercios e invitación; `'page-card-bar'` en las vistas del marco del comercio; un diálogo hereda los de la vista que lo abre) y `destructive`: los nombres de los botones destructivos visibles en esa pantalla, que el contrato nombra en "Por qué" (`data-model.md`) Hecho: más `component` (la clase), para cruzar la lista con el código. `TenantShell` tiene `loadComponent` pero es el marco del comercio, no una pantalla: queda declarado en `FRAMES` (`screens.ts`), así un marco nuevo también tiene que declararse a propósito. Mutación: sin declarar la bitácora, el inventario falla
- [X] T020 [P] [US1] Ayudas de e2e en `apps/admin-e2e/src/design-system-support.ts`:
  - `accentElements(page)`: los elementos visibles cuyo `background-color` computado es igual al de una sonda con `background: var(--ds-action-accent)`. Se compara el color computado, no la clase (`research.md` §9).
  - `expectPlanes(page, planes)`: con `'page-card-bar'`, `body`, `.ds-card` y `.ds-bar` con fondos distintos; con `'page-card'`, `body` y `.ds-card` distintos, y **ningún** `.ds-bar` en la vista (SC-005 y FR-010, corregidos). En los dos casos, `.ds-card` con borde visible o `box-shadow` distinto de `none`.
  - `expectTypeHierarchy(page)`: `h1` > `h2` > `h3` > texto, con dos atributos de diferencia.
  - `expectDestructive(page, names)`: el conjunto de elementos visibles cuyo `background-color` computado es igual al de una sonda con `var(--ds-action-destructive)` es **exactamente** el de los nombres declarados. Si hay uno de más, se rompió "no se usa para nada más" de FR-009a; si falta uno, se rompió el tratamiento.
  - `readOnlyCollaborator(run)`, que **se mueve** desde `apps/admin-e2e/src/categories.spec.ts` sin cambiar su comportamiento, y `categories.spec.ts` pasa a importarlo.
  - **Hecho**: más `expectDestructive` (G2) y la cuenta de un único `<h1>` en `expectTypeHierarchy` (G3). La prueba de categorías que usa `readOnlyCollaborator` pasa en los dos proyectos. Las ayudas se validan por mutación con los primeros casos que las usan (T024 a T026).

### Tratamiento global de Material (tareas globales: ver la regla 2)

- [X] T021 [US1] `apps/admin/src/styles/_theme.scss`: `mat.theme` con la paleta propia en lugar de `mat.$azure-palette`, la tipografía del sistema y `density: 0`. `mat.theme-overrides` hace que los `--mat-sys-*` que usa Material apunten a los `--ds-*` (primario, superficies, texto, error, contorno). `apps/admin/src/styles.scss` lo usa en lugar del `mat.theme` actual. Antes de escribir cada override, verificar el nombre del token en `node_modules/@angular/material/core/tokens/` y en el `_m3-*.scss` del componente: un nombre mal escrito no da error, simplemente no aplica. **Verificación**: la suite e2e completa en los tres proyectos y `design-check` en verde. Es global porque Material tiene un solo tema por aplicación Hecho, con dos decisiones. (1) Azure queda solo como base estructural de `mat.theme`, porque necesita una paleta tonal de trece tonos por grupo, y **todos** sus roles de color se redirigen a `--ds-*` con `mat.theme-overrides`: la fuente sigue siendo una, sin valores fuera de `_palette.scss`. Un nombre de token inválido no se ignora en silencio: en Material 22 corta la compilación con `@error`. El `body` pasa a `--ds-surface-page`, `--ds-text-primary` y `--ds-type-body`. `_theme.scss` entra al trinquete, con 0 hallazgos. (2) La primera corrida falló axe en los tres proyectos: la barra de acciones masivas usa `secondary-container` con botones de texto en primario y el mensaje de error encima, **pares que no estaban declarados**. `--ds-surface-selected` pasó a ser un papel propio (`#e8ebff` / `#272e63`), con sus 4 pares. Con eso salió a la luz que varios colores pasaban la barra clara por 0,04: se adoptó la política de margen (0,2 sobre WCAG, aplicada por la compuerta y validada por mutación) y se oscurecieron un poco el primario, el error, el éxito y el aviso (research §2). La suite completa en los tres proyectos: 143 pasadas, 8 omitidas, 0 fallas
- [X] T022 [US1] Tratamiento de los componentes de Material en `apps/admin/src/styles/_components.scss`, fila por fila de la tabla "Componentes de Material" de `contracts/component-treatments.md`:
  - **Botones**: sin sombra en reposo y sin mayúsculas. `.ds-primary-action` → `button-overrides` con `--ds-action-accent` y `--ds-on-action-accent`. `.ds-destructive` → `--ds-action-destructive` y `--ds-on-action-destructive`.
  - **Resto de componentes**: campo de formulario, checkbox, radio, chip (conservando `.chip-touch-target`), diálogo (elevación `overlay`, `--ds-radius-lg`, título en `section-title`), menú, snack-bar y barra de progreso.
  - **Mixins sin incluir** (FR-021a): `ds-paginator`, `ds-tabs`, `ds-mat-table`, `ds-mat-card` y `ds-mat-toolbar`, **definidos y sin `@include`**.
  - **Verificación**: la suite e2e completa en los tres proyectos.
  - **Hecho**: botones (píldora, sin mayúsculas, contorno en `--ds-border-control`), campo `fill` (la línea activa en el contorno de control y el foco en primario), chips, diálogo, menú y barra de progreso con sus `*-overrides`. Checkbox, radio, snack-bar y el error de validación ya los resuelve el tema (T021). `.ds-primary-action` y `.ds-destructive` sobre `button-overrides`. Los cinco mixins sin emitir se compilan aparte en la verificación, para que no envejezcan rotos, y ninguno aparece en la hoja compilada. `_components.scss` entra al trinquete con 0 hallazgos. Suite completa: 143 pasadas, 8 omitidas, 0 fallas. CSS inicial: **+3.402 B** contra la base (T021 a T023 sumaron 1.072 B), con cero vistas migradas; JS −393 B
- [X] T023 [US1] Clases de patrón en `apps/admin/src/styles/_components.scss`, con los valores de la tabla "Marcado propio del panel" de `contracts/component-treatments.md`:
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

- [X] T024 [US1] **Estados compartidos**: `libs/ui/src/lib/states/skeleton.ts`, `empty-state.ts` y `error-state.ts`. El esqueleto toma `--ds-row-height` y `--ds-radius-md`, y el error, `.ds-notice--error`. Van primero porque todas las vistas los usan. e2e: `loading-states.spec.ts` y `offline.spec.ts`. Crea `design-system.spec.ts` con su primer caso: el estado de error del catálogo sin red, sin acento Hecho:
  - **Estilos**: esqueleto, vacío y error sin literales ni `--mat-sys-*`. El esqueleto es la capa `--ds-surface-hover` sobre el plano, con una banda de la misma capa que lo recorre, radio `--ds-radius-md`, y `rowHeight` por omisión en `var(--ds-row-height)` (antes `48px`). El error lleva `ds-notice ds-notice--error` en el anfitrión, y su `:host` solo conserva la disposición. Títulos de vacío y error en `subtitle`, detalle en `body`. Los tres archivos entran al trinquete.
  - **Contraste**: "Reintentar" (`outlined`, texto `primary` y contorno `border-control`) sobre el aviso de error daba en claro 4,62 y 3,19: pasaba WCAG pero no el margen de 0,2. `$pink-100` pasó de `#ffe3ec` a `#ffe8ef` (mismo tono), y quedan declarados `primary/status-error-container` (4,78 / 6,33) y `border-control/status-error-container` (3,30 / 3,74). `on-status-error-container/status-error-container` pasa de 8,22 a 8,50 en claro.
  - **Pruebas**: dos unitarias nuevas (la clase del aviso; el alto por omisión). `design-system.spec.ts` nace con su primer caso: el error del catálogo sin red tiene el fondo de `--ds-status-error-container`, 0 acentos y 0 destructivos **dentro del aviso**. No se mide la vista entera porque "Nuevo producto" sigue en la cabecera y desde T029 lleva el acento: ese "1 acento" es el caso `pantalla: catálogo`. Para eso, `Scope` de las ayudas admite `{ selector }`, y se suma `expectBackground`. Mutaciones: con "Reintentar" en `ds-primary-action`, `expectAccent` recibe `["Reintentar"]`; sin `ds-notice--error`, falla `expectBackground`.
  - **Cierre**: `design-system.spec.ts`, `loading-states.spec.ts` y `offline.spec.ts`, 29 de 29 en los tres proyectos. `lint` y `typecheck` en verde, `design-check` 45 de 45, 0 hallazgos que bloquean. Carga inicial contra la base: JS −395 B, CSS +3.401 B (antes de T024, +3.402 B).
- [X] T025 [US1] **Diálogos compartidos**: `apps/admin/src/app/shared/confirm-dialog.ts` (el botón de confirmar lleva `ds-destructive`: sus cinco usos son destructivos según `contracts/primary-actions.md`) y `apps/admin/src/app/shared/pending-changes/pending-changes.ts`. Casos: el diálogo de "Salir sin guardar" tiene 0 acentos, y su botón tiene el fondo de `--ds-action-destructive`. e2e: `pending-changes.spec.ts` Hecho: los cinco usos confirman "Archivar producto", "Guardar y archivar", "Eliminar rol", "Dar de baja" y "Salir sin guardar": todos destructivos, y así queda dicho en el comentario de `ConfirmDialog`, con lo que hace falta si algún día confirma algo que no destruye. Ninguno de los dos archivos tenía literales; entran al trinquete igual. Caso `pantalla: diálogo: confirmación`: 0 acentos y el color destructivo exactamente en "Salir sin guardar". Mutación: sin `ds-destructive`, `expectDestructive` recibe `[]`. `design-system.spec.ts` y `pending-changes.spec.ts`, 18 de 18 en los tres proyectos; `a11y.spec.ts`, 27 de 27
- [X] T026 [US1] **Marco**:
  - `apps/admin/src/styles/_shell.scss`: el enlace para saltar al contenido con `--ds-radius-sm`; la falla de navegación con `.ds-notice--error`.
  - `apps/admin/src/app/tenant/tenant-shell/tenant-shell.ts`: el `header` lleva `.ds-bar`, el nombre del comercio va en `section-title` y el enlace activo en `--ds-text-link`.
  - `apps/admin/src/index.html`: sus literales pasan a ser **iguales** a los valores compilados de los tokens que representan, en cada esquema, y `apps/admin/design-system/boot.spec.ts` lo verifica (`research.md` §4).
  - e2e: `shell.spec.ts` y `tenant-switcher.spec.ts`.
  - `npx nx run admin-e2e:perf` en local: estructura visible por debajo de 1 s, sin cambio de umbral.
  - **Neto de CSS después de las tres primeras vistas** (T024 a T026), pedido el 2026-10-12: anotar aquí el Δ CSS contra la base. Antes de migrar ninguna vista era +3.402 B de 10.240. Si sigue subiendo con cada vista migrada (y no baja, al cambiar literales por tokens que ya están en la hoja), avisar antes de seguir con T027.
  - **Hecho**:
    - **Barra**: `header` con `ds-bar`, extendida sobre el relleno de `main` (`margin-inline` negativo y el mismo `padding-inline`), así la navegación conserva a 360 px el ancho que ya tenía. Nombre del comercio en `section-title`, enlace activo en `--ds-text-link` y subrayado.
    - **`_shell.scss`**: sin literales. La falla de navegación toma `.ds-notice` y `.ds-notice--error` con `@extend` desde la hoja, y no con una clase en la plantilla de `App`, que es JS inicial. El enlace para saltar al contenido va en colores invertidos (`--ds-text-primary` de fondo y `--ds-surface-card` de texto, el mismo par que texto sobre tarjeta) con `--ds-radius-sm`. El botón de la falla, con `--ds-radius-pill` y `--ds-touch-target`. Un falso positivo menor de la compuerta: en el atajo `border`, la excepción `currentColor` (categoría color) no aplica; como el color de borde por omisión ya es el del texto, se quitó del valor en vez de tocar la compuerta.
    - **`index.html`**: cada literal es una copia de su token, en cada esquema. `body` toma el fondo de página, `.boot` el texto secundario y la fuente del sistema, y los renglones son los del esqueleto (`--ds-row-height`, `--ds-radius-md`, `--ds-surface-hover`). La lista vive en `apps/admin/design-system/boot.ts` (`BOOT_TOKENS`), y `boot.spec.ts` verifica la igualdad, que el oscuro redefina lo que cambia y que ningún valor de las categorías de FR-004 quede sin token: 4 casos, tres de ellos de "de verdad falla".
    - **e2e**: caso nuevo del marco en `design-system.spec.ts` (barra con `--ds-surface-bar`, nombre en `section-title`, enlace activo en `--ds-text-link` y subrayado). Mutación: sin `ds-bar`, falla. Como el marco está en todas las vistas, se corrió la suite completa: **152 pasadas, 8 omitidas, 0 fallas** en los tres proyectos. `admin-e2e:perf` en local, 6 de 6: estructura en 196 ms la primera visita y 216 ms las siguientes (tope de 1 s), contenido en 2.693 ms y 827 ms.
    - **Neto de CSS después de T024 a T026: +3.481 B** contra la base (antes de migrar vistas, +3.402 B; tope de 10.240). JS −388 B. **Subió 79 B**, y no viene de las vistas: de T025 a T026 la hoja global bajó 9 B y el CSS crítico que copia Beasties, 3 B. Los +92 B son del `<style>` de arranque de `index.html` (de 360 a 452 B), por la regla de `body` con su oscuro y por la pila de fuentes completa de `--ds-font-family`, que antes era `system-ui, sans-serif`. Avisado al usuario antes de seguir con T027.
- [X] T027 [US1] **Autenticación**: `apps/admin/src/app/auth/login/login.ts` y `apps/admin/src/app/auth/sign-up/sign-up.ts`. "Entrar" y "Crear cuenta" llevan `ds-primary-action`. El `<form>` que ya existe en cada una lleva `.ds-card`: dos planos, página y tarjeta, sin barra (SC-005). Casos de `/login` y `/signup`. e2e: los casos de autenticación de `a11y.spec.ts` y `keyboard.spec.ts` Hecho: además, `<h1>` en `page-title` (con su `letter-spacing`, que el atajo `font` no incluye), el aviso de falla en `--ds-status-error` y los textos en `body`. Casos `pantalla: iniciar sesión` y `pantalla: crear cuenta` (acento, destructivas, planos y tipografía): primero fallaron sin acento, y pasan en los tres proyectos. `expectPlanes` y `expectTypeHierarchy` se usaron aquí por primera vez y no llegaron a fallar, así que se validaron por mutación: sin `ds-card`, "la vista no tiene ninguna .ds-card"; con el `<h1>` en `body`, "h1 → body difieren en 0 atributos". `a11y.spec.ts` y `keyboard.spec.ts`: 29 pasadas y 2 omitidas (las de siempre). Ningún par de contraste nuevo ni movido
- [X] T028 [US1] **Comercios e invitación**: dos planos, página y tarjeta, sin barra (SC-005). En `apps/admin/src/app/tenant/tenant-switcher/tenant-picker.ts`, la `<ul>` que ya existe lleva `.ds-card` (el estado vacío ya es tarjeta por T024). En `accept-invitation.ts`, el propio componente lleva `.ds-card` con `host: { class: 'ds-card' }`, sin agregar elementos. Comercios: 0 acentos y `apps/admin/src/app/team/accept-invitation/accept-invitation.ts` ("Aceptar invitación" o "Entrar al comercio", según el estado, con `ds-primary-action`; "Cerrar sesión" pasa de `filled` a texto, que es un cambio de aspecto y no de estructura). e2e: `tenant-switcher.spec.ts` y `team-and-permissions.spec.ts` (invitación) Hecho:
  - **Corrección al texto**: "el estado vacío ya es tarjeta por T024" no era cierto. T024 no hizo tarjeta a `ui-empty-state` (el contrato lo pone *dentro* de una tarjeta). Aquí el elemento `<ui-empty-state>` que ya existía lleva `class="ds-card"`, sin envolverlo. Lo mismo el esqueleto, para que conserve relleno, borde y radio de la lista que reemplaza (FR-027).
  - **Comercios**: `<h1>` en `page-title`, nombre en `subtitle`, rol en `body` con `--ds-text-secondary`, separador `--ds-border-subtle` y sin separador en la última fila.
  - **Invitación**: `host: { class: 'ds-card' }`. "Aceptar invitación" y "Entrar al comercio" con `ds-primary-action`, y "Cerrar sesión" de `filled` a texto.
  - **Casos**: `pantalla: tus comercios` y `pantalla: invitación` en sus tres estados: pendiente ("Aceptar invitación"), ya miembro ("Entrar al comercio") y de otra cuenta (sin acento). Tres fallaron antes del cambio. "De otra cuenta" pasó al primer intento (tampoco había acento antes); mutación: con "Cerrar sesión" en `ds-primary-action`, recibe `["Cerrar sesión"]`. 12 de 12 en los tres proyectos.
  - **e2e**: `tenant-switcher`, `team-and-permissions` y `a11y`, 39 de 39. Ningún par de contraste nuevo ni movido.
- [X] T029 [US1] **Catálogo**: `apps/admin/src/app/catalog/product-list/product-list.ts`, `apps/admin/src/app/catalog/product-list/bulk-actions.ts` y `apps/admin/src/app/catalog/create-product/create-product-dialog.ts`.
  - **Acento**: "Nuevo producto" lleva `ds-primary-action`. "Crear producto" del estado vacío sigue `filled` en primario. "Crear" del diálogo lleva `ds-primary-action`.
  - **Filas**: llevan `.ds-table-row`, con `--ds-row-height`.
  - **Casos**: catálogo con productos (1 acento, "Nuevo producto"); catálogo vacío de `t2` (1 acento, "Nuevo producto", no "Crear producto"); y el diálogo (1 acento, "Crear").
  - e2e: `catalog.spec.ts`, `loading-states.spec.ts` y `mobile.spec.ts`.
  - **Hecho**:
    - **Planos**: el listado (`<ul>`) es la tarjeta, y cada `<li>` una `.ds-table-row`. El esqueleto y los dos estados vacíos llevan `ds-card` en su propio elemento, como en T028. La barra de selección pasa a `--ds-surface-selected` con `--ds-text-primary`. Título en `page-title`, nombre en `subtitle`, datos en `body` y marcas en `help`.
    - **Casos**: `pantalla: catálogo`, con productos (y con la barra de selección abierta) y vacío en `t2`, y `pantalla: diálogo: nuevo producto`. Los tres fallaron sin acento antes del cambio; 12 de 12 después, en los tres proyectos. Dos aserciones no habían fallado solas, y se validaron por mutación: "Asignar" con acento y "Crear producto" con acento hacen fallar su caso.
    - **e2e**: `catalog`, `loading-states`, `mobile` y `a11y`, 65 pasadas y 6 omitidas (las de siempre). Unitarias, `lint` y `typecheck` en verde. **Ningún par de contraste falló ni se movió**: los 52 pares siguen como estaban.
    - **Neto de CSS al cerrar T029: +3.481 B, igual que en T026** (la hoja global es la misma byte a byte). No baja ni sube porque los estilos de una vista son estilos de componente: viajan en su chunk diferido, no en el CSS inicial que mide `bundle-check`. Así que el presupuesto inicial no depende de las ocho vistas restantes, salvo que alguna toque la hoja global. Lo que sí crece es el chunk diferido del catálogo: de 26.398 a 26.994 B en crudo y **de 8.266 a 8.325 B en gzip (+59 B)**, porque `var(--ds-space-2)` ocupa más que `8px`. Ninguna compuerta mide los chunks diferidos. JS inicial −390 B.
- [X] T030 [US1] **Caso "catálogo sin acento"** (historia 1, escenario 2) en `apps/admin-e2e/src/design-system.spec.ts`: con `readOnlyCollaborator(run)` de `design-system-support.ts` (T020), un colaborador cuyo rol tiene **solo `catalog.read`** abre el catálogo y la prueba verifica **0** elementos con el acento.
  - **Depende de T102 de la 001** (`specs/001-catalog-rbac/tasks.md`, "Decisiones pendientes"). `readOnlyCollaborator` crea un rol con solo `catalog.read`. Si T102 se cierra quitando `catalog.read` del enumerado `Permission` (salida b), `updateRole` rechazará ese permiso: el caso debe pasar a crear el rol **sin permisos**, y la prueba tiene que seguir verificando lo mismo (un colaborador sin `catalog.write` no ve ningún acento). Si T102 se cierra exigiendo el permiso en las reglas (salida a), el caso no cambia.
  - Dejar en la prueba el comentario: `// Depende de T102 de la 001: si catalog.read sale del enumerado, usar un rol sin permisos.`
  - **Hecho**: caso "sin permiso de escritura: ningún acento" dentro de `pantalla: catálogo`, con el comentario de la dependencia. El catálogo tiene un producto y la vista lo lista, así que la prueba no mira una pantalla vacía: 0 acentos y 0 destructivos, en los tres proyectos. Pasó al primer intento, porque "Nuevo producto" ya se ocultaba sin `catalog.write` (`*appHasPermission`, de la 001). Mutación: sin `*appHasPermission`, recibe `["Nuevo producto"]`. **T102 de la 001 sigue abierta**: hoy el caso pasa con un rol que tiene solo `catalog.read`.
- [X] T031 [US1] **Editor de producto: cabecera y secciones de datos**:
  - **Archivos**: `apps/admin/src/app/catalog/product-editor/product-editor.html` y `product-editor.scss`, `details-section.ts`, `storefront-section/storefront-section.html`, `.scss` y `.ts`, `shipping-section/shipping-section.html`, `.scss` y `.ts`, `status-control/status-control.html` y `.scss`, `presentation-section/presentation-section.ts`, `categories-section/categories-section.ts` y `external-catalogs-section/external-catalogs-section.ts`.
  - **Clases**: cada `<section>` del editor lleva `.ds-card`. "Archivar producto" lleva `ds-destructive`. Los guardados de cada sección y "Cambiar estado" siguen `filled` en primario.
  - **Caso**: el editor tiene **0** acentos, y todos los botones `filled` que guardan una sección tienen el mismo fondo (historia 1, escenario 1 corregido).
  - e2e: `product-editor.spec.ts`, `sections.spec.ts`, `storefront.spec.ts` y `pending-changes.spec.ts`.
  - **Hecho**:
    - **Estilos**: las ocho fuentes de estilo sin literales ni `--mat-sys-*`. Las diez `<section>` llevan `ds-card`, y entre tarjetas queda `--ds-space-8` (el `gap` más un margen). Título en `page-title`, `<h2>` en `section-title`, leyendas en `label` y ayudas en `help` o `--ds-text-secondary`. "Archivar producto" pasa de texto a `filled` con `ds-destructive`. El aviso de URL generada pasa a `.ds-notice--warning`, y la confirmación de cambio de tipo, a `--ds-surface-selected`. Los dos esqueletos llevan `ds-card`.
    - **Caso `pantalla: producto`**: 0 acentos, el destructivo exactamente en "Archivar producto", planos y cada sección como tarjeta. Con dos secciones con cambios, sus "Guardar" tienen el fondo del primario (historia 1, escenario 1). Falló sin el destructivo antes del cambio. Mutaciones: con "Guardar datos" en `ds-primary-action`, recibe el amarillo del acento; sin `ds-card` en una sección, falla. **La jerarquía tipográfica la verifica T032**: el primer `<h3>` del editor es el de `image-upload` (archivo de T032), en `title-medium`, que difiere del texto en un solo atributo.
    - **Verificación**: `product-editor`, `sections`, `storefront`, `pending-changes`, `a11y` (contraste), `keyboard` (foco), `mobile` (360 px) y `loading-states`: 91 pasadas, 8 omitidas (las de siempre). **Desplazamiento de layout medido**: `loading-states.spec.ts` ahora publica el valor (anotación `CLS`, sin cambiar aserción ni umbral). Editor de producto: 0,0000 en escritorio y en 360 px. El instrumento se validó por mutación: sin el alto reservado del encabezado del catálogo, mide 0,0002.
    - **Contraste**: ningún par nuevo ni movido.
    - **Neto de CSS**: +3.481 B, sin cambio. Chunk diferido del editor: de 42.668 a 42.798 B en gzip (+130 B).
- [X] T032 [US1] **Editor de producto: variantes, opciones e imágenes**:
  - **Archivos**: `apps/admin/src/app/catalog/variant-table/variant-table.ts`, `variant-row.html`, `variant-row.scss` y `variant-row.ts`, `bulk-edit/bulk-edit.ts`, `assign-option-dialog/assign-option-dialog.ts`, `variant-images-dialog.ts`, `apps/admin/src/app/catalog/image-upload/image-upload.html`, `.scss` y `.ts`, `product-video.ts`, `storage-image.ts` y `apps/admin/src/app/catalog/product-editor/options-editor/options-editor.html`, `.scss` y `.ts`.
  - **Clases**: las filas de variantes llevan `.ds-table-row`. "Confirmar" de `AssignOptionDialog` lleva `ds-primary-action`.
  - **Casos**: `AssignOptionDialog` (1 acento, "Confirmar") y `VariantImagesDialog` (0).
  - e2e: `variant-data.spec.ts` y `product-editor.spec.ts`.
  - **Hecho**:
    - **Estilos**: los ocho archivos con estilos, sin literales ni `--mat-sys-*`. Cada `<li>` de la tabla de variantes es una `.ds-table-row`, y la fila deja su propio separador. Los `<h3>` de imágenes y video pasan a `subtitle` **con** `--ds-text-secondary`: el nivel se define por peso y color, y con solo el peso difería del texto en un atributo (lo que hacía fallar la jerarquía del editor en T031). La edición masiva pasa a `--ds-surface-selected`. "Confirmar" de `AssignOptionDialog` lleva `ds-primary-action`.
    - **Casos**: `pantalla: producto` suma la jerarquía tipográfica y las filas de variantes; `pantalla: diálogo: qué valor tiene cada variante` (1 acento, "Confirmar"); `pantalla: diálogo: imágenes de una variante` (0). Antes del cambio fallaron la jerarquía y "Confirmar". El diálogo de imágenes pasó al primer intento; mutación: con "Listo" en `ds-primary-action`, recibe `["Listo"]`. Sin `ds-table-row` en una variante, también falla. 9 de 9 en los tres proyectos.
    - **Verificación**: `variant-data`, `product-editor`, `a11y`, `keyboard`, `mobile` (360 px) y `loading-states`. CLS medido del editor: 0,0000 en escritorio y en 360 px. Contraste: el `<h3>` en secundario sobre diálogo ya estaba declarado (5,74 / 5,67). **La corrida destapó T058**, una falla intermitente de `a11y` en el catálogo que no es de esta tarea (ver "Defectos encontrados").
    - **Tamaño**: CSS inicial +3.481 B, sin cambio. Código del editor (con sus diálogos de variantes): de 42.798 a 42.805 B en gzip (+7 B).
- [X] T033 [US1] **Categorías**: `apps/admin/src/app/catalog/categories/categories-page.html`, `.scss` y `.ts`, y `category-row.ts`.
  - **Clases**: "Crear categoría" lleva `ds-primary-action`. En la fila, "Guardar", "Mover" y "Ocultar" siguen `filled` en primario, y "Eliminar" lleva `ds-destructive`.
  - **Casos**: 1 acento ("Crear categoría"), y una fila en edición no agrega ninguno.
  - e2e: `categories.spec.ts`.
  - **Hecho**:
    - **Planos**: el alta es una tarjeta, y el árbol, otra. Como el árbol se dibuja con una plantilla recursiva, `[class.ds-card]="level === 1"` hace tarjeta solo al primer nivel. La lista filtrada, el vacío y el esqueleto también llevan `ds-card`. Lo que se arrastra pasa al plano y la elevación de lo superpuesto. La edición de una fila es un grupo con borde dentro de la tarjeta, no otro plano. Título en `page-title` y "Nueva categoría" en `section-title`.
    - **Acciones**: "Crear categoría" con `ds-primary-action`; "Eliminar" de la fila con `ds-destructive`; "Guardar", "Mover" y "Ocultar" siguen en primario.
    - **Casos**: `pantalla: categorías`, con acento, destructivas, planos y jerarquía; y una fila en edición, que no suma acento y al eliminar deja el destructivo exactamente en "Eliminar". Fallaron sin el acento antes del cambio. **Corrección de la prueba**: "Crear categoría" está deshabilitado hasta que hay un nombre, y deshabilitado no lleva el acento (FR-025); los casos escriben un nombre antes de medir. Como esa versión de la prueba no se vio fallar, se validó por mutación: sin `ds-primary-action` cae el primero, y sin `ds-destructive`, el segundo. 6 de 6 en los tres proyectos.
    - **Verificación**: `categories`, `pending-changes`, `a11y`, `keyboard`, `mobile` (360 px) y `loading-states`: 77 pasadas, 8 omitidas, 0 fallas. CLS medido del árbol: 0,0000 en escritorio y en 360 px. Ningún par nuevo.
    - **Tamaño**: categorías, de 22.545 a 22.628 B en gzip (+83 B). CSS inicial: +3.502 B; los +21 B sobre T032 son de T059 (los colores derivados y la selección compuesta están en la hoja global), no de esta tarea.
- [X] T034 [US1] **Equipo y rol**:
  - **Archivos**: `apps/admin/src/app/team/team-page.ts`, `members/members-section.ts`, `members/invitations-section.ts`, `members/transfer-ownership-dialog.ts`, `roles/roles-section.ts` y `role-editor/role-editor.ts`.
  - **Clases**: "Invitar" lleva `ds-primary-action`. "Crear rol" sigue `filled`. "Traspasar la propiedad" y "Eliminar rol" llevan `ds-destructive`. "Guardar rol" lleva `ds-primary-action`.
  - **Casos**: Equipo como Propietario (1 acento, "Invitar"); `TransferOwnershipDialog` (0); Rol (1 acento, "Guardar rol").
  - e2e: `team-and-permissions.spec.ts`.
  - **Hecho**:
    - **Planos**: las tres secciones de equipo (personas, invitar, roles) son tarjetas, separadas por `--ds-space-8`; el esqueleto y el vacío también llevan `ds-card`. En el rol, el formulario y "Eliminar el rol" son dos tarjetas. El recuadro del enlace de invitación pasa a grupo con borde dentro de la tarjeta. Títulos en `page-title` y `section-title`, y el `<h3>` "Pendientes" en `subtitle` con su color secundario.
    - **Acciones**: "Invitar" y "Guardar rol" con `ds-primary-action`; "Crear rol" sigue en primario; "Traspasar la propiedad" y "Eliminar rol" con `ds-destructive` ("Eliminar rol" pasa de `outlined` a `filled`).
    - **Casos**: `pantalla: equipo` (1 acento, "Invitar"), `pantalla: diálogo: traspaso de propiedad` (0 acentos; el destructivo, "Traspasar la propiedad") y `pantalla: rol` (1 acento, "Guardar rol"; el destructivo, "Eliminar rol"). El diálogo se abre y se cancela: traspasar cambiaría la siembra compartida. El rol es uno propio y sin personas: con personas, "Eliminar rol" se deshabilita, y "Guardar rol" solo aparece con cambios, así que el caso marca un permiso antes de medir. Los tres fallaron sin acento o sin destructivo antes del cambio; la aserción del destructivo del rol se validó por mutación. 9 de 9 en los tres proyectos.
    - **Verificación**: `team-and-permissions`, `a11y`, `keyboard`, `mobile` (360 px) y `loading-states`: 65 pasadas, 8 omitidas, 0 fallas. CLS medido: equipo y rol, 0,0000 en escritorio y en 360 px. Ningún par nuevo (el `<h3>` secundario sobre tarjeta ya estaba declarado).
    - **Tamaño**: equipo, de 6.564 a 6.650 B en gzip (+86 B); rol, de 3.356 a 3.420 B (+64 B). CSS inicial: +3.502 B, sin cambio.
- [X] T035 [US1] **Bitácora**: `apps/admin/src/app/audit/audit-log/audit-log.ts` y `apps/admin/src/app/audit/entry-detail/entry-detail.ts`. Caso: 0 acentos. e2e: `audit.spec.ts`. **Al cerrar la última vista**, `apps/admin/design-system/screens.spec.ts` suma una verificación: cada `screen` de `primary-actions.ts` aparece como título `pantalla: <screen>` de algún caso de `apps/admin-e2e/src/design-system.spec.ts`. Así el "100 % de las pantallas" de SC-004 lo hace cumplir una compuerta de CI, no la disciplina (G1 de `/speckit-analyze`) Hecho:
  - **Planos y densidad**: las entradas son la tarjeta, y cada una una `.ds-table-row` (la entrada deja su propio separador). Título de la entrada en `label`; quién, cuándo y la diferencia en `help` con `--ds-text-secondary`: los metadatos, un nivel más denso que el texto. Esqueletos y vacíos con `ds-card`. Título de página en `page-title`.
  - **La tabla no necesitó nada nuevo**: lista de entradas con su línea principal, metadatos y pares Antes/Después en una `<dl>`, todo con tokens y clases existentes. Se consideró `tabular-nums` para los importes y se descartó: Antes y Después no se alinean en columnas.
  - **Caso `pantalla: bitácora`**: 0 acentos, 0 destructivas, planos, jerarquía, y cada entrada como fila del sistema. Falló sin tarjeta antes del cambio; 3 de 3 en los tres proyectos.
  - **Compuerta de cobertura (G1)**: `screens.spec.ts` lee los títulos `pantalla: <screen>` de `design-system.spec.ts` y falla si alguna pantalla de `primary-actions.ts` no tiene su caso. Hoy las 15 lo tienen. Mutación: con el caso de la bitácora sin el prefijo, falla.
  - **Verificación**: `audit`, `a11y`, `keyboard`, `mobile` (360 px) y `loading-states`: 63 pasadas, 8 omitidas, 0 fallas. CLS medido de la bitácora: 0,0000 en escritorio y en 360 px.
  - **Tamaño**: bitácora, de 5.832 a 5.847 B en gzip (+15 B). CSS inicial: +3.502 B de 10.240.
  - **Falla en CI, corregida**: la primera corrida con T035 (38588127445) falló en las dos mitades, de forma determinista (las tres veces, con reintentos): `offline.spec.ts:25` buscaba `getByRole('link', { name: 'Bitácora' })` y encontraba dos. El caso nuevo creaba un producto `Bitácora <número>`, que el catálogo muestra como enlace, y `design-system` corre antes que `offline` contra los mismos emuladores. Había otro choque latente: `DS-Catálogo` frente a `audit.spec.ts:75`, que solo no fallaba porque `audit` corre antes. Los productos de `design-system.spec.ts` pasan a empezar con "DS-" y a no contener el nombre de ninguna sección. **En local no se vio porque para T035 se corrieron solo las suites de la tarea, no la completa.** Con la corrección, la suite completa en local: 209 pasadas, 8 omitidas, 0 fallas.
  - **Informe de literales**: quedan 2 hallazgos, los dos en `apps/admin/src/styles.scss` (el anillo de foco: `3px solid var(--mat-sys-primary)` y `outline-offset: 2px`). No son de ninguna vista: los migra T036, como prevé la fase 6.

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

- [X] T036 [US2] Foco (FR-023), anillo de **dos tonos** (`contracts/component-treatments.md`): en `apps/admin/src/styles.scss`, `:focus-visible` pasa de `3px solid var(--mat-sys-primary)` a `outline: var(--ds-focus-ring-width) solid var(--ds-focus-ring-inner)` con `outline-offset: var(--ds-focus-ring-offset)`, más `box-shadow: 0 0 0 calc(var(--ds-focus-ring-offset) + var(--ds-focus-ring-width) + var(--ds-focus-ring-outer-width)) var(--ds-focus-ring-outer)`. Caso en `apps/admin-e2e/src/design-system.spec.ts`: con Tab, un control sobre cada plano (página, `.ds-card`, `.ds-bar`, diálogo) y "Nuevo producto" (fondo de acento) tiene el `outline` y el `box-shadow` computados con los dos tonos y sus anchos; y con `forcedColors: 'active'`, el `outline` sigue presente. e2e: `keyboard.spec.ts` Hecho:
  - **El anillo**: `styles.scss` define `focus-ring` (trazo claro `--ds-focus-ring-inner` como `outline`, oscuro `--ds-focus-ring-outer` como sombra de 7 px) y lo aplica a `:focus-visible`. `styles.scss` queda sin literales: el informe de la compuerta da 0 en todo el panel.
  - **Los botones de Material no tenían anillo**: `.mdc-button { outline: none }` le gana a `:focus-visible` (misma especificidad, hoja posterior), así que su foco era solo el velo de foco de Material. Y en colores forzados Material les pone a todos un `outline` de 1 px, tengan foco o no: un botón con foco no se distinguía de uno sin él. Con `html .mat-mdc-button-base:focus-visible` y `html .mat-mdc-menu-item:focus-visible`, botones y opciones de menú llevan el anillo, también en colores forzados. Los campos de Material siguen con su propio indicador (la línea activa en primario, más gruesa).
  - **Corrección de T058**: había bajado el velo de foco al 4 % porque "el foco lo indica el anillo"; en los botones no había anillo, y las casillas y los radios de Material muestran su foco con ese velo. Vuelve al 12 % de Material, y entran al inventario diez pares `…/con-foco` (el velo de foco sobre cada botón): el primario claro queda en `#3848d7` y el oscuro en `#a6bbff`, restringidos por el texto con foco sobre la selección.
  - **Casos**: `foco` en `design-system.spec.ts`. Con teclado, sobre la página ("← Catálogo"), la tarjeta (un producto), la barra ("Categorías"), el acento ("Nuevo producto") y un diálogo ("Cancelar"), el `outline` y la sombra computados son los de los tokens, con sus anchos (se espera la transición de 280 ms de la sombra de los botones `filled`). En colores forzados, el `outline` tiene el ancho del anillo (3 px): Chrome dibuja su propio indicador de 1 px aunque la hoja diga `outline: none`, y la primera versión de la prueba, "hay un trazo", no lo distinguía. Mutaciones: sin `outline` cae el de colores forzados (recibe 1 px); sin la regla de Material cae el de los planos; sin `html`, otra vez el de colores forzados.
  - **Pares del anillo**: no están en la derivación, a propósito. Sus tonos son fijos (blanco y `$blue-950`), no semánticos, y la derivación los salta (`alternate`, `two-tone`). Están en el inventario de la compuerta, al objetivo nuevo: 17,26 entre los dos tonos (objetivo 9,5) y, contra cada fondo, el tono que más contrasta da de 5,69 a 18,49. El 3,03 y 3,09 "al filo" eran del anillo de un solo tono que se reemplazó el 2026-10-12 por este, que ya es doble.
  - **Verificación**: suite completa en local, 224 pasadas, 8 omitidas, 0 fallas. CSS inicial +3.739 B (JS −385 B).
- [X] T037 [US2] Error con ícono (FR-024): en `apps/admin/src/styles/_components.scss`, `.mat-mdc-form-field-error::before` y `.ds-notice--error::before` dibujan un ícono con `mask` sobre un SVG en línea (`data:`) y `background: currentColor`. Sin fuente de íconos, porque FR-017 no admite descargas, y sin tocar plantillas. **Actualizar** la fila "Campo de formulario" de `specs/003-panel-design-system/contracts/component-treatments.md`, que decía `matSuffix`, con este mecanismo y su razón: es global, no cambia la estructura y no requiere tocar cada campo. Caso: un SKU vacío muestra `mat-error` con texto y con un `::before` de `mask-image` distinto de `none` Hecho:
  - **El ícono**: `_components.scss` define `$error-icon` (un SVG en línea, codificado como `data:`) y el mixin `error-icon` (`mask` sobre el SVG y `background: currentColor`). En `.mat-mdc-form-field-error::before` va en línea delante del mensaje, de 1 em. En `.ds-notice--error::before` va posicionado a la izquierda del primer renglón (`--ds-space-6`, el alto de una línea), en el lugar que le abre el relleno: así queda igual en un aviso en fila (la falla de navegación, que lo hereda por el `@extend` de `_shell.scss`) y en uno en columna (`ui-error-state`). Sin fuente de íconos ni cambios de plantilla.
  - **Contrato**: la fila "Campo de formulario" de `contracts/component-treatments.md` describe el mecanismo y su razón, en lugar de `matSuffix`.
  - **Casos**: `error con ícono: un SKU que no se puede quitar` (el `mat-error` tiene su texto y un `::before` con máscara, tamaño y el color del mensaje) y, en el caso de T024, el aviso de error del catálogo sin red. Los dos fallaron antes del cambio (`mask-image: none`); 6 de 6 después, en los tres proyectos.
  - **Contraste**: el ícono va en el color del texto, así que hereda los pares ya declarados (`status-error` sobre los planos, `on-status-error-container` sobre su contenedor).
  - **Verificación**: suite completa en local, 227 pasadas, 8 omitidas, 0 fallas; CLS 0,0000 en todas las vistas medidas, en escritorio y a 360 px.
  - **Tamaño**: CSS inicial +4.039 B de 10.240; esta tarea suma 300 B, casi todo el SVG en línea.
- [X] T038 [US2] Deshabilitado, hover y movimiento (FR-025, FR-026, FR-028): en `apps/admin/src/styles/_components.scss`, el deshabilitado usa `--ds-text-disabled` y `cursor: not-allowed`, nunca el tono ni el borde de error. Las transiciones usan `--ds-motion-short`, y la regla de `prefers-reduced-motion` de `styles.scss` queda igual. Caso: "Cambiar estado" deshabilitado junto a "Archivar producto" difieren en más que el color (opacidad o cursor), no reciben foco con Tab y un clic no hace nada. **Revisión manual de FR-026**: en cada vista, nada se ve **solo** con hover. Anotar el resultado al pie de esta tarea Hecho:
  - **Deshabilitado**: `button-overrides` y `form-field-overrides` llevan el texto deshabilitado a `--ds-text-disabled`, el contenedor `filled` a `--ds-surface-hover` y los contornos a `--ds-border-subtle`: nunca el tono ni el borde de error. El cursor es `not-allowed` con `:root button:disabled`: Material le quita los eventos de puntero a un botón deshabilitado (así el cursor no se veía), y su regla es de (0,2,0); `:root` la supera sin nombrar sus clases internas (FR-006). Solo botones: un `<button>` deshabilitado no recibe el clic, un enlace sí.
  - **Caso** `deshabilitado: "Cambiar estado" junto a "Archivar producto"`: el cursor dice que no se puede y difiere del habilitado; el texto va en `--ds-text-disabled`; ni texto, ni fondo, ni borde usan el error o el destructivo; Shift+Tab desde "Archivar producto" no se detiene en "Cambiar estado"; y un clic forzado no abre nada ni cambia el estado. Falló por el cursor antes del cambio; la aserción del color se validó por mutación (sin el override, Material vuelve a su gris al 38 %). 3 de 3 en los tres proyectos.
  - **Movimiento**: la única transición propia del panel (`.ds-table-row`) ya usa `--ds-motion-short`. La regla de `prefers-reduced-motion` de `styles.scss` no cambió.
  - **Revisión manual de FR-026** (2026-10-14): se buscaron todos los `:hover`, los elementos ocultos y los textos de `title` y tooltip del panel. Los tres `:hover` refuerzan algo que ya se ve en reposo: el subrayado del nombre en un enlace de fila del catálogo y de comercios (la fila ya es enlace), y el fondo tenue de `.ds-table-row`. Las 24 `display: none` son todas `.failure:empty` (ocultan un aviso vacío). No hay tooltips de Material. El único texto que aparece solo con hover es el `title="Arrastrar para mover"` del asa de arrastre de una categoría: el asa se ve siempre, y la misma acción está a la vista en "Acciones → Mover a…", accesible por teclado. No se pierde información; queda anotado.
  - **Verificación**: suite completa en local, 230 pasadas, 8 omitidas, 0 fallas; CLS 0,0000 en las doce mediciones. CSS inicial +4.179 B (+140 B esta tarea).
- [X] T039 [US2] Colores forzados (FR-013): reglas de `@media (forced-colors: active)` en `apps/admin/src/styles/_components.scss`, solo si hacen falta. Caso con `page.emulateMedia({ forcedColors: 'active' })` en catálogo y editor: `.ds-card`, `.ds-bar` y los campos tienen `border-style` distinto de `none` y ancho mayor que 0 Hecho:
  - **Lo que hizo falta**: solo la barra. La tarjeta conserva su borde, y el campo `fill` de Material marca su límite con la línea activa, que es un borde (el `::before` de `.mdc-line-ripple`) y se conserva en colores forzados. La barra se distinguía solo por el tono, que en ese modo desaparece: `@media (forced-colors: active)` le da un borde inferior de `--ds-border-width`, en el color que ponga el sistema. A los campos no se les agrega un borde completo: haría falta un selector sobre una clase interna de Material (FR-006), y su línea activa ya los marca.
  - **Caso** `colores forzados`, en el catálogo y en el editor: la tarjeta, la barra y la línea activa del campo tienen un borde de ancho mayor que 0 y estilo distinto de `none`. Falló por la barra antes del cambio; mutación: sin la regla, vuelve a fallar por la barra.
  - **Dos carreras de la prueba, corregidas**: "no hay esqueleto" ya es cierto en la página de inicio de sesión, así que a veces medía antes de llegar al catálogo (falló en `movil-360` y `oscuro`). Los casos esperan ahora el título "Catálogo"; la misma espera se agregó a otros dos casos que dependían, sin decirlo, de que su paso siguiente esperara por su cuenta. Con `--repeat-each 3`, 45 de 45.
  - **Verificación**: suite completa en local, 233 pasadas, 8 omitidas, 0 fallas; CLS 0,0000 en las doce mediciones. CSS inicial +4.198 B (+19 B esta tarea).
- [X] T040 [US2] Pares de estado en `apps/admin/design-system/contrast-pairs.ts` (historia 2, escenario 5):
  - hover (`--ds-surface-hover` compuesto sobre cada plano) con el texto encima;
  - fila seleccionada;
  - error (`--ds-status-error` sobre los tres planos; `--ds-on-status-error-container`);
  - aviso, éxito e información;
  - deshabilitado, declarado con `kind: 'ui'` y no exigido;
  - el anillo de foco ya se declara contra el acento, el destructivo y el primario desde la revisión de dos tonos (2026-10-12).

  `contrast.spec.ts` en verde.
  - **Hecho**:
    - **Hover**: cuatro pares con `layers: [{ color: '--ds-surface-hover' }]` sobre la tarjeta, donde vive la fila del sistema: texto primario (8,11 / 11,06), secundario (5,26 / 5,41), de enlace (6,25 / 6,93) y de error (5,21 / 5,41). Una capa puede declararse sin opacidad: el token ya trae su transparencia. **Diferencia con el texto de la tarea**: no se declara hover sobre la página ni sobre la barra. `--ds-surface-hover` solo lo usa la fila, que vive en tarjetas; los botones de la barra usan su propio velo, ya declarado en los pares de presionado y con foco. Declararlos exigía oscurecer el texto secundario por un uso que no existe (daban 4,93 y 4,65): un objetivo hipotético, lo que la compuerta de inventario quiere evitar.
    - **Fila seleccionada**: no existe en el panel. Las filas no cambian de fondo al seleccionarse; lo dicen la casilla y el contador. La barra de selección ya tenía sus pares (texto primario, secundario, primario y error sobre `--ds-surface-selected`), y el estado presionado y con foco sobre ella (T058, T036).
    - **Error, aviso, éxito e información**: ya estaban, sobre los tres planos y sobre sus contenedores.
    - **Deshabilitado**: `text-disabled` sobre el diálogo (2,68 / 2,72) y sobre el contenedor de un botón `filled` deshabilitado (2,45 / 2,50), con `kind: 'ui'`: WCAG lo exime, se declara para que se vea y no se exige.
    - **Foco**: los pares del anillo contra el acento, el destructivo y el primario ya estaban (T036).
    - **Verificación**: la compuerta falló con los pares sin declarar, y con los dos de hover hipotéticos bajo el objetivo; con los reales, ningún color tuvo que moverse. `design-check` 69 de 69; suite completa en local, 233 pasadas, 8 omitidas, 0 fallas.

**Checkpoint**: `a11y.spec.ts` en `escritorio` y `oscuro` sin incumplimientos (SC-003).
`contrast.spec.ts` al 100 % (SC-002). Validar con `quickstart.md`, historia 2.

---

## Phase 5: User Story 3 — Tuteo neutro (Priority: P2)

**Goal**: todo el panel en tuteo neutro, sin voseo ni usted.

**Independent Test**: `design-check` (lenguaje) en verde, las e2e con sus textos actualizados, y la
revisión manual de T049.

**Depende solo de la Fase 1** (T001 y T003): no usa tokens, y puede avanzar en paralelo con las
fases 2 a 4. Comparte archivos con las tareas de vista de la US1 (ver "Archivos compartidos").

- [X] T041 [P] [US3] Pruebas de lenguaje en `apps/admin/design-system/language.spec.ts`, con `apps/admin/design-system/fixtures/language/` (`research.md` §7):
  - **Voseo detectado**: formas conocidas (`tenés`, `querés`, `podés`, `sabés`, `sos`); candidatos morfológicos (`revisá`, `elegí`, `escribí`); enclíticos sin tilde (`revisalos`, `movelas`, `asegurate`).
  - **Léxico**: las palabras del léxico (`está`, `será`, `menú`) pasan, y una palabra candidata que no está en el léxico falla como "revisar".
  - **Usted**: la lista cerrada de FR-039, **textual**: revise, cree, ingrese, agregue, edite, guarde, elimine, defina, elija, seleccione, busque, confirme y cancele, como palabra completa y sin importar mayúsculas. Una excepción por texto exacto habilita **solo** ese texto.
  - **Excepciones muertas**: una entrada de léxico o una excepción que no aparece en ningún texto falla.
  - **Fuera de alcance**: los comentarios de TypeScript, los `<!-- -->` y los `*.spec.ts` no se recorren.
  - **Hecho**: 13 casos en `language.spec.ts` sobre `fixtures/language/` (formas conocidas, candidatos, enclíticos sin tilde y su forma de tú que pasa, léxico y candidata sin clasificar, usted como palabra completa y en mayúsculas, excepción de usted acotada a su texto, excepciones muertas, comentarios de TS y de plantilla, `.html`, mensajes del servidor y archivos de pruebas), más dos que aparecieron al correr sobre el panel: el hiato ("creá" es de dos sílabas) y lo que se lee de una plantilla. Fallaron primero por no existir `language.ts`.
- [X] T042 [US3] `apps/admin/design-system/language.ts` y `apps/admin/design-system/language-exceptions.ts`, hasta que T041 pase.
  - **Recorrido**: cadenas, plantillas y `.html` de `apps/admin/src/app` y `libs/ui/src`, y los mensajes de `BusinessRuleError` y `HttpsError` de `libs/application/src` y `apps/functions/src` (`research.md` §12).
  - **Léxico**: se arma clasificando la primera corrida, palabra por palabra, cada una con su razón (`data-model.md`: `{ word, reason }`).
  - **Cierre**: la compuerta falla con los textos con voseo que corrigen T043 a T046, y el número de hallazgos queda anotado aquí.
  - **Hecho**:
    - **Qué se lee de una plantilla**: el texto entre etiquetas, los atributos visibles (`aria-label`, `placeholder`, `title`, `alt` y las entradas `heading` y `message`) y las cadenas entre comillas de las expresiones e interpolaciones. Nombres de atributo, enlaces de datos y bloques de control son código; una cadena que es un identificador (minúsculas ASCII sin espacios, o camelCase) se salta. Sin eso, la primera corrida dio 333 hallazgos, la mayoría código (`autocomplete`, `canWrite`, `'rename'`).
    - **Tres huecos corregidos al correr sobre el panel**, cada uno con su caso: una etiqueta con `>` dentro de un atributo se cortaba antes de tiempo; en el servidor, un mensaje que llega por una constante (`throw new HttpsError(code, DENIED)`, el de `guard.ts`) no se leía; y "creá" contaba como una sílaba, porque el hiato se tomaba por diptongo.
    - **Las listas exactas antes que las reglas por forma**: "revise" es usted, aunque calce como imperativo de vos con "se".
    - **Léxico**: 18 palabras, cada una con su razón: 12 que terminan como un imperativo o un presente de vos y no lo son (futuros, `está`, `esté`, `más`, `después`, `así`) y 6 que calzan con la regla del pronombre sin tilde (`admite`, `repite`, `necesite`, `invite`, `digitales`, `decimales`). Ninguna excepción de usted: la primera corrida no encontró ningún usted de la lista.
    - **Cierre**: la compuerta falla sobre el panel con **119 hallazgos**: voseo en 43 archivos del panel y 4 mensajes del servidor, y 3 "acá", que no es voseo pero tampoco neutro, y pasa a "aquí".
- [X] T043 [P] [US3] Tuteo en autenticación, marco y errores:
  - **Archivos**: `apps/admin/src/app/app.ts` ("No pudimos abrir esa vista. Revisa tu conexión."), `auth/login/login.ts`, `auth/sign-up/sign-up.ts` y su `sign-up.spec.ts`, `tenant/tenant-shell/tenant-shell.ts`, `team/accept-invitation/accept-invitation.ts` y `shared/command-errors.ts` (todas sus entradas con voseo; entre ellas: "Recarga para ver los cambios", "Revísalos y reintenta", "Revisa los dígitos", "muévelas o elimínalas primero", "Reintenta", "No tienes permiso…", "Vuelve a iniciar sesión", "Recarga la página", "Revisa tu red y reintenta").
  - **Escenarios**: 1 a 3 de la historia 3.
  - **Hecho**: 53 cambios en `app.ts`, `login.ts`, `sign-up.ts`, `tenant-shell.ts`, `tenant-picker.ts`, `accept-invitation.ts`, `command-errors.ts` y `pending-changes.ts` ("Si sales ahora…"), con un reemplazo de palabra por palabra que conserva la mayúscula. Formas elegidas donde no alcanzaba la regla: "sos" → "eres" ("Ya eres parte de este comercio"), "pedile" → "pídele", "Cerrá sesión y entrá" → "Cierra sesión y entra". Las pruebas unitarias que asertan esos textos (`sign-up.spec.ts`, `login.spec.ts` y la de `members-section.spec.ts` que espera el mensaje de `command-errors.ts`) cambian solo el texto esperado. 391 de 391. La compuerta queda en 75 hallazgos, ninguno en estos archivos.
- [X] T044 [P] [US3] Tuteo en el catálogo y el editor:
  - **Archivos**: `apps/admin/src/app/catalog/product-list/product-list.ts` y `product-list.spec.ts`, `bulk-actions.ts`, `create-product/create-product-dialog.ts`, `product-editor/status-control/status-control.html`, `shipping-section/shipping-section.ts`, `categories-section/categories-section.ts`, `options-editor/options-editor.ts`, `shared/amount-input.ts`, `image-upload/image-upload.ts`, `image-upload/product-video.ts`, `variant-table/variant-row.ts`, `variant-table/variant-table.spec.ts`, `bulk-edit/bulk-edit.ts` y `bulk-edit.spec.ts`, y `assign-option-dialog/assign-option-dialog.ts` y `assign-option-dialog.spec.ts`.
  - **También**: nombres accesibles, ayudas y marcadores de posición (escenario 4).
  - **Hecho**: 66 cambios en el catálogo, el editor, las variantes, las imágenes y sus pruebas unitarias (la compuerta lee también `aria-label`, `placeholder` y los `mat-hint`). Formas elegidas: "Achicala" → "Redúcela", "apretá Enter" → "presiona Enter", "Escribila" → "Escríbela", "dejalo vacío" → "déjalo vacío", y los dos "acá" → "aquí" ("aquí" entra al léxico como adverbio de lugar). Las pruebas cambian solo el texto esperado. 391 de 391.
- [X] T045 [P] [US3] Tuteo en categorías y equipo: `apps/admin/src/app/catalog/categories/categories-page.html`, `categories-page.ts` y `category-row.ts`, `team/team-page.ts`, `members/invitations-section.ts`, `members/members-section.ts` y `members-section.spec.ts`, `members/transfer-ownership-dialog.ts` y `role-editor/role-editor.ts` Hecho:
  - **Textos**: 26 cambios automáticos más 4 a mano en categorías, equipo, rol, invitaciones y traspaso, y en la bitácora, que no figuraba en ninguna tarea ("van a aparecer aquí", "Reintenta"). A mano: "cópialo", "pídeselo" (dos), y "Vos dejás de ser Propietario" → "Dejas de ser Propietario", sin el pronombre. Las pruebas cambian solo el texto esperado (`categories-page.spec.ts`, `role-editor.spec.ts`). 391 de 391.
  - **Tres huecos de la compuerta, cerrados con sus casos**: esta pasada encontró voseo que la compuerta no veía. El pronombre "vos" no estaba en las formas conocidas. "copialo" no calzaba como enclítico, porque la regla exigía consonante antes de la vocal de la raíz (`copia-`). Y "pedíselo" tampoco, porque el imperativo de vos con dos pronombres conserva su tilde justo antes de ellos (en tú, "pídeselo"). Relajar la regla del enclítico trajo un falso positivo, "actuales", que entra al léxico.
  - **Cierre**: el panel queda sin hallazgos; quedan 4 en el servidor (T046).
- [X] T046 [P] [US3] Mensajes del servidor (`research.md` §12):
  - `apps/functions/src/bootstrap/guard.ts`: "No tienes permiso para realizar esta operación". El comentario de la línea 30 también pasa a tuteo. **Sigue siendo el mismo texto** para "no miembro" y para "sin permiso", para no revelar si el comercio existe.
  - `libs/application/src/use-cases/team/invitations.ts`: "Ya eres miembro de este comercio".
  - Las pruebas que asertan esos textos se actualizan con el texto nuevo, sin cambiar lo que verifican.
  - **Hecho**: `guard.ts` ("No tienes permiso para realizar esta operación", el mismo para "no eres miembro" y "sin permiso", y el comentario de la línea 30), `invitations.ts` ("Ya eres miembro de este comercio"), y dos que research §12 no nombraba y la compuerta encontró: `archive.ts` ("para retirarla, archiva el producto") y `roles.ts` ("Reasigna antes a sus N colaboradores"). Ninguna prueba asertaba esos textos (verifican el código y la razón). Pruebas de `functions` y `application` en verde. La compuerta de lenguaje queda en **0 hallazgos**.
- [X] T047 [US3] Textos esperados de las e2e: `apps/admin-e2e/src/loading-states.spec.ts`, `pending-changes.spec.ts`, `support.ts` y cualquier otro `*.spec.ts` de `apps/admin-e2e/src/` que espere un texto cambiado en T043 a T045. **Solo** cambia el texto esperado: misma aserción, mismo umbral y ninguna prueba quitada (FR-033). La suite completa en verde en el trabajo `e2e`. Depende de T043 a T045 Hecho: siete textos esperados, en `loading-states.spec.ts` ("Crea la primera…"), `pending-changes.spec.ts` ("Reintenta"), `product-editor.spec.ts` ("completa el SKU de", "Describe la imagen…"), `support.ts` (el enlace "Crea una") y `variant-data.spec.ts` ("…y usarlo aquí"). Misma aserción y mismo umbral; ninguna prueba quitada. Suite completa en local: 233 pasadas, 8 omitidas, 0 fallas.
- [X] T048 [US3] `design-check` en verde: 0 voseo y 0 imperativos de usted fuera de las excepciones (SC-008). Ninguna excepción muerta. Depende de T042 a T046 Hecho: `language.spec.ts` sobre el panel da 0 hallazgos: 0 voseo, 0 usted de la lista y ninguna excepción muerta (las 20 palabras del léxico aparecen en algún texto). `design-check` 84 de 84.
- [X] T049 [US3] Revisión manual del usted que la lista cerrada no cubre (FR-039, historia 3): leer cada vista y cada diálogo de `contracts/primary-actions.md`, con lector de pantalla en catálogo y editor (`quickstart.md`, historia 3, paso 4). Todo imperativo de usted encontrado se corrige y **se agrega a la lista cerrada** en el mismo cambio: en `language.ts`, en la lista de FR-039 de `specs/003-panel-design-system/spec.md` y en `language.spec.ts`. Anotar al pie de esta tarea qué se revisó y qué se encontró Hecho (2026-10-14):
  - **Qué se revisó**: los 1.424 textos que recorre la compuerta (todo lo que el panel muestra o anuncia, de las doce vistas y los cinco diálogos), con `languageTexts` de `language.ts`. Dos pasadas: una búsqueda de 50 imperativos de usted frecuentes que la lista cerrada no tiene (escriba, pegue, intente, vuelva, espere, presione, pulse…), y la lectura de la primera palabra de cada texto, que es donde va un imperativo.
  - **Lector de pantalla**: no se usó un lector físico. En su lugar se leyó el árbol de accesibilidad (lo que un lector anuncia: roles, nombres, ayudas y estados) del catálogo, del diálogo "Nuevo producto" y del editor (`ariaSnapshot` de Playwright).
  - **Qué se encontró**: ningún imperativo de usted. Las tres coincidencias de la búsqueda son subjuntivos de tercera persona ("una URL que describa el producto", dos veces; "cuando vuelva [la conexión]"). Los imperativos del panel están en tú (Escribe, Elige, Ingresa, Usa, Describe, Pega, Completa, Reemplaza, Comparte, Reasigna, Dale), y los botones, en infinitivo. Nada que sumar a la lista cerrada de FR-039.

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

- [X] T050 [US4] Retirar el trinquete: borrar `apps/admin/design-system/migrated-files.ts` y su uso en `literals.ts`. El verificador **bloquea en todo** el panel, y `var(--mat-sys-*)` solo se admite en `apps/admin/src/styles/_theme.scss`. Actualizar `literals.spec.ts` (los casos del trinquete pasan a "todo hallazgo bloquea"). `npx nx run admin:lint` con **0** hallazgos (SC-001). Revisar `literal-exceptions.ts`: cada `reason` se sostiene, ninguna excepción está muerta Hecho:
  - **Sin trinquete**: `migrated-files.ts` se borró; `literals.ts` ya no distingue archivos migrados ni tiene `blocking`, y la línea de comandos sale con 1 ante cualquier hallazgo. `var(--mat-sys-*)` sigue admitiéndose solo en `_theme.scss`.
  - **Excepciones muertas, también las generales**: hasta ahora solo se detectaba una excepción con archivos que no existían. El verificador registra qué excepción excusó algún valor (evaluando todos los literales de cada valor, no solo hasta el primero no exceptuado) y devuelve las que nada usó. Las ocho de `literal-exceptions.ts` se usan, y sus razones siguen valiendo.
  - **Pruebas**: el caso del trinquete pasó a "todo hallazgo bloquea, en cualquier archivo"; se sumaron "una excepción general que nada usa está muerta" y, sobre el panel, "ningún valor fuera del catálogo" (SC-001). Mutación: un `color: #ff0000` en `entry-detail.ts` hace fallar `admin:lint` con `→ usa var(--ds-status-error)`.
  - **Cierre**: `npx nx run admin:lint`, **0 valores fuera del catálogo**. `design-check` 86 de 86.
- [X] T051 [P] [US4] Compuerta de adopción (FR-021a) en `apps/admin/design-system/adoption.spec.ts`: falla si `apps/admin/src` o `libs/ui/src` importa `@angular/material/paginator`, `tabs`, `table`, `card` o `toolbar` y `apps/admin/src/styles/_components.scss` no tiene el `@include` del mixin correspondiente (`ds-paginator`, `ds-tabs`, `ds-mat-table`, `ds-mat-card`, `ds-mat-toolbar`). El mensaje es el de `contracts/gates.md` y remite a "Adoptar uno de estos componentes" de `contracts/component-treatments.md`. Con un caso sobre `fixtures/adoption/` que falla, y otro que pasa al incluir el mixin Hecho:
  - **`adoption.ts`**: lee los imports con la API de TypeScript (estáticos, `export … from` e `import()`), así que un import comentado no cuenta; de `_components.scss` toma los `@include` sin comentarios, así que un mixin solo definido, o incluido dentro de un comentario, no cuenta. Recorre los `.ts` de `apps/admin/src` y `libs/ui/src` que no son pruebas. El mensaje es el de `contracts/gates.md`.
  - **Pruebas**: con `fixtures/adoption/`, falla con el mixin definido pero sin incluir (y con su `@include` comentado), y pasa al incluirlo; sobre el panel, 0 hallazgos. Corre en `admin:design-check`, del que depende `admin:lint`.
  - **Mutación**: sin quitar los comentarios de la hoja, el caso que debe fallar pasa; leyendo los imports con una expresión regular sobre el texto, el import comentado de `tabs` aparece como hallazgo. Las dos mutaciones hacen fallar la prueba.
- [X] T052 [P] [US4] Aislamiento de la paleta (historia 4, escenario 3) en `apps/admin/design-system/palette-isolation.spec.ts`:
  - **Uso de la paleta**: solo `_tokens.scss` y `_theme.scss` hacen `@use` de `_palette.scss`.
  - **Propagación**: compilar con otro azul primario (`@use … with`) cambia `--ds-primary`, y la prueba de contraste reevalúa los pares que lo usan.

  Junto con T050, garantiza que cambiar un valor de la paleta llega a todas las vistas sin tocar ningún componente.

  Hecho:
  - **Uso**: `palette-isolation.ts` busca `@use`, `@forward` e `@import` de la paleta en las hojas de `apps/admin/src` y `libs/ui/src` sin sus comentarios, y también en las cadenas de los `.ts`, porque los estilos en línea se compilan como SCSS (`inlineStyleLanguage`). En el panel, solo la usa `_tokens.scss`.
  - **Propagación**: la paleta lleva `!default` en cada valor para poder compilarla con `@use … with`; el CSS compilado queda idéntico byte a byte (24.173 B). Con el azul de la referencia (`#536dfe`), `--ds-primary` cambia en claro y no en oscuro, y la prueba de contraste reporta exactamente los 23 pares cuyo color cambió (enlaces, primario en reposo, presionado y con foco, la selección, el anillo sobre el primario), todos en claro, y ninguno más.
  - **Mutación**: sin quitar comentarios, sin mirar los `.ts`, con `--ds-primary` escrito a mano en `_tokens.scss`, con el contraste solo en oscuro, y con un `@use` de la paleta en `categories-page.scss`: cada una hace fallar su caso.
  - De paso, dos comentarios de `_palette.scss` decían "4,7+ (0,2 de margen)"; desde T059 el margen es 0,5.

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

## Defectos encontrados

Defectos de features anteriores encontrados al construir esta. Se corrigen con su prueba en la tarea
que los encuentra.

- [X] T057 [Defecto corregido] **"Reintentar" no daba ninguna señal mientras reintentaba.**
  - **Hallado**: en T001, al corregir la flaky de `loading-states.spec.ts`. Es el primero que atrapa la compuerta e2e nueva.
  - **Causa**: al recargar con los mismos parámetros, `resource` de Angular conserva el resultado anterior, **incluido el error**, hasta que llega el nuevo. Las 12 vistas con `ui-error-state` muestran el error mientras `x.error()` exista, así que después del clic la vista no cambiaba. Sin red, eso duraba los 10 s de `OFFLINE_AFTER_MS` y terminaba en el mismo error: la persona hacía clic y no veía que pasara nada. Con un diagnóstico de `MutationObserver` se comprobó que no cambiaba ni un nodo en 14 s.
  - **Corrección**: `ui-error-state` (`libs/ui/src/lib/states/error-state.ts`) recibe `retrying`. Mientras reintenta, el botón dice "Reintentando…", queda con `aria-disabled` (con `disabledInteractive`, para no quitarle el foco a quien lo acaba de activar) y descarta otro clic. Las 12 vistas le pasan `status() === 'reloading'` de los recursos que reintenta. **No** `isLoading()`: un recurso en su carga inicial no está reintentando, y con `isLoading()` un error de un recurso mientras otro todavía cargaba dejaba el botón en "Reintentando…" sin que nadie hubiera pulsado, y bloqueaba el reintento. Lo atraparon dos pruebas unitarias que ya existían (`product-editor.spec.ts` y `tenant-shell.spec.ts`).
  - **Pruebas**: dos casos nuevos en `error-state.spec.ts` (reintentando: texto, `aria-disabled`, sin `disabled`, clic descartado; y vuelve a ofrecerlo al terminar). En `loading-states.spec.ts`, el reintento sin red verifica "Reintentando…", `aria-disabled` y el foco conservado.
  - **Anuncio para lectores de pantalla** (pedido al cerrar T001, como la T093 de la 001): el `alert` se anuncia al aparecer, pero su contenido no cambia al reintentar. Ahora `ui-error-state` anuncia con `LiveAnnouncer` "Reintentando…" al empezar, y "<encabezado>. Puedes volver a intentarlo." con prioridad (`assertive`) si vuelve a fallar. Al aparecer no anuncia nada, porque eso ya lo hace el `alert`. Pruebas: tres casos unitarios con un doble del anunciador, y en la e2e del reintento, la región `.cdk-live-announcer-element` dice "Reintentando…". Validado por mutación: si `previous` arranca en `true` (anuncia una falla al aparecer), caen dos casos unitarios; si se quita el anuncio, cae la e2e.

- [X] T058 [Defecto corregido] **El contraste de la barra de selección del catálogo falla de forma intermitente en axe.**
  - **Hallado**: en T032, al correr `a11y.spec.ts` como verificación. `a11y.spec.ts:168` ("listado: filtrado por categoría, con las acciones masivas y su rechazo"), proyecto `movil-360`: **3 de 120** corridas aisladas. En CI no apareció en ninguna de las tres corridas.
  - **Qué mide axe**: `color-contrast` 4,39 en "Mostrar el precio", "Activar envío gratis" y "Quitar envío gratis": primario (`#3252fe`) sobre `#dfe3ff`.
  - **Causa**: la onda del toque de Material (`.mat-ripple-element`, primario al 12 %) sigue a la vista mientras se desvanece; al 5 % sobre `--ds-surface-selected` (`#e8ebff`) da `#dfe3ff`. `expectAccessible` espera las animaciones en curso, pero la onda puede quedar visible sin ninguna animación activa. Que axe marque también a los botones vecinos sugiere que no respeta el recorte de la onda (hipótesis, sin medir).
  - **Desde cuándo**: T021. La barra apunta a `--ds-surface-selected` desde entonces; no la introdujeron T029 ni T032.
  - **Por qué importa más allá de la prueba**: el primario y el error sobre `--ds-surface-selected` dan 4,71, 4,71 y 4,70 contra un mínimo con margen de 4,70. Están al filo, y por eso un velo del 5 % los baja de WCAG.
  - **Estado después de T059**: con la paleta derivada, el primario sobre la selección da 5,18 en reposo y 4,84 con la onda al 5 %. La prueba pasó **120 de 120** (antes, 3 fallas en 120). **Riesgo residual**: con la onda al 8 % da 4,64, y al 12 %, 4,39; si axe la encuentra en ese tramo, vuelve a fallar. Queda abierta hasta decidir el arreglo del banco de pruebas: que `expectAccessible` espere a que no quede ninguna `.mat-ripple-element` a la vista, como ya dice buscar ("la vista quieta").
  - **Corrección (2026-10-14)**: por decisión del usuario, no se espera a que la onda desaparezca: 4,39 está bajo el mínimo liso de WCAG y es un defecto real del estado presionado.
    - **Medido en el navegador**: mientras se presiona, Material pinta dos capas del color del texto, el velo de `:active` y la onda, las dos con la opacidad de presionado (no el velo de hover, como se suponía).
    - **Opacidad**: el panel define sus capas de estado (`--ds-state-hover-opacity` y `--ds-state-focus-opacity` 4 %, `--ds-state-pressed-opacity` 6 %) y `_theme.scss` se las da a Material; `.ds-primary-action` y `.ds-destructive` usan la misma para su onda.
    - **Inventario**: diez pares nuevos con `layers` (contrast.ts compone las capas sobre el fondo), uno por botón que el panel usa: texto en primario sobre los cinco planos, los tres `filled`, "Reintentar" en el aviso de error y las opciones del menú. El primario se deriva también contra ellos.
    - **Prueba determinista**: `whilePressed` presiona y mantiene (mientras el puntero sigue abajo la onda no se apaga), espera a que la onda termine de entrar y mide; suelta fuera del botón para no disparar la acción. La prueba de `a11y.spec.ts` corre axe además con "Mostrar el precio" presionado. `pressedContrast` calcula el contraste contra el fondo compuesto real, y los casos de `estado presionado` en `design-system.spec.ts` lo exigen en 5,0 para un botón de cada tipo.
    - **Antes y después**: antes, axe medía 4,39 a medio apagarse la onda, y en su pico era 3,61 (primario `#3252fe` sobre `#e8ebff`, capas de 8 % y 12 %). Después, en el navegador con la onda en su pico: texto sobre la selección 5,01; sobre la barra 5,01; sobre la tarjeta 5,63; sobre el diálogo 5,63; primario `filled` 5,27; destructivo 5,09; acento 8,32; "Reintentar" 7,25 (escritorio; el resto de los proyectos, igual o más). Con `--repeat-each 5`, 60 de 60 y el mismo valor en cada repetición.

## Tareas agregadas

- [X] T059 [Agregada el 2026-10-13] **Paleta semántica derivada de su objetivo de contraste**, antes de T033.
  - **Por qué**: con el margen de 0,2, seis colores compartidos se movieron para entrar (cuatro en T021, el superpuesto oscuro con el anillo de foco, `$pink-100` en T024), y tres pares quedaron a 0,01 de su mínimo (T058). La paleta se partía del tono y se corregía.
  - **Hecho**:
    - **Objetivo**: WCAG + 0,5 (`MARGIN` de `contrast.ts`, de 0,2 a 0,5): 5,0 para texto, 3,5 para componentes y texto grande, 9,5 entre los tonos del foco. `contrast.spec.ts` se actualizó a los mensajes nuevos.
    - **Derivación**: `apps/admin/design-system/palette-derivation.ts`. De la referencia se toman tono y saturación (OKLCH); la luminosidad es la más cercana a la de la referencia que cumple el objetivo contra todas las superficies en que se usa el color, que son sus pares de `contrast-pairs.ts`, por cualquiera de los dos lados. Se derivan 13 valores: primario, error y destructivo, aviso, éxito, información, texto secundario y contorno de control, en cada esquema. Se itera hasta el punto fijo (cuatro rondas), porque la selección depende del primario.
    - **Compuerta**: `palette-derivation.spec.ts` exige que `_palette.scss` tenga exactamente el valor derivado de cada uno, que cumpla contra todas sus superficies, que el objetivo sea WCAG + 0,5 y que ningún derivado comparta valor con otra variable. Mutaciones: con `$blue-500` escrito a mano (`#3252fe`), caen tres pruebas; con un par nuevo más exigente, la derivación cambia el valor.
    - **Documentación**: método, objetivo, par que restringe a cada color y su medición en `contracts/tokens.md`, "Derivación de la paleta semántica". Nota en research §2.
    - **`--ds-surface-selected`**: "seleccionado" ya se comunica sin color: la casilla de cada fila (su marca es una forma) y el contador ("N seleccionados", "N variantes seleccionadas"). Las filas no cambian de fondo al seleccionarse. No había incumplimiento de 1.4.1. El token deja de tener valor propio: es el primario al 8 % sobre la tarjeta (20 % en oscuro), compuesto en la compilación con `opaque-mix` de `_tokens.scss`, opaco para que la compuerta lo mida. Salen `$blue-75` y `$blue-850`.
    - **Uso equivocado corregido**: la confirmación de cambio de tipo de `shipping-section` usaba `--ds-surface-selected` (lo mapeó así T031 al traducir `secondary-container`). No es una selección: pasa a grupo con borde `--ds-border-subtle` dentro de la tarjeta. **Cambio de apariencia**.
    - **Cambios de apariencia** (ΔE en OKLab ×100; desde 4 se nota):
      - En claro: primario `#3252fe` → `#4054e4` (4,2); error y destructivo `#d00047` → `#cb005c` (3,3); aviso `#955b00` → `#8b5e00` (1,9); contorno de control `#80809a` → `#7b7b95` (1,7); selección `#e8ebff` → `#eff1ff` (1,9); éxito (1,1) e información (0,0) casi iguales.
      - En oscuro: error y destructivo `#ff6b95` → `#ff97ae` (9,0); primario `#8e9dff` → `#9bb3ff` (6,2); texto secundario `#a3a3ad` → `#b6b6b6` (5,9, pierde su tinte azulado: la referencia es gris neutro); selección `#272e63` → `#383b57` (5,8); contorno de control `#7a7a88` → `#80809a` (3,1).
      - Éxito oscuro (`#4fd1b0` → `#31c2a0`, 4,9) e información oscura (`#c39bff` → `#ab76ff`, 9,9) bajan de contraste, porque la derivación vuelve a lo más cercano a la referencia. Hoy no se ven en ninguna vista: ningún componente usa `--ds-status-success` ni `--ds-status-info`.
      - El primario claro queda restringido por **un solo uso**: "Reintentar" sobre el aviso de error (`primary/status-error-container`). Si ese aviso fuera más claro, el primario quedaría más cerca de la referencia.
    - **Verificación**: `design-check` 67 de 67 (antes 49; 18 son de la derivación); 33 pares con razón nueva; ningún par bajo el objetivo. Suite e2e completa en local, tres proyectos: 191 pasadas, 8 omitidas, 0 fallas. `index.html` acompaña el texto secundario oscuro (`#b6b6b6`), y `boot.spec.ts` lo atrapó antes de corregirlo.
  - **Agregado (2026-10-14)**:
    - **"Reintentar"**: un botón en primario sobre una superficie de error es un emparejamiento malo, y ataba el primario de toda la paleta a ese uso. Los botones de un aviso (`.ds-notice--error` y `--warning`) van en el color propio del aviso, con borde o como texto (`notice-buttons` en `_components.scss`). Salen los pares `primary/status-error-container` y `border-control/status-error-container`. Re-derivado sin esa restricción, y con los pares del estado presionado (T058), el primario claro queda en `#3949d8`, restringido por el texto presionado sobre la selección; el oscuro, en `#a4baff`. La selección oscura pasa al 12 % del primario: con el 20 %, aclarar el primario aclaraba la selección, y la selección pedía un primario más claro.
    - **Compuerta de inventario**: `expectDeclaredPairs` corre en los 24 puntos de medición de los casos `pantalla:` (vista, diálogo o aviso) y exige que todo texto visible en reposo sea un par declarado. La primera corrida encontró tres usos reales sin declarar: enlaces con el azul del navegador (`rgb(0, 0, 238)`: "Creá una", "Iniciá sesión", "← Equipo", los de la bitácora), corregidos con una regla base `a { color: var(--ds-text-link) }`; y el enlace para saltar al contenido, en colores invertidos, declarado como `surface-card/text-primary`. El inventario se lee como texto de contrast-pairs.ts (la e2e no puede importar otro proyecto), y falla si lee menos pares que `id:` tiene el archivo.
- [X] T061 [Agregada el 2026-10-14] **Búsquedas por coincidencia parcial en la e2e.** `offline.spec.ts` buscaba el enlace "Bitácora" por subcadena, y cualquier dato con el nombre de una sección lo rompía (T035).
  - **Barrido**: las 277 búsquedas por texto de la suite (176 por rol, 62 por etiqueta, 39 por texto) pasan a nombre exacto. Las que buscaban el comienzo de un mensaje más largo usan `startsWith` (`support.ts`): exige el comienzo, admite el espacio inicial de una plantilla y rechaza el texto a mitad de otro.
  - **Hallazgo**: con un fragmento, una aserción negativa exacta (`toHaveCount(0)`) se vuelve vacía: no encuentra nada nunca. Le pasó a `getByText('Faltan datos de envío')` de `storefront.spec.ts`, que dejó de esperar el guardado y destapó un conflicto de versión en el paso siguiente. Se revisaron las once negativas con `exact`: diez son nombres completos; esa pasó a `startsWith`.
  - **Verificación**: suite completa en local, 218 pasadas, 8 omitidas, 0 fallas.
- [ ] T060 [Pulido, después de T035] **Una sola regla de `h1` y `h2`**. Hoy cada vista migrada repite la de su título de página y la de sus títulos de sección. Una regla global ahorraría unos 380 B entre todas, pero hoy aplicaría estilos del sistema a vistas sin migrar, por fuera del trinquete. Se hace cuando las doce vistas estén migradas: ahí es deduplicación sin cambio de comportamiento, verificable con las mismas pruebas de jerarquía.

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
