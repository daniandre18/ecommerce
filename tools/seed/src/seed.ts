import { auth, FirestoreUnitOfWork, firestore } from '@ecommerce/infrastructure';
import {
  activateMembership,
  CATALOG_ROLE_ID,
  createCatalogRole,
  createOwnerRole,
  inviteMembership,
  OWNER_ROLE_ID,
  tenantId,
  uid,
  type Membership,
  type Role,
  type RoleId,
  type TenantId,
} from '@ecommerce/domain';

/** Contraseña de todas las cuentas sembradas. Solo existe en los emuladores. */
export const SEED_PASSWORD = 'test-1234';

const AT = new Date('2026-01-01T00:00:00Z');

interface SeedAccount {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
}

interface SeedMembership {
  readonly account: SeedAccount;
  readonly role: RoleId;
}

interface SeedTenant {
  readonly id: TenantId;
  readonly name: string;
  readonly owner: SeedAccount;
  readonly collaborators: readonly SeedMembership[];
}

export const ACCOUNTS = {
  ownerT1: { uid: 'owner-t1', email: 'owner@t1.test', displayName: 'Propietaria de t1' },
  catalogT1: { uid: 'catalogo-t1', email: 'catalogo@t1.test', displayName: 'Catálogo de t1' },
  multi: { uid: 'multi', email: 'multi@test', displayName: 'Multi' },
} as const satisfies Record<string, SeedAccount>;

/**
 * Exactamente un Propietario por comercio (FR-011). `multi` es Propietaria de t2 y colaboradora de
 * catálogo en t1: el caso que prueba que ser dueña en un comercio no concede nada en otro (FR-005).
 */
export const TENANTS: readonly SeedTenant[] = [
  {
    id: tenantId('t1'),
    name: 'Comercio Uno',
    owner: ACCOUNTS.ownerT1,
    collaborators: [
      { account: ACCOUNTS.catalogT1, role: CATALOG_ROLE_ID },
      { account: ACCOUNTS.multi, role: CATALOG_ROLE_ID },
    ],
  },
  { id: tenantId('t2'), name: 'Comercio Dos', owner: ACCOUNTS.multi, collaborators: [] },
];

/**
 * Crea las cuentas y los comercios de prueba. Es idempotente: correrlo dos veces deja el mismo
 * estado. Escribe con los mismos adaptadores que usa la aplicación, así que los documentos tienen
 * exactamente la forma que la aplicación lee.
 */
export async function seed(): Promise<void> {
  assertEmulatorsOnly();
  for (const account of Object.values(ACCOUNTS)) await upsertAccount(account);
  for (const tenant of TENANTS) await seedTenant(tenant);
}

/**
 * Las cuentas sembradas tienen una contraseña conocida: jamás pueden llegar a un proyecto real.
 * Se exige emulador de Auth y de Firestore, y un proyecto `demo-*`, que el emulador aísla.
 */
function assertEmulatorsOnly(): void {
  const project = process.env['GCLOUD_PROJECT'] ?? 'demo-ecommerce';
  const missing = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'].filter((v) => !process.env[v]);
  if (missing.length > 0 || !project.startsWith('demo-')) {
    throw new Error(
      `El sembrador solo corre contra emuladores de un proyecto demo-*. ` +
        `Faltan: ${missing.join(', ') || 'ninguna'}; proyecto: ${project}`,
    );
  }
}

async function upsertAccount(account: SeedAccount): Promise<void> {
  const fields = { email: account.email, displayName: account.displayName, password: SEED_PASSWORD };
  try {
    await auth().updateUser(account.uid, fields);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    await auth().createUser({ uid: account.uid, ...fields });
  }
}

async function seedTenant(tenant: SeedTenant): Promise<void> {
  const memberships = [
    { ...activeMembership(tenant.id, tenant.owner, OWNER_ROLE_ID), isOwner: true },
    ...tenant.collaborators.map((c) => activeMembership(tenant.id, c.account, c.role)),
  ];
  const roles = [createOwnerRole(tenant.id, AT), createCatalogRole(tenant.id, AT)].map((role) =>
    withMemberCount(role, memberships),
  );

  await firestore().doc(`tenants/${tenant.id}`).set({
    name: tenant.name,
    ownerUid: tenant.owner.uid,
    currency: 'USD',
    createdAt: AT,
    createdBy: 'seed',
    status: 'active',
  });

  await new FirestoreUnitOfWork(firestore(), tenant.id).run(async (tx) => {
    for (const role of roles) await tx.roles.save(role);
    for (const membership of memberships) await tx.members.save(membership);
  });
}

function activeMembership(tenant: TenantId, account: SeedAccount, role: RoleId): Membership {
  const invited = inviteMembership({
    uid: uid(account.uid),
    tenantId: tenant,
    roleId: role,
    displayName: account.displayName,
    email: account.email,
    at: AT,
  });
  return activateMembership(invited, AT);
}

/** `memberCount` es lo que impide borrar un rol en uso (FR-013): tiene que coincidir con la siembra. */
function withMemberCount(role: Role, memberships: readonly Membership[]): Role {
  return { ...role, memberCount: memberships.filter((m) => m.roleId === role.id).length };
}
