// Fixture de palette-isolation.spec.ts: los estilos en línea también son SCSS (inlineStyleLanguage).
// Un comentario de TypeScript no cuenta: @use 'palette';
export const styles = [`@use 'styles/palette' as p; .price { color: p.$blue-500; }`];
