let expectedIssues: Set<string> | null = null;
let seenIssues: Set<string> | null = null;

export function setExpectedConsoleIssues(messages: string[] | null): void {
  expectedIssues = messages && messages.length > 0 ? new Set(messages) : null;
  seenIssues = expectedIssues ? new Set() : null;
}

export function getExpectedConsoleIssues(): Set<string> | null {
  return expectedIssues;
}

export function consumeExpectedConsoleIssue(message: string): boolean {
  if (!expectedIssues) {
    return false;
  }
  if (!expectedIssues.has(message)) {
    return false;
  }
  seenIssues?.add(message);
  return true;
}

export function getUnreportedExpectedConsoleIssues(): string[] {
  if (!expectedIssues) {
    return [];
  }
  const missing: string[] = [];
  for (const message of expectedIssues) {
    if (!seenIssues?.has(message)) {
      missing.push(message);
    }
  }
  return missing;
}

export function clearExpectedConsoleIssues(): void {
  expectedIssues = null;
  seenIssues = null;
}
