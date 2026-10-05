import { migrateStorefront } from './migrate';

// Uso, con los emuladores corriendo:   npx nx run tools:migrate
// Contra un proyecto real:              npx nx run tools:migrate --args="--confirm <proyecto>"
const confirmAt = process.argv.indexOf('--confirm');
const confirm = confirmAt === -1 ? undefined : process.argv[confirmAt + 1];

migrateStorefront(confirm === undefined ? {} : { confirm })
  .then(({ migrated, already }) => {
    console.log(`Migración de la ficha de tienda completa: ${migrated} productos migrados, ${already} ya estaban.`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
