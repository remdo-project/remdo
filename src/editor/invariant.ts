import { config } from '#config';

export interface InvariantPayload {
  message: string;
  context?: Record<string, unknown>;
}

interface InvariantReporter {
  (payload: InvariantPayload): void;
}

let reporter: InvariantReporter | null = null;

export function setInvariantReporter(fn: InvariantReporter | null): void {
  reporter = fn;
}

export function reportInvariant(payload: InvariantPayload): void {
  const isDevOrTest = config.isDevOrTest;

  if (isDevOrTest) {
    const error: Error & { context?: Record<string, unknown> } = new Error(payload.message);
    error.context = payload.context;
    throw error;
  }

  console.error(`[invariant] ${payload.message}`.trim(), payload.context);

  if (!reporter) {
    console.error('[invariant:reporter-missing]', payload);
    return;
  }

  try {
    reporter(payload);
  } catch (err) {
    console.error('[invariant:reporter-error]', err);
  }
}
