import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTokens } from './compiled-tokens';
import type { ContrastPair } from './contrast';
import { CONTRAST_PAIRS } from './contrast-pairs';
import { DERIVED, derive, paletteColors, ratioOf, requirementsOf, TARGET } from './palette-derivation';

// T059 — la paleta semántica se deriva de su objetivo de contraste. Cada color de DERIVED tiene que ser,
// exactamente, lo que da la derivación contra los pares en los que se usa.
const PALETTE = fileURLToPath(new URL('../src/styles/_palette.scss', import.meta.url));
const palette = paletteColors(readFileSync(PALETTE, 'utf8'));
const tokens = compileTokens();

const derived = (variable: string) => {
  const color = DERIVED.find((entry) => entry.variable === variable);
  if (!color) throw new Error(`${variable} no está en DERIVED`);
  const value = palette.get(variable) as string;
  return { color, value, derivation: derive(color.reference, requirementsOf(value, color.scheme, tokens, CONTRAST_PAIRS)) };
};

describe('la paleta derivada', () => {
  it.each(DERIVED.map((color) => [color.variable, color.scheme]))('$%s [%s] es el valor que da su objetivo de contraste', (variable) => {
    const { value, derivation } = derived(variable);
    expect(value).toBe(derivation.hex);
  });

  it('cada color derivado cumple su objetivo (WCAG + 0,5) contra todas sus superficies', () => {
    const short: string[] = [];
    for (const color of DERIVED) {
      const { value, derivation } = derived(color.variable);
      for (const requirement of derivation.requirements) {
        if (ratioOf(requirement, value) < requirement.target) short.push(`${color.variable} en ${requirement.pair}`);
      }
    }
    expect(short).toEqual([]);
  });

  it('los objetivos son el umbral de WCAG más 0,5', () => {
    expect(TARGET).toEqual({ text: 5, 'large-text': 3.5, ui: 3.5, 'two-tone': 9.5 });
  });

  it('ningún color derivado comparte su valor con otra variable: así cada par se atribuye a un solo color', () => {
    const values = [...palette.entries()];
    for (const color of DERIVED) {
      const value = palette.get(color.variable);
      expect(values.filter(([, other]) => other === value).map(([name]) => name)).toEqual([color.variable]);
    }
  });
});

describe('la derivación de verdad falla', () => {
  it('con un par nuevo que el color ya no cumple: la derivación cambia el valor', () => {
    const { color, value } = derived('blue-500');
    // El primario sobre un fondo más oscuro que todos los actuales: exige un primario más oscuro.
    const stricter: ContrastPair = { id: 'primary/nuevo-fondo', foreground: '--ds-primary', background: '--ds-surface-bar', kind: 'text', state: 'rest', plane: 'control', declared: { light: 0, dark: 0 } };
    const darkerBar = { ...tokens, value: (name: string, scheme: 'light' | 'dark') => (name === '--ds-surface-bar' && scheme === 'light' ? '#c8ccf0' : tokens.value(name, scheme)) };
    const requirements = requirementsOf(value, color.scheme, darkerBar, [...CONTRAST_PAIRS, stricter]);
    expect(derive(color.reference, requirements).hex).not.toBe(value);
  });

  it('con un color que no aparece en ningún par: no hay contra qué derivarlo', () => {
    expect(() => derive('#536dfe', [])).toThrow('no aparece en ningún par');
  });
});
