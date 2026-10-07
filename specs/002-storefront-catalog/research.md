# Research: Catálogo de Cara a la Tienda

**Feature**: 002-storefront-catalog · **Fecha**: 2026-10-05 · **Fase**: 0

Decisiones cerradas para el plan. Las tres primeras resuelven las restricciones que se fijaron al
pedir el plan; la §1 ya estaba tomada antes de `/speckit-plan` y se conserva sin reabrirla.

## 0. Stack: sin cambios respecto de la 001

Mismas versiones verificadas en `package.json`: Angular 22.2 (Material 22.2.1), `firebase` 12.19,
`firebase-admin` 14.5, `firebase-functions` 7.4, Nx 23.2.1, TypeScript ~6.0.3, Vitest 5.0.3,
Playwright 1.63, `@firebase/rules-unit-testing` 5.0.2. Ninguna decisión de esta feature pide una
dependencia nueva: GTIN, URL de video y URL amigable se resuelven con funciones propias del dominio.

## 1. Visibilidad de categorías: la efectiva se deriva, nunca se propaga (FR-021a)

**Decisión**: cada categoría guarda solo su **propia** visibilidad (`hidden`). La visibilidad
**efectiva** —la que ve la tienda y la que el panel señala— se calcula en tiempo de lectura a partir
de la categoría y sus ancestros: una categoría está oculta de hecho si ella o cualquiera de sus
ancestros lo está. Ocultar un padre **no escribe nada** en sus descendientes. El cálculo es una
función pura del dominio, `effectiveVisibility(tree)`, que además dice **quién** la oculta (ella
misma o qué ancestro), que es lo que el panel necesita para el caso límite "oculta por su categoría
padre".

**Por qué**: copiar el valor a los descendientes al ocultar un padre rompe en tres frentes:

1. **Mover una rama** obligaría a reescribir todos sus descendientes para recalcular lo copiado.
2. **Dos operaciones concurrentes** sobre la misma rama (ocultar el padre mientras se mueve o se
   muestra un hijo) dejarían el árbol inconsistente.
3. **Al volver a mostrar el padre** se perdería qué hijos estaban ocultos por decisión propia y
   cuáles solo por herencia.

**Cómo se consulta el árbol sin pagar una lectura por nivel**: el árbol **entero** de un comercio
vive en **un solo documento**, `tenants/{t}/storefront/categoryTree`, con un mapa de nodos
`{ id, name, slug, parentId, position, hidden }`. Leer el árbol cuesta **una lectura**
—más el `get()` de la membresía de las reglas— sea cual sea su profundidad o su tamaño, y la
visibilidad efectiva de todos los nodos sale de un recorrido O(n) en memoria. Las URL anteriores de cada categoría **no** van en el documento (T110): cada cambio de URL agrega
una y ninguna se elimina, así que el árbol crecería sin tope hacia el límite duro de 1 MiB por
documento, y al pasarlo dejaría de ser editable. Viven en `categorySlugs/{slug}`, una por documento.

Lo que compra el documento único, además de la lectura:

| Problema | Con un documento por categoría | Con el árbol en un documento |
|---|---|---|
| Leer el árbol | N lecturas (300 con el comercio de SC-006), o 1 + hasta 2 por categoría para resolver ancestros | **1 lectura** |
| Mover una rama | Reescribir los `ancestorIds` de cada descendiente | **1 escritura** |
| Dos ediciones a la vez | Pueden intercalarse entre documentos | **Se serializan**: la transacción sobre un documento no admite intercalado |
| Unicidad de nombre entre hermanas y de URL entre todas | Índice aparte o consulta | **Se verifica en memoria**, dentro de la misma transacción |

**Límite que introduce**: el documento tiene un tope de 1 MiB. Un nodo ocupa alrededor de 300
bytes, así que el plan fija un tope de **1.000 categorías por comercio** (~300 KB, holgado). Es un
límite de producto nuevo, que conviene agregar a los topes del spec (Assumptions). Ningún comercio de
referencia se acerca: SC-006 se mide con 300.

**Contención**: un solo documento admite del orden de una escritura sostenida por segundo. Las
ediciones del árbol son a ritmo humano y poco frecuentes; no es un riesgo.

