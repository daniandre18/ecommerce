import type { CatalogCommands, CommandFailure, CommandResult, GateErrorCode } from '@ecommerce/application';
import type { TenantId } from '@ecommerce/domain';
import { httpsCallable, type Functions } from 'firebase/functions';

/**
 * Las órdenes de catálogo, una callable cada una. Las reglas de negocio vuelven en la envoltura del
 * contrato; lo que corta la guarda o la red llega como excepción y se normaliza al mismo resultado.
 */
export class CallableCatalogCommands implements CatalogCommands {
  constructor(private readonly functions: Functions) {}

  createProduct: CatalogCommands['createProduct'] = (tenantId, input) => this.call('createProduct', tenantId, input);
  updateProductDetails: CatalogCommands['updateProductDetails'] = (tenantId, input) => this.call('updateProductDetails', tenantId, input);
  setProductOptions: CatalogCommands['setProductOptions'] = (tenantId, input) => this.call('setProductOptions', tenantId, input);
  setProductStatus: CatalogCommands['setProductStatus'] = (tenantId, input) => this.call('setProductStatus', tenantId, input);
  setVariantSku: CatalogCommands['setVariantSku'] = (tenantId, input) => this.call('setVariantSku', tenantId, input);
  archiveProduct: CatalogCommands['archiveProduct'] = (tenantId, input) => this.call('archiveProduct', tenantId, input);
  archiveVariant: CatalogCommands['archiveVariant'] = (tenantId, input) => this.call('archiveVariant', tenantId, input);
  setVariantPrice: CatalogCommands['setVariantPrice'] = (tenantId, input) => this.call('setVariantPrice', tenantId, input);
  setVariantCost: CatalogCommands['setVariantCost'] = (tenantId, input) => this.call('setVariantCost', tenantId, input);
  setVariantStock: CatalogCommands['setVariantStock'] = (tenantId, input) => this.call('setVariantStock', tenantId, input);

  private async call<T>(name: string, tenantId: TenantId, input: object): Promise<CommandResult<T>> {
    try {
      const { data } = await httpsCallable<object, CommandResult<T>>(this.functions, name)({ ...input, tenantId });
      return data;
    } catch (error) {
      return gateFailure(error);
    }
  }
}

const GATE_CODES: ReadonlySet<string> = new Set<GateErrorCode>(['unauthenticated', 'failed-precondition', 'permission-denied', 'unavailable', 'internal']);

/** Exportada para probarla sin emulador. `deadline-exceeded` es, para quien opera, lo mismo que sin conexión. */
export function gateFailure(error: unknown): CommandFailure<GateErrorCode> {
  const raw = (error as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^functions\//, '') : undefined;
  const message = error instanceof Error ? error.message : 'Falla desconocida';
  if (code === 'deadline-exceeded') return { ok: false, code: 'unavailable', message };
  if (code !== undefined && GATE_CODES.has(code)) return { ok: false, code: code as GateErrorCode, message };
  console.error('Falla inesperada al llamar al servidor', error);
  return { ok: false, code: 'internal', message };
}
