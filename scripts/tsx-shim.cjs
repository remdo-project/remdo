#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");

async function main() {
  const [entry, ...args] = process.argv.slice(2);
  if (!entry) {
    console.error("Usage: tsx <file> [args...]");
    process.exitCode = 1;
    return;
  }

  const entryPath = path.resolve(entry);
  const source = fs.readFileSync(entryPath, "utf8");

  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    isolatedModules: true,
  };

  const transpiled = ts.transpileModule(source, {
    compilerOptions,
    fileName: entryPath,
  });

  const projectRoot = path.resolve(__dirname, "..");
  const cacheDir = path.join(projectRoot, ".tsx-shim");
  fs.mkdirSync(cacheDir, { recursive: true });
  const outFile = path.join(
    cacheDir,
    `${path.basename(entryPath).replace(/\.(tsx|ts|jsx|js)$/i, "")}-${process.pid}-${Date.now()}.mjs`,
  );
  fs.writeFileSync(outFile, transpiled.outputText, "utf8");

  const originalArgv = process.argv.slice();
  process.argv = [originalArgv[0], entryPath, ...args];

  try {
    await import(pathToFileURL(outFile).href);
  } finally {
    process.argv = originalArgv;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
