# Contrato: compuertas automáticas

**Feature**: 003-panel-design-system · Requisitos: FR-005, FR-031, FR-033, FR-035, FR-038, FR-039 ·
Principio X

Cómo se invoca cada compuerta, qué mira y qué dice cuando falla. Todas corren en CI y bloquean la
integración, incluida la suite e2e completa (FR-033a, research §15). La única excepción es
`admin-e2e:perf`, que sigue corriéndose antes de integrar.

## Resumen

| Compuerta | Comando | Trabajo de CI | Bloquea | Criterio |
|---|---|---|---|---|
| Valores literales | `npx nx run admin:lint` (eslint + `design-system/literals.ts`) | `lint` (ya existe) | Sí | SC-001 |
| Contraste y tipografía | `npx nx run admin:design-check` | `unit`, vía `run-many -t test` (ver abajo) | Sí | SC-002, FR-015 |
| Lenguaje | `npx nx run admin:design-check` | ídem | Sí | SC-008 |
| Componentes adoptados sin tratamiento | `npx nx run admin:design-check` | ídem | Sí | FR-021a |
| Planos distintos en el catálogo | `npx nx run admin:design-check` | ídem | Sí | SC-005, la parte de los tokens |
| Tamaño inicial | `npx nx run admin:bundle-check` | `bundle-check` (ya existe; se amplía) | Sí | SC-007 |
| Suite e2e completa (línea base desde la primera tarea) | `npx nx run admin-e2e:e2e` | `e2e` (nuevo) | Sí | FR-033a |
| Acento, planos, colores forzados | `design-system.spec.ts`, dentro de la suite | `e2e` | Sí | SC-004, SC-005, FR-013 |
| axe en los dos esquemas | `a11y.spec.ts`, proyecto `oscuro` | `e2e` | Sí | SC-003 |
| Garantías vigentes: 360 px, 44 px, saltos de diseño | `mobile`, `loading-states` y `keyboard`, dentro de la suite | `e2e` | Sí | SC-006 |
| Garantías vigentes: tiempos de carga, 100 colaboradores | `npx nx run admin-e2e:perf` | — | Antes de integrar (ruido en máquinas compartidas) | SC-006 |

**`design-check` en CI**: el objetivo `test` del panel corre el ejecutor de Angular, que no ve
`apps/admin/design-system/`. `design-check` es un objetivo Vitest propio, con su `vite.config.mts`,
como `bundle-check`. Para que el trabajo `unit` lo corra sin tocar el workflow, `admin:test` lo
declara en `dependsOn`. Así `npx nx run-many -t test` lo incluye.

## Valores literales

```text
$ npx nx run admin:lint
apps/admin/src/app/catalog/product-editor/product-editor.scss:58:3  padding: 16px  → usa var(--ds-space-4)
apps/admin/src/app/catalog/product-editor/product-editor.scss:59:3  border-radius: 12px  → usa var(--ds-radius-lg)
apps/admin/src/app/tenant/tenant-shell/tenant-shell.ts:97:7  color: var(--mat-sys-primary)  → usa var(--ds-primary); los --mat-sys-* solo en _theme.scss
3 valores fuera del catálogo. Excepciones: apps/admin/design-system/literal-exceptions.ts
```

- La línea y la columna son las del archivo original, también para los estilos dentro de un `.ts`.
- Sale con código 1 si hay al menos un hallazgo, o si una excepción no tiene razón o no coincide con
  ningún archivo.
- Fixtures de su prueba: `design-system/fixtures/literals/` (un componente con los cuatro tipos y
  otro con solo excepciones).

## Contraste

```text
✗ text-secondary/surface-bar [dark]: calculada 4,38 < 4,5 (text)
✗ focus-ring/action-accent [light]: declarada 3,10, calculada 3,04
✗ --ds-text-muted aparece en _tokens.scss y en ningún par
```

## Tipografía

