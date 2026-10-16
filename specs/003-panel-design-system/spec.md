# Feature Specification: Sistema de Diseño del Panel

**Feature Branch**: `feat/003-panel-design-system` (por crear; la especificación no crea ramas)

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Sistema de diseño del panel. Hoy la interfaz se ve plana: usa Material con sus valores por defecto, sin jerarquía visual propia. El objetivo es que el panel tenga identidad y profundidad sin perder ninguna de las garantías que ya cumple. Toma como referencia visual el template que está en ~/Documents/github/angular-admin (Flatlogic Angular Material Admin Full, MIT). NO copies su código: está en Angular 21 con NgModule y arrastra una capa de compatibilidad del theming viejo de Material, mientras nosotros estamos en 22 con componentes standalone. Lo que se extrae son sus DECISIONES de diseño, que viven en src/app/styles/: paleta y sus variantes, escala tipográfica, escala de espaciado, elevación, radios, densidad, y el tratamiento de cada componente de Material (tabla, tarjeta, campo de formulario, paginador, pestañas, barra de herramientas). Reexprésalas como tokens propios sobre Material 22. El sistema define: paleta con un color primario y un acento distinto reservado para la acción principal de cada pantalla; tres planos de superficie (fondo de página, tarjeta, barra) que se distingan entre sí; escala tipográfica con jerarquía real, no solo tamaños; escala de espaciado con ritmo; elevación y bordes; y los estados de cada componente: reposo, hover, foco, activo, deshabilitado, cargando, error y vacío. Criterios verificables: ningún color, tamaño de fuente, espaciado ni radio escrito a mano en los componentes, verificable con una regla de lint; todo par de color texto/fondo cumple WCAG 2.2 AA con sus razones declaradas y probadas; se mantienen sin aflojar ninguna prueba 360 px sin desborde, zonas táctiles de 44 px, cero saltos de diseño y los topes de carga de SC-008 y SC-009; el bundle inicial no crece más de lo que el presupuesto admite, medido con bundle-check; el panel usa usted o tuteo neutro, nada de voseo, en toda la app. Fuera de alcance: cambiar la estructura de ninguna pantalla, agregar o quitar funcionalidad, gráficos y tableros, y la tienda pública."

**Depende de**: `001-catalog-rbac` (el panel y sus garantías: FR-038, SC-008, SC-009, SC-012, SC-014)
y `002-storefront-catalog` (las vistas que agregó). Esta feature cambia cómo se ve y cómo se lee el
panel; no cambia qué hace ni cómo está organizada ninguna pantalla.

## Clarifications

### Sesión 2026-10-07

- **Q: ¿Usted o tuteo neutro?** → A: **tuteo neutro**, en todo el panel. Sigue al panel de
  administración de referencia, que usa tuteo en todo su panel y opera en el mismo mercado (ver
  Assumptions).
- **Q: ¿Cuánto puede crecer la carga inicial?** → A: **0 bytes de JavaScript** y **hasta 10 KB
  comprimidos de estilos**, respecto de la rama base. Si hiciera falta JavaScript en el arranque, se
  revisa el enfoque antes de ampliar el presupuesto (FR-034).
- **Q: ¿Basta con detectar el voseo para garantizar el tuteo?** → A: no. Se agrega una segunda
  compuerta con una lista cerrada de imperativos de usted y excepciones justificadas para los falsos
  positivos (FR-039). Su cobertura es parcial y la spec dice por qué.
- **Q: ¿El esquema oscuro está dentro del alcance?** → A: se separan dos cosas. Los **dos esquemas
  del sistema**, con sus contrastes verificados, están **dentro** (FR-002). El **interruptor** para
  que la persona elija esquema queda **fuera**: la spec nunca lo incluyó y ahora lo excluye de forma
  explícita (Fuera de Alcance).

### Sesión 2026-10-10

- **Q: ¿Las e2e pasan a ser compuerta en CI?** → A: **sí, la suite completa, como primera tarea de
  la feature y antes de tocar ningún token** (FR-033a). Esta feature cambia el estilo de todas las
  vistas a la vez, y el 50 % de sus criterios automáticos (SC-003 a SC-006) se verifica solo en las
  e2e. Es la primera vez que el riesgo más probable, una regresión visual en alguna vista, cae justo
  donde no hay compuerta. Diez minutos por PR cuestan menos que descubrirlo en producción, y la
  inversión queda para las features siguientes. Se descarta llevar solo las e2e de esta feature: las
  vistas que cambian de estilo son todas, una selección parcial deja fuera regresiones que esta
  feature puede causar, y después nadie recuerda que era parcial. Las pruebas de **rendimiento**
  siguen en local: en máquinas compartidas dan ruido, y un umbral que falla al azar enseña a
  ignorar la compuerta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El panel tiene jerarquía visual: se sabe dónde mirar y qué tocar (Priority: P1)

