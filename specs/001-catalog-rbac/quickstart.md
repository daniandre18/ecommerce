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
npx nx run functions:build          # las callable corren desde su paquete compilado
firebase emulators:start --only auth,firestore,functions,storage --project demo-ecommerce
npx nx serve admin                  # en otra terminal: panel en http://localhost:4200
```

Cada vez que cambia el código de las Functions hay que volver a correr `functions:build`: el
emulador recarga el paquete compilado, no las fuentes.

`nx serve admin` usa la configuración de desarrollo, que apunta siempre a los emuladores con el
proyecto `demo-ecommerce`; solo el build de producción reemplaza ese entorno por el del proyecto real.
El panel se niega a usar los emuladores con un proyecto que no sea `demo-*`.

Al entrar, una cuenta con un solo comercio va directo a su catálogo (`/t/t1/catalog` para el
escenario sembrado); con varios, elige de la lista y cambia desde el encabezado (T075).

### Datos de prueba

Con los emuladores corriendo, en otra terminal:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-ecommerce npx nx run tools:seed
```

Crea las cuentas, los comercios, sus roles predefinidos y las membresías. Es idempotente. **No crea
productos**: el catálogo arranca vacío, que es justamente el estado de vacío que hay que ver
primero (FR-037).

Los dos comercios operan en pesos colombianos (COP), sin decimales: un precio se escribe "52.000"
o "52000".

Todas las cuentas usan la contraseña `test-1234`, que solo existe en los emuladores: el sembrador
se niega a correr contra un proyecto que no sea `demo-*`.

| Comercio | Propietaria | Rol de Catálogo |
|---|---|---|
| `t1` | `owner@t1.test` | `catalogo@t1.test`, `multi@test` |
| `t2` | `multi@test` | — |

`multi@test` es la cuenta que prueba FR-005: Propietaria en `t2` y colaboradora en `t1`. Cada
comercio tiene exactamente un Propietario (FR-011).

Las pruebas e2e (`npx nx e2e admin-e2e`) levantan sus propios emuladores si no hay unos corriendo,
**borran Firestore** y siembran de nuevo. Para correrlas sobre una sesión en curso sin perder lo
cargado: `E2E_KEEP_DATA=1 npx nx e2e admin-e2e`.

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

1. Como Propietaria, en **Equipo**, invitar a `nuevo@t1.test` y copiar el enlace. Abrirlo en otro
   navegador: pide iniciar sesión, y desde ahí **Crear una** cuenta con ese correo. Antes de aceptar
   no accede a nada (FR-007); al aceptar, entra al catálogo.
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
2. En `t2` (Propietaria): el encabezado ofrece **Equipo** y **Bitácora**. Credenciales de pago y
   facturación no tienen vista en esta feature; sus reglas las reservan a la Propietaria y lo
   prueban las suites de reglas.
3. Desde **Cuenta → Cambiar de comercio**, pasar a `t1` (colaboradora): ni Equipo ni Bitácora, sin
   volver a autenticarse. Ser dueña en `t2` no concede nada en `t1` (caso 11 de las pruebas de
   reglas).
4. Con `multi@test` conectada en `t1`, dar de baja su membresía en `t1` desde la sesión de
   `owner@t1.test` → su pantalla en `t1` pasa en el acto a "No pudimos abrir este comercio", **y su
   acceso a `t2` sigue intacto** (FR-008a). Reactivarla después, para no alterar el escenario.
5. Como `multi@test` en `t2`, invitar a `catalogo@t1.test` → se le suma una membresía nueva, no se crea otra
   cuenta, y ninguno de los dos comercios ve datos del otro (escenario 13 de la Historia 2).

### Historia 3 — Bitácora

1. Como Propietaria, abrir **Bitácora** en el encabezado y filtrar por persona, por rango de fechas
   y **por tipo de evento** (FR-034). Para filtrar por producto, entrar al producto y seguir **Ver
   sus cambios en la bitácora**. Los filtros quedan en la dirección: se pueden compartir.
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
6. Como `catalogo@t1.test`, leer la bitácora → denegado, y el encabezado ni la ofrece. Tampoco la lee
   un rol con "Ver la bitácora": incluye costos (ver `contracts/firestore-rules.md`).

### Historia 4 — Móvil y accesibilidad

1. A 360 px de ancho: ninguna vista requiere desplazamiento horizontal, incluida la tabla de
   variantes (FR-038).
2. Con la red limitada a 3G lenta: cada vista muestra esqueleto de inmediato y el contenido lo
   reemplaza **sin** desplazar lo que ya se estaba mirando (FR-036, SC-009).
3. Cortar la red y abrir un producto que no se había abierto → a los 10 segundos, estado de error
   con reintento, nunca "0 variantes"; al volver la red, se recupera solo (FR-037). Abrir sin red
   una vista que todavía no se había visitado → aviso "No pudimos abrir esa vista" con reintento.
   Recargar la página sin red no se puede: el panel no funciona sin conexión.
4. Comercio sin productos → estado de vacío con acción de crear (FR-037).
5. Editar precio en la tabla y cortar la red al guardar → el valor queda escrito con el aviso, y
   con la red de vuelta, Enter lo reintenta tal cual. Salir del editor con algo sin guardar
   pregunta antes (FR-039).
6. Recorrer el alta de producto **solo con teclado**, incluida la tabla con edición en línea, y
   comprobar con lector de pantalla que los cambios de estado se anuncian (FR-038a).

## Suites automatizadas

```bash
npx nx run-many -t lint,typecheck,test   # lint (con la frontera de capas), tipos y unitarias
# Contra los emuladores (sin los de la sesión en curso, o con otros puertos):
firebase emulators:exec --only firestore,storage --project demo-ecommerce "npm run test:rules"
firebase emulators:exec --only auth,firestore,storage --project demo-ecommerce \
  "npm run test:infrastructure && npm run test:functions && npm run test:tools"
npx nx e2e admin-e2e                     # Playwright: escritorio y 360 px
```

### Lo que CI bloquea (principio X)

El merge se rechaza si falla cualquiera de estos cinco trabajos (`.github/workflows/ci.yml`), sin
excepción ni omisión por plazos:

| Trabajo | Qué garantiza |
|---|---|
| `lint` | Estilo y frontera de capas: `domain` no importa `infrastructure` ni SDK alguno |
| `typecheck` | Tipos de todos los proyectos, incluidas las pruebas |
| `unit` | Dominio (motor de variantes, topes, dinero), casos de uso con dobles, functions y panel |
| `rules` | Aislamiento entre comercios con cuentas compartidas, baja inmediata por comercio, costo y bitácora solo con permiso |
| `integration` | Que ningún cambio registrable se confirma sin su entrada de bitácora, en ambos sentidos; adaptadores contra Firestore; sembrador |

**Las e2e no corren en CI**: se corren localmente antes de abrir cada PR. Llevarlas a CI exige
navegadores y el emulador de Functions en el runner.

Los criterios bajo *Objetivos de producto* del spec (SC-001, SC-002, SC-011) **no** están acá a
propósito: se verifican con pruebas de usuario y no bloquean el despliegue.

## Verificación manual del costo

Con el emulador no se mide costo. Para validar la estimación de `research.md` en un proyecto real
de pruebas: abrir el listado de catálogo y contrastar las lecturas facturadas en la consola con la
tabla de operaciones. **Comprobar en particular el sobrecosto del `get()` de las reglas**, estimado
en torno al 2%: el listado de 50 productos debería costar 51 lecturas, no 100. Confirmar ahí las
tarifas de escritura y almacenamiento, que no son legibles desde la documentación pública.
