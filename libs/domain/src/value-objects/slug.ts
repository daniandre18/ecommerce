import type { Branded, ProductId } from './ids';

/**
 * URL amigable: `[a-z0-9]+(-[a-z0-9]+)*`, de 1 a 100 caracteres (FR-006). Es además el id del
 * documento de `slugIndex`, por eso no admite `/`. Solo se obtiene de `slug()`, que valida, o de
 * las funciones de este archivo, que producen siempre una válida.
 */
export type Slug = Branded<string, 'Slug'>;

export const MAX_SLUG_LENGTH = 100;

const FORM = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class InvalidSlugError extends Error {
  override readonly name = 'InvalidSlugError';
}

/** Valida una URL amigable ya formada. No normaliza: para eso está `slugify`. */
export function slug(value: string): Slug {
  if (value.length > MAX_SLUG_LENGTH || !FORM.test(value)) {
    throw new InvalidSlugError(`URL amigable inválida: ${JSON.stringify(value)}`);
  }
  return value as Slug;
}

/**
 * La URL amigable de un nombre (FR-006), y la normalización de una que escribe el comercio
 * (FR-007): minúsculas, sin acentos, palabras unidas por guiones, a lo sumo 100 caracteres.
 * Devuelve `null` si el nombre no tiene ninguna letra ni número ("★★★").
 */
export function slugify(name: string): Slug | null {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
  return words.length === 0 ? null : slug(truncate(words.join('-'), MAX_SLUG_LENGTH));
}

/**
 * El intento `n` de la URL a partir de una base: el primero es la base, los siguientes llevan el
 * sufijo `-2`, `-3`… (FR-006). Recorta la base si hace falta para que el sufijo entre.
 */
export function nextSlugCandidate(base: Slug, n: number): Slug {
  return n <= 1 ? base : suffixedSlug(base, String(n));
}

/**
 * La base con un sufijo, normalizado con las mismas reglas. Recorta la base si hace falta para que
 * el sufijo entre: lo que distingue a la URL es el sufijo, no el final de la base.
 */
export function suffixedSlug(base: Slug, rawSuffix: string): Slug {
  const suffix = `-${slugify(rawSuffix) ?? 'x'}`;
  return slug(truncate(base, MAX_SLUG_LENGTH - suffix.length) + suffix);
}

/**
 * La URL de respaldo de un producto cuyo nombre no produce ninguna (FR-006): derivada de su id,
 * para que sea única de entrada, y marcada para que el comercio la reemplace.
 */
export function fallbackSlug(id: ProductId): Slug {
  const fromId = slugify(id.slice(0, 8));
  return slug(fromId ? `producto-${fromId}` : 'producto');
}

/**
 * Corta sin dejar un guion al final: el resultado sigue teniendo la forma de una URL amigable. Lo
 * que llega ya tiene los guiones de a uno, así que a lo sumo queda uno colgando.
 */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).replace(/-$/, '');
}
