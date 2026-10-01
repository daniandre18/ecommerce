# Data Model: Gestión de Catálogo con Control de Acceso por Rol

**Feature**: 001-catalog-rbac · **Fecha**: 2026-09-30 · **Fase**: 1 (segunda pasada)

Dos vistas del mismo modelo: los **tipos de dominio** (puros, sin Firebase, compilables en Node y
navegador) y su **disposición en Firestore**. Los tipos de dominio son la fuente de verdad; el
esquema de Firestore es un detalle de `infrastructure/`.

## Árbol de colecciones

```text
tenants/{tenantId}                     ← Inquilino
  members/{uid}                        ← Membresía: UNA POR CUENTA POR COMERCIO (FR-005)
  roles/{roleId}                       ← Rol (predefinidos + personalizados)
  invitations/{invitationId}           ← Invitación
  products/{productId}                 ← Producto
    variants/{variantId}               ← Variante: SKU, precio de venta, comparativo, stock
    private/costs                      ← Costos de TODAS las variantes del producto
  skuIndex/{SKU_NORMALIZADO}           ← Índice de unicidad de SKU (FR-021)
  auditLog/{entryId}                   ← Entrada de bitácora (solo anexado, FR-032)
  securityEvents/{eventId}             ← Evento de seguridad (FR-004)
  config/secrets                       ← Credenciales de pasarelas · solo Propietario
  config/billing                       ← Facturación de la suscripción · solo Propietario
```

Las cuentas **no** viven bajo `tenants/`: son de Firebase Auth y pertenecen a las personas, no a
los comercios (FR-001). Lo que vive bajo el inquilino es la membresía.

Las imágenes van a Cloud Storage bajo `tenants/{tenantId}/products/{productId}/…`; en Firestore
solo quedan sus referencias.

## Dos decisiones de forma que conviene entender antes de leer el resto

### Por qué el costo está en otro documento

Firestore **no tiene seguridad a nivel de campo**: quien puede leer un documento lee todos sus
campos. FR-015 exige que sin el permiso de costo el importe **no sea visible**. Por eso el costo no
puede estar en la variante.

Va en `products/{pid}/private/costs`, **un solo documento por producto** con un mapa
`{ [variantId]: costo }`. Así la regla que exige `cost.read` protege un documento entero, y leer
los costos de las 100 variantes de un producto cuesta **una** lectura.

### Por qué la membresía se lee en las reglas

Una cuenta pertenece a varios comercios, así que el inquilino no puede viajar en un custom claim.
Las reglas resuelven la pertenencia leyendo `members/{uid}`. Eso cuesta +1 lectura por solicitud
—las reglas se evalúan una vez por consulta, no por documento— y compra **revocación inmediata**,
que es lo que FR-008a exige. Los campos que las reglas necesitan están denormalizados ahí.

## Invariantes transversales

| Invariante | Requisito | Dónde se hace cumplir |
|---|---|---|
| Ningún dato cruza de inquilino | FR-002 | Reglas: membresía activa en el `tenantId` de la ruta |
| Ninguna escritura llega del cliente | Decisión 1 | Reglas: `allow write: if false` en todo el árbol |
| Los permisos de una membresía no afectan otra | FR-005 | La membresía es por comercio; nada se comparte entre ellas |
| Exactamente un Propietario por inquilino | FR-011 | Transacción del caso de uso de traspaso |
| Cambio y bitácora, una unidad indivisible | FR-030, FR-033 | Una sola transacción en la Cloud Function |
| Entradas de bitácora jamás se editan ni borran | FR-032 | Reglas: `create/update/delete: if false`; solo Admin SDK crea |
| El costo no se ve sin su permiso | FR-015 | Documento aparte con su propia regla |

## Entidades

### Tenant (Inquilino)

```typescript
interface Tenant {
  id: TenantId;
  name: string;
  ownerUid: Uid;                   // exactamente uno (FR-011)
  currency: CurrencyCode;          // la moneda es del inquilino (supuesto de dinero entero)
  createdAt: Timestamp;
  createdBy: PlatformOperatorId;   // FR-041
  status: 'active' | 'suspended';
}
```

Creado únicamente por el operador de plataforma (FR-041); ninguna operación de esta feature lo
crea.

### Account (Cuenta)

No tiene documento propio en Firestore: **es el usuario de Firebase Auth**. Pertenece a las
personas, no a los comercios, y se vincula a cada uno por su membresía. No tiene estado global de
acceso: se desactiva por comercio (FR-008a).

