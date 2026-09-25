/** The operation's target is unavailable or the operation cannot apply to it. */
export class IneligibleOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IneligibleOperationError';
  }
}
