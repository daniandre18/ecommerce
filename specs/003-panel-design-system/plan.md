# Implementation Plan: Sistema de Diseño del Panel

**Branch**: `feat/003-panel-design-system` | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-panel-design-system/spec.md`

## Summary

Le da al panel identidad y jerarquía sin cambiar qué hace ni cómo está organizado. Un catálogo de
tokens por papel, en SCSS, se compila a propiedades CSS `--ds-*` con `light-dark()`, de modo que los
dos esquemas salen sin una línea de código de arranque. Los valores parten de las decisiones de la
referencia Flatlogic: primario azul, acento amarillo cálido, fondo con tinte, tarjeta clara con
sombra difusa y tablas sin fondo. Los que no cumplen AA se ajustan conservando su tono. Material 22
se adapta solo con sus `*-overrides()`. El voseo del panel pasa a tuteo neutro.

Cuatro decisiones sostienen el plan ([research.md](./research.md)):

1. **El SCSS compilado es la única verdad** (§1, §6). Las vistas consumen `var(--ds-*)`, y la prueba
   de contraste compila los estilos con `sass` y mide lo que de verdad llega al navegador. No hay un
   JSON paralelo que pueda desfasarse.
2. **0 bytes de JS se cumplen por construcción** (§3). Los estilos del único componente de la carga
   inicial (`App`) pasan a la hoja global: el JS inicial **decrece**, y el presupuesto de 10 KB de CSS
   absorbe tokens, tratamientos y esos estilos.
3. **Cuatro compuertas nuevas en CI** (§5 a §8): literales con token sugerido, contraste y
   tipografía sobre los tokens compilados, voseo y usted, y tamaño contra la rama base real. Tres
   viajan en trabajos que ya existen. La de tamaño amplía `bundle-check` con un segundo build.
4. **Tres niveles de botón** (§13): acento para la acción principal, primario para confirmar una
   sección y error para lo destructivo. Es lo que permite cumplir "como máximo un acento" en vistas
   con varias secciones que guardan por separado, sin cambiar su estructura.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, SCSS (Dart Sass 1.104.1, el de `@angular/build`). Sin
cambios respecto de la 002.

**Primary Dependencies**: Angular 22.2 con Material + CDK 22.2.1 (`mat.theme`,
`mat.theme-overrides` y `mat.<componente>-overrides`). **Una dependencia nueva de desarrollo**:
`postcss-scss` (research §5). `sass` 1.104.1 y `postcss` 8.5.28 pasan de transitivas a directas de
desarrollo, con la misma versión.

**Storage**: N/A. No toca Firestore, reglas ni callables.

**Testing**: Vitest 5 (`design-check`: literales, contraste, tipografía, lenguaje, inventario de
pantallas; `bundle-check`: tamaño), Playwright 1.63 con `@axe-core/playwright` 4.13
(`design-system.spec.ts` nueva, `a11y.spec.ts` en un proyecto `oscuro` nuevo y el resto sin
cambios).

**Target Platform**: el panel de la 001, en navegadores con `light-dark()` (Chrome 123+, Safari
17.5+, Firefox 120+). Es el mismo requisito que ya impone `mat.theme`.

**Project Type**: monorepo web. Esta feature toca solo `apps/admin`, `libs/ui`, `apps/admin-e2e`,
dos cadenas de servidor y CI.

**Performance Goals**: carga inicial **+0 B de JS** y **≤ +10.240 B de CSS** con gzip -9, contra la
base al integrar (SC-007). Se mantienen SC-008 y SC-009 de la 001 sin cambios (SC-006).

**Constraints**: FR-032, sin cambios de estructura: las clases `ds-*` se agregan a elementos que ya
existen. El tope de 8 KB de estilos por componente se mantiene (FR-036). 44 px táctiles y 360 px sin
desborde. Ninguna prueba vigente pierde umbral (FR-033).

**Scale/Scope**: 43 requisitos funcionales (40 más FR-009a, FR-021a y FR-033a) y 10 criterios de éxito. Superficie del panel: 10 vistas,
5 diálogos, 258 valores escritos a mano para migrar, 29 archivos con voseo y 36 componentes con
estilos (9 `.scss` y 27 en línea).

## Constitution Check

*GATE: debe pasar antes de la fase 0 y volver a evaluarse tras la fase 1.*

| Principio | Estado | Cómo lo cumple este plan |
|---|---|---|
| I. Catálogo jerárquico con variantes | ➖ | No toca el modelo |
| II. Sincronización atómica de existencias | ➖ | No toca existencias |
| III. Motor de descuentos | ➖ | Fuera de alcance |
| IV. Desacoplamiento de recaudo y logística | ➖ | No toca proveedores |
| V. Analíticas | ➖ | Gráficos y tableros fuera de alcance |
| VI. RBAC, mínimo privilegio | ✅ | Ningún permiso cambia. El acento depende de que la acción exista, no de reasignarse (contracts/primary-actions.md); `*appHasPermission` sigue igual. Los dos mensajes de servidor que cambian (`guard.ts` e `invitations.ts`) conservan el mismo texto para "no miembro" y "sin permiso" |
| VII. Trazabilidad inmutable | ➖ | No toca la bitácora |
| VIII. Carga percibida | ✅ | +0 B de JS, por construcción (research §3). Esqueletos atados a los mismos tokens que el contenido (§14). La estructura de `index.html` queda verificada contra los tokens (§4). Sin fuentes descargadas (FR-017) |
| IX. Mobile-first | ✅ | Zona táctil en un solo token (`--ds-touch-target`). Contraste AA declarado y probado en los dos esquemas. axe en `oscuro`. Colores forzados verificados. Las e2e de 360 px y 44 px, sin cambios |
| X. Garantía automática | ✅ | Cuatro compuertas nuevas que bloquean en CI (contracts/gates.md), más la de componentes adoptados. Las e2e pasan a CI como primera tarea, con la línea base en verde antes de tocar tokens (FR-033a). Ninguna compuerta existente se afloja. El inventario de pantallas obliga a declarar la acción principal de toda pantalla nueva. El rendimiento sigue en local |

**Resultado del gate: PASA.** La única brecha del primer pase (SC-003 a SC-006 sin compuerta en CI)
se cerró con FR-033a, salvo el rendimiento, que queda en local por decisión explícita.

**Re-evaluación tras la fase 1**: el diseño no introdujo violaciones. Dos decisiones refuerzan el
cumplimiento. Mover los estilos de `App` a la hoja global convierte "0 bytes de JS" en una propiedad
del enfoque, no en un número que vigilar. Las excepciones muertas (literales y de lenguaje) hacen
fallar su compuerta, así que la lista de excepciones no puede crecer sin que alguien la mire.

## Project Structure

### Documentation (this feature)

```text
specs/003-panel-design-system/
├── plan.md              # Este archivo
├── research.md          # Fase 0: mecanismo (§1–§4), compuertas (§5–§9), hallazgos (§10–§14)
├── data-model.md        # Fase 1: tokens, pares, excepciones, acciones principales, niveles
├── quickstart.md        # Fase 1: cómo validar de punta a punta
├── contracts/
│   ├── tokens.md                 # Catálogo: nombres, papeles, escalas
│   ├── component-treatments.md   # Estados por componente y colores forzados
│   ├── primary-actions.md        # Acción principal de cada vista y diálogo
│   └── gates.md                  # Comandos, salidas y trabajos de CI
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

