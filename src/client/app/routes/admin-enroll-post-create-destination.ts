import { isOAuthAuthorizeSearch } from './oauth-authorize-search';
import { resolvePostAuthPath } from './post-auth-path';

type AdminEnrollPostCreateDestination =
  | { kind: 'assign'; href: string }
  | { kind: 'navigate'; path: string };

export async function resolveAdminEnrollPostCreateDestination(
  search: string,
  currentOrigin: string,
): Promise<AdminEnrollPostCreateDestination> {
  if (isOAuthAuthorizeSearch(search)) {
    return {
      kind: 'assign',
      href: `/api/auth/oauth2/authorize${search}`,
    };
  }

  return {
    kind: 'navigate',
    path: await resolvePostAuthPath(search, currentOrigin),
  };
}
