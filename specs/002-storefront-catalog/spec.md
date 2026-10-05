# Feature Specification: Catálogo de Cara a la Tienda

**Feature Branch**: `feat/002-storefront-catalog`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Catálogo de cara a la tienda. El comercio organiza sus productos en categorías con subcategorías, y un producto puede estar en varias. Cada producto lleva los datos que una tienda pública necesita para mostrarlo y para que lo encuentren: título y descripción para buscadores, una URL amigable única dentro del inquilino que se genera sola a partir del nombre y se puede editar, etiquetas de búsqueda y marca. El producto declara si es físico o digital; el físico lleva peso y dimensiones, que son los datos con los que después se cotiza un envío, y el digital no los pide. Cada variante puede llevar código de barras GTIN además de su SKU, y su propio peso y dimensiones cuando difieren de los del producto. El producto admite un video externo junto a sus imágenes. El comercio decide por producto si el precio se muestra o se oculta en la tienda, si ofrece envío gratis, en qué secciones destacadas aparece y con qué plantilla se presenta. Para los catálogos externos el producto admite MPN, rango de edad y género. Todo lo anterior respeta los permisos ya existentes: quien no puede editar precios tampoco puede cambiar si el precio se muestra. Fuera de alcance: la tienda pública en sí, inventario por ubicación, tablas de precio, importación masiva, carrito, pedidos."

**Depende de**: `001-catalog-rbac` (productos, variantes, estados, permisos, bitácora y panel). Esta
feature amplía ese catálogo; no redefine nada de lo que la 001 ya fija.

## Clarifications

### Sesión 2026-10-05

- **Q: ¿La falta de peso y dimensiones impide activar un producto físico?** → A: no. Solo se señala
  en el listado y se puede filtrar. Ningún producto, existente o nuevo, queda bloqueado por eso; si
  hace falta exigirlo, lo decide la feature de envíos.
- **Q: ¿Quién define las secciones destacadas y las plantillas?** → A: las secciones las fija **la
  plataforma**, y son dos: **Destacados** y **Ofertas**. Cada una admite hasta **40 productos** por
  comercio, con un contador visible. Las **plantillas quedan fuera de alcance**: dependen del tema de
  la tienda, que todavía no existe. (Precisiones tomadas del panel de administración de referencia.)
- **Q: ¿Qué pasa al agregar un producto a una sección que ya está en su tope?** → A: **se rechaza**,
  con el contador a la vista; no se desplaza a ningún otro producto. Desplazar quitaría sin aviso
  un producto que alguien eligió poner ahí (FR-039 de la 001). Para hacer lugar, se quita uno a mano.
- **Q: ¿Las categorías tienen visibilidad propia?** → A: sí. El admin de referencia permite ocultar
  una categoría sin eliminarla ni desasignar sus productos. Ocultar una rama oculta sus
  subcategorías. (Verificado en el panel de administración de referencia.)
- **Q: Si un colaborador sin permiso de precios cambia un producto de físico a digital (o al
  revés), ¿cómo se trata ese cambio?** → A: basta con el permiso de editar el catálogo, y **todo**
  cambio de tipo registra una entrada "condiciones de venta" en la bitácora, en las dos
  direcciones, porque siempre cambia el envío que ve el comprador: un digital que pasa a físico sin
  envío gratis previo hace que el comprador pase a pagar envío. El aviso previo dice qué cambia
  para el comprador, no solo qué datos dejan de usarse.
- **Q: Si en una acción masiva para activar el envío gratis hay productos digitales entre los
  seleccionados, ¿qué pasa con la acción?** → A: se rechaza entera, nombrando los productos
  digitales, y la misma pantalla ofrece quitarlos de la selección y reintentar con el resto.
- **Q: Cuando se renombra o se mueve una categoría, ¿su URL amigable cambia?** → A: no. Se genera al
  crearla y después nunca cambia sola; si se edita a mano, la anterior queda reservada para
  redirigir. Es plana —no incluye a sus ancestros—, así que mover la categoría no la cambia, y es
  única entre todas las categorías del comercio.
- **Q: Si se desarchiva un producto cuya variante tiene un GTIN que mientras tanto se asignó a otra
  variante, ¿qué pasa?** → A: el escenario **queda sin efecto**, porque se elimina en origen: el GTIN
  de una variante archivada queda reservado igual que su SKU (001) y que la URL amigable (FR-005),
  así que ninguna otra variante puede tomarlo. Para liberarlo, se quita el GTIN de la variante
  archivada. No hay datos a migrar: el GTIN es un campo nuevo y todavía no hay ninguno cargado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El comercio prepara la ficha de tienda de un producto (Priority: P1)

Desde el editor del producto, quien puede editar el catálogo completa lo que una tienda necesita para
mostrarlo y para que lo encuentren: la URL amigable —que aparece sola a partir del nombre y se puede
corregir—, el título y la descripción para buscadores con una vista previa de cómo se verían, las
etiquetas de búsqueda, la marca, un video externo junto a las imágenes, y si el producto es físico o
digital. Si es físico, carga su peso y sus dimensiones; si es digital, esos campos no se piden.

**Why this priority**: es el dato mínimo para que un producto pueda existir en una tienda pública:
sin URL, sin datos para buscadores y sin saber si se envía, la tienda futura no tiene qué mostrar ni
qué cotizar. Todo lo demás de esta feature organiza o afina productos que ya tienen esta ficha.

