# Quickstart: validar la feature de extremo a extremo

**Feature**: 001-catalog-rbac · **Fase**: 1 (segunda pasada)

Cómo levantar el entorno y comprobar que la feature hace lo que el spec promete. No contiene código
de implementación: eso es trabajo de `/speckit-implement`.

## Requisitos previos

| Herramienta | Versión | Por qué esa |
|---|---|---|
| Node.js | 22 LTS o superior | `firebase-functions` 7 pide `>= 18`; 22 es el runtime de destino |
| TypeScript | `~6.0.0` | **Angular 22 exige `>=6.0 <6.1`**. La 7.x publicada en npm rompe el build |
| Firebase CLI | `>= 14` | Emulator Suite |
| Java | 11 o superior | Lo necesita el emulador de Firestore |

No hace falta un proyecto de Firebase real: todo corre contra emuladores.

## Puesta en marcha

```bash
npm install
npx nx run-many -t build            # dominio, aplicación, functions y app
firebase emulators:start            # Auth, Firestore, Functions, Storage
npx nx serve admin                  # panel en http://localhost:4200
```

`nx serve admin` usa la configuración de desarrollo, que apunta siempre a los emuladores con el
proyecto `demo-ecommerce`; solo el build de producción reemplaza ese entorno por el del proyecto real.
El panel se niega a usar los emuladores con un proyecto que no sea `demo-*`.

El panel se abre en `/t/{código del comercio}` —`/t/t1` para el escenario sembrado—. Elegir el
comercio de una lista llega con la Historia 2 (T075).

### Datos de prueba

`npx nx run tools:seed` crea el escenario mínimo:

Todas las cuentas usan la contraseña `test-1234`, que solo existe en los emuladores: el sembrador
se niega a correr contra un proyecto que no sea `demo-*`.

| Comercio | Propietaria | Rol de Catálogo |
|---|---|---|
| `t1` | `owner@t1.test` | `catalogo@t1.test`, `multi@test` |
| `t2` | `multi@test` | — |

`multi@test` es la cuenta que prueba FR-005: Propietaria en `t2` y colaboradora en `t1`. Cada
comercio tiene exactamente un Propietario (FR-011); una versión anterior de esta guía ponía dos en
`t1`, lo que habría contradicho la regla que el sistema tiene que garantizar.
- Un producto con la opción "color" (Rojo, Amarillo), ambas variantes con SKU, precio y stock, y
  costos cargados en su documento privado

## Comprobaciones por historia

### Historia 1 — Catálogo con variantes

1. Entrar como `owner@t1.test`.
2. Crear un producto **sin opciones** → utilizable, con una variante implícita que acepta SKU,
   importes, stock e imagen (FR-020).
3. Agregar la opción "color" con Rojo y Amarillo → la tabla muestra dos filas al instante (FR-018).
4. Cargar SKU, precio y stock en ambas.
5. **La prueba central de FR-024**: agregar la opción "tamaño" con S y M.
   - El sistema pide asignar un tamaño a cada variante existente.
   - Las dos originales **conservan** SKU, precio, precio comparativo, costo, stock e imágenes.
   - Aparecen dos combinaciones nuevas **sin precio y sin existencias definidas** — comprobar que
     la interfaz las muestra como "sin definir" y **no como 0**, que es un estado distinto
     (FR-029). Este punto cambió respecto de la versión anterior del spec.
6. Intentar pasar el producto a **activo** → se rechaza indicando qué variantes lo impiden
   (FR-023a). Completar sus SKU y reintentar → ahora sí. Probar también **no listado**.
7. Poner en una variante un SKU que ya usa otra → se rechaza señalando cuál lo ocupa (FR-021).
8. Seleccionar varias variantes y aplicarles el mismo precio → se aplica a todas, y la bitácora
   muestra **una entrada por variante** (FR-030).
9. Agregar una sexta opción → se rechaza. Cargar valores que superen 100 combinaciones → se
   rechaza diciendo cuántas produciría, **sin** crear ninguna (FR-025).

### Historia 2 — Equipo, permisos y costo

1. Como Propietaria, invitar a `nuevo@t1.test`. Antes de aceptar no accede a nada (FR-007).
2. Crear un rol propio → nace **sin permisos** (FR-009).
3. Buscar en el editor de permisos las credenciales de pago, la facturación o la administración de
   roles → **no aparecen como opción activable en ningún rol** (FR-014). No están desmarcadas: no
   existen.
4. Entrar como `catalogo@t1.test`:
   - Editar nombre, descripción, imágenes, opciones, variantes y stock → funciona.
   - Precio de venta y comparativo se ven pero no se editan.
   - **El costo de adquisición no se ve en absoluto** (FR-015). Comprobar en la consola del
     navegador que `products/{pid}/private/costs` devuelve permiso denegado, y que el documento de
     la variante **no contiene** el campo de costo. Esa es la prueba de que la separación es real.
5. Crear un rol con `variant.price.write` pero **sin** permisos de costo → su titular edita precios
   y sigue sin ver el costo (FR-015, escenario 17 de la Historia 2).
