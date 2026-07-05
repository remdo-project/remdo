import { isOAuthAuthorizeSearch } from './oauth-authorize-search';
import { resolveNextPathOrDefault } from './post-auth-path';

type AdminEnrollPostCreateDestination =
  | { kind: 'assign'; href: string }
  | { kind: 'navigate'; path: string };

// After enrolling, the new admin's next step is the admin panel, so land there by
// default rather than on the home document. An explicit `?next=` still wins (and
// an OAuth-authorize search resumes that flow), so an enrollment reached mid-flow
// returns to where it was headed.
export function resolveAdminEnrollPostCreateDestination(
  search: string,
  currentOrigin: string,
): AdminEnrollPostCreateDestination {
  if (isOAuthAuthorizeSearch(search)) {
    return {
      kind: 'assign',
      href: `/api/auth/oauth2/authorize${search}`,
    };
  }

  return {
    kind: 'navigate',
    path: resolveNextPathOrDefault(search, currentOrigin, '/admin'),
  };
}
