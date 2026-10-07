import { emptySections, InvalidIdentifierError, productId } from '@ecommerce/domain';
import { describe, expect, it } from 'vitest';
import { sectionsFromDoc, sectionsToDoc } from './sections-mappers';

// T072 — `storefront/sections`: las dos listas, y nada más.
describe('mapeo de las secciones destacadas', () => {
  it('ida y vuelta, igual y en el mismo orden', () => {
    const sections = { featured: [productId('b'), productId('a')], offers: [productId('a')] };
    expect(sectionsFromDoc(sectionsToDoc(sections))).toEqual(sections);
  });

  it('un documento que no existe son las dos vacías', () => {
    expect(sectionsFromDoc(undefined)).toEqual(emptySections());
  });

  it('una lista ausente se lee vacía', () => {
    expect(sectionsFromDoc({ featured: ['a'] })).toEqual({ featured: ['a'], offers: [] });
  });

  it('un id con otra forma no se acepta en silencio', () => {
    expect(() => sectionsFromDoc({ featured: ['a/b'], offers: [] })).toThrow(InvalidIdentifierError);
  });
});
