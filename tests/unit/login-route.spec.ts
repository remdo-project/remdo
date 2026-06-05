import { describe, expect, it } from 'vitest';
import { isOAuthAuthorizeSearch } from '@/routes/oauth-authorize-search';

describe('login route OAuth resume detection', () => {
  it('detects OAuth authorize resumes from required authorize fields', () => {
    const search = '?response_type=code&client_id=remdo-home&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fcallback';

    expect(isOAuthAuthorizeSearch(search)).toBe(true);
  });

  it('does not treat ordinary login next targets as OAuth authorize resumes', () => {
    expect(isOAuthAuthorizeSearch('?next=/home')).toBe(false);
  });
});
