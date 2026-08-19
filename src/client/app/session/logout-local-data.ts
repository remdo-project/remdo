import { clearLocalUserData } from '#client/app/session/local-data';
import { resetUserData } from '#client/app/user-data/user-data';

export async function clearLocalLogoutData(): Promise<void> {
  resetUserData();
  await clearLocalUserData();
}
