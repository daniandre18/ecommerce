# Data Model: Catálogo de Cara a la Tienda

**Feature**: 002-storefront-catalog · **Fecha**: 2026-10-05 · **Fase**: 1

Amplía el modelo de la 001 ([data-model](../001-catalog-rbac/data-model.md)); no redefine nada de
lo que ahí está. Igual que en la 001, los **tipos de dominio** son la fuente de verdad y la
disposición en Firestore es un detalle de `libs/infrastructure`.

## Árbol de colecciones: qué se suma

```text
tenants/{tenantId}
  products/{productId}                 ← AMPLIADO: ficha de tienda, tipo, envío, categorías
    variants/{variantId}               ← AMPLIADO: GTIN, peso y dimensiones propios
  storefront/categoryTree              ← NUEVO: el árbol ENTERO de categorías, un documento
  storefront/sections                  ← NUEVO: Destacados y Ofertas, listas de hasta 40
  storefront/vocabulary                ← NUEVO: etiquetas y marcas del comercio, para sugerir
  slugIndex/{slug}                     ← NUEVO: reservas de URL amigable de productos
  gtinIndex/{GTIN14}                   ← NUEVO: reservas de GTIN, también de archivadas
```

`storefront` es una colección con tres documentos de id fijo. Las reglas la declaran de forma
explícita, como toda colección de la 001: sin comodín bajo el inquilino.

## Invariantes nuevos

| Invariante | Requisito | Dónde se hace cumplir |
|---|---|---|
| Ninguna categoría a más de 3 niveles ni dentro de su propia rama | FR-019 | `CategoryTree` (dominio), en la transacción del caso de uso |
| La visibilidad propia de una categoría solo cambia cuando se la oculta o muestra a ella | FR-021a | Nada la escribe en otro nodo: la efectiva se **deriva** (`effectiveVisibility`) |
| URL de producto única, incluidas archivadas y anteriores | FR-005, FR-008 | `slugIndex` con `tx.create` |
| URL de categoría única en todo el comercio | FR-021 | `CategoryTree`, en memoria, dentro de la transacción del documento |
| GTIN único, incluidas variantes archivadas | FR-030 | `gtinIndex` con `tx.create`; se libera solo al quitarlo |
| Ninguna sección supera 40 productos | FR-027a, FR-027b | Lista en `storefront/sections`; `addToSection` en la transacción |
| Todo cambio de condiciones efectivas de venta deja entrada | FR-032 | `saleConditionChanges` (dominio) + misma transacción |
| El envío gratis no aplica a un digital | FR-026 | `effectiveSaleConditions`; `setSaleConditions` rechaza digitales |

## Entidades

### Product (ampliado) — `products/{productId}`

Se suman estos campos a los de la 001:

```typescript
interface Product {
  // … todos los campos de la 001 …

  // URL amigable (FR-005 a FR-008)
  slug: Slug;
  slugLocked: boolean;          // true tras editarla a mano o al publicarse por primera vez
  slugNeedsReplacement: boolean; // la de respaldo de un nombre sin letras ni números (FR-006)

  // Buscadores, etiquetas, marca (FR-009 a FR-012)
  seoTitle: string | null;      // ≤ 70
  seoDescription: string | null; // ≤ 160
  tags: string[];               // ≤ 30, cada una ≤ 40, sin repetidas por forma normalizada
  tagsNormalized: string[];     // para `array-contains`
  brand: string | null;         // ≤ 70
  brandNormalized: string | null;

  // Tipo y envío (FR-013 a FR-017, FR-026)
  kind: 'physical' | 'digital';
  weightGrams: number | null;            // entero > 0
  dimensionsMm: Dimensions | null;       // enteros > 0
  missingShippingData: boolean;          // caché, como hasIncompleteVariants (FR-017)
  priceVisible: boolean;                 // por defecto true
  freeShipping: boolean;                 // por defecto false; se conserva aunque sea digital

  // Video (FR-018)
  video: ExternalVideo | null;

  // Categorías (FR-022)
  categoryIds: CategoryId[];             // solo las asignadas, ≤ 20; nunca sus ancestros

  // Catálogos externos (FR-031)
  mpn: string | null;                    // ≤ 70
  ageGroup: AgeGroup | null;
  gender: Gender | null;
}

interface Dimensions { length: number; width: number; height: number; } // mm, enteros > 0

interface ExternalVideo {
  provider: 'youtube' | 'vimeo';
  videoId: string;
  position: number;            // en la misma secuencia que images[].position
}

type AgeGroup = 'newborn' | 'infant' | 'toddler' | 'kids' | 'adult';
type Gender = 'male' | 'female' | 'unisex';
```

