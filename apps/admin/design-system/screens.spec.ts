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
