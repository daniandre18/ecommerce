# Contrato: Cloud Functions callable

**Feature**: 001-catalog-rbac · **Fase**: 1 (segunda pasada)

Toda mutación del sistema entra por aquí. El cliente **nunca** escribe en Firestore.

## Reglas comunes a todas las funciones

**Región**: una sola, la misma que Firestore, para no pagar latencia entre regiones.

### El cambio de esta revisión: `tenantId` es un parámetro, y se verifica

En la primera pasada el inquilino venía en un custom claim y ninguna función lo aceptaba como
parámetro. Con una cuenta en varios comercios (FR-005) eso ya no es posible: **el cliente declara
sobre qué comercio opera y el servidor comprueba la membresía**. El cliente propone, el servidor
verifica — que es exactamente lo que FR-003 pide, siempre que la verificación exista.

**Precondiciones que toda función verifica, en este orden** — cortar en la primera que falle:

1. `request.auth` presente → si no, `unauthenticated`.
2. App Check válido (`enforceAppCheck: true`) → si no, `failed-precondition`.
3. `tenantId` presente en la carga útil → si no, `invalid-argument`.
4. **Dentro de la transacción**: `tenants/{tenantId}/members/{uid}` existe y `status === 'active'`
   → si no, `permission-denied` y se registra un `SecurityEvent` (FR-004).
5. El rol de esa membresía concede el permiso requerido → si no, `permission-denied`.
6. Toda otra referencia a documentos se construye a partir de ese `tenantId` **ya verificado**.

El paso 4 no es una formalidad: es el único lugar donde se decide que esta persona puede tocar este
comercio. Se ejecuta dentro de la transacción para que una baja concurrente no se cuele.

**Envoltura de respuesta**:

```typescript
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; details?: unknown };

type ErrorCode =
  | 'unauthenticated' | 'permission-denied' | 'not-found'
  | 'sku-conflict'            // FR-021
  | 'version-conflict'        // FR-027
  | 'limit-exceeded'          // FR-025
  | 'incomplete-variants'     // FR-023a
  | 'audit-write-failed'      // FR-033
  | 'invalid-argument';
```

**Idempotencia**: las funciones que crean reciben un `requestId` (UUID del cliente) que se guarda
en el documento creado. Un reintento con el mismo `requestId` devuelve el resultado original en
lugar de duplicar.

**Atomicidad de la bitácora** (FR-030, FR-033): en toda función marcada como "escribe bitácora", el
cambio y su entrada se confirman en **una sola transacción**. No queda entrada sin cambio ni cambio
sin entrada, en ninguno de los dos sentidos.

## Catálogo

Todas reciben `tenantId` además de los parámetros listados.

### `createProduct`

```typescript
Request  { tenantId: TenantId; requestId: string; name: string; description: string }
Response { productId: ProductId }
```

Permiso: `catalog.write`. Crea el producto en `status: 'draft'` con una variante implícita
(FR-020). No escribe bitácora: crear un producto no es alteración de precio, stock ni permisos.

### `updateProductDetails`

```typescript
Request  { tenantId; productId; version: number; name?; description?; images?: ImageRef[] }
Response { version: number }
```

Permiso: `catalog.write`. `version-conflict` si la versión no coincide (FR-027).

### `setProductOptions`

El corazón del editor de variaciones (FR-017, FR-018, FR-024).

```typescript
Request  {
  tenantId; productId; version: number;
  options: Array<{ id?: OptionId; name: string;
                   values: Array<{ id?: ValueId; label: string }> }>;
  // obligatorio al agregar una opción a un producto con variantes existentes (FR-024)
  assignments?: Array<{ variantId: VariantId; optionId: OptionId; valueId: ValueId }>;
}
Response {
  version: number;
  created: VariantId[];      // combinaciones nuevas, incompletas
  preserved: VariantId[];    // variantes existentes, intactas
  archived: VariantId[];     // afectadas por quitar un valor (FR-026)
}
```

Permiso: `catalog.write`.

**Comportamiento obligatorio**:
- Si el producto ya tiene variantes con SKU, importes o stock y se agrega una opción, `assignments`
  debe cubrir **todas** esas variantes; si falta alguna → `invalid-argument` con la lista (FR-024).
