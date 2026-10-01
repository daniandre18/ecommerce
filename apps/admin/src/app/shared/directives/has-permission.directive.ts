import { computed, Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import type { Permission } from '@ecommerce/domain';
import { CURRENT_ACCESS, grants } from '../../tenant/current-access';

/**
 * `*appHasPermission="'catalog.write'"`: el contenido aparece solo si el acceso de la cuenta en el
 * comercio concede el permiso, y se va en cuanto deja de concederlo (T079). Es cosmética: ocultar
 * un botón no protege nada; el control real está en el servidor (FR-010, FR-040).
 */
@Directive({ selector: '[appHasPermission]' })
export class HasPermission {
  readonly appHasPermission = input.required<Permission>();

  constructor() {
    const access = inject(CURRENT_ACCESS);
    const template = inject(TemplateRef);
    const container = inject(ViewContainerRef);
    const allowed = computed(() => grants(access(), this.appHasPermission()));
    effect(() => {
      container.clear();
      if (allowed()) container.createEmbeddedView(template);
    });
  }
}
