import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { describe, expect, it } from 'vitest';
import { compileTokens, readTokens, type CompiledTokens, type Scheme } from './compiled-tokens';
import { checkPairs } from './contrast';
import { CONTRAST_PAIRS } from './contrast-pairs';
import { PALETTE_USERS, paletteFiles, paletteUsers } from './palette-isolation';

// T052 — historia 4, escenario 3: el color primario se cambia en un solo lugar, llega a todas las vistas
// sin tocar ningún componente, y la prueba de contraste vuelve a verificar los pares que lo usan.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = 'apps/admin/design-system/fixtures/palette-isolation';

describe('el uso de la paleta', () => {
  it('encuentra el @use de la paleta en una hoja y en los estilos en línea, y no en los comentarios', () => {
    const files = ['view.scss', 'commented.scss', 'inline.ts'].map((file) => `${FIXTURES}/${file}`);
    expect(paletteUsers(ROOT, files)).toEqual([`${FIXTURES}/view.scss`, `${FIXTURES}/inline.ts`]);
  });

  it('en el panel, solo la usan _tokens.scss y _theme.scss', () => {
    const users = paletteUsers(ROOT, paletteFiles(ROOT));
    expect(users).toContain('apps/admin/src/styles/_tokens.scss');
    expect(users.filter((file) => !PALETTE_USERS.includes(file))).toEqual([]);
  });
});

describe('cambiar el primario', () => {
  // El azul de la referencia, antes de ajustarlo a AA (research §2): 4,21:1 sobre blanco.
  const OTHER_BLUE = '#536dfe';
  const before = compileTokens();
  const { css } = compileString(`@use 'styles/palette' with ($blue-500: ${OTHER_BLUE});\n@use 'styles';`, {
    loadPaths: [`${ROOT}apps/admin/src`, `${ROOT}node_modules`],
    quietDeps: true,
    silenceDeprecations: ['import'],
  });
  const after = readTokens(css);

  it('cambia --ds-primary en claro, y en oscuro no', () => {
    expect(after.value('--ds-primary', 'light')).toBe(OTHER_BLUE);
    expect(after.value('--ds-primary', 'dark')).toBe(before.value('--ds-primary', 'dark'));
  });

  it('la prueba de contraste reevalúa exactamente los pares cuyo color cambió, y ninguno más', () => {
    const tokensOf = (pair: (typeof CONTRAST_PAIRS)[number]) => [pair.foreground, pair.background, ...(pair.alternate ? [pair.alternate] : []), ...(pair.layers ?? []).map((layer) => layer.color)];
    const changed = (tokens: CompiledTokens, scheme: Scheme) => (token: string) => tokens.value(token, scheme) !== before.value(token, scheme);
    const expected = CONTRAST_PAIRS.filter((pair) => tokensOf(pair).some(changed(after, 'light'))).map((pair) => `${pair.id} [light]`);
    const reported = [...new Set(checkPairs(after, CONTRAST_PAIRS).map((problem) => problem.slice(0, problem.indexOf(']:') + 1)))];

    expect(checkPairs(before, CONTRAST_PAIRS)).toEqual([]);
    expect(expected.length).toBeGreaterThan(0);
    expect(reported).toEqual(expected);
  });
});
