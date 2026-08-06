import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJECT_LIMIT_BYTES = 32 * 1024;
const ROOT = process.cwd();

function fail(message) {
  console.error(`agent-instructions: ${message}`);
  process.exitCode = 1;
}

function repositoryFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: ROOT, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
}

const files = new Set(repositoryFiles());
const instructionFiles = [...files].filter((file) => {
  const name = path.posix.basename(file);
  return name === 'AGENTS.md' || name === 'AGENTS.override.md';
});

if (!files.has('AGENTS.md')) {
  fail('the repository root must contain AGENTS.md');
} else if (readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8').trim() === '') {
  fail('the repository root AGENTS.md must not be empty');
}

if (files.has('AGENTS.override.md')) {
  fail('root AGENTS.override.md shadows the shared AGENTS.md entry point');
}

if (!files.has('CLAUDE.md')) {
  fail('CLAUDE.md is missing');
} else {
  const claudeLines = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').split(/\r?\n/);
  const meaningfulLines = claudeLines.filter((line) => line.trim() !== '');
  const imports = claudeLines.filter((line) => line.trim() === '@AGENTS.md');

  if (meaningfulLines[0]?.trim() !== '@AGENTS.md') {
    fail('CLAUDE.md must import AGENTS.md before Claude-specific rules');
  }
  if (imports.length !== 1) {
    fail(`CLAUDE.md must import AGENTS.md exactly once (found ${imports.length})`);
  }
}

const candidateDirectories = new Set(['.']);
for (const file of instructionFiles) {
  candidateDirectories.add(path.posix.dirname(file));
}

for (const directory of [...candidateDirectories].sort()) {
  const segments = directory === '.' ? [] : directory.split('/');
  const ancestors = ['.'];
  for (let index = 1; index <= segments.length; index += 1) {
    ancestors.push(segments.slice(0, index).join('/'));
  }

  const chain = [];
  for (const ancestor of ancestors) {
    const prefix = ancestor === '.' ? '' : `${ancestor}/`;
    const override = `${prefix}AGENTS.override.md`;
    const shared = `${prefix}AGENTS.md`;
    const selected = files.has(override) ? override : files.has(shared) ? shared : null;
    if (selected) chain.push(selected);
  }

  const bytes = chain.reduce((total, file, index) => {
    const separator = index === 0 ? 0 : 2;
    return total + separator + readFileSync(path.join(ROOT, file)).byteLength;
  }, 0);

  if (bytes > PROJECT_LIMIT_BYTES) {
    fail(
      `${directory} instruction chain is ${bytes} bytes; Codex's documented ` +
        `default limit is ${PROJECT_LIMIT_BYTES} bytes (${chain.join(', ')})`,
    );
  }
}

if (process.exitCode === undefined) {
  console.info(
    `agent-instructions: OK (${instructionFiles.length} repository instruction ` +
      `file(s), ${PROJECT_LIMIT_BYTES}-byte Codex limit)`,
  );
}
