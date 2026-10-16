import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Root } from 'postcss';
import postcss from 'postcss';
import { parse as parseScss } from 'postcss-scss';
import ts from 'typescript';
import { parseColor } from './color';
import { compileTokens, type CompiledTokens } from './compiled-tokens';
import { LITERAL_EXCEPTIONS, type LiteralCategory, type LiteralException } from './literal-exceptions';

/** Un valor escrito a mano donde va un token (FR-005). */
export interface LiteralFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** `archivo:línea:columna  propiedad: valor  → sugerencia`. Todo hallazgo bloquea (T050). */
  readonly message: string;
}

export interface LiteralsResult {
  readonly findings: readonly LiteralFinding[];
  /** Problemas de la lista de excepciones: siempre bloquean. */
  readonly problems: readonly string[];
  /** Excepciones que no excusaron ningún valor de los archivos revisados: muertas, si se revisó el panel entero. */
  readonly unused: readonly string[];
}

export interface LiteralsInput {
  readonly root: string;
  /** Rutas desde `root`. */
  readonly files: readonly string[];
  readonly tokens: CompiledTokens;
  readonly exceptions: readonly LiteralException[];
}

// ── Qué se revisa, por propiedad (research §5) ────────────────────────────────────────────────────

const SIDES = '(-(top|right|bottom|left|block|inline)(-(start|end))?)?';
const CATEGORIES: readonly (readonly [RegExp, LiteralCategory])[] = [
  [new RegExp(`^(color|background|background-color|border${SIDES}-color|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule-color)$`), 'color'],
  [/^(font|font-size|font-weight|line-height|letter-spacing)$/, 'type'],
  [new RegExp(`^((margin|padding)${SIDES}|gap|row-gap|column-gap|inset(-(block|inline)(-(start|end))?)?|top|right|bottom|left)$`), 'space'],
  [/^border(-(top|bottom)-(left|right)|-(start|end)-(start|end))?-radius$/, 'radius'],
  [/^box-shadow$/, 'elevation'],
  [new RegExp(`^(border${SIDES}(-width)?|outline|outline-width|outline-offset)$`), 'border'],
];

function categoryOf(prop: string): LiteralCategory | undefined {
  if (prop.startsWith('--')) return 'any';
  return CATEGORIES.find(([pattern]) => pattern.test(prop))?.[1];
}

/** El catálogo mismo no se revisa: es donde viven los valores (data-model.md). */
const CATALOG = ['apps/admin/src/styles/_palette.scss', 'apps/admin/src/styles/_tokens.scss'];
/** El único archivo que puede usar `--mat-sys-*` y la paleta: data-model.md, I2 del análisis. */
const THEME = /(^|\/)styles\/_theme\.scss$/;

// ── Literales de un valor ─────────────────────────────────────────────────────────────────────────

type LiteralKind = 'color' | 'length' | 'number' | 'percentage' | 'zero' | 'keyword';
interface Literal {
  readonly text: string;
  readonly kind: LiteralKind;
}

const KEYWORDS = new Set(['auto', 'inherit', 'initial', 'unset', 'revert', 'none', 'transparent', 'currentcolor']);
const NAMED_COLORS = new Set(['white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'yellow', 'orange', 'purple', 'pink', 'silver', 'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'fuchsia']);
const UNITS = 'px|rem|em|vh|vw|vmin|vmax|ch|ex|pt|cm|mm|in|pc|q|lh|rlh';

/** Quita cada `función(…)` con sus paréntesis anidados, y devuelve lo que quedó. */
function stripCalls(value: string, name: RegExp, onCall: (call: string) => void): string {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const match = name.exec(value.slice(i));
    if (!match || match.index === undefined) return out + value.slice(i);
    const start = i + match.index;
    let depth = 0;
    let end = start + match[0].length - 1;
    for (; end < value.length; end++) {
      if (value[end] === '(') depth++;
      else if (value[end] === ')' && --depth === 0) break;
    }
    onCall(value.slice(start, end + 1));
    out += value.slice(i, start) + ' ';
    i = end + 1;
  }
  return out;
}

