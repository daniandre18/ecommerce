import { productId, storefrontDefaults, type Product, type Slug } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { NOW, setup, T1 } from '../testing/fixture';
import { BackfillProductStorefront } from './backfill';

/** Un producto tal como lo deja leer el mapeador antes de la migración: sin URL. */
const legacy = (id: string, name: string, status: Product['status'] = 'draft'): Product => ({
  ...storefrontDefaults(),
  id: productId(id),
  tenantId: T1,
  name,
  nameNormalized: name.toLowerCase(),
  description: '',
  images: [],
  options: [],
  status,
  archived: false,
  variantCount: 1,
  hasIncompleteVariants: false,
  createdAt: NOW,
  updatedAt: NOW,
  version: 4,
  publishedOnce: status !== 'draft',
});

// T042 — la migración de los productos anteriores a la 002: les asigna URL con las mismas reglas
// que `CreateProduct`, sin cambiar su estado ni su versión.
describe('BackfillProductStorefront', () => {
  let t: ReturnType<typeof setup>;
  let backfill: BackfillProductStorefront;

  beforeEach(() => {
    t = setup();
    backfill = new BackfillProductStorefront(t.deps);
  });

  const put = (product: Product) => t.uow.store.products.set(product.id, product);
  const migrate = (id: string) => t.uow.run((tx) => backfill.execute(tx, { productId: productId(id) }));

  it('asigna la URL del nombre y la reserva', async () => {
    put(legacy('p1', 'Camiseta Básica'));
    await expect(migrate('p1')).resolves.toBe('migrated');
    expect(t.product('p1').slug).toBe('camiseta-basica');
    expect(t.uow.store.slugIndex.get('camiseta-basica' as Slug)).toEqual({ productId: 'p1', kind: 'current' });
  });

  it('dos con el mismo nombre reciben la URL y el sufijo', async () => {
    put(legacy('p1', 'Camiseta'));
    put(legacy('p2', 'Camiseta'));
    await migrate('p1');
    await migrate('p2');
    expect([t.product('p1').slug, t.product('p2').slug]).toEqual(['camiseta', 'camiseta-2']);
  });

  it('un nombre sin letras ni números recibe la de respaldo, marcada para reemplazar', async () => {
    put(legacy('Qm9c8Zk1xyz', '★★★'));
    await migrate('Qm9c8Zk1xyz');
    expect(t.product('Qm9c8Zk1xyz')).toEqual(expect.objectContaining({ slug: 'producto-qm9c8zk1', slugNeedsReplacement: true }));
  });

  it('un producto ya publicado queda con la URL fija: no sigue al nombre (FR-008)', async () => {
    put(legacy('p1', 'Camiseta', 'active'));
    await migrate('p1');
    expect(t.product('p1')).toEqual(expect.objectContaining({ slugLocked: true, publishedOnce: true }));
  });

  it('uno en borrador sigue al nombre hasta publicarse', async () => {
    put(legacy('p1', 'Camiseta'));
    await migrate('p1');
    expect(t.product('p1').slugLocked).toBe(false);
  });

  it('no cambia el estado ni la versión: no provoca conflictos a quien esté editando', async () => {
    put(legacy('p1', 'Camiseta', 'unlisted'));
    await migrate('p1');
    expect(t.product('p1')).toEqual(expect.objectContaining({ status: 'unlisted', version: 4, updatedAt: NOW }));
  });

  it('es idempotente: un producto que ya tiene URL no se toca', async () => {
    put(legacy('p1', 'Camiseta'));
    await migrate('p1');
    const after = t.product('p1');
    await expect(migrate('p1')).resolves.toBe('already');
    expect(t.product('p1')).toBe(after);
    expect(t.uow.store.slugIndex.size).toBe(1);
  });
});
