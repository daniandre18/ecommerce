import { afterEach, describe, expect, it, vi } from 'vitest';
import { gateFailure } from './callable';
import { uploadFailure } from './firebase-image-storage';
import { signInFailure } from './firebase-session';

const firebaseError = (code: string) => Object.assign(new Error(`falla ${code}`), { code });

describe('lo que corta antes del caso de uso llega al panel como un resultado más', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['unauthenticated', 'failed-precondition', 'permission-denied', 'unavailable', 'internal'])('functions/%s', (code) => {
    expect(gateFailure(firebaseError(`functions/${code}`))).toEqual({ ok: false, code, message: `falla functions/${code}` });
  });

  it('un tiempo agotado es, para quien opera, lo mismo que sin conexión', () => {
    expect(gateFailure(firebaseError('functions/deadline-exceeded')).code).toBe('unavailable');
  });

  it('lo que no se reconoce es un error interno, y queda registrado', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(gateFailure(new TypeError('rompió')).code).toBe('internal');
    expect(log).toHaveBeenCalled();
  });
});

describe('las fallas de inicio de sesión', () => {
  afterEach(() => vi.restoreAllMocks());

  // Distinguirlas le diría a cualquiera qué correos tienen cuenta.
  it.each(['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email', 'auth/user-disabled'])(
    '%s es "credenciales inválidas", sin decir cuál de las dos falló',
    (code) => {
      expect(signInFailure(firebaseError(code))).toBe('invalid-credentials');
    },
  );

  it('demasiados intentos se dice tal cual: la persona tiene que esperar', () => {
    expect(signInFailure(firebaseError('auth/too-many-requests'))).toBe('too-many-attempts');
  });

  it('sin red es "no disponible", y lo desconocido también, pero queda registrado', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(signInFailure(firebaseError('auth/network-request-failed'))).toBe('unavailable');
    expect(log).not.toHaveBeenCalled();
    expect(signInFailure(firebaseError('auth/internal-error'))).toBe('unavailable');
    expect(log).toHaveBeenCalledOnce();
  });
});

describe('las fallas al subir una imagen', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['storage/unauthorized', 'not-allowed'],
    ['storage/unauthenticated', 'not-allowed'],
    ['storage/canceled', 'interrupted'],
    ['storage/retry-limit-exceeded', 'unavailable'],
  ])('%s es %s', (code, reason) => {
    expect(uploadFailure(firebaseError(code))).toBe(reason);
  });

  it('lo desconocido se trata como interrumpida, y queda registrado', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(uploadFailure(firebaseError('storage/unknown'))).toBe('interrupted');
    expect(log).toHaveBeenCalledOnce();
  });
});
