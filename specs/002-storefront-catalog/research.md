# Research: Catálogo de Cara a la Tienda

Decisiones de modelo fijadas antes de `/speckit-plan`. El plan las incorpora como decisiones
tomadas, no las reabre.

## 1. Visibilidad de categorías: la efectiva se deriva, nunca se propaga (FR-021a)

**Decisión**: cada categoría guarda solo su **propia** visibilidad. La visibilidad **efectiva**
—la que ve la tienda y la que el panel señala— se calcula a partir de la categoría y sus ancestros:
una categoría está oculta de hecho si ella o cualquiera de sus ancestros está oculta. Ocultar un
padre **no escribe nada** en sus descendientes.

**Por qué**: la implementación ingenua, que copia el valor a los descendientes al ocultar un padre,
rompe en tres frentes:

1. **Mover una rama** obligaría a reescribir todos sus descendientes para recalcular lo copiado.
2. **Dos operaciones concurrentes** sobre la misma rama (ocultar el padre mientras se mueve o se
   muestra un hijo) dejarían el árbol inconsistente.
3. **Al volver a mostrar el padre** se perdería qué hijos estaban ocultos por decisión propia y
   cuáles solo por herencia.

**Requisitos que lo exigen**: FR-021a ("ocultar y volver a mostrar deja a cada descendiente con la
visibilidad que él mismo tenía"; "mover una categoría no altera la visibilidad propia de ninguna") y
el caso límite "Mover una categoría visible dentro de una oculta", que distingue en el panel "oculta
por sí misma" de "oculta por su categoría padre".

**Alternativa descartada**: propagar el valor a los descendientes. Más simple de consultar, pero
incumple FR-021a en los tres frentes de arriba.

**A resolver en el plan**: cómo se calcula la efectiva sin leer el árbol entero en cada consulta.
Con tres niveles como máximo (FR-019) alcanza con conocer los ancestros de cada categoría.
