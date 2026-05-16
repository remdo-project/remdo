import { getHomeDocumentId } from '@/documents/user-profile';
import { HOME_USER_DOCUMENT } from '@/documents/defaults';
import { createDocumentPath } from '@/routing';

function resolveExplicitReturnTo(search: string): string | null {
  const value = new URLSearchParams(search).get('next');
  if (typeof value === 'string' && value.startsWith('/')) {
    return value;
  }
  return null;
}

async function resolveHomeDocumentPath(): Promise<string> {
  return createDocumentPath(await getHomeDocumentId());
}

export async function resolvePostAuthPath(search: string): Promise<string> {
  return resolveExplicitReturnTo(search) ?? await resolveHomeDocumentPath();
}

export function resolveRememberedSessionFallbackPath(search: string): string {
  return resolveExplicitReturnTo(search) ?? createDocumentPath(HOME_USER_DOCUMENT.id);
}
