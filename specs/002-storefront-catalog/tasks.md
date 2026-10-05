---

description: "Task list for 002-storefront-catalog"
---

# Tasks: Catálogo de Cara a la Tienda

**Input**: Design documents from `/specs/002-storefront-catalog/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ se incluyen, igual que en la 001: el principio X exige pruebas automatizadas de
aislamiento de permisos como compuerta previa a producción, y esta feature toca permisos (condiciones
de venta bajo `variant.price.write`), reglas nuevas y bitácora.

**Organization**: agrupadas por historia de usuario, cada una validable por separado. Dentro de cada
historia **las pruebas van antes de la implementación que verifican**, y se comprueba que fallan
antes de implementar. Cinco puntos tienen tarea propia con su prueba por pedido explícito:
`ArchiveProduct` (T068, T069, T075 y T076), la reserva concurrente de URL (T024), el tope
concurrente de secciones (T070), el filtro por una rama de más de 30 categorías (T049) y la poda convergente
(T050).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo — toca archivos distintos y no depende de una tarea pendiente
- **[Story]**: US1, US2, US3, US4 según `spec.md`
- Toda tarea lleva su ruta de archivo exacta

## Path Conventions

Monorepo Nx de la 001, sin cambios:

- Dominio y aplicación: `libs/domain/src/`, `libs/application/src/`
- Infraestructura: `libs/infrastructure/src/`
- Entradas: `apps/admin/src/app/`, `apps/functions/src/`
- Reglas y sus pruebas: `firestore.rules`, `tests/rules/`
- Pruebas de dominio y aplicación: junto al archivo (`*.spec.ts`), con Vitest y sin emuladores
- Pruebas contra el emulador: `*.integration.spec.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dejar listas las rutas, los códigos de error y el tope nuevo antes de tocar dominio.

- [ ] T001 Registrar en `specs/002-storefront-catalog/spec.md` (Assumptions, viñeta **Topes**) el tope de **1.000 categorías por comercio** que fija `research.md` §1 por el límite de 1 MiB del documento del árbol. Debe estar en el spec antes de implementar la Historia 2
- [ ] T002 [P] Rutas nuevas en `libs/infrastructure/src/firestore/tenant-paths.ts`: `storefront/categoryTree`, `storefront/sections`, `storefront/vocabulary`, `slugIndex/{slug}` y `gtinIndex/{GTIN14}`
- [ ] T003 [P] Códigos de error de `contracts/callable-functions.md` en `BusinessErrorCode` de `libs/application/src/errors.ts`: `slug-conflict`, `gtin-conflict`, `invalid-gtin`, `unsupported-video`, `category-limit`, `category-name-taken`, `category-has-children`, `section-full`, `digital-products`

**Checkpoint**: el repositorio compila con las rutas y los códigos nuevos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: reglas nuevas, campos del producto y de la variante, el tipo de bitácora nuevo y los
helpers puros que usa más de una historia.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

### Pruebas primero

- [ ] T004 [P] Pruebas de reglas en `tests/rules/storefront.spec.ts` — casos **35 a 43** de `contracts/firestore-rules.md`: miembro activo lee `storefront/categoryTree`, `sections` y `vocabulary` de su comercio; denegado en otro comercio (36, 37) y para `slugIndex` ajeno (38); membresía `disabled` denegada (39); cuenta en dos comercios lee los dos por su membresía (40); `storefront/otroDocumento` denegado (41); **listar** `slugIndex` denegado, solo `get` (42); `gtinIndex` denegado (43)
- [ ] T005 [P] Caso **44** en `tests/rules/member-cannot-read-owner-paths.spec.ts`: con la regla de `storefront` agregada, un miembro sigue sin leer `config`, `auditLog`, `invitations` ni `securityEvents`
- [ ] T006 [P] Casos **45 a 48** en `tests/rules/no-client-writes.spec.ts`: ni el Propietario escribe `storefront/sections` ni `storefront/categoryTree`, ni crea `slugIndex/{slug}` ni `gtinIndex/{gtin}`; un rol de Catálogo no actualiza `priceVisible` ni `freeShipping` de un producto
- [ ] T007 [P] Pruebas de `saleConditionChanges` y `effectiveSaleConditions` en `libs/domain/src/services/sale-conditions.spec.ts` con la **tabla completa** de `research.md` §3: digital → físico sin envío gratis da `none → charged`; digital → físico con `freeShipping` conservado da `none → free`; físico con cargo → digital da `charged → none`; físico gratis → digital da `free → none`; `charged ↔ free`; mostrado ↔ oculto, independiente del envío; sin cambio efectivo, ninguna entrada. Propiedad: **todo cambio de tipo produce exactamente una entrada de envío**, en las dos direcciones
- [ ] T008 [P] Pruebas de `chunkIds` y `mergePages` en `libs/application/src/client/chunked-query.spec.ts`: `chunkIds` parte en grupos de **hasta 30** (31 ids → 30 + 1; 60 → 30 + 30); `mergePages` combina páginas ya ordenadas, **sin duplicar** un documento que aparece en dos grupos, respeta el orden pedido y corta al tamaño de página
- [ ] T009 [P] Pruebas de `effectiveShipping` y `missingShippingData` en `libs/domain/src/services/shipping-data.spec.ts`: la variante con valor propio lo usa (`'own'`), sin él hereda (`'inherited'`); un físico sin peso o sin **alguna** de largo, ancho y alto efectivos en alguna variante da `true`; un digital siempre `false`
- [ ] T010 [P] Pruebas de los mapeadores de catálogo en `libs/infrastructure/src/mapping/catalog-mappers.spec.ts` (archivo nuevo): un producto guardado **antes de la 002** se lee como `kind: 'physical'`, `priceVisible: true`, `freeShipping: false`, `categoryIds: []`, `tags: []`, `brand: null`, `video: null`, `slug: null`, `slugLocked: false`, `missingShippingData: true`; una variante anterior, con `gtin`, `weightGrams` y `dimensionsMm` en `null`. Ida y vuelta de todos los campos nuevos

