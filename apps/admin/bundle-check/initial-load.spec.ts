import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUDGET, compareInitialLoad, measureInitialLoad, type InitialLoad } from './initial-load';

// T009 — FR-034, FR-035: la carga inicial es lo que pide el index.html del build (research §8), medida
// con gzip -9 y comparada con la base al integrar: 0 B más de JS y hasta 10 KB más de CSS.
const BROWSER = fileURLToPath(new URL('./fixtures/browser/', import.meta.url));
const gz = (text: string) => gzipSync(text, { level: 9 }).length;
const file = (name: string) => readFileSync(`${BROWSER}${name}`, 'utf8');

describe('la medida de la carga inicial', () => {
  const load = measureInitialLoad(BROWSER);

  it('cuenta lo que pide el index.html: main, cada modulepreload, la hoja aunque cargue con media="print", y cada <style> en línea', () => {
    expect(load.files.map((entry) => `${entry.kind} ${entry.name}`)).toEqual(['js main-CCCC.js', 'js chunk-BBBB.js', 'css styles-AAAA.css', 'css index.html <style> 1', 'css index.html <style> 2']);
  });

  it('no cuenta dos veces la hoja que repite <noscript>, ni un fragmento que no se pide al inicio', () => {
    expect(load.files.filter((entry) => entry.name === 'styles-AAAA.css')).toHaveLength(1);
    expect(load.files.some((entry) => entry.name === 'chunk-LAZY.js')).toBe(false);
  });

  it('mide cada archivo con gzip nivel 9', () => {
    expect(load.js).toBe(gz(file('main-CCCC.js')) + gz(file('chunk-BBBB.js')));
    expect(load.css).toBe(gz(file('styles-AAAA.css')) + gz('.boot{padding:16px}') + gz(':root{--ds-space-4:16px}'));
  });

  it('el nivel es el 9, no el de omisión: con un archivo grande, los dos dan tamaños distintos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'initial-load-'));
    let code = '';
    for (let i = 0; i < 4000; i++) code += `export const v${i} = ${(i * 7919) % 1000} + ${(i * 104729) % 977};\n`;
    writeFileSync(join(dir, 'main.js'), code);
    writeFileSync(join(dir, 'index.html'), '<script src="main.js" type="module"></script>');
    // Sin esta guarda, la prueba podría pasar con cualquier nivel.
    expect(gzipSync(code).length).not.toBe(gz(code));
    expect(measureInitialLoad(dir).js).toBe(gz(code));
  });
});

describe('la comparación con la base', () => {
  const base: InitialLoad = { js: 1000, css: 2000, files: [] };
  const head = (js: number, css: number): InitialLoad => ({ js, css, files: [] });

  it('el presupuesto es el de FR-034', () => {
    expect(BUDGET).toEqual({ js: 0, css: 10_240 });
  });

  it('acepta JS igual o menor, y CSS hasta 10.240 B más', () => {
    expect(compareInitialLoad(base, head(1000, 2000 + 10_240))).toEqual([]);
    expect(compareInitialLoad(base, head(880, 2000))).toEqual([]);
  });

  it('rechaza un solo byte más de JS', () => {
    expect(compareInitialLoad(base, head(1001, 2000))).toEqual(['JS inicial: creció 1 B y el máximo es +0 B (FR-034)']);
  });

  it('rechaza CSS por encima de 10.240 B más', () => {
    expect(compareInitialLoad(base, head(1000, 2000 + 10_241))).toEqual(['CSS inicial: creció 10.241 B y el máximo es +10.240 B (FR-034)']);
  });
});
