import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJECT_LIMIT_BYTES = 32 * 1024;
let failed = false;

function fail(message) {
  console.error(`agent-instructions: ${message}`);
  failed = true;
}

function gitOutput(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    fail('requires an accessible Git repository');
    return '';
  }
}

const ROOT = gitOutput(['rev-parse', '--show-toplevel'], process.cwd()).trim();

function repositoryFiles() {
  if (!ROOT) return [];
  const deleted = new Set(
    gitOutput(['ls-files', '--deleted', '-z'], ROOT).split('\0').filter(Boolean),
  );
  return gitOutput(
    [
      '-c',
      'core.excludesFile=/dev/null',
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
    ],
    ROOT,
  )
    .split('\0')
    .filter((file) => file && !deleted.has(file));
}

const contentsByFile = new Map();

function readRepositoryFile(file) {
  if (contentsByFile.has(file)) return contentsByFile.get(file);
  try {
    const contents = readFileSync(path.join(ROOT, file));
    contentsByFile.set(file, contents);
    return contents;
  } catch {
    fail(`${file} is selected by Git but cannot be read from the working tree`);
    contentsByFile.set(file, null);
    return null;
  }
}

function activeMarkdownLines(buffer) {
  const lines = buffer.toString('utf8').split(/\r?\n/);
  const active = [];
  let fence = null;

  for (const line of lines) {
    if (fence !== null) {
      const closing = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/u)?.[1];
      if (closing?.[0] === fence.marker && closing.length >= fence.length) fence = null;
      continue;
    }

    if (/^(?: {4}|\t)/u.test(line)) continue;

    const opening = line.match(/^\s{0,3}(`{3,}|~{3,})/u)?.[1];
    if (opening) {
      fence = { marker: opening[0], length: opening.length };
      continue;
    }
    active.push(line);
  }

  return active;
}

const files = new Set(repositoryFiles());
const instructionFiles = [...files].filter((file) => {
  const name = path.posix.basename(file);
  return name === 'AGENTS.md' || name === 'AGENTS.override.md';
});

if (!files.has('AGENTS.md')) {
  fail('the repository root must contain AGENTS.md');
} else {
  const agents = readRepositoryFile('AGENTS.md');
  if (agents !== null && agents.toString('utf8').trim() === '') {
    fail('the repository root AGENTS.md must not be empty');
  }
}

if (ROOT && existsSync(path.join(ROOT, 'AGENTS.override.md'))) {
  fail('root AGENTS.override.md shadows the shared AGENTS.md entry point');
}

if (!files.has('CLAUDE.md')) {
  fail('CLAUDE.md is missing');
} else {
  const claude = readRepositoryFile('CLAUDE.md');
  if (claude !== null) {
    const activeLines = activeMarkdownLines(claude);
    const meaningfulLines = activeLines.filter((line) => line.trim() !== '');
    const imports = activeLines.filter((line) => line.trim() === '@AGENTS.md');

    if (meaningfulLines[0]?.trim() !== '@AGENTS.md') {
      fail('CLAUDE.md must import AGENTS.md before Claude-specific rules');
    }
    if (imports.length !== 1) {
      fail(`CLAUDE.md must import AGENTS.md exactly once (found ${imports.length})`);
    }
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

  let bytes = 0;
  for (const [index, file] of chain.entries()) {
    const contents = readRepositoryFile(file);
    if (contents !== null) bytes += (index === 0 ? 0 : 2) + contents.byteLength;
  }

  if (bytes > PROJECT_LIMIT_BYTES) {
    fail(
      `${directory} instruction chain is ${bytes} bytes; Codex's documented ` +
        `default limit is ${PROJECT_LIMIT_BYTES} bytes (${chain.join(', ')})`,
    );
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.info(
    `agent-instructions: OK (${instructionFiles.length} repository instruction ` +
      `file(s), ${PROJECT_LIMIT_BYTES}-byte Codex limit)`,
  );
}
