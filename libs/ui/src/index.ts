// Los componentes de estado usan la clase global `cdk-visually-hidden`: la app que los consume debe
// incluir `@include cdk.a11y-visually-hidden()` en sus estilos globales.
export * from './lib/states/skeleton';
export * from './lib/states/error-state';
export * from './lib/states/empty-state';
