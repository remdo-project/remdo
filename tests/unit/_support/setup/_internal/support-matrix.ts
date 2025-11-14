import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

interface RemdoSupport {
  tools?: Record<string, string>;
}

function readPackageJson() {
  const pkgPath = resolve(process.cwd(), 'package.json');
  const raw = readFileSync(pkgPath, 'utf-8');
  return JSON.parse(raw) as { engines?: { node?: string }; remdoSupport?: RemdoSupport };
}

function isNodeVersionSupported(range: string | undefined): boolean {
  if (!range) {
    return true;
  }

  const minimumMatch = range.match(/>=\s*(\d+)/);
  if (!minimumMatch) {
    return true;
  }

  const minimumMajor = Number(minimumMatch[1]);
  const currentMajor = Number(process.versions.node.split('.')[0] ?? 0);
  if (Number.isNaN(minimumMajor) || Number.isNaN(currentMajor)) {
    return true;
  }

  return currentMajor >= minimumMajor;
}

function ensureSelectionExtend() {
  const selection = window.getSelection();
  if (!selection || typeof selection.extend !== 'function') {
    throw new Error('selection.extend must exist; tests require a modern DOM implementation');
  }
}

(() => {
  const pkg = readPackageJson();
  if (!isNodeVersionSupported(pkg.engines?.node)) {
    throw new Error(`Node ${pkg.engines?.node} required for tests (current ${process.version})`);
  }

  ensureSelectionExtend();
})();
