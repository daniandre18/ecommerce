import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { settle } from '../../../testing/settle';
import { ConfirmDialog } from '../confirm-dialog';
import { confirmUnsaved, PendingChanges, trackUnsaved } from './pending-changes';

const unsaved = signal(false);

@Component({ template: '<p>editor</p>' })
class Editor {
  constructor() {
    trackUnsaved(() => unsaved());
  }
}

@Component({ template: '<p>otra vista</p>' })
class Elsewhere {}

// T094 — FR-039: lo escrito y sin guardar no se pierde en silencio al salir.
describe('PendingChanges', () => {
  const dialog = { open: vi.fn() };

  beforeEach(() => {
    unsaved.set(false);
    dialog.open.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'editor', component: Editor, canDeactivate: [confirmUnsaved] },
          { path: 'otra', component: Elsewhere },
        ]),
        { provide: MatDialog, useValue: dialog },
      ],
    });
  });

  async function openEditor() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/editor');
    return harness;
  }

  it('sigue lo sin guardar de cada vista mientras está abierta', async () => {
    const pending = TestBed.inject(PendingChanges);
    const harness = await openEditor();
    expect(pending.any()).toBe(false);
    unsaved.set(true);
    expect(pending.any()).toBe(true);

    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    await harness.navigateByUrl('/otra');
    expect(pending.any()).toBe(false);
  });

  it('sin nada pendiente, se sale sin preguntar', async () => {
    const harness = await openEditor();
    await harness.navigateByUrl('/otra');
    expect(dialog.open).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/otra');
  });

  it('con algo pendiente, pregunta; si no se confirma, se queda', async () => {
    const harness = await openEditor();
    unsaved.set(true);
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    await harness.navigateByUrl('/otra');
    await settle();
    expect(dialog.open).toHaveBeenCalledWith(ConfirmDialog, { data: expect.objectContaining({ confirm: 'Salir sin guardar' }) });
    expect(TestBed.inject(Router).url).toBe('/editor');

    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    await harness.navigateByUrl('/otra');
    expect(TestBed.inject(Router).url).toBe('/otra');
  });

  it('cerrar o recargar la pestaña con algo pendiente pide confirmar', async () => {
    await openEditor();
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    unsaved.set(true);
    expect(leave()).toBe(true);
  });
});