Quien opera el panel —Propietario o colaborador— entra a cualquier vista y distingue sin esfuerzo
tres planos: el fondo de la página, las tarjetas donde vive el contenido y la barra superior. El
título de la página se reconoce como tal, los títulos de sección se distinguen del texto corriente,
y la acción principal de la pantalla —la que completa su tarea: guardar el producto, crear la
categoría, invitar al colaborador— es la única que lleva el color de acento. Todo lo demás es
secundario y se ve secundario.

**Why this priority**: es el problema que origina la feature. Una interfaz plana obliga a leer todo
para encontrar lo importante; con jerarquía, la vista se entiende de un vistazo. Por sí sola, esta
historia ya entrega el valor central: identidad y profundidad.

**Independent Test**: se recorre cada vista del panel en escritorio y a 360 px y se verifica que los
tres planos tienen tonos distintos y que la tarjeta se separa del fondo por borde o elevación; que
hay como máximo un elemento con el color de acento por pantalla, y que es la acción principal; y que
cada nivel tipográfico se diferencia del contiguo en más de un atributo.

**Acceptance Scenarios**:

1. **Given** el editor de un producto, que no tiene acción principal (cada sección se guarda por
   separado y ninguna completa por sí sola la tarea de la pantalla), **When** se abre, **Then** el
   fondo de la página, las tarjetas de sus secciones y la barra superior se ven como tres planos
   distintos, ningún control lleva el color de acento, y los botones que guardan cada sección se ven
   todos iguales.
2. **Given** el listado de productos visto por un colaborador sin permiso para crear productos,
   **When** se abre, **Then** ningún control lleva el color de acento: sin acción principal
   disponible, el acento no se usa como decoración.
3. **Given** cualquier vista con título de página, títulos de sección y texto corriente, **When** se
   compara cada nivel con el siguiente, **Then** se diferencian en al menos dos de estos atributos:
   tamaño, peso, tono y espaciado.
4. **Given** un diálogo abierto sobre una vista, **When** se muestra, **Then** se lee como un plano
   por encima de la vista, y su acción principal es la única con acento dentro del diálogo.

---

### User Story 2 - Cada control comunica su estado de forma clara y accesible (Priority: P1)

Al usar el panel con mouse, con el dedo o con teclado, cada control muestra en qué estado está:
en reposo, bajo el puntero, con el foco, activado, deshabilitado, cargando, con error o vacío. Los
estados son los mismos en todo el panel, se distinguen sin depender solo del color, y todo texto se
lee con el contraste que exige WCAG 2.2 AA sobre cualquiera de los tres planos.

**Why this priority**: la nueva identidad no puede costar accesibilidad. El panel ya supera una
revisión WCAG 2.2 AA (SC-014 de la 001); un sistema de diseño que la rompa sería una regresión, no
una mejora. Comparte prioridad con la historia 1 porque sin estados definidos la jerarquía queda a
medio hacer.

**Independent Test**: se recorre con teclado y con puntero cada tipo de control del panel —botón,
campo de formulario, tabla, paginador, pestañas, chips— y se verifica cada estado; una prueba
automática calcula la razón de contraste de cada par de color texto/fondo declarado y la compara con
el umbral y con la razón declarada.

**Acceptance Scenarios**:

1. **Given** cualquier control interactivo, **When** recibe el foco con el teclado, **Then** muestra
   un indicador con contraste de al menos 3:1 frente a los colores contiguos, sobre cualquiera de los
   tres planos.
2. **Given** un campo de formulario con un valor inválido, **When** se muestra el error, **Then** se
   identifica por un texto y un ícono además del color, y ese texto cumple 4,5:1.
3. **Given** un control deshabilitado, **When** se muestra junto a uno en reposo, **Then** se
   distinguen por algo más que el color, y el deshabilitado no responde al toque ni al teclado.
4. **Given** una vista que carga datos, **When** pasa de esqueleto a contenido, **Then** el esqueleto
   usa los mismos planos, radios y espaciado que el contenido final y nada se desplaza.
5. **Given** el catálogo de pares de color del sistema, **When** corre la prueba de contraste,
   **Then** el 100% de los pares cumple AA y cada razón calculada coincide con la declarada.

---

### User Story 3 - El panel le habla al comercio en el español de su mercado (Priority: P2)