### Implementación de la base

- [ ] T011 [P] `CategoryId` en `libs/domain/src/value-objects/ids.ts`, con su caso en `ids.spec.ts`
- [ ] T012 [P] Ampliar `Product` en `libs/domain/src/entities/product.ts` y `Variant` en `libs/domain/src/entities/variant.ts` con los campos de `data-model.md`: `slug: Slug | null` ("null SOLO en productos anteriores a la 002 hasta la migración"), `slugLocked`, `slugNeedsReplacement`, `seoTitle` (≤ 70), `seoDescription` (≤ 160), `tags` (≤ 30, cada una ≤ 40) y `tagsNormalized`, `brand` (≤ 70) y `brandNormalized`, `kind: 'physical' | 'digital'`, `weightGrams` y `dimensionsMm` (enteros > 0, nulos hasta cargarse), `missingShippingData`, `priceVisible` (por defecto `true`), `freeShipping` (por defecto `false`, se conserva aunque sea digital), `video: { provider: 'youtube' | 'vimeo'; videoId; position } | null`, `categoryIds` (≤ 20, solo las asignadas), `mpn` (≤ 70), `ageGroup: 'newborn' | 'infant' | 'toddler' | 'kids' | 'adult' | null`, `gender: 'male' | 'female' | 'unisex' | null`; en la variante, `gtin`, `weightGrams` y `dimensionsMm` (`null` = hereda). Las constantes de tope van exportadas junto a cada entidad, como `MAX_OPTIONS` en la 001
- [ ] T013 [P] Tipo de evento `'sale-conditions.changed'` en `libs/domain/src/entities/audit-entry.ts` (`field: 'price' | 'shipping'`, `before`/`after` en `'shown' | 'hidden' | 'none' | 'charged' | 'free'`, entidad `product`) y su caso en `AuditedChange` y `buildAuditEntries` de `libs/domain/src/services/build-audit-entries.ts`, con su prueba en `build-audit-entries.spec.ts`
- [ ] T014 Implementar `effectiveSaleConditions` y `saleConditionChanges` en `libs/domain/src/services/sale-conditions.ts` hasta que T007 pase (depende de T012 y T013)
- [ ] T015 [P] Implementar `effectiveShipping` y `missingShippingData` en `libs/domain/src/services/shipping-data.ts` hasta que T009 pase (depende de T012)
- [ ] T016 [P] Implementar `chunkIds` y `mergePages` en `libs/application/src/client/chunked-query.ts` hasta que T008 pase, y exportarlos desde `libs/application/src/index.ts`
- [ ] T017 Mapeadores en `libs/infrastructure/src/mapping/catalog-mappers.ts` (lectura con los valores por defecto de T010 y escritura de los campos nuevos) y en `libs/infrastructure/src/mapping/audit-mappers.ts` (el tipo nuevo, con su caso en `audit-mappers.spec.ts`) hasta que T010 pase (depende de T012 y T013)
- [ ] T018 Escribir en `firestore.rules` la regla de `storefront/{docId}` con `docId in ['categoryTree', 'sections', 'vocabulary']` y la de `slugIndex/{slug}` con **solo `get`**, según `contracts/firestore-rules.md`, hasta que T004, T005 y T006 pasen. Sin comodín y sin concesión de escritura
- [ ] T019 [P] La bitácora del panel presenta el tipo nuevo: etiqueta "Condiciones de venta" con "Precio mostrado / oculto" y "Sin envío / Envío con cargo / Envío gratis" en `apps/admin/src/app/audit/entry-detail/describe-entry.ts` (con su caso en `describe-entry.spec.ts`), y la opción en el filtro por tipo de `apps/admin/src/app/audit/audit-log/audit-log.ts` (FR-033), con su caso en `audit-log.spec.ts` (depende de T013)

**Checkpoint**: reglas nuevas con sus 14 casos en verde, el producto y la variante con todos sus
campos, los productos existentes leídos con valores por defecto, y la bitácora capaz de mostrar el
tipo nuevo. Las historias pueden empezar.

---

## Phase 3: User Story 1 — El comercio prepara la ficha de tienda de un producto (P1) 🎯 MVP

**Goal**: URL amigable que se genera sola y se puede editar, datos para buscadores con vista previa,
etiquetas, marca, video, y tipo físico o digital con peso y dimensiones; el cambio de tipo deja su
entrada de bitácora.

**Independent Test**: crear un producto y ver su URL generada; repetir el nombre y ver el sufijo;
editarla; completar buscadores, etiquetas, marca y video; marcarlo físico con peso y dimensiones;
pasarlo a digital y ver el aviso para el comprador y la entrada en la bitácora (`quickstart.md`,
Historia 1).

### Pruebas de la Historia 1 (ANTES de implementar) ⚠️

