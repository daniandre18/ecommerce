import { MAX_BULK_PRODUCTS, type TransactionScope, type UnitOfWork } from '@ecommerce/application';
import {
  categoryId,
  createCategory,
  createOwnerRole,
  emptyCategoryTree,
  MAX_CATEGORIES_PER_PRODUCT,
  normalizeName,
  productId,
  storefrontDefaults,
  type CategoryTree,
  type Product,
} from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableDependencies } from '../bootstrap/callable';
import { productionDependencies } from '../bootstrap/composition';
import { categoryCallables, type CategoryDependencies } from '../categories/callables';
import { AT, callAs, member, T1 } from '../testing/harness';
import { storefrontCallables } from './callables';

const db = firestore();
/** SC-007: "una acción masiva sobre 100 productos se completa en menos de 10 segundos". */
const LIMIT_MS = 10_000;
const IDS = Array.from({ length: MAX_BULK_PRODUCTS }, (_, i) => `p${String(i).padStart(3, '0')}`);
const LAST = IDS[IDS.length - 1] as string;
const FULL = Array.from({ length: MAX_CATEGORIES_PER_PRODUCT }, (_, i) => `c-${String(i).padStart(2, '0')}`);

function tree(): CategoryTree {
  let t = createCategory(emptyCategoryTree(), { id: categoryId('destino'), parentId: null, name: 'Destino' });
  for (const id of FULL) t = createCategory(t, { id: categoryId(id), parentId: null, name: id });
  return t;
}

const product = (id: string, categories: readonly string[] = []): Product => ({
  ...storefrontDefaults(),
  id: productId(id),
  tenantId: T1,
  name: `Producto ${id}`,
  nameNormalized: normalizeName(`Producto ${id}`),
  description: '',
  images: [],
  options: [],
  status: 'draft',
  archived: false,
  variantCount: 1,
  hasIncompleteVariants: true,
  createdAt: AT,
  updatedAt: AT,
  version: 1,
  categoryIds: categories.map(categoryId),
});

/** Las dependencias de producción, con cada transacción vista a través de `decorate`. */
function decorated(decorate: (tx: TransactionScope) => TransactionScope): CallableDependencies & CategoryDependencies {
  const real = productionDependencies();
  return {
    ...real,
    unitOfWorkFor: (tenant): UnitOfWork => {
      const uow = real.unitOfWorkFor(tenant);
      return { run: (work) => uow.run((tx) => work(decorate(tx))) };
    },
  };
}

/** Lo que tarda de punta a punta, como lo ve quien la pidió: guarda, transacción y confirmación. */
async function timed<T>(run: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await run();
  return { result, ms: performance.now() - start };
}

const docs = async () => (await db.collection('tenants/t1/products').get()).docs;
const withCategory = async (id: string) => (await docs()).filter((d) => (d.get('categoryIds') as string[]).includes(id)).map((d) => d.id);
const withFreeShipping = async () => (await docs()).filter((d) => d.get('freeShipping') === true).map((d) => d.id);
const auditEntries = async () => (await db.collection('tenants/t1/auditLog').get()).size;

const assign = (deps: CallableDependencies & CategoryDependencies) =>
  categoryCallables(deps).assignCategory.run(callAs('owner', { categoryId: 'destino', productIds: IDS }));
const freeShipping = (deps: CallableDependencies, versions: Record<string, number> = {}) =>
  storefrontCallables(deps).setSaleConditions.run(callAs('owner', { changes: IDS.map((id) => ({ productId: id, version: versions[id] ?? 1 })), freeShipping: true }));

// T095 — SC-007 contra el emulador: asignar una categoría y activar el envío gratis sobre 100
// productos, el máximo de una acción masiva, terminan en menos de 10 s; y si no pueden aplicarse a
// todos, no se aplican a ninguno, ni por una regla de negocio ni por una falla al confirmar.
describe('acciones masivas sobre 100 productos (SC-007)', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
      await tx.categories.save(tree());
      for (const id of IDS) await tx.products.save(product(id));
    });
  }, 30_000);

  it('son 100: el máximo de una acción masiva', () => {
    expect(IDS).toHaveLength(100);
  });

  describe('asignar una categoría', () => {
    it('a los 100, en menos de 10 s', async () => {
      const { result, ms } = await timed(() => assign(productionDependencies()));
      expect(result).toEqual({ ok: true, data: { changed: 100 } });
      expect(ms).toBeLessThan(LIMIT_MS);
      expect(await withCategory('destino')).toEqual(IDS);
    });

    it('si a uno de los 100 no le entra, no se aplica a ninguno', async () => {
      await new FirestoreUnitOfWork(db, T1).run((tx) => tx.products.save(product(LAST, FULL)));
      const result = await assign(productionDependencies());
      expect(result).toEqual(expect.objectContaining({ ok: false, code: 'limit-exceeded' }));
      expect(await withCategory('destino')).toEqual([]);
    });

    it('si la última escritura falla al confirmar, no se aplica a ninguno', async () => {
      const failing = decorated((tx) => ({
        ...tx,
        products: {
          ...tx.products,
          updateCategories: async (id, categoryIds) => {
            await tx.products.updateCategories(id, categoryIds);
            // Un `update` sobre un documento que no existe falla recién al confirmar.
            if (id === LAST) await tx.products.updateCategories(productId('no-existe'), categoryIds);
          },
        },
      }));
      await expect(assign(failing)).rejects.toThrow();
      expect(await withCategory('destino')).toEqual([]);
    });
  });

  describe('activar el envío gratis', () => {
    it('a los 100, con sus 100 entradas de bitácora, en menos de 10 s', async () => {
      const { result, ms } = await timed(() => freeShipping(productionDependencies()));
      expect(result).toEqual(expect.objectContaining({ ok: true, data: expect.objectContaining({ updated: 100 }) }));
      expect(ms).toBeLessThan(LIMIT_MS);
      expect(await withFreeShipping()).toEqual(IDS);
      expect(await auditEntries()).toBe(100);
    });

    it('si uno de los 100 cambió mientras tanto, ninguno cambia ni deja entrada', async () => {
      const result = await freeShipping(productionDependencies(), { [LAST]: 0 });
      expect(result).toEqual(expect.objectContaining({ ok: false, code: 'version-conflict' }));
      expect(await withFreeShipping()).toEqual([]);
      expect(await auditEntries()).toBe(0);
    });

    it('si la última escritura falla al confirmar, ninguno cambia ni deja entrada', async () => {
      const failing = decorated((tx) => ({
        ...tx,
        products: {
          ...tx.products,
          save: async (saved) => {
            await tx.products.save(saved);
            if (saved.id === LAST) await tx.products.updateCategories(productId('no-existe'), []);
          },
        },
      }));
      await expect(freeShipping(failing)).resolves.toEqual(expect.objectContaining({ ok: false, code: 'audit-write-failed' }));
      expect(await withFreeShipping()).toEqual([]);
      expect(await auditEntries()).toBe(0);
    });
  });
});