Quien usa el panel lo lee en un registro natural para Colombia. Hoy aparecen formas rioplatenses
—"Revisá tu red", "¿No tenés cuenta? Creá una", "Elegí", "Escribí", "Pegá"— en autenticación, en el
catálogo, en el equipo y en los mensajes de error. Después de esta feature, todo el panel usa un
único tratamiento: **tuteo neutro** ("Revisa", "Elige", "¿No tienes cuenta?").

**Why this priority**: es independiente de la parte visual y de bajo riesgo, pero el registro es
parte de la identidad: un comercio colombiano percibe el voseo como un producto que no fue hecho
para él.

**Independent Test**: una verificación automática recorre todos los textos que el panel muestra
—incluidos nombres accesibles, ayudas, marcadores de posición y mensajes de error— y falla ante
cualquier forma de voseo o ante un imperativo de usted de la lista cerrada de FR-039; una revisión
manual de cada vista cubre el usted que esa lista no alcanza.

**Acceptance Scenarios**:

1. **Given** la pantalla de inicio de sesión sin conexión, **When** falla el ingreso, **Then** el
   mensaje dice "Revisa tu conexión" o equivalente en tuteo neutro, no "Revisá tu red".
2. **Given** la pantalla de inicio de sesión, **When** se muestra el enlace al registro, **Then** dice
   "¿No tienes cuenta? Crea una", no "¿No tenés cuenta? Creá una".
3. **Given** un error que llega del servidor y se muestra en el panel, **When** se lee, **Then** usa
   tuteo neutro, como el resto del panel.
4. **Given** un lector de pantalla, **When** recorre cualquier vista, **Then** los nombres accesibles
   y las descripciones también usan tuteo neutro.

---

### User Story 4 - La identidad visual se mantiene desde un solo lugar (Priority: P3)

Quien desarrolla el panel cambia un color, un tamaño de texto o un espaciado en un único catálogo de
tokens, y el cambio llega a todas las vistas. Ninguna vista ni componente escribe a mano un color,
un tamaño de fuente, un espaciado o un radio: si alguien lo intenta, la revisión automática del
código lo rechaza antes de integrarse.

**Why this priority**: es lo que hace que la identidad dure. Sin esta garantía, cada pantalla nueva
vuelve a inventar sus valores y en pocos meses el panel recupera la incoherencia de hoy. Va después
de las historias visibles porque su valor es a mediano plazo.

**Independent Test**: se agrega a una vista un color, un tamaño de fuente, un espaciado y un radio
escritos a mano y se verifica que la revisión automática rechaza los cuatro; se cambia el valor de
un token y se verifica que el cambio se refleja en todas las vistas que lo usan.

**Acceptance Scenarios**:

1. **Given** un componente con un color escrito a mano, **When** corre la revisión automática,
   **Then** falla e indica el archivo, la línea y el token que corresponde usar.
2. **Given** un valor que figura en la lista de excepciones declaradas (p. ej. `0` o `100%`), **When**
   corre la revisión, **Then** lo acepta.
3. **Given** el token del color primario, **When** se cambia su valor, **Then** todas las vistas
   reflejan el cambio sin tocar ningún componente, y la prueba de contraste vuelve a verificar los
   pares que lo usan.

---

### Edge Cases

- **Valores de la referencia que no cumplen AA**: el azul primario de la referencia sobre blanco da
  4,21:1, el rosa con texto blanco 3,33:1 y el acento amarillo con texto blanco 1,6:1, todos por
  debajo de 4,5:1 para texto normal (el amarillo con texto gris oscuro sí cumple: 5,54:1). Se conserva
  la decisión —el tono y el papel de cada color— y se ajusta el valor hasta cumplir AA. Ningún par
  del sistema se admite por debajo del umbral porque así esté en la referencia.
- **Pantalla sin acción principal disponible** (p. ej. un colaborador sin permiso de crear): no se
  muestra ningún acento. El acento no se reasigna a una acción secundaria.
- **Pantalla con dos acciones candidatas** (p. ej. "Guardar" y "Publicar"): una sola lleva el acento;
  la otra se trata como secundaria. Cuál es la principal lo decide la tarea de la pantalla, no el
  orden en que aparecen.
- **Diálogos y menús superpuestos**: cada diálogo es su propia pantalla a efectos del acento; la vista
  de fondo no cuenta mientras el diálogo está abierto.
- **Dispositivos táctiles sin hover**: ningún dato ni acción depende del estado hover; el hover solo
  refuerza lo que ya se ve en reposo.