**Lo que el producto NO guarda, a propósito**:

- **En qué secciones está**: lo dice solo `storefront/sections` (research §4). Una sola fuente de
  verdad para el tope.
- **Los ancestros de sus categorías**: mover una categoría no puede reescribir productos
  (research §2).
- **La visibilidad de sus categorías**: se deriva del árbol.

**Etiquetas de rango de edad en el panel** (FR-031): la taxonomía se guarda y se envía; el panel
muestra `newborn` → "0 a 3 meses", `infant` → "3 a 12 meses", `toddler` → "1 a 5 años",
`kids` → "5 a 13 años", `adult` → "Adulto". El mapeo vive en la capa de presentación.

**Transición que cambia**: `SetProductStatus` de la 001, al pasar a `active` o `unlisted` por
primera vez, pone `slugLocked: true`. No cambia ninguna otra regla de estado: la falta de datos de
envío **no** bloquea (FR-017).

### Variant (ampliada) — `products/{productId}/variants/{variantId}`

```typescript
interface Variant {
  // … todos los campos de la 001 …
  gtin: Gtin | null;
  weightGrams: number | null;       // null = hereda del producto
  dimensionsMm: Dimensions | null;  // null = hereda del producto
}
```

`effectiveShipping(product, variant)` devuelve el valor efectivo y su origen (`'own' | 'inherited'`),
que es lo que la tabla de variantes muestra (FR-015).

### CategoryTree — `storefront/categoryTree`

```typescript
interface CategoryTree {
  tenantId: TenantId;
  nodes: Record<CategoryId, CategoryNode>;   // ≤ 1.000 (research §1)
  updatedAt: Timestamp;
}

interface CategoryNode {
  id: CategoryId;
  name: string;                 // único entre hermanas, comparado normalizado (FR-020)
  slug: Slug;                   // plana, única en todo el árbol (FR-021)
  previousSlugs: Slug[];        // reservadas para redirigir (FR-021)
  parentId: CategoryId | null;  // null = primer nivel
  position: number;             // orden entre hermanas
  hidden: boolean;              // SOLO la propia (FR-021a)
}
```

**Derivados, nunca guardados**:

```typescript
// libs/domain/src/services/effective-visibility.ts
type EffectiveVisibility =
  | { visible: true }
  | { visible: false; hiddenBy: 'self' }
  | { visible: false; hiddenBy: 'ancestor'; ancestorId: CategoryId };

function effectiveVisibility(tree: CategoryTree): ReadonlyMap<CategoryId, EffectiveVisibility>;
function descendantsOf(tree: CategoryTree, id: CategoryId): CategoryId[];
function depthOf(tree: CategoryTree, id: CategoryId): 1 | 2 | 3;
```

**Operaciones del dominio** (puras, devuelven un árbol nuevo o lanzan):

| Operación | Valida |
|---|---|
| `createCategory(tree, { parentId, name, slug? })` | profundidad ≤ 3, nombre único entre hermanas, URL única y no reservada, ≤ 1.000 nodos |
| `renameCategory(tree, id, name)` | nombre único entre hermanas; **no** cambia la URL (FR-021) |
| `setCategorySlug(tree, id, slug)` | URL única y no reservada; la anterior pasa a `previousSlugs` |
| `moveCategory(tree, id, parentId, position)` | no dentro de su propia rama; la rama completa queda a ≤ 3 niveles; **no toca `hidden` de nadie** |
| `reorderCategory(tree, id, position)` | — |
| `setCategoryHidden(tree, id, hidden)` | **escribe solo ese nodo** |
| `deleteCategory(tree, id)` | sin subcategorías (FR-024) |

Las propiedades que fija la suite del dominio, en los términos del spec:

- ocultar y volver a mostrar un nodo deja a cada descendiente con su `hidden` previo;
- mover un nodo no altera el `hidden` de ningún nodo;
- `effectiveVisibility` de un hijo visible bajo un padre oculto es `hiddenBy: 'ancestor'`.

### FeaturedSections — `storefront/sections`