- [ ] T020 [P] [US1] Pruebas de `Slug` y `slugify` en `libs/domain/src/value-objects/slug.spec.ts`: "Camiseta Básica Algodón" → `camiseta-basica-algodon`; "Té Verde Orgánico" → `te-verde-organico`; forma `[a-z0-9]+(-[a-z0-9]+)*`, de 1 a 100 caracteres; "★★★" no produce ninguna (FR-006); `nextSlugCandidate('x', 2)` → `x-2`, sin pasar de 100 caracteres al sumar el sufijo
- [ ] T021 [P] [US1] Pruebas de `parseVideoUrl` en `libs/domain/src/services/video-url.spec.ts`: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/` y `vimeo.com/{id}` dan `{ provider, videoId }`; cualquier otra URL se rechaza (FR-018)
- [ ] T022 [P] [US1] Pruebas de `normalizeTags` y `adjustVocabulary` en `libs/domain/src/services/vocabulary.spec.ts`: "Verano" y "verano" son la misma etiqueta y no se repiten; hasta **30** etiquetas de hasta **40** caracteres; "Algodón" y "algodon" comparten clave y conserva **la primera forma registrada**; `count` sube y baja, y el término se poda al llegar a cero (FR-011, FR-012)
- [ ] T023 [P] [US1] Pruebas de los casos de uso en `libs/application/src/use-cases/storefront/storefront.spec.ts`, con el fixture en memoria: `CreateProduct` genera la URL y, si está tomada, el menor sufijo libre; renombrar sigue a la URL mientras `slugLocked` sea `false` y libera la anterior; `SetProductStatus` a `active` o `unlisted` pone `slugLocked: true`; `SetProductSlug` sobre un producto publicado deja la anterior como `previous`, reservada, y volver a ella la recupera; `UpdateProductDetails` rechaza `seoTitle` de 71 caracteres y `seoDescription` de 161, y ajusta el vocabulario; `SetProductShipping` solo en físicos; `SetProductType` conserva peso, dimensiones y `freeShipping` y escribe **una entrada de envío en cada dirección**, incluido digital → físico sin envío gratis previo
- [ ] T024 [P] [US1] **Reserva concurrente de URL** en `libs/infrastructure/src/firestore/slug-index.integration.spec.ts`, contra el emulador: dos transacciones reservan **la misma URL a la vez** con `tx.create`; exactamente una confirma, la otra falla **sin dejar nada escrito** —ni la entrada del índice ni el producto que la acompañaba—. Más: `markPrevious` y `markCurrent` sobre una entrada propia, y que una entrada `previous` impide que otro producto la tome (SC-001)
- [ ] T025 [P] [US1] Atomicidad de `setProductType` con su bitácora en `apps/functions/src/storefront/atomicity.integration.spec.ts`, **en ambos sentidos** como T038 de la 001: con fallo inyectado al escribir la entrada, el tipo no cambia; con fallo al guardar el producto, no queda entrada
- [ ] T026 [P] [US1] Pruebas de permisos de las callables nuevas en `apps/functions/src/storefront/callables.spec.ts`, y sus casos en `libs/application/src/use-cases/authorization.spec.ts`: `setProductSlug`, `setProductShipping` y `setProductType` exigen `catalog.write`

### Implementación de la Historia 1

- [ ] T027 [P] [US1] Value object `Slug` con `slug()`, `slugify` y `nextSlugCandidate` en `libs/domain/src/value-objects/slug.ts` hasta que T020 pase
- [ ] T028 [P] [US1] `parseVideoUrl` en `libs/domain/src/services/video-url.ts` hasta que T021 pase
- [ ] T029 [P] [US1] `normalizeTags` y `adjustVocabulary` en `libs/domain/src/services/vocabulary.ts` hasta que T022 pase
- [ ] T030 [US1] Puertos `SlugIndexRepository` y `VocabularyRepository` en `libs/application/src/ports/repositories.ts`, sumados a `TransactionScope` en `libs/application/src/ports/unit-of-work.ts`, con sus dobles en `libs/application/src/use-cases/testing/fixture.ts` (el de `slugIndex` falla al confirmar ante una colisión, como el de `skuIndex`)
- [ ] T031 [US1] Adaptadores `libs/infrastructure/src/firestore/repositories/slug-index.repository.ts` (`reserve` con `tx.create`) y `vocabulary.repository.ts` (documento vacío si no existe), conectados en `libs/infrastructure/src/firestore/unit-of-work.ts`, hasta que T024 pase
- [ ] T032 [US1] Ampliar `CreateProduct` en `libs/application/src/use-cases/create-product.ts` (genera y reserva la URL, con hasta 20 candidatos y luego sufijo aleatorio; valores por defecto de la ficha) y `SetProductStatus` en `set-product-status.ts` (`slugLocked: true` al publicar por primera vez). Correr `libs/application/src/use-cases/catalog.spec.ts` de la 001 y confirmar que sigue en verde
- [ ] T033 [US1] Ampliar `UpdateProductDetails` en `libs/application/src/use-cases/update-product-details.ts` (`seoTitle` ≤ 70, `seoDescription` ≤ 160, `tags`, `brand` ≤ 70, `video`, orden de medios; ajusta el vocabulario; regenera la URL si cambia el nombre y `slugLocked` es `false`) y crear `SetProductSlug` en `libs/application/src/use-cases/storefront/set-product-slug.ts`
- [ ] T034 [US1] `SetProductType` y `SetProductShipping` en `libs/application/src/use-cases/storefront/` hasta que T023 pase: `SetProductType` escribe lo que devuelve `saleConditionChanges` con `buildAuditEntries`, en la misma transacción; los dos recalculan `missingShippingData`
- [ ] T035 [US1] Callables en `apps/functions/src/storefront/callables.ts` (`setProductSlug`, `setProductShipping`, `setProductType`), sus validadores en `apps/functions/src/bootstrap/parse.ts`, la ampliación de `parseUpdateProductDetails`, y su exportación en `apps/functions/src/index.ts`, hasta que T025 y T026 pasen
- [ ] T036 [P] [US1] Índices en `firestore.indexes.json`: `archived ASC, tagsNormalized CONTAINS, updatedAt DESC`; `archived ASC, brandNormalized ASC, updatedAt DESC`; `archived ASC, missingShippingData ASC, updatedAt DESC`; `archived ASC, slug ASC`
- [ ] T037 [US1] Consultas y comandos del panel: `findSlug`, `watchVocabulary` y los filtros `tag`, `brand`, `missingShippingData` y búsqueda por URL en `CatalogQueries` (`libs/application/src/client/`) y `libs/infrastructure/src/client/firestore-catalog-queries.ts`; los comandos nuevos en `libs/application/src/client/commands.ts` y `libs/infrastructure/src/client/callable-catalog-commands.ts`; casos en `libs/infrastructure/src/client/web-client.integration.spec.ts`
- [ ] T038 [US1] Sección "En la tienda" del editor en `apps/admin/src/app/catalog/product-editor/storefront-section/`, insertada en `product-editor.html`: URL con el resultado normalizado y la URL libre **antes de guardar** (FR-007); título y descripción para buscadores con contadores **70** y **160**; vista previa en buscadores actualizada al escribir (FR-010); etiquetas como chips con sugerencias; marca con autocompletado. Con su `*.spec.ts`
- [ ] T039 [US1] Sección "Tipo y envío" en `apps/admin/src/app/catalog/product-editor/shipping-section/`, insertada en `product-editor.html` (después de T038, comparten ese archivo): selector físico o digital con aviso previo que dice **qué cambia para el comprador**, calculado con `saleConditionChanges` (FR-016); peso en kg y dimensiones en cm, guardados en gramos y milímetros enteros. Con su `*.spec.ts`
- [ ] T040 [US1] Video en la galería en `apps/admin/src/app/catalog/image-upload/`: pegar el enlace, rechazo que nombra YouTube y Vimeo, y posición entre las imágenes. Con su caso en `image-upload.spec.ts`
- [ ] T041 [US1] Listado en `apps/admin/src/app/catalog/product-list/product-list.ts`: marca "faltan datos de envío" y filtros por etiqueta, marca y datos de envío faltantes (FR-017, FR-035), con sus casos en `product-list.spec.ts`
- [ ] T042 [US1] Migración en `tools/migrate/src/` (objetivo `tools:migrate` en `tools/project.json`): asigna URL con `slugIndex` a cada producto sin ella, idempotente, sin cambiar ningún estado, con la misma salvaguarda del sembrador para emuladores `demo-*`; prueba en `tools/migrate/src/migrate.integration.spec.ts` (dos corridas seguidas dejan lo mismo)
- [ ] T043 [US1] Recorrido e2e en `apps/admin-e2e/src/storefront.spec.ts` con los pasos 1 a 7 de `quickstart.md`, Historia 1, en escritorio y a 360 px

**Checkpoint**: la Historia 1 se valida sola. Es el MVP de esta feature.

---

## Phase 4: User Story 2 — El comercio organiza su catálogo en categorías (P2)

**Goal**: árbol de hasta tres niveles con visibilidad propia derivada, asignación múltiple, filtro
por rama y asignación masiva.

**Independent Test**: armar Ropa > Hombre > Camisetas, asignar, filtrar por Ropa, ocultar y mostrar
sin perder la visibilidad propia de los hijos, mover, eliminar con conteo previo (`quickstart.md`,
Historia 2).

### Pruebas de la Historia 2 (ANTES de implementar) ⚠️

- [ ] T044 [P] [US2] Pruebas de las operaciones del árbol en `libs/domain/src/entities/category-tree.spec.ts`: ninguna deja un nodo a más de **3** niveles ni lo mueve dentro de su propia rama; un movimiento que arrastra hijos y superaría los 3 niveles se rechaza; nombres únicos entre hermanas comparados sin mayúsculas ni acentos, y "Hombre" sí se permite bajo otro padre; URL única en **todo** el árbol, incluidas las `previousSlugs`; `renameCategory` no cambia la URL; `setCategorySlug` deja la anterior en `previousSlugs`; tope de **1.000** nodos; `deleteCategory` rechaza con hijas y agrega el id a `pendingPrune`; `completePrune` lo quita
- [ ] T045 [P] [US2] Pruebas de `effectiveVisibility`, `descendantsOf` y `depthOf` en `libs/domain/src/services/effective-visibility.spec.ts`: ocultar un padre y volver a mostrarlo **deja a cada descendiente con su `hidden` previo**; **mover un nodo no cambia el `hidden` de ninguno**; un hijo visible bajo un padre oculto es `{ visible: false, hiddenBy: 'ancestor', ancestorId }`, distinto de `hiddenBy: 'self'`
- [ ] T046 [P] [US2] Pruebas de los casos de uso en `libs/application/src/use-cases/categories/categories.spec.ts`: cada operación del árbol sobre el fixture; `SetProductCategories` acepta hasta **20** categorías existentes y rechaza la 21 o una inexistente; `AssignCategory` y `UnassignCategory` no duplican, no comparan ni incrementan `version`, y no pasan de 20
- [ ] T047 [P] [US2] Pruebas de permisos en `apps/functions/src/categories/callables.spec.ts` y sus casos en `libs/application/src/use-cases/authorization.spec.ts`: todas las callables del árbol y de asignación exigen `catalog.write`
- [ ] T048 [P] [US2] Pruebas de `resolveCategories(tree, ids)` en `libs/domain/src/services/resolve-categories.spec.ts`: ignora los ids que no están en el árbol, así un producto con un id colgante se lee sin él
- [ ] T049 [P] [US2] **Filtro por una rama de más de 30 categorías** en `libs/infrastructure/src/client/category-filter.integration.spec.ts`, contra el emulador: una categoría raíz con **40** subcategorías (41 ids → dos consultas de 30 y 11); productos asignados en los dos grupos aparecen todos, ordenados por `updatedAt` descendente y cortados al tamaño de página; un producto asignado a dos categorías que caen en grupos distintos aparece **una sola vez**. Además el camino de **una sola consulta** (rama de 5) con el mismo resultado esperado
- [ ] T050 [P] [US2] **Poda convergente** en `apps/functions/src/categories/prune.integration.spec.ts`, contra el emulador, con un `CategoryPruner` que falla a propósito después del primer lote: eliminar una categoría con 1.200 productos deja la poda **cortada a la mitad**; aun así, (a) leer los productos con `resolveCategories` no muestra la categoría eliminada, (b) el filtro por cualquier otra categoría da lo correcto y (c) el id sigue en `pendingPrune`. Después, **cualquier otra operación del árbol** (renombrar otra categoría) termina la poda y vacía `pendingPrune`; correrla otra vez no cambia nada

### Implementación de la Historia 2

- [ ] T051 [US2] `CategoryTree`, `CategoryNode`, `MAX_CATEGORY_DEPTH = 3`, `MAX_CATEGORIES = 1000` y las operaciones `createCategory`, `renameCategory`, `setCategorySlug`, `moveCategory`, `reorderCategory`, `setCategoryHidden`, `deleteCategory` y `completePrune` en `libs/domain/src/entities/category-tree.ts` hasta que T044 pase
- [ ] T052 [US2] `effectiveVisibility`, `descendantsOf` y `depthOf` en `libs/domain/src/services/effective-visibility.ts`, y `resolveCategories` en `libs/domain/src/services/resolve-categories.ts`, hasta que T045 y T048 pasen (depende de T051)
- [ ] T053 [US2] Puertos `CategoryTreeRepository` y `CategoryPruner` y `ProductRepository.updateCategories` (escribe solo `categoryIds`, **sin tocar `version`**) en `libs/application/src/ports/`, con sus dobles en `libs/application/src/use-cases/testing/fixture.ts`
- [ ] T054 [US2] Adaptadores `libs/infrastructure/src/firestore/repositories/category-tree.repository.ts` (árbol vacío si no existe), `libs/infrastructure/src/firestore/category-pruner.ts` (lotes de hasta 500, con un punto de inyección de fallos para T050) y `updateCategories` en `libs/infrastructure/src/firestore/repositories/catalog.repositories.ts`, conectados en `unit-of-work.ts`
- [ ] T055 [US2] Casos de uso del árbol y de asignación en `libs/application/src/use-cases/categories/` hasta que T046 pase
- [ ] T056 [US2] Callables en `apps/functions/src/categories/callables.ts` (`createCategory`, `renameCategory`, `setCategorySlug`, `moveCategory`, `setCategoryHidden`, `deleteCategory`, `setProductCategories`, `assignCategory`, `unassignCategory`), con la poda de `pendingPrune` **después de confirmar** en todas las del árbol, validadores en `bootstrap/parse.ts` y exportación en `apps/functions/src/index.ts`, hasta que T047 y T050 pasen
- [ ] T057 [P] [US2] Índice `archived ASC, categoryIds CONTAINS, updatedAt DESC` en `firestore.indexes.json`
- [ ] T058 [US2] Consultas del panel en `libs/infrastructure/src/client/firestore-catalog-queries.ts`: `watchCategoryTree`, y el filtro por categoría que calcula la rama con `descendantsOf`, la parte con `chunkIds` y combina con `mergePages` (T016); el conteo previo a eliminar con `count()`; comandos en `callable-catalog-commands.ts`; hasta que T049 pase
- [ ] T059 [US2] Editor del árbol en `apps/admin/src/app/catalog/categories/`, con su ruta `t/:tenantId/categories` en `apps/admin/src/app/app.routes.ts` y el enlace en el encabezado del comercio: crear con la URL resultante a la vista **antes de confirmar** (FR-021); renombrar; reordenar y mover **por arrastre (`CdkDragDrop`) y por teclado**, con anuncios del `LiveAnnouncer`; ocultar con el aviso de cuántas subcategorías quedan ocultas; "oculta" y "oculta por su categoría padre" diferenciadas; filtro por visibilidad; eliminar con el conteo previo; solo lectura sin `catalog.write`. Con su `*.spec.ts`
- [ ] T060 [US2] Selector de categorías del producto en `apps/admin/src/app/catalog/product-editor/categories-section/`, insertado en `product-editor.html`: hasta **20**, con el árbol y la ruta de cada una. Con su `*.spec.ts`
- [ ] T061 [US2] Listado en `apps/admin/src/app/catalog/product-list/product-list.ts`: filtro por categoría (incluye sus subcategorías, FR-023) y asignar o quitar una categoría a los seleccionados (FR-025), con sus casos en `product-list.spec.ts`
- [ ] T062 [US2] Recorrido e2e en `apps/admin-e2e/src/categories.spec.ts` con los pasos 1 a 7 de `quickstart.md`, Historia 2

**Checkpoint**: la Historia 2 se valida sola, sobre los productos de la 001.

---

## Phase 5: User Story 3 — El comercio decide cómo se ofrece cada producto (P3)

**Goal**: precio visible y envío gratis bajo el permiso de precios y con bitácora; Destacados y
Ofertas con tope de 40, contador y rechazo entero; el archivado saca de las secciones.

**Independent Test**: como Propietaria, ocultar un precio y ver la entrada; como Catálogo, verlo en
solo lectura; llenar Ofertas hasta 40 y ver rechazado el 41; rechazar el envío gratis masivo con
digitales y reintentar sin ellos (`quickstart.md`, Historia 3).

### Pruebas de la Historia 3 (ANTES de implementar) ⚠️

- [ ] T063 [P] [US3] Pruebas de `addToSection` y `removeFromSection` en `libs/domain/src/services/sections.spec.ts`: nunca más de **40**; los que ya estaban no cuentan dos veces; sin lugar para **todos** lanza `SectionFullError` con `remaining` y **no cambia nada**; quitar uno que no está no hace nada
- [ ] T064 [P] [US3] Pruebas de `SetSaleConditions` en `libs/application/src/use-cases/storefront/sale-conditions.spec.ts`: lote de hasta **100** productos; una entrada por campo y producto que cambie sus condiciones **efectivas**, todas con el mismo `batchId`, y ninguna si no cambian; con `freeShipping: true` y digitales seleccionados rechaza con `digital-products` y la lista de ids y nombres, **sin aplicar nada**
- [ ] T065 [P] [US3] Pruebas de `AddToSection` y `RemoveFromSection` en `libs/application/src/use-cases/sections/sections.spec.ts`: rechaza productos archivados o inexistentes; con 35 en Destacados, agregar 8 rechaza todo con `remaining: 5`
- [ ] T066 [P] [US3] Atomicidad de `setSaleConditions` con su bitácora en `apps/functions/src/storefront/sale-conditions.integration.spec.ts`, en ambos sentidos, y con un lote de 20: si falla una entrada, ningún producto cambia
- [ ] T067 [P] [US3] Pruebas de permisos en `apps/functions/src/sections/callables.spec.ts` (`addToSection`, `removeFromSection` exigen `catalog.write`) y el caso de `setSaleConditions` en `apps/functions/src/storefront/callables.spec.ts`: el rol de Catálogo recibe `permission-denied` **y queda el evento de seguridad** (FR-003, SC-002); más sus casos en `libs/application/src/use-cases/authorization.spec.ts`

### `ArchiveProduct` de la 001: la única parte que toca código ya en uso

- [ ] T068 [US3] Pruebas nuevas de `ArchiveProduct` en el bloque `archivado` de `libs/application/src/use-cases/catalog.spec.ts`: archivar un producto que está en Destacados y en Ofertas lo saca de **las dos** listas **en la misma transacción** que lo archiva; archivar uno que no está en ninguna **no escribe** el documento de secciones; archivar uno ya archivado no cambia nada
- [ ] T069 [P] [US3] Atomicidad del archivado en `apps/functions/src/catalog/archive.integration.spec.ts`, contra el emulador: con fallo inyectado al guardar el documento de secciones, el producto **no** queda archivado; con fallo al guardar el producto, las secciones **no** cambian

### Pruebas del tope concurrente

- [ ] T070 [P] [US3] **Tope de secciones bajo concurrencia** en `apps/functions/src/sections/concurrency.integration.spec.ts`, contra el emulador y con la `UnitOfWork` real: con Ofertas en **39 de 40**, dos `addToSection` simultáneos de productos distintos → exactamente uno se confirma y el otro se rechaza **entero** con `section-full` y `remaining: 0`, sin escribir nada; la lista final tiene 40. Segundo caso: con **38**, uno agrega 1 y otro agrega 2 a la vez → la lista nunca pasa de 40, y la operación rechazada no dejó ninguno de sus productos (SC-011)

### Implementación de la Historia 3

- [ ] T071 [P] [US3] `MAX_SECTION_PRODUCTS = 40`, `addToSection`, `removeFromSection` y `SectionFullError` en `libs/domain/src/services/sections.ts` hasta que T063 pase
- [ ] T072 [US3] Puerto `FeaturedSectionsRepository` en `libs/application/src/ports/`, con su doble en `libs/application/src/use-cases/testing/fixture.ts`, y su adaptador en `libs/infrastructure/src/firestore/repositories/sections.repository.ts` (listas vacías si el documento no existe), conectado en `unit-of-work.ts`
- [ ] T073 [US3] `AddToSection` y `RemoveFromSection` en `libs/application/src/use-cases/sections/` hasta que T065 pase
- [ ] T074 [US3] `SetSaleConditions` en `libs/application/src/use-cases/storefront/set-sale-conditions.ts`, con `saleConditionChanges` y `buildAuditEntries`, hasta que T064 pase
- [ ] T075 [US3] **Modificar `ArchiveProduct`** en `libs/application/src/use-cases/archive.ts`: lee el documento de secciones **antes de escribir** —regla de la `UnitOfWork`— y saca el producto de las dos listas en la misma transacción, solo si figura en alguna, hasta que T068 y T069 pasen
- [ ] T076 [US3] Regresión de la 001 sobre el archivado, después de T075 y **sin modificar ninguna prueba existente**: correr y dejar en verde `libs/application/src/use-cases/catalog.spec.ts` (bloque `archivado`), `libs/application/src/use-cases/authorization.spec.ts`, `apps/functions/src/catalog/callables.spec.ts`, `apps/admin/src/app/catalog/product-editor/status-control/status-control.spec.ts` y los recorridos e2e de `apps/admin-e2e/src/product-editor.spec.ts`. Si alguna falla, se corrige `archive.ts`, no la prueba
- [ ] T077 [US3] Callables en `apps/functions/src/sections/callables.ts` (`addToSection`, `removeFromSection`) y `setSaleConditions` en `apps/functions/src/storefront/callables.ts`, con validadores en `bootstrap/parse.ts` y exportación en `apps/functions/src/index.ts`, hasta que T066, T067 y T070 pasen
- [ ] T078 [US3] Consultas y comandos: `watchSections` y el listado filtrado por sección con `documentId in` partido por `chunkIds` (40 ids → dos consultas) y combinado con `mergePages`, en `libs/infrastructure/src/client/firestore-catalog-queries.ts`; comandos en `callable-catalog-commands.ts`
- [ ] T079 [US3] Sección "Cómo se ofrece" del editor en `apps/admin/src/app/catalog/product-editor/presentation-section/`, insertada en `product-editor.html`: precio visible y envío gratis **en solo lectura** sin `variant.price.write` (FR-003); el envío gratis no se ofrece en un digital (FR-026); Destacados y Ofertas con su contador ("33 de 40") y el rechazo por sección completa. Con su `*.spec.ts`
- [ ] T080 [US3] El aviso de archivado en `apps/admin/src/app/catalog/product-editor/status-control/status-control.ts` dice de qué secciones sale el producto antes de confirmar (FR-028), con su caso en `status-control.spec.ts`
- [ ] T081 [US3] Listado en `apps/admin/src/app/catalog/product-list/product-list.ts`: filtro por sección con su contador y "quitar de la sección" (FR-027c); acciones masivas **separadas por permiso** —"Condiciones de venta" solo con `variant.price.write`, "Secciones" con `catalog.write`—; el rechazo `section-full` dice cuántos lugares quedan; el rechazo `digital-products` nombra los digitales y ofrece **"Quitar de la selección y reintentar"** en la misma pantalla (FR-029). Con sus casos en `product-list.spec.ts`
- [ ] T082 [US3] Recorrido e2e en `apps/admin-e2e/src/sections.spec.ts` con los pasos 1 a 6 de `quickstart.md`, Historia 3, con las dos cuentas

**Checkpoint**: la Historia 3 se valida sola, y las pruebas de la 001 sobre el archivado siguen en
verde sin haberse tocado.

---

## Phase 6: User Story 4 — Datos por variante e identificadores para catálogos externos (P4)

**Goal**: GTIN por variante reservado como el SKU, peso y dimensiones propios con herencia visible,
y MPN, rango de edad y género en el producto.

**Independent Test**: GTIN válido, inválido y repetido —también contra una variante archivada—;
quitar el GTIN de la archivada y reusarlo; peso propio en XL con las demás heredando; rango de edad
legible (`quickstart.md`, Historia 4).

### Pruebas de la Historia 4 (ANTES de implementar) ⚠️

- [ ] T083 [P] [US4] Pruebas de `Gtin` en `libs/domain/src/value-objects/gtin.spec.ts` con vectores GS1: acepta **8, 12, 13 o 14 dígitos** con dígito de control correcto; rechaza otra longitud o un dígito de control incorrecto; un UPC-A de 12 y su forma de 13 con cero inicial se normalizan al mismo valor de 14
- [ ] T084 [P] [US4] Reserva de GTIN en `libs/infrastructure/src/firestore/gtin-index.integration.spec.ts`, contra el emulador: dos transacciones reservan el mismo GTIN a la vez y solo una confirma; el GTIN de una variante archivada **sigue reservado**; `release` lo libera
- [ ] T085 [P] [US4] Pruebas de los casos de uso en `libs/application/src/use-cases/storefront/variant-data.spec.ts`: `SetVariantGtin` rechaza un GTIN de otra variante, **archivada o no**, nombrando el producto y si está archivado; quitar el GTIN de una variante **archivada** lo libera; `SetVariantShipping` solo en físicos, `null` vuelve a heredar, y recalcula `missingShippingData`; `UpdateProductDetails` acepta `mpn` ≤ 70 y rechaza 71, y solo los valores cerrados de `ageGroup` y `gender`
- [ ] T086 [P] [US4] Pruebas de permisos en `apps/functions/src/storefront/callables.spec.ts` (`setVariantGtin` y `setVariantShipping` exigen `catalog.write`) y sus casos en `libs/application/src/use-cases/authorization.spec.ts`

### Implementación de la Historia 4

- [ ] T087 [P] [US4] Value object `Gtin` en `libs/domain/src/value-objects/gtin.ts` hasta que T083 pase
- [ ] T088 [US4] Puerto `GtinIndexRepository` en `libs/application/src/ports/`, con su doble en `libs/application/src/use-cases/testing/fixture.ts`, y su adaptador en `libs/infrastructure/src/firestore/repositories/gtin-index.repository.ts` (`reserve` con `tx.create`; sin campo `archived`: archivar no libera), conectado en `unit-of-work.ts`, hasta que T084 pase
- [ ] T089 [US4] `SetVariantGtin` y `SetVariantShipping` en `libs/application/src/use-cases/storefront/`, y los campos `mpn`, `ageGroup` y `gender` en `UpdateProductDetails` (`libs/application/src/use-cases/update-product-details.ts`), hasta que T085 pase
- [ ] T090 [US4] Callables `setVariantGtin` y `setVariantShipping` en `apps/functions/src/storefront/callables.ts`, con validadores en `bootstrap/parse.ts` y exportación en `apps/functions/src/index.ts`, y sus comandos en `libs/infrastructure/src/client/callable-catalog-commands.ts`, hasta que T086 pase
- [ ] T091 [US4] Tabla de variantes en `apps/admin/src/app/catalog/variant-table/`: columna GTIN con el rechazo que nombra el producto; peso y dimensiones propios, con el valor **heredado** del producto señalado como tal; nada de eso en un producto digital (FR-015). Con sus casos en `variant-table.spec.ts`
- [ ] T092 [US4] Sección "Catálogos externos" en `apps/admin/src/app/catalog/product-editor/external-catalogs-section/`, insertada en `product-editor.html`: MPN, género y rango de edad presentado como **"0 a 3 meses", "3 a 12 meses", "1 a 5 años", "5 a 13 años" y "Adulto"**, guardado como `newborn` … `adult` (FR-031). Con su `*.spec.ts`
- [ ] T093 [US4] Recorrido e2e en `apps/admin-e2e/src/variant-data.spec.ts` con los pasos 1 a 4 de `quickstart.md`, Historia 4

**Checkpoint**: las cuatro historias completas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T094 [P] SC-006 en `apps/admin-e2e/src/performance.spec.ts`: con 10.000 variantes y 300 categorías sembradas, el 95% de los filtros por categoría, etiqueta y marca bajo 1 s. ⚠️ Ese archivo llega con el PR #19 de la 001: esta rama sale de `main` sin él, así que antes hay que rebasar sobre `main` con el #19 mergeado
- [ ] T095 [P] SC-007 en `apps/functions/src/storefront/bulk.integration.spec.ts`: `assignCategory` y `setSaleConditions` sobre **100** productos terminan en menos de 10 s, o no aplican nada
- [ ] T096 [P] Revisión WCAG 2.2 AA con axe de las vistas nuevas (editor del árbol y secciones nuevas del editor) en `apps/admin-e2e/src/a11y.spec.ts`
- [ ] T097 [P] Estados de carga sin saltos (esqueleto, error con reintento, vacío y CLS bajo 0,01) del editor del árbol y de las secciones nuevas en `apps/admin-e2e/src/loading-states.spec.ts`
- [ ] T098 [P] 360 px sin desplazamiento horizontal y objetivos táctiles de al menos 44 px en las vistas nuevas en `apps/admin-e2e/src/mobile.spec.ts`
- [ ] T099 [P] Mover y reordenar categorías **solo con teclado**, con sus anuncios, en `apps/admin-e2e/src/keyboard.spec.ts` (WCAG 2.5.7: toda operación de arrastre tiene alternativa sin arrastre)
- [ ] T100 Actualizar `docs/authorization.md` con las condiciones de venta bajo `variant.price.write` y las reglas de `storefront` y `slugIndex`. ⚠️ El archivo también llega con el PR #19
- [ ] T101 Recorrer `quickstart.md` de punta a punta y corregir lo que no coincida
- [ ] T102 Regresión completa de la 001, sin pruebas modificadas para que pasen: `npx nx run-many -t lint,typecheck,test`, las reglas de `tests/rules/` (casos 1 a 34), la integración (`npm run test:infrastructure`, `test:functions`, `test:tools`) y los recorridos de `apps/admin-e2e/src/`, todo en verde

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias. T001 debe estar antes de la Fase 4
- **Foundational (Fase 2)**: depende de la Fase 1 — **bloquea todas las historias**
- **US1 (Fase 3)**: depende de la Fase 2
- **US2 (Fase 4)**: depende de la Fase 2. No usa nada de la US1
- **US3 (Fase 5)**: depende de la Fase 2 (usa `chunkIds` y `mergePages` de T016 y `saleConditionChanges` de T014).
- **US4 (Fase 6)**: depende de la Fase 2 (usa `shipping-data.ts` de T015). Toca `update-product-details.ts` y `callables.ts` de `storefront`, que la US1 también toca: si se hacen en paralelo, coordinar esos dos archivos
- **Polish (Fase 7)**: T094 y T100 dependen además de rebasar sobre `main` con el PR #19

### Orden dentro de cada historia

Pruebas primero, comprobando que fallan → dominio → puertos y adaptadores → casos de uso →
callables → consultas del panel → interfaz → e2e. Las pruebas contra el emulador de los cinco puntos
pedidos (T024, T049, T050, T070 y T068 a T069) van **antes** del adaptador o del caso de uso que
verifican.

### Archivos compartidos entre tareas (por eso no llevan [P])

- `apps/admin/src/app/catalog/product-editor/product-editor.html`: T038, T039, T060, T079, T092
- `apps/admin/src/app/catalog/product-list/product-list.ts`: T041, T061, T081
- `libs/application/src/use-cases/testing/fixture.ts` y `libs/application/src/ports/`: T030, T053, T072, T088
- `libs/infrastructure/src/firestore/unit-of-work.ts`: T031, T054, T072, T088
- `apps/functions/src/index.ts` y `apps/functions/src/bootstrap/parse.ts`: T035, T056, T077, T090
- `libs/application/src/use-cases/authorization.spec.ts`: T026, T047, T067, T086 (se marcan [P] porque en su fase cada una es la única que lo toca)
- `firestore.indexes.json`: T036 y T057 (fases distintas)

### Parallel Opportunities

- Fase 1: T002 y T003
- Fase 2: las pruebas T004 a T010 en paralelo; después T011, T012 y T013; después T015, T016 y T019 junto con T014 y T017
- US1: las pruebas T020 a T026 en paralelo; T027, T028 y T029 en paralelo; T036 en paralelo con el resto
- US2: las pruebas T044 a T050 en paralelo; T057 en paralelo con el resto
- US3: las pruebas T063 a T067, T069 y T070 en paralelo; T071 en paralelo con el resto
- US4: las pruebas T083 a T086 en paralelo; T087 en paralelo con el resto
- Polish: T094 a T099 en paralelo
- **Entre historias**: después de la Fase 2, US1 y US2 pueden avanzar en paralelo con equipo
  suficiente

---

## Parallel Example: User Story 2

```bash
# Primero, las pruebas (deben fallar):
Task: "T044 Pruebas del árbol en libs/domain/src/entities/category-tree.spec.ts"
Task: "T045 Pruebas de visibilidad efectiva en libs/domain/src/services/effective-visibility.spec.ts"
Task: "T049 Filtro por una rama de 41 categorías en libs/infrastructure/src/client/category-filter.integration.spec.ts"
Task: "T050 Poda convergente en apps/functions/src/categories/prune.integration.spec.ts"

