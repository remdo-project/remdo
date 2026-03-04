import { promises as fs } from 'node:fs';
import path from 'node:path';
import { placeCaretAtNote, pressKey, typeText } from '#tests';
import { REORDER_NOTES_DOWN_COMMAND } from '@/editor/commands';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { bench, describe } from 'vitest';
import { renderRemdoEditor } from '../unit/collab/_support/render-editor';
import type { SerializedEditorState } from 'lexical';

type WorkloadId = `${number}x${number}`;
interface WorkloadShape {
  branchFactor: number;
  depth: number;
}

interface WorkloadTargets {
  leafNoteId: string;
  typingNoteId: string;
  typingMiddleOffset: number;
  deleteNoteId: string;
  withinParentNoteId: string;
  betweenParentsMovingNoteId: string;
}

interface Operation {
  name: string;
  run: (remdo: RemdoTestApi, targets: WorkloadTargets) => Promise<void>;
}

interface BenchmarkHarness {
  remdo: RemdoTestApi;
  workloadStateJson: string;
  workloadTargets: WorkloadTargets;
}

interface BenchmarkIterationTask {
  opts: object;
}

const MIN_BENCH_DEPTH = 3;
const MAX_BRANCH_FACTOR = 10;

// eslint-disable-next-line node/no-process-env -- perf bench intentionally reads direct env override.
const selectedWorkloadId = resolveWorkloadId(process.env.PERF_WORKLOAD || '8x3');
// eslint-disable-next-line node/no-process-env -- perf bench intentionally reads direct env override.
const dataDir = process.env.DATA_DIR || path.resolve('data');

function parseWorkloadShape(rawWorkloadId: string): WorkloadShape {
  const match = rawWorkloadId.trim().match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error(
      `Unsupported PERF_WORKLOAD: "${rawWorkloadId}". Use "<branch>x<depth>" (example: "8x3").`
    );
  }

  return {
    branchFactor: Number(match[1]),
    depth: Number(match[2]),
  };
}

function resolveWorkloadId(rawWorkloadId: string): WorkloadId {
  const workloadId = rawWorkloadId.trim();
  const { branchFactor, depth } = parseWorkloadShape(workloadId);

  if (branchFactor < 2) {
    throw new Error(`Unsupported PERF_WORKLOAD: "${workloadId}". Branch factor must be >= 2.`);
  }
  if (branchFactor > MAX_BRANCH_FACTOR) {
    throw new Error(
      `Unsupported PERF_WORKLOAD: "${workloadId}". Branch factor must be <= ${MAX_BRANCH_FACTOR}.`
    );
  }
  if (depth < MIN_BENCH_DEPTH) {
    throw new Error(
      `Unsupported PERF_WORKLOAD: "${workloadId}". Depth must be >= ${MIN_BENCH_DEPTH} for benchmark targets.`
    );
  }

  return workloadId as WorkloadId;
}

function resolveWorkloadTargets(workloadId: WorkloadId): WorkloadTargets {
  const [branchPart, depthPart] = workloadId.split('x');
  const branchFactor = Number(branchPart);
  const depth = Number(depthPart);

  return {
    leafNoteId: `b${String(branchFactor).repeat(depth)}`,
    typingNoteId: 'b111',
    typingMiddleOffset: 2,
    deleteNoteId: 'b111',
    withinParentNoteId: 'b12',
    betweenParentsMovingNoteId: 'b12',
  };
}

async function resolveWorkloadState(workloadId: WorkloadId): Promise<{ stateJson: string; targets: WorkloadTargets }> {
  const workloadPath = path.resolve(dataDir, 'perf', `${workloadId}.json`);
  let rawFixture: string;

  try {
    rawFixture = await fs.readFile(workloadPath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        [
          `Missing perf workload file: ${workloadPath}`,
          `Generate it with: pnpm run perf:generate -- ${workloadId}`,
        ].join('\n')
      );
    }
    throw error;
  }

  const parsed = JSON.parse(rawFixture) as SerializedEditorState;

  return {
    stateJson: JSON.stringify(parsed),
    targets: resolveWorkloadTargets(workloadId),
  };
}