- **Deshabilitado**: WCAG exime del contraste a los controles deshabilitados, pero deben distinguirse
  del reposo por algo más que el color y no confundirse con un error.
- **Modo de colores forzados del sistema operativo** (alto contraste): bordes, foco y separación
  entre planos siguen siendo visibles; ningún límite de control depende solo de una sombra o de un
  color de fondo.
- **Esquema oscuro**: el sistema define los dos esquemas (FR-002) y el panel sigue la preferencia
  clara u oscura del sistema operativo, como hoy. Un token que funciona en un esquema y falla en el
  otro —un gris que pasa sobre blanco y no sobre el fondo oscuro, una sombra que no separa nada
  sobre negro— es un supuesto escondido que esta feature tiene que encontrar, no dejar para después.
- **Texto ampliado** al 200% o tamaño de letra mayor en el sistema: a 360 px no aparece
  desplazamiento horizontal y ningún texto queda cortado sin forma de leerlo.
- **Densidad**: ningún ajuste de densidad del sistema lleva una zona táctil por debajo de 44 px ni
  cambia el alto de una fila respecto de su esqueleto.
- **Esqueletos**: al cambiar radios, espaciado o tipografía, los esqueletos cambian con ellos; un
  esqueleto que no coincide con su contenido final produce un salto de diseño y falla las pruebas
  vigentes.
- **Textos que vienen del servidor o de componentes de terceros** (mensajes de error, etiquetas del
  paginador): también usan tuteo neutro. Los textos que escribe el comercio —nombres de
  productos, categorías— no se tocan.
- **Pruebas que verifican textos con voseo**: se actualiza el texto esperado. Cambiar el texto que una
  prueba espera no es aflojarla, siempre que siga verificando lo mismo.
- **Movimiento reducido**: las transiciones de estado respetan la preferencia de movimiento reducido,
  como hoy.

## Requirements *(mandatory)*

### Functional Requirements

#### Catálogo de tokens

- **FR-001**: El sistema MUST tener un único catálogo de tokens de diseño que cubra color, tipografía,
  espaciado, radios, elevación, bordes y densidad. Es la única fuente de esos valores para todo el
  panel.
- **FR-002**: El sistema MUST definir dos esquemas, claro y oscuro, con un valor por esquema para
  cada token de color y de elevación, y los dos MUST pasar las mismas verificaciones de contraste
  (FR-031) y de planos (SC-005). Está dentro del alcance porque es lo que prueba que los tokens son
  papeles y no valores con otro nombre: un sistema definido contra un solo esquema esconde supuestos
  que solo aparecen al intentar el segundo. El esquema que se aplica es el que prefiere el sistema
  operativo, como hoy, sin código en el arranque (FR-034).
- **FR-003**: Los tokens que consumen las vistas y los componentes MUST nombrarse por su papel (p. ej.
  "superficie de tarjeta", "texto secundario", "acento de acción principal"), no por su valor ni por
  su tono. Los valores de la paleta solo se usan dentro del catálogo para definir esos papeles.
- **FR-004**: Ninguna vista ni componente del panel MUST escribir a mano un color, un tamaño de
  fuente, un espaciado, un radio, una elevación o un ancho de borde. Los únicos valores literales
  admitidos son los de una lista de excepciones declarada en un solo lugar, con la razón de cada una
  (p. ej. `0`, `auto`, `100%`, `currentColor`).
- **FR-005**: Una revisión automática del código MUST rechazar cualquier valor que incumpla FR-004,
  indicando archivo, línea y token sugerido, y su fallo MUST bloquear la integración. Cubre los
  estilos de los componentes estén donde estén escritos: en archivos de estilo propios o junto al
  componente.
- **FR-006**: Las decisiones de diseño MUST tomarse de la referencia (`~/Documents/github/angular-admin`,
  `src/app/styles/`) y reexpresarse como tokens propios sobre la versión actual de la biblioteca de
  componentes. MUST NOT incorporarse código de la referencia ni su capa de compatibilidad con el
  sistema de temas anterior.

#### Paleta

- **FR-007**: La paleta MUST definir un color primario, que da la identidad (barra, selección, enlaces,
  indicadores activos), y un color de acento distinto, reservado para la acción principal.
- **FR-008**: El acento señala la acción principal de una pantalla; una pantalla sin acción
  principal no lleva acento. Cada pantalla —una vista o un diálogo— MUST tener como máximo un
  elemento con el color de acento, y ese elemento MUST ser su acción principal. El acento MUST NOT
  usarse como decoración ni en acciones secundarias. Si una pantalla tiene acción principal se decide
  por su tarea, no por cuántos botones muestra: si la pantalla cambia, se vuelve a preguntar si alguna
  acción completa esa tarea.
