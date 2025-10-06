/* eslint-disable no-console -- intentionally wraps console methods */
//FIXME fix yjs initialization and remove this
const suppressedPatterns = [
  /Invalid access: Add Yjs type to a document before reading data\./,
];

const shouldSuppress = (args: unknown[]): boolean => {
  if (typeof args[0] !== "string") return false;
  return suppressedPatterns.some((pattern) => pattern.test(args[0] as string));
};

type ConsoleMethod = "error" | "warn" | "info" | "log";

const patchConsole = (method: ConsoleMethod) => {
  const original = console[method]?.bind(console);
  if (!original) return;

  console[method] = (...args: unknown[]) => {
    if (shouldSuppress(args)) return;
    original(...args);
  };
};

const globalWithFlag = globalThis as typeof globalThis & {
  __remdoYjsWarningSuppressed?: boolean;
};

if (!globalWithFlag.__remdoYjsWarningSuppressed) {
  (["warn", "error", "info", "log"] as const).forEach((method) => {
    patchConsole(method);
  });
  globalWithFlag.__remdoYjsWarningSuppressed = true;
}

export {};
