import { createChildren } from "../common";
import { Timer, adjustDeltaToGetRoundedTotal, countNotes, getCount } from "./utils";
import { Note } from "@/components/Editor/plugins/remdo/utils/api";
import { $getRoot, $createTextNode } from "lexical";
import { it } from "vitest";

/**
 * removes all notes
 */
it("clear", async ({ lexicalUpdate }) => {
  lexicalUpdate(() => {
    $getRoot().clear();
  });
});

/**
 * creates new N notes, never causing that any note has more than MAX_CHILDREN
 */
it(
  "add notes",
  async ({ lexicalUpdate, expect }) => {
    const N = getCount(5000, 20);
    const MAX_CHILDREN = 8;
    const BATCH_SIZE = 100; // too big value causes errors during sync

    function addNotes(count: number) {
      lexicalUpdate(() => {
        const root = Note.from($getRoot());
        const queue: Note[] = [root];
        while (count > 0) {
          const note = queue.shift()!;
          let childrenCount = [...note.children].length;
          while (childrenCount < MAX_CHILDREN && count > 0) {
            const name = note.text.replace("root", "note");
            note.createChild(name + childrenCount);
            childrenCount++;
            count--;
          }
          for (const child of note.children) {
            queue.push(child);
          }
        }
      });
    }

    await logger.debug("Test started");
    await logger.debug(" counting existing notes...");

    const initialCount = countNotes(lexicalUpdate);
    const adjustedN = adjustDeltaToGetRoundedTotal(initialCount, N);
    const expectedFinalCount = initialCount + adjustedN;
    await logger.debug(
      ` initial notes count: ${initialCount} adding ${adjustedN} more (adjusted by ${
        adjustedN - N
      }) for the total of ${expectedFinalCount} notes`
    );

    //on a blank document the first note is empty, let's fix that if needed
    lexicalUpdate(() => {
      const root = Note.from($getRoot());
      const firstChild = [...root.children][0];
      if (firstChild && firstChild.lexicalNode.getChildrenSize() === 0) {
        firstChild.lexicalNode.append($createTextNode("note0"));
      }
    });

    const timer = new Timer(N);
    const numberOfBatches = Math.ceil(adjustedN / BATCH_SIZE);
    for (let remainingCount = adjustedN, batch = 1; remainingCount > 0; batch++) {
      const currentBatchSize = Math.min(BATCH_SIZE, remainingCount);
      addNotes(currentBatchSize);
      remainingCount -= currentBatchSize;

      logger.debug(
        ` batch ${batch}/${numberOfBatches}`,
        timer.calculateRemainingTime(remainingCount)
      );

      //TODO try to find a better way to flush websocket data,
      //without that delay some of the data can be lost if too many nodes are
      //added (like N=1000, BATCH=50 run twice)
      await new Promise((r) => setTimeout(r, 50));
    }

    const finalCount = countNotes(lexicalUpdate);
    expect(finalCount).toBe(expectedFinalCount);

    await logger.debug(`Done, final notes count: ${finalCount}`);
  },
  60 * 60 * 1000
);

/**
 * reports number of notes
 */
it(
  "count notes",
  async ({ lexicalUpdate }) => {
    await logger.debug("Counting notes...");
    const count = countNotes(lexicalUpdate);
    await logger.debug(`Notes count: ${count}`);
  },
  20 * 60 * 1000
);

/**
 * clears existing nodes and then creates a tree with N nodes
 * each having MAX_CHILDREN children at most
 */
it(
  "create tree",
  async ({ lexicalUpdate }) => {
    const N = getCount(200, 2);
    const MAX_CHILDREN = 8;
    const timer = new Timer(N);

    let n = N;
    const queue: Note[] = [];
    lexicalUpdate(() => {
      $getRoot().clear();
      const root = Note.from($getRoot());
      queue.push(root);
    });
    while (n > 0) {
      logger.debug(n, timer.calculateRemainingTime(n));
      lexicalUpdate(() => {
        const currentNote = queue.shift();
        const parentName = currentNote.text.replace("root", "note");
        for (let i = 0; i < MAX_CHILDREN && n > 0; i++, n--) {
          const newNote = currentNote.createChild(parentName + i);
          queue.push(newNote);
        }
      });
    }

    //remove the first, empty note
    lexicalUpdate(() => {
      const root = Note.from($getRoot());
      [...root.children][0].lexicalNode.remove();
    });
  },
  60 * 1000
);

/**
 * creates flat list of N times M children in the root
 */
it(
  "flat list",
  async ({ lexicalUpdate }) => {
    const N = getCount(50, 2);
    const M = getCount(20, 2);
    for (let i = 0; i < N; ++i) {
      lexicalUpdate(() => {
        const root = Note.from($getRoot());
        createChildren(root, M);
      });
    }
  },
  60 * 1000
);
