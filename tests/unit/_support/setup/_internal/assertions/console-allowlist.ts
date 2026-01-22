let expectedIssues: Set<string> | null = null;

export function setExpectedConsoleIssues(messages: string[] | null): void {
  expectedIssues = messages && messages.length > 0 ? new Set(messages) : null;
}

export function getExpectedConsoleIssues(): Set<string> | null {
  return expectedIssues;
}

export function consumeExpectedConsoleIssue(message: string): boolean {
  if (!expectedIssues) {
    return false;
  }
  return expectedIssues.delete(message);
}

export function clearExpectedConsoleIssues(): void {
  expectedIssues = null;
}
