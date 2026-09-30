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

- [ ] T001 Crear el workspace Nx con las cuatro librerías de capa (`domain`, `application`, `infrastructure`, `ui`) y las apps `admin`, `admin-e2e`, `functions`, según el árbol de `plan.md`, en `nx.json` y `tsconfig.base.json`
- [X] T002 Fijar `"typescript": "~6.0.0"` en `package.json` — **Angular 22 exige `>=6.0 <6.1`**; la 7.x publicada como `latest` rompe el build
- [X] T003 [P] Configurar `@nx/enforce-module-boundaries` en `eslint.config.mjs` con las etiquetas `layer:domain` (no importa nada del repo), `layer:application` (solo `layer:domain`), `layer:infrastructure` (application + domain), `layer:presentation` (todas)
- [X] T004 [P] Configurar Vitest 5 como runner de `domain` y `application` en `libs/domain/vite.config.ts` y `libs/application/vite.config.ts`
- [X] T005 [P] Configurar ESLint y Prettier en `eslint.config.mjs` y `.prettierrc`
- [ ] T006 Crear la app Angular 22 `apps/admin` standalone y **zoneless** (`provideZonelessChangeDetection()` en `apps/admin/src/app/app.config.ts`), sin `zone.js` en polyfills y sin la dependencia instalada
- [ ] T007 [P] Instalar Angular Material + CDK 22.2 y definir el tema en `apps/admin/src/styles.scss`
- [X] T008 [P] Crear `firebase.json`, `.firebaserc` y la configuración de Emulator Suite (Auth, Firestore, Functions, Storage) en la raíz del repositorio
- [ ] T009 [P] Configurar Playwright en `apps/admin-e2e/playwright.config.ts` apuntando a los emuladores
- [X] T010 Crear el pipeline de CI en `.github/workflows/ci.yml` con **cuatro compuertas bloqueantes**: `rules:test`, `domain:test`, `functions:test` y `lint` (frontera de capas). El merge se rechaza si cualquiera falla, sin excepción por plazos **Implementado con cinco compuertas**: `lint` (vía Nx, o la frontera se salta en silencio), `typecheck` (Vitest no chequea tipos), `unit`, `rules` e `integration`. `functions:test` se suma a `integration` cuando exista `apps/functions` (T051). ⚠️ Solo bloquea el merge si los cinco trabajos se marcan como *required status checks* en la protección de la rama
- [ ] T011 [P] Crear el esqueleto del sembrador de datos en `tools/seed/src/main.ts`

**Checkpoint**: el repositorio compila, el lint de capas corre y CI bloquea.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: primitivas de dominio, reglas base e infraestructura transaccional de las que dependen
**todas** las historias.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

### Pruebas primero (motor y reglas base)

- [X] T012 [P] Pruebas de `Money` en `libs/domain/src/value-objects/money.spec.ts`: el importe es **entero en la unidad mínima de la moneda**, nunca punto flotante; rechaza decimales; la moneda se toma del inquilino
- [X] T013 [P] Pruebas de `normalizarSku` en `libs/domain/src/services/normalizar-sku.spec.ts`: normaliza a **mayúsculas y sin espacios al borde**, de modo que `abc-1` y `ABC-1` colisionen; la forma original se conserva aparte
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
- [ ] T028 Crear la guarda común de las callable en `apps/functions/src/bootstrap/guard.ts`: `request.auth` → App Check (`enforceAppCheck: true`) → `tenantId` en la carga útil → **membresía activa verificada dentro de la transacción** → permiso del rol. El `tenantId` del cliente se verifica, nunca se confía (FR-003)
- [X] T029 [P] Implementar `SecurityEventRecorder` en `libs/infrastructure/src/firestore/security-event.recorder.ts` para los intentos denegados **que atraviesan la capa de servicios** (FR-004) ⚠️ Implementado pero **sin prueba propia**: su verificación era el hallazgo G4 de `/speckit-analyze`, que quedó fuera del alcance aprobado
- [ ] T030 [P] Crear las primitivas compartidas de interfaz en `libs/ui/src/lib/states/`: `SkeletonComponent` (reserva el espacio del contenido final), `ErrorStateComponent` (con reintento) y `EmptyStateComponent` (con acción de creación). Se crean acá para que las historias 1 a 3 las usen desde el principio en vez de reacondicionarlas en la 4
- [ ] T031 Sembrar los datos de prueba en `tools/seed/src/main.ts`: comercios `t1` y `t2`, `owner@t1.test`, `owner@t2.test`, `catalogo@t1.test` con el rol predefinido, y **`multi@test` con membresía en ambos** (Propietaria en `t1`, colaboradora en `t2`)

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

