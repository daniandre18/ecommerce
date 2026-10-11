import { parseColor } from './color';
import type { CompiledTokens, Scheme } from './compiled-tokens';

/** Un nivel de la escala, de mayor a menor, con el color de texto que usa. */
export interface TypeLevel {
  readonly level: string;
  readonly color: `--ds-text-${string}`;
}

interface Measured {
  readonly size: number;
  readonly weight: number;
  readonly lineRatio: number;
  readonly tracking: number;
  readonly color: Record<Scheme, string>;
}

/** Diferencias de interlineado relativo por debajo de esto no se perciben como otro ritmo. */
const LINE_RATIO_STEP = 0.05;

/** En px: `rem` contra la base de 16 px del navegador. */
function length(value: string): number {
  const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim());
  if (!match) throw new Error(`"${value}" no es una longitud`);
  const amount = Number(match[1]);
  return match[2] === 'rem' ? amount * 16 : amount;
}

function measure(tokens: CompiledTokens, { level, color }: TypeLevel): Measured {
  const token = (part: string) => tokens.value(`--ds-type-${level}-${part}`, 'light');
  const size = length(token('size'));
  const normalize = (scheme: Scheme) => JSON.stringify(parseColor(tokens.value(color, scheme)));
  return {
    size,
    weight: Number(token('weight')),
    lineRatio: length(token('line-height')) / size,
    // `em` es relativo al tamaño: se compara tal cual.
    tracking: Number.parseFloat(token('tracking')) || 0,
    color: { light: normalize('light'), dark: normalize('dark') },
  };
}

/**
 * FR-015: entre un nivel y el siguiente difieren al menos dos de tamaño, peso, color y espaciado. El
 * espaciado entre letras y el interlineado relativo cuentan como un solo atributo
 * (contracts/tokens.md). El color tiene que diferir en los dos esquemas.
 */
export function checkTypography(tokens: CompiledTokens, levels: readonly TypeLevel[]): string[] {
  const problems: string[] = [];
  const measured: (Measured | undefined)[] = levels.map((level) => {
    try {
      return measure(tokens, level);
    } catch (error) {
      problems.push(`${level.level}: ${(error as Error).message}`);
      return undefined;
    }
  });
  for (let i = 0; i + 1 < levels.length; i++) {
    const [upper, lower] = [measured[i], measured[i + 1]];
    if (!upper || !lower) continue;
    const differs: string[] = [];
    if (upper.size !== lower.size) differs.push('tamaño');
    if (upper.weight !== lower.weight) differs.push('peso');
    if (upper.color.light !== lower.color.light && upper.color.dark !== lower.color.dark) differs.push('color');
    if (upper.tracking !== lower.tracking || Math.abs(upper.lineRatio - lower.lineRatio) >= LINE_RATIO_STEP) differs.push('espaciado');
    if (differs.length < 2) {
      problems.push(`${levels[i]?.level} → ${levels[i + 1]?.level}: difieren solo en [${differs.join(', ')}]; FR-015 pide al menos dos de tamaño, peso, color y espaciado`);
    }
  }
  return problems;
}
