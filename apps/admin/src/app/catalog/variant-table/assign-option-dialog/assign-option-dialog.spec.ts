import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { optionId, valueId } from '@ecommerce/domain';
import { settle } from '../../../../testing/settle';
import { AssignOptionDialog, type AssignOptionData } from './assign-option-dialog';

const size = {
  id: optionId('talla'),
  name: 'Talla',
  position: 1,
  values: [
    { id: valueId('s'), label: 'S', position: 0 },
    { id: valueId('m'), label: 'M', position: 1 },
  ],
};

const data: AssignOptionData = {
  variants: [
    { id: 'v-rojo', label: 'Rojo' },
    { id: 'v-azul', label: 'Azul' },
  ],
  options: [size],
};

// T057 — FR-024: ninguna variante con datos queda sin valor en la opción nueva.
describe('AssignOptionDialog', () => {
  const dialogRef = { close: vi.fn() };

  beforeEach(() => {
    dialogRef.close.mockClear();
    TestBed.configureTestingModule({
      imports: [AssignOptionDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(AssignOptionDialog);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const choose = async (select: HTMLSelectElement | undefined, value: string) => {
      if (!select) throw new Error('No hay selector');
      select.value = value;
      select.dispatchEvent(new Event('input'));
      select.dispatchEvent(new Event('change'));
      await settle();
    };
    const rowSelects = () => [...root.querySelectorAll<HTMLSelectElement>('fieldset select')];
    const submit = async () => {
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, choose, rowSelects, submit };
  }

  it('pide el valor de la opción nueva para cada variante con datos', async () => {
    const { root, rowSelects } = await render();
    expect([...root.querySelectorAll('legend')].map((l) => l.textContent?.trim())).toEqual(['Rojo', 'Azul']);
    expect(rowSelects()).toHaveLength(2);
  });

  it('no confirma mientras falte alguno', async () => {
    const { root, choose, rowSelects, submit } = await render();
    await choose(rowSelects()[0], 's');
    await submit();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Elegí un valor');
  });

  it('con todos elegidos, devuelve una asignación por variante', async () => {
    const { choose, rowSelects, submit } = await render();
    await choose(rowSelects()[0], 's');
    await choose(rowSelects()[1], 'm');
    await submit();
    expect(dialogRef.close).toHaveBeenCalledWith([
      { variantId: 'v-rojo', optionId: 'talla', valueId: 's' },
      { variantId: 'v-azul', optionId: 'talla', valueId: 'm' },
    ]);
  });

  it('"aplicar a todas" completa cada variante con el mismo valor', async () => {
    const { root, choose, submit } = await render();
    await choose(root.querySelector<HTMLSelectElement>('.all select') ?? undefined, 'm');
    await submit();
    expect(dialogRef.close).toHaveBeenCalledWith([
      { variantId: 'v-rojo', optionId: 'talla', valueId: 'm' },
      { variantId: 'v-azul', optionId: 'talla', valueId: 'm' },
    ]);
  });
});
