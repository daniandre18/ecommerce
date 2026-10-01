# Research: Gestión de Catálogo con Control de Acceso por Rol

**Feature**: 001-catalog-rbac · **Fecha**: 2026-09-30 · **Fase**: 0 (segunda pasada)

Esta es la segunda pasada, tras la revisión de alcance del spec. Dos cambios del negocio obligaron
a rehacer el núcleo del diseño de autorización:

- **Una cuenta ahora pertenece a varios comercios** (FR-005). Esto invalidó la decisión anterior de
  llevar el inquilino en un custom claim, que era la base de todo el modelo de reglas.
- **La variante tiene tres importes y el costo es invisible sin su permiso** (FR-015, FR-028).
  Firestore **no** tiene seguridad a nivel de campo, así que esto obliga a cambiar la forma de los
  documentos.

Versiones verificadas contra npm y documentación oficial el 2026-09-30.

## 0. Verificación de versiones del stack

| Paquete | Versión publicada | Nota |
|---|---|---|
| `@angular/core`, `@angular/cli`, `@angular/ssr` | 22.2.0 | `^22.2` del brief es correcto y vigente |
| `@angular/material` | 22.2.1 | alineado con Angular 22 |
| `@angular/fire` | **20.1.0** | ⚠️ peer: `@angular/core ^20.0.0`. La 21 sigue en `rc-canary` |
| `firebase` (JS SDK modular) | 12.19.0 | sin peer de framework |
| `firebase-admin` | 14.5.0 | Node >= 18 |
| `firebase-functions` | 7.4.0 | Node >= 18 |
| `@firebase/rules-unit-testing` | 5.0.2 | |
| `nx` | 23.2.1 | |
| `vitest` | 5.0.3 | `@angular/build` acepta `^4.0.8 \|\| ^5.0.0` |
| `playwright` | 1.63.0 | |
| `typescript` | 7.0.2 publicada | ⚠️ **Angular 22 exige `>=6.0 <6.1`** |

### Decisión 0.1 — TypeScript 6.0.x, no 7.x

Fijar `typescript@~6.0.0`. `@angular/compiler-cli@22.2.0` declara
`peerDependencies.typescript: ">=6.0 <6.1"`. Instalar la 7.0.2 rompe la compilación aunque npm la
ofrezca como `latest`.

### Decisión 0.2 — Sin AngularFire; SDK modular `firebase` directo

No usar `@angular/fire`; consumir `firebase@12` solo dentro de `infrastructure/`. Dos razones
independientes: su versión estable exige `@angular/core ^20` (dos majors atrás, y la 21 sigue en
`rc-canary`), y su valor principal es la integración con zonas, que en una app **zoneless** no
aporta nada. Migrar más adelante sería cambiar adaptadores, no la aplicación.

## 1. Escritura: cliente vs Cloud Functions

**Decisión**: ninguna escritura desde el cliente. Las reglas niegan `write` en todo el árbol. Toda
mutación entra por Cloud Functions callable (2ª gen) con Admin SDK. Las lecturas van directas a
Firestore, acotadas por reglas.

**Razón**: FR-030 exige ahora que el cambio y su entrada de bitácora sean **una unidad
indivisible en ambos sentidos** — ni entrada sin cambio, ni cambio sin entrada. Eso es una
transacción, y las reglas de Firestore no pueden imponerla. Además FR-024, FR-025 y FR-021 son
invariantes multi-documento, y FR-010 exige verificación en servidor contra permisos frescos.

**Costo aceptado**: se pierde la escritura offline y el eco optimista nativo del SDK; se compensa
con actualización optimista en la interfaz y reintento (FR-039).

## 2. Modelo multi-inquilino: subcolecciones

**Decisión**: subcolecciones bajo `tenants/{tenantId}/…`.

```text
tenants/{tenantId}
  members/{uid}                       ← una membresía por cuenta POR COMERCIO
  roles/{roleId}
  invitations/{invitationId}
  products/{productId}
    variants/{variantId}              ← precio de venta y comparativo; SIN costo
    private/costs                     ← costos de todas las variantes del producto
  skuIndex/{SKU}
  auditLog/{entryId}
  securityEvents/{eventId}
  config/secrets · config/billing
```

