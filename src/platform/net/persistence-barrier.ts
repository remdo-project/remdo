/**
 * Stateless messages carrying the collaboration persistence barrier between a
 * client and the hub over an authorized document connection.
 */
export type PersistenceMessage =
  | { type: 'persist'; id: number }
  | { type: 'persisted'; id: number }
  | { type: 'persist-failed'; id: number };

const TYPES = new Set(['persist', 'persisted', 'persist-failed']);

export function encodePersistenceMessage(message: PersistenceMessage): string {
  return JSON.stringify({ remdo: message });
}

export function decodePersistenceMessage(payload: string): PersistenceMessage | null {
  try {
    const { remdo } = JSON.parse(payload) as { remdo?: { type?: unknown; id?: unknown } };
    if (remdo && typeof remdo.type === 'string' && TYPES.has(remdo.type) && Number.isInteger(remdo.id)) {
      return remdo as PersistenceMessage;
    }
  } catch {
    // Other stateless payloads are not persistence messages.
  }
  return null;
}