function literalsIn(value: string, category: LiteralCategory): Literal[] {
  const found: Literal[] = [];
  let rest = value.replace(/!important/gi, '');
  rest = stripCalls(rest, /\bvar\(/, () => undefined);
  rest = stripCalls(rest, /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i, (call) => found.push({ text: call, kind: 'color' }));
  // Dentro de calc(), un número sin unidad es un factor (`-1 * var(--ds-space-3)`), no un valor.
  const unitlessCounts = category === 'type' && !/calc\(/.test(rest);
  for (const word of rest.split(/[\s,/()*+]+/).filter(Boolean)) {
    const lower = word.toLowerCase();
    if (lower === 'calc') continue;
    if (/^#[0-9a-f]{3,8}$/i.test(word)) found.push({ text: word, kind: 'color' });
    else if (NAMED_COLORS.has(lower)) found.push({ text: word, kind: 'color' });
    else if (KEYWORDS.has(lower)) found.push({ text: word, kind: 'keyword' });
    else if (/^-?[\d.]+%$/.test(word)) found.push({ text: word, kind: 'percentage' });
    else if (new RegExp(`^-?[\\d.]+(${UNITS})$`, 'i').test(word)) found.push({ text: word, kind: Number.parseFloat(word) === 0 ? 'zero' : 'length' });
    else if (/^-?[\d.]+$/.test(word)) {
      if (Number.parseFloat(word) === 0) found.push({ text: word, kind: 'zero' });
      else if (unitlessCounts) found.push({ text: word, kind: 'number' });
    }
  }
  return found;
}

// ── Excepciones ───────────────────────────────────────────────────────────────────────────────────

function inScope(exception: LiteralException, file: string): boolean {
  return exception.scope === 'everywhere' || exception.scope.files.includes(file);
}

function excepted(literal: Literal, category: LiteralCategory, file: string, exceptions: readonly LiteralException[], used: Set<LiteralException>): boolean {
  const match = exceptions.find((exception) => {
    if (!inScope(exception, file)) return false;
    if (exception.category !== 'any' && category !== 'any' && exception.category !== category) return false;
    if (exception.value === '*') return true;
    if (exception.value === '<percentage>') return literal.kind === 'percentage';
    if (exception.value === '0') return literal.kind === 'zero';
    return exception.value.toLowerCase() === literal.text.toLowerCase();
  });
  if (match) used.add(match);
  return match !== undefined;
}

function exceptionProblems(exceptions: readonly LiteralException[], files: readonly string[]): string[] {
  const problems: string[] = [];
  for (const exception of exceptions) {
    if (exception.reason.trim() === '') problems.push(`La excepción "${exception.value}" (${exception.category}) no dice por qué existe`);
    if (exception.scope !== 'everywhere') {
      const dead = exception.scope.files.filter((file) => !files.includes(file));
      if (dead.length > 0) problems.push(`La excepción "${exception.value}" (${exception.category}) no coincide con ningún archivo: ${dead.join(', ')}`);
    }
  }
  return problems;
}

// ── El token sugerido: invertir el catálogo compilado ─────────────────────────────────────────────

function pixels(text: string): number {
  const amount = Number.parseFloat(text);
  return /rem$/i.test(text) ? amount * 16 : amount;
}

function nearest(candidates: readonly { name: string; distance: number }[]): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const candidate of candidates) if (!best || candidate.distance < best.distance) best = candidate;
  return best?.name;
}

/** Los tokens de una familia que no son alias de otro: se sugiere el original. */
function family(tokens: CompiledTokens, pattern: RegExp): string[] {
  return tokens.names().filter((name) => pattern.test(name) && !tokens.declared(name)?.startsWith('var('));
}

function colorFamily(prop: string): RegExp {
  if (/^background/.test(prop)) return /^--ds-(surface|action|primary|status)-?/;
  if (/border|outline/.test(prop)) return /^--ds-(border|focus|primary|status)-?/;
  return /^--ds-(text|status|on|primary)(-|$)/;
}

function suggest(tokens: CompiledTokens, prop: string, category: LiteralCategory, literal: Literal): string {
  // En una sombra, el color es parte de la elevación: se sugiere el nivel, no un color.
  if (category === 'elevation') return '--ds-elevation-card';
  if (literal.kind === 'color') {
    let target: ReturnType<typeof parseColor>;
    try {
      target = parseColor(literal.text);
    } catch {
      return family(tokens, colorFamily(prop))[0] ?? '--ds-text-primary';
    }
    const candidates = family(tokens, colorFamily(prop)).flatMap((name) => {
      if (name.endsWith('-container') && !/^background/.test(prop)) return [];
      try {
        const color = parseColor(tokens.value(name, 'light'));
        return color.a < 1 ? [] : [{ name, distance: Math.hypot(color.r - target.r, color.g - target.g, color.b - target.b) }];
      } catch {
        return [];
      }
    });
    return nearest(candidates) ?? '--ds-text-primary';
  }
  const scale = (pattern: RegExp) =>
    nearest(
      family(tokens, pattern).flatMap((name) => {
        const value = tokens.value(name, 'light');
        return /^-?[\d.]/.test(value) ? [{ name, distance: Math.abs(pixels(value) - Math.abs(pixels(literal.text))) }] : [];
      }),
    );
  const byProp: Readonly<Record<string, RegExp>> = {
    'font-size': /^--ds-type-.*-size$/,
    'font-weight': /^--ds-type-.*-weight$/,
    'line-height': /^--ds-type-.*-line-height$/,
    'letter-spacing': /^--ds-type-.*-tracking$/,
    'outline-offset': /^--ds-focus-ring-offset$/,
    outline: /^--ds-(focus-ring-width|border-width)/,
    'outline-width': /^--ds-(focus-ring-width|border-width)/,
  };
  if (prop === 'font') return '--ds-type-body';
  const pattern =
    byProp[prop] ??
    ({ space: /^--ds-space-/, radius: /^--ds-radius-(sm|md|lg)$/, border: /^--ds-border-width/, any: /^--ds-space-/ } as Partial<Record<LiteralCategory, RegExp>>)[category];
  return (pattern && scale(pattern)) ?? '--ds-space-2';
}

// ── Fuentes de estilos: .scss, estilos y plantillas de .ts, plantillas .html e index.html ──────────

export interface StyleSource {
  /** El CSS o SCSS a revisar. */
  readonly css: string;
  readonly syntax: 'scss' | 'css';
  /** Línea y columna (desde 1) donde empieza `css` dentro del archivo. */
  readonly line: number;
  readonly column: number;
}

interface InlineDecl {
  readonly prop: string;
  readonly value: string;
  readonly line: number;
  readonly column: number;
}

function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

/** Los `style="…"` estáticos de una plantilla, como declaraciones con su posición en el archivo. */
function templateStyles(fileText: string, templateStart: number, template: string): InlineDecl[] {
  const decls: InlineDecl[] = [];
  for (const match of template.matchAll(/\sstyle="([^"]*)"/g)) {
    let offset = templateStart + (match.index ?? 0) + match[0].indexOf('"') + 1;
    for (const part of (match[1] ?? '').split(';')) {
      const colon = part.indexOf(':');
      const lead = part.length - part.trimStart().length;
      if (colon > 0) {
        const at = position(fileText, offset + lead);
        decls.push({ prop: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim(), ...at });
      }
      offset += part.length + 1;
    }
  }
  return decls;
}