Solo lo que esta feature suma o cambia:

```text
apps/admin/src/
├── styles.scss                 usa los parciales; conserva cdk a11y, foco y movimiento reducido
├── styles/                     _palette, _tokens, _theme, _components, _shell (nuevos)
├── index.html                  literales de arranque = valores de los tokens (verificado)
└── app/                        cada .scss y cada `styles:` en línea → var(--ds-*);
                                clases ds-card, ds-bar, ds-table-row, ds-notice, ds-primary-action,
                                ds-destructive en los elementos que ya existen;
                                app.ts sin `styles:` (pasan a _shell.scss);
                                textos con voseo → tuteo neutro (27 archivos)

apps/admin/design-system/       (nuevo; no llega al navegador)
├── literals.ts                 verificador de valores literales (CLI + función)
├── contrast-pairs.ts, literal-exceptions.ts, language-exceptions.ts,
│   primary-actions.ts, typography-levels.ts
├── compiled-tokens.ts          compila styles.scss con sass y lee los --ds-* por esquema
├── *.spec.ts                   literals, contrast, typography, planes, language, screens,
│                               adoption (FR-021a), boot
├── fixtures/                   casos de prueba del verificador y de lenguaje
└── vite.config.mts, tsconfig.json

apps/admin/bundle-check/
└── size.spec.ts                (nuevo) JS y CSS iniciales contra la base; layers.spec.ts sin cambios

apps/admin/project.json         objetivo design-check; lint = eslint + literals;
                                test dependsOn design-check; bundle-check acepta --base

libs/ui/src/lib/states/         skeleton, empty-state, error-state → var(--ds-*)

apps/admin-e2e/
├── playwright.config.ts        proyecto `oscuro` (colorScheme: 'dark'), solo para a11y y design-system;
│                               globalTimeout solo si la medida de la línea base lo pide
└── src/design-system.spec.ts   (nuevo) acento, planos, colores forzados, foco, error con ícono
    src/*.spec.ts               solo textos esperados con voseo

apps/functions/src/bootstrap/guard.ts            "No tienes permiso…"
libs/application/src/use-cases/team/invitations.ts   "Ya eres miembro…"
.github/workflows/ci.yml        trabajo e2e nuevo (primera tarea); bundle-check: build de la base
package.json                    postcss-scss; sass y postcss directos
```

