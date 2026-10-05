# Spec 002 — Catálogo: productos, variantes, inventario y precios

**Estado:** borrador · **Fase:** 2 · **Evidencia:** `[OBS]` — formulario de alta de producto recorrido completo

## Objetivo

Administrar el catálogo de una tienda: productos con variantes, inventario por ubicación, y precios que pueden diferir según el cliente que los consulta.

## Correcciones respecto de la versión anterior de esta spec

| Supuesto anterior | Lo observado |
|---|---|
| Estados `borrador / publicado / archivado` | La dimensión real es **visibilidad**: `Visible`, `No listado` (accesible solo por enlace directo, fuera de la tienda y de buscadores), `Oculto` |
| Productos digitales fuera de alcance | El producto tiene tipo `Físico` o `Digital` desde el formulario base |
| Precio comparativo | Son `Precio de venta` y `Precio promocional`, más un toggle para **no mostrar el precio** en la tienda |
| Tabla de precios como porcentaje mayorista | Es un **canal B2B completo**: estado propio, clientes asignados, pagos y envíos propios, link de auto-registro e importación CSV |

---

## Campos observados en el alta de producto `[OBS]`

**Nombre y descripción** — nombre, descripción con formato enriquecido, y **plantilla** de visualización ("Producto (Plantilla maestra)").
**Fotos y video** — carga de imágenes por arrastre y link de video externo de YouTube o Vimeo.
**Precio** — toggle `Mostrar en la tienda`, `Precio de venta`, `Precio promocional`, y calculadora de margen de ganancia.
**Tipo de producto** — `Físico` o `Digital`.
**Peso y dimensiones** — peso en kg; profundidad, ancho y alto en cm, para calcular el envío.
**Códigos** — `SKU` (control interno de stock) y `Código de barras (GTIN)` (EAN, UPC o ISBN).
**Variantes** — propiedades del tipo color, talla o sabor.
**Inventario** — modo `Infinito` o `Limitado` con cantidad.
**Categorías** · **Destacado en la tienda** (secciones donde aparece).
**SEO y búsqueda** — tags, marca, título SEO (70 caracteres), descripción SEO (160), URL del producto con generación automática ante colisión.
**Instagram y Google Shopping** — MPN, rango de edad (0-3 meses, 3-12 meses, 1-5 años, 5-13 años, adulto) y género (femenino, masculino, sin género).
**Visibilidad** — `Visible`, `No listado`, `Oculto`.
**Envío gratis** — por producto.

---

## Historias de usuario

1. Como operador, creo un producto con fotos, descripción y precio y lo publico.
2. Como operador, dejo un producto accesible solo por enlace, sin que aparezca en la tienda ni en buscadores.
3. Como operador, defino un producto con talla y color y obtengo una variante por combinación.
4. Como operador, cargo el costo y veo el margen antes de fijar el precio.
5. Como operador con varios centros de distribución, veo el stock separado por ubicación.
6. Como operador, creo una tabla de precios mayorista y comparto un link para que los mayoristas se registren solos.
7. Como responsable de precios, impido que el equipo de catálogo modifique precios o stock.

## Requisitos funcionales

### Producto
- **FR-101** El sistema debe permitir crear, editar y archivar productos.
- **FR-102** El producto debe tener tres estados de visibilidad: `visible`, `no listado` y `oculto`. `no listado` significa accesible por enlace directo pero ausente de la tienda y de los buscadores. `[OBS]`
- **FR-103** El producto debe admitir múltiples imágenes con orden definido por el operador, y un link de video externo. `[OBS]`
- **FR-104** El producto debe admitir descripción con formato enriquecido. `[OBS]`
- **FR-105** El producto debe admitir metadatos de SEO: tags, marca, título de hasta 70 caracteres, descripción de hasta 160 y URL amigable única dentro del inquilino, generada automáticamente si colisiona. `[OBS]`
- **FR-106** El producto debe poder clasificarse en categorías, y las categorías admiten subcategorías. `[OBS]` `[NEEDS CLARIFICATION: profundidad máxima de anidamiento]`
- **FR-107** El producto debe tener tipo `físico` o `digital`. El tipo digital omite peso, dimensiones y envío. `[OBS]`
- **FR-108** El producto debe admitir peso y dimensiones para el cálculo de envío. `[OBS]`
- **FR-109** El producto debe poder marcarse con envío gratis individualmente. `[OBS]`
- **FR-110** El producto debe poder destacarse en secciones determinadas de la tienda. `[OBS]`
- **FR-111** El producto debe admitir atributos para catálogos externos: MPN, rango de edad y género. `[OBS]`
- **FR-112** El producto debe poder asociarse a una plantilla de visualización del tema. `[OBS]`
- **FR-113** Archivar un producto no debe alterar los pedidos históricos que lo contienen.

### Variantes
- **FR-120** El producto debe soportar de cero a N variantes. Un producto sin variantes se trata internamente como un producto con una variante única, para no duplicar la lógica de precio y stock.
- **FR-121** Las variantes se generan a partir de propiedades definidas por el operador, del tipo color, talla o sabor. `[OBS]` `[NEEDS CLARIFICATION: cantidad máxima de propiedades y de valores por propiedad]`
- **FR-122** Cada variante debe admitir SKU y código de barras GTIN (EAN, UPC o ISBN), con SKU único dentro del inquilino. `[OBS]`
- **FR-123** Cada variante debe admitir peso y dimensiones propios.
- **FR-124** El sistema debe impedir eliminar una variante que aparece en pedidos; debe archivarse.

