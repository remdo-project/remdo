export const REVIEW_INSTRUCTION = [
  'Repository tests and checks are handled outside this review.',
  'Do not run or manually reproduce repository tests or checks, including through ad hoc commands.',
  'Inspect the complete requested scope; in the final response, explicitly state whether inspection was complete and identify any material gap.',
  'Review the implementation and test adequacy using repository evidence.',
  'Pass these instructions to every delegated reviewer.',
  'Report any additional runtime check needed and why; do not run it.',
].join(' ');

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
