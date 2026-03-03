import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { SerializedEditorState } from 'lexical';
import { restoreEditorStateDefaults } from '#lib/editor/editor-state-defaults';

const workloadArg = process.argv.slice(2).find(arg => arg !== '--');
// eslint-disable-next-line node/no-process-env -- perf generator intentionally reads direct env override.
const workloadId = (workloadArg?.trim() || process.env.PERF_WORKLOAD || '8x3').trim();
// eslint-disable-next-line node/no-process-env -- perf generator intentionally reads direct env override.
const dataDir = process.env.DATA_DIR || path.resolve('data');

const outputPath = path.resolve(dataDir, 'perf', `${workloadId}.json`);
const outputDir = path.dirname(outputPath);

const stateDraft = buildBalancedState(workloadId);

const normalized = restoreEditorStateDefaults(stateDraft);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(normalized)}\n`);

console.info(`[perf-workload] generated ${workloadId} -> ${outputPath}`);

function buildBalancedState(shape: string): SerializedEditorState {
  const match = shape.match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported workload "${shape}". Use "<branch>x<depth>" (example: "8x3").`);
  }

  const branchFactor = Number(match[1]);
  const maxDepth = Number(match[2]);

  if (branchFactor < 2) {
    throw new Error(`Unsupported workload "${shape}": branch factor must be >= 2.`);
  }
  if (maxDepth < 1) {
    throw new Error(`Unsupported workload "${shape}": depth must be >= 1.`);
  }

  const buildLevel = (level: number, trail: number[]): Record<string, unknown>[] => {
    const items: Record<string, unknown>[] = [];

    for (let index = 1; index <= branchFactor; index += 1) {
      const noteTrail = [...trail, index];
      const noteId = `b${noteTrail.join('')}`;

      items.push({
        ...(level > 1 ? { indent: 1 } : {}),
        noteId,
        type: 'listitem',
        value: index,
        children: [
          {
            type: 'text',
            text: noteId,
          },
        ],
      });

      if (level < maxDepth) {
        items.push({
          type: 'listitem',
          value: index + 1,
          children: [
            {
              type: 'list',
              children: buildLevel(level + 1, noteTrail),
            },
          ],
        });
      }
    }

    return items;
  };

  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'list',
          children: buildLevel(1, []),
        },
      ],
    },
  } as unknown as SerializedEditorState;
}