### Inventario
- **FR-130** El stock debe registrarse por par variante–ubicación. `[OBS: "Centros de distribución" es configuración separada, y los medios de envío exigen definir un centro principal antes de activarse]`
- **FR-131** El inventario debe admitir modo `infinito` o `limitado con cantidad`. `[OBS]`
- **FR-132** El sistema debe registrar todo movimiento de inventario con motivo, cantidad, usuario y momento.
- **FR-133** El descuento de stock debe ser transaccional: dos pedidos simultáneos sobre la última unidad no pueden ambos tener éxito.
- **FR-134** El sistema debe exponer un umbral de stock bajo por variante.
- **FR-135** Editar stock debe requerir un permiso independiente del de editar el producto. `[OBS]` Ver Spec 007.

### Precios
- **FR-140** Cada variante debe tener precio de venta en la moneda principal del inquilino. `[OBS]`
- **FR-141** La variante debe admitir precio promocional, mostrado junto al precio de venta tachado. `[OBS]`
- **FR-142** El producto debe poder ocultar su precio en la tienda, para venta bajo consulta. `[OBS]`
- **FR-143** El sistema debe permitir registrar el costo del producto y calcular el margen. El costo no debe ser visible para perfiles sin permiso. `[OBS: el formulario ofrece "Calcular margen de ganancia"]`
- **FR-144** El precio aplicable debe resolverse como función de la variante y del cliente que consulta, nunca leerse directamente del producto.
- **FR-145** Editar precios debe requerir un permiso independiente del de editar el producto. `[OBS]` Ver Spec 007.
- **FR-146** El precio debe registrarse en la unidad mínima de la moneda, sin aritmética de punto flotante sobre importes.
- **FR-147** El precio se define en la moneda de administración del inquilino y se expresa en cada moneda de venta aplicando la tasa de cambio configurada. `[OBS]` Ver Spec 001.

### Tablas de precio — canal mayorista
- **FR-150** El inquilino debe poder crear tablas de precio con estado propio, activables y desactivables. `[OBS]`
- **FR-151** La tabla de precios debe tener clientes asignados, y el precio que ve un cliente depende de la tabla que tenga asignada. `[OBS]`
- **FR-152** La tabla de precios debe poder tener **medios de pago y de envío propios**, distintos de los de la tienda general. `[OBS]`
- **FR-153** El sistema debe generar un **link de auto-registro** para que un mayorista se dé de alta en una tabla sin intervención del operador. `[OBS]`
- **FR-154** La tabla de precios debe poder cargarse e importarse por CSV. `[OBS]`
- **FR-155** El acceso a la tienda debe poder restringirse solo a clientes autorizados. `[OBS: opción "Restringir compras → Solo tus clientes autorizados" en las opciones del checkout]`
- **FR-156** Cada capacidad de las tablas de precio debe corresponder a un permiso separado. `[OBS: el admin de referencia tiene ocho]` Ver Spec 007.

## Entidades clave

- **Product** — nombre, descripción, tipo físico o digital, visibilidad, SEO, categorías, imágenes, video, plantilla, atributos de catálogos externos, envío gratis.
- **Variant** — producto padre, combinación de propiedades, SKU, GTIN, precio de venta, precio promocional, costo, peso, dimensiones.
- **InventoryItem** — variante, ubicación, modo infinito o limitado, cantidad disponible, cantidad reservada, umbral de alerta.
- **InventoryMovement** — variante, ubicación, delta, motivo, autor, momento.
- **PriceList** — nombre, estado, precios por variante, clientes asignados, medios de pago y envío propios, token de auto-registro.
- **Location** — centro de distribución con dirección; uno marcado como principal.
- **Category** — clasificación del catálogo.

## Criterios de aceptación

- Crear un producto con dos propiedades de tres valores cada una genera nueve variantes, cada una con SKU editable.
- Un producto `no listado` se abre por su enlace directo y no aparece en la tienda ni en el sitemap.
- Dos solicitudes concurrentes sobre la última unidad dejan exactamente un pedido confirmado y el stock en cero.
- Un cliente con tabla mayorista asignada ve un precio distinto al de un cliente sin tabla, para la misma variante.
- Un cliente de una tabla con medios de pago propios ve en el checkout solo esos medios.
- Un usuario con permiso de gestión de productos y sin permiso de precio guarda nombre y descripción, y recibe rechazo al cambiar el precio — verificado con petición directa al backend, no solo con el campo deshabilitado.
- El costo del producto no es legible para un perfil sin permiso de precios.
- Archivar un producto presente en un pedido antiguo deja ese pedido con su nombre y precio originales.

## Fuera de alcance

Combos, suscripciones, conversión automática de divisas contra un servicio externo, y generación de contenido con IA.

## Clarificaciones pendientes

- `[NEEDS CLARIFICATION]` ¿La tabla de precios fija precio explícito por variante, porcentaje global, o ambos?
- `[NEEDS CLARIFICATION]` ¿Los productos digitales requieren entrega de archivo y licencias, o solo omiten el envío?
