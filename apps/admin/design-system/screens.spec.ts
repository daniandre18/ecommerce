import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRIMARY_ACTIONS } from './primary-actions';
import { FRAMES, openedDialogs, routedViews } from './screens';

// T019 — FR-008, SC-004: toda pantalla del panel declara su acción principal (contracts/primary-actions.md).
// El inventario sale del código: cada ruta con loadComponent es una vista, y cada componente que se abre
// con MatDialog.open es un diálogo. Una pantalla nueva sin declarar hace fallar la prueba.
const APP = fileURLToPath(new URL('../src/app/', import.meta.url));
const DESIGN_E2E = fileURLToPath(new URL('../../admin-e2e/src/design-system.spec.ts', import.meta.url));

/** Los títulos `pantalla: <screen>` de las pruebas y grupos de un archivo de Playwright. */
export function screenCases(source: string): string[] {
  return [...source.matchAll(/(?:test|test\.describe)\(\s*(['"`])pantalla: (.+?)\1/g)].map((match) => match[2] as string);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('el inventario de pantallas', () => {
  it('encuentra vistas y diálogos, también los genéricos anidados', () => {
    expect(routedViews(`{ path: 'a', loadComponent: () => import('./a').then((m) => m.Alpha) }`)).toEqual(['Alpha']);
    expect(openedDialogs(`dialog.open<InstanceType<typeof Beta>, Data, boolean>(Beta, { data })`)).toEqual(['Beta']);
    expect(openedDialogs(`this.snackBar.open('Guardado', undefined)`)).toEqual([]);
  });
});

describe('las acciones principales declaradas', () => {
  const views = routedViews(readFileSync(join(APP, 'app.routes.ts'), 'utf8')).filter((view) => !FRAMES.includes(view));
  const dialogs = [...new Set(sources(APP).flatMap((file) => openedDialogs(readFileSync(file, 'utf8'))))];
  const declared = (kind: 'view' | 'dialog') => PRIMARY_ACTIONS.filter((entry) => entry.kind === kind).map((entry) => entry.component);

  it('cubren las 10 vistas y los 5 diálogos del panel, ni una más ni una menos', () => {
    expect(views).toHaveLength(10);
    expect(dialogs).toHaveLength(5);
    expect(declared('view').sort()).toEqual([...views].sort());
    expect(declared('dialog').sort()).toEqual([...dialogs].sort());
  });

  it('una acción principal nunca es también destructiva', () => {
    for (const entry of PRIMARY_ACTIONS) if (entry.action) expect(entry.destructive).not.toContain(entry.action);
  });
});

// T035 (G1 del análisis): el "100 % de las pantallas" de SC-004 lo hace cumplir una compuerta, no la
// disciplina. Cada pantalla declarada tiene su caso en design-system.spec.ts, titulado con su nombre.
describe('los casos del sistema de diseño', () => {
  it('lee los títulos de las pruebas y de los grupos', () => {
    expect(screenCases(`test('pantalla: rol', () => {}); test.describe('pantalla: catálogo', () => {}); test('otra cosa', () => {})`)).toEqual(['rol', 'catálogo']);
  });

  it('cada pantalla de primary-actions.ts tiene su caso «pantalla: <screen>»', () => {
    const cases = new Set(screenCases(readFileSync(DESIGN_E2E, 'utf8')));
    expect(PRIMARY_ACTIONS.map((entry) => entry.screen).filter((screen) => !cases.has(screen))).toEqual([]);
  });
});
