import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkBoot } from './boot';
import { compileTokens, type CompiledTokens } from './compiled-tokens';

// T026 — research §4: la estructura de arranque de index.html no puede usar var(--ds-*), así que sus
// literales son copias de los tokens. Esta prueba verifica que lo sigan siendo, en cada esquema.
const INDEX = fileURLToPath(new URL('../src/index.html', import.meta.url));
const html = readFileSync(INDEX, 'utf8');
const tokens = compileTokens();

/** El catálogo con un token cambiado: lo que pasaría si alguien lo edita y no acompaña index.html. */
const withToken = (name: string, value: string): CompiledTokens => ({
  ...tokens,
  value: (token, scheme) => (token === name ? value : tokens.value(token, scheme)),
});

describe('la estructura de arranque', () => {
  it('copia exactamente los tokens que representa, en claro y en oscuro', () => {
    expect(checkBoot(html, tokens)).toEqual([]);
  });

  it('falla si un token cambia y index.html no lo acompaña', () => {
    expect(checkBoot(html, withToken('--ds-surface-page', '#000000'))).toEqual([
      '[light] body { background: #f6f7ff } no es --ds-surface-page (#000000)',
      '[dark] body { background: #13131a } no es --ds-surface-page (#000000)',
    ]);
  });

  it('falla si el oscuro no redefine un color que cambia con el esquema', () => {
    const withoutDark = html.replace(/\.boot \{\s*color: #a7a7a7;\s*\}/, '');
    expect(checkBoot(withoutDark, tokens)).toEqual(['[dark] .boot { color: #666666 } no es --ds-text-secondary (#a7a7a7)']);
  });

  it('falla con un valor de color, tipografía, espaciado, radio o borde que no dice qué token copia', () => {
    const extra = html.replace('.boot-header {', '.boot-header {\n        padding-top: 4px;');
    expect(checkBoot(extra, tokens)).toEqual(['.boot-header { padding-top: 4px } no dice qué token copia (BOOT_TOKENS)']);
  });
});
