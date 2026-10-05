import type { SlugIndexEntry, SlugIndexRepository } from '@ecommerce/application';
import { productId } from '@ecommerce/domain';
import type { Transaction } from 'firebase-admin/firestore';
import type { TenantPaths } from '../tenant-paths';

/** El id de cada entrada es la URL amigable; la unicidad por comercio sale de la ruta (FR-005). */
export function slugIndexRepository(t: Transaction, paths: TenantPaths): SlugIndexRepository {
  return {
    find: async (slug) => {
      const data = (await t.get(paths.slugIndexDoc(slug))).data();
      return data ? slugIndexEntryFromDoc(data) : null;
    },
    // `create` falla al confirmar si la URL ya existe: dos creaciones simultáneas no pueden tomarla.
    reserve: async (slug, owner) => {
      t.create(paths.slugIndexDoc(slug), { productId: owner, kind: 'current', createdAt: new Date() });
    },
    release: async (slug) => {
      t.delete(paths.slugIndexDoc(slug));
    },
    // `update` falla si la entrada no existe: marcar una URL que no está reservada revelaría un índice
    // inconsistente, y eso tiene que fallar fuerte.
    markPrevious: async (slug) => {
      t.update(paths.slugIndexDoc(slug), { kind: 'previous' });
    },
    markCurrent: async (slug) => {
      t.update(paths.slugIndexDoc(slug), { kind: 'current' });
    },
  };
}

function slugIndexEntryFromDoc(d: Readonly<Record<string, unknown>>): SlugIndexEntry {
  const kind = d['kind'];
  if (kind !== 'current' && kind !== 'previous') throw new TypeError(`Reserva de URL con tipo desconocido: ${String(kind)}`);
  return { productId: productId(String(d['productId'])), kind };
}
