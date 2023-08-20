import { createChildren } from "./common";
import { Note } from "@/components/Editor/lexical/api";
import { $getRoot, $createTextNode } from "lexical";
import { it } from "vitest";

class Timer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  calculateRemainingTime(totalItems: number, itemsLeft: number): string {
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.startTime;

    const processedItems = totalItems - itemsLeft;
    const timePerItem = elapsedTime / processedItems;
    const estimatedRemainingTime = timePerItem * itemsLeft;

    const seconds = Math.round(estimatedRemainingTime / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds}s remaining`;
  }
}

/** returns number of notes including the given */
function countNotes(note: Note): number {
  let count = 0;
  for (const child of note.children) {
    count += countNotes(child);
  }
  return count + 1;
}

/**
 * removes all notes
 */
it.skipIf(!process.env.VITE_PERFORMANCE_TESTS)("clear", async ({ lexicalUpdate }) => {
  lexicalUpdate(() => {
    $getRoot().clear();
  })
})

/**
 * creates new N notes, never causing that any note has more than MAX_CHILDREN
 */
it.skipIf(!process.env.VITE_PERFORMANCE_TESTS)("add nodes", async ({ lexicalUpdate, log }) => {
  const N = 40000;
  const MAX_CHILDREN = 8;
  const BATCH_SIZE = 1000;

  function addNotes(count: number) {
    lexicalUpdate(() => {
      const root = Note.from($getRoot());
      const queue: Note[] = [root];
      while (count > 0) {
        const note = queue.shift()!;
        let childrenCount = [...note.children].length;
        while (childrenCount < MAX_CHILDREN && count > 0) {
          const name = note.text.replace("root", "note");
          const child = note.createChild(name + childrenCount)
          childrenCount++;
          count--;
        }
        for (const child of note.children) {
          queue.push(child);
        }
      }
    })
  }

  //on blank document the first note is blank, let's fix that if needed
  lexicalUpdate(() => {
    const root = Note.from($getRoot());
    const firstChild = [...root.children][0];
    if (firstChild && firstChild.lexicalNode.getChildrenSize() === 0) {
      firstChild.lexicalNode.append($createTextNode("note0"))
    }
  })

  let total: number;

  const timer = new Timer();
  for (let count = N; count > 0;) {
    const currentBatchSize = Math.min(BATCH_SIZE, count);
    addNotes(currentBatchSize);
    count -= currentBatchSize;

    lexicalUpdate(() => {
      const root = Note.from($getRoot());
      total = countNotes(root);
    });

    log(`added: ${count}/${N}, total: ${total},`, timer.calculateRemainingTime(N, count));
    await new Promise(r => setTimeout(r, 50)); //TODO try to find a better way to flish websocket data, without that delay some of the data was lost if too many nodes were added (like N=1000, BATCH=50 run twice)
  }
  console.log("notes count", total);
}, 60 * 60 * 1000);


/**
 * reports number of notes
 */
it.skipIf(!process.env.VITE_PERFORMANCE_TESTS)("count notes", async ({ lexicalUpdate }) => {
  lexicalUpdate(() => {
    const root = Note.from($getRoot());
    const count = countNotes(root);
    console.log("notes count", count);
  });
})

/**
 * creates a tree with N nodes, each having MAX_CHILDREN children at most
 */
it.skipIf(!process.env.VITE_PERFORMANCE_TESTS)(
  "tree",
  async ({ lexicalUpdate, log }) => {
    const N = 20;
    const MAX_CHILDREN = 8;
    const timer = new Timer();

    let n = N;
    const queue: Note[] = [];
    lexicalUpdate(() => {
      const root = Note.from($getRoot());
      queue.push(root);
    });
    while (n > 0) {
      log(n, timer.calculateRemainingTime(N, n))
      lexicalUpdate(() => {
        const currentNote = queue.shift();
        const parentName = currentNote.text.replace("root", "note");
        for (let i = 0; i < MAX_CHILDREN && n > 0; i++, n--) {
          const newNote = currentNote.createChild(parentName + i);
          queue.push(newNote);
        }
      });
    }

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
it.skipIf(!process.env.VITE_PERFORMANCE_TESTS)(
  "flat list",
  async ({ lexicalUpdate }) => {
    const N = 10;
    const M = 5;
    for (let i = 0; i < N; ++i) {
      lexicalUpdate(() => {
        const root = Note.from($getRoot());
        createChildren(root, M);
      });
    }
  },
  60 * 1000
);
