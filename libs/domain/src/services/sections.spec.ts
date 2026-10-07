import { describe, expect, it } from 'vitest';
import { productId, type ProductId } from '../value-objects/ids';
import { addToSection, MAX_SECTION_PRODUCTS, removeFromSection, SECTION_IDS, SectionFullError, withoutProduct } from './sections';

const ids = (prefix: string, n: number, from = 0): ProductId[] => Array.from({ length: n }, (_, i) => productId(`${prefix}${from + i}`));
const full = (n: number) => Object.freeze(ids('p', n));

/** El error con que falla, o `undefined`. */
function rejection(run: () => unknown): SectionFullError | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    if (error instanceof SectionFullError) return error;
    throw error;
  }
}

// T063 — Historia 3: el tope de las secciones destacadas (FR-027a, FR-027b), como función pura.
describe('secciones destacadas', () => {
  it('son exactamente dos, fijadas por la plataforma (FR-027)', () => {
    expect(SECTION_IDS).toEqual(['featured', 'offers']);
    expect(MAX_SECTION_PRODUCTS).toBe(40);
  });

  describe('addToSection', () => {
    it('agrega al final, en el orden en que llegan', () => {
      expect(addToSection(full(2), [productId('x'), productId('y')])).toEqual(['p0', 'p1', 'x', 'y']);
    });

    it('con 39, entra uno más y queda en 40', () => {
      expect(addToSection(full(39), [productId('x')])).toHaveLength(40);
    });

    it('con 40, el 41 se rechaza: no quedan lugares', () => {
      expect(rejection(() => addToSection(full(40), [productId('x')]))?.remaining).toBe(0);
    });

    it('con 35, agregar 8 se rechaza entero e informa que quedan 5 (FR-027b)', () => {
      const error = rejection(() => addToSection(full(35), ids('n', 8)));
      expect(error).toBeInstanceOf(SectionFullError);
      expect([error?.remaining, error?.requested]).toEqual([5, 8]);
    });

    it('requested son los lugares que harían falta: los que ya estaban y los repetidos no cuentan', () => {
      const error = rejection(() => addToSection(full(38), [productId('p0'), productId('n0'), productId('n0'), productId('n1'), productId('n2')]));
      expect([error?.remaining, error?.requested]).toEqual([2, 3]);
    });

    it('sin lugar para todos no cambia nada: la lista que recibe queda igual', () => {
      const list = full(35);
      expect(() => addToSection(list, ids('n', 8))).toThrow(SectionFullError);
      expect(list).toEqual(ids('p', 35));
    });

    it('los que ya estaban no cuentan dos veces: con 35, ocho donde tres ya están entran justo', () => {
      const result = addToSection(full(35), [...ids('p', 3, 30), ...ids('n', 5)]);
      expect(result).toHaveLength(40);
      expect(result.slice(35)).toEqual(ids('n', 5));
    });

    it('repetidos en lo pedido cuentan una vez', () => {
      expect(addToSection(full(39), [productId('x'), productId('x')])).toHaveLength(40);
    });

    it('si todos ya estaban, no cambia nada aunque la sección esté completa', () => {
      expect(addToSection(full(40), [productId('p3')])).toEqual(ids('p', 40));
    });

    it('nunca devuelve más de 40', () => {
      for (let have = 0; have <= 40; have++) {
        for (let add = 1; add <= 3; add++) {
          try {
            expect(addToSection(full(have), ids('n', add)).length).toBeLessThanOrEqual(MAX_SECTION_PRODUCTS);
          } catch (error) {
            expect(error).toBeInstanceOf(SectionFullError);
            expect((error as SectionFullError).remaining).toBe(MAX_SECTION_PRODUCTS - have);
          }
        }
      }
    });
  });

  describe('removeFromSection', () => {
    it('saca los que están y conserva el orden del resto', () => {
      expect(removeFromSection(full(4), [productId('p1'), productId('p3')])).toEqual(['p0', 'p2']);
    });

    it('quitar uno que no está no hace nada', () => {
      expect(removeFromSection(full(3), [productId('x')])).toEqual(ids('p', 3));
    });
  });

  describe('withoutProduct (archivar, FR-028)', () => {
    it('lo saca de las dos secciones', () => {
      const sections = { featured: [productId('a'), productId('b')], offers: [productId('b'), productId('c')] };
      expect(withoutProduct(sections, productId('b'))).toEqual({ featured: ['a'], offers: ['c'] });
    });

    it('si no está en ninguna, devuelve las mismas secciones: no hay nada que escribir', () => {
      const sections = { featured: [productId('a')], offers: [] };
      expect(withoutProduct(sections, productId('z'))).toBe(sections);
    });
  });
});
