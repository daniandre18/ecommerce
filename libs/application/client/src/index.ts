// Punto de entrada del panel: los puertos de cliente, el contrato de cada comando y sus utilidades.
// Sin casos de uso ni nada que corra detrás de la guarda del servidor. El panel importa esto y nunca
// `@ecommerce/application`; la regla de módulos lo exige (T103 de la 002).
export * from './inputs';
export * from './commands';
export * from './queries';
export * from './session';
export * from './images';
export * from './tenants';
export * from './team';
export * from './audit';
export * from './chunked-query';