- **FR-009**: La paleta MUST definir colores con significado para error, aviso, éxito e información,
  cada uno con sus pares de texto y fondo, para estados de los controles y para indicadores como el
  estado de un producto.
- **FR-009a**: Entre las acciones, el color de error MUST reservarse para las destructivas: archivar,
  eliminar, dar de baja, traspasar la propiedad, descartar cambios. Un botón en ese color MUST NOT
  usarse para nada más, y en un botón el color de error nunca indica una validación fallida. La
  acción destructiva tiene su propio papel en el catálogo, distinto del error de validación (FR-024),
  aunque compartan tono.

#### Planos de superficie, elevación y bordes

- **FR-010**: El sistema MUST definir tres planos —fondo de página, tarjeta y barra— con tonos
  distintos entre sí. La tarjeta MUST separarse del fondo, además, por borde o por elevación. La
  barra existe solo dentro del marco del comercio. Las vistas fuera de él no la agregan (FR-032).
- **FR-011**: La elevación MUST ser una escala corta con un uso asignado a cada nivel: plano, tarjeta,
  barra y superpuesto (menús, diálogos). Un elemento MUST NOT usar un nivel distinto del que le
  corresponde a su papel.
- **FR-012**: Los radios y los anchos de borde MUST ser escalas cortas, con el uso de cada paso
  declarado.
- **FR-013**: Todo límite que separe un control o un plano MUST seguir visible en el modo de colores
  forzados; ninguno MUST depender solo de una sombra o de un color de fondo.

#### Tipografía

- **FR-014**: La escala tipográfica MUST definir niveles con papel propio, al menos: título de página,
  título de sección, subtítulo, cuerpo, etiqueta y texto de ayuda.
- **FR-015**: Cada nivel MUST diferenciarse del contiguo en al menos dos atributos entre tamaño, peso,
  tono y espaciado entre letras o líneas. Un nivel que solo cambie el tamaño no cumple.
- **FR-016**: Cada vista MUST tener un único título de página, y el orden visual de los niveles MUST
  coincidir con el orden de los encabezados para lectores de pantalla.
- **FR-017**: La tipografía MUST NOT agregar descargas a la carga inicial del panel.

#### Espaciado y densidad

- **FR-018**: El espaciado MUST salir de una escala con unidad base y progresión declaradas. Todo
  margen, relleno o separación entre elementos MUST ser un paso de esa escala.
- **FR-019**: La separación entre elementos relacionados MUST ser menor que la separación entre
  grupos distintos dentro de la misma vista.
- **FR-020**: Ningún ajuste de densidad MUST llevar una zona táctil por debajo de 44 × 44 px ni
  cambiar el alto de un elemento respecto del esqueleto que lo reserva.

#### Tratamiento de componentes y estados

- **FR-021**: El sistema MUST definir un tratamiento propio, derivado de la referencia, para cada
  componente y patrón que usa el panel: al menos tarjeta, tabla y barra (hoy son marcado propio, no
  componentes de la biblioteca), campo de formulario, botón, chip, diálogo y menú.
- **FR-021a**: Paginador y pestañas, que ninguna vista usa, MUST quedar definidos —qué token usa cada
  estado— sin emitir estilos. Un estilo de un componente que ninguna vista usa no lo verifica ninguna
  prueba, y envejece sin que nadie lo note. Una vista que adopte uno de los dos MUST incluir su
  tratamiento y su cobertura de pruebas en el mismo cambio, y una verificación automática MUST
  fallar si el componente se usa sin su tratamiento.
- **FR-022**: Cada componente interactivo MUST definir los estados que le apliquen entre reposo,
  hover, foco, activo, deshabilitado, cargando, error y vacío, con los mismos tokens en todo el panel.
- **FR-023**: El foco con teclado MUST ser siempre visible, con un indicador de contraste de al menos
  3:1 frente a los colores contiguos sobre cualquiera de los tres planos, y MUST NOT quedar oculto
  por otros elementos (WCAG 2.4.7, 2.4.11 y 1.4.11).
- **FR-024**: El error MUST comunicarse con texto y con un ícono además del color (WCAG 1.4.1).
- **FR-025**: El deshabilitado MUST distinguirse del reposo por algo más que el color, y MUST NOT
  confundirse visualmente con el error.
- **FR-026**: Ninguna información ni acción MUST depender del estado hover.
- **FR-027**: Los estados de carga, error y vacío que ya exige la 001 (SC-012) MUST usar los tokens del
  sistema, y los esqueletos MUST conservar las dimensiones del contenido final.
