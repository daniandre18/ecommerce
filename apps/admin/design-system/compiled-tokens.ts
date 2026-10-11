import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { compile } from 'sass';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** La hoja global del panel: la que el build compila y el navegador recibe. */
export const STYLES_ENTRY = `${ROOT}apps/admin/src/styles.scss`;

export type Scheme = 'light' | 'dark';

export interface CompiledTokens {
  /** Los nombres de los tokens del catálogo (`--ds-*` declarados en `:root`). */
  names(): string[];
  /** El valor de un token en un esquema, con sus `var()` y sus `light-dark()` ya resueltos. */
  value(name: string, scheme: Scheme): string;
}

/**
 * Compila la hoja con Sass, como el build, y lee el catálogo de lo que resulta: research §6. Las
 * compuertas miden lo que llega al navegador, no las variables del SCSS.
 */
export function compileTokens(entry = STYLES_ENTRY): CompiledTokens {
  const { css } = compile(entry, { loadPaths: [`${ROOT}node_modules`], quietDeps: true, silenceDeprecations: ['import'] });
  return readTokens(css);
}

export function readTokens(css: string): CompiledTokens {
  const declared = new Map<string, string>();
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector.trim() !== ':root') return;
    rule.walkDecls(/^--ds-/, (decl) => {
      declared.set(decl.prop, decl.value.trim());
    });
  });

  const value = (name: string, scheme: Scheme, seen: readonly string[] = []): string => {
    if (seen.includes(name)) throw new Error(`Hay un ciclo de referencias: ${[...seen, name].join(' → ')}`);
    const raw = declared.get(name);
    if (raw === undefined) throw new Error(`El token ${name} no existe en el catálogo${seen.length > 0 ? ` (lo usa ${seen.at(-1)})` : ''}`);
    return pickScheme(raw, scheme).replace(/var\(\s*(--ds-[\w-]+)\s*\)/g, (_, ref: string) => value(ref, scheme, [...seen, name]));
  };

  return { names: () => [...declared.keys()], value: (name, scheme) => value(name, scheme) };
}

/** Reemplaza cada `light-dark(a, b)` por el argumento del esquema, respetando paréntesis anidados. */
function pickScheme(raw: string, scheme: Scheme): string {
  const marker = 'light-dark(';
  let out = '';
  let rest = raw;
  for (let start = rest.indexOf(marker); start !== -1; start = rest.indexOf(marker)) {
    out += rest.slice(0, start);
    const [light, dark, end] = splitArguments(rest, start + marker.length);
    out += scheme === 'light' ? light : dark;
    rest = rest.slice(end + 1);
  }
  return out + rest;
}

/** Los dos argumentos de una función que empieza en `from`, y la posición de su paréntesis de cierre. */
function splitArguments(text: string, from: number): [string, string, number] {
  let depth = 0;
  let comma = -1;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (char === '(') depth++;
    else if (char === ')') {
      if (depth === 0) {
        if (comma === -1) throw new Error(`light-dark() con un solo argumento: ${text}`);
        return [text.slice(from, comma).trim(), text.slice(comma + 1, i).trim(), i];
      }
      depth--;
    } else if (char === ',' && depth === 0) comma = i;
  }
  throw new Error(`light-dark() sin cerrar: ${text}`);
}
