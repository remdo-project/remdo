import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTempDirs,
  makeDir,
  writeFile,
} from '../test-support/git-scratch';
import {
  mergeSettings,
  resolveAgentSettings,
} from '../tools/resolve-agent-settings';

const defaults = {
  'remdo-verify-change': {
    reviewers: ['codex', 'claude'],
    providers: {
      codex: { model: 'gpt-5.6-terra', effort: 'medium' },
      claude: { model: 'opus', effort: 'medium' },
    },
  },
};

const defaultYaml = `remdo-verify-change:
  reviewers:
    - codex
    - claude
  providers:
    codex:
      model: gpt-5.6-terra
      effort: medium
    claude:
      model: opus
      effort: medium
`;

function rootWithSettings(content = defaultYaml): string {
  const root = makeDir('agent-settings-root-');
  writeFile(root, '.agents/settings.yaml', content);
  return root;
}

afterEach(cleanupTempDirs);

describe('resolveAgentSettings', () => {
  it('returns committed defaults when no overlay exists', () => {
    expect(resolveAgentSettings(rootWithSettings(), makeDir('agent-settings-home-'))).toEqual(
      defaults,
    );
  });

  it('resolves this repository\'s committed file', () => {
    expect(resolveAgentSettings(process.cwd(), makeDir('agent-settings-home-'))).toEqual(
      defaults,
    );
  });

  it('replaces lists and deep-merges mappings from the overlay', () => {
    const home = makeDir('agent-settings-home-');
    writeFile(
      home,
      '.remdo/agent.yaml',
      `remdo-verify-change:
  reviewers: [codex]
  providers:
    codex:
      effort: high
`,
    );

    expect(resolveAgentSettings(rootWithSettings(), home)).toEqual({
      'remdo-verify-change': {
        reviewers: ['codex'],
        providers: {
          codex: { model: 'gpt-5.6-terra', effort: 'high' },
          claude: { model: 'opus', effort: 'medium' },
        },
      },
    });
  });

  it('keeps overlay keys that are not in the committed file', () => {
    expect(mergeSettings(
      { 'remdo-verify-change': { reviewers: ['codex'] } },
      { 'remdo-verify-change': { providers: { grok: { model: 'grok-4.6' } } } },
    )).toEqual({
      'remdo-verify-change': {
        reviewers: ['codex'],
        providers: { grok: { model: 'grok-4.6' } },
      },
    });
  });
});
