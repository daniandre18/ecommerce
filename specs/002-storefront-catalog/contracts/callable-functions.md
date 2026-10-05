# Contrato: Cloud Functions callable

**Feature**: 002-storefront-catalog · **Fase**: 1

Rigen sin cambios las reglas comunes de la 001
([callable-functions](../../001-catalog-rbac/contracts/callable-functions.md)): la guarda verifica
sesión → App Check → `tenantId` → membresía activa → permiso, **dentro** de la transacción; la
entrada se valida después de autorizar; misma envoltura `Result<T>`; `requestId` para idempotencia
en las que crean. Todas reciben `tenantId`.

## Códigos de error nuevos

```typescript
type ErrorCode =
  | /* los de la 001 */
  | 'slug-conflict'        // FR-007: la URL está en uso o reservada; details: { productId }
  | 'gtin-conflict'        // FR-030: details: { productId, variantId, archived }
  | 'invalid-gtin'         // FR-030: longitud o dígito de control
  | 'unsupported-video'    // FR-018: details: { supported: ['YouTube', 'Vimeo'] }
  | 'category-limit'       // FR-019: profundidad, ciclo o tope de 1.000; details: { reason }
  | 'category-name-taken'  // FR-020
  | 'category-has-children'// FR-024
  | 'section-full'         // FR-027b: details: { section, remaining }
  | 'digital-products';    // FR-029: details: { productIds, names }
```

## Ficha de tienda — `catalog.write`, sin bitácora

| Función | Entrada | Efecto |
|---|---|---|
| `updateProductDetails` *(ampliada)* | lo de la 001 + `seoTitle?`, `seoDescription?`, `tags?`, `brand?`, `video?` (URL o `null`), `mediaOrder?`, `mpn?`, `ageGroup?`, `gender?` | Valida topes (FR-009, FR-011, FR-012, FR-031) y la URL de video (FR-018); ajusta el vocabulario. Si el nombre cambia y `slugLocked` es `false`, regenera la URL (FR-008) |
| `setProductSlug` | `productId`, `version`, `slug` | Normaliza (FR-007); reserva la nueva con `tx.create`; la anterior se libera si nunca se publicó o pasa a `previous` si sí (FR-008); `slugLocked: true`. Devuelve la URL final |
| `setProductShipping` | `productId`, `version`, `weightGrams` o `null`, `dimensionsMm` o `null` | Solo productos físicos (FR-014); recalcula `missingShippingData` |
| `setVariantShipping` | `productId`, `changes[{ variantId, version, weightGrams?, dimensionsMm? }]` (`null` = heredar) | Solo productos físicos (FR-015); lote de hasta 100; recalcula `missingShippingData` |
| `setVariantGtin` | `productId`, `variantId`, `version`, `gtin` o `null` | Valida (FR-030); reserva en `gtinIndex`; `null` libera el anterior, **también en una variante archivada** |
| `setProductCategories` | `productId`, `categoryIds` | Hasta 20, todas existentes en el árbol (FR-022); conjunto completo, sin `version` (research §2) |

## Tipo de producto — `catalog.write`, **escribe bitácora**

| Función | Entrada | Efecto |
|---|---|---|
| `setProductType` | `productId`, `version`, `kind` | Conserva peso, dimensiones y `freeShipping` (FR-016). Escribe las entradas que devuelve `saleConditionChanges`: **siempre una de envío** si el tipo cambia, en las dos direcciones (FR-032). Devuelve qué cambió para el comprador, que el panel ya anunció antes de confirmar |

El aviso previo de FR-016 no necesita una callable: el panel calcula `saleConditionChanges` con la
misma función del dominio sobre el producto que ya tiene en memoria.

## Condiciones de venta — `variant.price.write`, **escribe bitácora**

| Función | Entrada | Efecto |
|---|---|---|
| `setSaleConditions` | `changes[{ productId, version }]` (≤ 100), `priceVisible?`, `freeShipping?` | Todo o nada. Rechaza con `digital-products` si `freeShipping: true` y hay digitales seleccionados (FR-029). Una entrada por campo y producto que cambie sus condiciones efectivas, con `batchId` común (FR-032) |

Quien no tiene `variant.price.write` recibe `permission-denied` de la guarda, que registra el evento
de seguridad (FR-003, SC-002).

## Secciones destacadas — `catalog.write`, sin bitácora

| Función | Entrada | Efecto |
|---|---|---|
| `addToSection` | `section: 'featured' \| 'offers'`, `productIds` (≤ 40) | Lee `storefront/sections` y los productos (deben existir y no estar archivados). Si no hay lugar para todos: `section-full` con `remaining`, sin cambios (FR-027b). Los que ya estaban no cuentan dos veces |
| `removeFromSection` | `section`, `productIds` | Saca los que estén; los que no, se ignoran |

`archiveProduct` de la 001 suma: lee `storefront/sections` y saca el producto de las dos listas en la
misma transacción (FR-028).

## Categorías — `catalog.write`, sin bitácora

Todas operan sobre `storefront/categoryTree` en una transacción, aplicando la operación pura del
dominio correspondiente ([data-model](../data-model.md#categorytree--storefrontcategorytree)).

| Función | Entrada | Efecto |
|---|---|---|
| `createCategory` | `parentId` o `null`, `name`, `slug?`, `requestId` | Genera la URL si no viene (FR-021). Devuelve `{ categoryId, slug }` |
| `renameCategory` | `categoryId`, `name` | No cambia la URL (FR-021) |
| `setCategorySlug` | `categoryId`, `slug` | La anterior pasa a `previousSlugs` |
| `moveCategory` | `categoryId`, `parentId` o `null`, `position` | `category-limit` si quedaría a más de 3 niveles o dentro de su rama. No toca ningún `hidden` |
| `setCategoryHidden` | `categoryId`, `hidden` | Escribe solo ese nodo (FR-021a) |
| `deleteCategory` | `categoryId` | `category-has-children` si tiene hijas. Después de confirmar, poda `categoryIds` de los productos en lotes (research §2) |
| `assignCategory` / `unassignCategory` | `categoryId`, `productIds` (≤ 100) | Conjunto: sin duplicar, sin `version` (FR-025) |

Lo que el panel calcula sin callable: cuántas subcategorías quedan ocultas al ocultar una (sale del
árbol en memoria) y cuántos productos pierden una categoría al eliminarla (`count()` sobre
`categoryIds`).

## Funciones de la 001 que cambian

| Función | Cambio |
|---|---|
| `createProduct` | Genera y reserva la URL amigable en la misma transacción; valores por defecto de la ficha |
| `updateProductDetails` | Campos nuevos (arriba) |
| `setProductStatus` | Al publicar por primera vez, `slugLocked: true` |
| `archiveProduct` | Saca el producto de las secciones (FR-028) |

## Pruebas de contrato

Cada función nueva tiene su prueba en `apps/functions/src/**/callables.spec.ts` contra el permiso
equivocado, como en la 001. Las que escriben bitácora suman una prueba de atomicidad contra el
emulador (`*.integration.spec.ts`): si falla la entrada, no queda el cambio, y al revés. El tope de
secciones tiene su prueba de concurrencia: dos `addToSection` simultáneos sobre una sección con 39.
