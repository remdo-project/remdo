import { createPath, resolvePath } from 'react-router-dom';
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

function resolveExplicitEntryPath(search: string, currentOrigin: string): string | null {
  const params = new URLSearchParams(search);
  const returnTo = resolvePostAuthTargetPath(params.get('next'), currentOrigin);
  if (returnTo === '/') {
    return null;
  }
  if (returnTo) {
    return returnTo;
  }

  const explicitDocId = normalizeDocumentId(params.get('doc'));
  return explicitDocId ? createDocumentPath(explicitDocId) : null;
}

export function resolvePostAuthPath(search: string, currentOrigin: string): string {
  return resolveExplicitEntryPath(search, currentOrigin) ?? '/';
}
