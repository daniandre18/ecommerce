# Spec 007 — Usuarios y perfiles de permisos

**Estado:** borrador · **Fase:** 6 · **Evidencia:** `[OBS]` — catálogo de permisos recorrido completo en el admin de referencia

## Objetivo

Permitir que el dueño de una tienda delegue trabajo sin ceder control, mediante perfiles que limitan lo que cada colaborador puede ver y hacer.

## Caso que origina la spec

Un cliente real necesita un perfil que pueda **editar productos sin poder modificar precios**. El admin de referencia resuelve exactamente eso: `Editar precios` es un permiso independiente de `Gestión de productos`. Eso confirma el nivel de granularidad: no alcanza con roles de grano grueso, el permiso tiene que separar operaciones dentro de una misma entidad.

---

## Catálogo de permisos observado

El admin de referencia agrupa **57 permisos en 9 grupos**, más un interruptor maestro `Acceso de administrador` que libera todas las secciones. Los grupos y sus cantidades: Gestión de datos (1), Ventas (11), Productos (12), Clientes (3), Canales de venta (15), Aplicaciones (1), Configuración (11), Mi cuenta (2), Marketing (1).

### Productos — 12 permisos `[OBS]`

```
Ver productos (solo lectura)
Gestión de productos
Exportar e importar productos
Editar stock                                           ← independiente
Editar precios                                         ← independiente
Crear tablas de precio
Configurar pagos y envíos de tablas de precio
Compartir link de auto-registro de las tablas de precio
Configurar clientes de tablas de precio
Configurar estado de tablas de precio
Editar tablas de precio
Importar CSV en las tablas de precio
```

Ocho de los doce permisos son de tablas de precio. Eso dice que la tabla de precios **no es un descuento porcentual**: tiene estado propio, clientes asignados, configuración de pagos y envíos propia, y un link de auto-registro para que un mayorista se dé de alta solo. Es un canal B2B completo, y así hay que modelarlo (ver Spec 002).

### Ventas — 11 permisos `[OBS]`

```
Ver pedidos (solo lectura)          Cancelar ventas
Gestión de ventas                   Hacer reembolsos de ventas
Exportar lista de ventas            Reabrir ventas
Marcar pagos como recibidos         Crear y gestionar pedidos manuales
Marcar como empaquetadas            Gestionar carritos abandonados
Imprimir etiquetas de envío
```

Cada transición sensible de la máquina de estados es su propio permiso. `Reabrir ventas` confirma que el pedido tiene una dimensión abierto/cerrado separada del pago y del cumplimiento (Spec 004).

### Clientes — 3 permisos `[OBS]`

```
Ver clientes (solo lectura)
Gestión de clientes
Exportar lista de clientes
```

Exportar es permiso aparte de gestionar: la exfiltración masiva de la base de clientes se controla por separado de la edición. Conviene copiarlo.

### Configuración — 11 permisos `[OBS]`

```
Gestionar medios de pago            Gestionar códigos externos
Ver envíos (solo lectura)           Gestionar dominios
Gestión de envíos                   Configurar idiomas y monedas
Gestionar centros de distribución   Gestionar redirecciones 301
Configurar e-mails automáticos      Gestionar usuarios y roles
Configurar opciones de checkout
```

### Patrón transversal

Donde hay datos de negocio, el catálogo separa **ver (solo lectura)** de **gestionar**, y saca aparte las acciones de riesgo: exportar, editar precios, editar stock, reembolsar, cancelar, reabrir. Ese es el patrón a replicar, no la lista literal.

---

## Historias de usuario

1. Como dueño, invito a un colaborador y le asigno un perfil.
2. Como dueño, creo un perfil que edita productos pero no toca precios ni stock.
3. Como dueño, doy a un empleado acceso a pedidos sin permitirle reembolsar ni cancelar.
4. Como dueño, impido que alguien exporte la base de clientes aunque pueda editarlos.
5. Como dueño, reviso qué hizo cada usuario en la tienda.
6. Como dueño, revoco el acceso de un colaborador que deja el equipo.

## Requisitos funcionales