- [ ] T032 [P] [US1] Pruebas de `generarCombinaciones` en `libs/domain/src/services/generar-combinaciones.spec.ts`: producto cartesiano de los valores; producto sin opciones → **una variante implícita** con `optionValues: {}` (FR-020)
- [ ] T033 [P] [US1] Pruebas de `validarLimites` en `libs/domain/src/services/validar-limites.spec.ts`: **máximo 5 atributos de variación y 100 combinaciones**; el sexto atributo se rechaza; la combinatoria que supere 100 se rechaza **antes de crear nada**, informando cuántas produciría (FR-025)
- [ ] T033a [P] [US1] Pruebas de `validarEstructuraDeOpciones` en `libs/domain/src/services/validar-estructura-opciones.spec.ts` (FR-022): rechaza dos valores con la misma etiqueta dentro de una opción —incluida la coincidencia ignorando mayúsculas y espacios al borde, de modo que "Rojo", "rojo" y " Rojo " colisionen—; rechaza dos opciones con el mismo nombre dentro del producto; y garantiza que no queden dos variantes con la misma combinación de valores
- [ ] T034 [US1] Pruebas de `reconciliarVariantes` en `libs/domain/src/services/reconciliar-variantes.spec.ts` — el caso más denso de la feature (FR-024): al agregar un atributo a un producto con variantes cargadas, las existentes **conservan SKU, precio, precio comparativo, costo, stock e imágenes**; las combinaciones nuevas nacen **sin precio y sin existencias definidas —`{ kind: 'undefined' }`, NO en cero** (FR-029); faltar una asignación devuelve la lista de variantes sin asignar; renombrar una opción o un valor **no** regenera ni archiva variantes (FR-026); quitar un valor en uso archiva sus variantes
- [ ] T035 [P] [US1] Pruebas de `puedeCambiarEstado` en `libs/domain/src/services/puede-cambiar-estado.spec.ts`: `active` y `unlisted` exigen `hasIncompleteVariants === false`; `draft` siempre permitido; `archived` es **ortogonal** al estado (FR-023a)
- [ ] T036 [P] [US1] Pruebas de `construirEntradasDeBitacora` en `libs/domain/src/services/construir-entradas-bitacora.spec.ts`: una entrada **por variante** con el mismo `batchId`, tipo de evento correcto, y el nombre del actor copiado al momento del hecho (FR-030, FR-031)

### Pruebas de reglas de esta historia (ANTES de la implementación) ⚠️

- [ ] T037 [P] [US1] Pruebas de lectura de catálogo en `tests/rules/catalog-read.spec.ts`: un miembro activo lee `products` y `variants` de su comercio; el documento de la variante **no contiene** el campo de costo (caso **19**)
- [ ] T038 [P] [US1] Pruebas de atomicidad de bitácora en `apps/functions/src/pricing/atomicity.integration.spec.ts` — **en ambos sentidos** (FR-030, FR-033): inyectar fallo al escribir la bitácora y comprobar que el precio no cambia; inyectar fallo al escribir la variante y comprobar que **no queda entrada** de ese cambio

### Implementación de la Historia 1

