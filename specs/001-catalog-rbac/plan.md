# Implementation Plan: Gestión de Catálogo con Control de Acceso por Rol

**Branch**: `001-catalog-rbac` | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-catalog-rbac/spec.md`

**Revisión**: segunda pasada, tras la revisión de alcance del spec. Dos cambios del negocio
obligaron a rehacer el núcleo del diseño de autorización, no a retocarlo.

## Summary

Panel de administración multi-inquilino para gestionar catálogo con variantes, con permisos por rol
y bitácora inmutable. Cuatro hechos determinan la forma del sistema:

1. **FR-030 exige que el cambio y su entrada de bitácora sean una unidad indivisible en ambos
   sentidos.** Firestore no puede imponer eso desde las reglas. Por lo tanto **ninguna escritura
   sale del cliente**: todas las mutaciones pasan por Cloud Functions callable con Admin SDK,
   dentro de una transacción.
2. **FR-005 permite que una cuenta pertenezca a varios comercios.** Eso invalidó el modelo anterior
   de llevar el inquilino en un custom claim. Ahora **las reglas resuelven la pertenencia leyendo
   el documento de membresía**: cuesta +1 lectura por solicitud y compra revocación inmediata, que
   es lo que FR-008a exige.
3. **FR-015 exige que el costo no sea visible sin su permiso, y Firestore no tiene seguridad a
   nivel de campo.** El costo no puede vivir en la variante: va en un documento aparte por
   producto, con su propia regla.
4. **El cliente lee directo de Firestore**, acotado por reglas. Meter las lecturas detrás de
   funciones agregaría latencia y costo sin agregar seguridad.

Frontend Angular 22 zoneless con Signal Forms (estables en v22) y Angular Material + CDK, elegido
por la exigencia de WCAG 2.2 AA de FR-038a. Monorepo Nx, donde la regla de dependencias de la
arquitectura limpia se hace cumplir como error de lint que CI bloquea.

### Qué cambió respecto de la primera pasada

| Antes | Ahora | Por qué |
|---|---|---|
| `tenantId` en custom claim; regla sin lecturas extra | Las reglas leen `members/{uid}` | Una cuenta en N comercios no cabe en un claim de inquilino. Y las alternativas con claim dejaban **hasta una hora** de acceso de lectura tras dar de baja una membresía, incumpliendo FR-008a |
| `IdentityService` sincronizando claims; operación en dos fases | **Eliminado** | Sin claims de autorización, dar de baja o traspasar propiedad es una escritura en Firestore y nada más. Desaparece una desviación de Complexity Tracking |
| Costo como campo de la variante | Documento `products/{pid}/private/costs` | Firestore no protege campos sueltos; con el costo dentro, FR-015 sería inaplicable |
| 3 casos de uso escribían bitácora | **9** | FR-031a suma roles, permisos, membresías y propiedad |
| Variantes nuevas "en cero" | Sin precio y **sin existencias definidas** | Corrección de la contradicción con FR-029 |
| Multi-inquilinidad de Identity Platform sobre la mesa | **Descartada** | Ya no hace falta: un solo grupo de usuarios. Evita un servicio de pago y **conserva la autenticación por teléfono** |

## Technical Context

**Language/Version**: TypeScript `~6.0.0` — **no** 7.x: `@angular/compiler-cli@22.2.0` declara
`peerDependencies.typescript: ">=6.0 <6.1"`. Node.js 22 LTS en Functions.

**Primary Dependencies**: Angular 22.2 (standalone, zoneless, Signal Forms, `@if`/`@for`),
Angular Material + CDK 22.2, SDK modular `firebase` 12.19 (**sin `@angular/fire`**),
`firebase-admin` 14.5, `firebase-functions` 7.4, Nx 23.2.

**Storage**: Firestore modo nativo, subcolecciones por inquilino. Cloud Storage para imágenes.

**Testing**: Vitest 5 (dominio y aplicación, sin emuladores), `@firebase/rules-unit-testing` 5 +
Firebase Emulator Suite (reglas y callable), Playwright 1.63 (extremo a extremo).

**Target Platform**: navegadores modernos, móvil primero. Cloud Functions 2ª gen sobre Cloud Run,
una sola región, la misma que Firestore.

**Performance Goals**: estructura visible en menos de 1 s y contenido útil en menos de 3 s en
conexión móvil (SC-009); 95% de las búsquedas de catálogo bajo 1 s con 10.000 variantes (SC-010).

**Constraints**: WCAG 2.2 AA en todas las vistas (FR-038a); sin desplazamiento horizontal a 360 px
(FR-038); tope de 5 atributos y 100 combinaciones por producto (FR-025); importes como enteros en
la unidad mínima, moneda por inquilino; bitácora conservada 7 años (FR-035); ningún componente del
stack puede cobrar por asiento al comerciante.

**Scale/Scope**: 46 requisitos funcionales, 15 criterios de éxito, 4 historias. Comercio de
referencia: 500 productos, 2.000 variantes, equipo sin tope de tamaño.

### Decisiones de stack que se apartan del brief original

| Punto del brief | Decisión | Motivo |
|---|---|---|
| "Angular Material **o** Tailwind" | **Material + CDK**, sin Tailwind | FR-038a pide operación por teclado y anuncio de cambios de estado en la tabla con edición en línea. El CDK trae `LiveAnnouncer`, `FocusTrap` y `FocusMonitor`: exactamente esa lista |
| "SSR solo si lo exige el principio VIII" | **Sin SSR** | Un panel autenticado y por inquilino no se cachea en CDN. SSR agregaría un salto a Cloud Run por navegación para entregar un esqueleto |
| "Nx **o** workspace de Angular" | **Nx** | `@nx/enforce-module-boundaries` convierte la regla de dependencias en un error de lint que CI bloquea |
| Stack Firebase | **Sin `@angular/fire`** | Su versión estable exige `@angular/core ^20`; la 21 sigue en `rc-canary`. Su valor es la integración con zonas, y la app es zoneless |
| "Roles en custom claims de Auth" | **Sin custom claims de autorización** | FR-005 (cuenta en varios comercios) lo impide, y el tope de 1000 bytes más la caché horaria del token incumplirían FR-008 y FR-008a |
| "SKU con id `tenantId_sku`" | Id del documento = **SKU normalizado** | El `tenantId` ya está en la ruta; repetirlo es redundante |

Detalle y alternativas descartadas en [research.md](./research.md).

## Constitution Check

*GATE: debe pasar antes de la fase 0 y volver a evaluarse tras la fase 1.*

| Principio | Estado | Cómo lo cumple este plan |
|---|---|---|
| I. Catálogo jerárquico con variantes | ✅ | Atributos libres del comercio; variante con SKU, importes, stock e imágenes propias; variante implícita con el mismo tipo |
| II. Sincronización atómica de existencias | ✅ parcial | Solo el ajuste manual está en alcance, en transacción con su bitácora. Las reservas de checkout son de otra feature y el modelo no las bloquea |
| III. Motor de descuentos | ➖ | Fuera de alcance por el spec |
| IV. Desacoplamiento de recaudo y logística | ✅ | `config/secrets` existe como recurso protegido e indelegable; ninguna lógica de pasarela entra aquí |
| V. Analíticas en tiempo real | ➖ | Fuera de alcance. Decisión registrada para la feature futura sin cerrarse puertas (`research.md` §6) |
| VI. RBAC jerárquico, mínimo privilegio | ✅ | Default-deny; pertenencia verificada contra la membresía **fresca**; permisos reservados **ausentes del enumerado** `Permission`; costo separado en su propio documento |
| VII. Trazabilidad inmutable | ✅ | Bitácora en la misma transacción, en ambos sentidos; `create/update/delete: if false` para todos; `AuditLogRepository` sin métodos de modificación; cobertura ampliada a roles y permisos |
| VIII. Optimización de carga percibida | ✅ | Esqueletos con reserva de espacio; sin SSR por decisión justificada; costos en un documento por producto en vez de uno por variante |
| IX. Mobile-first | ✅ | Material + CDK por accesibilidad; WCAG 2.2 AA verificado en CI |
| X. Regla de garantía automática | ✅ | Cuatro suites bloqueantes; los criterios no automatizables quedaron separados en el spec y **no** bloquean |

**Resultado del gate: PASA.**

**Re-evaluación tras la fase 1**: el diseño no introdujo violaciones nuevas y **retiró dos** de la
pasada anterior. La operación en dos fases con Firebase Auth desapareció al dejar de sincronizar
claims, y FR-004 dejó de ser una desviación porque el spec ahora acota la obligación a la capa de
servicios. Tres hallazgos refuerzan el cumplimiento en lugar de debilitarlo: los permisos
reservados modelados como ausencia de valores del enumerado, un `AuditLogRepository` sin `update`
ni `delete`, y la lectura de membresía en reglas, que hace que la revocación inmediata sea una
propiedad del mecanismo y no una promesa.

## Project Structure

### Documentation (this feature)

```text
specs/001-catalog-rbac/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones cerradas + verificación de versiones
├── data-model.md        # Fase 1: entidades y disposición en Firestore
├── quickstart.md        # Fase 1: cómo validar de extremo a extremo
├── contracts/
│   ├── callable-functions.md   # La única superficie de escritura
│   ├── firestore-rules.md      # Contrato de lectura + 34 casos de prueba obligatorios
│   └── ports.md                # Puertos de aplicación y casos de uso
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
apps/
├── admin/                      # SPA Angular 22, zoneless — capa de presentación
│   └── src/app/
│       ├── tenant/             # selector de comercio activo; rutas /t/{tenantId}/…
│       ├── catalog/            # listado, editor de producto, tabla de variantes
│       ├── team/               # colaboradores, roles, invitaciones
│       ├── audit/              # consulta de bitácora con filtro por tipo de evento
│       └── shared/             # esqueletos, estados de error y vacío, shell
├── admin-e2e/                  # Playwright contra emuladores
└── functions/                  # Cloud Functions — capa de presentación del backend
    └── src/
        ├── catalog/            # createProduct, setProductOptions, setVariantSku…
        ├── pricing/            # setVariantPrice, setVariantCost, setVariantStock
        ├── team/               # invitaciones, roles, membresías, traspaso
        └── bootstrap/          # composición de dependencias y guardas comunes

