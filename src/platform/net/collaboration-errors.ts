/** The collaboration server refused the document: it does not exist or the user cannot open it. */
export class DocumentAccessDeniedError extends Error {}

/** The collaboration connection could not be established or kept. */
export class CollaborationUnavailableError extends Error {}
