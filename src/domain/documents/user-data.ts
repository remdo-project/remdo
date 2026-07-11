import type { DocumentAccessView } from './access';

export interface CurrentUserBootstrap {
  homeDocumentId: string;
  userDataDocumentId: string;
  // Whether the server allows open signup. Gates the login-page admin link.
  publicServer: boolean;
}

export interface UserDocument {
  access?: readonly DocumentAccessView[];
  id: string;
  shareable?: boolean;
  title: string;
}
