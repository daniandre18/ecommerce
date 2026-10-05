import { describe, expect, it } from 'vitest';
import { adjustVocabulary, canonicalTerm, emptyVocabulary, normalizeTags, suggestTerms, TagLimitError } from './vocabulary';

// T022 — FR-011 y FR-012: etiquetas y marcas se comparan sin mayúsculas ni acentos.
describe('normalizeTags', () => {
  it('"Verano" y "verano" son la misma etiqueta y no se repiten', () => {
    expect(normalizeTags(['Verano', 'verano', ' VERANO '])).toEqual({ tags: ['Verano'], normalized: ['verano'] });
  });

  it('"Algodón" y "algodon" también', () => {
    expect(normalizeTags(['Algodón', 'algodon'])).toEqual({ tags: ['Algodón'], normalized: ['algodon'] });
  });

  it('descarta las vacías y quita los espacios al borde', () => {
    expect(normalizeTags(['  Playa ', '', '   '])).toEqual({ tags: ['Playa'], normalized: ['playa'] });
  });

  it('admite hasta 30 etiquetas', () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(normalizeTags(thirty).tags).toHaveLength(30);
    expect(() => normalizeTags([...thirty, 'una-mas'])).toThrow(TagLimitError);
  });

  it('las repetidas no cuentan para el tope', () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `t${i}`);
    expect(normalizeTags([...thirty, 'T0', 't1']).tags).toHaveLength(30);
  });

  it('cada una admite hasta 40 caracteres', () => {
    expect(normalizeTags(['a'.repeat(40)]).tags).toHaveLength(1);
    expect(() => normalizeTags(['a'.repeat(41)])).toThrow(TagLimitError);
  });
});

describe('vocabulario del comercio', () => {
  const term = (label: string) => ({ label, normalized: label.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '') });

  it('suma los términos nuevos con su conteo', () => {
    const vocabulary = adjustVocabulary(emptyVocabulary(), 'tags', [], [term('Verano'), term('Playa')]);
    expect(vocabulary.tags).toEqual({ verano: { label: 'Verano', count: 1 }, playa: { label: 'Playa', count: 1 } });
  });

  it('conserva la primera forma registrada aunque llegue otra', () => {
    let vocabulary = adjustVocabulary(emptyVocabulary(), 'tags', [], [term('Algodón')]);
    vocabulary = adjustVocabulary(vocabulary, 'tags', [], [{ label: 'algodon', normalized: 'algodon' }]);
    expect(vocabulary.tags['algodon']).toEqual({ label: 'Algodón', count: 2 });
  });

  it('resta los que se quitan y poda el término al llegar a cero', () => {
    let vocabulary = adjustVocabulary(emptyVocabulary(), 'brands', [], [term('Nike')]);
    vocabulary = adjustVocabulary(vocabulary, 'brands', [], [term('Nike')]);
    vocabulary = adjustVocabulary(vocabulary, 'brands', [term('Nike')], []);
    expect(vocabulary.brands['nike']).toEqual({ label: 'Nike', count: 1 });
    vocabulary = adjustVocabulary(vocabulary, 'brands', [term('Nike')], []);
    expect(vocabulary.brands).toEqual({});
  });

  it('un término que sigue igual no cambia el conteo', () => {
    let vocabulary = adjustVocabulary(emptyVocabulary(), 'tags', [], [term('Verano')]);
    vocabulary = adjustVocabulary(vocabulary, 'tags', [term('Verano')], [term('Verano'), term('Playa')]);
    expect(vocabulary.tags['verano']).toEqual({ label: 'Verano', count: 1 });
  });

  it('las marcas y las etiquetas son vocabularios separados', () => {
    const vocabulary = adjustVocabulary(emptyVocabulary(), 'brands', [], [term('Verano')]);
    expect(vocabulary.tags).toEqual({});
  });

  it('canonicalTerm devuelve la forma ya registrada, o la escrita si es nueva', () => {
    const vocabulary = adjustVocabulary(emptyVocabulary(), 'brands', [], [term('Nike')]);
    expect(canonicalTerm(vocabulary.brands, 'NIKE')).toEqual({ label: 'Nike', normalized: 'nike' });
    expect(canonicalTerm(vocabulary.brands, 'Adidas ')).toEqual({ label: 'Adidas', normalized: 'adidas' });
  });

  it('suggestTerms sugiere por prefijo, sin acentos, los más usados primero', () => {
    let vocabulary = adjustVocabulary(emptyVocabulary(), 'brands', [], [term('Nike'), term('Nivea'), term('Adidas')]);
    vocabulary = adjustVocabulary(vocabulary, 'brands', [], [term('Nivea')]);
    expect(suggestTerms(vocabulary.brands, 'ni')).toEqual(['Nivea', 'Nike']);
    expect(suggestTerms(vocabulary.brands, 'NÍ', 1)).toEqual(['Nivea']);
    expect(suggestTerms(vocabulary.brands, '')).toEqual([]);
  });
});
