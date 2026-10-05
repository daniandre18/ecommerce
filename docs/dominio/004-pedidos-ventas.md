# Spec 004 — Pedidos y ventas

**Estado:** borrador · **Fase:** 4 · **Evidencia:** mixta — la tienda de referencia no tiene pedidos cargados, así que el detalle no pudo verse; en cambio el **catálogo de permisos de Ventas** expone las operaciones reales del módulo `[OBS]`

## Operaciones observadas

Los once permisos del grupo Ventas del admin de referencia son el inventario de operaciones del módulo:

```
Ver pedidos (solo lectura)      Cancelar ventas
Gestión de ventas               Hacer reembolsos de ventas
Exportar lista de ventas        Reabrir ventas
Marcar pagos como recibidos     Crear y gestionar pedidos manuales
Marcar como empaquetadas        Gestionar carritos abandonados
Imprimir etiquetas de envío
```

Dos confirmaciones importantes: `Marcar pagos como recibidos` existe como acción manual separada — que es exactamente lo que exige la contraentrega — y `Reabrir ventas` confirma que el pedido tiene una dimensión abierto/cerrado independiente del pago y del cumplimiento.

## La orden de compra: una entidad que faltaba `[OBS]`

El módulo Ventas tiene tres pantallas: `Lista de ventas`, **`Órdenes de compra`** y `Carritos abandonados`. La orden de compra es un pedido en borrador, creado a mano para ventas presenciales o por redes sociales. El detalle de una orden de compra enuncia la regla de negocio textualmente:

> Al marcar un pago como recibido, la orden de compra se transforma en una venta y el producto es descontado del stock.

Eso resuelve una pregunta de modelado que la versión anterior de esta spec dejaba abierta: **el stock no se toca mientras el pedido es borrador**. Se descuenta en el momento en que el pago se marca recibido, que es también cuando el borrador se convierte en venta. Una orden de compra puede quedar abierta indefinidamente sin bloquear inventario.

Estructura observada en el detalle: fecha y hora · canal de origen (`Punto de venta`) · cantidad de unidades · subtotal por unidades · total · estado de pago (`No realizado`) con acción `Marcar como recibido` · datos del cliente · información de entrega.

## Objetivo

Registrar, operar y seguir los pedidos de la tienda desde su creación hasta su entrega o cancelación, con totales confiables y un estado que refleje la realidad de la operación.

## Decisión de diseño que ordena todo el módulo

El estado del pedido no es un campo. Son tres dimensiones independientes:

| Dimensión | Estados |
|---|---|
| Pago | `pendiente`, `autorizado`, `pagado`, `parcialmente_reembolsado`, `reembolsado`, `fallido` |
| Cumplimiento | `sin_preparar`, `preparado`, `despachado`, `entregado`, `devuelto` |
| Pedido | `abierto`, `cerrado`, `cancelado` |

Un solo campo combinado obliga a inventar estados como "pagado pero no despachado con novedad", que se multiplican sin límite. En contraentrega esto es ineludible: el pedido se despacha **antes** de estar pagado, lo que hace imposible una secuencia lineal única.

## Historias de usuario

1. Como operador, cargo un pedido telefónico eligiendo cliente, productos y método de envío.
2. Como operador, veo los pedidos pendientes de despacho y los preparo.
3. Como operador, asigno número de guía a un pedido despachado.
4. Como operador, registro que un pedido contraentrega fue pagado al momento de la entrega.
5. Como operador, registro una novedad de entrega y su resolución.
6. Como operador, cancelo un pedido y el stock reservado vuelve a estar disponible.
7. Como dueño, consulto cuánto vendí en un rango de fechas.

## Requisitos funcionales

### Creación y contenido
- **FR-301** El sistema debe permitir crear pedidos desde el back office y desde el storefront.
- **FR-302** El pedido debe tener un número legible y consecutivo por inquilino, independiente del identificador interno.
- **FR-303** Cada línea de pedido debe congelar nombre del producto, variante, SKU, precio unitario y cantidad al momento de la compra. Cambios posteriores en el catálogo no pueden alterarla.
- **FR-304** El pedido debe copiar la dirección de envío y los datos de contacto del cliente, no referenciarlos.
- **FR-305** El pedido debe registrar su canal de origen. `[OBS: el admin de referencia expone ocho canales de venta distintos sobre el mismo pedido]`
- **FR-306** El pedido debe registrar el método de pago y el medio de envío elegidos.

### Totales
- **FR-310** Los totales deben calcularse exclusivamente en el servidor. Ningún importe propuesto por el cliente puede aceptarse como válido.
- **FR-311** El pedido debe desglosar: subtotal, descuentos, costo de envío, impuestos y total.
- **FR-312** El cálculo debe ser determinista y reproducible: dado el mismo pedido, el mismo resultado.
- **FR-313** Los importes deben manejarse en la unidad mínima de la moneda, sin punto flotante.

