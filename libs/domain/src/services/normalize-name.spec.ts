import { describe, expect, it } from 'vitest';
import { normalizeName } from './normalize-name';

// Búsqueda por prefijo en el panel (research §7): quien escribe "cafe" encuentra "Café".
describe('normalizeName', () => {
  it('pasa a minúsculas', () => {
    expect(normalizeName('Camiseta Roja')).toBe('camiseta roja');
  });

  it('quita acentos y diacríticos', () => {
    expect(normalizeName('Café Ñandú Pingüino')).toBe('cafe nandu pinguino');
  });

  it('quita espacios al borde y colapsa los internos', () => {
    expect(normalizeName('  Camiseta    Roja  ')).toBe('camiseta roja');
  });

  it('da lo mismo con las formas compuesta y descompuesta de un acento', () => {
    expect(normalizeName('Caf\u00e9')).toBe(normalizeName('Cafe\u0301'));
  });
});
