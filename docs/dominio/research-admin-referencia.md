# Análisis funcional — admin de Tiendanube (cuboideas) como referencia

**Fecha:** 2026-10-01
**Objetivo:** inventariar las capacidades del admin de Tiendanube para alimentar las especificaciones de la plataforma propia (multi-inquilino, Angular + Firebase, arquitectura limpia) con GitHub Spec Kit.
**Alcance acordado:** núcleo transaccional. Los canales de venta externos, marketing, estadísticas avanzadas y la plataforma de apps quedan documentados como superficie pero fuera del MVP.

---

## 1. Estado de la observación

Este análisis distingue tres niveles de evidencia. Respetarlo es lo que evita que las especificaciones se llenen de supuestos disfrazados de requisitos.

| Nivel | Significado |
|---|---|
| `[OBS]` | Observado directamente en el admin con la sesión de cuboideas. |
| `[INF]` | Inferido del comportamiento estándar de la plataforma; **requiere verificación** en el admin. |
| `[?]` | Desconocido. Marcado en las specs como `[NEEDS CLARIFICATION]`. |

**Recorrido:** árbol de navegación completo · alta de cliente · **alta de producto** · **métodos de pago** · **usuarios y perfiles con el catálogo completo de permisos** · **opciones del checkout** · **alta de cupón** · promociones · campos personalizados · medios de envío · **órdenes de compra y detalle de orden** · **idiomas y monedas** · categorías · centros de distribución · aplicaciones.

**No observable:** el detalle de una venta real y la lista de productos, porque la tienda de referencia no tiene ventas ni catálogo cargado. El módulo de ventas se reconstruyó desde su catálogo de permisos, que enumera cada operación disponible, y desde el detalle de una orden de compra. Quedan sin recorrer e-mails automáticos, dominios, marketing, estadísticas y los ocho canales de venta — todos de fase 2 o 3.

---

## 2. Mapa de módulos del admin `[OBS]`

Árbol completo tal como lo expone la navegación:

```
Inicio
Estadísticas

Gestión
├── Ventas
│   ├── Lista de ventas
│   ├── Órdenes de compra        (pedidos en borrador)
│   └── Carritos abandonados
├── Productos
│   ├── Lista de productos
│   ├── Inventario
│   ├── Categorías               (con subcategorías)
│   └── Tablas de precios
├── Clientes
│   ├── Lista de clientes
│   └── Mensajes
├── Descuentos
│   ├── Cupones
│   └── Promociones
└── Marketing

Canales de venta
├── Tienda en línea
├── Punto de Venta
├── Chat
├── Instagram y Facebook
├── Google Shopping
├── TikTok
├── Pinterest
└── Marketplaces

Aplicaciones
├── Lista de Aplicaciones
└── Aplicaciones a medida        (apps privadas del inquilino)

Configuración
├── Planes y pagos ──── Pagos · Planes · Facturación
├── Datos del negocio
├── Pagos y envíos ──── Métodos de pago · Medios de envío · Centros de distribución
├── Comunicación ────── Información de contacto · Botón de WhatsApp · E-mails automáticos
├── Checkout ────────── Opciones del checkout · Mensaje para clientes
└── Otros ───────────── Usuarios y perfiles · Dominios · Códigos externos ·
                        Idiomas y monedas · Redireccionamientos 301 · Campos personalizados

Cuenta
├── Datos de la cuenta
├── Medidas de seguridad
└── Sesiones y dispositivos

Lumi (asistente conversacional embebido en el admin)
```

### Lecturas de arquitectura que se desprenden del mapa

1. **La tienda es el inquilino, y el plan vive en el inquilino.** `Planes y pagos` está dentro de la configuración de la tienda, no en una consola aparte: la suscripción es un atributo del tenant. El admin mostró el aviso *"Paga el plan en 6 días para no perder el acceso al administrador"* `[OBS]`, es decir que el estado del plan **bloquea el acceso al back office** sin borrar los datos. Eso es una máquina de estados del tenant, no un flag.
2. **El canal de venta es una dimensión transversal, no un módulo.** Ocho canales distintos (tienda, POS, chat, cuatro redes, marketplaces) convergen en el mismo catálogo y el mismo pedido. El pedido necesita origen desde el día uno, incluso con un solo canal implementado.
3. **La internacionalización está en el núcleo, no en una fase 2.** `Idiomas y monedas` es configuración de tienda, y el selector de país del formulario de cliente prioriza Argentina, Chile, Colombia, España, México, Perú, Uruguay y Venezuela antes de la lista mundial `[OBS]`. Moneda, idioma y formato de dirección son parte del modelo desde el inicio.
4. **La extensibilidad es producto.** `Aplicaciones`, `Códigos externos` y `Campos personalizados` son tres mecanismos de extensión distintos: apps de terceros con permisos, inyección de scripts, y atributos arbitrarios sobre entidades. Los campos personalizados son los que más contaminan el modelo de datos si se dejan para después.
5. **`Centros de distribución` separado de `Medios de envío`** implica inventario por ubicación, no un número de stock por variante. Es la decisión de modelado más costosa de revertir.