6. **Evitando la interfaz**: desde la consola, con la sesión de `catalogo@t1.test`, escribir directo
   el precio de una variante → la regla lo deniega. Llamar directo a `setVariantPrice` →
   `permission-denied`.
7. Quitarle un permiso a un rol con miembros → el efecto se ve en la **operación siguiente**, sin
   cerrar sesión ni esperar una hora (FR-008).
8. Intentar eliminar un rol con miembros → se exige reasignarlos primero (FR-013).
9. Dar de baja a un colaborador → pierde acceso de inmediato, y la bitácora **sigue mostrando su
   nombre** (FR-008a, FR-031).

### Cuentas en varios comercios (FR-005) — nuevo

1. Entrar como `multi@test` → el panel ofrece elegir entre `t1` y `t2`; la ruta refleja el comercio
   activo.
2. En `t2` (Propietaria): acceso a credenciales, facturación y bitácora.
3. Cambiar a `t1` (colaboradora): **sin** acceso a nada de eso, sin necesidad de volver a
   autenticarse. Ser dueña en `t2` no concede nada en `t1` (caso 11 de las pruebas de reglas).
4. Con `multi@test` conectada en `t1`, dar de baja su membresía en `t1` desde la sesión de
   `owner@t1.test` → su siguiente lectura en `t1` es denegada, **y su acceso a `t2` sigue
   intacto** (FR-008a).
5. Como `multi@test` en `t2`, invitar a `catalogo@t1.test` → se le suma una membresía nueva, no se crea otra
   cuenta, y ninguno de los dos comercios ve datos del otro (escenario 13 de la Historia 2).

### Historia 3 — Bitácora

1. Como Propietaria, filtrar la bitácora por producto, por persona, por rango de fechas y **por
   tipo de evento** (FR-034).
2. Verificar que cada cambio de precio y stock tiene responsable, momento, tipo, entidad, valor
   anterior y valor nuevo (FR-031).
3. **Nuevo (FR-031a)**: cambiar los permisos de un rol, reasignar a alguien y dar de baja a otra
   persona; comprobar que los tres hechos aparecen con el conjunto de permisos anterior y el
   resultante (escenario 6 de la Historia 3).
4. Intentar editar o borrar una entrada **siendo Propietaria** → denegado (FR-032). También desde
   la consola del navegador.
5. **Prueba de FR-033 en ambos sentidos**: la suite de integración inyecta un fallo en la escritura
   de bitácora y comprueba que el precio no cambia; y después inyecta un fallo en la escritura de
   la variante y comprueba que **no queda entrada** de ese cambio.
6. Como `catalogo@t1.test`, leer la bitácora → denegado.

### Historia 4 — Móvil y accesibilidad

1. A 360 px de ancho: ninguna vista requiere desplazamiento horizontal, incluida la tabla de
   variantes (FR-038).
2. Con la red limitada a 3G lenta: cada vista muestra esqueleto de inmediato y el contenido lo
   reemplaza **sin** desplazar lo que ya se estaba mirando (FR-036, SC-009).
3. Cortar la red y recargar → estado de error con reintento (FR-037).
4. Comercio sin productos → estado de vacío con acción de crear (FR-037).
5. Editar precio en la tabla y cortar la red al guardar → el trabajo **no** se pierde (FR-039).
6. Recorrer el alta de producto **solo con teclado**, incluida la tabla con edición en línea, y
   comprobar con lector de pantalla que los cambios de estado se anuncian (FR-038a).

## Suites automatizadas

```bash
npx nx run domain:test              # dominio puro, sin emuladores
npx nx run application:test         # casos de uso con dobles de los puertos
npx nx run rules:test               # reglas contra el emulador (34 casos obligatorios)
npx nx run functions:test           # callable contra el emulador
npx nx e2e admin-e2e                # Playwright sobre emuladores
npx nx run-many -t lint             # incluye la frontera de capas
```

### Lo que CI bloquea (principio X)

El merge se rechaza si falla cualquiera de estas cuatro, sin excepción ni omisión por plazos:

| Suite | Qué garantiza |
|---|---|
| `rules:test` | Aislamiento entre comercios con cuentas compartidas, baja inmediata por comercio, y que el costo no se lee sin permiso |
| `domain:test` | Motor de variantes, topes y aritmética de dinero como funciones puras |
| `functions:test` | Que ningún cambio registrable se confirma sin su entrada de bitácora, en ambos sentidos |
| `lint` (frontera de capas) | Que `domain` no importe `infrastructure` ni SDK alguno |

Los criterios bajo *Objetivos de producto* del spec (SC-001, SC-002, SC-011) **no** están acá a
propósito: se verifican con pruebas de usuario y no bloquean el despliegue.

## Verificación manual del costo

Con el emulador no se mide costo. Para validar la estimación de `research.md` en un proyecto real
de pruebas: abrir el listado de catálogo y contrastar las lecturas facturadas en la consola con la
tabla de operaciones. **Comprobar en particular el sobrecosto del `get()` de las reglas**, estimado
en torno al 2%: el listado de 50 productos debería costar 51 lecturas, no 100. Confirmar ahí las
tarifas de escritura y almacenamiento, que no son legibles desde la documentación pública.
