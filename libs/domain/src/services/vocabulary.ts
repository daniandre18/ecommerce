import { MAX_TAG_LENGTH, MAX_TAGS } from '../entities/product';
import { normalizeName } from './normalize-name';

/** Un término de etiqueta o de marca: la forma registrada y la que se compara. */
export interface Term {
  readonly label: string;
  readonly normalized: string;
}

export interface VocabularyEntry {
  /** La primera forma registrada: "Algodón" y "algodon" se muestran como la primera que llegó. */
  readonly label: string;
  /** Cuántos productos lo usan; al llegar a cero, el término se poda. */
  readonly count: number;
}

export type VocabularyEntries = Readonly<Record<string, VocabularyEntry>>;

/** Etiquetas y marcas del comercio, para sugerir y para unificar la forma (FR-011, FR-012). */
export interface Vocabulary {
  readonly tags: VocabularyEntries;
  readonly brands: VocabularyEntries;
}

export const emptyVocabulary = (): Vocabulary => ({ tags: {}, brands: {} });

export class TagLimitError extends Error {
  override readonly name = 'TagLimitError';
}

/**
 * Las etiquetas de un producto (FR-011): sin vacías, sin repetidas —comparadas sin mayúsculas ni
 * acentos—, hasta 30, de hasta 40 caracteres cada una. Conserva la primera forma escrita.
 */
export function normalizeTags(raw: readonly string[]): { tags: string[]; normalized: string[] } {
  const seen = new Map<string, string>();
  for (const value of raw) {
    const label = value.trim();
    if (label === '') continue;
    if (label.length > MAX_TAG_LENGTH) {
      throw new TagLimitError(`Una etiqueta admite hasta ${MAX_TAG_LENGTH} caracteres: ${JSON.stringify(label)}`);
    }
    const normalized = normalizeName(label);
    if (!seen.has(normalized)) seen.set(normalized, label);
  }
  if (seen.size > MAX_TAGS) throw new TagLimitError(`Un producto admite hasta ${MAX_TAGS} etiquetas`);
  return { tags: [...seen.values()], normalized: [...seen.keys()] };
}

/**
 * La forma con que se guarda un término: la ya registrada en el comercio si existe, o la escrita si
 * es nueva. Así "NIKE" se guarda como "Nike" si "Nike" llegó primero (caso límite del spec).
 */
export function canonicalTerm(entries: VocabularyEntries, written: string): Term {
  const label = written.trim();
  const normalized = normalizeName(label);
  return { label: entries[normalized]?.label ?? label, normalized };
}

/**
 * Ajusta el vocabulario a lo que cambió en un producto: suma los términos que aparecen, resta los
 * que se van y poda los que quedan en cero. Lo que no cambió no toca el conteo.
 */
export function adjustVocabulary(
  vocabulary: Vocabulary,
  kind: keyof Vocabulary,
  before: readonly Term[],
  after: readonly Term[],
): Vocabulary {
  const entries: Record<string, VocabularyEntry> = { ...vocabulary[kind] };
  const was = new Set(before.map((term) => term.normalized));
  const now = new Set(after.map((term) => term.normalized));
  for (const term of after) {
    if (was.has(term.normalized)) continue;
    const existing = entries[term.normalized];
    entries[term.normalized] = { label: existing?.label ?? term.label, count: (existing?.count ?? 0) + 1 };
  }
  for (const normalized of was) {
    if (now.has(normalized)) continue;
    const existing = entries[normalized];
    if (!existing) continue;
    if (existing.count <= 1) delete entries[normalized];
    else entries[normalized] = { ...existing, count: existing.count - 1 };
  }
  return { ...vocabulary, [kind]: entries };
}

/** Las formas registradas que empiezan con lo escrito, sin acentos, las más usadas primero. */
export function suggestTerms(entries: VocabularyEntries, written: string, limit = 8): string[] {
  const prefix = normalizeName(written);
  if (prefix === '') return [];
  return Object.entries(entries)
    .filter(([normalized]) => normalized.startsWith(prefix))
    .sort(([a, x], [b, y]) => y.count - x.count || a.localeCompare(b))
    .slice(0, limit)
    .map(([, entry]) => entry.label);
}