- [ ] T039 [P] [US1] Entidad `Product` en `libs/domain/src/entities/product.ts` con `options` (máximo 5), `status: 'draft' | 'active' | 'unlisted'`, `archived` independiente del estado, `variantCount` (≤ 100), `hasIncompleteVariants`, `nameNormalized` y `version`
- [ ] T040 [P] [US1] Entidad `Variant` en `libs/domain/src/entities/variant.ts` con `sku`, `price`, `compareAtPrice`, `stock`, `images`, `complete` (derivado de `sku !== null`), `archived` y `version`. **Sin campo de costo**: el costo vive en otro documento (FR-015)
- [ ] T041 [US1] Implementar `generarCombinaciones` y `validarLimites` en `libs/domain/src/services/` hasta que T032 y T033 pasen
- [ ] T042 [US1] Implementar `reconciliarVariantes` en `libs/domain/src/services/reconciliar-variantes.ts` hasta que T034 pase
- [ ] T043 [P] [US1] Implementar `puedeCambiarEstado`, `normalizarSku` y `normalizarNombre` en `libs/domain/src/services/`
- [ ] T043a [US1] Implementar `validarEstructuraDeOpciones` en `libs/domain/src/services/validar-estructura-opciones.ts` hasta que T033a pase
- [ ] T044 [P] [US1] Puertos `ProductRepository` y `VariantRepository` en `libs/application/src/ports/` (agregarlos a `TransactionScope`) y sus adaptadores en `libs/infrastructure/src/firestore/`
- [ ] T045 [US1] Puerto `SkuIndexRepository` en `libs/application/src/ports/` y su adaptador en `libs/infrastructure/src/firestore/sku-index.repository.ts`: id del documento = **SKU normalizado** bajo `tenants/{tid}/skuIndex/{SKU}`, creado con `tx.create` en la misma transacción que la variante para que la colisión falle de forma atómica; `release()` solo marca `archived: true`, **nunca borra** (FR-021, FR-023)
- [ ] T046 [P] [US1] Adaptador `VariantCostsRepository` en `libs/infrastructure/src/firestore/variant-costs.repository.ts` sobre `products/{pid}/private/costs`, **un documento por producto** con el mapa `{ [variantId]: Money }`
- [ ] T047 [P] [US1] Casos de uso `CrearProducto` y `ActualizarDetallesProducto` en `libs/application/src/use-cases/`
- [ ] T048 [US1] Caso de uso `DefinirOpcionesProducto` en `libs/application/src/use-cases/definir-opciones-producto.ts`: invoca `validarEstructuraDeOpciones` y `validarLimites` **antes** de generar combinaciones, y después `reconciliarVariantes`
- [ ] T049 [P] [US1] Casos de uso `AsignarSkuVariante`, `CambiarEstadoProducto`, `ArchivarProducto` y `ArchivarVariante` en `libs/application/src/use-cases/`
- [ ] T050 [US1] Casos de uso `EditarPrecioVariante`, `EditarCostoVariante` y `AjustarStockVariante` en `libs/application/src/use-cases/`: escriben el cambio **y** su entrada de bitácora en una sola transacción; una acción masiva produce **una entrada por variante** y **no se aplica parcialmente** (FR-030)
- [ ] T051 [P] [US1] Callables de catálogo en `apps/functions/src/catalog/`: `createProduct`, `updateProductDetails`, `setProductOptions`, `setProductStatus`, `setVariantSku`, `archiveProduct`, `archiveVariant`
- [ ] T052 [US1] Callables de importes en `apps/functions/src/pricing/`: `setVariantPrice`, `setVariantCost`, `setVariantStock`, con los códigos de error del contrato (`sku-conflict`, `version-conflict`, `limit-exceeded`, `incomplete-variants`, `audit-write-failed`)
- [ ] T053 [P] [US1] Índices compuestos en `firestore.indexes.json` para el listado de catálogo: `(status, updatedAt desc)`, `(archived, updatedAt desc)` y `(nameNormalized asc)` para búsqueda por prefijo
- [ ] T054 [P] [US1] Vista de listado de catálogo en `apps/admin/src/app/catalog/product-list/`, con esqueleto, estado de error y estado de vacío desde `libs/ui`; **no lee variantes** (se leen al abrir el producto)
- [ ] T055 [US1] Editor de producto en `apps/admin/src/app/catalog/product-editor/` con Signal Forms: agregar opciones **de a una** con nombre libre, y agregar, reordenar, renombrar y quitar valores (FR-017)
- [ ] T056 [US1] Tabla de variantes en `apps/admin/src/app/catalog/variant-table/`: una fila por combinación con imagen, SKU, precio, precio comparativo y existencias **editables en línea**; se regenera al cambiar las opciones (FR-018, FR-028)
- [ ] T057 [US1] Flujo de asignación de FR-024 en `apps/admin/src/app/catalog/variant-table/assign-option-dialog/`: al agregar una opción a un producto con variantes cargadas, pedir el valor nuevo para **cada** variante existente antes de confirmar
- [ ] T058 [US1] Selección múltiple y edición masiva en `apps/admin/src/app/catalog/variant-table/bulk-edit/`: aplicar un mismo importe o cantidad a varias variantes en una acción (FR-028)
- [ ] T059 [P] [US1] Indicador de variante incompleta y bloqueo de activación en `apps/admin/src/app/catalog/product-editor/status-control/`: pasar a `active` o `unlisted` con variantes incompletas muestra **cuáles** lo impiden (FR-023a)
- [ ] T060 [P] [US1] Carga de imágenes por URL firmada en `apps/admin/src/app/catalog/image-upload/` y `apps/functions/src/catalog/create-upload-url.ts`, con `alt` obligatorio (FR-038a)
- [ ] T061 [US1] Recorrido e2e de la Historia 1 en `apps/admin-e2e/src/catalog.spec.ts` siguiendo los pasos 1 a 9 de `quickstart.md`

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

