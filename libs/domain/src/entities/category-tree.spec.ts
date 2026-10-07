import { describe, expect, it } from 'vitest';
import { categoryId, type CategoryId } from '../value-objects/ids';
import { slug } from '../value-objects/slug';
import {
  CategoryHasChildrenError,
  CategoryNameTakenError,
  CategoryNotFoundError,
  CategorySlugTakenError,
  childrenOf,
  completePrune,
  createCategory,
  deleteCategory,
  emptyCategoryTree,
  firstFreeCategorySlug,
  InvalidCategoryNameError,
  MAX_CATEGORIES,
  MAX_CATEGORY_DEPTH,
  MAX_CATEGORY_NAME_LENGTH,
  moveCategory,
  renameCategory,
  setCategoryHidden,
  setCategorySlug,
  type CategoryTree,
} from './category-tree';

const id = (value: string): CategoryId => categoryId(value);

/** Crea varias en orden: `[id, padre, nombre]`. */
function tree(...specs: [string, string | null, string][]): CategoryTree {
  return specs.reduce(
    (current, [key, parent, name]) => createCategory(current, { id: id(key), parentId: parent === null ? null : id(parent), name }),
    emptyCategoryTree(),
  );
}

/** Ropa > Hombre > Camisetas, Ropa > Mujer, Calzado. */
const store = () =>
  tree(['ropa', null, 'Ropa'], ['hombre', 'ropa', 'Hombre'], ['camisetas', 'hombre', 'Camisetas'], ['mujer', 'ropa', 'Mujer'], ['calzado', null, 'Calzado']);

const node = (t: CategoryTree, key: string) => {
  const found = t.nodes[id(key)];
  if (!found) throw new Error(`No existe ${key}`);
  return found;
};
const names = (t: CategoryTree, parent: string | null) => childrenOf(t, parent === null ? null : id(parent)).map((n) => n.name);

/** Congela todo el árbol: si una operación lo modificara en lugar de devolver uno nuevo, lanzaría. */
function frozen(t: CategoryTree): CategoryTree {
  for (const n of Object.values(t.nodes)) {
    Object.freeze(n);
  }
  Object.freeze(t.nodes);
  Object.freeze(t.pendingPrune);
  return Object.freeze(t);
}

