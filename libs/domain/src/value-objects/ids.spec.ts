import { describe, expect, it } from 'vitest';
import { InvalidIdentifierError, productId, tenantId, uid } from './ids';

// Los identificadores forman rutas de almacenamiento a partir de datos que manda el cliente
// (el tenantId llega en la carga útil, FR-003). Un identificador es un único segmento.
describe('identificadores', () => {
  it.each(['t1', 'abc-123', 'x_y', 'Qm9c8Zk1'])('acepta %j', (value) => {
    expect(tenantId(value)).toBe(value);
  });

  it.each([
    ['vacío', ''],
    ['con barra', 't1/products'],
    ['que intenta salir por la ruta', 't2/members/intruso'],
    ['punto', '.'],
    ['doble punto', '..'],
    ['con espacios al borde', ' t1'],
  ])('rechaza un identificador %s (%j)', (_label, value) => {
    expect(() => tenantId(value)).toThrow(InvalidIdentifierError);
  });

  it('aplica la misma regla a todos los tipos de identificador', () => {
    expect(() => productId('p/1')).toThrow(InvalidIdentifierError);
    expect(() => uid('')).toThrow(InvalidIdentifierError);
  });

  it('no altera el valor: la identidad es exacta', () => {
    expect(productId('P-1')).toBe('P-1');
  });
});
