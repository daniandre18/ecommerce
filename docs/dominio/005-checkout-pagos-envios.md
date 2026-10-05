# Spec 005 — Checkout, pagos y envíos

**Estado:** borrador · **Fase:** 5 · **Evidencia:** `[OBS]` — opciones del checkout, métodos de pago y medios de envío recorridos

## Lo observado en el admin de referencia

**Opciones del checkout.** Pedir teléfono de contacto · pedir documento de identidad · pedir dirección de facturación · campo de nota del cliente con nombre configurable y obligatoriedad opcional · mensaje en la página de seguimiento · **restringir compras** a todos los clientes o solo a clientes autorizados · permitir cambiar el medio de pago desde la página de seguimiento · códigos personalizados · usar los colores del diseño en el checkout.

**Métodos de pago.** Diez proveedores para Colombia — Bold, Mercado Pago, Wava (Nequi, DaviPlata, Stripe), Addi (compra ahora paga después), Refacil Pay, ePayco, ePayco embebido, PayPal, Openpay — cada uno descrito con: instrumentos aceptados, plazo de liquidación, tasas y CPT, y etiquetas `Gateway`, `Checkout transparente` y `Ventas internacionales`. El pago personalizado (efectivo o transferencia) **está bloqueado por plan**.

**Dato relevante para Colombia:** ningún proveedor nativo ofrece contraentrega. En la plataforma de referencia se resuelve con apps de terceros. En la nuestra, dado el mercado, la contraentrega es un método propio del núcleo.

**Medios de envío.** No se pueden activar hasta definir un **centro de distribución principal**. El inventario por ubicación es, entonces, precondición del envío y no una función avanzada.

## Objetivo

Convertir un carrito en pedido: recolectar los datos necesarios, calcular envío, cobrar por el medio elegido, y dejar el pedido creado con su estado correcto.

## Historias de usuario

1. Como comprador, completo mis datos y recibo el costo de envío antes de pagar.
2. Como comprador en Colombia, elijo pagar contraentrega y confirmo el pedido sin pagar en línea.
3. Como comprador, pago con tarjeta y recibo confirmación inmediata.
4. Como operador, habilito y deshabilito métodos de pago y medios de envío.
5. Como operador, defino zonas de cobertura con tarifas distintas.
6. Como operador, personalizo los mensajes que el comprador ve en el checkout. `[OBS: el admin de referencia tiene "Opciones del checkout" y "Mensaje para clientes"]`

## Requisitos funcionales

### Carrito y checkout
- **FR-401** El carrito debe persistir entre sesiones del mismo comprador identificado.
- **FR-402** El checkout debe validar disponibilidad de stock antes de confirmar, no solo al agregar al carrito.
- **FR-403** El checkout debe permitir compra sin cuenta, pidiendo únicamente los datos necesarios para entregar y contactar.
- **FR-404** El checkout debe recolectar el teléfono como obligatorio cuando el método de pago es contraentrega.
- **FR-405** El sistema debe registrar los carritos abandonados con los datos ya ingresados.
- **FR-406** El inquilino debe poder configurar textos y opciones del checkout. `[OBS]`
- **FR-407** El checkout debe ser utilizable en móvil como caso principal, no como adaptación.
- **FR-408** El inquilino debe poder elegir, campo por campo, si el checkout pide teléfono, documento de identidad y dirección de facturación. `[OBS]`
- **FR-409** El checkout debe ofrecer un campo de nota del cliente con nombre configurable y obligatoriedad opcional. `[OBS]`
- **FR-410** El inquilino debe poder restringir las compras solo a clientes autorizados. `[OBS]` Es lo que habilita una tienda mayorista cerrada; se apoya en las tablas de precio de la Spec 002.
- **FR-411** El checkout debe heredar los colores del diseño de la tienda. `[OBS]`
- **FR-412** El inquilino debe poder inyectar código personalizado en el checkout, con el alcance acotado. `[OBS]` `[NEEDS CLARIFICATION: qué puede y qué no puede hacer ese código — es una superficie de riesgo si toca importes o datos de pago]`

