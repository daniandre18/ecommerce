import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';
import { parseColor } from './color';
import type { CompiledTokens, Scheme } from './compiled-tokens';
import type { DsToken } from './contrast';

/**
 * El token que representa cada valor de la estructura de arranque de `index.html` (research §4). Esos
 * estilos se pintan antes de que llegue la hoja global, así que no pueden usar `var(--ds-*)`: el literal
 * es una copia del token, y esta lista dice de cuál.
 */
export const BOOT_TOKENS: Readonly<Record<string, Readonly<Record<string, DsToken>>>> = {
  body: { background: '--ds-surface-page' },
  '.boot': { padding: '--ds-space-4', 'font-family': '--ds-font-family', color: '--ds-text-secondary' },
  // El encabezado del marco: `tenant-shell` lo separa de la vista con `--ds-space-4`.
  '.boot-header': { 'margin-bottom': '--ds-space-4', 'font-size': '--ds-type-label-size' },
  // Los renglones son los del esqueleto (`ui-skeleton`): la fila del listado y la capa de hover.
  '.boot-row': { height: '--ds-row-height', 'margin-bottom': '--ds-space-2', 'border-radius': '--ds-radius-md', background: '--ds-surface-hover' },
};

/** Las propiedades de las categorías de FR-004: un valor suyo que no está en la lista es una segunda decisión. */
const CATEGORY_PROPS = /^(color|background|border|outline|box-shadow|font|padding|margin|gap|row-gap|column-gap)/;
/** Lo que no es un valor de ningún token: la ausencia, o lo que calcula el navegador. */
const NOT_A_VALUE = new Set(['0', 'auto', 'none', 'inherit', 'transparent']);

const SCHEMES: readonly Scheme[] = ['light', 'dark'];

const normalize = (value: string) => value.replace(/\s+/g, ' ').replace(/"/g, "'").trim();

function sameValue(literal: string, token: string): boolean {
  try {
    return JSON.stringify(parseColor(literal)) === JSON.stringify(parseColor(token));
  } catch {
    return normalize(literal) === normalize(token);
  }
}

/** El esquema de una declaración: oscuro dentro de `prefers-color-scheme: dark`, claro fuera de toda regla `@media`. */
function schemeOf(decl: Declaration): Scheme | 'other' {
  const media = decl.parent?.parent?.type === 'atrule' ? (decl.parent.parent as AtRule) : undefined;
  if (!media) return 'light';
  return /prefers-color-scheme:\s*dark/.test(media.params) ? 'dark' : 'other';
}

/**
 * Compara los estilos de arranque de `index.html` con el catálogo compilado. Devuelve un problema por
 * cada literal que no es igual a su token en algún esquema, por cada valor de las categorías de FR-004
 * que no figura en `BOOT_TOKENS`, y por cada entrada de la lista que ya no existe en `index.html`.
 */
export function checkBoot(html: string, tokens: CompiledTokens): string[] {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
  if (css === undefined) return ['index.html no tiene un bloque <style> de arranque'];

  const problems: string[] = [];
  // El valor de cada (selector, propiedad) en cada esquema: el oscuro hereda el claro si no lo redefine.
  const values = new Map<string, Partial<Record<Scheme, string>>>();
  postcss.parse(css).walkDecls((decl) => {
    const scheme = schemeOf(decl);
    const selector = decl.parent?.type === 'rule' ? (decl.parent as Rule).selector : '';
    if (!selector) return;
    const mapped = scheme === 'other' ? undefined : BOOT_TOKENS[selector]?.[decl.prop];
    if (!mapped || scheme === 'other') {
      if (CATEGORY_PROPS.test(decl.prop) && !NOT_A_VALUE.has(decl.value.trim())) {
        problems.push(`${selector} { ${decl.prop}: ${decl.value} } no dice qué token copia (BOOT_TOKENS)`);
      }
      return;
    }
    const key = `${selector}|${decl.prop}`;
    values.set(key, { ...values.get(key), [scheme]: decl.value });
  });

  for (const [selector, props] of Object.entries(BOOT_TOKENS)) {
    for (const [prop, token] of Object.entries(props)) {
      const written = values.get(`${selector}|${prop}`);
      if (!written?.light) {
        problems.push(`${selector} { ${prop} } figura en BOOT_TOKENS pero no en index.html`);
        continue;
      }
      for (const scheme of SCHEMES) {
        const literal = scheme === 'dark' ? (written.dark ?? written.light) : written.light;
        const expected = tokens.value(token, scheme);
        if (!sameValue(literal, expected)) problems.push(`[${scheme}] ${selector} { ${prop}: ${literal} } no es ${token} (${expected})`);
      }
    }
  }
  return problems;
}
