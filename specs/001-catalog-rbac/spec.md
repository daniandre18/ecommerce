# Feature Specification: Gestión de Catálogo con Control de Acceso por Rol

**Feature Branch**: `001-catalog-rbac`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Gestión de catálogo con control de acceso por rol dentro de un inquilino. Un Propietario abre su comercio, invita colaboradores internos sin límite de cantidad y les asigna roles. Un colaborador con rol de Catálogo puede crear y editar productos, sus variantes, imágenes y descripciones, pero NO puede modificar precios ni ver las credenciales de pasarelas de pago ni la facturación de la suscripción. El Propietario puede todo. Un producto se modela con atributos de variación arbitrarios definidos por el comercio (tamaño, color, capacidad, lo que sea). Cada combinación genera una variante con su propio SKU, existencias e imágenes. Un producto sin variaciones se comporta igual: tiene una única variante implícita. El SKU es único dentro del inquilino. Toda alteración manual de precio o de existencias queda registrada en una bitácora de solo anexado con: quién, cuándo, qué entidad, valor anterior y valor nuevo. Nadie, ni el Propietario, puede editar ni borrar entradas de esa bitácora. Si la bitácora no se puede escribir, la operación falla. Ningún usuario de un inquilino puede leer ni modificar datos de otro inquilino. La interfaz de administración es mobile-first y muestra skeletons mientras carga, con estados de error y de vacío para cada vista. Fuera de alcance en esta feature: carrito, checkout, pagos, envíos, descuentos y analíticas."

## Clarifications

### Sesión 2026-09-30

- **Q: ¿Cuántos roles existen y son fijos o configurables?** → A: el Propietario define **roles
  propios** activando permisos granulares de un catálogo provisto por la plataforma. "Catálogo"
  existe como rol predefinido de plantilla. Restricción derivada de la constitución: los permisos
  sobre credenciales de pago, facturación de la suscripción y administración de roles NO son
  activables en ningún rol personalizado; pertenecen solo al Propietario.
- **Q: ¿Puede una misma cuenta colaborar en varios comercios?** → A: no. Cada cuenta pertenece a
  exactamente un inquilino. Quien trabaje para dos comercios usa una cuenta independiente en cada
  uno.
- **Q: ¿Qué ocurre al cambiar la estructura de variación de un producto que ya tiene variantes con
  datos?** → A: el comercio construye las variaciones de forma incremental (agrega una opción,
  la nombra libremente, agrega sus valores y la tabla de variantes se regenera en pantalla). Al
  agregar una opción a un producto que ya tiene variantes cargadas, esos datos se preservan: se
  pide asignar un valor de la opción nueva a cada variante existente y las combinaciones
  restantes se crean incompletas, sin precio, sin existencias definidas y sin SKU.
- **Q: ¿Puede el Propietario otorgar su rol a otra persona del comercio?** → A: cada comercio tiene
  exactamente un Propietario, transferible dentro del comercio. Por encima existe un **operador de
  la plataforma**, actor externo a todo inquilino, que da de alta comercios y designa su
  Propietario inicial —la capacidad que permitirá abrir más tiendas más adelante— sin acceso
  alguno a los datos de negocio de ningún comercio y con todas sus acciones registradas en la
  bitácora del comercio afectado. Su construcción corresponde a una feature de administración de
  plataforma; aquí solo se declaran sus límites.
- **Q: ¿Qué ocurre con la bitácora cuando un colaborador deja el comercio?** → A: la cuenta se
  desactiva, nunca se elimina. Pierde todo acceso de inmediato y la bitácora la sigue nombrando
  indefinidamente, para sostener la atribución histórica que exige el principio VII.
- **Q: ¿Tiene el producto estados propios?** → A: sí, tres: **activo**, **borrador** y **no
  listado** (accesible solo mediante enlace directo). El estado es independiente del archivado. El
  efecto de cada estado sobre una tienda pública queda fuera del alcance de esta feature; aquí se
  modela el estado para que la tienda futura lo consulte.
- **Q: ¿Cuál es el tope de opciones y de combinaciones por producto?** → A: máximo 5 atributos de
  variación y 100 combinaciones por producto.
- **Q: ¿Qué nivel de accesibilidad debe cumplir el panel?** → A: WCAG 2.2 nivel AA en todas sus
  vistas.

### Sesión 2026-09-30 (revisión de alcance)

- **Q: ¿Una cuenta puede colaborar en varios comercios?** → A: **sí. Esta decisión revierte la
  tomada antes en esta misma fecha.** Una cuenta puede pertenecer a varios comercios, con una
  membresía, un rol y un estado independientes en cada uno. Motivo: exigir una cuenta por comercio
  obligaba a un esquema de identidad multi-inquilino de pago que además no admite autenticación
  por teléfono. El aislamiento no se debilita: se traslada de la cuenta a la membresía, y los
  permisos de una membresía no tienen efecto en otro comercio. Queda sin efecto la obligación de
  ocultar que un contacto ya tiene cuenta en otro inquilino.
- **Q: ¿Qué importes lleva una variante y quién puede verlos?** → A: tres importes distintos —
  precio de venta, precio comparativo y costo de adquisición— con **dos permisos separados**:
  modificar precios, y ver y editar el costo. El costo es el dato que de verdad no se quiere
  exponer: sin su permiso no se ve en absoluto. El rol predefinido de Catálogo no incluye ninguno
  de los dos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El Propietario construye su catálogo con variantes (Priority: P1)

Una persona abre su comercio y necesita cargar lo que vende. Sobre el producto va agregando sus
opciones de variación de a una —"color" con Rojo y Amarillo, después "tamaño" con S y M, o lo que
su negocio use— y a medida que las define ve abajo la tabla de variantes resultante, donde ajusta
precio, existencias e imagen de cada una. Los productos que no varían se cargan igual de rápido,
sin obligar a inventar variaciones. Cuando ajusta un precio o una cantidad, el sistema deja
constancia de ese cambio.