### Estados y transiciones
- **FR-320** El sistema debe implementar las tres dimensiones de estado descritas arriba, de forma independiente.
- **FR-321** Las transiciones deben estar explícitamente permitidas; cualquier otra debe rechazarse.
- **FR-322** Toda transición debe quedar registrada con autor, momento y estado anterior.
- **FR-323** Al confirmar un pedido del storefront, el stock de sus líneas debe reservarse de forma transaccional.
- **FR-324** Al cancelar un pedido, la reserva de stock debe liberarse.

### Orden de compra (pedido en borrador)
- **FR-340** El sistema debe permitir crear órdenes de compra: pedidos en borrador para ventas presenciales o por redes sociales. `[OBS]`
- **FR-341** La orden de compra **no debe afectar el inventario** mientras siga en borrador. `[OBS]`
- **FR-342** Al marcar el pago como recibido, la orden de compra debe convertirse en venta y descontar el stock en la misma operación transaccional. `[OBS]`
- **FR-343** La orden de compra debe poder quedar abierta sin vencimiento, y listarse aparte de las ventas. `[OBS]`
- **FR-344** El carrito abandonado debe tener su propia pantalla de gestión, separada de ventas y de órdenes de compra. `[OBS]`
- **FR-345** `[NEEDS CLARIFICATION]` ¿Qué ocurre si al marcar el pago no hay stock suficiente? Rechazar la conversión, permitirla con stock negativo, o convertir y alertar.
- **FR-325** El sistema debe soportar pedidos pagados contra entrega, donde el despacho precede al pago.
- **FR-326** El sistema debe permitir registrar novedades de entrega con tipo, descripción y resolución.
- **FR-327** El sistema debe permitir reembolsos totales y parciales, con su efecto en el estado de pago.

### Operación
- **FR-330** El sistema debe permitir filtrar pedidos por estado, fecha, canal, cliente y método de pago.
- **FR-331** El sistema debe permitir acciones por lotes sobre pedidos: marcar preparados, despachar, cargar guías.
- **FR-332** El sistema debe permitir notas internas en el pedido, no visibles para el cliente.
- **FR-333** El sistema debe permitir etiquetar pedidos.
- **FR-334** El sistema debe exportar pedidos de un rango de fechas en formato tabular. `[OBS: es un permiso propio]`
- **FR-335** El sistema debe permitir imprimir etiquetas de envío. `[OBS]`
- **FR-336** El sistema debe permitir reabrir un pedido cerrado, bajo permiso. `[OBS]`
- **FR-337** El sistema debe ofrecer al comprador una **página de seguimiento** del pedido, con su estado de envío y un mensaje configurable por el inquilino. `[OBS: configurable desde las opciones del checkout]`
- **FR-338** Desde la página de seguimiento, el comprador debe poder **cambiar el medio de pago** si el pedido sigue impago. `[OBS]` Es lo que rescata un pedido cuyo pago falló.
- **FR-339** Cada operación de riesgo sobre el pedido debe corresponder a un permiso propio: marcar pago recibido, marcar empaquetado, cancelar, reembolsar, reabrir, exportar. `[OBS]` Ver Spec 007.

## Entidades clave

- **Order** — número, cliente, dirección copiada, canal, estados, totales desglosados, moneda, momentos de cada hito. Una orden de compra es un `Order` en estado borrador, no una entidad aparte: comparte número, líneas y totales, y solo se distingue por no haber tocado el inventario todavía.
- **OrderLine** — datos congelados del producto, cantidad, precio unitario, descuento aplicado.
- **Payment** — método, importe, estado, referencia externa, momento.
- **Fulfillment** — ubicación de origen, transportadora, guía, estado, momento.
- **OrderEvent** — bitácora inmutable de cambios de estado y acciones.

## Criterios de aceptación

- Un pedido creado con una variante cuyo precio cambia al día siguiente conserva el precio original.
- Cancelar un pedido devuelve exactamente la cantidad reservada al inventario, ni más ni menos.
- Un pedido contraentrega puede alcanzar cumplimiento `despachado` con pago `pendiente`, sin forzar estados ficticios.
- Una orden de compra en borrador con tres unidades deja el inventario intacto; al marcar el pago recibido, el inventario baja en tres y la orden pasa a venta, todo o nada.
- Un intento de transición no permitida es rechazado y queda registrado.
- Enviar al backend un total manipulado no altera el total almacenado.
- La suma de los pedidos exportados de un rango coincide con el total que reporta el panel para ese mismo rango.

## Fuera de alcance

Facturación electrónica, devoluciones con logística inversa completa, pedidos con pagos parciales múltiples, y conciliación automática con transportadoras.

## Clarificaciones pendientes

- `[NEEDS CLARIFICATION]` ¿El consecutivo de pedidos es configurable por el inquilino (prefijo, número inicial)?
- `[NEEDS CLARIFICATION]` ¿Se permite editar un pedido ya confirmado y bajo qué condiciones?
- `[NEEDS CLARIFICATION]` ¿Cómo se maneja el impuesto — incluido en el precio o agregado al total? Varía por país.
