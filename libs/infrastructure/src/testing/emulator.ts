/**
 * Vacía el emulador de Firestore, para que cada prueba de integración parta de un estado conocido.
 * Exige `FIRESTORE_EMULATOR_HOST`: sin emulador no hay a dónde mandar el borrado.
 */
export async function clearFirestoreEmulator(): Promise<void> {
  const host = process.env['FIRESTORE_EMULATOR_HOST'];
  if (!host) throw new Error('FIRESTORE_EMULATOR_HOST no definido: correr con firebase emulators:exec');
  await fetch(`http://${host}/emulator/v1/projects/demo-ecommerce/databases/(default)/documents`, { method: 'DELETE' });
}
