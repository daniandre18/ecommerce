import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { LEXICON, USTED_EXCEPTIONS } from './language-exceptions';

/**
 * La compuerta de lenguaje (FR-038, FR-039, SC-008, research §7): el texto que el panel muestra o anuncia,
 * en tuteo neutro. Recorre las cadenas y plantillas de TypeScript (con su API: los comentarios quedan fuera
 * por construcción), el texto de los `.html` sin sus comentarios y, en el servidor, solo los mensajes de
 * `BusinessRuleError` y `HttpsError` (research §12).
 */

/** Una palabra con forma de voseo que es correcta en tuteo neutro (data-model.md). */
export interface ReviewedWord {
  readonly word: string;
  readonly reason: string;
}

/** Un texto exacto que contiene un imperativo de la lista cerrada y no es usted (data-model.md). */
export interface UstedException {
  readonly text: string;
  readonly reason: string;
}

export type LanguageKind = 'voseo' | 'revisar' | 'usted' | 'excepción muerta';

export interface LanguageFinding {
  readonly kind: LanguageKind;
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly word: string;
  readonly message: string;
}

export interface LanguageInput {
  readonly root: string;
  /** Archivos del panel: todo su texto. */
  readonly files: readonly string[];
  /** Archivos del servidor: solo los mensajes de error. */
  readonly serverFiles: readonly string[];
  readonly lexicon: readonly ReviewedWord[];
  readonly ustedExceptions: readonly UstedException[];
}

/** Presentes e imperativos de vos que no se confunden con nada correcto (research §7, regla 1). */
const KNOWN_VOS = new Set([
  'tenés', 'querés', 'podés', 'sabés', 'sos', 'hacés', 'decís', 'venís', 'salís', 'ponés', 'vení', 'decí', 'hacé', 'poné', 'salí', 'tené', 'andá', 'vení', 'pedile', 'decile', 'fijate',
]);

/** FR-039: la lista cerrada de imperativos de usted, como palabra completa. */
export const USTED = ['revise', 'cree', 'ingrese', 'agregue', 'edite', 'guarde', 'elimine', 'defina', 'elija', 'seleccione', 'busque', 'confirme', 'cancele'];

const WORD = /[\p{L}]+/gu;
const VOWELS = /[aeiouáéíóúü]+/g;
const ACCENTED = /[áéíóú]/;

/** Imperativo de vos con pronombre y sin tilde: `revisalos`, `movelas`, `asegurate` (research §7, regla 2). */
function encliticWithoutAccent(word: string): boolean {
  if (ACCENTED.test(word) || word.length < 6) return false;
  const match = /^(.+)(nos|los|las|lo|la|les|le|me|te|se)$/.exec(word);
  if (!match) return false;
  const stem = match[1] as string;
  return stem.length >= 4 && /[^aeiouáéíóúü][aei]$/.test(stem);
}

/** Más de una sílaba terminada en vocal tildada, o un presente en `-ás`, `-és`, `-ís` (research §7, regla 2). */
function morphological(word: string): boolean {
  // La u muda de "que", "qui", "gue", "gui" no es sílaba; una vocal tildada junto a otra es hiato, y cuenta
  // como sílaba aparte ("cre-á"). Sin eso, "creá" parecía de una sílaba y no era candidata.
  const groups = word.replace(/([qg])u(?=[eéií])/g, '$1').match(VOWELS) ?? [];
  const syllables = groups.reduce((count, group) => count + (group.length > 1 && ACCENTED.test(group) ? 2 : 1), 0);
  return (syllables > 1 && /[áéí]$/.test(word)) || /(?:ás|és|ís)$/.test(word);
}