- Las variantes preservadas conservan SKU, precio, precio comparativo, costo, stock e imágenes.
- Las combinaciones nuevas nacen con `sku: null`, `price: null`, `compareAtPrice: null` y
  `stock: { kind: 'undefined' }` — **sin existencias definidas, no en cero** (FR-024, FR-029).
- Más de 5 opciones o más de 100 combinaciones → `limit-exceeded`, indicando cuántas produciría,
  **antes** de crear nada (FR-025).
- Renombrar una opción o un valor (mismo `id`, distinto texto) **no** regenera ni archiva variantes
  (FR-026).
- Quitar un valor en uso archiva sus variantes; sus SKU siguen reservados (FR-023, FR-026).
- Dos valores con la misma etiqueta dentro de una opción, o dos opciones con el mismo nombre, →
  `invalid-argument` señalando cuál se repite (FR-022). La comparación ignora mayúsculas y espacios
  al borde.

### `setProductStatus`

```typescript
Request  { tenantId; productId; version: number; status: 'draft'|'active'|'unlisted' }
Response { version: number }
```

Permiso: `catalog.write`. Pasar a `active` o `unlisted` con variantes incompletas →
`incomplete-variants`, con la lista de variantes que lo bloquean (FR-023a).

### `setVariantSku`

```typescript
Request  { tenantId; productId; variantId; version: number; sku: string }
Response { version: number; complete: boolean }
```

Permiso: `catalog.write`. Crea `skuIndex/{SKU_NORMALIZADO}` en la misma transacción; si ya existe y
apunta a otra variante → `sku-conflict` con el `variantId` que lo ocupa (FR-021).

### `archiveProduct` / `archiveVariant`

```typescript
Request  { tenantId; productId; variantId?; version: number }
Response { version: number }
```

Permiso: `catalog.write`. Archiva; **nunca** borra. Marca la entrada de `skuIndex` como
`archived: true` conservando la reserva (FR-023).

## Importes y existencias — escriben bitácora

### `setVariantPrice`

```typescript
Request  {
  tenantId; productId; requestId: string;
  changes: Array<{ variantId: VariantId; version: number;
                   price?: Money; compareAtPrice?: Money }>;  // 1..100
}
Response { batchId: BatchId; updated: number; auditEntryIds: AuditEntryId[] }
```

Permiso: **`variant.price.write`** — independiente de `catalog.write` y de los permisos de costo
(FR-015). El rol predefinido de Catálogo no lo tiene (FR-016). Cubre precio de venta y precio
comparativo, que son los dos importes visibles.

**Obligatorio**: una entrada de bitácora **por variante**, todas con el mismo `batchId` y
`type: 'price.changed'` (FR-030, FR-031). Si el rol no tiene permiso sobre **alguna** de las
variantes del lote, **ninguna** se aplica. `changes.length > 100` → `limit-exceeded`.

### `setVariantCost`

Nueva en esta revisión (FR-015, FR-028).

```typescript
Request  {
  tenantId; productId; requestId: string;
  changes: Array<{ variantId: VariantId; cost: Money }>;  // 1..100
}
Response { batchId: BatchId; updated: number; auditEntryIds: AuditEntryId[] }
```

Permiso: **`variant.cost.write`**, distinto de `variant.price.write`. Escribe en
`products/{pid}/private/costs`, no en la variante. Registra bitácora con `type: 'price.changed'` y
entidad `variant`, distinguiendo en el detalle que el importe afectado es el costo.

### `setVariantStock`

```typescript
Request  {
  tenantId; productId; requestId: string;
  changes: Array<{ variantId: VariantId; version: number; stock: StockLevel }>;  // 1..100
}
Response { batchId: BatchId; updated: number; auditEntryIds: AuditEntryId[] }
```

Permiso: `variant.stock.write`. Mismas obligaciones de bitácora y atomicidad.
`type: 'stock.adjusted'`. Distingue "sin definir" de cero (FR-029).

## Equipo, roles y permisos — ahora todas escriben bitácora