### Perfiles y permisos
- **FR-601** El sistema debe traer perfiles predefinidos, incluido uno equivalente a `Administrador principal` con acceso total. `[OBS]`
- **FR-602** El inquilino debe poder crear perfiles propios combinando permisos, con nombre de hasta 100 caracteres. `[OBS]`
- **FR-603** Los permisos deben agruparse por área y presentarse con el contador de seleccionados sobre el total. `[OBS]`
- **FR-604** Debe existir un interruptor de acceso total que libere todas las secciones. `[OBS]`
- **FR-605** Para cada entidad de negocio debe existir un permiso de solo lectura separado del de gestión. `[OBS]`
- **FR-606** **`Editar precios` debe ser un permiso independiente de `Gestión de productos`.** `[OBS]` Es el requisito que origina esta spec.
- **FR-607** `Editar stock` debe ser un permiso independiente. `[OBS]`
- **FR-608** Exportar listas (clientes, ventas, productos) debe ser permiso aparte del de gestión. `[OBS]`
- **FR-609** Las transiciones de riesgo del pedido deben ser permisos independientes: marcar pago recibido, marcar empaquetado, cancelar, reembolsar, reabrir. `[OBS]`
- **FR-610** La administración de tablas de precio debe desglosarse en permisos separados para creación, edición, estado, clientes asignados, pagos y envíos, e importación. `[OBS]`
- **FR-611** El perfil con acceso total no debe poder eliminarse ni quedar vacante: toda tienda tiene al menos un administrador principal.
- **FR-612** Un usuario no debe poder ampliar sus propios permisos ni cambiar su propio perfil.
- **FR-613** Los permisos deben aplicarse en el servidor. Ocultar un campo en la interfaz no es un control de acceso.
- **FR-614** La interfaz debe reflejar los permisos del usuario: lo que no puede hacer no se muestra habilitado.
- **FR-615** El cambio de perfil debe surtir efecto sin requerir que el usuario vuelva a iniciar sesión manualmente.
- **FR-616** Un perfil debe poder asignarse a varios usuarios, y la pantalla de perfiles debe mostrar cuántos usuarios tiene cada uno. `[OBS]`

### Ciclo de vida del acceso
- **FR-620** La invitación debe hacerse por e-mail y requerir aceptación.
- **FR-621** El acceso debe poder revocarse de inmediato, invalidando las sesiones activas de ese usuario en esa tienda.
- **FR-622** El sistema debe permitir suspender un acceso sin eliminar la membresía ni el historial de acciones del usuario.
- **FR-623** El usuario debe poder ver sus sesiones activas y cerrarlas. `[OBS: "Sesiones y dispositivos"]`
- **FR-624** El sistema debe soportar verificación en dos pasos por usuario, y su estado debe ser visible en la lista de usuarios. `[OBS: la lista tiene una columna "Verificación en 2 pasos" con valor "Desactivada"]`
- **FR-625** El inquilino debe poder exigir verificación en dos pasos a los perfiles con permisos de configuración o de pagos. `[NEEDS CLARIFICATION: el admin de referencia la deja opcional por usuario; conviene decidir si la nuestra la fuerza]`

### Auditoría
- **FR-630** Toda acción que modifique datos de negocio debe registrarse con usuario, acción, entidad afectada, momento y valores anterior y nuevo.
- **FR-631** La bitácora debe ser inmutable y consultable por el dueño, con filtro por usuario y rango de fechas.
- **FR-632** Todo intento de acción rechazado por permisos debe registrarse.

## Entidades clave

- **Role** — nombre, conjunto de permisos, si es predefinido o propio del inquilino, contador de usuarios.
- **Permission** — clave estable, grupo, etiqueta. El catálogo es dato, no código: agregar un permiso no debe exigir desplegar.
- **Membership** — usuario, inquilino, rol, estado, 2FA. Definida en Spec 001.
- **AuditLog** — registro inmutable de acciones.
- **Invitation** — e-mail, rol propuesto, estado, vencimiento.

## Criterios de aceptación

- Un usuario con `Gestión de productos` y sin `Editar precios` guarda cambios de nombre y descripción, y recibe permiso denegado al intentar cambiar el precio **por petición directa al backend**, no solo por campo deshabilitado en la interfaz.
- El mismo usuario, sin `Editar stock`, no puede alterar el inventario por ninguna vía.
- Un usuario con `Gestión de clientes` y sin `Exportar lista de clientes` no obtiene la exportación.
- Un usuario con `Gestión de ventas` y sin `Hacer reembolsos` no puede reembolsar.
- Revocar un acceso impide la siguiente operación del usuario revocado sin esperar a que expire su token.
- Un usuario no puede asignarse a sí mismo el perfil de acceso total.
- Cada cambio de precio queda en la bitácora con el valor anterior y el nuevo.

## Fuera de alcance

Inicio de sesión único corporativo, permisos por centro de distribución, y aprobaciones en dos pasos.
