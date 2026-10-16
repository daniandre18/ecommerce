import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** FR-034: respecto de la base, 0 B más de JavaScript y hasta 10 KB comprimidos más de estilos. */
export const BUDGET = { js: 0, css: 10_240 } as const;

export interface InitialFile {
  readonly kind: 'js' | 'css';
  readonly name: string;
  /** Con gzip nivel 9. */
  readonly bytes: number;
}

export interface InitialLoad {
  readonly js: number;
  readonly css: number;
  readonly files: readonly InitialFile[];
}

const gzipped = (content: string | Buffer) => gzipSync(content, { level: 9 }).length;

/**
 * Lo que el `index.html` del build pide al cargar (research §8): el `<script>` de `main`, cada
 * `modulepreload`, cada hoja —también la que beasties carga con `media="print"`— y cada `<style>` en
 * línea, que incluye el CSS crítico y la estructura de arranque. Se lee del HTML y no del metafile: el
 * HTML es la definición de "inicial", aunque Angular cambie cómo parte los fragmentos.
 */
export function measureInitialLoad(browserDir: string): InitialLoad {
  const page = readFileSync(join(browserDir, 'index.html'), 'utf8');
  const files: InitialFile[] = [];
  // El `<noscript>` de beasties repite la hoja: se cuenta una vez.
  const seen = new Set<string>();
  const add = (kind: InitialFile['kind'], name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    files.push({ kind, name, bytes: gzipped(readFileSync(join(browserDir, name))) });
  };

  for (const [, src] of page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) if (src) add('js', src);
  for (const [tag] of page.matchAll(/<link\b[^>]*>/g)) {
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1];
    if (!href) continue;
    if (/\brel="modulepreload"/.test(tag)) add('js', href);
    else if (/\brel="stylesheet"/.test(tag)) add('css', href);
  }
  let inline = 0;
  for (const [, css] of page.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    files.push({ kind: 'css', name: `index.html <style> ${++inline}`, bytes: gzipped(css ?? '') });
  }

  // El orden de lectura: los scripts, después las hojas, después lo que está en línea.
  files.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'js' ? -1 : 1));
  const total = (kind: InitialFile['kind']) => files.filter((file) => file.kind === kind).reduce((sum, file) => sum + file.bytes, 0);
  return { js: total('js'), css: total('css'), files };
}

const bytes = (value: number) => `${value.toLocaleString('es-CO')} B`;

/** Lo que excede el presupuesto de FR-034; vacío si la rama está dentro. */
export function compareInitialLoad(base: InitialLoad, head: InitialLoad): string[] {
  const problems: string[] = [];
  const js = head.js - base.js;
  const css = head.css - base.css;
  if (js > BUDGET.js) problems.push(`JS inicial: creció ${bytes(js)} y el máximo es +${bytes(BUDGET.js)} (FR-034)`);
  if (css > BUDGET.css) problems.push(`CSS inicial: creció ${bytes(css)} y el máximo es +${bytes(BUDGET.css)} (FR-034)`);
  return problems;
}

/** La tabla de `contracts/gates.md`, con los archivos de cada lado para que un crecimiento se explique solo. */
export function describeComparison(base: InitialLoad, head: InitialLoad): string {
  const row = (label: string, from: number, to: number, max: number) => {
    const delta = to - from;
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
    return `${label}  base ${bytes(from).padStart(10)}  rama ${bytes(to).padStart(10)}  Δ ${sign}${bytes(Math.abs(delta))} (máx. +${bytes(max)})  ${delta <= max ? '✓' : '✗'}`;
  };
  const list = (load: InitialLoad) => load.files.map((file) => `    ${file.kind} ${file.name} ${bytes(file.bytes)}`).join('\n');
  return [row('JS inicial ', base.js, head.js, BUDGET.js), row('CSS inicial', base.css, head.css, BUDGET.css), '  base:', list(base), '  rama:', list(head)].join('\n');
}