- **FR-028**: Las transiciones entre estados MUST respetar la preferencia de movimiento reducido.

#### Contraste

- **FR-029**: Todo par de color texto/fondo del sistema, en cada estado, cada plano y cada esquema,
  MUST declararse en el catálogo con su razón de contraste.
- **FR-030**: Cada par MUST cumplir WCAG 2.2 AA: 4,5:1 para texto normal, 3:1 para texto grande y
  3:1 para componentes de interfaz y elementos gráficos que se necesitan para entenderla.
- **FR-031**: Una prueba automática MUST calcular la razón de cada par a partir de los valores reales
  de los tokens y fallar si alguno queda bajo su umbral o si la razón calculada difiere de la
  declarada. Su fallo MUST bloquear la integración.

#### Garantías vigentes

- **FR-032**: Esta feature MUST NOT cambiar la estructura de ninguna pantalla —qué contiene, en qué
  orden, cómo se navega— ni agregar o quitar funcionalidad.
- **FR-033**: Todas las pruebas vigentes de diseño móvil, zonas táctiles, saltos de diseño, carga
  percibida y accesibilidad MUST seguir pasando con los mismos umbrales. Ninguna MUST eliminarse,
  omitirse ni aflojarse; actualizar el texto que una prueba espera por el cambio de tratamiento
  (FR-037) no cuenta como aflojarla.

- **FR-033a**: La suite completa de pruebas de extremo a extremo del panel MUST correr en la
  integración continua y su fallo MUST bloquear la integración. Su primera corrida en verde MUST
  ocurrir **antes** de aplicar ningún token: esa corrida fija la línea base, y cualquier fallo
  posterior es atribuible al rediseño. Las pruebas de rendimiento (estructura visible, contenido útil
  y catálogo con 100 colaboradores) quedan fuera de esta compuerta y siguen corriéndose antes de
  integrar, porque en máquinas compartidas sus tiempos dan ruido y no señal.

#### Tamaño de la carga inicial

- **FR-034**: Respecto de la rama base, la carga inicial del panel MUST crecer **0 bytes de
  JavaScript** y **como máximo 10 KB comprimidos de estilos**. Un sistema de diseño es tokens y
  estilos: no necesita código para arrancar. Si la implementación necesita JavaScript en el arranque
  para aplicar el sistema, el enfoque MUST revisarse antes de proponer ampliar el presupuesto:
  necesitar código al arranque es señal de que el enfoque se desvió, no de que el presupuesto se
  quedó corto. Una ampliación solo se admite con esa revisión documentada y aprobada.
- **FR-035**: La verificación automática del build de producción MUST medir por separado el
  JavaScript y los estilos de la carga inicial, compararlos con la rama base y bloquear la
  integración si alguno excede FR-034. Hoy esa verificación solo controla la frontera de capas, no
  el tamaño.
- **FR-036**: El tope vigente de estilos por componente MUST mantenerse.

#### Lenguaje

- **FR-037**: Todo texto que el panel muestra MUST usar tuteo neutro y MUST NOT contener voseo ni
  usted. Incluye textos visibles, nombres accesibles, ayudas,
  marcadores de posición, mensajes de error —también los que llegan del servidor— y las etiquetas de
  los componentes de terceros que el panel muestra.
- **FR-038**: Una verificación automática MUST recorrer los textos del panel y fallar ante formas de
  voseo (p. ej. imperativos agudos como "revisá", "elegí", "escribí" y presentes como "tenés",
  "querés", "podés"). Su fallo MUST bloquear la integración.
