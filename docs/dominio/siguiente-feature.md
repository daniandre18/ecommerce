# Siguiente feature: el catálogo de cara a la tienda

Comparación hecha el 2026-10-05 contra `libs/domain/src/entities/product.ts` y `variant.ts`.

## Lo que falta, repartido en tres features

| Feature | Qué cubre | Por qué separada |
|---|---|---|
| **002 — Catálogo de cara a la tienda** | Categorías con subcategorías, SEO y URL amigable, peso y dimensiones, GTIN, tipo físico o digital, video externo, destacados, envío gratis por producto, ocultar precio, plantilla de visualización, atributos de catálogos externos | Es lo que convierte tu catálogo interno en un catálogo publicable. No depende de nada nuevo |
| **003 — Inventario por ubicación** | Centros de distribución, stock por par variante-ubicación, movimientos por ubicación | Cambia `StockLevel`, que hoy es un valor único de la variante. Es migración de datos, no un campo más. Y es precondición del envío |
| **004 — Tablas de precio** | Tablas con estado, clientes asignados, medios de pago y envío propios, link de auto-registro, importación CSV | Canal B2B completo. Depende de que existan clientes, que todavía no tienes |

La 002 es la que pediste. Las otras dos quedan anotadas para que no se te olvide que existen.

---

## Input para `/speckit.specify` — feature 002

```
Catálogo de cara a la tienda. El comercio organiza sus productos en categorías con
subcategorías, y un producto puede estar en varias. Cada producto lleva los datos que
una tienda pública necesita para mostrarlo y para que lo encuentren: título y
descripción para buscadores, una URL amigable única dentro del inquilino que se genera
sola a partir del nombre y se puede editar, etiquetas de búsqueda y marca. El producto
declara si es físico o digital; el físico lleva peso y dimensiones, que son los datos
con los que después se cotiza un envío, y el digital no los pide. Cada variante puede
llevar código de barras GTIN además de su SKU, y su propio peso y dimensiones cuando
difieren de los del producto. El producto admite un video externo junto a sus imágenes.
El comercio decide por producto si el precio se muestra o se oculta en la tienda, si
ofrece envío gratis, en qué secciones destacadas aparece y con qué plantilla se
presenta. Para los catálogos externos el producto admite MPN, rango de edad y género.
Todo lo anterior respeta los permisos ya existentes: quien no puede editar precios
tampoco puede cambiar si el precio se muestra. Fuera de alcance: la tienda pública en
sí, inventario por ubicación, tablas de precio, importación masiva, carrito, pedidos.
```

### Después de que Spec Kit genere la spec

```
Contrasta specs/002-*/spec.md con docs/dominio/002-catalogo-productos.md: FR-102 a
FR-112 (producto), FR-122 y FR-123 (variante), FR-142 (ocultar precio) y FR-145
(permiso de precio). Señala qué falta y qué sobra.
```

---

## Decisiones que conviene cerrar en `/speckit.clarify`

1. **Categorías.** ¿Qué profundidad de anidamiento se admite? Tiendanube dice "categorías y subcategorías" sin declarar el tope. Un árbol sin límite complica el breadcrumb y las consultas; dos o tres niveles cubren casi todo comercio.
2. **URL amigable.** Qué pasa cuando cambia el nombre de un producto ya publicado: ¿la URL se mantiene, se regenera, o se regenera dejando redirección? Tiendanube genera una nueva si colisiona, pero no vi qué hace al renombrar. Si no se decide, se rompen enlaces compartidos.
3. **Peso y dimensiones.** ¿Viven en el producto, en la variante, o en ambos con la variante sobrescribiendo? Tiendanube los pone en el producto; una camiseta y un abrigo de la misma línea pesan distinto.
4. **Ocultar el precio.** ¿Es solo presentación o también bloquea la compra? Si el precio no se ve pero el producto se puede agregar al carrito, el comprador llega al checkout con una sorpresa.
5. **Producto digital.** ¿Esta feature solo omite peso y envío, o ya implica entrega de archivo? Lo primero es un campo; lo segundo es otra feature entera.

---

## Lo que no conviene recortar

- **La URL amigable única por inquilino**, con su índice. Agregarla después obliga a generar URLs para todo el catálogo existente y a decidir redirecciones con productos ya indexados.
- **Peso y dimensiones**, aunque todavía no haya envíos. Sin ellos no se puede cotizar nada, y cargarlos a posteriori significa editar producto por producto.
- **La categoría como entidad con su propio aislamiento por inquilino**, no como una etiqueta de texto en el producto.