Un solo grupo de usuarios de Firebase Auth, sin multi-inquilinidad de Identity Platform. Eso
mantiene disponible la autenticación por teléfono y evita el costo de esa función.

### Membership (Membresía) — `members/{uid}`

```typescript
interface Membership {
  uid: Uid;
  tenantId: TenantId;
  roleId: RoleId;
  isOwner: boolean;        // denormalizado: lo leen las reglas sin ir al rol
  displayName: string;     // se copia a la bitácora al momento del hecho
  email: string;
  status: 'invited' | 'active' | 'disabled';
  invitedAt: Timestamp;
  activatedAt: Timestamp | null;
  disabledAt: Timestamp | null;
}
```

**Reglas**:
- El id del documento es el `uid` de Firebase Auth. Una cuenta puede tener una membresía en cada
  comercio; **cada una con su rol y su estado propios** (FR-005).
- El `uid` se guarda además como campo (T075): una cuenta encuentra sus comercios con una consulta
  de grupo sobre `members` filtrada por su uid, que es lo único que las reglas le permiten listar.
  Requiere el índice de grupo de colecciones sobre `members.uid` (`firestore.indexes.json`).
- `status: 'disabled'` es baja lógica y **solo de ese comercio**: no afecta las membresías de esa
  cuenta en otros comercios ni su capacidad de autenticarse (FR-008a).
- El documento **nunca** se borra si tiene entradas de bitácora asociadas. Reactivar vuelve a
  `'active'` conservando el historial.
- `isOwner` está denormalizado a propósito: evita un segundo `get()` en las reglas. Solo cambia en
  un traspaso de propiedad, dentro de su transacción.

**Transiciones**: `invited → active` · `active → disabled` · `disabled → active`. No hay
transición a "eliminada".

### Role (Rol) — `roles/{roleId}`

```typescript
type Permission =
  | 'catalog.read'        | 'catalog.write'
  | 'variant.stock.write'
  | 'variant.price.write'  // precio de venta y comparativo (FR-015)
  | 'variant.cost.read'    // ver el costo
  | 'variant.cost.write'   // editarlo; implica poder verlo
  | 'audit.read'
  | 'team.read';

interface Role {
  id: RoleId;
  tenantId: TenantId;
  name: string;
  permissions: Permission[];           // vacío al crearse (FR-009)
  preset: 'owner' | 'catalog' | null;  // null = definido por el comercio
  editable: boolean;                   // false para 'owner' (FR-016)
  memberCount: number;                 // evita consultar para bloquear el borrado (FR-013)
  createdAt: Timestamp;
}
```

**Los permisos reservados al Propietario no son valores de `Permission`** (FR-014): acceso a
`config/secrets`, a `config/billing` y a la administración de equipo, roles y permisos no existen
como concesión, así que no pueden activarse en ningún rol personalizado. La reserva constitucional
es una propiedad del tipo, no una validación que alguien puede omitir.

**Roles predefinidos sembrados al crear el inquilino**:

| `roleId` | `permissions` | Notas |
|---|---|---|
| `owner` | — (acceso total por `isOwner`, no por lista) | `editable: false`, indeleble |
| `catalog` | `catalog.read`, `catalog.write`, `variant.stock.write` | **Sin precios y sin costo** (FR-016) |

**Reglas**: no se elimina un rol con `memberCount > 0` (FR-013). Cambiar `permissions` rige en la
operación siguiente de cada miembro, sin tocar tokens, porque los permisos se leen de aquí en cada
mutación (FR-008). Todo cambio de rol o de permisos deja entrada de bitácora (FR-031a).

### Invitation (Invitación) — `invitations/{invitationId}`

```typescript
interface Invitation {
  id: InvitationId;
  tenantId: TenantId;
  email: string;               // normalizado: minúsculas, sin espacios al borde
  roleId: RoleId;              // nunca `owner`: la propiedad solo se traspasa
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: Timestamp;
  expiresAt: Timestamp;        // 14 días
  acceptedAt: Timestamp | null;
  createdBy: Uid;
}
```

**Reglas**: sin acceso hasta aceptar (FR-007); sin tope de cantidad (FR-006). Al aceptar se crea la
`Membership` **de ese comercio**; si la persona ya tiene cuenta, se le suma una membresía y no se
crea una cuenta nueva. Invitar a quien ya es miembro **de este** comercio se rechaza. Ya no hay
obligación de ocultar que el contacto tiene cuenta en otro inquilino. Hay a lo sumo una invitación
pendiente por correo: invitar de nuevo la renueva. Solo la acepta una sesión con ese mismo correo.

