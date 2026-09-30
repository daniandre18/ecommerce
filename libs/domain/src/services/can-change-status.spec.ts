import { describe, expect, it } from 'vitest';
import { emptyVariant, loadedVariant } from '../testing/builders';
import { canChangeStatus } from './can-change-status';

const complete = loadedVariant('completa', { color: 'Rojo' });
const incomplete = emptyVariant('incompleta', { color: 'Amarillo' });

// T035 — FR-023a.
describe('canChangeStatus', () => {
  it('pasar a borrador siempre se permite, aunque haya variantes incompletas', () => {
    expect(canChangeStatus([incomplete], 'draft').ok).toBe(true);
  });

  it.each(['active', 'unlisted'] as const)('pasar a %s con todas las variantes completas se permite', (target) => {
    expect(canChangeStatus([complete], target).ok).toBe(true);
  });

  it.each(['active', 'unlisted'] as const)('pasar a %s con variantes incompletas se rechaza y dice cuáles', (target) => {
    expect(canChangeStatus([complete, incomplete], target)).toEqual({
      ok: false,
      error: { kind: 'incomplete-variants', variantIds: ['incompleta'] },
    });
  });

  it('las variantes archivadas no bloquean: están fuera de circulación', () => {
    expect(canChangeStatus([complete, { ...incomplete, archived: true }], 'active').ok).toBe(true);
  });

  it('sin ninguna variante en circulación no hay nada que ofrecer', () => {
    expect(canChangeStatus([{ ...complete, archived: true }], 'active')).toEqual({
      ok: false,
      error: { kind: 'no-variants' },
    });
  });
});
