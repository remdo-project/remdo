// The remdo-docs-align skill's private gate: run ONLY the RemDo doc-invariant
// rules (temporal wording, References shape) over docs/ prose. Deliberately
// bypasses markdownlint-cli2 config discovery (the repo config is the product
// gate and would shadow this one); style/link linting stays `pnpm run lint:md`.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { lint } from 'markdownlint-cli2/markdownlint/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const referencesShape = (await import(path.join(here, 'lint-rules/references-shape.mjs'))).default;
const temporalStatus = (await import(path.join(here, 'lint-rules/temporal-status.mjs'))).default;

const files = fs.globSync('docs/**/*.md', { cwd: process.cwd() });
if (files.length === 0) {
  console.error('run-doc-rules: no docs/**/*.md found — run from the repo root');
  process.exit(1);
}
const results = await lint({
  files,
  customRules: [temporalStatus, referencesShape],
  config: { default: false, 'remdo-temporal-status': true, 'remdo-references-shape': true },
});
let count = 0;
for (const [file, errors] of Object.entries(results)) {
  for (const e of errors ?? []) {
    count += 1;
    console.error(`${file}:${e.lineNumber} ${e.ruleNames.join('/')} ${e.errorDetail ?? e.ruleDescription}`);
  }
}
console.error(`doc-rules: ${count} error(s) across ${files.length} file(s)`);
process.exit(count === 0 ? 0 : 1);
