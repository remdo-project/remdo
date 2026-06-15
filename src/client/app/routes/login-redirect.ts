import { isOAuthAuthorizeSearch } from './oauth-authorize-search';
import { resolvePostAuthPath } from './post-auth-path';

type AuthenticatedLoginRedirect =
  | { href: string; kind: 'document-redirect' }
  | { kind: 'route-redirect'; path: string };

export async function resolveAuthenticatedLoginRedirect(
  search: string,
  currentOrigin: string,
): Promise<AuthenticatedLoginRedirect> {
  if (isOAuthAuthorizeSearch(search)) {
    return {
      href: `/api/auth/oauth2/authorize${search}`,
      kind: 'document-redirect',
    };
  }

  return {
    kind: 'route-redirect',
    path: await resolvePostAuthPath(search, currentOrigin),
  };
}
