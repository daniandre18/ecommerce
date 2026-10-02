import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Playwright carga este archivo como CommonJS: no hay `import.meta`.
const ROOT = resolve(__dirname, '../..');
const FIRESTORE = '127.0.0.1:8080';
const AUTH = '127.0.0.1:9099';
const FUNCTIONS = 'http://127.0.0.1:5001/demo-ecommerce/us-central1';

/** Las callable de `apps/functions/src/index.ts`. */
const CALLABLES = [
  'createProduct',
  'updateProductDetails',
  'setProductOptions',
  'setProductStatus',
  'setVariantSku',
  'setVariantImages',
  'archiveProduct',
  'archiveVariant',
  'setVariantPrice',
  'setVariantCost',
  'setVariantStock',
  'createRole',
  'updateRole',
  'deleteRole',
  'inviteCollaborator',
  'revokeInvitation',
  'acceptInvitation',
  'assignRole',
  'setMembershipEnabled',
  'transferOwnership',
];

/**
 * Cada corrida parte del escenario de quickstart.md: Firestore vacío y las cuentas sembradas. Corre
 * después de levantar los emuladores (`webServer`), con el mismo sembrador que usa una persona.
 */
export default async function globalSetup(): Promise<void> {
  // Con E2E_KEEP_DATA=1 se reusan los emuladores de una sesión en curso sin borrarle lo cargado: las
  // pruebas solo agregan productos con nombres únicos, y el sembrador es idempotente.
  if (process.env['E2E_KEEP_DATA'] !== '1') {
    await fetch(`http://${FIRESTORE}/emulator/v1/projects/demo-ecommerce/databases/(default)/documents`, { method: 'DELETE' });
  }
  execFileSync('npx', ['nx', 'run', 'tools:seed', '--skip-nx-cache'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: FIRESTORE, FIREBASE_AUTH_EMULATOR_HOST: AUTH, GCLOUD_PROJECT: 'demo-ecommerce' },
  });
  await Promise.all(CALLABLES.map(warmUp));
}

/**
 * El emulador de Functions crea un proceso por callable en su primer pedido, y ese primer pedido a
 * veces se corta sin respuesta ("socket hang up"). El navegador lo ve como falla de red —el SDK la
 * informa como `internal`— y la página queda con un pedido colgado. Un pedido sin sesión basta para
 * crear el proceso: la verificación de la sesión ya corre adentro.
 */
async function warmUp(name: string): Promise<void> {
  let failures = 0;
  for (let attempt = 1; attempt <= 30; attempt++) {
    let status: number;
    try {
      const response = await fetch(`${FUNCTIONS}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: {} }),
        signal: AbortSignal.timeout(10_000),
      });
      await response.text();
      status = response.status;
    } catch (error) {
      if (++failures === 3) throw new Error(`La callable ${name} no respondió al calentarla`, { cause: error });
      continue;
    }
    // Recién levantado, el emulador responde 404 hasta terminar de cargar las definiciones.
    if (status !== 404) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`La callable ${name} no existe en el emulador`);
}
