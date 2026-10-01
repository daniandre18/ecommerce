// Punto de entrada del panel: SDK web de Firebase. Las Functions importan `@ecommerce/infrastructure`
// (Admin SDK) y nunca esto; el panel importa esto y nunca aquello.
export * from './web-client';
export * from './firebase-session';
export * from './firestore-catalog-queries';
export * from './callable-catalog-commands';
