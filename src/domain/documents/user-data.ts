import type { DocumentAccessView } from './access';

export interface UserDocument {
  access?: readonly DocumentAccessView[];
  id: string;
  shareable?: boolean;
  title: string;
}
