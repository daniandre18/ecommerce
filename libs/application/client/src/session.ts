import type { Uid } from '@ecommerce/domain';
import type { Unsubscribe, Watcher } from './queries';

export interface SessionUser {
  readonly uid: Uid;
  readonly email: string;
  readonly displayName: string;
}

/** Por qué no se pudo iniciar sesión. No distingue "no existe" de "contraseña incorrecta". */
export type SignInFailure = 'invalid-credentials' | 'too-many-attempts' | 'unavailable';

export type SignInResult = { readonly ok: true; readonly user: SessionUser } | { readonly ok: false; readonly reason: SignInFailure };

/** Por qué no se pudo crear la cuenta. */
export type SignUpFailure = 'email-in-use' | 'invalid-email' | 'weak-password' | 'too-many-attempts' | 'unavailable';

export type SignUpResult = { readonly ok: true; readonly user: SessionUser } | { readonly ok: false; readonly reason: SignUpFailure };

/** La autenticación de la persona. No dice nada de sus comercios: eso lo decide cada membresía. */
export interface Session {
  /** La cuenta con sesión, una vez restaurada la que haya guardado el navegador; `null` si no hay. */
  current(): Promise<SessionUser | null>;
  watch(watcher: Watcher<SessionUser | null>): Unsubscribe;
  signIn(email: string, password: string): Promise<SignInResult>;
  /**
   * Crea la cuenta y deja la sesión abierta, con su nombre ya en el token: quien llega por una
   * invitación la acepta enseguida, y la membresía y la bitácora lo nombran.
   */
  signUp(input: { readonly email: string; readonly password: string; readonly displayName: string }): Promise<SignUpResult>;
  signOut(): Promise<void>;
}
