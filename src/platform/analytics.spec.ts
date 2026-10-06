import { afterEach, expect, it, vi } from 'vitest';
import { ANALYTICS_READY_EVENT } from './analytics';

afterEach(() => {
  delete window.remdoAnalyticsAllowed;
  delete window.remdoAnalyticsSuspended;
  delete window.umami;
  vi.resetModules();
});

it('does nothing until analytics consent is granted', async () => {
  const track = vi.fn();
  window.umami = { identify: vi.fn(), track };
  const { trackAnalyticsEvent } = await import('./analytics');

  trackAnalyticsEvent('app-opened');

  expect(track).not.toHaveBeenCalled();
});

it('forwards identity and events immediately when the tracker is ready', async () => {
  const identify = vi.fn();
  const track = vi.fn();
  window.remdoAnalyticsAllowed = true;
  window.umami = { identify, track };
  const { identifyAnalyticsUser, trackAnalyticsEvent } = await import('./analytics');

  identifyAnalyticsUser('user-123');
  trackAnalyticsEvent('document-created');

  expect(identify).toHaveBeenCalledWith('user-123');
  expect(track).toHaveBeenCalledWith('document-created');
});

it('queues consented analytics until Umami finishes loading', async () => {
  const identify = vi.fn();
  const track = vi.fn();
  window.remdoAnalyticsAllowed = true;
  const { identifyAnalyticsUser, trackAnalyticsEvent } = await import('./analytics');

  identifyAnalyticsUser('user-123');
  trackAnalyticsEvent('search-used');
  window.umami = { identify, track };
  window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));

  expect(identify).toHaveBeenCalledWith('user-123');
  expect(track).toHaveBeenCalledWith('search-used');
  expect(identify.mock.invocationCallOrder[0]).toBeLessThan(track.mock.invocationCallOrder[0]!);
});

it('reports whether consent let the event through', async () => {
  const { trackAnalyticsEvent } = await import('./analytics');

  expect(trackAnalyticsEvent('document-edited')).toBe(false);

  window.remdoAnalyticsAllowed = true;
  window.umami = { identify: vi.fn(), track: vi.fn() };
  expect(trackAnalyticsEvent('document-edited')).toBe(true);
});

it('stays suspended after the identity ends until a user is identified again', async () => {
  window.remdoAnalyticsAllowed = true;
  window.umami = { identify: vi.fn(), track: vi.fn() };
  const { endAnalyticsIdentity, identifyAnalyticsUser } = await import('./analytics');

  endAnalyticsIdentity();
  expect(window.remdoAnalyticsSuspended).toBe(true);

  identifyAnalyticsUser('user-456');
  expect(window.remdoAnalyticsSuspended).toBe(false);
});
