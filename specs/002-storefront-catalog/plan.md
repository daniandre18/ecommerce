# Implementation Plan: Catálogo de Cara a la Tienda

**Branch**: `feat/002-storefront-catalog` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-storefront-catalog/spec.md`

## Summary

Amplía el catálogo de la 001 con lo que una tienda pública necesita para mostrar y hacer encontrar
cada producto: URL amigable, datos para buscadores, etiquetas, marca, tipo físico o digital con peso
y dimensiones, video, categorías en árbol, secciones destacadas con tope, condiciones de venta
auditadas, y GTIN, MPN, rango de edad y género. La arquitectura es la de la 001 sin cambios de
forma: cuatro capas, ninguna escritura desde el cliente, toda mutación por una callable dentro de una
transacción, y reglas con su propia suite.

Tres decisiones de diseño responden a las restricciones fijadas al pedir este plan
([research.md](./research.md)):

1. **La visibilidad efectiva de una categoría se deriva, nunca se copia** (§1). El árbol entero vive
   en **un documento** por comercio: leerlo cuesta **una lectura** sea cual sea su profundidad, la
   visibilidad efectiva de todos los nodos sale de un recorrido en memoria
   (`effectiveVisibility`), mover una rama es una escritura, y dos ediciones del árbol se serializan
   por construcción.
2. **Las condiciones efectivas de venta son una función del dominio** (§3).
   `saleConditionChanges(antes, después)` compara condiciones efectivas —precio mostrado u oculto;
   sin envío, envío con cargo o envío gratis— y devuelve las entradas de bitácora. Ningún manejador
   decide con un `if`; la regla se prueba con la tabla completa de transiciones, sin Firebase.
3. **El tope de las secciones es la longitud de una lista en un documento** (§4). Agregar es una
   transacción sobre ese documento: los agregados simultáneos se serializan y el tope se cumple por
   el mecanismo. Cuesta **una lectura y ninguna escritura extra** por operación, y no hay contador
   que pueda desfasarse.

## Technical Context

**Language/Version**: TypeScript ~6.0.3; Node.js 22 en Functions. Sin cambios respecto de la 001.

**Primary Dependencies**: Angular 22.2 (zoneless, Signal Forms) con Material + CDK 22.2.1, SDK
modular `firebase` 12.19, `firebase-admin` 14.5, `firebase-functions` 7.4, Nx 23.2.1. **Ninguna
dependencia nueva**: GTIN, URL de video y URL amigable son funciones propias del dominio.

**Storage**: Firestore. Se suman `storefront/{categoryTree, sections, vocabulary}`, `slugIndex` y
`gtinIndex` bajo cada comercio, y campos nuevos en productos y variantes ([data-model.md](./data-model.md)).

**Testing**: Vitest 5 (dominio y aplicación, sin emuladores), `@firebase/rules-unit-testing` 5
(casos 35 a 48 y 35a), emulador para atomicidad y concurrencia, Playwright 1.63 (e2e y rendimiento).

**Target Platform**: la del panel de la 001; Cloud Functions 2ª gen en la región de Firestore.

**Project Type**: monorepo web (SPA de administración + Cloud Functions + librerías por capa).

**Performance Goals**: SC-006, 95% de los filtros por categoría, etiqueta o marca bajo 1 s con
10.000 variantes y 300 categorías; SC-007, acción masiva de 100 productos bajo 10 s; y SC-009,
SC-012 y SC-014 de la 001 en toda vista nueva (SC-008).

**Constraints**: 3 niveles y 1.000 categorías por comercio (el segundo, nuevo en este plan); 20
categorías y 30 etiquetas por producto; 40 productos por sección; lotes de hasta 100 productos;
peso en gramos y dimensiones en milímetros, enteros.

**Scale/Scope**: 39 requisitos funcionales, 11 criterios de éxito, 4 historias. Comercio de
referencia: el de la 001 más 300 categorías.

## Constitution Check

*GATE: debe pasar antes de la fase 0 y volver a evaluarse tras la fase 1.*

| Principio | Estado | Cómo lo cumple este plan |
|---|---|---|
| I. Catálogo jerárquico con variantes | ✅ | Árbol de categorías con operaciones puras y topes; datos propios por variante (peso, dimensiones, GTIN) sobre el modelo de la 001 |
| II. Sincronización atómica de existencias | ➖ | No toca existencias |
| III. Motor de descuentos | ➖ | El envío gratis es incondicional y por producto; el condicionado queda para el motor |
| IV. Desacoplamiento de recaudo y logística | ✅ | Peso y dimensiones en unidades neutras, sin atarse a ninguna transportadora |
| V. Analíticas | ➖ | Fuera de alcance |
| VI. RBAC, mínimo privilegio | ✅ | Sin permisos nuevos; condiciones de venta bajo `variant.price.write`, verificado en la guarda dentro de la transacción; acciones masivas separadas por permiso (§10) para que ningún pedido mezcle permisos; reglas sin comodín, con `storefront` declarado documento por documento |
| VII. Trazabilidad inmutable | ✅ | Nuevo tipo `sale-conditions.changed`, escrito en la misma transacción que el cambio; cubre el cambio de tipo en las dos direcciones |
| VIII. Carga percibida | ✅ | El árbol y las secciones son un documento cada uno: una lectura para dibujar; esqueletos de la 001 en las vistas nuevas |
| IX. Mobile-first | ✅ | Vistas nuevas a 360 px y WCAG 2.2 AA, con las mismas e2e que la 001 |
| X. Garantía automática | ✅ | Las propiedades del dominio, los casos de reglas 35 a 48 y 35a y las pruebas de atomicidad y concurrencia entran en las compuertas bloqueantes de la 001 |

**Resultado del gate: PASA.**

**Re-evaluación tras la fase 1**: el diseño no introdujo violaciones. Dos decisiones refuerzan el
cumplimiento: la reserva del GTIN —como el SKU— elimina un conflicto en lugar de manejarlo, y la
lista de sección como única fuente de verdad convierte el tope en una propiedad del mecanismo.

## Project Structure

### Documentation (this feature)

```text
specs/002-storefront-catalog/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones (§1 a §4 responden las restricciones del plan)
├── data-model.md        # Fase 1: tipos de dominio y disposición en Firestore
├── quickstart.md        # Fase 1: cómo validar de punta a punta
├── contracts/
│   ├── callable-functions.md   # Callables nuevas y las de la 001 que cambian
│   ├── firestore-rules.md      # Reglas nuevas + casos 35 a 48 y 35a
│   └── ports.md                # Dominio, puertos y casos de uso
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