**Alternativa descartada**: propagar el valor a los descendientes. Más simple de consultar, pero
incumple FR-021a en los tres frentes de arriba. También se descartó un documento por categoría con
la ruta de ancestros materializada: resuelve la lectura de ancestros, pero reintroduce el problema 1
(mover una rama reescribe a todos sus descendientes).

**Concurrencia de intención**: las operaciones del árbol son de intención —"mover X dentro de Y"—
y se validan contra el árbol fresco dentro de la transacción: si X o Y ya no existen, o el
movimiento dejaría X a más de tres niveles, se rechaza. No hay un `version` global del árbol: haría
chocar ediciones independientes (renombrar una rama mientras otra persona oculta otra).

## 2. Asignación de productos y filtro por rama (FR-022, FR-023, FR-024)

**Decisión**: el producto guarda **solo las categorías asignadas** (`categoryIds`, hasta 20), nunca
sus ancestros. Filtrar por una categoría lee el árbol (ya en memoria), calcula la categoría y sus
descendientes, y consulta con `array-contains-any` sobre esos ids.

**Por qué**: guardar los ancestros en cada producto haría que mover una categoría reescriba todos
los productos de la rama, el mismo defecto que la §1 evita para la visibilidad.

**Tope de `array-contains-any`**: 30 valores por consulta. Con tres niveles, una rama de más de 30
categorías se parte en consultas de hasta 30 ids que corren en paralelo y se combinan en el cliente,
ordenadas y cortadas al tamaño de página. Es el caso raro; el común es una consulta.

**Eliminar una categoría** (FR-024): la transacción saca el nodo del árbol y nada más. El conteo
previo de productos afectados es una agregación `count()` que hace el panel. Los `categoryIds` que
apuntan a una categoría eliminada **se ignoran al leer** —todo lector resuelve ids contra el árbol—,
y la misma callable, después de confirmar, los poda de los productos en lotes. La poda es
convergente: la transacción que elimina la categoría agrega su id a `pendingPrune`, una lista del
propio árbol; **toda** callable del árbol, después de confirmar, poda de los productos los ids
pendientes en lotes y, cuando ya no queda ninguno, los quita de la lista. Si la poda se corta a la
mitad, lo que queda es invisible —se ignora al leer— y la próxima operación sobre el árbol la
termina. Así borrar una categoría con 2.000 productos no depende del tope de escrituras de una
transacción.

**El editor envía lo que agrega y lo que quita, nunca el conjunto completo**: reemplazar el conjunto
pisaría una asignación masiva hecha al mismo tiempo. Con agregar y quitar por separado, toda escritura
de `categoryIds` es conmutativa.

**Asignar y quitar en masa** (FR-025): son operaciones de conjunto, conmutativas e idempotentes,
así que no comparan `version` ni la incrementan: dos personas que asignan categorías distintas al
mismo producto no pueden pisarse, y no provocan un conflicto a quien está editando su nombre.

## 3. Condiciones efectivas de venta: una función de dominio (FR-016, FR-032)

**Decisión**: `libs/domain/src/services/sale-conditions.ts` define:

- `effectiveSaleConditions(product)` → `{ price: 'shown' | 'hidden'; shipping: 'none' | 'charged' | 'free' }`,
  donde `shipping` es `'none'` si el producto es digital, `'free'` si es físico con envío gratis y
  `'charged'` si es físico sin él. `freeShipping` se conserva guardado aunque el producto sea
  digital (FR-016), y simplemente no cuenta.
- `saleConditionChanges(before, after)` → la lista de cambios auditables (`AuditedChange`) que
  produce pasar de un producto al otro, comparando **condiciones efectivas**, no campos.

Los casos de uso —cambiar el tipo, cambiar las condiciones de venta, en uno o en masa— no deciden
si hay entrada de bitácora: llaman a `saleConditionChanges` y escriben lo que devuelve, con
`buildAuditEntries` de la 001.

**Por qué**: la regla que el spec fija en FR-032 es "todo lo que cambia lo que ve o paga el
comprador queda en la bitácora", y comparar campos no la captura. Un digital que pasa a físico sin
envío gratis previo no cambia ningún campo de envío, pero el comprador pasa de **sin envío** a
**envío con cargo**. Como función pura, se prueba con la **tabla completa** de transiciones sin
Firebase:

