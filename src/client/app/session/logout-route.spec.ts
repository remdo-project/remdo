import { describe, expect, it, vi } from 'vitest';
import { clearLocalUserData } from '#client/app/session/local-data';
import { resetUserData } from '#client/app/user-data/user-data';
import { clearLocalLogoutData } from '#client/app/session/logout-local-data';

vi.mock('#client/app/session/local-data', () => ({
  clearLocalUserData: vi.fn(),
}));

vi.mock('#client/app/user-data/user-data', () => ({
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