```typescript
type SectionId = 'featured' | 'offers';   // "Destacados" y "Ofertas" en la interfaz
const MAX_SECTION_PRODUCTS = 40;

interface FeaturedSections {
  tenantId: TenantId;
  featured: ProductId[];   // ≤ 40, sin repetidos
  offers: ProductId[];     // ≤ 40, sin repetidos
  updatedAt: Timestamp;
}
```

`addToSection(list, ids)` (pura) agrega solo los que no están; si no hay lugar para todos lanza
`SectionFullError { remaining }` sin cambiar nada (FR-027b). El orden de la lista es el de llegada;
ordenar dentro de una sección queda fuera de alcance.

El documento se crea vacío al crear el comercio y, para los comercios existentes, en la migración.

### Vocabulary — `storefront/vocabulary`

```typescript
interface Vocabulary {
  tags: Record<string, { label: string; count: number }>;    // clave: forma normalizada
  brands: Record<string, { label: string; count: number }>;
}
```

`label` es la primera forma registrada. El caso de uso que guarda la ficha ajusta `count` en la
misma transacción y poda los términos que llegan a cero.

### SlugIndexEntry — `slugIndex/{slug}`

```typescript
interface SlugIndexEntry {
  productId: ProductId;
  kind: 'current' | 'previous';   // 'previous' queda reservada para siempre (FR-008)
  createdAt: Timestamp;
}
```

### GtinIndexEntry — `gtinIndex/{GTIN14}`

```typescript
interface GtinIndexEntry {
  gtin: Gtin;            // forma original
  productId: ProductId;
  variantId: VariantId;
  createdAt: Timestamp;  // no hay `archived`: archivar no libera (FR-030)
}
```

### AuditEntry (ampliada)

```typescript
type AuditEventType = /* los cuatro de la 001 */ | 'sale-conditions.changed';

type SaleConditionsEntry = AuditEntryBase & {
  type: 'sale-conditions.changed';
  field: 'price' | 'shipping';
  before: 'shown' | 'hidden' | 'none' | 'charged' | 'free';
  after:  'shown' | 'hidden' | 'none' | 'charged' | 'free';
  // entity: { kind: 'product', id, productId }
};
```

`before` y `after` son **condiciones efectivas** (research §3), no campos. El panel los presenta
como "Precio mostrado / oculto" y "Sin envío / Envío con cargo / Envío gratis".

## Value objects nuevos

| Tipo | Regla | Archivo |
|---|---|---|
| `Slug` | `[a-z0-9]+(-[a-z0-9]+)*`, 1 a 100 caracteres | `value-objects/slug.ts` |
| `Gtin` | 8, 12, 13 o 14 dígitos, dígito de control GS1; `normalized` a 14 | `value-objects/gtin.ts` |
| `CategoryId` | id opaco, como los de la 001 | `value-objects/ids.ts` |

## Índices compuestos nuevos (`firestore.indexes.json`)

Todos encabezados por `archived`, como los de la 001 (research §11):

- `products`: `archived ASC, categoryIds CONTAINS, updatedAt DESC`
- `products`: `archived ASC, tagsNormalized CONTAINS, updatedAt DESC`
- `products`: `archived ASC, brandNormalized ASC, updatedAt DESC`
- `products`: `archived ASC, missingShippingData ASC, updatedAt DESC`
- `products`: `archived ASC, slug ASC`

## Trazabilidad requisito → modelo

| Requisito | Dónde vive |
|---|---|
| FR-001 | Todo bajo `tenants/{t}/` |
| FR-002 a FR-004 | Sin permisos nuevos; `setSaleConditions` exige `variant.price.write` |
| FR-005 a FR-008 | `Product.slug`, `slugLocked`, `slugIndex` |
| FR-009, FR-010 | `seoTitle`, `seoDescription`; la vista previa es de presentación |
| FR-011, FR-012 | `tags*`, `brand*`, `storefront/vocabulary` |
| FR-013 a FR-017 | `kind`, `weightGrams`, `dimensionsMm` en producto y variante; `missingShippingData` |
| FR-018 | `Product.video` |
| FR-019 a FR-021a | `storefront/categoryTree` |
| FR-022 a FR-025 | `Product.categoryIds` |
| FR-026 | `priceVisible`, `freeShipping` |
| FR-027 a FR-028 | `storefront/sections` |
| FR-029 | Callables separadas por permiso (contrato) |
| FR-030 | `Variant.gtin`, `gtinIndex` |
| FR-031 | `mpn`, `ageGroup`, `gender` |
| FR-032, FR-033 | `AuditEntry` de tipo `sale-conditions.changed` |
