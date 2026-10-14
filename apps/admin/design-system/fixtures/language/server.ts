// Fixture de language.spec.ts: en un archivo de servidor solo se recorren los mensajes de error.
class BusinessRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
class HttpsError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
export const denied = () => {
  throw new HttpsError('permission-denied', 'No tenés permiso para esto');
};
export const member = () => {
  throw new BusinessRuleError('already-member', 'Ya sos miembro de este comercio');
};
export const internal = 'Tenés: esto no es un mensaje de error, y en el servidor no se recorre';
// Un mensaje que se pasa por una constante del mismo archivo también es un mensaje.
const DENIED = 'Ya sos parte de esto';
export const viaConstant = () => {
  throw new HttpsError('permission-denied', DENIED);
};
