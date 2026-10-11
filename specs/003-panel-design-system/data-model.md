# Data Model: Sistema de Diseño del Panel

**Feature**: 003-panel-design-system · **Fase**: 1

Esta feature no toca Firestore, el dominio ni las callables. Sus "datos" son el catálogo de tokens y
cuatro listas declaradas que leen las compuertas. Todo vive en el repositorio y se versiona con el
código. Mecanismo y razones: [research.md](./research.md). Nombres concretos de cada token:
[contracts/tokens.md](./contracts/tokens.md).

## Dónde vive cada cosa

```text
apps/admin/src/styles/            ← catálogo (FR-001): lo único que define valores
├── _palette.scss                 valores crudos, variables Sass; no llegan al CSS por su nombre
├── _tokens.scss                  papeles --ds-* en :root, con light-dark() por esquema
├── _theme.scss                   mat.theme + mat.theme-overrides → los --mat-sys-* apuntan a --ds-*
├── _components.scss              tratamientos (mat.*-overrides y clases ds-*)
└── _shell.scss                   estilos del componente raíz, fuera del JS inicial (research §3)

apps/admin/design-system/         ← declaraciones y compuertas (no llegan al navegador)
├── contrast-pairs.ts             Par de contraste[]                       FR-029
├── literal-exceptions.ts         Excepción de valor literal[]             FR-004
├── language-exceptions.ts        Léxico revisado[] + Excepción de usted[] FR-038, FR-039
├── primary-actions.ts            Acción principal declarada[]             FR-008, SC-004
└── typography-levels.ts          orden de los niveles tipográficos       FR-015
```

## Token de diseño

Un valor con nombre de papel. Vive en `_tokens.scss` como propiedad CSS.

| Campo | Regla |
|---|---|
| `name` | `--ds-{categoría}-{papel}[-{variante}]`, en inglés y en kebab-case. El papel nunca nombra un tono ni un valor (FR-003): `--ds-text-secondary` sí, `--ds-grey-600` no |
| `category` | `color` · `type` · `space` · `radius` · `elevation` · `border` · `density`, derivada del prefijo |
| `value` | En `color` y `elevation`: `light-dark(claro, oscuro)` (FR-002). En el resto, un solo valor para los dos esquemas |
| origen | Comentario de una línea sobre el token: qué decisión de la referencia lo origina, o "propio" |

**Reglas**:

- Un token de papel se define **solo** a partir de `_palette.scss`, de las escalas o de otro token
  de papel. Nunca con un literal.
- Las **escalas** (espaciado, radio, borde, elevación, tipo) son tokens con nombre de paso
  (`--ds-space-1` … `--ds-space-12`). Son la excepción a "papel, no valor": el paso **es** su papel
  dentro del ritmo. FR-018 y FR-012 piden una escala con su progresión declarada.
- Los tokens que las vistas consumen son papeles o pasos de escala. Las variables de
  `_palette.scss` no son alcanzables desde una vista, porque no existen como CSS.

## Par de contraste

Declarado en `contrast-pairs.ts`. Lo verifica `contrast.spec.ts` (research §6).

```ts
interface ContrastPair {
  readonly id: string;                       // 'text-secondary/surface-card'
  readonly foreground: `--ds-${string}`;     // texto, ícono, borde o indicador
  readonly background: `--ds-${string}`;     // uno de los planos, o el fondo de un control
  readonly kind: 'text' | 'large-text' | 'ui';
  readonly state: 'rest' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error' | 'empty';
  readonly plane: 'page' | 'card' | 'bar' | 'overlay' | 'control';
  readonly declared: { readonly light: number; readonly dark: number };  // dos decimales
}
```

| Regla | Origen |
|---|---|
| Umbral por `kind`: `text` 4,5; `large-text` 3; `ui` 3 | FR-030 |
| `declared` coincide con la razón calculada, redondeada a 2 decimales, en **los dos** esquemas | FR-031, SC-002 |
| Todo token `--ds-text-*`, `--ds-on-*`, `--ds-icon-*` y `--ds-focus-ring` aparece en al menos un par | research §6 |
| Todo `--ds-text-*` se declara contra los **tres** planos | FR-029 ("cada plano") |
| `--ds-focus-ring` se declara contra los tres planos, el superpuesto y el fondo del acento | FR-023 |
| Un par en `state: 'disabled'` **no** se exige (WCAG lo exime), pero se declara igual, con su razón y `kind: 'ui'`. Así queda a la vista y no se confunde con el error (FR-025) | Edge case |
| Un color con transparencia se compone sobre `background` antes de calcular | research §6 |

## Excepción de valor literal

Declarada en `literal-exceptions.ts`. La lee el verificador de literales (research §5).

```ts
interface LiteralException {
  readonly value: string;          // '0', '100%', '1px', 'currentColor'…
  readonly category: 'color' | 'type' | 'space' | 'radius' | 'elevation' | 'border' | 'any';
  readonly scope: 'everywhere' | { readonly files: readonly string[] };  // patrones glob
  readonly reason: string;         // obligatoria y no vacía
}
```

**Excepciones iniciales**: `0`, `auto`, `inherit`, `none`, `transparent`, `currentColor` y
porcentajes, todas con `scope: 'everywhere'`. `index-boot` cubre los literales de `index.html`,
con `scope: { files: ['apps/admin/src/index.html'] }` y verificados contra los tokens (research
§4). `_palette.scss` y `_tokens.scss` no se revisan, porque **son** el catálogo. `_theme.scss` se
revisa con una sola concesión: puede usar variables Sass de `_palette.scss`, que `mat.theme`
necesita para generar sus paletas. Ningún otro archivo puede usarlas.

