import { createPath, resolvePath } from 'react-router-dom';
import { getHomeDocumentId } from '#client/app/documents/current-user-bootstrap';
import { createDocumentPath } from '#document-routes';
import { normalizeDocumentId } from '#domain/documents/ids';

export function createPostAuthNextSearch(request: Request): string {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams();
  searchParams.set('next', `${url.pathname}${url.search}`);
  return `?${searchParams.toString()}`;
}

export function resolvePostAuthTargetPath(value: string | null, currentOrigin: string): string | null {
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, currentOrigin);
  } catch {
    return null;
  }

  if (url.origin !== currentOrigin) {
    return null;
  }

  return createPath(resolvePath(`${url.pathname}${url.search}${url.hash}`, '/'));
}

function resolveExplicitReturnTo(search: string, currentOrigin: string): string | null {
  const value = new URLSearchParams(search).get('next');
  return resolvePostAuthTargetPath(value, currentOrigin);
}

async function resolveHomeDocumentPath(): Promise<string> {
  return createDocumentPath(await getHomeDocumentId());
}

export async function resolvePostAuthPath(search: string, currentOrigin: string): Promise<string> {
  const returnTo = resolveExplicitReturnTo(search, currentOrigin);
  if (returnTo) {
    return returnTo;
  }

  const explicitDocId = normalizeDocumentId(new URLSearchParams(search).get('doc'));
  return explicitDocId ? createDocumentPath(explicitDocId) : await resolveHomeDocumentPath();
}

export function resolveNextPathOrDefault(
  search: string,
  currentOrigin: string,
  defaultPath: string,
): string {
  return resolveExplicitReturnTo(search, currentOrigin) ?? defaultPath;
}
