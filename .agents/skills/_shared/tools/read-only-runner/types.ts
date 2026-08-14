export type Agent = 'claude' | 'codex';

export type ReviewScope =
  | { kind: 'commit-range'; base: string }
  | { kind: 'uncommitted' };

export interface ReviewCall {
  agent: Agent;
  scope: ReviewScope;
  settings: { effort?: string; model?: string };
}

export type RunnerResult =
  | { status: 'failed'; evidence: string; preserveEvidenceEnd?: boolean }
  | { status: 'responded'; response: string }
  | { status: 'unavailable'; evidence: string; preserveEvidenceEnd?: boolean };

export interface ProcessOutcome {
  aborted: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: NodeJS.ErrnoException;
  stderr: string;
  stdout: string;
}

export interface RunProcessOptions {
  cwd: string;
  environment: NodeJS.ProcessEnv;
  input?: string;
  signal: AbortSignal;
}