# Después, el dominio y en paralelo con todo lo demás, el índice:
Task: "T051 CategoryTree y sus operaciones en libs/domain/src/entities/category-tree.ts"
Task: "T057 Índice de categoryIds en firestore.indexes.json"
```

---

## Implementation Strategy

### MVP primero (solo Historia 1)

1. Fase 1: Setup
2. Fase 2: Foundational (bloquea todo)
3. Fase 3: Historia 1, con la migración de T042
4. **PARAR Y VALIDAR** con `quickstart.md`, Historia 1
5. Desplegar: cada producto ya tiene URL amigable, ficha para buscadores y tipo

### Entrega incremental

1. Setup + Foundational → base lista
2. Historia 1 → validar → **MVP**: ficha de tienda
3. Historia 2 → validar → categorías
4. Historia 3 → validar → condiciones de venta y secciones
5. Historia 4 → validar → GTIN y catálogos externos

---

## Notes

- Las tareas marcadas [P] tocan archivos distintos y no dependen de una tarea pendiente
- Verificar que las pruebas **fallan** antes de implementar lo que verifican
- Confirmar después de cada tarea o grupo lógico
- Las cinco compuertas de CI de la 001 rigen sin cambios; las pruebas nuevas entran en ellas
- SC-009 y SC-010 del spec son **objetivos de producto**: se verifican con pruebas de usuario y
  **no** bloquean el despliegue
