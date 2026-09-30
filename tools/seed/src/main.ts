import { ACCOUNTS, SEED_PASSWORD, seed } from './seed';

// Uso, con los emuladores corriendo:  npx nx run tools:seed
seed()
  .then(() => {
    console.log('Siembra completa. Cuentas, todas con contraseña', JSON.stringify(SEED_PASSWORD));
    for (const account of Object.values(ACCOUNTS)) console.log(`  ${account.email}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
