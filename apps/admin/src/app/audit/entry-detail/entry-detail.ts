import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AuditEntry, TenantId } from '@ecommerce/domain';
import { describeEntry, type EntryNames } from './describe-entry';

const WHEN = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
let instances = 0;

/** Una entrada de la bitácora: qué pasó, a qué, quién y cuándo, y qué había antes y qué quedó (T086). */
@Component({
  selector: 'app-entry-detail',
  imports: [RouterLink],
  template: `
    <article [attr.aria-labelledby]="headingId">
      <p class="what" [id]="headingId">
        <span class="title">{{ view().title }}</span>
        ·
        @if (view().productId; as product) {
          <a [routerLink]="['/t', tenantId(), 'catalog', product]">{{ view().subject }}</a>
        } @else {
          <span>{{ view().subject }}</span>
        }
      </p>
      <p class="who">
        {{ actor() }} · <time [attr.datetime]="entry().at.toISOString()">{{ when() }}</time>
      </p>
      @if (view().before !== undefined || view().after !== undefined) {
        <dl>
          @if (view().before !== undefined) {
            <div>
              <dt>Antes</dt>
              <dd>{{ view().before }}</dd>
            </div>
          }
          @if (view().after !== undefined) {
            <div>
              <dt>Después</dt>
              <dd>{{ view().after }}</dd>
            </div>
          }
        </dl>
      }
      @if (view().granted; as granted) {
        <p class="diff">Ganó: {{ granted.join(', ') }}</p>
      }
      @if (view().revoked; as revoked) {
        <p class="diff">Perdió: {{ revoked.join(', ') }}</p>
      }
    </article>
  `,
  styles: `
    article {
      padding: 12px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    p {
      margin: 0;
    }

    .what {
      overflow-wrap: anywhere;
    }

    .title {
      font: var(--mat-sys-title-small);
    }

    .who,
    .diff {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }

    dl {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 4px 0 0;
    }

    dl div {
      display: flex;
      gap: 4px;
    }

    dt {
      color: var(--mat-sys-on-surface-variant);
    }

    dt::after {
      content: ':';
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class EntryDetail {
  readonly tenantId = input.required<TenantId>();
  readonly entry = input.required<AuditEntry>();
  readonly names = input.required<EntryNames>();

  protected readonly headingId = `entrada-${++instances}`;
  protected readonly view = computed(() => describeEntry(this.entry(), this.names()));
  protected readonly when = computed(() => WHEN.format(this.entry().at));
  protected readonly actor = computed(() => {
    const entry = this.entry();
    return entry.actorKind === 'platform-operator' ? 'Operador de la plataforma' : entry.actorName || 'Una persona';
  });
}