**Why this priority**: Sin catálogo no hay nada que vender, nada que proteger con permisos y nada
que auditar. Es el cimiento del que dependen todas las demás historias y features posteriores.

**Independent Test**: Se prueba por completo con un único Propietario y un único comercio: crear
productos con y sin variaciones, construir opciones de forma incremental, asignar SKU, existencias
e imágenes por variante, y verificar que cada cambio de precio o existencias produce su registro.
Entrega valor por sí sola (un comercio puede tener su catálogo administrable).

**Acceptance Scenarios**:

1. **Given** un comercio recién abierto y sin productos, **When** el Propietario crea un producto
   sin opciones de variación, **Then** el sistema lo registra con una única variante implícita
   que posee SKU, existencias e imágenes propias, y el producto se opera con las mismas acciones
   que cualquier producto con variaciones.
2. **Given** un producto nuevo, **When** el Propietario agrega la opción "color", la nombra
   libremente y le carga los valores Rojo y Amarillo, **Then** la tabla de variantes del producto
   muestra de inmediato una fila por cada valor, cada una con su propia imagen, precio y
   existencias.
3. **Given** el producto anterior con dos variantes, **When** el Propietario agrega una segunda
   opción "tamaño" con los valores S y M, **Then** el sistema le pide asignar un tamaño a cada
   variante existente, conserva intactos el SKU, los importes, las existencias y las imágenes de
   esas variantes, y crea las combinaciones restantes como variantes incompletas sin precio, sin
   existencias definidas y sin SKU.
4. **Given** una variante incompleta recién generada, **When** el Propietario la consulta,
   **Then** el sistema la identifica visiblemente como incompleta y no la considera lista para la
   venta hasta que se le asigne un SKU.
5. **Given** un producto en borrador con al menos una variante incompleta, **When** el Propietario
   intenta pasarlo a activo o a no listado, **Then** el sistema lo impide e indica qué variantes
   lo están bloqueando; una vez completadas, el cambio de estado se aplica.
6. **Given** un producto con variantes generadas, **When** el Propietario asigna existencias e
   imágenes distintas a dos variantes del mismo producto, **Then** cada variante conserva sus
   propios valores sin afectar a la otra.
7. **Given** un producto con 24 combinaciones, **When** el Propietario selecciona varias variantes
   a la vez y les aplica el mismo precio, **Then** el cambio se aplica a todas las seleccionadas y
   cada variante afectada genera su propia entrada de bitácora.
8. **Given** una variante existente con el SKU "ABC-1", **When** el Propietario intenta asignar
   el SKU "ABC-1" a otra variante del mismo comercio, **Then** el sistema rechaza el cambio y
   señala qué variante ocupa ese código.
9. **Given** dos comercios distintos en la plataforma, **When** cada uno asigna el SKU "ABC-1" a
   una de sus variantes, **Then** ambas asignaciones son válidas, porque la unicidad se evalúa
   dentro de cada inquilino.
10. **Given** una variante con precio y existencias registrados, **When** el Propietario modifica
   manualmente el precio desde la tabla de variantes, **Then** el cambio se aplica y queda una
   entrada de bitácora con su identificador, la marca de tiempo, la entidad afectada, el valor
   anterior y el valor nuevo.
11. **Given** un comercio con productos cargados, **When** el Propietario consulta su catálogo,
    **Then** solo ve productos, variantes e imágenes de su propio comercio.

---

### User Story 2 - El Propietario arma su equipo con permisos a medida (Priority: P2)

El comercio crece y el Propietario necesita delegar sin exponer lo sensible. Define los roles que
su operación realmente usa activando permisos de una lista —puede partir del rol predefinido de
Catálogo y ajustarlo— e invita a las personas que necesite, sin tope de cantidad y sin que eso
encarezca su operación. Quien recibe un rol de catálogo trabaja cómodamente en productos,
variantes, imágenes y descripciones, pero los precios quedan fuera de su alcance si el rol no los
incluye. Las credenciales de las pasarelas de pago, la facturación de la suscripción y la propia
administración de roles no son delegables: ningún rol distinto del Propietario puede recibirlas.

**Why this priority**: Es la propuesta de valor diferencial de la plataforma (equipos ilimitados
sin costo por usuario) y la frontera de seguridad que hace seguro delegar. Requiere que exista un
catálogo, por eso va después de la historia 1.

**Independent Test**: Se prueba definiendo roles con distintas combinaciones de permisos sobre un
comercio con catálogo existente y verificando, para cada operación prohibida, que la denegación
ocurre tanto en la interfaz como cuando el intento la evita por completo.

**Acceptance Scenarios**:

1. **Given** un comercio activo, **When** el Propietario invita a 50 colaboradores internos,
   **Then** todos pueden aceptar su invitación y operar, sin tope de cantidad y sin cargo
   adicional por persona.
2. **Given** una invitación enviada y todavía no aceptada, **When** la persona destinataria
   intenta operar el comercio, **Then** no obtiene ningún acceso hasta aceptar la invitación.
3. **Given** el Propietario en la administración de roles, **When** crea un rol propio, **Then**
   el rol nace sin ningún permiso y el Propietario activa uno a uno los que ese rol necesita.
4. **Given** el Propietario creando o editando cualquier rol, **When** busca conceder acceso a las
   credenciales de pasarelas de pago, a la facturación de la suscripción o a la administración de
   colaboradores y roles, **Then** esos permisos no están disponibles para ningún rol distinto del
   de Propietario.
5. **Given** el rol predefinido de Catálogo, **When** el Propietario lo asigna sin modificarlo,
   **Then** ese colaborador puede crear y editar productos, descripciones, imágenes, opciones de
   variación, variantes y existencias, y no puede modificar precios.
6. **Given** un colaborador cuyo rol no incluye el permiso de precios, **When** intenta modificar
   el precio de una variante, **Then** la operación es denegada y no se produce ningún cambio,
   tanto si el intento llega desde la interfaz de administración como si la evita por completo.
7. **Given** un colaborador cuyo rol no incluye un permiso, **When** abre la interfaz, **Then** no
   se le presentan los controles de las operaciones que no puede ejecutar.
