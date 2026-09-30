# Contrato: puertos de la capa de aplicación

**Feature**: 001-catalog-rbac · **Fase**: 1 (segunda pasada)

Los casos de uso se escriben **solo** contra estas interfaces. Ninguna menciona Firestore, Angular
ni ningún SDK. Es lo que permite probar dominio y aplicación con Vitest sin emuladores.

## Puertos

```typescript
// ───────── Contexto de la operación ─────────
/**
 * El tenantId llega del cliente (una cuenta puede estar en varios comercios, FR-005)
 * pero este objeto solo se construye DESPUÉS de verificar la membresía activa.
 * Los casos de uso reciben un contexto ya verificado; no verifican pertenencia.
 */
interface OperationContext {
  readonly tenantId: TenantId;
  readonly actorUid: Uid;
  readonly actorName: string;
  readonly requestId: string;
}

// ───────── Autorización ─────────
interface AuthorizationService {
  /** Lanza PermissionDeniedError si el rol de la membresía no concede el permiso. Default-deny. */
  assert(ctx: OperationContext, permission: Permission): Promise<void>;
  assertOwner(ctx: OperationContext): Promise<void>;
  permissionsOf(ctx: OperationContext): Promise<ReadonlySet<Permission>>;
}

// ───────── Unidad de trabajo ─────────
/**
 * Todo lo que ocurre dentro de run() se confirma junto o no ocurre.
 * Es lo que hace cumplir la atomicidad de FR-030 en ambos sentidos,
 * sin código defensivo en cada caso de uso.
 */
interface UnitOfWork {
  run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T>;
}

interface TransactionScope {
  readonly products: ProductRepository;
  readonly variants: VariantRepository;
  readonly costs: VariantCostsRepository;
  readonly skuIndex: SkuIndexRepository;
  readonly audit: AuditLogRepository;
  readonly members: MembershipRepository;
  readonly roles: RoleRepository;
}

// ───────── Repositorios ─────────
interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  save(product: Product, expectedVersion: number): Promise<void>;  // lanza VersionConflictError
  create(product: Product): Promise<void>;
}

interface VariantRepository {
  findById(productId: ProductId, id: VariantId): Promise<Variant | null>;
  findByProduct(productId: ProductId): Promise<Variant[]>;
  save(variant: Variant, expectedVersion: number): Promise<void>;
  createMany(variants: Variant[]): Promise<void>;
}

/** Separado porque el costo vive en otro documento, con su propia regla (FR-015). */
interface VariantCostsRepository {
  findByProduct(productId: ProductId): Promise<Record<VariantId, Money>>;
  setMany(productId: ProductId, costs: Record<VariantId, Money>): Promise<void>;
}

interface SkuIndexRepository {
  /** Reserva el SKU. Lanza SkuConflictError si ya está tomado por otra variante. */
  reserve(sku: Sku, variantId: VariantId, productId: ProductId): Promise<void>;
  release(sku: Sku): Promise<void>;   // solo marca archived; nunca borra (FR-023)
  findBySku(sku: Sku): Promise<SkuIndexEntry | null>;
}

interface AuditLogRepository {
  /** Solo append. No existe update ni delete: la imposibilidad es del tipo (FR-032). */
  append(entries: AuditEntry[]): Promise<void>;
  query(filter: AuditFilter, cursor?: Cursor): Promise<Page<AuditEntry>>;
}

interface MembershipRepository {
  findByUid(uid: Uid): Promise<Membership | null>;   // dentro del tenant del contexto
  save(membership: Membership): Promise<void>;
}

interface RoleRepository {
  findById(id: RoleId): Promise<Role | null>;
  list(): Promise<Role[]>;
  save(role: Role): Promise<void>;
  delete(id: RoleId): Promise<void>;   // lanza si memberCount > 0
}

// ───────── Fuera de la transacción de Firestore ─────────
interface SecurityEventRecorder {
  record(event: SecurityEvent): Promise<void>;   // FR-004, capa de servicios
}

interface Clock { now(): Timestamp; }
interface IdGenerator { next<T extends string>(): T; }
```

**Nota sobre `AuditLogRepository`**: no expone `update` ni `delete`. La inmutabilidad no es una
regla que alguien recuerda respetar: es que el método no existe. Las reglas de Firestore son la
segunda barrera para quien intente evitar esta capa.

