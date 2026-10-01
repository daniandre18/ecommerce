import { money, stockQuantity, stockUndefined, type CurrencyCode, type Money, type StockLevel } from '@ecommerce/domain';

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/** Decimales de la moneda según el estándar (USD 2, CLP 0). */
export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

const AMOUNT = /^(\d+)(?:[.,](\d+))?$/;
/** Miles agrupados de a tres: "1.250.000" o "1,250,000". */
const GROUPED = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/;

/**
 * Un importe tal como lo escribe una persona. Con decimales en la moneda, coma o punto decimal y sin
 * separador de miles. Sin decimales (pesos colombianos, por ejemplo), el punto o la coma agrupan de
 * a tres: "52.000" son cincuenta y dos mil. Se convierte a la unidad mínima con aritmética de texto:
 * nunca pasa por punto flotante.
 */
export function parseMoneyInput(text: string, currency: CurrencyCode): Parsed<Money | null> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const digits = fractionDigits(currency);
  if (digits === 0 && GROUPED.test(trimmed)) return wholeAmount(trimmed.replaceAll(/[.,]/g, ''), currency);
  const match = AMOUNT.exec(trimmed);
  if (!match) return { ok: false, message: 'Escribí solo números, con coma decimal' };
  const [, whole = '', fraction = ''] = match;
  if (fraction.length > digits) {
    return { ok: false, message: digits === 0 ? 'Esta moneda no lleva decimales' : `Usá hasta ${digits} decimales` };
  }
  return wholeAmount(whole + fraction.padEnd(digits, '0'), currency);
}

function wholeAmount(minorUnits: string, currency: CurrencyCode): Parsed<Money> {
  const amount = Number(minorUnits);
  if (!Number.isSafeInteger(amount)) return { ok: false, message: 'El importe es demasiado grande' };
  return { ok: true, value: money(amount, currency) };
}

/** Coma decimal; sin decimales en la moneda, los miles se agrupan con punto ("1.250.000"). */
export function formatMoneyInput(value: Money | null): string {
  if (!value) return '';
  const digits = fractionDigits(value.currency);
  if (digits === 0) return String(value.amount).replaceAll(/\B(?=(\d{3})+(?!\d))/g, '.');
  const text = String(value.amount).padStart(digits + 1, '0');
  return `${text.slice(0, -digits)},${text.slice(-digits)}`;
}

/** Vacío es "sin definir", que no es lo mismo que cero (FR-029). */
export function parseStockInput(text: string): Parsed<StockLevel> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: stockUndefined() };
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: 'Escribí un número entero, o dejalo vacío si no está definido' };
  const quantity = Number(trimmed);
  if (!Number.isSafeInteger(quantity)) return { ok: false, message: 'La cantidad es demasiado grande' };
  return { ok: true, value: stockQuantity(quantity) };
}

export function formatStockInput(stock: StockLevel): string {
  return stock.kind === 'quantity' ? String(stock.value) : '';
}