- [ ] T062 [US2] Pruebas de cuentas en varios comercios en `tests/rules/multi-tenant-accounts.spec.ts` — casos **8 a 14**: la misma cuenta lee en `t1` y en `t2`; ser Propietaria en `t1` **no** concede nada en `t2`; desactivar la membresía en `t2` **no** afecta `t1`; y la baja corta el acceso **en la solicitud siguiente**, sin esperar a que expire el token (FR-008, FR-008a)
- [ ] T063 [P] [US2] Pruebas de costo en `tests/rules/variant-cost.spec.ts` — casos **15 a 19**: el rol de Catálogo no lee `private/costs`; un rol con `variant.price.write` pero sin `variant.cost.read` tampoco; con `variant.cost.read` sí; el Propietario sí
- [ ] T064 [P] [US2] Pruebas de secretos y facturación en `tests/rules/owner-only.spec.ts` — casos **20 a 23**, incluido el **23**: un rol personalizado con **todos** los permisos concedibles sigue sin leer `config/secrets`, porque ningún permiso concedible alcanza (FR-014)
- [ ] T065 [P] [US2] Extender `tests/rules/member-cannot-read-owner-paths.spec.ts` (creado en la fase 2) con el caso **34** una vez que T068 agregue `hasPermission`: un miembro con rol que tiene `variant.price.write` pero no `variant.cost.read` sigue sin leer `private/costs`. **Nota**: la premisa original de esta tarea —"reordenar las reglas"— era falsa; en Firestore el orden no importa, importa la superposición. Ver `contracts/firestore-rules.md`
- [ ] T066 [P] [US2] Pruebas de aislamiento de permisos en los casos de uso en `libs/application/src/use-cases/authorization.spec.ts`, con dobles de los puertos y sin emulador: cada caso de uso rechaza sin su permiso; `variant.price.write` y `variant.cost.write` son independientes entre sí y de `catalog.write` (FR-015)

### Implementación de la Historia 2

