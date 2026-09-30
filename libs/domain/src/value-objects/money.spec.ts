import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, money, sameCurrency } from './money';

// T012 — el importe es un entero en la unidad mínima de la moneda. Nunca punto flotante.
describe('Money', () => {
  it('acepta un entero en la unidad mínima', () => {
    const m = money(129900, 'COP');
    expect(m.amount).toBe(129900);
    expect(m.currency).toBe('COP');
  });

  it('acepta cero', () => {
    expect(money(0, 'USD').amount).toBe(0);
  });

  it.each([19.99, 0.1, 1.5])('rechaza el decimal %s', (amount) => {
    expect(() => money(amount, 'USD')).toThrow(InvalidMoneyError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rechaza %s',
    (amount) => {
      expect(() => money(amount, 'USD')).toThrow(InvalidMoneyError);
    },
  );

  it('rechaza importes negativos: un precio o un costo no puede serlo', () => {
    expect(() => money(-1, 'USD')).toThrow(InvalidMoneyError);
  });

  it('rechaza enteros fuera del rango seguro, donde la aritmética deja de ser exacta', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'USD')).toThrow(InvalidMoneyError);
  });

  it.each(['usd', 'US', 'USDX', '', '12A'])('rechaza el código de moneda %j', (currency) => {
    expect(() => money(100, currency)).toThrow(InvalidMoneyError);
  });

  it('es inmutable', () => {
    const m = money(100, 'USD');
    expect(Object.isFrozen(m)).toBe(true);
  });

  it('compara monedas', () => {
    expect(sameCurrency(money(1, 'USD'), money(2, 'USD'))).toBe(true);
    expect(sameCurrency(money(1, 'USD'), money(1, 'COP'))).toBe(false);
  });
});
