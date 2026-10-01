import {
  ArchiveVariant,
  CreateProduct,
  SetProductOptions,
  SetVariantCost,
  SetVariantPrice,
  SetVariantSku,
  SetVariantStock,
  type OperationContext,
  type TransactionScope,
  type UseCaseDependencies,
} from '@ecommerce/application';
import {
  money,
  optionId,
  productId,
  stockQuantity,
  tenantId,
  uid,
  valueId,
  type ProductId,
  type VariantId,
  type VariationOption,
} from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { firestore } from './firestore';
import { FirestoreUnitOfWork } from './unit-of-work';

const db = firestore();
const T1 = tenantId('t1');
const NOW = new Date('2026-09-30T12:00:00Z');
const ctx: OperationContext = { tenantId: T1, actorUid: uid('ana'), actorName: 'Ana', requestId: 'p1' };
const usd = (amount: number) => money(amount, 'USD');

const color: VariationOption = {
  id: optionId('color'),
  name: 'Color',
  position: 0,
  values: [
    { id: valueId('rojo'), label: 'Rojo', position: 0 },
    { id: valueId('amarillo'), label: 'Amarillo', position: 1 },
  ],
};

async function clearEmulator(): Promise<void> {
  const host = process.env['FIRESTORE_EMULATOR_HOST'];
  if (!host) throw new Error('FIRESTORE_EMULATOR_HOST no definido: correr con firebase emulators:exec');
  await fetch(`http://${host}/emulator/v1/projects/demo-ecommerce/databases/(default)/documents`, { method: 'DELETE' });
}

interface UseCase<I, O> {
  execute(tx: TransactionScope, ctx: OperationContext, input: I): Promise<O>;
}