- [ ] T067 [P] [US2] Entidad `Invitation` en `libs/domain/src/entities/invitation.ts` con `status: 'pending' | 'accepted' | 'expired' | 'revoked'` y **caducidad a los 14 días**
- [ ] T068 [US2] Extender en `firestore.rules` la regla de `products/{productId}/private/{docId}` —hoy solo `isOwnerOf`— con `|| hasPermission(tenantId, 'variant.cost.read')`, hasta que T063 y T065 pasen
- [ ] T069 [P] [US2] Adaptadores `MembershipRepository` y `RoleRepository` en `libs/infrastructure/src/firestore/`
- [ ] T070 [P] [US2] Sembrar los roles predefinidos al crear el inquilino en `apps/functions/src/team/seed-preset-roles.ts`: `owner` (`editable: false`, indeleble) y `catalog` con exactamente `catalog.read`, `catalog.write`, `variant.stock.write` — **sin precios y sin costo** (FR-016)
- [ ] T071 [US2] Casos de uso `CrearRol`, `ActualizarRol` y `EliminarRol` en `libs/application/src/use-cases/`: un rol nace **con la lista de permisos vacía** (FR-009); no se elimina con `memberCount > 0` (FR-013); `updateRole` sobre `owner` se rechaza (FR-016); **todos escriben bitácora** con el conjunto anterior y el resultante (FR-031a)
- [ ] T072 [US2] Casos de uso `InvitarColaborador` y `AceptarInvitacion` en `libs/application/src/use-cases/`: si la persona ya tiene cuenta, se le **suma una membresía** en vez de crear otra cuenta (FR-005); sin tope de cantidad (FR-006); sin acceso hasta aceptar (FR-007)
- [ ] T073 [US2] Casos de uso `AsignarRol`, `DarDeBajaMembresia` y `TransferirPropiedad` en `libs/application/src/use-cases/`: la baja es **de la membresía en ese comercio**, no de la cuenta, y no toca Firebase Auth ni las otras membresías (FR-008a); el traspaso deja **exactamente un** Propietario antes y después (FR-011); los tres escriben bitácora
- [ ] T074 [P] [US2] Callables de equipo en `apps/functions/src/team/`: `inviteCollaborator`, `acceptInvitation`, `revokeInvitation`, `createRole`, `updateRole`, `deleteRole`, `assignRole`, `setMembershipEnabled`, `transferOwnership`
- [ ] T075 [US2] Selector de comercio activo en `apps/admin/src/app/tenant/tenant-switcher/` con rutas `/t/{tenantId}/…`: cambiar de comercio es **navegación**, sin refrescar el token
- [ ] T076 [P] [US2] Vista de colaboradores e invitaciones en `apps/admin/src/app/team/members/`, con esqueleto y estados de error y vacío
- [ ] T077 [US2] Editor de roles y permisos en `apps/admin/src/app/team/role-editor/`: presenta **solo** los valores del enumerado `Permission`; las credenciales, la facturación y la administración de roles no aparecen como casilla, porque no existen como concesión (FR-014)
- [ ] T078 [P] [US2] Columna de costo condicionada en `apps/admin/src/app/catalog/variant-table/`: se pide `private/costs` **solo** si el rol tiene `variant.cost.read`; sin permiso, la columna no se muestra ni se solicita el documento (FR-015, FR-040)
- [ ] T079 [P] [US2] Ocultar los controles de operaciones no permitidas en `apps/admin/src/app/shared/directives/has-permission.directive.ts` — recordando que esto es cosmética: el control real está en el servidor (FR-010, FR-040)
- [ ] T080 [US2] Recorrido e2e de la Historia 2 en `apps/admin-e2e/src/team-and-permissions.spec.ts`, incluidos el intento que **evita la interfaz** y el recorrido de cuenta multi-comercio de `quickstart.md`

**Checkpoint**: Historias 1 y 2 funcionan de forma independiente.

---

## Phase 5: User Story 3 — El Propietario audita cambios (P3)

**Goal**: consultar la bitácora con filtros y comprobar que nadie puede alterarla.

**Independent Test**: generar cambios con distintas personas y verificar que la consulta los muestra
completos y atribuibles, que ningún rol puede alterar entradas, y que una operación cuyo registro no
puede escribirse no se aplica.

### Pruebas de reglas de esta historia (ANTES de la implementación) ⚠️

- [ ] T081 [P] [US3] Pruebas de lectura de bitácora en `tests/rules/audit-read.spec.ts` — casos **28 y 29**: el Propietario lee `auditLog` de su comercio; el colaborador de catálogo no
- [ ] T082 [P] [US3] Pruebas de cobertura de tipos de evento en `apps/functions/src/team/audit-coverage.integration.spec.ts` (FR-031a): cambiar permisos de un rol, asignar rol, dar de baja una membresía y traspasar propiedad producen **cada uno** su entrada con el conjunto anterior y el resultante

### Implementación de la Historia 3

- [ ] T083 [P] [US3] Índices compuestos de bitácora en `firestore.indexes.json`: `(entity.id, at desc)`, `(actorUid, at desc)` y `(type, at desc)`
- [ ] T084 [US3] Consulta paginada en `libs/infrastructure/src/firestore/audit-log.repository.ts`: filtros por persona, entidad, rango de fechas y **tipo de evento**, con **paginación por cursor, nunca `offset`** — Firestore cobra los documentos saltados (FR-034)
- [ ] T085 [P] [US3] Vista de bitácora en `apps/admin/src/app/audit/audit-log/` con sus filtros, esqueleto y estados de error y vacío
- [ ] T086 [P] [US3] Presentación de cada tipo de evento en `apps/admin/src/app/audit/entry-detail/`: precio, existencias, rol o permisos, y acción del operador de plataforma, cada uno mostrando qué representan el valor anterior y el nuevo (FR-031)
- [ ] T087 [P] [US3] Documentar la retención de **7 años sin purga automática** en `apps/functions/src/bootstrap/retention.ts`, sin trabajo programado de borrado (FR-035)
- [ ] T088 [US3] Recorrido e2e de la Historia 3 en `apps/admin-e2e/src/audit.spec.ts`, incluido el intento de editar una entrada **siendo Propietario** desde la consola