async function ensureStructuralSelection(remdo: RemdoTestApi, noteId: string): Promise<void> {
  await placeCaretAtNote(remdo, noteId, 0);
  await pressKey(remdo, { key: 'ArrowDown', shift: true });
  await pressKey(remdo, { key: 'ArrowDown', shift: true });
}

function installWorkloadResetBeforeEach(
  task: BenchmarkIterationTask,
  harness: BenchmarkHarness
): void {
  const options = task.opts as { beforeEach?: () => Promise<void> };
  options.beforeEach = async () => {
    await harness.remdo._bridge.applySerializedState(harness.workloadStateJson);
  };
}

const OPERATIONS: Operation[] = [
  {
    name: 'add note',
    run: async (remdo, targets) => {
      await placeCaretAtNote(remdo, targets.leafNoteId, Number.POSITIVE_INFINITY);
      await pressKey(remdo, { key: 'Enter' });
    },
  },
  {
    name: 'reorder note (within parent)',
    run: async (remdo, targets) => {
      await placeCaretAtNote(remdo, targets.withinParentNoteId, 0);
      await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    },
  },
  {
    name: 'reorder note (between parents)',
    run: async (remdo, targets) => {
      await placeCaretAtNote(remdo, targets.betweenParentsMovingNoteId, 0);
      await pressKey(remdo, { key: 'Tab' });
      await placeCaretAtNote(remdo, targets.betweenParentsMovingNoteId, 0);
      await remdo.dispatchCommand(REORDER_NOTES_DOWN_COMMAND);
    },
  },
  {
    name: 'delete note',
    run: async (remdo, targets) => {
      await ensureStructuralSelection(remdo, targets.deleteNoteId);
      await pressKey(remdo, { key: 'Delete' });
    },
  },
  {
    name: 'type character (start)',
    run: async (remdo, targets) => {
      await placeCaretAtNote(remdo, targets.typingNoteId, 0);
      await typeText(remdo, 'x');
    },
  },
  {
    name: 'type character (middle)',
    run: async (remdo, targets) => {
      await placeCaretAtNote(remdo, targets.typingNoteId, targets.typingMiddleOffset);
      await typeText(remdo, 'x');
    },
  },
  {
    name: 'type character (end)',
    run: async (remdo, targets) => {
      await placeCaretAtNote(remdo, targets.typingNoteId, Number.POSITIVE_INFINITY);
      await typeText(remdo, 'x');
    },
  },
];

describe(`editor performance (${selectedWorkloadId})`, () => {
  let unmount: (() => void) | null = null;
  let harness: BenchmarkHarness | null = null;

  const ensureHarnessReady = async (): Promise<void> => {
    if (harness) {
      return;
    }

    const [workload, mounted] = await Promise.all([
      resolveWorkloadState(selectedWorkloadId),
      renderRemdoEditor({ docId: 'main' }),
    ]);

    harness = {
      remdo: mounted.api,
      workloadStateJson: workload.stateJson,
      workloadTargets: workload.targets,
    };
    unmount = mounted.unmount;
  };

  const cleanupHarness = (): void => {
    if (!harness) {
      return;
    }

    unmount?.();
    harness = null;
    unmount = null;
  };

  for (const operation of OPERATIONS) {
    bench(operation.name, async () => {
      const remdo = harness!.remdo;
      await operation.run(remdo, harness!.workloadTargets);
    }, {
      throws: true,
      setup: async task => {
        await ensureHarnessReady();
        installWorkloadResetBeforeEach(task, harness!);
      },
      teardown: (_, mode) => {
        if (mode !== 'run') {
          return;
        }
        cleanupHarness();
      },
    });
  }
});
