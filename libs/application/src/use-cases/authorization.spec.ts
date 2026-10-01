import { activateMembership, createCustomRole, inviteMembership, roleId, uid, type Permission } from '@ecommerce/domain';
import { describe, expect, it } from 'vitest';
import { PermissionDeniedError, type Requirement } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import { RoleBasedAuthorizationService } from '../services/authorization.service';
import { InMemoryUnitOfWork } from '../testing/in-memory';
import { ArchiveProduct, ArchiveVariant } from './archive';
import { CreateProduct } from './create-product';
import { SetProductOptions } from './set-product-options';
import { SetProductStatus } from './set-product-status';
import { SetVariantCost, SetVariantPrice, SetVariantStock } from './set-variant-amounts';
import { SetVariantImages } from './set-variant-images';
import { SetVariantSku } from './set-variant-sku';
import { ctx, NOW, T1 } from './testing/fixture';
import { UpdateProductDetails } from './update-product-details';

const CATALOG = [CreateProduct, UpdateProductDetails, SetProductOptions, SetProductStatus, SetVariantSku, SetVariantImages, ArchiveProduct, ArchiveVariant];

/** ¿Pasa la autorización una cuenta con exactamente estos permisos? */
async function allowed(permissions: readonly Permission[], requires: Requirement): Promise<boolean> {
  const uow = new InMemoryUnitOfWork();
  const role = { ...createCustomRole(roleId('prueba'), T1, 'Prueba', NOW), permissions };
  uow.store.roles.set(role.id, role);
  const invited = inviteMembership({ uid: uid('ana'), tenantId: T1, roleId: role.id, displayName: 'Ana', email: 'ana@t1', at: NOW });
  uow.store.members.set(uid('ana'), activateMembership(invited, NOW));
  const authz = new RoleBasedAuthorizationService();
  const context: OperationContext = { ...ctx, actorUid: uid('ana') };
  try {
    await uow.run(async (tx) => {
      if (requires.kind === 'owner') await authz.assertOwner(tx, context);
      else if (requires.kind === 'permission') await authz.assert(tx, context, requires.permission);
    });
    return true;
  } catch (error) {
    if (error instanceof PermissionDeniedError) return false;
    throw error;
  }
}

// T066 — cada caso de uso rechaza sin su permiso, con dobles de los puertos y sin emulador (FR-010,
// FR-015). Es lo mismo que hace la guarda de las callable: autorizar con lo que declara la clase.
describe('aislamiento de permisos en los casos de uso', () => {
  it.each(CATALOG.map((UseCase) => [UseCase.name, UseCase] as const))('%s exige catalog.write', async (_name, UseCase) => {
    expect(UseCase.requires).toEqual({ kind: 'permission', permission: 'catalog.write' });
    await expect(allowed(['catalog.write'], UseCase.requires)).resolves.toBe(true);
    await expect(allowed(['catalog.read', 'variant.stock.write', 'variant.price.write', 'variant.cost.write'], UseCase.requires)).resolves.toBe(false);
  });

  // FR-015: precio, costo y catálogo son concesiones independientes; ninguna implica otra.
  it.each<[string, Permission, Requirement, Requirement[]]>([
    ['precio', 'variant.price.write', SetVariantPrice.requires, [SetVariantCost.requires, SetVariantStock.requires, CreateProduct.requires]],
    ['costo', 'variant.cost.write', SetVariantCost.requires, [SetVariantPrice.requires, SetVariantStock.requires, CreateProduct.requires]],
    ['existencias', 'variant.stock.write', SetVariantStock.requires, [SetVariantPrice.requires, SetVariantCost.requires, CreateProduct.requires]],
  ])('con solo el permiso de %s, ese y nada más', async (_label, permission, own, others) => {
    await expect(allowed([permission], own)).resolves.toBe(true);
    for (const other of others) await expect(allowed([permission], other)).resolves.toBe(false);
  });

  it('leer el costo no permite cambiarlo', async () => {
    await expect(allowed(['variant.cost.read'], SetVariantCost.requires)).resolves.toBe(false);
  });

  it('el rol de Catálogo predefinido no cambia precios ni costo, y sí existencias (FR-016)', async () => {
    const preset: Permission[] = ['catalog.read', 'catalog.write', 'variant.stock.write'];
    await expect(allowed(preset, SetVariantPrice.requires)).resolves.toBe(false);
    await expect(allowed(preset, SetVariantCost.requires)).resolves.toBe(false);
    await expect(allowed(preset, SetVariantStock.requires)).resolves.toBe(true);
  });
});
