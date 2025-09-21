import type { File, Vitest } from "vitest";
import process from "node:process";
import { getTests } from "@vitest/runner/utils";
import { DefaultReporter } from "vitest/reporters";

export default class PerformanceReporter extends DefaultReporter {
  onCollected() {
  }

  onFinished(files?: File[], errors?: unknown[]): Promise<void> {
    // print summary only if there are failed tests or unhandled errors
    const failed = getTests(files).find((t) => t.result?.state === "fail");
    if (failed || errors?.length) {
      this.reportSummary(files, errors);
    }
    return Promise.resolve();
  }

  onInit(ctx: Vitest) {
    // disable the initial banner
    ctx.logger.printBanner = () => {};
    super.onInit(ctx);

    process.stdout.write("Running performance test...\n");
  }
}
