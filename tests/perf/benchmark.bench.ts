import { config } from '#config';
import { readFixture } from '#tests-common/fixtures';
import { placeCaretAtNote, pressKey, typeText } from '#tests';
import { REORDER_NOTES_DOWN_COMMAND } from '@/editor/commands';
import type { RemdoTestApi } from '@/editor/plugins/dev';
import { resolveDefaultDocId } from '@/routing';
import { afterAll, bench, describe } from 'vitest';
import { generateBalancedWorkload } from './generate-balanced-workload';
import { renderRemdoEditor } from '../unit/collab/_support/render-editor';

type WorkloadId = 'flat' | 'balanced-8x3';

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
  flatStateJson: string;
  balancedStateJson: string;
}

const WORKLOAD_TARGETS: Record<WorkloadId, WorkloadTargets> = {
  flat: {
    leafNoteId: 'note3',
    typingNoteId: 'note1',
    typingMiddleOffset: 2,
    deleteNoteId: 'note2',
    withinParentNoteId: 'note2',
    betweenParentsMovingNoteId: 'note2',
  },
  'balanced-8x3': {
    leafNoteId: 'b888',
    typingNoteId: 'b111',
    typingMiddleOffset: 2,
    deleteNoteId: 'b111',
    withinParentNoteId: 'b12',
    betweenParentsMovingNoteId: 'b12',
  },
};

const mode = config.env.COLLAB_ENABLED ? 'collab' : 'non-collab';

async function ensureStructuralSelection(remdo: RemdoTestApi, noteId: string): Promise<void> {
  await placeCaretAtNote(remdo, noteId, 0);
  await pressKey(remdo, { key: 'ArrowDown', shift: true });

  // Match the app's two-stage ladder: first Shift+Arrow enters inline range,
  // second enters structural range for non-empty notes.
  if (!remdo.editor.selection.isStructural()) {
    await pressKey(remdo, { key: 'ArrowDown', shift: true });
  }
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

function registerWorkloadBenchmarks(
  workloadId: WorkloadId,
  getStateJson: () => string,
  getRemdo: () => RemdoTestApi,
  ensureHarnessReady: () => Promise<void>
): void {
  const targets = WORKLOAD_TARGETS[workloadId];

  describe(`${workloadId} workload`, () => {
    for (const operation of OPERATIONS) {
      bench(operation.name, async () => {
        const remdo = getRemdo();
        await remdo._bridge.applySerializedState(getStateJson());
        await operation.run(remdo, targets);
      }, {
        throws: true,
        setup: async () => {
          await ensureHarnessReady();
        },
      });
    }
  });
}

describe(`editor performance (${mode})`, () => {
  let unmount: (() => void) | null = null;
  let harness: BenchmarkHarness | null = null;

  afterAll(async () => {
    if (harness) {
      await harness.remdo.waitForSynced();
    }
    unmount?.();
  });

  const ensureHarnessReady = async (): Promise<void> => {
    if (harness) {
      return;
    }

    const [flatStateJson, mounted] = await Promise.all([
      readFixture('flat'),
      renderRemdoEditor({ docId: resolveDefaultDocId(config.env.COLLAB_DOCUMENT_ID) }),
    ]);

    harness = {
      remdo: mounted.api,
      flatStateJson,
      balancedStateJson: generateBalancedWorkload(),
    };
    unmount = mounted.unmount;
  };

  const getRemdo = (): RemdoTestApi => {
    return harness!.remdo;
  };

  registerWorkloadBenchmarks(
    'flat',
    () => harness!.flatStateJson,
    getRemdo,
    ensureHarnessReady
  );
  registerWorkloadBenchmarks(
    'balanced-8x3',
    () => harness!.balancedStateJson,
    getRemdo,
    ensureHarnessReady
  );
});
