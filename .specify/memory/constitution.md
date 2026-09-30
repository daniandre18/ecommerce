<!--
Sync Impact Report
- Version change: (plantilla sin completar) → 1.0.0
- Principios modificados: ninguno (constitución inicial)
- Secciones añadidas: Propósito; Arquitectura y Capacidades Core (P-I a P-V); Seguridad, Roles y
  Auditoría (P-VI a P-VII); Rendimiento y UX (P-VIII a P-IX); Proceso de Desarrollo (P-X);
  Governance
- Secciones eliminadas: marcadores de plantilla
- TODOs diferidos: ninguno
-->
# Constitución de la Plataforma de Comercio Electrónico Multi-Inquilino

## 1. Propósito del Proyecto

Construir un ecosistema de comercio electrónico SaaS, multi-inquilino y escalable, que democratice
la administración y las ventas digitales. Cada comercio (inquilino) MUST poder abrir, operar y
hacer crecer su tienda con las capacidades de negocio esenciales de las plataformas líderes del
sector, sin fricciones económicas operativas.

El principio económico rector es que **el costo de operar no crece con el tamaño del equipo**:
la plataforma MUST NOT cobrar licenciamiento por colaborador interno. Los inquilinos están
aislados entre sí de forma estricta en datos, configuración y permisos.

Este documento es agnóstico a la tecnología y al país. Frameworks, bases de datos, proveedores de
infraestructura, monedas, impuestos y regulaciones locales se deciden en fases posteriores
(especificación y plan) y MUST NOT ser impuestos por esta constitución.

## 2. Principios de Arquitectura y Capacidades Core

### I. Catálogo Jerárquico con Variantes y Inventario Dinámico

- Un producto MUST poder modelarse con atributos de variación arbitrarios (p. ej. tamaño, color,
  material) cuyas combinaciones generan variantes.
- Cada variante MUST tener su propio SKU, control de existencias e imágenes, independientes de las
  demás variantes del mismo producto.
- Un SKU MUST ser único dentro de un inquilino.
- Los productos sin variaciones MUST tratarse como un producto con una única variante implícita,
  de modo que el resto del sistema opere con un solo modelo.

**Justificación**: la variante es la unidad real de venta y de stock; modelarla desde el núcleo
evita rediseños costosos y hace correcto el inventario.

### II. Sincronización Atómica de Existencias

- El sistema MUST reservar (bloquear) existencias al iniciar el checkout y MUST descontarlas de
  forma definitiva al confirmarse el pago.
- Las reservas no confirmadas MUST liberarse automáticamente tras un tiempo de expiración
  configurable.
- Bajo concurrencia, dos compradores MUST NOT poder adquirir la misma unidad física; la
  existencia disponible nunca puede ser negativa salvo que el inquilino habilite explícitamente
  la venta bajo pedido.
- Cada movimiento de inventario (reserva, liberación, descuento, ajuste, devolución) MUST quedar
  registrado y ser reconstruible.

**Justificación**: la sobreventa destruye la confianza del comprador y genera costos de
reembolso y soporte.

### III. Motor de Descuentos Flexibles

- El motor MUST soportar cupones manuales, descuentos automáticos de carrito (p. ej. por
  volumen), promociones de temporada con vigencia y envíos gratuitos condicionados.
- Las reglas MUST poder combinarse; el orden de aplicación, las reglas de apilamiento y las
  exclusiones MUST ser explícitos, deterministas y documentados.
- El cálculo de precios MUST ser una función pura y reproducible: mismas entradas, mismo
  resultado. El total mostrado al comprador MUST coincidir con el total cobrado.
- Ningún descuento puede llevar un total por debajo de cero ni aplicarse fuera de su vigencia,
  límites de uso o segmento.

**Justificación**: los errores de precio son errores financieros directos y difíciles de revertir.

### IV. Desacoplamiento de Recaudo y Logística

- Las pasarelas de pago y las transportadoras MUST tratarse como servicios lógicos
  intercambiables detrás de contratos estables definidos por el núcleo.
- El núcleo MUST procesar únicamente intenciones de pago, estados de transacción y tokens de
  verificación. El núcleo MUST NOT almacenar ni transitar datos sensibles de instrumentos de pago
  (p. ej. números completos de tarjeta).
- Cambiar de proveedor MUST NOT requerir cambios en las reglas de negocio del núcleo.
- Las notificaciones de proveedores externos MUST ser verificadas en autenticidad y procesadas de
  forma idempotente; un mismo evento repetido MUST NOT duplicar cobros, descuentos de stock ni
  envíos.

**Justificación**: la independencia de proveedores evita el bloqueo comercial y permite adaptar
la plataforma a cualquier mercado.

### V. Analíticas en Tiempo Real

- La plataforma MUST ofrecer indicadores de rendimiento consolidados por inquilino: ventas
  brutas, volumen de órdenes y tasa de conversión, con periodos comparables.
- Cada indicador MUST tener una definición de negocio documentada y única.
- El sistema MUST emitir alertas automáticas cuando el inventario de una variante caiga por
  debajo de un umbral configurable por el inquilino.