- **FR-039**: Una segunda verificación automática MUST fallar ante los imperativos de usted de una
  lista cerrada, la de los que de verdad aparecen en una interfaz: revise, cree, ingrese, agregue,
  edite, guarde, elimine, defina, elija, seleccione, busque, confirme y cancele. Los falsos positivos
  se admiten solo desde una lista de excepciones declarada en un solo lugar, cada una con su texto
  exacto y su razón; el caso típico es el subjuntivo en tercera persona ("hasta que el servidor
  confirme", "lo que la persona elija"), que es correcto en tuteo neutro. Las dos verificaciones
  recorren solo el texto que el panel muestra o anuncia, no los comentarios del código. Su fallo
  MUST bloquear la integración.
  **La cobertura es parcial, a propósito**: el usted no tiene una marca morfológica propia como el
  voseo —"revise" es imperativo de usted y también subjuntivo de tercera persona—, y una regla
  general daría tantos falsos positivos que terminaría desactivada. La lista cerrada no atrapa todo,
  pero convierte en una compuerta permanente un repaso manual que se degrada con cada pantalla
  nueva. Lo que queda fuera de la lista lo cubre la revisión manual de la historia 3, y todo
  imperativo de usted que se encuentre en esa revisión se agrega a la lista.
- **FR-040**: Los textos que escribe el comercio (nombres de productos, categorías, descripciones)
  MUST NOT modificarse.

### Key Entities

- **Token de diseño**: valor con nombre por su papel. Atributos: categoría (color, tipografía,
  espaciado, radio, elevación, borde, densidad), papel, valor por esquema (claro y oscuro) y origen
  de la decisión en la referencia.
- **Par de contraste**: combinación de un token de texto o de elemento gráfico con un token de fondo.
  Atributos: estado, plano, esquema, tipo (texto normal, texto grande, componente de interfaz),
  razón declarada y umbral.
- **Tratamiento de componente**: cómo se ve un componente en cada uno de sus estados. Atributos:
  componente, estados que le aplican y tokens que usa en cada uno.
- **Excepción de valor literal**: valor admitido fuera de los tokens. Atributos: valor, categoría y
  razón.

## Success Criteria *(mandatory)*

### Criterios verificables automáticamente

*Son compuertas de despliegue: el principio X exige que su incumplimiento bloquee el paso a
producción. Todas bloquean en la integración continua (FR-033a), salvo la parte de rendimiento de
SC-006, que se verifica antes de integrar.*

- **SC-001**: 0 colores, tamaños de fuente, espaciados, radios, elevaciones o anchos de borde escritos
  a mano en los estilos del panel fuera de la lista de excepciones, verificado sobre el 100% de los
  componentes.
- **SC-002**: El 100% de los pares de contraste declarados cumple WCAG 2.2 AA en los dos esquemas, y
  el 100% de las razones declaradas coincide con la calculada (con dos decimales).
- **SC-003**: El 100% de las vistas del panel sigue superando la revisión WCAG 2.2 sin incumplimientos
  de nivel A ni AA (SC-014 de la 001), en los dos esquemas.
- **SC-004**: En el 100% de las vistas y diálogos, como máximo un elemento lleva el color de acento,
  y cuando lo lleva es la acción principal declarada para esa pantalla.
- **SC-005**: En el 100% de las vistas, los planos que la vista tiene se distinguen: dentro del
  marco del comercio, página, tarjeta y barra tienen colores de fondo distintos entre sí; fuera de
  él (inicio de sesión, alta de cuenta, comercios e invitación), página y tarjeta. La tarjeta se
  separa del fondo por borde o elevación, en los dos esquemas.
- **SC-006**: Las garantías vigentes pasan con sus umbrales actuales, sin pruebas eliminadas,
  omitidas ni aflojadas: 0 px de desplazamiento horizontal a 360 px; el 100% de las zonas táctiles
  de al menos 44 px; suma de saltos de diseño igual a 0 durante la carga; estructura visible en menos
  de 1 s y contenido útil en menos de 3 s en conexión móvil típica (SC-009 de la 001); catálogo sin
  degradación con 100 colaboradores (SC-008 de la 001).
- **SC-007**: Respecto de la rama base, la carga inicial del build de producción crece 0 bytes de
  JavaScript y como máximo 10 KB comprimidos de estilos.
- **SC-008**: 0 formas de voseo y 0 imperativos de usted de la lista cerrada de FR-039 —fuera de las
  excepciones declaradas— en los textos del panel, verificado sobre el 100% de sus textos.

### Objetivos de producto

*Miden la percepción de personas reales. Se verifican con pruebas de usuario, no de forma
automatizada, y por lo tanto MUST NOT bloquear un despliegue.*

- **SC-009**: Mostrando una pantalla del panel durante 5 segundos, al menos el 80% de las personas
  señala correctamente su acción principal en el primer intento.
- **SC-010**: En una comparación lado a lado de la versión anterior y la nueva de las mismas
  pantallas, al menos el 75% de los Propietarios y colaboradores prefiere la nueva.

## Fuera de Alcance

- Cambiar la estructura de cualquier pantalla: contenido, orden, navegación o disposición.
- Agregar o quitar funcionalidad.
- Gráficos, tableros e indicadores.
- La tienda pública.
- Personalización de colores o de marca por comercio: el sistema define la identidad del panel, no
  la de cada inquilino.
- **El interruptor de esquema**: cualquier control para que la persona elija entre claro y oscuro
  dentro del panel. Esta spec nunca lo incluyó, y queda excluido de forma explícita para que nadie
  lo asuma. Tiene interfaz propia, persistencia de la preferencia y una regla de precedencia frente
  al sistema operativo, y aplicar una preferencia guardada antes del primer pintado exige código en
  el arranque: justo la presión contra el presupuesto de 0 bytes de JavaScript de FR-034. Si se
  quiere, va en una feature propia, que discuta ese presupuesto. Los dos esquemas del sistema
  (FR-002) sí están dentro del alcance; lo que queda fuera es elegirlos desde el panel.
- Iconografía nueva o ilustraciones.
- Revisar el registro de los textos que escribe el comercio.

## Assumptions

- **Qué se toma de la referencia**: las decisiones de `src/app/styles/` —primario azul con variante
  clara, acento cálido, rojo-rosado para error, verde para éxito, violeta para información; fondo de
  página con un tinte del primario y tarjetas blancas con sombra suave y difusa; tablas sin fondo
  propio con hover tenue y sin borde en la última fila; paginador y barra de herramientas sin fondo
  propio; pestañas sin borde inferior con el activo en el primario; una escala tipográfica amplia
  y pesos de 400 a 700—. Se toman como dirección, no como valores fijos: todo valor que no cumpla AA
  se ajusta conservando su papel y su tono.
- **Tipografía del sistema**: se mantiene la fuente del sistema operativo en lugar de una fuente
  descargada, como decidió la 001 por la carga percibida (SC-009). La jerarquía se construye con
  tamaño, peso, tono y espaciado, no con una familia distinta.
- **Esquema oscuro**: ya no es un supuesto, es un requisito (FR-002). Lo que se asume es el
  mecanismo para elegirlo: la preferencia del sistema operativo, como hoy, que no necesita código en
  el arranque. La referencia también define variantes oscuras, de donde se toman las decisiones del
  segundo esquema.
- **Acción principal**: es la que completa la tarea para la que existe la pantalla. Cuál es en cada
  pantalla se declara durante el plan, en una lista que usa la prueba de SC-004.
- **Umbrales vigentes**: son los que hoy verifican las pruebas de extremo a extremo del panel
  (diseño móvil, estados de carga, rendimiento y accesibilidad). Esta feature no los redefine.
- **Tuteo neutro**: la decisión sigue al panel de administración de referencia, que usa tuteo en
  todo su panel y opera en el mismo mercado. No es una preferencia de estilo: es consistencia con lo
  que el comerciante colombiano ya ve en herramientas equivalentes.
- **Rama base**: la medida de tamaño de FR-034 se toma sobre el build de producción de la rama base
  en el momento de integrar, no sobre un valor fijo, para que otras features no consuman el
  presupuesto de esta.
- **Por qué 0 bytes de JavaScript**: tokens, planos, tipografía, estados y tratamiento de componentes
  se expresan con estilos. El presupuesto de 10 KB de estilos cubre los tokens de los dos esquemas y
  los tratamientos de componente; el de JavaScript es cero porque nada de eso necesita ejecutarse.
- **Componentes de terceros**: la revisión de FR-005 se aplica al código del panel, no a los estilos
  internos de la biblioteca de componentes. Los componentes de terceros se adaptan mediante los
  puntos de personalización que la biblioteca ofrece.
- **Textos del servidor**: los mensajes que genera la plataforma y que el panel muestra entran en el
  alcance de FR-037; los correos y notificaciones fuera del panel, no.

## Alineación con la Constitución

| Principio | Cobertura en esta especificación |
|---|---|
| I. Catálogo jerárquico con variantes | Sin cambios: esta feature no toca el modelo |
| II. Sincronización atómica de existencias | Sin cambios |
| III. Motor de descuentos flexibles | Fuera de alcance |
| IV. Desacoplamiento de recaudo y logística | Sin cambios |
| V. Analíticas en tiempo real | Fuera de alcance (gráficos y tableros excluidos) |
| VI. RBAC jerárquico y mínimo privilegio | Sin cambios. El acento no se reasigna cuando un rol no tiene la acción principal (FR-008) |
| VII. Trazabilidad inmutable | Sin cambios |
| VIII. Optimización de carga percibida | FR-017, FR-027, FR-034 a FR-036; SC-006, SC-007 |
| IX. Enfoque mobile-first | FR-020, FR-023 a FR-026, FR-030; SC-002, SC-003, SC-006 |
| X. Regla de garantía automática | FR-005, FR-021a, FR-031, FR-033a, FR-035, FR-038, FR-039: las nuevas verificaciones bloquean la integración; FR-033: ninguna existente se afloja |
