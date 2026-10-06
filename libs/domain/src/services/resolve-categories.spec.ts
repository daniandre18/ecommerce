import { describe, expect, it } from 'vitest';
import { createCategory, deleteCategory, emptyCategoryTree } from '../entities/category-tree';
import { categoryId } from '../value-objects/ids';
import { resolveCategories } from './resolve-categories';

const tree = () =>
  ['ropa', 'calzado', 'verano'].reduce((t, key) => createCategory(t, { id: categoryId(key), parentId: null, name: key }), emptyCategoryTree());

// T048 — Historia 2: un id que ya no está en el árbol se ignora al leer (research §2).
describe('resolveCategories', () => {
  it('conserva las vigentes, en el orden del producto', () => {
    expect(resolveCategories(tree(), [categoryId('verano'), categoryId('ropa')])).toEqual(['verano', 'ropa']);
  });

  it('ignora un id colgante: el producto se lee sin él', () => {
    const t = deleteCategory(tree(), categoryId('calzado'));
    expect(resolveCategories(t, [categoryId('ropa'), categoryId('calzado'), categoryId('verano')])).toEqual(['ropa', 'verano']);
  });

  it('ignora un id que nunca existió', () => {
    expect(resolveCategories(tree(), [categoryId('nada')])).toEqual([]);
  });

  it('sin repetir', () => {
    expect(resolveCategories(tree(), [categoryId('ropa'), categoryId('ropa')])).toEqual(['ropa']);
  });
});
