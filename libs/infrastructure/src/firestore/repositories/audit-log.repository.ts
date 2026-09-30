import type { AuditLogRepository } from '@ecommerce/application';
import type { Transaction } from 'firebase-admin/firestore';
import type { TenantPaths } from '../tenant-paths';

export function auditLogRepository(t: Transaction, paths: TenantPaths): AuditLogRepository {
  return {
    // `create` falla si el documento existe: ni por accidente se sobrescribe una entrada.
    append: async (entries) => {
      for (const entry of entries) t.create(paths.collection('auditLog').doc(entry.id), { ...entry });
    },
  };
}
