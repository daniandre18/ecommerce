declare const brand: unique symbol;

/** Un string que el compilador no deja confundir con otro identificador. */
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Branded<string, 'TenantId'>;
export type Uid = Branded<string, 'Uid'>;
export type RoleId = Branded<string, 'RoleId'>;
export type ProductId = Branded<string, 'ProductId'>;
export type VariantId = Branded<string, 'VariantId'>;
export type OptionId = Branded<string, 'OptionId'>;
export type ValueId = Branded<string, 'ValueId'>;
export type InvitationId = Branded<string, 'InvitationId'>;
export type AuditEntryId = Branded<string, 'AuditEntryId'>;
export type BatchId = Branded<string, 'BatchId'>;
export type PlatformOperatorId = Branded<string, 'PlatformOperatorId'>;

export class InvalidIdentifierError extends Error {
  override readonly name = 'InvalidIdentifierError';
}

/**
 * Un identificador es un único segmento de ruta. Los identificadores forman rutas de
 * almacenamiento a partir de datos que manda el cliente —el `tenantId` llega en la carga útil
 * (FR-003)—, así que una `/` permitiría construir rutas que no son las que el código cree.
 */
export function isSingleSegment(value: string): boolean {
  return value !== '' && !value.includes('/') && value !== '.' && value !== '..';
}

function identifier<T extends string>(value: string, kind: string): T {
  if (!isSingleSegment(value) || value !== value.trim()) {
    throw new InvalidIdentifierError(`${kind} inválido: ${JSON.stringify(value)}`);
  }
  return value as T;
}

export const tenantId = (value: string) => identifier<TenantId>(value, 'TenantId');
export const uid = (value: string) => identifier<Uid>(value, 'Uid');
export const roleId = (value: string) => identifier<RoleId>(value, 'RoleId');
export const productId = (value: string) => identifier<ProductId>(value, 'ProductId');
export const variantId = (value: string) => identifier<VariantId>(value, 'VariantId');
export const optionId = (value: string) => identifier<OptionId>(value, 'OptionId');
export const valueId = (value: string) => identifier<ValueId>(value, 'ValueId');
export const batchId = (value: string) => identifier<BatchId>(value, 'BatchId');