8. **Given** un rol propio asignado a 8 colaboradores, **When** el Propietario le retira un
   permiso, **Then** los 8 pierden esa capacidad en su siguiente operación, sin necesidad de
   reasignarlos uno a uno.
9. **Given** un rol con colaboradores asignados, **When** el Propietario intenta eliminarlo,
   **Then** el sistema exige reasignar antes a esos colaboradores.
10. **Given** un colaborador con una sesión activa, **When** el Propietario le revoca el rol,
    **Then** la siguiente operación que intente es denegada.
11. **Given** el Propietario autenticado, **When** accede a cualquier módulo del comercio,
    **Then** puede operarlo sin restricción.
12. **Given** una persona sin ningún rol asignado en el comercio, **When** intenta cualquier
    operación, **Then** el acceso se deniega por defecto.
13. **Given** una persona que ya colabora en el comercio A, **When** el Propietario del comercio B
    la invita usando el mismo dato de contacto, **Then** su cuenta existente suma una membresía
    nueva en el comercio B, con rol y estado propios, y ninguno de los dos comercios ve datos del
    otro ni los permisos de una membresía surten efecto en la otra.
14. **Given** un comercio con su Propietario, **When** este transfiere la propiedad a otra cuenta
    del comercio, **Then** el comercio sigue teniendo exactamente un Propietario, la cuenta
    anterior queda con el rol que se le asignó en el traspaso, y el traspaso queda registrado.
15. **Given** el operador de la plataforma, **When** intenta consultar el catálogo, los precios,
    las credenciales o la facturación de un comercio, **Then** el acceso es denegado; sus únicas
    acciones posibles sobre ese comercio quedan registradas en la bitácora del propio comercio.
16. **Given** un colaborador con el rol predefinido de Catálogo, **When** abre una variante,
    **Then** no ve el costo de adquisición ni puede editarlo, y tampoco puede modificar el precio
    de venta ni el precio comparativo.
17. **Given** un rol propio con el permiso de modificar precios pero sin el de costo, **When** su
    titular abre una variante, **Then** puede editar el precio de venta y el precio comparativo, y
    el costo de adquisición no le resulta visible.

---

### User Story 3 - El Propietario audita cambios de precio y existencias (Priority: P3)

El Propietario detecta que un precio o una cantidad no cuadra y necesita saber qué pasó. Abre la
bitácora del comercio, filtra por producto, persona o fechas, y ve la secuencia completa de
cambios manuales con quién los hizo, cuándo, qué valor había antes y qué valor quedó. Nadie —ni él
mismo— puede alterar ese historial.

**Why this priority**: Cierra el ciclo de rendición de cuentas que hace viable delegar el catálogo
a un equipo grande. El registro se escribe desde la historia 1 (es una obligación
constitucional), pero la consulta e investigación es la porción de valor que se entrega aquí.

**Independent Test**: Se prueba generando cambios de precio y existencias con distintas personas y
verificando que la consulta los muestra de forma completa y atribuible, que ningún rol puede
alterar o borrar entradas, y que una operación cuyo registro no puede escribirse no se aplica.

**Acceptance Scenarios**:

1. **Given** varios cambios de precio y de existencias hechos por distintas personas, **When** el
   Propietario consulta la bitácora filtrando por un producto, **Then** ve cada cambio en orden
   cronológico con responsable, marca de tiempo, entidad afectada, valor anterior y valor nuevo.
2. **Given** una entrada de bitácora existente, **When** el Propietario intenta editarla o
   eliminarla, **Then** la operación es denegada y la entrada permanece intacta.
3. **Given** un intento de cambio de precio o de existencias, **When** falla la escritura de la
   entrada de bitácora, **Then** el cambio no se aplica; y **When** falla la escritura del cambio,
   **Then** no queda entrada de bitácora de ese cambio. En ambos sentidos no quedan efectos
   parciales y la persona recibe un aviso de que la operación no pudo completarse.
4. **Given** un colaborador que ajustó existencias de varias variantes en una sola acción,
   **When** el Propietario consulta la bitácora, **Then** ve una entrada por cada variante
   afectada, todas atribuidas a ese colaborador.
5. **Given** dos comercios con actividad, **When** el Propietario de uno consulta la bitácora,
   **Then** solo ve entradas de su propio comercio.
6. **Given** un Propietario que retiró el permiso de precios a un rol, reasignó a una colaboradora
   y dio de baja a otra, **When** consulta la bitácora filtrando por tipo de evento, **Then** ve
   los tres hechos registrados, cada uno con su responsable, su marca de tiempo, el rol o conjunto
   de permisos anterior y el resultante.

---

### User Story 4 - El equipo opera el catálogo desde el móvil (Priority: P4)

Quien carga productos rara vez está frente a un escritorio: está en la bodega, en el punto de
venta o en la calle. El panel de administración se usa con una mano en una pantalla pequeña, y
mientras los datos llegan muestra la estructura de lo que viene en lugar de dejar la pantalla en
blanco o mover el contenido de golpe. Cuando algo falla o no hay nada que mostrar, la pantalla lo
dice con claridad y ofrece qué hacer.

**Why this priority**: Determina si el catálogo se mantiene actualizado en la práctica. Depende de
que existan las vistas de las historias anteriores, por eso va al final; aun así es verificable y
demostrable por separado.

**Independent Test**: Se prueba recorriendo cada vista del panel en una pantalla táctil pequeña y
con conexión degradada, verificando esqueleto de carga, ausencia de saltos de diseño, estado de
error con reintento y estado de vacío con acción de creación.

**Acceptance Scenarios**:

1. **Given** una vista del panel que depende de datos remotos, **When** la persona la abre,
   **Then** ve de inmediato una interfaz esqueleto que reserva el espacio del contenido final, y
   al llegar los datos el contenido los reemplaza sin desplazar lo que la persona ya estaba
   mirando.
