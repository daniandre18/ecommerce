import { Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import {
  InvalidIdentifierError,
  productId,
  tenantId,
  type CategoryTree,
  type FeaturedSections,
  type ImageRef,
  type Product,
  type ProductId,
  type TenantId,
  type Variant,
} from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { HasPermission } from '../../shared/directives/has-permission.directive';
import { liveResource } from '../../shared/live-resource';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import { CURRENT_TENANT } from '../../tenant/current-tenant';
import { ImageUpload } from '../image-upload/image-upload';
import { ProductVideo } from '../image-upload/product-video';
import { VariantTable } from '../variant-table/variant-table';
import { CategoriesSection } from './categories-section/categories-section';
import { DetailsSection } from './details-section';
import { ExternalCatalogsSection } from './external-catalogs-section/external-catalogs-section';
import { OptionsEditor } from './options-editor/options-editor';
import { PresentationSection } from './presentation-section/presentation-section';
import { StatusControl } from './status-control/status-control';
import { ShippingSection } from './shipping-section/shipping-section';
import { StorefrontSection } from './storefront-section/storefront-section';

interface Ids {
  readonly tenantId: TenantId;
  readonly productId: ProductId;
}

const STATUS_LABELS: Record<Product['status'], string> = { draft: 'Borrador', active: 'Activo', unlisted: 'No listado' };

/** Un producto: sus datos, sus opciones de variación y una fila por variante (T055, T056). */
@Component({
  selector: 'app-product-editor',
  imports: [
    RouterLink,
    MatButton,
    Skeleton,
    ErrorState,
    EmptyState,
    HasPermission,
    DetailsSection,
    StorefrontSection,
    ShippingSection,
    PresentationSection,
    CategoriesSection,
    ExternalCatalogsSection,
    ImageUpload,
    ProductVideo,
    StatusControl,
    OptionsEditor,
    VariantTable,
  ],
  templateUrl: './product-editor.html',
  styleUrl: './product-editor.scss',
})
export class ProductEditor {
  readonly tenantId = input.required<string>();
  readonly productId = input.required<string>();

  private readonly queries = inject(CATALOG_QUERIES);
  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly tenant = inject(CURRENT_TENANT);
  protected readonly access = inject(CURRENT_ACCESS);

  private readonly ids = computed(() => parseIds(this.tenantId(), this.productId()));
  protected readonly product = liveResource<Product | null, Ids>({
    params: () => this.ids(),
    subscribe: (ids, watcher) => this.queries.watchProduct(ids.tenantId, ids.productId, watcher),
  });
  protected readonly variants = liveResource<readonly Variant[], Ids>({
    params: () => this.ids(),
    subscribe: (ids, watcher) => this.queries.watchVariants(ids.tenantId, ids.productId, watcher),
  });
  /**
   * El árbol, para las rutas de las categorías del producto. A 1.000 categorías es el documento más
   * pesado del editor y, pedido junto con lo demás, demoraba las variantes por la misma conexión: se
   * pide cuando ellas llegaron, y el editor no lo espera (T094 de la 002).
   */
  protected readonly categoryTree = liveResource<CategoryTree, TenantId>({
    params: () => (this.variants.hasValue() ? this.ids()?.tenantId : undefined),
    subscribe: (tenant, watcher) => this.queries.watchCategoryTree(tenant, watcher),
  });

  /** En qué secciones destacadas está: el aviso de "en borrador" y el del archivado dependen de eso. */
  protected readonly sections = liveResource<FeaturedSections, TenantId>({
    params: () => this.ids()?.tenantId,
    subscribe: (tenant, watcher) => this.queries.watchSections(tenant, watcher),
  });

  /**
   * El editor se muestra cuando llegó lo que cambia su forma: el producto, las secciones destacadas
   * y qué puede hacer la cuenta. Si algo de eso llegara después, lo que depende de ello —el enlace a
   * la bitácora, los botones de guardar, el aviso de una sección— aparecería de golpe y empujaría lo
   * demás (hallado por `loading-states.spec.ts`, SC-009 de la 001). El árbol no: la sección de
   * categorías reserva su lugar hasta tenerlo (T094 de la 002).
   */
  protected readonly loaded = computed(() => {
    if (this.access() === undefined || !this.product.hasValue() || !this.sections.hasValue()) return undefined;
    const product = this.product.value();
    const tree = this.categoryTree.hasValue() ? this.categoryTree.value() : undefined;
    const sections = this.sections.value();
    return product && sections ? { product, tree, sections } : undefined;
  });

  protected readonly currency = computed(() => this.tenant()?.currency);
  protected readonly catalogLink = computed(() => ['/t', this.tenantId(), 'catalog']);
  protected readonly auditLink = computed(() => ['/t', this.tenantId(), 'audit']);
  protected readonly missing = computed(() => this.ids() === undefined || (this.product.hasValue() && this.product.value() === null));

  /** Las imágenes del producto se guardan con su versión vigente, como el resto de sus datos. */
  protected readonly saveProductImages = (images: ImageRef[]) => {
    const product = this.product.hasValue() ? this.product.value() : null;
    if (!product) return Promise.resolve({ ok: false as const, code: 'not-found' as const, message: 'El producto no está cargado' });
    return this.commands.updateProductDetails(product.tenantId, { productId: product.id, version: product.version, images });
  };

  protected statusLabel(product: Product): string {
    return STATUS_LABELS[product.status];
  }
}

function parseIds(rawTenant: string, rawProduct: string): Ids | undefined {
  try {
    return { tenantId: tenantId(rawTenant), productId: productId(rawProduct) };
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return undefined;
    throw error;
  }
}
