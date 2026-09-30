import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

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
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'layer:domain',
              onlyDependOnLibsWithTags: [],
              bannedExternalImports: ['firebase', 'firebase/*', 'firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*', '@angular/*'],
            },
            {
              sourceTag: 'layer:application',
              onlyDependOnLibsWithTags: ['layer:domain'],
              bannedExternalImports: ['firebase', 'firebase/*', 'firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*', '@angular/*'],
            },
            {
              sourceTag: 'layer:infrastructure',
              onlyDependOnLibsWithTags: ['layer:domain', 'layer:application'],
              bannedExternalImports: ['@angular/*'],
            },
            {
              sourceTag: 'layer:presentation',
              onlyDependOnLibsWithTags: ['layer:domain', 'layer:application', 'layer:infrastructure', 'layer:presentation'],
            },
          ],
        },
      ],
    },
  },
);