// T044 — Historia 2: las operaciones del árbol de categorías (FR-019 a FR-021, FR-024).
describe('árbol de categorías', () => {
  describe('crear (FR-019, FR-021)', () => {
    it('una de primer nivel y otra anidada; cada una al final de sus hermanas', () => {
      const t = store();
      expect(node(t, 'hombre')).toEqual({
        id: 'hombre',
        name: 'Hombre',
        slug: 'hombre',
        parentId: 'ropa',
        position: 0,
        hidden: false,
      });
      expect(names(t, null)).toEqual(['Ropa', 'Calzado']);
      expect(names(t, 'ropa')).toEqual(['Hombre', 'Mujer']);
    });

    it(`hasta ${MAX_CATEGORY_DEPTH} niveles: dentro del tercero se impide`, () => {
      expect(() => createCategory(store(), { id: id('x'), parentId: id('camisetas'), name: 'Manga corta' })).toThrow(
        expect.objectContaining({ name: 'CategoryLimitError', reason: 'depth' }),
      );
    });

    it('dentro de una que no existe se rechaza', () => {
      expect(() => createCategory(store(), { id: id('x'), parentId: id('nada'), name: 'X' })).toThrow(CategoryNotFoundError);
    });

    it('un id que ya existe se rechaza', () => {
      expect(() => createCategory(store(), { id: id('ropa'), parentId: null, name: 'Otra' })).toThrow();
    });

    it('el nombre se guarda sin espacios al borde; vacío o de más de 70 caracteres se rechaza', () => {
      expect(node(createCategory(store(), { id: id('x'), parentId: null, name: '  Hogar ' }), 'x').name).toBe('Hogar');
      expect(() => createCategory(store(), { id: id('x'), parentId: null, name: '   ' })).toThrow(InvalidCategoryNameError);
      expect(MAX_CATEGORY_NAME_LENGTH).toBe(70);
      expect(() => createCategory(store(), { id: id('x'), parentId: null, name: 'a'.repeat(70) })).not.toThrow();
      expect(() => createCategory(store(), { id: id('x'), parentId: null, name: 'a'.repeat(71) })).toThrow(InvalidCategoryNameError);
    });

    it(`tope de ${MAX_CATEGORIES} categorías por comercio`, () => {
      expect(MAX_CATEGORIES).toBe(1000);
      let t = emptyCategoryTree();
      for (let i = 0; i < MAX_CATEGORIES; i++) t = createCategory(t, { id: id(`c${i}`), parentId: null, name: `Categoría ${i}` });
      expect(Object.keys(t.nodes)).toHaveLength(MAX_CATEGORIES);
      expect(() => createCategory(t, { id: id('una-mas'), parentId: null, name: 'Una más' })).toThrow(
        expect.objectContaining({ name: 'CategoryLimitError', reason: 'count' }),
      );
    });
  });

  describe('nombres únicos entre hermanas (FR-020)', () => {
    it('"hombre" junto a "Hombre" se rechaza, comparado sin mayúsculas ni acentos', () => {
      for (const name of ['hombre', ' HOMBRE ', 'Hómbre']) {
        expect(() => createCategory(store(), { id: id('x'), parentId: id('ropa'), name })).toThrow(CategoryNameTakenError);
      }
    });

    it('"Hombre" sí se permite bajo otro padre', () => {
      const t = createCategory(store(), { id: id('x'), parentId: id('calzado'), name: 'Hombre' });
      expect(names(t, 'calzado')).toEqual(['Hombre']);
    });

    it('en el primer nivel también', () => {
      expect(() => createCategory(store(), { id: id('x'), parentId: null, name: 'ropa' })).toThrow(CategoryNameTakenError);
    });

    it('renombrar a la de una hermana se rechaza; a la misma con otras mayúsculas, no', () => {
      expect(() => renameCategory(store(), id('mujer'), 'HOMBRE')).toThrow(CategoryNameTakenError);
      expect(node(renameCategory(store(), id('hombre'), 'HOMBRE'), 'hombre').name).toBe('HOMBRE');
    });
  });

  describe('URL plana, única en todo el árbol (FR-021)', () => {
    it('"Camisas" en Hombre y en Mujer recibe camisas y camisas-2', () => {
      let t = createCategory(store(), { id: id('c1'), parentId: id('hombre'), name: 'Camisas' });
      t = createCategory(t, { id: id('c2'), parentId: id('mujer'), name: 'Camisas' });
      expect([node(t, 'c1').slug, node(t, 'c2').slug]).toEqual(['camisas', 'camisas-2']);
    });

    it('la vista previa del panel da la misma URL que recibirá al crearla', () => {
      const t = createCategory(store(), { id: id('c1'), parentId: id('hombre'), name: 'Camisas' });
      expect(firstFreeCategorySlug(t, 'Camisas')).toBe('camisas-2');
      expect(firstFreeCategorySlug(t, '★★★')).toBe('categoria');
    });

    it('una URL escrita a mano se respeta si está libre, y se rechaza si la usa otra', () => {
      const t = createCategory(store(), { id: id('c1'), parentId: id('mujer'), name: 'Camisas', slug: slug('camisas-mujer') });
      expect(node(t, 'c1').slug).toBe('camisas-mujer');
      expect(() => createCategory(store(), { id: id('c1'), parentId: id('mujer'), name: 'Camisas', slug: slug('hombre') })).toThrow(
        CategorySlugTakenError,
      );
    });

    // T110: las URL anteriores viven fuera del árbol (`categorySlugs`); el dominio recibe quién tiene
    // reservada una, y una reserva solo cuenta si su categoría todavía existe.
    it('una URL reservada por otra categoría que existe no se puede tomar, ni al crear ni al cambiarla', () => {
      expect(() => createCategory(store(), { id: id('x'), parentId: null, name: 'X', slug: slug('caballeros') }, id('hombre'))).toThrow(
        CategorySlugTakenError,
      );
      expect(() => setCategorySlug(store(), id('mujer'), slug('caballeros'), id('hombre'))).toThrow(CategorySlugTakenError);
    });

    it('la reservada por una categoría eliminada está libre', () => {
      expect(node(createCategory(store(), { id: id('x'), parentId: null, name: 'X', slug: slug('viejas') }, id('borrada')), 'x').slug).toBe('viejas');
      expect(setCategorySlug(store(), id('mujer'), slug('viejas'), id('borrada')).release).toBe('viejas');
    });

    it('la vista previa salta las reservadas por otra que existe, como la creación', () => {
      const reserved = new Set(['hombre-2']);
      expect(firstFreeCategorySlug(store(), 'Hombre', (value) => reserved.has(value))).toBe('hombre-3');
    });

    it('un nombre sin letras ni números recibe "categoria" con su sufijo', () => {
      let t = createCategory(store(), { id: id('x'), parentId: null, name: '★★★' });
      t = createCategory(t, { id: id('y'), parentId: null, name: '!!!' });
      expect([node(t, 'x').slug, node(t, 'y').slug]).toEqual(['categoria', 'categoria-2']);
    });

    it('renombrar no cambia la URL', () => {
      const t = renameCategory(store(), id('hombre'), 'Caballeros');
      expect(node(t, 'hombre')).toEqual(expect.objectContaining({ name: 'Caballeros', slug: 'hombre' }));
    });

    it('cambiarla deja la anterior para reservar, fuera del árbol: el nodo solo tiene la vigente', () => {
      const change = setCategorySlug(store(), id('hombre'), slug('caballeros'));
      expect(change).toEqual(expect.objectContaining({ reserve: 'hombre', release: null }));
      expect(node(change.tree, 'hombre')).toEqual(expect.not.objectContaining({ previousSlugs: expect.anything() }));
      expect(node(change.tree, 'hombre').slug).toBe('caballeros');
    });

    it('cambiarla 200 veces no agranda el árbol', () => {
      let t = store();
      const size = JSON.stringify(t).length;
      for (let i = 0; i < 200; i++) t = setCategorySlug(t, id('hombre'), slug(`url-${String(i).padStart(3, '0')}`)).tree;
      t = setCategorySlug(t, id('hombre'), slug('hombre'), id('hombre')).tree;
      expect(JSON.stringify(t).length).toBe(size);
    });

    it('volver a una anterior propia la recupera: deja de estar reservada, y la vigente pasa a reservarse', () => {
      const change = setCategorySlug(store(), id('hombre'), slug('caballeros'), id('hombre'));
      expect(change).toEqual(expect.objectContaining({ reserve: 'hombre', release: 'caballeros' }));
      expect(node(change.tree, 'hombre').slug).toBe('caballeros');
    });

    it('poner la misma que ya tiene no cambia nada', () => {
      const before = store();
      expect(setCategorySlug(before, id('hombre'), slug('hombre'))).toEqual({ tree: before, reserve: null, release: null });
    });

    it('la URL de otra vigente se rechaza', () => {
      expect(() => setCategorySlug(store(), id('mujer'), slug('hombre'))).toThrow(CategorySlugTakenError);
    });
  });

  describe('mover y reordenar (FR-019)', () => {
    it('mover arrastra a sus hijas y no cambia su URL', () => {
      const t = moveCategory(store(), id('hombre'), id('calzado'), 0);
      expect(node(t, 'hombre')).toEqual(expect.objectContaining({ parentId: 'calzado', slug: 'hombre' }));
      expect(node(t, 'camisetas').parentId).toBe('hombre');
      expect(names(t, 'ropa')).toEqual(['Mujer']);
    });

    it('dentro de sí misma o de una de sus propias subcategorías se impide', () => {
      for (const target of ['ropa', 'hombre', 'camisetas']) {
        expect(() => moveCategory(store(), id('ropa'), id(target), 0)).toThrow(expect.objectContaining({ name: 'CategoryLimitError', reason: 'cycle' }));
      }
    });

    it('un movimiento que arrastra hijas y las dejaría a más de 3 niveles se impide', () => {
      // Hombre (con Camisetas) dentro de Mujer: Ropa > Mujer > Hombre > Camisetas serían 4.
      expect(() => moveCategory(store(), id('hombre'), id('mujer'), 0)).toThrow(expect.objectContaining({ name: 'CategoryLimitError', reason: 'depth' }));
      // Una hoja sí entra en el tercer nivel.
      expect(() => moveCategory(store(), id('calzado'), id('mujer'), 0)).not.toThrow();
      // Y en el cuarto no.
      expect(() => moveCategory(store(), id('calzado'), id('camisetas'), 0)).toThrow(expect.objectContaining({ reason: 'depth' }));
    });

    it('al primer nivel', () => {
      const t = moveCategory(store(), id('camisetas'), null, 1);
      expect(names(t, null)).toEqual(['Ropa', 'Camisetas', 'Calzado']);
    });

    it('con el mismo padre, solo reordena', () => {
      const t = moveCategory(store(), id('mujer'), id('ropa'), 0);
      expect(names(t, 'ropa')).toEqual(['Mujer', 'Hombre']);
      expect(node(t, 'mujer').parentId).toBe('ropa');
    });

    it('la posición se recorta al final si es mayor que la cantidad de hermanas', () => {
      const t = moveCategory(store(), id('ropa'), null, 99);
      expect(names(t, null)).toEqual(['Calzado', 'Ropa']);
    });

    it('a un lugar donde ya hay una hermana con el mismo nombre se impide', () => {
      const t = createCategory(store(), { id: id('h2'), parentId: id('calzado'), name: 'hombre' });
      expect(() => moveCategory(t, id('h2'), id('ropa'), 0)).toThrow(CategoryNameTakenError);
    });

    it('a un padre que no existe, o una que no existe, se rechaza', () => {
      expect(() => moveCategory(store(), id('hombre'), id('nada'), 0)).toThrow(CategoryNotFoundError);
      expect(() => moveCategory(store(), id('nada'), null, 0)).toThrow(CategoryNotFoundError);
    });
  });

  describe('eliminar y podar (FR-024)', () => {
    it('con subcategorías se impide', () => {
      expect(() => deleteCategory(store(), id('hombre'))).toThrow(CategoryHasChildrenError);
    });

    it('sin subcategorías, sale del árbol y su id queda pendiente de podar de los productos', () => {
      const t = deleteCategory(store(), id('camisetas'));
      expect(t.nodes[id('camisetas')]).toBeUndefined();
      expect(t.pendingPrune).toEqual(['camisetas']);
      expect(names(t, 'hombre')).toEqual([]);
    });

    it('su URL deja de estar ocupada', () => {
      const t = deleteCategory(store(), id('camisetas'));
      expect(firstFreeCategorySlug(t, 'Camisetas')).toBe('camisetas');
    });

    it('las pendientes se acumulan sin repetirse', () => {
      let t = deleteCategory(store(), id('camisetas'));
      t = deleteCategory(t, id('mujer'));
      expect(t.pendingPrune).toEqual(['camisetas', 'mujer']);
    });

    it('una que no existe se rechaza', () => {
      expect(() => deleteCategory(store(), id('nada'))).toThrow(CategoryNotFoundError);
    });

    it('completePrune quita de las pendientes las ya podadas, y solo esas', () => {
      let t = deleteCategory(store(), id('camisetas'));
      t = deleteCategory(t, id('mujer'));
      expect(completePrune(t, [id('camisetas')]).pendingPrune).toEqual(['mujer']);
      expect(completePrune(t, [id('camisetas'), id('mujer')]).pendingPrune).toEqual([]);
    });
  });

  it('ninguna operación modifica el árbol que recibe: devuelve uno nuevo', () => {
    const t = frozen(deleteCategory(store(), id('calzado')));
    expect(() => {
      createCategory(t, { id: id('x'), parentId: id('ropa'), name: 'Niños' });
      renameCategory(t, id('hombre'), 'Caballeros');
      setCategorySlug(t, id('hombre'), slug('caballeros'));
      moveCategory(t, id('mujer'), id('ropa'), 0);
      moveCategory(t, id('camisetas'), null, 0);
      setCategoryHidden(t, id('ropa'), true);
      deleteCategory(t, id('camisetas'));
      completePrune(t, [id('calzado')]);
    }).not.toThrow();
  });
});
