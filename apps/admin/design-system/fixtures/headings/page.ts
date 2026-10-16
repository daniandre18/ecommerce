// Fixture de headings.spec.ts: una vista que repite el estilo global del título.
import { Component } from '@angular/core';

@Component({
  selector: 'app-page',
  template: '<h1>Productos</h1>',
  styles: `
    h1 {
      margin: 0;
      font: var(--ds-type-page-title);
      letter-spacing: var(--ds-type-page-title-tracking);
    }
  `,
})
export class Page {}
