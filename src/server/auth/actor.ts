import type { Context } from 'hono';
import { HTTP_STATUS } from '#platform/http/status';
import type { ServerAuth, ServerAuthUser } from './auth';

export interface Actor {
  type: 'local-user';
  userId: string;
  email?: string;
  name?: string;
}

type ActorCredential = 'bearer' | 'session';

interface ActorResolution {
  actor: Actor;
  credential: ActorCredential;
}

function createActorResolution(user: ServerAuthUser, credential: ActorCredential): ActorResolution {
  return {
    actor: {
      type: 'local-user',
      userId: user.id,
      email: user.email || undefined,
      name: user.name || undefined,
    },
    credential,
  };
}

export async function resolveActorResolution(request: Request, auth: ServerAuth): Promise<ActorResolution | null> {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const bearerUser = await auth.resolveBearerUser(authorization);
    if (!bearerUser) {
      return null;
    }
    return createActorResolution(bearerUser, 'bearer');
  }

  const session = await auth.getSession(request.headers);
  if (!session?.user) {
    return null;
  }

  return createActorResolution(session.user, 'session');
}

export async function resolveActor(request: Request, auth: ServerAuth): Promise<Actor | null> {
  return (await resolveActorResolution(request, auth))?.actor ?? null;
}

/**
 * Resolves the request actor resolution or returns the shared 401 response used
 * by every authenticated route.
 */
export async function requireActorResolution(c: Context, auth: ServerAuth): Promise<ActorResolution | Response> {
  await auth.ensureReady();
  const actorResolution = await resolveActorResolution(c.req.raw, auth);
  if (!actorResolution) {
    return c.json({ error: 'Authentication required.' }, HTTP_STATUS.UNAUTHORIZED);
  }
  return actorResolution;
}

export async function requireActor(c: Context, auth: ServerAuth): Promise<Actor | Response> {
  const resolution = await requireActorResolution(c, auth);
  return resolution instanceof Response ? resolution : resolution.actor;
}
