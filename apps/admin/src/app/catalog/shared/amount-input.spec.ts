import { money, stockQuantity, stockUndefined, type CurrencyCode } from '@ecommerce/domain';
import { formatMoneyInput, formatStockInput, parseMoneyInput, parseStockInput } from './amount-input';

const USD = 'USD' as CurrencyCode;
const CLP = 'CLP' as CurrencyCode;
const COP = 'COP' as CurrencyCode;

describe('importes escritos por una persona', () => {
  it.each([
    ['129,99', 12999],
    ['129.99', 12999],
    ['129,9', 12990],
    ['129', 12900],
    [' 0,05 ', 5],
    ['0', 0],
  ])('"%s" en dólares son %i centavos, sin pasar por punto flotante', (text, cents) => {
    expect(parseMoneyInput(text, USD)).toEqual({ ok: true, value: money(cents, 'USD') });
  });

  it('una moneda sin decimales no los acepta', () => {
    expect(parseMoneyInput('1500', CLP)).toEqual({ ok: true, value: money(1500, 'CLP') });
    expect(parseMoneyInput('1500,5', CLP)).toEqual({ ok: false, message: 'Esta moneda no lleva decimales' });
  });

  // En pesos colombianos "52.000" es cincuenta y dos mil: sin decimales, punto y coma agrupan miles.
  it.each([
    ['52.000', 52000],
    ['1.250.000', 1250000],
    ['52,000', 52000],
    ['52000', 52000],
    ['500', 500],
  ])('en una moneda sin decimales, "%s" son %i', (text, amount) => {
    expect(parseMoneyInput(text, COP)).toEqual({ ok: true, value: money(amount, 'COP') });
  });

  it('en una moneda sin decimales, un separador que no agrupa de a tres es un decimal, y se rechaza', () => {
    expect(parseMoneyInput('52.5', COP)).toEqual({ ok: false, message: 'Esta moneda no lleva decimales' });
    expect(parseMoneyInput('1.25.000', COP).ok).toBe(false);
  });

  it('en una moneda con decimales, el punto sigue siendo decimal: "1.500" son 1,50', () => {
    expect(parseMoneyInput('1.500', USD)).toEqual({ ok: false, message: 'Usá hasta 2 decimales' });
    expect(parseMoneyInput('1.50', USD)).toEqual({ ok: true, value: money(150, 'USD') });
  });

  it('vacío es "sin importe"', () => {
    expect(parseMoneyInput('  ', USD)).toEqual({ ok: true, value: null });
  });

  it.each(['12,345', '-3', 'abc', '1.000,50', '12,'])('rechaza "%s"', (text) => {
    expect(parseMoneyInput(text, USD).ok).toBe(false);
  });

  it('se muestra con coma decimal y todos los decimales de la moneda', () => {
    expect(formatMoneyInput(money(12990, 'USD'))).toBe('129,90');
    expect(formatMoneyInput(money(5, 'USD'))).toBe('0,05');
    expect(formatMoneyInput(money(1500, 'CLP'))).toBe('1.500');
    expect(formatMoneyInput(money(1250000, 'COP'))).toBe('1.250.000');
    expect(formatMoneyInput(money(500, 'COP'))).toBe('500');
    expect(formatMoneyInput(null)).toBe('');
  });

  it.each([
    [123456, USD],
    [1250000, COP],
  ])('ida y vuelta da lo mismo: %i %s', (amount, currency) => {
    const shown = formatMoneyInput(money(amount, currency));
    expect(parseMoneyInput(shown, currency)).toEqual({ ok: true, value: money(amount, currency) });
  });
});

// FR-029: "sin definir" y cero son estados distintos, también al escribirlos.
describe('existencias escritas por una persona', () => {
  it('vacío es "sin definir", no cero', () => {
    expect(parseStockInput('')).toEqual({ ok: true, value: stockUndefined() });
    expect(parseStockInput('0')).toEqual({ ok: true, value: stockQuantity(0) });
  });

  it.each(['-1', '1,5', 'diez'])('rechaza "%s"', (text) => {
    expect(parseStockInput(text).ok).toBe(false);
  });

  it('se muestran vacías si no están definidas', () => {
    expect(formatStockInput(stockUndefined())).toBe('');
    expect(formatStockInput(stockQuantity(0))).toBe('0');
  });
});
