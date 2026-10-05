# Spec 003 — Clientes

**Estado:** borrador · **Fase:** 3 · **Evidencia:** `[OBS]` — el formulario de alta de cliente del admin de referencia se leyó completo

## Objetivo

Registrar y administrar los clientes de la tienda, con direcciones válidas para los países donde opera y con la posibilidad de asignarles condiciones comerciales diferenciadas.

## Historias de usuario

1. Como operador, registro un cliente manualmente para cargar un pedido telefónico.
2. Como operador, guardo la dirección de envío de un cliente colombiano y de uno argentino, y cada formulario pide lo que corresponde a su país.
3. Como operador, asigno una tabla de precios mayorista a un cliente.
4. Como operador, consulto el historial de pedidos de un cliente antes de atenderlo.

## Requisitos funcionales

### Datos personales — campos observados en el admin de referencia
- **FR-201** El nombre debe guardarse como un único campo de texto libre, no partido en nombre y apellido. `[OBS: el formulario tiene un solo campo "Nombre y apellido"]`
- **FR-202** El e-mail es el identificador comercial del cliente y debe ser único dentro del inquilino. `[NEEDS CLARIFICATION: ¿es obligatorio? el formulario de referencia no marcaba opcionalidad explícita]`
- **FR-203** El teléfono debe ser opcional. `[OBS]`
- **FR-204** El documento de identidad debe ser opcional, con etiqueta y validación según el país del inquilino. `[OBS: el admin de referencia lo rotula "DNI o CUIL" para Argentina]`
- **FR-205** Para operación en Colombia, el teléfono debe ser obligatorio cuando el pedido es contraentrega, porque el despacho depende de la confirmación telefónica.

### Dirección
- **FR-210** La dirección debe modelarse como un objeto con: calle, número, complemento, código postal, barrio, ciudad, estado o departamento y país. `[OBS: campos exactos del formulario de referencia]`
- **FR-211** La obligatoriedad de cada campo debe depender del país. El código postal es obligatorio en Argentina y no puede serlo en Colombia, donde el barrio sí es relevante para el reparto.
- **FR-212** El selector de país debe priorizar los países de operación antes de la lista completa. `[OBS: el admin de referencia prioriza Argentina, Chile, Colombia, España, México, Perú, Uruguay y Venezuela]`
- **FR-213** Un cliente debe poder tener varias direcciones con una marcada como predeterminada.
- **FR-214** La dirección usada en un pedido debe quedar copiada en el pedido, no referenciada: editar la dirección del cliente no puede alterar un pedido ya despachado.

### Comercial
- **FR-220** El cliente debe poder tener una tabla de precios asignada que le dé acceso a precios diferenciados. `[OBS: el formulario de referencia incluye la sección "Tablas de precios" para precios mayoristas]`
- **FR-221** El sistema debe mostrar el historial de pedidos del cliente con totales y estados.
- **FR-222** El cliente debe admitir etiquetas libres para segmentación.
- **FR-223** El sistema debe permitir registrar notas internas sobre el cliente, no visibles para él.

### Datos personales y conservación
- **FR-230** El sistema debe permitir exportar y eliminar los datos de un cliente a solicitud suya, conservando los pedidos con datos mínimos para efectos fiscales y contables.
- **FR-231** El documento de identidad y el teléfono solo deben ser visibles para perfiles con permiso explícito.

## Entidades clave

- **Customer** — identidad, nombre completo, e-mail, teléfono, documento con tipo, lista de precios asignada, etiquetas, notas, momento de alta.
- **Address** — value object con los campos de FR-210 y validación por país.

## Criterios de aceptación

- Un cliente con nombre "María José Pineda Moreno" se guarda y se muestra íntegro, sin partirse.
- El formulario de dirección para Colombia no exige código postal; el de Argentina sí.
- Un cliente con tabla mayorista asignada obtiene precios mayoristas al cargarle un pedido.
- Editar la dirección de un cliente no modifica la dirección impresa en un pedido anterior.
- Un usuario sin permiso de datos sensibles no obtiene el documento de identidad ni consultando el backend directamente.

## Fuera de alcance

Cuentas de cliente con autoservicio en el storefront, programa de fidelidad, importación masiva.

## Clarificaciones pendientes

- `[NEEDS CLARIFICATION]` ¿Se permite más de un cliente con el mismo e-mail dentro del inquilino?
- `[NEEDS CLARIFICATION]` ¿Los clientes se crean solos al hacer un pedido invitado, o siempre explícitamente?