**Independent Test**: crear un producto, comprobar que su URL amigable se generó del nombre, editarla,
completar los datos para buscadores, etiquetas, marca y video, marcarlo como físico con peso y
dimensiones; repetir con uno digital y comprobar que no pide peso ni dimensiones.

**Acceptance Scenarios**:

1. **Given** un producto nuevo llamado "Camiseta Básica Algodón", **When** se crea, **Then** su URL
   amigable es `camiseta-basica-algodon`, sin que nadie la escriba.
2. **Given** otro producto del mismo comercio ya usa `camiseta-basica-algodon`, **When** se crea un
   producto con el mismo nombre, **Then** recibe `camiseta-basica-algodon-2` y el comercio lo ve antes
   de guardar.
3. **Given** un producto en borrador que nunca se publicó, **When** se cambia su nombre, **Then** la
   URL amigable sigue al nombre nuevo, salvo que ya se haya editado a mano.
4. **Given** un producto que alguna vez estuvo activo o no listado, **When** se cambia su nombre,
   **Then** la URL amigable **no** cambia sola; si se edita a mano, la anterior queda registrada y
   reservada para redirigir a la nueva.
5. **Given** se escribe una URL amigable con mayúsculas, espacios o acentos, **When** se guarda,
   **Then** queda normalizada (`Té Verde Orgánico` → `te-verde-organico`) y se muestra el resultado.
6. **Given** un producto sin título ni descripción para buscadores, **When** se mira su vista previa
   en buscadores, **Then** muestra el nombre y el comienzo de la descripción del producto, e indica
   que se usarán esos valores por defecto.
7. **Given** se carga un título para buscadores de más de 70 caracteres, **When** se escribe,
   **Then** el contador lo marca y no se puede guardar hasta acortarlo.
8. **Given** se agrega la etiqueta "Verano" a un producto que ya tiene "verano", **When** se
   confirma, **Then** no se duplica.
9. **Given** existe la marca "Nike" en otro producto del comercio, **When** se empieza a escribir
   "ni" en el campo de marca, **Then** se sugiere "Nike".
10. **Given** un producto físico sin peso ni dimensiones, **When** se mira el listado del catálogo,
    **Then** aparece señalado como "faltan datos de envío".
11. **Given** un producto físico con peso y dimensiones, **When** se cambia a digital, **Then** se
    avisa que esos datos dejan de usarse; se conservan y vuelven si se lo cambia otra vez a físico.
12. **Given** se pega un enlace de un video de una plataforma admitida, **When** se guarda,
    **Then** el video aparece en la galería del producto junto a las imágenes, en la posición que el
    comercio elija.
13. **Given** se pega un enlace que no es de una plataforma de video admitida, **When** se intenta
    guardar, **Then** se rechaza con un mensaje que nombra las plataformas admitidas.

---

### User Story 2 - El comercio organiza su catálogo en categorías (Priority: P2)

Quien puede editar el catálogo arma un árbol de categorías con subcategorías —"Ropa > Hombre >
Camisetas"—, lo reordena, y asigna cada producto a una o varias categorías. Desde el listado del
catálogo filtra por categoría y asigna o quita una categoría a muchos productos de una vez.

**Why this priority**: con unas pocas decenas de productos el catálogo ya necesita estructura, y es
la navegación principal de cualquier tienda. Depende de que los productos existan, pero no de la
ficha de tienda de la Historia 1.

**Independent Test**: crear "Ropa", dentro "Hombre" y dentro "Camisetas"; asignar un producto a
"Camisetas" y a "Ofertas de temporada"; filtrar el catálogo por "Ropa" y verlo; quitar una categoría
a diez productos en una sola acción.

**Acceptance Scenarios**:

1. **Given** existe la categoría "Ropa", **When** se crea "Hombre" dentro de ella, **Then** queda como
   subcategoría y el árbol la muestra anidada.
2. **Given** un producto, **When** se lo asigna a "Camisetas" y a "Ofertas de temporada", **Then**
   figura en las dos.
3. **Given** un producto asignado solo a "Camisetas", **When** se filtra el catálogo por "Ropa",
   **Then** aparece, porque "Camisetas" está dentro de "Ropa".
4. **Given** el árbol ya tiene tres niveles, **When** se intenta crear una categoría dentro del
   tercero, **Then** se impide e informa el límite.
5. **Given** ya existe "Hombre" dentro de "Ropa", **When** se crea otra "hombre" en el mismo lugar,
   **Then** se rechaza por nombre repetido; **And** sí se permite una "Hombre" dentro de "Calzado".
6. **Given** una categoría con 40 productos y sin subcategorías, **When** se pide eliminarla,
   **Then** se informa que 40 productos dejarán de estar en ella antes de confirmar, y los productos
   no se modifican de ninguna otra forma.
7. **Given** una categoría con subcategorías, **When** se pide eliminarla, **Then** se impide hasta
   moverlas o eliminarlas primero.
8. **Given** "Camisetas" está dentro de "Hombre", **When** se la mueve dentro de "Mujer", **Then** sus
   productos la acompañan, y se impide moverla dentro de una de sus propias subcategorías.
9. **Given** se seleccionan 50 productos en el listado, **When** se les asigna "Novedades" en una
   sola acción, **Then** los 50 quedan en "Novedades" y los que ya estaban no se duplican.