// T044–T046 — los casos de uso reales contra Firestore, no contra los dobles.
describe('catálogo sobre Firestore', () => {
  const uow = new FirestoreUnitOfWork(db, T1);
  let n = 0;
  const deps: UseCaseDependencies = { clock: { now: () => NOW }, ids: { next: () => `id-${++n}` } };
  const run = <I, O>(useCase: UseCase<I, O>, input: I) => uow.run((tx) => useCase.execute(tx, ctx, input));
  const raw = async (path: string) => (await db.doc(`tenants/t1/${path}`).get()).data();

  let pid: ProductId;
  let rojo: VariantId;
  let amarillo: VariantId;

  beforeEach(async () => {
    await clearEmulator();
    n = 0;
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: NOW, createdBy: 'seed', status: 'active' });
    ({ productId: pid } = await run(new CreateProduct(deps), { name: 'Camiseta', description: '' }));
    await run(new SetProductOptions(deps), { productId: pid, version: 1, options: [color], assignments: [] });
    const variants = (await db.collection(`tenants/t1/products/${pid}/variants`).get()).docs;
    const byColor = (value: string) => variants.find((d) => d.data()['optionValues']['color'] === value)?.id as VariantId;
    [rojo, amarillo] = [byColor('rojo'), byColor('amarillo')];
  });

  const versionOf = async (variant: VariantId) => Number((await raw(`products/${pid}/variants/${variant}`))?.['version']);

  it('las opciones y las variantes vuelven de Firestore tal como se guardaron', async () => {
    const product = await uow.run((tx) => tx.products.findById(productId('p1')));
    expect(product?.options).toEqual([color]);
    expect(product).toEqual(expect.objectContaining({ variantCount: 2, hasIncompleteVariants: true, version: 2 }));

    const variants = await uow.run((tx) => tx.variants.findByProduct(pid));
    expect(variants.map((v) => v.optionValues).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      { color: 'amarillo' },
      { color: 'rojo' },
    ]);
    for (const variant of variants) expect(variant.stock).toEqual({ kind: 'undefined' }); // no en cero (FR-029)
  });

  it('el índice de SKU usa el código normalizado como id y la colisión se detecta (FR-021)', async () => {
    await run(new SetVariantSku(), { productId: pid, variantId: rojo, version: await versionOf(rojo), sku: 'cam-01' });
    expect(await raw('skuIndex/CAM-01')).toEqual(expect.objectContaining({ variantId: rojo, archived: false }));

    await expect(
      run(new SetVariantSku(), { productId: pid, variantId: amarillo, version: await versionOf(amarillo), sku: 'CAM-01' }),
    ).rejects.toMatchObject({ code: 'sku-conflict', details: { occupiedBy: rojo } });
  });

  it('el resumen de variantes se actualiza sin tocar la versión del producto', async () => {
    await run(new SetVariantSku(), { productId: pid, variantId: rojo, version: await versionOf(rojo), sku: 'A' });
    await run(new SetVariantSku(), { productId: pid, variantId: amarillo, version: await versionOf(amarillo), sku: 'B' });
    expect(await raw(`products/${pid}`)).toEqual(expect.objectContaining({ hasIncompleteVariants: false, version: 2 }));
  });

  it('archivar una variante deja su SKU reservado en el índice (FR-023)', async () => {
    await run(new SetVariantSku(), { productId: pid, variantId: amarillo, version: await versionOf(amarillo), sku: 'AMA' });
    await run(new ArchiveVariant(), { productId: pid, variantId: amarillo, version: await versionOf(amarillo) });
    expect(await raw('skuIndex/AMA')).toEqual(expect.objectContaining({ archived: true }));
  });

  it('precio y su entrada de bitácora quedan juntos en Firestore (FR-030)', async () => {
    const result = await run(new SetVariantPrice(deps), { productId: pid, changes: [{ variantId: rojo, version: await versionOf(rojo), price: usd(1000) }] });
    expect(await raw(`products/${pid}/variants/${rojo}`)).toEqual(expect.objectContaining({ price: { amount: 1000, currency: 'USD' } }));
    const [entryId] = result.auditEntryIds;
    expect(await raw(`auditLog/${entryId}`)).toEqual(expect.objectContaining({ type: 'price.changed', field: 'price', batchId: result.batchId }));
  });

  // FR-033, sentido 1, con una falla real de Firestore al confirmar.
  it('si la entrada de bitácora no puede crearse, el precio no cambia', async () => {
    const first = await run(new SetVariantPrice(deps), { productId: pid, changes: [{ variantId: rojo, version: await versionOf(rojo), price: usd(1000) }] });
    const taken = first.auditEntryIds[0] as string;
    const colliding = new SetVariantPrice({ ...deps, ids: { next: () => taken } });

    await expect(run(colliding, { productId: pid, changes: [{ variantId: rojo, version: await versionOf(rojo), price: usd(2000) }] })).rejects.toThrow();
    expect((await raw(`products/${pid}/variants/${rojo}`))?.['price']).toEqual({ amount: 1000, currency: 'USD' });
  });

  it('el costo va a su documento aparte y NUNCA al de la variante (FR-015)', async () => {
    await run(new SetVariantCost(deps), { productId: pid, changes: [{ variantId: rojo, cost: usd(400) }] });
    expect((await raw(`products/${pid}/private/costs`))?.['costs']).toEqual({ [rojo]: { amount: 400, currency: 'USD' } });
    expect(Object.keys((await raw(`products/${pid}/variants/${rojo}`)) ?? {})).not.toContain('cost');
  });

  it('las existencias en cero se guardan distintas de "sin definir" (FR-029)', async () => {
    await run(new SetVariantStock(deps), { productId: pid, changes: [{ variantId: rojo, version: await versionOf(rojo), stock: stockQuantity(0) }] });
    expect((await raw(`products/${pid}/variants/${rojo}`))?.['stock']).toEqual({ kind: 'quantity', value: 0 });
    expect((await raw(`products/${pid}/variants/${amarillo}`))?.['stock']).toEqual({ kind: 'undefined' });
  });
});
