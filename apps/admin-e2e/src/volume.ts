import {
  categoryId,
  createCategory,
  createIncompleteVariant,
  descendantsOf,
  emptyCategoryTree,
  normalizeName,
  optionId,
  productId,
  storefrontDefaults,
  tenantId,
  valueId,
  variantId,
  type CategoryId,
  type CategoryTree,
  type Product,
  type Variant,
} from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';

/**
 * El comercio de referencia de SC-006 de la 002: 10.000 variantes —2.500 productos de 4 talles— y 300
 * categorías. Se escribe con los repositorios del servidor, así los documentos tienen la forma real.
 */
export const VOLUME = { products: 2_500, sizes: ['s', 'm', 'l', 'xl'], tags: 40, brands: 25 } as const;

const T1 = tenantId('t1');
const TALLE = optionId('talle');
const AT = new Date('2026-10-01T12:00:00Z');
/** Escrituras por transacción: un producto y sus 4 variantes son 5, y el tope de Firestore es 500. */
const PRODUCTS_PER_TRANSACTION = 90;

export interface VolumeCatalog {
  readonly tree: CategoryTree;
  readonly products: readonly Product[];
  readonly tags: readonly string[];
  readonly brands: readonly string[];
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * 300 categorías en tres niveles: una raíz con 8 hijas de 5 nietas cada una (su rama son 49 ids,
 * más de lo que admite una consulta), 10 raíces con 4 hijas de 5 nietas (25 ids) y una suelta.
 */
function volumeTree(): CategoryTree {
  let tree = emptyCategoryTree();
  const add = (id: string, parentId: string | null) => (tree = createCategory(tree, { id: categoryId(id), parentId: parentId === null ? null : categoryId(id.slice(0, id.lastIndexOf('-'))), name: id }));
  for (let root = 0; root < 11; root++) {
    const r = `r${pad(root, 2)}`;
    add(r, null);
    for (let child = 0; child < (root === 0 ? 8 : 4); child++) {
      const c = `${r}-c${child}`;
      add(c, r);
      for (let leaf = 0; leaf < 5; leaf++) add(`${c}-n${leaf}`, c);
    }
  }
  add('suelta', null);
  return tree;
}

/**
 * El tope de Assumptions: 1.000 categorías (`MAX_CATEGORIES`). Contiene el árbol de 300 de SC-006 y le
 * suma 28 raíces de 4 hijas con 5 nietas cada una; los productos siguen en categorías que existen.
 */
export function maxTree(): CategoryTree {
  let tree = volumeTree();
  for (let root = 0; root < 28; root++) {
    const r = `x${pad(root, 2)}`;
    tree = createCategory(tree, { id: categoryId(r), parentId: null, name: r });
    for (let child = 0; child < 4; child++) {
      const c = `${r}-c${child}`;
      tree = createCategory(tree, { id: categoryId(c), parentId: categoryId(r), name: c });
      for (let leaf = 0; leaf < 5; leaf++) tree = createCategory(tree, { id: categoryId(`${c}-n${leaf}`), parentId: categoryId(c), name: `${c}-n${leaf}` });
    }
  }
  return tree;
}

/** Reemplaza el árbol del comercio. */
export async function seedTree(tree: CategoryTree): Promise<void> {
  process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
  process.env['GCLOUD_PROJECT'] ??= 'demo-ecommerce';
  await new FirestoreUnitOfWork(firestore(), T1).run((tx) => tx.categories.save(tree));
}

function volumeProducts(tree: CategoryTree): Product[] {
  const leaves = Object.values(tree.nodes).filter((node) => descendantsOf(tree, node.id).length === 0).map((node) => node.id);
  const tags = Array.from({ length: VOLUME.tags }, (_, i) => `etiqueta-${pad(i, 2)}`);
  const brands = Array.from({ length: VOLUME.brands }, (_, i) => `Marca ${pad(i, 2)}`);
  return Array.from({ length: VOLUME.products }, (_, i) => {
    const name = `Volumen ${pad(i, 4)}`;
    const productTags = [...new Set([tags[i % tags.length], tags[(i * 7) % tags.length]])] as string[];
    const brand = brands[i % brands.length] as string;
    const categoryIds: CategoryId[] = [...new Set([leaves[i % leaves.length], leaves[(i * 13) % leaves.length]])] as CategoryId[];
    return {
      ...storefrontDefaults(),
      id: productId(`vol-${pad(i, 4)}`),
      tenantId: T1,
      name,
      nameNormalized: normalizeName(name),
      description: '',
      images: [],
      options: [{ id: TALLE, name: 'Talle', position: 0, values: VOLUME.sizes.map((size, position) => ({ id: valueId(size), label: size.toUpperCase(), position })) }],
      status: i % 3 === 0 ? 'draft' : 'active',
      archived: false,
      variantCount: VOLUME.sizes.length,
      hasIncompleteVariants: true,
      createdAt: AT,
      // Distintas entre sí: el listado ordena por edición y el primero de cada filtro es uno solo.
      updatedAt: new Date(AT.getTime() + i * 60_000),
      version: 1,
      categoryIds,
      tags: productTags,
      tagsNormalized: productTags.map(normalizeName),
      brand,
      brandNormalized: normalizeName(brand),
    };
  });
}

const variantsOf = (product: Product): Variant[] =>
  VOLUME.sizes.map((size) => ({ ...createIncompleteVariant({ id: variantId(`${product.id}-${size}`), tenantId: T1, productId: product.id, optionValues: { [TALLE]: valueId(size) } }), version: 1 }));

export async function seedVolume(): Promise<VolumeCatalog> {
  process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
  process.env['GCLOUD_PROJECT'] ??= 'demo-ecommerce';
  const uow = new FirestoreUnitOfWork(firestore(), T1);
  const tree = volumeTree();
  const products = volumeProducts(tree);
  await uow.run((tx) => tx.categories.save(tree));
  const batches = Array.from({ length: Math.ceil(products.length / PRODUCTS_PER_TRANSACTION) }, (_, i) => products.slice(i * PRODUCTS_PER_TRANSACTION, (i + 1) * PRODUCTS_PER_TRANSACTION));
  for (let i = 0; i < batches.length; i += 4) {
    await Promise.all(
      batches.slice(i, i + 4).map((batch) =>
        uow.run(async (tx) => {
          for (const product of batch) {
            await tx.products.save(product);
            for (const variant of variantsOf(product)) await tx.variants.save(variant);
          }
        }),
      ),
    );
  }
  return { tree, products, tags: [...new Set(products.flatMap((p) => p.tags))].sort(), brands: [...new Set(products.map((p) => p.brand as string))].sort() };
}

/** El primero que muestra el listado con un filtro: el editado más recientemente de los que coinciden. */
export function firstMatch(catalog: VolumeCatalog, matches: (product: Product) => boolean): string {
  const found = catalog.products.filter(matches).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  if (!found) throw new Error('Ningún producto coincide con el filtro');
  return found.name;
}

/** La categoría y todas sus subcategorías, como las pide el listado (FR-023). */
export const branchOf = (tree: CategoryTree, id: string): CategoryId[] => [categoryId(id), ...descendantsOf(tree, categoryId(id))];