**Razón**: el aislamiento queda estructural. La regla compara la ruta contra la pertenencia, sin
condiciones sobre `request.query` que haya que recordar escribir bien. Con colecciones planas y
campo `tenantId`, las reglas deberían validar la consulta declarada —porque **las reglas no
filtran**— y se volverían un enrejado de condiciones justo en la garantía que menos podemos
permitirnos fallar.

## 3. Identidad y autorización — rehecho

### 3.1 El problema que introdujo FR-005

El diseño anterior ponía `tenantId` en un custom claim y la regla era
`request.auth.token.tenantId == tenantId`: cero lecturas extra. Con una cuenta en varios comercios
esa regla ya no se puede escribir. Las salidas evaluadas:

| Opción | Costo de lectura | Problema |
|---|---|---|
| A. Claim de "comercio activo", refrescado al cambiar de tienda | Cero | **Hasta 1 hora de acceso de lectura tras dar de baja una membresía.** Incumple FR-008a ("pierde de inmediato todo acceso") |
| B. Claim con la lista de comercios | Cero | Mismo hueco de 1 hora, más el tope de 1000 bytes de los claims |
| C. **Las reglas leen la membresía** | +1 lectura por solicitud | Ninguno: siempre fresco |

### 3.2 El dato que decide

La documentación de Firestore confirma dos cosas que juntas cambian el cálculo:

1. En una consulta de colección, **las reglas se evalúan una vez contra la consulta, no una vez
   por documento**; un `get()` dentro de la regla corre **una sola vez** por evaluación.
2. Los resultados de `get()` se cachean dentro de una misma solicitud.

Es decir: listar 50 productos cuesta **51 lecturas en lugar de 50**, un 2% de sobrecosto. La
opción C no es cara; parecía cara.

### 3.3 Decisión

**Las reglas resuelven la autorización leyendo el documento de membresía. No se usan custom claims
para autorizar.**

```javascript
function membership(tenantId) {
  return get(/databases/$(database)/documents/tenants/$(tenantId)/members/$(request.auth.uid));
}
function isActiveMember(tenantId) {
  return request.auth != null && membership(tenantId).data.status == 'active';
}
```

**Lo que se gana**:
- **Revocación inmediata.** Desactivar una membresía corta el acceso de lectura en la siguiente
  solicitud, no en la próxima hora. Es FR-008a al pie de la letra, y también satisface la nota de
  FR-008: la autorización **no** depende de información embebida en un token cacheado.
- Cambiar de comercio no requiere refrescar el token: es navegación, no reautenticación.
- Desaparece por completo el tope de 1000 bytes y la complejidad de sincronizar claims.
- **No hace falta la multi-inquilinidad de Identity Platform**, que es de pago y no admite
  autenticación por teléfono: un solo grupo de usuarios de Firebase Auth, con el `uid` como única
  identidad.

**Lo que cuesta**: +1 lectura facturada por consulta y por lectura de documento suelto, mitigado
por la caché dentro de la solicitud.

**Alternativas descartadas**: A y B, por el hueco de hasta una hora tras revocar una membresía.
Ese hueco es precisamente lo que FR-008a prohíbe, y ningún ahorro del 2% lo justifica.

### 3.4 Qué verifica cada capa

| Capa | Qué decide | Cómo |
|---|---|---|
| Reglas de Firestore | ¿Pertenecés a este comercio? ¿Sos su Propietario? | 1 `get()` a `members/{uid}`; `isOwner` denormalizado ahí |
| Cloud Functions | ¿Tu rol concede este permiso concreto? | Lee `members/{uid}` y `roles/{roleId}` dentro de la transacción |

No hay lógica duplicada: cada capa responde una pregunta distinta. Las reglas cubren pertenencia y
titularidad, que son baratas de denormalizar; los permisos granulares se verifican solo donde se
escribe, que es el único lugar donde importan.