### Product (Producto) — `products/{productId}`

```typescript
interface Product {
  id: ProductId;
  tenantId: TenantId;
  name: string;
  nameNormalized: string;         // minúsculas sin acentos, para búsqueda por prefijo
  description: string;
  images: ImageRef[];
  options: VariationOption[];     // máximo 5 (FR-025)
  status: 'draft' | 'active' | 'unlisted';   // FR-023a
  archived: boolean;              // independiente del status (FR-023)
  variantCount: number;           // ≤ 100 (FR-025)
  hasIncompleteVariants: boolean; // bloquea activar (FR-023a)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: number;                // control de concurrencia (FR-027)
}

interface VariationOption {       // "opción" en la interfaz (FR-017)
  id: OptionId;
  name: string;                   // libre: color, tamaño, capacidad…
  values: OptionValue[];          // ordenados, sin duplicados (FR-022)
  position: number;
}

interface OptionValue { id: ValueId; label: string; position: number; }
```

**Transiciones de estado** (FR-023a):

```text
draft ──(todas las variantes completas)──> active
draft ──(todas las variantes completas)──> unlisted
active <──────────────────────────────> unlisted
cualquiera ──> draft                    (siempre permitido)
```

`active` y `unlisted` exigen `hasIncompleteVariants === false`. `archived` es ortogonal: un
producto archivado conserva su `status` y sus SKU quedan reservados.

**Validaciones**: `options.length <= 5`; producto de las longitudes de `values` `<= 100`; nombres
de opción únicos dentro del producto; etiquetas de valor únicas dentro de su opción (FR-022).

### Variant (Variante) — `products/{productId}/variants/{variantId}`

```typescript
interface Variant {
  id: VariantId;
  tenantId: TenantId;
  productId: ProductId;
  optionValues: Record<OptionId, ValueId>;  // combinación única (FR-022)
  sku: Sku | null;                          // null mientras esté incompleta
  price: Money | null;                      // precio de venta; null = sin definir
  compareAtPrice: Money | null;             // precio comparativo, el valor tachado
  stock: StockLevel;                        // sin definir vs. cero (FR-029)
  images: ImageRef[];
  complete: boolean;                        // derivado: sku !== null
  archived: boolean;
  version: number;
}

type StockLevel =
  | { kind: 'undefined' }                  // nunca se cargó
  | { kind: 'quantity'; value: number };   // incluye 0 (FR-029)
```

**El costo NO está aquí**, por la razón explicada arriba.

**Variante recién generada** (FR-024): nace con `sku: null`, `price: null`,
`compareAtPrice: null` y `stock: { kind: 'undefined' }` — **no en cero**, que es un estado
distinto (FR-029).

**Variante implícita** (FR-020): un producto sin opciones tiene exactamente una variante con
`optionValues: {}`. El resto del sistema no la distingue: mismo tipo, mismos campos, mismos casos
de uso.

### VariantCosts — `products/{productId}/private/costs`

```typescript
interface VariantCosts {
  productId: ProductId;
  tenantId: TenantId;
  costs: Record<VariantId, Money>;   // costo de adquisición por variante
  updatedAt: Timestamp;
}
```

Un documento por producto, protegido por su propia regla (`variant.cost.read`). Con el tope de 100
variantes y 1 MiB por documento, entra holgado. Quien no tenga el permiso simplemente no pide este
documento, y si lo pidiera la regla lo deniega.

### Money

```typescript
interface Money { amount: number; currency: CurrencyCode; }  // amount ENTERO
```

`amount` es un **entero en la unidad mínima de la moneda**, nunca coma flotante: es aritmética de
dinero, no localización. La moneda se define a nivel de inquilino. La presentación y la conversión
quedan fuera de alcance.

### SkuIndexEntry — `skuIndex/{SKU_NORMALIZADO}`

```typescript
interface SkuIndexEntry {
  sku: Sku;              // forma original, tal como la escribió la persona
  variantId: VariantId;
  productId: ProductId;
  archived: boolean;     // true = sigue reservado, no reutilizable (FR-023)
  createdAt: Timestamp;
}
```

El id del documento es el SKU normalizado (mayúsculas, sin espacios al borde); la unicidad por
inquilino sale de la ruta. Se crea con `tx.create` en la misma transacción que la variante, de modo
que la colisión falle de forma atómica (FR-021).

### AuditEntry (Entrada de bitácora) — `auditLog/{entryId}`

