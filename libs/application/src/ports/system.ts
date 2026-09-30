/** Hora del servidor. Inyectada para que las marcas de tiempo sean deterministas en las pruebas. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
