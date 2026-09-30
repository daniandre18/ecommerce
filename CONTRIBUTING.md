# Cómo contribuir

## Convenciones de nombres

- **Identificadores en inglés**: tipos, funciones, variables, archivos y rutas (`Variant`,
  `reconcileVariants`, `reconcile-variants.ts`).
- **Español para las personas**: documentación, comentarios, descripciones de pruebas y mensajes
  que ve el usuario.
- **Un concepto, un nombre, en todas las capas**: cada caso de uso lleva el nombre de su callable
  (`SetVariantPrice` ↔ `setVariantPrice`).
- Componentes de Angular sin el sufijo `Component` (`ErrorState`, no `ErrorStateComponent`).

## Flujo de trabajo

`main` está protegida: no acepta pushes directos, tampoco de administradores. Todo cambio entra por
pull request, y solo se puede fusionar cuando pasan las cinco compuertas de CI y la rama está al día
con `main`.

```bash
git switch -c feat/lo-que-sea
# … commits …
git push -u origin feat/lo-que-sea
gh pr create --fill
```

Los commits de **refactor** (sin cambio de comportamiento) van separados de los de **funcionalidad**
y de los de **corrección**, con prefijo `refactor:`, `feat:` o `fix:`.

## Compuertas (principio X de la constitución)

| Compuerta | Comando local |
|---|---|
| `lint` | `npx nx run-many -t lint` |
| `typecheck` | `npx nx run-many -t typecheck` |
| `unit` | `npx nx run-many -t test` |
| `rules` | `firebase emulators:exec --only firestore --project demo-ecommerce "npm run test:rules"` |
| `integration` | `firebase emulators:exec --only auth,firestore --project demo-ecommerce "npm run test:infrastructure && npm run test:tools"` |

Dos trampas conocidas:

- **El lint tiene que correr a través de Nx.** Invocado como `eslint` directo, sin el grafo de
  proyectos, la regla de frontera entre capas se saltea en silencio y sale con código 0.
- **Vitest no revisa tipos.** Por eso `typecheck` es una compuerta aparte.

## Datos de prueba

Con los emuladores corriendo, `npx nx run tools:seed` crea las cuentas y los comercios de
`specs/001-catalog-rbac/quickstart.md`. El sembrador se niega a correr contra un proyecto que no sea
`demo-*`.