**Default-deny**: las reglas niegan todo `write` y toda lectura sin membresía activa. En
aplicación, `AuthorizationService.assert(permiso)` lanza salvo concesión explícita, y un rol recién
creado tiene la lista de permisos vacía (FR-009).

## 3bis. El costo no se puede esconder con reglas de campo

**Hallazgo**: FR-015 exige que, sin el permiso de costo, el importe de costo **no sea visible**.
Firestore **no tiene seguridad a nivel de campo**: si alguien puede leer el documento de la
variante, lee todos sus campos. Poner `cost` en la variante haría FR-015 inaplicable.

**Decisión**: el costo vive en un documento aparte, uno por producto:

```text
tenants/{tid}/products/{pid}/variants/{vid}   → sku, precio de venta, precio comparativo, stock
tenants/{tid}/products/{pid}/private/costs    → { [variantId]: costoDeAdquisicion }
```

**Razón**:
- La regla del documento de costos exige el permiso `cost.read`, verificable por sí sola.
- Un solo documento por producto: cargar los costos de las 100 variantes de un producto cuesta
  **una** lectura, no 100. Con el tope de 100 combinaciones (FR-025) y 1 MiB por documento, entra
  con enorme holgura.
- La tabla de variantes carga costos solo para quien puede verlos; para el resto ese documento ni
  se pide.

**Costo en reglas**: la regla del documento de costos necesita el permiso granular, que vive en el
rol. Son dos `get()` (membresía → rol) en lugar de uno, y solo en esa ruta. El tope es de 10 por
solicitud, así que sobra margen.

**Alternativas descartadas**: mantener `cost` en la variante y confiar en que la interfaz no lo
muestre — es exactamente lo que FR-010 prohíbe, ocultar en el cliente como único control. Y
enrutar la lectura de costos por una Cloud Function: más latencia y más costo que una lectura
directa con su propia regla.

## 4. SKU único por inquilino

**Decisión**: colección índice `tenants/{tenantId}/skuIndex/{SKU_NORMALIZADO}`, con el SKU
normalizado como id del documento, escrita en la misma transacción que la variante.

El `tenantId` ya está en la ruta, así que el id es el SKU solo. Dentro de `runTransaction`,
`tx.create` falla si el documento existe, lo que da atomicidad real frente a dos escrituras
simultáneas (FR-021). Normalización a mayúsculas y sin espacios al borde, para que `abc-1` y
`ABC-1` colisionen; la variante conserva la forma original que escribió la persona.

Archivar una variante **no** borra su entrada: la marca `archived: true` y el SKU queda reservado
para siempre (FR-023).

**Alternativa descartada**: consultar `where('sku','==',x)` antes de escribir. No es atómico.

## 5. Bitácora: tipos de evento, atomicidad y alcance ampliado

### 5.1 Atomicidad en ambos sentidos

FR-030 ya no dice "se registra antes de aplicarse" sino que ambos son **una unidad indivisible**.
Una transacción de Firestore lo da literalmente: el cambio y su entrada se confirman juntos o no se
confirma ninguno. No queda entrada sin cambio (que FR-032 prohibiría borrar para siempre) ni cambio
sin entrada.

```text
runTransaction:
  leer membresía + rol   → assert(permiso)
  leer variante          → valorAnterior
  escribir variante      → valorNuevo
  crear auditLog/{id}    → entrada con tipo de evento
```

### 5.2 Tipos de evento (FR-031) y alcance ampliado (FR-031a)

La entrada lleva un campo `type`. Los cuatro tipos mínimos del spec se implementan como una unión
etiquetada en el dominio, de modo que `before`/`after` tengan el tipo correcto en cada caso.

FR-031a suma a la bitácora lo que antes no se registraba: creación, edición y borrado de roles;
cambios de permisos; asignación y revocación de rol; alta y baja de membresía; y traspaso de
propiedad. **Consecuencia de diseño**: las funciones de equipo y roles, que antes no tocaban la
bitácora, ahora escriben en ella dentro de su misma transacción, con la misma regla de atomicidad.

