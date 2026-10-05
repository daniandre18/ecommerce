# Quickstart: validar el catálogo de cara a la tienda

**Feature**: 002-storefront-catalog · **Fase**: 1

Cómo comprobar de punta a punta que la feature funciona. El entorno es el de la 001
([quickstart](../001-catalog-rbac/quickstart.md)): emuladores, siembra y panel. Contratos y modelo:
[callable-functions](./contracts/callable-functions.md), [firestore-rules](./contracts/firestore-rules.md),
[ports](./contracts/ports.md), [data-model](./data-model.md).

## Preparación

```bash
npm install
npx nx run functions:build
firebase emulators:start --only auth,firestore,functions,storage --project demo-ecommerce
# en otra terminal, con los emuladores corriendo:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-ecommerce npx nx run tools:seed
npx nx serve admin                  # http://localhost:4200
```

La siembra de la 001 suma `storefront/sections` y `storefront/vocabulary` vacíos y el árbol de
categorías vacío. Cuentas: `owner@t1.test` (Propietaria) y `catalogo@t1.test` (rol de Catálogo, sin
precios), contraseña `test-1234`.

## Comprobaciones por historia

### Historia 1 — Ficha de tienda

1. Crear "Camiseta Básica Algodón" → URL `camiseta-basica-algodon`. Crear otro con el mismo nombre →
   `camiseta-basica-algodon-2`, visible antes de guardar.
2. Renombrar el segundo en borrador → la URL sigue al nombre. Publicarlo y renombrarlo → la URL no
   cambia. Editarla a mano → la anterior queda reservada: otro producto no puede tomarla.
3. Título para buscadores de 71 caracteres → no se guarda; la descripción corta en 160. La vista
   previa muestra nombre y descripción del producto mientras están vacíos.
4. Etiqueta "Verano" sobre un producto con "verano" → no se duplica. Escribir "ni" en marca → sugiere
   una marca existente.
5. Pegar un enlace de YouTube → aparece en la galería, en la posición elegida. Pegar uno de otra
   plataforma → se rechaza nombrando YouTube y Vimeo.
6. Producto físico sin peso → el listado lo marca "faltan datos de envío" y el filtro lo encuentra;
   **se puede publicar igual** (FR-017).
7. Pasarlo a digital → el aviso dice qué cambia **para el comprador**; la bitácora suma una entrada
   "condiciones de venta: Envío con cargo → Sin envío". Volver a físico → recupera peso y
   dimensiones, y otra entrada en sentido contrario.

### Historia 2 — Categorías

1. Crear Ropa > Hombre > Camisetas; intentar un cuarto nivel → se impide.
2. Crear "Camisas" en Hombre y en Mujer → `camisas` y `camisas-2`, mostradas al crear.
3. Asignar un producto a Camisetas; filtrar por Ropa → aparece.
4. Ocultar Hombre → el panel avisa cuántas subcategorías quedan ocultas; Camisetas figura "oculta por
   su categoría padre". Ocultar Camisetas por sí misma, mostrar Hombre → Camisetas **sigue** oculta.
5. Mover Camisetas dentro de Mujer → su URL y su visibilidad propia no cambian.
6. Eliminar una categoría con productos → el aviso dice cuántos la pierden; los productos no cambian
   en nada más.
7. Como `catalogo@t1.test`: ve el árbol y filtra, sin acciones de edición.

### Historia 3 — Cómo se ofrece cada producto

1. Como Propietaria: ocultar el precio de un producto → entrada en la bitácora.
2. Como `catalogo@t1.test`: precio visible y envío gratis en solo lectura. Llamar a `setSaleConditions`
   por fuera del panel → `permission-denied` y evento de seguridad.
3. Llenar Ofertas hasta 40 (contador "40 de 40") → el 41 se rechaza; ningún producto sale.
4. Con 35 en Destacados, agregar 8 en una acción → se rechaza entera: "quedan 5 lugares".
5. Archivar un producto que está en Destacados → el aviso lo dice; el contador baja.
6. Seleccionar 20 productos con 3 digitales y activar envío gratis → rechazo que nombra los 3; quitar
   de la selección y reintentar desde la misma pantalla → envío gratis en los 17 y 17 entradas.

### Historia 4 — Variantes y catálogos externos

1. GTIN de 13 dígitos válido → se acepta; con el dígito de control mal → `invalid-gtin`.
2. Asignar a otra variante un GTIN que tiene una variante **archivada** → se rechaza nombrando el
   producto archivado. Quitar el GTIN de la archivada → el código queda libre.
3. Peso propio en la variante XL → las demás muestran el del producto como heredado; borrarlo → XL
   vuelve a heredar.
4. Rango de edad: el selector muestra "0 a 3 meses" … "Adulto"; en Firestore queda `newborn` … `adult`.

## Suites automatizadas

```bash
npx nx run-many -t lint,typecheck,test     # dominio (árbol, visibilidad, condiciones, secciones,
                                           # GTIN, URL) y casos de uso, sin emuladores
firebase emulators:exec --only firestore,storage --project demo-ecommerce "npm run test:rules"
firebase emulators:exec --only auth,firestore,storage --project demo-ecommerce \
  "npm run test:infrastructure && npm run test:functions && npm run test:tools"
npx nx e2e admin-e2e                       # escritorio y 360 px
npx nx run admin-e2e:perf                  # SC-006 y la carga de las vistas nuevas
```

Lo que bloquea el merge es lo mismo que en la 001: `lint`, `typecheck`, `unit`, `rules` e
`integration`. Las pruebas nuevas que entran a esas compuertas:

| Suite | Qué garantiza |
|---|---|
| `unit` | Las propiedades del dominio de `contracts/ports.md`, incluida la tabla completa de condiciones de venta |
| `rules` | Casos 35 a 48 y 35a de `contracts/firestore-rules.md` |
| `integration` | Atomicidad de `setProductType` y `setSaleConditions` con su bitácora; tope de secciones con agregados simultáneos (SC-011); URL única con creaciones simultáneas (SC-001) |