- Las analíticas MUST reflejar únicamente datos del inquilino consultante.

**Justificación**: decidir con datos frescos es la mayor ventaja competitiva de un comercio
pequeño.

## 3. Seguridad, Roles y Auditoría de Empleados

### VI. Segmentación Granular de Permisos (RBAC Jerárquico)

- Cada inquilino MUST poder añadir colaboradores internos ilimitados sin cargos adicionales por
  usuario.
- El acceso MUST basarse en roles jerárquicos y en el principio de mínimo privilegio: todo acceso
  se deniega por defecto y se concede explícitamente.
- Los colaboradores solo MAY operar módulos operativos (logística, catálogo, atención de
  pedidos) según su rol.
- Las credenciales secretas financieras (p. ej. llaves de pasarelas de pago), la configuración
  crítica de la organización, la gestión de roles y la facturación de la suscripción MUST
  restringirse exclusivamente al rol de Propietario.
- Los permisos MUST verificarse en el servidor en cada operación; ocultar controles en la
  interfaz NO constituye control de acceso.
- Ninguna identidad de un inquilino MUST poder leer o modificar datos de otro inquilino.

**Justificación**: permitir equipos ilimitados solo es viable si cada persona ve y hace
únicamente lo que necesita.

### VII. Trazabilidad Inmutable

- Toda alteración manual de precios, stock o reembolsos MUST registrarse en una bitácora de
  auditoría con: identificador del empleado responsable, marca de tiempo, entidad afectada,
  valor anterior y valor nuevo.
- La bitácora MUST ser de solo anexado: ningún rol, incluido el Propietario, MUST poder editar o
  eliminar sus entradas.
- Si el registro de auditoría no puede escribirse, la operación auditada MUST fallar.
- Las entradas MUST conservarse por un periodo mínimo definido en la fase de especificación,
  conforme a la regulación aplicable.

**Justificación**: la rendición de cuentas disuade el fraude interno y permite investigar
incidentes.

## 4. Principios de Rendimiento y Experiencia de Usuario

### VIII. Optimización de Carga Percibida

- Toda vista que dependa de datos asíncronos MUST mostrar interfaces esqueleto (skeleton
  screens) o estados de carga que reserven el espacio final del contenido.
- Los cambios de diseño inesperados durante la carga MUST evitarse; las imágenes y bloques
  dinámicos MUST reservar sus dimensiones.
- Todo estado de carga MUST tener su contraparte de error y de vacío, con acción de recuperación.
- Los objetivos numéricos de rendimiento MUST definirse y medirse en cada especificación.

**Justificación**: la velocidad percibida influye directamente en la conversión y en la
retención.

### IX. Enfoque Mobile-First

- El diseño MUST partir de pantallas táctiles pequeñas y escalar hacia pantallas mayores.
- El checkout MUST minimizar pasos y campos, permitir autocompletado, usar tipos de entrada
  apropiados para táctil y conservar el progreso ante interrupciones.
- Los objetivos táctiles MUST ser suficientemente grandes y la interfaz MUST cumplir criterios
  de accesibilidad reconocidos.
- Todo cambio al checkout MUST evaluarse por su efecto en la conversión y no MUST añadir pasos
  sin justificación.

**Justificación**: la mayor parte del comercio digital ocurre en móviles; un embudo largo pierde
ventas.

## 5. Proceso de Desarrollo e Integridad (Convergencia SDD)

### X. Regla de Garantía Automática

- Antes de cualquier integración al entorno de producción MUST ejecutarse y aprobarse una
  batería de pruebas automatizadas que verifique como mínimo:
  1. **Aislamiento de permisos**: cada rol solo accede a lo permitido, los colaboradores no
     acceden a secretos financieros ni a configuración crítica, y ningún inquilino accede a datos
     de otro.
  2. **Motor de precios**: combinaciones, orden y apilamiento de descuentos, envíos gratuitos
     condicionados, redondeo y límites.
- Una prueba fallida MUST bloquear la integración; no se permite omitirlas ni desactivarlas para
  cumplir plazos.
- Todo cambio en permisos o en reglas de precio MUST incluir sus pruebas en el mismo cambio.
- El flujo de trabajo MUST seguir Spec-Driven Development: especificación, plan, tareas e
  implementación, trazables a esta constitución.

**Justificación**: los defectos en seguridad y precios son los de mayor impacto y deben
detectarse antes de llegar a comerciantes y compradores.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica del proyecto. Toda especificación,
  plan y conjunto de tareas MUST ser coherente con ella.
- **Enmiendas**: requieren propuesta documentada con justificación, aprobación de los
  responsables del proyecto y, si afectan trabajo existente, un plan de migración.
- **Versionado semántico**: MAYOR para eliminación o redefinición incompatible de principios;
  MENOR para nuevos principios o ampliación material; PARCHE para aclaraciones y correcciones de
  redacción.
- **Cumplimiento**: toda revisión de cambios MUST verificar el cumplimiento de los principios;
  cualquier excepción o complejidad adicional MUST justificarse por escrito.
- Los términos tecnológicos y de localización quedan fuera de esta constitución y se resuelven en
  las fases de especificación y plan.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