Es el cambio de mayor valor de seguridad de esta revisión: el evento de mayor riesgo interno —que
alguien se conceda un permiso— pasa a ser inborrable y atribuible.

### 5.3 Inmutabilidad, consulta y retención

- Reglas: `allow read` para el Propietario; `create, update, delete: if false` para **todos**. El
  Admin SDK evade reglas por diseño, así que el `false` puede ser absoluto y sin excepciones
  (FR-032).
- La entrada guarda `actorUid` **y** una copia del nombre al momento del hecho: la bitácora se lee
  sin resolver cuentas y sobrevive a la desactivación de la membresía (FR-031).
- Índices compuestos por `(entity.id, at desc)`, `(actorUid, at desc)` y `(type, at desc)` para
  cubrir los filtros de FR-034 y el escenario 6 de la Historia 3 sin escaneo.
- Paginación por cursor, nunca `offset`: Firestore cobra los documentos saltados.
- Retención **7 años**, sin purga automática (FR-035). Pasado el plazo, la purga es una decisión
  explícita y auditada.
- Volumen: la edición masiva escribe una entrada por variante; con el tope de 100 combinaciones,
  el peor caso es 200 escrituras en una transacción. Los límites son 10 MiB por solicitud, 1 MiB
  por documento y 500 transformaciones de campo por commit: entra con holgura.

## 6. Analíticas (principio V)

Fuera de alcance por el spec. Decisión tomada para la feature futura, para no bloquearla desde
hoy: contadores incrementales por triggers para los indicadores de portada, con latencia aceptable
de hasta 60 segundos; exportación programada a BigQuery para lo analítico, con latencia de horas.
Firestore no agrega barato y contar miles de documentos por cada carga de panel es caro y lento.

Lo que esta feature respeta hoy: los cambios de precio y stock ya quedan en `auditLog` con marca de
tiempo, que es la materia prima de esos contadores. Riesgo anotado: un contador por inquilino es un
documento caliente; el patrón de contadores distribuidos se evaluará cuando el volumen lo pida.

## 7. Búsqueda del catálogo (SC-010)

**Contexto**: SC-010 pide que el 95% de las búsquedas de un comercio con 10.000 variantes responda
en menos de 1 segundo. Firestore no hace búsqueda de texto completo.

**Decisión**: **empezar sin motor de búsqueda dedicado** y sumarlo cuando la medición lo exija.

- Primera etapa: índices compuestos de Firestore para filtrar por estado, archivado y fecha, más
  búsqueda por prefijo sobre un campo `nameNormalized` (minúsculas, sin acentos). Cubre "buscar el
  producto que empieza con…", que es como se busca en un panel de administración.
- Disparador para la segunda etapa: si las pruebas de usuario muestran que hace falta buscar por
  término suelto, por SKU parcial o con tolerancia a errores de tipeo.
- Segunda etapa, si llega: motor externo sincronizado por trigger. Cobran por registro y por
  búsqueda, **no por asiento**, así que no comprometen el principio rector; sí agregan costo y la
  obligación de mantener la sincronización.

**Razón**: montar un motor de búsqueda antes de saber si el filtrado por prefijo alcanza es
infraestructura y sincronización pagadas por adelantado contra un problema no demostrado. El spec
lo deja explícitamente como decisión de esta fase, y esta fase decide medir primero.

## 8. Costo operativo: verificación de "sin cargo por asiento"

| Componente | Modelo de cobro | ¿Cobra por asiento? |
|---|---|---|
| Firestore | Por operación y almacenamiento | **No** |
| Cloud Functions 2ª gen / Cloud Run | Por invocación y GB-segundo | **No** |
| Cloud Storage | Por GB y transferencia | **No** |
| Firebase Hosting | Por transferencia y almacenamiento | **No** |
| App Check | Sin costo propio | **No** |
| **Firebase Auth** | **Por usuario activo mensual** | **Sí, indirectamente** ⚠️ |