**Nota sobre identidad**: ya **no** hace falta un `IdentityService` que sincronice custom claims.
Al resolverse la autorización leyendo la membresía, dar de baja o traspasar la propiedad es una
escritura en Firestore y nada más. Eso elimina la operación en dos fases que la primera pasada
tuvo que justificar en Complexity Tracking: Firebase Auth queda solo para autenticar.

## Casos de uso

Cada uno es una clase con un único método `execute`, dependencias por constructor, sin estado.

| Caso de uso | Permiso | Escribe bitácora | Requisitos |
|---|---|---|---|
| `CrearProducto` | `catalog.write` | No | FR-017, FR-020 |
| `ActualizarDetallesProducto` | `catalog.write` | No | FR-027 |
| `DefinirOpcionesProducto` | `catalog.write` | No | FR-017, FR-018, FR-024, FR-025, FR-026 |
| `AsignarSkuVariante` | `catalog.write` | No | FR-021, FR-023a |
| `CambiarEstadoProducto` | `catalog.write` | No | FR-023a |
| `ArchivarProducto` / `ArchivarVariante` | `catalog.write` | No | FR-023 |
| `EditarPrecioVariante` | **`variant.price.write`** | **Sí** | FR-015, FR-028, FR-030, FR-031 |
| `EditarCostoVariante` | **`variant.cost.write`** | **Sí** | FR-015, FR-028 |
| `AjustarStockVariante` | `variant.stock.write` | **Sí** | FR-029, FR-030, FR-031 |
| `InvitarColaborador` | Propietario | No | FR-005, FR-006, FR-007 |
| `AceptarInvitacion` | — | **Sí** | FR-005, FR-007, FR-031a |
| `CrearRol` / `ActualizarRol` / `EliminarRol` | Propietario | **Sí** | FR-009, FR-012 a FR-014, FR-031a |
| `AsignarRol` | Propietario | **Sí** | FR-008, FR-031a |
| `DarDeBajaMembresia` | Propietario | **Sí** | FR-008a, FR-031a |
| `TransferirPropiedad` | Propietario | **Sí** | FR-011, FR-031a |

Nueve casos de uso escriben bitácora, frente a tres en la primera pasada. Es el efecto directo de
FR-031a.

## Servicios de dominio puros (sin puertos, sin E/S)

Se prueban como funciones: entrada dentro, salida fuera, sin dobles.

```typescript
/** Producto cartesiano de los valores de las opciones. Base de FR-018. */
function generarCombinaciones(options: VariationOption[]): Combination[];

/**
 * Reconcilia la estructura de variación con las variantes existentes (FR-024).
 * Núcleo de la feature y el más denso: preserva, crea e identifica lo que falta asignar.
 * Las creadas nacen SIN existencias definidas, no en cero (FR-029).
 */
function reconciliarVariantes(
  actuales: Variant[],
  opcionesNuevas: VariationOption[],
  asignaciones: Assignment[],
): { preservadas: Variant[]; creadas: Variant[]; archivadas: Variant[]; faltanAsignaciones: VariantId[] };

/** Topes de 5 opciones y 100 combinaciones (FR-025). Se evalúa antes de crear nada. */
function validarLimites(options: VariationOption[]): Result<void, LimiteExcedido>;

/** Transiciones permitidas de estado (FR-023a). */
function puedeCambiarEstado(p: Product, destino: ProductStatus): Result<void, VariantesIncompletas>;

/** Normalización del SKU para comparar unicidad (FR-021). */
function normalizarSku(raw: string): Sku;

/** Normalización del nombre para búsqueda por prefijo (research §7). */
function normalizarNombre(raw: string): string;

/** Aritmética de dinero sobre enteros en la unidad mínima. Nunca punto flotante. */
function money(amount: number, currency: CurrencyCode): Money;

/** Construye las entradas de bitácora de un cambio, con su tipo de evento. Pura (FR-031). */
function construirEntradasDeBitacora(
  ctx: OperationContext, tipo: AuditEventType, cambios: CambioDeValor[],
  batchId: BatchId, at: Timestamp,
): AuditEntry[];
```

`reconciliarVariantes`, `validarLimites` y `money` son el "motor" cuyas pruebas puras exige el
principio X, junto con `construirEntradasDeBitacora`, que garantiza que ningún cambio registrable
quede sin su entrada con el tipo correcto.
