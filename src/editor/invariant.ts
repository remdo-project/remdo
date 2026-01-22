export interface InvariantPayload {
  message: string;
  context?: Record<string, unknown>;
}

export function reportInvariant(payload: InvariantPayload): void {
  const label = `runtime.invariant ${payload.message}`.trim();
  console.error(label);
}