| Antes | Después | Entrada |
|---|---|---|
| digital | físico, sin envío gratis | sin envío → envío con cargo |
| digital | físico, con envío gratis conservado | sin envío → envío gratis |
| físico, con cargo | digital | envío con cargo → sin envío |
| físico, gratis | digital | envío gratis → sin envío |
| físico, con cargo | físico, gratis | envío con cargo → envío gratis |
| cualquiera | igual | ninguna |
| precio mostrado | precio oculto | mostrado → oculto (independiente del envío) |

La propiedad que la suite fija: **todo cambio de tipo produce exactamente una entrada de envío**, en
las dos direcciones, y un cambio que no altera las condiciones efectivas no produce ninguna.

**Tipo de evento**: `'sale-conditions.changed'`, con `field: 'price' | 'shipping'`, entidad
`product`. Se suma a la unión etiquetada `AuditEntry` de la 001 y al filtro por tipo (FR-033); el
índice `(type, at desc)` ya existe.

**Alternativa descartada**: un `if (kindChanged || freeShippingChanged)` en el manejador. Ata la
regla al transporte, no se prueba sin emulador y es exactamente el `if` que no captura el caso
digital → físico.

## 4. Tope de las secciones destacadas: transaccional y sin contador aparte (FR-027a, FR-027b)

**Decisión**: la pertenencia a las secciones vive en **un documento por comercio**,
`tenants/{t}/storefront/sections`, con `{ featured: ProductId[], offers: ProductId[] }`. **El
contador es la longitud de la lista**: no hay un campo `count` que mantener ni que pueda desfasarse.
El producto **no** guarda en qué secciones está: ese documento es la única fuente de verdad.

**Cómo se hace cumplir el tope**: agregar productos es una transacción que lee el documento de
secciones, calcula con una función pura del dominio, `addToSection(list, ids, MAX = 40)`, si hay
lugar para **todos** —si no, rechaza con `section-full` y los lugares que quedan— y escribe la lista
nueva. Dos personas que agregan a la vez leen el mismo documento; la transacción del Admin SDK las
serializa, y la segunda ve la lista ya actualizada. **El tope es una propiedad del mecanismo**, no
una verificación que una carrera pueda saltear: SC-011 se prueba con agregados simultáneos contra el
emulador.

**Cuánto cuesta**:

| Operación | Lecturas | Escrituras |
|---|---|---|
| Ver los contadores en el panel (escucha) | 1 + 1 del `get()` de la regla | 0 |
| Agregar 1 producto | ~2 de la guarda + 1 secciones + 1 producto = **~4** | **1** |
| Agregar 8 productos en una acción | ~2 + 1 + 8 = **~11** | **1** |
| Quitar un producto | ~3 | 1 |
| Archivar un producto que está en una sección | +1 secciones sobre lo de la 001 | +1 |
| Listado filtrado por sección | 1 secciones + hasta 40 productos (`documentId in`, dos consultas de ≤30) | 0 |

Con las tarifas de la 001 (lecturas a USD 0,06 cada 100.000; las de escritura siguen sin confirmar,
T097 de la 001), agregar un producto cuesta del orden de una diezmilésima de centavo de dólar. El
costo del tope es **una lectura y ninguna escritura extra** por operación, porque la lista que
garantiza el tope es la misma que se escribe.

**Contención**: un documento por comercio para las dos secciones. Las ediciones son a ritmo humano;
el límite de ~1 escritura sostenida por segundo por documento no se acerca.

**Alternativas descartadas**:

- **Un campo `sections` en cada producto más un contador**: dos fuentes que mantener en sincronía, un
  contador que puede desfasarse si una escritura queda a medias, y el tope igual exigiría leer el
  contador en la transacción. Mismo costo de lectura, más escrituras y un estado que se puede
  corromper.
- **Contar con una consulta dentro de la transacción** (productos con la sección marcada): una
  consulta protege los documentos que devolvió, no los que todavía no están en el resultado. Dos
  personas que agregan productos **distintos** a la vez escriben documentos que ninguna de las dos
  leyó —registros fantasma—: las dos ven 39 y la sección queda en 41. Con la lista en un documento,
  las dos escriben el **mismo** documento que leyeron, y la transacción lo detecta.

**Archivar** (FR-028): `ArchiveProduct` de la 001 suma la lectura del documento de secciones y saca
el id de las listas en la misma transacción.

## 5. URL amigable de productos: índice de reservas (FR-005 a FR-008)

