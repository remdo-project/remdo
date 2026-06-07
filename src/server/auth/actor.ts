import type { ServerAuth } from './auth';

export interface Actor {
  type: 'local-user';
  userId: string;
  email?: string;
  name?: string;
}

export async function resolveActor(request: Request, auth: ServerAuth): Promise<Actor | null> {
  const session = await auth.getSession(request.headers);
  if (!session?.user) {
    return null;
  }

  return {
    type: 'local-user',
    userId: session.user.id,
    email: session.user.email || undefined,
    name: session.user.name || undefined,
  };
}