**Structure Decision**: el catálogo vive en `apps/admin/src/styles/` y no en `libs/ui`, porque es la
identidad **del panel**. La tienda pública y la personalización por comercio quedan fuera de alcance,
y si llegan, tendrán su propio catálogo. `libs/ui` consume `var(--ds-*)`, igual que hoy consume
`var(--mat-sys-*)`. Las compuertas viven en `apps/admin/design-system/`, junto a `bundle-check`:
son del panel, se ejecutan como objetivos Nx del panel y no se empaquetan.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Un verificador de literales propio** (~200 líneas) en lugar de una regla de Stylelint | FR-005 pide el token sugerido, y los estilos están en `.scss` **y** dentro de `.ts` | Stylelint necesita cuatro dependencias, una de ellas una sintaxis comunitaria para Angular, y aun así no sugiere el token por valor (research §5) |
| **Un segundo build del panel en CI** para medir la base | La spec mide contra la rama base al integrar, no contra un número fijo | Un número guardado deja que otra feature consuma este presupuesto (Assumptions de la spec). Cuesta 1 o 2 minutos de CI |
| **Literales en `index.html`** | La hoja global carga sin bloquear: en el primer pintado `var(--ds-*)` no existe (research §4) | Generar `index.html` en el build agrega un paso al ejecutor por cuatro valores. Una prueba de igualdad mantiene una sola fuente |
| **Mixins de paginador y pestañas sin incluir** | FR-021 los nombra y el panel no los usa | Incluirlos gasta bytes en componentes ausentes. Introducirlos en una vista cambia su estructura (FR-032) |

### Correcciones de la spec, aprobadas el 2026-10-10

1. **FR-008 y el escenario 1 de la historia 1** (research §13): el acento señala la acción principal
   de una pantalla; una pantalla sin acción principal no lleva acento. El editor de producto no la
   tiene, así que no lleva acento. La regla se justifica por el principio y no por cuántos botones
   tiene el editor, así que sigue valiendo si el editor cambia. **FR-009a** nueva: en un botón, el
   color de error marca solo acciones destructivas, con un papel propio distinto del de validación.
2. **FR-021 y FR-021a nueva** (research §11): tarjeta, tabla y barra se tratan como patrones propios.
   Paginador y pestañas quedan definidos sin estilos, porque un estilo que ninguna vista usa no lo
   prueba nadie. `adoption.spec.ts` impide usarlos sin su tratamiento, y el contrato dice qué hace
   quien los adopte.

## Decisión: las e2e pasan a ser compuerta en CI (2026-10-10)

**El problema: el 50 %.** De los 8 criterios automáticos de la spec, **4 se verifican solo en las
e2e** (SC-003 a SC-006), y las e2e no corrían en CI desde la 001.

| Criterio | Dónde se verifica | ¿Compuerta en CI antes de FR-033a? |
|---|---|---|
| SC-001 valores literales | `admin:lint` | ✅ |
| SC-002 contraste de los pares | `design-check` | ✅ |
| SC-003 axe en las vistas, dos esquemas | `a11y.spec.ts` | ❌ solo e2e |
| SC-004 un acento, en la acción declarada | `design-system.spec.ts`. En CI solo el inventario de pantallas | ❌ solo e2e |
| SC-005 tres planos y tarjeta separada | Tokens distintos en `design-check`; que cada vista los **aplique**, en `design-system.spec.ts` | ❌ a medias: el catálogo sí, las vistas no |
| SC-006 garantías vigentes (360 px, 44 px, CLS, SC-008/009 de la 001) | `admin-e2e:e2e` y `admin-e2e:perf` | ❌ solo e2e |
| SC-007 tamaño inicial | `bundle-check` | ✅ |
| SC-008 voseo y usted | `design-check` | ✅ |

**Por requisito**, de 42 (los 40 originales más FR-009a y FR-021a; FR-033a es la decisión misma):

- **Solo en e2e**: FR-008, FR-009a, FR-013, FR-016, FR-020, FR-024, FR-025, FR-027 y FR-033. Son 9.
- **A medias**: FR-010 y FR-023. Los tokens se verifican en CI, y su aplicación en las vistas, en la
  e2e.
- **Solo en revisión manual**: FR-006, FR-011, FR-012, FR-019, FR-022, FR-026 y FR-032.