### Pagos
- **FR-410** El sistema debe soportar varios métodos de pago habilitables por el inquilino. `[OBS: "Métodos de pago" es configuración del inquilino]`
- **FR-411** El sistema debe soportar contraentrega como método de primera clase, que crea el pedido con pago `pendiente` y permite despachar.
- **FR-412** El sistema debe integrar al menos un proveedor de pago en línea mediante su flujo alojado, sin que datos de tarjeta pasen por la plataforma.
- **FR-413** La confirmación de pago debe provenir del webhook del proveedor, nunca del retorno del navegador del comprador.
- **FR-414** El procesamiento de notificaciones de pago debe ser idempotente: una notificación repetida no puede duplicar el pago ni el pedido.
- **FR-415** Toda notificación entrante debe validarse criptográficamente antes de alterar un pedido.
- **FR-416** El sistema debe registrar cada intento de pago con su resultado, incluidos los fallidos.

### Envíos
- **FR-420** El inquilino debe poder definir medios de envío con su forma de tarifar. `[OBS: "Medios de envío" es configuración del inquilino]`
- **FR-421** El sistema debe soportar tarifa plana, tarifa por zona y envío gratis sobre un monto mínimo.
- **FR-422** El sistema debe soportar zonas de cobertura definidas por el inquilino, con el detalle geográfico que el país requiera.
- **FR-423** El sistema debe permitir retiro en punto como alternativa al envío a domicilio.
- **FR-424** El costo de envío debe calcularse en el servidor y mostrarse antes de confirmar.
- **FR-425** Cuando la dirección queda fuera de cobertura, el sistema debe decirlo explícitamente antes de pedir el pago.
- **FR-426** El despacho debe poder originarse en un centro de distribución determinado. `[OBS]`
- **FR-427** Los medios de envío no deben poder activarse hasta que exista un centro de distribución principal definido. `[OBS]`
- **FR-428** Cada método de pago debe declarar sus instrumentos aceptados, su plazo de liquidación y sus tasas, visibles para el inquilino antes de activarlo. `[OBS]`
- **FR-429** Una tabla de precios debe poder tener medios de pago y de envío propios, distintos de los generales de la tienda. `[OBS]` Ver Spec 002.

## Entidades clave

- **Cart** — líneas, cliente si está identificado, momento de última actividad, totales estimados.
- **PaymentMethod** — tipo, proveedor, credenciales cifradas, estado, instrucciones para el comprador.
- **PaymentAttempt** — pedido, método, importe, resultado, referencia externa, carga útil recibida.
- **ShippingMethod** — nombre, forma de tarifar, zonas aplicables, estado.
- **ShippingZone** — cobertura geográfica y tarifa.

## Criterios de aceptación

- Un carrito con una variante agotada entre el agregado y la confirmación no genera pedido, y el comprador recibe un mensaje claro.
- Un pedido contraentrega queda creado con pago `pendiente` y habilitado para despacho.
- Reenviar la misma notificación de pago tres veces deja un único pago registrado.
- Una notificación con firma inválida se rechaza y se registra, sin alterar el pedido.
- Una dirección fuera de las zonas definidas no permite avanzar al pago.
- Las credenciales de los proveedores de pago no son legibles desde el cliente, ni siquiera por el dueño de la tienda.

## Fuera de alcance

Cotización en tiempo real con transportadoras, generación de guías por API, pasarelas múltiples simultáneas sobre un mismo pedido, cuotas y financiación.

## Clarificaciones pendientes

- `[NEEDS CLARIFICATION]` ¿Qué proveedor de pago se integra primero?
- `[NEEDS CLARIFICATION]` ¿Se cobra recargo por contraentrega?
- `[NEEDS CLARIFICATION]` ¿La cobertura se define por ciudad, por departamento o por código postal?
