import { fileURLToPath } from 'node:url';

const lib = (path: string) => fileURLToPath(new URL(`../../libs/${path}`, import.meta.url));

/** Los alias del monorepo, compartidos por las pruebas unitarias y las de integración. */
export const aliases = {
  '@ecommerce/domain': lib('domain/src/index.ts'),
  '@ecommerce/application/testing': lib('application/src/testing/in-memory.ts'),
  '@ecommerce/application': lib('application/src/index.ts'),
  '@ecommerce/infrastructure/testing': lib('infrastructure/src/testing/emulator.ts'),
  '@ecommerce/infrastructure': lib('infrastructure/src/index.ts'),
};