**Decisión**: `tenants/{t}/slugIndex/{slug}`, como el `skuIndex` de la 001. El id del documento es
la URL; el contenido, `{ productId, kind: 'current' | 'previous' }`. Se crea con `tx.create` en la
transacción que asigna la URL, así que **la colisión falla de forma atómica**, también bajo dos
creaciones simultáneas con el mismo nombre (SC-001).

- **Generar** (FR-006): `slugify(name)` es pura —minúsculas, sin acentos con `normalize('NFD')`,
  guiones, 1 a 100 caracteres—. Dentro de la transacción se prueban `base`, `base-2`, `base-3`… con
  una lectura cada una hasta encontrar una libre; con un tope de 20 intentos, después de los cuales
  se usa un sufijo corto aleatorio. Si `slugify` no deja ningún carácter, se usa una de respaldo
  derivada del id del producto, marcada para reemplazar.
- **Seguir al nombre** (FR-008): el producto guarda `slugLocked`, que pasa a `true` cuando la URL se
  edita a mano o cuando el producto pasa por primera vez a activo o no listado (lo marca
  `SetProductStatus` de la 001). Mientras sea `false`, renombrar regenera la URL y **libera** la
  anterior, que nadie enlazó.
- **Anteriores** (FR-008): si `slugLocked` es `true` y la URL cambia, la entrada vieja pasa a
  `kind: 'previous'` y queda reservada para siempre. Si el producto vuelve a una URL anterior propia,
  esa entrada vuelve a `'current'`.
- **Archivado**: el producto conserva su URL; su entrada no se toca, así que sigue reservada.
- **Vista previa en el panel** (FR-007, escenario 2): las URL son públicas por naturaleza, así que las
  reglas dejan leer `slugIndex` a los miembros activos y el panel muestra la URL libre antes de
  guardar. Es una vista previa: la transacción decide, y la respuesta devuelve la URL final.

Las URL de **categorías** no usan este índice: viven en el árbol (§1) y su unicidad se verifica en
memoria dentro de la misma transacción. Son espacios de nombres separados: una categoría y un
producto pueden compartir URL, porque la tienda los sirve bajo rutas distintas.

## 6. GTIN: reservado como el SKU (FR-030)

**Decisión**: `tenants/{t}/gtinIndex/{GTIN14}`, con el GTIN normalizado a 14 dígitos con ceros a la
izquierda. Se reserva al asignarlo y **no se libera al archivar** la variante; solo quitarlo de la
variante lo libera. `validateGtin` (pura) acepta 8, 12, 13 o 14 dígitos y verifica el dígito de
control GS1 (módulo 10 con pesos 3 y 1). A diferencia de `slugIndex`, las reglas **no** lo exponen:
el conflicto lo informa la callable, que nombra el producto que lo tiene.

## 7. Etiquetas y marcas: vocabulario por comercio (FR-011, FR-012)

**Decisión**: el producto guarda `tags` y `brand` tal como se escribieron, y sus formas normalizadas
(`tagsNormalized`, `brandNormalized`, con `normalizeName` de la 001) para filtrar. Las sugerencias
salen de `tenants/{t}/storefront/vocabulary`: `{ tags: { [normalizado]: { label, count } }, brands: … }`,
actualizado en la misma transacción que guarda el producto. `label` conserva la primera forma
registrada (caso límite "Algodón" y "algodon"), y el término se poda cuando `count` llega a cero.
Sugerir cuesta una lectura.

## 8. Peso, dimensiones y "faltan datos de envío" (FR-013 a FR-017)

**Decisión**: gramos y milímetros enteros (Assumptions del spec). El producto lleva
`weightGrams` y `dimensionsMm` (`{ length, width, height }`), nulos hasta cargarse; la variante,
`weightGrams` y `dimensionsMm` propios, `null` cuando hereda. `effectiveShipping(product, variant)`
y `missingShippingData(product, variants)` son puras. Como `hasIncompleteVariants` en la 001, el
producto guarda `missingShippingData` como caché para que el listado lo filtre con un índice, y se
recalcula en cada caso de uso que toca tipo, peso o dimensiones.

## 9. Video externo (FR-018)

