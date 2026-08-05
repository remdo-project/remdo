import type { ServerAuth, ServerAuthUser } from '#server/auth/auth';

export const STABLE_AUTH_USERS = {
  alice: {
    email: 'alice@example.test',
    name: 'Alice',
    password: 'alice-password-1234',
  },
  bob: {
    email: 'bob@example.test',
    name: 'Bob',
    password: 'bob-password-1234',
  },
} as const;

export type StableAuthUser = (typeof STABLE_AUTH_USERS)[keyof typeof STABLE_AUTH_USERS];

export interface RestoredStableAuthUser {
  account: ServerAuthUser;
  definition: StableAuthUser;
}

async function setCredentialPassword(auth: ServerAuth, userId: string, password: string): Promise<void> {
  const context = await auth.auth.$context;
  const hashedPassword = await context.password.hash(password);
  const credentialAccount = (await context.internalAdapter.findAccounts(userId))
    .find((account) => account.providerId === 'credential');
  if (credentialAccount) {
    await context.internalAdapter.updatePassword(userId, hashedPassword);
    return;
  }
  await context.internalAdapter.createAccount({
    accountId: userId,
    password: hashedPassword,
    providerId: 'credential',
    userId,
  });
}

/** Restore the persistent development identities without replacing their user records. */
export async function restoreStableDevUsers(auth: ServerAuth): Promise<RestoredStableAuthUser[]> {
  const restored: RestoredStableAuthUser[] = [];
  for (const user of Object.values(STABLE_AUTH_USERS)) {
    let account = await auth.findUserByEmail(user.email);
    if (!account) {
      const response = await auth.createUser(user, new Headers());
      if (!response.ok) {
        throw new Error(`Failed to create ${user.email}.`);
      }
      account = await auth.findUserByEmail(user.email);
      if (!account) {
        throw new Error(`User ${user.email} not found after creation.`);
      }
    } else {
      await setCredentialPassword(auth, account.id, user.password);
    }
    restored.push({ account, definition: user });
  }
  return restored;
}