**Nota favorable de esta revisión**: al permitir que una cuenta esté en varios comercios, una
persona que trabaja para tres tiendas es **un** MAU, no tres. El cambio de FR-005 no solo evitó
Identity Platform de pago: también reduce el conteo de usuarios activos.

**El punto de fricción sigue siendo Auth**: gratis hasta 50.000 MAU, y por encima se factura por
usuario. Análisis honesto:
1. Aquí solo se autentican colaboradores, no compradores. 50.000 MAU es mucho volumen de
   plataforma.
2. El costo marginal por usuario es de centavos y lo absorbe **la plataforma**, no el comerciante.
3. **Restricción de producto que este plan fija**: el precio al comerciante MUST NOT tener un
   componente por colaborador. Si el costo de Auth llegara a pesar, se resuelve con volumen o
   cambiando de proveedor de identidad, nunca cobrando asientos.

### Estimación de operaciones

Tarifa verificable directamente: **lecturas USD 0,06 por 100.000** en edición Standard. Las de
escritura y almacenamiento no son legibles desde la documentación pública (las tablas se renderizan
por JavaScript); conviene confirmarlas en la consola antes de comprometer cifras. El modelo de
abajo está en **operaciones**, que es lo que el diseño controla.

Comercio de referencia: 500 productos, 2.000 variantes, 5 colaboradores, 20 jornadas al mes.

| Operación | Lecturas | Escrituras |
|---|---|---|
| Listado de catálogo (50 productos) | 50 + **1** de la regla | 0 |
| Abrir un producto con 20 variantes | 21 + **1** de la regla | 0 |
| Abrir sus costos (con permiso) | 1 + **2** de la regla | 0 |
| Editar precio de 1 variante | ~3 en la Function | 2 (variante + bitácora) |
| Edición masiva de 20 variantes | ~22 | 40 |
| Crear producto con 20 variantes | ~3 | 42 |
| Cambiar los permisos de un rol | ~2 | 2 (rol + bitácora) |

Estimado mensual por comercio activo: **≈ 62.000 lecturas y ≈ 8.000 escrituras**, frente a las
60.000 lecturas de la primera pasada. **El `get()` de las reglas agrega cerca del 2%** y compra
revocación inmediata. Las lecturas quedan en torno a **USD 0,04 mensuales por comercio**.

El costo sigue dominado por la actividad de catálogo, no por el tamaño del equipo, que es lo que
el principio rector exige demostrar.

**Palancas que este diseño aplica**: nombre del actor copiado en la entrada de bitácora; costos
agrupados en un documento por producto; paginación por cursor; listado que no lee variantes.

## 9. Decisiones de frontend

### 9.1 Angular Material + CDK, sin Tailwind

FR-038a exige WCAG 2.2 AA, incluidas la operación completa por teclado y el anuncio accesible de
los cambios de estado en la tabla de variantes con edición en línea. El CDK trae `LiveAnnouncer`,
`FocusTrap` y `FocusMonitor`: exactamente esa lista. Construirlo sobre utilidades de Tailwind es
reimplementar accesibilidad probada; sumar ambos es mantener dos sistemas de estilo.

Tailwind v4 era viable (es peer soportado por `@angular/build`); se descarta por el costo de
accesibilidad, no por el de estilos. Angular Aria, estable en v22, queda como salida para widgets
headless que Material no cubra.

### 9.2 Sin SSR

Un panel autenticado y por inquilino no se cachea en CDN. SSR agregaría un salto a Cloud Run por
navegación para entregar un esqueleto, porque los datos se piden igual después. El principio VIII
se cumple con esqueletos (FR-036). La tienda pública, fuera de alcance, es donde SSR sí paga.

### 9.3 Selector de comercio (nuevo, por FR-005)

Con cuentas en varios comercios hace falta un selector explícito. El comercio activo es **estado
de la interfaz y de la ruta** (`/t/{tenantId}/…`), no un claim: cambiar de tienda es navegación,
sin refrescar token. Toda llamada a una callable envía el `tenantId` de la ruta, y la Function
**verifica la membresía** antes de actuar — el cliente propone, el servidor comprueba (FR-003).