**Decisión**: `parseVideoUrl(url)` (pura) reconoce YouTube (`youtube.com/watch?v=`, `youtu.be/`,
`youtube.com/shorts/`) y Vimeo (`vimeo.com/{id}`) y devuelve `{ provider, videoId }`; cualquier otra
cosa se rechaza nombrando las dos. Se guarda el id, no la URL: la tienda arma la incrustación. El
video tiene su `position` en la misma secuencia que las imágenes del producto.

## 10. Las acciones masivas se separan por permiso (FR-029)

**Decisión**: las acciones masivas sobre productos son callables separadas según el permiso que
exigen, y el panel las ofrece como acciones separadas:

| Callable | Permiso | Qué hace |
|---|---|---|
| `setSaleConditions` | `variant.price.write` | precio visible u oculto, envío gratis; escribe bitácora |
| `addToSection` / `removeFromSection` | `catalog.write` | secciones destacadas, con el tope |
| `assignCategory` / `unassignCategory` | `catalog.write` | categorías |

**Por qué**: la guarda de la 001 verifica un permiso fijo por caso de uso (`static requires`) antes
de leer la entrada. Una sola callable que mezclara cambios de catálogo y de precio necesitaría un
permiso que depende de la carga útil, y validar la entrada antes de autorizar, que la 001 descartó a
propósito. Separadas, "si el rol carece de permiso sobre alguno de los cambios, no se aplica
ninguno" se cumple de forma trivial: cada pedido exige un solo permiso y es todo o nada.

**Todo o nada con productos digitales** (FR-029, Clarifications): `setSaleConditions` con
`freeShipping: true` rechaza con `digital-products` y la lista de los digitales; el panel ofrece
quitarlos de la selección y reintentar en la misma pantalla.

**Tope por lote**: 100 productos, igual que los lotes de variantes de la 001. Un lote de
`setSaleConditions` de 100 productos escribe a lo sumo 100 productos y 200 entradas de bitácora (dos
campos por producto), debajo del tope histórico de 500 escrituras por transacción, sin depender de
si ese tope sigue vigente.

## 11. Filtros del listado: una condición de arreglo por consulta (FR-017, FR-023, FR-027c, FR-035)

Firestore admite una sola condición `array-contains` o `array-contains-any` por consulta. El
listado combina libremente estado, marca, "faltan datos de envío" y búsqueda por nombre, pero
**categoría y etiqueta no se combinan entre sí**: se filtra por una o por otra. El spec no pide
combinarlas. La sección destacada no usa índice: el listado filtrado por sección lee los ids del
documento de secciones (§4). La búsqueda por URL amigable es por igualdad sobre `slug`.

Índices nuevos, todos encabezados por `archived` como los de la 001: `(archived, categoryIds
array-contains, updatedAt desc)`, `(archived, tagsNormalized array-contains, updatedAt desc)`,
`(archived, brandNormalized, updatedAt desc)`, `(archived, missingShippingData, updatedAt desc)` y
`(archived, slug)`.

## 12. Productos existentes (Edge Cases del spec)

**Decisión**: dos capas. Los mapeadores leen con valores por defecto —físico, precio visible, sin
envío gratis, sin categorías— cuando falta un campo, así que ningún producto existente se rompe
entre el despliegue y la migración. Y una migración idempotente en `tools/` asigna a cada producto su
URL amigable con `slugIndex`, porque la unicidad no se puede dar por defecto. No cambia el estado de
ningún producto.

## 13. Costo operativo

Sobre el comercio de referencia de la 001 (500 productos, 2.000 variantes, 20 jornadas):

| Operación | Lecturas | Escrituras |
|---|---|---|
| Abrir el árbol de categorías | 1 + 1 de la regla | 0 |
| Editar el árbol (crear, mover, ocultar) | ~3 | 1 |
| Listado filtrado por una categoría | 1 árbol (ya escuchado) + página | 0 |
| Ficha de tienda: guardar | ~3 + vocabulario 1 | producto + vocabulario |
| Cambiar la URL amigable | ~3 + 1 por candidato | producto + 1 o 2 entradas de índice |
| `setSaleConditions` sobre 20 productos | ~22 | 20 + hasta 40 de bitácora |

Ninguna suma depende del tamaño del equipo: el principio rector se mantiene.

## 14. ¿Firestore comprime lo que manda? (T094)

