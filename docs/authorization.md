# Modelo de autorización

Cómo decide el sistema qué puede hacer cada cuenta en cada comercio, qué capa decide qué, y por qué
los permisos no viajan en el token de sesión. Requisitos de origen: FR-003 a FR-016, FR-040 y
FR-041 de `specs/001-catalog-rbac/spec.md`.

## Las piezas

| Pieza | Dónde vive | Qué es |
|---|---|---|
| **Cuenta** | Firebase Auth | La persona que inicia sesión. No pertenece a ningún comercio por sí misma. |
| **Membresía** | `tenants/{t}/members/{uid}` | El vínculo de una cuenta con **un** comercio: su rol, si es la Propietaria (`isOwner`) y su estado (`invited`, `active`, `disabled`). Una cuenta puede tener una en cada comercio (FR-005). |
| **Rol** | `tenants/{t}/roles/{roleId}` | Una lista de permisos del enumerado `Permission`. El rol `owner` no concede nada: la Propietaria puede todo por `isOwner`. |
| **Permiso** | `libs/domain/src/value-objects/permission.ts` | Uno de un catálogo cerrado. Lo que es solo de la Propietaria —credenciales, facturación, administrar el equipo— **no existe** como permiso, así que ningún rol lo puede conceder (FR-014). |

La regla es una sola, `allows` en el dominio: **la Propietaria puede todo; el resto, solo lo que
concede su rol**, y solo con la membresía activa.

## Qué decide cada capa

### 1. Reglas de Firestore y de Storage — las lecturas

El panel lee directo de Firestore: no hay funciones de lectura. Las reglas (`firestore.rules`)
responden casi siempre dos preguntas, leyendo la membresía de quien pide:

- ¿tiene membresía **activa** en este comercio? → catálogo, roles, el documento del comercio;
- ¿es su **Propietaria**? → membresías ajenas, invitaciones, configuración, bitácora.

La única lectura que mira un permiso es el costo (`products/{p}/private/costs`): Propietaria o
`variant.cost.read`. Por eso el costo vive en un documento aparte: Firestore no protege campos
sueltos (FR-015).

Las reglas **no conceden ninguna escritura**. Y no hay un comodín `{document=**}` bajo el comercio:
Firestore combina con OR todas las reglas que coinciden, así que un comodín de lectura para miembros
abriría también lo que es solo de la Propietaria (prueba: `tests/rules/member-cannot-read-owner-paths.spec.ts`).

La bitácora es solo de la Propietaria aunque exista `audit.read`: registra cambios de costo, y
concederla mostraría costos a quien no tiene el permiso (`contracts/firestore-rules.md`).

### 2. La guarda de las Cloud Functions — las escrituras

Toda escritura pasa por una callable, y toda callable por `guarded()`
(`apps/functions/src/bootstrap/guard.ts`), en este orden:

1. sesión iniciada;
2. App Check válido;
3. `tenantId` bien formado (lo propone el cliente: una cuenta puede estar en varios comercios);
4. dentro de la **misma transacción** de la operación: membresía activa y lo que exige el caso de
   uso (`requires`), que es uno de tres:
   - `permission`: un permiso del enumerado, con `allows`;
   - `owner`: ser la Propietaria (equipo, roles, invitaciones, traspaso);
   - `account`: solo sesión, para aceptar una invitación, porque quien acepta todavía no es miembro;
5. recién entonces, el caso de uso.

Que la verificación ocurra dentro de la transacción importa: una baja o un permiso retirado en
paralelo no se cuela. Las denegaciones se registran como evento de seguridad (FR-004), y la
respuesta no distingue "no sos miembro" de "no tenés el permiso", para no revelar si el comercio
existe.

Los casos de uso declaran lo que exigen (`static readonly requires`), y una prueba recorre todos
contra el permiso equivocado (`libs/application/src/use-cases/authorization.spec.ts`).

### 3. El panel — solo cosmética

El panel escucha la membresía y el rol de la cuenta en el comercio abierto
(`TenantDirectory.watchAccess`) y aplica la misma regla `allows` para **no ofrecer** lo que el
servidor rechazaría (FR-040): oculta acciones (`*appHasPermission`), deja campos de solo lectura y
ni siquiera pide el costo sin `variant.cost.read`. No protege nada: una prueba e2e
(`team-and-permissions.spec.ts`) llama a las callable y escribe directo en Firestore saltándose el
panel, y las dos vías se niegan.

## Por qué los permisos no viajan en el token

La alternativa habitual es poner el rol o los permisos en *custom claims* del token de Firebase Auth
y que reglas y funciones los lean de ahí, sin leer Firestore. Se descartó porque:

- **Una cuenta está en varios comercios** (FR-005), con un rol distinto en cada uno. Los claims son
  de la cuenta, no de la membresía, y tienen un tope de 1.000 bytes: no escalan a "un rol por
  comercio".
- **Quitar un permiso o dar de baja tiene que regir en la operación siguiente** (FR-008, FR-008a).
  Un token vive hasta una hora; cambiar un claim no lo invalida, y revocar tokens corta la sesión
  entera, en todos los comercios, no solo en el afectado.
- **El costo es bajo**: las reglas leen la membresía con `get()`, que Firestore cuenta una vez por
  solicitud y no por documento devuelto. Listar 50 productos cuesta 51 lecturas, no 100
  (`specs/001-catalog-rbac/research.md` §3; la medición real es la tarea T096).

El precio que se paga es una lectura más por solicitud y que reglas y funciones dependan de que la
membresía exista. A cambio, la membresía es la única fuente de verdad: lo que dice ahí rige en la
próxima lectura y en la próxima escritura, sin esperar a que venza un token.

## Dónde mirar

| Para | Archivo |
|---|---|
| La regla | `libs/domain/src/value-objects/permission.ts` (`allows`) |
| Las lecturas | `firestore.rules`, `storage.rules`, `specs/001-catalog-rbac/contracts/firestore-rules.md` |
| Las escrituras | `apps/functions/src/bootstrap/guard.ts`, `libs/application/src/services/authorization.service.ts` |
| Lo que exige cada operación | `requires` de cada caso de uso en `libs/application/src/use-cases/` |
| El panel | `apps/admin/src/app/tenant/current-access.ts`, `apps/admin/src/app/shared/directives/has-permission.directive.ts` |
| Las pruebas | `tests/rules/`, `libs/application/src/use-cases/authorization.spec.ts`, `apps/admin-e2e/src/team-and-permissions.spec.ts` |