### 9.4 Nx

La razón decisiva es `@nx/enforce-module-boundaries`: la regla de dependencias de la arquitectura
limpia pasa de acuerdo a error de lint que CI bloquea. Además el repositorio es políglota (app
Angular + funciones Node + librerías compartidas).

### 9.5 Pruebas

Vitest 5 para dominio y aplicación sin emuladores (es peer soportado por `@angular/build`);
Emulator Suite + `@firebase/rules-unit-testing` 5 para reglas; Playwright 1.63 de extremo a
extremo.

## 10. Subida de imágenes: directo a Storage, validada por reglas (cambio en T060)

**Decisión**: el panel sube cada imagen directo a Cloud Storage, a
`tenants/{t}/products/{p}/images/{nombre-nuevo}`. `storage.rules` —que corren en el servidor—
exigen membresía activa con `catalog.write` (o ser Propietario), tipo `image/jpeg|png|webp|avif|gif`,
hasta 5 MB, y solo crear: una imagen subida no se reemplaza ni se borra desde el cliente. La
referencia, con su texto alternativo obligatorio (FR-038a), se guarda aparte y solo por callable
(`updateProductDetails` para el producto, `setVariantImages` para cada variante), que valida que la
ruta esté bajo la carpeta del producto. El cliente sigue sin escribir en Firestore.

**Por qué cambió**: el plan preveía una URL firmada de corta duración emitida por una Cloud
Function. Firmar exige una cuenta de servicio real (`authClient.sign`), que un proyecto `demo-*` no
tiene: ese camino no se podía probar contra los emuladores, ni en local ni en CI, y el principio X
exige que las compuertas lo verifiquen. Las reglas de Storage hacen las mismas validaciones del lado
del servidor y se prueban contra el emulador (`tests/rules/storage-images.spec.ts`).

**Costos y límites**: cada subida cuesta dos lecturas de Firestore en las reglas (membresía y rol).
Una imagen subida y nunca referenciada queda huérfana, igual que con la URL firmada; su limpieza
periódica queda fuera de esta feature. Los topes (5 MB y tipos) están en dos lugares —el dominio
para avisar antes de subir y las reglas para hacerlos cumplir—, y cambian juntos.

## Riesgos abiertos

| Riesgo | Mitigación |
|---|---|
| El `get()` de reglas en cada lectura agrega costo y una dependencia de disponibilidad | Medido en ~2%; si alguna vista resulta cara, se agrupan lecturas por solicitud para aprovechar la caché |
| Tarifas de escritura y almacenamiento no verificables desde documentación pública | Confirmar en la consola antes de comprometer cifras. El modelo de operaciones no cambia |
| La búsqueda por prefijo puede no alcanzar para SC-010 | Disparador explícito y motor externo como segunda etapa (§7) |
| `@angular/fire` podría estabilizarse | Los adaptadores aíslan el SDK: migrar sería cambiar `infrastructure/` |
| El constructor de roles personalizados es alcance grande | Entrega por etapas; ver Complexity Tracking en `plan.md` |

## Fuentes

- [Angular v22](https://angular.dev/events/v22) — Signal Forms, Angular Aria y señales asíncronas estables
- [Zoneless](https://angular.dev/guide/zoneless) — estable y predeterminado desde v21
- [Reglas y consultas](https://firebase.google.com/docs/firestore/security/rules-query) — las reglas se evalúan por consulta, no por documento; no filtran
- [Condiciones en reglas](https://firebase.google.com/docs/firestore/security/rules-conditions) — `get()` se factura, tope de 10/20, caché por solicitud
- [Custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) — límite de 1000 bytes y propagación por refresco de token
- [Cuotas de Firestore](https://firebase.google.com/docs/firestore/quotas) — 10 MiB por solicitud, 1 MiB por documento
- [Precios de Firebase](https://firebase.google.com/pricing) — capas gratuitas y MAU de Auth
- [Precios de Firestore](https://cloud.google.com/firestore/pricing) — lecturas USD 0,06 / 100.000
