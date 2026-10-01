import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MemberAccess } from '@ecommerce/domain';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import { HasPermission } from './has-permission.directive';

@Component({
  imports: [HasPermission],
  template: `<button *appHasPermission="'variant.price.write'">Cambiar precio</button>`,
})
class Host {}

describe('HasPermission', () => {
  const access = signal<MemberAccess | null | undefined>(undefined);
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;

  beforeEach(() => {
    access.set(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: CURRENT_ACCESS, useValue: access }] });
    fixture = TestBed.createComponent(Host);
  });

  const shown = () => {
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('button') !== null;
  };

  it('mientras el acceso carga, no se ofrece', () => {
    expect(shown()).toBe(false);
  });

  it('se ofrece con el permiso, y al Propietario siempre', () => {
    access.set({ isOwner: false, permissions: ['variant.price.write'] });
    expect(shown()).toBe(true);
    access.set({ isOwner: true, permissions: [] });
    expect(shown()).toBe(true);
  });

  it('sin el permiso no se ofrece, y se va en cuanto se lo quitan', () => {
    access.set({ isOwner: false, permissions: ['variant.price.write'] });
    expect(shown()).toBe(true);
    access.set({ isOwner: false, permissions: ['catalog.write'] });
    expect(shown()).toBe(false);
  });

  it('sin membresía activa no se ofrece', () => {
    access.set(null);
    expect(shown()).toBe(false);
  });
});