2. **Given** una vista cuyos datos no pudieron obtenerse, **When** la carga falla, **Then** la
   vista muestra un estado de error comprensible con una acción de reintento.
3. **Given** un comercio sin productos, **When** el Propietario abre el catálogo, **Then** ve un
   estado de vacío que explica la situación y ofrece crear el primer producto.
4. **Given** una persona en una pantalla táctil pequeña, **When** recorre los flujos frecuentes de
   catálogo, **Then** puede completarlos sin desplazamiento horizontal y con objetivos táctiles
   alcanzables con una sola mano.
5. **Given** la tabla de variantes de un producto con muchas combinaciones, **When** se consulta
   en una pantalla pequeña, **Then** sigue siendo legible y operable, y permite editar precio y
   existencias sin salir de ella.
6. **Given** un formulario de producto con cambios sin guardar, **When** la conexión se
   interrumpe al guardar, **Then** el trabajo en curso no se pierde de forma silenciosa y la
   persona puede reintentar.

---

### Edge Cases

- **Agregar una opción con existencias cargadas**: resuelto en FR-024 (se preservan los datos
  existentes y las combinaciones nuevas nacen incompletas).
- **Quitar una opción completa de un producto que ya tiene variantes**: el sistema informa cuántas
  variantes se fusionan o se archivan y cuáles conservan SKU antes de confirmar.
- **Renombrar una opción o uno de sus valores**: es un cambio de etiqueta y MUST NOT destruir ni
  regenerar variantes existentes.
- **Retiro de un valor de atributo en uso**: al quitar el valor "Rojo", las variantes que lo usaban
  y tienen existencias no pueden desaparecer silenciosamente; se archivan y se informa el efecto
  antes de confirmar.
- **Explosión combinatoria**: agregar un valor más puede llevar la combinatoria por encima de las
  100 variantes permitidas; el sistema lo advierte y lo impide antes de generarlas, diciendo
  cuántas produciría.
- **Valores duplicados dentro de una misma opción**: se rechazan al cargarlos.
- **SKU de una variante archivada**: el código permanece reservado y no se reutiliza, para no
  ambiguar la bitácora ni referencias futuras.
- **Intento de acceso cruzado entre inquilinos**: una persona del comercio A que solicita un
  recurso del comercio B indicando su identificador exacto recibe una denegación y el intento
  queda registrado como evento de seguridad.
- **El último Propietario**: el sistema impide que un comercio quede sin ningún Propietario
  activo, ya sea por cambio de rol o por baja de la cuenta.
- **Rol modificado o revocado en medio de una edición**: los cambios que el colaborador intente
  guardar después de perder el permiso son rechazados.
- **Reingreso de una persona dada de baja**: reactivar su membresía le devuelve el acceso a ese
  comercio con el rol que se le asigne y conserva íntegro su historial previo en la bitácora.
- **Baja en un comercio con membresías en otros**: desactivar la membresía en el comercio A no
  afecta las membresías de esa cuenta en otros comercios ni su capacidad de autenticarse.
- **Solicitud de eliminación de una membresía con historial**: se rechaza la eliminación
  definitiva y se ofrece la desactivación, porque la atribución de la bitácora es permanente.
- **Rol con colaboradores asignados**: no puede eliminarse sin reasignar primero a esas personas.
- **Edición concurrente**: dos personas editando el mismo producto a la vez; la segunda escritura
  sobre datos desactualizados se rechaza con aviso en lugar de sobrescribir en silencio.
- **Edición masiva parcialmente denegada**: si una selección incluye variantes sobre las que el
  rol no tiene permiso, la acción no se aplica a ninguna y el sistema explica por qué.
- **Invitaciones**: invitación caducada, reenviada, revocada antes de ser aceptada, o dirigida a
  una persona que ya es colaboradora del comercio.
- **Imágenes**: archivo con formato o peso no admitido, y carga interrumpida a mitad de camino.
- **Existencias en cero frente a variante sin existencias definidas**: son estados distintos y se
  presentan de forma distinta.
- **Estado de vacío frente a estado de error**: una vista sin resultados nunca se presenta como si
  hubiera fallado, ni al revés.

## Requirements *(mandatory)*

### Functional Requirements

#### Inquilino y aislamiento

- **FR-001**: El sistema MUST asociar cada producto, atributo de variación, variante, imagen,
  membresía, rol y entrada de bitácora a exactamente un inquilino. La cuenta es la excepción
  deliberada: pertenece a las personas, no a los comercios, y se vincula a cada uno mediante su
  membresía (FR-005).
- **FR-002**: El sistema MUST denegar toda lectura y toda modificación de datos pertenecientes a
  un inquilino distinto al del contexto autenticado, incluso cuando la solicitud indique el
  identificador exacto del recurso ajeno. Esta regla MUST aplicarse también al operador de la
  plataforma (FR-041).
- **FR-003**: El sistema MUST determinar el inquilino a partir de la **membresía activa** del
  contexto autenticado y MUST NOT aceptar el inquilino como dato provisto por el cliente.
- **FR-004**: El sistema MUST registrar como evento de seguridad todo intento de acceso a datos de
  otro inquilino **que atraviese la capa de servicios**. Los intentos rechazados en la capa de
  reglas del almacén de datos quedan explícitamente fuera de este registro de aplicación: esa capa
  evalúa y deniega, pero no puede escribir. Su observación corresponde a los registros de acceso
  de la plataforma, no a la bitácora del comercio.
- **FR-005**: Una cuenta de usuario MUST poder pertenecer a uno o más inquilinos. Cada pertenencia
  MUST materializarse en una membresía propia de ese comercio, con su rol y su estado
  independientes. Los permisos de una membresía MUST NOT tener efecto alguno en otro comercio, y
  pertenecer al comercio A MUST NOT conceder visibilidad alguna sobre el comercio B.

#### Colaboradores, roles y permisos

- **FR-006**: El Propietario MUST poder invitar colaboradores internos sin límite de cantidad y
  sin que ello genere cargo adicional por persona.