**Cambio de esta revisión**: FR-031a obliga a registrar todo cambio de rol, de permisos, de
membresía y de propiedad. Estas funciones, que antes no tocaban la bitácora, ahora escriben su
entrada `type: 'role.changed'` **dentro de la misma transacción**, con la misma regla de
atomicidad. Es el evento de mayor riesgo interno de la feature, y pasa a ser inborrable.

Todas exigen `isOwner` en el comercio indicado. No existe permiso delegable que las habilite
(FR-014).

### `inviteCollaborator`

```typescript
Request  { tenantId; requestId: string; email: string; roleId: RoleId }
Response { invitationId: InvitationId }
```

Sin tope de cantidad (FR-006). Si el correo ya es miembro **de este** comercio →
`invalid-argument`. Que tenga cuenta en otro comercio es irrelevante y **ya no se oculta**: la
revisión de alcance eliminó esa obligación (FR-005).

### `acceptInvitation`

```typescript
Request  { invitationToken: string }
Response { tenantId: TenantId; roleId: RoleId }
```

Única función que no recibe `tenantId`: lo deduce del token de invitación. Crea la `Membership` de
ese comercio; si la persona ya tiene cuenta, **le suma una membresía** en lugar de crear una cuenta
nueva (FR-005). Rechaza invitaciones caducadas o revocadas. Escribe bitácora (alta de membresía,
FR-031a).

### `revokeInvitation`, `createRole`, `updateRole`, `deleteRole`, `assignRole`

```typescript
createRole  Request { tenantId; requestId; name: string }      // nace sin permisos (FR-009)
updateRole  Request { tenantId; roleId; name?; permissions?: Permission[] }
deleteRole  Request { tenantId; roleId }                       // falla si memberCount > 0 (FR-013)
assignRole  Request { tenantId; uid: Uid; roleId: RoleId }
```

Todas escriben bitácora con el conjunto de permisos anterior y el resultante (FR-031, FR-031a).

`updateRole` sobre el rol `owner` → `permission-denied`: es indeleble e ineditable (FR-016).
Cambiar `permissions` **no** toca tokens: rige en la operación siguiente porque los permisos se
leen de Firestore en cada mutación, y las reglas leen la membresía en cada lectura (FR-008).

### `setMembershipEnabled`

```typescript
Request  { tenantId; uid: Uid; enabled: boolean }
Response { status: 'active' | 'disabled' }
```

Baja lógica **de la membresía en ese comercio** (FR-008a): `status: 'disabled'`. No se toca la
cuenta de Firebase Auth ni las membresías de esa persona en otros comercios. El corte de acceso es
inmediato porque las reglas leen la membresía en cada solicitud; **no hace falta revocar tokens**.
La membresía no se borra y la bitácora la sigue nombrando (FR-031). Escribe bitácora.

### `transferOwnership`

```typescript
Request  { tenantId; toUid: Uid; newRoleIdForCurrentOwner: RoleId }
Response { ownerUid: Uid }
```

Exactamente un Propietario antes y después (FR-011). En una sola transacción: mueve
`Tenant.ownerUid`, cambia `isOwner` en ambas membresías, reasigna sus roles y escribe la entrada de
bitácora. Como `isOwner` se lee de la membresía y no de un token, el cambio rige de inmediato y
**no hace falta revocar tokens**.

## Lecturas: no hay funciones

Las lecturas van directas del cliente a Firestore, acotadas por reglas (ver `firestore-rules.md`).
No se expone ninguna callable de lectura: agregaría latencia y costo sin agregar seguridad.

## Contrato de errores para la interfaz

| `code` | Qué muestra la interfaz |
|---|---|
| `sku-conflict` | Señala qué variante ocupa el código (FR-021) |
| `version-conflict` | Avisa que alguien más editó y ofrece recargar; nunca sobrescribe (FR-027) |
| `limit-exceeded` | Dice cuántas combinaciones produciría y cuál es el tope (FR-025) |
| `incomplete-variants` | Lista las variantes que impiden activar (FR-023a) |
| `audit-write-failed` | Dice que la operación no pudo completarse y **no** se aplicó (FR-033) |
| `permission-denied` | No revela la existencia del recurso |
