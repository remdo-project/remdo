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

export interface CreatedStableAuthUser {
  account: ServerAuthUser;
  definition: StableAuthUser;
}

export async function createStableDevUsers(auth: ServerAuth): Promise<CreatedStableAuthUser[]> {
  const created: CreatedStableAuthUser[] = [];
  for (const user of Object.values(STABLE_AUTH_USERS)) {
    const response = await auth.createUser(user, new Headers());
    if (!response.ok) {
      throw new Error(`Failed to create ${user.email}.`);
    }
    const account = await auth.findUserByEmail(user.email);
    if (!account) {
      throw new Error(`User ${user.email} not found after creation.`);
    }
    created.push({ account, definition: user });
  }
  return created;
}