libs/
├── domain/                     # SIN imports de Firebase ni Angular
│   └── src/
│       ├── entities/           # Tenant, Membership, Role, Product, Variant, AuditEntry
│       ├── value-objects/      # Sku, Money, StockLevel, Permission, TenantId
│       └── services/           # generateCombinations, reconcileVariants, validateOptionLimits
├── application/                # Casos de uso + puertos. Sin SDK
│   └── src/
│       ├── ports/              # ProductRepository, AuditLogRepository, UnitOfWork…
│       └── use-cases/          # CreateProduct, SetVariantPrice, AssignRole…
├── infrastructure/             # ÚNICO lugar con SDK de Firebase
│   └── src/
│       ├── firestore/          # adaptadores de repositorio + UnitOfWork transaccional
│       ├── auth/               # solo autenticación; ya no sincroniza claims
│       └── storage/            # URLs firmadas para imágenes
└── ui/                         # Componentes Angular compartidos y tema Material

tools/seed/                     # Datos de prueba, incluida la cuenta multi-comercio
firestore.rules                 # Ver contracts/firestore-rules.md
storage.rules
firestore.indexes.json          # (entity.id, at desc), (actorUid, at desc), (type, at desc)
firebase.json
```

**Structure Decision**: monorepo Nx con cuatro librerías que **son** las cuatro capas. La regla de
dependencias se declara con etiquetas Nx y la hace cumplir `@nx/enforce-module-boundaries`:

| Librería | Etiqueta | Puede importar |
|---|---|---|
| `libs/domain` | `layer:domain` | nada del repositorio |
| `libs/application` | `layer:application` | `layer:domain` |
| `libs/infrastructure` | `layer:infrastructure` | `layer:application`, `layer:domain` |
| `apps/*`, `libs/ui` | `layer:presentation` | todas las anteriores |

Un import de Firebase en `libs/domain` no es una observación de revisión: es un build roto. Eso
hace que "el dominio y la aplicación se prueban sin emuladores" sea una propiedad verificada, no una
intención.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Cada lectura del cliente cuesta una lectura extra** por el `get()` de la membresía en las reglas | FR-005 permite cuentas en varios comercios, así que el inquilino no puede viajar en un claim; y FR-008a exige que la baja corte el acceso **de inmediato** | Las dos variantes con claim (comercio activo, o lista de comercios) cuestan cero lecturas pero dejan **hasta una hora** de acceso de lectura después de dar de baja a alguien. Eso es exactamente lo que FR-008a prohíbe. Medido, el sobrecosto es ~2% —las reglas se evalúan una vez por consulta, no por documento— y la caché por solicitud lo amortigua |
| **El costo vive en un documento separado** de la variante, no como un campo | Firestore **no tiene seguridad a nivel de campo**. Con `cost` dentro de la variante, cualquiera que pueda leerla lee el costo, y FR-015 sería inaplicable | Confiar en que la interfaz no muestre el campo es justo lo que FR-010 prohíbe: ocultar en el cliente como único control. Enrutar la lectura por una Cloud Function costaría más latencia y más dinero que una lectura directa con su propia regla. Mitigación del costo de diseño: **un** documento por producto, no uno por variante, así cargar 100 costos es una lectura |
| **Nueve casos de uso escriben bitácora**, contra tres antes, y todos dentro de transacción | FR-031a obliga a registrar roles, permisos, membresías y propiedad | No registrarlos dejaba sin auditoría el evento de mayor riesgo interno: que alguien se conceda un permiso. El costo es una escritura extra por operación de equipo, que son poco frecuentes |
| **El constructor de roles personalizados es alcance materialmente mayor** que dos roles fijos | Decisión de negocio tomada en `/speckit-clarify` | Entregarlo todo de una vez retrasa la Historia 1, que es la que da valor. **Mitigación**: construir el modelo de permisos completo desde el principio (enumerado `Permission`, colección `roles`, verificación en cada mutación) y entregar primero los roles predefinidos; el editor visual llega después **sin** cambiar el modelo. El principio VI queda cumplido desde el día uno; se difiere la pantalla, no la garantía |
| **Firebase Auth cobra por usuario activo mensual** pasados 50.000 MAU | Es el modelo de precios del proveedor de identidad | Ningún proveedor gestionado escapa del todo a esa forma de cobro. **Restricción que este plan fija**: ese costo lo absorbe la plataforma y MUST NOT trasladarse al comerciante como licencia por colaborador. Nota favorable: con cuentas multi-comercio, quien trabaja para tres tiendas es **un** MAU, no tres |
| **Cuatro capas y monorepo** para una feature | Los principios VI, VII y X exigen que autorización y auditoría sean verificables sin emuladores y que la frontera sea infranqueable | Una app Angular con servicios que llaman a Firestore ataría el dominio al SDK, exigiría emulador para probar el motor de variantes, y dejaría la frontera sin quien la haga cumplir |

### Desviaciones que esta revisión **retiró**

- **Operación en dos fases con Firebase Auth**: ya no existe. Sin claims de autorización que
  sincronizar, dar de baja y traspasar la propiedad son escrituras en Firestore y nada más.
- **FR-004 cumplido solo en parte**: ya no es una desviación del plan. El spec ahora acota la
  obligación a los intentos que atraviesan la capa de servicios y declara explícitamente que los
  rechazos en la capa de reglas quedan fuera.

### Riesgos sin resolver

Ninguno bloquea la implementación. Para la feature de observabilidad: objetivo de disponibilidad,
señales más allá de los eventos de seguridad, y límites de abuso en el envío de invitaciones.
Quedan sin cuantificar "conexión móvil típica" (SC-009) y "sin degradación perceptible" (SC-008);
conviene fijarlos al escribir las pruebas de rendimiento. Y la búsqueda arranca sin motor dedicado,
con un disparador explícito para sumarlo (`research.md` §7).

### Nota para la implementación

Durante `/speckit-implement`, la skill `angular-developer` de este repositorio cubre los patrones
idiomáticos de Angular 22 (signals, Signal Forms, zoneless, accesibilidad). Conviene invocarla antes
de escribir los componentes en lugar de improvisar los patrones.
