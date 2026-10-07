import { describe, expect, it } from 'vitest';
import {
  createCategory,
  deleteCategory,
  emptyCategoryTree,
  moveCategory,
  renameCategory,
  setCategoryHidden,
  setCategorySlug,
  type CategoryTree,
} from '../entities/category-tree';
import { categoryId, type CategoryId } from '../value-objects/ids';
import { slug } from '../value-objects/slug';
import { depthOf, descendantsOf, effectiveVisibility } from './effective-visibility';

const id = (value: string): CategoryId => categoryId(value);

/**
 * Ropa
 * ├── Hombre
 * │   ├── Camisetas
 * │   └── Camisas
 * └── Mujer
 * Calzado
 */
function store(): CategoryTree {
  const specs: [string, string | null, string][] = [
    ['ropa', null, 'Ropa'],
    ['hombre', 'ropa', 'Hombre'],
    ['camisetas', 'hombre', 'Camisetas'],
    ['camisas', 'hombre', 'Camisas'],
    ['mujer', 'ropa', 'Mujer'],
    ['calzado', null, 'Calzado'],
  ];
  return specs.reduce(
    (t, [key, parent, name]) => createCategory(t, { id: id(key), parentId: parent === null ? null : id(parent), name }),
    emptyCategoryTree(),
  );
}

/** La visibilidad PROPIA de cada nodo, la única que se guarda. */
const ownHidden = (t: CategoryTree) => Object.fromEntries(Object.values(t.nodes).map((n) => [n.id, n.hidden]));
const effective = (t: CategoryTree, key: string) => effectiveVisibility(t).get(id(key));
const hide = (t: CategoryTree, key: string) => setCategoryHidden(t, id(key), true);
const show = (t: CategoryTree, key: string) => setCategoryHidden(t, id(key), false);

/** Los nodos del árbol que no son `except`, para comparar que una operación no los tocó. */
const others = (t: CategoryTree, except: string) => Object.values(t.nodes).filter((n) => n.id !== except);

