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

/** La autenticación de la persona. No dice nada de sus comercios: eso lo decide cada membresía. */
export interface Session {
  /** La cuenta con sesión, una vez restaurada la que haya guardado el navegador; `null` si no hay. */
  current(): Promise<SessionUser | null>;
  watch(watcher: Watcher<SessionUser | null>): Unsubscribe;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
}
