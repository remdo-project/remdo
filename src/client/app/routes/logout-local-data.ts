import { clearLocalUserData } from '#client/app/auth/local-data';
import { resetUserData } from '#client/app/documents/user-data';

export async function clearLocalLogoutData(): Promise<void> {
  resetUserData();
  await clearLocalUserData();
}
