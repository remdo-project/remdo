/* eslint-disable no-console -- test harness overrides console methods intentionally */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { env } from '#config/env.server';
const debugEnabled = env.DEBUG.length > 0;

const _info = console.info;
const _warn = console.warn;

let warned = false;

const consoleDisabledError = (...args: any[]) => {
  const message = args.map((arg) => arg?.toString()).join(" ");
  if (!warned) {
    warned = true;
    _warn("use context.logger instead of console in test.");
  }
  _info(message);
};

console.log = consoleDisabledError;
console.info = consoleDisabledError;
console.warn = consoleDisabledError;
console.error = consoleDisabledError;

/**
 * Custom, optionally unbuffered, logger that obeys the VITE_LOG_LEVEL
 */
export class Logger {
  _performanceTests: boolean;
  _flushFunction: (() => void) | null = null;

  constructor() {
    this._performanceTests = !!env.VITE_PERFORMANCE_TESTS;
  }

  setFlushFunction(func: (() => void) | null) {
    this._flushFunction = func;
  }

  async _write(stream: NodeJS.WriteStream, consoleStream: typeof console.log, args: any[]) {
    if (this._performanceTests) {
      await new Promise<void>((resolve) => {
        stream.write(`${args.join(" ")}\n`, "utf-8", () => {
          resolve();
        });
      });
    } else {
      const messages = args.map(arg => arg?.toJSON ? JSON.stringify(arg, null, 2) : arg);
      consoleStream(...messages);
    }
  }

  async debug(...args: any[]) {
    if (env.VITE_LOG_LEVEL === "debug" || this._performanceTests) {
      await this._write(process.stdout, _info, args);
    }
  }

  async info(...args: any[]) {
    await this._write(process.stdout, _info, args);
  }

  async warn(...args: any[]) {
    await this._write(process.stderr, _warn, args);
  }

  /**
   * Write a full HTML preview of the test DOM into data/.vitest-preview.
   * Used for local debugging of failing tests and layout issues.
   */
  async preview() {
    const CACHE_FOLDER = path.join(process.cwd(), 'data', '.vitest-preview');
    // Minimal helper to ensure the folder exists and dump the current HTML
    function createCacheFolderIfNeeded() {
      if (!fs.existsSync(CACHE_FOLDER)) {
        fs.mkdirSync(CACHE_FOLDER, {
          recursive: true,
        });
      }
    }

    function debug() {
      createCacheFolderIfNeeded();
      fs.writeFileSync(
        path.join(CACHE_FOLDER, 'index.html'),
        document.documentElement.outerHTML,
      );
    }
    // End of preview writer
    this._flushFunction?.();
    if (debugEnabled) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    debug();
  }
}