- **FR-007**: El sistema MUST requerir que cada invitación sea aceptada por su destinatario antes
  de conceder cualquier acceso, y el Propietario MUST poder reenviar o revocar invitaciones
  pendientes.
- **FR-008**: El Propietario MUST poder asignar, cambiar y revocar el rol de cada colaborador. Un
  cambio de rol, o un cambio en los permisos de un rol, MUST surtir efecto en la siguiente
  operación de cada colaborador afectado, incluso con sesión ya iniciada.
  **Nota para la fase de plan**: este efecto MUST NOT depender de información de permisos embebida
  en el token de sesión, porque los tokens se cachean y pueden quedar desactualizados. Es una
  restricción de implementación, no un requisito de negocio adicional.
- **FR-008a**: Dar de baja a un colaborador MUST desactivar su **membresía en ese comercio** sin
  eliminarla: pierde de inmediato todo acceso a ese comercio, sin que ello afecte sus membresías
  en otros comercios. La membresía se conserva para sostener la atribución histórica de la
  bitácora. El sistema MUST NOT permitir la eliminación definitiva de una membresía con entradas
  de bitácora asociadas, y MUST permitir reactivarla conservando su historial.
- **FR-009**: El sistema MUST denegar el acceso por defecto: una persona sin rol asignado no opera
  ningún módulo, y un rol recién creado MUST nacer sin ningún permiso activo.
- **FR-010**: El sistema MUST verificar los permisos en el servidor en cada operación; ocultar
  controles en la interfaz MUST NOT ser el único mecanismo de control.
- **FR-011**: Cada inquilino MUST tener exactamente un Propietario activo en todo momento. El
  Propietario MUST poder transferir su rol a otra cuenta del comercio, quedando él con el rol que
  se le asigne en el traspaso; el sistema MUST NOT permitir que un comercio quede sin Propietario
  ni que tenga dos.
- **FR-012**: La plataforma MUST definir el catálogo de permisos granulares disponibles; el
  comercio MUST poder activarlos y desactivarlos, y MUST NOT poder inventar permisos nuevos.
- **FR-013**: El Propietario MUST poder crear, nombrar, editar, duplicar y eliminar roles propios
  del comercio, y MUST NOT poder eliminar un rol con colaboradores asignados sin reasignarlos
  antes.
- **FR-014**: Los permisos sobre credenciales de pasarelas de pago, facturación de la suscripción
  y administración de colaboradores, roles y permisos MUST ser exclusivos del rol de Propietario,
  y MUST NOT estar disponibles para su activación en ningún rol personalizado.
- **FR-015**: "Modificar precios" y "ver y editar el costo de adquisición" MUST ser dos permisos
  independientes entre sí e independientes de "editar catálogo". El sistema MUST permitir conceder
  la edición completa del catálogo sin conceder ninguno de los dos, y MUST permitir conceder la
  modificación de precios sin conceder el acceso al costo. Sin el permiso de costo, el importe de
  costo MUST NOT ser visible.
- **FR-016**: El sistema MUST ofrecer un rol predefinido de Catálogo, usable tal cual o como
  plantilla duplicable, que habilite crear y editar productos, descripciones, imágenes, atributos
  de variación, variantes y existencias, **sin** el permiso de modificar precios y **sin** el de
  ver y editar el costo de adquisición. El rol de Propietario MUST habilitar toda operación del
  comercio y MUST NOT ser editable ni eliminable.

#### Catálogo: productos, atributos y variantes

- **FR-017**: El comercio MUST poder definir sus propios atributos de variación —presentados en la
  interfaz como "opciones"— agregándolos de a uno, con nombre libre elegido por el comercio y sin
  depender de un listado predefinido por la plataforma, y MUST poder agregar, reordenar, renombrar
  y quitar sus valores.
- **FR-018**: Al definir o modificar las opciones y sus valores, el sistema MUST derivar y mostrar
  de inmediato la tabla de variantes resultante, y MUST permitir al comercio confirmar qué
  combinaciones existen realmente antes de crearlas.
- **FR-019**: Cada variante MUST tener SKU, existencias e imágenes propias e independientes de las
  demás variantes del mismo producto.
- **FR-020**: Un producto sin atributos de variación MUST comportarse como un producto con una
  única variante implícita, indistinguible para el resto del sistema en cuanto a SKU, existencias
  e imágenes.
- **FR-021**: El sistema MUST rechazar la asignación de un SKU ya utilizado dentro del mismo
  inquilino e informar el conflicto; MUST permitir el mismo SKU en inquilinos distintos.
- **FR-022**: El sistema MUST garantizar que dos variantes del mismo producto no tengan la misma
  combinación de valores de atributos, y MUST rechazar valores duplicados dentro de un mismo
  atributo.
- **FR-023**: El sistema MUST archivar productos y variantes en lugar de eliminarlos
  definitivamente, y MUST mantener reservado el SKU de una variante archivada.
- **FR-023a**: Cada producto MUST tener exactamente uno de estos estados: **activo** (listo para
  ofrecerse a compradores), **borrador** (no visible para compradores) o **no listado** (accesible
  solo mediante enlace directo, sin aparecer en listados ni resultados de búsqueda). El estado
  MUST ser independiente del archivado (FR-023), MUST poder cambiarse en cualquier momento y MUST
  quedar visible en el listado de catálogo. El sistema MUST NOT permitir pasar un producto a
  activo ni a no listado mientras tenga variantes incompletas (FR-024), e indicará cuáles lo
  impiden.
- **FR-024**: Al agregar un atributo de variación a un producto que ya tiene variantes con SKU,
  precio o existencias, el sistema MUST preservar íntegros esos datos: MUST requerir que el
  comercio asigne a cada variante existente un valor del atributo nuevo, y MUST crear las
  combinaciones restantes como variantes incompletas, **sin precio, sin existencias definidas —no
  en cero, que es un estado distinto (FR-029)— y sin SKU**.
  Una variante incompleta MUST identificarse visiblemente como tal y MUST NOT considerarse lista
  para la venta hasta que se le asigne un SKU.
