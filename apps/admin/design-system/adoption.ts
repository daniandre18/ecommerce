import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { filesIn } from './language';

/**
 * La compuerta de adopción (FR-021a, research §11): los componentes de Material que el panel no usa
 * tienen su tratamiento definido como mixin en `_components.scss`, sin emitir. Quien importe uno en una
 * vista tiene que incluir el mixin en el mismo cambio; si no, el componente se vería con los valores de
 * Material y ninguna otra compuerta lo notaría.
 */

/** Cada módulo de Material sin tratamiento emitido, con el mixin que lo trata. */
export const PENDING_ADOPTION: Readonly<Record<string, string>> = {
  '@angular/material/paginator': 'ds-paginator',
  '@angular/material/tabs': 'ds-tabs',
  '@angular/material/table': 'ds-mat-table',
  '@angular/material/card': 'ds-mat-card',
  '@angular/material/toolbar': 'ds-mat-toolbar',
};

/** Los archivos del panel que pueden importar un componente: los de la app y los de @ecommerce/ui. */
export function adoptionFiles(root: string): string[] {
  return [...filesIn(root, 'apps/admin/src'), ...filesIn(root, 'libs/ui/src')].filter((file) => file.endsWith('.ts'));
}

/** Los módulos que importa un archivo, estáticos o dinámicos, leídos con la API de TypeScript: un comentario no cuenta. */
function importsOf(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const modules: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) modules.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) modules.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return modules;
}

/** Los mixins incluidos en la hoja, sin contar los que solo aparecen en un comentario. */
function includedMixins(scss: string): Set<string> {
  const code = scss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return new Set([...code.matchAll(/@include\s+([\w-]+)/g)].map((match) => match[1] as string));
}

/** Un mensaje por cada archivo que importa un componente cuyo mixin `_components.scss` no incluye. */
export function checkAdoption(root: string, files: readonly string[], components: string): string[] {
  const included = includedMixins(components);
  const findings: string[] = [];
  for (const file of files) {
    for (const module of new Set(importsOf(file, readFileSync(join(root, file), 'utf8')))) {
      const mixin = PENDING_ADOPTION[module];
      if (mixin && !included.has(mixin)) {
        findings.push(`${file} importa ${module} y _components.scss no incluye ${mixin}. Ver contracts/component-treatments.md, "Adoptar uno de estos componentes"`);
      }
    }
  }
  return findings;
}
