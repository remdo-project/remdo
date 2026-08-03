import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const todoListCommand = (JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
}).scripts['todo:list']!;

let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs = [];
});

function writeFile(root: string, file: string, content: string): void {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function createTrackedRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remdo-todo-list-'));
  tempDirs.push(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root });

  for (const [file, content] of Object.entries(files)) {
    writeFile(root, file, content);
  }
  execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

function runTodoList(root: string) {
  return spawnSync('sh', ['-c', todoListCommand], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('todo:list', () => {
  it('lists bounded candidates while excluding documentation, patches, and untracked files', () => {
    const bareTodo = ['//TO', 'DO repair'].join('');
    const scopedTodo = ['# TO', 'DO(deps): upgrade'].join('');
    const fixme = ['/* FIX', 'ME: replace */'].join('');
    const blockTodo = ['TO', 'DO: block cleanup'].join('');
    const textTodo = ['TO', 'DO refine estimates'].join('');
    const embeddedTodo = ['NOTTO', 'DO later'].join('');
    const root = createTrackedRepo({
      'README.md': `${bareTodo}\n`,
      'config.yml': `${scopedTodo}\n`,
      'docs/case.json': `{"message":"${bareTodo}"}\n`,
      'package.json': JSON.stringify({ scripts: { 'todo:list': todoListCommand } }),
      'patches/vendor.patch': `+${bareTodo}\n`,
      'src/example.ts': [
        bareTodo,
        fixme,
        '/*',
        `  ${blockTodo}`,
        '*/',
        `const label = '${textTodo}';`,
        '// TODOUBLE later',
        `// ${embeddedTodo}`,
        '',
      ].join('\n'),
    });
    writeFile(root, 'src/untracked.ts', `${scopedTodo}\n`);

    const result = runTodoList(root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toEqual([
      `config.yml:1:${scopedTodo}`,
      `src/example.ts:1:${bareTodo}`,
      `src/example.ts:2:${fixme}`,
      `src/example.ts:4:  ${blockTodo}`,
      `src/example.ts:6:const label = '${textTodo}';`,
    ]);
  });

  it('succeeds with an empty listing', () => {
    const root = createTrackedRepo({
      'src/clean.ts': 'export const clean = true;\n',
    });

    const result = runTodoList(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