- **FR-025**: Un producto MUST admitir como máximo 5 atributos de variación y 100 combinaciones.
  El sistema MUST impedir agregar un sexto atributo, y MUST advertir e impedir la generación
  cuando la combinatoria resultante supere las 100 variantes, antes de crearlas, indicando cuántas
  produciría.
- **FR-026**: El sistema MUST informar el efecto de retirar un valor o un atributo en uso antes de
  confirmarlo, y MUST archivar (no descartar en silencio) las variantes afectadas que tengan
  existencias. Renombrar un atributo o un valor MUST NOT destruir ni regenerar variantes
  existentes.
- **FR-027**: El sistema MUST rechazar una escritura basada en datos desactualizados cuando dos
  personas editan el mismo producto a la vez, informando el conflicto en lugar de sobrescribir.

#### Precios y existencias

- **FR-028**: Cada variante MUST tener tres importes independientes entre sí: **precio de venta**,
  **precio comparativo** (el valor de referencia que se muestra tachado) y **costo de
  adquisición**. El sistema MUST permitir registrarlos, junto con la cantidad de existencias, de
  forma independiente por variante y editables directamente desde la tabla de variantes del
  producto, y MUST permitir aplicar un mismo valor a varias variantes seleccionadas en una sola
  acción. Todas estas capacidades MUST respetar los permisos del rol de quien las ejecuta,
  incluida la separación entre precios y costo (FR-015).
- **FR-029**: El sistema MUST distinguir el estado "sin existencias definidas" del estado
  "existencias en cero" y presentarlos de forma diferenciada.
- **FR-030**: Toda alteración manual de precio o de existencias y su entrada de bitácora MUST
  aplicarse como una **unidad indivisible**: o quedan ambas, o no queda ninguna. MUST NOT quedar
  una entrada de bitácora sin su cambio correspondiente, ni un cambio sin su entrada. Una acción
  masiva MUST producir una entrada por cada variante afectada, y MUST NOT aplicarse parcialmente
  si el rol carece de permiso sobre alguna de las variantes seleccionadas.

#### Bitácora de auditoría

- **FR-031**: Cada entrada de bitácora MUST registrar estos campos comunes: identificador de la
  persona responsable, marca de tiempo, **tipo de evento**, entidad afectada, valor anterior y
  valor nuevo. La atribución MUST permanecer legible de forma permanente, aunque la membresía
  responsable haya sido desactivada. El sistema MUST contemplar al menos los siguientes tipos, y
  cada uno declara qué representan sus valores:

  | Tipo de evento | Valor anterior | Valor nuevo |
  |---|---|---|
  | Cambio de precio | Importe vigente antes del cambio, o la marca de "sin precio definido" | Importe que queda registrado |
  | Ajuste de existencias | Cantidad anterior, o la marca de "sin existencias definidas" | Cantidad resultante |
  | Cambio de rol o de permisos | Rol asignado, o conjunto de permisos del rol, antes del cambio | Rol o conjunto de permisos resultante |
  | Acción del operador de la plataforma | Estado del comercio antes de la acción | Estado del comercio tras la acción |
- **FR-031a**: El sistema MUST registrar en la bitácora, con el tipo de evento correspondiente:
  toda creación, edición y eliminación de un rol; todo cambio en el conjunto de permisos de un
  rol; toda asignación o revocación de rol sobre una membresía; toda alta y baja de membresía; y
  todo traspaso de propiedad. Estas entradas MUST ser inmutables en los mismos términos que el
  resto (FR-032).
- **FR-032**: La bitácora MUST ser de solo anexado; ningún rol, incluido el Propietario, MUST
  poder editar ni eliminar sus entradas.
- **FR-033**: Si cualquiera de las dos escrituras que FR-030 une no puede completarse, la
  operación entera MUST fallar sin dejar efectos parciales, y la persona MUST recibir un aviso de
  que no se aplicó. Rige en ambas direcciones: un fallo al registrar impide el cambio, y un fallo
  al aplicar el cambio impide que quede su entrada.
- **FR-034**: El Propietario MUST poder consultar la bitácora de su comercio y filtrarla por
  persona responsable, entidad afectada y rango de fechas.
- **FR-035**: El sistema MUST conservar las entradas de bitácora durante el periodo mínimo de
  retención definido para el proyecto, sin permitir su depuración anticipada.

#### Interfaz de administración

- **FR-036**: Toda vista del panel que dependa de datos remotos MUST mostrar una interfaz
  esqueleto que reserve el espacio del contenido final mientras los datos llegan.
- **FR-037**: Toda vista MUST contar con un estado de error comprensible con acción de reintento y
  con un estado de vacío que ofrezca la acción de creación cuando corresponda.
- **FR-038**: La interfaz MUST diseñarse partiendo de pantallas táctiles pequeñas hacia pantallas
  mayores, y los flujos frecuentes de catálogo MUST completarse sin desplazamiento horizontal,
  incluida la tabla de variantes.
- **FR-038a**: La interfaz de administración MUST cumplir WCAG 2.2 nivel AA en todas sus vistas,
  incluidas la operación completa por teclado y el anuncio accesible de los cambios de estado en
  la tabla de variantes con edición en línea.
- **FR-039**: El sistema MUST NOT perder de forma silenciosa el trabajo en curso ante una falla de
  guardado; MUST conservarlo y permitir reintentar.
- **FR-040**: La interfaz MUST NOT presentar controles de operaciones que el rol de la persona no
  puede ejecutar.

#### Operador de la plataforma (actor externo)

- **FR-041**: El sistema MUST tratar al operador de la plataforma como actor externo a todo
  inquilino. Sus únicas capacidades sobre un comercio MUST ser: darlo de alta, designar su
  Propietario inicial y reasignar el Propietario ante una solicitud verificada del comercio. MUST
  NOT poder leer ni modificar productos, atributos, variantes, precios, existencias, imágenes,
  credenciales de pasarelas de pago, facturación ni el contenido de negocio de ningún comercio.
