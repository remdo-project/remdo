import { hasRememberedSession, isLikelyFetchUnavailableError } from '#client/app/auth/client';
import { normalizeDocumentId } from '#domain/documents/ids';
import type { CurrentUserBootstrap } from '#domain/documents/user-data';
import {
  clearStoredCurrentUserBootstrap,
  readStoredCurrentUserBootstrap,
  writeStoredCurrentUserBootstrap,
} from './current-user-bootstrap-storage';

export type { CurrentUserBootstrap } from '#domain/documents/user-data';

let bootstrapPromise: Promise<CurrentUserBootstrap> | null = null;

export async function getCurrentUserBootstrap(): Promise<CurrentUserBootstrap> {
  bootstrapPromise ??= fetchCurrentUserBootstrap().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}

export async function getSourceCurrentUserBootstrap(sourceServerId: string): Promise<CurrentUserBootstrap> {
  const response = await fetch(`/api/current-user/source-servers/${
    encodeURIComponent(sourceServerId)
  }/current-user`, {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`Failed to load source current user bootstrap: ${response.status}`);
  }

  return parseCurrentUserBootstrap(await response.json() as Partial<CurrentUserBootstrap>);
}

export function clearCurrentUserBootstrapCache(): void {
  bootstrapPromise = null;
  clearStoredCurrentUserBootstrap();
}

export async function getHomeDocumentId(): Promise<string> {
  const bootstrap = await getCurrentUserBootstrap();
  return bootstrap.homeDocumentId;
}

async function fetchCurrentUserBootstrap(): Promise<CurrentUserBootstrap> {
  let response: Response;
  try {
    response = await fetch('/api/current-user', {
      credentials: 'same-origin',
    });
  } catch (error) {
    if (isLikelyFetchUnavailableError(error)) {
      const cachedBootstrap = readRememberedCachedCurrentUserBootstrap();
      if (cachedBootstrap) {
        return cachedBootstrap;
      }
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Failed to load current user bootstrap: ${response.status}`);
  }

  const body = await response.json() as Partial<CurrentUserBootstrap>;
  const bootstrap = parseCurrentUserBootstrap(body);
  writeCachedCurrentUserBootstrap(bootstrap);
  return bootstrap;
}

function parseCurrentUserBootstrap(body: Partial<CurrentUserBootstrap>): CurrentUserBootstrap {
  const userDataDocumentId = normalizeDocumentId(body.userDataDocumentId);
  const homeDocumentId = normalizeDocumentId(body.homeDocumentId);
  if (!userDataDocumentId || !homeDocumentId) {
    throw new TypeError('Current user bootstrap returned invalid document ids.');
  }
  return {
    homeDocumentId,
    userDataDocumentId,
    role: typeof body.role === 'string' ? body.role : null,
    publicServer: body.publicServer === true,
  };
}

function writeCachedCurrentUserBootstrap(bootstrap: CurrentUserBootstrap): void {
  writeStoredCurrentUserBootstrap(JSON.stringify(bootstrap));
}

export function getCachedCurrentUserBootstrap(): CurrentUserBootstrap | null {
  const rawBootstrap = readStoredCurrentUserBootstrap();
  if (!rawBootstrap) {
    return null;
  }

  try {
    return parseCurrentUserBootstrap(JSON.parse(rawBootstrap) as Partial<CurrentUserBootstrap>);
  } catch {
    clearStoredCurrentUserBootstrap();
    return null;
  }
}

function readRememberedCachedCurrentUserBootstrap(): CurrentUserBootstrap | null {
  if (!hasRememberedSession()) {
    return null;
  }
  return getCachedCurrentUserBootstrap();
}