/** Los `styles` y el `template` de cada `@Component` de un .ts, leídos con la API de TypeScript. */
function componentSources(fileText: string, fileName: string): { styles: StyleSource[]; decls: InlineDecl[] } {
  const source = ts.createSourceFile(fileName, fileText, ts.ScriptTarget.Latest, true);
  const styles: StyleSource[] = [];
  const decls: InlineDecl[] = [];
  const literalText = (node: ts.Node): { text: string; start: number } | undefined =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? { text: node.text, start: node.getStart(source) + 1 } : undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'Component') {
      const config = node.expression.arguments[0];
      if (config && ts.isObjectLiteralExpression(config)) {
        for (const property of config.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = property.name.getText(source);
          const items = ts.isArrayLiteralExpression(property.initializer) ? [...property.initializer.elements] : [property.initializer];
          for (const item of items) {
            const literal = literalText(item);
            if (!literal) continue;
            if (key === 'styles') styles.push({ css: literal.text, syntax: 'scss', ...position(fileText, literal.start) });
            if (key === 'template') decls.push(...templateStyles(fileText, literal.start, literal.text));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { styles, decls };
}

export function sourcesOf(file: string, text: string): { styles: StyleSource[]; decls: InlineDecl[] } {
  if (file.endsWith('.scss')) return { styles: [{ css: text, syntax: 'scss', line: 1, column: 1 }], decls: [] };
  if (file.endsWith('.ts')) return componentSources(text, file);
  if (file.endsWith('index.html')) {
    const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({
      css: match[1] ?? '',
      syntax: 'css' as const,
      ...position(text, (match.index ?? 0) + match[0].indexOf('>') + 1),
    }));
    return { styles, decls: [] };
  }
  if (file.endsWith('.html')) return { styles: [], decls: templateStyles(text, 0, text) };
  return { styles: [], decls: [] };
}

/** Los espacios de nombres de `@use` que apuntan a la paleta (`@use 'palette' as p` → `p`). */
function paletteNamespaces(root: Root): Set<string> {
  const namespaces = new Set<string>();
  root.walkAtRules('use', (rule) => {
    const match = /['"]([^'"]+)['"](?:\s+as\s+([\w-]+))?/.exec(rule.params);
    if (!match?.[1]) return;
    const path = match[1];
    if (!/(^|\/)_?palette$/.test(path)) return;
    namespaces.add(match[2] ?? path.split('/').pop()?.replace(/^_/, '') ?? 'palette');
  });
  return namespaces;
}

// ── El verificador ────────────────────────────────────────────────────────────────────────────────

export function checkLiterals(input: LiteralsInput): LiteralsResult {
  const findings: LiteralFinding[] = [];
  const used = new Set<LiteralException>();
  const report = (file: string, line: number, column: number, prop: string, value: string, hint: string) =>
    findings.push({ file, line, column, message: `${file}:${line}:${column}  ${prop}: ${value.replace(/\s+/g, ' ')}  → ${hint}` });

  for (const file of input.files) {
    if (CATALOG.includes(file)) continue;
    const text = readFileSync(join(input.root, file), 'utf8');
    const isTheme = THEME.test(file);
    const { styles, decls } = sourcesOf(file, text);

    const check = (prop: string, value: string, line: number, column: number, palette: ReadonlySet<string>) => {
      const lower = prop.toLowerCase();
      if (lower.startsWith('$')) return;
      const category = categoryOf(lower);
      if (!category) return;
      if (!isTheme && /var\(\s*--mat-sys-/.test(value)) return report(file, line, column, prop, value, 'usa un --ds-*; los --mat-sys-* solo en _theme.scss');
      for (const match of value.matchAll(/(?:([\w-]+)\.)?\$[\w-]+/g)) {
        const fromPalette = isTheme && match[1] !== undefined && palette.has(match[1]);
        if (!fromPalette) return report(file, line, column, prop, value, 'una variable Sass que no viene de la paleta');
      }
      const valueWithoutSass = value.replace(/(?:[\w-]+\.)?\$[\w-]+/g, ' ');
      // Todos los literales, no solo hasta el primero que no está exceptuado: así se sabe qué excepción se usa.
      const offending = literalsIn(valueWithoutSass, category).filter((literal) => !excepted(literal, category, file, input.exceptions, used))[0];
      if (offending) report(file, line, column, prop, value, `usa var(${suggest(input.tokens, lower, category, offending)})`);
    };

    for (const source of styles) {
      const root = source.syntax === 'scss' ? parseScss(source.css) : postcss.parse(source.css);
      const palette = paletteNamespaces(root);
      root.walkDecls((decl) => {
        const start = decl.source?.start;
        if (!start) return;
        const line = source.line + start.line - 1;
        const column = start.line === 1 ? source.column + start.column - 1 : start.column;
        check(decl.prop, decl.value, line, column, palette);
      });
    }
    for (const decl of decls) check(decl.prop, decl.value, decl.line, decl.column, new Set());
  }

  return {
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column),
    problems: exceptionProblems(input.exceptions, input.files),
    unused: input.exceptions.filter((exception) => !used.has(exception)).map((exception) => `La excepción "${exception.value}" (${exception.category}) no excusa ningún valor del panel`),
  };
}

/** Lo que revisa la compuerta: los estilos del panel y de `libs/ui`, sin pruebas ni configuración. */
export function panelFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir))) {
      const path = `${dir}/${entry}`;
      if (statSync(join(root, path)).isDirectory()) {
        if (!['environments', 'testing', 'vendor'].includes(entry)) walk(path);
      } else if (/\.(scss|html)$/.test(entry) || (entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))) files.push(path);
    }
  };
  for (const dir of ['apps/admin/src', 'libs/ui/src']) if (existsSync(join(root, dir))) walk(dir);
  return files.sort();
}

// ── Uso desde la línea de comandos: el `lint` del panel ───────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const result = checkLiterals({ root, files: panelFiles(root), tokens: compileTokens(), exceptions: LITERAL_EXCEPTIONS });
  for (const finding of result.findings) console.log(`✗ ${finding.message}`);
  for (const problem of [...result.problems, ...result.unused]) console.log(`✗ ${problem}`);
  console.log(`\n${result.findings.length} valores fuera del catálogo. Excepciones: ${relative(root, fileURLToPath(new URL('./literal-exceptions.ts', import.meta.url)))}`);
  process.exitCode = result.findings.length > 0 || result.problems.length > 0 || result.unused.length > 0 ? 1 : 0;
}