interface Text {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

const lineOf = (source: ts.SourceFile, position: number) => source.getLineAndCharacterOfPosition(position).line + 1;
/** Un identificador de código, no un texto: `rename`, `catalog.write`, `already-member`, `displayName`. */
const IDENTIFIER = /^(?:[a-z0-9_.:/#@-]*|[a-z]+(?:[A-Z][a-z0-9]*)+)$/;
/** Borra un tramo conservando sus saltos de línea: los números de línea siguen siendo los del archivo. */
const blank = (text: string) => text.replace(/[^\n]/g, ' ');
const withoutHtmlComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, blank);
/** Las cadenas entre comillas de una expresión de Angular: lo único de ella que puede llegar a la pantalla. */
const quoted = (expression: string) =>
  [...expression.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((match) => match[1] ?? match[2] ?? '')
    .filter((piece) => !IDENTIFIER.test(piece.trim()))
    .join(' ');
/** Atributos que se leen o se anuncian, y entradas de los estados compartidos (`heading`, `message`). */
const VISIBLE_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'placeholder', 'title', 'alt', 'label', 'heading', 'message']);

/**
 * De una plantilla, lo que la persona ve o escucha: el texto entre etiquetas, los atributos visibles y
 * las cadenas de las expresiones y de las interpolaciones. Nombres de atributo, enlaces de datos y bloques
 * de control (`@if (…)`) son código. Cada tramo conserva sus saltos de línea.
 */
export function visibleTemplateText(template: string): string {
  return withoutHtmlComments(template)
    .replace(/\{\{([\s\S]*?)\}\}/g, (match, expression: string) => quoted(expression).padEnd(match.length - (match.match(/\n/g) ?? []).length) + '\n'.repeat((match.match(/\n/g) ?? []).length))
    .replace(/@(?:if|else if|for|switch|case|let|defer)\b[^{\n]*/g, blank)
    .replace(/<\/?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/g, (tag) => {
      const kept: string[] = [];
      for (const attribute of tag.matchAll(/([[(*#@]?[\w.\-:[\]()]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
        const [name, raw] = [attribute[1] as string, (attribute[2] as string).slice(1, -1)];
        if (/^[[(*]/.test(name)) kept.push(quoted(raw));
        else if (VISIBLE_ATTRIBUTES.has(name)) kept.push(raw);
      }
      const lines = (tag.match(/\n/g) ?? []).length;
      return ` ${kept.join(' ')} `.padEnd(tag.length - lines) + '\n'.repeat(lines);
    });
}


/** Las cadenas y plantillas de un `.ts`, sin las rutas de import ni los estilos de un componente. */
function typescriptTexts(file: string, content: string, onlyErrors: boolean): Text[] {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const texts: Text[] = [];
  const add = (node: ts.Node, text: string) => {
    if (IDENTIFIER.test(text.trim())) return;
    const clean = /<[a-zA-Z!]/.test(text) ? visibleTemplateText(text) : text;
    // Una plantilla de varias líneas se revisa línea por línea, con su número real.
    clean.split('\n').forEach((line, index) => {
      if (line.trim()) texts.push({ file, line: lineOf(source, node.getStart(source)) + index, text: line });
    });
  };
  const isStyles = (node: ts.Node) => ts.isPropertyAssignment(node.parent) && ['styles', 'selector', 'templateUrl', 'styleUrl', 'styleUrls'].includes(node.parent.name.getText(source));
  const errorClass = (node: ts.Node): boolean => {
    for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
      if (ts.isNewExpression(current)) return ['BusinessRuleError', 'HttpsError'].includes(current.expression.getText(source));
      if (ts.isStatement(current)) return false;
    }
    return false;
  };
  // Un mensaje de error puede llegar por una constante del mismo archivo (`throw new HttpsError(code, DENIED)`).
  const constants = new Map<string, ts.StringLiteral | ts.NoSubstitutionTemplateLiteral>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
      constants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  };
  if (onlyErrors) collect(source);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (onlyErrors && ts.isNewExpression(node) && ['BusinessRuleError', 'HttpsError'].includes(node.expression.getText(source))) {
      for (const argument of node.arguments ?? []) {
        const constant = ts.isIdentifier(argument) ? constants.get(argument.text) : undefined;
        if (constant) add(constant, constant.text);
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isStyles(node) && (!onlyErrors || errorClass(node))) add(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      if (!isStyles(node) && (!onlyErrors || errorClass(node))) {
        add(node.head, node.head.text);
        for (const span of node.templateSpans) add(span.literal, span.literal.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return texts;
}

function htmlTexts(file: string, content: string): Text[] {
  return visibleTemplateText(content)
    .split('\n')
    .map((text, index) => ({ file, line: index + 1, text }))
    .filter((entry) => entry.text.trim());
}

/** Revisa los textos y devuelve los hallazgos, ordenados por archivo y línea. */
export function checkLanguage(input: LanguageInput): LanguageFinding[] {
  const texts: Text[] = [];
  for (const [files, onlyErrors] of [[input.files, false], [input.serverFiles, true]] as const) {
    for (const file of files) {
      const content = readFileSync(join(input.root, file), 'utf8');
      texts.push(...(file.endsWith('.html') ? htmlTexts(file, content) : typescriptTexts(file, content, onlyErrors)));
    }
  }

  const lexicon = new Set(input.lexicon.map((entry) => entry.word.toLowerCase()));
  const findings: LanguageFinding[] = [];
  const shown = (text: string) => text.trim().replace(/\s+/g, ' ');
  const report = (kind: LanguageKind, text: Text, word: string, why?: string) =>
    findings.push({ kind, file: text.file, line: text.line, text: shown(text.text), word, message: `${kind}  ${text.file}:${text.line}  «${shown(text.text)}»  (${word}${why ? `: ${why}` : ''})` });

  for (const text of texts) {
    const exempt = input.ustedExceptions.some((exception) => text.text.includes(exception.text));
    for (const match of text.text.matchAll(WORD)) {
      const word = match[0].toLowerCase();
      // Las listas exactas van antes que las reglas por forma: "revise" es usted, aunque parezca un
      // imperativo de vos con "se" (`revi` + `se`).
      if (KNOWN_VOS.has(word)) report('voseo', text, word);
      else if (USTED.includes(word)) {
        if (!exempt) report('usted', text, word);
      } else if (lexicon.has(word)) continue;
      else if (encliticWithoutAccent(word)) report('voseo', text, word, 'enclítico sin tilde');
      else if (morphological(word)) report('revisar', text, word, 'palabra no clasificada: ¿voseo o léxico?');
    }
  }

  // Una excepción que no coincide con nada es una puerta abierta que nadie recuerda.
  const words = new Set(texts.flatMap((text) => [...text.text.matchAll(WORD)].map((match) => match[0].toLowerCase())));
  const dead = (value: string) => findings.push({ kind: 'excepción muerta', file: 'language-exceptions.ts', line: 0, text: value, word: value, message: `excepción muerta  language-exceptions.ts  «${value}»  (no aparece en ningún texto)` });
  for (const entry of input.lexicon) if (!words.has(entry.word.toLowerCase())) dead(entry.word);
  for (const entry of input.ustedExceptions) if (!texts.some((text) => text.text.includes(entry.text))) dead(entry.text);
  return findings;
}

/** Los `.ts` (sin pruebas) y `.html` de una carpeta, con rutas desde la raíz del repositorio. */
export function filesIn(root: string, dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(join(root, current))) {
      const path = `${current}/${entry}`;
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (entry.endsWith('.html') || (entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))) files.push(path);
    }
  };
  if (existsSync(join(root, dir))) walk(dir);
  return files.sort();
}

/** Lo que recorre la compuerta en el panel y en el servidor. */
export function panelLanguageFiles(root: string): { files: string[]; serverFiles: string[] } {
  return {
    files: [...filesIn(root, 'apps/admin/src/app'), ...filesIn(root, 'libs/ui/src')],
    serverFiles: [...filesIn(root, 'libs/application/src'), ...filesIn(root, 'apps/functions/src')],
  };
}

// ── Uso desde la línea de comandos: el informe, para clasificar ─────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const findings = checkLanguage({ root, ...panelLanguageFiles(root), lexicon: LEXICON, ustedExceptions: USTED_EXCEPTIONS });
  for (const finding of findings) console.log(`✗ ${finding.message}`);
  console.log(`\n${findings.length} hallazgos. Excepciones: ${relative(root, fileURLToPath(new URL('./language-exceptions.ts', import.meta.url)))}`);
  process.exitCode = findings.length > 0 ? 1 : 0;
}