**Por qué no es un detalle**: lo que CI verifica es el **catálogo**. Que los tokens existan, que
contrasten, que nadie escriba un valor a mano y que el arranque no crezca. Lo que queda fuera es su
**aplicación** en las vistas, y ahí está el riesgo principal de esta feature. Esta feature reestiliza
**todas** las vistas a la vez: la forma más probable de que salga mal es una regresión de 360 px, de
44 px, de saltos de diseño o de axe en alguna vista, y esa es exactamente la mitad sin compuerta. En la
001 y la 002, las e2e cubrían vistas nuevas. Acá cubren cambios en las que ya funcionaban.

**Decisión: opción B** (FR-033a, research §15). Un trabajo `e2e` en CI corre la suite completa y
bloquea la integración. Es la **primera tarea** de la feature, y su corrida en verde ocurre **antes de
aplicar ningún token**: así queda la línea base, y cualquier fallo posterior es atribuible al
rediseño. Diez minutos por PR cuestan menos que descubrir una regresión en producción, y la compuerta
queda para las features siguientes.

**Descartadas**:

- **A, local como en la 001 y la 002**: deja la mitad de los criterios a la disciplina de quien
  integra, justo en la feature que más los arriesga.
- **C, solo las e2e de esta feature**: las vistas que cambian de estilo son todas. Una selección
  parcial deja fuera regresiones que esta feature puede causar, y después nadie recuerda que era
  parcial.

**Queda fuera de CI**: `admin-e2e:perf`, que es la parte de rendimiento de SC-006. En máquinas
compartidas da ruido, y un umbral que falla al azar enseña a ignorar la compuerta. Se corre antes de
integrar.

**Con la decisión, la tabla queda así**: SC-001 a SC-005 y SC-007 a SC-008 bloquean en CI. SC-006
bloquea en CI en 360 px, 44 px, saltos de diseño y axe, y en local en tiempos de carga y volumen. Los
9 requisitos que se verificaban solo en la e2e pasan a tener compuerta. Los 7 de revisión manual
siguen siendo manuales.

### Riesgos sin resolver

- **Interlineados nuevos y saltos de diseño** (research §14): la tipografía propia puede cambiar el
  alto de una vista respecto de su esqueleto. Las e2e de CLS lo detectan, y cada tarea de migración
  incluye el esqueleto de su vista.
- **Léxico de voseo**: la primera corrida va a clasificar del orden de cien palabras con tilde final.
  Es trabajo de una persona, una sola vez. Después solo crece con texto nuevo.
- **Decisión T102 de la 001** (`catalog.read` se concede y ninguna regla lo exige) sigue abierta.
  Esta feature no la toca, pero la prueba de "catálogo sin acento" crea un rol con solo
  `catalog.read`. Si T102 sale por (b), quitar el permiso del enumerado, esa prueba tiene que usar un
  rol sin permisos. **La tarea de esa prueba lleva escrita esta dependencia** (ver la nota de abajo).

### Nota para la implementación

- La skill `angular-developer` cubre el theming de Material 22 (`mat.theme`, `*-overrides`). Antes
  de escribir un override, conviene leer los tokens que expone el componente en
  `node_modules/@angular/material/<componente>/_m3-<componente>.scss`: los nombres cambian entre
  versiones mayores, y un token mal escrito no da error, simplemente no aplica.
- **Primera tarea, obligatoria en `tasks.md`** (FR-033a): el trabajo `e2e` en `ci.yml`
  (research §15). La tarea termina cuando: (a) la suite **completa** corre en ese trabajo y pasa en
  verde sobre la rama **antes** de que exista ningún token o estilo nuevo; (b) se anota la duración
  medida en el runner, que es la base del ajuste de `globalTimeout` si `oscuro` lo pide; (c) el
  trabajo queda marcado como required status check de `main`. Ninguna otra tarea de estilos empieza
  antes.
- Orden sugerido para `/speckit-tasks`: (0) el trabajo `e2e` en CI, con la línea base en verde;
  (1) catálogo, compuertas y `_shell.scss`, con las vistas todavía en `--mat-sys-*` y la compuerta
  de literales en modo informe; (2) migración vista por vista, cada una con su esqueleto; (3) la
  compuerta de literales pasa a bloquear al llegar a 0; (4) lenguaje, independiente de la parte
  visual y paralelizable desde el principio.
- **Obligatorio en `tasks.md`**: la tarea de la prueba "catálogo sin acento" (historia 1, escenario
  2) lleva en su propio texto la dependencia con T102 de la 001: "crea un rol con solo
  `catalog.read`; si T102 se cierra quitando ese permiso del enumerado, usar un rol sin permisos".