10. **Given** un colaborador sin permiso para editar el catálogo, **When** abre las categorías,
    **Then** las ve y puede filtrar por ellas, pero no se le ofrece crear, mover, renombrar ni
    eliminar.

---

### User Story 3 - El comercio decide cómo se ofrece cada producto en la tienda (Priority: P3)

Por producto, el comercio decide si el precio se muestra o se oculta en la tienda, si ofrece envío
gratis y en cuáles de las dos secciones destacadas —Destacados y Ofertas— aparece. Cada sección
admite hasta 40 productos, y el contador está siempre a la vista. Mostrar u ocultar el
precio y ofrecer envío gratis son decisiones sobre lo que paga el comprador: las toma solo quien
puede modificar precios, y quedan en la bitácora.

**Why this priority**: afina la presentación de productos que ya tienen ficha y categoría; sin esto
la tienda futura igual puede mostrar el catálogo con valores por defecto.

**Independent Test**: como Propietario, ocultar el precio de un producto y ofrecerle envío gratis, y
ver ambas entradas en la bitácora; como rol de Catálogo, comprobar que ve esas dos opciones sin
poder cambiarlas, y que sí puede agregar el producto a Destacados; llenar Ofertas hasta 40 y
comprobar que el producto 41 se rechaza.

**Acceptance Scenarios**:

1. **Given** un producto nuevo, **When** se crea, **Then** muestra el precio, no ofrece envío gratis,
   no está en ninguna sección destacada.
2. **Given** el Propietario oculta el precio de un producto, **When** confirma, **Then** el cambio
   queda aplicado **y** su entrada de bitácora registrada, o no queda ninguno de los dos.
3. **Given** un colaborador con rol de Catálogo (sin permiso de precios), **When** abre el producto,
   **Then** ve si el precio se muestra y si hay envío gratis, en solo lectura.
4. **Given** ese mismo colaborador, **When** intenta cambiar la visibilidad del precio o el envío
   gratis por un camino que no sea la interfaz, **Then** el servidor lo rechaza y registra el intento
   como evento de seguridad.
5. **Given** un colaborador con permiso de editar el catálogo, **When** agrega el producto a
   Destacados y a Ofertas, **Then** se aplica sin pedir permiso de precios, y cada sección muestra su
   contador actualizado ("33 de 40").
6. **Given** un producto digital, **When** se mira la opción de envío gratis, **Then** no se ofrece,
   porque un producto digital no se envía.
7. **Given** se seleccionan 20 productos, **When** el Propietario les activa envío gratis en una sola
   acción, **Then** queda una entrada de bitácora por cada producto, y si algo falla no se aplica a
   ninguno.
8. **Given** cualquier persona del comercio, **When** mira las secciones destacadas, **Then** ve
   Destacados y Ofertas, sin opción de crear, renombrar ni eliminar ninguna.
9. **Given** Ofertas tiene 40 productos, **When** se intenta agregar otro, **Then** se rechaza
   indicando que la sección está completa (40 de 40), y ningún producto sale de ella.
10. **Given** Destacados tiene 35 productos, **When** se seleccionan 8 en el listado y se los agrega
    en una sola acción, **Then** se rechaza la acción entera indicando que solo quedan 5 lugares, y no
    se agrega ninguno.
11. **Given** Destacados tiene 40 productos, **When** se archiva uno de ellos, **Then** el aviso de
    archivado dice que sale de Destacados, y al confirmar el contador queda en 39 de 40.
12. **Given** quedan 39 de 40 en Ofertas, **When** dos personas agregan a la vez un producto distinto
    cada una, **Then** se acepta solo uno y el otro se rechaza por sección completa.
13. **Given** se seleccionan 20 productos y 3 son digitales, **When** el Propietario les activa envío
    gratis, **Then** se rechaza la acción entera nombrando los 3 digitales, y desde la misma pantalla
    puede quitarlos de la selección y reintentar: el envío gratis queda activo en los 17 físicos.

---

### User Story 4 - Datos por variante e identificadores para catálogos externos (Priority: P4)

Cada variante puede llevar su código de barras GTIN además del SKU, y su propio peso y dimensiones
cuando difieren de los del producto. El producto admite además MPN, rango de edad y género, que son
los datos que piden los catálogos externos (comparadores, marketplaces, catálogos de anuncios).

**Why this priority**: refina datos de productos ya organizados y presentables; solo es necesario
para quien vende en canales externos o tiene variantes de peso muy distinto.

**Independent Test**: en un producto con talles, cargar un GTIN válido a una variante, intentar uno
inválido y uno repetido; darle a la variante XL un peso propio y ver que las demás siguen usando el
del producto; cargar MPN, rango de edad y género.

**Acceptance Scenarios**:

1. **Given** una variante, **When** se le carga un GTIN de 13 dígitos con dígito verificador
   correcto, **Then** se acepta.
2. **Given** un GTIN con el dígito verificador incorrecto, **When** se intenta guardar, **Then** se
   rechaza indicando que el código no es válido.
3. **Given** otra variante del mismo comercio, archivada o no, ya usa un GTIN, **When** se lo asigna
   a una variante distinta, **Then** se rechaza e indica qué producto lo tiene y si está archivado.
