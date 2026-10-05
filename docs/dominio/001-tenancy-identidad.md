# Spec 001 — Tenancy e identidad

**Estado:** borrador · **Fase:** 1 · **Evidencia:** `[INF]` salvo donde se indique

## Objetivo

Permitir que varias tiendas independientes operen sobre la misma instalación, con aislamiento total de datos, y que una persona acceda a las tiendas de las que es miembro con el rol que le corresponde en cada una.

## Por qué va primero

El aislamiento no se agrega después. Cualquier módulo construido antes de que exista el inquilino queda con consultas que no filtran por tienda, y corregirlas significa revisar cada repositorio y cada regla de seguridad del sistema.

## Historias de usuario

1. Como fundador de la plataforma, creo una tienda nueva y recibo su back office vacío y funcional.
2. Como dueño de tienda, invito a un colaborador y le asigno un rol sin darle acceso a ninguna otra tienda.
3. Como colaborador que trabaja en dos tiendas, cambio de tienda sin cerrar sesión y veo solo los datos de la tienda activa.
4. Como dueño de tienda cuyo plan venció, puedo entrar a pagar pero no a operar, y mis datos siguen intactos.

## Requisitos funcionales

- **FR-001** El sistema debe crear un inquilino con nombre, subdominio único, país, moneda principal e idioma principal.
- **FR-002** El subdominio debe ser único en toda la plataforma y validarse en el momento del alta.
- **FR-003** Todo dato de negocio debe pertenecer a exactamente un inquilino y ser inaccesible desde cualquier otro.
- **FR-004** El sistema debe impedir el acceso a datos de otro inquilino incluso ante una consulta mal construida por la aplicación. La defensa no puede depender del código cliente.
- **FR-005** El sistema debe soportar que un usuario sea miembro de varios inquilinos con un rol distinto en cada uno.
- **FR-006** El usuario debe poder cambiar de inquilino activo dentro de la sesión.
- **FR-007** El inquilino debe tener un estado explícito. Estados mínimos: `activo`, `moroso`, `suspendido`, `cancelado`.
- **FR-008** En estado `suspendido` el sistema debe bloquear la operación del back office y permitir únicamente las pantallas de plan y pago, conservando todos los datos. `[OBS: el admin de referencia advierte que el plan vencido hace perder el acceso al administrador]`
- **FR-009** El sistema debe registrar quién creó y quién modificó por última vez cada entidad de negocio, con marca de tiempo.
- **FR-010** La invitación a un inquilino debe expirar si no se acepta. `[NEEDS CLARIFICATION: plazo]`
- **FR-011** El inquilino debe poder habilitar **países**, cada uno con su moneda e idioma, y el comprador debe poder elegir en cuál navegar. Uno de ellos es el país por defecto. `[OBS]`
- **FR-011a** El inquilino debe tener una **moneda de administración** —en la que gestiona los precios de su catálogo— que puede ser distinta de las monedas de venta y que solo él ve. `[OBS]`
- **FR-011b** El sistema debe mantener tasas de cambio de la moneda de administración a cada moneda de venta, editables por el inquilino y con un valor sugerido. `[OBS]` Las tasas son dato del inquilino, no un servicio automático: el precio de venta no puede cambiar solo mientras el operador no lo decida.
- **FR-012** El plan contratado debe habilitar o bloquear funcionalidades concretas, no solo límites de volumen. `[OBS: en el admin de referencia, el método de pago personalizado — efectivo y transferencia — está bloqueado detrás de una mejora de plan]` Esto exige un mecanismo de capacidades por plan evaluado en el servidor, no una comparación de nombres de plan dispersa por el código.
- **FR-013** Al bloquear una funcionalidad por plan, el sistema debe mostrarla y explicar qué plan la habilita, en vez de ocultarla. `[OBS]`
- **FR-014** El sistema debe exponer un catálogo de extensión por campos personalizados sobre categorías, clientes, productos, variantes y ventas, más entidades de contenido propias del inquilino. `[OBS: el admin de referencia los llama campos personalizados y metaobjetos]` La UI puede llegar en fase 2, pero el punto de extensión debe existir en el esquema desde el inicio.

## Entidades clave

- **Tenant** — identificador, nombre, subdominio, dominio propio opcional, país, moneda principal, idiomas habilitados, estado, fecha de creación.
- **Subscription** — plan, estado, fecha de próximo cobro, fecha de vencimiento.
- **User** — identidad global de la persona; independiente de los inquilinos.
- **Membership** — relación usuario ↔ inquilino ↔ rol; es la unidad de autorización.

## Criterios de aceptación

- Un usuario autenticado con membresía en la tienda A recibe permiso denegado al solicitar cualquier documento de la tienda B, por cualquier vía.
- Existe un test automatizado que demuestra el punto anterior y corre en cada integración.
- Dos tiendas pueden tener un producto con el mismo SKU sin conflicto.
- Un inquilino en estado `suspendido` no puede crear ni modificar pedidos, productos ni clientes.
- Cambiar el rol de una membresía surte efecto para el usuario afectado sin intervención manual.

## Fuera de alcance

Cobro real de suscripciones, dominios propios con certificados, y migración de datos entre inquilinos.

## Clarificaciones pendientes

- `[NEEDS CLARIFICATION]` ¿Autoservicio de alta de tiendas o alta controlada por la plataforma?
- `[NEEDS CLARIFICATION]` ¿Qué ocurre con los datos de un inquilino `cancelado` y tras cuánto tiempo?
- `[NEEDS CLARIFICATION]` ¿El dueño de la tienda puede eliminar su propia tienda?