**Checkpoint**: las tres primeras historias funcionan de forma independiente.

---

## Phase 6: User Story 4 — El equipo opera el catálogo desde el móvil (P4)

**Goal**: el panel se usa con una mano en pantalla pequeña, cumple WCAG 2.2 AA y nunca deja la
pantalla en blanco ni pierde trabajo en silencio.

**Independent Test**: recorrer cada vista en pantalla táctil pequeña y con conexión degradada,
verificando esqueleto, ausencia de saltos de diseño, estado de error con reintento y estado de
vacío.

### Pruebas de esta historia (ANTES de la implementación) ⚠️

- [ ] T089 [P] [US4] Pruebas automatizadas de accesibilidad en `apps/admin-e2e/src/a11y.spec.ts`: **cero incumplimientos de nivel A ni AA de WCAG 2.2** en todas las vistas del panel (SC-014)
- [ ] T090 [P] [US4] Pruebas de estados de carga en `apps/admin-e2e/src/loading-states.spec.ts`: toda vista presenta esqueleto, estado de error con reintento y estado de vacío; **cero saltos de diseño** al completarse la carga (SC-012, FR-036)

### Implementación de la Historia 4

- [ ] T091 [US4] Auditar y completar esqueletos, errores y vacíos en todas las vistas de `apps/admin/src/app/` hasta que T090 pase
- [ ] T092 [US4] Diseño móvil de la tabla de variantes en `apps/admin/src/app/catalog/variant-table/`: legible y operable a **360 px sin desplazamiento horizontal**, con edición de importes y existencias sin salir de ella (FR-038)
- [ ] T093 [US4] Accesibilidad de la tabla con edición en línea en `apps/admin/src/app/catalog/variant-table/`: operación completa por teclado y **anuncio de los cambios de estado con `LiveAnnouncer` del CDK** (FR-038a)
- [ ] T094 [P] [US4] Preservación del trabajo en curso ante fallo de guardado en `apps/admin/src/app/shared/pending-changes/`: no se pierde en silencio y se puede reintentar (FR-039)
- [ ] T095 [P] [US4] Revisar objetivos táctiles y recorrido con una sola mano en los flujos frecuentes de catálogo en `apps/admin/src/styles.scss` y las vistas de `apps/admin/src/app/catalog/`

**Checkpoint**: las cuatro historias completas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T096 [P] Medir el sobrecosto real del `get()` de reglas en un proyecto de pruebas y contrastarlo con la estimación de ~2% de `research.md`: el listado de 50 productos debe costar **51 lecturas, no 100**
- [ ] T097 [P] Confirmar en la consola de facturación las tarifas de escritura y almacenamiento, que no son legibles desde la documentación pública, y actualizar `research.md` §8
- [ ] T098 Recorrer `quickstart.md` de punta a punta y corregir lo que no coincida
- [ ] T099 [P] Cuantificar "conexión móvil típica" (SC-009) y "sin degradación perceptible" (SC-008) en `apps/admin-e2e/src/performance.spec.ts`, que hoy quedan sin número
- [ ] T100 [P] Evaluar si la búsqueda por prefijo alcanza para SC-010 con 10.000 variantes; si no, activar el disparador de motor dedicado de `research.md` §7
- [ ] T101 [P] Documentar el modelo de autorización en `docs/authorization.md`: qué decide cada capa y por qué los permisos no viajan en el token

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
Task: "T032 Pruebas de generarCombinaciones en libs/domain/src/services/generar-combinaciones.spec.ts"
Task: "T033 Pruebas de validarLimites en libs/domain/src/services/validar-limites.spec.ts"
Task: "T035 Pruebas de puedeCambiarEstado en libs/domain/src/services/puede-cambiar-estado.spec.ts"
Task: "T036 Pruebas de construirEntradasDeBitacora en libs/domain/src/services/construir-entradas-bitacora.spec.ts"
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
