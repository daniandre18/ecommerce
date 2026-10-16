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
    /* El separador es el de la fila del sistema (\`.ds-table-row\`, en el \`<li>\` de la bitácora). */
    article {
      padding: var(--ds-space-3) 0;
    }

    p {
      margin: 0;
    }

    .what {
      overflow-wrap: anywhere;
    }

    .title {
      font: var(--ds-type-label);
    }

    /* Metadatos: el nivel de ayuda, más denso que el texto, en secundario (T035). */
    .who,
    .diff {
      color: var(--ds-text-secondary);
      font: var(--ds-type-help);
    }

    dl {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ds-space-1) var(--ds-space-4);
      margin: var(--ds-space-1) 0 0;
    }

    dl div {
      display: flex;
      gap: var(--ds-space-1);
    }

    dt {
      color: var(--ds-text-secondary);
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