- **FR-042**: Toda acción del operador de la plataforma sobre un comercio MUST registrarse en la
  bitácora de ese comercio, visible para su Propietario y con la misma inmutabilidad que el resto
  de las entradas.

### Key Entities

- **Inquilino (Comercio)**: unidad de aislamiento de la plataforma. Contiene todo el catálogo, el
  equipo, la configuración y la bitácora. Ningún dato cruza su frontera.
- **Cuenta**: la persona que se autentica. Pertenece a uno o más inquilinos, mediante una membresía
  por comercio. No tiene un estado global de acceso: se desactiva **por comercio**, desactivando la
  membresía correspondiente.
- **Permiso**: capacidad atómica definida por la plataforma (por ejemplo "editar productos",
  "ajustar existencias", "modificar precios", "ver y editar el costo"). Un subconjunto está
  reservado al Propietario y no es delegable.
- **Rol**: conjunto nombrado de permisos, definido por el comercio o provisto como plantilla
  predefinida. Propietario es un rol del sistema, único por comercio, no editable ni eliminable.
- **Operador de la plataforma**: actor externo a los inquilinos que da de alta comercios y designa
  su Propietario inicial. No es miembro de ningún comercio y no accede a sus datos de negocio.
- **Membresía**: vínculo entre una cuenta y **un** inquilino, portador del rol asignado en ese
  comercio y de su propio estado (invitada, activa, desactivada). Una cuenta puede tener varias
  membresías, una por comercio (FR-005), y el estado y los permisos de cada una son independientes
  de los de las demás. Nunca se elimina si tiene entradas de bitácora asociadas.
- **Invitación**: propuesta de membresía dirigida a una persona, con estado (pendiente, aceptada,
  caducada, revocada) y rol propuesto.
- **Producto**: agrupación comercial que reúne descripción, imágenes generales y la definición de
  sus atributos de variación. Tiene un estado (activo, borrador o no listado) y una condición de
  archivado, independientes entre sí.
- **Atributo de variación (opción)**: dimensión de variación definida por el comercio (por ejemplo
  color o tamaño), con su conjunto ordenado de valores.
- **Variante**: unidad de venta y de inventario. Corresponde a una combinación de valores de
  atributos (o a la variante implícita única cuando el producto no varía) y posee SKU, precio de
  venta, precio comparativo, costo de adquisición, existencias e imágenes propias, además de un
  estado completa/incompleta.
- **Imagen**: recurso visual asociado a un producto o a una variante.
- **Entrada de bitácora**: hecho registrado e inalterable de una alteración manual de precio o de
  existencias, con responsable, marca de tiempo, entidad afectada, valor anterior y valor nuevo.
- **Evento de seguridad**: registro de un intento de acceso denegado, incluidos los intentos de
  acceso entre inquilinos.

## Success Criteria *(mandatory)*

### Criterios verificables automáticamente

*Son compuertas de despliegue: el principio X exige que su incumplimiento bloquee el paso a
producción.*

- **SC-003**: El 100% de los intentos de un colaborador por ejecutar una operación que su rol no
  habilita son denegados, incluidos los intentos que evitan la interfaz de administración.
- **SC-004**: En el 100% de las configuraciones de rol posibles, los permisos sobre credenciales de
  pago, facturación de la suscripción y administración de roles resultan inaccesibles para
  cualquier rol distinto del de Propietario.
- **SC-005**: El 100% de los intentos de acceso a datos de otro inquilino son denegados, y el 100%
  de los que atraviesan la capa de servicios quedan registrados como evento de seguridad;
  0 filtraciones de datos entre comercios.
- **SC-006**: El 100% de las alteraciones manuales de precio y de existencias tienen su entrada de
  bitácora atribuible a una persona; 0 entradas modificadas o eliminadas por cualquier rol.
- **SC-007**: 0 operaciones de precio o existencias quedan aplicadas sin su entrada de bitácora,
  verificado mediante revisión de consistencia entre cambios y registros.
- **SC-008**: Un comercio incorpora 100 colaboradores sin cargo adicional por persona y sin
  degradación perceptible en la administración del catálogo.
- **SC-009**: En una conexión móvil típica, toda vista del panel presenta estructura visible en
  menos de 1 segundo y contenido útil en menos de 3 segundos, con 0 saltos de diseño perceptibles
  al completarse la carga.
- **SC-010**: En un comercio con 10.000 variantes, el 95% de las búsquedas y navegaciones del
  catálogo devuelven resultados en menos de 1 segundo.
- **SC-012**: El 100% de las vistas del panel cuentan con esqueleto de carga, estado de error con
  reintento y estado de vacío verificados.
- **SC-013**: El 100% de los intentos de leer o modificar datos de negocio de un comercio por parte
  de una identidad **sin membresía activa en él** —incluido el operador de la plataforma— son
  denegados. La verificación de que las acciones del operador quedan visibles en la bitácora del
  comercio (FR-042) corresponde a la feature de administración de plataforma, donde ese actor
  existe; aquí no es construible y por lo tanto no se exige como compuerta.
- **SC-014**: El 100% de las vistas del panel superan una revisión de accesibilidad WCAG 2.2 sin
  incumplimientos de nivel A ni AA.
- **SC-015**: El 100% de los cambios de rol, de permisos de un rol, de asignación o revocación de
  rol, de alta y baja de membresía y de traspaso de propiedad tienen su entrada de bitácora
  atribuible, con el mismo rigor que los cambios de precio y existencias.

### Objetivos de producto

*Miden tiempos y tasas de éxito de personas reales. Se verifican con pruebas de usuario, no de
forma automatizada, y por lo tanto MUST NOT bloquear un despliegue.*

- **SC-001**: Un Propietario nuevo, sin ayuda ni capacitación previa, publica su primer producto
  con variantes en menos de 10 minutos desde su primer ingreso.
- **SC-002**: Un Propietario configura un producto con 3 atributos de variación y 24 combinaciones
  en menos de 5 minutos, incluida la carga de precios y existencias.
