import { parseColor } from './color';
import type { CompiledTokens, Scheme } from './compiled-tokens';

const PLANES = ['--ds-surface-page', '--ds-surface-card', '--ds-surface-bar'] as const;
const SCHEMES: readonly Scheme[] = ['light', 'dark'];

/**
 * La mitad de SC-005 que se puede verificar sin navegador (FR-010): los tres planos tienen colores
 * distintos en cada esquema, y la tarjeta tiene un borde de ancho real con qué separarse del fondo.
 */
export function checkPlanes(tokens: CompiledTokens): string[] {
  const problems: string[] = [];
  for (const scheme of SCHEMES) {
    const colors = PLANES.map((plane) => {
      const raw = tokens.value(plane, scheme);
      return { plane, raw, key: JSON.stringify(parseColor(raw)) };
    });
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const [a, b] = [colors[i], colors[j]];
        if (a && b && a.key === b.key) problems.push(`[${scheme}] ${a.plane} y ${b.plane} valen lo mismo (${a.raw})`);
      }
    }
  }
  tokens.value('--ds-border-subtle', 'light');
  if (!(Number.parseFloat(tokens.value('--ds-border-width', 'light')) > 0)) {
    problems.push('--ds-border-width es 0: la tarjeta no tiene borde con qué separarse del fondo');
  }
  return problems;
}
