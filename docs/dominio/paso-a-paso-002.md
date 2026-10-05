# Paso a paso — feature 002 en el IDE

Flujo de GitHub Spec Kit, el mismo con el que hiciste `001-catalog-rbac`.

---

## 0. Limpiar antes de empezar

```bash
cd ~/Documents/github/ecommerce
rm -f .git/index.lock          # lock huérfano, bórralo o git falla
git status
```

Debe mostrar solo `docs/dominio/` sin seguimiento.

---

## 1. Cerrar la 001 y volver a main

Estás en `docs/polish` con las 101 tareas completas. Mezcla y vuelve:

```bash
git checkout main
git merge docs/polish
git push
```

Si prefieres revisar por PR, abre el PR desde `docs/polish` y espera a mezclarlo antes de seguir. Lo importante es **no arrancar la 002 desde una rama de la 001**.

---

## 2. Commitear el material de dominio

```bash
git add docs/dominio
git commit -m "docs(dominio): análisis funcional del admin de referencia como material de consulta"
git push
```

Son nueve documentos de referencia más `siguiente-feature.md`. No son features: alimentan los inputs de Spec Kit.

---

## 3. Crear la spec

En Claude Code, dentro del proyecto:

```
/speckit.specify Catálogo de cara a la tienda. El comercio organiza sus productos en
categorías con subcategorías, y un producto puede estar en varias. Cada producto lleva
los datos que una tienda pública necesita para mostrarlo y para que lo encuentren:
título y descripción para buscadores, una URL amigable única dentro del inquilino que
se genera sola a partir del nombre y se puede editar, etiquetas de búsqueda y marca.
El producto declara si es físico o digital; el físico lleva peso y dimensiones, que son
los datos con los que después se cotiza un envío, y el digital no los pide. Cada
variante puede llevar código de barras GTIN además de su SKU, y su propio peso y
dimensiones cuando difieren de los del producto. El producto admite un video externo
junto a sus imágenes. El comercio decide por producto si el precio se muestra o se
oculta en la tienda, si ofrece envío gratis, en qué secciones destacadas aparece y con
qué plantilla se presenta. Para los catálogos externos el producto admite MPN, rango de
edad y género. Todo lo anterior respeta los permisos ya existentes: quien no puede
editar precios tampoco puede cambiar si el precio se muestra. Fuera de alcance: la
tienda pública en sí, inventario por ubicación, tablas de precio, importación masiva,
carrito, pedidos.
```

Spec Kit crea la rama y `specs/002-*/spec.md`.

---

## 4. Contrastar contra el dominio

Antes de clarificar, en el mismo chat:

```
Contrasta specs/002-*/spec.md con docs/dominio/002-catalogo-productos.md: FR-102 a
FR-112 (producto), FR-122 y FR-123 (variante), FR-142 (ocultar precio) y FR-145
(permiso de precio). Señala qué falta y qué sobra. También revisa que no contradiga
specs/001-catalog-rbac/spec.md, sobre todo en permisos y en estados del producto.
```

Este paso es el que aprovecha el análisis del admin. Sin él, la spec sale de lo que el modelo imagine de un catálogo.

---

## 5. Clarificar

```
/speckit.clarify
```

Las cinco que ya sabes que van a salir, con mi recomendación para que no te detengan:

| Pregunta | Sugerencia |
|---|---|
| Profundidad del árbol de categorías | Dos niveles: categoría y subcategoría. Cubre casi todo comercio y mantiene simple el breadcrumb |
| URL amigable al renombrar un producto publicado | La URL se mantiene; cambiarla es acción explícita y deja redirección. Si no, rompes enlaces compartidos |
| Peso y dimensiones: ¿producto o variante? | En el producto, con la variante sobrescribiendo cuando difiere |
| Ocultar el precio: ¿solo presentación? | No: también bloquea agregar al carrito. Si no, el comprador se entera del precio en el checkout |
| Producto digital | Solo omite peso y envío. La entrega de archivo es otra feature |

Son sugerencias; decide tú. Lo que importa es que ninguna quede sin responder.

---

## 6. Checklist de requisitos

```
/speckit.checklist
```

Genera `specs/002-*/checklists/requirements.md`, como en la 001.

---

## 7. Plan y tareas

```
/speckit.plan
```

Revisa que respete la constitución, en especial el principio I —catálogo jerárquico— y el VI —permisos—, y que la categoría quede como entidad con aislamiento por inquilino, no como texto suelto en el producto.

```
/speckit.tasks
```

---

## 8. Analizar antes de implementar

```
/speckit.analyze
```

Cruza spec, plan y tareas buscando contradicciones. En la 001 valió la pena; acá más, porque la feature toca entidades que ya existen y están en producción de tu propio entorno.

---

## 9. Implementar

```
/speckit.implement
```

Tarea por tarea, verificando que las pruebas fallen antes de implementar lo que verifican, como en la 001.

---

## Criterio de salida de la feature

No está cerrada hasta que puedas demostrar:

1. Un producto clasificado en dos categorías aparece en ambas, y su subcategoría conserva el breadcrumb completo.
2. Renombrar un producto publicado **no** cambia su URL.
3. Dos productos con el mismo nombre obtienen URLs distintas, sin colisión.
4. Un usuario sin permiso de precios no puede cambiar si el precio se muestra — verificado con petición directa al backend.
5. Un producto digital no pide peso ni dimensiones y no ofrece envío gratis.
6. El catálogo existente sigue funcionando: ningún producto creado antes de esta feature queda inconsistente.

El punto 6 es el que más se olvida y el que más duele: ya tienes productos cargados.

---

## Nota sobre tu configuración

En `.claude/` conviven dos flujos distintos:

- `skills/speckit-*` — GitHub Spec Kit, el que usaste en la 001 y el de estos pasos
- `system-prompts/spec-workflow-starter.md` — otro flujo, estilo Kiro, que guarda en `.claude/specs/{feature}/requirements.md` + `design.md` + `tasks.md` con sub-agentes y jueces

Son incompatibles en estructura. Si ese system prompt llega a estar activo en tu sesión, va a querer llevarte por el camino de `requirements.md` y vas a terminar con dos árboles de specs. Conviene decidir cuál usas y archivar el otro.
