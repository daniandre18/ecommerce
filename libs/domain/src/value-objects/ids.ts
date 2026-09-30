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

export const tenantId = (value: string) => value as TenantId;
export const uid = (value: string) => value as Uid;
export const roleId = (value: string) => value as RoleId;
export const productId = (value: string) => value as ProductId;
export const variantId = (value: string) => value as VariantId;
export const optionId = (value: string) => value as OptionId;
export const valueId = (value: string) => value as ValueId;
export const batchId = (value: string) => value as BatchId;
