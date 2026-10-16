import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { parse as parseScss } from 'postcss-scss';
import { sourcesOf } from './literals';

/**
 * Un solo lugar para el tipo de los títulos (T060): `_components.scss` da a `h1` y `h2` su estilo del
 * catálogo, y las vistas solo cambian lo que es suyo, como el margen. Antes cada vista repetía la regla.
 */

/** Lo que la regla global define y una vista no repite. */
const TYPOGRAPHY = /^(font(-[\w-]+)?|letter-spacing|line-height)$/;
/** Un selector que alcanza un h1 o un h2: `h1`, `.card h2`, `h2[mat-dialog-title]`… */
const HEADING = /(^|[\s>+~(])(h[12])(?![\w-])/;

/** Un hallazgo por cada declaración tipográfica sobre un título en los estilos de una vista. */
export function headingFindings(root: string, files: readonly string[]): string[] {
  const findings: string[] = [];
  for (const file of files) {
    if (file.endsWith('/styles/_components.scss')) continue;
    for (const source of sourcesOf(file, readFileSync(join(root, file), 'utf8')).styles) {
      const tree = source.syntax === 'scss' ? parseScss(source.css) : postcss.parse(source.css);
      tree.walkRules((rule) => {
        if (!rule.selectors.some((selector) => HEADING.test(selector))) return;
        rule.each((node) => {
          if (node.type !== 'decl' || !TYPOGRAPHY.test(node.prop)) return;
          const line = source.line + (node.source?.start?.line ?? 1) - 1;
          findings.push(`${file}:${line}  ${rule.selector} { ${node.prop} }: el tipo de los títulos es global (_components.scss); la vista solo cambia lo suyo, como el margen`);
        });
      });
    }
  }
  return findings;
}

/** Las declaraciones de las reglas `h1` y `h2` de primer nivel de la hoja compilada. */
export function globalHeadings(css: string): Record<string, Record<string, string>> {
  const headings: Record<string, Record<string, string>> = {};
  postcss.parse(css).each((node) => {
    if (node.type !== 'rule') return;
    for (const selector of node.selectors.filter((part) => part === 'h1' || part === 'h2')) {
      node.walkDecls((decl) => {
        (headings[selector] ??= {})[decl.prop] = decl.value;
      });
    }
  });
  return headings;
}
