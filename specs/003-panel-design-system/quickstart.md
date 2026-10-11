# Quickstart: validar el sistema de diseño del panel

**Feature**: 003-panel-design-system · **Fase**: 1

Cómo comprobar de punta a punta que la feature funciona. El entorno es el de la 001
([quickstart](../001-catalog-rbac/quickstart.md)): emuladores, siembra y panel. Contratos:
[tokens](./contracts/tokens.md), [component-treatments](./contracts/component-treatments.md),
[primary-actions](./contracts/primary-actions.md), [gates](./contracts/gates.md). Modelo:
[data-model](./data-model.md).

## Preparación

```bash
npm install
npx nx run functions:build
firebase emulators:start --only auth,firestore,functions,storage --project demo-ecommerce
# en otra terminal, con los emuladores corriendo:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-ecommerce npx nx run tools:seed
npx nx serve admin --port 4320       # el 4200 puede estar ocupado por otro proyecto
```

Cuentas: `owner@t1.test` (Propietaria) y `catalogo@t1.test` (rol de Catálogo). Contraseña:
`test-1234`. No hay que sembrar nada nuevo.

## Compuertas (sin navegador)

```bash
npx nx run admin:lint            # SC-001: 0 valores fuera del catálogo
npx nx run admin:design-check    # SC-002, FR-015, SC-008: contraste, tipografía, lenguaje
npx nx run admin:bundle-check    # SC-007: +0 B de JS y hasta +10 KB de CSS contra origin/main
```

Esperado: las tres terminan con código 0. Qué dice cada una al fallar: [gates.md](./contracts/gates.md).

**Comprobar que de verdad fallan** (historia 4):

1. Agregar `color: #ff0000; font-size: 13px; padding: 10px; border-radius: 3px;` a
   `product-editor.scss` → `admin:lint` reporta **4** hallazgos, cada uno con archivo, línea y token
   sugerido. Revertir.
2. Agregar `width: 100%; margin: 0;` → 0 hallazgos. Revertir.
3. En `_palette.scss`, aclarar el gris del texto secundario → `design-check` falla con la razón
   calculada bajo 4,5. Revertir.
4. Cambiar "Revisa tu conexión" por "Revisá tu conexión" → `design-check` falla con `voseo` y la
   línea. Revertir.

## Comprobaciones por historia

### Historia 1 — Jerarquía visual

Con `owner@t1.test`, en escritorio y a 360 px, en claro y en oscuro (preferencia del sistema
operativo, o `Rendering → Emulate CSS prefers-color-scheme` en DevTools):

1. **Catálogo**: fondo de página, barra del comercio y tarjetas en tres tonos distintos. "Nuevo
   producto" es el único botón con el acento amarillo.
2. **Producto**: ningún botón con acento. Los "Guardar …" de cada sección se ven iguales, en el
   primario. "Archivar producto" en tono de error.
3. **Nuevo producto** (diálogo): "Crear" es el único con acento. La vista de atrás no cuenta.
4. **Categorías**: "Crear categoría" con acento. En una fila en edición, "Guardar" en primario y
   "Eliminar" en error.
5. Con `catalogo@t1.test`, después de quitarle `catalog.write` a su rol desde Equipo → el catálogo
   sin ningún acento.
6. Título de página, títulos de tarjeta y texto corriente: tres niveles que se distinguen sin leer.

Automático: `design-system.spec.ts`, pruebas 1 y 2 ([gates.md](./contracts/gates.md)).

### Historia 2 — Estados

1. Recorrer el editor con **Tab**: el anillo de foco se ve sobre la página, sobre la tarjeta, sobre la
   barra y sobre el botón con acento.
2. Escribir un SKU vacío y salir del campo: borde de error, ícono y texto. El texto se lee en los dos
   esquemas.
3. Un botón deshabilitado ("Cambiar estado" sin cambios) junto a uno habilitado: se distinguen sin
   mirar el color, y el deshabilitado no recibe foco ni clic.
4. Recargar el catálogo con la red en "Slow 4G": el esqueleto tiene el mismo radio, alto y espaciado
   que las filas, y nada salta al llegar el contenido.
5. DevTools → `Rendering → Emulate CSS media feature forced-colors: active`: tarjetas, barra y campos
   conservan su borde.

Automático: `a11y.spec.ts` en `escritorio` y `oscuro`, `keyboard.spec.ts`, `loading-states.spec.ts`
y `design-system.spec.ts`, pruebas 3 a 5.

### Historia 3 — Tuteo neutro

1. `/login` con el emulador de Auth detenido → "Revisa tu conexión" (o equivalente en tuteo).
2. `/login` → "¿No tienes cuenta? Crea una".
3. Editar el mismo producto en dos pestañas y guardar en las dos → "Alguien más lo editó… Recarga
   para ver los cambios".
4. Con un lector de pantalla (VoiceOver: ⌘F5), recorrer el catálogo y el editor: nombres accesibles y
   ayudas en tuteo.
5. **Revisión manual** (la parte de FR-039 que la lista no cubre): leer cada vista buscando usted
   ("Ingrese", "Su contraseña"…). Todo imperativo de usted que aparezca se agrega a la lista cerrada,
   en el mismo cambio que lo corrige.

Automático: `design-check` (lenguaje) y las e2e con sus textos esperados actualizados.

### Historia 4 — Un solo lugar

1. Cambiar en `_palette.scss` el azul primario por otro tono → `npx nx serve admin`: enlaces, chips,
   confirmaciones de sección e indicadores activos cambian en todas las vistas. Ningún componente se
   tocó.
2. `design-check` recalcula los pares que usan el primario. Si alguna razón cambió, falla hasta que
   `contrast-pairs.ts` declare la nueva.

## Garantías vigentes (SC-006)

```bash
npx nx run admin-e2e:e2e      # escritorio, móvil 360 y oscuro: desborde, 44 px, CLS, axe
npx nx run admin-e2e:perf     # estructura < 1 s y contenido < 3 s en móvil típico; 100 colaboradores
```

`admin-e2e:e2e` corre además en el trabajo `e2e` de CI y bloquea (FR-033a). `perf` se corre en
local antes de integrar. Esperado: todas pasan **sin cambios de umbral**. El diff de `apps/admin-e2e/src` solo cambia textos
esperados con voseo y agrega `design-system.spec.ts` y el proyecto `oscuro`.
