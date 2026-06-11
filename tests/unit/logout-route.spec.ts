import { describe, expect, it, vi } from 'vitest';
import { clearLocalUserData } from '#client/app/auth/local-data';
import { resetUserData } from '#client/app/documents/user-data';
import { clearLocalLogoutData } from '#client/app/routes/logout-local-data';

vi.mock('#client/app/auth/local-data', () => ({
  clearLocalUserData: vi.fn(),
}));

vi.mock('#client/app/documents/user-data', () => ({
  resetUserData: vi.fn(),
}));

describe('logout route', () => {
  it('tears down user data runtime before clearing local databases', async () => {
    const calls: string[] = [];
    vi.mocked(resetUserData).mockImplementation(() => {
      calls.push('resetUserData');
    });
    vi.mocked(clearLocalUserData).mockImplementation(async () => {
      calls.push('clearLocalUserData');
    });

    await clearLocalLogoutData();

    expect(calls).toEqual(['resetUserData', 'clearLocalUserData']);
  });
});
