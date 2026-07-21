/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { z } from 'zod';
import {
  normalizeReadOnlyEnvironment,
  runReadOnlyAgentWithProcessSignals,
} from '../../_shared/tools/read-only-agent-runner.ts';
import type {
  ClaudeAgentRequest,
  ReadOnlyAgentResult,
  RunReadOnlyAgentOptions,
} from '../../_shared/tools/read-only-agent-runner.ts';

const REPORT_INSTRUCTION = 'The structured report field must contain the complete final review report, including every finding and its location. Do not replace findings with counts, a summary, or a reference to other output.';
const REVIEW_OUTPUT_SCHEMA = z.strictObject({
  review_complete: z.boolean().describe(
    'True only after native review inspected the full requested scope and completed; false when review could not complete.',
  ),
  report: z.string().describe(
    'The complete final review report, including every finding and its location rather than only counts or a summary, when review_complete is true; otherwise an explanation of why review could not complete.',
  ),
});
const REVIEW_OUTPUT_JSON_SCHEMA = z.toJSONSchema(
  REVIEW_OUTPUT_SCHEMA,
  { target: 'draft-07' },
);

function fail(message: string): never {
  process.stderr.write(`run-claude-review: ${message}\n`);
  process.exit(1);
}

function gitConfigValues(
  key: string,
  environment: NodeJS.ProcessEnv,
): string[] {
  const result = spawnSync('git', ['config', '--get-all', key], {
    encoding: 'utf8',
    env: environment,
  });
  const stderr = result.stderr?.trim() ?? '';
  if (result.status === 1 && stderr === '' && result.error === undefined) {
    return [];
  }
  if (result.status !== 0) {
    fail(stderr || result.error?.message || `git config --get-all ${key} failed`);
  }
  return result.stdout.trim().split('\n').filter(Boolean);
}

function addGitConfig(
  environment: NodeJS.ProcessEnv,
  key: string,
  value: string,
  index: number,
): number {
  environment[`GIT_CONFIG_KEY_${index}`] = key;
  environment[`GIT_CONFIG_VALUE_${index}`] = value;
  return index + 1;
}

function workingTreeEnvironment(): NodeJS.ProcessEnv {
  const environment = normalizeReadOnlyEnvironment(process.env);
  const branchResult = spawnSync(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    { encoding: 'utf8', env: environment },
  );
  const branchStderr = branchResult.stderr?.trim() ?? '';
  if (branchResult.status === 1
    && branchStderr === ''
    && branchResult.error === undefined) {
    fail('working-tree review requires an attached branch');
  }
  if (branchResult.status !== 0) {
    fail(
      branchStderr
      || branchResult.error?.message
      || 'could not resolve the attached branch',
    );
  }
  const branch = branchResult.stdout.trim();
  const configuredMergeRefs = gitConfigValues(
    `branch.${branch}.merge`,
    environment,
  );
  const mergeRefs = configuredMergeRefs.length > 0
    ? configuredMergeRefs
    : [`refs/heads/${branch}`];
  const rawCount = environment.GIT_CONFIG_COUNT ?? '0';
  if (!/^\d+$/.test(rawCount)) {
    fail('GIT_CONFIG_COUNT must be a non-negative integer');
  }
  let configCount = Number.parseInt(rawCount, 10);
  const remoteName = `remdo-verify-${process.pid}`;
  configCount = addGitConfig(
    environment,
    `branch.${branch}.remote`,
    remoteName,
    configCount,
  );
  if (configuredMergeRefs.length === 0) {
    configCount = addGitConfig(
      environment,
      `branch.${branch}.merge`,
      mergeRefs[0]!,
      configCount,
    );
  }
  for (const mergeRef of mergeRefs) {
    configCount = addGitConfig(
      environment,
      `remote.${remoteName}.fetch`,
      `+${mergeRef}:refs/heads/${branch}`,
      configCount,
    );
  }
  environment.GIT_CONFIG_COUNT = String(configCount);
  return environment;
}

function requestFromArgs(args: string[]): {
  options: RunReadOnlyAgentOptions;
  request: ClaudeAgentRequest;
} {
  let argumentsText: string | undefined;
  let environment: NodeJS.ProcessEnv;
  let instructions: string;
  if (args[0] === 'working-tree') {
    if (args.length !== 1) {
      fail('working-tree scope takes no revisions');
    }
    environment = workingTreeEnvironment();
    instructions = `Review only the current working-tree scope (staged, unstaged, and untracked changes, including separate staged and unstaged versions of one path) under repository rules. ${REPORT_INSTRUCTION} Do not edit, stage, commit, or repeat the deterministic checks.`;
  } else if (args[0] === 'committed-range') {
    if (args.length !== 3 || args[1]?.trim() === '' || args[2]?.trim() === '') {
      fail('committed-range scope requires a base and head SHA');
    }
    environment = normalizeReadOnlyEnvironment(process.env);
    argumentsText = `${args[1]}..${args[2]}`;
    instructions = `Review only the exact resolved range \`${argumentsText}\` under repository rules. ${REPORT_INSTRUCTION} Do not edit, stage, commit, or repeat the deterministic checks.`;
  } else {
    return fail("expected 'working-tree' or 'committed-range' scope");
  }

  return {
    options: { environment },
    request: {
      adapter: 'claude',
      invocation: {
        kind: 'review',
        arguments: argumentsText,
        instructions,
      },
      response: { kind: 'structured', schema: REVIEW_OUTPUT_JSON_SCHEMA },
      settings: { effort: 'medium' },
    },
  };
}

function reportResult(result: ReadOnlyAgentResult): void {
  if (result.status === 'unavailable') {
    process.stderr.write(`run-claude-review: ${result.evidence}\n`);
    process.exit(2);
  }
  if (result.status === 'failed') {
    fail(result.evidence);
  }
  if (result.response.kind !== 'structured') {
    fail('shared runner returned an invalid review response');
  }
  const parsed = REVIEW_OUTPUT_SCHEMA.safeParse(result.response.value);
  if (!parsed.success) {
    fail('shared runner returned an invalid review response');
  }
  const { report, review_complete: reviewComplete } = parsed.data;
  if (reviewComplete !== true || report.trim() === '') {
    fail(report.trim() !== ''
      ? `review did not complete\n${report.trim()}`
      : 'review did not provide explicit completion evidence');
  }
  process.stdout.write(report.trim());
  process.stdout.write('\n');
}

const { options, request } = requestFromArgs(process.argv.slice(2));
reportResult(await runReadOnlyAgentWithProcessSignals(request, options));
