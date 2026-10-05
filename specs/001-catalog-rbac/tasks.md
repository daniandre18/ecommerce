---

description: "Task list for 001-catalog-rbac"
---

# Tasks: Gestión de Catálogo con Control de Acceso por Rol

**Input**: Design documents from `/specs/001-catalog-rbac/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: SÍ se incluyen. No son opcionales acá: el principio X de la constitución exige pruebas
automatizadas de aislamiento de permisos y del motor de precios como compuerta previa a producción.

**Organization**: agrupadas por historia de usuario. **La Historia 1 queda completa y verificable
antes de empezar la 2.** Dentro de cada historia, las pruebas de reglas de Firestore y del motor de
variantes van **antes** de la implementación que verifican.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1, US2, US3, US4 según `spec.md`
- Toda tarea lleva su ruta de archivo exacta

## Path Conventions

Monorepo Nx según `plan.md`:

- Dominio y aplicación: `libs/domain/src/`, `libs/application/src/`
- Infraestructura: `libs/infrastructure/src/`
- Entradas: `apps/admin/src/app/`, `apps/functions/src/`
- Reglas y pruebas de reglas: `firestore.rules`, `storage.rules`, `tests/rules/`
- Pruebas de dominio y aplicación: colocadas junto al archivo (`*.spec.ts`), corridas con Vitest

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicializar el monorepo, fijar versiones y dejar las compuertas de CI operando desde
el primer commit.

- [X] T001 Crear el workspace Nx con las cuatro librerías de capa (`domain`, `application`, `infrastructure`, `ui`) y las apps `admin`, `admin-e2e`, `functions`, según el árbol de `plan.md`, en `nx.json` y `tsconfig.base.json` Ocho proyectos Nx: `domain`, `application`, `infrastructure`, `ui`, `admin`, `admin-e2e`, `functions` y `tools` (el sembrador). El empaquetado de `functions` para desplegar se arma con las primeras callable (T051)
- [X] T002 Fijar `"typescript": "~6.0.0"` en `package.json` — **Angular 22 exige `>=6.0 <6.1`**; la 7.x publicada como `latest` rompe el build
- [X] T003 [P] Configurar `@nx/enforce-module-boundaries` en `eslint.config.mjs` con las etiquetas `layer:domain` (no importa nada del repo), `layer:application` (solo `layer:domain`), `layer:infrastructure` (application + domain), `layer:presentation` (todas)
- [X] T004 [P] Configurar Vitest 5 como runner de `domain` y `application` en `libs/domain/vite.config.ts` y `libs/application/vite.config.ts`
- [X] T005 [P] Configurar ESLint y Prettier en `eslint.config.mjs` y `.prettierrc`
- [X] T006 Crear la app Angular 22 `apps/admin` standalone y **zoneless** (`provideZonelessChangeDetection()` en `apps/admin/src/app/app.config.ts`), sin `zone.js` en polyfills y sin la dependencia instalada **Nota de implementación**: en Angular 22 zoneless es el comportamiento por defecto y el CLI ya no genera `provideZonelessChangeDetection()`; alcanza con no instalar `zone.js` (verificado: `npm ls zone.js` vacío). Nx ejecuta el builder `@angular/build:application` directamente, sin `@nx/angular`. Bundle inicial: 54 kB transferidos
- [X] T007 [P] Instalar Angular Material + CDK 22.2 y definir el tema en `apps/admin/src/styles.scss` Material 22 ya no requiere `@angular/animations`. Tipografía del sistema en lugar de fuente web (principio VIII)
- [X] T008 [P] Crear `firebase.json`, `.firebaserc` y la configuración de Emulator Suite (Auth, Firestore, Functions, Storage) en la raíz del repositorio
- [X] T009 [P] Configurar Playwright en `apps/admin-e2e/playwright.config.ts` apuntando a los emuladores Dos perfiles: escritorio y móvil a 360 px (FR-038). Levanta los emuladores y la app por su cuenta. `gracefulShutdown` en el emulador: sin él, el proceso Java queda huérfano en el puerto 8080 y la corrida siguiente no arranca. Primer recorrido: accesibilidad del shell con teclado real, verificado por mutación. Aún no es una compuerta de CI: se suma con la revisión WCAG automatizada de T089
- [X] T010 Crear el pipeline de CI en `.github/workflows/ci.yml` con **cuatro compuertas bloqueantes**: `rules:test`, `domain:test`, `functions:test` y `lint` (frontera de capas). El merge se rechaza si cualquiera falla, sin excepción por plazos **Implementado con cinco compuertas**: `lint` (vía Nx, o la frontera se salta en silencio), `typecheck` (Vitest no chequea tipos), `unit`, `rules` e `integration`. `functions:test` se suma a `integration` cuando exista `apps/functions` (T051). ⚠️ Solo bloquea el merge si los cinco trabajos se marcan como *required status checks* en la protección de la rama
- [X] T011 [P] Crear el esqueleto del sembrador de datos en `tools/seed/src/main.ts` Implementado en `tools/seed/src/` (proyecto Nx `tools`, objetivo `seed`), ejecutado con `tsx`

**Checkpoint**: el repositorio compila, el lint de capas corre y CI bloquea.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: primitivas de dominio, reglas base e infraestructura transaccional de las que dependen
**todas** las historias.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

### Pruebas primero (motor y reglas base)

- [X] T012 [P] Pruebas de `Money` en `libs/domain/src/value-objects/money.spec.ts`: el importe es **entero en la unidad mínima de la moneda**, nunca punto flotante; rechaza decimales; la moneda se toma del inquilino
- [X] T013 [P] Pruebas de `normalizeSku` en `libs/domain/src/value-objects/sku.spec.ts`: normaliza a **mayúsculas y sin espacios al borde**, de modo que `abc-1` y `ABC-1` colisionen; la forma original se conserva aparte
- [X] T014 [P] Pruebas de `StockLevel` en `libs/domain/src/value-objects/stock-level.spec.ts`: `{ kind: 'undefined' }` y `{ kind: 'quantity'; value: 0 }` son **estados distintos** (FR-029)
- [X] T015 Pruebas de reglas de aislamiento en `tests/rules/isolation.spec.ts` — casos **1 a 7** de `contracts/firestore-rules.md`: miembro activo lee lo suyo; sin membresía se deniega aun conociendo el id exacto; consulta de colección ajena denegada; sin autenticar denegado; `status: 'invited'` denegado. Incluir además el caso de **identidad autenticada sin ninguna membresía** —la forma que toma el operador de la plataforma— contra `products`, `variants`, `private/costs`, `config/*` y `auditLog` (FR-041, SC-013)
- [X] T016 [P] Pruebas de inmutabilidad de bitácora en `tests/rules/audit-immutability.spec.ts` — casos **30, 31 y 32**: ni el Propietario puede actualizar, borrar ni crear entradas a mano
- [X] T017 [P] Pruebas de denegación de escritura desde cliente en `tests/rules/no-client-writes.spec.ts` — casos **24, 25 y 27**: ni colaborador ni Propietario escriben directo en `products` ni en `variants`

### Implementación de la base

- [X] T018 [P] Value objects `TenantId`, `Uid`, `RoleId`, `ProductId`, `VariantId`, `Sku`, `Money`, `StockLevel` en `libs/domain/src/value-objects/`
- [X] T019 [P] Enumerado `Permission` en `libs/domain/src/value-objects/permission.ts` con exactamente estos valores: `catalog.read`, `catalog.write`, `variant.stock.write`, `variant.price.write`, `variant.cost.read`, `variant.cost.write`, `audit.read`, `team.read`. **Los permisos sobre credenciales, facturación y administración de roles NO son valores del enumerado** (FR-014): no pueden concederse porque no existen como concesión
- [X] T020 [P] Entidades `Tenant`, `Membership` y `Role` en `libs/domain/src/entities/`, con `Membership.status: 'invited' | 'active' | 'disabled'` e `isOwner` denormalizado
- [X] T021 [P] Entidad `AuditEntry` en `libs/domain/src/entities/audit-entry.ts` como **unión etiquetada** por `AuditEventType`: `price.changed`, `stock.adjusted`, `role.changed`, `platform.action`, con `before`/`after` tipados por caso (FR-031)
- [X] T022 Escribir `firestore.rules` con las funciones `member()`, `isActiveMember()`, `isOwnerOf()` y `hasPermission()`, **una lista explícita de colecciones legibles** bajo `/tenants/{tenantId}`, lectura de `auditLog`, `config` y `securityEvents` solo para el Propietario, y **ninguna concesión de escritura**. **Sin comodín `{document=**}` bajo el inquilino**: Firestore combina las reglas con OR sin importar el orden, así que un comodín con lectura para miembros se superpone con las rutas del Propietario
- [X] T023 [P] Escribir `storage.rules` con lectura condicionada a membresía vía `firestore.exists()` y `allow write: if false` (subida solo por URL firmada)
- [X] T024 [P] Definir los puertos en `libs/application/src/ports/`: `VariantCostsRepository`, `AuditLogRepository` (**sin métodos `update` ni `delete`**, FR-032) y `AuditLogQuery` por separado, `MembershipRepository`, `RoleRepository`, `UnitOfWork`, `AuthorizationService` (recibe el `TransactionScope` para leer membresía y rol dentro de la transacción), `SecurityEventRecorder`, `Clock`, `IdGenerator`. **Re-secuenciado al implementar**: `ProductRepository`, `VariantRepository` y `SkuIndexRepository` dependen de las entidades de T039–T040, así que se definen en T044 y T045 junto con sus adaptadores
- [X] T025 Implementar el `UnitOfWork` transaccional de Firestore en `libs/infrastructure/src/firestore/unit-of-work.ts`: todo lo que ocurre dentro de `run()` se confirma junto o no ocurre
- [X] T026 Implementar `AuthorizationService` en `libs/infrastructure/src/firestore/authorization.service.ts`: lee membresía y rol **dentro de la transacción**, default-deny, lanza `PermissionDeniedError` salvo concesión explícita **Implementado en `libs/application/src/services/authorization.service.ts`, no en infraestructura**: no usa Firebase, solo puertos, y así se prueba sin emulador (14 pruebas)
- [X] T027 Implementar el adaptador `AuditLogRepository` en `libs/infrastructure/src/firestore/audit-log.repository.ts` (solo `append` y `query`) **La consulta paginada se implementa en T084**: `AuditLogQuery` quedó separado de `AuditLogRepository` porque corre fuera de transacciones. Acá, solo `append`, con `create` para que ninguna entrada se sobrescriba
- [X] T028 Crear la guarda común de las callable en `apps/functions/src/bootstrap/guard.ts`: `request.auth` → App Check (`enforceAppCheck: true`) → `tenantId` en la carga útil → **membresía activa verificada dentro de la transacción** → permiso del rol. El `tenantId` del cliente se verifica, nunca se confía (FR-003) Implementado como `guarded(request, { operation, requires }, deps, work)` con 12 pruebas sin emulador, verificadas por mutación. Distingue `cross-tenant-access` de `permission-denied` con la subclase `NotAMemberError` (FR-004), y las dos denegaciones devuelven el mismo mensaje para no revelar si el comercio existe. Esto cubre en buena parte lo que pedía la MEDIUM G4 de `/speckit-analyze`, aunque con dobles y no contra el emulador
- [X] T029 [P] Implementar `SecurityEventRecorder` en `libs/infrastructure/src/firestore/security-event.recorder.ts` para los intentos denegados **que atraviesan la capa de servicios** (FR-004) ⚠️ Implementado pero **sin prueba propia**: su verificación era el hallazgo G4 de `/speckit-analyze`, que quedó fuera del alcance aprobado
- [X] T030 [P] Crear las primitivas compartidas de interfaz en `libs/ui/src/lib/states/`: `SkeletonComponent` (reserva el espacio del contenido final), `ErrorStateComponent` (con reintento) y `EmptyStateComponent` (con acción de creación). Se crean acá para que las historias 1 a 3 las usen desde el principio en vez de reacondicionarlas en la 4 Implementado como `Skeleton`, `ErrorState` y `EmptyState` (sin sufijo `Component`, según la guía de Angular 22), con 13 pruebas. El `input` se llama `heading` y no `title`, que choca con la propiedad del DOM. La acción de `EmptyState` se proyecta, porque puede ser botón o enlace
- [X] T031 Sembrar los datos de prueba en `tools/seed/src/main.ts`: comercios `t1` y `t2`, `owner@t1.test`, `owner@t2.test`, `catalogo@t1.test` con el rol predefinido, y **`multi@test` con membresía en ambos** (Propietaria en `t1`, colaboradora en `t2`) **Escenario corregido al implementar**: la versión escrita ponía dos Propietarios en `t1`, contra FR-011. Quedó `t1` → `owner@t1.test` (Propietaria), `catalogo@t1.test` y `multi@test` (Catálogo); `t2` → `multi@test` (Propietaria). Sale `owner@t2.test`. Idempotente, con salvaguarda que se niega a correr fuera de emuladores `demo-*`, y 6 pruebas contra los emuladores de Auth y Firestore

**Checkpoint**: base lista. Las historias pueden empezar.

---

## Phase 3: User Story 1 — El Propietario construye su catálogo con variantes (P1) 🎯 MVP

**Goal**: un Propietario carga su catálogo con opciones de variación incrementales, SKU, importes,
existencias e imágenes, y cada cambio de precio o stock deja su entrada de bitácora.

**Independent Test**: con un único Propietario y un único comercio, crear productos con y sin
variaciones, construir opciones de a una, asignar SKU y verificar que cada cambio de precio o
existencias produce su registro. Entrega valor por sí sola.

### Pruebas del motor de variantes (ANTES de implementarlo) ⚠️

> Escribir estas pruebas primero y verificar que **fallan** antes de implementar.

- [X] T032 [P] [US1] Pruebas de `generateCombinations` en `libs/domain/src/services/generate-combinations.spec.ts`: producto cartesiano de los valores; producto sin opciones → **una variante implícita** con `optionValues: {}` (FR-020)
- [X] T033 [P] [US1] Pruebas de `validateOptionLimits` en `libs/domain/src/services/validate-option-limits.spec.ts`: **máximo 5 atributos de variación y 100 combinaciones**; el sexto atributo se rechaza; la combinatoria que supere 100 se rechaza **antes de crear nada**, informando cuántas produciría (FR-025)
- [X] T033a [P] [US1] Pruebas de `validateOptionStructure` en `libs/domain/src/services/validate-option-structure.spec.ts` (FR-022): rechaza dos valores con la misma etiqueta dentro de una opción —incluida la coincidencia ignorando mayúsculas y espacios al borde, de modo que "Rojo", "rojo" y " Rojo " colisionen—; rechaza dos opciones con el mismo nombre dentro del producto; y garantiza que no queden dos variantes con la misma combinación de valores También rechaza una opción sin valores (daría cero variantes, contra FR-020) y nombres o etiquetas vacíos. Las formas Unicode compuesta y descompuesta se comparan como iguales
- [X] T034 [US1] Pruebas de `reconcileVariants` en `libs/domain/src/services/reconcile-variants.spec.ts` — el caso más denso de la feature (FR-024): al agregar un atributo a un producto con variantes cargadas, las existentes **conservan SKU, precio, precio comparativo, costo, stock e imágenes**; las combinaciones nuevas nacen **sin precio y sin existencias definidas —`{ kind: 'undefined' }`, NO en cero** (FR-029); faltar una asignación devuelve la lista de variantes sin asignar; renombrar una opción o un valor **no** regenera ni archiva variantes (FR-026); quitar un valor en uso archiva sus variantes 17 pruebas, incluida la fusión al quitar una opción entera, que es el caso borde del spec que ninguna tarea cubría
- [X] T035 [P] [US1] Pruebas de `canChangeStatus` en `libs/domain/src/services/can-change-status.spec.ts`: `active` y `unlisted` exigen `hasIncompleteVariants === false`; `draft` siempre permitido; `archived` es **ortogonal** al estado (FR-023a) La firma pasó a `canChangeStatus(variants, target)`: sin el producto, la regla no puede apoyarse en la caché `hasIncompleteVariants`
- [X] T036 [P] [US1] Pruebas de `buildAuditEntries` en `libs/domain/src/services/build-audit-entries.spec.ts`: una entrada **por variante** con el mismo `batchId`, tipo de evento correcto, y el nombre del actor copiado al momento del hecho (FR-030, FR-031)

### Pruebas de reglas de esta historia (ANTES de la implementación) ⚠️

- [X] T037 [P] [US1] Pruebas de lectura de catálogo en `tests/rules/catalog-read.spec.ts`: un miembro activo lee `products` y `variants` de su comercio; el documento de la variante **no contiene** el campo de costo (caso **19**) Cubre también las consultas de listado (las reglas las evalúan aparte), la invitación sin aceptar y el corte inmediato por baja (FR-008a). Que el código nunca escriba el costo en la variante lo prueba la integración de infraestructura, donde escribe el adaptador real. Verificado por mutación
- [X] T038 [P] [US1] Pruebas de atomicidad de bitácora en `apps/functions/src/pricing/atomicity.integration.spec.ts` — **en ambos sentidos** (FR-030, FR-033): inyectar fallo al escribir la bitácora y comprobar que el precio no cambia; inyectar fallo al escribir la variante y comprobar que **no queda entrada** de ese cambio Las fallas son de Firestore al confirmar, no excepciones previas: una entrada con id ya usado (sentido 1) y la variante confirmada junto a una actualización de un documento inexistente (sentido 2). Verificado por mutación: con la bitácora o la variante escritas fuera de la transacción, las pruebas caen

### Implementación de la Historia 1

- [X] T039 [P] [US1] Entidad `Product` en `libs/domain/src/entities/product.ts` con `options` (máximo 5), `status: 'draft' | 'active' | 'unlisted'`, `archived` independiente del estado, `variantCount` (≤ 100), `hasIncompleteVariants`, `nameNormalized` y `version`
- [X] T040 [P] [US1] Entidad `Variant` en `libs/domain/src/entities/variant.ts` con `sku`, `price`, `compareAtPrice`, `stock`, `images`, `complete` (derivado de `sku !== null`), `archived` y `version`. **Sin campo de costo**: el costo vive en otro documento (FR-015) `complete` se calcula con `isVariantComplete()` en lugar de guardarse, para que no pueda contradecir al SKU
- [X] T041 [US1] Implementar `generateCombinations` y `validateOptionLimits` en `libs/domain/src/services/` hasta que T032 y T033 pasen
- [X] T042 [US1] Implementar `reconcileVariants` en `libs/domain/src/services/reconcile-variants.ts` hasta que T034 pase Firma con objeto con nombre y `previousOptions` explícito (hace falta para decidir quién sobrevive a una fusión). Devuelve un `Result`: si faltan asignaciones, error sin resultados parciales. Suma `discarded` para las variantes sin datos. Verificado por mutación
- [X] T043 [P] [US1] Implementar `canChangeStatus`, `normalizeSku` y `normalizeName` en `libs/domain/src/services/` `normalizeName` con prueba propia, que la tarea no pedía
- [X] T043a [US1] Implementar `validateOptionStructure` en `libs/domain/src/services/validate-option-structure.ts` hasta que T033a pase
- [X] T044 [P] [US1] Puertos `ProductRepository` y `VariantRepository` en `libs/application/src/ports/` (agregarlos a `TransactionScope`) y sus adaptadores en `libs/infrastructure/src/firestore/` Los repositorios no comparan versiones: Firestore exige lecturas antes que escrituras dentro de la transacción, así que la versión se compara al cargar (`assertVersion`). `updateVariantSummary` actualiza la caché del producto sin incrementar su versión
- [X] T045 [US1] Puerto `SkuIndexRepository` en `libs/application/src/ports/` y su adaptador en `libs/infrastructure/src/firestore/sku-index.repository.ts`: id del documento = **SKU normalizado** bajo `tenants/{tid}/skuIndex/{SKU}`, creado con `tx.create` en la misma transacción que la variante para que la colisión falle de forma atómica; `release()` solo marca `archived: true`, **nunca borra** (FR-021, FR-023) Implementado en `repositories/catalog.repositories.ts`, junto a los demás adaptadores de catálogo. Cambiar el SKU de una variante viva libera el anterior; el de una archivada queda reservado
- [X] T046 [P] [US1] Adaptador `VariantCostsRepository` en `libs/infrastructure/src/firestore/variant-costs.repository.ts` sobre `products/{pid}/private/costs`, **un documento por producto** con el mapa `{ [variantId]: Money }` En `repositories/variant-costs.repository.ts`, separado en el refactor preparatorio
- [X] T047 [P] [US1] Casos de uso `CreateProduct` y `UpdateProductDetails` en `libs/application/src/use-cases/` `CreateProduct` es idempotente: el id del producto ES el `requestId`
- [X] T048 [US1] Caso de uso `SetProductOptions` en `libs/application/src/use-cases/set-product-options.ts`: invoca `validateOptionStructure` y `validateOptionLimits` **antes** de generar combinaciones, y después `reconcileVariants` Los ids de opciones y valores nuevos los propone el cliente: las asignaciones de la misma llamada tienen que poder referirse a ellos. Las variantes que no cambian no se reescriben, para no provocar conflictos de versión espurios
- [X] T049 [P] [US1] Casos de uso `SetVariantSku`, `SetProductStatus`, `ArchiveProduct` y `ArchiveVariant` en `libs/application/src/use-cases/` `ArchiveVariant` rechaza archivar la última variante en circulación: para eso se archiva el producto
- [X] T050 [US1] Casos de uso `SetVariantPrice`, `SetVariantCost` y `SetVariantStock` en `libs/application/src/use-cases/`: escriben el cambio **y** su entrada de bitácora en una sola transacción; una acción masiva produce **una entrada por variante** y **no se aplica parcialmente** (FR-030) Cada caso de uso declara su permiso (`static readonly requires`). Un valor que no cambia no genera entrada ni escritura. Probado contra Firestore: si la entrada de bitácora no puede crearse, el precio no cambia
- [X] T051 [P] [US1] Callables de catálogo en `apps/functions/src/catalog/`: `createProduct`, `updateProductDetails`, `setProductOptions`, `setProductStatus`, `setVariantSku`, `archiveProduct`, `archiveVariant` Cada callable es su caso de uso detrás de la guarda (`bootstrap/callable.ts`): la clase declara el permiso, `bootstrap/parse.ts` convierte el JSON en tipos de dominio y la entrada se valida después de autorizar. Empaquetado con esbuild en `dist/apps/functions` (`functions:build`), probado en el emulador de Functions. ⚠️ Región `us-central1` provisional en `src/index.ts`: tiene que coincidir con la ubicación de Firestore del proyecto real
- [X] T052 [US1] Callables de importes en `apps/functions/src/pricing/`: `setVariantPrice`, `setVariantCost`, `setVariantStock`, con los códigos de error del contrato (`sku-conflict`, `version-conflict`, `limit-exceeded`, `incomplete-variants`, `audit-write-failed`) `audit-write-failed` es cualquier falla no prevista de una transacción con bitácora: como cambio y entrada se confirman juntos, garantiza que no se aplicó nada
- [X] T053 [P] [US1] Índices compuestos en `firestore.indexes.json` para el listado de catálogo: `(status, updatedAt desc)`, `(archived, updatedAt desc)` y `(nameNormalized asc)` para búsqueda por prefijo El listado siempre filtra `archived == false`, así que los tres empiezan por `archived`: `(archived, updatedAt desc)`, `(archived, status, updatedAt desc)` y `(archived, nameNormalized)`. El emulador no exige índices: se validan al desplegar
- [X] T054 [P] [US1] Vista de listado de catálogo en `apps/admin/src/app/catalog/product-list/`, con esqueleto, estado de error y estado de vacío desde `libs/ui`; **no lee variantes** (se leen al abrir el producto) Con búsqueda por prefijo, filtro por estado y "cargar más", en tiempo real. Trajo lo que la Historia 1 necesitaba y ninguna tarea cubría: inicio de sesión, guarda de sesión, entrada al comercio **por código** (la lista de comercios de la cuenta llega con T075, porque exige guardar `uid` en la membresía y una regla de grupo de colecciones), y los puertos del panel (`CatalogQueries`, `CatalogCommands`, `Session`) con sus adaptadores del SDK web. El documento del comercio pasa a ser legible por sus miembros activos (caso 35). En los emuladores, App Check usa un token local sin firmar que el emulador de Functions acepta: la guarda no tiene excepción para el emulador. ⚠️ El paquete inicial pesa 858 kB (220 kB comprimido), sobre el presupuesto de 500 kB: cargar en diferido los SDK de Firestore y Functions queda para SC-009 (Historia 4)
- [X] T055 [US1] Editor de producto en `apps/admin/src/app/catalog/product-editor/` con Signal Forms: agregar opciones **de a una** con nombre libre, y agregar, reordenar, renombrar y quitar valores (FR-017) Antes de enviar, el panel corre las reglas del dominio: estructura (FR-022), topes con la cifra que produciría (FR-025) y `reconcileVariants` como vista previa, que dice qué variantes con datos necesitan valor (abre T057) y cuáles se archivarían (pide confirmación, FR-026). Los valores se reordenan con botones, no solo con arrastre, para que funcione con teclado. El borrador no se pisa con cambios que llegan del servidor
- [X] T056 [US1] Tabla de variantes en `apps/admin/src/app/catalog/variant-table/`: una fila por combinación con imagen, SKU, precio, precio comparativo y existencias **editables en línea**; se regenera al cambiar las opciones (FR-018, FR-028) Cada campo se guarda solo al salir de él o con Enter, con la versión que dejó la orden anterior de la fila; lo guardado se anuncia por `LiveAnnouncer` (FR-038a). Importes con coma decimal en la unidad mínima, sin punto flotante; existencias vacías = "sin definir" (FR-029). Un SKU ocupado nombra la variante que lo usa (FR-021). Una versión vieja se avisa sin sobrescribir y sin perder lo escrito (FR-027, FR-039). A 360 px las filas son dos columnas: sin desplazamiento horizontal
- [X] T057 [US1] Flujo de asignación de FR-024 en `apps/admin/src/app/catalog/variant-table/assign-option-dialog/`: al agregar una opción a un producto con variantes cargadas, pedir el valor nuevo para **cada** variante existente antes de confirmar Con atajo "aplicar a todas" por opción. Lista exactamente las variantes que la reconciliación del dominio marca como faltantes
- [X] T058 [US1] Selección múltiple y edición masiva en `apps/admin/src/app/catalog/variant-table/bulk-edit/`: aplicar un mismo importe o cantidad a varias variantes en una acción (FR-028) Casilla por fila y "seleccionar todas"; la barra aplica precio, precio tachado o existencias a las seleccionadas en una sola orden, con la versión de cada una. El lote se aplica entero o no se aplica, y deja una entrada de bitácora por variante con el mismo `batchId` (verificado de punta a punta contra el emulador)
- [X] T059 [P] [US1] Indicador de variante incompleta y bloqueo de activación en `apps/admin/src/app/catalog/product-editor/status-control/`: pasar a `active` o `unlisted` con variantes incompletas muestra **cuáles** lo impiden (FR-023a) El panel usa `canChangeStatus` del dominio: dice qué variantes faltan antes de enviar, y el rechazo del servidor trae la misma lista si algo cambió en el medio. Suma "Archivar producto" con confirmación (FR-023): el caso de uso existía y ninguna pantalla lo ofrecía
- [X] T060 [P] [US1] Carga de imágenes por URL firmada en `apps/admin/src/app/catalog/image-upload/` y `apps/functions/src/catalog/create-upload-url.ts`, con `alt` obligatorio (FR-038a) ⚠️ **Cambio de decisión** (research.md §10): no hay URL firmada. Firmar exige una cuenta de servicio real y ese camino no se podía probar contra los emuladores. El panel sube directo a Storage y `storage.rules` exigen, del lado del servidor, membresía activa con `catalog.write`, tipo de imagen, hasta 5 MB y solo crear (12 pruebas de reglas, verificadas por mutación). La referencia con su texto alternativo sigue pasando solo por callable: `updateProductDetails` para el producto y la nueva `setVariantImages` para cada variante (FR-020: la variante implícita también acepta imagen). Formato o peso no admitido se avisa antes de subir; una subida interrumpida conserva lo elegido, y si se subió pero no se guardó, el reintento solo guarda
- [X] T061 [US1] Recorrido e2e de la Historia 1 en `apps/admin-e2e/src/catalog.spec.ts` siguiendo los pasos 1 a 9 de `quickstart.md` Repartido en `catalog.spec.ts` (paso 1, aislamiento y 360 px) y `product-editor.spec.ts` (pasos 2 a 9, imágenes incluidas; el paso 8 verifica la bitácora en el emulador): 22 recorridos en escritorio y a 360 px. En serie y con las callable calentadas (ver `playwright.config.ts`)

**Checkpoint**: la Historia 1 está **completa y verificable de forma independiente**. Es el MVP: un
comercio puede administrar su catálogo. **No empezar la Historia 2 antes de validar esta.**

---

## Phase 4: User Story 2 — El Propietario arma su equipo con permisos a medida (P2)

**Goal**: roles propios con permisos granulares, colaboradores ilimitados, cuentas en varios
comercios, y el costo invisible sin su permiso.

**Independent Test**: definir roles con distintas combinaciones de permisos sobre un comercio con
catálogo existente y verificar, para cada operación prohibida, que la denegación ocurre tanto en la
interfaz como cuando el intento la evita por completo.

### Pruebas de reglas de esta historia (ANTES de la implementación) ⚠️

- [X] T062 [US2] Pruebas de cuentas en varios comercios en `tests/rules/multi-tenant-accounts.spec.ts` — casos **8 a 14**: la misma cuenta lee en `t1` y en `t2`; ser Propietaria en `t1` **no** concede nada en `t2`; desactivar la membresía en `t2` **no** afecta `t1`; y la baja corta el acceso **en la solicitud siguiente**, sin esperar a que expire el token (FR-008, FR-008a) Además: el mismo contexto autenticado antes y después de la baja, para demostrar que no depende del token
- [X] T063 [P] [US2] Pruebas de costo en `tests/rules/variant-cost.spec.ts` — casos **15 a 19**: el rol de Catálogo no lee `private/costs`; un rol con `variant.price.write` pero sin `variant.cost.read` tampoco; con `variant.cost.read` sí; el Propietario sí Más dos: una membresía dada de baja con el permiso no lo lee, y el permiso de un comercio no alcanza el costo de otro. El caso 19 ya estaba en `catalog-read.spec.ts`
- [X] T064 [P] [US2] Pruebas de secretos y facturación en `tests/rules/owner-only.spec.ts` — casos **20 a 23**, incluido el **23**: un rol personalizado con **todos** los permisos concedibles sigue sin leer `config/secrets`, porque ningún permiso concedible alcanza (FR-014) El caso 23 toma la lista de `PERMISSIONS` del dominio: si mañana se agrega un permiso, la prueba lo cubre sola
- [X] T065 [P] [US2] Extender `tests/rules/member-cannot-read-owner-paths.spec.ts` (creado en la fase 2) con el caso **34** una vez que T068 agregue `hasPermission`: un miembro con rol que tiene `variant.price.write` pero no `variant.cost.read` sigue sin leer `private/costs`. **Nota**: la premisa original de esta tarea —"reordenar las reglas"— era falsa; en Firestore el orden no importa, importa la superposición. Ver `contracts/firestore-rules.md`
- [X] T066 [P] [US2] Pruebas de aislamiento de permisos en los casos de uso en `libs/application/src/use-cases/authorization.spec.ts`, con dobles de los puertos y sin emulador: cada caso de uso rechaza sin su permiso; `variant.price.write` y `variant.cost.write` son independientes entre sí y de `catalog.write` (FR-015) Matriz con lo que declara cada clase en `requires` y el servicio de autorización real. Verificado por mutación

### Implementación de la Historia 2

- [X] T067 [P] [US2] Entidad `Invitation` en `libs/domain/src/entities/invitation.ts` con `status: 'pending' | 'accepted' | 'expired' | 'revoked'` y **caducidad a los 14 días**. Hecho: `createInvitation` normaliza y valida el correo; `acceptInvitation`, `renewInvitation` y `revokeInvitation` con sus rechazos tipados (`InvalidInvitationError.reason`); `isExpired` compara contra `expiresAt`
- [X] T068 [US2] Extender en `firestore.rules` la regla de `products/{productId}/private/{docId}` —hoy solo `isOwnerOf`— con `|| hasPermission(tenantId, 'variant.cost.read')`, hasta que T063 y T065 pasen Verificado por mutación: con el permiso equivocado en la regla caen los casos 16, 17 y 34
- [X] T069 [P] [US2] Adaptadores `MembershipRepository` y `RoleRepository` en `libs/infrastructure/src/firestore/`. Hecho: `RoleRepository` ya existía de la Historia 1. Se agregaron `MembershipRepository.findByEmail`, `InvitationRepository` (`findPendingByEmail` sobre correo + `pending`) y `TenantRepository.save`, con prueba de integración en `team.integration.spec.ts`
- [X] T070 [P] [US2] Sembrar los roles predefinidos al crear el inquilino en `apps/functions/src/team/seed-preset-roles.ts`: `owner` (`editable: false`, indeleble) y `catalog` con exactamente `catalog.read`, `catalog.write`, `variant.stock.write` — **sin precios y sin costo** (FR-016). Hecho, en otro lugar: todavía no existe la operación de crear un comercio, así que los roles viven en el dominio como `presetRoles(tenantId, at)` y los usa el sembrador. Cuando exista el alta de comercio, la llamará en la misma transacción
- [X] T071 [US2] Casos de uso `CreateRole`, `UpdateRole` y `DeleteRole` en `libs/application/src/use-cases/`: un rol nace **con la lista de permisos vacía** (FR-009); no se elimina con `memberCount > 0` (FR-013); `updateRole` sobre `owner` se rechaza (FR-016); **todos escriben bitácora** con el conjunto anterior y el resultante (FR-031a). Hecho: `createRole` acepta además `copyFrom` (copia los permisos de otro rol); el nombre es único sin distinguir mayúsculas; `UpdateRole` rechaza permisos fuera del catálogo cerrado
- [X] T072 [US2] Casos de uso `InviteCollaborator` y `AcceptInvitation` en `libs/application/src/use-cases/`: si la persona ya tiene cuenta, se le **suma una membresía** en vez de crear otra cuenta (FR-005); sin tope de cantidad (FR-006); sin acceso hasta aceptar (FR-007). Hecho: el enlace es `{tenantId}/{invitationId}`; aceptar exige sesión (`requires: account`) y que su correo coincida con el invitado; reinvitar a un correo con invitación pendiente la renueva; quien estuvo de baja recupera su membresía con el rol nuevo
- [X] T073 [US2] Casos de uso `AssignRole`, `SetMembershipEnabled` y `TransferOwnership` en `libs/application/src/use-cases/`: la baja es **de la membresía en ese comercio**, no de la cuenta, y no toca Firebase Auth ni las otras membresías (FR-008a); el traspaso deja **exactamente un** Propietario antes y después (FR-011); los tres escriben bitácora. Hecho: ninguna de las tres opera sobre el Propietario salvo el traspaso; los contadores `memberCount` se ajustan en la misma transacción
- [X] T074 [P] [US2] Callables de equipo en `apps/functions/src/team/`: `inviteCollaborator`, `acceptInvitation`, `revokeInvitation`, `createRole`, `updateRole`, `deleteRole`, `assignRole`, `setMembershipEnabled`, `transferOwnership`. Hecho: `apps/functions/src/team/callables.ts`; `acceptInvitation` deduce el comercio del token antes de la guarda (`tenantFrom`)
- [X] T075 [US2] Selector de comercio activo en `apps/admin/src/app/tenant/tenant-switcher/` con rutas `/t/{tenantId}/…`: cambiar de comercio es **navegación**, sin refrescar el token Adelantada al cerrar la Historia 1, porque reemplaza la entrada por código. Al entrar: con un comercio, directo a su catálogo; con varios, se elige de la lista, y el encabezado ofrece "Cambiar de comercio". La membresía guarda su `uid` y una regla de grupo de colecciones deja a cada cuenta listar solo sus membresías (caso 36, verificado por mutación: sin la condición, un colaborador podría listar todo el equipo)
- [X] T076 [P] [US2] Vista de colaboradores e invitaciones en `apps/admin/src/app/team/members/`, con esqueleto y estados de error y vacío. Hecho: `apps/admin/src/app/team/team-page.ts` con tres secciones —personas, invitaciones y roles—, cada una con su esqueleto, su error con reintento y su vacío; solo se piden y se muestran al Propietario. No hay correo saliente: la invitación es un enlace que el Propietario copia, y el enlace `/invitation/{tenantId}/{invitationId}` exige sesión; quien no tiene cuenta la crea (`Session.signUp`) y vuelve a aceptar. Verificado por mutación: sin exigir Propietario, la vista pediría el equipo a cualquiera
- [X] T077 [US2] Editor de roles y permisos en `apps/admin/src/app/team/role-editor/`: presenta **solo** los valores del enumerado `Permission`; las credenciales, la facturación y la administración de roles no aparecen como casilla, porque no existen como concesión (FR-014). Hecho: las casillas salen de `PERMISSION_LABELS`, un `Record<Permission, …>` que no compila si el enumerado suma un permiso sin nombre; la prueba compara las casillas con `PERMISSIONS`. Un rol nuevo puede partir de los permisos de otro. **Pendiente de decisión**: `audit.read` y `team.read` se pueden conceder, pero las reglas todavía reservan la bitácora y las membresías al Propietario, así que hoy no tienen efecto
- [X] T078 [P] [US2] Columna de costo condicionada en `apps/admin/src/app/catalog/variant-table/`: se pide `private/costs` **solo** si el rol tiene `variant.cost.read`; sin permiso, la columna no se muestra ni se solicita el documento (FR-015, FR-040). Hecho: `CatalogQueries.watchCosts` escucha `private/costs`; la tabla lo pide solo con `variant.cost.read`, y sin `variant.cost.write` el costo se ve fijo. Guardarlo no cambia la versión de la variante, porque vive en otro documento. Verificado por mutación: pedir los costos sin el permiso hace caer dos pruebas
- [X] T079 [P] [US2] Ocultar los controles de operaciones no permitidas en `apps/admin/src/app/shared/directives/has-permission.directive.ts` — recordando que esto es cosmética: el control real está en el servidor (FR-010, FR-040). Hecho: el marco del comercio escucha el acceso de la cuenta (`TenantDirectory.watchAccess`, membresía y rol en tiempo real) y lo comparte como `CURRENT_ACCESS`. La regla es `allows` del dominio, la misma que aplica la guarda del servidor. Además de la directiva, los campos sin permiso quedan de solo lectura: el rol de Catálogo ve los precios pero no los edita (quickstart, paso 4)
- [X] T080 [US2] Recorrido e2e de la Historia 2 en `apps/admin-e2e/src/team-and-permissions.spec.ts`, incluidos el intento que **evita la interfaz** y el recorrido de cuenta multi-comercio de `quickstart.md`. Hecho: los permisos del rol de Catálogo en el editor; el intento que evita la interfaz (callable y escritura directa, rechazados); el recorrido invitar → crear cuenta → aceptar → rol propio con precios → baja, con efecto sin recargar; y una cuenta en dos comercios cuya baja en uno no toca el otro. Para no alterar las cuentas sembradas que usan otras pruebas, los recorridos crean sus propias cuentas

**Checkpoint**: Historias 1 y 2 funcionan de forma independiente.

---

## Phase 5: User Story 3 — El Propietario audita cambios (P3)

**Goal**: consultar la bitácora con filtros y comprobar que nadie puede alterarla.

**Independent Test**: generar cambios con distintas personas y verificar que la consulta los muestra
completos y atribuibles, que ningún rol puede alterar entradas, y que una operación cuyo registro no
puede escribirse no se aplica.

### Pruebas de reglas de esta historia (ANTES de la implementación) ⚠️

- [X] T081 [P] [US3] Pruebas de lectura de bitácora en `tests/rules/audit-read.spec.ts` — casos **28 y 29**: el Propietario lee `auditLog` de su comercio; el colaborador de catálogo no. Hecho: sobre la consulta que hace la vista —filtrada, ordenada y paginada—, no solo sobre una entrada suelta: la hace el Propietario de t1 y la niegan el colaborador de catálogo, el Propietario de t2 y un rol con `audit.read`. Ese último caso queda como decisión: la bitácora incluye cambios de costo (`price.changed` con `field: 'cost'`) y Firestore no oculta campos sueltos, así que abrirla a `audit.read` mostraría costos sin `variant.cost.read` (FR-015). Verificado por mutación: con la regla abierta a cualquier miembro activo caen dos pruebas
- [X] T082 [P] [US3] Pruebas de cobertura de tipos de evento en `apps/functions/src/team/audit-coverage.integration.spec.ts` (FR-031a): cambiar permisos de un rol, asignar rol, dar de baja una membresía y traspasar propiedad producen **cada uno** su entrada con el conjunto anterior y el resultante. Hecho: cada operación deja exactamente una entrada `role.changed` con su `change`, la entidad, el responsable y lo anterior y lo resultante (permisos del rol, rol asignado, estado de la membresía, quién era y quién es Propietario)

### Implementación de la Historia 3

- [X] T083 [P] [US3] Índices compuestos de bitácora en `firestore.indexes.json`: `(entity.id, at desc)`, `(actorUid, at desc)` y `(type, at desc)`. Hecho: un índice por cada combinación de filtros de igualdad (persona, producto, tipo) con `at` descendente —siete—, porque los filtros se combinan. El filtro de entidad es por `entity.productId`: el escenario 1 filtra por producto. `audit-indexes.spec.ts` comprueba cada combinación contra los campos que usa la consulta, porque el emulador no exige índices
- [X] T084 [US3] Consulta paginada en `libs/infrastructure/src/firestore/audit-log.repository.ts`: filtros por persona, entidad, rango de fechas y **tipo de evento**, con **paginación por cursor, nunca `offset`** — Firestore cobra los documentos saltados (FR-034). Hecho, en otro lugar: las lecturas van del panel a Firestore y no por el servidor (`contracts/callable-functions.md`, "Lecturas: no hay funciones"), así que la consulta es el puerto `AuditQueries` con su adaptador `libs/infrastructure/src/client/firestore-audit-queries.ts`, y se quitó el puerto de servidor que nunca se usó. El cursor desempata por id las entradas del mismo instante —una edición masiva las escribe juntas—; verificado por mutación: sin el desempate se saltea una entrada
- [X] T085 [P] [US3] Vista de bitácora en `apps/admin/src/app/audit/audit-log/` con sus filtros, esqueleto y estados de error y vacío. Hecho: `apps/admin/src/app/audit/audit-log/`, solo para el Propietario, con los filtros en la dirección; no es en tiempo real porque es una investigación. Paginación con "Cargar más" sobre el cursor de T084. Los nombres de variante se resuelven leyendo una vez cada producto que aparece, y los de las personas con las membresías. Desde el editor de producto, el Propietario llega a la bitácora filtrada por ese producto (escenario 1). Verificado por mutación: sin exigir Propietario o sin incluir el día de "hasta", caen pruebas
- [X] T086 [P] [US3] Presentación de cada tipo de evento en `apps/admin/src/app/audit/entry-detail/`: precio, existencias, rol o permisos, y acción del operador de plataforma, cada uno mostrando qué representan el valor anterior y el nuevo (FR-031). Hecho: `describeEntry`, una función pura con una prueba por tipo, y `EntryDetail` que la muestra. Precios distinguen precio, tachado y costo con su propia marca de vacío; existencias distinguen "sin definir" de cero; los cambios de permisos muestran lo ganado y lo perdido
- [X] T087 [P] [US3] Documentar la retención de **7 años sin purga automática** en `apps/functions/src/bootstrap/retention.ts`, sin trabajo programado de borrado (FR-035). Hecho: la constante y su explicación, y `retention.spec.ts` falla si se despliega una función programada: hoy las veinte son callable
- [X] T088 [US3] Recorrido e2e de la Historia 3 en `apps/admin-e2e/src/audit.spec.ts`, incluido el intento de editar una entrada **siendo Propietario** desde la consola. Hecho: la Propietaria investiga un producto desde su editor (precio de ella y existencias del rol de Catálogo, con responsable, antes y después) y filtra por tipo; editar o borrar una entrada siendo Propietaria por la API de Firestore se niega y la entrada queda igual; el rol de Catálogo no ve la bitácora

**Checkpoint**: las tres primeras historias funcionan de forma independiente.

---

## Phase 6: User Story 4 — El equipo opera el catálogo desde el móvil (P4)

**Goal**: el panel se usa con una mano en pantalla pequeña, cumple WCAG 2.2 AA y nunca deja la
pantalla en blanco ni pierde trabajo en silencio.

**Independent Test**: recorrer cada vista en pantalla táctil pequeña y con conexión degradada,
verificando esqueleto, ausencia de saltos de diseño, estado de error con reintento y estado de
vacío.

### Pruebas de esta historia (ANTES de la implementación) ⚠️

- [X] T089 [P] [US4] Pruebas automatizadas de accesibilidad en `apps/admin-e2e/src/a11y.spec.ts`: **cero incumplimientos de nivel A ni AA de WCAG 2.2** en todas las vistas del panel (SC-014). Hecho: axe (`@axe-core/playwright`) con las etiquetas A y AA de WCAG 2.0, 2.1 y 2.2 sobre inicio de sesión, alta de cuenta, selección de comercio, catálogo vacío y con productos, alta de producto, editor con variantes, equipo, editor de roles, invitación y bitácora, en escritorio y a 360 px: cero incumplimientos. Se evalúa la vista quieta, al terminar las animaciones: a mitad de la apertura de un diálogo el contraste medido es falso. Verificado por mutación: sin la etiqueta del correo en el inicio de sesión, falla con la regla `label`
- [X] T090 [P] [US4] Pruebas de estados de carga en `apps/admin-e2e/src/loading-states.spec.ts`: toda vista presenta esqueleto, estado de error con reintento y estado de vacío; **cero saltos de diseño** al completarse la carga (SC-012, FR-036). Hecho: con Firestore demorado 600 ms, cada vista muestra su esqueleto y el CLS medido al completarse la carga queda por debajo de 0,01 (hoy, 0 en todas). También el vacío que invita a crear y el error con reintento. Las demás combinaciones de error y vacío están probadas por vista en las unitarias

### Implementación de la Historia 4

- [X] T091 [US4] Auditar y completar esqueletos, errores y vacíos en todas las vistas de `apps/admin/src/app/` hasta que T090 pase. Hecho: todas las vistas tenían esqueleto, error y vacío; lo que faltaba era que no saltaran. Antes, a 360 px: equipo 0,36, editor 0,24, bitácora 0,11, catálogo 0,09. Causas y arreglos: el encabezado crecía al llegar el acceso (ahora dos filas de alto fijo y las acciones de la cuenta en un menú "Cuenta"); el equipo mostraba cada sección por su lado (ahora un solo esqueleto hasta tener las tres lecturas); la bitácora cambiaba de alto al resolver los nombres (ahora la primera página espera los nombres); y el botón "Nuevo producto" agrandaba su fila (alto reservado)
- [X] T092 [US4] Diseño móvil de la tabla de variantes en `apps/admin/src/app/catalog/variant-table/`: legible y operable a **360 px sin desplazamiento horizontal**, con edición de importes y existencias sin salir de ella (FR-038). Hecho: la grilla de la tabla ya cabía a 360 px; `mobile.spec.ts` lo fija con un producto de cuatro variantes y costo: sin desplazamiento horizontal en catálogo, editor, equipo y bitácora, cada campo entero en pantalla, precio y existencias editados en la tabla, y la barra de edición en lote a la vista
- [X] T093 [US4] Accesibilidad de la tabla con edición en línea en `apps/admin/src/app/catalog/variant-table/`: operación completa por teclado y **anuncio de los cambios de estado con `LiveAnnouncer` del CDK** (FR-038a). Hecho: `keyboard.spec.ts` recorre la tabla sin mouse (guardar con Enter, Tab entre campos, Espacio para seleccionar, edición en lote, imágenes con Enter y Escape que devuelve el foco) y verifica cada anuncio del LiveAnnouncer. Encontró un defecto: un valor inválido guardado con Enter, sin salir del campo, no se mostraba ni se anunciaba; ahora se marca, se muestra y se anuncia como error
- [X] T094 [P] [US4] Preservación del trabajo en curso ante fallo de guardado en `apps/admin/src/app/shared/pending-changes/`: no se pierde en silencio y se puede reintentar (FR-039). Hecho: `shared/pending-changes/`: cada formulario declara lo que tiene sin guardar, los editores de producto y de rol preguntan antes de salir, y cerrar o recargar la pestaña pide confirmación. Encontró otro defecto: una falla pasajera (sin red, del servidor, o porque otra persona lo cambió antes) dejaba el valor marcado como rechazado y no se podía reenviar igual; ahora solo bloquean los rechazos por el valor mismo, como un SKU ocupado. Verificado por mutación. El diálogo de la guarda se carga recién cuando hace falta, para no sumar el de Material a la carga inicial
- [X] T095 [P] [US4] Revisar objetivos táctiles y recorrido con una sola mano en los flujos frecuentes de catálogo en `apps/admin/src/styles.scss` y las vistas de `apps/admin/src/app/catalog/`. Hecho: los botones, casillas y campos de Material ya tenían zona táctil de 48 px; los enlaces de texto "← Catálogo", "← Equipo" y "Ver sus cambios en la bitácora" tenían 24 px y ahora 48. `mobile.spec.ts` comprueba al menos 44 px en lo que se toca en los flujos de catálogo

**Checkpoint**: las cuatro historias completas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T096 [P] Medir el sobrecosto real del `get()` de reglas en un proyecto de pruebas y contrastarlo con la estimación de ~2% de `research.md`: el listado de 50 productos debe costar **51 lecturas, no 100**. **Diferida, no hecha**: necesita un proyecto de Firebase real y su consola de facturación, que esta feature no tiene; se retoma al crear el proyecto de producción
- [X] T097 [P] Confirmar en la consola de facturación las tarifas de escritura y almacenamiento, que no son legibles desde la documentación pública, y actualizar `research.md` §8. **Diferida, no hecha**: necesita un proyecto de Firebase real y su consola de facturación, que esta feature no tiene; se retoma al crear el proyecto de producción
- [X] T098 Recorrer `quickstart.md` de punta a punta y corregir lo que no coincida. Hecho: comandos de arranque, siembra y suites reescritos según lo que corre de verdad; la siembra no crea productos; las vistas de credenciales y facturación no existen en esta feature; CI tiene cinco trabajos y las e2e no corren ahí. El paso "cortar la red" encontró tres defectos: sin red, Firestore entregaba de su caché un producto con "0 variantes" (ahora la primera lectura espera al servidor y a los 10 s falla con reintento, `libs/infrastructure/src/client/listen.ts`); una vista cuyo código no se descargaba no avisaba nada (`shared/navigation-failure.ts`); y el marco del comercio decía "puede que no tengas acceso" cuando faltaba la red (ahora "No pudimos conectarnos"). `offline.spec.ts` lo fija
- [X] T099 [P] Cuantificar "conexión móvil típica" (SC-009) y "sin degradación perceptible" (SC-008) en `apps/admin-e2e/src/performance.spec.ts`, que hoy quedan sin número. Hecho: conexión móvil típica = perfil móvil de Lighthouse (Slow 4G, CPU ×4); sin degradación = a lo sumo +20% o +100 ms. Se mide sobre el build optimizado con `npx nx run admin-e2e:perf`, y el contenido útil es el primer producto pintado, marcado por la propia página. Primera visita: estructura 0,2 s y contenido 2,7–2,8 s (era 3,7 s); visitas siguientes: 0,2 s y 0,9–1,1 s (era 2,1 s); SC-008: sin diferencia con 100 colaboradores. Lo que lo bajó: Auth sin el resolvedor de popup (gapi y un iframe, ~1 s); `re2js` fuera del panel (`apps/admin/src/vendor/re2js.js`: Firestore lo usa solo para regex en pipelines, 50 KB comprimidos); y la escucha de los comercios de la cuenta empieza en la guarda, así el canal de Firestore se abre mientras se descarga la vista. Probado y descartado: meter el marco y el catálogo en la carga inicial (−30 ms en la primera visita, +480 ms en las siguientes). La e2e completa pasa también sobre el build optimizado; el servidor de desarrollo sigue usando el `re2js` real
- [X] T100 [P] Evaluar si la búsqueda por prefijo alcanza para SC-010 con 10.000 variantes; si no, activar el disparador de motor dedicado de `research.md` §7. Hecho: p95 de 9 ms con 2.500 productos y 10.000 variantes contra el emulador; el tiempo depende de lo que devuelve, no del tamaño del catálogo. El disparador no se activa (`research.md` §7)
- [X] T101 [P] Documentar el modelo de autorización en `docs/authorization.md`: qué decide cada capa y por qué los permisos no viajan en el token. Hecho: reglas para las lecturas, guarda de las callable para las escrituras, panel solo cosmético, y por qué no hay custom claims

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias
- **Foundational (Fase 2)**: depende de la Fase 1 — **bloquea todas las historias**
- **US1 (Fase 3)**: depende de la Fase 2. **Se completa y valida antes de empezar US2**, por pedido explícito
- **US2 (Fase 4)**: depende de la Fase 2; se apoya en el catálogo de US1 para tener qué proteger
- **US3 (Fase 5)**: depende de la Fase 2. Las entradas de bitácora ya se escriben desde US1; acá se entrega la consulta
- **US4 (Fase 6)**: depende de que existan las vistas de US1 a US3
- **Polish (Fase 7)**: depende de las historias que se quieran cerrar

### Orden dentro de cada historia

Por pedido explícito: **las pruebas de reglas de Firestore y del motor de variantes van primero**,
se verifica que fallan, y recién después va la implementación que las hace pasar. Después: entidades
→ adaptadores → casos de uso → callables → interfaz → e2e.

### Parallel Opportunities

- Fase 1: T003, T004, T005, T007, T008, T009, T011 en paralelo
- Fase 2: las pruebas T012, T013, T014, T016, T017 en paralelo; después T018 a T021 y T023, T024, T029, T030 en paralelo
- US1: T032, T033, T033a, T035, T036, T037, T038 en paralelo; luego T039, T040, T043, T044, T046 en paralelo (T043a depende de T033a)
- US2: T063, T064, T065, T066 en paralelo (T062 sola, toca el mismo escenario de siembra)
- US3: T081 y T082 en paralelo; después T083, T085, T086, T087
- US4: T089 y T090 en paralelo
- **Entre historias**: US2 y US3 podrían paralelizarse con equipo suficiente, pero el pedido de este
  plan es cerrar US1 antes de abrir la 2

---

## Parallel Example: User Story 1

```bash
# Primero, las pruebas del motor y de reglas (deben fallar):
Task: "T032 Pruebas de generateCombinations en libs/domain/src/services/generate-combinations.spec.ts"
Task: "T033 Pruebas de validateOptionLimits en libs/domain/src/services/validate-option-limits.spec.ts"
Task: "T035 Pruebas de canChangeStatus en libs/domain/src/services/can-change-status.spec.ts"
Task: "T036 Pruebas de buildAuditEntries en libs/domain/src/services/build-audit-entries.spec.ts"
Task: "T037 Pruebas de lectura de catálogo en tests/rules/catalog-read.spec.ts"

# Después, las entidades y adaptadores:
Task: "T039 Entidad Product en libs/domain/src/entities/product.ts"
Task: "T040 Entidad Variant en libs/domain/src/entities/variant.ts"
Task: "T044 Adaptadores Product y Variant en libs/infrastructure/src/firestore/"
Task: "T046 Adaptador VariantCosts en libs/infrastructure/src/firestore/variant-costs.repository.ts"
```

---

## Implementation Strategy

### MVP primero (solo Historia 1)

1. Fase 1: Setup
2. Fase 2: Foundational (bloquea todo)
3. Fase 3: Historia 1
4. **PARAR Y VALIDAR**: probar la Historia 1 de forma independiente con el recorrido de
   `quickstart.md`
5. Desplegar o demostrar

### Entrega incremental

1. Setup + Foundational → base lista
2. Historia 1 → validar → **MVP**
3. Historia 2 → validar → equipos y permisos
4. Historia 3 → validar → auditoría consultable
5. Historia 4 → validar → móvil y accesibilidad

### Sobre el constructor de roles

`plan.md` propone entregar la Historia 2 en dos tiempos: primero los roles predefinidos (T070) con
el modelo de permisos completo por debajo, y después el editor visual (T077). El principio VI queda
cumplido desde el día uno; lo que se difiere es la pantalla, no la garantía. Si hace falta acortar,
**T077 es la tarea que se puede posponer sin romper nada**.

---

## Notes

- Las tareas marcadas [P] tocan archivos distintos y no dependen entre sí
- Verificar que las pruebas **fallan** antes de implementar lo que verifican
- Confirmar después de cada tarea o grupo lógico
- Las cuatro compuertas de CI (T010) rigen desde el primer commit, no al final
- Los criterios SC-001, SC-002 y SC-011 del spec son **objetivos de producto**: se verifican con
  pruebas de usuario y **no** bloquean el despliegue

---

## Decisiones pendientes

Defectos de la 001 encontrados después de cerrarla. Se deciden antes de planear la feature
siguiente que los toque.

- [ ] T102 [Decisión pendiente] **`catalog.read` se puede conceder y no restringe nada.** El constructor de roles lo ofrece como permiso activable, pero ninguna parte de la 001 lo exige: las reglas de `firestore.rules` abren `products` y `variants` a cualquier miembro activo (`isActiveMember`), y ningún caso de uso lo pide. Un Propietario que arma un rol sin `catalog.read` cree estar restringiendo el acceso al catálogo, y no lo restringe. Es un defecto, no una característica. Dos salidas: **(a)** exigir `catalog.read` en las reglas de `products` y `variants` con `hasPermission`, a +1 lectura por solicitud, con sus casos en `tests/rules/catalog-read.spec.ts`; o **(b)** quitar `catalog.read` del enumerado `Permission` en `libs/domain/src/value-objects/permission.ts` y del constructor de roles, porque si todo miembro activo lee el catálogo por diseño, un permiso que no hace nada confunde al Propietario. Hallado en `/speckit-analyze` de la 002 (hallazgo I1). La 002 adopta el modelo actual —lectura con membresía activa, FR-002— y su caso de reglas 35a lo fija a la espera de esta decisión
- [X] T103 [Defecto corregido] **Faltaba el índice `(archived, status, nameNormalized)`.** El listado del catálogo (T053) combina la búsqueda por nombre con el filtro de estado, y esa combinación no tenía índice compuesto: en el emulador funcionaba —no exige índices—, pero en producción la consulta fallaba. Hallado en la Historia 1 de la 002. **Este sí quedó corregido**: el índice está en `firestore.indexes.json`, y `libs/infrastructure/src/client/catalog-indexes.spec.ts` lo verifica junto con el de la búsqueda sola, así que un índice faltante vuelve a fallar en CI y no en producción
