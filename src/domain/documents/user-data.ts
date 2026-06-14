import type { DocumentAccessView } from './access';

export interface CurrentUserBootstrap {
  homeDocumentId: string;
  userDataDocumentId: string;
}

export interface UserDocument {
  access?: readonly DocumentAccessView[];
  id: string;
  shareable?: boolean;
  title: string;
}