// T045 — Historia 2: la visibilidad efectiva se deriva; nunca se escribe en los descendientes (FR-021a).
describe('visibilidad efectiva', () => {
  it('sin nada oculto, todo visible', () => {
    const visibility = effectiveVisibility(store());
    expect(visibility.size).toBe(6);
    expect([...visibility.values()].every((v) => v.visible)).toBe(true);
  });

  it('oculta por sí misma es hiddenBy "self"', () => {
    expect(effective(hide(store(), 'hombre'), 'hombre')).toEqual({ visible: false, hiddenBy: 'self' });
  });

  it('un hijo visible bajo un padre oculto es hiddenBy "ancestor", con el id de ese padre', () => {
    const t = hide(store(), 'hombre');
    expect(effective(t, 'camisetas')).toEqual({ visible: false, hiddenBy: 'ancestor', ancestorId: 'hombre' });
  });

  it('la rama completa: un nieto bajo un abuelo oculto también, con el id del abuelo', () => {
    const t = hide(store(), 'ropa');
    expect(effective(t, 'hombre')).toEqual({ visible: false, hiddenBy: 'ancestor', ancestorId: 'ropa' });
    expect(effective(t, 'camisetas')).toEqual({ visible: false, hiddenBy: 'ancestor', ancestorId: 'ropa' });
    expect(effective(t, 'calzado')).toEqual({ visible: true });
  });

  it('con dos ancestros ocultos, nombra al más cercano', () => {
    const t = hide(hide(store(), 'ropa'), 'hombre');
    expect(effective(t, 'camisetas')).toEqual({ visible: false, hiddenBy: 'ancestor', ancestorId: 'hombre' });
  });

  it('oculta por sí misma bajo un padre oculto sigue siendo "self": es su propia decisión', () => {
    const t = hide(hide(store(), 'camisas'), 'hombre');
    expect(effective(t, 'camisas')).toEqual({ visible: false, hiddenBy: 'self' });
  });

  // Lo que pidió el comercio (FR-021a): ocultar un padre y volver a mostrarlo devuelve a cada hija
  // la visibilidad que ella tenía, incluida la que ya estaba oculta por decisión propia.
  describe('ocultar un padre y volver a mostrarlo', () => {
    it('cada hija conserva la suya, también la que ya estaba oculta por decisión propia', () => {
      // Camisas se oculta por sí misma ANTES de ocultar a su padre.
      const start = hide(store(), 'camisas');
      expect(ownHidden(start)).toEqual({ ropa: false, hombre: false, camisetas: false, camisas: true, mujer: false, calzado: false });

      const hidden = hide(start, 'hombre');
      // Lo guardado: solo cambió Hombre. Ninguna hija recibió el valor del padre.
      expect(ownHidden(hidden)).toEqual({ ropa: false, hombre: true, camisetas: false, camisas: true, mujer: false, calzado: false });
      // Lo derivado: las dos ocultas de hecho, cada una por su motivo.
      expect(effective(hidden, 'camisetas')).toEqual({ visible: false, hiddenBy: 'ancestor', ancestorId: 'hombre' });
      expect(effective(hidden, 'camisas')).toEqual({ visible: false, hiddenBy: 'self' });

      const shown = show(hidden, 'hombre');
      // Cada hija vuelve a lo que ella tenía: Camisetas visible, Camisas oculta por sí misma.
      expect(ownHidden(shown)).toEqual(ownHidden(start));
      expect(effective(shown, 'camisetas')).toEqual({ visible: true });
      expect(effective(shown, 'camisas')).toEqual({ visible: false, hiddenBy: 'self' });
      expect(shown).toEqual(start);
    });

    it('igual con la rama de tres niveles: ocultar el abuelo no escribe nada en hijos ni nietos', () => {
      const start = hide(store(), 'camisas');
      const hidden = hide(start, 'ropa');
      expect(others(hidden, 'ropa')).toEqual(others(start, 'ropa'));
      expect(show(hidden, 'ropa')).toEqual(start);
    });

    it('ocultar y mostrar escribe solo el nodo pedido: los demás quedan idénticos', () => {
      const start = store();
      for (const key of Object.keys(start.nodes)) {
        expect(others(hide(start, key), key)).toEqual(others(start, key));
        expect(others(show(hide(start, key), key), key)).toEqual(others(start, key));
      }
    });
  });

  describe('mover no cambia la visibilidad propia de nadie', () => {
    it('una visible movida dentro de una oculta queda oculta de hecho, pero su propia sigue visible', () => {
      const start = hide(store(), 'mujer');
      const moved = moveCategory(start, id('camisetas'), id('mujer'), 0);
      expect(ownHidden(moved)).toEqual(ownHidden(start));
      expect(effective(moved, 'camisetas')).toEqual({ visible: false, hiddenBy: 'ancestor', ancestorId: 'mujer' });
    });

    it('una oculta por sí misma movida fuera de una rama oculta sigue oculta por sí misma', () => {
      const start = hide(hide(store(), 'camisas'), 'hombre');
      const moved = moveCategory(start, id('camisas'), id('mujer'), 0);
      expect(ownHidden(moved)).toEqual(ownHidden(start));
      expect(effective(moved, 'camisas')).toEqual({ visible: false, hiddenBy: 'self' });
    });

    it('mover una rama oculta no escribe nada en sus descendientes', () => {
      const start = hide(hide(store(), 'camisas'), 'hombre');
      const moved = moveCategory(start, id('hombre'), null, 0);
      expect(ownHidden(moved)).toEqual(ownHidden(start));
      expect(effective(moved, 'camisetas')).toEqual({ visible: false, hiddenBy: 'ancestor', ancestorId: 'hombre' });
    });
  });

  it('ninguna operación del árbol escribe la visibilidad de otro nodo', () => {
    // Un recorrido por todas las operaciones con una parte del árbol oculta: solo setCategoryHidden
    // cambia un `hidden`, y solo el del nodo que se le pide.
    let t = hide(hide(store(), 'camisas'), 'hombre');
    const steps: [string, (tree: CategoryTree) => CategoryTree][] = [
      ['crear', (tree) => createCategory(tree, { id: id('polos'), parentId: id('hombre'), name: 'Polos' })],
      ['renombrar', (tree) => renameCategory(tree, id('hombre'), 'Caballeros')],
      ['editar la URL', (tree) => setCategorySlug(tree, id('hombre'), slug('caballeros')).tree],
      ['mover con hijas', (tree) => moveCategory(tree, id('hombre'), null, 0)],
      ['mover de vuelta', (tree) => moveCategory(tree, id('hombre'), id('ropa'), 0)],
      ['reordenar', (tree) => moveCategory(tree, id('camisas'), id('hombre'), 0)],
      ['eliminar', (tree) => deleteCategory(tree, id('polos'))],
    ];
    for (const [label, step] of steps) {
      const before = ownHidden(t);
      t = step(t);
      const after = ownHidden(t);
      delete before['polos'];
      delete after['polos'];
      expect(after, label).toEqual(before);
    }
  });
});

describe('descendantsOf', () => {
  it('todas las subcategorías, de todos los niveles, sin incluirse', () => {
    expect(descendantsOf(store(), id('ropa')).sort()).toEqual(['camisas', 'camisetas', 'hombre', 'mujer']);
    expect(descendantsOf(store(), id('hombre')).sort()).toEqual(['camisas', 'camisetas']);
  });

  it('una hoja no tiene', () => {
    expect(descendantsOf(store(), id('camisetas'))).toEqual([]);
  });
});

describe('depthOf', () => {
  it('primer, segundo y tercer nivel', () => {
    expect([depthOf(store(), id('ropa')), depthOf(store(), id('hombre')), depthOf(store(), id('camisetas'))]).toEqual([1, 2, 3]);
  });
});
