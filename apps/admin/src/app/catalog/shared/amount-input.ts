import { money, stockQuantity, stockUndefined, type CurrencyCode, type Money, type StockLevel } from '@ecommerce/domain';

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/** Decimales de la moneda según el estándar (USD 2, CLP 0). */
export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

const AMOUNT = /^(\d+)(?:[.,](\d+))?$/;

/**
 * Un importe tal como lo escribe una persona: coma o punto decimal, sin separador de miles. Se
 * convierte a la unidad mínima con aritmética de texto: "0,1 + 0,2" nunca pasa por punto flotante.
 */
export function parseMoneyInput(text: string, currency: CurrencyCode): Parsed<Money | null> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const match = AMOUNT.exec(trimmed);
  if (!match) return { ok: false, message: 'Escribí solo números, con coma decimal' };
  const [, whole = '', fraction = ''] = match;
  const digits = fractionDigits(currency);
  if (fraction.length > digits) {
    return { ok: false, message: digits === 0 ? 'Esta moneda no lleva decimales' : `Usá hasta ${digits} decimales` };
  }
  const amount = Number(whole + fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(amount)) return { ok: false, message: 'El importe es demasiado grande' };
  return { ok: true, value: money(amount, currency) };
}

export function formatMoneyInput(value: Money | null): string {
  if (!value) return '';
  const digits = fractionDigits(value.currency);
  const text = String(value.amount).padStart(digits + 1, '0');
  return digits === 0 ? text : `${text.slice(0, -digits)},${text.slice(-digits)}`;
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
