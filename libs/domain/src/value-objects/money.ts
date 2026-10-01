import type { Branded } from './ids';

/** Código de moneda de tres letras. La moneda la define el inquilino, no la variante. */
export type CurrencyCode = Branded<string, 'CurrencyCode'>;

/**
 * Importe entero en la unidad mínima de la moneda. Nunca punto flotante: es aritmética de
 * dinero, no localización. La presentación y la conversión quedan fuera de esta feature.
 */
export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

export class InvalidMoneyError extends Error {
  override readonly name = 'InvalidMoneyError';
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function money(amount: number, currency: string): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new InvalidMoneyError(
      `El importe debe ser un entero en la unidad mínima de la moneda; se recibió ${amount}`,
    );
  }
  if (amount < 0) {
    throw new InvalidMoneyError(`El importe no puede ser negativo; se recibió ${amount}`);
  }
  if (!CURRENCY_CODE.test(currency)) {
    throw new InvalidMoneyError(`Código de moneda inválido: ${JSON.stringify(currency)}`);
  }
  return Object.freeze({ amount, currency: currency as CurrencyCode });
}

export function sameCurrency(a: Money, b: Money): boolean {
  return a.currency === b.currency;
}

export function moneyEquals(a: Money | null, b: Money | null): boolean {
  return a === b || (a !== null && b !== null && a.amount === b.amount && a.currency === b.currency);
}
