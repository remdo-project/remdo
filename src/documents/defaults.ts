import { createUserConfigRootNote } from './user-config-notes';
export const DEFAULT_USER_DOCUMENT = { id: 'main', title: 'Main' } as const;

export function createDefaultUserConfig() {
  return createUserConfigRootNote([DEFAULT_USER_DOCUMENT]);
}
