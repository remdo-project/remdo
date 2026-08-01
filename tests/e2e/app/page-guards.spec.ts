import {
  expect,
  guardedTest as test,
  setExpectedConsoleIssues,
  withPageGuards,
} from '#e2e/fixtures';

test('does not add a guard failure when Playwright already reports a test failure', async ({ page }) => {
  await expect(withPageGuards(page, async guardedPage => {
    setExpectedConsoleIssues(guardedPage, ['expected warning']);
  }, {
    expectedStatus: 'passed',
    status: 'failed',
  })).resolves.toBeUndefined();
});