4. **Given** un producto físico de 300 g, **When** a su variante "XL" se le asigna 450 g, **Then**
   "XL" pesa 450 g y las demás variantes siguen mostrando 300 g, señalados como heredados del
   producto.
5. **Given** una variante con peso propio, **When** se borra ese peso, **Then** vuelve a heredar el
   del producto.
6. **Given** un producto digital, **When** se mira su tabla de variantes, **Then** no ofrece peso ni
   dimensiones por variante.
7. **Given** un producto, **When** se le asigna rango de edad "adultos" y género "unisex", **Then**
   quedan registrados con esos valores, elegidos de una lista cerrada.
8. **Given** una variante archivada tiene un GTIN, **When** se le quita, **Then** el código queda
   libre y otra variante puede tomarlo.

---

### Edge Cases

- **URL amigable de un nombre sin letras ni números** (por ejemplo "★★★"): se genera una de respaldo
  a partir del identificador del producto, y se pide al comercio que la reemplace.
- **URL amigable de un producto archivado**: queda reservada, igual que su SKU (FR-023 de la 001);
  ningún otro producto puede tomarla.
- **URL amigable editada que coincide con una anterior del mismo producto**: se permite; vuelve a
  ser la vigente y deja de figurar como anterior.
- **URL amigable reservada como anterior por otro producto**: se rechaza indicando qué producto la
  reserva.
- **Dos personas editan a la vez la URL amigable u otros datos del mismo producto**: se rechaza la
  escritura desactualizada (FR-027 de la 001).
- **Productos creados antes de esta feature**: reciben URL amigable generada de su nombre, tipo
  físico sin peso ni dimensiones, precio visible, sin envío gratis y sin secciones destacadas. No se
  cambia su estado ni se bloquea nada.
- **Un producto cambia de físico a digital con envío gratis activo**: el envío gratis deja de
  aplicar y se conserva el valor por si vuelve a ser físico; el aviso lo dice antes de confirmar, y
  queda la entrada de bitácora (FR-032).
- **Un producto creado como digital pasa a físico**: no tiene envío gratis previo que recuperar y
  toma el valor por defecto, de modo que el comprador pasa a pagar envío; el aviso lo dice y queda
  la entrada de bitácora (FR-032).
- **Variante con peso propio en un producto que pasa a digital**: igual que el producto, el dato se
  conserva sin usarse.
