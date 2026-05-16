import type { ListedDocument } from '@/documents/user-config-notes';
import * as Y from 'yjs';

type IdKeyedMapValues = Readonly<Record<string, unknown> & { id: string }>;

interface IdKeyedMapArrayProjectionOptions<T> {
  valuesOf: (item: T) => IdKeyedMapValues;
}

function createMapEntry(values: IdKeyedMapValues): Y.Map<unknown> {
  const entry = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(values)) {
    entry.set(key, value);
  }
  return entry;
}

function readMapId(entry: Y.Map<unknown>): string | null {
  const value = entry.get('id');
  return typeof value === 'string' ? value : null;
}

function writeMapEntry(entry: Y.Map<unknown>, values: IdKeyedMapValues): void {
  const nextKeys = new Set(Object.keys(values));

  for (const key of entry.keys()) {
    if (!nextKeys.has(key)) {
      entry.delete(key);
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (entry.get(key) !== value) {
      entry.set(key, value);
    }
  }
}

function syncIdKeyedMapArray<T>(
  array: Y.Array<Y.Map<unknown>>,
  items: readonly T[],
  { valuesOf }: IdKeyedMapArrayProjectionOptions<T>,
): void {
  const existingEntries = array.toArray();
  const existingKeys = existingEntries.map(readMapId);
  const nextValues = items.map(valuesOf);
  const nextKeys = nextValues.map((values) => values.id);

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < existingKeys.length
    && commonPrefixLength < nextKeys.length
    && existingKeys[commonPrefixLength] === nextKeys[commonPrefixLength]
  ) {
    writeMapEntry(existingEntries[commonPrefixLength]!, nextValues[commonPrefixLength]!);
    commonPrefixLength += 1;
  }

  let commonSuffixLength = 0;
  while (
    commonSuffixLength < existingKeys.length - commonPrefixLength
    && commonSuffixLength < nextKeys.length - commonPrefixLength
    && existingKeys[existingKeys.length - commonSuffixLength - 1]
      === nextKeys[nextKeys.length - commonSuffixLength - 1]
  ) {
    const existingIndex = existingKeys.length - commonSuffixLength - 1;
    const nextIndex = nextKeys.length - commonSuffixLength - 1;
    writeMapEntry(existingEntries[existingIndex]!, nextValues[nextIndex]!);
    commonSuffixLength += 1;
  }

  const deleteCount = existingKeys.length - commonPrefixLength - commonSuffixLength;
  if (deleteCount > 0) {
    array.delete(commonPrefixLength, deleteCount);
  }

  const insertValues = nextValues.slice(commonPrefixLength, nextKeys.length - commonSuffixLength);
  if (insertValues.length > 0) {
    array.insert(commonPrefixLength, insertValues.map(createMapEntry));
  }
}

export function syncListedDocumentsMapArray(
  array: Y.Array<Y.Map<unknown>>,
  documents: readonly ListedDocument[],
): void {
  syncIdKeyedMapArray(array, documents, {
    valuesOf: (document) => ({
      id: document.id,
      title: document.title,
    }),
  });
}
