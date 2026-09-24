import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import BuildStatus from './BuildStatus';

const settings = vi.hoisted(() => ({ dev: false, browser: { BUILD_REVISION: '' } }));
vi.mock('#config', () => ({ config: settings }));
const appRevision = '0123456789abcdef0123456789abcdef01234567';
// Same short prefix ensures comparison uses the complete revision.
const serverRevision = '01234567abcdef0123456789abcdef0123456789';

beforeEach(() => {
  settings.dev = false;
  settings.browser.BUILD_REVISION = appRevision;
});

it('links only the short hash when the builds match', () => {
  render(<BuildStatus serverRevision={appRevision} />);
  expect(screen.getByText('Build')).toHaveTextContent('Build #01234567');
  expect(screen.getByRole('link', { name: '#01234567' })).toHaveAttribute('href',
    `https://github.com/remdo-project/remdo/commit/${appRevision}`);
  expect(screen.queryByRole('status')).toBeNull();
});

it('warns and identifies both commits when full revisions differ', () => {
  render(<BuildStatus serverRevision={serverRevision} />);
  expect(screen.getByRole('status')).toHaveTextContent('App and server builds differ · App #01234567 · Server #01234567');
  expect(screen.getAllByRole('link', { name: '#01234567' }).map((link) => link.getAttribute('href'))).toEqual([
    `https://github.com/remdo-project/remdo/commit/${appRevision}`,
    `https://github.com/remdo-project/remdo/commit/${serverRevision}`,
  ]);
});

it('keeps the app build visible when the server revision is unavailable', () => {
  render(<BuildStatus serverRevision="" />);
  expect(screen.getByText('Build')).toHaveTextContent('Build #01234567');
  expect(screen.queryByRole('status')).toBeNull();
});

it('shows unknown rather than a mismatch when the app revision is absent', () => {
  settings.browser.BUILD_REVISION = '';
  render(<BuildStatus serverRevision={serverRevision} />);
  expect(screen.getByText('Build unknown')).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});

it('shows local development without a mismatch warning', () => {
  settings.dev = true;
  render(<BuildStatus serverRevision={serverRevision} />);
  expect(screen.getByText('Local development')).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});
