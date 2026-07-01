import type { DocumentAccessView } from './access';

export interface CurrentUserBootstrap {
  homeDocumentId: string;
  userDataDocumentId: string;
  // The signed-in user's admin role (null when not an admin). Drives admin-UI
  // rendering only; authorization is always enforced server-side.
  role: string | null;
  // Whether the server allows open signup. Gates the login-page admin link.
  publicServer: boolean;
}

export interface UserDocument {
  access?: readonly DocumentAccessView[];
  id: string;
  shareable?: boolean;
  title: string;
}
