import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_SIGN_OUT_STORAGE_KEY,
  rememberPendingSignOut,
} from './client';
import { subscribeToSignOut } from './logout-broadcast';

describe('logout broadcast', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('notifies a peer when the originating tab writes the pending-sign-out marker', () => {
    const onSignOut = vi.fn();
    const unsubscribe = subscribeToSignOut(onSignOut);

    window.dispatchEvent(new StorageEvent('storage', {
      key: PENDING_SIGN_OUT_STORAGE_KEY,
      newValue: '1',
    }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('notifies a peer that observes the pending marker without a storage event', () => {
    vi.useFakeTimers();
    localStorage.setItem(PENDING_SIGN_OUT_STORAGE_KEY, '1');
    const onSignOut = vi.fn();
    const unsubscribe = subscribeToSignOut(onSignOut);

    vi.advanceTimersByTime(50);

    expect(onSignOut).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not treat the originating tab as a peer', () => {
    vi.useFakeTimers();
    rememberPendingSignOut();
    const onSignOut = vi.fn();
    const unsubscribe = subscribeToSignOut(onSignOut);

    vi.advanceTimersByTime(500);

    expect(onSignOut).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('ignores unrelated storage writes', () => {
    const onSignOut = vi.fn();
    const unsubscribe = subscribeToSignOut(onSignOut);

    window.dispatchEvent(new StorageEvent('storage', {
      key: PENDING_SIGN_OUT_STORAGE_KEY,
      newValue: null,
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'remdo-authenticated-session',
      newValue: '1',
    }));

    expect(onSignOut).not.toHaveBeenCalled();
    unsubscribe();
  });
});
