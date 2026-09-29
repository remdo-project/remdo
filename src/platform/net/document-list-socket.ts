/**
 * The hub's per-account document-list change socket, shared by the hub and the
 * client that listens on it.
 */
export const DOCUMENT_LIST_PATH = '/collaboration?document-list';
export const DOCUMENT_LIST_CHANGED = 'changed';
// Browsers expose no WebSocket pings, so the hub's keepalive is a message the
// client can observe to detect a silently dropped connection.
export const DOCUMENT_LIST_KEEPALIVE = 'keepalive';
export const DOCUMENT_LIST_KEEPALIVE_INTERVAL_MS = 30_000;
export const DOCUMENT_LIST_SILENCE_LIMIT_MS = 75_000;