**Regla**: una excepción sin `reason`, o con un `scope` que no coincide con ningún archivo, hace
fallar la compuerta. Una excepción muerta es una puerta abierta que nadie recuerda.

## Léxico revisado y excepción de usted

Declarados en `language-exceptions.ts`. Los lee la compuerta de lenguaje (research §7).

```ts
/** Palabras que coinciden con un patrón de voseo y son correctas en tuteo neutro. */
interface ReviewedWord {
  readonly word: string;      // 'será', 'está', 'menú'
  readonly reason: string;    // 'futuro de ser', 'presente de estar, igual en tú y vos', 'sustantivo'
}

/** Textos exactos que contienen un imperativo de la lista cerrada y no son usted. */
interface UstedException {
  readonly text: string;      // 'hasta que el servidor confirme'
  readonly reason: string;    // 'subjuntivo en tercera persona'
}
```

**Reglas**: la búsqueda en el léxico ignora mayúsculas. Una excepción de usted coincide solo si
`text` está **contenido** en la cadena revisada. Una entrada que no coincide con ninguna cadena del
panel hace fallar la compuerta, igual que una excepción literal muerta.

## Acción principal declarada

Declarada en `primary-actions.ts`. La lee `design-system.spec.ts` (research §9). La lista completa,
pantalla por pantalla, está en [contracts/primary-actions.md](./contracts/primary-actions.md).

```ts
interface PrimaryAction {
  readonly screen: string;           // 'catálogo', 'diálogo: nuevo producto'
  readonly kind: 'view' | 'dialog';
  readonly action: string | null;    // nombre accesible del botón, o null si no tiene
  readonly destructive: readonly string[];  // nombres de los botones destructivos visibles (FR-009a)
  readonly planes: 'page-card-bar' | 'page-card';  // dentro o fuera del marco del comercio (SC-005)
  readonly why: string;              // qué tarea completa, o por qué no tiene
}
```

**Reglas**: toda ruta de `app.routes.ts` con `loadComponent` y todo componente que se abre con
`MatDialog.open` figura en la lista. Una prueba unitaria compara la lista con esos dos inventarios y
falla si falta una pantalla. En cada pantalla, el número de elementos con el acento computado es
0 si `action` es `null`, y como máximo 1 si no lo es; cuando hay 1, su nombre accesible es `action`.
Los planos que se verifican son los de `planes`: las vistas fuera del marco del comercio (inicio de
sesión, alta de cuenta, comercios e invitación) no tienen barra, y agregarla violaría FR-032. Un
diálogo hereda los planos de la vista que lo abre, más el superpuesto.
El conjunto de elementos con el color destructivo computado es **igual** a `destructive`: ni uno
más (FR-009a, "no se usa para nada más") ni uno menos. Cada `screen` tiene su caso titulado
`pantalla: <screen>` en `design-system.spec.ts`, y `screens.spec.ts` lo verifica.

## Nivel tipográfico

Declarado en `typography-levels.ts`, en orden de mayor a menor.

| Nivel | Token | Uso |
|---|---|---|
| Título de página | `--ds-type-page-title` | El `<h1>` de cada vista. Uno solo (FR-016) |
| Título de sección | `--ds-type-section-title` | `<h2>`, el título de cada tarjeta y el título de un diálogo |
| Subtítulo | `--ds-type-subtitle` | `<h3>` y el encabezado de un grupo dentro de una tarjeta |
| Cuerpo | `--ds-type-body` | Texto corriente, celdas y valores de campo |
| Etiqueta | `--ds-type-label` | Botones, encabezados de columna y etiquetas de chip |
| Ayuda | `--ds-type-help` | Ayudas de campo, estado del producto y notas |

Cada nivel compone cuatro tokens: `-size`, `-weight`, `-line-height` y `-tracking`. A eso se suma su
color de texto (`--ds-text-primary` o `--ds-text-secondary`). **Regla (FR-015)**: entre un nivel y el
siguiente difieren al menos **dos** de: tamaño, peso, color, espaciado entre letras e interlineado.
La verifica `typography.spec.ts` sobre los tokens compilados.

## Tratamiento de componente

No es un registro en código: es la sección de `_components.scss` de cada componente, más su tabla
en [contracts/component-treatments.md](./contracts/component-treatments.md). Esa tabla lista, por
componente, los estados que le aplican (FR-022) y el token que usa cada uno. La compuerta de
literales garantiza que esos tokens sean `--ds-*`. La e2e garantiza que se vean.

## Estados

No hay transiciones de datos. Los ocho estados de FR-022 son estados **visuales** de un control, y
cada uno es una fila de la tabla de tratamientos:

```text
reposo ──hover──▶ hover          (solo refuerza: FR-026)
   │  ──teclado──▶ foco          (anillo --ds-focus-ring, siempre visible)
   │  ──pulsar───▶ activo
   │  ──[disabled]▶ deshabilitado (opacidad + cursor + sin borde de error: FR-025)
   │  ──datos────▶ cargando ──▶ contenido | error | vacío   (SC-012 de la 001, sin cambios de forma)
   └─ ──validar──▶ error          (texto + ícono + color: FR-024)
```