```text
✗ subtitle → body: difieren solo en [peso]; FR-015 pide al menos dos de tamaño, peso, color y espaciado
```

## Componentes adoptados

```text
✗ apps/admin/src/app/audit/audit-log/audit-log.ts importa @angular/material/paginator y
  _components.scss no incluye ds-paginator. Ver contracts/component-treatments.md, "Adoptar uno de estos componentes"
```

## Planos en el catálogo

Sobre los tokens compilados, en los dos esquemas: `--ds-surface-page`, `--ds-surface-card` y
`--ds-surface-bar` son distintos entre sí, y `--ds-border-subtle` tiene un ancho de borde distinto de 0.
Es la mitad de SC-005 que no necesita navegador. La otra mitad, que cada vista **aplique** esos
planos, es de la e2e.

```text
✗ [dark] --ds-surface-card y --ds-surface-bar valen lo mismo (#23232d)
```

## Lenguaje

```text
✗ voseo  apps/admin/src/app/shared/command-errors.ts:9  «Recargá para ver los cambios»  (recargá)
✗ voseo  apps/admin/src/app/catalog/categories/category-row.ts:40  «movelas o eliminalas»  (movelas: enclítico sin tilde)
✗ revisar  apps/admin/src/app/x.ts:12  «cancelá»  (palabra no clasificada: ¿voseo o léxico?)
✗ usted  apps/admin/src/app/y.ts:30  «Seleccione una opción»  (seleccione)
✗ excepción muerta  language-exceptions.ts  «hasta que el servidor confirme»  (no aparece en ningún texto)
```

## Tamaño inicial

```text
$ npx nx run admin:bundle-check --base=origin/main
JS inicial   base 234.888 B  rama 234.770 B  Δ −118 B   (máx. +0)       ✓
CSS inicial  base   3.402 B  rama   9.911 B  Δ +6.509 B (máx. +10.240)  ✓
```

- "Inicial" es lo que pide el `index.html` del build (research §8). La salida lista los archivos de
  cada lado, para que un crecimiento se explique solo.
- En CI, el trabajo construye la base en un `git worktree` (`.bundle-base/`) y la rama en su lugar.
  La medida de la base se escribe en `dist/base-initial.json`.
- `layers.spec.ts` (frontera de capas) no cambia.

## e2e: `design-system.spec.ts`

Una prueba por pantalla de [primary-actions.md](./primary-actions.md), en los proyectos `escritorio`,
`movil-360` y `oscuro`:

1. Cantidad y nombre del acento computado (SC-004). El caso "catálogo sin permiso de crear" crea un
   rol con solo `catalog.read`, y **depende de T102 de la 001**: si `catalog.read` sale del
   enumerado, la prueba usa un rol sin permisos ([primary-actions.md](./primary-actions.md)).
2. Los planos de la pantalla (`planes` de `primary-actions.ts`: tres dentro del marco del comercio,
   página y tarjeta fuera de él) con `background-color` distinto, y la tarjeta con borde o sombra
   (SC-005).
3. Con `forcedColors: 'active'`: tarjeta, barra y campos con `border-style` distinto de `none`
   (FR-013).
4. Un control con foco por teclado sobre cada plano: el `outline` computado tiene el color y el ancho
   del anillo (FR-023).
5. Un campo inválido: hay `mat-error` y un ícono dentro del campo (FR-024).
6. El conjunto de botones con el color destructivo computado es exactamente el declarado en
   `destructive` de esa pantalla (FR-009a).

Cada caso se titula `pantalla: <screen>`. `screens.spec.ts`, que corre en CI sin navegador,
verifica que toda pantalla de `primary-actions.ts` tenga su caso.

`a11y.spec.ts`, `mobile.spec.ts`, `loading-states.spec.ts`, `keyboard.spec.ts` y
`performance.spec.ts` no cambian de umbral (FR-033). Solo se actualizan los textos esperados que hoy
tienen voseo.
