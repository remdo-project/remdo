#!/usr/bin/env node
import chokidar from "chokidar";
import { spawn } from "node:child_process";
import process from "node:process";

// Wraps Playwright in a chokidar watcher so we can re-run browser tests without relying on PWTEST_WATCH.
const cliArgs = process.argv.slice(2);
const watchTargets = [
  "src",
  "tests",
  "config",
  "playwright.config.ts",
  "vite.config.mts",
  "package.json"
];
const ignored = [
  "node_modules/**",
  "data/**",
  "tests/**/report/**",
  "tests/**/screenshots/**",
  "tests/**/videos/**"
];

let currentRun = null;
let rerunRequested = false;

const startRun = () => {
  const commandArgs = ["playwright", "test", ...cliArgs];
  const displayCommand = ["npx", ...commandArgs];
  console.warn(`[watch] Starting tests.`);
  console.warn(`[watch] Running npx ${displayCommand.join(" ")}`);

  currentRun = spawn("npx", commandArgs, {
    env: process.env,
    stdio: "inherit"
  });

  currentRun.on("exit", (code, signal) => {
    if (signal) {
      console.warn(`[watch] Test run finished (signal ${signal}).`);
    } else {
      console.warn(`[watch] Test run finished (exit code ${code ?? "unknown"}).`);
    }
    currentRun = null;

    if (rerunRequested) {
      rerunRequested = false;
      startRun();
    }
  });

  currentRun.on("error", (error) => {
    console.error(`[watch] Test error occurred: ${error.message}`);
    currentRun = null;
  });
};

const queueRun = () => {
  if (currentRun) {
    rerunRequested = true;
    console.warn(`[watch] RERUN requested.`);
    return;
  }

  startRun();
};

const watcher = chokidar.watch(watchTargets, {
  ignored,
  ignoreInitial: true
});

watcher.on("all", (event, filePath) => {
  console.warn(`[watch] Detected change: ${event} ${filePath}`);
  queueRun();
});

watcher.on("error", (error) => {
  console.error(`[watch] Watcher error: ${error}`);
});

queueRun();

const cleanup = () => {
  console.warn("\n[watch] Shutting down.");
  watcher.close().finally(() => {
    if (currentRun) {
      currentRun.once("exit", () => process.exit(0));
      currentRun.kill("SIGINT");
      return;
    }

    process.exit(0);
  });
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
