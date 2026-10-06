import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

const SERVER_SDKS = ['firebase', 'firebase/*', 'firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*', '@angular/*'];

/** Restricciones entre capas, más las de un grupo de archivos (`extra` se suma: todas se cumplen). */
const boundaries = (extra) => [
  'error',
  {
    enforceBuildableLibDependency: true,
    allow: [],
    depConstraints: [
      {
        sourceTag: 'layer:domain',
        onlyDependOnLibsWithTags: [],
        bannedExternalImports: SERVER_SDKS,
      },
      {
        // T103 de la 002 — lo que el panel ve de application: puertos de cliente, el contrato de los
        // comandos y sus utilidades. Sin casos de uso.
        sourceTag: 'layer:application-client',
        onlyDependOnLibsWithTags: ['layer:domain'],
        bannedExternalImports: SERVER_SDKS,
      },
      {
        sourceTag: 'layer:application',
        onlyDependOnLibsWithTags: ['layer:domain', 'layer:application-client'],
        bannedExternalImports: SERVER_SDKS,
      },
      {
        sourceTag: 'layer:infrastructure',
        onlyDependOnLibsWithTags: ['layer:domain', 'layer:application', 'layer:application-client'],
        bannedExternalImports: ['@angular/*'],
      },
      {
        sourceTag: 'layer:presentation',
        onlyDependOnLibsWithTags: ['layer:domain', 'layer:application', 'layer:application-client', 'layer:infrastructure', 'layer:presentation'],
      },
      {
        // T103 de la 002 — el panel corre en el navegador: `@ecommerce/application` (el barril, con los
        // casos de uso del servidor) no está en la lista. Usa `@ecommerce/application/client`.
        sourceTag: 'runtime:browser',
        onlyDependOnLibsWithTags: ['layer:domain', 'layer:application-client', 'layer:infrastructure', 'layer:presentation'],
      },
      ...extra,
    ],
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.nx/**',
      '**/.angular/**',
      '**/*.min.js',
    ],
  },
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  {
    files: ['**/*.ts'],
    rules: {
      // T003 — la regla de dependencias de la arquitectura limpia, hecha cumplir.
      // Un import de Firebase en libs/domain no es una observación de revisión: es un build roto.
      '@nx/enforce-module-boundaries': boundaries([]),
    },
  },
  {
    // T103 de la 002 — el adaptador web corre en el navegador del panel: como el panel, solo ve el
    // cliente de application. Es el mismo proyecto que los repositorios de servidor, así que la
    // etiqueta no alcanza para separarlos; la restricción se aplica a estos archivos.
    files: ['libs/infrastructure/src/client/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': boundaries([{ sourceTag: 'layer:infrastructure', onlyDependOnLibsWithTags: ['layer:domain', 'layer:application-client'] }]),
    },
  },
);
