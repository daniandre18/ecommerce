import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileTokens } from './compiled-tokens';

// T004 — el lector de tokens que usan las compuertas de contraste, tipografía y planos: lee el CSS que
// llega al navegador, no el SCSS, y resuelve cada token por esquema (research §6).
const FIXTURE = fileURLToPath(new URL('./fixtures/tokens/tokens.scss', import.meta.url));

describe('compileTokens', () => {
  const tokens = compileTokens(FIXTURE);

  it('separa light-dark() en sus dos esquemas', () => {
    expect(tokens.value('--ds-plain', 'light')).toBe('#ffffff');
    expect(tokens.value('--ds-plain', 'dark')).toBe('#000000');
  });

  it('un valor sin light-dark() vale igual en los dos esquemas', () => {
    expect(tokens.value('--ds-length', 'light')).toBe('4px');
    expect(tokens.value('--ds-length', 'dark')).toBe('4px');
  });

  it('resuelve las cadenas de var()', () => {
    expect(tokens.value('--ds-chain-twice', 'light')).toBe('#ffffff');
    expect(tokens.value('--ds-chain-twice', 'dark')).toBe('#000000');
  });

  it('resuelve cada light-dark() de un valor compuesto, como una sombra de varias capas', () => {
    expect(tokens.value('--ds-shadow', 'light')).toBe('0 3px 11px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 #e8eafc');
    expect(tokens.value('--ds-shadow', 'dark')).toBe('0 3px 11px 0 transparent, 0 1px 2px 0 #000000');
  });

  it('conserva un color con alfa tal cual: componerlo es tarea del par de contraste', () => {
    expect(tokens.value('--ds-alpha', 'light')).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('lee solo el catálogo de :root', () => {
    expect(tokens.names()).not.toContain('--ds-ignored');
    expect(tokens.names()).toContain('--ds-plain');
  });

  it('una referencia a un token que no existe lanza un error que lo nombra', () => {
    expect(() => tokens.value('--ds-broken', 'light')).toThrow(/--ds-missing/);
    expect(() => tokens.value('--ds-nope', 'light')).toThrow(/--ds-nope/);
  });

  it('un ciclo de referencias lanza en vez de colgarse', () => {
    expect(() => tokens.value('--ds-loop-a', 'light')).toThrow(/ciclo/);
  });
});
