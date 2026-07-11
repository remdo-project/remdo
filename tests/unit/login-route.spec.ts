import { describe, expect, it } from 'vitest';
import { resolveAuthenticatedLoginRedirect } from '#client/app/routes/login-redirect';
import { isOAuthAuthorizeSearch } from '#client/app/routes/oauth-authorize-search';

const CURRENT_ORIGIN = 'https://remdo.test';

describe('root login OAuth resume detection', () => {
  it('detects OAuth authorize resumes from required authorize fields', () => {
    const search = '?response_type=code&client_id=remdo-home&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fcallback';

    expect(isOAuthAuthorizeSearch(search)).toBe(true);
  });

  it('does not treat ordinary login next targets as OAuth authorize resumes', () => {
    expect(isOAuthAuthorizeSearch('?next=/sharing')).toBe(false);
  });

  it('resumes OAuth authorization for already-authenticated login visits', () => {
    const search = '?response_type=code&client_id=source&redirect_uri=https%3A%2F%2Fsource.test%2Fcallback';

    expect(resolveAuthenticatedLoginRedirect(search, CURRENT_ORIGIN)).toEqual({
      href: `/api/auth/oauth2/authorize${search}`,
      kind: 'document-redirect',
    });
  });

  it('uses normal post-auth navigation for already-authenticated non-OAuth login visits', () => {
    expect(resolveAuthenticatedLoginRedirect('?next=/sharing', CURRENT_ORIGIN)).toEqual({
      kind: 'route-redirect',
      path: '/sharing',
    });
  });
});
