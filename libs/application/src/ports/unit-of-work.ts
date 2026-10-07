import type {
  AuditLogRepository,
  CategoryTreeRepository,
  CategorySlugRepository,
  FeaturedSectionsRepository,
  GtinIndexRepository,
  InvitationRepository,
  MembershipRepository,
  ProductRepository,
  RoleRepository,
  SkuIndexRepository,
  SlugIndexRepository,
  TenantRepository,
  VariantCostsRepository,
  VariantRepository,
  VocabularyRepository,
} from './repositories';

/**
 * Los repositorios disponibles dentro de una transacción. Todo lo que se lee y escribe a través de
 * ellos se confirma junto o no se confirma.
 */
export interface TransactionScope {
  readonly tenant: TenantRepository;
  readonly audit: AuditLogRepository;
  readonly members: MembershipRepository;
  readonly invitations: InvitationRepository;
  readonly roles: RoleRepository;
  readonly products: ProductRepository;
  readonly variants: VariantRepository;
  readonly costs: VariantCostsRepository;
  readonly skuIndex: SkuIndexRepository;
  readonly slugIndex: SlugIndexRepository;
  readonly vocabulary: VocabularyRepository;
  readonly categories: CategoryTreeRepository;
  readonly categorySlugs: CategorySlugRepository;
  readonly sections: FeaturedSectionsRepository;
  readonly gtinIndex: GtinIndexRepository;
}

/**
 * Todo lo que ocurre dentro de `run()` se confirma junto o no ocurre. Es lo que hace cumplir la
 * atomicidad de FR-030 en ambos sentidos —ni entrada sin cambio, ni cambio sin entrada— sin código
 * defensivo en cada caso de uso.
 *
 * Dos reglas que todo caso de uso debe respetar:
 * - **Todas las lecturas antes que cualquier escritura.** Firestore lo exige dentro de una
 *   transacción; leer después de escribir lanza.
 * - **`work` puede ejecutarse más de una vez** si hay contención, así que no debe tener efectos
 *   fuera de la transacción (nada de enviar correos ni escribir eventos de seguridad adentro).
 */
export interface UnitOfWork {
  run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T>;
}
