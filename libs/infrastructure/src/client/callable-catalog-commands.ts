import type { CatalogCommands, CommandResult } from '@ecommerce/application';
import type { TenantId } from '@ecommerce/domain';
import type { Functions } from 'firebase/functions';
import { callCommand } from './callable';

/** Las órdenes de catálogo, una callable cada una. */
export class CallableCatalogCommands implements CatalogCommands {
  constructor(private readonly functions: Functions) {}

  createProduct: CatalogCommands['createProduct'] = (tenantId, input) => this.call('createProduct', tenantId, input);
  updateProductDetails: CatalogCommands['updateProductDetails'] = (tenantId, input) => this.call('updateProductDetails', tenantId, input);
  setProductOptions: CatalogCommands['setProductOptions'] = (tenantId, input) => this.call('setProductOptions', tenantId, input);
  setProductStatus: CatalogCommands['setProductStatus'] = (tenantId, input) => this.call('setProductStatus', tenantId, input);
  setVariantSku: CatalogCommands['setVariantSku'] = (tenantId, input) => this.call('setVariantSku', tenantId, input);
  setVariantImages: CatalogCommands['setVariantImages'] = (tenantId, input) => this.call('setVariantImages', tenantId, input);
  archiveProduct: CatalogCommands['archiveProduct'] = (tenantId, input) => this.call('archiveProduct', tenantId, input);
  archiveVariant: CatalogCommands['archiveVariant'] = (tenantId, input) => this.call('archiveVariant', tenantId, input);
  setVariantPrice: CatalogCommands['setVariantPrice'] = (tenantId, input) => this.call('setVariantPrice', tenantId, input);
  setVariantCost: CatalogCommands['setVariantCost'] = (tenantId, input) => this.call('setVariantCost', tenantId, input);
  setVariantStock: CatalogCommands['setVariantStock'] = (tenantId, input) => this.call('setVariantStock', tenantId, input);

  private call<T>(name: string, tenantId: TenantId, input: object): Promise<CommandResult<T>> {
    return callCommand<T>(this.functions, name, { ...input, tenantId });
  }
}
