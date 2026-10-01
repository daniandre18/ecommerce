import { optionId, valueId, type VariationOption } from '@ecommerce/domain';
import { combinationCount, draftFrom, draftProblem, sameDraft, toVariationOptions, type DraftOption } from './option-draft';

const stored: VariationOption[] = [
  { id: optionId('talla'), name: 'Talla', position: 1, values: [{ id: valueId('m'), label: 'M', position: 1 }, { id: valueId('s'), label: 'S', position: 0 }] },
  { id: optionId('color'), name: 'Color', position: 0, values: [{ id: valueId('rojo'), label: 'Rojo', position: 0 }] },
];

let ids = 0;
const draftOption = (name: string, labels: string[]): DraftOption => ({
  id: `o${++ids}`,
  name,
  values: labels.map((label) => ({ id: `v${++ids}`, label })),
});

describe('borrador de opciones', () => {
  it('se arma en el orden en que se muestran', () => {
    expect(draftFrom(stored).options.map((o) => [o.name, o.values.map((v) => v.label)])).toEqual([
      ['Color', ['Rojo']],
      ['Talla', ['S', 'M']],
    ]);
  });

  it('vuelve a la estructura del dominio con la posición de la lista y los textos sin espacios al borde', () => {
    const talla = draftOption(' Talla ', ['M ', 'S']);
    expect(toVariationOptions({ options: [talla] })).toEqual([
      {
        id: talla.id,
        name: 'Talla',
        position: 0,
        values: [
          { id: talla.values[0]?.id, label: 'M', position: 0 },
          { id: talla.values[1]?.id, label: 'S', position: 1 },
        ],
      },
    ]);
  });

  it('reordenar es un cambio', () => {
    const original = draftFrom(stored);
    const swapped = { options: [...original.options].reverse() };
    expect(sameDraft(original, draftFrom(stored))).toBe(true);
    expect(sameDraft(original, swapped)).toBe(false);
  });

  // Las reglas son las del dominio: el panel avisa lo mismo que el servidor rechazaría.
  it.each([
    [[draftOption('Color', ['Rojo', 'rojo'])], 'La opción «Color» repite el valor «rojo»'],
    [[draftOption('Color', ['Rojo']), draftOption('color', ['Azul'])], 'Hay dos opciones llamadas «color»'],
    [[draftOption('', ['Rojo'])], 'Cada opción necesita un nombre'],
    [[draftOption('Color', [''])], 'La opción «Color» tiene un valor vacío'],
    [[draftOption('Color', [])], 'La opción «Color» necesita al menos un valor'],
  ])('avisa el problema de estructura %#', (options, message) => {
    expect(draftProblem(toVariationOptions({ options }))).toBe(message);
  });

  it('avisa cuántas combinaciones produciría, antes de enviar nada (FR-025)', () => {
    const labels = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
    const options = toVariationOptions({ options: [draftOption('A', labels(11)), draftOption('B', labels(10))] });
    expect(combinationCount(options)).toBe(110);
    expect(draftProblem(options)).toBe('Estas opciones producirían 110 combinaciones; el máximo es 100');
  });

  it('una estructura válida no tiene problemas', () => {
    expect(draftProblem(toVariationOptions(draftFrom(stored)))).toBeUndefined();
  });
});
