import type { VocabularyRepository } from '@ecommerce/application';
import { emptyVocabulary, type Vocabulary, type VocabularyEntries } from '@ecommerce/domain';
import type { Transaction } from 'firebase-admin/firestore';
import type { TenantPaths } from '../tenant-paths';

/** Etiquetas y marcas del comercio, en `storefront/vocabulary` (research §7 de la 002). */
export function vocabularyRepository(t: Transaction, paths: TenantPaths): VocabularyRepository {
  const ref = paths.vocabularyDoc();
  return {
    get: async () => {
      const data = (await t.get(ref)).data();
      return data ? vocabularyFromDoc(data) : emptyVocabulary();
    },
    save: async (vocabulary) => {
      t.set(ref, { tags: { ...vocabulary.tags }, brands: { ...vocabulary.brands } });
    },
  };
}

export function vocabularyFromDoc(d: Readonly<Record<string, unknown>>): Vocabulary {
  return { tags: entriesFromDoc(d['tags']), brands: entriesFromDoc(d['brands']) };
}

function entriesFromDoc(value: unknown): VocabularyEntries {
  const entries = (value ?? {}) as Record<string, { label?: unknown; count?: unknown }>;
  return Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, { label: String(entry.label), count: Number(entry.count) }]));
}
