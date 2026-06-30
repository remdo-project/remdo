import { describe, expect, it } from 'vitest';
import { resolveAdminEnrollPostCreateDestination } from '#client/app/routes/admin-enroll-post-create-destination';

const CURRENT_ORIGIN = 'https://remdo.test';

describe('admin enroll route', () => {
  it('resumes OAuth authorization after enrolling the first admin', async () => {
    const search = '?response_type=code&client_id=source&redirect_uri=https%3A%2F%2Fsource.test%2Fcallback';

    await expect(resolveAdminEnrollPostCreateDestination(search, CURRENT_ORIGIN)).resolves.toEqual({
      kind: 'assign',
      href: `/api/auth/oauth2/authorize${search}`,
    });
  });

  it('falls back to normal post-auth navigation for non-OAuth searches', async () => {
    await expect(resolveAdminEnrollPostCreateDestination('?next=/sharing', CURRENT_ORIGIN)).resolves.toEqual({
      kind: 'navigate',
      path: '/sharing',
    });
  });
});
