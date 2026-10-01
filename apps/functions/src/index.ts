import { setGlobalOptions } from 'firebase-functions/options';
import { productionDependencies } from './bootstrap/composition';
import { catalogCallables } from './catalog/callables';
import { pricingCallables } from './pricing/callables';
import { teamCallables } from './team/callables';

/**
 * Una sola región, la misma que Firestore, para no pagar latencia entre regiones. ⚠️ La ubicación
 * de Firestore se elige al crear el proyecto real y no se puede cambiar: esta constante tiene que
 * coincidir con ella.
 */
const REGION = 'us-central1';

// Antes de declarar cualquier función: las opciones globales se leen al declararla.
setGlobalOptions({ region: REGION });

const deps = productionDependencies();

export const {
  createProduct,
  updateProductDetails,
  setProductOptions,
  setProductStatus,
  setVariantSku,
  setVariantImages,
  archiveProduct,
  archiveVariant,
} = catalogCallables(deps);

export const { setVariantPrice, setVariantCost, setVariantStock } = pricingCallables(deps);

export const {
  createRole,
  updateRole,
  deleteRole,
  inviteCollaborator,
  revokeInvitation,
  acceptInvitation,
  assignRole,
  setMembershipEnabled,
  transferOwnership,
} = teamCallables(deps);
