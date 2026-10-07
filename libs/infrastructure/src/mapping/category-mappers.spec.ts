import { categoryId, createCategory, deleteCategory, emptyCategoryTree, InvalidSlugError, setCategoryHidden, setCategorySlug, slug } from '@ecommerce/domain';
import { describe, expect, it } from 'vitest';
import { categoryTreeFromDoc, categoryTreeToDoc } from './category-mappers';

const id = categoryId;

/** Ropa (oculta) > Hombre (visible) > Camisas (oculta por sí misma); Calzado, eliminada después. */
function tree() {
  let t = emptyCategoryTree();
  t = createCategory(t, { id: id('ropa'), parentId: null, name: 'Ropa' });
  t = createCategory(t, { id: id('hombre'), parentId: id('ropa'), name: 'Hombre' });
  t = createCategory(t, { id: id('camisas'), parentId: id('hombre'), name: 'Camisas' });
  t = createCategory(t, { id: id('calzado'), parentId: null, name: 'Calzado' });
  t = setCategorySlug(t, id('hombre'), slug('caballeros')).tree;
  t = setCategoryHidden(t, id('camisas'), true);
  t = setCategoryHidden(t, id('ropa'), true);
  return deleteCategory(t, id('calzado'));
}

// T054 — el árbol se guarda y se lee tal cual: la visibilidad de cada nodo es la PROPIA (FR-021a).
describe('mapeo del árbol de categorías', () => {
  it('ida y vuelta, igual', () => {
    expect(categoryTreeFromDoc(categoryTreeToDoc(tree()))).toEqual(tree());
  });

  it('cada nodo guarda solo su visibilidad propia: la de un padre oculto no aparece en sus hijas', () => {
    const nodes = categoryTreeToDoc(tree())['nodes'] as Record<string, { hidden: boolean }>;
    expect([nodes['ropa']?.hidden, nodes['hombre']?.hidden, nodes['camisas']?.hidden]).toEqual([true, false, true]);
  });

  it('un documento que no existe es el árbol vacío', () => {
    expect(categoryTreeFromDoc(undefined)).toEqual(emptyCategoryTree());
  });

  it('un nodo sin visibilidad guardada es visible', () => {
    const read = categoryTreeFromDoc({ nodes: { ropa: { name: 'Ropa', slug: 'ropa', parentId: null, position: 0 } } });
    expect(read.nodes[id('ropa')]).toEqual({ id: 'ropa', name: 'Ropa', slug: 'ropa', parentId: null, position: 0, hidden: false });
    expect(read.pendingPrune).toEqual([]);
  });

  // T110: las URL anteriores viven en `categorySlugs`, fuera del documento.
  it('el documento no guarda URL anteriores, y uno viejo que las traiga se lee sin ellas', () => {
    const nodes = categoryTreeToDoc(tree())['nodes'] as Record<string, Record<string, unknown>>;
    expect(Object.values(nodes).some((node) => 'previousSlugs' in node)).toBe(false);
    const old = categoryTreeFromDoc({ nodes: { ropa: { name: 'Ropa', slug: 'ropa', previousSlugs: ['prendas'], parentId: null, position: 0 } } });
    expect(old.nodes[id('ropa')]).not.toHaveProperty('previousSlugs');
  });

  it('una URL con otra forma no se acepta en silencio', () => {
    expect(() => categoryTreeFromDoc({ nodes: { ropa: { name: 'Ropa', slug: 'Ropa Hombre', parentId: null, position: 0 } } })).toThrow(InvalidSlugError);
  });
});