Solo lo que esta feature suma o cambia:

```text
libs/domain/src/
├── value-objects/          slug.ts, gtin.ts; ids.ts suma CategoryId
├── entities/               category-tree.ts (nuevo); product.ts, variant.ts, audit-entry.ts (ampliados)
└── services/               effective-visibility.ts, sale-conditions.ts, sections.ts,
                            shipping-data.ts, video-url.ts, vocabulary.ts (nuevos);
                            build-audit-entries.ts (ampliado)

libs/application/src/
├── ports/                  unit-of-work.ts y repositories.ts suman árbol, secciones,
│                           vocabulario, slugIndex y gtinIndex
└── use-cases/              storefront/ (ficha, URL, envío, GTIN, tipo, condiciones de venta),
                            categories/ (árbol y asignación), sections/ (secciones);
                            create-product, set-product-status y archive (cambian)

libs/infrastructure/src/
├── firestore/repositories/ adaptadores de los repositorios nuevos
├── mapping/                mapeadores con valores por defecto para productos existentes
└── client/                 consultas del panel: árbol, secciones, vocabulario, slug, filtros nuevos

apps/functions/src/
├── storefront/             callables de ficha, URL, envío, GTIN, tipo y condiciones de venta
├── categories/             callables del árbol y de asignación
└── sections/               addToSection, removeFromSection

apps/admin/src/app/
├── catalog/product-editor/ ficha de tienda, vista previa en buscadores, tipo y envío, video
├── catalog/product-list/   filtros nuevos y acciones masivas separadas por permiso
├── catalog/categories/     editor del árbol (nuevo)
└── audit/                  etiqueta y filtro del tipo "condiciones de venta"

tests/rules/storefront.spec.ts   casos 35, 35a y 36 a 43; 44 a 48 en las suites existentes
tools/migrate/                   URL amigable de productos existentes y documentos de storefront
firestore.rules, firestore.indexes.json
```

**Structure Decision**: las mismas cuatro librerías-capa de la 001, con las mismas etiquetas Nx y
la misma regla de dependencias. Lo nuevo se agrupa por historia dentro de cada capa (`storefront`,
`categories`, `sections`) para que `/speckit-tasks` pueda repartir por historia sin que dos tareas
toquen el mismo archivo.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **El árbol de categorías entero en un documento**, con un tope nuevo de 1.000 categorías por comercio | FR-021a: la visibilidad efectiva se deriva de los ancestros sin copiarse, y hay que leer el árbol sin pagar una lectura por nivel | Un documento por categoría cuesta N lecturas para dibujar el árbol (300 en SC-006), o materializar los ancestros, que obliga a reescribir toda la rama al moverla: el mismo defecto que FR-021a prohíbe para la visibilidad. El tope de 1.000 deja holgura de sobra respecto del 1 MiB del documento |
| **La pertenencia a secciones vive solo en un documento por comercio**, no en cada producto | FR-027a y FR-027b: tope transaccional bajo concurrencia | Un campo en el producto más un contador son dos fuentes de verdad que pueden desfasarse; contar con una consulta deja pasar agregados simultáneos (registros fantasma, research §4) |
| **Los `categoryIds` colgantes se podan después de confirmar**, no dentro de la transacción | Eliminar una categoría con miles de productos no puede depender del tope de escrituras de una transacción | Podar dentro de la transacción limita el tamaño de una categoría eliminable. Todo lector ignora los ids que no están en el árbol, así que la poda pendiente no es visible |
| **Acciones masivas separadas por permiso** en lugar de una sola | La guarda de la 001 exige un permiso fijo por caso de uso y valida la entrada después de autorizar | Una callable con permiso dependiente de la carga útil obliga a leer la entrada antes de autorizar, que la 001 descartó a propósito para no revelar nada a quien no puede operar |

### Riesgos sin resolver

- El tope de **1.000 categorías por comercio** todavía no está en el spec: lo registra T001, antes de
  la Historia 2.
- **Categoría y etiqueta no se combinan** en un mismo filtro del listado (research §11): Firestore
  admite una sola condición de arreglo por consulta. El spec no lo pide; si las pruebas de usuario lo
  piden, la salida es intersecar en el cliente.
- Las tarifas de escritura siguen sin confirmar (T097 de la 001, diferida).

### Nota para la implementación

Igual que en la 001: la skill `angular-developer` cubre los patrones de Angular 22 para el editor
del árbol y la ficha de tienda. El editor del árbol necesita reordenar por arrastre **y** por
teclado (WCAG 2.2 AA, criterio 2.5.7): el `CdkDragDrop` del CDK cubre el arrastre, y el movimiento
por teclado necesita su alternativa explícita, con anuncios del `LiveAnnouncer`.
