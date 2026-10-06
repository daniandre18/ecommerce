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
  setProductSlug: CatalogCommands['setProductSlug'] = (tenantId, input) => this.call('setProductSlug', tenantId, input);
  setProductShipping: CatalogCommands['setProductShipping'] = (tenantId, input) => this.call('setProductShipping', tenantId, input);
  setProductType: CatalogCommands['setProductType'] = (tenantId, input) => this.call('setProductType', tenantId, input);
  createCategory: CatalogCommands['createCategory'] = (tenantId, input) => this.call('createCategory', tenantId, input);
  renameCategory: CatalogCommands['renameCategory'] = (tenantId, input) => this.call('renameCategory', tenantId, input);
  setCategorySlug: CatalogCommands['setCategorySlug'] = (tenantId, input) => this.call('setCategorySlug', tenantId, input);
  moveCategory: CatalogCommands['moveCategory'] = (tenantId, input) => this.call('moveCategory', tenantId, input);
  setCategoryHidden: CatalogCommands['setCategoryHidden'] = (tenantId, input) => this.call('setCategoryHidden', tenantId, input);
  deleteCategory: CatalogCommands['deleteCategory'] = (tenantId, input) => this.call('deleteCategory', tenantId, input);
  setProductCategories: CatalogCommands['setProductCategories'] = (tenantId, input) => this.call('setProductCategories', tenantId, input);
  assignCategory: CatalogCommands['assignCategory'] = (tenantId, input) => this.call('assignCategory', tenantId, input);
  unassignCategory: CatalogCommands['unassignCategory'] = (tenantId, input) => this.call('unassignCategory', tenantId, input);
  setSaleConditions: CatalogCommands['setSaleConditions'] = (tenantId, input) => this.call('setSaleConditions', tenantId, input);
  addToSection: CatalogCommands['addToSection'] = (tenantId, input) => this.call('addToSection', tenantId, input);
  removeFromSection: CatalogCommands['removeFromSection'] = (tenantId, input) => this.call('removeFromSection', tenantId, input);

  private call<T>(name: string, tenantId: TenantId, input: object): Promise<CommandResult<T>> {
    return callCommand<T>(this.functions, name, { ...input, tenantId });
  }
}
