import type { Session, SessionUser, SignInFailure, SignInResult, SignUpFailure, SignUpResult, Unsubscribe, Watcher } from '@ecommerce/application/client';
import { uid } from '@ecommerce/domain';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';

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

  async signUp(input: { readonly email: string; readonly password: string; readonly displayName: string }): Promise<SignUpResult> {
    try {
      const { user } = await createUserWithEmailAndPassword(this.auth, input.email, input.password);
      await updateProfile(user, { displayName: input.displayName });
      // El token emitido al crear la cuenta todavía no trae el nombre; el servidor lo lee de ahí.
      await user.getIdToken(true);
      return { ok: true, user: sessionUser(user) };
    } catch (error) {
      return { ok: false, reason: signUpFailure(error) };
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

const SIGN_UP_FAILURES: Readonly<Record<string, SignUpFailure>> = {
  'auth/email-already-in-use': 'email-in-use',
  'auth/invalid-email': 'invalid-email',
  'auth/weak-password': 'weak-password',
  'auth/too-many-requests': 'too-many-attempts',
};

/** Exportada para probarla sin Auth. Lo que no se reconoce se trata como falla de conexión, y se registra. */
export function signUpFailure(error: unknown): SignUpFailure {
  const code = (error as { code?: unknown } | null)?.code;
  const known = typeof code === 'string' ? SIGN_UP_FAILURES[code] : undefined;
  if (known) return known;
  if (code !== 'auth/network-request-failed') console.error('Falla inesperada al crear la cuenta', error);
  return 'unavailable';
}
