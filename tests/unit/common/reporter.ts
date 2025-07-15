import { UserConsoleLog, Vitest } from 'vitest';
import { BasicReporter } from 'vitest/reporters';

export default class MinimalReporter extends BasicReporter {
  onInit(ctx: Vitest) {
    ctx.logger.printBanner = () => {
      console.log("Starting...");
    };
    super.onInit(ctx);

    const disabledLogs = [
      'to show help',
      ' Test Files',
      '     Tests',
      '  Duration',
      '  Start at',
    ];

    const originalLog = ctx.logger.log.bind(ctx.logger);
    ctx.logger.log = function (...args: any[]) {
      if (args[0] && !disabledLogs.find(log => args[0].includes(log))) {
        args[0] = args[0].trim();
        return originalLog(...args);
      }
    };
  }

  onUserConsoleLog(log: UserConsoleLog) {
    if (!this.shouldLog(log)) {
      return;
    }
    const output
      = log.type === 'stdout'
        ? this.ctx.logger.outputStream
        : this.ctx.logger.errorStream;
    const write = (msg: string) => (output as any).write(msg);

    write(log.content);
  }
}