---

## 3. Modelo de dominio inferido

### 3.1 Entidad `Customer` `[OBS]` — único formulario leído en detalle

Campos exactos del alta de cliente:

**Datos personales**
- Nombre y apellido — un solo campo, no `firstName` + `lastName`
- E-mail
- Teléfono (opcional)
- Documento de identidad (opcional) — la etiqueta es regional: "DNI o CUIL"

**Datos de envío**
- Calle · Número · Dirección (cont.) · Código postal · Barrio · Ciudad · Estado · País

**Comercial**
- Tabla de precios asignable, para dar acceso a precios mayoristas

Tres conclusiones de diseño:

- **El nombre es un campo libre.** Partirlo en nombre y apellido es una decisión que rompe datos en LATAM (dos apellidos, nombres compuestos). Conservar `fullName` como campo de dominio.
- **La dirección es un value object con forma regional.** `Barrio` y `Estado` conviven en el mismo formulario porque la plataforma sirve a varios países con esquemas distintos; `Código postal` es obligatorio en Argentina y prácticamente inútil en buena parte de Colombia. La dirección debe ser un objeto validado por país, no ocho columnas planas.
- **El precio no es un atributo del producto.** La tabla de precios asignada al cliente significa que el precio resuelto depende del par (variante, tabla de precios del cliente). Modelar el precio como propiedad única de la variante obliga a rehacer catálogo, carrito y pedido más adelante. Esta es la decisión de modelado que ordeno primero.
- El documento de identidad es un dato fiscal necesario para facturación en varios países; no se almacena como texto suelto sino con tipo de documento `[INF]`.

### 3.2 Hallazgos de la segunda pasada que cambiaron el modelo

**La tabla de precios es un canal B2B, no un descuento.** Ocho de los doce permisos del grupo Productos son de tablas de precio: crearlas, editarlas, fijar su estado, asignarles clientes, **configurarles medios de pago y envío propios**, compartir un **link de auto-registro** e importar por CSV. Sumado a la opción del checkout que restringe las compras a "solo tus clientes autorizados", lo que hay es una tienda mayorista paralela dentro de la misma tienda. Modelarla como un porcentaje sobre el precio base es quedarse corto por mucho.

**El permiso de precio ya existe separado.** `Editar precios` y `Editar stock` son permisos independientes de `Gestión de productos`. El requisito del cliente de celulares no es una rareza: es el diseño estándar de la plataforma, y confirma la granularidad que hay que implementar.

**La visibilidad del producto tiene tres estados, no dos.** `Visible`, `No listado` (solo por enlace directo, fuera de tienda y buscadores) y `Oculto`. Es una dimensión de distribución, no un ciclo borrador–publicado.

**Descuentos son dos módulos.** `Cupones` (con código o link de aplicación automática) y `Promociones` (automáticas, NxM del tipo 2x1 y 3x2). La mecánica NxM no se deriva de un cupón.

**El cupón tiene topes que suelen olvidarse.** Monto máximo de descuento, límite por cliente, restricción a primera compra, y un interruptor explícito de combinación con otras promociones. Sin el tope, un cupón porcentual sobre un carrito grande descuenta sin límite.

**El plan bloquea funcionalidades, no solo volumen.** El método de pago personalizado — efectivo y transferencia — está detrás de una mejora de plan. Eso obliga a un mecanismo de capacidades por plan evaluado en servidor.

**Ningún proveedor de pago nativo ofrece contraentrega**, ni siquiera entre los diez disponibles para Colombia. En esta plataforma se resuelve con apps de terceros. Para un producto pensado en Colombia, la contraentrega va en el núcleo.

**El envío depende del inventario por ubicación.** Los medios de envío no se activan hasta definir un centro de distribución principal. Confirma que el stock por ubicación es precondición, no función avanzada.

**Los campos personalizados aplican a cinco entidades** — categorías, clientes, productos, variantes y ventas — más metaobjetos, que son entidades de contenido que el inquilino define por su cuenta.

**El pedido en borrador resuelve cuándo se toca el stock.** Las `Órdenes de compra` son pedidos manuales para venta presencial o por redes. El admin lo dice textualmente: al marcar el pago como recibido, la orden se transforma en venta y el producto se descuenta del stock. Es decir, **el borrador no reserva inventario**; el descuento ocurre en la conversión. Una orden puede quedar abierta sin bloquear nada, que es justo lo que necesita una venta por WhatsApp que tarda días en cerrarse.

