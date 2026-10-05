# Material de dominio — referencia, no features

Estos documentos **no son features de Spec Kit** y no se implementan directamente. Son el análisis funcional del que salen los inputs de `/speckit.specify`.

## Origen

Análisis del admin de Tiendanube (tienda cuboideas), recorrido pantalla por pantalla el 2026-10-01: alta de producto, métodos de pago, catálogo completo de permisos, opciones del checkout, cupones, promociones, campos personalizados, medios de envío, órdenes de compra y su detalle, idiomas y monedas, categorías, centros de distribución y aplicaciones.

`research-admin-referencia.md` tiene el mapa de módulos y los hallazgos que cambiaron el modelo.

## Nivel de evidencia

- `[OBS]` — observado directamente en el admin
- `[INF]` — inferido, pendiente de verificar
- `[NEEDS CLARIFICATION: …]` — decisión de producto abierta

## Los siete documentos

| Archivo | Cubre | Estado en este repo |
|---|---|---|
| `001-tenancy-identidad.md` | Inquilinos, membresías, roles, estados de plan, países y monedas | Cubierto por `001-catalog-rbac`, salvo estados de plan y multi-país |
| `002-catalogo-productos.md` | Productos, variantes, inventario, precios, tablas de precio | Cubierto, salvo tablas de precio B2B, inventario por ubicación y categorías |
| `003-clientes.md` | Clientes y direcciones colombianas | **Pendiente** |
| `004-pedidos-ventas.md` | Pedidos, estados, orden de compra en borrador | **Pendiente** |
| `005-checkout-pagos-envios.md` | Carrito, checkout, contraentrega, envíos | **Pendiente** |
| `006-descuentos.md` | Cupones y promociones | **Pendiente** |
| `007-usuarios-perfiles.md` | Catálogo de permisos por recurso | Cubierto por `001-catalog-rbac` |

## Cómo se usan

Al redactar el input de `/speckit.specify` para una feature nueva, se sacan de aquí los requisitos que esa feature toca. Después de que Spec Kit genere la spec, conviene contrastarla contra los FR correspondientes:

```
Contrasta specs/<feature>/spec.md con docs/dominio/004-pedidos-ventas.md
(FR-301 a FR-306, FR-310 a FR-313, FR-320 a FR-325, FR-340 a FR-343).
Señala qué falta y qué sobra.
```

## Tensión conocida con la constitución

El principio II exige reservar existencias al iniciar el checkout y descontarlas **al confirmarse el pago**, con liberación automática de reservas no confirmadas.

En contraentrega el pago se confirma en la entrega, días después del despacho. Aplicado literalmente, el principio dejaría la existencia reservada —no descontada— durante todo el tránsito, y una reserva con expiración podría liberarse con el producto ya en la calle.

El admin de referencia resuelve distinto: el borrador no reserva nada, y el descuento ocurre al convertirse en venta. Es una decisión que hay que tomar explícitamente en la feature de pedidos, no heredarla sin mirar.
