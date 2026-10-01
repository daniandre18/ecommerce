import type { Session, SessionUser, SignInFailure, SignInResult, Unsubscribe, Watcher } from '@ecommerce/application';
import { uid } from '@ecommerce/domain';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth, type User } from 'firebase/auth';

/** Correo y contraseña de Firebase Auth. */
export class FirebaseSession implements Session {
  constructor(private readonly auth: Auth) {}

  async current(): Promise<SessionUser | null> {
    await this.auth.authStateReady();
    return toSessionUser(this.auth.currentUser);
  }

  watch(watcher: Watcher<SessionUser | null>): Unsubscribe {
    return onAuthStateChanged(this.auth, (user) => watcher.next(toSessionUser(user)), (error) => watcher.error(error));
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    try {
      const { user } = await signInWithEmailAndPassword(this.auth, email, password);
      return { ok: true, user: sessionUser(user) };
    } catch (error) {
      return { ok: false, reason: signInFailure(error) };
    }
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}

function toSessionUser(user: User | null): SessionUser | null {
  return user && sessionUser(user);
}

function sessionUser(user: User): SessionUser {
  return { uid: uid(user.uid), email: user.email ?? '', displayName: user.displayName ?? user.email ?? '' };
}

// "No existe" y "contraseña incorrecta" se confunden a propósito: distinguirlos le diría a
// cualquiera qué correos tienen cuenta.
const INVALID_CREDENTIALS = new Set(['auth/invalid-credential', 'auth/invalid-email', 'auth/user-not-found', 'auth/wrong-password', 'auth/user-disabled']);

/** Exportada para probarla sin Auth. Lo que no se reconoce se trata como falla de conexión, y se registra. */
export function signInFailure(error: unknown): SignInFailure {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && INVALID_CREDENTIALS.has(code)) return 'invalid-credentials';
  if (code === 'auth/too-many-requests') return 'too-many-attempts';
  if (code !== 'auth/network-request-failed') console.error('Falla inesperada al iniciar sesión', error);
  return 'unavailable';
}
