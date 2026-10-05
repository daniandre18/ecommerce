import type { Branded } from './ids';

/**
 * URL amigable: `[a-z0-9]+(-[a-z0-9]+)*`, de 1 a 100 caracteres (FR-006). Es además el id del
 * documento de `slugIndex`, por eso no admite `/`.
 *
 * Por ahora solo el tipo, para que el producto lo declare (T012). La factoría que valida y
 * `slugify` llegan con sus pruebas en T020 y T027 (Historia 1).
 */
export type Slug = Branded<string, 'Slug'>;