- **Una categoría vacía**: se puede tener; el catálogo filtrado por ella muestra el estado de vacío.
- **Dos categorías con el mismo nombre bajo padres distintos** ("Hombre > Camisas" y "Mujer >
  Camisas", que FR-020 permite): como la URL es plana y única en todo el comercio (FR-021), reciben
  `camisas` y `camisas-2` por el sufijo de FR-006. El panel muestra la URL resultante al crear la
  categoría, para que el comercio la corrija en el momento —por ejemplo, a `camisas-mujer`— en vez
  de descubrirla ya publicada.
- **Mover una categoría haría superar los tres niveles** (porque arrastra subcategorías): se impide
  e informa por qué.
- **Mover una categoría visible dentro de una oculta**: la rama manda. La categoría movida queda
  oculta de hecho aunque su propia visibilidad diga visible, y el panel MUST hacerlo evidente: la
  señala como oculta por su categoría padre, distinta de una oculta por sí misma (FR-021a).
- **Producto en borrador o no listado dentro de una sección**: se permite y ocupa lugar; el panel
  lo señala, porque la tienda no lo va a mostrar ahí mientras no esté activo.
- **Producto archivado**: sale de sus secciones al archivarse y libera su lugar (FR-028). Al
  desarchivarlo no vuelve a ellas solo.
- **Etiquetas o marcas que difieren solo en mayúsculas o acentos** ("Algodón" y "algodon"): se
  tratan como la misma; se conserva la primera forma registrada.
- **Video de una plataforma admitida que fue eliminado o es privado**: se acepta el enlace (no se
  puede saber al guardarlo); el panel no lo verifica después. Ver Assumptions.
- **GTIN con ceros a la izquierda** (un UPC-A de 12 dígitos escrito como 13): se acepta en sus
  longitudes válidas y se compara normalizado a 14 dígitos para detectar repetidos.

## Requirements *(mandatory)*

### Functional Requirements

#### Aislamiento y permisos

- **FR-001**: Toda categoría, sección destacada, etiqueta, marca y dato de esta feature MUST
  pertenecer a un único inquilino y regirse por el mismo aislamiento que la 001 (FR-001 a FR-005 de
  la 001): ningún dato cruza la frontera del comercio.
- **FR-002**: Leer cualquier dato de esta feature MUST requerir el permiso de ver el catálogo.
  Crear, editar, mover y eliminar categorías, y editar todo dato de esta feature salvo los de
  FR-003, MUST requerir el permiso de editar el catálogo.
- **FR-003**: Mostrar u ocultar el precio en la tienda y ofrecer o retirar el envío gratis MUST
  requerir el permiso de modificar precios (FR-015 de la 001). Quien no lo tiene MUST poder verlos
  en solo lectura, y el servidor MUST rechazar todo intento de cambiarlos y registrarlo como evento
  de seguridad.
- **FR-004**: Esta feature MUST NOT crear permisos nuevos ni ampliar lo que concede un permiso
  existente más allá de lo que fijan FR-002 y FR-003.

#### URL amigable

- **FR-005**: Cada producto MUST tener una URL amigable, única entre los productos del mismo
  inquilino —incluidos los archivados y las URL anteriores reservadas (FR-008)— y permitida repetida
  entre inquilinos distintos.
- **FR-006**: Al crear un producto, el sistema MUST generar su URL amigable a partir del nombre:
  minúsculas, sin acentos ni signos, con guiones entre palabras, de 1 a 100 caracteres. Ante una
  coincidencia MUST agregar el menor sufijo numérico libre (`-2`, `-3`…). Si el nombre no produce
  ningún carácter válido, MUST generar una de respaldo y señalarla para que el comercio la
  reemplace.
- **FR-007**: El comercio MUST poder editar la URL amigable; el sistema MUST normalizarla con las
  mismas reglas de FR-006, mostrar el resultado antes de guardar y rechazar la que ya esté en uso,
  indicando qué producto la tiene.
- **FR-008**: Mientras un producto nunca haya estado activo ni no listado y su URL amigable no se
  haya editado a mano, la URL MUST seguir a los cambios de nombre. En cualquier otro caso MUST NOT
  cambiar sola. Toda URL amigable que deje de ser la vigente de un producto que alguna vez estuvo
  activo o no listado MUST quedar registrada como anterior de ese producto y reservada, para que la
  tienda futura pueda redirigirla.

#### Datos para buscadores, etiquetas y marca

- **FR-009**: Cada producto MUST admitir un título para buscadores de hasta 70 caracteres y una
  descripción para buscadores de hasta 160 caracteres, ambos opcionales. Cuando faltan, el panel MUST
  indicar que se usarán el nombre y el comienzo de la descripción del producto.
- **FR-010**: El editor MUST mostrar una vista previa de cómo aparecería el producto en un resultado
  de buscador —título, URL y descripción efectivos—, actualizada mientras se escribe.
- **FR-011**: Cada producto MUST admitir hasta 30 etiquetas de búsqueda, de hasta 40 caracteres
  cada una. Las etiquetas MUST compararse sin distinguir mayúsculas ni acentos: no se repiten en un
  producto, y al escribir una MUST sugerirse las ya usadas en el comercio.
- **FR-012**: Cada producto MUST admitir una marca opcional, de hasta 70 caracteres. Al escribirla
  MUST sugerirse las marcas ya usadas en el comercio, y dos marcas que difieren solo en mayúsculas o
  acentos MUST tratarse como la misma.

#### Tipo de producto, peso y dimensiones

- **FR-013**: Cada producto MUST declarar si es **físico** o **digital**. Un producto nuevo MUST ser
  físico salvo que se elija lo contrario.
- **FR-014**: Un producto físico MUST admitir peso y dimensiones (largo, ancho y alto), cada uno
  mayor que cero. Un producto digital MUST NOT pedirlos ni ofrecerlos.
- **FR-015**: Cada variante de un producto físico MUST poder tener peso propio y dimensiones propias,
  independientes entre sí. Una variante sin valor propio MUST heredar el del producto, y la tabla de
  variantes MUST distinguir el valor propio del heredado.
- **FR-016**: Cambiar el tipo de un producto MUST avisar antes de confirmar qué cambia para el
  comprador —por ejemplo "el comprador dejará de pagar envío" o "el comprador pasará a pagar
  envío"— y qué datos dejan de usarse —peso, dimensiones y envío gratis al pasar a digital—. Esos
  datos MUST conservarse para que vuelvan si el producto vuelve a ser físico. Cambiar el tipo MUST
  requerir el permiso de editar el catálogo (FR-002) y no el de modificar precios, y MUST quedar en
  la bitácora (FR-032).
- **FR-017**: El listado del catálogo MUST señalar los productos físicos a los que les falta peso o
  alguna dimensión efectiva en alguna variante, y MUST permitir filtrarlos. Esa falta MUST NOT
  impedir ningún cambio de estado del producto.

#### Video

- **FR-018**: Cada producto MUST admitir un video externo, como enlace a una plataforma de video
  admitida, y el comercio MUST poder ubicarlo entre las imágenes del producto. El sistema MUST
  rechazar enlaces de otras plataformas nombrando las admitidas.

#### Categorías

- **FR-019**: El comercio MUST poder crear, renombrar, reordenar, mover y eliminar categorías,
  organizadas en un árbol de hasta tres niveles. El sistema MUST impedir toda operación que deje una
  categoría a más de tres niveles o dentro de una de sus propias subcategorías.
- **FR-020**: Dos categorías con el mismo padre MUST NOT tener el mismo nombre, comparado sin
  distinguir mayúsculas ni acentos.
- **FR-021**: Cada categoría MUST tener su propia URL amigable, generada de su nombre al crearla y
  editable con las reglas de FR-006 y FR-007. La URL amigable de una categoría MUST ser plana e
  independiente de su posición en el árbol —no incluye a sus ancestros—; por eso MUST ser única
  entre **todas** las categorías del inquilino, y no solo entre hermanas, incluidas las URL
  anteriores reservadas. Después de creada MUST NOT cambiar sola: ni al renombrar ni al mover la
  categoría. Si se edita a mano, la anterior MUST quedar registrada como anterior de esa categoría y
  reservada para redirigir, como en FR-008. Al crear una categoría, el panel MUST mostrar la URL
  resultante antes de confirmar.
- **FR-021a**: Cada categoría MUST declarar si está visible u oculta (por defecto, visible). Ocultar
  una categoría MUST NOT modificar los productos asignados a ella, MUST NOT quitar ninguna
  asignación y MUST NOT afectar la presencia de esos productos en otras categorías. Ocultar una
  categoría con subcategorías MUST ocultar la rama completa, y el panel MUST advertirlo antes de
  confirmar indicando cuántas subcategorías quedan ocultas. El panel MUST seguir mostrando al
  comercio las categorías ocultas, señaladas como tales, y MUST permitir filtrar el árbol por
  visibilidad. Cambiar la visibilidad MUST requerir el permiso de editar el catálogo (FR-002). El
  efecto sobre una tienda pública queda fuera del alcance de esta feature; aquí se modela la
  visibilidad para que la tienda futura la consulte, igual que la 001 hizo con el estado del
  producto. Ocultar una categoría y volver a mostrarla MUST dejar a cada
  descendiente con la visibilidad que él mismo tenía antes. Mover una categoría MUST NOT alterar la
  visibilidad propia de ninguna categoría, ni la movida ni sus descendientes.
- **FR-022**: Un producto MUST poder pertenecer a varias categorías, hasta 20, de cualquier nivel.
  Asignar un producto a una subcategoría MUST NOT asignarlo explícitamente a sus categorías padre.
- **FR-023**: Filtrar el catálogo por una categoría MUST incluir los productos asignados a ella y a
  cualquiera de sus subcategorías.
- **FR-024**: Eliminar una categoría MUST impedirse mientras tenga subcategorías. Eliminar una sin
  subcategorías MUST informar antes de confirmar cuántos productos dejarán de estar en ella, y MUST
  NOT modificar esos productos de ninguna otra forma.
- **FR-025**: Desde el listado del catálogo, el comercio MUST poder asignar o quitar una categoría a
  varios productos seleccionados en una sola acción, sin duplicar asignaciones existentes.

#### Presentación en la tienda

- **FR-026**: Cada producto MUST declarar si su precio se muestra u oculta en la tienda (por
  defecto, se muestra) y si ofrece envío gratis (por defecto, no). El envío gratis MUST NOT ofrecerse
  en un producto digital.
- **FR-027**: Las secciones destacadas MUST ser exactamente dos, fijadas por la plataforma e iguales
  para todos los comercios: **Destacados** y **Ofertas**. Cada producto MUST poder figurar en
  ninguna, una o las dos. El comercio MUST NOT poder crear, renombrar ni eliminar secciones.
- **FR-027a**: Cada sección MUST admitir como máximo 40 productos por comercio, contando todos los
  que figuran en ella sea cual sea su estado. El panel MUST mostrar en todo momento cuántos lugares
  ocupa cada sección ("33 de 40") donde se elige la sección y en el listado filtrado por ella.
- **FR-027b**: Agregar productos a una sección que no tiene lugar para todos ellos MUST rechazarse
  entero, indicando cuántos lugares quedan; el sistema MUST NOT quitar ni desplazar ningún producto
  de la sección para hacer lugar. El tope MUST respetarse también cuando varias personas agregan
  productos a la vez.
- **FR-027c**: El listado del catálogo MUST poder filtrarse por sección destacada, y desde ahí MUST
  poder quitarse un producto de la sección.
- **FR-028**: Archivar un producto MUST quitarlo de las secciones en las que figura y liberar sus
  lugares; el aviso de archivado MUST decirlo antes de confirmar. Desarchivarlo MUST NOT devolverlo a
  ellas.
- **FR-029**: El comercio MUST poder aplicar cualquiera de los valores de FR-026 y FR-027 a varios
  productos seleccionados en una sola acción, con los permisos de FR-002 y FR-003 y el tope de
  FR-027a. Si el rol carece de permiso sobre alguno de los cambios pedidos, si no hay lugar para
  todos, o si se pide activar el envío gratis y hay productos digitales entre los seleccionados, la
  acción MUST NOT aplicarse a ninguno. En este último caso el rechazo MUST nombrar los productos
  digitales y ofrecer, en la misma pantalla, quitarlos de la selección y reintentar la acción sobre
  el resto, sin volver al listado.

#### Identificadores para catálogos externos

- **FR-030**: Cada variante MUST admitir un GTIN opcional, además de su SKU. El sistema MUST aceptar
  solo GTIN de 8, 12, 13 o 14 dígitos con dígito verificador correcto, y MUST rechazar un GTIN ya
  asignado a otra variante del mismo inquilino, archivada o no, comparándolos normalizados a 14
  dígitos e indicando qué producto lo tiene. Así el GTIN de una variante archivada queda reservado
  igual que su SKU. Quitar el GTIN de una variante archivada MUST ser posible y MUST liberar el
  código para otra variante.
- **FR-031**: Cada producto MUST admitir un MPN opcional de hasta 70 caracteres, un rango de edad
  opcional elegido entre **recién nacido**, **bebé**, **niño pequeño**, **niño** y **adulto**, y un
  género opcional elegido entre **masculino**, **femenino** y **unisex**. El panel MUST presentar
  cada valor de rango de edad como su rango legible —recién nacido: "0 a 3 meses"; bebé: "3 a 12
  meses"; niño pequeño: "1 a 5 años"; niño: "5 a 13 años"; adulto: "Adulto"—, conservando la
  taxonomía como valor almacenado y enviado a los catálogos externos.

#### Bitácora

- **FR-032**: Todo cambio de la visibilidad del precio, todo cambio del envío gratis y todo cambio
  del tipo de producto MUST registrarse en la bitácora con un tipo de evento propio, **condiciones
  de venta**. Sus valores anterior y nuevo son la visibilidad del precio, o las condiciones de envío
  efectivas: **sin envío** (digital), **envío con cargo** o **envío gratis**. Como todo cambio de
  tipo altera las condiciones de envío efectivas, todo cambio de tipo produce su entrada, en las dos
  direcciones. El cambio y su entrada MUST aplicarse como unidad indivisible, en los mismos términos
  que FR-030, FR-032 y FR-033 de la 001; una acción masiva MUST producir una entrada por producto.
- **FR-033**: El filtro de la bitácora por tipo de evento MUST incluir el tipo condiciones de venta.

#### Interfaz

- **FR-034**: Toda vista nueva o ampliada por esta feature MUST cumplir FR-036 a FR-040 de la 001:
  esqueleto de carga, error con reintento, vacío con acción, diseño desde 360 px sin desplazamiento
  horizontal, WCAG 2.2 AA, trabajo en curso que no se pierde, y controles ofrecidos solo a quien
  puede usarlos.
- **FR-035**: Las URL amigables, las etiquetas, las marcas y las categorías MUST poder usarse para
  buscar y filtrar en el listado del catálogo.

### Key Entities

- **Categoría**: agrupación del catálogo definida por el comercio, con nombre, URL amigable, orden
  entre sus hermanas, visibilidad en la tienda y, salvo las de primer nivel, una categoría padre.
  Hasta tres niveles.
- **Asignación a categoría**: vínculo entre un producto y una categoría. Un producto tiene de cero a
  veinte.
- **URL amigable anterior**: URL que un producto o una categoría tuvo y ya no tiene, registrada y
  reservada para redirigir a la vigente.
- **Sección destacada**: lugar de la tienda donde se destacan productos. Son dos, fijas de la
  plataforma: Destacados y Ofertas. Cada una admite hasta 40 productos por comercio; un producto
  figura en ninguna, una o las dos.
- **Producto** *(ampliado)*: suma URL amigable, título y descripción para buscadores, etiquetas,
  marca, tipo (físico o digital), peso y dimensiones, video externo, visibilidad del precio, envío
  gratis, secciones destacadas, MPN, rango de edad y género.
- **Variante** *(ampliada)*: suma GTIN, y peso y dimensiones propios cuando difieren de los del
  producto.
- **Entrada de bitácora** *(ampliada)*: suma el tipo de evento condiciones de venta.

## Success Criteria *(mandatory)*

### Criterios verificables automáticamente

- **SC-001**: 0 productos del mismo inquilino comparten URL amigable vigente, archivada o anterior
  reservada, verificado también bajo creaciones simultáneas con el mismo nombre.
- **SC-002**: El 100% de los intentos de cambiar la visibilidad del precio o el envío gratis sin el
  permiso de modificar precios son rechazados por el servidor y registrados como evento de
  seguridad, aunque se eviten los controles de la interfaz.
- **SC-003**: El 100% de los cambios de visibilidad del precio, de envío gratis y de tipo de
  producto tienen su entrada de bitácora, y 0 quedan aplicados sin ella o con una entrada sin su
  cambio.
- **SC-004**: El 100% de los intentos de leer o modificar categorías, secciones o datos de esta
  feature de otro inquilino son denegados.
- **SC-005**: El 100% de los GTIN con dígito verificador incorrecto o longitud inválida son
  rechazados, y el 100% de los válidos son aceptados.
- **SC-006**: En un comercio con 10.000 variantes y 300 categorías, el 95% de los filtros del
  catálogo por categoría, etiqueta o marca devuelven resultados en menos de 1 segundo.
- **SC-007**: Una acción masiva sobre 100 productos (asignar una categoría, o activar el envío
  gratis) se completa en menos de 10 segundos, o no se aplica a ninguno.
- **SC-008**: El 100% de las vistas nuevas o ampliadas por esta feature cumplen los criterios de
  carga, accesibilidad y diseño móvil de la 001 (SC-009, SC-012 y SC-014 de la 001).
- **SC-011**: 0 secciones superan los 40 productos en ningún comercio, verificado también con
  agregados simultáneos y con acciones masivas.

### Objetivos de producto

Se verifican con pruebas de usuario y no bloquean el despliegue.

- **SC-009**: Un Propietario completa la ficha de tienda de un producto existente —URL, datos para
  buscadores, categoría, marca, tipo y peso— en menos de 3 minutos, sin ayuda.
- **SC-010**: Un Propietario arma un árbol de 10 categorías en dos niveles y asigna 30 productos en
  menos de 10 minutos, sin ayuda.

## Fuera de Alcance

- La tienda pública: cómo se muestran las categorías, las secciones destacadas, el
  video, el precio oculto o el envío gratis al comprador, y las redirecciones de URL anteriores.
  Esta feature registra los datos para que la tienda futura los use.
- Cotización y cálculo de envíos, transportadoras y zonas. El peso y las dimensiones se registran
  para que una feature futura cotice.
- Entrega de productos digitales (archivos, licencias, enlaces de descarga).
- Inventario por ubicación, tablas de precio, importación y exportación masiva, carrito y pedidos.
- Publicación o sincronización con catálogos externos. MPN, GTIN, rango de edad y género se
  registran para una feature futura que publique.
- **Plantillas de presentación del producto**: dependen del tema de la tienda, que todavía no
  existe. Se especifican con la tienda pública.
- Secciones destacadas distintas de Destacados y Ofertas, propias del comercio, u ordenar los
  productos dentro de una sección: el orden lo decide la tienda pública.
- Datos para buscadores de las categorías (título y descripción propios) y reglas automáticas de
  pertenencia a categorías ("todo lo de la marca X").
- Localización: unidades distintas de las métricas, traducciones de la ficha y formatos regionales.

## Assumptions

- **Tope de 160 caracteres para la descripción para buscadores** (FR-009): es lo que Google muestra
  de forma fiable y el tope que el comerciante ve mientras escribe en el panel de administración de
  referencia, con su contador "0/160".
- **Unidades**: el peso se registra en gramos y las dimensiones en milímetros, como enteros, y el
  panel los presenta en kilogramos y centímetros. Igual que los importes en la 001, no es
  localización: es evitar decimales en datos que después se usan para cotizar.
- **Plataformas de video admitidas**: YouTube y Vimeo. La lista se puede ampliar en la fase de plan
  sin cambiar los requisitos. El panel no verifica que el video siga disponible.
- **Envío gratis y visibilidad del precio son decisiones de precio**: cambian lo que el comprador
  ve o paga, y la constitución agrupa el envío gratuito con los descuentos (principio III). Por eso
  exigen el permiso de modificar precios y quedan en la bitácora, aunque no sean un importe.
- **El envío gratis es incondicional**: aplica al producto sin mínimos ni zonas. Los envíos gratis
  condicionados pertenecen al motor de descuentos, fuera de alcance.
- **MPN, rango de edad y género son del producto**, como pide la descripción, y no de cada
  variante. Si un catálogo externo los exige por variante, se resuelve en la feature que publique.
- **Los valores de rango de edad y género** siguen las listas cerradas que usan los principales
  catálogos de anuncios, para no tener que traducirlos al publicar.
- **Topes**: 3 niveles de categoría, 20 categorías por producto, 30 etiquetas por producto. Son
  límites de producto, ajustables en el plan si la experiencia lo pide.
- **El GTIN se reserva al archivar**, igual que el SKU (001) y la URL amigable (FR-005): los tres
  identificadores siguen una sola regla, y así desarchivar nunca choca con un código que otra
  variante tomó mientras tanto. Quien archiva un producto y lo vuelve a cargar quita el GTIN de la
  variante archivada para reusarlo (FR-030).
- **La categoría tiene visibilidad propia y nada más**: no tiene estados de publicación como el
  producto. Qué hace la tienda con una categoría oculta —omitirla del menú, responder 404 en su URL,
  o mostrarla solo por enlace directo— se decide con la tienda pública.
- **Las secciones y su tope vienen del panel de administración de referencia** que aportó el
  negocio: Destacados y Ofertas, 40 productos cada una. El tope es por comercio y por sección.
- **Rechazar en vez de desplazar** al superar el tope: es predecible, y ningún producto sale de una
  sección sin que una persona lo decida. El único caso en que sale solo es el archivado (FR-028),
  porque un producto archivado no se ofrece.
- **Todo o nada también con productos digitales en el envío gratis masivo** (FR-029): acá aplicar
  en parte no daría un resultado incorrecto —a diferencia de los permisos y del tope de secciones,
  donde sí—, pero una sola regla para toda acción masiva es más predecible que tres reglas con
  matices. El rechazo ofrece quitar los digitales y reintentar para que la fricción sea mínima. Si
  en la práctica resulta alta, este es el primer caso a revisar.
- **Productos existentes**: se completan con los valores por defecto de los casos límite, sin
  intervención del comercio y sin cambiar su estado.

## Alineación con la Constitución

| Principio | Cobertura en esta especificación |
|---|---|
| I. Catálogo jerárquico con variantes | Categorías en árbol (FR-019 a FR-025); datos propios por variante (FR-015, FR-030) sobre el modelo de variantes de la 001 |
| II. Sincronización atómica de existencias | Sin cambios: esta feature no toca existencias |
| III. Motor de descuentos flexibles | Fuera de alcance. El envío gratis de esta feature es incondicional y por producto; el condicionado queda para el motor |
| IV. Desacoplamiento de recaudo y logística | Peso y dimensiones se registran sin atarse a ninguna transportadora (FR-014, FR-015) |
| V. Analíticas en tiempo real | Fuera de alcance |
| VI. RBAC jerárquico y mínimo privilegio | FR-001 a FR-004: sin permisos nuevos; visibilidad del precio y envío gratis bajo el permiso de precios, verificado en el servidor |
| VII. Trazabilidad inmutable | FR-032 y FR-033: condiciones de venta —visibilidad del precio, envío gratis y tipo de producto— en la bitácora, con la atomicidad de la 001 |
| VIII. Optimización de carga percibida | FR-034; SC-006, SC-008 |
| IX. Enfoque mobile-first | FR-034; SC-008 |
| X. Regla de garantía automática | Los criterios bajo *Criterios verificables automáticamente* son compuertas antes de producción; SC-009 y SC-010 se verifican con pruebas de usuario |
