# Contrato: reglas de seguridad de Firestore y Storage

**Feature**: 001-catalog-rbac · **Fase**: 1 (segunda pasada)

Las reglas responden tres preguntas, y solo tres: *¿tenés membresía activa en este comercio?*,
*¿sos su Propietario?* y, únicamente en la ruta de costos, *¿tu rol concede ver el costo?*. El
resto de los permisos granulares se verifica en las Cloud Functions, que son las únicas que
escriben.

**Cambio respecto de la primera pasada**: ya no hay un claim con el inquilino. Una cuenta pertenece
a varios comercios (FR-005), así que la pertenencia se resuelve leyendo la membresía. Cuesta +1
lectura por solicitud —las reglas se evalúan una vez por consulta, no por documento— y compra
revocación inmediata, que es lo que FR-008a exige.

## Forma de las reglas de Firestore

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function member(tenantId) {
      return get(/databases/$(database)/documents/tenants/$(tenantId)/members/$(request.auth.uid)).data;
    }

    function isActiveMember(tenantId) {
      return request.auth != null
        && exists(/databases/$(database)/documents/tenants/$(tenantId)/members/$(request.auth.uid))
        && member(tenantId).status == 'active';
    }

    function isOwnerOf(tenantId) {
      return isActiveMember(tenantId) && member(tenantId).isOwner == true;
    }

    function hasPermission(tenantId, permission) {
      return isActiveMember(tenantId)
        && permission in get(/databases/$(database)/documents/tenants/$(tenantId)/roles/$(member(tenantId).roleId)).data.permissions;
    }

    match /tenants/{tenantId} {
      // Legible por miembros activos. El documento del comercio (nombre, moneda, estado): el panel
      // los necesita para mostrar y cargar importes. Alcanza solo a este documento, no a las
      // subcolecciones.
      allow read: if isActiveMember(tenantId);
      match /products/{productId} {
        allow read: if isActiveMember(tenantId);
        match /variants/{variantId} { allow read: if isActiveMember(tenantId); }
        // Costos: documento aparte porque Firestore no protege campos sueltos (FR-015)
        match /private/{docId} {
          allow read: if isOwnerOf(tenantId) || hasPermission(tenantId, 'variant.cost.read');
        }
      }
      match /roles/{roleId} { allow read: if isActiveMember(tenantId); }
      match /members/{memberUid} {
        allow read: if (request.auth != null && request.auth.uid == memberUid) || isOwnerOf(tenantId);
      }

      // Solo el Propietario (FR-014, FR-032, FR-034)
      match /invitations/{invitationId} { allow read: if isOwnerOf(tenantId); }
      match /config/{docId}             { allow read: if isOwnerOf(tenantId); }
      match /auditLog/{entryId}         { allow read: if isOwnerOf(tenantId); }
      match /securityEvents/{eventId}   { allow read: if isOwnerOf(tenantId); }
    }
    // Ninguna regla concede `write`. Todo lo no listado queda denegado.
  }
}
```

### ⚠️ No usar un comodín bajo el inquilino — corrección de la versión anterior de este contrato

La versión anterior de este documento proponía un `match /tenants/{tenantId}/{document=**}` con
`allow read` para miembros, y afirmaba que bastaba con **colocar las reglas específicas antes del
comodín**. **Eso era falso**, y se detectó al implementar la fase 2: Firestore combina con OR
todas las reglas que coinciden con un documento, **sin importar el orden textual**. El comodín
coincide también con `config/secrets` y `auditLog`, así que concedía su lectura a **cualquier
colaborador activo**, por más que existiera una regla de "solo Propietario". Una prueba contra el
emulador lo confirmó: el rol de Catálogo leía credenciales de pasarelas, facturación y bitácora.

La forma correcta es la de arriba: **una lista explícita de colecciones legibles**, con denegación
por defecto para todo lo demás. Ninguna ruta legible por miembros puede superponerse con una ruta
reservada al Propietario. La prueba de regresión es
`tests/rules/member-cannot-read-owner-paths.spec.ts`, y se verificó que falla si se reintroduce el
comodín.

**Sobre el costo de `get()`**: `member(tenantId)` se invoca varias veces dentro de una misma
evaluación, pero las llamadas de acceso a documentos se cachean por solicitud, así que no se paga
una lectura por invocación. La ruta de costos es la única que usa dos documentos distintos
(membresía y rol) y sigue muy por debajo del tope de 10 llamadas por solicitud.

**Ninguna regla concede escritura**, ni siquiera al Propietario. El Admin SDK de las Cloud
Functions evade las reglas por diseño, así que no conceder nada aquí no impide operar: solo
garantiza que ningún cliente escriba nunca, y que la bitácora sea inmutable para todo el mundo
(FR-032).

**Storage exige membresía *activa*, no solo existente.** La versión anterior de este contrato
comprobaba `firestore.exists(...)` sin mirar el estado, lo que dejaba a una membresía dada de baja
leyendo imágenes, en contra de FR-008a. La implementación compara además `status == 'active'`.

## Reglas de Cloud Storage

```javascript
service firebase.storage {
  match /b/{bucket}/o {
    match /tenants/{tenantId}/{allPaths=**} {
      allow read:  if request.auth != null
                   && firestore.exists(/databases/(default)/documents/tenants/$(tenantId)/members/$(request.auth.uid))
                   && firestore.get(/databases/(default)/documents/tenants/$(tenantId)/members/$(request.auth.uid)).data.status == 'active';
      allow write: if false;   // subida por URL firmada emitida por la Function
    }
  }
}
```

Las imágenes se suben con URL firmada de duración corta, emitida por una Cloud Function que antes
verifica `catalog.write`. La validación de tipo y tamaño ocurre del lado del servidor y el cliente
nunca escribe directo.

## Suite de pruebas de reglas (tarea de primera clase, principio X)

Se ejecuta con `@firebase/rules-unit-testing` 5 contra el emulador. **Cada fila es un caso
obligatorio y CI bloquea el merge si alguno falla.**

### Aislamiento entre inquilinos (FR-002, principio VI)

| # | Actor | Acción | Esperado |
|---|---|---|---|
| 1 | Miembro activo de `t1` | Leer `tenants/t1/products/p1` | **Permitido** |
| 2 | Miembro de `t1` sin membresía en `t2` | Leer `tenants/t2/products/p1` | **Denegado** |
| 3 | Ídem, conociendo el id exacto | Leer `tenants/t2/products/p1` | **Denegado** |
| 4 | Ídem | Consultar la colección `tenants/t2/products` | **Denegado** |
| 5 | Sin autenticar | Leer cualquier cosa | **Denegado** |
| 6 | Autenticado sin ninguna membresía | Leer `tenants/t1/products/p1` | **Denegado** |
| 7 | Miembro con `status: 'invited'` (aún no aceptó) | Leer `tenants/t1/products/p1` | **Denegado** (FR-007) |
| 36 | Cuenta con membresías en `t1` y `t2` | Consulta de grupo sobre `members` filtrada por su uid; filtrada por otro uid; sin filtro | **Permitido** (sus dos membresías); **Denegado**; **Denegado** (T075) |
| 35 | Miembro activo de `t1` | Leer el documento `tenants/t1`; y el de `tenants/t2` | **Permitido**; **Denegado** (agregado en T054: el panel necesita el nombre y la moneda) |

### Cuentas en varios comercios (FR-005) — casos nuevos de esta revisión

| # | Actor | Acción | Esperado |
|---|---|---|---|
| 8 | Cuenta con membresía en `t1` **y** en `t2` | Leer `tenants/t1/products/p1` | **Permitido** |
| 9 | La misma cuenta | Leer `tenants/t2/products/p1` | **Permitido** |
| 10 | La misma cuenta, Propietaria en `t1` y colaboradora en `t2` | Leer `tenants/t1/config/secrets` | **Permitido** |
| 11 | La misma cuenta | Leer `tenants/t2/config/secrets` | **Denegado** — ser Propietario en `t1` no concede nada en `t2` |
| 12 | Cuenta con membresía en `t1` y `t2`, **desactivada en `t2`** | Leer `tenants/t1/products/p1` | **Permitido** |
| 13 | La misma | Leer `tenants/t2/products/p1` | **Denegado** — la baja es por comercio (FR-008a) |
| 14 | Membresía desactivada **mientras tiene sesión activa** | Leer cualquier documento de ese comercio | **Denegado en la solicitud siguiente**, sin esperar a que expire el token (FR-008, FR-008a) |

### Costo de adquisición (FR-015) — casos nuevos de esta revisión

| # | Actor | Acción | Esperado |
|---|---|---|---|
| 15 | Rol de Catálogo | Leer `products/p1/private/costs` | **Denegado** |
| 16 | Rol con `variant.price.write` pero sin `variant.cost.read` | Leer `products/p1/private/costs` | **Denegado** |
| 17 | Rol con `variant.cost.read` | Leer `products/p1/private/costs` | **Permitido** |
| 18 | Propietario | Leer `products/p1/private/costs` | **Permitido** |
| 19 | Rol de Catálogo | Leer `products/p1/variants/v1` | **Permitido** — y el documento **no contiene** el costo |

El caso 19 es la prueba de que la separación de documentos es real y no decorativa.

### Secretos y facturación (FR-014)

| # | Actor | Acción | Esperado |
|---|---|---|---|
| 20 | Colaborador de catálogo de `t1` | Leer `tenants/t1/config/secrets` | **Denegado** |
| 21 | Colaborador de catálogo de `t1` | Leer `tenants/t1/config/billing` | **Denegado** |
| 22 | Propietario de `t1` | Leer `tenants/t1/config/secrets` | **Permitido** |
| 23 | Colaborador con rol personalizado con **todos** los permisos concedibles | Leer `config/secrets` | **Denegado** — ningún permiso concedible alcanza (FR-014) |

### Ninguna escritura desde el cliente (FR-010)

| # | Actor | Acción | Esperado |
|---|---|---|---|
| 24 | Colaborador de catálogo | Escribir `products/p1` directo | **Denegado** |
| 25 | Colaborador de catálogo | Escribir `variants/v1.price` directo | **Denegado** — la prueba de que no puede escribir precios ni evitando la interfaz (FR-013, US2 escenario 6) |
| 26 | Colaborador de catálogo | Escribir `products/p1/private/costs` | **Denegado** |
| 27 | **Propietario** | Escribir `products/p1` directo | **Denegado** — ni el dueño escribe desde el cliente |

### Bitácora inmutable (FR-032)

| # | Actor | Acción | Esperado |
|---|---|---|---|
| 28 | Propietario | Leer `auditLog` de su comercio | **Permitido** |
| 29 | Colaborador de catálogo | Leer `auditLog` | **Denegado** |
| 30 | **Propietario** | Actualizar una entrada de `auditLog` | **Denegado** |
| 31 | **Propietario** | Borrar una entrada de `auditLog` | **Denegado** |
| 32 | Propietario | Crear una entrada de `auditLog` a mano | **Denegado** |

### Superposición con rutas del Propietario

| # | Caso | Esperado |
|---|---|---|
| 33 | Un miembro activo no Propietario lee `config/secrets`, `config/billing`, `auditLog` y la membresía de otra persona | **Denegado** |
| 34 | Un miembro activo sin `variant.cost.read` lee `private/costs` | **Denegado** |

Ambos atrapan la reintroducción de una regla amplia —típicamente un comodín `{document=**}`— que se
superponga con una ruta reservada. En Firestore **el orden de las reglas no importa**: lo que
importa es que ninguna concesión amplia coincida con una ruta restringida. Implementados en
`tests/rules/member-cannot-read-owner-paths.spec.ts` desde la fase 2; verificado que fallan si se
reintroduce el comodín.

## Lo que estas reglas **no** cubren

Los permisos granulares de **escritura** (`variant.price.write` frente a `catalog.write`, o
`variant.cost.write`) no se prueban aquí porque las reglas niegan toda escritura: no hay nada que
diferenciar. Su verificación vive en las pruebas de los casos de uso, con dobles de los puertos y
sin emulador, y en las pruebas de integración de las callable contra el emulador.
