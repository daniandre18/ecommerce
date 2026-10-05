import { describe, expect, it } from 'vitest';
import { productId } from './ids';
import { fallbackSlug, InvalidSlugError, MAX_SLUG_LENGTH, nextSlugCandidate, slug, slugify, suffixedSlug } from './slug';

const FORM = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// T020 — FR-006 y FR-007: la URL amigable se genera del nombre, y la que escribe el comercio se
// normaliza con las mismas reglas.
describe('slugify', () => {
  it.each([
    ['Camiseta Básica Algodón', 'camiseta-basica-algodon'],
    ['Té Verde Orgánico', 'te-verde-organico'],
    ['Ñandú de peluche', 'nandu-de-peluche'],
    ['  Hola   Mundo!  ', 'hola-mundo'],
    ['Café & Té — 2×1', 'cafe-te-2-1'],
    ['camiseta-basica', 'camiseta-basica'],
    ['A__B..C', 'a-b-c'],
  ])('%j → %j', (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });

  it.each(['★★★', '   ', '', '¡¿?!', '—'])('un nombre sin letras ni números (%j) no produce ninguna', (name) => {
    expect(slugify(name)).toBeNull();
  });

  it(`corta en ${MAX_SLUG_LENGTH} caracteres`, () => {
    const result = slugify(`${'palabra '.repeat(30)}fin`);
    expect(result?.length).toBe(MAX_SLUG_LENGTH);
    expect(result).toMatch(FORM);
  });

  // El corte cae justo sobre el guion entre dos palabras: 99 letras, guion en la posición 100.
  it('si el corte cae sobre un guion, no lo deja al final', () => {
    expect(slugify(`${'a'.repeat(99)} bbb`)).toBe('a'.repeat(99));
  });

  it('lo que devuelve siempre tiene la forma de una URL amigable', () => {
    for (const name of ['Camiseta', 'X', 'Ñ 9 ü', 'a-b-', '-a', 'Precio $ 52.000']) {
      expect(slugify(name)).toMatch(FORM);
    }
  });
});

describe('slug', () => {
  it.each(['camiseta', 'camiseta-basica-algodon', 'a', 'x1-2-3', 'a'.repeat(100)])('acepta %j', (value) => {
    expect(slug(value)).toBe(value);
  });

  it.each([
    ['mayúsculas', 'Camiseta'],
    ['acentos', 'café'],
    ['espacios', 'camiseta basica'],
    ['guion doble', 'a--b'],
    ['guion al principio', '-a'],
    ['guion al final', 'a-'],
    ['barra', 'a/b'],
    ['vacía', ''],
    ['más de 100 caracteres', 'a'.repeat(101)],
  ])('rechaza una URL con %s', (_label, value) => {
    expect(() => slug(value)).toThrow(InvalidSlugError);
  });
});

// FR-006: ante una coincidencia, el menor sufijo numérico libre.
describe('nextSlugCandidate', () => {
  it('el primer intento es la base tal cual', () => {
    expect(nextSlugCandidate(slug('camiseta'), 1)).toBe('camiseta');
  });

  it('los siguientes llevan sufijo: -2, -3…', () => {
    expect(nextSlugCandidate(slug('camiseta'), 2)).toBe('camiseta-2');
    expect(nextSlugCandidate(slug('camiseta'), 17)).toBe('camiseta-17');
  });

  it('con una base de 100 caracteres, recorta la base para que el sufijo entre', () => {
    const candidate = nextSlugCandidate(slug('a'.repeat(100)), 2);
    expect(candidate.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(candidate.endsWith('-2')).toBe(true);
    expect(candidate).toMatch(FORM);
  });

  // Para el sufijo "-2" la base se recorta a 98: el carácter 98 es el guion entre las palabras.
  it('recorta sin dejar un guion pegado al sufijo', () => {
    const base = slug(`${'a'.repeat(97)}-bb`);
    expect(nextSlugCandidate(base, 2)).toBe(`${'a'.repeat(97)}-2`);
  });
});

// Después de 20 intentos, CreateProduct usa un sufijo aleatorio (research §5 de la 002).
describe('suffixedSlug', () => {
  it('pega el sufijo normalizado, recortando la base para que entre', () => {
    expect(suffixedSlug(slug('camiseta'), 'Ab3_Z')).toBe('camiseta-ab3-z');
    const long = suffixedSlug(slug('a'.repeat(100)), 'xyz12345');
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(long.endsWith('-xyz12345')).toBe(true);
  });
});

// FR-006: la de respaldo de un nombre que no produce ninguna.
describe('fallbackSlug', () => {
  it('se deriva del id del producto y tiene la forma de una URL amigable', () => {
    expect(fallbackSlug(productId('Qm9c8Zk1xYz'))).toBe('producto-qm9c8zk1');
  });

  it('cualquier id produce una válida', () => {
    for (const id of ['abc', 'A_B-C', '123e4567-e89b-12d3-a456-426614174000']) {
      expect(fallbackSlug(productId(id))).toMatch(FORM);
    }
  });
});
