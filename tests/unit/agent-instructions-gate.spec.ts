import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const checker = path.resolve('tools/check-agent-instructions.mjs');
const repositories: string[] = [];

function repository() {
  const directory = mkdtempSync(path.join(tmpdir(), 'remdo-agent-instructions-'));
  repositories.push(directory);
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  return directory;
}

function write(directory: string, file: string, contents: string) {
  const target = path.join(directory, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function track(directory: string) {
  execFileSync('git', ['add', '--force', '.'], { cwd: directory });
}

function run(directory: string) {
  return spawnSync(process.execPath, [checker], { cwd: directory, encoding: 'utf8' });
}

afterEach(() => {
  for (const directory of repositories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('agent instruction gate', () => {
  it('accepts one active Claude import when a fenced example repeats it', () => {
    const directory = repository();
    write(directory, 'AGENTS.md', '# Shared\n');
    write(directory, 'CLAUDE.md', '@AGENTS.md\n\n```md\n@AGENTS.md\n```\n');
    write(directory, 'feature/AGENTS.md', '# Feature\n');
    track(directory);

    const result = run(directory);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('agent-instructions: OK');
  });

  it('diagnoses a tracked instruction file missing from the working tree', () => {
    const directory = repository();
    write(directory, 'AGENTS.md', '# Shared\n');
    write(directory, 'CLAUDE.md', '@AGENTS.md\n');
    write(directory, 'feature/AGENTS.md', '# Feature\n');
    track(directory);
    rmSync(path.join(directory, 'feature/AGENTS.md'));

    const result = run(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'feature/AGENTS.md is selected by Git but missing from the working tree',
    );
  });

  it('rejects a root override that shadows the shared entry point', () => {
    const directory = repository();
    write(directory, 'AGENTS.md', '# Shared\n');
    write(directory, 'AGENTS.override.md', '# Override\n');
    write(directory, 'CLAUDE.md', '@AGENTS.md\n');
    track(directory);

    const result = run(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('root AGENTS.override.md shadows');
  });

  it('rejects an oversized nested instruction chain', () => {
    const directory = repository();
    write(directory, 'AGENTS.md', 'a'.repeat(20_000));
    write(directory, 'CLAUDE.md', '@AGENTS.md\n');
    write(directory, 'feature/AGENTS.md', 'b'.repeat(20_000));
    track(directory);

    const result = run(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Codex\'s documented default limit is 32768 bytes');
  });
});
