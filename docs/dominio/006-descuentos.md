# Spec 006 — Descuentos: cupones y promociones

**Estado:** borrador · **Fase:** 6 · **Evidencia:** `[OBS]` — formulario de cupón recorrido completo; promociones observadas en su pantalla de presentación

## Objetivo

Permitir al inquilino ofrecer descuentos controlados, sin que puedan explotarse para vender por debajo del costo ni acumularse de formas no previstas.

## Corrección respecto de la versión anterior de esta spec

Son **dos entidades distintas**, no una. El admin de referencia separa el módulo Descuentos en `Cupones` y `Promociones`:

| | Cupón | Promoción |
|---|---|---|
| Activación | El cliente escribe un código, o entra por un link que lo aplica solo | Automática, sin código |
| Tipos | Porcentaje, monto fijo, envío gratis | 2x1, 3x2 y otras NxM, porcentaje sobre productos o categorías |
| Alcance | Toda la tienda, categorías o productos | Productos o categorías |
| Vigencia | Ilimitada o período | Ofertas por tiempo limitado |

La versión anterior de esta spec dejaba las promociones automáticas fuera de alcance. Era un error: son un módulo de primera clase y la mecánica NxM no se deriva de un cupón.

---

## Historias de usuario

1. Como operador, creo un cupón de 20 % con vigencia de una semana.
2. Como operador, comparto un link que aplica el cupón solo, sin que el cliente escriba nada.
3. Como operador, limito un cupón a la primera compra del cliente.
4. Como operador, pongo tope de $50.000 al descuento de un cupón porcentual.
5. Como operador, creo una promoción 2x1 sobre una categoría, sin código.
6. Como operador, decido si un cupón se puede combinar con el precio promocional del producto.
7. Como comprador, aplico un cupón en el checkout y veo el total recalculado.

## Requisitos funcionales

### Cupones
- **FR-501** El cupón debe soportar tres tipos: porcentaje, monto fijo y envío gratis. `[OBS]`
- **FR-502** Cada cupón debe tener un código legible, único dentro del inquilino, insensible a mayúsculas.
- **FR-503** El sistema debe generar un **link de aplicación automática** del cupón, para compartir. `[OBS: el formulario expone `/discount/<código>`]`
- **FR-504** En los cupones porcentuales, el sistema debe permitir **incluir o excluir el costo de envío** de la base del descuento. `[OBS]`
- **FR-505** El cupón debe poder aplicarse a toda la tienda, a categorías elegidas o a productos elegidos. `[OBS]`
- **FR-506** El cupón debe admitir límite de usos **por cupón** y límite **por cliente**, cada uno ilimitado o con tope. `[OBS]`
- **FR-507** El cupón debe poder restringirse a la **primera compra** del cliente. `[OBS]`
- **FR-508** El cupón debe admitir vigencia ilimitada o por período con inicio y fin. `[OBS]`
- **FR-509** El cupón debe admitir monto mínimo de carrito como condición, calculado **sin incluir el costo de envío**. `[OBS]`
- **FR-510** El cupón debe admitir **monto máximo de descuento**, para acotar el porcentaje. `[OBS]` Sin este tope, un cupón porcentual sobre un carrito grande descuenta sin límite.
- **FR-511** La combinación con otras promociones debe ser una decisión explícita por cupón, no un comportamiento implícito del sistema. `[OBS: el formulario tiene "Permitir combinar con otras promociones. Ej.: precio promocional, envío gratis y otras"]`
- **FR-512** El sistema debe poder desactivar un cupón sin borrarlo.

### Promociones
- **FR-520** El sistema debe soportar promociones automáticas que se aplican sin código. `[OBS]`
- **FR-521** El sistema debe soportar mecánicas NxM: 2x1, 3x2 y variantes. `[OBS]`
- **FR-522** La promoción debe poder aplicarse a productos o a categorías. `[OBS]`
- **FR-523** La promoción debe admitir vigencia por período. `[OBS]`
- **FR-524** Cuando una promoción NxM aplica sobre unidades de distinto precio, la regla de cuál se bonifica debe ser explícita y documentada. `[NEEDS CLARIFICATION: ¿se bonifica la unidad más barata del grupo?]`

### Reglas transversales
- **FR-530** La validación y la aplicación de todo descuento debe ocurrir en el servidor, al confirmar el pedido, no solo al escribir el código.
- **FR-531** El sistema debe impedir que el total de un pedido quede negativo.
- **FR-532** El límite de usos debe respetarse ante confirmaciones simultáneas: un cupón de un uso no puede aplicarse dos veces.
- **FR-533** El descuento aplicado debe quedar registrado en el pedido con su origen, código e importe, y sobrevivir a la eliminación del cupón o la promoción.
- **FR-534** El orden de aplicación entre precio promocional de la variante, promoción automática y cupón debe estar definido y ser determinista.
- **FR-535** El sistema debe reportar usos e importe total descontado por cupón y por promoción.
- **FR-536** La interacción entre un descuento y una tabla de precios mayorista debe estar definida. `[NEEDS CLARIFICATION: ¿el cupón aplica sobre el precio mayorista o se excluyen entre sí?]`

## Entidades clave

- **Coupon** — código, link, tipo, valor, si incluye envío en la base, alcance, condiciones, vigencia, límites por cupón y por cliente, primera compra, monto mínimo de carrito, tope de descuento, combinable, estado, contador de usos.
- **Promotion** — mecánica (NxM o porcentual), alcance, vigencia, estado.
- **DiscountRedemption** — origen (cupón o promoción), pedido, cliente, importe descontado, momento. Es lo que permite auditar y hacer cumplir los límites por cliente.

## Criterios de aceptación

- Un cupón vencido se rechaza con un mensaje que distingue "vencido" de "inexistente".
- Un cupón de un solo uso aplicado simultáneamente desde dos sesiones se consume una sola vez.
- Un cupón porcentual con tope de $50.000 sobre un carrito de $1.000.000 descuenta exactamente $50.000.
- Un cupón de monto fijo mayor que el subtotal deja el total en cero, nunca negativo.
- Un cupón marcado como no combinable, sobre un producto con precio promocional, no se acumula.
- Un cupón de primera compra se rechaza para un cliente con pedidos previos.
- El link de cupón aplica el descuento sin que el comprador escriba el código.
- Una promoción 2x1 sobre tres unidades cobra dos.
- Enviar al backend un importe de descuento arbitrario no altera el total calculado.
- Eliminar un cupón no modifica los pedidos que lo usaron.

## Fuera de alcance

Campañas con segmentación avanzada por comportamiento, descuentos escalonados por volumen (eso vive en las tablas de precio, Spec 002), y cupones generados en lote.
