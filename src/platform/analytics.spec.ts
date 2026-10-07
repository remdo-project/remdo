import { afterEach, expect, it, vi } from 'vitest';
import { ANALYTICS_TOGGLED_EVENT, endAnalyticsIdentity, identifyAnalyticsUser, trackAnalyticsEvent } from './analytics';

function installTracker() {
  const identify = vi.fn();
  const track = vi.fn();
  window.umami = { identify, track };
  return { identify, track };
}

function turnStatistics(disabled: boolean) {
  window.remdoAnalyticsDisabled = disabled;
  window.dispatchEvent(new Event(ANALYTICS_TOGGLED_EVENT));
}

afterEach(() => {
  endAnalyticsIdentity();
  delete window.remdoAnalyticsDisabled;
  delete window.umami;
});

it('reports the event to the Umami tracker', () => {
  const { track } = installTracker();

  trackAnalyticsEvent('document-created');

  expect(track).toHaveBeenCalledExactlyOnceWith('document-created');
});

it('does nothing while the tracker is unavailable', () => {
  expect(() => trackAnalyticsEvent('search-used')).not.toThrow();
});

it('identifies the signed-in user once, ahead of the first event', () => {
  const { identify, track } = installTracker();

  identifyAnalyticsUser('user-42');
  trackAnalyticsEvent('app-opened');
  trackAnalyticsEvent('search-used');

  expect(identify).toHaveBeenCalledExactlyOnceWith('user-42');
  expect(identify.mock.invocationCallOrder[0]).toBeLessThan(track.mock.invocationCallOrder[0]!);
});

it('does not identify the user while statistics are turned off', () => {
  const { identify } = installTracker();
  window.remdoAnalyticsDisabled = true;

  identifyAnalyticsUser('user-42');

  expect(identify).not.toHaveBeenCalled();
});

it('identifies a user who was signed in when statistics are turned on again', () => {
  const { identify } = installTracker();
  window.remdoAnalyticsDisabled = true;
  identifyAnalyticsUser('user-42');

  turnStatistics(false);

  expect(identify).toHaveBeenCalledExactlyOnceWith('user-42');
});

it('identifies the user again after statistics were turned off and on', () => {
  const { identify } = installTracker();
  identifyAnalyticsUser('user-42');

  turnStatistics(true);
  turnStatistics(false);

  expect(identify).toHaveBeenCalledTimes(2);
});

it('forgets the user when the identity ends', () => {
  const { identify } = installTracker();
  identifyAnalyticsUser('user-42');
  identify.mockClear();

  endAnalyticsIdentity();
  turnStatistics(false);
  trackAnalyticsEvent('search-used');

  expect(identify).not.toHaveBeenCalled();
});
