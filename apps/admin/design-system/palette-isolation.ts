import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { filesIn } from './language';

/**
 * El aislamiento de la paleta (historia 4, escenario 3): sus variables Sass solo las leen las hojas que
 * definen papeles. Las vistas usan `--ds-*`, así que cambiar un valor de la paleta llega a todas sin tocar
 * ninguna; `literals.ts` (T050) cierra la otra puerta, la de escribir el color a mano.
 */

/** Las hojas que pueden hacer `@use` de `_palette.scss`. */
export const PALETTE_USERS: readonly string[] = ['apps/admin/src/styles/_tokens.scss', 'apps/admin/src/styles/_theme.scss'];

/** Las hojas y los componentes del panel: los `.ts` también, porque sus estilos en línea son SCSS. */
export function paletteFiles(root: string): string[] {
  const scss = (dir: string) => filesIn(root, dir, ['.scss']);
  return [...scss('apps/admin/src'), ...scss('libs/ui/src'), ...filesIn(root, 'apps/admin/src'), ...filesIn(root, 'libs/ui/src')].filter((file) => !file.endsWith('.html'));
}

const PALETTE = /@(?:use|forward|import)\s+['"]([^'"]*?)['"]/g;
const isPalette = (path: string) => /(^|\/)_?palette(\.scss)?$/.test(path);

/** Si un texto de SCSS, sin sus comentarios, carga la paleta. */
function loadsPalette(scss: string): boolean {
  const code = scss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return [...code.matchAll(PALETTE)].some((match) => isPalette(match[1] as string));
}

/** Las cadenas de un `.ts`, leídas con la API de TypeScript: los comentarios quedan fuera. */
function stringsOf(path: string, source: string): string[] {
  const strings: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) strings.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS));
  return strings;
}

/** Los archivos que cargan la paleta, en el orden en que llegan. */
export function paletteUsers(root: string, files: readonly string[]): string[] {
  return files.filter((file) => {
    const source = readFileSync(join(root, file), 'utf8');
    return file.endsWith('.ts') ? stringsOf(file, source).some(loadsPalette) : loadsPalette(source);
  });
}
