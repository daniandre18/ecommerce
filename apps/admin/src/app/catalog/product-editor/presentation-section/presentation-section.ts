import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { CommandFailure } from '@ecommerce/application';
import { MAX_SECTION_PRODUCTS, SECTION_IDS, type FeaturedSections, type Product, type SectionId, type TenantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { keepUnsaved } from '../../../shared/keep-unsaved';
import { trackUnsaved } from '../../../shared/pending-changes/pending-changes';
import { injectCan } from '../../../tenant/current-access';
import { SECTION_LABELS, sectionFullMessage, unseenReason } from '../../shared/sections';

interface Conditions {
  priceVisible: boolean;
  freeShipping: boolean;
}

type Membership = Record<SectionId, boolean>;

/**
 * Cómo se ofrece el producto en la tienda (Historia 3 de la 002): si el precio se ve, si tiene envío
 * gratis, y en cuáles de las dos secciones destacadas aparece. Precio y envío son decisiones de
 * precio —`variant.price.write`, FR-003—; las secciones, de catálogo. Cada parte se guarda aparte,
 * con su permiso, y sin él se lee y no se cambia.
 */
@Component({
  selector: 'app-presentation-section',
  imports: [MatCheckbox, MatButton],
  template: `
    <h2 id="como-se-ofrece">Cómo se ofrece</h2>

    <fieldset>
      <legend>Condiciones de venta</legend>
      <mat-checkbox data-field="priceVisible" [checked]="conditions().priceVisible" [disabled]="!canPrice()" (change)="setCondition('priceVisible', $event.checked)">
        Mostrar el precio en la tienda
      </mat-checkbox>
      @if (product().kind === 'physical') {
        <mat-checkbox data-field="freeShipping" [checked]="conditions().freeShipping" [disabled]="!canPrice()" (change)="setCondition('freeShipping', $event.checked)">
          Envío gratis
        </mat-checkbox>
      } @else {
        <p class="note">Un producto digital no se envía: no lleva envío gratis.</p>
      }
      @if (canPrice()) {
        <div role="alert" class="failure">{{ conditionsFailure() }}</div>
        @if (conditionsDirty()) {
          <div class="actions">
            <button matButton type="button" (click)="discardConditions()">Descartar</button>
            <button matButton="filled" type="button" [disabled]="saving()" (click)="saveConditions()">Guardar condiciones</button>
          </div>
        }
      } @else {
        <p class="note">Las cambia quien puede modificar precios.</p>
      }
    </fieldset>

    <fieldset>
      <legend>Secciones destacadas</legend>
      @for (section of sectionIds; track section) {
        <div class="section">
          <mat-checkbox [attr.data-field]="section" [checked]="membership()[section]" [disabled]="!canWrite() || isFull(section)" (change)="setMembership(section, $event.checked)">
            {{ labels[section] }}
          </mat-checkbox>
          <span class="count">{{ sections()[section].length }} de {{ max }}</span>
        </div>
        @if (isFull(section) && canWrite()) {
          <p class="note">{{ labels[section] }} está completa: quitá un producto de la sección para agregar este.</p>
        }
        @if (membership()[section] && unseen(); as reason) {
          <p class="note">La tienda no lo muestra en {{ labels[section] }} mientras esté {{ reason }}.</p>
        }
      }
      @if (canWrite()) {
        <div role="alert" class="failure">{{ sectionsFailure() }}</div>
        @if (membershipDirty()) {
          <div class="actions">
            <button matButton type="button" (click)="discardMembership()">Descartar</button>
            <button matButton="filled" type="button" [disabled]="saving()" (click)="saveMembership()">Guardar secciones</button>
          </div>
        }
      }
    </fieldset>
  `,
  styles: `
    h2 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-large);
    }

    fieldset {
      margin: 0 0 16px;
      padding: 0;
      border: 0;
    }

    legend {
      padding: 0;
      margin-bottom: 4px;
      font: var(--mat-sys-title-small);
    }

    mat-checkbox {
      display: block;
    }

    .section {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      column-gap: 8px;
    }

    .count {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .note {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class PresentationSection {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();
  /** Las lee el editor, que espera a tenerlas antes de mostrarse. */
  readonly sections = input.required<FeaturedSections>();

  protected readonly sectionIds = SECTION_IDS;
  protected readonly labels = SECTION_LABELS;
  protected readonly max = MAX_SECTION_PRODUCTS;

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canPrice = injectCan('variant.price.write');
  protected readonly canWrite = injectCan('catalog.write');
  protected readonly saving = signal(false);

  // ── Condiciones de venta ──────────────────────────────────────────────────────────────────────

  private readonly storedConditions = computed<Conditions>(() => ({ priceVisible: this.product().priceVisible, freeShipping: this.product().freeShipping }));
  protected readonly conditions = linkedSignal<Conditions, Conditions>({ source: this.storedConditions, computation: keepUnsaved });
  protected readonly conditionsDirty = computed(() => {
    const [stored, draft] = [this.storedConditions(), this.conditions()];
    return stored.priceVisible !== draft.priceVisible || stored.freeShipping !== draft.freeShipping;
  });
  protected readonly conditionsFailure = signal('');

  // ── Secciones ─────────────────────────────────────────────────────────────────────────────────

  private readonly storedMembership = computed<Membership>(() => ({
    featured: this.sections().featured.includes(this.product().id),
    offers: this.sections().offers.includes(this.product().id),
  }));
  protected readonly membership = linkedSignal<Membership, Membership>({ source: this.storedMembership, computation: keepUnsaved });
  protected readonly membershipDirty = computed(() => SECTION_IDS.some((section) => this.membership()[section] !== this.storedMembership()[section]));
  protected readonly sectionsFailure = signal('');
  /** Si está en una sección pero la tienda no lo mostraría ahí: en borrador o no listado. */
  protected readonly unseen = computed(() => unseenReason(this.product()));

  constructor() {
    trackUnsaved(() => this.conditionsDirty() || this.membershipDirty());
  }

  /** Sin lugar, y él no está: no se ofrece agregarlo (FR-027a). */
  protected isFull(section: SectionId): boolean {
    return this.sections()[section].length >= MAX_SECTION_PRODUCTS && !this.storedMembership()[section];
  }

  protected setCondition(field: keyof Conditions, value: boolean): void {
    this.conditions.update((conditions) => ({ ...conditions, [field]: value }));
  }

  protected setMembership(section: SectionId, value: boolean): void {
    this.membership.update((membership) => ({ ...membership, [section]: value }));
  }

  protected discardConditions(): void {
    this.conditions.set(this.storedConditions());
    this.conditionsFailure.set('');
  }

  protected discardMembership(): void {
    this.membership.set(this.storedMembership());
    this.sectionsFailure.set('');
  }

  /** Solo lo que cambió: el campo que no se tocó no viaja. */
  protected async saveConditions(): Promise<void> {
    const [stored, draft, product] = [this.storedConditions(), this.conditions(), this.product()];
    this.saving.set(true);
    this.conditionsFailure.set('');
    const result = await this.commands.setSaleConditions(this.tenantId(), {
      changes: [{ productId: product.id, version: product.version }],
      ...(draft.priceVisible === stored.priceVisible ? {} : { priceVisible: draft.priceVisible }),
      ...(draft.freeShipping === stored.freeShipping ? {} : { freeShipping: draft.freeShipping }),
    });
    this.saving.set(false);
    if (!result.ok) {
      this.conditionsFailure.set(commandErrorMessage(result.code));
      return;
    }
    this.conditions.set(draft);
    this.snackBar.open('Condiciones de venta guardadas', undefined, { duration: 3000 });
  }

  /** Una orden por sección que cambió; si una se rechaza, se dice por qué y lo elegido se conserva. */
  protected async saveMembership(): Promise<void> {
    const [stored, draft] = [this.storedMembership(), this.membership()];
    const productIds = [this.product().id];
    this.saving.set(true);
    this.sectionsFailure.set('');
    for (const section of SECTION_IDS) {
      if (draft[section] === stored[section]) continue;
      const result = draft[section]
        ? await this.commands.addToSection(this.tenantId(), { section, productIds })
        : await this.commands.removeFromSection(this.tenantId(), { section, productIds });
      if (!result.ok) {
        this.saving.set(false);
        this.sectionsFailure.set(sectionFailure(result));
        return;
      }
    }
    this.saving.set(false);
    this.snackBar.open('Secciones guardadas', undefined, { duration: 3000 });
  }
}

function sectionFailure(failure: CommandFailure): string {
  return failure.code === 'section-full' ? sectionFullMessage(failure.details) : commandErrorMessage(failure.code);
}
