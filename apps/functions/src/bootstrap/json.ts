import { BusinessRuleError } from '@ecommerce/application';
import {
  InvalidIdentifierError,
  InvalidMoneyError,
  InvalidStockError,
  money,
  stockQuantity,
  stockUndefined,
  type Money,
  type StockLevel,
} from '@ecommerce/domain';

// El lector del JSON que manda el cliente, compartido por el parseo de todas las callable.

/** Un objeto que mandó el cliente, con la ruta por la que se llegó a él para nombrar el campo que falla. */
export class JsonObject {
  private constructor(
    private readonly data: Readonly<Record<string, unknown>>,
    private readonly path: string,
  ) {}

  static payload(data: unknown): JsonObject {
    return JsonObject.at(data, '');
  }

  private static at(value: unknown, path: string): JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) reject(path || '(carga útil)', 'se esperaba un objeto');
    return new JsonObject(value as Record<string, unknown>, path);
  }

  has(key: string): boolean {
    return this.data[key] !== undefined;
  }

  isNull(key: string): boolean {
    return this.data[key] === null;
  }

  /** Para un campo opcional: el resultado se esparce, así un campo ausente no aparece como `undefined`. */
  optional<K extends string, T>(key: K, read: (key: K) => T): { [P in K]?: T } {
    return (this.has(key) ? { [key]: read(key) } : {}) as { [P in K]?: T };
  }

  string(key: string): string {
    const value = this.data[key];
    if (typeof value !== 'string') reject(this.field(key), 'se esperaba un texto');
    return value;
  }

  integer(key: string): number {
    const value = this.data[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) reject(this.field(key), 'se esperaba un número entero');
    return value;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T {
    const value = this.string(key);
    if (!(allowed as readonly string[]).includes(value)) reject(this.field(key), `se esperaba uno de: ${allowed.join(', ')}`);
    return value as T;
  }

  /** Un identificador de dominio: un único segmento de ruta, porque con él se arman rutas. */
  id<T>(key: string, factory: (raw: string) => T): T {
    const raw = this.string(key);
    return fromDomain(this.field(key), () => factory(raw));
  }

  /** Importe entero en la unidad mínima de la moneda, nunca negativo. */
  money(key: string): Money {
    const value = this.object(key);
    const amount = value.integer('amount');
    const currency = value.string('currency');
    return fromDomain(this.field(key), () => money(amount, currency));
  }

  /** "Sin definir" y cero son estados distintos (FR-029). */
  stock(key: string): StockLevel {
    const value = this.object(key);
    const kind = value.oneOf('kind', ['undefined', 'quantity']);
    if (kind === 'undefined') return stockUndefined();
    const quantity = value.integer('value');
    return fromDomain(this.field(key), () => stockQuantity(quantity));
  }

  /** Una lista de objetos. El índice le sirve al llamador para derivar posiciones. */
  objects<T>(key: string, item: (entry: JsonObject, index: number) => T): T[] {
    const value = this.data[key];
    if (!Array.isArray(value)) reject(this.field(key), 'se esperaba una lista');
    return value.map((entry, index) => item(JsonObject.at(entry, `${this.field(key)}[${index}]`), index));
  }

  private object(key: string): JsonObject {
    return JsonObject.at(this.data[key], this.field(key));
  }

  private field(key: string): string {
    return this.path === '' ? key : `${this.path}.${key}`;
  }
}

function reject(field: string, problem: string): never {
  throw new BusinessRuleError('invalid-argument', `${field}: ${problem}`, { field });
}

/** Las factorías del dominio validan; acá su rechazo se traduce al código del contrato. */
function fromDomain<T>(field: string, build: () => T): T {
  try {
    return build();
  } catch (error) {
    if (error instanceof InvalidIdentifierError || error instanceof InvalidMoneyError || error instanceof InvalidStockError) {
      reject(field, error.message);
    }
    throw error;
  }
}
