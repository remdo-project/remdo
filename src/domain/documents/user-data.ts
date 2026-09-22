import type { DocumentAccessView } from './access';

/** Mirrors DOCUMENT_TITLE_MAX_LENGTH in backend/documents/models.py. */
export const DOCUMENT_TITLE_MAX_LENGTH = 500;

export interface UserDocument {
  access?: readonly DocumentAccessView[];
  id: string;
  shareable?: boolean;
  title: string;
}
