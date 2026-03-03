/**
 * Generate balanced tree workload dynamically
 *
 * This is kept from v1 since generating the balanced workload dynamically
 * is simpler than maintaining a large JSON fixture file.
 *
 * The flat workload uses a static fixture, but balanced is generated because:
 * - It's large
 * - It's programmatically regular (easier to generate than maintain)
 * - The generation logic is simple and deterministic
 */

import type { SerializedEditorState } from 'lexical';
import { restoreEditorStateDefaults } from '#lib/editor/editor-state-defaults';

const BALANCED_BRANCH_FACTOR = 8;
const BALANCED_DEPTH = 3;

function buildBalancedState(branchFactor: number, maxDepth: number): SerializedEditorState {
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

  const stateDraft = {
    root: {
      type: 'root',
      children: [
        {
          type: 'list',
          children: buildLevel(1, []),
        },
      ],
    },
  };

  return stateDraft as unknown as SerializedEditorState;
}

/**
 * Generate the balanced workload state
 *
 * Structure:
 * - Branch factor: 8 (each parent has 8 children)
 * - Max depth: 3
 * - Leaf nodes: 8^3 = 512
 * - Note IDs: b1, b11, b111, ..., b888
 */
export function generateBalancedWorkload(): string {
  const state = buildBalancedState(BALANCED_BRANCH_FACTOR, BALANCED_DEPTH);
  const normalized = restoreEditorStateDefaults(state);
  return JSON.stringify(normalized);
}