```typescript
type AuditEventType =
  | 'price.changed'        // valor anterior/nuevo: importes
  | 'stock.adjusted'       // valor anterior/nuevo: cantidades o "sin definir"
  | 'role.changed'         // valor anterior/nuevo: rol o conjunto de permisos
  | 'platform.action';     // valor anterior/nuevo: estado del comercio

interface AuditEntry {
  id: AuditEntryId;
  tenantId: TenantId;
  type: AuditEventType;                      // FR-031
  actorUid: Uid | PlatformOperatorId;
  actorName: string;                         // copia al momento del hecho (FR-031)
  actorKind: 'member' | 'platform-operator'; // FR-042
  at: Timestamp;                             // del servidor, nunca del cliente
  entity: { kind: 'variant' | 'product' | 'role' | 'membership' | 'tenant'; id: string; productId?: ProductId };
  before: unknown;
  after: unknown;
  batchId: BatchId | null;                   // agrupa una edición masiva (FR-030)
}
```

En el dominio se modela como **unión etiquetada** por `type`, de modo que `before` y `after` tengan
el tipo correcto en cada caso en vez de ser `unknown`.

**Qué se registra** (FR-030 y FR-031a): cambios de precio y de existencias; creación, edición y
borrado de roles; cambios de permisos; asignación y revocación de rol; alta y baja de membresía;
traspaso de propiedad; y acciones del operador de plataforma.

**Inmutabilidad** (FR-032): las reglas niegan `create`, `update` y `delete` a todo cliente. Solo el
Admin SDK escribe, y solo dentro de la transacción del cambio.

**Índices compuestos requeridos**: `(entity.id, at desc)`, `(actorUid, at desc)` y `(type, at desc)`
para cubrir FR-034 y el escenario 6 de la Historia 3. Paginación por cursor.

**Retención**: 7 años sin purga automática (FR-035).

### SecurityEvent — `securityEvents/{eventId}`

```typescript
interface SecurityEvent {
  id: string;
  tenantId: TenantId;      // el inquilino cuyos datos se intentó alcanzar
  actorUid: Uid | null;
  kind: 'cross-tenant-access' | 'permission-denied';
  at: Timestamp;
  detail: { path: string; claimedTenantId: TenantId | null };
}
```

Registra los intentos denegados **que atraviesan la capa de servicios** (FR-004). Los rechazados en
la capa de reglas quedan explícitamente fuera: esa capa deniega pero no puede escribir. El propio
FR-004 lo declara, así que ya no es una desviación del plan.

### ImageRef

```typescript
interface ImageRef { storagePath: string; alt: string; position: number; }
```

`alt` es obligatorio para WCAG 2.2 AA (FR-038a).

## Concurrencia

`version` en `Product` y `Variant` (FR-027). El caso de uso recibe la versión que el cliente leyó;
si no coincide dentro de la transacción, se rechaza con conflicto en lugar de sobrescribir. No hay
fusión automática.

## Trazabilidad requisito → modelo

| Requisito | Dónde vive |
|---|---|
| FR-001, FR-002 | Ruta `tenants/{tid}/**` + membresía activa; la cuenta queda fuera a propósito |
| FR-003, FR-005 | `members/{uid}` por comercio; el `tenantId` de la ruta se verifica, no se confía |
| FR-004 | `securityEvents`, solo capa de servicios |
| FR-008, FR-008a | `Membership.status`, `Role.permissions` leídos frescos en cada mutación |
| FR-009, FR-012 a FR-016 | `Permission` sin los permisos reservados; `variant.cost.*` separado de `variant.price.write` |
| FR-011 | `Tenant.ownerUid` y `Membership.isOwner` |
| FR-015 | `VariantCosts` como documento aparte con su propia regla |
| FR-017, FR-018, FR-025 | `Product.options`, topes de 5 y 100 |
| FR-019, FR-020 | `Variant`; variante implícita con `optionValues: {}` |
| FR-021, FR-023 | `skuIndex/{SKU}` con `archived` |
| FR-022 | Unicidad de combinación y de etiquetas |
| FR-023a, FR-024 | `Product.status`, `hasIncompleteVariants`, `Variant.complete` |
| FR-027 | `version` |
| FR-028 | `price`, `compareAtPrice` en la variante; `VariantCosts` aparte |
| FR-029 | `StockLevel` como unión etiquetada |
| FR-030 a FR-035, FR-031a | `auditLog` con `type`, `batchId`, índices y retención |
| FR-041, FR-042 | `Tenant.createdBy`, `AuditEntry.actorKind` y `type: 'platform.action'` |
