interface ReviewEvidence {
  complete: boolean;
  diagnostic?: string;
  responses: string[];
}

export function serializeReviewEvidence(
  responses: string[],
  diagnostic?: string,
): string {
  const evidence: ReviewEvidence = {
    complete: diagnostic === undefined,
    responses,
    ...(diagnostic !== undefined ? { diagnostic } : {}),
  };
  return JSON.stringify(evidence, null, 2);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
