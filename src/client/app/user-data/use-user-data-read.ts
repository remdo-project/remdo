import { NoteUnavailableError } from '#note-sdk';
import type { UserDataNote } from '#note-sdk';
import { useUserData, useUserDataStatus } from './user-data';

/** Reads account data with its loading, error, and retry state; unavailable data is undefined. */
export function useUserDataRead<T>(read: (userData: UserDataNote) => T) {
  const userData = useUserData();
  const status = useUserDataStatus();
  let data: T | undefined;
  try {
    data = read(userData);
  } catch (error) {
    if (!(error instanceof NoteUnavailableError)) throw error;
  }
  return { userData, data, ...status };
}
