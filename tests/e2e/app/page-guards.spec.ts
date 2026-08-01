import {
  expect,
  guardedTest as test,
  setExpectedConsoleIssues,
  withPageGuards,
} from '#e2e/fixtures';

test('preserves a test failure when an expected console issue is not reported', async ({ page }) => {
  const testFailure = new Error('test failed');

  await expect(withPageGuards(page, async guardedPage => {
    setExpectedConsoleIssues(guardedPage, ['expected warning']);
    throw testFailure;
  })).rejects.toBe(testFailure);
});
