import { randomUUID } from 'node:crypto';
import { BackfillProductStorefront } from '@ecommerce/application';
import { productId, tenantId } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';

export interface MigrateOptions {
  /** El proyecto de destino; por defecto, el del entorno. */
  readonly project?: string;
  /** El nombre del proyecto real, repetido a propósito: contra uno real no se corre por accidente. */
  readonly confirm?: string;
}

/**
 * Migración de la 002 (T042): asigna URL amigable a cada producto que no la tiene y guarda los
 * valores por defecto de la ficha. Corre como paso del despliegue, ANTES de habilitar las callables
 * y las vistas nuevas. Una transacción por producto, con el mismo caso de uso que usaría el servidor:
 * las URL salen de las factorías del dominio, nunca de cadenas armadas acá.
 *
 * A diferencia del sembrador, sí corre contra un proyecto real —para eso existe—, pero solo si se lo
 * confirma por su nombre. Es idempotente: se puede volver a correr si se corta a la mitad.
 */
export async function migrateStorefront(options: MigrateOptions = {}): Promise<{ migrated: number; already: number }> {
  assertConfirmed(options.project ?? process.env['GCLOUD_PROJECT'] ?? 'demo-ecommerce', options.confirm);

  const db = firestore();
  const backfill = new BackfillProductStorefront({ clock: { now: () => new Date() }, ids: { next: () => randomUUID() } });
  const result = { migrated: 0, already: 0 };

  for (const tenant of await db.collection('tenants').listDocuments()) {
    const uow = new FirestoreUnitOfWork(db, tenantId(tenant.id));
    for (const product of await tenant.collection('products').listDocuments()) {
      const outcome = await uow.run((tx) => backfill.execute(tx, { productId: productId(product.id) }));
      result[outcome] += 1;
    }
  }
  return result;
}

function assertConfirmed(project: string, confirm: string | undefined): void {
  if (project.startsWith('demo-')) return;
  if (confirm !== project) {
    throw new Error(`La migración va a escribir en el proyecto real ${project}. Para hacerlo, repetí su nombre: --confirm ${project}`);
  }
}
