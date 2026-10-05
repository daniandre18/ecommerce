# Contrato: dominio, puertos y casos de uso

**Feature**: 002-storefront-catalog · **Fase**: 1

Las cuatro capas de la 001 ([ports](../../001-catalog-rbac/contracts/ports.md)) sin cambios de
forma: `libs/domain` sin Firebase ni Angular, `libs/application` con puertos y casos de uso sin
SDK, `libs/infrastructure` como único lugar con SDK. `@nx/enforce-module-boundaries` lo hace
cumplir.

## Dominio — `libs/domain`, todo puro y probado con Vitest sin emuladores

| Archivo | Exporta | Requisitos |
|---|---|---|
| `value-objects/slug.ts` | `Slug`, `slug()`, `slugify(name)`, `nextSlugCandidate(base, n)` | FR-005 a FR-007, FR-021 |
| `value-objects/gtin.ts` | `Gtin`, `gtin()` (valida longitud y dígito de control), `normalized` | FR-030 |
| `entities/category-tree.ts` | `CategoryTree`, `CategoryNode`, `MAX_CATEGORY_DEPTH = 3`, `MAX_CATEGORIES = 1000`, y las operaciones `createCategory`, `renameCategory`, `setCategorySlug`, `moveCategory`, `reorderCategory`, `setCategoryHidden`, `deleteCategory` | FR-019 a FR-021a, FR-024 |
| `services/effective-visibility.ts` | `effectiveVisibility(tree)`, `descendantsOf`, `depthOf` | FR-021a, FR-023 |
| `services/sale-conditions.ts` | `effectiveSaleConditions(product)`, `saleConditionChanges(before, after)` | FR-016, FR-026, FR-032 |
| `services/sections.ts` | `MAX_SECTION_PRODUCTS = 40`, `addToSection`, `removeFromSection`, `SectionFullError` | FR-027a, FR-027b |
| `services/shipping-data.ts` | `effectiveShipping(product, variant)`, `missingShippingData(product, variants)` | FR-014, FR-015, FR-017 |
| `services/video-url.ts` | `parseVideoUrl(url)` | FR-018 |
| `services/vocabulary.ts` | `normalizeTags`, `adjustVocabulary(vocabulary, before, after)` | FR-011, FR-012 |
| `services/build-audit-entries.ts` *(ampliado)* | `AuditedChange` suma `'sale-conditions.changed'` | FR-032 |
| `entities/audit-entry.ts` *(ampliado)* | la variante `'sale-conditions.changed'` de la unión | FR-032, FR-033 |

### Propiedades que fijan las suites del dominio

- **Visibilidad**: ocultar y volver a mostrar un nodo devuelve a cada descendiente su `hidden`;
  mover un nodo no cambia el `hidden` de ninguno; un hijo visible bajo un padre oculto es
  `hiddenBy: 'ancestor'` con el id de ese ancestro.
- **Árbol**: ninguna operación produce un nodo a más de 3 niveles, un ciclo, dos hermanas con el
  mismo nombre normalizado ni dos nodos con la misma URL (vigente o anterior).
- **Condiciones de venta**: la tabla completa de `research.md` §3; todo cambio de tipo produce
  exactamente una entrada de envío, y un cambio que no altera las condiciones efectivas, ninguna.
- **Secciones**: `addToSection` nunca devuelve más de 40, no duplica, y ante falta de lugar no
  cambia nada.
- **GTIN**: vectores GS1 válidos e inválidos de 8, 12, 13 y 14 dígitos; un UPC-A de 12 y su forma de
  13 con cero inicial se normalizan igual.

## Puertos — `libs/application/src/ports`

`TransactionScope` suma:

```typescript
interface TransactionScope {
  // … los de la 001 …
  readonly categories: CategoryTreeRepository;
  readonly sections: FeaturedSectionsRepository;
  readonly vocabulary: VocabularyRepository;
  readonly slugIndex: SlugIndexRepository;
  readonly gtinIndex: GtinIndexRepository;
}

interface CategoryTreeRepository {
  get(): Promise<CategoryTree>;          // vacío si no existe
  save(tree: CategoryTree): Promise<void>;
}

interface FeaturedSectionsRepository {
  get(): Promise<FeaturedSections>;
  save(sections: FeaturedSections): Promise<void>;
}

interface VocabularyRepository {
  get(): Promise<Vocabulary>;
  save(vocabulary: Vocabulary): Promise<void>;
}

/** Como SkuIndexRepository: la colisión falla de forma atómica al confirmar. */
interface SlugIndexRepository {
  find(slug: Slug): Promise<SlugIndexEntry | null>;
  reserve(slug: Slug, productId: ProductId): Promise<void>;   // tx.create
  release(slug: Slug): Promise<void>;                         // solo si nunca se publicó
  markPrevious(slug: Slug): Promise<void>;
  markCurrent(slug: Slug): Promise<void>;                     // volver a una anterior propia
}

interface GtinIndexRepository {
  find(gtin: Gtin): Promise<GtinIndexEntry | null>;
  reserve(entry: { gtin: Gtin; productId: ProductId; variantId: VariantId }): Promise<void>;
  release(gtin: Gtin): Promise<void>;   // único camino: quitar el GTIN (FR-030)
}
```

`ProductRepository` suma `updateCategories(id, categoryIds)`, que escribe solo ese campo y sin
tocar la versión, como `updateVariantSummary` en la 001 (research §2). Y `CatalogQueries`, del lado
del cliente, suma `watchCategoryTree`, `watchSections`, `watchVocabulary`, `findSlug` y los filtros
nuevos de `ProductListQuery` (`categoryIds`, `tag`, `brand`, `missingShippingData`).

## Casos de uso — `libs/application/src/use-cases`

| Caso de uso | `requires` | Bitácora |
|---|---|---|
| `UpdateProductDetails` *(ampliado)* | `catalog.write` | no |
| `SetProductSlug` | `catalog.write` | no |
| `SetProductShipping`, `SetVariantShipping` | `catalog.write` | no |
| `SetVariantGtin` | `catalog.write` | no |
| `SetProductCategories`, `AssignCategory`, `UnassignCategory` | `catalog.write` | no |
| `SetProductType` | `catalog.write` | **sí**: `saleConditionChanges` |
| `SetSaleConditions` | `variant.price.write` | **sí**: `saleConditionChanges`, un `batchId` |
| `AddToSection`, `RemoveFromSection` | `catalog.write` | no |
| `CreateCategory`, `RenameCategory`, `SetCategorySlug`, `MoveCategory`, `SetCategoryHidden`, `DeleteCategory` | `catalog.write` | no |
| `CreateProduct`, `SetProductStatus`, `ArchiveProduct` *(cambian)* | sin cambios | sin cambios |

`libs/application/src/use-cases/authorization.spec.ts` de la 001 recorre todos los casos de uso
contra el permiso equivocado; los nuevos entran en esa misma prueba. La regla de los casos de uso
se mantiene: **todas las lecturas antes que cualquier escritura**, y nada fuera de la transacción
salvo la poda posterior de `DeleteCategory`, que es idempotente.