**La internacionalización es por país, no por idioma suelto.** Se habilitan países, cada uno con su moneda e idioma, y el comprador elige en cuál navegar. Además existe una **moneda de administración** distinta de las de venta, en la que el operador gestiona sus precios, con **tasas de cambio que él mismo edita**. No hay conversión automática: el precio de venta no se mueve solo. Eso descarta tratar la moneda como un simple formato de presentación.

**La plataforma de apps tiene dos caminos:** tienda de aplicaciones de terceros y `Aplicaciones a medida`, que son apps privadas del propio inquilino. Si la plataforma va a tener extensiones, el camino privado importa tanto como el público.

### 3.3 Resto del núcleo `[INF]` — a verificar en el admin

| Entidad | Qué falta confirmar |
|---|---|
| `Order` | La máquina de estados de una venta real, con líneas, pago y despacho. La tienda de referencia no tiene ventas, solo una orden de compra vacía |
| `OrderLine` | Si congela precio y nombre al momento de la compra |
| `Category` | Profundidad máxima de anidamiento |
| `PriceList` | Si fija precio explícito por variante, porcentaje global, o ambos |
| `Location` | Cómo se resuelve desde qué centro se despacha cuando hay varios |
| `CustomField` | Tipos de dato disponibles y si aplican al storefront |

### 3.4 Entidades propias de la plataforma multi-inquilino

No aparecen en el admin de una tienda porque son el nivel superior: `Tenant` (tienda, dominio, plan, estado, moneda, idiomas), `Subscription` y `Membership` (la relación usuario ↔ tenant ↔ rol, que permite al mismo usuario operar varias tiendas con permisos distintos).

---

## 4. Priorización

### MVP — fase 1

Lo que permite que una tienda venda y se opere. Orden de construcción, no de importancia:

1. **Tenancy e identidad** — sin aislamiento correcto, todo lo demás se reescribe.
2. **Catálogo** — productos, variantes, inventario, listas de precios.
3. **Clientes** — con dirección regional y tabla de precios.
4. **Pedidos** — máquina de estados, totales calculados en servidor.
5. **Checkout, pagos y envíos** — un método de pago y uno de envío reales.
6. **Descuentos** — cupones por porcentaje y monto fijo.
7. **Usuarios y perfiles** — roles con permisos por recurso.

### Fase 2
Estadísticas y reportes · campos personalizados · e-mails automáticos · dominios propios · SEO y redirecciones 301 · carritos abandonados.

### Fase 3
Canales de venta adicionales · POS · plataforma de apps con OAuth y webhooks · multi-moneda con conversión · marketplaces.

### Fuera de alcance deliberado
Asistente conversacional tipo Lumi, editor visual de temas, y la capa de facturación de la propia plataforma (cobrar a los inquilinos) hasta que exista demanda real.

---

## 5. Riesgos y decisiones que no conviene postergar

| Riesgo | Por qué duele después | Decisión |
|---|---|---|
| Aislamiento entre inquilinos | Una fuga de datos entre tiendas no se arregla con un parche: destruye la confianza en el producto | `tenantId` en claims del token + reglas de seguridad que lo validan en toda ruta. Nunca filtrar por tenant solo en el cliente |
| Totales calculados en el cliente | Precios manipulables desde el navegador | Totales, descuentos y envío se resuelven en Cloud Functions; el cliente solo propone |
| Stock sin control de concurrencia | Sobreventa en picos de tráfico, que en contraentrega significa pedidos que no se pueden cumplir | Descuento de stock en transacción, con reserva al confirmar pedido |
| Precio como campo único de la variante | Rompe listas de precios, promociones y mayoristas | Resolución de precio como servicio de dominio desde la primera versión |
| Estado de pedido como un solo campo | Obliga a estados combinados absurdos ("pagado pero no enviado y con novedad") | Estados independientes para pago, cumplimiento y envío |
| Campos personalizados | Si se agregan tarde, migrar datos reales de inquilinos en producción | Dejar el punto de extensión previsto en el esquema aunque la UI llegue en fase 2 |
| Dirección como campos planos | Cada país nuevo es una migración | Value object con validación por país desde el inicio |

---

## 6. Qué falta para cerrar este análisis

Las specs 001, 002, 003, 005, 006 y 007 están sobre observación directa. Falta:

- **Detalle de una venta real** — requiere una venta cargada en la tienda de referencia, que hoy no tiene ninguna. Es lo único que impide cerrar la Spec 004; el borrador y los permisos ya cubren buena parte.
- **Regla de despacho multi-ubicación** — requiere definir dos centros de distribución en la tienda de referencia.
- **E-mails automáticos, dominios, marketing y estadísticas** — fase 2, no bloquean el MVP.
- **Los ocho canales de venta y la plataforma de apps** — fase 3.

Conviene hacerlo pronto: el admin avisa que el plan vence en días y el acceso al back office se pierde con él.
