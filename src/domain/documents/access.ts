export interface DocumentAccessView {
  documentId: string;
  email: string;
  granteeUserId: string;
  name: string | null;
}

export interface DocumentContactView {
  userId: string;
  email: string;
  name: string | null;
}