- **SC-011**: El 90% de los colaboradores nuevos completan su primera tarea de catálogo (crear o
  editar un producto) en el primer intento y sin asistencia.

## Fuera de Alcance

Esta feature NO incluye, y sus requisitos no deben asumir, las siguientes capacidades:

- Carrito de compras y flujo de checkout
- Procesamiento de pagos y gestión de pasarelas (más allá de que sus credenciales existan como
  recurso protegido e indelegable)
- Envíos, transportadoras y logística
- Descuentos, cupones y promociones
- Analíticas, indicadores de rendimiento y alertas de inventario bajo
- Sincronización atómica de existencias durante el checkout (reservas y liberaciones)
- Tienda pública orientada al comprador y publicación en canales de venta
- Método de autenticación e inicio de sesión
- Administración de la plataforma: alta de comercios, panel del operador y su flujo de
  designación de Propietarios. Esta feature solo declara los límites de ese actor (FR-041,
  FR-042); su construcción corresponde a una feature aparte
- Importación y exportación masiva de catálogo desde archivos o sistemas externos
- Localización: monedas, impuestos, formatos regionales y regulación por país

## Assumptions

- Un rol que habilita la edición del catálogo puede **ver** el precio de venta y el precio
  comparativo en modo solo lectura, porque son contexto necesario para trabajar; la restricción
  recae sobre modificarlos. El costo de adquisición es distinto: sin su permiso no se ve en
  absoluto (FR-015).
- El rol predefinido de Catálogo incluye el ajuste de existencias, dado que la descripción enumera
  de forma exhaustiva lo prohibido (precios, credenciales de pago y facturación) y todo ajuste de
  existencias queda atribuido en la bitácora.
- La autenticación de cuentas ya existe o se resuelve con un mecanismo estándar de la plataforma.
  Esta feature especifica **autorización**, no el método de autenticación.
- Las invitaciones se envían a una dirección de contacto de la persona, caducan si no se aceptan
  dentro de un plazo, y pueden reenviarse o revocarse.
- Los productos y variantes se archivan en lugar de eliminarse definitivamente, para no romper la
  bitácora ni referencias futuras (órdenes, movimientos de inventario).
- El plazo de caducidad de invitaciones y el catálogo concreto de permisos granulares se definen en
  la fase de plan. Los topes de variación (5 atributos, 100 combinaciones) ya están fijados en
  FR-025 y son límites de producto, no de implementación.
- El periodo mínimo de retención de la bitácora se define en la fase de plan conforme a la
  regulación aplicable al inquilino.
- La atribución permanente de la bitácora puede entrar en tensión con solicitudes de supresión de
  datos personales. Esta especificación prioriza la trazabilidad; el tratamiento de esas
  solicitudes se resuelve en la fase de plan conforme al marco legal aplicable, sin alterar ni
  eliminar entradas de bitácora.
- La edición concurrente se resuelve detectando el conflicto y rechazando la escritura
  desactualizada, no fusionando cambios automáticamente.
- Las imágenes se cargan desde el panel de administración; su procesamiento y entrega se
  consideran un servicio de plataforma, fuera del alcance de esta especificación.
- La moneda, los impuestos y el formato de presentación de importes corresponden a la
  localización y quedan fuera de esta especificación.
- Todo importe se almacena como número entero en la unidad mínima de la moneda, con la moneda
  definida a nivel de inquilino. Esto no es localización: es evitar aritmética de punto flotante
  sobre dinero. La presentación y la conversión entre monedas siguen fuera de alcance.
- SC-010 (10.000 variantes con búsqueda en menos de un segundo) probablemente exija un motor de
  búsqueda dedicado además del almacén principal, con su propio costo y su sincronización. La
  elección corresponde a la fase de plan.
- El sistema opera en un contexto multi-inquilino desde el primer despliegue, por lo que el
  aislamiento entre inquilinos no es una capacidad diferible a una fase posterior.
- El modelo de interacción del editor de variaciones (opciones agregadas de a una, con nombre y
  valores libres, y tabla de variantes que se regenera debajo con precio, existencias e imagen por
  fila) fue definido a partir de una referencia visual aportada por el negocio. La especificación
  fija el comportamiento esperado, no su diseño visual concreto.

## Alineación con la Constitución

| Principio | Cobertura en esta especificación |
|---|---|
| I. Catálogo jerárquico con variantes | FR-017 a FR-027; Historia 1 |
| II. Sincronización atómica de existencias | Parcial: FR-028 a FR-030 cubren el registro manual de existencias. Las reservas de checkout quedan fuera de alcance |
| III. Motor de descuentos flexibles | Fuera de alcance |
| IV. Desacoplamiento de recaudo y logística | Fuera de alcance, salvo FR-014 que protege las credenciales de pasarelas |
| V. Analíticas en tiempo real | Fuera de alcance |
| VI. RBAC jerárquico y mínimo privilegio | FR-001 a FR-016 y FR-041 a FR-042; Historia 2. FR-014 implementa la reserva constitucional de permisos financieros al Propietario, incluso con roles personalizados. FR-015 separa precios y costo en dos permisos independientes. FR-005 traslada el aislamiento de la cuenta a la membresía, sin debilitarlo. FR-041 impide que el operador de la plataforma se convierta en una excepción al aislamiento entre inquilinos |
| VII. Trazabilidad inmutable | FR-030 a FR-035, incluidos el tipo de evento de FR-031 y la cobertura de cambios de rol, permisos, membresía y propiedad de FR-031a; Historia 3. FR-030 y FR-033 fijan la atomicidad en ambos sentidos |
| VIII. Optimización de carga percibida | FR-036, FR-037, FR-039; SC-009, SC-012 |
| IX. Enfoque mobile-first | FR-038, FR-038a; Historia 4 |
| X. Regla de garantía automática | Los criterios bajo *Criterios verificables automáticamente* son las compuertas exigibles antes de producción. Los *Objetivos de producto* (SC-001, SC-002, SC-011) se verifican con pruebas de usuario y no bloquean el despliegue |
