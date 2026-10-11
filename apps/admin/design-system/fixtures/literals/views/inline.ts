import { Component } from '@angular/core';

@Component({
  selector: 'app-inline',
  template: `<p style="padding: 4px">hola</p>`,
  styles: `
    :host {
      display: block;
      gap: 8px;
    }
  `,
})
export class Inline {}

@Component({
  selector: 'app-inline-array',
  template: '',
  styles: [
    `
      .b {
        font-weight: 600;
      }
    `,
  ],
})
export class InlineArray {}

@Component({
  selector: 'app-inline-one-line',
  template: '',
  styles: ['.c { gap: 4px; }'],
})
export class InlineOneLine {}
