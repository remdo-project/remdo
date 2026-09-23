import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AppFooter from './AppFooter';

const settings = vi.hoisted(() => ({ dev: false, browser: { BUILD_REVISION: '' } }));
vi.mock('#config', () => ({ config: settings }));
const appRevision = '0123456789abcdef0123456789abcdef01234567';
// Same short prefix ensures comparison uses the complete revision.
const serverRevision = '01234567abcdef0123456789abcdef0123456789';

beforeEach(() => {
  settings.dev = false;
  settings.browser.BUILD_REVISION = appRevision;
});

it('links the privacy policy and source repository', () => {
  render(<AppFooter serverRevision={appRevision} />);
  const links = screen.getByRole('navigation', { name: 'Footer' });
  expect(within(links).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy/');
  expect(within(links).getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/remdo-project/remdo');
});

it('links only the short hash when the builds match', () => {
  render(<AppFooter serverRevision={appRevision} />);
  expect(screen.getByText('Build')).toHaveTextContent('Build #01234567');
  expect(screen.getByRole('link', { name: '#01234567' })).toHaveAttribute('href',
    `https://github.com/remdo-project/remdo/commit/${appRevision}`);
  expect(screen.queryByRole('status')).toBeNull();
});

it('warns and identifies both commits when full revisions differ', () => {
  render(<AppFooter serverRevision={serverRevision} />);
  expect(screen.getByRole('status')).toHaveTextContent('App and server builds differ · App #01234567 · Server #01234567');
  expect(screen.getAllByRole('link', { name: '#01234567' }).map((link) => link.getAttribute('href'))).toEqual([
    `https://github.com/remdo-project/remdo/commit/${appRevision}`,
    `https://github.com/remdo-project/remdo/commit/${serverRevision}`,
  ]);
});

it('keeps the app build visible when the server revision is unavailable', () => {
  render(<AppFooter serverRevision="" />);
  expect(screen.getByText('Build')).toHaveTextContent('Build #01234567');
  expect(screen.queryByRole('status')).toBeNull();
});

it('shows unknown rather than a mismatch when the app revision is absent', () => {
  settings.browser.BUILD_REVISION = '';
  render(<AppFooter serverRevision={serverRevision} />);
  expect(screen.getByText('Build unknown')).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});

it('shows local development without a mismatch warning', () => {
  settings.dev = true;
  render(<AppFooter serverRevision={serverRevision} />);
  expect(screen.getByText('Local development')).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});
