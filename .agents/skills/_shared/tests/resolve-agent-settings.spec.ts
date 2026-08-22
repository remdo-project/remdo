import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  makeDir,
  writeFile,
} from '../test-support/git-scratch';
import { resolveAgentSettings } from '../tools/resolve-agent-settings';

const fixture = `skill:
  items:
    - a
    - b
  opts:
    x: 1
    y: 2
`;

function rootWith(content: string): string {
  const root = makeDir('agent-settings-root-');
  writeFile(root, '.agents/settings.yaml', content);
  return root;
}

function emptyHome(): string {
  return makeDir('agent-settings-home-');
}

afterEach(cleanupTempDirs);

describe('resolveAgentSettings', () => {
  it('returns committed defaults when no overlay exists', () => {
    expect(resolveAgentSettings(rootWith(fixture), emptyHome())).toEqual({
      skill: { items: ['a', 'b'], opts: { x: 1, y: 2 } },
    });
  });

  it('resolves this repository\'s committed file', () => {
    expect(resolveAgentSettings(process.cwd(), emptyHome())).toMatchObject({
      'remdo-verify-change': { reviewers: ['codex', 'claude'] },
    });
  });

  it('replaces lists, deep-merges mappings, and keeps new overlay keys', () => {
    const home = emptyHome();
    writeFile(
      home,
      '.remdo/agent.yaml',
      `skill:
  items: [a]
  opts:
    y: 9
    z: 3
`,
    );

    expect(resolveAgentSettings(rootWith(fixture), home)).toEqual({
      skill: { items: ['a'], opts: { x: 1, y: 9, z: 3 } },
    });
  });
});
