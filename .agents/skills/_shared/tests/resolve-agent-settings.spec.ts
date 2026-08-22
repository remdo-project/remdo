import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  cleanupTempDirs,
  makeDir,
  makeNonRepoDir,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from '../test-support/git-scratch';

const script = path.join(__dirname, '../tools/resolve-agent-settings.sh');
const defaultDocument = {
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

function emptyHome(): string {
  return makeDir('agent-settings-home-');
}

function homeWithOverlay(content: string): string {
  const home = emptyHome();
  writeFile(home, '.remdo/agent.yaml', content);
  return home;
}

function repoWithSettings(content = defaultYaml): string {
  const { work } = makeScratchWithOrigin({ '.agents/settings.yaml': content });
  return work;
}

function run(cwd: string, home: string, args: string[] = []) {
  return runScript(script, cwd, args, undefined, { HOME: home });
}

afterEach(cleanupTempDirs);

describe('resolve-agent-settings.sh', () => {
  it('emits committed defaults when no overlay exists', () => {
    const result = run(repoWithSettings(), emptyHome());

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(parse(result.stdout)).toEqual(defaultDocument);
  });

  it('resolves the repository committed file from this worktree', () => {
    const result = run(process.cwd(), emptyHome());

    expect(result.status).toBe(0);
    expect(parse(result.stdout)).toEqual(defaultDocument);
  });

  it('replaces the reviewers list from the overlay', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change:\n  reviewers: [codex]\n'),
    );

    expect(result.status).toBe(0);
    expect(parse(result.stdout)).toEqual({
      'remdo-verify-change': {
        reviewers: ['codex'],
        providers: defaultDocument['remdo-verify-change'].providers,
      },
    });
  });

  it('deep-merges provider scalars from the overlay', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay(
        'remdo-verify-change:\n  providers:\n    codex:\n      effort: high\n',
      ),
    );

    expect(result.status).toBe(0);
    expect(parse(result.stdout)['remdo-verify-change'].providers.codex).toEqual({
      model: 'gpt-5.6-terra',
      effort: 'high',
    });
  });

  it('refuses an unknown overlay path', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change:\n  providers:\n    grok:\n      model: grok-4.6\n      effort: medium\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown setting remdo-verify-change.providers.grok");
  });

  it('refuses an unknown overlay field', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change:\n  timeout: 1\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unknown setting remdo-verify-change.timeout');
  });

  it('refuses an unknown overlay skill', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-simplify: {}\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unknown setting remdo-simplify');
  });

  it('refuses a type mismatch at an overlay path', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change:\n  reviewers:\n    codex: true\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('type mismatch at remdo-verify-change.reviewers');
  });

  it('refuses an empty reviewers list', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change:\n  reviewers: []\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('reviewers');
  });

  it('refuses a duplicate reviewer id', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change:\n  reviewers: [codex, codex]\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("duplicate reviewer 'codex'");
  });

  it('refuses a reviewer that is not a known provider', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change:\n  reviewers: [grok]\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("reviewer 'grok' is not a known provider");
  });

  it('refuses invalid overlay YAML', () => {
    const result = run(
      repoWithSettings(),
      homeWithOverlay('remdo-verify-change: [\n'),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('overlay is not valid YAML');
  });

  it('refuses an empty overlay file', () => {
    const result = run(repoWithSettings(), homeWithOverlay('\n'));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('overlay is not a mapping');
  });

  it('refuses missing committed settings', () => {
    const { work } = makeScratchWithOrigin({ 'README.md': '# hi\n' });
    const result = run(work, emptyHome());

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('committed settings are missing');
  });

  it('refuses unexpected arguments', () => {
    const result = run(repoWithSettings(), emptyHome(), ['extra']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected arguments');
  });

  it('fails loud outside a git repository', () => {
    const result = run(makeNonRepoDir(), emptyHome());

    expect(result.status).not.toBe(0);
    expect(result.stderr).toBe('agent-settings: requires an accessible Git repository\n');
  });
});
