// El inventario de pantallas del panel, leído del código (T019 de la 003): lo usa screens.spec.ts para
// verificar que toda pantalla declare su acción principal en primary-actions.ts.

/** Las vistas: `loadComponent: () => import('…').then((m) => m.Componente)`. */
export function routedViews(routes: string): string[] {
  return [...routes.matchAll(/loadComponent:\s*\(\)\s*=>\s*import\([^)]*\)\.then\(\(\w+\)\s*=>\s*\w+\.(\w+)\)/g)].map((match) => match[1] ?? '');
}

/** Los diálogos: el componente de cada `.open(…)`, también con genéricos (`.open<A, B, C>(Componente`). */
export function openedDialogs(source: string): string[] {
  return [...source.matchAll(/\.open(?:<.*?>)?\(\s*([A-Z]\w*)/g)].map((match) => match[1] ?? '');
}

/**
 * Componentes con `loadComponent` que no son pantallas sino marcos: envuelven a otras vistas y no
 * tienen una tarea propia. `TenantShell` es el marco del comercio, la barra de todas sus vistas.
 */
export const FRAMES: readonly string[] = ['TenantShell'];
