import type { TypeLevel } from './typography';

/**
 * La escala tipográfica del panel, de mayor a menor (FR-014, contracts/tokens.md). Cada nivel compone
 * sus cuatro tokens `--ds-type-{nivel}-*` con un color de texto.
 */
export const TYPOGRAPHY_LEVELS: readonly TypeLevel[] = [
  { level: 'page-title', color: '--ds-text-primary' },
  { level: 'section-title', color: '--ds-text-primary' },
  { level: 'subtitle', color: '--ds-text-secondary' },
  { level: 'body', color: '--ds-text-primary' },
  { level: 'label', color: '--ds-text-primary' },
  { level: 'help', color: '--ds-text-secondary' },
];