**Contexto**: la medición de rendimiento de la 001 (`admin-e2e:perf`) apunta el panel optimizado a
los emuladores. A 1.000 categorías, el documento del árbol (§1) es grande, y el emulador lo manda
sin comprimir. Si Firestore real sí comprime, la medición carga en la red un costo que la persona no
paga, y comprimir el tráfico del emulador al medir sería medir lo que llega. Si no comprime, sería
relajar el criterio por la puerta de atrás. Había que verificarlo contra un proyecto real.

**Método** (2026-10-06, reproducible con `tools/firestore-compression/measure.ts`):
- Proyecto nuevo y propio, `ecommerce-medicion-2610`, con Firestore en `us-central1`. Las reglas
  abren solo la colección `medicion-compresion`, mientras dura la medición. Al terminar, el documento
  se borra y las reglas vuelven a negar todo.
- Desde Chromium (Playwright) y con el SDK web del panel (`firebase` 12.19), una app escribe un
  documento con la forma del árbol de categorías en su tope: 1.000 nodos, con los campos de
  `categoryTreeToDoc`. Otra app, nueva y sin caché, lo lee como lo hace el panel: `onSnapshot`
  hasta la primera entrega confirmada por el servidor (`listen.ts`).
- Por CDP (`Network.responseReceived`, `Network.dataReceived`) se registran, solo para la lectura, el
  `content-encoding`, los bytes decodificados y los transferidos (`encodedDataLength`) de cada
  respuesta. Se registra además quién emitió el certificado TLS: en esta red hay un intermediario TLS,
  y si interceptara el tráfico, la compresión podría ser suya y no de Google.
- Lo mismo contra el emulador, con el mismo documento.

**Resultado**:

| | `content-encoding` | Decodificados | Transferidos | Certificado |
|---|---|---|---|---|
| Firestore real, 3 lecturas | `gzip` (h2) | 753 kB | **25 kB** | WR2 (Google Trust Services): sin intermediario |
| Emulador | ninguno (http/1.1) | 258 kB | **257 kB** | sin TLS |

El JSON del canal en producción es más verboso que el del emulador (753 contra 258 kB), pero viaja
comprimido: unas 30 veces menos. Al final, el emulador transfiere unas 10 veces lo que transfiere
Firestore real.

**Conclusión**: Firestore comprime sus respuestas, así que comprimir el tráfico del emulador en
`admin-e2e:perf` es medir lo que recibe la persona, no relajar el criterio. Se hace con
`apps/admin-e2e/firestore-gzip-proxy.mjs` delante del emulador, solo para la configuración `measure`
del panel.

**El proxy erra hacia lo pesimista**: nunca comprime mejor que Firestore real. Firestore transfirió
25,2 kB por cada 258 kB que el emulador decodifica del mismo documento (9,8%). El proxy fija un piso
del 10%: si gzip baja de eso, rellena con bloques almacenados vacíos de deflate (`00 00 00 FF FF`,
insertados después de cada `Z_SYNC_FLUSH`), que son gzip válido y no cambian lo que se decodifica.
Medido con el mismo arnés (`measure.ts emulador 8090`), el árbol de 1.000 categorías transfiere
**27,3 kB** por el proxy, contra 25,2 kB reales: unos 2 kB de más. Una primera versión sin piso
transfería 14 kB, unos 55 ms a favor de la medición, y por eso se descartó.

**Los números con el proxy pesimista** (2026-10-06, `npx nx run admin-e2e:perf`, perfil móvil de la
001, árbol de 1.000 categorías):

| Vista | Estructura | Contenido útil, primera visita | Contenido útil, siguientes |
|---|---|---|---|
| Catálogo (SC-009 de la 001) | 196 ms | 2.706 ms | 797 ms |
| Editor del árbol | 204 ms | 2.749 ms | 972 ms |
| Editor de producto | 188 ms | 2.796 ms | 851 ms |

SC-006: p95 de 559 ms en 36 filtros. SC-008 de la 001: 2.706 → 2.672 ms con 100 colaboradores.
Todo bajo el tope; el margen más chico es el del editor de producto, 204 ms.

## Riesgos abiertos

- El tope de **1.000 categorías por comercio** es nuevo; conviene registrarlo en los topes del spec.
- La poda de `categoryIds` colgantes es eventual. No es visible —todo lector los ignora—, pero una
  consulta de agregación hecha a mano contaría de más hasta que termine.
- Las tarifas de escritura siguen sin confirmar (T097 de la 001, diferida).
