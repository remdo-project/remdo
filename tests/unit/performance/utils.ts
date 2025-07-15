import { Note } from "@/components/Editor/plugins/remdo/utils/api";
import { $getRoot } from "lexical";

/**
 * Given a number `initialCount` and a number `delta`
 * adjust `delta` to get a rounded total.
 * see unit tests for examples
 */
export function adjustDeltaToGetRoundedTotal(
  initialCount: number,
  delta: number
) {
  function countTrailingZeroes(n: number) {
    for (let count = 0; ; n = Math.floor(n / 10), count++) {
      if (n % 10 !== 0 || n === 0) {
        return count;
      }
    }
  }

  if (delta <= 0) {
    throw new Error("delta must be positive");
  }

  const trailingZeroes = countTrailingZeroes(delta);
  const initialTotal = initialCount + delta;
  const magnitudeFactor = Math.pow(10, trailingZeroes);
  const roundedTotal =
    Math.round(initialTotal / magnitudeFactor) * magnitudeFactor;

  return roundedTotal - initialCount;
}

/**
 * takes two arguments and returns the first one (usually a way biggger)
 * if in performance test mode and the second one otherwise
 */
export function getCount(performaceCount: number, regularCount: number) {
  return process.env.VITE_PERFORMANCE_TESTS ? performaceCount : regularCount;
}

/**
 * Timer class to estimate remaining time
 * uses linear regression to keep improving the estimate as the test progresses
 */
export class Timer {
  private startTime: number;
  private totalItems: number;
  private times: number[] = [];
  private itemsProcessed: number[] = [];
  private previousRemainingTime: number | null = null;
  private previousElapsedTime: number = 0;

  constructor(totalItems: number) {
    this.startTime = Date.now();
    this.totalItems = totalItems;
  }

  calculateRemainingTime(itemsProcessed: number): string {
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.startTime;
    const timeSinceLastStep = elapsedTime - this.previousElapsedTime;

    this.times.push(elapsedTime);
    this.itemsProcessed.push(itemsProcessed);

    if (this.itemsProcessed.length < 2) {
      this.previousElapsedTime = elapsedTime;
      return "calculating remaining time...";
    }

    const n = this.itemsProcessed.length;
    const sumX = this.itemsProcessed.reduce((a, b) => a + b, 0);
    const sumY = this.times.reduce((a, b) => a + b, 0);
    const sumXY = this.itemsProcessed.reduce(
      (sum, x, i) => sum + x * this.times[i],
      0
    );
    const sumXX = this.itemsProcessed.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const estimatedRemainingTime =
      slope * (this.totalItems - itemsProcessed) + intercept;
    const remainingTime = estimatedRemainingTime / 1000;

    let adjustmentInfo = "";
    if (this.previousRemainingTime !== null) {
      const adjustment =
        estimatedRemainingTime - this.previousRemainingTime + timeSinceLastStep;
      if (Math.abs(adjustment) > 1000) {
        adjustmentInfo = ` (adjusted by ${adjustment > 0 ? "+" : ""}${(
          adjustment / 1000
        ).toFixed(2)}s)`;
      }
    }

    this.previousRemainingTime = estimatedRemainingTime;
    this.previousElapsedTime = elapsedTime;

    const roundedRemainingTime = Math.round(remainingTime);
    const minutes = Math.floor(roundedRemainingTime / 60);
    const seconds = roundedRemainingTime % 60;

    if (minutes > 0 || seconds > 0) {
      return `~${
        minutes > 0 ? minutes + ":" : ""
      }${seconds}s remaining${adjustmentInfo}`;
    } else {
      return "almost done!";
    }
  }
}

/**
 * returns number of notes including the one that's passed as the argument
 */
export function countNotes(lexicalUpdate: (fn: () => void) => void) {
  function countChildren(note: Note): number {
    return Array.from(note.children).reduce(
      (acc, child) => acc + countChildren(child) + 1,
      0
    );
  }

  let count: number;
  lexicalUpdate(() => {
    const root = Note.from($getRoot());
    count = countChildren(root);
  });
  return count;
}
